/* ============================================================
   COMMENTARY - Go live + driver compare for the Twitch stream (commentators, Owner, Ops).
   Mounts into any element with data-commslive (top of the Drivers to Watch view).
   Talks to rtGate ?commsPanel / ?commsSetLive / ?commsDriverSearch / ?commsCompare. The overlay (stream.html) reads the public ?streamLive=1.
   ============================================================ */
(() => {
  'use strict';
  if (window.IFWL_StreamComms) return;
  (window.IFWL_FILES = window.IFWL_FILES || {})['28-stream-comms.js'] = 's1';
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const allowed = () => !!(window.IFWL_COMMENTATOR || window.IFWL_OWNER || window.IFWL_OPS_PLUS);
  const nameOf = (n) => { const m = String(n || '').match(/^\s*\[\s*(\d+)\s*\]\s*-?\s*(.*)$/); return m ? '#' + m[1] + ' ' + (m[2] || '') : String(n || 'Driver'); };
  const tierOf = (t) => String(t || '').replace(/^IFWL-/i, '').replace(/-/g, ' ');
  async function api(name, opts) {
    const t = token(); if (!t) throw new Error('Please log in first');
    const q = '?' + name + '=1&token=' + encodeURIComponent(t) + ((opts && opts.q) ? '&' + opts.q : '');
    const r = await fetch(FN + q, opts && opts.body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts.body) } : { method: 'GET', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
    return d;
  }
  const CSS = '.cm-box{border:1px solid var(--ifwl-line,#dde3ec);border-radius:12px;padding:14px;margin:0 0 14px}.cm-box h4{margin:0 0 4px;font-size:16px}'
    + '.cm-sm{font-size:12px;opacity:.75}.cm-bad{color:#d92d20;font-weight:700}.cm-good{color:#13a56b;font-weight:700}'
    + '.cm-mode{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;margin:10px 0;font-weight:700;border:1px solid var(--ifwl-line,#c9d1dd)}'
    + '.cm-mode.on{border-color:#d92d20;background:rgba(217,45,32,.1)}.cm-mode i{width:12px;height:12px;border-radius:50%;background:#8a94a6;display:inline-block}.cm-mode.on i{background:#d92d20;box-shadow:0 0 10px #d92d20}'
    + '.cm-row{display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--ifwl-line,#dde3ec)}.cm-row:last-child{border-bottom:0}'
    + '.cm-av{width:44px;height:44px;border-radius:50%;object-fit:cover;object-position:top;background:rgba(128,128,128,.2)}'
    + '.cm-nm{font-weight:700}.cm-pill{display:inline-block;font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid currentColor;margin-left:8px;font-weight:800;letter-spacing:.04em}'
    + '.cm-pill.on{color:#d92d20}.cm-pill.off{color:#8a94a6}'
    + '.cm-in{font:inherit;font-size:14px;padding:9px 11px;border-radius:8px;border:1px solid var(--ifwl-line,#c9d1dd);background:transparent;color:inherit;box-sizing:border-box;width:100%}'
    + '.cm-res{margin-top:6px;border:1px solid var(--ifwl-line,#dde3ec);border-radius:10px;overflow:hidden}.cm-res button{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;width:100%;text-align:left;border:0;border-bottom:1px solid var(--ifwl-line,#dde3ec);border-radius:0;background:transparent;color:inherit;padding:7px 10px;cursor:pointer;font:inherit}'
    + '.cm-res button:last-child{border-bottom:0}.cm-res button:hover{background:rgba(128,128,128,.12)}.cm-res .cm-av{width:34px;height:34px}'
    + '.cm-picks{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}.cm-pick{display:flex;gap:10px;align-items:center;border:2px solid #14c8b0;border-radius:12px;padding:6px 10px}.cm-pick.b{border-color:#ff5a5f}.cm-pick b{font-size:12px;opacity:.7}'
    + '.cm-x{border:0;background:transparent;color:inherit;font-size:18px;cursor:pointer;opacity:.6}'
    + '.cm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}';
  let cssDone = false;
  function mount(root) {
    if (root.__cm) return; root.__cm = true;
    if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
    const S = { d: null, q: '', results: [], picks: [], busy: false, msg: '', bad: false, err: '' };
    let searchT = null, searchSeq = 0;
    const say = (m, bad) => { S.msg = m; S.bad = !!bad; };
    const left = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m <= 1 ? 'under a minute' : m + ' min'; };
    const render = () => {
      const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.in : null;
      const pos = focus && document.activeElement.selectionStart;
      if (S.err) { root.innerHTML = '<div class="cm-box"><h4>Stream control</h4><div class="cm-bad">' + esc(S.err) + '</div></div>'; return; }
      const d = S.d; if (!d) { root.innerHTML = '<div class="cm-box"><h4>Stream control</h4><div class="cm-sm">Loading...</div></div>'; return; }
      const live = d.live, cmp = d.compare;
      const rows = d.comms.map((c) => {
        const can = d.me.canControlAll || c.id === d.me.id;
        return '<div class="cm-row"><img class="cm-av" src="' + esc(c.avatarUrl || '') + '" alt="" onerror="this.style.visibility=\'hidden\'"><div><span class="cm-nm">' + esc(nameOf(c.name)) + (c.isMe ? ' <span class="cm-sm">(you)</span>' : '') + '</span><span class="cm-pill ' + (c.live ? 'on' : 'off') + '">' + (c.live ? 'ON AIR' : 'OFFLINE') + '</span></div>'
          + '<button class="btn ' + (c.live ? '' : 'primary') + '" type="button" data-a="live" data-id="' + esc(c.id) + '" data-on="' + (c.live ? '0' : '1') + '"' + (!can || S.busy ? ' disabled' : '') + (!can ? ' title="Only they (or the Owner) can change this"' : '') + '>' + (c.live ? 'Go offline' : 'Go live') + '</button></div>'; }).join('');
      const picks = S.picks.map((p, i) => '<div class="cm-pick' + (i ? ' b' : '') + '"><img class="cm-av" src="' + esc(p.avatarUrl || '') + '" alt="" onerror="this.style.visibility=\'hidden\'"><div><b>' + (S.picks.length > 1 ? (i ? 'RIGHT' : 'LEFT') : 'DRIVER') + '</b><div class="cm-nm">' + esc(nameOf(p.name)) + '</div></div><button class="cm-x" type="button" data-a="unpick" data-id="' + esc(p.id) + '" aria-label="Remove">&times;</button></div>').join('');
      const res = S.results.filter((r) => !S.picks.some((p) => p.id === r.id)).map((r) => '<button type="button" data-a="pick" data-id="' + esc(r.id) + '"><img class="cm-av" src="' + esc(r.avatarUrl || '') + '" alt="" onerror="this.style.visibility=\'hidden\'"><span><b>' + esc(nameOf(r.name)) + '</b>' + (r.team ? ' <span class="cm-sm">' + esc(r.team) + '</span>' : '') + '</span><span class="cm-sm">' + esc(tierOf(r.tier)) + '</span></button>').join('');
      root.innerHTML =
        '<div class="cm-box"><h4>Stream control</h4><div class="cm-sm">Only one commentator can be on air. Going live puts them on the stream overlay and stops the pop-up panels so the race has priority. With nobody on air the stream shows it as a rerun of past events.</div>'
        + '<div class="cm-mode ' + (live ? 'on' : '') + '"><i></i><span>' + (live ? 'LIVE now: ' + esc(nameOf(live.name)) + ' is on air' : 'Nobody live: the stream shows RERUN OF PAST EVENTS') + '</span></div>'
        + (d.comms.length ? rows : '<div class="cm-sm">No commentators in the list yet. A commentator appears here after they log in to the Licence Hub once.</div>') + '</div>'
        + '<div class="cm-box"><h4>Driver compare</h4><div class="cm-sm">Pick one or two drivers and show them full screen on the stream with their ' + esc(d.season || 'season') + ' stats. One driver shows a profile; two show side by side (first pick on the left).</div>'
        + '<div class="cm-picks">' + picks + '</div>'
        + (S.picks.length < 2 ? '<input class="cm-in" data-in="q" type="search" autocomplete="off" placeholder="Search a driver: name, in-game name or licence number" value="' + esc(S.q) + '">' + (res ? '<div class="cm-res">' + res + '</div>' : (S.q.trim().length >= 2 ? '<div class="cm-sm" style="margin-top:6px">No drivers found.</div>' : '')) : '')
        + '<div class="cm-actions"><button class="btn primary" type="button" data-a="show"' + (!S.picks.length || S.busy ? ' disabled' : '') + '>' + (S.picks.length > 1 ? 'Compare on stream' : 'Show driver on stream') + '</button>'
        + '<button class="btn" type="button" data-a="hide"' + (!cmp || S.busy ? ' disabled' : '') + '>Hide from stream</button>'
        + '<button class="btn" type="button" data-a="clear"' + (!S.picks.length ? ' disabled' : '') + '>Clear picks</button></div>'
        + '<div class="cm-sm" style="margin-top:8px">' + (cmp ? 'On the stream now: <b>' + esc(cmp.cards.map((c) => nameOf(c.name)).join(' vs ')) + '</b>. It stays up until you hide it (it hides itself after 15 minutes).' : 'Nothing on the stream right now.') + '</div></div>'
        + (S.msg ? '<div class="' + (S.bad ? 'cm-bad' : 'cm-good') + '" style="margin:6px 0">' + esc(S.msg) + '</div>' : '');
      if (focus) { const el = root.querySelector('[data-in="' + focus + '"]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { /* search input */ } } }
    };
    const load = async () => {
      try { S.d = await api('commsPanel'); S.err = ''; }
      catch (e) { if (e.status === 403) { root.style.display = 'none'; return; } if (!S.d) S.err = e.message; }
      if (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.in) return;   // do not redraw while typing
      render();
    };
    const search = async () => {
      const q = S.q.trim(); if (q.length < 2) { S.results = []; render(); return; }
      const mine = ++searchSeq;
      try { const d = await api('commsDriverSearch', { q: 'q=' + encodeURIComponent(q) }); if (mine === searchSeq) { S.results = d.drivers || []; render(); } } catch (e) { say(e.message, true); render(); }
    };
    root.addEventListener('input', (ev) => { if (ev.target.dataset && ev.target.dataset.in === 'q') { S.q = ev.target.value; clearTimeout(searchT); searchT = setTimeout(search, 300); } });
    root.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-a]'); if (!b || b.disabled) return; const a = b.dataset.a, id = b.dataset.id;
      try {
        if (a === 'pick') { const r = S.results.find((x) => x.id === id); if (r && S.picks.length < 2) { S.picks.push(r); S.q = ''; S.results = []; say(''); } render(); return; }
        if (a === 'unpick') { S.picks = S.picks.filter((p) => p.id !== id); render(); return; }
        if (a === 'clear') { S.picks = []; say(''); render(); return; }
        S.busy = true; say(''); render();
        if (a === 'live') { const d = await api('commsSetLive', { body: { id, live: b.dataset.on === '1' } }); S.d.live = d.live; S.d.compare = d.compare; await load(); say(b.dataset.on === '1' ? 'You are on air. The stream overlay switches within about 10 seconds.' : 'Taken off air. The stream goes back to rerun mode within about 10 seconds.'); }
        if (a === 'show') { const d = await api('commsCompare', { body: { ids: S.picks.map((p) => p.id) } }); S.d.compare = d.compare; say('Sent to the stream. It appears within about 10 seconds.'); }
        if (a === 'hide') { const d = await api('commsCompare', { body: { hide: true } }); S.d.compare = d.compare; say('Hidden. It leaves the stream within about 10 seconds.'); }
      } catch (e) { say(e.message, true); }
      S.busy = false; render();
    });
    render(); load();
    setInterval(() => { if (!document.hidden && root.offsetParent !== null) load(); }, 20000);
  }
  function boot() { if (!token() || !allowed()) return; document.querySelectorAll('[data-commslive]').forEach((el) => { if (!el.__cm) mount(el); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('ifwl-auth-changed', boot);
  window.IFWL_StreamComms = { mount };
})();
