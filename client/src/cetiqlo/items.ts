// CETIQLO merchandise: one low-poly geometry per ShapeId (≤ 200 triangles, centred at the origin, front toward +z, heights
// from shared layout SHAPE_H; every ShapeId is a distinct silhouette: length, sleeves, collar, hood, pockets, hem), built once
// and drawn as ONE InstancedMesh per display shape with ONE shared material. Per instance: colour (`instanceColor`),
// roughness, and a pattern (patterns.ts atlas tile + second colour + repeat) read by a small onBeforeCompile addition —
// so patterns, washes and finishes cost no extra draw calls. Details (zippers, plackets, soles, ribs) are small
// uniformly-shaded parts baked into the shape (per-vertex paint on 8-vertex boxes would only interpolate).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type CatalogItem, type Finish, SHAPE_H, type ShapeId, displayShape } from '@race/shared/cetiqlo';
import { PATTERN_SCALE, TILES, patternAtlas, patternIndex } from './patterns.ts';

type G = THREE.BufferGeometry;
export const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0, rz = 0): G => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  return g.translate(x, y, z);
};
export const cyl = (rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0, open = false): G => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(x, y, z);
export const dome = (r: number, x = 0, y = 0, z = 0, seg = 6): G => new THREE.SphereGeometry(r, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y, z);
/** A uniform vertex shade (0..1, multiplies the instance colour) over a whole part. */
export function shade(g: G, s: number): G {
  const n = g.getAttribute('position').count, c = new Float32Array(n * 3).fill(s);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
export const merge = (...parts: G[]): G => mergeGeometries(parts.map((p) => { const g = p.index ? p.toNonIndexed() : p; return g.getAttribute('color') ? g : shade(g, 1); }), false)!;
const btn = (x: number, y: number, z: number, r = 0.012) => shade(box(r * 2, r * 2, 0.008, x, y, z), 0.45);

export interface Garment {
  w: number; h: number; d: number;
  sleeve: 'none' | 'cap' | 'short' | 'long' | 'strap' | 'puff';
  neck?: 'crew' | 'v' | 'turtle' | 'mock' | 'polo' | 'band' | 'camp' | 'hood' | 'lapel' | 'scoop' | 'stand';
  front?: 'placket' | 'zip' | 'halfzip' | 'open' | 'double' | 'buttons';
  pocket?: 'kangaroo' | 'chest' | 'chest2' | 'side2';
  hem?: 'rib' | 'belt'; quilt?: number; sleeveW?: number; sleeveFlare?: number;
}
/** Torso box + sleeves + neck + front + pockets + hem; the top edge at +h/2. */
function garment(o: Garment): G {
  const { w, h, d } = o, parts: G[] = [box(w, h, d)];
  const sw = o.sleeveW ?? 0.13, sl = { none: 0, cap: 0.08, short: h * 0.3, long: h * 0.78, strap: 0, puff: h * 0.32 }[o.sleeve];
  const fz = d / 2; // front face z
  const arm = 0.3;
  if (sl) for (const s of [-1, 1]) {
    const sw2 = sw * (o.sleeve === 'puff' ? 1.5 : 1), flare = o.sleeveFlare ?? 1;
    parts.push(new THREE.CylinderGeometry(sw2 / 2, (sw2 * flare) / 2, sl, 6).translate(0, -sl / 2, 0).rotateZ(s * arm).translate(s * (w / 2 - 0.01), h / 2 - 0.03, 0));
    if (o.hem === 'rib' && o.sleeve === 'long') parts.push(shade(cyl((sw2 * flare) / 2 + 0.006, (sw2 * flare) / 2 + 0.006, 0.05, 6, 0, 0, 0, true).translate(0, -sl + 0.025, 0).rotateZ(s * arm).translate(s * (w / 2 - 0.01), h / 2 - 0.03, 0), 0.8));
  }
  if (o.sleeve === 'strap') for (const s of [-1, 1]) parts.push(shade(box(0.025, 0.1, 0.02, s * 0.09, h / 2 - 0.05, 0), 0.9));
  if (o.sleeve === 'strap' || o.neck === 'scoop') parts.push(shade(box(0.12, 0.05, d + 0.004, 0, h / 2 - 0.025, 0), 0.4)); // scoop cut-out (dark)
  switch (o.neck) {
    case 'crew': parts.push(shade(cyl(0.085, 0.085, 0.03, 8, 0, h / 2, 0, true), 0.8)); break;
    case 'v': for (const s of [-1, 1]) parts.push(shade(box(0.025, 0.17, 0.01, s * 0.045, h / 2 - 0.07, fz + 0.004, -s * 0.5), 0.5)); break;
    case 'turtle': parts.push(shade(cyl(0.085, 0.09, 0.12, 8, 0, h / 2 + 0.04, 0, true), 0.85)); break;
    case 'mock': parts.push(shade(cyl(0.085, 0.09, 0.06, 8, 0, h / 2 + 0.02, 0, true), 0.85)); break;
    case 'stand': parts.push(shade(cyl(0.085, 0.078, 0.06, 8, 0, h / 2 + 0.015, 0, true), 0.9)); break;
    case 'band': parts.push(shade(cyl(0.085, 0.085, 0.035, 8, 0, h / 2 + 0.008, 0, true), 0.85)); break;
    case 'polo': parts.push(shade(cyl(0.085, 0.075, 0.06, 8, 0, h / 2 + 0.015, 0, true), 0.9)); for (const s of [-1, 1]) parts.push(shade(box(0.08, 0.08, 0.012, s * 0.05, h / 2 - 0.03, fz + 0.006, -s * 0.5), 0.9)); break;
    case 'camp': for (const s of [-1, 1]) parts.push(shade(box(0.11, 0.09, 0.012, s * 0.08, h / 2 - 0.035, fz + 0.006, -s * 0.7), 0.9)); break;
    case 'hood': parts.push(new THREE.SphereGeometry(0.14, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-0.5).translate(0, h / 2 - 0.03, -d / 2 - 0.02)); break;
    case 'lapel': for (const s of [-1, 1]) parts.push(shade(box(0.07, 0.3, 0.012, s * 0.075, h / 2 - 0.16, fz + 0.006, -s * 0.35), 0.85)); break;
    case 'scoop': break;
  }
  switch (o.front) {
    case 'placket': parts.push(shade(box(0.022, h * 0.9, 0.008, 0, -h * 0.03, fz + 0.004), 0.8)); break;
    case 'zip': parts.push(shade(box(0.018, h * 0.92, 0.008, 0, -h * 0.03, fz + 0.004), 0.5)); break;
    case 'halfzip': parts.push(shade(box(0.018, h * 0.32, 0.008, 0, h / 2 - h * 0.2, fz + 0.004), 0.5)); break;
    case 'open': parts.push(shade(box(0.05, h * 0.92, 0.01, 0, -h * 0.03, fz + 0.004), 0.45)); break;
    case 'buttons': parts.push(shade(box(0.016, h * 0.9, 0.006, 0, -h * 0.03, fz + 0.003), 0.8)); for (let i = 0; i < 2; i++) parts.push(btn(0, h / 2 - 0.14 - i * 0.16, fz + 0.01)); break;
    case 'double': for (const s of [-1, 1]) for (let i = 0; i < 3; i++) parts.push(btn(s * 0.06, h / 2 - 0.2 - i * 0.14, fz + 0.01, 0.015)); break;
  }
  switch (o.pocket) {
    case 'kangaroo': parts.push(shade(box(0.28, 0.14, 0.012, 0, -h / 2 + 0.14, fz + 0.006), 0.86)); break;
    case 'chest': parts.push(shade(box(0.11, 0.1, 0.01, 0.13, h / 2 - 0.2, fz + 0.005), 0.86)); break;
    case 'chest2': for (const s of [-1, 1]) parts.push(shade(box(0.11, 0.1, 0.01, s * 0.13, h / 2 - 0.2, fz + 0.005), 0.86)); break;
    case 'side2': for (const s of [-1, 1]) parts.push(shade(box(0.12, 0.13, 0.01, s * 0.15, -h / 2 + 0.2, fz + 0.005), 0.86)); break;
  }
  if (o.hem === 'rib') parts.push(shade(box(w + 0.01, 0.05, d + 0.01, 0, -h / 2 + 0.025, 0), 0.8));
  if (o.hem === 'belt') parts.push(shade(box(w + 0.03, 0.05, d + 0.03, 0, -0.02, 0), 0.6));
  if (o.quilt) for (let i = 1; i <= o.quilt; i++) parts.push(shade(box(w - 0.04, 0.006, d + 0.008, 0, h / 2 - (i * h) / (o.quilt + 1), 0), 0.72));
  return merge(...parts);
}
export interface Legs { w: number; h: number; top: number; bottom: number; cuff?: boolean; seam?: boolean; band?: number; cargo?: boolean; fly?: boolean }
/** Waistband + two legs (tapered 6-sided cylinders: `top` / `bottom` radii = the silhouette), cuffs, cargo pockets, fly. */
function legs(o: Legs): G {
  const { w, h } = o, parts: G[] = [shade(box(w, 0.07, 0.15, 0, h / 2 - 0.035, 0), o.band ?? 1)];
  const lh = h - 0.07;
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - o.top);
    parts.push(cyl(o.top, o.bottom, lh, 6, x, h / 2 - 0.07 - lh / 2, 0));
    if (o.cuff) parts.push(shade(cyl(o.bottom * 0.92, o.bottom * 0.92, 0.06, 6, x, -h / 2 + 0.03, 0), 0.8));
    if (o.seam) parts.push(shade(box(0.006, lh - 0.02, 0.006, x, h / 2 - 0.07 - lh / 2, (o.top + o.bottom) / 2), 0.7));
    if (o.cargo) parts.push(shade(box(0.05, 0.13, 0.1, x + s * (o.top + 0.02), 0.02, 0), 0.85));
  }
  if (o.fly) parts.push(shade(box(0.012, 0.12, 0.006, 0.02, h / 2 - 0.12, 0.075), 0.7));
  return merge(...parts);
}
const dress = (h: number, rt: number, rb: number, sleeve: Garment['sleeve'], neck?: Garment['neck'], front?: Garment['front'], belt = false): G =>
  merge(cyl(rt, rb, h, 8, 0, 0, 0), garment({ w: rt * 2, h: 0.22, d: 0.1, sleeve, neck, front }).translate(0, h / 2 - 0.11, 0), ...(belt ? [shade(cyl(rt + 0.01, rt + 0.01, 0.04, 8, 0, h / 2 - 0.25, 0, true), 0.6)] : []));
