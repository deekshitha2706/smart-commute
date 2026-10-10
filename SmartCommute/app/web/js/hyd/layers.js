/* SmartCommute / Hyderabad — map labels (localities, metro, bus stops, landmarks, important buildings) and the place card
 * Labels come from the place database, are chosen per zoom level and de-cluttered in screen space so the map reads like a
 * consumer map. Road and street names come from the base tiles (CARTO / Esri / OpenTopo) and are visible from zoom 15.       */
(function (SC) {
  'use strict';
  const H = SC.hyd, esc = H.esc;
  const flags = Object.assign({ labels: true, bus: true, metro: true, places: true }, H.store.get('labelFlags', {}));
  let map, group, shown = new Map(), timer = 0, popup = null;

  const GROUP_OF = { bus_stop: 'bus', metro: 'metro', railway: 'metro', locality: 'labels', colony: 'labels', junction: 'places', landmark: 'places', airport: 'places', hospital: 'places', college: 'places', school: 'places', it_park: 'places', gov: 'places', mall: 'places' };
  const MAXN = 170;

  /* ---------- label selection (per zoom, de-cluttered) ------------------------------------------------------------ */
  function wanted(z) {
    const t = [];
    Object.keys(H.types).forEach((k) => {
      if (k === 'saved') return; const g = GROUP_OF[k]; if (g && !flags[g]) return;
      let min = H.types[k].z;
      if (k === 'locality' && z > 15) return;                          // the tiles label areas at street level
      if (z >= min) t.push(k);
    });
    return t;
  }
  function refresh() {
    if (!map || !group) return;
    const z = map.getZoom(), types = wanted(z), b = map.getBounds().pad(0.05);
    const items = H.db.inView(b, types).sort((a, c) => (H.types[a.t].rank - H.types[c.t].rank) || (a.n.length - c.n.length));
    const grid = new Map(), placed = [], keep = new Set();
    const cell = 80, hit = (x0, y0, x1, y1) => {
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        const arr = grid.get(gx + ',' + gy); if (arr && arr.some((r) => x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1])) return true;
      } return false;
    };
    const put = (x0, y0, x1, y1) => { const r = [x0, y0, x1, y1]; for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) { const k = gx + ',' + gy; (grid.get(k) || grid.set(k, []).get(k)).push(r); } };
    const dupes = new Set();
    for (const it of items) {
      if (placed.length >= MAXN) break;
      const dk = it.t + '|' + it.bk; if (dupes.has(dk) && (it.t === 'bus_stop' || it.t === 'junction')) continue;
      const p = map.latLngToContainerPoint([it.la, it.lo]); const tp = H.types[it.t];
      const text = !(it.t === 'bus_stop' && z < 16) && !(it.t === 'metro' && z < 13);          // icon-only when zoomed out
      const w = text ? Math.min(190, 24 + it.n.length * 6.3) : 20, h = it.t === 'locality' ? 18 : 22;
      const x0 = it.t === 'locality' ? p.x - w / 2 : p.x - 10, y0 = p.y - h / 2;
      if (hit(x0, y0, x0 + w, y0 + h)) continue;
      put(x0, y0, x0 + w, y0 + h); placed.push(it); keep.add(it.id); dupes.add(dk);
      if (!shown.has(it.id) || shown.get(it.id).text !== text) {
        if (shown.has(it.id)) group.removeLayer(shown.get(it.id).m);
        const m = marker(it, text); group.addLayer(m); shown.set(it.id, { m, text });
      }
    }
    shown.forEach((v, id) => { if (!keep.has(id)) { group.removeLayer(v.m); shown.delete(id); } });
  }
  function marker(it, text) {
    const tp = H.types[it.t], isLoc = it.t === 'locality';
    const cls = 'hl hl-' + it.t + (text ? '' : ' hl-icon');
    const ic = isLoc ? '' : '<span class="hl-ic" style="--c:' + tp.color + '">' + esc(tp.glyph || '•') + '</span>';
    const m = L.marker([it.la, it.lo], { pane: 'hydLabels', keyboard: false, riseOnHover: true, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="' + cls + '">' + ic + (text || isLoc ? '<span class="hl-t">' + esc(it.n) + '</span>' : '') + '</div>' }) });
    m.on('click', () => openCard(it)); return m;
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 90); };

  /* ---------- place card (popup) --------------------------------------------------------------------------------------- */
  function originInfo() {
    if (H.loc && H.loc.me && H.loc.insideCity()) return { lat: H.loc.me.lat, lon: H.loc.me.lon, label: 'your location' };
    const f = SC.state && SC.state.from; if (f) return { lat: f.lat, lon: f.lon, label: 'your start point' };
    return null;
  }
  function cardHtml(it) {
    const tp = H.types[it.t] || { label: 'Place', color: '#8fa3d1', glyph: '•' }, o = originInfo(), x = it.x || {};
    let sub = it.t === 'metro' ? (x.line ? 'Hyderabad Metro · ' + x.line : 'Hyderabad Metro') : it.t === 'bus_stop' ? (/tsrtc|tgsrtc|rtc/i.test(x.opr || '') ? 'TSRTC bus stop' : 'Bus stop') : tp.label;
    if (it.a && it.a !== it.n && it.t !== 'metro') sub += ' · ' + it.a;
    let reach = '<div class="pc-note">Turn on <b>My location</b> (bottom right) or set a start point to see distance and reach time.</div>';
    if (o) {
      const d = H.db.kmBetween(o.lat, o.lon, it.la, it.lo), r = H.reach(d);
      reach = '<div class="pc-reach"><div><small>Distance from ' + o.label + '</small><b>' + H.fmtDist(d) + '</b></div><div><small>Walk</small><b>' + H.fmtMin(r.walkMin) + '</b></div><div><small>Drive</small><b>' + H.fmtMin(r.driveMin) + '</b></div></div>' +
        '<div class="pc-note">Straight-line distance × ' + H.cfg.detour + ' for streets; walk ' + H.cfg.walkKmh + ' km/h, city drive ' + H.cfg.cityKmh + ' km/h.</div>';
    }
    return '<div class="pc"><div class="pc-h"><span class="pc-ic" style="background:' + tp.color + '">' + esc(tp.glyph || '•') + '</span><div><b>' + esc(it.n) + '</b><span>' + esc(sub) + '</span></div></div>' + reach +
      '<div class="pc-act"><button data-a="from">Route from here</button><button data-a="to">Route to here</button><button data-a="save">Save</button></div></div>';
  }
  function openCard(it) {
    if (popup) map.closePopup(popup);
    popup = L.popup({ className: 'hyd-pop', closeButton: true, autoPanPadding: [40, 110], maxWidth: 320, offset: [0, -6] }).setLatLng([it.la, it.lo]).setContent(cardHtml(it)).openOn(map);
    const el = popup.getElement(); if (!el) return;
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a, pt = { name: it.n, lat: it.la, lon: it.lo };
      if (a === 'save') { H.saved && H.saved.openDialog({ place: pt }); return; }
      SC.ui.setPoint(a, pt, { silent: true }); map.closePopup(popup); SC.ui.toast((a === 'from' ? 'Start' : 'Destination') + ' set to ' + it.n, 'ok', 2200);
    }));
  }

  /* ---------- toggles ---------------------------------------------------------------------------------------------------------- */
  function setFlag(k, v) { flags[k] = v; H.store.set('labelFlags', flags); refresh(); H.emit('flags', flags); }

  function init() {
    map = SC.map.getMap(); map.createPane('hydLabels'); const pn = map.getPane('hydLabels'); pn.style.zIndex = 330; pn.style.pointerEvents = 'none';
    group = L.layerGroup().addTo(map);
    map.on('moveend zoomend', schedule); H.on('db', schedule); schedule();
  }
  H.layers = { init, refresh, flags, setFlag, openCard, schedule };
})(window.SC = window.SC || {});
