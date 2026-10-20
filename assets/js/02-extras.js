
/* ============================================================
   STAFF PANEL
   Search/edit any driver, override tier with a reason (kept in
   tierHistory so there's an audit trail), and keep private
   staff notes in a separate note list that is never surfaced
   in the public directory or the driver's own profile fetch.
   ============================================================ */
/* ============================================================
   DRIVER-FACING PART of the former single staff script.
   Loaded for everybody (trophy cabinet pages, race-day quick-facts strip,
   licence beta notice, the secret terminal). Everything staff-only now lives
   in 02b-staff.js and is loaded only for staff-type users.
   Code below is copied verbatim - nothing was rewritten.
   ============================================================ */
(() => {
  const q = id => document.getElementById(id);
  function demoGet(k,fallback){try{const v=localStorage.getItem('IFWL_LICENCE_DEMO:'+k);return v?JSON.parse(v):fallback}catch(_){return fallback}}
  function hexToRgba(hex, alpha){
    const clean = String(hex || '').replace('#','');
    const full = clean.length === 3 ? clean.split('').map(c => c+c).join('') : clean.padEnd(6,'0').slice(0,6);
    const r = parseInt(full.substring(0,2),16) || 0, g = parseInt(full.substring(2,4),16) || 0, b = parseInt(full.substring(4,6),16) || 0;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const USE_DEMO_FALLBACK = () => window.IFWL_USE_DEMO_FALLBACK;

  // Server contract (see index.js):
  //   ?staffLicenceSearch=1&token=...&q=...
  //   ?staffLicenceSave=1&token=...      {driverId, name, tier, reason}
  //   ?staffLicenceNoteAdd=1&token=...   {driverId, text}
  //   ?staffLicenceNoteList=1&token=...&driverId=...
  //   ?staffLicenceIssue=1&token=...     {discordId, name}
  async function staffSearch(term){
    if(USE_DEMO_FALLBACK()){
      const all = Object.values(demoGet('profiles', {}));
      return !term ? all : all.filter(p=>(p.name||'').toLowerCase().includes(term) || (p.licenceNumber||'').toLowerCase().includes(term));
    }
    return (await window.IFWL_Api.apiGet('staffLicenceSearch', `&q=${encodeURIComponent(term)}`)).drivers || [];
  }

  // ✅ ADDED: IFWL Trophy Cabinet - public showcase page
  const TROPHY_COLORS = {
    gold:   { a:'#fff3c4', b:'#e8b830', c:'#8a6410' },
    silver: { a:'#f4f6f8', b:'#b9c2ca', c:'#6b747c' },
    bronze: { a:'#e8b98a', b:'#b06a34', c:'#6b3d18' }
  };
  const TROPHY_SIZE = { gold: 92, silver: 74, bronze: 62 };

  function trophySvg(place, uid){
    const col = TROPHY_COLORS[place] || TROPHY_COLORS.bronze;
    const h = TROPHY_SIZE[place] || 60;
    const w = Math.round(h * 0.82);
    const gid = `trophyGrad_${place}_${uid}`;
    return `<svg width="${w}" height="${h}" viewBox="0 0 82 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${col.a}"/>
          <stop offset="55%" stop-color="${col.b}"/>
          <stop offset="100%" stop-color="${col.c}"/>
        </linearGradient>
      </defs>
      <rect x="20" y="88" width="42" height="8" rx="2" fill="${col.c}"/>
      <rect x="30" y="76" width="22" height="14" fill="url(#${gid})"/>
      <path d="M28 20 h26 v22 c0 14 -6 24 -13 24 s-13 -10 -13 -24 z" fill="url(#${gid})"/>
      <path d="M28 24 c-10 0 -16 6 -16 14 c0 9 7 15 16 15 v-8 c-5 0 -8 -3 -8 -7 c0 -5 3 -8 8 -8 z" fill="url(#${gid})"/>
      <path d="M54 24 c10 0 16 6 16 14 c0 9 -7 15 -16 15 v-8 c5 0 8 -3 8 -7 c0 -5 -3 -8 -8 -8 z" fill="url(#${gid})"/>
      <ellipse cx="41" cy="20" rx="14" ry="5" fill="${col.a}" opacity="0.9"/>
    </svg>`;
  }
  window.trophySvg = trophySvg;

  function trophyPlateHtml(placement){
    if(!placement){
      return `<div class="trophy-plate empty">Unassigned</div>`;
    }
    const avatar = placement.avatarUrl
      ? `<img class="tp-avatar" src="${placement.avatarUrl}" alt="">`
      : `<div class="tp-avatar-empty"></div>`;
    return `<div class="trophy-plate">
      ${avatar}
      <strong>${placement.name || 'Unnamed driver'}</strong>
      <span class="tp-num">${placement.licenceNumber || '-'}</span>
      <span class="tp-tier" style="background:${hexToRgba(placement.tierColor || '#93a1a9', 0.2)};color:${placement.tierColor || '#93a1a9'}">${placement.tier || ''}</span>
    </div>`;
  }

  async function fetchTrophyCabinet(){
    try{ return (await window.IFWL_Api.apiGet('trophyCabinetList')).entries || []; }
    catch(e){ console.warn('Could not load trophy cabinet', e); return []; }
  }

  function trophyVisual(place, placement, uid){
    if(placement?.trophyImageUrl){
      const h = TROPHY_SIZE[place] || 60;
      return `<img src="${placement.trophyImageUrl}" alt="" style="height:${h}px;max-width:130px;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))">`;
    }
    return trophySvg(place, uid);
  }

  function renderTrophyCabinetEntries(entries){
    const body = q('trophyCabinetBody');
    if(!body) return;
    if(!entries.length){ body.innerHTML = '<div class="empty">No trophies awarded yet - check back once a season wraps up!</div>'; return; }

    body.innerHTML = entries.map((e, i) => `
      <div class="trophy-cabinet-case">
        <div class="trophy-cabinet-title">${e.eventName}</div>
        <div class="trophy-shelf">
          <div class="trophy-slot place-silver">
            ${trophyVisual('silver', e.silver, i)}
            <div class="trophy-place-label">2nd</div>
            ${trophyPlateHtml(e.silver)}
          </div>
          <div class="trophy-slot place-gold">
            ${trophyVisual('gold', e.gold, i)}
            <div class="trophy-place-label">1st</div>
            ${trophyPlateHtml(e.gold)}
          </div>
          <div class="trophy-slot place-bronze">
            ${trophyVisual('bronze', e.bronze, i)}
            <div class="trophy-place-label">3rd</div>
            ${trophyPlateHtml(e.bronze)}
          </div>
        </div>
      </div>
    `).join('');
  }

  async function initTrophyCabinetPublicPage(){
    renderTrophyCabinetEntries(await fetchTrophyCabinet());
  }
  window.initTrophyCabinetPublicPage = initTrophyCabinetPublicPage;

  // ---------- My Trophy Cabinet (personal, driver-facing) ----------
  let myTrophies = [];

  function hexToRgbTriplet(hex){
    const clean = String(hex || '').replace('#','');
    const full = clean.length === 3 ? clean.split('').map(c => c+c).join('') : clean.padEnd(6,'0').slice(0,6);
    const r = parseInt(full.substring(0,2),16) || 255, g = parseInt(full.substring(2,4),16) || 224, b = parseInt(full.substring(4,6),16) || 160;
    return `${r},${g},${b}`;
  }

  function myTrophyTileHtml(t){
    const placeLabel = t.place === 'gold' ? '1st' : t.place === 'silver' ? '2nd' : t.place === 'achievement' ? 'Achievement' : '3rd';
    const isGold = window.IFWL_GOLD || window.IFWL_STAFF;
    const isSilverPlus = window.IFWL_SILVER_PLUS || isGold;
    const lightColor = t.lightColor || '#ffe0a0';

    const lightControls = isGold
      ? `<button type="button" class="mtt-light-btn${t.lit ? ' active' : ''}" draggable="false" title="Flick the spotlight on/off (Gold perk)">💡</button>
         <input type="color" class="mtt-color-input" draggable="false" value="${lightColor}" title="Choose your spotlight colour (Gold perk)">`
      : `<span class="mtt-locked" title="Spotlights are a Gold Patreon perk">💡<i class="mtt-lock-badge">🔒</i></span>`;

    const dustControls = isSilverPlus
      ? `<button type="button" class="mtt-dust-btn" draggable="false" title="Dust it off">🧹</button>`
      : `<span class="mtt-locked" title="Dusting is a Silver/Gold Patreon perk">🧹<i class="mtt-lock-badge">🔒</i></span>`;

    return `<div class="my-trophy-tile${t.lit ? ' lit' : ''}${t.dusted ? ' dusted' : ''}" draggable="true" data-trophy-id="${t.trophyId}" style="--trophy-light-color:${hexToRgbTriplet(lightColor)}">
      <div class="mtt-controls">
        <button type="button" class="mtt-showcase-btn${t.showcased ? ' active' : ''}" draggable="false" title="Show off on your licence card &amp; Driver Directory (max 3)">⭐</button>
        ${lightControls}
        ${dustControls}
      </div>
      ${trophyVisual(t.place, t, t.trophyId)}
      <div class="trophy-place-label">${placeLabel}</div>
      <div class="mtt-event">${t.eventName}</div>
    </div>`;
  }

  // A trophy briefly plays a "shine sweep" animation, then keeps a soft
  // permanent shimmer (the .dusted class) to show it's been cared for.
  function dustOffTile(tile){
    if(!tile || tile.classList.contains('dusting')) return;
    tile.classList.add('dusting');
    setTimeout(() => {
      tile.classList.remove('dusting');
      tile.classList.add('dusted');
    }, 900);
  }

  // Both light settings and dusted state are saved together on every
  // change, same auto-save-on-interaction pattern as showcase/order - reads
  // the CURRENT DOM state of every tile rather than tracking a separate
  // shadow copy, so what you see is always exactly what gets saved.
  async function saveMyTrophyDisplaySettings(interior){
    const status = q('myCabinetSaveStatus');
    const lights = {};
    interior.querySelectorAll('.my-trophy-tile').forEach(tile => {
      const id = tile.dataset.trophyId;
      const colorInput = tile.querySelector('.mtt-color-input');
      lights[id] = { on: tile.classList.contains('lit'), color: colorInput ? colorInput.value : '#ffe0a0' };
    });
    const dusted = Array.from(interior.querySelectorAll('.my-trophy-tile.dusted')).map(t => t.dataset.trophyId);

    if(status) status.textContent = 'Saving...';
    try{
      await window.IFWL_Api.apiPost('myTrophyDisplaySettingsSave', { lights, dusted });
      if(status){ status.textContent = 'Saved.'; setTimeout(() => { if(q('myCabinetSaveStatus')) q('myCabinetSaveStatus').textContent = ''; }, 1200); }
    }catch(e){
      if(status) status.textContent = 'Could not save: ' + e.message;
    }
  }

  function wireMyTrophyTileControls(interior){
    interior.querySelectorAll('.mtt-light-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tile = btn.closest('.my-trophy-tile');
        const on = tile.classList.toggle('lit');
        btn.classList.toggle('active', on);
        saveMyTrophyDisplaySettings(interior);
      });
    });
    interior.querySelectorAll('.mtt-color-input').forEach(input => {
      input.addEventListener('input', (e) => {
        e.stopPropagation();
        const tile = input.closest('.my-trophy-tile');
        tile.style.setProperty('--trophy-light-color', hexToRgbTriplet(input.value));
      });
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        saveMyTrophyDisplaySettings(interior);
      });
      input.addEventListener('click', (e) => e.stopPropagation());
    });
    interior.querySelectorAll('.mtt-dust-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dustOffTile(btn.closest('.my-trophy-tile'));
        setTimeout(() => saveMyTrophyDisplaySettings(interior), 950); // after the shine animation settles into .dusted
      });
    });
    interior.querySelectorAll('.mtt-showcase-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isOn = btn.classList.contains('active');
        const currentCount = interior.querySelectorAll('.mtt-showcase-btn.active').length;
        const status = q('myCabinetSaveStatus');

        if(!isOn && currentCount >= 3){
          if(status) status.textContent = 'You can only show off 3 trophies at once - unstar one first.';
          return;
        }

        btn.classList.toggle('active', !isOn);

        const showcasedIds = Array.from(interior.querySelectorAll('.mtt-showcase-btn.active'))
          .map(b => b.closest('.my-trophy-tile').dataset.trophyId);

        if(status) status.textContent = 'Saving showcase...';
        try{
          const result = await window.IFWL_Api.apiPost('myTrophyShowcaseSave', { trophyIds: showcasedIds });
          renderLicenceCardTrophies(result.showcaseTrophies || []);
          if(status){ status.textContent = 'Showcase saved.'; setTimeout(() => { if(q('myCabinetSaveStatus')) q('myCabinetSaveStatus').textContent = ''; }, 1500); }
        }catch(err){
          btn.classList.toggle('active', isOn); // revert on failure
          if(status) status.textContent = 'Could not save showcase: ' + err.message;
        }
      });
    });
  }

  function wireMyTrophyDragReorder(interior){
    let draggedEl = null;

    interior.addEventListener('dragstart', (e) => {
      const tile = e.target.closest('.my-trophy-tile');
      if(!tile) return;
      draggedEl = tile;
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    interior.addEventListener('dragend', async () => {
      if(draggedEl) draggedEl.classList.remove('dragging');
      draggedEl = null;
      const order = Array.from(interior.querySelectorAll('.my-trophy-tile')).map(el => el.dataset.trophyId);
      const status = q('myCabinetSaveStatus');
      if(status){ status.textContent = 'Saving arrangement...'; }
      try{
        await window.IFWL_Api.apiPost('myTrophyOrderSave', { order });
        if(status){ status.textContent = 'Saved.'; setTimeout(() => { if(q('myCabinetSaveStatus')) q('myCabinetSaveStatus').textContent = ''; }, 1500); }
      }catch(e){
        if(status) status.textContent = 'Could not save arrangement: ' + e.message;
      }
    });

    interior.addEventListener('dragover', (e) => {
      e.preventDefault();
      const tile = e.target.closest('.my-trophy-tile');
      if(!tile || tile === draggedEl || !draggedEl) return;
      const rect = tile.getBoundingClientRect();
      const before = (e.clientX - rect.left) < rect.width / 2;
      interior.insertBefore(draggedEl, before ? tile : tile.nextSibling);
    });
  }

  function licenceCardTrophyIconHtml(t){
    const placeLabel = t.place === 'gold' ? '1st' : t.place === 'silver' ? '2nd' : t.place === 'achievement' ? 'Achievement' : '3rd';
    const title = `${placeLabel} - ${t.eventName}`.replace(/"/g, '&quot;');
    const visual = t.trophyImageUrl
      ? `<img src="${t.trophyImageUrl}" alt="">`
      : trophySvg(t.place, 'lct_' + t.trophyId);
    return `<div class="lct-trophy" title="${title}">${visual}</div>`;
  }

  // Lives on the driver's own "My Licence" card, between the card face and
  // the Overall Score/Consistency/Race Risk row - reuses whatever this same
  // page already fetched for My Trophy Cabinet, so this never triggers a
  // second network round trip just to populate a few small icons.
  function renderLicenceCardTrophies(trophies){
    const box = q('licenceCardTrophies');
    if(!box) return;
    if(!trophies || !trophies.length){ box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = trophies.map(licenceCardTrophyIconHtml).join('');
  }

  function trophyAwardDetailText(t){
    if(t.place === 'achievement') return `You've earned "${t.eventName}"`;
    const placeLabel = t.place === 'gold' ? '1st place' : t.place === 'silver' ? '2nd place' : '3rd place';
    return `${placeLabel} - ${t.eventName}`;
  }

  function showTrophyCelebration(queue){
    const modal = q('trophyAwardModal');
    const visual = q('trophyAwardVisual');
    const detail = q('trophyAwardDetail');
    const ackBtn = q('trophyAwardAckBtn');
    const goBtn = q('trophyAwardGoBtn');
    if(!modal || !queue.length) return;

    const current = queue[0];
    visual.innerHTML = trophyVisual(current.place, current, 'award_' + current.trophyId);
    detail.textContent = trophyAwardDetailText(current);
    modal.classList.remove('hidden');

    async function acknowledgeCurrent(){
      try{ await window.IFWL_Api.apiPost('myTrophyAcknowledge', { trophyId: current.trophyId }); }
      catch(e){ console.warn('Could not acknowledge trophy', e); }
      const rest = queue.slice(1);
      if(rest.length){
        showTrophyCelebration(rest); // next one in the queue gets its own moment
      }else{
        modal.classList.add('hidden');
      }
    }

    ackBtn.onclick = acknowledgeCurrent;
    goBtn.onclick = async () => {
      await acknowledgeCurrent();
      window.switchView?.('myTrophyCabinet');
    };
  }

  async function initMyTrophyCabinetPanel(){
    const interior = q('myCabinetInterior');
    const stage = q('myCabinetStage');
    if(!interior || !stage) return;

    try{
      const data = await window.IFWL_Api.apiGet('myTrophies');
      myTrophies = data.trophies || [];
    }catch(e){
      interior.innerHTML = `<div class="empty">Could not load your trophies: ${e.message}</div>`;
      return;
    }

    // ✅ ADDED: explain what's locked, matching the upsell pattern used
    // elsewhere on this page rather than leaving Bronze/Silver drivers to
    // guess why a control looks dimmed.
    const isGoldOrStaff = window.IFWL_GOLD || window.IFWL_STAFF;
    const isSilverPlus = window.IFWL_SILVER_PLUS || isGoldOrStaff;
    const upsellBox = q('myCabinetUpsellBox');
    const upsellText = q('myCabinetUpsellText');
    if(upsellBox && upsellText){
      if(isGoldOrStaff){
        upsellBox.classList.add('hidden');
      }else if(isSilverPlus){
        upsellText.textContent = "You can dust off your trophies. Gold Patreon also unlocks individual spotlights on each trophy, in any colour you like.";
        upsellBox.classList.remove('hidden');
      }else{
        upsellText.textContent = "Silver Patreon unlocks dusting off your trophies. Gold Patreon also unlocks individual spotlights on each trophy, in any colour you like.";
        upsellBox.classList.remove('hidden');
      }
    }

    renderLicenceCardTrophies(myTrophies.filter(t => t.showcased));

    if(!myTrophies.length){
      interior.innerHTML = '<div class="empty" style="color:#e8d9b8">No trophies yet - keep racing, your first cabinet piece could be next season!</div>';
    }else{
      interior.innerHTML = myTrophies.map(myTrophyTileHtml).join('');
      wireMyTrophyDragReorder(interior);
      wireMyTrophyTileControls(interior);
    }

    // ✅ ADDED: celebrate any trophy the driver hasn't acknowledged yet -
    // fires regardless of which tab they land on, since this same function
    // already runs on every page load. Queued one at a time so multiple new
    // trophies (e.g. after a busy awards weekend) each get their own moment
    // rather than being silently merged into one notice.
    const newTrophies = myTrophies.filter(t => t.isNew);
    if(newTrophies.length) showTrophyCelebration(newTrophies);

    const openBtn = q('openMyCabinetBtn');
    const closeBtn = q('closeMyCabinetBtn');
    const dustAllBtn = q('dustAllBtn');
    const canDustAll = window.IFWL_SILVER_PLUS || window.IFWL_GOLD || window.IFWL_STAFF;

    openBtn?.addEventListener('click', () => {
      stage.classList.add('open');
      stage.classList.remove('glow-closed'); // no seam glow while open - the interior itself is right there, lit
      openBtn.classList.add('hidden');
      if(myTrophies.length){
        closeBtn?.classList.remove('hidden');
        // ✅ FIXED: Dust Off All had no tier check at all - it ran for
        // every tile regardless of Patreon tier, even though the per-trophy
        // dust button was correctly locked for Bronze. Now hidden entirely
        // unless the driver is actually Silver+.
        if(canDustAll) dustAllBtn?.classList.remove('hidden');
      }
    });
    closeBtn?.addEventListener('click', () => {
      stage.classList.remove('open');
      // If anything's still lit when the doors shut, a bit of that light
      // should leak around the frame and through the seam between them.
      const anyLit = interior.querySelectorAll('.my-trophy-tile.lit').length > 0;
      stage.classList.toggle('glow-closed', anyLit);
      closeBtn.classList.add('hidden');
      dustAllBtn?.classList.add('hidden');
      openBtn?.classList.remove('hidden');
    });
    dustAllBtn?.addEventListener('click', () => {
      if(!canDustAll) return; // server would drop this anyway, but the button shouldn't even be reachable
      const tiles = interior.querySelectorAll('.my-trophy-tile');
      tiles.forEach((tile, i) => setTimeout(() => dustOffTile(tile), i * 150));
      setTimeout(() => saveMyTrophyDisplaySettings(interior), tiles.length * 150 + 950);
    });
  }
  window.initMyTrophyCabinetPanel = initMyTrophyCabinetPanel;

  // Same icon strip shown in the driver-facing popup, so staff see exactly
  // what drivers will see before saving.
  function rdiQuickFactsStripHtml(qf){
    const chips = [];
    if(qf.commentary) chips.push(`🎙️ Commentary: ${qf.commentary === 'yes' ? 'Yes' : 'No'}`);
    if(qf.pitStopRule) chips.push(`🛑 ${qf.pitStopRule}`);
    if(qf.fuelRule) chips.push(`⛽ ${qf.fuelRule}`);
    if(qf.tyreRule) chips.push(`🛞 ${qf.tyreRule}`);
    if(!chips.length) return '';
    return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--ifwl-line)">${chips.map(c => `<span class="tier-pill" style="font-size:12px">${c}</span>`).join('')}</div>`;
  }
  window.rdiQuickFactsStripHtml = rdiQuickFactsStripHtml;

  // ✅ ADDED: fetches the BETA notice banner state and shows/hides it above
  // "Your ACC driver name(s)" on My Licence. Called once at page init (and
  // again right after a staff save, so the change is visible without a
  // refresh) - deliberately separate from the messageTemplates fetch inside
  // showLicenceRefusedGate(), since that one only ever runs for a refused
  // driver and this needs to run for everyone.
  async function applyLicenceBetaNotice(){
    const banner = q('licenceBetaNoticeBanner');
    if(!banner) return;
    try{
      const t = await window.IFWL_Api.apiGet('messageTemplates');
      if(t?.licenceBetaNoticeEnabled && t?.licenceBetaNoticeText){
        banner.textContent = t.licenceBetaNoticeText;
        banner.classList.remove('hidden');
      }else{
        banner.classList.add('hidden');
      }
    }catch(e){ /* fails silently - this is an informational banner, not a gate */ }
  }
  window.applyLicenceBetaNotice = applyLicenceBetaNotice; // same for Commentator/Owner-preview

  // =====================================================================
  // ✅ ADDED: SECRET TERMINAL EASTER EGG - purely cosmetic, no server call,
  // no real password anywhere (there's nothing to check the input
  // against - see secretShowPasswordPrompt below). Owner status is read
  // live off body.owner-access, the same class the rest of the site
  // already gates owner-only UI on (see the two .classList.toggle('owner-access', ...)
  // call sites), so this automatically respects staff "View As" simulation
  // too - simulate a non-owner and this behaves like a non-owner would see
  // it. The trigger is the small teal bullet that already sits in front of
  // "YOUR LICENCE" above the tab bar (see #secretTerminalDot) - it's a
  // real dot people already see every time they open the site, just not
  // one anybody would think to click.
  // =====================================================================
  let secretTerminalRunning = false;

  function secretDelay(ms){ return new Promise(r => setTimeout(r, ms)); }

  function secretAppendLine(html){
    const body = q('secretTerminalBody');
    if(!body) return null;
    const div = document.createElement('div');
    div.className = 'secret-line';
    div.innerHTML = html;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  async function secretDotsLine(label, steps, stepMs){
    const line = secretAppendLine(label);
    for(let i = 1; i <= steps; i++){
      if(line) line.textContent = `${label} ${'.'.repeat(i)}`;
      await secretDelay(stepMs);
    }
    return line;
  }

  // Simple 5x7 block font, hand-built (no external font/ASCII-art library
  // available in this environment) - just "█" and spaces, so it renders
  // identically in any monospace font.
  const SECRET_IFWL_LOGO = [
    '█████ █████ █   █ █    ',
    '  █   █     █   █ █    ',
    '  █   █     █   █ █    ',
    '  █   ████  █ █ █ █    ',
    '  █   █     █ █ █ █    ',
    '  █   █     ██ ██ █    ',
    '█████ █     █   █ █████'
  ];

  async function secretPlayLogo(){
    const wrap = secretAppendLine('');
    if(!wrap) return;
    const pre = document.createElement('pre');
    wrap.appendChild(pre);
    for(const line of SECRET_IFWL_LOGO){
      pre.textContent += line + '\n';
      await secretDelay(90);
    }
  }

  async function runSecretFakeChecks(){
    // The comedic payload - deliberately silly, deliberately fake. Nothing
    // here reads or sends anything real; every "result" is a hardcoded
    // string. This is the whole point of the easter egg.
    const checks = [
      ['CHECKING FOR BANS', 'CLEAR'],
      ['CHECKING AGE', 'VERIFIED'],
      ['IP ADDRESS OBTAINED AND STORED', 'DONE'],
      ['CROSS-REFERENCING DISCORD ACTIVITY', 'COMPLETE'],
      ['COUNTING RACING INCIDENTS', '147 FOUND'],
      ['CALCULATING BLAME PERCENTAGE', '92%'],
      ['CHECKING FRIDGE FOR SNACKS', 'EMPTY'],
      ['NOTIFYING THE STEWARDS', 'SENT']
    ];
    for(const [label, status] of checks){
      const line = secretAppendLine(`${label} ...`);
      await secretDelay(420 + Math.random() * 260);
      if(line) line.innerHTML = `${label} ... <span style="color:#9dffb0">[${status}]</span>`;
      await secretDelay(160);
    }
  }

  // ✅ ADDED: OVERSEER MENU - the real payoff for the owner specifically,
  // once past the joke boot sequence above. Reuses staffSearch,
  // window.IFWL_SimgridAPI and window.IFWL_TierAPI exactly as the real
  // Staff Licence Database / SimGrid Events / Available Races panels
  // already do elsewhere on this page - no new backend endpoints, this
  // just surfaces existing data through the terminal for a quick glance
  // without leaving the easter egg. Never shown to a non-owner - see the
  // isOwner branch in runSecretTerminalSequence below.
  function secretMenuLine(html, onClick){
    const line = secretAppendLine(html);
    if(line && onClick){
      line.classList.add('secret-menu-item');
      line.addEventListener('click', onClick);
    }
    return line;
  }

  function secretClearBody(){
    const body = q('secretTerminalBody');
    if(body) body.innerHTML = '';
  }

  async function secretRenderScreen(title, bodyFn){
    secretClearBody();
    secretAppendLine(`IFWL SECURE TERMINAL &mdash; ${title}`);
    secretAppendLine('&nbsp;');
    await bodyFn();
  }

  async function secretGoToMenu(){
    await secretRenderScreen('OVERSEER MENU', async () => {
      secretMenuLine('[1] UPCOMING RACES', () => secretGoToUpcomingRaces());
      secretMenuLine('[2] LICENCE POPULATION', () => secretGoToTierBreakdown());
      secretMenuLine('[3] LOOKUP A DRIVER', () => secretGoToDriverLookup());
      secretAppendLine('&nbsp;');
      secretMenuLine('[0] DISCONNECT', () => closeSecretTerminal());
    });
  }

  async function secretGoToUpcomingRaces(){
    await secretRenderScreen('UPCOMING RACES', async () => {
      const loading = secretAppendLine('LOADING&hellip;');
      try{
        const events = await window.IFWL_SimgridAPI.fetchAvailableRaces(true);
        loading?.remove();
        const upcoming = (events || []).filter(e => !e.ended).slice(0, 12);
        if(!upcoming.length){
          secretAppendLine('No upcoming races on file.');
        } else {
          upcoming.forEach(e => {
            const when = e.eventDateMs
              ? new Date(e.eventDateMs).toLocaleString([], {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})
              : (e.eventDateLabel || 'No date set');
            const tiers = (e.tiers || []).join(', ') || 'no tiers set';
            const plat = e.platform === 'console' ? 'CONSOLE' : e.platform === 'pc' ? 'PC' : 'PC+CONSOLE';
            secretAppendLine(`[${plat}] ${e.title || '(untitled)'} &mdash; ${when}`);
            secretAppendLine(`&nbsp;&nbsp;&nbsp;&nbsp;tiers: ${tiers}`);
          });
        }
      }catch(err){
        loading?.remove();
        secretAppendLine(`<span style="color:#ff6a6a">Could not load: ${err.message}</span>`);
      }
      secretAppendLine('&nbsp;');
      secretMenuLine('&lt; BACK', () => secretGoToMenu());
    });
  }

  async function secretGoToTierBreakdown(){
    await secretRenderScreen('LICENCE POPULATION', async () => {
      const loading = secretAppendLine('LOADING&hellip;');
      try{
        const [profiles, tierList] = await Promise.all([staffSearch(''), window.IFWL_TierAPI.fetchTierList()]);
        loading?.remove();
        const orderedNames = tierList.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(t => t.name);
        const counts = {};
        profiles.forEach(p => { const t = p.tier || 'No Licence'; counts[t] = (counts[t] || 0) + 1; });
        const rows = orderedNames.slice();
        if(counts['No Licence'] && !rows.includes('No Licence')) rows.push('No Licence');
        const maxCount = Math.max(1, ...rows.map(t => counts[t] || 0));
        rows.forEach(t => {
          const c = counts[t] || 0;
          const barLen = Math.max(0, Math.round((c / maxCount) * 22));
          secretAppendLine(`${t.padEnd(20).slice(0, 20)} ${'█'.repeat(barLen)} ${c}`);
        });
        secretAppendLine('&nbsp;');
        secretAppendLine(`TOTAL LICENSED DRIVERS: ${profiles.length}`);
      }catch(err){
        loading?.remove();
        secretAppendLine(`<span style="color:#ff6a6a">Could not load: ${err.message}</span>`);
      }
      secretAppendLine('&nbsp;');
      secretMenuLine('&lt; BACK', () => secretGoToMenu());
    });
  }

  async function secretGoToDriverLookup(){
    await secretRenderScreen('DRIVER LOOKUP', async () => {
      secretAppendLine('Type a name or licence number, press Enter:');
      const wrap = secretAppendLine('&gt; <input type="text" id="secretLookupInput" autocomplete="off" spellcheck="false">');
      const resultsWrap = secretAppendLine('');
      const input = wrap?.querySelector('#secretLookupInput');
      input?.focus();
      input?.addEventListener('keydown', async (e) => {
        if(e.key !== 'Enter') return;
        const term = input.value.trim();
        resultsWrap.innerHTML = 'Searching&hellip;';
        try{
          const drivers = await staffSearch(term);
          if(!drivers.length){ resultsWrap.innerHTML = 'No matches.'; return; }
          resultsWrap.innerHTML = drivers.slice(0, 12).map(d =>
            `${(d.name || 'Unnamed').padEnd(24).slice(0, 24)} ${(d.tier || 'No Licence').padEnd(20).slice(0, 20)} ${d.licenceNumber || ''}`
          ).join('<br>');
        }catch(err){
          resultsWrap.innerHTML = `<span style="color:#ff6a6a">Search failed: ${err.message}</span>`;
        }
      });
      secretAppendLine('&nbsp;');
      secretMenuLine('&lt; BACK', () => secretGoToMenu());
    });
  }

  function secretShowPasswordPrompt(){
    return new Promise(resolve => {
      const wrap = secretAppendLine('&gt; <input type="password" id="secretPassInput" autocomplete="off" spellcheck="false">');
      if(!wrap){ resolve(); return; }
      const input = wrap.querySelector('#secretPassInput');
      input?.focus();
      input?.addEventListener('keydown', async (e) => {
        if(e.key !== 'Enter' || input.disabled) return;
        input.disabled = true;
        const typedLen = input.value.length || 1;
        wrap.innerHTML = '&gt; ' + '•'.repeat(typedLen);
        await secretDelay(500);
        secretAppendLine('&nbsp;');
        secretAppendLine('<span style="color:#ff6a6a;font-weight:700">ACCESS DENIED</span>');
        await secretDelay(450);
        secretAppendLine('...running background diagnostic anyway...');
        await secretDelay(550);
        await runSecretFakeChecks();
        secretAppendLine('&nbsp;');
        secretAppendLine('<span style="color:#ffd76a;font-weight:700">RELAX - NONE OF THAT WAS REAL.</span>');
        secretAppendLine('You found the easter egg. Nice work. 🥚');
        resolve();
      });
    });
  }

  async function runSecretTerminalSequence(){
    const body = q('secretTerminalBody');
    if(!body) return;
    body.innerHTML = '';

    await secretDelay(250);
    secretAppendLine('IFWL SECURE TERMINAL');
    await secretDelay(350);
    secretAppendLine('INITIALISING&hellip;');
    await secretDelay(450);
    secretAppendLine('&nbsp;');

    await secretPlayLogo();

    await secretDelay(350);
    secretAppendLine('&nbsp;');
    secretAppendLine('IFWL LICENCE CENTRE - ROOT ACCESS MODULE');
    secretAppendLine('&nbsp;');
    await secretDelay(300);

    await secretDotsLine('CHECKING ROLES', 5, 320);
    await secretDelay(300);

    const isOwner = document.body.classList.contains('owner-access');

    if(isOwner){
      secretAppendLine('<span style="color:#9dffb0;font-weight:700">ACCESS GRANTED - WELCOME, OVERSEER</span>');
      await secretDelay(500);
      await runSecretFakeChecks();
      secretAppendLine('&nbsp;');
      secretAppendLine('<span style="color:#9dffb0;font-weight:700">ALL SYSTEMS NOMINAL. HAVE A GOOD ONE, BOSS.</span>');
      await secretDelay(600);
      await secretGoToMenu();
    } else {
      secretAppendLine('<span style="color:#ff6a6a;font-weight:700">CLEARANCE: UNVERIFIED</span>');
      await secretDelay(400);
      secretAppendLine('ENTER OVERRIDE PASSWORD TO CONTINUE:');
      await secretShowPasswordPrompt();
    }
  }

  function openSecretTerminal(){
    const overlay = q('secretTerminal');
    if(!overlay || secretTerminalRunning) return;
    secretTerminalRunning = true;
    overlay.classList.add('active');
    runSecretTerminalSequence().finally(() => { secretTerminalRunning = false; });
  }
  function closeSecretTerminal(){
    q('secretTerminal')?.classList.remove('active');
  }

  q('secretTerminalDot')?.addEventListener('click', openSecretTerminal);
  q('secretTerminalClose')?.addEventListener('click', closeSecretTerminal);
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && q('secretTerminal')?.classList.contains('active')) closeSecretTerminal();
  });
  window.__IFWL_EXTRAS = { demoGet, USE_DEMO_FALLBACK, staffSearch, fetchTrophyCabinet, renderTrophyCabinetEntries, rdiQuickFactsStripHtml, applyLicenceBetaNotice };
})();
