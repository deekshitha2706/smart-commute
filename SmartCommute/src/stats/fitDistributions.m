function F = fitDistributions(x)
%FITDISTRIBUTIONS  Fit Normal, Lognormal, Gamma, Weibull by MLE; rank by AIC.
%   F.Table : Distribution, LogLik, AIC, BIC, DeltaAIC, AkaikeWeight, KS_stat, KS_p, Chi2_p
%   F.Best  : name of the minimum-AIC model;  F.BestDist : fitted object
%   Note: KS / chi-square p-values use parameters estimated from the same data,
%   so they are optimistic (Lilliefors effect) - AIC/BIC are the primary criteria.
x = x(:); x = x(isfinite(x) & x > 0);
names = {'Normal','Lognormal','Gamma','Weibull'};
n = numel(x); k = 2;
nm = strings(4,1); ll = zeros(4,1); aic = ll; bic = ll; ks = ll; kp = ll; cp = nan(4,1);
dists = cell(4,1);
for i = 1:4
    pd = fitdist(x, names{i});
    dists{i} = pd;
    nm(i)  = names{i};
    ll(i)  = -negloglik(pd);
    aic(i) = 2*k - 2*ll(i);
    bic(i) = k*log(n) - 2*ll(i);
    try
        [~, kp(i), ks(i)] = kstest(x, 'CDF', pd);
    catch
        [~, kp(i), ks(i)] = kstest((x - mean(x))/std(x));
    end
    try
        [~, cp(i)] = chi2gof(x, 'CDF', pd, 'NParams', 2);
    catch
        cp(i) = NaN;
    end
end
dA = aic - min(aic);
w = exp(-0.5*dA); w = w / sum(w);
F.Table = table(nm, ll, aic, bic, dA, w, ks, kp, cp, ...
    'VariableNames', {'Distribution','LogLik','AIC','BIC','DeltaAIC','AkaikeWeight','KS_stat','KS_p','Chi2_p'});
[~, ib] = min(aic);
F.Best = nm(ib);
F.BestDist = dists{ib};
F.Dists = dists;
F.Names = nm;
F.N = n;
end
