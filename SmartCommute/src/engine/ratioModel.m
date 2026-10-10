function M = ratioModel(T)
%RATIOMODEL  Route-length-independent model of congestion.
%   The congestion RATIO  R = TravelTime / FreeFlowTime  describes how much
%   slower than empty roads a trip is, so history from the five catalogue
%   routes can be reused for ANY route the user draws (minutes = R x free-flow).
%
%   A regression  log R ~ Rain + Visibility + Fog + Cloudy + Peak + Weekend
%   quantifies the weather / peak effects (used to correct samples to the
%   requested weather, and reported as evidence in the "Why" tab).
RT = routeCatalog();
[~, loc] = ismember(string(T.RouteID), string(RT.RouteID));
loc(loc == 0) = 1;
M.Ratio = max(T.TravelTime ./ RT.FreeFlowMin(loc), 0.5);
M.Hour = T.DepartureTime;
M.IsWeekend = logical(T.IsWeekend);
M.Rain = T.Rainfall;
M.Vis  = T.Visibility;
M.Fog    = double(T.WeatherCondition == "Fog");
M.Cloudy = double(T.WeatherCondition == "Cloudy");
M.Peak   = double(T.IsPeak);
M.N = numel(M.Ratio);
M.MedianR = median(M.Ratio);

D = table(log(M.Ratio), M.Rain, M.Vis, M.Fog, M.Cloudy, M.Peak, double(M.IsWeekend), ...
    'VariableNames', {'LogR','Rain','Vis','Fog','Cloudy','Peak','Weekend'});
M.Lm = fitlm(D, 'LogR ~ Rain + Vis + Fog + Cloudy + Peak + Weekend');
cf = M.Lm.Coefficients;
get = @(n) cf.Estimate(strcmp(cf.Properties.RowNames, n));
M.Beta = struct('Rain', get('Rain'), 'Vis', get('Vis'), 'Fog', get('Fog'), ...
                'Cloudy', get('Cloudy'), 'Peak', get('Peak'), 'Weekend', get('Weekend'));
M.R2 = M.Lm.Rsquared.Ordinary;
M.AdjR2 = M.Lm.Rsquared.Adjusted;
M.Corr = struct('Rain', corr(M.Rain, log(M.Ratio)), 'Vis', corr(M.Vis, log(M.Ratio)), ...
                'Peak', corr(M.Peak, log(M.Ratio)));
end
