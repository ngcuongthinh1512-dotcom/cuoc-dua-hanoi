// CETIQLO store plan (room-local metres: x east / across, z south / along, +z = the door end, y 0 = floor 1). Pure data
// shared by catalog.ts (shelf poses) and client/src/cetiqlo/storeScene.ts (the fixtures drawn + their colliders).
import type { Display, ShapeId, ZoneId } from './types.ts';

export const STORE = {
  halfW: 12,            // x ∈ [−12, 12]
  back: -17,            // z of the back wall
  lobbyZ: 10,           // glass partition lobby | sales floor
  doorZ: 16,            // the storefront / the room door end (roomFrame doorZ)
  floor2Y: 3.84,        // floor-to-floor
  slab: 0.34,           // floor 2 slab thickness (ceiling of floor 1 = floor2Y − slab)
  ceiling: 3.5,         // clear height of floor 2 (roof underside = floor2Y + ceiling)
  floor2Edge: 1.8,      // floor 2 covers z ∈ [back, floor2Edge]; z > floor2Edge is the double-height atrium
  stair: { x0: 8.5, x1: 11.5, zBottom: 9.0, rise: 0.16, tread: 0.3, steps: 24 }, // climbs toward −z, lands at floor2Edge
  checkout: { x: -4.5, z: 7.5, half: 1.5 },
  pedestal: { x: 0, z: 5.2, r: 0.9 },
  startSpots: [{ x: -2.4, z: 9.0, yaw: 0 }, { x: 2.4, z: 9.0, yaw: 0 }], // body yaw 0 = facing −z, into the store
  lobbyDoor: { x: 0, z: 10, halfW: 1.3 },
  displayMannequins: [{ x: -4.5, z: 13, yaw: 0.5 }, { x: 4.5, z: 13, yaw: -0.5 }],
  /** Static dressed figures in the sales zones (outfits picked by storeScene from that floor's catalog). */
  zoneMannequins: [{ x: 0, z: -12, yaw: 0.3, floor: 1 }, { x: 1.5, z: -9.5, yaw: -0.4, floor: 2 }],
} as const;
export const STAIR_RUN = STORE.stair.steps * STORE.stair.tread; // 7.2 m
export const STAIR_TOP_Z = STORE.stair.zBottom - STAIR_RUN; // 1.8 = floor2Edge

/** Shape heights (m) — the geometry in items.ts is centred, so a shelf pose = tier y + h / 2; hanging = rail − h / 2. */
export const SHAPE_H: Record<ShapeId, number> = { // real size M lengths (sizes.ts GARMENT_SIZES): hung = full length on the hanger
  tee: 0.70, 'tee-v': 0.70, 'tee-long': 0.70, tank: 0.66, crop: 0.46, 'tee-oversized': 0.78, polo: 0.70, 'polo-long': 0.70,
  shirt: 0.74, 'shirt-short': 0.72, 'shirt-band': 0.74, 'shirt-camp': 0.70, blouse: 0.64,
  hoodie: 0.70, 'hoodie-zip': 0.70, sweatshirt: 0.68, 'quarter-zip': 0.68,
  sweater: 0.66, 'knit-v': 0.66, turtleneck: 0.74, mockneck: 0.70, cardigan: 0.70, 'knit-vest': 0.62,
  parka: 0.90, 'uv-zip': 0.72, bomber: 0.64, fleece: 0.70, down: 0.68, 'down-long': 1.00, 'puffer-vest': 0.64, blazer: 0.76, trench: 1.05, coach: 0.68, 'denim-jacket': 0.62, 'wool-coat': 1.08, padded: 0.95,
  tote: 0.58, 'round-bag': 0.30, backpack: 0.45, crossbody: 0.28, cap: 0.14, 'bucket-hat': 0.17, beanie: 0.21, scarf: 0.14, sunglasses: 0.06, umbrella: 0.30,
  pants: 0.97, chinos: 1.05, wide: 1.07, straight: 1.07, cargo: 1.07, jogger: 1.05, sweatpants: 1.05, bootcut: 1.08, bermuda: 0.72, shorts: 0.47, cycling: 0.49,
  'jeans-wide': 1.08, 'jeans-straight': 1.08, 'jeans-baggy': 1.10, 'jeans-tapered': 1.06, 'shorts-chino': 0.52,
  'dress-shirt': 1.0, 'dress-aline': 0.95, 'dress-maxi': 1.3, 'dress-slip': 1.1,
  'skirt-pleated': 0.7, 'skirt-aline': 0.55, 'skirt-flare': 0.62, 'skirt-mini': 0.4, 'skirt-tennis': 0.38, 'skirt-denim': 0.5, 'skirt-wrap': 0.7, 'skirt-midi': 0.7,
  bra: 0.14, briefs: 0.06, bratop: 0.40, pyjama: 0.9, 'lounge-pants': 1.06,
  sneaker: 0.11, loafer: 0.09, sandal: 0.05, slipper: 0.08, boot: 0.25, 'socks-ankle': 0.1, 'socks-crew': 0.22,
  'fold-top': 0.21, 'fold-bottom': 0.21, // a stack of three folded pieces (GARMENT_SIZES.store.foldedH × 3)
};

