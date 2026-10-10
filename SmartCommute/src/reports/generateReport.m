function outFile = generateReport(kind, ctx, outFile)
%GENERATEREPORT  Create one of the four SmartCommute PDF reports.
%   kind    : 'risk' | 'stats' | 'sim' | 'departure'
%   ctx     : struct with T, Fit, Prob, Inf, Corr, Reg, MC, Rec, Scenario, RouteTbl
%   outFile : target .pdf path
%   Pages are rendered off-screen on a white background (print friendly)
%   and appended with exportgraphics (R2020a+).
switch lower(kind)
    case 'risk',      pages = riskPages(ctx);
    case 'stats',     pages = statsPages(ctx);
    case 'sim',       pages = simPages(ctx);
    case 'departure', pages = depPages(ctx);
    otherwise, error('Unknown report kind: %s', kind);
end
if exist(outFile, 'file'), delete(outFile); end
for i = 1:numel(pages)
    exportgraphics(pages{i}, outFile, 'Append', i > 1, 'ContentType', 'vector');
    close(pages{i});
end
end

% ======================= page builders ====================================
function pages = riskPages(c)
T = c.T; P = c.Prob;
f = newPage('Traffic Risk Report', 'Probability of delay and congestion from historical data');
ax = textAxes(f);
L = {sprintf('Records analysed: %d    Period: %s to %s', height(T), datestr(min(T.Date),'yyyy-mm-dd'), datestr(max(T.Date),'yyyy-mm-dd'))
     ''
     'Overall delay probabilities (95% Clopper-Pearson CI)'};
for i = 1:height(P.Overall)
    L{end+1} = sprintf('   P(TravelTime > %2d min) = %5.2f %%   [%5.2f, %5.2f]', P.Overall.Threshold_min(i), ...
        100*P.Overall.Probability(i), 100*P.Overall.CI_low(i), 100*P.Overall.CI_high(i)); %#ok<AGROW>
end
L{end+1} = sprintf('   P(Heavy congestion, CI >= %d) = %5.2f %%   [%5.2f, %5.2f]', P.HeavyThreshold, 100*P.Heavy, 100*P.HeavyCI(1), 100*P.HeavyCI(2));
L{end+1} = sprintf('   Bayes: P(Peak | Heavy) = %.1f %%,  P(Rain | Heavy) = %.1f %%', 100*P.BayesPeakGivenHeavy, 100*P.BayesRainGivenHeavy);
L{end+1} = ''; L{end+1} = 'Conditional probabilities';
L{end+1} = sprintf('   %-18s %6s %8s %8s %8s %9s', 'Condition', 'N', 'P>20', 'P>30', 'P>45', 'P(Heavy)');
for i = 1:height(P.Conditional)
    r = P.Conditional(i,:);
    L{end+1} = sprintf('   %-18s %6d %7.1f%% %7.1f%% %7.1f%% %8.1f%%', r.Condition, r.N, 100*r.P_gt20, 100*r.P_gt30, 100*r.P_gt45, 100*r.P_Heavy); %#ok<AGROW>
end
writeLines(ax, L, 0.93);
a = axes(f, 'Position', [0.10 0.08 0.80 0.28]);
bar(a, categorical(P.Conditional.Condition, P.Conditional.Condition), 100*[P.Conditional.P_gt30 P.Conditional.P_Heavy]);
legend(a, {'P(TT>30)', 'P(Heavy)'}); ylabel(a, '%'); title(a, 'Conditional risk by scenario'); grid(a, 'on');
pages = {f};
% page 2: heatmap + route boxes
f2 = newPage('Traffic Risk Report - Temporal & route view', '');
a = axes(f2, 'Position', [0.10 0.55 0.80 0.32]);
[M, hrs] = hourDowGrid(T);
imagesc(a, 1:7, hrs, M); colormap(a, riskColormap()); colorbar(a);
a.XTick = 1:7; a.XTickLabel = {'Mon','Tue','Wed','Thu','Fri','Sat','Sun'}; a.YDir = 'normal';
title(a, 'Mean travel time (min) by hour and weekday'); ylabel(a, 'Departure hour');
a = axes(f2, 'Position', [0.10 0.10 0.80 0.32]);
boxchart(a, T.RouteID, T.TravelTime); title(a, 'Travel time by route'); ylabel(a, 'min'); grid(a, 'on');
pages{2} = f2;
end

function pages = statsPages(c)
T = c.T;
f = newPage('Statistical Summary Report', 'Descriptive statistics, distribution fitting and inference');
[S, ~] = descriptiveStats(T.TravelTime); O = detectOutliers(T.TravelTime);
L = {'Descriptive statistics - travel time (min)'
     sprintf('   N=%d  Mean=%.2f  Median=%.2f  Mode=%d  Var=%.2f  SD=%.2f', S.N, S.Mean, S.Median, S.Mode, S.Variance, S.Std)
     sprintf('   Q1=%.2f  Q3=%.2f  IQR=%.2f  P95=%.2f  Skew=%.2f  Kurt=%.2f', S.Q1, S.Q3, S.IQR, S.P95, S.Skewness, S.Kurtosis)
     sprintf('   Outliers: IQR=%d (%.2f%%)   Z-score=%d (%.2f%%)', O.Table.Count(1), O.Table.Percent(1), O.Table.Count(2), O.Table.Percent(2))
     ''
     sprintf('Distribution fitting (best by AIC: %s)', c.Fit.Best)
     sprintf('   %-10s %12s %12s %10s %8s', 'Dist', 'AIC', 'BIC', 'KS stat', 'KS p')};
