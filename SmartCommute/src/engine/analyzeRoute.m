function [out, legacy] = analyzeRoute(T, req, M)
%ANALYZEROUTE  SmartCommute scientific engine for ONE user-drawn route.
%
%   out = analyzeRoute(T, req)           T   : historical trips (generateTrafficData)
%   [out, legacy] = analyzeRoute(T, req, M)  M : cached ratioModel(T) (optional)
%
%   req fields (set by the interface)
%       free        free-flow minutes of the route (router ETA without traffic)
%       distKm      route length
%       date        'yyyy-mm-dd'      hour   decimal departure hour (8.5 = 08:30)
%       weather     'Clear'|'Cloudy'|'Rain'|'Fog'   rainMm, visKm  (NaN = typical)
%       n           number of simulated journeys (default 10000)
%       tol         accepted probability of being late (default 0.10)
%       budgetMin   time budget in minutes (default 1.2 x typical trip)
%       seed        RNG seed (default 42)
%
%   Pipeline:  history -> congestion ratio sample (same day type + hour,
%   weather-corrected by regression) -> distribution fitting (best AIC) ->
%   random sampling of N journeys -> risk estimation -> departure scan.
%   `out` is a plain struct that jsonencodes into the object the web UI draws;
%   `legacy` has the field names expected by reports/generateReport.m.
if nargin < 3 || isempty(M), M = ratioModel(T); end
n    = getf(req, 'n', 10000);
tol  = getf(req, 'tol', 0.10);
seed = getf(req, 'seed', 42);
free = max(req.free, 1);
hour = req.hour;
dt   = datetime(string(req.date), 'InputFormat', 'yyyy-MM-dd');
wk   = weekday(dt);  isWk = (wk == 1) || (wk == 7);
X    = weatherTarget(getf(req, 'weather', "Clear"), getf(req, 'rainMm', NaN), getf(req, 'visKm', NaN));

% ---- 1-2. scenario sample and distribution fit ---------------------------
[x, idx, relax] = ratioSample(M, isWk, hour, X, 80);
Rhist = exp(x);
F  = fitDistributions(Rhist);
pd = F.BestDist;

% ---- 3. Monte Carlo ------------------------------------------------------
rng(seed, 'twister');
Rs = max(random(pd, n, 1), 0.5);
TT = Rs * free;                                  % minutes

% default time budget: 1.2 x typical (median historical) trip
budget0 = 1.2 * free * M.MedianR;
budget  = getf(req, 'budgetMin', budget0);
if ~isfinite(budget) || budget <= 0, budget = budget0; end

% ---- 4. risk estimation --------------------------------------------------
mu = mean(TT); sd = std(TT); cv = sd/mu;
tc95 = tinv(0.975, n-1); tc99 = tinv(0.995, n-1); se = sd/sqrt(n);
[pLate, pLateCI] = binofit(nnz(TT > budget), n, 0.05);
pHeavy  = mean(100*(1 - 1./Rs) >= 40);
pSevere = mean(Rs >= 1.8);
[score, cls] = riskScore(pLate, pHeavy, pSevere, cv);
ci = mean(100*(1 - 1./Rs));
if ci < 15, lvl = "Low"; elseif ci < 30, lvl = "Medium"; elseif ci < 45, lvl = "Heavy"; else, lvl = "Severe"; end

dthr = [5 10 20 30];
pd_  = arrayfun(@(t) mean(TT - free > t), dthr);

% weather risk = uplift of the mean ratio versus clear sky (regression)
b = M.Beta; Xc = weatherTarget("Clear", 0, NaN);
upl = exp(b.Rain*(X.Rain - Xc.Rain) + b.Vis*(X.Vis - Xc.Vis) + b.Fog*(X.Fog - Xc.Fog) + ...
          b.Cloudy*(X.Cloudy - Xc.Cloudy)) - 1;
wscore = min(100, max(0, 100*upl/0.25));
if upl < 0.05, wcls = "Low"; elseif upl < 0.15, wcls = "Moderate"; else, wcls = "High"; end

% ---- distribution shape for the charts ----------------------------------
q  = reshape(quantile(TT, linspace(0, 1, 1001)), 1, []);
lo = quantile(TT, 0.001); hi = quantile(TT, 0.999);
edges = linspace(lo, hi, 61);
cnt = histcounts(TT, edges, 'Normalization', 'pdf');
ctr = (edges(1:end-1) + edges(2:end))/2;
xs  = linspace(lo, hi, 140);
ys  = pdf(pd, xs/free) / free;
k   = unique(round(linspace(50, n, min(120, n-49))));
csum = cumsum(TT > budget);

% ---- departure scan, drivers, daily profile -----------------------------
arrival = hour + budget/60;
S = ratioDepartureScan(M, isWk, X, free, hour, arrival, tol);
Dr = routeDrivers(M, isWk, hour, X, pSevere);
hrs = (5:23)';
prof = nan(size(hrs));
for i = 1:numel(hrs)
    xi = ratioSample(M, isWk, hrs(i) + 0.5, X, 40);
    prof(i) = mean(exp(xi));
