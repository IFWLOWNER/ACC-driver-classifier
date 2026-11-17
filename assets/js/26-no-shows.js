/* ============================================================
   NO-SHOWS - Staff page (Owner / Ops Manager).
   Record drivers who did not turn up to an event they were signed up for. Each record costs Integrity in the
   driver's rating (fades over time) and shows on their own profile as an "Attendance record".
   Add one driver or paste a whole list (a copied Discord message full of @mentions works), review the matches,
   record them in one go, undo a whole batch, or remove a single record.
   Needs: rtGate ?staffNoShowFind / Match / Add / Void / Driver / Batches (rtgate.js).
   ============================================================ */
(() => {
  'use strict';
  if (window.IFWL_NoShows) return;
  (window.IFWL_FILES = window.IFWL_FILES || {})['26-no-shows.js'] = 'n1';
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const GAMES = [['', 'Not stated'], ['acc', 'ACC'], ['lmu', 'Le Mans Ultimate'], ['raceroom', 'RaceRoom'], ['acrally', 'AC Rally'], ['rocketleague', 'Rocket League'], ['other', 'Other']];
  const gameLabel = (g) => (GAMES.find((x) => x[0] === g) || [0, g || ''])[1];
  const dayStr = (ms) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms)); } catch (e) { return '-'; } };
  const ago = (ms) => {
    if (!(ms > 0)) return 'never';
    const d = Math.floor((Date.now() - ms) / 86400000);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? d + ' days ago' : d < 365 ? Math.round(d / 30) + ' months ago' : 'over a year ago';
  };
  const ymd = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  async function api(name, opts) {
    const t = token(); if (!t) throw new Error('Please log in first');
    opts = opts || {};
    let url = FN + '?' + name + '=1&token=' + encodeURIComponent(t);
    Object.keys(opts.query || {}).forEach((k) => { url += '&' + k + '=' + encodeURIComponent(opts.query[k]); });
    const r = await fetch(url, opts.body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts.body) } : { method: 'GET' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
    return d;
  }
  const CSS = '.ns-box{border:1px solid var(--ifwl-line,#dde3ec);border-radius:12px;padding:14px;margin:12px 0}'
    + '.ns-box h4{margin:0 0 6px;font-size:15px}'
    + '.ns-row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px}'
    + '.ns-f{display:flex;flex-direction:column;gap:3px;min-width:150px;flex:1}.ns-f label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.7}'
    + '.ns-f input,.ns-f select,.ns-f textarea,.ns-in{font:inherit;font-size:14px;padding:8px 10px;border-radius:8px;border:1px solid var(--ifwl-line,#c9d1dd);background:transparent;color:inherit;width:100%;box-sizing:border-box}'
    + '.ns-f textarea{min-height:110px;resize:vertical}'
    + '.ns-sm{font-size:12px;opacity:.75}.ns-bad{color:#d92d20;font-weight:700}.ns-good{color:#13a56b;font-weight:700}.ns-warn{color:#b86e00;font-weight:700}'
    + '.ns-t{border-collapse:collapse;width:100%;font-size:13px}.ns-t th,.ns-t td{padding:7px 8px;border-bottom:1px solid var(--ifwl-line,#dde3ec);text-align:left;vertical-align:top}'
    + '.ns-t th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.7}.ns-wrap{overflow-x:auto}'
    + '.ns-hit{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--ifwl-line,#dde3ec);border-radius:10px;margin-top:6px}'
    + '.ns-hit .ns-nm{display:block}.ns-pill{display:inline-block;font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid var(--ifwl-line,#c9d1dd);margin-right:4px}'
    + '.ns-pill.r{border-color:#d92d20;color:#d92d20}.ns-pill.a{border-color:#b86e00;color:#b86e00}'
    + '.ns-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.ns-chip{display:inline-flex;gap:6px;align-items:center;padding:4px 6px 4px 10px;border-radius:99px;border:1px solid var(--ifwl-line,#c9d1dd);font-size:13px}'
    + '.ns-chip button{border:0;background:transparent;color:inherit;cursor:pointer;font-size:15px;line-height:1;opacity:.7}'
    + '.ns-void{opacity:.5;text-decoration:line-through}';
  let cssDone = false;
  function mount(root) {
    if (root.__ns) return; root.__ns = true;
    if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
    const S = {
      event: '', date: ymd(Date.now()), game: 'acc', reason: '', paste: '', q: '',
      sel: new Map(),            // driverId -> row
      review: null,              // rows from the paste
      pick: {},                  // review index -> chosen driver id
      found: [], busy: false, msg: '', err: false, result: null,
      batches: null, view: null, viewQ: '', viewFound: [], tick: 0
    };
    let searchTimer = null, viewTimer = null;
    const say = (m, bad) => { S.msg = m; S.err = !!bad; };

    const hitHtml = (d, action, label) => '<div class="ns-hit"><div><b class="ns-nm">' + esc(d.name || d.id) + '</b>'
      + '<span class="ns-sm">' + esc(d.licenceNumber) + ' · ' + esc(d.tier) + (d.discordUsername ? ' · @' + esc(d.discordUsername) : '') + ' · ID ' + esc(d.id) + '</span><br>'
      + '<span class="ns-sm">Last logged in: <b>' + esc(ago(d.lastLoginMs)) + '</b></span> '
      + (d.noShows ? '<span class="ns-pill r">' + d.noShows + ' no-show' + (d.noShows > 1 ? 's' : '') + ' on record</span>' : '')
      + (d.suspended ? '<span class="ns-pill a">suspended</span>' : '') + '</div>'
      + '<button class="btn" type="button" data-a="' + action + '" data-id="' + esc(d.id) + '">' + label + '</button></div>';

    const reviewHtml = () => {
      const rows = S.review; if (!rows) return '';
      const c = (s) => rows.filter((r) => r.status === s).length;
      let h = '<div class="ns-box"><h4>Matches from your list</h4><div class="ns-sm">' + rows.length + ' name(s) read: <b class="ns-good">' + c('exact') + ' matched</b>'
        + (c('ambiguous') + c('fuzzy') ? ', <b class="ns-warn">' + (c('ambiguous') + c('fuzzy')) + ' need a look</b>' : '') + (c('none') ? ', <b class="ns-bad">' + c('none') + ' not found</b>' : '')
        + '. Exact matches are already ticked. Check the others before adding.</div><div class="ns-wrap"><table class="ns-t"><thead><tr><th>You pasted</th><th>Matched driver</th><th>Last login</th></tr></thead><tbody>';
      rows.forEach((r, i) => {
        const chosen = S.pick[i];
        let cell = '';
        if (r.status === 'none') cell = '<span class="ns-bad">Not found</span> <span class="ns-sm">Search for them above if they have changed their name.</span>';
        else {
          cell = r.matches.map((m) => '<label style="display:block;margin:2px 0"><input type="radio" name="ns-r' + i + '" data-pick="' + i + '" value="' + esc(m.id) + '"' + (chosen === m.id ? ' checked' : '') + '> '
            + '<b>' + esc(m.name) + '</b> <span class="ns-sm">' + esc(m.licenceNumber) + (m.noShows ? ' · ' + m.noShows + ' no-show(s)' : '') + '</span></label>').join('')
            + '<label style="display:block;margin:2px 0" class="ns-sm"><input type="radio" name="ns-r' + i + '" data-pick="' + i + '" value=""' + (!chosen ? ' checked' : '') + '> Skip this one</label>';
          if (r.status === 'fuzzy') cell = '<div class="ns-warn ns-sm">' + (r.how === 'number differs' ? 'Same name, different number:' : 'Similar names only:') + '</div>' + cell;
          if (r.status === 'ambiguous') cell = '<div class="ns-warn ns-sm">More than one driver fits:</div>' + cell;
        }
        const m0 = chosen ? r.matches.find((m) => m.id === chosen) : null;
        h += '<tr><td>' + esc(r.token) + '</td><td>' + cell + '</td><td>' + (m0 ? esc(ago(m0.lastLoginMs)) : '-') + '</td></tr>';
      });
      return h + '</tbody></table></div><div class="ns-row"><button class="btn" type="button" data-a="useReview">Add the ticked drivers to the list below</button><button class="btn" type="button" data-a="clearReview">Clear</button></div></div>';
    };

    const selHtml = () => {
      const n = S.sel.size;
      return '<div class="ns-box"><h4>Drivers to record (' + n + ')</h4>'
        + (n ? '<div class="ns-chips">' + [...S.sel.values()].map((d) => '<span class="ns-chip">' + esc(d.name || d.id) + (d.noShows ? ' <span class="ns-pill r">' + d.noShows + '</span>' : '') + '<button type="button" data-a="unsel" data-id="' + esc(d.id) + '" title="Remove">×</button></span>').join('') + '</div>'
          : '<div class="ns-sm">Nobody picked yet. Search above or paste a list.</div>')
        + '<div class="ns-row"><button class="btn primary" type="button" data-a="add"' + (S.busy || !n ? ' disabled' : '') + '>Record ' + n + ' no-show' + (n === 1 ? '' : 's') + '</button>'
        + (n ? '<button class="btn" type="button" data-a="clearSel">Clear list</button>' : '') + '</div>'
        + '<div class="ns-sm" style="margin-top:8px">Drivers are not messaged. Each record takes 40 Integrity points off their rating at first, fading over about ten months. The driver can see it on their profile; the public only sees a small reliability marker once someone has two or more live records.</div></div>';
    };

    const resultHtml = () => {
      const r = S.result; if (!r) return '';
      return '<div class="ns-box"><h4>Done</h4><div class="ns-good">' + r.added.length + ' recorded.</div>'
        + (r.skipped.length ? '<div class="ns-warn" style="margin-top:6px">Skipped (already had one for this event): ' + r.skipped.map((x) => esc(x.name || x.id)).join(', ') + '</div>' : '')
        + (r.missing.length ? '<div class="ns-bad" style="margin-top:6px">No licence found for: ' + r.missing.map(esc).join(', ') + '</div>' : '')
        + (r.added.length ? '<div class="ns-sm" style="margin-top:6px">Mistake? Use "Undo" on the recent batch below.</div>' : '') + '</div>';
    };

    const batchHtml = () => {
      if (!S.batches) return '<div class="ns-box"><h4>Recent batches</h4><div class="ns-row" style="margin-top:0"><button class="btn" type="button" data-a="loadBatches">Show recent batches</button></div></div>';
      if (!S.batches.length) return '<div class="ns-box"><h4>Recent batches</h4><div class="ns-sm">None yet.</div></div>';
      return '<div class="ns-box"><h4>Recent batches</h4><div class="ns-wrap"><table class="ns-t"><thead><tr><th>Event</th><th>Drivers</th><th>Recorded</th><th></th></tr></thead><tbody>'
        + S.batches.map((b) => '<tr class="' + (b.voided ? 'ns-void' : '') + '"><td><b>' + esc(b.eventLabel) + '</b><div class="ns-sm">' + esc(dayStr(b.dateMs)) + (b.game ? ' · ' + esc(gameLabel(b.game)) : '') + '</div></td>'
          + '<td>' + b.count + '<div class="ns-sm">' + (b.drivers || []).slice(0, 6).map((d) => esc(d.name || d.id)).join(', ') + ((b.drivers || []).length > 6 ? '…' : '') + '</div></td>'
          + '<td>' + esc(dayStr(b.atMs)) + '<div class="ns-sm">by ' + esc(b.byName || '') + '</div></td>'
          + '<td>' + (b.voided ? '<span class="ns-sm">Undone</span>' : '<button class="btn" type="button" data-a="voidBatch" data-id="' + esc(b.id) + '">Undo batch</button>') + '</td></tr>').join('')
        + '</tbody></table></div></div>';
    };

    const viewHtml = () => {
      let h = '<div class="ns-box"><h4>Look up one driver</h4><div class="ns-sm">See a driver\'s no-show records and remove one that was added by mistake or excused.</div>'
        + '<div class="ns-row"><div class="ns-f"><label>Licence number, name, Discord name or Discord ID</label><input type="search" data-in="viewQ" value="' + esc(S.viewQ) + '" placeholder="Search..." autocomplete="off"></div></div>'
        + S.viewFound.map((d) => hitHtml(d, 'view', 'Open')).join('');
      if (S.view) {
        const v = S.view;
        h += '<div style="margin-top:14px"><b>' + esc(v.name) + '</b> <span class="ns-sm">' + esc(v.licenceNumber) + ' · last logged in ' + esc(ago(v.lastLoginMs)) + '</span>';
        h += v.records.length ? '<div class="ns-wrap"><table class="ns-t"><thead><tr><th>Event</th><th>Reason</th><th>Costing now</th><th>Added</th><th></th></tr></thead><tbody>'
          + v.records.map((r) => '<tr class="' + (r.voided ? 'ns-void' : '') + '"><td><b>' + esc(r.eventLabel) + '</b><div class="ns-sm">' + esc(dayStr(r.dateMs)) + (r.game ? ' · ' + esc(gameLabel(r.game)) : '') + '</div></td>'
            + '<td>' + esc(r.reason) + (r.voided ? '<div class="ns-sm">Removed by ' + esc(r.voidedByName || '') + (r.voidReason ? ': ' + esc(r.voidReason) : '') + '</div>' : '') + '</td>'
            + '<td>' + (r.voided ? '-' : '-' + esc(r.pointsNow) + ' <span class="ns-sm">(' + esc(r.weightPct) + '%)</span>') + '</td>'
            + '<td>' + esc(dayStr(r.addedAtMs)) + '<div class="ns-sm">by ' + esc(r.addedByName || '') + '</div></td>'
            + '<td>' + (r.voided ? '' : '<button class="btn" type="button" data-a="voidOne" data-id="' + esc(r.id) + '">Remove</button>') + '</td></tr>').join('')
          + '</tbody></table></div>' : '<div class="ns-sm" style="margin-top:6px">No no-show records.</div>';
        h += '</div>';
      }
      return h + '</div>';
    };

    const render = () => {
      const keepFocus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.in : null;
      const pos = keepFocus && document.activeElement.selectionStart;
      let h = '<div class="ns-box"><h4>Record no-shows</h4><div class="ns-sm">For drivers who signed up and did not turn up. Fill in the event once; it applies to everyone you add.</div>'
        + '<div class="ns-row"><div class="ns-f" style="flex:2"><label>Event they missed *</label><input data-in="event" value="' + esc(S.event) + '" placeholder="e.g. Monday Funday Round 6 (SimGrid)" maxlength="120"></div>'
        + '<div class="ns-f"><label>Event date</label><input type="date" data-in="date" value="' + esc(S.date) + '"></div>'
        + '<div class="ns-f"><label>Game</label><select data-in="game">' + GAMES.map((g) => '<option value="' + g[0] + '"' + (S.game === g[0] ? ' selected' : '') + '>' + g[1] + '</option>').join('') + '</select></div></div>'
        + '<div class="ns-row"><div class="ns-f"><label>Note (optional, the driver can see it)</label><input data-in="reason" value="' + esc(S.reason) + '" placeholder="No show, no notice" maxlength="300"></div></div></div>'
        + '<div class="ns-box"><h4>1. Find drivers</h4>'
        + '<div class="ns-f"><label>Search: licence number, name, Discord name or Discord ID</label><input type="search" data-in="q" value="' + esc(S.q) + '" placeholder="Search..." autocomplete="off"></div>'
        + S.found.map((d) => hitHtml(d, S.sel.has(d.id) ? 'unsel' : 'sel', S.sel.has(d.id) ? 'Remove' : 'Add')).join('')
        + '<div class="ns-f" style="margin-top:14px"><label>Or paste a list (copied Discord message with @mentions, names, Discord IDs or licence numbers, one per line)</label>'
        + '<textarea data-in="paste" placeholder="@[ 35 ] - badespielt @[ 334 ] - Croak-croak @ondrejbatek ...">' + esc(S.paste) + '</textarea></div>'
        + '<div class="ns-row"><button class="btn" type="button" data-a="match"' + (S.busy || !S.paste.trim() ? ' disabled' : '') + '>Match pasted list</button></div></div>'
        + reviewHtml() + selHtml()
        + (S.msg ? '<div class="' + (S.err ? 'ns-bad' : 'ns-good') + '" style="margin:8px 0">' + esc(S.msg) + '</div>' : '')
        + resultHtml() + batchHtml() + viewHtml();
      root.innerHTML = h;
      if (keepFocus) { const el = root.querySelector('[data-in="' + keepFocus + '"]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { /* date/select */ } } }
    };

    const doSearch = async (which) => {
      const q = (which === 'q' ? S.q : S.viewQ).trim();
      const tick = ++S.tick;
      if (q.length < 2) { if (which === 'q') S.found = []; else S.viewFound = []; render(); return; }
      try {
        const d = await api('staffNoShowFind', { query: { q } });
        if (tick !== S.tick) return;
        if (which === 'q') S.found = d.drivers || []; else S.viewFound = d.drivers || [];
      } catch (e) { say(e.message, true); }
      render();
    };

    root.addEventListener('input', (ev) => {
      const el = ev.target.closest('[data-in]'); if (!el) return;
      const k = el.dataset.in; S[k] = el.value;
      if (k === 'q' || k === 'viewQ') {
        clearTimeout(k === 'q' ? searchTimer : viewTimer);
        const t = setTimeout(() => doSearch(k), 350);
        if (k === 'q') searchTimer = t; else viewTimer = t;
      } else if (k === 'paste') {
        const b = root.querySelector('[data-a="match"]'); if (b) b.disabled = S.busy || !S.paste.trim();
      }
    });
    root.addEventListener('change', (ev) => {
      const p = ev.target.closest('input[data-pick]');
      if (p) { S.pick[p.dataset.pick] = p.value; render(); return; }
      const el = ev.target.closest('[data-in]'); if (el && (el.dataset.in === 'game' || el.dataset.in === 'date')) S[el.dataset.in] = el.value;
    });
    root.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b || S.busy) return;
      const a = b.dataset.a, id = b.dataset.id;
      const known = () => S.found.concat(S.viewFound, (S.review || []).flatMap((r) => r.matches)).find((d) => d.id === id);
      try {
        if (a === 'sel') { const d = known(); if (d) S.sel.set(d.id, d); render(); return; }
        if (a === 'unsel') { S.sel.delete(id); render(); return; }
        if (a === 'clearSel') { S.sel = new Map(); render(); return; }
        if (a === 'clearReview') { S.review = null; S.pick = {}; render(); return; }
        if (a === 'useReview') {
          let n = 0;
          S.review.forEach((r, i) => { const m = r.matches.find((x) => x.id === S.pick[i]); if (m) { S.sel.set(m.id, m); n++; } });
          S.review = null; S.pick = {}; S.paste = ''; say(n + ' driver(s) added to the list.'); render(); return;
        }
        if (a === 'view') {
          S.busy = true; render();
          const d = await api('staffNoShowDriver', { query: { driverId: id } });
          S.view = Object.assign({ id }, d); say('');
        }
        if (a === 'match') {
          S.busy = true; S.msg = ''; render();
          const d = await api('staffNoShowMatch', { body: { text: S.paste } });
          S.review = d.rows; S.pick = {};
          d.rows.forEach((r, i) => { if (r.status === 'exact' && r.matches.length === 1) S.pick[i] = r.matches[0].id; });
        }
        if (a === 'add') {
          if (S.event.trim().length < 2) { say('Say which event they missed first.', true); render(); return; }
          const names = [...S.sel.values()].map((d) => d.name || d.id);
          if (!confirm('Record a no-show for ' + names.length + ' driver(s)?\n\nEvent: ' + S.event.trim() + '\nDate: ' + S.date + '\n\n' + names.slice(0, 15).join('\n') + (names.length > 15 ? '\n…and ' + (names.length - 15) + ' more' : '') + '\n\nEach one loses rating points. You can undo the batch afterwards.')) return;
          S.busy = true; S.msg = ''; render();
          const dateMs = S.date ? new Date(S.date + 'T20:00:00').getTime() : Date.now();
          const r = await api('staffNoShowAdd', { body: { driverIds: [...S.sel.keys()], eventLabel: S.event.trim(), game: S.game, dateMs, reason: S.reason.trim() } });
          S.result = r; S.sel = new Map(); S.found = []; S.q = ''; S.batches = null; S.view = null; say('');
        }
        if (a === 'loadBatches') { S.busy = true; render(); S.batches = (await api('staffNoShowBatches')).batches || []; }
        if (a === 'voidBatch') {
          const bt = (S.batches || []).find((x) => x.id === id);
          if (!confirm('Undo the whole batch "' + (bt ? bt.eventLabel : '') + '" (' + (bt ? bt.count : '') + ' drivers)?\n\nTheir records are marked removed and their rating recovers.')) return;
          S.busy = true; render();
          const r = await api('staffNoShowVoid', { body: { batchId: id, reason: 'Batch undone by staff' } });
          S.batches = (await api('staffNoShowBatches')).batches || []; S.view = null; say('Batch undone, ' + r.removed + ' record(s) removed.');
        }
        if (a === 'voidOne') {
          const why = prompt('Remove this no-show record? Optional reason (kept in the log):', 'Valid excuse');
          if (why === null) return;
          S.busy = true; render();
          await api('staffNoShowVoid', { body: { driverId: S.view.id, recordId: id, reason: why } });
          const d = await api('staffNoShowDriver', { query: { driverId: S.view.id } });
          S.view = Object.assign({ id: S.view.id }, d); S.batches = null; say('Record removed. Their rating recovers straight away.');
        }
      } catch (e) { say(e.message, true); }
      S.busy = false; render();
    });
    render();
  }
  function boot() {
    document.querySelectorAll('[data-noshows]').forEach((el) => { if (!el.__ns && token()) mount(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('ifwl-auth-changed', boot);
  window.IFWL_NoShows = { mount };
})();
