/* ============================================================
   DYNAMIC BoP (Season 5 Monday Funday) - Staff page.
   Reads each car model's share of the front vs share of the grid from the latest race results,
   proposes ballast / restrictor changes, lets staff tweak them, the Owner approves, then builds
   bop.json + entrylist.json (PC and Console formats) ready to upload to the servers.
   Needs: rtGate ?staffDynBop* endpoints (rtgate.js).
   window.IFWL_DynBop = { mount }
   ============================================================ */
(() => {
  'use strict';
  if (window.IFWL_DynBop) return;
  (window.IFWL_FILES = window.IFWL_FILES || {})['21-dynamic-bop.js'] = 'd1';
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const fmt = (ms) => { if (!(ms > 0)) return '-'; try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch (_) { return new Date(ms).toISOString(); } };
  const pct = (x) => (x * 100).toFixed(0) + '%';
  const sgn = (n, u) => { n = Number(n) || 0; return (n > 0 ? '+' : '') + (Math.round(n * 10) / 10) + u; };

  async function api(name, opts) {
    opts = opts || {};
    const t = token(); if (!t) throw new Error('Please log in first');
    const url = FN + '?' + name + '=1&token=' + encodeURIComponent(t);
    const init = opts.body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts.body) } : { method: 'GET' };
    const r = await fetch(url, init);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || ('Request failed (' + r.status + ')')); e.data = d; e.status = r.status; throw e; }
    return d;
  }

  const CSS = '.db-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}'
    + '.db-tab{border:2px solid var(--ifwl-line,#dde3ec);background:transparent;color:inherit;border-radius:99px;padding:6px 14px;font:inherit;font-weight:700;cursor:pointer}'
    + '.db-tab.on{background:var(--teal,#0aa);border-color:var(--teal,#0aa);color:#fff}'
    + '.db-box{border:1px solid var(--ifwl-line,#dde3ec);border-radius:12px;padding:14px;margin:12px 0}'
    + '.db-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}'
    + '.db-in{border:2px solid var(--ifwl-line,#dde3ec);border-radius:8px;padding:6px 8px;background:var(--surface,#fff);color:inherit;font:inherit;box-sizing:border-box}'
    + '.db-in.sm{width:74px}.db-in.wide{width:100%}textarea.db-in{min-height:90px;font-family:monospace;font-size:12px}'
    + '.db-sm{font-size:12px;opacity:.75}.db-up{color:#d92d20;font-weight:700}.db-down{color:#13a56b;font-weight:700}.db-warn{color:#b86e00}'
    + '.db-wrap{overflow-x:auto}.db-t{border-collapse:collapse;width:100%;font-size:13px}'
    + '.db-t th,.db-t td{padding:6px 8px;border-bottom:1px solid var(--ifwl-line,#dde3ec);text-align:left;white-space:nowrap}'
    + '.db-t td.why{white-space:normal;min-width:180px;font-size:12px;opacity:.85}.db-t th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.7}'
    + '.db-bar{display:inline-block;height:8px;border-radius:4px;vertical-align:middle}'
    + '.db-cls{margin:14px 0 4px;font-weight:800;letter-spacing:.06em}'
    + '.db-pre{max-height:240px;overflow:auto;background:rgba(127,127,127,.12);border-radius:8px;padding:8px;font-size:11px;white-space:pre}'
    + '.db-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.db-grid label{display:block;font-size:12px;margin-bottom:3px}'
    + '.db-chip{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid currentColor}';
  let cssDone = false;
  const ensureCss = () => { if (cssDone) return; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; };

  // ACC reads its json files as UTF-16 little-endian with a byte-order mark
  function utf16Blob(obj) {
    const text = JSON.stringify(obj, null, 2);
    const buf = new Uint8Array(2 + text.length * 2);
    buf[0] = 0xFF; buf[1] = 0xFE;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); buf[2 + i * 2] = c & 255; buf[3 + i * 2] = c >> 8; }
    return new Blob([buf], { type: 'application/json' });
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function parseCsvLine(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === ',' || c === '\t') { out.push(cur.trim()); cur = ''; } else cur += c;
    }
    out.push(cur.trim()); return out;
  }
  // pasted list: Name, Player ID, Car, Race number, Category (0 bronze / 1 silver / 3 platinum) - header row optional
  function parsePasted(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    let head = null, start = 0;
    const first = parseCsvLine(lines[0]).map((x) => x.toLowerCase());
    if (first.some((x) => /name|player|steam|car|number/.test(x))) { head = first; start = 1; }
    const idx = (re, d) => { if (!head) return d; const i = head.findIndex((x) => re.test(x)); return i >= 0 ? i : d; };
    const iN = idx(/name/, 0), iP = idx(/player|steam|psn|xbox|id/, 1), iC = idx(/car(?!.*num)|model/, 2), iR = idx(/num|#|race/, 3), iK = idx(/cat/, 4);
    return lines.slice(start).map((l) => { const c = parseCsvLine(l); return { name: c[iN] || '', playerID: c[iP] || '', car: c[iC] || '', raceNumber: c[iR] || '', category: c[iK] === undefined || c[iK] === '' ? 0 : Number(c[iK]) }; }).filter((e) => e.name);
  }

  function mount(root) {
    if (!root || root.__db) return;
    ensureCss();
    const S = { data: null, sid: '', busy: false, files: null, msg: '', err: false, showCfg: false };
    root.__db = S;
    const say = (m, bad) => { S.msg = m || ''; S.err = !!bad; const el = root.querySelector('.db-msg'); if (el) { el.textContent = S.msg; el.style.color = bad ? '#d92d20' : '#13a56b'; } };
    const cur = () => (S.data.series.find((s) => s.id === S.sid) || S.data.series[0]);

    async function load() {
      try {
        S.data = await api('staffDynBopOverview');
        if (!S.sid || !S.data.series.some((s) => s.id === S.sid)) S.sid = (S.data.series[0] || {}).id || '';
        render();
      } catch (e) { root.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
    }

    function rowsTable(rows, editable) {
      const byClass = {};
      rows.forEach((r) => { (byClass[r.carClass || 'Other'] = byClass[r.carClass || 'Other'] || []).push(r); });
      return Object.keys(byClass).sort().map((cls) => {
        const body = byClass[cls].map((r) => {
          const move = (r.ballastKg !== r.prevBallastKg || r.restrictorPct !== r.prevRestrictorPct);
          const dirCls = r.steps > 0 ? 'db-up' : r.steps < 0 ? 'db-down' : '';
          const w = Math.min(60, Math.abs(r.edge) * 200);
          const bar = '<span class="db-bar" style="width:' + w + 'px;background:' + (r.edge >= 0 ? '#d92d20' : '#13a56b') + '"></span> <span class="db-sm">' + (r.edge >= 0 ? '+' : '') + (r.edge * 100).toFixed(0) + ' pts</span>';
          const prop = editable && r.known
            ? '<input class="db-in sm" type="number" step="0.5" data-kg="' + esc(r.carId) + '" value="' + r.ballastKg + '"> kg <input class="db-in sm" type="number" step="0.5" data-pc="' + esc(r.carId) + '" value="' + r.restrictorPct + '"> %'
            : '<b class="' + dirCls + '">' + sgn(r.ballastKg, ' kg') + ' / ' + sgn(r.restrictorPct, '%') + '</b>';
          return '<tr><td><b>' + esc(r.name) + '</b>' + (r.manual ? ' <span class="db-chip">edited</span>' : '') + '</td>'
            + '<td>' + r.starts + '</td><td>' + pct(r.gridShare) + '</td><td>' + pct(r.frontShare) + '</td><td>' + r.wins + '</td><td>' + bar + '</td>'
            + '<td>' + sgn(r.prevBallastKg, ' kg') + ' / ' + sgn(r.prevRestrictorPct, '%') + '</td><td>' + prop + (move ? '' : ' <span class="db-sm">no change</span>') + '</td>'
            + '<td class="why">' + esc(r.reason) + '</td></tr>';
        }).join('');
        return '<div class="db-cls">' + esc(cls) + '</div><div class="db-wrap"><table class="db-t"><thead><tr><th>Car</th><th>Starts</th><th>On grid</th><th>At front</th><th>Wins</th><th>Edge</th><th>Live now</th><th>' + (editable ? 'Proposed (editable)' : 'Result') + '</th><th>Why</th></tr></thead><tbody>' + body + '</tbody></table></div>';
      }).join('');
    }

    function liveTable(s) {
      const ids = Object.keys(s.offsets || {});
      if (!ids.length) return '<div class="db-sm">Everyone is on the standard BoP right now.</div>';
      const name = (id) => { const c = (S.data.catalog || []).find((x) => x.id === id); return c ? c.name : id; };
      return '<div class="db-wrap"><table class="db-t"><thead><tr><th>Car</th><th>Ballast</th><th>Restrictor</th></tr></thead><tbody>'
        + ids.map((id) => '<tr><td><b>' + esc(name(id)) + '</b></td><td>' + sgn(s.offsets[id].ballastKg, ' kg') + '</td><td>' + sgn(s.offsets[id].restrictorPct, '%') + '</td></tr>').join('') + '</tbody></table></div>';
    }

    function cfgForm(c) {
      const f = (k, label, step) => '<div><label>' + label + '</label><input class="db-in wide" type="number" step="' + (step || 'any') + '" data-cfg="' + k + '" value="' + c[k] + '"></div>';
      const d = c.seasonStartMs ? new Date(c.seasonStartMs).toISOString().slice(0, 10) : '';
      return '<div class="db-box"><b>Settings</b> <span class="db-sm">(Owner only)</span><div class="db-grid" style="margin-top:8px">'
        + '<div><label>Season 5 start (ignore races before)</label><input class="db-in wide" type="date" data-cfg="seasonStartDate" value="' + d + '"></div>'
        + f('maxRaces', 'Most races to look at', 1) + f('frontFraction', '"The front" = top fraction of class', 0.05) + f('deadband', 'Leave alone if within (0.05 = 5 pts)', 0.01)
        + f('stepPoints', 'Points per extra step', 0.01) + f('maxStepsPerWeek', 'Max steps per update', 1) + f('ballastPerStepKg', 'Ballast per step (kg)', 0.5) + f('restrictorPerStepPct', 'Restrictor per step (%)', 0.5)
        + f('maxOffsetKg', 'Max ballast away from standard (kg)', 1) + f('maxOffsetPct', 'Max restrictor away from standard (%)', 1) + f('minStartsUp', 'Min starts before a car can go UP', 1) + f('minStartsDown', 'Min starts before a car can go DOWN', 1)
        + f('absBallastMin', 'Lowest ballast allowed (kg)', 1) + f('absBallastMax', 'Highest ballast allowed (kg)', 1)
        + '</div><label style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" data-cfg="easeBack"' + (c.easeBack ? ' checked' : '') + '> Ease cars back toward standard once they are balanced</label>'
        + '<div class="db-row"><button class="btn teal" data-act="cfgSave" type="button">Save settings</button></div></div>';
    }

    function render() {
      const D = S.data, s = cur(); if (!s) { root.innerHTML = '<div class="empty">No series configured.</div>'; return; }
      const draft = s.draft && s.draft.status === 'draft' ? s.draft : null;
      const last = s.draft && s.draft.status === 'published' ? s.draft : null;
      const tabs = '<div class="db-tabs">' + D.series.map((x) => '<button type="button" class="db-tab' + (x.id === S.sid ? ' on' : '') + '" data-sid="' + esc(x.id) + '">' + esc(x.label) + '</button>').join('') + '</div>';
      const status = '<div class="db-box"><div><b>' + esc(s.label) + '</b> &middot; ' + (s.platform === 'console' ? 'Console' : 'PC') + ' IDs &middot; BoP last made live: <b>' + fmt(s.publishedAtMs) + '</b>' + (s.publishedBy ? ' by ' + esc(s.publishedBy) : '') + '</div>'
        + '<div class="db-sm" style="margin-top:4px">' + (s.newRaceFiles == null ? 'Could not check for new races.' : s.newRaceFiles + ' new race file' + (s.newRaceFiles === 1 ? '' : 's') + ' since then.') + ' Standard BoP source: ' + esc(D.bopName || 'BOP TRACKer upload') + '.</div>'
        + '<div class="db-row"><button class="btn teal" data-act="draft" type="button"' + (S.busy ? ' disabled' : '') + '>Build this week\'s update</button>'
        + (D.canPublish ? '<button class="btn ghost" data-act="reset" type="button">Reset to standard BoP</button>' : '')
        + '<button class="btn ghost" data-act="cfgToggle" type="button">Settings</button><span class="db-msg db-sm"></span></div></div>';
      let main = '';
      if (draft) {
        main = '<div class="db-box"><b>Proposed update</b> <span class="db-chip">draft</span> <span class="db-sm">built ' + fmt(draft.createdAtMs) + ' from ' + draft.races.length + ' race' + (draft.races.length === 1 ? '' : 's') + ': ' + draft.races.map((r) => esc((r.track || 'race').replace(/_/g, ' ')) + ' ' + fmt(r.tsMs).split(',')[0]).join(', ') + '</span>'
          + (draft.notes || []).map((n) => '<div class="db-warn db-sm" style="margin-top:6px">' + esc(n) + '</div>').join('')
          + '<div class="db-sm" style="margin-top:6px"><b>Edge</b> = share of the front minus share of the grid (red = dominating, green = lagging). Nothing goes live until it is approved.</div>'
          + rowsTable(draft.rows, true)
          + '<div class="db-row"><button class="btn ghost" data-act="saveTweaks" type="button">Save my changes</button>'
          + (D.canPublish ? '<button class="btn teal" data-act="publish" type="button">Approve &amp; make live</button>' : '<span class="db-sm">Waiting for the Owner to approve.</span>') + '</div></div>';
      } else {
        main = '<div class="db-box"><b>Live BoP changes</b> <span class="db-sm">(on top of the standard BoP)</span>' + liveTable(s) + '</div>'
          + (last ? '<div class="db-box"><b>Last approved update</b> <span class="db-sm">' + fmt(last.publishedAtMs) + '</span>' + rowsTable(last.rows.filter((r) => r.ballastKg !== r.prevBallastKg || r.restrictorPct !== r.prevRestrictorPct), false) + '</div>' : '');
      }
      const tracks = D.tracks || [];
      const files = '<div class="db-box"><b>Build the files for this week\'s race</b>'
        + '<div class="db-grid" style="margin-top:8px"><div><label>Track</label>' + (tracks.length ? '<select class="db-in wide" id="dbTrack"><option value="">Choose a track</option>' + tracks.map((t) => '<option>' + esc(t) + '</option>').join('') + '</select>' : '<input class="db-in wide" id="dbTrack" placeholder="e.g. monza">') + '</div>'
        + '<div><label>Entry list source</label><select class="db-in wide" id="dbSrc"><option value="snap">' + (s.snapshot ? 'Latest saved list: ' + esc(s.snapshot.label || fmt(s.snapshot.capturedAtMs)) + ' (' + s.snapshot.count + ' drivers)' : 'No saved list yet') + '</option><option value="paste">Paste a list</option><option value="none">BoP file only</option></select></div></div>'
        + '<div id="dbPasteWrap" style="display:none;margin-top:8px"><label class="db-sm">One driver per line: Name, Player ID, Car, Race number, Category</label><textarea class="db-in wide" id="dbPaste" placeholder="Liam Smith, 76561198000001000, BMW M4 GT3, 7, 3"></textarea></div>'
        + '<div class="db-row"><label><input type="checkbox" id="dbLock"> Lock each driver to their listed car</label>'
        + (draft ? '<label><input type="checkbox" id="dbPrev"> Use the unapproved draft (preview)</label>' : '') + '</div>'
        + '<div class="db-row"><button class="btn teal" data-act="files" type="button">Build files</button></div><div id="dbFiles">' + filesHtml() + '</div></div>';
      root.innerHTML = tabs + status + main + files + (S.showCfg ? cfgForm(D.config) : '');
      const src = root.querySelector('#dbSrc'); if (src) src.addEventListener('change', () => { root.querySelector('#dbPasteWrap').style.display = src.value === 'paste' ? 'block' : 'none'; });
      if (S.msg) say(S.msg, S.err);
    }

    function filesHtml() {
      const F = S.files; if (!F) return '';
      const w = (F.warnings || []).map((x) => '<li>' + esc(x) + '</li>').join('');
      return '<div class="db-sm" style="margin-top:10px">' + esc(F.seriesLabel) + ' &middot; ' + esc(F.track) + ' &middot; ' + F.platform.toUpperCase() + ' IDs &middot; BoP changes from <b>' + esc(F.offsetsFrom) + '</b> (' + F.carsMoved + ' car' + (F.carsMoved === 1 ? '' : 's') + ' moved) &middot; entries from ' + esc(F.source || 'none') + '</div>'
        + (w ? '<div class="db-warn db-sm" style="margin-top:6px"><b>Check these:</b><ul style="margin:4px 0 0 18px">' + w + '</ul></div>' : '')
        + '<div class="db-row"><button class="btn teal" data-act="dlBop" type="button">Download bop.json (' + F.bop.entries.length + ' cars)</button>'
        + (F.entrylist ? '<button class="btn teal" data-act="dlEl" type="button">Download entrylist.json (' + F.entrylist.entries.length + ' drivers)</button>' : '') + '</div>'
        + '<details style="margin-top:8px"><summary class="db-sm">Preview bop.json</summary><div class="db-pre">' + esc(JSON.stringify(F.bop, null, 2)) + '</div></details>'
        + (F.entrylist ? '<details><summary class="db-sm">Preview entrylist.json</summary><div class="db-pre">' + esc(JSON.stringify(F.entrylist, null, 2)) + '</div></details>' : '');
    }

    root.addEventListener('click', async (ev) => {
      const tab = ev.target.closest('[data-sid]'); if (tab) { S.sid = tab.getAttribute('data-sid'); S.files = null; S.msg = ''; render(); return; }
      const b = ev.target.closest('[data-act]'); if (!b || S.busy) return;
      const act = b.getAttribute('data-act'), s = cur();
      S.busy = true; b.disabled = true;
      try {
        if (act === 'cfgToggle') { S.showCfg = !S.showCfg; S.busy = false; render(); return; }
        if (act === 'draft') {
          say('Reading the latest race results...');
          const r = await api('staffDynBopDraft', { body: { seriesId: s.id } });
          if (r.noData) { say(r.message, true); S.busy = false; b.disabled = false; return; }
          s.draft = r.draft; S.msg = 'Draft ready - check the numbers below.'; S.err = false; S.busy = false; render(); return;
        }
        if (act === 'saveTweaks' || act === 'publish') {
          const rows = [...root.querySelectorAll('[data-kg]')].map((el) => { const id = el.getAttribute('data-kg'); const pc = root.querySelector('[data-pc="' + id.replace(/"/g, '') + '"]'); return { carId: id, ballastKg: Number(el.value), restrictorPct: Number(pc ? pc.value : 0) }; });
          const sv = await api('staffDynBopDraftSave', { body: { draftId: s.draft.draftId, rows } });
          s.draft = sv.draft;
          if (act === 'publish') {
            if (!confirm('Make these BoP changes live for ' + s.label + '? They will be used for every file you build from now on.')) { S.busy = false; render(); return; }
            await api('staffDynBopPublish', { body: { draftId: s.draft.draftId } });
            S.msg = 'Approved - the new BoP is live.'; S.err = false; S.busy = false; await load(); return;
          }
          S.msg = 'Saved.'; S.err = false; S.busy = false; render(); return;
        }
        if (act === 'reset') {
          if (!confirm('Put every car in ' + s.label + ' back to the standard BoP?')) { S.busy = false; b.disabled = false; return; }
          await api('staffDynBopReset', { body: { seriesId: s.id } }); S.msg = 'Back to standard BoP.'; S.err = false; S.busy = false; await load(); return;
        }
        if (act === 'cfgSave') {
          const c = Object.assign({}, S.data.config);
          root.querySelectorAll('[data-cfg]').forEach((el) => {
            const k = el.getAttribute('data-cfg');
            if (k === 'easeBack') c.easeBack = el.checked;
            else if (k === 'seasonStartDate') c.seasonStartMs = el.value ? Date.parse(el.value + 'T00:00:00Z') : 0;
            else if (el.value !== '') c[k] = Number(el.value);
          });
          const r = await api('staffDynBopConfigSave', { body: { config: c } }); S.data.config = r.config; S.msg = 'Settings saved.'; S.err = false; S.busy = false; render(); return;
        }
        if (act === 'files') {
          const track = (root.querySelector('#dbTrack') || {}).value || '';
          if (!track.trim()) throw new Error('Pick the track first');
          const srcSel = (root.querySelector('#dbSrc') || {}).value;
          const body = { seriesId: s.id, track: track.trim(), lockCars: !!(root.querySelector('#dbLock') || {}).checked, previewDraft: !!(root.querySelector('#dbPrev') || {}).checked };
          if (srcSel === 'paste') { const list = parsePasted((root.querySelector('#dbPaste') || {}).value); if (!list || !list.length) throw new Error('Paste at least one driver line'); body.entries = list; }
          else if (srcSel === 'none') body.entries = [];
          const r = await api('staffDynBopFiles', { body });
          S.files = r; S.msg = ''; S.busy = false; render(); return;
        }
        if (act === 'dlBop') { download(utf16Blob(S.files.bop), 'bop.json'); }
        if (act === 'dlEl') { download(utf16Blob(S.files.entrylist), 'entrylist.json'); }
      } catch (e) { say(e.message, true); }
      S.busy = false; b.disabled = false;
    });

    load();
    // re-check when the panel is opened again
    let lastLoad = Date.now();
    const visit = () => { if (Date.now() - lastLoad > 60000 && !S.busy) { lastLoad = Date.now(); load(); } };
    if ('IntersectionObserver' in window) new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) visit(); }).observe(root);
  }

  // mount lazily: only when staff actually open the page
  function boot() {
    document.querySelectorAll('[data-dynbop]').forEach((el) => {
      if (el.__db || el.__dbWatch || !token()) return;
      el.__dbWatch = true;
      if ('IntersectionObserver' in window) { const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); mount(el); } }); io.observe(el); }
      else mount(el);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('ifwl-auth-changed', boot);
  window.IFWL_DynBop = { mount };
})();
