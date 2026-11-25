/* ============================================================
   IFWL STREAM CONTROL (commentators, Owner, Ops)
   Mounts into every [data-commslive] element (licence-home.html, and the #commsLivePanel on licence.html).
   - ALWAYS visible: what is on the stream now (with Hide) and the penalty banners on screen (Served, -1 lap, remove).
   - A grid of square buttons: Penalty, Prepared cards, Build a card, Interview, Go live, Stream badge, and (when the page has them) Driver Info, Drivers to Watch, Driver Lookup, Field Report.
     Press a button to open that section, press it again (or another button) to close it. Nothing is open until you ask, and the last one you used comes back after a refresh.
   - Live penalty banners: pick the driver, laps left, then Drive-through or Stop-go. Up to three red banners at the top of the stream; Served shows the green Penalty cleared pop-up.
   - Go live / off air (which commentator is on air; badge on the stream)
   - Stream badge: Rerun or RACE TEAM LIVE FEED (one button).
   - Shared prepared deck: Grid line-up, Battle for, Driver compare, Leaders, Team (name, car number, drivers; highlight one driver). Build cards ahead, push with one click.
   - Post race interview mode: pick up to three drivers, click who is on air now (right 40% of the stream).
   Everything is enforced by the server; this page only shows or hides things to match. Anyone without the
   Commentator / Owner / Ops role gets a 403 and the panel stays hidden.
   ============================================================ */
(function(){
'use strict';
if (window.IFWL_COMMS_PANEL) return; window.IFWL_COMMS_PANEL = true;

var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };
var FN = function(){ return (window.IFWL_AUTH && window.IFWL_AUTH.FUNCTION) || ''; };
var TOKEN = function(){ try { return (window.IFWL_AUTH && window.IFWL_AUTH.sessionToken && window.IFWL_AUTH.sessionToken()) || ''; } catch (e) { return ''; } };
var TYPES = {
  grid:    { label: 'Grid line-up', min: 2, max: 20, note: 'Drivers in grid order, two per row. The rows drop in one after another down the screen with a clear background, so keep it to about 10 drivers per card (make a second card for the rest).' },
  battle:  { label: 'Battle for', min: 2, max: 2, note: 'Exactly two drivers. The title becomes "BATTLE FOR ..." (for example 3RD PLACE or THE LEAD).' },
  compare: { label: 'Driver compare', min: 1, max: 2, note: 'One or two drivers, shown with their average finish and IFWL ranking.' },
  team:    { label: 'Team', min: 1, max: 8, note: 'Team name and car number, then the team\'s drivers in the order you want them shown. Push the whole team, or press a driver\'s name on the saved card to highlight just them (the others dim).' },
  leaders: { label: 'Leaders', min: 1, max: 8, note: 'One driver per class. Type a class name next to each driver if you want one (Pro, Am, Beginner, GT3, GT4, anything). Leave it blank for no label.' }
};

function api(name, opts){
  opts = opts || {};
  var url = FN() + '?' + name + '=1&token=' + encodeURIComponent(TOKEN()) + (opts.q ? '&' + opts.q : '');
  var init = { cache: 'no-store' };
  if (opts.body){ init.method = 'POST'; init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(opts.body); }
  return fetch(url, init).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(d){
      if (!r.ok){ var e = new Error((d && d.error) || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
      return d;
    });
  });
}

