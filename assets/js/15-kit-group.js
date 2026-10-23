/* ============================================================
   IFWL GROUP PHOTO MAKER (My Kit > Staff > Group photo). Ops / Owner only; the server refuses everyone else.
   Lines up every driver who has actually saved their own kit (Patreons at the front) in rows, like a team photo.
   Each row has its own height, size, spacing and shift sliders ("steps"). The staff member uploads a background of their
   own, drags people around, and downloads a PNG. Nothing is stored anywhere: it is drawn and saved in the browser only.
   Loaded on demand by 14-kit-page.js. Needs 13-kit.js (window.IFWL_KIT).
   ============================================================ */
(function(){
'use strict';
var K = window.IFWL_KIT;
if(!K || window.IFWL_KIT_GROUP) return;
var esc = K.esc;

/* ---------------------------------------------------------------- constants */
var REF_TOP = 0.03, REF_BOT = 0.97;               // the avatar camera is fixed: feet sit at 97% of the picture, the figure is 94% of its height
var REF_H = REF_BOT - REF_TOP;                     // 0.94
var NOM_W = 258 / 940;                             // a typical avatar is 258 px wide for 940 px tall
var SHAPES = { wide: ['Wide 16:9', 16, 9], photo: ['Photo 3:2', 3, 2], classic: ['Classic 4:3', 4, 3], square: ['Square 1:1', 1, 1], portrait: ['Portrait 4:5', 4, 5], story: ['Story 9:16', 9, 16], banner: ['Banner 3:1', 3, 1] };
var QUALITY = { std: ['Standard (1920 px)', 1920], high: ['High (2560 px)', 2560], max: ['Maximum (3840 px)', 3840] };
var PAT = { gold: ['Gold', '#f2b705'], silver: ['Silver', '#b9c2cc'], bronze: ['Bronze', '#c0793a'] };

/* ---------------------------------------------------------------- state (kept while the page stays open) */
var S = window.IFWL_KIT_GROUP_STATE = window.IFWL_KIT_GROUP_STATE || {
  drivers: [], on: {}, rows: [], nrows: 3, patronsFront: true, squeeze: true, centrePatrons: true,
  shape: 'wide', quality: 'std', transparent: false, shadow: true, names: 'off', colour: '#141a22',
  bg: { img: null, name: '', zoom: 100, x: 50, y: 50, bright: 100 }, sel: null
};
var IMG = {};            // "id:v" -> { img, trim:[x0,x1] } | 'fail'
var UI = null;           // the open editor's elements
var hit = [];            // figures as drawn on the preview: [{id,row,x0,x1,y0,y1}] front-most first
var drag = null, raf = 0, loadToken = 0;

var q = function(sel, root){ return (root || document).querySelector(sel); };
var clamp = function(v, a, b){ v = Number(v); if(!isFinite(v)) v = a; return Math.max(a, Math.min(b, v)); };

/* ---------------------------------------------------------------- names */
function parseName(n){
  var m = /^\s*\[\s*(\d{1,3})\s*\]\s*[-–—:]?\s*(.*)$/.exec(String(n || ''));
  return m ? { num: m[1], name: (m[2] || '').trim() || String(n) } : { num: '', name: String(n || '').trim() };
}
function label(d){ var p = parseName(d.name); return p.name || d.discord || d.id; }

/* ---------------------------------------------------------------- layout */
function rowDefaults(i, R){
  var h0 = R <= 1 ? 80 : R === 2 ? 72 : R <= 4 ? 66 : 58;
  var step = R <= 1 ? 0 : Math.max(6, 12 - (R - 2) * 1.4), shrink = R >= 5 ? 0.92 : 0.9;
  return { ids: [], base: Math.round((97 - step * i) * 10) / 10, h: Math.round(h0 * Math.pow(shrink, i) * 10) / 10, gap: 96, dx: 0, stag: false };
}
function split(list, k){
  var out = [], base = Math.floor(list.length / k), extra = list.length % k, at = 0;
  for(var i = 0; i < k; i++){ var n = base + (i >= k - extra ? 1 : 0); out.push(list.slice(at, at + n)); at += n; }
  return out;
}
function centreOut(list){
  var m = list.length, out = new Array(m), c = Math.floor((m - 1) / 2), r = 0, l = 0;
  for(var i = 0; i < m; i++){
    if(i === 0) out[c] = list[0];
    else if(i % 2 === 1) { r++; out[c + r] = list[i]; }
    else { l++; out[c - l] = list[i]; }
  }
  // when the right side runs out first (even count), the loop above can leave a hole: compact
  return out.filter(function(x){ return x !== undefined; });
}
function included(){ return S.drivers.filter(function(d){ return S.on[d.id]; }); }
function autoArrange(){
  var L = included(), n = L.length;
  if(!n){ S.rows = []; return; }
  var R = Math.min(clamp(S.nrows, 1, 8), n), P = L.filter(function(d){ return d.patreon; }), O = L.filter(function(d){ return !d.patreon; });
  var groups = [];
  if(S.patronsFront && P.length && O.length && R > 1){
    var per = Math.ceil(n / R), rp = clamp(Math.round(P.length / per), 1, R - 1);
    split(P, rp).forEach(function(g){ groups.push(g); });
    split(O, R - rp).forEach(function(g){ groups.push(g); });
  } else split(L, R).forEach(function(g){ groups.push(g); });
  groups = groups.filter(function(g){ return g.length; });
  S.nrows = groups.length;
  S.rows = groups.map(function(g, i){
    var r = rowDefaults(i, groups.length);
    r.ids = (S.centrePatrons && g[0].patreon ? centreOut(g) : g).map(function(d){ return d.id; });
    return r;
  });
  // a row of the same kind of size as the one in front would hide behind it: shift it half a step so heads show between shoulders
  var par = null;
  S.rows.forEach(function(r){
    var base = r.ids.length % 2 === 1 ? 0 : 0.5;
    if(par === null) par = base;
    else { var want = par === 0 ? 0.5 : 0; r.stag = base !== want; par = want; }
  });
  S.sel = null;
}
function byId(id){ for(var i = 0; i < S.drivers.length; i++) if(S.drivers[i].id === id) return S.drivers[i]; return null; }
function locate(id){ for(var r = 0; r < S.rows.length; r++){ var i = S.rows[r].ids.indexOf(id); if(i >= 0) return { r: r, i: i }; } return null; }
function tidyRows(){ S.rows = S.rows.filter(function(r){ return r.ids.length; }); S.nrows = Math.max(1, S.rows.length); }
function removeFromRows(id){ var at = locate(id); if(at){ S.rows[at.r].ids.splice(at.i, 1); } tidyRows(); }
function addToRows(id){
  var d = byId(id); if(!d) return;
  if(!S.rows.length){ autoArrange(); return; }
  var pick = 0;
  if(d.patreon) pick = 0; else { var best = 1e9; S.rows.forEach(function(r, i){ if(r.ids.length <= best){ best = r.ids.length; pick = i; } }); }
  S.rows[pick].ids.push(id);
}

/* ---------------------------------------------------------------- picture geometry */
function dims(){
  var s = SHAPES[S.shape] || SHAPES.wide, long = (QUALITY[S.quality] || QUALITY.std)[1];
  return s[1] >= s[2] ? { w: long, h: Math.round(long * s[2] / s[1]) } : { w: Math.round(long * s[1] / s[2]), h: long };
}
function figureFor(id){
  var d = byId(id); if(!d) return null;
  var e = IMG[id + ':' + d.v]; return e && e !== 'fail' ? e : null;
}
function rowGeom(row, W, H){
  var n = row.ids.length, hpx = row.h / 100 * H, nom = NOM_W * hpx, pitch = nom * row.gap / 100;
  if(S.squeeze && n > 1) pitch = Math.min(pitch, Math.max(nom * 0.15, (W * 0.95 - nom) / (n - 1)));
  var span = (n - 1) * pitch, cx = W / 2 + row.dx / 100 * W, base = row.base / 100 * H;
  return { n: n, hpx: hpx, nom: nom, pitch: pitch, x0: cx - span / 2 + (row.stag ? pitch / 2 : 0), base: base };
}

/* ---------------------------------------------------------------- drawing */
function drawBackground(ctx, W, H){
  if(S.transparent) return;
  ctx.fillStyle = S.colour; ctx.fillRect(0, 0, W, H);
  var b = S.bg;
  if(b.img){
    var iw = b.img.naturalWidth, ih = b.img.naturalHeight, sc = Math.max(W / iw, H / ih) * b.zoom / 100;
    var ox = (W - iw * sc) * b.x / 100, oy = (H - ih * sc) * b.y / 100;
    ctx.save();
    if(b.bright !== 100 && 'filter' in ctx) ctx.filter = 'brightness(' + b.bright + '%)';
    ctx.drawImage(b.img, ox, oy, iw * sc, ih * sc);
    ctx.restore();
    if(b.bright !== 100 && !('filter' in ctx)){ ctx.fillStyle = b.bright < 100 ? 'rgba(0,0,0,' + (1 - b.bright / 100) + ')' : 'rgba(255,255,255,' + ((b.bright - 100) / 200) + ')'; ctx.fillRect(0, 0, W, H); }
  }
}
function drawFigure(ctx, e, cx, base, hpx, alpha){
  var img = e.img, nh = img.naturalHeight, s = hpx / (REF_H * nh), x0 = e.trim[0], x1 = e.trim[1], sw = x1 - x0;
  var dw = sw * s, dh = nh * s, dx = cx - dw / 2, dy = base - REF_BOT * nh * s;
  if(alpha != null) ctx.globalAlpha = alpha;
  ctx.drawImage(img, x0, 0, sw, nh, dx, dy, dw, dh);
  ctx.globalAlpha = 1;
  return { x0: dx, x1: dx + dw, y0: dy + REF_TOP * nh * s, y1: base };
}
function draw(ctx, W, H, overlay){
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, W, H);
  var found = [], labels = [];
  for(var r = S.rows.length - 1; r >= 0; r--){                                  // back row first, front row last
    var row = S.rows[r], g = rowGeom(row, W, H), order = row.ids.map(function(id, i){ return { id: id, i: i }; });
    var mid = (row.ids.length - 1) / 2;
    order.sort(function(a, b){ return Math.abs(b.i - mid) - Math.abs(a.i - mid) || a.i - b.i; });   // edges first, centre on top
    for(var k = 0; k < order.length; k++){
      var it = order[k], cx = g.x0 + it.i * g.pitch, e = figureFor(it.id);
      if(S.shadow){
        var sy = g.base - g.nom * 0.03, sh = ctx.createRadialGradient(0, 0, 0, 0, 0, g.nom * 0.62);
        sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save(); ctx.translate(cx, sy); ctx.scale(1, 0.22); ctx.fillStyle = sh; ctx.fillRect(-g.nom, -g.nom, g.nom * 2, g.nom * 2); ctx.restore();
      }
      var box = e ? drawFigure(ctx, e, cx, g.base, g.hpx) : { x0: cx - g.nom / 2, x1: cx + g.nom / 2, y0: g.base - g.hpx * REF_H, y1: g.base };
      if(!e && overlay){ ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([6, 6]); ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0); ctx.restore(); }
      var shrink = (box.x1 - box.x0) * 0.2;
      found.push({ id: it.id, row: r, i: it.i, x0: box.x0 + shrink, x1: box.x1 - shrink, y0: box.y0, y1: box.y1, z: -r * 1000 - Math.abs(it.i - mid) });
      if(S.names === 'all' || (S.names === 'front' && r === 0)) labels.push({ id: it.id, cx: cx, y: g.base, hpx: g.hpx });
    }
  }
  if(labels.length){
    labels.forEach(function(L){
      var d = byId(L.id); if(!d) return;
      var fs = Math.max(11, Math.round(H * 0.019 * Math.min(1, L.hpx / (H * 0.66) + 0.25))), txt = label(d).toUpperCase();
      ctx.font = '800 ' + fs + 'px "Barlow Condensed","Arial Narrow",Arial,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.lineWidth = Math.max(3, fs * 0.28); ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineJoin = 'round'; ctx.strokeText(txt, L.cx, L.y + fs * 0.25);
      ctx.fillStyle = '#fff'; ctx.fillText(txt, L.cx, L.y + fs * 0.25);
    });
  }
  if(overlay){
    found.sort(function(a, b){ return b.z - a.z; }); hit = found;
    if(S.sel){
      var f = hit.filter(function(h){ return h.id === S.sel; })[0];
      if(f){ ctx.save(); ctx.strokeStyle = '#1fd6bd'; ctx.lineWidth = Math.max(3, W / 500); ctx.setLineDash([10, 6]); var pad = 6; ctx.strokeRect(f.x0 - (f.x1 - f.x0) * 0.2 - pad, f.y0 - pad, (f.x1 - f.x0) * 1.4 + pad * 2, f.y1 - f.y0 + pad * 2); ctx.restore(); }
    }
    if(drag && drag.moving){
      var dd = byId(drag.id), ee = dd && figureFor(drag.id), rr = S.rows[drag.hoverRow] || S.rows[0];
      if(ee && rr){ var gg = rowGeom(rr, W, H); drawFigure(ctx, ee, drag.px, drag.py + gg.hpx * 0.45, gg.hpx, 0.75); }
      if(drag.hoverRow != null && S.rows[drag.hoverRow]){
        var g2 = rowGeom(S.rows[drag.hoverRow], W, H), mx = g2.x0 + (drag.slot - 0.5) * g2.pitch;
        ctx.save(); ctx.strokeStyle = '#ffb238'; ctx.lineWidth = Math.max(4, W / 400); ctx.beginPath(); ctx.moveTo(mx, g2.base - g2.hpx * REF_H); ctx.lineTo(mx, g2.base); ctx.stroke(); ctx.restore();
      }
    }
  }
}
function repaint(){
  if(!UI || raf) return;
  raf = requestAnimationFrame(function(){
    raf = 0; if(!UI) return;
    var d = dims(), c = UI.canvas;
    if(c.width !== d.w || c.height !== d.h){ c.width = d.w; c.height = d.h; }
    draw(c.getContext('2d'), d.w, d.h, true);
    paintSelBar();
  });
}

