#!/usr/bin/env python3
"""Pre-build the Hyderabad place database from OpenStreetMap (Overpass API) into app/web/data/hyderabad_osm.js.

    python tools/build_hyderabad_db.py                # download (needs internet), about 1-3 minutes
    python tools/build_hyderabad_db.py --from-json x.json   # convert a saved Overpass answer instead (offline)

Standard library only. The app also does this download itself in the background (js/hyd/db.js); running this script just
ships the data with the project so the first start already has the full list. Data (c) OpenStreetMap contributors, ODbL.
The categories, the Hyderabad bounding box and the classification rules mirror js/hyd/db.js and js/hyd/config.js."""
import argparse, json, os, re, sys, time, urllib.parse, urllib.request

BBOX = (17.20, 78.20, 17.68, 78.72)            # south, west, north, east  (Greater Hyderabad + Secunderabad + Cyberabad + ORR belt)
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
NAME = '["name"]'
JUNCTION_RE = re.compile(r'\b(junction|x roads|cross roads|circle|chowrasta|chowrastha|chowk|flyover|check ?post|roundabout)\b', re.I)
COLONY_RE = re.compile(r'\b(colony|nagar|enclave|housing board|layout|vihar|puram)\b', re.I)

CATS = [
    ('locality', lambda b: '(node["place"~"^(suburb|neighbourhood|quarter|locality|village|town|hamlet|city_block)$"]%s%s;way["place"~"^(suburb|neighbourhood|quarter|locality)$"]%s%s;relation["place"~"^(suburb|neighbourhood|quarter|locality)$"]%s%s;)' % ((NAME, b) * 3)),
    ('junction', lambda b: '(node["junction"]%s%s;node["highway"="traffic_signals"]%s%s;node["highway"="mini_roundabout"]%s%s;node["highway"="motorway_junction"]%s%s;)' % ((NAME, b) * 4)),
    ('landmark', lambda b: '(nwr["tourism"~"^(attraction|museum|zoo|theme_park|gallery|viewpoint)$"]%s%s;nwr["historic"]%s%s;nwr["leisure"~"^(stadium|nature_reserve)$"]%s%s;nwr["leisure"="park"]["wikidata"]%s%s;nwr["amenity"="place_of_worship"]["wikidata"]%s%s;nwr["man_made"~"^(tower|lighthouse)$"]%s%s;)' % ((NAME, b) * 6)),
    ('bus_stop', lambda b: '(node["highway"="bus_stop"]%s%s;node["public_transport"="platform"]["bus"="yes"]%s%s;nwr["amenity"="bus_station"]%s%s;)' % ((NAME, b) * 3)),
    ('metro', lambda b: '(nwr["railway"="station"]["station"="subway"]%s%s;nwr["railway"="station"]["network"~"Metro",i]%s%s;nwr["public_transport"="station"]["subway"="yes"]%s%s;node["railway"="station"]["subway"="yes"]%s%s;)' % ((NAME, b) * 4)),
    ('railway', lambda b: '(nwr["railway"~"^(station|halt)$"]["station"!="subway"]["subway"!="yes"]["network"!~"Metro",i]%s%s;)' % (NAME, b)),
    ('college', lambda b: '(nwr["amenity"~"^(college|university)$"]%s%s;)' % (NAME, b)),
    ('school', lambda b: '(nwr["amenity"="school"]%s%s;)' % (NAME, b)),
    ('hospital', lambda b: '(nwr["amenity"="hospital"]%s%s;nwr["healthcare"="hospital"]%s%s;)' % ((NAME, b) * 2)),
    ('it_park', lambda b: '(nwr["office"~"^(it|company|research|coworking)$"]["name"~"IT Park|Tech Park|Technology Park|Cyber|SEZ|Software|Infocity|Knowledge City|Mindspace|Techno|Tech Village",i]%s;nwr["landuse"="commercial"]["name"~"IT Park|Tech|SEZ|Software|Cyber",i]%s;nwr["building"~"^(commercial|office)$"]["name"~"IT Park|Tech Park|Cyber|SEZ|Software|Knowledge City",i]%s;)' % (b, b, b)),
    ('gov', lambda b: '(nwr["office"="government"]%s%s;nwr["amenity"~"^(townhall|courthouse)$"]%s%s;)' % ((NAME, b) * 2)),
    ('mall', lambda b: '(nwr["shop"="mall"]%s%s;nwr["shop"="department_store"]%s%s;nwr["building"="retail"]["name"~"Mall|Plaza",i]%s;)' % (NAME, b, NAME, b, b)),
    ('airport', lambda b: '(nwr["aeroway"="aerodrome"]%s%s;)' % (NAME, b)),
]

