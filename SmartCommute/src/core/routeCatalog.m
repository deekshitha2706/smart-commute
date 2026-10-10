function R = routeCatalog()
%ROUTECATALOG  Static description of the five commuter routes.
%   Columns: RouteID, Name, DistanceKm, FreeFlowKmh, Capacity (veh/h),
%            FreeFlowMin (derived).
RouteID     = categorical(["R1";"R2";"R3";"R4";"R5"]);
Name        = ["City Core Express";"Ring Road";"Highway Link";"Riverside Drive";"Metro Bypass"];
DistanceKm  = [12;20;24;16;28];
FreeFlowKmh = [45;70;85;55;90];
Capacity    = [2400;3600;4200;2800;4400];
FreeFlowMin = DistanceKm ./ FreeFlowKmh * 60;
R = table(RouteID, Name, DistanceKm, FreeFlowKmh, Capacity, FreeFlowMin);
end
