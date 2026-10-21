/* ============================================================
   SIMPLE FUEL CALCULATOR (Gold Patreon, solo only)
   Slider + editable litres box, a tank that fills and drains, and the tank scales with its size.
   Pure front end: no requests, nothing is stored except the driver's own last numbers in this browser.
   ============================================================ */
(() => {
  const root = document.getElementById('fcsRoot');
  if (!root) return;
  const KEY = 'IFWL_FCS_V1';
  const DEF = { fuel: 60, fpl: 2.75, lap: '', tank: 120, raceMode: 'laps', race: '' };
  let S = Object.assign({}, DEF);
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && typeof o === 'object') S = Object.assign(S, o); } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} };
  const $ = (id) => document.getElementById(id);
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function parseLap(t) {            // "1:54.682" | "114.682" | "1:54" -> seconds
    t = String(t || '').trim(); if (!t) return NaN;
    const m = t.match(/^(\d+):(\d{1,2}(?:[.,]\d{1,3})?)$/);
    if (m) return parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(',', '.'));
    const s = parseFloat(t.replace(',', '.')); return Number.isFinite(s) && s > 20 ? s : NaN;
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's' : m + 'm ' + String(s).padStart(2, '0') + 's';
  }

  root.innerHTML = '<div class="fcs-wrap">'
    + '<div>'
    + '<div class="fcs-card"><h4>Fuel in the car</h4>'
    + '<div class="fcs-fuelrow"><div class="fcs-num"><button type="button" id="fcsMinus" aria-label="Less fuel">&minus;</button><input id="fcsFuel" type="number" inputmode="decimal" step="0.5" min="0" aria-label="Litres of fuel"><button type="button" id="fcsPlus" aria-label="More fuel">+</button></div><span class="fcs-unit">litres</span></div>'
    + '<input class="fcs-range" id="fcsRange" type="range" min="0" step="0.5" aria-label="Fuel slider"><div class="fcs-rangelab"><span>0</span><span id="fcsMax"></span></div></div>'
    + '<div class="fcs-card"><h4>Your car</h4><div class="fcs-fields">'
    + '<label>Fuel per lap (litres)<input id="fcsFpl" type="number" inputmode="decimal" step="0.01" min="0.1"></label>'
    + '<label>Lap time (optional)<input id="fcsLap" type="text" inputmode="decimal" placeholder="1:54.682"></label></div>'
    + '<div class="fcs-hint">Fuel per lap is what your car uses on average. Add a lap time to see how long the fuel lasts.</div></div>'
    + '<div class="fcs-card"><h4>How long is the race? (optional)</h4><div class="fcs-fields"><label>Race length<div class="fcs-two"><input id="fcsRace" type="number" inputmode="decimal" min="1" step="1" placeholder="e.g. 30"><select id="fcsMode" style="max-width:110px"><option value="laps">laps</option><option value="mins">minutes</option></select></div></label></div>'
    + '<div class="fcs-hint">Fills in a line on the tank showing the fuel the race needs.</div></div>'
    + '<div class="fcs-card"><h4>What you get</h4><div class="fcs-res"><div class="fcs-stat"><span>Fuel lasts</span><strong id="fcsLaps">-</strong><small>laps</small></div><div class="fcs-stat"><span>Time on track</span><strong id="fcsTime">-</strong><small id="fcsTimeNote">add a lap time</small></div></div><div id="fcsVerdict"></div></div>'
    + '</div>'
    + '<div class="fcs-tankbox"><div class="fcs-stage" id="fcsStage"></div><div class="fcs-tanksize" id="fcsTankSize"></div></div></div>';

  /* ---------- the tank ---------- */
  function tankDims(cap) {          // the tank itself gets bigger or smaller with its capacity
    return { w: Math.round(clamp(110 + (cap - 120) * 0.55, 70, 190)), h: Math.round(clamp(170 + (cap - 120) * 1.05, 90, 310)) };
  }
  let lastCap = null;
  function drawTank(cap, fuel, needed, colour) {
    const stage = $('fcsStage'), d = tankDims(cap), pad = 44, nx = 18, top = 14;     // room for the scale on the right and the filler neck on top
    const W = d.w + pad + 8, H = d.h + top + 14, bx = 8, by = top, bw = d.w, bh = d.h, r = 14;
    if (lastCap !== cap || !$('fcsSvg')) {
      lastCap = cap;
      let ticks = '';
      [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
        const y = by + bh * (1 - t);
        ticks += '<line x1="' + (bx + bw) + '" x2="' + (bx + bw + 7) + '" y1="' + y + '" y2="' + y + '" stroke="#8b93a2" stroke-width="1.5"/><text x="' + (bx + bw + 11) + '" y="' + (y + 4) + '" font-size="11" font-weight="700" fill="#5b6576">' + Math.round(cap * t) + '</text>';
      });
      stage.innerHTML = '<svg id="fcsSvg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Fuel tank">'
        + '<defs><clipPath id="fcsClip"><rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="' + r + '"/></clipPath>'
        + '<linearGradient id="fcsGloss" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient></defs>'
        + '<rect x="' + (bx + bw / 2 - 14) + '" y="2" width="28" height="14" rx="4" fill="#5b6576"/>'
        + '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="' + r + '" fill="#eef2f6"/>'
        + '<g clip-path="url(#fcsClip)"><g id="fcsFluid" class="fcs-fluid" style="transform:translateY(' + bh + 'px)">'
        + '<g class="fcs-wave2"><path id="fcsW2" d="" fill="currentColor"/></g><g class="fcs-wave"><path id="fcsW1" d="" fill="currentColor"/></g>'
        + '<rect id="fcsBody" x="' + bx + '" y="' + (by + 8) + '" width="' + bw + '" height="' + (bh + 10) + '" fill="currentColor"/></g>'
        + '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" fill="url(#fcsGloss)"/></g>'
        + '<line id="fcsNeedLine" x1="' + (bx - 4) + '" x2="' + (bx + bw + 4) + '" y1="0" y2="0" stroke="#1a2230" stroke-width="2" stroke-dasharray="5 4" style="display:none"/>'
        + '<text id="fcsNeedLab" x="' + (bx + 6) + '" y="0" font-size="11" font-weight="800" fill="#1a2230" style="display:none"></text>'
        + '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="' + r + '" fill="none" stroke="#3b4658" stroke-width="3.5"/>'
        + ticks
        + '<text id="fcsInLab" x="' + (bx + bw / 2) + '" y="' + (by + bh / 2 + 8) + '" text-anchor="middle" font-size="26" font-weight="900" fill="#1a2230" stroke="#fff" stroke-width="4" paint-order="stroke"></text></svg>';
      // wave paths (two periods wide so they can slide)
      const wave = (amp, ph) => { let p = 'M' + (bx - 80) + ' ' + (by + 8); for (let x = -80; x <= bw + 80; x += 20) p += ' L' + (bx + x) + ' ' + (by + 8 + Math.sin((x + ph) / 80 * Math.PI * 2) * amp); return p + ' L' + (bx + bw + 80) + ' ' + (by + bh + 20) + ' L' + (bx - 80) + ' ' + (by + bh + 20) + ' Z'; };
      $('fcsW1').setAttribute('d', wave(3.2, 0)); $('fcsW2').setAttribute('d', wave(2.4, 40));
    }
    const frac = cap > 0 ? clamp(fuel / cap, 0, 1) : 0;
    const fl = $('fcsFluid'); fl.style.transform = 'translateY(' + (bh * (1 - frac)) + 'px)'; fl.style.color = colour;
    $('fcsInLab').textContent = f1(fuel) + ' L';
    const nl = $('fcsNeedLine'), nt = $('fcsNeedLab');
    if (needed > 0) {
      const y = by + bh * (1 - clamp(needed / cap, 0, 1));
      nl.setAttribute('y1', y); nl.setAttribute('y2', y); nl.style.display = '';
      nt.setAttribute('y', Math.max(y - 5, by + 11)); nt.textContent = 'Race ' + f1(needed) + ' L'; nt.style.display = '';
    } else { nl.style.display = 'none'; nt.style.display = 'none'; }
  }

  /* ---------- the maths ---------- */
  function update(fromInput) {
    const cap = clamp(Math.round(S.tank) || 120, 20, 400);
    S.tank = cap;
    S.fuel = clamp(Number.isFinite(S.fuel) ? S.fuel : 0, 0, cap);
    const fpl = num(S.fpl), lapSec = parseLap(S.lap);
    const range = $('fcsRange'); range.max = cap; range.value = S.fuel; $('fcsMax').textContent = cap + ' L';
    if (fromInput !== 'fuel') $('fcsFuel').value = (Math.round(S.fuel * 10) / 10);
    $('fcsFuel').max = cap;

    const validFpl = fpl > 0;
    const laps = validFpl ? S.fuel / fpl : NaN;
    $('fcsLaps').textContent = validFpl ? f1(laps) : '-';
    const secs = validFpl && lapSec > 0 ? laps * lapSec : NaN;
    $('fcsTime').textContent = Number.isFinite(secs) ? fmtDur(secs) : '-';
    $('fcsTimeNote').textContent = Number.isFinite(secs) ? 'at ' + Math.floor(lapSec / 60) + ':' + (lapSec % 60).toFixed(3).padStart(6, '0') + ' per lap' : (S.lap && !(lapSec > 0) ? 'lap time looks wrong (try 1:54.682)' : 'add a lap time');

    // race fuel
    const raceN = num(S.race); let raceLaps = NaN;
    if (raceN > 0 && validFpl) {
      if (S.raceMode === 'laps') raceLaps = Math.ceil(raceN);
      else if (lapSec > 0) raceLaps = Math.ceil(raceN * 60 / lapSec);
    }
    const needed = Number.isFinite(raceLaps) ? raceLaps * fpl : 0;
    const safe = needed + (validFpl ? fpl : 0);          // one lap of safety on top
    let cls = 'ok', msg = '', btn = '';
    if (!validFpl) { cls = 'warn'; msg = 'Type your fuel per lap to see how far the fuel goes.'; }
    else if (raceN > 0 && S.raceMode === 'mins' && !(lapSec > 0)) { cls = 'warn'; msg = 'Add a lap time so minutes can be turned into laps.'; }
    else if (!needed) { msg = ''; }
    else if (needed > cap) {
      const stops = Math.ceil(needed / cap) - 1;
      cls = 'warn'; msg = 'The race needs ' + f1(needed) + ' L but this tank holds ' + cap + ' L - plan ' + stops + ' fuel stop' + (stops === 1 ? '' : 's') + '.';
    } else if (S.fuel >= safe) { cls = 'ok'; msg = 'Enough for the race with ' + f1(S.fuel - needed) + ' L (' + f1((S.fuel - needed) / fpl) + ' laps) to spare.'; }
    else if (S.fuel >= needed) { cls = 'warn'; msg = 'Just enough - only ' + f1((S.fuel - needed) / fpl) + ' laps spare.'; btn = Math.min(cap, safe); }
    else { cls = 'bad'; msg = 'Short by ' + f1(needed - S.fuel) + ' L (' + f1((needed - S.fuel) / fpl) + ' laps).'; btn = Math.min(cap, safe); }
    const v = $('fcsVerdict');
    v.innerHTML = msg ? '<div class="fcs-verdict ' + cls + '">' + msg + (btn ? ' <button type="button" id="fcsFill" data-v="' + btn + '">Fill to ' + f1(btn) + ' L (adds a safety lap)</button>' : '') + '</div>' : '';
    const fb = $('fcsFill'); if (fb) fb.addEventListener('click', () => { S.fuel = Number(fb.dataset.v); save(); update(); });

    const colour = !needed ? '#14a994' : S.fuel >= safe ? '#14a994' : S.fuel >= needed ? '#e0a21b' : '#d6453a';
    drawTank(cap, S.fuel, needed <= cap ? needed : 0, colour);

    const ts = $('fcsTankSize');
    if (!ts.dataset.edit) ts.innerHTML = 'Tank: <b>' + cap + ' L</b> &middot; <button type="button" id="fcsTankEdit">change</button>';
  }

  /* ---------- wiring ---------- */
  const setFuel = (v, src) => { S.fuel = Number.isFinite(v) ? v : 0; save(); update(src); };
  $('fcsFuel').addEventListener('input', () => { const v = num($('fcsFuel').value); if (Number.isFinite(v)) { S.fuel = clamp(v, 0, S.tank); save(); update('fuel'); } });
  $('fcsFuel').addEventListener('change', () => { const v = num($('fcsFuel').value); setFuel(Number.isFinite(v) ? clamp(v, 0, S.tank) : S.fuel); });
  $('fcsRange').addEventListener('input', () => setFuel(num($('fcsRange').value)));
  $('fcsMinus').addEventListener('click', () => setFuel(Math.max(0, S.fuel - 1)));
  $('fcsPlus').addEventListener('click', () => setFuel(Math.min(S.tank, S.fuel + 1)));
  $('fcsFpl').addEventListener('input', () => { S.fpl = $('fcsFpl').value; save(); update('fuel'); });
  $('fcsLap').addEventListener('input', () => { S.lap = $('fcsLap').value; save(); update('fuel'); });
  $('fcsRace').addEventListener('input', () => { S.race = $('fcsRace').value; save(); update('fuel'); });
  $('fcsMode').addEventListener('change', () => { S.raceMode = $('fcsMode').value; save(); update('fuel'); });
  $('fcsTankSize').addEventListener('click', (e) => {
    if (e.target.id !== 'fcsTankEdit') return;
    const ts = $('fcsTankSize'); ts.dataset.edit = '1';
    ts.innerHTML = 'Tank size <input id="fcsTankIn" type="number" min="20" max="400" step="1" value="' + S.tank + '"> L <button type="button" id="fcsTankOk">done</button>';
    const ok = () => { const v = num($('fcsTankIn').value); if (v >= 20) S.tank = Math.round(v); delete ts.dataset.edit; save(); update(); };
    $('fcsTankOk').addEventListener('click', ok); $('fcsTankIn').addEventListener('keydown', (k) => { if (k.key === 'Enter') ok(); });
    $('fcsTankIn').addEventListener('input', () => { const v = num($('fcsTankIn').value); if (v >= 20 && v <= 400) { S.tank = Math.round(v); S.fuel = Math.min(S.fuel, S.tank); save(); update('fuel'); } });
    $('fcsTankIn').focus();
  });
  $('fcsFpl').value = S.fpl; $('fcsLap').value = S.lap; $('fcsRace').value = S.race; $('fcsMode').value = S.raceMode;
  S.fuel = Number(S.fuel); update();
  window.IFWL_FuelSimple = { update };
})();
