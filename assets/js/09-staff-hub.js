/* IFWL Staff Hub - front-end only (licence-staff.html).
   Builds boxes for every staff tool from the existing Staff menu, so the list of tools and the role rules
   (Owner / Ops / Head Moderator) always come from the original buttons. Opening a tool clicks that original
   button, so every staff screen behaves exactly as it always did. No server calls are made here. */
(function(){
  'use strict';
  (window.IFWL_FILES = window.IFWL_FILES || {})['09-staff-hub.js'] = 'p3s2';

  var ICONS = {
    drivers: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    season:  '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    events:  '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h13l-2.5 4L18 12H5"/></svg>',
    teams:   '<svg viewBox="0 0 24 24"><path d="M8 4h8v6a4 4 0 0 1-8 0V4zM8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 14v4M8 21h8"/></svg>',
    comms:   '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4V5z"/></svg>',
    economy: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2A2.7 2 0 0 1 9.5 15M12 6v1.5M12 16.5V18"/></svg>',
    eye:     '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
  var STAR = '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/></svg>';
  var SEED = ['staffSimgridEvents', 'staffRacedayInfo', 'staffAcRallyEvents', 'staffRlEvents'];
  var MAX_RECENT = 6;

  var catalog = null, byView = {}, S = { q: '', st: { m: 'root' } }, busy = false, pending = null;
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var slug = function(s){ return String(s).toLowerCase().replace(/&amp;|&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var isStaff = function(){ return document.body.classList.contains('staff-access'); };

  /* ---- per-person favourites / recents (this browser only) ---- */
  function uid(){ try{ return String(window.IFWL_AUTH.userId(window.IFWL_META) || ''); }catch(e){ return ''; } }
  function key(n){ var u = uid(); return 'IFWL_STAFF_' + n + (u ? ':' + u : ''); }
  function load(n, def){ try{ var v = localStorage.getItem(key(n)); return v == null ? def : JSON.parse(v); }catch(e){ return def; } }
  function save(n, v){ try{ localStorage.setItem(key(n), JSON.stringify(v)); }catch(e){} }
  function favs(){ var f = load('FAVS', null); if(!Array.isArray(f)){ f = SEED.slice(); save('FAVS', f); } return f; }
  function isFav(v){ return favs().indexOf(v) >= 0; }
  function toggleFav(v){ var f = favs(), i = f.indexOf(v); if(i >= 0) f.splice(i, 1); else f.push(v); save('FAVS', f); }
  function recents(){ var r = load('RECENT', []); return Array.isArray(r) ? r : []; }
  function addRecent(v){ var r = recents().filter(function(x){ return x !== v; }); r.unshift(v); save('RECENT', r.slice(0, MAX_RECENT)); }

  /* ---- the tool list is read from the original Staff menu ---- */
  function iconFor(title){
    var t = title.toLowerCase();
    return /driver|licen/.test(t) ? 'drivers' : /season|qualif/.test(t) ? 'season' : /event|race/.test(t) ? 'events' : /team|troph/.test(t) ? 'teams' : /comm|site/.test(t) ? 'comms' : /econom/.test(t) ? 'economy' : 'eye';
  }
  function readCatalog(){
    var menu = document.querySelector('.staff-accordion-menu'), groups = [];
    if(!menu) return groups;
    function mk(b, g){ var t = { view: b.getAttribute('data-view'), label: b.textContent.replace(/\s+/g, ' ').trim(), btn: b, group: g }; byView[t.view] = t; return t; }
    menu.querySelectorAll('.staff-accordion-group').forEach(function(d){
      var title = ((d.querySelector('summary') || {}).textContent || '').replace(/\s+/g, ' ').trim();
      var g = { id: slug(title), title: title, icon: iconFor(title), tools: [] };
      d.querySelectorAll('.staff-accordion-items button[data-view]').forEach(function(b){ g.tools.push(mk(b, g)); });
      groups.push(g);
    });
    var more = { id: 'preview', title: 'Preview', icon: 'eye', tools: [] };
    menu.querySelectorAll(':scope > button[data-view]').forEach(function(b){ more.tools.push(mk(b, more)); });
    if(more.tools.length) groups.push(more);
    return groups;
  }
  function onPage(v){ var P = window.IFWL_PAGE; return !P || !P.views || P.views.indexOf(v) >= 0; }
  function can(t){ try{ return getComputedStyle(t.btn).display !== 'none'; }catch(e){ return true; } }
  function visibleTools(g){ return g.tools.filter(can); }
  function groupById(id){ for(var i = 0; i < catalog.length; i++) if(catalog[i].id === id) return catalog[i]; return null; }

  /* ---- rendering ---- */
  function tileHtml(t, ctx){
    var fav = isFav(t.view);
    return '<div class="sh-tile" role="button" tabindex="0" data-open="' + esc(t.view) + '">' +
      '<span class="sh-ico">' + ICONS[t.group.icon] + '</span>' +
      '<div class="sh-txt"><div class="sh-name">' + esc(t.label) + '</div>' + (ctx ? '<div class="sh-meta">' + esc(t.group.title) + '</div>' : '') + '</div>' +
      '<button type="button" class="sh-star" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remove from favourites: ' : 'Add to favourites: ') + esc(t.label) + '" data-star="' + esc(t.view) + '">' + STAR + '</button></div>';
  }
  function groupHtml(g){
    var vt = visibleTools(g), names = vt.slice(0, 4).map(function(t){ return t.label; }).join(', ') + (vt.length > 4 ? ' and more' : '');
    return '<div class="sh-group" role="button" tabindex="0" data-group="' + esc(g.id) + '"><span class="sh-ico">' + ICONS[g.icon] + '</span>' +
      '<div class="sh-txt"><div class="sh-name">' + esc(g.title) + '</div><div class="sh-meta">' + esc(names) + '</div></div><span class="sh-badge">' + vt.length + '</span></div>';
  }
  function allVisible(){ var out = []; catalog.forEach(function(g){ out = out.concat(visibleTools(g)); }); return out; }

  function renderBody(){
    var body = $('shBody'); if(!body) return;
    var q = S.q.trim().toLowerCase(), html = '';
    if(q){
      var words = q.split(/\s+/), res = allVisible().filter(function(t){ var hay = (t.label + ' ' + t.group.title).toLowerCase(); return words.every(function(w){ return hay.indexOf(w) >= 0; }); });
      html = res.length ? '<div class="sh-section"><h3>Results <span class="sh-count">' + res.length + '</span></h3><div class="sh-grid">' + res.map(function(t){ return tileHtml(t, true); }).join('') + '</div></div>'
        : '<div class="sh-section"><div class="sh-empty">No staff tool matches &ldquo;' + esc(S.q) + '&rdquo;. Try fewer letters.</div></div>';
      body.innerHTML = html; return;
    }
    var fv = favs().map(function(v){ return byView[v]; }).filter(function(t){ return t && can(t); });
    html += '<div class="sh-section"><h3>Favourites <span class="sh-count">' + fv.length + '</span></h3>' +
      (fv.length ? '<div class="sh-grid">' + fv.map(function(t){ return tileHtml(t, true); }).join('') + '</div>'
        : '<div class="sh-empty">Nothing pinned yet. Tap the star on any tool and it will appear here, just for you.</div>') + '</div>';
    var rc = recents().map(function(v){ return byView[v]; }).filter(function(t){ return t && can(t); }).slice(0, 4);
    if(rc.length) html += '<div class="sh-section"><h3>Recently used</h3><div class="sh-grid">' + rc.map(function(t){ return tileHtml(t, true); }).join('') + '</div></div>';
    var gs = catalog.filter(function(g){ return visibleTools(g).length; });
    html += '<div class="sh-section"><h3>All staff tools</h3><div class="sh-grid sh-groups">' + gs.map(groupHtml).join('') + '</div></div>';
    body.innerHTML = html;
  }

  function render(){
    var root = $('staffHubRoot'); if(!root) return;
    if(!catalog) catalog = readCatalog();
    if(!isStaff()){ root.innerHTML = '<div class="sh-staffonly"><h2 class="sh-title">Staff Hub</h2><p>This area is for IFWL staff. Log in with a staff account to see it.</p></div>'; return; }
    if(S.st.m === 'group' && groupById(S.st.g)){
      var g = groupById(S.st.g), vt = visibleTools(g);
      root.innerHTML = '<div class="sh-crumbs"><button type="button" data-back="1">&larr; Staff Hub</button><span class="sh-sep">&rsaquo;</span><span class="sh-here">' + esc(g.title) + '</span></div>' +
        '<div class="sh-gtitle"><span class="sh-ico">' + ICONS[g.icon] + '</span><h2>' + esc(g.title) + '</h2></div>' +
        '<p class="sh-sub">' + vt.length + ' tool' + (vt.length === 1 ? '' : 's') + ' &middot; tap one to open it, tap the star to pin it to your Favourites.</p>' +
        '<div class="sh-section"><div class="sh-grid">' + vt.map(function(t){ return tileHtml(t, false); }).join('') + '</div></div>';
      return;
    }
    var val = S.q;
    root.innerHTML = '<div class="sh-head"><div><h2 class="sh-title">Staff Hub</h2><p class="sh-sub">Everything staff need, in one place. Pin the tools you use most.</p></div>' +
      '<label class="sh-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="shSearch" type="search" placeholder="Find a tool (press / to search)" autocomplete="off" aria-label="Find a staff tool"></label></div><div id="shBody"></div>';
    $('shSearch').value = val || ''; S.q = val || '';
    renderBody();
  }

  function crumbBar(view){
    var bar = $('staffCrumbBar'); if(!bar) return;
    var t = byView[view];
    if(!t || !isStaff()){ bar.className = ''; bar.innerHTML = ''; return; }
    var fav = isFav(view);
    bar.className = 'on';
    bar.innerHTML = '<div class="sh-crumbs"><button type="button" class="sh-back" data-back="1">&larr; Staff Hub</button><span class="sh-sep">&rsaquo;</span>' +
      '<button type="button" data-group="' + esc(t.group.id) + '">' + esc(t.group.title) + '</button><span class="sh-sep">&rsaquo;</span><span class="sh-here">' + esc(t.label) + '</span></div>' +
      '<button type="button" class="sh-star" aria-pressed="' + fav + '" title="' + (fav ? 'Remove from favourites' : 'Add to favourites') + '" aria-label="Favourite: ' + esc(t.label) + '" data-star="' + esc(view) + '">' + STAR + '</button>';
  }

  /* ---- navigation state (browser Back works) ---- */
  function urlFor(st){ var p = location.pathname; return st.m === 'tool' ? p + '?view=' + encodeURIComponent(st.v) : st.m === 'group' ? p + '?group=' + encodeURIComponent(st.g) : p; }
  function setTab(){
    var tab = document.querySelector('#viewTabs > .view-tab[data-view="staffHub"]');
    if(tab) tab.classList.add('active');
  }
  function toContent(){
    var el = (S.st.m === 'tool' && $('staffCrumbBar') && $('staffCrumbBar').classList.contains('on')) ? $('staffCrumbBar') : $('staffHubPanel');
    if(!el) return;
    var y = el.getBoundingClientRect().top + (window.pageYOffset || 0) - 110;
    try{ window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }catch(e){ window.scrollTo(0, Math.max(0, y)); }
  }
  function apply(st){
    if(!catalog) catalog = readCatalog();
    S.st = st; busy = true;
    try{
      /* the original menu button does the switch (staff code listens to clicks on it to load its data) */
      if(st.m === 'tool' && byView[st.v]){ try{ byView[st.v].btn.click(); }catch(e){ window.switchView(st.v); } crumbBar(st.v); }
      else { if(st.m === 'tool') S.st = { m: 'root' }; window.switchView('staffHub'); crumbBar(null); render(); }
    }finally{ setTimeout(function(){ busy = false; setTab(); toContent(); }, 0); }
  }
  function navigate(st, replace){
    try{ if(replace) history.replaceState(st, '', urlFor(st)); else history.pushState(st, '', urlFor(st)); }catch(e){}
    apply(st);
  }
  /* called by switchView (through the page route hook) every time any view is shown */
  function onView(view){
    if(busy) return;
    if(!catalog) catalog = readCatalog();
    if(byView[view]){
      if(!(S.st.m === 'tool' && S.st.v === view)){
        S.st = { m: 'tool', v: view };
        try{ history.pushState(S.st, '', urlFor(S.st)); }catch(e){}
        addRecent(view);
      }
      crumbBar(view); setTab();
    }else if(view === 'staffHub'){
      if(S.st.m !== 'root'){ S.st = { m: 'root' }; S.q = ''; try{ history.pushState(S.st, '', urlFor(S.st)); }catch(e){} }
      crumbBar(null); render(); setTab();
    }
  }
  function openTool(view){
    if(!byView[view]) return;
    addRecent(view);
    /* a tool that lives on another page (Drivers to Watch preview) just takes you there through the original button */
    if(!onPage(view)){ try{ byView[view].btn.click(); }catch(e){} return; }
    navigate({ m: 'tool', v: view });
  }

  /* ---- events ---- */
  function onClick(e){
    var el = e.target;
    var star = el.closest('[data-star]');
    if(star){ e.stopPropagation(); toggleFav(star.getAttribute('data-star')); var v = star.getAttribute('data-star');
      if(S.st.m === 'tool') crumbBar(S.st.v);
      if($('staffHubRoot') && $('staffHubRoot').contains(star)){ if(S.st.m === 'group') render(); else renderBody(); }
      return; }
    if(el.closest('[data-back]')){ S.q = ''; navigate({ m: 'root' }); return; }
    var g = el.closest('[data-group]');
    if(g){ navigate({ m: 'group', g: g.getAttribute('data-group') }); return; }
    var o = el.closest('[data-open]');
    if(o){ openTool(o.getAttribute('data-open')); }
  }
  function onKey(e){
    if((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button]')){ e.preventDefault(); e.target.click(); return; }
    if(e.target.id === 'shSearch'){
      if(e.key === 'Escape'){ e.target.value = ''; S.q = ''; renderBody(); }
      else if(e.key === 'Enter'){ var first = document.querySelector('#shBody [data-open]'); if(first) openTool(first.getAttribute('data-open')); }
      return;
    }
    if(e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) && !e.target.isContentEditable){
      var s = $('shSearch'); var panel = $('staffHubPanel');
      if(s && panel && panel.classList.contains('is-active-view')){ e.preventDefault(); s.focus(); s.select(); }
    }
  }
  function stateFromUrl(){
    var p; try{ p = new URLSearchParams(location.search); }catch(e){ return { m: 'root' }; }
    var v = p.get('view'), g = p.get('group');
    if(v && /^[A-Za-z]+$/.test(v)) return { m: 'tool', v: v };
    if(g && /^[a-z0-9-]+$/.test(g)) return { m: 'group', g: g };
    return { m: 'root' };
  }
  function onAccess(){
    if(!catalog) catalog = readCatalog();
    if(pending && isStaff()){
      var st = pending; pending = null;
      if(st.m === 'tool' && byView[st.v] && onPage(st.v) && can(byView[st.v])) { navigate(st, true); addRecent(st.v); return; }
      if(st.m === 'group' && groupById(st.g)) { navigate(st, true); return; }
    }
    /* roles changed (login, View As): keep what is on screen valid */
    if(S.st.m === 'tool' && (!byView[S.st.v] || !can(byView[S.st.v]) || !isStaff())){ navigate({ m: 'root' }, true); return; }
    var panel = $('staffHubPanel');
    if(panel && panel.classList.contains('is-active-view')) render();
    else if(S.st.m === 'tool') crumbBar(S.st.v);
  }
  function init(){
    catalog = readCatalog();
    var root = $('staffHubRoot'), bar = $('staffCrumbBar');
    if(!root) return;
    S.st = { m: 'root' };
    var want = stateFromUrl();
    pending = want.m === 'root' ? null : want;
    try{ history.replaceState({ m: 'root' }, '', location.pathname + (pending ? location.search : '')); }catch(e){}
    try{ var hd = $('mainTitlebarHeading'); if(hd){ var tn = null; hd.childNodes.forEach(function(n){ if(n.nodeType === 3) tn = n; }); if(tn) tn.nodeValue = ' STAFF HUB'; } }catch(e){}
    root.addEventListener('click', onClick);
    if(bar) bar.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    root.addEventListener('input', function(e){ if(e.target.id === 'shSearch'){ S.q = e.target.value; renderBody(); } });
    window.addEventListener('popstate', function(e){
      var st = (e.state && e.state.m) ? e.state : stateFromUrl();
      if(st.m === 'tool' && !(byView[st.v] && onPage(st.v) && can(byView[st.v]))) st = { m: 'root' };
      apply(st);
    });
    new MutationObserver(onAccess).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('ifwl-auth-changed', function(){ setTimeout(onAccess, 50); });
    render(); setTab(); onAccess();
  }
  window.IFWL_STAFF_HUB = { onView: onView, init: init };
  init();
})();
