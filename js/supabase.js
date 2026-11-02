// ─────────────────────────────────────────────────────────────────────────────
//  Supabase data layer – initial load, realtime subscription, updates.
//  Uses the official @supabase/supabase-js v2 client (see import map in
//  index.html).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 20 } },
});

/** Load every room and appliance once at start-up. */
export async function fetchAll() {
  const [rooms, appliances] = await Promise.all([
    supabase.from('Rooms').select('*').order('RoomsID'),
    supabase.from('Appliance').select('*').order('ApplianceID'),
  ]);
  if (rooms.error) throw rooms.error;
  if (appliances.error) throw appliances.error;
  return { rooms: rooms.data, appliances: appliances.data };
}

/**
 * Subscribe to Postgres changes on both tables.
 * `onChange({ table, type, record, old })` fires for INSERT / UPDATE / DELETE.
 * `onStatus(status)` reports the channel state (SUBSCRIBED, CHANNEL_ERROR, …).
 */
export function subscribeRealtime(onChange, onStatus) {
  const channel = supabase
    .channel('digital-twin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'Rooms' }, (p) =>
      onChange({ table: 'Rooms', type: p.eventType, record: p.new, old: p.old }),
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'Appliance' }, (p) =>
      onChange({ table: 'Appliance', type: p.eventType, record: p.new, old: p.old }),
    )
    .subscribe((status, err) => onStatus?.(status, err));
  return channel;
}

/** Toggle an appliance ON / OFF (requires the update policy on Appliance). */
export async function setApplianceStatus(applianceId, status) {
  const { error } = await supabase
    .from('Appliance')
    .update({ ApplianceStatus: status })
    .eq('ApplianceID', applianceId);
  if (error) throw error;
}