for i = 1:height(c.Fit.Table)
    r = c.Fit.Table(i,:);
    L{end+1} = sprintf('   %-10s %12.1f %12.1f %10.4f %8.4f', r.Distribution, r.AIC, r.BIC, r.KS_stat, r.KS_p); %#ok<AGROW>
end
L{end+1} = ''; L{end+1} = 'Confidence intervals (mean travel time)';
for i = 1:2
    L{end+1} = sprintf('   %.0f%% CI: [%.3f, %.3f]', c.Inf.CI.Level_pct(i), c.Inf.CI.Lower(i), c.Inf.CI.Upper(i)); %#ok<AGROW>
end
L{end+1} = ''; L{end+1} = 'Hypothesis tests (alpha = 0.05)';
for i = 1:height(c.Inf.Tests)
    r = c.Inf.Tests(i,:);
    L{end+1} = sprintf('   %-14s %-34s stat=%9.2f p=%-9.3g %s', r.Test, r.Comparison, r.Statistic, r.PValue, r.Decision); %#ok<AGROW>
end
ax = textAxes(f); writeLines(ax, L, 0.93, 8);
a = axes(f, 'Position', [0.10 0.06 0.80 0.22]);
histogram(a, T.TravelTime, 60, 'Normalization', 'pdf', 'FaceColor', [0.3 0.6 0.9], 'EdgeColor', 'none'); hold(a, 'on');
x = linspace(min(T.TravelTime), max(T.TravelTime), 300);
for i = 1:4, plot(a, x, pdf(c.Fit.Dists{i}, x), 'LineWidth', 1.4); end
legend(a, [{'Data'}; cellstr(c.Fit.Names)]); title(a, 'Travel-time distribution and fitted models'); grid(a, 'on');
pages = {f};
f2 = newPage('Statistical Summary Report - Correlation & Regression', '');
a = axes(f2, 'Position', [0.12 0.52 0.76 0.36]);
imagesc(a, c.Corr.Pearson, [-1 1]); colormap(a, parula); colorbar(a);
a.XTick = 1:8; a.YTick = 1:8; a.XTickLabel = cellstr(c.Corr.Names); a.YTickLabel = cellstr(c.Corr.Names);
a.XTickLabelRotation = 40; title(a, 'Pearson correlation matrix');
a = axes(f2, 'Position', [0.10 0.08 0.36 0.28]);
scatter(a, c.Reg.Test.Pred, c.Reg.Test.Actual, 6, 'filled', 'MarkerFaceAlpha', 0.3); hold(a, 'on');
plot(a, [0 80], [0 80], 'r-'); title(a, 'Predicted vs actual (test)'); xlabel(a, 'Predicted'); ylabel(a, 'Actual'); grid(a, 'on');
a = axes(f2, 'Position', [0.56 0.08 0.34 0.28]);
histogram(a, c.Reg.Test.Resid, 40, 'FaceColor', [0.4 0.4 0.8]); title(a, 'Residuals'); grid(a, 'on');
M = c.Reg.Metrics;
txt = sprintf('Multiple LR: R^2=%.3f, adj R^2=%.3f, test RMSE=%.2f min | Logistic AUC=%.3f', M.R2(2), M.AdjR2(2), M.TestRMSE(2), M.AUC(4));
annotation(f2, 'textbox', [0.08 0.43 0.84 0.04], 'String', txt, 'EdgeColor', 'none', 'FontSize', 9);
pages{2} = f2;
end

function pages = simPages(c)
M = c.MC;
f = newPage('Monte Carlo Simulation Report', sprintf('%d simulated journeys, fitted law: %s', M.N, M.DistName));
sc = c.Scenario;
L = {sprintf('Scenario: route %s | %s | depart %.2f h | weather %s | density %s', string(sc.Route), string(sc.DayType), sc.Hour, string(sc.Weather), string(sc.Density))
     sprintf('Historical sample used: %d records (relaxation: %s)', M.Info.N, M.Info.Relaxation)
     ''
     sprintf('Expected travel time     : %.2f min (SD %.2f, CV %.2f)', M.Mean, M.Std, M.CV)
     sprintf('95%% CI of the mean       : [%.3f, %.3f]', M.CIMean95)
     sprintf('99%% CI of the mean       : [%.3f, %.3f]', M.CIMean99)
     sprintf('95%% interval, one trip   : [%.1f, %.1f] min', M.PI95)
     sprintf('P(TT>20)=%.1f%%  P(TT>30)=%.1f%%  P(TT>45)=%.1f%%', 100*M.P20, 100*M.P30, 100*M.P45)
     sprintf('P(late | budget %.0f min) = %.2f%%  [%.2f, %.2f]', M.Budget, 100*M.PLate, 100*M.PLateCI)
     sprintf('P(heavy congestion)      : %.1f%%', 100*M.PHeavy)
     sprintf('Risk score               : %.1f / 100  (%s)', M.RiskScore, M.RiskClass)};