def in_box(lat, lon):
    return BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]

def element_to_row(el, cat):
    tg = el.get('tags') or {}
    name = tg.get('name:en') or tg.get('name')
    if not name: return None
    lat = el.get('lat', (el.get('center') or {}).get('lat')); lon = el.get('lon', (el.get('center') or {}).get('lon'))
    if lat is None or lon is None or not in_box(lat, lon): return None
    typ = cat
    if cat == 'locality':
        place = tg.get('place', '')
        typ = 'junction' if JUNCTION_RE.search(name) else ('colony' if COLONY_RE.search(name) and re.search(r'neighbourhood|quarter|locality|city_block|hamlet', place) else 'locality')
    if cat == 'metro' and not re.search('metro', name, re.I): name += ' Metro Station'
    if cat == 'railway' and not re.search('(station|halt|junction)', name, re.I): name += ' Railway Station'
    area = tg.get('addr:suburb') or tg.get('addr:neighbourhood') or tg.get('is_in:suburb') or tg.get('addr:locality') or ''
    x = {k: tg[s] for k, s in (('opr', 'operator'), ('line', 'network'), ('ref', 'ref')) if tg.get(s)}
    return [name, round(lat, 6), round(lon, 6), area, '', x or None, typ]

def overpass(query):
    last = None
    for ep in ENDPOINTS:
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': 'SmartCommute-Hyderabad-builder/1.0 (course project)'})
            with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)
        except Exception as e: last = e; print('   ', ep.split('/')[2], 'failed:', e, file=sys.stderr)
    raise RuntimeError('all Overpass endpoints failed: %s' % last)

def build(from_json=None):
    rows, seen = [], set()
    b = '(%s)' % ','.join(str(v) for v in BBOX)
    if from_json:
        data = json.load(open(from_json, encoding='utf-8')); jobs = [(c, data) for c, _ in CATS]
        # a single saved answer cannot be split by category: classify by tags
        jobs = [('auto', data)]
    else:
        jobs = []
        for cat, q in CATS:
            print('downloading', cat, '...', flush=True)
            jobs.append((cat, overpass('[out:json][timeout:90];%s;out center tags;' % q(b)))); time.sleep(1.0)
    for cat, j in jobs:
        for el in j.get('elements', []):
            c = cat
            if cat == 'auto':
                tg = el.get('tags', {})
                c = ('bus_stop' if tg.get('highway') == 'bus_stop' or tg.get('amenity') == 'bus_station' else 'metro' if tg.get('station') == 'subway' or tg.get('subway') == 'yes' else
                     'railway' if tg.get('railway') in ('station', 'halt') else 'hospital' if tg.get('amenity') == 'hospital' else 'college' if tg.get('amenity') in ('college', 'university') else
                     'school' if tg.get('amenity') == 'school' else 'mall' if tg.get('shop') == 'mall' else 'gov' if tg.get('office') == 'government' else 'junction' if 'junction' in tg or tg.get('highway') == 'traffic_signals' else
                     'landmark' if tg.get('tourism') or tg.get('historic') else 'locality')
            r = element_to_row(el, c)
            if not r: continue
            key = (r[6], r[0].lower(), round(r[1], 3), round(r[2], 3))
            if key in seen: continue
            seen.add(key); rows.append(r)
    return rows

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--from-json'); ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'app', 'web', 'data', 'hyderabad_osm.js'))
    a = ap.parse_args(); rows = build(a.from_json)
    if len(rows) < 50: sys.exit('Only %d places found — refusing to overwrite the data file.' % len(rows))
    out = os.path.abspath(a.out)
    with open(out, 'w', encoding='utf-8') as f:
        f.write('/* Hyderabad places from OpenStreetMap (c) OpenStreetMap contributors, ODbL. Built %s by tools/build_hyderabad_db.py */\n' % time.strftime('%Y-%m-%d'))
        f.write('(window.SC = window.SC || {}).hyd = Object.assign((window.SC && window.SC.hyd) || {}, { prebuilt: ')
        f.write(json.dumps({'ts': int(time.time() * 1000), 'rows': rows}, ensure_ascii=False, separators=(',', ':'))); f.write(' });\n')
    by = {}
    for r in rows: by[r[6]] = by.get(r[6], 0) + 1
    print('wrote', out, len(rows), 'places', by)
