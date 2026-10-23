/* ============================================================
   IFWL KIT: shared pieces that every Licence Centre page loads
   (small on purpose - the big pieces load only when used)
     - the "My Kit" tab in the menu (only when the roll-out includes you)
     - your avatar standing on the licence card (Home), tap for live 3D
     - the one-time "Welcome to your Avatar" tour
     - race podiums (Race Results detail + "Last race" on Home)
   Everything is switched by the Owner (kit roll-out, podiums). While it is
   off for an account, this file adds nothing at all to the page.
   ============================================================ */
(function(){
'use strict';
if(window.IFWL_KIT) return;
var SCRIPT = document.currentScript;
var JS_BASE = SCRIPT && SCRIPT.src ? SCRIPT.src.replace(/[^\/]*$/, '').replace(/\?.*$/, '') : 'assets/js/';
var ASSETS = JS_BASE.replace(/js\/$/, '');
var PAGE = (window.IFWL_PAGE && window.IFWL_PAGE.file) || 'licence.html';
var q = function(id){ return document.getElementById(id); };
var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
var fmt = function(n){ return Number(n || 0).toLocaleString('en-GB'); };

/* ---- stylesheet: fetched only once the kit is switched on for this account, so everyone else downloads nothing extra ---- */
function loadCss(){
  if(document.getElementById('ifwlKitCss')) return;
  var l = document.createElement('link'); l.id = 'ifwlKitCss'; l.rel = 'stylesheet'; l.href = ASSETS + 'css/07-kit.css?v=a6976c57';
  document.head.appendChild(l);
}

/* ---- API (same conventions as the rest of the Licence Centre) ---- */
function FN(){ return (window.IFWL_AUTH && window.IFWL_AUTH.FUNCTION) || 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate'; }
function tok(){ return (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || ''; }
function api(action, query, body){
  var qs = '';
  if(query) Object.keys(query).forEach(function(k){ if(query[k] !== undefined && query[k] !== null) qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); });
  var url = FN() + '?' + action + '=1&token=' + encodeURIComponent(tok()) + qs;
  var opts = body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) };
  return fetch(url, opts).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(d){
      if(!r.ok){ var e = new Error((d && d.error) || ('Request failed (' + r.status + ')')); e.status = r.status; e.body = d; throw e; }
      return d;
    });
  });
}

function onAuth(fn){
  var done = false;
  function go(meta){ if(done || !meta || !tok()) return; done = true; try{ fn(meta); }catch(e){ console.error('kit', e); } }
  if(window.IFWL_META) setTimeout(function(){ go(window.IFWL_META); }, 0);
  window.addEventListener('ifwl-auth-changed', function(e){ go(e.detail && e.detail.meta); });
}

/* ---- the stock figure (white, like the Stig) used when there is no avatar yet ---- */
var STOCK = ASSETS + 'kit/stock-white.png';
var TIER_COLOURS = { 'no licence': '#4b5760', provisional: '#ffb238', 'gt3 beginner': '#1fd6bd', 'gt3 amateur': '#c65be8', 'gt3 pro': '#eaf3ff' };
function tierColour(name){
  var k = String(name || '').toLowerCase();
  if(window.IFWL_TIER_LIST){ for(var i = 0; i < window.IFWL_TIER_LIST.length; i++){ var t = window.IFWL_TIER_LIST[i]; if(String(t.name).toLowerCase() === k && t.color) return t.color; } }
  return TIER_COLOURS[k] || '';
}

/* =====================================================================
   PODIUM
   ===================================================================== */
