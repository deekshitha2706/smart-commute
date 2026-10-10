#!/usr/bin/env python3
"""Browser tests for: (1) live location, (2) map themes, (3) traffic rerouting.
Run from the project root:   python tests/web/fixes_e2e.py
Needs: pip install playwright   (and a Chromium; set CHROMIUM=/path/to/chrome if Playwright's own is not installed).
Every network service is mocked (OSRM, TomTom, tiles, weather, search) so the tests are deterministic and offline.
Nothing here talks to a real traffic or GPS provider: GPS is the browser's mocked Geolocation API, TomTom is a mock server answer."""
import asyncio, functools, http.server, json, math, os, re, sys, threading, urllib.parse
from playwright.async_api import async_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'app', 'web')
CHROME = os.environ.get('CHROMIUM') or next((p for p in ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'] if os.path.exists(p)), None)
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')
BRIDGE = """
window.__sent=[];
window.__fake={ _l:{}, addEventListener(n,f){this._l[n]=f;},
  sendEventToMATLAB(n,d){ window.__sent.push([n,d]);
    if(n==='analyze'){ const req=JSON.parse(d); const r=JSON.parse(JSON.stringify(window.SC.demo.analyze(req)));
      setTimeout(()=>this._l.result({Data:JSON.stringify({id:req.id,result:r})}),120);}
    if(n==='ready'){ setTimeout(()=>this._l.engine({Data:JSON.stringify({records:12000})}),30);} }};
window.setup(window.__fake);
"""
RESULTS = []
def check(name, cond, info=''):
    RESULTS.append((name, bool(cond))); print(('PASS  ' if cond else 'FAIL  ') + name + ('   [' + str(info)[:230] + ']' if info != '' else ''))

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve(port):
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Q, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv

def line(a, b, bulge, n=24):
    (x1, y1), (x2, y2) = a, b; out = []
    for i in range(n + 1):
        t = i / n; out.append([x1 + (x2 - x1) * t + bulge * math.sin(math.pi * t), y1 + (y2 - y1) * t + bulge * 0.4 * math.sin(math.pi * t)])
    return out

def tail_from(coords, x1, y1):
    """what a real router does when you are already on a road: the remaining part of the same road (nearest vertex onward)"""
    i = min(range(len(coords)), key=lambda k: (coords[k][0] - x1) ** 2 + (coords[k][1] - y1) ** 2)
    return [[x1, y1]] + coords[i + 1:]

TRUNK = {}   # destination -> geometries of the roads first returned for it (lon,lat)
def roads(x1, y1, x2, y2, specs):
    key = (round(x2, 5), round(y2, 5))
    if key not in TRUNK or hypot_deg(TRUNK[key][0][0], (x1, y1)) > 0.2: TRUNK[key] = [line((x1, y1), (x2, y2), b) for b, _, _ in specs]; return TRUNK[key]
    return [tail_from(c, x1, y1) if hypot_deg(c[0], (x1, y1)) > 1e-9 else c for c in TRUNK[key]]
def hypot_deg(a, b): return math.hypot(a[0] - b[0], a[1] - b[1])

class Net:
    """mutable mock backend"""
    def __init__(self):
        self.tiles = 'ok'            # ok | fail:<regex of hosts> | stall:<regex>
        self.osrm = 'ok'             # ok | down | single
        self.tomtom = 'ok'           # ok | 403 | 429
        self.tt_delay = [720, 60, 0] # traffic delay seconds per route
        self.log = []                # (kind, url)
        self.tt_calls = []
net = Net()

async def handler(route):
    u = route.request.url; net.log.append(u)
    host = urllib.parse.urlparse(u).netloc
    if re.search(r'(tile|basemaps\.cartocdn|arcgisonline|opentopomap)', u) and not host.startswith('127.0.0.1'):
        m = re.match(r'(fail|stall):(.*)', net.tiles)
        if m and re.search(m.group(2), u):
            if m.group(1) == 'stall': await asyncio.sleep(14); return await route.abort()
            return await route.fulfill(status=403, body='blocked')
        return await route.fulfill(status=200, content_type='image/png', body=PNG)
    if 'router.project-osrm.org' in u:
        if net.osrm == 'down': return await route.abort()
        m = re.search(r'driving/([\d.]+),([\d.]+);([\d.]+),([\d.]+)', u); x1, y1, x2, y2 = map(float, m.groups())
        specs = [(0, 14000, 1500), (0.012, 16500, 1560), (-0.014, 18200, 1700)]
        if net.osrm == 'single': specs = specs[:1]
        gs = roads(x1, y1, x2, y2, specs)
        rs = [{'geometry': {'coordinates': g}, 'distance': d, 'duration': t} for g, (b, d, t) in zip(gs, specs)]
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'routes': rs}))
    if 'api.tomtom.com' in u:
        net.tt_calls.append(u)
        if net.tomtom in ('403', '429'): return await route.fulfill(status=int(net.tomtom), body='{}')
        m = re.search(r'calculateRoute/([\d.]+),([\d.]+):([\d.]+),([\d.]+)/', u); y1, x1, y2, x2 = map(float, m.groups())
        specs = [(0, 14000, 1500), (0.012, 16500, 1560), (-0.014, 18200, 1700)]
        rs = []
        gs = roads(x1, y1, x2, y2, specs)
        for g, (b, d, t), dl in zip(gs, specs, net.tt_delay):
            pts = [{'latitude': p[1], 'longitude': p[0]} for p in g]
            rs.append({'summary': {'lengthInMeters': d, 'travelTimeInSeconds': t + dl, 'trafficDelayInSeconds': dl, 'noTrafficTravelTimeInSeconds': t}, 'legs': [{'points': pts}]})
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'routes': rs}))
    if 'photon' in u or 'nominatim' in u: return await route.fulfill(status=200, content_type='application/json', body='{"features":[]}')
    if 'open-meteo' in u or 'overpass' in u or 'fonts.g' in u: return await route.abort()
    return await route.continue_()