export const RAIL_Y = 1.65; // hanging rail height; garments hang from it
export const TABLE_Y = 0.85; // table top (GARMENT_SIZES.store.table)

export interface Fixture {
  zone: ZoneId;
  /** rail = hanging; table = folded slabs on top; shelf = standing items on tiers; bay = wall unit of folded stacks on tiers. */
  kind: 'rail' | 'table' | 'shelf' | 'bay';
  /** Centre of the fixture (floor-level y is implied by its floor); `yaw` = the items' facing (rotation.y; 0 = facing +z). */
  x: number; z: number; yaw: number;
  /** Length along the fixture's local x. */
  len: number;
  /** Shelf / bay tiers (y above the floor); tables / rails ignore it. */
  tiers?: number[];
  /** Slot pitch along local x. */
  pitch: number;
  /** A free-standing island rail with garments on both sides (the back side faces yaw + π). */
  double?: boolean;
}
// facing: 0 = +z (toward the entrance), ±π/2 = ±x, π = −z
const E = -Math.PI / 2, W = Math.PI / 2;
const T4 = [0.45, 0.85, 1.25, 1.65];
/** Fixtures per floor, in catalog fill order within each zone. Wall fixtures sit 0.3 m off the wall. */
export const FIXTURES: Record<1 | 2, Fixture[]> = {
  1: [
    { zone: 'tees', kind: 'bay', x: -11.7, z: 6, yaw: W, len: 5, tiers: T4, pitch: 0.36 },
    { zone: 'tees', kind: 'table', x: -8.5, z: 6.8, yaw: 0, len: 1.8, pitch: 0.36 },
    { zone: 'tees', kind: 'table', x: -8.5, z: 3.6, yaw: 0, len: 1.8, pitch: 0.36 },
    { zone: 'polo', kind: 'rail', x: -7, z: -1, yaw: 0, len: 5, pitch: 0.45, double: true },
    { zone: 'shirts', kind: 'rail', x: -11.7, z: -2.5, yaw: W, len: 8, pitch: 0.45 },
    { zone: 'shirts', kind: 'rail', x: -7, z: -5, yaw: 0, len: 6, pitch: 0.45, double: true },
    { zone: 'shirts', kind: 'rail', x: -1.5, z: -5, yaw: 0, len: 3, pitch: 0.45, double: true },
    { zone: 'sweats', kind: 'rail', x: -11.7, z: -9.5, yaw: W, len: 5, pitch: 0.45 },
    { zone: 'sweats', kind: 'rail', x: -7, z: -9, yaw: 0, len: 4, pitch: 0.45, double: true },
    { zone: 'knit', kind: 'bay', x: 6.5, z: -16.7, yaw: 0, len: 5, tiers: T4, pitch: 0.4 },
    { zone: 'knit', kind: 'table', x: -7.5, z: -13, yaw: 0, len: 1.8, pitch: 0.36 },
    { zone: 'uv', kind: 'rail', x: 11.7, z: -1.5, yaw: E, len: 4, pitch: 0.45 },
    { zone: 'uv', kind: 'rail', x: 3.0, z: -1, yaw: 0, len: 3, pitch: 0.45, double: true },
    { zone: 'fleece', kind: 'rail', x: 11.7, z: -6, yaw: E, len: 4, pitch: 0.45 },
    { zone: 'fleece', kind: 'rail', x: 8.0, z: -1, yaw: 0, len: 3, pitch: 0.45, double: true },
    { zone: 'down', kind: 'rail', x: 11.7, z: -10.5, yaw: E, len: 4, pitch: 0.45 },
    { zone: 'down', kind: 'rail', x: 3.0, z: -5, yaw: 0, len: 3, pitch: 0.45, double: true },
    { zone: 'padded', kind: 'rail', x: 11.7, z: -14.75, yaw: E, len: 3.5, pitch: 0.45 },
    { zone: 'padded', kind: 'rail', x: 8.0, z: -5, yaw: 0, len: 3, pitch: 0.45, double: true },
    { zone: 'fashion-outer', kind: 'rail', x: 3.0, z: -9, yaw: 0, len: 4, pitch: 0.45, double: true },
    { zone: 'fashion-outer', kind: 'rail', x: 8.0, z: -9, yaw: 0, len: 4, pitch: 0.45, double: true },
    { zone: 'fashion-outer', kind: 'rail', x: 5.5, z: -13, yaw: 0, len: 5, pitch: 0.45, double: true },
    { zone: 'bags', kind: 'shelf', x: -9, z: -16.7, yaw: 0, len: 5, tiers: [0.5, 0.95, 1.4], pitch: 0.5 },
    { zone: 'hats-scarves', kind: 'shelf', x: -3.5, z: -16.7, yaw: 0, len: 5, tiers: [0.55, 1.0, 1.45], pitch: 0.4 },
    { zone: 'sunglasses-umbrella', kind: 'shelf', x: 1.5, z: -16.7, yaw: 0, len: 4, tiers: [0.9, 1.35], pitch: 0.4 },
  ],
  2: [
    { zone: 'pants', kind: 'rail', x: -11.7, z: -2.5, yaw: W, len: 7, pitch: 0.45 },
    { zone: 'pants', kind: 'rail', x: -7, z: -1, yaw: 0, len: 5, pitch: 0.45, double: true },
    { zone: 'jeans', kind: 'bay', x: -9.5, z: -16.7, yaw: 0, len: 4, tiers: T4, pitch: 0.4 },
    { zone: 'jeans', kind: 'table', x: -7, z: -12, yaw: 0, len: 1.8, pitch: 0.36 },
    { zone: 'joggers', kind: 'rail', x: -1.5, z: -1, yaw: 0, len: 3.5, pitch: 0.45, double: true },
    { zone: 'shorts', kind: 'table', x: -7, z: -5, yaw: 0, len: 1.8, pitch: 0.36 },
    { zone: 'shorts', kind: 'table', x: -4, z: -5, yaw: 0, len: 1.8, pitch: 0.36 },
    { zone: 'shorts', kind: 'table', x: -7, z: -8, yaw: 0, len: 1.8, pitch: 0.36 },
    { zone: 'dresses', kind: 'rail', x: -4, z: -11, yaw: 0, len: 5, pitch: 0.45, double: true },
    { zone: 'skirts', kind: 'rail', x: -11.7, z: -10, yaw: W, len: 6, pitch: 0.45 },
    { zone: 'skirts', kind: 'rail', x: -4, z: -14.5, yaw: 0, len: 5, pitch: 0.45, double: true },
    { zone: 'bras-undies', kind: 'shelf', x: 11.7, z: -3, yaw: E, len: 4, tiers: [0.7, 1.1, 1.5], pitch: 0.35 },
    { zone: 'homewear', kind: 'rail', x: 6, z: -5, yaw: 0, len: 4, pitch: 0.45, double: true },
    { zone: 'homewear', kind: 'rail', x: 11.7, z: -8.25, yaw: E, len: 3.5, pitch: 0.45 },
    { zone: 'footwear-socks', kind: 'shelf', x: 1, z: -16.7, yaw: 0, len: 12, tiers: [0.4, 0.85, 1.3], pitch: 0.5 },
  ],
};

