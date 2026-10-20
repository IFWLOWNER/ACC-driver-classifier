
/* ============================================================
   LICENCE DATA LAYER
   Talks to the SAME rtGate Cloud Function, using new query
   actions that don't exist yet and need to be added server-side:
     ?licenceProfile=1&token=...          (GET,  own profile - creates+issues a licence number on first call)
     ?updateLicenceProfile=1&token=...    (POST, whitelisted fields only, tier-checked server-side)
     ?uploadLicenceImage=1&token=...      (POST, {kind:'photo'|'header', dataUrl}, Gold-only, <=5MB, server-checked)
     ?tickets=1&token=...                 (GET,  Gold-only, matches tickets.accused against driver's linked ACC names)
     ?licenceDirectory=1                  (GET,  public list of issued licences)
     ?staffLicence=1&token=...            (GET/POST, staff-only: search/edit any profile, notes, tier override)

   Until those exist, every call below falls back to a per-browser
   localStorage mock (prefixed IFWL_LICENCE_DEMO:) so this page is
   fully clickable today. Swap USE_DEMO_FALLBACK to false once the
   backend is live - nothing else in this file needs to change.
   ============================================================ */
(() => {
  const USE_DEMO_FALLBACK = false;
  const FN = window.IFWL_AUTH?.FUNCTION || '';
  const q = id => document.getElementById(id);

  function demoKey(k){return 'IFWL_LICENCE_DEMO:'+k}
  function demoGet(k,fallback){try{const v=localStorage.getItem(demoKey(k));return v?JSON.parse(v):fallback}catch(_){return fallback}}
  function demoSet(k,v){try{localStorage.setItem(demoKey(k),JSON.stringify(v))}catch(_){}}

  // Tiers used to be a fixed list baked into this file - now they're just data,
  // editable from the Staff: Manage Licence Tiers panel. `order` controls ladder
  // position (lowest first); `foil` optionally gives a tier the animated card
  // treatment (originally reserved for the top tier, but any tier can have it).
  const DEFAULT_TIERS = [
    { id:'no_licence',  name:'No Licence',   order:0, color:'#4b5760', foil:false, lmuSubLicence:false, description:'Registered but not yet raced a scored session.' },
    { id:'provisional', name:'Provisional',  order:1, color:'#ffb238', foil:false, lmuSubLicence:false, description:'Completed onboarding, awaiting first clean results.' },
    { id:'gt3_beginner',name:'GT3 Beginner', order:2, color:'#1fd6bd', foil:false, lmuSubLicence:false, description:'Cleared for Beginner-class races.' },
    { id:'gt3_amateur', name:'GT3 Amateur',  order:3, color:'#c65be8', foil:false, lmuSubLicence:false, description:'Consistent pace and a clean incident record.' },
    { id:'gt3_pro',     name:'GT3 Pro',      order:4, color:'#eaf3ff', foil:true,  lmuSubLicence:false, description:'Top tier — proven pace across a full season.' }
  ];

  // Server contract:
  //   ?licenceTierList=1                          (GET, public - anyone viewing the page needs the ladder)
  //   ?staffLicenceTierSave=1&token=...  {tiers}   (POST, staff-only - replaces the whole list atomically)
  async function fetchTierList(){
    if(USE_DEMO_FALLBACK) return demoGet('tiers', DEFAULT_TIERS);
    try{ return (await apiGet('licenceTierList')).tiers || DEFAULT_TIERS; }
    catch(e){ console.warn(e.message); return DEFAULT_TIERS; }
  }
  async function saveTierList(tiers){
    if(USE_DEMO_FALLBACK){ demoSet('tiers', tiers); return tiers; }
    return (await apiPost('staffLicenceTierSave', { tiers })).tiers || tiers;
  }

  // Server contract:
  //   ?submitLicenceRequest=1&token=...  {requestedTier, reason, currentRace}  (POST, driver)
  //   ?myLicenceRequests=1&token=...                              (GET, driver's own history)
  //   ?staffLicenceRequestList=1&token=...                        (GET, staff-only, all pending)
  //   ?staffLicenceRequestReview=1&token=...  {requestId, decision, staffNote}  (POST, staff-only)
  // currentRace ('beginner'|'pro_am'|'') is the driver's own self-report of
  // which race they're actually racing in right now - shown next to the
  // system's computed recommended tier in the staff queue, so staff have
  // both a self-report and a data-driven suggestion to weigh up.
  // Approving a request updates the driver's tier + tierHistory server-side,
  // exactly like a manual staff tier override does.
  async function fetchMyRequests(){
    const meta = window.IFWL_META; const id = window.IFWL_AUTH.userId(meta);
    if(USE_DEMO_FALLBACK){
      const all = demoGet('requests', {});
      return all[id] || [];
    }
    return (await apiGet('myLicenceRequests')).requests || [];
  }
  async function submitLicenceRequest(requestedTier, reason, currentRace){
    const meta = window.IFWL_META; const id = window.IFWL_AUTH.userId(meta);
    if(USE_DEMO_FALLBACK){
      const all = demoGet('requests', {});
      all[id] = all[id] || [];
      all[id].push({
        id: 'req_' + Date.now(),
        driverId: id,
        driverName: window.IFWL_AUTH.userName(meta),
        currentTier: currentProfile?.tier || 'No Licence',
        requestedTier, reason, currentRace: currentRace || '',
        status: 'pending',
        submittedAt: new Date().toISOString()
      });
      demoSet('requests', all);
      return all[id];
    }
    return apiPost('submitLicenceRequest', { requestedTier, reason, currentRace: currentRace || '' });
  }

  async function fetchAllRequests(){
    if(USE_DEMO_FALLBACK){
      const all = demoGet('requests', {});
      return Object.values(all).flat();
    }
    return (await apiGet('staffLicenceRequestList')).requests || [];
  }

  // Approving updates the driver's tier + tierHistory, exactly like a manual
  // staff override - the request is just a different trigger for the same change.
  async function reviewRequest(driverId, requestId, decision, staffNote){
    if(USE_DEMO_FALLBACK){
      const all = demoGet('requests', {});
      const list = all[driverId] || [];
      const reqItem = list.find(r => r.id === requestId);
      if(!reqItem) throw new Error('Request not found');
      reqItem.status = decision;
      reqItem.staffNote = staffNote || '';
      reqItem.reviewedAt = new Date().toISOString();
      demoSet('requests', all);

      if(decision === 'approved'){
        const profiles = demoGet('profiles', {});
        const p = profiles[driverId];
        if(p){
          p.tierHistory = p.tierHistory || [];
          p.tierHistory.push({ tier: reqItem.requestedTier, date: new Date().toISOString(), reason: 'Approved licence request: ' + (reqItem.reason || ''), setBy: 'staff' });
          p.tier = reqItem.requestedTier;
          profiles[driverId] = p;
          demoSet('profiles', profiles);
        }
      }
      return reqItem;
    }
    return apiPost('staffLicenceRequestReview', { requestId, decision, staffNote });
  }

  // ✅ ADDED: LMU sub-licence requests - a deliberately separate, parallel
  // flow from the main-ladder requests just above, not a reuse of them.
  // Only used for tiers staff have marked lmuGated:true on the tier editor
  // (Hypercar, LMP3, ...) - every other LMU sub-licence stays the plain
  // self-select checkbox it always was. See submitLmuLicenceRequest in
  // rtgate.js for why approving one of these can't share the main-ladder
  // review action (it adds to lmuSubLicences, never overwrites tier).
  async function fetchMyLmuRequests(){
    return (await apiGet('myLmuLicenceRequests')).requests || [];
  }
  async function submitLmuRequest(tierId, reason){
    return apiPost('submitLmuLicenceRequest', { tierId, reason });
  }
  async function fetchAllLmuRequests(){
    return (await apiGet('staffLmuLicenceRequestList')).requests || [];
  }
  async function reviewLmuRequest(requestId, decision, staffNote){
    return apiPost('staffLmuLicenceRequestReview', { requestId, decision, staffNote });
  }

  window.IFWL_TierAPI = { DEFAULT_TIERS, fetchTierList, saveTierList };
  // ✅ ADDED: league owner lock on request reviews (see getLicenceRequestLock
  // in rtgate.js). Any licence staff can READ it (to show the locked state);
  // only the Owner role can change it - enforced server-side.
  async function fetchRequestLock(){
    if(USE_DEMO_FALLBACK) return { locked:false };
    try{ return await apiGet('licenceRequestLockGet'); }
    catch(e){ console.warn('licenceRequestLockGet failed', e.message); return { locked:false }; }
  }
  async function saveRequestLock(locked){
    if(USE_DEMO_FALLBACK) return { locked:!!locked };
    return apiPost('licenceRequestLockSave', { locked: !!locked });
  }
  async function repairLmuMainTier(payload){
    return apiPost('staffLmuMainTierRepair', payload || {});
  }
  window.IFWL_RequestAPI = { fetchMyRequests, submitLicenceRequest, fetchAllRequests, reviewRequest, fetchMyLmuRequests, submitLmuRequest, fetchAllLmuRequests, reviewLmuRequest, fetchRequestLock, saveRequestLock, repairLmuMainTier };
  window.IFWL_USE_DEMO_FALLBACK = USE_DEMO_FALLBACK;
  window.IFWL_Api = { apiGet, apiPost };

  // Server contract:
  //   ?myAvailableRaces=1&token=...                      (GET, driver - filtered server-side to their current tier)
  //   ?staffSimgridEventList=1&token=...                 (GET, staff)
  //   ?staffSimgridEventSave=1&token=... {eventId?,title,simgridLink,platform,series,tiers[],notes,imageUrl}  (POST, staff)
  //   ?staffSimgridEventDelete=1&token=... {eventId}      (POST, staff - soft delete)
  // The og:image preview is fetched server-side from SimGrid's own page, same
  // trick already used for Race Team Events - browsers can't do this directly (CORS).
  // ✅ ADDED: staffAll (only ever honoured server-side when the session is
  // genuinely staff) asks for every active race across every tier instead
  // of just the ones gated to the caller's own licence - powers the "Show
  // ALL races (staff)" toggle on the Available Races panel.
  async function fetchAvailableRaces(staffAll){
    if(USE_DEMO_FALLBACK){
      if(staffAll && window.IFWL_STAFF) return demoGet('simgridEvents', []).filter(e => e.active !== false);
      const tier = currentProfile?.tier || 'No Licence';
      return demoGet('simgridEvents', []).filter(e => e.active !== false && (e.tiers||[]).includes(tier));
    }
    return (await apiGet('myAvailableRaces', (staffAll && window.IFWL_STAFF) ? '&staffAll=1' : '')).events || [];
  }
  async function fetchAllSimgridEvents(){
    if(USE_DEMO_FALLBACK) return demoGet('simgridEvents', []).filter(e => e.active !== false);
    return (await apiGet('staffSimgridEventList')).events || [];
  }
  async function saveSimgridEvent(payload){
    if(USE_DEMO_FALLBACK){
      const all = demoGet('simgridEvents', []);
      if(payload.eventId){
        const idx = all.findIndex(e => e.id === payload.eventId);
        if(idx >= 0) all[idx] = {...all[idx], ...payload};
      } else {
        all.push({...payload, id:'sg_'+Date.now(), active:true, createdAtMs:Date.now()});
      }
      demoSet('simgridEvents', all);
      return all;
    }
    return apiPost('staffSimgridEventSave', payload);
  }
  async function deleteSimgridEvent(eventId){
    if(USE_DEMO_FALLBACK){
      const all = demoGet('simgridEvents', []).map(e => e.id === eventId ? {...e, active:false} : e);
      demoSet('simgridEvents', all);
      return true;
    }
    return apiPost('staffSimgridEventDelete', { eventId });
  }
  // ✅ ADDED: bulk delete - the multi-select checkboxes on the grouped
  // Staff SimGrid Events list use this instead of deleting one round at a
  // time.
  async function bulkDeleteSimgridEvents(eventIds){
    if(USE_DEMO_FALLBACK){
      const idSet = new Set(eventIds);
      const all = demoGet('simgridEvents', []).map(e => idSet.has(e.id) ? {...e, active:false} : e);
      demoSet('simgridEvents', all);
      return { ok:true, deletedCount: eventIds.length };
    }
    return apiPost('staffSimgridEventBulkDelete', { eventIds });
  }
  // ✅ ADDED: fixes several already-pushed rounds' platform in one go -
  // the League Owners Overview "Push" used to guess "Console + PC" for
  // everything (a season-wide list, not per-series), so a whole series
  // could come in wrong; this is the fast fix without editing every round.
  async function bulkSetPlatformSimgridEvents(eventIds, platform){
    if(USE_DEMO_FALLBACK){
      const idSet = new Set(eventIds);
      const all = demoGet('simgridEvents', []).map(e => idSet.has(e.id) ? {...e, platform} : e);
      demoSet('simgridEvents', all);
      return { ok:true, updatedCount: eventIds.length, platform };
    }
    return apiPost('staffSimgridEventBulkSetPlatform', { eventIds, platform });
  }
  // ✅ ADDED: fixes several already-pushed rounds' SimGrid event link in one
  // go - League Owners Overview's "Push" always left this blank, so pushed
  // rounds never had a working "View invite" link for drivers; a whole
  // series normally shares one championship link, so this fixes them all at
  // once instead of editing every round by hand.
  async function bulkSetSimgridLinkSimgridEvents(eventIds, simgridLink){
    if(USE_DEMO_FALLBACK){
      const idSet = new Set(eventIds);
      const all = demoGet('simgridEvents', []).map(e => idSet.has(e.id) ? {...e, simgridLink} : e);
      demoSet('simgridEvents', all);
      return { ok:true, updatedCount: eventIds.length, simgridLink };
    }
    return apiPost('staffSimgridEventBulkSetLink', { eventIds, simgridLink });
  }
  // ✅ ADDED: fixes a whole series' name in one go - the grouped staff UI's
  // header is read live from the PARENT owner_events doc's name (for rounds
  // pushed from League Owners Overview), so this updates that AND rewrites
  // the series portion of each selected round's own title (see
  // staffSimgridEventBulkRename in index.js for exactly how the title split
  // works - each round's own "- Round N - Track" suffix is preserved).
  async function bulkRenameSimgridEvents(eventIds, newName){
    if(USE_DEMO_FALLBACK){
      const idSet = new Set(eventIds);
      const all = demoGet('simgridEvents', []).map(e => {
        if(!idSet.has(e.id)) return e;
        const idx = String(e.title || '').search(/[-|]/);
        const title = idx === -1 ? newName : `${newName} ${String(e.title).slice(idx)}`;
        return {...e, title};
      });
      demoSet('simgridEvents', all);
      return { ok:true, updatedCount: eventIds.length, newName };
    }
    return apiPost('staffSimgridEventBulkRename', { eventIds, newName });
  }
  // ✅ ADDED: bulk "Set as LMU, requiring any of..." tool - flips Game to
  // "lmu" and applies the SAME set of required sub-licence ids to every
  // selected round in one write, so a whole multi-round series doesn't
  // need editing one round at a time. See staffSimgridEventBulkSetLmu in
  // rtgate.js for the actual tier-id validation.
  async function bulkSetLmuSimgridEvents(eventIds, lmuRequiredTierIds){
    if(USE_DEMO_FALLBACK){
      const idSet = new Set(eventIds);
      const all = demoGet('simgridEvents', []).map(e => idSet.has(e.id) ? {...e, game:'lmu', lmuRequiredTierIds} : e);
      demoSet('simgridEvents', all);
      return { ok:true, updatedCount: eventIds.length, lmuRequiredTierIds };
    }
    return apiPost('staffSimgridEventBulkSetLmu', { eventIds, lmuRequiredTierIds });
  }
  async function uploadEventRoster(eventId, entries){
    return apiPost('staffEventRosterUpload', { eventId, entries });
  }
  // ✅ ADDED: driver-facing half of the per-event Discord role. Demo mode
  // has no real Discord bot to call, so it just fakes success - good enough
  // to click through the flow while trying the site out.
  async function unlockEventDiscordRole(eventId){
    if(USE_DEMO_FALLBACK) return { ok:true };
    return apiPost('unlockEventDiscordRole', { eventId });
  }
  async function clearEventRoster(eventId, moveToEventId){
    return apiPost('staffEventRosterClear', { eventId, moveToEventId: moveToEventId || '' });
  }
  // ✅ ADDED: Discord weekly schedule post (Staff: SimGrid Events). Server side is
  // in rtgate.js (staffEventSchedule* + eventScheduleTick).
  window.IFWL_SchedulePostAPI = {
    get: () => apiGet('staffEventScheduleGet'),
    save: (settings) => apiPost('staffEventScheduleSave', settings),
    preview: () => apiPost('staffEventSchedulePreview', {}),
    postNow: () => apiPost('staffEventSchedulePost', {}),
    tickUrl: (key) => `${FN}?eventScheduleTick=1&key=${encodeURIComponent(key)}`
  };
  window.IFWL_SimgridAPI = { clearEventRoster, fetchAvailableRaces, fetchAllSimgridEvents, saveSimgridEvent, deleteSimgridEvent, bulkDeleteSimgridEvents, bulkSetPlatformSimgridEvents, bulkSetSimgridLinkSimgridEvents, bulkRenameSimgridEvents, bulkSetLmuSimgridEvents, uploadEventRoster, unlockEventDiscordRole };

  // Server contract:
  //   ?enduranceConfigGet=1                        (GET,  public - entry fee + prize pool split)
  //   ?enduranceConfigSave=1&token=...    {...}     (POST, staff)
  //   ?enduranceTeamList=1                          (GET,  public)
  //   ?enduranceTeamSave=1&token=...      {...}     (POST, staff - omit teamId to create)
  //   ?enduranceTeamDelete=1&token=...    {teamId}  (POST, staff - soft delete)
  //   ?enduranceRaceList=1                          (GET,  public)
  //   ?enduranceRaceSave=1&token=...      {...}     (POST, staff - omit raceId to create)
  //   ?enduranceRaceDelete=1&token=...    {raceId}  (POST, staff - soft delete)
  async function enduranceFetchConfig(){ return apiGet('enduranceConfigGet'); }
  async function enduranceSaveConfig(cfg){ return apiPost('enduranceConfigSave', cfg); }
  async function enduranceFetchTeams(){ return (await apiGet('enduranceTeamList')).teams || []; }
  async function enduranceSaveTeam(payload){ return apiPost('enduranceTeamSave', payload); }
  async function enduranceDeleteTeam(teamId){ return apiPost('enduranceTeamDelete', { teamId }); }
  async function enduranceFetchRaces(){ return (await apiGet('enduranceRaceList')).races || []; }
  async function enduranceSaveRace(payload){ return apiPost('enduranceRaceSave', payload); }
  async function enduranceDeleteRace(raceId){ return apiPost('enduranceRaceDelete', { raceId }); }
  window.IFWL_EnduranceAPI = {
    fetchConfig: enduranceFetchConfig, saveConfig: enduranceSaveConfig,
    fetchTeams: enduranceFetchTeams, saveTeam: enduranceSaveTeam, deleteTeam: enduranceDeleteTeam,
    fetchRaces: enduranceFetchRaces, saveRace: enduranceSaveRace, deleteRace: enduranceDeleteRace
  };

  // Server contract: ?linkedDriverNames=1&token=... -> { ok, names: [lowercased strings] }
  // Returns which ACC names are already claimed, not by whom - claiming itself
  // still only ever goes through updateLicenceProfile, which only lets a
  // driver edit their own profile, so this can't be used to claim someone
  // else's name onto your own account even in principle.
  async function fetchLinkedDriverNames(){
    if(USE_DEMO_FALLBACK){
      const all = Object.values(demoGet('profiles', {}));
      const names = new Set();
      all.forEach(p => (p.accDriverNames||[]).forEach(n => names.add(n.trim().toLowerCase())));
      return [...names];
    }
    return (await apiGet('linkedDriverNames')).names || [];
  }
  window.IFWL_ClaimAPI = { fetchLinkedDriverNames };

  // Server contract: ?myPendingTicketNotice=1 -> { count, tickets:[{id,dateLabel,dateMs}] }
  // Available to every driver regardless of tier - see the note in index.js.
  async function fetchMyPendingTicketNotice(){
    if(USE_DEMO_FALLBACK) return { count: 0, tickets: [] };
    try{ return await apiGet('myPendingTicketNotice'); }
    catch(e){ console.warn('myPendingTicketNotice failed', e.message); return { count: 0, tickets: [] }; }
  }
  window.IFWL_TicketNoticeAPI = { fetchMyPendingTicketNotice };

  // Server contracts for staff<->driver messaging - see licence_threads in index.js.
  window.IFWL_InboxAPI = {
    myInbox: () => apiGet('myInbox'),
    myThread: (threadId) => apiGet('myInboxThread', `&threadId=${encodeURIComponent(threadId)}`),
    myReply: (threadId, text) => apiPost('myInboxReply', { threadId, text }),
    staffSend: (driverId, subject, text) => apiPost('staffMessageSend', { driverId, subject, text }),
    staffSendAll: (subject, text, allowReplies) => apiPost('staffMessageSendAll', { subject, text, allowReplies }),
    // ✅ ADDED: targeted version of staffSendAll - one thread each, but only
    // to the driverIds given (Licence Database "Message selected"). Owner/
    // Ops Manager or Head Moderator - see staffLicenceBulkMessage in index.js.
    staffSendSelected: (driverIds, subject, text, allowReplies) => apiPost('staffLicenceBulkMessage', { driverIds, subject, text, allowReplies }),
    staffList: () => apiGet('staffInboxList'),
    staffThread: (threadId) => apiGet('staffInboxThread', `&threadId=${encodeURIComponent(threadId)}`),
    staffReply: (threadId, text) => apiPost('staffInboxReply', { threadId, text })
  };

  // Server contract: ?seasonWindow=1 -> {label, startDate, endDate}
  //                  ?staffSeasonWindowSave=1 {label, startDate, endDate} (staff)
  async function fetchSeasonWindow(){
    if(USE_DEMO_FALLBACK) return demoGet('seasonWindow', { label:'', startDate:'', endDate:'' });
    return apiGet('seasonWindow');
  }
  async function saveSeasonWindow(data){
    if(USE_DEMO_FALLBACK){ demoSet('seasonWindow', data); return data; }
    return apiPost('staffSeasonWindowSave', data);
  }
  // ✅ ADDED: Career Unlock - beta-period switch, see seasonWindowPanel.
  // Server contract: ?careerUnlockStatus=1 -> {enabled}
  //                  ?staffSaveCareerUnlock=1 {enabled} (Owner only)
  async function fetchCareerUnlock(){
    if(USE_DEMO_FALLBACK) return demoGet('careerUnlock', { enabled: false });
    return apiGet('careerUnlockStatus');
  }
  async function saveCareerUnlock(enabled){
    if(USE_DEMO_FALLBACK){ demoSet('careerUnlock', { enabled }); return { enabled }; }
    return apiPost('staffSaveCareerUnlock', { enabled });
  }
  // ✅ ADDED: Career System master on/off + master reset - a full stop for
  // EVERYONE (Gold Patreon and staffBypass included) while closed, separate
  // from Career Unlock above which only ever widens access. See
  // careerSystemPanel below.
  // Server contract: ?careerSystemStatus=1 -> {enabled, closedMessage}
  //                  ?staffSaveCareerSystemStatus=1 {enabled, closedMessage} (Owner/Ops)
  //                  ?staffCareerSystemMasterReset=1 {confirm:"RESET"} (Owner only)
  async function fetchCareerSystemStatus(){
    if(USE_DEMO_FALLBACK) return demoGet('careerSystemStatus', { enabled: true, closedMessage: '' });
    return apiGet('careerSystemStatus');
  }
  async function saveCareerSystemStatus(enabled, closedMessage){
    if(USE_DEMO_FALLBACK){ const d = { enabled, closedMessage }; demoSet('careerSystemStatus', d); return d; }
    return apiPost('staffSaveCareerSystemStatus', { enabled, closedMessage });
  }
  async function runCareerSystemMasterReset(){
    if(USE_DEMO_FALLBACK) return { ok:true, resetCount: 0 };
    return apiPost('staffCareerSystemMasterReset', { confirm: 'RESET' });
  }
  window.IFWL_SeasonAPI = { fetchSeasonWindow, saveSeasonWindow, fetchCareerUnlock, saveCareerUnlock, fetchCareerSystemStatus, saveCareerSystemStatus, runCareerSystemMasterReset };

  async function fetchQualificationWindow(){
    if(USE_DEMO_FALLBACK) return demoGet('qualificationWindow', { label:'', startDate:'', endDate:'' });
    return apiGet('qualificationWindow');
  }
  async function saveQualificationWindow(data){
    if(USE_DEMO_FALLBACK){ demoSet('qualificationWindow', data); return data; }
    return apiPost('staffQualificationWindowSave', data);
  }
  window.IFWL_QualWindowAPI = { fetchQualificationWindow, saveQualificationWindow };

  let __qualWindowMsCache = null;
  async function fetchQualWindowMs(){
    if(__qualWindowMsCache) return __qualWindowMsCache;
    try{
      const w = await fetchQualificationWindow();
      __qualWindowMsCache = (w.enabled === false) ? { startMs: 0, endMs: Date.now(), label: '' } : {
        startMs: w.startDate ? Date.parse(w.startDate + 'T00:00:00Z') : 0,
        endMs: w.endDate ? Date.parse(w.endDate + 'T23:59:59Z') : Date.now(),
        label: w.label || ''
      };
    }catch(e){
      console.warn('Could not load qualification window', e);
      __qualWindowMsCache = { startMs: 0, endMs: Date.now(), label: '' };
    }
    return __qualWindowMsCache;
  }
  window.fetchQualWindowMs = fetchQualWindowMs;
  window.invalidateQualWindowCache = () => { __qualWindowMsCache = null; };

  // Server contract: ?systemStatus=1 (public, no token) -> {active,title,message,startDate,endDate}
  //                  ?staffSystemStatusSave=1 {active,title,message,startDate,endDate} (staff)
  async function fetchSystemStatus(){
    if(USE_DEMO_FALLBACK) return demoGet('systemStatus', { active:false, title:'', message:'', startDate:'', endDate:'' });
    try{
      const r = await fetch(`${FN}?systemStatus=1`, {cache:'no-store'});
      return await r.json();
    }catch(e){ return { active:false, title:'', message:'', startDate:'', endDate:'' }; }
  }
  async function saveSystemStatus(data){
    if(USE_DEMO_FALLBACK){ demoSet('systemStatus', data); return data; }
    return apiPost('staffSystemStatusSave', data);
  }
  window.IFWL_StatusAPI = { fetchSystemStatus, saveSystemStatus };

  // Server contract: ?homeSettingsGet=1 (public) -> {qualMode, seasonStartDate}
  //                  ?staffHomeSettingsSave=1 {qualMode, seasonStartDate} (Owner/Ops)
  // If the backend hasn't been deployed yet the fetch just falls back to
  // automatic / 2026-10-12, so the Home page works either way.
  async function fetchHomeSettings(){
    if(USE_DEMO_FALLBACK) return demoGet('homeSettings', { qualMode:'auto', seasonStartDate:'2026-10-12' });
    const r = await fetch(`${FN}?homeSettingsGet=1`, {cache:'no-store'});
    if(!r.ok) throw new Error('homeSettingsGet ' + r.status);
    return await r.json();
  }
  async function saveHomeSettings(data){
    if(USE_DEMO_FALLBACK){ demoSet('homeSettings', data); return data; }
    return apiPost('staffHomeSettingsSave', data);
  }
  window.IFWL_HomeSettingsAPI = { fetchHomeSettings, saveHomeSettings };

  // Server contract: ?liveTimingsStatusGet=1 (public) -> {maintenance, message, updatedAtMs}
  //                  ?staffLiveTimingsMaintenanceSave=1 {enabled, message} (Owner/Ops)
  async function fetchLiveTimingsMaintenance(){
    const r = await fetch(`${FN}?liveTimingsStatusGet=1`, {cache:'no-store'});
    if(!r.ok) throw new Error('liveTimingsStatusGet ' + r.status);
    return await r.json();
  }
  async function saveLiveTimingsMaintenance(data){
    return apiPost('staffLiveTimingsMaintenanceSave', data);
  }
  window.IFWL_LiveTimingsMaintAPI = { fetchLiveTimingsMaintenance, saveLiveTimingsMaintenance };

  // Server contract: ?autoPlacementGet=1 (Owner/Ops) -> {settings:{newJoinerProvisional,autoPlaceEnabled,settleHours,maxPerRun}, lastRun}
  //                  ?staffAutoPlacementSave=1 {newJoinerProvisional,autoPlaceEnabled,settleHours,maxPerRun} (Owner/Ops)
  window.IFWL_AutoPlacementAPI = {
    fetchAutoPlacement: () => apiGet('autoPlacementGet'),
    saveAutoPlacement: (data) => apiPost('staffAutoPlacementSave', data)
  };

  // ✅ ADDED: Owner's Emergency Standards Clause - read-only here. Enabled/
  // disabled by Owner directly on headsteward.html (a separate Firebase-Auth
  // app on the same Firestore project) - this just surfaces the current
  // state to drivers. See ownerClauseStatus in rtgate.js.
  async function fetchOwnerClauseStatus(){
    try{ return await apiGet('ownerClauseStatus'); }
    catch(e){ return { active:false }; }
  }
  window.IFWL_OwnerClauseAPI = { fetchOwnerClauseStatus };

  // Server contract:
  //   ?callingCardList=1                                  (GET, any logged-in driver - the catalog to choose from)
  //   ?staffCallingCardSave=1&token=... {cards}            (POST, staff-only - replaces the whole catalog atomically)
  // Uploading a new calling card image reuses the already-working
  // rtLicenceImageUpload function with kind='callingcard' - that kind is
  // staff-gated server-side (not Gold-gated like photo/header), and stored
  // under calling_cards/ instead of licences/{userId}/, since it's a shared
  // catalog asset, not a personal profile image.
  async function fetchCallingCardCatalog(){
    if(USE_DEMO_FALLBACK) return demoGet('callingCards', []);
    return (await apiGet('callingCardList')).cards || [];
  }
  async function saveCallingCardCatalog(cards){
    if(USE_DEMO_FALLBACK){ demoSet('callingCards', cards); return cards; }
    return (await apiPost('staffCallingCardSave', { cards })).cards || cards;
  }
  window.IFWL_CallingCardAPI = { fetchCallingCardCatalog, saveCallingCardCatalog };

  // ✅ ADDED: season class structure (Pro/Am thresholds+caps, Rookie cutoff) -
  // cached per page load since every Licence Quali / standings call site on
  // this page needs the same config, and it only changes when Owner staff
  // update it.
  let __classStructureCache = null;
  async function fetchClassStructureConfig(){
    if(__classStructureCache) return __classStructureCache;
    try{
      const data = await apiGet('seasonClassStructure');
      __classStructureCache = { pc: data.pc, console: data.console };
    }catch(e){
      console.warn('Could not load season class structure, using defaults', e);
      const fallback = { proPct: 2, proMax: null, amPct: 5, amMax: null, cutoffMode: 'auto', cutoffPct: 15 };
      __classStructureCache = { pc: fallback, console: { ...fallback } };
    }
    return __classStructureCache;
  }
  window.fetchClassStructureConfig = fetchClassStructureConfig;
  window.invalidateClassStructureCache = () => { __classStructureCache = null; };
  window.classStructureForServer = async (serverId) => {
    const cs = await fetchClassStructureConfig();
    return serverId === 'console-licence' ? cs.console : cs.pc;
  };

  // ✅ ADDED: window.IFWLStats.computeLicenceServerStandings (ifwl-stats-engine.js)
  // reads every session file for a server and is the single most expensive
  // call this page makes - and a normal driver's page load independently
  // asks it for the EXACT same (serverId, minLaps:15) standings from three
  // unrelated places (the Qualification Standing card, the qualification-
  // laps progress box, and Claim Your Laps), none of them aware the others
  // are asking for the same thing, doing it per-platform so that's up to 6
  // full recomputes for what should be 2. On a slow mobile connection that's
  // very plausibly why the whole page can take minutes or fail to load at
  // all. Same in-flight-Promise-cache pattern as fetchQualWindowMs/
  // fetchClassStructureConfig just above - lives for one page load only,
  // never persisted, and concurrent callers asking for the same key share
  // the same in-flight request instead of each starting their own. A
  // `force:true` call (the staff "Recalculate" action) always bypasses this
  // and hits the real engine directly, same as before.
  const __standingsCache = new Map(); // key: `${serverId}|${minLaps}` -> Promise<standings[]>
  function cachedLicenceServerStandings(params){
    if(params.force) return window.IFWLStats.computeLicenceServerStandings(params);
    const key = `${params.serverId}|${params.minLaps}`;
    if(!__standingsCache.has(key)){
      const p = window.IFWLStats.computeLicenceServerStandings(params).catch(e => { __standingsCache.delete(key); throw e; });
      __standingsCache.set(key, p);
    }
    return __standingsCache.get(key);
  }
  window.cachedLicenceServerStandings = cachedLicenceServerStandings;

  // ✅ ADDED: seasonal costs (entry fee, tyre make/model/price, race
  // earnings payout table, track km-per-lap list) - staff-editable via
  // Staff > Economy > Seasonal Costs. Cached per page load, same pattern as
  // class structure above, since My Season Progression calls this on every
  // render and it only changes when Owner staff update it. Falls back to
  // the same figures that used to be hardcoded here, so a fetch failure
  // never breaks the page - it just quietly uses the old defaults.
  const SEASONAL_COSTS_FALLBACK = {
    entryFeePerRace: 10000,
    tyre: { make: 'Michelin', model: 'IMSA-spec H1+ compound', pricePerTyre: 1023 },
    raceEarnings: {
      1:30000, 2:22000, 3:16000, 4:12000, 5:9500, 6:8000, 7:7000, 8:6000, 9:5200, 10:4500,
      11:4000, 12:3600, 13:3300, 14:3000, 15:2800, 16:2600, 17:2400, 18:2200, 19:2000, 20:1800,
      21:1650, 22:1500, 23:1400, 24:1300, 25:1200, 26:1100, 27:1000, 28:950, 29:900, 30:850,
      31:800, 32:750, 33:700, 34:650, 35:600, 36:550, 37:500, 38:475, 39:450, 40:425,
      41:400, 42:375, 43:350, 44:325, 45:300, 46:275, 47:250, 48:225, 49:200, 50:175
    },
    tracks: [
      { slug: 'barcelona', name: 'Barcelona', kmPerLap: 4.655 }, { slug: 'brands_hatch', name: 'Brands Hatch', kmPerLap: 3.908 },
      { slug: 'cota', name: 'Circuit of the Americas', kmPerLap: 5.513 }, { slug: 'donington', name: 'Donington Park', kmPerLap: 4.020 },
      { slug: 'hungaroring', name: 'Hungaroring', kmPerLap: 4.381 }, { slug: 'imola', name: 'Imola', kmPerLap: 4.909 },
      { slug: 'indianapolis', name: 'Indianapolis', kmPerLap: 3.984 }, { slug: 'kyalami', name: 'Kyalami', kmPerLap: 4.522 },
      { slug: 'laguna_seca', name: 'Laguna Seca', kmPerLap: 3.602 }, { slug: 'misano', name: 'Misano', kmPerLap: 4.226 },
      { slug: 'monza', name: 'Monza', kmPerLap: 5.793 }, { slug: 'mount_panorama', name: 'Mount Panorama (Bathurst)', kmPerLap: 6.213 },
      { slug: 'nurburgring', name: 'Nurburgring GP', kmPerLap: 5.148 }, { slug: 'nurburgring_24h', name: 'Nurburgring 24h (Nordschleife)', kmPerLap: 25.378 },
      { slug: 'oulton_park', name: 'Oulton Park', kmPerLap: 4.307 }, { slug: 'paul_ricard', name: 'Paul Ricard', kmPerLap: 5.842 },
      { slug: 'red_bull_ring', name: 'Red Bull Ring', kmPerLap: 4.318 }, { slug: 'silverstone', name: 'Silverstone', kmPerLap: 5.891 },
      { slug: 'snetterton', name: 'Snetterton', kmPerLap: 4.778 }, { slug: 'spa', name: 'Spa-Francorchamps', kmPerLap: 7.004 },
      { slug: 'suzuka', name: 'Suzuka', kmPerLap: 5.807 }, { slug: 'valencia', name: 'Valencia', kmPerLap: 4.005 },
      { slug: 'watkins_glen', name: 'Watkins Glen', kmPerLap: 5.552 }, { slug: 'zandvoort', name: 'Zandvoort', kmPerLap: 4.259 },
      { slug: 'zolder', name: 'Zolder', kmPerLap: 4.011 }
    ],
    // ✅ ADDED: Parts Marketplace maintenance costs.
    partsMaintenance: { engine: 8000, suspension: 6000, damper: 4000, aero: 5000 },
    // ✅ ADDED: Fuel Factory - flat RRP + per-weekend/per-lap consumption
    // figures, all staff-editable here (matches user request: "THE
    // DISCOUNT ON FUEL COSTS SET BY ADMIN LIKE EVERYTHING ELSE").
    fuel: { pricePerLitre: 2.3, practiceQualifyingLitres: 120, raceLitres: 120, standardRaceLaps: 20, extraLitresPerLap: 2.75 }
  };
  let __seasonalCostsCache = null;
  async function fetchSeasonalCosts(){
    if(__seasonalCostsCache) return __seasonalCostsCache;
    try{
      const data = await apiGet('seasonalCosts');
      __seasonalCostsCache = {
        entryFeePerRace: data.entryFeePerRace,
        tyre: data.tyre,
        raceEarnings: data.raceEarnings,
        tracks: data.tracks,
        partsMaintenance: data.partsMaintenance || SEASONAL_COSTS_FALLBACK.partsMaintenance,
        fuel: data.fuel || SEASONAL_COSTS_FALLBACK.fuel,
        trackKmLookup: Object.fromEntries((data.tracks||[]).map(t => [t.slug, t.kmPerLap]))
      };
    }catch(e){
      console.warn('Could not load seasonal costs, using fallback defaults', e);
      __seasonalCostsCache = {
        ...SEASONAL_COSTS_FALLBACK,
        trackKmLookup: Object.fromEntries(SEASONAL_COSTS_FALLBACK.tracks.map(t => [t.slug, t.kmPerLap]))
      };
    }
    return __seasonalCostsCache;
  }
  async function saveSeasonalCosts(data){
    const saved = await apiPost('staffSeasonalCostsSave', data);
    __seasonalCostsCache = null; // force a fresh fetch next time - other drivers picking this up happens on their own next page load/render
    return saved;
  }
  window.IFWL_SeasonalCostsAPI = { fetchSeasonalCosts, saveSeasonalCosts };

  // ✅ ADDED: Season Start Payments - a one-off Day 1 balance issued to
  // every licence holder into the same IFWL Shop ledger, sized by whichever
  // Patreon tier they're currently on file as (patreonOutlineTier, the same
  // field the licence directory ring already uses - refreshed on login).
  const SEASON_START_PAYMENTS_FALLBACK = { gold: 120000, silver: 85000, bronze: 60000, none: 30000, enabled: false };
  let __seasonStartPaymentsCache = null;
  async function fetchSeasonStartPayments(){
    if(__seasonStartPaymentsCache) return __seasonStartPaymentsCache;
    try{ __seasonStartPaymentsCache = await apiGet('seasonStartPayments'); }
    catch(e){ console.warn('Could not load season start payments, using fallback defaults', e); __seasonStartPaymentsCache = { ...SEASON_START_PAYMENTS_FALLBACK }; }
    return __seasonStartPaymentsCache;
  }
  async function saveSeasonStartPayments(data){
    const saved = await apiPost('staffSeasonStartPaymentsSave', data);
    __seasonStartPaymentsCache = null;
    return saved;
  }
  async function runSeasonStartPayments(){
    return apiPost('staffRunSeasonStartPayments', {});
  }
  window.IFWL_SeasonStartPaymentsAPI = { fetchSeasonStartPayments, saveSeasonStartPayments, runSeasonStartPayments };

  // ✅ ADDED: Welcome Bonus - a one-time (ever, not per-season) payment,
  // fires server-side the instant a driver's Patreon tier is first
  // detected. No "run" action needed here - it's automatic - just amounts
  // to configure.
  const WELCOME_BONUS_FALLBACK = { gold: 60000, silver: 40000, bronze: 25000, enabled: true };
  let __welcomeBonusCache = null;
  async function fetchWelcomeBonus(){
    if(__welcomeBonusCache) return __welcomeBonusCache;
    try{ __welcomeBonusCache = await apiGet('welcomeBonus'); }
    catch(e){ console.warn('Could not load welcome bonus, using fallback defaults', e); __welcomeBonusCache = { ...WELCOME_BONUS_FALLBACK }; }
    return __welcomeBonusCache;
  }
  async function saveWelcomeBonus(data){
    const saved = await apiPost('staffWelcomeBonusSave', data);
    __welcomeBonusCache = null;
    return saved;
  }
  window.IFWL_WelcomeBonusAPI = { fetchWelcomeBonus, saveWelcomeBonus };

  // ✅ ADDED: manual on-demand trigger for the Race Earnings settlement -
  // no config here, it just runs against whatever Seasonal Costs/Season
  // Window are already set to.
  async function runRaceEarningsSettlement(){
    return apiPost('staffRunRaceEarningsSettlement', {});
  }
  // ✅ ADDED: read-only diagnostic - answers "why did a run credit 0
  // drivers?" without crediting anyone.
  async function diagnoseRaceEarningsMatching(){
    return apiPost('staffDiagnoseRaceEarningsMatching', {});
  }
  // ✅ ADDED: one-off class-position payout correction (preview or apply).
  async function runClassPayoutCorrection(payload){
    return apiPost('staffRunClassPayoutCorrection', payload || {});
  }
  window.IFWL_RaceEarningsSettlementAPI = { runRaceEarningsSettlement, diagnoseRaceEarningsMatching, runClassPayoutCorrection };

  // ✅ ADDED: IFWL Career Shop data layer. Mirrors the Seasonal Costs
  // pattern above (catalog fetch/save, cached, invalidated on save) plus a
  // per-driver ledger (balance derived server-side from this season's race
  // + sponsorship earnings, plus every purchase/refund/manual adjustment
  // logged with a reason). Needs matching backend actions:
  //   ?careerShopCatalog=1&token=...        (GET,  staff+driver, the item list)
  //   ?staffCareerShopCatalogSave=1&token=...(POST, Owner-only, {items:[...]})
  //   ?myCareerShopLedger=1&token=...       (GET,  own balance/owned items/transactions, season-scoped)
  //   ?careerShopPurchase=1&token=...       (POST, {itemId}, server verifies balance + not already owned)
  //   ?staffCareerShopTransaction=1&token=...(POST, Owner-only, {driverId, amount, reason})
  //   ?staffCareerShopRefund=1&token=...    (POST, Owner-only, {driverId, purchaseId, reclaimItem, reason})
  //   ?staffCareerShopDriverLedger=1&token=...&driverId=...  (GET, Owner-only, another driver's balance/owned items, for the Refund tool)
  let __careerShopCatalogCache = null;
  async function fetchCareerShopCatalog(){
    if(__careerShopCatalogCache) return __careerShopCatalogCache;
    __careerShopCatalogCache = (await apiGet('careerShopCatalog')).items || [];
    return __careerShopCatalogCache;
  }
  async function saveCareerShopCatalog(items){
    const saved = await apiPost('staffCareerShopCatalogSave', { items });
    __careerShopCatalogCache = null;
    return saved.items || items;
  }
  async function fetchMyCareerShopLedger(force){
    return apiGet('myCareerShopLedger' + (force ? '&force=1' : ''));
  }
  async function purchaseCareerShopItem(itemId){
    return apiPost('careerShopPurchase', { itemId });
  }
  // ✅ ADDED: staff-only - any driver's ledger, for the Refund tool to show
  // what they currently own.
  async function fetchDriverCareerShopLedger(driverId){
    return apiGet('staffCareerShopDriverLedger', `&driverId=${encodeURIComponent(driverId)}`);
  }
  // ✅ ADDED: staff-only - manual credit/debit and refund actions. A reason
  // is always required (accountability), enforced client-side here but the
  // backend should reject a blank reason too, same as every other
  // required-field save on this page.
  async function issueCareerShopTransaction(driverId, amount, reason){
    if(!reason || !reason.trim()) throw new Error('A reason is required.');
    return apiPost('staffCareerShopTransaction', { driverId, amount, reason: reason.trim() });
  }
  async function refundCareerShopPurchase(driverId, purchaseId, reclaimItem, reason){
    if(!reason || !reason.trim()) throw new Error('A reason is required.');
    return apiPost('staffCareerShopRefund', { driverId, purchaseId, reclaimItem: !!reclaimItem, reason: reason.trim() });
  }
  window.IFWL_CareerShopAPI = { fetchCareerShopCatalog, saveCareerShopCatalog, fetchMyCareerShopLedger, purchaseCareerShopItem, fetchDriverCareerShopLedger, issueCareerShopTransaction, refundCareerShopPurchase };
  window.invalidateCareerShopCatalogCache = () => { __careerShopCatalogCache = null; };

  // ✅ ADDED: Parts Marketplace - staff oversight only here (driver-facing
  // buying/selling lives on career.html). Backend actions:
  //   ?staffMarketplaceOverview=1&token=...        (GET, Owner-only)
  //   ?staffVoidMarketplaceTransaction=1&token=... (POST, Owner-only, {transactionId, reason})
  //   ?ifwlTreasury=1&token=...                    (GET, staff-only, {balance})
  //   ?partsMarketplaceImages=1&token=...          (GET, any driver, {images})
  //   ?staffSavePartsMarketplaceImage=1&token=...  (POST, Owner-only, {partType, imageUrl, tier})
  async function fetchStaffMarketplaceOverview(){ return apiGet('staffMarketplaceOverview'); }
  async function voidMarketplaceTransaction(transactionId, reason){
    if(!reason || !reason.trim()) throw new Error('A reason is required.');
    return apiPost('staffVoidMarketplaceTransaction', { transactionId, reason: reason.trim() });
  }
  async function fetchIfwlTreasury(){ return apiGet('ifwlTreasury'); }
  async function fetchPartsMarketplaceImages(){ return (await apiGet('partsMarketplaceImages')).images || {}; }
  // ✅ CHANGED: tier (1-3) only matters for engine/suspension/damper/aero -
  // Tyre Factory has no tiers, so it's just omitted for that call.
  async function savePartsMarketplaceImage(partType, imageUrl, tier){ return apiPost('staffSavePartsMarketplaceImage', { partType, imageUrl, tier }); }
  window.IFWL_MarketplaceAPI = { fetchStaffMarketplaceOverview, voidMarketplaceTransaction, fetchIfwlTreasury, fetchPartsMarketplaceImages, savePartsMarketplaceImage };
  window.invalidateSeasonalCostsCache = () => { __seasonalCostsCache = null; };

  // ✅ ADDED: Seasonal Licence Overlays
  let __seasonalEventsCache = null;
  async function fetchSeasonalEventsConfig(){
    if(__seasonalEventsCache) return __seasonalEventsCache;
    try{
      __seasonalEventsCache = (await apiGet('seasonalEvents')).events || [];
    }catch(e){
      console.warn('Could not load seasonal events', e);
      __seasonalEventsCache = [];
    }
    return __seasonalEventsCache;
  }
  window.fetchSeasonalEventsConfig = fetchSeasonalEventsConfig;
  window.invalidateSeasonalEventsCache = () => { __seasonalEventsCache = null; };
  // Directory rendering isn't async, so it reads whatever's already cached
  // (populated early in init() via applySeasonalOverlays) rather than
  // triggering its own fetch - returns null harmlessly if that hasn't
  // resolved yet on a very first paint.
  window.getActiveSeasonalOverlaySync = (context) => {
    if(!__seasonalEventsCache) return null;
    return resolveActiveSeasonalOverlay(__seasonalEventsCache, context);
  };
  // ✅ ADDED: same sync-cache pattern as above, but banned-aware - used by
  // Driver Directory card rendering, which isn't async.
  window.getCardOverlaySync = (context, isBanned) => {
    if(!__seasonalEventsCache) return null;
    return resolveCardOverlay(__seasonalEventsCache, context, isBanned);
  };

  // Handles ranges that cross the year boundary (e.g. Christmas: Dec 1 -
  // Jan 1) by checking "today is on/after start" OR "today is on/before
  // end" when the range wraps, instead of a single in-between comparison
  // that would never be true for a wrapped range.
  function isSeasonalEventActive(e, now){
    if(!e.enabled) return false;
    if(e.forceShow) return true;
    const md = (m, d) => m * 100 + d;
    const today = md(now.getMonth() + 1, now.getDate());
    const start = md(e.startMonth, e.startDay);
    const end = md(e.endMonth, e.endDay);
    if(start <= end) return today >= start && today <= end;
    return today >= start || today <= end; // wraps across Dec 31 -> Jan 1
  }

  // Shared by the licence card AND every Driver Directory card - resolves
  // to whichever event is currently active (first one with an actual image
  // wins, in case more than one is somehow active at once).
  // context is 'main' (the driver's own licence card) or 'directory' (every
  // Driver Directory card) - two separate uploaded images per event, not
  // two halves of one card, since directory cards are a different shape and
  // deserve their own properly-scaled art rather than the same image
  // stretched to fit.
  function resolveActiveSeasonalOverlay(events, context){
    const urlField = context === 'directory' ? 'directoryImageUrl' : 'mainImageUrl';
    const glowField = context === 'directory' ? 'directoryGlow' : 'mainGlow';
    const now = new Date();
    const active = events.filter(e => isSeasonalEventActive(e, now));
    const event = active.find(e => e[urlField]);
    if(!event) return null;
    return { imageUrl: event[urlField], glow: !!event[glowField] };
  }

  // ✅ ADDED: banned-driver overlay - reuses the April Fools event's own
  // uploaded artwork rather than a separate upload flow, matched by name
  // (case-insensitive, "april" or "fool") so it doesn't depend on that
  // event's own enabled/date window - a ban shows this art on a banned
  // driver's card regardless of whether April Fools itself is "active".
  function resolveBannedOverlay(events, context){
    const urlField = context === 'directory' ? 'directoryImageUrl' : 'mainImageUrl';
    const glowField = context === 'directory' ? 'directoryGlow' : 'mainGlow';
    const event = (events || []).find(e => /april|fool/i.test(e.name || '') && e[urlField]);
    if(!event) return null;
    return { imageUrl: event[urlField], glow: !!event[glowField] };
  }

  // Banned takes priority over any currently-active seasonal event.
  function resolveCardOverlay(events, context, isBanned){
    if(isBanned){
      const banned = resolveBannedOverlay(events, context);
      if(banned) return banned;
    }
    return resolveActiveSeasonalOverlay(events, context);
  }

  // ✅ ADDED: Raceday Info - basic markdown-to-HTML renderer. Handles the
  // subset actually used in real briefings: headers, bold/italic, bullet
  // lists, links, and Discord role mentions (rendered plainly, since a
  // role ID means nothing outside Discord itself). Not a full markdown
  // spec - just enough for driver briefing content.
  // ✅ ADDED: renders actual embedded YouTube players instead of plain
  // links, for both youtu.be short links and full youtube.com/watch URLs
  // (with or without extra query params like ?si=...). Anything that isn't
  // a recognisable YouTube link still gets a plain "Watch" link instead of
  // being silently dropped.
  function renderVideoEmbeds(urls){
    if(!urls || !urls.length) return '';
    const items = urls.map(url => {
      const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
      if(m){
        return `<div style="position:relative;padding-bottom:56.25%;height:0;margin-bottom:12px;border-radius:10px;overflow:hidden">
          <iframe src="https://www.youtube.com/embed/${m[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>`;
      }
      return `<p style="margin:8px 0"><a href="${url}" target="_blank" rel="noopener" style="color:var(--ifwl-teal)">${url}</a></p>`;
    }).join('');
    return `<h4 style="margin:16px 0 8px">📺 Videos</h4>${items}`;
  }
  window.renderVideoEmbeds = renderVideoEmbeds;

  function renderRacedayMarkdown(src){
    const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let html = esc(String(src || ''));
    html = html.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="field-hint">[role mention]</span>');
    html = html.replace(/^### (.*)$/gm, '<h5 style="margin:14px 0 6px">$1</h5>');
    html = html.replace(/^## (.*)$/gm, '<h4 style="margin:16px 0 8px">$1</h4>');
    html = html.replace(/^# (.*)$/gm, '<h3 style="margin:18px 0 10px">$1</h3>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--ifwl-teal)">$1</a>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, (m) => m.startsWith('<a') ? m : `<a href="${m}" target="_blank" rel="noopener" style="color:var(--ifwl-teal)">${m}</a>`);
    html = html.replace(/^---$/gm, '<hr style="border-color:var(--ifwl-line);margin:14px 0">');
    // Bullet lines (* or -) become <li>, wrapped in <ul> where they run consecutively
    const lines = html.split('\n');
    let out = [];
    let inList = false;
    for(const line of lines){
      const bulletMatch = line.match(/^[*\-]\s+(.*)$/);
      if(bulletMatch){
        if(!inList){ out.push('<ul style="margin:6px 0 10px 20px">'); inList = true; }
        out.push(`<li>${bulletMatch[1]}</li>`);
      }else{
        if(inList){ out.push('</ul>'); inList = false; }
        out.push(line);
      }
    }
    if(inList) out.push('</ul>');
    return out.join('\n').replace(/\n{2,}/g, '</p><p style="margin:8px 0">').replace(/^/, '<p style="margin:8px 0">').replace(/$/, '</p>');
  }
  window.renderRacedayMarkdown = renderRacedayMarkdown;

  // Shows each notification one at a time with its own 60s forced-read
  // timer; acknowledging one moves to the next if more than one applies
  // today (e.g. two different rounds both raceday today).
  async function checkRacedayNotifications(){
    let notifications = [];
    // ✅ ADDED: the forced 60s read is once per calendar day - once a driver
    // has read ONE briefing today (server says so via alreadyReadToday, or
    // they just acknowledged one earlier in this queue) every further
    // briefing today gets an instant Skip button instead.
    let readToday = false;
    try{
      const resp = await apiGet('myRacedayNotifications');
      notifications = resp.notifications || [];
      readToday = resp.alreadyReadToday === true;
    }catch(e){ console.warn('Could not check raceday notifications', e); return; }
    if(!notifications.length) return;

    let queue = [...notifications];
    function showNext(){
      if(!queue.length) return;
      const n = queue.shift();
      const modal = q('racedayInfoModal');
      const body = q('racedayInfoBody');
      const btn = q('racedayInfoDismissBtn');
      const stripHtml = window.rdiQuickFactsStripHtml ? window.rdiQuickFactsStripHtml(n.quickFacts || {}) : '';
      body.innerHTML = `<h3 style="margin-top:0">${n.title}</h3>` + stripHtml + renderRacedayMarkdown(n.content) + renderVideoEmbeds(n.videoLinks || []);
      modal.classList.remove('hidden');
      let timer = null;
      // ✅ ADDED: staff (and only staff) skip the 60s forced-read timer - they
      // still see the exact same briefing content and it's still acknowledged
      // server-side via myRacedayAcknowledge (so it stops reappearing and
      // stays in the same audit trail as everyone else's), they just aren't
      // held to the same read timer regular drivers are.
      if(window.IFWL_STAFF){
        btn.disabled = false;
        btn.textContent = queue.length ? `Skip (staff) - next briefing (${queue.length} more)` : 'Skip (staff) - close';
      }else if(readToday){
        btn.disabled = false;
        btn.textContent = queue.length ? `Skip - next briefing (${queue.length} more)` : 'Skip - close';
      }else{
        // ✅ FIXED: this used to always start the 60s timer fresh, so a
        // driver who left the page (or clicked through to My Career / My
        // Race Team) before it finished got the SAME briefing again on
        // their next visit with a brand new full 60s wait - "every time I
        // go onto the home page it makes me sit through the message". The
        // server now stamps the first moment a briefing was shown today
        // (n.firstShownAtMs) and keeps returning that same stamp, so the
        // remaining wait here is based on real elapsed time since first
        // seen today, not since this particular page load.
        const elapsedSec = n.firstShownAtMs ? Math.max(0, Math.floor((Date.now() - n.firstShownAtMs) / 1000)) : 0;
        let remaining = Math.max(0, 60 - elapsedSec);
        if(remaining <= 0){
          btn.disabled = false;
          btn.textContent = queue.length ? 'Got it - next briefing' : 'Got it - close';
        }else{
          btn.disabled = true;
          btn.textContent = `Read for ${remaining}s to continue…`;
          timer = setInterval(() => {
            remaining--;
            if(remaining <= 0){
              clearInterval(timer);
              btn.disabled = false;
              btn.textContent = queue.length ? 'Got it - next briefing' : 'Got it - close';
            }else{
              btn.textContent = `Read for ${remaining}s to continue…`;
            }
          }, 1000);
        }
      }
      btn.onclick = async () => {
        if(btn.disabled) return;
        if(timer) clearInterval(timer);
        try{ await apiPost('myRacedayAcknowledge', { infoId: n.id }); }catch(e){ console.warn('Could not acknowledge raceday info', e); }
        readToday = true;
        modal.classList.add('hidden');
        if(queue.length) showNext();
      };
    }
    showNext();
  }
  window.checkRacedayNotifications = checkRacedayNotifications;

  // ✅ ADDED: on-demand, read-only raceday briefing for one event - the
  // "📋 Raceday briefing" button on each Available Races card. Reuses the
  // same modal as the forced notification, but there is no timer and
  // nothing is acknowledged; just a Close button.
  async function openRacedayBriefing(eventId, fallbackTitle){
    const modal = q('racedayInfoModal');
    const body = q('racedayInfoBody');
    const btn = q('racedayInfoDismissBtn');
    if(!modal || !body || !btn) return;
    body.innerHTML = '<div class="empty">Loading briefing&hellip;</div>';
    btn.disabled = false;
    btn.textContent = 'Close';
    btn.onclick = () => modal.classList.add('hidden');
    modal.classList.remove('hidden');
    try{
      const briefings = (await apiGet('myRacedayBriefings', '&eventId=' + encodeURIComponent(eventId))).briefings || [];
      if(!briefings.length){ body.innerHTML = `<h3 style="margin-top:0">${fallbackTitle || 'Raceday briefing'}</h3><div class="empty">No briefing has been added for this event yet.</div>`; return; }
      body.innerHTML = briefings.map(n => {
        const stripHtml = window.rdiQuickFactsStripHtml ? window.rdiQuickFactsStripHtml(n.quickFacts || {}) : '';
        return `<h3 style="margin-top:0">${n.title}</h3>` + stripHtml + renderRacedayMarkdown(n.content) + renderVideoEmbeds(n.videoLinks || []);
      }).join('<hr style="margin:22px 0">');
    }catch(e){
      body.innerHTML = `<div class="empty">Could not load the briefing: ${e.message || e}</div>`;
    }
  }
  window.openRacedayBriefing = openRacedayBriefing;

  async function applySeasonalOverlays(){
    const cardImg = q('seasonalOverlayImg');
    if(!cardImg) return;

    const events = await fetchSeasonalEventsConfig();
    // ✅ ADDED: banned drivers see the (reused April Fools) banned overlay
    // on their own card too, regardless of any currently active season.
    const isBanned = !!(currentProfile && currentProfile.ban && currentProfile.ban.endsAtMs && currentProfile.ban.endsAtMs > Date.now());
    const activeEvent = resolveCardOverlay(events, 'main', isBanned);

    if(activeEvent){
      cardImg.src = activeEvent.imageUrl;
      cardImg.classList.remove('hidden');
      cardImg.classList.toggle('glow', !!activeEvent.glow);
    }else{
      cardImg.classList.add('hidden');
      cardImg.removeAttribute('src');
    }
  }
  window.applySeasonalOverlays = applySeasonalOverlays;

  // ✅ ADDED: Affiliate Ads
  let __affiliateAdsCache = null;
  async function fetchAffiliateAds(){
    if(__affiliateAdsCache) return __affiliateAdsCache;
    try{
      __affiliateAdsCache = (await apiGet('affiliateAds')).topBanners || [];
    }catch(e){
      console.warn('Could not load affiliate ads', e);
      __affiliateAdsCache = [];
    }
    return __affiliateAdsCache;
  }
  window.fetchAffiliateAds = fetchAffiliateAds;
  window.invalidateAffiliateAdsCache = () => { __affiliateAdsCache = null; };

  let __affiliateRotateTimer = null;
  async function applyAffiliateAds(){
    const banners = await fetchAffiliateAds();
    const el = q('affiliateTopBanner');
    const img = q('affiliateTopBannerImg');
    const dotsWrap = q('affiliateTopBannerDots');
    if(!el || !img) return;

    if(__affiliateRotateTimer){ clearInterval(__affiliateRotateTimer); __affiliateRotateTimer = null; }

    if(!banners.length){ el.style.display = 'none'; return; }

    let current = 0;
    function show(i){
      current = i;
      img.src = banners[i].imageUrl;
      el.href = banners[i].linkUrl || '#';
      if(dotsWrap) dotsWrap.querySelectorAll('span').forEach((d, di) => d.classList.toggle('active', di === i));
    }

    dotsWrap.innerHTML = banners.length > 1 ? banners.map(() => '<span></span>').join('') : '';
    el.style.display = '';
    show(0);

    // Cycles every 10 seconds - only bothers with an interval at all if
    // there's actually more than one banner to rotate through.
    if(banners.length > 1){
      __affiliateRotateTimer = setInterval(() => {
        show((current + 1) % banners.length);
      }, 10000);
    }
  }
  window.applyAffiliateAds = applyAffiliateAds;

  // Trophy Cabinet's design catalog - identical pattern to Calling Cards
  // above, just a separate catalog/storage path so the two don't mix.
  async function fetchTrophyDesignCatalog(){
    if(USE_DEMO_FALLBACK) return demoGet('trophyDesigns', []);
    return (await apiGet('trophyDesignList')).designs || [];
  }
  async function saveTrophyDesignCatalog(designs){
    if(USE_DEMO_FALLBACK){ demoSet('trophyDesigns', designs); return designs; }
    return (await apiPost('staffTrophyDesignSave', { designs })).designs || designs;
  }
  window.IFWL_TrophyDesignAPI = { fetchTrophyDesignCatalog, saveTrophyDesignCatalog };

  // ✅ ADDED: BOP TRACKer - Gold-gated read of the current BOP file + car
  // catalog, Owner-only uploads/edits. Cached per page load since the
  // driver-facing panel re-reads it every time the platform/track selector
  // changes - invalidated on any staff save so the very next fetch (staff's
  // own preview, or any driver's next visit) picks up the change.
  let __bopDataCache = null;
  async function fetchBopTrackerData(force){
    if(__bopDataCache && !force) return __bopDataCache;
    __bopDataCache = await apiGet('bopTrackerData');
    return __bopDataCache;
  }
  async function uploadBopFile(payload){
    const result = await apiPost('staffBopUpload', payload);
    __bopDataCache = null;
    return result;
  }
  async function saveBopCarCatalog(cars){
    const result = await apiPost('staffBopCarCatalogSave', { cars });
    __bopDataCache = null;
    return result.cars || cars;
  }
  window.IFWL_BopAPI = { fetchBopTrackerData, uploadBopFile, saveBopCarCatalog };

  function nextLicenceNumber(){
    const meta = demoGet('counter', {next:1});
    const num = meta.next; meta.next = num+1; demoSet('counter', meta);
    return `IFWL-${new Date().getFullYear()}-${String(num).padStart(5,'0')}`;
  }

  async function apiGet(action, extra){
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const url = `${FN}?${action}=1&token=${encodeURIComponent(token)}${extra||''}`;
    const r = await fetch(url, {cache:'no-store'});
    const d = await r.json().catch(()=>({}));
    if(!r.ok){ const err = new Error(d?.error || `Request "${action}" failed (${r.status})`); err.body = d; err.status = r.status; throw err; }
    return d;
  }
  async function apiPost(action, body){
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const r = await fetch(`${FN}?${action}=1&token=${encodeURIComponent(token)}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{})});
    const d = await r.json().catch(()=>({}));
    if(!r.ok){ const err = new Error(d?.error || `Request "${action}" failed (${r.status})`); err.body = d; err.status = r.status; throw err; }
    return d;
  }

  // ---- own profile ----
  async function fetchMyProfile(){
    const meta = window.IFWL_META;
    const id = window.IFWL_AUTH.userId(meta);
    if(USE_DEMO_FALLBACK){
      let all = demoGet('profiles', {});
      if(!all[id]){
        all[id] = {
          discordId:id, name: window.IFWL_AUTH.userName(meta), licenceNumber: nextLicenceNumber(),
          tier:'No Licence', tierHistory:[{tier:'No Licence',date:new Date().toISOString(),reason:'Licence issued',setBy:'system'}],
          avatarMode:'discord', avatarUrl:'', discordAvatarUrl: meta?.avatarUrl || meta?.avatar || '',
          photoUploadUrl:'', headerUploadUrl:'', bio:'', accDriverNames:[]
        };
        demoSet('profiles', all);
      }
      return all[id];
    }
    try { return (await apiGet('licenceProfile')).profile || null; }
    catch(e){
      if(e.body?.refused){ throw e; } // let init() handle this distinctly, don't silently swallow it
      console.warn(e.message);
      return null;
    }
  }

  // ✅ ADDED: Site Accent Theme - Gold cosmetic. Curated palette only
  // (matches the CSS body.theme-* classes defined near :root). Applying is
  // just a body class swap - every element already styled off
  // var(--ifwl-teal)/var(--ifwl-teal-deep) picks it up automatically.
  const ACCENT_THEMES = [
    { key: 'teal', label: 'Teal (default)', swatch: '#1fd6bd' },
    { key: 'crimson', label: 'Crimson', swatch: '#ff4d6a' },
    { key: 'ocean', label: 'Ocean', swatch: '#38b6ff' },
    { key: 'royal', label: 'Royal', swatch: '#8f7bff' },
    { key: 'sunset', label: 'Sunset', swatch: '#ff9a3d' },
    { key: 'emerald', label: 'Emerald', swatch: '#1fbf82' },
    { key: 'hotpink', label: 'Hot Pink', swatch: '#ff4fa3' },
    { key: 'chrome', label: 'Chrome', swatch: '#dfe6ea' }
  ];

  function applyAccentTheme(){
    document.body.classList.remove(...ACCENT_THEMES.map(t => `theme-${t.key}`));
    const key = (window.IFWL_GOLD && currentProfile?.accentTheme) ? currentProfile.accentTheme : 'teal';
    if(key !== 'teal') document.body.classList.add(`theme-${key}`);
    renderAccentThemeSwatches();
  }

  function renderAccentThemeSwatches(){
    const wrap = q('accentThemeSwatches');
    if(!wrap) return;
    const activeKey = currentProfile?.accentTheme || 'teal';
    wrap.innerHTML = ACCENT_THEMES.map(t =>
      `<button type="button" class="accent-swatch${t.key===activeKey?' active':''}" style="background:${t.swatch}" data-theme="${t.key}" title="${t.label}" aria-label="${t.label}"></button>`
    ).join('');
    wrap.querySelectorAll('.accent-swatch').forEach(btn => btn.addEventListener('click', async () => {
      const key = btn.dataset.theme;
      document.body.classList.remove(...ACCENT_THEMES.map(t => `theme-${t.key}`));
      if(key !== 'teal') document.body.classList.add(`theme-${key}`); // instant feedback, before the save even completes
      wrap.querySelectorAll('.accent-swatch').forEach(b => b.classList.toggle('active', b === btn));
      try{
        currentProfile = await saveMyProfile({ accentTheme: key });
      }catch(e){
        console.warn('Could not save accent theme', e);
      }
    }));
  }

  // ✅ ADDED: Dark Mode - Silver+ perk, same "one body class, driver's own
  // profile field, only their own view changes" pattern as the Gold accent
  // theme above, just gated one tier lower (isSilverPlusAccess() server-side,
  // window.IFWL_SILVER_PLUS here) and swapping the WHOLE theme rather than
  // two accent variables.
  function applyDarkTheme(){
    const on = !!(window.IFWL_SILVER_PLUS && currentProfile?.siteDarkTheme);
    document.body.classList.toggle('theme-dark', on);
    renderDarkThemeToggle();
  }

  function renderDarkThemeToggle(){
    const toggle = q('darkModeToggle');
    if(!toggle) return;
    const on = !!currentProfile?.siteDarkTheme;
    toggle.checked = on;
    const label = q('darkModeToggleLabel');
    if(label) label.textContent = on ? 'Dark theme' : 'Light theme';
    if(!toggle.dataset.wired){
      toggle.dataset.wired = '1';
      toggle.addEventListener('change', async () => {
        const nextOn = toggle.checked;
        document.body.classList.toggle('theme-dark', window.IFWL_SILVER_PLUS && nextOn); // instant feedback, before the save even completes
        if(label) label.textContent = nextOn ? 'Dark theme' : 'Light theme';
        try{
          currentProfile = await saveMyProfile({ siteDarkTheme: nextOn });
        }catch(e){
          console.warn('Could not save dark theme preference', e);
          toggle.checked = !nextOn; // revert the switch if the save failed
          document.body.classList.toggle('theme-dark', window.IFWL_SILVER_PLUS && !nextOn);
          if(label) label.textContent = !nextOn ? 'Dark theme' : 'Light theme';
        }
      });
    }
  }

  async function saveMyProfile(patch){
    const meta = window.IFWL_META; const id = window.IFWL_AUTH.userId(meta);
    if(USE_DEMO_FALLBACK){
      let all = demoGet('profiles', {});
      const existing = all[id] || {};
      const merged = {...existing, ...patch};
      if(patch.platformAdd){
        const current = existing.platform || '';
        merged.platform = (current && current !== patch.platformAdd) ? 'both' : patch.platformAdd;
        delete merged.platformAdd;
      }
      all[id] = merged;
      demoSet('profiles', all);
      return all[id];
    }
    return (await apiPost('updateLicenceProfile', patch)).profile;
  }

  // Ticket count/detail still needs the Cloud Function - tickets are real
  // private data (see ?tickets=1 contract below). Stats no longer need any
  // backend at all - see fetchPerformanceStats below.
  async function fetchTicketInfo(){
    if(USE_DEMO_FALLBACK){
      const demoTickets = [
        {season:'Season 1', track:'Imola', ruleBreach:'RP8st — Rear-End Collision (Braking Zone) (15s)', fullIncident:'Example ticket for demo purposes only.', status:'Finalised'},
      ];
      return { ticketCount: demoTickets.length, tickets: demoTickets };
    }
    return apiGet('tickets');
  }

  // Overall Score / Consistency Avg / Race Risk Avg are computed LIVE, client-side,
  // straight from the public GitHub-synced session files via ifwl-stats-engine.js -
  // the exact same formula Live Timings' own Rivals leaderboard uses. No backend
  // involved. Returns null if this driver has no linked ACC name yet, or no
  // session rows were found for that name.
  async function fetchPerformanceStats(profile){
    const names = (profile?.accDriverNames?.length ? profile.accDriverNames : (profile?.name ? [profile.name] : []));
    if(!names.length || !window.IFWLStats) return null;
    try{ return await window.IFWLStats.computeForDriver(names); }
    catch(e){ console.warn('IFWLStats.computeForDriver failed', e); return null; }
  }
  window.fetchPerformanceStats = fetchPerformanceStats;

  async function fetchDirectory(){
    if(USE_DEMO_FALLBACK){
      const all = demoGet('profiles', {});
      return Object.values(all);
    }
    return (await apiGet('licenceDirectory')).drivers || [];
  }

  // ✅ ADDED: Peer Ratings - "good racer/bad racer" thumbs up/down drivers
  // leave on each other from the Driver Directory. fetchMyPeerRatingsGiven
  // returns ONLY the caller's own votes ({targetDiscordId: 'up'|'down'}) -
  // never anyone else's, and never the aggregate counts (Staff-only, see
  // Staff: Licence Management) - so the Directory can lock a card's buttons
  // to whichever choice this driver already made, without exposing anything
  // about how anyone else voted. Server contract: ?myPeerRatingsGiven=1 ->
  // {ratings}, ?submitPeerRating=1 {targetId, rating} (one-time, no undo).
  async function fetchMyPeerRatingsGiven(){
    if(USE_DEMO_FALLBACK) return demoGet('peerRatingsGiven', {});
    try{ return (await apiGet('myPeerRatingsGiven')).ratings || {}; }
    catch(e){ console.warn('Could not load peer ratings', e); return {}; }
  }
  async function submitPeerRating(targetId, rating){
    if(USE_DEMO_FALLBACK){
      const all = demoGet('peerRatingsGiven', {});
      all[targetId] = rating;
      demoSet('peerRatingsGiven', all);
      return { ok:true, rating };
    }
    return apiPost('submitPeerRating', { targetId, rating });
  }
  window.IFWL_PeerRatingAPI = { fetchMyPeerRatingsGiven, submitPeerRating };

  // ✅ ADDED: public roster read (name/licenceNumber/tier/accDriverNames) -
  // used by the Commentator "Drivers to Watch" screen to match a pace
  // standings row (which only has a raw ACC name string) back to a licence,
  // without needing the staff-only search endpoint. Same public endpoint
  // the Ticket accused-driver picker already relies on.
  async function fetchLicenceRosterPublic(){
    if(USE_DEMO_FALLBACK) return [];
    return (await apiGet('licenceRoster')).drivers || [];
  }

  let currentTiers = DEFAULT_TIERS;

  function hexToRgba(hex, alpha){
    const clean = String(hex || '').replace('#','');
    const full = clean.length === 3 ? clean.split('').map(c => c+c).join('') : clean.padEnd(6,'0').slice(0,6);
    const r = parseInt(full.substring(0,2),16) || 0, g = parseInt(full.substring(2,4),16) || 0, b = parseInt(full.substring(4,6),16) || 0;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  function findTier(tierName){
    return currentTiers.find(t => t.name === tierName) || currentTiers[0] || DEFAULT_TIERS[0];
  }
  window.findTier = findTier;
  window.hexToRgba = hexToRgba;
  // ✅ ADDED: LMU sub-licences are stored in the same tier list/editor as the
  // main ladder (reusing the existing order/colour/foil UI), but they are
  // driver-self-selected add-ons, not something a driver is ever assigned
  // AS their main licence - so every place that lists "tiers" for ranking,
  // filtering, or assignment purposes must exclude them.
  function mainLadderTiers(list){
    return (list || []).filter(t => !t.lmuSubLicence);
  }
  window.IFWL_mainLadderTiers = mainLadderTiers;
  window.mainLadderTiers = mainLadderTiers;
  function applyTierPill(el, tierName){
    const tier = findTier(tierName);
    el.textContent = tierName || tier.name;
    el.style.background = hexToRgba(tier.color, 0.16);
    el.style.color = tier.color;
    el.style.border = `1px solid ${hexToRgba(tier.color, 0.35)}`;
  }
  function applyTierCard(tierName){
    const tier = findTier(tierName);
    const outer = q('licenceCardOuter');
    outer.classList.toggle('foil', !!tier.foil);
    outer.style.background = tier.foil ? '' : `linear-gradient(135deg, ${tier.color}, var(--ifwl-purple))`;
  }
  function renderTierLegend(){
    const body = q('tierLegendBody');
    if(!body) return;
    const sorted = mainLadderTiers(currentTiers).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    body.innerHTML = sorted.map(t => `<div class="tier-chip" style="border-color:${hexToRgba(t.color,0.35)}"><div class="swatch" style="background:${t.color}"></div><strong>${t.name}</strong><span>${t.description || ''}</span></div>`).join('');
  }
  function populateTierSelect(selectEl, { includeBlank } = {}){
    if(!selectEl) return;
    const sorted = mainLadderTiers(currentTiers).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    selectEl.innerHTML = (includeBlank ? '<option value="">All tiers</option>' : '') +
      sorted.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
  }

  let currentProfile = null;
  let avatarMode = 'discord';

  // ✅ CHANGED: shared band classifier - 0-2 none / 3-4 amber / 5-6 final
  // warning / 7+ escalate - matches the licence points bands the server
  // now uses everywhere (see ifwlLicencePointsBand in rtgate.js). Used by
  // renderCard, the staff card preview, and the Licence Database table so
  // all three always agree.
  function ifwlPointsBandClass(points){
    const n = Number(points) || 0;
    if(n <= 2) return 'pts-green';
    if(n <= 4) return 'pts-orange';
    if(n <= 6) return 'pts-warning';
    return 'pts-red';
  }
  // ✅ FIXED: this page's inline <script> blocks each have their own
  // closure (see the other "bridged" notes on this page) - the Staff
  // Licence Database and staff card preview live in the 3rd block below
  // and were calling this as a bare identifier, which threw
  // "ifwlPointsBandClass is not defined". Exposed on window, same pattern
  // as window.applyLicenceBetaNotice etc.
  window.ifwlPointsBandClass = ifwlPointsBandClass;

  function renderCard(p){
    q('licenceName').textContent = p.name || 'Unnamed driver';
    q('licenceNumber').textContent = p.licenceNumber || 'IFWL-0000-00000';
    // ✅ ADDED: show the green nudge only once there's genuinely no ACC
    // driver name linked - and never for staff, who don't need one.
    const nudge = q('noAccNameNudge');
    if(nudge) nudge.classList.toggle('hidden', window.IFWL_STAFF || !!(p.accDriverNames && p.accDriverNames.length));
    const teamLogoEl = q('licenceTeamLogo');
    if(teamLogoEl){
      if(p.teamLogoUrl){ teamLogoEl.src = p.teamLogoUrl; teamLogoEl.classList.remove('hidden'); }
      else teamLogoEl.classList.add('hidden');
    }
    applyTierPill(q('licenceCardTierPill'), p.tier || 'No Licence');
    applyTierPill(q('myTierPill'), p.tier || 'No Licence');
    applyTierCard(p.tier || 'No Licence');
    const points = Number(p.licencePoints || 0);
    const pointsBadge = q('cardPointsBadge');
    pointsBadge.textContent = points;
    pointsBadge.className = 'points-value ' + ifwlPointsBandClass(points);
    renderCallingCardBox(p.callingCardUrl, p.tier);
    const photo = p.avatarMode==='upload' && p.photoUploadUrl ? p.photoUploadUrl
                : p.avatarMode==='url' && p.avatarUrl ? p.avatarUrl
                : (p.discordAvatarUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="%231a2027"/></svg>');
    q('licencePhoto').src = photo;
    if(p.headerUploadUrl){
      q('licenceCardInner').style.backgroundImage = `url('${p.headerUploadUrl}')`;
    }
    q('bioInput').value = p.bio || '';
    fillSocialsEditor(p.socials);
    applyPatronHome();
    avatarMode = p.avatarMode || 'discord';
    q('modeDiscordBtn').classList.toggle('active', avatarMode==='discord');
    q('modeUrlBtn').classList.toggle('active', avatarMode==='url');
    q('avatarUrlInput').classList.toggle('hidden', avatarMode!=='url');
    q('avatarUrlInput').value = p.avatarUrl || '';
    q('accDriverNamesInput').value = (p.accDriverNames || []).join(', ');
    q('platformSelect').value = p.platform || '';
    if(q('simgridUsernameInput')) q('simgridUsernameInput').value = p.simgridUsername || '';
    if(q('steamIdInput')) q('steamIdInput').value = p.steamId || '';
    if(q('namePronunciationInput')) q('namePronunciationInput').value = p.namePronunciation || '';
    q('myLicenceSub').textContent = `Licence ${p.licenceNumber} · linked to live timing results by driver name`;
  }

  // ✅ CHANGED: tiered display, re-introduced. Bronze/Standard see that a
  // ticket exists and its basic incident line only ("ticket only"); Silver
  // adds Track/Reported by/Date; Gold adds Outcome/Penalty/Points and the
  // steward comments audit trail. Every driver still sees every one of
  // their own tickets (nothing is hidden by count), just with progressively
  // more field detail per tier - matches the same tiering pattern already
  // used on Qualification Ranking and Submit a Ticket elsewhere on this page.
  function renderTicketData(ticketInfo){
    q('ticketCountOnly').classList.add('hidden');
    q('ticketHistoryBody').classList.remove('hidden');

    const tickets = ticketInfo?.tickets || [];
    const body = q('ticketHistoryBody');

    const isGoldOrStaff = window.IFWL_GOLD || window.IFWL_STAFF;
    const isSilverOnly = window.IFWL_SILVER_PLUS && !isGoldOrStaff;
    const isBronzeOrBelow = !window.IFWL_SILVER_PLUS && !isGoldOrStaff;
    q('ticketPanelBadge').textContent = isGoldOrStaff ? 'Gold - full detail' : isSilverOnly ? 'Silver view' : 'Bronze view';

    if(!tickets.length){ body.innerHTML = '<div class="empty">No steward tickets on record. Clean sheet.</div>'; return; }

    body.innerHTML = tickets.map((t, i) => {
      const statusClass = /final/i.test(t.status) ? 'finalised' : /dismiss/i.test(t.status) ? 'dismissed' : 'pending';
      const dateLabel = t.timestampMs ? new Date(t.timestampMs).toLocaleDateString() : '-';

      const incidentBlock = `<div class="thc-incident"><strong>${t.ruleBreach || t.postRaceCode || 'Incident'}</strong><p>${t.fullIncident || t.stewardDecision || ''}</p></div>`;

      let fieldsBlock = '';
      if(!isBronzeOrBelow){
        fieldsBlock = `<div class="thc-field-grid">
          <div class="thc-field"><span>Track</span><strong>${t.track || '-'}</strong></div>
          <div class="thc-field"><span>Reported by</span><strong>${t.reporter || '-'}</strong></div>
          <div class="thc-field"><span>Date</span><strong>${dateLabel}</strong></div>
          ${isGoldOrStaff ? `
          <div class="thc-field"><span>Outcome</span><strong>${t.stewardDecision || (t.status === 'Finalised' ? '-' : 'Pending')}</strong></div>
          <div class="thc-field"><span>Penalty</span><strong>${t.finalPenalty || '-'}</strong></div>
          <div class="thc-field"><span>Points</span><strong class="${t.points > 0 ? 'thc-points-pos' : 'thc-points-zero'}">${t.points > 0 ? '+' + t.points : '0'}</strong></div>
          ` : ''}
        </div>`;
      }

      let upsellBlock = '';
      if(isBronzeOrBelow){
        upsellBlock = `<div class="thc-upsell">🔒 <strong>Silver</strong> unlocks Track, Reported by and Date on this ticket. <strong>Gold</strong> also unlocks Outcome, Penalty, Points and the full steward comments audit trail. <a href="https://www.patreon.com/c/IFWL" target="_blank" rel="noopener">Upgrade on Patreon &rarr;</a></div>`;
      } else if(isSilverOnly){
        upsellBlock = `<div class="thc-upsell">🏆 <strong>Gold</strong> also unlocks Outcome, Penalty, Points, and the full steward comments audit trail on this ticket. <a href="https://www.patreon.com/c/IFWL" target="_blank" rel="noopener">Upgrade to Gold &rarr;</a></div>`;
      }

      const auditBlock = isGoldOrStaff ? `
        <button type="button" class="thc-audit-toggle" data-ticket-audit="${t.id}" data-idx="${i}">View steward comments (audit) &darr;</button>
        <div class="thc-audit-box hidden" id="thcAudit_${i}"></div>
      ` : '';

      return `<div class="ticket-history-card">
        <div class="thc-head"><span class="ticket-status ${statusClass}">${t.status || 'Pending'}</span><span class="thc-id">${t.id || ''}</span></div>
        ${incidentBlock}
        ${fieldsBlock}
        ${upsellBlock}
        ${auditBlock}
      </div>`;
    }).join('');

    if(isGoldOrStaff){
      body.querySelectorAll('[data-ticket-audit]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ticketId = btn.dataset.ticketAudit;
          const idx = btn.dataset.idx;
          const box = q(`thcAudit_${idx}`);
          const opening = box.classList.contains('hidden');
          if(!opening){ box.classList.add('hidden'); btn.textContent = 'View steward comments (audit) ↓'; return; }
          box.classList.remove('hidden');
          btn.textContent = 'Hide steward comments (audit) ↑';
          if(box.dataset.loaded) return;
          box.innerHTML = '<div class="field-hint">Loading...</div>';
          try{
            const data = await apiGet('ticketAudit', `&ticketId=${encodeURIComponent(ticketId)}`);
            const comments = data.comments || [];
            box.innerHTML = comments.length ? comments.map(c => `
              <div class="thc-audit-entry">
                <div class="thc-audit-meta">${c.whenMs ? new Date(c.whenMs).toLocaleString() : ''} · ${c.authorMasked}${c.kind ? ' · ' + c.kind : ''}</div>
                <div class="thc-audit-text">${c.text}</div>
              </div>
            `).join('') : '<div class="field-hint">No steward comments recorded yet.</div>';
            box.dataset.loaded = '1';
          }catch(e){
            box.innerHTML = `<div class="field-hint">Could not load comments: ${e.message}</div>`;
          }
        });
      });
    }
  }

  // Feeds the licence card's own mini stats and points colour - the ticket
  // count/detail lives exclusively in the Steward Ticket History panel now,
  // not duplicated here, since that area is reserved for the calling card.
  function renderCardStats(stats){
    q('cardStatScore').textContent = stats?.overallScore ?? '-';
    q('cardStatConsistency').textContent = stats?.consistencyAvg != null ? stats.consistencyAvg + '%' : '-';
    q('cardStatRisk').textContent = stats?.riskAvg != null ? stats.riskAvg + '%' : '-';
  }

  // UK-style L-plate, rendered inline so it never depends on an uploaded
  // asset existing - this is the default shown for Provisional tier when no
  // calling card has been chosen.
  const L_PLATE_SVG = `<svg viewBox="0 0 100 100" width="90" height="90"><rect x="4" y="4" width="92" height="92" rx="10" fill="#ffffff" stroke="#d0d0d0" stroke-width="2"/><text x="50" y="76" font-size="72" font-weight="900" fill="#e2231a" text-anchor="middle" font-family="Arial, Helvetica, sans-serif">L</text></svg>`;

  function renderCallingCardBox(callingCardUrl, tier){
    const box = q('callingCardBox');
    if(callingCardUrl){
      box.innerHTML = `<img src="${callingCardUrl}" alt="Patreon calling card">`;
    } else if(tier === 'Provisional'){
      box.innerHTML = L_PLATE_SVG;
    } else {
      box.innerHTML = '<div class="cc-empty">No calling card selected</div>';
    }
  }

  const DIR_PAGE_SIZE = 24;
  let dirCurrentPage = 0;
  // ✅ ADDED: Peer Ratings - {targetDiscordId: 'up'|'down'} for every driver
  // THIS logged-in user has already rated, loaded once in init() alongside
  // the directory fetch and kept in sync locally the moment a vote is cast
  // (no need to re-fetch on every render/page/search). Never holds anyone
  // else's votes or any aggregate count - see fetchMyPeerRatingsGiven.
  let myPeerRatingsGiven = {};

  /* ---------- Patron socials + driver profile popup ---------- */
  const SOC_KEYS = ['instagram','youtube','twitch','facebook','x','tiktok','website'];
  const SOC_META = {
    instagram:{label:'Instagram', ph:'username or link', icon:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".6" fill="currentColor"/>'},
    youtube:{label:'YouTube', ph:'@channel or link', icon:'<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.2v5.6l5-2.8z" fill="currentColor"/>'},
    twitch:{label:'Twitch', ph:'username or link', icon:'<path d="M5 3h15v10l-4 4h-4l-3 3v-3H5z"/><path d="M15 7.5v3M11 7.5v3"/>'},
    facebook:{label:'Facebook', ph:'profile name or link', icon:'<path d="M14 21v-8h3l.5-3.5H14V7.4c0-1 .4-1.7 1.8-1.7h1.8V2.6C17.2 2.5 16.2 2.4 15 2.4c-2.6 0-4.4 1.6-4.4 4.5v2.6H7.5V13h3.1v8z" fill="currentColor" stroke="none"/>'},
    x:{label:'X', ph:'username or link', icon:'<path d="M4.5 4.5l15 15M19.5 4.5l-15 15"/>'},
    tiktok:{label:'TikTok', ph:'username or link', icon:'<path d="M14 3v11.2a3.6 3.6 0 1 1-3.6-3.6M14 3c.4 2.6 2 4.2 4.6 4.6"/>'},
    website:{label:'Website', ph:'https://your-site.com', icon:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>'}
  };
  const socEsc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function socUrl(key, val){
    val = String(val || '').trim();
    if(!val) return '';
    if(key === 'website') return /^https?:\/\/[^\s"'<>]+$/i.test(val) ? val : '';
    if(!/^[A-Za-z0-9._-]{1,100}(\/[A-Za-z0-9._-]{1,100})?$/.test(val)) return '';
    switch(key){
      case 'instagram': return 'https://instagram.com/' + val;
      case 'youtube': return val.includes('/') ? 'https://youtube.com/' + val : 'https://youtube.com/@' + val;
      case 'twitch': return 'https://twitch.tv/' + val;
      case 'facebook': return 'https://facebook.com/' + val;
      case 'x': return 'https://x.com/' + val;
      case 'tiktok': return 'https://tiktok.com/@' + val;
    }
    return '';
  }
  function socDisplay(key, val){
    if(key === 'website') return String(val).replace(/^https?:\/\//i,'').replace(/\/$/,'');
    return (key === 'youtube' && !String(val).includes('/') ? '@' : (key === 'instagram' || key === 'tiktok' || key === 'x' ? '@' : '')) + val;
  }
  const socIconSvg = (key) => `<svg viewBox="0 0 24 24" aria-hidden="true">${SOC_META[key].icon}</svg>`;
  function socLinks(socials){
    const out = [];
    SOC_KEYS.forEach(k => { const u = socUrl(k, socials && socials[k]); if(u) out.push({ key:k, url:u, text:socDisplay(k, socials[k]) }); });
    return out;
  }
  function socButtonsHtml(socials){
    const links = socLinks(socials);
    if(!links.length) return '';
    return `<div class="dir-socials">${links.map(l => `<a class="soc-btn soc-${l.key}" href="${socEsc(l.url)}" target="_blank" rel="noopener noreferrer" title="${socEsc(SOC_META[l.key].label)}: ${socEsc(l.text)}">${socIconSvg(l.key)}</a>`).join('')}</div>`;
  }
  function buildSocialsEditor(){
    const host = q('socialsEditGrid');
    if(!host || host.dataset.built) return;
    host.dataset.built = '1';
    host.innerHTML = SOC_KEYS.map(k => `<div class="soc-edit-row"><span class="soc-btn soc-${k}" title="${SOC_META[k].label}">${socIconSvg(k)}</span><input type="${k === 'website' ? 'url' : 'text'}" id="socInput_${k}" maxlength="200" placeholder="${SOC_META[k].label}: ${SOC_META[k].ph}" autocomplete="off"></div>`).join('');
  }
  function fillSocialsEditor(socials){
    buildSocialsEditor();
    SOC_KEYS.forEach(k => { const el = q('socInput_' + k); if(el) el.value = (socials && socials[k]) || ''; });
  }
  function readSocialsEditor(){
    const out = {};
    SOC_KEYS.forEach(k => { out[k] = (q('socInput_' + k)?.value || '').trim(); });
    return out;
  }

  function ensureDriverModal(){
    let m = q('driverModal');
    if(m) return m;
    m = document.createElement('div');
    m.id = 'driverModal';
    m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true');
    m.innerHTML = '<div class="dm-card" id="driverModalCard"></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => { if(e.target === m) closeDriverModal(); });
    document.addEventListener('keydown', e => { if(e.key === 'Escape') closeDriverModal(); });
    return m;
  }
  function closeDriverModal(){ q('driverModal')?.classList.remove('open'); document.body.style.overflow = ''; }
  function openDriverModal(r){
    const m = ensureDriverModal();
    const tier = findTier(r.tier || 'No Licence');
    const thumb = r.avatarMode === 'upload' && r.photoUploadUrl ? r.photoUploadUrl
                : r.avatarMode === 'url' && r.avatarUrl ? r.avatarUrl : '';
    const heroStyle = r.headerUploadUrl ? ` style="background-image:url('${socEsc(r.headerUploadUrl)}')"` : '';
    const patron = r.patreonOutlineTier ? String(r.patreonOutlineTier) : '';
    const patronColors = { gold:'#e0a800', silver:'#9aa5b1', bronze:'#b06a3b' };
    const platformLabel = r.platform === 'pc' ? 'PC' : r.platform === 'console' ? 'Console' : r.platform === 'both' ? 'PC + Console' : '';
    const links = socLinks(r.socials);
    const trophies = (r.showcaseTrophies || []).map(t => {
      const placeLabel = t.place === 'gold' ? '1st' : t.place === 'silver' ? '2nd' : '3rd';
      const visual = t.trophyImageUrl ? `<img src="${socEsc(t.trophyImageUrl)}" alt="">` : (window.trophySvg ? window.trophySvg(t.place, 'dm_' + t.trophyId) : '');
      return `<div class="lct-trophy" title="${socEsc(placeLabel + ' - ' + (t.eventName || ''))}">${visual}</div>`;
    }).join('');
    const sec = (title, inner, wide) => inner ? `<div class="dm-sec${wide ? ' wide' : ''}"><h4>${title}</h4>${inner}</div>` : '';
    m.querySelector('#driverModalCard').innerHTML = `
      <button class="dm-close" type="button" aria-label="Close" id="dmCloseBtn">&times;</button>
      <div class="dm-hero"${heroStyle}></div>
      <div class="dm-top">
        <div class="dm-avatar">${thumb ? `<img src="${socEsc(thumb)}" alt="">` : ''}</div>
        <div class="dm-id">
          <div class="dm-name">${socEsc(r.name || 'Unnamed driver')}</div>
          <div class="dm-sub"><span class="mono" style="color:var(--text-muted)">${socEsc(r.licenceNumber || '-')}</span>
            <span class="tier-pill" style="background:${hexToRgba(tier.color,0.18)};color:${tier.color};border:1px solid ${hexToRgba(tier.color,0.4)}">${socEsc(r.tier || 'No Licence')}</span></div>
        </div>
      </div>
      <div class="dm-grid">
        ${sec('Membership', patron ? `<div class="dm-val"><span class="dm-dot" style="background:${patronColors[patron] || '#9aa5b1'}"></span>${socEsc(patron.charAt(0).toUpperCase() + patron.slice(1))} Patron</div>` : '<div class="dm-val" style="color:var(--text-muted)">-</div>')}
        ${sec('Platform', platformLabel ? `<div class="dm-val">${platformLabel}</div>` : '<div class="dm-val" style="color:var(--text-muted)">-</div>')}
        ${sec('Race Team', r.teamName ? `<div class="dm-val">${r.teamLogoUrl ? `<img src="${socEsc(r.teamLogoUrl)}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:6px">` : ''}${socEsc(r.teamName)}</div>` : '<div class="dm-val" style="color:var(--text-muted)">No team</div>')}
        ${sec('Driver Name', (r.accDriverNames && r.accDriverNames.length) ? `<div class="dm-val">${r.accDriverNames.map(socEsc).join(' &middot; ')}</div>` : '<div class="dm-val" style="color:var(--text-muted)">-</div>')}
        ${sec('Trophies', trophies ? `<div class="dir-card-trophies" style="position:static;padding:0">${trophies}</div>` : '', true)}
        ${links.length ? sec('Socials', links.map(l => `<a class="dm-soc-row" href="${socEsc(l.url)}" target="_blank" rel="noopener noreferrer"><span class="soc-btn soc-${l.key}">${socIconSvg(l.key)}</span><span class="h">${socEsc(l.text)}</span><svg class="out" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>`).join(''), true) : ''}
      </div>`;
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
    q('dmCloseBtn').addEventListener('click', closeDriverModal);
  }

  /* Patron Home: full-screen backdrop from the driver's own card header image */
  function applyPatronHome(){
    const el = q('patronBackdrop');
    if(!el) return;
    const isPatron = !!(window.IFWL_SILVER_PLUS || window.IFWL_GOLD);
    const onHome = !!q('myLicencePanel')?.classList.contains('is-active-view');
    const on = isPatron && onHome && !!currentProfile;
    document.body.classList.toggle('patron-home', on);
    if(!on) return;
    const img = currentProfile.headerUploadUrl || '';
    if(img){
      el.style.backgroundImage = `url("${String(img).replace(/"/g, '%22')}")`;
      el.classList.remove('no-img','gold');
    }else{
      el.style.backgroundImage = '';
      el.classList.add('no-img');
      el.classList.toggle('gold', !!window.IFWL_GOLD);
    }
  }
  window.applyPatronHome = applyPatronHome;

  function renderDirectory(rows){
    const search = (q('dirSearch').value||'').toLowerCase();
    const tierFilter = q('dirTierFilter').value;
    const filtered = rows.filter(r=>{
      const matchesSearch = !search || (r.name||'').toLowerCase().includes(search) || (r.licenceNumber||'').toLowerCase().includes(search)
        || (r.accDriverNames||[]).some(n => (n||'').toLowerCase().includes(search));
      const matchesTier = !tierFilter || r.tier===tierFilter;
      return matchesSearch && matchesTier;
    });
    const body = q('dirTableBody');
    const pager = q('dirPager');
    if(!filtered.length){ body.innerHTML = '<div class="empty">No drivers match.</div>'; if(pager) pager.innerHTML = ''; return; }

    // ✅ ADDED: Gold first, then Silver, then Bronze, then everyone else -
    // same flat grid, just reordered. Ties (e.g. two Gold drivers) keep
    // their original relative order since Array.sort is stable.
    const PATREON_SORT_RANK = { gold: 0, silver: 1, bronze: 2 };
    filtered.sort((a, b) => (PATREON_SORT_RANK[a.patreonOutlineTier] ?? 3) - (PATREON_SORT_RANK[b.patreonOutlineTier] ?? 3));

    // ✅ ADDED: paginate the grid, 24 cards per page, so a large roster
    // doesn't render hundreds of cards (with images) all at once. Search
    // and the tier filter both run against the FULL list above, then this
    // just slices the already-filtered result - so searching for a driver
    // finds them regardless of which page they'd otherwise land on.
    const totalPages = Math.max(1, Math.ceil(filtered.length / DIR_PAGE_SIZE));
    dirCurrentPage = Math.max(0, Math.min(dirCurrentPage, totalPages - 1));
    const start = dirCurrentPage * DIR_PAGE_SIZE;
    const pageRows = filtered.slice(start, start + DIR_PAGE_SIZE);

    // ✅ ADDED: who's viewing, for the Peer Ratings buttons below - 'guest'
    // (not logged in) and a driver's own card both get no buttons at all,
    // rather than showing controls that would just 401/400 on click.
    const myId = window.IFWL_AUTH?.userId(window.IFWL_META) || 'guest';

    body.innerHTML = pageRows.map(r=>{
      const tier = findTier(r.tier || 'No Licence');
      const thumb = r.avatarMode === 'upload' && r.photoUploadUrl ? r.photoUploadUrl
                  : r.avatarMode === 'url' && r.avatarUrl ? r.avatarUrl
                  : '';
      const avatarCell = thumb
        ? `<div class="dir-card-avatar"><img src="${thumb}" alt=""></div>`
        : `<div class="dir-card-avatar-empty"></div>`;
      // The header image is what actually shows Gold customization off - it's
      // the full card background, not tucked away in a small thumbnail.
      const hasHeader = !!r.headerUploadUrl;
      const bgStyle = hasHeader ? ` style="background-image:url('${r.headerUploadUrl}')"` : '';
      const platformTag = r.platform === 'pc' ? '<span class="platform-tag plat-pc">PC</span>'
        : r.platform === 'console' ? '<span class="platform-tag plat-console">Console</span>'
        : r.platform === 'both' ? '<span class="platform-tag plat-both">PC + Console</span>'
        : '';
      // ✅ ADDED: coloured outline for genuine Patreon supporters
      const outlineClass = r.patreonOutlineTier ? ` dir-card-${r.patreonOutlineTier}` : '';
      // ✅ ADDED: up to 3 trophies the driver has chosen to show off, same
      // small icon style used on their own licence card.
      const trophyRow = (r.showcaseTrophies && r.showcaseTrophies.length)
        ? `<div class="dir-card-trophies">${r.showcaseTrophies.map(t => {
            const placeLabel = t.place === 'gold' ? '1st' : t.place === 'silver' ? '2nd' : '3rd';
            const title = `${placeLabel} - ${t.eventName}`.replace(/"/g, '&quot;');
            const visual = t.trophyImageUrl ? `<img src="${t.trophyImageUrl}" alt="">` : (window.trophySvg ? window.trophySvg(t.place, 'dir_' + t.trophyId) : '');
            return `<div class="lct-trophy" title="${title}">${visual}</div>`;
          }).join('')}</div>`
        : '';
      // ✅ ADDED: same seasonal overlay artwork as the main licence card,
      // applied to every Driver Directory card too - banned drivers get
      // the (reused April Fools) banned overlay instead, taking priority
      // over whatever seasonal event might currently be active.
      const activeSeasonal = window.getCardOverlaySync?.('directory', !!r.banActive);
      const seasonalOverlay = activeSeasonal
        ? `<img class="seasonal-overlay-img dir-card-seasonal${activeSeasonal.glow ? ' glow' : ''}" src="${activeSeasonal.imageUrl}" alt="">`
        : '';
      // ✅ ADDED: entrylist ACC name(s), shown under the driver's name and
      // above their licence number - so drivers can recognise/thank each
      // other by the name that actually shows up in the entrylist/results.
      // Only the first linked name is shown (a "+N" hint covers the rest);
      // most drivers only ever link one anyway.
      const accNameRow = (r.accDriverNames && r.accDriverNames.length)
        ? `<span class="dir-card-acc-name">${r.accDriverNames[0]}${r.accDriverNames.length > 1 ? ` <span class="dir-card-acc-extra">+${r.accDriverNames.length - 1}</span>` : ''}</span>`
        : '';
      // ✅ ADDED: Peer Ratings - thumbs up/down "good racer/bad racer".
      // Hidden entirely for a guest (not logged in) and on a driver's own
      // card (can't rate yourself, enforced server-side too). Once this
      // viewer has rated someone, both buttons lock disabled with only
      // their choice highlighted - myPeerRatingsGiven never changes after
      // that (no undo endpoint exists), so a re-render always reproduces
      // the same locked state without another network call.
      const myRating = myPeerRatingsGiven[r.discordId] || '';
      const rateRow = (myId !== 'guest' && r.discordId && r.discordId !== myId)
        ? `<div class="dir-card-rate" data-target="${r.discordId}">
            <button type="button" class="dir-rate-btn dir-rate-up${myRating === 'up' ? ' voted' : ''}" data-rate="up" ${myRating ? 'disabled' : ''} title="${myRating === 'up' ? 'You rated this driver a good racer' : 'Good racer'}">&#128077;</button>
            <button type="button" class="dir-rate-btn dir-rate-down${myRating === 'down' ? ' voted' : ''}" data-rate="down" ${myRating ? 'disabled' : ''} title="${myRating === 'down' ? 'You reported this driver as a bad racer' : 'Bad racer'}">&#128078;</button>
          </div>`
        : '';
      return `<div class="dir-card${hasHeader ? ' has-header' : ''}${outlineClass}"${bgStyle} data-open-driver="${socEsc(r.discordId || '')}" tabindex="0" role="button" aria-label="Open ${socEsc(r.name || 'driver')} profile">
        ${seasonalOverlay}
        ${platformTag}
        ${r.teamLogoUrl ? `<img class="dir-card-team-logo" src="${r.teamLogoUrl}" alt="${r.teamName||'Team'}" title="${r.teamName||''}">` : ''}
        ${rateRow}
        <div class="dir-card-overlay">
          ${avatarCell}
          <div class="dir-card-info">
            <strong>${r.name||'Unnamed'}</strong>
            ${accNameRow}
            <span class="mono">${r.licenceNumber||'-'}</span>
            <span class="tier-pill" style="background:${hexToRgba(tier.color,0.18)};color:${tier.color};border:1px solid ${hexToRgba(tier.color,0.4)}">${r.tier||'No Licence'}</span>
            ${trophyRow}
            ${socButtonsHtml(r.socials)}
          </div>
        </div>
      </div>`;
    }).join('');

    // Click (or Enter) on any driver card opens that driver's profile popup;
    // the rating buttons and social links keep their own behaviour.
    body.querySelectorAll('.dir-card[data-open-driver]').forEach(card => {
      const open = () => { const row = pageRows.find(x => (x.discordId || '') === card.dataset.openDriver); if(row) openDriverModal(row); };
      card.addEventListener('click', e => { if(e.target.closest('.dir-card-rate, .soc-btn, a, button')) return; open(); });
      card.addEventListener('keydown', e => { if((e.key === 'Enter' || e.key === ' ') && e.target === card){ e.preventDefault(); open(); } });
    });

    // ✅ ADDED: Peer Ratings click handling - event delegation would be
    // simpler, but body.innerHTML is fully replaced on every render anyway
    // (search/filter/page all call renderDirectory again), so wiring these
    // directly after each render is no more work and keeps the handler
    // right next to the markup it belongs to.
    body.querySelectorAll('[data-rate]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const wrap = btn.closest('.dir-card-rate');
        const targetId = wrap?.dataset.target;
        const rating = btn.dataset.rate;
        if(!targetId || myPeerRatingsGiven[targetId]) return; // already voted - ignore stray clicks
        const label = rating === 'up' ? 'a GOOD racer' : 'a BAD racer';
        const ok = confirm(`Report this driver as ${label}?\n\nThis can only be submitted once and can't be changed afterwards. Only IFWL Staff can see the outcome - the driver themselves is never told who rated them or how.`);
        if(!ok) return;
        wrap.querySelectorAll('.dir-rate-btn').forEach(b => b.disabled = true);
        try{
          await window.IFWL_PeerRatingAPI.submitPeerRating(targetId, rating);
          myPeerRatingsGiven[targetId] = rating;
          wrap.querySelectorAll('.dir-rate-btn').forEach(b => b.classList.toggle('voted', b.dataset.rate === rating));
        }catch(e){
          alert('Could not submit rating: ' + e.message);
          wrap.querySelectorAll('.dir-rate-btn').forEach(b => b.disabled = false);
        }
      });
    });

    if(pager){
      if(totalPages <= 1){ pager.innerHTML = ''; }
      else{
        pager.innerHTML = `
          <button class="btn ghost" id="dirPagerPrev" type="button" ${dirCurrentPage === 0 ? 'disabled' : ''}>&larr; Prev</button>
          <span class="field-hint">Page ${dirCurrentPage + 1} of ${totalPages} &middot; ${filtered.length} driver(s)</span>
          <button class="btn ghost" id="dirPagerNext" type="button" ${dirCurrentPage >= totalPages - 1 ? 'disabled' : ''}>Next &rarr;</button>
        `;
        q('dirPagerPrev')?.addEventListener('click', () => { dirCurrentPage--; renderDirectory(rows); });
        q('dirPagerNext')?.addEventListener('click', () => { dirCurrentPage++; renderDirectory(rows); });
      }
    }
  }

  /* ============================================================
     COMMENTATOR: DRIVERS TO WATCH
     Gated on window.IFWL_COMMENTATOR (role 1295114710085271644) or
     window.IFWL_OWNER (preview access from the Staff dropdown). Everything
     here reads from data that's already fully public - the pace/consistency
     standings (window.IFWLStats.computeLicenceServerStandings, the same
     engine the staff Qualification Grid uses), the public licenceRoster
     (for accDriverNames matching) and licenceDirectory (for avatar/team/
     trophy visuals) endpoints, and the same client-side
     IFWLStats.computeForDriver used for the Overall Score/Consistency/Race
     Risk stats shown on a driver's own licence card. No staff-only data is
     touched, which is why a Commentator-only role (with no other access)
     can see this page.
     ============================================================ */
  const CW_CATEGORIES = ['GT3 Beginner', 'GT3 Amateur', 'GT3 Pro'];
  let cwPlatform = 'pc-licence';
  let cwInited = false;
  let cwLoading = false;

  function cwDriverCardHtml(x){
    const r = x.rosterEntry, d = x.dirEntry || {};
    const tier = findTier(r.tier || 'No Licence');
    const thumb = d.avatarMode === 'upload' && d.photoUploadUrl ? d.photoUploadUrl
                : d.avatarMode === 'url' && d.avatarUrl ? d.avatarUrl
                : '';
    const avatarCell = thumb ? `<div class="dir-card-avatar"><img src="${thumb}" alt=""></div>` : `<div class="dir-card-avatar-empty"></div>`;
    const hasHeader = !!d.headerUploadUrl;
    const bgStyle = hasHeader ? ` style="background-image:url('${d.headerUploadUrl}')"` : '';
    const outlineClass = d.patreonOutlineTier ? ` dir-card-${d.patreonOutlineTier}` : '';
    const stats = x.stats;
    const pronunciationRow = r.namePronunciation ? `<div class="cw-card-pronunciation">🗣️ ${r.namePronunciation}</div>` : '';
    return `<div class="cw-card cw-card-click" data-do-lic="${r.licenceNumber || ''}" title="Click for full driver overview">
      <div class="dir-card${hasHeader ? ' has-header' : ''}${outlineClass}"${bgStyle}>
        ${d.teamLogoUrl ? `<img class="dir-card-team-logo" style="top:10px" src="${d.teamLogoUrl}" alt="${d.teamName||'Team'}" title="${d.teamName||''}">` : ''}
        <div class="dir-card-overlay">
          ${avatarCell}
          <div class="dir-card-info">
            <strong>${r.name || 'Unnamed'}</strong>
            <span class="mono">${r.licenceNumber || '-'}</span>
            <span class="tier-pill" style="background:${hexToRgba(tier.color,0.18)};color:${tier.color};border:1px solid ${hexToRgba(tier.color,0.4)}">${r.tier || 'No Licence'}</span>
          </div>
        </div>
      </div>
      ${pronunciationRow}
      <div class="cw-card-stats">
        <div><span>Overall Score</span><strong>${stats?.overallScore ?? '-'}</strong></div>
        <div><span>Consistency</span><strong>${stats?.consistencyAvg != null ? stats.consistencyAvg + '%' : '-'}</strong></div>
        <div><span>Race Risk</span><strong>${stats?.riskAvg != null ? stats.riskAvg + '%' : '-'}</strong></div>
      </div>
      <div class="cw-card-gap">Gap to best: ${x.s.avgGapPct != null ? '+' + (Math.round(x.s.avgGapPct*100)/100) + '%' : '-'} &middot; ${x.s.totalLaps} laps</div>
    </div>`;
  }

  function cwTierBlockHtml(sec){
    const emptyNote = '<div class="empty">Not enough qualified, linked drivers yet.</div>';
    return `<div class="cw-tier-block">
      <h4>${sec.tierName}</h4>
      <div class="cw-sub-head">Worth Watching</div>
      <div class="cw-grid">${sec.worthWatching.length ? sec.worthWatching.map(cwDriverCardHtml).join('') : emptyNote}</div>
      <div class="cw-sub-head">Got Potential</div>
      <div class="cw-grid">${sec.potential.length ? sec.potential.map(cwDriverCardHtml).join('') : emptyNote}</div>
    </div>`;
  }

  async function renderCommentatorWatch(){
    if(cwLoading) return;
    cwLoading = true;
    const wrap = q('commentatorWatchBody');
    if(!wrap){ cwLoading = false; return; }
    wrap.innerHTML = '<div class="empty">Loading&hellip; (this scans every driver\'s session history, give it a moment)</div>';

    let standings, roster, directory;
    try{
      standings = await window.cachedLicenceServerStandings({ minLaps: 15, serverId: cwPlatform, classStructure: await window.classStructureForServer(cwPlatform) , qualWindow: await window.fetchQualWindowMs()});
      [roster, directory] = await Promise.all([ fetchLicenceRosterPublic(), fetchDirectory() ]);
      // ✅ ADDED: name pronunciation guides - fetched from a separate,
      // properly access-controlled endpoint (not the public roster above),
      // so this data only ever reaches an actual Commentator/Owner session.
      // Merged in by licence number rather than requesting a change to the
      // public roster response.
      try{
        const guides = (await apiGet('commentatorNamePronunciations')).guides || [];
        const pronunciationByLicence = new Map(guides.map(g => [g.licenceNumber, g.namePronunciation]));
        roster.forEach(r => { if(pronunciationByLicence.has(r.licenceNumber)) r.namePronunciation = pronunciationByLicence.get(r.licenceNumber); });
      }catch(e){ console.warn('Could not load name pronunciation guides', e); }
    }catch(e){
      wrap.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`;
      cwLoading = false;
      return;
    }

    const byAccName = new Map();
    roster.forEach(r => (r.accDriverNames || []).forEach(n => byAccName.set(window.IFWLStats.driverNameKey(n), r)));
    const byLicenceNumber = new Map();
    directory.forEach(d => { if(d.licenceNumber && d.licenceNumber !== '-') byLicenceNumber.set(d.licenceNumber, d); });

    const qualified = standings.filter(s => s.qualified);

    const sections = [];
    for(const tierName of CW_CATEGORIES){
      const rows = qualified.filter(s => s.recommendedTier === tierName);
      const enriched = rows
        .map(s => {
          const rosterEntry = byAccName.get(window.IFWLStats.driverNameKey(s.driver));
          if(!rosterEntry) return null;
          const dirEntry = byLicenceNumber.get(rosterEntry.licenceNumber) || null;
          return { s, rosterEntry, dirEntry };
        })
        .filter(Boolean);

      const worthWatching = [...enriched]
        .sort((a, b) => (a.s.avgGapPct ?? Infinity) - (b.s.avgGapPct ?? Infinity))
        .slice(0, 3);
      const watchingKeys = new Set(worthWatching.map(x => x.s.driver));
      const potential = enriched
        .filter(x => !watchingKeys.has(x.s.driver))
        .sort((a, b) => (b.s.consistencyAvg ?? -Infinity) - (a.s.consistencyAvg ?? -Infinity))
        .slice(0, 3);

      // Overall Score/Consistency/Race Risk are computed live, client-side,
      // straight from public session files - same call your own licence
      // card uses (fetchPerformanceStats), just run for each shown driver.
      const withStats = async (list) => Promise.all(list.map(async (x) => {
        const stats = await fetchPerformanceStats({ accDriverNames: x.rosterEntry.accDriverNames }).catch(() => null);
        return { ...x, stats };
      }));

      const [ww, gp] = await Promise.all([withStats(worthWatching), withStats(potential)]);
      sections.push({ tierName, worthWatching: ww, potential: gp });
    }

    wrap.innerHTML = sections.map(cwTierBlockHtml).join('');
    cwLoading = false;
  }
  window.renderCommentatorWatch = renderCommentatorWatch;

  // ✅ ADDED: Driver Lookup - plain roster browse by Tier + Platform, no
  // pace/qualification requirement (unlike Worth Watching/Got Potential
  // above, which only ever show a handful of top performers). Reuses the
  // exact same cwDriverCardHtml card and the same roster/directory fetch,
  // just skips the standings computation and shows every match instead of
  // filtering down to 3 per category.
  let dlInited = false;
  let dlRoster = null, dlDirectory = null;

  async function renderDriverLookup(){
    const body = q('driverLookupBody');
    if(!body) return;
    const tier = q('dlTierSelect').value;
    const platform = q('dlPlatformSelect').value;
    if(!tier && !platform){ body.innerHTML = '<div class="empty">Pick a tier and/or platform above.</div>'; return; }

    body.innerHTML = '<div class="empty">Loading&hellip;</div>';
    try{
      if(!dlRoster || !dlDirectory){
        [dlRoster, dlDirectory] = await Promise.all([ fetchLicenceRosterPublic(), fetchDirectory() ]);
      }
    }catch(e){
      body.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`;
      return;
    }

    const byLicenceNumber = new Map();
    dlDirectory.forEach(d => { if(d.licenceNumber && d.licenceNumber !== '-') byLicenceNumber.set(d.licenceNumber, d); });

    const matches = dlRoster
      .filter(r => !tier || r.tier === tier)
      .filter(r => !platform || r.platform === platform)
      .map(r => ({ s: { avgGapPct: null, totalLaps: 0 }, rosterEntry: r, dirEntry: byLicenceNumber.get(r.licenceNumber) || null, stats: null }));

    body.innerHTML = matches.length
      ? `<div class="field-hint" style="margin-bottom:10px">${matches.length} driver(s) match.</div><div class="cw-grid">${matches.map(cwDriverCardHtml).join('')}</div>`
      : '<div class="empty">No drivers match that selection.</div>';
  }

  function initDriverLookupPanel(){
    if(dlInited || !q('driverLookupPanel') || !(window.IFWL_COMMENTATOR || window.IFWL_OWNER)) return;
    dlInited = true;
    populateTierSelect(q('dlTierSelect'), { includeBlank: true });
    q('dlTierSelect').addEventListener('change', renderDriverLookup);
    q('dlPlatformSelect').addEventListener('change', renderDriverLookup);
  }
  window.initDriverLookupPanel = initDriverLookupPanel;

  /* ============================================================
     COMMENTATOR: DRIVER OVERVIEW
     Search ANY licensed driver and get the full picture in one place:
     profile + pronunciation, pace/consistency/risk numbers, season record
     (wins, podiums, average finish) and a race-by-race table where each
     race opens that driver's highlight sheet and detailed profile - the
     same sheet Gold Patreons see. Everything is read from the same public
     session files and public roster/directory used above; nothing staff-
     only is touched.
     ============================================================ */
  let doInited = false, doBase = null, doReq = 0;
  const doRaceCache = new Map();
  const doEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function doLoadBase(){
    if(doBase) return doBase;
    const [roster, directory] = await Promise.all([ fetchLicenceRosterPublic(), fetchDirectory() ]);
    try{
      const guides = (await apiGet('commentatorNamePronunciations')).guides || [];
      const m = new Map(guides.map(g => [g.licenceNumber, g.namePronunciation]));
      roster.forEach(r => { if(m.has(r.licenceNumber)) r.namePronunciation = m.get(r.licenceNumber); });
    }catch(e){ console.warn('Could not load name pronunciation guides', e); }
    const byNum = new Map(); directory.forEach(d => { if(d.licenceNumber && d.licenceNumber !== '-') byNum.set(d.licenceNumber, d); });
    const byAcc = new Map(); roster.forEach(r => (r.accDriverNames || []).forEach(n => byAcc.set(window.IFWLStats.driverNameKey(n), r)));
    doBase = { roster, directory, byNum, byAcc };
    return doBase;
  }

  function doAvatarOf(d){
    return d && d.avatarMode === 'upload' && d.photoUploadUrl ? d.photoUploadUrl : d && d.avatarMode === 'url' && d.avatarUrl ? d.avatarUrl : '';
  }

  async function doEntryFor(row){
    const b = await doLoadBase();
    const re = b.byAcc.get(window.IFWLStats.driverNameKey(row.driver));
    const d = re ? b.byNum.get(re.licenceNumber) : null;
    if(!d) return {};
    const t = findTier(d.tier || 'No Licence');
    return { tier: d.tier || '', tierColor: (t && t.color) || '', licenceNumber: d.licenceNumber || '', teamName: d.teamName || '', avatarUrl: doAvatarOf(d) };
  }

  async function doSearchRender(){
    const box = q('doResults'); if(!box) return;
    const term = (q('doSearch').value || '').trim().toLowerCase();
    const plat = q('doPlatform').value;
    if(term.length < 2){ box.innerHTML = '<div class="empty">Type at least two letters of a driver\'s name, licence number or ACC name.</div>'; return; }
    box.innerHTML = '<div class="empty">Searching&hellip;</div>';
    let b; try{ b = await doLoadBase(); }catch(e){ box.innerHTML = `<div class="empty">Could not load: ${doEsc(e.message)}</div>`; return; }
    const hits = b.roster.filter(r => (!plat || r.platform === plat) && (
      String(r.name || '').toLowerCase().includes(term) ||
      String(r.licenceNumber || '').toLowerCase().includes(term) ||
      (r.accDriverNames || []).some(n => String(n).toLowerCase().includes(term))
    )).slice(0, 30);
    if(!hits.length){ box.innerHTML = '<div class="empty">No drivers match that search.</div>'; return; }
    box.innerHTML = '<div class="do-hits">' + hits.map(r => {
      const d = b.byNum.get(r.licenceNumber) || {}; const t = findTier(r.tier || 'No Licence'); const av = doAvatarOf(d);
      return `<button type="button" class="do-hit" data-do-lic="${doEsc(r.licenceNumber)}">
        ${av ? `<img src="${doEsc(av)}" alt="">` : '<span class="do-hit-av"></span>'}
        <span class="do-hit-main"><strong>${doEsc(r.name || 'Unnamed')}</strong><small>${doEsc(r.licenceNumber || '-')}${r.platform ? ' &middot; ' + (r.platform === 'console' ? 'Console' : r.platform === 'both' ? 'PC + Console' : 'PC') : ''}</small></span>
        <span class="tier-pill" style="background:${hexToRgba(t.color,0.18)};color:${t.color};border:1px solid ${hexToRgba(t.color,0.4)}">${doEsc(r.tier || 'No Licence')}</span>
      </button>`;
    }).join('') + '</div>';
  }

  function doStat(label, val, sub){
    return `<div class="do-stat"><span>${label}</span><strong>${val}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }

  async function doOpenOverview(licenceNumber){
    const detail = q('doDetail'); if(!detail) return;
    const mine = ++doReq;
    detail.innerHTML = '<div class="empty">Loading driver overview&hellip;</div>';
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    let b; try{ b = await doLoadBase(); }catch(e){ detail.innerHTML = `<div class="empty">Could not load: ${doEsc(e.message)}</div>`; return; }
    const r = b.roster.find(x => x.licenceNumber === licenceNumber);
    if(!r){ detail.innerHTML = '<div class="empty">Driver not found.</div>'; return; }
    const d = b.byNum.get(r.licenceNumber) || {};
    const tier = findTier(r.tier || 'No Licence');
    const av = doAvatarOf(d);
    const aliases = (r.accDriverNames || []).filter(Boolean);
    const keys = aliases.map(n => window.IFWLStats.driverNameKey(n));
    const platLabel = r.platform === 'console' ? 'Console' : r.platform === 'both' ? 'PC + Console' : r.platform === 'pc' ? 'PC' : '';
    const header = `<div class="do-head" style="border-color:${hexToRgba(tier.color,0.5)}">
      ${av ? `<img class="do-head-av" src="${doEsc(av)}" alt="">` : '<div class="do-head-av"></div>'}
      <div class="do-head-main">
        <h4>${doEsc(r.name || 'Unnamed')}</h4>
        <div class="do-head-meta"><span class="mono">${doEsc(r.licenceNumber || '-')}</span>
          <span class="tier-pill" style="background:${hexToRgba(tier.color,0.18)};color:${tier.color};border:1px solid ${hexToRgba(tier.color,0.4)}">${doEsc(r.tier || 'No Licence')}</span>
          ${platLabel ? `<span class="do-chip">${platLabel}</span>` : ''}
          ${d.teamName ? `<span class="do-chip">${doEsc(d.teamName)}</span>` : ''}</div>
        ${r.namePronunciation ? `<div class="cw-card-pronunciation" style="margin-top:8px">🗣️ Say it: <strong>${doEsc(r.namePronunciation)}</strong></div>` : ''}
        ${aliases.length ? `<div class="field-hint" style="margin-top:6px">Race name(s): ${aliases.map(doEsc).join(', ')}</div>` : ''}
      </div>
    </div>`;
    if(!aliases.length){
      detail.innerHTML = header + '<div class="empty">This driver has not linked a race (ACC) name yet, so there is no race data to show.</div>';
      return;
    }
    detail.innerHTML = header + '<div id="doBody"><div class="empty">Crunching their race history&hellip;</div></div>';
    const bodyEl = q('doBody');

    let stats = null;
    try{ stats = await fetchPerformanceStats(r); }catch(e){}
    if(mine !== doReq) return;

    let season = null;
    try{ season = await window.IFWL_SeasonAPI.fetchSeasonWindow(); }catch(e){}
    let races = [];
    if(season && season.startDate && season.endDate){
      try{
        races = await window.IFWLStats.listRaceResultsInRange(new Date(season.startDate + 'T00:00:00Z').getTime(), new Date(season.endDate + 'T23:59:59Z').getTime());
      }catch(e){ console.warn('Overview: race list failed', e); }
    }
    if(mine !== doReq) return;

    const found = [];
    let done = 0;
    const total = races.length;
    const queue = races.slice();
    const worker = async () => {
      while(queue.length){
        const meta = queue.shift();
        try{
          let det = doRaceCache.get(meta.file);
          if(!det){ det = await window.IFWLStats.loadRaceDetail(meta.file); doRaceCache.set(meta.file, det); }
          const idx = det.rows.findIndex(x => keys.includes(window.IFWLStats.driverNameKey(x.driver)));
          if(idx >= 0) found.push({ meta, det, idx });
        }catch(e){ console.warn('Overview: skipped race', meta.file, e.message); }
        done++;
        if(mine === doReq && total && q('doProg')) q('doProg').textContent = `Scanned ${done} of ${total} races…`;
      }
    };
    bodyEl.innerHTML = `<div class="empty"><span id="doProg">${total ? 'Scanning ' + total + ' races…' : 'Loading…'}</span></div>`;
    await Promise.all(Array.from({ length: Math.min(5, Math.max(1, total)) }, worker));
    if(mine !== doReq) return;
    found.sort((a, c) => (c.meta.tsMs || 0) - (a.meta.tsMs || 0));

    const pos = found.map(f => Number(f.det.rows[f.idx].racePos)).filter(Number.isFinite);
    const wins = pos.filter(p => p === 1).length, pods = pos.filter(p => p <= 3).length, top10 = pos.filter(p => p <= 10).length;
    const avgPos = pos.length ? (pos.reduce((a, c) => a + c, 0) / pos.length).toFixed(1) : '-';
    const laps = found.reduce((a, f) => a + Number(f.det.rows[f.idx].lapCount || 0), 0);
    const ms = window.IFWLStats.msTime;

    const tiles = [
      doStat('Overall score', stats && stats.overallScore != null ? stats.overallScore : '-'),
      doStat('Consistency', stats && stats.consistencyAvg != null ? stats.consistencyAvg + '%' : '-', 'average, all sessions'),
      doStat('Race risk', stats && stats.riskAvg != null ? stats.riskAvg + '%' : '-', 'lower is cleaner'),
      doStat('Gap to best', stats && stats.avgGapPct != null ? '+' + stats.avgGapPct + '%' : '-', 'average pace gap'),
      doStat('Sessions', stats ? stats.sessionCount : '-', stats && stats.trackCount ? stats.trackCount + ' tracks' : ''),
      doStat('Last active', stats && stats.mostRecentLabel ? doEsc(stats.mostRecentLabel) : '-')
    ].join('');
    const seasonLabel = season && season.label ? doEsc(season.label) : 'Season';
    const seasonTiles = [
      doStat('Races', found.length), doStat('Wins', wins), doStat('Podiums', pods), doStat('Top 10', top10),
      doStat('Avg finish', avgPos === '-' ? '-' : 'P' + avgPos), doStat('Laps', laps)
    ].join('');

    const rowsHtml = found.length ? found.map((f, i) => {
      const x = f.det.rows[f.idx];
      const cons = x.consistencyStats && Number.isFinite(Number(x.consistencyStats.consistency)) ? Math.round(x.consistencyStats.consistency) + '%' : '-';
      const risk = x.risk && Number.isFinite(Number(x.risk.risk)) ? Math.round(x.risk.risk) + '%' : '-';
      return `<tr>
        <td>${doEsc(f.meta.dateLabel)}</td><td>${doEsc(f.meta.track)}</td>
        <td><strong>P${x.racePos}</strong> <small>of ${f.det.rows.length}</small></td>
        <td>${doEsc(x.carName || '-')}</td><td class="mono">${x.bestLap ? ms(x.bestLap) : '-'}</td><td>${cons}</td><td>${risk}</td>
        <td><button class="btn purple do-sheet-btn" type="button" data-do-race="${i}">Sheet</button></td></tr>`;
    }).join('') : `<tr><td colspan="8"><div class="empty">${total ? 'No races found for this driver in the current season window.' : 'No season window is set, so there is no race list to scan.'}</div></td></tr>`;

    bodyEl.innerHTML = `
      <div class="do-sec">Performance (all sessions)</div><div class="do-stats">${tiles}</div>
      <div class="do-sec">${seasonLabel} record</div><div class="do-stats">${seasonTiles}</div>
      <div class="do-sec">Race by race</div>
      <div class="table-wrap"><table class="do-tbl"><thead><tr><th>Date</th><th>Track</th><th>Finish</th><th>Car</th><th>Best lap</th><th>Consistency</th><th>Risk</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
      <div id="doSheet"></div>`;

    let sheetReq = 0;
    const openSheet = async (i) => {
      const f = found[i]; if(!f) return;
      const box = q('doSheet'); const m2 = ++sheetReq;
      box.innerHTML = '<div class="empty">Building driver sheet&hellip;</div>';
      const row = f.det.rows[f.idx];
      const platform = f.meta.platform === 'pc' ? 'PC' : f.meta.platform === 'console' ? 'Console' : '';
      const ctx = { rows: f.det.rows, meta: { track: f.meta.track, serverName: f.meta.serverName, dateLabel: f.meta.dateLabel, platform, seasonLabel: season && season.label ? season.label : '' }, entryFor: doEntryFor };
      let out = null;
      if(window.IFWL_DriverSheet){ try{ out = await window.IFWL_DriverSheet.panel(ctx, row, { owner: !!window.IFWL_OWNER }); }catch(e){ console.warn('Driver sheet failed', e); } }
      if(m2 !== sheetReq) return;
      box.innerHTML = `<div class="do-sec">${doEsc(f.meta.track)} &middot; ${doEsc(f.meta.dateLabel)}</div>` + (out ? out.html : '') + window.IFWLStats.buildDriverProfileHtml(row);
      if(out) window.IFWL_DriverSheet.bind(box, out.model, { owner: !!window.IFWL_OWNER });
    };
    bodyEl.querySelectorAll('[data-do-race]').forEach(btn => btn.addEventListener('click', () => { openSheet(Number(btn.dataset.doRace)); q('doSheet').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    if(found.length) openSheet(0);
  }
  window.IFWL_openDriverOverview = doOpenOverview;

  function initDriverOverviewPanel(){
    if(doInited || !q('driverOverviewPanel') || !(window.IFWL_COMMENTATOR || window.IFWL_OWNER)) return;
    doInited = true;
    let t = null;
    q('doSearch').addEventListener('input', () => { clearTimeout(t); t = setTimeout(doSearchRender, 250); });
    q('doPlatform').addEventListener('change', doSearchRender);
    q('doResults').addEventListener('click', (e) => { const b = e.target.closest('[data-do-lic]'); if(b) doOpenOverview(b.dataset.doLic); });
    // cards in Drivers to Watch / Driver Lookup open the overview too
    ['commentatorWatchBody', 'driverLookupBody'].forEach(id => {
      const el = q(id); if(!el) return;
      el.addEventListener('click', (e) => { const c = e.target.closest('[data-do-lic]'); if(c && c.dataset.doLic && c.dataset.doLic !== '-') doOpenOverview(c.dataset.doLic); });
    });
    doSearchRender();
  }
  window.initDriverOverviewPanel = initDriverOverviewPanel;
  window.addEventListener('ifwl-auth-changed', initDriverOverviewPanel);

  document.querySelectorAll('#cwPlatformToggle [data-cw-platform]').forEach(btn => {
    btn.addEventListener('click', () => {
      if(btn.dataset.cwPlatform === cwPlatform) return;
      cwPlatform = btn.dataset.cwPlatform;
      document.querySelectorAll('#cwPlatformToggle [data-cw-platform]').forEach(b => b.classList.toggle('active', b === btn));
      renderCommentatorWatch();
    });
  });

  function initCommentatorPanel(){
    if(cwInited || !(window.IFWL_COMMENTATOR || window.IFWL_OWNER)) return;
    cwInited = true;
    renderCommentatorWatch();
  }
  window.initCommentatorPanel = initCommentatorPanel;
  window.addEventListener('ifwl-auth-changed', initCommentatorPanel);

  /* ============================================================
     IMAGE PERSISTENCE
     The previous version embedded each image as a base64 string
     inside the localStorage profile blob. A 5MB image becomes
     ~6.7MB of base64 text, which blows past localStorage's ~5-10MB
     per-origin quota - the write silently failed (caught and
     swallowed), so nothing was ever actually saved. Two real fixes:

     1. Real backend path: upload the raw file as multipart/form-data
        to a Storage-backed Cloud Function (see the rtLicenceImageUpload
        contract below) and save only the small returned URL string on
        the profile - never the image bytes themselves.
     2. Demo path: store the actual file Blob in IndexedDB (megabytes
        of quota, built for exactly this) instead of localStorage, and
        save only a small {ref:'idb', key} pointer on the demo profile.
        This makes the demo genuinely survive logout/login today.

     Either way, the profile document itself only ever holds a tiny
     string - never image bytes - so it can never hit a size limit
     again (also matters for the real backend: Firestore caps a single
     document at 1MB, so an embedded 5MB image could never have fit in
     a profile doc regardless of storage engine).
     ============================================================ */
  const IDB_NAME = 'ifwl_licence_demo_images', IDB_STORE = 'images';
  function idbOpen(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSetImage(key, blob){
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(blob, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGetImage(key){
    const db = await idbOpen();
    return new Promise((resolve,reject)=>{
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // Server contract for the real upload endpoint (mirrors the already-working
  // rtTeamImageUpload function - same Busboy pattern, same 5MB enforcement
  // server-side, same signed-URL response). rtLicenceImageUpload is its OWN
  // Cloud Function with its own URL, not an action inside rtGate:
  //   POST {UPLOAD_FN}?token=...   multipart/form-data
  //   fields: file (image/jpeg|png), kind ('photo'|'header')
  //   -> { ok:true, url:'<signed storage URL>' }
  // rtLicenceImageUpload is deployed as its own Cloud Run service with a
  // different URL pattern (*.run.app) than rtGate (*.cloudfunctions.net/rtGate),
  // so it can't be derived from FN the way other actions are - it's hardcoded here.
  const UPLOAD_FN = 'https://rtlicenceimageupload-703021152109.europe-west2.run.app';
  async function uploadLicenceImage(file, kind, extraParams){
    if(file.size > 5*1024*1024) throw new Error('That file is over 5MB. Please choose a smaller image.');
    if(USE_DEMO_FALLBACK){
      const meta = window.IFWL_META; const id = window.IFWL_AUTH.userId(meta);
      await idbSetImage(`${id}:${kind}`, file);
      return { url: URL.createObjectURL(file), ref: 'idb' };
    }
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let r;
    try{
      // kind is also sent as a query param (not just the form field) so the
      // backend can apply the right permission check (Gold vs staff-only)
      // before it has to fully parse the multipart body. extraParams (e.g.
      // teamId for race team logo/background uploads) gets appended the
      // same way, for checks that need more than just the kind to decide.
      const extra = extraParams ? '&' + new URLSearchParams(extraParams).toString() : '';
      r = await fetch(`${UPLOAD_FN}?token=${encodeURIComponent(token)}&kind=${encodeURIComponent(kind)}${extra}`, { method:'POST', body: form, signal: controller.signal });
    }catch(err){
      if(err.name === 'AbortError') throw new Error('Upload timed out after 30s - check the Cloud Function logs for rtLicenceImageUpload.');
      throw err;
    }finally{
      clearTimeout(timeout);
    }
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d?.error || 'Upload failed');
    // ✅ ADDED: also return the raw storage path - most callers only need
    // the display URL, but AC Rally proof submissions (acRallySubmitTime)
    // need the path too, so the backend can confirm the upload actually
    // belongs to the submitting driver before accepting it.
    return { url: d.url, path: d.path, ref: 'url' };
  }
  window.IFWL_UploadAPI = { uploadLicenceImage };

  // Object URLs created via URL.createObjectURL() only last for the current
  // page load - after logout/login (a fresh load), the demo profile only has
  // a {ref:'idb'} pointer, so the actual image Blob is pulled back out of
  // IndexedDB here and a fresh object URL is minted from it.
  async function resolveStoredImages(p){
    if(!p || !USE_DEMO_FALLBACK) return p;
    const meta = window.IFWL_META; const id = window.IFWL_AUTH.userId(meta);
    if(p.photoUploadRef === 'idb'){
      const blob = await idbGetImage(`${id}:photo`);
      if(blob) p.photoUploadUrl = URL.createObjectURL(blob);
    }
    if(p.headerUploadRef === 'idb'){
      const blob = await idbGetImage(`${id}:header`);
      if(blob) p.headerUploadUrl = URL.createObjectURL(blob);
    }
    return p;
  }

  async function renderMyRequestPanel(){
    const requests = await window.IFWL_RequestAPI.fetchMyRequests();
    const pending = requests.find(r => r.status === 'pending');
    const statusBlock = q('requestStatusBlock');
    const formBlock = q('requestFormBlock');

    if(pending){
      statusBlock.innerHTML = `<div class="request-card"><span class="request-status-pill pending">Pending review</span><strong style="display:block;margin-top:8px">${pending.requestedTier}</strong><p style="color:var(--text-muted);font-size:13px;margin:6px 0 0">${pending.reason}</p><div class="req-meta">Submitted ${new Date(pending.submittedAt).toLocaleString()}</div></div>`;
      formBlock.classList.add('hidden');
      return;
    }
    formBlock.classList.remove('hidden');

    const last = [...requests].reverse().find(r => r.status !== 'pending');
    statusBlock.innerHTML = last
      ? `<div class="request-card"><span class="request-status-pill ${last.status}">${last.status}</span><strong style="display:block;margin-top:8px">${last.requestedTier}</strong>${last.staffNote ? `<p style="color:var(--text-muted);font-size:13px;margin:6px 0 0">Staff note: ${last.staffNote}</p>` : ''}</div>`
      : '';

    // LMU add-on licences are never a main-licence request target and never
    // count as the driver's current main tier.
    const curTierObj = findTier(currentProfile?.tier || 'No Licence');
    const currentOrder = curTierObj && !curTierObj.lmuSubLicence ? (curTierObj.order ?? 0) : 0;
    const above = mainLadderTiers(currentTiers).filter(t => (t.order ?? 0) > currentOrder).sort((a,b)=>(a.order??0)-(b.order??0));
    populateTierSelect(q('requestTierSelect'));
    if(above.length){
      q('requestTierSelect').innerHTML = above.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    }
  }

  // A staff-driven tier change is surfaced as a dismissible banner, remembered
  // per-driver in localStorage so it only shows once. A ban is NOT dismissible
  // the same way - it re-appears on every visit for as long as it's active,
  // computed fresh from ban.endsAtMs vs now rather than a stored flag, so it
  // can never get stuck showing (or hidden) after the ban actually lapses.
  function seenKey(){ return 'IFWL_LICENCE_SEEN_TIER:' + window.IFWL_AUTH.userId(window.IFWL_META); }
  function renderStaffNotices(p){
    const wrap = q('staffNoticeBlock');
    const notices = [];

    const history = Array.isArray(p.tierHistory) ? p.tierHistory : [];
    const last = history[history.length - 1];
    const lastSeenTier = localStorage.getItem(seenKey());
    if(last && last.setBy === 'staff' && lastSeenTier !== p.tier && history.length > 1){
      const previousTier = history[history.length - 2]?.tier || 'No Licence';
      notices.push(`<div class="staff-notice tier" data-notice="tier"><p>IFWL Staff have changed your licence from <strong>${previousTier}</strong> to <strong>${p.tier}</strong>.${last.reason ? ` Reason: ${last.reason}` : ''}</p><button class="btn ghost" data-dismiss-tier>Got it</button></div>`);
    }

    if(p.ban && p.ban.endsAtMs && p.ban.endsAtMs > Date.now()){
      const daysLeft = Math.max(1, Math.ceil((p.ban.endsAtMs - Date.now()) / 86400000));
      notices.push(`<div class="staff-notice ban"><p>You are currently <strong>banned</strong> for ${p.ban.days} day(s), until ${new Date(p.ban.endsAtMs).toLocaleString()} (${daysLeft} day(s) remaining).${p.ban.reason ? ` Reason: ${p.ban.reason}` : ''}</p></div>`);
    }

    wrap.innerHTML = notices.join('');
    wrap.querySelector('[data-dismiss-tier]')?.addEventListener('click', () => {
      localStorage.setItem(seenKey(), p.tier);
      wrap.querySelector('[data-notice="tier"]')?.remove();
    });
  }

  // ✅ ADDED: same directory-card look used everywhere else, for whichever
  // drivers staff have uploaded a signup roster for on this event. Matched
  // by real name against accDriverNames, same lenient convention as
  // everywhere else - a name with no matching licence just falls back to a
  // plain card with no photo/team/tier, same as Race Results cards.
  function eventRosterCardHtml(entry, dirEntry){
    const tier = findTier(dirEntry?.tier || 'No Licence');
    const thumb = dirEntry?.avatarMode === 'upload' && dirEntry?.photoUploadUrl ? dirEntry.photoUploadUrl
                : dirEntry?.avatarMode === 'url' && dirEntry?.avatarUrl ? dirEntry.avatarUrl
                : '';
    const avatarCell = thumb ? `<div class="dir-card-avatar"><img src="${thumb}" alt=""></div>` : `<div class="dir-card-avatar-empty"></div>`;
    const hasHeader = !!dirEntry?.headerUploadUrl;
    const bgStyle = hasHeader ? ` style="background-image:url('${dirEntry.headerUploadUrl}')"` : '';
    const outlineClass = dirEntry?.patreonOutlineTier ? ` dir-card-${dirEntry.patreonOutlineTier}` : '';
    return `<div class="cw-card">
      <div class="dir-card${hasHeader ? ' has-header' : ''}${outlineClass}"${bgStyle}>
        ${dirEntry?.teamLogoUrl ? `<img class="dir-card-team-logo" style="top:10px" src="${dirEntry.teamLogoUrl}" alt="${dirEntry.teamName||'Team'}" title="${dirEntry.teamName||''}">` : ''}
        <div class="dir-card-overlay">
          ${avatarCell}
          <div class="dir-card-info">
            <strong>${entry.realName}</strong>
            <span class="mono">${dirEntry?.licenceNumber || '-'}</span>
            <span class="tier-pill" style="background:${hexToRgba(tier.color,0.18)};color:${tier.color};border:1px solid ${hexToRgba(tier.color,0.4)}">${dirEntry?.tier || 'No Licence'}</span>
          </div>
        </div>
      </div>
      <div class="cw-card-gap">${entry.carName || entry.carNumber ? [entry.carNumber ? `#${entry.carNumber}` : '', entry.carName].filter(Boolean).join(' ') : (entry.platform || '')}</div>
    </div>`;
  }

  async function buildEventRosterCardsHtml(roster){
    let roster_, directory;
    try{ [roster_, directory] = await Promise.all([ fetchLicenceRosterPublic(), fetchDirectory() ]); }
    catch(e){ console.warn('Could not load directory data for event roster cards', e); return '<div class="empty">Could not load driver details.</div>'; }

    const byAccName = new Map();
    roster_.forEach(r => (r.accDriverNames || []).forEach(n => byAccName.set(window.IFWLStats.driverNameKey(n), r)));
    const byLicenceNumber = new Map();
    directory.forEach(d => { if(d.licenceNumber && d.licenceNumber !== '-') byLicenceNumber.set(d.licenceNumber, d); });

    return `<div class="cw-grid">${roster.map(entry => {
      const rosterEntry = byAccName.get(window.IFWLStats.driverNameKey(entry.realName));
      const dirEntry = rosterEntry ? byLicenceNumber.get(rosterEntry.licenceNumber) : null;
      return eventRosterCardHtml(entry, dirEntry);
    }).join('')}</div>`;
  }

  // ✅ ADDED: Available Races tab switching - ACC Events is the default/
  // primary tab; AC Rally and RL 3v3 are opt-in tabs for drivers who are
  // already in one of those self-service knockout boards. A MutationObserver
  // on each board (rather than touching renderAcRallyDriverBoard()/the RL
  // equivalent directly) hides that tab whenever its board has no active
  // event, and bounces the user back to ACC Events if they were sitting on
  // a tab that just went empty - same spirit as the old #liveNowSection
  // :has() auto-hide, just extended to hide the tab button too.
  // Nothing is selected on open - the calendar above shows everything, and a
  // game button (or a calendar chip) fills in that game's race cards.
  let activeRacesTab = '';
  function switchRacesTab(tab, toggle){
    if(toggle && tab === activeRacesTab) tab = '';
    activeRacesTab = tab || '';
    document.querySelectorAll('.races-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.racesTab === activeRacesTab));
    document.querySelectorAll('.races-tab-panel').forEach(panel => panel.classList.toggle('hidden', panel.dataset.racesPanel !== activeRacesTab));
    const prompt = document.getElementById('racesPickPrompt');
    if(prompt) prompt.classList.toggle('hidden', !!activeRacesTab);
    if(typeof renderRacesCalendar === 'function') renderRacesCalendar();
  }
  document.querySelectorAll('.races-tab').forEach(btn => btn.addEventListener('click', () => switchRacesTab(btn.dataset.racesTab, true)));

  // ✅ ADDED: converts a "HH:MM" staff entered as UK LOCAL time into this
  // viewer's own local time, purely for display - mirrors the server's
  // ukLocalDateTimeToUtcMs (Europe/London, DST-aware via Intl) so the two
  // never disagree. Good enough for a schedule display, not exact-instant
  // math.
  function ifwlConvertUkTimeToViewerLocal(hhmm){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hhmm||'').trim())) return '';
    try{
      const now = new Date();
      const todayIso = now.toISOString().slice(0,10);
      const guessMs = Date.parse(`${todayIso}T${hhmm}:00Z`);
      const fmt = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/London', hour:'2-digit', minute:'2-digit', hour12:false });
      const londonParts = fmt.formatToParts(new Date(guessMs)).reduce((a,p)=>{a[p.type]=p.value;return a},{});
      const londonHhmm = `${londonParts.hour}:${londonParts.minute}`;
      const offsetMinutes = ((Number(hhmm.slice(0,2))*60+Number(hhmm.slice(3))) - (Number(londonHhmm.slice(0,2))*60+Number(londonHhmm.slice(3))));
      const correctedMs = guessMs + offsetMinutes*60000; // ✅ FIXED: sign was flipped - gave 2h out during BST (offsetMinutes is already wanted-minus-London)
      return new Date(correctedMs).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    }catch(e){ return hhmm; }
  }

  const AVAILABLE_RACES_WEEK_DAYS = [
    { key:'Mon', label:'M' }, { key:'Tue', label:'T' }, { key:'Wed', label:'W' }, { key:'Thu', label:'T' },
    { key:'Fri', label:'F' }, { key:'Sat', label:'S' }, { key:'Sun', label:'S' }
  ];
  const AVAILABLE_RACES_WEEKDAY_FROM_JSDAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  // ✅ ADDED: weekly M-T-W-T-F-S-S calendar strip - the day columns come
  // from each event's own dayOfWeek if staff set one; for a dated event
  // with no explicit dayOfWeek, falls back to the weekday its eventDateMs
  // actually falls on (viewer-local), so older events still slot in
  // somewhere sensible. Undated/no-day events show in a trailing
  // "Unscheduled" column rather than being silently dropped.
  // ---- Unified calendar: ALL events on ALL games (SimGrid events of every
  // game + the AC Rally / Rocket League knockout boards), Monday to Sunday.
  const RACES_GAME_META = {
    acc:          { label:'ACC',           tab:'acc',      body:'availableRacesBody' },
    lmu:          { label:'LMU',           tab:'lmu',      body:'lmuRacesBody' },
    acrally:      { label:'AC Rally',      tab:'acrally',  body:'acRallyRacesBody' },
    rocketleague: { label:'Rocket League', tab:'rl3v3',    body:'rlRacesBody' },
    raceroom:     { label:'RaceRoom',      tab:'raceroom', body:'raceroomRacesBody' }
  };
  const racesGameOf = (e) => RACES_GAME_META[e && e.game] ? e.game : 'acc';
  let racesCalSg = [], racesCalAcr = [], racesCalRl = [];

  function racesBoardCalItems(events, game){
    return (events || []).map(ev => {
      const openRound = (ev.rounds || []).find(r => r.status === 'open' && r.scheduledAtMs);
      const ms = Number(ev.scheduledAtMs || (openRound && openRound.scheduledAtMs) || 0);
      return { id:'board-' + game + '-' + (ev.id || ev.title), title: ev.title || (RACES_GAME_META[game].label + ' knockout'), game, board:true, eventDateMs: ms, dayOfWeek:'', raceTimeUK:'' };
    });
  }

  function renderRacesCalendar(){
    const host = q('racesCalendar');
    if(!host) return;
    const items = [].concat(racesCalSg || [], racesBoardCalItems(racesCalAcr, 'acrally'), racesBoardCalItems(racesCalRl, 'rocketleague'));
    const byDay = { Mon:[], Tue:[], Wed:[], Thu:[], Fri:[], Sat:[], Sun:[], other:[] };
    items.forEach(e => {
      // "Daily" (e.g. the always-on Licence Obtainment servers) goes under every day column.
      if(e.dayOfWeek === 'Daily'){ AVAILABLE_RACES_WEEK_DAYS.forEach(d => byDay[d.key].push(e)); return; }
      let day = e.dayOfWeek || '';
      if(!day && e.eventDateMs) day = AVAILABLE_RACES_WEEKDAY_FROM_JSDAY[new Date(e.eventDateMs).getDay()];
      (byDay[day] || byDay.other).push(e);
    });
    const timeOf = (e) => e.raceTimeUK ? ifwlConvertUkTimeToViewerLocal(e.raceTimeUK) : (e.board && e.eventDateMs ? new Date(e.eventDateMs).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '');
    const chip = (e) => {
      const g = racesGameOf(e);
      const dim = activeRacesTab && RACES_GAME_META[g].tab !== activeRacesTab;
      const t = timeOf(e);
      return `<button type="button" class="arw-chip${e.eligible===false ? ' arw-chip-locked' : ''}${dim ? ' arw-chip-dim' : ''}" data-arw-jump="${e.id}" data-arw-game="${g}"><span class="arw-chip-game g-${g}">${RACES_GAME_META[g].label}</span>${e.eligible===false ? '🔒 ' : ''}${e.title}${t ? `<span class="arw-chip-time">${t}</span>` : ''}</button>`;
    };
    const dayCol = (d) => `
      <div class="arw-day-col">
        <div class="arw-day-head">${d.label}<span class="arw-day-sub">${d.key}</span></div>
        <div class="arw-day-body">${byDay[d.key].length ? byDay[d.key].map(chip).join('') : '<span class="arw-day-empty">&ndash;</span>'}</div>
      </div>`;
    const wrap = document.createElement('div');
    wrap.className = 'arw-strip';
    wrap.innerHTML = AVAILABLE_RACES_WEEK_DAYS.map(dayCol).join('') + (byDay.other.length ? `
      <div class="arw-day-col arw-day-col-other">
        <div class="arw-day-head">&hellip;<span class="arw-day-sub">Unscheduled</span></div>
        <div class="arw-day-body">${byDay.other.map(chip).join('')}</div>
      </div>` : '');
    wrap.querySelectorAll('[data-arw-jump]').forEach(btn => btn.addEventListener('click', () => {
      const game = btn.dataset.arwGame || 'acc';
      const id = btn.dataset.arwJump;
      switchRacesTab(RACES_GAME_META[game].tab);
      const target = id.startsWith('board-')
        ? (document.getElementById(game === 'acrally' ? 'acRallyDriverBoard' : 'rlDriverBoard'))
        : document.querySelector(`[data-race-card="${id}"]`);
      if(!target) return;
      target.scrollIntoView({ behavior:'smooth', block:'center' });
      target.classList.add('rec-flash');
      setTimeout(() => target.classList.remove('rec-flash'), 1600);
    }));
    host.innerHTML = '';
    host.appendChild(wrap);
    updateRacesTabCounts();
  }

  function updateRacesTabCounts(){
    const counts = { acc:0, lmu:0, acrally:0, rocketleague:0, raceroom:0 };
    (racesCalSg || []).forEach(e => { counts[racesGameOf(e)]++; });
    counts.acrally += (racesCalAcr || []).length;
    counts.rocketleague += (racesCalRl || []).length;
    Object.keys(RACES_GAME_META).forEach(g => {
      const btn = document.querySelector(`.races-tab[data-races-tab="${RACES_GAME_META[g].tab}"]`);
      if(!btn) return;
      btn.innerHTML = `${RACES_GAME_META[g].label}<span class="races-tab-count">${counts[g]}</span>`;
    });
  }

  // ✅ ADDED: "Entrylist last updated" line on each Available Races card.
  // data/entrylist-status.json is written by the GitHub Actions results sync
  // (it reads cfg/entrylist.json's modified time over FTP, roughly every 2
  // hours). Shown only for series that map to one of those servers, and
  // quietly omitted if there's no reading for that server (e.g. PC hosts
  // that don't expose it yet).
  const ENTRYLIST_SERVER_BY_SERIES = {
    console_pro_am: 'console-proam', console_beginner: 'console-beginner', console_monday_funday: 'console-monday-funday',
    pc_pro: 'pc-pro', pc_pro_am: 'pc-proam', pc_beginner: 'pc-beginner', pc_monday_funday: 'pc-monday-funday'
  };
  // Which race server an event runs on: the event's Series if staff set one,
  // otherwise a best guess from its platform + title (so an event whose Series
  // was left on "Unassigned" still gets its entrylist line).
  function entrylistServerFor(e){
    if(ENTRYLIST_SERVER_BY_SERIES[e.series]) return ENTRYLIST_SERVER_BY_SERIES[e.series];
    const plat = e.platform === 'pc' ? 'pc' : e.platform === 'console' ? 'console' : '';
    if(!plat) return '';
    const t = String(e.title || '').toLowerCase();
    if(/monday|multiclass|funday/.test(t)) return plat + '-monday-funday';
    if(/beginner/.test(t)) return plat + '-beginner';
    if(/amateur|\bam\b|pro-am|pro am/.test(t)) return plat === 'pc' ? 'pc-proam' : 'console-proam';
    if(/\bpro\b/.test(t)) return plat === 'pc' ? 'pc-pro' : 'console-proam';
    return '';
  }
  let entrylistStatusPromise = null, entrylistStatusAt = 0;
  function loadEntrylistStatus(){
    if(entrylistStatusPromise && Date.now() - entrylistStatusAt < 5 * 60 * 1000) return entrylistStatusPromise;
    entrylistStatusAt = Date.now();
    entrylistStatusPromise = fetch('data/entrylist-status.json?_=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).catch(() => null);
    return entrylistStatusPromise;
  }
  function entrylistAgoText(ms){
    const m = Math.floor((Date.now() - ms) / 60000);
    if(m < -2) return ''; // in the future = a server clock / time zone mismatch, so don't claim a relative time
    if(m < 2) return 'just now';
    if(m < 60) return m + ' min ago';
    const hr = Math.floor(m / 60);
    if(hr < 48) return hr + 'h ago';
    return Math.floor(hr / 24) + ' days ago';
  }
  async function fillEntrylistRows(container){
    const rows = container.querySelectorAll('[data-entrylist-server]');
    if(!rows.length) return;
    const status = await loadEntrylistStatus();
    if(!status || !status.servers) return;
    rows.forEach(row => {
      const s = status.servers[row.dataset.entrylistServer];
      if(!s || !s.found) return;
      const ms = s.modifiedAt ? Date.parse(s.modifiedAt) : NaN;
      let html;
      if(s.isEmpty) html = 'Entrylist is empty right now' + (isNaN(ms) ? '' : ` (last changed ${new Date(ms).toLocaleString([], {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})})`);
      else if(!isNaN(ms)){
        const when = new Date(ms).toLocaleString([], {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
        const ago = entrylistAgoText(ms);
        html = `${s.unchangedForAtLeast ? 'Entrylist unchanged since' : 'Entrylist last updated:'} <strong>${when}</strong>${ago ? ` <span style="color:var(--text-muted)">(${ago})</span>` : ''}`;
      }
      else return;
      row.innerHTML = `<span class="rec-row-icon">📋</span>${html}`;
      row.title = 'Read from the race server. Refreshes about every 2 hours.';
      row.style.display = '';
    });
  }

  let availableRacesStaffAllMode = false;
  // ✅ CHANGED: bodyId lets this same function render into either the ACC
  // tab's #availableRacesBody (default - every existing caller is
  // unaffected) or the new LMU tab's #lmuRacesBody, so the LMU tab gets the
  // exact same card layout/weekly-strip/roster-toggle/Discord-unlock
  // behaviour for free instead of a parallel copy. The shared panel-head
  // (subtitle + staff toggle) sits above BOTH tabs, so it's only touched
  // when rendering the default ACC body - rendering the LMU tab leaves
  // whatever the ACC render last set there alone.
  function renderAvailableRaces(events, staffAll, bodyId){
    bodyId = bodyId || 'availableRacesBody';
    const isAccBody = bodyId === 'availableRacesBody';
    if(isAccBody) availableRacesStaffAllMode = !!staffAll;
    const body = q(bodyId);
    if(!body) return;
    if(isAccBody){
      const subtitle = q('availableRacesSubtitle');
      if(subtitle){
        subtitle.textContent = staffAll
          ? 'Staff view - every active race across every tier, including any past their normal 4h drop-off window'
          : 'Invite-only SimGrid events open to your current licence tier';
      }
      const toggle = q('availableRacesStaffToggle');
      if(toggle) toggle.textContent = staffAll ? 'Show only my tier' : 'Show ALL races (staff)';
    }
    if(!events.length){ body.innerHTML = `<div class="empty">${staffAll ? 'No active SimGrid events at all.' : (isAccBody ? 'No invite-only races available for your current tier yet.' : 'No events for this game yet.')}</div>`; return; }
    const placeholder = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="68"><rect width="120" height="68" fill="#1a2027"/></svg>');
    // ✅ CHANGED: cards now render into a responsive grid (.race-event-grid)
    // instead of one long stacked list, each card its own self-contained
    // <div> - the trailing roster-detail <div> per event moved OUTSIDE the
    // grid (own full-width row) so an expanded driver list never distorts
    // its neighbours' card heights.
    body.innerHTML = `<div class="race-event-grid">${events.map(e => {
      const platformLabel = e.platform === 'console' ? 'Console' : e.platform === 'pc' ? 'PC' : 'Console + PC';
      const dateStr = e.eventDateMs ? new Date(e.eventDateMs).toLocaleString([], {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : (e.eventDateLabel || '');
      const rosterCount = (e.roster || []).length;
      // ✅ ADDED: staff-all mode carries a `tiers` array and an `ended` flag
      // per event (never present in the normal driver-filtered response) -
      // shown here so staff can confirm at a glance which licence tier(s)
      // a race is actually gated to, and whether it's currently hidden from
      // drivers because its date has passed the usual 4h grace window.
      const tierBadges = staffAll && Array.isArray(e.tiers)
        ? `<div class="rec-row"><span class="rec-row-icon">🎫</span>${e.tiers.length ? e.tiers.join(', ') : '<em>No tiers set - not visible to anyone</em>'}</div>`
        : '';
      const endedBadge = staffAll && e.ended
        ? `<div class="rec-row warn"><span class="rec-row-icon">⚠️</span>Past its drop-off window - not currently shown to drivers</div>`
        : '';
      // ✅ ADDED: every driver now sees every active race regardless of
      // their own tier (so a Provisional driver can see a Pro-Am race
      // exists and knows what to aim for) - `eligible` says whether THIS
      // driver's current tier actually qualifies for it. Ineligible cards
      // still show image/date/rounds/hosted-by/day/time/notes, same as an
      // eligible-but-unassigned one, but the password never appears (and
      // never will, server-side) and the actions that only make sense once
      // you can actually join (View invite / Unlock Discord) are hidden -
      // they'd just 403 anyway.
      // ✅ CHANGED: notYetLicensed still means the same thing as before
      // (password/invite/Discord-unlock all stay hidden) - but it can now
      // be true for two different reasons, which need two different
      // messages/CTAs: tierLocked (the driver's main IFWL tier doesn't
      // qualify, the original meaning) vs needsLmuSub (an LMU-game event
      // whose required LMU sub-licence this driver doesn't hold yet, even
      // though their main tier is fine).
      const notYetLicensed = !staffAll && e.eligible === false;
      const needsLmuSub = notYetLicensed && e.needsLmuSubLicence === true;
      const tierLocked = notYetLicensed && !needsLmuSub;
      // ✅ ADDED: Day of week / Time (converted to this viewer's own
      // timezone) / Server hosted by - shown to every driver regardless of
      // eligibility or roster assignment, same as the image/date/rounds/
      // hosted-by. Only the password is gated (behind eligibility, and then
      // behind roster assignment if a roster exists), enforced server-side
      // in myAvailableRaces.
      const scheduleBits = [e.dayOfWeek, e.raceTimeUK ? ifwlConvertUkTimeToViewerLocal(e.raceTimeUK) : ''].filter(Boolean).join(' &middot; ');
      return `<div class="race-event-card${notYetLicensed ? ' race-event-card-locked' : ''}" data-race-card="${e.id}">
        <div class="rec-thumb-wrap">
          <img src="${e.imageUrl || e.simgridImageUrl || placeholder}" alt="">
          ${dateStr ? `<span class="rec-ribbon left live">📅 ${dateStr}</span>` : ''}
          <span class="rec-ribbon right">${platformLabel}</span>
        </div>
        <div class="rec-body">
          <div class="rec-title">${e.title}</div>
          <div class="rec-rows">
            ${tierBadges}
            ${endedBadge}
            ${scheduleBits ? `<div class="rec-row"><span class="rec-row-icon">🗓️</span>${scheduleBits}</div>` : ''}
            <div class="rec-row"><span class="rec-row-icon">🖥️</span>Hosted by ${e.hostedBy || 'GPortal'}</div>
            ${tierLocked
              ? `<div class="rec-row warn"><span class="rec-row-icon">🔒</span>Requires ${(e.tiers||[]).length ? (e.tiers.length === 1 ? `the ${e.tiers[0]} licence` : `one of: ${e.tiers.join(', ')}`) : 'a different licence tier'} - password hidden until you're licensed for it</div>`
              : needsLmuSub
                ? (() => {
                    // ✅ ADDED: the pre-existing LMU sub-licence system has
                    // always required a driver to be off "No Licence" on
                    // their MAIN tier before touching any sub-licence at
                    // all (same gate the driver-facing LMU tab already
                    // shows) - without this check here, a driver still on
                    // No Licence would see a "Get & unlock" button that
                    // silently does nothing (the server resets
                    // lmuSubLicences to empty for them rather than erroring).
                    if (e.lmuMainTierOk === false) {
                      return `<div class="rec-row warn"><span class="rec-row-icon">🔒</span>LMU sub-licences unlock once you're off "No Licence" on your main IFWL tier</div>`;
                    }
                    const names = (e.lmuRequiredTiers || []).map(t => t.name).filter(Boolean);
                    const allGated = (e.lmuRequiredTiers || []).length > 0 && (e.lmuRequiredTiers || []).every(t => t.gated);
                    return `<div class="rec-row warn"><span class="rec-row-icon">🔒</span>Requires ${names.length > 1 ? 'any of: ' + names.join(', ') : `the <strong>${names[0] || 'required'}</strong> LMU sub-licence`} - ${allGated ? 'staff approval needed' : 'one click to get it'}</div>`;
                  })()
                : (e.password ? `<div class="rec-row"><span class="rec-row-icon">🔒</span>Password: <code>${e.password}</code></div>` : '')}
            ${e.notes ? `<div class="rec-row"><span class="rec-row-icon">📝</span>${e.notes}</div>` : ''}
            ${entrylistServerFor(e) ? `<div class="rec-row" data-entrylist-server="${entrylistServerFor(e)}" style="display:none"></div>` : ''}
          </div>
          <div class="rec-actions">
            ${rosterCount ? `<button class="btn ghost" data-toggle-roster="${e.id}" style="font-size:11px">Drivers signed up (${rosterCount}) &darr;</button>` : ''}
            ${(needsLmuSub && e.lmuMainTierOk !== false) ? (() => {
              const missing = (e.lmuRequiredTiers || []).filter(t => !t.held);
              const openOnes = missing.filter(t => !t.gated);
              const gatedOnes = missing.filter(t => t.gated);
              // One instant-grant button per open (non-gated) sub-licence -
              // each is its own independent one-click action. Gated ones
              // collapse into a single "Request access" button (however
              // many there are) that just sends the driver to the richer
              // request flow on the dedicated driver-facing LMU tab, rather
              // than one redundant button per gated option.
              return openOnes.map(t => `<button class="btn purple" data-lmu-instant-request="${e.id}" data-lmu-tier="${t.id}" style="font-size:11px">Get ${t.name} &amp; unlock</button>`).join('')
                + (gatedOnes.length ? `<button class="btn purple" data-lmu-goto-request="${e.id}" style="font-size:11px">Request ${gatedOnes.map(t => t.name).join(' / ')} access</button>` : '');
            })() : ''}
            ${(!staffAll && !notYetLicensed && e.discordRoleId) ? (
              e.discordRoleUnlocked
                ? `<span class="btn ghost" style="font-size:11px;opacity:.8;pointer-events:none">🔓 ${e.discordRoleLabel || 'Discord area'} unlocked</span>`
                : `<button class="btn teal" data-unlock-discord="${e.id}" style="font-size:11px">Unlock ${e.discordRoleLabel ? `"${e.discordRoleLabel}"` : 'this area'} on Discord</button>`
            ) : ''}
            ${(e.hasBriefing && !notYetLicensed) ? `<button class="btn teal" data-view-briefing="${e.id}" style="font-size:11px">📋 Raceday briefing</button>` : ''}
            ${(e.simgridLink && !notYetLicensed) ? `<a class="btn purple" href="${e.simgridLink}" target="_blank" rel="noopener">View invite</a>` : ''}
          </div>
        </div>
      </div>`;
    }).join('')}</div>${events.map(e => (e.roster||[]).length ? `<div class="hidden" id="eventRoster_${e.id}" style="margin:10px 0 16px"></div>` : '').join('')}`;

    // ✅ ADDED: M-T-W-T-F-S-S weekly overview strip above the card grid -
    // clicking a race under its day scrolls straight to its full card
    // below. Skipped in staff-all mode (that view is an audit list, not a
    // driver-facing weekly planner).

    fillEntrylistRows(body);
    body.querySelectorAll('[data-toggle-roster]').forEach(btn => {
      const eventId = btn.dataset.toggleRoster;
      const container = q(`eventRoster_${eventId}`);
      let loaded = false;
      btn.addEventListener('click', async () => {
        const isHidden = container.classList.contains('hidden');
        if(isHidden){
          container.classList.remove('hidden');
          btn.textContent = btn.textContent.replace('\u2193', '\u2191');
          if(!loaded){
            loaded = true;
            const event = events.find(e => e.id === eventId);
            container.innerHTML = '<div class="empty">Loading drivers&hellip;</div>';
            container.innerHTML = await buildEventRosterCardsHtml(event.roster || []);
          }
        } else {
          container.classList.add('hidden');
          btn.textContent = btn.textContent.replace('\u2191', '\u2193');
        }
      });
    });

    // \u2705 ADDED: "Unlock this area on IFWL Discord" - see the backend
    // comment above unlockEventDiscordRole for the full server-side
    // eligibility re-check. Idempotent, so no harm if clicked more than
    // once; on success the button becomes a plain "unlocked" indicator
    // rather than re-fetching the whole list just for this one field.
    body.querySelectorAll('[data-view-briefing]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ev = events.find(x => x.id === btn.dataset.viewBriefing);
        window.openRacedayBriefing(btn.dataset.viewBriefing, ev && ev.title);
      });
    });
    body.querySelectorAll('[data-unlock-discord]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const eventId = btn.dataset.unlockDiscord;
        const event = events.find(ev => ev.id === eventId);
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Unlocking\u2026';
        try{
          await window.IFWL_SimgridAPI.unlockEventDiscordRole(eventId);
          btn.outerHTML = `<span class="btn ghost" style="font-size:11px;opacity:.8;pointer-events:none">\ud83d\udd13 ${event?.discordRoleLabel || 'Discord area'} unlocked - check Discord in a moment</span>`;
        }catch(e){
          alert('Could not unlock this on Discord: ' + e.message);
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    });

    // ✅ ADDED: LMU sub-licence request CTAs on a locked LMU card (see
    // needsLmuSub above). Two paths, matching the existing driver-facing
    // LMU tab's own open-vs-gated split exactly:
    // - Non-gated sub-licence: one click adds it to lmuSubLicences via the
    //   normal saveMyProfile path (which already syncs the Discord role -
    //   see syncSubLicenceDiscordRoles server-side) and re-renders both
    //   Available Races tabs, so the card unlocks immediately in place.
    // - Staff-approval-gated sub-licence: there's already a richer
    //   request flow (reason textarea, pending/declined status) on the
    //   dedicated driver-facing LMU tab - rather than duplicate it here,
    //   this just takes the driver straight there.
    body.querySelectorAll('[data-lmu-goto-request]').forEach(btn => {
      btn.addEventListener('click', () => switchView('lmu'));
    });
    body.querySelectorAll('[data-lmu-instant-request]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tierId = btn.dataset.lmuTier;
        if(!tierId) return;
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Requesting…';
        try{
          const mine = new Set(currentProfile?.lmuSubLicences || []);
          mine.add(tierId);
          currentProfile = await saveMyProfile({ lmuSubLicences: [...mine] });
          await reloadAvailableRacesBothTabs();
        }catch(e){
          alert('Could not get that sub-licence: ' + e.message);
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    });
  }

  // ✅ ADDED: re-fetches and re-renders both Available Races tabs (ACC +
  // LMU) together - used after an instant LMU sub-licence self-select so
  // the newly-unlocked card updates immediately without a full page
  // reload. See fetchAvailableRaces/renderAvailableRaces and the split-by-
  // game logic at the main init call site below.
  // Splits one fetched list by game, renders each game's cards into its own
  // panel, and refreshes the unified calendar + button counts.
  function renderAllAvailableRaces(events, staffAll){
    racesCalSg = events;
    Object.keys(RACES_GAME_META).forEach(g => {
      renderAvailableRaces(events.filter(e => racesGameOf(e) === g), staffAll, RACES_GAME_META[g].body);
    });
    renderRacesCalendar();
  }
  async function reloadAvailableRacesBothTabs(){
    const events = await fetchAvailableRaces(availableRacesStaffAllMode);
    renderAllAvailableRaces(events, availableRacesStaffAllMode);
  }

  let raceResultsCache = [];
  async function renderRaceResultsPanel(){
    const body = q('raceResultsBody');
    const label = q('raceResultsSeasonLabel');
    if(!body) return;

    const season = await window.IFWL_SeasonAPI.fetchSeasonWindow();
    if(!season.startDate || !season.endDate){
      label.textContent = 'No season window set yet - ask staff to configure one under Staff \u2192 Season Window.';
      body.innerHTML = '<div class="empty">Nothing to show until a season window is configured.</div>';
      return;
    }
    label.textContent = `${season.label || 'Current season'}: ${season.startDate} to ${season.endDate}`;

    const startMs = new Date(season.startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(season.endDate + 'T23:59:59Z').getTime();

    body.innerHTML = '<div class="empty">Loading races&hellip;</div>';
    try{
      raceResultsCache = await window.IFWLStats.listRaceResultsInRange(startMs, endMs);
    }catch(e){
      body.innerHTML = `<div class="empty">Could not load races: ${e.message}</div>`;
      return;
    }
    renderRaceResultsList();
  }

  function renderRaceResultsList(){
    const body = q('raceResultsBody');
    const search = (q('raceResultsSearch').value || '').toLowerCase();
    const platformFilter = q('raceResultsPlatformFilter').value;
    const filtered = raceResultsCache.filter(r => {
      const matchesSearch = !search || r.track.toLowerCase().includes(search) || r.serverName.toLowerCase().includes(search);
      const matchesPlatform = !platformFilter || r.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    });
    if(!filtered.length){ body.innerHTML = '<div class="empty">No races in this season window match.</div>'; return; }
    body.innerHTML = filtered.map((r, i) => {
      const platformTag = r.platform === 'pc' ? '<span class="platform-tag plat-pc" style="position:static;display:inline-block">PC</span>'
        : r.platform === 'console' ? '<span class="platform-tag plat-console" style="position:static;display:inline-block">Console</span>'
        : '';
      return `<div class="claim-row">
        <div>
          <div class="claim-name">${r.track} ${platformTag}</div>
          <div class="claim-meta">${r.serverName} &middot; ${r.dateLabel} &middot; ${r.entrantCount} driver(s)</div>
        </div>
        <button class="btn purple" data-view-race="${i}">View Results</button>
      </div>`;
    }).join('');

    body.querySelectorAll('[data-view-race]').forEach(btn => btn.addEventListener('click', () => {
      loadRaceDetailView(filtered[Number(btn.dataset.viewRace)]);
    }));
  }

  let raceChartsRows = [];
  // ✅ ADDED: Driver Directory-styled cards for a race's results - same
  // card look used in the Directory and Drivers to Watch, alongside the
  // existing results table (not replacing it). Matched via accDriverNames,
  // same lenient convention used everywhere else - a driver in the raw
  // session data with no matching licence just falls back to a plain card
  // with their name and no photo/team/tier.
  function raceResultCardHtml(r, dirEntry){
    const tier = findTier(dirEntry?.tier || 'No Licence');
    const thumb = dirEntry?.avatarMode === 'upload' && dirEntry?.photoUploadUrl ? dirEntry.photoUploadUrl
                : dirEntry?.avatarMode === 'url' && dirEntry?.avatarUrl ? dirEntry.avatarUrl
                : '';
    const avatarCell = thumb ? `<div class="dir-card-avatar"><img src="${thumb}" alt=""></div>` : `<div class="dir-card-avatar-empty"></div>`;
    const hasHeader = !!dirEntry?.headerUploadUrl;
    const bgStyle = hasHeader ? ` style="background-image:url('${dirEntry.headerUploadUrl}')"` : '';
    const outlineClass = dirEntry?.patreonOutlineTier ? ` dir-card-${dirEntry.patreonOutlineTier}` : '';
    const posClass = r.racePos === 1 ? 'race-pos-gold' : r.racePos === 2 ? 'race-pos-silver' : r.racePos === 3 ? 'race-pos-bronze' : '';
    return `<div class="cw-card">
      <div class="dir-card${hasHeader ? ' has-header' : ''}${outlineClass}"${bgStyle}>
        <div class="race-pos-badge ${posClass}">P${r.racePos}</div>
        ${dirEntry?.teamLogoUrl ? `<img class="dir-card-team-logo" style="top:10px" src="${dirEntry.teamLogoUrl}" alt="${dirEntry.teamName||'Team'}" title="${dirEntry.teamName||''}">` : ''}
        <div class="dir-card-overlay">
          ${avatarCell}
          <div class="dir-card-info">
            <strong>${r.driver}</strong>
            <span class="mono">${dirEntry?.licenceNumber || '-'}</span>
            <span class="tier-pill" style="background:${hexToRgba(tier.color,0.18)};color:${tier.color};border:1px solid ${hexToRgba(tier.color,0.4)}">${dirEntry?.tier || 'No Licence'}</span>
          </div>
        </div>
      </div>
      <div class="cw-card-gap">${r.carName} &middot; Best ${window.IFWLStats.msTime(r.bestLap)} &middot; ${r.lapCount} laps</div>
    </div>`;
  }

  async function buildRaceResultCardsHtml(rows){
    let roster = [], directory = [];
    try{ [roster, directory] = await Promise.all([ fetchLicenceRosterPublic(), fetchDirectory() ]); }
    catch(e){ console.warn('Could not load directory data for race result cards', e); }

    const byAccName = new Map();
    roster.forEach(r => (r.accDriverNames || []).forEach(n => byAccName.set(window.IFWLStats.driverNameKey(n), r)));
    const byLicenceNumber = new Map();
    directory.forEach(d => { if(d.licenceNumber && d.licenceNumber !== '-') byLicenceNumber.set(d.licenceNumber, d); });

    return `<div class="cw-grid">${rows.map(r => {
      const rosterEntry = byAccName.get(window.IFWLStats.driverNameKey(r.driver));
      const dirEntry = rosterEntry ? byLicenceNumber.get(rosterEntry.licenceNumber) : null;
      return raceResultCardHtml(r, dirEntry);
    }).join('')}</div>`;
  }

  async function loadRaceDetailView(meta){
    const wrap = q('raceDetailWrap');
    wrap.classList.remove('hidden');
    wrap.innerHTML = '<div class="empty">Loading race detail&hellip;</div>';
    wrap.scrollIntoView({behavior:'smooth', block:'start'});

    let detail;
    try{
      detail = await window.IFWLStats.loadRaceDetail(meta.file);
    }catch(e){
      wrap.innerHTML = `<div class="empty">Could not load this race: ${e.message}</div>`;
      return;
    }
    raceChartsRows = detail.rows;
    const isGoldOrStaff = window.IFWL_GOLD || window.IFWL_STAFF;

    const rowsHtml = detail.rows.map(r => `<tr>
      <td>${r.racePos}</td>
      <td class="driver">${r.driver}${currentProfile ? ` <button class="btn ghost sp-add-name-btn" data-driver-name="${r.driver.replace(/"/g,'&quot;')}" style="font-size:10px;padding:2px 7px;margin-left:6px">+ Add to my licence</button>` : ''}</td>
      <td>${r.carName}</td>
      <td>${window.IFWLStats.msTime(r.bestLap)}</td>
      <td>${window.IFWLStats.msTime(r.totalTime)}</td>
      <td>${r.lapCount}</td>
      <td class="race-detailed-col"><span class="consistency ${window.IFWLStats.consistencyClass(r.consistencyStats?.consistency)}">${window.IFWLStats.consistencyText(r.consistencyStats?.consistency, r.consistencyStats?.count)}</span><span class="consistency-note">${window.IFWLStats.consistencyNoteText(r.consistencyStats)}</span></td>
      <td class="race-detailed-col"><span class="risk ${window.IFWLStats.riskClass(r.risk?.risk)}">${Number.isFinite(r.risk?.risk) ? r.risk.risk.toFixed(0)+'%' : '-'}</span><span class="risk-note">${r.risk?.label || '-'}</span></td>
    </tr>`).join('');

    const upsell = isGoldOrStaff ? '' : `<div class="race-bronze-upsell">
      <strong>✨ Want the full breakdown?</strong>
      <span>Gold Patreon unlocks Consistency, Race Risk, field-wide charts and a per-driver profile for every race - not just the finishing order above.</span>
      <a href="https://www.patreon.com/c/IFWL" target="_blank" rel="noopener">Upgrade on Patreon ↗</a>
    </div>`;

    const goldSection = !isGoldOrStaff ? '' : `
      <div class="race-risk-info"><strong>Race Risk %</strong> is a guide-only data score. It highlights unstable race patterns using invalid laps, lap-time spikes, lap spread, penalties, missed pit status and lost laps compared with the race leader - it does not prove contact, blame or stewarding fault.</div>
      <div class="driver-focus">
        <div>
          <label for="raceDetailDriverSelect">Driver detail</label>
          <select id="raceDetailDriverSelect"><option value="">Select a driver from this race...</option>
            ${detail.rows.map((r,i) => `<option value="${i}">${r.racePos}. ${r.driver} — ${r.carName}</option>`).join('')}
          </select>
        </div>
        ${window.IFWL_OWNER ? '<div style="align-self:flex-end"><button class="btn purple" id="raceRandomSheetBtn" type="button">&#127922; Generate random player stats sheet</button></div>' : ''}
      </div>
      <div id="raceDetailDriverProfile" class="driver-profile"><div class="empty">Select a driver to see their full driver sheet and race profile.</div></div>
      <div id="raceDetailCharts" class="race-charts">${window.IFWLStats.buildRaceChartsHtml(detail.rows, null)}</div>`;

    wrap.innerHTML = `
      <button class="btn ghost" id="backToRaceListBtn" type="button" style="margin:16px 18px">&larr; Back to races</button>
      <div class="titlebar" style="margin:0 18px 12px;background:none;border:none;padding:0"><h2 style="font-size:20px">${meta.track}</h2></div>
      ${upsell}
      ${goldSection}
      <div class="race-view-toggle">
        <button class="bop-platform-btn active" id="raceViewTableBtn" type="button">Table View</button>
        <button class="bop-platform-btn" id="raceViewCardsBtn" type="button">Card View</button>
      </div>
      <div class="table-wrap" id="raceResultsTableWrap">
        <table class="results-table">
          <thead><tr><th>Pos.</th><th>Driver</th><th>Car</th><th>Best Lap</th><th>Total Time</th><th>Laps</th><th class="race-detailed-col">Consistency</th><th class="race-detailed-col">Race Risk %</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div id="raceResultsCardsWrap" class="hidden" style="padding:0 18px"><div class="empty">Loading cards&hellip;</div></div>
    `;

    let cardsLoaded = false;
    q('raceViewTableBtn').addEventListener('click', () => {
      q('raceViewTableBtn').classList.add('active'); q('raceViewCardsBtn').classList.remove('active');
      q('raceResultsTableWrap').classList.remove('hidden'); q('raceResultsCardsWrap').classList.add('hidden');
    });
    q('raceViewCardsBtn').addEventListener('click', async () => {
      q('raceViewCardsBtn').classList.add('active'); q('raceViewTableBtn').classList.remove('active');
      q('raceResultsTableWrap').classList.add('hidden'); q('raceResultsCardsWrap').classList.remove('hidden');
      if(!cardsLoaded){
        cardsLoaded = true;
        q('raceResultsCardsWrap').innerHTML = await buildRaceResultCardsHtml(detail.rows);
      }
    });

    q('backToRaceListBtn').addEventListener('click', () => {
      wrap.classList.add('hidden');
      wrap.innerHTML = '';
      q('raceResultsBody').scrollIntoView({behavior:'smooth', block:'start'});
    });

    // ✅ ADDED: lets any logged-in driver claim a name straight from a race
    // result, regardless of Patreon tier - no need to go find and retype it
    // on My Licence. Reuses the exact same accDriverNames field, so Driver
    // Name Audit picks this up automatically with no extra work.
    wrap.querySelectorAll('.sp-add-name-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.driverName;
        const current = currentProfile?.accDriverNames || [];
        if(current.some(n => n.toLowerCase() === name.toLowerCase())){
          btn.textContent = 'Already added';
          return;
        }
        if(current.length >= 5){
          btn.textContent = 'Limit reached (5)';
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Adding...';
        try{
          const updated = [...current, name];
          await saveMyProfile({ accDriverNames: updated });
          if(currentProfile) currentProfile.accDriverNames = updated;
          btn.textContent = '✓ Added';
        }catch(e){
          btn.disabled = false;
          btn.textContent = 'Failed - retry';
        }
      });
    });

    if(isGoldOrStaff){
      // ✅ ADDED: Driver Sheet - the highlight card (see window.IFWL_DriverSheet, last script block)
      // is now the first thing Gold/staff see for any driver, with the original profile numbers
      // and charts still shown underneath. Owner also gets a random-pick button + Discord post.
      let dsLookup = null, dsReq = 0;
      async function dsEntryFor(r){
        if(!dsLookup){
          let roster = [], directory = [];
          try{ [roster, directory] = await Promise.all([ fetchLicenceRosterPublic(), fetchDirectory() ]); }catch(e){ console.warn('Driver sheet: directory unavailable', e); }
          const byAcc = new Map(); roster.forEach(x => (x.accDriverNames || []).forEach(n => byAcc.set(window.IFWLStats.driverNameKey(n), x)));
          const byNum = new Map(); directory.forEach(d => { if(d.licenceNumber && d.licenceNumber !== '-') byNum.set(d.licenceNumber, d); });
          dsLookup = { byAcc, byNum };
        }
        const re = dsLookup.byAcc.get(window.IFWLStats.driverNameKey(r.driver));
        const d = re ? dsLookup.byNum.get(re.licenceNumber) : null;
        if(!d) return {};
        const t = findTier(d.tier || 'No Licence');
        const avatarUrl = d.avatarMode === 'upload' && d.photoUploadUrl ? d.photoUploadUrl : d.avatarMode === 'url' && d.avatarUrl ? d.avatarUrl : '';
        return { tier: d.tier || '', tierColor: (t && t.color) || '', licenceNumber: d.licenceNumber || '', teamName: d.teamName || '', avatarUrl };
      }
      const seasonText = (q('raceResultsSeasonLabel')?.textContent || '').split(':')[0].trim();
      const dsCtx = {
        rows: raceChartsRows,
        meta: { track: meta.track, serverName: meta.serverName, dateLabel: meta.dateLabel, platform: meta.platform === 'pc' ? 'PC' : meta.platform === 'console' ? 'Console' : '', seasonLabel: /^no season/i.test(seasonText) ? '' : seasonText },
        entryFor: dsEntryFor
      };
      const dsSelect = q('raceDetailDriverSelect');
      dsSelect.addEventListener('change', async (e) => {
        const idx = e.target.value === '' ? null : Number(e.target.value);
        const box = q('raceDetailDriverProfile');
        q('raceDetailCharts').innerHTML = window.IFWLStats.buildRaceChartsHtml(raceChartsRows, idx);
        if(idx === null){ box.innerHTML = window.IFWLStats.buildDriverProfileHtml(null); return; }
        const row = raceChartsRows[idx];
        const mine = ++dsReq;
        if(!window.IFWL_DriverSheet){ box.innerHTML = window.IFWLStats.buildDriverProfileHtml(row); return; }
        box.innerHTML = '<div class="empty">Building driver sheet&hellip;</div>';
        let out = null;
        try{ out = await window.IFWL_DriverSheet.panel(dsCtx, row, { owner: !!window.IFWL_OWNER }); }catch(err){ console.warn('Driver sheet failed', err); }
        if(mine !== dsReq) return;
        box.innerHTML = (out ? out.html : '') + window.IFWLStats.buildDriverProfileHtml(row);
        if(out) window.IFWL_DriverSheet.bind(box, out.model, { owner: !!window.IFWL_OWNER });
      });
      const randBtn = q('raceRandomSheetBtn');
      if(randBtn) randBtn.addEventListener('click', () => window.IFWL_DriverSheet && window.IFWL_DriverSheet.openRandom(dsCtx));
      // if you drove in this race, open your own sheet straight away
      const myKeys = (currentProfile?.accDriverNames || []).map(n => window.IFWLStats.driverNameKey(n));
      const myIdx = myKeys.length ? raceChartsRows.findIndex(r => myKeys.includes(window.IFWLStats.driverNameKey(r.driver))) : -1;
      if(myIdx >= 0){ dsSelect.value = String(myIdx); dsSelect.dispatchEvent(new Event('change')); }
    }
  }


  async function renderClaimLapsPanel(platform, serverId){
    const bodyId = platform === 'Console' ? 'claimLapsBodyConsole' : 'claimLapsBody';
    const body = q(bodyId);
    if(!body) return;

    // ✅ ADDED: reassure drivers who are already linked - the #1 support
    // question was "why can't I find myself in this list", and the answer
    // for most of them is simply "you don't need to, you're already sorted".
    const alreadyLinked = (currentProfile?.accDriverNames || []).length > 0;
    const linkedBox = q(platform === 'Console' ? 'claimLinkedBoxConsole' : 'claimLinkedBoxPC');
    if(linkedBox) linkedBox.classList.toggle('hidden', !alreadyLinked);

    let standings;
    try{
      standings = await window.cachedLicenceServerStandings({ minLaps: 15, serverId, classStructure: await window.classStructureForServer(serverId) , qualWindow: await window.fetchQualWindowMs()});
    }catch(e){
      body.innerHTML = `<div class="empty">Could not load the server list: ${e.message}</div>`;
      return;
    }
    if(!standings.length){
      body.innerHTML = `<div class="empty">No one has driven on the IFWL ${platform} Licence server yet.</div>`;
      return;
    }

    const linkedNames = new Set(await window.IFWL_ClaimAPI.fetchLinkedDriverNames());
    const unclaimed = standings.filter(s => !linkedNames.has(window.IFWLStats.driverNameKey(s.driver)));

    if(!unclaimed.length){
      body.innerHTML = '<div class="empty">Everyone on the server has already been linked. Nothing to claim right now.</div>';
      return;
    }

    body.innerHTML = unclaimed.map((s, i) => `
      <div class="claim-row">
        <div>
          <div class="claim-name">${s.driver}</div>
          <div class="claim-meta">${s.totalLaps} lap(s) &middot; gap ${s.avgGapPct != null ? '+' + s.avgGapPct + '%' : '-'}</div>
        </div>
        <button class="btn purple" data-claim="${i}">This is me</button>
      </div>
    `).join('');

    body.querySelectorAll('[data-claim]').forEach(btn => btn.addEventListener('click', async () => {
      const s = unclaimed[Number(btn.dataset.claim)];
      if(!confirm(`Claim "${s.driver}" as your ACC driver name? This links your licence to their race results.`)) return;
      btn.disabled = true; btn.textContent = 'Linking...';
      try{
        const existing = currentProfile?.accDriverNames || [];
        const merged = existing.some(n => n.toLowerCase() === s.driver.toLowerCase()) ? existing : [...existing, s.driver];
        currentProfile = await saveMyProfile({ accDriverNames: merged, platformAdd: platform === 'Console' ? 'console' : 'pc' });
        renderCard(currentProfile);
        const perfStats = await fetchPerformanceStats(currentProfile);
        renderCardStats(perfStats);
        renderLapProgressBox();
        await renderClaimLapsPanel(platform, serverId);
      }catch(e){ alert('Could not link: ' + e.message); btn.disabled = false; btn.textContent = 'This is me'; }
    }));
  }


  function showDriverLinkGate(){
    document.body.classList.add('driver-link-required');
    q('ifwlDriverLinkGate').classList.remove('hidden');
    // Pre-fill anything already on file, so a driver only completing their
    // last missing field doesn't have to retype everything else.
    if(currentProfile?.simgridUsername) q('gateSimgridUsernameInput').value = currentProfile.simgridUsername;
    if(currentProfile?.platform) q('gatePlatformSelect').value = currentProfile.platform;
    if(currentProfile?.steamId) q('gateSteamIdInput').value = currentProfile.steamId;
    if(currentProfile?.namePronunciation) q('gateNamePronunciationInput').value = currentProfile.namePronunciation;
    q('gateSteamIdField').classList.toggle('hidden', q('gatePlatformSelect').value === 'console');
  }
  function hideDriverLinkGate(){
    document.body.classList.remove('driver-link-required');
    q('ifwlDriverLinkGate').classList.add('hidden');
  }

  // ✅ ADDED: Rules re-agreement gate - 30-day forced re-read + a random
  // single question (2 wrong answers, 1 correct) from a bank covering the
  // actual rules text, so a driver can't just tick the box without having
  // actually read it. Full, unedited text of both IFWL rules documents -
  // one entry per distinct rule/section, each with its own question
  // testing THAT section specifically, so the question that shows up
  // rotates and can't just be learned and skipped.
  const RULES_REAGREEMENT_DAYS = 30;
  const RULES_QUIZ_BANK = [
    {
      id: 'racing-respectful-conduct',
      text: `Respectful Conduct: Participants must exhibit respect towards fellow drivers, IFWL officials, and League Operation managers at all times.`,
      question: { prompt: 'Who must you show respect towards, according to this rule?', options: ['Fellow drivers, IFWL officials, and League Operation managers', 'Only whoever wins the race', 'Only Discord moderators'], correctIndex: 0 }
    },
    {
      id: 'racing-decorum',
      text: `Racing Decorum: Prohibited actions include intentional ramming, brake checking, punting, blocking, bump-passing, light flashing & moving under braking, regardless of contact, & will incur penalties.`,
      question: { prompt: 'According to Racing Decorum, do these actions need to actually cause contact to be penalised?', options: ['No — they\u2019re prohibited regardless of contact', 'Yes, only if contact occurs', 'Only if a steward personally witnesses it live'], correctIndex: 0 }
    },
    {
      id: 'racing-passing-responsibilities',
      text: `Passing Responsibilities: Both the overtaking driver and the driver being overtaken are accountable for ensuring a fair passing maneuver. The responsibility lies with the overtaking driver to choose a safe opportunity for the pass.`,
      question: { prompt: 'Who specifically is responsible for choosing a safe opportunity to pass?', options: ['The overtaking driver', 'The car in front, always', 'Whoever is fastest at that point in the race'], correctIndex: 0 }
    },
    {
      id: 'racing-passing-lines',
      text: `Passing Lines: The leading driver is entitled to select any line on the track. This entitlement ceases when the overtaking driver aligns their front wheel with the rear wheel of the leading driver. At this stage, both drivers must leave at least enough room for either car to be between them and within the track boundary. It is the leading drivers responsibility to defend their ideal line entering a corner, but is the overtaking drivers responsibility to make sure they do not initiate contact during the overtake.`,
      question: { prompt: 'At what point does the leading driver\u2019s right to pick any line on track end?', options: ['When the overtaking driver\u2019s front wheel reaches the leading driver\u2019s rear wheel', 'As soon as the overtaking car is within DRS range', 'It never ends \u2014 the leader can always choose the line'], correctIndex: 0 }
    },
    {
      id: 'racing-establishing-overlap',
      text: `Establishing Overlap: Drivers should avoid dive-bombing without establishing a significant overlap before the turn-in point. If the driver loses control and causes contact or delays another driver, stricter penalties may apply. Drivers need to be aware of tyre delta, track conditions & pace are taken into account when making this move.`,
      question: { prompt: 'What must be established before attempting a late dive-bomb move, according to this rule?', options: ['A significant overlap before the turn-in point', 'Permission from your team captain', 'A faster sector time than the car ahead'], correctIndex: 0 }
    },
    {
      id: 'racing-line-commitment',
      text: `Line Commitment: Drivers should commit to their chosen line before entering a braking zone and must not deviate from it when defending against another car. Only exemptions are if another incident has occurred where all drivers need to take action to avoid the incident.`,
      question: { prompt: 'Once you\u2019ve committed to a line before a braking zone while defending, what\u2019s the only exemption to sticking with it?', options: ['If another incident forces all drivers to take avoiding action', 'If you realise a different line is faster', 'If your teammate asks you to move over'], correctIndex: 0 }
    },
    {
      id: 'racing-accident-predictability',
      text: `Accident Predictability: Drivers who lose control or spin should hold their brakes to remain predictable. After a spin, keep the brakes engaged to prevent the car from rolling unpredictably. Unsafe re-entry onto the track, causing further incidents, may result in severe penalties, regardless of the initial incident's cause. Drivers who are no longer racing need to exit to lobby and update their team captain or race steward - cars left in a dangerous position on a live track will result in a black flag / DQ.`,
      question: { prompt: 'What should you do with the brakes immediately after spinning, to stay predictable?', options: ['Hold them engaged', 'Release them and try to keep momentum', 'Pump them repeatedly to signal other drivers'], correctIndex: 0 }
    },
    {
      id: 'racing-rejoining-track',
      text: `Rejoining the Track: Drivers who go off the track should slow down or wait for traffic to clear before rejoining safely if they can maintain control of their car. Drivers are advised that until they are back up to race pace - to remain clear from racing line where possible, and drivers who are approaching a re-joining car are advised to ensure awareness and anticipation to the player rejoining.`,
      question: { prompt: 'Until you\u2019re back up to race pace after rejoining, where should you try to stay?', options: ['Clear of the racing line where possible', 'Directly on the racing line to defend position', 'It doesn\u2019t matter as long as you\u2019re moving'], correctIndex: 0 }
    },
    {
      id: 'racing-no-reverse',
      text: `No Reverse Direction: Drivers must not drive in the opposite direction of the race unless it is necessary to turn around after an incident. This will result in a black flag / DQ.`,
      question: { prompt: 'What happens if you drive the wrong way on track outside of turning around after an incident?', options: ['Black flag / DQ', 'A warning message only', 'Nothing \u2014 it\u2019s allowed briefly'], correctIndex: 0 }
    },
    {
      id: 'racing-allowing-overtakes',
      text: `Allowing Overtakes: Drivers who are a lap behind must yield to faster drivers to allow unobstructed overtaking. Lapped cars are allowed to unlap themselves when they are faster than the car that lapped them and there is an overtake opportunity. Normal race rules should apply with exception that a car that unlaps must be able to pull away and shall not engage explicit defensive moves.`,
      question: { prompt: 'A car unlapping itself must NOT do which of the following?', options: ['Engage explicit defensive moves', 'Use a run-off area to gain speed', 'Radio their team for advice'], correctIndex: 0 }
    },
    {
      id: 'racing-vehicle-modifications',
      text: `Vehicle Modifications: Car upgrades are strictly regulated according to the current Balance of Performance or setup on ifwl.net for the event they are racing in (BoP).`,
      question: { prompt: 'What governs whether a car upgrade/setup is allowed for an event?', options: ['The current Balance of Performance (BoP) on ifwl.net for that event', 'Whatever the fastest driver in the lobby is using', 'Personal preference, as long as it\u2019s within the game\u2019s limits'], correctIndex: 0 }
    },
    {
      id: 'racing-event-participation',
      text: `Event Participation: If you register for an event but cannot attend, you must "Unregister" to free up the spot for other participants.`,
      question: { prompt: 'If you register for an event but can\u2019t make it, what must you do?', options: ['Unregister, to free the spot for someone else', 'Nothing \u2014 no-shows are fine', 'Message the race winner to swap your slot'], correctIndex: 0 }
    },
    {
      id: 'racing-compliance',
      text: `Compliance: All participants must adhere to the Forza, AC & ACC Code of Conduct and IFWL race rules. Game specific code of conducts can be found at the respective game developers websites.`,
      question: { prompt: 'Besides IFWL\u2019s own rules, what else must all participants comply with?', options: ['The relevant game\u2019s own official Code of Conduct (Forza / AC / ACC)', 'Only IFWL\u2019s rules \u2014 nothing else applies', 'Whatever rules their own team sets internally'], correctIndex: 0 }
    },
    {
      id: 'racing-flashing-headlights',
      text: `Flashing Headlights \u2013 Clarified: Allowed: 1 flash per lap per driver \u2013 only when there's a genuine reason (e.g., approaching slower traffic). Not Allowed: Excessive flashing, flashing with no one ahead, or for intimidation. Penalty: 15-second post-race time penalty per violation. Note: Night race "flashing" due to damage is only seen by the damaged driver and doesn't count.`,
      question: { prompt: 'How many genuine headlight flashes per lap is a driver allowed?', options: ['1', '3', 'As many as needed, with no limit'], correctIndex: 0 }
    },
    {
      id: 'racing-flashing-headlights-penalty',
      text: `Flashing Headlights \u2013 Clarified: Allowed: 1 flash per lap per driver \u2013 only when there's a genuine reason (e.g., approaching slower traffic). Not Allowed: Excessive flashing, flashing with no one ahead, or for intimidation. Penalty: 15-second post-race time penalty per violation. Note: Night race "flashing" due to damage is only seen by the damaged driver and doesn't count.`,
      question: { prompt: 'What\u2019s the penalty for excessive or intimidation-based flashing?', options: ['A 15-second post-race time penalty per violation', 'Immediate disqualification, no exceptions', 'A verbal warning with no time penalty'], correctIndex: 0 }
    },
    {
      id: 'racing-blue-flag-race',
      text: `Blue Flag & Qualifying Protocol \u2013 Updated Rule #10. Race (Blue Flag): Blue-flagged drivers must yield within 5 corners once a faster car makes their presence clear (e.g., via radar, flashing, proximity). Drivers do not need to dive off track or abandon their line instantly \u2013 but must remain predictable. Erratic moves, brake checks, or sudden line changes = not allowed. If the blue-flagged car is genuinely at pace, they may defend until the 1s proximity window is reached.`,
      question: { prompt: 'Within how many corners must a blue-flagged driver yield, once a faster car makes its presence known?', options: ['5 corners', '1 corner', 'There is no corner limit \u2014 only a time limit'], correctIndex: 0 }
    },
    {
      id: 'racing-qualifying-protocol',
      text: `Blue Flag & Qualifying Protocol \u2013 Updated Rule #10. Qualifying: Drivers must not pressure or overtake any car on a valid qualifying lap. Overtakes are only permitted if there is a mutual agreement (via voice chat or by the car ahead signaling with indicators). If no agreement is made, the faster car must find a safe place, create a gap, and restart their lap attempt. Cars waiting for a gap must remain off the racing line and avoid blocking. If a train of cars is waiting off-line and a car approaches that is not on a fast lap, they must either wait in order with the pack or return to the pits.`,
      question: { prompt: 'During qualifying, when is it actually permitted to overtake a car on a hot lap?', options: ['Only with mutual agreement, via voice or an indicator signal', 'Any time you\u2019re faster than the car ahead', 'Never, under any circumstances at all'], correctIndex: 0 }
    },
    {
      id: 'racing-live-stewarding-final',
      text: `Live Stewarding \u2013 Final Decision Policy: All live steward decisions are final \u2013 no appeals. Live incidents = closed tickets. If it was handled in-race, it won't be re-opened post-race. You can still submit feedback tickets to help us review and improve consistency (but not reverse outcomes).`,
      question: { prompt: 'Can a live steward\u2019s in-race decision be appealed and reversed after the race?', options: ['No \u2014 it\u2019s final, and the ticket stays closed', 'Yes, any driver can appeal it within 24 hours', 'Only if a Gold Patreon member requests it'], correctIndex: 0 }
    },
    {
      id: 'league-respect-sportsmanship',
      text: `Respect and Sportsmanship: Treat all fellow racers, staff, and community members with respect and courtesy at all times. Display good sportsmanship, regardless of the race outcome, and congratulate or acknowledge the performance of other racers.`,
      question: { prompt: 'According to this rule, does good sportsmanship depend on how the race went for you?', options: ['No \u2014 it applies regardless of the race outcome', 'Yes, only if you win', 'Only during podium ceremonies'], correctIndex: 0 }
    },
    {
      id: 'league-clean-racing',
      text: `Clean Racing: Maintain fair and clean racing practices, avoiding intentional collisions or aggressive driving that could disrupt other participants' experiences. Give space to other drivers and avoid aggressive blocking or erratic manoeuvres that could compromise the safety of other racers. Drivers who feel they have had an incident they need to report due to other drivers perceived foul play, need to submit a stewards enquiry ticket in the dedicated stewards-enquiry.`,
      question: { prompt: 'If you feel you\u2019ve had an incident because of another driver\u2019s foul play, what should you actually do?', options: ['Submit a stewards enquiry ticket', 'Argue it out in the race team chat', 'Post about it publicly in general Discord'], correctIndex: 0 }
    },
    {
      id: 'league-etiquette',
      text: `League Etiquette: Avoid any form of harassment, bullying, or discriminatory behaviour in the IFWL Discord server. Refrain from using offensive language, derogatory remarks, or any content that could make others feel uncomfortable. In the heat of the race \u2013 drivers can be very passionate \u2013 and small errors can lead to heated arguments in the race. IFWL.net have decided that we will be drawing a line on 'in race' abuse of other league members. If any of our admin staff request the conversation to stop or move along, we expect all members agree and continue their race \u2013 if the drivers concerned continue to argue \u2013 this will be dealt with by the admin team post-race and could potentially lead to point deductions / prize removal or a mute. "Shit talking is allowed \u2013 but excessive abuse of other members is not allowed."`,
      question: { prompt: 'According to League Etiquette, which of these is officially fine, in IFWL\u2019s own words?', options: ['"Shit talking" within reason', 'Excessive abuse of other members', 'Continuing an argument after staff ask you to stop'], correctIndex: 0 }
    },
    {
      id: 'league-participation-attendance',
      text: `Participation Requirements: All members must actively participate in the IFWL community, contributing positively to discussions and events when possible. Every driver must be registered on ifwl.net with their gamertag and driver number entered. All drivers are now required from season 4 to update their attendance to each race on IFWL.NET \u2013 if your plans change, a quick site update can be made up to 30 minutes before the race starts. If your plans change at short notice \u2013 please make admin or stewards aware in the paddock area (for TTC \u2013 team captains are now in charge of all drivers' attendance to all races).`,
      question: { prompt: 'From Season 4, how close to race start can you still update your attendance on IFWL.NET?', options: ['Up to 30 minutes before the race starts', 'Up to 5 minutes before the race starts', 'You can\u2019t update it once you\u2019ve registered'], correctIndex: 0 }
    },
    {
      id: 'league-participation-paid-events',
      text: `Participation Requirements: All paid event races are for ifwl active drivers only \u2013 players must have passed their assessment race to partake in these events. Please note \u2013 some events require a seasonal attendance percentage to qualify for the payouts. (AC & ACC)`,
      question: { prompt: 'Who is eligible to take part in paid event races?', options: ['Only active IFWL drivers who\u2019ve passed their assessment race', 'Anyone who registers in time', 'Only Gold Patreon members'], correctIndex: 0 }
    },
    {
      id: 'league-fair-play-integrity',
      text: `Fair Play and Integrity: Maintain fairness and integrity in all aspects of the IFWL, including vehicle modifications and tuning. Adhere to the set regulations and avoid exploiting any glitches or cheats that could provide an unfair advantage. Doing so will be dealt with by our stewarding team and can be progressed to a race or league ban \u2013 on review of head admin and head stewards on the severity of each individual case.`,
      question: { prompt: 'What can happen if you\u2019re found exploiting a glitch for an unfair advantage?', options: ['It\u2019s reviewed by head admin/head stewards and can escalate to a race or league ban', 'Nothing \u2014 exploits found in-game are considered fair game', 'An automatic permanent ban with no review process'], correctIndex: 0 }
    },
    {
      id: 'league-amendments',
      text: `IFWL reserves the right to amend any requirements upon the initial discovery of an exploit. These amendments may be enacted during or outside of the season. Such changes will only be implemented following a majority vote by all administrators. In exceptional circumstances, the league owner may take necessary measures without a vote if it is deemed to be in the best interest of the league.`,
      question: { prompt: 'How are rule changes normally put into effect, outside of exceptional circumstances?', options: ['A majority vote by all administrators', 'A decision made by a single steward', 'A public vote open to all members'], correctIndex: 0 }
    },
    {
      id: 'league-advertisement-external',
      text: `Advertisement of "external" Content: Sharing any information unrelated to IFWL content is not allowed. This includes, but is not limited to, content from other racing leagues, servers, websites (such as sites offering a paid plan that may go against IFWL's affiliation or partnerships), and other forms of communication. This rule is in place to prevent the promotion of external information on our Discord. Exceptions will be made, but only if prior communication has been made privately with the founding Admin team members.`,
      question: { prompt: 'Can you get an exception to post external/unrelated content in IFWL\u2019s Discord?', options: ['Only with prior private communication with the founding Admin team', 'Yes, any staff member can approve it on the spot', 'No, there are never any exceptions'], correctIndex: 0 }
    },
    {
      id: 'league-advertisement-other-leagues',
      text: `Advertisement of other Leagues: Advertising of any other leagues is strictly prohibited, unless it has been approved by admin and voted on in an admin meeting. Any cars found running liveries with advertising other leagues will be subject to immediate consequences. This includes, but is not limited to: words, names, logos, content sharing, or implied endorsements via liveries; words, names, logos, content sharing, or implied endorsements via discord; media of any type that is linked to external league discords or websites. Twitch/Xbox & Youtube content sharing is fine, but promotion of other leagues is not allowed.`,
      question: { prompt: 'Is Twitch/Xbox/YouTube content sharing itself against the rules?', options: ['No \u2014 that\u2019s fine, it\u2019s promotion of other LEAGUES that\u2019s banned', 'Yes, all external content sharing is banned outright', 'Only YouTube sharing is allowed, the others are banned'], correctIndex: 0 }
    },
    {
      id: 'league-original-ideas',
      text: `Original Ideas & Innovations: At IFWL.NET, we pride ourselves on our unique ideas, race formats, and events that make the league special. We kindly ask that all members respect the creativity and effort that goes into planning and running the league. While we fully support your passion for racing and encourage participation in other leagues, we request that all concepts, formats, and innovations that originate in IFWL remain exclusive to the league. Members branching out to create or join other leagues are asked to refrain from directly replicating IFWL's unique ideas.`,
      question: { prompt: 'If you want to bring an idea that originated in IFWL to another league, what does IFWL ask you to do first?', options: ['Reach out to the IFWL leadership team', 'Nothing \u2014 ideas are free to reuse anywhere once public', 'Just credit IFWL in a Discord post'], correctIndex: 0 }
    },
    {
      id: 'league-disrespect-appeals',
      text: `Disrespectful Conduct During Appeals Process. Rule: Any use of disrespectful language or behaviour (this also includes the use of Emojis as a form of indirect communication) directed at race officials, stewards, or appeals team members will be met with strict penalties, including immediate race suspensions or bans.`,
      question: { prompt: 'According to this rule, what can count as disrespectful conduct toward stewards, somewhat surprisingly?', options: ['Using emojis as a form of indirect communication', 'Politely asking a clarifying question', 'Submitting a written appeal through the correct channel'], correctIndex: 0 }
    },
    {
      id: 'league-disrespect-penalty-tiers',
      text: `Penalty Structure: Minor Disrespect \u2013 1-race suspension. This includes any mildly disrespectful comments or behaviours that show a lack of professionalism but stop short of severe abuse. Moderate Disrespect \u2013 2-race suspension. This includes repeated or intensified disrespectful behaviour after warnings or behaviour that disrupts the appeals process. Severe Disrespect \u2013 Season ban from the series. Severe disrespect includes any instances of abusive language, threats, or continued disruptive behaviour towards staff members, reflecting the league's zero-tolerance approach.`,
      question: { prompt: 'What\u2019s the penalty specifically for "Moderate Disrespect" toward officials?', options: ['A 2-race suspension', 'A season-long ban', 'A private warning with no suspension'], correctIndex: 0 }
    },
    {
      id: 'league-investigation-interference',
      text: `Investigation Interference and Open Ticket Discussions. Rule: Any attempt to interfere with an active investigation or discussion of an open ticket with the intent to influence the outcome will be considered an infraction. Clarification: All drivers, team members, and other league participants are prohibited from discussing details of any ongoing investigation in public or private forums to avoid undue influence on race stewards and the investigation team.`,
      question: { prompt: 'Can you discuss the details of an ongoing ticket investigation, publicly or privately?', options: ['No \u2014 it\u2019s prohibited, to avoid influencing the stewards', 'Yes, as long as it\u2019s a private forum only', 'Yes, transparency about open tickets is actively encouraged'], correctIndex: 0 }
    },
    {
      id: 'league-ingame-text-chat',
      text: `In-Game Text Chat Usage. Rule: The in-game text chat is permitted only during practice sessions. Use of text chat during qualifying or race sessions is strictly forbidden to maintain concentration and fairness for all competitors. Clarification: The race is not considered over until the last car has crossed the finish line. Drivers are expected to remain silent in chat during qualifying and race sessions.`,
      question: { prompt: 'When is in-game text chat actually permitted?', options: ['Only during practice sessions', 'At any point, including during the race', 'Only once you personally have finished racing'], correctIndex: 0 }
    },
    {
      id: 'league-ingame-text-chat-raceover',
      text: `In-Game Text Chat Usage. Clarification: The race is not considered over until the last car has crossed the finish line. Communication for essential matters should be handled through official league channels (e.g., Discord or stewarding systems), not in-game chat.`,
      question: { prompt: 'For chat-rule purposes, when is a race actually considered "over"?', options: ['When the last car crosses the finish line', 'As soon as the race leader finishes', 'The moment you personally finish, regardless of others'], correctIndex: 0 }
    },
    {
      id: 'league-obstruction-of-staff',
      text: `Obstruction of Staff: To ensure IFWL staff can properly manage league operations, stewarding, moderation, and member support, all members must remain contactable by IFWL staff. Any member found to have blocked, muted, or otherwise prevented communication from any IFWL staff member will be asked to reverse this action. Once requested, the member will have 24 hours to amend the issue and confirm they are contactable again. Failure to do so within 24 hours will result in removal from the IFWL Discord server, a ban from all future IFWL race events, and loss of access to IFWL services where applicable.`,
      question: { prompt: 'If asked to unblock/unmute an IFWL staff member, how long do you have to sort it out?', options: ['24 hours', '7 days', 'There is no time limit at all'], correctIndex: 0 }
    },
    {
      id: 'league-image-uploads',
      text: `New IFWL Discord Rule \u2014 Image Uploads: Due to the increased use of spam bots, IFWL has introduced a new anti-spam filter and automated moderation bot. From now on, all image uploads must include the word IFWL in the message or caption accompanying the image. Any image posted without the word IFWL will be automatically removed by the bot immediately.`,
      question: { prompt: 'What word must appear in the caption of any image you post in IFWL\u2019s Discord?', options: ['"IFWL"', '"Race"', 'No caption is required at all'], correctIndex: 0 }
    }
  ];

  function rulesGateEsc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function needsRulesReAgreement(profile){
    const last = profile?.rulesAgreedAtMs;
    if(!last) return true;
    return (Date.now() - last) > (RULES_REAGREEMENT_DAYS * 24 * 60 * 60 * 1000);
  }

  let rulesGateSelectedIndex = null;
  let rulesGateCurrentQuestionId = null;

  // ✅ FIXED: with only 3 options, letting a driver retry the SAME question
  // after a wrong guess turns it into pure elimination - two wrong guesses
  // in a row and the third option is obviously correct without reading
  // anything. Any wrong answer now reveals what the right answer WAS, then
  // swaps in a completely different random question with fresh odds -
  // there's no way to "spam through" a question you don't actually know.
  function renderRandomRulesQuestion(excludeId){
    const pool = excludeId ? RULES_QUIZ_BANK.filter(r => r.id !== excludeId) : RULES_QUIZ_BANK;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    rulesGateCurrentQuestionId = pick.id;

    const optionOrder = [0, 1, 2].sort(() => Math.random() - 0.5);
    rulesGateSelectedIndex = null;

    q('rulesGateQuestionText').textContent = pick.question.prompt;
    const optsBox = q('rulesGateOptions');
    optsBox.innerHTML = optionOrder.map(origIdx =>
      `<button type="button" class="rules-gate-option" data-orig-index="${origIdx}" data-correct="${origIdx === pick.question.correctIndex}" data-answer-text="${rulesGateEsc(pick.question.options[origIdx])}">${rulesGateEsc(pick.question.options[origIdx])}</button>`
    ).join('');
    optsBox.querySelectorAll('.rules-gate-option').forEach(btn => {
      btn.addEventListener('click', () => {
        optsBox.querySelectorAll('.rules-gate-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        rulesGateSelectedIndex = { correct: btn.dataset.correct === 'true', correctText: pick.question.options[pick.question.correctIndex] };
        updateRulesGateConfirmState();
      });
    });

    updateRulesGateConfirmState();
  }

  function showRulesGate(){
    document.body.classList.add('driver-link-required'); // reuses the same "block everything else" body state
    q('rulesGateWall').classList.remove('hidden');

    q('rulesGateText').innerHTML = RULES_QUIZ_BANK.map(r => `<p>${rulesGateEsc(r.text)}</p>`).join('');

    q('rulesGateCheckbox').checked = false;
    q('rulesGateError').textContent = '';
    renderRandomRulesQuestion(null);
  }

  function updateRulesGateConfirmState(){
    const btn = q('rulesGateConfirmBtn');
    const ready = q('rulesGateCheckbox').checked && rulesGateSelectedIndex !== null;
    btn.disabled = !ready;
    btn.style.opacity = ready ? '1' : '.5';
  }

  function hideRulesGate(){
    document.body.classList.remove('driver-link-required');
    q('rulesGateWall').classList.add('hidden');
  }

  q('rulesGateCheckbox')?.addEventListener('change', updateRulesGateConfirmState);
  q('rulesGateLogoutBtn')?.addEventListener('click', () => window.IFWL_AUTH?.signout?.());
  q('rulesGateConfirmBtn')?.addEventListener('click', async () => {
    const errBox = q('rulesGateError');
    if(!rulesGateSelectedIndex || !rulesGateSelectedIndex.correct){
      const correctText = rulesGateSelectedIndex ? rulesGateSelectedIndex.correctText : '';
      errBox.textContent = correctText
        ? `Not quite — the correct answer to the last question was: "${correctText}". Here's a new question — have a read and try again.`
        : 'Not quite — have a read and try again.';
      renderRandomRulesQuestion(rulesGateCurrentQuestionId); // fresh question, never the same one twice in a row
      return;
    }
    const btn = q('rulesGateConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Confirming...';
    try{
      const result = await apiPost('agreeToRules', {});
      if(currentProfile) currentProfile.rulesAgreedAtMs = result.rulesAgreedAtMs;
      hideRulesGate();
      location.reload(); // simplest safe way to resume the normal init() flow cleanly
    }catch(e){
      errBox.textContent = 'Could not confirm: ' + e.message;
      btn.disabled = false;
      btn.textContent = 'Confirm';
    }
  });

  // ✅ ADDED: the browsable Racing Rules page - same text as the gate,
  // reachable any time from the nav, no quiz attached. Deduped by text so
  // sections that share source text (e.g. the two Flashing Headlights
  // questions) don't show the same paragraph twice.
  function initRacingRulesPage(){
    const box = q('racingRulesFullText');
    if(!box) return;
    const seen = new Set();
    const uniqueTexts = RULES_QUIZ_BANK.filter(r => {
      if(seen.has(r.text)) return false;
      seen.add(r.text);
      return true;
    });
    box.innerHTML = uniqueTexts.map(r => `<p style="margin-bottom:14px;line-height:1.65;color:var(--text-muted)">${rulesGateEsc(r.text)}</p>`).join('');

    if(window.IFWL_STAFF){
      q('racingRulesStaffPreview')?.classList.remove('hidden');
      q('racingRulesPreviewGateBtn')?.addEventListener('click', () => showRulesGate());
    }
  }

  function showLicenceRefusedGate(){
    document.body.classList.add('driver-link-required'); // reuses the same "block everything else" body state
    q('ifwlLicenceRefusedGate').classList.remove('hidden');
    // ✅ ADDED: pulls the current staff-editable message instead of a
    // hardcoded paragraph, so this can be changed from the Staff panel
    // without a code deploy.
    apiGet('messageTemplates').then(t => {
      if(t?.licenceRefusedPageMessage) q('licenceRefusedMessage').textContent = t.licenceRefusedPageMessage;
    }).catch(() => {}); // falls back to the static default already in the HTML
  }
  function hideLicenceRefusedGate(){
    document.body.classList.remove('driver-link-required');
    q('ifwlLicenceRefusedGate').classList.add('hidden');
  }
  q('refusedRefreshBtn')?.addEventListener('click', () => window.location.reload());
  q('refusedLogoutBtn')?.addEventListener('click', () => window.IFWL_AUTH.signout());

  // Fingerprinted per-user in localStorage so a driver only sees this once
  // per distinct set of pending tickets - dismissing it doesn't hide it
  // forever, but a NEW ticket (changing the count or the newest ticket id)
  // will surface it again rather than staying silently suppressed.
  function ticketNoticeSeenKey(){ return 'IFWL_TICKET_NOTICE_SEEN:' + window.IFWL_AUTH.userId(window.IFWL_META); }
  function ticketNoticeFingerprint(notice){
    const ids = (notice.tickets || []).map(t => t.id).sort().join(',');
    return `${notice.count}|${ids}`;
  }
  // ✅ ADDED: Your Qualification Ranking - shows where the driver currently
  // sits in the field on each licence server they've raced on. Tier-gated:
  //   Gold/staff -> everything (rank, recommended tier, consistency, gap)
  //   Silver     -> rank only, rest blanked, upsell for the rest
  //   Bronze/below -> everything blanked, upsell for all of it
  // A driver who hasn't raced on a given server at all just doesn't get a
  // card for it - nothing to rank them against.
  function findMyStandingRow(standings, accDriverNames){
    if(!accDriverNames || !accDriverNames.length) return -1;
    const mine = accDriverNames.map(n => window.IFWLStats.driverNameKey(n));
    return standings.findIndex(s => {
      const key = window.IFWLStats.driverNameKey(s.driver);
      return mine.some(m => m === key || key.includes(m) || m.includes(key));
    });
  }

  // ✅ ADDED: matches a session's numeric car model ID against BOP
  // TRACKer's own car catalog (the same catalog/images staff already
  // maintain there) so the session stats table below can show a name +
  // thumbnail without a second, separately-maintained image source.
  // platformKey is 'pc' or 'console' - picks which of the catalog's two
  // model-ID fields to compare against, same convention BOP TRACKer itself
  // uses when matching a car to its BOP entry.
  function sessionCarInfo(carCatalog, carModel, platformKey){
    if(carModel == null) return null;
    // ✅ FIXED: coerce both sides to numbers before comparing. carModel here
    // comes straight from the parsed ACC session JSON (always numeric), but
    // catalog IDs can come back from a couple of different paths (direct
    // save vs re-fetch) - a strict === was silently failing to match
    // anything whenever either side wasn't already a number.
    const wanted = Number(carModel);
    return (carCatalog || []).find(c => {
      const rawId = platformKey === 'console'
        ? (Number.isFinite(Number(c.consoleCarModelId)) ? c.consoleCarModelId : c.pcCarModelId)
        : c.pcCarModelId;
      return Number(rawId) === wanted;
    }) || null;
  }

  // ✅ ADDED: shared Fastest / Slowest (excl. outlap) / Average / Car table,
  // used by both the staff Session Inspector drilldown and the driver-facing
  // Your Qualification Ranking card so the two stay visually and logically
  // identical rather than drifting into two separate implementations.
  function buildSessionStatsTableHtml(sessions, carCatalog, platformKey){
    const rows = sessions.map(s => {
      const car = sessionCarInfo(carCatalog, s.carModel, platformKey);
      // ✅ FIXED: previously fell straight to a bare "Unknown car" whenever
      // there was no BOP TRACKer catalog entry for this car model - which
      // meant the whole column looked broken/empty on any server where the
      // catalog isn't fully populated, even though the session JSON itself
      // always carries a car model number. Now: catalog match (name +
      // image) > raw car model number as plain text > only "Unknown car"
      // if the session genuinely has no car model recorded at all.
      const carCell = car
        ? `<div class="sd-car-cell">${car.imageUrl ? `<img class="sd-car-thumb" src="${car.imageUrl}" alt="" loading="lazy">` : ''}<span class="sd-car-name">${car.name}</span></div>`
        : (s.carModel != null
            ? `<span class="field-hint">Car model ${s.carModel}</span>`
            : `<span class="field-hint">Unknown car</span>`);
      return `<tr>
        <td>${s.dateLabel}</td>
        <td>${s.track}</td>
        <td>${s.sessionLabel}</td>
        <td class="mono">${s.lapCount}</td>
        <td class="mono">${s.bestLap ? window.IFWLStats.msTime(s.bestLap) : '-'}</td>
        <td class="mono">${s.slowestLap ? window.IFWLStats.msTime(s.slowestLap) : '-'}</td>
        <td class="mono">${s.avgLap ? window.IFWLStats.msTime(s.avgLap) : '-'}</td>
        <td>${carCell}</td>
      </tr>`;
    }).join('');
    return `<table class="sd-table">
      <thead><tr><th>Date</th><th>Track</th><th>Session</th><th>Laps</th><th>Fastest</th><th>Slowest*</th><th>Average</th><th>Car</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="field-hint" style="margin-top:6px">*Excludes the outlap.</p>`;
  }
  // ✅ FIXED: this block and the Staff Panel block below are two separate
  // top-level <script> closures - a plain function declared in one isn't
  // visible in the other. Exposing both helpers on window makes them
  // reachable from anywhere on the page, same as every other cross-block
  // API here (window.IFWL_BopAPI, window.IFWLStats, etc).
  window.sessionCarInfo = sessionCarInfo;
  window.buildSessionStatsTableHtml = buildSessionStatsTableHtml;

  // ✅ ADDED: Top 10 leaderboard on Your Qualification Ranking - Gold/staff
  // only, same gate as Recommended Tier/Consistency/Gap to Best on this
  // card. Shows the 10 fastest drivers on this server (by the same pace
  // ranking that already decides everyone's rank/recommended tier), each
  // with the car tied to their fastest lap, their consistency, and - the
  // actual point of this table - a time gap between YOUR best lap and
  // theirs, so it reads as "here's exactly how much you need to find to
  // catch #4", not just a bare list of names. Standard motorsport gap
  // convention: positive = you're behind (slower), negative = you're
  // ahead of them.
  async function buildQualTop10Html(standings, myIndex, serverId, isGoldOrStaff){
    if(!isGoldOrStaff) return '';
    const top = standings.slice(0, 10);
    if(!top.length) return '';

    const myRow = myIndex >= 0 ? standings[myIndex] : null;
    const myBestMs = (myRow && Number.isFinite(myRow.bestLapMs)) ? myRow.bestLapMs : null;

    let carCatalog = [];
    try{ carCatalog = (await window.IFWL_BopAPI.fetchBopTrackerData()).carCatalog || []; }
    catch(e){ /* rows just fall back to a plain car-model number below */ }
    const platformKey = serverId.startsWith('console') ? 'console' : 'pc';

    const gapText = (theirMs) => {
      if(myBestMs == null || !Number.isFinite(theirMs)) return '-';
      const gapSec = (myBestMs - theirMs) / 1000;
      if(Math.abs(gapSec) < 0.0005) return 'Even';
      return `${gapSec > 0 ? '+' : ''}${gapSec.toFixed(3)}s`;
    };

    const rows = top.map((r, i) => {
      const rank = i + 1;
      const isMe = i === myIndex;
      const car = sessionCarInfo(carCatalog, r.bestLapCarModel, platformKey);
      const carCell = car
        ? `<div class="sd-car-cell">${car.imageUrl ? `<img class="sd-car-thumb" src="${car.imageUrl}" alt="" loading="lazy">` : ''}<span class="sd-car-name">${car.name}</span></div>`
        : (r.bestLapCarModel != null ? `<span class="field-hint">Car model ${r.bestLapCarModel}</span>` : `<span class="field-hint">-</span>`);
      return `<tr class="${isMe ? 'qual-top10-me' : ''}">
        <td class="mono">#${rank}</td>
        <td>${r.driver}${isMe ? ' <span class="field-hint">(you)</span>' : ''}</td>
        <td class="mono">${r.bestLapMs ? window.IFWLStats.msTime(r.bestLapMs) : '-'}</td>
        <td>${carCell}</td>
        <td class="mono">${r.consistencyAvg != null ? r.consistencyAvg + '%' : '-'}</td>
        <td class="mono">${isMe ? '&mdash;' : gapText(r.bestLapMs)}</td>
      </tr>`;
    }).join('');

    const note = myBestMs == null
      ? `<p class="field-hint" style="margin-top:6px">Set a valid lap on this server to see your gap to each of these.</p>`
      : `<p class="field-hint" style="margin-top:6px">Gap is your best lap vs theirs - positive means you're behind, negative means you're ahead of them.</p>`;

    return `<div class="qual-top10-wrap">
      <div class="qual-top10-head"><strong>Top 10${top.length < standings.length ? ` of ${standings.length}` : ''}</strong></div>
      <div style="overflow-x:auto"><table class="sd-table">
        <thead><tr><th>#</th><th>Driver</th><th>Best lap</th><th>Car</th><th>Consistency</th><th>Gap to you</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${note}
    </div>`;
  }
  window.buildQualTop10Html = buildQualTop10Html;

  // ✅ ADDED: the lap-time chart on Your Qualification Ranking, tier-gated -
  //   Bronze/below -> nothing (returns '')
  //   Silver       -> their own lap-time line, no field reference lines
  //   Gold/staff   -> their own line PLUS the Pro/Am/Beginner field average
  //                   lines, same chart staff see on the drilldown
  async function buildQualChartSection(serverId, accDriverNames, isGoldOrStaff, isSilverOnly){
    if(!isGoldOrStaff && !isSilverOnly) return '';

    // ✅ FIXED: this chart (and the stats table below it) were pulling every
    // session ever recorded for the driver on this server, regardless of the
    // staff-configured Qualification Window - unlike the Your Rank/
    // Recommended Tier numbers above it, which already scope correctly via
    // cachedLicenceServerStandings. Fetching and passing the same window here
    // brings the chart back in line with the numbers sitting right above it.
    const qualWindow = await window.fetchQualWindowMs();

    let sessions;
    try{
      sessions = await window.IFWLStats.getDriverSessionHistory(serverId, accDriverNames, { qualWindow });
    }catch(e){ return ''; }
    if(!sessions.length) return '';

    let tierAverages = {};
    if(isGoldOrStaff){
      try{ tierAverages = await window.IFWLStats.computeTierLapAverages(serverId, { qualWindow }); }
      catch(e){ /* chart still renders fine without the reference lines */ }
    }

    const chart = window.IFWLStats.buildDriverSessionChartHtml(sessions, tierAverages);
    const sub = isGoldOrStaff
      ? `${sessions.length} session(s) &middot; dotted colour lines show tier field averages &middot; hover a dot for that lap's exact time`
      : `${sessions.length} session(s) &middot; hover a dot for that lap's exact time &middot; <a href="https://www.patreon.com/c/IFWL" target="_blank" rel="noopener">Upgrade to Gold</a> to see Pro/Am/Beginner field averages on this chart`;

    // ✅ ADDED: per-session Fastest/Slowest/Average/Car breakdown - same
    // detail tier as the rest of this card, so it's Gold/staff only rather
    // than adding a new thing for Silver to see that nothing else here does.
    let statsTable = '';
    if(isGoldOrStaff){
      try{
        const platformKey = serverId.startsWith('console') ? 'console' : 'pc';
        const bopData = await window.IFWL_BopAPI.fetchBopTrackerData();
        statsTable = buildSessionStatsTableHtml(sessions, bopData.carCatalog, platformKey);
      }catch(e){ /* table just omitted if the car catalog can't be reached */ }
    }

    return `<div class="qual-chart-wrap"><p class="qual-chart-sub">${sub}</p>${chart}${statsTable}</div>`;
  }

  async function buildQualStandingCard(platformLabel, myIndex, standings, serverId, accDriverNames){
    const total = standings.length;
    const row = standings[myIndex];
    const rank = myIndex + 1;
    const isGoldOrStaff = window.IFWL_GOLD || window.IFWL_STAFF;
    const isSilverOnly = window.IFWL_SILVER_PLUS && !isGoldOrStaff;

    const rankBox = `<div class="qual-stat-box"><span>Your Rank</span><strong>${rank} of ${total}</strong></div>`;
    const lockedBox = (label) => `<div class="qual-stat-box qual-locked"><span>${label}</span><strong>Gold only</strong></div>`;
    const tierBox = isGoldOrStaff ? `<div class="qual-stat-box"><span>Recommended Tier</span><strong>${row.recommendedTier}</strong></div>` : lockedBox('Recommended Tier');
    const consistencyBox = isGoldOrStaff ? `<div class="qual-stat-box"><span>Consistency</span><strong>${row.consistencyAvg != null ? row.consistencyAvg + '%' : '-'}</strong></div>` : lockedBox('Consistency');
    const gapBox = isGoldOrStaff ? `<div class="qual-stat-box"><span>Gap to Best</span><strong>${row.avgGapPct != null ? '+' + row.avgGapPct + '%' : '-'}</strong></div>` : lockedBox('Gap to Best');
    const rankCell = (isSilverOnly || isGoldOrStaff) ? rankBox : lockedBox('Your Rank');

    const upsell = isGoldOrStaff ? '' : `<div class="qual-upsell">✨ ${isSilverOnly ? 'Upgrade to Gold to see your recommended tier, consistency and gap to the best time.' : 'Upgrade to Gold to see your rank, recommended tier, consistency and gap to the best time.'} <a href="https://www.patreon.com/c/IFWL" target="_blank" rel="noopener">Upgrade on Patreon &rarr;</a></div>`;

    // ✅ ADDED: a constructive explanation when the current pace data puts a
    // driver below the Beginner requirement - shows exactly how much pace
    // they need to find, not just a bare "Rookie Class" label with no context.
    const rookieNote = (isGoldOrStaff && row.recommendedTier === 'Rookie Class' && row.rookieGapPct != null)
      ? `<div class="notice-card" style="border-left-color:var(--ifwl-amber);background:rgba(255,178,56,.08);margin-top:12px">
          Based on your current lap data, you're not quite within the pace needed for a Beginner licence yet - you're <strong>${row.rookieGapPct}%</strong> further off the field's best than the Beginner cutoff allows. Keep putting laps in - this recalculates automatically as your pace improves, and there's no penalty for being here while you build speed.
        </div>`
      : '';

    const top10Section = await buildQualTop10Html(standings, myIndex, serverId, isGoldOrStaff);
    const chartSection = await buildQualChartSection(serverId, accDriverNames, isGoldOrStaff, isSilverOnly);

    return `<div class="qual-standing-card">
      <div class="qual-standing-head"><h4>${platformLabel}</h4><span class="field-hint">${row.totalLaps} lap(s) &middot; ${row.qualified ? 'Qualified' : row.totalLaps + '/15 laps'}</span></div>
      <div class="qual-standing-grid">${rankCell}${tierBox}${consistencyBox}${gapBox}</div>
      ${upsell}
      ${rookieNote}
      ${top10Section}
      ${chartSection}
    </div>`;
  }

  // ✅ ADDED: pop-up on login when there's an unread Inbox message, same
  // one-time-per-message fingerprint pattern the Career Shop transaction
  // notice uses on career.html - fires once per newest unread thread, not
  // every login, and re-fires if a genuinely new message arrives after
  // being dismissed.
  function inboxNoticeSeenKey(){ return 'IFWL_INBOX_NOTICE_SEEN:' + window.IFWL_AUTH.userId(window.IFWL_META); }
  async function checkInboxNotice(){
    let data;
    try{ data = await window.IFWL_InboxAPI.myInbox(); }
    catch(e){ return; }
    const threads = (data.threads || []).filter(t => t.unread > 0);
    if(!threads.length) return;

    // Fingerprint on the newest unread thread's id + its unread count, so
    // a fresh reply on an already-seen thread still triggers a re-notify.
    threads.sort((a,b) => (b.lastMessageAtMs||0) - (a.lastMessageAtMs||0));
    const top = threads[0];
    const fingerprint = `${top.id}:${top.unread}`;
    if(localStorage.getItem(inboxNoticeSeenKey()) === fingerprint) return;

    const totalUnread = threads.reduce((sum, t) => sum + (t.unread || 0), 0);
    q('inboxNoticeText').textContent = totalUnread === 1
      ? `You have an unread message from ${top.staffName || 'IFWL staff'}: "${top.subject}".`
      : `You have ${totalUnread} unread messages, most recently from ${top.staffName || 'IFWL staff'}: "${top.subject}".`;
    q('inboxNoticeModal').classList.remove('hidden');

    const dismiss = () => { localStorage.setItem(inboxNoticeSeenKey(), fingerprint); q('inboxNoticeModal').classList.add('hidden'); };
    q('inboxNoticeDismissBtn').onclick = dismiss;
    q('inboxNoticeOpenBtn').onclick = () => { dismiss(); window.switchView?.('inbox'); };
  }

  // ✅ ADDED: Licence Points band-crossing notice - supersedes the old TLS
  // tool's manual Discord posts. licencePointsNotices already comes down
  // on currentProfile (licenceProfile spreads the whole doc), so this is
  // pure client-side - no extra fetch. Shows the oldest unseen notice
  // first (in case more than one landed between visits), acks it server-
  // side via licencePointsNoticeSeen on dismiss so it never reappears,
  // even on another device.
  async function checkLicencePointsNotice(){
    if(window.IFWL_STAFF) return;
    const notices = Array.isArray(currentProfile?.licencePointsNotices) ? currentProfile.licencePointsNotices : [];
    const unseen = notices.filter(n => n && !n.seen).sort((a,b) => (a.dateMs||0) - (b.dateMs||0));
    if(!unseen.length) return;
    const notice = unseen[0];

    const kicker = notice.band === 'escalate' ? 'LICENCE POINTS - REFERRED' : notice.band === 'warning' ? 'FINAL WARNING' : 'LICENCE POINTS - AMBER';
    const title = notice.band === 'escalate' ? 'Referred For Review' : notice.band === 'warning' ? 'Final Warning' : 'Points Update';
    q('licencePointsNoticeKicker').textContent = kicker;
    q('licencePointsNoticeTitle').textContent = title;
    q('licencePointsNoticeText').textContent = notice.text || `Your licence points have reached ${notice.points ?? ''}.`;
    q('licencePointsNoticeModal').classList.remove('hidden');

    q('licencePointsNoticeDismissBtn').onclick = async () => {
      q('licencePointsNoticeModal').classList.add('hidden');
      try{ await apiPost('licencePointsNoticeSeen', { noticeId: notice.id }); }
      catch(e){ /* best-effort - worst case it re-shows next visit */ }
      notice.seen = true;
    };
  }

  // =====================================================================
  // ✅ ADDED: AC RALLY KNOCKOUT EVENTS - driver-facing (Available Races)
  // Separate self-service system from the SimGrid roster above - drivers
  // sign themselves up, and once staff lock the field, submit their own
  // stage times with a proof screenshot each round. Rendered into its own
  // #acRallyDriverBoard container so it survives renderAvailableRaces()
  // re-rendering the SimGrid list underneath it.
  // =====================================================================

  function acRallyFmtTime(seconds){
    if(seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
  }
  function acRallyParseTime(str){
    const s = String(str || '').trim();
    if(!s) return NaN;
    if(s.includes(':')){
      const parts = s.split(':');
      const m = Number(parts[0]), sec = Number(parts[1]);
      if(!Number.isFinite(m) || !Number.isFinite(sec)) return NaN;
      return m * 60 + sec;
    }
    return Number(s);
  }
  // ✅ CHANGED: was acRallyIsPow2 and required an exact power of two (4/8/
  // 16/32...) before Lock In would enable - the backend no longer requires
  // that (see ifwlAcRallyIsValidFieldSize/ifwlAcRallyBuildRounds in
  // rtgate.js), it just needs at least 4 entrants and floor-halves each
  // round down to a clean single-champion Final regardless of starting
  // count. Kept as its own named check (not just an inline `>= 4`) so the
  // one place this rule lives is easy to find/change again later.
  function acRallyCanLockIn(n){
    return Number.isInteger(n) && n >= 4;
  }
  // ✅ ADDED: client-side mirror of ifwlAcRallyBuildRounds/
  // ifwlAcRallyRoundLabel in rtgate.js (labels + round count only, no stage
  // data) - lets the Staff AC Rally Events panel show "which rounds will
  // this bracket have" the moment a valid entrant count is reached, so
  // staff can set a Times Required By deadline for every round BEFORE
  // locking in, instead of finding out the shape of the bracket only after.
  // Keep this in sync with the backend function if that logic ever changes.
  function acRallyPreviewRounds(bracketSize){
    const label = (startCount) => {
      if(startCount <= 4) return 'Final';
      if(startCount === 8) return 'Semi Final';
      if(startCount === 16) return 'Quarter Final';
      if(startCount === 32) return 'Round of 32';
      return `Round of ${startCount}`;
    };
    const rounds = [];
    let count = bracketSize;
    let roundIndex = 0;
    while(count > 4){
      rounds.push({ roundIndex, name: label(count) });
      count = Math.floor(count / 2);
      roundIndex++;
    }
    rounds.push({ roundIndex, name: 'Final' });
    return rounds;
  }
  // ✅ FIXED: exposed on window, same "bridged" pattern as every other
  // cross-<script>-block helper on this page (see ifwlPointsBandClass) -
  // the Staff AC Rally Events panel lives in a later script block and
  // needs these same formatters.
  window.acRallyFmtTime = acRallyFmtTime;
  window.acRallyParseTime = acRallyParseTime;
  window.acRallyCanLockIn = acRallyCanLockIn;
  window.acRallyPreviewRounds = acRallyPreviewRounds;

  // ✅ ADDED: shared result-card renderer for AC Rally results - used by
  // both the driver-facing AC Rally Results page (this block) and the
  // Staff AC Rally Events panel (a later script block, via the window
  // bridge below). Replaces the old plain <table> of stage times with a
  // driver-directory-style card per driver (reuses .dir-card /
  // .race-pos-badge from the Driver Directory elsewhere on the site) so
  // results read as part of the site rather than a bolted-on data table.
  function acRallyStatusInfo(r){
    if(r.dq) return { key: 'dq', label: 'Disqualified' };
    if(r.advanced === true) return { key: 'advanced', label: 'Advanced' };
    if(r.advanced === false) return { key: 'eliminated', label: 'Eliminated' };
    if(r.complete) return { key: 'ready', label: 'Ready' };
    return { key: 'waiting', label: 'Waiting' };
  }
  function acRallyRankBadge(r){
    if(r.dq) return { label: 'DQ', cls: '' };
    if(!r.rank) return { label: '-', cls: '' };
    const cls = r.rank === 1 ? ' race-pos-gold' : r.rank === 2 ? ' race-pos-silver' : r.rank === 3 ? ' race-pos-bronze' : '';
    return { label: 'P' + r.rank, cls };
  }
  // dirEntry (optional) is a row from fetchDirectory()/licenceDirectory,
  // matched by discordId === r.id - the SAME avatar/header/team-logo/
  // tier-pill fields the Driver Directory and "Drivers to Watch" cards
  // use (see eventRosterCardHtml above for the identical pattern). With
  // no match (driver removed, directory fetch failed, etc.) the card
  // still renders fine, just without the photo/team/tier chrome.
  function acRallyResultCardHtml(r, stages, extraHtml, dirEntry){
    const status = acRallyStatusInfo(r);
    const posBadge = acRallyRankBadge(r);
    const thumb = dirEntry?.avatarMode === 'upload' && dirEntry?.photoUploadUrl ? dirEntry.photoUploadUrl
                : dirEntry?.avatarMode === 'url' && dirEntry?.avatarUrl ? dirEntry.avatarUrl
                : '';
    const avatarCell = thumb ? `<div class="dir-card-avatar"><img src="${thumb}" alt=""></div>` : `<div class="dir-card-avatar-empty"></div>`;
    const hasHeader = !!dirEntry?.headerUploadUrl;
    const bgStyle = hasHeader ? ` style="background-image:url('${dirEntry.headerUploadUrl}')"` : '';
    const outlineClass = dirEntry?.patreonOutlineTier ? ` dir-card-${dirEntry.patreonOutlineTier}`
      : (!r.dq && r.rank === 1 ? ' dir-card-gold' : !r.dq && r.rank === 2 ? ' dir-card-silver' : !r.dq && r.rank === 3 ? ' dir-card-bronze' : '');
    const platformTag = dirEntry?.platform === 'pc' ? '<span class="platform-tag plat-pc">PC</span>'
      : dirEntry?.platform === 'console' ? '<span class="platform-tag plat-console">Console</span>'
      : dirEntry?.platform === 'both' ? '<span class="platform-tag plat-both">PC + Console</span>' : '';
    const tier = dirEntry ? findTier(dirEntry.tier || 'No Licence') : null;
    const tierPill = tier ? `<span class="tier-pill" style="background:${hexToRgba(tier.color,0.18)};color:${tier.color};border:1px solid ${hexToRgba(tier.color,0.4)}">${dirEntry.tier || 'No Licence'}</span>` : '';
    const stageStats = (stages||[]).map((s,i) => `<div class="mini-stat"><span>${(s.name||'Stage '+(i+1)).replace(/</g,'&lt;')}</span><strong>${acRallyFmtTime(r.stageTimes?.[i])}</strong></div>`).join('');
    return `<div class="cw-card acr-card${r.dq ? ' acr-card-dq' : ''}" data-driver="${r.id||''}">
      <div class="dir-card${hasHeader ? ' has-header' : ''}${outlineClass}"${bgStyle}>
        ${platformTag}
        <span class="race-pos-badge${posBadge.cls}" style="left:10px;right:auto">${posBadge.label}</span>
        ${dirEntry?.teamLogoUrl ? `<img class="dir-card-team-logo" src="${dirEntry.teamLogoUrl}" alt="${dirEntry.teamName||'Team'}" title="${dirEntry.teamName||''}">` : ''}
        <div class="dir-card-overlay">
          ${avatarCell}
          <div class="dir-card-info">
            <strong>${(r.name||'Unnamed driver').replace(/</g,'&lt;')}</strong>
            <span class="mono">${r.licenceNumber||'-'}</span>
            ${tierPill}
          </div>
        </div>
      </div>
      <div class="acr-stat-footer">
        <span class="acr-status-pill acr-status-${status.key}">${status.label}</span>
        <div class="mini-stats acr-stage-grid">
          ${stageStats}
          <div class="mini-stat acr-combined"><span>Combined</span><strong>${acRallyFmtTime(r.combinedSeconds)}</strong></div>
        </div>
        ${extraHtml || ''}
      </div>
    </div>`;
  }
  window.acRallyStatusInfo = acRallyStatusInfo;
  window.acRallyRankBadge = acRallyRankBadge;
  window.acRallyResultCardHtml = acRallyResultCardHtml;
  // ✅ ADDED: bridged so the staff AC Rally panel (later script block) can
  // look up avatar/header/team/tier data for its own result cards too -
  // same function the driver-facing results page already uses.
  window.fetchDirectory = fetchDirectory;

  async function fetchAcRallyBoard(){
    return (await apiGet('acRallyBoard')).events || [];
  }
  async function acRallySignUp(eventId){
    return apiPost('acRallySignup', { eventId });
  }
  async function acRallyWithdrawFrom(eventId){
    return apiPost('acRallyWithdraw', { eventId });
  }
  async function acRallySubmitStageTime(eventId, roundIndex, stageIndex, claimedSeconds, imageUrl, imagePath){
    return apiPost('acRallySubmitTime', { eventId, roundIndex, stageIndex, claimedSeconds, imageUrl, imagePath });
  }

  function acRallyFmtSchedule(ms){
    if(!ms) return '';
    return new Date(ms).toLocaleString([], {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
  }
  window.acRallyFmtSchedule = acRallyFmtSchedule;

  // ms epoch -> value for an <input type="datetime-local"> (local time,
  // "YYYY-MM-DDTHH:mm"), accounting for timezone offset since
  // toISOString() is always UTC.
  function acRallyMsToDatetimeLocal(ms){
    if(!ms) return '';
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }
  window.acRallyMsToDatetimeLocal = acRallyMsToDatetimeLocal;

  function acRallyBracketSummaryHtml(ev){
    return `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;color:var(--ifwl-teal)">View bracket</summary>` +
      ev.rounds.map(r => {
        if(r.status === 'pending') return `<div class="field-hint" style="margin-top:6px">${r.name}: not started yet${r.scheduledAtMs ? ` &middot; 📅 ${acRallyFmtSchedule(r.scheduledAtMs)}` : ''}</div>`;
        const ranked = (r.drivers || []).map(id => ({ id, ...(r.results[id] || {}) })).sort((a,b) => (a.rank||999) - (b.rank||999));
        return `<div style="margin-top:8px"><strong style="font-size:12px">${r.name}</strong>
          <table class="mono" style="width:100%;font-size:11.5px;margin-top:4px"><tbody>
          ${ranked.map(d => `<tr><td>${d.rank||'-'}</td><td>${d.name}</td><td>${acRallyFmtTime(d.combinedSeconds)}</td><td>${d.advanced===true?'Advanced':d.advanced===false?'Eliminated':''}</td></tr>`).join('')}
          </tbody></table></div>`;
      }).join('') + `</details>`;
  }

  function acRallyMySubmitFormHtml(ev, round, myId){
    const myResult = (round.results || {})[myId] || {};
    const myStageTimes = myResult.stageTimes || {};
    const mySubs = round.mySubmissions || [];

    return (round.stages || []).map((stage, i) => {
      const verifiedTime = myStageTimes[i];
      const pendingSub = mySubs.find(s => s.stageIndex === i && s.status === 'pending');
      const refusedSub = [...mySubs].reverse().find(s => s.stageIndex === i && s.status === 'refused');

      if(verifiedTime !== undefined){
        return `<div class="note-item" style="margin-top:6px">${stage.name}: <strong>${acRallyFmtTime(verifiedTime)}</strong> &check; Verified</div>`;
      }
      if(pendingSub){
        return `<div class="note-item" style="margin-top:6px">${stage.name}: ${acRallyFmtTime(pendingSub.claimedSeconds)} - awaiting review</div>`;
      }
      return `<div class="note-item" style="margin-top:6px">
        <div>${stage.name}${stage.track ? ' &middot; ' + stage.track : ''}${stage.weather ? ' &middot; ' + stage.weather : ''}${stage.assists ? ' &middot; ' + stage.assists : ''}</div>
        ${refusedSub ? `<div class="field-hint" style="color:var(--ifwl-red)">Refused: ${refusedSub.refusalReason} - please resubmit.</div>` : ''}
        <input type="text" placeholder="Time (mm:ss.mmm)" data-ac-rally-time="${ev.id}:${round.roundIndex}:${i}" style="margin-top:6px;width:140px">
        <input type="file" accept="image/jpeg,image/png" data-ac-rally-file="${ev.id}:${round.roundIndex}:${i}" style="margin-top:6px;display:block">
        <button class="btn ghost" data-ac-rally-submit="${ev.id}:${round.roundIndex}:${i}" type="button" style="margin-top:6px">Submit Time</button>
      </div>`;
    }).join('');
  }

  const acRallyImgPlaceholder = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="68"><rect width="120" height="68" fill="#1a2027"/></svg>');
  window.acRallyImgPlaceholder = acRallyImgPlaceholder;

  function acRallyStatusBadgeHtml(ev){
    if(ev.status === 'signup') return `<span class="platform-badge">Signup Open</span>`;
    if(ev.status === 'completed') return `<span class="platform-badge" style="background:rgba(212,175,55,.18);color:#d4af37">Completed</span>`;
    return `<span class="platform-badge">In Progress</span>`;
  }

  // ✅ ADDED: "Times Required By" full schedule - every round's deadline is
  // now set the moment staff Lock In (see the Staff AC Rally Events panel),
  // so this can show a driver the WHOLE event's timeline up front, not just
  // whatever round they're currently in - the AC Rally Beta 01 test event's
  // problem was drivers only ever finding out a deadline (if at all) once
  // their round had already opened.
  function acRallyFullScheduleHtml(ev){
    if(!ev.rounds || !ev.rounds.length) return '';
    return `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--ifwl-teal)">Times Required By - full schedule</summary>` +
      `<table class="mono" style="width:100%;font-size:11.5px;margin-top:6px"><tbody>` +
      ev.rounds.map(r => `<tr><td>${r.name}</td><td>${r.scheduledAtMs ? acRallyFmtSchedule(r.scheduledAtMs) : 'TBC'}</td></tr>`).join('') +
      `</tbody></table></details>`;
  }

  function acRallyDriverCardHtml(ev){
    const myId = window.IFWL_AUTH?.userId(window.IFWL_META);
    let body = '';

    if(ev.status === 'signup'){
      body = `<div class="note-meta">${ev.entrantCount} signed up so far</div>
        <button class="btn ${ev.isSignedUp ? 'ghost' : 'purple'}" data-ac-rally-signup="${ev.id}" data-signed-up="${ev.isSignedUp}" type="button" style="margin-top:8px">${ev.isSignedUp ? 'Withdraw' : 'Sign Up'}</button>`;
    } else {
      const currentRound = ev.rounds[ev.currentRoundIndex];
      const iAmIn = currentRound && (currentRound.drivers || []).includes(myId);
      // ✅ CHANGED: was a plain "📅 <round>: <date>" heads-up - now reads as
      // an explicit deadline, and turns red/⚠️ once it's passed so an
      // overdue driver can't miss it either.
      const deadlineMs = currentRound?.scheduledAtMs || null;
      const isOverdue = !!(deadlineMs && Date.now() > deadlineMs);
      const scheduleLine = deadlineMs
        ? `<p style="color:${isOverdue ? 'var(--ifwl-red)' : 'var(--ifwl-teal)'};font-size:12.5px;margin:4px 0 0;font-weight:700">${isOverdue ? '⚠️' : '⏰'} ${currentRound.name} times required by: ${acRallyFmtSchedule(deadlineMs)}${isOverdue ? ' - overdue' : ''}</p>` : '';
      if(ev.status === 'completed'){
        body = `<div class="note-meta">&#127942; Champion: ${ev.championName || '-'}</div>`;
      } else if(iAmIn){
        body = scheduleLine + `<div class="note-meta">You're in: ${currentRound.name}</div>` + acRallyMySubmitFormHtml(ev, currentRound, myId);
      } else if(ev.isSignedUp){
        body = `<div class="note-meta">You've been eliminated - thanks for racing!</div>`;
      } else {
        body = scheduleLine + `<div class="note-meta">In progress - ${currentRound?.name || ''}</div>`;
      }
      body += acRallyFullScheduleHtml(ev) + acRallyBracketSummaryHtml(ev);
    }

    return `<div class="race-event-card">
      <img src="${ev.imageUrl || acRallyImgPlaceholder}" alt="">
      <div>
        ${acRallyStatusBadgeHtml(ev)}
        <strong style="display:block;margin-top:6px">${ev.title}</strong>
        ${ev.description ? `<p style="color:var(--text-muted);font-size:12.5px;margin:4px 0 0">${ev.description}</p>` : ''}
        ${body}
      </div>
    </div>`;
  }

  function wireAcRallyDriverBoardHandlers(){
    document.querySelectorAll('[data-ac-rally-signup]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const eventId = btn.dataset.acRallySignup;
        const isSignedUp = btn.dataset.signedUp === 'true';
        btn.disabled = true;
        try{
          if(isSignedUp) await acRallyWithdrawFrom(eventId);
          else await acRallySignUp(eventId);
          await renderAcRallyDriverBoard();
        }catch(e){ alert('Could not update signup: ' + e.message); btn.disabled = false; }
      });
    });

    document.querySelectorAll('[data-ac-rally-submit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const [eventId, roundIndex, stageIndex] = btn.dataset.acRallySubmit.split(':');
        const timeInput = document.querySelector(`[data-ac-rally-time="${eventId}:${roundIndex}:${stageIndex}"]`);
        const fileInput = document.querySelector(`[data-ac-rally-file="${eventId}:${roundIndex}:${stageIndex}"]`);
        const seconds = acRallyParseTime(timeInput.value);
        if(!Number.isFinite(seconds) || seconds <= 0){ alert('Enter a valid time, e.g. 3:45.120'); return; }
        const file = fileInput.files[0];
        if(!file){ alert('A screenshot is required as proof.'); return; }

        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = 'Uploading...';
        try{
          const uploaded = await window.IFWL_UploadAPI.uploadLicenceImage(file, 'acRallyProof');
          await acRallySubmitStageTime(eventId, Number(roundIndex), Number(stageIndex), seconds, uploaded.url, uploaded.path);
          await renderAcRallyDriverBoard();
        }catch(e){
          alert('Could not submit: ' + e.message);
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      });
    });
  }

  async function renderAcRallyDriverBoard(){
    const wrap = q('acRallyDriverBoard');
    if(!wrap) return;
    let events;
    try{ events = await fetchAcRallyBoard(); }
    catch(e){ return; } // fails silently - a bonus section, not core to the page
    // ✅ FIXED: once an event is finalised (champion crowned) it should move
    // over to Racing > AC Rally Results instead of lingering under Available
    // Races forever - completed events already have their own home there.
    const activeEvents = events.filter((ev) => ev.status !== 'completed');
    racesCalAcr = activeEvents; renderRacesCalendar();
    if(!activeEvents.length){ wrap.innerHTML = ''; return; }

    wrap.innerHTML = `<h4 style="margin:14px 0 8px">AC Rally Knockout</h4>` + activeEvents.map(acRallyDriverCardHtml).join('');
    wireAcRallyDriverBoardHandlers();
  }
  window.renderAcRallyDriverBoard = renderAcRallyDriverBoard;

  // ✅ ADDED: AC Rally Results (Racing > AC Rally Results) - a separate
  // list/detail view from ACC's Race Results, deliberately not merged into
  // it, so the two formats/communities don't compete for the same space.
  // Reads the same acRallyBoard feed Available Races already uses - no new
  // backend endpoint. Only events past signup (in_progress/completed) show
  // here, since a signup-only event has no stages/results yet.
  let acRallyResultsCache = [];

  function acRallyResultRoundHtml(round, dirMap){
    const stages = round.stages || [];
    const drivers = round.drivers || [];
    const results = round.results || {};
    const ranked = drivers.map(id => ({ id, ...(results[id]||{}) })).sort((a,b) => (a.rank||999) - (b.rank||999));
    // ✅ ADDED: a disqualified driver is removed from round.drivers (so
    // they're excluded from ranking/advancement) but their result entry
    // stays behind marked dq:true - surface those separately rather than
    // just letting them disappear from the results page.
    const dqRows = Object.keys(results).filter(id => results[id]?.dq && !drivers.includes(id)).map(id => ({ id, ...results[id] }));
    const roundBadge = round.status === 'completed' ? '<span class="badge purple">Completed</span>' : round.status === 'open' ? '<span class="badge teal">Open</span>' : '<span class="badge">Pending</span>';

    const isOverdueRound = !!(round.scheduledAtMs && round.status === 'open' && Date.now() > round.scheduledAtMs);
    let html = `<div class="note-item" style="margin-top:14px">
      <strong>${round.name}</strong> ${roundBadge}
      ${round.scheduledAtMs ? `<div class="field-hint" style="margin-top:4px${isOverdueRound ? ';color:var(--ifwl-red)' : ''}">${isOverdueRound ? '⚠️' : '⏰'} Times required by: ${acRallyFmtSchedule(round.scheduledAtMs)}${isOverdueRound ? ' - overdue' : ''}</div>` : ''}`;

    if(stages.length){
      html += `<div class="field-hint" style="margin-top:8px">${stages.map((s,i) => `${s.name||'Stage '+(i+1)}${s.track?' &middot; '+s.track:''}${s.weather?' &middot; '+s.weather:''}${s.assists?' &middot; '+s.assists:''}`).join('<br>')}</div>`;
    }

    if(drivers.length){
      html += `<div class="acr-grid">${ranked.map(r => acRallyResultCardHtml(r, stages, null, dirMap?.get(r.id))).join('')}</div>`;
    } else {
      html += `<div class="field-hint" style="margin-top:8px">Not started yet.</div>`;
    }

    if(dqRows.length){
      html += `<h5 class="acr-dq-heading">Disqualified</h5><div class="acr-grid">${dqRows.map(r => acRallyResultCardHtml(r, stages, null, dirMap?.get(r.id))).join('')}</div>`;
    }

    html += `</div>`;
    return html;
  }

  async function loadAcRallyResultDetail(ev){
    const wrap = q('acRallyResultsDetailWrap');
    if(!wrap) return;
    wrap.classList.remove('hidden');
    wrap.scrollIntoView({behavior:'smooth', block:'start'});
    wrap.innerHTML = `
      <button class="btn ghost" id="backToAcRallyResultsBtn" type="button" style="margin:16px 18px">&larr; Back to AC Rally results</button>
      <div class="race-event-card" style="margin:0 18px 14px">
        <img src="${ev.imageUrl || acRallyImgPlaceholder}" alt="">
        <div>
          ${acRallyStatusBadgeHtml(ev)}
          <strong style="display:block;margin-top:6px">${ev.title}</strong>
          ${ev.description ? `<p style="color:var(--text-muted);font-size:12.5px;margin:4px 0 0">${ev.description}</p>` : ''}
          ${ev.status === 'completed' ? `<div class="note-meta" style="margin-top:6px">&#127942; Champion: ${ev.championName || '-'}</div>` : ''}
        </div>
      </div>
      <div id="acRallyResultRoundsWrap" style="padding:0 18px 18px"><div class="empty">Loading driver details&hellip;</div></div>
    `;
    // ✅ ADDED: pull the shared Driver Directory list (avatars, header
    // images, team logos, tiers) once for this event, matched to each
    // result row by discordId, so result cards look exactly like the
    // Driver Directory instead of plain text - see acRallyResultCardHtml.
    let dirMap = null;
    try{
      const directory = await fetchDirectory();
      dirMap = new Map(directory.map(d => [d.discordId, d]));
    }catch(e){ console.warn('Could not load directory data for AC Rally results', e); }
    const roundsWrap = q('acRallyResultRoundsWrap');
    if(roundsWrap) roundsWrap.innerHTML = (ev.rounds||[]).map(round => acRallyResultRoundHtml(round, dirMap)).join('');
    q('backToAcRallyResultsBtn').addEventListener('click', () => {
      wrap.classList.add('hidden');
      wrap.innerHTML = '';
      q('acRallyResultsBody').scrollIntoView({behavior:'smooth', block:'start'});
    });
  }

  function renderAcRallyResultsList(){
    const body = q('acRallyResultsBody');
    if(!body) return;
    if(!acRallyResultsCache.length){ body.innerHTML = '<div class="empty">No AC Rally events have started yet - check back once one is locked in.</div>'; return; }
    body.innerHTML = acRallyResultsCache.map((ev, i) => {
      const statusLabel = ev.status === 'completed' ? `&#127942; Champion: ${ev.championName || '-'}` : `In progress - ${(ev.rounds||[])[ev.currentRoundIndex]?.name || ''}`;
      return `<div class="claim-row">
        <div>
          <div class="claim-name">${ev.title}</div>
          <div class="claim-meta">${statusLabel} &middot; ${ev.entrantCount} driver(s)</div>
        </div>
        <button class="btn purple" data-view-ac-rally-result="${i}">View Results</button>
      </div>`;
    }).join('');
    body.querySelectorAll('[data-view-ac-rally-result]').forEach(btn => btn.addEventListener('click', () => {
      loadAcRallyResultDetail(acRallyResultsCache[Number(btn.dataset.viewAcRallyResult)]);
    }));
  }

  async function renderAcRallyResultsPanel(){
    const body = q('acRallyResultsBody');
    if(!body) return;
    body.innerHTML = '<div class="empty">Loading events&hellip;</div>';
    try{
      const events = await fetchAcRallyBoard();
      acRallyResultsCache = events.filter(ev => ev.status !== 'signup');
    }catch(e){
      body.innerHTML = `<div class="empty">Could not load AC Rally results: ${e.message}</div>`;
      return;
    }
    renderAcRallyResultsList();
  }
  window.renderAcRallyResultsPanel = renderAcRallyResultsPanel;

  // =====================================================================
  // ✅ ADDED: RL 3v3 KNOCKOUT EVENTS - driver-facing (Available Races)
  // Same self-service pattern as AC Rally above, but drivers sign up SOLO
  // and get auto-placed into a squad of 3 once staff Lock In - a standard
  // head-to-head single-elimination bracket (rounds[i].matches[], not a
  // ranked field), since Rocket League results are decided match-by-match
  // (win/loss of a series), not a combined time. Squads are fixed for the
  // whole event once formed at Lock In - only which squads are still alive
  // changes round to round. Rendered into its own #rlDriverBoard container
  // so it survives renderAvailableRaces() re-rendering the SimGrid list
  // underneath it.
  // =====================================================================

  async function fetchRlBoard(){
    return (await apiGet('rlBoard')).events || [];
  }
  async function rlSignUp(eventId){
    return apiPost('rlSignup', { eventId });
  }
  async function rlWithdrawFrom(eventId){
    return apiPost('rlWithdraw', { eventId });
  }
  async function rlSubmitMatchScore(eventId, roundIndex, matchIndex, scoreA, scoreB, imageUrl, imagePath){
    return apiPost('rlSubmitMatchScore', { eventId, roundIndex, matchIndex, scoreA, scoreB, imageUrl, imagePath });
  }

  // Client-side mirror of the server's ifwlRlIsValidEntrantCount (rtgate.js)
  // - squads of exactly 3, and the squad count itself has to be a power of
  // two (no byes, same convention as AC Rally's field-size rule extended to
  // squads instead of individual drivers). Used by the staff Lock In button
  // to enable/disable itself without a round trip.
  function rlIsValidEntrantCount(n){
    if(!Number.isInteger(n) || n <= 0 || n % 3 !== 0) return false;
    const squadCount = n / 3;
    return squadCount >= 2 && (squadCount & (squadCount - 1)) === 0;
  }
  window.rlIsValidEntrantCount = rlIsValidEntrantCount;

  function rlFindMySquad(ev){
    // rlBoard (the driver-facing feed) hands back mySquadId directly - it
    // doesn't include per-driver driverIds on each squad (only driverNames),
    // since that feed is intentionally stripped down for public display.
    if(!ev.mySquadId) return null;
    return (ev.squads || []).find(sq => sq.id === ev.mySquadId) || null;
  }
  window.rlFindMySquad = rlFindMySquad;

  function rlSquadNameById(ev, squadId){
    const sq = (ev.squads || []).find(s => s.id === squadId);
    return sq ? sq.name : 'TBD';
  }
  window.rlSquadNameById = rlSquadNameById;

  // scoreA/scoreB on a match are ALWAYS relative to the match's fixed
  // squadAId/squadBId slots, never "my score vs their score" - this figures
  // out which slot my squad occupies so the submit handler can map the
  // driver-facing "your squad's score" / "opponent's score" inputs into the
  // correct backend fields.
  function rlMatchOpponentAndSlot(match, mySquadId){
    if(match.squadAId === mySquadId) return { mySlot: 'A', opponentId: match.squadBId };
    if(match.squadBId === mySquadId) return { mySlot: 'B', opponentId: match.squadAId };
    return null;
  }

  function rlIsSquadEliminated(ev, squadId){
    return (ev.rounds || []).some(r => (r.matches || []).some(m => m.status === 'completed' && (m.squadAId === squadId || m.squadBId === squadId) && m.winnerSquadId && m.winnerSquadId !== squadId));
  }

  function rlBracketSummaryHtml(ev){
    return `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;color:var(--ifwl-teal)">View bracket</summary>` +
      (ev.rounds || []).map(r => {
        if(r.status === 'pending') return `<div class="field-hint" style="margin-top:6px">${r.name}: not started yet${r.scheduledAtMs ? ` &middot; 📅 ${acRallyFmtSchedule(r.scheduledAtMs)}` : ''}</div>`;
        return `<div style="margin-top:8px"><strong style="font-size:12px">${r.name} (Bo${r.bestOf})</strong>
          <table class="mono" style="width:100%;font-size:11.5px;margin-top:4px"><tbody>
          ${(r.matches || []).map(m => `<tr><td>${rlSquadNameById(ev, m.squadAId)}</td><td>${m.finalScoreA ?? '-'} - ${m.finalScoreB ?? '-'}</td><td>${rlSquadNameById(ev, m.squadBId)}</td><td>${m.status === 'completed' ? (m.winnerSquadId === m.squadAId ? 'A won' : 'B won') : m.status}</td></tr>`).join('')}
          </tbody></table></div>`;
      }).join('') + `</details>`;
  }

  function rlMySubmitFormHtml(ev, round, match, mySquadId){
    const mySubs = match.mySubmissions || [];
    const pendingSub = mySubs.find(s => s.status === 'pending');
    const refusedSub = [...mySubs].reverse().find(s => s.status === 'refused');
    const slot = rlMatchOpponentAndSlot(match, mySquadId);
    const opponentName = slot && slot.opponentId ? rlSquadNameById(ev, slot.opponentId) : 'TBD';

    if(match.status === 'completed'){
      const iWon = match.winnerSquadId === mySquadId;
      return `<div class="note-item" style="margin-top:6px">vs ${opponentName}: <strong>${match.finalScoreA} - ${match.finalScoreB}</strong> ${iWon ? '&check; Won' : '&times; Lost'}</div>`;
    }
    if(pendingSub){
      return `<div class="note-item" style="margin-top:6px">vs ${opponentName} (Bo${round.bestOf}): submitted ${pendingSub.scoreA} - ${pendingSub.scoreB} - awaiting review</div>`;
    }
    if(!slot || !slot.opponentId){
      return `<div class="note-item" style="margin-top:6px">Waiting on opponent to be decided.</div>`;
    }
    return `<div class="note-item" style="margin-top:6px">
      <div>vs ${opponentName} (Best of ${round.bestOf})</div>
      ${refusedSub ? `<div class="field-hint" style="color:var(--ifwl-red)">Refused: ${refusedSub.refusalReason} - please resubmit.</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:6px;align-items:center">
        <input type="number" min="0" step="1" placeholder="Your squad's score" data-rl-score-a="${ev.id}:${round.roundIndex}:${match.matchIndex}" style="width:110px">
        <span>-</span>
        <input type="number" min="0" step="1" placeholder="Opponent score" data-rl-score-b="${ev.id}:${round.roundIndex}:${match.matchIndex}" style="width:110px">
      </div>
      <input type="file" accept="image/jpeg,image/png" data-rl-file="${ev.id}:${round.roundIndex}:${match.matchIndex}" style="margin-top:6px;display:block">
      <button class="btn ghost" data-rl-submit="${ev.id}:${round.roundIndex}:${match.matchIndex}" data-rl-my-slot="${slot.mySlot}" type="button" style="margin-top:6px">Submit Score</button>
    </div>`;
  }

  const rlImgPlaceholder = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="68"><rect width="120" height="68" fill="#1a2027"/></svg>');
  window.rlImgPlaceholder = rlImgPlaceholder;

  function rlStatusBadgeHtml(ev){
    if(ev.status === 'signup') return `<span class="platform-badge">Signup Open</span>`;
    if(ev.status === 'completed') return `<span class="platform-badge" style="background:rgba(212,175,55,.18);color:#d4af37">Completed</span>`;
    return `<span class="platform-badge">In Progress</span>`;
  }

  function rlDriverCardHtml(ev){
    let body = '';

    if(ev.status === 'signup'){
      body = `<div class="note-meta">${ev.entrantCount} signed up so far (squads of 3)</div>
        <button class="btn ${ev.isSignedUp ? 'ghost' : 'purple'}" data-rl-signup="${ev.id}" data-signed-up="${ev.isSignedUp}" type="button" style="margin-top:8px">${ev.isSignedUp ? 'Withdraw' : 'Sign Up'}</button>`;
    } else {
      const mySquad = rlFindMySquad(ev);
      const currentRound = (ev.rounds || [])[ev.currentRoundIndex];
      const myMatch = mySquad && currentRound ? (currentRound.matches || []).find(m => m.squadAId === mySquad.id || m.squadBId === mySquad.id) : null;
      const scheduleLine = currentRound?.scheduledAtMs
        ? `<p style="color:var(--ifwl-teal);font-size:12.5px;margin:4px 0 0;font-weight:700">📅 ${currentRound.name}: ${acRallyFmtSchedule(currentRound.scheduledAtMs)}</p>` : '';

      if(ev.status === 'completed'){
        body = `<div class="note-meta">&#127942; Champion: ${ev.championSquadName || '-'}</div>`;
      } else if(mySquad){
        const teammates = (mySquad.driverNames || []).join(', ');
        body = `<div class="note-meta">Your squad: <strong>${mySquad.name}</strong> (${teammates})</div>`;
        if(myMatch){
          body += scheduleLine + `<div class="note-meta">${currentRound.name}</div>` + rlMySubmitFormHtml(ev, currentRound, myMatch, mySquad.id);
        } else if(rlIsSquadEliminated(ev, mySquad.id)){
          body += `<div class="note-meta">Your squad has been eliminated - thanks for racing!</div>`;
        } else {
          body += scheduleLine + `<div class="note-meta">Waiting on this round's bracket to be decided.</div>`;
        }
      } else if(ev.isSignedUp){
        body = `<div class="note-meta">Squads not yet formed.</div>`;
      } else {
        body = scheduleLine + `<div class="note-meta">In progress - ${currentRound?.name || ''}</div>`;
      }
      body += rlBracketSummaryHtml(ev);
    }

    // ✅ ADDED: the event's own "race night" date/time - shown up top,
    // always, regardless of status. This is the one evening the whole
    // bracket plays out across, so it's the thing a driver needs to see
    // BEFORE deciding to sign up, not just after squads are formed (that's
    // what the per-round schedule line inside the branches above is for).
    const eventScheduleLine = ev.scheduledAtMs
      ? `<p style="color:var(--ifwl-teal);font-size:12.5px;margin:4px 0 0;font-weight:700">🏁 Race night: ${acRallyFmtSchedule(ev.scheduledAtMs)}</p>`
      : (ev.status === 'signup' ? `<p style="color:var(--text-muted);font-size:12.5px;margin:4px 0 0">Date/time not yet announced - check back soon.</p>` : '');

    return `<div class="race-event-card">
      <img src="${ev.imageUrl || rlImgPlaceholder}" alt="">
      <div>
        ${rlStatusBadgeHtml(ev)}
        <strong style="display:block;margin-top:6px">${ev.title}</strong>
        ${eventScheduleLine}
        ${ev.description ? `<p style="color:var(--text-muted);font-size:12.5px;margin:4px 0 0">${ev.description}</p>` : ''}
        ${body}
      </div>
    </div>`;
  }

  function wireRlDriverBoardHandlers(){
    document.querySelectorAll('[data-rl-signup]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const eventId = btn.dataset.rlSignup;
        const isSignedUp = btn.dataset.signedUp === 'true';
        btn.disabled = true;
        try{
          if(isSignedUp) await rlWithdrawFrom(eventId);
          else await rlSignUp(eventId);
          await renderRlDriverBoard();
        }catch(e){ alert('Could not update signup: ' + e.message); btn.disabled = false; }
      });
    });

    document.querySelectorAll('[data-rl-submit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const [eventId, roundIndex, matchIndex] = btn.dataset.rlSubmit.split(':');
        const mySlot = btn.dataset.rlMySlot;
        const aInput = document.querySelector(`[data-rl-score-a="${eventId}:${roundIndex}:${matchIndex}"]`);
        const bInput = document.querySelector(`[data-rl-score-b="${eventId}:${roundIndex}:${matchIndex}"]`);
        const fileInput = document.querySelector(`[data-rl-file="${eventId}:${roundIndex}:${matchIndex}"]`);
        const myScore = Number(aInput.value);
        const opponentScore = Number(bInput.value);
        if(!Number.isFinite(myScore) || myScore < 0 || !Number.isFinite(opponentScore) || opponentScore < 0){ alert('Enter both scores.'); return; }
        if(myScore === opponentScore){ alert("Scores can't be tied - a series has to have a winner."); return; }
        const file = fileInput.files[0];
        if(!file){ alert('A screenshot is required as proof.'); return; }

        // scoreA/scoreB are always relative to the match's fixed
        // squadA/squadB slots, not "mine vs theirs" - resolve which slot my
        // squad occupies before sending.
        const scoreA = mySlot === 'A' ? myScore : opponentScore;
        const scoreB = mySlot === 'A' ? opponentScore : myScore;

        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = 'Uploading...';
        try{
          const uploaded = await window.IFWL_UploadAPI.uploadLicenceImage(file, 'rlMatchProof');
          await rlSubmitMatchScore(eventId, Number(roundIndex), Number(matchIndex), scoreA, scoreB, uploaded.url, uploaded.path);
          await renderRlDriverBoard();
        }catch(e){
          alert('Could not submit: ' + e.message);
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      });
    });
  }

  async function renderRlDriverBoard(){
    const wrap = q('rlDriverBoard');
    if(!wrap) return;
    let events;
    try{ events = await fetchRlBoard(); }
    catch(e){ return; } // fails silently - a bonus section, not core to the page
    // ✅ FIXED: same as AC Rally's driver board - a finalised event moves to
    // Racing > RL 3v3 Results instead of lingering under Available Races.
    const activeEvents = events.filter((ev) => ev.status !== 'completed');
    racesCalRl = activeEvents; renderRacesCalendar();
    if(!activeEvents.length){ wrap.innerHTML = ''; return; }

    wrap.innerHTML = `<h4 style="margin:14px 0 8px">RL 3v3 Knockout</h4>` + activeEvents.map(rlDriverCardHtml).join('');
    wireRlDriverBoardHandlers();
  }
  window.renderRlDriverBoard = renderRlDriverBoard;

  // ✅ ADDED: RL 3v3 Results (Racing > RL 3v3 Results) - a separate
  // list/detail view from ACC's Race Results and AC Rally Results,
  // deliberately not merged into either, so the formats/communities don't
  // compete for the same space. Reads the same rlBoard feed Available
  // Races already uses - no new backend endpoint. Only events past signup
  // (in_progress/completed) show here, since a signup-only event has no
  // squads/matches yet.
  let rlResultsCache = [];

  function rlResultRoundHtml(ev, round){
    const matches = round.matches || [];
    const roundBadge = round.status === 'completed' ? '<span class="badge purple">Completed</span>' : round.status === 'open' ? '<span class="badge teal">Open</span>' : '<span class="badge">Pending</span>';

    let html = `<div class="note-item" style="margin-top:14px">
      <strong>${round.name}</strong> (Best of ${round.bestOf}) ${roundBadge}
      ${round.scheduledAtMs ? `<div class="field-hint" style="margin-top:4px">📅 ${acRallyFmtSchedule(round.scheduledAtMs)}</div>` : ''}`;

    if(matches.length){
      html += `<div style="overflow-x:auto;margin-top:10px"><table class="mono" style="width:100%;font-size:12.5px"><thead><tr><th>Squad A</th><th>Score</th><th>Squad B</th><th>Result</th></tr></thead><tbody>`;
      html += matches.map(m => `<tr>
        <td>${rlSquadNameById(ev, m.squadAId)}</td>
        <td>${m.finalScoreA ?? '-'} - ${m.finalScoreB ?? '-'}</td>
        <td>${rlSquadNameById(ev, m.squadBId)}</td>
        <td>${m.status === 'completed' ? (m.winnerSquadId === m.squadAId ? rlSquadNameById(ev, m.squadAId) + ' won' : rlSquadNameById(ev, m.squadBId) + ' won') : m.status === 'open' ? 'In progress' : 'Waiting'}</td>
      </tr>`).join('');
      html += `</tbody></table></div>`;
    } else {
      html += `<div class="field-hint" style="margin-top:8px">Not started yet.</div>`;
    }

    html += `</div>`;
    return html;
  }

  function rlSquadsListHtml(ev){
    if(!(ev.squads || []).length) return '';
    return `<div style="margin-top:10px"><strong style="font-size:12px">Squads</strong>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
        ${ev.squads.map(sq => `<div class="note-item" style="flex:1;min-width:160px">${sq.name}<div class="field-hint">${(sq.driverNames || []).join(', ')}</div></div>`).join('')}
      </div>
    </div>`;
  }

  function loadRlResultDetail(ev){
    const wrap = q('rlResultsDetailWrap');
    if(!wrap) return;
    wrap.classList.remove('hidden');
    wrap.scrollIntoView({behavior:'smooth', block:'start'});
    wrap.innerHTML = `
      <button class="btn ghost" id="backToRlResultsBtn" type="button" style="margin:16px 18px">&larr; Back to RL 3v3 results</button>
      <div class="race-event-card" style="margin:0 18px 14px">
        <img src="${ev.imageUrl || rlImgPlaceholder}" alt="">
        <div>
          ${rlStatusBadgeHtml(ev)}
          <strong style="display:block;margin-top:6px">${ev.title}</strong>
          ${ev.scheduledAtMs ? `<p style="color:var(--ifwl-teal);font-size:12.5px;margin:4px 0 0;font-weight:700">🏁 Race night: ${acRallyFmtSchedule(ev.scheduledAtMs)}</p>` : ''}
          ${ev.description ? `<p style="color:var(--text-muted);font-size:12.5px;margin:4px 0 0">${ev.description}</p>` : ''}
          ${ev.status === 'completed' ? `<div class="note-meta" style="margin-top:6px">&#127942; Champion: ${ev.championSquadName || '-'}</div>` : ''}
          ${rlSquadsListHtml(ev)}
        </div>
      </div>
      <div style="padding:0 18px 18px">${(ev.rounds || []).map(r => rlResultRoundHtml(ev, r)).join('')}</div>
    `;
    q('backToRlResultsBtn').addEventListener('click', () => {
      wrap.classList.add('hidden');
      wrap.innerHTML = '';
      q('rlResultsBody').scrollIntoView({behavior:'smooth', block:'start'});
    });
  }

  function renderRlResultsList(){
    const body = q('rlResultsBody');
    if(!body) return;
    if(!rlResultsCache.length){ body.innerHTML = '<div class="empty">No RL 3v3 events have started yet - check back once one is locked in.</div>'; return; }
    body.innerHTML = rlResultsCache.map((ev, i) => {
      const statusLabel = ev.status === 'completed' ? `&#127942; Champion: ${ev.championSquadName || '-'}` : `In progress - ${(ev.rounds || [])[ev.currentRoundIndex]?.name || ''}`;
      return `<div class="claim-row">
        <div>
          <div class="claim-name">${ev.title}</div>
          <div class="claim-meta">${statusLabel} &middot; ${(ev.squads || []).length} squad(s)</div>
        </div>
        <button class="btn purple" data-view-rl-result="${i}">View Results</button>
      </div>`;
    }).join('');
    body.querySelectorAll('[data-view-rl-result]').forEach(btn => btn.addEventListener('click', () => {
      loadRlResultDetail(rlResultsCache[Number(btn.dataset.viewRlResult)]);
    }));
  }

  async function renderRlResultsPanel(){
    const body = q('rlResultsBody');
    if(!body) return;
    body.innerHTML = '<div class="empty">Loading events&hellip;</div>';
    try{
      const events = await fetchRlBoard();
      rlResultsCache = events.filter(ev => ev.status !== 'signup');
    }catch(e){
      body.innerHTML = `<div class="empty">Could not load RL 3v3 results: ${e.message}</div>`;
      return;
    }
    renderRlResultsList();
  }
  window.renderRlResultsPanel = renderRlResultsPanel;

  // ✅ ADDED: Owner's Emergency Standards Clause - persistent red banner
  // (home tab, same shape as System Status) plus a one-time full briefing
  // popup per activation. Fingerprinted on enabledAtMs, not a fixed key, so
  // disabling and later re-enabling the clause (a fresh enabledAtMs) shows
  // the briefing again even to a driver who already dismissed the last one.
  function ownerClauseSeenKey(){ return 'IFWL_OWNER_CLAUSE_SEEN:' + window.IFWL_AUTH.userId(window.IFWL_META); }
  function renderOwnerClauseBanner(status){
    const banner = q('ownerClauseBanner');
    if(!banner) return;
    if(!status || !status.active){ banner.classList.add('hidden'); return; }
    const daysLeft = Math.max(1, Math.ceil((Number(status.expiresAtMs) - Date.now()) / 86400000));
    const name = status.name || 'Emergency Standards Clause';
    q('ownerClauseBannerTitle').textContent = `${name} - In Effect`;
    q('ownerClauseBannerMessage').textContent = `${status.reasonText ? status.reasonText + ' ' : ''}Drivers are being held to a higher account for the next ${daysLeft} day${daysLeft===1?'':'s'} - see the notice on login for full details. This is enforced by staff and cannot be ignored.`;
    banner.classList.remove('hidden');
  }
  async function checkOwnerClauseNotice(){
    let status;
    try{ status = await window.IFWL_OwnerClauseAPI.fetchOwnerClauseStatus(); }
    catch(e){ return; }
    renderOwnerClauseBanner(status);
    if(!status.active) return;

    const fingerprint = String(status.enabledAtMs || '');
    if(!fingerprint || localStorage.getItem(ownerClauseSeenKey()) === fingerprint) return;

    const daysLeft = Math.max(1, Math.ceil((Number(status.expiresAtMs) - Date.now()) / 86400000));
    const name = status.name || 'Emergency Standards Clause';
    q('ownerClauseModalTitle').textContent = `${name} In Effect`;
    q('ownerClauseModalText').textContent = `The ${name} is in effect for the next ${daysLeft} day${daysLeft===1?'':'s'} due to poor standards shown this season.${status.reasonText ? ' Reason: ' + status.reasonText + '.' : ''} Drivers will be held to a higher account during this period - you have ${daysLeft} day${daysLeft===1?'':'s'} to make improvements, or you may face harsh penalties, including race and season bans. This has been invoked by the League Owner, is enforceable by staff, and cannot be ignored.`;
    q('ownerClauseModal').classList.remove('hidden');
    q('ownerClauseDismissBtn').onclick = () => {
      localStorage.setItem(ownerClauseSeenKey(), fingerprint);
      q('ownerClauseModal').classList.add('hidden');
    };
  }

  // ✅ ADDED: Race Teams
  // Shared roster-management renderer used by both "My Race Team" (owner's
  // own view, gated live on Gold-or-donation-verified) and Ops "Manage All
  // Race Teams" (ops-plus always passes, regardless of the owner's own
  // Gold status - that's the ops override).
  async function renderRaceTeamManageUI(teamId, container, opts){
    opts = opts || {};
    container.innerHTML = '<div class="empty">Loading team&hellip;</div>';
    let data;
    try{
      data = await apiGet('raceTeamDetail', `&teamId=${encodeURIComponent(teamId)}`);
    }catch(e){
      container.innerHTML = `<div class="empty">Could not load team: ${e.message}</div>`;
      return;
    }
    const { team, canManage, isOwner, nameMap } = data;

    if(team.status === 'pending' && !opts.isOps){
      container.innerHTML = `<div class="notice-card">Your application for <strong>${team.teamName}</strong> is still awaiting staff approval - you'll be able to manage it in full once it's approved.</div>`;
      return;
    }

    if(!canManage){
      container.innerHTML = `
        <div class="gold-upsell-box"><div class="gold-upsell-inner">
          <div class="gold-upsell-title">🏆 Upgrade to Gold to Continue Team Management</div>
          <p>Managing <strong>${team.teamName}</strong> - roster, logo, background - needs live Gold Patreon, or a one-off donation staff have verified. Your team and its roster are safe either way; this just pauses your ability to edit it until you renew.</p>
          <a class="gold-upsell-btn" href="https://www.patreon.com/c/IFWL" target="_blank" rel="noopener">Upgrade to Gold on Patreon &rarr;</a>
        </div></div>
        ${team.logoUrl ? `<img src="${team.logoUrl}" style="width:60px;height:60px;border-radius:10px;margin-top:14px" alt="">` : ''}
      `;
      return;
    }

    const pendingRows = (team.pendingRequests||[]).map(id => `
      <div class="note-item">
        <strong>${nameMap[id] || id}</strong>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="btn teal" data-place="${id}" data-platform="pc">Place in PC</button>
          <button class="btn teal" data-place="${id}" data-platform="console">Place in Console</button>
          <button class="btn ghost" data-reject="${id}">Reject</button>
        </div>
      </div>
    `).join('') || '<div class="empty">No pending join requests.</div>';

    const rosterRow = (id) => `<div class="note-item"><strong>${nameMap[id] || id}</strong><div style="margin-top:8px"><button class="btn ghost" data-remove="${id}">Remove</button></div></div>`;
    const pcRows = (team.pcRoster||[]).map(rosterRow).join('') || '<div class="empty">No PC drivers yet.</div>';
    const consoleRows = (team.consoleRoster||[]).map(rosterRow).join('') || '<div class="empty">No Console drivers yet.</div>';

    container.innerHTML = `
      <div class="notice-card">Your logo shows with a glowing outline on your licence card and in the Driver Directory for every member of ${team.teamName} - upload something that reads clearly small.</div>

      <h4 style="margin:16px 0 10px">Team Details</h4>
      <div class="field-group"><label>Team name</label><input type="text" id="rtNameInput" value="${(team.teamName||'').replace(/"/g,'&quot;')}"></div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <label class="field-hint" style="display:block;margin-bottom:6px">Team logo</label>
          ${team.logoUrl ? `<img src="${team.logoUrl}" style="width:60px;height:60px;border-radius:10px;box-shadow:0 0 10px 2px rgba(31,214,189,.65)" alt="">` : '<div class="field-hint">None yet</div>'}
          <input type="file" id="rtLogoUpload" accept="image/png,image/jpeg,image/webp" style="display:block;margin-top:6px">
        </div>
        <div>
          <label class="field-hint" style="display:block;margin-bottom:6px">Team page background</label>
          ${team.backgroundUrl ? `<img src="${team.backgroundUrl}" style="width:120px;height:60px;object-fit:cover;border-radius:10px" alt="">` : '<div class="field-hint">None yet</div>'}
          <input type="file" id="rtBgUpload" accept="image/png,image/jpeg,image/webp" style="display:block;margin-top:6px">
        </div>
      </div>
      <button class="btn teal" id="rtSaveDetailsBtn" type="button">Save team details</button>
      <span class="save-status" id="rtSaveStatus"></span>

      ${opts.isOps ? `
      <hr style="border-color:var(--ifwl-line);margin:20px 0">
      <label style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="rtDonationVerified" style="width:auto" ${team.donationVerified ? 'checked' : ''} ${opts.isOwnerRole ? '' : 'disabled'}>
        Donation verified (permanent - Owner only)
      </label>
      ${!opts.isOwnerRole ? '<p class="field-hint">Only the site Owner role can tick this.</p>' : ''}

      <hr style="border-color:var(--ifwl-line);margin:20px 0">
      <h4 style="margin:0 0 10px">Ops-Only: Team Restrictions</h4>
      <p class="field-hint" style="margin-bottom:10px">For situations like a suspected poaching/recruitment concern - reins in a specific team without disbanding it, kicking anyone, or penalising members who had nothing to do with it.</p>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <input type="checkbox" id="rtApplicationsLocked" style="width:auto" ${team.applicationsLocked ? 'checked' : ''}>
        Applications Closed - blocks NEW join requests. Existing roster is untouched.
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <input type="checkbox" id="rtHiddenFromDirectory" style="width:auto" ${team.hiddenFromDirectory ? 'checked' : ''}>
        Hidden From Public Browse List - won't show up when browsing teams. Direct links and existing members still work as normal.
      </label>
      <div class="field-group"><label>Internal note (staff only - never shown to the team or anyone public)</label><textarea id="rtRestrictionNote" style="width:100%;min-height:60px">${(team.restrictionNote||'').replace(/</g,'&lt;')}</textarea></div>
      <button class="btn ghost" id="rtSaveRestrictionsBtn" type="button">Save restrictions</button>
      <span class="save-status" id="rtRestrictionStatus"></span>
      ` : ''}

      <hr style="border-color:var(--ifwl-line);margin:20px 0">
      <h4 style="margin:0 0 10px">Pending Join Requests</h4>
      <div id="rtPendingList">${pendingRows}</div>

      <hr style="border-color:var(--ifwl-line);margin:20px 0">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div><h4 style="margin:0 0 10px">PC Roster</h4><div id="rtPcRoster">${pcRows}</div></div>
        <div><h4 style="margin:0 0 10px">Console Roster</h4><div id="rtConsoleRoster">${consoleRows}</div></div>
      </div>

      ${opts.isOps ? `<hr style="border-color:var(--ifwl-line);margin:20px 0"><button class="btn ghost" id="rtDisbandBtn" type="button" style="color:var(--ifwl-red)">Disband this team</button>` : ''}
    `;

    container.querySelector('#rtSaveDetailsBtn').addEventListener('click', async () => {
      const status = container.querySelector('#rtSaveStatus');
      status.textContent = 'Saving...';
      try{
        const logoFile = container.querySelector('#rtLogoUpload').files[0];
        const bgFile = container.querySelector('#rtBgUpload').files[0];
        const payload = { teamId, teamName: container.querySelector('#rtNameInput').value.trim() };
        if(logoFile){
          const { url } = await uploadLicenceImage(logoFile, 'raceTeamLogo', { teamId });
          payload.logoUrl = url;
        }
        if(bgFile){
          const { url } = await uploadLicenceImage(bgFile, 'raceTeamBackground', { teamId });
          payload.backgroundUrl = url;
        }
        await apiPost('saveRaceTeam', payload);
        status.textContent = 'Saved.';
        await renderRaceTeamManageUI(teamId, container, opts);
      }catch(e){ status.textContent = 'Could not save: ' + e.message; }
    });

    if(opts.isOps){
      const donationBox = container.querySelector('#rtDonationVerified');
      if(donationBox && opts.isOwnerRole){
        donationBox.addEventListener('change', async () => {
          try{ await apiPost('staffSetTeamDonationVerified', { teamId, verified: donationBox.checked }); }
          catch(e){ alert('Could not update: ' + e.message); donationBox.checked = !donationBox.checked; }
        });
      }
      container.querySelector('#rtSaveRestrictionsBtn')?.addEventListener('click', async () => {
        const status = container.querySelector('#rtRestrictionStatus');
        status.textContent = 'Saving...';
        try{
          await apiPost('staffSetTeamRestrictions', {
            teamId,
            applicationsLocked: container.querySelector('#rtApplicationsLocked').checked,
            hiddenFromDirectory: container.querySelector('#rtHiddenFromDirectory').checked,
            restrictionNote: container.querySelector('#rtRestrictionNote').value
          });
          status.textContent = 'Saved.';
          setTimeout(() => { if(container.querySelector('#rtRestrictionStatus')) container.querySelector('#rtRestrictionStatus').textContent = ''; }, 2000);
        }catch(e){ status.textContent = 'Could not save: ' + e.message; }
      });
      container.querySelector('#rtDisbandBtn')?.addEventListener('click', async () => {
        if(!confirm(`Disband ${team.teamName}? This removes every member's logo and can't be undone.`)) return;
        try{ await apiPost('disbandRaceTeam', { teamId }); container.innerHTML = '<div class="empty">Team disbanded.</div>'; }
        catch(e){ alert('Could not disband: ' + e.message); }
      });
    }

    container.querySelectorAll('[data-place]').forEach(btn => btn.addEventListener('click', async () => {
      try{ await apiPost('placeRaceTeamMember', { teamId, driverId: btn.dataset.place, platform: btn.dataset.platform }); await renderRaceTeamManageUI(teamId, container, opts); }
      catch(e){ alert('Could not place driver: ' + e.message); }
    }));
    container.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', async () => {
      try{ await apiPost('removeRaceTeamMember', { teamId, driverId: btn.dataset.reject }); await renderRaceTeamManageUI(teamId, container, opts); }
      catch(e){ alert('Could not reject: ' + e.message); }
    }));
    container.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('Remove this driver from the team?')) return;
      try{ await apiPost('removeRaceTeamMember', { teamId, driverId: btn.dataset.remove }); await renderRaceTeamManageUI(teamId, container, opts); }
      catch(e){ alert('Could not remove: ' + e.message); }
    }));
  }

  // ✅ CLEANED UP: initMyRaceTeamPanel() used to render into the now-removed
  // myRaceTeamPanel/#mrtBody shell (superseded by raceteamnew.html a while
  // back). It already no-opped on its own guard once that HTML was gone -
  // removed properly here instead of leaving it as inert dead code.

  async function initRaceTeamsPanel(){
    if(!q('raceTeamsPanel')) return;
    const body = q('rtStatusBody');
    body.innerHTML = '<div class="empty">Loading&hellip;</div>';

    let mine, teams;
    try{
      [mine, teams] = await Promise.all([apiGet('myRaceTeamId'), apiGet('raceTeamsList')]);
    }catch(e){ body.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }

    let topBlock = '';
    if(mine.teamId){
      topBlock = mine.role === 'pending_owner'
        ? `<div class="notice-card">Your application is pending staff approval.</div>`
        : `<div class="notice-card">You're already ${mine.role === 'owner' ? 'the owner of' : 'a member of'} a team - see Racing &gt; My Race Team.</div>`;
    } else {
      topBlock = `
        <div class="notice-card">Applying to create a team needs live Gold Patreon, or a one-off donation of at least £15 that staff verify manually - staff will check before approving your application. Once approved, you can invite others to request to join, then place them into your PC or Console roster.</div>
        <div class="field-group"><label>Team name</label><input type="text" id="rtApplyNameInput" placeholder="e.g. Midnight Motorsport"></div>
        <button class="btn purple" id="rtApplyBtn" type="button">Apply to create a race team</button>
        <span class="save-status" id="rtApplyStatus"></span>
      `;
    }

    const teamCards = teams.teams.length ? teams.teams.map(t => `
      <div class="note-item">
        ${t.logoUrl ? `<img src="${t.logoUrl}" style="width:40px;height:40px;border-radius:8px;float:left;margin-right:10px" alt="">` : ''}
        <strong>${t.teamName}</strong>
        <div class="note-meta">${t.memberCount} member(s)</div>
        ${!mine.teamId ? `<div style="margin-top:8px;clear:both"><button class="btn teal" data-join="${t.id}">Request to Join</button></div>` : ''}
      </div>
    `).join('') : '<div class="empty">No active teams yet.</div>';

    body.innerHTML = topBlock + `<h4 style="margin:20px 0 10px">Active Teams</h4>${teamCards}`;

    q('rtApplyBtn')?.addEventListener('click', async () => {
      const status = q('rtApplyStatus');
      const teamName = q('rtApplyNameInput').value.trim();
      if(!teamName){ status.textContent = 'Enter a team name first.'; return; }
      status.textContent = 'Submitting...';
      try{ await apiPost('applyRaceTeam', { teamName }); await initRaceTeamsPanel(); }
      catch(e){ status.textContent = 'Could not apply: ' + e.message; }
    });
    body.querySelectorAll('[data-join]').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Requesting...';
      try{ await apiPost('requestJoinRaceTeam', { teamId: btn.dataset.join }); btn.textContent = 'Requested ✓'; }
      catch(e){ btn.disabled = false; btn.textContent = 'Request to Join'; alert('Could not request: ' + e.message); }
    }));
  }

  async function initOpsRaceTeamsPanel(){
    if(!q('opsRaceTeamsPanel')) return;
    const appsBox = q('ortApplications');
    const listBox = q('ortTeamList');
    const manageBox = q('ortTeamManage');

    let apps, teams;
    try{
      [apps, teams] = await Promise.all([apiGet('staffRaceTeamApplications'), apiGet('staffRaceTeamList')]);
    }catch(e){ appsBox.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }

    appsBox.innerHTML = apps.applications.length ? apps.applications.map(a => `
      <div class="note-item">
        <strong>${a.teamName}</strong>
        <div class="note-meta">Applied by ${a.ownerName}</div>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="btn teal" data-approve="${a.id}">Approve</button>
          <button class="btn ghost" data-reject-app="${a.id}">Reject</button>
        </div>
      </div>
    `).join('') : '<div class="empty">No pending applications.</div>';

    appsBox.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', async () => {
      try{ await apiPost('staffApproveRaceTeam', { teamId: btn.dataset.approve, approve: true }); await initOpsRaceTeamsPanel(); }
      catch(e){ alert('Could not approve: ' + e.message); }
    }));
    appsBox.querySelectorAll('[data-reject-app]').forEach(btn => btn.addEventListener('click', async () => {
      try{ await apiPost('staffApproveRaceTeam', { teamId: btn.dataset.rejectApp, approve: false }); await initOpsRaceTeamsPanel(); }
      catch(e){ alert('Could not reject: ' + e.message); }
    }));

    listBox.innerHTML = teams.teams.length ? teams.teams.map(t => `
      <div class="note-item">
        ${t.logoUrl ? `<img src="${t.logoUrl}" style="width:32px;height:32px;border-radius:6px;float:left;margin-right:10px" alt="">` : ''}
        <strong>${t.teamName}</strong>
        ${(t.applicationsLocked || t.hiddenFromDirectory) ? `<span class="scout-badge unlinked" style="margin-left:8px">${[t.applicationsLocked?'Apps Closed':'',t.hiddenFromDirectory?'Hidden':''].filter(Boolean).join(' + ')}</span>` : ''}
        <div style="margin-top:8px;clear:both"><button class="btn ghost" data-manage="${t.id}">Manage</button></div>
      </div>
    `).join('') : '<div class="empty">No active teams yet.</div>';

    listBox.querySelectorAll('[data-manage]').forEach(btn => btn.addEventListener('click', () => {
      manageBox.classList.remove('hidden');
      renderRaceTeamManageUI(btn.dataset.manage, manageBox, { isOps: true, isOwnerRole: !!window.IFWL_OWNER });
      manageBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  window.initOpsRaceTeamsPanel = initOpsRaceTeamsPanel;

  // ✅ CHANGED: the new-sponsorship celebration popup moved to career.html
  // with the rest of Season Progression.

  // ✅ ADDED: tranche 2 - live Season Stats breakdown (attended/wins/podiums/
  // best finish), sitting next to the licence card. Reuses the exact same
  // season-window + race-results-in-range + per-race detail pipeline that
  // Race Results already uses - no new backend endpoint, just a client-side
  // tally over the same data. One race's detail fetch failing doesn't sink
  // the whole breakdown (Promise.allSettled), it's just excluded.
  async function renderSeasonStatsBreakdown(){
    const body = q('seasonStatsBody');
    if(!body || !currentProfile) return;
    const accDriverNames = currentProfile.accDriverNames || [];
    const titleEl = q('seasonStatsTitle');
    const subEl = q('seasonStatsSub');
    if(!accDriverNames.length){
      body.innerHTML = '<div class="empty">Link your ACC driver name above to see your season stats here.</div>';
      return;
    }

    let season;
    try{ season = await window.IFWL_SeasonAPI.fetchSeasonWindow(); }
    catch(e){ body.innerHTML = '<div class="empty">Could not load the season window.</div>'; return; }
    if(!season.startDate || !season.endDate){
      body.innerHTML = '<div class="empty">No season window set yet - ask staff to configure one under Staff &rarr; Season Window.</div>';
      return;
    }
    if(titleEl) titleEl.textContent = `${season.label || 'Season'} Stats`;
    if(subEl) subEl.textContent = `Your race record \u00b7 ${season.startDate} to ${season.endDate}`;

    const startMs = new Date(season.startDate + 'T00:00:00Z').getTime();
    const endMs = new Date(season.endDate + 'T23:59:59Z').getTime();

    let races;
    try{ races = await window.IFWLStats.listRaceResultsInRange(startMs, endMs); }
    catch(e){ body.innerHTML = `<div class="empty">Could not load races: ${e.message}</div>`; return; }

    body.innerHTML = `<div class="s4-stat-grid">
      <div class="qual-stat-box"><span>Races Attended</span><strong id="s4StatAttended">-</strong></div>
      <div class="qual-stat-box"><span>Wins</span><strong id="s4StatWins">-</strong></div>
      <div class="qual-stat-box"><span>Podiums</span><strong id="s4StatPodiums">-</strong></div>
      <div class="qual-stat-box"><span>Best Finish</span><strong id="s4StatBest">-</strong></div>
    </div><div id="homeInsights"></div>`;

    if(!races.length){
      q('s4StatAttended').textContent = '0';
      q('s4StatWins').textContent = '0';
      q('s4StatPodiums').textContent = '0';
      return;
    }

    const mine = new Set(accDriverNames.map(n => window.IFWLStats.driverNameKey(n)));
    const details = await Promise.allSettled(races.map(r => window.IFWLStats.loadRaceDetail(r.file)));

    let attended = 0, wins = 0, podiums = 0, best = null;
    details.forEach(result => {
      if(result.status !== 'fulfilled' || !result.value?.rows) return;
      const myRow = result.value.rows.find(row => mine.has(window.IFWLStats.driverNameKey(row.driver)));
      if(!myRow) return;
      attended++;
      const pos = Number(myRow.racePos);
      if(!Number.isFinite(pos)) return;
      if(pos === 1) wins++;
      if(pos <= 3) podiums++;
      if(best === null || pos < best) best = pos;
    });

    q('s4StatAttended').textContent = String(attended);
    q('s4StatWins').textContent = String(wins);
    q('s4StatPodiums').textContent = String(podiums);
    q('s4StatBest').textContent = best != null ? `P${best}` : '-';
    try{ renderHomeInsights(races, details, mine, { attended, wins, podiums }); }catch(e){ console.warn('Home insights failed', e); }
  }
  window.renderSeasonStatsBreakdown = renderSeasonStatsBreakdown;

  /* =====================================================================
     HOME v2
     - Next race countdown(s): from the same "available races" list the
       Available Races tab uses (already filtered to the driver's licence;
       the server collapses each series to its next round). Filtered here by
       platform, one entry per series, soonest first.
     - Season card insights: last race / championship / streak, computed from
       the race files Season Stats already loads (no extra fetches).
     - Career balance: the existing Career Shop ledger.
     - Qualification card: compacts once the race season starts (staff
       setting, defaults to automatic from 12 Oct 2026).
     ===================================================================== */
  const HOME_DEFAULT_SETTINGS = { qualMode:'auto', seasonStartDate:'2026-10-12' };
  const HOME_SERIES_LABELS = {
    pc_pro:'PC Pro', pc_pro_am:'PC Amateur', pc_beginner:'PC Beginner', pc_monday_funday:'PC Monday Funday',
    console_pro_am:'Console Pro', console_pro:'Console Pro', console_amateur:'Console Amateur',
    console_beginner:'Console Beginner', console_monday_funday:'Console Monday Funday'
  };
  let homeSettingsCache = null;
  async function homeSettings(){
    if(homeSettingsCache) return homeSettingsCache;
    try{
      const r = await window.IFWL_HomeSettingsAPI.fetchHomeSettings();
      homeSettingsCache = { qualMode: r.qualMode || 'auto', seasonStartDate: r.seasonStartDate || HOME_DEFAULT_SETTINGS.seasonStartDate };
    }catch(e){ homeSettingsCache = { ...HOME_DEFAULT_SETTINGS }; }
    return homeSettingsCache;
  }
  window.invalidateHomeSettings = () => { homeSettingsCache = null; };
  const homeEsc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const homeGbp = (n) => (n < 0 ? '-' : '') + '\u00a3' + Math.abs(Math.round(Number(n) || 0)).toLocaleString();

  // ---- UK-time helpers (events carry dayOfWeek + raceTimeUK for weekly races) ----
  function homeUkParts(ms){
    const f = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit', weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false });
    return f.formatToParts(new Date(ms)).reduce((a,p) => { a[p.type] = p.value; return a; }, {});
  }
  function homeUkLocalToMs(dateIso, hhmm){
    const guess = Date.parse(dateIso + 'T' + hhmm + ':00Z');
    const p = homeUkParts(guess);
    const lh = p.hour === '24' ? '00' : p.hour;
    let diff = (Number(hhmm.slice(0,2)) * 60 + Number(hhmm.slice(3,5))) - (Number(lh) * 60 + Number(p.minute));
    diff = ((diff + 720) % 1440 + 1440) % 1440 - 720;
    return guess + diff * 60000;
  }
  function homeNextWeekly(dayName, hhmm){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hhmm || ''))) return 0;
    const want = String(dayName || '').slice(0,3).toLowerCase();
    const now = Date.now();
    for(let i = 0; i <= 8; i++){
      const p = homeUkParts(now + i * 86400000);
      if(String(p.weekday).slice(0,3).toLowerCase() !== want) continue;
      const ms = homeUkLocalToMs(`${p.year}-${p.month}-${p.day}`, hhmm);
      if(ms > now - 2 * 3600000) return ms;
    }
    return 0;
  }
  function homeEventStartMs(e){
    const now = Date.now();
    if(e.eventDateMs && e.eventDateMs > now - 2 * 3600000) return e.eventDateMs;
    if(e.dayOfWeek && e.raceTimeUK) return homeNextWeekly(e.dayOfWeek, e.raceTimeUK);
    return 0;
  }
  function homeEventForMe(e){
    if(!e || e.pinned || e.eligible === false) return false;
    const plat = String(currentProfile?.platform || '').toLowerCase();
    const ep = String(e.platform || 'both').toLowerCase();
    if(plat && plat !== 'both' && ep !== 'both' && ep !== plat) return false;
    return true;
  }
  function homeSeriesLabel(e){
    return HOME_SERIES_LABELS[e.series] || e.title || 'Race';
  }
  function homeShortWhen(ms){
    return new Date(ms).toLocaleString([], { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  }
  function homeIn(ms){
    const d = ms - Date.now();
    if(d <= 0) return 'Live now';
    const mins = Math.floor(d / 60000), days = Math.floor(mins / 1440), hrs = Math.floor((mins % 1440) / 60), m = mins % 60;
    return days ? `${days}d ${hrs}h` : (hrs ? `${hrs}h ${m}m` : `${m}m`);
  }
  function homeDownloadIcs(ev, startMs){
    const fmt = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//IFWL//Licence Centre//EN','BEGIN:VEVENT',
      `UID:${ev.id || startMs}@ifwl`, `DTSTAMP:${fmt(Date.now())}`, `DTSTART:${fmt(startMs)}`, `DTEND:${fmt(startMs + 2 * 3600000)}`,
      `SUMMARY:${String(ev.title || 'IFWL Race').replace(/[\n,;]/g, ' ')}`,
      'DESCRIPTION:IFWL race - open the Licence Centre > Available Races for the server password.',
      'END:VEVENT','END:VCALENDAR'];
    const blob = new Blob([lines.join('\r\n')], { type:'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'ifwl-race.ics';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  let homeNextRaceTimer = null;
  function homeCountdownBoxes(ms){
    const d = Math.max(0, ms - Date.now());
    const days = Math.floor(d / 86400000), hrs = Math.floor(d % 86400000 / 3600000), mins = Math.floor(d % 3600000 / 60000), secs = Math.floor(d % 60000 / 1000);
    const unit = (n, l, cls) => `<div class="hn-unit${cls ? ' ' + cls : ''}"><div class="hn-digits">${String(n).padStart(2,'0').split('').map(c => `<span class="hn-dg">${c}</span>`).join('')}</div><em>${l}</em></div>`;
    const sep = '<i class="hn-sep">:</i>';
    return unit(days,'days') + sep + unit(hrs,'hrs') + sep + unit(mins,'mins') + sep + unit(secs,'secs','hn-secs');
  }
  function homeCountdownState(ms){
    const left = ms - Date.now();
    return left <= 3600000 ? 'hn-now' : left <= 86400000 ? 'hn-soon' : '';
  }
  function homeStartCountdownTimer(){
    if(homeNextRaceTimer) clearInterval(homeNextRaceTimer);
    homeNextRaceTimer = setInterval(() => {
      const el = q('nextRaceBody');
      if(!el || document.hidden) return;
      let rerender = false;
      el.querySelectorAll('[data-cd-target]').forEach(node => {
        const t = Number(node.dataset.cdTarget);
        if(node.dataset.cdMode === 'boxes'){
          node.innerHTML = homeCountdownBoxes(t);
          node.classList.remove('hn-soon','hn-now');
          const st = homeCountdownState(t); if(st) node.classList.add(st);
        }
        if(t <= Date.now() && node.dataset.cdMode === 'boxes' && !node.dataset.cdLive) rerender = true;
      });
      el.querySelectorAll('[data-in-target]').forEach(node => { node.textContent = homeIn(Number(node.dataset.inTarget)); });
      if(rerender) renderHomeNextRace();
    }, 1000);
  }

  async function renderHomeNextRace(){
    const body = q('nextRaceBody');
    if(!body || !currentProfile) return;
    const settings = await homeSettings();
    let events = [];
    try{ events = await window.IFWL_SimgridAPI.fetchAvailableRaces(false); }
    catch(e){ events = []; }

    // one entry per series (key falls back to the owner-event / SimGrid link / title)
    const bySeries = new Map();
    events.filter(homeEventForMe).forEach(e => {
      const start = homeEventStartMs(e);
      if(!start) return;
      const key = e.series || e.ownerEventId || e.simgridLink || e.title;
      const cur = bySeries.get(key);
      if(!cur || start < cur.start) bySeries.set(key, { e, start });
    });
    const list = [...bySeries.values()].sort((a,b) => a.start - b.start);

    if(!list.length){
      const seasonStart = homeUkLocalToMs(settings.seasonStartDate, '00:00');
      if(seasonStart > Date.now()){
        body.innerHTML = `<div class="hn-feature">
          <span class="hn-chip">Race season</span>
          <div class="hn-title">The race season starts ${homeEsc(new Date(settings.seasonStartDate + 'T12:00:00Z').toLocaleDateString([], { weekday:'long', day:'numeric', month:'long', timeZone:'UTC' }))}</div>
          <div class="hn-cd ${homeCountdownState(seasonStart)}" data-cd-target="${seasonStart}" data-cd-mode="boxes" data-cd-live="1">${homeCountdownBoxes(seasonStart)}</div>
          <div class="hn-when">Your races will appear here as soon as they're scheduled for your licence.</div>
        </div>`;
        homeStartCountdownTimer();
      } else {
        body.innerHTML = '<div class="empty">No upcoming races scheduled for your licence yet. Check Available Races for what\'s open.</div>';
      }
      return;
    }

    const first = list[0];
    const live = first.start <= Date.now();
    const rest = list.slice(1);
    body.innerHTML = `<div class="hn-feature">
        <span class="hn-chip">${homeEsc(homeSeriesLabel(first.e))}</span>
        <div class="hn-title">${homeEsc(first.e.title)}</div>
        ${live
          ? '<div class="hn-live">Racing now</div>'
          : `<div class="hn-cd ${homeCountdownState(first.start)}" data-cd-target="${first.start}" data-cd-mode="boxes">${homeCountdownBoxes(first.start)}</div>`}
        <div class="hn-when">${homeEsc(homeShortWhen(first.start))} &middot; your local time</div>
        <div class="hn-actions">
          <button class="btn teal" type="button" id="hnDetailsBtn">Race details &amp; password</button>
          <button class="btn ghost" type="button" id="hnCalBtn">Add to calendar</button>
        </div>
      </div>
      ${rest.length ? `<div class="hn-others">${rest.slice(0, 3).map(r => `<div class="hn-other-row"><div><div class="hn-other-name">${homeEsc(homeSeriesLabel(r.e))}</div><div class="hn-other-sub">${homeEsc(r.e.title)} &middot; ${homeEsc(homeShortWhen(r.start))}</div></div><div class="hn-other-in" data-in-target="${r.start}">${homeEsc(homeIn(r.start))}</div></div>`).join('')}${rest.length > 3 ? `<div class="hn-other-row"><span class="hn-other-sub">+${rest.length - 3} more in Available Races</span></div>` : ''}</div>` : ''}`;
    q('hnDetailsBtn')?.addEventListener('click', () => switchView('availableRaces'));
    q('hnCalBtn')?.addEventListener('click', () => homeDownloadIcs(first.e, first.start));
    homeStartCountdownTimer();
  }
  window.renderHomeNextRace = renderHomeNextRace;

  // ---- Season card insights ----
  const HOME_FIN_POINTS = (pos) => (pos >= 1 && pos <= 50) ? 51 - pos : 0;
  function homeSeriesName(serverName){
    const clean = String(serverName || '').replace(/^IFWL\s*\|\s*/i, '').replace(/\s*SEASON\s*\d+\s*$/i, '').trim();
    return clean.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAm\b/, 'Amateur').replace(/\bPro Am\b/, 'Pro-Am').replace(/\bPc\b/, 'PC');
  }
  function homeNextMilestone(att, wins, pods){
    const ladders = [
      { n: att, steps: [3,5,10,15,20,30,40], label: (t) => `${t} races attended` },
      { n: pods, steps: [1,3,5,10,15,20], label: (t) => t === 1 ? 'your first podium' : `${t} podiums` },
      { n: wins, steps: [1,3,5,10,15], label: (t) => t === 1 ? 'your first win' : `${t} wins` }
    ];
    let best = null;
    ladders.forEach(l => {
      const t = l.steps.find(x => x > l.n);
      if(!t) return;
      const need = t - l.n;
      if(!best || need < best.need) best = { need, text: `${need} more to reach ${l.label(t)}` };
    });
    return best ? best.text : '';
  }

  async function renderHomeInsights(races, details, mine, tally){
    const box = q('homeInsights');
    if(!box) return;
    // ledger is optional - used only to attach the money earned to the last race
    let ledgerTx = [];
    try{ ledgerTx = (await homeLedger()).transactions || []; }catch(e){ ledgerTx = []; }

    const pointsByServer = new Map();   // serverId -> Map(driverKey -> {pts, races, wins})
    const myRaces = [];                 // attended races, any series
    const serverRaceTimes = new Map();  // serverId -> [tsMs...]
    details.forEach((result, i) => {
      if(result.status !== 'fulfilled' || !result.value?.rows) return;
      const r = races[i];
      if(!serverRaceTimes.has(r.serverId)) serverRaceTimes.set(r.serverId, []);
      serverRaceTimes.get(r.serverId).push(r.tsMs);
      if(!pointsByServer.has(r.serverId)) pointsByServer.set(r.serverId, new Map());
      const table = pointsByServer.get(r.serverId);
      result.value.rows.forEach(row => {
        const pos = Number(row.racePos);
        if(!Number.isFinite(pos) || pos < 1) return;
        const key = window.IFWLStats.driverNameKey(row.driver);
        const rec = table.get(key) || { pts: 0, races: 0, wins: 0 };
        rec.pts += HOME_FIN_POINTS(pos); rec.races++; if(pos === 1) rec.wins++;
        table.set(key, rec);
        if(mine.has(key)) myRaces.push({ tsMs: r.tsMs, track: r.track, serverId: r.serverId, serverName: r.serverName, pos, pts: HOME_FIN_POINTS(pos) });
      });
    });
    if(!myRaces.length){
      box.innerHTML = '<div class="hs-row"><div class="hs-label">Last race</div><div class="hs-val"><small>Your first result will show up here after your next race.</small></div></div>';
      return;
    }
    myRaces.sort((a,b) => b.tsMs - a.tsMs);
    const last = myRaces[0];

    // money for the last race, matched from the ledger by race time + track
    const tx = ledgerTx.find(t => t.type === 'race' && Math.abs((t.dateMs || 0) - last.tsMs) < 15 * 60000 && (!t.track || !last.track || String(t.track).toLowerCase() === String(last.track).toLowerCase()));
    const money = tx ? ` &middot; <b style="color:${tx.amount < 0 ? 'var(--ifwl-red)' : 'var(--ifwl-teal)'}">${tx.amount < 0 ? '' : '+'}${homeGbp(tx.amount)}</b>${tx.cleanBonus ? ' <small>(clean race bonus)</small>' : ''}` : '';
    const posChip = (pos) => `<span class="hs-chip${pos === 1 ? ' win' : pos <= 3 ? ' podium' : ''}">P${pos}</span>`;
    const form = myRaces.slice(0, 5).map(r => posChip(r.pos)).join('');

    // championship: the series (server) where I've raced the most
    const perServer = new Map();
    myRaces.forEach(r => { const c = perServer.get(r.serverId) || { n: 0, latest: 0, name: r.serverName }; c.n++; c.latest = Math.max(c.latest, r.tsMs); perServer.set(r.serverId, c); });
    const primary = [...perServer.entries()].sort((a,b) => b[1].n - a[1].n || b[1].latest - a[1].latest)[0];
    let champHtml = '';
    let streak = 0;
    if(primary){
      const [serverId, info] = primary;
      const table = [...pointsByServer.get(serverId).entries()].map(([k, v]) => ({ k, ...v })).sort((a,b) => b.pts - a.pts || b.wins - a.wins || b.races - a.races);
      const myIdx = table.findIndex(r => mine.has(r.k));
      if(myIdx >= 0){
        const me = table[myIdx];
        let gap = '';
        if(myIdx === 0 && table.length > 1) gap = `leading by ${me.pts - table[1].pts} pts`;
        else if(myIdx > 0) gap = `${table[myIdx - 1].pts - me.pts} pts behind P${myIdx}`;
        champHtml = `<div class="hs-row"><div class="hs-label">Championship</div><div class="hs-val"><b>${homeEsc(homeSeriesName(info.name))}</b> &middot; P${myIdx + 1} of ${table.length} &middot; ${me.pts} pts${gap ? `<br><small>${gap} &middot; finishing points</small>` : ''}</div></div>`;
      }
      // attendance streak in that series, counted back from its latest race
      const times = (serverRaceTimes.get(serverId) || []).slice().sort((a,b) => b - a);
      const mineSet = new Set(myRaces.filter(r => r.serverId === serverId).map(r => r.tsMs));
      for(const t of times){ if(mineSet.has(t)) streak++; else break; }
    }
    const milestone = homeNextMilestone(tally.attended, tally.wins, tally.podiums);
    const streakBits = [streak >= 2 ? `<b>${streak}</b> races in a row` : '', milestone].filter(Boolean).join(' &middot; ');

    box.innerHTML = `
      <div class="hs-row"><div class="hs-label">Last race</div><div class="hs-val">${posChip(last.pos)} <b>${homeEsc(last.track || 'Unknown track')}</b> &middot; ${last.pts} pts${money}<br><small>${homeEsc(new Date(last.tsMs).toLocaleDateString([], { day:'numeric', month:'short' }))}${myRaces.length > 1 ? ' &middot; form' : ''}</small>${myRaces.length > 1 ? `<span class="hs-form">${form}</span>` : ''}</div></div>
      ${champHtml}
      ${streakBits ? `<div class="hs-row"><div class="hs-label">Streak</div><div class="hs-val">${streakBits}</div></div>` : ''}`;
  }

  // ---- Career balance ----
  let homeLedgerPromise = null;
  // Called without the helper's `force` flag on purpose: that flag is appended
  // to the action name, which produces a malformed query string.
  function homeLedger(force){
    if(!homeLedgerPromise || force) homeLedgerPromise = apiGet('myCareerShopLedger');
    return homeLedgerPromise;
  }
  async function renderHomeBalance(){
    const body = q('careerBalanceBody');
    const panel = q('careerBalancePanel');
    if(!body || !currentProfile) return;
    let ledger;
    try{ ledger = await homeLedger(true); }
    catch(e){ if(panel) panel.classList.add('hidden'); return; }
    if(panel) panel.classList.remove('hidden');
    const bal = Number(ledger.balance) || 0;
    const txs = (ledger.transactions || []).slice().sort((a,b) => (b.dateMs || 0) - (a.dateMs || 0));
    const inn = txs.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
    const out = txs.filter(t => t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);

    let nudge = '';
    try{
      const items = await fetchCareerShopCatalog();
      const owned = new Set(ledger.ownedItemIds || []);
      const buyable = (items || []).filter(it => it.cost > 0 && !owned.has(it.id));
      const affordable = buyable.filter(it => it.cost <= bal).sort((a,b) => b.cost - a.cost)[0];
      if(affordable) nudge = `You can afford <b>${homeEsc(affordable.name)}</b> (${homeGbp(affordable.cost)}) in the Career Shop.`;
      else {
        const next = buyable.sort((a,b) => a.cost - b.cost)[0];
        if(next) nudge = `${homeGbp(next.cost - bal)} more to unlock <b>${homeEsc(next.name)}</b> in the Career Shop.`;
      }
    }catch(e){ /* nudge is optional */ }

    body.innerHTML = `
      <div class="hb-balance${bal < 0 ? ' neg' : ''}">${homeGbp(bal)}</div>
      <div class="hb-split"><span>Money in <b>${homeGbp(inn)}</b></span><span>Money out <b>${homeGbp(out)}</b></span></div>
      ${txs.slice(0, 3).map(t => `<div class="hb-tx"><span>${homeEsc(t.description || t.reason || 'Transaction')}</span><span class="${t.amount < 0 ? 'neg' : 'pos'}">${t.amount < 0 ? '-' : '+'}${homeGbp(Math.abs(t.amount))}</span></div>`).join('') || '<div class="field-hint">No transactions yet this season.</div>'}
      ${nudge ? `<div class="hb-nudge">${nudge}</div>` : ''}`;
  }
  q('homeCareerBtn')?.addEventListener('click', () => { location.href = 'career.html'; });
  window.renderHomeBalance = renderHomeBalance;

  // ---- Qualification card: compact once the race season starts ----
  async function applyQualCardMode(){
    const panel = q('qualStandingPanel');
    if(!panel) return;
    const settings = await homeSettings();
    const seasonStart = homeUkLocalToMs(settings.seasonStartDate, '00:00');
    const compact = settings.qualMode === 'compact' || (settings.qualMode === 'auto' && Date.now() >= seasonStart);
    panel.classList.toggle('qual-compact', compact);
    const btn = q('qualToggleBtn');
    const title = q('qualStandingTitle'), sub = q('qualStandingSub');
    if(compact){
      if(title) title.textContent = 'Qualification Result';
      if(sub) sub.textContent = 'Your final ranking from the qualification period';
      if(btn){ btn.classList.remove('hidden'); btn.textContent = panel.classList.contains('qual-open') ? 'Hide' : 'Show'; }
    } else {
      if(title) title.textContent = 'Your Qualification Ranking';
      if(sub) sub.textContent = 'How you compare to the field on the IFWL Licence server(s)';
      panel.classList.remove('qual-open');
      if(btn) btn.classList.add('hidden');
    }
  }
  q('qualStandingHead')?.addEventListener('click', () => {
    const panel = q('qualStandingPanel');
    if(!panel || !panel.classList.contains('qual-compact')) return;
    panel.classList.toggle('qual-open');
    const btn = q('qualToggleBtn'); if(btn) btn.textContent = panel.classList.contains('qual-open') ? 'Hide' : 'Show';
  });
  window.applyQualCardMode = applyQualCardMode;

  function renderHomeV2(){
    applyQualCardMode();
    renderHomeNextRace();
    renderHomeBalance();
  }

  async function renderQualificationStanding(){
    const body = q('qualStandingBody');
    if(!body || !currentProfile) return;
    const accDriverNames = currentProfile.accDriverNames || [];
    if(!accDriverNames.length){
      body.innerHTML = '<div class="empty">Link your ACC driver name above, then put some laps in on the IFWL Licence server to see your ranking here.</div>';
      return;
    }

    let html = '';
    let pcIndex = -1, consoleIndex = -1;
    let pcStandings = [], consoleStandings = [];
    try{
      pcStandings = await window.cachedLicenceServerStandings({ minLaps: 15, serverId: 'pc-licence', classStructure: await window.classStructureForServer('pc-licence') , qualWindow: await window.fetchQualWindowMs()});
      pcIndex = findMyStandingRow(pcStandings, accDriverNames);
      if(pcIndex >= 0) html += await buildQualStandingCard('PC', pcIndex, pcStandings, 'pc-licence', accDriverNames);
    }catch(e){ /* one platform failing shouldn't block the other */ }

    try{
      consoleStandings = await window.cachedLicenceServerStandings({ minLaps: 15, serverId: 'console-licence', classStructure: await window.classStructureForServer('console-licence') , qualWindow: await window.fetchQualWindowMs()});
      consoleIndex = findMyStandingRow(consoleStandings, accDriverNames);
      if(consoleIndex >= 0) html += await buildQualStandingCard('Console', consoleIndex, consoleStandings, 'console-licence', accDriverNames);
    }catch(e){ /* as above */ }

    body.innerHTML = html || '<div class="empty">No laps recorded yet on the IFWL Licence server(s) under your linked name(s). Head to the PC or Console laps list under "Claim Your Laps" once you\'ve raced there.</div>';

    checkRankChange(pcIndex, consoleIndex, pcStandings, consoleStandings); // fire-and-forget - never blocks the card itself rendering
  }

  // ✅ ADDED: rank-change login notice. Rank position is already a Gold
  // perk (gated on the card above), so this only ever fires for Gold/staff -
  // it would be odd to proactively surface rank data through a popup to
  // someone who can't otherwise see it on the page at all. Silently stores
  // the rank on first-ever view (nothing to compare against yet), only pops
  // up once there's a genuine change from what they last saw.
  async function checkRankChange(pcIndex, consoleIndex, pcStandings, consoleStandings){
    const isGoldOrStaff = window.IFWL_GOLD || window.IFWL_STAFF;
    if(!isGoldOrStaff) return;

    const newRank = {
      pc: pcIndex >= 0 ? pcIndex + 1 : null,
      console: consoleIndex >= 0 ? consoleIndex + 1 : null
    };
    const prevRank = currentProfile?.lastSeenQualRank || {};
    const hasPrev = prevRank.pc != null || prevRank.console != null;

    // ✅ ADDED: Gold bonus - who's directly ahead of you (the driver who
    // just beat you) and directly behind you (the driver you're currently
    // beating), at your CURRENT position on whichever platform actually
    // changed. Not a new data source or new exposure - standings is the
    // exact same sorted array already used to build the card above, and
    // Gold already sees the full field via Live Timings; this just saves
    // them from having to go find their own row in that full list.
    const rivalAt = (standings, index, offset) => {
      const row = standings?.[index + offset];
      return row ? { name: row.driver, gapPct: row.avgGapPct } : null;
    };

    const changes = [];
    if(newRank.pc != null && prevRank.pc != null && newRank.pc !== prevRank.pc){
      changes.push({
        platform: 'PC', from: prevRank.pc, to: newRank.pc,
        ahead: rivalAt(pcStandings, pcIndex, -1),
        behind: rivalAt(pcStandings, pcIndex, 1)
      });
    }
    if(newRank.console != null && prevRank.console != null && newRank.console !== prevRank.console){
      changes.push({
        platform: 'Console', from: prevRank.console, to: newRank.console,
        ahead: rivalAt(consoleStandings, consoleIndex, -1),
        behind: rivalAt(consoleStandings, consoleIndex, 1)
      });
    }

    if(hasPrev && changes.length) showRankChangeModal(changes);

    if(newRank.pc !== prevRank.pc || newRank.console !== prevRank.console){
      try{
        await saveMyProfile({ lastSeenQualRank: newRank });
        if(currentProfile) currentProfile.lastSeenQualRank = newRank;
      }catch(e){ console.warn('Could not save last-seen rank', e); }
    }
  }

  function showRankChangeModal(changes){
    const modal = q('rankChangeModal');
    if(!modal) return;
    const body = q('rankChangeBody');
    const rivalRow = (label, icon, rival, emptyMsg) => rival
      ? `<div class="rank-rival-row"><span>${icon}</span><div><strong>${label}: ${rival.name}</strong>${rival.gapPct != null ? `<div class="field-hint">+${rival.gapPct}% gap to best</div>` : ''}</div></div>`
      : `<div class="rank-rival-row rank-rival-none"><span>${icon}</span><div><strong>${label}:</strong> <span class="field-hint">${emptyMsg}</span></div></div>`;
    body.innerHTML = changes.map(c => {
      const up = c.to < c.from; // lower number = better position
      const places = Math.abs(c.to - c.from);
      const rivalsHtml = `<div class="rank-rivals">
          ${rivalRow('Ahead of you', '🥇', c.ahead, "You're in 1st - nobody ahead of you!")}
          ${rivalRow('Behind you', '🎯', c.behind, "Nobody behind you yet")}
        </div>`;
      return `<div class="rank-change-row ${up ? 'up' : 'down'}">
        <span class="rank-change-icon">${up ? '📈' : '📉'}</span>
        <div>
          <strong>${c.platform}: ${up ? 'Up' : 'Down'} ${places} place${places === 1 ? '' : 's'}</strong>
          <div class="field-hint">#${c.from} &rarr; #${c.to}</div>
          ${rivalsHtml}
        </div>
      </div>`;
    }).join('');
    modal.classList.remove('hidden');
  }
  q('rankChangeDismissBtn')?.addEventListener('click', () => q('rankChangeModal').classList.add('hidden'));
  q('rankChangeViewBtn')?.addEventListener('click', () => {
    q('rankChangeModal').classList.add('hidden');
    switchView('home');
  });

  // ✅ ADDED: LMU sub-licence self-select. These are driver opt-in flags,
  // stored on the tier list (reusing the same order/colour/foil editor as
  // the main ladder, marked with lmuSubLicence:true) but never shown on the
  // licence card and never used to rank or assign anyone - just a set of
  // checkboxes a driver ticks for themselves. Gated on the driver's actual
  // current tier being above "No Licence" (order 0), not on Patreon tier -
  // this isn't a support perk, it's an opt-in preference.
  async function renderLmuPanel(){
    const body = q('lmuBody');
    if(!body || !currentProfile) return;

    const myTierDef = currentTiers.find(t => t.name === currentProfile.tier);
    const myOrder = myTierDef ? Number(myTierDef.order ?? 0) : 0;
    if(myOrder <= 0){
      body.innerHTML = '<div class="lmu-locked-note">LMU sub-licences unlock once you\'re off <strong>No Licence</strong> on your main IFWL tier. Qualify on the IFWL Licence server (or ask staff for a manual review) to unlock this.</div>';
      return;
    }

    const lmuTiers = currentTiers.filter(t => t.lmuSubLicence).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    if(!lmuTiers.length){
      body.innerHTML = '<div class="empty">No LMU sub-licences have been set up yet - check back once staff have added some.</div>';
      return;
    }

    // ✅ ADDED: gated tiers (Hypercar, LMP3, ...) need a staff-approved
    // request instead of the old plain self-select checkbox - see
    // submitLmuLicenceRequest / staffLmuLicenceRequestReview in rtgate.js.
    // Non-gated tiers keep the exact original checkbox+batch-save flow.
    const openTiers = lmuTiers.filter(t => !t.lmuGated);
    const gatedTiers = lmuTiers.filter(t => t.lmuGated);

    const mine = new Set(currentProfile.lmuSubLicences || []);
    let myRequests = [];
    if(gatedTiers.length){
      try{ myRequests = await window.IFWL_RequestAPI.fetchMyLmuRequests(); }
      catch(e){ myRequests = []; }
    }
    const latestRequestByTier = {};
    myRequests.forEach(r => {
      const prev = latestRequestByTier[r.tierId];
      if(!prev || (r.submittedAtMs || 0) > (prev.submittedAtMs || 0)) latestRequestByTier[r.tierId] = r;
    });

    const openBlock = openTiers.length ? `
      <div class="lmu-sublicence-grid">${openTiers.map(t => `
        <label class="lmu-sublicence-card">
          <input type="checkbox" class="lmu-check" value="${t.id}" ${mine.has(t.id) ? 'checked' : ''}>
          <span class="lmu-swatch" style="background:${t.color}"></span>
          <span><span class="lmu-name">${t.name}</span>${t.description ? `<span class="lmu-desc">${t.description}</span>` : ''}</span>
        </label>
      `).join('')}</div>
      <button class="btn purple" id="saveLmuBtn" type="button">Save selection</button>
      <span id="lmuSaveStatus" class="field-hint" style="margin-left:10px"></span>
    ` : '';

    const gatedBlock = gatedTiers.length ? `
      <div class="lmu-gated-section">
        <h4 class="lmu-gated-heading">Requires staff approval</h4>
        <div class="lmu-sublicence-grid">${gatedTiers.map(t => {
          const held = mine.has(t.id);
          const req = latestRequestByTier[t.id];
          let statusHtml = '';
          if(held){
            statusHtml = `<span class="lmu-gated-status held">Held</span><button class="btn ghost lmu-drop-btn" data-tier="${t.id}" type="button">Drop</button>`;
          }else if(req && req.status === 'pending'){
            statusHtml = `<span class="lmu-gated-status pending">Pending review</span>`;
          }else{
            const declinedNote = (req && req.status === 'declined') ? `<div class="lmu-gated-declined">Declined${req.staffNote ? ': ' + req.staffNote : ''}</div>` : '';
            statusHtml = `${declinedNote}
              <textarea class="lmu-request-reason" data-tier="${t.id}" placeholder="Why should you get this sub-licence? (recent results, experience, etc.)" rows="2"></textarea>
              <button class="btn purple lmu-request-btn" data-tier="${t.id}" type="button">${req && req.status === 'declined' ? 'Request again' : 'Request access'}</button>
              <span class="field-hint lmu-request-status" data-tier="${t.id}"></span>`;
          }
          return `
            <div class="lmu-sublicence-card lmu-gated-card">
              <span class="lmu-swatch" style="background:${t.color}"></span>
              <div class="lmu-gated-body">
                <span class="lmu-name">${t.name}</span>${t.description ? `<span class="lmu-desc">${t.description}</span>` : ''}
                <div class="lmu-gated-actions">${statusHtml}</div>
              </div>
            </div>
          `;
        }).join('')}</div>
      </div>
    ` : '';

    body.innerHTML = openBlock + gatedBlock;

    if(openTiers.length){
      q('saveLmuBtn').addEventListener('click', async () => {
        // Only touches the OPEN (non-gated) tiers - gated tiers the driver
        // already holds must never be dropped by this batch save; they're
        // only removable via the explicit per-tier "Drop" button below.
        const chosenOpen = Array.from(body.querySelectorAll('.lmu-check:checked')).map(el => el.value);
        const heldGated = gatedTiers.filter(t => mine.has(t.id)).map(t => t.id);
        q('lmuSaveStatus').textContent = 'Saving...';
        try{
          currentProfile = await saveMyProfile({ lmuSubLicences: [...chosenOpen, ...heldGated] });
          q('lmuSaveStatus').textContent = 'Saved.';
        }catch(e){
          q('lmuSaveStatus').textContent = 'Could not save: ' + e.message;
        }
      });
    }

    body.querySelectorAll('.lmu-request-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tierId = btn.dataset.tier;
        const reasonEl = body.querySelector(`.lmu-request-reason[data-tier="${tierId}"]`);
        const statusEl = body.querySelector(`.lmu-request-status[data-tier="${tierId}"]`);
        const reason = (reasonEl?.value || '').trim();
        if(!reason){
          if(statusEl) statusEl.textContent = 'Add a short reason first.';
          return;
        }
        btn.disabled = true;
        if(statusEl) statusEl.textContent = 'Submitting...';
        try{
          await window.IFWL_RequestAPI.submitLmuRequest(tierId, reason);
          await renderLmuPanel();
        }catch(e){
          btn.disabled = false;
          if(statusEl) statusEl.textContent = 'Could not submit: ' + e.message;
        }
      });
    });

    body.querySelectorAll('.lmu-drop-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tierId = btn.dataset.tier;
        btn.disabled = true;
        try{
          const remaining = (currentProfile.lmuSubLicences || []).filter(id => id !== tierId);
          currentProfile = await saveMyProfile({ lmuSubLicences: remaining });
          await renderLmuPanel();
        }catch(e){
          btn.disabled = false;
        }
      });
    });
  }

  // ✅ ADDED: replaces "View licence tier ladder" with a lap-count progress
  // box while a driver is still No Licence/Provisional - matched by tier
  // ORDER (0 or 1), not the literal tier name, since staff can rename tiers.
  // Once promoted past that, this box goes away and the normal tier-ladder
  // toggle comes back exactly as before - the assumption at that point is
  // the qualification requirement has already been met.
  async function renderLapProgressBox(){
    const box = q('lapProgressBox');
    const toggleBtn = q('toggleTiersBtn');
    if(!box || !toggleBtn || !currentProfile) return;

    const myTier = currentTiers.find(t => t.name === currentProfile.tier);
    const myOrder = myTier ? Number(myTier.order ?? 99) : 0; // unknown tier -> treat as earliest, safest default
    const showLapBox = myOrder <= 1;

    toggleBtn.classList.toggle('hidden', showLapBox);
    box.classList.toggle('hidden', !showLapBox);
    if(!showLapBox) return;

    const accDriverNames = currentProfile.accDriverNames || [];
    if(!accDriverNames.length){
      box.className = 'lap-incomplete';
      box.innerHTML = `<strong>Licence qualification laps</strong><div class="lap-line">Link your ACC driver name above to start tracking your qualification laps.</div>`;
      return;
    }

    const platformResults = [];
    for(const [label, serverId] of [['PC','pc-licence'], ['Console','console-licence']]){
      try{
        const standings = await window.cachedLicenceServerStandings({ minLaps: 15, serverId, classStructure: await window.classStructureForServer(serverId) , qualWindow: await window.fetchQualWindowMs()});
        const idx = findMyStandingRow(standings, accDriverNames);
        if(idx >= 0) platformResults.push({ label, totalLaps: standings[idx].totalLaps });
      }catch(e){ /* one platform failing shouldn't block the other */ }
    }

    if(!platformResults.length){
      box.className = 'lap-incomplete';
      box.innerHTML = `<strong>Licence qualification laps</strong><div class="lap-line">You haven't started your qualification laps yet. Head to the IFWL Licence server and put in at least 15 laps to complete your licence test.</div>`;
      return;
    }

    const allComplete = platformResults.every(r => r.totalLaps >= 15);
    box.className = allComplete ? 'lap-complete' : 'lap-incomplete';
    const lines = platformResults.map(r => {
      if(r.totalLaps >= 15){
        return `<div class="lap-line">${r.label}: ${r.totalLaps} of 15 mandatory laps done &mdash; &#9989; licence test complete, awaiting your recommended tier from staff.</div>`;
      }
      return `<div class="lap-line">${r.label}: ${r.totalLaps} of 15 mandatory laps done.</div>`;
    }).join('');
    box.innerHTML = `<strong>Licence qualification laps</strong>${lines}`;
  }

  // ✅ ADDED: Season 4 onboarding checklist. Every item is computed live
  // off currentProfile/currentTiers/the same lap-standings engine used by
  // the lap progress box above and the Discord qualification bot - nothing
  // is stored specifically for this popup, so a season reset (whatever
  // process already resets tier/qualifying status for the new season)
  // makes it start reappearing again automatically, with zero extra work.
  // Dismiss is sessionStorage, not localStorage, on purpose - "Not now"
  // should only last this browser session, not forever, while the driver
  // is still missing something; it's re-checked fresh on the next visit.
  function seasonChecklistDismissKey(){
    return 'IFWL_S4_CHECKLIST_DISMISSED:' + window.IFWL_AUTH.userId(window.IFWL_META);
  }
  const IFWL_QUAL_MIN_LAPS_UI = 15;
  async function computeSeasonChecklistItems(){
    const p = currentProfile || {};
    const items = [];

    // 1) Profile basics - the exact same fields that gate the whole site
    // via the Driver Link Gate (see needsProfileBasics in init()), and
    // what actually earns the Active Racer Discord role in the first
    // place - so passing that gate once already satisfies this.
    const hasBasics = !!(p.simgridUsername && p.platform && (p.platform === 'console' || p.steamId) && p.namePronunciation);
    items.push({
      title: 'Get your profile set up on IFWL.NET',
      detail: 'This is what gets you the Active Racer role on Discord and into the Licence Centre - only the website can grant it.',
      done: hasBasics
    });

    // 2) 2+ ACC driver names linked - one from the IFWL Live Timings
    // entrylist, one from Racing > Claim Your Laps, same fields as the
    // green "no ACC name" nudge elsewhere on My Licence, just requiring 2
    // here instead of 1.
    const nameCount = (p.accDriverNames || []).length;
    items.push({
      title: 'Add your ACC driver name(s)',
      detail: 'Under "Your ACC Driver Name" on My Licence - one can be found on IFWL Live Timings (entrylist names), the other under Racing > Claim Your Laps. Should be 2 or more.',
      done: nameCount >= 2
    });

    // 3) Platform selected.
    items.push({
      title: 'Select your platform',
      detail: 'PC or Console, set on My Licence.',
      done: !!p.platform
    });

    // 4) 15 qualifying laps in, on whichever server(s) they've actually
    // raced on - same standings engine and 15-lap threshold as the lap
    // progress box above and the Discord qualification bot.
    let qualDone = false;
    try{
      const platformLaps = [];
      for(const serverId of ['pc-licence','console-licence']){
        const standings = await window.cachedLicenceServerStandings({ minLaps: 15, serverId, classStructure: await window.classStructureForServer(serverId), qualWindow: await window.fetchQualWindowMs() });
        const idx = findMyStandingRow(standings, p.accDriverNames || []);
        if(idx >= 0) platformLaps.push(standings[idx].totalLaps);
      }
      qualDone = platformLaps.length > 0 && platformLaps.every(laps => laps >= 15);
    }catch(e){ /* one platform failing to load shouldn't wrongly show this as done */ }
    items.push({
      title: 'Get your qualifying laps in',
      detail: `At least ${IFWL_QUAL_MIN_LAPS_UI} laps on the IFWL Licence server for your platform.`,
      done: qualDone
    });

    // 5) Await Season 4 placement - not something a driver can tick off
    // themselves. Reuses the same tier-order check as the lap progress box
    // (order 0/1 = No Licence/Provisional, i.e. not yet properly placed).
    const myTier = currentTiers.find(t => t.name === p.tier);
    const myOrder = myTier ? Number(myTier.order ?? 99) : 0;
    items.push({
      title: 'Await your Season 4 placement',
      detail: 'Once your laps are in, staff will assign your tier based on your pace - just sit tight.',
      done: myOrder > 1
    });

    return items;
  }
  async function renderSeasonChecklist(){
    const modal = q('seasonChecklistModal');
    if(!modal || !currentProfile || window.IFWL_STAFF) return;

    const items = await computeSeasonChecklistItems();
    if(items.every(i => i.done)){ modal.classList.add('hidden'); return; }
    if(sessionStorage.getItem(seasonChecklistDismissKey())) return;

    q('seasonChecklistItems').innerHTML = items.map((it, idx) => `
      <div class="s4-check-item${it.done ? ' done' : ''}">
        <div class="s4-check-icon">${it.done ? '&#10003;' : (idx + 1)}</div>
        <div class="s4-check-text"><strong>${it.title}</strong><span>${it.detail}</span></div>
      </div>
    `).join('');
    modal.classList.remove('hidden');
  }
  window.renderSeasonChecklist = renderSeasonChecklist;
  q('seasonChecklistDismissBtn')?.addEventListener('click', () => {
    sessionStorage.setItem(seasonChecklistDismissKey(), '1');
    q('seasonChecklistModal').classList.add('hidden');
  });

  async function checkTicketNotice(){
    const notice = await window.IFWL_TicketNoticeAPI.fetchMyPendingTicketNotice();
    if(!notice.count) return;

    const fingerprint = ticketNoticeFingerprint(notice);
    if(localStorage.getItem(ticketNoticeSeenKey()) === fingerprint) return; // already seen this exact set

    const dates = (notice.tickets || [])
      .map(t => t.dateLabel ? new Date(t.dateLabel).toLocaleDateString('en-GB', {day:'2-digit', month:'long', year:'numeric'}) : null)
      .filter(Boolean);
    const dateText = dates.length ? dates.join(', ') : 'an unknown date';

    q('ticketNoticeText').textContent = `You have had ${notice.count} ticket${notice.count === 1 ? '' : 's'} submitted against you on ${dateText}. Head to the Ticket Portal to make sure you've submitted a statement for ${notice.count === 1 ? 'it' : 'them'}.`;
    q('ticketNoticeModal').classList.remove('hidden');

    const dismiss = () => {
      localStorage.setItem(ticketNoticeSeenKey(), fingerprint);
      q('ticketNoticeModal').classList.add('hidden');
    };
    q('ticketNoticeDismissBtn').onclick = dismiss;
    q('ticketNoticeGoBtn').onclick = dismiss; // going to the portal also counts as acknowledged
  }

  // ✅ ADDED: driver Inbox - list threads, open one, reply. Also keeps the
  // nav tab's unread badge in sync every time the list reloads.
  async function renderInboxPanel(){
    const list = q('inboxThreadList');
    if(!list) return;
    let data;
    try{ data = await window.IFWL_InboxAPI.myInbox(); }
    catch(e){ list.innerHTML = `<div class="empty">Could not load inbox: ${e.message}</div>`; return; }

    const threads = data.threads || [];
    const totalUnread = threads.reduce((sum, t) => sum + (t.unread || 0), 0);
    const badge = q('inboxUnreadBadge');
    if(badge){ badge.textContent = totalUnread; badge.classList.toggle('hidden', !totalUnread); }
    // ✅ ADDED: the Inbox badge only used to show once the Support dropdown
    // was already open - invisible otherwise, so an unread message was easy
    // to miss entirely. Mirrors the same count onto the "Support ▾" toggle
    // itself, visible without opening anything.
    const supportBadge = q('supportUnreadBadge');
    if(supportBadge){ supportBadge.textContent = totalUnread; supportBadge.classList.toggle('hidden', !totalUnread); }
    // ✅ ADDED: same mirror onto the Home quick-action Messages icon.
    const homeMessagesBadge = q('homeMessagesBadge');
    if(homeMessagesBadge){ homeMessagesBadge.textContent = totalUnread; homeMessagesBadge.classList.toggle('hidden', !totalUnread); }

    q('inboxThreadView').classList.add('hidden');
    list.classList.remove('hidden');
    if(!threads.length){ list.innerHTML = '<div class="empty">No messages yet. Staff messages to you will appear here.</div>'; return; }
    list.innerHTML = threads.map(t => `<div class="msg-thread-row${t.unread ? ' msg-unread' : ''}" data-thread="${t.id}">
      <div><div class="msg-subject">${t.subject}${t.unread ? ` <span class="inbox-unread-badge">${t.unread}</span>` : ''}</div>
      <div class="msg-meta">From ${t.staffName} &middot; ${t.lastMessageAtMs ? new Date(t.lastMessageAtMs).toLocaleString() : ''}</div></div>
      <span class="field-hint">Open &rarr;</span>
    </div>`).join('');
    list.querySelectorAll('[data-thread]').forEach(row => row.addEventListener('click', () => openInboxThread(row.dataset.thread)));
  }

  async function openInboxThread(threadId){
    const view = q('inboxThreadView');
    q('inboxThreadList').classList.add('hidden');
    view.classList.remove('hidden');
    q('inboxThreadMessages').innerHTML = '<div class="empty">Loading&hellip;</div>';
    let data;
    try{ data = await window.IFWL_InboxAPI.myThread(threadId); }
    catch(e){ q('inboxThreadMessages').innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }
    q('inboxThreadSubject').textContent = data.subject || '(no subject)';
    q('inboxThreadMessages').innerHTML = (data.messages || []).map(m => `<div class="msg-bubble msg-${m.senderRole === 'driver' ? 'driver' : 'staff'}"><span class="msg-sender">${m.senderName}${m.senderRole === 'staff' ? ' (IFWL Staff)' : ''}</span>${m.text}</div>`).join('');
    // ✅ ADDED: broadcast announcements can be one-way - hide the reply box
    // entirely and say so (the server rejects replies on these regardless).
    const replyRow = view.querySelector('.msg-reply-row');
    if(data.repliesDisabled){
      replyRow.style.display = 'none';
      q('inboxReplyStatus').textContent = 'This is a one-way announcement - replies are disabled.';
    } else {
      replyRow.style.display = '';
      q('inboxReplyStatus').textContent = '';
    }
    q('inboxReplyBtn').onclick = async () => {
      const text = q('inboxReplyText').value.trim();
      if(!text) return;
      q('inboxReplyStatus').textContent = 'Sending...';
      try{
        await window.IFWL_InboxAPI.myReply(threadId, text);
        q('inboxReplyText').value = '';
        q('inboxReplyStatus').textContent = 'Sent.';
        setTimeout(()=>{ if(q('inboxReplyStatus')) q('inboxReplyStatus').textContent=''; }, 2000);
        openInboxThread(threadId); // reload thread with the new message
      }catch(e){ q('inboxReplyStatus').textContent = 'Could not send: ' + e.message; }
    };
    q('inboxBackBtn').onclick = () => renderInboxPanel();
  }

  // Commentator-only accounts (a commentator who is not a racer/staff) never go through the
  // driver licence flow: no licence is issued, no sign-up/rules gates, no onboarding bounce.
  // Their whole site is Drivers to Watch + Driver Overview + Driver Lookup.
  async function commentatorOnlyInit(){
    try{ currentTiers = await window.IFWL_TierAPI.fetchTierList(); }catch(e){}
    try{ hideDriverLinkGate(); hideLicenceRefusedGate(); }catch(e){}
    try{ populateTierSelect(q('dlTierSelect'), { includeBlank: true }); }catch(e){}
    window.initCommentatorPanel?.(); window.initDriverLookupPanel?.(); window.initDriverOverviewPanel?.();
    window.switchView?.('commentatorWatch');
  }

  /* Split pages list the start-up steps they do not need in window.IFWL_PAGE.skip; licence.html has no list, so it runs everything exactly as before. */
  const SKIP = k => !!(window.IFWL_PAGE && window.IFWL_PAGE.skip && window.IFWL_PAGE.skip.indexOf(k) >= 0);
  async function init(){
    if(window.IFWL_COMMENTATOR_ONLY){ await commentatorOnlyInit(); return; }
    renderInboxPanel(); // fire-and-forget - also sets the nav unread badge

    // ✅ FIXED: the tier ladder and "am I logged in, what's my profile" reads
    // don't depend on each other at all, but were awaited one after another -
    // a whole extra network round-trip added to EVERY visitor's load before
    // the page has done anything else. Same "stacked vs parallel" issue as
    // the five-way Promise.all further down in this function, just further
    // upstream where it's easy to miss since there's only two of them.
    const [tiersResult, profileResult] = await Promise.all([
      window.IFWL_TierAPI.fetchTierList(),
      fetchMyProfile().then(p => ({ ok: true, profile: p })).catch(e => ({ ok: false, error: e }))
    ]);
    currentTiers = tiersResult;
    renderTierLegend();
    if(!SKIP('racingRules')) initRacingRulesPage();
    populateTierSelect(q('dirTierFilter'), { includeBlank: true });
    if(!SKIP('trophyPublic')) initTrophyCabinetPublicPage(); // public content - loads regardless of login state
    applySeasonalOverlays();
    applyAffiliateAds();

    if(profileResult.ok){
      currentProfile = profileResult.profile;
    }else{
      const e = profileResult.error;
      if(e.body?.refused && e.body?.onboardingLive){
        // ONBOARDING hook: once onboarding is live, a driver with no [number] - name nickname is sent to sign-up instead of the old refusal.
        location.replace(location.origin + location.pathname.replace(/[^\/]*$/,'') + 'ifwlonboarding.html?relogin=1');
        return;
      }
      if(e.body?.refused){
        hideDriverLinkGate();
        showLicenceRefusedGate();
        return;
      }
      currentProfile = null;
    }
    hideLicenceRefusedGate();
    currentProfile = await resolveStoredImages(currentProfile);
    applyAccentTheme();
    applyDarkTheme();

    // ✅ CHANGED: this gate used to require an ACC driver name to be linked
    // before anything else worked - accDriverNames is now a soft, non-
    // blocking nudge instead (see the green notice on My Licence), since a
    // brand new driver genuinely can't know their name is right until
    // after their first race. What's actually required up front instead:
    // the basics staff need for registration/entrylist matching and
    // commentary - none of which depend on having raced yet.
    // Staff are exempt - they need to manage the system regardless of
    // whether they personally race.
    const needsProfileBasics = !window.IFWL_STAFF && (
      !currentProfile?.simgridUsername ||
      !currentProfile?.platform ||
      (currentProfile.platform !== 'console' && !currentProfile?.steamId) ||
      !currentProfile?.namePronunciation
    );
    if(needsProfileBasics){
      showDriverLinkGate();
      return;
    }
    hideDriverLinkGate();

    // ✅ ADDED: Rules re-agreement gate. Blocking, same visual pattern as
    // the login wall - must tick "I have read and agreed" AND pass a
    // single random question before the rest of the page becomes usable.
    // Staff exempt for the same reason they're exempt from the driver-link
    // gate above - they need to manage the system regardless.
    if(!window.IFWL_STAFF && needsRulesReAgreement(currentProfile)){
      showRulesGate();
      return;
    }

    // Commentators land on Drivers to Watch (unless they followed a deep link to another page).
    if(window.IFWL_COMMENTATOR && !new URLSearchParams(location.search).get('view')){ window.switchView?.('commentatorWatch'); }

    checkTicketNotice();
    checkInboxNotice();
    checkOwnerClauseNotice();
    checkLicencePointsNotice();
    // ✅ ADDED: Season 4 checklist - Home view only (see switchView for the
    // re-check when navigating back to Home later in the same visit).
    if(document.querySelector('#viewTabs > .view-tab.active')?.dataset.view === 'home'){
      renderSeasonChecklist();
    }

    if(currentProfile) {
      renderCard(currentProfile);
      renderStaffNotices(currentProfile);
      // ✅ ADDED: re-run now that currentProfile (and so ban status) is
      // actually known - the earlier call above happens before login/profile
      // resolves, so it can only ever apply the seasonal-only overlay.
      applySeasonalOverlays();
    }
    window.applyLicenceBetaNotice?.(); // fire-and-forget - independent of profile state, shown to staff too.
    // ✅ FIXED: this page's inline <script> blocks each have their own closure
    // scope (see the note near window.IFWL_Api above) - applyLicenceBetaNotice
    // is defined in the THIRD block, so it must be called via the window
    // bridge from here (the second block), not as a bare name.
    if(!SKIP('standing')) renderQualificationStanding();
    if(!SKIP('seasonStats')) renderSeasonStatsBreakdown();
    if(!SKIP('homeV2')) renderHomeV2();
    if(!SKIP('raceTeams')) initRaceTeamsPanel();
    if(!SKIP('lmu')) renderLmuPanel();
    if(!SKIP('myTrophies')) window.initMyTrophyCabinetPanel?.();
    if(!SKIP('submitTicket')) initSubmitTicketPanel();
    if(!SKIP('lapProgress')) renderLapProgressBox();
    // Race Updates (must-confirm notices) come first; the raceday briefing waits until they are confirmed.
    (window.checkRaceUpdates ? window.checkRaceUpdates() : Promise.resolve()).then(() => checkRacedayNotifications());
    // ✅ FIXED: these six fetches (ticket/stats, available races, the full
    // driver directory, your pending request, the calling-card catalog, and
    // your own Peer Ratings given) are all independent of each other, but
    // were previously each awaited one at a time - meaning every visitor's
    // page load paid for sequential network round-trips back-to-back
    // instead of one. Running them together cuts this part of page load to
    // whichever single call is slowest, not the sum of all six.
    const [ticketInfo, perfStats, availableRaces, dir, , callingCards, myRatingsGiven] = await Promise.all([
      SKIP('ticketInfo') ? null : fetchTicketInfo(),
      SKIP('perfStats') ? null : fetchPerformanceStats(currentProfile),
      SKIP('races') ? [] : fetchAvailableRaces(),
      SKIP('directory') ? [] : fetchDirectory(),
      SKIP('myRequest') ? null : renderMyRequestPanel(),
      SKIP('callingCards') ? [] : window.IFWL_CallingCardAPI.fetchCallingCardCatalog(),
      SKIP('peerRatings') ? {} : window.IFWL_PeerRatingAPI.fetchMyPeerRatingsGiven()
    ]);
    myPeerRatingsGiven = myRatingsGiven || {};
    if(!SKIP('ticketInfo')) renderTicketData(ticketInfo);
    if(!SKIP('perfStats')) renderCardStats(perfStats);
    // ✅ CHANGED: split the one fetched list by game - "lmu" events render
    // into their own dedicated tab (hidden entirely until at least one
    // exists), everything else (the default/unset "acc" game) renders into
    // the original ACC Events tab exactly as before.
    if(!SKIP('races')) renderAllAvailableRaces(availableRaces, false);
    if(!SKIP('boards')) renderAcRallyDriverBoard(); // fire-and-forget - independent of the SimGrid list above
    if(!SKIP('boards')) renderRlDriverBoard(); // fire-and-forget - independent of the SimGrid list above
    // ✅ ADDED: "Show ALL races (staff)" toggle - only ever visible via the
    // .staff-only-tab CSS class, but wired unconditionally since it's a
    // no-op for anyone who can't see the button anyway. Assigned via
    // .onclick (not addEventListener) because init() can re-run (rules-gate
    // re-check, auth refresh) and this avoids stacking duplicate handlers.
    const availableRacesStaffToggleBtn = q('availableRacesStaffToggle');
    if(availableRacesStaffToggleBtn){
      availableRacesStaffToggleBtn.onclick = async () => {
        const nextMode = !availableRacesStaffAllMode;
        availableRacesStaffToggleBtn.disabled = true;
        try{
          const all = await fetchAvailableRaces(nextMode);
          renderAllAvailableRaces(all, nextMode);
        }catch(e){
          console.warn('Could not load all races for staff view', e);
        }finally{
          availableRacesStaffToggleBtn.disabled = false;
        }
      };
    }
    if(!SKIP('claimLaps')){ renderClaimLapsPanel('PC', 'pc-licence'); renderClaimLapsPanel('Console', 'console-licence'); }
    if(!SKIP('results')) renderRaceResultsPanel();
    q('raceResultsSearch')?.addEventListener('input', renderRaceResultsList);
    q('raceResultsPlatformFilter')?.addEventListener('change', renderRaceResultsList);
    if(!SKIP('results')){ renderAcRallyResultsPanel(); renderRlResultsPanel(); }
    if(!SKIP('directory')) renderDirectory(dir);

    const ccSelect = q('callingCardSelect');
    ccSelect.innerHTML = '<option value="">No calling card</option>' + callingCards.map(c => `<option value="${c.url}">${c.title}</option>`).join('');
    ccSelect.value = currentProfile?.callingCardUrl || '';
    ccSelect.addEventListener('change', () => {
      // Live preview only - not saved until "Save changes" is clicked
      renderCallingCardBox(ccSelect.value, currentProfile?.tier);
    });

    q('submitRequestBtn').addEventListener('click', async () => {
      const requestedTier = q('requestTierSelect').value;
      const currentRace = q('requestCurrentRaceSelect').value;
      const reason = q('requestReasonInput').value.trim();
      if(!requestedTier){ q('requestStatusBlock').innerHTML = '<div class="error">Choose a tier to request.</div>'; return; }
      if(!reason){ q('requestStatusBlock').innerHTML = '<div class="error">Tell staff why you should be reviewed for this tier.</div>'; return; }
      q('submitRequestBtn').disabled = true; q('submitRequestBtn').textContent = 'Submitting...';
      try{
        await window.IFWL_RequestAPI.submitLicenceRequest(requestedTier, reason, currentRace);
        q('requestReasonInput').value = '';
        q('requestCurrentRaceSelect').value = '';
        await renderMyRequestPanel();
      }catch(e){ q('requestStatusBlock').innerHTML = `<div class="error">Could not submit: ${e.message}</div>`; }
      finally{ q('submitRequestBtn').disabled = false; q('submitRequestBtn').textContent = 'Submit request'; }
    });

    q('modeDiscordBtn').addEventListener('click', ()=>{avatarMode='discord';q('modeDiscordBtn').classList.add('active');q('modeUrlBtn').classList.remove('active');q('avatarUrlInput').classList.add('hidden');});
    q('modeUrlBtn').addEventListener('click', ()=>{avatarMode='url';q('modeUrlBtn').classList.add('active');q('modeDiscordBtn').classList.remove('active');q('avatarUrlInput').classList.remove('hidden');});

    // Uploads save themselves immediately on success - they are never left
    // waiting on the "Save changes" button, so a successful upload can't be
    // lost by forgetting to click it afterwards.
    q('licenceUploadInput').addEventListener('change', async e=>{
      const file = e.target.files[0]; if(!file) return;
      q('saveStatus').textContent = 'Uploading photo...';
      try{
        const { url, ref } = await uploadLicenceImage(file, 'photo');
        currentProfile.avatarMode = 'upload';
        currentProfile.photoUploadUrl = url;
        currentProfile.photoUploadRef = ref;
        renderCard(currentProfile);
        await saveMyProfile({ avatarMode:'upload', photoUploadUrl: url, photoUploadRef: ref });
        q('saveStatus').textContent = 'Photo saved.';
        setTimeout(()=>q('saveStatus').textContent='',2000);
      }catch(err){ q('saveStatus').textContent = err.message; }
    });
    q('headerUploadInput').addEventListener('change', async e=>{
      const file = e.target.files[0]; if(!file) return;
      q('saveStatus').textContent = 'Uploading header...';
      try{
        const { url, ref } = await uploadLicenceImage(file, 'header');
        currentProfile.headerUploadUrl = url;
        currentProfile.headerUploadRef = ref;
        renderCard(currentProfile);
        await saveMyProfile({ headerUploadUrl: url, headerUploadRef: ref });
        q('saveStatus').textContent = 'Header saved.';
        setTimeout(()=>q('saveStatus').textContent='',2000);
      }catch(err){ q('saveStatus').textContent = err.message; }
    });

    q('saveLicenceBtn').addEventListener('click', async ()=>{
      // Images are intentionally NOT included here - they already saved
      // themselves the moment the upload succeeded, above.
      const accDriverNames = q('accDriverNamesInput').value.split(',').map(s=>s.trim()).filter(Boolean);
      const patch = {
        avatarMode,
        avatarUrl: q('avatarUrlInput').value.trim(),
        accDriverNames,
        platform: q('platformSelect').value,
        simgridUsername: q('simgridUsernameInput').value.trim(),
        steamId: q('steamIdInput').value.trim(),
        namePronunciation: q('namePronunciationInput').value.trim(),
        bio: window.IFWL_SILVER_PLUS ? q('bioInput').value.trim() : currentProfile.bio,
        ...(window.IFWL_SILVER_PLUS ? { socials: readSocialsEditor() } : {}),
        callingCardUrl: window.IFWL_SILVER_PLUS ? q('callingCardSelect').value : currentProfile.callingCardUrl,
      };
      q('saveStatus').textContent = 'Saving...';
      try{
        currentProfile = await saveMyProfile(patch);
        currentProfile = await resolveStoredImages(currentProfile);
        renderCard(currentProfile);
        // Re-check tickets and performance stats now that the linked driver name(s) may have changed
        const [freshTicketInfo, perfStats] = await Promise.all([fetchTicketInfo(), fetchPerformanceStats(currentProfile)]);
        renderTicketData(freshTicketInfo);
        renderCardStats(perfStats);
        q('saveStatus').textContent = 'Saved.';
        setTimeout(()=>q('saveStatus').textContent='',2000);
      }catch(e){ q('saveStatus').textContent = 'Could not save: '+e.message; }
    });

    q('dirSearch').addEventListener('input', ()=>{ dirCurrentPage = 0; renderDirectory(dir); });
    q('dirTierFilter').addEventListener('change', ()=>{ dirCurrentPage = 0; renderDirectory(dir); });
  }

  let gateHandlersBound = false;
  function bindDriverLinkGateHandlers(){
    if(gateHandlersBound) return;
    gateHandlersBound = true;

    // Steam64 ID isn't collected for console-only drivers - hide/show it
    // live as they pick their platform.
    q('gatePlatformSelect').addEventListener('change', () => {
      const isConsoleOnly = q('gatePlatformSelect').value === 'console';
      q('gateSteamIdField').classList.toggle('hidden', isConsoleOnly);
    });

    q('gateSaveBtn').addEventListener('click', async () => {
      const simgridUsername = q('gateSimgridUsernameInput').value.trim();
      const platform = q('gatePlatformSelect').value;
      const steamId = q('gateSteamIdInput').value.trim();
      const namePronunciation = q('gateNamePronunciationInput').value.trim();
      const errBox = q('gateError');

      const missing = [];
      if(!simgridUsername) missing.push('SimGrid username');
      if(!platform) missing.push('Platform');
      if(platform !== 'console' && !steamId) missing.push('Steam64 ID');
      if(!namePronunciation) missing.push('Name pronunciation guide');
      if(missing.length){
        errBox.textContent = `Missing: ${missing.join(', ')}.`;
        errBox.classList.remove('hidden');
        return;
      }

      q('gateSaveBtn').disabled = true; q('gateSaveBtn').textContent = 'Saving...';
      errBox.classList.add('hidden');
      try{
        await saveMyProfile({ simgridUsername, platform, steamId, namePronunciation });
        await init(); // re-checks the gate condition, which now passes
      }catch(e){
        errBox.textContent = 'Could not save: ' + e.message;
        errBox.classList.remove('hidden');
      } finally {
        q('gateSaveBtn').disabled = false; q('gateSaveBtn').textContent = 'Save and continue';
      }
    });
    q('gateLogoutBtn').addEventListener('click', () => window.IFWL_AUTH.signout());
  }
  bindDriverLinkGateHandlers();

  // ✅ ADDED: the green nudge's own "Add name" button - same underlying
  // save as everywhere else self-adding a driver name.
  q('nudgeAddNameBtn')?.addEventListener('click', async () => {
    const input = q('nudgeAccDriverNameInput');
    const status = q('nudgeAddNameStatus');
    const name = input.value.trim();
    if(!name){ status.textContent = 'Enter a name first.'; return; }
    const current = currentProfile?.accDriverNames || [];
    if(current.some(n => n.toLowerCase() === name.toLowerCase())){ status.textContent = 'Already added.'; return; }
    q('nudgeAddNameBtn').disabled = true;
    status.textContent = 'Adding...';
    try{
      const updated = [...current, name];
      currentProfile = await saveMyProfile({ accDriverNames: updated });
      renderCard(currentProfile);
      const perfStats = await fetchPerformanceStats(currentProfile);
      renderCardStats(perfStats);
      input.value = '';
      status.textContent = 'Added ✓';
    }catch(e){
      status.textContent = 'Could not add: ' + e.message;
    } finally {
      q('nudgeAddNameBtn').disabled = false;
    }
  });

  /* ---- Staff: View As simulator ---- */
  // Purely a front-end simulation - the backend always gates by the real
  // session token regardless of what's toggled here, so this can't be used
  // to actually gain or lose access, only to preview what each tier's UI
  // looks like. window.IFWL_REAL_* (set once at login, never touched here)
  // is what lets this be reversible and keeps the control itself always
  // reachable even while simulating a lower tier.
  let currentViewAs = 'real';
  function setViewAs(mode){
    currentViewAs = mode;
    const sim = {
      real:   { gold: window.IFWL_REAL_GOLD, silverPlus: window.IFWL_REAL_SILVER_PLUS, staff: window.IFWL_REAL_STAFF, owner: window.IFWL_REAL_OWNER, opsPlus: window.IFWL_REAL_OPS_PLUS, headMod: window.IFWL_REAL_HEAD_MOD },
      bronze: { gold: false, silverPlus: false, staff: false, owner: false, opsPlus: false, headMod: false },
      silver: { gold: false, silverPlus: true,  staff: false, owner: false, opsPlus: false, headMod: false },
      gold:   { gold: true,  silverPlus: true,  staff: false, owner: false, opsPlus: false, headMod: false }
    }[mode] || { gold: window.IFWL_REAL_GOLD, silverPlus: window.IFWL_REAL_SILVER_PLUS, staff: window.IFWL_REAL_STAFF, owner: window.IFWL_REAL_OWNER, opsPlus: window.IFWL_REAL_OPS_PLUS, headMod: window.IFWL_REAL_HEAD_MOD };

    window.IFWL_GOLD = sim.gold;
    window.IFWL_SILVER_PLUS = sim.silverPlus;
    window.IFWL_STAFF = sim.staff;
    window.IFWL_OWNER = sim.owner;
    window.IFWL_OPS_PLUS = sim.opsPlus;
    window.IFWL_HEAD_MOD = sim.headMod;
    document.body.classList.toggle('licence-gold', sim.gold);
    document.body.classList.toggle('licence-silver-plus', sim.silverPlus); window.applyPatronHome&&window.applyPatronHome();
    document.body.classList.toggle('staff-access', sim.staff);
    document.body.classList.toggle('owner-access', sim.owner);
    document.body.classList.toggle('ops-access', sim.opsPlus);
    document.body.classList.toggle('headmod-access', sim.headMod);
    applyAccentTheme();
    applyDarkTheme();

    document.querySelectorAll('.view-as-btn').forEach(b => b.classList.toggle('active', b.dataset.viewAs === mode));
    const tag = q('viewAsActiveTag');
    if(mode === 'real'){ tag.classList.add('hidden'); }
    else { tag.classList.remove('hidden'); tag.textContent = `Viewing as: ${mode[0].toUpperCase()+mode.slice(1)}`; }

    // Editing while simulating a lower tier would read the REAL flags for
    // some fields and the SIMULATED ones for others depending on code path -
    // simplest to just block saving outright until back to the real view,
    // rather than risk a confusing partial save.
    const saveBtn = q('saveLicenceBtn');
    if(saveBtn){
      saveBtn.disabled = mode !== 'real';
      saveBtn.title = mode !== 'real' ? 'Exit View As to edit your own profile' : '';
    }

    switchView('home'); // avoid landing on a tab that just got hidden by the simulated tier
    renderQualificationStanding();
    renderSeasonStatsBreakdown();
    renderHomeV2();
    // ✅ ADDED: re-fetch the Game Liveries tabs under the simulated tier so
    // their locked/unlocked cards actually reflect "View As" too - see
    // fetchPatreonLiveries()'s simulateTier param above.
    if(typeof initGameLiveriesPanels === 'function') initGameLiveriesPanels();
  }
  document.querySelectorAll('[data-view-as]').forEach(btn => {
    btn.addEventListener('click', () => setViewAs(btn.dataset.viewAs));
  });

  /* ---- View tabs: tabbed navigation instead of one long scrolling page ---- */
  function switchView(view){
    if(window.IFWL_PAGE_ROUTE && window.IFWL_PAGE_ROUTE(view)) return; /* split pages: views that live on another page navigate there */
    document.querySelectorAll('.view-panel').forEach(el => {
      el.classList.toggle('is-active-view', el.dataset.view === view);
    });
    document.querySelectorAll('#viewTabs .view-tab').forEach(btn => btn.classList.remove('active'));
    const directTab = document.querySelector(`#viewTabs > .view-tab[data-view="${view}"]`);
    if(directTab) directTab.classList.add('active');
    const dropdownItem = document.querySelector(`.view-tab-menu [data-view="${view}"]`);
    if(dropdownItem){
      const toggle = dropdownItem.closest('.view-tab-dropdown')?.querySelector('.dropdown-toggle');
      toggle?.classList.add('active');
    }
    document.querySelectorAll('.view-tab-dropdown').forEach(d => d.classList.remove('open'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // ✅ ADDED: Season 4 checklist re-check - Home only, so navigating away
    // and back doesn't need a full page reload to see it again.
    if(view === 'home') window.renderSeasonChecklist?.();
    window.applyPatronHome?.();
  }
  window.switchView = switchView;
  document.querySelectorAll('#viewTabs [data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  // ✅ FIXED: My Race Team now lives on its own standalone page
  // (raceteamnew.html) - this nav item used to be a data-view button that
  // switched to the old in-page panel here, which meant it silently kept
  // showing the superseded Licence Centre version instead of actually
  // sending people to the new page.
  q('navMyRaceTeamBtn')?.addEventListener('click', () => { location.href = 'raceteamnew.html'; });
  q('navWeatherPlannerBtn')?.addEventListener('click', () => { location.href = 'weather.html'; });
  // ✅ ADDED: Live Timings moved from the old top utility strip onto the
  // main menu (after Available Races, before Racing) - same external-page
  // pattern as My Race Team/My Career/Weather Planner above.
  q('navLiveTimingsBtn')?.addEventListener('click', () => { location.href = 'livetimings.html'; });
  // ✅ CHANGED: My Season Progression, the driver-facing Career Shop and
  // Career Perks now live on their own standalone page (career.html),
  // same reasoning and same pattern as My Race Team above - staff admin
  // (Sponsorships, Seasonal Costs, Season Start Payments, Welcome Bonus,
  // Race Earnings Settlement, the IFWL Shop catalog editor) all stay here.
  q('navMyCareerBtn')?.addEventListener('click', () => { location.href = 'career.html'; });
  // ✅ ADDED: tranche 2 Home quick-action icons - profile/messages/career/report.
  q('quickEditProfileBtn')?.addEventListener('click', () => switchView('editProfile'));
  q('quickMessagesBtn')?.addEventListener('click', () => switchView('inbox'));
  q('quickCareerBtn')?.addEventListener('click', () => { location.href = 'career.html'; });
  q('quickReportBtn')?.addEventListener('click', () => switchView('submitTicket'));
  q('editProfileBackBtn')?.addEventListener('click', () => switchView('home'));
  document.querySelectorAll('.view-tab-dropdown').forEach(dropdown => {
    const toggle = dropdown.querySelector('.dropdown-toggle');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = dropdown.classList.contains('open');
      document.querySelectorAll('.view-tab-dropdown').forEach(d => d.classList.remove('open'));
      if(!wasOpen) dropdown.classList.add('open');
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.view-tab-dropdown').forEach(d => d.classList.remove('open'));
  });
  // ✅ ADDED: without this, clicking a Staff accordion category header (e.g.
  // "Season & Qualification") bubbles up to the document click listener
  // above and closes the entire Staff dropdown before the category even
  // has a chance to expand - same stopPropagation pattern the main
  // dropdown-toggle buttons already use.
  document.querySelectorAll('.staff-accordion-group > summary').forEach(summary => {
    summary.addEventListener('click', (e) => e.stopPropagation());
  });
  {
    // Deep link from the Discord schedule post: licence.html?view=availableRaces
    let startView = (window.IFWL_PAGE && window.IFWL_PAGE.defaultView) || 'home';
    try{
      const wanted = new URLSearchParams(location.search).get('view');
      if(wanted && /^[A-Za-z]+$/.test(wanted) && document.querySelector(`.view-panel[data-view="${wanted}"]`) && !wanted.startsWith('staff')) startView = wanted;
    }catch(e){}
    switchView(startView); // default view on load
  }

  // ✅ ADDED: homepage system status banner - runs regardless of login state,
  // since staff messaging like "this feature is in beta" is useful to show
  // even before someone's logged in.
  async function renderSystemStatusBanner(){
    let status;
    try{ status = await window.IFWL_StatusAPI.fetchSystemStatus(); }
    catch(e){ return; }
    const banner = q('systemStatusBanner');
    if(!banner || !status.active){ banner?.classList.add('hidden'); return; }

    const todayStr = new Date().toISOString().slice(0, 10);
    if(status.startDate && todayStr < status.startDate){ banner.classList.add('hidden'); return; }
    if(status.endDate && todayStr > status.endDate){ banner.classList.add('hidden'); return; }

    q('systemStatusTitle').textContent = status.title || 'System Status';
    q('systemStatusMessage').textContent = status.message || '';
    banner.classList.remove('hidden');
  }
  renderSystemStatusBanner();
  window.renderSystemStatusBanner = renderSystemStatusBanner;

  // ✅ ADDED: Submit a Ticket - replaces ticketportal.html's direct-Firestore
  // client writes with the same rtGate-routed pattern everything else on
  // this page uses. See submitTicket/legacyDriverRoster/ticketTrackList in
  // index.js for the backend half (that's also where the Discord webhook
  // now lives, instead of sitting exposed in client JS like the old portal).
  let ticketLicenceRoster = [];
  let ticketLegacyRoster = [];

  function ticketSafeStr(v){ return (typeof v === 'string' ? v : '').trim(); }
  function ticketExtractNumbers(text){ const nums = String(text||'').match(/\d+/g); return nums ? nums.join('') : ''; }

  async function loadTicketLicenceRoster(){
    try{
      const r = await fetch(`${FN}?licenceRoster=1`);
      const data = await r.json();
      const roster = Array.isArray(data.drivers) ? data.drivers : [];
      const entries = [];
      roster.forEach(p => (p.accDriverNames||[]).forEach(n => {
        const name = ticketSafeStr(n);
        if(!name) return;
        entries.push({ fullName:name, number:ticketExtractNumbers(name), tier: ticketSafeStr(p.tier||''), licenceNumber: ticketSafeStr(p.licenceNumber||''), searchText:`${name} ${p.licenceNumber||''}`.toLowerCase() });
      }));
      ticketLicenceRoster = entries;
    }catch(e){ console.warn('Could not load licence roster for ticket form', e); ticketLicenceRoster = []; }
  }

  async function loadTicketLegacyRoster(){
    try{
      const data = await apiGet('legacyDriverRoster');
      const rows = Array.isArray(data.drivers) ? data.drivers : [];
      const withText = rows.map(d => ({...d, searchText:`${d.fullName} ${d.name} ${d.number} ${ticketExtractNumbers(d.fullName)}`.toLowerCase().replace(/\s+/g,' ').trim()}));
      const numbered = withText.filter(d => !isNaN(parseInt(d.number,10)));
      const unnumbered = withText.filter(d => isNaN(parseInt(d.number,10)));
      numbered.sort((a,b) => parseInt(a.number,10)-parseInt(b.number,10));
      unnumbered.sort((a,b) => a.fullName.localeCompare(b.fullName));
      ticketLegacyRoster = [...numbered, ...unnumbered];
    }catch(e){ console.warn('Could not load legacy driver roster for ticket form', e); ticketLegacyRoster = []; }
  }

  async function loadTicketTrackList(){
    // Season dropdown follows the Season Window label staff set (no hard-coded season).
    try{
      const seasonSel = q('ticketSeasonSelect');
      if(seasonSel){
        let label = '';
        try{ label = String((await window.IFWL_SeasonAPI.fetchSeasonWindow()).label || '').trim(); }catch(e){}
        if(!label) label = 'Season 4';
        seasonSel.innerHTML = '';
        const o = document.createElement('option'); o.value = label; o.textContent = label; o.selected = true;
        seasonSel.appendChild(o);
      }
    }catch(e){ console.warn('Could not set ticket season', e); }
    const select = q('ticketTrackSelect');
    if(!select) return;
    let tracks = [];
    try{ tracks = (await apiGet('ticketTrackList')).tracks || []; }
    catch(e){ console.warn('Could not load track list', e); }
    select.innerHTML = '<option value="" disabled selected>Select a track...</option>' +
      tracks.map(t => `<option value="${t}">${t}</option>`).join('') +
      '<option value="__ADD_NEW__">+ Add New Track...</option>';
    select.addEventListener('change', () => {
      q('ticketNewTrackContainer').classList.toggle('hidden', select.value !== '__ADD_NEW__');
    });
  }

  function setupTicketAccusedPicker(){
    const searchInput = q('ticketAccusedSearch');
    const resultsEl = q('ticketAccusedResults');
    const hiddenSelect = q('ticketAccusedSelect');
    const manualBtn = q('ticketAccusedManualBtn');
    const clearBtn = q('ticketAccusedClearBtn');
    const manualContainer = q('ticketNewDriverContainer');
    const manualNameInput = q('ticketNewDriverInput');
    const manualNumberInput = q('ticketNewDriverNumber');
    if(!searchInput) return;

    function closeResults(){ resultsEl.classList.add('hidden'); resultsEl.innerHTML=''; }
    function openResults(){ resultsEl.classList.remove('hidden'); }

    function pickDriver(fullName){
      const name = fullName || '';
      if(name && !Array.from(hiddenSelect.options).some(o => o.value === name)){
        const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
        hiddenSelect.appendChild(opt);
      }
      hiddenSelect.value = name;
      searchInput.value = name;
      manualContainer.classList.add('hidden');
      manualNameInput.value = ''; manualNumberInput.value = '';
      closeResults();
    }
    function showManual(prefillQuery){
      hiddenSelect.value = '__ADD_NEW__';
      const q2 = ticketSafeStr(prefillQuery);
      if(q2 && /^\d+$/.test(q2)){ manualNumberInput.value = q2; manualNameInput.value=''; }
      else{ manualNameInput.value = q2; }
      manualContainer.classList.remove('hidden');
      closeResults();
      setTimeout(() => manualNameInput.focus(), 50);
    }

    function filterLicence(qtext){ const q2 = qtext.toLowerCase(); return q2 ? ticketLicenceRoster.filter(d => d.searchText.includes(q2)) : []; }
    function filterLegacy(qtext){ const q2 = qtext.toLowerCase(); return q2 ? ticketLegacyRoster.filter(d => d.searchText.includes(q2)) : []; }

    searchInput.addEventListener('input', () => {
      const qtext = ticketSafeStr(searchInput.value);
      if(!qtext){ hiddenSelect.value=''; closeResults(); return; }
      const licenceMatches = filterLicence(qtext).slice(0,15);
      const legacyMatches = filterLegacy(qtext).slice(0,30);
      resultsEl.innerHTML = '';

      if(!licenceMatches.length && !legacyMatches.length){
        openResults();
        resultsEl.innerHTML = `<div class="no-results"><div>No results for "${qtext.replace(/</g,'&lt;')}"</div>
          <div style="margin-top:8px"><button type="button" class="btn ghost" id="ticketAddNewFromSearch" style="font-size:11px">+ Add this driver</button></div></div>`;
        q('ticketAddNewFromSearch').addEventListener('click', () => showManual(qtext));
        return;
      }
      openResults();
      if(licenceMatches.length){
        const header = document.createElement('div');
        header.className = 'result-section-header';
        header.textContent = 'Licensed IFWL Drivers';
        resultsEl.appendChild(header);
        licenceMatches.forEach(d => {
          const item = document.createElement('div');
          item.className = 'result-item';
          item.innerHTML = `<div>${d.fullName.replace(/</g,'&lt;')}${d.tier?`<span class="licence-tier-tag">${d.tier}</span>`:''}</div><div class="result-meta">${d.licenceNumber||''}</div>`;
          item.addEventListener('click', () => pickDriver(d.fullName));
          resultsEl.appendChild(item);
        });
      }
      if(legacyMatches.length){
        if(licenceMatches.length){
          const header2 = document.createElement('div');
          header2.className = 'result-section-header';
          header2.textContent = 'All Drivers';
          resultsEl.appendChild(header2);
        }
        legacyMatches.forEach(d => {
          const item = document.createElement('div');
          item.className = 'result-item';
          item.innerHTML = `<div>${d.fullName.replace(/</g,'&lt;')}</div><div class="result-meta">${d.number?'#'+d.number:''}</div>`;
          item.addEventListener('click', () => pickDriver(d.fullName));
          resultsEl.appendChild(item);
        });
      }
    });

    document.addEventListener('click', (e) => {
      if(!searchInput.closest('.driver-picker')?.contains(e.target)) closeResults();
    });
    searchInput.addEventListener('keydown', (e) => {
      if(e.key !== 'Enter') return;
      e.preventDefault();
      const qtext = ticketSafeStr(searchInput.value);
      if(!qtext) return;
      const licenceMatches = filterLicence(qtext), legacyMatches = filterLegacy(qtext);
      if(licenceMatches.length===1 && !legacyMatches.length) pickDriver(licenceMatches[0].fullName);
      else if(legacyMatches.length===1 && !licenceMatches.length) pickDriver(legacyMatches[0].fullName);
      else if(!licenceMatches.length && !legacyMatches.length) showManual(qtext);
    });
    manualBtn.addEventListener('click', () => showManual(searchInput.value));
    clearBtn.addEventListener('click', () => {
      searchInput.value=''; hiddenSelect.value=''; manualContainer.classList.add('hidden');
      manualNameInput.value=''; manualNumberInput.value=''; closeResults();
    });
  }

  function ticketOpenGuidanceModal(){ q('ticketGuidanceModal').classList.remove('hidden'); }
  function ticketCloseGuidanceModal(){ q('ticketGuidanceModal').classList.add('hidden'); }

  let ticketSelectedVideoFile = null;

  async function uploadTicketVideo(file){
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const form = new FormData();
    form.append('file', file);
    form.append('kind', 'ticketVideo');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 100MB can genuinely take minutes
    let r;
    try{
      r = await fetch(`${UPLOAD_FN}?token=${encodeURIComponent(token)}&kind=ticketVideo`, { method:'POST', body: form, signal: controller.signal });
    }catch(err){
      if(err.name === 'AbortError') throw new Error('Video upload timed out after 5 minutes - try a smaller file or check your connection.');
      throw err;
    }finally{
      clearTimeout(timeout);
    }
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d?.error || 'Video upload failed');
    return d.url;
  }

  // ✅ ADDED: League Livery zip upload - same shape as uploadTicketVideo
  // above (a dedicated small fetch, not the shared uploadLicenceImage
  // helper) because that helper hardcodes a 5MB client-side cap; liveries
  // need up to 60MB, matching the server's rtLicenceImageUpload limit for
  // kind=liveryFile.
  async function uploadLiveryZip(file){
    if(file.size > 60*1024*1024) throw new Error('That file is over 60MB. Please choose a smaller zip.');
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const form = new FormData();
    form.append('file', file);
    form.append('kind', 'liveryFile');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3 * 60 * 1000);
    let r;
    try{
      r = await fetch(`${UPLOAD_FN}?token=${encodeURIComponent(token)}&kind=liveryFile`, { method:'POST', body: form, signal: controller.signal });
    }catch(err){
      if(err.name === 'AbortError') throw new Error('Livery upload timed out after 3 minutes - try a smaller file or check your connection.');
      throw err;
    }finally{
      clearTimeout(timeout);
    }
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d?.error || 'Livery upload failed');
    return d.url;
  }
  // ✅ FIXED: this page's inline <script> blocks each have their own
  // top-level closure - a plain function declared in one isn't visible in
  // another. uploadLiveryZip is defined in this block but called from the
  // IFWL Shop admin panel's script block further down, so - same fix as
  // uploadLicenceImage above - it needs to be exposed on window to be
  // reachable there.
  window.IFWL_UploadAPI = window.IFWL_UploadAPI || {};
  window.IFWL_UploadAPI.uploadLiveryZip = uploadLiveryZip;

  // ---------------------------
  // ✅ ADDED: ACC Liveries (Tools > ACC Liveries) - a Patreon-tier-gated
  // livery catalog, separate from the League Liveries upload above (Career
  // Shop) and from Race Team Liveries (per-team, password-gated). Same
  // "dedicated small fetch instead of uploadLicenceImage" reasoning as
  // uploadLiveryZip above - liveries need a much bigger cap than 5MB.
  // ---------------------------
  async function uploadPatreonLiveryZip(file, game){
    if(file.size > 60*1024*1024) throw new Error('That file is over 60MB. Please choose a smaller zip.');
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const form = new FormData();
    form.append('file', file);
    form.append('kind', 'patreonLivery');
    form.append('fileName', file.name);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3 * 60 * 1000);
    let r;
    try{
      r = await fetch(`${UPLOAD_FN}?token=${encodeURIComponent(token)}&kind=patreonLivery&game=${encodeURIComponent(game)}`, { method:'POST', body: form, signal: controller.signal });
    }catch(err){
      if(err.name === 'AbortError') throw new Error('Livery upload timed out after 3 minutes - try a smaller file or check your connection.');
      throw err;
    }finally{
      clearTimeout(timeout);
    }
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d?.error || 'Livery upload failed');
    return d;
  }
  window.IFWL_UploadAPI.uploadPatreonLiveryZip = uploadPatreonLiveryZip;

  // ✅ CHANGED: now also passes the staff "View As" simulator's current mode
  // (if any) as simulateTier - the backend only honours this for a real
  // staff session (see patreonLiveryList in rtgate.js), so this lets staff
  // genuinely preview a Bronze/Silver/Gold member's locked/unlocked cards
  // without needing a second real account. currentViewAs is declared above
  // in this same script block (Staff: View As simulator).
  async function fetchPatreonLiveries(game){
    const simParam = (typeof currentViewAs !== 'undefined' && currentViewAs !== 'real') ? `&simulateTier=${encodeURIComponent(currentViewAs)}` : '';
    return apiGet('patreonLiveryList', `&game=${encodeURIComponent(game||'acc')}${simParam}`);
  }
  async function savePatreonLivery(payload){ return apiPost('patreonLiverySave', payload); }
  async function deletePatreonLivery(id){ return apiPost('patreonLiveryDelete', { id }); }
  // ✅ FIXED: same cross-script-block visibility issue as uploadLiveryZip
  // above - the staff management panel (Manage ACC Liveries) lives in a
  // separate <script> block further down, so this needs exposing too.
  window.IFWL_PatreonLiveryAPI = { fetchPatreonLiveries, savePatreonLivery, deletePatreonLivery };

  // ✅ ADDED: this script block doesn't have its own top-level esc() helper
  // (each of this page's inline <script> blocks is a separate closure, and
  // the one that defines esc() is the small AUTH block above this one) -
  // needed here because car/notes come from whoever uploaded the livery.
  const accEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function accLiveryTierLabel(t){
    return t === 'bronze' ? 'Bronze Patreon+' : t === 'silver' ? 'Silver Patreon+' : t === 'gold' ? 'Gold Patreon' : 'Free for all';
  }
  function accLiveryCardHtml(l){
    const tierClass = (l.gateTier === 'bronze' || l.gateTier === 'silver' || l.gateTier === 'gold') ? l.gateTier : 'all';
    const bg = l.previewUrl ? ` style="background-image:linear-gradient(180deg,rgba(8,10,13,.05),rgba(8,10,13,.55) 55%,rgba(8,10,13,.95)),url('${l.previewUrl.replace(/'/g,"%27")}')"` : '';
    const sizeLabel = l.sizeBytes ? `${(l.sizeBytes/1024/1024).toFixed(1)}MB` : '';
    const metaLine = [accEsc(l.fileName||''), sizeLabel].filter(Boolean).join(' &middot; ');
    return `
      <div class="acc-livery-card tier-${tierClass}"${bg}>
        <div class="acc-livery-card-overlay">
          <span class="acc-livery-tier-badge ${tierClass}">${accLiveryTierLabel(l.gateTier)}</span>
          <h4>${accEsc(l.car)}</h4>
          ${l.notes ? `<div class="acc-livery-card-meta">${accEsc(l.notes)}</div>` : ''}
          ${l.locked
            ? `<div class="acc-livery-locked-note">Requires ${accLiveryTierLabel(l.gateTier)} to download.</div><a class="gold-upsell-btn" href="https://www.patreon.com/c/IFWL" target="_blank" rel="noopener">Upgrade on Patreon &rarr;</a>`
            : `${metaLine ? `<div class="acc-livery-card-meta">${metaLine}</div>` : ''}<a class="btn teal" href="${l.url}" target="_blank" rel="noopener">Download Now</a>`}
        </div>
      </div>
    `;
  }
  async function renderGameLiveriesBody(game, bodyElId){
    const body = q(bodyElId);
    if(!body) return;
    body.innerHTML = '<div class="empty">Loading&hellip;</div>';
    let data;
    try{ data = await fetchPatreonLiveries(game); }
    catch(e){ body.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }
    const liveries = data.liveries || [];
    if(!liveries.length){ body.innerHTML = '<div class="empty">No liveries uploaded yet - check back soon.</div>'; return; }
    body.innerHTML = `<div class="acc-livery-grid">${liveries.map(accLiveryCardHtml).join('')}</div>`;
  }
  // ✅ CHANGED: ACC Liveries was the first game wired up on the frontend;
  // LMU and ETS2 reuse the exact same panel/card markup and gating logic,
  // just filtered to a different `game` and rendered into their own tab -
  // this list is the only thing that needs extending for a future game.
  const GAME_LIVERY_TABS = [
    { game: 'acc', panelId: 'accLiveriesPanel', bodyId: 'accLiveriesBody' },
    { game: 'lmu', panelId: 'lmuLiveriesPanel', bodyId: 'lmuLiveriesBody' },
    { game: 'ets2', panelId: 'ets2LiveriesPanel', bodyId: 'ets2LiveriesBody' }
  ];
  function initGameLiveriesPanels(){
    if(!window.IFWL_META) return;
    if(SKIP('liveries')) return;
    GAME_LIVERY_TABS.forEach(t => {
      if(q(t.panelId)) renderGameLiveriesBody(t.game, t.bodyId);
    });
  }
  initGameLiveriesPanels();
  window.addEventListener('ifwl-auth-changed', initGameLiveriesPanels);

  async function initSubmitTicketPanel(){
    if(!q('submitTicketPanel')) return;
    const reportingAs = q('ticketReportingAs');
    if(reportingAs && currentProfile){
      const name = (currentProfile.accDriverNames||[])[0] || currentProfile.name || 'you';
      reportingAs.textContent = `Reporting as: ${name}`;
    }
    await Promise.all([loadTicketLicenceRoster(), loadTicketLegacyRoster(), loadTicketTrackList()]);
    setupTicketAccusedPicker();

    // ✅ ADDED: Gold Patreon perk - video evidence upload, up to 100MB,
    // attached directly to the ticket instead of relying on an external
    // host. Bronze/Silver/free see a locked upsell message instead.
    const isGoldOrStaff = window.IFWL_GOLD || window.IFWL_STAFF;
    q('ticketVideoGoldField').classList.toggle('hidden', !isGoldOrStaff);
    q('ticketVideoLockedField').classList.toggle('hidden', isGoldOrStaff);

    const videoInput = q('ticketVideoInput');
    const videoStatus = q('ticketVideoStatus');
    ticketSelectedVideoFile = null;
    videoInput?.addEventListener('change', () => {
      const file = videoInput.files[0];
      if(!file){ ticketSelectedVideoFile = null; videoStatus.textContent = ''; return; }
      if(file.size > 100 * 1024 * 1024){
        videoStatus.textContent = 'That file is over 100MB - please choose a smaller video.';
        videoStatus.className = 'field-hint error';
        videoInput.value = '';
        ticketSelectedVideoFile = null;
        return;
      }
      ticketSelectedVideoFile = file;
      videoStatus.textContent = `Selected: ${file.name} (${(file.size/1024/1024).toFixed(1)}MB) - will upload when you submit.`;
      videoStatus.className = 'field-hint';
    });

    const statusMsg = q('ticketStatusMsg');
    const submitBtn = q('ticketSubmitBtn');

    function validateForm(){
      const competition = q('ticketCompetitionSelect').value;
      const summary = ticketSafeStr(q('ticketFullIncident').value);
      let accused = q('ticketAccusedSelect').value;
      const accusedNameManual = ticketSafeStr(q('ticketNewDriverInput').value);
      const accusedValid = (accused && accused !== '__ADD_NEW__') || (accused === '__ADD_NEW__' && accusedNameManual);
      if(!competition || !accusedValid || !summary){
        statusMsg.textContent = 'Please fill in all required fields: Accused, Competition, Full Incident Summary.';
        statusMsg.className = 'save-status error';
        return false;
      }
      return true;
    }

    submitBtn.addEventListener('click', () => {
      if(!validateForm()) return;
      statusMsg.textContent = ''; statusMsg.className = 'save-status';
      ticketOpenGuidanceModal();
    });
    q('ticketModalCancelBtn').addEventListener('click', ticketCloseGuidanceModal);
    q('ticketModalConfirmBtn').addEventListener('click', async () => {
      ticketCloseGuidanceModal();
      submitBtn.disabled = true;

      let videoProofUrl = '';
      if(isGoldOrStaff && ticketSelectedVideoFile){
        statusMsg.textContent = 'Uploading video - this can take a minute for larger files...';
        statusMsg.className = 'save-status';
        try{
          videoProofUrl = await uploadTicketVideo(ticketSelectedVideoFile);
        }catch(e){
          statusMsg.textContent = 'Error uploading video: ' + e.message;
          statusMsg.className = 'save-status error';
          submitBtn.disabled = false;
          return;
        }
      }

      try{
        statusMsg.textContent = 'Submitting...'; statusMsg.className = 'save-status';
        const result = await apiPost('submitTicket', {
          accused: q('ticketAccusedSelect').value,
          accusedNameManual: ticketSafeStr(q('ticketNewDriverInput').value),
          accusedNumberManual: ticketSafeStr(q('ticketNewDriverNumber').value),
          competition: q('ticketCompetitionSelect').value,
          fullIncident: ticketSafeStr(q('ticketFullIncident').value),
          event: q('ticketEventSelect').value,
          proofUrl: ticketSafeStr(q('ticketProofUrl').value),
          videoProofUrl,
          season: q('ticketSeasonSelect').value,
          track: q('ticketTrackSelect').value,
          newTrackName: ticketSafeStr(q('ticketNewTrackInput').value)
        });
        statusMsg.textContent = `Ticket submitted (ID: ${result.id}). Thank you!`;
        statusMsg.className = 'save-status success';

        q('ticketAccusedSearch').value = ''; q('ticketAccusedSelect').value = '';
        q('ticketNewDriverContainer').classList.add('hidden');
        q('ticketNewDriverInput').value = ''; q('ticketNewDriverNumber').value = '';
        q('ticketFullIncident').value = '';
        q('ticketEventSelect').value = 'Practice';
        q('ticketProofUrl').value = '';
        q('ticketTrackSelect').value = '';
        q('ticketNewTrackContainer').classList.add('hidden');
        q('ticketNewTrackInput').value = '';
        q('ticketCompetitionSelect').value = '';
        if(videoInput) videoInput.value = '';
        ticketSelectedVideoFile = null;
        if(videoStatus) videoStatus.textContent = '';

        // A new ticket may now match this driver's own Ticket History (if
        // they're both parties, or filed on themselves) - refresh it.
        try{ renderTicketData(await fetchTicketInfo()); }catch(e){}
      }catch(e){
        statusMsg.textContent = 'Error submitting ticket: ' + e.message;
        statusMsg.className = 'save-status error';
      }finally{
        submitBtn.disabled = false;
      }
    });
  }

  q('toggleTiersBtn')?.addEventListener('click', () => {
    const panel = q('tierLegendPanel');
    const collapsed = panel.classList.toggle('tier-collapsed');
    q('toggleTiersBtn').textContent = collapsed ? 'View licence tier ladder' : 'Hide licence tier ladder';
  });

  // ✅ ADDED: Fuel Calculator - full race strategy simulator
  const FC_TRACKS = [
    'barcelona','brands_hatch','cota','donington','hungaroring','imola','indianapolis',
    'kyalami','laguna_seca','misano','monza','mount_panorama','nurburgring','nurburgring_24h',
    'oulton_park','paul_ricard','red_bull_ring','silverstone','snetterton','spa','suzuka',
    'valencia','watkins_glen','zandvoort','zolder'
  ];

  function fcPopulateTrackSelect(){
    const sel = q('fcTrackSelect');
    if(!sel) return;
    sel.innerHTML = '<option value="">Select a track&hellip;</option>' +
      FC_TRACKS.map(t => `<option value="${t}">${t.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</option>`).join('');
  }

  function fcParseLapTime(str){
    // Accepts "1:54.682" or "114.682" or "1:54"
    const s = String(str || '').trim();
    if(!s) return null;
    const m = s.match(/^(\d+):(\d+(?:\.\d+)?)$/);
    if(m) return (Number(m[1]) * 60) + Number(m[2]);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function fcFormatLapTime(sec){
    const m = Math.floor(sec / 60);
    const s = sec - (m * 60);
    return `${m}:${s.toFixed(3).padStart(6,'0')}`;
  }

  function fcFormatClock(sec){
    const totalSec = Math.round(sec);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  }

  async function fcAutofillLapTime(){
    const status = q('fcAutofillStatus');
    const track = q('fcTrackSelect').value;
    if(!track){ status.textContent = 'Pick a track first.'; return; }
    if(!currentProfile?.accDriverNames?.length){ status.textContent = 'Link your ACC driver name(s) on My Licence first.'; return; }

    status.textContent = 'Looking through your recent sessions...';
    try{
      const allRows = await window.IFWLStats.buildAllRows();
      const aliasKeys = currentProfile.accDriverNames.map(n => window.IFWLStats.driverNameKey(n));
      const myRows = allRows.filter(r => aliasKeys.includes(window.IFWLStats.driverNameKey(r.driver)) && r.track === track);

      const cleanLaps = [];
      myRows.forEach(r => (r.lapObjects || []).forEach(l => {
        if(l.isValidForBest !== false && Number.isFinite(l.laptime) && l.laptime > 0) cleanLaps.push(l.laptime);
      }));

      if(!cleanLaps.length){
        status.textContent = `No clean laps found for you on this track yet - enter your average lap time manually.`;
        return;
      }

      const avgMs = cleanLaps.reduce((a,b)=>a+b,0) / cleanLaps.length;
      q('fcAvgLap').value = fcFormatLapTime(avgMs / 1000);
      status.textContent = `Filled from ${cleanLaps.length} of your clean laps at this track.`;
    }catch(e){
      status.textContent = 'Could not autofill: ' + e.message;
    }
  }

  // ============================================================
  // FUEL CALCULATOR - core simulation
  //
  // Stint boundaries are now driven by whichever comes first: the tank
  // running dry, or a mandatory-stop checkpoint being reached. This fixes a
  // real gap in the original version - with 0 MANDATORY stops configured it
  // would happily plan a single 700-lap stint needing 2000+ litres, when in
  // reality a car always has to stop once its tank runs out regardless of
  // any mandatory-stop rule. Mandatory stops are a MINIMUM requirement
  // layered on top of that physical reality, not the only reason to pit.
  // ============================================================

  function fcBuildPlan(p, avgLapSec, fuelPerLap, totalLapsOverride){
    function buildStintsForLapCount(totalLaps){
      const windowStartLap = Math.round((p.pitWindowStart/100) * totalLaps);
      const windowEndLap = Math.round((p.pitWindowEnd/100) * totalLaps);
      const span = Math.max(1, windowEndLap - windowStartLap);
      const mandatoryTargets = [];
      for(let i=1;i<=p.numStops;i++){
        mandatoryTargets.push(Math.round(windowStartLap + (span * i)/(p.numStops+1)));
      }

      const stints = [];
      const stopReasons = []; // one entry per pit stop between stints
      let current = { laps: [], fuelUsed: 0 };
      let nextMandatoryIdx = 0;

      for(let lap=1; lap<=totalLaps; lap++){
        const pct = (lap / totalLaps) * 100;
        const isWet = p.wetEnabled && pct >= p.wetStart && pct <= p.wetEnd;
        const fuelThisLap = fuelPerLap * (isWet ? p.wetFuelMult : 1);

        const tankWouldOverflow = current.laps.length > 0 && (current.fuelUsed + fuelThisLap) > p.tankCapacity;
        const hitMandatoryCheckpoint = current.laps.length > 0 && nextMandatoryIdx < mandatoryTargets.length && lap >= mandatoryTargets[nextMandatoryIdx];

        if(tankWouldOverflow || hitMandatoryCheckpoint){
          stints.push(current);
          const stopLap = lap - 1;
          let satisfiesMandatory = false;
          if(nextMandatoryIdx < mandatoryTargets.length && stopLap >= windowStartLap && stopLap <= windowEndLap){
            nextMandatoryIdx++;
            satisfiesMandatory = true;
          }
          stopReasons.push(
            tankWouldOverflow && satisfiesMandatory ? 'Fuel + Mandatory'
            : tankWouldOverflow ? 'Fuel required'
            : 'Mandatory'
          );
          current = { laps: [], fuelUsed: 0 };
        }

        current.laps.push({ lap, isWet });
        current.fuelUsed += fuelThisLap;
      }
      stints.push(current);

      return {
        stints, stopReasons,
        mandatoryUnsatisfied: Math.max(0, p.numStops - nextMandatoryIdx)
      };
    }

    function timeAndFuelForStints(stints){
      let totalTimeSec = p.hasFormationLap ? avgLapSec : 0;
      let totalFuel = p.hasFormationLap ? fuelPerLap : 0;

      const resultStints = stints.map((stint) => {
        const lapFuels = stint.laps.map(l => fuelPerLap * (l.isWet ? p.wetFuelMult : 1));
        const stintFuelTotal = lapFuels.reduce((a,b)=>a+b, 0);
        let fuelRemaining = stintFuelTotal;
        let stintTime = 0;

        stint.laps.forEach((l, i) => {
          const fuelBurn = lapFuels[i];
          const fuelEffectSec = p.fuelEffectEnabled ? (fuelRemaining * p.secPerLitre) : 0;
          const wetPenaltySec = l.isWet ? (avgLapSec * (p.wetLapPenaltyPct/100)) : 0;
          stintTime += avgLapSec + fuelEffectSec + wetPenaltySec;
          fuelRemaining -= fuelBurn;
        });

        totalTimeSec += stintTime;
        const wetLapCount = stint.laps.filter(l => l.isWet).length;
        return { lapCount: stint.laps.length, fuelNeeded: stintFuelTotal, wetLapCount };
      });

      totalTimeSec += Math.max(0, resultStints.length - 1) * p.pitLossSec;
      totalFuel += resultStints.reduce((sum, s) => sum + s.fuelNeeded, 0);
      return { totalTimeSec, totalFuel, stints: resultStints };
    }

    let totalLaps;
    if(totalLapsOverride){
      totalLaps = totalLapsOverride;
    }else if(p.mode === 'laps'){
      totalLaps = p.totalLaps;
    }else{
      totalLaps = Math.max(1, Math.round(p.durationSec / avgLapSec));
      for(let i=0;i<25;i++){
        const { stints } = buildStintsForLapCount(totalLaps);
        const { totalTimeSec } = timeAndFuelForStints(stints);
        if(totalTimeSec >= p.durationSec) break;
        totalLaps += 1;
      }
    }

    const { stints, stopReasons, mandatoryUnsatisfied } = buildStintsForLapCount(totalLaps);
    const timing = timeAndFuelForStints(stints);

    // Merge stop reasons + safety margin (final stint only) into the final result
    const finalStints = timing.stints.map((s, i) => ({
      stintNumber: i+1,
      lapCount: s.lapCount,
      fuelNeeded: s.fuelNeeded,
      wetLapCount: s.wetLapCount,
      stopReason: i > 0 ? stopReasons[i-1] : null // the stop BEFORE this stint (stint 1 has none)
    }));

    const lastStint = finalStints[finalStints.length-1];
    const avgFuelPerLapLastStint = lastStint.fuelNeeded / Math.max(1, lastStint.lapCount);
    const safetyFuel = p.safetyLaps * avgFuelPerLapLastStint;
    lastStint.fuelNeeded += safetyFuel;
    lastStint.safetyFuel = safetyFuel;

    const fuelForcedStops = finalStints.filter(s => s.stopReason === 'Fuel required' || s.stopReason === 'Fuel + Mandatory').length;
    const mandatoryOnlyStops = finalStints.filter(s => s.stopReason === 'Mandatory').length;

    return {
      totalLaps,
      totalTimeSec: timing.totalTimeSec,
      stints: finalStints,
      grandTotalFuel: timing.totalFuel + safetyFuel,
      totalStops: finalStints.length - 1,
      fuelForcedStops,
      mandatoryOnlyStops,
      mandatoryRequired: p.numStops,
      mandatoryUnsatisfied,
      tankOverflowStints: finalStints.filter(s => s.fuelNeeded > p.tankCapacity).map(s => s.stintNumber)
    };
  }

  function fcAssignDrivers(stints, numDrivers){
    return stints.map((s, i) => ({ ...s, driver: `Driver ${(i % numDrivers) + 1}` }));
  }

  function fcRenderResults(standard, push, preserve, p){
    const box = q('fcResults');

    const stopSummary = `${standard.totalStops} total (${standard.fuelForcedStops} fuel-required` +
      (standard.mandatoryOnlyStops ? ` + ${standard.mandatoryOnlyStops} mandatory-only` : '') + ')';

    const stintsForDisplay = p.teamMode ? fcAssignDrivers(standard.stints, p.numDrivers) : standard.stints;

    const rows = stintsForDisplay.map(s => {
      const wetTag = s.wetLapCount ? `<span class="fc-wet-tag">${s.wetLapCount} wet lap(s)</span>` : '';
      const isFinal = s.stintNumber === standard.stints.length;
      const overCap = s.fuelNeeded > p.tankCapacity;
      const reasonTag = s.stopReason ? `<span class="fc-reason-tag ${s.stopReason.includes('Fuel') ? 'fuel' : 'mandatory'}">${s.stopReason}</span>` : '<span class="fc-reason-tag start">Race start</span>';
      return `<tr class="${isFinal ? 'fc-final-row' : ''}">
        <td>${s.stintNumber}${isFinal ? ' (final)' : ''}</td>
        ${p.teamMode ? `<td>${s.driver}</td>` : ''}
        <td>${s.lapCount}</td>
        <td>${s.fuelNeeded.toFixed(2)}L${overCap ? ' <span style="color:var(--ifwl-red)">⚠ over tank capacity</span>' : ''}</td>
        <td>${s.safetyFuel ? `+${s.safetyFuel.toFixed(2)}L safety` : '-'}</td>
        <td>${reasonTag}</td>
        <td>${wetTag || '-'}</td>
      </tr>`;
    }).join('');

    const stratRow = (label, r) => `<tr>
      <td>${label}</td>
      <td>${p.mode === 'time' ? r.totalLaps + ' laps' : fcFormatClock(r.totalTimeSec)}</td>
      <td>${r.totalStops}</td>
      <td>${r.grandTotalFuel.toFixed(1)}L</td>
    </tr>`;

    const mandatoryWarning = standard.mandatoryUnsatisfied > 0
      ? `<div class="notice-card" style="border-left-color:var(--ifwl-amber);background:rgba(255,178,56,.08)"><strong>Note:</strong> ${standard.mandatoryUnsatisfied} of your ${standard.mandatoryRequired} mandatory stop(s) weren't naturally reached within the pit window by this plan - you'll need to make sure those still happen, even as a shorter/earlier stop than the tank strictly requires.</div>`
      : '';

    box.innerHTML = `
      <div class="fc-summary-grid">
        <div class="fc-summary-box"><span>Total Fuel Required</span><strong>${standard.grandTotalFuel.toFixed(2)}L</strong></div>
        <div class="fc-summary-box"><span>Total Laps</span><strong>${standard.totalLaps}</strong></div>
        <div class="fc-summary-box"><span>Estimated Race Time</span><strong>${fcFormatClock(standard.totalTimeSec)}</strong></div>
        <div class="fc-summary-box"><span>Pit Stops Required</span><strong>${stopSummary}</strong></div>
      </div>
      ${mandatoryWarning}
      ${standard.tankOverflowStints.length ? `<div class="notice-card" style="border-left-color:var(--ifwl-red);background:rgba(255,84,100,.08)"><strong>Heads up:</strong> stint(s) ${standard.tankOverflowStints.join(', ')} need more fuel than your tank capacity (${p.tankCapacity}L) can hold in one fill - likely just your final stint's safety buffer pushing it over. Consider a smaller safety margin or an extra late splash.</div>` : ''}

      <h4 style="margin:18px 0 10px">Stint-by-Stint Plan${p.teamMode ? ' &amp; Driver Rotation' : ''}</h4>
      <table class="fc-stint-table">
        <thead><tr><th>Stint</th>${p.teamMode ? '<th>Driver</th>' : ''}<th>Laps</th><th>Fuel to Load</th><th>Safety Buffer</th><th>Why this stop</th><th>Weather</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <h4 style="margin:22px 0 10px">Push vs Standard vs Preserve</h4>
      <p class="field-hint" style="margin-bottom:10px">${p.mode === 'time' ? 'How much extra distance pushing or preserving covers in the same race duration.' : 'How much time and fuel each strategy costs over the same fixed race distance.'}</p>
      <table class="fc-stint-table">
        <thead><tr><th>Strategy</th><th>${p.mode === 'time' ? 'Distance Covered' : 'Race Time'}</th><th>Pit Stops</th><th>Total Fuel</th></tr></thead>
        <tbody>
          ${stratRow('🔥 Push', push)}
          ${stratRow('Standard', standard)}
          ${stratRow('🌿 Preserve', preserve)}
        </tbody>
      </table>
    `;
  }

  function fcGatherParams(){
    const avgLapSec = fcParseLapTime(q('fcAvgLap').value);
    const fuelPerLap = Number(q('fcFuelPerLap').value);
    const tankCapacity = Number(q('fcTankCapacity').value) || 120;
    if(!avgLapSec || avgLapSec <= 0) return { error: 'Enter a valid average lap time first.' };
    if(!fuelPerLap || fuelPerLap <= 0) return { error: 'Enter your fuel consumption per lap first.' };

    const mode = q('fcRaceMode').value;
    const hours = Number(q('fcDurationHours').value) || 0;
    const mins = Number(q('fcDurationMins').value) || 0;
    const durationSec = (hours * 3600) + (mins * 60);
    const totalLaps = Number(q('fcTotalLaps').value) || 0;
    if(mode === 'time' && durationSec <= 0) return { error: 'Enter a race duration first.' };
    if(mode === 'laps' && totalLaps <= 0) return { error: 'Enter a total lap count first.' };

    return { p: {
      mode, durationSec, totalLaps, avgLapSec, fuelPerLap, tankCapacity,
      hasFormationLap: q('fcFormationLap').checked,
      fuelEffectEnabled: q('fcFuelEffectEnabled').checked,
      secPerLitre: Number(q('fcSecPerLitre').value) || 0,
      wetEnabled: q('fcWetEnabled').checked,
      wetStart: Number(q('fcWetStartPct').value) || 0,
      wetEnd: Number(q('fcWetEndPct').value) || 0,
      wetFuelMult: Number(q('fcWetFuelMult').value) || 1,
      wetLapPenaltyPct: Number(q('fcWetLapPenaltyPct').value) || 0,
      numStops: Number(q('fcNumStops').value) || 0,
      pitWindowStart: Number(q('fcPitWindowStart').value) || 0,
      pitWindowEnd: Number(q('fcPitWindowEnd').value) || 100,
      pitLossSec: Number(q('fcPitLossSec').value) || 0,
      safetyLaps: Number(q('fcSafetyLaps').value) || 0,
      teamMode: q('fcTeamMode').checked,
      numDrivers: Math.max(2, Number(q('fcNumDrivers').value) || 2),
      pushPaceDelta: Number(q('fcPushPaceDelta').value) || 0,
      pushFuelPct: Number(q('fcPushFuelPct').value) || 0,
      preservePaceDelta: Number(q('fcPreservePaceDelta').value) || 0,
      preserveFuelPct: Number(q('fcPreserveFuelPct').value) || 0
    }};
  }

  function fcCalculate(){
    const { p, error } = fcGatherParams();
    if(error){ q('fcResults').innerHTML = `<div class="empty">${error}</div>`; return; }

    const standard = fcBuildPlan(p, p.avgLapSec, p.fuelPerLap);

    // Push/Preserve reuse the SAME total lap count in 'laps' mode (the race
    // distance is fixed by regulation regardless of pace), but converge
    // independently in 'time' mode (a faster pace covers more laps in the
    // same duration, a slower one covers fewer).
    const pushLaps = p.mode === 'laps' ? standard.totalLaps : null;
    const preserveLaps = p.mode === 'laps' ? standard.totalLaps : null;
    const push = fcBuildPlan(p, p.avgLapSec - p.pushPaceDelta, p.fuelPerLap * (1 + p.pushFuelPct/100), pushLaps);
    const preserve = fcBuildPlan(p, p.avgLapSec + p.preservePaceDelta, p.fuelPerLap * (1 - p.preserveFuelPct/100), preserveLaps);

    fcRenderResults(standard, push, preserve, p);
  }

  function initFuelCalculator(){
    if(!q('fuelCalcPanel')) return;
    fcPopulateTrackSelect();

    q('fcRaceMode')?.addEventListener('change', () => {
      const isTime = q('fcRaceMode').value === 'time';
      q('fcDurationGroup').classList.toggle('hidden', !isTime);
      q('fcLapsGroup').classList.toggle('hidden', isTime);
    });
    q('fcWetEnabled')?.addEventListener('change', () => {
      document.querySelectorAll('.wet-only').forEach(el => el.classList.toggle('hidden', !q('fcWetEnabled').checked));
    });
    q('fcTeamMode')?.addEventListener('change', () => {
      document.querySelectorAll('.team-only').forEach(el => el.classList.toggle('hidden', !q('fcTeamMode').checked));
    });
    q('fcAutofillBtn')?.addEventListener('click', fcAutofillLapTime);
    q('fcCalculateBtn')?.addEventListener('click', fcCalculate);
  }
  // ✅ ADDED: Raise a Concern - deliberately simple, no accused-driver
  // picker, no incident/rule-breach fields. Posts straight to the same
  // driver<->staff messaging thread system as everything else in Inbox, so
  // a driver can see any reply the same place they'd see a staff DM.
  function initRaiseConcernForm(){
    const btn = q('concernSubmitBtn');
    if(!btn) return;
    btn.addEventListener('click', async () => {
      const status = q('concernSubmitStatus');
      const sendTo = q('concernSendTo').value;
      const subject = q('concernSubject').value.trim();
      const message = q('concernMessage').value.trim();
      if(!subject){ status.textContent = 'A subject is required.'; return; }
      if(!message){ status.textContent = 'Please add some details before sending.'; return; }

      btn.disabled = true;
      status.textContent = 'Sending...';
      try{
        await apiPost('submitConcern', { sendTo, subject, message });
        status.textContent = `Sent to ${sendTo === 'owner' ? 'the League Owner' : 'Staff'}. You'll see any reply in your Inbox.`;
        q('concernSubject').value = ''; q('concernMessage').value = ''; q('concernSendTo').value = 'staff';
      }catch(e){
        status.textContent = 'Could not send: ' + e.message;
      }finally{
        btn.disabled = false;
      }
    });
  }
  initRaiseConcernForm();

  initFuelCalculator();

  // ✅ ADDED: BOP TRACKer - see which car is the current META at a track,
  // and roughly how much lap time its ballast/restrictor is worth. Gated
  // the same way Fuel Calculator is (gold-only-field CSS class), but this
  // one also needs an actual server fetch, so that only fires once Gold/
  // staff status is confirmed - never a wasted 403 call for anyone else.
  function bopBarPct(value, min, max){
    const clamped = Math.max(min, Math.min(max, Number(value) || 0));
    return Math.round(((clamped - min) / (max - min)) * 100);
  }
  function bopEstimateSec(entry, secPerKg, secPerRestrictorPct){
    if(!entry) return null;
    return (Number(entry.ballastKg)||0) * secPerKg + (Number(entry.restrictor)||0) * secPerRestrictorPct;
  }
  function bopFmtDelta(sec){
    if(sec == null || !Number.isFinite(sec)) return '-';
    if(Math.abs(sec) < 0.0005) return '±0.000s';
    return `${sec > 0 ? '+' : ''}${sec.toFixed(3)}s`;
  }
  function bopParseLapToMs(str){
    const m = /^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(String(str||'').trim());
    if(!m) return null;
    const frac = (m[3]||'0').padEnd(3,'0').slice(0,3);
    return (Number(m[1])*60 + Number(m[2]))*1000 + Number(frac);
  }
  function bopFmtMsAsLap(ms){
    const mm = Math.floor(ms/60000);
    const ss = ((ms%60000)/1000).toFixed(3).padStart(6,'0');
    return `${mm}:${ss}`;
  }
  function bopTrackLabel(slug){
    return String(slug||'').replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  let bopTrackerWired = false;
  let bopSelectedPlatform = 'pc';
  let bopLastAutoFilledLapStr = ''; // tracks what WE last typed in, so we don't stomp a driver's own manual entry

  // ✅ CHANGED: real reference lap, pulled from this league's own synced
  // session data rather than a manually-typed guess. Deliberately does NOT
  // fall back to an "online average" - there's no reliable public dataset
  // for per-car/per-track ACC lap times, and fabricating one would be worse
  // than just saying there's no data yet. Uses the fastest VALID lap
  // recorded ANYWHERE on the matching platform - not just the Licence
  // server, which only ever sees qualification-pace laps. IFWL runs four
  // servers per platform (Licence, Pro-Am, Beginner, Monday Funday), and a
  // genuinely fast/representative lap is just as likely to have been set on
  // Pro-Am as on Licence, so this checks all four rather than missing faster
  // laps sitting on the others.
  async function bopFieldFastestLapMs(track, platform){
    try{
      const prefix = platform === 'console' ? 'console-' : 'pc-';
      const allRows = await window.IFWLStats.buildAllRows();
      let best = 0;
      allRows.forEach(r => {
        if(!String(r.serverId||'').startsWith(prefix)) return;
        if(String(r.track||'').toLowerCase() !== track) return;
        const lap = Number(r.bestLap) || 0;
        if(lap > 0 && (!best || lap < best)) best = lap;
      });
      return best || null;
    }catch(e){
      console.warn('Could not compute fastest recorded lap for BOP TRACKer', e);
      return null;
    }
  }

  function bopRenderResults(data){
    const box = q('bopResults');
    if(!box) return;
    const track = q('bopTrackSelect')?.value;
    if(!track){ box.innerHTML = ''; return; }

    const entriesForTrack = (data.entries||[]).filter(e => e.track === track);
    const entryByCarModel = new Map(entriesForTrack.map(e => [e.carModel, e]));

    const cars = (data.carCatalog||[]).map(car => {
      const carModelId = bopSelectedPlatform === 'console'
        ? (Number.isFinite(car.consoleCarModelId) ? car.consoleCarModelId : car.pcCarModelId)
        : car.pcCarModelId;
      const entry = entryByCarModel.get(carModelId);
      const deltaSec = entry ? bopEstimateSec(entry, data.secPerKg, data.secPerRestrictorPct) : null;
      return { car, entry, deltaSec };
    }).filter(x => x.entry);

    if(!cars.length){
      box.innerHTML = '<div class="empty">No BOP data found for this track on this platform yet - ask staff to check the BOP file and Car Catalog.</div>';
      return;
    }

    cars.sort((a,b) => a.deltaSec - b.deltaSec);
    const metaDelta = cars[0].deltaSec;
    // ✅ FIXED: multiple cars can genuinely tie for best (e.g. several all
    // sitting at the same -30kg ballast floor) - the badge now goes to
    // EVERY car within a hair of the best delta, not just whichever one
    // happened to sort first. Ties are labelled honestly rather than
    // implying one car is uniquely superior when it isn't.
    const metaCount = cars.filter(c => Math.abs(c.deltaSec - metaDelta) < 0.0005).length;
    const metaBadgeText = metaCount > 1 ? `🏆 META - Tied for best at this track (${metaCount} cars)` : '🏆 META - Best at this track';
    const refLapStr = q('bopRefLapInput')?.value.trim();
    const refLapMs = refLapStr ? bopParseLapToMs(refLapStr) : null;

    // Loss=red, gain=green - "loss" means slower (positive seconds), "gain"
    // means faster (negative seconds), matching how the figures are already signed.
    const deltaClass = (sec) => sec > 0.0005 ? 'bop-loss' : sec < -0.0005 ? 'bop-gain' : '';

    box.innerHTML = cars.map(({car, entry, deltaSec}) => {
      const isMeta = Math.abs(deltaSec - metaDelta) < 0.0005;
      const vsMeta = deltaSec - metaDelta;
      const ballastPct = bopBarPct(entry.ballastKg, -30, 40);
      const restrictorPct = bopBarPct(entry.restrictor, 0, 30);
      const bgStyle = car.imageUrl ? ` style="background-image:url('${car.imageUrl}')"` : '';
      const projectedMs = (refLapMs != null) ? Math.max(0, refLapMs + Math.round(deltaSec*1000)) : null;
      const lapRow = (refLapMs != null) ? `<div class="bop-lap-row"><span>Reference lap</span><strong>${bopFmtMsAsLap(refLapMs)}</strong><span>&rarr;</span><span>With this car's BOP</span><strong>${bopFmtMsAsLap(projectedMs)}</strong></div>` : '';
      return `<div class="bop-car-card${isMeta ? ' bop-car-meta' : ''}"${bgStyle}>
        <div class="bop-car-card-overlay">
          ${isMeta ? `<div class="bop-meta-badge">${metaBadgeText}</div>` : ''}
          <div class="bop-car-head"><h4>${car.name}</h4><span class="field-hint">${car.carClass||''}</span></div>
          <div class="bop-bar-row"><span>Ballast</span><div class="bop-bar"><div class="bop-bar-fill" style="width:${ballastPct}%"></div></div><strong>${entry.ballastKg > 0 ? '+' : ''}${entry.ballastKg}kg</strong></div>
          <div class="bop-bar-row"><span>Restrictor</span><div class="bop-bar"><div class="bop-bar-fill restrictor" style="width:${restrictorPct}%"></div></div><strong>${entry.restrictor||0}%</strong></div>
          <div class="bop-delta-row">
            <div><span>Vs no BOP</span><strong class="${deltaClass(deltaSec)}">${bopFmtDelta(deltaSec)}</strong></div>
            <div><span>Vs META car</span><strong class="${isMeta ? '' : deltaClass(vsMeta)}">${isMeta ? '±0.000s' : bopFmtDelta(vsMeta)}</strong></div>
          </div>
          ${lapRow}
        </div>
      </div>`;
    }).join('');
  }

  async function bopUpdateReferenceLap(track, platform){
    const input = q('bopRefLapInput');
    const note = q('bopRefLapNote');
    if(!input) return;

    // Only auto-fill if the box is empty or still holds what WE put there
    // last time - never overwrite a lap the driver typed in themselves.
    const untouched = !input.value.trim() || input.value.trim() === bopLastAutoFilledLapStr;
    const fastestMs = await bopFieldFastestLapMs(track, platform);

    if(fastestMs){
      const lapStr = bopFmtMsAsLap(fastestMs);
      if(untouched){
        input.value = lapStr;
        bopLastAutoFilledLapStr = lapStr;
      }
      if(note) note.textContent = `Auto-filled from the fastest recorded lap at this track across every ${platform === 'console' ? 'Console' : 'PC'} server (Licence, Pro-Am, Beginner, Monday Funday). Edit it to use your own.`;
    } else {
      if(untouched){ input.value = ''; bopLastAutoFilledLapStr = ''; }
      if(note) note.textContent = 'No recorded laps for this track/platform yet - type your own reference lap if you have one.';
    }
  }

  async function bopLoadAndRender(){
    const metaLine = q('bopMetaLine');
    try{
      const data = await window.IFWL_BopAPI.fetchBopTrackerData();
      if(metaLine) metaLine.textContent = data.bopName
        ? `${data.bopName}${data.uploadedAtMs ? ' · uploaded ' + new Date(data.uploadedAtMs).toLocaleDateString() : ''}`
        : 'No BOP file uploaded yet - check back once staff have added one.';

      const trackSelect = q('bopTrackSelect');
      if(trackSelect){
        const prevValue = trackSelect.value;
        trackSelect.innerHTML = '<option value="">Select a track&hellip;</option>' + (data.tracks||[]).map(t => `<option value="${t}">${bopTrackLabel(t)}</option>`).join('');
        if(prevValue) trackSelect.value = prevValue;
      }

      bopSelectedPlatform = (currentProfile?.platform === 'console') ? 'console' : 'pc';
      q('bopPlatformPc')?.classList.toggle('active', bopSelectedPlatform === 'pc');
      q('bopPlatformConsole')?.classList.toggle('active', bopSelectedPlatform === 'console');

      const trackNow = q('bopTrackSelect')?.value;
      if(trackNow) await bopUpdateReferenceLap(trackNow, bopSelectedPlatform);
      bopRenderResults(data);

      if(!bopTrackerWired){
        bopTrackerWired = true;
        q('bopPlatformPc')?.addEventListener('click', async () => {
          bopSelectedPlatform = 'pc';
          q('bopPlatformPc').classList.add('active'); q('bopPlatformConsole').classList.remove('active');
          const t = q('bopTrackSelect')?.value;
          if(t) await bopUpdateReferenceLap(t, bopSelectedPlatform);
          bopRenderResults(data);
        });
        q('bopPlatformConsole')?.addEventListener('click', async () => {
          bopSelectedPlatform = 'console';
          q('bopPlatformConsole').classList.add('active'); q('bopPlatformPc').classList.remove('active');
          const t = q('bopTrackSelect')?.value;
          if(t) await bopUpdateReferenceLap(t, bopSelectedPlatform);
          bopRenderResults(data);
        });
        q('bopTrackSelect')?.addEventListener('change', async () => {
          const t = q('bopTrackSelect')?.value;
          if(t) await bopUpdateReferenceLap(t, bopSelectedPlatform);
          bopRenderResults(data);
        });
        q('bopRefLapInput')?.addEventListener('input', () => bopRenderResults(data));
      }
    }catch(e){
      if(metaLine) metaLine.textContent = 'Could not load BOP data: ' + e.message;
    }
  }

  function initBopTrackerPanel(){
    if(!q('bopTrackerPanel')) return;
    if(window.IFWL_GOLD || window.IFWL_STAFF) bopLoadAndRender();
  }
  initBopTrackerPanel();

  // ✅ ADDED: Scout The Field - Gold perk. Best lap + improvement trend per
  // driver at a track, computed entirely from already-synced session data
  // (no new backend needed) across the Beginner/Pro-Am/Monday Funday
  // servers - deliberately excludes the Licence server, since that's
  // already covered by Qualification Ranking elsewhere and mixing
  // qualification-pace laps in here would muddy "getting laps in casually"
  // with "grinding for a licence tier".
  function scoutFileTsMs(fileName){
    const name = String(fileName||'').split('/').pop();
    const m = name.match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/);
    if(!m) return 0;
    const [,yy,mm,dd,hh,mi,ss] = m;
    return Date.UTC(2000+Number(yy), Number(mm)-1, Number(dd), Number(hh), Number(mi), Number(ss));
  }

  let scoutSelectedPlatform = 'pc';
  let scoutWired = false;
  let scoutAllRowsCache = null;
  let scoutLinkedNamesCache = null;

  async function scoutComputeResults(track){
    if(!track) return { results: [], sessionsScanned: 0 };
    const servers = [];
    if(q('scoutServerBeginner')?.checked) servers.push('beginner');
    if(q('scoutServerProam')?.checked) servers.push('proam', 'pro', 'am');
    if(q('scoutServerMonday')?.checked) servers.push('monday-funday');
    if(!servers.length) return { results: [], sessionsScanned: 0 };

    const prefix = scoutSelectedPlatform === 'console' ? 'console-' : 'pc-';
    scoutAllRowsCache = scoutAllRowsCache || await window.IFWLStats.buildAllRows();

    const matching = scoutAllRowsCache.filter(r => {
      const sid = String(r.serverId||'');
      if(!sid.startsWith(prefix)) return false;
      if(!servers.includes(sid.slice(prefix.length))) return false;
      if(String(r.track||'').toLowerCase() !== track) return false;
      return (Number(r.bestLap)||0) > 0;
    });

    // ✅ ADDED: linked/unlinked - which names already match an existing IFWL
    // licence's linked ACC name(s). Same lenient substring match convention
    // used everywhere else in the app for this exact reason (a session name
    // often carries a bracketed car number a driver's self-reported name
    // won't include verbatim).
    if(!scoutLinkedNamesCache){
      try{ scoutLinkedNamesCache = await window.IFWL_ClaimAPI.fetchLinkedDriverNames(); }
      catch(e){ scoutLinkedNamesCache = []; console.warn('Could not load linked driver names for Scout The Field', e); }
    }
    const isLinked = (name) => {
      const n = String(name||'').trim().toLowerCase();
      if(!n) return false;
      return scoutLinkedNamesCache.some(ln => n.includes(ln) || ln.includes(n));
    };

    const byDriver = new Map();
    matching.forEach(r => {
      const key = window.IFWLStats.driverNameKey(r.driver);
      if(!key) return;
      if(!byDriver.has(key)) byDriver.set(key, { name: r.driver, sessions: [] });
      const entry = byDriver.get(key);
      entry.name = r.driver;
      const lapObjects = Array.isArray(r.lapObjects) ? r.lapObjects : [];
      const hasLapData = lapObjects.length > 0;
      const validCount = hasLapData ? lapObjects.filter(l => l.isValidForBest !== false).length : 0;
      entry.sessions.push({
        bestLap: Number(r.bestLap),
        tsMs: scoutFileTsMs(r.fileName),
        lapCount: Number(r.lapCount) || lapObjects.length || 0,
        validLapCount: validCount,
        totalLapObjectCount: lapObjects.length
      });
    });

    // ✅ ADDED: field best (P1) at this track/platform/server-set, for the
    // gap-to-best figure on every other row.
    let fieldBestMs = 0;
    byDriver.forEach(entry => entry.sessions.forEach(s => {
      if(s.bestLap > 0 && (!fieldBestMs || s.bestLap < fieldBestMs)) fieldBestMs = s.bestLap;
    }));

    const nowMs = Date.now();
    const results = [];
    byDriver.forEach(entry => {
      const sessions = [...entry.sessions].sort((a,b) => a.tsMs - b.tsMs);
      const currentBestMs = Math.min(...sessions.map(s => s.bestLap));
      const firstSessionBestMs = sessions[0].bestLap;
      const improvementMs = firstSessionBestMs - currentBestMs;
      const firstSeenMs = sessions[0].tsMs;
      const lastSeenMs = sessions[sessions.length-1].tsMs;

      const totalLaps = sessions.reduce((sum,s) => sum + (s.lapCount||0), 0);
      // Clean lap rate: only counted where we actually have per-lap validity
      // data (totalLapObjectCount>0) - sessions without it are excluded from
      // the rate rather than silently counted as 100% or 0% clean.
      let validSum = 0, lapObjSum = 0;
      sessions.forEach(s => { if(s.totalLapObjectCount){ validSum += s.validLapCount; lapObjSum += s.totalLapObjectCount; } });
      const cleanRatePct = lapObjSum ? Math.round((validSum/lapObjSum)*100) : null;

      const activeSpanDays = firstSeenMs && lastSeenMs ? Math.round((lastSeenMs - firstSeenMs)/86400000) : 0;
      const stillActive = lastSeenMs ? (nowMs - lastSeenMs) <= (30*86400000) : false;
      const gapToBestMs = fieldBestMs ? (currentBestMs - fieldBestMs) : null;
      const gapToBestPct = (fieldBestMs && gapToBestMs != null) ? (gapToBestMs/fieldBestMs)*100 : null;

      results.push({
        name: entry.name,
        sessionCount: sessions.length,
        currentBestMs,
        firstSeenMs, lastSeenMs,
        improvementMs,
        totalLaps,
        cleanRatePct,
        activeSpanDays,
        stillActive,
        gapToBestMs, gapToBestPct,
        linked: isLinked(entry.name),
        sparkPoints: sessions.map(s => ({ tsMs: s.tsMs, bestLap: s.bestLap }))
      });
    });
    return { results, sessionsScanned: matching.length };
  }

  function scoutFmtMs(ms){
    if(!ms) return '-';
    const mm = Math.floor(ms/60000);
    const ss = ((ms%60000)/1000).toFixed(3).padStart(6,'0');
    return `${mm}:${ss}`;
  }
  function scoutFmtDate(ms){
    return ms ? new Date(ms).toLocaleDateString() : '-';
  }
  function scoutFmtImprovement(ms){
    if(!Number.isFinite(ms)) return { text: '-', cls: 'trend-flat' };
    if(Math.abs(ms) < 50) return { text: '±0.000s', cls: 'trend-flat' };
    const sec = (Math.abs(ms)/1000).toFixed(3);
    return ms > 0 ? { text: `-${sec}s`, cls: 'trend-gain' } : { text: `+${sec}s`, cls: 'trend-loss' };
  }
  function scoutFmtGap(ms, pct){
    if(ms == null) return '-';
    if(Math.abs(ms) < 50) return 'P1 - field best';
    return `+${(ms/1000).toFixed(3)}s (${pct.toFixed(1)}%)`;
  }

  // ✅ ADDED: a tiny inline sparkline - best lap per session over time, so a
  // driver who improved-then-plateaued (or dipped mid-stretch) is visible at
  // a glance instead of collapsing their whole history into one delta. Y-axis
  // is inverted (a faster/lower lap time plots HIGHER) so the line reads the
  // same way "improving" reads everywhere else: trending up = getting better.
  function scoutSparklineSvg(points){
    if(!points || points.length < 2) return '';
    const w = 140, h = 34, pad = 3;
    const laps = points.map(p => p.bestLap);
    const min = Math.min(...laps), max = Math.max(...laps);
    const range = (max - min) || 1;
    const coords = points.map((p,i) => {
      const x = pad + (i/(points.length-1)) * (w - pad*2);
      const y = pad + ((p.bestLap - min)/range) * (h - pad*2); // fast lap (low ms) = small y = near the top
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const lastX = coords[coords.length-1].split(',')[0];
    const lastY = coords[coords.length-1].split(',')[1];
    return `<svg class="scout-sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <polyline points="${coords.join(' ')}" fill="none" stroke="#1fd6bd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lastX}" cy="${lastY}" r="2.6" fill="#1fd6bd"/>
    </svg>`;
  }

  async function scoutRenderResults(){
    const box = q('scoutResults');
    const summary = q('scoutSummaryLine');
    if(!box) return;
    const track = q('scoutTrackSelect')?.value;
    if(!track){ box.innerHTML = '<div class="empty">Select a track to scout.</div>'; if(summary) summary.textContent = ''; return; }

    box.innerHTML = '<div class="empty">Loading&hellip;</div>';
    const { results: allResults, sessionsScanned } = await scoutComputeResults(track);

    const search = (q('scoutSearchInput')?.value || '').trim().toLowerCase();
    const minSessions = Math.max(1, Number(q('scoutMinSessions')?.value) || 1);
    const activeOnly = !!q('scoutActiveOnly')?.checked;

    let results = allResults.filter(r => r.sessionCount >= minSessions);
    if(search) results = results.filter(r => r.name.toLowerCase().includes(search));
    if(activeOnly) results = results.filter(r => r.stillActive);

    if(summary) summary.textContent = `${results.length} driver${results.length===1?'':'s'} · ${sessionsScanned} session${sessionsScanned===1?'':'s'} scanned`;

    if(!results.length){
      box.innerHTML = '<div class="empty">No recorded laps match these filters yet - try fewer server restrictions or a lower minimum session count.</div>';
      return;
    }

    const sortMode = q('scoutSortSelect')?.value || 'best';
    const sorters = {
      best: (a,b) => a.currentBestMs - b.currentBestMs,
      improved: (a,b) => b.improvementMs - a.improvementMs,
      laps: (a,b) => b.totalLaps - a.totalLaps,
      sessions: (a,b) => b.sessionCount - a.sessionCount,
      clean: (a,b) => (b.cleanRatePct ?? -1) - (a.cleanRatePct ?? -1),
      span: (a,b) => b.activeSpanDays - a.activeSpanDays
    };
    results.sort(sorters[sortMode] || sorters.best);

    const medals = ['🥇','🥈','🥉'];

    box.innerHTML = results.map((r, idx) => {
      const imp = scoutFmtImprovement(r.improvementMs);
      const improvementHtml = r.sessionCount > 1
        ? `<span class="${imp.cls}">${imp.text}</span>`
        : `<span class="trend-flat">Only 1 session - no trend yet</span>`;
      const medal = (sortMode === 'best' && idx < 3) ? `<span class="scout-medal">${medals[idx]}</span>` : '';
      const linkedBadge = r.linked ? '<span class="scout-badge linked">Linked</span>' : '<span class="scout-badge unlinked">Unlinked</span>';
      const activeBadge = r.stillActive ? '<span class="scout-badge active">Active</span>' : '<span class="scout-badge inactive">Inactive 30d+</span>';
      const spark = scoutSparklineSvg(r.sparkPoints);

      return `<div class="scout-card">
        <div class="scout-card-top">
          <div class="scout-card-name">
            ${medal}<h4>${r.name}</h4>${linkedBadge}${activeBadge}
          </div>
          <div class="scout-card-lap"><strong>${scoutFmtMs(r.currentBestMs)}</strong><span>${scoutFmtGap(r.gapToBestMs, r.gapToBestPct)}</span></div>
        </div>
        <div class="scout-stat-strip">
          <div><span>Total Laps</span><strong>${r.totalLaps || '-'}</strong></div>
          <div><span>Clean Rate</span><strong>${r.cleanRatePct != null ? r.cleanRatePct + '%' : '-'}</strong></div>
          <div><span>Sessions</span><strong>${r.sessionCount}</strong></div>
          <div><span>Active Span</span><strong>${r.activeSpanDays > 0 ? r.activeSpanDays + ' day' + (r.activeSpanDays===1?'':'s') : (r.sessionCount>1 ? 'Same day' : '-')}</strong></div>
          <div><span>First Seen</span><strong>${scoutFmtDate(r.firstSeenMs)}</strong></div>
          <div><span>Most Recent</span><strong>${scoutFmtDate(r.lastSeenMs)}</strong></div>
        </div>
        <div class="scout-card-bottom">
          <div>${improvementHtml}</div>
          ${spark}
        </div>
      </div>`;
    }).join('');
  }

  async function scoutLoadAndRender(){
    const trackSelect = q('scoutTrackSelect');
    if(trackSelect && trackSelect.options.length <= 1){
      try{
        scoutAllRowsCache = scoutAllRowsCache || await window.IFWLStats.buildAllRows();
        const tracks = [...new Set(scoutAllRowsCache.map(r => String(r.track||'').toLowerCase()).filter(Boolean))].sort();
        trackSelect.innerHTML = '<option value="">Select a track&hellip;</option>' + tracks.map(t => `<option value="${t}">${bopTrackLabel(t)}</option>`).join('');
      }catch(e){ console.warn('Could not load track list for Scout The Field', e); }
    }

    scoutSelectedPlatform = (currentProfile?.platform === 'console') ? 'console' : 'pc';
    q('scoutPlatformPc')?.classList.toggle('active', scoutSelectedPlatform === 'pc');
    q('scoutPlatformConsole')?.classList.toggle('active', scoutSelectedPlatform === 'console');
    if(!q('scoutTrackSelect')?.value){ const box=q('scoutResults'); if(box) box.innerHTML = '<div class="empty">Select a track to scout.</div>'; }

    if(!scoutWired){
      scoutWired = true;
      q('scoutPlatformPc')?.addEventListener('click', () => {
        scoutSelectedPlatform = 'pc';
        q('scoutPlatformPc').classList.add('active'); q('scoutPlatformConsole').classList.remove('active');
        scoutRenderResults();
      });
      q('scoutPlatformConsole')?.addEventListener('click', () => {
        scoutSelectedPlatform = 'console';
        q('scoutPlatformConsole').classList.add('active'); q('scoutPlatformPc').classList.remove('active');
        scoutRenderResults();
      });
      q('scoutSortSelect')?.addEventListener('change', scoutRenderResults);
      q('scoutMinSessions')?.addEventListener('input', scoutRenderResults);
      q('scoutActiveOnly')?.addEventListener('change', scoutRenderResults);
      q('scoutTrackSelect')?.addEventListener('change', scoutRenderResults);
      q('scoutSearchInput')?.addEventListener('input', scoutRenderResults);
      q('scoutServerBeginner')?.addEventListener('change', scoutRenderResults);
      q('scoutServerProam')?.addEventListener('change', scoutRenderResults);
      q('scoutServerMonday')?.addEventListener('change', scoutRenderResults);
    }
  }

  // Field Report: practice-session scouting sheets (module: window.IFWL_Scout, last script block).
  let scoutSheetsMounted = false, scoutEntryLookup = null;
  async function scoutEntryFor(name){
    if(!scoutEntryLookup){
      let roster = [], directory = [];
      try{ [roster, directory] = await Promise.all([ fetchLicenceRosterPublic(), fetchDirectory() ]); }catch(e){ console.warn('Scout: directory unavailable', e); }
      const byAcc = new Map(); roster.forEach(x => (x.accDriverNames || []).forEach(n => byAcc.set(window.IFWLStats.driverNameKey(n), x)));
      const byNum = new Map(); directory.forEach(d => { if(d.licenceNumber && d.licenceNumber !== '-') byNum.set(d.licenceNumber, d); });
      scoutEntryLookup = { byAcc, byNum };
    }
    const re = scoutEntryLookup.byAcc.get(window.IFWLStats.driverNameKey(name));
    const d = re ? scoutEntryLookup.byNum.get(re.licenceNumber) : null;
    if(!d) return {};
    const t = findTier(d.tier || 'No Licence');
    const avatarUrl = d.avatarMode === 'upload' && d.photoUploadUrl ? d.photoUploadUrl : d.avatarMode === 'url' && d.avatarUrl ? d.avatarUrl : '';
    return { tier: d.tier || '', tierColor: (t && t.color) || '', licenceNumber: d.licenceNumber || '', teamName: d.teamName || '', avatarUrl };
  }
  function scoutMountSheets(){
    if(scoutSheetsMounted || !window.IFWL_Scout || !q('scoutSheets')) return;
    scoutSheetsMounted = true;
    const setMode = (sheets) => {
      q('scoutSheets').classList.toggle('hidden', !sheets); q('scoutClassic').classList.toggle('hidden', sheets);
      q('scModeSheets').classList.toggle('active', sheets); q('scModeClassic').classList.toggle('active', !sheets);
    };
    q('scModeSheets').addEventListener('click', () => setMode(true));
    q('scModeClassic').addEventListener('click', () => setMode(false));
    setMode(true);
    window.IFWL_Scout.mount(q('scoutSheets'), {
      owner: !!window.IFWL_OWNER,
      getRows: () => window.IFWLStats.buildAllRows(),
      trackLabel: (t) => { try{ return bopTrackLabel(t); }catch(e){ return t; } },
      seasonLabel: () => { const t = (q('raceResultsSeasonLabel')?.textContent || '').split(':')[0].trim(); return /^(no season|loading)/i.test(t) ? '' : t; },
      entryFor: scoutEntryFor
    });
  }

  function initScoutFieldPanel(){
    if(!q('scoutFieldPanel')) return;
    if(window.IFWL_GOLD || window.IFWL_STAFF){ scoutLoadAndRender(); scoutMountSheets(); }
  }
  initScoutFieldPanel();

  window.addEventListener('ifwl-auth-changed', e=>{
    if(e.detail?.meta) init();
  });
  window.addEventListener('ifwl-auth-changed', initBopTrackerPanel);
  window.addEventListener('ifwl-auth-changed', initScoutFieldPanel);
})();
;(window.IFWL_FILES=window.IFWL_FILES||{})['01-data-layer.js']='p3s2';