ax = textAxes(f); writeLines(ax, L, 0.93);
a = axes(f, 'Position', [0.10 0.40 0.80 0.25]);
histogram(a, M.Samples, 80, 'Normalization', 'pdf', 'FaceColor', [0.3 0.6 0.9], 'EdgeColor', 'none'); hold(a, 'on');
xline(a, M.Budget, 'r-', 'Budget', 'LineWidth', 1.5); xline(a, M.Mean, 'k--', 'Mean');
title(a, 'Simulated travel-time distribution'); xlabel(a, 'min'); grid(a, 'on');
a = axes(f, 'Position', [0.10 0.07 0.80 0.22]);
yyaxis(a, 'left'); plot(a, M.Conv.k, 100*M.Conv.PLate, 'LineWidth', 1.4); ylabel(a, 'P(late) %');
yyaxis(a, 'right'); plot(a, M.Conv.k, M.Conv.Mean, 'LineWidth', 1.4); ylabel(a, 'Running mean (min)');
title(a, 'Monte Carlo convergence'); xlabel(a, 'Simulated journeys'); grid(a, 'on');
pages = {f};
end

function pages = depPages(c)
R = c.Rec;
f = newPage('Departure Recommendation Report', 'Risk-based departure time');
L = {sprintf('Deadline: %02d:%02d    Tolerated P(late): %.0f%%', floor(R.Deadline), round(mod(R.Deadline,1)*60), 100*R.Tolerance)
     ''
     sprintf('RECOMMENDED DEPARTURE: %s', R.Text)
     sprintf('   Time budget %.0f min | expected travel time %.1f min | P(late) = %.2f%%', R.BestBudget, R.BestExpected, 100*R.BestPLate)
     iff(R.ToleranceMet, '   Tolerance satisfied.', '   WARNING: tolerance cannot be met in the 2 h window; the minimum-risk time is shown.')
     ''
     sprintf('   %-10s %10s %12s %10s %10s', 'Depart', 'Budget', 'E[TT]', 'P95(TT)', 'P(late)')};
for i = 1:numel(R.Candidates)
    L{end+1} = sprintf('   %-10s %9.0f %12.1f %10.1f %9.2f%%', R.Table.Departure(i), R.Table.Budget_min(i), R.Table.ExpectedTT(i), R.Table.P95_TT(i), R.Table.PLate_pct(i)); %#ok<AGROW>
end
ax = textAxes(f); writeLines(ax, L, 0.93, 8);
a = axes(f, 'Position', [0.10 0.07 0.80 0.25]);
plot(a, R.Candidates, 100*R.PLate, '-o', 'LineWidth', 1.5); hold(a, 'on');
yline(a, 100*R.Tolerance, 'r--', 'Tolerance'); xline(a, R.BestHour, 'g-', 'Leave');
xlabel(a, 'Departure hour'); ylabel(a, 'P(late) %'); title(a, 'Late-arrival probability vs departure time'); grid(a, 'on');
pages = {f};
end

% ======================= helpers ==========================================
function f = newPage(ttl, sub)
f = figure('Visible', 'off', 'Color', 'w', 'Units', 'inches', 'Position', [0 0 8.5 11], ...
    'PaperUnits', 'inches', 'PaperSize', [8.5 11]);
annotation(f, 'rectangle', [0 0.955 1 0.045], 'FaceColor', [0.04 0.06 0.12], 'EdgeColor', 'none');
annotation(f, 'textbox', [0.04 0.955 0.92 0.045], 'String', ['SMARTCOMMUTE  |  ' ttl], 'Color', 'w', ...
    'FontWeight', 'bold', 'FontSize', 13, 'EdgeColor', 'none', 'VerticalAlignment', 'middle');
if ~isempty(sub)
    annotation(f, 'textbox', [0.04 0.925 0.92 0.03], 'String', sub, 'Color', [0.3 0.3 0.3], 'EdgeColor', 'none', 'FontSize', 9);
end
annotation(f, 'textbox', [0.04 0.005 0.92 0.02], 'String', ['Generated ' datestr(now, 'yyyy-mm-dd HH:MM')], ...
    'Color', [0.5 0.5 0.5], 'EdgeColor', 'none', 'FontSize', 7);
end

function ax = textAxes(f)
ax = axes(f, 'Position', [0 0 1 1], 'Visible', 'off', 'XLim', [0 1], 'YLim', [0 1]);
end

function writeLines(ax, L, y0, fs)
if nargin < 4, fs = 9; end
dy = 0.0165*fs/9;
for i = 1:numel(L)
    text(ax, 0.05, y0 - (i-1)*dy - 0.02, L{i}, 'FontName', 'Courier New', 'FontSize', fs, 'Interpreter', 'none', 'VerticalAlignment', 'top');
end
end

function s = iff(c, a, b), if c, s = a; else, s = b; end, end
