function C = correlationAnalysis(T)
%CORRELATIONANALYSIS  Pearson and Spearman matrices (with p-values).
sev = zeros(height(T),1);                       % ordinal weather severity
sev(T.WeatherCondition == "Cloudy") = 1;
sev(T.WeatherCondition == "Rain")   = 2;
sev(T.WeatherCondition == "Fog")    = 3;
X = [T.TrafficVolume, T.TravelTime, T.AverageSpeed, T.Visibility, ...
     T.Rainfall, T.Temperature, T.CongestionIndex, sev];
C.Names = ["Volume","TravelTime","Speed","Visibility","Rainfall","Temp","CongIdx","WeatherSev"];
[C.Pearson,  C.PearsonP]  = corr(X, 'Type', 'Pearson');
[C.Spearman, C.SpearmanP] = corr(X, 'Type', 'Spearman');
% strongest relationships with travel time
i = 2; r = C.Pearson(i,:); r(i) = NaN;
[~, ord] = sort(abs(r), 'descend', 'MissingPlacement', 'last');
C.TopWithTravelTime = table(C.Names(ord(1:5))', r(ord(1:5))', C.Spearman(i, ord(1:5))', ...
    'VariableNames', {'Variable','Pearson','Spearman'});
end