export interface SkirtOpts { band?: number; pleats?: number; slit?: boolean; wrap?: boolean }
const skirt = (h: number, rt: number, rb: number, seg = 8, o: SkirtOpts = {}): G => {
  const parts = [cyl(rt, rb, h, seg), shade(cyl(rt + 0.006, rt + 0.006, 0.04, seg, 0, h / 2 - 0.02, 0, true), o.band ?? 0.85)];
  if (o.pleats) for (let i = 0; i < o.pleats; i++) parts.push(shade(box(0.006, h - 0.03, 0.006).translate(0, 0, (rt + rb) / 2 + 0.002).rotateY((i * Math.PI * 2) / o.pleats + 0.2), 0.75));
  if (o.slit) parts.push(shade(box(0.012, h * 0.45, 0.006, 0.02, -h / 2 + h * 0.22, rb * 0.92), 0.5));
  if (o.wrap) parts.push(shade(box(0.11, h - 0.02, 0.01, 0.06, 0, rb * 0.88, 0.06), 0.9));
  return merge(...parts);
};
/** Sole (dark) + heel counter + toe box; the shoe points +z, origin centred on the SHAPE_H box. */
const shoe = (len: number, soleH: number, upperH: number, h: number, toe = true, lace = false): G => {
  const parts = [shade(box(0.11, soleH, len, 0, -h / 2 + soleH / 2, 0), 0.55), box(0.1, upperH, len * 0.55, 0, -h / 2 + soleH + upperH / 2, -len * 0.2)];
  if (toe) parts.push(box(0.095, upperH * 0.55, len * 0.42, 0, -h / 2 + soleH + upperH * 0.28, len * 0.28));
  if (lace) parts.push(shade(box(0.04, 0.006, len * 0.3, 0, -h / 2 + soleH + upperH + 0.003, 0.02), 0.6));
  return merge(...parts);
};

