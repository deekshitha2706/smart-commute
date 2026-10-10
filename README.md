# SmartCommute-Traffic Analyser

**Probabilistic Urban Traffic Congestion and Travel-Time Risk Assessment System** — Hyderabad

SmartCommute is a map-first traffic intelligence app. Pick a start and a destination, press **Analyze route**, and it answers one question:

> *What is the probability that I will be late if I leave at this time?*

It is **not** a turn-by-turn navigator. It models travel-time *uncertainty* using probability distributions, regression, confidence intervals and Monte Carlo simulation, and it shows live traffic only when a real traffic provider supplies it.

**Live demo:**(https://smart-commute-ntqn.onrender.com) *(replace with your Render URL)*

---

## Features

- **Map-first interface** (Leaflet): glass-style planner, animated route with a moving vehicle, congestion-coloured roads, risk gauge and result card.
- **Statistics engine:** distribution fitting (Normal, Lognormal, Gamma, Weibull by AIC/BIC), weather/hour regression, confidence intervals, risk score, recommended departure time, Monte Carlo simulation.
- **Map styles:** Road, Satellite, Terrain, Hybrid, each with fallback tile providers and correct attribution.
- **Live location:** device position via the browser Geolocation API, with moving marker and true accuracy circle. Never fakes GPS; "Simulate drive" and "I am here" are labelled *not GPS*.
- **Traffic rerouting:** alternative roads (OSRM), each analysed by the Monte Carlo engine; compare ETA, distance and risk, and switch routes. With a free TomTom key, live delays are detected and a faster route is suggested.
- **Hyderabad enhancement layer:** local place database with autocomplete, saved places (Home, College, School, Office, custom), bus and metro information, Hyderabad-only coverage.

## Two ways to run it

| | Statistics engine | Where it runs |
|---|---|---|
| **MATLAB app** | Real MATLAB engine (`src/`) + PDF reports | Your computer, `main` |
| **Web version** | JavaScript approximation (badge: *DEMO ENGINE*) | Any browser / Render |

The web version is the one deployed online. MATLAB cannot run on a static web host.

## Run locally

### In MATLAB
Requires MATLAB R2021a or newer with the Statistics and Machine Learning Toolbox.
```matlab
cd SmartCommute
runSmokeTests     % optional checks of the statistical engine
main              % launches the app
```

### In a browser (no MATLAB)
```bash
python tools/serve_web.py
```
Then open http://localhost:8000. Localhost counts as a secure page, so GPS works.

## Deploy (Render static site)

| Setting | Value |
|---|---|
| Type | Static Site |
| Build Command | `echo "nothing to build"` |
| Publish Directory | `app/web` |

Or use the included `render.yaml` as a Blueprint. Every push to `main` redeploys automatically.

## API requirements

- **Live traffic (optional):** a free [TomTom](https://developer.tomtom.com) key with the Routing API enabled. Each user pastes their own key in the Routes panel; it is stored only in their browser. Without a key, every ETA is labelled **MODEL · NOT LIVE**.
- **No key needed:** OSRM (routing), OpenStreetMap / Nominatim / Photon (search), CARTO, Esri and OpenTopoMap (map tiles), Open-Meteo (weather). These public services have fair-use limits.
- **Location:** the page must be served over HTTPS or `http://localhost`.

## Project structure

```
SmartCommute/
  main.m                 MATLAB launcher
  render.yaml            Render static-site config
  app/
    SmartCommuteApp.m    MATLAB uihtml host and event bridge
    web/                 the web interface (what Render publishes)
      index.html
      css/               style.css, hyd.css
      js/                app, map, charts, services, demo engine
      js/hyd/            Hyderabad layer: location, tiles, reroute, saved places, transit
      lib/               Leaflet (bundled)
  src/                   MATLAB statistical engine (core, stats, simulation, engine, reports)
  tools/                 serve_web.py, build_hyderabad_db.py
  tests/                 runSmokeTests.m (MATLAB), web/*.py (Playwright browser tests)
  docs/                  report, enhancement notes
```

## Method in one paragraph

For the chosen weekday, hour and weather, the engine takes the historical congestion ratio R = travel time / free-flow time, fits Normal / Lognormal / Gamma / Weibull and keeps the best AIC, draws N simulated journeys and converts them to minutes using the router's free-flow time. Probabilities, confidence intervals, the risk score and the departure recommendation come from those samples.

## Tests

```bash
pip install playwright && playwright install chromium
python tests/web/fixes_e2e.py all     # location, map themes, rerouting (mocked network)
python tests/web/hyd_e2e.py           # Hyderabad enhancement layer
```

## Limitations

- The historical dataset is **synthetic**. Replace it with real data using `importTrafficCSV`.
- Road colours are **model-based**, not live and not measured per road.
- Without a TomTom key there is **no live traffic**.
- A laptop or desktop without GPS reports Wi-Fi/IP-based location, which can be coarse and may not move. The app labels this as *Approximate location*. Use a phone for real GPS.
- The MATLAB code was written without a MATLAB licence and has not been run in MATLAB; run `runSmokeTests` first. The web interface was tested in headless Chromium against mocked network responses.
- Coverage is **Hyderabad only**.

## Tech stack

MATLAB (Statistics and Machine Learning Toolbox) · HTML / CSS / JavaScript · Leaflet · OSRM · TomTom Routing API · OpenStreetMap · Open-Meteo · Playwright (tests)

## Academic context

Built for a Probability and Statistics course: descriptive statistics, probability distributions, inference, correlation, regression and Monte Carlo simulation applied to urban travel-time risk.

## License

This project is licensed under the MIT License. See the LICENSE file. Map data © OpenStreetMap contributors; tiles © CARTO, Esri, OpenTopoMap.
