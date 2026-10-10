classdef SmartCommuteApp < handle
%SMARTCOMMUTEAPP  Native MATLAB window that hosts the SmartCommute map interface.
%   The whole interface (map, floating cards, charts, animation) is the web page
%   app/web/index.html shown in ONE uihtml component. MATLAB is the scientific
%   engine behind it:
%
%       web page  --'analyze' {free, distKm, date, hour, weather, n, tol ...}-->  MATLAB
%       MATLAB    --'result'  {id, result}-->  web page      (analyzeRoute.m)
%       web page  --'report'  {kind}-->  MATLAB              (generateReport.m, PDF)
%
%   Needs MATLAB R2022a+ (uihtml events: sendEventToMATLAB / sendEventToHTMLSource).

    properties
        UIFigure
        Html
        Root
        T                       % historical trips (12,000+ records)
        M                       % ratioModel(T): congestion-ratio model + regression
        Last = []               % legacy MC / Rec / Scenario of the latest analysis (for PDFs)
        Global = []             % lazily computed dataset-wide statistics (for PDFs)
    end

    methods
        function app = SmartCommuteApp(root)
            if nargin < 1, root = pwd; end
            app.Root = root;
            f = uifigure('Name', 'SmartCommute', 'Color', [0.043 0.059 0.090], ...
                'Position', [40 40 1500 900], 'Visible', 'off');
            app.UIFigure = f;
            try, f.WindowState = 'maximized'; catch, end %#ok<NOCOM>
            f.Visible = 'on';
            dlg = uiprogressdlg(f, 'Title', 'SmartCommute', 'Indeterminate', 'on', ...
                'Message', 'Loading historical traffic data and fitting the congestion model...');
            try
                app.T = loadOrCreateData(fullfile(root, 'data'), false);
                app.M = ratioModel(app.T);
            catch ME
                close(dlg); delete(f); rethrow(ME);
            end
            close(dlg);

            g = uigridlayout(f, [1 1], 'Padding', 0, 'BackgroundColor', f.Color);
            h = uihtml(g);
            h.HTMLSource = fullfile(root, 'app', 'web', 'index.html');
            h.HTMLEventReceivedFcn = @(~, e) app.onEvent(e);
            app.Html = h;
        end

        function delete(app)
            if ~isempty(app.UIFigure) && isvalid(app.UIFigure), delete(app.UIFigure); end
        end
    end

    methods (Access = private)
        function onEvent(app, e)
            name = string(e.HTMLEventName);
            req = struct();
            d = e.HTMLEventData;
            if (ischar(d) || isstring(d)) && strlength(string(d)) > 0
                try, req = jsondecode(char(d)); catch, req = struct(); end
            elseif isstruct(d)
                req = d;
            end
            switch name
                case "ready",  app.send('engine', struct('records', height(app.T), 'engine', 'matlab'));
                case "analyze", app.analyze(req);
                case "report",  app.report(req);
            end
        end

        function send(app, name, payload)
            sendEventToHTMLSource(app.Html, char(name), jsonencode(payload));
            drawnow limitrate;
        end

        function toast(app, msg, type)
            if nargin < 3, type = ''; end
            app.send('toast', struct('msg', msg, 'type', type));
        end

        % ---------------------------------------------------------------
        function analyze(app, req)
            id = 0;
            if isfield(req, 'id'), id = req.id; end
            try
                [out, legacy] = analyzeRoute(app.T, req, app.M);
                % comparison runs for alternative routes (req.alt) must not replace the analysis the PDF reports describe
                if ~(isfield(req, 'alt') && ~isempty(req.alt) && req.alt), app.Last = legacy; end
                app.send('result', struct('id', id, 'result', out));
            catch ME
                app.send('result', struct('id', id, 'error', ['MATLAB engine: ' ME.message]));
            end
        end

        % ---------------------------------------------------------------
        function report(app, req)
            kind = 'sim';
            if isfield(req, 'kind'), kind = char(req.kind); end
            try
                ctx = app.reportContext(kind);
                outDir = fullfile(app.Root, 'reports');
                if ~exist(outDir, 'dir'), mkdir(outDir); end
                file = fullfile(outDir, sprintf('SmartCommute_%s_%s.pdf', kind, datestr(now, 'yyyymmdd_HHMMSS')));
                generateReport(kind, ctx, file);
                app.toast(['Report saved: ' file], 'ok');
                try
                    if ispc, winopen(outDir); elseif ismac, system(['open "' outDir '"']); end
                catch, end
            catch ME
                app.toast(['Report failed: ' ME.message], 'err');
            end
        end

        function ctx = reportContext(app, kind)
            needsTrip = any(strcmp(kind, {'sim', 'departure'}));
            if needsTrip && isempty(app.Last)
                error('Analyze a route first, then export the %s report.', kind);
            end
            if isempty(app.Global)
                app.toast('Computing dataset-wide statistics for the report...', '');
                G.Fit  = fitDistributions(app.T.TravelTime);
                G.Prob = probabilityModule(app.T);
                G.Inf  = inferenceTests(app.T);
                G.Corr = correlationAnalysis(app.T);
                G.Reg  = regressionAnalysis(app.T);
                app.Global = G;
            end
            G = app.Global;
            ctx = struct('T', app.T, 'Fit', G.Fit, 'Prob', G.Prob, 'Inf', G.Inf, 'Corr', G.Corr, 'Reg', G.Reg, ...
                'MC', [], 'Rec', [], 'Scenario', []);
            if ~isempty(app.Last)
                ctx.MC = app.Last.MC; ctx.Rec = app.Last.Rec; ctx.Scenario = app.Last.Scenario;
            end
        end
    end
end