function figureHtml(r, cls){
  var url = r.avatar && (r.avatar.urlSmall || r.avatar.url);
  if(url) return '<img class="kit-pfig ' + cls + '" src="' + esc(url) + '" alt="' + esc(r.displayName) + '" loading="lazy" width="90" height="150">';
  var glow = r.stock === 'tier' ? tierColour(r.tier) : '';
  return '<img class="kit-pfig stock ' + cls + '" src="' + esc(STOCK) + '" alt="' + esc(r.displayName) + '" loading="lazy" width="90" height="150"' + (glow ? ' style="filter:drop-shadow(0 0 7px ' + esc(glow) + ')"' : '') + '>';
}
function podiumColumn(r, place){
  if(!r) return '<div class="kit-pcol empty"></div>';
  var cls = place === 1 ? 'p1' : place === 2 ? 'p2' : 'p3';
  return '<div class="kit-pcol ' + cls + '">'
    + '<div class="kit-pfigwrap">' + figureHtml(r, cls) + '</div>'
    + '<div class="kit-pname" title="' + esc(r.displayName) + '">' + esc(r.displayName) + '</div>'
    + '<div class="kit-pcar">' + esc(r.car || '') + '</div>'
    + '<div class="kit-pplinth ' + cls + '"><span>' + place + '</span></div></div>';
}
function renderPodium(host, podium, opts){
  opts = opts || {};
  if(!host) return;
  if(!podium || !podium.groups || !podium.groups.length){ host.innerHTML = ''; return; }
  var head = opts.title === false ? '' : '<div class="kit-podium-head"><strong>' + esc(opts.title || 'Podium') + '</strong>' + (podium.track ? '<span>' + esc(podium.track) + (podium.dateIso ? ' &middot; ' + esc(String(podium.dateIso).slice(0, 10)) : '') + '</span>' : '') + '</div>';
  var groups = podium.groups.map(function(g){
    var by = {}; g.podium.forEach(function(r){ by[r.pos] = r; });
    return '<div class="kit-pgroup">' + (podium.groups.length > 1 || g.label !== 'Overall' ? '<h4>' + esc(g.label) + '</h4>' : '')
      + '<div class="kit-pstage">' + podiumColumn(by[2], 2) + podiumColumn(by[1], 1) + podiumColumn(by[3], 3) + '</div></div>';
  }).join('');
  host.innerHTML = head + '<div class="kit-podium">' + groups + '</div>';
}
function loadPodium(file){
  return api('racePodium', file ? { file: file } : { latest: 1 }).then(function(d){ return d.podium; });
}

/* =====================================================================
   3D VIEWER (opens Kit Studio in view-only mode inside a pop-up)
   ===================================================================== */
function imageUrlsFor(entries, base){
  var ids = Object.keys(entries || {}), out = {};
  return Promise.all(ids.map(function(id){
    return api('kitImage', Object.assign({ imgId: id }, base)).then(function(d){ out[id] = d.dataUrl; }).catch(function(){});
  })).then(function(){ return out; });
}
function openViewer(opts){
  /* opts: { title, kit:{suit,helmet,suitImages,helmetImages}, equippedItems, view:{item,pose,helmet}, itemId } */
  var ov = document.createElement('div'); ov.className = 'kit-modal kit-viewer';
  ov.innerHTML = '<div class="kit-modal-box"><button class="kit-x" type="button" aria-label="Close">&times;</button><div class="kit-viewer-title">' + esc(opts.title || 'Your avatar') + '</div><div class="kit-viewer-stage"><div class="kit-viewer-load">Loading the 3D view&hellip;</div><iframe title="3D view" allow="fullscreen"></iframe></div><div class="kit-viewer-hint">Drag to turn. Scroll or pinch to zoom.</div></div>';
  document.body.appendChild(ov);
  var iframe = ov.querySelector('iframe'), load = ov.querySelector('.kit-viewer-load');
  function close(){ window.removeEventListener('message', onMsg); ov.remove(); }
  ov.querySelector('.kit-x').onclick = close; ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
  function onMsg(e){
    if(e.origin !== location.origin || e.source !== iframe.contentWindow) return;
    var m = e.data; if(!m || m.ifwl !== 'kit') return;
    if(m.t === 'ready'){
      var kit = opts.kit || {}, eq = {};
      var jobs = [];
      if(opts.itemId){
        /* one collected item: its frozen design and images */
        var it = opts.item;
        eq[it.type] = { id: it.id, title: it.title, design: it.snapshot.design, images: {} };
        jobs.push(imageUrlsFor(it.snapshot.images, { itemId: it.id }).then(function(map){ eq[it.type].images = map; }));
        kit = {};
      } else {
        ['suit', 'helmet'].forEach(function(t){
          var w = opts.equippedItems && opts.equippedItems[t];
          if(w){ eq[t] = { id: w.id, title: w.title, design: w.design, images: {} }; jobs.push(imageUrlsFor(w.images, { itemId: w.id }).then(function(map){ eq[t].images = map; })); }
          else if(kit[t + 'Images'] && Object.keys(kit[t + 'Images']).length){ jobs.push(imageUrlsFor(kit[t + 'Images'], { type: t }).then(function(map){ kit = Object.assign({}, kit); kit[t + 'Images'] = map; })); }
        });
      }
      Promise.all(jobs).then(function(){
        load.style.display = 'none';
        iframe.contentWindow.postMessage({ ifwl: 'kit', t: 'init', mode: 'full', kit: kit, equipped: eq, view: opts.view || { item: 'suit', pose: 'crossed' } }, location.origin);
      });
    }
  }
  window.addEventListener('message', onMsg);
  iframe.src = ASSETS.replace(/assets\/$/, '') + 'kit-studio.html?lic=1';
  return { close: close };
}

/* =====================================================================
   WELCOME TOUR
   ===================================================================== */
