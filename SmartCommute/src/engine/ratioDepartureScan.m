function S = ratioDepartureScan(M, isWeekend, X, free, depHour, arrival, tol)
%RATIODEPARTURESCAN  Latest departure whose P(late) <= tol for a fixed arrival.
%   The arrival target is  arrival = chosen departure + time budget.  For each
%   15-min candidate d in [dep-2h, dep+0.75h]:
%       budget_d = (arrival - d) 60
%       log R ~ N(mu_d, sigma_d)  (weather-corrected sample around hour d)
%       P(late)  = P(R free > budget_d) = 1 - Phi((ln(budget_d/free) - mu_d)/sigma_d)
cand = (max(4.5, depHour - 2.0) : 0.25 : min(23.5, depHour + 0.75))';
n = numel(cand);
pL = nan(n,1); eT = pL; p95 = pL; nU = pL;
for i = 1:n
    [x, idx] = ratioSample(M, isWeekend, cand(i), X, 60);
    mu = mean(x); sg = std(x);
    bud = (arrival - cand(i)) * 60;
    nU(i) = numel(idx);
    eT(i)  = free * exp(mu + sg^2/2);
    p95(i) = free * exp(mu + 1.645*sg);
    if bud > 0
        pL(i) = 1 - normcdf((log(bud/free) - mu)/sg);
    else
        pL(i) = 1;
    end
end
ok = find(pL <= tol);
if isempty(ok), [~, ib] = min(pL); met = false; else, ib = ok(end); met = true; end
S.Hours = cand; S.PLate = pL; S.Expected = eT; S.P95 = p95; S.N = nU;
S.Best = ib; S.BestHour = cand(ib); S.Met = met; S.Tol = tol; S.Arrival = arrival;
S.BestBudget = (arrival - cand(ib))*60;
end
