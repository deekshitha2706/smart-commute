function app = main()
%MAIN  Launch SmartCommute.   >> main
%   Requires MATLAB R2022a or newer (uihtml events) and the
%   Statistics and Machine Learning Toolbox. Internet access is needed for map
%   tiles, place search, routing and weather; without it the app falls back to a
%   built-in gazetteer, straight-line routes and typical weather.
root = fileparts(mfilename('fullpath'));
addpath(genpath(fullfile(root, 'src')), fullfile(root, 'app'));
if verLessThan('matlab', '9.12')
    error('SmartCommute:release', 'SmartCommute needs MATLAB R2022a or newer (uihtml events).');
end
v = ver; names = {v.Name};
if ~any(strcmp(names, 'Statistics and Machine Learning Toolbox'))
    error('SmartCommute:toolbox', 'Statistics and Machine Learning Toolbox is required.');
end
app = SmartCommuteApp(root);
end
