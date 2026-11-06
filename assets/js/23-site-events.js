/* ============================================================
   SITE EVENTS - races that are not on SimGrid.
   Driver side: [data-siteevents]        (Available Races) - sign up, pick a car, withdraw.
   Staff side:  [data-siteevents-staff]  (Staff > Site Events) - create events, see entries,
                build bop.json + entrylist.json from the sign-ups (Dynamic BoP file builder).
   Needs rtGate: siteEvents*, staffSiteEvent*, staffDynBopFiles (rtgate.js).
   ============================================================ */
(() => {
  'use strict';
  if (window.IFWL_SiteEvents) return;
  (window.IFWL_FILES = window.IFWL_FILES || {})['23-site-events.js'] = 's1';
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const fmt = (ms) => { if (!(ms > 0)) return ''; try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch (e) { return ''; } };
  const toLocalInput = (ms) => { if (!(ms > 0)) return ''; const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  const fromLocalInput = (v) => { if (!v) return 0; const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; };
  async function api(name, body) {
    const t = token(); if (!t) throw new Error('Please log in first');
    const r = await fetch(FN + '?' + name + '=1&token=' + encodeURIComponent(t), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'GET' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || ('Request failed (' + r.status + ')')); e.data = d; throw e; }
    return d;
  }
  const CSS = '.se-box{border:1px solid var(--ifwl-line,#dde3ec);border-radius:12px;padding:14px;margin:12px 0}'
    + '.se-h{display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;justify-content:space-between}'
    + '.se-title{font-weight:800;font-size:16px}.se-sm{font-size:12px;opacity:.75}.se-chip{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid currentColor;margin-left:6px}'
    + '.se-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}'
    + '.se-in{border:2px solid var(--ifwl-line,#dde3ec);border-radius:8px;padding:6px 8px;background:var(--surface,#fff);color:inherit;font:inherit;box-sizing:border-box}'
    + '.se-in.sm{width:84px}.se-in.wide{width:100%}textarea.se-in{min-height:60px}'
    + '.se-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.se-grid label{display:block;font-size:12px;margin-bottom:3px}'
    + '.se-good{color:#13a56b;font-weight:700}.se-bad{color:#d92d20;font-weight:700}.se-warn{color:#b86e00}'
    + '.se-t{border-collapse:collapse;width:100%;font-size:13px}.se-t th,.se-t td{padding:5px 8px;border-bottom:1px solid var(--ifwl-line,#dde3ec);text-align:left;white-space:nowrap}.se-t th{font-size:11px;text-transform:uppercase;opacity:.7}.se-wrap{overflow-x:auto}'
    + '.se-checks{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:13px}.se-checks label{display:inline-flex;gap:4px;align-items:center;margin:0}'
    + '.se-pre{max-height:140px;overflow:auto;background:rgba(127,127,127,.12);border-radius:8px;padding:8px;font-size:11px;white-space:pre-wrap}';
  let cssDone = false; const ensureCss = () => { if (cssDone) return; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; };

  // ACC reads its json files as UTF-16 little-endian with a byte-order mark
  function utf16Blob(obj) {
    const text = JSON.stringify(obj, null, 2); const buf = new Uint8Array(2 + text.length * 2); buf[0] = 0xFF; buf[1] = 0xFE;
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); buf[2 + i * 2] = c & 255; buf[3 + i * 2] = c >> 8; }
    return new Blob([buf], { type: 'application/json' });
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

  /* ======================= DRIVER ======================= */
  function mountDriver(root) {
    if (root.__se) return; root.__se = true; ensureCss();
    const S = { events: null, msg: {}, busy: false };
    async function load() { try { S.events = (await api('siteEventsList')).events; } catch (e) { S.events = null; root.innerHTML = ''; return; } render(); }
    function card(e) {
      const m = e.mine, msg = S.msg[e.id];
      let h = '<div class="se-box" data-ev="' + esc(e.id) + '"><div class="se-h"><div><span class="se-title">' + esc(e.title) + '</span><span class="se-chip">' + (e.platform === 'pc' ? 'PC' : 'Console') + '</span><span class="se-chip">Sign up on the site</span></div>'
        + '<div class="se-sm">' + e.entryCount + (e.maxEntries ? ' / ' + e.maxEntries : '') + ' entered' + (e.closed ? ' &middot; <b>closed</b>' : (e.closesAtMs ? ' &middot; closes ' + esc(fmt(e.closesAtMs)) : '')) + '</div></div>'
        + '<div class="se-sm" style="margin-top:4px">' + [e.eventDateLabel || fmt(e.eventDateMs), e.track && ('Track: ' + e.track), e.serverName && ('Server: ' + e.serverName)].filter(Boolean).map(esc).join(' &middot; ') + '</div>'
        + (e.notes ? '<div style="margin-top:6px;font-size:13px">' + esc(e.notes) + '</div>' : '');
      if (m) h += '<div class="se-row"><span class="se-good">You are entered: #' + m.raceNumber + ' &middot; ' + esc(m.carName) + '</span></div>';
      if (e.canJoin || m) {
        h += '<div class="se-row"><select class="se-in" data-f="car">' + (e.cars || []).map((c) => '<option value="' + esc(c.id) + '"' + (m && m.carId === c.id ? ' selected' : '') + '>' + esc(c.carClass + ' - ' + c.name) + '</option>').join('') + '</select>'
          + '<input class="se-in sm" data-f="num" type="number" min="1" max="999" placeholder="Race #" value="' + esc(m ? m.raceNumber : (e.suggestedNumber || '')) + '" title="Your race number">'
          + (e.needConsoleChoice ? '<select class="se-in" data-f="console"><option value="">Xbox or PlayStation?</option><option value="xbox">Xbox</option><option value="ps">PlayStation</option></select>' : '')
          + '<button class="btn" data-a="join"' + (S.busy ? ' disabled' : '') + '>' + (m ? 'Update my entry' : 'Sign up') + '</button>'
          + (m ? '<button class="btn ghost" data-a="leave"' + (S.busy ? ' disabled' : '') + '>Withdraw</button>' : '') + '</div>';
      } else h += '<div class="se-row se-warn">' + esc(e.whyNot || 'You cannot sign up for this event.') + '</div>';
      if (msg) h += '<div class="' + (msg.err ? 'se-bad' : 'se-good') + '" style="margin-top:6px">' + esc(msg.t) + '</div>';
      if (e.entrants && e.entrants.length) h += '<details style="margin-top:8px"><summary class="se-sm" style="cursor:pointer">Who is entered (' + e.entrants.length + ')</summary><div class="se-sm" style="margin-top:4px">'
        + e.entrants.map((x) => '#' + esc(x.raceNumber) + ' ' + esc(x.name) + ' &middot; ' + esc(x.carName)).join('<br>') + '</div></details>';
      return h + '</div>';
    }
    function render() {
      if (!S.events || !S.events.length) { root.innerHTML = ''; return; }
      root.innerHTML = '<div class="se-sm" style="font-weight:800;letter-spacing:.06em;margin:6px 0">SIGN-UP EVENTS</div>' + S.events.map(card).join('');
    }
    root.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b || S.busy) return;
      const box = b.closest('[data-ev]'), id = box.dataset.ev, a = b.dataset.a;
      S.busy = true;
      try {
        if (a === 'join') {
          const body = { eventId: id, carId: box.querySelector('[data-f=car]').value, raceNumber: Number(box.querySelector('[data-f=num]').value) || 0 };
          const cs = box.querySelector('[data-f=console]'); if (cs) body.consoleType = cs.value;
          const r = await api('siteEventSignup', body);
          S.msg[id] = { t: 'You are in: #' + r.entry.raceNumber + ' ' + r.entry.carName + '.', err: false };
        } else if (a === 'leave') {
          if (!confirm('Withdraw from this event?')) { S.busy = false; return; }
          await api('siteEventWithdraw', { eventId: id }); S.msg[id] = { t: 'You have withdrawn.', err: false };
        }
      } catch (e) { S.msg[id] = { t: e.message, err: true }; }
      S.busy = false; await load();
    });
    load();
  }

  /* ======================= STAFF ======================= */
  function mountStaff(root) {
    if (root.__ses) return; root.__ses = true; ensureCss();
    const S = { d: null, msg: '', err: false, busy: false, editing: null, build: {} };
    const say = (m, e) => { S.msg = m; S.err = !!e; render(); };
    async function load() { try { S.d = await api('staffSiteEventList'); S.msg = ''; } catch (e) { S.msg = e.message; S.err = true; } render(); }
    function form() {
      const ed = S.editing || {}, d = S.d;
      return '<div class="se-box"><b>' + (ed.id ? 'Edit event' : 'New sign-up event') + '</b><div class="se-sm">For races that are not on SimGrid. Drivers sign up on the Available Races page and choose their car.</div>'
        + '<div class="se-grid" style="margin-top:10px">'
        + '<div><label>Title</label><input class="se-in wide" id="seTitle" value="' + esc(ed.title || '') + '" placeholder="Dynamic BoP test"></div>'
        + '<div><label>Series (sets platform + BoP)</label><select class="se-in wide" id="seSeries">' + d.series.map((s) => '<option value="' + esc(s.id) + '"' + (ed.seriesId === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('') + '</select></div>'
        + '<div><label>Track (optional now, needed to build files)</label><input class="se-in wide" id="seTrack" value="' + esc(ed.track || '') + '" placeholder="monza"></div>'
        + '<div><label>Race date/time (your time)</label><input class="se-in wide" id="seDate" type="datetime-local" value="' + esc(toLocalInput(ed.eventDateMs)) + '"></div>'
        + '<div><label>Sign-ups close (optional)</label><input class="se-in wide" id="seCloses" type="datetime-local" value="' + esc(toLocalInput(ed.closesAtMs)) + '"></div>'
        + '<div><label>Max entries</label><input class="se-in wide" id="seMax" type="number" min="2" max="120" value="' + esc(ed.maxEntries || 40) + '"></div>'
        + '<div><label>Server name drivers search for</label><input class="se-in wide" id="seServer" value="' + esc(ed.serverName || '') + '"></div></div>'
        + '<div style="margin-top:10px"><label class="se-sm">Notes shown to drivers</label><textarea class="se-in wide" id="seNotes">' + esc(ed.notes || '') + '</textarea></div>'
        + '<div style="margin-top:10px"><div class="se-sm">Licence tiers allowed (none ticked = any licence)</div><div class="se-checks" id="seTiers">' + d.tierNames.map((t) => '<label><input type="checkbox" value="' + esc(t) + '"' + ((ed.tiers || []).indexOf(t) >= 0 ? ' checked' : '') + '>' + esc(t) + '</label>').join('') + '</div></div>'
        + '<details style="margin-top:10px"><summary class="se-sm" style="cursor:pointer">Limit the cars (none ticked = every GT3 and GT4 car)</summary><div class="se-checks" id="seCars" style="margin-top:6px">' + d.catalog.map((c) => '<label><input type="checkbox" value="' + esc(c.id) + '"' + ((ed.carIds || []).indexOf(c.id) >= 0 ? ' checked' : '') + '>' + esc(c.carClass + ' ' + c.name) + '</label>').join('') + '</div></details>'
        + '<div class="se-row"><label><input type="checkbox" id="seOpen"' + (ed.open === false ? '' : ' checked') + '> Sign-ups open</label>'
        + '<button class="btn" data-a="save"' + (S.busy ? ' disabled' : '') + '>' + (ed.id ? 'Save changes' : 'Create event') + '</button>' + (ed.id ? '<button class="btn ghost" data-a="cancel">Cancel</button>' : '') + '</div></div>';
    }
    function evBox(e) {
      const B = S.build[e.id] || {};
      const rows = (e.entries || []).map((x) => '<tr><td>#' + esc(x.raceNumber) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.carClass + ' ' + x.carName) + '</td><td>' + esc(x.tier) + '</td><td>' + esc(x.category) + '</td><td class="se-sm">' + esc(x.playerID) + '</td><td><button class="btn ghost" data-a="rm" data-d="' + esc(x.driverId) + '" style="font-size:11px">Remove</button></td></tr>').join('');
      return '<div class="se-box" data-ev="' + esc(e.id) + '"><div class="se-h"><div><span class="se-title">' + esc(e.title) + '</span><span class="se-chip">' + (e.platform === 'pc' ? 'PC' : 'Console') + '</span><span class="se-chip">' + esc(e.seriesId) + '</span>' + (e.open ? '' : '<span class="se-chip">closed</span>') + '</div>'
        + '<div class="se-sm">' + (e.entries || []).length + (e.maxEntries ? ' / ' + e.maxEntries : '') + ' entered</div></div>'
        + '<div class="se-wrap" style="margin-top:8px">' + (rows ? '<table class="se-t"><thead><tr><th>#</th><th>Driver</th><th>Car</th><th>Licence</th><th>Cat</th><th>Player ID</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div class="se-sm">Nobody has signed up yet.</div>') + '</div>'
        + '<div class="se-row"><button class="btn ghost" data-a="edit">Edit</button><button class="btn ghost" data-a="toggle">' + (e.open ? 'Close sign-ups' : 'Reopen sign-ups') + '</button><button class="btn ghost" data-a="del">Delete event</button></div>'
        + '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--ifwl-line,#dde3ec)"><b>Build the files</b><div class="se-sm">bop.json uses this series\' current dynamic BoP. entrylist.json uses these sign-ups, each driver locked to the car they chose.</div>'
        + '<div class="se-row"><input class="se-in" data-f="track" placeholder="Track (e.g. monza)" value="' + esc(B.track || e.track || '') + '"><label class="se-sm"><input type="checkbox" data-f="draft"' + (B.draft ? ' checked' : '') + '> use the latest unapproved draft BoP</label>'
        + '<button class="btn" data-a="build"' + (S.busy || !(e.entries || []).length ? ' disabled' : '') + '>Build bop.json + entrylist.json</button></div>'
        + (B.res ? '<div class="se-row"><button class="btn" data-a="dlbop">Download bop.json</button><button class="btn" data-a="dlel">Download entrylist.json</button><span class="se-sm">' + B.res.entrylist.entries.length + ' entries &middot; ' + B.res.carsMoved + ' car model(s) with BoP changes &middot; BoP from ' + esc(B.res.offsetsFrom) + '</span></div>'
          + (B.res.warnings && B.res.warnings.length ? '<div class="se-pre se-warn" style="margin-top:6px">' + B.res.warnings.map(esc).join('\n') + '</div>' : '') : '')
        + (B.err ? '<div class="se-bad" style="margin-top:6px">' + esc(B.err) + '</div>' : '') + '</div></div>';
    }
    function render() {
      if (!S.d) { root.innerHTML = S.msg ? '<div class="se-bad">' + esc(S.msg) + '</div>' : '<div class="se-sm">Loading&hellip;</div>'; return; }
      root.innerHTML = (S.msg ? '<div class="' + (S.err ? 'se-bad' : 'se-good') + '">' + esc(S.msg) + '</div>' : '') + form() + (S.d.events.length ? S.d.events.map(evBox).join('') : '<div class="se-box se-sm">No sign-up events yet.</div>');
    }
    root.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b || S.busy) return; const a = b.dataset.a;
      const box = b.closest('[data-ev]'), id = box && box.dataset.ev, e = id && S.d.events.find((x) => x.id === id);
      try {
        if (a === 'cancel') { S.editing = null; render(); return; }
        if (a === 'edit') { S.editing = e; render(); root.scrollIntoView({ behavior: 'smooth' }); return; }
        if (a === 'save') {
          const val = (i) => root.querySelector('#' + i).value;
          const checked = (sel) => Array.from(root.querySelectorAll(sel + ' input:checked')).map((c) => c.value);
          S.busy = true; render();
          await api('staffSiteEventSave', { eventId: S.editing && S.editing.id, title: val('seTitle'), seriesId: val('seSeries'), track: val('seTrack'), eventDateMs: fromLocalInput(val('seDate')), eventDateLabel: '', closesAtMs: fromLocalInput(val('seCloses')), maxEntries: Number(val('seMax')), serverName: val('seServer'), notes: val('seNotes'), tiers: checked('#seTiers'), carIds: checked('#seCars'), open: root.querySelector('#seOpen').checked });
          S.editing = null; S.busy = false; await load(); say('Saved.', false); return;
        }
        if (a === 'toggle') { S.busy = true; await api('staffSiteEventSave', { eventId: id, title: e.title, seriesId: e.seriesId, track: e.track, eventDateMs: e.eventDateMs, maxEntries: e.maxEntries, closesAtMs: e.closesAtMs, serverName: e.serverName, notes: e.notes, tiers: e.tiers, carIds: e.carIds, open: !e.open }); S.busy = false; await load(); return; }
        if (a === 'del') { if (!confirm('Delete "' + e.title + '" and all its sign-ups?')) return; S.busy = true; await api('staffSiteEventDelete', { eventId: id }); S.busy = false; await load(); return; }
        if (a === 'rm') { if (!confirm('Remove this driver from the event?')) return; S.busy = true; await api('staffSiteEventEntryRemove', { eventId: id, driverId: b.dataset.d }); S.busy = false; await load(); return; }
        if (a === 'build') {
          const track = box.querySelector('[data-f=track]').value.trim(), draft = box.querySelector('[data-f=draft]').checked;
          S.build[id] = { track, draft }; S.busy = true;
          try {
            S.build[id].res = await api('staffDynBopFiles', { seriesId: e.seriesId, track, previewDraft: draft, lockCars: true, entries: (e.entries || []).map((x) => ({ raceNumber: x.raceNumber, name: x.name, playerID: x.playerID, car: x.carName, category: x.category })) });
          } catch (er) { S.build[id].err = er.message; }
          S.busy = false; render(); return;
        }
        if (a === 'dlbop') download(utf16Blob(S.build[id].res.bop), 'bop.json');
        if (a === 'dlel') download(utf16Blob(S.build[id].res.entrylist), 'entrylist.json');
      } catch (er) { S.busy = false; say(er.message, true); }
    });
    load();
  }

  function boot() {
    document.querySelectorAll('[data-siteevents]').forEach((el) => { if (!el.__se && token()) mountDriver(el); });
    document.querySelectorAll('[data-siteevents-staff]').forEach((el) => {
      if (el.__ses || el.__sesWatch || !token()) return; el.__sesWatch = true;
      if ('IntersectionObserver' in window) { const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); mountStaff(el); } }); io.observe(el); } else mountStaff(el);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('ifwl-auth-changed', boot);
  window.IFWL_SiteEvents = { boot };
})();
