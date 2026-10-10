function [S, Tbl] = descriptiveStats(x)
%DESCRIPTIVESTATS  Mean, median, mode, variance, std, quartiles, shape measures.
x = x(:); x = x(isfinite(x));
q = quantile(x, [0.25 0.5 0.75 0.90 0.95]);
S.N = numel(x);
S.Mean = mean(x);   S.Median = median(x);   S.Mode = mode(round(x));
S.Variance = var(x); S.Std = std(x);
S.Min = min(x);     S.Max = max(x);
S.Q1 = q(1);        S.Q3 = q(3);   S.IQR = q(3) - q(1);
S.P90 = q(4);       S.P95 = q(5);
S.Skewness = skewness(x);  S.Kurtosis = kurtosis(x);
S.CV = S.Std / S.Mean;
Measure = ["N";"Mean";"Median";"Mode (rounded)";"Variance";"Std Dev";"Minimum";"Q1 (25%)"; ...
           "Q3 (75%)";"IQR";"90th pct";"95th pct";"Maximum";"Skewness";"Kurtosis";"Coeff. of Variation"];
Value = [S.N;S.Mean;S.Median;S.Mode;S.Variance;S.Std;S.Min;S.Q1;S.Q3;S.IQR;S.P90;S.P95;S.Max;S.Skewness;S.Kurtosis;S.CV];
Tbl = table(Measure, round(Value, 3), 'VariableNames', {'Measure','Value'});
end
