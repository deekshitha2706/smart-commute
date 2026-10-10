function I = inferenceTests(T, alpha)
%INFERENCETESTS  Confidence intervals, Welch t-tests, chi-square tests, ANOVA.
if nargin < 2, alpha = 0.05; end
tt = T.TravelTime;  heavy = T.CongestionIndex >= 40;

% ---- confidence intervals for the mean travel time ---------------------
n = numel(tt); m = mean(tt); se = std(tt)/sqrt(n);
lvl = [0.95; 0.99]; lo = zeros(2,1); hi = lo;
for i = 1:2
    tc = tinv(1 - (1-lvl(i))/2, n-1);
    lo(i) = m - tc*se; hi(i) = m + tc*se;
end
I.CI = table(lvl*100, repmat(m,2,1), lo, hi, 'VariableNames', {'Level_pct','Mean','Lower','Upper'});
% CI for P(TT>30)
[p30, c30] = binofit(nnz(tt > 30), n, 0.05);
I.P30 = p30; I.P30CI = c30;

rows = {};
% ---- Welch t-tests ------------------------------------------------------
rows(end+1,:) = welch(tt(T.IsPeak), tt(~T.IsPeak), 'Peak vs Off-Peak');
isR = T.WeatherCondition == "Rain"; isC = T.WeatherCondition == "Clear";
rows(end+1,:) = welch(tt(isR), tt(isC), 'Rain vs Clear');
rows(end+1,:) = welch(tt(~T.IsWeekend), tt(T.IsWeekend), 'Weekday vs Weekend');

% ---- chi-square tests of independence (heavy congestion) ----------------
rows(end+1,:) = chisq(T.IsPeak, heavy, 'Peak/Off-peak x Heavy congestion');
sub = isR | isC;
rows(end+1,:) = chisq(isR(sub), heavy(sub), 'Rain/Clear x Heavy congestion');
rows(end+1,:) = chisq(T.IsWeekend, heavy, 'Weekday/Weekend x Heavy congestion');
rows(end+1,:) = chisq(T.Density, heavy, 'Traffic density x Heavy congestion');

% ---- one-way ANOVA ------------------------------------------------------
rows(end+1,:) = anova(tt, T.WeatherCondition, 'Weather (4 levels)');
rows(end+1,:) = anova(tt, T.RouteID, 'Route (5 levels)');
rows(end+1,:) = anova(tt, T.DayOfWeek, 'Day of week (7 levels)');

I.Tests = cell2table(rows, 'VariableNames', ...
    {'Test','Comparison','Statistic','DF','PValue','EffectSize','Decision'});
I.Alpha = alpha;
I.Tests.Decision = repmat("", height(I.Tests), 1);
I.Tests.Decision(I.Tests.PValue < alpha)  = "Reject H0";
I.Tests.Decision(I.Tests.PValue >= alpha) = "Fail to reject H0";

% group means for context
I.GroupMeans = table( ...
    ["Peak";"Off-peak";"Rain";"Clear";"Weekday";"Weekend"], ...
    [mean(tt(T.IsPeak)); mean(tt(~T.IsPeak)); mean(tt(isR)); mean(tt(isC)); mean(tt(~T.IsWeekend)); mean(tt(T.IsWeekend))], ...
    'VariableNames', {'Group','MeanTravelTime'});
end

function r = welch(a, b, label)
[~, p, ~, st] = ttest2(a, b, 'Vartype', 'unequal');
d = (mean(a) - mean(b)) / sqrt((var(a) + var(b))/2);       % Cohen's d
r = {"Welch t-test", string(label), st.tstat, sprintf('%.1f', st.df), p, d, ""};
end

function r = chisq(g, y, label)
[tab, c2, p] = crosstab(g, y);
df = (size(tab,1)-1)*(size(tab,2)-1);
V = sqrt(c2 / (sum(tab(:)) * min(size(tab)-1)));          % Cramer's V
r = {"Chi-square", string(label), c2, sprintf('%d', df), p, V, ""};
end

function r = anova(x, g, label)
[p, tbl] = anova1(x, g, 'off');
F = tbl{2,5}; ssb = tbl{2,2}; sst = tbl{4,2};
r = {"One-way ANOVA", string(label), F, sprintf('%d,%d', tbl{2,3}, tbl{3,3}), p, ssb/sst, ""};
end
