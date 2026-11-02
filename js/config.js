// ─────────────────────────────────────────────────────────────────────────────
//  Smart Home Digital Twin – configuration
//  Edit this file to point the website at your own Supabase project.
// ─────────────────────────────────────────────────────────────────────────────

export const SUPABASE_URL = 'https://rtghrwppjphcjceokmyz.supabase.co';

// Public (anon) key – safe to ship in the browser. Row access is controlled by
// the Row Level Security policies on the Rooms / Appliance tables.
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0Z2hyd3BwanBoY2pjZW9rbXl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0ODMzODgsImV4cCI6MjEwOTA1OTM4OH0.IQ1YcL-wjJ9nFyW5wgs_k-8W2Inlfp6Cw6SXy57tfz8';

// Path of the exported Blender model (glTF 2.0 binary).
export const MODEL_URL = './models/smart_home.glb';

// Malaysian TNB domestic tariff (RM per kWh). Used only when the database does
// not already contain a cost value for an appliance.
export const TARIFF_RM_PER_KWH = 0.218;

// Typical daily running hours per appliance type. Used to estimate kWh / cost
// when the database has no energy value for that appliance.
export const DEFAULT_HOURS_PER_DAY = {
  Aircon: 8,
  Fan: 10,
  Light: 6,
  Television: 5,
  Refrigerator: 24,
  Waterheater: 1,
  default: 4,
};

// Typical rated power per appliance type (W). Used only when the database has
// no wattage recorded for an appliance.
export const DEFAULT_WATTS = {
  Aircon: 1000,
  Fan: 60,
  Light: 12,
  Television: 90,
  Refrigerator: 150,
  Waterheater: 3000,
  default: 50,
};

// Allow the dashboard to toggle appliances (writes ApplianceStatus back to
// Supabase). Set to false for a read-only twin.
export const ALLOW_CONTROL = true;
