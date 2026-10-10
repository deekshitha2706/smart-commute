function runSmokeTests()
%RUNSMOKETESTS  Headless checks of the numerical core (no UI).  >> runSmokeTests
root = fileparts(fileparts(mfilename('fullpath')));
addpath(genpath(fullfile(root, 'src')));
fprintf('--- SmartCommute smoke tests ---\n');
T = generateTrafficData(12000, 2026);
check(height(T) >= 10000, 'dataset has >= 10,000 rows');
req = {'Date','DayOfWeek','DepartureTime','TrafficVolume','AverageSpeed','TravelTime', ...
       'CongestionIndex','Temperature','Rainfall','WeatherCondition','Visibility','RouteID'};
check(all(ismember(req, T.Properties.VariableNames)), 'required columns present');
check(~any(ismissing(T), 'all'), 'no missing values');
check(all(T.TravelTime > 0) && all(T.CongestionIndex >= 0 & T.CongestionIndex <= 100), 'value ranges sane');

[S, ~] = descriptiveStats(T.TravelTime);
check(abs(S.Mean - mean(T.TravelTime)) < 1e-9, 'descriptive mean');
O = detectOutliers(T.TravelTime); check(O.Table.Count(1) > 0, 'IQR outliers found');

F = fitDistributions(T.TravelTime);
check(height(F.Table) == 4 && any(F.Best == F.Names), 'distribution fitting + best by AIC');
check(F.Table.AIC(F.Names == F.Best) == min(F.Table.AIC), 'best = min AIC');

P = probabilityModule(T);
check(all(diff(P.Overall.Probability) <= 0), 'P(TT>20) >= P(TT>30) >= P(TT>45)');
check(P.Conditional.P_gt30(strcmp(P.Conditional.Condition, 'Peak hours')) > ...
      P.Conditional.P_gt30(strcmp(P.Conditional.Condition, 'Off-peak')), 'peak riskier than off-peak');

I = inferenceTests(T);
check(I.CI.Upper(2) - I.CI.Lower(2) > I.CI.Upper(1) - I.CI.Lower(1), '99% CI wider than 95% CI');
check(I.Tests.PValue(1) < 0.05, 'peak vs off-peak significant');

C = correlationAnalysis(T); check(all(abs(diag(C.Pearson) - 1) < 1e-9), 'correlation diagonal = 1');
Rg = regressionAnalysis(T); check(Rg.Metrics.R2(2) > Rg.Metrics.R2(1), 'multiple R^2 > simple R^2');

sc = struct('Route', "R1", 'DayType', "Weekday", 'Hour', 8, 'Weather', "Any", 'Density', "Any");
M = monteCarloSim(T, sc, struct('N', 10000, 'Budget', 30));
check(numel(M.Samples) == 10000, '10,000 simulated journeys');
check(M.CIMean95(1) < M.Mean && M.Mean < M.CIMean95(2), 'mean inside its CI');
M2 = monteCarloSim(T, setfield(sc, 'Hour', 13), struct('N', 10000, 'Budget', 30)); %#ok<SFLD>
check(M.Mean > M2.Mean, 'rush hour slower than midday');

R = recommendDeparture(T, sc, 9.0, 0.10);
check(R.BestPLate <= 0.10 || ~R.ToleranceMet, 'recommendation respects tolerance');
R5 = recommendDeparture(T, sc, 9.0, 0.05); R20 = recommendDeparture(T, sc, 9.0, 0.20);
check(R5.BestHour <= R20.BestHour, 'stricter tolerance => earlier departure');

% ---- map-first engine (analyzeRoute): any route length, weather-aware ----
Mr = ratioModel(T);
rq = struct('free', 30, 'distKm', 20, 'date', '2026-10-12', 'hour', 8.25, 'weather', 'Clear', ...
            'n', 10000, 'tol', 0.10, 'seed', 1);              % 2026-10-12 is a Monday
Oc = analyzeRoute(T, rq, Mr);
check(Oc.mean > Oc.free, 'rush-hour trip is slower than free-flow');
rq2 = rq; rq2.weather = 'Rain'; Orain = analyzeRoute(T, rq2, Mr);
check(Orain.mean > Oc.mean, 'rain increases expected travel time');
rq3 = rq; rq3.hour = 13; Omid = analyzeRoute(T, rq3, Mr);
check(Omid.mean < Oc.mean, 'midday trip faster than rush hour');
check(Oc.pLate >= 0 && Oc.pLate <= 1 && Oc.risk.score >= 0 && Oc.risk.score <= 100, 'probabilities and risk score in range');
rq4 = rq; rq4.tol = 0.05; O5 = analyzeRoute(T, rq4, Mr); rq5 = rq; rq5.tol = 0.20; O20 = analyzeRoute(T, rq5, Mr);
check(O5.leave.bestHour <= O20.leave.bestHour, 'stricter tolerance => earlier departure');
rq6 = rq; rq6.free = 60; Olong = analyzeRoute(T, rq6, Mr);
check(Olong.mean > Oc.mean, 'a longer route takes longer');
js = jsonencode(struct('id', 1, 'result', Oc));
check(ischar(js) && contains(js, '"leave"') && contains(js, '"drivers"'), 'result serialises to JSON for the web UI');
[~, lg] = analyzeRoute(T, rq, Mr);
check(isfield(lg, 'MC') && isfield(lg, 'Rec') && isfield(lg, 'Scenario'), 'legacy struct for PDF reports present');
fprintf('All tests passed.\n');
end

function check(cond, msg)
if cond, fprintf('  PASS  %s\n', msg); else, error('FAIL: %s', msg); end
end
