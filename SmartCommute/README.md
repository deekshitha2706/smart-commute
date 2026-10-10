# SMARTCOMMUTE
**Probabilistic Urban Traffic Congestion and Travel-Time Risk Assessment System**

SmartCommute answers one question: *what is the probability that I am late if I leave at this time?*
It is a map-first travel-risk app. The map is the whole screen; everything else floats on top of it.

1. Type a start and a destination (or click the map).
2. Pick the date and departure time.
3. Press **Analyze route**.
4. Watch the route draw itself, coloured by congestion.
5. Read the risk card: expected time, chance of being late, confidence interval, weather and congestion risk.
6. Follow the recommendation: the latest departure that keeps your risk under your tolerance.

## How it is built
| Layer | What | Where |
|-------|------|-------|
| Interface | Custom HTML / CSS / JavaScript map app (Leaflet, glass cards, canvas charts, animation) shown in one `uihtml` component | `app/web/` |
| Window | MATLAB `uifigure` that hosts the page and answers its requests | `app/SmartCommuteApp.m`, `main.m` |
| Engine | Historical data, congestion-ratio model, distribution fitting, Monte Carlo, risk score, departure scan | `src/engine/`, `src/stats/`, `src/core/` |
| Reports | Four PDF reports rendered by MATLAB | `src/reports/generateReport.m` |

```
web page --'analyze' {free, distKm, date, hour, weather, n, tol}--> MATLAB  analyzeRoute.m
web page <--'result'  {id, result}----------------------------------- MATLAB
web page --'report'   {kind}----------------------------------------> MATLAB  generateReport.m (PDF)
```

## Requirements
- MATLAB **R2022a or newer** (uihtml events) with the **Statistics and Machine Learning Toolbox**.
- Internet access for map tiles (OpenStreetMap / CARTO / Esri), place search (Photon), routing (OSRM demo server) and weather (Open-Meteo). The public OSRM and Photon servers are free demo services with fair-use limits.
  Offline, the app falls back to a built-in place list, straight-line routes and seasonal weather, and says so on screen.
- The Mapping Toolbox is **not** needed: the map is Leaflet inside the page.

## Run
```matlab
cd SmartCommute
runSmokeTests    % optional: headless checks of the numerical core
main             % opens the app
```
First start generates `data/traffic_data.mat` (12,000 records, seed 2026).
To preview the interface without MATLAB, run `python tools/serve_web.py` and open `http://localhost:8000`. The browser uses a JavaScript copy of the engine and the badge reads **Demo engine**.

## Deploy the browser demo to Render
The repository-root `render.yaml` Blueprint publishes `SmartCommute/app/web` as a static site; no build step or MATLAB installation is needed for the browser demo. Push the repository to GitHub, then in Render choose **New + → Blueprint**, connect the repository, and deploy the `smartcommute` static site. The deployed page runs the JavaScript demo engine; MATLAB analysis and PDF reports are available only when running the MATLAB app locally.

## What the map shows
- **Base maps**: Road, Satellite, Terrain, Hybrid.
- **Layers**: Traffic (route coloured green / yellow / red / dark red), Congestion (slow zones with speeds), Risk (halo coloured by risk), Heatmap, Weather (rain, fog, cloud effects), Live route (moving vehicle and flowing traffic).
- **Floating cards**: trip planner, result card with four tabs (Overview, Uncertainty, Leave time, Why), settings, profile with saved Home / Work.
- **Uncertainty views** (no tables): simulated-journey histogram with fitted law and 95% band, a draggable time budget, a probability-of-delay curve with confidence band, a risk gauge, a departure-time risk curve, a convergence chart, and a driver bar chart.

## The statistics behind every number
1. **Congestion ratio** R = travel time / free-flow time from 12,000 historical trips. Because R does not depend on route length, history from the five catalogue routes is reused for any route you draw: minutes = R x free-flow time from the router.
2. **Scenario sample**: trips of the same day type near the chosen hour (window widened until at least 80 trips; the interface reports any widening).
3. **Weather**: the regression log R ~ Rain + Visibility + Fog + Cloudy + Peak + Weekend shifts the sample to the forecast weather, so rain and fog change the risk.
4. **Distribution fitting**: Normal, Lognormal, Gamma, Weibull by maximum likelihood; best model by AIC (BIC and KS shown).
5. **Monte Carlo**: 10,000 journeys drawn from the best law.
6. **Risk estimation**: P(late) with Clopper-Pearson interval, 95% / 99% confidence intervals of the mean, P(heavy congestion), composite risk score.
7. **Departure scan**: for each 15-minute candidate, P(late) against the fixed arrival target; the latest candidate within your tolerance is recommended.

Definitions: *late* = journey longer than the time budget (default 1.2 x the typical trip; drag to change). *Heavy congestion* = congestion index >= 40. *Risk score* = 100 (0.35 P(late) + 0.25 P(heavy) + 0.20 P(severe slowdown >= 1.8x) + 0.20 min(1, CV/0.5)); Low < 25 <= Moderate < 50 <= High.

## Hyderabad enhancement layer
Hyderabad place database with autocomplete, live location with automatic re-analysis, saved places, working Road / Satellite / Terrain / Hybrid views, map labels, nearby TSRTC bus stops and metro stations, and a route detail strip. It is an add-on (`app/web/js/hyd/`, `app/web/css/hyd.css`); the existing engine and screens are unchanged. Details and limits: `docs/Hyderabad_Enhancement.md`.

## Honest limitations
- **Not executed in MATLAB yet.** The code was written without a MATLAB licence. The web interface was tested in a headless browser against a JavaScript copy of the engine and a simulated MATLAB bridge; the MATLAB files were reviewed but not run. Run `runSmokeTests` first and send me any error.
- The historical dataset is **synthetic** (BPR-style volume-delay model). Use *Import dataset from CSV* in code (`importTrafficCSV`) for real data.
- **Road colours are model output, not a live feed.** The congestion level of each stretch is the route's estimated congestion index distributed along the route with a seeded profile; there is no per-street probe data.
- Weather comes from the Open-Meteo forecast for the route midpoint; dates outside its range use a seasonal estimate. The *Weather what-if* setting overrides it.
- KS / chi-square p-values use parameters fitted on the same data, so they are optimistic; AIC and BIC choose the model.
- Glassmorphism relies on `backdrop-filter`; very old embedded browsers show a solid translucent card instead.

## Structure
```
SmartCommute/
  main.m                      launcher
  app/SmartCommuteApp.m       MATLAB window + event bridge
  app/web/                    index.html, css/, js/ (map, services, charts, controller, demo engine), lib/leaflet
  src/engine/                 analyzeRoute, ratioModel, ratioSample, ratioDepartureScan, routeDrivers, weatherTarget
  src/core/                   data generation, import, route catalogue
  src/stats/                  descriptive, outliers, fitting, probability, inference, correlation, regression
  src/simulation/             classic scenario Monte Carlo used by the statistical reports and tests
  src/reports/                PDF report generator
  tests/runSmokeTests.m
  docs/                       report, PPT content, viva Q&A, diagrams (Mermaid)
```
