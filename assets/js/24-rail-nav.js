/* IFWL icon-rail menu - front-end only (home page test).
   Builds a left-hand icon rail + slide-out panel from the ORIGINAL menu (#viewTabs), so the list of pages, the
   role rules (staff / owner / ops / logged-in / Silver+) and every click handler stay exactly as they were.
   Choosing an item clicks the original button. No server calls are made here.
   Switch back to the old menu any time with ?classic=1 (and ?classic=0 to return). */
(function(){
  'use strict';
  if(window.IFWL_RAIL) return;
  window.IFWL_RAIL = true;
  (window.IFWL_FILES = window.IFWL_FILES || {})['24-rail-nav.js'] = 'r1';

  var KEY = 'IFWL_CLASSIC_NAV';
  function getClassic(){ try{ return localStorage.getItem(KEY) === '1'; }catch(e){ return false; } }
  function setClassic(on){ try{ if(on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); }catch(e){} }
  if(/[?&]classic=1/.test(location.search)) setClassic(true);
  if(/[?&]classic=0/.test(location.search)) setClassic(false);

  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var ICON = {
    home:  '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    lic:   '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.8 5.5-1.8 6 0M14 10h4M14 14h3"/>',
    race:  '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
    kit:   '<path d="M3 14a9 9 0 0 1 18 0v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M11 12h10M11 12v7"/>',
    trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
    tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    help:  '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.9 4.9 4.3 4.3M14.8 14.8l4.3 4.3M19.1 4.9l-4.3 4.3M9.2 14.8l-4.3 4.3"/>',
    team:  '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5"/>',
    staff: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>'
  };
  var svg = function(k){ return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>'; };

  var bar = null, rail = null, fly = null, scrim = null, chip = null;
  var secs = [], current = null, openId = null, queued = false;

  function tidy(el){
    var c = el.cloneNode(true);
    c.querySelectorAll('.inbox-unread-badge').forEach(function(b){ b.remove(); });
    return (c.textContent || '').replace(/[▾▸]/g, '').replace(/\s+/g, ' ').trim();
  }
  /* is a menu button actually allowed for this person? (the role rules hide the button or its group) */
  function vis(el, skip){
    for(var n = el; n && n !== bar; n = n.parentElement){
      if(skip && n === skip) continue;
      if(n.classList && (n.classList.contains('view-tab-menu') || n.classList.contains('staff-accordion-items'))) continue;
      if(n.tagName === 'DETAILS') continue;
      try{ if(getComputedStyle(n).display === 'none') return false; }catch(e){}
    }
    return true;
  }
  function tagOf(el){
    var c = el.classList, t = [];
    if(c.contains('owner-only-tab')) t.push('Owner');
    if(c.contains('ops-only-tab')) t.push('Ops');
    if(c.contains('headmod-only-tab')) t.push('Head Mod');
    if(c.contains('ops-or-headmod-tab')) t.push('Ops / Head Mod');
    if(c.contains('silver-only-field')) t.push('Silver+');
    if(c.contains('commentator-only-tab')) t.push('Commentators');
    return t.join(' / ');
  }
  function badgeOf(el){
    var b = el.querySelector && el.querySelector('.inbox-unread-badge');
    if(b && !b.classList.contains('hidden') && (b.textContent || '').trim() && (b.textContent || '').trim() !== '0') return b.textContent.trim();
    return '';
  }
  function item(el, label){ return { el: el, label: label || tidy(el), tag: tagOf(el), badge: badgeOf(el) }; }
  function viewItem(view, label){ return { view: view, label: label, tag: '', badge: '' }; }
  function buttonsIn(root, skip){
    var out = [];
    if(!root) return out;
    root.querySelectorAll('button').forEach(function(b){ if(vis(b, skip) && tidy(b)) out.push(item(b)); });
    return out;
  }

  function dropdown(name){
    var found = null;
    if(!bar) return null;
    bar.querySelectorAll(':scope > .view-tab-dropdown').forEach(function(d){
      var t = d.querySelector('.dropdown-toggle');
      if(t && tidy(t).toLowerCase().indexOf(name) === 0) found = d;
    });
    return found && vis(found) ? found : null;
  }
  function direct(sel){ var e = bar && bar.querySelector(sel); return e && vis(e) ? e : null; }
  function pick(root, sel){ var e = root && root.querySelector(sel); return e && vis(e) ? item(e) : null; }
  function compact(a){ return a.filter(Boolean); }

  function collect(){
    bar = $('viewTabs');
    var out = [];
    if(!bar) return out;
    var racing = dropdown('racing'), trophies = dropdown('trophies'), tools = dropdown('tools'), support = dropdown('support');
    var staffDD = bar.querySelector(':scope > .view-tab-dropdown.staff-only-tab');
    var staffAllowed = document.body.classList.contains('staff-access');
    var staffHub = direct(':scope > .view-tab[data-view="staffHub"]');

    var home = direct(':scope > .view-tab[data-view="home"]');
    if(home) out.push({ id: 'home', label: 'Home', icon: 'home', direct: item(home, 'Home') });

    var lic = compact([
      viewItem('editProfile', 'Edit profile & tier review'),
      support && pick(support, '[data-view="inbox"]'),
      racing && pick(racing, '#navMyCareerBtn'),
      trophies && pick(trophies, '[data-view="myTrophyCabinet"]'),
      support && pick(support, '[data-view="ticketHistory"]')
    ]);
    if(lic.length) out.push({ id: 'lic', label: 'Licence', icon: 'lic', items: lic, badge: support ? badgeOf(support.querySelector('[data-view="inbox"]') || support) : '' });

    var race = compact([
      direct(':scope > .view-tab[data-view="availableRaces"]') && item(direct(':scope > .view-tab[data-view="availableRaces"]')),
      direct('#navLiveTimingsBtn') && item(direct('#navLiveTimingsBtn')),
      direct(':scope > .view-tab[data-view="seasons"]') && item(direct(':scope > .view-tab[data-view="seasons"]')),
      direct(':scope > .view-tab[data-view="commentatorWatch"]') && item(direct(':scope > .view-tab[data-view="commentatorWatch"]'))
    ]).concat(buttonsIn(racing && racing.querySelector('.view-tab-menu')));
    if(race.length) out.push({ id: 'race', label: 'Racing', icon: 'race', items: race });

    var kit = direct('#navKitBtn');
    if(kit) out.push({ id: 'kit', label: 'Kit', icon: 'kit', direct: item(kit, 'My Kit') });

    if(trophies){ var tr = buttonsIn(trophies.querySelector('.view-tab-menu')); if(tr.length) out.push({ id: 'trophy', label: 'Trophies', icon: 'trophy', items: tr }); }
    if(tools){ var tl = buttonsIn(tools.querySelector('.view-tab-menu')); if(tl.length) out.push({ id: 'tools', label: 'Tools', icon: 'tools', items: tl }); }
    if(support){
      var sp = buttonsIn(support.querySelector('.view-tab-menu'));
      var sb = $('supportUnreadBadge');
      var spBadge = sb && !sb.classList.contains('hidden') && (sb.textContent || '').trim() && (sb.textContent || '').trim() !== '0' ? sb.textContent.trim() : '';
      if(sp.length) out.push({ id: 'help', label: 'Support', icon: 'help', items: sp, badge: spBadge });
    }
    var join = direct(':scope > .view-tab.join-team-tab');
    if(join) out.push({ id: 'team', label: 'Join', icon: 'team', direct: item(join, 'Join the Team'), sepBefore: true });

    if(staffAllowed && (staffDD || staffHub)){
      var groups = [], extra = [], menu = staffDD && (staffDD.querySelector('.staff-accordion-menu') || staffDD.querySelector('.view-tab-menu'));
      if(menu){
        menu.querySelectorAll('.staff-accordion-group').forEach(function(d){
          var title = ((d.querySelector('summary') || {}).textContent || '').replace(/\s+/g, ' ').trim();
          var its = buttonsIn(d, staffDD);
          if(its.length) groups.push({ title: title, items: its });
        });
        menu.querySelectorAll(':scope > button').forEach(function(b){ if(vis(b, staffDD) && tidy(b)) extra.push(item(b)); });
      }
      var top = staffHub ? [item(staffHub, 'Staff Hub (search, favourites, recent)')] : [];
      if(groups.length || extra.length || top.length) out.push({ id: 'staff', label: 'Staff', icon: 'staff', top: top, groups: groups, items: extra });
    }
    return out;
  }

  /* ---------- who is logged in ---------- */
  function who(){
    var name = 'Account';
    try{ if(window.IFWL_META && window.IFWL_AUTH) name = window.IFWL_AUTH.userName(window.IFWL_META) || name; }catch(e){}
    var pill = $('ifwlAccessPill'); var role = pill ? (pill.textContent || '').trim() : '';
    var ph = $('licencePhoto'); var src = ph && ph.getAttribute('src') ? ph.getAttribute('src') : '';
    return { name: name, role: role, src: src, init: (name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?').toUpperCase() };
  }
  function avatarHtml(w){ return w.src ? '<img src="' + esc(w.src) + '" alt="">' : esc(w.init); }

  /* ---------- drawing ---------- */
  function drawRail(){
    var w = who(), h = '<div class="rl-logo">IFWL</div>';
    secs.forEach(function(s){
      if(s.sepBefore) h += '<div class="rl-sep"></div>';
      h += '<button type="button" class="rl-btn' + (openId === s.id ? ' on' : (!openId && s.id === 'home' ? ' on' : '')) + '" data-sec="' + s.id + '" aria-label="' + esc(s.label) + '">' + svg(s.icon) + '<span>' + esc(s.label) + '</span>' + (s.badge ? '<b class="rl-dot">' + esc(s.badge) + '</b>' : '') + '</button>';
      if(s.id === 'kit') h += '<div class="rl-sep"></div>';
    });
    h += '<div class="rl-spacer"></div><button type="button" class="rl-btn' + (openId === 'me' ? ' on' : '') + '" data-sec="me" aria-label="Account"><span class="rl-av">' + avatarHtml(w) + '</span><span>Me</span></button>';
    rail.innerHTML = h;
    if(chip){ chip.innerHTML = (w.src ? '<img src="' + esc(w.src) + '" alt="">' : '') + esc(w.name); }
  }
  var targets = [];
  function row(it, cls){
    targets.push(it);
    return '<button type="button" class="rl-link' + (cls ? ' ' + cls : '') + '" data-t="' + (targets.length - 1) + '">' + esc(it.label) + (it.badge ? '<span class="rl-badge">' + esc(it.badge) + '</span>' : '') + (it.tag ? '<span class="rl-tag">' + esc(it.tag) + '</span>' : '') + '</button>';
  }
  function head(title){ return '<div class="rl-head"><h2>' + esc(title) + '</h2><button type="button" class="rl-x" data-close="1" aria-label="Close menu">&times;</button></div>'; }
  function drawFly(id){
    targets = [];
    var w = who();
    if(id === 'me'){
      var vb = $('viewAsBar'), vas = '';
      if(document.body.classList.contains('real-staff')){
        var bs = document.querySelectorAll('#viewAsBar [data-view-as]');
        if(bs.length){
          vas = '<div class="rl-sec">Staff: view as</div><div class="rl-seg">';
          bs.forEach(function(b){ targets.push({ el: b, keep: true }); vas += '<button type="button" class="' + (b.classList.contains('active') ? 'on' : '') + '" data-t="' + (targets.length - 1) + '">' + esc(tidy(b)) + '</button>'; });
          vas += '</div>';
        }
      }
      var login = $('discordLoginBtn'), logout = $('discordLogoutBtn'), pat = document.querySelector('.patreon-link-btn');
      var loggedIn = logout && !logout.classList.contains('hidden');
      var acts = '';
      if(pat && pat.href) acts += '<a class="rl-act patreon" href="' + esc(pat.href) + '" target="_blank" rel="noopener">Join Patreon</a>';
      if(loggedIn){ targets.push({ el: logout }); acts += '<button type="button" class="rl-act dark" data-t="' + (targets.length - 1) + '">Logout</button>'; }
      else if(login){ targets.push({ el: login }); acts += '<button type="button" class="rl-act discord" data-t="' + (targets.length - 1) + '">Login with Discord</button>'; }
      targets.push(viewItem('editProfile', ''));
      fly.innerHTML = head('Account') + '<div class="rl-body">' +
        '<div class="rl-prof"><span class="rl-av">' + avatarHtml(w) + '</span><div><b>' + esc(w.name) + '</b>' + (w.role ? '<span class="rl-pill">' + esc(w.role) + '</span>' : '') + '</div></div>' + vas +
        '<div class="rl-sec">Profile</div><div class="rl-actions"><button type="button" class="rl-act ghost" data-t="' + (targets.length - 1) + '">Edit profile, colour theme &amp; avatar</button></div>' +
        '<div class="rl-sec">Account</div><div class="rl-actions">' + acts + '</div>' +
        '<div class="rl-sec">Menu</div><div class="rl-actions"><button type="button" class="rl-act ghost" data-classic="1">Use the classic menu</button></div>' +
        '<p class="rl-note">Every driver, Active Racer or above, can open the Licence Centre.</p></div>';
      return;
    }
    var s = secs.filter(function(x){ return x.id === id; })[0];
    if(!s){ fly.innerHTML = head('Menu') + '<div class="rl-body"><div class="rl-empty">Nothing here.</div></div>'; return; }
    var body = '';
    if(s.groups){
      (s.top || []).forEach(function(i){ body += row(i); });
      s.groups.forEach(function(g, gi){
        body += '<div class="rl-group" data-g="' + gi + '"><button type="button" class="rl-link" data-toggle="' + gi + '">' + esc(g.title) + '<span class="rl-count">' + g.items.length + '</span><span class="rl-arrow">&#9656;</span></button><div class="rl-sub">' + g.items.map(function(i){ return row(i); }).join('') + '</div></div>';
      });
      (s.items || []).forEach(function(i){ body += row(i); });
    } else {
      s.items.forEach(function(i){ body += row(i); });
    }
    fly.innerHTML = head(s.label) + '<div class="rl-body">' + body + '</div>';
  }

  function openSec(id){
    var s = secs.filter(function(x){ return x.id === id; })[0];
    if(s && s.direct){ closeFly(); s.direct.el.click(); return; }
    openId = id; drawRail(); drawFly(id);
    fly.classList.add('on'); scrim.classList.add('on');
  }
  function closeFly(){ openId = null; fly.classList.remove('on'); scrim.classList.remove('on'); drawRail(); }

  function activate(t){
    if(!t) return;
    var keepOpen = !!t.keep;
    if(!keepOpen) closeFly();
    if(t.el) t.el.click();
    else if(t.view && typeof window.switchView === 'function') window.switchView(t.view);
    if(keepOpen) setTimeout(function(){ if(openId === 'me'){ drawFly('me'); drawRail(); } }, 60);
  }

  var lastSig = '';
  function sigOf(list){
    var w = who();
    function its(a){ return (a || []).map(function(i){ return i.label + '|' + i.tag + '|' + i.badge; }).join(';'); }
    return JSON.stringify([w.name, w.role, w.src, document.body.classList.contains('real-staff'), list.map(function(s){
      return [s.id, s.badge || '', its(s.items), its(s.top), (s.groups || []).map(function(g){ return g.title + ':' + its(g.items); }).join('/'), s.direct ? s.direct.label : ''];
    })]);
  }
  function refresh(){
    queued = false;
    var next = collect();
    secs = next;
    if(!rail) return;
    var sig = sigOf(next);
    if(sig === lastSig) return;          /* nothing visible changed: leave an open panel exactly as it is */
    lastSig = sig;
    drawRail();
    if(openId && fly.classList.contains('on')) drawFly(openId);
  }
  function queue(){ if(queued) return; queued = true; (window.requestAnimationFrame || setTimeout)(refresh, 0); }

  function build(){
    document.body.classList.add('ifwl-rail');
    rail = document.createElement('aside'); rail.className = 'rl-rail'; rail.setAttribute('aria-label', 'Main menu');
    scrim = document.createElement('div'); scrim.className = 'rl-scrim';
    fly = document.createElement('aside'); fly.className = 'rl-flyout'; fly.setAttribute('aria-live', 'polite');
    document.body.appendChild(rail); document.body.appendChild(scrim); document.body.appendChild(fly);
    var tb = $('mainTitlebar');
    if(tb){ chip = document.createElement('button'); chip.type = 'button'; chip.className = 'rl-chip'; chip.setAttribute('data-sec', 'me'); chip.textContent = 'Account'; tb.appendChild(chip); }

    document.addEventListener('click', function(e){
      var t = e.target.closest && e.target.closest('[data-sec],[data-t],[data-toggle],[data-close],[data-classic]');
      if(!t) return;
      if(t.hasAttribute('data-sec')){ var id = t.getAttribute('data-sec'); if(openId === id) closeFly(); else openSec(id); return; }
      if(t.hasAttribute('data-close')){ closeFly(); return; }
      if(t.hasAttribute('data-toggle')){ t.parentNode.classList.toggle('open'); return; }
      if(t.hasAttribute('data-classic')){ setClassic(true); location.search = '?classic=1'; return; }
      if(t.hasAttribute('data-t')){ activate(targets[Number(t.getAttribute('data-t'))]); }
    });
    scrim.addEventListener('click', closeFly);
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeFly(); });

    bar = $('viewTabs');
    try{
      var mo = new MutationObserver(queue);
      if(bar) mo.observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'], characterData: true });
      mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      var ph = $('licencePhoto'); if(ph) mo.observe(ph, { attributes: true, attributeFilter: ['src'] });
      var pill = $('ifwlAccessPill'); if(pill) mo.observe(pill, { childList: true, characterData: true, subtree: true });
    }catch(e){}
    window.addEventListener('load', queue);
    refresh();
  }

  function init(){
    if(getClassic()){
      var a = document.createElement('a'); a.className = 'rl-try show'; a.href = '?classic=0'; a.textContent = 'Try the new menu';
      a.addEventListener('click', function(){ setClassic(false); });
      document.body.appendChild(a);
      return;
    }
    build();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
