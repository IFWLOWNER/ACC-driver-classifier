/* IFWL media: post race videos (YouTube / Twitch).
   - Shared by the standalone page licence-media.html (window.IFWL_MEDIA) and the Home row on licence.html / licence-home.html.
   - On the Home pages it adds a "Latest videos" panel (newest 3) directly above the Driver Directory and a Media tab in the menu.
   - Videos only load their player when clicked, so nothing third-party loads until someone presses play. */
(function(){
  'use strict';
  var API = (window.IFWL_AUTH && window.IFWL_AUTH.FUNCTION) || 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate';
  var MEDIA_PAGE = 'licence-media.html';
  var KINDS = { highlight: 'Highlight', replay: 'Replay', stream: 'Official stream', pov: 'Driver POV' };
  // Reactions. Bits match the server (1 fire, 2 banana, 4 thumbs up). Icons are written as escapes so the file stays plain text.
  var REACTS = [
    { key: 'fire',   bit: 1, label: 'Fire',      icon: '\uD83D\uDD25' },
    { key: 'banana', bit: 2, label: 'Banana',    icon: '\uD83C\uDF4C' },
    { key: 'up',     bit: 4, label: 'Thumbs up', icon: '\uD83D\uDC4D' }
  ];

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function token(){ try{ return localStorage.getItem('IFWL_PATREON_SESSION') || sessionStorage.getItem('IFWL_PATREON_SESSION') || ''; }catch(_){ return ''; } }
  function provName(p){ return p.provider === 'twitch' ? 'Twitch' : 'YouTube'; }
  function thumbUrl(p){ return p.provider === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(p.vid) ? 'https://i.ytimg.com/vi/' + p.vid + '/hqdefault.jpg' : ''; }
  function embedSrc(p, auto){
    var ap = auto === false ? 'false' : 'true';
    var host = encodeURIComponent(location.hostname || 'localhost');
    if(p.provider === 'youtube') return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(p.vid) + '?autoplay=' + (auto === false ? '0' : '1') + '&rel=0' + (p.start ? '&start=' + Number(p.start) : '');
    if(p.tkind === 'clip') return 'https://clips.twitch.tv/embed?clip=' + encodeURIComponent(p.vid) + '&parent=' + host + '&autoplay=' + ap;
    return 'https://player.twitch.tv/?video=v' + encodeURIComponent(p.vid) + '&parent=' + host + '&autoplay=' + ap + (p.start ? '&time=' + Number(p.start) + 's' : '');
  }
  function dateText(ms){ try{ return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }catch(_){ return ''; } }

  function css(){
    if(document.getElementById('ifwlMediaCss')) return;
    var st = document.createElement('style'); st.id = 'ifwlMediaCss';
    st.textContent =
      '.ifwl-vid-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:4px 18px 18px}' +
      '.ifwl-vid-grid.wide{grid-template-columns:repeat(auto-fill,minmax(290px,1fr));padding:0}' +
      '@media(max-width:720px){.ifwl-vid-grid:not(.wide){display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:12px;-webkit-overflow-scrolling:touch}.ifwl-vid-grid:not(.wide) .ifwl-vid{flex:0 0 82%;scroll-snap-align:start}}' +
      '.ifwl-vid{background:var(--panel-bg,#fff);border:1px solid var(--ifwl-line,#e3e7ed);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;min-width:0}' +
      '.ifwl-vid-media{position:relative;display:block;width:100%;aspect-ratio:16/9;border:0;padding:0;margin:0;background:#0f1722;cursor:pointer;overflow:hidden}' +
      '.ifwl-vid-media img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.ifwl-vid-media iframe{position:absolute;inset:0;width:100%;height:100%;border:0}' +
      '.ifwl-vid-ph{position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;gap:2px;padding:12px 14px;color:#c8d2de;font:700 22px Rajdhani,Arial Narrow,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;background:linear-gradient(135deg,#17202c,#0f1722)}' +
      '.ifwl-vid-ph small{font:600 12px Inter,Arial,sans-serif;letter-spacing:.06em;color:#8b93a2}' +
      '.ifwl-vid-play{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(14,156,138,.92);box-shadow:0 2px 10px rgba(0,0,0,.35)}' +
      '.ifwl-vid-play:after{content:"";position:absolute;left:21px;top:16px;border-left:18px solid #fff;border-top:11px solid transparent;border-bottom:11px solid transparent}' +
      '.ifwl-vid-media.live{cursor:default}.ifwl-vid-media.live .ifwl-vid-kind{pointer-events:none;top:auto;bottom:10px}' +
      '.ifwl-vid-media:hover .ifwl-vid-play{background:#0e9c8a}' +
      '.ifwl-vid-kind{position:absolute;left:10px;top:10px;padding:3px 9px;border-radius:6px;font:700 12px Rajdhani,Arial Narrow,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:#0e9c8a}' +
      '.ifwl-vid-kind.replay{background:#9b3fd1}.ifwl-vid-kind.stream{background:#b5750a}.ifwl-vid-kind.pov{background:#1a2230}' +
      '.ifwl-vid-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:4px;min-width:0}' +
      '.ifwl-vid-body h4{margin:0;font:700 18px/1.2 Rajdhani,Arial Narrow,Arial,sans-serif;letter-spacing:.03em;color:var(--text-primary,#1a2230);overflow-wrap:anywhere}' +
      '.ifwl-vid-meta{font-size:12.5px;color:var(--text-muted,#5b6576);line-height:1.45}' +
      '.ifwl-vid-actions{display:flex;gap:12px;align-items:center;margin-top:4px;font-size:12.5px}' +
      '.ifwl-vid-actions a{color:var(--ifwl-teal-deep,#086b5f);font-weight:600}' +
      '#mediaPageRoot .med-sub{margin:0 0 12px;font-size:13px;color:var(--text-muted,#5b6576);line-height:1.5}' +
      '#mediaPageRoot .med-form{display:grid;grid-template-columns:2fr 2fr 1.4fr 1.3fr auto;gap:12px;align-items:end}' +
      '#mediaPageRoot .med-form .field-group{margin:0;min-width:0}#mediaPageRoot .med-form .med-url{grid-column:1 / -1}' +
      '#mediaPageRoot .med-form input,#mediaPageRoot .med-form select{width:100%;box-sizing:border-box}' +
      '@media(max-width:900px){#mediaPageRoot .med-form{grid-template-columns:1fr 1fr}#mediaPageRoot .med-form button{grid-column:1 / -1}}' +
      '@media(max-width:560px){#mediaPageRoot .med-form{grid-template-columns:1fr}}' +
      '#mediaPageRoot .med-status{font-size:13px;margin-top:10px;min-height:18px}#mediaPageRoot .med-status.err{color:var(--ifwl-red,#c2352a)}#mediaPageRoot .med-status.good{color:var(--ifwl-green,#12875a)}' +
      '#mediaPageRoot .med-note{font-size:13px;color:var(--text-muted,#5b6576);line-height:1.55}' +
      '#mediaPageRoot .med-chips{display:flex;gap:8px;flex-wrap:wrap;padding:6px 18px 14px}' +
      '#mediaPageRoot .med-chip{border:1px solid var(--ifwl-line,#e3e7ed);background:var(--panel-bg,#fff);color:var(--text-primary,#1a2230);border-radius:999px;padding:7px 14px;font:600 13px Inter,Arial,sans-serif;cursor:pointer}' +
      '#mediaPageRoot .med-chip.active{background:var(--text-primary,#1a2230);border-color:var(--text-primary,#1a2230);color:#fff}' +
      '#mediaPageRoot .ifwl-vid-grid.wide{padding:0 18px 18px}#mediaPageRoot .med-empty{padding:34px 16px;text-align:center;color:var(--text-muted,#5b6576);grid-column:1 / -1}' +
      '.ifwl-vid-react{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}' +
      '.ifwl-react{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ifwl-line,#e3e7ed);background:var(--panel-bg,#fff);color:var(--text-primary,#1a2230);border-radius:999px;padding:6px 12px;font:700 13px Inter,Arial,sans-serif;line-height:1;cursor:pointer}' +
      '.ifwl-react:hover{border-color:var(--ifwl-teal,#0e9c8a)}' +
      '.ifwl-react.on{background:rgba(14,156,138,.16);border-color:var(--ifwl-teal,#0e9c8a);color:var(--ifwl-teal-deep,#086b5f)}' +
      '.ifwl-react-i{font-size:15px;line-height:1}.ifwl-react-n{min-width:8px;text-align:left;font-variant-numeric:tabular-nums}' +
      '.ifwl-react-msg{font-size:12px;color:var(--text-muted,#5b6576)}' +
      '.ifwl-react-msg:empty{display:none}.ifwl-react-msg{flex-basis:100%}' +
      '@media(max-width:720px){.ifwl-vid-react{flex-wrap:nowrap;gap:6px;flex-flow:row wrap}.ifwl-react{flex:1 1 0;min-width:0;justify-content:center;padding:9px 6px;gap:5px}}' +
      '.ifwl-vid-actions button{background:none;border:0;padding:0;color:var(--ifwl-red,#c2352a);font:600 12.5px Inter,Arial,sans-serif;cursor:pointer}';
    document.head.appendChild(st);
  }

  function reactBar(p, note){
    var my = Number(p.my) || 0, r = p.r || {};
    return '<div class="ifwl-vid-react" role="group" aria-label="Reactions">' + REACTS.map(function(x){
      var on = (my & x.bit) === x.bit, n = Math.max(0, Number(r[x.key]) || 0);
      return '<button type="button" class="ifwl-react' + (on ? ' on' : '') + '" data-react="' + x.key + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + x.label + ', ' + n + '" title="' + x.label + '">' +
        '<span class="ifwl-react-i" aria-hidden="true">' + x.icon + '</span><span class="ifwl-react-n">' + n + '</span></button>';
    }).join('') + '<span class="ifwl-react-msg" aria-live="polite">' + esc(note || '') + '</span></div>';
  }

  function cardHtml(p, opts){
    opts = opts || {};
    var th = thumbUrl(p), live = p.provider === 'twitch';   // Twitch has no free thumbnail, so its card shows the player itself, paused
    var media = live ? '<iframe src="' + esc(embedSrc(p, false)) + '" title="' + esc(p.title) + '" loading="lazy" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe><span class="ifwl-vid-kind ' + esc(p.kind) + '">' + esc(KINDS[p.kind] || 'Highlight') + '</span>' : (th ? '<img src="' + esc(th) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<div class="ifwl-vid-ph">' + esc(provName(p)) + '<small>' + (p.tkind === 'clip' ? 'Clip' : 'Video') + '</small></div>') +
      '<span class="ifwl-vid-play"></span><span class="ifwl-vid-kind ' + esc(p.kind) + '">' + esc(KINDS[p.kind] || 'Highlight') + '</span>';
    var meta = [p.round ? esc(p.round) : '', 'Posted by ' + esc(p.name), esc(dateText(p.atMs))].filter(Boolean).join(' &middot; ');
    return '<article class="ifwl-vid" data-vid-id="' + esc(p.id) + '">' +
      '<' + (live ? 'div' : 'button type="button"') + ' class="ifwl-vid-media' + (live ? ' live' : '') + '" aria-label="Play ' + esc(p.title) + '">' + media + '</' + (live ? 'div' : 'button') + '>' +
      '<div class="ifwl-vid-body"><h4>' + esc(p.title) + '</h4><div class="ifwl-vid-meta">' + meta + '</div>' + reactBar(p) +
      '<div class="ifwl-vid-actions"><a href="' + esc(p.watchUrl) + '" target="_blank" rel="noopener noreferrer">Watch on ' + esc(provName(p)) + '</a>' +
      (opts.canRemove && (p.mine || opts.canRemoveAny) ? '<button type="button" data-vid-remove="' + esc(p.id) + '">Remove</button>' : '') + '</div></div></article>';
  }
  // Click a thumbnail to load that video's player in place.
  function redrawReact(card, p, note){
    var bar = card.querySelector('.ifwl-vid-react'); if(!bar) return;
    var tmp = document.createElement('div'); tmp.innerHTML = reactBar(p, note);
    bar.parentNode.replaceChild(tmp.firstChild, bar);
    if(note){ setTimeout(function(){ var m = card.querySelector('.ifwl-react-msg'); if(m && m.textContent === note) m.textContent = ''; }, 4500); }
  }
  // Fire / banana / thumbs up. Shows the change at once, then confirms with the server and puts the real counts back.
  // Taps on one video are sent one after another (so the server always ends on the last thing you chose); a repeat tap on the
  // same button within a third of a second is ignored so a double-tap does not undo itself.
  function wireReact(root, posts){
    root.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('.ifwl-react');
      if(!b || !root.contains(b)) return;
      var card = b.closest('.ifwl-vid'); var id = card && card.getAttribute('data-vid-id');
      var p = (posts() || []).filter(function(x){ return x.id === id; })[0]; if(!p) return;
      var def = REACTS.filter(function(x){ return x.key === b.getAttribute('data-react'); })[0]; if(!def) return;
      if(!token()){ redrawReact(card, p, 'Log in with Discord to react.'); return; }
      var t = Date.now(); p._tap = p._tap || {};
      if(p._tap[def.key] && t - p._tap[def.key] < 350) return;
      p._tap[def.key] = t;
      var on = ((Number(p.my) || 0) & def.bit) !== def.bit;
      function apply(turnOn){
        p.my = turnOn ? ((Number(p.my) || 0) | def.bit) : ((Number(p.my) || 0) & ~def.bit);
        p.r = Object.assign({ fire: 0, banana: 0, up: 0 }, p.r);
        p.r[def.key] = Math.max(0, (Number(p.r[def.key]) || 0) + (turnOn ? 1 : -1));
      }
      apply(on); p._pending = (p._pending || 0) + 1; redrawReact(card, p);
      p._chain = (p._chain || Promise.resolve()).then(function(){
        return fetch(API + '?mediaReact=1&token=' + encodeURIComponent(token()), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, key: def.key, on: on }) })
          .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, status: r.status, d: d }; }); });
      }).then(function(x){
        p._pending--;
        if(!x.ok){ apply(!on); redrawReact(card, p, x.status === 401 ? 'Log in again to react.' : ((x.d && x.d.error) || 'Could not save that. Try again.')); return; }
        if(!p._pending){ p.r = x.d.counts; p.my = x.d.my; }       // only trust the server's numbers once nothing else is waiting
        redrawReact(card, p);
      }).catch(function(){ p._pending--; apply(!on); redrawReact(card, p, 'Could not save that. Try again.'); });
    });
  }
  function wirePlay(root, posts){
    wireReact(root, posts);
    root.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('.ifwl-vid-media');
      if(!btn || !root.contains(btn) || btn.querySelector('iframe')) return;
      var card = btn.closest('.ifwl-vid'); var id = card && card.getAttribute('data-vid-id');
      var p = (posts() || []).filter(function(x){ return x.id === id; })[0]; if(!p) return;
      var f = document.createElement('iframe');
      f.src = embedSrc(p); f.title = p.title; f.allowFullscreen = true;
      f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      btn.innerHTML = ''; btn.appendChild(f);
    });
  }
  async function list(limit){
    var t = token();
    var r = await fetch(API + '?mediaList=1' + (limit ? '&limit=' + limit : '') + (t ? '&token=' + encodeURIComponent(t) : ''), { cache: 'no-store' });
    var d = await r.json(); if(!r.ok) throw new Error(d && d.error || 'Could not load videos');
    return d;
  }
  window.IFWL_MEDIA = { API: API, KINDS: KINDS, REACTS: REACTS, esc: esc, token: token, cardHtml: cardHtml, wirePlay: wirePlay, list: list, css: css, PAGE: MEDIA_PAGE };

  /* ------------------------------------------------ Home pages only */
  function mountHome(){
    var dir = document.getElementById('directoryPanel');
    if(!dir || document.getElementById('mediaHomePanel') || document.getElementById('mediaPageRoot')) return;   // not on the Media page itself
    css();
    // menu entry: its own page, so it is a plain link rather than an in-page view
    var tabs = document.getElementById('viewTabs');
    if(tabs && !tabs.querySelector('[data-media-link]')){
      var b = document.createElement('button'); b.type = 'button'; b.className = 'view-tab'; b.setAttribute('data-media-link', '1'); b.textContent = 'Media';
      b.addEventListener('click', function(){ location.href = MEDIA_PAGE; });
      var after = tabs.querySelector(':scope > [data-view="seasons"]');
      if(after && after.nextSibling) tabs.insertBefore(b, after.nextSibling); else tabs.appendChild(b);
    }
    var sec = document.createElement('section');
    sec.className = 'panel view-panel hidden'; sec.setAttribute('data-view', 'home'); sec.id = 'mediaHomePanel';
    sec.innerHTML = '<div class="panel-head"><div><h3>Latest Videos</h3><small>Post race highlights, replays, streams and driver POV</small></div><a class="btn ghost" href="' + MEDIA_PAGE + '">All videos</a></div><div id="mediaHomeGrid" class="ifwl-vid-grid"></div>';
    dir.parentNode.insertBefore(sec, dir);
    var posts = [];
    wirePlay(sec, function(){ return posts; });
    list(3).then(function(d){
      posts = d.posts || [];
      if(!posts.length) return;                                   // nothing posted yet: keep the row hidden
      sec.querySelector('#mediaHomeGrid').innerHTML = posts.map(function(p){ return cardHtml(p, {}); }).join('');
      sec.classList.remove('hidden');
      var active = document.querySelector('#viewTabs .view-tab.active');
      if(!active || active.getAttribute('data-view') === 'home') sec.classList.add('is-active-view');
    }).catch(function(){ /* leave hidden */ });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHome); else mountHome();
})();
