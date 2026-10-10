function O = detectOutliers(x)
%DETECTOUTLIERS  IQR (Tukey 1.5) and Z-score (|z|>3) outlier detection.
x = x(:);
q = quantile(x, [0.25 0.75]);  iqr_ = q(2) - q(1);
lo = q(1) - 1.5*iqr_;  hi = q(2) + 1.5*iqr_;
O.MaskIQR = x < lo | x > hi;
z = (x - mean(x)) / std(x);
O.Z = z;
O.MaskZ = abs(z) > 3;
O.Fence = [lo hi];
Method = ["IQR (1.5 x IQR)"; "Z-score (|z| > 3)"];
Lower  = [lo; mean(x) - 3*std(x)];
Upper  = [hi; mean(x) + 3*std(x)];
Count  = [nnz(O.MaskIQR); nnz(O.MaskZ)];
Percent = round(100*Count/numel(x), 2);
O.Table = table(Method, round(Lower,2), round(Upper,2), Count, Percent, ...
    'VariableNames', {'Method','Lower','Upper','Count','Percent'});
end
