function X = weatherTarget(cond, rainMm, visKm)
%WEATHERTARGET  Regression covariates describing a requested weather state.
%   cond: "Clear" | "Cloudy" | "Rain" | "Fog".  rainMm / visKm may be NaN
%   (then typical values for the condition are used).
cond = string(cond);
if isempty(rainMm) || ~isfinite(rainMm), rainMm = NaN; end
if isempty(visKm)  || ~isfinite(visKm),  visKm  = NaN; end
switch cond
    case "Rain",   if isnan(rainMm), rainMm = 4;   end; if isnan(visKm), visKm = 5.5; end
    case "Fog",    rainMm = 0;                          if isnan(visKm), visKm = 0.8; end
    case "Cloudy", rainMm = 0;                          if isnan(visKm), visKm = 8;   end
    otherwise,     cond = "Clear"; rainMm = 0;          if isnan(visKm), visKm = 9;   end
end
X.Cond = cond;
X.Rain = min(rainMm, 20);
X.Vis  = min(max(visKm, 0.1), 12);
X.Fog    = double(cond == "Fog");
X.Cloudy = double(cond == "Cloudy");
end
