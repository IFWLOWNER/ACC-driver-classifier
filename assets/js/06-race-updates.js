
/* ============================================================
   RACE UPDATES - blocking pop-up, profile card, staff send + tracker
   ============================================================ */
(() => {
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const LOGO = 'https://ifwlowner.github.io/ACC-driver-classifier/ifwllogo1.png';
  const $ = (id) => document.getElementById(id);
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function call(action, body, extra) {
    const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' };
    const r = await fetch(FN + '?' + action + '=1&token=' + encodeURIComponent(token()) + (extra || ''), opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || ('Request failed (' + r.status + ')')); e.body = d; e.status = r.status; throw e; }
    return d;
  }
  const SEV = {
    red: { tag: 'URGENT', col: '#d62828', name: 'Urgent' },
    orange: { tag: 'IMPORTANT', col: '#e98a00', name: 'Important' },
    green: { tag: 'FOR INFO', col: '#2e9e5b', name: 'For info' }
  };
  const sevOf = (u) => SEV[u && u.severity] || SEV.orange;
  const tri = (col) => '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 38 35H2z" fill="' + col + '"/><text x="20" y="31" text-anchor="middle" font-size="19" font-weight="900" fill="#fff" font-family="Arial">!</text></svg>';
  const fmt = (ms) => {
    if (!ms) return '';
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)).replace(',', ' ·') + ' UK'; }
    catch (_) { return new Date(ms).toLocaleString('en-GB'); }
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  // plain text with **bold** and blank-line paragraphs
  const rich = (t) => String(t == null ? '' : t).split(/\n{2,}/).map((p) => '<p>' + esc(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>').join('');

  // ---- logo: recolour the real IFWL logo if it is a transparent PNG, otherwise fall back to a warning triangle ----
  let logoMode = null; // 'mask' | 'tri'
  const logoReady = new Promise((resolve) => {
    try {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = 24; c.height = 24;
          const g = c.getContext('2d'); g.drawImage(im, 0, 0, 24, 24);
          const d = g.getImageData(0, 0, 24, 24).data; let clear = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] < 40) clear++;
          logoMode = clear > 30 ? 'mask' : 'tri';
        } catch (_) { logoMode = 'tri'; }
        resolve();
      };
      im.onerror = () => { logoMode = 'tri'; resolve(); };
      im.src = LOGO;
      setTimeout(() => { if (!logoMode) { logoMode = 'tri'; resolve(); } }, 4000);
    } catch (_) { logoMode = 'tri'; resolve(); }
  });
  const logoHtml = (sv) => logoMode === 'mask'
    ? '<span class="ru-logo"><i style="background:' + sv.col + ';-webkit-mask-image:url(' + LOGO + ');mask-image:url(' + LOGO + ')"></i></span>'
    : '<span class="ru-logo">' + tri(sv.col) + '</span>';

  // ---- the notice itself (used by the live pop-up, the staff preview and "read again") ----
  function noticeHtml(u, opts) {
    const sv = sevOf(u); opts = opts || {};
    return '<div class="ru-notice ' + esc(u.severity) + '" role="alertdialog" aria-modal="true" aria-label="IFWL Race Update">' +
      (opts.ribbon ? '<div class="ru-ribbon">' + esc(opts.ribbon) + '</div>' : '') +
      '<div class="ru-nh">' + logoHtml(sv) +
        '<div class="t"><b>IFWL Race Update</b><span>Update No. ' + (u.no === '?' ? '(next)' : pad2(u.no || 0)) + '</span></div>' +
        '<div class="ru-sevtag">&#9650; ' + sv.tag + '</div></div>' +
      '<div class="ru-meta">' +
        '<div><b>Issued</b>' + esc(fmt(u.issuedAtMs)) + '</div>' +
        '<div><b>Issued by</b>' + esc(u.issuedByName || 'IFWL') + '</div>' +
        '<div><b>Applies to</b>' + esc(u.audienceLabel || 'All drivers') + '</div>' +
        '<div><b>Effective</b>' + esc(u.effective || 'Immediately') + '</div></div>' +
      '<div class="ru-nb">' + (opts.pager ? '<div class="ru-pager"><span>' + esc(opts.pager) + '</span><span>' + esc(opts.pagerRight || '') + '</span></div>' : '') +
        '<h2>' + esc(u.title) + '</h2>' + rich(u.body) +
        (u.keyLine ? '<div class="ru-key">' + esc(u.keyLine) + '</div>' : '') +
        (u.status === 'withdrawn' ? '<p><b>This update has been withdrawn.</b> Disregard it unless a replacement has been issued.</p>' : '') +
        '<p style="font-size:13px;color:#5b6779">Questions? Open a ticket in the Licence Centre or ask staff in Discord. Do not reply to this notice.</p></div>' +
      '<div class="ru-nf" id="ruFoot"></div></div>';
  }
  function modal() {
    let m = $('ruModal');
    if (!m) { m = document.createElement('div'); m.id = 'ruModal'; m.className = 'ru-modal hidden'; document.body.appendChild(m); }
    return m;
  }
  function openModal(html) { const m = modal(); m.innerHTML = html; m.classList.remove('hidden'); document.body.classList.add('ru-open'); m.scrollTop = 0; return m; }
  function closeModal() { const m = $('ruModal'); if (m) { m.classList.add('hidden'); m.innerHTML = ''; } document.body.classList.remove('ru-open'); }

  // ---- state ----
  let showing = false, history = [], pollTimer = null;

  // ---- must-confirm queue ----
  function showQueue(list) {
    return new Promise((resolve) => {
      let i = 0, timer = null;
      const step = () => {
        if (timer) { clearInterval(timer); timer = null; }
        if (i >= list.length) { closeModal(); showing = false; resolve(); return; }
        const u = list[i]; const last = i === list.length - 1;
        openModal(noticeHtml(u, { pager: 'Update ' + (i + 1) + ' of ' + list.length + ' to read', pagerRight: 'Must be confirmed to continue' }));
        $('ruFoot').innerHTML =
          '<label class="ru-confirm"><input type="checkbox" id="ruCb"><span>I have read and understood this Race Update and will race accordingly.</span></label>' +
          '<button type="button" class="ru-btn" id="ruGo" disabled>CONFIRM' + (last ? '' : ' AND CONTINUE') + '</button>' +
          '<div class="ru-err" id="ruGoErr"></div><div class="ru-hint">Your confirmation and the time you pressed it are saved on your profile.</div>';
        const cb = $('ruCb'), go = $('ruGo');
        let left = Math.max(0, Number(u.minReadSec) || 0), busy = false;
        const label = () => 'CONFIRM' + (last ? '' : ' AND CONTINUE');
        const refresh = () => { go.disabled = busy || !cb.checked || left > 0; go.textContent = left > 0 ? 'Read for ' + left + 's to continue...' : label(); };
        if (left > 0) timer = setInterval(() => { left--; refresh(); if (left <= 0) { clearInterval(timer); timer = null; } }, 1000);
        cb.onchange = refresh; refresh();
        go.onclick = async () => {
          if (go.disabled) return;
          busy = true; refresh(); go.textContent = 'Saving...';
          try {
            const r = await call('myRaceUpdateConfirm', { id: u.id });
            const h = history.find((x) => x.id === u.id); if (h) h.ackedAtMs = r.atMs || Date.now();
            u.ackedAtMs = r.atMs || Date.now();
            if (!history.some((x) => x.id === u.id)) history.unshift(u);
            renderCard();
            i++; step();
          } catch (e) {
            busy = false; refresh();
            const er = $('ruGoErr'); if (er) er.textContent = (e && e.message ? e.message : 'Could not save') + ' - your answer was not saved, please try again.';
          }
        };
      };
      step();
    });
  }

  // ---- fetch + show ----
  async function check() {
    if (showing || !token()) return;
    let d;
    try { d = await call('myRaceUpdates'); } catch (e) { return; }
    history = d.history || [];
    renderCard();
    const pend = d.pending || [];
    if (!pend.length) return;
    showing = true;
    await logoReady;
    pend.forEach((u) => { if (!history.some((h) => h.id === u.id)) history.unshift({ ...u, ackedAtMs: 0 }); });
    renderCard();
    await showQueue(pend);
  }
  // used by the Home page load: race updates first, then the usual raceday briefing
  window.checkRaceUpdates = () => check().catch(() => {});
  window.IFWL_RaceUpdates = { check };

  // ---- profile card ----
  let showAll = false;
  function renderCard() {
    const p = $('raceUpdatesPanel'); if (!p) return;
    if (!history.length) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    const unread = history.filter((u) => !u.ackedAtMs && u.status === 'active').length;
    const worst = history.find((u) => u.status === 'active') || history[0];
    $('ruCardIcon').innerHTML = '<span style="display:inline-block;width:26px;height:26px;vertical-align:middle">' + tri(unread ? '#d62828' : sevOf(worst).col) + '</span>';
    const pill = $('ruCardPill');
    pill.className = 'ru-pill ' + (unread ? 'bad' : 'ok');
    pill.textContent = unread ? unread + ' unread - tap to read' : 'All read ✓';
    pill.style.cursor = unread ? 'pointer' : 'default';
    pill.onclick = unread ? () => { showing = false; check(); } : null;
    const rows = showAll ? history : history.slice(0, 3);
    $('ruCardList').innerHTML = rows.map((u) => {
      const sv = sevOf(u);
      return '<button type="button" class="ru-item ' + esc(u.severity) + (u.status === 'withdrawn' ? ' wd' : '') + '" data-id="' + esc(u.id) + '">' + tri(sv.col) +
        '<span class="tx"><b>No. ' + pad2(u.no) + ' - ' + esc(u.title) + '</b><span>' + sv.tag + ' &middot; ' + esc(fmt(u.issuedAtMs)) + ' &middot; ' + esc(u.issuedByName || '') + (u.status === 'withdrawn' ? ' &middot; WITHDRAWN' : '') + '</span></span>' +
        (u.ackedAtMs ? '<span class="st">Confirmed<br><small style="font-weight:600;color:inherit;opacity:.8">' + esc(fmt(u.ackedAtMs)) + '</small></span>' : '<span class="st un">Not yet confirmed</span>') + '</button>';
    }).join('');
    $('ruCardMore').innerHTML = history.length > 3 ? '<button type="button" id="ruToggleAll">' + (showAll ? 'Show fewer' : 'See all ' + history.length) + '</button>' : '';
  }
  document.addEventListener('click', async (ev) => {
    const it = ev.target.closest && ev.target.closest('#raceUpdatesPanel .ru-item');
    if (it) {
      const u = history.find((x) => x.id === it.dataset.id); if (!u) return;
      await logoReady;
      openModal(noticeHtml(u, { ribbon: u.ackedAtMs ? 'You confirmed this update on ' + fmt(u.ackedAtMs) : 'Read-only copy' }));
      $('ruFoot').innerHTML = '<button type="button" class="ru-btn ghost" id="ruClose">Close</button>';
      $('ruClose').onclick = () => { if (!showing) closeModal(); };
      return;
    }
    if (ev.target && ev.target.id === 'ruToggleAll') { showAll = !showAll; renderCard(); }
  });

  // ---- staff: send + track ----
  let ST = { updates: [], canSend: false, isOwner: false, senders: [] }, selSev = 'red', selId = '';
  const msg = (t) => { const m = $('ruStaffMsg'); if (m) { m.textContent = t || ''; m.style.display = t ? 'block' : 'none'; } };
  async function loadStaff() {
    if (!$('ruStaffWrap')) return;
    msg('Loading...'); $('ruStaffWrap').style.display = 'none';
    if (!token()) { msg('Log in with Discord first.'); return; }
    try { ST = await call('staffRaceUpdateList'); }
    catch (e) { msg(e.status === 403 ? 'Race Updates are for staff only.' : 'Could not load: ' + e.message); return; }
    msg(''); $('ruStaffWrap').style.display = '';
    $('ruCompose').style.display = ST.canSend ? '' : 'none';
    $('ruNoSend').style.display = ST.canSend ? 'none' : '';
    $('ruSendersBox').style.display = ST.isOwner ? '' : 'none';
    renderSent(); renderSenders();
    if (selId && ST.updates.some((u) => u.id === selId)) loadTracker(selId); else { selId = ''; $('ruTracker').style.display = 'none'; }
  }
  function renderSent() {
    const el = $('ruSentList');
    if (!ST.updates.length) { el.innerHTML = '<div class="field-hint">Nothing sent yet.</div>'; return; }
    el.innerHTML = ST.updates.map((u) => {
      const sv = sevOf(u);
      return '<button type="button" class="ru-sent ' + esc(u.severity) + (u.id === selId ? ' sel' : '') + '" data-id="' + esc(u.id) + '">' + '<span style="width:26px;flex:none;display:inline-block">' + tri(sv.col) + '</span>' +
        '<span style="flex:1;min-width:0"><b>No. ' + pad2(u.no) + ' - ' + esc(u.title) + '</b><span>' + sv.tag + ' &middot; ' + esc(fmt(u.issuedAtMs)) + ' &middot; ' + esc(u.audienceLabel) + (u.status === 'withdrawn' ? ' &middot; WITHDRAWN' : '') + '</span></span></button>';
    }).join('');
  }
  function renderSenders() {
    const el = $('ruSenderList'); if (!el) return;
    el.innerHTML = (ST.senders || []).length ? ST.senders.map((s) => '<div style="display:flex;gap:8px;align-items:center;margin:4px 0"><span style="flex:1">' + esc(s.name || 'Unnamed') + ' <small style="opacity:.7">(' + esc(s.id) + ')</small></span><button type="button" class="ru-mini danger" data-rm="' + esc(s.id) + '">Remove</button></div>').join('') : '<div class="field-hint">Only the Owner can send right now.</div>';
  }
  async function loadTracker(id) {
    selId = id; renderSent();
    const box = $('ruTracker'); box.style.display = ''; box.innerHTML = '<div class="field-hint">Loading who has confirmed&hellip;</div>';
    try {
      const d = await call('staffRaceUpdateTracker', null, '&id=' + encodeURIComponent(id));
      const u = d.update, tot = d.eligibleTotal || 0, n = d.confirmed.length, pct = tot ? Math.round(n / tot * 100) : 100;
      box.innerHTML = '<h4>No. ' + pad2(u.no) + ' - who has confirmed</h4>' +
        '<div style="font-size:13px"><b>' + n + '</b> of <b>' + tot + '</b> drivers confirmed (' + pct + '%)</div><div class="ru-prog"><i style="width:' + pct + '%"></i></div>' +
        '<div style="font-size:12px;opacity:.75">' + d.pending.length + ' still to log in and confirm</div>' +
        '<details open style="margin-top:8px"><summary style="cursor:pointer;font-weight:700;font-size:13px">Not yet confirmed (' + d.pending.length + ')</summary><table class="ru-tbl">' +
          (d.pending.slice(0, 300).map((r) => '<tr><td><b>' + esc(r.name) + '</b></td><td class="pend">' + (r.lastLoginMs ? 'last seen ' + esc(new Date(r.lastLoginMs).toLocaleDateString('en-GB')) : 'never logged in') + '</td></tr>').join('') || '<tr><td>Everyone has confirmed.</td><td></td></tr>') + '</table></details>' +
        '<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:700;font-size:13px">Confirmed (' + n + ')</summary><table class="ru-tbl">' +
          d.confirmed.slice(0, 400).map((r) => '<tr><td>' + esc(r.name) + '</td><td class="done">' + esc(fmt(r.atMs)) + ' &#10003;</td></tr>').join('') + '</table></details>' +
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ru-mini" id="ruCsv">Download list (CSV)</button>' +
        (ST.canSend && u.status === 'active' ? '<button type="button" class="ru-mini" id="ruRemind">Remind unread in Discord</button><button type="button" class="ru-mini danger" id="ruWithdraw">Withdraw</button>' : '') + '</div><div class="ru-err" id="ruTrErr" style="text-align:left"></div>';
      $('ruCsv').onclick = () => {
        const rows = [['Name', 'Status', 'Confirmed at (UK)', 'Platform']].concat(d.confirmed.map((r) => [r.name, 'Confirmed', fmt(r.atMs), r.platform]), d.pending.map((r) => [r.name, 'NOT confirmed', '', r.platform]));
        const csv = rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'race-update-' + pad2(u.no) + '-confirmations.csv'; a.click();
      };
      const rem = $('ruRemind'); if (rem) rem.onclick = async () => {
        rem.disabled = true; try { const r = await call('staffRaceUpdateRemind', { id }); $('ruTrErr').style.color = '#2e9e5b'; $('ruTrErr').textContent = r.posted ? 'Reminder posted in Discord (' + r.pending + ' still to confirm).' : 'Nobody is left to remind.'; } catch (e) { $('ruTrErr').textContent = e.message; } rem.disabled = false;
      };
      const wd = $('ruWithdraw'); if (wd) wd.onclick = async () => {
        const reason = window.prompt('Withdraw No. ' + pad2(u.no) + '? Drivers will no longer be asked to confirm it. Optional reason (staff only):', '');
        if (reason === null) return;
        try { await call('staffRaceUpdateWithdraw', { id, reason }); await loadStaff(); } catch (e) { $('ruTrErr').textContent = e.message; }
      };
    } catch (e) { box.innerHTML = '<div class="ru-err">Could not load: ' + esc(e.message) + '</div>'; }
  }
  function formUpdate() {
    return { severity: selSev, title: $('ruTitle').value.trim(), body: $('ruBody').value.trim(), keyLine: $('ruKey').value.trim(), effective: $('ruEff').value.trim() || 'Immediately',
      audience: $('ruAud').value, minReadSec: $('ruMin').checked ? 5 : 0, postDiscord: $('ruDisc').checked };
  }
  async function previewAndSend() {
    const f = formUpdate(), err = $('ruFormErr'); err.textContent = '';
    if (f.title.length < 4) { err.textContent = 'Give it a headline.'; return; }
    if (f.body.length < 10) { err.textContent = 'Write the update itself.'; return; }
    await logoReady;
    const aud = { all: 'All drivers (PC & Console)', pc: 'PC drivers', console: 'Console drivers' }[f.audience];
    const u = { ...f, no: '?', issuedAtMs: Date.now(), issuedByName: 'You', audienceLabel: aud, status: 'active' };
    openModal(noticeHtml(u, { ribbon: 'PREVIEW - NOT SENT YET. This is exactly what every driver will see.' }));
    $('ruFoot').innerHTML = '<div class="ru-err" id="ruSendErr"></div><button type="button" class="ru-btn" id="ruSendNow">SEND TO EVERYONE NOW</button><button type="button" class="ru-btn ghost" id="ruBackEdit">Back to editing</button>' +
      '<div class="ru-hint">Sending locks every driver in "must confirm" at their next login, and cannot be edited afterwards.</div>';
    $('ruBackEdit').onclick = () => closeModal();
    $('ruSendNow').onclick = async () => {
      const b = $('ruSendNow'); b.disabled = true; b.textContent = 'Sending...';
      try {
        const r = await call('staffRaceUpdateSend', f);
        closeModal();
        ['ruTitle', 'ruBody', 'ruKey'].forEach((id) => { $(id).value = ''; }); $('ruEff').value = 'Immediately';
        selId = r.id; await loadStaff(); check();
      } catch (e) {
        b.disabled = false; b.textContent = 'SEND TO EVERYONE NOW';
        const fe = e.body && e.body.fieldErrors ? Object.values(e.body.fieldErrors).join(' ') : '';
        $('ruSendErr').textContent = (e.message || 'Could not send') + (fe ? ' ' + fe : '');
      }
    };
  }
  function initStaff() {
    const seg = $('ruSev'); if (!seg) return;
    seg.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-v]'); if (!b) return; selSev = b.dataset.v; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
    $('ruPreviewBtn').onclick = previewAndSend;
    $('ruSentList').addEventListener('click', (ev) => { const b = ev.target.closest('.ru-sent'); if (b) loadTracker(b.dataset.id); });
    $('ruSenderAdd').onclick = async () => {
      const er = $('ruSenderErr'); er.textContent = '';
      try { const r = await call('staffRaceUpdateSenders', { add: { id: $('ruSenderId').value.trim(), name: $('ruSenderName').value.trim() } }); ST.senders = r.senders; $('ruSenderId').value = ''; $('ruSenderName').value = ''; renderSenders(); }
      catch (e) { er.textContent = e.message; }
    };
    $('ruSenderList').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-rm]'); if (!b) return;
      try { const r = await call('staffRaceUpdateSenders', { remove: b.dataset.rm }); ST.senders = r.senders; renderSenders(); } catch (e) { $('ruSenderErr').textContent = e.message; }
    });
  }

  initStaff();
  document.addEventListener('click', (ev) => { const t = ev.target.closest && ev.target.closest('[data-view="staffRaceUpdates"]'); if (t && t.tagName === 'BUTTON') loadStaff(); });
  // re-check on login, when the tab comes back, and every few minutes while the page is open
  window.addEventListener('ifwl-auth-changed', () => { if (token()) check(); else { history = []; renderCard(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && token()) check(); });
  pollTimer = setInterval(() => { if (!document.hidden && token()) check(); }, 180000);
  setTimeout(() => { if (token()) check(); }, 2500); // safety net if the Home hook has not run yet
})();
