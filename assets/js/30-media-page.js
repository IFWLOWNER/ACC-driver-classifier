/* IFWL Media page (licence-media.html): list, filter, add and remove videos. Uses the shared code in 29-media-home.js. */
(function(){
  'use strict';
  var M = window.IFWL_MEDIA; if(!M) return;
  var esc = M.esc, API = M.API;
  M.css();
  var posts = [], me = null, kind = '';
  var grid = document.getElementById('medGrid'), statusEl = document.getElementById('medStatus');
  if(!grid) return;

  function setStatus(msg, cls){ statusEl.textContent = msg || ''; statusEl.className = 'med-status' + (cls ? ' ' + cls : ''); }
  function render(){
    var shown = kind ? posts.filter(function(p){ return p.kind === kind; }) : posts;
    if(!shown.length){ grid.innerHTML = '<div class="med-empty">' + (posts.length ? 'No videos of this type yet.' : 'No videos have been posted yet.') + '</div>'; return; }
    grid.innerHTML = shown.map(function(p){ return M.cardHtml(p, { canRemove: !!(me && me.loggedIn), canRemoveAny: !!(me && me.canRemoveAny) }); }).join('');
  }
  function applyMe(){
    var panel = document.getElementById('medPostPanel'), notePanel = document.getElementById('medNotePanel'), note = document.getElementById('medNote');
    panel.style.display = me && me.canPost ? '' : 'none';
    var text = '';
    if(!me || !me.loggedIn) text = 'Log in with Discord to add a video. Posting is for Gold Patreon members, staff, Ops and stewards.';
    else if(!me.canPost) text = me.reason || 'Posting videos is for Gold Patreon members, staff, Ops and stewards.';
    notePanel.style.display = text ? '' : 'none'; note.textContent = text;
    if(me && me.canPost && !me.canRemoveAny) document.getElementById('medPostSub').textContent = 'Paste a YouTube video or a Twitch video or clip. ' + me.left + ' of ' + me.limit + ' posts left today.';
  }
  async function load(){
    try{
      var d = await M.list(0);
      posts = d.posts || []; me = d.me || null;
      applyMe(); render();
    }catch(e){ grid.innerHTML = '<div class="med-empty">Could not load the videos right now. Try again in a minute.</div>'; }
  }
  M.wirePlay(grid, function(){ return posts; });

  document.getElementById('medChips').addEventListener('click', function(e){
    var b = e.target.closest('.med-chip'); if(!b) return;
    kind = b.getAttribute('data-kind') || '';
    [].forEach.call(document.querySelectorAll('.med-chip'), function(x){ x.classList.toggle('active', x === b); });
    render();
  });

  grid.addEventListener('click', async function(e){
    var b = e.target.closest('[data-vid-remove]'); if(!b) return;
    if(!confirm('Remove this video?')) return;
    try{
      var r = await fetch(API + '?mediaRemove=1&token=' + encodeURIComponent(M.token()), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.getAttribute('data-vid-remove') }) });
      var d = await r.json(); if(!r.ok) throw new Error(d.error || 'Could not remove it');
      await load();
    }catch(err){ alert(err.message); }
  });

  document.getElementById('medForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var btn = document.getElementById('medSubmit'); btn.disabled = true; setStatus('Adding...', '');
    try{
      var body = { url: document.getElementById('medUrl').value.trim(), title: document.getElementById('medTitle').value.trim(), round: document.getElementById('medRound').value.trim(), kind: document.getElementById('medKind').value };
      var r = await fetch(API + '?mediaPost=1&token=' + encodeURIComponent(M.token()), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var d = await r.json(); if(!r.ok) throw new Error(d.error || 'Could not add the video');
      document.getElementById('medForm').reset(); setStatus('Video added.', 'good');
      await load();
    }catch(err){ setStatus(err.message, 'err'); }
    btn.disabled = false;
  });

  load();
})();