/* ---------------------------------------------------------------- loading pictures */
function FN(){ return (window.IFWL_AUTH && window.IFWL_AUTH.FUNCTION) || 'https://europe-west2-ifwl-591d8.cloudfunctions.net/rtGate'; }
function trimOf(img){
  var w = 150, h = Math.max(1, Math.round(150 * img.naturalHeight / img.naturalWidth)), c = document.createElement('canvas'); c.width = w; c.height = h;
  var x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
  var px; try{ px = x.getImageData(0, 0, w, h).data; }catch(e){ return [0, img.naturalWidth]; }
  var lo = w, hi = -1;
  for(var j = 0; j < h; j++) for(var i = 0; i < w; i++) if(px[(j * w + i) * 4 + 3] > 20){ if(i < lo) lo = i; if(i > hi) hi = i; }
  if(hi < 0) return [0, img.naturalWidth];
  var k = img.naturalWidth / w, pad = 3;
  return [Math.max(0, Math.floor((lo - pad) * k)), Math.min(img.naturalWidth, Math.ceil((hi + 1 + pad) * k))];
}
function loadOne(d){
  var key = d.id + ':' + d.v;
  if(IMG[key]) return Promise.resolve();
  return fetch(FN() + '?kitLineupImg=1&id=' + encodeURIComponent(d.id) + '&token=' + encodeURIComponent(K.tok()), { cache: 'force-cache' })
    .then(function(r){ if(!r.ok) throw new Error('x'); return r.blob(); })
    .then(function(b){
      return new Promise(function(res, rej){ var im = new Image(), u = URL.createObjectURL(b); im.onload = function(){ res({ im: im, u: u }); }; im.onerror = function(){ rej(new Error('x')); }; im.src = u; });
    })
    .then(function(o){ IMG[key] = { img: o.im, trim: trimOf(o.im) }; })
    .catch(function(){ IMG[key] = 'fail'; });
}
function loadAll(){
  var my = ++loadToken, todo = S.drivers.filter(function(d){ return !IMG[d.id + ':' + d.v]; }), done = 0, total = todo.length, pos = 0;
  setStatus(total ? 'Loading pictures 0/' + total + '...' : '');
  if(!total){ repaint(); return Promise.resolve(); }
  return new Promise(function(resolve){
    function next(){
      if(my !== loadToken || !UI) return resolve();
      if(pos >= todo.length){ if(done >= total){ finish(); } return; }
      var d = todo[pos++];
      loadOne(d).then(function(){ done++; setStatus('Loading pictures ' + done + '/' + total + '...'); repaint(); if(done >= total) finish(); else next(); });
    }
    function finish(){
      var bad = S.drivers.filter(function(d){ return IMG[d.id + ':' + d.v] === 'fail'; }).length;
      setStatus(bad ? bad + ' picture(s) could not be loaded and are left out of the photo.' : '');
      repaint(); resolve();
    }
    for(var w = 0; w < Math.min(5, total); w++) next();
  });
}

