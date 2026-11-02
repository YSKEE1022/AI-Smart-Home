// ─────────────────────────────────────────────────────────────────────────────
//  Links 3D objects in the Blender export to database records.
//
//  Preferred method: every appliance / room object in the .blend file carries
//  custom properties `applianceId` / `roomId` (exported as glTF "extras").
//  This file is the fallback: object-name patterns → database IDs, plus the
//  camera framing preferences used when flying to rooms and appliances.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

/**
 * Object-name → RoomsID. Order matters: the first matching pattern wins.
 * Names come from the Blender outliner (e.g. "Light_Bathroom_Diffuser",
 * "Sofa_SeatCushionL", "Window_Bedroom_Glass").
 */
export const ROOM_NAME_PATTERNS = [
  [/bathroom|basin|shower|toilet|mirror|towel|bathmat|water_?heater/i, 4],
  [/bedroom|^bed_|rug_bedroom/i, 3],
  [/dining|^chair|fridge/i, 2],
  [/living|sofa|coffeetable|^book|staircase|rug_living/i, 1],
];

/** Object-name → ApplianceID (every part of an appliance shares the prefix). */
export const APPLIANCE_NAME_PATTERNS = [
  [/^AC_Living(_|$)/i, 'aircon01'],
  [/^AC_Bedroom(_|$)/i, 'aircon02'],
  [/^Fan_Living(_|$)/i, 'fan01'],
  [/^Fan_Dining(_|$)/i, 'fan02'],
  [/^Fan_Bedroom(_|$)/i, 'fan03'],
  [/^Light_Living(_|$)/i, 'light01'],
  [/^Light_Dining(_|$)/i, 'light02'],
  [/^Light_Bedroom(_|$)/i, 'light03'],
  [/^Light_Bathroom(_|$)/i, 'light04'],
  [/^TV_Living(_|$)/i, 'tele01'],
  [/^TV_Bedroom(_|$)/i, 'tele02'],
  [/^Fridge(_|$)/i, 'refrigerator01'],
  [/^Water_Heater(_|$)/i, 'waterheater01'],
];

/** ApplianceID → type (used for ON-state visuals before data arrives). */
export const APPLIANCE_TYPES = {
  aircon01: 'Aircon', aircon02: 'Aircon', fan01: 'Fan', fan02: 'Fan', fan03: 'Fan',
  light01: 'Light', light02: 'Light', light03: 'Light', light04: 'Light',
  tele01: 'Television', tele02: 'Television', refrigerator01: 'Refrigerator', waterheater01: 'Waterheater',
};

/**
 * Shared structure (walls, slabs, partitions) belongs to no single room, so a
 * click on it is resolved from the 3D hit point instead:
 * ground floor y < 2.85, first floor above; x < partition → left rooms.
 */
export function roomFromPoint(p) {
  if (!p) return null;
  if (p.y < -0.2 || p.y > 5.6) return null;
  const upper = p.y >= 2.85;
  const splitX = upper ? 0.9 : 1.15;
  if (upper) return p.x < splitX ? 3 : 4;
  return p.x < splitX ? 1 : 2;
}

export function resolveRoomByName(name = '') {
  for (const [re, id] of ROOM_NAME_PATTERNS) if (re.test(name)) return id;
  return null;
}
export function resolveApplianceByName(name = '') {
  for (const [re, id] of APPLIANCE_NAME_PATTERNS) if (re.test(name)) return id;
  return null;
}

/** Camera framing preferences. frontDir = direction from the house towards the open (cut-away) side. */
export const VIEW = {
  frontDir: new THREE.Vector3(0, 0, 1),
  elevation: THREE.MathUtils.degToRad(12),
  homeElevation: THREE.MathUtils.degToRad(14),
  roomElevation: THREE.MathUtils.degToRad(8),
  roomPadding: 1.0,
  applianceElevation: THREE.MathUtils.degToRad(6),
  appliancePadding: 2.4,
  applianceMinDist: 1.6,
  // Per-appliance overrides: { dir:[x,y,z], elevation:rad, padding:number }
  applianceOverrides: {
    // ceiling fans / lights: look slightly up at them from in front
    fan01: { elevation: -0.25, padding: 3.0 }, fan02: { elevation: -0.25, padding: 3.0 }, fan03: { elevation: -0.25, padding: 3.0 },
    light01: { elevation: -0.3, padding: 4 }, light02: { elevation: -0.3, padding: 4 }, light03: { elevation: -0.3, padding: 4 }, light04: { elevation: -0.3, padding: 4 },
    aircon01: { elevation: -0.15 }, aircon02: { elevation: -0.15 },
    // water heater sits high on the right-hand wall: view from front-left
    waterheater01: { dir: [-0.35, 0, 1], elevation: -0.1 },
    refrigerator01: { dir: [-0.25, 0, 1] },
  },
};
