/* ============================================================
   IFWL KIT PAGE (licence-kit.html): Design, My Collection, Kit Market, Wallet, Staff.
   Needs 13-kit.js (shared pieces) loaded first. Everything the server decides
   (who may design what, fees, royalties, who may see which button) is enforced
   by the server; this page only shows or hides buttons to match.
   ============================================================ */
(function(){
'use strict';
var K = window.IFWL_KIT;
if(!K || window.IFWL_KIT_PAGE) return;
var esc = K.esc, fmt = K.fmt, api = K.api;
var q = function(id){ return document.getElementById(id); };
var state = null, root = null, tab = 'design', built = {}, dirty = false, col = { items: {} };
var studio = { iframe: null, ready: false, pending: {}, lastEq: {} };
var STUDIO_URL = K.ASSETS.replace(/assets\/$/, '') + 'kit-studio.html?lic=1';

function isOps(){ return !!(window.IFWL_REAL_OPS_PLUS || window.IFWL_OPS_PLUS); }
function isOwner(){ return !!(window.IFWL_REAL_OWNER || window.IFWL_OWNER); }
function when(ms){ if(!ms) return ''; try{ return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }catch(e){ return ''; } }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

/* ---------------------------------------------------------------- small UI helpers */
var toastTimer = null;
function toast(msg, kind){
  var t = document.querySelector('.kit-toast'); if(t) t.remove();
  t = document.createElement('div'); t.className = 'kit-toast' + (kind ? ' ' + kind : ''); t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.remove(); }, kind === 'bad' ? 7000 : 4200);
}
function errMsg(e){ return (e && e.message) ? e.message : 'Something went wrong. Please try again.'; }
function dlg(html, cls, keep){
  var ov = document.createElement('div'); ov.className = 'kit-modal kit-dlg ' + (cls || '');
  ov.innerHTML = '<div class="kit-modal-box" role="dialog" aria-modal="true"><button class="kit-x" type="button" aria-label="Close">&times;</button>' + html + '</div>';
  document.body.appendChild(ov);
  ov.close = function(){ ov.remove(); if(ov.onclose) ov.onclose(); };
  ov.querySelector('.kit-x').onclick = ov.close;
  if(!keep) ov.addEventListener('mousedown', function(e){ if(e.target === ov) ov.close(); });
  return ov;
}
/* a tiny form dialog. fields: [{id,label,type:'text'|'number'|'textarea'|'select'|'check',value,help,options,placeholder,min,max}] -> Promise(values|null) */
function ask(o){
  return new Promise(function(resolve){
    var f = (o.fields || []).map(function(x){
      var inp;
      if(x.type === 'textarea') inp = '<textarea id="kf_' + x.id + '" placeholder="' + esc(x.placeholder || '') + '">' + esc(x.value || '') + '</textarea>';
      else if(x.type === 'select') inp = '<select id="kf_' + x.id + '">' + x.options.map(function(op){ return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(x.value) ? ' selected' : '') + '>' + esc(op[1]) + '</option>'; }).join('') + '</select>';
      else if(x.type === 'check') return '<label class="kit-check"><input type="checkbox" id="kf_' + x.id + '"><span>' + x.label + '</span></label>';
      else inp = '<input id="kf_' + x.id + '" type="' + (x.type === 'number' ? 'number' : 'text') + '" value="' + esc(x.value == null ? '' : x.value) + '"' + (x.type === 'number' ? ' inputmode="numeric" min="' + (x.min == null ? 0 : x.min) + '"' + (x.max != null ? ' max="' + x.max + '"' : '') : '') + ' placeholder="' + esc(x.placeholder || '') + '" autocomplete="off">';
      return '<div class="kit-field"><label for="kf_' + x.id + '">' + esc(x.label) + '</label>' + inp + (x.help ? '<div class="help">' + x.help + '</div>' : '') + '</div>';
    }).join('');
    var ov = dlg('<form class="kit-form" novalidate><h3>' + esc(o.title) + '</h3>' + (o.intro ? '<div class="kit-note">' + o.intro + '</div>' : '') + f + '<div class="kit-err" id="kitFormErr" role="alert"></div><div class="kit-form-actions"><button type="button" class="kit-btn ghost" data-a="no">' + esc(o.cancel || 'Cancel') + '</button><button type="submit" class="kit-btn ' + (o.danger ? 'red' : 'teal') + '" data-a="ok">' + esc(o.ok || 'OK') + '</button></div></form>', 'narrow', true);
    var done = false;
    function fin(v){ if(done) return; done = true; ov.onclose = null; ov.remove(); resolve(v); }
    ov.onclose = function(){ fin(null); };
    ov.querySelector('[data-a=no]').onclick = function(){ fin(null); };
    ov.querySelector('form').addEventListener('submit', function(e){
      e.preventDefault();
      var vals = {};
      (o.fields || []).forEach(function(x){ var el = ov.querySelector('#kf_' + x.id); vals[x.id] = x.type === 'check' ? el.checked : el.value; });
      var bad = o.validate ? o.validate(vals) : '';
      if(bad){ ov.querySelector('#kitFormErr').textContent = bad; return; }
      fin(vals);
    });
    var first = ov.querySelector('input:not([type=checkbox]),textarea,select'); if(first) setTimeout(function(){ first.focus(); }, 30);
  });
}
function say(title, html, ok){
  return new Promise(function(resolve){
    var ov = dlg('<div class="kit-form"><h3>' + esc(title) + '</h3><div class="kit-note">' + html + '</div><div class="kit-form-actions"><button type="button" class="kit-btn teal" data-a="ok">' + esc(ok || 'OK') + '</button></div></div>', 'narrow');
    ov.onclose = function(){ resolve(); }; ov.querySelector('[data-a=ok]').onclick = function(){ ov.close(); };
  });
}
var priceField = function(label, value){ var s = state.selling || {}; return { id: 'price', label: label || 'Price (credits)', type: 'number', value: value || '', min: s.minPrice || 1, max: s.maxPrice || 100000000, help: 'Between ' + fmt(s.minPrice || 1) + ' and ' + fmt(s.maxPrice || 100000000) + ' credits.' }; };
var priceCheck = function(v){ var p = Math.round(Number(v.price)), s = state.selling || {}; if(!Number.isFinite(p) || p < (s.minPrice || 1) || p > (s.maxPrice || 1e9)) return 'Enter a price between ' + fmt(s.minPrice || 1) + ' and ' + fmt(s.maxPrice || 1e9) + ' credits.'; return ''; };

