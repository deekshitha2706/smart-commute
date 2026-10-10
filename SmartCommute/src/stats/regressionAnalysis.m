function Rg = regressionAnalysis(T)
%REGRESSIONANALYSIS  Simple + multiple linear regression and logistic delay model.
%   80/20 train-test split. Targets: TravelTime, CongestionIndex (linear),
%   Delay30 = 1{TravelTime>30} (logistic -> delay probability).
D = table();
D.TravelTime = T.TravelTime;  D.CongestionIndex = T.CongestionIndex;
D.VolK = T.TrafficVolume/1000; D.VolK2 = D.VolK.^2;
D.Rainfall = T.Rainfall; D.Visibility = T.Visibility; D.Temperature = T.Temperature;
D.Peak = double(T.IsPeak); D.Weekend = double(T.IsWeekend);
D.Route = T.RouteID;  D.Delay30 = double(T.TravelTime > 30);
rng(7);
idx = randperm(height(D)); ntr = round(0.8*height(D));
Tr = D(idx(1:ntr), :); Te = D(idx(ntr+1:end), :);
rhs = 'VolK + VolK2 + Rainfall + Visibility + Temperature + Peak + Weekend + Route';

Rg.Simple   = fitlm(Tr, 'TravelTime ~ VolK');
Rg.Multiple = fitlm(Tr, ['TravelTime ~ ' rhs]);
Rg.Congestion = fitlm(Tr, ['CongestionIndex ~ ' rhs]);
Rg.Logistic = fitglm(Tr, ['Delay30 ~ ' rhs], 'Distribution', 'binomial');

rm = @(m, y) sqrt(mean((predict(m, Te) - Te.(y)).^2));
Model = ["Simple LR: TT ~ Volume"; "Multiple LR: TT"; "Multiple LR: Congestion Index"; "Logistic: P(TT>30)"];
R2 = [Rg.Simple.Rsquared.Ordinary; Rg.Multiple.Rsquared.Ordinary; Rg.Congestion.Rsquared.Ordinary; NaN];
AdjR2 = [Rg.Simple.Rsquared.Adjusted; Rg.Multiple.Rsquared.Adjusted; Rg.Congestion.Rsquared.Adjusted; NaN];
RMSE = [rm(Rg.Simple,'TravelTime'); rm(Rg.Multiple,'TravelTime'); rm(Rg.Congestion,'CongestionIndex'); NaN];
pp = predict(Rg.Logistic, Te);
[~, ~, ~, auc] = perfcurve(Te.Delay30, pp, 1);
AUC = [NaN; NaN; NaN; auc];
Acc = [NaN; NaN; NaN; mean((pp > 0.5) == Te.Delay30)];
Rg.Metrics = table(Model, round(R2,4), round(AdjR2,4), round(RMSE,3), round(AUC,4), round(Acc,4), ...
    'VariableNames', {'Model','R2','AdjR2','TestRMSE','AUC','Accuracy'});

% plotting vectors (multiple LR on test set)
Rg.Test.Actual = Te.TravelTime;
Rg.Test.Pred   = predict(Rg.Multiple, Te);
Rg.Test.Resid  = Rg.Test.Actual - Rg.Test.Pred;
Rg.Train.Fitted = Rg.Multiple.Fitted;
Rg.Train.Resid  = Rg.Multiple.Residuals.Raw;
Rg.SimpleCoef   = Rg.Simple.Coefficients;
cf = Rg.Multiple.Coefficients;
Rg.CoefTable = table(string(cf.Properties.RowNames), cf.Estimate, cf.SE, cf.tStat, cf.pValue, ...
    'VariableNames', {'Term','Estimate','SE','tStat','pValue'});
Rg.Data = D; Rg.TestIdx = idx(ntr+1:end);
end
