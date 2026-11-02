// CETIQLO tailoring: builds a garment's geometry ON a body (figure-local metres, y from the feet, facing +z) from the same
// shape recipe (items.ts SPEC) the shelf copy uses — torso as an elliptical tube hugging chest / waist, sleeves as tubes
// along the actual arm bones with the garment's sleeve length, trouser legs along each leg with the right length / taper /
// flare / cuff, skirts and dresses from the waist with their real hem length. Outer layers are cut open at the front.
// Metric UVs keep patterns at shelf scale. Pure geometry: no three objects besides BufferGeometry.
import * as THREE from 'three';
import { SHAPE_H, type ShapeId } from '@race/shared/cetiqlo';
import { type Garment, type Legs, SPEC, type SkirtOpts, box, cyl, dome, merge, metricUV, shade } from './items.ts';

type G = THREE.BufferGeometry;
export type V3 = THREE.Vector3;
/** Body landmarks the garments are fitted to (figure-local; L = the figure's left = +x when facing +z). */
export interface Fit {
  height: number;
  headY: number; neckY: number; neckR: number;
  shoulderL: V3; shoulderR: V3; elbowL: V3; elbowR: V3; wristL: V3; wristR: V3; handL: V3; handR: V3; armR: number;
  chestY: number; chestHalfW: number; chestHalfD: number;
  waistY: number; waistHalfW: number; waistHalfD: number;
  hipY: number; hipHalfW: number; hipHalfD: number;
  thighL: V3; thighR: V3; kneeL: V3; kneeR: V3; ankleL: V3; ankleR: V3; footL: V3; footR: V3; thighRad: number; kneeRad: number; ankleRad: number;
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** The stylised stand-in's landmarks (and the proportions the human fit falls back to). */
export const STYLISED_FIT: Fit = {
  height: 1.75, headY: 1.6, neckY: 1.47, neckR: 0.055,
  shoulderL: v(0.19, 1.42, 0), shoulderR: v(-0.19, 1.42, 0), elbowL: v(0.23, 1.14, 0.02), elbowR: v(-0.23, 1.14, 0.02), wristL: v(0.24, 0.88, 0.08), wristR: v(-0.24, 0.88, 0.08), handL: v(0.24, 0.8, 0.1), handR: v(-0.24, 0.8, 0.1), armR: 0.042,
  chestY: 1.3, chestHalfW: 0.17, chestHalfD: 0.11, waistY: 1.05, waistHalfW: 0.145, waistHalfD: 0.1, hipY: 0.95, hipHalfW: 0.17, hipHalfD: 0.115,
  thighL: v(0.09, 0.88, 0), thighR: v(-0.09, 0.88, 0), kneeL: v(0.1, 0.48, 0.01), kneeR: v(-0.1, 0.48, 0.01), ankleL: v(0.1, 0.07, 0), ankleR: v(-0.1, 0.07, 0), footL: v(0.1, 0, 0.04), footR: v(-0.1, 0, 0.04), thighRad: 0.08, kneeRad: 0.062, ankleRad: 0.05,
};

const UP = new THREE.Vector3(0, 1, 0);
/** An open tube from `a` to `b` (radius r0 → r1), `seg` sides. */
function tube(a: V3, b: V3, r0: number, r1: number, seg = 8, s = 1): G {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r0, r1, len, seg, 1, true).rotateX(Math.PI).translate(0, len / 2, 0); // r0 at `a`, r1 at `b`
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())).translate(a.x, a.y, a.z);
  return s === 1 ? g : shade(g, s);
}
/** An elliptical tube between two heights: half widths (x) and half depths (z) at the top and bottom; optional front opening. */
function trunk(yTop: number, yBot: number, wT: number, dT: number, wB: number, dB: number, gap = 0, seg = 14, s = 1): G {
  const g = new THREE.CylinderGeometry(1, 1, yTop - yBot, seg, 1, true, gap / 2, Math.PI * 2 - gap);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + (yTop - yBot) / 2) / (yTop - yBot); // 0 bottom → 1 top
    p.setX(i, p.getX(i) * (wB + (wT - wB) * t));
    p.setZ(i, p.getZ(i) * (dB + (dT - dB) * t));
  }
  g.computeVertexNormals();
  g.translate(0, (yTop + yBot) / 2, 0);
  return s === 1 ? g : shade(g, s);
}
/** A flat elliptical lid (closes the shoulders / a waist). */
const lid = (y: number, w: number, d: number, seg = 14, s = 1): G => {
  const g = new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2).scale(w, 1, d).translate(0, y, 0);
  return s === 1 ? g : shade(g, s);
};
const ring = (y: number, w: number, d: number, h: number, s: number, seg = 14): G => trunk(y + h / 2, y - h / 2, w, d, w, d, 0, seg, s);

