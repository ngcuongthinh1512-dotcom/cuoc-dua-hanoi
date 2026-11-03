// CETIQLO store plan (room-local metres: x east / across, z south / along, +z = the door end, y 0 = floor 1). Pure data
// shared by catalog.ts (shelf poses) and client/src/cetiqlo/storeScene.ts (the fixtures drawn + their colliders).
import type { Display, ShapeId, ZoneId } from './types.ts';

export const STORE = {
  halfW: 16,            // x ∈ [−16, 16] (round 3: everything hangs with ≥ 0.55 m pitch → a 32 × 46 m store; owner 2026-11-03: keep this footprint)
  back: -30,            // z of the back wall
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
  zoneMannequins: [{ x: -5, z: 3.5, yaw: 0.3, floor: 1 }, { x: 4.75, z: 0.3, yaw: -0.4, floor: 2 }, { x: 9.5, z: -23, yaw: 0.4, floor: 1 }, { x: -9.5, z: -26, yaw: -0.5, floor: 2 }],
  /** Floor 2 fitting cabins (decor + colliders) along the west wall behind the pants rail. */
  fittingRooms: { x: -15.25, z: [-19, -20.4, -21.8], w: 1.3, d: 1.4, h: 2.3 },
  /** Decor (round 5): white display plinths (a dressed figure on the first of each floor), planters, standing mirrors. */
  decor: {
    plinths: [{ x: 9.5, z: -23, floor: 1 }, { x: -9.5, z: -26, floor: 1 }, { x: 9.5, z: -26, floor: 1 }, { x: -9.5, z: -26, floor: 2 }, { x: 0, z: -26, floor: 2 }, { x: 9.5, z: -26, floor: 2 }, { x: -9.5, z: -23, floor: 2 }, { x: 9.5, z: -20, floor: 2 }, { x: 9.5, z: -23, floor: 2 }],
    planters: [{ x: -14.5, z: 8.5, floor: 1 }, { x: 14.5, z: 7.5, floor: 1 }, { x: -13.5, z: -29, floor: 1 }, { x: 13.5, z: -29, floor: 1 }, { x: -14.8, z: 0.5, floor: 2 }, { x: 14.8, z: -29, floor: 2 }, { x: -14.8, z: -29, floor: 2 }, { x: 14.8, z: -10.5, floor: 2 }],
    mirrors: [{ x: 15.7, z: -29.2, yaw: Math.PI / 2, floor: 1 }, { x: -15.7, z: 5.5, yaw: -Math.PI / 2, floor: 1 }, { x: 15.7, z: -18.5, yaw: Math.PI / 2, floor: 2 }, { x: 15.7, z: -28, yaw: Math.PI / 2, floor: 2 }, { x: -15.7, z: -27, yaw: -Math.PI / 2, floor: 1 }],
  },
} as const;
export const STAIR_RUN = STORE.stair.steps * STORE.stair.tread; // 7.2 m
export const STAIR_TOP_Z = STORE.stair.zBottom - STAIR_RUN; // 1.8 = floor2Edge

