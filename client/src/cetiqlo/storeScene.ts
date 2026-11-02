// CETIQLO store (docs/plans/cetiqlo.md §7): `buildStore(parent, opts) → StoreHandle`. A bright minimalist two-floor fashion
// shop in room-local metres (shared layout STORE: x east, z south, +z = the storefront at STORE.doorZ, y 0 = floor 1): light
// wood floors, white walls / shelving / tables, metal rails, a glass-walled lobby behind the storefront (waiting teams), the
// red CHECKOUT pad + the mannequin pedestal by the lobby door, a straight stair on the east wall up to floor 2 (which covers
// z ≤ floor2Edge; the entrance area is a double-height atrium), bilingual ceiling zone signs from one canvas atlas, the
// CETIQLO logo on the facade. Everything static is merged per material (≈ 10 draw calls), items are InstancedMesh per shape
// (items.ts), 3 lights, no shadows, `matrixAutoUpdate = false`. Colliders = yaw-rotated cuboids (rooms/roomPlayer.ts `Box`),
// the way hall / garderobe feed Rapier: floors, walls, glass, fixtures, every stair step (KCC autostep 0.4 m > 0.16 m rise).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CATALOG, type CatalogItem, FIXTURES, type Fixture, RAIL_Y, STAIR_TOP_Z, STORE as S, TABLE_Y, ZONES, displayShape } from '@race/shared/cetiqlo';
import type { Box } from '../rooms/roomPlayer.ts';
import { BRAND_RED } from './brand.ts';
import { buildItems } from './items.ts';
import { PIP_LAYER, type Mannequin, createMannequin } from './mannequin.ts';
import { BRIEF_LAYER, type Brief, createBrief } from './brief.ts';
import { type CharacterAsset, loadCharacterAsset } from '../player/CharacterModel.ts';
import { type SignSpec, makeAtlas, signPlane } from './signage.ts';

export const DOOR_Z = S.doorZ;
export const FLOOR2_Y = S.floor2Y;
export const ROOF_Y = S.floor2Y + S.ceiling + 0.3;
export interface AABB { min: THREE.Vector3; max: THREE.Vector3 }
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

export interface StoreHandle {
  group: THREE.Object3D;
  /** Cuboid colliders (room-local, `yaw` about y) for the game's Rapier world: floors, walls, glass, fixtures, stair steps. */
  colliders: Box[];
  /** The walkable floor under (x, z): floor 1, the stair, or floor 2. Where floors overlap (z ≤ floor2Edge) the one nearest
   *  `yNear` (default floor 1) is returned. */
  floorYAt(x: number, z: number, yNear?: number): number;
  itemAnchors: Map<string, THREE.Vector3>;
  setItemVisible(id: string, v: boolean): void;
  checkout: { centre: THREE.Vector3; radius: number; halfExtents: [number, number] };
  startSpots: { x: number; z: number; yaw: number }[];
  lobby: { box: AABB; door: THREE.Vector3 };
  mannequin: Mannequin;
  /** The brief: the set's six pieces on a slowly turning ring (brief.ts), standing large over the pedestal; `brief.renderPiP` for the HUD. */
  brief: Brief;
  minimapBounds: Rect & { floor1: Rect; floor2: Rect; stairs: Rect };
  /** Per frame: turns the mannequin + the brief ring. With `camLocal` (room-local camera position) it also runs the LOD /
   *  floor culling at ≤ 5 Hz: garments beyond LOD_DISTANCE draw their plain copy; under the floor-2 slab only that floor's
   *  items and fixtures are drawn. */
  update(dt: number, camLocal?: THREE.Vector3): void;
  /** Show only one floor (dev page): 1 hides floor 2 + its items, 2 hides floor 1's items; 0 = all. */
  showFloor(f: 0 | 1 | 2): void;
  /** Static scene budget as built (draw calls = meshes, triangles incl. instances). */
  budget(): { meshes: number; triangles: number; lights: number };
  dispose(): void;
}
export interface StoreOptions {
  items?: readonly CatalogItem[]; hq?: boolean;
  /** The game's avatar asset for the human mannequins (player/CharacterModel.ts loadCharacterAsset). Omitted = the store
   *  loads it itself in a browser (stylised stand-ins until then); `null` = keep the stylised figures (tests, budget). */
  avatar?: CharacterAsset | Promise<CharacterAsset> | null;
}