/* ---------------------------------------------------------------- the editor window */
var CSS = '.kgp{position:fixed;inset:0;z-index:10050;background:rgba(8,12,18,.86);display:flex;align-items:stretch;justify-content:center;padding:10px}'
 + '.kgp-box{position:relative;display:flex;flex-direction:column;width:min(100%,1500px);background:var(--panel-bg,#fff);color:var(--text-primary,#1a2230);border:1px solid var(--ifwl-line,#e3e7ed);border-radius:16px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5)}'
 + '.kgp-top{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--ifwl-line,#e3e7ed);flex-wrap:wrap}'
 + '.kgp-top h3{margin:0;font:700 19px/1.1 var(--font-display,inherit);letter-spacing:.05em;text-transform:uppercase;flex:1;min-width:160px}'
 + '.kgp-status{font-size:12px;color:var(--text-muted,#5b6576)}'
 + '.kgp-main{flex:1;min-height:0;display:flex}'
 + '.kgp-stage{flex:1;min-width:0;display:flex;flex-direction:column;padding:12px;gap:10px;overflow:auto;background:#0b0f14}'
 + '.kgp-canvaswrap{position:relative;margin:0 auto;width:100%;background:#0b0f14;border-radius:8px;overflow:hidden;line-height:0;touch-action:none}'
 + '.kgp-canvaswrap.checker{background-color:#2a2f37;background-image:linear-gradient(45deg,#3a404a 25%,transparent 25%,transparent 75%,#3a404a 75%),linear-gradient(45deg,#3a404a 25%,transparent 25%,transparent 75%,#3a404a 75%);background-size:24px 24px;background-position:0 0,12px 12px}'
 + '.kgp-canvaswrap canvas{display:block;width:100%;height:auto;cursor:grab}'
 + '.kgp-canvaswrap canvas.grabbing{cursor:grabbing}'
 + '.kgp-selbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-height:34px;color:#c9d2da;font-size:13px}'
 + '.kgp-selbar b{color:#fff}'
 + '.kgp-side{flex:0 0 360px;max-width:42%;overflow:auto;border-left:1px solid var(--ifwl-line,#e3e7ed);padding:12px 14px;display:flex;flex-direction:column;gap:14px}'
 + '.kgp-side h4{margin:0 0 8px;font:800 11px/1 var(--font-body,inherit);letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted,#5b6576)}'
 + '.kgp-sec{border-bottom:1px solid var(--ifwl-line,#e3e7ed);padding-bottom:14px}.kgp-sec:last-child{border-bottom:0}'
 + '.kgp-row2{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}'
 + '.kgp-side select,.kgp-side input[type=text],.kgp-side input[type=search]{box-sizing:border-box;width:100%;border:1px solid var(--ifwl-line,#e3e7ed);border-radius:9px;padding:8px 10px;font:600 13px/1.2 var(--font-body,inherit);background:var(--panel-bg,#fff);color:inherit}'
 + '.kgp-chk{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.4;margin:6px 0}.kgp-chk input{margin-top:3px}'
 + '.kgp-sl{display:grid;grid-template-columns:78px 1fr 40px;gap:6px;align-items:center;font-size:12px;margin:4px 0}.kgp-sl span:first-child{color:var(--text-muted,#5b6576);font-weight:700}.kgp-sl output{text-align:right;font-variant-numeric:tabular-nums;color:var(--text-muted,#5b6576)}'
 + '.kgp-sl input[type=range]{width:100%;margin:0}'
 + '.kgp-rowcard{border:1px solid var(--ifwl-line,#e3e7ed);border-radius:12px;padding:9px 10px;margin-bottom:8px}'
 + '.kgp-rowcard>b{display:flex;justify-content:space-between;font:800 11.5px/1 var(--font-body,inherit);letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px}'
 + '.kgp-list{max-height:300px;overflow:auto;border:1px solid var(--ifwl-line,#e3e7ed);border-radius:10px}'
 + '.kgp-d{display:flex;gap:8px;align-items:center;padding:5px 8px;font-size:13px;border-bottom:1px solid var(--ifwl-line,#e3e7ed);cursor:pointer}.kgp-d:last-child{border-bottom:0}.kgp-d:hover{background:rgba(14,156,138,.07)}'
 + '.kgp-d img{width:22px;height:36px;object-fit:contain;flex:none}.kgp-d span.n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
 + '.kgp-b{font:800 9.5px/1 var(--font-body,inherit);letter-spacing:.06em;text-transform:uppercase;border-radius:6px;padding:3px 6px;color:#1a1a1a}'
 + '.kgp-hint{font-size:12px;line-height:1.5;color:var(--text-muted,#5b6576)}'
 + '@media(max-width:900px){.kgp{padding:0}.kgp-box{border-radius:0}.kgp-main{flex-direction:column;overflow:auto}.kgp-stage{flex:none;overflow:visible}.kgp-side{flex:none;max-width:none;border-left:0;border-top:1px solid var(--ifwl-line,#e3e7ed);overflow:visible}}';

