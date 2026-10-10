function D = routeDrivers(M, isWeekend, hour, X, pSevere)
%ROUTEDRIVERS  What is pushing the risk up (or down)?  Effects are % change in
%   the mean congestion ratio relative to a reference situation.
%     Time of day : this hour vs. the midday (11-15 h) baseline, same day type
%     Weather     : requested weather vs. clear weather (regression betas)
%     Day type    : this day type vs. the other one at the same hour
%     Incidents   : probability of a severe slowdown (R >= 1.8)
meanAdj = @(wk, h, win) mean(exp(ratioSampleWin(M, wk, h, win, X)));
now_  = meanAdj(isWeekend, hour, 0.75);
base  = meanAdj(isWeekend, 13, 2.0);
other = meanAdj(~isWeekend, hour, 0.75);
b = M.Beta;
Xc = weatherTarget("Clear", 0, NaN);
wxEff = exp(b.Rain*(X.Rain - Xc.Rain) + b.Vis*(X.Vis - Xc.Vis) + b.Fog*(X.Fog - Xc.Fog) + ...
            b.Cloudy*(X.Cloudy - Xc.Cloudy)) - 1;
if isWeekend, dtn = "weekend"; else, dtn = "weekday"; end
name = ["Time of day"; "Weather"; "Day type"; "Severe slowdowns"];
pct  = [100*(now_/base - 1); 100*wxEff; 100*(now_/other - 1); 100*pSevere];
note = [sprintf("%.2f h vs midday baseline", hour); ...
        sprintf("%s vs clear sky", X.Cond); ...
        sprintf("%s vs the other day type", dtn); ...
        "chance of a trip >= 1.8x free-flow"];
D = struct('name', cellstr(name), 'pct', num2cell(round(pct, 1)), 'note', cellstr(note));
end

function x = ratioSampleWin(M, wk, h, win, X)
idx = find(M.IsWeekend == wk & abs(M.Hour - h) <= win);
if numel(idx) < 40, idx = find(M.IsWeekend == wk); end
b = M.Beta;
x = log(M.Ratio(idx)) + b.Rain*(X.Rain - M.Rain(idx)) + b.Vis*(X.Vis - M.Vis(idx)) + ...
    b.Fog*(X.Fog - M.Fog(idx)) + b.Cloudy*(X.Cloudy - M.Cloudy(idx));
end
