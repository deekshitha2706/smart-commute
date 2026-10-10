/* SmartCommute / Hyderabad — nearby TSRTC bus stops and metro stations
 * A panel lists the closest stops to the user's live location (or, if location is off, to the planner's start point, or
 * the map centre) with distance, walking time and city-drive time. Clicking a row flies to the stop and opens its place card
 * (name, distance from user, estimated reach time). Rings on the map mark the listed stops even when labels are zoomed out.
 * Reach time = straight-line distance × detour factor ÷ walking speed — an estimate, not a timetable.                       */
(function (SC) {
  'use strict';
  const H = SC.hyd, esc = H.esc;
  const st = { open: false, tab: 'bus_stop', ring: null, lastKey: '' };
  const LINE_COLOR = { red: '#e5484d', blue: '#2f6bff', green: '#22a06b' };
  const lineColor = (x) => { const l = (x && x.line || '').toLowerCase(); return l.indexOf('red') >= 0 ? LINE_COLOR.red : l.indexOf('blue') >= 0 ? LINE_COLOR.blue : l.indexOf('green') >= 0 ? LINE_COLOR.green : H.types.metro.color; };

  function origin() {
    if (H.loc && H.loc.me && H.loc.insideCity()) return { lat: H.loc.me.lat, lon: H.loc.me.lon, label: 'your location', live: true };
    const f = SC.state && SC.state.from; if (f && f.name !== 'My location') return { lat: f.lat, lon: f.lon, label: 'your start point', live: false };
    const c = SC.map.getMap().getCenter(); return { lat: c.lat, lon: c.lng, label: 'the map centre', live: false };
  }
  function rows() {
    const o = origin(), types = st.tab === 'metro' ? ['metro'] : ['bus_stop'];
    const near = H.db.nearest(o.lat, o.lon, { types, limit: 8, maxKm: st.tab === 'metro' ? 12 : 4 });
    return { o, near };
  }
  /* fly to a stop so that it lands in the free part of the screen (between the planner and this panel), not under the panel */
  function flyClear(ll) {
    const m = SC.map.getMap(), z = Math.max(m.getZoom(), 16), size = m.getSize(), pl = document.getElementById('planner'), box = document.getElementById('hydNearby');
    const left = pl ? pl.getBoundingClientRect().right : 0, right = box && st.open ? box.getBoundingClientRect().left : size.x, shift = size.x / 2 - (left + right) / 2;
    m.flyTo(m.unproject(m.project(ll, z).add([shift, 0]), z), z, { duration: 0.8 });
  }
  function render() {
    const box = document.getElementById('hydNearby'); if (!box || !st.open) return;
    const { o, near } = rows();
    const list = box.querySelector('.nb-list'), from = box.querySelector('.nb-from');
    from.innerHTML = 'Nearest to <b>' + esc(o.label) + '</b>' + (o.live ? ' · updates as you move' : ' · turn on <b>My location</b> for live distances');
    if (!near.length) { list.innerHTML = '<div class="nb-empty">No ' + (st.tab === 'metro' ? 'metro stations' : 'bus stops') + ' found nearby in the bundled database. Open <b>Map labels</b> and press “Update from OpenStreetMap” to load the full Hyderabad list.</div>'; drawRings([]); return; }
    list.innerHTML = '';
    near.forEach((r) => {
      const it = r.it, rc = H.reach(r.d), b = document.createElement('button'); b.type = 'button'; b.className = 'nb';
      const color = it.t === 'metro' ? lineColor(it.x) : H.types.bus_stop.color, sub = it.t === 'metro' ? (it.x && it.x.line ? it.x.line : 'Hyderabad Metro') : ('TSRTC bus stop' + (it.a ? ' · ' + it.a : ''));
      b.innerHTML = '<span class="nb-i" style="background:' + color + '">' + (it.t === 'metro' ? 'M' : 'B') + '</span><span class="nb-t"><b>' + esc(it.n) + '</b><span>' + esc(sub) + '</span></span>' +
        '<span class="nb-d"><b>' + H.fmtDist(r.d) + '</b><span>🚶 ' + H.fmtMin(rc.walkMin) + ' · 🚗 ' + H.fmtMin(rc.driveMin) + '</span></span>';
      b.addEventListener('click', () => { flyClear([it.la, it.lo]); setTimeout(() => H.layers.openCard(it), 850); });
      list.appendChild(b);
    });
    drawRings(near);
  }
  function drawRings(near) {
    const m = SC.map.getMap(); if (st.ring) { m.removeLayer(st.ring); st.ring = null; } if (!near.length || !st.open) return;
    st.ring = L.layerGroup().addTo(m);
    near.forEach((r, i) => {
      const color = r.it.t === 'metro' ? lineColor(r.it.x) : H.types.bus_stop.color;
      L.circleMarker([r.it.la, r.it.lo], { radius: 9, weight: 3, color, fillColor: color, fillOpacity: 0.25, className: 'nb-ring', interactive: false }).addTo(st.ring);
      L.marker([r.it.la, r.it.lo], { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="hl" style="transform:translate(-9px,-50%)"><span class="hl-ic" style="--c:' + color + '">' + (i + 1) + '</span></div>' }) }).addTo(st.ring);
    });
  }
  function open(tab) {
    if (tab) st.tab = tab; st.open = true; let box = document.getElementById('hydNearby');
    if (!box) {
      box = document.createElement('div'); box.id = 'hydNearby'; box.className = 'glass hyd-pane';
      box.innerHTML = '<h3>Nearby transit<button type="button" id="nbClose" title="Close">✕</button></h3><div class="nb-tabs"><button type="button" data-t="bus_stop">TSRTC bus stops</button><button type="button" data-t="metro">Metro stations</button></div><div class="nb-from"></div><div class="nb-list"></div>';
      document.body.appendChild(box);
      box.querySelector('#nbClose').addEventListener('click', close);
      box.querySelectorAll('.nb-tabs button').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.t; sync(); render(); }));
    }
    box.classList.remove('hidden'); sync(); render(); H.emit('nearby', true);
  }
  function sync() { document.querySelectorAll('#hydNearby .nb-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === st.tab)); }
  function close() { st.open = false; const b = document.getElementById('hydNearby'); if (b) b.classList.add('hidden'); drawRings([]); H.emit('nearby', false); }
  const toggle = () => (st.open ? close() : open());

  let t = 0; const later = () => { clearTimeout(t); t = setTimeout(() => { if (st.open) render(); }, 400); };
  H.on('loc', later); H.on('db', later);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) close(); });

  H.transit = { open, close, toggle, rows, get isOpen() { return st.open; } };
})(window.SC = window.SC || {});
