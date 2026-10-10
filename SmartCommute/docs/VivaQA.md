# SmartCommute - Viva Questions and Answers

**Q1. What problem does SmartCommute solve?**
It estimates P(late | departure time) and recommends the latest departure whose late-probability stays under a tolerance, instead of giving one deterministic ETA.

**Q2. How is it different from Google Maps?**
Maps optimises the route using live data and shows a point estimate. SmartCommute works on historical data, models the whole travel-time distribution, gives confidence intervals and risk-based departure advice. It has no live data or turn-by-turn navigation and does not claim to.

**Q3. Is the data real?**
No, it is synthetic, generated from a BPR volume-delay model with weather, peak and incident effects so relationships are known. The app imports real CSVs with the same columns.

**Q4. Why is travel time not Normal?**
It is bounded below by free-flow time and right-skewed (congestion and incidents add long tails). Lognormal/Gamma/Weibull capture that; AIC confirms.

**Q5. What are AIC and BIC?**
AIC = 2k - 2lnL, BIC = k ln n - 2lnL; both reward fit and penalise parameters, lower is better. BIC penalises more for large n.

**Q6. Why can you not fully trust the KS p-value here?**
Parameters were estimated from the same data, so the null distribution of the KS statistic is not the standard one (Lilliefors); p-values are optimistic. With n = 12,000 even tiny deviations are significant, so AIC/BIC and plots are primary.

**Q7. Explain the Monte Carlo simulation.**
Fit the best law to the scenario sample, draw 10,000 random journey times, and estimate probabilities as sample proportions (Law of Large Numbers). Standard error of p̂ is √(p(1-p)/N), at most 0.5 %.

**Q8. What does the 95 % CI mean?**
For the mean: a procedure that captures the true mean in 95 % of repeated samples. It is different from the 95 % interval of a single journey (2.5-97.5 percentiles), which is much wider. The app shows both.

**Q9. Which hypothesis tests did you use and why?**
Welch t-test (two means, unequal variances); chi-square test of independence (two categorical variables, e.g. peak x heavy congestion); one-way ANOVA (means across >2 groups). H0: no difference/independence; reject if p < 0.05. Effect sizes (Cohen's d, Cramér's V, η²) show practical size since p-values are tiny for big n.

**Q10. Pearson vs Spearman?**
Pearson measures linear association; Spearman is rank-based, robust to outliers and captures monotone non-linear relations (volume-delay is convex).

**Q11. Why quadratic volume term in regression?**
The delay curve is convex ((v/c)^4), so a linear fit under-predicts at high volume; the squared term improves R².

**Q12. What is adjusted R²?**
R² penalised for the number of predictors: 1 - (1 - R²)(n - 1)/(n - p - 1); does not increase just by adding useless variables.

**Q13. Why logistic regression for delay probability?**
The response is binary (TT > 30); logistic regression models log-odds linearly and outputs a probability in [0, 1]; evaluated with AUC and accuracy.

**Q14. How is the risk score defined? Is it statistically derived?**
It is a transparent weighted index of P(late), P(heavy), P(TT>45) and CV. The weights are a design decision, not an estimated model; they can be changed in `computeRiskScore.m`.

**Q15. How is the departure time chosen?**
For each 15-min candidate, budget = deadline - departure; P(late) = 1 - Φ((ln budget - μ)/σ) from a lognormal fit of the matching scenario sample; choose the latest candidate with P(late) ≤ tolerance.

**Q16. What if there are few matching records?**
Filters are relaxed in a fixed order (density, weather, wider time window) when n < 60, and the UI reports the relaxation, so the user knows the sample is less specific.

**Q17. What assumptions are made?**
Trips are independent; the past distribution represents the future; the scenario filter captures the relevant conditions; the chosen parametric family is adequate.

**Q18. Where does Bayes' theorem appear?**
P(Peak | Heavy) = P(Heavy | Peak)P(Peak)/P(Heavy) in the probability module.

**Q19. What does the Probability Layer on the map mean?**
It spatially allocates the scenario's P(TT>30) using the hotspot intensity field; it is illustrative, not measured per location.

**Q20. How would you improve it?**
Real probe data, time-series dependence between consecutive days, Bayesian hierarchical model across routes, quantile regression for tail risk, live data feed, live traffic feed.

**Q21. Which toolbox functions are used?**
fitdist, kstest, chi2gof, ttest2, crosstab, anova1, corr, fitlm, fitglm, perfcurve, binofit, tinv, quantile, random, boxchart.
