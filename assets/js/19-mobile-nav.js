/* ============================================================
   IFWL mobile menu. On a phone the tab bar used to wrap onto three lines. Now (CSS, max-width 720px) the bar is ONE row:
   a Menu button, then My Kit, Available Races, Help and Support. Menu opens a sheet with everything else.
   Nothing is moved or re-created: the sheet's buttons click the original tabs, so every existing handler still runs.
   On a wide screen none of this shows.
   ============================================================ */
(function(){
'use strict';
if(window.IFWL_MOBILE_NAV) return;
window.IFWL_MOBILE_NAV = true;
var bar = null, sheet = null, menuBtn = null, helpBtn = null;
function esc(x){ return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function tidy(el){ return (el.textContent || '').replace(/[▾▸]/g, '').replace(/\s+/g, ' ').trim(); }
function shown(el){ try{ return getComputedStyle(el).display !== 'none'; }catch(e){ return true; } }
function tag(){
  if(!bar) return;
  var races = bar.querySelector(':scope > .view-tab[data-view="availableRaces"]'); if(races) races.classList.add('m-primary', 'm-o2');
  var kit = document.getElementById('navKitBtn'); if(kit) kit.classList.add('m-primary', 'm-o1');
  var sup = null;
  bar.querySelectorAll(':scope > .view-tab-dropdown').forEach(function(d){ var t = d.querySelector('.dropdown-toggle'); if(t && /^support/i.test(tidy(t))) sup = d; });
  if(sup) sup.classList.add('m-primary', 'm-o4');
}
function closeSheet(){ if(sheet){ sheet.hidden = true; } if(menuBtn){ menuBtn.setAttribute('aria-expanded', 'false'); } }
function place(el){
  var r = bar.getBoundingClientRect(); el.style.top = Math.max(0, Math.round(r.bottom)) + 'px';
}
function build(){
  var h = '', n = 0;
  function row(label, idx, active, sub){ n++; return '<button type="button" class="m-row' + (active ? ' on' : '') + (sub ? ' sub' : '') + '" data-i="' + idx + '">' + esc(label) + '</button>'; }
  var targets = [];
  Array.prototype.forEach.call(bar.children, function(el){
    if(el.id === 'mNavMenuBtn' || el.id === 'mNavHelpBtn') return;
    if(!shown(el)) return;
    if(el.classList.contains('view-tab-dropdown')){
      if(el.classList.contains('staff-only-tab')) return;                    /* staff use the Staff tab (hub) */
      var t = el.querySelector('.dropdown-toggle'), items = [];
      el.querySelectorAll('.view-tab-menu button').forEach(function(b){ if(shown(b) && tidy(b)) items.push(b); });
      if(!items.length) return;
      h += '<div class="m-group">' + esc(tidy(t)) + '</div>';
      items.forEach(function(b){ targets.push(b); h += row(tidy(b), targets.length - 1, false, true); });
    } else if(el.classList.contains('view-tab') && tidy(el)){
      targets.push(el); h += row(tidy(el), targets.length - 1, el.classList.contains('active'), false);
    }
  });
  sheet.innerHTML = '<div class="m-sheet-in">' + h + '</div>';
  sheet._targets = targets;
}
function openSheet(){
  build(); place(sheet); sheet.hidden = false; menuBtn.setAttribute('aria-expanded', 'true');
}
function init(){
  bar = document.getElementById('viewTabs'); if(!bar || document.getElementById('mNavMenuBtn')) return;
  menuBtn = document.createElement('button'); menuBtn.type = 'button'; menuBtn.id = 'mNavMenuBtn'; menuBtn.className = 'view-tab m-menu-btn'; menuBtn.setAttribute('aria-haspopup', 'true'); menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.innerHTML = '<span aria-hidden="true">&#9776;</span> Menu';
  bar.insertBefore(menuBtn, bar.firstChild);
  helpBtn = document.createElement('button'); helpBtn.type = 'button'; helpBtn.id = 'mNavHelpBtn'; helpBtn.className = 'view-tab m-help-btn m-primary m-o3'; helpBtn.textContent = 'Help';
  bar.appendChild(helpBtn);
  sheet = document.createElement('div'); sheet.id = 'mNavSheet'; sheet.className = 'm-sheet'; sheet.hidden = true; sheet.setAttribute('role', 'menu');
  document.body.appendChild(sheet);
  menuBtn.addEventListener('click', function(e){ e.stopPropagation(); if(sheet.hidden){ document.querySelectorAll('.view-tab-dropdown.open').forEach(function(d){ d.classList.remove('open'); }); openSheet(); } else closeSheet(); });
  helpBtn.addEventListener('click', function(){
    closeSheet();
    var orig = bar.querySelector('.view-tab-menu [data-view="help"]'); if(orig) orig.click();
  });
  sheet.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.m-row'); if(!b) return;
    var t = sheet._targets && sheet._targets[Number(b.getAttribute('data-i'))]; closeSheet();
    if(t) t.click();
  });
  document.addEventListener('click', function(e){ if(!sheet.hidden && !sheet.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) closeSheet(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeSheet(); });
  window.addEventListener('resize', function(){ if(!sheet.hidden) place(sheet); });
  /* an opened dropdown (Support) drops down under the bar as a full-width sheet: fixed so the bar's sideways scrolling cannot clip it */
  bar.addEventListener('click', function(e){
    var tg = e.target.closest && e.target.closest('.dropdown-toggle'); if(!tg) return;
    var d = tg.closest('.view-tab-dropdown'); closeSheet();
    requestAnimationFrame(function(){ var m = d && d.querySelector('.view-tab-menu'); if(m) m.style.top = Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) + 'px'; });
  }, true);
  tag();
  try{ new MutationObserver(tag).observe(bar, { childList: true }); }catch(e){}
  if(document.readyState !== 'complete') window.addEventListener('load', tag);
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
