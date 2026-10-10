# SmartCommute - Presentation Content (16 slides)

**1. Title** - SmartCommute: Probabilistic Urban Traffic Congestion and Travel-Time Risk Assessment. Team, course, guide.

**2. The problem** - Navigation apps give one ETA. Real travel time is random. Being 10 min late costs more than arriving 10 min early. Question: *P(late | leave at t)?*

**3. Objectives** - Analyse data, model uncertainty, fit distributions, estimate delay probability, simulate, classify risk, recommend departure.

**4. Why not Google Maps?** - Deterministic ETA vs distribution; fastest route vs risk-based departure; we quantify uncertainty (CI, P(delay)). Honest note: we are not real-time, not a navigator.

**5. Dataset** - 12,000 records, 12 variables, 5 routes, 4 weather states; BPR-style generator; import real CSV.

**6. Architecture** - Layers: data -> analytics -> simulation -> visualisation -> UI. Diagram.

**7. Descriptive stats and outliers** - Mean/median/mode/variance/quartiles; IQR and Z-score; right-skew.

**8. Distribution fitting** - Normal, Lognormal, Gamma, Weibull; AIC, BIC, KS; best = min AIC. Chart: pdf overlay.

**9. Probability module** - P(TT>20/30/45), P(heavy), conditional on weather/peak/weekend/density, Bayes P(Peak|Heavy).

**10. Inference** - 95 %/99 % CI; Welch t-tests; chi-square; ANOVA; effect sizes. Table of p-values.

**11. Correlation and regression** - Pearson/Spearman heatmaps; simple, multiple, logistic; R², adj R², RMSE, AUC; residual plots.

**12. Monte Carlo engine** - Flow: history -> fit -> sample 10,000 -> journey -> risk. Convergence chart; MC standard error.

**13. Intelligence engine and risk score** - Inputs/outputs; score formula; gauge.

**14. Departure recommendation** - P(late) vs departure curve; tolerance line; recommended time.

**15. Route Intelligence Map + demo** - Layers: heatmap, zones, risk overlay, probability, hotspots, weather, simulation. Live demo script: run R1 weekday 08:00 deadline 08:45, switch weather to Rain, compare.

**16. Conclusion and future work** - Results, limitations (synthetic data, independence), future: real data, time series, Bayesian hierarchical model, live feed. Q&A.

**Demo checklist**: run `main`; Overview (KPIs) -> Traffic Risk (fit table) -> Probability (slider) -> Simulation (Rain vs Clear) -> Departure (5 % vs 20 %) -> Reports (PDF) -> vs Maps.
