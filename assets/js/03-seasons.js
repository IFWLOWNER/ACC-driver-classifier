
/* ✅ ADDED: public Seasons tab (see #seasonsPanel). Reads ?seasonCalendar=1
   (no login needed). All maths is done on plain UK calendar dates in UTC so
   the viewer's own timezone can never shift a date by a day. */
(() => {
  const q = id => document.getElementById(id);
  const FN = window.IFWL_AUTH?.FUNCTION || '';
  const DAY = 86400000;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ms = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
  const fmt = (s, o) => new Date(ms(s)).toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }, o || {}));
  const fmtY = s => fmt(s, { year: 'numeric' });
  const range = (a, b) => {
    const ya = a.slice(0, 4), yb = b.slice(0, 4);
    return `${ya === yb ? fmt(a) : fmtY(a)} &ndash; ${fmtY(b)}`;
  };
  const addDays = (s, n) => new Date(ms(s) + n * DAY).toISOString().slice(0, 10);
  const weeksOf = (a, b) => Math.round((ms(b) - ms(a)) / DAY + 1) / 7;
  const todayUK = () => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  const weeksLabel = n => { const w = Math.round(n * 10) / 10; return `${w % 1 ? w : Math.round(w)} week${w === 1 ? '' : 's'}`; };

  let seasons = [], isDefault = false;

  function raceMondays(x) {
    const out = [];
    for (let t = ms(x.startDate); t <= ms(x.endDate); t += DAY) {
      const d = new Date(t).toISOString().slice(0, 10);
      if (new Date(t).getUTCDay() !== 1) continue;
      if (x.trainingStart && d >= x.trainingStart && d <= x.trainingEnd) continue;
      if ((x.breaks || []).some(b => d >= b.startDate && d <= b.endDate)) continue;
      out.push(d);
    }
    return out;
  }
  function statusOf(x, today) { return today < x.startDate ? 'upcoming' : today > x.endDate ? 'done' : 'live'; }

  function renderNow(today) {
    const box = q('seasonsNow');
    const live = seasons.find(x => statusOf(x, today) === 'live');
    const next = seasons.find(x => x.startDate > today);
    const last = [...seasons].reverse().find(x => x.endDate < today);
    let main = '', sub = '', pct = null;
    if (live) {
      const inTrain = live.trainingStart && today >= live.trainingStart && today <= live.trainingEnd;
      const brk = (live.breaks || []).find(b => today >= b.startDate && today <= b.endDate);
      const rm = raceMondays(live);
      const done = rm.filter(d => d <= today).length;
      main = `${esc(live.name)} is live`;
      sub = brk ? `${esc(brk.label)} &middot; racing resumes after ${esc(fmt(brk.endDate))}`
        : inTrain ? `Training week &middot; no championship race this week`
        : `Race week ${Math.max(1, done)} of ${rm.length} &middot; season ends ${esc(fmtY(live.endDate))}`;
      pct = Math.max(0, Math.min(100, (ms(today) - ms(live.startDate)) / (ms(live.endDate) - ms(live.startDate) + DAY) * 100));
    } else if (next) {
      const days = Math.round((ms(next.startDate) - ms(today)) / DAY);
      main = `${esc(next.name)} starts in ${days} day${days === 1 ? '' : 's'}`;
      sub = `${last ? 'Post-' + esc(last.name) + ' break &middot; ' : ''}racing starts ${esc(fmtY(next.startDate))}`;
    } else {
      main = 'No upcoming season scheduled';
      sub = 'Check back soon for the next dates.';
    }
    box.innerHTML = `<div class="ssn-now"><div><div class="ssn-now-main">${main}</div><div class="ssn-now-sub">${sub}</div></div>${pct == null ? '' : `<div class="ssn-prog" title="${Math.round(pct)}% through the season"><span style="width:${pct}%"></span></div>`}</div>`;
  }

  function timeline(list, today) {
    const a = ms(list[0].startDate), b = ms(list[list.length - 1].endDate) + DAY, span = b - a;
    const pos = (s) => (ms(s) - a) / span * 100;
    const wid = (s, e) => (ms(e) + DAY - ms(s)) / span * 100;
    let segs = '';
    list.forEach(x => {
      segs += `<div class="seg season${x.planned ? ' planned' : ''}" style="left:${pos(x.startDate)}%;width:${wid(x.startDate, x.endDate)}%">${wid(x.startDate, x.endDate) > 7 ? esc(x.name.replace(/^Season /, 'S')) : ''}</div>`;
      if (x.trainingStart) segs += `<div class="seg train" title="${esc(x.name)} training week" style="left:${pos(x.trainingStart)}%;width:${wid(x.trainingStart, x.trainingEnd)}%"></div>`;
      (x.breaks || []).forEach(k => { segs += `<div class="seg brk" title="${esc(k.label)}" style="left:${pos(k.startDate)}%;width:${wid(k.startDate, k.endDate)}%"></div>`; });
    });
    if (today >= list[0].startDate && today <= list[list.length - 1].endDate) segs += `<div class="today" title="Today" style="left:${pos(today)}%"></div>`;
    let months = '';
    const d0 = new Date(a); let cur = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + (d0.getUTCDate() > 1 ? 1 : 0), 1);
    while (cur < b) {
      const dt = new Date(cur);
      months += `<span style="left:${(cur - a) / span * 100}%">${dt.toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short' })}${dt.getUTCMonth() === 0 ? ' ' + dt.getUTCFullYear() : ''}</span>`;
      cur = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1);
    }
    return `<div class="ssn-tl">${segs}</div><div class="ssn-months">${months}</div>`;
  }

  function card(x, i, today) {
    const st = statusOf(x, today);
    const nextAfter = seasons.find(y => y.startDate > x.endDate);
    const isNext = st === 'upcoming' && x === seasons.find(y => y.startDate > today);
    const badge = st === 'live' ? '<span class="ssn-badge live">Live now</span>' : st === 'done' ? '<span class="ssn-badge">Done</span>' : x.planned ? '<span class="ssn-badge planned">Planned</span>' : isNext ? '<span class="ssn-badge next">Up next</span>' : '<span class="ssn-badge">Upcoming</span>';
    const rm = raceMondays(x);
    let gap = '';
    if (nextAfter) {
      const gs = addDays(x.endDate, 1), ge = addDays(nextAfter.startDate, -1);
      if (ge >= gs) gap = `<div class="gap">Post-${esc(x.name)} break &middot; ${esc(weeksLabel(weeksOf(gs, ge)))}<br><span style="font-weight:600">${esc(fmt(gs))} &ndash; ${esc(fmt(ge))}</span></div>`;
    }
    return `<div class="ssn-card ${st}">${badge}
      <h5>${esc(x.name)}</h5>
      <div class="dates">${range(x.startDate, x.endDate)}</div>
      <div class="meta">${esc(weeksLabel(weeksOf(x.startDate, x.endDate)))} &middot; ${rm.length} race weeks</div>
      ${x.trainingStart ? `<div class="tr">Training week: ${esc(fmt(x.trainingStart))} &ndash; ${esc(fmt(x.trainingEnd))}</div>` : ''}
      ${(x.breaks || []).map(k => `<div class="bk">${esc(k.label)}: ${esc(fmt(k.startDate))} &ndash; ${esc(fmt(k.endDate))}</div>`).join('')}
      ${x.note ? `<div class="note">${esc(x.note)}</div>` : ''}
      ${gap}</div>`;
  }

  function render() {
    const today = todayUK();
    renderNow(today);
    const groups = [];
    seasons.forEach(x => { const g = x.group || 'Seasons'; let o = groups.find(z => z.g === g); if (!o) groups.push(o = { g, list: [] }); o.list.push(x); });
    q('seasonsGroups').innerHTML = groups.map(({ g, list }) => {
      const allPlanned = list.every(x => x.planned);
      return `<div class="ssn-group"><div class="ssn-group-h"><h4>${esc(g)}</h4><span>${esc(list[0].name)} to ${esc(list[list.length - 1].name)}${allPlanned ? ' &middot; plan, dates may change' : ''}</span></div>
        ${timeline(list, today)}
        <div class="ssn-legend"><span><i style="background:var(--ifwl-teal)"></i>Season</span><span><i style="background:var(--ifwl-amber)"></i>Training week</span><span><i style="background:var(--ifwl-red)"></i>Holiday break</span><span><i style="background:var(--ifwl-line)"></i>Break between seasons</span></div>
        <div class="ssn-cards">${list.map((x, i) => card(x, i, today)).join('')}</div></div>`;
    }).join('') || '<div class="field-hint">No seasons have been published yet.</div>';
    const first = seasons[0], last = seasons[seasons.length - 1];
    if (first) q('seasonsSubtitle').textContent = `${first.name} (${first.startDate.slice(0, 4)}) to ${last.name} (${last.endDate.slice(0, 4)})`;
  }

  async function load() {
    try {
      const r = await fetch(`${FN}?seasonCalendar=1`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      seasons = (d.seasons || []).slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
      isDefault = !!d.isDefault;
      render();
    } catch (e) {
      q('seasonsGroups').innerHTML = `<div class="field-hint">Couldn't load the season calendar (${esc(e.message)}). <a href="#" id="seasonsRetry">Try again</a></div>`;
      q('seasonsRetry')?.addEventListener('click', ev => { ev.preventDefault(); load(); });
    }
  }

  function ics() {
    const pad = s => s.replace(/-/g, '');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const ev = (uid, title, a, b) => ['BEGIN:VEVENT', `UID:${uid}@ifwl.net`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${pad(a)}`, `DTEND;VALUE=DATE:${pad(addDays(b, 1))}`, `SUMMARY:${title.replace(/[,;\\]/g, ' ')}`, 'TRANSP:TRANSPARENT', 'END:VEVENT'].join('\r\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IFWL//Seasons//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:IFWL Seasons'];
    seasons.forEach(x => {
      lines.push(ev(`${x.id}-season`, `IFWL ${x.name}${x.planned ? ' (planned)' : ''}`, x.startDate, x.endDate));
      if (x.trainingStart) lines.push(ev(`${x.id}-training`, `IFWL ${x.name} training week`, x.trainingStart, x.trainingEnd));
      (x.breaks || []).forEach((k, i) => lines.push(ev(`${x.id}-break${i}`, `IFWL ${k.label}`, k.startDate, k.endDate)));
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ifwl-seasons.ics';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  q('seasonsIcsBtn')?.addEventListener('click', () => { if (seasons.length) ics(); });
  document.querySelector('#viewTabs [data-view="seasons"]')?.addEventListener('click', () => { if (seasons.length) render(); });
  load();
  window.IFWL_Seasons = { reload: load };
})();
