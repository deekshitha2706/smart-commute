# SMARTCOMMUTE - Project Report
**Probabilistic Urban Traffic Congestion and Travel-Time Risk Assessment System**
Course: Probability, Statistics and Analysis

---
## 1. Abstract
Commuters usually receive a single estimated travel time, yet real journey times are random. SmartCommute models travel time as a random variable, estimates the probability of delay and congestion from historical data, validates the model with statistical inference, and uses Monte Carlo simulation to recommend a departure time that keeps the probability of arriving late below a chosen tolerance.

## 2. Problem statement and objectives
**Core question:** *What is the probability that a commuter will be late if they leave at a specific time?*
Objectives: (1) analyse historical traffic data; (2) model uncertainty; (3) fit probability distributions; (4) estimate delay probabilities; (5) simulate journeys; (6) classify congestion risk; (7) recommend departure times.

## 3. Dataset
12,000 synthetic records (seed 2026), 12 required columns plus helper columns (IsWeekend, IsPeak, VCRatio, Density).

Generative model (so the statistics have a physical meaning):
- Demand profile d(h): weekday = 0.12 + 0.78 e^{-(h-8.2)^2/2(1.1)^2} + 0.85 e^{-(h-17.6)^2/2(1.3)^2} + 0.30 e^{-(h-13)^2/2(2.2)^2}; weekend flat midday hump.
- Volume/capacity v/c = d x dayFactor x routeFactor x LogN(0, 0.12).
- Travel time: t = t0 (1 + 0.9 (v/c)^4) x weatherFactor x LogN(0, 0.10) + incident (2.5 %: 5 + Exp(10) min). The first factor is a BPR-style volume-delay function.
- Speed = distance / time; CongestionIndex = 100 (1 - t0/t).
- Weather: Clear / Cloudy / Rain / Fog with seasonal probabilities; rainfall ~ Gamma(2, 2.5) when raining; visibility and temperature depend on weather and season.
Five routes (12-28 km). Real data can be imported through CSV.

## 4. Methodology
### 4.1 Descriptive statistics and outliers
Mean, median, mode, variance, SD, quartiles, skewness, kurtosis, CV. Outliers: Tukey fences [Q1 - 1.5 IQR, Q3 + 1.5 IQR] and |z| > 3.

### 4.2 Distribution fitting
MLE for Normal, Lognormal, Gamma, Weibull (k = 2 parameters each). AIC = 2k - 2 ln L, BIC = k ln n - 2 ln L. Best model = minimum AIC; Akaike weights reported. Goodness of fit: Kolmogorov-Smirnov and chi-square (optimistic because parameters are estimated from the same data). Right-skewed travel times typically favour Lognormal / Gamma / Weibull over Normal.

### 4.3 Probability module
Empirical P(TT > 20/30/45), P(heavy congestion) with Clopper-Pearson 95 % CIs. Conditional probabilities P(A | condition) for weather, peak, weekend, density. Bayes' rule: P(Peak | Heavy) = P(Heavy | Peak) P(Peak) / P(Heavy).