function opt(map, cur){ return Object.keys(map).map(function(k){ return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(map[k][0]) + '</option>'; }).join(''); }
function slider(id, name, min, max, step, val, unit){ return '<div class="kgp-sl"><span>' + name + '</span><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"><output>' + val + (unit || '') + '</output></div>'; }

function open(){
  if(UI) return;
  if(!document.getElementById('kgpCss')){ var st = document.createElement('style'); st.id = 'kgpCss'; st.textContent = CSS; document.head.appendChild(st); }
  var ov = document.createElement('div'); ov.className = 'kgp'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Group photo maker');
  ov.innerHTML = '<div class="kgp-box"><div class="kgp-top"><h3>Group photo</h3><span class="kgp-status" id="kgpStatus"></span>'
    + '<button type="button" class="kit-btn teal" id="kgpDownload">Download PNG</button><button type="button" class="kit-btn ghost" id="kgpClose">Close</button></div>'
    + '<div class="kgp-main"><div class="kgp-stage"><div class="kgp-canvaswrap" id="kgpWrap"><canvas id="kgpCanvas" width="1920" height="1080"></canvas></div><div class="kgp-selbar" id="kgpSel"></div></div>'
    + '<div class="kgp-side" id="kgpSide"><div class="kgp-hint">Loading drivers...</div></div></div></div>';
  document.body.appendChild(ov);
  UI = { ov: ov, canvas: ov.querySelector('#kgpCanvas'), wrap: ov.querySelector('#kgpWrap'), side: ov.querySelector('#kgpSide') };
  document.documentElement.style.overflow = 'hidden';
  ov.querySelector('#kgpClose').onclick = close;
  ov.querySelector('#kgpDownload').onclick = download;
  document.addEventListener('keydown', onKey);
  wireCanvas();
  K.api('kitLineup').then(function(r){
    var list = r.drivers || [], known = {};
    list.forEach(function(d){ known[d.id] = 1; if(S.on[d.id] === undefined) S.on[d.id] = true; });
    var first = !S.drivers.length;
    S.drivers = list;
    S.rows.forEach(function(row){ row.ids = row.ids.filter(function(id){ return known[id]; }); });
    tidyRows(); if(S.sel && !known[S.sel]) S.sel = null;
    if(first || !S.rows.length){ S.nrows = Math.max(1, Math.min(6, Math.ceil(included().length / 9))); autoArrange(); }
    else list.forEach(function(d){ if(S.on[d.id] && !locate(d.id)) addToRows(d.id); });
    if(!list.length){ UI.side.innerHTML = '<div class="kgp-hint"><b>Nobody has a finished avatar yet.</b> Drivers show up here once they have saved their own kit.</div>'; }
    else buildSide();
    repaint(); loadAll();
  }).catch(function(e){ if(UI) UI.side.innerHTML = '<div class="kgp-hint">' + esc((e && e.message) || 'Could not load the drivers.') + '</div>'; });
  repaint();
}
function close(){
  if(!UI) return;
  document.removeEventListener('keydown', onKey);
  UI.ov.remove(); UI = null; loadToken++; drag = null; document.documentElement.style.overflow = '';
}
function onKey(e){
  if(e.key === 'Escape' && !drag){ close(); return; }
  if(!S.sel || /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) return;
  var map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'back', ArrowDown: 'front', Delete: 'remove', Backspace: 'remove' };
  if(map[e.key]){ e.preventDefault(); nudge(map[e.key]); }
}
function setStatus(t){ var s = UI && UI.ov.querySelector('#kgpStatus'); if(s) s.textContent = t || ''; }

