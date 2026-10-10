/* SmartCommute / Hyderabad — search service (drop-in replacement for SC.services.search / reverse)
 *   1. category words        "metro near me", "hospitals", "bus stop"       -> nearest places of that type
 *   2. saved places          "home", "office"
 *   3. local database        instant, offline, typo tolerant                  (db.js)
 *   4. OpenStreetMap online  Photon (autocomplete-grade) then Nominatim       restricted to the Hyderabad box
 * Nominatim's usage policy forbids keystroke-by-keystroke autocomplete, so it is only a fallback: >= 1.1 s between calls,
 * results cached, and only when the local database and Photon found fewer than 3 places.                                  */
(function (SC) {
  'use strict';
  const H = SC.hyd, cfg = H.cfg, esc = H.esc;
  const timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  const cache = new Map(); let lastNominatim = 0;
  const box = () => cfg.bbox;

  /* ---------- helpers ------------------------------------------------------------------------------------- */
  function origin() {
    if (H.loc && H.loc.me && H.loc.insideCity()) return { lat: H.loc.me.lat, lon: H.loc.me.lon, who: 'you' };
    return null;
  }
  function toResult(it, d) {
    const tp = H.types[it.t] || {};
    const bits = [it.t === 'metro' && it.x && it.x.line ? it.x.line : (tp.label || '')]; if (it.a && it.a !== it.n && it.t !== 'metro') bits.push(it.a);
    if (d != null) bits.push(H.fmtDist(d));
    return { name: it.n, sub: '', desc: bits.filter(Boolean).join(' · '), type: it.t, lat: it.la, lon: it.lo, id: it.id, src: it.src };
  }
  function withDist(items) {
    const o = origin();
    return items.map((it) => toResult(it, o ? H.db.kmBetween(o.lat, o.lon, it.la, it.lo) : null));
  }

  /* ---------- online (OSM-based) ------------------------------------------------------------------------ */
  async function photon(q, bias) {
    const b = box(); let url = cfg.photon + '/api/?limit=6&lang=en&q=' + encodeURIComponent(q) + '&bbox=' + [b.w, b.s, b.e, b.n].join(',');
    if (bias) url += '&lat=' + bias[0] + '&lon=' + bias[1];
    const r = await fetch(url, { signal: timeout(3800) }); if (!r.ok) throw new Error('photon ' + r.status);
    return ((await r.json()).features || []).map((f) => {
      const p = f.properties || {}, la = f.geometry.coordinates[1], lo = f.geometry.coordinates[0];
      const name = p.name || p.street || p.district || ''; if (!name || !H.inBox(la, lo)) return null;
      const kind = p.osm_value && /^(bus_stop|station|subway)$/.test(p.osm_value) ? (p.osm_value === 'bus_stop' ? 'bus_stop' : 'metro') : null;
      return { name, sub: '', desc: [kind ? H.types[kind].label : (p.osm_value && p.osm_value !== 'yes' ? p.osm_value.replace(/_/g, ' ') : ''), p.district || p.suburb || p.locality || p.city].filter(Boolean).join(' · '), type: kind || 'place', lat: la, lon: lo, src: 'photon' };
    }).filter(Boolean);
  }
  async function nominatim(q) {
    const wait = lastNominatim + 1100 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); lastNominatim = Date.now();
    const b = box();
    const url = cfg.nominatim + '/search?format=jsonv2&addressdetails=1&limit=6&accept-language=en&countrycodes=in&bounded=1&viewbox=' + [b.w, b.n, b.e, b.s].join(',') + '&q=' + encodeURIComponent(q);
    const r = await fetch(url, { signal: timeout(5000) }); if (!r.ok) throw new Error('nominatim ' + r.status);
    return (await r.json()).map((j) => {
      const la = +j.lat, lo = +j.lon; if (!H.inBox(la, lo)) return null; const a = j.address || {};
      const name = j.name || (j.display_name || '').split(',')[0];
      return { name, sub: '', desc: [(j.type || j.category || '').replace(/_/g, ' '), a.suburb || a.neighbourhood || a.city_district || a.city].filter(Boolean).join(' · '), type: 'place', lat: la, lon: lo, src: 'nominatim' };
    }).filter(Boolean);
  }
  async function online(q, bias) {
    const key = H.db.norm(q); if (cache.has(key)) return cache.get(key);
    let out = [];
    try { out = await photon(q, bias); } catch (e) { /* try Nominatim */ }
    if (out.length < 2) { try { out = out.concat(await nominatim(q)); } catch (e) { /* offline */ } }
    cache.set(key, out); return out;
  }

  /* ---------- main search ------------------------------------------------------------------------------------- */
  async function search(q, bias) {
    q = (q || '').trim(); if (q.length < 2) return [];
    const qn = H.db.norm(q), out = [], o = origin(), ref = o ? [o.lat, o.lon] : (bias || cfg.center);

    if (/^(my|current|here|live)\b/.test(qn) && o) out.push({ name: 'My location', sub: '', desc: 'Live GPS position', type: 'me', lat: o.lat, lon: o.lon });

    // category search: "metro", "hospitals near me", "bus stop near hitec city"
    const m = qn.match(/^(.*?)\s*\b(near me|nearby|near)\b\s*(.*)$/), word = (m ? m[1] : qn).trim(), around = m ? m[3].trim() : '';
    if (H.typeWords[word] && (m || qn.split(' ').length <= 2)) {
      let c = ref; if (around) { const a = H.db.search(around, { limit: 1 })[0]; if (a) c = [a.la, a.lo]; }
      const near = H.db.nearest(c[0], c[1], { types: [H.typeWords[word]], limit: 8, maxKm: 25 });
      if (near.length) {
        near.forEach((r) => { const x = toResult(r.it, r.d); x.desc += (around ? ' from ' + around : (o ? ' from you' : '')); out.push(x); });
        if (out.length >= 3) return out.slice(0, 8);
      }
    }

    const saved = (H.saved && H.saved.search) ? H.saved.search(qn) : []; saved.forEach((s) => out.push(s));
    const local = withDist(H.db.search(q, { bias: ref, limit: 8 })); local.forEach((r) => out.push(r));

    if (local.length < 3 && qn.length >= 3 && navigator.onLine !== false) {
      const extra = await online(q, ref);
      extra.forEach((e) => { if (!out.some((r) => H.db.kmBetween(r.lat, r.lon, e.lat, e.lon) < 0.3 && H.db.norm(r.name).slice(0, 6) === H.db.norm(e.name).slice(0, 6))) out.push(e); });
    }
    return out.slice(0, 8);
  }

  /* ---------- reverse geocoding ------------------------------------------------------------------------------------- */
  async function reverse(lat, lon) {
    const near = H.db.nearest(lat, lon, { types: ['metro', 'railway', 'landmark', 'mall', 'hospital', 'college', 'it_park', 'gov', 'junction', 'bus_stop'], maxKm: 0.12, limit: 1 })[0];
    if (near) return near.it.n;
    if (navigator.onLine !== false) {
      try {
        const wait = lastNominatim + 1100 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); lastNominatim = Date.now();
        const r = await fetch(cfg.nominatim + '/reverse?format=jsonv2&zoom=18&accept-language=en&lat=' + lat + '&lon=' + lon, { signal: timeout(3500) });
        if (r.ok) { const j = await r.json(), a = j.address || {}; const road = a.road || a.pedestrian || a.amenity || a.building || j.name; const area = a.suburb || a.neighbourhood || a.city_district;
          const name = [road, area].filter(Boolean).join(', '); if (name) return name; }
      } catch (e) { /* offline */ }
    }
    const loc = H.db.nearest(lat, lon, { types: ['locality', 'colony'], maxKm: 6, limit: 1 })[0];
    return loc ? 'Near ' + loc.it.n : 'Pin ' + lat.toFixed(4) + ', ' + lon.toFixed(4);
  }

  /* ---------- how a result row is drawn (hook called by the existing suggestion renderer) ----------------------------- */
  function suggestItem(row, it) {
    const t = H.types[it.type] || { color: '#8fa3d1', glyph: '' }, ic = row.querySelector('svg.ic');
    const b = document.createElement('span'); b.className = 'sg-ico'; b.style.background = it.type === 'me' ? '#3b82f6' : t.color; b.textContent = it.type === 'me' ? '◎' : (t.glyph || (it.type === 'place' ? '•' : '•'));
    if (ic) ic.replaceWith(b);
    const sp = row.querySelector('.sg-t span'); if (sp) sp.textContent = it.desc || '';
  }
  SC.hook = SC.hook || {}; SC.hook.suggestItem = suggestItem;

  /* ---------- install: replace the old (non-Hyderabad) place search ------------------------------------------------------ */
  H.search = { search, reverse, origin };
  H.installSearch = function () {
    SC.services.search = search; SC.services.reverse = reverse; SC.services.PLACES = [];
  };
})(window.SC = window.SC || {});