async def new_page(b, geo=None, perms=None, init=None, key=None, matlab=False):
    kw = dict(viewport={'width': 1520, 'height': 900})
    if geo: kw['geolocation'] = geo
    kw['permissions'] = perms if perms is not None else (['geolocation'] if geo else [])
    ctx = await b.new_context(**kw)
    await ctx.route('**/*', lambda r: r.continue_() if urllib.parse.urlparse(r.request.url).netloc.startswith('127.0.0.1') else handler(r))
    if init: await ctx.add_init_script(init)
    if key: await ctx.add_init_script("localStorage.setItem('sc.hyd.tomtomKey', JSON.stringify(%s))" % json.dumps(key))
    pg = await ctx.new_page(); pg.errs = []; pg.on('pageerror', lambda e: pg.errs.append(str(e)[:250]))
    await pg.goto('http://127.0.0.1:8781/index.html'); await pg.wait_for_timeout(1400)
    if matlab: await pg.evaluate(BRIDGE); await pg.wait_for_timeout(300)
    return ctx, pg

async def text(pg, sel): return await pg.evaluate("(s)=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():''}", sel)
async def toasts(pg): return await text(pg, '#toast')

# =========================================================================================================== 1. live location
async def test_location(b):
    print('\n--- 1. LIVE LOCATION')
    ctx, pg = await new_page(b, geo={'latitude': 17.4435, 'longitude': 78.3772, 'accuracy': 25})
    await pg.click('#hydLoc'); await pg.wait_for_timeout(2200)
    me = await pg.evaluate("SC.hyd.loc.me")
    check('device position is shown as reported by the browser', me and abs(me['lat'] - 17.4435) < 1e-6 and abs(me['lon'] - 78.3772) < 1e-6 and me['src'] == 'gps', me)
    mk = await pg.evaluate("(()=>{const m=SC.map.getMap();let mk=null,c=null;m.eachLayer(l=>{if(l instanceof L.Circle)c=l; if(l.options&&l.options.zIndexOffset===900)mk=l;});return {mk:mk&&[mk.getLatLng().lat,mk.getLatLng().lng],r:c&&c.getRadius(),op:c&&c.options.fillOpacity}})()")
    check('marker sits on the reported coordinates', mk['mk'] and abs(mk['mk'][0] - 17.4435) < 1e-6, mk)
    check('accuracy circle radius == reported accuracy (25 m)', abs(mk['r'] - 25) < 0.5 and mk['op'] > 0, mk)
    check('status chip says it is the device location with its accuracy', 'Device location' in await text(pg, '#hydLive') and '±25 m' in await text(pg, '#hydLive'), await text(pg, '#hydLive'))
    # the device moves: marker + circle follow, heading derived from real movement
    await ctx.set_geolocation({'latitude': 17.4460, 'longitude': 78.3800, 'accuracy': 60}); await pg.wait_for_timeout(2000)
    mk2 = await pg.evaluate("(()=>{const m=SC.map.getMap();let mk=null,c=null;m.eachLayer(l=>{if(l instanceof L.Circle)c=l; if(l.options&&l.options.zIndexOffset===900)mk=l;});return {mk:[mk.getLatLng().lat,mk.getLatLng().lng],r:c.getRadius(),h:SC.hyd.loc.me.heading}})()")
    check('marker moves with the device', abs(mk2['mk'][0] - 17.4460) < 1e-6 and abs(mk2['mk'][1] - 78.3800) < 1e-6, mk2)
    check('accuracy circle updates (60 m)', abs(mk2['r'] - 60) < 0.5, mk2)
    check('heading is computed from the real movement (north-east)', mk2['h'] is not None and 20 < mk2['h'] < 80, mk2['h'])
    # poor accuracy (network location)
    await ctx.set_geolocation({'latitude': 17.4470, 'longitude': 78.3810, 'accuracy': 3200}); await pg.wait_for_timeout(2000)
    r = await pg.evaluate("(()=>{let c=null;SC.map.getMap().eachLayer(l=>{if(l instanceof L.Circle)c=l});return c.getRadius()})()")
    check('poor accuracy is drawn as-is (3.2 km circle), not hidden or capped', abs(r - 3200) < 1, r)
    check('user is told the fix is rough', 'accuracy' in (await toasts(pg)).lower(), await toasts(pg))
    check('no page errors', not pg.errs, pg.errs); await ctx.close()

    # permission denied: nothing is invented
    ctx, pg = await new_page(b, geo=None, perms=[])
    await pg.click('#hydLoc'); await pg.wait_for_timeout(1800)
    check('denied: mode=denied and NO position is faked', await pg.evaluate("SC.hyd.loc.mode") == 'denied' and await pg.evaluate("SC.hyd.loc.me") is None)
    check('denied: no marker on the map', await pg.locator('.hyd-me').count() == 0)
    check('denied: message explains how to allow it', 'permission' in (await toasts(pg)).lower(), await toasts(pg))
    await ctx.close()

    # insecure context: the API must not even be called
    init = "Object.defineProperty(window,'isSecureContext',{value:false}); window.__geoCalls=0; const _w=navigator.geolocation.watchPosition.bind(navigator.geolocation); navigator.geolocation.watchPosition=function(){window.__geoCalls++;return _w.apply(null,arguments)}"
    ctx, pg = await new_page(b, geo={'latitude': 17.44, 'longitude': 78.38, 'accuracy': 20}, init=init)
    await pg.click('#hydLoc'); await pg.wait_for_timeout(800)
    check('insecure page: explained, watchPosition not called, no position', 'secure' in (await toasts(pg)).lower() and await pg.evaluate("window.__geoCalls") == 0 and await pg.evaluate("SC.hyd.loc.me") is None, await toasts(pg))
    await ctx.close()

    # POSITION_UNAVAILABLE then recovery; TIMEOUT on high accuracy falls back to network location
    init = """(()=>{ let n=0, ids=0; const cbs={}; navigator.geolocation.watchPosition=function(ok,err,opt){ const id=++ids; window.__opts=(window.__opts||[]).concat([opt]); cbs[id]={ok,err};
        setTimeout(()=>{ if(opt.enableHighAccuracy){ err({code:3,message:'Timeout expired'}); } else { err({code:2,message:'Network location provider unavailable'}); setTimeout(()=>ok({coords:{latitude:17.43,longitude:78.45,accuracy:900,heading:null,speed:null},timestamp:Date.now()}),1500);} },200); return id; };
        navigator.geolocation.clearWatch=function(){}; navigator.geolocation.getCurrentPosition=function(){}; })();"""
    ctx, pg = await new_page(b, geo={'latitude': 17.43, 'longitude': 78.45, 'accuracy': 900}, init=init)
    await pg.click('#hydLoc'); await pg.wait_for_timeout(3500)
    opts = await pg.evaluate("window.__opts")
    me = await pg.evaluate("SC.hyd.loc.me")
    check('high-accuracy timeout -> retries with network location', len(opts) >= 2 and opts[0]['enableHighAccuracy'] and not opts[1]['enableHighAccuracy'], opts)
    check('GPS error (code 2) does not kill the watch; later fix is accepted', me is not None and me['src'] == 'gps' and abs(me['acc'] - 900) < 1, me)
    await ctx.close()

    # manual / simulated positions are labelled and never drawn as GPS
    ctx, pg = await new_page(b, geo={'latitude': 17.4435, 'longitude': 78.3772, 'accuracy': 25}, matlab=True)
    await pg.evaluate("SC.hyd.loc.setManual(17.40,78.46)"); await pg.wait_for_timeout(500)
    check('manual position: chip says "not GPS", marker styled differently, no accuracy circle',
          'not GPS' in await text(pg, '#hydLive') and await pg.locator('.hyd-me.not-gps').count() == 1 and await pg.evaluate("(()=>{let c=null;SC.map.getMap().eachLayer(l=>{if(l instanceof L.Circle)c=l});return c.options.fillOpacity===0})()"), await text(pg, '#hydLive'))
    await ctx.close()

