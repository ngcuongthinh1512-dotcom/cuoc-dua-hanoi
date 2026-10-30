// Pure layout / geometry builders for the GardeRobe dev room (client/garderobe.html, entry garderobe.ts). No DOM.
// 1 unit = 1 m. X across the room, Z along it (street front / entrance at +Z, back wall at −Z), Y up, y 0 = parquet.
// Plan = the ground floor of the small corner-house museum: shopfront with two big windows + a door on the street side,
// black glass cabinets of small costumed figurines along the walls, a staircase up along the right wall at the back, and
// in the middle four tall glass vitrines on plinths (a shallow arc facing the entrance), each holding one photo print
// (public/garderobe/costume-a..d, shown whole at its native aspect) as a lightbox panel lit by its own spot.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Slot { x: number; y: number; z: number; yaw: number }

export const G = {
  halfW: 5, halfL: 8, wallH: 4.0,
  window: { x0: 1.0, x1: 4.6, y0: 0.45, y1: 3.3 }, // two street windows mirrored in x; the door between them
  door: { hw: 0.6, h: 2.7 },
  vitrine: { w: 1.3, d: 0.8, plinthH: 0.85, glassH: 1.95, printH: 1.55, arcR: 7.5, arcZ: 7, thetas: [-0.46, -0.16, 0.16, 0.46] },
  cabinet: { d: 0.55, h: 2.6, y0: 0.3, shelfDy: 0.55 },
  left: [4.5, 1.0, -2.5], right: [4.5, 1.0], // cabinet centres (z) on the long walls, 3.2 m wide each
  stair: { x: 4.3, w: 0.9, z0: -2.2, steps: 12, rise: 0.19, run: 0.38 },
};
export const CAB_W = 3.2;
export const PHOTOS = ['costume-a.png', 'costume-b.png', 'costume-c.png', 'costume-d.jpg']; // the originals, byte-identical to the user's files

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const merge = (g: THREE.BufferGeometry[]) => mergeGeometries(g, false)!;
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export interface Vitrine extends Slot { n: number }
/** Four vitrines on a shallow arc (radius arcR about (0, arcZ)), each turned to face the entrance side of the arc. */
export function vitrineSlots(): Vitrine[] {
  const { arcR, arcZ, thetas } = G.vitrine;
  return thetas.map((t, i) => ({ n: i + 1, x: arcR * Math.sin(t), y: 0, z: arcZ - arcR * Math.cos(t), yaw: -t }));
}
/** World point of a slot-local offset (local +z = the slot's front). */
export const slotLocal = (s: Slot, lx: number, ly: number, lz: number): THREE.Vector3 => v(lx, ly, lz).applyAxisAngle(v(0, 1, 0), s.yaw).add(v(s.x, s.y, s.z));
/** Print panel: centre height and size (w × printH) for an image of the given aspect (w / h). */
export const printSize = (aspect: number): { w: number; h: number; y: number } => ({ w: G.vitrine.printH * aspect, h: G.vitrine.printH, y: G.vitrine.plinthH + 0.12 + G.vitrine.printH / 2 });
/** Camera distance that fits a w × h panel whole in a camera of vertical fov (deg) and screen aspect, with a margin. */
export const fitDistance = (w: number, h: number, fovDeg: number, screenAspect: number, margin = 1.12): number => {
  const t = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  return Math.max(h / 2 / t, w / 2 / (t * screenAspect)) * margin;
};
/** Close-up camera pose for a vitrine's print of aspect `aspect`: straight in front at the print's centre height. */
export const focusPose = (s: Slot, aspect: number, fovDeg: number, screenAspect: number): [THREE.Vector3, THREE.Vector3] => {
  const p = printSize(aspect), d = fitDistance(p.w, p.h, fovDeg, screenAspect);
  return [slotLocal(s, 0, p.y, G.vitrine.d / 2 + d), slotLocal(s, 0, p.y, 0)];
};
/** Vitrine case frame (plinth, brass plate, 12 black edge bars + top cap) in slot-local space, keyed by material. */
export function vitrineGeometry(): Record<'plinth' | 'brass' | 'frame', THREE.BufferGeometry> {
  const { w, d, plinthH, glassH } = G.vitrine, e = 0.03, y1 = plinthH + glassH, bars: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bars.push(box(e, glassH, e, sx * (w / 2 - e / 2), plinthH + glassH / 2, sz * (d / 2 - e / 2)));
  for (const y of [plinthH + e / 2, y1 - e / 2]) for (const sz of [-1, 1]) bars.push(box(w, e, e, 0, y, sz * (d / 2 - e / 2)));
  for (const y of [plinthH + e / 2, y1 - e / 2]) for (const sx of [-1, 1]) bars.push(box(e, e, d, sx * (w / 2 - e / 2), y, 0));
  bars.push(box(w, 0.12, d, 0, y1 + 0.06, 0)); // top cap with the spot inside
  return {
    plinth: merge([box(w, plinthH - 0.02, d, 0, (plinthH - 0.02) / 2, 0), box(w + 0.06, 0.04, d + 0.06, 0, 0.02, 0)]),
    brass: merge([box(w - 0.02, 0.02, d - 0.02, 0, plinthH - 0.01, 0), box(0.16, 0.1, 0.006, 0, plinthH - 0.3, d / 2 + 0.003)]), // plate + number plaque
    frame: merge(bars),
  };
}

