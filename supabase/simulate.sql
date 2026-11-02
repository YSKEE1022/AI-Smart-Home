-- Handy statements for demonstrating realtime updates.
-- Run any of these in Supabase → SQL Editor while the website is open:
-- the 3D view, panels and totals update instantly without a refresh.

-- Turn the bedroom air-conditioner on
update public."Appliance" set "ApplianceStatus" = true  where "ApplianceID" = 'aircon02';

-- Turn it off again
update public."Appliance" set "ApplianceStatus" = false where "ApplianceID" = 'aircon02';

-- Change a room temperature / occupancy
update public."Rooms" set "roomTemp" = 24.5, "occupied" = true where "RoomsID" = 3;

-- Record measured power / energy / cost for an appliance (overrides the estimates)
update public."Appliance"
   set "electricityUsage(Watt)" = 950, "energyUsage(kWh)" = 6.8, "electricityCost(RM)" = 1.48
 where "ApplianceID" = 'aircon02';

-- Record a room total (overrides the client-side sum)
update public."Rooms" set "TotalElectricityUsage(Watt)" = 1020, "TotalElectricityCost(RM)" = 2.10 where "RoomsID" = 3;

-- Reset the values back to "unknown" so the dashboard estimates again
update public."Appliance" set "electricityUsage(Watt)" = null, "energyUsage(kWh)" = null, "electricityCost(RM)" = null where "ApplianceID" = 'aircon02';
update public."Rooms" set "TotalElectricityUsage(Watt)" = null, "TotalElectricityCost(RM)" = null where "RoomsID" = 3;