# =========================================================================================================== 2. map themes
STYLES = {'road': (['cartocdn'], 1), 'satellite': (['arcgisonline'], 1), 'terrain': (['opentopomap'], 1), 'hybrid': (['arcgisonline'], 3)}
async def layer_info(pg):
    return await pg.evaluate("""()=>{const q=s=>[...document.querySelectorAll(s)];
      const layers=q('.leaflet-tile-pane > .leaflet-layer, .leaflet-labels-pane > .leaflet-layer');
      const srcs=q('.leaflet-tile').map(i=>i.src).filter(s=>s.startsWith('http'));
      return {layers:layers.length, hosts:[...new Set(srcs.map(s=>new URL(s).host))], paths:[...new Set(srcs.map(s=>new URL(s).pathname.replace(/\\/\\d+\\/\\d+\\/\\d+.*/,'/Z/X/Y')))],
              attr:(document.querySelector('.leaflet-control-attribution')||{}).innerText||'', chip:(document.getElementById('tileStatus')||{}).innerText||''}}""")
async def pick_style(pg, s):
    await pg.click('#styles .st[data-style="%s"]' % s); await pg.wait_for_timeout(1300)
async def test_tiles(b):
    print('\n--- 2. MAP THEMES')
    net.tiles = 'ok'; ctx, pg = await new_page(b)
    for s, (hosts, nl) in STYLES.items():
        await pick_style(pg, s); i = await layer_info(pg)
        check('%s: provider %s, %d tile layer(s), no duplicates' % (s, hosts, nl), i['layers'] == nl and all(any(h in x for x in i['hosts']) for h in hosts), i)
    # tile URL shape per provider (z/x/y order) from real requests
    await pick_style(pg, 'satellite'); i = await layer_info(pg)
    check('Esri imagery URL is .../tile/{z}/{y}/{x} on World_Imagery', any('World_Imagery/MapServer/tile/Z/X/Y' in p for p in i['paths']), i['paths'])
    await pick_style(pg, 'terrain'); i = await layer_info(pg); check('OpenTopoMap URL is {s}.tile.opentopomap.org/z/x/y.png', any(re.match(r'/Z/X/Y', p) or p.startswith('/Z') for p in i['paths']) and all('tile.opentopomap.org' in h for h in i['hosts']), i)
    await pick_style(pg, 'hybrid'); i = await layer_info(pg); check('hybrid = imagery + roads + places labels', any('World_Transportation' in p for p in i['paths']) and any('World_Boundaries_and_Places' in p for p in i['paths']) and any('World_Imagery' in p for p in i['paths']), i['paths'])
    # attribution
    for s, want in [('road', 'CARTO'), ('satellite', 'Esri'), ('terrain', 'OpenTopoMap'), ('hybrid', 'Esri')]:
        await pick_style(pg, s); i = await layer_info(pg); check('attribution for %s mentions %s and OpenStreetMap/Esri source' % (s, want), want in i['attr'] and ('OpenStreetMap' in i['attr'] or 'Esri' in i['attr']) and i['attr'].count(want) <= 2, i['attr'][:140])
    # rapid switching + theme toggles never stack layers
    for s in ['hybrid', 'road', 'satellite', 'terrain', 'hybrid', 'satellite', 'road', 'terrain', 'road', 'hybrid']: await pg.click('#styles .st[data-style="%s"]' % s); await pg.wait_for_timeout(120)
    await pg.click('#btnTheme'); await pg.wait_for_timeout(400); await pg.click('#btnTheme'); await pg.wait_for_timeout(1400)
    i = await layer_info(pg); check('after 10 quick switches + 2 theme toggles: still exactly 3 layers on hybrid', i['layers'] == 3, i)
    check('active button matches the map style', await pg.evaluate("document.querySelector('#styles .st.on').dataset.style") == 'hybrid')
    check('no page errors', not pg.errs, pg.errs); await ctx.close()

    # failures and fallbacks
    cases = [('road', 'basemaps\\.cartocdn', 'tile.openstreetmap.org', 'CARTO blocked (403) -> OpenStreetMap standard'),
             ('terrain', 'opentopomap', 'server.arcgisonline.com', 'OpenTopoMap blocked -> Esri topographic'),
             ('satellite', 'server\\.arcgisonline', 'services.arcgisonline.com', 'Esri host blocked -> Esri alt host')]
    for s, bad, want, label in cases:
        net.tiles = 'fail:' + bad; ctx, pg = await new_page(b); await pick_style(pg, s) if s != 'road' else None; await pg.wait_for_timeout(2500)
        i = await layer_info(pg); check(label, any(want in h for h in i['hosts']) and 'fallback' in i['chip'].lower() and i['layers'] == 1, (i['hosts'], i['chip']))
        await ctx.close()
    net.tiles = 'fail:arcgisonline'; ctx, pg = await new_page(b); await pick_style(pg, 'hybrid'); await pg.wait_for_timeout(3000); i = await layer_info(pg)
    check('hybrid with every Esri host blocked: label overlays fall back to CARTO labels, no stacking', any('cartocdn' in h for h in i['hosts']) and i['layers'] == 3, (i['hosts'], i['layers'])); await ctx.close()
    net.tiles = 'fail:.'; ctx, pg = await new_page(b); await pg.wait_for_timeout(3000); i = await layer_info(pg)
    check('ALL providers failing: the chip says tiles are unavailable (no silent blank map)', 'unavailable' in i['chip'].lower(), i['chip'])
    net.tiles = 'ok'; await pg.click('#tileStatus'); await pg.wait_for_timeout(2500); i = await layer_info(pg)
    check('click on the red chip retries and recovers', 'unavailable' not in i['chip'].lower() and i['layers'] == 1, i['chip']); await ctx.close()
    net.tiles = 'stall:basemaps\\.cartocdn'; ctx, pg = await new_page(b); await pg.wait_for_timeout(11000); i = await layer_info(pg)
    check('stalled provider (no answer at all) is detected after ~9 s and replaced', any('tile.openstreetmap.org' in h for h in i['hosts']) or 'fallback' in i['chip'].lower(), i['chip']); await ctx.close(); net.tiles = 'ok'

