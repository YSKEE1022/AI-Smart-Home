// ─────────────────────────────────────────────────────────────────────────────
//  In-memory state + derived metrics. The database rows are kept exactly as
//  they are in Supabase; derived values (estimates) are computed on the fly.
// ─────────────────────────────────────────────────────────────────────────────
import { TARIFF_RM_PER_KWH, DEFAULT_HOURS_PER_DAY, DEFAULT_WATTS } from './config.js';

export const ROOM_LABELS = {
  livingRoom: 'Living Room',
  diningRoom: 'Dining Room',
  bedRoom: 'Bedroom',
  bathRoom: 'Bathroom',
};

export const ROOM_ICONS = {
  livingRoom: '🛋️',
  diningRoom: '🍽️',
  bedRoom: '🛏️',
  bathRoom: '🚿',
};

export const TYPE_ICONS = {
  Aircon: '❄️',
  Fan: '🌀',
  Light: '💡',
  Television: '📺',
  Refrigerator: '🧊',
  Waterheater: '🔥',
};

const listeners = new Set();

export const state = {
  rooms: new Map(),       // RoomsID  -> row
  appliances: new Map(),  // ApplianceID -> row
  connection: 'connecting',
  lastUpdate: null,
};

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(evt) {
  for (const fn of listeners) fn(evt);
}

export function hydrate({ rooms, appliances }) {
  state.rooms.clear();
  state.appliances.clear();
  rooms.forEach((r) => state.rooms.set(r.RoomsID, r));
  appliances.forEach((a) => state.appliances.set(a.ApplianceID, a));
  state.lastUpdate = new Date();
  emit({ kind: 'hydrate' });
}

export function applyChange({ table, type, record, old }) {
  const map = table === 'Rooms' ? state.rooms : state.appliances;
  const key = table === 'Rooms' ? 'RoomsID' : 'ApplianceID';
  if (type === 'DELETE') {
    map.delete(old?.[key]);
  } else {
    const prev = map.get(record[key]) || {};
    map.set(record[key], { ...prev, ...record });
  }
  state.lastUpdate = new Date();
  emit({ kind: 'change', table, type, id: record?.[key] ?? old?.[key], record, old });
}

export function setConnection(status) {
  state.connection = status;
  emit({ kind: 'connection', status });
}

// ── Derived metrics ──────────────────────────────────────────────────────────
export function roomLabel(room) {
  return ROOM_LABELS[room?.roomName] || room?.roomName || `Room ${room?.RoomsID}`;
}

export function applianceLabel(a) {
  const room = state.rooms.get(a.RoomsID);
  return `${roomLabel(room)} ${a.ApplianceType}`;
}

export function appliancesInRoom(roomId) {
  return [...state.appliances.values()].filter((a) => a.RoomsID === roomId);
}

/** Power draw right now (W). */
export function applianceWatts(a) {
  const w = a['electricityUsage(Watt)'];
  const rated = w ?? DEFAULT_WATTS[a.ApplianceType] ?? DEFAULT_WATTS.default;
  return { rated, live: a.ApplianceStatus ? rated : 0, fromDb: w != null };
}

/** Daily energy (kWh) and cost (RM) – from DB when present, otherwise estimated. */
export function applianceEnergy(a) {
  const { rated } = applianceWatts(a);
  const hours = DEFAULT_HOURS_PER_DAY[a.ApplianceType] ?? DEFAULT_HOURS_PER_DAY.default;
  const dbKwh = a['energyUsage(kWh)'];
  const dbCost = a['electricityCost(RM)'];
  const kwh = dbKwh ?? (a.ApplianceStatus ? (rated * hours) / 1000 : 0);
  const cost = dbCost ?? kwh * TARIFF_RM_PER_KWH;
  return { kwh, cost, hours, kwhFromDb: dbKwh != null, costFromDb: dbCost != null };
}

export function roomMetrics(roomId) {
  const room = state.rooms.get(roomId);
  const list = appliancesInRoom(roomId);
  const active = list.filter((a) => a.ApplianceStatus);
  const sumW = active.reduce((s, a) => s + applianceWatts(a).live, 0);
  const sumKwh = list.reduce((s, a) => s + applianceEnergy(a).kwh, 0);
  const sumCost = list.reduce((s, a) => s + applianceEnergy(a).cost, 0);
  const dbW = room?.['TotalElectricityUsage(Watt)'];
  const dbCost = room?.['TotalElectricityCost(RM)'];
  return {
    room,
    appliances: list,
    active,
    watts: dbW ?? sumW,
    wattsFromDb: dbW != null,
    kwh: sumKwh,
    cost: dbCost ?? sumCost,
    costFromDb: dbCost != null,
    occupied: !!room?.occupied,
  };
}

export function homeMetrics() {
  const rooms = [...state.rooms.keys()].map(roomMetrics);
  return {
    watts: rooms.reduce((s, r) => s + r.watts, 0),
    kwh: rooms.reduce((s, r) => s + r.kwh, 0),
    cost: rooms.reduce((s, r) => s + r.cost, 0),
    active: rooms.reduce((s, r) => s + r.active.length, 0),
    total: state.appliances.size,
    occupiedRooms: rooms.filter((r) => r.occupied).length,
    rooms,
  };
}

export const fmt = {
  w: (v) => `${Math.round(v).toLocaleString()} W`,
  kwh: (v) => `${v.toFixed(2)} kWh`,
  rm: (v) => `RM ${v.toFixed(2)}`,
  temp: (v) => (v == null ? '—' : `${Number(v).toFixed(1)} °C`),
};
