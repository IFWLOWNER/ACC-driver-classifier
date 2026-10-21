/* ============================================================
   IFWL SERVER LIVE - staff view of the ACC server log (who is lagging, who dropped, who left)
   - window.IFWL_ServerLive.mount(el, opts) is self-contained so the Stewards page can embed it later:
       const ctl = IFWL_ServerLive.mount(el, { server:'main', compact:false });  ctl.start(); ... ctl.stop(); ctl.destroy();
     opts.load(server)  -> Promise<payload>   (default: rtGate ?staffServerLive=1 with the signed-in session)
     opts.api(name, body, extra) -> Promise   (default: rtGate call, used for "told them" marks and the owner key)
   - on licence pages it mounts itself into #serverLiveRoot when the "Server Live" staff view is open.
   - the data is a sanitised snapshot (no IP addresses, no full platform IDs) pushed by the log poller.
   ============================================================ */
(() => {
  if (window.IFWL_ServerLive) return;
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function rpc(action, body, extra) {
    const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' };
    const r = await fetch(FN + '?' + action + '=1&token=' + encodeURIComponent(token()) + (extra || ''), opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
    return d;
  }

  const GRADE = { good: 'Good', fair: 'Fair', poor: 'Poor', bad: 'Bad' };
  const TYPE_LABEL = { joined: 'Joined', rejoined: 'Rejoined', freeze: 'Freeze', recovered: 'Back', lost: 'Dropped', left: 'Left', joinfail: 'Join failed', refused: 'Refused', quality: 'Connection', server: 'Server', session: 'Session' };
  const FEED_GROUPS = { all: null, lag: ['freeze', 'recovered', 'quality'], people: ['joined', 'rejoined', 'lost', 'left', 'joinfail', 'refused'], server: ['server', 'session'] };
  const FEED_NAMES = { all: 'Everything', lag: 'Lag', people: 'Joins and leaves', server: 'Server and session' };
  const ROW_FILTERS = { all: 'All', problems: 'Problems', gone: 'Dropped or left', ok: 'Fine' };

  const clock = (ms) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ms)); } catch (_) { return ''; } };
  const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  function ago(ms) {
    if (ms == null || !isFinite(ms)) return '';
    const s = Math.round(ms / 1000);
    if (s < 5) return 'just now';
    if (s < 90) return s + ' s ago';
    const m = Math.round(s / 60);
    if (m < 90) return m + ' min ago';
    return Math.round(m / 60) + ' h ago';
  }

  function mount(el, opts) {
    opts = opts || {};
    const server = opts.server || 'main';
    const load = opts.load || (() => rpc('staffServerLive', null, '&server=' + encodeURIComponent(server)));
    const api = opts.api || rpc;
    const S = { data: null, err: '', notes: {}, filter: 'problems', feedFilter: 'all', seenEventId: -1, seenBoot: null, first: true, timer: 0, tick: 0, running: false, upload: null, sound: false, toasts: true, loadedAt: 0, audio: null, titleBase: '', open: {} };
    try { S.sound = localStorage.getItem('IFWL_SL_SOUND') === '1'; S.toasts = localStorage.getItem('IFWL_SL_TOASTS') !== '0'; S.filter = localStorage.getItem('IFWL_SL_FILTER') || 'problems'; } catch (_) {}

    el.classList.add('sl-root');
    el.innerHTML =
      '<div class="sl-page' + (opts.compact ? ' sl-compact' : '') + '">'
      + '<div class="sl-top"><div><h2>Server Live</h2><p class="sl-sub" data-r="session">Waiting for the first update…</p></div>'
      + '<div class="sl-tools"><span class="sl-pill" data-r="pill">…</span>'
      + '<button type="button" class="sl-btn" data-a="sound" aria-pressed="false">Sound off</button>'
      + '<button type="button" class="sl-btn" data-a="toasts" aria-pressed="true">Pop-ups on</button>'
      + '<button type="button" class="sl-btn" data-a="upload">Open a log file</button><input type="file" data-r="file" accept=".log,.txt,text/plain" hidden></div></div>'
      + '<div class="sl-banner" data-r="banner" hidden></div>'
      + '<div class="sl-tiles" data-r="tiles"></div>'
      + '<div class="sl-card"><div class="sl-cardhead"><h3>Drivers</h3><div class="sl-chips" data-r="rowfilters"></div></div><div class="sl-tablewrap" data-r="drivers"></div></div>'
      + '<div class="sl-card"><div class="sl-cardhead"><h3>What just happened</h3><div class="sl-chips" data-r="feedfilters"></div></div><div class="sl-feed" data-r="feed"></div></div>'
      + '<details class="sl-card sl-how" data-k="how"><summary>How this works and what it can and cannot tell you</summary><div class="sl-howbody">'
      + '<p>The numbers come from the game server&rsquo;s own log, so they show what the <b>server</b> saw of each driver&rsquo;s connection. A <b>freeze</b> is the server getting no data from a driver for a couple of seconds. A <b>ping spike</b> is a single slow reply. Connection is graded over the last 10 minutes: <b>Good</b>, <b>Fair</b>, <b>Poor</b> (worth a word) and <b>Bad</b> (long or repeated freezes).</p>'
      + '<p>When the server itself ran late (not enough CPU) every driver&rsquo;s numbers look worse for a moment, so blips at that moment are ignored. During the first 45 seconds after someone joins their freezes are ignored too, because loading in looks the same as lag.</p>'
      + '<p><b>Dropped</b> means the server lost the connection after a stretch of silence (timeout, power, router). <b>Left</b> means the driver closed cleanly (quit to the menu). A driver who comes straight back shows as online with a rejoin count. The log has no chat and no steward calls, and it cannot say <i>why</i> someone lagged, only that it happened.</p>'
      + '</div></details>'
      + '<div data-r="owner"></div>'
      + '<div class="sl-toasts" data-r="toasts" aria-live="polite"></div>'
      + '</div>';
    const R = {}; el.querySelectorAll('[data-r]').forEach((n) => { R[n.dataset.r] = n; });
    const how = el.querySelector('[data-k="how"]'); how.addEventListener('toggle', () => { S.open.how = how.open; });

    /* ---------- derived data ---------- */
    const view = () => (S.upload ? S.upload : S.data);
    const snap = () => { const v = view(); return v && v.snapshot; };
    function wall(t) { const s = snap(); if (!s || !s.anchor || !s.anchor.wallMs) return null; return s.anchor.wallMs - (s.anchor.serverMs - t); }
    function when(t) { const w = wall(t); return w ? clock(w) : hms(t); }
    function sinceNow(t) { const w = wall(t); const v = view(); return w && v && v.nowMs && !v.uploaded ? ago(v.nowMs - w + (Date.now() - S.loadedAt)) : ''; }

    function headsUp(d) {
      const nm = d.name;
      if (d.status === 'lost') return 'Hi ' + nm + ', the server lost your connection at ' + when(d.leftTs) + (d.leaveSilenceMs ? ' (no data for ' + Math.round(d.leaveSilenceMs / 1000) + ' s before it dropped)' : '') + '. Are you able to rejoin? If it keeps happening, please check your connection (wired if you can) or restart your router. IFWL Staff';
      if (d.status === 'left') return 'Hi ' + nm + ', we saw you leave the server at ' + when(d.leftTs) + '. Everything OK? You are welcome to rejoin if you are still racing. IFWL Staff';
      return 'Hi ' + nm + ', the server is seeing connection problems from your side: ' + (d.reasons.length ? d.reasons.join('; ') : 'repeated freezes') + '. Please check your connection before the race gets going (wired if you can, pause any downloads or streaming, restart your router if it keeps happening). Let us know if you need a hand. IFWL Staff';
    }

    /* ---------- rendering ---------- */
    function renderStatus() {
      const v = view();
      let cls = 'idle', txt = 'No data yet';
      if (S.upload) { cls = 'up'; txt = 'Uploaded log (not live)'; }
      else if (S.err && !S.data) { cls = 'bad'; txt = S.err; }
      else if (v && v.empty) { cls = 'idle'; txt = 'No feed yet'; }
      else if (v) {
        const age = (v.ageMs || 0) + (Date.now() - S.loadedAt);
        if (v.final) { cls = 'idle'; txt = 'Feed ended ' + ago(age); }
        else if (v.stale) { cls = 'bad'; txt = 'Feed stalled, last update ' + ago(age); }
        else if (v.lastGrowthMs && v.nowMs && v.nowMs - v.lastGrowthMs > 90000) { cls = 'warn'; txt = 'Server quiet for ' + ago(v.nowMs - v.lastGrowthMs).replace(' ago', ''); }
        else { cls = 'live'; txt = 'Live, updated ' + ago(age); }
        if (S.err) { cls = 'warn'; txt += ' (connection problem)'; }
      }
      R.pill.className = 'sl-pill ' + cls; R.pill.textContent = txt;
    }

    function renderBanner() {
      const v = view(); let m = '';
      if (S.upload) m = 'You are looking at a log file you opened, not the live server. Times are shown as time since the server started. <button type="button" class="sl-link" data-a="live">Back to live</button>';
      else if (!v && S.err) m = esc(S.err);
      else if (v && v.empty) m = 'Nothing has been received from the server log yet. The log feed (GitHub workflow) needs to be running during the session. The Owner can set it up under Feed setup below. You can still open a downloaded server.log with the button above.';
      else if (v && v.stale && !v.final) m = 'The feed has not updated for a while, so the table below is out of date. Check the log feed workflow is still running.';
      R.banner.hidden = !m; R.banner.innerHTML = m;
    }

    function renderTiles() {
      const s = snap(); if (!s) { R.tiles.innerHTML = ''; return; }
      const dr = s.drivers;
      const online = dr.filter((d) => d.status === 'online');
      const bad = online.filter((d) => d.grade === 'bad').length, poor = online.filter((d) => d.grade === 'poor').length;
      const gone = dr.filter((d) => d.status === 'lost' || d.status === 'left');
      const lostNow = gone.filter((d) => d.status === 'lost').length;
      const rejoined = dr.filter((d) => (d.joins || 1) > 1).length;
      const late = s.server && s.server.late10;
      const tile = (k, n, sub, cls) => '<div class="sl-tile ' + (cls || '') + '"><div class="sl-n">' + n + '</div><div class="sl-k">' + k + '</div><div class="sl-s">' + sub + '</div></div>';
      R.tiles.innerHTML =
        tile('Online', online.length, (s.session.clients != null ? s.session.clients + ' connected per server' : 'drivers in the session'), '')
        + tile('Connection trouble', bad + poor, bad ? bad + ' bad, ' + poor + ' poor' : (poor ? poor + ' poor' : 'nobody right now'), bad ? 'bad' : poor ? 'poor' : 'ok')
        + tile('Dropped or left', gone.length, gone.length ? (lostNow + ' dropped, ' + (gone.length - lostNow) + ' left') + (rejoined ? ', ' + rejoined + ' came back' : '') : (rejoined ? rejoined + ' came back after a drop' : 'nobody gone'), lostNow ? 'bad' : gone.length ? 'poor' : 'ok')
        + tile('Server', late ? 'Struggling' : 'OK', late ? late + ' slow moment' + (late === 1 ? '' : 's') + ' in 10 min (CPU)' : 'no slow moments in 10 min', late ? 'poor' : 'ok');
    }

    function rowFilter(d) {
      const f = S.filter;
      const gone = d.status === 'lost' || d.status === 'left';
      if (f === 'all') return true;
      if (f === 'gone') return gone;
      if (f === 'ok') return !gone && (d.grade === 'good' || d.grade === 'fair');
      return d.status === 'lost' || (d.status === 'online' && (d.grade === 'poor' || d.grade === 'bad')) || (d.status === 'left');
    }

    function renderFilters() {
      const s = snap(); const dr = s ? s.drivers : [];
      const count = (f) => { const keep = S.filter; S.filter = f; const n = dr.filter(rowFilter).length; S.filter = keep; return n; };
      R.rowfilters.innerHTML = Object.keys(ROW_FILTERS).map((k) => '<button type="button" class="sl-chip' + (S.filter === k ? ' on' : '') + '" data-f="' + k + '">' + ROW_FILTERS[k] + ' <b>' + count(k) + '</b></button>').join('');
      R.feedfilters.innerHTML = Object.keys(FEED_NAMES).map((k) => '<button type="button" class="sl-chip' + (S.feedFilter === k ? ' on' : '') + '" data-ff="' + k + '">' + FEED_NAMES[k] + '</button>').join('');
    }

    function chip(cls, text) { return '<span class="sl-c ' + cls + '">' + esc(text) + '</span>'; }

    function renderDrivers() {
      const s = snap(); const v = view();
      if (!s) { R.drivers.innerHTML = '<div class="sl-empty">Nothing to show yet.</div>'; return; }
      const rows = s.drivers.filter(rowFilter);
      if (!rows.length) { R.drivers.innerHTML = '<div class="sl-empty">' + (S.filter === 'problems' ? 'No connection problems right now.' : 'Nobody matches this filter.') + '</div>'; return; }
      const notes = (v && v.notes) || {};
      const body = rows.map((d) => {
        const gone = d.status === 'lost' || d.status === 'left';
        const st = d.status === 'lost' ? chip('bad', 'Dropped') : d.status === 'left' ? chip('poor', 'Left') : chip('ok', 'Online');
        const gr = gone ? chip('idle', '–') : chip(d.grade, GRADE[d.grade] || d.grade);
        const plat = d.platform ? '<span class="sl-plat">' + esc(d.platform) + '</span>' : '';
        const rj = (d.joins || 1) > 1 ? '<span class="sl-rj">came back ' + (d.joins - 1) + (d.joins - 1 === 1 ? ' time' : ' times') + '</span>' : '';
        const gtime = gone && d.leftTs ? '<div class="sl-sm">' + (d.status === 'lost' ? 'dropped ' : 'left ') + esc(when(d.leftTs)) + (sinceNow(d.leftTs) ? ' (' + esc(sinceNow(d.leftTs)) + ')' : '') + (d.status === 'lost' && d.leaveSilenceMs ? ', silent ' + Math.round(d.leaveSilenceMs / 1000) + ' s first' : '') + '</div>' : '';
        const why = gone ? (d.reasons && d.reasons.length ? '' : '') : (d.reasons && d.reasons.length ? esc(d.reasons.join('; ')) : '<span class="sl-dim">Nothing to report</span>');
        const worst = !gone && d.worstGrade && d.worstGrade !== 'good' && d.worstGrade !== d.grade ? '<div class="sl-sm">worst this session: ' + esc(GRADE[d.worstGrade] || d.worstGrade) + '</div>' : (d.tot && d.tot.stalls && !why ? '' : '');
        const tot = d.tot && (d.tot.stalls || d.tot.spikes) ? '<div class="sl-sm">session: ' + (d.tot.stalls ? d.tot.stalls + ' freeze' + (d.tot.stalls === 1 ? '' : 's') + (d.tot.longest ? ' (longest ' + (d.tot.longest / 1000).toFixed(1) + ' s)' : '') : '') + (d.tot.stalls && d.tot.spikes ? ', ' : '') + (d.tot.spikes ? d.tot.spikes + ' ping spike' + (d.tot.spikes === 1 ? '' : 's') : '') + '</div>' : '';
        const n = notes[d.id];
        const told = n
          ? '<div class="sl-told">Told by ' + esc(n.by) + ' ' + esc(ago((v.nowMs || Date.now()) - n.atMs + (Date.now() - S.loadedAt))) + '</div><button type="button" class="sl-mini" data-a="untold" data-id="' + esc(d.id) + '">Undo</button>'
          : '<button type="button" class="sl-mini" data-a="told" data-id="' + esc(d.id) + '">Mark as told</button>';
        return '<tr class="sl-row ' + (gone ? (d.status === 'lost' ? 'g-bad' : 'g-poor') : 'g-' + d.grade) + '">'
          + '<td><div class="sl-name">' + esc(d.name) + (d.race ? ' <span class="sl-no">#' + esc(d.race) + '</span>' : '') + '</div><div class="sl-sm">' + plat + ' ' + rj + '</div></td>'
          + '<td>' + st + gtime + '</td>'
          + '<td>' + gr + '<div class="sl-sm">' + (d.avgPing != null && !gone ? esc(d.avgPing) + ' ms avg' : '') + '</div></td>'
          + '<td class="sl-why">' + why + worst + tot + '</td>'
          + '<td class="sl-act">' + (opts.readOnly ? '' : '<button type="button" class="sl-mini" data-a="copy" data-id="' + esc(d.id) + '">Copy a message</button>' + (gone || d.grade === 'poor' || d.grade === 'bad' ? told : '')) + '</td></tr>';
      }).join('');
      R.drivers.innerHTML = '<table class="sl-tbl"><thead><tr><th>Driver</th><th>Status</th><th>Connection</th><th>What the server saw</th><th></th></tr></thead><tbody>' + body + '</tbody></table>';
    }

    function renderFeed() {
      const s = snap(); if (!s) { R.feed.innerHTML = '<div class="sl-empty">No events yet.</div>'; return; }
      const grp = FEED_GROUPS[S.feedFilter];
      const ev = s.events.filter((e) => !grp || grp.indexOf(e.type) >= 0).slice(-150).reverse();
      if (!ev.length) { R.feed.innerHTML = '<div class="sl-empty">Nothing in this group yet.</div>'; return; }
      R.feed.innerHTML = ev.map((e) => '<div class="sl-ev l-' + esc(e.level) + '"><span class="sl-t">' + esc(when(e.t)) + '</span><span class="sl-tag t-' + esc(e.type) + '">' + esc(TYPE_LABEL[e.type] || e.type) + '</span><span class="sl-tx">' + esc(e.text) + (e.ctx ? ' <span class="sl-ctx">' + esc(e.ctx) + '</span>' : '') + '</span></div>').join('');
    }

    function renderSession() {
      const s = snap(); if (!s) { R.session.textContent = 'Waiting for the first update…'; return; }
      const x = s.session || {};
      const bits = [];
      if (x.name) bits.push('<b>' + esc(x.name) + '</b>' + (x.phase && x.phase !== 'session' ? ' (' + esc(x.phase) + ')' : ''));
      if (x.minLeft != null) bits.push(esc(x.minLeft) + ' min left');
      if (x.cars) bits.push(esc(x.cars) + ' cars');
      if (s.boots) bits.push('server restarted ' + s.boots + (s.boots === 1 ? ' time' : ' times'));
      R.session.innerHTML = bits.length ? bits.join(' · ') : 'Connected to the server log';
    }

    function renderAll() { renderStatus(); renderBanner(); renderSession(); renderTiles(); renderFilters(); renderDrivers(); renderFeed(); renderTitle(); try { ownerBox(); } catch (_) {} }

    function renderTitle() {
      if (!S.running) return;
      const s = snap(); const n = s ? s.drivers.filter((d) => d.status === 'lost' || (d.status === 'online' && (d.grade === 'poor' || d.grade === 'bad'))).length : 0;
      if (!S.titleBase) S.titleBase = document.title.replace(/^\(\d+\)\s*/, '');
      document.title = (n ? '(' + n + ') ' : '') + S.titleBase;
    }

    /* ---------- toasts + sound ---------- */
    function beep() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        S.audio = S.audio || new AC(); const a = S.audio; if (a.state === 'suspended') a.resume();
        [0, 0.22].forEach((off) => { const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.0001; o.connect(g); g.connect(a.destination); const t0 = a.currentTime + off; g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18); o.start(t0); o.stop(t0 + 0.2); });
      } catch (_) {}
    }
    function toast(e) {
      const d = document.createElement('div'); d.className = 'sl-toast l-' + e.level;
      d.innerHTML = '<b>' + esc(TYPE_LABEL[e.type] || 'Server') + '</b> ' + esc(e.text);
      d.addEventListener('click', () => d.remove());
      R.toasts.appendChild(d);
      while (R.toasts.children.length > 4) R.toasts.firstChild.remove();
      setTimeout(() => d.remove(), e.level === 'bad' ? 16000 : 9000);
    }
    function announce(s) {
      const boot = s.boots;
      if (S.seenBoot !== null && boot !== S.seenBoot) S.seenEventId = -1;      // server restarted: ids start again
      S.seenBoot = boot;
      const fresh = s.events.filter((e) => e.id > S.seenEventId);
      if (fresh.length) S.seenEventId = Math.max.apply(null, fresh.map((e) => e.id));
      if (S.first) { S.first = false; return; }
      const loud = fresh.filter((e) => e.level === 'bad' || e.level === 'warn' || e.type === 'lost' || e.type === 'left' || e.type === 'rejoined' || e.type === 'refused');
      if (S.toasts) loud.slice(-3).forEach(toast);
      if (S.sound && loud.some((e) => e.level === 'bad' || e.type === 'lost')) beep();
    }

    /* ---------- loading ---------- */
    async function refresh() {
      if (S.upload) return;
      try {
        const d = await load(server);
        S.loadedAt = Date.now(); S.err = '';
        if (!d.empty && d.snapshot) announce(d.snapshot);
        S.data = d;
      } catch (e) {
        S.err = e.status === 403 ? 'Server Live is for league staff.' : e.status === 401 ? 'Log in to see Server Live.' : (e.message || 'Could not reach the server');
        if (e.status === 401 || e.status === 403) S.data = null;
      }
      renderAll();
    }
    function schedule() {
      clearTimeout(S.timer);
      if (!S.running) return;
      S.timer = setTimeout(async () => { await refresh(); schedule(); }, document.hidden ? 15000 : 3000);
    }
    function start() {
      if (S.running) return; S.running = true; S.first = S.data ? false : true;
      refresh().then(schedule);
      S.tick = setInterval(() => { renderStatus(); }, 1000);
    }
    function stop() { S.running = false; clearTimeout(S.timer); clearInterval(S.tick); if (S.titleBase) { document.title = S.titleBase; S.titleBase = ''; } }
    function destroy() { stop(); el.innerHTML = ''; el.classList.remove('sl-root'); }

    /* ---------- owner: feed setup ---------- */
    function ownerBox() {
      const owner = !!(S.data && S.data.isOwner && !S.upload);
      if (!owner) { if (R.owner.dataset.on) { R.owner.innerHTML = ''; delete R.owner.dataset.on; } return; }
      if (R.owner.dataset.on) return; R.owner.dataset.on = '1';
      R.owner.innerHTML = '<details class="sl-card sl-setup" data-k="setup"><summary>Feed setup (Owner only)</summary><div class="sl-howbody">'
        + '<p>A small program reads the ACC <code>server.log</code> from GPortal while a session runs, works out who is lagging or has left, and sends only that summary here (never IP addresses or the raw log). It runs as a GitHub workflow using your existing log secrets.</p>'
        + '<div class="sl-kv"><span>Feed address</span><code data-r2="url">' + esc(FN) + '</code><button type="button" class="sl-mini" data-a="copyurl">Copy</button></div>'
        + '<div class="sl-kv"><span>Feed key</span><code data-r2="key">hidden</code><button type="button" class="sl-mini" data-a="showkey">Show</button><button type="button" class="sl-mini" data-a="copykey" hidden>Copy</button><button type="button" class="sl-mini sl-warn" data-a="rotate">Make a new key</button></div>'
        + '<p class="sl-dim">Keep the key in GitHub as a secret named <code>IFWL_INGEST_KEY</code>. If it ever leaks, make a new one and update the secret; the old key stops working straight away.</p>'
        + '</div></details>';
      const setup = R.owner.querySelector('[data-k="setup"]'); if (S.open.setup) setup.open = true; setup.addEventListener('toggle', () => { S.open.setup = setup.open; });
    }

    /* ---------- events ---------- */
    el.addEventListener('click', async (ev) => {
      const t = ev.target.closest('[data-a],[data-f],[data-ff]'); if (!t || !el.contains(t)) return;
      if (t.dataset.f) { S.filter = t.dataset.f; try { localStorage.setItem('IFWL_SL_FILTER', S.filter); } catch (_) {} renderFilters(); renderDrivers(); return; }
      if (t.dataset.ff) { S.feedFilter = t.dataset.ff; renderFilters(); renderFeed(); return; }
      const a = t.dataset.a, id = t.dataset.id;
      const drv = () => { const s = snap(); return s && s.drivers.find((d) => d.id === id); };
      if (a === 'sound') { S.sound = !S.sound; if (S.sound) beep(); try { localStorage.setItem('IFWL_SL_SOUND', S.sound ? '1' : '0'); } catch (_) {} syncTools(); }
      else if (a === 'toasts') { S.toasts = !S.toasts; try { localStorage.setItem('IFWL_SL_TOASTS', S.toasts ? '1' : '0'); } catch (_) {} syncTools(); }
      else if (a === 'upload') R.file.click();
      else if (a === 'live') { S.upload = null; S.first = true; renderAll(); refresh(); }
      else if (a === 'copy') {
        const d = drv(); if (!d) return; const text = headsUp(d);
        let done = false;
        try { await navigator.clipboard.writeText(text); done = true; } catch (_) {}
        if (!done) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { done = document.execCommand('copy'); } catch (_) {} ta.remove(); }
        const old = t.textContent; t.textContent = done ? 'Copied' : 'Copy failed'; setTimeout(() => { t.textContent = old; }, 1400);
      }
      else if (a === 'told' || a === 'untold') {
        t.disabled = true;
        try {
          const r = await api('staffServerLiveNote', { server, id, told: a === 'told', text: '' });
          if (S.data) S.data.notes = r.notes || {};
        } catch (e) { t.textContent = e.message || 'Failed'; return; }
        renderDrivers();
      }
      else if (a === 'copyurl' || a === 'copykey') {
        const val = a === 'copyurl' ? FN : (R.owner.querySelector('[data-r2="key"]').dataset.v || '');
        try { await navigator.clipboard.writeText(val); const o = t.textContent; t.textContent = 'Copied'; setTimeout(() => { t.textContent = o; }, 1200); } catch (_) {}
      }
      else if (a === 'showkey' || a === 'rotate') {
        if (a === 'rotate' && !window.confirm('Make a new feed key? The log feed stops working until you put the new key into the GitHub secret.')) return;
        try {
          const r = await api('staffServerLiveKey', a === 'rotate' ? { rotate: true } : null);
          const k = R.owner.querySelector('[data-r2="key"]'); k.dataset.v = r.key; k.textContent = r.key;
          R.owner.querySelector('[data-a="copykey"]').hidden = false; t.textContent = a === 'rotate' ? 'Made a new key' : 'Show';
        } catch (e) { t.textContent = e.message || 'Failed'; }
      }
    });
    R.file.addEventListener('change', async () => {
      const f = R.file.files && R.file.files[0]; if (!f) return;
      try {
        await ensureParser();
        const text = await f.text();
        const snapshot = window.IFWL_ServerLog.parseAll(text, {});
        S.upload = { ok: true, uploaded: true, snapshot, notes: {}, nowMs: Date.now() };
        S.loadedAt = Date.now();
        renderAll();
      } catch (e) { S.err = 'Could not read that file: ' + (e.message || e); renderAll(); }
      R.file.value = '';
    });
    function syncTools() {
      const b1 = el.querySelector('[data-a="sound"]'), b2 = el.querySelector('[data-a="toasts"]');
      b1.textContent = S.sound ? 'Sound on' : 'Sound off'; b1.setAttribute('aria-pressed', S.sound ? 'true' : 'false'); b1.classList.toggle('on', S.sound);
      b2.textContent = S.toasts ? 'Pop-ups on' : 'Pop-ups off'; b2.setAttribute('aria-pressed', S.toasts ? 'true' : 'false'); b2.classList.toggle('on', S.toasts);
    }
    function ensureParser() {
      if (window.IFWL_ServerLog) return Promise.resolve();
      const src = opts.parserUrl || (document.querySelector('script[src*="12-server-live.js"]') ? document.querySelector('script[src*="12-server-live.js"]').src.replace(/12-server-live\.js.*$/, 'ifwl-serverlog.js') : 'assets/js/ifwl-serverlog.js');
      return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => (window.IFWL_ServerLog ? res() : rej(new Error('parser did not load'))); s.onerror = () => rej(new Error('parser file missing on the website (ifwl-serverlog.js)')); document.head.appendChild(s); });
    }

    syncTools(); renderAll();
    return { start, stop, destroy, refresh, state: S };
  }

  /* ---------- Licence Centre: mount when the staff view is open ---------- */
  let ctl = null;
  function tick() {
    const root = document.getElementById('serverLiveRoot'); if (!root) return;
    const a = document.querySelector('.view-panel.is-active-view');
    const active = a && a.dataset.view === 'staffServerLive';
    if (active && !ctl) { ctl = mount(root, { server: 'main' }); ctl.start(); }
    else if (active && ctl && !ctl.state.running) ctl.start();
    else if (!active && ctl && ctl.state.running) ctl.stop();
  }
  window.IFWL_ServerLive = { mount, version: 1 };
  setInterval(tick, 600); tick();
})();