function buildSide(){
  var P = S.drivers.filter(function(d){ return d.patreon; }).length, dm = SHAPES[S.shape];
  var h = '<div class="kgp-sec"><h4>Picture</h4><div class="kgp-row2"><select id="kgpShape" aria-label="Shape">' + opt(SHAPES, S.shape) + '</select><select id="kgpQual" aria-label="Quality">' + opt(QUALITY, S.quality) + '</select></div>'
    + '<div class="kgp-row2"><button type="button" class="kit-btn small ghost" id="kgpBgBtn">Add a background</button><button type="button" class="kit-btn small ghost" id="kgpBgClear"' + (S.bg.img ? '' : ' hidden') + '>Remove background</button><input type="file" id="kgpBgFile" accept="image/png,image/jpeg,image/webp" hidden></div>'
    + '<div class="kgp-hint" id="kgpBgName">' + (S.bg.img ? esc(S.bg.name) : 'Upload your own picture (a track, a pit wall, a trophy room). It stays on your computer; nothing is saved to IFWL.') + '</div>'
    + '<div id="kgpBgCtl"' + (S.bg.img ? '' : ' hidden') + '>' + slider('kgpBgZoom', 'Zoom', 100, 300, 1, S.bg.zoom, '%') + slider('kgpBgX', 'Left / right', 0, 100, 1, S.bg.x, '') + slider('kgpBgY', 'Up / down', 0, 100, 1, S.bg.y, '') + slider('kgpBgBr', 'Brightness', 30, 150, 1, S.bg.bright, '%') + '</div>'
    + '<div class="kgp-row2" style="margin-top:6px"><label class="kgp-chk" style="margin:0"><input type="checkbox" id="kgpTransp"' + (S.transparent ? ' checked' : '') + '><span>Transparent background (for your own editing)</span></label></div>'
    + '<div class="kgp-row2"><label style="font-size:12px;font-weight:700;color:var(--text-muted,#5b6576)">Plain colour</label><input type="color" id="kgpColour" value="' + esc(S.colour) + '" style="width:44px;height:30px;border:0;padding:0;background:none"></div>'
    + '<div class="kgp-row2"><select id="kgpNames" aria-label="Name labels"><option value="off">No name labels</option><option value="front">Names under the front row</option><option value="all">Names under every row</option></select></div>'
    + '<label class="kgp-chk"><input type="checkbox" id="kgpShadow"' + (S.shadow ? ' checked' : '') + '><span>Soft shadow under each driver\'s feet</span></label></div>';
  h += '<div class="kgp-sec"><h4>Rows</h4><div class="kgp-row2"><span style="font-size:13px;font-weight:700">Number of rows</span><button type="button" class="kit-btn small ghost" id="kgpRowsMinus" aria-label="Fewer rows">-</button><b id="kgpRowsN" style="min-width:18px;text-align:center">' + S.nrows + '</b><button type="button" class="kit-btn small ghost" id="kgpRowsPlus" aria-label="More rows">+</button><button type="button" class="kit-btn small teal" id="kgpAuto">Arrange everyone</button></div>'
    + '<label class="kgp-chk"><input type="checkbox" id="kgpPatFront"' + (S.patronsFront ? ' checked' : '') + '><span>Patreons in the front row(s), everyone else behind</span></label>'
    + '<label class="kgp-chk"><input type="checkbox" id="kgpCentre"' + (S.centrePatrons ? ' checked' : '') + '><span>Highest Patreon tier in the middle of the front row</span></label>'
    + '<label class="kgp-chk"><input type="checkbox" id="kgpSqueeze"' + (S.squeeze ? ' checked' : '') + '><span>Squeeze a row in if it is too wide for the picture</span></label>'
    + '<div id="kgpRows"></div>'
    + '<div class="kgp-hint">Drag a driver to move them to any spot or row. Click a driver, then use the arrow keys or buttons under the picture. Each row\'s <b>Height</b> slider lifts it up the steps; <b>Size</b> makes the people bigger or smaller.</div></div>';
  h += '<div class="kgp-sec"><h4>Drivers in the photo (<span id="kgpCount"></span>)</h4><div class="kgp-row2"><input type="search" id="kgpSearch" placeholder="Search" aria-label="Search drivers"></div>'
    + '<div class="kgp-row2"><button type="button" class="kit-btn small ghost" data-p="all">All</button><button type="button" class="kit-btn small ghost" data-p="none">None</button>' + (P ? '<button type="button" class="kit-btn small ghost" data-p="pat">Patreons only</button>' : '') + '</div>'
    + '<div class="kgp-list" id="kgpList"></div><div class="kgp-hint" style="margin-top:6px">Only drivers who have saved their own kit are listed. People still on the plain white figure are left out.</div></div>';
  UI.side.innerHTML = h;
  UI.side.querySelector('#kgpNames').value = S.names;
  wireSide(); paintRows(); paintList(); paintMisc();
}
function paintMisc(){
  var w = UI.wrap; w.classList.toggle('checker', !!S.transparent);
  var n = q('#kgpRowsN', UI.side); if(n) n.textContent = S.nrows;
  var c = q('#kgpCount', UI.side); if(c) c.textContent = included().length + ' of ' + S.drivers.length;
}
function paintRows(){
  var box = q('#kgpRows', UI.side); if(!box) return;
  box.innerHTML = S.rows.map(function(r, i){
    var nm = i === 0 ? 'Front row' : 'Row ' + (i + 1);
    return '<div class="kgp-rowcard" data-r="' + i + '"><b><span>' + nm + '</span><span>' + r.ids.length + ' driver' + (r.ids.length === 1 ? '' : 's') + '</span></b>'
      + slider('kgpH' + i, 'Height', 20, 100, 0.5, r.base, '') + slider('kgpS' + i, 'Size', 15, 100, 0.5, r.h, '') + slider('kgpG' + i, 'Spacing', 40, 150, 1, r.gap, '%') + slider('kgpD' + i, 'Shift', -50, 50, 0.5, r.dx, '') + '<label class="kgp-chk" style="margin:4px 0 0"><input type="checkbox" data-stag="' + i + '"' + (r.stag ? ' checked' : '') + '><span>Offset half a step sideways</span></label></div>';
  }).join('');
  S.rows.forEach(function(r, i){
    var sg = q('[data-stag="' + i + '"]', box); if(sg) sg.addEventListener('change', function(){ r.stag = sg.checked; repaint(); });
    [['kgpH', 'base'], ['kgpS', 'h'], ['kgpG', 'gap'], ['kgpD', 'dx']].forEach(function(p){
      var el = q('#' + p[0] + i, box); if(!el) return;
      el.addEventListener('input', function(){ r[p[1]] = Number(el.value); el.parentNode.querySelector('output').textContent = el.value + (p[1] === 'gap' ? '%' : ''); repaint(); });
    });
  });
}
function paintList(){
  var box = q('#kgpList', UI.side); if(!box) return;
  var term = String((q('#kgpSearch', UI.side) || {}).value || '').toLowerCase();
  box.innerHTML = S.drivers.filter(function(d){ return !term || (label(d) + ' ' + d.discord + ' ' + parseName(d.name).num).toLowerCase().indexOf(term) >= 0; }).map(function(d){
    var p = parseName(d.name), pt = d.patreon ? '<span class="kgp-b" style="background:' + PAT[d.patreon][1] + '">' + PAT[d.patreon][0] + '</span>' : '';
    return '<label class="kgp-d"><input type="checkbox" data-id="' + esc(d.id) + '"' + (S.on[d.id] ? ' checked' : '') + '>' + (d.smallUrl ? '<img loading="lazy" src="' + esc(d.smallUrl) + '" alt="">' : '') + '<span class="n">' + (p.num ? '<b>' + esc(p.num) + '</b> ' : '') + esc(label(d)) + '</span>' + pt + '</label>';
  }).join('') || '<div class="kgp-hint" style="padding:8px">No match.</div>';
}
function refresh(){ if(!UI) return; paintRows(); paintMisc(); repaint(); var c = q('#kgpList', UI.side); if(c) c.querySelectorAll('input[data-id]').forEach(function(i){ i.checked = !!S.on[i.getAttribute('data-id')]; }); }

