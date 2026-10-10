function MC = monteCarloSim(T, sc, opts)
%MONTECARLOSIM  10,000-journey Monte Carlo simulation of travel time.
%   Flow: history -> conditional scenario sample -> distribution fitting (best AIC)
%         -> random sampling -> journey generation -> risk estimation.
%   opts: N (10000), Seed, Budget (min; "late" if journey exceeds it), HeavyThr (40)
if nargin < 3, opts = struct(); end
N        = getf(opts, 'N', 10000);
seed     = getf(opts, 'Seed', 42);
budget   = getf(opts, 'Budget', 30);
heavyThr = getf(opts, 'HeavyThr', 40);

[S, info] = selectScenario(T, sc);
F  = fitDistributions(S.TravelTime);
pd = F.BestDist;

rng(seed, 'twister');
tt = random(pd, N, 1);                         % random sampling from fitted law
tt = max(tt, 1);                               % physical lower bound

% free-flow time of the scenario (route mean if "All")
R = routeCatalog();
if isfield(sc,'Route') && string(sc.Route) ~= "All"
    ff = R.FreeFlowMin(string(R.RouteID) == string(sc.Route));
else
    ff = mean(R.FreeFlowMin);
end
ci = 100*(1 - min(ff./tt, 1));                 % journey generation: per-journey congestion index

MC.Samples = tt;  MC.CongIdx = ci;
MC.N = N;  MC.Budget = budget;  MC.FreeFlow = ff;
MC.Info = info;   MC.Fit = F;   MC.DistName = F.Best;  MC.Dist = pd;
MC.Mean = mean(tt); MC.Std = std(tt); MC.CV = MC.Std/MC.Mean; MC.Median = median(tt);
MC.P20 = mean(tt > 20); MC.P30 = mean(tt > 30); MC.P45 = mean(tt > 45);
[MC.PLate, MC.PLateCI] = binofit(nnz(tt > budget), N, 0.05);
MC.PHeavy = mean(ci >= heavyThr);
% intervals
se = MC.Std/sqrt(N);
MC.CIMean95 = MC.Mean + tinv([0.025 0.975], N-1)*se;
MC.CIMean99 = MC.Mean + tinv([0.005 0.995], N-1)*se;
MC.PI95 = quantile(tt, [0.025 0.975]);        % 95% interval of a single journey
MC.P95 = quantile(tt, 0.95);
% risk
[MC.RiskScore, MC.RiskClass, MC.RiskColor] = computeRiskScore(MC.PLate, MC.P45, MC.PHeavy, MC.CV);
% convergence (thinned to <= 500 points)
k = unique(round(linspace(1, N, min(500, N))));
cs = cumsum(tt > budget); cm = cumsum(tt);
csk = cs(k); cmk = cm(k);
MC.Conv.k = k(:);  MC.Conv.PLate = csk(:)./k(:);  MC.Conv.Mean = cmk(:)./k(:);
end

function v = getf(s, f, d)
if isfield(s, f) && ~isempty(s.(f)), v = s.(f); else, v = d; end
end
