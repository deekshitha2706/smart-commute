/* SmartCommute / Hyderabad — base-map tile providers (replaces the tiny tile table in map.js through the SC.hydTiles hook)
 *
 *   Road       CARTO Dark Matter (dark UI) / CARTO Voyager (light UI)        fallback: OpenStreetMap Standard
 *   Satellite  Esri World Imagery                                            fallback: Esri World Imagery (services host)
 *   Terrain    OpenTopoMap (contours + hill shading)                          fallback: Esri World Topographic
 *   Hybrid     Esri World Imagery + Esri Transportation + Esri Places labels  fallback labels: CARTO labels-only
 *
 * Why the old switcher could look "stuck": a provider that is blocked or rate-limited returned blank tiles, the map
 * silently stayed dark and nothing told the user. Every layer is now health-checked: if most tiles fail to load a
 * fallback provider is swapped in automatically and a status chip names the provider that is really on screen.      */
(function (SC) {
  'use strict';
  const H = SC.hyd;
  const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const CARTO = OSM + ' &copy; <a href="https://carto.com/attributions">CARTO</a>';
  const ESRI = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  const P = {
    carto_dark:  { name: 'CARTO Dark Matter', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', sub: 'abcd', native: 20, attr: CARTO },
    carto_light: { name: 'CARTO Voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', sub: 'abcd', native: 20, attr: CARTO },
    osm:         { name: 'OpenStreetMap Standard', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', sub: '', native: 19, attr: OSM },
    esri_img:    { name: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', sub: '', native: 19, attr: ESRI },
    esri_img2:   { name: 'Esri World Imagery (alt host)', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', sub: '', native: 19, attr: ESRI },
    opentopo:    { name: 'OpenTopoMap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', sub: 'abc', native: 17, attr: 'Map data: ' + OSM + ', <a href="https://viewfinderpanoramas.org">SRTM</a> | Style: <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' },
    esri_topo:   { name: 'Esri World Topographic', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', sub: '', native: 19, attr: ESRI },
    esri_roads:  { name: 'Esri Transportation labels', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', sub: '', native: 17, attr: '' },
    esri_places: { name: 'Esri Places labels', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', sub: '', native: 17, attr: '' },
    carto_lab_d: { name: 'CARTO labels (dark)', url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', sub: 'abcd', native: 20, attr: CARTO },
    carto_lab_l: { name: 'CARTO labels (light)', url: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', sub: 'abcd', native: 20, attr: CARTO }
  };
  /* style -> ordered layers; each has the provider key, a fallback key and whether it is a label overlay */
  const STYLE = {
    road:      (theme) => [{ p: theme === 'dark' ? 'carto_dark' : 'carto_light', fb: 'osm' }],
    satellite: () => [{ p: 'esri_img', fb: 'esri_img2' }],
    terrain:   () => [{ p: 'opentopo', fb: 'esri_topo' }],
    hybrid:    (theme) => [{ p: 'esri_img', fb: 'esri_img2' }, { p: 'esri_roads', fb: theme === 'dark' ? 'carto_lab_d' : 'carto_lab_l', overlay: true }, { p: 'esri_places', fb: theme === 'dark' ? 'carto_lab_d' : 'carto_lab_l', overlay: true }]
  };
  const NAMES = { road: 'Road', satellite: 'Satellite', terrain: 'Terrain', hybrid: 'Hybrid' };

  const state = { style: 'road', theme: 'dark', layers: [] };
  const apply = (layer, key) => {
    const d = P[key], ac = layer._map && layer._map.attributionControl, old = layer.options.attribution;
    layer.options.subdomains = d.sub || 'abc'; layer.options.maxNativeZoom = d.native;
    if (ac) { if (old) ac.removeAttribution(old); if (d.attr) ac.addAttribution(d.attr); }
    layer.options.attribution = d.attr; layer.setUrl(d.url);
  };

  function build(style, theme) {
    const defs = (STYLE[style] || STYLE.road)(theme), layers = [];
    state.style = style; state.theme = theme; state.layers = [];
    defs.forEach((d) => {
      const p = P[d.p];
      const L_ = L.tileLayer(p.url, { subdomains: p.sub || 'abc', maxZoom: 20, maxNativeZoom: p.native, attribution: p.attr, errorTileUrl: BLANK, keepBuffer: 3, updateWhenIdle: false, pane: d.overlay ? 'labelsPane' : 'tilePane', crossOrigin: false });
      const rec = { key: d.p, name: p.name, url: p.url, overlay: !!d.overlay, loads: 0, errors: 0, started: 0, fallback: false, t0: Date.now(), layer: L_ };
      const swap = (why) => {
        if (rec.fallback || !d.fb || !L_._map) return;
        rec.fallback = true; rec.key = d.fb; rec.name = P[d.fb].name; rec.url = P[d.fb].url; rec.loads = 0; rec.errors = 0; rec.started = 0; apply(L_, d.fb);
        if (SC.ui && !d.overlay) SC.ui.toast(p.name + ' ' + why + ' — switched to ' + P[d.fb].name + '.', 'err', 5000);
      };
      rec.swap = swap;
      L_.on('tileloadstart', () => { rec.started++; });
      L_.on('tileload', (e) => { if (e && e.tile && e.tile.src === BLANK) return; rec.loads++; paint(); });   // a failed tile is replaced by BLANK and fires 'tileload' too: do not count it as a success
      L_.on('tileerror', () => {
        if (!L_._map) return;                                           // layer already removed (user switched style): ignore its late errors
        rec.errors++;
        const total = rec.loads + rec.errors;
        if (rec.errors >= 5 && rec.errors / total > 0.6 && Date.now() - rec.t0 < 20000) swap('is not responding');
        paint();
      });
      setTimeout(() => { if (L_._map && !rec.fallback && rec.loads === 0 && rec.started > 0) { swap('is not delivering tiles (stalled or blocked)'); paint(); } }, 9000);
      state.layers.push(rec); layers.push(L_);
    });
    document.body.setAttribute('data-map-style', style);
    const m = SC.map.getMap && SC.map.getMap();
    if (m) m.getPane('tilePane').classList.toggle('ter', style === 'terrain');
    paint(); return layers;
  }

  function paint() {
    const el = document.getElementById('tileStatus'); if (!el) return;
    const base = state.layers[0]; if (!base) return;
    const total = base.loads + base.errors, bad = total >= 6 && base.errors / total > 0.6;
    el.className = 'tile-status' + (bad ? ' bad' : ''); el.title = base.url;
    el.innerHTML = '<i></i><b>' + NAMES[state.style] + '</b><span>' + base.name + (state.layers.length > 1 ? ' + labels' : '') + (base.fallback ? ' (fallback)' : '') + (bad ? ' · tiles unavailable (offline or blocked) — click to retry' : '') + '</span>';
  }

  function retry() {                                                  // click on a red status chip: try the primary provider again
    const m = SC.map.getMap && SC.map.getMap(); if (m && SC.map.setStyle) SC.map.setStyle(state.style);
  }
  document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('#tileStatus.bad'); if (t) retry(); });
  SC.hydTiles = build;
  H.tiles = { providers: P, retry, state: () => JSON.parse(JSON.stringify(state, (k, v) => (k === 'layer' ? undefined : v))), paint,
    report: () => state.layers.map((l) => ({ style: state.style, provider: l.name, url: l.url, loads: l.loads, errors: l.errors, fallback: l.fallback })) };
})(window.SC = window.SC || {});
