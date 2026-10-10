/* SmartCommute / Hyderabad — live user location and dynamic re-analysis
 *
 *  position sources   'gps'  navigator.geolocation.watchPosition
 *                     'manual' the user placed / dragged the blue dot (right-click -> "I am here")
 *                     'sim'  the demo drive that moves the dot along the current route
 *  when the user moves (and "live updates" are on, i.e. the route starts at "My location"):
 *      new road route me -> destination  ->  weather re-read if needed  ->  Monte Carlo engine (MATLAB or demo)
 *      -> ETA, arrival clock, congestion, weather impact, delay probability and risk score are redrawn.
 *  Throttled: >= liveMinMoveM metres moved and >= liveMinGapMs since the last analysis (or liveMaxGapMs while moving).      */
(function (SC) {
  'use strict';
  const H = SC.hyd, cfg = H.cfg, hav = SC.hav;
  const st = { me: null, watchId: null, mode: 'off', marker: null, acc: null, manual: false, follow: false, firstFix: true,
    live: { paused: false, busy: false, lastAt: 0, lastPos: null, wx: null, wxPos: null, wxAt: 0, count: 0, lastErr: 0 }, sim: { on: false, timer: 0, idx: 0, dist: 0, speed: 40, accel: 15 } };
  const pad2 = (n) => String(n).padStart(2, '0');
  const map = () => SC.map.getMap();

  const insideCity = () => !!(st.me && H.inBox(st.me.lat, st.me.lon));
  const setMode = (m) => { st.mode = m; H.emit('locmode', m); };

  /* ---------- marker ------------------------------------------------------------------------------------------ */
  function ensureMarker() {
    if (st.marker) return;
    const icon = L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="hyd-me" id="hydMe"><i class="ring"></i><i class="cone"></i><i class="dot"></i></div>' });
    st.marker = L.marker([st.me.lat, st.me.lon], { icon, zIndexOffset: 900, draggable: true, keyboard: false, title: 'You are here (drag to move)' }).addTo(map());
    st.marker.on('dragend', () => { const ll = st.marker.getLatLng(); stopWatch(); st.manual = true; setMode('manual'); update({ lat: ll.lat, lon: ll.lng, acc: 8, src: 'manual' }); });
    st.acc = L.circle([st.me.lat, st.me.lon], { radius: 30, interactive: false, className: 'hyd-acc', weight: 1, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.12 }).addTo(map());
  }
  function paint() {
    ensureMarker(); const ll = [st.me.lat, st.me.lon], real = st.me.src === 'gps'; st.marker.setLatLng(ll); st.acc.setLatLng(ll);
    st.acc.setRadius(Math.max(st.me.acc || 20, 3));                       // the TRUE reported accuracy radius, never capped or invented
    st.acc.setStyle({ opacity: real ? 1 : 0, fillOpacity: real ? 0.12 : 0 });
    const el = document.getElementById('hydMe'); if (el) { el.classList.toggle('not-gps', !real); const moving = st.me.heading != null && !isNaN(st.me.heading) && (st.me.speed == null || st.me.speed > 0.8); el.classList.toggle('has-heading', !!moving); if (moving) el.style.setProperty('--h', st.me.heading + 'deg'); }
  }

  /* ---------- position updates ------------------------------------------------------------------------------------- */
  function update(p) {
    const prev = st.me; st.me = Object.assign({ ts: Date.now() }, p);
    if (st.me.heading == null && prev && hav([prev.lat, prev.lon], [p.lat, p.lon]) > 0.005) {          // derive heading from movement
      const dy = p.lat - prev.lat, dx = (p.lon - prev.lon) * Math.cos(p.lat * Math.PI / 180); st.me.heading = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; st.me.speed = st.me.speed == null ? 2 : st.me.speed;
    }
    if (!insideCity()) { paint(); if (st.firstFix) { st.firstFix = false; const km = hav(cfg.center, [p.lat, p.lon]); SC.ui.toast('Your position is ' + Math.round(km) + ' km from Hyderabad. SmartCommute covers Hyderabad only, so live route updates are off. Right-click the map → “I am here” to place yourself in the city.', 'err', 8000); } H.emit('loc', st.me); return; }
    paint();
    if (st.firstFix) { st.firstFix = false; if (!(SC.state && SC.state.res)) map().flyTo([p.lat, p.lon], Math.max(map().getZoom(), 15), { duration: 1.1 }); }
    else if (st.follow) map().panTo([p.lat, p.lon], { animate: true, duration: 0.6, noMoveStart: true });
    H.emit('loc', st.me); liveCheck();
  }

  /* ---------- GPS watch ----------------------------------------------------------------------------------------------- */
  function onFix(pos) {
    if (st.manual || st.sim.on) return; const c = pos.coords;
    if (st.me && st.me.src === 'gps' && pos.timestamp && st.me.fixTs && pos.timestamp < st.me.fixTs) return;      // out-of-order fix: ignore
    if (!isFinite(c.latitude) || !isFinite(c.longitude)) return;
    if (st.mode !== 'gps') setMode('gps');
    st.gotFix = true;
    update({ lat: c.latitude, lon: c.longitude, acc: c.accuracy, heading: c.heading, speed: c.speed, src: 'gps', fixTs: pos.timestamp || Date.now() });
    if (c.accuracy > cfg.liveMaxAccM && !st.warnedAcc) { st.warnedAcc = true; SC.ui.toast('Your device reports only ±' + (c.accuracy >= 1000 ? (c.accuracy / 1000).toFixed(1) + ' km' : Math.round(c.accuracy) + ' m') + ' accuracy (Wi-Fi / network based, no GPS signal). The circle shows the real uncertainty; live route updates need ±' + cfg.liveMaxAccM + ' m or better.', 'err', 8000); }
    if (c.accuracy <= cfg.liveMaxAccM) st.warnedAcc = false;
  }
  let errToast = 0;
  function onErr(e) {
    if (e.code === 1) {                                                 // permission denied: fatal, stop watching
      stopWatch(); setMode('denied');
      SC.ui.toast(window.isSecureContext === false
        ? 'The browser blocks location on this address because it is not secure. Geolocation only works on HTTPS pages or on http://localhost / http://127.0.0.1 (or a file opened in Chrome/Edge). Open the app that way.'
        : 'Location permission was denied. Allow it in the browser’s site settings (lock icon next to the address) and press the location button again. The MATLAB window’s embedded browser often blocks it: open app/web/index.html in Chrome or Edge for real GPS, or right-click the map → “I am here” (that is a position you choose, not GPS).', 'err', 11000);
      return;
    }
    if (e.code === 3 && !st.me && st.hi) {                              // desktop: high-accuracy request timed out -> retry with network location
      stopWatch(); st.hi = false; setMode('acquiring'); watch(false); return;
    }
    // code 2 (position unavailable) and 3 (timeout) are usually momentary: keep the watch alive, the next fix recovers
    if (!st.me) {
      setMode('error');
      if (Date.now() - errToast > 30000) { errToast = Date.now(); SC.ui.toast(e.code === 3 ? 'No position fix yet (timeout). Check that location services / GPS are on and you have a sky or Wi-Fi view. Still trying.' : 'The device cannot determine its position right now (' + (e.message || 'position unavailable') + '). Still trying.', 'err', 7000); }
    }
  }
  function stopWatch() { if (st.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(st.watchId); st.watchId = null; }
  function start() {
    st.manual = false; stopSim(); st.firstFix = !st.me || st.mode === 'denied';
    if (!navigator.geolocation) { setMode('error'); SC.ui.toast('This browser has no geolocation API. Right-click the map → “I am here” to place yourself (a position you choose, not GPS).', 'err', 7000); return; }
    if (window.isSecureContext === false) { setMode('error'); SC.ui.toast('Location needs a secure page: HTTPS, or http://localhost / http://127.0.0.1 (or a local file in Chrome/Edge). This page is served insecurely, so the browser will not give out your position.', 'err', 11000); return; }
    if (st.watchId != null) return;
    setMode('acquiring'); st.hi = true; st.gotFix = false; watch(true); watchPermission();
  }
  function watch(hi) {
    st.watchId = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: hi, maximumAge: hi ? 2000 : 15000, timeout: hi ? 12000 : 30000 });
  }
  let permWatched = false;
  function watchPermission() {                                      // react when the user changes the site permission while the app is open
    if (permWatched || !navigator.permissions || !navigator.permissions.query) return; permWatched = true;
    navigator.permissions.query({ name: 'geolocation' }).then((ps) => {
      ps.onchange = () => {
        if (ps.state === 'granted' && (st.mode === 'denied' || st.mode === 'error') && st.watchId == null) { start(); }
        else if (ps.state === 'denied' && st.mode !== 'off') { stopWatch(); setMode('denied'); SC.ui.toast('Location permission was turned off for this site.', 'err', 5000); }
      };
    }).catch(() => { permWatched = false; });
  }
  function stop() { stopWatch(); stopSim(); st.follow = false; st.manual = false; setMode('off'); if (st.marker) { map().removeLayer(st.marker); map().removeLayer(st.acc); st.marker = st.acc = null; } st.me = null; H.emit('loc', null); }
  function setManual(lat, lon) {
    if (!H.inBox(lat, lon)) { SC.ui.toast('That point is outside Hyderabad — SmartCommute covers Hyderabad only.', 'err'); return; }
    stopWatch(); stopSim(); st.manual = true; setMode('manual'); st.firstFix = false; update({ lat, lon, acc: 8, src: 'manual' });
  }
  /* button cycle: off -> locate -> follow -> off */
  function cycle() {
    if (st.mode === 'off' || st.mode === 'denied' || st.mode === 'error') { start(); return; }
    if (st.me && insideCity() && !st.follow) { st.follow = true; map().flyTo([st.me.lat, st.me.lon], Math.max(map().getZoom(), 16), { duration: 0.8 }); SC.ui.toast('Following your location. Click again to stop.', '', 2200); H.emit('locmode', st.mode); return; }
    stop(); SC.ui.toast('Location tracking stopped.', '', 1800);
  }

  /* ---------- live re-analysis ------------------------------------------------------------------------------------------ */
  const isLiveRoute = () => !!(SC.state && SC.state.from && SC.state.from.name === 'My location' && SC.state.to && SC.state.res);
  function liveCheck() {
    const L_ = st.live; if (L_.paused || L_.busy || !insideCity() || !isLiveRoute() || SC.state.busy) return;
    if (st.me.src === 'gps' && (st.me.acc || 0) > cfg.liveMaxAccM) return;                 // too inaccurate: movement would be noise
    const moved = L_.lastPos ? hav(L_.lastPos, [st.me.lat, st.me.lon]) * 1000 : 1e9, gap = Date.now() - L_.lastAt, minGap = st.sim.on ? 8000 : cfg.liveMinGapMs;
    const thr = Math.max(cfg.liveMinMoveM, 0.5 * (st.me.acc || 0));                          // never react to GPS jitter smaller than the fix accuracy
    if ((moved >= thr && gap >= minGap) || (moved >= Math.max(40, st.me.acc || 0) && gap >= cfg.liveMaxGapMs)) refresh('moved ' + Math.round(moved) + ' m');
  }
  async function refresh(reason) {
    const L_ = st.live, S = SC.state; if (L_.busy || !insideCity() || !S.to || S.busy) return;
    L_.busy = true; H.emit('liveBusy', true);
    try {
      const me = { name: 'My location', lat: st.me.lat, lon: st.me.lon }, now = new Date();
      const remaining = hav([me.lat, me.lon], [S.to.lat, S.to.lon]);
      if (remaining < 0.08) { SC.ui.toast('You have arrived at ' + (S.to.name || 'your destination') + '.', 'ok', 5000); stopSim(); L_.lastAt = Date.now(); L_.lastPos = [me.lat, me.lon]; return; }
      const route = await SC.services.route(me, S.to);
      const mid = route.coords[Math.floor(route.coords.length / 2)], ds = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
      if (!L_.wx || Date.now() - L_.wxAt > 1800000 || hav(L_.wxPos, mid) > 3) { L_.wx = await SC.services.weather(mid[0], mid[1], ds, now.getHours()); L_.wxPos = mid; L_.wxAt = Date.now(); }
      S.weather = L_.wx; S.route = route; S.customBudget = null;
      document.getElementById('inDate').value = ds; document.getElementById('inTime').value = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
      const keep = SC.ui.store.get('last.from', null); SC.ui.setPoint('from', me, { silent: true }); SC.ui.store.set('last.from', keep);   // do not remember "My location" as the next start
      const w = SC.ui.effectiveWeather(), req = SC.ui.buildReq(w); req.n = Math.min(req.n, 4000);
      const res = await SC.engine.analyze(req);
      SC.map.showRoute(route, { quiet: true }); SC.map.showResult(res, w, { quiet: true });
      if (S.cardOpen) SC.ui.showCard(res, false, { noFit: true, live: true });
      else { S.res = res; document.dispatchEvent(new CustomEvent('sc:result', { detail: { res, route, weather: w, live: true } })); }
      document.getElementById('stale').classList.add('hidden');
      L_.lastAt = Date.now(); L_.lastPos = [me.lat, me.lon]; L_.count++; H.emit('live', { reason, count: L_.count, ts: L_.lastAt });
    } catch (e) {
      if (Date.now() - L_.lastErr > 60000) { L_.lastErr = Date.now(); SC.ui.toast('Live update failed: ' + (e && e.message || e), 'err', 4000); }
    } finally { L_.busy = false; H.emit('liveBusy', false); }
  }
  function setPaused(v) { st.live.paused = v; H.emit('livepause', v); if (!v) liveCheck(); }

  /* ---------- demo drive: moves the dot along the current route so the live recalculation can be shown without GPS -------- */
  function startSim() {
    const S = SC.state; if (!S.route || !S.route.coords || S.route.coords.length < 2) { SC.ui.toast('Analyze a route first, then start the simulated drive.', 'err'); return; }
    stopWatch(); st.manual = false; stopSim();
    const coords = S.route.coords.slice(), cum = [0]; for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]));
    const total = cum[cum.length - 1], sm = st.sim; sm.on = true; sm.dist = 0; setMode('sim'); st.firstFix = false;
    // the trip must start at "My location": move the start pin to the first point of the route
    const a = coords[0]; update({ lat: a[0], lon: a[1], acc: 6, src: 'sim' });
    const keep = SC.ui.store.get('last.from', null); SC.ui.setPoint('from', { name: 'My location', lat: a[0], lon: a[1] }, { silent: true }); SC.ui.store.set('last.from', keep);
    st.live.lastAt = Date.now(); st.live.lastPos = [a[0], a[1]]; st.live.paused = false; H.emit('livepause', false);
    SC.ui.toast('SIMULATION (not your GPS): the dot follows the route at ' + sm.speed + ' km/h × ' + sm.accel + ' (time-compressed) and the ETA and risk update as it moves.', '', 5200);
    sm.timer = setInterval(() => {
      sm.dist += sm.speed * sm.accel / 3600;                         // km per real second
      if (sm.dist >= total) { sm.dist = total; }
      let j = 1; while (j < cum.length - 1 && cum[j] < sm.dist) j++;
      const f = (sm.dist - cum[j - 1]) / Math.max(cum[j] - cum[j - 1], 1e-9), p0 = coords[j - 1], p1 = coords[j];
      update({ lat: p0[0] + (p1[0] - p0[0]) * f, lon: p0[1] + (p1[1] - p0[1]) * f, acc: 6, speed: sm.speed / 3.6, src: 'sim' });
      if (sm.dist >= total) stopSim();
    }, 1000);
    H.emit('simstate', true);
  }
  function stopSim() { if (st.sim.timer) clearInterval(st.sim.timer); st.sim.timer = 0; if (st.sim.on) { st.sim.on = false; if (st.mode === 'sim') setMode('manual'), st.manual = true; H.emit('simstate', false); } }

  /* an analysis that starts at "My location" switches live updates on */
  document.addEventListener('sc:result', (e) => { if (e.detail && !e.detail.live && SC.state.from && SC.state.from.name === 'My location' && st.me) { st.live.lastAt = Date.now(); st.live.lastPos = [st.me.lat, st.me.lon]; st.live.paused = false; } });

  H.loc = { start, stop, cycle, setManual, startSim, stopSim, refresh, setPaused, insideCity,
    get me() { return st.me; }, get mode() { return st.mode; }, get follow() { return st.follow; }, get simOn() { return st.sim.on; }, get paused() { return st.live.paused; }, get liveCount() { return st.live.count; }, isLiveRoute,
    useAsStart() {                                                   // planner shortcut: start from my live position
      if (!st.me || st.me.src !== 'gps' && st.mode !== 'manual' && st.mode !== 'sim') {
        start(); SC.ui.toast('Finding your location…', '', 2200);
        const once = (e) => { const p = e.detail; if (p && p.src === 'gps' && insideCity()) { document.removeEventListener('hyd:loc', once); applyStart(); } };
        document.addEventListener('hyd:loc', once); return;
      }
      applyStart();
    } };
  function applyStart() {
    if (!insideCity()) { SC.ui.toast('Your location is outside Hyderabad.', 'err'); return; }
    const keep = SC.ui.store.get('last.from', null); SC.ui.setPoint('from', { name: 'My location', lat: st.me.lat, lon: st.me.lon }, { silent: true, fly: !SC.state.res }); SC.ui.store.set('last.from', keep);
    st.live.paused = false; H.emit('livepause', false);
    if (SC.state.to) SC.ui.toast('Start set to your location. Press Analyze route — the result will then update as you move.', 'ok', 4200);
    else SC.ui.toast('Start set to your location. Now choose a destination.', 'ok', 3200);
  }
})(window.SC = window.SC || {});
