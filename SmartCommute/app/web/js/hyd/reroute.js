/* SmartCommute / Hyderabad — traffic-aware alternative routes (add-on; the Monte Carlo engine is not modified)
 *
 * WHAT IS REAL AND WHAT IS NOT
 *   Live traffic exists only when a live-traffic provider answers: TomTom Routing API (needs a free API key — add it in the Routes
 *   panel). Its answer carries the current travel time and the traffic delay of every route. Without a key there is NO live traffic
 *   source: the OSRM public server knows road geometry and free-flow speeds only. In that case the panel says so, every ETA comes
 *   from the free-flow time + the historical Monte Carlo model, and nothing is labelled "live".
 *   A trip planned for another time of day is never called live: TomTom is then asked for typical traffic at that departure time
 *   and the panel says "typical traffic (not live)".
 *
 * WHAT IT DOES
 *   1. wraps SC.services.route(): one request returns the main route AND up to 2 alternatives (OSRM `alternatives`, or TomTom
 *      `maxAlternatives`). The wrapper returns the route the user prefers, the rest are kept for comparison.
 *   2. runs the existing SC.engine.analyze() for every alternative (same weather, time and time budget) -> expected time, P(late),
 *      congestion level, risk score. These are the SAME numbers the main card shows for the active route.
 *   3. detects delays: live delay of the active route >= max(3 min, 15 % of free-flow) AND a faster alternative -> alert with a
 *      one-click switch. Without live data the alert is labelled "Model estimate (not live traffic)".
 *   4. the user can switch route from the panel or by clicking a grey alternative on the map; the choice is remembered, so the
 *      automatic re-routing while the user moves (location.js) keeps following the chosen road.
 *   5. polls the provider every cfg.traffic.pollMs while a live route is on screen (not when the tab is hidden) and updates ETAs,
 *      delay and alert.                                                                                                      */