// ---- materials (shared, few) --------------------------------------------------------------------------------------
function woodTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#d9c3a0';
  x.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 8; row++) {
    const off = Math.floor(rnd() * 128);
    for (let k = -1; k < 3; k++) {
      const x0 = off + k * 128, l = 0.86 + rnd() * 0.14;
      x.fillStyle = `rgb(${Math.round(217 * l)},${Math.round(195 * l)},${Math.round(160 * l)})`;
      x.fillRect(x0 + 1, row * 32 + 1, 126, 30);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** A 64² radial alpha falloff (white, alpha 1 → 0) for the contact-shadow blobs; a 1 × 1 clear texture without a DOM. */
function blobTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
const MAT = () => ({
  wood: new THREE.MeshStandardMaterial({ color: '#e5d6bb', roughness: 0.65, map: woodTexture() }),
  white: new THREE.MeshStandardMaterial({ color: '#f4f4f1', roughness: 0.85 }),
  wall: new THREE.MeshStandardMaterial({ color: '#e6e6e2', roughness: 0.9 }),
  tile: new THREE.MeshStandardMaterial({ color: '#dcdcd8', roughness: 0.5 }),
  metal: new THREE.MeshStandardMaterial({ color: '#b9b9bd', roughness: 0.35, metalness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: '#cfe4ea', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  red: new THREE.MeshStandardMaterial({ color: BRAND_RED, roughness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: '#3a3a3c', roughness: 0.7 }),
});
type MatKey = keyof ReturnType<typeof MAT>;

export function buildStore(parent: THREE.Object3D, o: StoreOptions = {}): StoreHandle {
  const items = o.items ?? CATALOG;
  const group = new THREE.Group();
  group.name = 'cetiqlo';
  parent.add(group);
  const mats = MAT();
  const parts: Record<MatKey, THREE.BufferGeometry[]> = { wood: [], white: [], wall: [], tile: [], metal: [], glass: [], red: [], dark: [] };
  const floor2Parts: Record<MatKey, THREE.BufferGeometry[]> = { wood: [], white: [], wall: [], tile: [], metal: [], glass: [], red: [], dark: [] }; // hidden by showFloor(1)
  const colliders: Box[] = [];
  const W = S.halfW, B = S.back, L = S.lobbyZ, D = S.doorZ, F2 = S.floor2Y, E = S.floor2Edge;
  const add = (k: MatKey, g: THREE.BufferGeometry, upper = false) => void (upper ? floor2Parts : parts)[k].push(g);
  const bx = (k: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, yaw = 0, upper = false, collide = false) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (yaw) g.rotateY(yaw);
    add(k, g.translate(x, y, z), upper);
    if (collide) colliders.push({ x, y, z, hx: w / 2, hy: h / 2, hz: d / 2, yaw: yaw || undefined });
  };
  const plane = (k: MatKey, w: number, h: number, x: number, y: number, z: number, rx: number, ry = 0, upper = false) => {
    const g = new THREE.PlaneGeometry(w, h);
    if (k === 'wood') { const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2.4, uv.getY(i) * h / 2.4); } // a plank tile every 2.4 m
    g.rotateX(rx);
    if (ry) g.rotateY(ry);
    add(k, g.translate(x, y, z), upper);
  };

  // ---- shell: floors, walls, roof -------------------------------------------------------------------------------
  plane('wood', 2 * W, L - B, 0, 0, (L + B) / 2, -Math.PI / 2); // floor 1 sales floor
  plane('tile', 2 * W, D - L, 0, 0, (L + D) / 2, -Math.PI / 2); // lobby
  colliders.push({ x: 0, y: -0.5, z: (B + D) / 2, hx: W + 1, hy: 0.5, hz: (D - B) / 2 + 1 }); // floor 1 slab
  // floor 2 slab z ∈ [B, E]: wood top, white underside (floor 1's ceiling) and front edge
  plane('wood', 2 * W, E - B, 0, F2, (B + E) / 2, -Math.PI / 2, 0, true);
  plane('white', 2 * W, E - B, 0, F2 - S.slab, (B + E) / 2, Math.PI / 2);
  bx('white', 2 * W, S.slab, 0.02, 0, F2 - S.slab / 2, E + 0.01, 0, true);
  colliders.push({ x: 0, y: F2 - S.slab / 2, z: (B + E) / 2, hx: W, hy: S.slab / 2, hz: (E - B) / 2 });
  plane('white', 2 * W, D - B, 0, ROOF_Y, (B + D) / 2, Math.PI / 2); // roof underside
  // walls (inner faces): back, west, east, + the facade band above the glass
  plane('wall', 2 * W, ROOF_Y, 0, ROOF_Y / 2, B, 0);
  plane('wall', D - B, ROOF_Y, -W, ROOF_Y / 2, (B + D) / 2, 0, Math.PI / 2);
  plane('wall', D - B, ROOF_Y, W, ROOF_Y / 2, (B + D) / 2, 0, -Math.PI / 2);
  for (const [x, hx, hz, z] of [[0, W + 0.5, 0.5, B - 0.5], [-W - 0.5, 0.5, (D - B) / 2 + 1, (B + D) / 2], [W + 0.5, 0.5, (D - B) / 2 + 1, (B + D) / 2]] as const)
    colliders.push({ x, y: ROOF_Y / 2, z, hx, hy: ROOF_Y / 2, hz });
  // storefront at z = D: glass 0..4 m either side of the door (x ∈ [−1.5, 1.5] open), white band above with the logo
  const GLASS_H = 4;
  for (const sx of [-1, 1]) bx('glass', W - 1.5, GLASS_H, 0.04, sx * (W + 1.5) / 2, GLASS_H / 2, D, 0, false, true);
  bx('white', 2 * W, ROOF_Y - GLASS_H, 0.3, 0, (ROOF_Y + GLASS_H) / 2, D + 0.15);
  bx('metal', 2 * W, 0.12, 0.12, 0, GLASS_H, D); // transom
  for (const x of [-1.5, 1.5]) bx('metal', 0.1, GLASS_H, 0.1, x, GLASS_H / 2, D); // door jambs
  // lobby partition at z = L: glass 3 m high either side of a 2.6 m opening, a header above
  const LD = S.lobbyDoor;
  for (const sx of [-1, 1]) bx('glass', W - LD.halfW, 3, 0.04, sx * (W + LD.halfW) / 2, 1.5, L, 0, false, true);
  bx('white', 2 * W, 0.4, 0.2, 0, 3.2, L);
  for (const x of [-LD.halfW, LD.halfW]) bx('metal', 0.08, 3, 0.08, x, 1.5, L);

  // ---- stair (east wall, climbs toward −z) + balustrades -----------------------------------------------------------
  const ST = S.stair, sw = ST.x1 - ST.x0, sx = (ST.x0 + ST.x1) / 2;
  for (let i = 0; i < ST.steps; i++) {
    const top = (i + 1) * ST.rise, z = ST.zBottom - (i + 0.5) * ST.tread;
    bx('white', sw, top, ST.tread, sx, top / 2, z, 0, false, true);
    bx('dark', sw, 0.02, 0.04, sx, top + 0.01, z + ST.tread / 2 - 0.02); // nosing strip
    bx('glass', 0.03, 1.0, ST.tread, ST.x0 - 0.05, top + 0.5, z); // west balustrade panel
  }
  bx('metal', 0.05, 0.05, Math.hypot(ST.steps * ST.tread, ST.steps * ST.rise), ST.x0 - 0.05, F2 / 2 + 1.0, (ST.zBottom + STAIR_TOP_Z) / 2); // handrail (drawn straight, tilted below)
  parts.metal.at(-1)!.translate(0, -(F2 / 2 + 1.0), -(ST.zBottom + STAIR_TOP_Z) / 2).rotateX(Math.atan2(F2, ST.steps * ST.tread)).translate(0, F2 / 2 + 1.0, (ST.zBottom + STAIR_TOP_Z) / 2);
  colliders.push({ x: ST.x0 - 0.1, y: (F2 + 1.1) / 2, z: (ST.zBottom + STAIR_TOP_Z) / 2, hx: 0.08, hy: (F2 + 1.1) / 2, hz: (ST.zBottom - STAIR_TOP_Z) / 2 }); // invisible wall along the stair's open side
  // floor 2 edge balustrade along z = E (x from −W to the stair), glass 1.1 m + handrail
  const balLen = ST.x0 - 0.1 + W;
  bx('glass', balLen, 1.1, 0.03, (-W + ST.x0 - 0.1) / 2, F2 + 0.55, E - 0.1, 0, true, true);
  bx('metal', balLen, 0.05, 0.06, (-W + ST.x0 - 0.1) / 2, F2 + 1.1, E - 0.1, 0, true);

  // ---- checkout pad, pedestal, start marks -------------------------------------------------------------------------
  const CK = S.checkout;
  bx('red', CK.half * 2, 0.012, CK.half * 2, CK.x, 0.006, CK.z);
  bx('white', 0.08, 2.4, 0.08, CK.x, 1.2, CK.z - CK.half + 0.1); // sign post behind the pad
  const PD = S.pedestal;
  add('white', new THREE.CylinderGeometry(PD.r, PD.r + 0.05, 0.25, 28).translate(PD.x, 0.125, PD.z));
  colliders.push({ x: PD.x, y: 0.125, z: PD.z, hx: PD.r, hy: 0.125, hz: PD.r });
  for (const sp of S.startSpots) add('dark', new THREE.RingGeometry(0.42, 0.5, 24).rotateX(-Math.PI / 2).translate(sp.x, 0.008, sp.z));

  // ---- fixtures -----------------------------------------------------------------------------------------------------
  const fixture = (f: Fixture, floorY: number, upper: boolean) => {
    const local: [MatKey, THREE.BufferGeometry][] = [];
    const lb = (k: MatKey, w: number, h: number, d: number, x: number, y: number, z: number) => local.push([k, new THREE.BoxGeometry(w, h, d).translate(x, y, z)]);
    let hx = f.len / 2, hy = 0.9, hz = 0.3, cz = 0; // collider in fixture space
    if (f.kind === 'table') {
      lb('white', f.len, 0.05, 0.9, 0, TABLE_Y - 0.025, 0);
      lb('white', f.len - 0.3, TABLE_Y - 0.05, 0.6, 0, (TABLE_Y - 0.05) / 2, 0);
      [hy, hz] = [TABLE_Y / 2, 0.45];
    } else if (f.kind === 'rail' && f.double) {
      for (const v of [-0.22, 0.22]) lb('metal', f.len + 0.1, 0.04, 0.04, 0, RAIL_Y, v);
      for (const sx of [-1, 1]) { lb('metal', 0.04, RAIL_Y, 0.04, sx * f.len / 2, RAIL_Y / 2, 0); lb('metal', 0.04, 0.03, 0.7, sx * f.len / 2, 0.015, 0); lb('metal', 0.5, 0.03, 0.03, sx * f.len / 2, RAIL_Y, 0); }
      [hy, hz, cz] = [0.9, 0.5, 0];
    } else if (f.kind === 'rail') {
      lb('metal', f.len + 0.1, 0.04, 0.04, 0, RAIL_Y, 0);
      for (const sx of [-1, 1]) { lb('metal', 0.04, RAIL_Y, 0.04, sx * f.len / 2, RAIL_Y / 2, -0.2); lb('metal', 0.04, 0.03, 0.6, sx * f.len / 2, 0.015, -0.1); }
      lb('metal', f.len + 0.1, 0.03, 0.03, 0, 0.03, -0.2); // low bar between the feet
      [hy, hz, cz] = [0.9, 0.3, -0.05];
    } else if (f.kind === 'bay') {
      lb('tile', f.len + 0.1, 2.0, 0.03, 0, 1.0, -0.2);
      for (const t of f.tiers ?? []) lb('white', f.len + 0.1, 0.03, 0.36, 0, t - 0.015, -0.02);
      for (const sx of [-1, 1]) lb('white', 0.04, 2.0, 0.4, sx * (f.len / 2 + 0.05), 1.0, 0);
      [hy, hz, cz] = [1.0, 0.2, 0];
    } else {
      lb('tile', f.len + 0.1, 2.0, 0.03, 0, 1.0, -0.26);
      for (const t of f.tiers ?? []) lb('white', f.len + 0.1, 0.03, 0.4, 0, t - 0.015, -0.06);
      for (const sx of [-1, 1]) lb('white', 0.04, 2.0, 0.42, sx * (f.len / 2 + 0.05), 1.0, -0.05);
      [hy, hz, cz] = [1.0, 0.24, -0.06];
    }
    const s = Math.sin(f.yaw), c = Math.cos(f.yaw);
    for (const [k, g] of local) add(k, g.rotateY(f.yaw).translate(f.x, floorY, f.z), upper);
    colliders.push({ x: f.x + cz * s, y: floorY + hy, z: f.z + cz * c, hx, hy, hz, yaw: f.yaw || undefined });
  };
  for (const f of FIXTURES[1]) fixture(f, 0, false);
  for (const f of FIXTURES[2]) fixture(f, F2, true);

  // ---- contact darkening: a soft blob under every fixture / pedestal / figure (one merged mesh, radial alpha canvas) ----
  const blobs: THREE.BufferGeometry[] = [];
  const blob = (x: number, y: number, z: number, w: number, d: number, yaw = 0) => blobs.push(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(yaw).translate(x, y + 0.006, z));
  for (const f of FIXTURES[1]) blob(f.x, 0, f.z, f.len + 0.3, f.kind === 'table' ? 1.3 : f.double ? 1.0 : 0.8, f.yaw);
  for (const f of FIXTURES[2]) blob(f.x, F2, f.z, f.len + 0.3, f.kind === 'table' ? 1.3 : f.double ? 1.0 : 0.8, f.yaw);
  blob(PD.x, 0, PD.z, 2.6, 2.6); blob(PD.x + 2.6, 0, PD.z, 1.6, 1.6);
  for (const d of S.displayMannequins) blob(d.x, 0, d.z, 1.5, 1.5);
  for (const zm of S.zoneMannequins) blob(zm.x, zm.floor === 1 ? 0 : F2, zm.z, 1.5, 1.5);
  const blobMesh = new THREE.Mesh(mergeGeometries(blobs, false)!, new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.32, color: '#000000' }));
  blobMesh.name = 'contact-shadows';
  blobMesh.renderOrder = 1;
  blobMesh.matrixAutoUpdate = false;
  group.add(blobMesh);

  // ---- signs: one atlas, one mesh ---------------------------------------------------------------------------------
  const specs: SignSpec[] = [{ id: 'logo', kind: 'logo' }, { id: 'wordmark', kind: 'wordmark' }, { id: 'checkout', kind: 'checkout' }, ...ZONES.map((z) => ({ id: z.id, kind: 'zone' as const, text: z.name, sub: z.nameEn }))];
  const atlas = makeAtlas(specs);
  const signMat = new THREE.MeshBasicMaterial({ map: atlas.texture, side: THREE.FrontSide, transparent: true, alphaTest: 0.5 }); // front faces only: two-sided signs are two planes, so no mirrored text shows through a transparent tile
  const signs: THREE.BufferGeometry[] = [], signs2: THREE.BufferGeometry[] = [];
  const sign = (id: string, w: number, x: number, y: number, z: number, yaw = 0, rx = 0, upper = false, twoSided = false) => {
    const r = atlas.rects.get(id)!;
    const g = signPlane(r, w);
    if (rx) g.rotateX(rx);
    (upper ? signs2 : signs).push(g.clone().rotateY(yaw).translate(x, y, z));
    if (twoSided) (upper ? signs2 : signs).push(g.rotateY(yaw + Math.PI).translate(x - Math.sin(yaw) * 0.01, y, z - Math.cos(yaw) * 0.01));
  };
  sign('logo', 2.6, -4.2, 5.9, D + 0.32); // facade
  sign('wordmark', 7, 2.9, 5.9, D + 0.32);
  sign('wordmark', 3.2, 0, 3.75, L + 0.11, 0, 0, false, true); // over the lobby door, read from the lobby (and from inside: not mirrored)
  sign('checkout', CK.half * 2 - 0.3, CK.x, 0.014, CK.z, 0, -Math.PI / 2); // flat on the pad
  sign('checkout', 1.6, CK.x, 2.25, CK.z - CK.half + 0.15, 0, 0, false, true); // on the post
  sign('logo', 0.6, CK.x, 1.6, CK.z - CK.half + 0.15, 0, 0, false, true);
  for (const z of ZONES) {
    const upper = z.floor === 2;
    sign(z.id, 2.2, z.sign.x, z.sign.y, z.sign.z, z.sign.yaw, 0, upper, true);
    const ceil = upper ? ROOF_Y : z.sign.z > E ? ROOF_Y : F2 - S.slab; // atrium signs hang from the roof
    const half = 2.2 / 2 - 0.15, dx = Math.cos(z.sign.yaw) * half, dz = -Math.sin(z.sign.yaw) * half, top = z.sign.y + 0.2;
    for (const sx of [-1, 1]) bx('metal', 0.02, ceil - top, 0.02, z.sign.x + sx * dx, (ceil + top) / 2, z.sign.z + sx * dz, 0, upper);
  }
  const signMesh = new THREE.Mesh(mergeGeometries(signs, false)!, signMat), signMesh2 = new THREE.Mesh(mergeGeometries(signs2, false)!, signMat);
  signMesh.name = 'signs'; signMesh2.name = 'signs-f2';

  // ---- merge per material -----------------------------------------------------------------------------------------
  const staticMeshes: THREE.Mesh[] = [], upperMeshes: THREE.Mesh[] = [signMesh2];
  for (const [k, list] of Object.entries(parts) as [MatKey, THREE.BufferGeometry[]][]) {
    if (list.length) { const m = new THREE.Mesh(mergeGeometries(list, false)!, mats[k]); m.name = k; staticMeshes.push(m); }
    const up = floor2Parts[k];
    if (up.length) { const m = new THREE.Mesh(mergeGeometries(up, false)!, mats[k]); m.name = `${k}-f2`; upperMeshes.push(m); }
  }
  staticMeshes.push(signMesh);
  for (const m of [...staticMeshes, ...upperMeshes]) { m.matrixAutoUpdate = false; m.renderOrder = m.material === mats.glass ? 2 : 0; group.add(m); }

  // ---- items ------------------------------------------------------------------------------------------------------
  const built = buildItems(items);
  group.add(built.group);

  // ---- mannequins -------------------------------------------------------------------------------------------------
  const brief = createBrief({ turn: true });
  brief.object.position.set(PD.x, 0.25, PD.z); // the ring floats over the pedestal, seen from the lobby through the glass
  group.add(brief.object);
  const mannequin = createMannequin({ turn: true, discR: 0.55 });
  mannequin.object.position.set(PD.x + 2.6, 0, PD.z); // the dressed human beside the pedestal
  group.add(mannequin.object);
  colliders.push({ x: PD.x + 2.6, y: 0.5, z: PD.z, hx: 0.55, hy: 0.5, hz: 0.55 });
  const zoneFigures = S.zoneMannequins.map((z, i) => {
    const m = createMannequin({ turn: false, discR: 0.5 });
    m.object.position.set(z.x, z.floor === 1 ? 0 : F2, z.z);
    m.object.rotation.y = z.yaw;
    m.dress(ZONE_OUTFITS[i % ZONE_OUTFITS.length]!);
    if (z.floor === 2) m.object.traverse((ob) => { if (ob instanceof THREE.Mesh) ob.userData.upper = true; });
    group.add(m.object);
    colliders.push({ x: z.x, y: (z.floor === 1 ? 0 : F2) + 0.5, z: z.z, hx: 0.5, hy: 0.5, hz: 0.5 });
    return m;
  });
  // the human figures: the given asset, or loaded here in a browser (tests / null keep the stylised stand-ins)
  const humans = [mannequin, ...zoneFigures];
  const avatar = o.avatar === undefined ? (typeof document === 'undefined' ? null : loadCharacterAsset().catch(() => null)) : o.avatar;
  let disposed = false;
  if (avatar) Promise.resolve(avatar).then((a) => { if (a && !disposed) humans.forEach((m, i) => m.setHuman(a, (i % 2) as 0 | 1)); });
  const displays = S.displayMannequins.map((d, i) => {
    const m = createMannequin({ turn: false, discR: 0.5 });
    m.object.position.set(d.x, 0, d.z);
    m.object.rotation.y = d.yaw;
    m.dress(SAMPLE_OUTFITS[i % SAMPLE_OUTFITS.length]!);
    group.add(m.object);
    colliders.push({ x: d.x, y: 0.5, z: d.z, hx: 0.5, hy: 0.5, hz: 0.5 });
    return m;
  });

  // ---- lights (2) ---------------------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight('#ffffff', '#b9ae9c', o.hq ? 1.3 : 1.5);
  const sun = new THREE.DirectionalLight('#fff4e6', o.hq ? 2.2 : 2.0);
  sun.position.set(-7, 14, 12);
  const fill = new THREE.DirectionalLight('#e8f0ff', 0.7);
  fill.position.set(9, 6, -10);
  for (const l of [hemi, sun, fill]) { l.layers.enable(PIP_LAYER); l.layers.enable(BRIEF_LAYER); group.add(l); }

  let lodClock = 0, lodFloor: 0 | 1 | 2 = 0;
  group.updateMatrixWorld(true);
  const stairYAt = (z: number) => Math.min(ST.steps, Math.max(1, Math.floor((ST.zBottom - z) / ST.tread) + 1)) * ST.rise;
  const inStair = (x: number, z: number) => x >= ST.x0 && x <= ST.x1 && z <= ST.zBottom && z >= STAIR_TOP_Z - 1e-6;
  const budget = () => {
    let meshes = 0, triangles = 0, lights = 0;
    group.traverse((ob) => {
      if (!ob.visible) return;
      if (ob instanceof THREE.Light) lights++;
      if (ob instanceof THREE.Mesh) {
        const g = ob.geometry as THREE.BufferGeometry, n = ob instanceof THREE.InstancedMesh ? ob.count : 1;
        meshes++;
        triangles += ((g.index ? g.index.count : g.getAttribute('position').count) / 3) * n;
      }
    });
    return { meshes, triangles, lights };
  };
  return {
    group, colliders, itemAnchors: built.anchors, setItemVisible: built.setVisible, mannequin, brief, budget,
    update: (dt, camLocal) => {
      mannequin.update(dt); brief.update(dt);
      if (!camLocal) return;
      lodClock += dt;
      if (lodClock < 0.2) return; // ≤ 5 Hz
      lodClock = 0;
      // the camera under the floor-2 slab sees only floor 1; on floor 2 (z ≤ edge) only floor 2; in the atrium / lobby both
      const under = camLocal.z <= E && camLocal.y < F2 - S.slab, above = camLocal.z <= E && camLocal.y >= F2 - S.slab;
      const floor: 0 | 1 | 2 = under ? 1 : above ? 2 : 0;
      if (floor !== lodFloor) { lodFloor = floor; for (const mm of upperMeshes) mm.visible = floor !== 1; for (const z of zoneFigures) z.object.visible = floor === 0 || z.object.position.y < 1 === (floor === 1); }
      built.updateLod(camLocal, floor);
    },
    floorYAt(x, z, yNear) {
      if (inStair(x, z)) return stairYAt(z);
      if (z <= E && Math.abs(x) <= W) return yNear !== undefined && Math.abs(yNear - F2) < Math.abs(yNear) ? F2 : 0;
      return 0;
    },
    checkout: { centre: new THREE.Vector3(CK.x, 0, CK.z), radius: CK.half, halfExtents: [CK.half, CK.half] },
    startSpots: S.startSpots.map((s) => ({ ...s })),
    lobby: { box: { min: new THREE.Vector3(-W, 0, L), max: new THREE.Vector3(W, GLASS_H, D) }, door: new THREE.Vector3(LD.x, 0, LD.z) },
    minimapBounds: { minX: -W, maxX: W, minZ: B, maxZ: D, floor1: { minX: -W, maxX: W, minZ: B, maxZ: D }, floor2: { minX: -W, maxX: W, minZ: B, maxZ: E }, stairs: { minX: ST.x0, maxX: ST.x1, minZ: STAIR_TOP_Z, maxZ: ST.zBottom } },
    showFloor(f) {
      for (const m of upperMeshes) m.visible = f !== 1;
      for (const z of zoneFigures) z.object.visible = f === 0 || z.object.position.y < 1 === (f === 1);
      for (const m of built.meshes) {
        // an instanced mesh mixes floors: hide by scaling instances of the other floor to 0
        const list = items.filter((it) => `${displayShape(it.shape, it.display)}|${it.finish}` === m.name);
        list.forEach((it) => built.setVisible(it.id, f === 0 || it.floor === f));
      }
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      group.traverse((ob) => { if (ob instanceof THREE.Mesh) ob.geometry.dispose(); });
      for (const m of Object.values(mats)) m.dispose();
      atlas.texture.dispose();
      mannequin.dispose();
      brief.dispose();
      for (const d of [...displays, ...zoneFigures]) d.dispose();
    },
  };
}

/** Outfits on the two static zone figures (floor 1, floor 2): patterned pieces so the patterns are seen worn. */
export const ZONE_OUTFITS: readonly (readonly string[])[] = [
  ['top.shirt-gingham.white-blue', 'outer.bomber.olive', 'bottom.jeans-wide-wash.denim-lightdenim', 'shoes.sneaker.white', 'bag.crossbody.black', 'acc.bucket-hat.beige'],
  ['top.tee-breton.white-navy', 'outer.trench.beige', 'bottom.skirt-pleated-tartan.red-black', 'shoes.boot.black', 'bag.tote-stripe.cream-navy', 'acc.cap-stripe.navy-white'],
];
/** Sample outfits on the two lobby display mannequins (catalog ids). */
export const SAMPLE_OUTFITS: readonly (readonly string[])[] = [
  ['top.shirt-oxford.white', 'outer.blazer.navy', 'bottom.chinos.beige', 'shoes.loafer.brown', 'bag.tote-canvas.cream', 'acc.sunglasses-uv.black'],
  ['top.knit-souffle.pink', 'outer.denim-jacket.lightdenim', 'bottom.skirt-pleated.black', 'shoes.sneaker.white', 'bag.round-mini-bag.beige', 'acc.beanie.grey'],
];