### 4.4 Statistical inference
- CI for the mean: x̄ ± t_{n-1, 1-α/2} s/√n at 95 % and 99 %.
- Welch two-sample t-tests (unequal variance), Cohen's d: Peak vs Off-peak, Rain vs Clear, Weekday vs Weekend.
- Chi-square tests of independence (Cramér's V) between heavy congestion and peak / weather / weekend / density.
- One-way ANOVA (F, η²) across weather, route and day of week.

### 4.5 Correlation and regression
Pearson and Spearman matrices over volume, travel time, speed, visibility, rainfall, temperature, congestion index and ordinal weather severity.
Models (80/20 split): simple LR (TT ~ volume); multiple LR (volume, volume², rainfall, visibility, temperature, peak, weekend, route); LR for congestion index; logistic regression for P(TT > 30). Reported: R², adjusted R² = 1 - (1 - R²)(n - 1)/(n - p - 1), test RMSE, AUC, accuracy, residual plots.

### 4.6 Monte Carlo engine
1. Filter history for the scenario (route, day type, hour ± 0.75 h, weather, density); relax filters in a fixed order if n < 60.
2. Fit the four laws; choose the minimum-AIC law F.
3. Draw N = 10,000 journeys T_i ~ F (seeded RNG).
4. Journey generation: congestion index CI_i = 100 (1 - t0 / T_i).
5. Estimates: mean ± t-CI, 95 % single-trip interval (2.5th-97.5th percentiles), P(T > 30), P(T > 45), P(late) = P(T > budget) with exact binomial CI, P(CI ≥ 40).
6. Risk score = 100 (0.35 P(late) + 0.25 P(heavy) + 0.20 P(T>45) + 0.20 min(1, CV/0.5)). The weights are a transparent design choice, not a fitted model.
Monte Carlo standard error of a probability p is √(p(1-p)/N) ≤ 0.5 % at N = 10,000.

### 4.7 Departure recommendation
For each 15-minute candidate departure d in the 2 h before the deadline: budget b = (deadline - d) × 60; scenario sample at d; lognormal MLE (μ, σ of ln T); P(late) = 1 - Φ((ln b - μ)/σ). Recommendation = latest d with P(late) ≤ tolerance (5 / 10 / 20 %), otherwise the minimum-risk d.

## 5. System design
Layered architecture (see `docs/Diagrams.md`): data layer (`src/core`), analytics layer (`src/stats`), trip engine (`src/engine`), reports (`src/reports`), MATLAB window and event bridge (`app/SmartCommuteApp.m`) and a web interface (`app/web`) shown in a single `uihtml` component. Diagrams provided: flowchart, DFD level 0/1, use-case, architecture, ER.

## 6. User interface

**Map-first design.** The map fills the screen; the trip planner, result card, layer dock and settings are floating glass cards. The flow is: choose start and destination, press Analyze route, watch the animated route coloured by congestion, read the risk card, follow the departure recommendation. Statistics appear as pictures, not tables: a simulation histogram with fitted law and 95% band, a draggable time budget, a probability-of-delay curve, a risk gauge, a departure-time risk curve and a driver chart. Weather (forecast or what-if) changes the numbers through the regression shift described in 4.6.

**Congestion ratio model.** R = travel time / free-flow time is independent of route length, so the 12,000 historical trips apply to any route; minutes = R x router free-flow time. Road colours distribute the route's estimated congestion index along its length with a seeded profile; they are model output, not live probe data.

Design language: dark by default with a light theme, translucent glass cards, semantic traffic colours (green, yellow, red, dark red), animated route drawing, a moving vehicle, flowing traffic particles, rain and fog effects, and a loading sequence while MATLAB simulates the journeys.

## 7. Differences from a navigation app
| | Navigation app | SmartCommute |
|---|---|---|
| Output | one ETA | distribution of travel time |
| Uncertainty | hidden | SD, CV, CI, prediction interval |
| Decision | fastest route | risk-based departure time |
| Method | live data + routing | historical statistics + Monte Carlo |
| Strengths | real-time, turn-by-turn | transparent, testable statistics |
SmartCommute does not replace navigation; it supports planning decisions.

## 8. Expected results (verify in the app)
Under the generator: mean TT ≈ 22 min, P(TT>30) ≈ 12 %, P(TT>45) ≈ 2 %, P(heavy) ≈ 14 %; peak mean ≈ 7-8 min above off-peak; all three t-tests, ANOVA across weather and the peak/heavy chi-square reject H0 at 5 %. (These were checked on an independent Python re-implementation of the generator; exact values in MATLAB differ slightly with its RNG.)

## 9. Limitations and future work
Synthetic data; independence assumed between trips; scenario sample is a conditional empirical sample rather than a full hierarchical model; GOF p-values optimistic; road colours are model-estimated rather than live. Future: real probe data, time-series (ARIMA/state-space) dependence, quantile regression, Bayesian hierarchical model, live traffic feed.

## 10. Conclusion
SmartCommute turns travel-time data into decision-grade probabilities: it quantifies uncertainty, validates the model statistically, and converts the result into a departure time with a stated risk of being late.

## 11. References
Montgomery & Runger, *Applied Statistics and Probability for Engineers*; Ross, *Introduction to Probability Models*; Akaike (1974); Bureau of Public Roads (1964) volume-delay function; MATLAB Statistics and Machine Learning Toolbox documentation.
