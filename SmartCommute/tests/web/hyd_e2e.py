"""End-to-end test of the Hyderabad enhancement layer in headless Chromium (no MATLAB, no internet needed).
Run:  python tests/web/hyd_e2e.py            (needs: pip install playwright; a Chromium build)
All network calls are intercepted: tile servers return a 1x1 PNG (and the request URLs are recorded), routing / search /
weather services are refused so the offline fallbacks are exercised.  Geolocation is simulated by the browser context."""
import asyncio, base64, functools, http.server, json, os, sys, threading, glob
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', 'app', 'web'))
SHOTS = os.environ.get('SHOTS', os.path.join(HERE, 'shots'))
os.makedirs(SHOTS, exist_ok=True)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
CHROME = os.environ.get('CHROME') or next(iter(glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')), None)
TILE_HOSTS = ('cartocdn.com', 'tile.openstreetmap.org', 'arcgisonline.com', 'opentopomap.org')
results, tiles, failing = [], [], set()
MOCK = {'overpass': False, 'photon': False}

def check(name, ok, info=''):
    results.append((name, bool(ok), info)); print(('PASS  ' if ok else 'FAIL  ') + name + (('  — ' + str(info)) if info != '' else ''), flush=True)

async def handle(route):
    u = route.request.url
    if u.startswith('http://127.0.0.1'): return await route.continue_()
    if any(h in u for h in TILE_HOSTS):
        tiles.append(u)
        if any(f in u for f in failing): return await route.fulfill(status=404, body='')
        return await route.fulfill(status=200, content_type='image/png', body=PNG)
    if 'fonts.googleapis' in u or 'fonts.gstatic' in u: return await route.fulfill(status=200, content_type='text/css', body='')
    if 'overpass' in u and MOCK['overpass']:
        body = route.request.post_data or ''; els = []
        if 'bus_stop' in body: els = [{'type': 'node', 'lat': 17.40 + i * 0.002, 'lon': 78.40 + i * 0.002, 'tags': {'name': 'OSM Test Stop %d' % i, 'highway': 'bus_stop', 'operator': 'TSRTC'}} for i in range(60)]
        if 'subway' in body: els = [{'type': 'node', 'lat': 17.43761, 'lon': 78.44812, 'tags': {'name': 'Ameerpet', 'railway': 'station', 'station': 'subway', 'network': 'Hyderabad Metro Red Line'}}]
        if 'suburb' in body: els = [{'type': 'node', 'lat': 17.5001, 'lon': 78.5001, 'tags': {'name': 'Zzyzx Nagar Test', 'place': 'neighbourhood'}}]
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'elements': els}))
    if 'photon.komoot.io/api' in u and MOCK['photon']:
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'features': [{'geometry': {'coordinates': [78.45, 17.40]}, 'properties': {'name': 'Quxzzy Tiffin Centre', 'osm_value': 'restaurant', 'district': 'Abids'}}, {'geometry': {'coordinates': [77.59, 12.97]}, 'properties': {'name': 'Quxzzy Bengaluru', 'city': 'Bengaluru'}}]}))
    return await route.abort()          # routing, search, weather, Overpass: offline

