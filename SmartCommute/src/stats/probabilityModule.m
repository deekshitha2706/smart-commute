function P = probabilityModule(T, thresholds, heavyThr)
%PROBABILITYMODULE  Empirical and conditional probabilities of delay / congestion.
%   P(TT > t) for t in thresholds, P(Heavy congestion), conditional tables,
%   Bayes posterior P(Peak | Heavy) and the exceedance curve.
if nargin < 2, thresholds = [20 30 45]; end
if nargin < 3, heavyThr = 40; end
tt = T.TravelTime; n = numel(tt);
heavy = T.CongestionIndex >= heavyThr;
P.HeavyThreshold = heavyThr;

% overall exceedance with Wilson-type (Clopper-Pearson) 95% CI
Thr = thresholds(:); p = zeros(size(Thr)); lo = p; hi = p;
for i = 1:numel(Thr)
    k = nnz(tt > Thr(i));
    [p(i), ci] = binofit(k, n, 0.05);
    lo(i) = ci(1); hi(i) = ci(2);
end
P.Overall = table(Thr, p, lo, hi, 'VariableNames', {'Threshold_min','Probability','CI_low','CI_high'});
[ph, cih] = binofit(nnz(heavy), n, 0.05);
P.Heavy = ph; P.HeavyCI = cih;

% conditional probabilities
G = { 'Weather = Clear',  T.WeatherCondition == "Clear";
      'Weather = Cloudy', T.WeatherCondition == "Cloudy";
      'Weather = Rain',   T.WeatherCondition == "Rain";
      'Weather = Fog',    T.WeatherCondition == "Fog";
      'Peak hours',       T.IsPeak;
      'Off-peak',         ~T.IsPeak;
      'Weekend',          T.IsWeekend;
      'Weekday',          ~T.IsWeekend;
      'Density = Light',  T.Density == "Light";
      'Density = Normal', T.Density == "Normal";
      'Density = Heavy',  T.Density == "Heavy" };
m = size(G,1);
Condition = strings(m,1); N = zeros(m,1);
P20 = zeros(m,1); P30 = P20; P45 = P20; PHeavy = P20;
for i = 1:m
    msk = G{i,2};
    Condition(i) = G{i,1}; N(i) = nnz(msk);
    P20(i) = mean(tt(msk) > 20);  P30(i) = mean(tt(msk) > 30);
    P45(i) = mean(tt(msk) > 45);  PHeavy(i) = mean(heavy(msk));
end
P.Conditional = table(Condition, N, P20, P30, P45, PHeavy, ...
    'VariableNames', {'Condition','N','P_gt20','P_gt30','P_gt45','P_Heavy'});

% Bayes: P(Peak | Heavy) = P(Heavy | Peak) P(Peak) / P(Heavy)
P.BayesPeakGivenHeavy = mean(heavy(T.IsPeak)) * mean(T.IsPeak) / mean(heavy);
P.BayesRainGivenHeavy = mean(heavy(T.WeatherCondition=="Rain")) * mean(T.WeatherCondition=="Rain") / mean(heavy);

% exceedance curve
P.Curve.t = (0:1:ceil(max(tt)))';
P.Curve.p = arrayfun(@(t) mean(tt > t), P.Curve.t);
end