function wireSide(){
  var s = UI.side, g = function(id){ return q('#' + id, s); };
  g('kgpShape').onchange = function(){ S.shape = this.value; repaint(); };
  g('kgpQual').onchange = function(){ S.quality = this.value; repaint(); };
  g('kgpNames').onchange = function(){ S.names = this.value; repaint(); };
  g('kgpTransp').onchange = function(){ S.transparent = this.checked; paintMisc(); repaint(); };
  g('kgpShadow').onchange = function(){ S.shadow = this.checked; repaint(); };
  g('kgpColour').oninput = function(){ S.colour = this.value; repaint(); };
  g('kgpBgBtn').onclick = function(){ g('kgpBgFile').click(); };
  g('kgpBgFile').onchange = function(){ var f = this.files && this.files[0]; this.value = ''; if(f) setBackground(f); };
  g('kgpBgClear').onclick = function(){ S.bg.img = null; S.bg.name = ''; g('kgpBgClear').hidden = true; g('kgpBgCtl').hidden = true; g('kgpBgName').textContent = 'Upload your own picture (a track, a pit wall, a trophy room). It stays on your computer; nothing is saved to IFWL.'; repaint(); };
  [['kgpBgZoom', 'zoom'], ['kgpBgX', 'x'], ['kgpBgY', 'y'], ['kgpBgBr', 'bright']].forEach(function(p){ var el = g(p[0]); el.oninput = function(){ S.bg[p[1]] = Number(el.value); el.parentNode.querySelector('output').textContent = el.value + (p[1] === 'zoom' || p[1] === 'bright' ? '%' : ''); repaint(); }; });
  g('kgpRowsMinus').onclick = function(){ S.nrows = Math.max(1, S.nrows - 1); autoArrange(); refresh(); };
  g('kgpRowsPlus').onclick = function(){ S.nrows = Math.min(8, S.nrows + 1); autoArrange(); refresh(); };
  g('kgpAuto').onclick = function(){ autoArrange(); refresh(); };
  g('kgpPatFront').onchange = function(){ S.patronsFront = this.checked; autoArrange(); refresh(); };
  g('kgpCentre').onchange = function(){ S.centrePatrons = this.checked; autoArrange(); refresh(); };
  g('kgpSqueeze').onchange = function(){ S.squeeze = this.checked; repaint(); };
  g('kgpSearch').oninput = paintList;
  s.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-p]'); if(!b) return;
    var p = b.getAttribute('data-p');
    S.drivers.forEach(function(d){ S.on[d.id] = p === 'all' ? true : p === 'none' ? false : !!d.patreon; });
    autoArrange(); refresh();
  });
  s.addEventListener('change', function(e){
    var i = e.target; if(!i.matches || !i.matches('#kgpList input[data-id]')) return;
    var id = i.getAttribute('data-id'); S.on[id] = i.checked;
    if(i.checked) addToRows(id); else { removeFromRows(id); if(S.sel === id) S.sel = null; }
    refresh();
  });
}
function setBackground(file){
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)){ setStatus('Choose a PNG, JPEG or WebP picture.'); return; }
  if(file.size > 25 * 1024 * 1024){ setStatus('That picture is over 25 MB. Choose a smaller one.'); return; }
  var u = URL.createObjectURL(file), im = new Image();
  im.onload = function(){
    S.bg.img = im; S.bg.name = file.name; S.bg.zoom = 100; S.bg.x = 50; S.bg.y = 50; S.bg.bright = 100; S.transparent = false;
    if(UI){ buildSide(); repaint(); setStatus(''); }
  };
  im.onerror = function(){ setStatus('That picture could not be opened.'); };
  im.src = u;
}