/** A top / outer on the body. `ease` m of room around chest and waist; outer layers are open at the front. */
function wornGarment(o: Garment, f: Fit, shape: ShapeId, outer: boolean): G {
  const ease = outer ? 0.035 : 0.02, parts: G[] = [];
  const ySh = f.shoulderL.y + 0.04, hem = ySh - o.h * 1.0; // the garment's own length from the shoulder line
  const wT = f.chestHalfW + ease, dT = f.chestHalfD + ease, wB = Math.max(f.waistHalfW, f.hipHalfW * (hem < f.hipY ? 1 : 0.9)) + ease, dB = f.waistHalfD + ease + (hem < f.hipY ? 0.02 : 0);
  const gap = outer ? 0.75 : 0;
  parts.push(trunk(ySh, hem, wT, dT, wB, dB, gap));
  parts.push(lid(ySh, wT, dT));
  // sleeves along the arm bones
  const sl = o.sleeve;
  for (const side of ['L', 'R'] as const) {
    const S = f[`shoulder${side}`], E = f[`elbow${side}`], W = f[`wrist${side}`];
    const r0 = f.armR + ease + 0.01, r1 = f.armR + ease + 0.004;
    const out = S.clone().sub(v(0, S.y, 0)).normalize().multiplyScalar(0.0); // (shoulder joint already at the torso edge)
    const s0 = S.clone().add(out).add(v(0, 0.03, 0));
    if (sl === 'cap') parts.push(tube(s0, s0.clone().lerp(E, 0.3), r0, r0));
    else if (sl === 'short' || sl === 'puff') parts.push(tube(s0, s0.clone().lerp(E, 0.8), r0 * (sl === 'puff' ? 1.4 : 1), r0));
    else if (sl === 'long') { parts.push(tube(s0, E.clone().lerp(s0, -0.1), r0, r1 + 0.005)); parts.push(tube(E.clone().lerp(s0, 0.1), W, r1 + 0.005, r1 * (o.sleeveFlare ?? 1))); if (o.hem === 'rib') parts.push(tube(W.clone().lerp(E, 0.08), W, r1 + 0.004, r1 + 0.004, 8, 0.8)); }
    else if (sl === 'strap') parts.push(shade(box(0.03, 0.08, 0.025, S.x * 0.55, ySh - 0.02, 0.0), 0.9));
  }
  // neck
  const nr = f.neckR + 0.012, ny = f.neckY - 0.02;
  switch (o.neck) {
    case 'crew': parts.push(ring(ny, nr + 0.015, nr + 0.01, 0.03, 0.8, 10)); break;
    case 'band': parts.push(ring(ny + 0.01, nr + 0.012, nr + 0.008, 0.035, 0.85, 10)); break;
    case 'mock': parts.push(ring(ny + 0.03, nr + 0.012, nr + 0.01, 0.07, 0.85, 10)); break;
    case 'turtle': parts.push(ring(ny + 0.06, nr + 0.014, nr + 0.012, 0.13, 0.85, 10)); break;
    case 'stand': parts.push(ring(ny + 0.015, nr + 0.03, nr + 0.025, 0.06, 0.9, 10)); break;
    case 'polo': parts.push(ring(ny + 0.015, nr + 0.03, nr + 0.025, 0.06, 0.9, 10)); for (const s of [-1, 1]) parts.push(shade(box(0.09, 0.09, 0.012, s * 0.055, ySh - 0.045, dT + 0.006, -s * 0.5), 0.9)); break;
    case 'camp': for (const s of [-1, 1]) parts.push(shade(box(0.12, 0.1, 0.012, s * 0.09, ySh - 0.05, dT + 0.006, -s * 0.7), 0.9)); break;
    case 'lapel': for (const s of [-1, 1]) parts.push(shade(box(0.075, 0.3, 0.012, s * 0.085, ySh - 0.17, dT + 0.006, -s * 0.35), 0.85)); break;
    case 'hood': parts.push(new THREE.SphereGeometry(0.15, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-0.6).translate(0, ySh - 0.04, -dT - 0.03)); break;
    case 'v': for (const s of [-1, 1]) parts.push(shade(box(0.025, 0.17, 0.01, s * 0.05, ySh - 0.085, dT + 0.004, -s * 0.5), 0.5)); break;
    case 'scoop': break;
  }
  if (sl === 'strap' || o.neck === 'scoop') parts.push(shade(box(0.13, 0.05, dT * 2 + 0.004, 0, ySh - 0.03, 0), 0.4));
  const fz = dT + 0.004, mid = (ySh + hem) / 2, len = ySh - hem;
  if (!outer) switch (o.front) { // open outers show their edges instead of a placket
    case 'placket': parts.push(shade(box(0.024, len * 0.9, 0.008, 0, mid - len * 0.03, fz), 0.8)); break;
    case 'zip': parts.push(shade(box(0.018, len * 0.92, 0.008, 0, mid - len * 0.03, fz), 0.5)); break;
    case 'halfzip': parts.push(shade(box(0.018, len * 0.32, 0.008, 0, ySh - len * 0.2, fz), 0.5)); break;
    case 'buttons': parts.push(shade(box(0.016, len * 0.9, 0.006, 0, mid - len * 0.03, fz - 0.001), 0.8)); for (let i = 0; i < 3; i++) parts.push(shade(box(0.024, 0.024, 0.008, 0, ySh - 0.14 - i * 0.16, fz + 0.004), 0.45)); break;
    case 'open': case 'double': break;
  }
  if (outer) for (const s of [-1, 1]) parts.push(shade(box(0.03, len - 0.02, 0.012, s * Math.sin(gap / 2) * (wT + wB) / 2, mid, Math.cos(gap / 2) * (dT + dB) / 2 + 0.004), o.front === 'zip' ? 0.5 : 0.85)); // front edges of the opening
  if (o.front === 'double') for (const s of [-1, 1]) for (let i = 0; i < 3; i++) parts.push(shade(box(0.03, 0.03, 0.008, s * 0.075, ySh - 0.22 - i * 0.15, fz + 0.004), 0.45));
  switch (o.pocket) {
    case 'kangaroo': parts.push(shade(box(0.3, 0.15, 0.012, 0, hem + 0.15, dB + 0.006), 0.86)); break;
    case 'chest': parts.push(shade(box(0.11, 0.1, 0.01, 0.12, ySh - 0.2, fz + 0.002), 0.86)); break;
    case 'chest2': for (const s of [-1, 1]) parts.push(shade(box(0.11, 0.1, 0.01, s * 0.12, ySh - 0.2, fz + 0.002), 0.86)); break;
    case 'side2': for (const s of [-1, 1]) parts.push(shade(box(0.12, 0.13, 0.01, s * (wB - 0.06), hem + 0.19, dB + 0.006), 0.86)); break;
  }
  if (o.hem === 'rib') parts.push(ring(hem + 0.03, wB + 0.006, dB + 0.006, 0.06, 0.8));
  if (o.hem === 'belt') parts.push(ring(f.waistY - 0.02, wB + 0.012, dB + 0.012, 0.05, 0.6));
  if (o.quilt) for (let i = 1; i <= o.quilt; i++) parts.push(ring(ySh - (i * len) / (o.quilt + 1), (wT + wB) / 2 + 0.006, (dT + dB) / 2 + 0.006, 0.007, 0.72));
  void shape;
  return metricUV(merge(...parts));
}

