/* ============================================================
   LMU RESULTS - Le Mans Ultimate race results on the Licence Centre.
   Three pieces, one file:
     1. Racing > LMU Results (every driver): a podium for the top 3 of EACH class in every race,
        full class tables underneath, and each driver's name opens their licence profile.
     2. A driver's profile popup gets an "LMU Results" section (their finishes).
     3. Staff > LMU Results (Owner / Ops): upload the LMU results JSON, check the name matches,
        publish. Publishing is what makes the race pay Career earnings (by position in class).
   Needs: rtGate ?lmuResults=1, ?staffLmuResultPreview=1, ?staffLmuResultSave=1, ?staffLmuResultDelete=1
   Mounts into [data-lmu-results] (driver view) and [data-lmu-staff] (staff tool).
   window.IFWL_LMU = { mountAll, mountHistory, openDriver, normalisePreview }
   ============================================================ */
(() => {
  'use strict';
  if (window.IFWL_LMU) return;
  (window.IFWL_FILES = window.IFWL_FILES || {})['20-lmu-results.js'] = 'p3s2';
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const signedIn = () => !!token();

  async function api(action, extra, body) {
    const url = FN + '?' + action + '=1&token=' + encodeURIComponent(token()) + (extra || '');
    const r = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
    return d;
  }

  const lapFmt = (ms) => {
    if (!(ms > 0)) return '-';
    const m = Math.floor(ms / 60000), s = (ms - m * 60000) / 1000;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  };
  const totalFmt = (ms) => {
    if (!(ms > 0)) return '';
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = (ms % 60000) / 1000;
    return (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  };
  const dateFmt = (ms) => { if (!(ms > 0)) return ''; try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms)); } catch (_) { return ''; } };

  /* ---------- styles ---------- */
  function ensureStyle() {
    if (document.getElementById('lmuStyle')) return;
    const st = document.createElement('style'); st.id = 'lmuStyle';
    st.textContent = `
.lmu-race{border:1px solid var(--ifwl-line);border-radius:14px;background:var(--surface);margin:0 0 16px;overflow:hidden;min-width:0}
.lmu-race-h{padding:14px 16px;border-bottom:1px solid var(--ifwl-line-soft);display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;justify-content:space-between}
.lmu-race-h strong{font-size:16px;overflow-wrap:anywhere}
.lmu-race-h span{font-size:12px;color:var(--text-muted);font-weight:600}
.lmu-class{padding:14px 16px 6px;min-width:0}
.lmu-class+.lmu-class{border-top:1px dashed var(--ifwl-line)}
.lmu-class-h{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.lmu-class-name{font-weight:800;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--ifwl-purple);border:1px solid rgba(155,63,209,.35);background:rgba(155,63,209,.1);border-radius:999px;padding:3px 10px}
.lmu-class-n{font-size:11.5px;color:var(--text-dim);font-weight:600}
.lmu-podium{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-items:end;max-width:640px;margin:0 auto}
.lmu-slot{display:flex;flex-direction:column;align-items:center;text-align:center;min-width:0}
.lmu-slot.empty{visibility:hidden}
.lmu-medal{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:15px;color:#fff;margin-bottom:6px;box-shadow:0 2px 6px rgba(0,0,0,.18)}
.lmu-slot.p1 .lmu-medal{background:linear-gradient(135deg,#f5c542,#c98f0a);width:40px;height:40px;font-size:18px}
.lmu-slot.p2 .lmu-medal{background:linear-gradient(135deg,#c9d1db,#8b96a5)}
.lmu-slot.p3 .lmu-medal{background:linear-gradient(135deg,#d99a6a,#a0602f)}
.lmu-name{font-weight:800;font-size:13.5px;line-height:1.2;overflow-wrap:anywhere;max-width:100%;color:var(--text-primary)}
.lmu-link{all:unset;cursor:pointer;color:var(--ifwl-teal-deep);font-weight:800;text-decoration:underline;text-decoration-color:rgba(14,156,138,.4);text-underline-offset:2px;overflow-wrap:anywhere}
.lmu-link:hover,.lmu-link:focus-visible{color:var(--ifwl-teal);text-decoration-color:currentColor}
.lmu-car{font-size:11.5px;color:var(--text-muted);margin-top:3px;overflow-wrap:anywhere}
.lmu-meta{font-size:11px;color:var(--text-dim);margin:2px 0 6px;font-variant-numeric:tabular-nums}
.lmu-step{width:100%;border-radius:8px 8px 0 0;border:1px solid var(--ifwl-line);border-bottom:0}
.lmu-slot.p1 .lmu-step{height:46px;background:linear-gradient(180deg,rgba(245,197,66,.28),rgba(245,197,66,.06))}
.lmu-slot.p2 .lmu-step{height:32px;background:linear-gradient(180deg,rgba(150,160,175,.25),rgba(150,160,175,.05))}
.lmu-slot.p3 .lmu-step{height:22px;background:linear-gradient(180deg,rgba(200,140,90,.25),rgba(200,140,90,.05))}
.lmu-full{margin:10px 0 8px}
.lmu-full summary{cursor:pointer;font-size:12.5px;font-weight:700;color:var(--ifwl-teal-deep);padding:4px 0}
.lmu-tw{overflow-x:auto;margin-top:6px}
.lmu-tbl{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
.lmu-tbl th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-dim);padding:6px 8px;border-bottom:1px solid var(--ifwl-line)}
.lmu-tbl td{padding:6px 8px;border-bottom:1px solid var(--ifwl-line-soft);vertical-align:top}
.lmu-tbl tr.dnf td{color:var(--text-dim)}
.lmu-tbl .num{text-align:right;white-space:nowrap}
.lmu-tag{display:inline-block;font-size:10px;font-weight:800;border-radius:6px;padding:1px 6px;margin-left:6px;background:rgba(194,53,42,.12);color:var(--ifwl-red)}
.lmu-tag.ok{background:rgba(18,135,90,.12);color:var(--ifwl-green)}
.lmu-tag.warn{background:rgba(181,117,10,.14);color:var(--ifwl-amber)}
.lmu-hist{display:flex;flex-direction:column;gap:6px}
.lmu-hist-row{display:flex;justify-content:space-between;gap:10px;align-items:baseline;font-size:13px;border-bottom:1px solid var(--ifwl-line-soft);padding-bottom:5px}
.lmu-hist-row b{font-variant-numeric:tabular-nums}
.lmu-hist-row small{color:var(--text-muted);display:block}
.lmu-more{display:block;margin:6px auto 14px}
.lmu-staff-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px;margin-bottom:12px}
.lmu-staff-grid .field-group{min-width:0}
.lmu-staff-grid input,.lmu-staff-grid select{width:100%;box-sizing:border-box}
.lmu-warn{border:1px solid rgba(181,117,10,.35);background:rgba(181,117,10,.08);border-radius:10px;padding:8px 12px;font-size:12.5px;margin:8px 0}
.lmu-pick{width:100%;min-width:150px;box-sizing:border-box;font-size:12px}
.lmu-admin-row{display:flex;gap:10px;justify-content:space-between;align-items:center;border-bottom:1px solid var(--ifwl-line-soft);padding:8px 0;flex-wrap:wrap}
@media (max-width:520px){.lmu-name{font-size:12px}.lmu-car{font-size:10.5px}.lmu-race-h,.lmu-class{padding-left:10px;padding-right:10px}.lmu-medal{width:28px;height:28px;font-size:13px}.lmu-slot.p1 .lmu-medal{width:34px;height:34px;font-size:16px}}
`;
    document.head.appendChild(st);
  }

  /* ---------- opening a driver's licence profile ---------- */
  let dirCache = null;
  async function directory() {
    if (dirCache) return dirCache;
    dirCache = (typeof window.fetchDirectory === 'function' ? await window.fetchDirectory() : []) || [];
    return dirCache;
  }
  async function openDriver(discordId) {
    try {
      const rows = await directory();
      const row = rows.find((x) => String(x.discordId) === String(discordId));
      if (row && typeof window.openDriverModal === 'function') window.openDriverModal(row);
    } catch (e) { console.warn('LMU: could not open driver', e); }
  }

  /* ---------- driver view ---------- */
  const nameHtml = (r) => r.discordId ? '<button type="button" class="lmu-link" data-lmu-driver="' + esc(r.discordId) + '">' + esc(r.name) + '</button>' : esc(r.name);

  function slotHtml(r, place) {
    if (!r) return '<div class="lmu-slot p' + place + ' empty"><div class="lmu-medal">' + place + '</div><div class="lmu-step"></div></div>';
    const bits = [];
    if (r.laps) bits.push(r.laps + ' lap' + (r.laps === 1 ? '' : 's'));
    if (r.bestLapMs) bits.push('best ' + lapFmt(r.bestLapMs));
    return '<div class="lmu-slot p' + place + '">'
      + '<div class="lmu-medal">' + place + '</div>'
      + '<div class="lmu-name">' + nameHtml(r) + '</div>'
      + '<div class="lmu-car">' + (r.carNum ? '#' + esc(r.carNum) + ' ' : '') + esc(r.car || r.team || '') + '</div>'
      + '<div class="lmu-meta">' + esc(bits.join(' · ')) + '</div>'
      + '<div class="lmu-step"></div></div>';
  }

  /* Same figures-on-a-podium look as the ACC race podium (13-kit.js / 07-kit.css), used when the Avatar & Kit
     feature is switched on for this account; otherwise the plain podium above is shown. */
  const kitOn = () => { const K = window.IFWL_KIT; return !!(K && K.state && K.state.enabled && K.state.podiumsOpen !== false); };
  function kitColumn(r, place) {
    if (!r || r.dnf) return '<div class="kit-pcol empty ' + (place === 1 ? 'p1' : place === 2 ? 'p2' : 'p3') + '"></div>';
    const K = window.IFWL_KIT, cls = place === 1 ? 'p1' : place === 2 ? 'p2' : 'p3';
    const shown = r.displayName || r.name;
    const url = r.avatar && (r.avatar.urlSmall || r.avatar.url);
    let fig;
    if (url) fig = '<img class="kit-pfig ' + cls + '" src="' + esc(url) + '" alt="' + esc(shown) + '" loading="lazy" width="90" height="150">';
    else {
      const glow = r.stock === 'tier' ? K.tierColour(r.tier) : '';
      fig = '<img class="kit-pfig stock ' + cls + '" src="' + esc(K.STOCK) + '" alt="' + esc(shown) + '" loading="lazy" width="90" height="150"' + (glow ? ' style="filter:drop-shadow(0 0 7px ' + esc(glow) + ')"' : '') + '>';
    }
    const nm = r.discordId ? '<button type="button" class="lmu-link" data-lmu-driver="' + esc(r.discordId) + '">' + esc(shown) + '</button>' : esc(shown);
    return '<div class="kit-pcol ' + cls + '"><div class="kit-pfigwrap">' + fig + '</div>'
      + '<div class="kit-pname" title="' + esc(shown) + '">' + nm + '</div>'
      + '<div class="kit-pcar">' + esc((r.carNum ? '#' + r.carNum + ' ' : '') + (r.car || r.team || '')) + '</div>'
      + '<div class="kit-pplinth ' + cls + '"><span>' + place + '</span></div></div>';
  }

  function classHtml(c) {
    const rows = c.rows || [];
    const top = [rows[0], rows[1], rows[2]];
    const useKit = kitOn();
    if (useKit) window.IFWL_KIT.loadCss();
    const table = '<div class="lmu-tw"><table class="lmu-tbl"><thead><tr><th>Pos</th><th>Driver</th><th>Car</th><th class="num">Laps</th><th class="num">Best lap</th><th class="num">Pts</th></tr></thead><tbody>'
      + rows.map((r) => '<tr class="' + (r.dnf ? 'dnf' : '') + '"><td>' + (r.dnf ? '-' : r.pos) + '</td><td>' + nameHtml(r) + (r.dnf ? '<span class="lmu-tag">DNF</span>' : '') + '</td><td>' + (r.carNum ? '#' + esc(r.carNum) + ' ' : '') + esc(r.car || r.team || '') + '</td><td class="num">' + (r.laps || '-') + '</td><td class="num">' + lapFmt(r.bestLapMs) + '</td><td class="num">' + (r.points != null ? esc(r.points) : '-') + '</td></tr>').join('')
      + '</tbody></table></div>';
    return '<div class="lmu-class"><div class="lmu-class-h"><span class="lmu-class-name">' + esc(c.name) + '</span><span class="lmu-class-n">' + rows.length + ' car' + (rows.length === 1 ? '' : 's') + '</span></div>'
      + (useKit
        ? '<div class="kit-podium"><div class="kit-pgroup"><div class="kit-pstage">' + kitColumn(top[1], 2) + kitColumn(top[0], 1) + kitColumn(top[2], 3) + '</div></div></div>'
        : '<div class="lmu-podium">' + slotHtml(top[1], 2) + slotHtml(top[0], 1) + slotHtml(top[2], 3) + '</div>')
      + '<details class="lmu-full"><summary>Full results</summary>' + table + '</details></div>';
  }

  function raceHtml(r) {
    return '<div class="lmu-race"><div class="lmu-race-h"><strong>' + esc(r.eventName || 'LMU race') + '</strong><span>'
      + esc([r.track, r.session && r.session !== 'Race' ? r.session : '', dateFmt(r.dateMs)].filter(Boolean).join(' · ')) + '</span></div>'
      + (r.classes || []).map(classHtml).join('') + '</div>';
  }

  async function mountResults(root) {
    ensureStyle();
    if (!root.__lmuWired) {
      root.__lmuWired = true;
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lmu-driver]'); if (b) { e.preventDefault(); openDriver(b.dataset.lmuDriver); return; }
        const m = e.target.closest('[data-lmu-more]'); if (m) { root.__shown += 6; paint(); }
      });
    }
    function paint() {
      const list = root.__races || [];
      root.__paint = paint;
      root.innerHTML = list.slice(0, root.__shown).map(raceHtml).join('')
        + (list.length > root.__shown ? '<button type="button" class="btn ghost lmu-more" data-lmu-more>Show older races (' + (list.length - root.__shown) + ')</button>' : '');
    }
    if (!signedIn()) { root.innerHTML = '<div class="empty">Sign in to see LMU results.</div>'; return; }
    root.innerHTML = '<div class="empty">Loading LMU results&hellip;</div>';
    try {
      const d = await api('lmuResults');
      root.__races = d.races || []; root.__shown = 6;
      if (!root.__races.length) { root.innerHTML = '<div class="empty">No LMU races have been published yet.</div>'; return; }
      paint();
    } catch (e) { root.innerHTML = '<div class="empty">Could not load LMU results: ' + esc(e.message) + '</div>'; }
  }

  /* ---------- driver profile popup ---------- */
  async function mountHistory(el, discordId) {
    if (!el || !discordId || !signedIn()) { if (el && el.closest('.dm-sec')) el.closest('.dm-sec').remove(); return; }
    ensureStyle();
    const sec = el.closest('.dm-sec');
    try {
      const d = await api('lmuResults', '&lmuDriver=' + encodeURIComponent(discordId));
      const items = [];
      (d.races || []).forEach((r) => (r.classes || []).forEach((c) => (c.rows || []).forEach((row) => {
        if (row.discordId === discordId) items.push({ r, c, row });
      })));
      if (!items.length) { if (sec) sec.remove(); return; }
      const wins = items.filter((x) => !x.row.dnf && x.row.pos === 1).length;
      const pods = items.filter((x) => !x.row.dnf && x.row.pos <= 3).length;
      el.innerHTML = '<div class="field-hint" style="margin-bottom:6px">' + items.length + ' race' + (items.length === 1 ? '' : 's') + ' · ' + wins + ' win' + (wins === 1 ? '' : 's') + ' · ' + pods + ' podium' + (pods === 1 ? '' : 's') + '</div>'
        + '<div class="lmu-hist">' + items.slice(0, 8).map((x) =>
          '<div class="lmu-hist-row"><span>' + esc(x.r.eventName) + '<small>' + esc([x.c.name, x.r.track, dateFmt(x.r.dateMs)].filter(Boolean).join(' · ')) + '</small></span><b>' + (x.row.dnf ? 'DNF' : 'P' + x.row.pos) + '</b></div>').join('')
        + '</div>' + (items.length > 8 ? '<div class="field-hint" style="margin-top:6px">+ ' + (items.length - 8) + ' earlier</div>' : '');
    } catch (e) { if (sec) sec.remove(); }
  }

  /* ---------- staff tool ---------- */
  function mountStaff(root) {
    if (root.__lmuStaff) return; root.__lmuStaff = true;
    ensureStyle();
    const today = new Date().toISOString().slice(0, 10);
    const S = { overrides: {}, preview: null, busy: false, licences: [] };
    root.innerHTML = `
<div class="notice-card" style="margin-bottom:14px">Upload the results JSON from the LMU server. Nothing is saved until you press <strong>Publish</strong>. Each driver is matched to a licence by name; anyone left unmatched can be picked by hand below. Once published, the race shows on <strong>Racing &rarr; LMU Results</strong> and pays Career earnings (by finishing position in class) the next time the Race Earnings settlement runs.</div>
<div class="lmu-staff-grid">
  <div class="field-group"><label>Event name</label><input type="text" id="lmuEv" maxlength="100" placeholder="e.g. Round 3 - Le Mans"></div>
  <div class="field-group"><label>Track</label><input type="text" id="lmuTrack" maxlength="80" placeholder="e.g. Circuit de la Sarthe"></div>
  <div class="field-group"><label>Race date</label><input type="date" id="lmuDate" value="${today}"></div>
</div>
<div class="field-group"><label>Results JSON - choose the file or paste it</label>
  <div class="upload-drop">Choose the .json file<br><input type="file" id="lmuFile" accept=".json,application/json"></div>
  <textarea id="lmuText" style="width:100%;min-height:90px;font-family:monospace;font-size:11px;margin-top:6px;box-sizing:border-box" placeholder="Or paste the JSON here..."></textarea>
</div>
<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0">
  <button class="btn purple" id="lmuPrev" type="button">Check results</button>
  <span class="save-status" id="lmuSt"></span>
</div>
<datalist id="lmuLicList"></datalist>
<div id="lmuPreview"></div>
<hr style="border-color:var(--ifwl-line);margin:20px 0">
<h4 style="margin:0 0 8px">Published LMU races</h4>
<div id="lmuAdminList"><div class="empty">Loading&hellip;</div></div>`;
    const $ = (id) => root.querySelector('#' + id);
    const st = (t, bad) => { const e = $('lmuSt'); e.textContent = t || ''; e.style.color = bad ? 'var(--ifwl-red)' : ''; };

    $('lmuFile').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      if (f.size > 3 * 1024 * 1024) { st('That file is too big for a results file.', true); return; }
      $('lmuText').value = await f.text();
      S.overrides = {}; st('Loaded ' + f.name + ' - press Check results.');
      if (!$('lmuEv').value.trim()) $('lmuEv').value = f.name.replace(/\.json$/i, '').replace(/[_-]+/g, ' ').slice(0, 100);
    });

    function bodyNow(extra) {
      let payload;
      try { payload = JSON.parse($('lmuText').value); } catch (e) { throw new Error('That is not valid JSON - re-choose the file or paste it again.'); }
      return Object.assign({ payload, overrides: S.overrides, eventName: $('lmuEv').value.trim(), track: $('lmuTrack').value.trim(), date: $('lmuDate').value }, extra || {});
    }

    async function loadLicences() {
      if (S.licences.length) return;
      try {
        S.licences = (await directory()).map((d) => ({ id: d.discordId, label: (d.name || 'Driver') + (d.licenceNumber && d.licenceNumber !== '-' ? ' (' + d.licenceNumber + ')' : '') }));
        $('lmuLicList').innerHTML = S.licences.map((l) => '<option value="' + esc(l.label) + '"></option>').join('');
      } catch (_) { /* picker simply stays empty */ }
    }

    function renderPreview(p) {
      S.preview = p;
      const warn = (p.warnings || []).map((w) => '<div class="lmu-warn">' + esc(w) + '</div>').join('');
      const un = p.stats ? p.stats.unmatched : 0;
      const head = '<div style="margin:10px 0"><strong>' + p.classes.length + ' class' + (p.classes.length === 1 ? '' : 'es') + '</strong> · '
        + '<span class="lmu-tag ok">' + (p.stats ? p.stats.matched : 0) + ' matched</span>'
        + (un ? '<span class="lmu-tag warn">' + un + ' not matched to a licence</span>' : '') + '</div>';
      const tables = p.classes.map((c) => {
        const rows = c.rows.map((r) => {
          const key = r.name.toLowerCase();
          let who;
          if (r.discordId) who = '<span class="lmu-tag ok">' + esc(r.licenceName || 'matched') + '</span> <small style="color:var(--text-dim)">' + esc(r.matchHow === 'manual' ? 'by hand' : r.matchHow === 'fuzzy' ? 'close name' : 'name') + '</small>';
          else who = '<input class="lmu-pick" list="lmuLicList" data-pick="' + esc(key) + '" placeholder="Pick a licence…">' + (r.matchNote ? '<div class="field-hint">' + esc(r.matchNote) + '</div>' : '');
          return '<tr class="' + (r.dnf ? 'dnf' : '') + '"><td>' + (r.dnf ? '-' : r.pos) + '</td><td>' + esc(r.name) + (r.dnf ? '<span class="lmu-tag">DNF</span>' : '') + '</td><td>' + (r.carNum ? '#' + esc(r.carNum) + ' ' : '') + esc(r.car || '') + '</td><td class="num">' + (r.laps || '-') + '</td><td class="num">' + lapFmt(r.bestLapMs) + '</td><td>' + who + '</td></tr>';
        }).join('');
        return '<div class="lmu-class" style="padding-left:0;padding-right:0"><div class="lmu-class-h"><span class="lmu-class-name">' + esc(c.name) + '</span>'
          + (c.dnsNames && c.dnsNames.length ? '<span class="lmu-class-n">' + c.dnsNames.length + ' did not start (left out)</span>' : '') + '</div>'
          + '<div class="lmu-tw"><table class="lmu-tbl"><thead><tr><th>Pos</th><th>Name in file</th><th>Car</th><th class="num">Laps</th><th class="num">Best</th><th>Licence</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
      }).join('');
      const hasManual = p.classes.some((c) => c.rows.some((r) => r.matchHow === 'manual'));
      $('lmuPreview').innerHTML = warn + head + tables
        + '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:14px">'
        + '<button class="btn purple" id="lmuPub" type="button">Publish race</button>'
        + (hasManual ? '<label style="font-size:12.5px"><input type="checkbox" id="lmuRem" checked> Remember the names I matched by hand</label>' : '')
        + '<span class="save-status" id="lmuPubSt"></span></div>'
        + (un ? '<div class="field-hint" style="margin-top:6px">Drivers without a licence still show on the podium and tables, but are not linked to a profile and earn no Career money.</div>' : '');
      loadLicences();
    }

    async function check() {
      if (S.busy) return; S.busy = true; st('Checking…');
      try {
        const d = await api('staffLmuResultPreview', '', bodyNow());
        renderPreview(d); st('Check the matches below, then publish.');
      } catch (e) { st(e.message, true); $('lmuPreview').innerHTML = ''; }
      finally { S.busy = false; }
    }
    $('lmuPrev').addEventListener('click', () => { S.overrides = {}; check(); });

    root.addEventListener('change', (e) => {
      const inp = e.target.closest('[data-pick]'); if (!inp) return;
      const hit = S.licences.find((l) => l.label === inp.value);
      if (!hit) return;
      S.overrides[inp.dataset.pick] = hit.id; check();
    });

    root.addEventListener('click', async (e) => {
      if (e.target.id === 'lmuPub') {
        const btn = e.target, s2 = $('lmuPubSt'); btn.disabled = true; s2.textContent = 'Publishing…';
        try {
          const d = await api('staffLmuResultSave', '', bodyNow({ remember: !!($('lmuRem') && $('lmuRem').checked) }));
          s2.textContent = ''; st('Published. ' + d.stats.matched + ' drivers linked to licences.');
          $('lmuPreview').innerHTML = ''; $('lmuText').value = ''; $('lmuFile').value = ''; S.overrides = {};
          loadAdminList();
          document.querySelectorAll('[data-lmu-results]').forEach((el) => { el.__races = null; });
        } catch (err) { s2.textContent = err.message; s2.style.color = 'var(--ifwl-red)'; btn.disabled = false; }
        return;
      }
      const del = e.target.closest('[data-lmu-del]');
      if (del) {
        if (!window.confirm('Delete this race from the site? Drivers will no longer see it.')) return;
        del.disabled = true;
        try { await api('staffLmuResultDelete', '', { id: del.dataset.lmuDel }); loadAdminList(); }
        catch (err) { del.disabled = false; window.alert(err.message); }
      }
    });

    async function loadAdminList() {
      const box = $('lmuAdminList');
      try {
        const d = await api('lmuResults');
        const races = d.races || [];
        box.innerHTML = races.length ? races.map((r) => '<div class="lmu-admin-row"><div><strong>' + esc(r.eventName) + '</strong><div class="field-hint">'
          + esc([r.track, dateFmt(r.dateMs), (r.classes || []).map((c) => c.name + ' ×' + c.rows.length).join(', ')].filter(Boolean).join(' · ')) + '</div></div>'
          + '<button class="btn ghost" type="button" data-lmu-del="' + esc(r.id) + '">Delete</button></div>').join('')
          : '<div class="empty">Nothing published yet.</div>';
      } catch (e) { box.innerHTML = '<div class="empty">Could not load: ' + esc(e.message) + '</div>'; }
    }
    loadAdminList();
  }

  function mountAll() {
    document.querySelectorAll('[data-lmu-results]').forEach((el) => { if (!el.__races) mountResults(el); });
    document.querySelectorAll('[data-lmu-staff]').forEach((el) => { if (signedIn()) mountStaff(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll); else mountAll();
  window.addEventListener('ifwl-auth-changed', mountAll);
  // the Avatar & Kit settings arrive a moment after the page: redraw the podiums with figures once they do
  window.addEventListener('ifwl-kit-ready', () => document.querySelectorAll('[data-lmu-results]').forEach((el) => { if (el.__paint && el.__races) el.__paint(); }));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view="lmuResults"],[data-view="staffLmuResults"]');
    if (b) setTimeout(mountAll, 50);
  });
  window.IFWL_LMU = { mountAll, mountHistory, openDriver, mountResults, mountStaff, _lapFmt: lapFmt };
})();