/* ---------------------------------------------------------------- Gold Patreon links and Top up balance */
var PATREON_URL = 'https://www.patreon.com/c/IFWL';
var LOCK_SVG = '<svg class="kit-gl" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="#e0a800" stroke-width="2.4" stroke-linecap="round"/><rect x="4.5" y="10" width="15" height="11" rx="2.6" fill="#f2b705"/><circle cx="12" cy="15.4" r="1.7" fill="#7a5200"/></svg>';
function perksCss(){
  if(document.getElementById('kitPerksCss')) return;
  var st = document.createElement('style'); st.id = 'kitPerksCss';
  st.textContent = '.kit-gold{display:flex;gap:12px;align-items:center;flex-wrap:wrap;border:1px solid rgba(242,183,5,.55);background:rgba(242,183,5,.08);border-radius:14px;padding:12px 14px;margin:0 0 12px}'
    + '.kit-gold .gt{flex:1 1 260px;min-width:0;font-size:13px;line-height:1.5}.kit-gold .gt b{font-weight:800}'
    + '.kit-btn.gold{background:linear-gradient(135deg,#ffe08a,#f2b705);color:#1a1300}'
    + '.kit-gl{display:inline-block;vertical-align:-3px;margin-right:5px}'
    + '.kit-head-wallet{display:flex;flex-direction:column;gap:8px;align-items:stretch}'
    + '.kit-tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}'
    + '.kit-tier{appearance:none;cursor:pointer;text-align:center;border:2px solid var(--ifwl-line,#e3e7ed);border-radius:14px;background:var(--panel-bg-raised,#fbfcfd);color:inherit;padding:12px 6px;font:inherit}'
    + '.kit-tier:hover{border-color:var(--ifwl-teal,#0e9c8a)}.kit-tier.on{border-color:var(--ifwl-teal,#0e9c8a);box-shadow:0 0 0 3px rgba(14,156,138,.2)}'
    + '.kit-tier .p{display:block;font:700 22px/1.1 var(--font-display);letter-spacing:.03em}.kit-tier .c{display:block;margin-top:5px;font:700 13px/1.2 var(--font-mono);color:var(--ifwl-teal-deep,#086b5f)}.kit-tier .b{display:block;margin-top:4px;font-size:11px;color:var(--text-muted,#5b6576)}'
    + '.kit-steps{margin:10px 0;padding-left:20px;font-size:13px;line-height:1.6}.kit-steps li{margin:6px 0}'
    + '.kit-ref{display:inline-block;font:700 13px/1.4 var(--font-mono);background:rgba(14,156,138,.1);border-radius:8px;padding:3px 8px;user-select:all}'
    + '@media(max-width:480px){.kit-tiers{grid-template-columns:1fr}}';
  document.head.appendChild(st);
}
function goldLink(label, cls){ return '<a class="kit-btn ' + (cls || 'gold') + '" href="' + PATREON_URL + '" target="_blank" rel="noopener noreferrer">' + LOCK_SVG + esc(label) + '</a>'; }
var TOP_PAYPAL = /^https:\/\/(www\.)?paypal\.me\//;
function topUp(){
  var ov = dlg('<div class="kit-form"><h3>Top up your balance</h3><div id="kitTopBody"><div class="kit-empty">Loading&hellip;</div></div></div>', 'narrow');
  var body = ov.querySelector('#kitTopBody');
  function fail(e){ body.innerHTML = '<div class="kit-note bad">' + esc(errMsg(e)) + '</div><div class="kit-form-actions"><button type="button" class="kit-btn ghost" data-a="x">Close</button></div>'; body.querySelector('[data-a=x]').onclick = function(){ ov.close(); }; }
  api('creditPurchaseTiers').then(function(d){
    var keys = ['small', 'medium', 'large'].filter(function(k){ return d.tiers && d.tiers[k]; });
    if(!keys.length) throw new Error('Top-ups are not available right now.');
    var pick = keys[1] || keys[0];
    body.innerHTML = '<p class="kit-note">Buy credits with PayPal and a member of staff adds them to your <b>career credits</b> for this season. You can spend them in the Career Shop and in the Kit Market. Every package includes a <b>' + esc(d.bonusPct) + '% bonus</b>.</p>'
      + '<p class="kit-note warn"><b>Career credits reset when the season changes.</b> Your Kit wallet, what you earn from selling designs, is the part that stays with you for life.</p>'
      + '<div class="kit-tiers" id="kitTiers">' + keys.map(function(k){ var t = d.tiers[k]; return '<button type="button" class="kit-tier" data-t="' + k + '"><span class="p">&pound;' + esc(t.priceGBP) + '</span><span class="c">' + fmt(t.creditAmount) + '</span><span class="b">' + fmt(t.baseCredit) + ' + ' + esc(d.bonusPct) + '% bonus</span></button>'; }).join('') + '</div>'
      + '<div class="kit-err" id="kitTopErr" role="alert"></div><div class="kit-form-actions"><button type="button" class="kit-btn ghost" data-a="no">Cancel</button><button type="button" class="kit-btn teal" data-a="go">Request this top-up</button></div>'
      + '<p class="kit-note" style="margin-top:10px">Asking only tells staff what you plan to buy. Nothing is charged until you pay in PayPal.</p>';
    function mark(){ body.querySelectorAll('.kit-tier').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-t') === pick); }); }
    mark();
    body.querySelector('#kitTiers').addEventListener('click', function(e){ var b = e.target.closest('.kit-tier'); if(b){ pick = b.getAttribute('data-t'); mark(); } });
    body.querySelector('[data-a=no]').onclick = function(){ ov.close(); };
    var go = body.querySelector('[data-a=go]');
    go.onclick = function(){
      go.disabled = true; go.textContent = 'Sending...'; body.querySelector('#kitTopErr').textContent = '';
      api('submitCreditPurchaseRequest', null, { tier: pick }).then(function(r){
        var link = TOP_PAYPAL.test(String(r.paypalLink || '')) ? r.paypalLink : 'https://paypal.me/IFWL';
        var ref = '\u00a3' + r.priceGBP + ' - Licence #' + r.licenceNumber;
        body.innerHTML = '<div class="kit-note good"><b>Request sent.</b> Now pay in PayPal so staff can add your credits.</div>'
          + '<ol class="kit-steps"><li>Pay <b>&pound;' + esc(r.priceGBP) + '</b> by PayPal: <a class="kit-btn small teal" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Open PayPal</a></li>'
          + '<li>Use this as the payment reference so staff can match it to you: <span class="kit-ref" id="kitTopRef">' + esc(ref) + '</span> <button type="button" class="kit-btn small ghost" id="kitTopCopy">Copy</button></li>'
          + '<li>Once staff see the payment they add <b>' + fmt(r.creditAmount) + '</b> credits to your career credits. Please do not pay twice for the same request.</li></ol>'
          + '<div class="kit-form-actions"><button type="button" class="kit-btn teal" data-a="done">Done</button></div>';
        body.querySelector('[data-a=done]').onclick = function(){ ov.close(); };
        body.querySelector('#kitTopCopy').onclick = function(){ var b = this; try{ navigator.clipboard.writeText(ref).then(function(){ b.textContent = 'Copied'; }, function(){ b.textContent = 'Select and copy'; }); }catch(e){ b.textContent = 'Select and copy'; } };
      }).catch(function(e){ go.disabled = false; go.textContent = 'Request this top-up'; body.querySelector('#kitTopErr').textContent = errMsg(e); });
    };
  }).catch(fail);
}

/* ---------------------------------------------------------------- boot */
function boot(){
  root = q('kitRoot'); if(!root) return;
  K.loadCss(); perksCss();
  root.innerHTML = '<div class="kit-empty">Loading your kit&hellip;</div>';
  api('kitGet').then(function(d){
    state = d; window.IFWL_KIT.state = d;
    if(!d.enabled){ root.innerHTML = '<div class="kit-empty">The avatar and kit designer is not open to your account yet. It is being rolled out step by step &mdash; check back soon.</div>'; return; }
    build();
    if(d.showWelcome) K.whenClear(function(){ K.openTour({ selling: !!(d.selling && d.selling.open), onKitPage: true }); });
  }).catch(function(e){
    root.innerHTML = '<div class="kit-empty">' + esc(e.status === 404 ? 'You need an IFWL licence before you can use the kit.' : errMsg(e)) + '</div>';
  });
}

function tabsList(){
  var t = [['design', 'Design'], ['collection', 'My Collection']];
  if(state.selling && state.selling.open) t.push(['market', 'Kit Market']);
  t.push(['wallet', 'Wallet']);
  if(isOps()) t.push(['staff', 'Staff']);
  return t;
}
function build(){
  root.innerHTML = '<div class="kit-page">'
    + '<div class="kit-head"><div class="kit-head-fig" id="kitHeadFig"></div><div class="kit-head-text"><h3>Your avatar and kit</h3><p id="kitHeadText"></p><div class="kit-head-links"><button type="button" class="kit-link" id="kitTourBtn">Show me how it works</button></div></div>'
    + '<div class="kit-head-wallet"><div class="kit-chip" title="Your Kit wallet stays with you from season to season"><span>Kit wallet</span><strong id="kitWalletChip">0</strong></div><button type="button" class="kit-btn small teal" id="kitTopBtn">Top up balance</button></div></div>'
    + '<div class="kit-tabs" role="tablist" id="kitTabs"></div><div id="kitPanes"></div></div>';
  tabsList().forEach(function(t){
    var b = document.createElement('button'); b.type = 'button'; b.className = 'kit-tab'; b.setAttribute('data-tab', t[0]); b.setAttribute('role', 'tab'); b.innerHTML = esc(t[1]) + (t[0] === 'staff' ? '<span class="kit-dot" id="kitStaffDot" hidden></span>' : '');
    b.addEventListener('click', function(){ showTab(t[0]); });
    q('kitTabs').appendChild(b);
    var p = document.createElement('div'); p.className = 'kit-pane'; p.id = 'kitPane_' + t[0]; p.hidden = true; q('kitPanes').appendChild(p);
  });
  q('kitTopBtn').addEventListener('click', topUp);
  q('kitTourBtn').addEventListener('click', function(){ K.openTour({ replay: true, selling: !!(state.selling && state.selling.open), onKitPage: true }); });
  paintHead();
  var want = (location.hash || '').replace('#', '');
  showTab(tabsList().some(function(t){ return t[0] === want; }) ? want : 'design', true);
  window.addEventListener('beforeunload', function(e){ if(dirty){ e.preventDefault(); e.returnValue = ''; return ''; } });
}
function paintHead(){
  var fig = q('kitHeadFig'); if(!fig) return;
  var has = state.avatarUrl || state.avatarSmallUrl;
  fig.innerHTML = '<img src="' + esc(has ? (state.avatarSmallUrl || state.avatarUrl) : K.STOCK) + '" alt="Your avatar">';
  q('kitHeadText').textContent = state.mode === 'full'
    ? 'You have the full designer. Save your kit and your avatar updates everywhere in the Licence Centre.'
    : 'Pick ready-made colour schemes or set your own colours for your helmet and race suit. Anything with a gold padlock comes with Gold Patreon.';
  q('kitWalletChip').textContent = fmt((state.wallet && state.wallet.balance) || 0);
}
function showTab(name, first){
  if(tab === 'design' && name !== 'design' && dirty && !first && !window.confirm('You have unsaved changes in the designer. Leave without saving?')) return;
  tab = name;
  try{ if(history.replaceState) history.replaceState(null, '', '#' + name); }catch(e){}
  document.querySelectorAll('#kitTabs .kit-tab').forEach(function(b){ var on = b.getAttribute('data-tab') === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  document.querySelectorAll('#kitPanes .kit-pane').forEach(function(p){ p.hidden = p.id !== 'kitPane_' + name; });
  if(name === 'design') showDesign();
  else if(name === 'collection') loadCollection();
  else if(name === 'market') loadMarket();
  else if(name === 'wallet') loadWallet();
  else if(name === 'staff') loadStaff();
}
function refreshState(){
  return api('kitGet').then(function(d){ state = d; window.IFWL_KIT.state = d; paintHead(); return d; });
}

/* ================================================================= DESIGN */
function showDesign(){
  var pane = q('kitPane_design');
  if(!built.design){
    built.design = true;
    var canSell = state.selling && state.selling.open && state.selling.canCreate;
    var lockedSell = state.selling && state.selling.open && !state.selling.canCreate;
    var gold = state.mode === 'full' ? '' : '<div class="kit-gold" id="kitGoldBox"><div class="gt">' + LOCK_SVG + '<b>Unlock more with Gold Patreon.</b> You are using the free colour designer. Gold adds the full designer (patterns, layouts, logos, text and finishes), every visor tint (Smoke, Clear and Blackout are free), all 12 colour schemes (4 are free), and selling your own designs in the Kit Market. Look for the gold padlocks.</div>' + goldLink('Get Gold on Patreon') + '</div>';
    pane.innerHTML = gold + '<div class="kit-bar"><div class="kit-note grow" id="kitDesignNote"></div>' + (canSell ? '<button type="button" class="kit-btn purple" id="kitSellBtn">Sell a design</button>' : '') + (lockedSell ? goldLink('Sell a design (Gold)', 'purple') : '') + '</div>'
      + '<div class="kit-frame"><div class="kit-frame-load" id="kitStudioLoad">Loading Kit Studio&hellip;</div><iframe id="kitStudioFrame" title="Kit Studio" allow="fullscreen"></iframe></div>';
    studio.iframe = q('kitStudioFrame');
    window.addEventListener('message', onStudioMsg);
    studio.iframe.src = STUDIO_URL;
    if(canSell) q('kitSellBtn').addEventListener('click', sellDesign);
    paintDesignNote();
  }
}
function paintDesignNote(){
  var n = q('kitDesignNote'); if(!n) return;
  var worn = []; ['suit', 'helmet'].forEach(function(t){ var w = state.equippedItems && state.equippedItems[t]; if(w) worn.push(w.title + ' (' + t + ')'); });
  var t = '';
  if(state.designLocked) t += 'Your Gold designs are kept safe. While you are not a Gold member you can change colours only. ';
  else if(state.mode === 'full') t += 'Design, then press <b>Save my kit</b> in the top bar. ';
  else t += 'Choose a colour scheme (or set your own colours) and press <b>Save my kit</b> in the top bar. ';
  if(worn.length) t += 'You are wearing <b>' + esc(worn.join(' and ')) + '</b> from your collection, so that part shows on your avatar. Take it off in My Collection to use your own design again.';
  n.className = 'kit-note grow' + (worn.length ? ' good' : ''); n.innerHTML = t;
}
function send(m){ try{ studio.iframe.contentWindow.postMessage(Object.assign({ ifwl: 'kit' }, m), location.origin); }catch(e){} }
function studioInit(opts){
  opts = opts || {};
  var kit = state.kit || {}, eq = {}, jobs = [], out = { suit: kit.suit || null, helmet: kit.helmet || null, suitImages: {}, helmetImages: {} };
  ['suit', 'helmet'].forEach(function(t){
    var w = state.equippedItems && state.equippedItems[t];
    if(w){ eq[t] = { id: w.id, title: w.title, design: w.design, images: {} }; jobs.push(K.imageUrlsFor(w.images, { itemId: w.id }).then(function(m){ eq[t].images = m; })); }
    var im = kit[t + 'Images'] || {};
    if(Object.keys(im).length) jobs.push(K.imageUrlsFor(im, { type: t }).then(function(m){ out[t + 'Images'] = m; }));
  });
  return Promise.all(jobs).then(function(){
    studio.lastEq = eq;
    var forAv = opts.avatar || studio.wantAvatar || state.needsAvatar; studio.wantAvatar = false;
    send({ t: 'init', mode: state.mode, allowPatterns: !!state.colourPatterns, kit: out, equipped: eq, then: forAv ? 'avatar' : undefined, forVersion: (state.kit && state.kit.version) || 0 });
  });
}
function onStudioMsg(e){
  if(e.origin !== location.origin || !studio.iframe || e.source !== studio.iframe.contentWindow) return;
  var m = e.data; if(!m || m.ifwl !== 'kit') return;
  if(m.t === 'ready'){ studio.ready = true; var l = q('kitStudioLoad'); if(l) l.style.display = 'none'; studioInit({}).catch(function(err){ toast(errMsg(err), 'bad'); }); }
  else if(m.t === 'dirty'){ dirty = !!m.dirty; }
  else if(m.t === 'save'){ doSave(m); }
  else if(m.t === 'avatar'){ doAvatar(m, 0); }
  else if(m.t === 'avatarFailed'){ toast('Your avatar could not be drawn: ' + (m.error || ''), 'bad'); }
  else if(m.t === 'error'){ toast(m.error || 'The designer had a problem.', 'bad'); }
  else if(m.t === 'preview' || m.t === 'previewFailed'){
    var p = studio.pending[m.rid]; if(!p) return; delete studio.pending[m.rid];
    if(m.t === 'preview') p.res(m.dataUrl); else p.rej(new Error(m.error || 'Could not draw the picture.'));
  }
}
function doSave(m){
  var body = { baseVersion: (state.kit && state.kit.version) || 0 };
  if(m.suit) body.suit = m.suit; if(m.helmet) body.helmet = m.helmet;
  api('kitSave', null, body).then(function(res){
    state.kit = res.kit; state.mode = res.mode; state.needsAvatar = false;
    var msg = { t: 'saved', version: res.kit.version, mode: res.mode, equipped: studio.lastEq };
    if(res.limited){
      msg.reload = { kit: { suit: res.kit.suit, helmet: res.kit.helmet, suitImages: {}, helmetImages: {} }, allowPatterns: !!state.colourPatterns };
      toast('Saved. Some changes are for Gold members only, so those parts were left as they were.', 'good');
    }
    dirty = false; send(msg);
  }).catch(function(e){
    if(e && e.status === 429){ sleep(1500).then(function(){ doSave(m); }); return; }
    send({ t: 'saveFailed', error: errMsg(e) }); toast('Not saved: ' + errMsg(e), 'bad');
    if(e && e.status === 409) refreshState().catch(function(){});
  });
}
function doAvatar(m, tries){
  api('kitAvatarSet', null, { forVersion: m.forVersion, big: m.big, small: m.small }).then(function(r){
    state.avatarUrl = r.avatar.url; state.avatarSmallUrl = r.avatar.urlSmall; state.needsAvatar = false; paintHead(); send({ t: 'avatarOk' });
  }).catch(function(e){
    if(e && e.status === 429 && tries < 2){ sleep(4500).then(function(){ doAvatar(m, tries + 1); }); return; }
    if(e && e.status === 409){ send({ t: 'avatarFailed', error: 'Your kit changed in between. Press Save my kit again.' }); return; }
    send({ t: 'avatarFailed', error: errMsg(e) });
  });
}
function renderPreview(type){
  return new Promise(function(res, rej){
    var rid = 'r' + Date.now() + Math.floor(Math.random() * 1000);
    studio.pending[rid] = { res: res, rej: rej }; send({ t: 'renderPreview', rid: rid, type: type });
    setTimeout(function(){ if(studio.pending[rid]){ delete studio.pending[rid]; rej(new Error('The picture took too long to draw.')); } }, 60000);
  });
}
/* refresh the designer after the account changed (wearing a collected item etc.) and redraw the avatar */
function restudio(){
  paintDesignNote();
  if(studio.iframe && studio.ready) return studioInit({ avatar: true });
  return Promise.resolve();
}

/* ---- sell one of my own designs (Gold) ---- */
function sellDesign(){
  if(dirty){ toast('Save your kit first. The listing uses your saved design.', 'bad'); return; }
  var s = state.selling, kit = state.kit || {}, opts = [];
  if(kit.helmet && !(state.equippedItems && state.equippedItems.helmet)) opts.push(['helmet', 'Helmet']);
  if(kit.suit && !(state.equippedItems && state.equippedItems.suit)) opts.push(['suit', 'Race suit']);
  if(!opts.length){ say('Nothing to sell yet', 'Save a helmet or race suit design first (press <b>Save my kit</b>), then come back.'); return; }
  var hasImg = function(t){ return Object.keys(kit[t + 'Images'] || {}).length > 0; };
  ask({
    title: 'Sell a design', ok: 'Pay fee and list it',
    intro: 'This turns your saved design into a <b>one-of-a-kind</b> item: nobody else can ever own the same one. The listing fee is <b>' + fmt(s.fee) + ' credits</b> (your Kit wallet first, then season credits). You keep <b>' + (100 - s.cutPct) + '%</b> of the first sale; after that you earn <b>' + s.royaltyPct + '%</b> of every resale for life. When it sells, the design belongs to the buyer and your own working design goes back to a fresh start.',
    fields: [
      { id: 'type', label: 'Which design', type: 'select', value: opts[0][0], options: opts },
      { id: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Midnight Teal Racer' },
      priceField('Asking price (credits)'),
      { id: 'rules', type: 'check', label: 'I made this, and it contains <b>no copyrighted images or company logos</b>. I understand that designs with my own pictures are checked by staff before they go on sale, and that staff can take down anything that breaks the rules.' }
    ],
    validate: function(v){ if(String(v.title).trim().length < 3) return 'Give it a title of at least 3 characters.'; var p = priceCheck(v); if(p) return p; if(!v.rules) return 'Please tick the box to confirm the rules.'; return ''; }
  }).then(function(v){
    if(!v) return;
    toast('Drawing the listing picture...');
    renderPreview(v.type).then(function(pic){
      return api('kitListNew', null, { type: v.type, title: String(v.title).trim(), price: Math.round(Number(v.price)), rulesAccepted: true, preview: pic });
    }).then(function(r){
      refreshState().catch(function(){});
      say(r.needsApproval ? 'Sent for checking' : 'Your design is on sale', r.needsApproval
        ? 'Because it uses your own pictures, a steward will check it first. Once it is approved it appears in the Kit Market. You can follow it in My Collection. The listing fee of ' + fmt(r.fee) + ' credits is refunded if staff decline it.'
        : 'It is now in the Kit Market for ' + fmt(r.item.price) + ' credits. The listing fee of ' + fmt(r.fee) + ' credits has been taken. You can follow it in My Collection.', 'Great');
    }).catch(function(e){ toast(errMsg(e), 'bad'); });
  });
}

/* ================================================================= COLLECTION */
function cardHtml(it, o){
  o = o || {};
  var worn = state.kit && state.kit.equipped && state.kit.equipped[it.type] === it.id;
  var badges = '<span class="kit-badge ' + it.type + '">' + (it.type === 'helmet' ? 'Helmet' : 'Race suit') + '</span>';
  if(worn) badges += '<span class="kit-badge wear">Wearing</span>';
  if(it.isResale && !o.noResale) badges += '<span class="kit-badge resale">Resale</span>';
  if(it.status === 'pending') badges += '<span class="kit-badge pending">Being checked</span>';
  if(it.status === 'listed' && o.mineView) badges += '<span class="kit-badge pending">For sale</span>';
  if(['declined', 'cancelled', 'removed'].indexOf(it.status) >= 0) badges += '<span class="kit-badge bad">' + (it.status === 'declined' ? 'Declined' : it.status === 'removed' ? 'Removed' : 'Cancelled') + '</span>';
  var sub = '';
  if(o.market) sub = 'by ' + esc(it.creatorName || 'a driver') + (it.isResale && it.sellerName ? ' &middot; sold by ' + esc(it.sellerName) : '');
  else if(it.createdByMe && !it.mine) sub = 'You created this &middot; you earn a royalty on resales';
  else if(it.createdByMe) sub = 'You created this';
  var foot = '';
  if(it.status === 'listed') foot = '<span class="kit-price">' + fmt(it.price) + '</span>';
  else if(it.status === 'pending') foot = '<span class="kit-price">' + fmt(it.price) + '</span>';
  var meta = '<span title="Likes">&#9825; ' + fmt(it.likeCount) + '</span><span title="Comments">&#128172; ' + fmt(it.commentCount) + '</span>';
  var acts = '';
  if(o.mineView && it.mine){
    if(it.status === 'owned'){ acts += '<button class="kit-btn small teal" data-act="' + (worn ? 'off' : 'wear') + '" data-id="' + esc(it.id) + '">' + (worn ? 'Take off' : 'Wear it') + '</button>'; if(state.selling && state.selling.open) acts += '<button class="kit-btn small ghost" data-act="list" data-id="' + esc(it.id) + '">Sell</button>'; }
    else if(it.status === 'listed' || it.status === 'pending'){ acts += '<button class="kit-btn small ghost" data-act="price" data-id="' + esc(it.id) + '">Change price</button><button class="kit-btn small ghost" data-act="cancel" data-id="' + esc(it.id) + '">Take off sale</button>'; }
  }
  return '<div class="kit-card click" data-open="' + esc(it.id) + '"><div class="kit-badges">' + badges + '</div><div class="kit-card-img">' + (it.previewUrl ? '<img loading="lazy" src="' + esc(it.previewUrl) + '" alt="' + esc(it.title) + '">' : '<div class="none">No picture</div>') + '</div>'
    + '<div class="kit-card-body"><div class="kit-card-title">' + esc(it.title) + '</div>' + (sub ? '<div class="kit-card-sub">' + sub + '</div>' : '') + (it.closedReason ? '<div class="kit-card-sub">' + esc(it.closedReason) + '</div>' : '')
    + '<div class="kit-card-foot">' + foot + '<div class="kit-meta">' + meta + '</div></div>' + (acts ? '<div class="kit-card-actions">' + acts + '</div>' : '') + '</div></div>';
}
function loadCollection(){
  var pane = q('kitPane_collection');
  pane.innerHTML = '<div class="kit-empty">Loading&hellip;</div>';
  api('kitMine').then(function(d){
    state.wallet = d.wallet; if(d.selling) state.selling = Object.assign({}, state.selling, d.selling); paintHead();
    col.items = {}; d.items.forEach(function(i){ col.items[i.id] = i; });
    var owned = d.items.filter(function(i){ return i.mine && ['owned', 'listed', 'pending'].indexOf(i.status) >= 0; });
    var made = d.items.filter(function(i){ return !i.mine; });
    var gone = d.items.filter(function(i){ return i.mine && ['owned', 'listed', 'pending'].indexOf(i.status) < 0; });
    var html = '<p class="kit-note" style="margin:0 0 14px">Everything you own stays with you for life, season after season. Each item is one of a kind. Wear one and it replaces that part of your avatar until you take it off.</p>';
    html += '<div class="kit-section"><h3>Items I own</h3>' + (owned.length ? '<div class="kit-grid">' + owned.map(function(i){ return cardHtml(i, { mineView: true }); }).join('') + '</div>' : '<div class="kit-empty">You do not own any collected items yet.' + (state.selling && state.selling.open ? ' Visit the Kit Market to find one.' : ' Collecting opens soon.') + '</div>') + '</div>';
    if(made.length) html += '<div class="kit-section"><h3>Designs I created that were sold</h3><div class="kit-grid">' + made.map(function(i){ return cardHtml(i, { mineView: true }); }).join('') + '</div></div>';
    if(gone.length) html += '<div class="kit-section"><h3>Closed listings</h3><div class="kit-grid">' + gone.map(function(i){ return cardHtml(i, { mineView: true }); }).join('') + '</div></div>';
    pane.innerHTML = html;
  }).catch(function(e){ pane.innerHTML = '<div class="kit-empty">' + esc(errMsg(e)) + '</div>'; });
}

/* wear / take off / list / price / cancel (shared by cards and the details window) */
function equip(it, wear){
  return api('kitEquip', null, { type: it.type, itemId: wear ? it.id : null }).then(function(){
    return refreshState();
  }).then(function(){
    toast(wear ? 'Wearing it. Updating your avatar...' : 'Taken off. Updating your avatar...', 'good');
    studio.wantAvatar = true; showTab('design'); return restudio();
  }).catch(function(e){ toast(errMsg(e), 'bad'); });
}
function listForSale(it){
  var s = state.selling;
  return ask({ title: 'Sell "' + it.title + '"', ok: 'Put it on sale',
    intro: 'When it sells you receive the price minus the league\'s <b>' + s.cutPct + '%</b> and the creator\'s <b>' + s.royaltyPct + '%</b> royalty (the creator earns this on every resale). There is no listing fee for resales.',
    fields: [priceField('Asking price (credits)')], validate: priceCheck
  }).then(function(v){ if(!v) return; return api('kitListResale', null, { itemId: it.id, price: Math.round(Number(v.price)) }).then(function(){ toast('On sale in the Kit Market.', 'good'); return afterChange(); }).catch(function(e){ toast(errMsg(e), 'bad'); }); });
}
function changePrice(it){
  return ask({ title: 'Change the price', ok: 'Save price', fields: [priceField('New price (credits)', it.price)], validate: priceCheck })
    .then(function(v){ if(!v) return; return api('kitSetPrice', null, { itemId: it.id, price: Math.round(Number(v.price)) }).then(function(){ toast('Price changed.', 'good'); return afterChange(); }).catch(function(e){ toast(errMsg(e), 'bad'); }); });
}
function cancelSale(it){
  var mint = it.creatorId === it.ownerId && !(it.salesCount > 0);
  return ask({ title: 'Take it off sale?', ok: mint ? 'Cancel the listing' : 'Take off sale', cancel: 'Keep it on sale', danger: true,
    intro: mint ? 'This design has not sold yet, so cancelling removes the listing and frees the design up. <b>The listing fee is not refunded</b> if you cancel it yourself.' : 'It goes back into your collection.', fields: [] })
    .then(function(v){ if(!v) return; return api('kitCancelListing', null, { itemId: it.id }).then(function(){ toast('Done.', 'good'); return afterChange(); }).catch(function(e){ toast(errMsg(e), 'bad'); }); });
}
function afterChange(){
  return refreshState().then(function(){ if(tab === 'collection') loadCollection(); else if(tab === 'market') loadMarket(); else if(tab === 'staff') loadStaff(); else if(tab === 'wallet') loadWallet(); }).catch(function(){});
}
function itemFromCache(id){ return col.items[id] || (market.items && market.items.filter(function(i){ return i.id === id; })[0]); }

/* ================================================================= MARKET */
var market = { type: '', sort: 'new', items: [] };
function loadMarket(){
  var pane = q('kitPane_market');
  if(!pane.getAttribute('data-ready')){
    pane.setAttribute('data-ready', '1');
    pane.innerHTML = '<div class="kit-bar"><div class="kit-filter" id="kitMkType"><button data-v="" class="active">All</button><button data-v="helmet">Helmets</button><button data-v="suit">Race suits</button></div>'
      + '<select class="kit-select" id="kitMkSort" aria-label="Sort"><option value="new">Newest</option><option value="popular">Most liked</option><option value="cheap">Cheapest first</option><option value="dear">Dearest first</option></select>'
      + '<span class="kit-note grow" id="kitMkNote"></span></div><div id="kitMkBody"></div>';
    q('kitMkType').addEventListener('click', function(e){ var b = e.target.closest('button'); if(!b) return; market.type = b.getAttribute('data-v'); q('kitMkType').querySelectorAll('button').forEach(function(x){ x.classList.toggle('active', x === b); }); loadMarket(); });
    q('kitMkSort').addEventListener('change', function(e){ market.sort = e.target.value; loadMarket(); });
  }
  var body = q('kitMkBody'); body.innerHTML = '<div class="kit-empty">Loading&hellip;</div>';
  api('kitMarket', { type: market.type || undefined, sort: market.sort }).then(function(d){
    if(!d.open){ body.innerHTML = '<div class="kit-empty">The Kit Market is not open yet.</div>'; return; }
    market.items = d.items;
    q('kitMkNote').textContent = 'Every item is unique, and the creator earns ' + d.royaltyPct + '% of every resale.';
    body.innerHTML = d.items.length ? '<div class="kit-grid">' + d.items.map(function(i){ return cardHtml(i, { market: true }); }).join('') + '</div>' : '<div class="kit-empty">Nothing is for sale right now. Check back soon.</div>';
  }).catch(function(e){ body.innerHTML = '<div class="kit-empty">' + esc(errMsg(e)) + '</div>'; });
}

/* ================================================================= ITEM WINDOW */
function openItem(id){
  api('kitItem', { id: id }).then(function(d){ showItem(d.item); }).catch(function(e){ toast(errMsg(e), 'bad'); });
}
function showItem(it){
  var worn = state.kit && state.kit.equipped && state.kit.equipped[it.type] === it.id;
  var staff = isOps(), mine = !!it.mine;
  var acts = '';
  if(it.status === 'listed' && !mine) acts += '<button class="kit-btn teal" data-a="buy">Buy for ' + fmt(it.price) + '</button>';
  if(mine && it.status === 'owned'){ acts += '<button class="kit-btn teal" data-a="' + (worn ? 'off' : 'wear') + '">' + (worn ? 'Take off' : 'Wear it') + '</button>'; if(state.selling && state.selling.open) acts += '<button class="kit-btn ghost" data-a="list">Sell</button>'; }
  if(mine && (it.status === 'listed' || it.status === 'pending')) acts += '<button class="kit-btn ghost" data-a="price">Change price</button><button class="kit-btn ghost" data-a="cancel">Take off sale</button>';
  if(it.snapshot) acts += '<button class="kit-btn ghost" data-a="view3d">View in 3D</button>';
  if(staff && !mine && (it.status === 'listed' || it.status === 'pending')) acts += '<button class="kit-btn red" data-a="scancel">Cancel listing (staff)</button>';
  if(staff && it.status !== 'removed') acts += '<button class="kit-btn red" data-a="takedown">Remove from IFWL (staff)</button>';
  var hist = (it.history || []).map(function(h){
    var what = h.event === 'created' ? 'Created by ' + esc(h.to) : h.event === 'sold' ? 'Sold: ' + esc(h.from) + ' to ' + esc(h.to) : h.event === 'resold' ? 'Resold: ' + esc(h.from) + ' to ' + esc(h.to) : h.event === 'voided' ? 'Sale reversed by the Owner' : esc(h.event);
    return '<li><span>' + what + (h.price ? ' for ' + fmt(h.price) : '') + '</span><span>' + esc(when(h.atMs)) + '</span></li>';
  }).join('');
  var ov = dlg('<div class="kit-dlg-body"><div><div class="kit-dlg-img">' + (it.previewUrl ? '<img src="' + esc(it.previewUrl) + '" alt="' + esc(it.title) + '">' : '<span class="kit-note">No picture</span>') + '</div>'
    + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="kit-like' + (it.likedByMe ? ' on' : '') + '" data-a="like" type="button"><span>' + (it.likedByMe ? '&#9829;' : '&#9825;') + '</span> <b>' + fmt(it.likeCount) + '</b></button>' + (!mine ? '<button class="kit-link" data-a="report" type="button">Report a problem</button>' : '') + '</div></div>'
    + '<div><h3>' + esc(it.title) + '</h3><div class="kit-note">' + (it.type === 'helmet' ? 'Helmet' : 'Race suit') + ' &middot; one of a kind' + (it.status === 'pending' ? ' &middot; waiting for a steward to check it' : '') + (['declined', 'cancelled', 'removed'].indexOf(it.status) >= 0 ? ' &middot; ' + esc(it.status) : '') + '</div>'
    + '<dl class="kit-facts"><dt>Created by</dt><dd>' + esc(it.creatorName || '-') + '</dd><dt>Owner</dt><dd>' + esc(it.ownerName || '-') + '</dd>' + (it.status === 'listed' ? '<dt>Price</dt><dd><b>' + fmt(it.price) + ' credits</b></dd>' : '') + '<dt>Times sold</dt><dd>' + fmt(it.salesCount) + '</dd></dl>'
    + (it.closedReason ? '<div class="kit-note bad">' + esc(it.closedReason) + '</div>' : '')
    + '<div class="kit-card-actions" style="margin:12px 0">' + acts + '</div>'
    + (hist ? '<h4>Owner history</h4><ul class="kit-hist">' + hist + '</ul>' : '')
    + '<h4>Comments</h4><div class="kit-comments" id="kitCmts"><div class="kit-note">Loading&hellip;</div></div><div class="kit-row"><input type="text" id="kitCmtIn" maxlength="300" placeholder="Say something nice" aria-label="Comment"><button class="kit-btn small teal" data-a="comment" type="button">Post</button></div></div></div>');
  function close(){ ov.close(); }
  function loadC(){
    api('kitItemComments', { itemId: it.id }).then(function(d){
      var box = ov.querySelector('#kitCmts'); if(!box) return;
      box.innerHTML = d.comments.length ? d.comments.map(function(c){ return '<div class="kit-comment">' + (c.avatar ? '<img alt="" src="' + esc(c.avatar) + '">' : '<img alt="" src="' + esc(K.STOCK) + '">') + '<div><b>' + esc(c.name || 'Driver') + '</b><small>' + esc(when(c.atMs)) + '</small>' + (c.canDelete ? '<button class="del" data-del="' + esc(c.id) + '" type="button">delete</button>' : '') + '<div>' + esc(c.text) + '</div></div></div>'; }).join('') : '<div class="kit-note">No comments yet.</div>';
    }).catch(function(){});
  }
  loadC();
  ov.addEventListener('click', function(e){
    var del = e.target.closest('[data-del]');
    if(del){ api('kitItemCommentDelete', null, { itemId: it.id, commentId: del.getAttribute('data-del') }).then(loadC).catch(function(er){ toast(errMsg(er), 'bad'); }); return; }
    var b = e.target.closest('[data-a]'); if(!b) return; var a = b.getAttribute('data-a');
    if(a === 'like'){ api('kitItemLike', null, { itemId: it.id }).then(function(r){ b.classList.toggle('on', r.liked); b.querySelector('span').innerHTML = r.liked ? '&#9829;' : '&#9825;'; b.querySelector('b').textContent = fmt(r.likeCount); }).catch(function(er){ toast(errMsg(er), 'bad'); }); }
    else if(a === 'comment'){ var inp = ov.querySelector('#kitCmtIn'), t = inp.value.trim(); if(!t) return; api('kitItemComment', null, { itemId: it.id, text: t }).then(function(){ inp.value = ''; loadC(); }).catch(function(er){ toast(errMsg(er), 'bad'); }); }
    else if(a === 'report'){ ask({ title: 'Report a problem', ok: 'Send report', fields: [{ id: 'reason', label: 'What is wrong?', type: 'textarea', help: 'For example: it uses a copyrighted picture or a company logo.' }], validate: function(v){ return String(v.reason).trim().length < 3 ? 'Please tell us what is wrong.' : ''; } }).then(function(v){ if(!v) return; api('kitReport', null, { itemId: it.id, reason: v.reason }).then(function(){ toast('Thank you. A steward will take a look.', 'good'); }).catch(function(er){ toast(errMsg(er), 'bad'); }); }); }
    else if(a === 'view3d'){ K.openViewer({ title: it.title, itemId: it.id, item: it, view: { item: it.type, pose: 'crossed', helmet: true } }); }
    else if(a === 'buy'){ buy(it, close); }
    else if(a === 'wear' || a === 'off'){ close(); equip(it, a === 'wear'); }
    else if(a === 'list'){ close(); listForSale(it); }
    else if(a === 'price'){ close(); changePrice(it); }
    else if(a === 'cancel'){ close(); cancelSale(it); }
    else if(a === 'scancel'){ staffClose(it, 'kitStaffCancel', 'Cancel this listing', close); }
    else if(a === 'takedown'){ staffClose(it, 'kitStaffTakedown', 'Remove this item from IFWL', close); }
  });
}
function buy(it, closeFn){
  var bal = (state.wallet && state.wallet.balance) || 0;
  ask({ title: 'Buy "' + it.title + '"', ok: 'Buy it now',
    intro: 'Price: <b>' + fmt(it.price) + ' credits</b>. Your Kit wallet holds <b>' + fmt(bal) + '</b>; if that is not enough the rest comes from your season credits. This item is one of a kind: once you buy it nobody else can.', fields: [] })
    .then(function(v){
      if(!v) return;
      api('kitBuy', null, { itemId: it.id }).then(function(r){
        if(closeFn) closeFn();
        state.wallet = { balance: r.balance };
        return refreshState().then(function(){
          afterChange();
          say('It is yours', 'You bought <b>' + esc(it.title) + '</b> for ' + fmt(r.price) + ' credits. Find it in My Collection and wear it to put it on your avatar.', 'Go to My Collection').then(function(){ showTab('collection'); });
        });
      }).catch(function(e){ toast(errMsg(e), 'bad'); });
    });
}
function staffClose(it, action, title, closeFn){
  ask({ title: title, ok: 'Do it', danger: true, intro: action === 'kitStaffTakedown' ? 'If someone has already bought it they are refunded in full and the creator\'s earnings from that sale are taken back.' : 'If it is a new design, the creator\'s listing fee is refunded.', fields: [{ id: 'reason', label: 'Reason (the creator is told)', type: 'textarea' }], validate: function(v){ return String(v.reason).trim().length < 3 ? 'A reason is required.' : ''; } })
    .then(function(v){ if(!v) return; api(action, null, { itemId: it.id, reason: v.reason }).then(function(r){ if(closeFn) closeFn(); toast(r.refunded ? 'Done. ' + fmt(r.refunded) + ' credits refunded.' : 'Done.', 'good'); afterChange(); }).catch(function(e){ toast(errMsg(e), 'bad'); }); });
}

/* ================================================================= WALLET */
function loadWallet(){
  var pane = q('kitPane_wallet'); pane.innerHTML = '<div class="kit-empty">Loading&hellip;</div>';
  api('kitMine').then(function(d){
    state.wallet = d.wallet; paintHead();
    var s = d.selling || state.selling || {};
    var rows = (d.ledger || []).map(function(l){ return '<tr><td>' + esc(when(l.dateMs)) + '</td><td>' + esc(l.text || l.type) + '</td><td class="num ' + (l.amount >= 0 ? 'pos' : 'neg') + '">' + (l.amount >= 0 ? '+' : '') + fmt(l.amount) + '</td></tr>'; }).join('');
    pane.innerHTML = '<div class="kit-section"><h3>Your balance</h3><div class="kit-row" style="gap:10px;flex-wrap:wrap;margin-bottom:10px"><div class="kit-chip"><span>Kit wallet (kept for life)</span><strong>' + fmt(d.wallet.balance) + '</strong></div><div class="kit-chip"><span>Career credits (this season)</span><strong>' + fmt(d.wallet.career || 0) + '</strong></div><button type="button" class="kit-btn teal" data-w="topup">Top up balance</button></div>'
      + '<p class="kit-note">Credits you earn from selling in the Kit Market go here and <b>stay with you for life</b>: they are not reset between seasons, and neither are the helmets and suits you collect. When you buy something, your Kit wallet is used first, then your season career credits.</p>'
      + '<p class="kit-note">How selling works: a new design costs ' + fmt(s.fee || 0) + ' credits to list. On the first sale the league keeps ' + (s.cutPct || 0) + '% and you get the rest. After that the creator earns ' + (s.royaltyPct || 0) + '% of every resale for life, the league keeps ' + (s.cutPct || 0) + '%, and the seller gets the rest.</p></div>'
      + '<div class="kit-section"><h3>Recent activity</h3>' + (rows ? '<div class="kit-scroll"><table class="kit-table"><thead><tr><th>When</th><th>What</th><th class="num">Credits</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="kit-empty">Nothing yet.</div>') + '</div>';
  }).catch(function(e){ pane.innerHTML = '<div class="kit-empty">' + esc(errMsg(e)) + '</div>'; });
}

/* ================================================================= STAFF */
function loadStaff(){
  var pane = q('kitPane_staff'); pane.innerHTML = '<div class="kit-empty">Loading&hellip;</div>';
  var jobs = [api('kitApprovalsList')];
  if(isOwner()) jobs.push(api('kitSettingsGet'), api('kitOwnerSales'));
  Promise.all(jobs).then(function(r){
    var ap = r[0], html = '';
    var dot = q('kitStaffDot'); if(dot){ dot.textContent = ap.items.length; dot.hidden = !ap.items.length; }
    html += '<div class="kit-section"><h3>Waiting for approval (' + ap.items.length + ')</h3><p class="kit-note">Designs that use members\' own pictures. Check there is no copyrighted artwork or company logos, then approve or decline. Declining refunds the creator\'s listing fee.</p>'
      + (ap.items.length ? '<div class="kit-grid">' + ap.items.map(function(i){ return '<div class="kit-card"><div class="kit-badges"><span class="kit-badge ' + i.type + '">' + i.type + '</span></div><div class="kit-card-img">' + (i.previewUrl ? '<img loading="lazy" src="' + esc(i.previewUrl) + '" alt="">' : '') + '</div><div class="kit-card-body"><div class="kit-card-title">' + esc(i.title) + '</div><div class="kit-card-sub">by ' + esc(i.creatorName || '-') + ' &middot; ' + fmt(i.price) + ' credits &middot; ' + Object.keys(i.images || {}).length + ' picture(s)</div><div class="kit-card-actions"><button class="kit-btn small ghost" data-s="view" data-id="' + esc(i.id) + '">View in 3D</button><button class="kit-btn small teal" data-s="approve" data-id="' + esc(i.id) + '">Approve</button><button class="kit-btn small red" data-s="decline" data-id="' + esc(i.id) + '">Decline</button></div></div></div>'; }).join('') + '</div>' : '<div class="kit-empty">Nothing waiting.</div>') + '</div>';
    html += '<div class="kit-section"><h3>Reports (' + ap.reports.length + ')</h3>' + (ap.reports.length ? '<div class="kit-scroll"><table class="kit-table"><thead><tr><th>When</th><th>Reason</th><th></th></tr></thead><tbody>' + ap.reports.map(function(x){ return '<tr><td>' + esc(when(x.atMs)) + '</td><td>' + esc(x.reason) + '</td><td><button class="kit-btn small ghost" data-s="open" data-id="' + esc(x.itemId) + '">Open item</button> <button class="kit-btn small ghost" data-s="resolve" data-id="' + esc(x.id) + '">Resolve</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="kit-empty">No open reports.</div>') + '</div>';
    html += '<div class="kit-section"><h3>Remove a driver\'s avatar</h3><p class="kit-note">Sends the driver back to the plain white figure until they save their kit again.</p><div class="kit-row"><input type="text" id="kitClrId" placeholder="Driver Discord ID" inputmode="numeric" style="max-width:260px"><button class="kit-btn small red" data-s="clear" type="button">Remove avatar</button></div></div>';
    html += '<div class="kit-section"><h3>Group photo</h3><p class="kit-note">Line up every driver who has made their own avatar (Patreons in the front row), choose your own background, and download a picture. Nothing is saved to IFWL; it is drawn in your browser.</p><div class="kit-row"><button class="kit-btn teal" data-s="group" type="button">Open the group photo maker</button></div></div>';
    if(isOwner()){
      var st = r[1], sales = r[2];
      var cups = Object.keys(st.cupMap || {}).map(function(k){ return '<div class="kit-row"><input type="text" data-cup="id" value="' + esc(k) + '" aria-label="Cup id"><input type="text" data-cup="label" value="' + esc(st.cupMap[k]) + '" aria-label="Cup name"><button type="button" class="kit-btn small ghost" data-s="cupdel">Remove</button></div>'; }).join('');
      var nf = function(id, label, v, help){ return '<div class="kit-field"><label for="ks_' + id + '">' + label + '</label><input id="ks_' + id + '" type="number" value="' + esc(v) + '"' + (help ? '><div class="help">' + help + '</div>' : '>') + '</div>'; };
      html += '<div class="kit-section kit-set-wrap"><h3>Owner settings</h3><div class="kit-set">'
        + '<div class="kit-field"><label for="ks_rollout">Who can use the avatar and kit</label><select id="ks_rollout"><option value="off">Nobody</option><option value="owner">Owner only (testing)</option><option value="gold">Gold Patreon and staff</option><option value="everyone">Everyone</option></select></div>'
        + '<label class="kit-check"><input type="checkbox" id="ks_sellingOpen"' + (st.sellingOpen ? ' checked' : '') + '><span><b>Selling and collecting open</b> (Kit Market, My Collection purchases)</span></label>'
        + '<label class="kit-check"><input type="checkbox" id="ks_podiumsOpen"' + (st.podiumsOpen ? ' checked' : '') + '><span><b>Race podiums on</b> (Race Results and Home)</span></label>'
        + '<label class="kit-check"><input type="checkbox" id="ks_colourPatterns"' + (st.colourPatterns ? ' checked' : '') + '><span><b>Colour-only members may pick patterns and layouts</b></span></label>'
        + nf('listingFee', 'Listing fee (credits)', st.listingFee) + nf('leagueCutPct', 'League cut (%)', st.leagueCutPct) + nf('royaltyPct', 'Creator royalty on resales (%)', st.royaltyPct)
        + nf('minPrice', 'Lowest price', st.minPrice) + nf('maxPrice', 'Highest price', st.maxPrice) + nf('maxOpenListings', 'New listings open at once, per creator', st.maxOpenListings)
        + '<div class="kit-field wide"><label>Podium cups (PC races)</label><div class="kit-cups" id="ks_cups">' + cups + '</div><div style="margin-top:8px"><button type="button" class="kit-btn small ghost" data-s="cupadd">Add a cup</button></div><div class="help">The cup number in the race results and the name shown above that podium, for example 0 = Pro and 3 = Am.</div></div>'
        + '</div><div class="kit-bar" style="margin-top:14px"><button class="kit-btn teal" type="button" data-s="savesettings">Save settings</button><span class="kit-err" id="ks_msg"></span></div></div>';
      html += '<div class="kit-section"><h3>Sales</h3><p class="kit-note">League treasury from Kit Market cuts: <b>' + fmt(sales.treasuryBalance) + ' credits</b>. Voiding a sale gives the buyer their credits back and returns the item to the seller. It only works on the most recent sale and while the buyer still owns the item.</p>'
        + (sales.sales.length ? '<div class="kit-scroll"><table class="kit-table"><thead><tr><th>When</th><th>Item</th><th class="num">Price</th><th class="num">League</th><th class="num">Royalty</th><th>Kind</th><th></th></tr></thead><tbody>' + sales.sales.map(function(x){ return '<tr><td>' + esc(when(x.dateMs)) + '</td><td>' + esc(x.title) + '</td><td class="num">' + fmt(x.price) + '</td><td class="num">' + fmt(x.leagueCut) + '</td><td class="num">' + fmt(x.royalty) + '</td><td>' + (x.voided ? 'voided' : esc(x.kind)) + '</td><td>' + (x.voided ? '' : '<button class="kit-btn small red" data-s="void" data-id="' + esc(x.id) + '">Void</button>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="kit-empty">No sales yet.</div>') + '</div>';
      pane.innerHTML = html; var sel = q('ks_rollout'); if(sel) sel.value = st.rollout;
    } else pane.innerHTML = html;
    pane._ap = ap;
  }).catch(function(e){ pane.innerHTML = '<div class="kit-empty">' + esc(errMsg(e)) + '</div>'; });
}
function openGroupPhoto(){
  var go = function(){ if(window.IFWL_KIT_GROUP) window.IFWL_KIT_GROUP.open(); };
  if(window.IFWL_KIT_GROUP) return go();
  var sc = document.createElement('script'); sc.src = K.ASSETS + 'js/15-kit-group.js?v=fffd125c'; sc.onload = go;
  sc.onerror = function(){ toast('The group photo maker could not be loaded. Refresh the page and try again.', 'bad'); };
  document.head.appendChild(sc);
}
function staffClick(e){
  var b = e.target.closest('[data-s]'); if(!b) return; var a = b.getAttribute('data-s'), id = b.getAttribute('data-id'), pane = q('kitPane_staff');
  if(a === 'view'){ var it = (pane._ap.items || []).filter(function(i){ return i.id === id; })[0]; if(it) K.openViewer({ title: it.title, itemId: it.id, item: { id: it.id, type: it.type, title: it.title, snapshot: { design: it.design, images: it.images } }, view: { item: it.type, pose: 'crossed', helmet: true } }); }
  else if(a === 'approve'){ api('kitApprove', null, { itemId: id }).then(function(){ toast('Approved. It is now in the Kit Market.', 'good'); loadStaff(); }).catch(function(er){ toast(errMsg(er), 'bad'); }); }
  else if(a === 'decline'){ ask({ title: 'Decline this design', ok: 'Decline', danger: true, intro: 'The creator is told the reason and their listing fee is refunded.', fields: [{ id: 'reason', label: 'Reason', type: 'textarea' }], validate: function(v){ return String(v.reason).trim().length < 3 ? 'A reason is required.' : ''; } }).then(function(v){ if(!v) return; api('kitDecline', null, { itemId: id, reason: v.reason }).then(function(){ toast('Declined and refunded.', 'good'); loadStaff(); }).catch(function(er){ toast(errMsg(er), 'bad'); }); }); }
  else if(a === 'open'){ openItem(id); }
  else if(a === 'resolve'){ api('kitReportResolve', null, { reportId: id }).then(function(){ loadStaff(); }).catch(function(er){ toast(errMsg(er), 'bad'); }); }
  else if(a === 'clear'){ var v = q('kitClrId').value.trim(); if(!/^\d{5,25}$/.test(v)){ toast('Enter the driver\'s Discord ID (numbers only).', 'bad'); return; } api('kitAvatarClear', null, { id: v }).then(function(){ toast('Avatar removed.', 'good'); q('kitClrId').value = ''; }).catch(function(er){ toast(errMsg(er), 'bad'); }); }
  else if(a === 'group'){ openGroupPhoto(); }
  else if(a === 'cupadd'){ var d = document.createElement('div'); d.className = 'kit-row'; d.innerHTML = '<input type="text" data-cup="id" aria-label="Cup id" placeholder="cup #"><input type="text" data-cup="label" aria-label="Cup name" placeholder="name"><button type="button" class="kit-btn small ghost" data-s="cupdel">Remove</button>'; q('ks_cups').appendChild(d); }
  else if(a === 'cupdel'){ b.closest('.kit-row').remove(); }
  else if(a === 'savesettings'){
    var body = { rollout: q('ks_rollout').value, sellingOpen: q('ks_sellingOpen').checked, podiumsOpen: q('ks_podiumsOpen').checked, colourPatterns: q('ks_colourPatterns').checked };
    ['listingFee', 'leagueCutPct', 'royaltyPct', 'minPrice', 'maxPrice', 'maxOpenListings'].forEach(function(k){ body[k] = Number(q('ks_' + k).value); });
    var cm = {}; q('ks_cups').querySelectorAll('.kit-row').forEach(function(r){ var k = r.querySelector('[data-cup=id]').value.trim(), l = r.querySelector('[data-cup=label]').value.trim(); if(k !== '' && l) cm[k] = l; });
    if(Object.keys(cm).length) body.cupMap = cm;
    var msg = q('ks_msg'); msg.textContent = 'Saving...';
    api('kitSettingsSave', null, body).then(function(){ msg.textContent = ''; toast('Settings saved.', 'good'); return refreshState(); }).catch(function(er){ msg.textContent = errMsg(er); });
  }
  else if(a === 'void'){ ask({ title: 'Void this sale?', ok: 'Void it', danger: true, intro: 'The buyer gets their credits back, the seller and creator earnings are taken back, and the item returns to the seller.', fields: [] }).then(function(v){ if(!v) return; api('kitVoidSale', null, { saleId: id }).then(function(){ toast('Sale voided.', 'good'); loadStaff(); }).catch(function(er){ toast(errMsg(er), 'bad'); }); }); }
}

/* ================================================================= wiring */
document.addEventListener('click', function(e){
  var pane = e.target.closest && e.target.closest('.kit-pane'); if(!pane) return;
  if(e.target.closest('[data-w=topup]')){ topUp(); return; }
  if(pane.id === 'kitPane_staff') { staffClick(e); return; }
  var act = e.target.closest('[data-act]');
  if(act){
    e.stopPropagation(); var id = act.getAttribute('data-id'), it = itemFromCache(id), a = act.getAttribute('data-act'); if(!it) return;
    if(a === 'wear' || a === 'off') equip(it, a === 'wear'); else if(a === 'list') listForSale(it); else if(a === 'price') changePrice(it); else if(a === 'cancel') cancelSale(it);
    return;
  }
  var card = e.target.closest('[data-open]'); if(card) openItem(card.getAttribute('data-open'));
});
window.IFWL_KIT_PAGE = { boot: boot };
K.onAuth(function(){ boot(); });
})();