const H = SHAPE_H;
export type Spec =
  | ({ kind: 'garment' } & Garment)
  | ({ kind: 'legs' } & Legs)
  | { kind: 'dress'; h: number; rt: number; rb: number; sleeve: Garment['sleeve']; neck?: Garment['neck']; front?: Garment['front']; belt?: boolean }
  | { kind: 'skirt'; h: number; rt: number; rb: number; seg: number; opts?: SkirtOpts }
  | { kind: 'custom'; build: () => G };
/** Every shape's recipe (fitting.ts tailors the garment / legs / dress / skirt ones onto the human figure from the same numbers). */
export const SPEC: Record<ShapeId, Spec> = {
  // ---- tops ----
  tee: { kind: 'garment', w: 0.46, h: H.tee, d: 0.07, sleeve: 'short', neck: 'crew' },
  'tee-v': { kind: 'garment', w: 0.46, h: H['tee-v'], d: 0.07, sleeve: 'short', neck: 'v' },
  'tee-long': { kind: 'garment', w: 0.46, h: H['tee-long'], d: 0.07, sleeve: 'long', neck: 'crew', sleeveW: 0.11 },
  tank: { kind: 'garment', w: 0.38, h: H.tank, d: 0.06, sleeve: 'strap' },
  crop: { kind: 'garment', w: 0.42, h: H.crop, d: 0.06, sleeve: 'short', neck: 'crew', hem: 'rib' },
  'tee-oversized': { kind: 'garment', w: 0.6, h: H['tee-oversized'], d: 0.09, sleeve: 'short', neck: 'crew', sleeveW: 0.2 },
  polo: { kind: 'garment', w: 0.46, h: H.polo, d: 0.07, sleeve: 'short', neck: 'polo', front: 'buttons' },
  'polo-long': { kind: 'garment', w: 0.46, h: H['polo-long'], d: 0.07, sleeve: 'long', neck: 'polo', front: 'buttons', sleeveW: 0.12, hem: 'rib' },
  shirt: { kind: 'garment', w: 0.46, h: H.shirt, d: 0.07, sleeve: 'long', neck: 'polo', front: 'placket', pocket: 'chest', sleeveW: 0.12 },
  'shirt-short': { kind: 'garment', w: 0.48, h: H['shirt-short'], d: 0.07, sleeve: 'short', neck: 'polo', front: 'placket', pocket: 'chest', sleeveW: 0.15 },
  'shirt-band': { kind: 'garment', w: 0.46, h: H['shirt-band'], d: 0.07, sleeve: 'long', neck: 'band', front: 'placket', sleeveW: 0.12 },
  'shirt-camp': { kind: 'garment', w: 0.5, h: H['shirt-camp'], d: 0.07, sleeve: 'short', neck: 'camp', front: 'buttons', pocket: 'chest', sleeveW: 0.16 },
  blouse: { kind: 'garment', w: 0.44, h: H.blouse, d: 0.07, sleeve: 'puff', neck: 'band', sleeveW: 0.12 },
  hoodie: { kind: 'garment', w: 0.5, h: H.hoodie, d: 0.1, sleeve: 'long', neck: 'hood', pocket: 'kangaroo', hem: 'rib', sleeveW: 0.15 },
  'hoodie-zip': { kind: 'garment', w: 0.5, h: H['hoodie-zip'], d: 0.1, sleeve: 'long', neck: 'hood', front: 'zip', pocket: 'side2', hem: 'rib', sleeveW: 0.15 },
  sweatshirt: { kind: 'garment', w: 0.5, h: H.sweatshirt, d: 0.1, sleeve: 'long', neck: 'crew', hem: 'rib', sleeveW: 0.15 },
  'quarter-zip': { kind: 'garment', w: 0.5, h: H['quarter-zip'], d: 0.1, sleeve: 'long', neck: 'stand', front: 'halfzip', hem: 'rib', sleeveW: 0.15 },
  sweater: { kind: 'garment', w: 0.48, h: H.sweater, d: 0.09, sleeve: 'long', neck: 'crew', hem: 'rib', sleeveW: 0.14 },
  'knit-v': { kind: 'garment', w: 0.48, h: H['knit-v'], d: 0.09, sleeve: 'long', neck: 'v', hem: 'rib', sleeveW: 0.14 },
  turtleneck: { kind: 'garment', w: 0.46, h: H.turtleneck, d: 0.09, sleeve: 'long', neck: 'turtle', hem: 'rib', sleeveW: 0.13 },
  mockneck: { kind: 'garment', w: 0.48, h: H.mockneck, d: 0.09, sleeve: 'long', neck: 'mock', hem: 'rib', sleeveW: 0.14 },
  cardigan: { kind: 'garment', w: 0.48, h: H.cardigan, d: 0.09, sleeve: 'long', neck: 'v', front: 'buttons', pocket: 'side2', hem: 'rib', sleeveW: 0.14 },
  'knit-vest': { kind: 'garment', w: 0.44, h: H['knit-vest'], d: 0.08, sleeve: 'none', neck: 'v', hem: 'rib' },
  // ---- outerwear ----
  parka: { kind: 'garment', w: 0.52, h: H.parka, d: 0.1, sleeve: 'long', neck: 'hood', front: 'zip', pocket: 'side2', sleeveW: 0.15 },
  'uv-zip': { kind: 'garment', w: 0.48, h: H['uv-zip'], d: 0.08, sleeve: 'long', neck: 'hood', front: 'zip', hem: 'rib', sleeveW: 0.13 },
  bomber: { kind: 'garment', w: 0.54, h: H.bomber, d: 0.12, sleeve: 'long', neck: 'stand', front: 'zip', pocket: 'side2', hem: 'rib', sleeveW: 0.17 },
  fleece: { kind: 'garment', w: 0.52, h: H.fleece, d: 0.12, sleeve: 'long', neck: 'stand', front: 'zip', pocket: 'chest', sleeveW: 0.16 },
  down: { kind: 'garment', w: 0.52, h: H.down, d: 0.14, sleeve: 'long', neck: 'stand', front: 'zip', quilt: 4, sleeveW: 0.17 },
  'down-long': { kind: 'garment', w: 0.56, h: H['down-long'], d: 0.16, sleeve: 'long', neck: 'hood', front: 'zip', quilt: 5, pocket: 'side2', sleeveW: 0.18 },
  'puffer-vest': { kind: 'garment', w: 0.5, h: H['puffer-vest'], d: 0.14, sleeve: 'none', neck: 'stand', front: 'zip', quilt: 4 },
  blazer: { kind: 'garment', w: 0.5, h: H.blazer, d: 0.09, sleeve: 'long', neck: 'lapel', front: 'buttons', pocket: 'side2', sleeveW: 0.13 },
  trench: { kind: 'garment', w: 0.54, h: H.trench, d: 0.1, sleeve: 'long', neck: 'lapel', front: 'double', hem: 'belt', pocket: 'side2', sleeveW: 0.14 },
  coach: { kind: 'garment', w: 0.52, h: H.coach, d: 0.09, sleeve: 'long', neck: 'camp', front: 'buttons', pocket: 'side2', sleeveW: 0.15 },
  'denim-jacket': { kind: 'garment', w: 0.5, h: H['denim-jacket'], d: 0.09, sleeve: 'long', neck: 'polo', front: 'buttons', pocket: 'chest2', hem: 'rib', sleeveW: 0.14 },
  'wool-coat': { kind: 'garment', w: 0.54, h: H['wool-coat'], d: 0.11, sleeve: 'long', neck: 'lapel', front: 'buttons', pocket: 'side2', sleeveW: 0.15 },
  padded: { kind: 'garment', w: 0.56, h: H.padded, d: 0.16, sleeve: 'long', neck: 'hood', front: 'zip', pocket: 'side2', sleeveW: 0.18 },
  // ---- bags & accessories ----
  tote: { kind: 'custom', build: () => merge(box(0.36, 0.36, 0.1, 0, -0.06, 0), shade(box(0.02, 0.12, 0.02, -0.1, 0.18, 0), 0.7), shade(box(0.02, 0.12, 0.02, 0.1, 0.18, 0), 0.7), shade(box(0.22, 0.02, 0.02, 0, 0.23, 0), 0.7)) },
  'round-bag': { kind: 'custom', build: () => merge(cyl(0.12, 0.12, 0.07, 10, 0, -0.03, 0).rotateX(Math.PI / 2), shade(box(0.015, 0.14, 0.015, -0.1, 0.07, 0), 0.6), shade(box(0.015, 0.14, 0.015, 0.1, 0.07, 0), 0.6), shade(box(0.215, 0.015, 0.015, 0, 0.14, 0), 0.6), shade(box(0.2, 0.012, 0.004, 0, -0.03, 0.037), 0.5)) },
  backpack: { kind: 'custom', build: () => merge(box(0.3, 0.4, 0.15, 0, -0.02, 0), box(0.3, 0.1, 0.16, 0, 0.17, -0.005), shade(box(0.06, 0.34, 0.015, -0.08, -0.05, -0.08), 0.7), shade(box(0.06, 0.34, 0.015, 0.08, -0.05, -0.08), 0.7), shade(box(0.22, 0.12, 0.012, 0, -0.1, 0.08), 0.85)) },
  crossbody: { kind: 'custom', build: () => merge(box(0.22, 0.14, 0.07, 0, -0.05, 0), shade(box(0.22, 0.05, 0.075, 0, 0.03, 0), 0.85), shade(box(0.012, 0.12, 0.012, -0.1, 0.07, 0), 0.6), shade(box(0.012, 0.12, 0.012, 0.1, 0.07, 0), 0.6), shade(box(0.21, 0.012, 0.012, 0, 0.125, 0), 0.6)) },
  cap: { kind: 'custom', build: () => merge(dome(0.11, 0, -0.07, 0, 7), shade(box(0.16, 0.012, 0.11, 0, -0.065, 0.13), 0.85)) },
  'bucket-hat': { kind: 'custom', build: () => merge(cyl(0.1, 0.11, 0.1, 8, 0, -0.03, 0), shade(cyl(0.17, 0.17, 0.012, 8, 0, -0.075, 0), 0.9)) },
  beanie: { kind: 'custom', build: () => merge(dome(0.11, 0, -0.04, 0, 7).scale(1, 1.3, 1), shade(cyl(0.115, 0.115, 0.07, 7, 0, -0.075, 0, true), 0.85)) },
  scarf: { kind: 'custom', build: () => merge(new THREE.TorusGeometry(0.1, 0.045, 5, 8).rotateX(Math.PI / 2), shade(box(0.05, 0.015, 0.06, 0.1, 0.03, 0), 0.8)) },
  sunglasses: { kind: 'custom', build: () => merge(shade(cyl(0.032, 0.032, 0.012, 8, -0.04, 0, 0).rotateX(Math.PI / 2), 0.6), shade(cyl(0.032, 0.032, 0.012, 8, 0.04, 0, 0).rotateX(Math.PI / 2), 0.6), box(0.02, 0.008, 0.008, 0, 0.01, 0), box(0.008, 0.008, 0.12, -0.075, 0.01, -0.06), box(0.008, 0.008, 0.12, 0.075, 0.01, -0.06)) },
  umbrella: { kind: 'custom', build: () => merge(cyl(0.035, 0.03, 0.24, 6, 0, 0.03, 0), shade(box(0.03, 0.06, 0.03, 0, -0.12, 0), 0.5), shade(box(0.08, 0.025, 0.01, 0, 0.03, 0.036), 0.6)) },
  // ---- bottoms ----
  pants: { kind: 'legs', w: 0.34, h: H.pants, top: 0.075, bottom: 0.055, seam: true, fly: true },
  chinos: { kind: 'legs', w: 0.34, h: H.chinos, top: 0.08, bottom: 0.065, band: 0.9, fly: true },
  wide: { kind: 'legs', w: 0.4, h: H.wide, top: 0.09, bottom: 0.11, band: 0.9 },
  straight: { kind: 'legs', w: 0.34, h: H.straight, top: 0.075, bottom: 0.075, seam: true, fly: true },
  cargo: { kind: 'legs', w: 0.36, h: H.cargo, top: 0.085, bottom: 0.08, cargo: true, band: 0.9 },
  jogger: { kind: 'legs', w: 0.34, h: H.jogger, top: 0.085, bottom: 0.05, cuff: true, band: 0.8 },
  sweatpants: { kind: 'legs', w: 0.36, h: H.sweatpants, top: 0.09, bottom: 0.08, band: 0.8 },
  bootcut: { kind: 'legs', w: 0.34, h: H.bootcut, top: 0.07, bottom: 0.1, seam: true, fly: true },
  bermuda: { kind: 'legs', w: 0.36, h: H.bermuda, top: 0.09, bottom: 0.09, band: 0.9, fly: true },
  shorts: { kind: 'legs', w: 0.36, h: H.shorts, top: 0.09, bottom: 0.095, band: 0.85 },
  cycling: { kind: 'legs', w: 0.3, h: H.cycling, top: 0.07, bottom: 0.06, band: 0.8 },
  'jeans-wide': { kind: 'legs', w: 0.4, h: H['jeans-wide'], top: 0.09, bottom: 0.11, band: 0.8, seam: true, fly: true },
  'jeans-straight': { kind: 'legs', w: 0.34, h: H['jeans-straight'], top: 0.078, bottom: 0.078, band: 0.8, seam: true, fly: true, cuff: true },
  // ---- dresses & skirts ----
  'dress-shirt': { kind: 'dress', h: H['dress-shirt'], rt: 0.17, rb: 0.26, sleeve: 'short', neck: 'polo', front: 'placket', belt: true },
  'dress-aline': { kind: 'custom', build: () => dress(H['dress-aline'], 0.16, 0.32, 'cap', 'crew') },
  'dress-maxi': { kind: 'dress', h: H['dress-maxi'], rt: 0.16, rb: 0.36, sleeve: 'short', neck: 'v' },
  'dress-slip': { kind: 'custom', build: () => dress(H['dress-slip'], 0.15, 0.24, 'strap') },
  'skirt-pleated': { kind: 'skirt', h: H['skirt-pleated'], rt: 0.16, rb: 0.27, seg: 12, opts: { pleats: 10 } },
  'skirt-aline': { kind: 'skirt', h: H['skirt-aline'], rt: 0.16, rb: 0.27, seg: 8 },
  'skirt-flare': { kind: 'skirt', h: H['skirt-flare'], rt: 0.15, rb: 0.38, seg: 10 },
  'skirt-mini': { kind: 'skirt', h: H['skirt-mini'], rt: 0.16, rb: 0.19, seg: 8, opts: { band: 0.8 } },
  'skirt-tennis': { kind: 'skirt', h: H['skirt-tennis'], rt: 0.16, rb: 0.26, seg: 12, opts: { pleats: 8, band: 0.9 } },
  'skirt-denim': { kind: 'custom', build: () => merge(skirt(H['skirt-denim'], 0.16, 0.22, 8, { band: 0.8 }), shade(box(0.012, H['skirt-denim'] - 0.08, 0.006, 0, -0.03, 0.19), 0.6)) },
  'skirt-wrap': { kind: 'skirt', h: H['skirt-wrap'], rt: 0.16, rb: 0.26, seg: 8, opts: { wrap: true } },
  'skirt-midi': { kind: 'skirt', h: H['skirt-midi'], rt: 0.16, rb: 0.3, seg: 10, opts: { slit: true } },
  // ---- underwear / homewear ----
  bra: { kind: 'custom', build: () => merge(dome(0.065, -0.07, -0.05, 0), dome(0.065, 0.07, -0.05, 0), shade(box(0.3, 0.025, 0.02, 0, -0.055, 0), 0.85)) },
  briefs: { kind: 'custom', build: () => merge(box(0.26, H.briefs, 0.2), shade(box(0.26, H.briefs + 0.004, 0.03, 0, 0, -0.085), 0.8)) },
  bratop: { kind: 'custom', build: () => merge(box(0.3, 0.3, 0.05, 0, -0.06, 0), shade(box(0.03, 0.14, 0.02, -0.09, 0.14, 0), 0.85), shade(box(0.03, 0.14, 0.02, 0.09, 0.14, 0), 0.85)) },
  pyjama: { kind: 'custom', build: () => merge(garment({ w: 0.42, h: 0.42, d: 0.07, sleeve: 'long', neck: 'camp', front: 'buttons', sleeveW: 0.11 }).translate(0, 0.24, 0), box(0.12, 0.42, 0.11, -0.085, -0.23, 0.02), box(0.12, 0.42, 0.11, 0.085, -0.23, 0.02)) },
  'lounge-pants': { kind: 'legs', w: 0.36, h: H['lounge-pants'], top: 0.095, bottom: 0.11, band: 0.85 },
  // ---- footwear ----
  sneaker: { kind: 'custom', build: () => shoe(0.3, 0.035, 0.09, H.sneaker, true, true) },
  loafer: { kind: 'custom', build: () => shoe(0.3, 0.02, 0.065, H.loafer, false) },
  sandal: { kind: 'custom', build: () => merge(shade(box(0.11, 0.02, 0.28, 0, -0.02, 0), 0.7), box(0.11, 0.015, 0.035, 0, 0, 0.03), box(0.11, 0.015, 0.035, 0, 0, -0.05)) },
  slipper: { kind: 'custom', build: () => merge(shade(box(0.11, 0.02, 0.28, 0, -0.03, 0), 0.7), box(0.11, 0.055, 0.12, 0, 0.0075, 0.06)) },
  boot: { kind: 'custom', build: () => merge(shade(box(0.11, 0.03, 0.3, 0, -H.boot / 2 + 0.015, 0), 0.5), box(0.1, 0.07, 0.3, 0, -H.boot / 2 + 0.065, 0), box(0.1, 0.12, 0.13, 0, H.boot / 2 - 0.06, -0.06)) },
  'socks-ankle': { kind: 'custom', build: () => merge(box(0.07, 0.04, 0.2, 0, -0.03, 0.02), shade(box(0.07, 0.07, 0.07, 0, 0.015, -0.045), 0.85)) },
  'socks-crew': { kind: 'custom', build: () => merge(box(0.07, 0.04, 0.2, 0, -0.08, 0.02), shade(box(0.07, 0.17, 0.07, 0, 0.015, -0.045), 0.85)) },
  // ---- folded slabs ----
  'fold-top': { kind: 'custom', build: () => merge(box(0.34, H['fold-top'], 0.26), shade(cyl(0.06, 0.06, 0.012, 8, 0, H['fold-top'] / 2, -0.07, true), 0.8), shade(box(0.3, 0.004, 0.006, 0, H['fold-top'] / 2, 0.02), 0.85)) },
  'fold-bottom': { kind: 'custom', build: () => merge(box(0.26, H['fold-bottom'], 0.34), shade(box(0.006, 0.004, 0.3, 0, H['fold-bottom'] / 2, 0), 0.8), shade(box(0.26, 0.004, 0.03, 0, H['fold-bottom'] / 2, -0.15), 0.85)) },
};
const BUILD = (sp: Spec): G => sp.kind === 'garment' ? garment(sp) : sp.kind === 'legs' ? legs(sp) : sp.kind === 'dress' ? dress(sp.h, sp.rt, sp.rb, sp.sleeve, sp.neck, sp.front, sp.belt) : sp.kind === 'skirt' ? skirt(sp.h, sp.rt, sp.rb, sp.seg, sp.opts) : sp.build();
/** The hanger drawn over every hanging item (one extra InstancedMesh, fixed colour). */
export const HANGER: G = merge(shade(box(0.012, 0.07, 0.012, 0, 0.055, 0), 0.4), shade(box(0.42, 0.014, 0.014, 0, 0.02, 0), 0.4));
/** Standing items turned on their shelf so the silhouette reads (shoes three-quarter on). */
const STAND_TURN: Partial<Record<ShapeId, number>> = { sneaker: 0.95, loafer: 0.95, sandal: 0.95, slipper: 0.95, boot: 0.95, 'socks-ankle': 0.7, 'socks-crew': 0.7, umbrella: 0.4 };

