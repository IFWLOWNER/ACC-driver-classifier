/* ============================================================
   IFWL MY RACE TEAM (licence-teams.html)
   The Licence Centre version of the old raceteamnew.html page: same team, roster,
   events, stints, Team Server stats, liveries and audit log, plus standard and full
   teams, managers, Build a team, All teams and the Discord draft image.
   Everything the server decides (who may do what) is enforced by the server;
   this page only shows or hides buttons to match.
   ============================================================ */
(function(){
'use strict';
if(window.IFWL_TEAM_PAGE) return; window.IFWL_TEAM_PAGE = true;
  const q = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const FN = () => window.IFWL_AUTH?.FUNCTION || '';
  const UPLOAD_FN = 'https://rtlicenceimageupload-703021152109.europe-west2.run.app';

  async function apiGet(action, extra){
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const url = `${FN()}?${action}=1&token=${encodeURIComponent(token)}${extra||''}`;
    const r = await fetch(url, {cache:'no-store'});
    const d = await r.json().catch(()=>({}));
    if(!r.ok){ const err = new Error(d?.error || `Request "${action}" failed (${r.status})`); err.body = d; err.status = r.status; throw err; }
    return d;
  }
  async function apiPost(action, body){
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const r = await fetch(`${FN()}?${action}=1&token=${encodeURIComponent(token)}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{})});
    const d = await r.json().catch(()=>({}));
    if(!r.ok){ const err = new Error(d?.error || `Request "${action}" failed (${r.status})`); err.body = d; err.status = r.status; throw err; }
    return d;
  }
  // Same as apiPost, but for actions (like raceTeamLiveryDelete) that read
  // an id from the query string rather than the JSON body.
  async function apiPostQ(action, extraQuery, body){
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const r = await fetch(`${FN()}?${action}=1&token=${encodeURIComponent(token)}${extraQuery||''}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{})});
    const d = await r.json().catch(()=>({}));
    if(!r.ok){ const err = new Error(d?.error || `Request "${action}" failed (${r.status})`); err.body = d; err.status = r.status; throw err; }
    return d;
  }
  async function uploadLicenceImage(file, kind, extraParams){
    if(file.size > 5*1024*1024) throw new Error('That file is over 5MB. Please choose a smaller image.');
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let r;
    try{
      const extra = extraParams ? '&' + new URLSearchParams(extraParams).toString() : '';
      r = await fetch(`${UPLOAD_FN}?token=${encodeURIComponent(token)}&kind=${encodeURIComponent(kind)}${extra}`, { method:'POST', body: form, signal: controller.signal });
    }catch(err){
      if(err.name === 'AbortError') throw new Error('Upload timed out after 30s.');
      throw err;
    }finally{ clearTimeout(timeout); }
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d?.error || 'Upload failed');
    return { url: d.url, ref: 'url' };
  }

  // Race Team Liveries upload - separate from uploadLicenceImage above
  // because this needs a much bigger size cap (a real ACC livery pack) and
  // has to carry the upload password + original filename as extra form
  // fields. The password is only ever sent over this one request - it is
  // checked server-side in rtLicenceImageUpload and never stored or echoed
  // back to the page.
  async function uploadLiveryZip(file, teamId, password){
    if(file.size > 60*1024*1024) throw new Error('That file is over 60MB. Please choose a smaller zip.');
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const form = new FormData();
    form.append('file', file);
    form.append('kind', 'raceTeamLivery');
    form.append('password', password);
    form.append('fileName', file.name);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    let r;
    try{
      r = await fetch(`${UPLOAD_FN}?token=${encodeURIComponent(token)}&kind=raceTeamLivery&teamId=${encodeURIComponent(teamId)}`, { method:'POST', body: form, signal: controller.signal });
    }catch(err){
      if(err.name === 'AbortError') throw new Error('Upload timed out after 60s.');
      throw err;
    }finally{ clearTimeout(timeout); }
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d?.error || 'Upload failed');
    return d;
  }

  // Optional preview image for a livery - a plain JPEG/PNG thumbnail so
  // drivers can see what the livery looks like before downloading the zip.
  // Not password-gated (it's not the protected file itself), but still
  // scoped to team members via teamId, same as the zip upload above.
  async function uploadLiveryPreviewImage(file, teamId){
    if(file.size > 5*1024*1024) throw new Error('That image is over 5MB. Please choose a smaller preview image.');
    const token = window.IFWL_AUTH?.sessionToken() || '';
    const form = new FormData();
    form.append('file', file);
    form.append('kind', 'raceTeamLiveryPreview');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let r;
    try{
      r = await fetch(`${UPLOAD_FN}?token=${encodeURIComponent(token)}&kind=raceTeamLiveryPreview&teamId=${encodeURIComponent(teamId)}`, { method:'POST', body: form, signal: controller.signal });
    }catch(err){
      if(err.name === 'AbortError') throw new Error('Preview image upload timed out after 30s.');
      throw err;
    }finally{ clearTimeout(timeout); }
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d?.error || 'Preview image upload failed');
    return d;
  }

  // ---- Events/Stints calling convention, ported verbatim from Live Timings ----
  const RT_AUTH_FUNCTION = 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  const RT_SESSION_KEY = 'IFWL_PATREON_SESSION';
  function rtGetSessionToken(){ try{ return localStorage.getItem(RT_SESSION_KEY) || sessionStorage.getItem(RT_SESSION_KEY) || ''; }catch(_){ return ''; } }
  async function rtApiCall(query, options = {}){
    const token = rtGetSessionToken();
    const sep = query.includes('?') ? '&' : '?';
    const url = `${RT_AUTH_FUNCTION}${query}${sep}token=${encodeURIComponent(token)}`;
    const res = await fetch(url, options);
    const data = await res.json().catch(() => null);
    if(!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data || {};
  }
  async function rtFetchEvents(teamId){ const data = await rtApiCall(`?raceTeamEventList=1&teamId=${encodeURIComponent(teamId)}`); return Array.isArray(data.events) ? data.events : []; }
  async function rtSaveEvent(event){ return rtApiCall('?raceTeamEventSave=1', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(event) }); }
  // availableStints is the new "also available as backup" state (purple) -
  // kept separate from stints ("this is my planned/scheduled stint", green)
  // so a driver can flag both independently. Optional 4th arg keeps this
  // backward compatible with any old call site that only ever sent stints.
  async function rtSetAvailability(eventId, driverName, stints, availableStints){ return rtApiCall('?raceTeamEventAvailability=1', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({eventId, driverName, stints, availableStints: availableStints || []}) }); }
  async function rtFinalizeEvent(eventId, stints, notifyDm){ return rtApiCall('?raceTeamEventFinalize=1', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({eventId, stints, notifyDm: !!notifyDm}) }); }
  async function rtNotifyRetry(eventId){ return rtApiCall('?raceTeamEventNotifyRetry=1', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({eventId}) }); }

  // ---- "tell the drivers" helpers: DM switch, delivery report, per-driver chips ----
  const RT_DM_PREF_KEY = 'IFWL_RT_NOTIFY_DM';
  function rtDmPref(){ try{ return localStorage.getItem(RT_DM_PREF_KEY) !== '0'; }catch(_){ return true; } }
  function rtSetDmPref(on){ try{ localStorage.setItem(RT_DM_PREF_KEY, on ? '1' : '0'); }catch(_){} }
  const RT_DM_REASONS = {
    dms_closed: 'has Discord DMs from server members turned off',
    not_in_server: "isn't in the IFWL Discord any more",
    network: 'Discord could not be reached - press Re-send',
    discord_error: 'Discord had a problem - press Re-send',
    rate_limited: 'Discord was busy - press Re-send',
    time_budget: 'ran out of time - press Re-send',
    bot_unauthorised: 'the bot is not authorised - tell Ben',
    discord_rejected: 'Discord refused the message',
    no_bot_token: 'the bot is not set up - tell Ben',
    bad_id: 'has no valid Discord id',
    not_on_roster: "name isn't on this team's roster",
    ambiguous_name: 'two drivers share this name - tell them yourself',
    no_team_roster: "this event's team has no roster on file"
  };
  const RT_KIND_LABEL = { new: 'new stints', changed: 'stints changed', schedule: 'times changed', removed: 'taken off the plan' };
  const rtLastNotify = {};
  function rtNotifyReportHtml(n){
    if(!n) return '';
    if(n.error) return '<div class="rt-notify-report bad"><strong>Drivers could not be notified automatically.</strong> ' + esc(n.error) + '</div>';
    const rows = n.drivers || [];
    if(!rows.length) return '<div class="rt-notify-report ok">Nobody\'s stints changed, so nobody needed telling and nobody had to reconfirm.</div>';
    const failedDm = rows.filter(r => r.dm === 'failed');
    const noNotice = rows.filter(r => r.notice === 'failed');
    let h = '<div class="rt-notify-report ' + ((failedDm.length || noNotice.length) ? 'warn' : 'ok') + '"><strong>' + rows.length + ' driver' + (rows.length === 1 ? '' : 's') + ' told on the site</strong> (pop-up on their next visit)';
    if(n.dmRequested) h += ' &middot; Discord DM: <strong>' + (n.dmSent || 0) + ' sent</strong>' + (failedDm.length ? ', <strong>' + failedDm.length + ' not delivered</strong>' : '');
    else h += ' &middot; no Discord DMs sent';
    h += '.';
    const bad = rows.filter(r => r.dm === 'failed' || r.notice === 'failed');
    if(bad.length) h += '<ul>' + bad.map(r => '<li><strong>' + esc(r.name) + '</strong> &mdash; ' + esc(RT_DM_REASONS[r.reason] || r.reason || 'not delivered') + '</li>').join('') + '</ul>' + (failedDm.length ? '<div class="field-hint">They will still see the pop-up when they next open the site. Ping them on Discord yourself or press Re-send once it is sorted.</div>' : '');
    return h + '</div>';
  }
  function rtDmChip(row){
    if(!row) return '';
    if(row.dm === 'sent') return '<span class="rt-dm-chip ok" title="Discord DM delivered">DM sent</span>';
    if(row.dm === 'off') return '<span class="rt-dm-chip off" title="No Discord DM was requested">no DM</span>';
    return '<span class="rt-dm-chip bad" title="' + esc(RT_DM_REASONS[row.reason] || 'not delivered') + '">DM not delivered</span>';
  }
  function rtNeedsResend(event){ return (event.dmLog || []).some(r => r && (r.dm !== 'sent' || r.notice !== 'sent')); }
  function rtApplyNotifyToEvent(ev, notify){
    if(!ev || !notify || !Array.isArray(notify.drivers)) return;
    const touched = new Set(notify.drivers.map(d => d.key));
    const kept = (ev.dmLog || []).filter(r => !touched.has(r.key));
    ev.dmLog = kept.concat(notify.drivers.map(d => ({ key: d.key, name: d.name, kind: d.kind, notice: d.notice, dm: d.dm, reason: d.reason, atMs: d.atMs })));
  }
  async function rtAcknowledgeEvent(eventId, driverName, status, reason){ return rtApiCall('?raceTeamEventAcknowledge=1', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({eventId, driverName, status, reason}) }); }
  async function rtDeleteEvent(eventId){ return rtApiCall(`?raceTeamEventDelete=1&id=${encodeURIComponent(eventId)}`, { method: 'POST' }); }
  function driverNameKey(name){ return String(name || '').trim().toLowerCase(); }

  // ---- Race Team Liveries ----
  async function rtFetchLiveries(teamId){ return apiGet('raceTeamLiveryList', `&teamId=${encodeURIComponent(teamId)}`); }
  async function rtSaveLivery(payload){ return apiPost('raceTeamLiverySave', payload); }
  async function rtRequestLivery(liveryId){ return apiPost('raceTeamLiveryRequest', { liveryId }); }
  async function rtDeleteLivery(liveryId){ return apiPostQ('raceTeamLiveryDelete', `&id=${encodeURIComponent(liveryId)}`); }
  function rtEventBannerStyle(event){ if(!event.simgridImageUrl) return ''; return `background-image:linear-gradient(90deg,rgba(13,17,22,.92),rgba(13,17,22,.55)),url('${event.simgridImageUrl.replace(/'/g,"%27")}');background-size:cover;background-position:center`; }
  // ============================================================
  // Local timezone display for stint times. Stint times are stored as
  // fixed "HH:MM UTC" strings (see the stint-time dropdown below) - this
  // section auto-detects the viewer's browser timezone on load, lets them
  // override it, remembers the choice the same way myDriverName is
  // remembered, and converts every displayed stint time from UTC into
  // whatever timezone the viewer has set.
  // ============================================================
  const RT_TZ_KEY = 'IFWL_MY_RACE_TEAM_TZ';
  let detectedTimezone = '';
  try{ detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }catch(_){}
  function getMyTimezone(){
    try{ const saved = localStorage.getItem(RT_TZ_KEY); if(saved) return saved; }catch(_){}
    return detectedTimezone || 'UTC';
  }
  function setMyTimezone(tz){ try{ localStorage.setItem(RT_TZ_KEY, tz); }catch(_){} }
  function isTimezoneAutoDetected(){ try{ return !localStorage.getItem(RT_TZ_KEY); }catch(_){ return true; } }
  const COMMON_TIMEZONES = [
    'UTC','Europe/London','Europe/Dublin','Europe/Lisbon','Europe/Paris','Europe/Berlin','Europe/Madrid','Europe/Rome','Europe/Amsterdam',
    'Europe/Warsaw','Europe/Athens','Europe/Bucharest','Europe/Moscow','America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
    'America/Sao_Paulo','America/Toronto','Australia/Sydney','Australia/Perth','Asia/Tokyo','Asia/Singapore','Asia/Dubai','Asia/Kolkata',
    'Pacific/Auckland'
  ];
  function timezoneOptionList(){
    let zones = COMMON_TIMEZONES.slice();
    try{ if(typeof Intl.supportedValuesOf === 'function') zones = Intl.supportedValuesOf('timeZone'); }catch(_){}
    if(detectedTimezone && !zones.includes(detectedTimezone)) zones = [detectedTimezone, ...zones];
    return [...new Set(zones)];
  }
  // Every stored stint time starts "HH:MM" (the dropdown always writes
  // "HH:MM UTC") - parsed loosely so any pre-existing free-typed value that
  // happens to start with a time still converts; anything unparseable just
  // falls back to being shown as typed.
  function parseStintTimeParts(str){
    const m = String(str || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if(!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if(!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
    return { hh, mm };
  }
  // eventDateMs is the event's calendar date (stored as that date's local
  // midnight when the event was created). We only need its Y/M/D - read
  // with local getters (matching how eventTitleLine already displays that
  // same date to this viewer) and combine with the stint's UTC time-of-day
  // to get the real UTC instant for that stint.
  function stintTimeToUtcDate(event, timeStr){
    const parts = parseStintTimeParts(timeStr);
    if(!parts || !event || !event.eventDateMs) return null;
    // +12h then read the UTC date: gives the intended calendar day whatever timezone the event was created in
    const base = new Date(event.eventDateMs + 12 * 3600 * 1000);
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), parts.hh, parts.mm, 0));
  }
  function formatStintTimeLocal(event, timeStr){
    const raw = String(timeStr || '').trim();
    if(!raw) return '';
    const utcDate = stintTimeToUtcDate(event, raw);
    if(!utcDate) return raw;
    const tz = getMyTimezone();
    if(tz === 'UTC') return raw;
    try{
      const localPart = utcDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: tz });
      return `${localPart} (${raw})`;
    }catch(_){ return raw; }
  }
  function rtTimezoneBarHtml(){
    const tz = getMyTimezone();
    const auto = isTimezoneAutoDetected();
    return `<div class="rt-tz-bar">🕒 Stint times below are shown in your local time — <b>${esc(tz)}</b>${auto ? ' (auto-detected)' : ''}.
      <a href="#" id="rtTzChangeLink">Change</a>
      <select id="rtTzSelect" class="hidden">${timezoneOptionList().map(z => `<option value="${esc(z)}" ${z === tz ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select>
    </div>`;
  }
  function wireTimezoneBar(onChange){
    const link = q('rtTzChangeLink');
    const select = q('rtTzSelect');
    if(!link || !select) return;
    link.addEventListener('click', (e) => { e.preventDefault(); link.classList.add('hidden'); select.classList.remove('hidden'); select.focus(); });
    select.addEventListener('change', () => { setMyTimezone(select.value); if(onChange) onChange(); });
  }
  // ✅ ADDED: fixed 30-minute stint time options (UTC) - replaces manual
  // free-typing so times parse reliably (needed for the local-timezone
  // conversion above) and captains no longer have to remember the
  // "20:00 UTC" format by hand.
  const STINT_TIME_OPTIONS = (() => {
    const list = [];
    for(let h = 0; h < 24; h++){
      for(let m = 0; m < 60; m += 30){
        list.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} UTC`);
      }
    }
    return list;
  })();
  function stintTimeSelectHtml(i, currentValue){
    const cur = String(currentValue || '').trim();
    const known = STINT_TIME_OPTIONS.includes(cur);
    const extra = cur && !known ? `<option value="${esc(cur)}" selected>${esc(cur)} (existing)</option>` : '';
    const opts = STINT_TIME_OPTIONS.map(t => `<option value="${esc(t)}" ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');
    return `<select data-rt-stint-time="${i}" style="margin-top:4px"><option value="">— Not set —</option>${extra}${opts}</select>`;
  }

  // ============================================================
  // Events & Stints
  // ============================================================
  let currentTeamId = null;
  let currentTeamName = '';
  let currentIsOwner = false;
  let currentRosterNames = [];
  let currentEvents = [];
  let myDriverName = '';

  function eventsCardsHtml(){
    if(!currentEvents.length) return `<div class="empty">No events yet${currentIsOwner ? ' — create one below.' : ' for this team.'}</div>`;
    return currentEvents.map(ev => currentIsOwner ? ownerEventCardHtml(ev) : memberEventCardHtml(ev)).join('');
  }

  // ✅ ADDED: shared title line for event cards, now including round name
  // and date alongside car number/car - used by all three card renderers
  // so the format stays identical everywhere.
  function eventTitleLine(event){
    const bits = [];
    if(event.roundName) bits.push(esc(event.roundName));
    if(event.eventDateMs) bits.push(new Date(event.eventDateMs).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
    bits.push(`Car #${esc(event.raceNumber||'-')} — ${esc(event.car||'Car TBC')}`);
    return bits.join(' &middot; ');
  }

  function ownerEventCardHtml(event){
    const drivers = currentRosterNames;
    const stintCount = Number(event.stintCount || 0);
    const availability = event.availability || {};
    const stintTimes = Array.isArray(event.stintTimes) ? event.stintTimes : [];
    const availHeader = Array.from({length: stintCount}, (_,i) => `<th>Stint ${i+1}${stintTimes[i] ? `<br><span style="font-weight:600;text-transform:none">${esc(formatStintTimeLocal(event, stintTimes[i]))}</span>` : ''}</th>`).join('');
    // ✅ ADDED: response-progress hint - "X of Y responded" - so a captain
    // can see at a glance whether it's worth chasing anyone before
    // allocating stints, without having to eyeball the whole table.
    const respondedCount = drivers.filter(name => !!availability[driverNameKey(name)]).length;
    const availRows = drivers.map(name => {
      const entry = availability[driverNameKey(name)];
      const cells = Array.from({length: stintCount}, (_,i) => {
        const scheduled = !!entry?.stints?.[i];
        const availableOnly = !scheduled && !!entry?.availableStints?.[i];
        const cls = scheduled ? 'yes' : (availableOnly ? 'avail' : 'no');
        const mark = scheduled || availableOnly ? '✓' : '—';
        // ✅ CHANGED: was "Scheduled"/"Available (backup)" - per Dave Sipos
        // (Race Team lead), "Scheduled" reads as if the stint's already
        // locked in, when really nobody's scheduled until stints are
        // finalised. Relabelled to "Available"/"Backup" - the underlying
        // scheduled/availableOnly booleans and stints/availableStints data
        // are unchanged, this is display text only.
        return `<td class="rt-avail-cell ${cls}" title="${scheduled ? 'Available' : availableOnly ? 'Backup' : 'Not marked'}">${mark}</td>`;
      }).join('');
      return `<tr><td class="rt-avail-name">${esc(name)}</td>${cells}</tr>`;
    }).join('');
    const allocationRows = Array.from({length: stintCount}, (_,i) => {
      const currentAssignment = (event.stints||[]).find(s => Number(s.index) === i)?.driverName || '';
      const options = drivers.map(name => {
        const entry = availability[driverNameKey(name)];
        const scheduled = !!entry?.stints?.[i];
        const availableOnly = !scheduled && !!entry?.availableStints?.[i];
        const tag = scheduled ? ' (Available)' : availableOnly ? ' (Backup)' : '';
        const selected = driverNameKey(currentAssignment) === driverNameKey(name) ? 'selected' : '';
        return `<option value="${esc(name)}" ${selected}>${esc(name)}${tag}</option>`;
      }).join('');
      return `<div class="rt-alloc-row"><span class="rt-alloc-label">Stint ${i+1}</span>
        <select data-rt-alloc-stint="${i}"><option value="">— Unassigned —</option>${options}</select>
        ${stintTimeSelectHtml(i, stintTimes[i])}</div>`;
    }).join('');
    const dmRows = Array.isArray(event.dmLog) ? event.dmLog : [];
    const ackRows = Object.values(event.acknowledgements||{}).map(a => {
      const cls = a.status === 'yes' ? 'good' : a.status === 'no' ? 'bad' : 'pending';
      const text = a.status === 'yes' ? '✅ Confirmed' : a.status === 'no' ? `❌ Declined — ${esc(a.reason||'no reason given')}` : '⏳ Awaiting response';
      const dl = dmRows.filter(r => r.key === driverNameKey(a.driverName))[0];
      return `<div class="rt-ack-row ${cls}"><strong>${esc(a.driverName)}</strong><span>${text} ${rtDmChip(dl)}</span></div>`;
    }).join('') || '<div class="empty">No stint plan finalised yet.</div>';
    const goneRows = dmRows.filter(r => r.kind === 'removed' && !(event.acknowledgements || {})[r.key]).map(r =>
      `<div class="rt-ack-row"><strong>${esc(r.name)}</strong><span>Taken off the plan ${rtDmChip(r)}</span></div>`).join('');
    const resendBtn = event.finalized && rtNeedsResend(event) ? '<button type="button" class="btn ghost" data-rt-resend="1">Re-send to drivers not reached</button>' : '';

    return `<div class="rt-event-card" data-rt-event-id="${esc(event.id)}">
      <div class="rt-event-head" style="${esc(rtEventBannerStyle(event))}">
        <strong>${eventTitleLine(event)}</strong>
        ${event.simgridLink ? `<a href="${esc(event.simgridLink)}" target="_blank" rel="noopener">SimGrid ↗</a>` : ''}
        <span class="badge ${event.finalized?'purple':''}">${event.finalized?'Finalised':'Planning'}</span>
        <button type="button" data-rt-event-delete="1">Delete event</button>
      </div>
      <div class="rt-event-section"><h5>Driver availability (${stintCount} stints) <span class="field-hint" style="text-transform:none;font-weight:600;margin-left:6px;">— ${respondedCount} of ${drivers.length} responded</span></h5>
        <div class="table-wrap"><table class="results-table rt-avail-table"><thead><tr><th>Driver</th>${availHeader}</tr></thead>
        <tbody>${availRows || `<tr><td colspan="${stintCount+1}" class="empty">No drivers on this roster yet.</td></tr>`}</tbody></table></div>
      </div>
      <div class="rt-event-section"><h5>Stint allocation &amp; times</h5>
        <div class="rt-alloc-grid">${allocationRows}</div>
        <label class="rt-dm-switch"><input type="checkbox" data-rt-notify-dm="1" ${rtDmPref() ? 'checked' : ''}> Also send changed drivers a Discord DM <span class="field-hint">(they always get a pop-up on the site; only drivers whose own stints or times changed are told, everyone else keeps their confirmation)</span></label>
        <button type="button" class="btn ghost" data-rt-save-times="1">Save stint times</button>
        <button type="button" class="btn purple" data-rt-populate="1">${event.finalized ? 'Update stints' : 'Populate stints'}</button>
        ${event.finalized ? '<button type="button" class="btn teal" data-rt-draft="1">Make draft image</button>' : ''}
      </div>
      <div class="rt-event-section"><h5>Acknowledgements</h5>${rtNotifyReportHtml(rtLastNotify[event.id])}${ackRows}${goneRows}${resendBtn ? `<div style="margin-top:10px">${resendBtn} <span class="save-status" data-rt-resend-status="1"></span></div>` : ''}</div>
    </div>`;
  }

  function memberEventCardHtml(event){
    const key = driverNameKey(myDriverName);
    const stintCount = Number(event.stintCount || 0);
    const stintTimes = Array.isArray(event.stintTimes) ? event.stintTimes : [];
    const myEntry = event.availability?.[key] || {};
    const myScheduled = Array.isArray(myEntry.stints) ? myEntry.stints : [];
    const myAvailableOnly = Array.isArray(myEntry.availableStints) ? myEntry.availableStints : [];
    const myAck = event.acknowledgements?.[key];
    const myAssignedStints = (event.stints||[]).filter(s => driverNameKey(s.driverName) === key).map(s => Number(s.index)+1);
    const myAssignedStintsText = myAssignedStints.map(n => stintTimes[n-1] ? `Stint ${n} (${formatStintTimeLocal(event, stintTimes[n-1])})` : `Stint ${n}`).join(', ');
    const header = `<div class="rt-event-head" style="${esc('border-radius:14px 14px 0 0;' + rtEventBannerStyle(event))}">
      <strong>${eventTitleLine(event)}</strong>
      ${event.simgridLink ? `<a href="${esc(event.simgridLink)}" target="_blank" rel="noopener">SimGrid ↗</a>` : ''}
      <span class="badge ${event.finalized?'purple':''}">${event.finalized?'Finalised':'Planning'}</span></div>`;
    let bodyHtml;
    if(!event.finalized){
      // Two independent boxes per stint: green "Available" = this is my
      // planned/set stint; purple "Backup" = I could also cover this one
      // if plans change. Either, both, or neither can be active.
      // ✅ CHANGED: labels were "Scheduled"/"Available" - renamed per Dave
      // Sipos (Race Team lead): "Scheduled" implied the stint was locked
      // in, when nobody's actually scheduled until stints are finalised.
      // Data model (myScheduled/myAvailableOnly, stints/availableStints)
      // is unchanged - display text only.
      const groups = Array.from({length: stintCount}, (_,i) => {
        const timeLabel = stintTimes[i] ? `<span>${esc(formatStintTimeLocal(event, stintTimes[i]))}</span>` : '';
        return `<div class="rt-mystint-group">
          <div class="rt-mystint-stintlabel">Stint ${i+1}${timeLabel}</div>
          <div class="rt-mystint-pair">
            <div class="rt-mystint-toggle ${myScheduled[i]?'active':''}" data-mystint-toggle="${i}">Available</div>
            <div class="rt-mystint-toggle-avail ${myAvailableOnly[i]?'active':''}" data-mystint-avail-toggle="${i}">Backup</div>
          </div>
        </div>`;
      }).join('');
      bodyHtml = `<div class="rt-event-section"><h5>Mark which stints you're free for</h5><div class="rt-mystint-grid">${groups}</div><button type="button" class="btn teal" data-mystint-save="1">Save my availability</button></div>`;
    }else if(myAck && myAck.status === 'pending'){
      const assignedText = myAssignedStints.length ? ` — you're assigned ${myAssignedStintsText}` : ' — you are not assigned a stint this event';
      bodyHtml = `<div class="rt-event-section"><div class="rt-notify-banner"><strong>${esc(currentTeamName)} stints finalised${esc(assignedText)}.</strong>
        <div class="rt-notify-actions">
          <button type="button" class="rt-notify-yes" data-mystint-ack="yes">Yes, I'm in</button>
          <button type="button" class="rt-notify-no" data-mystint-ack-no-toggle="1">No, can't make it</button>
          <input type="text" class="rt-notify-reason hidden" placeholder="Quick reason..." data-mystint-reason="1">
          <button type="button" class="rt-notify-no hidden" data-mystint-ack="no">Confirm decline</button>
        </div></div></div>`;
    }else if(myAck){
      const cls = myAck.status === 'yes' ? 'good' : 'bad';
      const text = myAck.status === 'yes' ? "✅ You confirmed you're in." : `❌ You declined${myAck.reason?' — '+esc(myAck.reason):''}.`;
      bodyHtml = `<div class="rt-event-section"><div class="rt-ack-row ${cls}"><strong>${esc(myDriverName)}</strong><span>${text}</span></div>
        ${myAssignedStints.length ? `<p class="field-hint" style="margin-top:8px">You're assigned ${esc(myAssignedStintsText)}.</p>` : ''}</div>`;
    }else{
      bodyHtml = '<div class="rt-event-section"><div class="empty">Stints are finalised, but you weren\'t assigned or acknowledged for this event.</div></div>';
    }
    return `<div class="rt-event-card" data-mystint-event-id="${esc(event.id)}">${header}${bodyHtml}</div>`;
  }

  function wireEventCards(){
    if(currentIsOwner){
      currentEvents.forEach(event => {
        const card = document.querySelector(`[data-rt-event-id="${window.CSS && CSS.escape ? CSS.escape(event.id) : event.id}"]`);
        if(!card) return;
        card.querySelector('[data-rt-event-delete]')?.addEventListener('click', async () => {
          if(!confirm('Delete this event? This cannot be undone.')) return;
          try{ await rtDeleteEvent(event.id); currentEvents = currentEvents.filter(e => e.id !== event.id); renderEventsBody(); renderClaimBody(); }
          catch(e){ alert('Could not delete event: ' + e.message); }
        });
        card.querySelector('[data-rt-save-times]')?.addEventListener('click', async () => {
          const timeInputs = [...card.querySelectorAll('[data-rt-stint-time]')].sort((a,b) => Number(a.dataset.rtStintTime) - Number(b.dataset.rtStintTime));
          const stintTimes = timeInputs.map(inp => inp.value.trim());
          try{
            const notifyDm = !!card.querySelector('[data-rt-notify-dm]')?.checked; rtSetDmPref(notifyDm);
            const result = await rtSaveEvent({ eventId: event.id, teamId: currentTeamId, teamName: currentTeamName, platform: event.platform, simgridLink: event.simgridLink, raceNumber: event.raceNumber, car: event.car, stintCount: event.stintCount, stintTimes, roundName: event.roundName, eventDateMs: event.eventDateMs, notifyDm });
            const idx = currentEvents.findIndex(e => e.id === event.id);
            if(idx !== -1){
              currentEvents[idx].stintTimes = stintTimes; if(result.simgridImageUrl) currentEvents[idx].simgridImageUrl = result.simgridImageUrl;
              if(result.acknowledgements) currentEvents[idx].acknowledgements = result.acknowledgements;
              if(result.notify){ rtLastNotify[event.id] = result.notify; rtApplyNotifyToEvent(currentEvents[idx], result.notify); }
            }
            renderEventsBody();
            renderClaimBody();
          }catch(e){ alert('Could not save stint times: ' + e.message); }
        });
        card.querySelector('[data-rt-draft]')?.addEventListener('click', () => openDraft(event));
        card.querySelector('[data-rt-populate]')?.addEventListener('click', async () => {
          const selects = [...card.querySelectorAll('[data-rt-alloc-stint]')];
          const stints = selects.map(sel => ({ index: Number(sel.dataset.rtAllocStint), driverName: sel.value }));
          // ✅ ADDED: warn before finalising if an assignment doesn't match
          // what that driver actually marked (Available or Backup) for
          // that stint - easy to fat-finger the wrong name in a busy
          // dropdown, and this catches it before drivers get notified.
          const conflicts = stints.filter(s => {
            if(!s.driverName) return false;
            const entry = event.availability?.[driverNameKey(s.driverName)];
            const scheduled = !!entry?.stints?.[s.index];
            const availableOnly = !!entry?.availableStints?.[s.index];
            return !scheduled && !availableOnly;
          });
          if(conflicts.length){
            const names = conflicts.map(c => `Stint ${c.index+1}: ${c.driverName}`).join('\n');
            if(!confirm(`Heads up — these assignments don't match what the driver marked as Available or Backup:\n${names}\n\nFinalise anyway?`)) return;
          }
          try{
            const notifyDm = !!card.querySelector('[data-rt-notify-dm]')?.checked; rtSetDmPref(notifyDm);
            const result = await rtFinalizeEvent(event.id, stints, notifyDm);
            const idx = currentEvents.findIndex(e => e.id === event.id);
            if(idx !== -1){
              currentEvents[idx].stints = stints; currentEvents[idx].finalized = true;
              // the server decides who is back to "pending": only drivers whose own stints changed
              currentEvents[idx].acknowledgements = result.acknowledgements || {};
              rtLastNotify[event.id] = result.notify || null;
              if(result.notify) rtApplyNotifyToEvent(currentEvents[idx], result.notify);
            }
            renderEventsBody();
            renderClaimBody();
          }catch(e){ alert('Could not populate stints: ' + e.message); }
        });
        card.querySelector('[data-rt-resend]')?.addEventListener('click', async (evt) => {
          const btn = evt.currentTarget, st = card.querySelector('[data-rt-resend-status]');
          btn.disabled = true; if(st) st.textContent = 'Sending…';
          try{
            const r = await rtNotifyRetry(event.id);
            const idx = currentEvents.findIndex(e => e.id === event.id);
            if(idx !== -1 && Array.isArray(r.dmLog)) currentEvents[idx].dmLog = r.dmLog.map(x => ({ key: x.key, name: x.name, kind: x.kind, notice: x.notice, dm: x.dm, reason: x.reason, atMs: x.atMs }));
            rtLastNotify[event.id] = r.retried ? { dmRequested: true, dmSent: r.dmSent, dmFailed: r.dmFailed, drivers: r.drivers } : null;
            if(!r.retried) alert('Everyone has already been reached.');
            renderEventsBody();
          }catch(e){ btn.disabled = false; if(st) st.textContent = ''; alert('Could not re-send: ' + e.message); }
        });
      });
    } else {
      currentEvents.forEach(event => {
        const card = document.querySelector(`[data-mystint-event-id="${window.CSS && CSS.escape ? CSS.escape(event.id) : event.id}"]`);
        if(!card) return;
        card.querySelectorAll('[data-mystint-toggle]').forEach(el => el.addEventListener('click', () => el.classList.toggle('active')));
        card.querySelectorAll('[data-mystint-avail-toggle]').forEach(el => el.addEventListener('click', () => el.classList.toggle('active')));
        card.querySelector('[data-mystint-save]')?.addEventListener('click', async (evt) => {
          const btn = evt.currentTarget;
          const toggles = [...card.querySelectorAll('[data-mystint-toggle]')].sort((a,b) => Number(a.dataset.mystintToggle) - Number(b.dataset.mystintToggle));
          const availToggles = [...card.querySelectorAll('[data-mystint-avail-toggle]')].sort((a,b) => Number(a.dataset.mystintAvailToggle) - Number(b.dataset.mystintAvailToggle));
          const stints = toggles.map(t => t.classList.contains('active'));
          const availableStints = availToggles.map(t => t.classList.contains('active'));
          const originalLabel = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Saving…';
          try{
            await rtSetAvailability(event.id, myDriverName, stints, availableStints);
            const idx = currentEvents.findIndex(e => e.id === event.id);
            if(idx !== -1){ currentEvents[idx].availability = currentEvents[idx].availability || {}; currentEvents[idx].availability[driverNameKey(myDriverName)] = { driverName: myDriverName, stints, availableStints, updatedAtMs: Date.now() }; }
            btn.textContent = '✅ Saved!';
            btn.style.background = 'var(--ifwl-green)';
            btn.style.color = '#03211c';
            setTimeout(() => { btn.textContent = originalLabel; btn.style.background = ''; btn.style.color = ''; btn.disabled = false; }, 2500);
          }catch(e){
            alert('Could not save availability: ' + e.message);
            btn.textContent = originalLabel;
            btn.disabled = false;
          }
        });
        const noToggleBtn = card.querySelector('[data-mystint-ack-no-toggle]');
        const reasonInput = card.querySelector('[data-mystint-reason]');
        const confirmNoBtn = card.querySelector('[data-mystint-ack="no"]');
        noToggleBtn?.addEventListener('click', () => { reasonInput?.classList.remove('hidden'); confirmNoBtn?.classList.remove('hidden'); noToggleBtn.classList.add('hidden'); });
        card.querySelector('[data-mystint-ack="yes"]')?.addEventListener('click', async () => submitAck(event, 'yes', ''));
        confirmNoBtn?.addEventListener('click', async () => submitAck(event, 'no', reasonInput?.value.trim() || ''));
      });
    }
  }

  async function submitAck(event, status, reason){
    try{
      await rtAcknowledgeEvent(event.id, myDriverName, status, reason);
      const idx = currentEvents.findIndex(e => e.id === event.id);
      if(idx !== -1){ currentEvents[idx].acknowledgements = currentEvents[idx].acknowledgements || {}; currentEvents[idx].acknowledgements[driverNameKey(myDriverName)] = { driverName: myDriverName, status, reason, respondedAtMs: Date.now() }; }
      renderEventsBody();
      renderClaimBody();
    }catch(e){ alert('Could not record your response: ' + e.message); }
  }

  function renderEventsBody(){
    const body = q('eventsBody');
    if(!currentIsOwner && !myDriverName){
      body.innerHTML = `
        <div class="field-group"><label>Which roster name is you?</label>
          <select id="myNameSelect"><option value="">Select your name...</option>${currentRosterNames.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>
        </div>`;
      q('myNameSelect').addEventListener('change', (e) => { myDriverName = e.target.value; try{ localStorage.setItem('IFWL_MY_RACE_TEAM_DRIVER_NAME', myDriverName); }catch(_){} renderEventsBody(); renderClaimBody(); });
      return;
    }

    let newEventForm = '';
    if(currentIsOwner){
      newEventForm = `
        <div class="rt-events-section">
          <h4>Create Event</h4>
          <p class="field-hint" style="margin-bottom:10px; line-height:1.5;">
            Set up an upcoming race for your team. The <b>SimGrid link</b> is required — it pulls the event banner and is what drivers use to register on SimGrid itself. <b>Stints</b> is how many driver changes this race will have (e.g. 5 stints = 4 driver swaps). Once created, your roster can mark which stints they're free for below, then you allocate drivers to each stint and finalise the plan.
          </p>
          <div class="rt-new-event">
            <div class="rt-field" style="max-width:130px;">
              <label for="newEvDate">Event date</label>
              <input type="date" id="newEvDate">
            </div>
            <div class="rt-field" style="flex:1 1 160px;">
              <label for="newEvRoundName">Round name</label>
              <input type="text" placeholder="e.g. Round 3 - Spa" id="newEvRoundName" maxlength="80">
            </div>
            <div class="rt-field" style="max-width:120px;">
              <label for="newEvRaceNum">Car number</label>
              <input type="text" placeholder="e.g. 7" id="newEvRaceNum" maxlength="20">
            </div>
            <div class="rt-field" style="flex:1 1 160px;">
              <label for="newEvCar">Car</label>
              <input type="text" placeholder="e.g. Porsche 992 GT3 R" id="newEvCar" maxlength="120">
            </div>
            <div class="rt-field" style="flex:2 1 260px;">
              <label for="newEvSimgrid">SimGrid event link (required)</label>
              <input type="text" placeholder="https://www.thesimgrid.com/..." id="newEvSimgrid" maxlength="300">
            </div>
            <div class="rt-field" style="max-width:120px;">
              <label for="newEvPlatform">Platform</label>
              <select id="newEvPlatform"><option value="pc">PC</option><option value="console">Console</option></select>
            </div>
            <div class="rt-field" style="max-width:110px;">
              <label for="newEvStintCount">Stints (driver changes)</label>
              <input type="number" min="1" max="24" value="5" id="newEvStintCount">
            </div>
            <div class="rt-field rt-field-createbtn">
              <button type="button" class="btn teal" id="newEvBtn">Create event</button>
            </div>
          </div>
          ${eventsCardsHtml()}
        </div>`;
    } else {
      newEventForm = eventsCardsHtml();
    }
    body.innerHTML = rtTimezoneBarHtml() + newEventForm;
    wireEventCards();
    wireTimezoneBar(() => renderEventsBody());

    q('newEvBtn')?.addEventListener('click', async () => {
      const raceNumber = q('newEvRaceNum').value.trim();
      const car = q('newEvCar').value.trim();
      const simgridLink = q('newEvSimgrid').value.trim();
      const platform = q('newEvPlatform').value;
      const stintCount = Math.max(1, Math.min(24, Number(q('newEvStintCount').value || 5)));
      const roundName = q('newEvRoundName').value.trim();
      const eventDateMs = q('newEvDate').value ? new Date(q('newEvDate').value + 'T00:00:00').getTime() : 0;
      if(!simgridLink){ alert('A SimGrid event link is required to create an event.'); return; }
      try{
        const result = await rtSaveEvent({ teamId: currentTeamId, teamName: currentTeamName, platform, simgridLink, raceNumber, car, stintCount, roundName, eventDateMs });
        currentEvents.unshift({ id: result.id, teamId: currentTeamId, teamName: currentTeamName, platform, simgridLink, simgridImageUrl: result.simgridImageUrl || '', raceNumber, car, stintCount, roundName, eventDateMs, stintTimes: [], stints: [], availability: {}, finalized: false, acknowledgements: {} });
        currentEvents.sort(sortEventsSoonestFirst);
        renderEventsBody();
        renderClaimBody();
      }catch(e){ alert('Could not create event: ' + e.message); }
    });
  }

  // ✅ ADDED: sort events by their actual race date, soonest first - events
  // with no date set (older ones created before this field existed) sort
  // to the end rather than jumbling in with dated ones.
  function sortEventsSoonestFirst(a, b){
    const aMs = a.eventDateMs || Infinity;
    const bMs = b.eventDateMs || Infinity;
    return aMs - bMs;
  }

  async function initEventsPanel(){
    const body = q('eventsBody');
    body.innerHTML = '<div class="empty">Loading events&hellip;</div>';
    try{ currentEvents = await rtFetchEvents(currentTeamId); }
    catch(e){ body.innerHTML = `<div class="empty">Could not load events: ${e.message}</div>`; return; }
    currentEvents.sort(sortEventsSoonestFirst);
    renderEventsBody();
    renderClaimBody();
  }

  // ============================================================
  // Claim Your Stints — a dedicated, driver-facing tab. Independent of
  // owner/member/staff status: whoever is looking at the page picks which
  // roster name is them, then ticks availability on open events and
  // confirms/declines on finalised ones. This is the same interaction the
  // old Live Timings panel offered every driver directly - it shouldn't be
  // buried inside the admin allocation view (which only shows on
  // non-finalised events anyway, and only to whoever can manage the team).
  // ============================================================
  function claimEventBlockHtml(event){
    const key = driverNameKey(myDriverName);
    const stintCount = Number(event.stintCount || 0);
    const stintTimes = Array.isArray(event.stintTimes) ? event.stintTimes : [];
    const myEntry = event.availability?.[key] || {};
    const myScheduled = Array.isArray(myEntry.stints) ? myEntry.stints : [];
    const myAvailableOnly = Array.isArray(myEntry.availableStints) ? myEntry.availableStints : [];
    const myAck = event.acknowledgements?.[key];
    const myAssignedStints = (event.stints||[]).filter(s => driverNameKey(s.driverName) === key).map(s => Number(s.index)+1);
    const myAssignedStintsText = myAssignedStints.map(n => stintTimes[n-1] ? `Stint ${n} (${formatStintTimeLocal(event, stintTimes[n-1])})` : `Stint ${n}`).join(', ');
    const header = `<div class="rt-event-head" style="${esc('border-radius:14px 14px 0 0;' + rtEventBannerStyle(event))}">
      <strong>${eventTitleLine(event)}</strong>
      ${event.simgridLink ? `<a href="${esc(event.simgridLink)}" target="_blank" rel="noopener">SimGrid ↗</a>` : ''}
      <span class="badge ${event.finalized?'purple':''}">${event.finalized?'Finalised':'Planning'}</span></div>`;

    let bodyHtml;
    if(!event.finalized){
      const groups = Array.from({length: stintCount}, (_,i) => {
        const timeLabel = stintTimes[i] ? `<span>${esc(formatStintTimeLocal(event, stintTimes[i]))}</span>` : '';
        return `<div class="rt-mystint-group">
          <div class="rt-mystint-stintlabel">Stint ${i+1}${timeLabel}</div>
          <div class="rt-mystint-pair">
            <div class="rt-mystint-toggle ${myScheduled[i]?'active':''}" data-claim-toggle="${i}">Available</div>
            <div class="rt-mystint-toggle-avail ${myAvailableOnly[i]?'active':''}" data-claim-avail-toggle="${i}">Backup</div>
          </div>
        </div>`;
      }).join('');
      bodyHtml = `<div class="rt-event-section"><h5>Mark which stints you're free for</h5><div class="rt-mystint-grid">${groups}</div><button type="button" class="btn teal" data-claim-save="1">Save my availability</button></div>`;
    }else if(myAck && myAck.status === 'pending'){
      const assignedText = myAssignedStints.length ? ` — you're assigned ${myAssignedStintsText}` : ' — you are not assigned a stint this event';
      bodyHtml = `<div class="rt-event-section"><div class="rt-notify-banner"><strong>${esc(currentTeamName)} stints finalised${esc(assignedText)}.</strong>
        <div class="rt-notify-actions">
          <button type="button" class="rt-notify-yes" data-claim-ack="yes">Yes, I'm in</button>
          <button type="button" class="rt-notify-no" data-claim-ack-no-toggle="1">No, can't make it</button>
          <input type="text" class="rt-notify-reason hidden" placeholder="Quick reason..." data-claim-reason="1">
          <button type="button" class="rt-notify-no hidden" data-claim-ack="no">Confirm decline</button>
        </div></div></div>`;
    }else if(myAck){
      const cls = myAck.status === 'yes' ? 'good' : 'bad';
      const text = myAck.status === 'yes' ? "✅ You confirmed you're in." : `❌ You declined${myAck.reason?' — '+esc(myAck.reason):''}.`;
      bodyHtml = `<div class="rt-event-section"><div class="rt-ack-row ${cls}"><strong>${esc(myDriverName)}</strong><span>${text}</span></div>
        ${myAssignedStints.length ? `<p class="field-hint" style="margin-top:8px">You're assigned ${esc(myAssignedStintsText)}.</p>` : ''}</div>`;
    }else{
      bodyHtml = '<div class="rt-event-section"><div class="empty">Stints are finalised, but you weren\'t assigned or acknowledged for this event.</div></div>';
    }
    return `<div class="rt-event-card" data-claim-event-id="${esc(event.id)}">${header}${bodyHtml}</div>`;
  }

  function renderClaimBody(){
    const body = q('claimBody');
    if(!body) return;

    if(!myDriverName){
      body.innerHTML = `
        <div class="field-group"><label>Which roster name is you?</label>
          <select id="claimNameSelect"><option value="">Select your name...</option>${currentRosterNames.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select>
        </div>`;
      q('claimNameSelect').addEventListener('change', (e) => {
        myDriverName = e.target.value;
        try{ localStorage.setItem('IFWL_MY_RACE_TEAM_DRIVER_NAME', myDriverName); }catch(_){}
        renderClaimBody();
      });
      return;
    }

    body.innerHTML = `
      <div class="field-hint" style="margin-bottom:14px;">Claiming as <b>${esc(myDriverName)}</b> — <a href="#" id="claimSwitchName">not you? switch</a></div>
      ${rtTimezoneBarHtml()}
      ${currentEvents.length ? currentEvents.map(claimEventBlockHtml).join('') : '<div class="empty">No events yet.</div>'}
    `;
    q('claimSwitchName')?.addEventListener('click', (e) => { e.preventDefault(); myDriverName = ''; renderClaimBody(); });
    wireTimezoneBar(() => renderClaimBody());

    currentEvents.forEach(event => {
      const card = document.querySelector(`[data-claim-event-id="${window.CSS && CSS.escape ? CSS.escape(event.id) : event.id}"]`);
      if(!card) return;
      card.querySelectorAll('[data-claim-toggle]').forEach(el => el.addEventListener('click', () => el.classList.toggle('active')));
      card.querySelectorAll('[data-claim-avail-toggle]').forEach(el => el.addEventListener('click', () => el.classList.toggle('active')));
      card.querySelector('[data-claim-save]')?.addEventListener('click', async (evt) => {
        const btn = evt.currentTarget;
        const toggles = [...card.querySelectorAll('[data-claim-toggle]')].sort((a,b) => Number(a.dataset.claimToggle) - Number(b.dataset.claimToggle));
        const availToggles = [...card.querySelectorAll('[data-claim-avail-toggle]')].sort((a,b) => Number(a.dataset.claimAvailToggle) - Number(b.dataset.claimAvailToggle));
        const stints = toggles.map(t => t.classList.contains('active'));
        const availableStints = availToggles.map(t => t.classList.contains('active'));
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try{
          await rtSetAvailability(event.id, myDriverName, stints, availableStints);
          const idx = currentEvents.findIndex(e => e.id === event.id);
          if(idx !== -1){ currentEvents[idx].availability = currentEvents[idx].availability || {}; currentEvents[idx].availability[driverNameKey(myDriverName)] = { driverName: myDriverName, stints, availableStints, updatedAtMs: Date.now() }; }
          // ✅ FIXED: this used to save silently with zero visual feedback -
          // drivers were reporting the site looked broken when it had
          // actually saved fine. A clear, unmissable confirmation now shows
          // right on the button itself.
          btn.textContent = '✅ Saved!';
          btn.style.background = 'var(--ifwl-green)';
          btn.style.color = '#03211c';
          setTimeout(() => { btn.textContent = originalLabel; btn.style.background = ''; btn.style.color = ''; btn.disabled = false; }, 2500);
        }catch(e){
          alert('Could not save availability: ' + e.message);
          btn.textContent = originalLabel;
          btn.disabled = false;
        }
      });
      const noToggleBtn = card.querySelector('[data-claim-ack-no-toggle]');
      const reasonInput = card.querySelector('[data-claim-reason]');
      const confirmNoBtn = card.querySelector('[data-claim-ack="no"]');
      noToggleBtn?.addEventListener('click', () => { reasonInput?.classList.remove('hidden'); confirmNoBtn?.classList.remove('hidden'); noToggleBtn.classList.add('hidden'); });
      card.querySelector('[data-claim-ack="yes"]')?.addEventListener('click', async () => claimAck(event, 'yes', ''));
      confirmNoBtn?.addEventListener('click', async () => claimAck(event, 'no', reasonInput?.value.trim() || ''));
    });
  }

  async function claimAck(event, status, reason){
    try{
      await rtAcknowledgeEvent(event.id, myDriverName, status, reason);
      const idx = currentEvents.findIndex(e => e.id === event.id);
      if(idx !== -1){ currentEvents[idx].acknowledgements = currentEvents[idx].acknowledgements || {}; currentEvents[idx].acknowledgements[driverNameKey(myDriverName)] = { driverName: myDriverName, status, reason, respondedAtMs: Date.now() }; }
      renderClaimBody();
    }catch(e){ alert('Could not record your response: ' + e.message); }
  }

  // ============================================================
  // Audit Log — who created/edited/finalised/deleted each event. Owner-only
  // (staff or the genuine team owner - same canManage gate as everything
  // else on this hub), read straight from race_team_event_audit, which the
  // backend writes to alongside every real event action - nothing here can
  // be faked or edited from the browser.
  // ============================================================
  const AUDIT_ACTION_LABELS = {
    created: { label: 'Created event', icon: '🟢' },
    updated: { label: 'Edited event', icon: '🟡' },
    finalized: { label: 'Finalised stints', icon: '🟣' },
    deleted: { label: 'Deleted event', icon: '🔴' },
    notified: { label: 'Told drivers about stint changes', icon: '📣' },
    'notify-retry': { label: 'Re-sent stint notifications', icon: '🔁' }
  };

  async function renderAuditLog(){
    const body = q('auditLogBody');
    if(!body) return;
    body.innerHTML = '<div class="empty">Loading&hellip;</div>';

    let entries = [];
    try{ entries = (await apiGet('raceTeamAuditLog', `&teamId=${encodeURIComponent(currentTeamId)}`)).entries || []; }
    catch(e){ body.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }

    if(!entries.length){ body.innerHTML = '<div class="empty">No audit history yet for this team.</div>'; return; }

    body.innerHTML = entries.map(e => {
      const meta = AUDIT_ACTION_LABELS[e.action] || { label: e.action || 'Unknown action', icon: '⚪' };
      const d = e.details || {};
      const detailBits = [];
      if(d.raceNumber) detailBits.push(`Race #${esc(d.raceNumber)}`);
      if(d.car) detailBits.push(esc(d.car));
      if(d.platform) detailBits.push(d.platform === 'console' ? 'Console' : 'PC');
      if(Number.isFinite(d.assignedCount) && Number.isFinite(d.stintCount)) detailBits.push(`${d.assignedCount}/${d.stintCount} stints assigned`);
      if(Number.isFinite(d.changedDrivers)) detailBits.push(`${d.changedDrivers} driver${d.changedDrivers === 1 ? '' : 's'} needed to reconfirm`);
      if(e.action === 'notified' && Number.isFinite(d.drivers)) detailBits.push(`${d.drivers} told on site` + (d.dmRequested ? `, DM ${d.dmSent} sent / ${d.dmFailed} not delivered` : ', no DMs'));
      if(e.action === 'notify-retry' && Number.isFinite(d.retried)) detailBits.push(`${d.retried} retried, ${d.dmSent} DM sent`);
      return `
        <div class="note-item" style="display:flex;align-items:flex-start;gap:10px;">
          <span style="font-size:16px;">${meta.icon}</span>
          <div style="flex:1;">
            <div><strong>${meta.label}</strong> — <span class="field-hint" style="font-weight:700;color:var(--text-primary);text-transform:none;">${esc(e.actorName)}</span></div>
            ${detailBits.length ? `<div class="field-hint" style="margin-top:3px;">${detailBits.join(' · ')}</div>` : ''}
            <div class="field-hint" style="margin-top:3px;">${e.atMs ? new Date(e.atMs).toLocaleString() : ''}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ============================================================
  // IFWL Racing Team Liveries — a private per-team file library so drivers
  // stop having to dig through Discord history for the right livery.
  // Anyone on the team's roster can browse and request one (goes straight
  // to their Inbox on Licence Centre); adding one needs the team's upload
  // password, checked server-side - a wrong password never saves the file.
  // Deleting/organizing stays limited to whoever can already manage the
  // team (same canManage the Roster tab already uses).
  // ============================================================
  let currentLiveries = [];

  function liveryRowHtml(l, canManageLiveries){
    const sizeLabel = l.sizeBytes ? `${(l.sizeBytes/1024/1024).toFixed(1)}MB` : '';
    const metaBits = [l.fileName, sizeLabel, l.notes].filter(Boolean).map(esc).join(' &middot; ');
    const thumb = l.previewUrl
      ? `<img src="${esc(l.previewUrl)}" alt="${esc(l.car)} preview" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--ifwl-line);flex:0 0 auto;">`
      : `<div style="width:64px;height:64px;border-radius:8px;border:1px dashed var(--ifwl-line);display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:10px;text-align:center;flex:0 0 auto;">No preview</div>`;
    return `
      <div class="note-item" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        ${thumb}
        <div style="flex:1;min-width:180px;">
          <strong>${esc(l.car)}</strong>
          ${metaBits ? `<div class="field-hint">${metaBits}</div>` : ''}
        </div>
        <button class="btn teal" type="button" data-livery-request="${esc(l.id)}">Send to my Inbox</button>
        ${canManageLiveries ? `<button class="btn ghost" type="button" data-livery-delete="${esc(l.id)}" style="color:#ffb3ba;">Delete</button>` : ''}
      </div>
    `;
  }

  async function renderLiveriesBody(){
    const body = q('liveriesBody');
    if(!body) return;
    body.innerHTML = '<div class="empty">Loading&hellip;</div>';

    let data;
    try{ data = await rtFetchLiveries(currentTeamId); }
    catch(e){ body.innerHTML = `<div class="empty">Could not load: ${e.message}</div>`; return; }

    currentLiveries = data.liveries || [];
    const canManageLiveries = !!data.canManage;
    const listHtml = currentLiveries.length
      ? currentLiveries.map(l => liveryRowHtml(l, canManageLiveries)).join('')
      : '<div class="empty">No liveries uploaded yet.</div>';

    body.innerHTML = `
      <div class="notice-card">Anyone on this team's roster can browse and request a livery below — it's sent straight to your Inbox on the Licence Centre. Adding a new livery needs the team's upload password from your team lead.</div>
      <div id="liveriesList">${listHtml}</div>
      <section class="panel" style="margin:18px 0 0;box-shadow:none;">
        <div class="panel-head"><div><h3 style="font-size:16px;">Add a livery</h3><small>Wrong password, and the file is not saved</small></div></div>
        <div class="panel-body">
          <div class="field-group"><label for="liveryCarInput">Car</label><input type="text" id="liveryCarInput" placeholder="e.g. Ferrari 296 GT3"></div>
          <div class="field-group"><label for="liveryFileInput">Livery file (.zip, max 60MB)</label><input type="file" id="liveryFileInput" accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream" style="display:block;margin-top:6px"></div>
          <div class="field-group"><label for="liveryPreviewInput">Preview image (optional — JPEG/PNG, max 5MB)</label><input type="file" id="liveryPreviewInput" accept="image/jpeg,image/png" style="display:block;margin-top:6px"><div class="field-hint">Shown as a thumbnail so drivers can see the livery before they download it. Not password-protected.</div></div>
          <div class="field-group"><label for="liveryNotesInput">Notes (optional)</label><input type="text" id="liveryNotesInput" placeholder="e.g. Season 4 spec"></div>
          <div class="field-group"><label for="liveryPasswordInput">Upload password</label><input type="password" id="liveryPasswordInput" placeholder="Ask your team lead" autocomplete="off"></div>
          <button class="btn purple" id="liveryUploadBtn" type="button">Upload Livery</button>
          <span class="save-status" id="liveryUploadStatus"></span>
        </div>
      </section>
    `;

    q('liveryUploadBtn')?.addEventListener('click', async () => {
      const carInput = q('liveryCarInput'), fileInput = q('liveryFileInput'), previewInput = q('liveryPreviewInput'), notesInput = q('liveryNotesInput'), passwordInput = q('liveryPasswordInput');
      const car = carInput.value.trim();
      const file = fileInput.files[0];
      const previewFile = previewInput.files[0];
      const notes = notesInput.value.trim();
      const password = passwordInput.value;
      const status = q('liveryUploadStatus');
      if(!car){ alert('Enter which car this livery is for.'); return; }
      if(!file){ alert('Choose a .zip file to upload.'); return; }
      if(!password){ alert('Enter the upload password.'); return; }
      try{
        status.textContent = 'Uploading…';
        const uploaded = await uploadLiveryZip(file, currentTeamId, password);
        let previewUrl = '', previewPath = '';
        if(previewFile){
          status.textContent = 'Uploading preview image…';
          try{
            const uploadedPreview = await uploadLiveryPreviewImage(previewFile, currentTeamId);
            previewUrl = uploadedPreview.url || '';
            previewPath = uploadedPreview.path || '';
          }catch(previewErr){
            // The livery zip already saved successfully - don't lose that
            // over a failed preview image, just let the driver know.
            alert('The livery uploaded, but the preview image failed: ' + previewErr.message);
          }
        }
        status.textContent = 'Saving…';
        await rtSaveLivery({ teamId: currentTeamId, car, fileName: uploaded.fileName || file.name, url: uploaded.url, path: uploaded.path, previewUrl, previewPath, sizeBytes: uploaded.sizeBytes || file.size, notes, password });
        await renderLiveriesBody();
      }catch(e){
        status.textContent = '';
        alert('Could not upload: ' + e.message);
      }
    });

    document.querySelectorAll('[data-livery-request]').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true; const original = btn.textContent; btn.textContent = 'Sending…';
      try{
        await rtRequestLivery(btn.dataset.liveryRequest);
        btn.textContent = 'Sent! Check your Inbox';
      }catch(e){
        btn.disabled = false; btn.textContent = original;
        alert('Could not send: ' + e.message);
      }
    }));
    document.querySelectorAll('[data-livery-delete]').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('Delete this livery? This removes the file too.')) return;
      try{ await rtDeleteLivery(btn.dataset.liveryDelete); await renderLiveriesBody(); }
      catch(e){ alert('Could not delete: ' + e.message); }
    }));
  }

  function setupTeamServer(){
    // ============================================================
    // Team Server — Driver Rankings. Reads ONLY data/raceteam-manifest.json
    // (the console-raceteam server's own isolated manifest, deliberately
    // separate from data/manifest.json) and computes best-to-worst lap
    // time, consistency and race risk per driver. Every formula below is
    // copied verbatim from ifwl-stats-engine.js - same numbers, same
    // meaning as everywhere else on the site, just scoped to this one
    // server's own data instead of the shared platform-wide manifest.
    // ============================================================
    function tsIsValidLap(ms){ return Number.isFinite(Number(ms)) && ms > 0 && ms < 600000; }
    function tsMedian(values){
      const arr = values.filter(v => tsIsValidLap(v)).sort((a,b) => a-b);
      if(!arr.length) return 0;
      const mid = Math.floor(arr.length/2);
      return arr.length % 2 ? arr[mid] : (arr[mid-1] + arr[mid]) / 2;
    }
    function tsDriverName(line){
      const d = line.currentDriver || (line.car && line.car.drivers && line.car.drivers[0]) || {};
      return `${d.firstName || ''} ${d.lastName || ''}`.replace(/\s+/g,' ').trim() || d.shortName || 'Unknown Driver';
    }
    function tsLapKey(carId, driverIndex){ return `${carId}|${driverIndex ?? 0}`; }
    function tsFileTimestamp(name){
      const clean = String(name || '').split('/').pop();
      const match = clean.match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/);
      if(!match) return 0;
      const [,yy,mm,dd,hh,mi,ss] = match;
      return Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
    }
    function tsRtAvg(values){
      const list = values.filter(Number.isFinite);
      return list.length ? list.reduce((a,b) => a+b, 0) / list.length : NaN;
    }
    function tsRiskLabel(value){
      if(!Number.isFinite(value)) return '-';
      if(value <= 15) return 'Low';
      if(value <= 35) return 'Mild';
      if(value <= 60) return 'Medium';
      return 'High';
    }
    // Identical to livetimings.html's lapStats / the IFWL Consistency Index.
    function tsLapStats(values){
      const ordered = values.filter(v => tsIsValidLap(v));
      const withoutFirst = ordered.length > 4 ? ordered.slice(1) : ordered;
      if(withoutFirst.length < 2){
        const laps = ordered.sort((a,b) => a-b);
        return { count: laps.length, best: laps[0] || 0, avg: laps[0] || 0, consistency: NaN };
      }
      const med = tsMedian(withoutFirst);
      const deviations = withoutFirst.map(v => Math.abs(v - med));
      const mad = tsMedian(deviations) || 1;
      const modifiedZ = v => (0.6745 * (v - med)) / mad;
      const clean = withoutFirst.filter(v => Math.abs(modifiedZ(v)) <= 3.5);
      const finalLaps = clean.length >= 2 ? clean : withoutFirst;
      const sorted = [...finalLaps].sort((a,b) => a-b);
      const best = sorted[0];
      const avg = finalLaps.reduce((a,b)=>a+b,0) / finalLaps.length;
      const variance = finalLaps.reduce((sum,v) => sum + Math.pow(v - avg, 2), 0) / finalLaps.length;
      const stdDev = Math.sqrt(variance);
      const cov = avg ? (stdDev / avg) * 100 : 0;
      const consistency = Math.max(0, Math.min(100, 100 - (cov * 6)));
      return { count: finalLaps.length, best, avg, consistency };
    }
    // Identical to livetimings.html's raceRiskForRow.
    function tsRaceRisk(row){
      const lapObjects = row.lapObjects || [];
      const cleanLaps = lapObjects.filter(l => l.isValidForBest !== false && tsIsValidLap(l.laptime)).map(l => l.laptime);
      const invalidLapObjects = lapObjects.filter(l => l.isValidForBest === false);
      const totalRecorded = lapObjects.length;
      let score = 0;
      const cleanMedian = cleanLaps.length ? tsMedian(cleanLaps) : 0;
      const pitLikelyCount = invalidLapObjects.filter(l => cleanMedian && tsIsValidLap(l.laptime) && l.laptime > cleanMedian * 1.15).length;
      const genuineInvalidCount = invalidLapObjects.length - pitLikelyCount;
      if(totalRecorded > 0 && genuineInvalidCount > 0){
        score += Math.min(35, (genuineInvalidCount / totalRecorded) * 70);
      }
      if(Number.isFinite(row.consistencyStats?.consistency)){
        score += Math.min(35, Math.max(0, 100 - row.consistencyStats.consistency) * 0.8);
      }
      if(cleanLaps.length >= 3){
        const med = tsMedian(cleanLaps);
        const spikes = cleanLaps.filter(v => med && v > med * 1.10).length;
        if(spikes) score += Math.min(25, spikes * 8);
      }
      const risk = Math.max(0, Math.min(100, score));
      return { risk, label: tsRiskLabel(risk) };
    }
    function tsLapMapForSession(data){
      const map = new Map();
      const laps = Array.isArray(data.laps) ? data.laps : [];
      for(const lap of laps){
        if(!lap) continue;
        const laptime = Number(lap.laptime);
        if(!tsIsValidLap(laptime)) continue;
        const key = tsLapKey(lap.carId, lap.driverIndex);
        // bestSplits tracks this driver's best S1/S2/S3 (ms) *within this one
        // session file* — used to build the cross-driver sector comparison
        // graphs and "who's best at what sector" call-outs on the Team
        // Server Stats tab. Only counts laps flagged valid-for-best, same
        // rule ACC itself uses for a driver's official best sector.
        if(!map.has(key)) map.set(key, { validLaps: [], lapObjects: [], bestSplits: [null, null, null] });
        const item = map.get(key);
        const isValidForBest = lap.isValidForBest !== false;
        if(isValidForBest) item.validLaps.push(laptime);
        const splits = Array.isArray(lap.splits) ? lap.splits.map(Number) : [];
        item.lapObjects.push({ laptime, isValidForBest, splits });
        if(isValidForBest){
          splits.forEach((v, idx) => {
            if(idx < 3 && tsIsValidLap(v) && (!item.bestSplits[idx] || v < item.bestSplits[idx])) item.bestSplits[idx] = v;
          });
        }
      }
      return map;
    }
    function tsNormaliseSession(data, source){
      const lines = (data.sessionResult && data.sessionResult.leaderBoardLines) || [];
      const sessionLapMap = tsLapMapForSession(data);
      const rows = lines.filter(l => !l.bIsSpectator).map((l) => {
        const lm = sessionLapMap.get(tsLapKey(l.car?.carId, l.currentDriverIndex)) || { validLaps: [], lapObjects: [], bestSplits: [null, null, null] };
        return {
          source, track: data.trackName || data.metaData || 'unknown',
          driver: tsDriverName(l),
          bestLap: l.timing?.bestLap || 0,
          lapObjects: lm.lapObjects,
          allLapTimes: lm.lapObjects.map(o => o.laptime),
          bestRaceSplits: lm.bestSplits,
          consistencyStats: tsLapStats(lm.validLaps)
        };
      });
      return rows;
    }
    function tsFmtLapTime(ms){
      if(!tsIsValidLap(ms)) return '—';
      const totalSeconds = ms / 1000;
      const m = Math.floor(totalSeconds / 60);
      const s = (totalSeconds - m * 60).toFixed(3).padStart(6, '0');
      return `${m}:${s}`;
    }

    let teamServerDrivers = [];
    let teamServerSortKey = 'consistency';
    let teamServerSortDir = 'desc';

    async function loadTeamServerRankings(){
      const hint = q('teamServerHint');
      const wrap = q('teamServerTableWrap');
      hint.textContent = 'Loading…';
      wrap.innerHTML = '';

      let manifest;
      try{
        const res = await fetch('data/raceteam-manifest.json?v=' + Date.now(), { cache: 'no-store' });
        if(!res.ok) throw new Error('HTTP ' + res.status);
        manifest = await res.json();
      }catch(e){
        hint.textContent = 'Could not load Team Server data — the sync workflow may not have run yet, or this team is not on the Console Race Team server.';
        return;
      }

      const files = Array.isArray(manifest.results) ? manifest.results : [];
      if(!files.length){
        hint.textContent = 'No sessions recorded on the Team Server yet.';
        return;
      }

      // ✅ FIXED: every failure in this loop used to be silently swallowed -
      // "5 files, 0 drivers" gave no clue whether files failed to fetch, or
      // fetched fine but produced no usable driver rows (e.g. this host's
      // JSON export shape differing slightly from what this parser was
      // built against). Now tracked and surfaced so the actual cause is
      // visible instead of a dead end.
      let fetchFailures = 0;
      let filesWithNoDriverRows = 0;
      const driverMap = new Map(); // driverNameKey -> { name, rows: [] }

      for(const item of files){
        let data;
        try{
          const res = await fetch(item.file + '?v=' + Date.now(), { cache: 'no-store' });
          if(!res.ok){ fetchFailures++; console.warn('Team Server: fetch failed for', item.file, 'HTTP', res.status); continue; }
          data = await res.json();
        }catch(e){ fetchFailures++; console.warn('Team Server: fetch/parse failed for', item.file, e); continue; }

        const rows = tsNormaliseSession(data, item.file);
        if(!rows.length){
          filesWithNoDriverRows++;
          console.warn('Team Server: no leaderboard rows found in', item.file, '- raw session keys:', Object.keys(data || {}));
        }
        for(const row of rows){
          if(!row.driver || row.driver === 'Unknown Driver') continue;
          const key = row.driver.trim().toLowerCase();
          if(!driverMap.has(key)) driverMap.set(key, { name: row.driver, rows: [] });
          driverMap.get(key).rows.push(row);
        }
      }

      teamServerDrivers = [...driverMap.values()].map(d => {
        const bestLap = Math.min(...d.rows.map(r => tsIsValidLap(r.bestLap) ? r.bestLap : Infinity).filter(Number.isFinite));
        const avgConsistency = tsRtAvg(d.rows.map(r => r.consistencyStats?.consistency));
        const avgLap = tsRtAvg(d.rows.map(r => r.consistencyStats?.avg).filter(tsIsValidLap));
        const avgRisk = tsRtAvg(d.rows.map(r => tsRaceRisk(r).risk));
        // bestSplits = this driver's best S1/S2/S3 across every session file
        // on the server (element-wise min), and allLapTimes = every valid
        // lap they've set anywhere on the server, concatenated. Both feed
        // the sector/lap-trace comparison graphs below the rankings table.
        const bestSplits = tsCombineBestSplits(d.rows);
        const allLapTimes = d.rows.flatMap(r => (r.allLapTimes || []).filter(tsIsValidLap));
        return {
          name: d.name,
          sessions: d.rows.length,
          bestLap: Number.isFinite(bestLap) ? bestLap : 0,
          avgLap: Number.isFinite(avgLap) ? avgLap : 0,
          consistency: Number.isFinite(avgConsistency) ? avgConsistency : 0,
          risk: Number.isFinite(avgRisk) ? avgRisk : 0,
          bestSplits,
          allLapTimes
        };
      }).filter(d => d.bestLap > 0);

      hint.textContent = teamServerDrivers.length
        ? `${teamServerDrivers.length} driver(s) across ${files.length} session file(s) on the Team Server. Sort by clicking a column.`
        : `Found ${files.length} session file(s), but no usable driver data came out of them` +
          (fetchFailures ? ` — ${fetchFailures} file(s) failed to fetch/parse` : '') +
          (filesWithNoDriverRows ? ` — ${filesWithNoDriverRows} file(s) had no leaderboard rows` : '') +
          `. Check the browser console (F12) for exactly which files and why.`;
      renderTeamServerTable();

      const chartsPanel = q('teamServerChartsPanel');
      if(chartsPanel) chartsPanel.style.display = teamServerDrivers.length ? '' : 'none';
      if(teamServerDrivers.length){ populateTsHighlightSelect(); renderTeamServerChartsBody(); }
    }

    function renderTeamServerTable(){
      const wrap = q('teamServerTableWrap');
      if(!teamServerDrivers.length){ wrap.innerHTML = '<div class="empty">No lap data yet.</div>'; return; }

      const sorted = teamServerDrivers.slice().sort((a,b) => {
        const dir = teamServerSortDir === 'asc' ? 1 : -1;
        return (a[teamServerSortKey] - b[teamServerSortKey]) * dir;
      });

      const cols = [
        { key: 'name', label: 'Driver', sortable: false },
        { key: 'bestLap', label: 'Best Lap', sortable: true },
        { key: 'avgLap', label: 'Avg Lap', sortable: true },
        { key: 'consistency', label: 'Consistency', sortable: true },
        { key: 'risk', label: 'Race Risk', sortable: true },
        { key: 'sessions', label: 'Sessions', sortable: true }
      ];

      wrap.innerHTML = `
        <table class="results-table">
          <thead><tr>
            ${cols.map(c => `<th class="${c.sortable ? 'sortable' : ''} ${teamServerSortKey === c.key ? 'active' : ''}" data-sort-key="${c.key}">${c.label}${c.sortable ? `<span class="sort-arrow">${teamServerSortKey === c.key ? (teamServerSortDir === 'asc' ? '↑' : '↓') : '↕'}</span>` : ''}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${sorted.map(d => `
              <tr>
                <td style="font-family:var(--font-body);font-weight:700;">${esc(d.name)}</td>
                <td>${tsFmtLapTime(d.bestLap)}</td>
                <td>${tsFmtLapTime(d.avgLap)}</td>
                <td>${d.consistency ? d.consistency.toFixed(1) + '%' : '—'}</td>
                <td><span class="risk-pill ${tsRiskLabel(d.risk).toLowerCase()}">${tsRiskLabel(d.risk)} (${d.risk.toFixed(0)})</span></td>
                <td>${d.sessions}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      wrap.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.dataset.sortKey;
          if(teamServerSortKey === key){ teamServerSortDir = teamServerSortDir === 'asc' ? 'desc' : 'asc'; }
          else{ teamServerSortKey = key; teamServerSortDir = (key === 'risk') ? 'asc' : 'desc'; } // low risk = good, so default risk sort is ascending
          renderTeamServerTable();
        });
      });
    }

    // ------------------------------------------------------------
    // Driver Comparison Graphs — sector times + lap-time trace across
    // every Team Server driver, ported from the "detailed" per-driver
    // charts on the Live Timings page (same hand-built inline-SVG
    // approach, no charting library) but reworked to plot every driver
    // side by side instead of one driver vs. the field. This is what
    // answers "who's best to place on the team, and at what" straight
    // from the same server stats the rankings table already loads.
    // ------------------------------------------------------------
    const TS_PALETTE = ['#1fd6bd','#c65be8','#ffb238','#5aa9ff','#ff5464','#9be564','#ff9f4a','#7d8ff0','#33d99b','#e884d0','#ffd166','#8ecae6'];
    let tsHighlightName = '';

    function tsSvgText(x, y, text, size, weight, anchor){
      return `<text x="${x}" y="${y}" font-size="${size||11}" font-weight="${weight||700}" text-anchor="${anchor||'start'}" fill="#dfe8ea">${esc(text)}</text>`;
    }
    function tsShortName(name){
      const parts = String(name || '').trim().split(/\s+/);
      if(parts.length <= 1) return name || '';
      return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
    }
    function tsIsHighlighted(name){
      return !!(tsHighlightName && name && name.toLowerCase() === tsHighlightName.toLowerCase());
    }
    function tsCombineBestSplits(rows){
      const out = [null, null, null];
      rows.forEach(r => {
        (r.bestRaceSplits || []).forEach((v, i) => {
          if(i < 3 && tsIsValidLap(v) && (!out[i] || v < out[i])) out[i] = v;
        });
      });
      return out;
    }

    function renderTeamSectorLeaders(drivers){
      const withSplits = drivers.filter(d => Array.isArray(d.bestSplits) && d.bestSplits.some(tsIsValidLap));
      const leaderFor = idx => withSplits.reduce((best, d) => {
        const v = d.bestSplits[idx];
        return tsIsValidLap(v) && (!best || v < best.v) ? { name: d.name, v } : best;
      }, null);
      const bestLapDriver = drivers.reduce((best, d) => tsIsValidLap(d.bestLap) && (!best || d.bestLap < best.bestLap) ? d : best, null);

      const cards = [
        { label: 'Best Sector 1', d: leaderFor(0) },
        { label: 'Best Sector 2', d: leaderFor(1) },
        { label: 'Best Sector 3', d: leaderFor(2) },
        { label: 'Best Outright Lap', d: bestLapDriver ? { name: bestLapDriver.name, v: bestLapDriver.bestLap } : null }
      ];

      return `<div class="ts-leader-grid">${cards.map(c => `
        <div class="ts-leader-card${c.d && tsIsHighlighted(c.d.name) ? ' highlighted' : ''}">
          <span>${esc(c.label)}</span>
          <strong>${c.d ? esc(c.d.name) : '—'}</strong>
          <small>${c.d ? tsFmtLapTime(c.d.v) : 'No data yet'}</small>
        </div>`).join('')}</div>`;
    }

    function renderTeamSectorChart(drivers, sectorIndex, label){
      const rows = drivers
        .filter(d => Array.isArray(d.bestSplits) && tsIsValidLap(d.bestSplits[sectorIndex]))
        .sort((a, b) => a.bestSplits[sectorIndex] - b.bestSplits[sectorIndex])
        .slice(0, 20);

      if(!rows.length){
        return `<div class="ts-chart-wrap"><p class="ts-chart-title">${esc(label)}</p><p class="ts-chart-help">No sector data recorded for this server yet — the session files may not export sector splits.</p></div>`;
      }

      const best = rows[0].bestSplits[sectorIndex];
      const worst = rows[rows.length - 1].bestSplits[sectorIndex];
      const range = Math.max(1, worst - best);
      const w = 340, h = 190, left = 8, right = 8, top = 12, bottom = 12;
      const plotW = w - left - right, plotH = h - top - bottom;
      const barGap = 3;
      const barW = Math.max(6, plotW / rows.length - barGap);

      const bars = rows.map((d, idx) => {
        const v = d.bestSplits[sectorIndex];
        const norm = 1 - Math.min(1, Math.max(0, (v - best) / range));
        const bh = Math.max(4, 10 + norm * (plotH - 10));
        const x = left + idx * (plotW / rows.length);
        const y = top + plotH - bh;
        const isHighlighted = tsIsHighlighted(d.name);
        const fill = isHighlighted ? '#ffffff' : (idx === 0 ? '#ffb238' : TS_PALETTE[idx % TS_PALETTE.length]);
        const stroke = isHighlighted ? ' stroke="#ffb238" stroke-width="2"' : '';
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${fill}"${stroke}><title>${esc(d.name)} — ${tsFmtLapTime(v)}</title></rect>`;
      }).join('');

      const top5 = rows.slice(0, 5).map((d, idx) => `
        <div class="ts-rank-row${tsIsHighlighted(d.name) ? ' highlighted' : ''}">
          <span class="ts-rank-name">${idx+1}. ${esc(d.name)}</span>
          <span class="ts-rank-time">${tsFmtLapTime(d.bestSplits[sectorIndex])}</span>
        </div>`).join('');

      return `<div class="ts-chart-wrap">
        <p class="ts-chart-title">${esc(label)} — best times</p>
        <p class="ts-chart-help">${rows.length} driver(s) with recorded ${esc(label)} data, fastest on the left. Hover a bar for the exact time.</p>
        <svg class="ts-svg-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)} comparison">${bars}</svg>
        <div class="ts-rank-list">${top5}</div>
      </div>`;
    }

    function renderTeamLapTraceChart(drivers){
      const ranked = drivers
        .filter(d => Array.isArray(d.allLapTimes) && d.allLapTimes.length >= 2)
        .sort((a, b) => (tsIsValidLap(a.bestLap) ? a.bestLap : Infinity) - (tsIsValidLap(b.bestLap) ? b.bestLap : Infinity))
        .slice(0, 12);

      const highlighted = drivers.find(d => tsIsHighlighted(d.name) && Array.isArray(d.allLapTimes) && d.allLapTimes.length >= 2);
      let plotRows = ranked;
      if(highlighted && !plotRows.includes(highlighted)) plotRows = plotRows.slice(0, 11).concat(highlighted);

      if(!plotRows.length){
        return `<div class="ts-chart-wrap ts-chart-wide"><p class="ts-chart-title">Lap-time trace</p><p class="ts-chart-help">No lap-by-lap data available yet.</p></div>`;
      }

      const allTimes = plotRows.flatMap(d => d.allLapTimes.filter(tsIsValidLap));
      const minTime = Math.min(...allTimes);
      const maxTime = Math.max(...allTimes);
      const maxLaps = Math.max(...plotRows.map(d => d.allLapTimes.length));
      const w = 1000, h = 320, left = 70, right = 25, top = 28, bottom = 42;
      const plotW = w - left - right, plotH = h - top - bottom;
      const range = Math.max(1, maxTime - minTime);
      const yFor = v => top + plotH - ((v - minTime) / range) * plotH;
      const xFor = lap => left + ((lap - 1) / Math.max(1, maxLaps - 1)) * plotW;

      const grid = [0, .25, .5, .75, 1].map(p => {
        const y = top + p * plotH;
        const val = maxTime - p * range;
        return `<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>${tsSvgText(8, y+4, tsFmtLapTime(val), 10, 700)}`;
      }).join('');

      const orderedRows = highlighted ? [...plotRows.filter(d => d !== highlighted), highlighted] : plotRows;
      const lines = orderedRows.map(d => {
        const originalIdx = plotRows.indexOf(d);
        const isHighlighted = d === highlighted;
        const pts = d.allLapTimes.map((v, i) => tsIsValidLap(v) ? `${xFor(i+1).toFixed(1)},${yFor(v).toFixed(1)}` : null).filter(Boolean).join(' ');
        const colour = isHighlighted ? '#ffffff' : TS_PALETTE[originalIdx % TS_PALETTE.length];
        const width = isHighlighted ? 5 : 2.5;
        const opacity = highlighted ? (isHighlighted ? 1 : .25) : .85;
        return `<polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="${width}" opacity="${opacity}"><title>${esc(d.name)}</title></polyline>`;
      }).join('');

      const legendRows = highlighted ? [highlighted, ...plotRows.filter(d => d !== highlighted)].slice(0, 8) : plotRows.slice(0, 8);
      const labels = legendRows.map((d, idx) => {
        const y = 18 + idx * 17;
        const isHighlighted = d === highlighted;
        const paletteIdx = plotRows.indexOf(d);
        return `<circle cx="${left + 8 + idx*115}" cy="${y-4}" r="5" fill="${isHighlighted ? '#ffffff' : TS_PALETTE[paletteIdx % TS_PALETTE.length]}"/>${tsSvgText(left + 18 + idx*115, y, tsShortName(d.name) + (isHighlighted ? ' (selected)' : ''), 10, 900)}`;
      }).join('');

      const axis = `<line x1="${left}" y1="${top}" x2="${left}" y2="${h-bottom}" stroke="rgba(255,255,255,.32)" stroke-width="2"/>
        <line x1="${left}" y1="${h-bottom}" x2="${w-right}" y2="${h-bottom}" stroke="rgba(255,255,255,.32)" stroke-width="2"/>
        ${tsSvgText(left, h-12, 'Lap 1', 11, 900)}
        ${tsSvgText(w-right, h-12, 'Lap '+maxLaps, 11, 900, 'end')}`;

      return `<div class="ts-chart-wrap ts-chart-wide">
        <p class="ts-chart-title">Lap-time trace</p>
        <p class="ts-chart-help">Every recorded lap for the ${plotRows.length} drivers with the best outright pace here (top 12), laid end-to-end across all their sessions on this server.${highlighted ? ` ${esc(highlighted.name)} is highlighted in white.` : ''} This isn't one single race — it's a pace and consistency comparison across everything they've driven on this server.</p>
        <svg class="ts-svg-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Team lap time trace">
          ${grid}${axis}${lines}${labels}
        </svg>
      </div>`;
    }

    function populateTsHighlightSelect(){
      const select = q('tsHighlightSelect');
      if(!select) return;
      const current = select.value;
      select.innerHTML = '<option value="">None</option>' + teamServerDrivers
        .slice().sort((a, b) => a.name.localeCompare(b.name))
        .map(d => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
      select.value = teamServerDrivers.some(d => d.name === current) ? current : '';
      tsHighlightName = select.value;
      select.onchange = () => { tsHighlightName = select.value; renderTeamServerChartsBody(); };
    }

    function renderTeamServerChartsBody(){
      const leaders = q('tsLeaders'), sectors = q('tsSectorCharts'), trace = q('tsLapTrace');
      if(leaders) leaders.innerHTML = renderTeamSectorLeaders(teamServerDrivers);
      if(sectors) sectors.innerHTML = [0, 1, 2].map(i => renderTeamSectorChart(teamServerDrivers, i, `Sector ${i+1}`)).join('');
      if(trace) trace.innerHTML = renderTeamLapTraceChart(teamServerDrivers);
    }
    return loadTeamServerRankings;
  }


  /* ============================================================
     NEW IN THE LICENCE CENTRE VERSION
     Page shell, standard vs full teams, managers, Build a team,
     All teams, and the Discord draft image. Everything above this
     line is the old My Race Team code, carried over as it was.
     ============================================================ */
  var tp = { teamId: null, ownTeamId: null, mine: null, detail: null, tier: 'full', perms: {}, tab: '', staffView: false, tsLoad: null, tsReady: false };
  function isOpsPlus(){ return !!(window.IFWL_REAL_OPS_PLUS || window.IFWL_OPS_PLUS); }
  function isOwnerRole(){ return !!(window.IFWL_REAL_OWNER || window.IFWL_OWNER); }
  function myId(){ return String(window.IFWL_AUTH && window.IFWL_AUTH.userId ? window.IFWL_AUTH.userId(window.IFWL_META) : ''); }
  function enc(s){ return encodeURIComponent(s); }
  var tpToastTimer = null;
  function toast(msg, bad){
    var t = document.querySelector('.tp-toast'); if(t) t.remove();
    t = document.createElement('div'); t.className = 'tp-toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(tpToastTimer); tpToastTimer = setTimeout(function(){ t.remove(); }, bad ? 6500 : 3800);
  }
  function errText(e){ return (e && e.message) ? e.message : 'Something went wrong. Please try again.'; }
  function initials(name){
    var p = String(name || '?').replace(/\[[^\]]*\]\s*-?\s*/g, '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  /* licence names look like "[ 7 ] - Name": show just the name where we can */
  function plainName(n){ return String(n || '').replace(/^\s*\[[^\]]*\]\s*-?\s*/, '').trim() || String(n || ''); }

  /* ---------------------------------------------------------------- shell */
  var VIEWS = [
    ['apply', 'Race Teams'], ['roster', 'Roster & Branding'], ['scouting', 'Team Server Stats'], ['events', 'Events & Stints'],
    ['claim', 'Claim Your Stints'], ['liveries', 'Liveries'], ['auditLog', 'Audit Log'], ['teams', 'All teams'], ['build', 'Build a team']
  ];
  function mount(){
    var root = q('teamRoot'); if(!root) return false;
    root.innerHTML =
      '<div id="tpBanner" class="hidden"></div>' +
      '<div id="tpHead" class="hidden"></div>' +
      '<div class="team-tabs" id="teamTabs" role="tablist"></div>' +
      '<div class="team-view" data-team-view="apply"><section class="panel" id="rtApplyPanel"><div class="panel-head"><div><h3>Race Teams</h3><small>Start a team, or ask to join one that is already active</small></div></div><div class="panel-body"><div id="rtStatusBody"><div class="empty">Loading&hellip;</div></div></div></section></div>' +
      '<div class="team-view" data-team-view="roster"><section class="panel"><div class="panel-head"><div><h3 id="rosterHeading">Roster &amp; Branding</h3><small id="rosterSub">Your team, its roster and join requests</small></div></div><div class="panel-body"><div id="mrtBody"><div class="empty">Loading&hellip;</div></div></div></section></div>' +
      '<div class="team-view" data-team-view="scouting">' +
        '<section class="panel"><div class="panel-head"><div><h3>Team Server &mdash; Driver Rankings</h3><small>Every driver who has set a lap on the IFWL teams server.</small></div></div><div class="panel-body"><div id="teamServerHint" class="field-hint" style="margin-bottom:12px;">Loading&hellip;</div><div class="table-wrap" id="teamServerTableWrap"></div></div></section>' +
        '<section class="panel" id="teamServerChartsPanel" style="display:none"><div class="panel-head"><div><h3>Driver Comparison Graphs</h3><small>Sector times and lap-time trace across every driver &mdash; see who is strongest, and where, before deciding who to place.</small></div></div><div class="panel-body">' +
          '<div class="ts-highlight-row"><label for="tsHighlightSelect">Highlight a driver</label><select id="tsHighlightSelect"><option value="">None</option></select></div>' +
          '<div id="tsLeaders"></div><div class="ts-chart-grid" id="tsSectorCharts"></div><div id="tsLapTrace"></div>' +
          '<div class="ts-disclaimer">These graphs combine sectors and laps across every recorded session on the Team Server (different tracks and conditions included), so treat them as a general form and pace comparison rather than a like-for-like result.</div>' +
        '</div></section></div>' +
      '<div class="team-view" data-team-view="events"><section class="panel"><div class="panel-head"><div><h3>Events &amp; Stints</h3><small id="eventsSubhead">Set up an event, see availability, allocate stints</small></div></div><div class="panel-body"><div id="eventsBody"><div class="empty">Loading&hellip;</div></div></div></section></div>' +
      '<div class="team-view" data-team-view="claim"><section class="panel"><div class="panel-head"><div><h3>Claim Your Stints</h3><small>Mark which stints you are free for, and respond to finalised plans</small></div></div><div class="panel-body"><div id="claimBody"><div class="empty">Loading&hellip;</div></div></div></section></div>' +
      '<div class="team-view" data-team-view="liveries"><section class="panel"><div class="panel-head"><div><h3>IFWL Racing Team Liveries</h3><small>Browse and request a livery for your inbox, or add one with the upload password</small></div></div><div class="panel-body"><div id="liveriesBody"><div class="empty">Loading&hellip;</div></div></div></section></div>' +
      '<div class="team-view" data-team-view="auditLog"><section class="panel"><div class="panel-head"><div><h3>Audit Log</h3><small>Every event created, edited, finalised or deleted for this team, and who did it</small></div></div><div class="panel-body"><div id="auditLogBody"><div class="empty">Loading&hellip;</div></div></div></section></div>' +
      '<div class="team-view" data-team-view="teams"><section class="panel"><div class="panel-head"><div><h3>All teams</h3><small>Applications, every active team, and the full hub switch</small></div></div><div class="panel-body"><div id="tpTeams"><div class="empty">Loading&hellip;</div></div></div></section></div>' +
      '<div class="team-view" data-team-view="build"><section class="panel"><div class="panel-head"><div><h3>Build a team</h3><small>Name a team, choose its owner, managers and drivers &mdash; they are placed straight away</small></div></div><div class="panel-body"><div id="tpBuild"></div></div></section></div>';
    return true;
  }

  function tabsNow(){
    var t = [];
    if(!tp.teamId) t.push('apply');
    else {
      t.push('roster');
      if(tp.tier === 'full'){
        t.push('scouting', 'events', 'claim', 'liveries');
        if(tp.perms && tp.perms.canManageEvents) t.push('auditLog');
      }
    }
    if(isOpsPlus()) t.push('teams', 'build');
    return t;
  }
  function viewLabel(id){
    if(id === 'roster') return (tp.perms && (tp.perms.canAppointManagers || tp.perms.canHandleRequests)) ? 'Roster & Branding' : 'My Race Team';
    var v = VIEWS.filter(function(x){ return x[0] === id; })[0]; return v ? v[1] : id;
  }
  function renderTabs(){
    var list = tabsNow();
    if(list.indexOf(tp.tab) < 0) tp.tab = list[0];
    q('teamTabs').innerHTML = list.map(function(id){
      return '<button class="team-tab' + (id === tp.tab ? ' active' : '') + '" role="tab" data-team-view="' + id + '" type="button">' + esc(viewLabel(id)) + '</button>';
    }).join('');
    document.querySelectorAll('#teamRoot .team-view').forEach(function(v){ v.classList.toggle('active', v.getAttribute('data-team-view') === tp.tab); });
    q('teamTabs').querySelectorAll('.team-tab').forEach(function(b){ b.addEventListener('click', function(){ showTab(b.getAttribute('data-team-view')); }); });
  }
  function showTab(id){
    tp.tab = id; renderTabs();
    if(id === 'scouting' && !tp.tsReady && tp.tsLoad){ tp.tsReady = true; tp.tsLoad(); }
    if(id === 'teams') renderAllTeams();
    if(id === 'build') renderBuild();
    if(id === 'apply') initApplyPanel(tp.mine || {});
    try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(_){}
  }
  window.switchTeamView = showTab;

  function renderHead(){
    var box = q('tpHead'); if(!box) return;
    var d = tp.detail; if(!d || !d.team){ box.classList.add('hidden'); return; }
    var t = d.team, role = d.isOwner ? 'Owner' : d.isManager ? 'Manager' : d.isMember ? 'Member' : 'Staff';
    var count = (t.pcRoster || []).length + (t.consoleRoster || []).length + (t.ownerId ? 1 : 0);
    box.classList.remove('hidden');
    box.innerHTML = '<div class="tp-head">' +
      '<div class="tp-logo">' + (t.logoUrl ? '<img src="' + esc(t.logoUrl) + '" alt="">' : '<span>' + esc(initials(t.teamName)) + '</span>') + '</div>' +
      '<div class="tp-head-main"><h2>' + esc(t.teamName || 'Your team') + '</h2>' +
      '<div class="tp-chips"><span class="tp-chip ' + (tp.tier === 'full' ? 'full' : 'std') + '">' + (tp.tier === 'full' ? 'Full team' : 'Standard team') + '</span>' +
      '<span class="tp-chip role">' + role + '</span>' +
      '<span class="tp-chip">' + count + ' driver' + (count === 1 ? '' : 's') + '</span>' +
      (t.status === 'pending' ? '<span class="tp-chip warn">Awaiting approval</span>' : '') + '</div></div></div>';
  }
  function renderBanner(){
    var b = q('tpBanner'); if(!b) return;
    if(tp.staffView && tp.teamId){
      b.classList.remove('hidden');
      b.innerHTML = '<div class="notice-card tp-staffbar">You are working on <strong>' + esc(currentTeamName) + '</strong> as staff. <button class="btn ghost" id="tpBackBtn" type="button">Back to my own view</button></div>';
      q('tpBackBtn').addEventListener('click', function(){ tp.staffView = false; boot(true); });
    } else { b.classList.add('hidden'); b.innerHTML = ''; }
  }

  /* ---------------------------------------------------------------- load a team */
  function computeNames(d){
    var t = d.team, nm = d.nameMap || {};
    var ids = (t.pcRoster || []).concat(t.consoleRoster || []);
    var raw = ids.map(function(id){ return nm[id] || id; });
    if(t.ownerName) raw.unshift(t.ownerName);
    currentRosterNames = Array.from(new Set(raw));
  }
  async function loadTeam(teamId){
    var d = await apiGet('raceTeamDetail', '&teamId=' + enc(teamId));
    tp.teamId = teamId; currentTeamId = teamId; tp.detail = d;
    tp.tier = d.tier || (d.team && d.team.tier) || 'full'; tp.perms = d.perms || {};
    currentTeamName = (d.team && d.team.teamName) || '';
    currentIsOwner = !!tp.perms.canManageEvents;      /* the old code's "owner" switch now means: can run events (owner, manager or staff) */
    computeNames(d);
    var me = myId(), nm = d.nameMap || {}, saved = '';
    try{ saved = localStorage.getItem('IFWL_MY_RACE_TEAM_DRIVER_NAME') || ''; }catch(_){}
    myDriverName = '';
    if(currentRosterNames.some(function(n){ return driverNameKey(n) === driverNameKey(saved); })) myDriverName = saved;
    else if(d.team.ownerId === me && d.team.ownerName) myDriverName = d.team.ownerName;
    else if(nm[me] && currentRosterNames.indexOf(nm[me]) >= 0) myDriverName = nm[me];
    return d;
  }

  async function renderTeamPanels(){
    renderHead(); renderBanner(); renderTabs();
    await renderRoster(q('mrtBody'));
    if(tp.tier === 'full' && tp.detail.team.status === 'active'){
      q('rosterSub').textContent = tp.perms.canAppointManagers ? 'Details, managers, join requests and roster' : tp.perms.canHandleRequests ? 'Join requests and roster' : 'Your team and its roster';
      tp.tsReady = false;
      await initEventsPanel();
      renderLiveriesBody();
      if(currentIsOwner) renderAuditLog();
    }
  }

  /* Pop-up / DM link: licence-teams.html?event=<id> opens Claim Your Stints on that event */
  function focusEvent(eventId){
    if(!eventId || tp.tab === undefined) return false;
    if(tabsNow().indexOf('claim') < 0) return false;
    showTab('claim');
    const sel = '[data-claim-event-id="' + (window.CSS && CSS.escape ? CSS.escape(eventId) : eventId) + '"]';
    setTimeout(function(){
      const el = document.querySelector(sel);
      if(!el) return;
      try{ el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }catch(_){}
      el.classList.add('rt-flash'); setTimeout(function(){ el.classList.remove('rt-flash'); }, 2600);
    }, 120);
    return true;
  }
  window.rtFocusEvent = focusEvent;
  function consumeEventParam(){
    let id = '';
    try{ id = new URLSearchParams(location.search).get('event') || ''; }catch(_){}
    if(!id) return;
    if(focusEvent(id)){ try{ const u = new URL(location.href); u.searchParams.delete('event'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }catch(_){} }
  }

  async function boot(force){
    if(!mount.done){ if(!mount()) return; mount.done = true; }
    var mine;
    try{ mine = await apiGet('myRaceTeamId'); }
    catch(e){ if(tp.tab !== 'apply'){} q('rtStatusBody').innerHTML = '<div class="empty">Could not load: ' + esc(errText(e)) + '</div>'; tp.teamId = null; renderTabs(); return; }
    tp.mine = mine; tp.ownTeamId = mine.teamId || null;
    if(!tp.staffView){
      if(!mine.teamId){ tp.teamId = null; tp.detail = null; tp.tier = 'full'; tp.perms = {}; renderHead(); renderBanner(); tp.tab = 'apply'; renderTabs(); await initApplyPanel(mine); return; }
      try{ await loadTeam(mine.teamId); }
      catch(e){ q('mrtBody').innerHTML = '<div class="empty">Could not load team: ' + esc(errText(e)) + '</div>'; tp.teamId = mine.teamId; renderTabs(); return; }
    }
    if(force !== 'keep') tp.tab = 'roster';
    await renderTeamPanels();
    renderTabs();
    if(!tp.staffView) consumeEventParam();
  }
  async function openTeamAsStaff(teamId){
    try{ await loadTeam(teamId); }catch(e){ toast(errText(e), true); return; }
    tp.staffView = true; tp.tab = 'roster'; await renderTeamPanels(); renderTabs();
    try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(_){}
  }
  async function refreshTeam(){
    if(!tp.teamId) return;
    try{ await loadTeam(tp.teamId); }catch(e){ toast(errText(e), true); return; }
    renderHead(); renderBanner(); renderTabs();
    await renderRoster(q('mrtBody'));
    renderEventsBody(); renderClaimBody();
  }


  /* ---------------------------------------------------------------- Roster & Branding */
  function nameOf(d, id){ var n = (d.nameMap || {})[id]; return n ? plainName(n) : String(id); }
  function tierNote(){
    if(tp.tier === 'full') return '';
    var s = '<div class="notice-card tp-std"><strong>Standard team.</strong> Your team has a name, logo and roster, shows on every member\'s licence and in the Driver Directory, and takes join requests. Events &amp; stints, claiming stints, Team Server stats and liveries are part of the <strong>full team hub</strong>, which IFWL switches on for a team.</div>';
    return s;
  }
  function pickDriverBox(id){ return '<div class="tp-picker" id="' + id + '"></div>'; }

  async function renderRoster(container){
    var d = tp.detail;
    if(!d || !d.team){ container.innerHTML = '<div class="empty">No team loaded.</div>'; return; }
    var team = d.team, me = myId();
    var P = tp.perms || {};
    if(team.status === 'pending'){
      container.innerHTML = '<div class="notice-card">Your application for <strong>' + esc(team.teamName) + '</strong> is still awaiting staff approval &mdash; you will be able to manage it as soon as it is approved.</div>';
      return;
    }
    var managers = team.managers || [];
    var isMgrId = function(id){ return managers.indexOf(id) >= 0; };
    var canManage = !!d.canManage;

    /* the owner of an older team whose Gold has lapsed keeps the original upgrade box */
    if(!canManage && d.isOwner){
      container.innerHTML =
        '<div class="gold-upsell-box"><div class="gold-upsell-inner"><div class="gold-upsell-title">Upgrade to Gold to continue team management</div>' +
        '<p>Managing <strong>' + esc(team.teamName) + '</strong> &mdash; roster, logo, background &mdash; needs live Gold Patreon, or a one-off donation staff have verified. Your team and its roster are safe either way; this just pauses your ability to edit it until you renew.</p>' +
        '<a class="gold-upsell-btn" href="https://www.patreon.com/c/IFWL" target="_blank" rel="noopener">Upgrade to Gold on Patreon &rarr;</a></div></div>' +
        (team.logoUrl ? '<img src="' + esc(team.logoUrl) + '" class="tp-mini-logo" alt="">' : '');
      return;
    }

    var pending = (team.pendingRequests || []);
    var pendingRows = P.canHandleRequests ? (pending.map(function(id){
      return '<div class="note-item tp-row"><strong>' + esc(nameOf(d, id)) + '</strong><div class="tp-actions">' +
        '<button class="btn teal" data-place="' + esc(id) + '" data-platform="pc" type="button">Place in PC</button>' +
        '<button class="btn teal" data-place="' + esc(id) + '" data-platform="console" type="button">Place in Console</button>' +
        '<button class="btn ghost" data-reject="' + esc(id) + '" type="button">Decline</button></div></div>';
    }).join('') || '<div class="empty">No pending join requests.</div>') : '';

    function rosterRow(id){
      var isM = isMgrId(id);
      return '<div class="note-item tp-row"><div><strong>' + esc(nameOf(d, id)) + '</strong>' + (isM ? ' <span class="tp-chip mgr">Manager</span>' : '') + '</div>' +
        ((canManage) ? '<div class="tp-actions">' +
          '<button class="btn ghost" data-mgr="' + esc(id) + '" data-on="' + (isM ? '0' : '1') + '" type="button">' + (isM ? 'Remove manager' : 'Make manager') + '</button>' +
          '<button class="btn ghost" data-remove="' + esc(id) + '" type="button">Remove</button></div>' : '') + '</div>';
    }
    var pcRows = (team.pcRoster || []).map(rosterRow).join('') || '<div class="empty">No PC drivers yet.</div>';
    var coRows = (team.consoleRoster || []).map(rosterRow).join('') || '<div class="empty">No Console drivers yet.</div>';

    var ownerLine = team.ownerId
      ? '<div class="note-item tp-row"><div><strong>' + esc(nameOf(d, team.ownerId)) + '</strong> <span class="tp-chip role">Owner</span>' + (isMgrId(team.ownerId) ? ' <span class="tp-chip mgr">Manager</span>' : '') + '</div>' +
        (canManage ? '<div class="tp-actions"><button class="btn ghost" data-mgr="' + esc(team.ownerId) + '" data-on="' + (isMgrId(team.ownerId) ? '0' : '1') + '" type="button">' + (isMgrId(team.ownerId) ? 'Remove manager' : 'Make manager') + '</button></div>' : '') + '</div>'
      : '<div class="field-hint">This team has no owner right now &mdash; staff and its managers run it.</div>';

    var html = tierNote();
    if(canManage){
      html += '<div class="notice-card">Your logo shows with a glowing outline on your licence card and in the Driver Directory for every member of ' + esc(team.teamName) + ' &mdash; upload something that reads clearly small.</div>' +
        '<h4 class="tp-h">Team details</h4>' +
        '<div class="field-group"><label>Team name</label><input type="text" id="rtNameInput" value="' + esc(team.teamName || '') + '"></div>' +
        '<div class="tp-uploads">' +
          '<div><label class="field-hint tp-lab">Team logo</label>' + (team.logoUrl ? '<img src="' + esc(team.logoUrl) + '" class="tp-logo-prev" alt="">' : '<div class="field-hint">None yet</div>') + '<input type="file" id="rtLogoUpload" accept="image/png,image/jpeg,image/webp"></div>' +
          '<div><label class="field-hint tp-lab">Team page background</label>' + (team.backgroundUrl ? '<img src="' + esc(team.backgroundUrl) + '" class="tp-bg-prev" alt="">' : '<div class="field-hint">None yet</div>') + '<input type="file" id="rtBgUpload" accept="image/png,image/jpeg,image/webp"></div>' +
        '</div>' +
        '<button class="btn teal" id="rtSaveDetailsBtn" type="button">Save team details</button><span class="save-status" id="rtSaveStatus"></span>' +
        '<hr class="tp-hr">';
    } else if(d.isManager){
      html += '<div class="notice-card">You are a <strong>manager</strong> of <strong>' + esc(team.teamName) + '</strong>. You can accept or decline join requests' + (tp.tier === 'full' ? ', and run events and stints' : '') + '. The owner or staff look after everything else.</div>';
    } else {
      html += '<div class="notice-card">You\'re a member of <strong>' + esc(team.teamName) + '</strong>. Only the team owner, its managers or staff can change the team.</div>';
    }

    if(P.canHandleRequests){
      html += '<h4 class="tp-h">Pending join requests</h4><div id="rtPendingList">' + pendingRows + '</div><hr class="tp-hr">';
    }
    if(canManage || d.isManager || d.isMember || d.isOwner){
      html += '<h4 class="tp-h">Owner</h4>' + ownerLine +
        '<div class="tp-cols"><div><h4 class="tp-h">PC roster</h4><div id="rtPcRoster">' + pcRows + '</div></div>' +
        '<div><h4 class="tp-h">Console roster</h4><div id="rtConsoleRoster">' + coRows + '</div></div></div>';
    }
    if(canManage){
      html += '<div class="field-hint">Managers can accept or decline join requests' + (tp.tier === 'full' ? ' and run events and stints' : '') + '. Up to 6 per team. The owner, Ops and the League Owner can appoint them.</div>';
    }
    if(P.isOps){
      html += '<hr class="tp-hr"><h4 class="tp-h">Add a driver from the licence database</h4><div class="field-hint" style="margin-bottom:8px">Staff only. The driver leaves whatever team they were on and joins this one at once.</div>' + pickDriverBox('rtStaffAdd');
    }
    if(P.isOwnerRole){
      html += '<hr class="tp-hr"><h4 class="tp-h">Full team hub</h4><p class="field-hint" style="margin-bottom:10px">Only the League Owner switches this on. A full team gets Events &amp; Stints, Claim Your Stints, Team Server stats, Liveries and the Audit Log.</p>' +
        '<button class="btn ' + (tp.tier === 'full' ? 'ghost' : 'teal') + '" id="rtTierBtn" type="button">' + (tp.tier === 'full' ? 'Switch back to a standard team' : 'Switch on the full team hub') + '</button>';
    }
    if(d.isOwner){
      html += '<hr class="tp-hr"><h4 class="tp-h">Leave this team</h4><p class="field-hint" style="margin-bottom:10px">Steps you down as owner &mdash; the team, its roster, logo and event history all stay exactly as they are. Staff can still manage it, and anyone can apply to take over ownership afterwards, same as a fresh application.</p><button class="btn ghost" id="rtLeaveOwnerBtn" type="button">Leave team (relinquish ownership)</button>';
    } else if(d.isMember || d.isManager){
      html += '<hr class="tp-hr"><h4 class="tp-h">Leave this team</h4><button class="btn ghost" id="rtLeaveBtn" type="button">Leave this team</button>';
    }
    container.innerHTML = html;

    /* ---- wire */
    var act = async function(fn, okMsg){ try{ await fn(); if(okMsg) toast(okMsg); await refreshTeam(); }catch(e){ toast(errText(e), true); } };
    q('rtSaveDetailsBtn') && q('rtSaveDetailsBtn').addEventListener('click', async function(){
      var status = q('rtSaveStatus'); status.textContent = 'Saving...';
      try{
        var payload = { teamId: tp.teamId, teamName: q('rtNameInput').value.trim() };
        var logoFile = q('rtLogoUpload').files[0], bgFile = q('rtBgUpload').files[0];
        if(logoFile){ status.textContent = 'Uploading logo...'; payload.logoUrl = (await uploadLicenceImage(logoFile, 'raceTeamLogo', { teamId: tp.teamId })).url; }
        if(bgFile){ status.textContent = 'Uploading background...'; payload.backgroundUrl = (await uploadLicenceImage(bgFile, 'raceTeamBackground', { teamId: tp.teamId })).url; }
        await apiPost('saveRaceTeam', payload);
        status.textContent = 'Saved'; await refreshTeam();
      }catch(e){ status.textContent = 'Could not save: ' + errText(e); }
    });
    container.querySelectorAll('[data-place]').forEach(function(b){ b.addEventListener('click', function(){ act(function(){ return apiPost('placeRaceTeamMember', { teamId: tp.teamId, driverId: b.dataset.place, platform: b.dataset.platform }); }, 'Driver placed'); }); });
    container.querySelectorAll('[data-reject]').forEach(function(b){ b.addEventListener('click', function(){ act(function(){ return apiPost('removeRaceTeamMember', { teamId: tp.teamId, driverId: b.dataset.reject }); }, 'Request declined'); }); });
    container.querySelectorAll('[data-remove]').forEach(function(b){ b.addEventListener('click', function(){ if(!confirm('Remove this driver from the team?')) return; act(function(){ return apiPost('removeRaceTeamMember', { teamId: tp.teamId, driverId: b.dataset.remove }); }, 'Driver removed'); }); });
    container.querySelectorAll('[data-mgr]').forEach(function(b){ b.addEventListener('click', function(){ var on = b.dataset.on === '1'; act(function(){ return apiPost('raceTeamSetManager', { teamId: tp.teamId, driverId: b.dataset.mgr, on: on }); }, on ? 'Manager appointed' : 'Manager removed'); }); });
    q('rtLeaveOwnerBtn') && q('rtLeaveOwnerBtn').addEventListener('click', async function(){
      if(!confirm('Step down as owner of this team? The team and its roster stay as they are.')) return;
      try{ await apiPost('leaveRaceTeamAsOwner', { teamId: tp.teamId }); location.reload(); }catch(e){ toast('Could not leave: ' + errText(e), true); }
    });
    q('rtLeaveBtn') && q('rtLeaveBtn').addEventListener('click', async function(){
      if(!confirm('Leave this team? You can request to join again later.')) return;
      try{ await apiPost('leaveRaceTeam', {}); location.reload(); }catch(e){ toast('Could not leave: ' + errText(e), true); }
    });
    q('rtTierBtn') && q('rtTierBtn').addEventListener('click', function(){
      var to = tp.tier === 'full' ? 'standard' : 'full';
      if(!confirm(to === 'full' ? 'Switch the full team hub on for this team?' : 'Switch this team back to a standard team? Its events and liveries are kept, just hidden.')) return;
      act(function(){ return apiPost('staffSetRaceTeamTier', { teamId: tp.teamId, tier: to }); }, to === 'full' ? 'Full team hub switched on' : 'Back to a standard team').then(function(){ renderTeamPanels(); });
    });
    if(q('rtStaffAdd')) mountDriverPicker(q('rtStaffAdd'), [
      { label: '+ PC', run: function(dr){ return placeDriver(dr, 'pc'); } },
      { label: '+ Console', run: function(dr){ return placeDriver(dr, 'console'); } }
    ]);
  }
  async function placeDriver(dr, platform){
    if(dr.teamId && dr.teamId !== tp.teamId && !confirm(dr.name + ' is on ' + (dr.teamName || 'another team') + '. Move them here?')) return;
    try{ await apiPost('staffPlaceDriverInTeam', { teamId: tp.teamId, driverId: dr.discordId, platform: platform }); toast(plainName(dr.name) + ' placed'); await refreshTeam(); }
    catch(e){ toast(errText(e), true); }
  }

  /* ---------------------------------------------------------------- licence database picker (Ops / Owner) */
  function mountDriverPicker(el, actions){
    el.innerHTML = '<div class="tp-pick-row"><input type="text" class="tp-pick-q" placeholder="Search by name, licence number or Discord ID" autocomplete="off"><button class="btn ghost tp-pick-go" type="button">Search</button></div><div class="tp-pick-res"></div>';
    var inp = el.querySelector('.tp-pick-q'), res = el.querySelector('.tp-pick-res'), timer = null, seq = 0;
    async function go(){
      var term = inp.value.trim(); if(term.length < 2){ res.innerHTML = '<div class="field-hint">Type at least two letters.</div>'; return; }
      var my = ++seq; res.innerHTML = '<div class="field-hint">Searching&hellip;</div>';
      try{
        var r = await apiGet('staffRaceTeamDriverSearch', '&q=' + enc(term));
        if(my !== seq) return;
        var rows = r.drivers || [];
        if(!rows.length){ res.innerHTML = '<div class="field-hint">No drivers found.</div>'; return; }
        res.innerHTML = rows.map(function(dr, i){
          return '<div class="tp-pick-item"><div><strong>' + esc(plainName(dr.name)) + '</strong> <span class="field-hint">' + esc(dr.licenceNumber || '') + (dr.tier ? ' &middot; ' + esc(dr.tier) : '') + (dr.platform ? ' &middot; ' + esc(dr.platform) : '') + '</span>' +
            (dr.teamName ? ' <span class="tp-chip">on ' + esc(dr.teamName) + '</span>' : '') + '</div><div class="tp-actions">' +
            actions.map(function(a, j){ return '<button class="btn teal" type="button" data-i="' + i + '" data-j="' + j + '">' + esc(a.label) + '</button>'; }).join('') + '</div></div>';
        }).join('');
        res.querySelectorAll('button[data-i]').forEach(function(b){ b.addEventListener('click', function(){ actions[Number(b.dataset.j)].run(rows[Number(b.dataset.i)]); }); });
      }catch(e){ res.innerHTML = '<div class="field-hint">' + esc(errText(e)) + '</div>'; }
    }
    inp.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(go, 320); });
    inp.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); clearTimeout(timer); go(); } });
    el.querySelector('.tp-pick-go').addEventListener('click', go);
  }

  /* ---------------------------------------------------------------- Apply / browse / join */
  async function initApplyPanel(mine){
    var body = q('rtStatusBody'); if(!body) return;
    body.innerHTML = '<div class="empty">Loading&hellip;</div>';
    var teams;
    try{ teams = await apiGet('raceTeamsList'); }
    catch(e){ body.innerHTML = '<div class="empty">Could not load: ' + esc(errText(e)) + '</div>'; return; }
    var top = (mine && mine.role === 'pending_owner')
      ? '<div class="notice-card">Your application is pending staff approval.</div>'
      : '<div class="notice-card">Any IFWL driver with a licence can start a team. Staff approve it, and then it has a name, a logo and a roster, and it shows on every member\'s licence. The <strong>full hub</strong> &mdash; events &amp; stints, Team Server stats and liveries &mdash; is switched on by IFWL for teams that need it.</div>' +
        '<div class="field-group"><label>Team name</label><input type="text" id="rtApplyNameInput" placeholder="e.g. Midnight Motorsport" maxlength="80"></div>' +
        '<button class="btn purple" id="rtApplyBtn" type="button">Apply to create a race team</button><span class="save-status" id="rtApplyStatus"></span>';
    var cards = (teams.teams || []).length ? teams.teams.map(function(t){
      return '<div class="note-item tp-row tp-teamcard">' + (t.logoUrl ? '<img src="' + esc(t.logoUrl) + '" class="tp-card-logo" alt="">' : '<span class="tp-card-logo ph">' + esc(initials(t.teamName)) + '</span>') +
        '<div class="tp-grow"><strong>' + esc(t.teamName) + '</strong> <span class="tp-chip ' + (t.tier === 'standard' ? 'std' : 'full') + '">' + (t.tier === 'standard' ? 'Standard' : 'Full') + '</span><div class="field-hint">' + t.memberCount + ' member(s)</div></div>' +
        ((mine && mine.teamId) ? '' : '<div class="tp-actions"><button class="btn teal" data-join="' + esc(t.id) + '" type="button">Request to join</button></div>') + '</div>';
    }).join('') : '<div class="empty">No active teams yet.</div>';
    body.innerHTML = top + '<h4 class="tp-h">Active teams</h4>' + cards;
    q('rtApplyBtn') && q('rtApplyBtn').addEventListener('click', async function(){
      var status = q('rtApplyStatus'), teamName = q('rtApplyNameInput').value.trim();
      if(!teamName){ status.textContent = 'Enter a team name first.'; return; }
      status.textContent = 'Submitting...';
      try{ await apiPost('applyRaceTeam', { teamName: teamName }); var m = await apiGet('myRaceTeamId'); tp.mine = m; await initApplyPanel(m); toast('Application sent'); }
      catch(e){ status.textContent = 'Could not apply: ' + errText(e); }
    });
    body.querySelectorAll('[data-join]').forEach(function(btn){ btn.addEventListener('click', async function(){
      btn.disabled = true; btn.textContent = 'Requesting...';
      try{ await apiPost('requestJoinRaceTeam', { teamId: btn.dataset.join }); btn.textContent = 'Requested'; }
      catch(e){ btn.disabled = false; btn.textContent = 'Request to join'; toast('Could not request: ' + errText(e), true); }
    }); });
  }


  /* ---------------------------------------------------------------- All teams (Ops / Owner) */
  async function renderAllTeams(){
    var box = q('tpTeams'); if(!box) return;
    box.innerHTML = '<div class="empty">Loading&hellip;</div>';
    var apps, teams;
    try{ var r = await Promise.all([apiGet('staffRaceTeamApplications'), apiGet('staffRaceTeamList')]); apps = r[0].applications || []; teams = r[1].teams || []; }
    catch(e){ box.innerHTML = '<div class="empty">Could not load: ' + esc(errText(e)) + '</div>'; return; }
    teams.sort(function(a, b){ return String(a.teamName || '').localeCompare(String(b.teamName || '')); });
    var html = '';
    html += '<h4 class="tp-h">Applications waiting (' + apps.length + ')</h4>';
    html += apps.length ? apps.map(function(a){
      return '<div class="note-item tp-row"><div><strong>' + esc(a.teamName) + '</strong> <span class="tp-chip ' + (a.tier === 'standard' ? 'std' : 'full') + '">' + (a.tier === 'standard' ? 'Standard' : 'Full') + '</span><div class="field-hint">Owner: ' + esc(a.ownerName || a.ownerId || 'unknown') + '</div></div>' +
        '<div class="tp-actions"><button class="btn teal" data-app="' + esc(a.id) + '" data-ok="1" type="button">Approve</button><button class="btn ghost" data-app="' + esc(a.id) + '" data-ok="0" type="button">Reject</button></div></div>';
    }).join('') : '<div class="empty">Nothing waiting.</div>';
    html += '<hr class="tp-hr"><h4 class="tp-h">Active teams (' + teams.length + ')</h4>' +
      '<div class="field-group"><input type="text" id="tpTeamFilter" placeholder="Filter by team or owner name"></div><div id="tpTeamRows"></div>';
    box.innerHTML = html;

    function rows(){
      var f = (q('tpTeamFilter').value || '').toLowerCase();
      q('tpTeamRows').innerHTML = teams.filter(function(t){ return !f || String(t.teamName || '').toLowerCase().indexOf(f) >= 0 || String(t.ownerName || '').toLowerCase().indexOf(f) >= 0; }).map(function(t){
        var tier = t.tier === 'standard' ? 'standard' : 'full';
        var n = (t.pcRoster || []).length + (t.consoleRoster || []).length + (t.ownerId ? 1 : 0);
        return '<div class="note-item tp-row tp-teamcard">' + (t.logoUrl ? '<img src="' + esc(t.logoUrl) + '" class="tp-card-logo" alt="">' : '<span class="tp-card-logo ph">' + esc(initials(t.teamName)) + '</span>') +
          '<div class="tp-grow"><strong>' + esc(t.teamName) + '</strong> <span class="tp-chip ' + (tier === 'standard' ? 'std' : 'full') + '">' + (tier === 'standard' ? 'Standard' : 'Full') + '</span>' +
          '<div class="field-hint">Owner: ' + esc(t.ownerName || 'none') + ' &middot; ' + n + ' driver' + (n === 1 ? '' : 's') + ' &middot; ' + (t.managers || []).length + ' manager' + ((t.managers || []).length === 1 ? '' : 's') + '</div></div>' +
          '<div class="tp-actions"><button class="btn teal" data-open="' + esc(t.id) + '" type="button">Open</button>' +
          (isOwnerRole() ? '<button class="btn ghost" data-tier="' + esc(t.id) + '" data-to="' + (tier === 'full' ? 'standard' : 'full') + '" type="button">' + (tier === 'full' ? 'Make standard' : 'Switch on full hub') + '</button>' : '') + '</div></div>';
      }).join('') || '<div class="empty">No teams match.</div>';
      q('tpTeamRows').querySelectorAll('[data-open]').forEach(function(b){ b.addEventListener('click', function(){ openTeamAsStaff(b.dataset.open); }); });
      q('tpTeamRows').querySelectorAll('[data-tier]').forEach(function(b){ b.addEventListener('click', async function(){
        var to = b.dataset.to;
        if(!confirm(to === 'full' ? 'Switch the full team hub on for this team?' : 'Switch this team back to standard? Its events and liveries are kept, just hidden.')) return;
        try{ await apiPost('staffSetRaceTeamTier', { teamId: b.dataset.tier, tier: to }); toast(to === 'full' ? 'Full hub switched on' : 'Now a standard team'); renderAllTeams(); }
        catch(e){ toast(errText(e), true); }
      }); });
    }
    q('tpTeamFilter').addEventListener('input', rows); rows();
    box.querySelectorAll('[data-app]').forEach(function(b){ b.addEventListener('click', async function(){
      var ok = b.dataset.ok === '1';
      try{ await apiPost('staffApproveRaceTeam', { teamId: b.dataset.app, approve: ok }); toast(ok ? 'Team approved' : 'Application rejected'); renderAllTeams(); }
      catch(e){ toast(errText(e), true); }
    }); });
  }

  /* ---------------------------------------------------------------- Build a team (Ops / Owner) */
  var build = null;
  function resetBuild(){ build = { name: '', tier: 'standard', owner: null, members: [] }; }
  function buildHas(id){ return (build.owner && build.owner.id === id) || build.members.some(function(m){ return m.id === id; }); }
  function renderBuild(keep){
    var box = q('tpBuild'); if(!box) return;
    if(!build || keep === false) resetBuild();
    var owner = isOwnerRole();
    var nameVal = build.name;
    var rowsHtml = '';
    function line(label, p, isOwnerRow){
      return '<tr><td><strong>' + esc(plainName(p.name)) + '</strong>' + (p.teamName ? '<div class="field-hint">moves from ' + esc(p.teamName) + '</div>' : '') + '</td>' +
        '<td>' + (isOwnerRow ? '<span class="tp-chip role">Owner</span>' : '<select data-plat="' + esc(p.id) + '"><option value="pc"' + (p.platform === 'pc' ? ' selected' : '') + '>PC</option><option value="console"' + (p.platform === 'console' ? ' selected' : '') + '>Console</option></select>') + '</td>' +
        '<td><label class="tp-check"><input type="checkbox" data-mgrchk="' + esc(p.id) + '"' + (p.manager ? ' checked' : '') + '> Manager</label></td>' +
        '<td><button class="btn ghost" type="button" data-rm="' + esc(p.id) + '">Remove</button></td></tr>';
    }
    if(build.owner) rowsHtml += line('Owner', build.owner, true);
    build.members.forEach(function(m){ rowsHtml += line('Driver', m, false); });
    box.innerHTML =
      '<div class="notice-card">Build a team from the licence database. Every driver you add is placed in the team at once and gets the team on their licence &mdash; there is no application and no Gold or donation check. A driver already on another team is moved.</div>' +
      '<div class="tp-buildgrid">' +
        '<div class="field-group"><label>Team name</label><input type="text" id="tpBName" maxlength="80" value="' + esc(nameVal) + '" placeholder="e.g. Midnight Motorsport"></div>' +
        '<div class="field-group"><label>Team type</label><select id="tpBTier"><option value="standard"' + (build.tier === 'standard' ? ' selected' : '') + '>Standard team</option>' + (owner ? '<option value="full"' + (build.tier === 'full' ? ' selected' : '') + '>Full team hub</option>' : '') + '</select>' + (owner ? '' : '<div class="field-hint">Only the League Owner can build a full team.</div>') + '</div>' +
      '</div>' +
      '<h4 class="tp-h">Find drivers</h4>' + pickDriverBox('tpBPick') +
      '<h4 class="tp-h">This team</h4>' +
      (rowsHtml ? '<div class="table-wrap"><table class="results-table tp-buildtable"><thead><tr><th>Driver</th><th>Role / platform</th><th>Manager</th><th></th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' : '<div class="empty">No drivers yet &mdash; search above and add them.</div>') +
      '<div class="tp-buildfoot"><button class="btn teal" id="tpBGo" type="button">Build team</button> <button class="btn ghost" id="tpBClear" type="button">Start again</button><span class="save-status" id="tpBStatus"></span></div>';

    q('tpBName').addEventListener('input', function(){ build.name = this.value; });
    q('tpBTier').addEventListener('change', function(){ build.tier = this.value; });
    mountDriverPicker(q('tpBPick'), [
      { label: 'Owner', run: function(dr){ addBuild(dr, 'owner'); } },
      { label: '+ PC', run: function(dr){ addBuild(dr, 'pc'); } },
      { label: '+ Console', run: function(dr){ addBuild(dr, 'console'); } }
    ]);
    box.querySelectorAll('[data-rm]').forEach(function(b){ b.addEventListener('click', function(){
      var id = b.dataset.rm;
      if(build.owner && build.owner.id === id) build.owner = null; else build.members = build.members.filter(function(m){ return m.id !== id; });
      renderBuild(true);
    }); });
    box.querySelectorAll('[data-plat]').forEach(function(s){ s.addEventListener('change', function(){ var m = build.members.filter(function(x){ return x.id === s.dataset.plat; })[0]; if(m) m.platform = s.value; }); });
    box.querySelectorAll('[data-mgrchk]').forEach(function(c){ c.addEventListener('change', function(){
      var id = c.dataset.mgrchk, p = (build.owner && build.owner.id === id) ? build.owner : build.members.filter(function(x){ return x.id === id; })[0];
      if(p) p.manager = c.checked;
    }); });
    q('tpBClear').addEventListener('click', function(){ resetBuild(); renderBuild(true); });
    q('tpBGo').addEventListener('click', submitBuild);
  }
  function addBuild(dr, as){
    var p = { id: dr.discordId, name: dr.name, teamName: dr.teamName || '', platform: as === 'console' ? 'console' : (dr.platform === 'console' ? 'console' : 'pc'), manager: false };
    if(buildHas(p.id)){ toast(plainName(dr.name) + ' is already in the list'); return; }
    if(as === 'owner'){ build.owner = p; } else { p.platform = as; build.members.push(p); }
    renderBuild(true);
  }
  async function submitBuild(){
    var st = q('tpBStatus');
    var name = (build.name || '').trim();
    if(!name){ st.textContent = 'Give the team a name.'; return; }
    if(!build.owner && !build.members.length){ st.textContent = 'Add at least one driver.'; return; }
    var all = (build.owner ? [build.owner] : []).concat(build.members);
    var moved = all.filter(function(p){ return p.teamName; });
    if(moved.length && !confirm(moved.map(function(p){ return plainName(p.name) + ' (from ' + p.teamName + ')'; }).join('\n') + '\n\nThese drivers will be moved off their current team. Continue?')) return;
    var body = {
      teamName: name, tier: build.tier, ownerId: build.owner ? build.owner.id : '',
      pcIds: build.members.filter(function(m){ return m.platform !== 'console'; }).map(function(m){ return m.id; }),
      consoleIds: build.members.filter(function(m){ return m.platform === 'console'; }).map(function(m){ return m.id; }),
      managerIds: all.filter(function(p){ return p.manager; }).map(function(p){ return p.id; })
    };
    st.textContent = 'Building...';
    try{
      var r = await apiPost('staffBuildRaceTeam', body);
      var newId = r.teamId; resetBuild();
      q('tpBuild').innerHTML = '<div class="notice-card tp-ok"><strong>' + esc(name) + '</strong> is built &mdash; ' + (r.placed || 0) + ' driver' + (r.placed === 1 ? '' : 's') + ' placed, and the team now shows on their licences.</div>' +
        '<div class="tp-actions"><button class="btn teal" id="tpBOpen" type="button">Open the team</button> <button class="btn ghost" id="tpBAgain" type="button">Build another</button></div>';
      q('tpBOpen').addEventListener('click', function(){ openTeamAsStaff(newId); });
      q('tpBAgain').addEventListener('click', function(){ renderBuild(true); });
    }catch(e){ st.textContent = 'Could not build: ' + errText(e); }
  }


  /* ---------------------------------------------------------------- Discord draft image */
  /* Draws the finalised stint plan as a picture for team leads to copy or save
     and paste into Discord themselves. Nothing is posted anywhere. */
  function splitName(n){
    var m = String(n || '').match(/^\s*\[\s*(\d+)\s*\]\s*-?\s*(.*)$/);
    return m ? { num: m[1], name: (m[2] || '').trim() } : { num: '', name: String(n || '').trim() };
  }
  function draftModel(event, opts){
    var count = Number(event.stintCount || 0), times = Array.isArray(event.stintTimes) ? event.stintTimes : [];
    var rows = [];
    for(var i = 0; i < count; i++){
      var s = (event.stints || []).filter(function(x){ return Number(x.index) === i; })[0];
      var who = s && s.driverName ? s.driverName : '';
      var ack = who ? (event.acknowledgements || {})[driverNameKey(who)] : null;
      var tstr = String(times[i] || '').trim(), when = tstr ? stintTimeToUtcDate(event, tstr) : null, tz = (opts && opts.tz) || 'UTC';
      var shown = '', zone = '';
      if(when && tz !== 'UTC'){
        try{
          shown = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
          var part = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' }).formatToParts(when).filter(function(x){ return x.type === 'timeZoneName'; })[0];
          zone = part ? part.value : tz;
        }catch(_){ shown = ''; }
      }
      rows.push({ stint: i + 1, time: tstr, ts: when ? Math.floor(when.getTime() / 1000) : 0, shown: shown, zone: zone, driver: who, status: ack ? ack.status : '' });
    }
    var date = event.eventDateMs ? new Date(event.eventDateMs).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var zoneName = (rows.filter(function(r){ return r.zone; })[0] || {}).zone || '';
    var meta = [date, event.raceNumber ? '#' + event.raceNumber : '', event.car || '', event.platform === 'console' ? 'Console' : 'PC', zoneName ? 'Times in ' + zoneName : ''].filter(Boolean).join('  ·  ');
    return { team: currentTeamName, logo: (tp.detail && tp.detail.team && tp.detail.team.logoUrl) || '', round: event.roundName || 'Race', meta: meta, link: event.simgridLink || '', rows: rows, note: (opts && opts.note) || '', showStatus: !!(opts && opts.showStatus) };
  }
  function draftText(m){
    var out = ['**' + m.team + '** — STINT PLAN (DRAFT)', '**' + m.round + '**' + (m.meta ? '  ·  ' + m.meta.replace(/\s{2}·\s{2}/g, '  ·  ') : '')];
    m.rows.forEach(function(r){
      var d = r.driver ? splitName(r.driver) : null;
      var st = m.showStatus && r.driver ? (r.status === 'yes' ? '  ✅' : r.status === 'no' ? '  ❌' : '  ⏳') : '';
      /* <t:..:t> is rendered by Discord in each reader's own time zone; the UTC time stays alongside for clarity */
      var when = r.ts ? '<t:' + r.ts + ':t> (' + r.time + ')' : r.time;
      out.push('Stint ' + r.stint + (when ? '  ·  ' + when : '') + '  ·  ' + (d ? (d.num ? '#' + d.num + ' ' : '') + d.name : 'TBC') + st);
    });
    if(m.note) out.push('', m.note);
    out.push('', '_Draft — subject to change._' + (m.link ? '\n' + m.link : ''));
    return out.join('\n');
  }
  function loadImg(url){
    return new Promise(function(res){
      if(!url) return res(null);
      var im = new Image(), done = false;
      function fin(v){ if(!done){ done = true; res(v); } }
      im.crossOrigin = 'anonymous'; im.onload = function(){ fin(im); }; im.onerror = function(){ fin(null); };
      setTimeout(function(){ fin(null); }, 6000);
      im.src = url;
    });
  }
  function rr(ctx, x, y, w, h, r){
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function fitText(ctx, text, maxW){
    var t = String(text || '');
    if(ctx.measureText(t).width <= maxW) return t;
    while(t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function wrapLines(ctx, text, maxW){
    var words = String(text || '').split(/\s+/), lines = [], cur = '';
    words.forEach(function(w){ var t = cur ? cur + ' ' + w : w; if(ctx.measureText(t).width > maxW && cur){ lines.push(cur); cur = w; } else cur = t; });
    if(cur) lines.push(cur);
    return lines;
  }
  async function drawDraft(canvas, m){
    var W = 1200, PAD = 48, ROW = 70, GAP = 10;
    var accent = '#1b897e';
    try{ var a = getComputedStyle(document.body).getPropertyValue('--ifwl-teal').trim(); if(a) accent = a; }catch(_){}
    var logo = await loadImg(m.logo);
    var tmp = document.createElement('canvas').getContext('2d');
    tmp.font = '500 22px Arial, sans-serif';
    var noteLines = m.note ? wrapLines(tmp, m.note, W - PAD * 2) : [];
    var H = 250 + m.rows.length * (ROW + GAP) + 40 + (noteLines.length ? noteLines.length * 30 + 20 : 0) + 76;
    var scale = 1; canvas.width = W * scale; canvas.height = H * scale;
    var c = canvas.getContext('2d'); c.scale(scale, scale);
    /* background */
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0c1319'); g.addColorStop(1, '#111c25');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = accent; c.fillRect(0, 0, W, 8);
    /* header */
    var lx = PAD, ly = 44, ls = 104;
    if(logo){
      c.save(); rr(c, lx, ly, ls, ls, 20); c.clip(); c.fillStyle = '#ffffff'; c.fillRect(lx, ly, ls, ls);
      var ar = logo.width / logo.height, dw = ls, dh = ls; if(ar > 1) dh = ls / ar; else dw = ls * ar;
      c.drawImage(logo, lx + (ls - dw) / 2, ly + (ls - dh) / 2, dw, dh); c.restore();
    } else {
      rr(c, lx, ly, ls, ls, 20); c.fillStyle = accent; c.fill();
      c.fillStyle = '#ffffff'; c.font = '700 44px Rajdhani, Arial Narrow, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(initials(m.team), lx + ls / 2, ly + ls / 2 + 2); c.textAlign = 'left';
    }
    var tx = lx + ls + 28;
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#ffffff'; c.font = '700 54px Rajdhani, Arial Narrow, Arial, sans-serif';
    c.fillText(fitText(c, m.team.toUpperCase(), W - tx - PAD - 160), tx, ly + 56);
    c.fillStyle = accent; c.font = '700 22px Rajdhani, Arial Narrow, Arial, sans-serif';
    c.fillText('STINT PLAN  ·  DRAFT', tx, ly + 94);
    c.textAlign = 'right'; c.fillStyle = '#8fa3b0'; c.font = '700 30px Rajdhani, Arial Narrow, Arial, sans-serif'; c.fillText('IFWL', W - PAD, ly + 40); c.textAlign = 'left';
    /* event */
    var ey = 176;
    c.fillStyle = '#eef3f6'; c.font = '700 40px Rajdhani, Arial Narrow, Arial, sans-serif';
    c.fillText(fitText(c, m.round, W - PAD * 2), PAD, ey + 34);
    c.fillStyle = '#93a8b5'; c.font = '500 22px Arial, sans-serif';
    c.fillText(fitText(c, m.meta, W - PAD * 2), PAD, ey + 68);
    /* rows */
    var y = 250;
    m.rows.forEach(function(r, i){
      rr(c, PAD, y, W - PAD * 2, ROW, 14); c.fillStyle = i % 2 ? '#15222c' : '#18262f'; c.fill();
      rr(c, PAD + 14, y + 13, 112, ROW - 26, 10); c.fillStyle = accent; c.fill();
      c.fillStyle = '#ffffff'; c.font = '700 24px Rajdhani, Arial Narrow, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('STINT ' + r.stint, PAD + 14 + 56, y + ROW / 2 + 1); c.textAlign = 'left';
      c.textBaseline = 'middle'; c.fillStyle = '#c7d4dc'; c.font = '700 26px "JetBrains Mono", Consolas, monospace';
      if(r.shown){
        c.fillText(r.shown + ' ' + r.zone, PAD + 148, y + ROW / 2 - 9);
        c.fillStyle = '#7c92a0'; c.font = '600 15px "JetBrains Mono", Consolas, monospace'; c.fillText(r.time, PAD + 148, y + ROW / 2 + 18);
      } else c.fillText(r.time || '--:--', PAD + 148, y + ROW / 2 + 1);
      var d = r.driver ? splitName(r.driver) : null, nx = PAD + 340;
      if(d){
        if(d.num){ c.fillStyle = accent; c.font = '700 28px Rajdhani, Arial Narrow, Arial, sans-serif'; var nt = '#' + d.num; c.fillText(nt, nx, y + ROW / 2 + 1); nx += c.measureText(nt).width + 12; }
        c.fillStyle = '#ffffff'; c.font = '700 34px Rajdhani, Arial Narrow, Arial, sans-serif';
        c.fillText(fitText(c, d.name, W - PAD - 220 - nx), nx, y + ROW / 2 + 1);
      } else { c.fillStyle = '#6b7f8c'; c.font = '700 30px Rajdhani, Arial Narrow, Arial, sans-serif'; c.fillText('TO BE CONFIRMED', nx, y + ROW / 2 + 1); }
      if(m.showStatus && r.driver){
        var label = r.status === 'yes' ? 'CONFIRMED' : r.status === 'no' ? 'DECLINED' : 'AWAITING', col = r.status === 'yes' ? '#33d99b' : r.status === 'no' ? '#ff6b78' : '#ffb238';
        c.font = '700 20px Rajdhani, Arial Narrow, Arial, sans-serif'; var tw = c.measureText(label).width + 28;
        rr(c, W - PAD - 14 - tw, y + 17, tw, ROW - 34, 17); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill();
        c.strokeStyle = col; c.lineWidth = 2; c.stroke();
        c.fillStyle = col; c.textAlign = 'center'; c.fillText(label, W - PAD - 14 - tw / 2, y + ROW / 2 + 1); c.textAlign = 'left';
      }
      y += ROW + GAP;
    });
    c.textBaseline = 'alphabetic';
    y += 22;
    if(noteLines.length){
      c.fillStyle = '#dfe8ec'; c.font = '500 22px Arial, sans-serif';
      noteLines.forEach(function(l, i){ c.fillText(l, PAD, y + 22 + i * 30); });
      y += noteLines.length * 30 + 20;
    }
    c.fillStyle = '#7c92a0'; c.font = '600 19px Arial, sans-serif';
    c.fillText('Draft — subject to change. Check and confirm your stints on the IFWL Licence Centre.', PAD, y + 24);
    c.textAlign = 'right'; c.fillText('ifwl.net', W - PAD, y + 24); c.textAlign = 'left';
    return canvas;
  }
  function openDraft(event){
    var ov = document.createElement('div'); ov.className = 'tp-modal';
    ov.innerHTML = '<div class="tp-modal-box" role="dialog" aria-modal="true" aria-label="Draft stint image"><button class="tp-x" type="button" aria-label="Close">&times;</button>' +
      '<h3>Draft stint image</h3>' +
      '<p class="field-hint">A picture of the stint plan to paste into your team\'s Discord channel. Nothing is posted for you.</p>' +
      '<div class="tp-draft-opts"><div class="field-group"><label for="tpDraftNote">Note under the plan (optional)</label><input type="text" id="tpDraftNote" maxlength="240" placeholder="e.g. Be in the lobby 30 minutes before the start"></div>' +
      '<div class="field-group"><label for="tpDraftTz">Show stint times in</label><select id="tpDraftTz"></select>' +
        '<div class="field-hint">A picture can only show one time zone, so pick the one your team shares. <b>Copy as text</b> works differently: Discord shows every reader their own local time.</div></div>' +
      '<label class="tp-check"><input type="checkbox" id="tpDraftStatus"> Show who has confirmed</label></div>' +
      '<div class="tp-draft-prev"><canvas id="tpDraftCanvas"></canvas></div>' +
      '<div class="tp-actions"><button class="btn teal" id="tpDraftDl" type="button">Download image</button><button class="btn purple" id="tpDraftCopy" type="button">Copy image</button><button class="btn ghost" id="tpDraftTxt" type="button">Copy as text</button></div>' +
      '<div class="field-hint tp-draft-msg" id="tpDraftMsg"></div></div>';
    document.body.appendChild(ov);
    var cv = ov.querySelector('#tpDraftCanvas'), noteEl = ov.querySelector('#tpDraftNote'), stEl = ov.querySelector('#tpDraftStatus'), msg = ov.querySelector('#tpDraftMsg');
    var timer = null, model = null;
    var tzEl = ov.querySelector('#tpDraftTz'), DRAFT_TZ_KEY = 'IFWL_RT_DRAFT_TZ';
    (function(){
      var mine = getMyTimezone(), saved = 'UTC';
      try{ saved = localStorage.getItem(DRAFT_TZ_KEY) || 'UTC'; }catch(_){}
      var zones = timezoneOptionList().filter(function(z){ return z !== 'UTC' && z !== mine; });
      var opts = ['<option value="UTC">UTC (same for everyone)</option>'];
      if(mine && mine !== 'UTC') opts.push('<option value="' + esc(mine) + '">Your local time (' + esc(mine) + ')</option>');
      zones.forEach(function(z){ opts.push('<option value="' + esc(z) + '">' + esc(z) + '</option>'); });
      tzEl.innerHTML = opts.join('');
      tzEl.value = Array.prototype.some.call(tzEl.options, function(o){ return o.value === saved; }) ? saved : 'UTC';
    })();
    function close(){ ov.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e){ if(e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.querySelector('.tp-x').addEventListener('click', close);
    ov.addEventListener('mousedown', function(e){ if(e.target === ov) close(); });
    async function redraw(){
      model = draftModel(event, { note: noteEl.value.trim(), showStatus: stEl.checked, tz: tzEl.value });
      try{ await drawDraft(cv, model); msg.textContent = ''; }catch(e){ msg.textContent = 'Could not draw the image: ' + errText(e); }
    }
    noteEl.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(redraw, 250); });
    stEl.addEventListener('change', redraw);
    tzEl.addEventListener('change', function(){ try{ localStorage.setItem(DRAFT_TZ_KEY, tzEl.value); }catch(_){} redraw(); });
    function blob(){ return new Promise(function(res){ cv.toBlob(res, 'image/png'); }); }
    function fname(){ return (currentTeamName + '-' + (event.roundName || 'stint-plan')).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() + '-draft.png'; }
    ov.querySelector('#tpDraftDl').addEventListener('click', async function(){
      var b = await blob(); if(!b){ msg.textContent = 'The picture could not be saved from this browser.'; return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fname(); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000); msg.textContent = 'Saved. Drag it into Discord, or paste it.';
    });
    ov.querySelector('#tpDraftCopy').addEventListener('click', async function(){
      try{
        if(!(navigator.clipboard && window.ClipboardItem)) throw new Error('no clipboard');
        var b = await blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
        msg.textContent = 'Image copied. Paste it into Discord with Ctrl+V (or Cmd+V).';
      }catch(e){ msg.textContent = 'This browser would not copy the picture. Use Download image instead.'; }
    });
    ov.querySelector('#tpDraftTxt').addEventListener('click', async function(){
      try{ await navigator.clipboard.writeText(draftText(model || draftModel(event, {}))); msg.textContent = 'Text copied. Paste it into Discord.'; }
      catch(e){ msg.textContent = 'This browser would not copy the text.'; }
    });
    redraw();
  }


  /* ---------------------------------------------------------------- start */
  function start(){
    if(start.done) return; start.done = true;
    tp.tsLoad = setupTeamServer();
    boot();
  }
  function maybeStart(){
    if(!q('teamRoot')) return;
    if(window.IFWL_META && (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken())) start();
  }
  window.addEventListener('ifwl-auth-changed', function(e){ if(e && e.detail && e.detail.meta) maybeStart(); });
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maybeStart); else maybeStart();
})();