/** Shape heights (m) — the geometry in items.ts is centred, so a shelf pose = tier y + h / 2; hanging = rail − h / 2. */
export const SHAPE_H: Record<ShapeId, number> = { // real size M lengths (sizes.ts GARMENT_SIZES): hung = full length on the hanger
  tee: 0.70, 'tee-v': 0.70, 'tee-long': 0.70, tank: 0.66, crop: 0.46, 'tee-oversized': 0.78, 'tee-raglan': 0.70, 'tee-pocket': 0.70, 'tee-henley': 0.72, polo: 0.70, 'polo-long': 0.70,
  shirt: 0.74, 'shirt-short': 0.72, 'shirt-band': 0.74, 'shirt-camp': 0.70, blouse: 0.64,
  hoodie: 0.70, 'hoodie-zip': 0.70, sweatshirt: 0.68, 'quarter-zip': 0.68,
  sweater: 0.66, 'sweater-chunky': 0.70, 'knit-v': 0.66, turtleneck: 0.74, mockneck: 0.70, cardigan: 0.70, 'knit-vest': 0.62, 'knit-polo': 0.68, 'knit-halfzip': 0.68,
  parka: 0.90, 'uv-zip': 0.72, bomber: 0.64, fleece: 0.70, 'fleece-pullover': 0.70, down: 0.68, 'down-long': 1.00, 'puffer-vest': 0.64, blazer: 0.76, trench: 1.05, coach: 0.68, 'denim-jacket': 0.62, 'wool-coat': 1.08, padded: 0.95, anorak: 0.72, varsity: 0.64, quilted: 0.72,
  tote: 0.58, 'round-bag': 0.30, backpack: 0.45, crossbody: 0.28, duffel: 0.34, 'waist-bag': 0.16, 'laptop-bag': 0.36, 'shoulder-bag': 0.40,
  cap: 0.14, 'bucket-hat': 0.17, beanie: 0.21, beret: 0.08, visor: 0.09, bandana: 0.26, scarf: 0.14, sunglasses: 0.06, umbrella: 0.30, 'umbrella-long': 0.85,
  belt: 0.22, wallet: 0.1, cardholder: 0.08, watch: 0.12, gloves: 0.26,
  pants: 0.97, chinos: 1.05, wide: 1.07, straight: 1.07, cargo: 1.07, jogger: 1.05, sweatpants: 1.05, bootcut: 1.08, bermuda: 0.72, shorts: 0.47, cycling: 0.49,
  'jeans-wide': 1.08, 'jeans-straight': 1.08, 'jeans-baggy': 1.10, 'jeans-tapered': 1.06, 'shorts-chino': 0.52, 'jogger-cargo': 1.05, 'track-pants': 1.06, 'shorts-denim': 0.46, 'shorts-cargo': 0.6,
  'dress-shirt': 1.0, 'dress-aline': 0.95, 'dress-maxi': 1.3, 'dress-slip': 1.1, 'dress-wrap': 1.05, 'dress-tee': 0.9,
  'skirt-pleated': 0.7, 'skirt-aline': 0.55, 'skirt-flare': 0.62, 'skirt-mini': 0.4, 'skirt-tennis': 0.38, 'skirt-denim': 0.5, 'skirt-wrap': 0.7, 'skirt-midi': 0.7, 'skirt-pencil': 0.6, 'skirt-cargo': 0.5,
  bra: 0.14, briefs: 0.06, bratop: 0.40, pyjama: 0.9, 'lounge-pants': 1.06, robe: 1.1,
  sneaker: 0.11, loafer: 0.09, sandal: 0.05, slipper: 0.08, boot: 0.25, 'running-shoe': 0.12, 'slip-on': 0.08, 'sneaker-hi': 0.16, 'boot-chelsea': 0.18, 'socks-ankle': 0.1, 'socks-crew': 0.22,
  'fold-top': 0.21, 'fold-bottom': 0.21, // a stack of three folded pieces (GARMENT_SIZES.store.foldedH × 3)
};

export const RAIL_Y = 1.65; // hanging rail height; garments hang from it
export const TABLE_Y = 0.85; // table top (GARMENT_SIZES.store.table)

