function [S, info] = selectScenario(T, sc, minN)
%SELECTSCENARIO  Conditional sub-sample of history matching a commuter scenario.
%   sc fields: Route ("R1".."R5"|"All"), DayType ("Weekday"|"Weekend"|"Any"),
%              Hour (decimal hours), Weather ("Any"|"Clear"|"Cloudy"|"Rain"|"Fog"),
%              Density ("Any"|"Light"|"Normal"|"Heavy"), Window (half-width, h)
%   If fewer than minN rows match, filters are relaxed in a fixed order
%   (density -> weather -> widen hour window) and the relaxation is reported.
if nargin < 3, minN = 60; end
sc = fillDefaults(sc);
steps = { {'all',      sc.Window, true,  true }
          {'-density', sc.Window, false, true }
          {'-weather', sc.Window, true,  false}
          {'-density -weather', sc.Window, false, false}
          {'-density -weather, window x2', 2*sc.Window, false, false}
          {'-density -weather, window x3', 3*sc.Window, false, false} };
for k = 1:numel(steps)
    st = steps{k};
    m = true(height(T),1);
    if sc.Route ~= "All",      m = m & string(T.RouteID) == sc.Route; end
    if sc.DayType == "Weekday", m = m & ~T.IsWeekend; end
    if sc.DayType == "Weekend", m = m & T.IsWeekend;  end
    m = m & abs(T.DepartureTime - sc.Hour) <= st{2};
    if st{3} && sc.Density ~= "Any", m = m & string(T.Density) == sc.Density; end
    if st{4} && sc.Weather ~= "Any", m = m & string(T.WeatherCondition) == sc.Weather; end
    if nnz(m) >= minN, break; end
end
if nnz(m) < minN                       % last resort: route + day type only
    m = true(height(T),1);
    if sc.Route ~= "All", m = m & string(T.RouteID) == sc.Route; end
    if sc.DayType == "Weekday", m = m & ~T.IsWeekend; end
    if sc.DayType == "Weekend", m = m & T.IsWeekend;  end
    st = {'route + day type only'};
end
S = T(m, :);
info.N = height(S);
info.Relaxation = string(st{1});
info.Relaxed = ~strcmp(st{1}, 'all');
end

function sc = fillDefaults(sc)
d = struct('Route',"All",'DayType',"Weekday",'Hour',8,'Weather',"Any",'Density',"Any",'Window',0.75);
f = fieldnames(d);
for i = 1:numel(f)
    if ~isfield(sc, f{i}) || isempty(sc.(f{i})), sc.(f{i}) = d.(f{i}); end
end
sc.Route = string(sc.Route); sc.DayType = string(sc.DayType);
sc.Weather = string(sc.Weather); sc.Density = string(sc.Density);
end
