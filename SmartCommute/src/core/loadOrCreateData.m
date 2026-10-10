function T = loadOrCreateData(folder, force, n, seed)
%LOADORCREATEDATA  Load cached dataset (data/traffic_data.mat) or generate it.
if nargin < 2, force = false; end
if nargin < 3, n = 12000; end
if nargin < 4, seed = 2026; end
if ~exist(folder, 'dir'), mkdir(folder); end
f = fullfile(folder, 'traffic_data.mat');
if ~force && exist(f, 'file')
    S = load(f, 'T'); T = S.T; return
end
T = generateTrafficData(n, seed);
save(f, 'T');
writetable(T, fullfile(folder, 'traffic_data.csv'));
end