export interface Fixture {
  zone: ZoneId;
  /** rail = hanging garments; shelf = standing items (shoes) on ≤ 2 tiers; hooks = a wall peg strip (bags, hats, scarves, glasses,
   *  umbrellas, underwear, socks hang from pegs); table / bay are decoration only (no merchandise). */
  kind: 'rail' | 'table' | 'shelf' | 'bay' | 'hooks';
  /** Centre of the fixture (floor-level y is implied by its floor); `yaw` = the items' facing (rotation.y; 0 = facing +z). */
  x: number; z: number; yaw: number;
  /** Length along the fixture's local x. */
  len: number;
  /** Shelf / bay tiers (y above the floor); tables / rails ignore it. */
  tiers?: number[];
  /** Slot pitch along local x. */
  pitch: number;
  /** A free-standing island with goods on both sides (the back side faces yaw + π): rails, hook gondolas, shoe gondola shelves. */
  double?: boolean;
}
// facing: 0 = +z (toward the entrance), ±π/2 = ±x, π = −z
const E = -Math.PI / 2, W = Math.PI / 2;
/** Fixtures per floor, in catalog fill order within each zone. Wall fixtures sit 0.3 m off the wall. */
// Islands x −9.5 / 0 / 9.5 (7 m double rails), rows every 3 m (aisle 2.4 m), wall rails 0.3 m off the walls. Accessories
// (owner 2026-11-03): ONE row per fixture at hand / eye height (hooks 1.1–1.2 m, shoe shelves 0.7 m) so every design is seen
// whole from the aisle — the back half of both floors is filled with double-sided single-tier gondolas instead of stacking.
// Every catalog item is a unique design (catalog.ts designKey) hanging in exactly one slot.
export const FIXTURES: Record<1 | 2, Fixture[]> = {
  1: [
    { zone: 'tees', kind: 'rail', x: -15.7, z: -1.5, yaw: W, len: 21, pitch: 0.75 },
    { zone: 'tees', kind: 'rail', x: -9.5, z: -2, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'tees', kind: 'rail', x: -9.5, z: -5, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'tees', kind: 'rail', x: -9.5, z: -8, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'polo', kind: 'rail', x: 0, z: -2, yaw: 0, len: 7.5, pitch: 0.75, double: true },
    { zone: 'shirts', kind: 'rail', x: 0, z: -5, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'shirts', kind: 'rail', x: 0, z: -8, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'shirts', kind: 'rail', x: 0, z: -11, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'sweats', kind: 'rail', x: -9.5, z: -11, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'sweats', kind: 'rail', x: -9.5, z: -14, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'knit', kind: 'rail', x: -9.5, z: -17, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'knit', kind: 'rail', x: -9.5, z: -20, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'knit', kind: 'rail', x: -9.5, z: -23, yaw: 0, len: 7, pitch: 0.75, double: true }, // round 5: knit polos / half-zips
    { zone: 'knit', kind: 'rail', x: -15.7, z: -21, yaw: W, len: 16, pitch: 0.75 },
    { zone: 'uv', kind: 'rail', x: 9.5, z: -2, yaw: 0, len: 7, pitch: 0.8, double: true },
    { zone: 'fleece', kind: 'rail', x: 9.5, z: -5, yaw: 0, len: 7, pitch: 0.8, double: true },
    { zone: 'down', kind: 'rail', x: 9.5, z: -8, yaw: 0, len: 7, pitch: 0.8, double: true },
    { zone: 'padded', kind: 'rail', x: 9.5, z: -11, yaw: 0, len: 7, pitch: 0.8, double: true },
    { zone: 'fashion-outer', kind: 'rail', x: 9.5, z: -14, yaw: 0, len: 7, pitch: 0.8, double: true },
    { zone: 'fashion-outer', kind: 'rail', x: 9.5, z: -17, yaw: 0, len: 7, pitch: 0.8, double: true },
    { zone: 'fashion-outer', kind: 'rail', x: 9.5, z: -20, yaw: 0, len: 7, pitch: 0.8, double: true }, // round 5: anoraks / varsity / quilted
    { zone: 'fashion-outer', kind: 'rail', x: 15.7, z: -9, yaw: E, len: 18, pitch: 0.8 },
    { zone: 'bags', kind: 'hooks', x: -8.5, z: -29.7, yaw: 0, len: 13, tiers: [1.1], pitch: 0.5 }, // back wall, one row
    { zone: 'bags', kind: 'hooks', x: 0, z: -26, yaw: 0, len: 7, tiers: [1.1], pitch: 0.5, double: true }, // gondola (round 5)
    { zone: 'hats-scarves', kind: 'hooks', x: 6, z: -29.7, yaw: 0, len: 14, tiers: [1.15], pitch: 0.45 },
    { zone: 'hats-scarves', kind: 'hooks', x: 0, z: -23, yaw: 0, len: 7, tiers: [1.15], pitch: 0.45, double: true },
    { zone: 'sunglasses-umbrella', kind: 'hooks', x: 15.7, z: -23.5, yaw: E, len: 7, tiers: [1.2], pitch: 0.45 },
    { zone: 'sunglasses-umbrella', kind: 'hooks', x: 0, z: -20, yaw: 0, len: 7, tiers: [1.2], pitch: 0.45, double: true },
    { zone: 'belts-wallets', kind: 'hooks', x: 0, z: -14, yaw: 0, len: 7, tiers: [1.15], pitch: 0.45, double: true },
    { zone: 'gloves-watches', kind: 'hooks', x: 0, z: -17, yaw: 0, len: 7, tiers: [1.15], pitch: 0.45, double: true },
  ],
  2: [
    { zone: 'pants', kind: 'rail', x: -15.7, z: -5.5, yaw: W, len: 13, pitch: 0.55 },
    { zone: 'pants', kind: 'rail', x: -9.5, z: -2, yaw: 0, len: 7, pitch: 0.55, double: true },
    { zone: 'pants', kind: 'rail', x: -9.5, z: -14, yaw: 0, len: 7, pitch: 0.55, double: true }, // round 5
    { zone: 'jeans', kind: 'rail', x: -9.5, z: -5, yaw: 0, len: 7, pitch: 0.55, double: true },
    { zone: 'jeans', kind: 'rail', x: -9.5, z: -8, yaw: 0, len: 7, pitch: 0.55, double: true },
    { zone: 'jeans', kind: 'rail', x: -9.5, z: -17, yaw: 0, len: 7, pitch: 0.55, double: true }, // round 5
    { zone: 'joggers', kind: 'rail', x: 0, z: -2, yaw: 0, len: 7, pitch: 0.55, double: true },
    { zone: 'joggers', kind: 'rail', x: 0, z: -17, yaw: 0, len: 7, pitch: 0.55, double: true }, // round 5
    { zone: 'shorts', kind: 'rail', x: 0, z: -5, yaw: 0, len: 7, pitch: 0.55, double: true },
    { zone: 'shorts', kind: 'rail', x: 0, z: -8, yaw: 0, len: 7, pitch: 0.55, double: true },
    { zone: 'shorts', kind: 'rail', x: 0, z: -20, yaw: 0, len: 7, pitch: 0.55, double: true }, // round 5
    { zone: 'dresses', kind: 'rail', x: 9.5, z: -2, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'dresses', kind: 'rail', x: 9.5, z: -17, yaw: 0, len: 7, pitch: 0.75, double: true }, // round 5
    { zone: 'dresses', kind: 'rail', x: 9.5, z: -11, yaw: 0, len: 7, pitch: 0.75, double: true },
    { zone: 'skirts', kind: 'rail', x: 9.5, z: -5, yaw: 0, len: 7, pitch: 0.55, double: true },
    { zone: 'skirts', kind: 'rail', x: 9.5, z: -8, yaw: 0, len: 7, pitch: 0.55, double: true },
    { zone: 'skirts', kind: 'rail', x: 9.5, z: -14, yaw: 0, len: 7, pitch: 0.55, double: true }, // round 5
    { zone: 'bras-undies', kind: 'hooks', x: 15.7, z: -5, yaw: E, len: 10, tiers: [1.2], pitch: 0.45 },
    { zone: 'bras-undies', kind: 'hooks', x: 15.7, z: -14, yaw: E, len: 6, tiers: [1.2], pitch: 0.45 }, // round 5
    { zone: 'homewear', kind: 'rail', x: 0, z: -11, yaw: 0, len: 7, pitch: 0.6, double: true },
    { zone: 'homewear', kind: 'rail', x: 0, z: -14, yaw: 0, len: 7, pitch: 0.6, double: true }, // round 5
    { zone: 'footwear-socks', kind: 'shelf', x: -7.5, z: -29.7, yaw: 0, len: 12.15, tiers: [0.7], pitch: 0.45 }, // 27 pairs, one row
    { zone: 'footwear-socks', kind: 'shelf', x: 0, z: -23, yaw: 0, len: 4.5, tiers: [0.7], pitch: 0.45, double: true }, // shoe gondola (round 5): 20 pairs
    { zone: 'footwear-socks', kind: 'hooks', x: 4, z: -29.7, yaw: 0, len: 6, tiers: [1.2], pitch: 0.45 }, // socks
    { zone: 'footwear-socks', kind: 'hooks', x: 15.7, z: -24, yaw: E, len: 3.15, tiers: [1.2], pitch: 0.45 }, // socks, east wall (round 5)
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
  } else if (f.kind === 'hooks') { // hanging from the peg; a double gondola has pegs on both faces of its panel
    for (const t of f.tiers!) for (let i = 0; i < n; i++) place(u0 + i * f.pitch, f.double ? 0.12 : 0.06, floorY + t - h / 2 - 0.02, 'stand');
    if (f.double) for (const t of f.tiers!) for (let i = 0; i < n; i++) place(u0 + i * f.pitch, -0.12, floorY + t - h / 2 - 0.02, 'stand', f.yaw + Math.PI);
  }
  else if (f.kind === 'table') for (const v of [-0.22, 0.22]) for (let i = 0; i < n; i++) place(u0 + i * f.pitch, v, floorY + TABLE_Y + h / 2, 'fold');
  else {
    for (const t of f.tiers!) for (let i = 0; i < n; i++) place(u0 + i * f.pitch, f.double ? 0.2 : 0, floorY + t + h / 2, f.kind === 'bay' ? 'fold' : 'stand');
    if (f.double) for (const t of f.tiers!) for (let i = 0; i < n; i++) place(u0 + i * f.pitch, -0.2, floorY + t + h / 2, 'stand', f.yaw + Math.PI);
  }
  return out;
}
