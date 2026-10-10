/* SmartCommute / Hyderabad — place database engine
 *   sources : bundled seed (seed.js)  +  prebuilt OSM file (data/hyderabad_osm.js, optional)  +  OSM Overpass download cached in IndexedDB
 *   features: ranked autocomplete (prefix / token / alias / typo tolerant), category search, nearest-N, viewport query
 * The record for a place from OSM replaces the seed record for the same place, so data improves after the first download. */
(function (SC) {
  'use strict';
  const H = SC.hyd, cfg = H.cfg;
  const TYPES = H.types;

  /* ---------- text normalisation ---------------------------------------------------------------------------- */
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/\bhi[\s-]?tech\b/g, 'hitec').replace(/\bhitech\b/g, 'hitec').replace(/\b(cross|x)[\s-]*roads?\b/g, 'x roads')
    .replace(/\bst\.?\s/g, 'st ').replace(/\bl\.?\s?b\.?\s/g, 'lb ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const stripKind = (t, k) => {
    if (t === 'metro') return k.replace(/\b(hyderabad )?metro( rail)?( station)?\b/g, '').replace(/\bstation\b/g, '').replace(/\s+/g, ' ').trim();
    if (t === 'railway') return k.replace(/\b(railway|rly|mmts|junction|station|halt)\b/g, '').replace(/\s+/g, ' ').trim();
    if (t === 'bus_stop') return k.replace(/\b(tsrtc|tgsrtc|bus (stop|station|stand|depot)|stop|stand|depot)\b/g, '').replace(/\s+/g, ' ').trim();
    return k;
  };
  const kmBetween = (a, b, c, d) => { const x = (d - b) * Math.cos((a + c) * Math.PI / 360), y = c - a; return Math.sqrt(x * x + y * y) * 111.195; };
  function lev(a, b, max) {            // bounded Levenshtein (returns max+1 when exceeded)
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = new Array(b.length + 1), cur = new Array(b.length + 1), i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i; let rowMin = cur[0];
      for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1)); if (cur[j] < rowMin) rowMin = cur[j]; }
      if (rowMin > max) return max + 1; const t = prev; prev = cur; cur = t;
    }
    return prev[b.length];
  }

  /* ---------- state ---------------------------------------------------------------------------------------------- */
  const S = { items: [], byType: {}, seed: [], osm: [], osmTs: 0, state: 'init', progress: 0, lastError: '', nextId: 1 };

  function makeItem(row, type, src) {                // row = [name, lat, lon, area, aliases, extra]
    const name = String(row[0]).trim(); if (!name || !isFinite(row[1]) || !isFinite(row[2])) return null;
    const k = norm(name), al = norm(row[4] || '');
    return { id: S.nextId++, n: name, t: type, la: +row[1], lo: +row[2], a: row[3] || '', k, kt: k.split(' '), al, at: al ? al.split(' ') : [], bk: stripKind(type, k), src, x: row[5] || null };
  }

  function rebuild() {
    const osmKeys = new Map();                       // type|baseKey -> [[lat,lon]]
    const out = [];
    S.osm.forEach((it) => { out.push(it); const key = it.t + '|' + it.bk; (osmKeys.get(key) || osmKeys.set(key, []).get(key)).push([it.la, it.lo]); });
    S.seed.forEach((it) => {
      const hits = osmKeys.get(it.t + '|' + it.bk);
      if (hits && hits.some((p) => kmBetween(p[0], p[1], it.la, it.lo) < 3)) return;        // OSM already has this place
      out.push(it);
    });
    S.items = out; S.byType = {};
    out.forEach((it) => { (S.byType[it.t] || (S.byType[it.t] = [])).push(it); });
    fillAreas();
  }
  function fillAreas() {                              // give every place without an area the nearest locality name
    const locs = (S.byType.locality || []).concat(S.byType.colony || []);
    if (!locs.length) return;
    S.items.forEach((it) => {
      if (it.a || it.t === 'locality') return; let best = null, bd = 4;
      for (let i = 0; i < locs.length; i++) { const l = locs[i]; if (Math.abs(l.la - it.la) > 0.04) continue; const d = kmBetween(l.la, l.lo, it.la, it.lo); if (d < bd) { bd = d; best = l; } }
      it.a = best ? best.n : '';
    });
  }

  /* ---------- search --------------------------------------------------------------------------------------------- */
  function score(it, qn, qt, strict) {
    const k = it.k;
    if (k === qn) return 1000;
    if (k.startsWith(qn)) return 820 - Math.min(40, k.length - qn.length);
    const kt = it.kt;
    let all = true, ord = true, lastIdx = -1, sc = 0;
    for (let i = 0; i < qt.length; i++) {
      const q = qt[i]; let idx = -1;
      for (let j = 0; j < kt.length; j++) if (kt[j].startsWith(q)) { idx = j; break; }
      if (idx < 0) { all = false; break; }
      if (idx < lastIdx) ord = false; lastIdx = idx; sc += q.length;
    }
    if (all) return 640 + (ord ? 30 : 0) - Math.min(60, (kt.length - qt.length) * 6);
    if (it.at.indexOf(qn) >= 0) return 760;                                       // exact alias / acronym ("ou", "jbs", "kphb")
    if (qn.length >= 4 && k.indexOf(qn) >= 0) return 520 - Math.min(40, k.length - qn.length);
    // tokens may also be satisfied by alias or area ("inorbit madhapur", "kphb metro")
    const at = it.at, ar = it.a ? norm(it.a).split(' ') : [];
    let allX = true, nName = 0;
    for (let i = 0; i < qt.length; i++) {
      const q = qt[i];
      if (kt.some((t) => t.startsWith(q))) { nName++; continue; }
      if (at.some((t) => t.startsWith(q)) || ar.some((t) => t.startsWith(q)) || (it.al && it.al.indexOf(q) >= 0)) continue;
      allX = false; break;
    }
    if (allX) return nName ? 470 : 400;
    if (it.al && (it.al === qn || it.al.indexOf(qn) >= 0)) return 450;
    if (strict) return 0;
    // typo tolerance (one edit for 4–6 letters, two for longer) against name tokens
    let fz = 0;
    for (let i = 0; i < qt.length; i++) {
      const q = qt[i]; if (q.length < 4) { if (kt.some((t) => t.startsWith(q))) { fz += 1; continue; } fz = -1; break; }
      const max = q.length >= 7 ? 2 : 1; let ok = false;
      for (let j = 0; j < kt.length; j++) { const t = kt[j]; if (lev(q, t.slice(0, q.length + 1), max) <= max || lev(q, t, max) <= max) { ok = true; break; } }
      if (!ok) { fz = -1; break; } fz += 1;
    }
    return fz > 0 ? 300 : 0;
  }

  function search(q, o) {
    o = o || {}; const qn = norm(q); if (!qn) return [];
    const qt = qn.split(' '), types = o.types && o.types.length ? new Set(o.types) : null, pool = types ? [].concat.apply([], [...types].map((t) => S.byType[t] || [])) : S.items;
    const bias = o.bias, lim = o.limit || 8;
    const scan = (strict) => {
      const res = [];
      for (let i = 0; i < pool.length; i++) {
        const it = pool[i]; let s = score(it, qn, qt, strict); if (!s) continue;
        const tp = TYPES[it.t]; s += 12 - (tp ? tp.rank : 9);
        if (it.src === 'o') s += 1;
        if (bias) s -= Math.min(30, kmBetween(bias[0], bias[1], it.la, it.lo)) * 0.8;
        res.push({ it, s });
      }
      return res;
    };
    let res = scan(true); if (res.length < 2 && qn.length >= 4) res = scan(false);
    res.sort((a, b) => b.s - a.s);
    const out = [], seen = [];
    for (const r of res) {                                                          // collapse duplicates (both sides of a road, seed vs OSM)
      const it = r.it, key = it.t + '|' + it.bk;
      if (seen.some((s) => s.key === key && kmBetween(s.la, s.lo, it.la, it.lo) < 0.35)) continue;
      seen.push({ key, la: it.la, lo: it.lo }); out.push(r.it); if (out.length >= lim) break;
    }
    return out;
  }

  function nearest(lat, lon, o) {
    o = o || {}; const types = o.types || ['locality'], maxKm = o.maxKm || 5, lim = o.limit || 6, res = [];
    types.forEach((t) => (S.byType[t] || []).forEach((it) => {
      if (Math.abs(it.la - lat) > maxKm / 111) return; const d = kmBetween(lat, lon, it.la, it.lo); if (d <= maxKm) res.push({ it, d });
    }));
    res.sort((a, b) => a.d - b.d); const out = [];
    for (const r of res) { if (out.some((q) => q.it.bk === r.it.bk && q.it.t === r.it.t && kmBetween(q.it.la, q.it.lo, r.it.la, r.it.lo) < 0.12)) continue; out.push(r); if (out.length >= lim) break; }
    return out;
  }

  function inView(b, types) {              // b = L.LatLngBounds
    const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast(), out = [];
    types.forEach((t) => (S.byType[t] || []).forEach((it) => { if (it.la >= s && it.la <= n && it.lo >= w && it.lo <= e) out.push(it); }));
    return out;
  }

  /* ---------- OSM download (Overpass) ---------------------------------------------------------------------- */
  const BB = () => '(' + [cfg.bbox.s, cfg.bbox.w, cfg.bbox.n, cfg.bbox.e].join(',') + ')';
  const NAME = '["name"]';
  const CATS = [
    { t: 'locality', q: (b) => '(node["place"~"^(suburb|neighbourhood|quarter|locality|village|town|hamlet|city_block)$"]' + NAME + b + ';way["place"~"^(suburb|neighbourhood|quarter|locality)$"]' + NAME + b + ';relation["place"~"^(suburb|neighbourhood|quarter|locality)$"]' + NAME + b + ';)' },
    { t: 'junction', q: (b) => '(node["junction"]' + NAME + b + ';node["highway"="traffic_signals"]' + NAME + b + ';node["highway"="mini_roundabout"]' + NAME + b + ';node["highway"="motorway_junction"]' + NAME + b + ';)' },
    { t: 'landmark', q: (b) => '(nwr["tourism"~"^(attraction|museum|zoo|theme_park|gallery|viewpoint)$"]' + NAME + b + ';nwr["historic"]' + NAME + b + ';nwr["leisure"~"^(stadium|nature_reserve)$"]' + NAME + b + ';nwr["leisure"="park"]["wikidata"]' + NAME + b + ';nwr["amenity"="place_of_worship"]["wikidata"]' + NAME + b + ';nwr["man_made"~"^(tower|lighthouse)$"]' + NAME + b + ';)' },
    { t: 'bus_stop', q: (b) => '(node["highway"="bus_stop"]' + NAME + b + ';node["public_transport"="platform"]["bus"="yes"]' + NAME + b + ';nwr["amenity"="bus_station"]' + NAME + b + ';)' },
    { t: 'metro', q: (b) => '(nwr["railway"="station"]["station"="subway"]' + NAME + b + ';nwr["railway"="station"]["network"~"Metro",i]' + NAME + b + ';nwr["public_transport"="station"]["subway"="yes"]' + NAME + b + ';node["railway"="station"]["subway"="yes"]' + NAME + b + ';)' },
    { t: 'railway', q: (b) => '(nwr["railway"~"^(station|halt)$"]["station"!="subway"]["subway"!="yes"]["network"!~"Metro",i]' + NAME + b + ';)' },
    { t: 'college', q: (b) => '(nwr["amenity"~"^(college|university)$"]' + NAME + b + ';)' },
    { t: 'school', q: (b) => '(nwr["amenity"="school"]' + NAME + b + ';)' },
    { t: 'hospital', q: (b) => '(nwr["amenity"="hospital"]' + NAME + b + ';nwr["healthcare"="hospital"]' + NAME + b + ';)' },
    { t: 'it_park', q: (b) => '(nwr["office"~"^(it|company|research|coworking)$"]["name"~"IT Park|Tech Park|Technology Park|Cyber|SEZ|Software|Infocity|Knowledge City|Mindspace|Techno|Tech Village",i]' + b + ';nwr["landuse"="commercial"]["name"~"IT Park|Tech|SEZ|Software|Cyber",i]' + b + ';nwr["building"~"^(commercial|office)$"]["name"~"IT Park|Tech Park|Cyber|SEZ|Software|Knowledge City",i]' + b + ';)' },
    { t: 'gov', q: (b) => '(nwr["office"="government"]' + NAME + b + ';nwr["amenity"~"^(townhall|courthouse)$"]' + NAME + b + ';)' },
    { t: 'mall', q: (b) => '(nwr["shop"="mall"]' + NAME + b + ';nwr["shop"="department_store"]' + NAME + b + ';nwr["building"="retail"]["name"~"Mall|Plaza",i]' + b + ';)' },
    { t: 'airport', q: (b) => '(nwr["aeroway"="aerodrome"]' + NAME + b + ';)' }
  ];
  const JUNCTION_RE = /\b(junction|x roads|cross roads|circle|chowrasta|chowrastha|chowk|flyover|check ?post|roundabout)\b/i;
  const COLONY_RE = /\b(colony|nagar|enclave|housing board|layout|vihar|puram)\b/i;

  function elementToRow(el, cat) {
    const tg = el.tags || {}; let name = tg['name:en'] || tg.name; if (!name) return null;
    const lat = el.lat != null ? el.lat : el.center && el.center.lat, lon = el.lon != null ? el.lon : el.center && el.center.lon; if (lat == null || lon == null) return null;
    if (!H.inBox(lat, lon)) return null;
    let type = cat;
    if (cat === 'locality') type = JUNCTION_RE.test(name) ? 'junction' : (COLONY_RE.test(name) && /neighbourhood|quarter|locality|city_block|hamlet/.test(tg.place || '') ? 'colony' : 'locality');
    if (cat === 'metro' && !/metro/i.test(name)) name += ' Metro Station';
    if (cat === 'railway' && !/(station|halt|junction)/i.test(name)) name += ' Railway Station';
    const area = tg['addr:suburb'] || tg['addr:neighbourhood'] || tg['is_in:suburb'] || tg['addr:locality'] || '';
    const x = {}; if (tg.operator) x.opr = tg.operator; if (tg.network) x.line = tg.network; if (tg.ref) x.ref = tg.ref;
    return [name, lat, lon, area, '', Object.keys(x).length ? x : null, type];
  }

  async function overpass(query, signal) {
    let last;
    for (const ep of cfg.overpass) {
      try {
        const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal });
        if (!r.ok) { last = new Error('Overpass ' + r.status); continue; }
        return await r.json();
      } catch (e) { last = e; if (e.name === 'AbortError') throw e; }
    }
    throw last || new Error('Overpass unreachable');
  }

  let refreshing = null;
  function refresh(opts) {
    opts = opts || {}; if (refreshing) return refreshing;
    refreshing = (async () => {
      const rows = [], b = BB(); let done = 0, failed = 0;
      setState('loading', 0);
      for (const cat of CATS) {
        try {
          const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 100000);
          const j = await overpass('[out:json][timeout:90];' + cat.q(b) + ';out center tags;', ctl.signal); clearTimeout(to);
          (j.elements || []).forEach((el) => { const r = elementToRow(el, cat.t); if (r) rows.push(r); });
        } catch (e) { failed++; S.lastError = String(e && e.message || e); }
        done++; setState('loading', done / CATS.length);
        await new Promise((r) => setTimeout(r, 900));                         // be polite to the public Overpass servers
      }
      if (rows.length < 50) { setState(S.osm.length ? 'ready' : 'offline', 1); refreshing = null; return { ok: false, added: 0, failed }; }
      S.osm = rows.map((r) => makeItem(r, r[6], 'o')).filter(Boolean); S.osmTs = Date.now(); rebuild();
      idbSet('osm', { ts: S.osmTs, rows }).catch(() => {});
      setState('ready', 1, true); refreshing = null; return { ok: true, added: S.osm.length, failed };
    })();
    return refreshing;
  }

  /* ---------- persistence (IndexedDB, with graceful fallback) ----------------------------------------------- */
  function idb() {
    return new Promise((res, rej) => {
      try { const rq = indexedDB.open('smartcommute-hyd', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('kv'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); } catch (e) { rej(e); }
    });
  }
  const idbGet = (k) => idb().then((d) => new Promise((res, rej) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const idbSet = (k, v) => idb().then((d) => new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }));

  function setState(state, progress, updated) { S.state = state; S.progress = progress == null ? S.progress : progress; H.emit('db', { state, progress: S.progress, counts: stats(), updated: !!updated }); }

  function stats() {
    const c = {}; S.items.forEach((it) => { c[it.t] = (c[it.t] || 0) + 1; });
    return { total: S.items.length, seed: S.seed.length, osm: S.osm.length, byType: c, osmTs: S.osmTs, state: S.state, error: S.lastError };
  }

  /* ---------- init -------------------------------------------------------------------------------------------------- */
  async function init() {
    const D = H.seed; S.seed = [];
    Object.keys(D.types).forEach((t) => D.types[t].forEach((r) => { if (H.inBox(r[1], r[2])) { const it = makeItem(r, t, 's'); if (it) S.seed.push(it); } }));
    const pre = H.prebuilt;                                                   // optional file produced by tools/build_hyderabad_db.py
    if (pre && pre.rows && pre.rows.length) { S.osm = pre.rows.map((r) => makeItem(r, r[6], 'o')).filter(Boolean); S.osmTs = pre.ts || 0; }
    rebuild(); setState('ready', 1);
    try {                                                                     // newer download from an earlier session?
      const cached = await idbGet('osm');
      if (cached && cached.rows && cached.rows.length && (cached.ts || 0) > S.osmTs) { S.osm = cached.rows.map((r) => makeItem(r, r[6], 'o')).filter(Boolean); S.osmTs = cached.ts; rebuild(); setState('ready', 1, true); }
    } catch (e) { /* IndexedDB unavailable: keep seed + prebuilt */ }
    const age = (Date.now() - S.osmTs) / 86400000;
    if (H.store.get('autoUpdate', true) && navigator.onLine !== false && age > cfg.cacheDays) setTimeout(() => refresh(), 5000);
    return stats();
  }

  H.db = { init, search, nearest, inView, refresh, stats, norm, kmBetween, all: () => S.items, byType: (t) => S.byType[t] || [], find: (name) => S.items.find((i) => i.k === norm(name)),
    addUser(row, type) { const it = makeItem(row, type || 'saved', 'u'); if (it) { S.seed.push(it); rebuild(); } return it; } };
})(window.SC = window.SC || {});