var CSS = '' +
'.cm{ --cm-line:rgba(255,255,255,.16); --cm-soft:rgba(255,255,255,.05); --cm-teal:#14c8b0; --cm-red:#ff4d55; --cm-amber:#ffb454; font-size:14px; line-height:1.4; }' +
'.cm *{ box-sizing:border-box; }' +
'.cm h3{ margin:0 0 4px; font-size:18px; }' +
'.cm h4{ margin:0 0 6px; font-size:12px; letter-spacing:.12em; text-transform:uppercase; opacity:.75; }' +
'.cm .cm-sec{ border:1px solid var(--cm-line); background:var(--cm-soft); border-radius:12px; padding:14px; margin-top:12px; }' +
'.cm .cm-help{ opacity:.78; font-size:13px; margin:4px 0 8px; }' +
'.cm .cm-row{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }' +
'.cm .cm-grow{ flex:1 1 160px; min-width:0; }' +
'.cm button{ font:inherit; cursor:pointer; border-radius:8px; border:1px solid var(--cm-line); background:rgba(255,255,255,.09); color:inherit; padding:6px 12px; }' +
'.cm button:hover{ background:rgba(255,255,255,.16); }' +
'.cm button:disabled{ opacity:.45; cursor:default; }' +
'.cm button.go{ background:var(--cm-teal); color:#04141a; border-color:var(--cm-teal); font-weight:700; }' +
'.cm button.stop{ background:var(--cm-red); color:#fff; border-color:var(--cm-red); font-weight:700; }' +
'.cm button.amber{ background:var(--cm-amber); color:#1a1000; border-color:var(--cm-amber); font-weight:700; }' +
'.cm button.sm{ padding:3px 8px; font-size:12px; }' +
'.cm input[type=text]{ font:inherit; color:inherit; background:rgba(0,0,0,.28); border:1px solid var(--cm-line); border-radius:8px; padding:7px 10px; width:100%; }' +
'.cm .cm-tabs{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }' +
'.cm .cm-tabs button.on{ background:var(--cm-teal); color:#04141a; border-color:var(--cm-teal); font-weight:700; }' +
'.cm .cm-res{ margin-top:6px; border:1px solid var(--cm-line); border-radius:8px; max-height:210px; overflow:auto; }' +
'.cm .cm-res button{ display:block; width:100%; text-align:left; border:0; border-radius:0; background:transparent; border-bottom:1px solid var(--cm-line); }' +
'.cm .cm-res button small{ opacity:.7; margin-left:6px; }' +
'.cm .cm-pick{ margin-top:8px; display:grid; gap:6px; }' +
'.cm .cm-pi{ display:flex; align-items:center; gap:8px; border:1px solid var(--cm-line); border-radius:8px; padding:5px 8px; background:rgba(0,0,0,.18); }' +
'.cm .cm-pi .n{ flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }' +
'.cm .cm-pi .pos{ opacity:.7; width:26px; font-variant-numeric:tabular-nums; }' +
'.cm .cm-pi input[type=text]{ width:130px; padding:4px 8px; }' +
'.cm .cm-card{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; border:1px solid var(--cm-line); border-radius:10px; padding:8px 10px; margin-top:8px; background:rgba(0,0,0,.18); }' +
'.cm .cm-card.on{ border-color:var(--cm-red); box-shadow:0 0 0 1px var(--cm-red) inset; }' +
'.cm .cm-card .t{ font-weight:700; }' +
'.cm .cm-card .s{ opacity:.75; font-size:13px; flex:1 1 220px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }' +
'.cm .cm-tag{ display:inline-block; font-size:11px; font-weight:800; letter-spacing:.1em; padding:2px 8px; border-radius:99px; background:var(--cm-teal); color:#04141a; }' +
'.cm .cm-tag.red{ background:var(--cm-red); color:#fff; }' +
'.cm .cm-tag.amber{ background:var(--cm-amber); color:#1a1000; }' +
'.cm .cm-msg{ margin-top:8px; min-height:18px; font-size:13px; }' +
'.cm .cm-msg.err{ color:var(--cm-red); }' +
'.cm .cm-comm{ display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--cm-line); }' +
'.cm .cm-comm:last-child{ border-bottom:0; }' +
'.cm .cm-comm img{ width:34px; height:34px; border-radius:50%; object-fit:cover; background:rgba(255,255,255,.1); }' +
'.cm .cm-comm .n{ flex:1 1 auto; font-weight:600; }' +
'.cm .cm-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(124px,1fr)); gap:10px; margin-top:14px; }' +
'.cm .cm-tile{ aspect-ratio:1/1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; text-align:center; padding:8px; border-radius:14px; border:1px solid var(--cm-line); background:rgba(255,255,255,.07); }' +
'.cm .cm-tile .tl{ font-weight:800; font-size:15px; line-height:1.15; }' +
'.cm .cm-tile .ts{ font-size:12px; opacity:.72; line-height:1.2; }' +
'.cm .cm-tile.on{ background:var(--cm-teal); border-color:var(--cm-teal); color:#04141a; }' +
'.cm .cm-tile.on .ts{ opacity:.85; }' +
'.cm .cm-tile.red{ border-color:var(--cm-red); box-shadow:0 0 0 1px var(--cm-red) inset; }' +
'.cm .cm-tile.red .ts{ color:var(--cm-red); opacity:1; font-weight:700; }' +
'.cm .cm-tile.on.red .ts{ color:#04141a; }' +
'.cm .cm-tile.amber{ border-color:var(--cm-amber); box-shadow:0 0 0 1px var(--cm-amber) inset; }' +
'.cm .cm-tile.amber .ts{ color:var(--cm-amber); opacity:1; font-weight:700; }' +
'.cm .cm-tile.on.red .ts,.cm .cm-tile.on.amber .ts{ color:#04141a; }' +
'.cm .cm-pen{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; border:1px solid var(--cm-red); border-radius:10px; padding:8px 10px; margin-top:8px; background:rgba(255,77,85,.10); }' +
'.cm .cm-pen .pn{ flex:1 1 240px; min-width:0; }' +
'.cm .cm-pen .pl{ opacity:.85; margin-left:6px; font-variant-numeric:tabular-nums; }' +
'.cm .cm-pen .pb{ display:flex; gap:6px; flex-wrap:wrap; }' +
'.cm .cm-pen .pb button{ padding:8px 12px; }' +
'.cm .cm-chips{ display:flex; gap:6px; flex-wrap:wrap; align-items:center; }' +
'.cm .cm-chips button{ min-width:44px; padding:8px 10px; font-weight:700; }' +
'.cm .cm-chips button.on{ background:var(--cm-teal); color:#04141a; border-color:var(--cm-teal); }' +
'.cm .cm-chips input[type=number]{ width:70px; font:inherit; color:inherit; background:rgba(0,0,0,.28); border:1px solid var(--cm-line); border-radius:8px; padding:7px 8px; }' +
'.cm button.big{ padding:14px 22px; font-size:16px; font-weight:800; }' +
'.cm .cm-sec[hidden]{ display:none; }' +
'.cm .cm-open{ margin-top:4px; }' +
'.cm .cm-ivb{ display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }' +
'.cm .cm-ivb button{ padding:10px 14px; }' +
'.cm .cm-ivb button.air{ background:var(--cm-red); color:#fff; border-color:var(--cm-red); font-weight:800; }';