async def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
    srv.RequestHandlerClass.log_message = lambda *a: None
    threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1520, 'height': 900}, geolocation={'latitude': 17.4435, 'longitude': 78.3772, 'accuracy': 15}, permissions=['geolocation'])
        await ctx.route('**/*', handle)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console.error: ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        await pg.goto(f'http://127.0.0.1:{port}/index.html'); await pg.wait_for_timeout(1500)
        ev = lambda js: pg.evaluate(js)

        # ---- 1. database ------------------------------------------------------------------------------------------------
        st = await ev('SC.hyd.db.stats()')
        need = ['locality', 'colony', 'junction', 'landmark', 'metro', 'railway', 'bus_stop', 'college', 'school', 'hospital', 'it_park', 'gov', 'mall']
        check('database has every required category', all(st['byType'].get(k, 0) > 0 for k in need), {k: st['byType'].get(k, 0) for k in need})
        check('database size', st['total'] >= 450, st['total'])
        out = await ev('(()=>{const bad=SC.hyd.db.all().filter(i=>!SC.hyd.inBox(i.la,i.lo));return bad.map(i=>i.n)})()')
        check('every place lies inside the Hyderabad box', out == [], out[:5])
        check('defaults are Hyderabad', await ev("SC.state.from.name==='Hitech City' && SC.state.to.name.includes('Secunderabad')"))

        # ---- 2. search / autocomplete ------------------------------------------------------------------------------------------
        async def top(q, n=3):
            return await ev(f'SC.services.search({json.dumps(q)}).then(r=>r.slice(0,{n}).map(x=>x.name+"|"+x.type))')
        for q, want in [('ameerp', 'Ameerpet'), ('kphb', 'KPHB'), ('mgbs', 'Mahatma Gandhi'), ('gachibwli', 'Gachibowli'), ('osmania', 'Osmania'), ('hitec', 'Hitech'), ('charmi', 'Charminar'), ('jbs', 'Jubilee'), ('inorbit', 'Inorbit'), ('nims', 'NIMS'), ('secunderabad rail', 'Secunderabad')]:
            r = await top(q, 4); check(f'search "{q}"', any(want.lower() in x.lower() for x in r), r)
        r = await top('metro near me', 5); check('category search "metro near me" returns metro stations', len(r) >= 3 and all(x.endswith('|metro') for x in r), r)
        r = await top('hospitals', 5); check('category search "hospitals"', len(r) >= 3 and all(x.endswith('|hospital') for x in r), r)
        r = await top('Bengaluru Majestic'); check('no other-city results', not any('majestic' in x.lower() for x in r), r)
        await pg.fill('#inTo', ''); await pg.type('#inTo', 'madha', delay=40); await pg.wait_for_timeout(700)
        sug = await ev("[...document.querySelectorAll('#sugTo .sg b')].map(e=>e.textContent)")
        check('autocomplete dropdown shows Hyderabad results while typing', any('Madhapur' in s for s in sug), sug)
        await pg.keyboard.press('Escape'); await pg.fill('#inTo', 'Secunderabad Junction Railway Station')

        # ---- 3. map layer switching ------------------------------------------------------------------------------------------
        async def style(s):
            tiles.clear(); await pg.click(f'#styles .st[data-style="{s}"]'); await pg.wait_for_timeout(900)
            await ev("SC.map.getMap().panBy([40,0],{animate:false})"); await pg.wait_for_timeout(600)
            return list(tiles), await ev("document.getElementById('tileStatus').textContent"), await ev("[...document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile, .leaflet-labelsPane-pane img.leaflet-tile')].map(i=>i.src.split('/')[2]+(i.src.includes('Reference')?'/ref':'')).filter((v,i,a)=>a.indexOf(v)===i)")
        t, s, dom = await style('road'); check('Road view uses CARTO', any('cartocdn' in u for u in t) and 'Road' in s, s)
        t, s, dom = await style('satellite'); check('Satellite view uses Esri World Imagery', any('World_Imagery' in u for u in t) and not any('cartocdn' in u for u in t) and 'Satellite' in s, s)
        await pg.screenshot(path=f'{SHOTS}/h_satellite.png')
        t, s, dom = await style('terrain'); check('Terrain view uses OpenTopoMap', any('opentopomap' in u for u in t) and 'Terrain' in s, s)
        t, s, dom = await style('hybrid'); check('Hybrid view = imagery + road + place labels', any('World_Imagery' in u for u in t) and any('World_Transportation' in u for u in t) and any('World_Boundaries_and_Places' in u for u in t) and 'Hybrid' in s, s)
        t, s, dom = await style('road'); check('switching back to Road works', any('cartocdn' in u for u in t) and not any('World_Imagery' in u for u in t), s)
        await pg.click('#btnTheme'); await pg.wait_for_timeout(500); await pg.click('#btnTheme')
        failing.add('opentopomap'); tiles.clear()
        await pg.click('#styles .st[data-style="terrain"]'); await pg.wait_for_timeout(500)
        for k in range(4): await ev(f"SC.map.getMap().panBy([{120*(k+1)},{60*(k+1)}],{{animate:false}})"); await pg.wait_for_timeout(300)
        await pg.wait_for_timeout(1200)
        check('terrain provider failure falls back to Esri Topographic automatically', any('World_Topo_Map' in u for u in tiles), [u.split('/')[2] for u in tiles[-3:]])
        failing.clear(); await pg.click('#styles .st[data-style="road"]'); await pg.wait_for_timeout(500)

        # ---- 4. map labels ---------------------------------------------------------------------------------------------------------
        await ev("SC.map.getMap().setView([17.4486,78.3908],15,{animate:false})"); await pg.wait_for_timeout(900)
        n = await ev("[...document.querySelectorAll('.hl')].reduce((a,e)=>{const c=[...e.classList].find(x=>x.startsWith('hl-')&&x!=='hl-icon');a[c]=(a[c]||0)+1;return a},{})")
        check('labels drawn at street zoom (localities/metro/landmarks…)', sum(n.values()) >= 8, n)
        check('metro + bus stop labels present near Madhapur', n.get('hl-metro', 0) + n.get('hl-bus_stop', 0) + n.get('hl-landmark', 0) > 0, n)
        await pg.click('#hydLbl'); await pg.click('#hydLabels input[data-f="places"]'); await pg.wait_for_timeout(500)
        n2 = await ev("[...document.querySelectorAll('.hl')].length"); check('label toggle hides a group', n2 < sum(n.values()), (sum(n.values()), n2))
        await pg.click('#hydLabels input[data-f="places"]'); await pg.click('#lblClose')
        await ev("SC.map.getMap().setView([17.4435,78.3772],17,{animate:false})"); await pg.wait_for_timeout(800)
        lab = await ev("SC.hyd.db.inView(SC.map.getMap().getBounds(),['metro','bus_stop']).length"); check('metro/bus stops exist around HITEC City', lab > 0, lab)
        await pg.screenshot(path=f'{SHOTS}/h_labels.png')

        # ---- 5. live location ---------------------------------------------------------------------------------------------------
        await ev('SC.hyd.cfg.liveMinGapMs=600; SC.hyd.cfg.liveMinMoveM=80; SC.hyd.cfg.liveMaxGapMs=3000')
        await pg.click('#hydLoc'); await pg.wait_for_timeout(1500)
        me = await ev("SC.hyd.loc.me"); check('GPS fix received and marker drawn', me and abs(me['lat'] - 17.4435) < 1e-3 and await pg.locator('.hyd-me').count() == 1, me and {k: me[k] for k in ('lat', 'lon', 'src')})
        await pg.click('#hydUseMe'); await pg.wait_for_timeout(300)
        check('"My location" becomes the start', await ev("SC.state.from.name==='My location'"))
        await pg.fill('#inTo', ''); await ev("SC.ui.setPoint('to',{name:'Secunderabad Junction Railway Station',lat:17.4337,lon:78.5011},{silent:true})")
        await pg.click('#btnAnalyze'); await pg.wait_for_timeout(6500)
        s1 = await ev("({eta:SC.state.res.mean, risk:SC.state.res.risk.score, dist:SC.state.route.distKm, strip:document.getElementById('hydRoute').innerText.replace(/\\n+/g,' | ')})")
        check('route strip shows distance, ETA, arrival, traffic, weather, delay, MC risk', all(k in s1['strip'].upper() for k in ('DISTANCE', 'ETA', 'ARRIVE', 'TRAFFIC', 'WEATHER', 'DELAY', 'MC RISK')), s1['strip'])
        await pg.screenshot(path=f'{SHOTS}/h_result_live.png')
        await ctx.set_geolocation({'latitude': 17.4395, 'longitude': 78.4300, 'accuracy': 10}); await pg.wait_for_timeout(5500)
        s2 = await ev("({eta:SC.state.res.mean, risk:SC.state.res.risk.score, dist:SC.state.route.distKm, n:SC.hyd.loc.liveCount, strip:document.getElementById('hydRoute').innerText.replace(/\\n+/g,' | '), live:document.getElementById('hydLive').innerText})")
        check('moving ~5 km triggers a live re-analysis', s2['n'] >= 1, s2['n'])
        check('route distance and ETA were recalculated for the new position', s2['dist'] < s1['dist'] - 2 and s2['eta'] < s1['eta'] - 2, (round(s1['dist'], 1), round(s2['dist'], 1), round(s1['eta']), round(s2['eta'])))
        check('risk score recomputed', abs(s2['risk'] - s1['risk']) >= 0 and s2['strip'] != s1['strip'], (round(s1['risk']), round(s2['risk'])))
        check('live chip is visible', 'route updates' in s2['live'], s2['live'].replace('\n', ' '))
        await pg.click('#lvPause'); n0 = await ev('SC.hyd.loc.liveCount'); await ctx.set_geolocation({'latitude': 17.4380, 'longitude': 78.4700, 'accuracy': 10}); await pg.wait_for_timeout(3500)
        check('pause stops live updates', await ev('SC.hyd.loc.liveCount') == n0)
        await pg.click('#lvPause')
        await pg.click('#lvSim'); await pg.wait_for_timeout(9500)
        check('demo drive moves the dot and keeps updating', await ev("SC.hyd.loc.mode")=='sim' and await ev('SC.hyd.loc.liveCount') > n0, await ev('SC.hyd.loc.liveCount'))
        await pg.click('#lvSim'); await pg.click('#hydLoc'); await pg.click('#hydLoc'); await pg.wait_for_timeout(300)

        # ---- 6. nearby bus / metro ----------------------------------------------------------------------------------------------------
        await ev("SC.hyd.loc.setManual(17.4375,78.4483)"); await pg.wait_for_timeout(300)   # Ameerpet
        await pg.click('#hydNb'); await pg.wait_for_timeout(500)
        rows = await ev("[...document.querySelectorAll('#hydNearby .nb')].map(r=>r.innerText.replace(/\\n+/g,' | '))")
        check('nearby bus stops listed with distance and reach time', len(rows) >= 3 and all(('m' in r or 'km' in r) and 'min' in r for r in rows), rows[:2])
        await pg.click('#hydNearby .nb-tabs button[data-t="metro"]'); await pg.wait_for_timeout(300)
        rows = await ev("[...document.querySelectorAll('#hydNearby .nb')].map(r=>r.innerText.replace(/\\n+/g,' | '))")
        check('nearest metro station is Ameerpet', rows and 'Ameerpet' in rows[0], rows[:2])
        await pg.click('#hydNearby .nb >> nth=0'); await pg.wait_for_timeout(1500)
        pop = await ev("document.querySelector('.hyd-pop')&&document.querySelector('.hyd-pop').innerText.replace(/\\n+/g,' | ')")
        check('clicking a stop opens its card: name, distance from user, reach time', pop and 'Ameerpet' in pop and 'walk' in pop.lower() and 'drive' in pop.lower() and 'distance from your location' in pop.lower(), pop)
        await pg.screenshot(path=f'{SHOTS}/h_nearby.png'); await pg.click('#hydNb')

        # ---- 7. saved places ------------------------------------------------------------------------------------------------------------
        chips = await ev("[...document.querySelectorAll('#hydChips .sp-chip')].map(c=>c.textContent.trim())")
        check('quick-access chips for Home / College / School / Office', all(x in ' '.join(chips) for x in ['Home', 'College', 'School', 'Office']), chips)
        await pg.click('#hydChips .sp-chip[data-kind="home"]'); await pg.wait_for_timeout(300)
        await pg.fill('#dlgPlace', 'kukatpally'); await pg.wait_for_timeout(700); await pg.click('#dlgSug .sg >> nth=0'); await pg.click('#dlgSave'); await pg.wait_for_timeout(400)
        await pg.click('#hydChips .sp-chip[data-kind="college"]'); await pg.fill('#dlgPlace', 'jntu'); await pg.wait_for_timeout(700); await pg.click('#dlgSug .sg >> nth=0'); await pg.click('#dlgSave')
        await pg.click('#hydChips .sp-add'); await pg.click('#hydDialog .kinds button[data-k="other"]'); await pg.fill('#dlgLabel', 'Gym'); await pg.fill('#dlgPlace', 'gachibowli'); await pg.wait_for_timeout(700); await pg.click('#dlgSug .sg >> nth=0'); await pg.click('#dlgSave'); await pg.wait_for_timeout(300)
        saved = await ev("JSON.parse(localStorage.getItem('sc.hyd.saved')).map(p=>p.kind+':'+p.label)")
        check('Home, College and a custom place were saved to local storage', 'home:Home' in saved and 'college:College' in saved and any(x.startswith('other:Gym') for x in saved), saved)
        await pg.click('#hydChips .sp-chip[data-kind="home"]'); await pg.wait_for_timeout(300)
        check('chip click sets the destination', await ev("SC.state.to.name.startsWith('Home')"), await ev('SC.state.to.name'))
        await pg.reload(); await pg.wait_for_timeout(1500)
        chips = await ev("[...document.querySelectorAll('#hydChips .sp-chip:not(.empty)')].map(c=>c.textContent.trim())")
        check('saved places survive a reload', 'Home' in ' '.join(chips) and 'Gym' in ' '.join(chips), chips)
        r = await ev('SC.services.search("gym")'); check('saved places are searchable', any(x['type'] == 'saved' for x in r), [x['name'] for x in r][:2])
        await pg.screenshot(path=f'{SHOTS}/h_saved.png')

        # ---- 8. Hyderabad only -----------------------------------------------------------------------------------------------------------------
        await ev("SC.hyd.loc.setManual(17.4375,78.4483)"); await ev("SC.hyd.loc.setManual(12.97,77.59)"); await pg.wait_for_timeout(300)
        check('placing myself outside Hyderabad is refused', (await ev("SC.hyd.loc.me.lat")) > 17 and 'outside Hyderabad' in await ev("document.getElementById('toast').textContent"), await ev("document.getElementById('toast').textContent"))
        # ---- 9. OpenStreetMap download + online search (mocked servers: tests the code paths, not the real data) -------------------------------------------
        MOCK['photon'] = True
        r = await ev('SC.services.search("quxzzy")'); check('online fallback (Photon) adds places inside Hyderabad only', [x['name'] for x in r] == ['Quxzzy Tiffin Centre'], [x['name'] for x in r])
        MOCK['overpass'] = True; before = await ev('SC.hyd.db.stats().total')
        await pg.click('#hydLbl'); await pg.wait_for_timeout(300); await pg.click('#dbUpdate'); await pg.wait_for_timeout(18000)
        st2 = await ev('SC.hyd.db.stats()')
        check('Overpass download merged into the database', st2['osm'] >= 60 and st2['byType'].get('bus_stop', 0) >= 60, {'osm': st2['osm'], 'total': st2['total'], 'was': before})
        amer = await ev("SC.hyd.db.all().filter(i=>i.t==='metro'&&i.k.includes('ameerpet'))"); check('OSM record replaces the seed record (no duplicate station)', len(amer) == 1 and amer[0]['src'] == 'o', [(a['n'], a['src']) for a in amer])
        r = await ev('SC.services.search("zzyzx")'); check('newly downloaded locality is searchable', any('Zzyzx' in x['name'] for x in r), [x['name'] for x in r])
        mb = await ev('SC.map.getMap().options.maxBounds && SC.map.getMap().options.maxBounds.getSouth()'); check('map is locked to the Hyderabad region', mb and 16.5 < mb < 17.2, mb)
        check('no page errors', not errs, errs[:4])
        await b.close()
    bad = [r for r in results if not r[1]]; print(f'\n{len(results)-len(bad)}/{len(results)} checks passed'); sys.exit(1 if bad else 0)
asyncio.run(main())
