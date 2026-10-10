# Hyderabad enhancement layer

An add-on on top of SmartCommute. The analytics, Monte Carlo engine, MATLAB bridge and original screens are untouched; the add-on plugs in through a few documented hooks (`SC.hydTiles`, `SC.hook.suggestItem`, `SC.services.search/reverse`, the `sc:result` event).

| # | Feature | Where | How it works |
|---|---------|-------|--------------|
| 1 | Hyderabad place database + autocomplete | `js/hyd/seed.js`, `db.js`, `search.js`, `data/hyderabad_osm.js`, `tools/build_hyderabad_db.py` | 500+ bundled places (localities, colonies, junctions, landmarks, TSRTC stops, metro and railway stations, colleges, schools, hospitals, IT parks, government offices, malls). Overpass (OpenStreetMap) download adds the full list; it is stored in IndexedDB and refreshed every 14 days. Search order: category words ("hospitals near me") -> saved places -> local database (instant, typo tolerant) -> Photon -> Nominatim (rate limited, only when fewer than 3 hits). Non-Hyderabad results are dropped. |
| 2 | Live location | `js/hyd/location.js` | `watchPosition` marker with accuracy circle and heading. When the route starts at **My location**, moving 120 m or more (at most one update per 20 s) re-routes, re-reads weather, reruns the Monte Carlo engine (MATLAB or demo) and redraws ETA, arrival clock, congestion, weather impact, delay probability and risk. *Demo drive* moves the dot along the route to show this without GPS. Right-click -> "I am here" places you manually. |
| 3 | Saved places | `js/hyd/saved.js` | Home, College, School, Office and custom places, kept in `localStorage`, shown as chips under the planner, also found by typing "home". |
| 4 | Map views | `js/hyd/tiles.js` | Road: CARTO Dark/Voyager (fallback OSM). Satellite: Esri World Imagery. Terrain: OpenTopoMap (fallback Esri Topo). Hybrid: Esri imagery + Esri roads and places labels (fallback CARTO labels). A health check swaps to the fallback if tiles fail and a chip names the provider actually on screen. |
| 5 | Map labels | `js/hyd/layers.js` | Localities, colonies, metro/railway stations, TSRTC stops, junctions, landmarks, hospitals, colleges, schools, IT parks, malls, offices, drawn by zoom level with collision handling. Toggle in the *Map labels* panel. |
| 6 | Bus and metro information | `js/hyd/transit.js` | Nearest TSRTC stops and metro stations (list + rings on the map); a card shows name, distance from you and estimated reach time (walk and drive). |
| 7 | Route strip | `js/hyd/ui.js` | Distance, ETA (+ arrival time), traffic level, weather impact, delay probability, Monte Carlo risk score. Redrawn on every live update. |
| 8 | Hyderabad only | `js/hyd/config.js` | Bounding box 17.20-17.68 N, 78.20-78.72 E; map panning is limited to it; places and positions outside it are rejected or ignored. The old multi-city place list is no longer used. |

## Get the full OpenStreetMap list
* In the app: **Map labels** panel -> *Update from OpenStreetMap* (about a minute; also runs by itself when online and the cache is older than 14 days).
* Or pre-build it into the project: `python tools/build_hyderabad_db.py` (needs internet; writes `app/web/data/hyderabad_osm.js`).

## Limits to know
* Data and tiles come from public services (Overpass, Nominatim, Photon, OSRM, OpenStreetMap, CARTO, Esri, OpenTopoMap); heavy use needs your own server or keys.
* Reach times are estimates: straight-line distance x 1.3 at 4.8 km/h walking and 22 km/h city driving. They are not TSRTC or metro timetables.
* TSRTC stop and metro-line coverage in OpenStreetMap varies by area.
* GPS inside the MATLAB `uihtml` window may be blocked by the embedded browser; use "I am here" or open `app/web/index.html` in Chrome or Edge.

## Fix pack: live location, map themes, traffic rerouting
**Live location** (`js/hyd/location.js`): uses `watchPosition` only; shows the device's real position, a moving marker and an accuracy circle sized from `coords.accuracy`. Needs HTTPS or `http://localhost` (run `python tools/serve_web.py`). Denied / unavailable / timeout are explained, never replaced by fake coordinates. "Simulate drive" and "I am here" are labelled *not GPS*.
**Map themes** (`js/hyd/tiles.js`): Road (CARTO→OSM fallback), Satellite (Esri, alternate host fallback), Terrain (OpenTopoMap→Esri topo), Hybrid (Esri imagery + roads + labels). One tile layer at a time; attribution follows the active provider; a red chip appears if a provider fails, click to retry.
**Traffic rerouting** (`js/hyd/reroute.js`): OSRM supplies alternative roads (no traffic data). Paste a free TomTom key (developer.tomtom.com, Routing API) in the Routes panel to get live delay detection; trips departing within ±45 min use LIVE traffic, later ones TYPICAL traffic. Without a key every ETA is labelled *MODEL · NOT LIVE*. Each alternative is run through the existing Monte Carlo engine and can be selected in the panel or by clicking its line on the map; live data is re-polled every 3 minutes.
Tests: `python tests/web/fixes_e2e.py [loc|tiles|route|all]` (headless Chromium, mocked network).
