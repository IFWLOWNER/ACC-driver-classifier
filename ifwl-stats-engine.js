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
    // ✅ ADDED: dedicated qualification servers - drivers complete a minimum
    // lap count here to become eligible for a licence tier assignment.
    // PC and Console are tracked as two completely separate qualifications.
    'pc-licence': 'IFWL | PC LICENCE',
    'console-licence': 'IFWL | CONSOLE LICENCE'
  };
  const IFWL_KNOWN_SERVER_IDS = Object.keys(serverLabels);
  // ✅ CHANGED: moved off localStorage entirely, onto IndexedDB.
  //
  // The earlier fix (capping localStorage entries at 300) was a band-aid,
  // not a real fix - localStorage is shared across the WHOLE browser origin
  // (ifwlowner.github.io), not per page. TuneShare, Live Timings and the
  // Licence Centre all live on that same origin and therefore share one
  // small (~5-10MB) storage jar between them, regardless of how unrelated
  // their features are. Any cap here just changes how fast that shared jar
  // fills up - it can never stop this cache from crowding out something as
  // small as a Patreon status blob.
  //
  // IndexedDB is a genuinely separate storage system with its own much
  // larger quota (tens of MB, often far more). Moving this cache there means
  // it can grow as large as it needs to for its own purpose without ever
  // touching the localStorage space anything else on this origin depends on.
  const CACHE_PREFIX = 'ifwl-rivals-result-v2:'; // kept only to find + purge old entries below
  const CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
  const IDB_NAME = 'ifwl-cache-v1';
  const IDB_STORE = 'files';

  let idbPromise = null;
  function openCacheDb(){
    if(idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      if(!window.indexedDB){ reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return idbPromise;
  }

  async function readBrowserCache(path){
    try{
      const db = await openCacheDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(path);
        req.onsuccess = () => {
          const cached = req.result;
          if(!cached || !cached.savedAt || Date.now() - cached.savedAt > CACHE_MAX_AGE) return resolve(null);
          resolve(cached.data);
        };
        req.onerror = () => resolve(null);
      });
    }catch(_){ return null; }
  }
  async function writeBrowserCache(path, data){
    try{
      const db = await openCacheDb();
      await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put({savedAt:Date.now(), data}, path);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve(); // best-effort - a caching failure should never break the page
      });
    }catch(_){ /* best-effort only */ }
  }

  // One-time cleanup: reclaim whatever this cache already left behind in
  // localStorage under the old scheme, immediately freeing that space back
  // up for TuneShare and anything else on this origin - without this, old
  // entries would just sit there forever even after the code stops writing
  // new ones there.
  (function purgeOldLocalStorageCache(){
    try{
      const stale = [];
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(CACHE_PREFIX)) stale.push(k);
      }
      stale.forEach(k => localStorage.removeItem(k));
    }catch(_){ /* non-fatal */ }
  })();

  function decodeJsonText(text){
    let clean = text.replace(/^\uFEFF/, '');
    if(/[\u0000-\u001F]/.test(clean)) clean = clean.replace(/[\u0000-\u001F]/g, '');
    return JSON.parse(clean);
  }

  async function fetchJsonFile(path, options = {}){
    const useCache = path !== manifestUrl && options.force !== true;
    if(useCache){
      const cached = await readBrowserCache(path);
      if(cached) return cached;
    }
    const res = await fetch(path + (path.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache:'no-store' });
    if(!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
    const text = await res.text();
    const data = decodeJsonText(text);
    if(useCache) await writeBrowserCache(path, data);
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

  /**
   * Every race (_R) result across every server whose file timestamp falls
   * within [startMs, endMs]. Fetches each matching file (not just the
   * manifest metadata) so the caller gets a driver-friendly track name -
   * that only lives inside the file content, not the filename or manifest.
   */
  async function listRaceResultsInRange(startMs, endMs, opts = {}){
    const manifest = await fetchJsonFile(manifestUrl, {force: !!opts.force});
    const raw = manifest.results || manifest.files || [];
    const candidates = raw.filter(item => {
      const name = item.name || item.file || '';
      if(!/_R\.json$/i.test(name)) return false;
      const ts = fileTimestamp(item);
      return ts >= startMs && ts <= endMs;
    });

    const races = [];
    for(const item of candidates){
      try{
        const data = await fetchJsonFile(item.file, {force: !!opts.force});
        const serverId = item.serverId || serverIdFromPath(item.file) || 'unknown';
        const platform = serverId.startsWith('console-') ? 'console' : serverId.startsWith('pc-') ? 'pc' : '';
        const lines = (data.sessionResult && data.sessionResult.leaderBoardLines) || [];
        races.push({
          file: item.file,
          serverId,
          serverName: item.serverName || serverLabels[serverId] || serverId,
          platform,
          track: data.trackName || data.metaData || 'Unknown track',
          tsMs: fileTimestamp(item),
          dateLabel: humanSessionDate(item),
          entrantCount: lines.filter(l => !l.bIsSpectator).length
        });
      }catch(e){
        console.warn('IFWLStats: skipped unreadable race file', item.file, e.message);
      }
    }

    races.sort((a,b) => b.tsMs - a.tsMs);
    return races;
  }

  window.IFWLStats = { computeForDriver, buildAllRows, driverNameKey, computeLicenceServerStandings, listRaceResultsInRange };

  // =======================================================
  // ✅ ADDED: Race Results detail view (ported from livetimings.html so the
  // Licence Centre's Gold-only breakdown is visually and logically identical
  // to the one on Live Timings - same charts, same classes, same formulas.
  // =======================================================

  function esc(str){
    return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function gapTime(ms){ if(!ms || ms <= 0) return '-'; return '+' + (ms/1000).toFixed(3); }
  function driverShort(name){
    const clean = String(name || '').replace(/\s+-\s+IFWL$/i,'').trim();
    return clean.length > 15 ? clean.slice(0, 13) + '…' : clean;
  }
  function svgText(x, y, text, size = 11, weight = 700, anchor = 'start'){
    return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="#dfe8ea">${esc(text)}</text>`;
  }
  function consistencyClass(value){
    if(!Number.isFinite(value)) return '';
    if(value >= 95) return 'good';
    if(value >= 85) return 'mid';
    return 'low';
  }
  function consistencyText(value, count){
    if(!Number.isFinite(value) || !count || count < 2) return '-';
    return `${value.toFixed(1)}%`;
  }
  function consistencyNoteText(stats){
    if(!stats || !(stats.count >= 2)) return 'Need 2+ laps';
    const parts = [`${stats.count} laps`];
    if(stats.spread > 0) parts.push(`spread ${msTimeFull(stats.spread)}`);
    if(Number.isFinite(stats.tightBandPct)) parts.push(`${stats.tightBandPct.toFixed(0)}% within 1%`);
    if(stats.outlierCount > 0) parts.push(`${stats.outlierCount} outlier${stats.outlierCount === 1 ? '' : 's'} excluded`);
    return parts.join(' · ');
  }
  function riskClassOf(value){
    if(!Number.isFinite(value)) return '';
    if(value <= 15) return 'low';
    if(value <= 35) return 'mild';
    if(value <= 60) return 'medium';
    return 'high';
  }
  // Named distinctly from the engine's own msTime (which returns '-' the same
  // way) purely so this file's ported code can call it exactly as it did in
  // Live Timings without a naming collision - same formula either way.
  function msTimeFull(ms){
    if(ms === undefined || ms === null || ms <= 0) return '-';
    const total = Math.floor(ms);
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const milli = total % 1000;
    return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(milli).padStart(3,'0')}`;
  }

  // Richer row builder than normaliseSession() above - includes the extra
  // fields (allLapTimes, bestRaceSplits, totalTime, invalid/recorded lap
  // counts) that only the full Race Results detail view needs, so the
  // lighter-weight functions elsewhere don't pay for data they never use.
  function buildFullRaceRows(data, source, item = {}){
    const lines = (data.sessionResult && data.sessionResult.leaderBoardLines) || [];
    const sessionLapMap = lapMapForSession(data);
    const serverId = item.serverId || serverIdFromPath(source) || 'unknown';
    const serverName = item.serverName || serverLabels[serverId] || serverId || 'Unknown server';
    return lines.filter(l => !l.bIsSpectator).map((l, i) => {
      const lm = sessionLapMap.get(lapKey(l.car?.carId, l.currentDriverIndex)) || {laps:[], validLaps:[], invalid:0, total:0, lapObjects:[], bestSplits:[null,null,null]};
      return {
        racePos: i + 1,
        source, serverId, serverName,
        fileName: source.split('/').pop(),
        track: data.trackName || data.metaData || 'unknown',
        driver: driverName(l),
        carNo: l.car?.raceNumber ?? '-',
        carName: l.car?.carGroup ? `${l.car.carGroup} car model ${l.car.carModel}` : `Car model ${l.car?.carModel ?? '-'}`,
        bestLap: l.timing?.bestLap || 0,
        totalTime: l.timing?.totalTime || 0,
        lapCount: l.timing?.lapCount || 0,
        allLapTimes: lm.laps,
        bestRaceSplits: lm.bestSplits,
        lapObjects: lm.lapObjects,
        invalidLapCount: lm.invalid,
        recordedLapCount: lm.total,
        carId: l.car?.carId,
        consistencyStats: lapStats(lm.validLaps),
        missingPit: l.missingMandatoryPitstop
      };
    });
  }

  /**
   * Loads one race file and returns fully-built rows (with risk computed
   * against the real leader-lap count and penalty data from that file),
   * ready for the results table, the field-wide charts, or a single
   * driver's profile.
   */
  async function loadRaceDetail(filePath, opts = {}){
    const data = await fetchJsonFile(filePath, {force: !!opts.force});
    const rows = buildFullRaceRows(data, filePath, opts.item || {});
    const leaderLaps = Math.max(0, ...rows.map(r => Number(r.lapCount || 0)));
    const raceSession = { data };
    rows.forEach(r => { r.risk = raceRiskForRow(r, raceSession, leaderLaps); });
    return {
      rows,
      track: data.trackName || data.metaData || 'unknown',
      wet: !!data.sessionResult?.isWetSession
    };
  }

  function renderRaceLapTrace(latestRows, highlightIndex){
    let rows = latestRows.filter(r => Array.isArray(r.allLapTimes) && r.allLapTimes.length >= 2).slice(0, 12);
    const highlightedRow = Number.isInteger(highlightIndex) ? latestRows[highlightIndex] : null;
    if(highlightedRow && Array.isArray(highlightedRow.allLapTimes) && highlightedRow.allLapTimes.length >= 2 && !rows.includes(highlightedRow)){
      rows = rows.slice(0, 11).concat(highlightedRow);
    }
    if(!rows.length){
      return '<div class="chart-wrap race-chart-wide"><p class="chart-title">Lap-time trace</p><p class="chart-help">No lap-by-lap data available in this race file.</p></div>';
    }

    const allTimes = rows.flatMap(r => r.allLapTimes.filter(v => isValidLap(v)));
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);
    const maxLaps = Math.max(...rows.map(r => r.allLapTimes.length));
    const w = 1000, h = 310, left = 70, right = 25, top = 28, bottom = 42;
    const plotW = w - left - right, plotH = h - top - bottom;
    const range = Math.max(1, maxTime - minTime);
    const yFor = v => top + plotH - ((v - minTime) / range) * plotH;
    const xFor = lap => left + ((lap - 1) / Math.max(1, maxLaps - 1)) * plotW;
    const palette = ['#1fd6bd','#c65be8','#ffb238','#5aa9ff','#ff5464','#9be564','#ff9f4a','#7d8ff0','#33d99b','#e884d0','#ffd166','#8ecae6'];

    const grid = [0,.25,.5,.75,1].map(p => {
      const y = top + p * plotH;
      const val = maxTime - p * range;
      return `<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>${svgText(8, y+4, msTimeFull(val), 10, 700)}`;
    }).join('');

    const orderedRows = highlightedRow ? [...rows.filter(r => r !== highlightedRow), highlightedRow] : rows;
    const lines = orderedRows.map((r) => {
      const originalIdx = rows.indexOf(r);
      const isHighlighted = r === highlightedRow;
      const pts = r.allLapTimes.map((v, i) => isValidLap(v) ? `${xFor(i+1).toFixed(1)},${yFor(v).toFixed(1)}` : null).filter(Boolean).join(' ');
      const colour = isHighlighted ? '#ffffff' : palette[originalIdx % palette.length];
      const width = isHighlighted ? 5 : 3;
      const opacity = highlightedRow ? (isHighlighted ? 1 : .28) : .88;
      return `<polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="${width}" opacity="${opacity}"><title>${esc(r.driver)}</title></polyline>`;
    }).join('');

    const legendRows = highlightedRow ? [highlightedRow, ...rows.filter(r => r !== highlightedRow)].slice(0, 8) : rows.slice(0, 8);
    const labels = legendRows.map((r, idx) => {
      const y = 18 + idx * 17;
      const isHighlighted = r === highlightedRow;
      const paletteIdx = rows.indexOf(r);
      return `<circle cx="${left + 8 + idx*115}" cy="${y-4}" r="5" fill="${isHighlighted ? '#ffffff' : palette[paletteIdx % palette.length]}"/>${svgText(left + 18 + idx*115, y, driverShort(r.driver) + (isHighlighted ? ' (selected)' : ''), 10, 900)}`;
    }).join('');

    const axis = `<line x1="${left}" y1="${top}" x2="${left}" y2="${h-bottom}" stroke="rgba(255,255,255,.32)" stroke-width="2"/><line x1="${left}" y1="${h-bottom}" x2="${w-right}" y2="${h-bottom}" stroke="rgba(255,255,255,.32)" stroke-width="2"/>${svgText(left, h-12, 'Lap 1', 11, 900)}${svgText(w-right, h-12, 'Lap '+maxLaps, 11, 900, 'end')}`;

    return `<div class="chart-wrap race-chart-wide">
      <p class="chart-title">Lap-time trace</p>
      <p class="chart-help">Shows lap-by-lap pace for the top 12 drivers in this race.${highlightedRow ? ` ${esc(highlightedRow.driver)} is highlighted in white.` : ''} Spikes usually mean errors, traffic, pits, damage or invalid/messy laps.</p>
      <svg class="svg-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Race lap time trace">${grid}${axis}${lines}${labels}</svg>
    </div>`;
  }

  function renderRacePositionGapChart(latestRows, highlightIndex){
    const rows = latestRows.filter(r => isValidLap(r.bestLap)).sort((a,b)=>a.racePos-b.racePos).slice(0, 30);
    if(!rows.length){
      return '<div class="chart-wrap"><p class="chart-title">Field best-lap gaps</p><p class="chart-help">No valid best lap data.</p></div>';
    }
    const highlightedRow = Number.isInteger(highlightIndex) ? latestRows[highlightIndex] : null;
    const fastest = Math.min(...rows.map(r => r.bestLap));
    const maxGap = Math.max(1, ...rows.map(r => r.bestLap - fastest));
    const w = 1000, h = 310, left = 52, right = 22, top = 25, bottom = 46;
    const plotW = w - left - right, plotH = h - top - bottom;
    const barW = Math.max(8, plotW / rows.length - 4);

    const bars = rows.map((r, idx) => {
      const gap = r.bestLap - fastest;
      const bh = Math.max(3, (gap / maxGap) * plotH);
      const x = left + idx * (plotW / rows.length);
      const y = top + plotH - bh;
      const isHighlighted = r === highlightedRow;
      const fill = isHighlighted ? '#ffb238' : '#1fd6bd';
      const stroke = isHighlighted ? ' stroke="#ffffff" stroke-width="2"' : '';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${fill}"${stroke}><title>${esc(r.driver)} ${gapTime(gap)}</title></rect>`;
    }).join('');

    return `<div class="chart-wrap">
      <p class="chart-title">Field best-lap gaps</p>
      <p class="chart-help">Each bar is that driver's best-lap gap to the fastest driver in this race.${highlightedRow ? ` ${esc(highlightedRow.driver)} is highlighted in amber.` : ''}</p>
      <svg class="svg-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Field best lap gaps">
        <line x1="${left}" y1="${top}" x2="${left}" y2="${h-bottom}" stroke="rgba(255,255,255,.32)" stroke-width="2"/>
        <line x1="${left}" y1="${h-bottom}" x2="${w-right}" y2="${h-bottom}" stroke="rgba(255,255,255,.32)" stroke-width="2"/>
        ${svgText(8, top+6, '+'+((maxGap/1000).toFixed(1))+'s', 10, 900)}
        ${svgText(left, h-14, 'P1', 11, 900)}
        ${svgText(w-right, h-14, 'Field', 11, 900, 'end')}
        ${bars}
      </svg>
    </div>`;
  }

  function renderRaceConsistencyRiskChart(latestRows, mode, highlightIndex){
    const isRisk = mode === 'risk';
    const rows = latestRows.slice(0, 30);
    const highlightedRow = Number.isInteger(highlightIndex) ? latestRows[highlightIndex] : null;
    const w = 1000, h = 310, left = 58, right = 28, top = 28, bottom = 42;
    const plotW = w - left - right, plotH = h - top - bottom;
    const barW = Math.max(8, plotW / rows.length - 4);

    const bars = rows.map((r, idx) => {
      const value = isRisk ? Number(r.risk?.risk || 0) : Number(r.consistencyStats?.consistency || 0);
      const bh = Math.max(3, (value / 100) * plotH);
      const x = left + idx * (plotW / rows.length);
      const y = top + plotH - bh;
      const isHighlighted = r === highlightedRow;
      const baseFill = isRisk ? (value > 60 ? '#ff5464' : value > 35 ? '#ffb238' : '#1fd6bd') : '#1fd6bd';
      const fill = isHighlighted ? '#ffffff' : baseFill;
      const stroke = isHighlighted ? ' stroke="#ffb238" stroke-width="2"' : '';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${fill}"${stroke}><title>${esc(r.driver)} ${value.toFixed(0)}%</title></rect>`;
    }).join('');

    const chartTitle = isRisk ? 'Race Risk distribution' : 'Consistency distribution';
    const baseHelp = isRisk ? 'Higher bars mean more unstable race data.' : 'Higher bars mean a tighter fastest-to-slowest lap spread.';
    const chartHelp = baseHelp + (highlightedRow ? ` ${esc(highlightedRow.driver)}'s bar is highlighted in white.` : '');

    return `<div class="chart-wrap">
      <p class="chart-title">${esc(chartTitle)}</p>
      <p class="chart-help">${chartHelp}</p>
      <svg class="svg-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(chartTitle)}">
        <line x1="${left}" y1="${top}" x2="${left}" y2="${h-bottom}" stroke="rgba(255,255,255,.32)" stroke-width="2"/>
        <line x1="${left}" y1="${h-bottom}" x2="${w-right}" y2="${h-bottom}" stroke="rgba(255,255,255,.32)" stroke-width="2"/>
        ${svgText(18, top+5, '100%', 10, 900)}
        ${svgText(28, h-bottom, '0%', 10, 900)}
        ${svgText(left, h-14, 'P1', 11, 900)}
        ${svgText(w-right, h-14, 'Field', 11, 900, 'end')}
        ${bars}
      </svg>
    </div>`;
  }

  function buildRaceChartsHtml(rows, highlightIndex){
    return `<div class="race-chart-grid">
      ${renderRaceLapTrace(rows, highlightIndex)}
      ${renderRacePositionGapChart(rows, highlightIndex)}
      ${renderRaceConsistencyRiskChart(rows, 'consistency', highlightIndex)}
      ${renderRaceConsistencyRiskChart(rows, 'risk', highlightIndex)}
    </div>`;
  }

  function buildDriverProfileHtml(row){
    if(!row) return '<div class="empty">Select a driver to view their detailed race profile.</div>';
    const laps = (row.allLapTimes || []).filter(v => isValidLap(v));
    const best = laps.length ? Math.min(...laps) : 0;
    const risk = row.risk || {risk: NaN, label: '-'};
    const consistency = row.consistencyStats?.consistency;
    const invalid = Number(row.invalidLapCount || 0);
    const recorded = Number(row.recordedLapCount || 0);
    const invalidPct = recorded ? (invalid / recorded) * 100 : NaN;

    let chart = '<div class="empty">No lap trace available for this driver.</div>';
    const points = laps.map((v, i) => ({lap: i+1, value: v}));
    if(points.length >= 2){
      const w = 1000, h = 230, left = 70, right = 25, top = 25, bottom = 40;
      const plotW = w - left - right, plotH = h - top - bottom;
      const minTime = Math.min(...laps), maxTime = Math.max(...laps);
      const range = Math.max(1, maxTime - minTime);
      const xFor = lap => left + ((lap - 1) / Math.max(1, points.length - 1)) * plotW;
      const yFor = v => top + plotH - ((v - minTime) / range) * plotH;
      const pts = points.map(p => `${xFor(p.lap).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(' ');
      chart = `<div class="single-driver-chart"><p class="chart-title">Driver lap trace</p><svg class="svg-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Driver lap trace"><line x1="${left}" y1="${top}" x2="${left}" y2="${h-bottom}" stroke="rgba(255,255,255,.32)" stroke-width="2"/><line x1="${left}" y1="${h-bottom}" x2="${w-right}" y2="${h-bottom}" stroke="rgba(255,255,255,.32)" stroke-width="2"/>${svgText(10, top+5, msTimeFull(maxTime), 10, 900)}${svgText(10, h-bottom, msTimeFull(minTime), 10, 900)}<polyline points="${pts}" fill="none" stroke="#1fd6bd" stroke-width="4"/><circle cx="${xFor(1)}" cy="${yFor(points[0].value)}" r="5" fill="#1fd6bd"/><circle cx="${xFor(points.length)}" cy="${yFor(points[points.length-1].value)}" r="5" fill="#1fd6bd"/>${svgText(left, h-12, 'Lap 1', 11, 900)}${svgText(w-right, h-12, 'Lap '+points.length, 11, 900, 'end')}</svg></div>`;
    }

    return `<div class="driver-profile-grid">
      <div class="driver-profile-card"><span>Driver</span><strong>${esc(row.driver)}</strong><small>P${esc(row.racePos)} · ${esc(row.carName)}</small></div>
      <div class="driver-profile-card"><span>Best lap</span><strong>${best ? msTimeFull(best) : '-'}</strong><small>${row.bestLap ? 'Leaderboard: '+msTimeFull(row.bestLap) : ''}</small></div>
      <div class="driver-profile-card"><span>Consistency</span><strong>${Number.isFinite(consistency) ? consistency.toFixed(1)+'%' : '-'}</strong><small>${row.consistencyStats?.count || 0} laps${Number.isFinite(row.consistencyStats?.tightBandPct) ? ` · ${row.consistencyStats.tightBandPct.toFixed(0)}% within 1%` : ''}</small></div>
      <div class="driver-profile-card"><span>Race Risk</span><strong>${Number.isFinite(risk.risk) ? risk.risk.toFixed(0)+'%' : '-'}</strong><small>${esc(risk.label || '-')}</small></div>
      <div class="driver-profile-card"><span>Invalid laps</span><strong>${recorded ? `${invalid}/${recorded}` : '-'}</strong><small>${Number.isFinite(invalidPct) ? invalidPct.toFixed(1)+'%' : ''}</small></div>
      <div class="driver-profile-card"><span>Lap spread</span><strong>${Number.isFinite(row.consistencyStats?.spread) ? msTimeFull(row.consistencyStats.spread) : '-'}</strong><small>Fastest to slowest, clean laps only</small></div>
      <div class="driver-profile-card"><span>Average lap</span><strong>${row.consistencyStats?.avg ? msTimeFull(row.consistencyStats.avg) : '-'}</strong><small>All real laps</small></div>
      <div class="driver-profile-card"><span>Laps completed</span><strong>${esc(row.lapCount)}</strong><small>Race result laps</small></div>
      <div class="driver-profile-card"><span>Pit status</span><strong>${row.missingPit === 1 ? 'Missing' : row.missingPit === 0 ? 'OK' : '-'}</strong><small>From ACC result</small></div>
      <div class="driver-profile-card"><span>Total time</span><strong>${msTimeFull(row.totalTime)}</strong><small>Race finish time</small></div>
    </div>${chart}`;
  }

  window.IFWLStats.loadRaceDetail = loadRaceDetail;
  window.IFWLStats.buildRaceChartsHtml = buildRaceChartsHtml;
  window.IFWLStats.buildDriverProfileHtml = buildDriverProfileHtml;
  window.IFWLStats.msTime = msTimeFull;
  window.IFWLStats.gapTime = gapTime;
  window.IFWLStats.consistencyClass = consistencyClass;
  window.IFWLStats.consistencyText = consistencyText;
  window.IFWLStats.consistencyNoteText = consistencyNoteText;
  window.IFWLStats.riskClass = riskClassOf;
})();
