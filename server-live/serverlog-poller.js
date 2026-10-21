#!/usr/bin/env node
/* IFWL Server Live - log poller.
 *
 * Reads the ACC server.log (FTP, HTTP, or a local file), keeps only the connection-health picture,
 * and pushes a SANITISED snapshot (no IP addresses, no full platform IDs) to rtGate for the staff view.
 *
 * No npm packages needed (own tiny FTP client), so a workflow can just run:  node serverlog-poller.js
 *
 * Settings (environment variables):
 *   LOG_SOURCE        ftp | http | file                    (default ftp)
 *   FTP_HOST FTP_PORT(21) FTP_USER FTP_PASS FTP_PATH       (ftp; path is the server.log file)
 *   LOG_URL           (http: URL that serves the log, must support Range) + LOG_HTTP_AUTH (optional "Authorization" header value)
 *   LOG_FILE          (file: local path - for testing)
 *   INGEST_URL        rtGate URL, e.g. https://.../rtGate      INGEST_KEY  the key shown on the Server Live page (owner)
 *   SERVER_ID         label for this server (default "main")
 *   RUN_SECONDS       how long this run lasts (default 3300 = 55 min)   POLL_SECONDS (default 5)   HEARTBEAT_SECONDS (default 15)
 *   MAX_READ_MB       if the log is bigger than this on first read, only the last N MB is parsed (default 24)
 *   DRY_RUN=1         parse and print, do not post
 */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const { StringDecoder } = require('string_decoder');
const S = require(fs.existsSync(path.join(__dirname, 'ifwl-serverlog.js')) ? './ifwl-serverlog.js' : '../ifwl-serverlog.js');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const num = (k, d) => { const n = Number(env(k, d)); return Number.isFinite(n) ? n : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------------- sources ---------------- */

function fileSource(p) {
  return {
    name: 'file',
    async stat() { const s = fs.statSync(p); return { size: s.size, mtimeMs: s.mtimeMs }; },
    async read(offset, length) {
      const fd = fs.openSync(p, 'r');
      try {
        const st = fs.fstatSync(fd);
        const len = Math.max(0, Math.min(length == null ? st.size - offset : length, st.size - offset));
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, offset);
        return buf;
      } finally { fs.closeSync(fd); }
    },
    async close() {}
  };
}

function httpSource(url, auth) {
  const headers = auth ? { Authorization: auth } : {};
  return {
    name: 'http',
    async stat() {
      const r = await fetch(url, { method: 'HEAD', headers });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' reading log');
      const size = Number(r.headers.get('content-length'));
      if (!Number.isFinite(size)) throw new Error('log URL did not give a Content-Length');
      const lm = Date.parse(r.headers.get('last-modified') || '');
      return { size, mtimeMs: Number.isFinite(lm) ? lm : null };
    },
    async read(offset, length) {
      const h = Object.assign({}, headers, { Range: 'bytes=' + offset + '-' + (length != null ? offset + length - 1 : '') });
      const r = await fetch(url, { headers: h });
      if (r.status !== 206 && !(r.status === 200 && offset === 0)) throw new Error('HTTP ' + r.status + ' on ranged read');
      return Buffer.from(await r.arrayBuffer());
    },
    async close() {}
  };
}