(function (SC) {
  'use strict';
  const H = SC.hyd, cfg = H.cfg, esc = H.esc, $ = (id) => document.getElementById(id), hav = SC.hav;
  cfg.traffic = Object.assign({ pollMs: 180000, minDelayMin: 3, minDelayPct: 0.15, minSaveMin: 2, minSavePct: 0.08, modelSaveMin: 3, modelSavePct: 0.08, maxAlts: 3,
    tomtom: 'https://api.tomtom.com' }, cfg.traffic || {});
  const T = cfg.traffic, LETTER = ['A', 'B', 'C', 'D'], COLORS = ['#22e3ff', '#a78bfa', '#f5a524', '#4ff0a5'];
  const st = { alts: [], active: 0, status: { mode: 'model', msg: '' }, cmp: {}, alert: null, pref: null, layer: null, lastPoll: 0, lastAlertKey: '', cmpBusy: false, cmpQueued: false, switching: false, token: 0, lastLive: null };
  const timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  const getKey = () => (window.SC_CONFIG && window.SC_CONFIG.tomtomKey) || H.store.get('tomtomKey', '') || '';

  /* ---------- geometry helpers -------------------------------------------------------------------------------------- */
  function sample(coords, n) { if (coords.length <= n) return coords; const o = []; for (let i = 0; i < n; i++) o.push(coords[Math.round(i * (coords.length - 1) / (n - 1))]); return o; }
  function nearPath(pt, path, km) { for (let i = 0; i < path.length; i++) { if (Math.abs(path[i][0] - pt[0]) < 0.01 && Math.abs(path[i][1] - pt[1]) < 0.01 && hav(pt, path[i]) <= km) return true; } return false; }
  /* share of route A's points that lie within 90 m of route B's path (B densified by sampling every ~150 m) */
  function overlap(a, b) { const pa = sample(a, 40), pb = sample(b, Math.min(b.length, 400)); let k = 0; pa.forEach((p) => { if (nearPath(p, pb, 0.09)) k++; }); return k / pa.length; }
  const same = (a, b) => overlap(a.coords, b.coords) > 0.93 && overlap(b.coords, a.coords) > 0.93;

  /* ---------- providers ------------------------------------------------------------------------------------------------- */
  function plannedDeparture() {
    if (H.loc && H.loc.isLiveRoute && H.loc.isLiveRoute()) return { now: true, date: new Date() };
    const d = $('inDate') && $('inDate').value, t = $('inTime') && $('inTime').value; if (!d || !t) return { now: true, date: new Date() };
    const dep = new Date(d + 'T' + t + ':00'), diff = (dep - Date.now()) / 60000;
    return { now: Math.abs(diff) <= 45, past: diff < -45, future: diff > 45, date: dep, diffMin: diff };
  }
  const iso = (d) => { const p = (n) => String(n).padStart(2, '0'), o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':00' + s + p(Math.floor(a / 60)) + ':' + p(a % 60); };

  async function tomtom(a, b, key, dep) {
    let u = T.tomtom + '/routing/1/calculateRoute/' + a.lat + ',' + a.lon + ':' + b.lat + ',' + b.lon + '/json?key=' + encodeURIComponent(key) +
      '&travelMode=car&routeType=fastest&traffic=true&maxAlternatives=' + (T.maxAlts - 1) + '&computeTravelTimeFor=all&routeRepresentation=polyline&instructionsType=none';
    if (!dep.now && dep.future) u += '&departAt=' + encodeURIComponent(iso(dep.date));
    const r = await fetch(u, { signal: timeout(10000) });
    if (!r.ok) { const e = new Error('TomTom HTTP ' + r.status + (r.status === 403 || r.status === 401 ? ' (API key rejected or not enabled for Routing)' : r.status === 429 ? ' (quota exceeded)' : '')); e.http = r.status; throw e; }
    const j = await r.json(), live = dep.now;               // live only when the trip starts now; a future departure returns typical traffic
    return (j.routes || []).map((rt) => {
      const sm = rt.summary || {}, coords = []; (rt.legs || []).forEach((l) => (l.points || []).forEach((p) => coords.push([p.latitude, p.longitude])));
      const trafficS = sm.travelTimeInSeconds, delayS = sm.trafficDelayInSeconds || 0, freeS = sm.noTrafficTravelTimeInSeconds != null ? sm.noTrafficTravelTimeInSeconds : trafficS - delayS;
      return { coords, distKm: (sm.lengthInMeters || 0) / 1000, freeMin: freeS / 60, trafficMin: trafficS / 60, delayMin: delayS / 60, traffic: live ? 'live' : 'typical', source: 'TomTom' };
    }).filter((r) => r.coords.length > 1);
  }
  async function osrm(a, b) {
    const u = 'https://router.project-osrm.org/route/v1/driving/' + a.lon + ',' + a.lat + ';' + b.lon + ',' + b.lat + '?overview=full&geometries=geojson&steps=false&alternatives=' + (T.maxAlts - 1);
    const r = await fetch(u, { signal: timeout(8000) }); if (!r.ok) throw new Error('OSRM HTTP ' + r.status);
    const j = await r.json(); if (!j.routes || !j.routes.length) throw new Error('no route');
    return j.routes.map((rt) => ({ coords: rt.geometry.coordinates.map((c) => [c[1], c[0]]), distKm: rt.distance / 1000, freeMin: rt.duration / 60, trafficMin: null, delayMin: null, traffic: 'none', source: 'OSRM' }));
  }
  function tidy(list) {                                         // drop near-duplicates and silly detours, keep order, cap count
    const out = [];
    list.forEach((r) => { if (out.length < T.maxAlts && !out.some((o) => same(o, r)) && (!out.length || r.distKm < out[0].distKm * 1.8 + 3)) out.push(r); });
    out.forEach((r, i) => { r.id = i; r.letter = LETTER[i]; });
    return out;
  }
  async function fetchSet(a, b) {
    const dep = plannedDeparture(), key = getKey(); let list = null, status;
    if (key && dep.past) status = { mode: 'model', msg: 'The planned time is in the past — live traffic does not apply. ETAs are free-flow time + the historical model.' };
    else if (key) {
      try { list = await tomtom(a, b, key, dep); status = dep.now ? { mode: 'live', msg: 'Live traffic · TomTom' } : dep.future ? { mode: 'typical', msg: 'Typical traffic for that departure time · TomTom (not live)' } : { mode: 'typical', msg: 'Past departure — TomTom only knows current / typical traffic' }; }
      catch (e) { status = { mode: 'error', msg: (e && e.message || 'TomTom failed') + ' — using road geometry only, no traffic data' }; }
    }
    if (!list || !list.length) {
      list = await osrm(a, b);
      if (!status) status = { mode: 'model', msg: 'No live traffic feed — ETAs are free-flow time + the historical Monte Carlo model' };
    }
    return { alts: tidy(list), status, dep };
  }

  /* ---------- the hook: SC.services.route returns the preferred route, alternatives are kept ------------------------------- */
  const origRoute = SC.services.route;
  function preferred(set, a, b) {
    const p = st.pref; if (!p) return 0;
    const live = H.loc && H.loc.isLiveRoute && H.loc.isLiveRoute();
    if (hav([b.lat, b.lon], p.to) > 0.15 || (!live && hav([a.lat, a.lon], p.from) > 0.3)) { st.pref = null; return 0; }
    let best = 0, bs = 0; set.forEach((r, i) => { const s = overlap(r.coords, p.coords); if (s > bs) { bs = s; best = i; } });
    return bs >= 0.7 ? best : 0;
  }
  SC.services.route = async function (a, b) {
    let set = null;
    try { set = await fetchSet(a, b); } catch (e) { /* OSRM unreachable: original single-route service (OSRM / estimate) below */ }
    if (!set || !set.alts.length) {
      const rt = await origRoute(a, b); rt.id = 0; rt.letter = 'A'; rt.traffic = 'none';
      st.alts = [rt]; st.active = 0; st.cmp = {}; st.status = { mode: rt.source === 'Estimate' ? 'estimate' : 'model', msg: rt.source === 'Estimate' ? 'Offline: straight-line estimate, no road data, no traffic data' : 'No live traffic feed — alternatives unavailable right now' };
      st.alert = null; H.emit('alts', st); return rt;
    }
    const k = preferred(set.alts, a, b), prev = st.alts.length;
    st.alts = set.alts; st.active = k; st.status = set.status; st.cmp = {}; st.alert = null; st.lastLive = Date.now();
    H.emit('alts', st); return set.alts[k];
  };
  const activeAlt = () => st.alts[st.active] || null;

  /* ---------- compare alternatives with the existing Monte Carlo engine ------------------------------------------------------ */
  const summary = (r) => ({ mean: r.mean, sd: r.sd, pLate: r.pLate, risk: r.risk.score, cls: r.risk.cls, lvl: r.congestion.level, idx: r.congestion.index, pHeavy: r.pHeavy, p95: r.pi95[1] });
  let cmpTimer = 0;
  function scheduleCompare(ms) { clearTimeout(cmpTimer); cmpTimer = setTimeout(compare, ms == null ? 700 : ms); }
  async function compare() {
    const S = SC.state; if (!S.res || !S.route || st.alts.length < 1) { render(); return; }
    if (S.busy || st.cmpBusy) { st.cmpQueued = true; return; }
    st.cmpBusy = true; st.cmpQueued = false; const my = ++st.token;
    try {
      const w = SC.ui.effectiveWeather(), base = SC.ui.buildReq(w), budget = S.budget || S.res.budget, cmp = {};
      cmp[st.active] = summary(S.res);
      for (const alt of st.alts) {
        if (alt.id === st.active) continue;
        const res = await SC.engine.analyze(Object.assign({}, base, { free: alt.freeMin, distKm: alt.distKm, n: Math.min(base.n || 4000, 2500), budgetMin: budget, alt: true }));
        if (my !== st.token) return; cmp[alt.id] = summary(res);
      }
      st.cmp = cmp; st.cmpBudget = budget; evaluate(); render(); drawAlts();
    } catch (e) { /* comparison is optional; the main result is untouched */ }
    finally { st.cmpBusy = false; if (st.cmpQueued) scheduleCompare(400); }
  }

  /* ---------- delay detection ------------------------------------------------------------------------------------------------- */
  function etaOf(alt) { const c = st.cmp[alt.id]; return alt.traffic === 'live' || alt.traffic === 'typical' ? alt.trafficMin : (c ? c.mean : alt.freeMin); }
  function evaluate() {
    const cur = activeAlt(); st.alert = null; if (!cur || st.alts.length < 2) { if (cur && cur.traffic === 'live' && cur.delayMin >= Math.max(T.minDelayMin, T.minDelayPct * cur.freeMin)) st.alert = { type: 'delay-only', delay: cur.delayMin }; return; }
    let best = cur; st.alts.forEach((a) => { if (etaOf(a) < etaOf(best)) best = a; });
    const saved = etaOf(cur) - etaOf(best), live = cur.traffic === 'live';
    if (live) {
      const delayed = cur.delayMin >= Math.max(T.minDelayMin, T.minDelayPct * cur.freeMin);
      if (delayed && best !== cur && saved >= Math.max(T.minSaveMin, T.minSavePct * etaOf(cur))) st.alert = { type: 'live-better', delay: cur.delayMin, best, saved };
      else if (delayed) st.alert = { type: 'delay-only', delay: cur.delayMin };
    } else if (cur.traffic !== 'typical' && best !== cur && saved >= Math.max(T.modelSaveMin, T.modelSavePct * etaOf(cur))) {
      st.alert = { type: 'model-better', best, saved };
    }
    const key = st.alert ? st.alert.type + ':' + (st.alert.best ? st.alert.best.id : '') + ':' + Math.round(st.alert.delay || 0) : '';
    if (key && key !== st.lastAlertKey && st.alert.type !== 'model-better') SC.ui.toast(st.alert.type === 'live-better' ? 'Live traffic: +' + Math.round(st.alert.delay) + ' min delay on your route. Route ' + st.alert.best.letter + ' is ' + Math.round(st.alert.saved) + ' min faster.' : 'Live traffic: +' + Math.round(st.alert.delay) + ' min delay on your route.', 'err', 7000);
    st.lastAlertKey = key;
  }

  /* ---------- switching routes --------------------------------------------------------------------------------------------------- */
  async function choose(i) {
    const S = SC.state, alt = st.alts[i]; if (!alt || i === st.active || st.switching || S.busy || !S.res) return;
    st.switching = true; render();
    try {
      const w = SC.ui.effectiveWeather(), prevBudget = S.budget || S.res.budget;
      st.active = i; S.route = alt; S.customBudget = prevBudget;                       // same time budget before and after, so P(late) values stay comparable
      st.pref = { coords: alt.coords, to: [S.to.lat, S.to.lon], from: [S.from.lat, S.from.lon] };
      const res = await SC.engine.analyze(SC.ui.buildReq(w));
      SC.map.showRoute(alt, { quiet: true }); SC.map.showResult(res, w, { quiet: true });
      SC.ui.showCard(res, false, { noFit: true });
      SC.ui.toast('Switched to route ' + alt.letter + ' · ' + alt.distKm.toFixed(1) + ' km · expected ' + SC.fmt.min(res.mean), 'ok', 3500);
      H.emit('reroute', { id: i, route: alt, res });
    } catch (e) { SC.ui.toast('Could not switch route: ' + (e && e.message || e), 'err', 5000); }
    finally { st.switching = false; render(); }
  }

  /* ---------- polling a live provider ---------------------------------------------------------------------------------------------- */
  async function poll(force) {
    const S = SC.state, cur = activeAlt(); if (!S.res || !S.to || !cur || S.busy || st.switching) return;
    if (!force && (document.visibilityState !== 'visible' || !getKey() || st.status.mode !== 'live')) return;
    const a = H.loc && H.loc.isLiveRoute() && H.loc.me ? { lat: H.loc.me.lat, lon: H.loc.me.lon } : S.from;
    try {
      const set = await fetchSet(a, S.to); st.lastPoll = Date.now(); if (!set.alts.length) return;
      let k = 0, bs = -1; set.alts.forEach((r, i) => { const s = overlap(cur.coords, r.coords) + overlap(r.coords, cur.coords); if (s > bs) { bs = s; k = i; } });
      const was = cur.trafficMin, was0 = cur.delayMin;
      // keep the geometry the map and the analysis already use for the active route; refresh traffic numbers and the alternatives
      const keepActive = Object.assign({}, cur, { trafficMin: set.alts[k].trafficMin, delayMin: set.alts[k].delayMin, traffic: set.alts[k].traffic });
      const others = set.alts.filter((_, i) => i !== k); const list = [keepActive].concat(others); list.forEach((r, i) => { r.id = i; r.letter = LETTER[i]; });
      st.alts = list; st.active = 0; S.route = Object.assign(S.route, { trafficMin: keepActive.trafficMin, delayMin: keepActive.delayMin, traffic: keepActive.traffic }); st.status = set.status;
      if (was != null && Math.abs(keepActive.trafficMin - was) >= 2) SC.ui.toast('Live traffic ETA changed: ' + Math.round(was) + ' → ' + Math.round(keepActive.trafficMin) + ' min.', '', 4500);
      st.cmp = {}; H.emit('alts', st); scheduleCompare(50);
    } catch (e) { st.status = { mode: 'error', msg: (e && e.message || 'traffic update failed') + ' — showing the last data' }; render(); }
  }
  setInterval(() => { if (Date.now() - st.lastPoll >= T.pollMs) { st.lastPoll = Date.now(); poll(false); } }, 15000);

  /* ---------- map: alternatives as grey lines you can click ---------------------------------------------------------------------- */
  function drawAlts() {
    const m = SC.map.getMap(); if (!m) return; if (!m.getPane('altPane')) { m.createPane('altPane').style.zIndex = 418; }
    if (!st.layer) st.layer = L.layerGroup().addTo(m); st.layer.clearLayers();
    if (!SC.state.res || st.alts.length < 2) return;
    st.alts.forEach((a, i) => {
      if (i === st.active) return; const c = st.cmp[a.id], tip = 'Route ' + a.letter + ' · ' + a.distKm.toFixed(1) + ' km · ' + SC.fmt.min(etaOf(a)) + (a.traffic === 'live' ? ' (live)' : c ? ' (model)' : '') + ' — click to switch';
      L.polyline(a.coords, { pane: 'altPane', color: '#05080f', weight: 9, opacity: 0.55, interactive: false }).addTo(st.layer);
      const ln = L.polyline(a.coords, { pane: 'altPane', color: COLORS[i] || '#9aa7c7', weight: 5, opacity: 0.9, dashArray: '2 9', lineCap: 'round', interactive: true, bubblingMouseEvents: false }).addTo(st.layer);
      ln.bindTooltip(tip, { sticky: true, className: 'hyd-tip' }); ln.on('click', () => choose(i));
      ln.on('mouseover', () => ln.setStyle({ weight: 7, opacity: 1 })); ln.on('mouseout', () => ln.setStyle({ weight: 5, opacity: 0.9 }));
    });
  }

  /* ---------- panel ------------------------------------------------------------------------------------------------------------------- */
  function inject() {
    const el = document.createElement('div'); el.id = 'hydAlt'; el.className = 'glass hidden';
    el.innerHTML = '<div class="al-h"><b>Routes</b><span class="al-src" id="alSrc"></span><button type="button" id="alMin" title="Collapse / expand">–</button></div><div class="al-body"><div class="al-alert hidden" id="alAlert"></div><div class="al-list" id="alList"></div><div class="al-f"><div id="alFoot"></div><div class="al-key"><button type="button" id="alKeyToggle"></button></div><div class="al-keyform"><input id="alKey" type="password" autocomplete="off" placeholder="TomTom API key" spellcheck="false"><button type="button" id="alKeySave">Save</button><button type="button" id="alKeyDel">Remove</button><div class="al-msg" id="alKeyMsg">Free key at developer.tomtom.com (Routing API). Stored only in this browser. Without it SmartCommute has no live traffic and says so.</div></div></div></div>';
    document.body.appendChild(el);
    $('alMin').addEventListener('click', () => { el.classList.toggle('min'); $('alMin').textContent = el.classList.contains('min') ? '+' : '–'; });
    el.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]'); if (go) { choose(+go.dataset.go); return; }
      const card = e.target.closest('.al-card[data-i]'); if (card && !card.classList.contains('on')) choose(+card.dataset.i);
      if (e.target.closest('#alKeySave')) saveKey(); if (e.target.closest('#alKeyDel')) { H.store.set('tomtomKey', ''); st.status = { mode: 'model', msg: 'Key removed' }; poll(true).then(render); render(); }
      if (e.target.closest('#alKeyToggle')) { el.classList.toggle('keyopen'); }
      if (e.target.closest('#alSwitchBest') && st.alert && st.alert.best) choose(st.alert.best.id);
    });
    window.addEventListener('resize', place); if (window.ResizeObserver && $('planner')) new ResizeObserver(place).observe($('planner'));
  }
  async function saveKey() {
    const v = ($('alKey').value || '').trim(); if (!v) return; const msg = $('alKeyMsg'); msg.textContent = 'Checking the key…'; msg.className = 'al-msg';
    const S = SC.state; const a = S.from, b = S.to || { lat: 17.4337, lon: 78.5011 };
    try { const list = await tomtom(a || { lat: 17.4435, lon: 78.3772 }, b, v, { now: true }); if (!list.length) throw new Error('TomTom answered but returned no route'); H.store.set('tomtomKey', v); msg.textContent = 'Key accepted.'; msg.className = 'al-msg ok'; $('hydAlt').classList.remove('keyopen'); await poll(true); }
    catch (e) { msg.textContent = (e && e.message || e) + '. The key was not saved.'; msg.className = 'al-msg err'; }
    render();
  }
  function place() {
    const el = $('hydAlt'), pl = $('planner'); if (!el || !pl) return; const r = pl.getBoundingClientRect();
    el.style.left = Math.max(14, r.left) + 'px'; el.style.top = Math.round(r.bottom + 12) + 'px'; el.style.width = Math.round(r.width) + 'px';
    el.style.maxHeight = Math.max(120, window.innerHeight - r.bottom - 12 - 128) + 'px';
  }
  const fmtMin = (m) => SC.fmt.min(m);
  function sgn(v, unit, dec) { const x = Math.abs(v) < (dec ? 0.05 : 0.5) ? 0 : v; return x === 0 ? '±0' + unit : (x > 0 ? '+' : '−') + Math.abs(x).toFixed(dec || 0) + unit; }
  function render() {
    const el = $('hydAlt'); if (!el) return; const S = SC.state, show = !!(S.res && st.alts.length);
    el.classList.toggle('hidden', !show); if (!show) return; place();
    const s = st.status, cls = { live: 'ok', typical: 'info', model: 'warn', error: 'err', estimate: 'err' }[s.mode] || 'warn';
    $('alSrc').className = 'al-src ' + cls; $('alSrc').textContent = s.mode === 'live' ? 'LIVE TRAFFIC' : s.mode === 'typical' ? 'TYPICAL TRAFFIC' : s.mode === 'error' ? 'NO TRAFFIC DATA' : 'MODEL · NOT LIVE'; $('alSrc').title = s.msg;
    const al = $('alAlert'), a = st.alert; al.classList.toggle('hidden', !a);
    if (a) {
      if (a.type === 'live-better') al.innerHTML = '<b>Live delay +' + Math.round(a.delay) + ' min</b> on your route. Route ' + a.best.letter + ' is <b>' + Math.round(a.saved) + ' min faster</b> (' + fmtMin(etaOf(a.best)) + ', ' + a.best.distKm.toFixed(1) + ' km). <button type="button" id="alSwitchBest">Switch to ' + a.best.letter + '</button>';
      else if (a.type === 'delay-only') al.innerHTML = '<b>Live delay +' + Math.round(a.delay) + ' min</b> on your route. No faster alternative right now.';
      else al.innerHTML = '<b>Model estimate (not live traffic):</b> route ' + a.best.letter + ' is expected to be ' + Math.round(a.saved) + ' min faster. <button type="button" id="alSwitchBest">Switch to ' + a.best.letter + '</button>';
      al.className = 'al-alert ' + (a.type === 'model-better' ? 'warn' : 'err');
    }
    const cur = activeAlt(), list = $('alList'); list.innerHTML = '';
    st.alts.forEach((alt, i) => {
      const c = st.cmp[alt.id], on = i === st.active, live = alt.traffic === 'live', typ = alt.traffic === 'typical';
      const eta = etaOf(alt), curEta = cur ? etaOf(cur) : eta, dE = eta - curEta, dK = alt.distKm - (cur ? cur.distKm : 0), dR = c && st.cmp[cur.id] ? c.risk - st.cmp[cur.id].risk : null;
      const etaLabel = live ? 'live' : typ ? 'typical' : c ? 'model' : 'free-flow';
      const cong = c ? '<span class="pill ' + ({ Low: 'low', Medium: 'med', Heavy: 'high', Severe: 'sev' }[c.lvl] || 'med') + '">' + c.lvl + ' · risk ' + Math.round(c.risk) + '</span>' : '<span class="al-wait">comparing…</span>';
      const model = c ? '<span class="al-sub">model ' + fmtMin(c.mean) + ' · late ' + Math.round(c.pLate * 100) + '%' + (live ? ' · live delay +' + Math.round(alt.delayMin) + ' min' : '') + '</span>' : (live ? '<span class="al-sub">live delay +' + Math.round(alt.delayMin) + ' min</span>' : '');
      const d = document.createElement('div'); d.className = 'al-card' + (on ? ' on' : ''); d.dataset.i = i; d.tabIndex = 0;
      d.innerHTML = '<span class="al-l" style="--c:' + (COLORS[i] || '#9aa7c7') + '">' + alt.letter + '</span><span class="al-m"><b>' + fmtMin(eta) + '</b><i class="al-t ' + (live ? 'ok' : '') + '">' + etaLabel + '</i> · ' + alt.distKm.toFixed(1) + ' km<br>' + cong + model + '</span>' +
        (on ? '<span class="al-on">ACTIVE</span>' : '<span class="al-d"><b class="' + (dE < -0.5 ? 'good' : dE > 0.5 ? 'bad' : '') + '">' + sgn(dE, ' min') + '</b><small>' + sgn(dK, ' km', 1) + (dR != null ? ' · risk ' + sgn(dR, '') : '') + '</small><button type="button" data-go="' + i + '"' + (st.switching ? ' disabled' : '') + '>Switch</button></span>');
      list.appendChild(d);
    });
    if (st.alts.length < 2) list.insertAdjacentHTML('beforeend', '<div class="al-note">No alternative road found for this trip' + (st.status.mode === 'estimate' ? ' (offline estimate)' : '') + '.</div>');
    const foot = $('alFoot'), hasKey = !!getKey(), age = st.lastLive ? Math.round((Date.now() - st.lastLive) / 1000) : null;
    foot.innerHTML = '<div class="al-msg ' + (s.mode === 'error' ? 'err' : '') + '">' + esc(s.msg) + '</div>' +
      (s.mode === 'live' ? '<div class="al-msg">Traffic data refreshed ' + (age != null ? (age < 90 ? age + ' s' : Math.round(age / 60) + ' min') + ' ago' : '') + ' · updates every ' + Math.round(T.pollMs / 60000) + ' min</div>' : '');
    $('alKeyToggle').textContent = hasKey ? 'TomTom key set · change' : 'Enable live traffic (TomTom key)'; $('alKeyDel').style.display = hasKey ? '' : 'none';
    decorateStrip();
  }

  /* ---------- the route strip and dock get honest "data source" wording ---------------------------------------------------------------- */
  function decorateStrip() {
    const el = $('hydRoute'); if (!el || !el.innerHTML) return; el.querySelectorAll('.rs.rr').forEach((x) => x.remove()); const cur = activeAlt(), s = st.status;
    const live = cur && cur.traffic === 'live', typ = cur && cur.traffic === 'typical';
    const cell = document.createElement('div'); cell.className = 'rs rr';
    cell.innerHTML = '<small>Traffic data</small><b class="' + (live ? 'lv-low' : typ ? '' : 'lv-med') + '">' + (live ? 'Live' : typ ? 'Typical' : 'Modelled') + '</b><em>' + (live ? 'TomTom · ' + fmtMin(cur.trafficMin) + (cur.delayMin >= 1 ? ' (+' + Math.round(cur.delayMin) + ')' : '') : typ ? 'TomTom · ' + fmtMin(cur.trafficMin) : 'historical, not live') + '</em>';
    cell.title = s.msg; el.appendChild(cell);
  }

  /* ---------- wiring ------------------------------------------------------------------------------------------------------------------------ */
  H.on('alts', () => { render(); drawAlts(); });
  H.on('strip', decorateStrip);
  document.addEventListener('sc:result', () => { scheduleCompare(); render(); drawAlts(); });
  H.on('live', () => { st.lastLive = Date.now(); });
  setInterval(() => { if (!$('hydAlt') || $('hydAlt').classList.contains('hidden')) return; render(); }, 30000);
  H.reroute = { st, choose, poll: () => poll(true), compare, evaluate, fetchSet, overlap, summary: () => st, setKey: (k) => H.store.set('tomtomKey', k), render };
  function init() { inject(); place(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window.SC = window.SC || {});
