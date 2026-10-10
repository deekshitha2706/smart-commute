function [score, cls, rgb] = computeRiskScore(pLate, p45, pHeavy, cv)
%COMPUTERISKSCORE  Composite 0-100 risk index.
%   score = 100*(0.35 P(late) + 0.25 P(heavy) + 0.20 P(TT>45) + 0.20 min(1, CV/0.5))
%   Low < 25 <= Moderate < 50 <= High
score = 100*(0.35*pLate + 0.25*pHeavy + 0.20*p45 + 0.20*min(1, cv/0.5));
C = scTheme();
if score < 25
    cls = "Low";      rgb = C.green;
elseif score < 50
    cls = "Moderate"; rgb = C.yellow;
else
    cls = "High";     rgb = C.red;
end
end
