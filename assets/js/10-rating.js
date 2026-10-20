/* ============================================================
   IFWL RATING (four pillars) - front end
   - number on the driver's own licence card (button -> breakdown page)
   - small number + level chip on directory cards (public view = number only)
   - breakdown page (view "rating") and Owner controls (view "ratingAdmin")
   Every request goes to the same rtGate function; the server decides who may see what.
   ============================================================ */
(() => {
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const PAGE = 'licence-rating.html';
  const $ = (id) => document.getElementById(id);
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const myId = () => { try { return String((window.IFWL_AUTH && window.IFWL_AUTH.userId && window.IFWL_AUTH.userId(window.IFWL_META)) || ''); } catch (_) { return ''; } };
  const bodyHas = (c) => document.body.classList.contains(c);
  async function call(action, body, extra) {
    const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' };
    const r = await fetch(FN + '?' + action + '=1&token=' + encodeURIComponent(token()) + (extra || ''), opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
    return d;
  }
  const fmtDate = (ms) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' }).format(new Date(ms)); } catch (_) { return ''; } };
  const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n * 10) / 10);

  /* ---------- board (everyone's number + level), cached briefly across pages ---------- */
  let board = null, boardAt = 0, boardP = null;
  async function loadBoard(force) {
    if (!token()) { board = null; return null; }
    if (!force && board && Date.now() - boardAt < 120000) return board;
    try { const s = sessionStorage.getItem('IFWL_RT_BOARD'); if (!force && s) { const o = JSON.parse(s); if (o && Date.now() - o.at < 120000 && o.uid === myId()) { board = o.d; boardAt = o.at; return board; } } } catch (_) {}
    if (boardP) return boardP;
    boardP = call('ratingBoard').then((d) => { board = d; boardAt = Date.now(); try { sessionStorage.setItem('IFWL_RT_BOARD', JSON.stringify({ at: boardAt, uid: myId(), d })); } catch (_) {} return d; })
      .catch(() => null).finally(() => { boardP = null; });
    return boardP;
  }
  const visible = () => !!(board && board.visible);
  const rname = () => (board && board.name) || 'Rating';

  /* ---------- badges ---------- */
  function applyNav() {
    const b = $('rtNavBtn'); if (!b) return;
    if (visible()) { b.style.display = ''; b.textContent = rname(); } else b.style.display = 'none';
  }
  function chipText(r) { return r.b ? 'Building' : (r.s + ' · ' + r.l); }
  function applyCard() {
    const stats = $('licenceCardStats'); if (!stats) return;
    let btn = $('rtCardBtn');
    const me = myId(); const r = visible() && me && board.ratings ? board.ratings[me] : null;
    if (!r) { if (btn) btn.remove(); return; }
    if (!btn) {
      btn = document.createElement('button'); btn.type = 'button'; btn.id = 'rtCardBtn'; btn.className = 'rt-card-btn';
      btn.addEventListener('click', () => { location.href = PAGE; });
      const anchor = stats.querySelector('.points-section') || stats.firstChild;
      stats.insertBefore(btn, anchor);
    }
    btn.innerHTML = '<span><span class="rt-k">' + esc(rname()) + '</span><br><span class="rt-l">' + (r.b ? 'Building (' + (r.raced || 0) + ' of ' + ((board.buildingRaces) || 5) + ')' : esc(r.l)) + '</span></span>'
      + '<span style="text-align:right"><span class="rt-n">' + (r.b ? '…' : r.s) + '</span><br><span class="rt-go">See how it’s made →</span></span>';
    btn.title = 'Open your ' + rname() + ' breakdown';
  }
  function applyDirectory() {
    const body = $('dirTableBody'); if (!body) return;
    body.querySelectorAll('.dir-card[data-open-driver]').forEach((card) => {
      const old = card.querySelector('.rt-dir-chip');
      const r = visible() && board.ratings ? board.ratings[card.dataset.openDriver] : null;
      if (!r) { if (old) old.remove(); return; }
      const txt = chipText(r);
      if (old) { if (old.textContent !== txt) { old.textContent = txt; old.className = 'rt-dir-chip' + (r.b ? ' building' : ''); } return; }
      const host = card.querySelector('.dir-card-info'); if (!host) return;
      const s = document.createElement('span'); s.className = 'rt-dir-chip' + (r.b ? ' building' : ''); s.title = rname(); s.textContent = txt;
      const pill = host.querySelector('.tier-pill'); if (pill) pill.insertAdjacentElement('afterend', s); else host.appendChild(s);
    });
  }
  function applyAll() { applyNav(); applyCard(); applyDirectory(); }
  let dirObs = null;
  function watchDirectory() {
    const body = $('dirTableBody'); if (!body || dirObs) return;
    dirObs = new MutationObserver(() => { if (visible()) applyDirectory(); });
    dirObs.observe(body, { childList: true });
  }

  /* ---------- breakdown page ---------- */
  const PILLAR = {
    I: { name: 'Integrity', short: 'Stewarding record', cls: 'r', d: 'Starts from a clean slate and grows with every race you complete. Licence points from steward decisions take points off; dismissed tickets cost nothing.' },
    F: { name: 'Fair play', short: 'Peer feedback', cls: 'p', d: 'Thumbs up and down from other drivers. Starts in the middle and only the combined effect is ever shown.' },
    W: { name: 'Wheelcraft', short: 'Clean driving', cls: '', d: 'How cleanly you drive: race penalties, track-limit laps and finishing the distance. Your latest races count the most.' },
    L: { name: 'Laps', short: 'Progression', cls: 's', d: 'Finishing races, turning up week after week, a good share of the season and the seasons you have raced.' }
  };
  function pillarNow(k, d, dg) {
    const x = d[k];
    if (k === 'I') return 'Base ' + x.base + (x.lost ? ' minus ' + x.lost + ' from licence points (fading)' : ' - nothing deducted') + (dg ? '. Licence points on your record: ' + dg.licencePointsNow + ' (' + dg.countedPoints + ' counted since the start date' + (dg.beforeStart ? ', ' + dg.beforeStart + ' earlier entr' + (dg.beforeStart === 1 ? 'y' : 'ies') + ' not counted' : '') + ')' : '');
    if (k === 'F') return x.up || x.downWeighted ? 'Overall effect of feedback so far: ' + (x.net >= 0 ? 'positive' : 'negative') : 'No feedback yet - sitting in the middle';
    if (k === 'W') return x.races ? 'Last ' + x.races + ' race' + (x.races === 1 ? '' : 's') + ': ' + x.avgClean + '% clean' : 'No races yet';
    return x.finishes + ' race finish' + (x.finishes === 1 ? '' : 'es') + ', ' + x.streak + ' night streak, ' + x.attendance + '% of ' + (x.seasonName || 'the season') + ' attended, ' + x.seasons + ' season' + (x.seasons === 1 ? '' : 's') + ' raced';
  }
  function ladderHtml(levels, score) {
    let idx = 0; levels.forEach((l, i) => { if (score >= l.min) idx = i; });
    return levels.map((l, k) => '<div class="rt-step ' + (score == null ? '' : k < idx ? 'done' : k === idx ? 'here' : '') + '"><b>' + esc(l.name) + '</b><span>' + l.min + (levels[k + 1] ? '–' + (levels[k + 1].min - 1) : '+') + '</span></div>').join('');
  }
  function ringHtml(score, label, sub) {
    const C = 2 * Math.PI * 52; const dash = score == null ? 0 : C * Math.min(1, score / 1000);
    return '<div class="rt-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#edf0f4" stroke-width="11"/><circle cx="60" cy="60" r="52" fill="none" stroke="url(#rtg)" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + dash + ' ' + C + '"/><defs><linearGradient id="rtg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e9c8a"/><stop offset="1" stop-color="#9b3fd1"/></linearGradient></defs></svg>'
      + '<div class="rt-c"><div class="rt-big">' + (score == null ? '…' : score) + '</div><div class="rt-of">' + (score == null ? sub : 'out of 1000') + '</div><div class="rt-lv">' + esc(label) + '</div></div></div>';
  }
  function sparkHtml(chart) {
    if (!chart || chart.length < 2) return '<p class="rt-empty" style="padding:14px">Your season line appears here after a couple of weeks of racing.</p>';
    const W = 300, H = 110, P = 8; const xs = chart.map((c) => c.t), ys = chart.map((c) => c.score);
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs); let y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (y1 - y0 < 60) { const m = (y1 + y0) / 2; y0 = m - 30; y1 = m + 30; }
    const pts = chart.map((c) => [P + (c.t - x0) / Math.max(1, x1 - x0) * (W - 2 * P), H - P - (c.score - y0) / (y1 - y0) * (H - 2 * P)]);
    const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return '<svg class="rt-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><polyline fill="rgba(14,156,138,.10)" stroke="none" points="' + line + ' ' + last[0] + ',' + H + ' ' + pts[0][0] + ',' + H + '"/><polyline fill="none" stroke="#0e9c8a" stroke-width="3" points="' + line + '"/><circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4.5" fill="#0e9c8a"/></svg>'
      + '<div class="rt-barlab"><span>' + fmtDate(x0) + ' · ' + ys[0] + '</span><span>' + fmtDate(x1) + ' · ' + ys[ys.length - 1] + '</span></div>'
      + '<p style="margin:8px 0 0;font-weight:800">High ' + Math.max.apply(null, ys) + ' · low ' + Math.min.apply(null, ys) + '</p>';
  }
  function howHtml(d) {
    const T = d.tune || {}; const I = T.I || {}, F = T.F || {}, W = T.W || {}, L = T.L || {};
    return '<div class="rt-how">'
      + '<details open><summary>The score in one minute</summary><p>Your ' + esc(d.name) + ' is out of 1000 and is built from four pillars: <b>I</b>ntegrity (' + (I.max || 250) + '), <b>F</b>air play (' + (F.max || 200) + '), <b>W</b>heelcraft (' + (W.max || 300) + ') and <b>L</b>aps (' + (L.max || 250) + '). It is a picture of how you race with others. It never measures how fast you are – that is what Overall Score is for. It counts from the start of ' + esc(d.startLabel || 'the season') + ' only.</p></details>'
      + '<details><summary>I – Integrity: your stewarding record</summary><p>You start at ' + (I.start || 150) + ' and earn ' + (I.growPerRace || 4) + ' for every race you complete, up to ' + (I.max || 250) + '. An upheld steward decision takes points off:</p><table class="rt-tbl"><tr><th>Decision</th><th>Points off</th></tr><tr><td>Mild</td><td>−' + (I.mild || 20) + '</td></tr><tr><td>Standard</td><td>−' + (I.standard || 35) + '</td></tr><tr><td>Severe</td><td>−' + (I.severe || 60) + '</td></tr><tr><td>Dismissed / no action</td><td>0</td></tr></table></details>'
      + '<details><summary>F – Fair play: peer feedback</summary><ul><li>Drivers can give a thumbs up or down from the Driver Directory, once per driver.</li><li>Nobody sees who said what – you only see the combined effect.</li><li>You start in the middle (' + (F.neutral || 80) + ' of ' + (F.max || 200) + '). Positive feedback lifts you, negative feedback lowers you.</li><li>Thumbs down count a little more than thumbs up, but feedback from someone who only ever gives thumbs down counts for less.</li></ul></details>'
      + '<details><summary>W – Wheelcraft: clean driving</summary><p>Each race gets a clean-driving percentage from the race result: race penalties, track-limit laps, retiring early and missing a mandatory stop all lower it. Your last ' + (W.window || 10) + ' races count, newest the most, and the score builds up fully over your first ' + (W.rampRaces || 20) + ' races.</p></details>'
      + '<details><summary>L – Laps: progression</summary><table class="rt-tbl"><tr><th>What</th><th>Points</th></tr><tr><td>Each race finished</td><td>+' + (L.finishPts || 2.5) + ' (up to ' + (L.finishCap || 75) + ')</td></tr><tr><td>Each race night in a row (one miss is forgiven)</td><td>+' + (L.streakPts || 3) + ' (up to ' + (L.streakCap || 30) + ')</td></tr><tr><td>Share of the season you race</td><td>up to +' + (L.attendMax || 40) + '</td></tr><tr><td>Each season you race in</td><td>+' + (L.seasonPts || 12) + ' (up to ' + (L.seasonCap || 60) + ')</td></tr><tr><td>' + (L.milestoneRaces || 100) + ' races raced</td><td>+' + (L.milestonePts || 30) + '</td></tr></table></details>'
      + '<details><summary>Bad marks fade, good ones stay</summary><p>Anything that took points off counts for half as much after ' + (T.seasonDays || 105) + ' days (about a season) and for nothing after twice that. A bad month does not follow anyone around for ever.</p></details>'
      + '<details><summary>Can staff change it?</summary><p>Staff can adjust a score by hand for something the data cannot see, but the reason is always logged and shown to you in “What moved your score”. Patreon and everything outside driving has no effect at all.</p></details>'
      + '<details><summary>Why does a new driver show “Building”?</summary><p>Until you have ' + esc(d.racesNeeded) + ' races the sample is too small to mean anything, so the number stays hidden from others. You still see your own progress here.</p></details>'
      + '</div><div class="rt-safe"><div><b>Never about speed</b>Pace is already covered by Overall Score.</div><div><b>Anonymous peers</b>No names, no list of voters.</div><div><b>Recovery built in</b>Marks fade season by season.</div><div><b>Fully explained</b>Every point has a reason on this page.</div></div>';
  }
  function eventsHtml(ev) {
    if (!ev || !ev.length) return '<p class="rt-empty" style="padding:14px">Nothing yet – your first race will show up here.</p>';
    const row = (e, hide) => {
      const chip = e.delta != null ? '<span class="rt-pt ' + (e.delta > 0 ? 'rt-pos' : 'rt-neg') + '">' + sign(e.delta) + '</span>' : '<span class="rt-pt rt-neu">' + esc(e.chip || '•') + '</span>';
      return '<li>' + chip + '<div><b>' + esc(e.label) + ' <small style="display:inline;color:var(--text-dim)">(' + esc((PILLAR[e.pillar] || {}).name || '') + ')</small></b><small>' + esc(e.note || '') + '</small></div><em>' + fmtDate(e.tsMs) + '</em></li>';
    };
    ev = ev.filter((e) => e.pillar !== 'W' || e.delta != null).concat(ev.filter((e) => e.pillar === 'W' && e.delta == null)); // tickets, adjustments and feedback first, then races
    const shown = ev.slice(0, 10), more = ev.slice(10, 40);
    return '<ul class="rt-feed" id="rtFeed">' + shown.map((e) => row(e)).join('') + '</ul>'
      + (more.length ? '<ul class="rt-feed" id="rtFeedMore" style="display:none;margin-top:8px">' + more.map((e) => row(e)).join('') + '</ul><button type="button" class="btn" id="rtFeedBtn" style="margin-top:10px">Show ' + more.length + ' more</button>' : '');
  }

  let curData = null;
  function renderPage(d, root) {
    if (!d.visible) { root.innerHTML = '<div class="rt-page"><div class="rt-empty"><h3 style="margin:0 0 6px">Not switched on yet</h3>The driver rating is not live yet. Check back soon.</div></div>'; return; }
    if (d.noLicence) { root.innerHTML = '<div class="rt-page"><div class="rt-empty">No licence found for this driver.</div></div>'; return; }
    curData = d;
    const lv = d.level; const levels = d.levels;
    const pctNext = d.building ? Math.min(100, (d.racesDone / Math.max(1, d.racesNeeded)) * 100) : (lv.nextAt ? Math.min(100, ((d.score - lv.min) / (lv.nextAt - lv.min)) * 100) : 100);
    const heading = d.building ? 'Building your rating' : 'You’re a ' + esc(lv.name) + ' driver';
    const viewer = d.self ? '' : '<div class="rt-note" style="margin-top:0;margin-bottom:12px"><b>Staff view</b> – you are looking at ' + esc(d.driverName || 'a driver') + '’s breakdown. <a class="rt-back" style="margin:0 0 0 8px" href="' + PAGE + '">Back to mine</a></div>';
    const tipBlock = (d.tips || []).map((t) => '<div class="rt-tip"><b>' + esc(t.pillar) + '</b><div>' + esc(t.text) + '</div></div>').join('') || '<div class="rt-tip"><b>✓</b><div>You are close to full marks on every pillar. Keep doing what you are doing.</div></div>';
    const wiOpts = (d.whatIf || []).map((w, i) => '<option value="' + i + '">' + esc(w.label) + '</option>').join('');
    root.innerHTML = '<div class="rt-page">' + viewer
      + '<div class="rt-top"><h2>' + esc(d.name) + ' · ' + esc(d.startLabel || '') + '<span id="rtTestFlag"></span></h2><p>' + (d.self ? 'Your rating' : esc(d.driverName || 'Driver')) + ' – only the number and level are public. This page is just for you.</p></div>'
      + '<div class="rt-card"><div class="rt-hero">' + ringHtml(d.building ? null : d.score, d.building ? 'Building' : lv.name, d.racesDone + ' of ' + d.racesNeeded + ' races')
      + '<div class="rt-heroR"><h4>' + heading + '</h4>'
      + (d.building ? '<p>Race ' + Math.max(0, d.racesNeeded - d.racesDone) + ' more time' + (d.racesNeeded - d.racesDone === 1 ? '' : 's') + ' and your number goes live. Until then only you can see how it is shaping up below.</p>' : '<p>Clean racing, steady turn-out and good feedback from the drivers you race with move this up. Upheld steward decisions and negative feedback move it down. It never changes how fast you are, only how you race.</p>')
      + '<div style="margin-top:14px"><div class="rt-bar"><i style="width:' + pctNext + '%"></i></div><div class="rt-barlab"><span>' + (d.building ? d.racesDone + ' of ' + d.racesNeeded + ' races' : (lv.nextAt ? lv.toNext + ' points to ' + esc(lv.nextName) : 'Top level reached')) + '</span><span>' + (d.building ? d.racesNeeded : (lv.nextAt || 1000)) + '</span></div></div></div></div>'
      + '<div class="rt-ladder">' + ladderHtml(levels, d.building ? null : d.score) + '</div></div>'
      + '<div class="rt-grid2"><div class="rt-card"><h3>Where your points come from</h3><div class="rt-pillars">'
      + d.pillars.map((p) => { const m = PILLAR[p.key]; return '<div class="rt-pl"><div class="rt-h"><b><em>' + p.key + '</em>' + m.name + '</b><span>' + p.value + ' / ' + p.max + '</span></div><div class="rt-d">' + m.d + '</div><div class="rt-bar"><i class="' + m.cls + '" style="width:' + Math.round(p.value / p.max * 100) + '%"></i></div><div class="rt-now">' + esc(pillarNow(p.key, d.detail, d.diag)) + '</div></div>'; }).join('')
      + '</div></div><div class="rt-card"><h3>What moved your score</h3>' + eventsHtml(d.events) + '</div></div>'
      + '<div class="rt-grid2"><div class="rt-card"><h3>How to climb</h3>' + tipBlock + '<h3 style="margin-top:16px">Try a what-if</h3><div class="rt-wi"><select id="rtWi"><option value="">Pick something…</option>' + wiOpts + '</select><span class="rt-wiout" id="rtWiOut"></span></div></div>'
      + '<div class="rt-card"><h3>Your season so far</h3>' + sparkHtml(d.chart) + '</div></div>'
      + '<div class="rt-card"><h3>How it works</h3>' + howHtml(d) + '</div>'
      + '<div id="rtStaffAdj"></div></div>';
    const fb = $('rtFeedBtn');
    if (fb) fb.addEventListener('click', () => { const m = $('rtFeedMore'); const open = m.style.display === 'none'; m.style.display = open ? 'grid' : 'none'; fb.textContent = open ? 'Show fewer' : 'Show more'; });
    const sel = $('rtWi');
    if (sel) sel.addEventListener('change', () => {
      const out = $('rtWiOut'); const w = d.whatIf[+sel.value];
      if (!w || d.building) { out.textContent = d.building && w ? 'Available once your number is live' : ''; return; }
      const ns = Math.max(0, Math.min(1000, d.score + w.delta));
      out.innerHTML = '<span style="color:' + (w.delta >= 0 ? 'var(--ifwl-green)' : 'var(--ifwl-red)') + '">' + sign(w.delta) + '</span> → ' + ns;
    });
    if (!d.self) renderStaffAdj(d);
  }

  /* staff: manual adjustments with a logged reason (Owner / Ops) */
  async function renderStaffAdj(d) {
    const host = $('rtStaffAdj'); if (!host) return;
    if (!(bodyHas('owner-access') || bodyHas('ops-access'))) return;
    const id = new URLSearchParams(location.search).get('driver') || '';
    host.innerHTML = '<div class="rt-card"><h3>Staff adjustment</h3><p style="margin:0;color:var(--text-muted);font-size:13px">Use only for something the race data cannot see. The reason is shown to the driver.</p>'
      + '<div class="rt-ad"><div class="rt-row"><select id="rtAdP"><option value="I">I – Integrity</option><option value="F">F – Fair play</option><option value="W">W – Wheelcraft</option><option value="L">L – Laps</option></select><input id="rtAdN" type="number" min="-100" max="100" step="1" placeholder="Points (e.g. -10)" style="width:150px"></div><textarea id="rtAdR" maxlength="200" placeholder="Reason (the driver can see this)"></textarea><div class="rt-row"><button class="btn teal" id="rtAdGo" type="button">Add adjustment</button><span class="rt-status" id="rtAdS"></span></div></div><div id="rtAdList" style="margin-top:12px"></div></div>';
    const list = async () => {
      try {
        const r = await call('ratingAdjustList', null, '&driverId=' + encodeURIComponent(id));
        $('rtAdList').innerHTML = r.items.length ? '<table class="rt-tbl"><tr><th>When</th><th>Pillar</th><th>Points</th><th>Reason</th><th>By</th><th></th></tr>' + r.items.map((a) => '<tr' + (a.voided ? ' style="opacity:.5;text-decoration:line-through"' : '') + '><td>' + fmtDate(a.atMs) + '</td><td>' + esc(a.pillar) + '</td><td>' + sign(a.points) + '</td><td>' + esc(a.reason) + '</td><td>' + esc(a.byName || '') + '</td><td>' + (a.voided ? '' : '<button type="button" class="btn" data-void="' + esc(a.id) + '">Undo</button>') + '</td></tr>').join('') + '</table>' : '<p style="color:var(--text-muted);font-size:13px">No adjustments yet.</p>';
        $('rtAdList').querySelectorAll('[data-void]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; try { await call('ratingAdjustVoid', { id: b.dataset.void }); await reload(); } catch (e) { $('rtAdS').textContent = e.message; $('rtAdS').className = 'rt-status bad'; b.disabled = false; } }));
      } catch (e) { $('rtAdList').innerHTML = '<p class="rt-status bad">' + esc(e.message) + '</p>'; }
    };
    list();
    $('rtAdGo').addEventListener('click', async () => {
      const s = $('rtAdS'); s.className = 'rt-status'; s.textContent = 'Saving…';
      try { await call('ratingAdjust', { driverId: id, pillar: $('rtAdP').value, points: Number($('rtAdN').value), reason: $('rtAdR').value }); await reload(); }
      catch (e) { s.className = 'rt-status bad'; s.textContent = e.message; }
    });
  }

  async function reload() { await loadBoard(true); await renderRating(); }

  async function renderRating() {
    const root = $('ratingRoot'); if (!root) return;
    if (!token()) { root.innerHTML = '<div class="rt-page"><div class="rt-empty">Log in with Discord to see your rating.</div></div>'; return; }
    root.innerHTML = '<div class="rt-page"><div class="rt-empty">Loading…</div></div>';
    try {
      const drv = new URLSearchParams(location.search).get('driver') || '';
      const d = await call('ratingMe', null, drv ? '&driverId=' + encodeURIComponent(drv) : '');
      if (board == null) await loadBoard();
      renderPage(d, root);
      try { const c = await call('ratingConfig'); const f = $('rtTestFlag'); if (f && c.mode === 'test') f.innerHTML = '<span class="rt-test-flag">Test mode – only you can see this</span>'; } catch (_) {}
    } catch (e) { root.innerHTML = '<div class="rt-page"><div class="rt-empty">' + esc(e.message) + '</div></div>'; }
  }

  /* ---------- Owner controls ---------- */
  const TUNE_LABELS = {
    seasonDays: 'Days for bad marks to halve (and vanish at 2x)',
    'I.start': 'Integrity: starting points', 'I.growPerRace': 'Integrity: points per race', 'I.growCap': 'Integrity: max growth', 'I.mild': 'Mild decision: points off', 'I.standard': 'Standard decision: points off', 'I.severe': 'Severe decision: points off',
    'F.neutral': 'Fair play: starting point', 'F.scale': 'Fair play: how many votes to move far', 'F.downWeight': 'Thumbs down weight', 'F.spamRatio': 'Down-only rater threshold', 'F.spamMinRatings': 'Min ratings to judge a rater', 'F.spamFactor': 'Weight of a down-only rater',
    'W.window': 'Wheelcraft: races counted', 'W.recency': 'Wheelcraft: weight drop per older race', 'W.rampRaces': 'Races to full strength', 'W.rampFloor': 'Strength at first race', 'W.floorClean': 'Clean % worth zero',
    'W.penaltyHit': 'Hit per race penalty', 'W.invalidHit': 'Hit for track-limit laps', 'W.dnfHit': 'Hit for not finishing', 'W.pitHit': 'Hit for missed pit stop', 'W.finishFraction': 'Share of laps to count as finished',
    'L.finishPts': 'Laps: points per finish', 'L.finishCap': 'Finish points cap', 'L.streakPts': 'Points per night in a streak', 'L.streakCap': 'Streak points cap', 'L.attendMax': 'Season attendance points', 'L.attendFull': 'Attendance for full points', 'L.seasonPts': 'Points per season raced', 'L.seasonCap': 'Seasons points cap', 'L.milestoneRaces': 'Milestone: races', 'L.milestonePts': 'Milestone: points'
  };
  function flatTune(t) { const o = {}; Object.keys(t).forEach((k) => { if (typeof t[k] === 'object') Object.keys(t[k]).forEach((kk) => { if (kk !== 'max') o[k + '.' + kk] = t[k][kk]; }); else o[k] = t[k]; }); return o; }
  async function renderAdmin() {
    const root = $('ratingAdminRoot'); if (!root) return;
    if (!token()) { root.innerHTML = '<div class="rt-page"><div class="rt-empty">Log in first.</div></div>'; return; }
    root.innerHTML = '<div class="rt-page"><div class="rt-empty">Loading…</div></div>';
    let r; try { r = await call('ratingSettingsGet'); } catch (e) { root.innerHTML = '<div class="rt-page"><div class="rt-empty">' + esc(e.status === 403 ? 'These controls are for the Owner only.' : e.message) + '</div></div>'; return; }
    const s = r.settings, flat = flatTune(s.tune), defFlat = flatTune(r.defaults.tune);
    const mode = (v, t, sm) => '<label class="rt-mode' + (s.mode === v ? ' on' : '') + '"><input type="radio" name="rtMode" value="' + v + '"' + (s.mode === v ? ' checked' : '') + '><b>' + t + '</b><small>' + sm + '</small></label>';
    root.innerHTML = '<div class="rt-page"><div class="rt-top"><h2>Driver rating controls</h2><p>Owner only. Changes apply within a few minutes.</p></div>'
      + '<div class="rt-card"><h3>Switch</h3><div class="rt-adm"><div class="rt-modes">' + mode('off', 'Off', 'Nobody sees anything.') + mode('test', 'Test', 'Only you see it, so you can check the numbers.') + mode('live', 'Live', 'Every driver sees their own page and everyone’s number.') + '</div>'
      + '<label>Name drivers see<input id="rtAName" maxlength="40" value="' + esc(s.name) + '"></label>'
      + '<div class="rt-tune"><label>Counts from (date)<input id="rtAStart" type="date" value="' + esc(s.startDate) + '"></label><label>Start label<input id="rtALabel" maxlength="40" value="' + esc(s.startLabel) + '"></label><label>Races before the number shows<input id="rtABuild" type="number" min="0" max="30" value="' + s.buildingRaces + '"></label></div>'
      + '<label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0"><input id="rtAShared" type="checkbox"' + (s.peerRequireSharedRace ? ' checked' : '') + '> Peer feedback only counts when both drivers shared a race</label>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn teal" id="rtASave" type="button">Save</button><button class="btn" id="rtARefresh" type="button">Recalculate now</button><span class="rt-status" id="rtAS"></span></div></div></div>'
      + '<div class="rt-card"><h3>Tuning (first guesses – adjust as real data comes in)</h3><details><summary style="cursor:pointer;font-weight:800">Show the numbers</summary><div class="rt-adm"><div class="rt-tune">'
      + Object.keys(flat).map((k) => '<label>' + esc(TUNE_LABELS[k] || k) + '<input data-tune="' + k + '" type="number" step="any" value="' + flat[k] + '" title="Default ' + defFlat[k] + '"></label>').join('')
      + '</div><div><button class="btn" id="rtADef" type="button">Put all numbers back to defaults</button></div></div></details></div>'
      + '<div class="rt-card"><h3>Preview – where everyone stands right now</h3><div id="rtALB"><p class="rt-empty" style="padding:10px">Loading…</p></div></div></div>';
    root.querySelectorAll('.rt-mode input').forEach((i) => i.addEventListener('change', () => root.querySelectorAll('.rt-mode').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked))));
    $('rtADef').addEventListener('click', () => { root.querySelectorAll('[data-tune]').forEach((i) => { i.value = defFlat[i.dataset.tune]; }); });
    $('rtARefresh').addEventListener('click', async () => { const st = $('rtAS'); st.className = 'rt-status'; st.textContent = 'Recalculating…'; try { await call('ratingRefresh'); await loadBoard(true); st.className = 'rt-status ok'; st.textContent = 'Done'; lb(); } catch (e) { st.className = 'rt-status bad'; st.textContent = e.message; } });
    $('rtASave').addEventListener('click', async () => {
      const st = $('rtAS'); st.className = 'rt-status'; st.textContent = 'Saving…';
      const tune = {}; root.querySelectorAll('[data-tune]').forEach((i) => { const p = i.dataset.tune.split('.'); if (p.length === 1) tune[p[0]] = Number(i.value); else { tune[p[0]] = tune[p[0]] || {}; tune[p[0]][p[1]] = Number(i.value); } });
      try {
        await call('ratingSettingsSave', { mode: (root.querySelector('input[name=rtMode]:checked') || {}).value || 'off', name: $('rtAName').value, startDate: $('rtAStart').value, startLabel: $('rtALabel').value, buildingRaces: Number($('rtABuild').value), peerRequireSharedRace: $('rtAShared').checked, tune });
        st.className = 'rt-status ok'; st.textContent = 'Saved'; await loadBoard(true); applyAll(); lb();
      } catch (e) { st.className = 'rt-status bad'; st.textContent = e.message; }
    });
    async function lb() {
      const host = $('rtALB'); if (!host) return;
      const b = await loadBoard(true);
      if (!b || !b.visible) { host.innerHTML = '<p class="rt-empty" style="padding:10px">Switch it to Test or Live to see numbers here.</p>'; return; }
      const rows = Object.keys(b.ratings).map((id) => ({ id, name: (b.names && b.names[id]) || id, ...b.ratings[id] }));
      const live = rows.filter((x) => !x.b).sort((a, c) => c.s - a.s), bld = rows.filter((x) => x.b);
      const counts = {}; live.forEach((x) => { counts[x.l] = (counts[x.l] || 0) + 1; });
      host.innerHTML = '<p style="margin:0 0 8px;font-size:13px;color:var(--text-muted)">' + live.length + ' with a number, ' + bld.length + ' still building. ' + b.levels.map((l) => esc(l.name) + ': ' + (counts[l.name] || 0)).join(' · ') + '</p>'
        + '<table class="rt-lb"><tr><th>#</th><th>Driver</th><th>Number</th><th>Level</th><th></th></tr>' + live.slice(0, 15).map((x, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(x.name) + '</td><td>' + x.s + '</td><td>' + esc(x.l) + '</td><td><a href="' + PAGE + '?driver=' + encodeURIComponent(x.id) + '">Breakdown</a></td></tr>').join('') + '</table>';
    }
    lb();
  }

  /* ---------- wiring ---------- */
  function currentView() { const a = document.querySelector('.view-panel.is-active-view'); return a ? a.dataset.view : ''; }
  function render() {
    if ($('ratingRoot') && currentView() === 'rating' && !$('ratingRoot').dataset.done) { $('ratingRoot').dataset.done = '1'; renderRating(); }
    if ($('ratingAdminRoot') && currentView() === 'ratingAdmin' && !$('ratingAdminRoot').dataset.done) { $('ratingAdminRoot').dataset.done = '1'; renderAdmin(); }
  }
  async function boot() {
    if (!token()) { board = null; applyAll(); return; }
    await loadBoard(); applyAll(); watchDirectory(); render();
  }
  window.IFWL_Rating = { refresh: boot, board: () => board };
  window.addEventListener('ifwl-auth-changed', () => { setTimeout(boot, 0); });
  document.addEventListener('click', (ev) => { const t = ev.target.closest && ev.target.closest('[data-view="rating"],[data-view="ratingAdmin"]'); if (t) setTimeout(render, 60); });
  // the licence card and directory are drawn after login by the main script - re-apply when they appear
  const mo = new MutationObserver(() => { if (visible()) { applyCard(); } });
  document.addEventListener('DOMContentLoaded', () => { const c = $('licenceCardStats'); if (c) mo.observe(c.parentNode || document.body, { childList: true }); watchDirectory(); });
  if (document.readyState !== 'loading') { watchDirectory(); }
  setTimeout(boot, 800); setTimeout(() => { if (token() && !board) boot(); }, 3500);
  setInterval(() => { if (!document.hidden && token() && visible()) loadBoard(true).then(applyAll); }, 180000);
  setInterval(render, 700);
})();
