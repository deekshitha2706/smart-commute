function Rec = recommendDeparture(T, sc, deadline, tol)
%RECOMMENDDEPARTURE  Latest departure whose P(late) <= tol.
%   For each candidate departure d (15-min grid, up to 2 h before the deadline)
%   the conditional travel-time sample is modelled as lognormal
%   (MLE: mu = mean(log x), sigma = std(log x)), budget = (deadline-d)*60 min,
%   P(late) = P(TT > budget) = 1 - Phi((ln budget - mu)/sigma).
if nargin < 4, tol = 0.10; end
cands = (deadline - 2.0) : 0.25 : (deadline - 0.25);
cands = cands(cands >= 4);
n = numel(cands);
pLate = nan(n,1); eTT = pLate; p95 = pLate; nUsed = pLate; relax = false(n,1);
for i = 1:n
    s = sc; s.Hour = cands(i);
    [S, info] = selectScenario(T, s, 40);
    x = log(S.TravelTime(S.TravelTime > 0));
    mu = mean(x); sg = std(x);
    budget = (deadline - cands(i))*60;
    pLate(i) = 1 - normcdf((log(budget) - mu)/sg);
    eTT(i) = exp(mu + sg^2/2);
    p95(i) = exp(mu + 1.645*sg);
    nUsed(i) = info.N;  relax(i) = info.Relaxed;
end
ok = find(pLate <= tol);
if isempty(ok), [~, ib] = min(pLate); met = false; else, ib = ok(end); met = true; end
Rec.Candidates = cands(:);
Rec.PLate = pLate; Rec.ExpectedTT = eTT; Rec.P95TT = p95;
Rec.Tolerance = tol; Rec.Deadline = deadline;
Rec.BestIndex = ib; Rec.BestHour = cands(ib); Rec.ToleranceMet = met;
Rec.BestPLate = pLate(ib); Rec.BestExpected = eTT(ib);
Rec.BestBudget = (deadline - cands(ib))*60;
Rec.Text = hhmm(cands(ib));
Rec.Table = table(string(arrayfun(@hhmm, cands(:), 'UniformOutput', false)), ...
    (deadline - cands(:))*60, round(eTT,1), round(p95,1), round(100*pLate,2), nUsed, relax, ...
    'VariableNames', {'Departure','Budget_min','ExpectedTT','P95_TT','PLate_pct','SampleN','Relaxed'});
end

function s = hhmm(h)
h = mod(h, 24); hr = floor(h); mn = round((h - hr)*60);
if mn == 60, hr = hr + 1; mn = 0; end
s = sprintf('%02d:%02d', hr, mn);
end
