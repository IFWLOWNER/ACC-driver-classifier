/* ============================================================
   IFWL STATS ENGINE
   Extracted, unmodified in logic, from livetimings.html so both
   pages share ONE implementation of consistency / race risk /
   pace / overall score. If the scoring formula ever changes, it
   changes here once, for every page that uses it.

   Deliberately computed entirely client-side from the same public,
   unauthenticated result files Live Timings already reads from
   data/manifest.json - there is no private data in this file, so
   there is nothing here that needs a server-side gate. Any tier
   gating on top of these numbers (e.g. "Gold only") is a UI
   feature-gate applied by the calling page, same as Live Timings
   already does for its own "detailed access" panels.

   Usage:
     <script src="ifwl-stats-engine.js"></script>
     const stats = await IFWLStats.computeForDriver(['IFWL XSL4Y3RX']);
     // -> { overallScore, consistencyAvg, riskAvg, avgGapPct,
     //      sessionCount, trackCount, mostRecentLabel } or null
   ============================================================ */
(function(){
  const manifestUrl = 'data/manifest.json';
  const sessionNames = { FP:'Practice', FP1:'Practice 1', FP2:'Practice 2', Q:'Qualifying', R:'Race' };
  const serverLabels = {
    'console-proam': 'IFWL | CONSOLE PRO AM',
    'console-beginner': 'IFWL | CONSOLE BEGINNER',
    'pc-proam': 'IFWL | PC PRO AM',
    'pc-beginner': 'IFWL | PC BEGINNER',
    'pc-monday-funday': 'IFWL | PC MONDAY FUNDAY',
    'console-monday-funday': 'IFWL | CONSOLE MONDAY FUNDAY',
    // ✅ ADDED: dedicated qualification server - drivers complete a minimum
    // lap count here to become eligible for a licence tier assignment.
    // Folder name assumed to match the existing naming convention - if the
    // real sync folder is named differently, this is the only line to change.
    'pc-licence': 'IFWL | PC LICENCE'
  };
  const IFWL_KNOWN_SERVER_IDS = Object.keys(serverLabels);
  const CACHE_PREFIX = 'ifwl-rivals-result-v2:'; // same cache keys as Live Timings - shared cache, fewer refetches
  const CACHE_MAX_AGE = 6 * 60 * 60 * 1000;

  function readBrowserCache(path){
    try{
      const cached = JSON.parse(localStorage.getItem(CACHE_PREFIX + path) || 'null');
      if(!cached || !cached.savedAt || Date.now() - cached.savedAt > CACHE_MAX_AGE) return null;
      return cached.data;
    }catch(_){ return null; }
  }
  function writeBrowserCache(path, data){
    try{ localStorage.setItem(CACHE_PREFIX + path, JSON.stringify({savedAt:Date.now(), data})); }catch(_){ /* cache is best-effort only */ }
  }

  function decodeJsonText(text){
    let clean = text.replace(/^\uFEFF/, '');
    if(/[\u0000-\u001F]/.test(clean)) clean = clean.replace(/[\u0000-\u001F]/g, '');
    return JSON.parse(clean);
  }

  async function fetchJsonFile(path, options = {}){
    const useCache = path !== manifestUrl && options.force !== true;
    if(useCache){
      const cached = readBrowserCache(path);
      if(cached) return cached;
    }
    const res = await fetch(path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache:'no-store' });
    if(!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
    const text = await res.text();
    const data = decodeJsonText(text);
    if(useCache) writeBrowserCache(path, data);
    return data;
  }

  function isValidLap(ms){ return Number.isFinite(Number(ms)) && ms > 0 && ms < 600000; }

  function median(values){
    const arr = values.filter(v => isValidLap(v)).sort((a,b) => a-b);
    if(!arr.length) return 0;
    const mid = Math.floor(arr.length/2);
    return arr.length % 2 ? arr[mid] : (arr[mid-1] + arr[mid]) / 2;
  }

  function driverName(line){
    const d = line.currentDriver || (line.car && line.car.drivers && line.car.drivers[0]) || {};
    return `${d.firstName || ''} ${d.lastName || ''}`.replace(/\s+/g,' ').trim() || d.shortName || 'Unknown Driver';
  }
  function driverNameKey(name){ return String(name || '').trim().toLowerCase(); }
  function sessionLabel(s){ return sessionNames[s.sessionType] || s.sessionType || 'Session'; }
  function lapKey(carId, driverIndex){ return `${carId}|${driverIndex ?? 0}`; }

  function serverIdFromPath(path){
    const match = String(path || '').match(/([a-z0-9-]+)\/[^/]+$/i);
    const folder = match ? match[1].toLowerCase() : '';
    return IFWL_KNOWN_SERVER_IDS.includes(folder) ? folder : '';
  }

  function fileTimestamp(value){
    const name = String(value?.name || value?.fileName || value?.source || value || '').split('/').pop();
    const match = name.match(/^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/);
    if(!match) return 0;
    const [,yy,mm,dd,hh,mi,ss] = match;
    return Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }
  function newestFirst(a,b){
    return fileTimestamp(b) - fileTimestamp(a) || String(b.name || b.fileName || '').localeCompare(String(a.name || a.fileName || ''));
  }
  function sessionCode(value){
    const name = String(value?.name || value?.fileName || value?.source || value || '').split('/').pop();
    const raw = name.match(/_(FP|FP1|FP2|Q|R)\.json$/i)?.[1]?.toUpperCase() || '';
    return raw.startsWith('FP') ? 'P' : raw;
  }
  function humanSessionDate(value){
    const stamp = fileTimestamp(value);
    if(!stamp) return String(value?.name || value?.fileName || value || 'Unknown session');
    const date = new Date(stamp);
    const text = new Intl.DateTimeFormat('en-GB', {day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'UTC'}).format(date);
    return `${text} — ${sessionCode(value) || 'ACC'}`;
  }

  // ---- IFWL CONSISTENCY INDEX (identical to livetimings.html's lapStats) ----
  function lapStats(values){
    const ordered = values.filter(v => isValidLap(v));
    const withoutFirst = ordered.length > 4 ? ordered.slice(1) : ordered;
    if(withoutFirst.length < 2){
      const laps = ordered.sort((a,b) => a-b);
      return { count: laps.length, best: laps[0] || 0, avg: laps[0] || 0, spread: 0, consistency: NaN, stdDev: 0, cov: 0, tightBandPct: NaN, outlierCount: 0 };
    }
    const med = median(withoutFirst);
    const deviations = withoutFirst.map(v => Math.abs(v - med));
    const mad = median(deviations) || 1;
    const modifiedZ = v => (0.6745 * (v - med)) / mad;
    const clean = withoutFirst.filter(v => Math.abs(modifiedZ(v)) <= 3.5);
    const outlierCount = withoutFirst.length - clean.length;
    const finalLaps = clean.length >= 2 ? clean : withoutFirst;
    const sorted = [...finalLaps].sort((a,b) => a-b);
    const best = sorted[0];
    const slowest = sorted[sorted.length - 1];
    const spread = slowest - best;
    const avg = finalLaps.reduce((a,b)=>a+b,0) / finalLaps.length;
    const variance = finalLaps.reduce((sum,v) => sum + Math.pow(v - avg, 2), 0) / finalLaps.length;
    const stdDev = Math.sqrt(variance);
    const cov = avg ? (stdDev / avg) * 100 : 0;
    const consistency = Math.max(0, Math.min(100, 100 - (cov * 6)));
    const band = med * 0.01;
    const tightBandPct = (finalLaps.filter(v => Math.abs(v - med) <= band).length / finalLaps.length) * 100;
    return { count: finalLaps.length, best, avg, spread, consistency, stdDev, cov, tightBandPct, outlierCount };
  }

  function lapMapForSession(data){
    const map = new Map();
    const laps = Array.isArray(data.laps) ? data.laps : [];
    for(const lap of laps){
      if(!lap) continue;
      const laptime = Number(lap.laptime);
      if(!isValidLap(laptime)) continue;
      const key = lapKey(lap.carId, lap.driverIndex);
      if(!map.has(key)) map.set(key, {laps:[], validLaps:[], invalid:0, valid:0, total:0, lapObjects:[]});
      const item = map.get(key);
      const isValidForBest = lap.isValidForBest !== false;
      item.laps.push(laptime);
      if(isValidForBest) item.validLaps.push(laptime);
      item.lapObjects.push({ laptime, isValidForBest });
      item.total += 1;
      if(lap.isValidForBest === false) item.invalid += 1; else item.valid += 1;
    }
    return map;
  }

  // ---- row builder (trimmed to fields the scoring functions actually use) ----
  function normaliseSession(data, source, item = {}){
    const lines = (data.sessionResult && data.sessionResult.leaderBoardLines) || [];
    const sessionLapMap = lapMapForSession(data);
    const serverId = item.serverId || serverIdFromPath(source) || 'unknown';
    const serverName = item.serverName || serverLabels[serverId] || serverId || 'Unknown server';
    const rows = lines.filter(l => !l.bIsSpectator).map((l) => {
      const lm = sessionLapMap.get(lapKey(l.car?.carId, l.currentDriverIndex)) || {laps:[], validLaps:[], invalid:0, total:0, lapObjects:[]};
      return {
        source, serverId, serverName,
        fileName: source.split('/').pop(),
        sessionType: data.sessionType,
        session: sessionLabel(data),
        track: data.trackName || data.metaData || 'unknown',
        driver: driverName(l),
        carNo: l.car?.raceNumber ?? '-',
        bestLap: l.timing?.bestLap || 0,
        lapCount: l.timing?.lapCount || 0,
        lapObjects: lm.lapObjects,
        recordedLapCount: lm.total,
        carId: l.car?.carId,
        consistencyStats: lapStats(lm.validLaps),
        missingPit: l.missingMandatoryPitstop
      };
    });
    return { source, serverId, serverName, fileName: source.split('/').pop(), data, sessionType: data.sessionType || '?', track: data.trackName || data.metaData || 'unknown', rows };
  }

  function riskLabel(value){
    if(!Number.isFinite(value)) return '-';
    if(value <= 15) return 'Low';
    if(value <= 35) return 'Mild';
    if(value <= 60) return 'Medium';
    return 'High';
  }

  // ---- race risk (identical formula to livetimings.html's raceRiskForRow) ----
  function raceRiskForRow(row, raceSession, leaderLaps){
    const lapObjects = row.lapObjects || [];
    const cleanLaps = lapObjects.filter(l => l.isValidForBest !== false && isValidLap(l.laptime)).map(l => l.laptime);
    const invalidLapObjects = lapObjects.filter(l => l.isValidForBest === false);
    const lapCount = Number(row.lapCount || 0);
    const totalRecorded = Number(row.recordedLapCount || lapObjects.length || 0);
    let score = 0;
    const cleanMedian = cleanLaps.length ? median(cleanLaps) : 0;
    const pitLikelyCount = invalidLapObjects.filter(l => cleanMedian && isValidLap(l.laptime) && l.laptime > cleanMedian * 1.15).length;
    const genuineInvalidCount = invalidLapObjects.length - pitLikelyCount;
    if(totalRecorded > 0 && genuineInvalidCount > 0){
      score += Math.min(35, (genuineInvalidCount / totalRecorded) * 70);
    }
    const stats = row.consistencyStats || {};
    if(Number.isFinite(stats.consistency)){
      score += Math.min(35, Math.max(0, 100 - stats.consistency) * 0.8);
    }
    if(cleanLaps.length >= 3){
      const med = median(cleanLaps);
      const spikes = cleanLaps.filter(v => med && v > med * 1.10).length;
      if(spikes) score += Math.min(25, spikes * 8);
    }
    if(Array.isArray(raceSession?.data?.penalties)){
      const carPenalties = raceSession.data.penalties.filter(p => String(p.carId) === String(row.carId));
      if(carPenalties.length) score += Math.min(25, carPenalties.length * 10);
    }
    if(Array.isArray(raceSession?.data?.post_race_penalties)){
      const carPostPenalties = raceSession.data.post_race_penalties.filter(p => String(p.carId) === String(row.carId));
      if(carPostPenalties.length) score += Math.min(25, carPostPenalties.length * 10);
    }
    if(row.missingPit === 1) score += 20;
    if(leaderLaps && lapCount < leaderLaps){
      score += Math.min(30, (leaderLaps - lapCount) * 10);
    }
    const risk = Math.max(0, Math.min(100, score));
    return { risk, label: riskLabel(risk) };
  }

  function rtAvg(values){
    const list = values.filter(Number.isFinite);
    return list.length ? list.reduce((a,b) => a+b, 0) / list.length : NaN;
  }

  // ---- summary + pace + composite (identical to livetimings.html Top Picks logic) ----
  function summarizeDriver(rows){
    const validRows = rows.filter(r => isValidLap(r.bestLap));
    const avgConsistency = rtAvg(rows.map(r => r.consistencyStats?.consistency));
    const avgRisk = rtAvg(rows.map(r => raceRiskForRow(r, null, 0).risk));
    const tracks = new Set(rows.map(r => r.track));
    const mostRecent = rows.reduce((latest, r) => (!latest || fileTimestamp(r) > fileTimestamp(latest)) ? r : latest, null);
    return {
      avgConsistency, avgRisk,
      sessionCount: rows.length,
      trackCount: tracks.size,
      mostRecentLabel: mostRecent ? humanSessionDate(mostRecent) : '-',
      validRowCount: validRows.length
    };
  }

  function computePaceScores(allRows){
    const bestByTrack = new Map();
    for(const r of allRows){
      if(!isValidLap(r.bestLap)) continue;
      const cur = bestByTrack.get(r.track);
      if(!cur || r.bestLap < cur) bestByTrack.set(r.track, r.bestLap);
    }
    const gapsByDriver = new Map();
    for(const r of allRows){
      if(!isValidLap(r.bestLap)) continue;
      const best = bestByTrack.get(r.track);
      if(!best) continue;
      const gapPct = ((r.bestLap - best) / best) * 100;
      const key = driverNameKey(r.driver);
      if(!gapsByDriver.has(key)) gapsByDriver.set(key, []);
      gapsByDriver.get(key).push(gapPct);
    }
    const paceScoreByDriver = new Map();
    for(const [key, gaps] of gapsByDriver.entries()){
      const avgGapPct = rtAvg(gaps);
      const paceScore = Math.max(0, Math.min(100, 100 - avgGapPct * 14));
      paceScoreByDriver.set(key, { avgGapPct, paceScore });
    }
    return paceScoreByDriver;
  }

  // ---- fetch + build every row across every server (mirrors Live Timings' own load) ----
  let allRowsCache = null;
  async function buildAllRows(force){
    if(allRowsCache && !force) return allRowsCache;
    const manifest = await fetchJsonFile(manifestUrl, {force});
    const raw = manifest.results || manifest.files || [];
    const manifestItems = raw.map(x => {
      if(typeof x === 'string'){
        const serverId = serverIdFromPath(x) || 'unknown';
        return { file:x, name:x.split('/').pop(), serverId, serverName: serverLabels[serverId] || serverId };
      }
      const filePath = x.file || x.path || x.name;
      const serverId = serverIdFromPath(filePath) || x.serverId || 'unknown';
      return { file: filePath, name: x.name || (filePath || '').split('/').pop(), serverId, serverName: x.serverName || serverLabels[serverId] || serverId };
    }).filter(x => x.file && x.name && /_(FP|FP1|FP2|Q|R)\.json$/i.test(x.name)).sort(newestFirst);

    const allRows = [];
    for(const item of manifestItems){
      try{
        const data = await fetchJsonFile(item.file, {force});
        const session = normaliseSession(data, item.file, item);
        allRows.push(...session.rows);
      }catch(e){
        console.warn('IFWLStats: skipped unreadable session file', item.file, e.message);
      }
    }
    allRowsCache = allRows;
    return allRows;
  }

  /**
   * Compute Overall Score / Consistency Avg / Race Risk Avg for one driver,
   * matched by any of the given name aliases (case-insensitive, exact-name
   * match against each session's recorded driver name).
   * Returns null if no session rows were found for that driver at all.
   */
  async function computeForDriver(driverNameAliases, opts = {}){
    const aliasKeys = (Array.isArray(driverNameAliases) ? driverNameAliases : [driverNameAliases])
      .filter(Boolean).map(driverNameKey);
    if(!aliasKeys.length) return null;

    const allRows = await buildAllRows(!!opts.force);
    const myRows = allRows.filter(r => aliasKeys.includes(driverNameKey(r.driver)));
    if(!myRows.length) return null;

    const summary = summarizeDriver(myRows);
    const paceScores = computePaceScores(allRows);
    const pace = paceScores.get(driverNameKey(myRows[0].driver)) || { avgGapPct: NaN, paceScore: NaN };

    const nowMs = Date.now();
    const mostRecentMs = myRows.reduce((max, r) => Math.max(max, fileTimestamp(r)), 0);
    const daysSinceActive = mostRecentMs ? (nowMs - mostRecentMs) / 86400000 : 999;
    const activityScore = Math.max(0, Math.min(100, 100 - daysSinceActive * 3));
    const consistencyScore = Number.isFinite(summary.avgConsistency) ? summary.avgConsistency : 50;
    const riskScore = Number.isFinite(summary.avgRisk) ? Math.max(0, 100 - summary.avgRisk) : 50;
    const paceScoreVal = Number.isFinite(pace.paceScore) ? pace.paceScore : 50;

    const overallScore = (paceScoreVal * 0.35) + (consistencyScore * 0.30) + (riskScore * 0.15) + (activityScore * 0.20);

    return {
      overallScore: Math.round(overallScore * 10) / 10,
      consistencyAvg: Number.isFinite(summary.avgConsistency) ? Math.round(summary.avgConsistency * 10) / 10 : null,
      riskAvg: Number.isFinite(summary.avgRisk) ? Math.round(summary.avgRisk * 10) / 10 : null,
      avgGapPct: Number.isFinite(pace.avgGapPct) ? Math.round(pace.avgGapPct * 100) / 100 : null,
      sessionCount: summary.sessionCount,
      trackCount: summary.trackCount,
      mostRecentLabel: summary.mostRecentLabel
    };
  }

  /**
   * IFWL Licence qualification standings. Every driver who has raced on the
   * dedicated qualification server, ranked by pace WITHIN that server's data
   * only (not mixed with other servers), with a lap count so staff can see
   * who has actually hit the minimum before being ranked at all. Gap-to-best
   * is computed the same way as the main pace score, just scoped to one
   * server's sessions.
   */
  async function computeLicenceServerStandings(opts = {}){
    const minLaps = opts.minLaps ?? 15;
    const serverId = opts.serverId || 'pc-licence';

    const allRows = await buildAllRows(!!opts.force);
    const rows = allRows.filter(r => r.serverId === serverId);
    if(!rows.length) return [];

    const byDriver = new Map();
    for(const r of rows){
      const key = driverNameKey(r.driver);
      if(!byDriver.has(key)) byDriver.set(key, { driver: r.driver, rows: [] });
      byDriver.get(key).rows.push(r);
    }

    // Pace scored only against other drivers on THIS server, not the whole site
    const paceScores = computePaceScores(rows);

    const standings = [];
    for(const [key, entry] of byDriver.entries()){
      const totalLaps = entry.rows.reduce((sum, r) => sum + (Number(r.lapCount) || 0), 0);
      const summary = summarizeDriver(entry.rows);
      const pace = paceScores.get(key) || { avgGapPct: NaN, paceScore: NaN };
      const avgGapPct = Number.isFinite(pace.avgGapPct) ? Math.round(pace.avgGapPct * 100) / 100 : null;

      // Starting-point suggestion only - staff pick the actual tier via the
      // dropdown regardless, this just pre-fills a sensible default.
      let recommendedTier = 'GT3 Beginner';
      if(avgGapPct != null){
        if(avgGapPct <= 2) recommendedTier = 'GT3 Pro';
        else if(avgGapPct <= 5) recommendedTier = 'GT3 Amateur';
      }

      standings.push({
        driver: entry.driver,
        totalLaps,
        qualified: totalLaps >= minLaps,
        avgGapPct,
        consistencyAvg: Number.isFinite(summary.avgConsistency) ? Math.round(summary.avgConsistency * 10) / 10 : null,
        sessionCount: summary.sessionCount,
        recommendedTier
      });
    }

    standings.sort((a,b) => (Number(b.qualified) - Number(a.qualified)) || ((a.avgGapPct ?? 999) - (b.avgGapPct ?? 999)));
    return standings;
  }

  window.IFWLStats = { computeForDriver, buildAllRows, driverNameKey, computeLicenceServerStandings };
})();