const cache = new Map<ShapeId, G>();
/** Planar UVs in metres from the position, by face direction (1 unit = 0.5 m ≈ one garment face), so a pattern keeps the
 *  same scale on a sleeve cylinder, a torso box and a tailored garment alike. */
export function metricUV(g: G): G {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const [u, v] = ny > nx && ny > nz ? [x, z] : nx > nz ? [z, y] : [x, y];
    uv[i * 2] = u * 2; uv[i * 2 + 1] = v * 2;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
/** The shared geometry of a shape (built once; every shape carries a `color` attribute and metric UVs). */
export function shapeGeometry(id: ShapeId): G {
  let g = cache.get(id);
  if (!g) {
    g = metricUV(BUILD(SPEC[id]));
    if (!g.getAttribute('color')) shade(g, 1);
    cache.set(id, g);
  }
  return g;
}
export const SHAPE_IDS = Object.keys(SPEC) as ShapeId[];
export const triangleCount = (g: G): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

// ---- the one item material: instance colour × vertex shade, per-instance roughness + pattern --------------------------
const ROUGH: Record<Finish, number> = { cotton: 0.92, denim: 0.96, knit: 1, shiny: 0.45, print: 0.9 };
/** Per-instance attributes an item mesh carries: iPattern (tile, −1 none), iColour2 (rgb), iScale (repeats), iRough. */
export function itemAttributes(g: G, n: number): { pattern: THREE.InstancedBufferAttribute; colour2: THREE.InstancedBufferAttribute; scale: THREE.InstancedBufferAttribute; rough: THREE.InstancedBufferAttribute } {
  const a = {
    pattern: new THREE.InstancedBufferAttribute(new Float32Array(n).fill(-1), 1),
    colour2: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
    scale: new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1),
    rough: new THREE.InstancedBufferAttribute(new Float32Array(n).fill(0.9), 1),
  };
  g.setAttribute('iPattern', a.pattern);
  g.setAttribute('iColour2', a.colour2);
  g.setAttribute('iScale', a.scale);
  g.setAttribute('iRough', a.rough);
  return a;
}
const col = new THREE.Color();
/** Write item `it` into instance `i` of `mesh` (colour, pattern, roughness). */
export function setInstanceItem(mesh: THREE.InstancedMesh, i: number, it: CatalogItem): void {
  mesh.setColorAt(i, col.set(it.colour.hex));
  const g = mesh.geometry;
  const p = g.getAttribute('iPattern') as THREE.InstancedBufferAttribute, c2 = g.getAttribute('iColour2') as THREE.InstancedBufferAttribute, sc = g.getAttribute('iScale') as THREE.InstancedBufferAttribute, r = g.getAttribute('iRough') as THREE.InstancedBufferAttribute;
  p.setX(i, it.pattern ? patternIndex(it.pattern) : -1);
  if (it.pattern) { col.set(it.colour2?.hex ?? '#ffffff'); c2.setXYZ(i, col.r, col.g, col.b); sc.setX(i, it.patternScale ?? PATTERN_SCALE[it.pattern]); }
  r.setX(i, ROUGH[it.finish] ?? 0.9);
  for (const a of [p, c2, sc, r]) a.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
let shared: THREE.MeshStandardMaterial | null = null;
/** The one material every item mesh shares (one shader program for the whole catalog). */
export function itemMaterial(): THREE.MeshStandardMaterial {
  if (shared) return shared;
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9 });
  m.defines = { USE_UV: '' };
  const atlas = patternAtlas() ?? new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.patternAtlas = { value: atlas };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float iPattern; attribute vec3 iColour2; attribute float iScale; attribute float iRough;\nvarying float vPattern; varying vec3 vColour2; varying float vScale; varying float vRough; varying float vShade;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPattern = iPattern; vColour2 = iColour2; vScale = iScale; vRough = iRough; vShade = color.r;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D patternAtlas; varying float vPattern; varying vec3 vColour2; varying float vScale; varying float vRough; varying float vShade;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