end

% ---- assemble the JSON-friendly struct ----------------------------------
out = struct();
out.engine = "matlab";
out.n = n; out.free = free; out.distKm = getf(req, 'distKm', NaN);
out.budget = budget; out.budgetDefault = budget0;
out.fit = struct('best', string(F.Best), 'records', numel(idx), 'relax', relax, ...
    'table', struct('name', cellstr(F.Table.Distribution), 'aic', num2cell(F.Table.AIC), ...
                    'bic', num2cell(F.Table.BIC), 'ks', num2cell(F.Table.KS_stat)));
out.mean = mu; out.sd = sd; out.cv = cv; out.median = median(TT);
out.ci95 = mu + [-1 1]*tc95*se; out.ci99 = mu + [-1 1]*tc99*se;
out.pi95 = reshape(quantile(TT, [0.025 0.975]), 1, 2);
out.delay = struct('t', dthr, 'p', pd_);
out.pLate = pLate; out.pLateCI = pLateCI; out.pHeavy = pHeavy; out.pSevere = pSevere;
out.risk = struct('score', score, 'cls', cls);
out.congestion = struct('level', lvl, 'index', ci);
out.weather = struct('cond', X.Cond, 'rainMm', X.Rain, 'visKm', X.Vis, ...
    'upliftPct', 100*upl, 'score', wscore, 'cls', wcls);
out.hist = struct('x', ctr, 'y', cnt);
out.pdf  = struct('x', xs, 'y', ys);
out.q = q;
out.samples = TT(1:min(400, n))';
out.conv = struct('k', k, 'p', csum(k)'./k);
out.leave = struct('h', S.Hours', 'pLate', S.PLate', 'exp', S.Expected', 'p95', S.P95', ...
    'best', S.Best, 'bestHour', S.BestHour, 'met', S.Met, 'tol', tol, ...
    'arrival', arrival, 'budget', S.BestBudget);
out.drivers = Dr;
out.profile = struct('h', hrs' + 0.5, 'r', prof');
out.evidence = struct('r2', M.R2, 'adjR2', M.AdjR2, 'records', M.N, ...
    'beta', M.Beta, 'corr', M.Corr);

% ---- legacy struct for the PDF reports ----------------------------------
if nargout > 1
    MC = struct('Samples', TT, 'N', n, 'Budget', budget, 'DistName', string(F.Best), ...
        'Mean', mu, 'Std', sd, 'CV', cv, 'CIMean95', out.ci95, 'CIMean99', out.ci99, ...
        'PI95', out.pi95, 'P20', mean(TT > 20), 'P30', mean(TT > 30), 'P45', mean(TT > 45), ...
        'PLate', pLate, 'PLateCI', pLateCI, 'PHeavy', pHeavy, ...
        'RiskScore', score, 'RiskClass', cls, ...
        'Conv', struct('k', k(:), 'PLate', csum(k)./k(:), 'Mean', cumsum(TT)./(1:n)'), ...
        'Info', struct('N', numel(idx), 'Relaxation', relax));
    MC.Conv.Mean = MC.Conv.Mean(k);
    dep = arrayfun(@(h) sprintf('%02d:%02d', floor(mod(h,24)), round(mod(h,1)*60)), S.Hours, 'UniformOutput', false);
    Rec = struct('Candidates', S.Hours, 'PLate', S.PLate, 'ExpectedTT', S.Expected, 'P95TT', S.P95, ...
        'Tolerance', tol, 'Deadline', arrival, 'BestIndex', S.Best, 'BestHour', S.BestHour, ...
        'ToleranceMet', S.Met, 'BestPLate', S.PLate(S.Best), 'BestExpected', S.Expected(S.Best), ...
        'BestBudget', S.BestBudget, 'Text', dep{S.Best});
    Rec.Table = table(string(dep), (arrival - S.Hours)*60, round(S.Expected,1), round(S.P95,1), ...
        round(100*S.PLate,2), S.N, false(numel(dep),1), ...
        'VariableNames', {'Departure','Budget_min','ExpectedTT','P95_TT','PLate_pct','SampleN','Relaxed'});
    Sc = struct('Route', "Custom route", 'DayType', iff(isWk, "Weekend", "Weekday"), 'Hour', hour, ...
        'Weather', X.Cond, 'Density', "Any");
    legacy = struct('MC', MC, 'Rec', Rec, 'Scenario', Sc);
end
end

function [score, cls] = riskScore(pLate, pHeavy, pSevere, cv)
score = 100*(0.35*pLate + 0.25*pHeavy + 0.20*pSevere + 0.20*min(1, cv/0.5));
if score < 25, cls = "Low"; elseif score < 50, cls = "Moderate"; else, cls = "High"; end
end

function v = getf(s, f, d)
if isfield(s, f) && ~isempty(s.(f)) && ~(isnumeric(s.(f)) && all(isnan(s.(f)))), v = s.(f); else, v = d; end
end

function s = iff(c, a, b)
if c, s = a; else, s = b; end
end
