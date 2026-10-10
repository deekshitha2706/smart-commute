/* SmartCommute — map: Leaflet base, route / traffic / risk / zones / heat layers, weather + particle FX canvas */
(function (SC) {
  'use strict';
  const { hav } = SC;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const U = () => SC.util;

  /* ---------- tiles ------------------------------------------------------------------------- */
  const ATTR_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  function tileSets(style, theme) {
    if (SC.hydTiles) return SC.hydTiles(style, theme);          // Hyderabad add-on: provider registry with fallbacks (js/hyd/tiles.js)
    const carto = (v) => L.tileLayer('https://{s}.basemaps.cartocdn.com/' + v + '/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, attribution: ATTR_OSM + ' &copy; <a href="https://carto.com/attributions">CARTO</a>' });
    const esri = () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' });
    if (style === 'satellite') return [esri()];
    if (style === 'terrain') return [L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { subdomains: 'abc', maxZoom: 17, attribution: 'Map data: ' + ATTR_OSM + ', SRTM | Style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>' })];
    if (style === 'hybrid') { const lab = carto(theme === 'dark' ? 'dark_only_labels' : 'light_only_labels'); lab.options.pane = 'labelsPane'; return [esri(), lab]; }
    return [carto(theme === 'dark' ? 'dark_all' : 'rastertiles/voyager')];
  }

  /* ---------- heat layer (own canvas implementation) ------------------------------------------------ */
  const PALETTE = (function () {
    const c = document.createElement('canvas'); c.width = 1; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0.0, 'rgba(34,211,127,0)'); gr.addColorStop(0.18, 'rgba(34,211,127,.55)'); gr.addColorStop(0.42, 'rgba(251,197,49,.85)'); gr.addColorStop(0.7, 'rgba(240,69,76,.92)'); gr.addColorStop(1, 'rgba(150,20,40,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 1, 256); return g.getImageData(0, 0, 1, 256).data;
  })();
  const HeatLayer = L.Layer.extend({
    initialize(pts) { this._pts = pts || []; },
    setPoints(p) { this._pts = p; if (this._map) this._draw(); },
    onAdd(map) {
      this._map = map; this._c = L.DomUtil.create('canvas', 'sc-heat'); this._c.style.pointerEvents = 'none'; this._c.style.transition = 'opacity .3s';
      map.getPane('heatPane').appendChild(this._c); map.on('moveend resize', this._reset, this); map.on('zoomstart', this._hide, this); map.on('zoomend', this._reset, this); this._reset();
    },
    onRemove(map) { L.DomUtil.remove(this._c); map.off('moveend resize', this._reset, this); map.off('zoomstart', this._hide, this); map.off('zoomend', this._reset, this); },
    _hide() { this._c.style.opacity = 0; },
    _reset() { const s = this._map.getSize(); this._c.width = s.x; this._c.height = s.y; L.DomUtil.setPosition(this._c, this._map.containerPointToLayerPoint([0, 0])); this._draw(); this._c.style.opacity = 1; },
    _draw() {
      const s = this._map.getSize(), c = this._c.getContext('2d'); c.clearRect(0, 0, s.x, s.y); if (!this._pts.length) return;
      const r = clamp(18 + (this._map.getZoom() - 10) * 5, 18, 54);
      this._pts.forEach(([lat, lon, w]) => { const p = this._map.latLngToContainerPoint([lat, lon]); if (p.x < -r || p.y < -r || p.x > s.x + r || p.y > s.y + r) return;
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, 'rgba(0,0,0,' + (0.2 + 0.5 * w) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r, 0, 6.3); c.fill(); });
      const img = c.getImageData(0, 0, s.x, s.y), d = img.data;
      for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a) { const k = a * 4; d[i - 3] = PALETTE[k]; d[i - 2] = PALETTE[k + 1]; d[i - 1] = PALETTE[k + 2]; d[i] = Math.min(255, PALETTE[k + 3] * 0.82); } }
      c.putImageData(img, 0, 0);
    }
  });

  /* ---------- weather icons (inline SVG) ----------------------------------------------------------------- */
  const WX = {
    Clear: '<svg viewBox="0 0 24 24" fill="none" stroke="#fbc531" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="#fbc531" fill-opacity=".35"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>',
    Cloudy: '<svg viewBox="0 0 24 24" fill="none" stroke="#a9b8d8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z" fill="#a9b8d8" fill-opacity=".25"/></svg>',
    Rain: '<svg viewBox="0 0 24 24" fill="none" stroke="#5ea8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 6.5 4 4 0 0 1 17.5 15z" fill="#5ea8ff" fill-opacity=".22"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/></svg>',
    Fog: '<svg viewBox="0 0 24 24" fill="none" stroke="#b8c4dd" stroke-width="1.9" stroke-linecap="round"><path d="M4 9h16M3 13h14M6 17h14"/></svg>'
  };
  SC.wxIcon = (c) => WX[c] || WX.Clear;

  /* ---------- module state ------------------------------------------------------------------------------------- */
  let map, tileGroup = [], style = 'road', theme = 'dark', cb = {}, loading = false, pickKind = null;
  const pts = { from: null, to: null }, markers = {};
  const flags = { traffic: true, zones: true, risk: false, heat: false, weather: true, live: true };
  let R = null;                          // current route {coords, cum, total, N, segs:[{v,f,color}], ...}
  const grp = { base: null, traffic: null, risk: null, zones: null, flow: null, wx: null };
  let heat = null, wx = { cond: 'Clear', rain: 0, vis: 10 }, cardOpen = false;

  function pinSVG(color, letter) {
    return '<div class="pin drop"><svg viewBox="0 0 38 46"><defs><linearGradient id="pg' + letter + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + color[0] + '"/><stop offset="1" stop-color="' + color[1] + '"/></linearGradient></defs>' +
      '<path d="M19 45C19 45 35 30 35 17.5A16 16 0 0 0 3 17.5C3 30 19 45 19 45z" fill="url(#pg' + letter + ')" stroke="rgba(255,255,255,.9)" stroke-width="2"/><circle cx="19" cy="17.5" r="7.2" fill="#fff"/>' +
      '<text x="19" y="21.4" text-anchor="middle" font-size="11" font-weight="800" font-family="Inter,Segoe UI,sans-serif" fill="' + color[1] + '">' + letter + '</text></svg></div>';
  }

  /* ---------- init ---------------------------------------------------------------------------------------------------- */
  function init(callbacks) {
    cb = callbacks || {};
    map = L.map('map', { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, worldCopyJump: true, minZoom: 3 }).setView(SC.hyd ? SC.hyd.cfg.center : [12.9716, 77.5946], 12);
    map.createPane('labelsPane').style.zIndex = 260; map.getPane('labelsPane').style.pointerEvents = 'none';
    map.createPane('heatPane').style.zIndex = 405; map.createPane('halo').style.zIndex = 410; map.createPane('seg').style.zIndex = 420;
    map.createPane('flow').style.zIndex = 425; map.getPane('flow').style.pointerEvents = 'none'; map.getPane('halo').style.pointerEvents = 'none';
    map.createPane('zones').style.zIndex = 412; map.getPane('zones').style.pointerEvents = 'none';
    map.attributionControl.setPrefix(false);
    map.on('click', (e) => { if (pickKind && cb.onPick) { const k = pickKind; cancelPick(); cb.onPick(k, e.latlng); } });
    map.on('contextmenu', (e) => cb.onContext && cb.onContext(e.containerPoint, e.latlng));
    map.on('movestart', () => cb.onMoveStart && cb.onMoveStart());
    ['base', 'traffic', 'risk', 'zones', 'flow', 'wx'].forEach((k) => { grp[k] = L.layerGroup().addTo(map); });
    heat = new HeatLayer([]);
    setStyle(style); fxInit(); requestAnimationFrame(fxLoop);
    window.addEventListener('resize', () => { map.invalidateSize(); fxResize(); });
    return map;
  }

  function setStyle(s) {
    style = s; tileGroup.forEach((t) => map.removeLayer(t)); tileGroup = tileSets(style, theme); tileGroup.forEach((t) => t.addTo(map));
    map.getPane('tilePane').classList.toggle('sat', style === 'satellite' || style === 'hybrid');
  }
  function setTheme(t) { theme = t; setStyle(style); }

  /* ---------- markers ------------------------------------------------------------------------------------------------------- */
  function setPoint(kind, p) {
    pts[kind] = p; if (!p) { if (markers[kind]) { map.removeLayer(markers[kind]); delete markers[kind]; } return; }
    const color = kind === 'from' ? ['#4ff0a5', '#12a864'] : ['#5ceaff', '#2a7bff'], letter = kind === 'from' ? 'A' : 'B';
    if (markers[kind]) { markers[kind].setLatLng([p.lat, p.lon]); return; }
    const m = L.marker([p.lat, p.lon], { draggable: true, autoPan: true, icon: L.divIcon({ className: '', html: pinSVG(color, letter), iconSize: [38, 46], iconAnchor: [19, 44] }), zIndexOffset: kind === 'to' ? 600 : 500 }).addTo(map);
    m.on('dragend', () => { const ll = m.getLatLng(); cb.onMarkerDrag && cb.onMarkerDrag(kind, ll); });
    markers[kind] = m;
  }
  function startPick(kind) { pickKind = kind; document.body.classList.add('picking'); }
  function cancelPick() { pickKind = null; document.body.classList.remove('picking'); }

  /* ---------- route geometry ---------------------------------------------------------------------------------------------------- */
  function buildGeom(coords) {
    const cum = [0]; for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]));
    const total = cum[cum.length - 1] || 1e-6; return { coords, cum: cum.map((d) => d / total), totalKm: total };
  }
  function pointAt(g, s) {
    s = clamp(s, 0, 1); let lo = 0, hi = g.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g.cum[m] <= s) lo = m; else hi = m; }
    const span = g.cum[hi] - g.cum[lo] || 1e-9, f = (s - g.cum[lo]) / span, a = g.coords[lo], b = g.coords[hi]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  function slice(g, s0, s1) {
    const out = [pointAt(g, s0)]; for (let i = 0; i < g.cum.length; i++) if (g.cum[i] > s0 && g.cum[i] < s1) out.push(g.coords[i]); out.push(pointAt(g, s1)); return out;
  }
  function seededRand(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function intensityProfile(N, seed) {
    const r = seededRand(seed), ph = [r() * 6, r() * 6, r() * 6], h1 = 0.2 + r() * 0.6, h2 = 0.2 + r() * 0.6, f = [];
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1), noise = 0.5 + 0.28 * Math.sin(s * 9 + ph[0]) + 0.17 * Math.sin(s * 23 + ph[1]) + 0.1 * Math.sin(s * 51 + ph[2]);
      const ends = 0.6 * Math.exp(-Math.pow(s / 0.1, 2)) + 0.9 * Math.exp(-Math.pow((1 - s) / 0.14, 2));
      const hot = 1.1 * Math.exp(-Math.pow((s - h1) / 0.06, 2)) + 0.8 * Math.exp(-Math.pow((s - h2) / 0.05, 2));
      f.push(Math.max(0.12, noise * 0.7 + ends + hot));
    }
    const m = f.reduce((a, b) => a + b, 0) / N; return f.map((v) => v / m);
  }
  const segColor = (v) => (v < 0.28 ? '#22d37f' : v < 0.5 ? '#fbc531' : v < 0.75 ? '#f0454c' : '#a3202f');
  const segName = (v) => (v < 0.28 ? 'Light' : v < 0.5 ? 'Moderate' : v < 0.75 ? 'Heavy' : 'Severe');

  /* ---------- draw: neutral route (before analysis) ------------------------------------------------------------------------------------ */
  function drawAnim(poly, ms) {
    const el = poly.getElement && poly.getElement(); if (!el || !el.getTotalLength) return; const len = el.getTotalLength();
    el.style.setProperty('--len', len); el.style.strokeDasharray = len; el.style.animationDuration = (ms || 1500) + 'ms'; el.classList.add('draw');
    el.addEventListener('animationend', () => { el.classList.remove('draw'); el.style.strokeDasharray = ''; }, { once: true });
  }
  function clearRoute() {
    Object.values(grp).forEach((g) => g.clearLayers()); if (heat && map.hasLayer(heat)) map.removeLayer(heat); R = null;
  }
  function showRoute(rt, opts) {
    const quiet = !!(opts && opts.quiet);                     // quiet = live update: no draw-in animation, no camera move
    clearRoute(); const g = buildGeom(rt.coords); R = Object.assign(g, { route: rt, N: 0, segs: [], ready: false, base: 0 });
    const glow = L.polyline(rt.coords, { pane: 'halo', color: '#22e3ff', weight: 18, opacity: 0.22, lineCap: 'round', lineJoin: 'round' }).addTo(grp.base);
    const casing = L.polyline(rt.coords, { pane: 'halo', color: '#050a18', weight: 10, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(grp.base);
    const line = L.polyline(rt.coords, { pane: 'seg', color: '#22e3ff', weight: 5.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(grp.base);
    if (!quiet) [glow, casing, line].forEach((p) => drawAnim(p, 1500)); R.neutral = line; if (!quiet) fit();
  }

  /* ---------- draw: analysed route (traffic, risk, zones, heat, weather) -------------------------------------------------------------------- */
  function showResult(res, weather, extra) {
    if (!R) return; ['traffic', 'risk', 'zones', 'flow', 'wx'].forEach((k) => grp[k].clearLayers());
    const rt = R.route, ci = res.congestion.index, b = clamp(ci / 45, 0.05, 1), N = clamp(Math.round(R.totalKm * 5), 50, 150);
    const seed = Math.round(R.totalKm * 1000 + R.coords[0][0] * 1e4 + R.coords[0][1] * 1e3); const f = intensityProfile(N, seed);
    const freeSpeed = R.totalKm / (res.free / 60);
    R.N = N; R.base = b; R.segs = f.map((fi, j) => { const v = clamp(b * fi, 0, 1); return { f: fi, v, color: segColor(v), t: clamp((res.risk.score / 100) * 1.4 * (0.55 + 0.45 * fi), 0, 1) }; });
    const dly = Math.min(1.3, 0.45 + b);
    R.segs.forEach((sg, j) => {
      const s0 = j / N, s1 = (j + 1) / N, pts_ = slice(R, s0, s1);
      const p = L.polyline(pts_, { pane: 'seg', color: sg.color, weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round', className: (extra && extra.quiet) ? '' : 'seg-in' }).addTo(grp.traffic);
      if (p.getElement()) p.getElement().style.animationDelay = (s0 * 1.4) + 's';
      const h = L.polyline(pts_, { pane: 'halo', color: U().riskColor(sg.t), weight: 24, opacity: 0.3, lineCap: 'round', lineJoin: 'round' }).addTo(grp.risk);
    });
    const flow = L.polyline(R.coords, { pane: 'flow', color: '#ffffff', weight: 2.2, opacity: 0.85, dashArray: '1 14', lineCap: 'round', lineJoin: 'round', className: 'flow' }).addTo(grp.flow);
    if (flow.getElement()) flow.getElement().style.animationDuration = (0.9 + 2.2 * b) + 's';
    if (R.neutral) { grp.base.removeLayer(R.neutral); R.neutral = null; }
    // congestion zones = local maxima of intensity
    const order = R.segs.map((sg, j) => [sg.v, j]).sort((a, c) => c[0] - a[0]), picked = [];
    for (const [v, j] of order) { if (picked.length >= 3 || v < 0.16) break; if (j < N * 0.07 || j > N * 0.93) continue; if (picked.every((q) => Math.abs(q - j) > N * 0.14)) picked.push(j); }
    R.zones = picked.map((j) => { const sg = R.segs[j], c = pointAt(R, (j + 0.5) / N), spd = Math.max(5, Math.round(freeSpeed / (1 + 1.6 * sg.v * (res.mean / res.free)))); return { j, c, v: sg.v, color: sg.color, spd }; });
    R.zones.forEach((z) => {
      L.circle(z.c, { pane: 'zones', radius: 350 + 900 * z.v * Math.min(1, R.totalKm / 8 + 0.35), color: z.color, weight: 1.6, opacity: 0.9, fillColor: z.color, fillOpacity: 0.16, className: 'zone' }).addTo(grp.zones);
      L.marker(z.c, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="hot-label" style="background:' + (z.v < 0.5 ? 'rgba(160,110,10,.92)' : 'rgba(163,32,47,.9)') + '">' + segName(z.v) + ' · ' + z.spd + ' km/h</div>', iconSize: [0, 0], iconAnchor: [-12, 8] }) }).addTo(grp.zones);
    });
    // heat points
    const hp = []; R.segs.forEach((sg, j) => { const c = pointAt(R, (j + 0.5) / N); hp.push([c[0], c[1], sg.v]); const k = 2; for (let q = 0; q < k; q++) { const a = (j * 2.399 + q * 3.1) % 6.28, d = 0.0013 + 0.0012 * ((j * 7 + q * 3) % 5); hp.push([c[0] + Math.sin(a) * d, c[1] + Math.cos(a) * d, sg.v * 0.7]); } });
    heat.setPoints(hp);
    // weather chip at mid-route
    wx = { cond: weather.cond, rain: weather.rainMm || 0, vis: weather.visKm == null ? 10 : weather.visKm };
    const mid = pointAt(R, 0.5), t = weather.tempC == null ? '' : Math.round(weather.tempC) + '° · ';
    L.marker(mid, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="wx-chip">' + SC.wxIcon(weather.cond) + '<span>' + t + weather.cond + '</span></div>', iconSize: [0, 0], iconAnchor: [-14, 38] }) }).addTo(grp.wx);
    R.ready = true; R.res = res; applyLayers(); fxReset();
  }

  function applyLayers() {
    const on = (g, v) => { if (v && !map.hasLayer(g)) map.addLayer(g); else if (!v && map.hasLayer(g)) map.removeLayer(g); };
    on(grp.traffic, flags.traffic); on(grp.flow, flags.traffic); on(grp.risk, flags.risk); on(grp.zones, flags.zones); on(grp.wx, flags.weather);
    if (R && R.ready) { if (flags.heat && !map.hasLayer(heat)) heat.addTo(map); if (!flags.heat && map.hasLayer(heat)) map.removeLayer(heat); }
    // before analysis the neutral route stays visible even if traffic is off
  }
  function setLayer(name, v) { flags[name] = v; applyLayers(); }

  /* ---------- camera ----------------------------------------------------------------------------------------------------------------- */
  function fit(opts) {
    opts = opts || {}; const W = window.innerWidth, narrow = W < 900;
    const pl = narrow ? 20 : 390, pr = narrow ? 20 : (cardOpen ? 440 : 70), pt = narrow ? 150 : 96, pb = narrow ? (cardOpen ? window.innerHeight * 0.5 : 90) : 96;
    let bounds = null;
    if (R && R.coords) bounds = L.latLngBounds(R.coords); else if (pts.from && pts.to) bounds = L.latLngBounds([[pts.from.lat, pts.from.lon], [pts.to.lat, pts.to.lon]]);
    if (!bounds) return; map.fitBounds(bounds, { paddingTopLeft: [pl, pt], paddingBottomRight: [pr, pb], maxZoom: 16, animate: opts.animate !== false, duration: 1.1 });
  }
  const setCardOpen = (v) => { cardOpen = v; };
  const flyTo = (lat, lon, z) => map.flyTo([lat, lon], z || 14, { duration: 1.2 });
  const zoom = (d) => map.zoomIn(d);
  const setLoading = (v) => { loading = v; };

  /* ---------- FX canvas: weather, particles, vehicle ---------------------------------------------------------------------------------------- */
  let fxc, fxx, FW = 0, FH = 0, DPR = 1, rain = [], blobs = [], clouds = [], parts = [], veh = { s: 0 }, last = 0, tick = 0;
  function fxInit() { fxc = document.getElementById('fx'); fxx = fxc.getContext('2d'); fxResize(); }
  function fxResize() { DPR = window.devicePixelRatio || 1; FW = window.innerWidth; FH = window.innerHeight; fxc.width = FW * DPR; fxc.height = FH * DPR; fxReset(); }
  function fxReset() {
    rain = []; const n = Math.round(clamp(110 + wx.rain * 45, 110, 420)); for (let i = 0; i < n; i++) rain.push({ x: Math.random() * FW, y: Math.random() * FH, l: 10 + Math.random() * 16, v: 700 + Math.random() * 500, a: 0.18 + Math.random() * 0.3 });
    blobs = []; for (let i = 0; i < 7; i++) blobs.push({ x: Math.random() * FW, y: Math.random() * FH, r: 220 + Math.random() * 260, vx: 6 + Math.random() * 12, a: 0.5 + Math.random() * 0.5 });
    clouds = []; for (let i = 0; i < 6; i++) clouds.push({ x: Math.random() * FW, y: Math.random() * FH, w: 260 + Math.random() * 300, h: 90 + Math.random() * 70, vx: 8 + Math.random() * 10 });
    parts = []; for (let i = 0; i < 30; i++) parts.push({ s: Math.random(), spd: 0.045 + Math.random() * 0.05, r: 1.7 + Math.random() * 1.8, a: 0.55 + Math.random() * 0.45 });
  }
  function fxLoop(t) {
    requestAnimationFrame(fxLoop); const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t; tick += dt;
    fxx.setTransform(DPR, 0, 0, DPR, 0, 0); fxx.clearRect(0, 0, FW, FH);
    if (!R || !R.ready) { if (loading && R) drawScan(dt); return; }
    if (flags.weather) drawWeather(dt);
    if (flags.live && flags.traffic) drawFlow(dt);
  }
  function drawWeather(dt) {
    const c = fxx, dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (wx.cond === 'Rain') {
      const sh = c.createLinearGradient(0, 0, 0, FH); sh.addColorStop(0, 'rgba(8,16,40,' + (dark ? 0.2 : 0.1) + ')'); sh.addColorStop(1, 'rgba(8,16,40,' + (dark ? 0.08 : 0.04) + ')'); c.fillStyle = sh; c.fillRect(0, 0, FW, FH);
      c.lineWidth = 1.2; c.lineCap = 'round'; const k = 0.28;
      rain.forEach((d) => { d.y += d.v * dt; d.x -= d.v * dt * k; if (d.y > FH + 20 || d.x < -20) { d.y = -20; d.x = Math.random() * (FW + 200); }
        c.strokeStyle = (dark ? 'rgba(175,205,255,' : 'rgba(55,95,170,') + d.a + ')'; c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x + d.l * k, d.y - d.l); c.stroke(); });
    } else if (wx.cond === 'Fog') {
      const veil = clamp((6 - wx.vis) / 8, 0.1, 0.4); c.fillStyle = (dark ? 'rgba(190,205,230,' : 'rgba(235,240,250,') + veil * 0.5 + ')'; c.fillRect(0, 0, FW, FH);
      blobs.forEach((b) => { b.x += b.vx * dt; if (b.x - b.r > FW) b.x = -b.r; const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r); const al = (dark ? 0.2 : 0.38) * b.a * (1 + veil);
        g.addColorStop(0, (dark ? 'rgba(210,222,245,' : 'rgba(250,252,255,') + al + ')'); g.addColorStop(1, 'rgba(210,222,245,0)'); c.fillStyle = g; c.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); });
    } else if (wx.cond === 'Cloudy') {
      clouds.forEach((cl) => { cl.x += cl.vx * dt; if (cl.x - cl.w > FW) cl.x = -cl.w; const g = c.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.w); g.addColorStop(0, dark ? 'rgba(10,16,34,.20)' : 'rgba(40,60,100,.10)'); g.addColorStop(1, 'rgba(10,16,34,0)');
        c.save(); c.translate(cl.x, cl.y); c.scale(1, cl.h / cl.w); c.translate(-cl.x, -cl.y); c.fillStyle = g; c.beginPath(); c.arc(cl.x, cl.y, cl.w, 0, 6.3); c.fill(); c.restore(); });
    } else if (!dark) {
      const g = c.createRadialGradient(FW * 0.85, -40, 0, FW * 0.85, -40, FW * 0.5); g.addColorStop(0, 'rgba(255,214,120,.35)'); g.addColorStop(1, 'rgba(255,214,120,0)'); c.fillStyle = g; c.fillRect(0, 0, FW, FH);
    }
  }
  function toPx(ll) { const p = map.latLngToContainerPoint(ll); return [p.x, p.y]; }
  function drawFlow(dt) {
    const c = fxx, N = R.N || 1; c.globalCompositeOperation = 'lighter';
    parts.forEach((p) => { const sg = R.segs[Math.min(N - 1, Math.floor(p.s * N))] || { v: 0, color: '#22d37f' };
      p.s += p.spd * dt * (1 - 0.8 * sg.v) * (loading ? 3 : 1); if (p.s > 1) p.s -= 1; const [x, y] = toPx(pointAt(R, p.s));
      const g = c.createRadialGradient(x, y, 0, x, y, p.r * 5); g.addColorStop(0, sg.color); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.5 * p.a; c.fillStyle = g; c.beginPath(); c.arc(x, y, p.r * 5, 0, 6.3); c.fill();
      c.globalAlpha = p.a; c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, p.r * 0.7, 0, 6.3); c.fill(); });
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // vehicle
    const sg = R.segs[Math.min(N - 1, Math.floor(veh.s * N))] || { v: 0 }; veh.s += (0.055 * (1 - 0.65 * sg.v)) * dt; if (veh.s > 1) veh.s -= 1;
    for (let k = 12; k >= 1; k--) { const [x, y] = toPx(pointAt(R, veh.s - k * 0.004)); c.fillStyle = 'rgba(34,227,255,' + (0.28 * (1 - k / 13)) + ')'; c.beginPath(); c.arc(x, y, 5 * (1 - k / 16), 0, 6.3); c.fill(); }
    const [x, y] = toPx(pointAt(R, veh.s)), [x2, y2] = toPx(pointAt(R, veh.s + 0.004)), ang = Math.atan2(y2 - y, x2 - x);
    const pulse = 1 + 0.25 * Math.sin(tick * 5); c.strokeStyle = 'rgba(34,227,255,' + (0.5 - 0.3 * Math.sin(tick * 5)) + ')'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 13 * pulse, 0, 6.3); c.stroke();
    c.save(); c.translate(x, y); c.rotate(ang);
    const cone = c.createLinearGradient(8, 0, 34, 0); cone.addColorStop(0, 'rgba(255,255,220,.45)'); cone.addColorStop(1, 'rgba(255,255,220,0)'); c.fillStyle = cone; c.beginPath(); c.moveTo(8, -3); c.lineTo(34, -11); c.lineTo(34, 11); c.lineTo(8, 3); c.closePath(); c.fill();
    c.shadowColor = 'rgba(34,227,255,.95)'; c.shadowBlur = 16; c.fillStyle = '#e9fbff'; c.beginPath(); c.roundRect ? c.roundRect(-9, -5.5, 18, 11, 4) : c.rect(-9, -5.5, 18, 11); c.fill(); c.shadowBlur = 0;
    c.fillStyle = '#18c3e6'; c.beginPath(); c.roundRect ? c.roundRect(-4, -4, 9, 8, 2.5) : c.rect(-4, -4, 9, 8); c.fill(); c.fillStyle = '#fff6b0'; c.fillRect(7, -4.2, 2.2, 2.4); c.fillRect(7, 1.8, 2.2, 2.4); c.restore();
  }
  function drawScan(dt) {                              // loading: glowing sweep along the route
    const c = fxx; veh.sc = ((veh.sc || 0) + dt * 0.55) % 1.25; const s0 = veh.sc - 0.18, n = 24, pts_ = [];
    for (let i = 0; i <= n; i++) { const s = s0 + (0.18 * i) / n; if (s >= 0 && s <= 1) pts_.push(toPx(pointAt(R, s))); }
    if (pts_.length < 2) return; c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    [[18, 0.12], [9, 0.25], [3.5, 0.9]].forEach(([w, a]) => { c.strokeStyle = 'rgba(120,235,255,' + a + ')'; c.lineWidth = w; c.beginPath(); pts_.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); });
    c.globalCompositeOperation = 'source-over';
  }

  SC.map = { getMap: () => map, init, setStyle, setTheme, setPoint, startPick, cancelPick, showRoute, showResult, clearRoute, setLayer, fit, flyTo, zoom, setLoading, setCardOpen,
    state: () => ({ N: R && R.N, ready: !!(R && R.ready), zones: R && R.zones ? R.zones.length : 0, style, flags: Object.assign({}, flags), segColors: R ? R.segs.map((s) => s.color) : [] }) };
})(window.SC = window.SC || {});
