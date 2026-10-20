
/* ============================================================
   JOIN THE TEAM (applications) + staff review list
   ============================================================ */
(() => {
  const FN = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const $ = (id) => document.getElementById(id);
  const token = () => (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function call(action, body) {
    const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' };
    const r = await fetch(FN + '?' + action + '=1&token=' + encodeURIComponent(token()), opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || ('Request failed (' + r.status + ')')); e.body = d; throw e; }
    return d;
  }
  const STATUS_TEXT = { new: 'Received - waiting for review', shortlisted: 'Shortlisted - we will be in touch', interview: 'Interview stage - we will be in touch', accepted: 'Accepted', declined: 'Not successful this time' };

  // ---------- applicant side ----------
  async function loadJoin() {
    const status = $('jtStatus'), login = $('jtLogin'), wrap = $('jtFormWrap');
    if (!status) return;
    status.innerHTML = ''; login.classList.add('hidden'); wrap.classList.add('hidden');
    if (!token()) { login.classList.remove('hidden'); return; }
    let me;
    try { me = await call('myTeamApplication'); }
    catch (e) { status.innerHTML = '<div class="jt-status">Could not check your application status: ' + esc(e.message) + '</div>'; return; }
    if (me.alreadyStaff) { status.innerHTML = '<div class="jt-status ok">You are already part of the IFWL staff team - thank you!</div>'; return; }
    const a = me.application;
    if (a) {
      const open = a.status === 'new' || a.status === 'shortlisted' || a.status === 'interview';
      status.innerHTML = '<div class="jt-status' + (a.status === 'accepted' ? ' ok' : '') + '"><b>Your application (' + esc((a.rolesLabel || []).join(', ')) + '):</b> ' + esc(STATUS_TEXT[a.status] || a.status) + '.' + (open ? ' There is no need to send another.' : '') + '</div>';
      if (open || a.status === 'accepted') return;
    }
    wrap.classList.remove('hidden');
  }
  function setErrors(fe) {
    ['declaration', 'roles', 'experience', 'bring', 'availability', 'timezone', 'form'].forEach((k) => { const el = $('jtErr_' + k); if (el) el.textContent = (fe && fe[k]) || ''; });
  }
  function initJoin() {
    const decl = $('jtDecl'), form = $('jtForm');
    if (!decl || !form) return;
    decl.addEventListener('change', () => { form.classList.toggle('hidden', !decl.checked); if (decl.checked) setErrors({}); });
    $('jtLoginBtn')?.addEventListener('click', () => { document.getElementById('discordLoginBtn')?.click(); });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const roles = [...document.querySelectorAll('input[name="jtRole"]:checked')].map((x) => x.value);
      const body = { roles, declaration: decl.checked, experience: $('jtExperience').value, bring: $('jtBring').value, availability: $('jtAvail').value, timezone: $('jtTz').value, other: $('jtOther').value };
      const local = {};
      if (!decl.checked) local.declaration = 'You must confirm this before applying.';
      if (!roles.length) local.roles = 'Choose at least one team.';
      if (body.experience.trim().length < 30) local.experience = 'Please tell us a bit more (a couple of sentences).';
      if (body.bring.trim().length < 30) local.bring = 'Please tell us a bit more (a couple of sentences).';
      if (body.availability.trim().length < 3) local.availability = 'Please tell us roughly when you are available.';
      if (!body.timezone.trim()) local.timezone = 'Please tell us your time zone.';
      setErrors(local);
      if (Object.keys(local).length) { const first = document.querySelector('.jt-err:not(:empty)'); first && first.scrollIntoView({ block: 'center' }); return; }
      const btn = $('jtSubmit'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'Sending...';
      try {
        await call('submitTeamApplication', body);
        form.reset(); decl.checked = false; form.classList.add('hidden');
        await loadJoin();
        $('jtStatus').insertAdjacentHTML('afterbegin', '<div class="jt-status ok"><b>Thank you!</b> Your application has been sent to the team.</div>');
      } catch (e) {
        setErrors(Object.assign({}, e.body && e.body.fieldErrors, { form: e.message }));
      } finally { btn.disabled = false; btn.textContent = old; }
    });
  }

  // ---------- staff side ----------
  let allApps = [];
  function renderStaff() {
    const list = $('taList'); if (!list) return;
    const f = $('taFilter').value;
    const rows = allApps.filter((a) => f === 'all' ? true : f === 'open' ? ['new', 'shortlisted', 'interview'].includes(a.status) : a.status === f);
    if (!rows.length) { list.innerHTML = '<div class="field-hint">No applications here.</div>'; return; }
    list.innerHTML = rows.map((a) => '<div class="jt-app" data-id="' + esc(a.id) + '">' +
      '<h4>' + esc(a.displayName) + ' <span class="jt-pill">' + esc(a.status) + '</span></h4>' +
      '<div class="field-hint">@' + esc(a.username) + ' &middot; applied ' + esc(new Date(a.submittedAtMs || 0).toLocaleString()) + ' &middot; for <b>' + esc((a.rolesLabel || []).join(', ')) + '</b></div>' +
      '<div class="jt-q">Experience</div><div class="jt-a">' + esc(a.experience) + '</div>' +
      '<div class="jt-q">What they would bring</div><div class="jt-a">' + esc(a.bring) + '</div>' +
      '<div class="jt-q">Availability &amp; time zone</div><div class="jt-a">' + esc(a.availability) + ' (' + esc(a.timezone) + ')</div>' +
      (a.other ? '<div class="jt-q">Anything else</div><div class="jt-a">' + esc(a.other) + '</div>' : '') +
      '<div class="jt-q">Confirmed not staff elsewhere</div><div class="jt-a">Yes, ticked at ' + esc(new Date(a.declarationAtMs || 0).toLocaleString()) + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px">' +
      '<select class="ta-status">' + ['new', 'shortlisted', 'interview', 'accepted', 'declined'].map((s) => '<option value="' + s + '"' + (s === a.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
      '<input type="text" class="ta-note" style="flex:1;min-width:180px" maxlength="1000" placeholder="Private note (staff only)" value="' + esc(a.staffNote || '') + '">' +
      '<button class="btn teal ta-save" type="button" style="font-size:12px">Save</button></div>' +
      (a.reviewedBy ? '<div class="field-hint">Last updated by ' + esc(a.reviewedBy) + '</div>' : '') +
      '</div>').join('');
  }
  async function loadStaff() {
    const list = $('taList'); if (!list) return;
    list.innerHTML = '<div class="field-hint">Loading&hellip;</div>';
    try { allApps = (await call('staffTeamApplicationList')).applications || []; renderStaff(); }
    catch (e) { list.innerHTML = '<div class="field-hint">' + esc(e.message) + '</div>'; }
  }
  function initStaff() {
    $('taFilter')?.addEventListener('change', renderStaff);
    $('taList')?.addEventListener('click', async (ev) => {
      const b = ev.target.closest('.ta-save'); if (!b) return;
      const card = b.closest('.jt-app'); const id = card.dataset.id;
      b.disabled = true; const old = b.textContent; b.textContent = 'Saving...';
      try {
        await call('staffTeamApplicationUpdate', { id, status: card.querySelector('.ta-status').value, staffNote: card.querySelector('.ta-note').value });
        await loadStaff();
      } catch (e) { alert('Could not save: ' + e.message); b.disabled = false; b.textContent = old; }
    });
  }

  initJoin(); initStaff();
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-view]'); if (!t) return;
    if (t.dataset.view === 'joinTeam') loadJoin();
    if (t.dataset.view === 'staffTeamApplications') loadStaff();
  });
  window.addEventListener('ifwl-auth-changed', () => { const p = $('joinTeamPanel'); if (p && p.classList.contains('is-active-view')) loadJoin(); });
})();
