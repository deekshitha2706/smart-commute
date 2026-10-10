function [x, idx, relax] = ratioSample(M, isWeekend, hour, X, minN)
%RATIOSAMPLE  Weather-corrected log-ratio sample for a day type and hour.
%   1. keep trips of the same day type with |departure - hour| <= window,
%      widening the window (0.75 -> 1.5 -> 2.25 -> 3 h) until >= minN trips;
%      if still short, use the whole day type (reported in `relax`);
%   2. shift each log R to the target weather with the regression betas:
%        log R' = log R + b'(x_target - x_trip)
%   so rain / fog / low visibility change the risk, even if the historical
%   trips of that hour were mostly clear.
if nargin < 5, minN = 80; end
wins = [0.75 1.5 2.25 3.0];
relax = "none";
for k = 1:numel(wins)
    idx = find(M.IsWeekend == isWeekend & abs(M.Hour - hour) <= wins(k));
    if numel(idx) >= minN
        if k > 1, relax = sprintf("time window widened to +/-%.2f h", wins(k)); end
        break
    end
end
if numel(idx) < minN
    idx = find(M.IsWeekend == isWeekend);
    relax = "whole day type";
end
b = M.Beta;
shift = b.Rain*(X.Rain - M.Rain(idx)) + b.Vis*(X.Vis - M.Vis(idx)) + ...
        b.Fog*(X.Fog - M.Fog(idx)) + b.Cloudy*(X.Cloudy - M.Cloudy(idx));
x = log(M.Ratio(idx)) + shift;
end
