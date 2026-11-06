/* ============================================================
   POINTS AUDIT - Staff page (Owner / Ops Manager).
   Finds tickets whose licence points were counted twice (headsteward.html + the finalisation trigger)
   and lets staff remove the extra with a visible "Points audit:" entry in the driver's ledger.
   Needs: rtGate ?staffPointsDuplicateAudit / ?staffPointsDuplicateFix (rtgate.js).
   ============================================================ */
(() => {
  'use strict';
  if (window.IFWL_PointsAudit) return;
  (window.IFWL_FILES = window.IFWL_FILES || {})['22-points-audit.js'] = 'p1';
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const when = (ms) => { if (!(ms > 0)) return '-'; try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)); } catch (e) { return '-'; } };
  const BAND = { none: 'no band', amber: 'AMBER', warning: 'FINAL WARNING', escalate: 'ESCALATE' };
  async function api(name, body) {
    const t = token(); if (!t) throw new Error('Please log in first');
    const r = await fetch(FN + '?' + name + '=1&token=' + encodeURIComponent(t), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'GET' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
    return d;
  }
  const CSS = '.pa-box{border:1px solid var(--ifwl-line,#dde3ec);border-radius:12px;padding:14px;margin:12px 0}'
    + '.pa-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}'
    + '.pa-sm{font-size:12px;opacity:.75}.pa-warn{color:#b86e00;font-weight:700}.pa-bad{color:#d92d20;font-weight:700}.pa-good{color:#13a56b;font-weight:700}'
    + '.pa-t{border-collapse:collapse;width:100%;font-size:13px}.pa-t th,.pa-t td{padding:6px 8px;border-bottom:1px solid var(--ifwl-line,#dde3ec);text-align:left;vertical-align:top}'
    + '.pa-t th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.7}.pa-wrap{overflow-x:auto}'
    + '.pa-tk{font-size:12px;margin:2px 0}.pa-hist{opacity:.6}';
  let cssDone = false;
  function mount(root) {
    if (root.__pa) return; root.__pa = true;
    if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
    const S = { data: null, msg: '', err: false, busy: false, sel: new Set() };
    const render = () => {
      const d = S.data;
      let h = '<div class="pa-box"><b>Double-counted ticket points</b><div class="pa-sm" style="margin-top:4px">'
        + 'When a ticket was finalised from headsteward.html, points were added by that page <i>and</i> by the finalisation trigger. '
        + 'This lists every driver whose ledger has two entries for one ticket. Correcting adds a "Points audit:" entry that removes the extra; nothing is deleted from the ledger.</div>'
        + '<div class="pa-row"><button class="btn" data-a="scan"' + (S.busy ? ' disabled' : '') + '>' + (d ? 'Scan again' : 'Scan all drivers') + '</button></div>'
        + (S.msg ? '<div class="' + (S.err ? 'pa-bad' : 'pa-good') + '" style="margin-top:8px">' + esc(S.msg) + '</div>' : '') + '</div>';
      if (d) {
        const s = d.summary;
        h += '<div class="pa-box"><b>' + s.driversToCorrect + '</b> driver(s) are carrying <b>' + s.extraPointsLive + '</b> extra point(s) right now. '
          + '<span class="pa-sm">(' + s.driversAffected + ' driver(s) have a duplicate somewhere in their history, ' + s.ticketsCounted + ' ticket(s) in total. Entries from before a points reset or a new season no longer count and are shown greyed.)</span></div>';
        const live = d.rows.filter((r) => r.liveExtra > 0), old = d.rows.filter((r) => !(r.liveExtra > 0));
        if (live.length) {
          h += '<div class="pa-box"><div class="pa-row" style="margin-top:0"><button class="btn" data-a="all">Select all</button><button class="btn" data-a="none">Select none</button>'
            + '<button class="btn primary" data-a="fix"' + (S.busy || !S.sel.size ? ' disabled' : '') + '>Correct ' + S.sel.size + ' selected</button></div>'
            + '<div class="pa-wrap"><table class="pa-t"><thead><tr><th></th><th>Driver</th><th>Now</th><th>Extra</th><th>Corrected total</th><th>Band</th><th>Tickets</th></tr></thead><tbody>'
            + live.map((r) => '<tr><td><input type="checkbox" data-id="' + esc(r.id) + '"' + (S.sel.has(r.id) ? ' checked' : '') + '></td>'
              + '<td><b>' + esc(r.name || r.id) + '</b><div class="pa-sm">' + esc(r.licenceNumber) + ' · ' + esc(r.tier) + '</div></td>'
              + '<td>' + r.licencePoints + '</td><td class="pa-bad">-' + r.liveExtra + '</td><td><b>' + r.proposedTotal + '</b></td>'
              + '<td>' + esc(BAND[r.bandNow] || r.bandNow) + (r.bandNow !== r.bandAfter ? ' → <b>' + esc(BAND[r.bandAfter] || r.bandAfter) + '</b>' : '') + '</td>'
              + '<td>' + r.items.map((it) => '<div class="pa-tk' + (it.live && !it.corrected ? '' : ' pa-hist') + '">' + esc(when(it.dateMs)) + ' · ' + esc(it.ticketId.slice(0, 8)) + '… · ' + esc(it.otherBy.split('@')[0]) + ' +' + it.otherDelta + ' and system ' + (it.systemDelta >= 0 ? '+' : '') + it.systemDelta + (it.leeway ? ' (leeway)' : '') + ' → extra ' + it.extra + (it.corrected ? ' (corrected)' : (it.live ? '' : ' (before a reset)')) + '</div>').join('') + '</td></tr>').join('')
            + '</tbody></table></div></div>';
        } else h += '<div class="pa-box pa-good">Nothing is currently inflated.</div>';
        if (old.length) h += '<div class="pa-box pa-sm"><b>History only (no longer in anyone\'s total):</b> ' + old.map((r) => esc(r.name || r.id) + ' (' + r.items.length + ')').join(', ') + '</div>';
      }
      root.innerHTML = h;
    };
    root.addEventListener('change', (ev) => { const c = ev.target.closest('input[data-id]'); if (!c) return; c.checked ? S.sel.add(c.dataset.id) : S.sel.delete(c.dataset.id); render(); });
    root.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b || S.busy) return; const a = b.dataset.a;
      try {
        if (a === 'all') { S.sel = new Set(S.data.rows.filter((r) => r.liveExtra > 0).map((r) => r.id)); render(); return; }
        if (a === 'none') { S.sel = new Set(); render(); return; }
        S.busy = true; S.msg = ''; render();
        if (a === 'scan') { S.data = await api('staffPointsDuplicateAudit'); S.sel = new Set(S.data.rows.filter((r) => r.liveExtra > 0).map((r) => r.id)); S.msg = 'Scan complete.'; S.err = false; }
        if (a === 'fix') {
          const names = S.data.rows.filter((r) => S.sel.has(r.id)).map((r) => r.name || r.id);
          if (!confirm('Remove the duplicate points for ' + names.length + ' driver(s)?\n\n' + names.slice(0, 12).join('\n') + (names.length > 12 ? '\n…' : '') + '\n\nA "Points audit:" entry is added to each ledger. This does not delete anything.')) { S.busy = false; render(); return; }
          const r = await api('staffPointsDuplicateFix', { licenceIds: Array.from(S.sel) });
          S.msg = 'Corrected ' + r.corrected + ' driver(s), ' + r.removedTotal + ' point(s) removed.'; S.err = false;
          S.data = await api('staffPointsDuplicateAudit'); S.sel = new Set();
        }
      } catch (e) { S.msg = e.message; S.err = true; }
      S.busy = false; render();
    });
    render();
  }
  function boot() {
    document.querySelectorAll('[data-pointsaudit]').forEach((el) => { if (!el.__pa && token()) mount(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('ifwl-auth-changed', boot);
  window.IFWL_PointsAudit = { mount };
})();
