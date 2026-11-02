-- ─────────────────────────────────────────────────────────────────────────────
--  Smart Home Digital Twin – Supabase setup
--  These statements were applied to project "AI Smart Home" on 2026-11-02.
--  They are ADDITIVE only: no existing table, column or row is removed.
--  Re-run safely on a fresh project that already has the Rooms / Appliance
--  tables (identical column names) to make the website work.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Row Level Security policies (RLS was enabled with no policies, so the
--    anon key could not read anything).
create policy "Public read rooms" on public."Rooms"
  for select to anon, authenticated using (true);

create policy "Public read appliances" on public."Appliance"
  for select to anon, authenticated using (true);

-- Optional: lets the dashboard toggle appliances ON/OFF. Drop this policy
-- (and set ALLOW_CONTROL=false in js/config.js) for a read-only twin.
create policy "Public update appliances" on public."Appliance"
  for update to anon, authenticated using (true) with check (true);

-- 2. Realtime: publish Appliance changes (Rooms was already published) and
--    send full row images so UPDATE events carry every column.
alter publication supabase_realtime add table public."Appliance";
alter table public."Rooms" replica identity full;
alter table public."Appliance" replica identity full;

-- 3. Two extra nullable columns used by the dashboard (no existing data changed).
alter table public."Rooms"     add column if not exists "occupied" boolean not null default false;
alter table public."Appliance" add column if not exists "energyUsage(kWh)" real null;