/** Trousers / shorts on the legs: waistband + hip yoke + one tube per leg segment, cut at the recipe's length. */
function wornLegs(o: Legs, f: Fit): G {
  const ease = 0.02, parts: G[] = [];
  const yW = f.hipY + 0.06, wW = f.hipHalfW + ease, dW = f.hipHalfD + ease;
  parts.push(ring(yW, wW + 0.004, dW + 0.004, 0.06, o.band ?? 1));
  parts.push(trunk(yW - 0.03, f.thighL.y - 0.04, wW, dW, wW + 0.01, dW + 0.01));
  parts.push(lid(yW - 0.03, wW + 0.004, dW + 0.004));
  const rHip = o.top + ease + 0.01, rKnee = (o.top + o.bottom) / 2 + ease, rAnkle = o.bottom + ease;
  // length from the recipe: ≥ 0.9 full (hem above the shoe), 0.5..0.9 knee, else mid-thigh
  const full = o.h >= 0.9, knee = o.h >= 0.5 && !full;
  for (const side of ['L', 'R'] as const) {
    const T = f[`thigh${side}`].clone().setY(f.thighL.y - 0.03), K = f[`knee${side}`], A = f[`ankle${side}`].clone().add(v(0, 0.07, 0));
    const K1 = K.clone().lerp(T, -0.08), K0 = K.clone().lerp(T, 0.08); // the two leg tubes overlap at the knee (no wedge gap where the leg bends)
    if (full) { parts.push(tube(T, K1, rHip, rKnee)); parts.push(tube(K0, A, rKnee, rAnkle)); if (o.cuff) parts.push(tube(A.clone().lerp(K, 0.06), A, rAnkle + 0.005, rAnkle + 0.005, 8, 0.8)); }
    else if (knee) parts.push(tube(T, K.clone().add(v(0, 0.03, 0)), rHip, rKnee + 0.01));
    else parts.push(tube(T, T.clone().lerp(K, 0.55), rHip, rHip - 0.005));
    if (o.cargo) parts.push(shade(box(0.05, 0.14, 0.11, T.x + Math.sign(T.x) * (rHip + 0.01), (T.y + K.y) / 2 + 0.02, 0), 0.85));
    if (o.seam) parts.push(shade(box(0.006, (full ? T.y - A.y : knee ? T.y - K.y : 0.3) - 0.04, 0.006, T.x, full ? (T.y + A.y) / 2 : knee ? (T.y + K.y) / 2 : T.y - 0.15, rHip + 0.002), 0.7));
  }
  if (o.fly) parts.push(shade(box(0.012, 0.13, 0.006, 0.02, yW - 0.1, dW + 0.006), 0.7));
  return metricUV(merge(...parts));
}

