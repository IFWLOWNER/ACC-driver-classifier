/* ============================================================
   IFWL SERVER LOG  -  live state from the ACC dedicated-server log (GPortal PRO / console)
   ------------------------------------------------------------
   Pure code, no network. Works in the browser (window.IFWL_ServerLog) and in Node (module.exports).
   Feed it log text (any size chunks, partial lines are carried over) and ask for a snapshot.

   What it works out
   - who is on the server (name, platform, race number, car), when they joined, rejoined, left
   - leaving: "lost" = the connection went silent before it closed (crash / internet drop),
              "left" = closed with no silence (quit). It cannot tell a game crash from a pulled cable.
   - join attempts the server refused (wrong password)
   - connection quality per driver over a rolling window: ping spikes, freezes (no data for 2 s+),
     delayed pongs. Grade good / fair / poor / bad with the reasons spelled out.
   - server-side trouble ("server running late, not enough CPU") so a lag spike that hit the whole
     server is not blamed on one driver
   - session name / phase / minutes left, so alerts can say "in Qualifying, 4 min left"
   Log timestamps are milliseconds since the server started (NOT clock time). A poller that knows
   when it fetched the file adds an anchor so the page can show real times.
   IPs and full platform IDs never leave this module (only the last 5 characters of an ID).
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IFWL_ServerLog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CFG = {
    joinGraceMs: 45000,     // loading in always looks laggy: ignore the first 45 s after a driver joins
    windowMs: 10 * 60000,   // rolling window used for the connection grade
    spikeMinMs: 120,        // ping spikes smaller than this are ignored
    severeSpikeMs: 250,
    stallSplitMs: 3000,     // "no data" lines arrive once a second; a gap longer than this ends a freeze
    stallAlertMs: 2000,     // first freeze alert
    stallBigMs: 5000,       // second, louder alert while it is still frozen
    lostSilenceMs: 3000,    // silence at close that makes it a "lost" connection rather than a quit
    serverLateWindowMs: 3000,
    sweepMs: 5000,
    eventsKeep: 300,
    keepMs: 45 * 60000      // raw spikes / freezes kept per driver
  };

  const PLATFORM = { P: 'PlayStation', M: 'Xbox', S: 'Steam' };
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  function newState() {
    return {
      v: 1, carry: '', lastTs: 0, lastSweep: 0, lines: 0, seq: 0, boots: 0,
      session: { name: '', phase: '', minLeft: null, clients: 0, cars: 0 },
      conns: {}, drivers: {}, byName: {},
      lastLocated: null, lastRequest: null,
      events: [], serverLate: [], lateTotal: 0, lastLateEvent: -1e9
    };
  }

  function addEvent(st, t, type, level, d, text, extra) {
    st.seq += 1;
    const e = { id: st.seq, t, type, level, name: d ? d.name : '', race: d ? d.race : '', text };
    if (extra) Object.keys(extra).forEach((k) => { e[k] = extra[k]; });
    e.ctx = sessionLabel(st);
    st.events.push(e);
    if (st.events.length > CFG.eventsKeep) st.events.splice(0, st.events.length - CFG.eventsKeep);
    return e;
  }

  function sessionLabel(st) {
    const s = st.session;
    if (!s.name) return '';
    const left = s.minLeft != null && /session/.test(s.phase) ? ', ' + s.minLeft + ' min left' : '';
    return s.name + left;
  }

  const secs = (ms) => (Math.round(ms / 100) / 10) + ' s';

  function driverFor(st, connId, name) {
    const c = st.conns[connId];
    if (c && c.dk && st.drivers[c.dk]) return st.drivers[c.dk];
    if (name) { const k = st.byName[clean(name).toLowerCase()]; if (k) return st.drivers[k]; }
    return null;
  }

  function newDriver(key, name, pid, t) {
    return {
      key, name, platform: PLATFORM[pid ? pid[0] : ''] || 'Unknown', pidTail: pid ? pid.slice(-5) : '',
      race: '', carId: '', carModel: '', entryListId: '', connId: null,
      status: 'joining', joinedTs: t, lastSeenTs: t, leftTs: 0, leaveKind: '', leaveSilenceMs: 0, joins: 0,
      avgPing: null, spikes: [], stalls: [], pongs: [], open: null,
      tot: { spikes: 0, severe: 0, stalls: 0, longest: 0, pongs: 0, worst: 0 },
      grade: 'good', gradePts: 0, gradeSince: t, worstGrade: 'good', reasons: [], alertGrade: 'good', alertTs: -1e9
    };
  }

  function closeStall(st, d, t) {
    if (!d.open) return;
    const o = d.open; d.open = null;
    const dur = o.max;
    if (o.counted) {
      d.stalls.push({ t0: o.t0, t1: o.last, max: dur });
      if (dur >= CFG.stallBigMs && d.status !== 'lost' && d.status !== 'left') {
        addEvent(st, t, 'recovered', 'good', d, d.name + ' came back after about ' + secs(dur) + ' with no data', { ms: dur });
      }
    }
  }

  function feed(st, text) {
    const buf = st.carry + String(text || '');
    const lines = buf.split('\n');
    st.carry = lines.pop();
    for (let i = 0; i < lines.length; i++) handleLine(st, lines[i]);
    return st;
  }

  function handleLine(st, raw) {
    const line = raw.replace(/\r$/, '');
    const m = /^(\d+): (.*)$/.exec(line);
    if (!m) return;
    const t = +m[1], msg = m[2];
    st.lines += 1;
    if (t > st.lastTs) st.lastTs = t;
    let x;

    if (msg.charCodeAt(0) === 83 && msg.indexOf('Server starting with version') === 0) { resetBoot(st); return; }
    if (msg.charCodeAt(0) === 83 && msg.indexOf('Starting server ') === 0) { st.serverName = msg.slice(15).replace(/\s+/g, ' ').trim().slice(0, 120); return; }

    // ---- lag signals -------------------------------------------------------
    if (msg.charCodeAt(0) === 76 && (x = /^Late lastUdpPaketReceived for connId (\d+): (\d+) ms \((.*)\)$/.exec(msg))) {
      const d = driverFor(st, x[1], x[3]);
      if (d) lateUdp(st, d, t, +x[2]);
    } else if (msg.charCodeAt(0) === 82 && (x = /^Received Ping spike from connectionId (\d+); (\d+) vs\. avg (\d+) ms/.exec(msg))) {
      const d = driverFor(st, x[1], '');
      if (d) {
        d.avgPing = +x[3]; d.lastSeenTs = t;
        const ms = +x[2];
        if (ms >= CFG.spikeMinMs && t - d.joinedTs >= CFG.joinGraceMs) {
          d.spikes.push({ t, ms, avg: +x[3] });
          d.tot.spikes += 1; if (ms >= CFG.severeSpikeMs) d.tot.severe += 1; if (ms > d.tot.worst) d.tot.worst = ms;
        }
      }
    } else if (msg.charCodeAt(0) === 80 && (x = /^PONG (\d+): (\d+) \((.*)\)$/.exec(msg))) {
      const d = driverFor(st, x[1], x[3]);
      if (d && t - d.joinedTs >= CFG.joinGraceMs && +x[2] >= 1500) { d.pongs.push({ t, ms: +x[2] }); d.tot.pongs += 1; }
    } else if (msg.charCodeAt(0) === 83 && (x = /^Server was running late for (\d+) step/.exec(msg))) {
      st.lateTotal += 1; st.serverLate.push(t);
      if (st.serverLate.length > 400) st.serverLate.shift();
      if (t - st.lastLateEvent > 30000) {
        st.lastLateEvent = t;
        addEvent(st, t, 'server', 'warn', null, 'The server is short of CPU power (running late). Lag at this moment is probably not the drivers’ connections.');
      }

    // ---- joins / leaves ---------------------------------------------------
    } else if ((x = /^Created connection with id (\d+)$/.exec(msg))) {
      st.conns[x[1]] = { id: +x[1], createdTs: t, dk: null, pid: '', entry: '', refused: false };
    } else if ((x = /^Located entryListId (-?\d+) for connection (\d+) (\S+)/.exec(msg))) {
      const c = st.conns[x[2]] || (st.conns[x[2]] = { id: +x[2], createdTs: t, dk: null, pid: '', entry: '', refused: false });
      c.entry = x[1]; c.pid = x[3]; st.lastLocated = x[2];
    } else if (msg === 'rejecting new connection: wrong password') {
      const c = st.conns[st.lastLocated];
      if (c) {
        c.refused = true;
        const who = PLATFORM[c.pid[0]] || 'Unknown';
        addEvent(st, t, 'refused', 'warn', null, 'Join refused: wrong password (' + who + ' ID ending ' + c.pid.slice(-5) + (c.entry === '-1' ? ', not on the entry list' : ', entry list slot ' + c.entry) + ')', { pidTail: c.pid.slice(-5), platform: who, entry: c.entry });
      }
    } else if (msg.indexOf('==ERR: Rejected driver, is not in the entry list') === 0) {
      const c = st.conns[st.lastLocated];
      if (c && !c.refused) {
        c.refused = true;
        const who = PLATFORM[(c.pid || '?')[0]] || 'Unknown';
        addEvent(st, t, 'refused', 'warn', null, 'Join refused: not on the entry list (' + who + ' ID ending ' + (c.pid || '?').slice(-5) + ')', { pidTail: (c.pid || '').slice(-5), platform: who, entry: c.entry });
      }
    } else if ((x = /^New connection request: id (\d+) (.+?) ([PMS]\d+) on car model (\d+)$/.exec(msg))) {
      const c = st.conns[x[1]] || (st.conns[x[1]] = { id: +x[1], createdTs: t, dk: null, pid: x[3], entry: '', refused: false });
      c.name = clean(x[2]); c.pid = x[3]; c.carModel = x[4]; st.lastRequest = x[1];
    } else if ((x = /^(Creating new car connection|Recognized reconnect): carId (\d+), carModel (\d+), raceNumber #(\d+)/.exec(msg))) {
      const c = st.conns[st.lastRequest];
      if (c && c.name) {
        const key = c.pid || c.name.toLowerCase();
        let d = st.drivers[key];
        const reconnect = x[1] === 'Recognized reconnect';
        if (!d) {
          d = st.drivers[key] = newDriver(key, c.name, c.pid, t);
          addEvent(st, t, 'joined', 'info', d, d.name + ' joined (#' + x[4] + ', ' + d.platform + ')');
        } else {
          const gap = d.leftTs ? t - d.leftTs : 0;
          const was = d.status;
          addEvent(st, t, 'rejoined', 'good', d, d.name + ' is back' + (was === 'lost' || was === 'left' ? ' after ' + secs(gap) : ''), { gapMs: gap });
        }
        d.name = c.name; d.race = x[4]; d.carId = x[2]; d.carModel = x[3]; d.entryListId = c.entry; d.connId = c.id;
        d.status = 'joining'; d.joinedTs = t; d.lastSeenTs = t; d.leftTs = 0; d.leaveKind = ''; d.leaveSilenceMs = 0; d.open = null; d.joins += 1;
        d.grade = 'good'; d.reasons = []; d.gradeSince = t; d.spikes = []; d.stalls = []; d.pongs = []; d.alertGrade = 'good'; d.alertTs = -1e9;
        c.dk = key; c.carId = x[2];
        st.byName[c.name.toLowerCase()] = key;
        st.lastRequest = null;
      }
    } else if ((x = /^Associated: connId (\d+), now/.exec(msg))) {
      const c = st.conns[x[1]];
      const d = c && c.dk ? st.drivers[c.dk] : null;
      if (d) { d.lastSeenTs = t; if (d.status === 'joining') d.status = 'online'; }
    } else if ((x = /^Client (\d+) closed the connection/.exec(msg))) {
      const c = st.conns[x[1]]; if (c) c.closedTs = t;
    } else if ((x = /^Removing dead connection (\d+)\s+\(last lastUdpPaketReceived (\d+)\)/.exec(msg))) {
      const c = st.conns[x[1]];
      const d = c && c.dk ? st.drivers[c.dk] : null;
      if (d && d.connId === c.id && d.status !== 'lost' && d.status !== 'left') {
        let silence = +x[2];
        if (silence > 600000) silence = 0;               // timestamp, not a duration (never received anything)
        if (d.open) silence = Math.max(silence, d.open.max);
        closeStall(st, d, t);
        const lost = silence >= CFG.lostSilenceMs;
        d.status = lost ? 'lost' : 'left'; d.leaveKind = d.status; d.leftTs = t; d.leaveSilenceMs = silence;
        addEvent(st, t, lost ? 'lost' : 'left', lost ? 'bad' : 'warn', d,
          lost ? d.name + ' lost connection (no data for ' + secs(silence) + ' before the server dropped them)' : d.name + ' left the server',
          { silenceMs: silence });
      } else if (c && !d && !c.refused) {
        addEvent(st, t, 'joinfail', 'info', null, 'A connection dropped before the driver finished joining (' + (PLATFORM[(c.pid || '?')[0]] || 'Unknown') + ' ID ending ' + (c.pid || '?').slice(-5) + ')', { pidTail: (c.pid || '').slice(-5) });
      }
    } else if ((x = /^Alive cars: (\d+)/.exec(msg))) {
      st.session.cars = +x[1];
    } else if ((x = /^(\d+) client\(s\) online/.exec(msg))) {
      st.session.clients = +x[1];

    // ---- session -------------------------------------------------------------
    } else if ((x = /^Detected sessionPhase <([^>]*)> -> <([^>]*)> \((\w+)\)/.exec(msg))) {
      const name = x[3], from = x[1], to = x[2];
      const changed = from !== to || st.session.name !== name;
      st.session.name = name; st.session.phase = to;
      if (from !== to && changed) {
        const label = { 'waiting for drivers': 'waiting for drivers', 'pre session': 'is about to start', 'session': 'is under way', 'session overtime': 'is in overtime', 'session completed': 'has finished' }[to];
        if (label) addEvent(st, t, 'session', 'info', null, name + ' ' + label);
      }
    } else if ((x = /^Updated leaderboard for (\d+) clients \((\w+)-<([^>]+)> (\d+) min\)/.exec(msg))) {
      st.session.clients = +x[1]; st.session.name = x[2]; st.session.phase = x[3]; st.session.minLeft = +x[4];
    }

    if (t - st.lastSweep >= CFG.sweepMs) sweep(st, t);
  }

  function resetBoot(st) {
    // boots = number of restarts seen after the first "Server starting" line
    const boots = st.sawBoot ? st.boots + 1 : st.boots;
    Object.assign(st, newState(), { boots, sawBoot: true });
  }

  function lateUdp(st, d, t, ms) {
    d.lastSeenTs = t;
    if (t - d.joinedTs < CFG.joinGraceMs) return;       // still loading in
    if (d.status === 'lost' || d.status === 'left') return;
    let o = d.open;
    if (o && t - o.last > CFG.stallSplitMs) { closeStall(st, d, t); o = null; }
    if (!o) {
      o = d.open = { t0: t - ms, last: t, max: ms, counted: true, alerted: false, alertedBig: false };
      d.tot.stalls += 1;
    } else { o.last = t; if (ms > o.max) o.max = ms; }
    if (ms > d.tot.longest) d.tot.longest = ms;
    if (!o.alerted && ms >= CFG.stallAlertMs) {
      o.alerted = true;
      const n = d.stalls.filter((z) => z.t1 >= t - CFG.windowMs).length + 1;
      addEvent(st, t, 'freeze', 'warn', d, d.name + ' has gone silent (no data for ' + secs(ms) + (n >= 2 ? ', freeze number ' + n + ' in 10 min' : '') + ')', { ms });
    }
    if (!o.alertedBig && ms >= CFG.stallBigMs) {
      o.alertedBig = true;
      addEvent(st, t, 'freeze', 'bad', d, d.name + ' still has no connection (' + secs(ms) + '), probably about to drop', { ms });
    }
    regrade(st, d, t, true);
  }

  function nearServerLate(st, t) {
    for (let i = st.serverLate.length - 1; i >= 0; i--) {
      const s = st.serverLate[i];
      if (s < t - CFG.serverLateWindowMs) break;
      if (Math.abs(s - t) <= CFG.serverLateWindowMs) return true;
    }
    return false;
  }

  /* connection quality over the rolling window ending at `now` */
  function quality(st, d, now) {
    const from = now - CFG.windowMs;
    let spikes = 0, severe = 0, worst = 0, stalls = 0, longest = 0, pongs = 0, ignored = 0;
    d.spikes.forEach((s) => {
      if (s.t < from) return;
      if (nearServerLate(st, s.t)) { ignored += 1; return; }
      spikes += 1; if (s.ms >= CFG.severeSpikeMs) severe += 1; if (s.ms > worst) worst = s.ms;
    });
    const stallList = d.stalls.concat(d.open ? [{ t0: d.open.t0, t1: d.open.last, max: d.open.max }] : []);
    stallList.forEach((s) => {
      if (s.t1 < from) return;
      if (nearServerLate(st, s.t1)) { ignored += 1; return; }
      stalls += 1; if (s.max > longest) longest = s.max;
    });
    d.pongs.forEach((p) => { if (p.t >= from && !nearServerLate(st, p.t)) pongs += 1; });
    let pingPts = 0;
    if (d.avgPing != null && d.avgPing >= 150) pingPts = 6; else if (d.avgPing != null && d.avgPing >= 100) pingPts = 3;
    const silent = d.open && now - d.open.last <= CFG.stallSplitMs ? Math.max(d.open.max, now - d.open.t0) : 0;
    const pts = spikes + severe * 2 + stalls * 4 + (longest >= CFG.stallBigMs ? 6 : 0) + pongs * 2 + (silent ? 10 : 0) + pingPts;
    let grade = 'good';
    if (silent >= 4000 || longest >= 6000 || stalls >= 3 || pts >= 20) grade = 'bad';
    else if (pts >= 8 || stalls >= 1 && pts >= 5) grade = 'poor';
    else if (pts >= 3) grade = 'fair';
    const reasons = [];
    if (silent) reasons.push('no data for ' + secs(silent) + ' right now');
    if (stalls) reasons.push(stalls + ' freeze' + (stalls === 1 ? '' : 's') + ' in the last 10 min (longest ' + secs(longest) + ')');
    if (spikes) reasons.push(spikes + ' ping spike' + (spikes === 1 ? '' : 's') + ' (worst ' + worst + ' ms' + (d.avgPing != null ? ', normal ' + d.avgPing + ' ms' : '') + ')');
    if (pongs) reasons.push(pongs + (pongs === 1 ? ' slow reply' : ' slow replies'));
    if (pingPts) reasons.push('high ping (' + d.avgPing + ' ms on average)');
    if (ignored && !reasons.length) reasons.push('only blips while the server itself was struggling');
    return { grade, pts, reasons, spikes, severe, worst, stalls, longest, pongs, silent };
  }

  const RANK = { good: 0, fair: 1, poor: 2, bad: 3 };

  function regrade(st, d, t, viaFreeze) {
    if (d.status === 'lost' || d.status === 'left') return;
    const q = quality(st, d, t);
    const prev = d.grade;
    d.gradePts = q.pts; d.reasons = q.reasons;
    if (q.grade === prev) return;
    d.grade = q.grade; d.gradeSince = t;
    if (RANK[q.grade] > RANK[d.worstGrade]) d.worstGrade = q.grade;
    if (RANK[q.grade] >= 2 && RANK[q.grade] > RANK[prev]) {
      // tell staff on a first problem or when it gets worse; not again for the same level within 5 minutes
      const worse = RANK[q.grade] > RANK[d.alertGrade];
      const cooled = t - d.alertTs >= 5 * 60000;
      if (worse || cooled) {
        if (!viaFreeze) {
          addEvent(st, t, 'quality', q.grade === 'bad' ? 'bad' : 'warn', d,
            d.name + (q.grade === 'bad' ? ' has a bad connection: ' : ' has a poor connection: ') + q.reasons.join('; '), { grade: q.grade });
        }
        d.alertGrade = q.grade; d.alertTs = t;
      }
    } else if (q.grade === 'good' && d.alertGrade !== 'good') {
      addEvent(st, t, 'quality', 'good', d, d.name + '\u2019s connection has settled down', { grade: 'good' });
      d.alertGrade = 'good';
    }
  }

  function sweep(st, t) {
    st.lastSweep = t;
    const cutoff = t - CFG.keepMs;
    Object.keys(st.drivers).forEach((k) => {
      const d = st.drivers[k];
      if (d.open && t - d.open.last > CFG.stallSplitMs) closeStall(st, d, t);
      d.spikes = d.spikes.filter((s) => s.t >= cutoff);
      d.stalls = d.stalls.filter((s) => s.t1 >= cutoff);
      d.pongs = d.pongs.filter((p) => p.t >= cutoff);
      regrade(st, d, t);
    });
  }

  /* what the page / API gets: no IPs, no full IDs */
  function snapshot(st, opts) {
    opts = opts || {};
    const now = st.lastTs;
    sweep(st, now);
    const list = Object.keys(st.drivers).map((k) => {
      const d = st.drivers[k];
      const q = quality(st, d, now);
      return {
        id: d.name.toLowerCase() + '#' + d.race, name: d.name, race: d.race, platform: d.platform, pidTail: d.pidTail, carId: d.carId,
        status: d.status, joinedTs: d.joinedTs, leftTs: d.leftTs, leaveKind: d.leaveKind, leaveSilenceMs: d.leaveSilenceMs, joins: d.joins,
        avgPing: d.avgPing, grade: d.status === 'lost' || d.status === 'left' ? 'good' : q.grade, pts: q.pts, reasons: q.reasons,
        win: { spikes: q.spikes, severe: q.severe, worst: q.worst, stalls: q.stalls, longest: q.longest, pongs: q.pongs, silentMs: q.silent },
        tot: d.tot, worstGrade: d.worstGrade
      };
    });
    const rank = (x) => (x.status === 'lost' ? 4.5 : x.status === 'left' ? 0 : RANK[x.grade] + (x.pts / 1000));
    list.sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
    return {
      v: 1, serverName: st.serverName || '', serverNowMs: now, anchor: opts.anchor || null,
      session: { name: st.session.name, phase: st.session.phase, minLeft: st.session.minLeft, clients: st.session.clients, cars: st.session.cars },
      drivers: list,
      events: st.events.slice(-(opts.events || CFG.eventsKeep)),
      server: { lateTotal: st.lateTotal, late10: st.serverLate.filter((s) => s >= now - CFG.windowMs).length, lastLateTs: st.serverLate.length ? st.serverLate[st.serverLate.length - 1] : 0 },
      lines: st.lines, boots: st.boots, cfg: { windowMin: CFG.windowMs / 60000, graceSec: CFG.joinGraceMs / 1000 }
    };
  }

  /* convenience: whole text in one go (used for "upload a log") */
  function parseAll(text, opts) {
    const st = newState();
    feed(st, text);
    if (st.carry) { feed(st, '\n'); }
    return snapshot(st, opts);
  }

  return { CFG, newState, feed, snapshot, parseAll, quality };
});