function openTour(opts){
  opts = opts || {};
  var steps = [
    { h: 'Welcome to your IFWL avatar', p: 'Every driver now has a racing avatar: a figure in your own race suit and helmet. Choose your colours once and it becomes you across the Licence Centre.', img: true },
    { h: 'Where you will see it', p: 'It stands on your licence card (tap it for a live 3D view) and, when you finish on a race podium, it stands there too beside everyone else. Drivers who have not set one up yet appear as the plain white figure.', img: true },
    { h: 'How to design it', p: 'Open My Kit in the menu. Every driver can pick colours and ready-made colour schemes for the helmet and the suit. Gold Patreon members get the full designer: layouts, patterns, finishes, your own logos, text and shapes.', img: false },
    { h: 'Collect, wear and sell', p: opts.selling ? 'Gold members can create one-of-a-kind helmets and suits and sell them for career credits. Anyone can buy, wear and resell what others make. The Kit wallet is yours for good: your helmets, suits and the credits you earn here carry over season after season.' : 'Soon: Gold members will be able to create one-of-a-kind helmets and suits and sell them for career credits, and everyone will be able to collect and wear them. Your Kit wallet and everything in it will carry over season after season.', img: false }
  ];
  var i = 0, ov = document.createElement('div'); ov.className = 'kit-modal kit-tour'; document.body.appendChild(ov);
  function done(go){
    ov.remove();
    if(!opts.replay) api('kitWelcomeSeen', {}, {}).catch(function(){});
    if(go && !opts.onKitPage) location.href = 'licence-kit.html';
  }
  function draw(){
    var s = steps[i], last = i === steps.length - 1;
    ov.innerHTML = '<div class="kit-modal-box kit-tour-box"><div class="kit-tour-fig">' + (s.img ? '<img src="' + esc(STOCK) + '" alt="" width="90" height="150">' : '<div class="kit-tour-swatches"><i></i><i></i><i></i></div>') + '</div>'
      + '<div class="kit-tour-body"><div class="kit-tour-step">' + (i + 1) + ' of ' + steps.length + '</div><h3>' + esc(s.h) + '</h3><p>' + esc(s.p) + '</p>'
      + '<div class="kit-tour-actions"><button class="btn ghost" type="button" data-a="skip">' + (last ? 'Close' : 'Skip') + '</button>' + (i ? '<button class="btn ghost" type="button" data-a="back">Back</button>' : '')
      + (last ? '<button class="btn teal" type="button" data-a="go">' + (opts.onKitPage ? 'Start designing' : 'Design my avatar') + '</button>' : '<button class="btn teal" type="button" data-a="next">Next</button>') + '</div></div></div>';
    ov.querySelectorAll('[data-a]').forEach(function(b){ b.onclick = function(){ var a = b.getAttribute('data-a'); if(a === 'next'){ i++; draw(); } else if(a === 'back'){ i--; draw(); } else if(a === 'go') done(true); else done(false); }; });
  }
  draw();
  return { close: function(){ done(false); } };
}

/* =====================================================================
   NAV TAB
   ===================================================================== */
function addNavTab(){
  var tabs = q('viewTabs'); if(!tabs || q('navKitBtn')) return;
  var b = document.createElement('button'); b.type = 'button'; b.id = 'navKitBtn'; b.className = 'view-tab logged-in-tab' + (PAGE === 'licence-kit.html' ? ' active' : ''); b.textContent = 'My Kit';
  b.addEventListener('click', function(){ if(PAGE !== 'licence-kit.html') location.href = 'licence-kit.html'; });
  var anchor = tabs.querySelector('[data-view="availableRaces"]');
  if(anchor && anchor.nextSibling) tabs.insertBefore(b, anchor.nextSibling); else tabs.appendChild(b);
}

/* =====================================================================
   HOME: avatar on the licence card, last race podium, welcome tour
   ===================================================================== */