export interface Cabinet extends Slot { w: number; shelves: number; perShelf: number }
/** Wall cabinets: 3 on the left wall, 2 on the right (the stair takes the back of it), one wide across the back wall. */
export function cabinetSlots(): Cabinet[] {
  const { halfW, halfL, cabinet } = G, d = cabinet.d;
  return [
    ...G.left.map((z) => ({ x: -halfW + d / 2, y: 0, z, yaw: Math.PI / 2, w: CAB_W, shelves: 4, perShelf: 7 })),
    ...G.right.map((z) => ({ x: halfW - d / 2, y: 0, z, yaw: -Math.PI / 2, w: CAB_W, shelves: 4, perShelf: 7 })),
    { x: -0.9, y: 0, z: -halfL + d / 2, yaw: 0, w: 7.8, shelves: 5, perShelf: 15 },
  ];
}
export interface Figurine extends Slot { scale: number; tint: number }
/** Every small figurine: on the cabinet shelves (facing the room) and on the street-window platforms. */
export function figurineSlots(): Figurine[] {
  const out: Figurine[] = [];
  let k = 0;
  for (const c of cabinetSlots()) for (let s = 0; s < c.shelves; s++) for (let i = 0; i < c.perShelf; i++) {
    const lx = -c.w / 2 + (c.w * (i + 0.5)) / c.perShelf, p = slotLocal(c, lx, G.cabinet.y0 + 0.08 + s * G.cabinet.shelfDy, 0.1);
    out.push({ x: p.x, y: p.y, z: p.z, yaw: c.yaw, scale: 0.27, tint: k++ });
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) out.push({ x: sx * (G.window.x0 + 0.5 + i * 0.85), y: 0.85, z: G.halfL - 0.65, yaw: Math.PI, scale: 0.36, tint: k++ });
  return out;
}
/** Generic small figurine silhouette (1.4 units tall: round head, tunic, hat); bronze + tinted cloth parts. `low` = the
 *  race's minimal graphics: a third of the segments (≈ 170 instances: the room's biggest triangle count). */
export function figurineGeometry(low = false): { bronze: THREE.BufferGeometry; cloth: THREE.BufferGeometry } {
  const S = (n: number) => (low ? Math.max(5, Math.round(n / 2.5)) : n);
  const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), S(18)).scale(1, 1, 0.85);
  return {
    bronze: merge([new THREE.SphereGeometry(0.15, S(14), S(10)).translate(0, 1.25, 0), ...[-0.08, 0.08].map((x) => new THREE.CylinderGeometry(0.05, 0.045, 0.45, S(8)).translate(x, 0.22, 0)), new THREE.CylinderGeometry(0.2, 0.22, 0.04, S(14)).translate(0, 0.02, 0)]),
    cloth: merge([lathe([[0.26, 0.42], [0.22, 0.7], [0.2, 0.95], [0.18, 1.07], [0.09, 1.1]]), new THREE.CylinderGeometry(0.15, 0.16, 0.1, S(14)).translate(0, 1.41, 0), new THREE.CylinderGeometry(0.25, 0.25, 0.015, S(24)).translate(0, 1.365, 0)]),
  };
}
/** Stair steps + landing + outer stringer along the right wall, climbing toward −z. */
export function stairGeometry(): THREE.BufferGeometry {
  const { x, w, z0, steps, rise, run } = G.stair, g: THREE.BufferGeometry[] = [];
  for (let i = 0; i < steps; i++) g.push(box(w, rise * (i + 1), run, x, (rise * (i + 1)) / 2, z0 - run * (i + 0.5)));
  g.push(box(w, steps * rise, 1.0, x, (steps * rise) / 2, z0 - run * steps - 0.5)); // landing
  return merge(g);
}
export const stairTop = (): THREE.Vector3 => v(G.stair.x, G.stair.steps * G.stair.rise, G.stair.z0 - G.stair.run * G.stair.steps - 0.5);

export const inside = (x: number, z: number, m = 0): boolean => Math.abs(x) < G.halfW - m && Math.abs(z) < G.halfL - m;
/** Keep the camera in the room (or on the pavement outside the front, z up to halfL + 6) above the floor and under the ceiling. */
export const clampRoom = (p: THREE.Vector3, m = 0.4): THREE.Vector3 => p.set(THREE.MathUtils.clamp(p.x, -G.halfW + m, G.halfW - m), THREE.MathUtils.clamp(p.y, 0.5, G.wallH - 0.3), THREE.MathUtils.clamp(p.z, -G.halfL + m, G.halfL + 6));
