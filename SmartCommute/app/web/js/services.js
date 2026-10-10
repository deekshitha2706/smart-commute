/* SmartCommute - web services: place search, routing, weather (all with offline fallbacks) */
(function (SC) {
  'use strict';

  /* ---------- small built-in gazetteer (offline fallback) -------------------- */
  const PLACES = [
    ['Majestic (Kempegowda Bus Station), Bengaluru', 12.9767, 77.5713],
    ['MG Road, Bengaluru', 12.9756, 77.6068],
    ['Electronic City, Bengaluru', 12.8452, 77.6602],
    ['Whitefield, Bengaluru', 12.9698, 77.7500],
    ['Koramangala, Bengaluru', 12.9352, 77.6245],
    ['Indiranagar, Bengaluru', 12.9784, 77.6408],
    ['Kempegowda Airport, Bengaluru', 13.1986, 77.7066],
    ['Hebbal, Bengaluru', 13.0358, 77.5970],
    ['Jayanagar, Bengaluru', 12.9299, 77.5826],
    ['Connaught Place, New Delhi', 28.6315, 77.2167],
    ['Gurugram Cyber Hub', 28.4950, 77.0890],
    ['Noida Sector 62', 28.6270, 77.3650],
    ['Gateway of India, Mumbai', 18.9220, 72.8347],
    ['Bandra Kurla Complex, Mumbai', 19.0690, 72.8700],
    ['Andheri Station, Mumbai', 19.1197, 72.8464],
    ['Hitech City, Hyderabad', 17.4435, 78.3772],
    ['Charminar, Hyderabad', 17.3616, 78.4747],
    ['T. Nagar, Chennai', 13.0418, 80.2341],
    ['Chennai Central', 13.0827, 80.2757],
    ['Salt Lake, Kolkata', 22.5867, 88.4172],
    ['Howrah Station, Kolkata', 22.5839, 88.3426],
    ['Koregaon Park, Pune', 18.5362, 73.8940],
    ['Hinjewadi, Pune', 18.5912, 73.7389],
    ['Times Square, New York', 40.7580, -73.9855],
    ['Brooklyn Bridge, New York', 40.7061, -73.9969],
    ['Trafalgar Square, London', 51.5080, -0.1281],
    ['Canary Wharf, London', 51.5054, -0.0235],
    ['Shibuya Crossing, Tokyo', 35.6595, 139.7005],
    ['Marina Bay, Singapore', 1.2834, 103.8607],
    ['Golden Gate Bridge, San Francisco', 37.8199, -122.4783]
  ];

  const timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  const rad = (d) => d * Math.PI / 180;
  function hav(a, b) {
    const R = 6371, dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  SC.hav = hav;

  /* ---------- place search ---------------------------------------------------- */
  async function search(q, bias) {
    q = (q || '').trim();
    if (q.length < 2) return [];
    try {
      let url = 'https://photon.komoot.io/api/?limit=6&lang=en&q=' + encodeURIComponent(q);
      if (bias) url += '&lat=' + bias[0] + '&lon=' + bias[1];
      const r = await fetch(url, { signal: timeout(4500) });
      if (!r.ok) throw new Error('photon ' + r.status);
      const j = await r.json();
      const out = (j.features || []).map((f) => {
        const p = f.properties || {};
        const name = p.name || p.street || p.city || 'Place';
        const sub = [p.street && p.name ? p.street : null, p.district, p.city, p.state, p.country].filter(Boolean).join(', ');
        return { name, sub, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
      });
      if (out.length) return out;
    } catch (e) { /* offline -> fall through */ }
    const ql = q.toLowerCase();
    return PLACES.filter((p) => p[0].toLowerCase().includes(ql))
      .slice(0, 6).map((p) => ({ name: p[0].split(',')[0], sub: p[0].split(',').slice(1).join(',').trim() || 'Built-in place list', lat: p[1], lon: p[2], offline: true }));
  }

  async function reverse(lat, lon) {
    try {
      const r = await fetch('https://photon.komoot.io/reverse?lang=en&lat=' + lat + '&lon=' + lon, { signal: timeout(3500) });
      const j = await r.json();
      const p = j.features && j.features[0] && j.features[0].properties;
      if (p) {
        const name = [p.name || p.street, p.district || p.city].filter(Boolean).join(', ');
        if (name) return name;
      }
    } catch (e) { /* ignore */ }
    let best = null, bd = 3;                      // nearest built-in place within 3 km
    PLACES.forEach((p) => { const d = hav([lat, lon], [p[1], p[2]]); if (d < bd) { bd = d; best = p[0]; } });
    return best || ('Pin ' + lat.toFixed(4) + ', ' + lon.toFixed(4));
  }

  /* ---------- routing ---------------------------------------------------------- */
  async function route(a, b) {
    try {
      const u = 'https://router.project-osrm.org/route/v1/driving/' + a.lon + ',' + a.lat + ';' + b.lon + ',' + b.lat +
        '?overview=full&geometries=geojson&steps=false';
      const r = await fetch(u, { signal: timeout(7000) });
      if (!r.ok) throw new Error('osrm ' + r.status);
      const j = await r.json();
      const rt = j.routes && j.routes[0];
      if (!rt) throw new Error('no route');
      return { coords: rt.geometry.coordinates.map((c) => [c[1], c[0]]), distKm: rt.distance / 1000, freeMin: rt.duration / 60, source: 'OSRM' };
    } catch (e) { /* fall back */ }
    return estimateRoute(a, b);
  }

  /* offline: a gently curved path, road factor 1.3, 42 km/h average free-flow speed */
  function estimateRoute(a, b) {
    const A = [a.lat, a.lon], B = [b.lat, b.lon], n = 90;
    const d = hav(A, B);
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    const nx = -(B[1] - A[1]), ny = (B[0] - A[0]);
    const nl = Math.hypot(nx, ny) || 1, bend = 0.12;
    const cx = mx + nx / nl * Math.hypot(B[0] - A[0], B[1] - A[1]) * bend;
    const cy = my + ny / nl * Math.hypot(B[0] - A[0], B[1] - A[1]) * bend;
    const coords = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      let la = u * u * A[0] + 2 * u * t * cx + t * t * B[0];
      let lo = u * u * A[1] + 2 * u * t * cy + t * t * B[1];
      const wob = Math.sin(t * 17) * 0.0009 * Math.sin(Math.PI * t);   // street-like wiggle
      la += wob; lo -= wob;
      coords.push([la, lo]);
    }
    let len = 0; for (let i = 1; i < coords.length; i++) len += hav(coords[i - 1], coords[i]);
    const distKm = Math.max(len * 1.12, 0.3);
    return { coords, distKm, freeMin: distKm / 42 * 60, source: 'Estimate' };
  }

  /* ---------- weather ----------------------------------------------------------- */
  function codeToCond(c) {
    if (c === 0 || c === 1) return 'Clear';
    if (c === 2 || c === 3) return 'Cloudy';
    if (c === 45 || c === 48) return 'Fog';
    return 'Rain';                                  // drizzle, rain, showers, thunderstorm, snow
  }

  /* seasonal expectation when no forecast/archive is reachable */
  function climatology(lat, lon, month) {
    const monsoon = lat > 5 && lat < 30 && lon > 65 && lon < 100 && month >= 6 && month <= 9;
    const fogSeason = lat > 22 && lat < 35 && lon > 70 && lon < 90 && (month === 12 || month === 1);
    if (monsoon) return { cond: 'Rain', rainMm: 2.5, visKm: 6, tempC: 27, source: 'Seasonal estimate' };
    if (fogSeason) return { cond: 'Fog', rainMm: 0, visKm: 1.2, tempC: 11, source: 'Seasonal estimate' };
    if (lat > 40 && (month === 11 || month <= 2)) return { cond: 'Cloudy', rainMm: 0, visKm: 8, tempC: 4, source: 'Seasonal estimate' };
    return { cond: 'Clear', rainMm: 0, visKm: 10, tempC: lat > 20 && month >= 4 && month <= 6 ? 33 : 26, source: 'Seasonal estimate' };
  }

  async function weather(lat, lon, dateStr, hour) {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((d - today) / 86400000);
    const hh = Math.max(0, Math.min(23, Math.round(hour)));
    try {
      let url;
      if (days >= -2 && days <= 15) {
        url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
          '&hourly=temperature_2m,precipitation,weather_code,visibility&timezone=auto&start_date=' + dateStr + '&end_date=' + dateStr;
      } else if (days < -2) {
        url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat + '&longitude=' + lon +
          '&hourly=temperature_2m,precipitation,weather_code&timezone=auto&start_date=' + dateStr + '&end_date=' + dateStr;
      }
      if (url) {
        const r = await fetch(url, { signal: timeout(5000) });
        if (!r.ok) throw new Error('meteo ' + r.status);
        const h = (await r.json()).hourly;
        const cond = codeToCond(h.weather_code[hh]);
        const rain = h.precipitation[hh] || 0;
        const vis = h.visibility ? Math.min(12, h.visibility[hh] / 1000) : (cond === 'Fog' ? 0.8 : cond === 'Rain' ? 5.5 : cond === 'Cloudy' ? 8 : 10);
        return { cond: rain > 0.2 && cond !== 'Fog' ? 'Rain' : cond, rainMm: rain, visKm: vis, tempC: h.temperature_2m[hh], source: days < -2 ? 'Open-Meteo archive' : 'Open-Meteo forecast' };
      }
    } catch (e) { /* climatology below */ }
    return climatology(lat, lon, d.getMonth() + 1);
  }

  SC.services = { search, reverse, route, weather, estimateRoute, climatology, PLACES };
})(window.SC = window.SC || {});
