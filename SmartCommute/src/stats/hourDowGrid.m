function [M, hrs] = hourDowGrid(T)
%HOURDOWGRID  Mean travel time by departure hour (rows 5..23) and weekday (Mon..Sun).
w = weekday(T.Date); d = mod(w - 2, 7) + 1;
h = floor(T.DepartureTime);
hrs = 5:23;
M = nan(numel(hrs), 7);
for i = 1:numel(hrs)
    for j = 1:7
        m = h == hrs(i) & d == j;
        if nnz(m) > 3, M(i,j) = mean(T.TravelTime(m)); end
    end
end
end
