/* SmartCommute / Hyderabad — wiring: starts the add-on, builds its small pieces of UI and connects it to the existing app.
 * Nothing in the existing controller is replaced: this file only (1) calls the public hooks, (2) injects new DOM,
 * (3) listens to the existing 'sc:result' event.                                                                              */
(function (SC) {
  'use strict';
  const H = SC.hyd, $ = (id) => document.getElementById(id), esc = H.esc;
  const pad2 = (n) => String(n).padStart(2, '0');
  const ICON = {
    locate: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    labels: '<svg viewBox="0 0 24 24"><path d="M4 7h10M4 12h16M4 17h8"/><circle cx="18" cy="7" r="2"/></svg>',
    transit: '<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="14" rx="3.5"/><path d="M5 11h14M9 20.5l1.5-3M15 20.5l-1.5-3M8.5 14.2h.1M15.5 14.2h.1"/></svg>'
  };

  /* ---------- DOM that the add-on adds --------------------------------------------------------------------------------------- */
  function inject() {
    const tools = document.createElement('div'); tools.id = 'hydTools'; tools.className = 'glass';
    tools.innerHTML = '<button type="button" id="hydLoc" title="My location — click to find me, again to follow, again to stop">' + ICON.locate + '</button>' +
      '<button type="button" id="hydNb" title="Nearby TSRTC bus stops and metro stations">' + ICON.transit + '</button>' +
      '<button type="button" id="hydLbl" title="Map labels and place database">' + ICON.labels + '</button>';
    document.body.appendChild(tools);

    const ts = document.createElement('div'); ts.id = 'tileStatus'; ts.className = 'tile-status'; document.body.appendChild(ts);

    const live = document.createElement('div'); live.id = 'hydLive'; live.className = 'glass hidden';
    live.innerHTML = '<i class="lv-dot"></i><b id="lvTitle">Live</b><span id="lvSub"></span><button type="button" id="lvPause">Pause</button><button type="button" id="lvSim" title="Moves a simulated dot along the route to demonstrate re-analysis. This is NOT your GPS position.">Simulate drive</button>';
    document.body.appendChild(live);

    const strip = document.createElement('div'); strip.id = 'hydRoute'; strip.className = 'glass hidden'; document.body.appendChild(strip);

    const lbl = document.createElement('div'); lbl.id = 'hydLabels'; lbl.className = 'glass hyd-pane hidden';
    lbl.innerHTML = '<h3>Map labels<button type="button" id="lblClose">✕</button></h3>' +
      '<label class="hyd-tog"><input type="checkbox" data-f="labels"><i style="background:#8fa3d1"></i>Localities &amp; colonies</label>' +
      '<label class="hyd-tog"><input type="checkbox" data-f="metro"><i style="background:#e5484d"></i>Metro &amp; railway stations</label>' +
      '<label class="hyd-tog"><input type="checkbox" data-f="bus"><i style="background:#22a06b"></i>TSRTC bus stops</label>' +
      '<label class="hyd-tog"><input type="checkbox" data-f="places"><i style="background:#f5a524"></i>Landmarks, junctions &amp; buildings<br><small style="color:var(--muted)">hospitals, colleges, schools, IT parks, malls, offices</small></label>' +
      '<div class="hyd-db" id="hydDb"></div>';
    document.body.appendChild(lbl);

    // planner: "use my location" + saved-place chips
    const fFrom = $('fFrom'); if (fFrom) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mini'; b.id = 'hydUseMe'; b.title = 'Start from my live location';
      b.innerHTML = '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>';
      fFrom.insertBefore(b, fFrom.querySelector('.mini')); b.addEventListener('click', () => H.loc.useAsStart());
    }
    const rf = document.querySelector('#planner .route-fields'), chips = document.createElement('div'); chips.id = 'hydChips';
    if (rf) rf.insertAdjacentElement('afterend', chips);

    // map context menu
    const cm = $('ctxMenu');
    if (cm) {
      cm.insertAdjacentHTML('beforeend', '<button data-hctx="here">I am here</button><button data-hctx="save">Save this place…</button><button data-hctx="near">Nearby bus &amp; metro</button>');
      cm.querySelectorAll('[data-hctx]').forEach((b) => b.addEventListener('click', async () => {
        const lat = +cm.dataset.lat, lon = +cm.dataset.lon; cm.classList.add('hidden');
        if (b.dataset.hctx === 'here') H.loc.setManual(lat, lon);
        else if (b.dataset.hctx === 'save') { if (!H.inBox(lat, lon)) { SC.ui.toast('Pick a point inside Hyderabad.', 'err'); return; } const name = await SC.services.reverse(lat, lon); H.saved.openDialog({ place: { name, lat, lon } }); }
        else { H.transit.open(); }
      }));
    }
    const s1 = $('search'); if (s1) s1.placeholder = 'Search Hyderabad — area, metro, hospital, college, landmark…';
    const a = $('inFrom'), b2 = $('inTo'); if (a) a.placeholder = 'From — Hyderabad place or My location'; if (b2) b2.placeholder = 'To — Hyderabad place';
  }

  /* ---------- tools bar ------------------------------------------------------------------------------------------------------ */
  function paintTools() {
    const b = $('hydLoc'); if (!b) return; const m = H.loc.mode;
    b.classList.toggle('on', m === 'gps' || m === 'manual' || m === 'sim' || m === 'acquiring'); b.classList.toggle('follow', !!H.loc.follow);
    b.title = m === 'off' ? 'My location — click to find me' : m === 'acquiring' ? 'Finding you…' : H.loc.follow ? 'Following you — click to stop' : 'Click to follow, again to stop';
    $('hydNb').classList.toggle('on', H.transit.isOpen);
    $('hydLbl').classList.toggle('on', !$('hydLabels').classList.contains('hidden'));
  }
  function wireTools() {
    $('hydLoc').addEventListener('click', () => { H.loc.cycle(); paintTools(); });
    $('hydNb').addEventListener('click', () => { closePanes('nb'); H.transit.toggle(); paintTools(); });
    $('hydLbl').addEventListener('click', () => { const p = $('hydLabels'), open = p.classList.contains('hidden'); closePanes('lbl'); p.classList.toggle('hidden', !open); paintTools(); renderDb(); });
    $('lblClose').addEventListener('click', () => { $('hydLabels').classList.add('hidden'); paintTools(); });
    document.querySelectorAll('#hydLabels input[data-f]').forEach((c) => { c.checked = !!H.layers.flags[c.dataset.f]; c.addEventListener('change', () => H.layers.setFlag(c.dataset.f, c.checked)); });
    ['locmode', 'loc', 'nearby', 'simstate'].forEach((e) => H.on(e, paintTools));
  }
  function closePanes(except) { if (except !== 'lbl') $('hydLabels').classList.add('hidden'); if (except !== 'nb') H.transit.close(); }

  /* ---------- place-database status + OSM update button ------------------------------------------------------------------------- */
  function renderDb(ev) {
    const box = $('hydDb'); if (!box) return; const s = H.db.stats(), loading = s.state === 'loading', pct = Math.round(((ev && ev.progress) || 0) * 100);
    const when = s.osmTs ? 'OpenStreetMap data from ' + new Date(s.osmTs).toLocaleDateString() : 'OpenStreetMap data not downloaded yet';
    const tn = (k) => (H.types[k] ? H.types[k].label.toLowerCase() : k);
    const top = ['locality', 'colony', 'junction', 'metro', 'railway', 'bus_stop', 'landmark', 'hospital', 'college', 'school', 'it_park', 'gov', 'mall'].map((k) => (s.byType[k] ? s.byType[k] + ' ' + tn(k) + (s.byType[k] === 1 ? '' : 's') : '')).filter(Boolean).join(' · ');
    box.innerHTML = '<b style="color:var(--text)">' + s.total.toLocaleString() + ' Hyderabad places</b> (' + s.seed + ' bundled' + (s.osm ? ' + ' + s.osm.toLocaleString() + ' from OSM' : '') + ')<br>' + esc(top) + '<br>' + esc(when) +
      (s.error && !s.osm ? '<br><span style="color:var(--yellow)">Last download problem: ' + esc(s.error) + '</span>' : '') +
      (loading ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '<button type="button" id="dbUpdate">Update from OpenStreetMap (Overpass)</button>');
    const u = $('dbUpdate'); if (u) u.addEventListener('click', async () => {
      if (navigator.onLine === false) { SC.ui.toast('You appear to be offline.', 'err'); return; }
      SC.ui.toast('Downloading Hyderabad places from OpenStreetMap — about a minute…', '', 5000);
      const r = await H.db.refresh(); SC.ui.toast(r.ok ? 'Loaded ' + r.added.toLocaleString() + ' places from OpenStreetMap.' : 'Could not download from OpenStreetMap (network or server busy). The bundled places stay available.', r.ok ? 'ok' : 'err', 6000);
    });
  }

  /* ---------- live status chip ------------------------------------------------------------------------------------------------------- */
  let lastLive = 0;
  function paintLive() {
    const el = $('hydLive'), m = H.loc.mode, me = H.loc.me;
    const show = m !== 'off' && m !== 'denied' && m !== 'error' && (m === 'acquiring' || me); el.classList.toggle('hidden', !show); if (!show) return;
    const liveRoute = H.loc.isLiveRoute(), paused = H.loc.paused, ago = lastLive ? Math.round((Date.now() - lastLive) / 1000) : null;
    el.classList.toggle('paused', paused && liveRoute);
    const accTxt = me && me.src === 'gps' && me.acc != null ? ' ±' + (me.acc >= 1000 ? (me.acc / 1000).toFixed(1) + ' km' : Math.round(me.acc) + ' m') : '';
    $('lvTitle').textContent = m === 'acquiring' ? 'Finding you…' : m === 'sim' ? 'SIMULATED drive — not GPS' : m === 'manual' ? 'Position set by you — not GPS' : 'Device location' + accTxt;
    el.classList.toggle('not-gps', m === 'sim' || m === 'manual');
    $('lvSub').textContent = !me ? '' : !H.loc.insideCity() ? 'outside Hyderabad — live route updates off'
      : me.src === 'gps' && me.acc > H.cfg.liveMaxAccM ? 'accuracy too low for live route updates (needs ±' + H.cfg.liveMaxAccM + ' m)'
      : liveRoute ? (paused ? 'route updates paused' : 'route updates as you move' + (ago != null ? ' · last ' + (ago < 90 ? ago + ' s' : Math.round(ago / 60) + ' min') + ' ago · ' + H.loc.liveCount + ' update' + (H.loc.liveCount === 1 ? '' : 's') : ''))
      : 'start a route from My location for live updates';
    $('lvPause').style.display = liveRoute ? '' : 'none'; $('lvPause').textContent = paused ? 'Resume' : 'Pause';
    $('lvSim').textContent = H.loc.simOn ? 'Stop simulation' : 'Simulate drive'; $('lvSim').style.display = (SC.state.route || H.loc.simOn) ? '' : 'none';
    el.classList.toggle('nolive', false); $('hydRoute').classList.toggle('nolive', el.classList.contains('hidden'));
  }
  function wireLive() {
    $('lvPause').addEventListener('click', () => H.loc.setPaused(!H.loc.paused));
    $('lvSim').addEventListener('click', () => (H.loc.simOn ? H.loc.stopSim() : H.loc.startSim()));
    H.on('live', (d) => { lastLive = d.ts; paintLive(); });
    H.on('liveBusy', (b) => { $('hydLive').classList.toggle('busy', !!b); $('hydLoc').classList.toggle('busy', !!b); });
    ['locmode', 'loc', 'livepause', 'simstate'].forEach((e) => H.on(e, paintLive));
    setInterval(paintLive, 1000);
  }

  /* ---------- route details strip (distance, ETA, arrival, traffic, weather, delay, MC risk) --------------------------------------- */
  const clock = (d) => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  function arrival(res, live) {
    let dep;
    if (live) dep = new Date(); else { const d = $('inDate').value, t = $('inTime').value; dep = d && t ? new Date(d + 'T' + t + ':00') : new Date(); }
    const a = new Date(dep.getTime() + res.mean * 60000), late = new Date(dep.getTime() + res.pi95[1] * 60000);
    const dd = Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(dep.getFullYear(), dep.getMonth(), dep.getDate())) / 86400000);
    return { dep, a, late, text: clock(a) + (dd > 0 ? ' +' + dd + 'd' : ''), lateText: clock(late) };
  }
  function strip(detail) {
    const el = $('hydRoute'); if (!detail || !detail.res || !detail.route) return;
    const r = detail.res, rt = detail.route, w = detail.weather || {}, ar = arrival(r, !!detail.live), fmt = SC.fmt;
    const lv = r.congestion.level, lc = { Low: 'low', Medium: 'med', Heavy: 'high', Severe: 'sev' }[lv] || 'med';
    const d10 = r.delay.p[r.delay.t.indexOf(10)], up = r.weather.upliftPct, rk = r.risk;
    const cell = (lab, val, sub, cls) => '<div class="rs"><small>' + lab + '</small><b' + (cls ? ' class="' + cls + '"' : '') + '>' + val + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
    el.title = 'Expected arrival ' + ar.text + ' (mean trip time added to the departure time); 95% of trips arrive by ' + ar.lateText;
    el.innerHTML = cell('Distance', rt.distKm.toFixed(1) + ' km', rt.source || '') + cell('ETA', fmt.min(r.mean), 'arrive ' + ar.text) +
      cell('Traffic', lv, 'index ' + r.congestion.index.toFixed(0), 'lv-' + lc) + cell('Weather', r.weather.cond, Math.abs(up) < 0.5 ? 'no slowdown' : (up >= 0 ? '+' : '') + up.toFixed(0) + '% time') +
      cell('Delay &gt; 10 min', fmt.pct(d10), 'chance') + cell('MC risk', Math.round(rk.score) + ' / 100', rk.cls);
    el.classList.toggle('hidden', !document.body.classList.contains('has-result'));
    const meta = $('rcMeta'); if (meta && !meta.querySelector('.hyd-arr')) meta.insertAdjacentHTML('beforeend', '<span class="chip hyd-arr" title="Expected arrival (mean travel time added to departure)">Arrive ' + ar.text + '</span>' + (detail.live ? '<span class="chip hyd-arr" style="color:#3b82f6">● live</span>' : ''));
    H.emit('strip', { arrival: ar.text, eta: r.mean, live: !!detail.live });
  }
  function wireStrip() {
    document.addEventListener('sc:result', (e) => strip(e.detail));
    new MutationObserver(() => { const el = $('hydRoute'); if (el && el.innerHTML) el.classList.toggle('hidden', !document.body.classList.contains('has-result')); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', paintLive);
  }

  /* ---------- Hyderabad only: keep the map inside the city region ---------------------------------------------------------------------------- */
  function lockToCity() {
    const m = SC.map.getMap(), b = H.cfg.bbox, pad = 0.35;
    m.setMinZoom(9); m.setMaxBounds([[b.s - pad, b.w - pad], [b.n + pad, b.e + pad]]); m.options.maxBoundsViscosity = 0.85;
  }

  /* ---------- start ---------------------------------------------------------------------------------------------------------------------------- */
  function init() {
    H.installSearch(); H.db.init().then(() => renderDb());
    inject(); lockToCity(); H.layers.init(); H.saved.init(); H.tiles.paint();
    wireTools(); wireLive(); wireStrip(); paintTools(); paintLive();
    H.on('db', (ev) => { if ($('hydLabels') && !$('hydLabels').classList.contains('hidden')) renderDb(ev); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('hydLabels').classList.add('hidden'); paintTools(); } });
    H.ready = true; H.emit('ready', { places: H.db.stats().total });
  }
  H.ui = { init, strip };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window.SC = window.SC || {});
