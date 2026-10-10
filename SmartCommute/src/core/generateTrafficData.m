function T = generateTrafficData(n, seed)
%GENERATETRAFFICDATA  Synthetic but physically-motivated urban traffic dataset.
%   T = generateTrafficData(12000, 2026)
%
%   Generative model
%     demand(h)      : bimodal weekday profile (8:12 and 17:36 peaks), flat weekend
%     v/c ratio      : demand * route factor * lognormal noise
%     travel time    : t0 * (1 + 0.9 (v/c)^4)   (BPR-style volume-delay function)
%                      * weather multiplier * lognormal noise + rare incidents
%     speed          : distance / travel time
%     congestion idx : 100 * (1 - freeFlowTime / travelTime)   in [0,100]
%   Required columns: Date, DayOfWeek, DepartureTime, TrafficVolume,
%   AverageSpeed, TravelTime, CongestionIndex, Temperature, Rainfall,
%   WeatherCondition, Visibility, RouteID.  Helper columns: IsWeekend,
%   IsPeak, VCRatio, Density.
if nargin < 1, n = 12000; end
if nargin < 2, seed = 2026; end
rng(seed, 'twister');
R = routeCatalog();

% ---- calendar ---------------------------------------------------------
Date = datetime(2024,1,1) + days(randi([0 365], n, 1));
dow  = weekday(Date);                       % 1 = Sunday
IsWeekend = (dow == 1) | (dow == 7);
dnames = ["Sun";"Mon";"Tue";"Wed";"Thu";"Fri";"Sat"];
DayOfWeek = categorical(dnames(dow), dnames);
mo  = month(Date);
doy = day(Date, 'dayofyear');

% ---- departure time (hours, quarter-hour resolution) -------------------
u = rand(n,1);  h = zeros(n,1);  wk = ~IsWeekend;
m1 = wk & u < 0.34;               h(m1) = 8.0  + 1.1*randn(nnz(m1),1);
m2 = wk & u >= 0.34 & u < 0.70;   h(m2) = 17.5 + 1.3*randn(nnz(m2),1);
m3 = wk & u >= 0.70 & u < 0.90;   h(m3) = 13.0 + 2.0*randn(nnz(m3),1);
m4 = wk & u >= 0.90;              h(m4) = 5 + 18*rand(nnz(m4),1);
we = IsWeekend;                   h(we) = 12.5 + 3.5*randn(nnz(we),1);
DepartureTime = round(min(max(h, 5), 23.5) * 4) / 4;

% ---- weather ----------------------------------------------------------
pFog  = 0.02 + 0.08*double(mo <= 2 | mo == 12);
pRain = 0.08 + 0.14*double(mo >= 6 & mo <= 9);
pCl   = 0.20*ones(n,1);
u = rand(n,1);
W = repmat("Clear", n, 1);
W(u < pFog + pRain + pCl) = "Cloudy";
W(u < pFog + pRain)       = "Rain";
W(u < pFog)               = "Fog";
WeatherCondition = categorical(W, ["Clear","Cloudy","Rain","Fog"]);
isRain = W == "Rain"; isFog = W == "Fog"; isCl = W == "Cloudy";
Rainfall = zeros(n,1);
Rainfall(isRain) = gamrnd(2, 2.5, nnz(isRain), 1);
Visibility = 9 + 1.2*randn(n,1);
Visibility(isCl)   = 8 + 1.5*randn(nnz(isCl),1);
Visibility(isRain) = 5.5 + 1.5*randn(nnz(isRain),1) - 0.15*Rainfall(isRain);
Visibility(isFog)  = 0.8 + 0.5*rand(nnz(isFog),1);
Visibility = round(min(max(Visibility, 0.1), 12), 1);
Temperature = 24 + 9*sin(2*pi*(doy-100)/365) + 4*sin(pi*(DepartureTime-9)/12) ...
              + 2.5*randn(n,1) - 2*isRain;
Temperature = round(Temperature, 1);
Rainfall = round(Rainfall, 1);

% ---- routes, demand, volume -------------------------------------------
rid = randi(height(R), n, 1);
hh = DepartureTime;
dWeek = 0.12 + 0.78*exp(-(hh-8.2).^2/(2*1.1^2)) + 0.85*exp(-(hh-17.6).^2/(2*1.3^2)) ...
        + 0.30*exp(-(hh-13).^2/(2*2.2^2));
dWend = 0.10 + 0.55*exp(-(hh-13).^2/(2*3.2^2));
demand = dWeek;  demand(we) = dWend(we);
dowF = [0.90 1.03 1.00 1.00 1.01 0.95 0.92]';       % Sun..Sat
routeF = [1.10 0.95 0.85 1.05 0.80]';
vc = demand .* dowF(dow) .* routeF(rid) .* exp(0.12*randn(n,1));
TrafficVolume = round(vc .* R.Capacity(rid));

% ---- travel time ------------------------------------------------------
t0 = R.FreeFlowMin(rid);
wf = ones(n,1);
wf(isCl)   = 1.03;
wf(isRain) = 1.12 + 0.012*Rainfall(isRain);
wf(isFog)  = 1.18;
tt = t0 .* (1 + 0.9*vc.^4) .* wf .* exp(0.10*randn(n,1));
inc = rand(n,1) < 0.025;
tt(inc) = tt(inc) + 5 - 10*log(rand(nnz(inc),1));
TravelTime = round(tt, 1);
AverageSpeed = round(R.DistanceKm(rid) ./ tt * 60, 1);
CongestionIndex = round(min(max(100*(1 - t0./tt), 0), 100), 1);

RouteID = R.RouteID(rid);
IsPeak  = wk & ((hh >= 7 & hh < 10) | (hh >= 16 & hh < 19.5));
VCRatio = round(TrafficVolume ./ R.Capacity(rid), 3);
Density = categorical(repmat("Normal", n, 1), ["Light","Normal","Heavy"]);
Density(VCRatio < 0.50)  = "Light";
Density(VCRatio >= 0.85) = "Heavy";

T = table(Date, DayOfWeek, DepartureTime, TrafficVolume, AverageSpeed, TravelTime, ...
          CongestionIndex, Temperature, Rainfall, WeatherCondition, Visibility, RouteID, ...
          IsWeekend, IsPeak, VCRatio, Density);
T = sortrows(T, {'Date','DepartureTime'});
end