/* ---------------------------------------------------------------- selection and nudging */
function paintSelBar(){
  var bar = UI && q('#kgpSel', UI.ov); if(!bar) return;
  var d = S.sel && byId(S.sel);
  if(!d){ bar.removeAttribute('data-k'); bar.innerHTML = '<span>Drag a driver to move them. Click one to select.</span>'; return; }
  var key = d.id + S.rows.length + (locate(d.id) || {}).r;
  if(bar.getAttribute('data-k') === key) return; bar.setAttribute('data-k', key);
  bar.innerHTML = '<b>' + esc(label(d)) + '</b><button type="button" class="kit-btn small ghost" data-n="left" aria-label="Move left">&larr;</button><button type="button" class="kit-btn small ghost" data-n="right" aria-label="Move right">&rarr;</button>'
    + '<button type="button" class="kit-btn small ghost" data-n="back">Row behind</button><button type="button" class="kit-btn small ghost" data-n="front">Row in front</button><button type="button" class="kit-btn small red" data-n="remove">Take out of photo</button>';
}
function nudge(a){
  var id = S.sel, at = id && locate(id); if(!at) return;
  var row = S.rows[at.r];
  if(a === 'left' && at.i > 0){ row.ids.splice(at.i, 1); row.ids.splice(at.i - 1, 0, id); }
  else if(a === 'right' && at.i < row.ids.length - 1){ row.ids.splice(at.i, 1); row.ids.splice(at.i + 1, 0, id); }
  else if(a === 'back' || a === 'front'){
    var to = a === 'back' ? at.r + 1 : at.r - 1;
    if(to < 0) return;
    row.ids.splice(at.i, 1);
    if(to >= S.rows.length){ var nr = rowDefaults(S.rows.length, S.rows.length + 1); nr.ids = [id]; nr.base = Math.max(25, row.base - 9); nr.h = Math.max(20, row.h * 0.9); S.rows.push(nr); }
    else { var tg = S.rows[to], mid = Math.floor(tg.ids.length / 2); tg.ids.splice(mid, 0, id); }
    tidyRows();
  }
  else if(a === 'remove'){ S.on[id] = false; removeFromRows(id); S.sel = null; }
  var bar = q('#kgpSel', UI.ov); if(bar) bar.removeAttribute('data-k');
  refresh();
}