function mount(root){
  if (root.__cm) return; root.__cm = true;
  if (!document.getElementById('cm-style')){ var st = document.createElement('style'); st.id = 'cm-style'; st.textContent = CSS; document.head.appendChild(st); }
  var panelWrap = root.closest ? root.closest('#commsLivePanel') : null;
  function setVisible(on){
    [root, panelWrap].forEach(function(el){
      if (!el) return;
      if (on){ el.hidden = false; el.removeAttribute('hidden'); el.classList.remove('hidden'); if (el.style.display === 'none') el.style.display = ''; }
      else { el.hidden = true; el.style.display = 'none'; }
    });
  }
  setVisible(false);

  var S = { me: null, comms: [], live: null, compare: null, show: null, interview: null, mode: '', deck: [], penalties: [], cleared: null };
  var P = { picked: [], laps: 3 };                                   // penalty form state
  var openKey = ''; try { openKey = sessionStorage.getItem('ifwlCommsOpen') || ''; } catch (e) { openKey = ''; }
  var B = { type: 'grid', title: '', number: '', entries: [], editId: '' };      // deck builder state
  var IV = { entries: [] };                                          // interview picker state
  var busy = false, timer = null, quickTimer = null, lastSig = '', delTimer = null, delId = '';

  root.classList.add('cm');
  root.innerHTML = '' +
    '<h3>Stream control</h3>' +
    '<div class="cm-help">Everything here is shared by the whole commentary team. What you push shows on the live stream within a few seconds. Press a button to open that section.</div>' +
    '<div class="cm-sec" data-s="screen"></div>' +
    '<div class="cm-sec" data-s="penlive" hidden></div>' +
    '<div class="cm-grid" data-s="grid"></div>' +
    '<div class="cm-msg" data-s="msg"></div>' +
    '<div class="cm-open">' +
    '<div class="cm-sec" data-s="pen" data-sec="pen" hidden></div>' +
    '<div class="cm-sec" data-s="deck" data-sec="deck" hidden></div>' +
    '<div class="cm-sec" data-s="build" data-sec="build" hidden></div>' +
    '<div class="cm-sec" data-s="iv" data-sec="iv" hidden></div>' +
    '<div class="cm-sec" data-s="live" data-sec="live" hidden></div>' +
    '<div class="cm-sec" data-s="mode" data-sec="mode" hidden></div>' +
    '</div>';
  var $s = function(k){ return root.querySelector('[data-s="' + k + '"]'); };
  var msgEl = $s('msg');
  function say(t, err){ msgEl.textContent = t || ''; msgEl.className = 'cm-msg' + (err ? ' err' : ''); }

  /* ---------- search + pick widget ---------- */
  function Picker(host, cfg){
    var st = { list: cfg.list, q: '', results: [], t: null, seq: 0 };
    host.innerHTML = '<div class="cm-row"><input type="text" class="cm-grow" placeholder="' + esc(cfg.placeholder || 'Search by name or licence number (2+ letters)') + '" autocomplete="off"></div><div class="cm-res" hidden></div><div class="cm-pick"></div>';
    var inp = host.querySelector('input'), res = host.querySelector('.cm-res'), pick = host.querySelector('.cm-pick');
    function max(){ return cfg.max(); }
    function renderPick(){
      var L = st.list();
      pick.innerHTML = L.map(function(e, i){
        return '<div class="cm-pi" data-i="' + i + '">' +
          (cfg.ordered ? '<span class="pos">' + (i + 1) + '.</span>' : '') +
          '<span class="n">' + esc(e.name) + '</span>' +
          (cfg.labels ? '<input type="text" maxlength="30" placeholder="Class name (optional)" value="' + esc(e.label || '') + '" data-lab="' + i + '">' : '') +
          (cfg.ordered ? '<button class="sm" data-up="' + i + '" title="Move up">&#9650;</button><button class="sm" data-dn="' + i + '" title="Move down">&#9660;</button>' : '') +
          '<button class="sm" data-rm="' + i + '" title="Remove">&#10005;</button></div>';
      }).join('') || '<div class="cm-help">No drivers added yet.</div>';
      if (cfg.onChange) cfg.onChange();
    }
    pick.addEventListener('click', function(ev){
      var b = ev.target.closest('button'); if (!b) return; var L = st.list(), i;
      if (b.hasAttribute('data-rm')){ L.splice(Number(b.getAttribute('data-rm')), 1); }
      else if (b.hasAttribute('data-up')){ i = Number(b.getAttribute('data-up')); if (i > 0){ var t = L[i]; L[i] = L[i - 1]; L[i - 1] = t; } }
      else if (b.hasAttribute('data-dn')){ i = Number(b.getAttribute('data-dn')); if (i < L.length - 1){ var t2 = L[i]; L[i] = L[i + 1]; L[i + 1] = t2; } }
      renderPick();
    });
    pick.addEventListener('input', function(ev){ var el = ev.target; if (el.hasAttribute && el.hasAttribute('data-lab')) st.list()[Number(el.getAttribute('data-lab'))].label = el.value; });
    function search(){
      var q = inp.value.trim(); if (q.length < 2){ res.hidden = true; res.innerHTML = ''; return; }
      var my = ++st.seq;
      api('commsDriverSearch', { q: 'q=' + encodeURIComponent(q) }).then(function(d){
        if (my !== st.seq) return;
        var have = {}; st.list().forEach(function(e){ have[e.id] = 1; });
        st.results = (d.drivers || []).filter(function(x){ return !have[x.id]; });
        res.innerHTML = st.results.map(function(x, i){ return '<button data-add="' + i + '">' + esc(x.name) + '<small>' + esc([x.car ? '#' + x.car : '', x.num, x.team].filter(Boolean).join(' \u00b7 ')) + '</small></button>'; }).join('') || '<div class="cm-help" style="padding:8px">No match.</div>';
        res.hidden = false;
      }).catch(function(e){ say(e.message, true); });
    }
    inp.addEventListener('input', function(){ clearTimeout(st.t); st.t = setTimeout(search, 280); });
    res.addEventListener('click', function(ev){
      var b = ev.target.closest('button[data-add]'); if (!b) return; var x = st.results[Number(b.getAttribute('data-add'))]; if (!x) return;
      var L = st.list();
      if (L.length >= max()){ if (cfg.replace) L.length = 0; else { say('Maximum of ' + max() + ' drivers for this card. Remove one first.', true); return; } }
      say(''); L.push({ id: x.id, name: x.name, num: x.num, label: '' });
      inp.value = ''; res.hidden = true; res.innerHTML = ''; renderPick(); inp.focus();
    });
    renderPick();
    return { render: renderPick, clearSearch: function(){ inp.value = ''; res.hidden = true; res.innerHTML = ''; } };
  }

  /* ---------- sections ---------- */
  function renderLive(){
    var el = $s('live'), me = S.me || {};
    el.innerHTML = '<h4>On air (the LIVE badge)</h4>' +
      (S.comms.length ? S.comms.map(function(c){
        var can = me.canControlAll || c.isMe;
        return '<div class="cm-comm">' + (c.avatarUrl ? '<img alt="" src="' + esc(c.avatarUrl) + '">' : '<span style="width:34px"></span>') +
          '<span class="n">' + esc(c.name) + (c.isMe ? ' <small style="opacity:.6">(you)</small>' : '') + '</span>' +
          (c.live ? '<span class="cm-tag red">ON AIR</span>' : '') +
          (can ? '<button data-live="' + esc(c.id) + '" data-on="' + (c.live ? '0' : '1') + '" class="' + (c.live ? 'stop' : 'go') + '">' + (c.live ? 'Go off air' : 'Go live') + '</button>' : '') + '</div>';
      }).join('') : '<div class="cm-help">No commentators yet. A commentator appears here the first time they open this page.</div>');
  }
  function renderMode(){
    var on = S.mode === 'raceteam';
    $s('mode').innerHTML = '<h4>Stream badge</h4>' +
      '<div class="cm-row"><span class="cm-tag ' + (on ? 'red' : '') + '">' + (on ? 'RACE TEAM LIVE FEED' : 'RERUN OF PAST EVENTS') + '</span>' +
      '<button data-mode="' + (on ? '' : 'raceteam') + '" class="' + (on ? 'stop' : 'amber') + '">' + (on ? 'Back to rerun' : 'Switch to Race Team Live Feed') + '</button></div>' +
      '<div class="cm-help">Race Team Live Feed changes the badge in the top-left of the stream so the race team can share it. The same pop-ups run as on the rerun. It switches itself back to rerun after 12 hours. A commentator going live or an interview still show their own badge.</div>';
  }
  function onScreenId(){ return (S.show && S.show.deckId) || (S.compare && S.compare.deckId) || ''; }
  function renderScreen(){
    var el = $s('screen'), parts = [];
    if (S.show) parts.push('<span class="cm-tag red">ON SCREEN</span> ' + esc(TYPES[S.show.type] ? TYPES[S.show.type].label : S.show.type) + (S.show.title ? ': ' + esc((S.show.number ? '#' + S.show.number + ' ' : '') + S.show.title) : ''));
    if (S.compare) parts.push('<span class="cm-tag red">ON SCREEN</span> Driver compare: ' + S.compare.cards.map(function(c){ return esc(c.name); }).join(' vs '));
    if (S.interview) parts.push('<span class="cm-tag amber">INTERVIEW MODE</span> ' + (S.interview.onAirId ? 'on air: ' + esc((S.interview.cards.filter(function(c){ return c.id === S.interview.onAirId; })[0] || {}).name || '') : 'nobody on air yet'));
    el.innerHTML = '<h4>On the stream right now</h4>' + (parts.length ? parts.map(function(p){ return '<div style="margin:4px 0">' + p + '</div>'; }).join('') : '<div class="cm-help">No card on screen. The stream is running its normal pop-ups.</div>') +
      '<div class="cm-row" style="margin-top:8px"><button data-act="hide"' + ((S.show || S.compare) ? '' : ' disabled') + ' class="' + ((S.show || S.compare) ? 'stop' : '') + '">Hide card from stream</button></div>';
  }
  function cardSummary(c){ return (c.type === 'team' && c.number ? '#' + c.number + ' - ' : '') + (c.entries || []).map(function(e, i){ return (c.type === 'grid' ? (i + 1) + '. ' : '') + e.name + (e.label ? ' (' + e.label + ')' : ''); }).join(c.type === 'battle' || c.type === 'compare' ? '  vs  ' : ', '); }
  function renderDeck(){
    var el = $s('deck'), on = onScreenId();
    el.innerHTML = '<h4>Prepared cards (shared deck)</h4>' +
      '<div class="cm-help">Build cards ahead of time while the race runs, then push each one to the stream with a single click as fights develop. Add as many as you like (up to 40).</div>' +
      (S.deck.length ? S.deck.map(function(c){
        var isOn = on && c.id === on;
        return '<div class="cm-card' + (isOn ? ' on' : '') + '" data-id="' + esc(c.id) + '"><span class="cm-tag">' + esc((TYPES[c.type] || {}).label || c.type) + '</span>' +
          '<span class="t">' + esc(c.title || '') + '</span><span class="s">' + esc(cardSummary(c)) + '</span>' +
          (isOn ? '<span class="cm-tag red">ON SCREEN</span>' : '') +
          '<button class="go" data-push="' + esc(c.id) + '"' + (S.interview ? ' disabled title="Stop interview mode first"' : '') + '>' + (isOn ? 'Push again' : 'Push to stream') + '</button>' +
          '<button class="sm" data-edit="' + esc(c.id) + '">Edit</button>' +
          '<button class="sm" data-del="' + esc(c.id) + '">' + (delId === c.id ? 'Sure?' : 'Delete') + '</button>' +
          (c.type === 'team' ? '<div style="flex:1 1 100%;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="cm-help" style="margin:0">Highlight one driver:</span>' + (c.entries || []).map(function(e){ var f = S.show && S.show.deckId === c.id && S.show.focusId === e.id; return '<button class="sm' + (f ? ' amber' : '') + '" data-focus-card="' + esc(c.id) + '" data-focus-id="' + esc(e.id) + '"' + (S.interview ? ' disabled' : '') + '>' + esc(e.name) + '</button>'; }).join('') + '</div>' : '') + '</div>';
      }).join('') : '<div class="cm-help">Nothing prepared yet. Use "Build a card" below.</div>');
  }
  var gridPicker = null;
  function renderBuild(){
    var el = $s('build'), T = TYPES[B.type];
    el.innerHTML = '<h4>' + (B.editId ? 'Edit card' : 'Build a card') + '</h4>' +
      '<div class="cm-tabs">' + Object.keys(TYPES).map(function(k){ return '<button data-type="' + k + '" class="' + (B.type === k ? 'on' : '') + '">' + TYPES[k].label + '</button>'; }).join('') + '</div>' +
      '<div class="cm-help">' + esc(T.note) + '</div>' +
      (B.type === 'compare' ? '' : '<div class="cm-row" style="margin-bottom:8px">' + (B.type === 'battle' ? '<b>BATTLE FOR</b>' : B.type === 'team' ? '<b>Team name</b>' : '<b>Title</b>') +
        '<input type="text" class="cm-grow" data-title maxlength="60" placeholder="' + (B.type === 'battle' ? 'for example 3RD PLACE or THE LEAD' : B.type === 'leaders' ? 'LEADERS' : B.type === 'team' ? 'for example Red Line Racing' : 'STARTING GRID') + '" value="' + esc(B.title) + '">' +
        (B.type === 'team' ? '<b>Car number</b><input type="text" data-number maxlength="8" style="width:90px" placeholder="12" value="' + esc(B.number) + '">' : '') + '</div>') +
      '<div data-picker></div>' +
      '<div class="cm-row" style="margin-top:10px"><button class="go" data-save="0" disabled>' + (B.editId ? 'Save changes' : 'Save to deck') + '</button>' +
      '<button class="amber" data-save="1" disabled>' + (B.editId ? 'Save and push now' : 'Save and push now') + '</button>' + (B.editId ? '<button data-cancel>Cancel edit</button>' : '') +
      '<span class="cm-help" data-need></span></div>';
    gridPicker = Picker(el.querySelector('[data-picker]'), { list: function(){ return B.entries; }, max: function(){ return TYPES[B.type].max; }, ordered: B.type === 'grid' || B.type === 'leaders' || B.type === 'battle' || B.type === 'team', labels: B.type === 'leaders', onChange: syncBuildButtons });
  }
  function syncBuildButtons(){
    var el = $s('build'), T = TYPES[B.type], n = B.entries.length, ok = n >= T.min && n <= T.max;
    el.querySelectorAll('[data-save]').forEach(function(b){ b.disabled = !ok || busy; });
    var need = el.querySelector('[data-need]'); if (need) need.textContent = ok ? '' : (B.type === 'battle' ? 'Add exactly two drivers.' : B.type === 'grid' ? 'Add at least two drivers.' : 'Add at least one driver.');
  }
  var ivPicker = null;
  function renderIv(){
    var el = $s('iv'), iv = S.interview;
    if (iv){
      el.innerHTML = '<h4>Post race interview mode</h4>' +
        '<div class="cm-help">The stream badge says POST RACE INTERVIEW and normal pop-ups stop (driver wall messages still show). Click who is on air now: their avatar and full stats show on the right 40% of the screen.</div>' +
        '<div class="cm-ivb">' + iv.cards.map(function(c){ var on = iv.onAirId === c.id; return '<button data-air="' + esc(c.id) + '" class="' + (on ? 'air' : 'go') + '">' + (on ? 'ON AIR NOW: ' : 'On air now: ') + esc(c.name) + '</button>'; }).join('') + '</div>' +
        '<div class="cm-row" style="margin-top:10px"><button data-air="" ' + (iv.onAirId ? '' : 'disabled') + '>Nobody on air (hide panel)</button><button class="stop" data-ivstop>Stop interview mode</button></div>';
      ivPicker = null; return;
    }
    el.innerHTML = '<h4>Post race interview mode</h4>' +
      '<div class="cm-help">Pick up to three drivers you are about to interview, then start interview mode. The stream badge changes to POST RACE INTERVIEW. You then click who is on air now, and their avatar and full stats take the right 40% of the screen so the replay stays visible.</div>' +
      '<div data-ivpick></div><div class="cm-row" style="margin-top:10px"><button class="amber" data-ivstart disabled>Start interview mode</button><span class="cm-help" data-ivneed></span></div>';
    ivPicker = Picker(el.querySelector('[data-ivpick]'), { list: function(){ return IV.entries; }, max: function(){ return 3; }, ordered: false, onChange: function(){
      var b = el.querySelector('[data-ivstart]'), n = IV.entries.length; if (b) b.disabled = !n || busy;
      var nd = el.querySelector('[data-ivneed]'); if (nd) nd.textContent = n ? '' : 'Add at least one driver.'; } });
  }

  /* ---------- penalty banners (race control) ---------- */
  var KIND = { drive_through: 'DRIVE-THROUGH', stop_go: 'STOP-GO' };
  var plain = function(n){ var m = String(n || '').match(/^\s*\[\s*(\d+)\s*\]\s*-?\s*(.*)$/); return m ? '#' + m[1] + ' ' + (m[2] || '') : String(n || 'Driver'); };
  var lapsTxt = function(l){ return l <= 0 ? 'SERVE NOW' : l + (l === 1 ? ' lap left' : ' laps left'); };
  function renderPenLive(){
    var el = $s('penlive'), L = S.penalties || [];
    el.hidden = !L.length;
    if (!L.length){ el.innerHTML = ''; return; }
    el.innerHTML = '<h4>Penalty banners on the stream (' + L.length + ' of 3)</h4>' + L.map(function(p){
      var id = esc(p.id);
      return '<div class="cm-pen"><div class="pn"><span class="cm-tag red">' + esc(KIND[p.kind] || 'PENALTY') + '</span> <b>' + esc(plain(p.name)) + '</b><span class="pl">' + esc(lapsTxt(p.laps)) + '</span></div>' +
        '<div class="pb"><button data-pen="laps" data-id="' + id + '" data-d="-1" title="One lap fewer to serve">-1 lap</button>' +
        '<button data-pen="laps" data-id="' + id + '" data-d="1" title="One more lap to serve">+1 lap</button>' +
        '<button class="go" data-pen="served" data-id="' + id + '">Penalty served</button>' +
        '<button data-pen="remove" data-id="' + id + '" title="Take the banner down without the green pop-up">Remove</button></div></div>';
    }).join('');
  }
  var penPicker = null;
  function renderPen(){
    var el = $s('pen');
    el.innerHTML = '<h4>Penalty banner</h4>' +
      '<div class="cm-help">For race control. Pick the driver, set how many laps they have left to serve it, then press the penalty. A red banner shows at the top of the stream straight away (up to three at once). Press Penalty served when they have done it and the green Penalty cleared pop-up shows.</div>' +
      '<div data-penpick></div>' +
      '<div class="cm-row" style="margin-top:10px"><b>Laps left to serve</b><span class="cm-chips" data-penchips>' + [1,2,3,4,5,6].map(function(n){ return '<button data-penlaps="' + n + '">' + n + '</button>'; }).join('') + '<input type="number" min="0" max="99" inputmode="numeric" data-penlapsin title="Any other number of laps"></span></div>' +
      '<div class="cm-row" style="margin-top:12px"><button class="stop big" data-penadd="drive_through" disabled>Drive-through</button><button class="stop big" data-penadd="stop_go" disabled>Stop-go</button><span class="cm-help" data-penneed></span></div>';
    penPicker = Picker(el.querySelector('[data-penpick]'), { list: function(){ return P.picked; }, max: function(){ return 1; }, replace: true, ordered: false, placeholder: 'Search the driver by name or number (2+ letters)', onChange: syncPen });
    syncPen();
  }
  function syncPen(){
    var el = $s('pen'); if (!el) return;
    Array.prototype.forEach.call(el.querySelectorAll('[data-penlaps]'), function(b){ b.classList.toggle('on', Number(b.getAttribute('data-penlaps')) === P.laps); });
    var inp = el.querySelector('[data-penlapsin]'); if (inp && document.activeElement !== inp) inp.value = P.laps;
    var ready = P.picked.length > 0 && !busy;
    Array.prototype.forEach.call(el.querySelectorAll('[data-penadd]'), function(b){ b.disabled = !ready; });
    var nd = el.querySelector('[data-penneed]'); if (nd) nd.textContent = P.picked.length ? '' : 'Pick a driver first.';
  }

  /* ---------- the button grid ---------- */
  var EXT = {
    info:   { id: 'driverOverviewPanel',   label: 'Driver Info',      sub: 'Search any driver' },
    watch:  { id: 'commentatorWatchPanel', label: 'Drivers to Watch', sub: 'Pace and potential' },
    lookup: { id: 'driverLookupPanel',     label: 'Driver Lookup',    sub: 'Browse by tier' },
    field:  { id: 'fieldReportPanel',      label: 'Field Report',     sub: 'From an entry list' }
  };
  var INTERNAL = ['pen', 'deck', 'build', 'iv', 'live', 'mode'];
  var shown = false;
  function extEl(k){ return EXT[k] ? document.getElementById(EXT[k].id) : null; }
  function tile(key, label, sub, state){
    return '<button class="cm-tile' + (openKey === key ? ' on' : '') + (state ? ' ' + state : '') + '" data-tile="' + key + '" aria-pressed="' + (openKey === key ? 'true' : 'false') + '"><span class="tl">' + esc(label) + '</span><span class="ts">' + esc(sub) + '</span></button>';
  }
  function renderGrid(){
    var el = $s('grid'); if (!el) return;
    var nPen = (S.penalties || []).length, onAir = S.live && S.live.name ? S.live.name : '';
    var h = '';
    h += tile('pen', 'Penalty', nPen ? nPen + ' on screen' : 'Red banner', nPen ? 'red' : '');
    h += tile('deck', 'Prepared cards', (S.deck || []).length + ' saved', '');
    h += tile('build', 'Build a card', B.editId ? 'Editing a card' : 'Grid, battle, team', '');
    h += tile('iv', 'Interview', S.interview ? 'ON AIR' : 'Post race', S.interview ? 'amber' : '');
    h += tile('live', 'Go live', onAir ? 'On air: ' + onAir : 'Nobody on air', onAir ? 'red' : '');
    h += tile('mode', 'Stream badge', S.mode === 'raceteam' ? 'Team live feed' : 'Rerun', S.mode === 'raceteam' ? 'amber' : '');
    Object.keys(EXT).forEach(function(k){ if (extEl(k)) h += tile(k, EXT[k].label, EXT[k].sub, ''); });
    el.innerHTML = h;
  }
  function applyExternal(){
    if (!shown) return;
    Object.keys(EXT).forEach(function(k){ var el = extEl(k); if (el) el.style.display = (openKey === k) ? '' : 'none'; });
  }
  function applyOpen(scroll){
    if (openKey && !(INTERNAL.indexOf(openKey) >= 0 || (EXT[openKey] && extEl(openKey)))) openKey = '';
    INTERNAL.forEach(function(k){ var el = $s(k); if (el) el.hidden = (k !== openKey); });
    applyExternal(); renderGrid();
    if (scroll && openKey){ var t = EXT[openKey] ? extEl(openKey) : $s(openKey); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function setOpen(key){
    openKey = (openKey === key) ? '' : key;
    try { sessionStorage.setItem('ifwlCommsOpen', openKey); } catch (e) {}
    applyOpen(true);
  }

  function renderAll(){ renderMode(); renderLive(); renderScreen(); renderDeck(); renderPenLive(); renderGrid(); }
  function applyState(d){ ['live','compare','show','interview','mode'].forEach(function(k){ if (k in d) S[k] = d[k] || null; }); if (Array.isArray(d.deck)) S.deck = d.deck; if (Array.isArray(d.comms)) S.comms = d.comms; if (d.me) S.me = d.me; if (Array.isArray(d.penalties)) S.penalties = d.penalties; if ('cleared' in d) S.cleared = d.cleared || null; }
  var interviewWas = null;
  function afterState(){
    var had = !!interviewWas, has = !!S.interview; interviewWas = S.interview;
    renderMode(); renderLive(); renderScreen(); renderDeck(); renderPenLive(); renderGrid();
    if (had !== has || (!root.__ivRendered)){ renderIv(); root.__ivRendered = true; }
    else if (has) renderIv();       // on-air buttons follow the server
  }
  function refresh(){
    return api('commsPanel').then(function(d){ setVisible(true); shown = true; applyState(d); afterState(); applyOpen(false); }).catch(function(e){
      if (e.status === 403 || e.status === 401){ setVisible(false); shown = false; if (timer){ clearInterval(timer); timer = null; } if (quickTimer){ clearInterval(quickTimer); quickTimer = null; } }
      else say(e.message, true);
    });
  }
  function act(name, body, okMsg){
    if (busy) return Promise.resolve(); busy = true; say('Working...');
    return api(name, { body: body || {} }).then(function(d){ applyState(d); afterState(); say(okMsg || 'Done.'); return d; })
      .catch(function(e){ say(e.message, true); })
      .then(function(d){ busy = false; syncBuildButtons(); syncPen(); return d; });
  }

  /* ---------- events ---------- */
  root.addEventListener('click', function(ev){
    var b = ev.target.closest('button'); if (!b || !root.contains(b)) return;
    if (b.hasAttribute('data-tile')){ setOpen(b.getAttribute('data-tile')); return; }
    if (b.hasAttribute('data-penlaps')){ P.laps = Number(b.getAttribute('data-penlaps')); syncPen(); return; }
    if (b.hasAttribute('data-penadd')){
      if (!P.picked.length) return;
      act('commsPenalty', { action: 'add', driverId: P.picked[0].id, kind: b.getAttribute('data-penadd'), laps: P.laps }, 'Penalty banner is on the stream.').then(function(d){ if (d && d.ok){ P.picked = []; if (penPicker) penPicker.render(); syncPen(); } });
      return;
    }
    if (b.hasAttribute('data-pen')){
      var pa = b.getAttribute('data-pen'), pid = b.getAttribute('data-id');
      if (pa === 'laps') act('commsPenalty', { action: 'laps', id: pid, delta: Number(b.getAttribute('data-d')) }, 'Laps updated.');
      else if (pa === 'served') act('commsPenalty', { action: 'served', id: pid }, 'Penalty served: the green Penalty cleared pop-up is on the stream.');
      else if (pa === 'remove') act('commsPenalty', { action: 'remove', id: pid }, 'Banner removed.');
      return;
    }
    if (b.hasAttribute('data-live')){ act('commsSetLive', { id: b.getAttribute('data-live'), live: b.getAttribute('data-on') === '1' }, b.getAttribute('data-on') === '1' ? 'You are live.' : 'Off air.'); return; }
    if (b.getAttribute('data-act') === 'hide'){ act('commsDeckHide', {}, 'Card hidden from the stream.'); return; }
    if (b.hasAttribute('data-mode')){ var m = b.getAttribute('data-mode'); act('commsMode', { mode: m }, m ? 'Badge switched to Race Team Live Feed.' : 'Badge back to rerun.'); return; }
    if (b.hasAttribute('data-focus-card')){ act('commsDeckPush', { id: b.getAttribute('data-focus-card'), focusId: b.getAttribute('data-focus-id') }, 'Driver highlighted on the stream.'); return; }
    if (b.hasAttribute('data-push')){ act('commsDeckPush', { id: b.getAttribute('data-push') }, 'Pushed to the stream.'); return; }
    if (b.hasAttribute('data-del')){
      var id = b.getAttribute('data-del');
      if (delId === id){ delId = ''; clearTimeout(delTimer); act('commsDeckDelete', { id: id }, 'Card deleted.').then(function(){ if (B.editId === id){ resetBuild(); } }); }
      else { delId = id; renderDeck(); clearTimeout(delTimer); delTimer = setTimeout(function(){ delId = ''; renderDeck(); }, 3000); }
      return;
    }
    if (b.hasAttribute('data-edit')){
      var c = S.deck.filter(function(x){ return x.id === b.getAttribute('data-edit'); })[0]; if (!c) return;
      B = { type: c.type, title: c.title || '', number: c.number || '', entries: (c.entries || []).map(function(e){ return { id: e.id, name: e.name, num: e.num, label: e.label || '' }; }), editId: c.id };
      renderBuild(); syncBuildButtons(); $s('build').scrollIntoView({ behavior: 'smooth', block: 'start' }); say('Editing "' + (c.title || TYPES[c.type].label) + '".'); return;
    }
    if (b.hasAttribute('data-type')){ var t = b.getAttribute('data-type'); if (t !== B.type){ var keep = B.entries.slice(0, TYPES[t].max); B = { type: t, title: '', number: '', entries: keep, editId: B.editId }; renderBuild(); syncBuildButtons(); } return; }
    if (b.hasAttribute('data-cancel')){ resetBuild(); say(''); return; }
    if (b.hasAttribute('data-save')){
      var push = b.getAttribute('data-save') === '1', tEl = $s('build').querySelector('[data-title]');
      var nEl = $s('build').querySelector('[data-number]'), card = { id: B.editId || undefined, type: B.type, title: tEl ? tEl.value : B.title, number: nEl ? nEl.value : '', entries: B.entries.map(function(e){ return { id: e.id, label: e.label || '' }; }) };
      busy = true; syncBuildButtons(); say('Saving...');
      api('commsDeckSave', { body: { card: card } }).then(function(d){
        applyState(d); var savedId = d.card && d.card.id; resetBuild(); afterState();
        if (!push) { say('Saved to the deck.'); busy = false; syncBuildButtons(); return; }
        busy = false; return act('commsDeckPush', { id: savedId }, 'Saved and pushed to the stream.');
      }).catch(function(e){ busy = false; syncBuildButtons(); say(e.message, true); });
      return;
    }
    if (b.hasAttribute('data-ivstart')){ act('commsInterview', { mode: 'start', ids: IV.entries.map(function(e){ return e.id; }) }, 'Interview mode is on. Click who is on air now.'); return; }
    if (b.hasAttribute('data-air')){ act('commsInterview', { mode: 'onair', id: b.getAttribute('data-air') }, b.getAttribute('data-air') ? 'On air now.' : 'Panel hidden.'); return; }
    if (b.hasAttribute('data-ivstop')){ act('commsInterview', { mode: 'stop' }, 'Interview mode off.').then(function(){ IV.entries = []; renderIv(); }); return; }
  });
  root.addEventListener('input', function(ev){
    var t = ev.target; if (!t.hasAttribute) return;
    if (t.hasAttribute('data-title')) B.title = t.value;
    if (t.hasAttribute('data-penlapsin')){ var n = parseInt(t.value, 10); if (isFinite(n)) P.laps = Math.max(0, Math.min(99, n)); syncPen(); }
  });
  function resetBuild(){ B = { type: B.type, title: '', number: '', entries: [], editId: '' }; renderBuild(); syncBuildButtons(); }

  function quick(){      // cheap public call (3 s server cache): keeps the on-screen state and penalties fresh for the whole team
    if (document.hidden || busy || !shown) return;
    fetch(FN() + '?streamLive=1', { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(d){
      if (!d || !d.ok || busy) return;
      var sig = JSON.stringify([d.live, d.compare, d.show, d.interview, d.mode, d.penalties]);
      if (sig === lastSig) return; lastSig = sig;
      S.comms.forEach(function(c){ c.live = !!(d.live && d.live.id === c.id); });
      applyState(d); afterState();
    }).catch(function(){});
  }
  renderMode(); renderBuild(); renderPen(); syncBuildButtons(); renderIv(); renderPenLive(); renderGrid(); applyOpen(false);
  refresh();
  timer = setInterval(function(){ if (!document.hidden && !busy) refresh(); }, 60000);
  quickTimer = setInterval(quick, 5000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && timer){ refresh(); quick(); } });
}

function init(){
  Array.prototype.forEach.call(document.querySelectorAll('[data-commslive]'), mount);
  var p = document.getElementById('commsLivePanel');     // a panel with no mount point of its own gets one added (nothing already in it is touched)
  if (p && !p.querySelector('[data-commslive]')){ var d = document.createElement('div'); d.setAttribute('data-commslive', ''); p.appendChild(d); mount(d); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
window.IFWL_COMMS = { mount: mount, init: init };
})();
