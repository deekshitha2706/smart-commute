/* SmartCommute / Hyderabad enhancement layer — configuration
 * Everything in js/hyd/ is an ADD-ON. It reads the existing SC.* objects and hooks in through a few
 * documented extension points; it does not replace the analytics, Monte Carlo or MATLAB bridge.      */
(function (SC) {
  'use strict';
  const H = (SC.hyd = SC.hyd || {});

  H.cfg = {
    city: 'Hyderabad',
    center: [17.3850, 78.4867],
    /* Greater Hyderabad incl. Secunderabad, Cyberabad (HITEC City, Financial District) and the ORR belt */
    bbox: { s: 17.20, w: 78.20, n: 17.68, e: 78.72 },
    defaultZoom: 12,
    walkKmh: 4.8,            // walking speed used for "reach time"
    detour: 1.3,             // road/footpath detour factor over the straight line
    cityKmh: 22,             // typical city driving speed for the drive estimate
    overpass: [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.private.coffee/api/interpreter'
    ],
    nominatim: 'https://nominatim.openstreetmap.org',
    photon: 'https://photon.komoot.io',
    cacheDays: 14,
    liveMaxAccM: 1000,       // live route updates need a fix at least this accurate (metres)
    liveMinMoveM: 120,       // re-analyse after the user moved this far …
    liveMinGapMs: 20000,     // … but never more often than this
    liveMaxGapMs: 90000      // … and at least this often while moving
  };

  /* first-run route: a typical Hyderabad commute (HITEC City -> Secunderabad) */
  H.defaults = { from: { name: 'Hitech City', lat: 17.4435, lon: 78.3772 }, to: { name: 'Secunderabad Junction Railway Station', lat: 17.4337, lon: 78.5011 } };

  /* Place categories. rank = label priority (lower wins), z = first zoom level at which map labels appear */
  H.types = {
    locality:  { label: 'Locality',          color: '#8fa3d1', glyph: '',   rank: 1,  z: 11, label_z: 11 },
    colony:    { label: 'Colony',            color: '#8fa3d1', glyph: '',   rank: 2,  z: 14 },
    landmark:  { label: 'Landmark',          color: '#f5a524', glyph: '★',  rank: 3,  z: 13 },
    metro:     { label: 'Metro station',     color: '#e5484d', glyph: 'M',  rank: 4,  z: 12 },
    railway:   { label: 'Railway station',   color: '#7c5cff', glyph: 'R',  rank: 5,  z: 13 },
    airport:   { label: 'Airport',           color: '#22e3ff', glyph: '✈',  rank: 3,  z: 11 },
    bus_stop:  { label: 'Bus stop',          color: '#22a06b', glyph: 'B',  rank: 9,  z: 15 },
    junction:  { label: 'Junction',          color: '#9aa5bd', glyph: '+',  rank: 8,  z: 14 },
    hospital:  { label: 'Hospital',          color: '#ef4b6c', glyph: '+',  rank: 6,  z: 14 },
    college:   { label: 'College',           color: '#3b82f6', glyph: 'C',  rank: 7,  z: 14 },
    school:    { label: 'School',            color: '#0ea5a4', glyph: 'S',  rank: 10, z: 15 },
    it_park:   { label: 'IT park',           color: '#6366f1', glyph: 'IT', rank: 6,  z: 13 },
    gov:       { label: 'Government office', color: '#b45309', glyph: 'G',  rank: 7,  z: 14 },
    mall:      { label: 'Shopping mall',     color: '#d946ef', glyph: '🛍', rank: 6,  z: 14 },
    saved:     { label: 'Saved place',       color: '#22e3ff', glyph: '♥',  rank: 0,  z: 0 }
  };
  /* what the search box understands as a category word ("metro", "hospitals near me" …) */
  H.typeWords = {
    metro: 'metro', 'metro station': 'metro', 'metro stations': 'metro', 'bus stop': 'bus_stop', 'bus stops': 'bus_stop', bus: 'bus_stop', tsrtc: 'bus_stop',
    'bus station': 'bus_stop', railway: 'railway', 'railway station': 'railway', train: 'railway', hospital: 'hospital', hospitals: 'hospital', college: 'college', colleges: 'college',
    school: 'school', schools: 'school', mall: 'mall', malls: 'mall', 'it park': 'it_park', 'it parks': 'it_park', 'tech park': 'it_park', govt: 'gov', 'government office': 'gov',
    'government offices': 'gov', junction: 'junction', junctions: 'junction', landmark: 'landmark', landmarks: 'landmark', locality: 'locality', colony: 'colony', colonies: 'colony'
  };

  H.inBox = (lat, lon, pad) => { pad = pad || 0; const b = H.cfg.bbox; return lat >= b.s - pad && lat <= b.n + pad && lon >= b.w - pad && lon <= b.e + pad; };
  H.fmtDist = (km) => (km < 1 ? Math.round(km * 1000 / 10) * 10 + ' m' : km.toFixed(km < 10 ? 1 : 0) + ' km');
  H.fmtMin = (m) => (m < 1 ? '< 1 min' : m < 60 ? Math.round(m) + ' min' : Math.floor(m / 60) + ' h ' + Math.round(m % 60) + ' min');
  H.reach = (km) => ({ walkMin: km * H.cfg.detour / H.cfg.walkKmh * 60, driveMin: km * H.cfg.detour / H.cfg.cityKmh * 60 });
  H.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  H.store = {
    get(k, d) { try { const v = localStorage.getItem('sc.hyd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sc.hyd.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  H.on = (name, fn) => document.addEventListener('hyd:' + name, (e) => fn(e.detail));
  H.emit = (name, detail) => document.dispatchEvent(new CustomEvent('hyd:' + name, { detail }));
})(window.SC = window.SC || {});