/* minimal passive-mode FTP client: login, SIZE, MDTM, REST+RETR */
class Ftp {
  constructor(o) { this.o = o; this.sock = null; this.buf = ''; this.waiters = []; this.closed = false; }
  async connect() {
    this.sock = net.createConnection({ host: this.o.host, port: this.o.port });
    this.sock.setKeepAlive(true, 15000);
    this.sock.setTimeout(30000, () => this.sock.destroy(new Error('FTP control timeout')));
    this.sock.on('data', (d) => { this.buf += d.toString('latin1'); this._drain(); });
    const fail = (e) => { this.closed = true; const w = this.waiters.splice(0); w.forEach((x) => x.reject(e)); };
    this.sock.on('error', fail);
    this.sock.on('close', () => fail(new Error('FTP connection closed')));
    await new Promise((res, rej) => { this.sock.once('connect', res); this.sock.once('error', rej); });
    let r = await this._reply();
    if (r.code !== 220) throw new Error('FTP greeting ' + r.code);
    r = await this.cmd('USER ' + this.o.user);
    if (r.code === 331) r = await this.cmd('PASS ' + this.o.pass, true);
    if (r.code !== 230) throw new Error('FTP login refused (' + r.code + ')');
    await this.cmd('TYPE I');
  }
  _drain() {
    for (;;) {
      const m = this.buf.match(/^(\d{3})([ -])[^\r\n]*\r?\n/);
      if (!m) return;
      // multi-line replies: "123-..." continues until a line starting "123 "
      if (m[2] === '-') {
        const end = this.buf.search(new RegExp('\\r?\\n' + m[1] + ' [^\\r\\n]*\\r?\\n'));
        if (end < 0) return;
        const lastNl = this.buf.indexOf('\n', end + 1);
        const text = this.buf.slice(0, lastNl + 1); this.buf = this.buf.slice(lastNl + 1);
        this._emit({ code: Number(m[1]), text });
      } else {
        this.buf = this.buf.slice(m[0].length);
        this._emit({ code: Number(m[1]), text: m[0] });
      }
    }
  }
  _emit(r) { const w = this.waiters.shift(); if (w) w.resolve(r); }
  _reply() { return new Promise((resolve, reject) => { if (this.closed) return reject(new Error('FTP connection closed')); this.waiters.push({ resolve, reject }); this._drain(); }); }
  async cmd(c, secret) { this.sock.write(c + '\r\n'); return this._reply(); }
  async size(p) { const r = await this.cmd('SIZE ' + p); if (r.code !== 213) throw new Error('SIZE failed (' + r.code + ') - check FTP_PATH'); return parseInt(r.text.slice(4), 10); }
  async mtime(p) {
    const r = await this.cmd('MDTM ' + p); if (r.code !== 213) return null;
    const m = r.text.slice(4).trim().match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/); if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  async retr(p, offset, length) {
    const pr = await this.cmd('PASV');
    const m = pr.text.match(/(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/);
    if (pr.code !== 227 || !m) throw new Error('PASV failed (' + pr.code + ')');
    // many hosts (NAT) advertise a private address in PASV; always connect back to the control host
    const port = Number(m[5]) * 256 + Number(m[6]);
    const data = net.createConnection({ host: this.o.host, port });
    data.setTimeout(30000, () => data.destroy(new Error('FTP data timeout')));
    const chunks = []; let got = 0;
    const done = new Promise((res, rej) => {
      data.on('data', (d) => {
        chunks.push(d); got += d.length;
        if (length != null && got >= length) { data.destroy(); res(); }
      });
      data.on('end', res); data.on('close', res); data.on('error', rej);
    });
    await new Promise((res, rej) => { data.once('connect', res); data.once('error', rej); });
    if (offset > 0) { const rr = await this.cmd('REST ' + offset); if (rr.code !== 350) { data.destroy(); throw new Error('server does not support resuming (REST)'); } }
    const rt = await this.cmd('RETR ' + p);
    if (rt.code !== 150 && rt.code !== 125) { data.destroy(); throw new Error('RETR failed (' + rt.code + ')'); }
    await done;
    if (length == null) await this._reply().catch(() => {});                   // 226 transfer complete
    else { data.destroy(); await this._reply().catch(() => {}); }               // 426/226 after we cut it short
    let buf = Buffer.concat(chunks);
    if (length != null && buf.length > length) buf = buf.subarray(0, length);
    return buf;
  }
  /* names inside a directory, or null if it is not a directory we can enter */
  async list(dir) {
    const cw = await this.cmd('CWD ' + dir);
    if (cw.code !== 250) return null;
    try {
      const pr = await this.cmd('PASV');
      const m = pr.text.match(/(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/);
      if (pr.code !== 227 || !m) return null;
      const data = net.createConnection({ host: this.o.host, port: Number(m[5]) * 256 + Number(m[6]) });
      data.setTimeout(20000, () => data.destroy(new Error('FTP data timeout')));
      const chunks = [];
      const done = new Promise((res, rej) => { data.on('data', (d) => chunks.push(d)); data.on('end', res); data.on('close', res); data.on('error', rej); });
      await new Promise((res, rej) => { data.once('connect', res); data.once('error', rej); });
      const r = await this.cmd('NLST');
      if (r.code !== 150 && r.code !== 125) { data.destroy(); return []; }
      await done;
      await this._reply().catch(() => {});
      return Buffer.concat(chunks).toString('latin1').split(/\r?\n/).map((x) => x.trim().replace(/\/+$/, '').split('/').pop()).filter(Boolean);
    } finally { await this.cmd('CWD /').catch(() => {}); }
  }
  close() { try { this.sock && this.sock.destroy(); } catch (e) { /* ignore */ } this.closed = true; }
}

/* Servers that use the same FTP login share ONE connection (commands take turns), so seven servers do not mean seven logins. */
const ftpPool = new Map();
function ftpSource(o) {
  const key = [o.host, o.port, o.user, o.pass].join('|');
  let e = ftpPool.get(key);
  if (!e) { e = { c: null, lock: Promise.resolve() }; ftpPool.set(key, e); }
  const ensure = async () => { if (e.c && !e.c.closed) return e.c; e.c = new Ftp(o); try { await e.c.connect(); } catch (err) { e.c.close(); e.c = null; throw err; } return e.c; };
  const wrap = (fn) => {
    const run = e.lock.then(async () => { try { return await fn(await ensure()); } catch (err) { if (e.c) { e.c.close(); e.c = null; } throw err; } });
    e.lock = run.catch(() => {});
    return run;
  };
  return {
    name: 'ftp',
    stat: () => wrap(async (f) => ({ size: await f.size(o.path), mtimeMs: await f.mtime(o.path).catch(() => null) })),
    read: (offset, length) => wrap((f) => f.retr(o.path, offset, length)),
    /* The setting may be the log file itself, or the folder the results land in. In the folder case look for server.log there,
       in a log / logs folder inside it, and next to it. Remembers what it found. */
    resolve: () => wrap(async (f) => {
      if (o.found) return o.path;
      const given = String(o.path || '').replace(/\/+$/, '') || '/';
      if (/\.(log|txt)$/i.test(given)) { o.found = true; return o.path; }
      const parent = given.replace(/\/[^/]*$/, '') || '/';
      const grand = parent.replace(/\/[^/]*$/, '') || '/';
      const j = (a, b) => (a === '/' ? '' : a) + '/' + b;
      const dirs = [given, j(given, 'log'), j(given, 'logs'), j(given, 'Log'), j(given, 'Logs'), parent, j(parent, 'log'), j(parent, 'logs'), j(parent, 'Log'), j(parent, 'Logs'), j(grand, 'log'), j(grand, 'logs')];
      const seen = new Set(); const tried = [];
      for (const d of dirs) {
        if (seen.has(d)) continue; seen.add(d);
        const names = await f.list(d);
        tried.push(d + (names ? ' (' + names.length + ' files)' : ' (not a folder)'));
        if (!names) continue;
        const hit = names.find((n) => /^server\.log$/i.test(n)) || names.find((n) => /server.*\.log$/i.test(n)) || null;
        if (hit) { o.path = j(d, hit); o.found = true; return o.path; }
      }
      throw new Error('could not find server.log. Looked in: ' + tried.join(', '));
    }),
    path: () => o.path,
    async close() {}
  };
}
function closeFtpPool() { ftpPool.forEach((e) => { if (e.c) e.c.close(); }); ftpPool.clear(); }

function makeSource(get) {
  const kind = get('LOG_SOURCE', 'ftp').toLowerCase();
  if (kind === 'file') return fileSource(get('LOG_FILE', 'server.log'));
  if (kind === 'http') return httpSource(get('LOG_URL', ''), get('LOG_HTTP_AUTH', ''));
  if (!get('FTP_HOST', '')) throw new Error('FTP_HOST is not set');
  return ftpSource({ host: get('FTP_HOST', ''), port: Number(get('FTP_PORT', '21')) || 21, user: get('FTP_USER', 'anonymous'), pass: get('FTP_PASS', ''), path: get('FTP_PATH', 'server.log') });
}

/* ---------------- posting ---------------- */

async function post(payload) {
  const url = env('INGEST_URL', '');
  const key = env('INGEST_KEY', '');
  if (!url || !key) throw new Error('INGEST_URL / INGEST_KEY are not set');
  const sep = url.includes('?') ? '&' : '?';
  const r = await fetch(url + sep + 'serverLogIngest=1', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-IFWL-Key': key }, body: JSON.stringify(payload)
  });
  if (r.status === 401 || r.status === 403) { const e = new Error('ingest key was refused (' + r.status + ') - copy the current key from the Server Live page'); e.fatal = true; throw e; }
  if (!r.ok) throw new Error('ingest answered ' + r.status);
  return r.json().catch(() => ({}));
}

/* ---------------- main loop ---------------- */

const sleepUntil = async (ms, shouldStop) => { const end = Date.now() + ms; while (!shouldStop() && Date.now() < end) await sleep(Math.min(500, end - Date.now())); };

/* one server: tail its log, push snapshots. cfg = { id, get(name, default), ctl: { stopping } } */
async function runOne(cfg) {
  const serverId = cfg.id;
  const get = cfg.get;
  const tag = '[' + serverId + ']';
  const runMs = Number(get('RUN_SECONDS', '3300')) * 1000;
  const pollMs = Math.max(2, Number(get('POLL_SECONDS', '5'))) * 1000;
  const beatMs = Math.max(pollMs, Number(get('HEARTBEAT_SECONDS', '15')) * 1000);
  const maxRead = Number(get('MAX_READ_MB', '24')) * 1048576;
  const dry = get('DRY_RUN', '') === '1';
  const src = makeSource(get);
  const started = cfg.started || Date.now();

  let st = S.newState();
  let decoder = new StringDecoder('utf8');
  let offset = 0;
  let lastGrowthMs = 0;     // wall clock when the log last got bigger
  let lastPostMs = 0;
  let dirty = true;
  let failures = 0;
  let fatal = false;

  const snapshot = (final) => {
    const snap = S.snapshot(st, { anchor: { serverMs: st.lastTs, wallMs: lastGrowthMs || Date.now() } });
    return { server: serverId, fetchedAtMs: Date.now(), lastGrowthMs, final: !!final, source: src.name, bytes: offset, snapshot: snap };
  };

  log(tag, 'start: source=' + src.name + ' run=' + Math.round(runMs / 1000) + 's' + (dry ? ' (dry run)' : ''));

  let resolved = !src.resolve;
  while (!cfg.ctl.stopping && Date.now() - started < runMs) {
    const loopStart = Date.now();
    try {
      if (!resolved) { const found = await src.resolve(); resolved = true; log(tag, 'log file: ' + found); }
      const info = await src.stat();
      if (info.size < offset) {                       // file shrank = server restarted / log rotated
        log(tag, 'log got smaller - treating as a server restart');
        st = S.newState(); decoder = new StringDecoder('utf8'); offset = 0; dirty = true;
      }
      if (info.size > offset) {
        let from = offset;
        if (offset === 0 && info.size > maxRead) { from = info.size - maxRead; log(tag, 'big log: reading only the last ' + Math.round(maxRead / 1048576) + ' MB'); }
        const buf = await src.read(from, info.size - from);
        if (buf.length) {
          S.feed(st, decoder.write(buf));
          offset = from + buf.length;
          lastGrowthMs = info.mtimeMs && Date.now() - info.mtimeMs < 120000 ? info.mtimeMs : Date.now();
          dirty = true;
        }
      }
      if (failures) log(tag, 'reading again');
      failures = 0;
    } catch (e) {
      failures++;
      if (failures === 1 || failures % 10 === 0) log(tag, 'read problem (' + failures + '): ' + e.message);
      if (failures >= 60) { log(tag, 'too many read failures - giving up on this server'); break; }
    }

    const now = Date.now();
    if (dirty || now - lastPostMs >= beatMs) {
      const payload = snapshot(false);
      if (dry) {
        const sn = payload.snapshot;
        log(tag, 'dry: ' + sn.drivers.length + ' drivers, ' + sn.events.length + ' events, offset ' + offset);
        lastPostMs = now; dirty = false;
      } else {
        try { await post(payload); lastPostMs = now; dirty = false; }
        catch (e) { log(tag, 'post problem: ' + e.message); if (e.fatal) { fatal = true; cfg.ctl.fatal = true; cfg.ctl.stopping = true; break; } }
      }
    }
    const wait = pollMs - (Date.now() - loopStart);
    if (wait > 0) await sleepUntil(wait, () => cfg.ctl.stopping);
  }

  if (!dry && !fatal && offset > 0) { try { await post(snapshot(true)); } catch (e) { log(tag, 'final post problem: ' + e.message); } }
  await src.close();
  log(tag, 'finished');
}

/* servers.json (next to this file): [{ "id": "con-pro", "label": "Pro", "prefix": "CON_PRO", "path": "/optional/path/server.log" }, ...]
   Each server reads its settings from environment variables named <prefix>_FTP_HOST, _FTP_PORT, _FTP_USER, _FTP_PASS, _FTP_PATH
   (anything not set there falls back to the plain names, then to the shared settings). A server with no host set is skipped. */
function loadServers() {
  const file = env('SERVERS_FILE', path.join(__dirname, 'servers.json'));
  if (!fs.existsSync(file)) return null;
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(list)) throw new Error('servers.json must be a list');
  return list;
}

