
/* ============================================================
   STAFF PANEL
   Search/edit any driver, override tier with a reason (kept in
   tierHistory so there's an audit trail), and keep private
   staff notes in a separate note list that is never surfaced
   in the public directory or the driver's own profile fetch.
   ============================================================ */
(() => {
  const { demoGet, USE_DEMO_FALLBACK, staffSearch, fetchTrophyCabinet, renderTrophyCabinetEntries, rdiQuickFactsStripHtml, applyLicenceBetaNotice } = window.__IFWL_EXTRAS; // from 02-extras.js (always loaded first)
  const q = id => document.getElementById(id);
  function demoSet(k,v){try{localStorage.setItem('IFWL_LICENCE_DEMO:'+k,JSON.stringify(v))}catch(_){}}
  async function staffFetchProfile(id){
    if(USE_DEMO_FALLBACK()) return demoGet('profiles', {})[id] || null;
    return (await window.IFWL_Api.apiGet('staffLicenceGet', `&driverId=${encodeURIComponent(id)}`)).profile || null;
  }
  async function staffFetchNotes(id){
    if(USE_DEMO_FALLBACK()) return (demoGet('notes', {})[id] || []);
    return (await window.IFWL_Api.apiGet('staffLicenceNoteList', `&driverId=${encodeURIComponent(id)}`)).notes || [];
  }
  // ✅ ADDED: Licence Database "Reset points for selected" - Owner/Ops
  // Manager only (see staffLicenceBulkResetPoints in index.js). Sets each
  // selected driver's licencePoints to 0 via the shared points-change core,
  // so it's logged in their pointsHistory the same as any other adjustment.
  async function staffBulkResetPoints(driverIds){
    if(USE_DEMO_FALLBACK()){
      const all = demoGet('profiles', {});
      driverIds.forEach(id => { if(all[id]) all[id].licencePoints = 0; });
      demoSet('profiles', all);
      return { ok:true, reset: driverIds, failed: [] };
    }
    return window.IFWL_Api.apiPost('staffLicenceBulkResetPoints', { driverIds });
  }
  async function staffSaveProfile(id, patch){
    if(USE_DEMO_FALLBACK()){
      const all = demoGet('profiles', {});
      const p = all[id]; if(!p) throw new Error('Driver not found');
      if(typeof patch.tier === 'string' && patch.tier !== p.tier){
        p.tierHistory = p.tierHistory || [];
        p.tierHistory.push({ tier: patch.tier, date: new Date().toISOString(), reason: patch.reason || 'No reason given', setBy: 'staff' });
        p.tier = patch.tier;
      }
      if(typeof patch.name === 'string') p.name = patch.name;
      if(Array.isArray(patch.accDriverNames)) p.accDriverNames = patch.accDriverNames;
      if(typeof patch.platform === 'string') p.platform = patch.platform;
      if(typeof patch.simgridUsername === 'string') p.simgridUsername = patch.simgridUsername;
      if(typeof patch.steamId === 'string') p.steamId = patch.steamId;
      if(typeof patch.namePronunciation === 'string') p.namePronunciation = patch.namePronunciation;
      if(typeof patch.bio === 'string') p.bio = patch.bio;
      if(Array.isArray(patch.lmuSubLicences)) p.lmuSubLicences = patch.lmuSubLicences;
      all[id] = p; demoSet('profiles', all);
      return p;
    }
    return window.IFWL_Api.apiPost('staffLicenceSave', { driverId: id, ...patch });
  }
  async function staffAddNote(id, text){
    if(USE_DEMO_FALLBACK()){
      const notesAll = demoGet('notes', {});
      notesAll[id] = notesAll[id] || [];
      notesAll[id].push({ text, by: 'You (staff)', date: new Date().toISOString() });
      demoSet('notes', notesAll);
      return notesAll[id];
    }
    return window.IFWL_Api.apiPost('staffLicenceNoteAdd', { driverId: id, text });
  }
  async function staffIssueLicence(discordId, name){
    if(USE_DEMO_FALLBACK()){
      throw new Error('In demo mode, new drivers get a profile automatically the first time they log in - there is nothing to manually issue yet.');
    }
    return window.IFWL_Api.apiPost('staffLicenceIssue', { discordId, name });
  }

  // Ban length is capped 1-100 days both here and server-side - the server
  // check is the real boundary, this is just so staff get an instant error
  // instead of waiting on a round trip for an out-of-range value.
  async function staffApplyBan(id, days, reason, permanent){
    if(!permanent && (!Number.isFinite(days) || days < 1 || days > 100)){
      throw new Error('Ban length must be between 1 and 100 days, or tick permanent.');
    }
    if(USE_DEMO_FALLBACK()){
      const all = demoGet('profiles', {});
      const p = all[id]; if(!p) throw new Error('Driver not found');
      const nowMs = Date.now();
      p.ban = { days: permanent ? null : days, permanent: !!permanent, reason, startedAtMs: nowMs, endsAtMs: nowMs + (permanent ? 100*365*86400000 : days * 86400000), setBy: 'staff' };
      p.banHistory = p.banHistory || [];
      p.banHistory.push({ action: permanent ? 'banned (permanent)' : 'banned', days: permanent ? null : days, permanent: !!permanent, reason, date: new Date().toISOString(), by: 'staff' });
      all[id] = p; demoSet('profiles', all);
      return p.ban;
    }
    return window.IFWL_Api.apiPost('staffLicenceBan', { driverId: id, days, reason, permanent: !!permanent });
  }
  async function staffLiftBan(id){
    if(USE_DEMO_FALLBACK()){
      const all = demoGet('profiles', {});
      const p = all[id]; if(!p) throw new Error('Driver not found');
      p.banHistory = p.banHistory || [];
      p.banHistory.push({ action: 'lifted', date: new Date().toISOString(), by: 'staff' });
      p.ban = null;
      all[id] = p; demoSet('profiles', all);
      return true;
    }
    return window.IFWL_Api.apiPost('staffLicenceBan', { driverId: id, lift: true });
  }

  // ✅ ADDED: image moderation - removes a profile photo or header image
  // with a mandatory reason, optionally banning in the same action. No
  // demo-mode fallback for this one - it's a moderation action, always
  // hits the real endpoint.
  async function staffRemoveImage(id, which, reason, banOptions){
    if(!reason || !reason.trim()) throw new Error('A reason is required to remove an image.');
    const body = { driverId: id, which, reason: reason.trim() };
    if(banOptions?.banAlso){
      body.banAlso = true;
      body.banPermanent = !!banOptions.permanent;
      if(!banOptions.permanent) body.banDays = banOptions.days;
    }
    return window.IFWL_Api.apiPost('staffRemoveProfileImage', body);
  }

  // Points live on the same licence doc as everything else - it's already
  // the driver's unique licence record, so there's no second place points
  // need to be "linked" to. delta can be positive or negative; total never
  // goes below zero.
  async function staffAdjustPoints(id, delta, reason){
    if(!Number.isFinite(delta) || delta === 0) throw new Error('Points delta must be a non-zero number.');
    if(!reason) throw new Error('A reason is required for any points change.');
    if(USE_DEMO_FALLBACK()){
      const all = demoGet('profiles', {});
      const p = all[id]; if(!p) throw new Error('Driver not found');
      const before = Number(p.licencePoints || 0);
      const after = Math.max(0, before + delta);
      p.pointsHistory = p.pointsHistory || [];
      p.pointsHistory.push({ delta, before, after, reason, date: new Date().toISOString(), setBy: 'staff' });
      p.licencePoints = after;
      all[id] = p; demoSet('profiles', all);
      return after;
    }
    return (await window.IFWL_Api.apiPost('staffLicencePoints', { driverId: id, delta, reason })).licencePoints;
  }

  // ✅ ADDED: Staff Alerts panel - licence points band-crossing feed
  // (supersedes staff having to watch TLS/Discord manually for amber/
  // final-warning drivers). ESCALATE (7+) alerts land here ONLY - see the
  // panel header note for why that band is never auto-posted anywhere else.
  async function fetchStaffAlerts(){
    return (await window.IFWL_Api.apiGet('staffAlerts')).alerts || [];
  }
  async function ackStaffAlert(alertId){
    return window.IFWL_Api.apiPost('staffAlertAck', { alertId });
  }
  function staffAlertBandLabel(band){
    return band === 'escalate' ? 'ESCALATE (7+)' : band === 'warning' ? 'FINAL WARNING' : 'AMBER';
  }
  function staffAlertBandClass(band){
    return band === 'escalate' ? 'pts-red' : band === 'warning' ? 'pts-warning' : 'pts-orange';
  }

  /* ---- Staff: Head Moderator (Discord moderation area) ---- */
  function hmEsc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function hmLastLogin(ms){return ms ? new Date(ms).toLocaleDateString() : 'never'}

  // The one shared compose box under both lists - which endpoint it hits
  // depends on headModComposeTarget.mode, set by whichever "Message in
  // IFWL" / "Send Discord DM" button was clicked.
  let headModComposeTarget = null; // {discordId, name, mode: 'inapp'|'discord'}
  function openHeadModCompose(discordId, name, mode){
    headModComposeTarget = { discordId, name, mode };
    q('headModComposeTitle').textContent = mode === 'inapp' ? `Message ${name} (in-app IFWL message)` : `Send ${name} a Discord DM`;
    q('headModSubjectGroup').style.display = mode === 'inapp' ? '' : 'none';
    q('headModSubject').value = '';
    q('headModComposeText').value = '';
    q('headModComposeStatus').textContent = '';
    q('headModComposeBox').classList.remove('hidden');
    q('headModComposeBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  q('headModComposeCancelBtn')?.addEventListener('click', () => {
    q('headModComposeBox').classList.add('hidden');
    headModComposeTarget = null;
  });
  q('headModComposeSendBtn')?.addEventListener('click', async () => {
    if(!headModComposeTarget) return;
    const btn = q('headModComposeSendBtn');
    const text = q('headModComposeText').value.trim();
    if(!text){ alert('Write a message first.'); return; }
    btn.disabled = true;
    const status = q('headModComposeStatus');
    status.textContent = 'Sending...';
    try{
      if(headModComposeTarget.mode === 'inapp'){
        const subject = q('headModSubject').value.trim() || 'Message from IFWL Staff';
        await window.IFWL_InboxAPI.staffSend(headModComposeTarget.discordId, subject, text);
      } else {
        await window.IFWL_Api.apiPost('staffSendDiscordDM', { driverId: headModComposeTarget.discordId, message: text });
      }
      status.textContent = 'Sent ✓';
      setTimeout(() => { q('headModComposeBox').classList.add('hidden'); headModComposeTarget = null; }, 900);
    }catch(e){
      status.textContent = 'Failed: ' + e.message;
    }finally{
      btn.disabled = false;
    }
  });

  function headModRowActionsHtml(discordId, name){
    return `
      <a class="btn ghost" href="https://discord.com/users/${encodeURIComponent(discordId)}" target="_blank" rel="noopener">Open in Discord</a>
      <button class="btn ghost" data-hm-inapp="${hmEsc(discordId)}" data-hm-name="${hmEsc(name)}" type="button">Message in IFWL</button>
      <button class="btn ghost" data-hm-dm="${hmEsc(discordId)}" data-hm-name="${hmEsc(name)}" type="button">Send Discord DM</button>`;
  }
  function bindHeadModRowActions(wrap){
    wrap.querySelectorAll('[data-hm-inapp]').forEach(btn => btn.addEventListener('click', () => openHeadModCompose(btn.dataset.hmInapp, btn.dataset.hmName, 'inapp')));
    wrap.querySelectorAll('[data-hm-dm]').forEach(btn => btn.addEventListener('click', () => openHeadModCompose(btn.dataset.hmDm, btn.dataset.hmName, 'discord')));
  }

  async function fetchHeadModMissingPlatform(){
    return (await window.IFWL_Api.apiGet('staffDriversMissingPlatform')).drivers || [];
  }
  async function renderHeadModPlatformList(){
    const wrap = q('headModPlatformList');
    if(!wrap) return;
    let drivers;
    try{ drivers = await fetchHeadModMissingPlatform(); }
    catch(e){ wrap.innerHTML = `<div class="empty">Could not load: ${hmEsc(e.message)}</div>`; return; }
    if(!drivers.length){ wrap.innerHTML = '<div class="empty">Every driver has a platform set.</div>'; return; }
    wrap.innerHTML = drivers.map(d => `
      <div class="note-item">
        <strong>${hmEsc(d.name || 'Unknown driver')}</strong> ${d.discordUsername ? `<span class="note-meta">@${hmEsc(d.discordUsername)}</span>` : ''}
        <div class="note-meta">${hmEsc(d.tier || 'No Licence')} &middot; last login ${hmLastLogin(d.lastLoginMs)}</div>
        <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">${headModRowActionsHtml(d.discordId, d.name || 'this driver')}</div>
      </div>
    `).join('');
    bindHeadModRowActions(wrap);
  }
  q('headModPlatformRefreshBtn')?.addEventListener('click', renderHeadModPlatformList);

  async function fetchHeadModFlags(){
    return (await window.IFWL_Api.apiGet('staffDiscordFlagsList')).flags || [];
  }
  async function renderHeadModFlagsList(){
    const wrap = q('headModFlagsList');
    if(!wrap) return;
    let flags;
    try{ flags = await fetchHeadModFlags(); }
    catch(e){ wrap.innerHTML = `<div class="empty">Could not load: ${hmEsc(e.message)}</div>`; return; }
    if(!flags.length){ wrap.innerHTML = '<div class="empty">No open Discord flags.</div>'; return; }
    wrap.innerHTML = flags.map(f => `
      <div class="note-item">
        <strong>${hmEsc(f.name || f.discordId)}</strong> ${f.discordUsername ? `<span class="note-meta">@${hmEsc(f.discordUsername)}</span>` : ''}
        <div class="note-meta">${hmEsc(f.detail || 'Discord sync failed')} &middot; flagged ${f.flaggedAtMs ? new Date(f.flaggedAtMs).toLocaleString() : ''}</div>
        <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">${headModRowActionsHtml(f.discordId, f.name || 'this driver')}<button class="btn ghost" data-hm-dismiss="${hmEsc(f.discordId)}" type="button">Dismiss</button></div>
      </div>
    `).join('');
    bindHeadModRowActions(wrap);
    wrap.querySelectorAll('[data-hm-dismiss]').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      try{ await window.IFWL_Api.apiPost('staffDiscordFlagResolve', { discordId: btn.dataset.hmDismiss }); await renderHeadModFlagsList(); }
      catch(e){ alert('Could not dismiss: ' + e.message); btn.disabled = false; }
    }));
  }
  q('headModFlagsRefreshBtn')?.addEventListener('click', renderHeadModFlagsList);

  // Same "own independent init, gated on its own flag rather than
  // IFWL_STAFF" pattern as initCommentatorPanel - a Head-Moderator-only
  // account never has IFWL_STAFF true, so this can't hang off
  // initStaffPanels below.
  let headModPanelsInited = false;
  function initHeadModPanels(){
    if(headModPanelsInited || !window.IFWL_HEAD_MOD) return;
    headModPanelsInited = true;
    renderHeadModPlatformList();
    renderHeadModFlagsList();
  }
  window.addEventListener('ifwl-auth-changed', initHeadModPanels);
  if(window.IFWL_HEAD_MOD) initHeadModPanels(); // covers an already-resolved session on this load

  async function renderStaffAlertsPanel(){
    const wrap = q('staffAlertsList');
    if(!wrap) return;
    let alerts;
    try{ alerts = await fetchStaffAlerts(); }
    catch(e){ wrap.innerHTML = `<div class="empty">Could not load alerts: ${e.message}</div>`; return; }
    if(!alerts.length){ wrap.innerHTML = '<div class="empty">No alerts yet.</div>'; return; }

    alerts.sort((a,b) => (a.acknowledged === b.acknowledged ? 0 : a.acknowledged ? 1 : -1) || (b.createdAtMs||0) - (a.createdAtMs||0));

    wrap.innerHTML = alerts.map(a => `
      <div class="note-item" style="${a.acknowledged ? 'opacity:.55' : ''}">
        <span class="points-value ${staffAlertBandClass(a.band)}" style="font-size:15px;display:inline;margin-right:8px">${staffAlertBandLabel(a.band)}</span>
        <strong>${a.driverName || 'Unknown driver'}</strong> is now on <strong>${a.points}</strong> licence points
        <div class="note-meta">
          ${new Date(a.createdAtMs || Date.now()).toLocaleString()}
          ${a.acknowledged ? ` &middot; acknowledged by ${a.acknowledgedBy || 'staff'}` : ''}
        </div>
        ${a.acknowledged ? '' : `<button class="btn ghost" style="margin-top:6px" data-ack-alert="${a.id}" type="button">Acknowledge</button>`}
      </div>
    `).join('');

    wrap.querySelectorAll('[data-ack-alert]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try{ await ackStaffAlert(btn.dataset.ackAlert); await renderStaffAlertsPanel(); }
        catch(e){ alert('Could not acknowledge: ' + e.message); btn.disabled = false; }
      });
    });
  }
  q('staffAlertsRefreshBtn')?.addEventListener('click', renderStaffAlertsPanel);
  q('staffAlertsBackfillBtn')?.addEventListener('click', async () => {
    const confirmText = `Backfill existing drivers now?\n\nThis notifies every driver currently on 3+ licence points and posts to Discord for AMBER/FINAL WARNING, as if it just happened right now - so their existing standing shows up in Staff Alerts instead of only future changes.\n\nESCALATE (7+) drivers still only ever raise a staff alert - no Discord post, no driver notice - same as a live crossing.\n\nSafe to run more than once - already-backfilled drivers are skipped, so this won't double-notify anyone. Type BACKFILL to confirm.`;
    const typed = prompt(confirmText);
    if(typed !== 'BACKFILL') return;
    const btn = q('staffAlertsBackfillBtn');
    btn.disabled = true;
    btn.textContent = 'Backfilling...';
    try{
      const result = await window.IFWL_Api.apiPost('staffLicencePointsBackfill', { confirm: 'BACKFILL' });
      alert(`Done - backfilled ${result.processed} driver(s).`);
      await renderStaffAlertsPanel();
    }catch(e){
      alert('Could not backfill: ' + e.message);
    }finally{
      btn.disabled = false;
      btn.textContent = 'Backfill Existing Drivers';
    }
  });

  // =====================================================================
  // ✅ ADDED: Staff: AC Rally Events
  // Time-format helpers (acRallyFmtTime/acRallyParseTime/acRallyCanLockIn) are
  // defined in the earlier driver-facing script block and bridged onto
  // window - see the "AC RALLY KNOCKOUT EVENTS - driver-facing" section
  // for why (each inline <script> block on this page is its own closure).
  // =====================================================================

  let acRallyEventsCache = [];
  let acRallyDetailEventId = null;

  async function fetchAcRallyEventsStaff(){
    return (await window.IFWL_Api.apiGet('staffAcRallyEventList')).events || [];
  }
  async function createAcRallyEvent(title, description){
    return window.IFWL_Api.apiPost('staffAcRallyEventCreate', { title, description });
  }
  async function deleteAcRallyEvent(eventId){
    return window.IFWL_Api.apiPost('staffAcRallyEventDelete', { eventId });
  }
  async function updateAcRallyEvent(eventId, fields){
    return window.IFWL_Api.apiPost('staffAcRallyEventUpdate', { eventId, ...fields });
  }
  async function editAcRallyEntrant(eventId, driverId, action){
    return window.IFWL_Api.apiPost('staffAcRallyEditEntrants', { eventId, driverId, action });
  }
  async function lockInAcRallyEvent(eventId, roundDeadlines){
    return window.IFWL_Api.apiPost('staffAcRallyLockIn', { eventId, roundDeadlines });
  }
  async function saveAcRallyRoundConfig(eventId, roundIndex, stages, name, scheduledAtMs){
    const body = { eventId, roundIndex, stages, name };
    if(scheduledAtMs !== undefined) body.scheduledAtMs = scheduledAtMs;
    return window.IFWL_Api.apiPost('staffAcRallyRoundConfig', body);
  }
  async function reviewAcRallySubmission(eventId, roundIndex, submissionId, decision, refusalReason){
    return window.IFWL_Api.apiPost('staffAcRallySubmissionReview', { eventId, roundIndex, submissionId, decision, refusalReason });
  }
  async function manualAcRallyTimeOverride(eventId, roundIndex, driverId, stageIndex, seconds){
    return window.IFWL_Api.apiPost('staffAcRallyManualTimeOverride', { eventId, roundIndex, driverId, stageIndex, seconds });
  }
  async function advanceAcRallyRound(eventId, roundIndex){
    return window.IFWL_Api.apiPost('staffAcRallyAdvanceRound', { eventId, roundIndex });
  }
  // ✅ ADDED: adds a driver straight into the currently open round of an
  // already-locked-in event (a late joiner who missed original signup) -
  // see staffAcRallyAddLateDriver in rtgate.js.
  async function addLateAcRallyDriver(eventId, driverId){
    return window.IFWL_Api.apiPost('staffAcRallyAddLateDriver', { eventId, driverId });
  }
  // ✅ ADDED: disqualify (action:'dq', with an optional reason) or reinstate
  // (action:'reinstate') a driver in the currently open round - see
  // staffAcRallyDisqualifyDriver in rtgate.js.
  async function disqualifyAcRallyDriver(eventId, driverId, action, reason){
    return window.IFWL_Api.apiPost('staffAcRallyDisqualifyDriver', { eventId, driverId, action, reason });
  }
  // ✅ ADDED: bulk-grants an add-on licence tier (AC Rally, Hypercar, LMP3,
  // ...) to a chosen set of this event's entrants - see the "Grant Licence"
  // section in renderAcRallyDetail and staffAcRallyGrantLicence in
  // rtgate.js.
  async function grantAcRallyLicence(eventId, tierId, driverIds){
    return window.IFWL_Api.apiPost('staffAcRallyGrantLicence', { eventId, tierId, driverIds });
  }

  function acRallyRoundStatusBadge(status){
    return status === 'open' ? '<span class="badge teal">Open</span>' : status === 'completed' ? '<span class="badge purple">Completed</span>' : '<span class="badge">Pending</span>';
  }

  function acRallyDetailFindEvent(){
    return acRallyEventsCache.find(e => e.id === acRallyDetailEventId) || null;
  }

  function renderAcRallyRoundHtml(ev, round, dirMap){
    const stages = round.stages || [];
    const drivers = round.drivers || [];
    const results = round.results || {};
    const ranked = drivers.map(id => ({ id, ...(results[id]||{}) })).sort((a,b) => (a.rank||999) - (b.rank||999));
    // ✅ ADDED: disqualified drivers are pulled out of round.drivers (see
    // staffAcRallyDisqualifyDriver) but their result stays behind marked
    // dq:true - surface them separately with a Reinstate option instead of
    // letting them silently disappear from the staff view.
    const dqRows = Object.keys(results).filter(id => results[id]?.dq && !drivers.includes(id)).map(id => ({ id, ...results[id] }));

    let html = `<div class="note-item" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <strong>${round.name} ${acRallyRoundStatusBadge(round.status)}</strong>
      </div>`;

    if(round.status === 'pending'){
      html += `<div class="field-hint" style="margin-top:8px">Opens once the previous round is advanced - stages can still be planned ahead of time below.</div>`;
    }

    html += `<div style="margin-top:10px">
      <em class="field-hint">Times Required By (submission deadline - shown to every driver)</em>
      <input type="datetime-local" data-round-schedule="${round.roundIndex}" value="${window.acRallyMsToDatetimeLocal(round.scheduledAtMs)}" style="margin-top:6px;display:block;width:220px">
    </div>`;

    html += `<div style="margin-top:10px"><em class="field-hint">Stages (track / weather / assists)</em>`;
    html += stages.map((s,i) => `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-top:6px">
        <input type="text" data-stage-field="name" data-round="${round.roundIndex}" data-stage="${i}" value="${s.name||''}" placeholder="Stage name">
        <input type="text" data-stage-field="track" data-round="${round.roundIndex}" data-stage="${i}" value="${s.track||''}" placeholder="Track">
        <input type="text" data-stage-field="weather" data-round="${round.roundIndex}" data-stage="${i}" value="${s.weather||''}" placeholder="Weather">
        <input type="text" data-stage-field="assists" data-round="${round.roundIndex}" data-stage="${i}" value="${s.assists||''}" placeholder="Assists">
      </div>
    `).join('');
    html += `<button class="btn ghost" data-save-stages="${round.roundIndex}" type="button" style="margin-top:8px" ${round.status==='completed'?'disabled':''}>Save Stage Config</button></div>`;

    if(drivers.length){
      // ✅ CHANGED: was a plain <table> - now driver-directory-style cards
      // (see acRallyResultCardHtml, shared with the driver-facing results
      // page) with a per-card Disqualify button while the round's still
      // open, for a driver who's gone quiet and isn't submitting times.
      const canEdit = round.status === 'open';
      html += `<div class="acr-grid" style="margin-top:12px">${ranked.map(r => {
        const extra = canEdit ? `<div class="acr-card-actions"><button class="btn ghost owner-only-tab" data-dq-driver="${r.id}" data-round="${round.roundIndex}" type="button">Disqualify</button></div>` : '';
        return window.acRallyResultCardHtml(r, stages, extra, dirMap?.get(r.id));
      }).join('')}</div>`;
    }

    if(dqRows.length){
      const canEdit = round.status === 'open';
      html += `<h5 class="acr-dq-heading">Disqualified</h5><div class="acr-grid">${dqRows.map(r => {
        const extra = canEdit ? `<div class="acr-card-actions"><button class="btn ghost owner-only-tab" data-reinstate-driver="${r.id}" data-round="${round.roundIndex}" type="button">Reinstate</button></div>` : '';
        return window.acRallyResultCardHtml(r, stages, extra, dirMap?.get(r.id));
      }).join('')}</div>`;
    }

    if(round.status === 'open'){
      // ✅ ADDED: add a driver who missed the original signup/lock-in
      // straight into this open round - see addLateAcRallyDriver /
      // staffAcRallyAddLateDriver. Reuses the same driver-search picker
      // widget as "Add entrant" during signup.
      html += `<div style="display:flex;gap:8px;margin-top:10px;align-items:flex-end;flex-wrap:wrap">
        <div class="trophy-driver-picker" id="acRallyLateDriverPicker-${round.roundIndex}" style="flex:1;min-width:220px">
          <label>Add a driver who missed out (joins this round)</label>
          <input type="text" class="tdp-search" placeholder="Search driver by name or licence number...">
          <div class="tdp-selected">None selected</div>
          <div class="ticket-picker-results hidden"></div>
        </div>
        <button class="btn ghost owner-only-tab" data-add-late-driver="${round.roundIndex}" type="button">Add to round</button>
      </div>`;

      html += `<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;align-items:center">
        <select data-override-driver="${round.roundIndex}">${drivers.map(id => `<option value="${id}">${results[id]?.name||id}</option>`).join('')}</select>
        <select data-override-stage="${round.roundIndex}">${stages.map((s,i)=>`<option value="${i}">${s.name||'Stage '+(i+1)}</option>`).join('')}</select>
        <input type="text" data-override-time="${round.roundIndex}" placeholder="mm:ss.mmm" style="width:120px">
        <button class="btn ghost owner-only-tab" data-set-override="${round.roundIndex}" type="button">Set Time (Owner)</button>
      </div>`;

      const pending = (round.submissions||[]).filter(s => s.status === 'pending');
      if(pending.length){
        html += `<div style="margin-top:14px"><strong>Pending submissions (${pending.length})</strong>`;
        html += pending.map(s => `
          <div class="note-item" style="margin-top:6px">
            <strong>${results[s.driverId]?.name || s.driverId}</strong> - ${stages[s.stageIndex]?.name || 'Stage '+(s.stageIndex+1)}: ${window.acRallyFmtTime(s.claimedSeconds)}
            <div style="margin-top:6px"><a href="${s.imageUrl}" target="_blank" rel="noopener">View screenshot</a></div>
            <div style="margin-top:6px;display:flex;gap:6px">
              <button class="btn purple" data-verify-sub="${round.roundIndex}:${s.id}" type="button">Verify</button>
              <button class="btn ghost" data-refuse-sub="${round.roundIndex}:${s.id}" type="button">Refuse</button>
            </div>
          </div>
        `).join('');
        html += `</div>`;
      }

      // ✅ ADDED: the Final doesn't advance anywhere - clicking this on it
      // crowns the champion and completes the event (same backend endpoint,
      // isFinal branch), so the button and confirmation need to say that
      // instead of "Advance Round", which was confusingly implying a round
      // that doesn't exist.
      // ✅ CHANGED: was `drivers.length <= 4`, which mislabels the button
      // the moment a late driver (see the "Add to round" picker above)
      // pushes the Final's count above 4 - position in the bracket is what
      // actually decides this, not how many are currently in it (matches
      // the same fix in staffAcRallyAdvanceRound server-side).
      const isFinalRound = round.roundIndex === (ev.rounds.length - 1);
      html += `<button class="btn purple owner-only-tab" data-advance-round="${round.roundIndex}" type="button" style="margin-top:12px">${isFinalRound ? 'Crown Champion' : 'Advance Round'}</button>`;
    }

    html += `</div>`;
    return html;
  }

  async function renderAcRallyDetail(){
    const wrap = q('acRallyEventDetail');
    if(!wrap) return;
    const ev = acRallyDetailFindEvent();
    if(!ev){ wrap.innerHTML = ''; return; }

    // ✅ ADDED: same Driver Directory lookup the driver-facing results page
    // uses (avatars/header images/team logos/tiers), so staff result cards
    // show the same photo/team/tier chrome instead of plain text. Only
    // needed once rounds actually exist (status !== 'signup').
    let dirMap = null;
    if(ev.status !== 'signup'){
      try{
        const directory = await window.fetchDirectory();
        dirMap = new Map(directory.map(d => [d.discordId, d]));
      }catch(e){ console.warn('Could not load directory data for AC Rally staff results', e); }
    }

    let html = `<div class="panel-head" style="margin-top:20px"><div><h4 style="margin:0">${ev.title}</h4><small>${ev.description || ''}</small></div></div>`;
    html += `<div class="note-item" style="margin-top:10px">
      <strong style="font-size:12.5px">Event image</strong>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:8px">
        <img src="${ev.imageUrl || window.acRallyImgPlaceholder}" alt="" style="width:120px;height:68px;object-fit:cover;border-radius:8px;background:#1a2027">
        <div>
          <input type="file" id="acRallyImageFile" accept="image/jpeg,image/png">
          <button class="btn ghost" id="acRallyImageUploadBtn" type="button" style="margin-top:6px">Upload &amp; Set Image</button>
          <div class="field-hint" style="margin-top:4px">Shown on this event's card under Available Races - matches the SimGrid event look.</div>
        </div>
      </div>
    </div>`;

    // ✅ ADDED: Grant Licence - AC Rally is "an additional licence alongside
    // the normal licences, like LMU" (never touches a driver's main tier),
    // so this bulk-grants any staff-approved add-on licence tier to a
    // chosen set of this event's entrants in one go, instead of staff
    // having to go driver-by-driver through the LMU request queue for an
    // event drivers signed up to directly rather than individually
    // requesting - see staffAcRallyGrantLicence in rtgate.js. Every entrant
    // is pre-checked; untick anyone who shouldn't get it. Available at any
    // stage of the event (signup/in progress/completed) since entrants are
    // known as soon as they sign up.
    const entrantsForGrant = ev.entrants || [];
    if(entrantsForGrant.length){
      let addOnTiers = [];
      try{
        const tierList = await window.IFWL_TierAPI.fetchTierList();
        addOnTiers = (tierList || []).filter(t => t.lmuSubLicence);
      }catch(e){ console.warn('Could not load tier list for Grant Licence', e); }

      html += `<div class="note-item" style="margin-top:14px">
        <strong style="font-size:12.5px">Grant Licence</strong>
        <div class="field-hint" style="margin-top:4px">Grant a staff-approved add-on licence (e.g. AC Rally) to entrants below - adds it to their profile alongside their normal licence and pushes the matching Discord role live, same as approving one through the LMU request queue.</div>
        ${addOnTiers.length ? `
          <select id="acRallyGrantTierSelect" style="margin-top:8px">
            ${addOnTiers.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
          <div style="margin-top:8px">${entrantsForGrant.map(e => `
            <label style="display:inline-flex;align-items:center;gap:4px;margin:2px 10px 2px 0;font-size:12.5px">
              <input type="checkbox" class="ac-rally-grant-driver" value="${e.driverId}" checked> ${e.name}
            </label>
          `).join('')}</div>
          <button class="btn purple ops-only-tab" id="acRallyGrantLicenceBtn" type="button" style="margin-top:10px">Grant to Selected</button>
        ` : `<div class="field-hint" style="margin-top:6px">No add-on licence tiers exist yet - flag one (e.g. AC Rally) as an add-on in Staff &gt; Manage Licence Tiers first.</div>`}
      </div>`;
    }

    if(ev.status === 'signup'){
      const entrants = ev.entrants || [];
      html += `<div class="staff-only-note">${entrants.length} signed up. Needs at least 4 entrants before you can lock in.</div>`;
      html += `<div style="margin-top:8px">${entrants.map(e => `<span class="badge" style="margin:2px">${e.name} <button data-remove-entrant="${e.driverId}" type="button" style="background:none;border:none;color:var(--ifwl-red);cursor:pointer;margin-left:4px">&times;</button></span>`).join('') || '<span class="field-hint">No entrants yet.</span>'}</div>`;
      html += `<div style="display:flex;gap:8px;margin-top:10px;align-items:flex-end;flex-wrap:wrap">
        <div class="trophy-driver-picker" id="acRallyAddDriverPicker" style="flex:1;min-width:220px">
          <label>Add entrant</label>
          <input type="text" class="tdp-search" placeholder="Search driver by name or licence number...">
          <div class="tdp-selected">None selected</div>
          <div class="ticket-picker-results hidden"></div>
        </div>
        <button class="btn ghost" id="acRallyAddEntrantBtn" type="button">Add</button>
      </div>`;
      // ✅ ADDED: Times Required By - once the field is big enough to lock
      // in, show exactly which rounds this bracket will contain and require
      // a submission deadline for every one of them before Lock In is
      // allowed to fire. Fixes the AC Rally Beta 01 problem where deadlines
      // were only ever set (if at all) on a round-by-round basis after the
      // fact, once a round had already opened - drivers had no way to know
      // upfront what the whole event's timeline looked like.
      if(window.acRallyCanLockIn(entrants.length)){
        const previewRounds = window.acRallyPreviewRounds(entrants.length);
        html += `<div class="note-item" style="margin-top:14px">
          <strong style="font-size:12.5px">Times Required By</strong>
          <div class="field-hint" style="margin-top:4px">Set a submission deadline for every round this bracket will contain - posted to every driver the moment this event locks in, so nobody can say they didn't know.</div>
          ${previewRounds.map(r => `
            <div style="margin-top:8px">
              <label style="font-size:12px;font-weight:700;display:block">${r.name}</label>
              <input type="datetime-local" data-lockin-deadline="${r.roundIndex}" style="margin-top:4px;width:220px">
            </div>
          `).join('')}
        </div>`;
      }
      html += `<button class="btn purple owner-only-tab" id="acRallyLockInBtn" type="button" style="margin-top:12px" ${window.acRallyCanLockIn(entrants.length) ? '' : 'disabled'}>Lock In (${entrants.length} drivers)</button>`;
      if(!window.acRallyCanLockIn(entrants.length)) html += `<div class="field-hint" style="margin-top:6px">Add at least 4 entrants before you can lock in.</div>`;
    } else {
      html += `<div class="staff-only-note">${ev.bracketSize} drivers &middot; locked ${new Date(ev.lockedAtMs).toLocaleString()}</div>`;
      if(ev.status === 'completed'){
        html += `<div class="note-item" style="margin-top:10px;border-color:var(--ifwl-amber)"><strong>&#127942; Champion: ${ev.championName}</strong></div>`;
      }
      (ev.rounds||[]).forEach(round => { html += renderAcRallyRoundHtml(ev, round, dirMap); });
    }

    wrap.innerHTML = html;
    wireAcRallyDetailHandlers(ev);
  }

  function wireAcRallyDetailHandlers(ev){
    q('acRallyGrantLicenceBtn')?.addEventListener('click', async () => {
      const select = q('acRallyGrantTierSelect');
      const tierId = select?.value || '';
      const tierName = select?.selectedOptions?.[0]?.textContent || 'this licence';
      const driverIds = Array.from(document.querySelectorAll('.ac-rally-grant-driver:checked')).map(el => el.value);
      if(!tierId){ alert('Choose a licence to grant first.'); return; }
      if(!driverIds.length){ alert('Select at least one driver.'); return; }
      if(!confirm(`Grant "${tierName}" to ${driverIds.length} driver(s)? This adds it to their profile and pushes the Discord role live - safe to re-run on the same drivers if anyone's Discord role didn't land the first time.`)) return;
      const btn = q('acRallyGrantLicenceBtn');
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = 'Granting...';
      try{
        const result = await grantAcRallyLicence(ev.id, tierId, driverIds);
        // ✅ FIXED: the backend now re-attempts the Discord role grant for
        // every selected driver on every click (not just newly-added ones),
        // so surface roleSyncFailedCount and point staff at re-running the
        // grant rather than leaving a silent gap - see
        // staffAcRallyGrantLicence in rtgate.js for why some drivers could
        // previously end up with the profile flag but no Discord role.
        let msg = `Granted "${tierName}" to ${result.grantedCount} driver(s)${result.alreadyHeldCount ? ` - ${result.alreadyHeldCount} already held it` : ''}.`;
        if(result.roleSyncFailedCount) msg += `\n\n${result.roleSyncFailedCount} Discord role grant(s) failed (Discord API issue, not a profile issue) - select the same drivers and hit Grant again to retry, it's safe to re-run.`;
        alert(msg);
      }catch(e){
        alert('Could not grant: ' + e.message);
      }finally{
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
    q('acRallyImageUploadBtn')?.addEventListener('click', async () => {
      const fileInput = q('acRallyImageFile');
      const file = fileInput?.files?.[0];
      if(!file){ alert('Choose an image first.'); return; }
      const btn = q('acRallyImageUploadBtn');
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = 'Uploading...';
      try{
        const uploaded = await window.IFWL_UploadAPI.uploadLicenceImage(file, 'acRallyEventImage');
        await updateAcRallyEvent(ev.id, { imageUrl: uploaded.url });
        await renderAcRallyStaffPanel();
      }catch(e){
        alert('Could not upload image: ' + e.message);
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
    const acRallyAddPicker = q('acRallyAddDriverPicker');
    if(acRallyAddPicker) wireTrophyDriverPicker(acRallyAddPicker);
    q('acRallyAddEntrantBtn')?.addEventListener('click', async () => {
      const driverId = acRallyAddPicker?.dataset.discordId || '';
      if(!driverId){ alert('Search and pick a driver first.'); return; }
      try{ await editAcRallyEntrant(ev.id, driverId, 'add'); await renderAcRallyStaffPanel(); }
      catch(e){ alert('Could not add: ' + e.message); }
    });
    document.querySelectorAll('[data-remove-entrant]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try{ await editAcRallyEntrant(ev.id, btn.dataset.removeEntrant, 'remove'); await renderAcRallyStaffPanel(); }
        catch(e){ alert('Could not remove: ' + e.message); }
      });
    });
    q('acRallyLockInBtn')?.addEventListener('click', async () => {
      // ✅ ADDED: gather the Times Required By deadline for every previewed
      // round - all of them required, so Lock In can't fire (backend
      // enforces this too) until every round has a posted deadline.
      const deadlineInputs = document.querySelectorAll('[data-lockin-deadline]');
      const roundDeadlines = [];
      for(const input of deadlineInputs){
        if(!input.value){ alert('Please set a submission deadline for every round before locking in - drivers need to know upfront when their times are due.'); return; }
        roundDeadlines[Number(input.dataset.lockinDeadline)] = new Date(input.value).getTime();
      }
      if(!confirm(`Lock in ${(ev.entrants||[]).length} drivers now? This shuffles the roster and builds the full bracket - can't be undone.`)) return;
      try{ await lockInAcRallyEvent(ev.id, roundDeadlines); await renderAcRallyStaffPanel(); }
      catch(e){ alert('Could not lock in: ' + e.message); }
    });

    document.querySelectorAll('[data-save-stages]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const roundIndex = Number(btn.dataset.saveStages);
        const stages = [];
        document.querySelectorAll(`[data-stage-field][data-round="${roundIndex}"]`).forEach(input => {
          const i = Number(input.dataset.stage);
          stages[i] = stages[i] || {};
          stages[i][input.dataset.stageField] = input.value;
        });
        const scheduleInput = document.querySelector(`[data-round-schedule="${roundIndex}"]`);
        const scheduledAtMs = scheduleInput && scheduleInput.value ? new Date(scheduleInput.value).getTime() : null;
        try{ await saveAcRallyRoundConfig(ev.id, roundIndex, stages, undefined, scheduledAtMs); await renderAcRallyStaffPanel(); }
        catch(e){ alert('Could not save: ' + e.message); }
      });
    });

    document.querySelectorAll('[data-set-override]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const roundIndex = Number(btn.dataset.setOverride);
        const driverId = document.querySelector(`[data-override-driver="${roundIndex}"]`).value;
        const stageIndex = Number(document.querySelector(`[data-override-stage="${roundIndex}"]`).value);
        const timeStr = document.querySelector(`[data-override-time="${roundIndex}"]`).value;
        const seconds = window.acRallyParseTime(timeStr);
        if(!Number.isFinite(seconds) || seconds <= 0){ alert('Enter a valid time, e.g. 1:23.456'); return; }
        try{ await manualAcRallyTimeOverride(ev.id, roundIndex, driverId, stageIndex, seconds); await renderAcRallyStaffPanel(); }
        catch(e){ alert('Could not set time: ' + e.message); }
      });
    });

    document.querySelectorAll('[data-add-late-driver]').forEach(btn => {
      const roundIndex = btn.dataset.addLateDriver;
      const picker = q(`acRallyLateDriverPicker-${roundIndex}`);
      if(picker) wireTrophyDriverPicker(picker);
      btn.addEventListener('click', async () => {
        const driverId = picker?.dataset.discordId || '';
        if(!driverId){ alert('Search and pick a driver first.'); return; }
        btn.disabled = true;
        try{
          const result = await addLateAcRallyDriver(ev.id, driverId);
          alert(`${result.name} added to ${result.roundName}.`);
          await renderAcRallyStaffPanel();
        }catch(e){ alert('Could not add driver: ' + e.message); btn.disabled = false; }
      });
    });
    document.querySelectorAll('[data-dq-driver]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const driverId = btn.dataset.dqDriver;
        const reason = prompt('Reason for disqualifying this driver? (e.g. no times submitted, shown to them)') || '';
        if(!confirm('Disqualify this driver from the current round? They can be reinstated afterwards if needed.')) return;
        btn.disabled = true;
        try{ await disqualifyAcRallyDriver(ev.id, driverId, 'dq', reason); await renderAcRallyStaffPanel(); }
        catch(e){ alert('Could not disqualify: ' + e.message); btn.disabled = false; }
      });
    });
    document.querySelectorAll('[data-reinstate-driver]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const driverId = btn.dataset.reinstateDriver;
        btn.disabled = true;
        try{ await disqualifyAcRallyDriver(ev.id, driverId, 'reinstate'); await renderAcRallyStaffPanel(); }
        catch(e){ alert('Could not reinstate: ' + e.message); btn.disabled = false; }
      });
    });
    document.querySelectorAll('[data-verify-sub]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const [roundIndex, subId] = btn.dataset.verifySub.split(':');
        try{ await reviewAcRallySubmission(ev.id, Number(roundIndex), subId, 'verify'); await renderAcRallyStaffPanel(); }
        catch(e){ alert('Could not verify: ' + e.message); }
      });
    });
    document.querySelectorAll('[data-refuse-sub]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt('Reason for refusing this submission?');
        if(!reason) return;
        const [roundIndex, subId] = btn.dataset.refuseSub.split(':');
        try{ await reviewAcRallySubmission(ev.id, Number(roundIndex), subId, 'refuse', reason); await renderAcRallyStaffPanel(); }
        catch(e){ alert('Could not refuse: ' + e.message); }
      });
    });
    document.querySelectorAll('[data-advance-round]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const roundIndex = Number(btn.dataset.advanceRound);
        const round = (ev.rounds || [])[roundIndex];
        const isFinalRound = roundIndex === ((ev.rounds || []).length - 1);
        const confirmMsg = isFinalRound
          ? "Crown the champion now? Any driver without a verified time in every stage will be treated as last / eliminated. This finishes the event and cannot be undone."
          : "Advance this round now? Any driver without a verified time in every stage will be treated as last / eliminated. This cannot be undone.";
        if(!confirm(confirmMsg)) return;
        try{
          const result = await advanceAcRallyRound(ev.id, roundIndex);
          alert(result.champion ? `Champion: ${result.champion}!` : `Advanced: ${result.advancedNames.join(', ')}`);
          await renderAcRallyStaffPanel();
        }catch(e){ alert('Could not advance: ' + e.message); }
      });
    });
  }

  async function renderAcRallyStaffPanel(){
    const wrap = q('acRallyEventsList');
    if(!wrap) return;
    try{ acRallyEventsCache = await fetchAcRallyEventsStaff(); }
    catch(e){ wrap.innerHTML = `<div class="empty">Could not load events: ${e.message}</div>`; return; }

    if(!acRallyEventsCache.length){
      wrap.innerHTML = '<div class="empty">No AC Rally events yet - create one above.</div>';
    } else {
      wrap.innerHTML = acRallyEventsCache.map(ev => `
        <div class="note-item">
          <strong>${ev.title}</strong>
          <span class="badge ${ev.status === 'completed' ? 'purple' : ev.status === 'signup' ? '' : 'teal'}" style="margin-left:8px">${ev.status === 'signup' ? 'Open for signup' : ev.status === 'in_progress' ? 'In progress' : ev.status === 'completed' ? 'Completed' : ev.status}</span>
          <div class="note-meta">
            ${ev.status === 'signup' ? `${(ev.entrants||[]).length} signed up` : `${ev.bracketSize} drivers &middot; ${ev.status === 'completed' ? `Champion: ${ev.championName || '-'}` : `Round: ${(ev.rounds||[])[ev.currentRoundIndex]?.name || '-'}`}`}
          </div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn ghost" data-manage-ac-rally="${ev.id}" type="button">Manage</button>
            <button class="btn ghost owner-only-tab" data-delete-ac-rally="${ev.id}" type="button">Delete</button>
          </div>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-manage-ac-rally]').forEach(btn => {
        btn.addEventListener('click', () => { acRallyDetailEventId = btn.dataset.manageAcRally; renderAcRallyDetail(); });
      });
      wrap.querySelectorAll('[data-delete-ac-rally]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if(!confirm('Delete this event? This cannot be undone.')) return;
          try{
            await deleteAcRallyEvent(btn.dataset.deleteAcRally);
            if(acRallyDetailEventId === btn.dataset.deleteAcRally){ acRallyDetailEventId = null; q('acRallyEventDetail').innerHTML = ''; }
            await renderAcRallyStaffPanel();
          }catch(e){ alert('Could not delete: ' + e.message); }
        });
      });
    }

    if(acRallyDetailEventId) renderAcRallyDetail();
  }

  q('acRallyCreateBtn')?.addEventListener('click', async () => {
    const title = q('acRallyNewTitle').value.trim();
    const description = q('acRallyNewDescription').value.trim();
    if(!title){ alert('A title is required.'); return; }
    try{
      await createAcRallyEvent(title, description);
      q('acRallyNewTitle').value = ''; q('acRallyNewDescription').value = '';
      await renderAcRallyStaffPanel();
    }catch(e){ alert('Could not create: ' + e.message); }
  });
  q('acRallyRefreshBtn')?.addEventListener('click', renderAcRallyStaffPanel);

  // =====================================================================
  // ✅ ADDED: Staff: RL 3v3 Events
  // Same self-service-signup / staff Lock In shape as AC Rally Events
  // above, but Lock In auto-shuffles the signup pool into squads of 3 and
  // builds a head-to-head single-elimination bracket (rounds[i].matches[])
  // instead of a ranked-field-cut one. rlSquadNameById/rlImgPlaceholder/
  // rlIsValidEntrantCount are defined in the earlier driver-facing script
  // block and bridged onto window - see the "RL 3v3 KNOCKOUT EVENTS -
  // driver-facing" section for why (each inline <script> block on this
  // page is its own closure).
  // =====================================================================

  let rlEventsCache = [];
  let rlDetailEventId = null;

  async function fetchRlEventsStaff(){
    return (await window.IFWL_Api.apiGet('staffRlEventList')).events || [];
  }
  async function createRlEvent(title, description, scheduledAtMs){
    const body = { title, description };
    if(scheduledAtMs !== undefined) body.scheduledAtMs = scheduledAtMs;
    return window.IFWL_Api.apiPost('staffRlEventCreate', body);
  }
  async function deleteRlEvent(eventId){
    return window.IFWL_Api.apiPost('staffRlEventDelete', { eventId });
  }
  async function updateRlEvent(eventId, fields){
    return window.IFWL_Api.apiPost('staffRlEventUpdate', { eventId, ...fields });
  }
  async function editRlEntrant(eventId, driverId, action){
    return window.IFWL_Api.apiPost('staffRlEditEntrants', { eventId, driverId, action });
  }
  async function lockInRlEvent(eventId){
    return window.IFWL_Api.apiPost('staffRlLockIn', { eventId });
  }
  // "move if required" - only usable before any round-0 match has been
  // decided (see the note on the Squads block in renderRlDetail below).
  async function reassignRlSquad(eventId, driverId, toSquadId){
    return window.IFWL_Api.apiPost('staffRlSquadReassign', { eventId, driverId, toSquadId });
  }
  async function saveRlRoundConfig(eventId, roundIndex, bestOf, scheduledAtMs){
    const body = { eventId, roundIndex };
    if(bestOf !== undefined) body.bestOf = bestOf;
    if(scheduledAtMs !== undefined) body.scheduledAtMs = scheduledAtMs;
    return window.IFWL_Api.apiPost('staffRlRoundConfig', body);
  }
  async function reviewRlSubmission(eventId, roundIndex, matchIndex, submissionId, decision, refusalReason){
    return window.IFWL_Api.apiPost('staffRlMatchSubmissionReview', { eventId, roundIndex, matchIndex, submissionId, decision, refusalReason });
  }
  async function manualRlMatchOverride(eventId, roundIndex, matchIndex, scoreA, scoreB){
    return window.IFWL_Api.apiPost('staffRlManualMatchOverride', { eventId, roundIndex, matchIndex, scoreA, scoreB });
  }
  async function advanceRlRound(eventId, roundIndex){
    return window.IFWL_Api.apiPost('staffRlAdvanceRound', { eventId, roundIndex });
  }

  function rlRoundStatusBadge(status){
    return status === 'open' ? '<span class="badge teal">Open</span>' : status === 'completed' ? '<span class="badge purple">Completed</span>' : '<span class="badge">Pending</span>';
  }

  function rlDetailFindEvent(){
    return rlEventsCache.find(e => e.id === rlDetailEventId) || null;
  }

  function renderRlRoundHtml(ev, round){
    const matches = round.matches || [];

    let html = `<div class="note-item" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <strong>${round.name} ${rlRoundStatusBadge(round.status)}</strong>
      </div>`;

    if(round.status === 'pending'){
      html += `<div class="field-hint" style="margin-top:8px">Opens once the previous round is advanced - best-of length and schedule can still be planned ahead of time below.</div>`;
    }

    html += `<div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">
      <div>
        <em class="field-hint">Best of (must be odd)</em>
        <input type="number" min="1" step="2" data-round-bestof="${round.roundIndex}" value="${round.bestOf}" style="display:block;width:90px;margin-top:6px" ${round.status === 'completed' ? 'disabled' : ''}>
      </div>
      <div>
        <em class="field-hint">Scheduled date/time (optional - shown to squads on Available Races as a heads-up)</em>
        <input type="datetime-local" data-round-schedule="${round.roundIndex}" value="${window.acRallyMsToDatetimeLocal(round.scheduledAtMs)}" style="margin-top:6px;display:block;width:220px" ${round.status === 'completed' ? 'disabled' : ''}>
      </div>
      <button class="btn ghost" data-save-round="${round.roundIndex}" type="button" ${round.status === 'completed' ? 'disabled' : ''}>Save Round Config</button>
    </div>`;

    if(matches.length){
      html += `<div style="overflow-x:auto;margin-top:12px"><table class="mono" style="width:100%;font-size:12.5px"><thead><tr><th>Squad A</th><th>Score</th><th>Squad B</th><th>Status</th></tr></thead><tbody>`;
      html += matches.map(m => `<tr>
        <td>${window.rlSquadNameById(ev, m.squadAId)}</td>
        <td>${m.finalScoreA ?? '-'} - ${m.finalScoreB ?? '-'}</td>
        <td>${window.rlSquadNameById(ev, m.squadBId)}</td>
        <td>${m.status === 'completed' ? (m.winnerSquadId === m.squadAId ? window.rlSquadNameById(ev, m.squadAId) + ' won' : window.rlSquadNameById(ev, m.squadBId) + ' won') : m.status}</td>
      </tr>`).join('');
      html += `</tbody></table></div>`;
    }

    if(round.status === 'open'){
      matches.forEach(m => {
        if(m.status === 'completed') return;
        const pending = (m.submissions || []).filter(s => s.status === 'pending');
        html += `<div class="note-item" style="margin-top:10px">
          <strong>${window.rlSquadNameById(ev, m.squadAId)} vs ${window.rlSquadNameById(ev, m.squadBId)}</strong> (Bo${m.bestOf})
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
            <input type="number" min="0" step="1" placeholder="Squad A score" data-override-score-a="${round.roundIndex}:${m.matchIndex}" style="width:130px">
            <input type="number" min="0" step="1" placeholder="Squad B score" data-override-score-b="${round.roundIndex}:${m.matchIndex}" style="width:130px">
            <button class="btn ghost owner-only-tab" data-set-match-override="${round.roundIndex}:${m.matchIndex}" type="button">Set Score (Owner)</button>
          </div>`;

        if(pending.length){
          html += `<div style="margin-top:10px"><strong>Pending submissions (${pending.length})</strong>`;
          html += pending.map(s => `
            <div class="note-item" style="margin-top:6px">
              <strong>${window.rlSquadNameById(ev, s.submittedBySquadId)}</strong> claims <strong>${s.scoreA} - ${s.scoreB}</strong>
              <div style="margin-top:6px"><a href="${s.imageUrl}" target="_blank" rel="noopener">View screenshot</a></div>
              <div style="margin-top:6px;display:flex;gap:6px">
                <button class="btn purple" data-verify-match-sub="${round.roundIndex}:${m.matchIndex}:${s.id}" type="button">Verify</button>
                <button class="btn ghost" data-refuse-match-sub="${round.roundIndex}:${m.matchIndex}:${s.id}" type="button">Refuse</button>
              </div>
            </div>
          `).join('');
          html += `</div>`;
        }
        html += `</div>`;
      });

      const isFinalRound = matches.length === 1;
      html += `<button class="btn purple owner-only-tab" data-advance-rl-round="${round.roundIndex}" type="button" style="margin-top:12px">${isFinalRound ? 'Crown Champion' : 'Advance Round'}</button>`;
    }

    html += `</div>`;
    return html;
  }

  function renderRlDetail(){
    const wrap = q('rlEventDetail');
    if(!wrap) return;
    const ev = rlDetailFindEvent();
    if(!ev){ wrap.innerHTML = ''; return; }

    let html = `<div class="panel-head" style="margin-top:20px"><div><h4 style="margin:0">${ev.title}</h4><small>${ev.description || ''}</small></div></div>`;
    html += `<div class="note-item" style="margin-top:10px">
      <strong style="font-size:12.5px">Event image</strong>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:8px">
        <img src="${ev.imageUrl || window.rlImgPlaceholder}" alt="" style="width:120px;height:68px;object-fit:cover;border-radius:8px;background:#1a2027">
        <div>
          <input type="file" id="rlImageFile" accept="image/jpeg,image/png">
          <button class="btn ghost" id="rlImageUploadBtn" type="button" style="margin-top:6px">Upload &amp; Set Image</button>
          <div class="field-hint" style="margin-top:4px">Shown on this event's card under Available Races - matches the SimGrid event look.</div>
        </div>
      </div>
    </div>`;

    // ✅ ADDED: race night date/time - editable any time, not just at
    // creation, so it can be set later or moved if plans change. Shown to
    // drivers on their signup card the whole time it's set.
    html += `<div class="note-item" style="margin-top:10px">
      <strong style="font-size:12.5px">Race night date/time</strong>
      <div class="field-hint" style="margin-top:4px">Shown on the driver-facing signup card the whole time it's set - drivers see this before they decide to sign up.</div>
      <input type="datetime-local" id="rlEditSchedule" value="${window.acRallyMsToDatetimeLocal(ev.scheduledAtMs)}" style="margin-top:8px;display:block;width:220px">
      <button class="btn ghost" id="rlSaveScheduleBtn" type="button" style="margin-top:8px">Save Date/Time</button>
    </div>`;

    if(ev.status === 'signup'){
      const entrants = ev.entrants || [];
      const isValid = window.rlIsValidEntrantCount(entrants.length);
      html += `<div class="staff-only-note">${entrants.length} signed up. Needs to divide evenly into squads of 3, with a power-of-two squad count (6/12/24/48&hellip;), before you can lock in.</div>`;
      html += `<div style="margin-top:8px">${entrants.map(e => `<span class="badge" style="margin:2px">${e.name} <button data-remove-rl-entrant="${e.driverId}" type="button" style="background:none;border:none;color:var(--ifwl-red);cursor:pointer;margin-left:4px">&times;</button></span>`).join('') || '<span class="field-hint">No entrants yet.</span>'}</div>`;
      html += `<div style="display:flex;gap:8px;margin-top:10px;align-items:flex-end;flex-wrap:wrap">
        <div class="trophy-driver-picker" id="rlAddDriverPicker" style="flex:1;min-width:220px">
          <label>Add entrant</label>
          <input type="text" class="tdp-search" placeholder="Search driver by name or licence number...">
          <div class="tdp-selected">None selected</div>
          <div class="ticket-picker-results hidden"></div>
        </div>
        <button class="btn ghost" id="rlAddEntrantBtn" type="button">Add</button>
      </div>`;
      html += `<button class="btn purple owner-only-tab" id="rlLockInBtn" type="button" style="margin-top:12px" ${isValid ? '' : 'disabled'}>Lock In (${entrants.length} drivers)</button>`;
      if(!isValid) html += `<div class="field-hint" style="margin-top:6px">Add or remove entrants above until the count divides evenly into squads of 3 with a power-of-two squad count.</div>`;
    } else {
      html += `<div class="staff-only-note">${(ev.squads||[]).length} squads &middot; locked ${new Date(ev.lockedAtMs).toLocaleString()}</div>`;
      if(ev.status === 'completed'){
        html += `<div class="note-item" style="margin-top:10px;border-color:var(--ifwl-amber)"><strong>&#127942; Champion: ${ev.championSquadName}</strong></div>`;
      }

      // "move if required" - the squad reassign dropdown is only shown/
      // enabled while it's actually still usable: locked in, but before any
      // round-0 match has been decided (see staffRlSquadReassign - moving a
      // driver after a match has already been played would retroactively
      // make that played match's roster ambiguous).
      const round0 = (ev.rounds||[])[0];
      const canReassign = !!round0 && !(round0.matches||[]).some(m => m.status === 'completed');
      html += `<div class="note-item" style="margin-top:10px"><strong style="font-size:12.5px">Squads</strong>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">`;
      (ev.squads||[]).forEach(sq => {
        html += `<div class="note-item" style="flex:1;min-width:200px">
          <strong>${sq.name}</strong>
          <div style="margin-top:6px">${(sq.drivers||[]).map(d => `<div style="margin-top:4px">${d.name}${canReassign ? ` <select data-reassign-driver="${d.driverId}" style="margin-left:6px;font-size:11px">
            <option value="">Move to...</option>
            ${(ev.squads||[]).filter(other => other.id !== sq.id).map(other => `<option value="${other.id}">${other.name}</option>`).join('')}
          </select>` : ''}</div>`).join('')}</div>
        </div>`;
      });
      html += `</div>`;
      if(!canReassign) html += `<div class="field-hint" style="margin-top:6px">Squads can no longer be moved - a match has already been decided.</div>`;
      html += `</div>`;

      (ev.rounds||[]).forEach(round => { html += renderRlRoundHtml(ev, round); });
    }

    wrap.innerHTML = html;
    wireRlDetailHandlers(ev);
  }

  function wireRlDetailHandlers(ev){
    q('rlImageUploadBtn')?.addEventListener('click', async () => {
      const fileInput = q('rlImageFile');
      const file = fileInput?.files?.[0];
      if(!file){ alert('Choose an image first.'); return; }
      const btn = q('rlImageUploadBtn');
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = 'Uploading...';
      try{
        const uploaded = await window.IFWL_UploadAPI.uploadLicenceImage(file, 'rlEventImage');
        await updateRlEvent(ev.id, { imageUrl: uploaded.url });
        await renderRlStaffPanel();
      }catch(e){
        alert('Could not upload image: ' + e.message);
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
    q('rlSaveScheduleBtn')?.addEventListener('click', async () => {
      const scheduleInput = q('rlEditSchedule');
      const scheduledAtMs = scheduleInput && scheduleInput.value ? new Date(scheduleInput.value).getTime() : null;
      const btn = q('rlSaveScheduleBtn');
      btn.disabled = true;
      try{ await updateRlEvent(ev.id, { scheduledAtMs }); await renderRlStaffPanel(); }
      catch(e){ alert('Could not save: ' + e.message); btn.disabled = false; }
    });
    const rlAddPicker = q('rlAddDriverPicker');
    if(rlAddPicker) wireTrophyDriverPicker(rlAddPicker);
    q('rlAddEntrantBtn')?.addEventListener('click', async () => {
      const driverId = rlAddPicker?.dataset.discordId || '';
      if(!driverId){ alert('Search and pick a driver first.'); return; }
      try{ await editRlEntrant(ev.id, driverId, 'add'); await renderRlStaffPanel(); }
      catch(e){ alert('Could not add: ' + e.message); }
    });
    document.querySelectorAll('[data-remove-rl-entrant]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try{ await editRlEntrant(ev.id, btn.dataset.removeRlEntrant, 'remove'); await renderRlStaffPanel(); }
        catch(e){ alert('Could not remove: ' + e.message); }
      });
    });
    q('rlLockInBtn')?.addEventListener('click', async () => {
      if(!confirm(`Lock in ${(ev.entrants||[]).length} drivers now? This randomly shuffles them into squads of 3 and builds the full bracket - can't be undone.`)) return;
      try{ await lockInRlEvent(ev.id); await renderRlStaffPanel(); }
      catch(e){ alert('Could not lock in: ' + e.message); }
    });

    document.querySelectorAll('[data-reassign-driver]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const toSquadId = sel.value;
        if(!toSquadId) return;
        const driverId = sel.dataset.reassignDriver;
        sel.disabled = true;
        try{ await reassignRlSquad(ev.id, driverId, toSquadId); await renderRlStaffPanel(); }
        catch(e){ alert('Could not move driver: ' + e.message); sel.disabled = false; sel.value = ''; }
      });
    });

    document.querySelectorAll('[data-save-round]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const roundIndex = Number(btn.dataset.saveRound);
        const bestOfInput = document.querySelector(`[data-round-bestof="${roundIndex}"]`);
        const scheduleInput = document.querySelector(`[data-round-schedule="${roundIndex}"]`);
        const bestOf = Number(bestOfInput.value);
        const scheduledAtMs = scheduleInput && scheduleInput.value ? new Date(scheduleInput.value).getTime() : null;
        if(!Number.isInteger(bestOf) || bestOf <= 0){ alert('Enter a valid best-of number.'); return; }
        try{ await saveRlRoundConfig(ev.id, roundIndex, bestOf, scheduledAtMs); await renderRlStaffPanel(); }
        catch(e){ alert('Could not save: ' + e.message); }
      });
    });

    document.querySelectorAll('[data-set-match-override]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const [roundIndex, matchIndex] = btn.dataset.setMatchOverride.split(':');
        const scoreA = Number(document.querySelector(`[data-override-score-a="${roundIndex}:${matchIndex}"]`).value);
        const scoreB = Number(document.querySelector(`[data-override-score-b="${roundIndex}:${matchIndex}"]`).value);
        if(!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0 || scoreA === scoreB){ alert("Enter valid, non-tied scores for both squads."); return; }
        try{ await manualRlMatchOverride(ev.id, Number(roundIndex), Number(matchIndex), scoreA, scoreB); await renderRlStaffPanel(); }
        catch(e){ alert('Could not set score: ' + e.message); }
      });
    });

    document.querySelectorAll('[data-verify-match-sub]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const [roundIndex, matchIndex, subId] = btn.dataset.verifyMatchSub.split(':');
        try{ await reviewRlSubmission(ev.id, Number(roundIndex), Number(matchIndex), subId, 'verify'); await renderRlStaffPanel(); }
        catch(e){ alert('Could not verify: ' + e.message); }
      });
    });
    document.querySelectorAll('[data-refuse-match-sub]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt('Reason for refusing this submission?');
        if(!reason) return;
        const [roundIndex, matchIndex, subId] = btn.dataset.refuseMatchSub.split(':');
        try{ await reviewRlSubmission(ev.id, Number(roundIndex), Number(matchIndex), subId, 'refuse', reason); await renderRlStaffPanel(); }
        catch(e){ alert('Could not refuse: ' + e.message); }
      });
    });
    document.querySelectorAll('[data-advance-rl-round]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const roundIndex = Number(btn.dataset.advanceRlRound);
        const round = (ev.rounds || [])[roundIndex];
        const isFinalRound = (round?.matches || []).length === 1;
        const confirmMsg = isFinalRound
          ? "Crown the champion now? This finishes the event and cannot be undone."
          : "Advance this round now? This cannot be undone.";
        if(!confirm(confirmMsg)) return;
        try{
          const result = await advanceRlRound(ev.id, roundIndex);
          alert(result.champion ? `Champion: ${result.champion}!` : `Advanced: ${result.advancedSquadNames.join(', ')}`);
          await renderRlStaffPanel();
        }catch(e){ alert('Could not advance: ' + e.message); }
      });
    });
  }

  async function renderRlStaffPanel(){
    const wrap = q('rlEventsList');
    if(!wrap) return;
    try{ rlEventsCache = await fetchRlEventsStaff(); }
    catch(e){ wrap.innerHTML = `<div class="empty">Could not load events: ${e.message}</div>`; return; }

    if(!rlEventsCache.length){
      wrap.innerHTML = '<div class="empty">No RL 3v3 events yet - create one above.</div>';
    } else {
      wrap.innerHTML = rlEventsCache.map(ev => `
        <div class="note-item">
          <strong>${ev.title}</strong>
          <span class="badge ${ev.status === 'completed' ? 'purple' : ev.status === 'signup' ? '' : 'teal'}" style="margin-left:8px">${ev.status === 'signup' ? 'Open for signup' : ev.status === 'in_progress' ? 'In progress' : ev.status === 'completed' ? 'Completed' : ev.status}</span>
          <div class="note-meta">
            ${ev.status === 'signup' ? `${(ev.entrants||[]).length} signed up` : `${(ev.squads||[]).length} squads &middot; ${ev.status === 'completed' ? `Champion: ${ev.championSquadName || '-'}` : `Round: ${(ev.rounds||[])[ev.currentRoundIndex]?.name || '-'}`}`}
            ${ev.scheduledAtMs ? ` &middot; 🏁 ${window.acRallyFmtSchedule(ev.scheduledAtMs)}` : ' &middot; date/time not set'}
          </div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn ghost" data-manage-rl="${ev.id}" type="button">Manage</button>
            <button class="btn ghost owner-only-tab" data-delete-rl="${ev.id}" type="button">Delete</button>
          </div>
        </div>
      `).join('');
      wrap.querySelectorAll('[data-manage-rl]').forEach(btn => {
        btn.addEventListener('click', () => { rlDetailEventId = btn.dataset.manageRl; renderRlDetail(); });
      });
      wrap.querySelectorAll('[data-delete-rl]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if(!confirm('Delete this event? This cannot be undone.')) return;
          try{
            await deleteRlEvent(btn.dataset.deleteRl);
            if(rlDetailEventId === btn.dataset.deleteRl){ rlDetailEventId = null; q('rlEventDetail').innerHTML = ''; }
            await renderRlStaffPanel();
          }catch(e){ alert('Could not delete: ' + e.message); }
        });
      });
    }

    if(rlDetailEventId) renderRlDetail();
  }

  q('rlCreateBtn')?.addEventListener('click', async () => {
    const title = q('rlNewTitle').value.trim();
    const description = q('rlNewDescription').value.trim();
    const scheduleInput = q('rlNewSchedule');
    const scheduledAtMs = scheduleInput && scheduleInput.value ? new Date(scheduleInput.value).getTime() : null;
    if(!title){ alert('A title is required.'); return; }
    if(!scheduledAtMs && !confirm("No race night date/time set - drivers will see \"not yet announced\" on the signup card. Create it anyway?")) return;
    try{
      await createRlEvent(title, description, scheduledAtMs);
      q('rlNewTitle').value = ''; q('rlNewDescription').value = ''; if(scheduleInput) scheduleInput.value = '';
      await renderRlStaffPanel();
    }catch(e){ alert('Could not create: ' + e.message); }
  });
  q('rlRefreshBtn')?.addEventListener('click', renderRlStaffPanel);

  function renderResults(rows){
    const wrap = q('staffSearchResults');
    if(!rows.length){ wrap.innerHTML = '<div class="empty">No matches.</div>'; return; }
    // ✅ ADDED: a quick red flag in the search list itself when a driver has
    // at least one Peer Ratings "bad racer" report, so staff scanning a long
    // result list can spot it without opening every profile - the full
    // up/down breakdown is on the profile card itself (buildStaffCardPreviewHtml).
    wrap.innerHTML = rows.map(r=>{
      const downCount = Number(r.peerRatingDownCount || 0);
      const flag = downCount > 0 ? ` <span style="color:var(--ifwl-red,#ff5464)" title="${downCount} 'bad racer' peer report(s)">&#128078; ${downCount}</span>` : '';
      return `<div class="note-item" style="cursor:pointer" data-id="${r.discordId}"><strong>${r.name}</strong>${flag}<div class="note-meta">${r.licenceNumber} · ${r.tier}</div></div>`;
    }).join('');
    wrap.querySelectorAll('[data-id]').forEach(el=>el.addEventListener('click', ()=>openEditor(el.dataset.id)));
  }

  // ✅ ADDED: read-only mini licence card for the staff editor - separate
  // markup from the driver's own live-editing card (different IDs, since
  // that one is tied to fixed DOM elements this page only has one of), but
  // matching its visual style using the same tier-colour helpers.
  function buildStaffCardPreviewHtml(p, perfStats){
    const tier = window.findTier(p.tier || 'No Licence');
    const photo = p.avatarMode==='upload' && p.photoUploadUrl ? p.photoUploadUrl
                : p.avatarMode==='url' && p.avatarUrl ? p.avatarUrl
                : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="%231a2027"/></svg>';
    const points = Number(p.licencePoints || 0);
    const pointsClass = window.ifwlPointsBandClass(points);
    const cardStyle = tier.foil ? '' : ` style="background:linear-gradient(135deg, ${tier.color}, var(--ifwl-purple))"`;
    const headerStyle = p.headerUploadUrl ? ` style="background-image:url('${p.headerUploadUrl}')"` : '';
    return `<div class="licence-card${tier.foil ? ' foil' : ''}"${cardStyle}>
      ${p.teamLogoUrl ? `<img class="licence-team-logo" src="${p.teamLogoUrl}" alt="${p.teamName||'Team'}" title="${p.teamName||''}">` : ''}
      <div class="licence-card-inner"${headerStyle}>
        <div class="licence-top"><div class="licence-org">IFWL RACING LICENCE</div></div>
        <img class="licence-photo" src="${photo}" alt="">
        <div class="licence-name">${p.name || 'Unnamed driver'}</div>
        <div class="licence-number">${p.licenceNumber || 'IFWL-0000-00000'}</div>
        <div class="licence-bottom"><span class="tier-pill" style="background:${window.hexToRgba(tier.color,0.16)};color:${tier.color};border:1px solid ${window.hexToRgba(tier.color,0.35)}">${p.tier || 'No Licence'}</span></div>
      </div>
      <div class="licence-card-stats">
        <div class="mini-stats">
          <div class="mini-stat"><span>Overall Score</span><strong>${perfStats?.overallScore ?? '-'}</strong></div>
          <div class="mini-stat"><span>Consistency</span><strong>${perfStats?.consistencyAvg != null ? perfStats.consistencyAvg + '%' : '-'}</strong></div>
          <div class="mini-stat"><span>Race Risk</span><strong>${perfStats?.riskAvg != null ? perfStats.riskAvg + '%' : '-'}</strong></div>
        </div>
        <div class="points-section">
          <span class="points-label">Licence Points</span>
          <strong class="points-value ${pointsClass}">${points}</strong>
        </div>
      </div>
      <!-- ✅ ADDED: Peer Ratings summary - "good racer/bad racer" thumbs
           other drivers have submitted from the Driver Directory. Staff-only
           surface for this by design (staffLicenceGet returns these counts,
           the public licenceDirectory endpoint never does) - never who
           voted, just the totals. -->
      <div class="field-hint" style="padding:0 14px 10px;display:flex;gap:14px;align-items:center">
        <span>Peer Reports:</span>
        <strong style="color:var(--ifwl-green,#33d99b)">&#128077; ${Number(p.peerRatingUpCount || 0)}</strong>
        <strong style="color:var(--ifwl-red,#ff5464)">&#128078; ${Number(p.peerRatingDownCount || 0)}</strong>
      </div>
      ${perfStats ? `<div class="field-hint" style="padding:0 14px 12px">${perfStats.sessionCount} session(s) counted &middot; ${perfStats.trackCount} track(s) &middot; most recent: ${perfStats.mostRecentLabel || '-'}</div>` : ''}
    </div>`;
  }

  // Finds this driver's row in a qualification standings list without
  // needing access to the main script block's own matching helper.
  function findQualRowForNames(standings, names){
    const mine = (names || []).map(n => window.IFWLStats.driverNameKey(n));
    return standings.find(s => {
      const key = window.IFWLStats.driverNameKey(s.driver);
      return mine.some(m => m === key || key.includes(m) || m.includes(key));
    });
  }

  async function buildLapStatusHtml(accDriverNames){
    if(!accDriverNames || !accDriverNames.length){
      return '<div class="licence-linked-box hidden"></div>'; // nothing linked, nothing to check
    }
    const lines = [];
    for(const [label, serverId] of [['PC','pc-licence'], ['Console','console-licence']]){
      try{
        const standings = await window.cachedLicenceServerStandings({ minLaps: 15, serverId, classStructure: await window.classStructureForServer(serverId) , qualWindow: await window.fetchQualWindowMs()});
        const row = findQualRowForNames(standings, accDriverNames);
        if(row) lines.push({ label, laps: row.totalLaps, done: row.totalLaps >= 15 });
      }catch(e){ /* one platform failing shouldn't block the other */ }
    }
    if(!lines.length) return '<div class="licence-linked-box lap-incomplete">No qualification laps recorded on either server yet.</div>';
    const allDone = lines.every(l => l.done);
    const rows = lines.map(l => `${l.label}: ${l.laps}/15 laps${l.done ? ' &#9989;' : ''}`).join(' &middot; ');
    return `<div class="licence-linked-box ${allDone ? 'lap-complete' : 'lap-incomplete'}"><strong>Qualification laps</strong>${rows}</div>`;
  }

  // ✅ ADDED: Sandbagging Watch - reuses window.IFWLStats.fetchSandbaggingReview
  // (ifwl-stats-engine.js) to surface Live Timings' own staff-only Beginner
  // Review flags (Sandbagging watch / Pace mismatch / Too fast for Beginner /
  // Rapid pace increase) for whichever ACC name(s) are linked to this
  // licence, without staff needing to separately open Live Timings. Nothing
  // is stored here - it's recomputed live from the same public result files
  // every time a driver is opened. Deliberately quiet by default: no linked
  // names or no data loaded yet renders nothing at all, not an error state.
  function buildSandbaggingReviewInnerHtml(result){
    if(!result || !result.checked || !result.totalRowCount) return '';
    const head = `<div class="sandbag-review-head">Sandbagging Watch &middot; live from Live Timings</div>`;
    if(!result.notes.length){
      return `${head}<div class="sandbag-card"><span class="sandbag-tag ok">No flags</span><p>No sandbagging, pace mismatch or rapid pace increase flags for this driver in the currently synced result files.</p></div>`;
    }
    const cards = result.notes.map(n => `<div class="sandbag-card"><span class="sandbag-tag ${n.type}">${n.label}</span><strong>${n.title}</strong><p>${n.detail}</p><span class="sandbag-reason">${n.reason}</span></div>`).join('');
    return head + cards;
  }
  // Token guard: if staff opens a different driver before this resolves,
  // the stale response must not overwrite the new driver's box (both use
  // the same #sandbagReviewBox id, since only one editor is open at once).
  let sandbagReviewToken = 0;
  async function loadSandbaggingReviewInto(accDriverNames){
    const myToken = ++sandbagReviewToken;
    const box = q('sandbagReviewBox');
    if(!box || !accDriverNames || !accDriverNames.length){ if(box) box.remove(); return; }
    try{
      const result = await window.IFWLStats.fetchSandbaggingReview(accDriverNames);
      if(sandbagReviewToken !== myToken) return; // superseded by a newer openEditor() call
      const html = buildSandbaggingReviewInnerHtml(result);
      const target = q('sandbagReviewBox');
      if(!target) return;
      if(!html){ target.remove(); return; }
      target.innerHTML = html;
    }catch(e){
      if(sandbagReviewToken !== myToken) return;
      const target = q('sandbagReviewBox');
      if(target) target.innerHTML = `<div class="sandbag-card"><p>Could not load Sandbagging Watch: ${e.message}</p></div>`;
    }
  }

  async function openEditor(id){
    const p = await staffFetchProfile(id);
    if(!p){ q('staffEditorWrap').innerHTML = '<div class="empty">Could not load that driver.</div>'; return; }
    const notes = await staffFetchNotes(id);
    const tiers = await window.IFWL_TierAPI.fetchTierList();
    const sortedTiers = mainLadderTiers(tiers).sort((a,b)=>(a.order??0)-(b.order??0));
    const wrap = q('staffEditorWrap');

    // ✅ ADDED: card preview + performance stats, rendered into the left
    // column so it fills the space that used to just sit empty below the
    // search/bulk tools whenever a driver is selected.
    q('staffCardPreview').innerHTML = '<div class="empty">Loading licence card&hellip;</div>';
    window.fetchPerformanceStats(p).then(perfStats => {
      q('staffCardPreview').innerHTML = buildStaffCardPreviewHtml(p, perfStats);
    });

    const lapStatusHtml = await buildLapStatusHtml(p.accDriverNames || []);

    wrap.innerHTML = `
      <details class="staff-raw-data">
        <summary>🔎 Raw Firestore data</summary>
        <div class="field-hint" style="margin:0 0 8px">Looked up using ID: <code>${id}</code> &mdash; this is exactly what's stored, unfiltered. Handy for edge cases like a profile that looks fine here but a Discord command can't find (e.g. missing/mismatched <code>discordId</code>).</div>
        <button type="button" class="btn ghost" id="copyRawDataBtn" style="font-size:11px;padding:6px 10px;margin-bottom:8px">Copy JSON</button>
        <pre id="rawDataOutput" class="raw-data-pre"></pre>
      </details>
      ${lapStatusHtml}
      ${(p.accDriverNames||[]).length ? `<div id="sandbagReviewBox" class="sandbag-review"><div class="sandbag-review-head">Sandbagging Watch &middot; live from Live Timings</div><div class="sandbag-card"><p>Checking live timings data&hellip;</p></div></div>` : ''}
      <div class="field-group"><label>Name</label><input type="text" id="edName" value="${p.name||''}"></div>
      <div class="field-group"><label>Tier</label><select id="edTier">
        ${sortedTiers.map(t=>`<option value="${t.name}" ${p.tier===t.name?'selected':''}>${t.name}</option>`).join('')}
      </select></div>
      <div class="field-group"><label>Reason for tier change</label><input type="text" id="edReason" placeholder="e.g. Clean run of 10 races, promoted to Amateur"></div>
      <p class="field-hint">Race team is now managed under Ops &gt; Manage All Race Teams, not here.${p.teamName ? ` Currently on: <strong>${p.teamName}</strong>.` : ''}</p>
      <div class="field-group">
        <label>ACC driver name(s) on record</label>
        <input type="text" id="edAccNames" value="${(p.accDriverNames||[]).join(', ')}" placeholder="Nothing linked yet">
        <div class="field-hint">This is exactly what's stored - must match the driver's in-game name character-for-character (case aside) to match session results. Fix typos here directly.</div>
        <div class="field-hint" style="color:var(--ifwl-red)">Comma-separate multiple names, never quote marks - e.g. "Ben Leahy, Slayer". Most drivers need one name for entrylist-enforced races and a separate one for everything else (qualifying server, open practice). Brand-new Season 4 drivers won't have an entrylist name to give until their first race result is uploaded to the Licence Centre.</div>
      </div>
      <div class="field-group">
        <label>Platform</label>
        <select id="edPlatform">
          <option value="" ${!p.platform?'selected':''}>Not set</option>
          <option value="pc" ${p.platform==='pc'?'selected':''}>PC</option>
          <option value="console" ${p.platform==='console'?'selected':''}>Console</option>
          <option value="both" ${p.platform==='both'?'selected':''}>PC + Console</option>
        </select>
        <div class="field-hint">Shown as a badge on their Driver Directory card. Normally set automatically when they claim a name, but staff can correct it here.</div>
      </div>

      <hr style="border-color:var(--ifwl-line);margin:18px 0">
      <span class="staff-section-label">Driver-set details</span>
      <div class="field-hint" style="margin:-4px 0 12px">Normally set by the driver themselves and visible on their own profile, but not previously editable from this side - fix typos or set these directly if a driver is stuck. Overrides here bypass any Patreon tier gate (e.g. Bio is normally Silver+ only).</div>
      <div class="staff-field-2col">
        <div class="field-group"><label>SimGrid username</label><input type="text" id="edSimgridUsername" value="${p.simgridUsername||''}" placeholder="e.g. tractor_rb22_maxverstappen"></div>
        <div class="field-group"><label>Steam64 ID</label><input type="text" id="edSteamId" value="${p.steamId||''}" placeholder="e.g. 76561198012345678" inputmode="numeric" pattern="[0-9]*"></div>
      </div>
      <div class="field-group"><label>Name pronunciation</label><input type="text" id="edNamePronunciation" value="${p.namePronunciation||''}" placeholder='e.g. "Leahy" is pronounced "Lee-hay"'></div>
      <div class="field-group"><label>Bio</label><textarea id="edBio" placeholder="Driver's bio text...">${p.bio||''}</textarea></div>

      <hr style="border-color:var(--ifwl-line);margin:18px 0">
      <span class="staff-section-label">Add-on licences</span>
      <div class="field-hint" style="margin:-4px 0 10px">Stacks on top of the main tier above (e.g. AC Rally, LMU sub-licences) - granting or revoking here updates their profile and pushes the matching Discord role immediately, the same as the AC Rally event's own Grant Licence tool.</div>
      <div class="staff-addon-list" id="edAddonList">${(() => {
        const held = (p.lmuSubLicences||[]).map(tid => tiers.find(t=>t.id===tid)).filter(Boolean);
        return held.length ? held.map(t => `<span class="staff-addon-chip" data-tier-id="${t.id}"><span class="lmu-swatch" style="width:10px;height:10px;border-radius:3px;background:${t.color||'#999'}"></span>${t.name}<button type="button" class="ed-addon-remove" data-tier-id="${t.id}" title="Revoke this add-on licence">&times;</button></span>`).join('')
          : '<span class="field-hint" style="margin:0">No add-on licences held.</span>';
      })()}</div>
      ${(() => {
        const addonTiers = tiers.filter(t => t.lmuSubLicence);
        const held = new Set(p.lmuSubLicences||[]);
        const available = addonTiers.filter(t => !held.has(t.id));
        if(!addonTiers.length) return '<div class="field-hint">No add-on licence tiers exist yet - flag one as an add-on in Staff &gt; Manage Licence Tiers first.</div>';
        if(!available.length) return '';
        return `<div class="staff-addon-add-row">
          <select id="edAddonSelect">${available.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select>
          <button class="btn ghost" id="edAddonAddBtn" type="button">+ Grant</button>
        </div>`;
      })()}
      <span class="save-status" id="edAddonStatus"></span>

      <hr style="border-color:var(--ifwl-line);margin:18px 0">
      <button class="btn teal" id="edSaveBtn" type="button">Save profile</button>
      <span class="save-status" id="edSaveStatus"></span>
      <hr style="border-color:var(--ifwl-line);margin:18px 0">
      <label style="display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Image moderation</label>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px">
        <div style="text-align:center">
          <div style="font-size:10.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px">Profile Photo</div>
          ${p.avatarMode === 'upload' && p.photoUploadUrl
            ? `<img src="${p.photoUploadUrl}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;display:block;margin-bottom:6px">
               <button class="btn ghost" id="edRemovePhotoBtn" type="button" style="font-size:11px">Remove</button>`
            : '<div class="field-hint">No uploaded photo</div>'}
        </div>
        <div style="text-align:center">
          <div style="font-size:10.5px;text-transform:uppercase;color:var(--text-dim);margin-bottom:4px">Header Image</div>
          ${p.headerUploadUrl
            ? `<img src="${p.headerUploadUrl}" style="width:96px;height:64px;object-fit:cover;border-radius:8px;display:block;margin-bottom:6px">
               <button class="btn ghost" id="edRemoveHeaderBtn" type="button" style="font-size:11px">Remove</button>`
            : '<div class="field-hint">No uploaded header</div>'}
        </div>
      </div>
      <div id="edImageRemovePrompt" class="hidden" style="background:#f7f8fa;border:1px solid var(--ifwl-line);border-radius:10px;padding:12px;margin-bottom:10px">
        <div class="field-group"><label>Reason (required)</label><input type="text" id="edImageRemoveReason" placeholder="e.g. Illegal/prohibited imagery"></div>
        <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin:8px 0"><input type="checkbox" id="edImageBanAlso" style="width:auto"> Also ban this driver for a ToS breach</label>
        <div id="edImageBanOptions" class="hidden" style="margin-left:22px">
          <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:6px"><input type="checkbox" id="edImageBanPermanent" style="width:auto"> Permanent ban</label>
          <div class="field-group" id="edImageBanDaysGroup"><label>Ban length (days)</label><input type="number" id="edImageBanDays" min="1" max="100" value="7"></div>
        </div>
        <button class="btn ghost" id="edImageRemoveConfirmBtn" type="button" style="background:rgba(255,84,100,.16);color:var(--ifwl-red)">Confirm removal</button>
        <button class="btn ghost" id="edImageRemoveCancelBtn" type="button">Cancel</button>
        <span class="save-status" id="edImageRemoveStatus"></span>
      </div>
      <hr style="border-color:var(--ifwl-line);margin:18px 0">
      <label style="display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Staff notes (never visible to the driver)</label>
      <div id="edNotesList">${notes.map(n=>`<div class="note-item">${n.text}<div class="note-meta">${n.by} · ${new Date(n.date||n.createdAtMs||Date.now()).toLocaleString()}</div></div>`).join('') || '<div class="empty">No notes yet.</div>'}</div>
      <div class="field-group" style="margin-top:10px"><textarea id="edNewNote" placeholder="Add a private note..."></textarea></div>
      <button class="btn ghost" id="edAddNoteBtn" type="button">Add note</button>
      <hr style="border-color:var(--ifwl-line);margin:18px 0">
      <label style="display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Ban / suspend</label>
      ${p.ban && p.ban.endsAtMs > Date.now() ? `
        <div class="request-card">
          <span class="request-status-pill declined">${p.ban.permanent ? 'Banned (permanent)' : 'Banned'}</span>
          <div class="req-meta">${p.ban.permanent ? 'Permanent' : (p.ban.days + ' day(s)')} &middot; ends ${p.ban.permanent ? 'never (permanent)' : new Date(p.ban.endsAtMs).toLocaleString()}</div>
          ${p.ban.reason ? `<p style="color:var(--text-muted);font-size:13px;margin:6px 0 0">${p.ban.reason}</p>` : ''}
          <button class="btn ghost" id="edLiftBanBtn" type="button" style="margin-top:8px">Lift ban</button>
        </div>
      ` : `
        <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:8px"><input type="checkbox" id="edBanPermanent" style="width:auto"> Permanent ban</label>
        <div class="field-group" id="edBanDaysGroup"><label>Ban length (1-100 days)</label><input type="number" id="edBanDays" min="1" max="100" value="7"></div>
        <div class="field-group"><label>Reason</label><input type="text" id="edBanReason" placeholder="e.g. Repeated intentional collisions"></div>
        <button class="btn ghost" id="edApplyBanBtn" type="button" style="background:rgba(255,84,100,.16);color:var(--ifwl-red)">Apply ban</button>
        <span class="save-status" id="edBanStatus"></span>
      `}
      <hr style="border-color:var(--ifwl-line);margin:18px 0">
      <label style="display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Licence points</label>
      <div class="request-card" style="margin-bottom:12px">
        <strong style="font-size:22px;font-family:var(--font-mono);color:var(--ifwl-amber)">${Number(p.licencePoints||0)}</strong>
        <div class="req-meta">Current total &middot; ${(p.pointsHistory||[]).length} change(s) on record</div>
      </div>
      <div class="field-group"><label>Points to add or remove</label><input type="number" id="edPointsDelta" placeholder="e.g. 3 to add, -3 to remove"></div>
      <div class="field-group"><label>Reason</label><input type="text" id="edPointsReason" placeholder="e.g. Race 2 incident - avoidable contact"></div>
      <button class="btn ghost" id="edPointsBtn" type="button">Apply points change</button>
      <span class="save-status" id="edPointsStatus"></span>
      ${(p.pointsHistory||[]).length ? `<div style="margin-top:12px">${[...p.pointsHistory].reverse().map(h=>`<div class="note-item">${h.delta>0?'+':''}${h.delta} pts &middot; ${h.reason}<div class="note-meta">${h.setBy||'staff'} · ${new Date(h.date||h.dateMs||Date.now()).toLocaleString()}</div></div>`).join('')}</div>` : ''}
    `;
    // ✅ ADDED: fill in + wire the raw-data viewer. Set as textContent (never
    // innerHTML) so nothing in a driver's own free-text fields (bio, name,
    // notes, etc.) can be interpreted as markup - this is a plain dump, not
    // rendered content.
    const rawDataEl = q('rawDataOutput');
    if(rawDataEl) rawDataEl.textContent = JSON.stringify(p, null, 2);
    q('copyRawDataBtn')?.addEventListener('click', () => {
      const btn = q('copyRawDataBtn');
      navigator.clipboard.writeText(JSON.stringify(p, null, 2)).then(() => {
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { if(q('copyRawDataBtn')) q('copyRawDataBtn').textContent = original; }, 1500);
      }).catch(() => { btn.textContent = 'Could not copy'; });
    });

    if((p.accDriverNames||[]).length) loadSandbaggingReviewInto(p.accDriverNames); // fire-and-forget - fills #sandbagReviewBox in once Live Timings data resolves
    q('edSaveBtn').addEventListener('click', async ()=>{
      q('edSaveStatus').textContent = 'Saving...';
      const accDriverNames = q('edAccNames').value.split(',').map(s=>s.trim()).filter(Boolean);
      try{
        await staffSaveProfile(id, {
          name: q('edName').value, tier: q('edTier').value, reason: q('edReason').value, accDriverNames, platform: q('edPlatform').value,
          simgridUsername: q('edSimgridUsername').value.trim(), steamId: q('edSteamId').value.trim(),
          namePronunciation: q('edNamePronunciation').value.trim(), bio: q('edBio').value.trim()
        });
        q('edSaveStatus').textContent = 'Saved.';
        setTimeout(()=>{ if(q('edSaveStatus')) q('edSaveStatus').textContent=''; }, 2000);
      }catch(e){ q('edSaveStatus').textContent = 'Could not save: ' + e.message; }
    });

    // ✅ ADDED: add-on licence grant/revoke - mirrors the AC Rally event's own
    // Grant Licence tool, just for one driver at a time from their own
    // profile. staffLicenceSave diffs the incoming lmuSubLicences array
    // server-side and syncs the matching Discord role either way.
    wrap.querySelectorAll('.ed-addon-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tierId = btn.dataset.tierId;
        const tierName = btn.parentElement?.textContent?.trim() || 'this licence';
        if(!confirm(`Revoke "${tierName}"? This also removes the matching Discord role.`)) return;
        q('edAddonStatus').textContent = 'Updating...';
        try{
          const next = (p.lmuSubLicences||[]).filter(x => x !== tierId);
          await staffSaveProfile(id, { lmuSubLicences: next });
          openEditor(id);
        }catch(e){ q('edAddonStatus').textContent = 'Could not revoke: ' + e.message; }
      });
    });
    q('edAddonAddBtn')?.addEventListener('click', async () => {
      const select = q('edAddonSelect');
      const tierId = select?.value;
      if(!tierId) return;
      q('edAddonStatus').textContent = 'Granting...';
      try{
        const next = [...new Set([...(p.lmuSubLicences||[]), tierId])];
        await staffSaveProfile(id, { lmuSubLicences: next });
        openEditor(id);
      }catch(e){ q('edAddonStatus').textContent = 'Could not grant: ' + e.message; }
    });
    q('edAddNoteBtn').addEventListener('click', async ()=>{
      const text = q('edNewNote').value.trim(); if(!text) return;
      try{ await staffAddNote(id, text); openEditor(id); }
      catch(e){ alert('Could not add note: ' + e.message); }
    });
    q('edApplyBanBtn')?.addEventListener('click', async ()=>{
      const permanent = q('edBanPermanent').checked;
      const days = Number(q('edBanDays').value);
      const reason = q('edBanReason').value.trim();
      q('edBanStatus').textContent = 'Applying...';
      try{ await staffApplyBan(id, days, reason, permanent); openEditor(id); }
      catch(e){ q('edBanStatus').textContent = e.message; }
    });
    q('edBanPermanent')?.addEventListener('change', ()=>{
      q('edBanDaysGroup').classList.toggle('hidden', q('edBanPermanent').checked);
    });
    q('edLiftBanBtn')?.addEventListener('click', async ()=>{
      if(!confirm('Lift this ban now?')) return;
      try{ await staffLiftBan(id); openEditor(id); }
      catch(e){ alert('Could not lift ban: ' + e.message); }
    });
    q('edPointsBtn')?.addEventListener('click', async ()=>{
      const delta = Number(q('edPointsDelta').value);
      const reason = q('edPointsReason').value.trim();
      q('edPointsStatus').textContent = 'Applying...';
      try{ await staffAdjustPoints(id, delta, reason); openEditor(id); }
      catch(e){ q('edPointsStatus').textContent = e.message; }
    });

    // ✅ ADDED: image moderation wiring - both Remove buttons open the same
    // confirm-with-reason prompt, just targeting a different image field.
    let pendingImageRemoval = null;
    function openImageRemovePrompt(which){
      pendingImageRemoval = which;
      q('edImageRemovePrompt').classList.remove('hidden');
      q('edImageRemoveReason').value = '';
      q('edImageBanAlso').checked = false;
      q('edImageBanOptions').classList.add('hidden');
      q('edImageRemoveStatus').textContent = '';
    }
    q('edRemovePhotoBtn')?.addEventListener('click', () => openImageRemovePrompt('photo'));
    q('edRemoveHeaderBtn')?.addEventListener('click', () => openImageRemovePrompt('header'));
    q('edImageRemoveCancelBtn')?.addEventListener('click', () => q('edImageRemovePrompt').classList.add('hidden'));
    q('edImageBanAlso')?.addEventListener('change', () => {
      q('edImageBanOptions').classList.toggle('hidden', !q('edImageBanAlso').checked);
    });
    q('edImageBanPermanent')?.addEventListener('change', () => {
      q('edImageBanDaysGroup').classList.toggle('hidden', q('edImageBanPermanent').checked);
    });
    q('edImageRemoveConfirmBtn')?.addEventListener('click', async () => {
      const reason = q('edImageRemoveReason').value.trim();
      if(!reason){ q('edImageRemoveStatus').textContent = 'A reason is required.'; return; }
      const banAlso = q('edImageBanAlso').checked;
      const banOptions = banAlso ? {
        banAlso: true,
        permanent: q('edImageBanPermanent').checked,
        days: Number(q('edImageBanDays').value)
      } : null;
      q('edImageRemoveStatus').textContent = 'Removing...';
      try{
        await staffRemoveImage(id, pendingImageRemoval, reason, banOptions);
        openEditor(id);
      }catch(e){
        q('edImageRemoveStatus').textContent = 'Error: ' + e.message;
      }
    });
  }

  q('staffSearchInput')?.addEventListener('input', () => runStaffSearch());
  q('staffIssueNewBtn')?.addEventListener('click', async ()=>{
    const discordId = prompt('Discord ID of the driver to issue a licence for:');
    if(!discordId) return;
    const name = prompt('Driver display name:') || 'IFWL Driver';
    try{
      const result = await staffIssueLicence(discordId.trim(), name);
      alert(`Licence issued: ${result.licenceNumber || '(demo mode)'}`);
      renderResults(await staffSearch(''));
    }catch(e){ alert(e.message); }
  });

  /* ---- Manage Licence Tiers ---- */
  let tierRows = [];

  function renderTierRows(){
    const wrap = q('tierEditorRows');
    if(!wrap) return;
    wrap.innerHTML = tierRows.map((t, i) => `
      <div class="tier-row" data-idx="${i}">
        <div class="tier-row-main">
          <div>
            <button class="icon-btn" data-move="up" title="Move up" ${i===0?'disabled':''}>&uarr;</button>
            <button class="icon-btn" data-move="down" title="Move down" ${i===tierRows.length-1?'disabled':''}>&darr;</button>
          </div>
          <input type="text" data-field="name" value="${t.name}" placeholder="Tier name">
          <input type="color" data-field="color" value="${t.color}">
          <label class="foil-toggle"><input type="checkbox" data-field="foil" ${t.foil?'checked':''}> Foil</label>
          <label class="foil-toggle" title="Self-selected add-on (e.g. LMU) - not part of the main ladder, never shown on licence cards or in tier dropdowns"><input type="checkbox" data-field="lmuSubLicence" ${t.lmuSubLicence?'checked':''}> LMU</label>
          <label class="foil-toggle" title="Only applies to an LMU sub-licence above - requires a driver to request it and staff to approve, instead of the plain self-select checkbox (e.g. Hypercar, LMP3)"><input type="checkbox" data-field="lmuGated" ${t.lmuGated?'checked':''}> Requires approval</label>
          <input type="text" data-field="description" value="${t.description||''}" placeholder="Short description" style="grid-column:span 1">
          <button class="icon-btn" data-remove="1" title="Remove tier">&times;</button>
        </div>
        <div class="tier-row-discord">
          <span class="tier-row-discord-label">Discord roles</span>
          <input type="text" data-field="discordRoleIdPc" value="${t.discordRoleIdPc||''}" placeholder="PC role ID (optional)" title="Granted the moment a driver on PC reaches this tier, revoked the moment they leave it. Leave blank for no role on PC.">
          <input type="text" data-field="discordRoleIdConsole" value="${t.discordRoleIdConsole||''}" placeholder="Console role ID (optional)" title="Granted the moment a driver on Console reaches this tier, revoked the moment they leave it. Leave blank for no role on Console. For a tier that isn't split by platform, paste the same role ID into both fields.">
        </div>
      </div>
    `).join('');

    wrap.querySelectorAll('.tier-row').forEach(row => {
      const idx = Number(row.dataset.idx);
      row.querySelector('[data-field="name"]').addEventListener('input', e => tierRows[idx].name = e.target.value);
      row.querySelector('[data-field="color"]').addEventListener('input', e => tierRows[idx].color = e.target.value);
      row.querySelector('[data-field="foil"]').addEventListener('change', e => tierRows[idx].foil = e.target.checked);
      row.querySelector('[data-field="lmuSubLicence"]').addEventListener('change', e => tierRows[idx].lmuSubLicence = e.target.checked);
      row.querySelector('[data-field="lmuGated"]').addEventListener('change', e => tierRows[idx].lmuGated = e.target.checked);
      row.querySelector('[data-field="description"]').addEventListener('input', e => tierRows[idx].description = e.target.value);
      row.querySelector('[data-field="discordRoleIdPc"]').addEventListener('input', e => tierRows[idx].discordRoleIdPc = e.target.value);
      row.querySelector('[data-field="discordRoleIdConsole"]').addEventListener('input', e => tierRows[idx].discordRoleIdConsole = e.target.value);
      row.querySelector('[data-remove]').addEventListener('click', () => { tierRows.splice(idx,1); renumberAndRender(); });
      const moveBtns = row.querySelectorAll('[data-move]');
      moveBtns.forEach(btn => btn.addEventListener('click', () => {
        const dir = btn.dataset.move === 'up' ? -1 : 1;
        const swapWith = idx + dir;
        if(swapWith < 0 || swapWith >= tierRows.length) return;
        [tierRows[idx], tierRows[swapWith]] = [tierRows[swapWith], tierRows[idx]];
        renumberAndRender();
      }));
    });
    renderPushRoleTierOptions();
  }
  function renumberAndRender(){
    tierRows.forEach((t,i) => t.order = i);
    renderTierRows();
  }
  // Kept in sync with tierRows on every render (add/remove/rename during
  // this editing session all flow through renderTierRows already).
  function renderPushRoleTierOptions(){
    const sel = q('pushRoleTierSelect');
    if(!sel) return;
    const prevValue = sel.value;
    sel.innerHTML = tierRows.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    if(tierRows.some(t => t.name === prevValue)) sel.value = prevValue;
  }

  async function initTierManager(){
    const tiers = await window.IFWL_TierAPI.fetchTierList();
    tierRows = [...tiers].sort((a,b)=>(a.order??0)-(b.order??0)).map(t => ({...t}));
    renderTierRows();
  }
  q('addTierRowBtn')?.addEventListener('click', () => {
    tierRows.push({ id: 'tier_' + Date.now(), name: 'New Tier', color: '#93a1a9', foil:false, lmuSubLicence:false, lmuGated:false, description:'', discordRoleIdPc:'', discordRoleIdConsole:'', order: tierRows.length });
    renderTierRows();
  });
  q('saveTiersBtn')?.addEventListener('click', async () => {
    if(tierRows.some(t => !t.name.trim())){ q('tierSaveStatus').textContent = 'Every tier needs a name.'; return; }
    q('tierSaveStatus').textContent = 'Saving...';
    try{
      await window.IFWL_TierAPI.saveTierList(tierRows);
      q('tierSaveStatus').textContent = 'Saved. Reload the page to see it everywhere.';
    }catch(e){ q('tierSaveStatus').textContent = 'Could not save: ' + e.message; }
  });

  q('pushRoleTierBtn')?.addEventListener('click', async () => {
    const tier = q('pushRoleTierSelect').value;
    if(!tier) return;
    if(!confirm(`Push Discord roles to every driver currently on "${tier}"?\n\nThis re-grants (or corrects) their PC/Console Discord role for this tier. Safe to run even if most people already have it right - it only touches anyone whose role is missing or wrong.`)) return;
    const btn = q('pushRoleTierBtn');
    btn.disabled = true;
    q('pushRoleTierStatus').textContent = 'Queuing roles...';
    try{
      const result = await window.IFWL_Api.apiPost('staffPushTierDiscordRoles', { tier });
      const checked = result.checked ?? result.total ?? '?';
      const queued = result.queued ?? result.updated ?? result.granted ?? result.fixed ?? '?';
      // ✅ CHANGED: the backend queues these through tierRoleSyncQueue (same
      // drip-feed the bulk tier tools already use) rather than calling
      // Discord live, so it's not actually "done" the moment this responds -
      // it drains at ~40/minute in the background.
      q('pushRoleTierStatus').textContent = `Queued - ${queued} of ${checked} driver(s) on "${tier}" need a role check, draining at ~40/minute in the background.`;
    }catch(e){ q('pushRoleTierStatus').textContent = 'Could not push roles: ' + e.message; }
    finally{ btn.disabled = false; }
  });

  /* ---- Licence Requests queue ---- */
  function reqCurrentRaceLabel(v){
    return v === 'beginner' ? 'Beginner' : v === 'pro_am' ? 'Pro-Am' : 'Not stated';
  }

  // ✅ ADDED: "where the system thinks they should be" - matches each pending
  // request's driver to their qualification lap standings on both platforms,
  // via the exact same recommendedTier engine the Qualification Grid and
  // Licence Database panels already use (cachedLicenceServerStandings is
  // memoized per page load, so this is cheap if either of those has already
  // run this session, and only a one-time cost otherwise). Best-effort and
  // entirely non-fatal: staffSearch requires Ops-level access, so a
  // Steward-only session (allowed to review requests, but not staffSearch)
  // simply doesn't get this line - the rest of the queue still renders fine.
  async function reqBuildSystemSuggestionMap(driverIds){
    const map = new Map();
    if(!driverIds.length) return map;
    try{
      const [profiles, pcStandings, consoleStandings] = await Promise.all([
        staffSearch(''),
        window.cachedLicenceServerStandings({ minLaps: 15, serverId: 'pc-licence', classStructure: await window.classStructureForServer('pc-licence'), qualWindow: await window.fetchQualWindowMs() }).catch(() => []),
        window.cachedLicenceServerStandings({ minLaps: 15, serverId: 'console-licence', classStructure: await window.classStructureForServer('console-licence'), qualWindow: await window.fetchQualWindowMs() }).catch(() => [])
      ]);
      const profileById = new Map(profiles.map(p => [p.discordId, p]));
      const findRow = (standings, mine) => mine.length ? standings.find(s => {
        const key = window.IFWLStats.driverNameKey(s.driver);
        return mine.some(m => m === key || key.includes(m) || m.includes(key));
      }) : null;
      driverIds.forEach(id => {
        const p = profileById.get(id);
        const mine = (p?.accDriverNames || []).map(n => window.IFWLStats.driverNameKey(n));
        const pcRow = findRow(pcStandings, mine);
        const consoleRow = findRow(consoleStandings, mine);
        // Prefer a qualified row (enough laps for the number to actually mean
        // something) over an unqualified one, on either platform.
        map.set(id, (pcRow && pcRow.qualified) ? pcRow : (consoleRow && consoleRow.qualified) ? consoleRow : (pcRow || consoleRow || null));
      });
    }catch(e){ console.warn('Could not compute system tier suggestions for the request queue', e); }
    return map;
  }

  // ✅ ADDED: server footprint - cross-references each pending request's
  // driver against EVERY server IFWL tracks (window.IFWLStats.getDriverServerFootprint),
  // not just the two Licence Q servers the suggestion map above is scoped
  // to. Lets staff tell at a glance whether a request is from an existing
  // racer (real data on an actual race server) or someone brand new who's
  // only ever touched the Licence Qualification servers - or nothing at
  // all. Best-effort/non-fatal, same shape as reqBuildSystemSuggestionMap.
  async function reqBuildServerFootprintMap(driverIds){
    const map = new Map();
    if(!driverIds.length) return map;
    try{
      const profiles = await staffSearch('');
      const profileById = new Map(profiles.map(p => [p.discordId, p]));
      await Promise.all(driverIds.map(async id => {
        const p = profileById.get(id);
        const footprint = await window.IFWLStats.getDriverServerFootprint(p?.accDriverNames || []);
        map.set(id, footprint);
      }));
    }catch(e){ console.warn('Could not compute server footprint for the request queue', e); }
    return map;
  }
  function reqFootprintLabel(fp){
    if(!fp || fp.reason === 'no-linked-names') return '';
    const totalServers = (fp.raceServers?.length || 0) + (fp.licenceServers?.length || 0);
    if(!totalServers){
      return '🖥️ Server data: <strong style="color:var(--ifwl-amber,#ffb238)">none - brand new</strong>';
    }
    if(fp.isRacer){
      const list = fp.raceServers.map(s => `${s.serverName} (${s.sessionCount})`).join(', ');
      return `🖥️ Server data: <strong style="color:var(--ifwl-green,#33d99b)">Racer</strong> &middot; ${list}`;
    }
    const list = fp.licenceServers.map(s => `${s.serverName} (${s.sessionCount})`).join(', ');
    return `🖥️ Server data: <strong style="color:var(--ifwl-amber,#ffb238)">Licence servers only</strong> &middot; ${list}`;
  }

  // ✅ ADDED: league owner lock. When on, every staff role except the Owner
  // sees "Locked out by league owner" instead of Approve/Decline on both
  // queues (the server refuses them too - this is just the honest UI).
  let reqLockState = { locked:false, lockedByName:'', lockedAtMs:0 };
  function reqIsRealOwner(){
    return !!(window.IFWL_REAL_OWNER !== undefined ? window.IFWL_REAL_OWNER : window.IFWL_OWNER);
  }
  function reqLockedForMe(){ return reqLockState.locked && !reqIsRealOwner(); }
  const REQ_LOCKED_HTML = '<div class="req-meta" style="margin-top:10px;padding:9px 12px;border-radius:8px;border:1px solid #e8a73a;background:rgba(255,178,56,.12);font-weight:700;color:var(--ifwl-amber,#b5750a)">🔒 Locked out by league owner &mdash; only the league owner can review this request</div>';
  async function loadReqLock(){
    const st = await window.IFWL_RequestAPI.fetchRequestLock();
    reqLockState = { locked: !!st.locked, lockedByName: st.lockedByName || '', lockedAtMs: Number(st.lockedAtMs || 0) };
    renderReqLockBar();
    return reqLockState;
  }
  function renderReqLockBar(){
    const bar = q('requestLockBar');
    if(!bar) return;
    const since = reqLockState.lockedAtMs ? ` (since ${new Date(reqLockState.lockedAtMs).toLocaleString()}${reqLockState.lockedByName ? ' by ' + reqLockState.lockedByName : ''})` : '';
    if(reqIsRealOwner()){
      bar.innerHTML = reqLockState.locked
        ? `<div class="notice-card" style="border-left-color:var(--ifwl-amber);margin:0"><strong>🔒 Owner-only approvals are ON</strong>${since}<p style="margin:6px 0 10px;font-size:13px">Other staff can see requests but cannot approve or decline them. You can still review everything below.</p><button class="btn teal" id="reqLockToggleBtn" type="button">Unlock &mdash; let staff review requests again</button></div>`
        : `<div class="notice-card" style="margin:0"><strong>Staff approvals are ON</strong><p style="margin:6px 0 10px;font-size:13px">Any Owner, Ops Manager or Steward can approve or decline requests. Turn on owner-only mode to lock everyone else out.</p><button class="btn purple" id="reqLockToggleBtn" type="button">🔒 Lock &mdash; only I can approve requests</button></div>`;
      const btn = q('reqLockToggleBtn');
      if(btn) btn.addEventListener('click', async () => {
        const next = !reqLockState.locked;
        if(!confirm(next ? 'Lock licence request approvals so only YOU (league owner) can approve or decline? Other staff will see "Locked out by league owner".' : 'Unlock licence request approvals for all staff again?')) return;
        btn.disabled = true;
        try{
          await window.IFWL_RequestAPI.saveRequestLock(next);
          await Promise.all([renderRequestQueue(), renderLmuRequestQueue()]);
        }catch(e){ alert('Could not change the lock: ' + e.message); btn.disabled = false; }
      });
    } else if(reqLockState.locked){
      bar.innerHTML = `<div class="notice-card" style="border-left-color:var(--ifwl-amber);margin:0"><strong>🔒 Locked out by league owner</strong>${since}<p style="margin:6px 0 0;font-size:13px">Licence requests can currently only be approved or declined by the league owner. You can still view them.</p></div>`;
    } else {
      bar.innerHTML = '';
    }
  }

  function escRepair(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function initLmuRepair(){
    const scanBtn = q('lmuRepairScanBtn');
    const out = q('lmuRepairOut');
    if(!scanBtn || !out) return;
    let mains = [];
    async function scan(){
      out.innerHTML = '<small>Scanning...</small>';
      scanBtn.disabled = true;
      try{
        const r = await window.IFWL_RequestAPI.repairLmuMainTier({ apply:false });
        mains = r.mainTiers || [];
        const rows = r.affected || [];
        if(!rows.length){ out.innerHTML = '<div class="notice-card" style="margin:0">No drivers affected - every main licence is a real main tier.</div>'; return; }
        out.innerHTML = '<div style="overflow-x:auto"><table class="data-table" style="width:100%;font-size:13px"><thead><tr><th></th><th>Driver</th><th>Main licence now</th><th>Restore to</th></tr></thead><tbody>' +
          rows.map(a => {
            const opts = (a.restoreTo ? '' : '<option value="">Choose...</option>') + mains.map(m => `<option value="${escRepair(m)}"${m === a.restoreTo ? ' selected' : ''}>${escRepair(m)}</option>`).join('');
            return `<tr data-did="${escRepair(a.driverId)}"><td><input type="checkbox" class="lmuRepairChk" checked></td><td>${escRepair(a.name || a.driverId)}<br><small>${escRepair(a.driverId)}</small></td><td>${escRepair(a.currentTier)}<br><small>kept as add-on</small></td><td><select class="lmuRepairSel">${opts}</select>${a.uncertain ? '<br><small style="color:var(--ifwl-amber,#b5750a)">no earlier main licence found - pick one</small>' : ''}</td></tr>`;
          }).join('') +
          '</tbody></table></div><button class="btn teal" id="lmuRepairApplyBtn" type="button" style="margin-top:10px">Repair selected drivers</button><span class="save-status" id="lmuRepairStatus"></span>';
        q('lmuRepairApplyBtn').addEventListener('click', apply);
      }catch(e){ out.innerHTML = '<div class="notice-card" style="margin:0">Scan failed: ' + escRepair(e.message) + '</div>'; }
      finally{ scanBtn.disabled = false; }
    }
    async function apply(){
      const trs = [...out.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('.lmuRepairChk').checked);
      if(!trs.length) return;
      const driverIds = trs.map(tr => tr.dataset.did);
      const overrides = {};
      trs.forEach(tr => { const v = tr.querySelector('.lmuRepairSel').value; if(v) overrides[tr.dataset.did] = v; });
      if(!confirm('Repair ' + driverIds.length + ' driver(s)? Their main licence will be restored and Discord roles updated.')) return;
      const btn = q('lmuRepairApplyBtn'); const st = q('lmuRepairStatus');
      btn.disabled = true; st.textContent = 'Working...';
      try{
        const r = await window.IFWL_RequestAPI.repairLmuMainTier({ apply:true, driverIds, overrides });
        const ok = (r.results || []).filter(x => x.ok).length;
        const bad = (r.results || []).filter(x => !x.ok);
        st.textContent = `Repaired ${ok}` + (bad.length ? `, ${bad.length} failed: ` + bad.map(b => b.error).join('; ') : '');
        await scan();
        const st2 = q('lmuRepairStatus'); if(st2) st2.textContent = `Repaired ${ok}` + (bad.length ? `, ${bad.length} failed` : '');
      }catch(e){ st.textContent = 'Failed: ' + e.message; btn.disabled = false; }
    }
    scanBtn.addEventListener('click', scan);
  }

  async function renderRequestQueue(){
    const body = q('requestQueueBody');
    if(!body) return;
    await loadReqLock();
    const tiers = await window.IFWL_TierAPI.fetchTierList();
    const findColor = name => (tiers.find(t=>t.name===name) || {color:'#93a1a9'}).color;
    const all = await window.IFWL_RequestAPI.fetchAllRequests();
    const pending = all.filter(r => r.status === 'pending');
    if(!pending.length){ body.innerHTML = '<div class="empty">No pending licence requests.</div>'; return; }

    const [suggestionMap, footprintMap] = await Promise.all([
      reqBuildSystemSuggestionMap(pending.map(r => r.driverId)),
      reqBuildServerFootprintMap(pending.map(r => r.driverId))
    ]);

    body.innerHTML = pending.map(r => {
      // undefined (key never set) = the whole lookup failed/wasn't permitted -
      // say nothing rather than falsely claim "no laps on file". null (key
      // set, no row) = lookup worked, this driver genuinely has none.
      const row = suggestionMap.get(r.driverId);
      const suggestion = row === undefined ? '' : !row
        ? 'System suggests: <strong>no qualifying laps on file yet</strong>'
        : row.qualified
          ? `System suggests: <strong style="color:${findColor(row.recommendedTier)}">${row.recommendedTier}</strong> (avg gap ${row.avgGapPct != null ? row.avgGapPct + '%' : '-'}, ${row.totalLaps} lap(s))`
          : `System suggests: <strong style="color:${findColor(row.recommendedTier)}">${row.recommendedTier}</strong> (not yet qualified - only ${row.totalLaps} lap(s) logged)`;
      const footprint = reqFootprintLabel(footprintMap.get(r.driverId));
      return `
      <div class="request-card" data-driver="${r.driverId}" data-request="${r.id}">
        <span class="request-status-pill pending">Pending</span>
        <strong style="display:block;margin-top:8px">${r.driverName} &mdash; <span style="color:${findColor(r.requestedTier)}">${r.requestedTier}</span></strong>
        <div class="req-meta">Currently: ${r.currentTier} &middot; submitted ${new Date(r.submittedAt).toLocaleString()}</div>
        <div class="req-meta">🏁 Says they're racing: <strong>${reqCurrentRaceLabel(r.currentRace)}</strong>${suggestion ? ` &middot; ${suggestion}` : ''}</div>
        ${footprint ? `<div class="req-meta">${footprint}</div>` : ''}
        <p style="color:var(--text-muted);font-size:13px;margin:8px 0 0">${r.reason}</p>
        ${reqLockedForMe() ? REQ_LOCKED_HTML : `<div class="req-actions">
          <button class="btn teal" data-decision="approved">Approve</button>
          <button class="btn ghost" data-decision="declined">Decline</button>
        </div>`}
      </div>
    `;
    }).join('');

    body.querySelectorAll('[data-decision]').forEach(btn => btn.addEventListener('click', async () => {
      const card = btn.closest('.request-card');
      const driverId = card.dataset.driver, requestId = card.dataset.request;
      const decision = btn.dataset.decision;
      let staffNote = '';
      if(decision === 'declined'){
        staffNote = prompt('Optional note to the driver for why this was declined:') || '';
      }
      btn.disabled = true;
      try{
        await window.IFWL_RequestAPI.reviewRequest(driverId, requestId, decision, staffNote);
        await renderRequestQueue();
      }catch(e){ alert('Could not review request: ' + e.message); btn.disabled = false; if(/locked out by league owner/i.test(e.message)){ renderRequestQueue(); renderLmuRequestQueue(); } }
    }));
  }

  // ✅ ADDED: staff review queue for gated LMU sub-licence requests
  // (Hypercar, LMP3, ...) - mirrors renderRequestQueue() above but is a
  // fully separate queue/collection, since approving one of these ADDS to
  // the driver's lmuSubLicences array instead of overwriting their tier.
  async function renderLmuRequestQueue(){
    const body = q('lmuRequestQueueBody');
    if(!body) return;
    const tiers = await window.IFWL_TierAPI.fetchTierList();
    const findColor = id => (tiers.find(t=>t.id===id) || {color:'#93a1a9'}).color;
    await loadReqLock();
    const pending = await window.IFWL_RequestAPI.fetchAllLmuRequests();
    if(!pending.length){ body.innerHTML = '<div class="empty">No pending LMU sub-licence requests.</div>'; return; }

    body.innerHTML = pending.map(r => `
      <div class="request-card" data-request="${r.id}">
        <span class="request-status-pill pending">Pending</span>
        <strong style="display:block;margin-top:8px">${r.driverName} &mdash; <span style="color:${findColor(r.tierId)}">${r.tierName}</span></strong>
        <div class="req-meta">submitted ${new Date(r.submittedAt).toLocaleString()}</div>
        <p style="color:var(--text-muted);font-size:13px;margin:8px 0 0">${r.reason}</p>
        ${reqLockedForMe() ? REQ_LOCKED_HTML : `<div class="req-actions">
          <button class="btn teal" data-decision="approved">Approve</button>
          <button class="btn ghost" data-decision="declined">Decline</button>
        </div>`}
      </div>
    `).join('');

    body.querySelectorAll('[data-decision]').forEach(btn => btn.addEventListener('click', async () => {
      const card = btn.closest('.request-card');
      const requestId = card.dataset.request;
      const decision = btn.dataset.decision;
      let staffNote = '';
      if(decision === 'declined'){
        staffNote = prompt('Optional note to the driver for why this was declined:') || '';
      }
      btn.disabled = true;
      try{
        await window.IFWL_RequestAPI.reviewLmuRequest(requestId, decision, staffNote);
        await renderLmuRequestQueue();
      }catch(e){ alert('Could not review request: ' + e.message); btn.disabled = false; if(/locked out by league owner/i.test(e.message)){ renderRequestQueue(); renderLmuRequestQueue(); } }
    }));
  }

  /* ---- Manage SimGrid Events ---- */
  // ✅ ADDED: cached after every renderTierCheckboxes() call - the bulk
  // toolbar's "Set LMU sub-licence(s) for selected" tool (see
  // sgBulkToolbarHtml/sgWireBulkToolbar below) needs the same LMU tier list
  // to build its own checkbox set, without a second fetch.
  let sgLmuTiersCache = [];
  async function renderTierCheckboxes(){
    const tiers = await window.IFWL_TierAPI.fetchTierList();
    const sorted = mainLadderTiers(tiers).sort((a,b)=>(a.order??0)-(b.order??0));
    q('sgTierChecks').innerHTML = sorted.map(t =>
      `<label style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;margin-bottom:6px;font-size:12px;font-weight:700;color:var(--text-muted)"><input type="checkbox" value="${t.name}" class="sg-tier-check"> ${t.name}</label>`
    ).join('');
    // ✅ CHANGED: LMU sub-licence picker for the Game=LMU field group above
    // is now a checkbox set (not a single-select) - a real LMU round is
    // often multiclass (e.g. "Hypercar & LMP3's"), so an event can require
    // ANY ONE of several sub-licences, not just one. Same tiers
    // (lmuSubLicence:true) the driver-facing LMU tab lists, whichever
    // ladder they're attached to doesn't matter here since a sub-licence is
    // deliberately NOT part of the main ladder.
    const lmuTiers = (tiers || []).filter(t => t.lmuSubLicence).sort((a,b)=>(a.order??0)-(b.order??0));
    sgLmuTiersCache = lmuTiers;
    const lmuChecks = q('sgLmuTierChecks');
    if(lmuChecks){
      lmuChecks.innerHTML = lmuTiers.length
        ? lmuTiers.map(t => `<label style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;margin-bottom:6px;font-size:12px;font-weight:700;color:var(--text-muted)"><input type="checkbox" value="${t.id}" class="sg-lmu-tier-check"> ${t.name}${t.lmuGated ? ' (staff-approved)' : ''}</label>`).join('')
        : `<span class="field-hint">No sub-licences set up yet - add one in Manage Licence Tiers first</span>`;
    }
  }
  // ✅ ADDED: show the "Required LMU sub-licence" field only when Game=LMU
  // is selected - ACC events (the default, and every pre-existing event)
  // never show or use it.
  function updateSgLmuTierGroupVisibility(){
    q('sgLmuTierGroup')?.classList.toggle('hidden', q('sgGame')?.value !== 'lmu');
  }
  q('sgGame')?.addEventListener('change', updateSgLmuTierGroupVisibility);

  // ---- Discord weekly schedule post (Staff: SimGrid Events) ----
  (function(){
    const api = () => window.IFWL_SchedulePostAPI;
    if(!q('schedPostCard')) return;
    const status = (t, bad) => { const el = q('schedPostStatus'); el.textContent = t || ''; el.style.color = bad ? 'var(--ifwl-red)' : ''; };
    function showSettings(st){
      q('schedAutoEnabled').checked = !!st.enabled;
      q('schedAutoDay').value = String(st.dayOfWeek);
      q('schedAutoTime').value = String(st.hour).padStart(2,'0') + ':' + String(st.minute).padStart(2,'0');
      q('schedTickUrl').value = st.tickKey ? api().tickUrl(st.tickKey) : '';
      q('schedAutoInfo').textContent = st.lastPostedAtMs
        ? `Last post: ${new Date(st.lastPostedAtMs).toLocaleString()} (${st.lastResult || st.lastPostedBy || ''})`
        : 'Nothing posted yet.';
    }
    let loaded = false;
    async function load(){
      try{ showSettings((await api().get()).settings); loaded = true; }
      catch(e){ q('schedAutoInfo').textContent = 'Could not load schedule settings: ' + e.message; }
    }
    // load when the panel is first opened
    document.querySelectorAll('[data-view="staffSimgridEvents"]').forEach(el => el.addEventListener('click', () => { if(!loaded && document.body.classList.contains('staff-access')) load(); }));
    setTimeout(() => { if(!loaded && document.body.classList.contains('staff-access')) load(); }, 2500);

    q('schedPreviewBtn').addEventListener('click', async () => {
      const b = q('schedPreviewBtn'); b.disabled = true; status('Building the preview...');
      try{
        const r = await api().preview();
        q('schedPreviewImg').src = 'data:image/png;base64,' + r.imageBase64;
        q('schedPreviewText').textContent = r.text;
        q('schedPreviewWrap').classList.remove('hidden');
        status(r.eventCount ? `${r.eventCount} event(s) in the next 7 days` + (r.alwaysOpen ? ` plus ${r.alwaysOpen} always-open.` : '.') : 'No dated events in the next 7 days - the image will be mostly empty.');
      }catch(e){ status('Preview failed: ' + e.message, true); }
      b.disabled = false;
    });
    q('schedPostBtn').addEventListener('click', async () => {
      if(!confirm('Post the weekly schedule to the licence bot Discord channel now?')) return;
      const b = q('schedPostBtn'); b.disabled = true; status('Posting to Discord...');
      try{
        const r = await api().postNow();
        status(`Posted to Discord (${r.eventCount} event${r.eventCount === 1 ? '' : 's'}).`);
        showSettings(r.settings);
      }catch(e){ status('Post failed: ' + e.message, true); }
      b.disabled = false;
    });
    q('schedAutoSaveBtn').addEventListener('click', async () => {
      const [hh, mm] = (q('schedAutoTime').value || '12:00').split(':').map(Number);
      try{
        const r = await api().save({ enabled: q('schedAutoEnabled').checked, dayOfWeek: Number(q('schedAutoDay').value), hour: hh, minute: mm });
        showSettings(r.settings);
        status(r.settings.enabled ? 'Saved - automatic posting is ON (needs the one-time Cloud Scheduler job below).' : 'Saved - automatic posting is OFF.');
      }catch(e){ status('Save failed: ' + e.message, true); }
    });
    q('schedCopyUrlBtn').addEventListener('click', async () => {
      const v = q('schedTickUrl').value;
      if(!v) return;
      try{ await navigator.clipboard.writeText(v); status('Link copied.'); }
      catch(e){ q('schedTickUrl').select(); status('Press Ctrl+C to copy the selected link.'); }
    });
    q('schedRotateKeyBtn').addEventListener('click', async () => {
      if(!confirm('Make a new key? The current Cloud Scheduler link will stop working until you paste the new one.')) return;
      try{
        const cur = (await api().get()).settings;
        const r = await api().save({ enabled: cur.enabled, dayOfWeek: cur.dayOfWeek, hour: cur.hour, minute: cur.minute, rotateKey: true });
        showSettings(r.settings);
        status('New key made - update the Cloud Scheduler job with the new link.');
      }catch(e){ status('Failed: ' + e.message, true); }
    });
  })();

  // Mirrors ENTRYLIST_SERIES_CATALOG in rtgate.js - a small fixed constant
  // duplicated here rather than fetched, since it's not staff-editable data.
  const SG_SERIES_CATALOG = [
    { id: 'pc_pro',                label: 'PC Pro' },
    { id: 'pc_pro_am',             label: 'PC Amateur' },
    { id: 'pc_beginner',           label: 'PC Beginner' },
    { id: 'pc_monday_funday',      label: 'PC Monday Funday' },
    { id: 'console_pro_am',        label: 'Console Pro-Am' },
    { id: 'console_beginner',      label: 'Console Beginner' },
    { id: 'console_monday_funday', label: 'Console Monday Funday' }
  ];
  function sgSeriesLabel(id){ return SG_SERIES_CATALOG.find(s => s.id === id)?.label || 'Unassigned'; }

  let sgActiveSeriesTab = 'all';
  let sgLinkedBriefingEventIds = new Set();

  async function renderSimgridEventList(){
    const events = await window.IFWL_SimgridAPI.fetchAllSimgridEvents();
    window.__sgEventsCache = events; // used by the Edit button below to load exact per-event data

    // Best-effort: which events already have a raceday briefing linked, so
    // staff can see at a glance what this planning hub still needs - this
    // now covers this and other seasons, not just a single link list.
    sgLinkedBriefingEventIds = new Set();
    try{
      const infos = (await window.IFWL_Api.apiGet('staffRacedayInfoList')).infos || [];
      infos.forEach(info => (info.linkedEventIds || []).forEach(id => sgLinkedBriefingEventIds.add(id)));
    }catch(e){ console.warn('Could not check raceday briefing links', e); }

    sgRenderSeriesTabs(events);
    sgRenderEventListBody(events);
  }

  function sgRenderSeriesTabs(events){
    const wrap = q('sgSeriesTabs');
    if(!wrap) return;
    const counts = { all: events.length, unassigned: 0 };
    SG_SERIES_CATALOG.forEach(s => { counts[s.id] = 0; });
    events.forEach(e => {
      const key = e.series && counts.hasOwnProperty(e.series) ? e.series : 'unassigned';
      counts[key] = (counts[key] || 0) + 1;
    });
    const tabs = [{ id: 'all', label: 'All events' }, ...SG_SERIES_CATALOG, { id: 'unassigned', label: 'Unassigned' }];
    wrap.innerHTML = tabs.map(t => `<button type="button" class="sg-series-tab ${sgActiveSeriesTab === t.id ? 'active' : ''}" data-series-tab="${t.id}">${t.label}<span class="count">(${counts[t.id] || 0})</span></button>`).join('');
    wrap.querySelectorAll('[data-series-tab]').forEach(btn => btn.addEventListener('click', () => {
      sgActiveSeriesTab = btn.dataset.seriesTab;
      sgRenderSeriesTabs(events);
      sgRenderEventListBody(events);
    }));
  }

  // ✅ CHANGED: grouped-by-series rendering. Previously every round of a
  // championship (e.g. PC Pro-Am's 10 rounds) showed as its own flat
  // top-level card, so clearing out a finished series meant deleting rounds
  // one at a time. Now rounds that share a parent (either ownerEventId, for
  // ones pushed from League Owners Overview, or simgridLink, for ones
  // added/imported here directly) are nested under ONE series card, with a
  // per-round checkbox + a "Delete selected" bulk action above the list. A
  // round with neither (a genuinely standalone manual add) still renders as
  // its own flat card, unchanged from before.
  // ✅ ADDED: click-to-edit date/time on each round (Staff: SimGrid Events).
  // Click the date -> date + time boxes (UK time) with a Save button right
  // there; several rounds can be left open and saved together with the
  // series' "Save all date changes" button. Updates the card in place so the
  // series stays open. See staffSimgridEventSetDates in rtgate.js.
  const sgDateEdits = new Map(); // eventId -> { date, time, groupKey }
  function sgUkParts(ms){
    const p = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })
      .formatToParts(new Date(ms)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
  }
  function sgDateLineInner(e){
    const dateStr = e.eventDateMs ? new Date(e.eventDateMs).toLocaleString() : (e.eventDateLabel || 'No date set');
    const scheduleBits = [e.dayOfWeek, e.raceTimeUK ? `${e.raceTimeUK} UK` : ''].filter(Boolean).join(' ');
    return `📅 <span class="sg-date-chip" data-edit-date="${e.id}" title="Click to change the date and time" style="cursor:pointer;border-bottom:1px dashed currentColor;font-weight:700">${dateStr} ✎</span>${scheduleBits ? ` &middot; 🗓️ ${scheduleBits}` : ''} &middot; 🖥️ ${e.hostedBy || 'GPortal'}`;
  }
  function sgDateEditorInner(e){
    const cur = sgDateEdits.get(e.id) || {};
    return `📅 <input type="date" data-date-input="${e.id}" value="${cur.date || ''}" style="width:auto;padding:4px 6px">
      <input type="time" data-time-input="${e.id}" value="${cur.time || ''}" style="width:auto;padding:4px 6px">
      <span class="field-hint">UK time</span>
      <button class="btn teal" type="button" data-save-date="${e.id}" style="padding:4px 12px;font-size:12px">Save</button>
      <button class="btn ghost" type="button" data-cancel-date="${e.id}" style="padding:4px 10px;font-size:12px">Cancel</button>
      <span class="field-hint" data-date-status="${e.id}"></span>`;
  }
  function sgRefreshGroupSaveButtons(wrap){
    wrap.querySelectorAll('[data-save-group-dates]').forEach(btn => {
      const key = btn.dataset.saveGroupDates;
      const n = [...sgDateEdits.values()].filter(v => v.groupKey === key).length;
      btn.classList.toggle('hidden', n === 0);
      btn.textContent = `Save all date changes (${n})`;
    });
  }
  async function sgSaveDates(wrap, ids){
    const events = window.__sgEventsCache || [];
    const updates = [];
    for(const id of ids){
      const ed = sgDateEdits.get(id);
      if(!ed) continue;
      if(!ed.date){ const st = wrap.querySelector(`[data-date-status="${CSS.escape(id)}"]`); if(st) st.textContent = 'Pick a date first.'; return; }
      updates.push({ eventId: id, date: ed.date, time: ed.time });
    }
    if(!updates.length) return;
    wrap.querySelectorAll('[data-save-date],[data-save-group-dates]').forEach(b => { b.disabled = true; });
    try{
      const r = await window.IFWL_Api.apiPost('staffSimgridEventSetDates', { updates });
      (r.results || []).forEach(res => {
        const e = events.find(x => x.id === res.eventId);
        if(res.ok && e){
          e.eventDateMs = res.eventDateMs; e.eventDateLabel = ''; e.dayOfWeek = res.dayOfWeek; e.raceTimeUK = res.raceTimeUK;
          sgDateEdits.delete(res.eventId);
          const line = wrap.querySelector(`[data-date-line="${CSS.escape(res.eventId)}"]`);
          if(line) line.innerHTML = sgDateLineInner(e) + ' <span class="field-hint" style="color:var(--ifwl-green);font-weight:700">saved ✓</span>';
        }else{
          const st = wrap.querySelector(`[data-date-status="${CSS.escape(res.eventId)}"]`);
          if(st) st.textContent = res.error || 'Could not save.';
        }
      });
    }catch(err){
      ids.forEach(id => { const st = wrap.querySelector(`[data-date-status="${CSS.escape(id)}"]`); if(st) st.textContent = 'Could not save: ' + err.message; });
    }
    wrap.querySelectorAll('[data-save-date],[data-save-group-dates]').forEach(b => { b.disabled = false; });
    sgRefreshGroupSaveButtons(wrap);
  }

  function sgRenderEventListBody(events){
    const wrap = q('sgEventList');
    sgDateEdits.clear();
    // Ascending date order within the active tab - the next upcoming event
    // sits at the top, same as before, just scoped to one series at a time.
    const filtered = sgActiveSeriesTab === 'all'
      ? events
      : sgActiveSeriesTab === 'unassigned'
        ? events.filter(e => !e.series)
        : events.filter(e => e.series === sgActiveSeriesTab);

    if(!filtered.length){ wrap.innerHTML = `<div class="empty">${events.length ? 'No events in this series yet.' : 'No SimGrid events yet.'}</div>` + sgBulkToolbarHtml(); sgWireBulkToolbar(wrap); return; }

    const cutoffMs = Date.now() - (4 * 60 * 60 * 1000);

    const groups = new Map(); // key -> { name, rounds: [] }
    filtered.forEach(e => {
      const key = e.ownerEventId || e.simgridLink || `solo:${e.id}`;
      if(!groups.has(key)) groups.set(key, { name: e.ownerEventName || '', rounds: [] });
      const g = groups.get(key);
      if(!g.name && e.ownerEventName) g.name = e.ownerEventName;
      g.rounds.push(e);
    });

    // Each group sorts its own rounds soonest-first, then groups themselves
    // sort by their own soonest round - same overall ordering feel as before.
    const groupList = [...groups.entries()].map(([key, g]) => {
      const rounds = [...g.rounds].sort((a,b) => (a.eventDateMs || Infinity) - (b.eventDateMs || Infinity));
      return { key, rounds, soonestMs: rounds[0]?.eventDateMs || Infinity };
    }).sort((a,b) => a.soonestMs - b.soonestMs);

    const roundRowHtml = (e, compact) => {
      const dateStr = e.eventDateMs ? new Date(e.eventDateMs).toLocaleString() : (e.eventDateLabel || 'No date set');
      const ended = e.eventDateMs && e.eventDateMs < cutoffMs && !e.pinned;
      const hasBriefing = sgLinkedBriefingEventIds.has(e.id);
      const imgSrc = e.imageUrl || e.simgridImageUrl || '';
      const scheduleBits = [e.dayOfWeek, e.raceTimeUK ? `${e.raceTimeUK} UK` : ''].filter(Boolean).join(' ');
      return `
      <div class="note-item sg-round-card" data-round-card="${e.id}" style="${compact ? 'margin-left:22px' : ''}">
        <div style="display:flex;gap:12px">
          <input type="checkbox" class="sg-bulk-select" data-select-event="${e.id}" style="width:auto;margin-top:4px">
          ${imgSrc ? `<img src="${imgSrc}" alt="" style="width:88px;height:56px;object-fit:cover;border-radius:8px;flex:none">` : ''}
          <div style="flex:1;min-width:0">
            <strong>${e.title}</strong>${(e.game && e.game !== 'acc') ? ` <span class="field-hint" style="color:var(--ifwl-purple);font-weight:700">[${({lmu:'LMU',raceroom:'RaceRoom',acrally:'AC Rally',rocketleague:'Rocket League'})[e.game] || e.game}]</span>` : ''}${ended ? ' <span class="field-hint">(no longer shown to drivers - date has passed)</span>' : ''}
            <div class="note-meta">${sgSeriesLabel(e.series)} &middot; ${(e.platform||'both')==='both'?'Console + PC':(e.platform==='console'?'Console':'PC')} &middot; ${(e.tiers||[]).join(', ')}${e.game === 'lmu' ? ` &middot; LMU sub-licence${(e.lmuRequiredTierIds||[]).length === 1 ? '' : 's'}: ${(e.lmuRequiredTierIds||[]).length ? e.lmuRequiredTierIds.map(id => sgLmuTiersCache.find(t => t.id === id)?.name || id).join(' or ') : '<em>none selected</em>'}` : ''}</div>
            <div class="note-meta sg-date-line" data-date-line="${e.id}">${sgDateLineInner(e)}</div>
            <div class="note-meta">${e.password ? `🔒 This event's password: ${e.password}` : 'No password set for this event'}</div>
            <div class="note-meta" style="${e.simgridLink ? '' : 'color:var(--ifwl-amber);font-weight:700'}">${e.simgridLink ? `🔗 <a href="${e.simgridLink}" target="_blank" rel="noopener">SimGrid event link</a>` : "⚠️ No SimGrid event link set - driver's \"View invite\" button won't show"}</div>
            <div class="note-meta">${e.discordRoleId ? `🔓 Unlocks Discord: ${e.discordRoleLabel || 'Role ' + e.discordRoleId}` : 'No Discord area unlocked by this event'}</div>
            <div class="note-meta">👥 ${e.rosterCount ? `${e.rosterCount} driver(s) signed up (shown as cards under Available Races)` : 'No signup roster uploaded yet'}</div>
            <div class="note-meta" style="color:${hasBriefing ? 'var(--ifwl-green)' : 'var(--ifwl-amber)'};font-weight:700">${hasBriefing ? '📋 Raceday briefing attached' : '⚠️ No raceday briefing linked yet'}</div>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn ghost" data-edit-event="${e.id}">Edit</button>
          <button class="btn ghost" data-delete-event="${e.id}">Delete</button>
          ${e.rosterCount ? `<button class="btn ghost" data-roster-move="${e.id}">Move roster to another event</button><button class="btn ghost" data-roster-clear="${e.id}" style="color:var(--ifwl-red)">Remove roster (${e.rosterCount})</button>` : ''}
          <label class="btn ghost" style="cursor:pointer;margin:0">Upload Roster (CSV/JSON)<input type="file" accept=".csv,.json,text/csv,application/json" data-roster-upload="${e.id}" style="display:none"></label>
          ${hasBriefing ? '' : `<button class="btn ghost" data-goto-briefing="${e.id}">+ Add raceday briefing</button>`}
        </div>
      </div>`;
    };

    wrap.innerHTML = sgBulkToolbarHtml() + groupList.map(g => {
      if(g.rounds.length <= 1) return roundRowHtml(g.rounds[0], false);
      const groupName = g.rounds[0].ownerEventName || g.name || g.rounds[0].title.split(/\s*[-|]\s*/)[0] || 'Series';
      const liveCount = g.rounds.length;
      return `
      <div class="note-item sg-series-group" data-series-group="${g.key}" style="background:#f7f8fa">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div style="display:flex;align-items:center;gap:10px;cursor:pointer" data-series-toggle="${g.key}">
            <div><strong>${groupName}</strong> <span class="field-hint">(${liveCount} round${liveCount===1?'':'s'})</span></div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn teal hidden" type="button" data-save-group-dates="${g.key}" style="font-size:11px">Save all date changes (0)</button>
            <label class="btn ghost" style="cursor:pointer;margin:0;font-size:11px"><input type="checkbox" data-select-group="${g.key}" style="width:auto;margin-right:4px">Select all in series</label>
            <button class="btn ghost" type="button" data-series-toggle-btn="${g.key}">Show/hide rounds</button>
          </div>
        </div>
        <div data-series-body="${g.key}" class="hidden" style="margin-top:10px">
          ${g.rounds.map(e => roundRowHtml(e, true)).join('')}
        </div>
      </div>`;
    }).join('');

    // ---- click-to-edit date/time ----
    wrap.onclick = (ev) => {
      const chip = ev.target.closest('[data-edit-date]');
      if(chip){
        const id = chip.dataset.editDate;
        const e = (window.__sgEventsCache || []).find(x => x.id === id);
        const line = wrap.querySelector(`[data-date-line="${CSS.escape(id)}"]`);
        if(!e || !line || sgDateEdits.has(id)) return;
        const parts = e.eventDateMs ? sgUkParts(e.eventDateMs) : { date: '', time: e.raceTimeUK || '' };
        const groupKey = line.closest('[data-series-group]')?.dataset.seriesGroup || '';
        sgDateEdits.set(id, { date: parts.date, time: parts.time, groupKey });
        line.innerHTML = sgDateEditorInner(e);
        sgRefreshGroupSaveButtons(wrap);
        return;
      }
      const saveBtn = ev.target.closest('[data-save-date]');
      if(saveBtn) return sgSaveDates(wrap, [saveBtn.dataset.saveDate]);
      const cancelBtn = ev.target.closest('[data-cancel-date]');
      if(cancelBtn){
        const id = cancelBtn.dataset.cancelDate;
        sgDateEdits.delete(id);
        const e = (window.__sgEventsCache || []).find(x => x.id === id);
        const line = wrap.querySelector(`[data-date-line="${CSS.escape(id)}"]`);
        if(e && line) line.innerHTML = sgDateLineInner(e);
        sgRefreshGroupSaveButtons(wrap);
        return;
      }
      const groupBtn = ev.target.closest('[data-save-group-dates]');
      if(groupBtn){
        const key = groupBtn.dataset.saveGroupDates;
        const ids = [...sgDateEdits.entries()].filter(([, v]) => v.groupKey === key).map(([id]) => id);
        return sgSaveDates(wrap, ids);
      }
    };
    wrap.oninput = (ev) => {
      const di = ev.target.closest('[data-date-input]');
      const ti = ev.target.closest('[data-time-input]');
      const id = (di && di.dataset.dateInput) || (ti && ti.dataset.timeInput);
      if(!id || !sgDateEdits.has(id)) return;
      const cur = sgDateEdits.get(id);
      if(di) cur.date = di.value;
      if(ti) cur.time = ti.value;
    };

    // ---- series group expand/collapse ----
    wrap.querySelectorAll('[data-series-toggle-btn]').forEach(btn => btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const key = btn.dataset.seriesToggleBtn;
      wrap.querySelector(`[data-series-body="${CSS.escape(key)}"]`)?.classList.toggle('hidden');
    }));
    wrap.querySelectorAll('[data-series-toggle]').forEach(head => head.addEventListener('click', () => {
      const key = head.dataset.seriesToggle;
      wrap.querySelector(`[data-series-body="${CSS.escape(key)}"]`)?.classList.toggle('hidden');
    }));
    // ✅ ADDED: "Select all in series" - ticks every round's checkbox
    // within this one group, so staff can select a whole series in one
    // click before using the bulk toolbar's Delete or Set Platform actions
    // below, instead of ticking 10 rounds one at a time.
    // ✅ FIXED: this used to also force the group open
    // (`body.classList.remove('hidden')`), which meant every round's own
    // Edit/Delete buttons popped into view directly under the checkbox the
    // instant it was ticked - a follow-up click anywhere near there (e.g.
    // reaching for "Set platform for selected" in the toolbar above, or a
    // second tap on a touch screen) could land on one of those buttons
    // instead, silently loading a different event into the form above and
    // overwriting whatever was being worked on (title, image, etc.) - this
    // matches what was reported ("all reverts to nothing... picture goes
    // missing"). Selecting no longer changes what's expanded - "Show/hide
    // rounds" is the only thing that opens a group now, so there's nothing
    // new for a stray click to hit.
    wrap.querySelectorAll('[data-select-group]').forEach(cb => cb.addEventListener('change', (ev) => {
      ev.stopPropagation();
      const key = cb.dataset.selectGroup;
      const body = wrap.querySelector(`[data-series-body="${CSS.escape(key)}"]`);
      if(!body) return;
      body.querySelectorAll('.sg-bulk-select').forEach(round => { round.checked = cb.checked; });
      const n = wrap.querySelectorAll('.sg-bulk-select:checked').length;
      const delBtn = q('sgBulkDeleteBtn');
      if(delBtn){ delBtn.disabled = !n; delBtn.textContent = `Delete selected (${n})`; }
      const platBtn = q('sgBulkPlatformBtn');
      if(platBtn) platBtn.disabled = !n;
      const linkBtn = q('sgBulkLinkBtn');
      if(linkBtn) linkBtn.disabled = !n;
    }));

    wrap.querySelectorAll('[data-roster-upload]').forEach(input => input.addEventListener('change', async () => {
      const file = input.files[0];
      if(!file) return;
      const eventId = input.dataset.rosterUpload;
      try{
        const text = await ecrDecodeFile(file);
        const entries = file.name.toLowerCase().endsWith('.json')
          ? ecrExtractFromJson(text)
          : ecrExtractFromCsv(ecrParseCsv(text));
        if(!entries.length){ alert("No usable entries found in that file - check it's the right export."); input.value = ''; return; }
        const result = await window.IFWL_SimgridAPI.uploadEventRoster(eventId, entries);
        alert(`Roster uploaded - ${result.rosterCount} driver(s) saved. Drivers will now see this as cards under Available Races.`);
        await renderSimgridEventList();
      }catch(e){ alert('Could not upload roster: ' + e.message); input.value = ''; }
    }));
    wrap.querySelectorAll('[data-roster-clear]').forEach(btn => btn.addEventListener('click', async () => {
      const ev = (window.__sgEventsCache || []).find(x => x.id === btn.dataset.rosterClear);
      if(!confirm(`Remove the uploaded roster (${ev?.rosterCount || '?'} drivers) from "${ev?.title || 'this event'}"? Drivers will stop seeing the signed-up cards for it. You can re-upload a roster afterwards.`)) return;
      try{ await window.IFWL_SimgridAPI.clearEventRoster(btn.dataset.rosterClear); await renderSimgridEventList(); }
      catch(e){ alert('Could not remove roster: ' + e.message); }
    }));
    wrap.querySelectorAll('[data-roster-move]').forEach(btn => btn.addEventListener('click', () => {
      const srcId = btn.dataset.rosterMove;
      const events = (window.__sgEventsCache || []);
      const src = events.find(x => x.id === srcId);
      const others = events.filter(x => x.id !== srcId);
      if(!others.length){ alert('There are no other events to move it to.'); return; }
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:9200;background:rgba(5,8,12,.74);display:flex;align-items:center;justify-content:center;padding:16px';
      ov.innerHTML = `<div style="background:var(--panel-bg,#fff);color:var(--text-primary,#111);border-radius:16px;padding:20px;width:min(520px,100%);box-shadow:0 30px 80px rgba(0,0,0,.5)">
        <h4 style="margin:0 0 8px">Move roster</h4>
        <div class="field-hint">Moves the ${src?.rosterCount || ''} driver(s) from <b>${escRepair(src?.title || '')}</b> onto the event you pick (replacing any roster already on it) and removes it from this one.</div>
        <select id="rosterMoveSel" style="width:100%;margin:12px 0;padding:9px;border-radius:8px">${others.map(o => `<option value="${o.id}">${escRepair(o.title)}${o.rosterCount ? ' (already has ' + o.rosterCount + ' - will be replaced)' : ''}</option>`).join('')}</select>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" type="button" id="rosterMoveCancel">Cancel</button><button class="btn teal" type="button" id="rosterMoveGo">Move roster</button></div></div>`;
      document.body.appendChild(ov);
      ov.querySelector('#rosterMoveCancel').onclick = () => ov.remove();
      ov.querySelector('#rosterMoveGo').onclick = async () => {
        const dst = ov.querySelector('#rosterMoveSel').value;
        try{ await window.IFWL_SimgridAPI.clearEventRoster(srcId, dst); ov.remove(); await renderSimgridEventList(); }
        catch(e){ alert('Could not move roster: ' + e.message); }
      };
    }));
    wrap.querySelectorAll('[data-delete-event]').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('Delete this event? Drivers will stop seeing it in Available Races.')) return;
      try{ await window.IFWL_SimgridAPI.deleteSimgridEvent(btn.dataset.deleteEvent); await renderSimgridEventList(); }
      catch(e){ alert('Could not delete: ' + e.message); }
    }));
    wrap.querySelectorAll('[data-goto-briefing]').forEach(btn => btn.addEventListener('click', () => {
      const eventId = btn.dataset.gotoBriefing;
      window.switchView('staffRacedayInfo');
      // Pre-tick this event in the briefing form's event-link checklist, if
      // it's already rendered (it is, once staff panels have initialised).
      setTimeout(() => {
        const chk = document.querySelector(`.rdi-event-check[value="${eventId}"]`);
        if(chk) chk.checked = true;
      }, 50);
    }));
    // ✅ ADDED: loads THIS specific event's own data into the form for
    // editing - directly addresses "no way to tell which password belongs
    // to which round". Editing and saving updates only this one record,
    // never touches any other event.
    // ✅ FIXED: a click on the wrong round's Edit button (e.g. a mis-click
    // while working the bulk toolbar) used to silently overwrite whatever
    // was already in the form above - including an uploaded image, with no
    // way back short of re-typing everything. Now, if the form looks like
    // it has something in progress for a DIFFERENT event (or an unsaved new
    // event) than the one just clicked, it asks first.
    wrap.querySelectorAll('[data-edit-event]').forEach(btn => btn.addEventListener('click', () => {
      const ev = (window.__sgEventsCache || []).find(x => x.id === btn.dataset.editEvent);
      if(!ev) return;
      if(sgFormHasUnsavedWork() && sgEditingEventId !== ev.id){
        const msg = sgEditingEventId
          ? `You're already editing another event above - switching to "${ev.title}" will discard those unsaved changes. Continue?`
          : `The form above has unsaved details for a new event - switching to "${ev.title}" will discard them. Continue?`;
        if(!confirm(msg)) return;
      }
      sgEditingEventId = ev.id;
      q('sgTitle').value = ev.title || '';
      q('sgLink').value = ev.simgridLink || '';
      q('sgPlatform').value = ev.platform || 'both';
      q('sgSeries').value = ev.series || '';
      q('sgGame').value = ev.game || 'acc';
      updateSgLmuTierGroupVisibility();
      {
        const required = new Set(Array.isArray(ev.lmuRequiredTierIds) ? ev.lmuRequiredTierIds : []);
        q('sgLmuTierChecks')?.querySelectorAll('.sg-lmu-tier-check').forEach(cb => { cb.checked = required.has(cb.value); });
      }
      q('sgNotes').value = ev.notes || '';
      q('sgPassword').value = ev.password || '';
      q('sgDayOfWeek').value = ev.dayOfWeek || '';
      q('sgRaceTimeUK').value = ev.raceTimeUK || '';
      q('sgHostedBy').value = ev.hostedBy || '';
      q('sgPinned').checked = !!ev.pinned;
      q('sgDiscordRoleId').value = ev.discordRoleId || '';
      q('sgDiscordRoleLabel').value = ev.discordRoleLabel || '';
      q('sgEventDate').value = ev.eventDateMs ? new Date(ev.eventDateMs).toISOString().slice(0,16) : '';
      q('sgEventDateLabel').value = ev.eventDateLabel || '';
      document.querySelectorAll('.sg-tier-check').forEach(el => { el.checked = (ev.tiers||[]).includes(el.value); });
      sgEditingEventImageUrl = ev.imageUrl || '';
      q('sgEventImageInput').value = '';
      q('sgEventImagePreview').innerHTML = sgEditingEventImageUrl
        ? `<img src="${sgEditingEventImageUrl}" alt="" style="width:120px;height:76px;object-fit:cover;border-radius:8px;display:block"><div class="field-hint">Current image - choosing a new file above replaces it.</div>`
        : `<div class="field-hint">No image set - falls back to SimGrid's own auto-fetch, if any.</div>`;
      q('sgSaveBtn').textContent = `Update "${ev.title}"`;
      q('sgCancelEditBtn').classList.remove('hidden');
      q('sgSaveStatus').textContent = `Editing this one event only - its password is shown above, separate from every other event.`;
      q('simgridEventsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    sgWireBulkToolbar(wrap);
  }

  // ✅ ADDED: "Delete selected" toolbar for the multi-select checkboxes -
  // addresses "im having to delete 1 by 1 at the omoent." Sits above the
  // (grouped) event list; count updates live as rounds are ticked.
  function sgBulkToolbarHtml(){
    return `<div class="note-item" id="sgBulkToolbar" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff">
      <label style="display:flex;align-items:center;gap:6px;margin:0;cursor:pointer"><input type="checkbox" id="sgSelectAllCheck" style="width:auto"> Select all</label>
      <button class="btn ghost" id="sgBulkDeleteBtn" type="button" disabled>Delete selected (0)</button>
      <span style="display:flex;align-items:center;gap:6px;border-left:1px solid var(--ifwl-line);padding-left:10px;margin-left:2px">
        <select id="sgBulkPlatformSelect" style="width:auto">
          <option value="both">Console + PC</option>
          <option value="console">Console only</option>
          <option value="pc">PC only</option>
        </select>
        <button class="btn ghost" id="sgBulkPlatformBtn" type="button" disabled>Set platform for selected</button>
      </span>
      <span style="display:flex;align-items:center;gap:6px;border-left:1px solid var(--ifwl-line);padding-left:10px;margin-left:2px;flex:1;min-width:220px">
        <input type="url" id="sgBulkLinkInput" placeholder="https://thesimgrid.com/championships/..." style="flex:1;min-width:160px">
        <button class="btn ghost" id="sgBulkLinkBtn" type="button" disabled>Set SimGrid link for selected</button>
      </span>
      <span style="display:flex;align-items:center;gap:6px;border-left:1px solid var(--ifwl-line);padding-left:10px;margin-left:2px;flex:1;min-width:220px">
        <input type="text" id="sgBulkRenameInput" placeholder="e.g. CONSOLE : Monday Night Multiclass" style="flex:1;min-width:160px">
        <button class="btn ghost" id="sgBulkRenameBtn" type="button" disabled>Rename selected</button>
      </span>
      <span style="display:flex;align-items:center;gap:8px;border-left:1px solid var(--ifwl-line);padding-left:10px;margin-left:2px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:700;color:var(--text-muted)">Set as LMU, requiring any of:</span>
        <span id="sgBulkLmuChecks" style="display:flex;gap:10px;flex-wrap:wrap">${
          sgLmuTiersCache.length
            ? sgLmuTiersCache.map(t => `<label style="display:inline-flex;align-items:center;gap:4px;margin:0;cursor:pointer;font-size:12px;font-weight:700;color:var(--text-muted)"><input type="checkbox" value="${t.id}" class="sg-bulk-lmu-check" style="width:auto"> ${t.name}${t.lmuGated ? ' (staff-approved)' : ''}</label>`).join('')
            : `<span class="field-hint">No LMU sub-licences set up yet - add one in Manage Licence Tiers first</span>`
        }</span>
        <button class="btn ghost" id="sgBulkLmuBtn" type="button" disabled>Apply to selected</button>
      </span>
      <span class="field-hint" id="sgBulkStatus"></span>
    </div>`;
  }
  function sgWireBulkToolbar(wrap){
    const updateCount = () => {
      const n = wrap.querySelectorAll('.sg-bulk-select:checked').length;
      const delBtn = q('sgBulkDeleteBtn');
      if(delBtn){ delBtn.disabled = !n; delBtn.textContent = `Delete selected (${n})`; }
      const platBtn = q('sgBulkPlatformBtn');
      if(platBtn) platBtn.disabled = !n;
      const linkBtn = q('sgBulkLinkBtn');
      if(linkBtn) linkBtn.disabled = !n;
      const renameBtn = q('sgBulkRenameBtn');
      if(renameBtn) renameBtn.disabled = !n;
      const lmuBtn = q('sgBulkLmuBtn');
      if(lmuBtn) lmuBtn.disabled = !n || !wrap.querySelectorAll('.sg-bulk-lmu-check:checked').length;
    };
    wrap.querySelectorAll('.sg-bulk-select').forEach(cb => cb.addEventListener('change', updateCount));
    wrap.querySelectorAll('.sg-bulk-lmu-check').forEach(cb => cb.addEventListener('change', updateCount));
    q('sgSelectAllCheck')?.addEventListener('change', (e) => {
      wrap.querySelectorAll('.sg-bulk-select').forEach(cb => { cb.checked = e.target.checked; });
      updateCount();
    });
    q('sgBulkDeleteBtn')?.addEventListener('click', async () => {
      const ids = [...wrap.querySelectorAll('.sg-bulk-select:checked')].map(cb => cb.dataset.selectEvent);
      if(!ids.length) return;
      if(!confirm(`Delete ${ids.length} round(s)? Drivers will stop seeing them in Available Races.`)) return;
      const btn = q('sgBulkDeleteBtn');
      btn.disabled = true; btn.textContent = 'Deleting…';
      try{
        await window.IFWL_SimgridAPI.bulkDeleteSimgridEvents(ids);
        await renderSimgridEventList();
      }catch(e){
        const status = q('sgBulkStatus');
        if(status) status.textContent = `Delete failed: ${e.message}`;
        btn.disabled = false;
      }
    });
    // ✅ ADDED: fast fix for rounds that were already pushed with the wrong
    // platform (League Owners Overview's Push used to guess "Console + PC"
    // for every series, since the season plan's platforms list isn't
    // per-series) - select the rounds (or a whole series via "Select all
    // in series" above), pick the right platform, apply once.
    q('sgBulkPlatformBtn')?.addEventListener('click', async () => {
      const ids = [...wrap.querySelectorAll('.sg-bulk-select:checked')].map(cb => cb.dataset.selectEvent);
      if(!ids.length) return;
      const platform = q('sgBulkPlatformSelect').value;
      const platformLabel = platform === 'console' ? 'Console only' : platform === 'pc' ? 'PC only' : 'Console + PC';
      if(!confirm(`Set ${ids.length} round(s) to "${platformLabel}"?`)) return;
      const btn = q('sgBulkPlatformBtn');
      btn.disabled = true; btn.textContent = 'Updating…';
      try{
        await window.IFWL_SimgridAPI.bulkSetPlatformSimgridEvents(ids, platform);
        await renderSimgridEventList();
      }catch(e){
        const status = q('sgBulkStatus');
        if(status) status.textContent = `Platform update failed: ${e.message}`;
        btn.disabled = false; btn.textContent = 'Set platform for selected';
      }
    });
    // ✅ ADDED: rounds pushed from League Owners Overview never got a
    // SimGrid event link at all (Push always left it blank), which meant no
    // working "View invite" button for drivers - and fixing it used to mean
    // editing every round by hand. A whole series normally shares ONE
    // championship link, so this is the same "select a series, apply once"
    // shape as the platform tool above.
    q('sgBulkLinkBtn')?.addEventListener('click', async () => {
      const ids = [...wrap.querySelectorAll('.sg-bulk-select:checked')].map(cb => cb.dataset.selectEvent);
      if(!ids.length) return;
      const link = q('sgBulkLinkInput').value.trim();
      if(!link){ const status = q('sgBulkStatus'); if(status) status.textContent = 'Enter a SimGrid link first.'; return; }
      if(!confirm(`Set ${ids.length} round(s) to this SimGrid link?`)) return;
      const btn = q('sgBulkLinkBtn');
      btn.disabled = true; btn.textContent = 'Updating…';
      try{
        await window.IFWL_SimgridAPI.bulkSetSimgridLinkSimgridEvents(ids, link);
        await renderSimgridEventList();
      }catch(e){
        const status = q('sgBulkStatus');
        if(status) status.textContent = `Link update failed: ${e.message}`;
        btn.disabled = false; btn.textContent = 'Set SimGrid link for selected';
      }
    });
    // ✅ ADDED: staff feedback - a series pushed from League Owners Overview
    // (e.g. via Duplicate event, for a separate Console push) can end up
    // with the wrong name on its PARENT owner_events doc - since the group
    // header above is read live from that name (not each round's own
    // title), fixing it used to mean leaving this page for League Owners
    // Overview. This does it right here: select the rounds (typically a
    // whole series via "Select all in series" above), type the correct
    // name once, apply - fixes the group header AND rewrites the series
    // portion of every selected round's own title, leaving each round's
    // "- Round N - Track" suffix untouched.
    q('sgBulkRenameBtn')?.addEventListener('click', async () => {
      const ids = [...wrap.querySelectorAll('.sg-bulk-select:checked')].map(cb => cb.dataset.selectEvent);
      if(!ids.length) return;
      const newName = q('sgBulkRenameInput').value.trim();
      if(!newName){ const status = q('sgBulkStatus'); if(status) status.textContent = 'Enter a new name first.'; return; }
      if(!confirm(`Rename ${ids.length} round(s) to "${newName}"? This also fixes the series header if these rounds were pushed from League Owners Overview.`)) return;
      const btn = q('sgBulkRenameBtn');
      btn.disabled = true; btn.textContent = 'Renaming…';
      try{
        await window.IFWL_SimgridAPI.bulkRenameSimgridEvents(ids, newName);
        await renderSimgridEventList();
      }catch(e){
        const status = q('sgBulkStatus');
        if(status) status.textContent = `Rename failed: ${e.message}`;
        btn.disabled = false; btn.textContent = 'Rename selected';
      }
    });
    // ✅ ADDED: turns the selected round(s) into LMU events in one go -
    // sets Game=LMU and the SAME set of required sub-licence(s) on all of
    // them at once (tick more than one sub-licence for a multiclass round
    // like "Hypercar & LMP3's" - a driver needs ANY ONE of them). The fast
    // fix for a whole series (e.g. 10 rounds pushed from League Owners
    // Overview) instead of opening Edit on each round individually.
    q('sgBulkLmuBtn')?.addEventListener('click', async () => {
      const ids = [...wrap.querySelectorAll('.sg-bulk-select:checked')].map(cb => cb.dataset.selectEvent);
      if(!ids.length) return;
      const lmuRequiredTierIds = [...wrap.querySelectorAll('.sg-bulk-lmu-check:checked')].map(cb => cb.value);
      if(!lmuRequiredTierIds.length){ const status = q('sgBulkStatus'); if(status) status.textContent = 'Tick at least one LMU sub-licence first.'; return; }
      const names = [...wrap.querySelectorAll('.sg-bulk-lmu-check:checked')].map(cb => cb.parentElement.textContent.trim());
      if(!confirm(`Set ${ids.length} round(s) to LMU, requiring any of: ${names.join(', ')}? They'll move to the dedicated LMU tab on Available Races.`)) return;
      const btn = q('sgBulkLmuBtn');
      btn.disabled = true; btn.textContent = 'Updating…';
      try{
        await window.IFWL_SimgridAPI.bulkSetLmuSimgridEvents(ids, lmuRequiredTierIds);
        await renderSimgridEventList();
      }catch(e){
        const status = q('sgBulkStatus');
        if(status) status.textContent = `LMU update failed: ${e.message}`;
        btn.disabled = false; btn.textContent = 'Apply to selected';
      }
    });
  }

  let sgEditingEventId = null;
  let sgEditingEventImageUrl = '';
  // ✅ ADDED: true when the Add/Edit Event form above has something in it
  // worth not losing silently - either mid-edit of an existing event, or a
  // new-event draft with a title/link already typed in. Used to guard
  // against a stray click (Edit on the wrong round, etc.) wiping it out.
  function sgFormHasUnsavedWork(){
    if(sgEditingEventId) return true;
    return !!(q('sgTitle')?.value.trim() || q('sgLink')?.value.trim());
  }
  function sgResetForm(){
    sgEditingEventId = null;
    sgEditingEventImageUrl = '';
    q('sgTitle').value = ''; q('sgLink').value = ''; q('sgNotes').value = '';
    q('sgEventDate').value = ''; q('sgEventDateLabel').value = ''; q('sgPassword').value = '';
    q('sgDayOfWeek').value = ''; q('sgRaceTimeUK').value = ''; q('sgHostedBy').value = '';
    q('sgPinned').checked = false;
    q('sgDiscordRoleId').value = ''; q('sgDiscordRoleLabel').value = '';
    q('sgSeries').value = '';
    q('sgGame').value = 'acc';
    updateSgLmuTierGroupVisibility();
    q('sgLmuTierChecks')?.querySelectorAll('.sg-lmu-tier-check').forEach(cb => { cb.checked = false; });
    q('sgEventImageInput').value = '';
    q('sgEventImagePreview').innerHTML = '';
    q('sgRoundsPreview').classList.add('hidden');
    document.querySelectorAll('.sg-tier-check').forEach(el => el.checked = false);
    q('sgSaveBtn').textContent = 'Add event';
    q('sgCancelEditBtn').classList.add('hidden');
  }
  q('sgCancelEditBtn')?.addEventListener('click', () => { sgResetForm(); q('sgSaveStatus').textContent = ''; });

  q('sgSaveBtn')?.addEventListener('click', async () => {
    const title = q('sgTitle').value.trim();
    const simgridLink = q('sgLink').value.trim();
    const platform = q('sgPlatform').value;
    const series = q('sgSeries').value;
    const tiers = [...document.querySelectorAll('.sg-tier-check:checked')].map(el => el.value);
    const notes = q('sgNotes').value.trim();
    const eventDateMs = q('sgEventDate').value ? new Date(q('sgEventDate').value).getTime() : 0;
    const eventDateLabel = q('sgEventDateLabel').value.trim();
    const password = q('sgPassword').value.trim();
    const dayOfWeek = q('sgDayOfWeek').value;
    const raceTimeUK = q('sgRaceTimeUK').value.trim();
    const hostedBy = q('sgHostedBy').value.trim();
    const pinned = q('sgPinned').checked;
    const discordRoleId = q('sgDiscordRoleId').value.trim();
    const discordRoleLabel = q('sgDiscordRoleLabel').value.trim();
    // ✅ ADDED: Game + its LMU sub-licence requirement - see the field group
    // above. lmuRequiredTierIds is only meaningful (and only sent) when
    // Game=LMU; switching back to ACC on an edit clears it rather than
    // leaving a stale requirement behind on an event that no longer shows
    // under the LMU tab. An event can require ANY ONE of several
    // sub-licences (ticking more than one covers a multiclass round like
    // "Hypercar & LMP3's").
    const game = ['lmu','raceroom','acrally','rocketleague'].includes(q('sgGame').value) ? q('sgGame').value : 'acc';
    const lmuRequiredTierIds = game === 'lmu'
      ? [...(q('sgLmuTierChecks')?.querySelectorAll('.sg-lmu-tier-check:checked') || [])].map(cb => cb.value)
      : [];
    // ✅ FIXED: a SimGrid link used to be required on every save, including
    // a plain edit of an event that already exists (e.g. a round pushed
    // from League Owners Overview, which never has one until it's set here
    // or via the bulk "Set SimGrid link for selected" tool below) - staff
    // couldn't save so much as a password without fighting this first. Only
    // require it when adding a genuinely NEW event.
    if(!title || (!sgEditingEventId && !simgridLink) || !tiers.length){ q('sgSaveStatus').textContent = sgEditingEventId ? 'Title and at least one tier are required.' : 'Title, link and at least one tier are required.'; return; }
    if(discordRoleId && !/^\d{5,25}$/.test(discordRoleId)){ q('sgSaveStatus').textContent = 'Discord Role ID should be the numeric role ID (Copy Role ID in Discord), not a role name.'; return; }
    if(raceTimeUK && !/^([01]\d|2[0-3]):[0-5]\d$/.test(raceTimeUK)){ q('sgSaveStatus').textContent = 'Time should be 24h HH:MM, e.g. 20:00.'; return; }
    if(game === 'lmu' && !lmuRequiredTierIds.length){ q('sgSaveStatus').textContent = 'Pick at least one LMU sub-licence this event requires (or add one in Manage Licence Tiers first).'; return; }

    // Keep the existing image on an edit unless a new file was chosen -
    // saving other fields should never silently wipe out a set image.
    let imageUrl = sgEditingEventImageUrl;
    const imageFile = q('sgEventImageInput').files[0];
    if(imageFile){
      q('sgSaveStatus').textContent = 'Uploading image...';
      try{ imageUrl = (await window.IFWL_UploadAPI.uploadLicenceImage(imageFile, 'simgridEvent')).url; }
      catch(e){ q('sgSaveStatus').textContent = 'Image upload failed: ' + e.message; return; }
    }

    q('sgSaveStatus').textContent = sgEditingEventId ? 'Updating...' : 'Saving...';
    try{
      await window.IFWL_SimgridAPI.saveSimgridEvent({ eventId: sgEditingEventId || undefined, title, simgridLink, platform, series, tiers, notes, eventDateMs, eventDateLabel, password, dayOfWeek, raceTimeUK, hostedBy, pinned, imageUrl, discordRoleId, discordRoleLabel, game, lmuRequiredTierIds });
      const wasEditing = !!sgEditingEventId;
      sgResetForm();
      q('sgSaveStatus').textContent = wasEditing ? 'This event updated - no other events were touched.' : 'Saved.';
      await renderSimgridEventList();
      setTimeout(()=>{ if(q('sgSaveStatus')) q('sgSaveStatus').textContent=''; }, 2500);
    }catch(e){ q('sgSaveStatus').textContent = 'Could not save: ' + e.message; }
  });

  // ✅ ADDED: rounds preview - best-effort, see the backend comment above
  // fetchSimgridRounds for exactly what this relies on. Never creates or
  // changes anything by itself; clicking a detected round just prefills the
  // date fields above so staff can review/adjust before saving.
  q('sgFetchRoundsBtn')?.addEventListener('click', async () => {
    const url = q('sgLink').value.trim();
    const preview = q('sgRoundsPreview');
    if(!url){ preview.classList.remove('hidden'); preview.innerHTML = '<div class="empty">Paste a SimGrid championship link above first.</div>'; return; }
    preview.classList.remove('hidden');
    preview.innerHTML = '<div class="empty">Fetching rounds&hellip;</div>';
    try{
      const result = await window.IFWL_Api.apiPost('staffSimgridFetchRounds', { url });
      if(!result.rounds?.length){
        preview.innerHTML = `<div class="empty">${result.warning || 'No rounds found on this page.'}</div>` +
          (result.debugTextSnippet ? `<div class="field-hint" style="margin-top:10px;word-break:break-all">Fetched: ${result.debugFetchedUrl || ''}</div><textarea readonly style="width:100%;min-height:120px;margin-top:6px;font-size:11px;font-family:monospace" onclick="this.select()">${result.debugTextSnippet}</textarea>` : '');
        return;
      }

      // ✅ ADDED: real track dropdown instead of "Track unknown" free text -
      // SimGrid's own page rarely gives us a clean, matchable track name, so
      // rather than showing a dead end, staff pick the actual track from
      // the same track list Seasonal Costs already maintains. Pre-selects a
      // match if SimGrid's scraped text happens to line up with a known
      // track name, otherwise starts on "Not set".
      let trackOptions = [];
      try{ trackOptions = (await window.IFWL_SeasonalCostsAPI.fetchSeasonalCosts()).tracks || []; }catch(e){ console.warn('Could not load track list for round preview', e); }
      const matchTrackSlug = (scrapedName) => {
        const n = String(scrapedName||'').toLowerCase().trim();
        if(!n) return '';
        const hit = trackOptions.find(t => t.name.toLowerCase() === n || n.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(n));
        return hit ? hit.slug : '';
      };

      // ✅ CHANGED: per-round date and password are now inline and editable
      // right here. Also adds a "fill all" control that works whenever you
      // use it - the earlier version only pre-filled from the shared
      // Password field's value at the exact moment "Preview rounds" was
      // clicked, which meant typing a password AFTER previewing (or before
      // it was filled in) left every round blank with no way to bulk-fix it
      // short of retyping 9 times.
      // ✅ FIXED: the shared "Password" field near the top of this form (for
      // single manually-added events) and these per-round password fields
      // were two completely disconnected inputs - a password typed up top
      // never carried through here, which looked exactly like "passwords
      // just don't show up for drivers" even though nothing was actually
      // broken in the save/display pipeline. This now seeds the "fill all"
      // field (and every round) from whatever's already in the top field.
      const sharedPassword = q('sgPassword')?.value.trim() || '';
      // ✅ ADDED: Title prefix - manually-added events get IFWL's full naming
      // convention ("IFWL.NET | SEASON 3 | PC | BEGINNER SERIES | R7 | ...");
      // bulk-imported rounds were only ever getting SimGrid's bare round
      // name plus track ("Round 3 - Nurburgring"), a real gap in detail
      // between the two paths. Seeding this from the shared Title field
      // above (if staff already typed one) so it doesn't start blank.
      const sharedTitlePrefix = q('sgTitle')?.value.trim() || '';
      const buildDefaultTitle = (prefix, roundName, trackName) => {
        const parts = [prefix, roundName, trackName].map(s => String(s || '').trim()).filter(Boolean);
        return parts.join(' | ');
      };
      preview.innerHTML = (result.warning ? `<div class="field-hint" style="margin-bottom:8px">${result.warning}</div>` : '') +
        `<div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:10px">
          <div class="field-group" style="flex:1;margin-bottom:0"><label>Title prefix for all rounds below (optional)</label><input type="text" id="sgFillAllTitleInput" placeholder="e.g. IFWL.NET | SEASON 3 | PC | BEGINNER SERIES" value="${sharedTitlePrefix.replace(/"/g,'&quot;')}"></div>
          <button class="btn ghost" id="sgFillAllTitleBtn" type="button">Apply to all round titles</button>
        </div>
        <div class="field-hint" style="margin:-6px 0 14px">Rebuilds every round's title below as "prefix | round name | track" - each one stays individually editable afterwards, so a one-off rename (a re-run, "!!", etc.) doesn't get overwritten unless you click this again.</div>
        <div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--ifwl-line)">
          <div class="field-group" style="flex:1;margin-bottom:0"><label>Fill all round passwords below with:</label><input type="text" id="sgFillAllPasswordInput" placeholder="e.g. ifwl2026" value="${sharedPassword.replace(/"/g,'&quot;')}"></div>
          <button class="btn ghost" id="sgFillAllPasswordBtn" type="button">Apply to all rounds</button>
        </div>` +
        (sharedPassword ? `<div class="field-hint" style="margin:-8px 0 14px">Pre-filled from the Password field above - click "Apply to all rounds" to push it into every round below, or edit each one individually.</div>` : '') +
        result.rounds.map((r, i) => {
          const dateVal = r.dateMs ? new Date(r.dateMs).toISOString().slice(0,16) : '';
          const preselectedSlug = matchTrackSlug(r.track);
          const preselectedTrackName = trackOptions.find(t => t.slug === preselectedSlug)?.name || '';
          const defaultTitle = buildDefaultTitle(sharedTitlePrefix, r.name, preselectedTrackName);
          return `
          <div class="note-item sg-round-row">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
              <input type="checkbox" class="sg-round-check" data-round-idx="${i}" style="width:auto;margin-top:3px" ${r.ended ? '' : 'checked'}>
              <div style="flex:1">
                <strong>${r.name}</strong>
                <div class="note-meta">${r.ended ? 'Ended' : 'Upcoming'}${r.track ? ` &middot; SimGrid says: "${r.track}"` : ''}</div>
              </div>
            </label>
            <div style="padding-left:26px;margin-top:8px">
              <div class="field-group" style="margin-bottom:8px"><label style="font-size:10px">Event title (editable - same naming as a manually-added event)</label><input type="text" class="sg-round-title" data-round-idx="${i}" value="${defaultTitle.replace(/"/g,'&quot;')}"></div>
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <div class="field-group" style="flex:1;min-width:160px;margin-bottom:0"><label style="font-size:10px">Track</label>
                  <select class="sg-round-track" data-round-idx="${i}">
                    <option value="">Not set</option>
                    ${trackOptions.map(t => `<option value="${t.slug}" ${t.slug===preselectedSlug?'selected':''}>${t.name}</option>`).join('')}
                  </select>
                </div>
                <div class="field-group" style="flex:1;min-width:140px;margin-bottom:0"><label style="font-size:10px">Date/time (editable)</label><input type="datetime-local" class="sg-round-date" data-round-idx="${i}" value="${dateVal}"></div>
                <div class="field-group" style="flex:1;min-width:140px;margin-bottom:0"><label style="font-size:10px">Password for this round</label><input type="text" class="sg-round-password" data-round-idx="${i}" value="${sharedPassword.replace(/"/g,'&quot;')}"></div>
              </div>
            </div>
          </div>`;
        }).join('') +
        `<div style="margin-top:10px;display:flex;gap:10px;align-items:center">
          <button class="btn teal" id="sgBulkAddBtn" type="button">Add ticked rounds as events</button>
          <span class="field-hint">Each round uses its own title/track/date/password above. Platform/tiers/Discord role/notes/image below are shared across all of them - same detail as a manually-added event.</span>
        </div>
        <div id="sgBulkAddStatus" style="margin-top:8px"></div>`;

      q('sgFillAllPasswordBtn').addEventListener('click', () => {
        const val = q('sgFillAllPasswordInput').value;
        preview.querySelectorAll('.sg-round-password').forEach(el => { el.value = val; });
      });

      q('sgFillAllTitleBtn').addEventListener('click', () => {
        const prefix = q('sgFillAllTitleInput').value.trim();
        preview.querySelectorAll('.sg-round-title').forEach(el => {
          const idx = Number(el.dataset.roundIdx);
          const r = result.rounds[idx];
          const trackSlug = preview.querySelector(`.sg-round-track[data-round-idx="${idx}"]`).value;
          const trackName = trackOptions.find(t => t.slug === trackSlug)?.name || '';
          el.value = buildDefaultTitle(prefix, r.name, trackName);
        });
      });

      // Picking a different track updates that round's title too, as long
      // as it still starts with the same prefix - so a manual rename (e.g.
      // adding "RE RUN!!") survives, but a plain default title stays in
      // sync with the track dropdown.
      preview.querySelectorAll('.sg-round-track').forEach(sel => sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.roundIdx);
        const r = result.rounds[idx];
        const titleInput = preview.querySelector(`.sg-round-title[data-round-idx="${idx}"]`);
        const prefix = q('sgFillAllTitleInput')?.value.trim() || '';
        const oldTrackName = trackOptions.find(t => t.slug === matchTrackSlug(r.track))?.name || '';
        const stillDefault = titleInput.value === buildDefaultTitle(prefix, r.name, oldTrackName)
          || titleInput.value === buildDefaultTitle(sharedTitlePrefix, r.name, oldTrackName);
        if(!stillDefault) return;
        const newTrackName = trackOptions.find(t => t.slug === sel.value)?.name || '';
        titleInput.value = buildDefaultTitle(prefix || sharedTitlePrefix, r.name, newTrackName);
      }));

      q('sgBulkAddBtn').addEventListener('click', async () => {
        const status = q('sgBulkAddStatus');
        const checks = [...preview.querySelectorAll('.sg-round-check:checked')];
        if(!checks.length){ status.innerHTML = '<div class="empty">Tick at least one round first.</div>'; return; }

        const platform = q('sgPlatform').value;
        const series = q('sgSeries').value;
        const tiers = [...document.querySelectorAll('.sg-tier-check:checked')].map(el => el.value);
        const notes = q('sgNotes').value.trim();
        // ✅ FIXED: Discord Role ID/label were being read for the single
        // "Add event" save but silently dropped from this bulk path - bulk-
        // imported rounds never unlocked their Discord area for drivers even
        // when a role was set, with no error to say so. Same shared-field
        // treatment as platform/series/tiers/notes/image above.
        const discordRoleId = q('sgDiscordRoleId').value.trim();
        const discordRoleLabel = q('sgDiscordRoleLabel').value.trim();
        const dayOfWeek = q('sgDayOfWeek').value;
        const raceTimeUK = q('sgRaceTimeUK').value.trim();
        const hostedBy = q('sgHostedBy').value.trim();
        if(!tiers.length){ status.innerHTML = '<div class="empty">Select at least one tier below first - it applies to every round being added.</div>'; return; }
        if(discordRoleId && !/^\d{5,25}$/.test(discordRoleId)){ status.innerHTML = '<div class="empty">Discord Role ID should be the numeric role ID (Copy Role ID in Discord), not a role name.</div>'; return; }
        if(raceTimeUK && !/^([01]\d|2[0-3]):[0-5]\d$/.test(raceTimeUK)){ status.innerHTML = '<div class="empty">Time should be 24h HH:MM, e.g. 20:00.</div>'; return; }

        // One shared image (if chosen) applies to every round in this batch,
        // same as platform/series/tiers/notes above - uploaded once, reused.
        let imageUrl = '';
        const imageFile = q('sgEventImageInput').files[0];
        if(imageFile){
          status.innerHTML = '<div class="empty">Uploading shared image&hellip;</div>';
          try{ imageUrl = (await window.IFWL_UploadAPI.uploadLicenceImage(imageFile, 'simgridEvent')).url; }
          catch(e){ status.innerHTML = `<div class="empty">Image upload failed: ${e.message}</div>`; return; }
        }

        status.innerHTML = `<div class="empty">Adding 0 of ${checks.length}&hellip;</div>`;
        const created = [];
        const failed = [];
        for(let i = 0; i < checks.length; i++){
          const idx = Number(checks[i].dataset.roundIdx);
          const r = result.rounds[idx];
          // Track now comes from the staff-selected dropdown, not SimGrid's
          // own scraped text - that text is shown alongside it purely as a
          // hint, never trusted directly into the saved title.
          const trackSlug = preview.querySelector(`.sg-round-track[data-round-idx="${idx}"]`).value;
          // Title now comes from this round's own (editable) title field -
          // defaults to "prefix | round name | track" but staff can rename
          // any individual round (a re-run, added "!!", etc.) before adding.
          const title = preview.querySelector(`.sg-round-title[data-round-idx="${idx}"]`).value.trim() || r.name;
          // Reads THIS round's own inline date/password fields, not a
          // shared value - each round genuinely gets its own.
          const dateInput = preview.querySelector(`.sg-round-date[data-round-idx="${idx}"]`).value;
          const eventDateMs = dateInput ? new Date(dateInput).getTime() : 0;
          const password = preview.querySelector(`.sg-round-password[data-round-idx="${idx}"]`).value.trim();
          try{
            await window.IFWL_SimgridAPI.saveSimgridEvent({
              title, simgridLink: url, platform, series, tiers, notes, password, imageUrl,
              dayOfWeek, raceTimeUK, hostedBy,
              discordRoleId, discordRoleLabel,
              eventDateMs,
              eventDateLabel: eventDateMs ? '' : (r.dateText || title)
            });
            created.push(title);
          }catch(e){
            failed.push(`${title} (${e.message})`);
          }
          status.innerHTML = `<div class="empty">Adding ${i+1} of ${checks.length}&hellip;</div>`;
        }

        // Explicit confirmation of exactly what happened - never leaves
        // staff guessing whether all rounds actually got created.
        status.innerHTML = `
          <div class="notice-card" style="border-left-color:${failed.length ? 'var(--ifwl-red)' : 'var(--ifwl-teal)'}">
            <strong>${created.length} of ${checks.length} round(s) added.</strong>
            ${created.length ? `<ul style="margin:6px 0 0 18px">${created.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
            ${failed.length ? `<p style="color:var(--ifwl-red);margin-top:8px"><strong>Failed:</strong></p><ul style="margin:4px 0 0 18px;color:var(--ifwl-red)">${failed.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
          </div>`;
        await renderSimgridEventList();
      });
    }catch(e){
      preview.innerHTML = `<div class="empty">Could not fetch rounds: ${e.message}</div>`;
    }
  });

  // These four calls used to fire immediately as the script parsed - before
  // the Discord login flow had finished and before window.IFWL_AUTH had a
  // session token to return. That's what produced empty ?token= requests
  // and 401s even for genuine staff accounts. They now wait for the same
  // 'ifwl-auth-changed' event the rest of the page already uses, and only
  // run once staff access is actually confirmed.
  let staffPanelsInited = false;
  /* ---- Manage Calling Cards ---- */
  async function renderCallingCardList(){
    const cards = await window.IFWL_CallingCardAPI.fetchCallingCardCatalog();
    const wrap = q('ccList');
    if(!cards.length){ wrap.innerHTML = '<div class="empty">No calling cards yet.</div>'; return; }
    wrap.innerHTML = cards.map((c,i) => `
      <div class="note-item" data-idx="${i}">
        <img src="${c.url}" alt="" style="width:100%;max-width:200px;height:80px;object-fit:cover;border-radius:8px;display:block;margin-bottom:8px">
        <strong>${c.title}</strong>
        <div style="margin-top:8px"><button class="btn ghost" data-remove-card="${i}">Delete</button></div>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-remove-card]').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('Delete this calling card? Drivers who have it selected will lose it from their card.')) return;
      const idx = Number(btn.dataset.removeCard);
      const updated = cards.filter((_,i) => i !== idx);
      try{ await window.IFWL_CallingCardAPI.saveCallingCardCatalog(updated); await renderCallingCardList(); }
      catch(e){ alert('Could not delete: ' + e.message); }
    }));
  }

  q('ccUploadInput')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if(!file) return;
    const title = q('ccTitle').value.trim() || 'Calling Card';
    q('ccSaveStatus').textContent = 'Uploading...';
    try{
      const { url } = await window.IFWL_UploadAPI.uploadLicenceImage(file, 'callingcard');
      const cards = await window.IFWL_CallingCardAPI.fetchCallingCardCatalog();
      cards.push({ id: 'cc_' + Date.now(), title, url });
      await window.IFWL_CallingCardAPI.saveCallingCardCatalog(cards);
      q('ccTitle').value = '';
      e.target.value = '';
      q('ccSaveStatus').textContent = 'Added.';
      await renderCallingCardList();
      setTimeout(()=>{ if(q('ccSaveStatus')) q('ccSaveStatus').textContent=''; }, 2000);
    }catch(err){ q('ccSaveStatus').textContent = err.message; }
  });

  /* ---- Manage Game Liveries (ACC / LMU / ETS2) ---- */
  const PAL_TIER_LABEL = { all: 'All members (free)', bronze: 'Bronze Patreon+', silver: 'Silver Patreon+', gold: 'Gold Patreon only' };
  async function renderPatreonLiveryManageList(game, listElId){
    const wrap = q(listElId);
    if(!wrap) return;
    let liveries;
    try{ liveries = (await window.IFWL_PatreonLiveryAPI.fetchPatreonLiveries(game)).liveries || []; }
    catch(e){ wrap.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }
    if(!liveries.length){ wrap.innerHTML = '<div class="empty">No liveries uploaded yet.</div>'; return; }
    wrap.innerHTML = liveries.map(l => {
      const sizeLabel = l.sizeBytes ? `${(l.sizeBytes/1024/1024).toFixed(1)}MB` : '';
      const thumb = l.previewUrl ? `<img src="${l.previewUrl}" alt="" style="width:100%;height:110px;object-fit:cover;border-radius:8px;display:block;margin-bottom:8px">` : '';
      return `
      <div class="note-item" data-id="${l.id}">
        ${thumb}
        <strong>${l.car}</strong>
        <div class="field-hint" style="margin-top:4px">${[l.fileName, sizeLabel].filter(Boolean).join(' &middot; ')}</div>
        <div class="field-hint" style="margin-top:2px">${PAL_TIER_LABEL[l.gateTier] || l.gateTier}</div>
        <div style="margin-top:8px"><button class="btn ghost" data-pal-delete="${l.id}">Delete</button></div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('[data-pal-delete]').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('Delete this livery? This removes the uploaded file too.')) return;
      try{ await window.IFWL_PatreonLiveryAPI.deletePatreonLivery(btn.dataset.palDelete); await renderPatreonLiveryManageList(game, listElId); }
      catch(e){ alert('Could not delete: ' + e.message); }
    }));
  }

  // ✅ CHANGED: was ACC-only (hardcoded ids/game); now takes the game and
  // its panel's element-id suffix so ACC/LMU/ETS2 share one implementation.
  function initPatreonLiveryUploadForm(game, idSuffix){
    const ids = {
      car: 'palCarInput' + idSuffix, file: 'palFileInput' + idSuffix, preview: 'palPreviewInput' + idSuffix,
      notes: 'palNotesInput' + idSuffix, gate: 'palGateSelect' + idSuffix, uploadBtn: 'palUploadBtn' + idSuffix,
      status: 'palUploadStatus' + idSuffix, list: 'palList' + idSuffix
    };
    q(ids.uploadBtn)?.addEventListener('click', async () => {
      const carInput = q(ids.car), fileInput = q(ids.file), previewInput = q(ids.preview), notesInput = q(ids.notes), gateSelect = q(ids.gate);
      const car = carInput.value.trim();
      const file = fileInput.files[0];
      const previewFile = previewInput.files[0];
      const notes = notesInput.value.trim();
      const gateTier = gateSelect.value;
      const status = q(ids.status);
      if(!car){ alert('Enter which car this livery is for.'); return; }
      if(!file){ alert('Choose a .zip file to upload.'); return; }
      try{
        status.textContent = 'Uploading...';
        const uploaded = await window.IFWL_UploadAPI.uploadPatreonLiveryZip(file, game);
        let previewUrl = '', previewPath = '';
        if(previewFile){
          status.textContent = 'Uploading preview image...';
          try{
            const uploadedPreview = await window.IFWL_UploadAPI.uploadLicenceImage(previewFile, 'patreonLiveryPreview', { game });
            previewUrl = uploadedPreview.url || '';
            previewPath = uploadedPreview.path || '';
          }catch(previewErr){
            alert('The livery uploaded, but the preview image failed: ' + previewErr.message);
          }
        }
        status.textContent = 'Saving...';
        await window.IFWL_PatreonLiveryAPI.savePatreonLivery({ game, car, fileName: uploaded.fileName || file.name, url: uploaded.url, path: uploaded.path, previewUrl, previewPath, sizeBytes: uploaded.sizeBytes || file.size, notes, gateTier });
        carInput.value = ''; fileInput.value = ''; previewInput.value = ''; notesInput.value = ''; gateSelect.value = 'all';
        status.textContent = 'Added.';
        await renderPatreonLiveryManageList(game, ids.list);
        setTimeout(()=>{ if(q(ids.status)) q(ids.status).textContent=''; }, 2000);
      }catch(err){
        status.textContent = '';
        alert('Could not upload: ' + err.message);
      }
    });
  }
  initPatreonLiveryUploadForm('acc', '');
  initPatreonLiveryUploadForm('lmu', 'Lmu');
  initPatreonLiveryUploadForm('ets2', 'Ets2');

  /* ---- Licence Qualification ---- */
  // Cached per-platform (not shared) so the PC and Console panels' delegated
  // click listeners never read stale or cross-contaminated data from each other.
  const qualCache = { PC: { standings: [], profiles: [] }, Console: { standings: [], profiles: [] } };

  async function renderLicenceQualPanel(platform, serverId, force){
    const bodyId = platform === 'Console' ? 'licenceQualBodyConsole' : 'licenceQualBody';
    const body = q(bodyId);
    if(!body) return;

    let standings;
    try{
      standings = await window.IFWLStats.computeLicenceServerStandings({ minLaps: 15, serverId, force: !!force, classStructure: await window.classStructureForServer(serverId) , qualWindow: await window.fetchQualWindowMs()});
      qualCache[platform].standings = standings;
    }catch(e){
      body.innerHTML = `<tr><td colspan="6" class="empty">Could not load standings: ${e.message}</td></tr>`;
      return;
    }
    if(!standings.length){
      body.innerHTML = `<tr><td colspan="6" class="empty">No sessions recorded on the IFWL ${platform} Licence server yet.</td></tr>`;
      return;
    }

    // Match each ranked ACC name back to an actual licence profile via
    // accDriverNames, the same self-reported link every other feature on
    // this page uses. A driver who hasn't linked their ACC name yet will
    // still show in the ranking, just without an Assign control.
    const profiles = await staffSearch('');
    qualCache[platform].profiles = profiles;
    const byAccName = new Map();
    profiles.forEach(p => (p.accDriverNames || []).forEach(n => byAccName.set(window.IFWLStats.driverNameKey(n), p)));

    const tiers = await window.IFWL_TierAPI.fetchTierList();
    const sortedTiers = mainLadderTiers(tiers).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    const tierOptions = sortedTiers.map(t => `<option value="${t.name}">${t.name}</option>`).join('');

    body.innerHTML = standings.map((s, i) => {
      const profile = byAccName.get(window.IFWLStats.driverNameKey(s.driver));
      const qualifiedBadge = s.qualified
        ? `<span class="request-status-pill approved">Qualified</span>`
        : `<span class="request-status-pill pending">${s.totalLaps}/15</span>`;
      const assignCell = !profile
        ? `<div class="unlink-link-box" data-idx="${i}">
             <input type="text" class="unlink-search" data-platform="${platform}" data-idx="${i}" placeholder="Search driver to link this exact name...">
             <div class="unlink-results" id="unlinkResults${platform}${i}"></div>
           </div>`
        : `<select id="qualTierSelect${platform}${i}">${(() => { const rn = resolveNewTierMeta(tiers, s.recommendedTier).name; return sortedTiers.some(t => t.name === rn) ? tierOptions.replace(`value="${rn}"`, `value="${rn}" selected`) : '<option value="" selected disabled>Choose tier...</option>' + tierOptions; })()}</select>
           <button class="btn teal" style="margin-top:6px" data-assign="${i}" data-platform="${platform}" data-driver="${profile.discordId}">Assign</button>`;
      const sessionsBtn = `<button class="btn-view-sessions" data-view-sessions="${platform}${i}" data-driver-label="${s.driver}" data-acc-names="${(profile?.accDriverNames || [s.driver]).join('|')}">View Sessions</button>`;
      return `<tr>
        <td><div>${s.driver}${profile ? '' : ' <span class="field-hint">(unlinked)</span>'}</div>${profile ? `<div class="field-hint">Licence: ${profile.name} (${profile.licenceNumber})</div>` : ''}</td>
        <td>${qualifiedBadge}</td>
        <td class="mono">${s.avgGapPct != null ? '+' + s.avgGapPct + '%' : '-'}</td>
        <td class="mono">${s.consistencyAvg != null ? s.consistencyAvg + '%' : '-'}</td>
        <td><span class="tier-pill" style="background:transparent;border:none;padding:0">${s.recommendedTier}</span></td>
        <td>${assignCell}${sessionsBtn}</td>
      </tr>`;
    }).join('');

    // Search-to-link for unlinked rows: staff pick the actual driver, and the
    // EXACT ranked string (s.driver) gets appended - never retyped, so this
    // is the fix for the "typed name doesn't quite match the in-game name"
    // class of problem, not just a workaround for it.
    body.querySelectorAll('.unlink-search').forEach(input => {
      input.addEventListener('input', () => {
        const i = Number(input.dataset.idx);
        const term = input.value.trim().toLowerCase();
        const resultsBox = q(`unlinkResults${platform}${i}`);
        if(!term){ resultsBox.innerHTML = ''; return; }
        const matches = profiles.filter(p => (p.name||'').toLowerCase().includes(term) || (p.licenceNumber||'').toLowerCase().includes(term)).slice(0, 8);
        if(!matches.length){ resultsBox.innerHTML = '<div class="empty">No matches.</div>'; return; }
        resultsBox.innerHTML = matches.map(p => `<div class="note-item" style="cursor:pointer" data-link-idx="${i}" data-link-driver="${p.discordId}">${p.name} <span class="note-meta">(${p.licenceNumber})</span></div>`).join('');
      });
    });

    if(!body.dataset.clickBound){
      body.dataset.clickBound = '1';
      body.addEventListener('click', async (e) => {
        const linkTarget = e.target.closest('[data-link-driver]');
        if(linkTarget){
          const i = Number(linkTarget.dataset.linkIdx);
          const driverId = linkTarget.dataset.linkDriver;
          const s = qualCache[platform].standings[i];
          const profile = qualCache[platform].profiles.find(p => p.discordId === driverId);
          linkTarget.textContent = 'Linking...';
          try{
            const existing = profile?.accDriverNames || [];
            const merged = existing.some(n => n.toLowerCase() === s.driver.toLowerCase()) ? existing : [...existing, s.driver];
            await staffSaveProfile(driverId, { accDriverNames: merged });
            await renderLicenceQualPanel(platform, serverId, true);
          }catch(err){ alert('Could not link: ' + err.message); }
          return;
        }
        const assignBtn = e.target.closest('[data-assign]');
        if(assignBtn){
          const i = assignBtn.dataset.assign;
          const driverId = assignBtn.dataset.driver;
          const chosenTier = q(`qualTierSelect${platform}${i}`).value;
          if(!chosenTier){ alert('Choose a tier for this driver first.'); return; }
          const s = qualCache[platform].standings[Number(i)];
          const reason = `Qualified via IFWL ${platform} Licence server: ${s.totalLaps} laps, gap +${s.avgGapPct ?? '?'}%`;
          assignBtn.disabled = true; assignBtn.textContent = 'Assigning...';
          try{
            await staffSaveProfile(driverId, { tier: chosenTier, reason });
            assignBtn.textContent = 'Assigned';
          }catch(err){ alert('Could not assign: ' + err.message); assignBtn.disabled = false; assignBtn.textContent = 'Assign'; }
          return;
        }
        const sessionsBtn = e.target.closest('[data-view-sessions]');
        if(sessionsBtn){
          await renderSessionDrilldown(platform, serverId, sessionsBtn.dataset.driverLabel, sessionsBtn.dataset.accNames.split('|'));
        }
      });
    }
  }

  // ✅ ADDED: session-by-session drill-down for staff sandbagging checks -
  // shared by both the flat table and Populate the Grid, since it's keyed
  // purely by platform/server + a set of ACC names, not by which view called it.
  async function renderSessionDrilldown(platform, serverId, driverLabel, accNames){
    const panel = q(platform === 'Console' ? 'sessionDrilldownConsole' : 'sessionDrilldownPC');
    if(!panel) return;
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="empty">Loading session history&hellip;</div>';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    let sessions;
    try{
      sessions = await window.IFWLStats.getDriverSessionHistory(serverId, accNames);
    }catch(e){
      panel.innerHTML = `<div class="empty">Could not load session history: ${e.message}</div>`;
      return;
    }
    if(!sessions.length){
      panel.innerHTML = `<h4>${driverLabel}</h4><div class="empty">No individual sessions found on the IFWL ${platform} Licence server for this name.</div>`;
      return;
    }

    // ✅ ADDED: Pro/Am/Beginner reference lines so staff (and the driver, if
    // this is ever surfaced to them) can see field strength on the chart,
    // not just this one driver's own trend. Best-effort - if it fails, the
    // chart still renders without the reference lines.
    let tierAverages = {};
    try{
      tierAverages = await window.IFWLStats.computeTierLapAverages(serverId);
    }catch(e){
      console.warn('Could not load tier lap averages', e.message);
    }

    // ✅ ADDED: car catalog for the Car column - best-effort, table still
    // renders (minus car names/images) if BOP TRACKer data can't be reached.
    let carCatalog = [];
    try{ carCatalog = (await window.IFWL_BopAPI.fetchBopTrackerData()).carCatalog || []; }
    catch(e){ console.warn('Could not load car catalog for session table', e.message); }
    const platformKey = platform === 'Console' ? 'console' : 'pc';

    panel.innerHTML = `
      <h4>${driverLabel} &mdash; every session on the IFWL ${platform} Licence server</h4>
      <p class="sd-sub">${sessions.length} session(s) &middot; dashed white lines mark where one session ends and the next begins &middot; dotted colour lines show tier field averages &middot; hover a dot for that lap's exact time</p>
      ${window.IFWLStats.buildDriverSessionChartHtml(sessions, tierAverages)}
      ${window.buildSessionStatsTableHtml(sessions, carCatalog, platformKey)}
    `;
  }

  /* ---- New Qualifiers ---- */
  // ✅ ADDED: one place where every newly-qualified driver lands, PC and
  // Console side by side - no more re-populating the whole grid to catch
  // them. Everything is measured against the LOCKED (paused) field when a
  // lock exists (see licenceGridLock* in rtgate.js and lockedField in
  // ifwl-stats-engine.js): drivers already issued a licence never move, the
  // pace gap uses the frozen reference laps, and their seats count against
  // the Pro/Amateur caps. Owner / Ops Manager only (server-enforced).
  const NQ = {
    PC:      { serverId: 'pc-licence',      rows: [], lock: null, busy: false, cs: null },
    Console: { serverId: 'console-licence', rows: [], lock: null, busy: false, cs: null }
  };
  let nqLoaded = false;
  const nqEsc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nqSleep = ms => new Promise(r => setTimeout(r, ms));
  const nqWords = name => String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  // ladder tier name -> the engine's class label (whole-word match, so "pro"
  // never matches "Provisional"); null = not a graded class (No Licence, Provisional...)
  function nqClassOfTier(name){
    const w = nqWords(name);
    if(w.includes('pro')) return 'GT3 Pro';
    if(w.includes('amateur')) return 'GT3 Amateur';
    if(w.includes('beginner')) return 'GT3 Beginner';
    if(w.includes('rookie')) return 'Rookie Class';
    return null;
  }
  // "Not placed yet" = still on the starting tier (No Licence / Provisional / lowest rung)
  function nqIsBaselineTier(name, tiers){
    const n = String(name || '').trim();
    if(!n) return true;
    if(/^no licence$/i.test(n) || nqWords(n).includes('provisional')) return true;
    const main = mainLadderTiers(tiers || []).slice().sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    return !!main.length && main[0].name === n;
  }
  function nqLockedField(lock){
    if(!lock) return null;
    const bestByTrack = {};
    (lock.bestByTrack || []).forEach(t => { bestByTrack[t.track] = t.ms; });
    return { bestByTrack, drivers: (lock.drivers || []).map(d => ({ k: d.k, cls: d.cls })) };
  }
  async function nqFetchLocks(){
    const d = await window.IFWL_Api.apiGet('licenceGridLockGet');
    NQ.PC.lock = d.PC || null;
    NQ.Console.lock = d.Console || null;
  }
  function nqNowLocalInput(){
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  function nqUpdateNavCount(){
    const n = NQ.PC.rows.length + NQ.Console.rows.length;
    document.querySelectorAll('[data-view="staffNewQualifiers"]').forEach(b => {
      if(b.tagName === 'BUTTON') b.textContent = n ? `New Qualifiers (${n})` : 'New Qualifiers';
    });
  }

  async function nqRender(platform, force){
    const st = NQ[platform];
    const col = q(platform === 'Console' ? 'nqColConsole' : 'nqColPC');
    if(!col) return;
    col.innerHTML = `<div class="nq-col-head"><h4>${platform}</h4></div><div class="empty" style="padding:16px">Loading ${platform} qualifiers&hellip;</div>`;
    let standings, profiles, tiers, cs, qw;
    try{
      [cs, qw, profiles, tiers] = await Promise.all([
        window.classStructureForServer(st.serverId), window.fetchQualWindowMs(), staffSearch(''), window.IFWL_TierAPI.fetchTierList()
      ]);
      standings = await window.IFWLStats.computeLicenceServerStandings({
        minLaps: 15, serverId: st.serverId, force: !!force, classStructure: cs, qualWindow: qw, lockedField: nqLockedField(st.lock)
      });
    }catch(e){
      col.innerHTML = `<div class="nq-col-head"><h4>${platform}</h4></div><div class="empty" style="padding:16px">Could not load: ${nqEsc(e.message)}</div>`;
      return;
    }
    st.cs = cs; st.tiers = tiers; st.profiles = profiles;

    const byAcc = new Map();
    profiles.forEach(p => (p.accDriverNames || []).forEach(n => byAcc.set(window.IFWLStats.driverNameKey(n), p)));
    const sortedTiers = mainLadderTiers(tiers).slice().sort((a,b) => (a.order ?? 0) - (b.order ?? 0));

    // newcomers = qualified, not in the locked field, and not already placed
    // on a real tier (linked profile still on the starting tier, or unlinked)
    const newcomers = standings
      .filter(s => s.qualified && !s.locked)
      .map(s => ({ s, profile: byAcc.get(s.key) || null }))
      .filter(r => !r.profile || nqIsBaselineTier(r.profile.tier, tiers))
      .sort((a, b) => (a.s.avgGapPct ?? 999) - (b.s.avgGapPct ?? 999));

    // where each one placed overall: frozen-field gaps + the other newcomers
    const lock0 = st.lock;
    const lockedGaps = (st.lock?.drivers || []).map(d => d.gap).filter(g => Number.isFinite(g));
    // locked: frozen gaps of the paused field + newcomers. Not locked: every
    // qualified driver on the live standings (so "P3 of 120" means overall).
    const allGaps = lock0
      ? lockedGaps.concat(newcomers.map(r => r.s.avgGapPct).filter(g => Number.isFinite(g)))
      : standings.filter(x => x.qualified).map(x => x.avgGapPct).filter(g => Number.isFinite(g));
    newcomers.forEach((r, i) => {
      const g = r.s.avgGapPct;
      r.rank = Number.isFinite(g) ? 1 + allGaps.filter(x => x < g).length : null;
      r.total = allGaps.length;
      r.newcomerPos = i + 1;
      r.recName = resolveNewTierMeta(tiers, r.s.recommendedTier).name;
    });
    st.rows = newcomers;

    // ---- header / lock bar
    const lock = st.lock;
    let lockBar;
    if(lock){
      const cnt = c => (lock.drivers || []).filter(d => d.cls === c).length;
      const seat = (c, max) => `${cnt(c)}${max != null ? '/' + max : ''}`;
      lockBar = `<div class="nq-lockbar locked">🔒 <b>Field locked</b> as of ${new Date(lock.cutoffMs).toLocaleString()} (by ${nqEsc(lock.frozenByName || 'staff')}) &middot; ${(lock.drivers || []).length} drivers paused &middot; Pro ${seat('GT3 Pro', cs.proMax)} &middot; Amateur ${seat('GT3 Amateur', cs.amMax)} &middot; Beginner ${cnt('GT3 Beginner')}
        ${window.IFWL_OWNER ? ' <button class="btn ghost" data-nq-act="unlock" type="button" style="padding:4px 10px;font-size:11px">Remove lock (owner)</button>' : ''}</div>`;
    } else {
      lockBar = `<div class="nq-lockbar open">⚠️ <b>Field not locked</b> &mdash; recommendations still move with the live field. Lock everyone already issued a licence as of:<br>
        <input type="datetime-local" id="nqCut${platform}" value="${nqNowLocalInput()}"><button class="btn purple" data-nq-act="lock" type="button" style="padding:6px 12px;font-size:12px">🔒 Lock the field</button></div>`;
    }
    const bulkTierOpts = '<option value="">Set selected to&hellip;</option>' + sortedTiers.map(t => `<option value="${nqEsc(t.name)}">${nqEsc(t.name)}</option>`).join('');
    const toolbar = newcomers.length ? `<div class="nq-toolbar">
        <label style="display:flex;gap:6px;align-items:center;font-size:12px;font-weight:700"><input type="checkbox" data-nq-act="all"> Select all</label>
        <select data-nq-bulk-tier>${bulkTierOpts}</select><button class="btn ghost" data-nq-act="set-sel" type="button" style="padding:6px 10px;font-size:12px">Set</button>
        <button class="btn teal" data-nq-act="assign-sel" type="button" style="padding:6px 12px;font-size:12px">Assign selected</button>
        <button class="btn ghost" data-nq-act="dismiss-sel" type="button" style="padding:6px 10px;font-size:12px" title="Mark as handled without changing their tier (needs the field locked)">Dismiss selected</button>
      </div>` : '';

    const fmtGap = g => g != null ? (g > 0 ? '+' : '') + g + '%' : '-';
    const rowsHtml = newcomers.length ? newcomers.map((r, i) => {
      const s = r.s, p = r.profile;
      const hasRec = sortedTiers.some(t => t.name === r.recName);
      const opts = (hasRec ? '' : '<option value="" selected disabled>Choose tier...</option>') + sortedTiers.map(t => `<option value="${nqEsc(t.name)}"${hasRec && t.name === r.recName ? ' selected' : ''}>${nqEsc(t.name)}</option>`).join('');
      const bumped = s.capBumpedFrom ? ` <span class="field-hint">(was ${nqEsc(s.capBumpedFrom)} by pace &mdash; seats full)</span>` : '';
      const snippet = `<div class="nq-snip"><span>${s.totalLaps} laps</span><span>Gap ${fmtGap(s.avgGapPct)}</span><span>Cons ${s.consistencyAvg != null ? s.consistencyAvg + '%' : '-'}</span><span>Risk ${s.riskAvg != null ? s.riskAvg + '%' : '-'}</span>${s.bestLapMs ? `<span>Best ${window.IFWLStats.msTime ? window.IFWLStats.msTime(s.bestLapMs) : s.bestLapMs}</span>` : ''}</div>`;
      const placed = r.rank ? `<span class="nq-place">P${r.rank} of ${r.total}</span> <span class="field-hint">#${r.newcomerPos} of ${newcomers.length} new</span>` : '';
      const ctl = !p
        ? `<div class="nq-ctl" style="display:block"><input type="text" class="nq-link-search" data-idx="${i}" placeholder="Search driver to link this exact name..." style="width:100%"><div class="unlink-results" id="nqLink${platform}${i}"></div></div>`
        : `<div class="nq-ctl"><select id="nqSel${platform}${i}">${opts}</select><button class="btn teal" data-nq-act="row-assign" data-idx="${i}" type="button" style="padding:8px 14px">Assign</button></div>`;
      return `<div class="nq-row">
        <div>${p ? `<input type="checkbox" class="nq-chk" data-idx="${i}">` : ''}</div>
        <div class="nq-main">
          <div><strong>${nqEsc(s.driver)}</strong>${p ? '' : ' <span class="field-hint">(unlinked)</span>'} ${placed}</div>
          ${p ? `<div class="field-hint">Licence: ${nqEsc(p.name)} (${nqEsc(p.licenceNumber)}) &middot; currently ${nqEsc(p.tier || 'No Licence')}${p.platform ? '' : ' &middot; <em>no platform set</em>'}</div>` : ''}
          ${snippet}
          <div style="margin-top:4px;font-size:12px">Recommended: <strong>${nqEsc(hasRec ? r.recName : s.recommendedTier)}</strong>${bumped}</div>
        </div>
        ${ctl}
      </div>`;
    }).join('') : `<div class="empty" style="padding:16px">${lock ? 'No new qualifiers waiting &mdash; everyone who has hit 15 laps is placed.' : 'Nobody qualified is waiting to be placed.'}</div>`;

    col.innerHTML = `<div class="nq-col-head"><h4>${platform}</h4><span class="badge purple">${newcomers.length} waiting</span></div>
      ${lockBar}${toolbar}<div class="nq-status" id="nqStatus${platform}"></div>${rowsHtml}`;
    nqUpdateNavCount();
    nqBind(col, platform);
  }

  function nqBind(col, platform){
    if(col.dataset.nqBound) return;
    col.dataset.nqBound = '1';
    col.addEventListener('change', e => {
      if(e.target.matches('[data-nq-act="all"]')) col.querySelectorAll('.nq-chk').forEach(c => { c.checked = e.target.checked; });
    });
    col.addEventListener('input', e => {
      const input = e.target.closest('.nq-link-search');
      if(!input) return;
      const i = Number(input.dataset.idx), term = input.value.trim().toLowerCase();
      const box = q(`nqLink${platform}${i}`);
      if(!term){ box.innerHTML = ''; return; }
      const matches = (NQ[platform].profiles || []).filter(p => (p.name||'').toLowerCase().includes(term) || (p.licenceNumber||'').toLowerCase().includes(term)).slice(0, 8);
      box.innerHTML = matches.length
        ? matches.map(p => `<div class="note-item" style="cursor:pointer" data-nq-link="${i}" data-driver="${nqEsc(p.discordId)}">${nqEsc(p.name)} <span class="note-meta">(${nqEsc(p.licenceNumber)})</span></div>`).join('')
        : '<div class="empty">No matches.</div>';
    });
    col.addEventListener('click', async e => {
      const link = e.target.closest('[data-nq-link]');
      if(link){
        const row = NQ[platform].rows[Number(link.dataset.nqLink)];
        const prof = NQ[platform].profiles.find(p => p.discordId === link.dataset.driver);
        if(!row || !prof) return;
        link.textContent = 'Linking...';
        try{
          const existing = prof.accDriverNames || [];
          const merged = existing.some(n => n.toLowerCase() === row.s.driver.toLowerCase()) ? existing : [...existing, row.s.driver];
          await staffSaveProfile(prof.discordId, { accDriverNames: merged });
          await nqRender(platform, false);
        }catch(err){ alert('Could not link: ' + err.message); }
        return;
      }
      const btn = e.target.closest('[data-nq-act]');
      if(!btn || btn.tagName === 'INPUT') return;
      const act = btn.dataset.nqAct;
      const checked = () => [...col.querySelectorAll('.nq-chk:checked')].map(c => Number(c.dataset.idx));
      if(act === 'row-assign') return nqAssign(platform, [Number(btn.dataset.idx)], false);
      if(act === 'assign-sel') return nqAssign(platform, checked(), true);
      if(act === 'dismiss-sel') return nqDismiss(platform, checked());
      if(act === 'set-sel'){
        const tier = col.querySelector('[data-nq-bulk-tier]').value;
        if(!tier) return alert('Pick a tier in the box first.');
        checked().forEach(i => { const sel = q(`nqSel${platform}${i}`); if(sel) sel.value = tier; });
        return;
      }
      if(act === 'lock') return nqLockField(platform);
      if(act === 'unlock') return nqUnlock(platform);
    });
  }

  async function nqAssign(platform, idxs, confirmFirst){
    const st = NQ[platform];
    if(st.busy) return;
    if(!idxs.length) return alert('Tick at least one driver first.');
    const jobs = idxs.map(i => ({ i, row: st.rows[i], tier: (q(`nqSel${platform}${i}`) || {}).value || '' })).filter(j => j.row && j.row.profile);
    const missing = jobs.filter(j => !j.tier);
    if(missing.length) return alert(`${missing.length} selected driver(s) have no tier chosen yet (${missing.map(j => j.row.s.driver).slice(0,4).join(', ')}${missing.length > 4 ? '...' : ''}). Pick a tier for them first.`);
    if(confirmFirst){
      const byTier = {}; jobs.forEach(j => { byTier[j.tier] = (byTier[j.tier] || 0) + 1; });
      const summary = Object.entries(byTier).map(([t, n]) => `${n} x ${t}`).join('\n');
      if(!confirm(`Assign ${jobs.length} ${platform} driver(s)?\n\n${summary}\n\nTier roles and the licence bot upgrade posts go out as normal.`)) return;
    }
    st.busy = true;
    const status = q(`nqStatus${platform}`);
    const placed = [], failed = [];
    for(let n = 0; n < jobs.length; n++){
      const { row, tier } = jobs[n], s = row.s, p = row.profile;
      if(status) status.textContent = `Assigning ${n + 1} of ${jobs.length}: ${s.driver}...`;
      const reason = `New qualifier via IFWL ${platform} Licence server: ${s.totalLaps} laps, gap ${s.avgGapPct != null ? (s.avgGapPct > 0 ? '+' : '') + s.avgGapPct + '%' : '?'}${row.rank ? `, placed P${row.rank}/${row.total}` : ''}${tier !== row.recName ? ` (staff changed from recommended ${row.recName})` : ''}`;
      const patch = { tier, reason };
      if(!p.platform) patch.platform = platform === 'Console' ? 'console' : 'pc';
      try{
        await staffSaveProfile(p.discordId, patch);
        placed.push({ k: s.key, name: s.driver, discordId: p.discordId, tier, cls: nqClassOfTier(tier), gap: s.avgGapPct, laps: s.totalLaps, atMs: Date.now() });
      }catch(err){ failed.push(`${s.driver}: ${err.message}`); }
      if(n < jobs.length - 1) await nqSleep(450); // gentle on Discord's role + webhook rate limits
    }
    let lockNote = '';
    if(placed.length && st.lock){
      try{
        await window.IFWL_Api.apiPost('licenceGridLockAdd', { platform, drivers: placed });
        placed.forEach(d => st.lock.drivers.push(d));
      }catch(err){ lockNote = ` (assigned, but couldn't add them to the locked field: ${err.message} - they may reappear; re-assigning is harmless)`; }
    }
    st.busy = false;
    await nqRender(platform, false);
    const s2 = q(`nqStatus${platform}`);
    if(s2) s2.textContent = `Assigned ${placed.length} of ${jobs.length}.${failed.length ? ' Failed: ' + failed.join('; ') : ''}${lockNote}`;
  }

  async function nqDismiss(platform, idxs){
    const st = NQ[platform];
    if(!st.lock) return alert('Lock the field first - dismissing records the driver in the locked field.');
    if(!idxs.length) return alert('Tick at least one driver first.');
    if(!confirm(`Dismiss ${idxs.length} driver(s)? Their tier is NOT changed - they just stop showing here.`)) return;
    const drivers = idxs.map(i => st.rows[i]).filter(Boolean).map(r => ({ k: r.s.key, name: r.s.driver, discordId: r.profile?.discordId || '', tier: r.profile?.tier || '', cls: null, gap: r.s.avgGapPct, laps: r.s.totalLaps, atMs: Date.now() }));
    try{
      await window.IFWL_Api.apiPost('licenceGridLockAdd', { platform, drivers });
      drivers.forEach(d => st.lock.drivers.push(d));
      await nqRender(platform, false);
    }catch(err){ alert('Could not dismiss: ' + err.message); }
  }

  async function nqLockField(platform){
    const st = NQ[platform];
    const input = q(`nqCut${platform}`);
    const cutoffMs = input && input.value ? new Date(input.value).getTime() : Date.now();
    if(!Number.isFinite(cutoffMs)) return alert('Pick a valid date and time.');
    const status = q(`nqStatus${platform}`);
    if(status) status.textContent = 'Working out the field as of that moment...';
    try{
      const [cs, qw, profiles, tiers] = await Promise.all([
        window.classStructureForServer(st.serverId), window.fetchQualWindowMs(), staffSearch(''), window.IFWL_TierAPI.fetchTierList()
      ]);
      // the engine only applies a window when startMs is truthy, so floor it at 1
      const qualWindow = { startMs: qw.startMs || 1, endMs: Math.min(cutoffMs, qw.endMs || cutoffMs) };
      const standings = await window.IFWLStats.computeLicenceServerStandings({ minLaps: 15, serverId: st.serverId, classStructure: cs, qualWindow });
      const bestObj = await window.IFWLStats.computeServerBestByTrack(st.serverId, { qualWindow });
      const byAcc = new Map();
      profiles.forEach(p => (p.accDriverNames || []).forEach(n => byAcc.set(window.IFWLStats.driverNameKey(n), p)));
      const drivers = [];
      let left = 0;
      standings.filter(s => s.qualified).forEach(s => {
        const p = byAcc.get(s.key);
        if(p && !nqIsBaselineTier(p.tier, tiers)){
          drivers.push({ k: s.key, name: s.driver, discordId: p.discordId, tier: p.tier, cls: nqClassOfTier(p.tier), gap: s.avgGapPct, laps: s.totalLaps, atMs: Date.now() });
        } else left++;
      });
      const cnt = c => drivers.filter(d => d.cls === c).length;
      const msg = `Lock the ${platform} field as of ${new Date(cutoffMs).toLocaleString()}?\n\n`
        + `${drivers.length} drivers already placed will be paused as they are:\n  Pro ${cnt('GT3 Pro')} · Amateur ${cnt('GT3 Amateur')} · Beginner ${cnt('GT3 Beginner')} · Rookie ${cnt('Rookie Class')}\n`
        + `${left} qualified-but-unplaced driver(s) stay in the New Qualifiers list.\n\n`
        + `Reference laps frozen on ${Object.keys(bestObj).length} track(s). Newcomers are measured against these from now on.`;
      if(!drivers.length && !confirm('Nobody qualified-and-placed was found as of that time. Lock anyway (empty field)?')) { if(status) status.textContent = ''; return; }
      if(drivers.length && !confirm(msg)){ if(status) status.textContent = ''; return; }
      await window.IFWL_Api.apiPost('licenceGridLockSave', {
        platform, cutoffMs, drivers,
        bestByTrack: Object.entries(bestObj).map(([track, ms]) => ({ track, ms }))
      });
      await nqFetchLocks();
      await nqRender(platform, false);
    }catch(err){
      if(status) status.textContent = '';
      alert('Could not lock the field: ' + err.message);
    }
  }

  async function nqUnlock(platform){
    if(!confirm(`Remove the ${platform} field lock? Recommendations go back to moving with the live field, and the paused drivers are no longer protected. (Their licences themselves are not changed.)`)) return;
    try{
      await window.IFWL_Api.apiPost('licenceGridLockClear', { platform });
      await nqFetchLocks();
      await nqRender(platform, false);
    }catch(err){ alert('Could not remove the lock: ' + err.message); }
  }

  async function nqLoadAll(force){
    try{ await nqFetchLocks(); }
    catch(e){
      ['nqColPC', 'nqColConsole'].forEach(id => { const el = q(id); if(el) el.innerHTML = `<div class="empty" style="padding:16px">Could not load: ${nqEsc(e.message)}</div>`; });
      return;
    }
    // PC first (honours force), Console second reuses the freshly-built cache
    await nqRender('PC', !!force);
    await nqRender('Console', false);
  }
  async function nqOpen(){ if(nqLoaded) return; nqLoaded = true; await nqLoadAll(false); }
  function initNewQualifiers(){
    document.querySelectorAll('#viewTabs [data-view="staffNewQualifiers"]').forEach(b => b.addEventListener('click', nqOpen));
    q('nqRefreshBtn')?.addEventListener('click', () => { nqLoaded = true; nqLoadAll(true); });
  }

  /* ---- Populate the Grid ---- */
  // Groups the same standings data by recommended tier, with a strength-of-
  // field summary per group, so staff can see the whole picture at a glance
  // before assigning - rather than scrolling one long sorted list.
  const TIER_GRID_ORDER = ['Rookie Class', 'GT3 Beginner', 'GT3 Amateur', 'GT3 Pro'];
  const qualGridCache = { PC: { profiles: [] }, Console: { profiles: [] } };

  function rtAvgLocal(values){
    const nums = values.filter(v => Number.isFinite(v));
    return nums.length ? nums.reduce((a,b) => a+b, 0) / nums.length : null;
  }

  async function renderQualificationGrid(platform, serverId){
    const gridId = platform === 'Console' ? 'qualGridConsole' : 'qualGridPC';
    const grid = q(gridId);
    if(!grid) return;
    grid.classList.remove('hidden');
    grid.innerHTML = '<div class="qual-grid-empty">Loading&hellip;</div>';

    let standings, profiles, tiers;
    try{
      standings = await window.cachedLicenceServerStandings({ minLaps: 15, serverId, classStructure: await window.classStructureForServer(serverId) , qualWindow: await window.fetchQualWindowMs()});
      profiles = await staffSearch('');
      tiers = await window.IFWL_TierAPI.fetchTierList();
    }catch(e){
      grid.innerHTML = `<div class="qual-grid-empty">Could not load: ${e.message}</div>`;
      return;
    }
    if(!standings.length){
      grid.innerHTML = `<div class="qual-grid-empty">No sessions recorded on the IFWL ${platform} Licence server yet.</div>`;
      return;
    }

    const byAccName = new Map();
    profiles.forEach(p => (p.accDriverNames || []).forEach(n => byAccName.set(window.IFWLStats.driverNameKey(n), p)));
    qualGridCache[platform].profiles = profiles;
    // ✅ ADDED: kept alongside profiles so "Download Grid PDF" can reuse the
    // exact same grouping/data the staff member is looking at, with no re-fetch.
    qualGridCache[platform].standings = standings;
    qualGridCache[platform].tiers = tiers;
    const sortedTiers = mainLadderTiers(tiers).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    const tierOptions = sortedTiers.map(t => `<option value="${t.name}">${t.name}</option>`).join('');

    const qualified = standings.filter(s => s.qualified);
    const notYet = standings.filter(s => !s.qualified);

    const groups = TIER_GRID_ORDER.map(tierName => ({
      tierName,
      rows: qualified.filter(s => s.recommendedTier === tierName)
    }));

    const buildDriverCard = (s, groupIdx, rowIdx) => {
      const profile = byAccName.get(window.IFWLStats.driverNameKey(s.driver));
      const uid = `g${groupIdx}r${rowIdx}`;
      const statsLine = `<div class="qgd-stats">
        <span>Gap ${s.avgGapPct != null ? '+' + s.avgGapPct + '%' : '-'}</span>
        <span>Consistency ${s.consistencyAvg != null ? s.consistencyAvg + '%' : '-'}</span>
        <span>Risk ${s.riskAvg != null ? s.riskAvg + '%' : '-'}</span>
        <span>${s.totalLaps} laps</span>
      </div>`;
      const control = !profile
        ? `<input type="text" class="grid-unlink-search" data-uid="${uid}" data-accname="${s.driver}" placeholder="Search driver to link...">
           <div class="unlink-results" id="gridLinkResults${uid}"></div>`
        : (() => {
            // ✅ FIXED: the engine's recommendedTier is always a fixed English label
            // ("GT3 Pro" etc) but the live ladder uses its own names ("IFWL-GT-Pro"),
            // so the old exact-match pre-select never matched and every dropdown fell
            // back to the FIRST option on the ladder. Resolve the label to the real
            // ladder tier first (same helper the Grid PDF uses); if nothing on the
            // ladder matches (e.g. Rookie Class), force an explicit choice instead of
            // silently defaulting to the wrong tier.
            const recName = resolveNewTierMeta(tiers, s.recommendedTier).name;
            const hasRec = sortedTiers.some(t => t.name === recName);
            const opts = (hasRec ? '' : '<option value="" selected disabled>Choose tier...</option>')
              + tierOptions.replace(`value="${recName}"`, `value="${recName}" selected`);
            // ✅ ADDED: Discord tier roles are granted per the driver's profile platform;
            // a blank platform means NO role is granted. Fill it from the grid they
            // qualified on - only ever when it is blank, never overwriting a set value.
            const fillPlatform = profile.platform ? '' : (platform === 'Console' ? 'console' : 'pc');
            return `<select id="gridTierSelect${uid}">${opts}</select>
           <button class="btn teal" style="width:100%" data-grid-assign="${uid}" data-driver="${profile.discordId}" data-gap="${s.avgGapPct ?? '?'}" data-laps="${s.totalLaps}" data-set-platform="${fillPlatform}">Assign</button>`;
          })();
      return `<div class="qual-grid-driver">
        <div class="qgd-name">${s.driver}${profile ? '' : ' <span class="field-hint">(unlinked)</span>'}</div>
        ${profile ? `<div class="field-hint">Licence: ${profile.name} (${profile.licenceNumber})</div>` : ''}
        ${statsLine}
        ${control}
        <button class="btn-view-sessions" data-view-sessions="grid${uid}" data-driver-label="${s.driver}" data-acc-names="${(profile?.accDriverNames || [s.driver]).join('|')}">View Sessions</button>
      </div>`;
    };

    const gridHtml = groups.map((g, gi) => {
      const sof = {
        count: g.rows.length,
        gap: rtAvgLocal(g.rows.map(r => r.avgGapPct)),
        consistency: rtAvgLocal(g.rows.map(r => r.consistencyAvg)),
        risk: rtAvgLocal(g.rows.map(r => r.riskAvg))
      };
      const sofLine = `<div class="qual-grid-sof">
        <span>${sof.count} driver${sof.count===1?'':'s'}</span>
        <span>Avg gap ${sof.gap != null ? '+' + (Math.round(sof.gap*100)/100) + '%' : '-'}</span>
        <span>Avg consistency ${sof.consistency != null ? Math.round(sof.consistency*10)/10 + '%' : '-'}</span>
        <span>Avg risk ${sof.risk != null ? Math.round(sof.risk*10)/10 + '%' : '-'}</span>
      </div>`;
      const body = g.rows.length
        ? g.rows.map((s, ri) => buildDriverCard(s, gi, ri)).join('')
        : '<div class="qual-grid-empty">No drivers currently recommended here.</div>';
      return `<div class="qual-grid-col">
        <div class="qual-grid-col-head"><h4>${g.tierName}</h4>${sofLine}</div>
        ${body}
      </div>`;
    }).join('');

    const notYetHtml = `<div class="qual-grid-col">
      <div class="qual-grid-col-head"><h4>Not Yet Qualified</h4><div class="qual-grid-sof"><span>${notYet.length} driver${notYet.length===1?'':'s'}</span></div></div>
      ${notYet.length ? notYet.map((s, ni) => {
        // ✅ CHANGED: Not Yet Qualified drivers can now be assigned (or linked)
        // manually, same controls as the tier columns - the automatic lap count
        // can miss people (laps split across two ACC names, name mismatches,
        // laps outside the qualifying window), and staff need to be able to
        // place someone they know has qualified. Never pre-selects a tier:
        // staff must choose one explicitly.
        const p = byAccName.get(window.IFWLStats.driverNameKey(s.driver));
        const uid = `nq${ni}`;
        const stats = `<div class="qgd-stats">
          <span>${s.totalLaps}/15 laps</span>
          <span>Gap ${s.avgGapPct != null ? '+' + s.avgGapPct + '%' : '-'}</span>
          <span>Consistency ${s.consistencyAvg != null ? s.consistencyAvg + '%' : '-'}</span>
          <span>Risk ${s.riskAvg != null ? s.riskAvg + '%' : '-'}</span>
        </div>`;
        const control = !p
          ? `<input type="text" class="grid-unlink-search" data-uid="${uid}" data-accname="${s.driver}" placeholder="Search driver to link...">
             <div class="unlink-results" id="gridLinkResults${uid}"></div>`
          : `<select id="gridTierSelect${uid}"><option value="" selected disabled>Choose tier...</option>${tierOptions}</select>
             <button class="btn teal" style="width:100%" data-grid-assign="${uid}" data-driver="${p.discordId}" data-gap="${s.avgGapPct ?? '?'}" data-laps="${s.totalLaps}" data-manual="1" data-set-platform="${p.platform ? '' : (platform === 'Console' ? 'console' : 'pc')}">Assign</button>`;
        return `<div class="qual-grid-driver"><div class="qgd-name">${s.driver}${p ? '' : ' <span class="field-hint">(unlinked)</span>'}</div>${p ? `<div class="field-hint">Licence: ${p.name} (${p.licenceNumber})</div>` : ''}${stats}${control}
          <button class="btn-view-sessions" data-view-sessions="grid${uid}" data-driver-label="${s.driver}" data-acc-names="${(p?.accDriverNames || [s.driver]).join('|')}">View Sessions</button></div>`;
      }).join('') : '<div class="qual-grid-empty">Everyone with any laps has reached 15.</div>'}
    </div>`;

    const qualifiedCount = qualified.length;
    grid.innerHTML = `
      <div class="qual-grid-toolbar">
        <span class="field-hint">${qualifiedCount} driver${qualifiedCount===1?'':'s'} currently on the grid - download once you're happy with it.</span>
        <button class="btn purple" type="button" data-download-pdf="${platform}">📄 Download Grid PDF</button>
      </div>
      <div class="qual-grid">${gridHtml}${notYetHtml}</div>`;

    // Search-to-link, same pattern as the flat table
    grid.querySelectorAll('.grid-unlink-search').forEach(input => {
      input.addEventListener('input', () => {
        const uid = input.dataset.uid;
        const term = input.value.trim().toLowerCase();
        const resultsBox = q(`gridLinkResults${uid}`);
        if(!term){ resultsBox.innerHTML = ''; return; }
        const matches = profiles.filter(p => (p.name||'').toLowerCase().includes(term) || (p.licenceNumber||'').toLowerCase().includes(term)).slice(0, 6);
        resultsBox.innerHTML = matches.length
          ? matches.map(p => `<div class="note-item" style="cursor:pointer" data-grid-link="${uid}" data-link-driver="${p.discordId}" data-accname="${input.dataset.accname}">${p.name} <span class="note-meta">(${p.licenceNumber})</span></div>`).join('')
          : '<div class="empty">No matches.</div>';
      });
    });

    if(!grid.dataset.clickBound){
      grid.dataset.clickBound = '1';
      grid.addEventListener('click', async (e) => {
        const linkEl = e.target.closest('[data-grid-link]');
        if(linkEl){
          linkEl.textContent = 'Linking...';
          try{
            const targetProfile = qualGridCache[platform].profiles.find(p => p.discordId === linkEl.dataset.linkDriver);
            const existing = targetProfile?.accDriverNames || [];
            const accName = linkEl.dataset.accname;
            const merged = existing.some(n => n.toLowerCase() === accName.toLowerCase()) ? existing : [...existing, accName];
            await staffSaveProfile(linkEl.dataset.linkDriver, { accDriverNames: merged });
          }catch(err){ alert('Could not link: ' + err.message); }
          await renderQualificationGrid(platform, serverId);
          return;
        }
        const assignBtn = e.target.closest('[data-grid-assign]');
        if(assignBtn){
          const chosenTier = q(`gridTierSelect${assignBtn.dataset.gridAssign}`).value;
          if(!chosenTier){ alert('Choose a tier for this driver first.'); return; }
          const reason = assignBtn.dataset.manual
            ? `Manually placed by staff from Not Yet Qualified (IFWL ${platform} Licence server: ${assignBtn.dataset.laps}/15 laps recorded)`
            : `Qualified via IFWL ${platform} Licence server: ${assignBtn.dataset.laps} laps, gap +${assignBtn.dataset.gap}%`;
          assignBtn.disabled = true; assignBtn.textContent = 'Assigning...';
          try{
            const patch = { tier: chosenTier, reason };
            if(assignBtn.dataset.setPlatform) patch.platform = assignBtn.dataset.setPlatform;
            await staffSaveProfile(assignBtn.dataset.driver, patch);
            assignBtn.textContent = 'Assigned';
          }catch(err){ alert('Could not assign: ' + err.message); assignBtn.disabled = false; assignBtn.textContent = 'Assign'; }
          return;
        }
        const sessionsBtn = e.target.closest('[data-view-sessions]');
        if(sessionsBtn){
          await renderSessionDrilldown(platform, serverId, sessionsBtn.dataset.driverLabel, sessionsBtn.dataset.accNames.split('|'));
        }
        const pdfBtn = e.target.closest('[data-download-pdf]');
        if(pdfBtn){
          downloadQualGridPdf(pdfBtn.dataset.downloadPdf);
        }
      });
    }
  }

  // ✅ ADDED: "Download Grid PDF" - staff: update this line each season, it's
  // the only place the season number/label needs to change for this export.
  const GRID_PDF_SEASON_LABEL = 'Season 4';

  // Same tier grouping Populate the Grid uses, minus the "Not Yet Qualified"
  // column and any tier with nobody in it - nothing to congratulate there.
  function buildGridPdfGroups(standings){
    const qualified = (standings || []).filter(s => s.qualified);
    return TIER_GRID_ORDER
      .map(tierName => ({ tierName, rows: qualified.filter(s => s.recommendedTier === tierName) }))
      .filter(g => g.rows.length);
  }

  const GRID_PDF_TIER_COLORS = {
    'GT3 Pro': [31, 138, 122],
    'GT3 Amateur': [108, 63, 166],
    'GT3 Beginner': [184, 121, 26],
    'Rookie Class': [91, 101, 112]
  };

  // ✅ ADDED: TinyPDF - a minimal, dependency-free PDF writer, purpose-built
  // for this one export. Deliberately NOT pulling in a CDN-hosted PDF library
  // for one button - keeps this page fully self-contained (same as
  // everywhere else in it: no third-party JS runtime dependency, just this
  // file + ifwl-stats-engine.js), with nothing that can fail to load if a
  // CDN is slow, blocked, or offline. Only supports what this export needs:
  // filled rectangles and left-aligned single-line text in Helvetica.
  function createTinyPdf(){
    const PAGE_W = 595.28, PAGE_H = 841.89; // A4, points (matches the layout maths below)
    const pages = [{ ops: [] }];
    let cur = 0;
    let fillColor = [0, 0, 0], textColor = [0, 0, 0], bold = false, fontSize = 11;

    // Base-14 Helvetica/Helvetica-Bold only cover Latin-1 (WinAnsiEncoding).
    // Map the couple of typographic characters this export used to try to
    // use into their WinAnsi byte, everything else outside 0-255 becomes
    // "?" rather than corrupting the file - safer than assuming every
    // driver's linked name is plain ASCII.
    const CHAR_MAP = { '—': '\x97', '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94' };
    function toWinAnsi(str){
      return String(str).split('').map(ch => {
        const code = ch.charCodeAt(0);
        if(code <= 255) return ch;
        return CHAR_MAP[ch] || '?';
      }).join('');
    }
    function pdfEscape(str){
      return toWinAnsi(str).replace(/[\\()]/g, m => '\\' + m);
    }

    function op(s){ pages[cur].ops.push(s); }

    function setFillColor(r,g,b){ fillColor = [r,g,b]; }
    function setTextColor(r,g,b){ textColor = [r,g,b]; }
    function setFont(_family, style){ bold = style === 'bold'; }
    function setFontSize(size){ fontSize = size; }

    function rect(x, y, w, h, mode){
      if(mode !== 'F') return; // fill-only, this export never strokes
      const [r,g,b] = fillColor;
      op(`${(r/255).toFixed(3)} ${(g/255).toFixed(3)} ${(b/255).toFixed(3)} rg`);
      op(`${x.toFixed(2)} ${(PAGE_H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    }

    // Rough average-character-width wrap, same purpose as jsPDF's
    // splitTextToSize - not metrically exact, but plenty for this one
    // congratulations paragraph, and errs toward wrapping a little early
    // rather than overflowing the page margin.
    function splitTextToSize(text, maxWidth){
      const avgCharW = (bold ? 0.62 : 0.52) * fontSize;
      const maxChars = Math.max(10, Math.floor(maxWidth / avgCharW));
      const words = String(text).split(/\s+/);
      const lines = [];
      let line = '';
      words.forEach(w => {
        const candidate = line ? line + ' ' + w : w;
        if(candidate.length > maxChars && line){ lines.push(line); line = w; }
        else line = candidate;
      });
      if(line) lines.push(line);
      return lines;
    }

    // Single line, or an array of lines drawn top-down from (x,y) - same
    // calling convention used throughout downloadQualGridPdf below.
    function text(strOrLines, x, y){
      const lines = Array.isArray(strOrLines) ? strOrLines : [strOrLines];
      const [r,g,b] = textColor;
      const fontRef = bold ? '/F2' : '/F1';
      lines.forEach((line, i) => {
        const ly = y + i * (fontSize * 1.15);
        op(`${(r/255).toFixed(3)} ${(g/255).toFixed(3)} ${(b/255).toFixed(3)} rg`);
        op(`BT ${fontRef} ${fontSize} Tf 1 0 0 1 ${x.toFixed(2)} ${(PAGE_H - ly).toFixed(2)} Tm (${pdfEscape(line)}) Tj ET`);
      });
    }

    function addPage(){ pages.push({ ops: [] }); cur = pages.length - 1; }

    function save(filename){
      const objects = [];
      objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
      const fontObjNum = 3, fontBoldObjNum = 4;
      objects[fontObjNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
      objects[fontBoldObjNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

      let next = 5;
      const kids = [];
      pages.forEach(p => {
        const pageNum = next++, contentNum = next++;
        kids.push(pageNum);
        const stream = p.ops.join('\n');
        objects[contentNum] = { stream };
        objects[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] /Resources << /Font << /F1 ${fontObjNum} 0 R /F2 ${fontBoldObjNum} 0 R >> >> /Contents ${contentNum} 0 R >>`;
      });
      objects[2] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;

      let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
      const offsets = [0]; // object 0 is the free-list head, never used directly
      for(let i = 1; i < objects.length; i++){
        offsets[i] = out.length;
        const body = objects[i];
        if(typeof body === 'string'){
          out += `${i} 0 obj\n${body}\nendobj\n`;
        } else {
          out += `${i} 0 obj\n<< /Length ${body.stream.length} >>\nstream\n${body.stream}\nendstream\nendobj\n`;
        }
      }
      const xrefStart = out.length;
      out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
      for(let i = 1; i < objects.length; i++){
        out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
      }
      out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

      // Build as raw bytes (every char above is guaranteed <=255 by
      // pdfEscape/toWinAnsi) so the Blob is a byte-for-byte valid PDF.
      const bytes = new Uint8Array(out.length);
      for(let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    return {
      setFillColor, setTextColor, setFont, setFontSize, rect, text, addPage, splitTextToSize, save,
      internal: { pageSize: { getWidth: () => PAGE_W, getHeight: () => PAGE_H } }
    };
  }

  // ✅ ADDED: the engine's recommendedTier is always one of these 4 fixed
  // English labels (see ifwl-stats-engine.js), but staff can freely rename
  // every tier on the actual ladder (Staff > Manage Licence Tiers - e.g. this
  // league currently uses "IFWL-GT-Pro" etc, not "GT3 Pro"). Match by keyword
  // against the REAL current tier list so the PDF shows the tier names staff
  // actually use, and so its order (for promoted/demoted) is correct even
  // after a rename. Falls back to the generic engine label if nothing on the
  // ladder matches any keyword at all.
  const GRID_PDF_TIER_KEYWORDS = { 'GT3 Pro': 'pro', 'GT3 Amateur': 'amateur', 'GT3 Beginner': 'beginner', 'Rookie Class': 'rookie' };
  function resolveNewTierMeta(tierList, recommendedLabel){
    const list = mainLadderTiers(tierList || []);
    const kw = GRID_PDF_TIER_KEYWORDS[recommendedLabel];
    // Match on a WHOLE word, not a substring - "pro" must not match inside
    // "Provisional". Split each tier name on any non-alphanumeric run so
    // "IFWL-GT-Pro" -> ["ifwl","gt","pro"] but "IFWL-GT-Provisional" ->
    // ["ifwl","gt","provisional"], which no longer collides.
    const byKeyword = kw ? list.find(t => t.name.toLowerCase().split(/[^a-z0-9]+/i).includes(kw)) : null;
    const exact = list.find(t => t.name === recommendedLabel);
    const match = byKeyword || exact;
    return match ? { name: match.name, order: match.order ?? null } : { name: recommendedLabel, order: null };
  }
  // A driver's recorded profile.tier is always an exact name from this same
  // ladder (it's set via this same Assign control, or the tier editor), so
  // this can just be a direct lookup - no keyword guessing needed here.
  function resolveCurrentTierMeta(tierList, tierName){
    if(!tierName) return null;
    const match = mainLadderTiers(tierList || []).find(t => t.name === tierName);
    return match ? { name: match.name, order: match.order ?? null } : { name: tierName, order: null };
  }

  function downloadQualGridPdf(platform){
    const standings = qualGridCache[platform]?.standings || [];
    const groups = buildGridPdfGroups(standings);
    if(!groups.length){ alert('No qualified drivers on this grid yet - click Populate the Grid first.'); return; }

    const byAccName = new Map();
    (qualGridCache[platform]?.profiles || []).forEach(p => (p.accDriverNames || []).forEach(n => byAccName.set(window.IFWLStats.driverNameKey(n), p)));
    const tierList = qualGridCache[platform]?.tiers || [];

    const doc = createTinyPdf();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 48;
    let y = 0;

    const drawHeader = () => {
      doc.setFillColor(20, 99, 87);
      doc.rect(0, 0, pageW, 82, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('IFWL', marginX, 30);
      doc.setFontSize(18);
      doc.text(`${platform.toUpperCase()} LICENCE GRID - ${GRID_PDF_SEASON_LABEL.toUpperCase()}`, marginX, 58);
      return 82 + 30;
    };

    y = drawHeader();

    doc.setTextColor(27, 36, 48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text("Congratulations - you've qualified and been placed on the grid!", marginX, y);
    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const introLines = doc.splitTextToSize(
      `Please now ensure you sign up to the SimGrid event found under Available Races - this will be your allocated race series for ${GRID_PDF_SEASON_LABEL}.`,
      pageW - marginX * 2
    );
    doc.text(introLines, marginX, y);
    y += introLines.length * 14 + 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(91, 101, 112);
    doc.text('Green = promoted since last recorded tier.  Orange = demoted.  Teal = retained (same tier).  Grey = new grid entry.', marginX, y);
    y += 22;

    // ✅ ADDED: one place for each status's row tint, pill colour and label -
    // 'up'/'down' were the only two states before; 'same' and 'unknown' are
    // new so "stayed at the same tier" and "first time on the grid" both get
    // their own explicit word too, not just an unlabelled row.
    const GRID_PDF_STATUS_META = {
      up:      { rowBg: [214, 245, 222], pill: [26, 122, 68],  label: 'PROMOTED' },
      down:    { rowBg: [255, 231, 199], pill: [161, 96, 12],  label: 'DEMOTED' },
      same:    { rowBg: [214, 241, 238], pill: [20, 99, 87],   label: 'RETAINED' },
      unknown: { rowBg: [237, 238, 241], pill: [91, 101, 112], label: 'NEW ENTRY' }
    };

    // Shrinks text to fit one line within maxWidth (current font/size/style
    // on `doc` must already be set), adding an ellipsis if it had to cut -
    // reuses splitTextToSize's own width estimate rather than a second one,
    // so a name/tier column can never be long enough to run into its neighbour.
    function fitOneLine(text, maxWidth){
      const str = String(text);
      if(doc.splitTextToSize(str, maxWidth).length <= 1) return str;
      let cut = str;
      while(cut.length > 3 && doc.splitTextToSize(cut + '...', maxWidth).length > 1) cut = cut.slice(0, -1);
      return cut.replace(/\s+$/, '') + '...';
    }

    const ROW_H = 40;                    // two text lines + padding per driver
    const NAME_COL_W = 300;              // line 1 left: race-number + nickname
    const LICENCE_COL_X = pageW - marginX - 168; // line 1 right: licence number
    const LICENCE_COL_W = 160;
    const TIER_COL_W = pageW - marginX * 2 - 20 - 96; // line 2 left: current -> new tier
    const PILL_W = 84, PILL_H = 15;      // line 2 right: status pill

    const ensureSpace = (needed) => {
      if(y + needed > pageH - 50){
        doc.addPage();
        y = 50;
      }
    };

    groups.forEach(g => {
      ensureSpace(22 + 10 + Math.min(g.rows.length, 1) * ROW_H);
      const color = GRID_PDF_TIER_COLORS[g.tierName] || [27, 36, 48];
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(marginX, y, pageW - marginX * 2, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`${g.tierName}  (${g.rows.length} driver${g.rows.length === 1 ? '' : 's'})`, marginX + 8, y + 15);
      y += 22 + 6;

      const newTierMeta = resolveNewTierMeta(tierList, g.tierName);

      g.rows.forEach((s) => {
        ensureSpace(ROW_H);
        const profile = byAccName.get(window.IFWLStats.driverNameKey(s.driver));
        const displayName = profile ? profile.name : s.driver;
        const licenceNo = profile ? (profile.licenceNumber || '-') : '-';
        const currentTierMeta = profile ? resolveCurrentTierMeta(tierList, profile.tier) : null;

        let status = 'unknown'; // 'up' | 'down' | 'same' | 'unknown'
        if(currentTierMeta && currentTierMeta.order != null && newTierMeta.order != null){
          if(newTierMeta.order > currentTierMeta.order) status = 'up';
          else if(newTierMeta.order < currentTierMeta.order) status = 'down';
          else status = 'same';
        }
        const meta = GRID_PDF_STATUS_META[status];

        doc.setFillColor(meta.rowBg[0], meta.rowBg[1], meta.rowBg[2]);
        doc.rect(marginX, y - 4, pageW - marginX * 2, ROW_H - 6, 'F');

        // Line 1: nickname (left, bold) + licence number (right, muted)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(27, 36, 48);
        doc.text(fitOneLine(displayName, NAME_COL_W), marginX + 10, y + 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(91, 101, 112);
        doc.text(fitOneLine(`Licence ${licenceNo}`, LICENCE_COL_W), LICENCE_COL_X, y + 11);

        // Line 2: current -> new tier (left) + status pill (right)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(27, 36, 48);
        const currentLabel = currentTierMeta ? currentTierMeta.name : 'New entry';
        doc.text(fitOneLine(`${currentLabel}  ->  ${newTierMeta.name}`, TIER_COL_W), marginX + 10, y + 27);

        const pillX = pageW - marginX - PILL_W - 4, pillY = y + 16;
        doc.setFillColor(meta.pill[0], meta.pill[1], meta.pill[2]);
        doc.rect(pillX, pillY, PILL_W, PILL_H, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(meta.label, pillX + 8, pillY + 10.5);

        // Thin separator so consecutive rows of the same status never blur together
        doc.setFillColor(255, 255, 255);
        doc.rect(marginX, y + ROW_H - 6, pageW - marginX * 2, 1, 'F');

        y += ROW_H;
      });
      y += 14;
    });

    doc.setFontSize(9);
    doc.setTextColor(91, 101, 112);
    doc.text(`Generated ${new Date().toLocaleDateString('en-GB')} - IFWL Licence Centre`, marginX, pageH - 30);

    doc.save(`IFWL_${platform}_Grid_${GRID_PDF_SEASON_LABEL.replace(/\s+/g, '')}.pdf`);
  }

  /* ---- Bulk-Link from SimGrid ---- */
  // Matches by Discord username (discordUsername field), NOT display name -
  // SimGrid shows the raw username in parentheses, e.g. "Marcin Bania (cainpl)",
  // and that's a completely different string from whatever nickname/global name
  // ended up as the profile's display "name".
  function parseSimgridPaste(text){
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const rows = [];
    for(const line of lines){
      const m = line.match(/^(.+?)\s*\(([A-Za-z0-9_.\-]+)\)\s*$/);
      if(!m) continue;
      rows.push({ accName: m[1].trim(), handle: m[2].trim().toLowerCase() });
    }
    return rows;
  }

  q('sgBulkParseBtn')?.addEventListener('click', async () => {
    const rows = parseSimgridPaste(q('sgBulkPasteInput').value);
    const preview = q('sgBulkPreview');
    if(!rows.length){
      preview.innerHTML = '<div class="empty">No "Name (handle)" lines found in that paste.</div>';
      return;
    }
    q('sgBulkStatus').textContent = 'Matching against known profiles...';
    const profiles = await staffSearch('');
    const byHandle = new Map();
    profiles.forEach(p => { if(p.discordUsername) byHandle.set(p.discordUsername, p); });

    const matched = rows.map(r => ({ ...r, profile: byHandle.get(r.handle) || null }));
    const matchCount = matched.filter(r => r.profile).length;
    q('sgBulkStatus').textContent = `${matchCount} of ${rows.length} matched to a known profile.`;

    preview.innerHTML = `
      <div class="table-wrap">
        <table class="dir-table">
          <thead><tr><th><input type="checkbox" id="sgBulkSelectAll" checked></th><th>SimGrid Name</th><th>Handle</th><th>Matched profile</th></tr></thead>
          <tbody>
            ${matched.map((r,i) => `<tr>
              <td><input type="checkbox" class="sg-bulk-check" data-idx="${i}" ${r.profile ? 'checked' : 'disabled'}></td>
              <td>${r.accName}</td>
              <td class="mono">${r.handle}</td>
              <td>${r.profile ? `${r.profile.name} <span class="note-meta">(${r.profile.licenceNumber})</span>` : '<span class="field-hint">Not found - they need to log in at least once first</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <button class="btn teal" id="sgBulkApplyBtn" type="button" style="margin-top:12px">Link selected drivers</button>
    `;

    q('sgBulkSelectAll').addEventListener('change', e => {
      document.querySelectorAll('.sg-bulk-check:not(:disabled)').forEach(el => el.checked = e.target.checked);
    });

    q('sgBulkApplyBtn').addEventListener('click', async () => {
      const btn = q('sgBulkApplyBtn');
      btn.disabled = true; btn.textContent = 'Linking...';
      let linked = 0, failed = 0;
      for(const el of document.querySelectorAll('.sg-bulk-check:checked')){
        const row = matched[Number(el.dataset.idx)];
        if(!row?.profile) continue;
        try{
          const existing = row.profile.accDriverNames || [];
          const merged = existing.some(n => n.toLowerCase() === row.accName.toLowerCase())
            ? existing
            : [...existing, row.accName];
          await staffSaveProfile(row.profile.discordId, { accDriverNames: merged });
          linked++;
        }catch(e){ failed++; }
      }
      btn.textContent = `Done - ${linked} linked${failed ? `, ${failed} failed` : ''}`;
    });
  });

  q('licenceQualRefreshBtn')?.addEventListener('click', async () => {
    const btn = q('licenceQualRefreshBtn');
    btn.disabled = true; btn.textContent = 'Refreshing...';
    await renderLicenceQualPanel('PC', 'pc-licence', true); // force=true also re-checks driver-name links that changed since page load
    btn.disabled = false; btn.textContent = 'Refresh';
  });
  q('licenceQualRefreshBtnConsole')?.addEventListener('click', async () => {
    const btn = q('licenceQualRefreshBtnConsole');
    btn.disabled = true; btn.textContent = 'Refreshing...';
    await renderLicenceQualPanel('Console', 'console-licence', true);
    btn.disabled = false; btn.textContent = 'Refresh';
  });

  q('populateGridBtnPC')?.addEventListener('click', async () => {
    const btn = q('populateGridBtnPC');
    btn.disabled = true; btn.textContent = 'Populating...';
    await renderQualificationGrid('PC', 'pc-licence');
    btn.disabled = false; btn.textContent = 'Refresh Grid';
  });
  q('populateGridBtnConsole')?.addEventListener('click', async () => {
    const btn = q('populateGridBtnConsole');
    btn.disabled = true; btn.textContent = 'Populating...';
    await renderQualificationGrid('Console', 'console-licence');
    btn.disabled = false; btn.textContent = 'Refresh Grid';
  });

  /* ---- Season Window ---- */
  async function initSeasonWindowPanel(){
    const season = await window.IFWL_SeasonAPI.fetchSeasonWindow();
    q('seasonLabelInput').value = season.label || '';
    q('seasonStartInput').value = season.startDate || '';
    q('seasonEndInput').value = season.endDate || '';

    try{
      const cu = await window.IFWL_SeasonAPI.fetchCareerUnlock();
      q('careerUnlockEnabledCheck').checked = !!cu.enabled;
    }catch(e){ q('careerUnlockSaveStatus').textContent = 'Could not load current state: ' + e.message; }
  }
  q('seasonSaveBtn')?.addEventListener('click', async () => {
    const label = q('seasonLabelInput').value.trim();
    const startDate = q('seasonStartInput').value;
    const endDate = q('seasonEndInput').value;
    if(!startDate || !endDate){ q('seasonSaveStatus').textContent = 'Both dates are required.'; return; }
    q('seasonSaveStatus').textContent = 'Saving...';
    try{
      await window.IFWL_SeasonAPI.saveSeasonWindow({ label, startDate, endDate });
      q('seasonSaveStatus').textContent = 'Saved. Race Results will use this next time it loads.';
    }catch(e){ q('seasonSaveStatus').textContent = 'Could not save: ' + e.message; }
  });
  q('careerUnlockSaveBtn')?.addEventListener('click', async () => {
    const enabled = q('careerUnlockEnabledCheck').checked;
    q('careerUnlockSaveStatus').textContent = 'Saving...';
    try{
      await window.IFWL_SeasonAPI.saveCareerUnlock(enabled);
      q('careerUnlockSaveStatus').textContent = enabled
        ? 'Saved - Career is now unlocked for every Active Racer.'
        : 'Saved - Career is now back to Gold Patreon only.';
    }catch(e){ q('careerUnlockSaveStatus').textContent = 'Could not save: ' + e.message; }
  });

  /* ---- Career System (master on/off + master reset) ---- */
  async function initCareerSystemPanel(){
    try{
      const status = await window.IFWL_SeasonAPI.fetchCareerSystemStatus();
      q('careerSystemEnabledCheck').checked = status.enabled !== false;
      q('careerSystemClosedMessageInput').value = status.closedMessage || '';
    }catch(e){ q('careerSystemSaveStatus').textContent = 'Could not load current state: ' + e.message; }
  }
  q('careerSystemSaveBtn')?.addEventListener('click', async () => {
    const enabled = q('careerSystemEnabledCheck').checked;
    const closedMessage = q('careerSystemClosedMessageInput').value.trim();
    q('careerSystemSaveStatus').textContent = 'Saving...';
    try{
      await window.IFWL_SeasonAPI.saveCareerSystemStatus(enabled, closedMessage);
      q('careerSystemSaveStatus').textContent = enabled
        ? 'Saved - the Career system is open for everyone.'
        : 'Saved - the Career system is now closed for everyone, including Gold Patreon and staff.';
    }catch(e){ q('careerSystemSaveStatus').textContent = 'Could not save: ' + e.message; }
  });
  q('careerSystemResetBtn')?.addEventListener('click', async () => {
    const confirmText = `Run the Career System Master Reset now?\n\nThis immediately wipes EVERY driver's Career Shop balance, owned Shop/Factory items, transaction history, Parts/Tyre/Fuel inventory, and locked-in Career Perks - all at once, right now.\n\nIt does NOT touch permanent liveries, open Marketplace listings, or pending Backing offers/contracts - those need their own separate action.\n\nThis cannot be undone. Type RESET to confirm.`;
    const typed = prompt(confirmText);
    if(typed !== 'RESET'){ q('careerSystemResetStatus').textContent = 'Cancelled - nothing changed.'; return; }
    const btn = q('careerSystemResetBtn');
    btn.disabled = true;
    q('careerSystemResetStatus').textContent = 'Resetting every driver - this may take a moment...';
    try{
      const result = await window.IFWL_SeasonAPI.runCareerSystemMasterReset();
      q('careerSystemResetStatus').textContent = `Done - reset ${result.resetCount} driver(s) for Season 4.`;
    }catch(e){ q('careerSystemResetStatus').textContent = 'Could not reset: ' + e.message; }
    finally{ btn.disabled = false; }
  });

  async function initQualificationWindowPanel(){
    const w = await window.IFWL_QualWindowAPI.fetchQualificationWindow();
    q('qualWindowEnabledCheck').checked = w.enabled !== false;
    q('qualWindowLabelInput').value = w.label || '';
    q('qualWindowStartInput').value = w.startDate || '';
    q('qualWindowEndInput').value = w.endDate || '';
  }
  q('qualWindowSaveBtn')?.addEventListener('click', async () => {
    const enabled = q('qualWindowEnabledCheck').checked;
    const label = q('qualWindowLabelInput').value.trim();
    const startDate = q('qualWindowStartInput').value;
    const endDate = q('qualWindowEndInput').value;
    if(enabled && (!startDate || !endDate)){ q('qualWindowSaveStatus').textContent = 'Both dates are required to enforce a window - untick "Enforce" instead if you just want to turn it off.'; return; }
    q('qualWindowSaveStatus').textContent = 'Saving...';
    try{
      await window.IFWL_QualWindowAPI.saveQualificationWindow({ enabled, label, startDate, endDate });
      window.invalidateQualWindowCache();
      q('qualWindowSaveStatus').textContent = enabled
        ? 'Saved. Licence Quali and every driver\'s own ranking will use this next time it loads.'
        : 'Saved - window is now off, all-time laps count again (your dates are kept for next time).';
    }catch(e){ q('qualWindowSaveStatus').textContent = 'Could not save: ' + e.message; }
  });

  /* ---- Staff Messages ---- */
  let msgPickedDriverId = null;
  async function initStaffMessagesPanel(){
    // Compose: driver search -> pick -> enables send
    q('msgDriverSearch')?.addEventListener('input', async () => {
      const term = q('msgDriverSearch').value.trim().toLowerCase();
      const box = q('msgDriverResults');
      msgPickedDriverId = null; q('msgDriverPicked').textContent = '';
      if(!term){ box.innerHTML = ''; return; }
      const profiles = await staffSearch('');
      const matches = profiles.filter(p => (p.name||'').toLowerCase().includes(term) || (p.licenceNumber||'').toLowerCase().includes(term)).slice(0, 8);
      if(!matches.length){ box.innerHTML = '<div class="empty">No matches.</div>'; return; }
      box.innerHTML = matches.map(p => `<div class="note-item" style="cursor:pointer" data-msg-driver="${p.discordId}" data-msg-name="${p.name}">${p.name} <span class="note-meta">(${p.licenceNumber})</span></div>`).join('');
      box.querySelectorAll('[data-msg-driver]').forEach(el => el.addEventListener('click', () => {
        msgPickedDriverId = el.dataset.msgDriver;
        q('msgDriverPicked').textContent = 'Sending to: ' + el.dataset.msgName;
        box.innerHTML = ''; q('msgDriverSearch').value = el.dataset.msgName;
      }));
    });

    // Broadcast mode: hides the driver picker, reveals the allow-replies toggle
    q('msgSendAllCheck')?.addEventListener('change', () => {
      const broadcast = q('msgSendAllCheck').checked;
      q('msgDriverPickGroup').style.display = broadcast ? 'none' : '';
      q('msgAllowRepliesRow').style.display = broadcast ? 'flex' : 'none';
      if(broadcast){ msgPickedDriverId = null; q('msgDriverPicked').textContent = ''; }
    });

    q('msgSendBtn')?.addEventListener('click', async () => {
      const subject = q('msgSubject').value.trim();
      const text = q('msgText').value.trim();
      const broadcast = q('msgSendAllCheck').checked;
      if(!subject || !text){ q('msgSendStatus').textContent = 'Subject and message are both required.'; return; }

      if(broadcast){
        const allowReplies = q('msgAllowRepliesCheck').checked;
        if(!confirm(`Send this to EVERY licensed driver?${allowReplies ? ' Replies will be ENABLED.' : ' Replies will be disabled (one-way announcement).'}`)) return;
        q('msgSendStatus').textContent = 'Broadcasting...';
        try{
          const result = await window.IFWL_InboxAPI.staffSendAll(subject, text, allowReplies);
          q('msgSendStatus').textContent = `Sent to ${result.sentTo} driver(s).`;
          q('msgSubject').value = ''; q('msgText').value = '';
          q('msgSendAllCheck').checked = false; q('msgAllowRepliesCheck').checked = false;
          q('msgDriverPickGroup').style.display = ''; q('msgAllowRepliesRow').style.display = 'none';
          renderStaffThreadList();
        }catch(e){ q('msgSendStatus').textContent = 'Could not broadcast: ' + e.message; }
        return;
      }

      if(!msgPickedDriverId){ q('msgSendStatus').textContent = 'Pick a driver first.'; return; }
      q('msgSendStatus').textContent = 'Sending...';
      try{
        await window.IFWL_InboxAPI.staffSend(msgPickedDriverId, subject, text);
        q('msgSendStatus').textContent = 'Sent.';
        q('msgSubject').value = ''; q('msgText').value = ''; q('msgDriverSearch').value = '';
        q('msgDriverPicked').textContent = ''; msgPickedDriverId = null;
        renderStaffThreadList();
      }catch(e){ q('msgSendStatus').textContent = 'Could not send: ' + e.message; }
    });

    q('staffInboxRefreshBtn')?.addEventListener('click', renderStaffThreadList);
    renderStaffThreadList();
  }

  async function renderStaffThreadList(){
    const list = q('staffThreadList');
    if(!list) return;
    q('staffThreadView').classList.add('hidden');
    list.classList.remove('hidden');
    let data;
    try{ data = await window.IFWL_InboxAPI.staffList(); }
    catch(e){ list.innerHTML = `<div class="empty">Could not load threads: ${e.message}</div>`; return; }
    const threads = data.threads || [];
    if(!threads.length){ list.innerHTML = '<div class="empty">No message threads yet.</div>'; return; }
    list.innerHTML = threads.map(t => `<div class="msg-thread-row${t.unread ? ' msg-unread' : ''}" data-staff-thread="${t.id}">
      <div><div class="msg-subject">${t.subject}${t.unread ? ` <span class="inbox-unread-badge">${t.unread}</span>` : ''}${t.threadType==='concern' ? ' <span class="scout-badge unlinked">Concern</span>' : ''}${t.restrictedToOwner ? ' <span class="scout-badge unlinked">Owner Only</span>' : ''}</div>
      <div class="msg-meta">${t.threadType==='concern' ? `From ${t.driverName} &middot; sent to ${t.staffName}` : `To ${t.driverName} &middot; from ${t.staffName}`} &middot; ${t.lastMessageAtMs ? new Date(t.lastMessageAtMs).toLocaleString() : ''}${t.lastMessageBy === 'driver' ? ' &middot; driver replied' : ''}</div></div>
      <span class="field-hint">Open &rarr;</span>
    </div>`).join('');
    list.querySelectorAll('[data-staff-thread]').forEach(row => row.addEventListener('click', () => openStaffThread(row.dataset.staffThread)));
  }

  async function openStaffThread(threadId){
    const view = q('staffThreadView');
    q('staffThreadList').classList.add('hidden');
    view.classList.remove('hidden');
    q('staffThreadMessages').innerHTML = '<div class="empty">Loading&hellip;</div>';
    let data;
    try{ data = await window.IFWL_InboxAPI.staffThread(threadId); }
    catch(e){ q('staffThreadMessages').innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }
    q('staffThreadSubject').textContent = `${data.subject || '(no subject)'} — ${data.driverName || 'Driver'}`;
    q('staffThreadMessages').innerHTML = (data.messages || []).map(m => `<div class="msg-bubble msg-${m.senderRole === 'driver' ? 'driver' : 'staff'}"><span class="msg-sender">${m.senderName}${m.senderRole === 'staff' ? ' (IFWL Staff)' : ''}</span>${m.text}</div>`).join('');
    q('staffReplyBtn').onclick = async () => {
      const text = q('staffReplyText').value.trim();
      if(!text) return;
      q('staffReplyStatus').textContent = 'Sending...';
      try{
        await window.IFWL_InboxAPI.staffReply(threadId, text);
        q('staffReplyText').value = '';
        q('staffReplyStatus').textContent = 'Sent.';
        setTimeout(()=>{ if(q('staffReplyStatus')) q('staffReplyStatus').textContent=''; }, 2000);
        openStaffThread(threadId);
      }catch(e){ q('staffReplyStatus').textContent = 'Could not send: ' + e.message; }
    };
    q('staffThreadBackBtn').onclick = () => renderStaffThreadList();
  }

  async function initBulkTierTool(){
    const tiers = await window.IFWL_TierAPI.fetchTierList();
    const sortedTiers = mainLadderTiers(tiers).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    const options = sortedTiers.map(t => `<option value="${t.name}">${t.name}</option>`).join('');

    q('staffTierFilter').innerHTML = '<option value="">All tiers</option>' + options;
    q('bulkFromTier').innerHTML = options;
    q('bulkToTier').innerHTML = options;

    q('staffTierFilter').addEventListener('change', () => runStaffSearch());

    q('bulkTierApplyBtn').addEventListener('click', async () => {
      const fromTier = q('bulkFromTier').value;
      const toTier = q('bulkToTier').value;
      const note = q('bulkTierNote').value.trim();
      if(fromTier === toTier){ q('bulkTierStatus').textContent = 'From and To tiers must be different.'; return; }

      const confirmText = `Move EVERY driver currently on "${fromTier}" to "${toTier}"?\n\nThis affects every matching driver at once and is meant for beta/end-of-season resets only - not everyday tier management.\n\nType YES to confirm.`;
      const typed = prompt(confirmText);
      if(typed !== 'YES'){ q('bulkTierStatus').textContent = 'Cancelled - nothing changed.'; return; }

      q('bulkTierApplyBtn').disabled = true;
      q('bulkTierStatus').textContent = 'Applying...';
      try{
        const result = await window.IFWL_Api.apiPost('staffBulkTierChange', { fromTier, toTier, note });
        q('bulkTierStatus').textContent = `Done - moved ${result.updated} driver(s) from "${fromTier}" to "${toTier}".`;
        runStaffSearch(); // refresh the list in case it was filtered to the tier that just emptied out
      }catch(e){ q('bulkTierStatus').textContent = 'Could not apply: ' + e.message; }
      finally{ q('bulkTierApplyBtn').disabled = false; }
    });
  }

  async function runStaffSearch(){
    const term = q('staffSearchInput').value.toLowerCase();
    const tierFilter = q('staffTierFilter').value;
    let rows = await staffSearch(term);
    if(tierFilter) rows = rows.filter(r => r.tier === tierFilter);
    renderResults(rows);
  }

  /* ---- Driver Name Audit ---- */
  let nameAuditRows = [];
  async function renderNameAudit(){
    const body = q('nameAuditBody');
    if(!body) return;
    body.innerHTML = '<tr><td colspan="5" class="empty">Loading&hellip;</td></tr>';
    let profiles;
    try{ profiles = await staffSearch(''); }
    catch(e){ body.innerHTML = `<tr><td colspan="5" class="empty">Could not load: ${e.message}</td></tr>`; return; }

    // Flatten one row per claimed name, not one row per driver - that's what
    // makes this an actual audit list rather than just the existing search.
    nameAuditRows = [];
    profiles.forEach(p => {
      (p.accDriverNames || []).forEach(n => {
        nameAuditRows.push({ accName: n, driverId: p.discordId, driverName: p.name, licenceNumber: p.licenceNumber, discordUsername: p.discordUsername || '' });
      });
    });
    nameAuditRows.sort((a,b) => a.accName.localeCompare(b.accName));

    const claimCounts = {};
    nameAuditRows.forEach(r => { claimCounts[r.driverId] = (claimCounts[r.driverId] || 0) + 1; });
    const heaviest = Object.entries(claimCounts).sort((a,b) => b[1]-a[1])[0];
    const heaviestDriver = heaviest ? nameAuditRows.find(r => r.driverId === heaviest[0]) : null;
    q('nameAuditSummary').textContent = `${nameAuditRows.length} claimed name(s) across ${Object.keys(claimCounts).length} driver(s).` +
      (heaviestDriver && heaviest[1] > 1 ? ` Most claims by one driver: ${heaviestDriver.driverName} (${heaviest[1]}).` : '');

    renderNameAuditFiltered();
  }

  function renderNameAuditFiltered(){
    const term = (q('nameAuditSearch').value || '').toLowerCase();
    const body = q('nameAuditBody');
    const rows = nameAuditRows.filter(r => !term ||
      r.accName.toLowerCase().includes(term) ||
      r.driverName.toLowerCase().includes(term) ||
      r.discordUsername.toLowerCase().includes(term)
    );
    if(!rows.length){ body.innerHTML = '<tr><td colspan="5" class="empty">No matches.</td></tr>'; return; }

    body.innerHTML = rows.map((r, i) => `<tr>
      <td>${r.accName}</td>
      <td>${r.driverName}</td>
      <td class="mono">${r.licenceNumber}</td>
      <td class="mono">${r.discordUsername || '-'}</td>
      <td><button class="btn ghost" style="border-color:var(--ifwl-red);color:#ffb3ba" data-remove-idx="${i}">Remove</button></td>
    </tr>`).join('');

    body.querySelectorAll('[data-remove-idx]').forEach(btn => btn.addEventListener('click', async () => {
      const row = rows[Number(btn.dataset.removeIdx)];
      if(!confirm(`Remove "${row.accName}" from ${row.driverName}'s linked names? This can't be undone from here - they'd need to re-claim it.`)) return;
      btn.disabled = true; btn.textContent = 'Removing...';
      try{
        const profiles = await staffSearch('');
        const profile = profiles.find(p => p.discordId === row.driverId);
        const updated = (profile?.accDriverNames || []).filter(n => n !== row.accName);
        await staffSaveProfile(row.driverId, { accDriverNames: updated });
        await renderNameAudit();
      }catch(e){ alert('Could not remove: ' + e.message); btn.disabled = false; btn.textContent = 'Remove'; }
    }));
  }

  q('nameAuditSearch')?.addEventListener('input', renderNameAuditFiltered);
  q('nameAuditRefreshBtn')?.addEventListener('click', renderNameAudit);

  async function initSystemStatusPanel(){
    const status = await window.IFWL_StatusAPI.fetchSystemStatus();
    q('statusActiveCheck').checked = !!status.active;
    q('statusTitleInput').value = status.title || '';
    q('statusMessageInput').value = status.message || '';
    q('statusStartInput').value = status.startDate || '';
    q('statusEndInput').value = status.endDate || '';

    q('statusSaveBtn').addEventListener('click', async () => {
      const active = q('statusActiveCheck').checked;
      const title = q('statusTitleInput').value.trim();
      const message = q('statusMessageInput').value.trim();
      const startDate = q('statusStartInput').value;
      const endDate = q('statusEndInput').value;
      if(active && (!title || !message)){ q('statusSaveStatus').textContent = 'Title and message are required to show a banner.'; return; }
      q('statusSaveStatus').textContent = 'Saving...';
      try{
        await window.IFWL_StatusAPI.saveSystemStatus({ active, title, message, startDate, endDate });
        q('statusSaveStatus').textContent = 'Saved.';
        window.renderSystemStatusBanner(); // reflect the change immediately for this staff member too
      }catch(e){ q('statusSaveStatus').textContent = 'Could not save: ' + e.message; }
    });

    // Home page settings (qualification card mode + season start date)
    try{
      const hs = await window.IFWL_HomeSettingsAPI.fetchHomeSettings();
      q('homeQualModeSel').value = hs.qualMode || 'auto';
      q('homeSeasonStartInput').value = hs.seasonStartDate || '2026-10-12';
    }catch(e){
      q('homeQualModeSel').value = 'auto';
      q('homeSeasonStartInput').value = '2026-10-12';
    }
    q('homeSettingsSaveBtn').addEventListener('click', async () => {
      const qualMode = q('homeQualModeSel').value;
      const seasonStartDate = q('homeSeasonStartInput').value;
      if(!seasonStartDate){ q('homeSettingsStatus').textContent = 'Pick the season start date.'; return; }
      q('homeSettingsStatus').textContent = 'Saving...';
      try{
        await window.IFWL_HomeSettingsAPI.saveHomeSettings({ qualMode, seasonStartDate });
        window.invalidateHomeSettings?.();
        window.applyQualCardMode?.();
        window.renderHomeNextRace?.();
        q('homeSettingsStatus').textContent = 'Saved - live for drivers now.';
      }catch(e){ q('homeSettingsStatus').textContent = 'Could not save: ' + e.message; }
    });

    // Auto licence placement
    const apEsc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const apShowLastRun = (lr, enabled) => {
      const box = q('apLastRun');
      if(!box) return;
      if(!lr){ box.textContent = 'No placement check has run yet. It runs every 30 minutes.'; return; }
      const when = lr.atMs ? new Date(lr.atMs).toLocaleString() : 'unknown time';
      const line = d => `  - ${d.name} (${d.platform}): ${d.from || 'baseline'} -> ${d.tier}  [${d.laps} laps, gap ${d.gap > 0 ? '+' : ''}${d.gap}%]`;
      const parts = [`Last check: ${when}`];
      if((lr.placed || []).length) parts.push(`Placed ${lr.placed.length}:\n` + lr.placed.slice(0, 30).map(line).join('\n'));
      if((lr.wouldPlace || []).length) parts.push(`Waiting (would be placed if auto-placement were on) - ${lr.wouldPlace.length}:\n` + lr.wouldPlace.slice(0, 30).map(line).join('\n'));
      if(!(lr.placed || []).length && !(lr.wouldPlace || []).length) parts.push('Nobody was waiting to be placed.');
      (lr.notes || []).forEach(n => parts.push('Note: ' + n));
      box.textContent = parts.join('\n');
    };
    try{
      const ap = await window.IFWL_AutoPlacementAPI.fetchAutoPlacement();
      q('apJoinerCheck').checked = ap.settings.newJoinerProvisional !== false;
      q('apAutoCheck').checked = ap.settings.autoPlaceEnabled === true;
      q('apSettleHours').value = ap.settings.settleHours;
      q('apMaxPerRun').value = ap.settings.maxPerRun;
      apShowLastRun(ap.lastRun, ap.settings.autoPlaceEnabled);
    }catch(e){
      q('apLastRun').textContent = 'Could not read the current setting yet (the backend may not be deployed, or this needs Owner / Ops Manager).';
    }
    q('apSaveBtn').addEventListener('click', async () => {
      q('apStatus').textContent = 'Saving...';
      try{
        const r = await window.IFWL_AutoPlacementAPI.saveAutoPlacement({
          newJoinerProvisional: q('apJoinerCheck').checked,
          autoPlaceEnabled: q('apAutoCheck').checked,
          settleHours: Number(q('apSettleHours').value),
          maxPerRun: Number(q('apMaxPerRun').value)
        });
        q('apStatus').textContent = r.settings.autoPlaceEnabled ? 'Saved - qualified drivers will now be placed automatically (next run within 30 minutes).' : 'Saved - auto-placement is off (the preview below still updates every 30 minutes).';
      }catch(e){ q('apStatus').textContent = 'Could not save: ' + e.message; }
    });

    // Live Timings maintenance mode
    const ltInfo = (m) => {
      q('ltMaintInfo').textContent = m.maintenance
        ? 'Maintenance mode is ON - the public Live Timings page is currently showing the yellow notice.'
        : 'Maintenance mode is OFF - Live Timings is open as normal.';
    };
    try{
      const lt = await window.IFWL_LiveTimingsMaintAPI.fetchLiveTimingsMaintenance();
      q('ltMaintCheck').checked = !!lt.maintenance;
      q('ltMaintMessage').value = lt.message || '';
      ltInfo(lt);
    }catch(e){
      q('ltMaintInfo').textContent = 'Could not read the current setting yet (the backend may not be deployed).';
    }
    q('ltMaintSaveBtn').addEventListener('click', async () => {
      const enabled = q('ltMaintCheck').checked;
      const message = q('ltMaintMessage').value.trim();
      q('ltMaintStatus').textContent = 'Saving...';
      try{
        const r = await window.IFWL_LiveTimingsMaintAPI.saveLiveTimingsMaintenance({ enabled, message });
        q('ltMaintStatus').textContent = enabled ? 'Saved - Live Timings is now closed to visitors.' : 'Saved - Live Timings is open.';
        ltInfo({ maintenance: !!r.maintenance });
      }catch(e){ q('ltMaintStatus').textContent = 'Could not save: ' + e.message; }
    });
  }

  /* ---- Licence Database ---- */
  let licDbProfiles = [];
  let licDbLapMap = new Map(); // discordId -> {pcLaps, pcQualified, consoleLaps, consoleQualified}
  let licDbStatsMap = new Map(); // discordId -> performance stats, populated only after "Load full stats"
  let licDbStatsLoaded = false;
  let licDbNoLicenceTierName = 'No Licence';
  // ✅ ADDED: checkbox multi-select state for the bulk toolbar (reset points
  // / message selected) - a Set of discordIds, persisted across a
  // renderLicDbTable() re-render (search/filter/load-stats) but cleared on
  // a full renderLicenceDatabase() reload.
  let licDbSelected = new Set();

  async function renderLicenceDatabase(){
    const overviewBox = q('licDbOverview');
    const body = q('licDbBody');
    overviewBox.innerHTML = '<div class="empty">Loading overview&hellip;</div>';
    body.innerHTML = '<tr><td colspan="12" class="empty">Loading&hellip;</td></tr>';
    licDbSelected.clear();
    licDbStatsLoaded = false;
    licDbStatsMap = new Map();
    q('licDbScoreHead').textContent = 'Overall';
    q('licDbConsHead').textContent = 'Consistency';
    q('licDbRiskHead').textContent = 'Race Risk';

    let profiles, tiers, pcStandings, consoleStandings;
    try{
      profiles = await staffSearch('');
      tiers = await window.IFWL_TierAPI.fetchTierList();
      pcStandings = await window.cachedLicenceServerStandings({ minLaps: 15, serverId: 'pc-licence', classStructure: await window.classStructureForServer('pc-licence') , qualWindow: await window.fetchQualWindowMs()}).catch(() => []);
      consoleStandings = await window.cachedLicenceServerStandings({ minLaps: 15, serverId: 'console-licence', classStructure: await window.classStructureForServer('console-licence') , qualWindow: await window.fetchQualWindowMs()}).catch(() => []);
    }catch(e){
      overviewBox.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`;
      body.innerHTML = '';
      return;
    }
    licDbProfiles = profiles;

    const sortedTiers = mainLadderTiers(tiers).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    const noLicenceTierName = sortedTiers[0]?.name || 'No Licence';
    licDbNoLicenceTierName = noLicenceTierName;

    // Match each profile to its qualification lap counts on each server, the
    // same substring-based name matching used everywhere else on this page.
    licDbLapMap = new Map();
    profiles.forEach(p => {
      const mine = (p.accDriverNames || []).map(n => window.IFWLStats.driverNameKey(n));
      const findRow = (standings) => mine.length ? standings.find(s => {
        const key = window.IFWLStats.driverNameKey(s.driver);
        return mine.some(m => m === key || key.includes(m) || m.includes(key));
      }) : null;
      const pcRow = findRow(pcStandings);
      const consoleRow = findRow(consoleStandings);
      licDbLapMap.set(p.discordId, {
        pcLaps: pcRow?.totalLaps ?? null, pcQualified: !!pcRow?.qualified,
        consoleLaps: consoleRow?.totalLaps ?? null, consoleQualified: !!consoleRow?.qualified
      });
    });

    const noLicenceCount = profiles.filter(p => p.tier === noLicenceTierName).length;
    const notQualifiedCount = profiles.filter(p => {
      const l = licDbLapMap.get(p.discordId);
      return !l.pcQualified && !l.consoleQualified;
    }).length;
    const unlinkedCount = profiles.filter(p => !(p.accDriverNames || []).length).length;
    const bannedCount = profiles.filter(p => p.banActive).length;

    overviewBox.innerHTML = `
      <div class="licdb-stat"><strong>${profiles.length}</strong><span>Drivers registered</span></div>
      <div class="licdb-stat"><strong>${noLicenceCount}</strong><span>Still No Licence</span></div>
      <div class="licdb-stat"><strong>${notQualifiedCount}</strong><span>Not qualified (PC or Console)</span></div>
      <div class="licdb-stat"><strong>${unlinkedCount}</strong><span>No ACC name linked</span></div>
      <div class="licdb-stat"><strong>${bannedCount}</strong><span>Currently banned</span></div>
    `;

    renderLicDbTable();
  }

  function renderLicDbTable(){
    const body = q('licDbBody');
    const term = (q('licDbSearch').value || '').toLowerCase();
    const filter = q('licDbFilter').value;

    let rows = licDbProfiles.filter(p => {
      if(term && !p.name.toLowerCase().includes(term) && !p.licenceNumber.toLowerCase().includes(term)) return false;
      const l = licDbLapMap.get(p.discordId);
      if(filter === 'no_licence' && p.tier !== licDbNoLicenceTierName) return false;
      if(filter === 'not_qualified' && (l.pcQualified || l.consoleQualified)) return false;
      if(filter === 'unlinked' && (p.accDriverNames || []).length) return false;
      if(filter === 'banned' && !p.banActive) return false;
      return true;
    });

    if(licDbStatsLoaded){
      rows = [...rows].sort((a,b) => {
        const sa = licDbStatsMap.get(a.discordId), sb = licDbStatsMap.get(b.discordId);
        const ga = sa?.avgGapPct, gb = sb?.avgGapPct;
        if(ga == null && gb == null) return 0;
        if(ga == null) return 1;
        if(gb == null) return -1;
        return ga - gb;
      });
    }

    // Selection only ever holds ids of rows currently on screen after a
    // search/filter change - drop anything that scrolled out of view so
    // "select all" and the count stay accurate to what's visible.
    const visibleIds = new Set(rows.map(p => p.discordId));
    [...licDbSelected].forEach(id => { if(!visibleIds.has(id)) licDbSelected.delete(id); });

    if(!rows.length){ body.innerHTML = '<tr><td colspan="12" class="empty">No matches.</td></tr>'; updateLicDbBulkToolbar(); return; }

    body.innerHTML = rows.map((p, i) => {
      const l = licDbLapMap.get(p.discordId) || {};
      const stats = licDbStatsMap.get(p.discordId);
      const pcLapsCell = l.pcLaps != null ? `${l.pcLaps}/15${l.pcQualified ? ' &#9989;' : ''}` : '-';
      const consoleLapsCell = l.consoleLaps != null ? `${l.consoleLaps}/15${l.consoleQualified ? ' &#9989;' : ''}` : '-';
      const platformLabel = p.platform === 'pc' ? 'PC' : p.platform === 'console' ? 'Console' : p.platform === 'both' ? 'PC + Console' : '-';
      const statusBits = [];
      if(p.banActive) statusBits.push('<span class="licdb-ban">Banned</span>');
      if(!(p.accDriverNames || []).length) statusBits.push('<span class="field-hint">Unlinked</span>');
      return `<tr>
        <td class="ops-or-headmod-tab"><input type="checkbox" class="licdb-row-check" data-id="${p.discordId}"${licDbSelected.has(p.discordId) ? ' checked' : ''}></td>
        <td><button class="licdb-expand-btn" data-licdb-expand="${p.discordId}" data-row="${i}">&#9660;</button></td>
        <td>${p.name} <span class="field-hint mono">(${p.licenceNumber})</span></td>
        <td><span class="tier-pill" style="background:transparent;border:none;padding:0">${p.tier}</span></td>
        <td class="mono"><span class="points-value ${window.ifwlPointsBandClass(p.licencePoints)}" style="font-size:15px;display:inline">${p.licencePoints}</span></td>
        <td>${platformLabel}</td>
        <td>${statusBits.join(' &middot; ') || '-'}</td>
        <td class="mono">${pcLapsCell}</td>
        <td class="mono">${consoleLapsCell}</td>
        <td class="mono">${stats ? (stats.overallScore ?? '-') : '-'}</td>
        <td class="mono">${stats?.consistencyAvg != null ? stats.consistencyAvg + '%' : '-'}</td>
        <td class="mono">${stats?.riskAvg != null ? stats.riskAvg + '%' : '-'}</td>
      </tr>
      <tr class="licdb-detail-row hidden" id="licdbDetail${p.discordId}"><td colspan="12" class="empty">Loading detail&hellip;</td></tr>`;
    }).join('');

    body.querySelectorAll('.licdb-row-check').forEach(cb => cb.addEventListener('change', () => {
      if(cb.checked) licDbSelected.add(cb.dataset.id); else licDbSelected.delete(cb.dataset.id);
      updateLicDbBulkToolbar();
    }));
    updateLicDbBulkToolbar();

    body.querySelectorAll('[data-licdb-expand]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.licdbExpand;
      const detailRow = q(`licdbDetail${id}`);
      const isHidden = detailRow.classList.contains('hidden');
      if(!isHidden){ detailRow.classList.add('hidden'); btn.innerHTML = '&#9660;'; return; }
      detailRow.classList.remove('hidden');
      btn.innerHTML = '&#9650;';
      detailRow.querySelector('td').innerHTML = 'Loading detail&hellip;';
      try{
        const full = await staffFetchProfile(id);
        const history = (full.tierHistory || []).slice(-5).reverse()
          .map(h => `${h.tier} &mdash; ${h.reason || 'No reason given'} <span class="field-hint">(${h.staffName ? 'staff: ' + h.staffName : (h.setBy || '-')}, ${new Date(h.dateMs || 0).toLocaleDateString()})</span>`)
          .join('<br>');
        detailRow.querySelector('td').innerHTML = `
          <strong>ACC name(s):</strong> ${(full.accDriverNames || []).join(', ') || 'None linked'}<br>
          <strong>Race team:</strong> ${full.teamName || '-'}<br>
          <strong>Bio:</strong> ${full.bio || '-'}<br>
          <strong>Recent tier history:</strong><br>${history || 'No changes on record'}
        `;
      }catch(e){ detailRow.querySelector('td').innerHTML = `Could not load: ${e.message}`; }
    }));
  }

  // ✅ ADDED: keeps the bulk toolbar (count + button enabled state) and the
  // header "select all" checkbox in sync with licDbSelected, called after
  // every render and every checkbox change.
  function updateLicDbBulkToolbar(){
    const n = licDbSelected.size;
    const countEl = q('licDbSelectCount');
    if(countEl) countEl.textContent = n === 1 ? '1 selected' : `${n} selected`;
    const resetBtn = q('licDbBulkResetBtn'), msgBtn = q('licDbBulkMessageBtn');
    if(resetBtn) resetBtn.disabled = n === 0;
    if(msgBtn) msgBtn.disabled = n === 0;
    const selectAll = q('licDbSelectAll');
    const rowChecks = [...document.querySelectorAll('.licdb-row-check')];
    if(selectAll) selectAll.checked = rowChecks.length > 0 && rowChecks.every(cb => cb.checked);
  }

  q('licDbSelectAll')?.addEventListener('change', (e) => {
    document.querySelectorAll('.licdb-row-check').forEach(cb => {
      cb.checked = e.target.checked;
      if(e.target.checked) licDbSelected.add(cb.dataset.id); else licDbSelected.delete(cb.dataset.id);
    });
    updateLicDbBulkToolbar();
  });

  // ✅ ADDED: "Reset points to 0 for selected" - Owner/Ops Manager only
  // (staffLicenceBulkResetPoints in index.js enforces this server-side too;
  // the button is additionally hidden from non-Ops staff via ops-only-tab).
  q('licDbBulkResetBtn')?.addEventListener('click', async () => {
    const ids = [...licDbSelected];
    if(!ids.length) return;
    const names = ids.map(id => licDbProfiles.find(p => p.discordId === id)?.name || id).slice(0, 8).join(', ') + (ids.length > 8 ? `, +${ids.length - 8} more` : '');
    if(!confirm(`Reset licence points to 0 for ${ids.length} driver(s)?\n\n${names}\n\nThis is logged in each driver's points history and cannot be undone from here.`)) return;
    const btn = q('licDbBulkResetBtn');
    btn.disabled = true; btn.textContent = 'Resetting...';
    try{
      const result = await staffBulkResetPoints(ids);
      (result.reset || []).forEach(id => {
        const p = licDbProfiles.find(x => x.discordId === id);
        if(p) p.licencePoints = 0;
      });
      licDbSelected.clear();
      renderLicDbTable();
      if((result.failed || []).length) alert(`${result.failed.length} driver(s) could not be reset:\n` + result.failed.map(f => `${f.driverId}: ${f.error}`).join('\n'));
    }catch(e){ alert('Could not reset points: ' + e.message); }
    finally{ btn.disabled = false; btn.textContent = 'Reset points to 0 for selected'; }
  });

  // ✅ ADDED: "Message selected" - Owner/Ops Manager or Head Moderator (see
  // staffLicenceBulkMessage in index.js and staffSendSelected above). Reuses
  // the same inline compose-box pattern as the Head Moderator area
  // (headModComposeBox) rather than a separate modal component.
  q('licDbBulkMessageBtn')?.addEventListener('click', () => {
    const ids = [...licDbSelected];
    if(!ids.length) return;
    q('licDbBulkComposeTitle').textContent = `Message ${ids.length} selected driver${ids.length === 1 ? '' : 's'}`;
    q('licDbBulkSubject').value = '';
    q('licDbBulkText').value = '';
    q('licDbBulkAllowReplies').checked = false;
    q('licDbBulkComposeStatus').textContent = '';
    q('licDbBulkComposeBox').classList.remove('hidden');
    q('licDbBulkComposeBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  q('licDbBulkComposeCancelBtn')?.addEventListener('click', () => q('licDbBulkComposeBox').classList.add('hidden'));
  q('licDbBulkComposeSendBtn')?.addEventListener('click', async () => {
    const ids = [...licDbSelected];
    const subject = q('licDbBulkSubject').value.trim();
    const text = q('licDbBulkText').value.trim();
    const allowReplies = q('licDbBulkAllowReplies').checked;
    const statusEl = q('licDbBulkComposeStatus');
    if(!ids.length){ statusEl.textContent = 'Nothing selected.'; return; }
    if(!subject || !text){ statusEl.textContent = 'Subject and message are both required.'; return; }
    const btn = q('licDbBulkComposeSendBtn');
    btn.disabled = true; statusEl.textContent = 'Sending...';
    try{
      const result = await window.IFWL_InboxAPI.staffSendSelected(ids, subject, text, allowReplies);
      statusEl.textContent = `Sent to ${result.sentTo} driver(s).` + ((result.missing || []).length ? ` (${result.missing.length} not found)` : '');
      licDbSelected.clear();
      renderLicDbTable();
      setTimeout(() => q('licDbBulkComposeBox').classList.add('hidden'), 1500);
    }catch(e){ statusEl.textContent = 'Could not send: ' + e.message; }
    finally{ btn.disabled = false; }
  });

  q('licDbSearch')?.addEventListener('input', renderLicDbTable);
  q('licDbFilter')?.addEventListener('change', renderLicDbTable);
  q('licDbRefreshBtn')?.addEventListener('click', renderLicenceDatabase);
  q('licDbLoadStatsBtn')?.addEventListener('click', async () => {
    const btn = q('licDbLoadStatsBtn');
    btn.disabled = true;
    const linkedProfiles = licDbProfiles.filter(p => (p.accDriverNames || []).length);
    let done = 0;
    for(const p of linkedProfiles){
      btn.textContent = `Loading stats... (${++done}/${linkedProfiles.length})`;
      try{
        const stats = await window.IFWLStats.computeForDriver(p.accDriverNames);
        licDbStatsMap.set(p.discordId, stats);
      }catch(e){ /* one driver failing shouldn't block the rest */ }
    }
    licDbStatsLoaded = true;
    q('licDbScoreHead').textContent = 'Overall (ranked)';
    btn.disabled = false;
    btn.textContent = 'Load full stats & rank by pace';
    renderLicDbTable();
  });

  // ---------- Staff: Manage Trophy Cabinet ----------
  let staffTrophyEntries = [];
  let staffTrophyDesigns = [];
  let staffAchievementTrophies = [];

  async function renderStaffTrophyCabinet(){
    if(!window.IFWL_STAFF) return;
    staffTrophyDesigns = await window.IFWL_TrophyDesignAPI.fetchTrophyDesignCatalog();
    renderTrophyDesignList();
    populateAchvDesignSelect();
    staffTrophyEntries = await fetchTrophyCabinet();
    renderStaffTrophyCabinetList();
    initAchievementTrophyPanel();
  }

  function populateAchvDesignSelect(){
    const sel = q('achvDesignSelect');
    if(!sel) return;
    sel.innerHTML = '<option value="">Classic (built-in shape)</option>' +
      staffTrophyDesigns.map(d => `<option value="${d.id}">${d.title}</option>`).join('');
  }

  function achievementTrophyCardHtml(t){
    const img = t.trophyImageUrl ? `<img src="${t.trophyImageUrl}" alt="" style="width:44px;height:44px;object-fit:contain;border-radius:6px;background:#f7f8fa">` : '🏆';
    return `<div class="note-item" data-entry-id="${t.id}" style="display:flex;align-items:center;gap:12px">
      <div>${img}</div>
      <div style="flex:1">
        <strong>${t.title}</strong>
        <div class="field-hint">${t.driverName} (${t.licenceNumber})</div>
      </div>
      <button class="btn ghost" data-remove-achv="${t.id}">Delete</button>
    </div>`;
  }

  function renderAchievementTrophyList(){
    const wrap = q('achvList');
    if(!wrap) return;
    if(!staffAchievementTrophies.length){ wrap.innerHTML = '<div class="empty">No achievement trophies awarded yet.</div>'; return; }
    wrap.innerHTML = staffAchievementTrophies.map(achievementTrophyCardHtml).join('');
    wrap.querySelectorAll('[data-remove-achv]').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('Delete this achievement trophy? This cannot be undone.')) return;
      try{
        await window.IFWL_Api.apiPost('staffAchievementTrophyDelete', { entryId: btn.dataset.removeAchv });
        staffAchievementTrophies = staffAchievementTrophies.filter(t => t.id !== btn.dataset.removeAchv);
        renderAchievementTrophyList();
      }catch(e){ alert('Could not delete: ' + e.message); }
    }));
  }

  function initAchievementTrophyPanel(){
    const picker = q('achvDriverPicker');
    if(picker && !picker.dataset.wired){
      picker.dataset.wired = '1';
      wireTrophyDriverPicker(picker, { multi: true });
    }

    q('achvAwardBtn')?.addEventListener('click', async () => {
      let selected = [];
      try{ selected = JSON.parse(picker?.dataset.multiSelected || '[]'); }catch{}
      const discordIds = selected.map(d => d.discordId);
      const title = q('achvTitle').value.trim();
      const designId = q('achvDesignSelect').value;
      const status = q('achvSaveStatus');

      if(!discordIds.length){ if(status) status.textContent = 'Pick at least one driver first.'; return; }
      if(!title){ if(status) status.textContent = 'An achievement title is required.'; return; }

      if(status) status.textContent = `Awarding to ${discordIds.length} driver${discordIds.length===1?'':'s'}...`;
      try{
        // ✅ CHANGED: awards to every selected driver in one request now -
        // the backend returns a `results` array (one entry per driver) so
        // a whole race team can be given the same trophy in one go.
        const result = await window.IFWL_Api.apiPost('staffAchievementTrophySave', { discordIds, title, designId });
        (result.results || [result]).forEach(r => staffAchievementTrophies.unshift(r));
        renderAchievementTrophyList();
        if(status){
          const notFoundNote = result.notFoundCount ? ` (${result.notFoundCount} driver(s) not found)` : '';
          status.textContent = `Awarded to ${result.awardedCount || (result.results || [result]).length} driver(s)!${notFoundNote}`;
          setTimeout(()=>{ if(q('achvSaveStatus')) q('achvSaveStatus').textContent=''; }, 2500);
        }
        q('achvTitle').value = '';
        q('achvDesignSelect').value = '';
        q('achvDriverSearch').value = '';
        picker.dataset.multiSelected = '[]';
        picker.dataset.discordId = '';
        q('achvDriverSelected').innerHTML = '<span class="field-hint">None selected</span>';
      }catch(e){
        if(status) status.textContent = 'Error: ' + e.message;
      }
    });

    window.IFWL_Api.apiGet('staffAchievementTrophyList').then(data => {
      staffAchievementTrophies = data.trophies || [];
      renderAchievementTrophyList();
    }).catch(e => console.warn('Could not load achievement trophies', e));
  }

  function renderTrophyDesignList(){
    const wrap = q('tdList');
    if(!wrap) return;
    if(!staffTrophyDesigns.length){ wrap.innerHTML = '<div class="empty">No trophy designs yet - upload one above.</div>'; return; }
    wrap.innerHTML = staffTrophyDesigns.map((d,i) => `
      <div class="note-item" data-idx="${i}">
        <img src="${d.url}" alt="" style="width:100%;max-width:160px;height:100px;object-fit:contain;border-radius:8px;display:block;margin-bottom:8px;background:#f7f8fa">
        <strong>${d.title}</strong>
        <div style="margin-top:8px"><button class="btn ghost" data-remove-design="${i}">Delete</button></div>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-remove-design]').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('Delete this trophy design? Events currently using it keep their existing image (already snapshotted), but it will no longer be pickable for new placements.')) return;
      const idx = Number(btn.dataset.removeDesign);
      const updated = staffTrophyDesigns.filter((_,i) => i !== idx);
      try{ staffTrophyDesigns = await window.IFWL_TrophyDesignAPI.saveTrophyDesignCatalog(updated); renderTrophyDesignList(); }
      catch(e){ alert('Could not delete: ' + e.message); }
    }));
  }

  q('tdUploadInput')?.addEventListener('change', async e => {
    const file = e.target.files[0]; if(!file) return;
    const title = q('tdTitle').value.trim() || 'Trophy Design';
    q('tdSaveStatus').textContent = 'Uploading...';
    try{
      const { url } = await window.IFWL_UploadAPI.uploadLicenceImage(file, 'trophy');
      staffTrophyDesigns.push({ id: 'td_' + Date.now(), title, url });
      staffTrophyDesigns = await window.IFWL_TrophyDesignAPI.saveTrophyDesignCatalog(staffTrophyDesigns);
      q('tdTitle').value = '';
      e.target.value = '';
      q('tdSaveStatus').textContent = 'Added.';
      renderTrophyDesignList();
      renderStaffTrophyCabinetList(); // refresh dropdowns everywhere with the new option
      setTimeout(()=>{ if(q('tdSaveStatus')) q('tdSaveStatus').textContent=''; }, 2000);
    }catch(err){ q('tdSaveStatus').textContent = err.message; }
  });

  function trophyDesignSelectHtml(place, p){
    const currentId = p?.designId || '';
    const options = staffTrophyDesigns.map(d => `<option value="${d.id}" ${d.id === currentId ? 'selected' : ''}>${d.title}</option>`).join('');
    return `<select class="tdp-design-select" data-place="${place}" style="margin-top:8px">
      <option value="" ${!currentId ? 'selected' : ''}>Classic (built-in shape)</option>
      ${options}
    </select>`;
  }

  function trophyPickerBlockHtml(place, label, emoji, p){
    return `<div class="trophy-driver-picker" data-place="${place}" data-discord-id="${p?.discordId || ''}">
      <label>${emoji} ${label}</label>
      <input type="text" class="tdp-search" placeholder="Search driver by name or licence number...">
      <div class="tdp-selected">${p ? `${p.name} (${p.licenceNumber})` : 'None selected'}</div>
      <div class="ticket-picker-results hidden"></div>
      ${trophyDesignSelectHtml(place, p)}
    </div>`;
  }

  function trophyEntryCardHtml(e){
    return `<div class="trophy-entry-card" data-entry-id="${e.id || ''}">
      <div class="trophy-entry-head">
        <input type="text" class="trophy-event-name" value="${String(e.eventName || '').replace(/"/g,'&quot;')}" placeholder="Event name (e.g. Season 3 PC Pro-Am Championship)">
        <input type="number" class="trophy-event-order" value="${e.order || 0}" style="width:90px" title="Lower numbers show first in the cabinet">
      </div>
      <div class="trophy-driver-pickers">
        ${trophyPickerBlockHtml('gold', 'Gold (1st)', '🥇', e.gold)}
        ${trophyPickerBlockHtml('silver', 'Silver (2nd)', '🥈', e.silver)}
        ${trophyPickerBlockHtml('bronze', 'Bronze (3rd)', '🥉', e.bronze)}
      </div>
      <div class="save-row" style="margin-top:14px">
        <button class="btn purple trophy-save-btn" type="button">Save</button>
        <button class="btn ghost trophy-delete-btn" type="button">Delete</button>
        <span class="save-status trophy-status"></span>
      </div>
    </div>`;
  }

  function wireTrophyDriverPicker(pickerEl, opts){
    // ✅ ADDED: optional multi-select mode, used only by the Achievement
    // Trophy award panel (race teams need up to ~15 drivers picked at once).
    // The Trophy Cabinet's gold/silver/bronze pickers never pass { multi:
    // true }, so their single-driver behaviour below is completely
    // unchanged.
    const multi = !!(opts && opts.multi);
    const searchInput = pickerEl.querySelector('.tdp-search');
    const resultsEl = pickerEl.querySelector('.ticket-picker-results');
    const selectedEl = pickerEl.querySelector('.tdp-selected');
    let searchTimer = null;

    function closeResults(){ resultsEl.classList.add('hidden'); resultsEl.innerHTML = ''; }

    function getMultiSelected(){
      try{ return JSON.parse(pickerEl.dataset.multiSelected || '[]'); }catch{ return []; }
    }
    function setMultiSelected(list){
      pickerEl.dataset.multiSelected = JSON.stringify(list);
      if(!list.length){ selectedEl.innerHTML = '<span class="field-hint">None selected</span>'; return; }
      selectedEl.innerHTML = list.map(d => `<span class="tdp-chip">${String(d.name).replace(/</g,'&lt;')} (${d.licenceNumber||'-'})<button type="button" class="tdp-chip-x" data-chip-x="${d.discordId}" aria-label="Remove">&times;</button></span>`).join('');
      selectedEl.querySelectorAll('[data-chip-x]').forEach(btn => btn.addEventListener('click', () => {
        setMultiSelected(getMultiSelected().filter(d => d.discordId !== btn.dataset.chipX));
      }));
    }
    if(multi) setMultiSelected(getMultiSelected());

    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const term = searchInput.value.trim();
      if(!term){ closeResults(); return; }
      searchTimer = setTimeout(async () => {
        try{
          const data = await window.IFWL_Api.apiGet('staffLicenceSearch', `&q=${encodeURIComponent(term)}`);
          const drivers = (data.drivers || []).slice(0, 15);
          resultsEl.innerHTML = '';
          if(!drivers.length){
            resultsEl.innerHTML = '<div class="no-results">No matches</div>';
          }else{
            drivers.forEach(d => {
              const item = document.createElement('div');
              item.className = 'result-item';
              item.innerHTML = `<div>${d.name}</div><div class="result-meta">${d.licenceNumber || ''}</div>`;
              item.addEventListener('click', () => {
                if(multi){
                  const current = getMultiSelected();
                  if(!current.some(x => x.discordId === d.discordId)){
                    current.push({ discordId: d.discordId, name: d.name, licenceNumber: d.licenceNumber || '' });
                    setMultiSelected(current);
                  }
                  searchInput.value = '';
                  closeResults();
                  searchInput.focus();
                }else{
                  pickerEl.dataset.discordId = d.discordId;
                  selectedEl.textContent = `${d.name} (${d.licenceNumber || '-'})`;
                  searchInput.value = '';
                  closeResults();
                }
              });
              resultsEl.appendChild(item);
            });
          }
          resultsEl.classList.remove('hidden');
        }catch(e){ console.warn('Trophy driver search failed', e); }
      }, 250);
    });

    document.addEventListener('click', (e) => {
      if(!pickerEl.contains(e.target)) closeResults();
    });
  }

  function wireTrophyEntryCard(card){
    card.querySelectorAll('.trophy-driver-picker').forEach(wireTrophyDriverPicker);

    const statusEl = card.querySelector('.trophy-status');

    card.querySelector('.trophy-save-btn').addEventListener('click', async () => {
      const entryId = card.dataset.entryId || '';
      const eventName = card.querySelector('.trophy-event-name').value.trim();
      const order = Number(card.querySelector('.trophy-event-order').value || 0);
      if(!eventName){
        statusEl.textContent = 'Event name is required.'; statusEl.className = 'save-status trophy-status error'; return;
      }
      const getDiscordId = (place) => card.querySelector(`.trophy-driver-picker[data-place="${place}"]`).dataset.discordId || '';
      const getDesignId = (place) => card.querySelector(`.tdp-design-select[data-place="${place}"]`)?.value || '';

      statusEl.textContent = 'Saving...'; statusEl.className = 'save-status trophy-status';
      try{
        const result = await window.IFWL_Api.apiPost('staffTrophyCabinetSave', {
          entryId,
          eventName,
          order,
          goldDiscordId: getDiscordId('gold'),
          silverDiscordId: getDiscordId('silver'),
          bronzeDiscordId: getDiscordId('bronze'),
          goldDesignId: getDesignId('gold'),
          silverDesignId: getDesignId('silver'),
          bronzeDesignId: getDesignId('bronze')
        });
        card.dataset.entryId = result.id;
        statusEl.textContent = 'Saved.'; statusEl.className = 'save-status trophy-status success';
        renderTrophyCabinetEntries(await fetchTrophyCabinet()); // keep the public preview in sync
      }catch(e){
        statusEl.textContent = 'Error: ' + e.message; statusEl.className = 'save-status trophy-status error';
      }
    });

    card.querySelector('.trophy-delete-btn').addEventListener('click', async () => {
      const entryId = card.dataset.entryId || '';
      if(!entryId){ card.remove(); return; }
      if(!confirm('Delete this trophy entry? This cannot be undone.')) return;
      statusEl.textContent = 'Deleting...'; statusEl.className = 'save-status trophy-status';
      try{
        await window.IFWL_Api.apiPost('staffTrophyCabinetDelete', { entryId });
        card.remove();
        renderTrophyCabinetEntries(await fetchTrophyCabinet());
      }catch(e){
        statusEl.textContent = 'Error: ' + e.message; statusEl.className = 'save-status trophy-status error';
      }
    });
  }

  function renderStaffTrophyCabinetList(){
    const body = q('staffTrophyCabinetBody');
    if(!body) return;
    if(!staffTrophyEntries.length){
      body.innerHTML = '<div class="empty">No events yet - click "+ Add New Event" to create one.</div>';
      return;
    }
    body.innerHTML = staffTrophyEntries.map(trophyEntryCardHtml).join('');
    body.querySelectorAll('.trophy-entry-card').forEach(wireTrophyEntryCard);
  }

  q('trophyAddEntryBtn')?.addEventListener('click', () => {
    const body = q('staffTrophyCabinetBody');
    if(body.querySelector('.empty')) body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.innerHTML = trophyEntryCardHtml({ id: '', eventName: '', order: 0, gold: null, silver: null, bronze: null });
    const card = wrap.firstElementChild;
    body.prepend(card);
    wireTrophyEntryCard(card);
  });

  function csPlatformCardHtml(platform, label, cfg){
    return `<div class="cs-platform-card" data-platform="${platform}">
      <h4>${label}</h4>
      <div class="field-group"><label>Pro threshold (% gap to best)</label><input type="number" class="cs-proPct" step="0.1" value="${cfg.proPct}"></div>
      <div class="field-group"><label>Pro max drivers (blank = unlimited)</label><input type="number" class="cs-proMax" min="1" value="${cfg.proMax ?? ''}"></div>
      <div class="field-group"><label>Amateur threshold (% gap to best)</label><input type="number" class="cs-amPct" step="0.1" value="${cfg.amPct}"></div>
      <div class="field-group"><label>Amateur max drivers (blank = unlimited)</label><input type="number" class="cs-amMax" min="1" value="${cfg.amMax ?? ''}"></div>
      <div class="field-group">
        <label>Rookie Class cutoff (% gap to best)</label>
        <div style="display:flex;gap:10px">
          <input type="number" class="cs-cutoffPct" step="0.1" value="${cfg.cutoffPct}" style="flex:1">
          <button type="button" class="btn ghost cs-suggest-btn">Suggest from data</button>
        </div>
        <div class="field-hint cs-suggest-hint"></div>
      </div>
      <div class="cs-preview"><div class="empty">Loading preview&hellip;</div></div>
      <button class="btn teal cs-save-btn" type="button" style="margin-top:12px">Save ${label}</button>
      <span class="save-status cs-save-status" style="margin-left:8px"></span>
    </div>`;
  }

  function csReadFormValues(card){
    const num = (sel) => { const v = card.querySelector(sel).value; return v === '' ? null : Number(v); };
    return {
      proPct: num('.cs-proPct') ?? 2,
      proMax: num('.cs-proMax'),
      amPct: num('.cs-amPct') ?? 5,
      amMax: num('.cs-amMax'),
      cutoffMode: 'manual',
      cutoffPct: num('.cs-cutoffPct') ?? 15
    };
  }

  async function csRenderPreview(card, serverId){
    const preview = card.querySelector('.cs-preview');
    preview.innerHTML = '<div class="empty">Calculating&hellip;</div>';
    try{
      const cfg = csReadFormValues(card);
      const standings = await window.IFWLStats.computeLicenceServerStandings({ minLaps: 0, serverId, classStructure: cfg , qualWindow: await window.fetchQualWindowMs()});
      const counts = { 'GT3 Pro':0, 'GT3 Amateur':0, 'GT3 Beginner':0, 'Rookie Class':0 };
      standings.forEach(s => { counts[s.recommendedTier] = (counts[s.recommendedTier]||0) + 1; });
      preview.innerHTML = `
        <div class="cs-preview-row"><span>🥇 Pro</span><strong>${counts['GT3 Pro']}${cfg.proMax != null ? ' / ' + cfg.proMax : ''}</strong></div>
        <div class="cs-preview-row"><span>🥈 Amateur</span><strong>${counts['GT3 Amateur']}${cfg.amMax != null ? ' / ' + cfg.amMax : ''}</strong></div>
        <div class="cs-preview-row"><span>🥉 Beginner</span><strong>${counts['GT3 Beginner']}</strong></div>
        <div class="cs-preview-row rookie"><span>🌱 Rookie Class</span><strong>${counts['Rookie Class']}</strong></div>
        <div class="field-hint" style="margin-top:6px">${standings.length} driver(s) with any laps on this server</div>
      `;
    }catch(e){
      preview.innerHTML = `<div class="empty">Could not calculate preview: ${e.message}</div>`;
    }
  }

  async function csSuggestCutoff(card, serverId){
    const hint = card.querySelector('.cs-suggest-hint');
    hint.textContent = 'Calculating suggestion...';
    try{
      const cfg = csReadFormValues(card);
      // Suggest based on the pool that WOULD be Beginner under the current
      // Pro/Am settings, with no cutoff applied yet - the 85th percentile of
      // their gap% is a reasonable "most of this group sits inside this,
      // beyond it is a clear outlier" line, not an arbitrary flat multiplier.
      const standings = await window.IFWLStats.computeLicenceServerStandings({ minLaps: 0, serverId, classStructure: { ...cfg, cutoffPct: 100000 } , qualWindow: await window.fetchQualWindowMs()});
      const beginnerGaps = standings.filter(s => s.recommendedTier === 'GT3 Beginner' && s.avgGapPct != null).map(s => s.avgGapPct).sort((a,b)=>a-b);
      if(!beginnerGaps.length){
        hint.textContent = 'Not enough data yet to suggest a cutoff.';
        return;
      }
      const idx = Math.min(beginnerGaps.length - 1, Math.floor(beginnerGaps.length * 0.85));
      const suggested = Math.round(beginnerGaps[idx] * 10) / 10;
      card.querySelector('.cs-cutoffPct').value = suggested;
      hint.textContent = `Suggested ${suggested}% - the 85th percentile gap among drivers who'd otherwise be Beginner (${beginnerGaps.length} driver(s) in that pool). Adjust freely, then Save.`;
      csRenderPreview(card, serverId);
    }catch(e){
      hint.textContent = 'Could not calculate a suggestion: ' + e.message;
    }
  }

  function initClassStructurePanel(){
    if(!window.IFWL_OWNER) return;
    const container = q('csPlatformCards');
    if(!container) return;

    window.fetchClassStructureConfig().then(cfg => {
      container.innerHTML =
        csPlatformCardHtml('pc', 'PC', cfg.pc) +
        csPlatformCardHtml('console', 'Console', cfg.console);

      container.querySelectorAll('.cs-platform-card').forEach(card => {
        const platform = card.dataset.platform;
        const serverId = platform === 'console' ? 'console-licence' : 'pc-licence';

        csRenderPreview(card, serverId);

        let debounceTimer = null;
        card.querySelectorAll('.cs-proPct, .cs-proMax, .cs-amPct, .cs-amMax, .cs-cutoffPct').forEach(input => {
          input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => csRenderPreview(card, serverId), 500);
          });
        });

        card.querySelector('.cs-suggest-btn').addEventListener('click', () => csSuggestCutoff(card, serverId));

        card.querySelector('.cs-save-btn').addEventListener('click', async () => {
          const statusEl = card.querySelector('.cs-save-status');
          const values = csReadFormValues(card);
          statusEl.textContent = 'Saving...';
          try{
            await window.IFWL_Api.apiPost('staffSeasonClassStructureSave', { [platform]: values });
            window.invalidateClassStructureCache();
            statusEl.textContent = 'Saved.';
            setTimeout(() => { statusEl.textContent = ''; }, 1500);
          }catch(e){
            statusEl.textContent = 'Error: ' + e.message;
          }
        });
      });
    }).catch(e => {
      container.innerHTML = `<div class="empty">Could not load season class structure: ${e.message}</div>`;
    });
  }

  function seMonthDayToStr(m, d){ return `${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  function seParseMonthDay(str, fallbackM, fallbackD){
    const m = String(str||'').match(/^(\d{1,2})-(\d{1,2})$/);
    if(!m) return { month: fallbackM, day: fallbackD };
    return { month: Math.max(1, Math.min(12, Number(m[1]))), day: Math.max(1, Math.min(31, Number(m[2]))) };
  }

  function seOverlaySlotHtml(e, context, label){
    const urlField = context === 'directory' ? 'directoryImageUrl' : 'mainImageUrl';
    const glowField = context === 'directory' ? 'directoryGlow' : 'mainGlow';
    const url = e[urlField];
    const glow = e[glowField];
    return `<div style="flex:1;min-width:200px">
      <label style="display:block;font-size:11px;text-transform:uppercase;color:var(--text-dim);margin-bottom:6px">${label}</label>
      <div class="se-preview-wrap">${url ? `<img src="${url}" class="se-preview-img">` : '<div class="field-hint">No image uploaded yet</div>'}</div>
      <input type="file" class="se-${context}-upload" accept="image/png,image/jpeg,image/webp" style="margin-top:6px">
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:6px"><input type="checkbox" class="se-${context}-glow" ${glow ? 'checked' : ''} style="width:auto"> Glow / twinkle</label>
    </div>`;
  }

  function seEventRowHtml(e, idx){
    return `<div class="se-event-row" data-index="${idx}">
      <div class="field-group"><label>Name</label><input type="text" class="se-name" value="${(e.name||'').replace(/"/g,'&quot;')}"></div>
      <div style="display:flex;gap:10px">
        <div class="field-group" style="flex:1"><label>Start (MM-DD)</label><input type="text" class="se-start" value="${seMonthDayToStr(e.startMonth, e.startDay)}" placeholder="MM-DD"></div>
        <div class="field-group" style="flex:1"><label>End (MM-DD)</label><input type="text" class="se-end" value="${seMonthDayToStr(e.endMonth, e.endDay)}" placeholder="MM-DD"></div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">
        ${seOverlaySlotHtml(e, 'main', 'Licence Main (My Licence card)')}
        ${seOverlaySlotHtml(e, 'directory', 'Licence Directory (Driver Directory cards)')}
      </div>
      <div class="se-toggles">
        <label><input type="checkbox" class="se-enabled" ${e.enabled !== false ? 'checked' : ''} style="width:auto"> Enabled</label>
        <label><input type="checkbox" class="se-force" ${e.forceShow ? 'checked' : ''} style="width:auto"> Force show (ignore date range)</label>
      </div>
      <button class="btn ghost se-remove-btn" type="button" style="margin-top:8px">Remove</button>
      <span class="save-status se-row-status" style="margin-left:8px"></span>
    </div>`;
  }

  async function renderSeasonalEventsPanel(){
    if(!window.IFWL_OWNER) return;
    const list = q('seEventsList');
    if(!list) return;

    let events = await window.fetchSeasonalEventsConfig();

    // Persists the WHOLE list every time - used both by the explicit Save
    // All button and automatically right after any image upload, so an
    // uploaded overlay is never lost if someone navigates away before
    // remembering to hit Save.
    async function persistEvents(statusEl){
      if(statusEl) statusEl.textContent = 'Saving...';
      try{
        await window.IFWL_Api.apiPost('staffSeasonalEventsSave', { events });
        window.invalidateSeasonalEventsCache();
        window.applySeasonalOverlays?.();
        if(statusEl){ statusEl.textContent = 'Saved.'; setTimeout(() => { statusEl.textContent = ''; }, 1500); }
      }catch(e){
        if(statusEl) statusEl.textContent = 'Error: ' + e.message;
      }
    }

    function readRowIntoEvent(row, idx){
      const start = seParseMonthDay(row.querySelector('.se-start').value, 1, 1);
      const end = seParseMonthDay(row.querySelector('.se-end').value, 1, 1);
      events[idx] = {
        ...events[idx],
        name: row.querySelector('.se-name').value.trim() || 'Untitled Event',
        enabled: row.querySelector('.se-enabled').checked,
        forceShow: row.querySelector('.se-force').checked,
        startMonth: start.month, startDay: start.day,
        endMonth: end.month, endDay: end.day,
        mainGlow: row.querySelector('.se-main-glow').checked,
        directoryGlow: row.querySelector('.se-directory-glow').checked
      };
    }

    function redraw(){
      list.innerHTML = events.map((e, i) => seEventRowHtml(e, i)).join('') || '<div class="empty">No events yet - click "+ Add Event".</div>';

      list.querySelectorAll('.se-event-row').forEach(row => {
        const idx = Number(row.dataset.index);

        row.querySelector('.se-remove-btn').addEventListener('click', async () => {
          events.splice(idx, 1);
          redraw();
          await persistEvents();
        });

        ['main', 'directory'].forEach(context => {
          row.querySelector(`.se-${context}-upload`).addEventListener('change', async (ev) => {
            const file = ev.target.files[0];
            if(!file) return;
            const statusEl = row.querySelector('.se-row-status');
            statusEl.textContent = 'Uploading...';
            try{
              const { url } = await window.IFWL_UploadAPI.uploadLicenceImage(file, 'seasonalOverlay');
              events[idx][context === 'main' ? 'mainImageUrl' : 'directoryImageUrl'] = url;
              readRowIntoEvent(row, idx); // capture any other edits already made on this row before redrawing
              redraw();
              await persistEvents();
            }catch(e){
              statusEl.textContent = 'Upload failed: ' + e.message;
            }
          });
        });
      });
    }
    redraw();

    q('seAddEventBtn').onclick = () => {
      events.push({ id: 'event_' + Date.now(), name: 'New Event', enabled: true, forceShow: false, startMonth: 1, startDay: 1, endMonth: 1, endDay: 7, mainImageUrl: '', mainGlow: false, directoryImageUrl: '', directoryGlow: false });
      redraw();
    };

    q('seSaveAllBtn').onclick = async () => {
      list.querySelectorAll('.se-event-row').forEach(row => readRowIntoEvent(row, Number(row.dataset.index)));
      await persistEvents(q('seSaveStatus'));
    };
  }
  // ✅ ADDED: Raceday Info staff panel - structured composer
  let rdiEditingId = null;
  let rdiCachedInfos = [];
  let rdiScheduleRowCount = 0;
  let rdiEventsCache = [];
  let rdiVideoRowCount = 0;

  const RDI_QUALIFYING_DEFAULT = `Do not interfere with any car on a valid flying lap.
Overtaking is only permitted with clear mutual agreement (indicators or voice). If no agreement is made, the faster car must back off and create a gap.
Drivers preparing for laps must remain off the racing line and avoid blocking approaching cars.
If multiple cars are waiting off-line, approaching cars not on a flying lap must either join the queue or return to the pits.
Exit the pit lane safely and only when clear.

Note: All qualifying incidents will be reviewed under this rule alongside standard IFWL regulations.`;

  const RDI_FLAGS_DEFAULT = `Blue Flags:
* Allow faster cars to pass within 5 corners.
* Remain predictable and do not defend.

Yellow Flags:
* Slow down, do not overtake, and be prepared to stop.

Flashing Headlights:
* Maximum once per lap for a valid reason.
* Excessive or abusive use will result in penalties.`;

  const RDI_CONDUCT_DEFAULT = `* Respect all drivers - congratulate your competitors.
* No name-calling, swearing, or arguments.
* Submit incidents via Submit a Ticket.`;

  const RDI_SESSION_OPTS = ['Practice','Qualifying','Warm-up','Race','Race 1','Race 2'];
  const RDI_DURATION_OPTS = ['5 mins','10 mins','15 mins','20 mins','30 mins','45 mins','60 mins','90 mins','120 mins'];
  const rdiEsc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Bare numbers / "60 minutes" style values from older briefings map onto the
  // matching dropdown option instead of landing in "Other".
  function rdiNormDuration(v){
    const m = String(v || '').trim().match(/^(\d+)\s*(m|min|mins|minute|minutes)?$/i);
    return m ? m[1] + ' mins' : String(v || '').trim();
  }
  function rdiComboHtml(cls, opts, value, placeholder, otherPlaceholder){
    let v = String(value || '').trim();
    // case-insensitive match so older "PRACTICE" / "race" entries land on the
    // proper dropdown option instead of "Other..."
    const canon = opts.find(o => o.toLowerCase() === v.toLowerCase());
    if(canon) v = canon;
    const known = opts.includes(v);
    const isOther = !!v && !known;
    return `<div class="rdi-combo field-group" style="flex:1;margin:0;display:flex;flex-direction:column;gap:6px">
      <select class="${cls}">
        <option value=""${!v ? ' selected' : ''}>${rdiEsc(placeholder)}</option>
        ${opts.map(o => `<option value="${rdiEsc(o)}"${o === v ? ' selected' : ''}>${rdiEsc(o)}</option>`).join('')}
        <option value="__other"${isOther ? ' selected' : ''}>Other...</option>
      </select>
      <input type="text" class="${cls}-other${isOther ? '' : ' hidden'}" placeholder="${rdiEsc(otherPlaceholder)}" value="${isOther ? rdiEsc(v) : ''}">
    </div>`;
  }
  function rdiComboValue(row, cls){
    const sel = row.querySelector('.' + cls);
    if(!sel) return '';
    if(sel.value === '__other') return (row.querySelector('.' + cls + '-other')?.value || '').trim();
    return sel.value.trim();
  }
  function rdiScheduleRowHtml(idx, vals){
    vals = vals || {};
    return `<div class="note-item" data-schedule-idx="${idx}" style="display:flex;gap:10px;align-items:flex-start;padding:10px">
      ${rdiComboHtml('rdi-sched-session', RDI_SESSION_OPTS, vals.session, 'Session...', 'Session name')}
      ${rdiComboHtml('rdi-sched-duration', RDI_DURATION_OPTS, rdiNormDuration(vals.duration), 'Duration...', 'Duration (e.g. 12 hrs)')}
      <div class="field-group" style="flex:1;margin:0"><input type="text" class="rdi-sched-time" placeholder="Time (e.g. 19:50 GMT)" value="${rdiEsc(vals.time || '')}"></div>
      <button class="btn ghost" data-remove-schedule="${idx}" type="button">✕</button>
    </div>`;
  }
  function rdiVideoRowHtml(idx, val){
    return `<div class="note-item" data-video-idx="${idx}" style="display:flex;gap:10px;align-items:center;padding:10px">
      <input type="url" class="rdi-video-url" placeholder="https://youtu.be/..." value="${(val||'').replace(/"/g,'&quot;')}" style="flex:1">
      <button class="btn ghost" data-remove-video="${idx}" type="button">✕</button>
    </div>`;
  }

  function rdiAddScheduleRow(vals){
    const idx = rdiScheduleRowCount++;
    q('rdiScheduleRows').insertAdjacentHTML('beforeend', rdiScheduleRowHtml(idx, vals));
    // ✅ FIXED: q() only ever does getElementById - it can never match an
    // attribute selector like this, so these remove buttons were silently
    // never actually wired up (no error, since optional chaining swallowed
    // the null - just a button that did nothing when clicked).
    const rowEl = document.querySelector(`[data-schedule-idx="${idx}"]`);
    rowEl?.querySelector(`[data-remove-schedule="${idx}"]`)?.addEventListener('click', (e) => e.target.closest('[data-schedule-idx]').remove());
    rowEl?.querySelectorAll('.rdi-combo select').forEach(sel => sel.addEventListener('change', () => {
      const other = sel.parentElement.querySelector('input');
      other.classList.toggle('hidden', sel.value !== '__other');
      if(sel.value === '__other') other.focus();
    }));
  }
  function rdiAddVideoRow(val){
    const idx = rdiVideoRowCount++;
    q('rdiVideoRows').insertAdjacentHTML('beforeend', rdiVideoRowHtml(idx, val));
    document.querySelector(`[data-remove-video="${idx}"]`)?.addEventListener('click', (e) => e.target.closest('[data-video-idx]').remove());
  }
  q('rdiAddScheduleBtn')?.addEventListener('click', () => rdiAddScheduleRow());
  q('rdiAddVideoBtn')?.addEventListener('click', () => rdiAddVideoRow());

  q('rdiIncludeQualifying')?.addEventListener('change', function(){
    q('rdiQualifyingWrap').classList.toggle('hidden', !this.checked);
    if(this.checked && !q('rdiQualifyingText').value.trim()) q('rdiQualifyingText').value = RDI_QUALIFYING_DEFAULT;
  });
  q('rdiIncludeFlags')?.addEventListener('change', function(){
    q('rdiFlagsWrap').classList.toggle('hidden', !this.checked);
    if(this.checked && !q('rdiFlagsText').value.trim()) q('rdiFlagsText').value = RDI_FLAGS_DEFAULT;
  });
  q('rdiIncludeConduct')?.addEventListener('change', function(){
    q('rdiConductWrap').classList.toggle('hidden', !this.checked);
    if(this.checked && !q('rdiConductText').value.trim()) q('rdiConductText').value = RDI_CONDUCT_DEFAULT;
  });

  function rdiReadQuickFacts(){
    return {
      series: q('rdiSeries').value.trim(),
      track: q('rdiTrack').value.trim(),
      conditions: q('rdiConditions').value.trim(),
      serverName: q('rdiServerName').value.trim(),
      commentary: q('rdiCommentary').value,
      raceLength: q('rdiRaceLength').value.trim(),
      pitStopRule: q('rdiPitStopRule').value.trim(),
      fuelRule: q('rdiFuelRule').value.trim(),
      tyreRule: q('rdiTyreRule').value.trim()
    };
  }
  function rdiReadSchedule(){
    return [...q('rdiScheduleRows').querySelectorAll('[data-schedule-idx]')].map(row => ({
      session: rdiComboValue(row, 'rdi-sched-session'),
      duration: rdiComboValue(row, 'rdi-sched-duration'),
      time: row.querySelector('.rdi-sched-time').value.trim()
    })).filter(s => s.session);
  }
  function rdiReadVideos(){
    return [...q('rdiVideoRows').querySelectorAll('[data-video-idx]')].map(row => row.querySelector('.rdi-video-url').value.trim()).filter(Boolean);
  }

  // Composes everything into the same plain-text/markdown format the
  // driver-facing renderer already understands - the structured fields
  // above are just a friendlier way to build it than typing it by hand.
  function rdiComposeContent(){
    const qf = rdiReadQuickFacts();
    const parts = ['DRIVER BRIEFING', ''];
    if(qf.series) parts.push(`Series: ${qf.series}`);
    if(qf.track) parts.push(`Track: ${qf.track}${qf.conditions ? ' - ' + qf.conditions : ''}`);
    parts.push('');

    parts.push('## PRE-RACE');
    if(qf.serverName) parts.push(`* Server Name: ${qf.serverName}`);
    parts.push('* Password: see Racing > My Races > the password shown in that event\'s box on this site.');
    if(qf.commentary) parts.push(`* Commentary: ${qf.commentary === 'yes' ? 'Yes' : 'No'}`);
    parts.push('');

    const schedule = rdiReadSchedule();
    if(schedule.length){
      parts.push('## SCHEDULE');
      schedule.forEach(s => parts.push(`* ${s.session}: ${s.duration}${s.time ? ' - ' + s.time : ''}`));
      parts.push('');
    }

    if(q('rdiIncludeQualifying').checked && q('rdiQualifyingText').value.trim()){
      parts.push('## QUALIFYING');
      parts.push(q('rdiQualifyingText').value.trim());
      parts.push('');
    }

    if(qf.raceLength || qf.pitStopRule || qf.fuelRule || qf.tyreRule){
      parts.push('## RACE');
      if(qf.raceLength) parts.push(`* Race Length: ${qf.raceLength}`);
      if(qf.pitStopRule) parts.push(`* Pit Stop Rule: ${qf.pitStopRule}`);
      if(qf.fuelRule) parts.push(`* Fuel: ${qf.fuelRule}`);
      if(qf.tyreRule) parts.push(`* Tyres: ${qf.tyreRule}`);
      parts.push('');
    }

    if(q('rdiIncludeFlags').checked && q('rdiFlagsText').value.trim()){
      parts.push('## FLAGS AND DRIVER BEHAVIOUR');
      parts.push(q('rdiFlagsText').value.trim());
      parts.push('');
    }

    if(q('rdiIncludeConduct').checked && q('rdiConductText').value.trim()){
      parts.push('## POST-RACE CONDUCT');
      parts.push(q('rdiConductText').value.trim());
      parts.push('');
    }

    const guidance = q('rdiReminders').value.trim();
    if(guidance){
      parts.push(`## TRACK GUIDANCE${qf.track ? ' (' + qf.track.toUpperCase() + ')' : ''}`);
      parts.push(guidance);
      parts.push('');
    }

    parts.push('Good luck and enjoy the race.');
    parts.push('- IFWL Admin Team');
    // Video links deliberately not appended here as plain text - they're
    // rendered as real embedded players via renderVideoEmbeds() instead,
    // both in the staff preview and the driver popup. Including them here
    // too would just duplicate each one as a bare link underneath its own
    // embedded player.
    return parts.join('\n');
  }

  q('rdiPreviewBtn')?.addEventListener('click', () => {
    const box = q('rdiPreviewBox');
    box.classList.remove('hidden');
    const qf = rdiReadQuickFacts();
    box.innerHTML = rdiQuickFactsStripHtml(qf) + window.renderRacedayMarkdown(rdiComposeContent()) + window.renderVideoEmbeds(rdiReadVideos());
  });

  /* ---- Staff: Endurance Event (teams, races, entry fee) ---- */
  async function initEnduranceEventPanel(){
    const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

    function updateEndSplitHint(){
      const hint = q('endSplitHint');
      if(!hint) return;
      const total = ['endSplit1','endSplit2','endSplit3'].reduce((s, id) => s + (Number(q(id)?.value) || 0), 0);
      hint.textContent = total === 100 ? 'Splits add up to 100%.' : `⚠ Splits currently add up to ${total}% - doesn't have to be exactly 100, but usually should be.`;
      hint.style.color = total === 100 ? '' : '#f3c568';
    }
    ['endSplit1','endSplit2','endSplit3'].forEach(id => q(id)?.addEventListener('input', updateEndSplitHint));

    try{
      const cfg = await window.IFWL_EnduranceAPI.fetchConfig();
      q('endEntryFee').value = cfg.entryFeeGbp;
      q('endRefundable').value = cfg.refundable ? 'yes' : 'no';
      q('endPoolPercent').value = cfg.prizePoolPercent;
      const split = cfg.payoutSplit || [70, 30, 20];
      q('endSplit1').value = split[0] ?? 70;
      q('endSplit2').value = split[1] ?? 30;
      q('endSplit3').value = split[2] ?? 20;
      updateEndSplitHint();
    }catch(e){ q('endConfigStatus').textContent = 'Could not load: ' + e.message; }

    q('endConfigSaveBtn')?.addEventListener('click', async () => {
      const status = q('endConfigStatus');
      status.textContent = 'Saving...';
      try{
        await window.IFWL_EnduranceAPI.saveConfig({
          entryFeeGbp: Number(q('endEntryFee').value) || 0,
          refundable: q('endRefundable').value === 'yes',
          prizePoolPercent: Number(q('endPoolPercent').value) || 0,
          payoutSplit: [Number(q('endSplit1').value) || 0, Number(q('endSplit2').value) || 0, Number(q('endSplit3').value) || 0]
        });
        status.textContent = 'Saved - live on the endurance overview page now.';
        setTimeout(() => { if(q('endConfigStatus')) q('endConfigStatus').textContent = ''; }, 2500);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    });

    async function renderEndTeamList(){
      let teams = [];
      try{ teams = await window.IFWL_EnduranceAPI.fetchTeams(); }
      catch(e){ q('endTeamList').innerHTML = `<div class="empty">Could not load teams: ${escHtml(e.message)}</div>`; return; }
      q('endTeamList').innerHTML = teams.length ? teams.map(t => `
        <div class="note-item" data-team="${t.id}">
          <strong>${escHtml(t.name)}</strong>
          <div class="note-meta">
            <label style="margin-right:14px"><input type="checkbox" class="end-team-paid" ${t.paid ? 'checked' : ''} style="width:auto;vertical-align:middle"> Paid</label>
            <label><input type="checkbox" class="end-team-retired" ${t.retired ? 'checked' : ''} style="width:auto;vertical-align:middle"> Retired</label>
          </div>
          <div style="margin-top:8px"><button class="btn ghost" data-remove-team="${t.id}">Remove</button></div>
        </div>`).join('') : '<div class="empty">No teams registered yet.</div>';

      q('endTeamList').querySelectorAll('.end-team-paid, .end-team-retired').forEach(chk => chk.addEventListener('change', async (e) => {
        const row = e.target.closest('[data-team]');
        try{
          await window.IFWL_EnduranceAPI.saveTeam({
            teamId: row.dataset.team, name: row.querySelector('strong').textContent,
            paid: row.querySelector('.end-team-paid').checked, retired: row.querySelector('.end-team-retired').checked
          });
        }catch(err){ alert('Could not update: ' + err.message); await renderEndTeamList(); }
      }));
      q('endTeamList').querySelectorAll('[data-remove-team]').forEach(btn => btn.addEventListener('click', async () => {
        if(!confirm('Remove this team? This does not refund an entry fee.')) return;
        try{ await window.IFWL_EnduranceAPI.deleteTeam(btn.dataset.removeTeam); await renderEndTeamList(); }
        catch(e){ alert('Could not remove: ' + e.message); }
      }));
    }
    q('endTeamAddBtn')?.addEventListener('click', async () => {
      const name = q('endTeamName').value.trim();
      if(!name){ q('endTeamStatus').textContent = 'Team name required.'; return; }
      try{
        await window.IFWL_EnduranceAPI.saveTeam({ name, paid: q('endTeamPaid').checked, retired: q('endTeamRetired').checked });
        q('endTeamName').value = ''; q('endTeamPaid').checked = false; q('endTeamRetired').checked = false;
        q('endTeamStatus').textContent = 'Added.';
        setTimeout(() => { if(q('endTeamStatus')) q('endTeamStatus').textContent = ''; }, 2000);
        await renderEndTeamList();
      }catch(e){ q('endTeamStatus').textContent = 'Could not add: ' + e.message; }
    });
    await renderEndTeamList();

    async function renderEndRaceList(){
      let races = [];
      try{ races = await window.IFWL_EnduranceAPI.fetchRaces(); }
      catch(e){ q('endRaceList').innerHTML = `<div class="empty">Could not load races: ${escHtml(e.message)}</div>`; return; }
      q('endRaceList').innerHTML = races.length ? races.map(r => `
        <div class="note-item">
          <strong>${escHtml(r.name)}</strong>${r.commentated ? ' <span class="field-hint">🎙️ Commentated</span>' : ''}
          <div class="note-meta">${r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short', year:'numeric' }) : 'Date TBC'}</div>
          <div style="margin-top:8px"><button class="btn ghost" data-remove-race="${r.id}">Remove</button></div>
        </div>`).join('') : '<div class="empty">No races added yet.</div>';
      q('endRaceList').querySelectorAll('[data-remove-race]').forEach(btn => btn.addEventListener('click', async () => {
        if(!confirm('Remove this race?')) return;
        try{ await window.IFWL_EnduranceAPI.deleteRace(btn.dataset.removeRace); await renderEndRaceList(); }
        catch(e){ alert('Could not remove: ' + e.message); }
      }));
    }
    q('endRaceAddBtn')?.addEventListener('click', async () => {
      const name = q('endRaceName').value.trim();
      if(!name){ q('endRaceStatus').textContent = 'Race name required.'; return; }
      try{
        await window.IFWL_EnduranceAPI.saveRace({ name, date: q('endRaceDate').value, commentated: q('endRaceCommentated').checked });
        q('endRaceName').value = ''; q('endRaceDate').value = ''; q('endRaceCommentated').checked = false;
        q('endRaceStatus').textContent = 'Added.';
        setTimeout(() => { if(q('endRaceStatus')) q('endRaceStatus').textContent = ''; }, 2000);
        await renderEndRaceList();
      }catch(e){ q('endRaceStatus').textContent = 'Could not add: ' + e.message; }
    });
    await renderEndRaceList();
  }

  function rdiResetForm(){
    rdiEditingId = null;
    q('rdiTitle').value = '';
    ['rdiSeries','rdiTrack','rdiConditions','rdiServerName','rdiRaceLength','rdiPitStopRule','rdiFuelRule','rdiTyreRule','rdiReminders'].forEach(id => q(id).value = '');
    q('rdiCommentary').value = '';
    q('rdiScheduleRows').innerHTML = ''; rdiScheduleRowCount = 0;
    q('rdiVideoRows').innerHTML = ''; rdiVideoRowCount = 0;
    q('rdiIncludeQualifying').checked = false; q('rdiQualifyingWrap').classList.add('hidden'); q('rdiQualifyingText').value = '';
    q('rdiIncludeFlags').checked = false; q('rdiFlagsWrap').classList.add('hidden'); q('rdiFlagsText').value = '';
    q('rdiIncludeConduct').checked = false; q('rdiConductWrap').classList.add('hidden'); q('rdiConductText').value = '';
    q('rdiPreviewBox').classList.add('hidden');
    document.querySelectorAll('.rdi-event-check').forEach(el => el.checked = false);
    q('rdiSaveBtn').textContent = 'Save briefing';
    q('rdiCancelEditBtn').classList.add('hidden');
  }
  q('rdiCancelEditBtn')?.addEventListener('click', () => { rdiResetForm(); q('rdiSaveStatus').textContent = ''; });

  async function initRacedayInfoPanel(){
    if(!q('racedayInfoPanel')) return;

    // Event checkboxes - reuses the same SimGrid events list already
    // fetched for the events panel, so a briefing can be tied to any of
    // them without duplicating that data anywhere.
    const events = await window.IFWL_SimgridAPI.fetchAllSimgridEvents();
    rdiEventsCache = events || [];
    const checkBox = q('rdiEventChecks');
    checkBox.innerHTML = events.length
      ? events.map(e => `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px"><input type="checkbox" class="rdi-event-check" value="${e.id}" style="width:auto"> ${e.title}${e.eventDateMs ? ` <span class="field-hint">(${new Date(e.eventDateMs).toLocaleDateString()})</span>` : ''}</label>`).join('')
      : '<div class="empty">No active SimGrid events yet - add some under Staff SimGrid Events first.</div>';

    if(!rdiScheduleRowCount) rdiAddScheduleRow();
    if(!rdiVideoRowCount) rdiAddVideoRow();

    q('rdiSaveBtn').onclick = async () => {
      const title = q('rdiTitle').value.trim();
      const content = rdiComposeContent();
      const linkedEventIds = [...document.querySelectorAll('.rdi-event-check:checked')].map(el => el.value);
      if(!title){ q('rdiSaveStatus').textContent = 'A title is required.'; return; }
      q('rdiSaveStatus').textContent = rdiEditingId ? 'Updating...' : 'Saving...';
      try{
        await window.IFWL_Api.apiPost('staffRacedayInfoSave', {
          infoId: rdiEditingId || undefined,
          title, content, linkedEventIds,
          quickFacts: rdiReadQuickFacts(),
          schedule: rdiReadSchedule(),
          trackGuidance: [],
          videoLinks: rdiReadVideos(),
          sections: {
            includeQualifyingNotes: q('rdiIncludeQualifying').checked,
            qualifyingNotesText: q('rdiQualifyingText').value.trim(),
            includeFlagRules: q('rdiIncludeFlags').checked,
            flagRulesText: q('rdiFlagsText').value.trim(),
            includePostRaceConduct: q('rdiIncludeConduct').checked,
            postRaceConductText: q('rdiConductText').value.trim(),
            reminders: q('rdiReminders').value.trim()
          }
        });
        const wasEditing = !!rdiEditingId;
        rdiResetForm();
        q('rdiSaveStatus').textContent = wasEditing ? 'Updated.' : 'Saved.';
        await renderRacedayInfoList();
        setTimeout(() => { if(q('rdiSaveStatus')) q('rdiSaveStatus').textContent = ''; }, 2000);
      }catch(e){ q('rdiSaveStatus').textContent = 'Could not save: ' + e.message; }
    };

    await renderRacedayInfoList();
  }

  // Loads a saved briefing into the editor form. Used by Edit and Duplicate.
  // Old briefings stored track guidance as separate corner rows - those are
  // folded into the single Track Guidance box (corners first, then any old
  // reminders text) so nothing is lost when an old briefing is reopened.
  function rdiFillForm(info){
    rdiResetForm();
    q('rdiTitle').value = info.title;
    const qf = info.quickFacts || {};
    q('rdiSeries').value = qf.series || '';
    q('rdiTrack').value = qf.track || '';
    q('rdiConditions').value = qf.conditions || '';
    q('rdiServerName').value = qf.serverName || '';
    q('rdiCommentary').value = qf.commentary || '';
    q('rdiRaceLength').value = qf.raceLength || '';
    q('rdiPitStopRule').value = qf.pitStopRule || '';
    q('rdiFuelRule').value = qf.fuelRule || '';
    q('rdiTyreRule').value = qf.tyreRule || '';

    q('rdiScheduleRows').innerHTML = ''; rdiScheduleRowCount = 0;
    (info.schedule || []).forEach(s => rdiAddScheduleRow(s));
    if(!(info.schedule || []).length) rdiAddScheduleRow();

    q('rdiVideoRows').innerHTML = ''; rdiVideoRowCount = 0;
    (info.videoLinks || []).forEach(v => rdiAddVideoRow(v));
    if(!(info.videoLinks || []).length) rdiAddVideoRow();

    const sec = info.sections || {};
    q('rdiIncludeQualifying').checked = !!sec.includeQualifyingNotes;
    q('rdiQualifyingWrap').classList.toggle('hidden', !sec.includeQualifyingNotes);
    q('rdiQualifyingText').value = sec.qualifyingNotesText || '';
    q('rdiIncludeFlags').checked = !!sec.includeFlagRules;
    q('rdiFlagsWrap').classList.toggle('hidden', !sec.includeFlagRules);
    q('rdiFlagsText').value = sec.flagRulesText || '';
    q('rdiIncludeConduct').checked = !!sec.includePostRaceConduct;
    q('rdiConductWrap').classList.toggle('hidden', !sec.includePostRaceConduct);
    q('rdiConductText').value = sec.postRaceConductText || '';

    const cornerLines = (info.trackGuidance || []).filter(c => c && c.corner).map(c => `* ${c.corner}${c.description ? ': ' + c.description : ''}`);
    q('rdiReminders').value = [cornerLines.join('\n'), (sec.reminders || '').trim()].filter(Boolean).join('\n\n');
  }

  function rdiRenderList(){
    const wrap = q('rdiList');
    if(!wrap) return;
    const countEl = q('rdiListCount');
    if(!rdiCachedInfos.length){ wrap.innerHTML = '<div class="empty">No raceday briefings yet.</div>'; if(countEl) countEl.textContent = ''; return; }

    const evTitle = (id) => { const e = rdiEventsCache.find(x => x.id === id); return e ? e.title : null; };
    const term = (q('rdiSearch')?.value || '').trim().toLowerCase();
    const rows = rdiCachedInfos.map(info => {
      const titles = (info.linkedEventIds || []).map(evTitle).filter(Boolean);
      return { info, titles };
    }).filter(r => !term || String(r.info.title || '').toLowerCase().includes(term) || r.titles.some(t => String(t).toLowerCase().includes(term)));

    if(countEl) countEl.textContent = term ? `Showing ${rows.length} of ${rdiCachedInfos.length} briefings` : `${rdiCachedInfos.length} briefing(s)`;
    if(!rows.length){ wrap.innerHTML = '<div class="empty">No briefings match that search.</div>'; return; }

    wrap.innerHTML = rows.map(({ info, titles }) => {
      const n = (info.linkedEventIds || []).length;
      const shown = titles.slice(0, 3).map(rdiEsc).join(', ') + (titles.length > 3 ? ` +${titles.length - 3} more` : '');
      return `
      <div class="note-item">
        <strong>${rdiEsc(info.title)}</strong>
        <div class="note-meta">Linked to ${n} event(s)${shown ? ': ' + shown : ''}</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn ghost" data-edit-rdi="${rdiEsc(info.id)}">Edit</button>
          <button class="btn ghost" data-dup-rdi="${rdiEsc(info.id)}">Duplicate</button>
          <button class="btn ghost" data-delete-rdi="${rdiEsc(info.id)}">Delete</button>
        </div>
      </div>`;
    }).join('');

    wrap.querySelectorAll('[data-edit-rdi]').forEach(btn => btn.addEventListener('click', () => {
      const info = rdiCachedInfos.find(x => x.id === btn.dataset.editRdi);
      if(!info) return;
      rdiFillForm(info);
      rdiEditingId = info.id;
      document.querySelectorAll('.rdi-event-check').forEach(el => { el.checked = (info.linkedEventIds || []).includes(el.value); });
      q('rdiSaveBtn').textContent = `Update "${info.title}"`;
      q('rdiCancelEditBtn').classList.remove('hidden');
      q('rdiSaveStatus').textContent = 'Editing this briefing - saving updates it, doesn\'t create a new one.';
      q('racedayInfoPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    // Duplicate: loads everything into the form as a NEW briefing - not saved
    // yet, and deliberately NOT linked to any events, so it can never touch
    // the original's links. Staff change the title, tick the new event(s) and
    // press Save.
    wrap.querySelectorAll('[data-dup-rdi]').forEach(btn => btn.addEventListener('click', () => {
      const info = rdiCachedInfos.find(x => x.id === btn.dataset.dupRdi);
      if(!info) return;
      rdiFillForm(info);
      rdiEditingId = null;
      q('rdiTitle').value = info.title + ' (copy)';
      document.querySelectorAll('.rdi-event-check').forEach(el => { el.checked = false; });
      q('rdiSaveBtn').textContent = 'Save as new briefing';
      q('rdiCancelEditBtn').classList.remove('hidden');
      q('rdiSaveStatus').textContent = 'Copy of "' + info.title + '" - change the title, tick the event(s) it belongs to, then Save. The original is untouched.';
      q('racedayInfoPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      q('rdiTitle').focus();
      q('rdiTitle').select();
    }));

    wrap.querySelectorAll('[data-delete-rdi]').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('Delete this briefing? It will stop showing to drivers immediately.')) return;
      try{
        await window.IFWL_Api.apiPost('staffRacedayInfoDelete', { infoId: btn.dataset.deleteRdi });
        await renderRacedayInfoList();
      }catch(e){ alert('Could not delete: ' + e.message); }
    }));
  }

  async function renderRacedayInfoList(){
    const wrap = q('rdiList');
    if(!wrap) return;
    try{
      rdiCachedInfos = (await window.IFWL_Api.apiGet('staffRacedayInfoList')).infos || [];
    }catch(e){
      wrap.innerHTML = `<div class="empty">Could not load briefings: ${rdiEsc(e.message)}</div>`;
      return;
    }
    rdiRenderList();
  }
  q('rdiSearch')?.addEventListener('input', rdiRenderList);

  // ✅ CHANGED: Manage Affiliates staff panel - dynamic list instead of 5
  // fixed slots, matching the simplified rotating-array backend model.
  let aaRowCount = 0;

  function aaBannerRowHtml(idx, banner){
    banner = banner || {};
    return `<div class="aa-slot-card" data-row-idx="${idx}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h5 style="margin:0">Banner ${idx + 1}</h5>
        <button class="btn ghost" data-remove-banner="${idx}" type="button">✕ Remove</button>
      </div>
      <div class="se-preview-wrap">${banner.imageUrl ? `<img src="${banner.imageUrl}" class="se-preview-img">` : '<div class="field-hint">No image uploaded yet</div>'}</div>
      <input type="file" class="aa-upload" accept="image/png,image/jpeg,image/webp" style="margin:8px 0">
      <div class="field-group" style="margin-bottom:0"><label style="font-size:11px">Link URL</label><input type="url" class="aa-link" value="${(banner.linkUrl||'').replace(/"/g,'&quot;')}" placeholder="https://..."></div>
      <span class="save-status aa-slot-status"></span>
    </div>`;
  }

  function aaAddBannerRow(banner){
    const idx = aaRowCount++;
    q('aaSlots').insertAdjacentHTML('beforeend', aaBannerRowHtml(idx, banner));
    // ✅ FIXED: q() wraps getElementById, which only ever accepts a plain ID
    // string - passing it an attribute selector like this always returned
    // null, then crashed the moment .querySelector was called on it.
    const row = document.querySelector(`[data-row-idx="${idx}"]`);
    row.querySelector(`[data-remove-banner="${idx}"]`).addEventListener('click', () => row.remove());
    row.querySelector('.aa-upload').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if(!file) return;
      const statusEl = row.querySelector('.aa-slot-status');
      statusEl.textContent = 'Uploading...';
      try{
        const { url } = await window.IFWL_UploadAPI.uploadLicenceImage(file, 'affiliateAd');
        row.querySelector('.se-preview-wrap').innerHTML = `<img src="${url}" class="se-preview-img">`;
        row.dataset.newImageUrl = url;
        statusEl.textContent = 'Uploaded - click "Save all affiliate ads" to apply.';
      }catch(e){
        statusEl.textContent = 'Upload failed: ' + e.message;
      }
    });
  }

  // ✅ ADDED: Manage Sponsorships staff panel
  let spnRowCount = 0;

  function spnRowHtml(idx, s){
    s = s || {};
    return `<div class="se-event-row" data-row-idx="${idx}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h5 style="margin:0">Sponsor ${idx+1}</h5>
        <button class="btn ghost" data-remove-sponsor="${idx}" type="button">✕ Remove</button>
      </div>
      <div class="field-group"><label>Company name</label><input type="text" class="spn-company" value="${(s.companyName||'').replace(/"/g,'&quot;')}" placeholder="e.g. Velocity Surge Energy"></div>
      <div class="field-group"><label>Deal description (shown to the driver)</label><textarea class="spn-desc" style="width:100%;min-height:60px">${s.dealDescription||''}</textarea></div>
      <div style="display:flex;gap:10px">
        <div class="field-group" style="flex:1"><label>Min amount (£)</label><input type="number" class="spn-min" value="${s.minAmount ?? ''}" min="0"></div>
        <div class="field-group" style="flex:1"><label>Max amount (£)</label><input type="number" class="spn-max" value="${s.maxAmount ?? ''}" min="0"></div>
      </div>
    </div>`;
  }

  function spnAddRow(s){
    const idx = spnRowCount++;
    q('spnPoolRows').insertAdjacentHTML('beforeend', spnRowHtml(idx, s));
    document.querySelector(`[data-remove-sponsor="${idx}"]`)?.addEventListener('click', (e) => e.target.closest('[data-row-idx]').remove());
  }

  async function initSponsorshipsPanel(){
    if(!q('staffSponsorshipsPanel')) return;

    const { sponsors } = await window.IFWL_Api.apiGet('staffSponsorPoolList');
    q('spnPoolRows').innerHTML = ''; spnRowCount = 0;
    sponsors.forEach(s => spnAddRow(s));
    if(!sponsors.length) spnAddRow();

    q('spnAddSponsorBtn').onclick = () => spnAddRow();

    q('spnSavePoolBtn').onclick = async () => {
      const status = q('spnSaveStatus');
      const pool = [...q('spnPoolRows').querySelectorAll('[data-row-idx]')].map(row => ({
        companyName: row.querySelector('.spn-company').value.trim(),
        dealDescription: row.querySelector('.spn-desc').value.trim(),
        minAmount: Number(row.querySelector('.spn-min').value) || 0,
        maxAmount: Number(row.querySelector('.spn-max').value) || 0
      })).filter(s => s.companyName);
      status.textContent = 'Saving...';
      try{
        await window.IFWL_Api.apiPost('staffSponsorPoolSave', { sponsors: pool });
        status.textContent = 'Saved.';
        setTimeout(() => { if(q('spnSaveStatus')) q('spnSaveStatus').textContent = ''; }, 2000);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };

    q('spnRunLotteryBtn').onclick = async () => {
      const resultBox = q('spnLotteryResult');
      resultBox.innerHTML = '<div class="empty">Working out who raced this season and checking existing deals&hellip;</div>';
      try{
        // Same season-window + race-file detection Season Progression's own
        // staff view uses, then matched against real licence profiles via
        // accDriverNames (substring match, same convention as everywhere
        // else) to get real discordIds - the backend needs actual driver
        // IDs to write a new sponsorship deal, not just in-game names.
        // ✅ CHANGED: no longer excludes drivers who already hold a deal -
        // drivers can now stack multiple simultaneous sponsorships, so the
        // eligible pool no longer shrinks every roll as more people win.
        const season = await window.IFWL_SeasonAPI.fetchSeasonWindow();
        const startMs = season.startDate ? Date.parse(season.startDate + 'T00:00:00Z') : 0;
        const endMs = season.endDate ? Date.parse(season.endDate + 'T23:59:59Z') : Date.now();
        if(!startMs){ resultBox.innerHTML = '<div class="empty">No Season Window set yet.</div>'; return; }

        const allRows = await window.IFWLStats.buildAllRows();
        const bySource = new Map();
        allRows.forEach(r => { if(!bySource.has(r.source)) bySource.set(r.source, []); bySource.get(r.source).push(r); });
        function tsFromFileName(name){
          const m = String(name||'').match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/);
          if(!m) return 0;
          const [,yy,mm,dd,hh,mi,ss] = m;
          return Date.UTC(2000+Number(yy), Number(mm)-1, Number(dd), Number(hh), Number(mi), Number(ss));
        }
        const seasonDriverKeys = new Set();
        for(const [source, rows] of bySource.entries()){
          if(!rows.length || !/_R\.json$/i.test(rows[0].fileName||'')) continue;
          const ts = tsFromFileName(rows[0].fileName);
          if(!ts || ts < startMs || ts > endMs) continue;
          rows.forEach(row => { const k = window.IFWLStats.driverNameKey(row.driver); if(k) seasonDriverKeys.add(k); });
        }

        const profiles = await staffSearch('');
        const eligibleIds = profiles.filter(p => {
          const aliases = (p.accDriverNames||[]).map(n => window.IFWLStats.driverNameKey(n));
          if(!aliases.length) return false;
          return [...seasonDriverKeys].some(dk => aliases.some(a => dk.includes(a) || a.includes(dk)));
        }).map(p => p.discordId);

        if(!eligibleIds.length){ resultBox.innerHTML = '<div class="empty">No eligible drivers found - nobody raced yet this season.</div>'; return; }

        resultBox.innerHTML = `<div class="empty">Rolling against ${eligibleIds.length} eligible driver(s)&hellip;</div>`;
        const runs = Math.max(1, Math.min(50, Math.round(Number(q('spnLotteryRuns').value) || 1)));
        const result = await window.IFWL_Api.apiPost('staffRunSponsorshipLottery', { eligibleDriverIds: eligibleIds, runs });

        const runResults = result.runResults || [{ runNumber: 1, rolledCount: result.rolledCount, winnerCount: result.winnerCount, winners: result.winners }];
        resultBox.innerHTML = `
          <div class="notice-card">Rolled ${runs} time${runs===1?'':'s'} against <strong>${result.rolledCount}</strong> eligible driver(s) per run - <strong>${result.winnerCount}</strong> total hit(s) across all runs.</div>
          ${runResults.map(r => `
            <div style="margin-top:14px">
              <h5 style="margin:0 0 6px">Run ${r.runNumber} <span class="field-hint" style="text-transform:none">(${r.winnerCount} hit${r.winnerCount===1?'':'s'})</span></h5>
              ${r.winners.length ? `<table class="fc-stint-table">
                <thead><tr><th>Driver</th><th>Sponsor</th><th>Amount</th></tr></thead>
                <tbody>${r.winners.map(w => `<tr><td>${w.driverName}</td><td>${w.companyName}</td><td>&pound;${w.amount.toLocaleString()}</td></tr>`).join('')}</tbody>
              </table>` : '<div class="field-hint">No hits this run.</div>'}
            </div>
          `).join('')}
        `;
        renderCurrentSponsorships();
      }catch(e){
        resultBox.innerHTML = `<div class="empty">Could not run the lottery: ${e.message}</div>`;
      }
    };

    renderCurrentSponsorships();

    // Auto-roll schedule
    try{
      const sched = await window.IFWL_Api.apiGet('sponsorshipSchedule');
      q('spnScheduleEnabled').checked = !!sched.enabled;
      document.querySelectorAll('.spn-schedule-day').forEach(el => { el.checked = sched.daysOfWeek.includes(Number(el.value)); });
      q('spnScheduleLastRun').textContent = sched.lastRunDateStr ? `Last auto-rolled: ${sched.lastRunDateStr}` : 'Never auto-rolled yet.';
    }catch(e){ console.warn('Could not load sponsorship schedule', e); }

    q('spnSaveScheduleBtn').onclick = async () => {
      const status = q('spnScheduleStatus');
      const enabled = q('spnScheduleEnabled').checked;
      const daysOfWeek = [...document.querySelectorAll('.spn-schedule-day:checked')].map(el => Number(el.value));
      if(enabled && !daysOfWeek.length){ status.textContent = 'Tick at least one day, or turn auto-roll off.'; return; }
      status.textContent = 'Saving...';
      try{
        await window.IFWL_Api.apiPost('staffSponsorshipScheduleSave', { enabled, daysOfWeek });
        status.textContent = 'Saved.';
        setTimeout(() => { if(q('spnScheduleStatus')) q('spnScheduleStatus').textContent = ''; }, 2000);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };

    // Career Perks reset - reuses the same staffSearch() Driver Name Audit
    // already relies on, so no new search endpoint needed.
    q('spnPerkSearchBtn').onclick = async () => {
      const term = q('spnPerkSearchInput').value.trim().toLowerCase();
      const resultsBox = q('spnPerkSearchResults');
      resultsBox.innerHTML = '<div class="empty">Searching&hellip;</div>';
      try{
        const drivers = await staffSearch(term);
        if(!drivers.length){ resultsBox.innerHTML = '<div class="empty">No drivers found.</div>'; return; }
        resultsBox.innerHTML = drivers.slice(0, 20).map(d => `
          <div class="note-item">
            <strong>${d.name}</strong>
            <div class="note-meta">${d.licenceNumber}</div>
            <div style="margin-top:8px"><button class="btn ghost" data-reset-perks="${d.discordId}">Reset Career Perks</button></div>
          </div>
        `).join('');
        resultsBox.querySelectorAll('[data-reset-perks]').forEach(btn => btn.addEventListener('click', async () => {
          if(!confirm('Reset this driver\'s Career Perks? They\'ll be able to pick 3 new ones next time they visit Season Progression.')) return;
          try{
            await window.IFWL_Api.apiPost('staffResetCareerPerks', { driverId: btn.dataset.resetPerks });
            btn.textContent = 'Reset ✓';
            btn.disabled = true;
          }catch(e){ alert('Could not reset: ' + e.message); }
        }));
      }catch(e){
        resultsBox.innerHTML = `<div class="empty">Search failed: ${e.message}</div>`;
      }
    };
  }

  // ✅ ADDED: Main Sponsor Program staff panel - sponsor pool, question
  // bank, negotiation window toggles, and a per-driver deal lookup. Mirrors
  // the Sponsorship Pool panel's row-builder pattern above.
  let tspSponsorRowCount = 0;
  let tspQuestionRowCount = 0;

  function tspSponsorRowHtml(idx, s){
    s = s || {};
    return `<div class="se-event-row" data-tsp-sponsor-idx="${idx}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h5 style="margin:0">Sponsor ${idx+1}</h5>
        <button class="btn ghost" data-remove-tsp-sponsor="${idx}" type="button">✕ Remove</button>
      </div>
      <div class="field-group"><label>Company name</label><input type="text" class="tsp-sponsor-company" value="${(s.companyName||'').replace(/"/g,'&quot;')}" placeholder="e.g. Velocity Surge Energy"></div>
      <div class="field-group"><label>Deal description (shown to the driver)</label><textarea class="tsp-sponsor-desc" style="width:100%;min-height:60px">${s.dealDescription||''}</textarea></div>
      <div style="display:flex;gap:10px">
        <div class="field-group" style="flex:1"><label>Min % (can be negative)</label><input type="number" class="tsp-sponsor-min" value="${s.minPct ?? ''}" step="1"></div>
        <div class="field-group" style="flex:1"><label>Max %</label><input type="number" class="tsp-sponsor-max" value="${s.maxPct ?? ''}" step="1"></div>
      </div>
    </div>`;
  }

  function tspAddSponsorRow(s){
    const idx = tspSponsorRowCount++;
    q('tspSponsorRows').insertAdjacentHTML('beforeend', tspSponsorRowHtml(idx, s));
    document.querySelector(`[data-remove-tsp-sponsor="${idx}"]`)?.addEventListener('click', (e) => e.target.closest('[data-tsp-sponsor-idx]').remove());
  }

  function tspQuestionRowHtml(idx, qq){
    qq = qq || {};
    const answers = (qq.answers && qq.answers.length === 3) ? qq.answers : [{},{},{}];
    return `<div class="se-event-row" data-tsp-question-idx="${idx}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h5 style="margin:0">Question ${idx+1}</h5>
        <button class="btn ghost" data-remove-tsp-question="${idx}" type="button">✕ Remove</button>
      </div>
      <div class="field-group"><label>Question text</label><input type="text" class="tsp-q-text" value="${(qq.text||'').replace(/"/g,'&quot;')}" placeholder="e.g. How do you handle a tight budget mid-season?"></div>
      ${answers.map((a, ai) => `
        <div style="display:flex;gap:10px;align-items:flex-end;margin-top:6px">
          <div class="field-group" style="flex:2"><label>Answer ${ai+1}</label><input type="text" class="tsp-a-text" value="${(a.text||'').replace(/"/g,'&quot;')}"></div>
          <div class="field-group" style="flex:1"><label>%</label><input type="number" class="tsp-a-delta" value="${a.deltaPct ?? ''}" step="1"></div>
        </div>
      `).join('')}
    </div>`;
  }

  function tspAddQuestionRow(qq){
    const idx = tspQuestionRowCount++;
    q('tspQuestionRows').insertAdjacentHTML('beforeend', tspQuestionRowHtml(idx, qq));
    document.querySelector(`[data-remove-tsp-question="${idx}"]`)?.addEventListener('click', (e) => e.target.closest('[data-tsp-question-idx]').remove());
  }

  async function initTitleSponsorPanel(){
    if(!q('staffTitleSponsorPanel')) return;

    try{
      const windows = await window.IFWL_Api.apiGet('titleSponsorWindows');
      q('tspWindowSeasonStart').checked = !!windows.seasonStart;
      q('tspWindowMidSeason').checked = !!windows.midSeason;
    }catch(e){ console.warn('Could not load Main Sponsor windows', e); }

    q('tspSaveWindowsBtn').onclick = async () => {
      const status = q('tspWindowsStatus');
      status.textContent = 'Saving...';
      try{
        await window.IFWL_Api.apiPost('staffTitleSponsorWindowsSave', {
          seasonStart: q('tspWindowSeasonStart').checked,
          midSeason: q('tspWindowMidSeason').checked
        });
        status.textContent = 'Saved.';
        setTimeout(() => { if(q('tspWindowsStatus')) q('tspWindowsStatus').textContent = ''; }, 2000);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };

    try{
      const { sponsors, questions } = await window.IFWL_Api.apiGet('staffTitleSponsorConfigGet');
      q('tspSponsorRows').innerHTML = ''; tspSponsorRowCount = 0;
      sponsors.forEach(s => tspAddSponsorRow(s));
      if(!sponsors.length) tspAddSponsorRow();

      q('tspQuestionRows').innerHTML = ''; tspQuestionRowCount = 0;
      questions.forEach(qq => tspAddQuestionRow(qq));
      if(!questions.length) tspAddQuestionRow();
    }catch(e){ console.warn('Could not load Main Sponsor config', e); }

    q('tspAddSponsorBtn').onclick = () => tspAddSponsorRow();
    q('tspAddQuestionBtn').onclick = () => tspAddQuestionRow();

    q('tspSaveConfigBtn').onclick = async () => {
      const status = q('tspConfigStatus');
      const sponsors = [...q('tspSponsorRows').querySelectorAll('[data-tsp-sponsor-idx]')].map(row => ({
        companyName: row.querySelector('.tsp-sponsor-company').value.trim(),
        dealDescription: row.querySelector('.tsp-sponsor-desc').value.trim(),
        minPct: Number(row.querySelector('.tsp-sponsor-min').value) || 0,
        maxPct: Number(row.querySelector('.tsp-sponsor-max').value) || 0
      })).filter(s => s.companyName);

      const questions = [...q('tspQuestionRows').querySelectorAll('[data-tsp-question-idx]')].map(row => {
        const text = row.querySelector('.tsp-q-text').value.trim();
        const answerRows = [...row.querySelectorAll('.tsp-a-text')];
        const deltaRows = [...row.querySelectorAll('.tsp-a-delta')];
        const answers = answerRows.map((el, i) => ({ text: el.value.trim(), deltaPct: Number(deltaRows[i].value) || 0 }));
        return { text, answers };
      }).filter(qq => qq.text && qq.answers.every(a => a.text));

      if(questions.some(qq => qq.answers.length !== 3)){
        status.textContent = 'Every question needs exactly 3 answers.';
        return;
      }

      status.textContent = 'Saving...';
      try{
        await window.IFWL_Api.apiPost('staffTitleSponsorConfigSave', { sponsors, questions });
        status.textContent = 'Saved.';
        setTimeout(() => { if(q('tspConfigStatus')) q('tspConfigStatus').textContent = ''; }, 2000);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };

    q('tspSearchBtn').onclick = async () => {
      const term = q('tspSearchInput').value.trim().toLowerCase();
      const resultsBox = q('tspSearchResults');
      resultsBox.innerHTML = '<div class="empty">Searching&hellip;</div>';
      try{
        const drivers = await staffSearch(term);
        if(!drivers.length){ resultsBox.innerHTML = '<div class="empty">No drivers found.</div>'; return; }
        resultsBox.innerHTML = drivers.slice(0, 20).map(d => `
          <div class="note-item" data-tsp-driver="${d.discordId}">
            <strong>${d.name}</strong>
            <div class="note-meta">${d.licenceNumber}</div>
            <div class="tsp-driver-deals" style="margin-top:8px"><button class="btn ghost" data-tsp-view-deals="${d.discordId}">View Main Sponsor deal(s)</button></div>
          </div>
        `).join('');
        // Shared renderer so "Clear" can redraw the same box after removing
        // a deal, without re-running the whole search.
        async function tspRenderDeals(driverId, box){
          box.innerHTML = 'Loading&hellip;';
          try{
            const { profile } = await window.IFWL_Api.apiGet('staffLicenceGet', `&driverId=${encodeURIComponent(driverId)}`);
            const deals = profile?.titleSponsorDeals || {};
            const rows = ['seasonStart', 'midSeason'].filter(k => deals[k]).map(k => `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px">
                <span><strong>${k === 'seasonStart' ? 'Season Start' : 'Mid-Season'}:</strong> ${deals[k].companyName} &middot; ${deals[k].multiplierPct > 0 ? '+' : ''}${deals[k].multiplierPct}% &middot; ${new Date(deals[k].lockedAtMs).toLocaleDateString()}</span>
                <button class="btn ghost" data-tsp-clear-window="${k}" data-tsp-clear-driver="${driverId}" type="button">Clear</button>
              </div>
            `);
            box.innerHTML = rows.length ? rows.join('') : '<div class="field-hint">No Main Sponsor deal locked in this season.</div>';
            box.querySelectorAll('[data-tsp-clear-window]').forEach(clearBtn => clearBtn.addEventListener('click', async () => {
              if(!confirm(`Clear this driver's ${clearBtn.dataset.tspClearWindow === 'seasonStart' ? 'Season Start' : 'Mid-Season'} Main Sponsor deal? They'll be able to negotiate again if that window is (re)opened.`)) return;
              clearBtn.disabled = true; clearBtn.textContent = 'Clearing...';
              try{
                await window.IFWL_Api.apiPost('staffTitleSponsorClearDeal', { driverId: clearBtn.dataset.tspClearDriver, windowId: clearBtn.dataset.tspClearWindow });
                await tspRenderDeals(driverId, box);
              }catch(e){ alert('Could not clear: ' + e.message); clearBtn.disabled = false; clearBtn.textContent = 'Clear'; }
            }));
          }catch(e){ box.innerHTML = `Could not load: ${e.message}`; }
        }

        resultsBox.querySelectorAll('[data-tsp-view-deals]').forEach(btn => btn.addEventListener('click', () => {
          tspRenderDeals(btn.dataset.tspViewDeals, btn.closest('.tsp-driver-deals'));
        }));
      }catch(e){
        resultsBox.innerHTML = `<div class="empty">Search failed: ${e.message}</div>`;
      }
    };
  }

  const SPN_PAGE_SIZE = 25;
  let spnAllSponsorships = [];
  let spnCurrentPage = 0;

  function renderSponsorshipsPage(){
    const wrap = q('spnCurrentList');
    const pager = q('spnCurrentPager');
    if(!wrap) return;

    if(!spnAllSponsorships.length){
      wrap.innerHTML = '<div class="empty">No active sponsorship deals right now.</div>';
      if(pager) pager.innerHTML = '';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(spnAllSponsorships.length / SPN_PAGE_SIZE));
    spnCurrentPage = Math.max(0, Math.min(spnCurrentPage, totalPages - 1));
    const start = spnCurrentPage * SPN_PAGE_SIZE;
    const pageItems = spnAllSponsorships.slice(start, start + SPN_PAGE_SIZE);

    wrap.innerHTML = pageItems.map(s => `
      <div class="note-item">
        <strong>${s.driverName}</strong>
        <div class="note-meta">${s.companyName} &middot; &pound;${s.amount.toLocaleString()} &middot; ${new Date(s.awardedAtMs).toLocaleDateString()}</div>
        <div style="margin-top:8px"><button class="btn ghost" data-clear-sponsorship="${s.driverId}" data-clear-deal-id="${s.id||''}">Clear deal</button></div>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-clear-sponsorship]').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('Clear this sponsorship deal? This only removes this one deal - any other sponsorships this driver holds are untouched.')) return;
      try{ await window.IFWL_Api.apiPost('staffClearSponsorship', { driverId: btn.dataset.clearSponsorship, dealId: btn.dataset.clearDealId || undefined }); await renderCurrentSponsorships(); }
      catch(e){ alert('Could not clear: ' + e.message); }
    }));

    if(pager){
      if(totalPages <= 1){ pager.innerHTML = ''; }
      else{
        pager.innerHTML = `
          <button class="btn ghost" id="spnPagerPrev" type="button" ${spnCurrentPage === 0 ? 'disabled' : ''}>&larr; Prev</button>
          <span class="field-hint">Page ${spnCurrentPage + 1} of ${totalPages} &middot; ${spnAllSponsorships.length} deal(s)</span>
          <button class="btn ghost" id="spnPagerNext" type="button" ${spnCurrentPage >= totalPages - 1 ? 'disabled' : ''}>Next &rarr;</button>
        `;
        q('spnPagerPrev')?.addEventListener('click', () => { spnCurrentPage--; renderSponsorshipsPage(); });
        q('spnPagerNext')?.addEventListener('click', () => { spnCurrentPage++; renderSponsorshipsPage(); });
      }
    }
  }

  async function renderCurrentSponsorships(){
    const wrap = q('spnCurrentList');
    if(!wrap) return;
    try{
      const { sponsorships } = await window.IFWL_Api.apiGet('staffCurrentSponsorships');
      spnAllSponsorships = sponsorships;
      spnCurrentPage = 0;
      renderSponsorshipsPage();
    }catch(e){
      wrap.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`;
    }
  }

  // ✅ ADDED: Staff Seasonal Costs - entry fee, tyre make/model/price, the
  // Race Earnings payout table (1st-50th) and every track's km-per-lap.
  // Reads via window.IFWL_SeasonalCostsAPI, the same data layer My Season
  // Progression on career.html uses - saving here invalidates this page's
  // own cache of it immediately; career.html fetches fresh on its own next
  // load regardless, since each page keeps its own in-memory copy.
  let scTrackRowCount = 0;

  function scTrackRowHtml(idx, t){
    t = t || {};
    return `<div class="se-event-row" data-row-idx="${idx}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h5 style="margin:0">Track ${idx+1}</h5>
        <button class="btn ghost" data-remove-track="${idx}" type="button">✕ Remove</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="field-group" style="flex:2;min-width:160px"><label>Track name</label><input type="text" class="sc-track-name" value="${(t.name||'').replace(/"/g,'&quot;')}" placeholder="e.g. Silverstone"></div>
        <div class="field-group" style="flex:2;min-width:160px"><label>Slug (matches ACC session data)</label><input type="text" class="sc-track-slug" value="${(t.slug||'').replace(/"/g,'&quot;')}" placeholder="e.g. silverstone"></div>
        <div class="field-group" style="flex:1;min-width:120px"><label>Km per lap</label><input type="number" class="sc-track-km" value="${t.kmPerLap ?? ''}" min="0" step="0.001"></div>
      </div>
    </div>`;
  }

  function scAddTrackRow(t){
    const idx = scTrackRowCount++;
    q('scTrackRows').insertAdjacentHTML('beforeend', scTrackRowHtml(idx, t));
    document.querySelector(`[data-remove-track="${idx}"]`)?.addEventListener('click', (e) => e.target.closest('[data-row-idx]').remove());
  }

  function scOrdinal(n){ return n===1?'st':n===2?'nd':n===3?'rd':'th'; }

  async function initSeasonalCostsPanel(){
    if(!q('staffSeasonalCostsPanel')) return;

    let costs;
    try{
      costs = await window.IFWL_SeasonalCostsAPI.fetchSeasonalCosts();
    }catch(e){
      q('scEarningsRows').innerHTML = `<tr><td colspan="4">Could not load current seasonal costs: ${e.message}</td></tr>`;
      return;
    }

    q('scEntryFee').value = costs.entryFeePerRace;
    q('scTyreMake').value = costs.tyre.make;
    q('scTyreModel').value = costs.tyre.model;
    q('scTyrePrice').value = costs.tyre.pricePerTyre;
    // ✅ ADDED: Parts Marketplace maintenance costs.
    const pm = costs.partsMaintenance || { engine: 8000, suspension: 6000, damper: 4000, aero: 5000 };
    q('scEngineMaintenance').value = pm.engine;
    q('scSuspensionMaintenance').value = pm.suspension;
    q('scDamperMaintenance').value = pm.damper;
    q('scAeroMaintenance').value = pm.aero;

    // ✅ ADDED: Fuel Factory figures.
    const fuel = costs.fuel || { pricePerLitre: 2.3, practiceQualifyingLitres: 120, raceLitres: 120, standardRaceLaps: 20, extraLitresPerLap: 2.75 };
    q('scFuelPrice').value = fuel.pricePerLitre;
    q('scFuelPQLitres').value = fuel.practiceQualifyingLitres;
    q('scFuelRaceLitres').value = fuel.raceLitres;
    q('scFuelStandardLaps').value = fuel.standardRaceLaps;
    q('scFuelExtraPerLap').value = fuel.extraLitresPerLap;

    // Race Earnings - 25 rows x (position/payout, position/payout), same
    // half-split layout as the driver-facing payout table.
    const earnings = costs.raceEarnings || {};
    const half = 25;
    let earningsRowsHtml = '';
    for(let i=0;i<half;i++){
      const p1 = i+1, p2 = i+1+half;
      earningsRowsHtml += `<tr>
        <td>${p1}${scOrdinal(p1)}</td>
        <td><input type="number" class="sc-earning-input" data-position="${p1}" value="${earnings[p1] ?? ''}" min="0" step="1" style="width:100%"></td>
        <td>${p2}${scOrdinal(p2)}</td>
        <td><input type="number" class="sc-earning-input" data-position="${p2}" value="${earnings[p2] ?? ''}" min="0" step="1" style="width:100%"></td>
      </tr>`;
    }
    q('scEarningsRows').innerHTML = earningsRowsHtml;

    // Tracks
    q('scTrackRows').innerHTML = ''; scTrackRowCount = 0;
    (costs.tracks || []).forEach(t => scAddTrackRow(t));
    if(!(costs.tracks||[]).length) scAddTrackRow();

    q('scAddTrackBtn').onclick = () => scAddTrackRow();

    q('scSaveBtn').onclick = async () => {
      const status = q('scSaveStatus');

      const entryFeePerRace = Number(q('scEntryFee').value) || 0;
      const tyre = {
        make: q('scTyreMake').value.trim(),
        model: q('scTyreModel').value.trim(),
        pricePerTyre: Number(q('scTyrePrice').value) || 0
      };
      if(!tyre.make || !tyre.model){ status.textContent = 'Tyre make and model are both required.'; return; }

      const raceEarnings = {};
      let earningsError = '';
      document.querySelectorAll('.sc-earning-input').forEach(inp => {
        const pos = Number(inp.dataset.position);
        const val = Number(inp.value);
        if(!Number.isFinite(val) || val < 0 || inp.value === ''){ earningsError = `Position ${pos} needs a payout value (0 is fine, blank isn't).`; return; }
        raceEarnings[pos] = val;
      });
      if(earningsError){ status.textContent = earningsError; return; }

      const tracks = [...q('scTrackRows').querySelectorAll('[data-row-idx]')].map(row => ({
        name: row.querySelector('.sc-track-name').value.trim(),
        slug: row.querySelector('.sc-track-slug').value.trim().toLowerCase().replace(/\s+/g,'_'),
        kmPerLap: Number(row.querySelector('.sc-track-km').value) || 0
      })).filter(t => t.name && t.slug && t.kmPerLap);
      if(!tracks.length){ status.textContent = 'At least one track with a name, slug and km/lap is required.'; return; }

      // ✅ ADDED: Parts Marketplace maintenance costs.
      const partsMaintenance = {
        engine: Math.max(0, Number(q('scEngineMaintenance').value) || 0),
        suspension: Math.max(0, Number(q('scSuspensionMaintenance').value) || 0),
        damper: Math.max(0, Number(q('scDamperMaintenance').value) || 0),
        aero: Math.max(0, Number(q('scAeroMaintenance').value) || 0)
      };

      // ✅ ADDED: Fuel Factory figures.
      const fuel = {
        pricePerLitre: Math.max(0, Math.round((Number(q('scFuelPrice').value) || 0) * 100) / 100),
        practiceQualifyingLitres: Math.max(0, Math.round(Number(q('scFuelPQLitres').value) || 0)),
        raceLitres: Math.max(0, Math.round(Number(q('scFuelRaceLitres').value) || 0)),
        standardRaceLaps: Math.max(0, Math.round(Number(q('scFuelStandardLaps').value) || 0)),
        extraLitresPerLap: Math.max(0, Math.round((Number(q('scFuelExtraPerLap').value) || 0) * 100) / 100)
      };

      status.textContent = 'Saving...';
      try{
        await window.IFWL_SeasonalCostsAPI.saveSeasonalCosts({ entryFeePerRace, tyre, raceEarnings, tracks, partsMaintenance, fuel });
        status.textContent = 'Saved - every driver picks this up on their next visit.';
        setTimeout(() => { if(q('scSaveStatus')) q('scSaveStatus').textContent = ''; }, 3000);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };
  }

  // ✅ ADDED: Season Start Payments staff panel - set the four tier amounts,
  // then trigger the actual payout run. Same structural pattern as Seasonal
  // Costs above (fetch on open, save on click), plus a run button that
  // reports back exactly how many drivers were paid vs already-paid.
  async function initSeasonStartPaymentsPanel(){
    if(!q('staffSeasonStartPaymentsPanel')) return;

    let cfg;
    try{ cfg = await window.IFWL_SeasonStartPaymentsAPI.fetchSeasonStartPayments(); }
    catch(e){ q('sspSaveStatus').textContent = 'Could not load: ' + e.message; return; }

    q('sspGold').value = cfg.gold;
    q('sspSilver').value = cfg.silver;
    q('sspBronze').value = cfg.bronze;
    q('sspNone').value = cfg.none;
    q('sspEnabled').checked = !!cfg.enabled;

    q('sspSaveBtn').onclick = async () => {
      const status = q('sspSaveStatus');
      const gold = Number(q('sspGold').value);
      const silver = Number(q('sspSilver').value);
      const bronze = Number(q('sspBronze').value);
      const none = Number(q('sspNone').value);
      const enabled = q('sspEnabled').checked;
      if(![gold, silver, bronze, none].every(n => Number.isFinite(n) && n >= 0)){ status.textContent = 'All four amounts must be valid, non-negative numbers.'; return; }

      status.textContent = 'Saving...';
      try{
        await window.IFWL_SeasonStartPaymentsAPI.saveSeasonStartPayments({ gold, silver, bronze, none, enabled });
        status.textContent = 'Saved.';
        setTimeout(() => { if(q('sspSaveStatus')) q('sspSaveStatus').textContent = ''; }, 2500);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };

    q('sspRunBtn').onclick = async () => {
      if(!confirm("Run Season Start Payments now? This pays every licence holder who hasn't already received this season's Day 1 payment.")) return;
      const result = q('sspRunResult');
      result.innerHTML = '<div class="field-hint">Running&hellip;</div>';
      try{
        const r = await window.IFWL_SeasonStartPaymentsAPI.runSeasonStartPayments();
        result.innerHTML = `
          <div class="notice-card" style="border-left-color:var(--ifwl-green);background:rgba(51,217,155,.08)">
            <strong>✅ Applied to ${r.paidCount} licence${r.paidCount===1?'':'s'}</strong> out of ${r.totalLicences} total.
            <div class="field-hint" style="margin-top:6px">Total paid: £${Math.round(r.totalPaidAmount).toLocaleString()} &middot; ${r.skippedAlreadyPaid} already had this season's payment.</div>
          </div>`;
      }catch(e){
        result.innerHTML = `<div class="notice-card" style="border-left-color:var(--ifwl-red);background:rgba(255,84,100,.08)"><strong>Could not run payments</strong><div class="field-hint" style="margin-top:6px">${e.message}</div></div>`;
      }
    };
  }

  // ✅ ADDED: Welcome Bonus staff panel - amounts only, no run button since
  // this fires automatically server-side on a driver's first-ever detected
  // Patreon tier, not on a staff-triggered schedule.
  async function initWelcomeBonusPanel(){
    if(!q('staffWelcomeBonusPanel')) return;

    let cfg;
    try{ cfg = await window.IFWL_WelcomeBonusAPI.fetchWelcomeBonus(); }
    catch(e){ q('wbSaveStatus').textContent = 'Could not load: ' + e.message; return; }

    q('wbGold').value = cfg.gold;
    q('wbSilver').value = cfg.silver;
    q('wbBronze').value = cfg.bronze;
    q('wbEnabled').checked = !!cfg.enabled;

    q('wbSaveBtn').onclick = async () => {
      const status = q('wbSaveStatus');
      const gold = Number(q('wbGold').value);
      const silver = Number(q('wbSilver').value);
      const bronze = Number(q('wbBronze').value);
      const enabled = q('wbEnabled').checked;
      if(![gold, silver, bronze].every(n => Number.isFinite(n) && n >= 0)){ status.textContent = 'All three amounts must be valid, non-negative numbers.'; return; }

      status.textContent = 'Saving...';
      try{
        await window.IFWL_WelcomeBonusAPI.saveWelcomeBonus({ gold, silver, bronze, enabled });
        status.textContent = 'Saved.';
        setTimeout(() => { if(q('wbSaveStatus')) q('wbSaveStatus').textContent = ''; }, 2500);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };
  }

  // ✅ ADDED: Message Templates staff panel - starting with the two
  // pieces of copy tied to a licence refusal.
  async function initMessageTemplatesPanel(){
    if(!q('staffMessageTemplatesPanel')) return;

    let templates;
    // ✅ FIXED: apiGet/apiPost are declared inside a different top-level
    // <script> block (the one holding fetchMyProfile etc.) than this
    // function - that block exposes them cross-block via window.IFWL_Api
    // for exactly this reason (see every other staff panel in this file),
    // but this panel was calling the bare, out-of-scope names, which threw
    // "apiGet is not defined" every time - it never actually loaded or saved.
    try{ templates = await window.IFWL_Api.apiGet('messageTemplates'); }
    catch(e){ q('mtSaveStatus').textContent = 'Could not load: ' + e.message; return; }

    q('mtDiscordMessageInput').value = templates.licenceRefusedDiscordMessage || '';
    q('mtPageMessageInput').value = templates.licenceRefusedPageMessage || '';
    q('mtBetaNoticeEnabled').checked = !!templates.licenceBetaNoticeEnabled;
    q('mtBetaNoticeTextInput').value = templates.licenceBetaNoticeText || '';

    q('mtSaveBtn').onclick = async () => {
      const status = q('mtSaveStatus');
      const licenceRefusedDiscordMessage = q('mtDiscordMessageInput').value.trim();
      const licenceRefusedPageMessage = q('mtPageMessageInput').value.trim();
      const licenceBetaNoticeEnabled = q('mtBetaNoticeEnabled').checked;
      const licenceBetaNoticeText = q('mtBetaNoticeTextInput').value.trim();
      if(!licenceRefusedDiscordMessage || !licenceRefusedPageMessage){ status.textContent = 'Neither message can be left empty.'; return; }
      if(licenceBetaNoticeEnabled && !licenceBetaNoticeText){ status.textContent = 'BETA notice text can\'t be empty while the notice is switched on.'; return; }

      status.textContent = 'Saving...';
      try{
        await window.IFWL_Api.apiPost('staffMessageTemplatesSave', { licenceRefusedDiscordMessage, licenceRefusedPageMessage, licenceBetaNoticeEnabled, licenceBetaNoticeText });
        status.textContent = 'Saved.';
        applyLicenceBetaNotice(); // refreshes the banner on this same page immediately, not just for other drivers
        setTimeout(() => { if(q('mtSaveStatus')) q('mtSaveStatus').textContent = ''; }, 2500);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };
  } // bridged - init() in the 2nd <script> block calls this

  // ✅ ADDED: Race Earnings Settlement staff panel - a single "run now"
  // button, no config to load first.
  function initRaceEarningsSettlementPanel(){
    if(!q('staffRaceEarningsSettlementPanel')) return;

    q('resRunBtn').onclick = async () => {
      if(!confirm("Run the Race Earnings settlement now? This credits every eligible driver's real Shop balance for any race they haven't already been paid for.")) return;
      const result = q('resRunResult');
      result.innerHTML = '<div class="field-hint">Running&hellip; this can take a little while if there are many race files to check.</div>';
      try{
        const r = await window.IFWL_RaceEarningsSettlementAPI.runRaceEarningsSettlement();
        if(r.skipped){
          result.innerHTML = `<div class="notice-card">Nothing to settle - ${r.skipped === 'no_season_window' ? 'no Season Window is set.' : 'no race files found in the current Season Window.'}</div>`;
        }else{
          const netStr = (r.totalNetCredited < 0 ? '-' : '') + '£' + Math.abs(Math.round(r.totalNetCredited)).toLocaleString();
          result.innerHTML = `
            <div class="notice-card" style="border-left-color:var(--ifwl-green);background:rgba(51,217,155,.08)">
              <strong>✅ Credited ${r.creditedCount} driver${r.creditedCount===1?'':'s'}</strong> across ${r.raceFilesChecked} race file(s) checked.
              <div class="field-hint" style="margin-top:6px">Net total credited this run: ${netStr}</div>
            </div>`;
        }
      }catch(e){
        result.innerHTML = `<div class="notice-card" style="border-left-color:var(--ifwl-red);background:rgba(255,84,100,.08)"><strong>Could not run settlement</strong><div class="field-hint" style="margin-top:6px">${e.message}</div></div>`;
      }
    };

    // ✅ ADDED: "why did this credit 0 drivers?" diagnostic - pure read,
    // never credits anyone. Shows every driver name the race files actually
    // contain next to every licence's own accDriverNames, so a mismatch or
    // a missing accDriverNames entry is visible at a glance.
    q('resDiagnoseBtn').onclick = async () => {
      const result = q('resDiagnoseResult');
      result.innerHTML = '<div class="field-hint">Checking&hellip;</div>';
      try{
        const r = await window.IFWL_RaceEarningsSettlementAPI.diagnoseRaceEarningsMatching();
        if(r.skipped){
          result.innerHTML = `<div class="notice-card">Nothing to check - ${r.skipped === 'no_season_window' ? 'no Season Window is set.' : 'no race files found in the current Season Window.'}</div>`;
          return;
        }
        const secStyle = 'color:var(--text-secondary,#9fb0b6)';
        const raceNamesHtml = (r.raceDriverNames||[]).map(n => `
          <tr>
            <td>${n.name}</td>
            <td>${n.appearances}</td>
            <td style="${secStyle}">${(n.tracks||[]).join(', ')}</td>
          </tr>`).join('') || `<tr><td colspan="3" style="${secStyle}">None found</td></tr>`;

        const licencesHtml = (r.licences||[]).map(l => `
          <tr>
            <td>${l.name}</td>
            <td style="${secStyle}">${(l.accDriverNames||[]).join(', ') || '—'}</td>
            <td>${l.matched ? '<span style="color:var(--ifwl-green)">✅ matched</span>' : '<span style="color:var(--ifwl-red)">no match</span>'}</td>
          </tr>`).join('') || `<tr><td colspan="3" style="${secStyle}">No licences have any accDriverNames set</td></tr>`;

        result.innerHTML = `
          <div class="notice-card">
            Checked ${r.raceFilesChecked} race file(s). ${r.licencesWithAliases} licence(s) have an ACC driver name set, ${r.licencesWithoutAliases} do not (those can never be matched to a race, however many races they've run).
          </div>
          <h5 style="margin:16px 0 8px">Driver names found in this season's race files</h5>
          <div class="table-wrap"><table class="dir-table"><thead><tr><th>Name (as recorded by ACC)</th><th>Races</th><th>Track(s)</th></tr></thead><tbody>${raceNamesHtml}</tbody></table></div>
          <h5 style="margin:16px 0 8px">Licences with an ACC driver name set</h5>
          <div class="table-wrap"><table class="dir-table"><thead><tr><th>Driver</th><th>Their ACC driver name(s)</th><th>Matched a race?</th></tr></thead><tbody>${licencesHtml}</tbody></table></div>
          <div class="field-hint" style="margin-top:10px">If a driver's row above shows "no match", compare their ACC driver name(s) against the exact spelling ACC recorded for them in the first table - a licence's accDriverNames field is edited from that driver's own Licence Centre profile.</div>
        `;
      }catch(e){
        result.innerHTML = `<div class="notice-card" style="border-left-color:var(--ifwl-red);background:rgba(255,84,100,.08)"><strong>Could not run diagnostic</strong><div class="field-hint" style="margin-top:6px">${e.message}</div></div>`;
      }
    };

    // ✅ ADDED: class-position payout correction (preview first, then apply).
    (function(){
      if(!q('ccPreviewBtn')) return;
      const esc2 = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const money = (n) => (n < 0 ? '-' : '+') + '£' + Math.abs(Math.round(n)).toLocaleString();
      const pad = (n) => String(n).padStart(2,'0');
      // default "since" = most recent Monday (Monday Night Multiclass)
      const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      q('ccFrom').value = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
      let lastPreview = null;
      const pickedClasses = () => Array.from(document.querySelectorAll('#ccClassPick input[data-cc-class]:checked')).map(x => x.getAttribute('data-cc-class'));
      const payload = (apply) => ({ fromDate: q('ccFrom').value, toDate: q('ccTo').value || '', classes: pickedClasses(), apply: !!apply });
      const err = (e) => `<div class="notice-card" style="border-left-color:var(--ifwl-red);background:rgba(255,84,100,.08)"><strong>Could not run correction</strong><div class="field-hint" style="margin-top:6px">${esc2(e.message)}</div></div>`;
      const sec = 'color:var(--text-secondary,#9fb0b6)';
      const render = (r, applied) => {
        if(r.ok === false){ q('ccResult').innerHTML = `<div class="notice-card">${r.error === 'no_season_window' ? 'No Season Window is set.' : esc2(r.error)}</div>`; return; }
        const races = (r.races||[]).map(x => `${esc2(x.track||'race')} (${(x.counts||[]).map(c => esc2(c.cls||'?') + ' x' + c.n).join(', ')})`).join(' &middot; ') || 'none';
        const rows = (r.corrections||[]).map(c => `<tr>
            <td>${esc2(c.driver)}</td><td>${esc2(c.carClass)}</td>
            <td>P${c.overall} &rarr; <strong>P${c.classPos}</strong></td>
            <td style="${sec}">£${Math.round(c.oldGross).toLocaleString()} &rarr; £${Math.round(c.newGross).toLocaleString()}${c.approx ? ' <span title="Estimated - the driver had perk/shop/sponsor bonuses, or the old entry did not record its gross prize, so the new figure is scaled / taken from the prize table">~</span>' : ''}</td>
            <td style="color:${c.delta>=0?'var(--ifwl-green)':'var(--ifwl-red)'}"><strong>${money(c.delta)}</strong></td></tr>`).join('') || `<tr><td colspan="5" style="${sec}">Nothing to correct</td></tr>`;
        const skipped = (r.skipped||[]).map(c => `<tr><td>${esc2(c.driver)}</td><td>${esc2(c.carClass)}</td><td>P${c.overall} &rarr; P${c.classPos}</td><td colspan="2" style="${sec}">${esc2(c.reason)}</td></tr>`).join('');
        q('ccResult').innerHTML = `
          <div class="notice-card" style="${applied ? 'border-left-color:var(--ifwl-green);background:rgba(51,217,155,.08)' : ''}">
            ${applied ? '<strong>✅ Applied</strong> - ' : '<strong>Preview only - nothing has been paid yet.</strong> '}
            ${(r.corrections||[]).length} driver correction${(r.corrections||[]).length===1?'':'s'}, net ${money(r.totalDelta||0)}.
            <div class="field-hint" style="margin-top:6px">Multiclass races found: ${races}</div>
          </div>
          <div class="table-wrap" style="margin-top:10px"><table class="dir-table"><thead><tr><th>Driver</th><th>Class</th><th>Position</th><th>Gross prize</th><th>Pays</th></tr></thead><tbody>${rows}</tbody></table></div>
          ${skipped ? `<h5 style="margin:16px 0 8px">Skipped - not changed</h5><div class="table-wrap"><table class="dir-table"><tbody>${skipped}</tbody></table></div>` : ''}
          <div class="field-hint" style="margin-top:8px">GT3 drivers who finished behind GT4 cars also move up a class place, so they show small positive corrections too. Tick only the classes you want in the box above to limit it (e.g. GT4 only), then preview again.</div>`;
      };
      q('ccPreviewBtn').onclick = async () => {
        if(!q('ccFrom').value){ q('ccResult').innerHTML = '<div class="notice-card">Pick the date to look from first.</div>'; return; }
        q('ccApplyBtn').disabled = true;
        q('ccResult').innerHTML = '<div class="field-hint">Reading race results&hellip; this can take a little while.</div>';
        try{
          const r = await window.IFWL_RaceEarningsSettlementAPI.runClassPayoutCorrection(payload(false));
          lastPreview = r;
          // class tick-boxes: keep whatever was ticked, otherwise tick everything seen
          const prev = pickedClasses();
          const seen = r.classesSeen || [];
          q('ccClassPick').innerHTML = seen.length ? '<div class="field-hint" style="margin-bottom:4px">Classes to correct:</div>' + seen.map(c => `<label style="margin-right:14px"><input type="checkbox" data-cc-class="${esc2(c)}" ${(!prev.length || prev.includes(c)) ? 'checked' : ''}> ${esc2(c || '?')}</label>`).join('') : '';
          render(r, false);
          q('ccApplyBtn').disabled = !((r.corrections||[]).length);
        }catch(e){ q('ccResult').innerHTML = err(e); }
      };
      q('ccApplyBtn').onclick = async () => {
        if(!lastPreview) return;
        // re-run the preview with the CURRENT class ticks so what is shown is exactly what is paid
        let r;
        try{
          r = await window.IFWL_RaceEarningsSettlementAPI.runClassPayoutCorrection(payload(false));
        }catch(e){ q('ccResult').innerHTML = err(e); return; }
        const n = (r.corrections||[]).length;
        if(!n){ render(r, false); q('ccApplyBtn').disabled = true; return; }
        if(!confirm(`Pay ${n} driver correction${n===1?'':'s'}, net ${money(r.totalDelta||0)}? Each driver's balance changes by the amount shown and this cannot be run twice for the same race.`)) { render(r, false); return; }
        q('ccApplyBtn').disabled = true;
        q('ccResult').innerHTML = '<div class="field-hint">Applying&hellip;</div>';
        try{
          const done = await window.IFWL_RaceEarningsSettlementAPI.runClassPayoutCorrection(payload(true));
          lastPreview = null;
          render(done, true);
        }catch(e){ q('ccResult').innerHTML = err(e); }
      };
    })();
  }

  // ✅ ADDED: BOP TRACKer staff panel - upload/replace the BOP file (with
  // the two lap-time-estimate constants saved alongside it), and manage the
  // car catalog (name/class/image + separate PC/Console car model IDs, for
  // the platforms known to have swapped IDs on some cars).
  let bopCatalogCars = [];

  function bopCarRowHtml(idx, c){
    c = c || {};
    const safeName = String(c.name||'').replace(/</g,'&lt;');
    return `<div class="se-event-row" data-row-idx="${idx}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h5 style="margin:0">${safeName || ('Car ' + (idx+1))}</h5>
        <button class="btn ghost" data-remove-bopcar="${idx}" type="button">✕ Remove</button>
      </div>
      ${c.imageUrl ? `<img src="${c.imageUrl}" alt="" style="width:100%;max-width:220px;height:100px;object-fit:cover;border-radius:8px;display:block;margin-bottom:8px;background:#f7f8fa">` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="field-group" style="flex:2;min-width:160px"><label>Car name</label><input type="text" class="bop-car-name" value="${(c.name||'').replace(/"/g,'&quot;')}"></div>
        <div class="field-group" style="flex:1;min-width:100px"><label>Class</label><input type="text" class="bop-car-class" value="${(c.carClass||'GT3').replace(/"/g,'&quot;')}"></div>
        <div class="field-group" style="flex:1;min-width:120px"><label>PC car model ID</label><input type="number" class="bop-car-pc-id" value="${c.pcCarModelId ?? ''}" min="0"></div>
        <div class="field-group" style="flex:1;min-width:120px"><label>Console car model ID</label><input type="number" class="bop-car-console-id" value="${c.consoleCarModelId ?? ''}" min="0" placeholder="same as PC if blank"></div>
      </div>
      <input type="hidden" class="bop-car-image-url" value="${(c.imageUrl||'').replace(/"/g,'&quot;')}">
    </div>`;
  }

  function bopRenderCatalogRows(){
    const wrap = q('bopCatalogRows');
    if(!wrap) return;
    wrap.innerHTML = bopCatalogCars.length
      ? bopCatalogCars.map((c,idx) => bopCarRowHtml(idx, c)).join('')
      : '<div class="empty">No cars in the catalog yet - add one above.</div>';
    wrap.querySelectorAll('[data-remove-bopcar]').forEach(btn => btn.addEventListener('click', () => {
      bopCatalogCars.splice(Number(btn.dataset.removeBopcar), 1);
      bopRenderCatalogRows();
    }));
  }

  async function initStaffBopTrackerPanel(){
    if(!q('staffBopTrackerPanel')) return;

    let data;
    try{
      data = await window.IFWL_BopAPI.fetchBopTrackerData();
    }catch(e){
      if(q('bopStaffCurrentLine')) q('bopStaffCurrentLine').textContent = 'Could not load current BOP data: ' + e.message;
      data = { bopName:'', uploadedAtMs:0, entries:[], carCatalog:[], secPerKg:0.03, secPerRestrictorPct:0.05 };
    }

    q('bopStaffCurrentLine').textContent = data.bopName
      ? `Current file: "${data.bopName}" - ${(data.entries||[]).length} entrie(s)${data.uploadedAtMs ? ', uploaded ' + new Date(data.uploadedAtMs).toLocaleString() : ''}`
      : 'No BOP file uploaded yet.';
    q('bopSecPerKg').value = data.secPerKg;
    q('bopSecPerRestrictor').value = data.secPerRestrictorPct;

    bopCatalogCars = (data.carCatalog || []).map(c => ({...c}));
    bopRenderCatalogRows();

    q('bopUploadBtn').onclick = async () => {
      const status = q('bopUploadStatus');
      const name = q('bopUploadName').value.trim();
      const raw = q('bopUploadJson').value.trim();
      if(!name){ status.textContent = 'A name is required (e.g. "LFM NOVEMBER 2025 - latest").'; return; }
      if(!raw){ status.textContent = 'Paste the BOP JSON first.'; return; }

      let parsed;
      try{ parsed = JSON.parse(raw); }
      catch(e){ status.textContent = "That doesn't look like valid JSON: " + e.message; return; }
      const entries = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.entries)) ? parsed.entries : null;
      if(!entries){ status.textContent = 'Expected either a plain array, or an object with an "entries" array.'; return; }

      status.textContent = 'Uploading...';
      try{
        const result = await window.IFWL_BopAPI.uploadBopFile({
          name, entries,
          secPerKg: Number(q('bopSecPerKg').value) || 0.03,
          secPerRestrictorPct: Number(q('bopSecPerRestrictor').value) || 0.05
        });
        status.textContent = `Uploaded - ${result.entryCount} entrie(s) saved.`;
        q('bopStaffCurrentLine').textContent = `Current file: "${result.name}" - ${result.entryCount} entrie(s), uploaded just now`;
        setTimeout(() => { if(q('bopUploadStatus')) q('bopUploadStatus').textContent = ''; }, 3000);
      }catch(e){ status.textContent = 'Could not upload: ' + e.message; }
    };

    q('bopAddCarBtn').onclick = async () => {
      const status = q('bopAddCarStatus');
      const name = q('bopNewCarName').value.trim();
      const carClass = q('bopNewCarClass').value.trim() || 'GT3';
      const pcId = Number(q('bopNewCarPcId').value);
      const consoleIdRaw = q('bopNewCarConsoleId').value;
      const consoleId = consoleIdRaw === '' ? pcId : Number(consoleIdRaw);
      if(!name){ status.textContent = 'Car name is required.'; return; }
      if(!Number.isFinite(pcId)){ status.textContent = 'PC car model ID is required.'; return; }

      let imageUrl = '';
      const file = q('bopNewCarImageInput').files[0];
      if(file){
        status.textContent = 'Uploading image...';
        try{ imageUrl = (await window.IFWL_UploadAPI.uploadLicenceImage(file, 'bopCarImage')).url; }
        catch(e){ status.textContent = 'Image upload failed: ' + e.message; return; }
      }

      bopCatalogCars.push({ id: 'bopcar_' + Date.now(), name, carClass, pcCarModelId: pcId, consoleCarModelId: consoleId, imageUrl });
      bopRenderCatalogRows();

      status.textContent = 'Saving...';
      try{
        bopCatalogCars = await window.IFWL_BopAPI.saveBopCarCatalog(bopCatalogCars);
        bopRenderCatalogRows();
        q('bopNewCarName').value = ''; q('bopNewCarPcId').value = ''; q('bopNewCarConsoleId').value = ''; q('bopNewCarImageInput').value = '';
        status.textContent = 'Added.';
        setTimeout(() => { if(q('bopAddCarStatus')) q('bopAddCarStatus').textContent = ''; }, 2000);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };

    q('bopSaveCatalogBtn').onclick = async () => {
      const status = q('bopCatalogSaveStatus');
      const rows = [...q('bopCatalogRows').querySelectorAll('[data-row-idx]')];
      const cars = rows.map(row => {
        const idx = Number(row.dataset.rowIdx);
        const pcId = Number(row.querySelector('.bop-car-pc-id').value);
        const consoleRaw = row.querySelector('.bop-car-console-id').value;
        return {
          id: bopCatalogCars[idx]?.id || ('bopcar_' + Date.now() + '_' + idx),
          name: row.querySelector('.bop-car-name').value.trim(),
          carClass: row.querySelector('.bop-car-class').value.trim() || 'GT3',
          pcCarModelId: pcId,
          consoleCarModelId: consoleRaw === '' ? pcId : Number(consoleRaw),
          imageUrl: row.querySelector('.bop-car-image-url').value
        };
      }).filter(c => c.name && Number.isFinite(c.pcCarModelId));

      if(!cars.length){ status.textContent = 'At least one car with a name and PC car model ID is required.'; return; }

      status.textContent = 'Saving...';
      try{
        bopCatalogCars = await window.IFWL_BopAPI.saveBopCarCatalog(cars);
        bopRenderCatalogRows();
        status.textContent = 'Saved.';
        setTimeout(() => { if(q('bopCatalogSaveStatus')) q('bopCatalogSaveStatus').textContent = ''; }, 2000);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };
  }

  // ✅ ADDED: Staff: IFWL Shop. Catalog editor follows the exact same
  // pattern as BOP TRACKer's Car Catalog just above it (image upload, add
  // row, edit inline, save-all). Manual transaction/refund tools reuse
  // staffSearch() - the same driver search Driver Name Audit and the
  // Career Perks reset tool already rely on, so no new search endpoint
  // is needed.
  let csShopItems = [];
  let csSelectedTxDriver = null;
  let csSelectedRefundDriver = null;

  function csItemRowHtml(idx, item){
    item = item || {};
    const safeName = String(item.name||'').replace(/</g,'&lt;');
    return `<div class="se-event-row" data-row-idx="${idx}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h5 style="margin:0">${safeName || ('Item ' + (idx+1))}</h5>
        <button class="btn ghost" data-remove-csitem="${idx}" type="button">✕ Remove</button>
      </div>
      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="" style="width:100%;max-width:220px;height:100px;object-fit:cover;border-radius:8px;display:block;margin-bottom:8px;background:#f7f8fa">` : ''}
      ${item.category === 'livery' ? `<div class="field-hint" style="margin-bottom:8px">${item.fileUrl ? '&#9989; Livery zip attached' : '&#9888; No livery zip attached yet - remove and re-add this item with a zip file'}</div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="field-group" style="flex:2;min-width:160px"><label>Item name</label><input type="text" class="cs-item-name" value="${(item.name||'').replace(/"/g,'&quot;')}"></div>
        <div class="field-group" style="flex:1;min-width:170px">
          <label>Category</label>
          <select class="cs-item-category">
            <option value="supportStaff" ${item.category === 'supportStaff' ? 'selected' : ''}>Support Staff (sponsorship)</option>
            <option value="teamGear" ${item.category === 'teamGear' ? 'selected' : ''}>Team Gear (race income)</option>
            <option value="costReduction" ${item.category === 'costReduction' ? 'selected' : ''}>Cost Reduction (tyre/entry fee)</option>
            <option value="tyreFactory" ${item.category === 'tyreFactory' ? 'selected' : ''}>Tyre Factory (Gold - produces tyres)</option>
            <option value="fuelDepot" ${item.category === 'fuelDepot' ? 'selected' : ''}>Fuel Depot (Gold - produces race fuel)</option>
            <option value="engineShop" ${item.category === 'engineShop' ? 'selected' : ''}>Engine Shop (Gold - produces engine parts)</option>
            <option value="tuningShop" ${item.category === 'tuningShop' ? 'selected' : ''}>Tuning Shop (Gold - produces suspension+damper)</option>
            <option value="aeroShop" ${item.category === 'aeroShop' ? 'selected' : ''}>Aero Tuning Company (Gold - produces aero parts)</option>
            <option value="trophy" ${item.category === 'trophy' ? 'selected' : ''}>Trophy (awards a real trophy)</option>
            <option value="carAddition" ${item.category === 'carAddition' ? 'selected' : ''}>Car Addition (cosmetic)</option>
            <option value="livery" ${item.category === 'livery' ? 'selected' : ''}>League Livery (paid zip download)</option>
          </select>
        </div>
        <div class="field-group" style="flex:1;min-width:150px">
          <label>Reduces (Cost Reduction only)</label>
          <select class="cs-item-cost-target">
            <option value="tyre" ${item.costTarget !== 'entryFee' && item.costTarget !== 'fuel' ? 'selected' : ''}>Tyre cost</option>
            <option value="fuel" ${item.costTarget === 'fuel' ? 'selected' : ''}>Fuel cost</option>
            <option value="entryFee" ${item.costTarget === 'entryFee' ? 'selected' : ''}>Race entry fee</option>
          </select>
        </div>
        <div class="field-group" style="flex:1;min-width:110px"><label>Cost (&pound;)</label><input type="number" class="cs-item-cost" value="${item.cost ?? ''}" min="0" step="1"></div>
        <div class="field-group" style="flex:1;min-width:100px"><label>Bonus / Reduction % <span class="field-hint" style="text-transform:none">(0 ok for Trophy/Car/Livery)</span></label><input type="number" class="cs-item-bonus" value="${item.bonusPct ?? ''}" min="0" step="0.1"></div>
        <div class="field-group" style="flex:1;min-width:110px"><label>Trophy colour</label><input type="text" class="cs-item-trophy-color" value="${(item.trophyColor||'#ffb238').replace(/"/g,'&quot;')}"></div>
        <div class="field-group" style="flex:1;min-width:150px">
          <label>Level <span class="field-hint" style="text-transform:none">(Engine/Tuning/Aero Shop only)</span></label>
          <select class="cs-item-tier">
            <option value="1" ${(!item.tier || Number(item.tier) === 1) ? 'selected' : ''}>Level 1 (80% RRP, 100% life)</option>
            <option value="2" ${Number(item.tier) === 2 ? 'selected' : ''}>Level 2 (50% RRP, 125% life)</option>
            <option value="3" ${Number(item.tier) === 3 ? 'selected' : ''}>Level 3 (15% RRP, 150% life)</option>
          </select>
        </div>
      </div>
      <input type="hidden" class="cs-item-image-url" value="${(item.imageUrl||'').replace(/"/g,'&quot;')}">
      <input type="hidden" class="cs-item-file-url" value="${(item.fileUrl||'').replace(/"/g,'&quot;')}">
    </div>`;
  }

  function csRenderCatalogRows(){
    const wrap = q('csCatalogRows');
    if(!wrap) return;
    wrap.innerHTML = csShopItems.length
      ? csShopItems.map((it,idx) => csItemRowHtml(idx, it)).join('')
      : '<div class="empty">No items in the shop yet - add one above.</div>';
    wrap.querySelectorAll('[data-remove-csitem]').forEach(btn => btn.addEventListener('click', () => {
      csShopItems.splice(Number(btn.dataset.removeCsitem), 1);
      csRenderCatalogRows();
    }));
  }

  async function initCareerShopPanel(){
    if(!q('staffCareerShopPanel')) return;

    let catalog = [];
    try{ catalog = await window.IFWL_CareerShopAPI.fetchCareerShopCatalog(); }
    catch(e){ q('csCatalogRows').innerHTML = `<div class="empty">Could not load shop catalog: ${e.message}</div>`; }
    csShopItems = catalog.map(c => ({...c}));
    csRenderCatalogRows();

    q('csAddItemBtn').onclick = async () => {
      const status = q('csAddItemStatus');
      const name = q('csNewItemName').value.trim();
      const category = q('csNewItemCategory').value;
      const costTarget = q('csNewItemCostTarget').value;
      const trophyColor = q('csNewItemTrophyColor').value.trim() || '#ffb238';
      const cost = Number(q('csNewItemCost').value);
      const bonusPct = Number(q('csNewItemBonusPct').value) || 0;
      const tier = Number(q('csNewItemTier').value) || 1;
      // ✅ CHANGED: the four new Parts Marketplace shop categories don't
      // need a bonus % either (their benefit is production, not a
      // discount) - matches the server-side NO_BONUS_REQUIRED_CATEGORIES
      // exemption in staffCareerShopCatalogSave. Livery is the same - its
      // "benefit" is the download itself, not a stat bonus.
      const isCosmetic = ['trophy', 'carAddition', 'livery', 'tyreFactory', 'fuelDepot', 'engineShop', 'tuningShop', 'aeroShop'].includes(category);
      const isLiveryItem = category === 'livery';
      if(!name){ status.textContent = 'Item name is required.'; return; }
      if(!Number.isFinite(cost) || cost < 0){ status.textContent = 'A valid cost is required.'; return; }
      if(!isCosmetic && (!Number.isFinite(bonusPct) || bonusPct <= 0)){ status.textContent = 'A bonus % greater than 0 is required (Trophy/Car Addition/Livery/Shop-Factory items can leave this at 0).'; return; }
      const liveryZipFile = q('csNewItemLiveryZipInput').files[0];
      if(isLiveryItem && !liveryZipFile){ status.textContent = 'A livery zip file is required for the Livery category.'; return; }

      let imageUrl = '';
      const file = q('csNewItemImageInput').files[0];
      if(file){
        status.textContent = 'Uploading image...';
        try{ imageUrl = (await window.IFWL_UploadAPI.uploadLicenceImage(file, 'careerShopItem')).url; }
        catch(e){ status.textContent = 'Image upload failed: ' + e.message; return; }
      }

      let fileUrl = '';
      if(isLiveryItem){
        status.textContent = 'Uploading livery zip...';
        try{ fileUrl = await window.IFWL_UploadAPI.uploadLiveryZip(liveryZipFile); }
        catch(e){ status.textContent = 'Livery upload failed: ' + e.message; return; }
      }

      csShopItems.push({ id: 'shopitem_' + Date.now(), name, category, costTarget, trophyColor, cost, bonusPct, imageUrl, fileUrl, tier });
      csRenderCatalogRows();

      status.textContent = 'Saving...';
      try{
        csShopItems = await window.IFWL_CareerShopAPI.saveCareerShopCatalog(csShopItems);
        csRenderCatalogRows();
        q('csNewItemName').value = ''; q('csNewItemCost').value = ''; q('csNewItemBonusPct').value = ''; q('csNewItemImageInput').value = ''; q('csNewItemLiveryZipInput').value = ''; q('csNewItemTier').value = '1';
        status.textContent = 'Added.';
        setTimeout(() => { if(q('csAddItemStatus')) q('csAddItemStatus').textContent = ''; }, 2000);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };

    q('csSaveCatalogBtn').onclick = async () => {
      const status = q('csCatalogSaveStatus');
      const rows = [...q('csCatalogRows').querySelectorAll('[data-row-idx]')];
      const items = rows.map(row => {
        const idx = Number(row.dataset.rowIdx);
        return {
          id: csShopItems[idx]?.id || ('shopitem_' + Date.now() + '_' + idx),
          name: row.querySelector('.cs-item-name').value.trim(),
          category: row.querySelector('.cs-item-category').value,
          costTarget: row.querySelector('.cs-item-cost-target').value,
          trophyColor: (row.querySelector('.cs-item-trophy-color')?.value || '#ffb238').trim() || '#ffb238',
          cost: Number(row.querySelector('.cs-item-cost').value),
          bonusPct: Number(row.querySelector('.cs-item-bonus').value) || 0,
          imageUrl: row.querySelector('.cs-item-image-url').value,
          fileUrl: row.querySelector('.cs-item-file-url').value,
          tier: Number(row.querySelector('.cs-item-tier')?.value) || 1
        };
      }).filter(it => it.name && Number.isFinite(it.cost) && it.cost >= 0 && (it.bonusPct > 0 || ['trophy', 'carAddition', 'livery', 'tyreFactory', 'fuelDepot', 'engineShop', 'tuningShop', 'aeroShop'].includes(it.category)));

      if(!items.length){ status.textContent = 'At least one valid item is required (bonus % required unless it\'s a Trophy, Car Addition, Livery, or Shop/Factory).'; return; }

      status.textContent = 'Saving...';
      try{
        csShopItems = await window.IFWL_CareerShopAPI.saveCareerShopCatalog(items);
        csRenderCatalogRows();
        status.textContent = 'Saved - every driver picks this up on their next visit.';
        setTimeout(() => { if(q('csCatalogSaveStatus')) q('csCatalogSaveStatus').textContent = ''; }, 3000);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };

    // ---- Manual credit/debit ----
    q('csTxSearchInput').addEventListener('input', async () => {
      const term = q('csTxSearchInput').value.trim().toLowerCase();
      const resultsBox = q('csTxSearchResults');
      csSelectedTxDriver = null;
      if(!term){ resultsBox.innerHTML = ''; return; }
      resultsBox.innerHTML = '<div class="empty">Searching&hellip;</div>';
      let drivers;
      try{ drivers = await staffSearch(term); }
      catch(e){ resultsBox.innerHTML = `<div class="empty">Search failed: ${e.message}</div>`; return; }
      if(!drivers.length){ resultsBox.innerHTML = '<div class="empty">No drivers found.</div>'; return; }
      resultsBox.innerHTML = drivers.slice(0, 20).map(d => `
        <div class="note-item" style="cursor:pointer" data-tx-driver="${d.discordId}" data-tx-driver-name="${(d.name||'').replace(/"/g,'&quot;')}">
          <strong>${d.name}</strong> <span class="note-meta">(${d.licenceNumber})</span>
        </div>
      `).join('');
      resultsBox.querySelectorAll('[data-tx-driver]').forEach(row => row.addEventListener('click', () => {
        csSelectedTxDriver = { id: row.dataset.txDriver, name: row.dataset.txDriverName };
        resultsBox.innerHTML = `
          <div class="notice-card">Issuing a manual credit/debit to <strong>${csSelectedTxDriver.name}</strong>.</div>
          <div class="field-group"><label>Amount (&pound;) - negative for a debit</label><input type="number" id="csTxAmount" step="1"></div>
          <div class="field-group"><label>Reason (required - shown to the driver on their receipt)</label><textarea id="csTxReason" style="width:100%;min-height:70px"></textarea></div>
          <button class="btn teal" id="csTxSubmitBtn" type="button">Issue transaction</button>
          <button class="btn ghost" id="csTxCancelBtn" type="button">Cancel</button>
          <span class="save-status" id="csTxSubmitStatus"></span>
        `;
        q('csTxCancelBtn').onclick = () => { csSelectedTxDriver = null; resultsBox.innerHTML = ''; q('csTxSearchInput').value = ''; };
        q('csTxSubmitBtn').onclick = async () => {
          const status = q('csTxSubmitStatus');
          const amount = Number(q('csTxAmount').value);
          const reason = q('csTxReason').value;
          if(!Number.isFinite(amount) || amount === 0){ status.textContent = 'Enter a non-zero amount.'; return; }
          if(!reason.trim()){ status.textContent = 'A reason is required.'; return; }
          if(!confirm(`Issue ${amount >= 0 ? '+' : ''}£${amount.toLocaleString()} to ${csSelectedTxDriver.name}?`)) return;
          status.textContent = 'Issuing...';
          try{
            await window.IFWL_CareerShopAPI.issueCareerShopTransaction(csSelectedTxDriver.id, amount, reason);
            status.textContent = 'Issued - visible to the driver next time they load the page.';
            setTimeout(() => { resultsBox.innerHTML = ''; q('csTxSearchInput').value = ''; csSelectedTxDriver = null; }, 1800);
          }catch(e){ status.textContent = 'Could not issue: ' + e.message; }
        };
      }));
    });

    // ---- Refund a purchase ----
    q('csRefundSearchInput').addEventListener('input', async () => {
      const term = q('csRefundSearchInput').value.trim().toLowerCase();
      const resultsBox = q('csRefundSearchResults');
      csSelectedRefundDriver = null;
      if(!term){ resultsBox.innerHTML = ''; return; }
      resultsBox.innerHTML = '<div class="empty">Searching&hellip;</div>';
      let drivers;
      try{ drivers = await staffSearch(term); }
      catch(e){ resultsBox.innerHTML = `<div class="empty">Search failed: ${e.message}</div>`; return; }
      if(!drivers.length){ resultsBox.innerHTML = '<div class="empty">No drivers found.</div>'; return; }
      resultsBox.innerHTML = drivers.slice(0, 20).map(d => `
        <div class="note-item" style="cursor:pointer" data-refund-driver="${d.discordId}" data-refund-driver-name="${(d.name||'').replace(/"/g,'&quot;')}">
          <strong>${d.name}</strong> <span class="note-meta">(${d.licenceNumber})</span>
        </div>
      `).join('');
      resultsBox.querySelectorAll('[data-refund-driver]').forEach(row => row.addEventListener('click', async () => {
        const driverId = row.dataset.refundDriver;
        const driverName = row.dataset.refundDriverName;
        resultsBox.innerHTML = '<div class="empty">Loading this driver\'s purchases&hellip;</div>';
        let ledger;
        try{ ledger = await window.IFWL_CareerShopAPI.fetchDriverCareerShopLedger(driverId); }
        catch(e){ resultsBox.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }
        // Assumes each purchase transaction carries {type:'purchase', id, itemId, itemName, amount, refunded}
        const purchases = (ledger.transactions || []).filter(t => t.type === 'purchase' && !t.refunded);
        if(!purchases.length){ resultsBox.innerHTML = `<div class="empty">${driverName} has no active purchases this season to refund.</div>`; return; }
        resultsBox.innerHTML = `
          <div class="notice-card">Refunding a purchase for <strong>${driverName}</strong>.</div>
          ${purchases.map(p => `
            <div class="note-item">
              <strong>${p.itemName || p.description || 'Item'}</strong> <span class="note-meta">-&pound;${Math.abs(Number(p.amount)||0).toLocaleString()}</span>
              <div style="margin-top:8px">
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:8px"><input type="checkbox" class="cs-refund-reclaim" style="width:auto"> Also reclaim the item (removes its bonus)</label>
                <textarea class="cs-refund-reason" placeholder="Reason (required)..." style="width:100%;min-height:50px;margin-bottom:8px"></textarea>
                <button class="btn teal" data-do-refund="${p.id}" data-refund-item="${p.itemId||''}" type="button">Refund this purchase</button>
                <span class="save-status cs-refund-status"></span>
              </div>
            </div>
          `).join('')}
        `;
        resultsBox.querySelectorAll('[data-do-refund]').forEach(btn => btn.addEventListener('click', async () => {
          const card = btn.closest('.note-item');
          const status = card.querySelector('.cs-refund-status');
          const reclaimItem = card.querySelector('.cs-refund-reclaim').checked;
          const reason = card.querySelector('.cs-refund-reason').value;
          if(!reason.trim()){ status.textContent = 'A reason is required.'; return; }
          if(!confirm(`Refund this purchase for ${driverName}?${reclaimItem ? ' The item and its bonus will also be reclaimed.' : ' They keep the item.'}`)) return;
          status.textContent = 'Refunding...';
          try{
            await window.IFWL_CareerShopAPI.refundCareerShopPurchase(driverId, btn.dataset.doRefund, reclaimItem, reason);
            status.textContent = 'Refunded.';
            btn.disabled = true;
          }catch(e){ status.textContent = 'Could not refund: ' + e.message; }
        }));
      }));
    });
  }

  // ✅ ADDED: Staff: Parts Marketplace oversight panel - listings,
  // transactions, the Treasury balance, and a void tool. Pure read + void,
  // no listing/buying actions here (those are driver-facing, on career.html).
  function mktFmtMoney(n){ return (Number(n) < 0 ? '-' : '') + '&pound;' + Math.abs(Math.round(Number(n) || 0)).toLocaleString(); }
  const MKT_PART_LABEL = { tyre: 'Tyres', fuel: 'Race Fuel', engine: 'Engine parts', suspension: 'Suspension parts', damper: 'Damper parts', aero: 'Aero parts' };

  async function renderMarketplaceOverview(){
    const listingsBox = q('mktListingsRows');
    const txBox = q('mktTransactionsRows');
    if(!listingsBox || !txBox) return;
    listingsBox.innerHTML = '<div class="empty">Loading&hellip;</div>';
    txBox.innerHTML = '<div class="empty">Loading&hellip;</div>';

    let overview;
    try{ overview = await window.IFWL_MarketplaceAPI.fetchStaffMarketplaceOverview(); }
    catch(e){ listingsBox.innerHTML = txBox.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }

    q('mktTreasuryValue').innerHTML = mktFmtMoney(overview.treasuryBalance || 0);

    const listings = overview.listings || [];
    listingsBox.innerHTML = listings.length ? `<div class="table-wrap"><table class="fc-stint-table">
      <thead><tr><th>Seller</th><th>Part</th><th>Remaining</th><th>Price/unit</th><th>Status</th></tr></thead>
      <tbody>${listings.map(l => {
        const remaining = (l.partType === 'tyre' || l.partType === 'fuel') ? l.quantityRemaining : (l.partIdsRemaining || []).length;
        return `<tr><td>${l.sellerId}</td><td>${MKT_PART_LABEL[l.partType] || l.partType}</td><td>${remaining}</td><td>${mktFmtMoney(l.pricePerUnit)}</td><td>${l.status}</td></tr>`;
      }).join('')}</tbody>
    </table></div>` : '<div class="empty">No listings yet.</div>';

    const transactions = overview.transactions || [];
    txBox.innerHTML = transactions.length ? `<div class="table-wrap"><table class="fc-stint-table">
      <thead><tr><th>Date</th><th>Buyer</th><th>Seller</th><th>Part</th><th>Qty</th><th>Total</th><th>League cut</th><th>Status</th><th></th></tr></thead>
      <tbody>${transactions.map(t => `<tr>
        <td>${t.dateLabel ? new Date(t.dateLabel).toLocaleDateString() : ''}</td>
        <td>${t.buyerId}</td><td>${t.sellerId}</td><td>${MKT_PART_LABEL[t.partType] || t.partType}</td><td>${t.quantity}</td>
        <td>${mktFmtMoney(t.totalPaid)}</td><td>${mktFmtMoney(t.leagueCut)}</td>
        <td>${t.voided ? 'Voided' : 'OK'}</td>
        <td>${t.voided ? '' : `<button class="btn ghost" data-void-tx="${t.id}" type="button">Void</button>`}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty">No transactions yet.</div>';

    txBox.querySelectorAll('[data-void-tx]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reason = prompt('Reason for voiding this transaction (required):');
        if(!reason || !reason.trim()) return;
        btn.disabled = true;
        try{
          await window.IFWL_MarketplaceAPI.voidMarketplaceTransaction(btn.dataset.voidTx, reason);
          await renderMarketplaceOverview();
        }catch(e){ alert('Could not void: ' + e.message); btn.disabled = false; }
      });
    });
  }

  // ✅ ADDED: Part Type Images - one shared image per part type, uploaded
  // via the same rtLicenceImageUpload pipeline every other IFWL image uses
  // (kind: 'partsMarketplaceImage', Owner-only server-side), then saved to
  // league_meta/partsMarketplaceImages via staffSavePartsMarketplaceImage.
  // Each part type uploads+saves independently - no combined "Save all".
  async function renderPartImagesPanel(){
    const grid = q('mktPartImagesGrid');
    if(!grid) return;
    grid.innerHTML = '<div class="empty">Loading&hellip;</div>';

    let images;
    try{ images = await window.IFWL_MarketplaceAPI.fetchPartsMarketplaceImages(); }
    catch(e){ grid.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }

    // ✅ CHANGED: Engine/Tuning/Aero shops are now 3-tier, so those four
    // durable part types (engine/suspension/damper/aero) each get a
    // separate image per Level 1/2/3 - a Level 3 part can look visibly
    // better than a Level 1 one. Tyre Factory has no tiers and stays a
    // single image. Each (partType, tier) slot is its own upload card,
    // keyed "partType" for tyre or "partType_tier" for the rest.
    const TIERED_PARTS = ['engine', 'suspension', 'damper', 'aero'];
    const slotCardHtml = (pt, tier) => {
      const key = tier ? `${pt}_${tier}` : pt;
      const url = tier ? (images[pt] && images[pt][tier]) : images[pt];
      const label = tier ? `${MKT_PART_LABEL[pt]} - Level ${tier}` : MKT_PART_LABEL[pt];
      return `
      <div class="shop-item-card aa-slot-card">
        <strong>${label}</strong>
        <div style="margin:8px 0">
          ${url
            ? `<img src="${url}" alt="${label}" style="width:100%;max-width:180px;height:100px;object-fit:cover;border-radius:8px;display:block;background:#f7f8fa">`
            : `<div style="width:100%;max-width:180px;height:100px;border-radius:8px;background:#f7f8fa;border:1px dashed var(--ifwl-line);display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:12px">No image set</div>`}
        </div>
        <input type="file" accept="image/png,image/jpeg" data-part-image-input="${key}" style="margin-bottom:6px">
        <button class="btn teal" type="button" data-part-image-upload="${key}" data-part-type="${pt}" data-part-tier="${tier || ''}">Upload</button>
        <span class="field-hint" data-part-image-status="${key}" style="display:block;margin-top:4px"></span>
      </div>`;
    };
    grid.innerHTML = slotCardHtml('tyre', null) + slotCardHtml('fuel', null) + TIERED_PARTS.map(pt => [1, 2, 3].map(tier => slotCardHtml(pt, tier)).join('')).join('');

    grid.querySelectorAll('[data-part-image-upload]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.partImageUpload;
        const pt = btn.dataset.partType;
        const tier = btn.dataset.partTier ? Number(btn.dataset.partTier) : null;
        const fileInput = grid.querySelector(`[data-part-image-input="${key}"]`);
        const status = grid.querySelector(`[data-part-image-status="${key}"]`);
        const file = fileInput.files[0];
        if(!file){ status.textContent = 'Choose a file first.'; return; }
        btn.disabled = true;
        status.textContent = 'Uploading...';
        try{
          const { url } = await window.IFWL_UploadAPI.uploadLicenceImage(file, 'partsMarketplaceImage');
          await window.IFWL_MarketplaceAPI.savePartsMarketplaceImage(pt, url, tier);
          await renderPartImagesPanel();
        }catch(e){
          status.textContent = 'Failed: ' + e.message;
          btn.disabled = false;
        }
      });
    });
  }

  function initMarketplacePanel(){
    if(!q('staffMarketplacePanel')) return;
    renderMarketplaceOverview();
    renderPartImagesPanel();
    q('mktRefreshBtn').onclick = renderMarketplaceOverview;
  }

  // ✅ ADDED: Entrylist Cross-Reference. Parses a SimGrid entrylist CSV
  // and/or the raw ACC server entrylist.json, matches every entry against
  // real licence profiles by name (neither file carries a Discord
  // username/ID), and gives staff two clean lists: matched drivers (with a
  // bulk "assign tier" action) and unmatched drivers (with a name list to
  // copy for reaching out on Discord).
  function ecrParseCsv(text){
    const rows = [];
    let i = 0, field = '', row = [], inQuotes = false;
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => { pushField(); rows.push(row); row = []; };
    while(i < text.length){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if(c === '"'){ inQuotes = true; i++; continue; }
      if(c === ','){ pushField(); i++; continue; }
      if(c === '\r'){ i++; continue; }
      if(c === '\n'){ pushRow(); i++; continue; }
      field += c; i++;
    }
    if(field.length || row.length) pushRow();
    if(!rows.length) return [];
    const headers = rows[0].map(h => h.trim().toLowerCase());
    return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => {
      const obj = {};
      headers.forEach((h, idx) => obj[h] = (r[idx] || '').trim());
      return obj;
    });
  }

  function ecrDecodeFile(file){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Could not read file'));
      fr.onload = () => {
        const buf = new Uint8Array(fr.result);
        // Detect BOM - the ACC entrylist.json comes out of the game server
        // as UTF-16LE, which readAsText() would otherwise mangle.
        let text;
        if(buf[0]===0xFF && buf[1]===0xFE) text = new TextDecoder('utf-16le').decode(buf.slice(2));
        else if(buf[0]===0xFE && buf[1]===0xFF) text = new TextDecoder('utf-16be').decode(buf.slice(2));
        else if(buf[0]===0xEF && buf[1]===0xBB && buf[2]===0xBF) text = new TextDecoder('utf-8').decode(buf.slice(3));
        else text = new TextDecoder('utf-8').decode(buf);
        resolve(text);
      };
      fr.readAsArrayBuffer(file);
    });
  }

  function ecrExtractFromCsv(rows){
    return rows.map(r => ({
      realName: r['real name'] || '',
      username: r['username'] || '',
      steamId: r['steam64_id'] || '',
      platform: r['platform'] || '',
      carNumber: r['car number'] || '',
      carName: r['car name'] || '',
      registeredAt: r['registered at'] || ''
    })).filter(e => e.realName);
  }

  function ecrExtractFromJson(text){
    let data;
    try{ data = JSON.parse(text); }catch(e){ throw new Error('Entrylist JSON could not be parsed: ' + e.message); }
    const entries = Array.isArray(data) ? data : (Array.isArray(data.entries) ? data.entries : []);
    return entries.map(e => {
      const d = (e.drivers || [])[0] || {};
      const realName = [d.firstName, d.lastName].map(s => (s||'').trim()).filter(Boolean).join(' ');
      return {
        realName,
        steamId: String(d.playerID || '').replace(/^S/i, ''),
        carNumber: String(e.raceNumber ?? ''),
        forcedCarModel: e.forcedCarModel
      };
    }).filter(e => e.realName);
  }

  function ecrNormName(s){
    return String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  }

  async function ecrRunCrossReference(){
    const status = q('ecrRunStatus');
    const resultsBox = q('ecrResults');
    status.textContent = 'Reading files...';
    resultsBox.innerHTML = '';

    try{
      // Gather entrylist entries from whichever source(s) are provided -
      // CSV preferred (has real name, platform and car number directly);
      // JSON entries are merged in by steamId, filling gaps if CSV alone
      // didn't cover everyone.
      let csvText = q('ecrCsvText').value.trim();
      const csvFile = q('ecrCsvFile').files[0];
      if(!csvText && csvFile) csvText = await ecrDecodeFile(csvFile);

      let jsonText = q('ecrJsonText').value.trim();
      const jsonFile = q('ecrJsonFile').files[0];
      if(!jsonText && jsonFile) jsonText = await ecrDecodeFile(jsonFile);

      if(!csvText && !jsonText){ status.textContent = 'Upload or paste at least one file (CSV or JSON).'; return; }

      const bySteamId = new Map();
      if(csvText){
        ecrExtractFromCsv(ecrParseCsv(csvText)).forEach(e => bySteamId.set(e.steamId || `name:${ecrNormName(e.realName)}`, e));
      }
      if(jsonText){
        ecrExtractFromJson(jsonText).forEach(e => {
          const key = e.steamId || `name:${ecrNormName(e.realName)}`;
          const existing = bySteamId.get(key);
          bySteamId.set(key, existing ? { ...e, ...existing } : e); // CSV fields win where both exist
        });
      }
      const entrylistDrivers = [...bySteamId.values()];
      if(!entrylistDrivers.length){ status.textContent = 'No usable entries found in the file(s) provided.'; return; }

      status.textContent = `Matching ${entrylistDrivers.length} entrant(s) against licence holders...`;
      const allProfiles = await staffSearch('');

      const matched = [];
      const unmatched = [];
      entrylistDrivers.forEach(entry => {
        const n = ecrNormName(entry.realName);
        const hit = allProfiles.find(p => {
          if(ecrNormName(p.name) === n) return true;
          return (p.accDriverNames||[]).some(a => { const an = ecrNormName(a); return an && (an.includes(n) || n.includes(an)); });
        });
        if(hit) matched.push({ entry, profile: hit });
        else unmatched.push(entry);
      });

      status.textContent = `${matched.length} matched, ${unmatched.length} not found.`;
      ecrRenderResults(matched, unmatched);
    }catch(e){
      status.textContent = 'Could not cross-reference: ' + e.message;
    }
  }

  async function ecrRenderResults(matched, unmatched){
    const box = q('ecrResults');
    const tiers = await window.IFWL_TierAPI.fetchTierList();

    const matchedHtml = matched.length ? `
      <h4 style="margin:0 0 10px">Matched - already IFWL licence holders (${matched.length})</h4>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
        <button class="btn ghost" id="ecrSelectAllBtn" type="button">Select all</button>
        <select id="ecrBulkTierSelect">${tiers.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}</select>
        <button class="btn teal" id="ecrAssignBtn" type="button">Assign tier to selected</button>
        <span class="save-status" id="ecrAssignStatus"></span>
      </div>
      <div class="table-wrap" style="max-height:340px;overflow-y:auto">
        <table class="fc-stint-table">
          <thead><tr><th></th><th>Entrylist Name</th><th>Licence Driver</th><th>Licence No.</th><th>Current Tier</th></tr></thead>
          <tbody>${matched.map(({entry, profile}) => `
            <tr>
              <td><input type="checkbox" class="ecr-match-check" data-driver-id="${profile.discordId}" checked></td>
              <td>${entry.realName}</td>
              <td>${profile.name}</td>
              <td>${profile.licenceNumber || '-'}</td>
              <td>${profile.tier || 'No Licence'}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    ` : '<div class="empty">No matches found.</div>';

    const unmatchedHtml = `
      <h4 style="margin:20px 0 10px">Not found - no IFWL licence (${unmatched.length})</h4>
      ${unmatched.length ? `
      <button class="btn ghost" id="ecrCopyNamesBtn" type="button" style="margin-bottom:10px">Copy names for Discord</button>
      <div class="table-wrap" style="max-height:300px;overflow-y:auto">
        <table class="fc-stint-table">
          <thead><tr><th>Entrylist Name</th><th>Platform</th><th>Car #</th><th>Steam64 ID</th></tr></thead>
          <tbody>${unmatched.map(e => `<tr><td>${e.realName}</td><td>${e.platform||'-'}</td><td>${e.carNumber||'-'}</td><td>${e.steamId||'-'}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : '<div class="empty">Everyone on the entrylist already has a licence.</div>'}
    `;

    box.innerHTML = matchedHtml + unmatchedHtml;

    q('ecrSelectAllBtn')?.addEventListener('click', () => {
      const boxes = [...box.querySelectorAll('.ecr-match-check')];
      const allChecked = boxes.every(c => c.checked);
      boxes.forEach(c => c.checked = !allChecked);
    });

    q('ecrAssignBtn')?.addEventListener('click', async () => {
      const astatus = q('ecrAssignStatus');
      const toTier = q('ecrBulkTierSelect').value;
      const driverIds = [...box.querySelectorAll('.ecr-match-check:checked')].map(c => c.dataset.driverId);
      if(!driverIds.length){ astatus.textContent = 'Nothing selected.'; return; }
      if(!confirm(`Set ${toTier} for ${driverIds.length} selected driver(s)?`)) return;
      astatus.textContent = 'Assigning...';
      try{
        const result = await window.IFWL_Api.apiPost('staffBulkAssignTierToDrivers', { driverIds, toTier, note: 'Entrylist cross-reference' });
        // ✅ FIXED: this used to only ever show "Done - N driver(s) updated",
        // even when N was 0 because everyone selected was already on that
        // tier (or, rarely, no longer had a licence doc) - indistinguishable
        // from the request silently doing nothing. Now spells out exactly
        // what happened to every selected driver, plus whether a Discord
        // announcement actually went out for this assignment.
        const parts = [`${result.updated} updated`];
        if(result.alreadyOnTier?.length) parts.push(`${result.alreadyOnTier.length} already on ${toTier}`);
        if(result.skipped?.length) parts.push(`${result.skipped.length} not found (no licence record)`);
        astatus.textContent = `Done - ${parts.join(', ')}. ${result.discordPosted ? 'Posted to Discord.' : 'No Discord post (no tier upgrades in this batch).'}`;
      }catch(e){ astatus.textContent = 'Could not assign: ' + e.message; }
    });

    q('ecrCopyNamesBtn')?.addEventListener('click', () => {
      const names = unmatched.map(e => e.realName).join('\n');
      navigator.clipboard?.writeText(names).then(() => {
        const btn = q('ecrCopyNamesBtn'); const old = btn.textContent;
        btn.textContent = 'Copied!'; setTimeout(() => { if(q('ecrCopyNamesBtn')) q('ecrCopyNamesBtn').textContent = old; }, 1500);
      }).catch(() => alert('Could not copy - your browser may be blocking clipboard access.'));
    });
  }

  function initEntrylistCrossRefPanel(){
    if(!q('entrylistCrossRefPanel')) return;
    q('ecrRunBtn').onclick = ecrRunCrossReference;
  }

  async function initAffiliateAdsPanel(){
    if(!q('staffAffiliateAdsPanel')) return;
    const wrap = q('aaSlots');
    const banners = (await window.IFWL_Api.apiGet('affiliateAds')).topBanners || [];

    wrap.innerHTML = '';
    aaRowCount = 0;
    banners.forEach(b => aaAddBannerRow(b));
    if(!banners.length) aaAddBannerRow();

    q('aaAddBtn').onclick = () => aaAddBannerRow();

    q('aaSaveBtn').onclick = async () => {
      const status = q('aaSaveStatus');
      status.textContent = 'Saving...';
      const topBanners = [...wrap.querySelectorAll('.aa-slot-card')].map(row => {
        const existingImg = row.querySelector('.se-preview-wrap img');
        return {
          imageUrl: row.dataset.newImageUrl || (existingImg ? existingImg.src : ''),
          linkUrl: row.querySelector('.aa-link').value.trim()
        };
      }).filter(b => b.imageUrl);
      try{
        await window.IFWL_Api.apiPost('staffAffiliateAdsSave', { topBanners });
        window.invalidateAffiliateAdsCache?.();
        window.applyAffiliateAds?.();
        status.textContent = 'Saved - live on the site now.';
        setTimeout(() => { if(q('aaSaveStatus')) q('aaSaveStatus').textContent = ''; }, 2000);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    };
  }

  // ============================================================
  // OWNER LICENCE CHECK (Owner only) - deep licence inspector with
  // delete / merge / link tools. All writes go through
  // ?staffOwnerLicenceAction=1 which re-checks Owner + typed licence number.
  // ============================================================
  let olcInited = false;
  function initOwnerLicenceCheck(){
    if(olcInited || !window.IFWL_OWNER || !document.getElementById('ownerLicenceCheckPanel')) return;
    olcInited = true;
    const $ = id => document.getElementById(id);
    const E = escRepair;
    const api = () => window.IFWL_Api;
    let mode = 'search';
    let current = null; // last loaded check payload

    const fmtMs = v => {
      if(v == null || v === '') return '-';
      const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
      if(isNaN(d.getTime())) return E(String(v));
      return d.toLocaleString(undefined, { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' }) + ' <span style="color:var(--text-muted)">(' + E(d.toISOString().slice(0,10)) + ')</span>';
    };
    const isTimeKey = (k, v) => typeof v === 'number' && v > 1e11 && v < 4e12 && /(Ms|At|Date|Time|Login|Seen)$/i.test(k);
    const fmtVal = (k, v) => {
      if(v == null || v === '') return '<span style="color:var(--text-muted)">-</span>';
      if(isTimeKey(k, v)) return fmtMs(v);
      if(typeof v === 'boolean') return v ? 'yes' : 'no';
      if(typeof v === 'string' && /^https?:\/\//.test(v)) return `<a href="${E(v)}" target="_blank" rel="noopener">${E(v.length > 70 ? v.slice(0,70) + '...' : v)}</a>`;
      if(typeof v === 'object'){
        let s = JSON.stringify(v);
        const long = s.length > 400;
        return `<code>${E(long ? s.slice(0,400) + '... (' + s.length + ' chars)' : s)}</code>`;
      }
      return E(String(v));
    };
    const kv = (rows) => `<table class="olc-kv">${rows.map(r => `<tr><td>${E(r[0])}</td><td>${r[1]}</td></tr>`).join('')}</table>`;
    const sec = (title, inner, open) => `<details class="olc-sec" ${open !== false ? 'open' : ''}><summary style="cursor:pointer;list-style:none;padding:10px 14px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;background:var(--surface-alt);color:var(--text-muted)">${E(title)}</summary><div class="in">${inner}</div></details>`;
    const badge = (t, cls) => `<span class="olc-badge ${cls || ''}">${E(t)}</span>`;
    const call = async (fn) => { try { return await fn(); } catch(e){ return { __error: e.message || String(e) }; } };

    // ---------- tabs / search
    function setMode(m){
      mode = m;
      $('olcTabs').querySelectorAll('[data-olc-mode]').forEach(b => { b.className = 'btn ' + (b.dataset.olcMode === m ? 'teal' : 'ghost'); });
      $('olcSearchRow').style.display = m === 'search' ? '' : 'none';
      $('olcList').innerHTML = '';
      if(m !== 'search') runList();
    }
    $('olcTabs').addEventListener('click', e => { const b = e.target.closest('[data-olc-mode]'); if(b) setMode(b.dataset.olcMode); });
    $('olcSearchBtn').onclick = () => runList();
    $('olcSearchInput').addEventListener('keydown', e => { if(e.key === 'Enter') runList(); });

    function driverRow(d, extra, note){
      const bits = [d.discordUsername && '@' + d.discordUsername, 'ID ' + d.discordId, d.simgridUsername && 'SimGrid: ' + d.simgridUsername, d.steamId && 'Steam: ' + d.steamId, (d.accDriverNames || []).length && 'ACC: ' + d.accDriverNames.join(', ')].filter(Boolean);
      return `<div class="olc-row"><div style="min-width:0;flex:1"><b>${E(d.name || '(no name)')}</b> <span style="color:var(--text-muted)">${E(d.licenceNumber || '')}</span> ${badge(d.tier || 'No Licence')}${d.patreonOutlineTier ? badge(d.patreonOutlineTier, 'amber') : ''}${d.banActive ? badge('Banned', 'red') : ''}<div class="meta">${E(bits.join(' · '))}</div>${note ? '<div class="meta" style="color:var(--ifwl-amber);font-weight:700">' + note + '</div>' : ''}<div class="meta">Created ${fmtMs(d.createdAtMs)} · last login ${fmtMs(d.lastLoginMs)}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn teal" type="button" data-olc-open="${E(d.discordId)}">Inspect</button>${extra || ''}</div></div>`;
    }
    async function runList(){
      const L = $('olcList');
      L.innerHTML = '<div class="empty">Loading&hellip;</div>';
      let r;
      if(mode === 'search'){
        const term = $('olcSearchInput').value.trim();
        if(term.length < 2){ L.innerHTML = '<div class="empty">Type at least 2 characters.</div>'; return; }
        r = await call(() => api().apiGet('staffOwnerLicenceSearch', '&term=' + encodeURIComponent(term)));
        if(r.__error){ L.innerHTML = `<div class="empty">${E(r.__error)}</div>`; return; }
        L.innerHTML = (r.drivers || []).length ? `<div class="field-hint">${r.count} match(es)${r.count > 40 ? ' - showing first 40' : ''}</div>` + r.drivers.map(d => driverRow(d)).join('') : '<div class="empty">No licences matched.</div>';
      } else if(mode === 'duplicates'){
        r = await call(() => api().apiGet('staffOwnerLicenceSearch', '&mode=duplicates'));
        if(r.__error){ L.innerHTML = `<div class="empty">${E(r.__error)}</div>`; return; }
        L.innerHTML = (r.groups || []).length ? `<div class="field-hint">Licences sharing the same Steam64, SimGrid name, Discord username, display name or ACC name. Not every match is a real duplicate - check before merging.</div>` + r.groups.map(g => `<div class="olc-sec"><h5>Same ${E(g.matchedOn)}: ${E(g.value)}</h5><div class="in">${g.drivers.map(d => driverRow(d)).join('')}</div></div>`).join('') : '<div class="empty">No possible duplicate accounts found.</div>';
      } else if(mode === 'blocklist'){
        r = await call(() => api().apiGet('staffOwnerLicenceSearch', '&mode=blocklist'));
        if(r.__error){ L.innerHTML = `<div class="empty">${E(r.__error)}</div>`; return; }
        L.innerHTML = (r.blocklist || []).length ? `<div class="field-hint">These Discord IDs can no longer auto-create a licence on login (set when you delete/merge with "block re-issue"). Unblock to let them get a fresh licence.</div>` + r.blocklist.map(b => `<div class="olc-row"><div><b>${E(b.discordId)}</b> ${E(b.name || '')} <span style="color:var(--text-muted)">${E(b.licenceNumber || '')}</span><div class="meta">${E(b.reason || '')} · ${fmtMs(b.blockedAtMs)} by ${E(b.blockedBy || '?')}${b.mergedInto ? ' · merged into ' + E(b.mergedInto) : ''}</div></div><div style="display:flex;gap:6px">${b.mergedInto ? `<button class="btn teal" type="button" data-olc-open="${E(b.mergedInto)}">Open kept account</button>` : ''}<button class="btn ghost" type="button" data-olc-unblock="${E(b.discordId)}">Unblock</button></div></div>`).join('') : '<div class="empty">Nothing is blocked.</div>';
      } else {
        r = await call(() => api().apiGet('staffOwnerLicenceSearch', '&mode=archive'));
        if(r.__error){ L.innerHTML = `<div class="empty">${E(r.__error)}</div>`; return; }
        L.innerHTML = (r.archive || []).length ? `<div class="field-hint">Full copies of deleted / merged-away licences, kept in Firestore collection <code>licence_deleted_archive</code> (latest 100). Open them in the Firebase console to restore data by hand.</div>` + r.archive.map(a => `<div class="olc-row"><div><b>${E(a.name || '(no name)')}</b> <span style="color:var(--text-muted)">${E(a.licenceNumber)}</span> ${badge(a.tier || '')}<div class="meta">Discord ID ${E(a.discordId)} · deleted ${fmtMs(a.deletedAtMs)} by ${E(a.deletedBy || '?')} · ${E(a.reason || '')}</div><div class="meta">Archive doc: <code>${E(a.archiveId)}</code></div></div></div>`).join('') : '<div class="empty">The archive is empty.</div>';
      }
    }
    $('ownerLicenceCheckPanel').addEventListener('click', async e => {
      const o = e.target.closest('[data-olc-open]'); if(o){ openCheck(o.dataset.olcOpen); return; }
      const u = e.target.closest('[data-olc-unblock]');
      if(u){
        if(!confirm('Unblock Discord ID ' + u.dataset.olcUnblock + '? They will be able to get a new licence on next login.')) return;
        const r = await call(() => api().apiPost('staffOwnerLicenceAction', { action:'unblock', id:u.dataset.olcUnblock }));
        if(r.__error) alert(r.__error); else runList();
      }
    });

    // ---------- full inspection
    const GROUPS = [
      ['Identity', ['name','discordId','discordUsername','licenceNumber','createdAtMs','lastLoginMs','updatedAtMs','platform','namePronunciation']],
      ['Licence & tier', ['tier','licencePoints','tierSetBy','tierUpdatedAtMs','teamName','teamId','lmuMainTier','lmuSubLicences','lmuSubLicenceHistory']],
      ['Racing identity', ['accDriverNames','simgridUsername','steamId','raceNumber','iracingId']],
      ['Patron & profile', ['patreonOutlineTier','patreonStatus','bio','avatarMode','avatarUrl','photoUploadUrl','headerUploadUrl','socials','callingCardId','calling_card','teamLogoUrl']],
      ['Career / shop', ['careerShopBalance','careerShopSeasonKey','careerShopOwnedItemIds','careerShopTransactions','ownedLiveryIds']],
      ['Peer ratings & moderation', ['peerRatingUpCount','peerRatingDownCount','ban','linkedAccounts','mergedFrom']]
    ];
    function glanceHtml(raw){
      const used = new Set(); const parts = [];
      GROUPS.forEach(([title, keys]) => {
        const rows = keys.filter(k => k in raw).map(k => { used.add(k); return [k, fmtVal(k, raw[k])]; });
        if(rows.length) parts.push(`<div class="field-hint" style="margin:10px 0 4px;font-weight:800">${E(title)}</div>` + kv(rows));
      });
      const rest = Object.keys(raw).filter(k => !used.has(k)).sort().map(k => [k, fmtVal(k, raw[k])]);
      if(rest.length) parts.push(`<div class="field-hint" style="margin:10px 0 4px;font-weight:800">Every other stored field (${rest.length})</div>` + kv(rest));
      return parts.join('');
    }
    async function openCheck(id){
      const R = $('olcResult');
      R.innerHTML = '<div class="empty">Loading everything stored for ' + E(id) + '&hellip;</div>';
      R.scrollIntoView({ behavior:'smooth', block:'start' });
      const r = await call(() => api().apiGet('staffOwnerLicenceCheck', '&id=' + encodeURIComponent(id)));
      if(r.__error){
        R.innerHTML = `<div class="notice-card">${E(r.__error)}</div>`;
        return;
      }
      current = r;
      const s = r.summary, raw = r.raw || {}, dsc = r.discord || {};
      const photo = raw.avatarMode === 'upload' && raw.photoUploadUrl ? raw.photoUploadUrl : (raw.avatarMode === 'url' && raw.avatarUrl ? raw.avatarUrl : '');
      const discAv = dsc.user && dsc.user.avatar ? `https://cdn.discordapp.com/avatars/${dsc.user.id}/${dsc.user.avatar}.png?size=128` : '';
      const badges = [badge(s.tier || 'No Licence'), s.patreonOutlineTier ? badge('Patron: ' + s.patreonOutlineTier, 'amber') : '', s.banActive ? badge('Banned', 'red') : '', r.blocked ? badge('Discord ID blocked', 'red') : '', dsc.ok && dsc.inGuild === false ? badge('Not in Discord server', 'red') : (dsc.inGuild ? badge('In Discord server', 'green') : ''), (r.linkedAccounts || []).length ? badge('Linked to ' + r.linkedAccounts.length, 'green') : '', (r.mergedFrom || []).length ? badge('Merged ' + r.mergedFrom.length, 'green') : '', (r.duplicates || []).length ? badge((r.duplicates.length) + ' possible duplicate(s)', 'amber') : ''].join('');
      const totalRelated = (r.related || []).reduce((n, x) => n + (x.count || 0), 0);
      let html = `<div class="olc-head"><img src="${E(photo || discAv || 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22><rect width=%2264%22 height=%2264%22 fill=%22%231a2027%22/></svg>')}" alt=""><div style="flex:1;min-width:200px"><h4>${E(s.name || '(no name)')} <span style="color:var(--text-muted);font-size:14px">${E(s.licenceNumber)}</span></h4><div class="meta" style="font-size:12px;color:var(--text-muted)">Discord ID <code>${E(r.discordId)}</code> ${s.discordUsername ? '· @' + E(s.discordUsername) : ''}</div><div class="olc-badges">${badges}</div></div></div>
      <div class="olc-actions">
        <button class="btn teal" type="button" id="olcOpenEditor">Open in standard licence editor</button>
        <button class="btn ghost" type="button" id="olcLinkBtn">Link to another account</button>
        <button class="btn ghost" type="button" id="olcMergeBtn">Merge with another account</button>
        <button class="btn red" type="button" id="olcDeleteBtn" style="background:var(--ifwl-red);color:#fff">Delete this licence</button>
        <button class="btn ghost" type="button" id="olcRefreshBtn">Refresh</button>
      </div>
      <div class="olc-grid"><div id="olcLeft"><div id="olcCard"><div class="empty">Loading licence card&hellip;</div></div><div id="olcLaps" style="margin-top:12px"></div><div id="olcSandbag" style="margin-top:12px"></div></div><div>`;

      html += sec('At a glance - everything stored on the licence', glanceHtml(raw));

      // discord live
      let dHtml;
      if(!dsc.ok) dHtml = `<div class="field-hint">Could not read Discord${dsc.error ? ': ' + E(dsc.error) : ''}.</div>`;
      else if(!dsc.inGuild) dHtml = '<div class="field-hint" style="color:var(--ifwl-red)">This Discord ID is NOT currently a member of the server (left, banned or never joined).</div>';
      else dHtml = kv([['Server nickname', E(dsc.nick || '-')], ['Username', E(dsc.user.username || '-')], ['Global name', E(dsc.user.globalName || '-')], ['Joined server', fmtMs(dsc.joinedAt)], ['Pending screening', dsc.pending ? 'yes' : 'no']]) + `<div class="field-hint" style="margin:10px 0 4px;font-weight:800">Roles (${dsc.roles.length})</div><div class="olc-roles">${dsc.roles.map(x => badge(x.name)).join('') || '-'}</div>`;
      html += sec('Live Discord status', dHtml);

      // histories
      const th = Array.isArray(raw.tierHistory) ? raw.tierHistory.slice().reverse() : [];
      html += sec('Tier history (' + th.length + ')', th.length ? `<table class="olc-kv">${th.map(h => `<tr><td>${fmtMs(h.dateMs || h.date)}</td><td><b>${E(h.tier || '')}</b>${h.reason ? ' - ' + E(h.reason) : ''}${h.setBy ? ' <span style="color:var(--text-muted)">by ' + E(h.setBy) + '</span>' : ''}</td></tr>`).join('')}</table>` : '<div class="field-hint">No tier history stored.</div>', th.length > 0 && th.length < 15);

      // linked / merged
      const la = r.linkedAccounts || [], mf = r.mergedFrom || [];
      html += sec('Linked & merged accounts', (la.length ? `<div class="field-hint" style="font-weight:800">Linked (same person, both kept)</div>` + la.map(x => `<div class="olc-row"><div><b>${E(x.name || '')}</b> ${E(x.licenceNumber || '')} <span class="meta">ID ${E(x.id)} · ${fmtMs(x.linkedAtMs)} by ${E(x.linkedBy || '?')}${x.note ? ' · ' + E(x.note) : ''}</span></div><div style="display:flex;gap:6px"><button class="btn teal" type="button" data-olc-open="${E(x.id)}">Inspect</button><button class="btn ghost" type="button" data-olc-unlink="${E(x.id)}">Unlink</button></div></div>`).join('') : '') + (mf.length ? `<div class="field-hint" style="font-weight:800;margin-top:8px">Merged into this licence</div>` + kv(mf.map(x => [x.name + ' ' + (x.licenceNumber || ''), 'ID ' + E(x.id) + ' · ' + (x.discordUsername ? '@' + E(x.discordUsername) + ' · ' : '') + fmtMs(x.mergedAtMs) + ' by ' + E(x.mergedBy || '?')])) : '') || '<div class="field-hint">Not linked to or merged with any other account.</div>', la.length || mf.length);

      // related footprint
      html += sec('Related records elsewhere in Firestore (' + totalRelated + ')', kv((r.related || []).map(x => [x.label, x.error ? '<span style="color:var(--ifwl-red)">error: ' + E(x.error) + '</span>' : `<b>${x.count}</b> <span style="color:var(--text-muted)">in <code>${E(x.collection)}</code>.${E(x.field)}</span>`]).concat([['Refusal notice', r.refusalNotice ? 'yes' : 'none'], ['Blocklist entry', r.blocked ? `<span style="color:var(--ifwl-red)">BLOCKED</span> ${E(r.blocked.reason || '')} <button class="btn ghost" type="button" data-olc-unblock="${E(r.discordId)}" style="font-size:11px;padding:3px 8px">Unblock</button>` : 'none']])));

      // subcollections
      html += sec('Sub-collections on the licence (' + (r.subcollections || []).length + ')', (r.subcollections || []).length ? r.subcollections.map(sc => `<details style="margin-bottom:8px"><summary><b>${E(sc.name)}</b> - ${sc.count} document(s)</summary><pre class="olc-raw">${E(JSON.stringify(sc.docs, null, 2))}</pre></details>`).join('') : '<div class="field-hint">None (no staff notes or DM log).</div>', false);

      // duplicates
      const dup = r.duplicates || [];
      html += sec('Possible duplicate accounts (' + dup.length + ')', dup.length ? dup.map(d => driverRow(d, `<button class="btn ghost" type="button" data-olc-merge="${E(d.discordId)}">Merge</button><button class="btn ghost" type="button" data-olc-link="${E(d.discordId)}">Link</button>`, 'Matches on: ' + E((d.reasons || []).join(', ')))).join('') : '<div class="field-hint">Nothing else in the licence database shares this driver\'s Steam64, SimGrid name, Discord username, licence number, display name or ACC name.</div>', dup.length > 0);

      // raw
      html += sec('Raw Firestore document', `<button class="btn ghost" type="button" id="olcCopyRaw" style="font-size:11px;padding:6px 10px;margin-bottom:8px">Copy JSON</button><pre class="olc-raw" id="olcRawPre"></pre>`, false);
      html += '</div></div>';
      $('olcResult').innerHTML = html;
      $('olcRawPre').textContent = JSON.stringify(raw, null, 2);
      $('olcCopyRaw').onclick = () => { try{ navigator.clipboard.writeText(JSON.stringify(raw, null, 2)); $('olcCopyRaw').textContent = 'Copied'; }catch(e){} };
      $('olcOpenEditor').onclick = () => {
        const nav = document.querySelector('button[data-view="staffLicenceManagement"]'); if(nav) nav.click();
        setTimeout(() => { try{ openEditor(r.discordId); }catch(e){ alert('Could not open the editor: ' + e.message); } }, 60);
      };
      $('olcRefreshBtn').onclick = () => openCheck(r.discordId);
      $('olcDeleteBtn').onclick = () => openDeleteModal(r);
      $('olcMergeBtn').onclick = () => openMergeModal(r, null);
      $('olcLinkBtn').onclick = () => openLinkModal(r, '');
      $('olcResult').querySelectorAll('[data-olc-merge]').forEach(b => b.onclick = () => openMergeModal(r, b.dataset.olcMerge));
      $('olcResult').querySelectorAll('[data-olc-link]').forEach(b => b.onclick = () => openLinkModal(r, b.dataset.olcLink));
      $('olcResult').querySelectorAll('[data-olc-unlink]').forEach(b => b.onclick = async () => {
        if(!confirm('Remove the link between these two accounts?')) return;
        const x = await call(() => api().apiPost('staffOwnerLicenceAction', { action:'unlink', id:r.discordId, otherId:b.dataset.olcUnlink }));
        if(x.__error) alert(x.__error); else openCheck(r.discordId);
      });

      // async extras: the same card / lap status / sandbagging a normal licence check shows
      (async () => {
        try{
          const perf = await window.fetchPerformanceStats(raw);
          if($('olcCard')) $('olcCard').innerHTML = buildStaffCardPreviewHtml(raw, perf);
        }catch(e){ if($('olcCard')) $('olcCard').innerHTML = buildStaffCardPreviewHtml(raw, null); }
        try{ if($('olcLaps')) $('olcLaps').innerHTML = await buildLapStatusHtml(raw.accDriverNames || []); }catch(e){}
        try{
          if((raw.accDriverNames || []).length && window.IFWLStats && window.IFWLStats.fetchSandbaggingReview){
            const sr = await window.IFWLStats.fetchSandbaggingReview(raw.accDriverNames);
            const h = buildSandbaggingReviewInnerHtml(sr);
            if(h && $('olcSandbag')) $('olcSandbag').innerHTML = `<div class="sandbag-review">${h}</div>`;
          }
        }catch(e){}
      })();
    }

    // ---------- modal plumbing
    function modal(inner){
      let m = $('olcModal');
      if(!m){ m = document.createElement('div'); m.id = 'olcModal'; document.body.appendChild(m); m.addEventListener('mousedown', e => { if(e.target === m) closeModal(); }); }
      m.innerHTML = `<div class="box">${inner}</div>`;
      m.classList.add('open');
      return m;
    }
    function closeModal(){ const m = $('olcModal'); if(m) m.classList.remove('open'); }
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    // ---------- delete
    function openDeleteModal(r){
      const s = r.summary;
      const related = r.related || [];
      const m = modal(`<h4 style="color:var(--ifwl-red)">Delete licence permanently</h4>
        <div><b>${E(s.name)}</b> ${E(s.licenceNumber)} - Discord ID <code>${E(r.discordId)}</code></div>
        <div class="field-hint" style="margin:8px 0">This removes the licence document and its staff notes / DM log from Firebase. It does NOT change Discord roles.</div>
        <div class="opt"><input type="checkbox" id="olcDArchive" checked><label for="olcDArchive"><b>Save a full copy first</b> in <code>licence_deleted_archive</code> (strongly recommended - the only way to undo)</label></div>
        <div class="opt"><input type="checkbox" id="olcDBlock" checked><label for="olcDBlock"><b>Block re-issue</b> - this Discord ID can't auto-create a new licence on login (untick if the player should be able to start fresh)</label></div>
        <div class="field-hint" style="margin-top:10px;font-weight:800">Also delete these related records:</div>
        ${related.map(x => `<div class="opt"><input type="checkbox" data-olc-rel="${E(x.key)}" id="olcR_${E(x.key)}" ${x.count ? 'checked' : 'disabled'}><label for="olcR_${E(x.key)}">${E(x.label)} <span style="color:var(--text-muted)">(${x.count})</span></label></div>`).join('')}
        <div class="field-group" style="margin-top:10px"><label>Reason (stored in the archive)</label><input type="text" id="olcDReason" placeholder="e.g. duplicate account - kept main account"></div>
        <div class="plan" id="olcDPlan">Building preview&hellip;</div>
        <div class="field-group"><label>Type the licence number <code>${E(s.licenceNumber)}</code> to confirm</label><input type="text" id="olcDConfirm" autocomplete="off"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn ghost" type="button" id="olcDCancel">Cancel</button><button class="btn" type="button" id="olcDGo" disabled style="background:var(--ifwl-red);color:#fff">Delete permanently</button></div>
        <div id="olcDMsg" class="field-hint"></div>`);
      const collect = () => ({ action:'delete', id:r.discordId, archive:$('olcDArchive').checked, block:$('olcDBlock').checked, reason:$('olcDReason').value.trim(), relatedKeys:[...m.querySelectorAll('[data-olc-rel]:checked')].map(c => c.dataset.olcRel), confirmLicenceNumber:$('olcDConfirm').value.trim() });
      const preview = async () => {
        const x = await call(() => api().apiPost('staffOwnerLicenceAction', { ...collect(), dryRun:true }));
        if(x.__error){ $('olcDPlan').textContent = x.__error; return; }
        const p = x.plan;
        $('olcDPlan').innerHTML = `<b>Preview - nothing has been changed yet</b><ul style="margin:6px 0 0 18px"><li>Delete licence document <code>licences/${E(r.discordId)}</code></li>${p.subcollections.map(sc => `<li>Delete ${sc.count} document(s) in <code>${E(sc.name)}</code></li>`).join('')}${p.related.filter(x => x.willDelete).map(x => `<li>Delete ${x.count} x ${E(x.label)}</li>`).join('')}${p.related.filter(x => !x.willDelete && x.count).map(x => `<li style="color:var(--text-muted)">KEEP ${x.count} x ${E(x.label)}</li>`).join('')}${p.refusalNotice ? '<li>Delete refusal notice</li>' : ''}<li>${p.archive ? 'Archive a full copy first' : '<b style="color:var(--ifwl-red)">NO archive copy - cannot be undone</b>'}</li><li>${p.block ? 'Block this Discord ID from auto re-creating a licence' : 'Do not block - a new licence is created if they log in again'}</li></ul>`;
      };
      const pv = debounce(preview, 250);
      m.querySelectorAll('input[type=checkbox]').forEach(c => c.onchange = pv);
      preview();
      $('olcDConfirm').oninput = () => { $('olcDGo').disabled = $('olcDConfirm').value.trim().toUpperCase() !== String(s.licenceNumber).toUpperCase(); };
      $('olcDCancel').onclick = closeModal;
      $('olcDGo').onclick = async () => {
        $('olcDGo').disabled = true; $('olcDMsg').textContent = 'Deleting...';
        const x = await call(() => api().apiPost('staffOwnerLicenceAction', collect()));
        if(x.__error){ $('olcDMsg').textContent = x.__error; $('olcDGo').disabled = false; return; }
        closeModal();
        $('olcResult').innerHTML = `<div class="notice-card">Deleted <b>${E(s.name)}</b> (${E(s.licenceNumber)}).${x.archiveId ? ' Archived as <code>' + E(x.archiveId) + '</code>.' : ''}${x.blocked ? ' Discord ID blocked from re-issue.' : ''}</div>`;
        $('olcList').innerHTML = ''; if(mode !== 'search') runList();
      };
    }

    // ---------- merge
    async function lookupSummary(id){
      const x = await call(() => api().apiGet('staffOwnerLicenceSearch', '&term=' + encodeURIComponent(id)));
      if(x.__error) return null;
      return (x.drivers || []).find(d => d.discordId === id) || null;
    }
    function openMergeModal(r, otherId){
      const s = r.summary;
      const m = modal(`<h4>Merge two accounts into one</h4>
        <div class="field-hint">Everything useful is combined onto the account you KEEP; the other licence is archived, deleted, and its Discord ID blocked so it can't come back. Ratings given by / about the deleted account are removed.</div>
        <div class="field-group" style="margin-top:10px"><label>Other account's Discord ID</label><input type="text" id="olcMOther" value="${E(otherId || '')}" placeholder="Discord ID of the other licence" inputmode="numeric"></div>
        <div id="olcMOtherInfo" class="field-hint"></div>
        <div class="field-group"><label>Which account do you want to KEEP?</label><select id="olcMKeep"><option value="current">Keep THIS one: ${E(s.name)} (${E(s.licenceNumber)})</option><option value="other">Keep the OTHER one</option><option value="swap">Keep the OTHER licence, but put it on THIS Discord account (use when the other licence\'s Discord login is lost)</option><option value="new">Neither - move this licence to a NEW Discord ID that has no licence yet</option></select></div>
        <div class="field-group" id="olcMNewWrap" style="display:none"><label>New Discord ID (this licence moves here)</label><input type="text" id="olcMNew" inputmode="numeric"></div>
        <div class="field-group"><label>Tier rule</label><select id="olcMTier"><option value="higher">Keep the higher tier of the two</option><option value="target">Keep the kept account's tier</option><option value="source">Use the removed account's tier</option></select></div>
        <div class="opt"><input type="checkbox" id="olcMCareer"><label for="olcMCareer">Add career shop balances together (only if both are on the same season)</label></div>
        <div class="opt"><input type="checkbox" id="olcMNotes" checked><label for="olcMNotes">Copy staff notes / DM log to the kept account</label></div>
        <div class="opt"><input type="checkbox" id="olcMRepoint" checked><label for="olcMRepoint">Re-point threads, requests, trophies and role grants to the kept account</label></div>
        <div class="opt"><input type="checkbox" id="olcMArchive" checked><label for="olcMArchive">Archive a full copy of the removed licence first</label></div>
        <div class="opt"><input type="checkbox" id="olcMBlock" checked><label for="olcMBlock">Block the removed Discord ID from auto-creating a new licence</label></div>
        <div class="plan" id="olcMPlan">Enter the other Discord ID to see a preview.</div>
        <div class="field-group"><label>Type the licence number being REMOVED to confirm: <code id="olcMNeed">-</code></label><input type="text" id="olcMConfirm" autocomplete="off"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn ghost" type="button" id="olcMCancel">Cancel</button><button class="btn teal" type="button" id="olcMGo" disabled>Merge now</button></div>
        <div id="olcMMsg" class="field-hint"></div>`);
      let other = null, need = '';
      const ids = () => {
        const keep = $('olcMKeep').value;
        if(keep === 'swap') return { keepId:$('olcMOther').value.trim(), toId:r.discordId };
        if(keep === 'new') return { sourceId:r.discordId, targetId:$('olcMNew').value.trim(), createTarget:true };
        if(keep === 'other') return { sourceId:r.discordId, targetId:$('olcMOther').value.trim(), createTarget:false };
        return { sourceId:$('olcMOther').value.trim(), targetId:r.discordId, createTarget:false };
      };
      const body = () => ({ action:($('olcMKeep').value === 'swap' ? 'reassign' : 'merge'), ...ids(), tierRule:$('olcMTier').value, addCareerBalance:$('olcMCareer').checked, moveNotes:$('olcMNotes').checked, repointRelated:$('olcMRepoint').checked, archive:$('olcMArchive').checked, block:$('olcMBlock').checked, confirmLicenceNumber:$('olcMConfirm').value.trim() });
      const setNeed = () => {
        const keep = $('olcMKeep').value;
        need = keep === 'current' ? (other ? other.licenceNumber : '') : s.licenceNumber;
        $('olcMNeed').textContent = need || '-';
        $('olcMConfirm').oninput();
      };
      const preview = async () => {
        const b = body();
        $('olcMNewWrap').style.display = $('olcMKeep').value === 'new' ? '' : 'none';
        const needOther = $('olcMKeep').value !== 'new';
        if(needOther && !/^\d{5,25}$/.test($('olcMOther').value.trim())){ $('olcMPlan').textContent = 'Enter the other account\'s Discord ID to see a preview.'; return; }
        if(!needOther && !/^\d{5,25}$/.test(b.targetId)){ $('olcMPlan').textContent = 'Enter the new Discord ID to see a preview.'; return; }
        const x = await call(() => api().apiPost('staffOwnerLicenceAction', { ...b, dryRun:true }));
        if(x.__error){ $('olcMPlan').textContent = x.__error; return; }
        const p = x.plan;
        const line = d => `${E(d.name || '(no name)')} ${E(d.licenceNumber || '')} ${d.discordId ? '<span style="color:var(--text-muted)">ID ' + E(d.discordId) + '</span>' : ''}`;
        $('olcMPlan').innerHTML = `<b>Preview - nothing has been changed yet</b><div style="margin:6px 0"><span style="color:var(--ifwl-green)">KEEP:</span> ${line(p.target)}<br><span style="color:var(--ifwl-red)">REMOVE:</span> ${line(p.source)}</div>${p.changes.length ? `<table class="olc-kv">${p.changes.map(c => `<tr><td>${E(c.field)}</td><td>${c.from == null || c.from === '' ? '<i>empty</i>' : fmtVal(c.field, c.from)} &rarr; <b>${c.to == null ? '' : (typeof c.to === 'object' ? E(JSON.stringify(c.to)) : E(String(c.to)))}</b> <span style="color:var(--text-muted)">(${E(c.rule || '')})</span></td></tr>`).join('')}</table>` : '<div>No field changes on the kept account.</div>'}${p.repoint.length ? '<div>Re-pointed: ' + p.repoint.map(x => E(x.label) + ' x' + x.count).join(', ') + '</div>' : ''}${p.notesCopied.length ? '<div>Copied: ' + p.notesCopied.map(x => E(x.name) + ' x' + x.count).join(', ') + '</div>' : ''}<div>Removed licence: ${p.deleteSource.archive ? 'archived, ' : '<b>NOT archived</b>, '}${p.deleteSource.block ? 'Discord ID blocked' : 'not blocked'}.</div>`;
        if($('olcMKeep').value === 'swap'){
          $('olcMPlan').innerHTML += `<div style="margin-top:8px;padding:8px;border-left:3px solid var(--ifwl-amber,#f5a524)"><b>Then:</b> the kept licence is moved onto <b>this</b> Discord account (ID ${E(r.discordId)}). The other Discord ID's copy is archived (the block option above is not used here), and this account's own licence is merged into it first.${x.reassign && x.reassign.targetBlocked ? ' <span style="color:var(--ifwl-red)">This Discord ID is on the block list - it will be unblocked.</span>' : ''}</div>`;
        }
      };
      const pv = debounce(async () => {
        const oid = $('olcMOther').value.trim();
        if(/^\d{5,25}$/.test(oid) && (!other || other.discordId !== oid)){
          other = await lookupSummary(oid);
          $('olcMOtherInfo').innerHTML = other ? `Found: <b>${E(other.name)}</b> ${E(other.licenceNumber)} - ${E(other.tier)} ${other.discordUsername ? '· @' + E(other.discordUsername) : ''}` : '<span style="color:var(--ifwl-red)">No licence stored under that Discord ID.</span>';
        }
        setNeed(); preview();
      }, 300);
      m.querySelectorAll('input,select').forEach(el => { if(el.type === 'checkbox' || el.tagName === 'SELECT' || el.id === 'olcMOther' || el.id === 'olcMNew') el.addEventListener(el.type === 'text' ? 'input' : 'change', pv); });
      $('olcMConfirm').oninput = () => { $('olcMGo').disabled = !need || $('olcMConfirm').value.trim().toUpperCase() !== String(need).toUpperCase(); };
      $('olcMCancel').onclick = closeModal;
      if(otherId) pv(); else setNeed();
      $('olcMGo').onclick = async () => {
        $('olcMGo').disabled = true; $('olcMMsg').textContent = 'Merging...';
        const b = body();
        const x = await call(() => api().apiPost('staffOwnerLicenceAction', b));
        if(x.__error){ $('olcMMsg').textContent = x.__error; $('olcMGo').disabled = false; return; }
        closeModal();
        $('olcList').innerHTML = ''; if(mode !== 'search') runList();
        openCheck(x.targetId || b.targetId);
      };
    }

    // ---------- link
    function openLinkModal(r, otherId){
      const s = r.summary;
      modal(`<h4>Link to another account</h4>
        <div class="field-hint">Records that two licences belong to the same person without merging them. Both licences stay; each shows the other under "Linked & merged accounts".</div>
        <div class="field-group" style="margin-top:10px"><label>Other account's Discord ID</label><input type="text" id="olcLOther" value="${E(otherId || '')}" inputmode="numeric"></div>
        <div id="olcLInfo" class="field-hint"></div>
        <div class="field-group"><label>Note (optional)</label><input type="text" id="olcLNote" placeholder="e.g. main account / alt on phone"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn ghost" type="button" id="olcLCancel">Cancel</button><button class="btn teal" type="button" id="olcLGo">Link accounts</button></div>
        <div id="olcLMsg" class="field-hint"></div>`);
      const look = debounce(async () => {
        const oid = $('olcLOther').value.trim();
        if(!/^\d{5,25}$/.test(oid)){ $('olcLInfo').textContent = ''; return; }
        const d = await lookupSummary(oid);
        $('olcLInfo').innerHTML = d ? `Found: <b>${E(d.name)}</b> ${E(d.licenceNumber)} - ${E(d.tier)}` : '<span style="color:var(--ifwl-red)">No licence stored under that Discord ID.</span>';
      }, 300);
      $('olcLOther').addEventListener('input', look); if(otherId) look();
      $('olcLCancel').onclick = closeModal;
      $('olcLGo').onclick = async () => {
        $('olcLMsg').textContent = 'Linking...';
        const x = await call(() => api().apiPost('staffOwnerLicenceAction', { action:'link', id:r.discordId, otherId:$('olcLOther').value.trim(), note:$('olcLNote').value.trim() }));
        if(x.__error){ $('olcLMsg').textContent = x.__error; return; }
        closeModal(); openCheck(r.discordId);
      };
    }

    // deep link from other tools: window.IFWL_OwnerLicenceCheck.open(id)
    window.IFWL_OwnerLicenceCheck = { open: id => { const nav = document.querySelector('button[data-view="staffOwnerLicenceCheck"]'); if(nav) nav.click(); setTimeout(() => openCheck(id), 60); } };
    setMode('search');
  }

  function initStaffPanels(){
    if(staffPanelsInited || !window.IFWL_STAFF) return;
    staffPanelsInited = true;
    initTierManager();
    initNewQualifiers();
    initLmuRepair();
    initOwnerLicenceCheck();
    renderRequestQueue();
    renderLmuRequestQueue();
    // ✅ FIXED: these used to fire in parallel (neither awaited) - since
    // renderSimgridEventList()'s bulk toolbar reads the LMU tier list
    // renderTierCheckboxes() caches (sgLmuTiersCache), that cache was still
    // empty the first time the toolbar rendered, so the bulk "Set as LMU"
    // tool showed "No LMU sub-licences set up yet" even when some existed,
    // until something else happened to re-render the list later. Now the
    // tier checkboxes (and the cache) are always in place first.
    (async () => { await renderTierCheckboxes(); renderSimgridEventList(); })();
    initEnduranceEventPanel();
    initRacedayInfoPanel();
    renderCallingCardList();
    renderPatreonLiveryManageList('acc', 'palList');
    renderPatreonLiveryManageList('lmu', 'palListLmu');
    renderPatreonLiveryManageList('ets2', 'palListEts2');
    renderLicenceQualPanel('PC', 'pc-licence');
    renderLicenceQualPanel('Console', 'console-licence');
    initSeasonWindowPanel();
    initCareerSystemPanel();
    initQualificationWindowPanel();
    initStaffMessagesPanel();
    initBulkTierTool();
    renderNameAudit();
    initSystemStatusPanel();
    renderLicenceDatabase();
    renderStaffAlertsPanel();
    renderAcRallyStaffPanel();
    renderRlStaffPanel();
    renderStaffTrophyCabinet();
    initAffiliateAdsPanel();
    initStaffBopTrackerPanel();
    initCareerShopPanel();
    initMarketplacePanel();
    initEntrylistCrossRefPanel();
    window.initOpsRaceTeamsPanel?.();
    initSponsorshipsPanel();
    initTitleSponsorPanel();
    initSeasonalCostsPanel();
    initSeasonStartPaymentsPanel();
    initWelcomeBonusPanel();
    initMessageTemplatesPanel();
    initRaceEarningsSettlementPanel();
    initClassStructurePanel();
    renderSeasonalEventsPanel();
  }
  window.addEventListener('ifwl-auth-changed', initStaffPanels);
  if(window.IFWL_STAFF) initStaffPanels(); // covers an already-resolved session on this load
  if(window.IFWL_COMMENTATOR || window.IFWL_OWNER) { window.initCommentatorPanel?.(); window.initDriverLookupPanel?.(); }
})();