function setupCard(state){
  var outer = q('licenceCardOuter'), inner = q('licenceCardInner'); if(!outer || !inner || q('kitAvatarBtn')) return;
  var has = !!state.avatarSmallUrl || !!state.avatarUrl;
  var b = document.createElement('button'); b.type = 'button'; b.id = 'kitAvatarBtn'; b.className = 'kit-avatar-btn' + (has ? '' : ' ghost');
  b.title = has ? 'Tap for your avatar in 3D' : 'Design your avatar';
  b.innerHTML = '<img src="' + esc(has ? (state.avatarSmallUrl || state.avatarUrl) : STOCK) + '" alt="Your avatar" width="91" height="152">' + (has ? '' : '<span class="kit-avatar-cta">Design yours</span>');
  inner.appendChild(b); inner.classList.add('kit-has-avatar');
  b.addEventListener('click', function(){
    if(!has){ location.href = 'licence-kit.html'; return; }
    openViewer({ title: 'Your avatar', kit: state.kit, equippedItems: state.equippedItems, view: { item: 'suit', pose: 'crossed' } });
  });
}
function setupLastRace(){
  var host = q('nextRacePanel'); if(!host || q('kitLastRacePanel')) return;
  loadPodium(null).then(function(pod){
    if(!pod || !pod.groups || !pod.groups.length) return;
    var s = document.createElement('section'); s.className = 'panel view-panel' + (host.classList.contains('is-active-view') ? ' is-active-view' : ''); s.setAttribute('data-view', 'home'); s.id = 'kitLastRacePanel';
    s.innerHTML = '<div class="panel-head"><div><h3>Last race podium</h3><small>' + esc(pod.track || '') + '</small></div></div><div class="panel-body"><div id="kitLastRaceBody"></div></div>';
    host.parentNode.insertBefore(s, host.nextSibling);
    renderPodium(q('kitLastRaceBody'), pod, { title: false });
  }).catch(function(){});
}
/* the Licence Centre has its own pop-ups (rules, season checklist, notices...). Wait until none is open so two never stack. */
var BLOCKERS = ['ifwlLoginWall', 'rulesGateWall', 'ticketNoticeModal', 'inboxNoticeModal', 'licencePointsNoticeModal', 'ownerClauseModal', 'seasonChecklistModal', 'trophyAwardModal', 'rankChangeModal', 'racedayInfoModal', 'ticketGuidanceModal'];
function popupOpen(){
  if(document.body.classList.contains('login-wall-open')) return true;
  for(var i = 0; i < BLOCKERS.length; i++){ var e = q(BLOCKERS[i]); if(e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none') return true; }
  return !!document.querySelector('.kit-modal');
}
function whenClear(fn, maxMs){
  var t0 = Date.now(), calm = 0;
  (function tick(){
    if(Date.now() - t0 > (maxMs || 600000)) return;
    if(popupOpen()) calm = 0; else calm++;
    if(calm >= 2) return fn();
    setTimeout(tick, 1200);
  })();
}
function setupHome(state){
  setupCard(state);
  if(state.podiumsOpen) setupLastRace();
  if(state.showWelcome) setTimeout(function(){ whenClear(function(){ openTour({ selling: !!(state.selling && state.selling.open) }); }); }, 1500);
}

/* =====================================================================
   RACE RESULTS: podium above the table of one race
   ===================================================================== */
function setupResults(){
  var stats = window.IFWLStats; if(!stats || typeof stats.loadRaceDetail !== 'function') return;
  var orig = stats.loadRaceDetail, last = '';
  stats.loadRaceDetail = function(file){ last = file; return orig.apply(this, arguments); };
  var wrap = q('raceDetailWrap'); if(!wrap) return;
  new MutationObserver(function(){
    if(!last || wrap.querySelector('.kit-podium-wrap')) return;
    var title = wrap.querySelector('.titlebar'); if(!title) return;
    var file = last, holder = document.createElement('div'); holder.className = 'kit-podium-wrap'; holder.setAttribute('data-file', file);
    title.parentNode.insertBefore(holder, title.nextSibling);
    loadPodium(file).then(function(pod){ if(holder.getAttribute('data-file') === file) renderPodium(holder, pod, { title: 'Podium' }); }).catch(function(){ holder.remove(); });
  }).observe(wrap, { childList: true });
}

/* =====================================================================
   START
   ===================================================================== */
var state = null;
window.IFWL_KIT = { whenClear: whenClear, loadCss: loadCss, api: api, esc: esc, fmt: fmt, onAuth: onAuth, renderPodium: renderPodium, loadPodium: loadPodium, openViewer: openViewer, openTour: openTour, imageUrlsFor: imageUrlsFor, STOCK: STOCK, tierColour: tierColour, ASSETS: ASSETS, tok: tok };
onAuth(function(meta){
  var full = PAGE === 'licence-home.html' || PAGE === 'licence.html';
  (full ? api('kitGet') : api('kitSettingsGet')).then(function(d){
    state = d; window.IFWL_KIT.state = d;
    if(!d.enabled) return;
    loadCss(); addNavTab();
    if(PAGE === 'licence-home.html' || PAGE === 'licence.html') setupHome(d);
    if((PAGE === 'licence-results.html' || PAGE === 'licence.html') && (d.podiumsOpen !== false)) setupResults();
    window.dispatchEvent(new CustomEvent('ifwl-kit-ready', { detail: d }));
  }).catch(function(){ /* the kit is optional: never break the page */ });
});
})();
