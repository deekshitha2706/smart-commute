function cm = riskColormap(n)
%RISKCOLORMAP  Green -> yellow -> red colormap (n x 3).
if nargin < 1, n = 256; end
C = scTheme();
anchors = [C.green; C.yellow; C.red];
x = linspace(0, 1, n)';
cm = [interp1([0 0.5 1], anchors(:,1), x), interp1([0 0.5 1], anchors(:,2), x), interp1([0 0.5 1], anchors(:,3), x)];
end
