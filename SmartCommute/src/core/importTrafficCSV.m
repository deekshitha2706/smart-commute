function T = importTrafficCSV(file)
%IMPORTTRAFFICCSV  Import a user CSV with the 12 required columns and add helpers.
T = readtable(file);
req = {'Date','DayOfWeek','DepartureTime','TrafficVolume','AverageSpeed','TravelTime', ...
       'CongestionIndex','Temperature','Rainfall','WeatherCondition','Visibility','RouteID'};
miss = setdiff(req, T.Properties.VariableNames);
if ~isempty(miss)
    error('SmartCommute:import', 'Missing columns: %s', strjoin(miss, ', '));
end
if ~isdatetime(T.Date), T.Date = datetime(T.Date); end
T.DayOfWeek = categorical(string(T.DayOfWeek));
T.WeatherCondition = categorical(string(T.WeatherCondition));
T.RouteID = categorical(string(T.RouteID));
T.IsWeekend = ismember(T.DayOfWeek, categorical(["Sat","Sun"]));
hh = T.DepartureTime;
T.IsPeak = ~T.IsWeekend & ((hh >= 7 & hh < 10) | (hh >= 16 & hh < 19.5));
R = routeCatalog();
[~, loc] = ismember(string(T.RouteID), string(R.RouteID));
loc(loc == 0) = 1;
T.VCRatio = T.TrafficVolume ./ R.Capacity(loc);
T.Density = categorical(repmat("Normal", height(T), 1), ["Light","Normal","Heavy"]);
T.Density(T.VCRatio < 0.50)  = "Light";
T.Density(T.VCRatio >= 0.85) = "Heavy";
end