# =========================================================================================================== 3. rerouting
async def analyze(pg, wait=5200):
    await pg.click('#btnAnalyze'); await pg.wait_for_timeout(wait)
async def panel(pg): return await text(pg, '#hydAlt')
async def test_reroute(b):
    print('\n--- 3. TRAFFIC REROUTING')
    # --- A. no key: nothing may be called live
    net.osrm = 'ok'; net.tomtom = 'ok'; net.tt_calls.clear(); ctx, pg = await new_page(b, matlab=True)
    await analyze(pg); st = await pg.evaluate("(()=>{const s=SC.hyd.reroute.st;return {n:s.alts.length,mode:s.status.mode,cmp:Object.keys(s.cmp).length,traffic:s.alts.map(a=>a.traffic)}})()")
    check('no key: 3 alternatives from OSRM, each analysed by the Monte Carlo engine', st['n'] == 3 and st['cmp'] == 3 and st['mode'] == 'model', st)
    p = await panel(pg); src = await text(pg, '#alSrc')
    check('no key: panel says MODEL · NOT LIVE, never "live traffic"', 'NOT LIVE' in src and 'LIVE TRAFFIC' not in src and all(t == 'none' for t in st['traffic']), src)
    check('no key: no request went to any traffic provider', not net.tt_calls)
    check('no key: ETA label is "model", not "live"', re.search(r'\bmodel\b', p) and not re.search(r'\blive\b(?! traffic feed)', p.replace('Enable live traffic', '').replace('No live traffic feed', '')), p[:300])
    sent = await pg.evaluate("window.__sent.filter(s=>s[0]==='analyze').map(s=>JSON.parse(s[1]))")
    check('comparison requests to MATLAB are flagged alt:true (so PDF reports keep the main route)', sum(1 for r in sent if r.get('alt')) >= 2 and not sent[0].get('alt'), [r.get('alt') for r in sent])
    strip = await text(pg, '#hydRoute'); check('route strip labels the data "Modelled"', 'Modelled' in strip, strip[-90:])
    # map shows two dashed alternatives
    n = await pg.evaluate("(()=>{let k=0;SC.hyd.reroute.st.layer.eachLayer(l=>{if(l.options.dashArray)k++});return k})()"); check('map draws 2 clickable alternative lines', n == 2, n)
    # switch to B through the panel
    before = await pg.evaluate("({d:SC.state.route.distKm, m:SC.state.res.mean, bud:SC.state.budget})")
    await pg.click('#hydAlt [data-go="1"]'); await pg.wait_for_timeout(2500)
    after = await pg.evaluate("({d:SC.state.route.distKm, m:SC.state.res.mean, bud:SC.state.budget, act:SC.hyd.reroute.st.active, pref:!!SC.hyd.reroute.st.pref})")
    check('switching changes route, distance and recalculates ETA with the same time budget', abs(after['d'] - 16.5) < 0.05 and after['act'] == 1 and after['m'] != before['m'] and abs(after['bud'] - before['bud']) < 0.01, (before, after))
    check('after switching the panel shows B as ACTIVE', re.search(r'B\s+\d+ min', await panel(pg)) and 'ACTIVE' in await panel(pg))
    # click an alternative on the map
    await pg.evaluate("SC.hyd.reroute.st.layer.eachLayer(l=>{if(l.options.dashArray&&!window.__clicked){window.__clicked=1;l.fire('click')}})"); await pg.wait_for_timeout(2500)
    check('clicking a grey alternative on the map switches to it', await pg.evaluate("SC.hyd.reroute.st.active") != 1)
    # moving user keeps following the chosen road
    await pg.evaluate("SC.hyd.reroute.choose(1)"); await pg.wait_for_timeout(2000)
    await pg.evaluate("SC.hyd.loc.setManual(17.4400,78.3900)"); await pg.click('#hydUseMe'); await pg.wait_for_timeout(300)
    check('no errors', not pg.errs, pg.errs); await ctx.close()

    # --- B. TomTom live key: delay detected, faster alternative offered
    net.tomtom = 'ok'; net.tt_delay = [720, 60, 0]; net.tt_calls.clear(); ctx, pg = await new_page(b, key='TEST-KEY-123', matlab=True)
    await pg.fill('#inTime', (await pg.evaluate("(()=>{const d=new Date(Date.now()+10*60000);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')})()"))); await pg.evaluate("document.getElementById('inDate').value=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()")
    await analyze(pg, 6500); s = await text(pg, '#alSrc'); p = await panel(pg)
    check('key + trip within 45 min: source is LIVE TRAFFIC (TomTom)', 'LIVE TRAFFIC' in s, s)
    check('TomTom key is only ever sent to api.tomtom.com', all('api.tomtom.com' in u for u in net.tt_calls) and net.tt_calls and not any('TEST-KEY-123' in u for u in net.log if 'tomtom' not in u), len(net.tt_calls))
    check('request asks for traffic, alternatives and all travel-time variants', 'traffic=true' in net.tt_calls[0] and 'maxAlternatives=2' in net.tt_calls[0] and 'computeTravelTimeFor=all' in net.tt_calls[0], net.tt_calls[0][:200])
    al = await text(pg, '#alAlert'); check('delay detected: +12 min live delay and the faster route is proposed', 'Live delay +12 min' in al and ('B is' in al or 'C is' in al), al)
    live_eta = await pg.evaluate("SC.hyd.reroute.st.alts.map(a=>Math.round(a.trafficMin))"); check('ETAs use TomTom travel time incl. traffic (A=37, B=27, C=28)', live_eta == [37, 27, 28], live_eta)
    await pg.click('#alSwitchBest'); await pg.wait_for_timeout(2600); check('one-click switch to the faster route works', await pg.evaluate("SC.hyd.reroute.st.active") != 0 or (await pg.evaluate("SC.state.route.distKm")) != 14.0, await pg.evaluate("SC.state.route.distKm"))
    # traffic changes -> poll updates
    net.tt_delay = [0, 900, 0]; n0 = len(net.tt_calls); await pg.evaluate("SC.hyd.reroute.poll()"); await pg.wait_for_timeout(3000)
    live_eta2 = await pg.evaluate("SC.hyd.reroute.st.alts.map(a=>[a.distKm.toFixed(1),Math.round(a.trafficMin)])")
    check('re-poll fetched fresh data and ETAs changed with the traffic', len(net.tt_calls) > n0 and live_eta2 != live_eta, live_eta2)
    check('toast tells the user the live ETA changed', 'ETA changed' in await toasts(pg) or 'Live traffic' in await toasts(pg), await toasts(pg))
    check('no errors', not pg.errs, pg.errs); await ctx.close()

    # --- C. future departure with a key: typical traffic, never called live
    net.tt_delay = [600, 0, 0]; net.tt_calls.clear(); ctx, pg = await new_page(b, key='TEST-KEY-123')
    await pg.evaluate("document.getElementById('inDate').value=(()=>{const d=new Date(Date.now()+86400000*2);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()"); await pg.fill('#inTime', '09:00')
    await analyze(pg, 6500); s = await text(pg, '#alSrc'); check('trip planned 2 days ahead: TYPICAL TRAFFIC, not live', 'TYPICAL' in s and 'LIVE TRAFFIC' not in s, s)
    check('departAt is sent for the planned time', 'departAt=' in net.tt_calls[0], net.tt_calls[0][-120:]); check('no "live delay" alert for typical data', 'Live delay' not in await text(pg, '#alAlert'), await text(pg, '#alAlert')); await ctx.close()

    # --- D. bad key
    net.tomtom = '403'; net.tt_calls.clear(); ctx, pg = await new_page(b, key='BAD'); await analyze(pg, 6000); s = await text(pg, '#alSrc'); p = await panel(pg)
    check('rejected key: panel says NO TRAFFIC DATA with the reason, routes still shown from OSRM', 'NO TRAFFIC DATA' in s and 'HTTP 403' in p and await pg.evaluate("SC.hyd.reroute.st.alts.length") == 3, s + ' | ' + p[-160:])
    net.tomtom = '429'; await pg.evaluate("SC.hyd.reroute.poll()"); await pg.wait_for_timeout(1500); await ctx.close()
    # key validation on save
    net.tomtom = '403'; ctx, pg = await new_page(b); await analyze(pg, 5200); await pg.click('#alKeyToggle'); await pg.fill('#alKey', 'WRONG'); await pg.click('#alKeySave'); await pg.wait_for_timeout(1500)
    check('saving a wrong key is refused and not stored', 'not saved' in await text(pg, '#alKeyMsg') and not await pg.evaluate("localStorage.getItem('sc.hyd.tomtomKey')"), await text(pg, '#alKeyMsg'))
    net.tomtom = 'ok'; await pg.fill('#alKey', 'RIGHT-KEY'); await pg.click('#alKeySave'); await pg.wait_for_timeout(2500)
    check('saving a working key is accepted and stored locally only', await pg.evaluate("JSON.parse(localStorage.getItem('sc.hyd.tomtomKey'))") == 'RIGHT-KEY', await text(pg, '#alKeyMsg')); await ctx.close()

    # --- E. routing service down / single route / offline
    net.osrm = 'single'; net.tomtom = 'ok'; ctx, pg = await new_page(b); await analyze(pg, 5200)
    check('only one road available: panel says no alternative and nothing is invented', 'No alternative road' in await panel(pg) and await pg.evaluate("SC.hyd.reroute.st.alts.length") == 1, (await panel(pg))[:160]); await ctx.close()
    net.osrm = 'down'; ctx, pg = await new_page(b); await analyze(pg, 5200); st = await pg.evaluate("({s:SC.hyd.reroute.st.status, n:SC.hyd.reroute.st.alts.length, src:SC.state.route.source})")
    check('routing service down: straight-line estimate is labelled offline, no alternatives, no traffic claim', st['n'] == 1 and st['s']['mode'] in ('estimate', 'model') and 'Estimate' in st['src'], st); net.osrm = 'ok'; await ctx.close()

    # --- F. live movement keeps the chosen road and refreshes the numbers
    ctx, pg = await new_page(b, geo={'latitude': 17.4435, 'longitude': 78.3772, 'accuracy': 15}, matlab=True)
    await pg.evaluate("SC.hyd.cfg.liveMinGapMs=300"); await pg.click('#hydLoc'); await pg.wait_for_timeout(1500); await pg.click('#hydUseMe'); await pg.wait_for_timeout(500)
    await analyze(pg, 6500); await pg.click('#hydAlt [data-go="1"]'); await pg.wait_for_timeout(2500)
    d1 = await pg.evaluate("SC.state.route.distKm"); n1 = await pg.evaluate("SC.hyd.loc.liveCount")
    await ctx.set_geolocation({'latitude': 17.4410, 'longitude': 78.4000, 'accuracy': 15}); await pg.wait_for_timeout(9000)
    n2 = await pg.evaluate("SC.hyd.loc.liveCount"); st = await pg.evaluate("({d:SC.state.route.distKm, act:SC.hyd.reroute.st.active, from:SC.state.from.name})")
    check('user moved 2 km: route + ETA recalculated from the new position', n2 > n1 and st['from'] == 'My location', (n1, n2, st))
    check('chosen alternative (B, via the north bulge) is still the active route after the live update', abs(st['d'] - 16.5) < 0.05 and st['act'] == 1, st)
    check('no errors', not pg.errs, pg.errs); await ctx.close()

async def main():
    srv = serve(8781)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox']) if CHROME else await p.chromium.launch(args=['--no-sandbox'])
        which = (sys.argv[1] if len(sys.argv) > 1 else 'all')
        if which in ('all', 'loc'): await test_location(b)
        if which in ('all', 'tiles'): await test_tiles(b)
        if which in ('all', 'route'): await test_reroute(b)
        await b.close()
    bad = [n for n, ok in RESULTS if not ok]
    print('\n%d checks, %d passed, %d failed' % (len(RESULTS), len(RESULTS) - len(bad), len(bad)))
    for n in bad: print('  FAILED:', n)
    sys.exit(1 if bad else 0)
asyncio.run(main())