\tif (vPattern >= 0.0) {
\t\tvec2 t = clamp(fract(vUv * vScale), 0.012, 0.988);
\t\tvec2 tile = vec2(mod(vPattern, ${TILES}.0), ${TILES - 1}.0 - floor(vPattern / ${TILES}.0));
\t\tfloat m = texture2D(patternAtlas, (tile + t) / ${TILES}.0).r;
\t\tdiffuseColor.rgb = mix(diffuseColor.rgb, vColour2 * vShade, m);
\t}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = vRough;');
  };
  m.customProgramCacheKey = () => 'cetiqlo-items';
  return (shared = m);
}

export interface ItemsHandle {
  group: THREE.Group;
  meshes: THREE.InstancedMesh[];
  /** id → the item's centre (= catalog shelf), room-local. */
  anchors: Map<string, THREE.Vector3>;
  setVisible(id: string, v: boolean): void;
  triangles: number;
}
const HANGER_MAT = new THREE.MeshStandardMaterial({ color: '#d8d8dc', vertexColors: true, roughness: 0.4, metalness: 0.6 });
/** Every item at its catalog shelf pose: one InstancedMesh per display shape (all sharing itemMaterial). */
export function buildItems(items: readonly CatalogItem[]): ItemsHandle {
  const group = new THREE.Group();
  group.name = 'items';
  const groups = new Map<ShapeId, CatalogItem[]>();
  for (const it of items) {
    const k = displayShape(it.shape, it.display);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const meshes: THREE.InstancedMesh[] = [], anchors = new Map<string, THREE.Vector3>(), where = new Map<string, { mesh: THREE.InstancedMesh; i: number }>();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  let triangles = 0;
  const mat = itemMaterial();
  for (const [shape, list] of groups) {
    const geo = shapeGeometry(shape).clone(); // instanced attributes live on the geometry: one copy per mesh
    itemAttributes(geo, list.length);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.name = shape;
    list.forEach((it, i) => {
      const p = new THREE.Vector3(it.shelf.x, it.shelf.y, it.shelf.z);
      m.compose(p, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, it.shelf.yaw + (STAND_TURN[shape] ?? 0)), s);
      mesh.setMatrixAt(i, m);
      setInstanceItem(mesh, i, it);
      anchors.set(it.id, p);
      where.set(it.id, { mesh, i });
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false; // ponytail: one bounding sphere per shape across both floors would be wrong anyway; the store is small
    meshes.push(mesh);
    group.add(mesh);
    triangles += triangleCount(geo) * list.length;
  }
  const hung = items.filter((it) => it.display === 'hang');
  if (hung.length) {
    const hangers = new THREE.InstancedMesh(HANGER, HANGER_MAT, hung.length);
    hangers.name = 'hangers';
    hung.forEach((it, i) => { m.compose(new THREE.Vector3(it.shelf.x, it.shelf.y + SHAPE_H[it.shape] / 2 + 0.01, it.shelf.z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, it.shelf.yaw), s); hangers.setMatrixAt(i, m); });
    hangers.matrixAutoUpdate = false;
    hangers.frustumCulled = false;
    meshes.push(hangers);
    group.add(hangers);
    triangles += triangleCount(HANGER) * hung.length;
  }
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group, meshes, anchors, triangles,
    setVisible(id, v) {
      const w = where.get(id);
      if (!w) return;
      if (v) { const it = items.find((it) => it.id === id)!; m.compose(anchors.get(id)!, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, it.shelf.yaw + (STAND_TURN[displayShape(it.shape, it.display)] ?? 0)), s); w.mesh.setMatrixAt(w.i, m); }
      else w.mesh.setMatrixAt(w.i, hidden);
      w.mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** A single-instance mesh of an item in its colour + pattern: its own shape, or a tailored geometry (the mannequin's clothes). */
export function itemMesh(item: CatalogItem, geometry?: G): THREE.InstancedMesh {
  const geo = (geometry ?? shapeGeometry(item.shape)).clone();
  itemAttributes(geo, 1);
  const mesh = new THREE.InstancedMesh(geo, itemMaterial(), 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  setInstanceItem(mesh, 0, item);
  mesh.frustumCulled = false;
  return mesh;
}