async function main() {
  const ctl = { stopping: false, fatal: false };
  const stop = () => { ctl.stopping = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const started = Date.now();
  const shared = (k, d) => env(k, d);
  const list = loadServers();
  const jobs = [];
  if (!list) {
    const id = env('SERVER_ID', 'main').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'main';
    jobs.push({ id, started, ctl, get: shared });
  } else {
    const only = env('ONLY_SERVERS', '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const sv of list) {
      if (only.length && only.indexOf(sv.id) < 0) continue;
      const pre = String(sv.prefix || sv.id).toUpperCase().replace(/[^A-Z0-9]/g, '_');
      const get = (name, d) => {
        const v = process.env[pre + '_' + name];
        if (v !== undefined && v !== '') return v;
        if (name === 'FTP_PATH' && sv.path) return sv.path;
        return shared(name, d);
      };
      // a server only runs if it has its own host (or shared single-server FTP_HOST was deliberately given to it)
      if (!process.env[pre + '_FTP_HOST'] && get('LOG_SOURCE', 'ftp') === 'ftp') { log('[' + sv.id + ']', 'skipped: ' + pre + '_FTP_HOST is not set'); continue; }
      jobs.push({ id: sv.id, started, ctl, get });
    }
  }
  if (!jobs.length) { console.error('nothing to run: no server has its settings filled in'); process.exit(1); }
  log('serverlog-poller: ' + jobs.length + ' server' + (jobs.length === 1 ? '' : 's') + ': ' + jobs.map((j) => j.id).join(', '));
  // start a little apart so logins do not all hit at the same instant
  const results = await Promise.all(jobs.map(async (j, i) => { await sleep(i * 600); try { await runOne(j); } catch (e) { console.error('[' + j.id + '] failed: ' + e.message); } }));
  closeFtpPool();
  log('serverlog-poller finished');
  if (ctl.fatal) process.exitCode = 2;
}

if (require.main === module) main().catch((e) => { console.error('poller failed:', e.message); process.exit(1); });
module.exports = { Ftp, ftpSource, fileSource, httpSource, runOne, main };