export interface Slot { x: number; y: number; z: number; yaw: number; display: Display }
/** The item centres a fixture offers, in fill order (tier by tier, left to right as seen from the front), for a shape of height `h`.
 *  Hanging items are staggered 1 cm toward the viewer so overlapping fronts never z-fight. */
export function fixtureSlots(f: Fixture, floorY: number, h: number): Slot[] {
  const out: Slot[] = [];
  const s = Math.sin(f.yaw), c = Math.cos(f.yaw);
  const place = (u: number, v: number, y: number, display: Display, yaw = f.yaw) => out.push({ x: f.x + u * c + v * s, y, z: f.z - u * s + v * c, yaw, display });
  const n = Math.floor(f.len / f.pitch + 1e-6), u0 = -((n - 1) * f.pitch) / 2;
  if (f.kind === 'rail') {
    const y = floorY + RAIL_Y - 0.05 - h / 2;
    for (let i = 0; i < n; i++) place(u0 + i * f.pitch, (f.double ? 0.22 : 0) + 0.01 * (i % 3), y, 'hang');
    if (f.double) for (let i = 0; i < n; i++) place(u0 + i * f.pitch, -0.22 - 0.01 * (i % 3), y, 'hang', f.yaw + Math.PI);
  } else if (f.kind === 'table') for (const v of [-0.22, 0.22]) for (let i = 0; i < n; i++) place(u0 + i * f.pitch, v, floorY + TABLE_Y + h / 2, 'fold');
  else for (const t of f.tiers!) for (let i = 0; i < n; i++) place(u0 + i * f.pitch, 0, floorY + t + h / 2, f.kind === 'bay' ? 'fold' : 'stand');
  return out;
}