/* ---------------------------------------------------------------- dragging on the picture */
function toCanvas(e){
  var r = UI.canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * UI.canvas.width / r.width, y: (e.clientY - r.top) * UI.canvas.height / r.height };
}
function rowAt(y, W, H){                    // the ghost's feet follow the pointer: pick the row whose floor line they are nearest to
  var best = 0, bd = 1e9;
  for(var r = 0; r < S.rows.length; r++){
    var g = rowGeom(S.rows[r], W, H), d = Math.abs(y + g.hpx * 0.45 - g.base);
    if(d < bd){ bd = d; best = r; }
  }
  return best;
}
function slotAt(rowIx, x, W, H, skipId){
  var row = S.rows[rowIx], g = rowGeom(row, W, H), n = 0;
  row.ids.forEach(function(id, i){ if(id === skipId) return; if(g.x0 + i * g.pitch < x) n++; });
  return n;
}
function wireCanvas(){
  var c = UI.canvas;
  c.addEventListener('pointerdown', function(e){
    if(e.button > 0) return;
    var p = toCanvas(e), f = null;
    for(var i = 0; i < hit.length; i++){ var h = hit[i]; if(p.x >= h.x0 && p.x <= h.x1 && p.y >= h.y0 && p.y <= h.y1){ f = h; break; } }
    if(!f){ if(S.sel){ S.sel = null; repaint(); } return; }
    S.sel = f.id; drag = { id: f.id, sx: p.x, sy: p.y, moving: false, px: p.x, py: p.y, hoverRow: f.row, slot: f.i };
    try{ c.setPointerCapture(e.pointerId); }catch(er){}
    repaint();
  });
  c.addEventListener('pointermove', function(e){
    if(!drag) return;
    var p = toCanvas(e), W = c.width, H = c.height;
    if(!drag.moving && Math.hypot(p.x - drag.sx, p.y - drag.sy) > Math.max(8, W / 240)){ drag.moving = true; c.classList.add('grabbing'); }
    if(!drag.moving) return;
    drag.px = p.x; drag.py = p.y; drag.hoverRow = rowAt(p.y, W, H); drag.slot = slotAt(drag.hoverRow, p.x, W, H, drag.id);
    repaint();
  });
  function end(e){
    if(!drag) return;
    var d = drag; drag = null; c.classList.remove('grabbing');
    try{ c.releasePointerCapture(e.pointerId); }catch(er){}
    if(d.moving && S.rows[d.hoverRow]){
      var from = locate(d.id), toRow = S.rows[d.hoverRow], slot = d.slot;
      if(from){ S.rows[from.r].ids.splice(from.i, 1); }
      toRow.ids.splice(Math.min(slot, toRow.ids.length), 0, d.id);
      tidyRows();
    }
    var bar = q('#kgpSel', UI.ov); if(bar) bar.removeAttribute('data-k');
    refresh();
  }
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  UI.ov.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-n]'); if(b){ nudge(b.getAttribute('data-n')); } });
}

/* ---------------------------------------------------------------- download */
function download(){
  var d = dims(), c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
  var stillLoading = S.drivers.some(function(x){ return S.on[x.id] && !IMG[x.id + ':' + x.v]; });
  if(stillLoading){ setStatus('Wait for the pictures to finish loading, then download.'); return; }
  draw(c.getContext('2d'), d.w, d.h, false);
  c.toBlob(function(b){
    if(!b){ setStatus('Your browser could not make that picture. Try the Standard quality.'); return; }
    var a = document.createElement('a'), t = new Date(), pad = function(n){ return (n < 10 ? '0' : '') + n; };
    a.href = URL.createObjectURL(b); a.download = 'ifwl-group-photo-' + t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) + '.png';
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    setStatus('Downloaded ' + d.w + ' x ' + d.h + ' px.');
  }, 'image/png');
}

window.IFWL_KIT_GROUP = { open: open, close: close, _state: S, _draw: draw, _autoArrange: autoArrange };
})();