/** A skirt from the waist, the recipe's hem length and flare. */
function wornSkirt(h: number, rt: number, rb: number, seg: number, o: SkirtOpts | undefined, f: Fit): G {
  const parts: G[] = [];
  const yW = f.hipY + 0.06, hem = yW - h, flare = rb / rt;
  const wW = f.hipHalfW + 0.02, dW = f.hipHalfD + 0.02;
  parts.push(ring(yW, wW + 0.004, dW + 0.004, 0.05, o?.band ?? 0.85, seg));
  parts.push(trunk(yW - 0.025, hem, wW, dW, wW * flare, dW * flare, 0, seg));
  parts.push(lid(yW - 0.025, wW, dW, seg));
  if (o?.pleats) for (let i = 0; i < o.pleats; i++) { const a = (i * Math.PI * 2) / o.pleats + 0.2, w2 = (wW + wW * flare) / 2 + 0.003, d2 = (dW + dW * flare) / 2 + 0.003; parts.push(shade(box(0.006, h - 0.07, 0.006, Math.sin(a) * w2, (yW + hem) / 2, Math.cos(a) * d2), 0.75)); }
  if (o?.slit) parts.push(shade(box(0.012, h * 0.45, 0.006, 0.03, hem + h * 0.22, dW * flare * 0.95), 0.5));
  if (o?.wrap) parts.push(shade(box(0.12, h - 0.05, 0.01, 0.07, (yW + hem) / 2, dW * flare * 0.9, 0.06), 0.9));
  return metricUV(merge(...parts));
}

/** A tailored copy of `shape` for this body (null = the shape is not a worn garment: shoes, bags, accessories keep their mesh). */
export function wornGeometry(shape: ShapeId, f: Fit, outer: boolean): G | null {
  const sp = SPEC[shape];
  if (sp.kind === 'garment') return wornGarment(sp, f, shape, outer);
  if (sp.kind === 'legs') return wornLegs(sp, f);
  if (sp.kind === 'skirt') return wornSkirt(sp.h, sp.rt, sp.rb, sp.seg, sp.opts, f);
  if (sp.kind === 'dress') {
    const top = wornGarment({ w: sp.rt * 2, h: 0.36, d: 0.1, sleeve: sp.sleeve, neck: sp.neck, front: sp.front, hem: sp.belt ? 'belt' : undefined }, f, shape, false);
    const skirt = wornSkirt(sp.h - 0.42, sp.rt, sp.rb, 10, { band: sp.belt ? 0.6 : 1 }, f);
    return metricUV(merge(top, skirt));
  }
  return null;
}
export const wornHeight = (shape: ShapeId): number => SHAPE_H[shape];
export { box, cyl, dome };
