// CETIQLO merchandise: one low-poly geometry per ShapeId (≤ 200 triangles, centred at the origin, front toward +z, heights
// from shared layout SHAPE_H; every ShapeId is a distinct silhouette: length, sleeves, collar, hood, pockets, hem), built once
// and drawn as ONE InstancedMesh per display shape with ONE shared material. Per instance: colour (`instanceColor`),
// roughness, and a pattern (patterns.ts atlas tile + second colour + repeat) read by a small onBeforeCompile addition —
// so patterns, washes and finishes cost no extra draw calls. Details (zippers, plackets, soles, ribs) are small
// uniformly-shaded parts baked into the shape (per-vertex paint on 8-vertex boxes would only interpolate).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type CatalogItem, type Finish, GARMENT_SIZES as Z, SHAPE_H, type ShapeId, displayShape } from '@race/shared/cetiqlo';
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

export interface Garment {
  /** Real sizes (m): chest width flat, body length, shoulder width; sleeve length by kind. */
  w: number; h: number; d: number; shoulder?: number;
  sleeve: 'none' | 'cap' | 'short' | 'long' | 'strap' | 'puff' | 'rolled';
  sleeveLen?: number; sleeveW?: number; sleeveFlare?: number;
  neck?: 'crew' | 'v' | 'turtle' | 'mock' | 'polo' | 'shirt' | 'band' | 'camp' | 'hood' | 'lapel' | 'scoop' | 'stand' | 'rib';
  /** Front: button placket (n buttons), zip (tape + pull), half zip, open front (cardigan), double-breasted, snap row. */
  front?: 'placket' | 'zip' | 'halfzip' | 'open' | 'double' | 'buttons' | 'snaps';
  buttons?: number;
  pocket?: 'kangaroo' | 'chest' | 'chest2' | 'side2' | 'flap2' | 'flapLow2' | 'breast' | 'chestFlap2';
  hem?: 'rib' | 'belt' | 'drawcord' | 'straight';
  /** Puffy baffles (count), hood drawstrings, epaulettes, storm flap, yoke seam line, elbow bend, drop shoulder, knit ribbing. */
  quilt?: number; drawstrings?: boolean; epaulettes?: boolean; stormFlap?: boolean; yoke?: boolean; dropShoulder?: boolean; knit?: boolean; gathers?: boolean;
  /** Hem flare (A-line / bell, 0..0.2) and drape wave amplitude at the hem (m). */
  flare?: number; drape?: number;
}
/** A torso with FORM: subdivided box, shoulders sloping to the hanger, slight bell at the hem, a drape wave along the
 *  hem, optional baffle puff (down) and knit ribbing (vertex shade bands). `lod` = plain 1-segment box. */
function torso(o: Garment, lod: boolean): G {
  const { w, h, d } = o;
  const g = lod ? new THREE.BoxGeometry(w, h, d) : new THREE.BoxGeometry(w, h, d, 4, 8, 1);
  if (lod) return g;
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const flare = o.flare ?? 0.06, drape = o.drape ?? 0.012, puffN = o.quilt ?? 0;
  const shade = new Float32Array(p.count * 3).fill(1);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (h / 2 - y) / h; // 0 at the shoulder line → 1 at the hem
    const side = Math.abs(n.getX(i)) > 0.5;
    let nx = x * (1 + flare * t), ny = y, nz = z;
    if (t < 0.02) ny -= 0.025 * Math.abs(x) / (w / 2); // shoulders slope down from the neck
    if (!side && Math.abs(n.getZ(i)) > 0.5) {
      nz += Math.sign(z) * drape * Math.sin(x * 14) * t * t; // drape wave strongest at the hem
      if (puffN) nz += Math.sign(z) * 0.02 * Math.abs(Math.sin(t * Math.PI * puffN)); // rounded baffles
      else nz += Math.sign(z) * 0.006 * Math.sin(y * 9 + x * 5); // soft fabric creases
    }
    p.setXYZ(i, nx, ny, nz);
    if (o.knit && !side) { const k = 0.93 + 0.07 * (Math.round(x * 40) % 2 === 0 ? 1 : 0); shade[i * 3] = shade[i * 3 + 1] = shade[i * 3 + 2] = k; } // fine vertical ribs
    if (puffN && !side) { const k = 0.82 + 0.18 * Math.abs(Math.sin(t * Math.PI * puffN)); shade[i * 3] = shade[i * 3 + 1] = shade[i * 3 + 2] = k; } // baffle seams darker
  }
  g.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  g.computeVertexNormals();
  return g;
}
/** A sleeve hanging from the shoulder: one tube (short) or two with an elbow bend (long); `rolled` = short with a cuff roll. */
function sleeve(o: Garment, sgn: number, lod: boolean): G[] {
  const { w, h } = o, parts: G[] = [];
  const sw = o.sleeveW ?? 0.14, kind = o.sleeve;
  const len = o.sleeveLen ?? { none: 0, cap: 0.08, short: 0.2, long: 0.62, strap: 0, puff: 0.22, rolled: 0.26 }[kind];
  if (!len) return parts;
  const shX = sgn * ((o.shoulder ?? w) / 2 - 0.01), shY = h / 2 - 0.035 - (o.dropShoulder ? 0.05 : 0), ang = 0.28;
  const r0 = sw / 2 * (kind === 'puff' ? 1.4 : 1), r1 = sw / 2 * (o.sleeveFlare ?? 0.9);
  const seg = lod ? 5 : 7;
  if (kind === 'long' && !lod) {
    const up = len * 0.55, lo = len * 0.45;
    parts.push(new THREE.CylinderGeometry(r0, (r0 + r1) / 2, up, seg, 1, true).translate(0, -up / 2, 0).rotateZ(sgn * ang).translate(shX, shY, 0));
    const ex = shX + sgn * Math.sin(ang) * up, ey = shY - Math.cos(ang) * up; // the elbow
    parts.push(new THREE.CylinderGeometry((r0 + r1) / 2, r1, lo, seg, 1, false).translate(0, -lo / 2, 0).rotateX(0.35).rotateZ(sgn * (ang - 0.1)).translate(ex, ey, 0)); // the forearm swings forward
    const wx = ex + sgn * Math.sin(ang - 0.1) * lo * Math.cos(0.35), wy = ey - Math.cos(ang - 0.1) * lo * Math.cos(0.35), wz = Math.sin(0.35) * lo;
    if (o.hem === 'rib' || o.neck === 'rib') parts.push(shade(new THREE.CylinderGeometry(r1 + 0.006, r1 + 0.006, 0.06, seg, 1, true).rotateX(0.35).rotateZ(sgn * (ang - 0.1)).translate(wx, wy + 0.03, wz), 0.72)); // ribbed cuff
    else if (o.neck === 'shirt' || o.neck === 'band' || o.neck === 'polo') { parts.push(shade(new THREE.CylinderGeometry(r1 + 0.004, r1 + 0.004, 0.06, seg, 1, true).rotateX(0.35).rotateZ(sgn * (ang - 0.1)).translate(wx, wy + 0.03, wz), 0.86)); parts.push(shade(box(0.014, 0.014, 0.01, wx + sgn * 0.0, wy + 0.03, wz + r1 + 0.002), 0.45)); } // buttoned cuff
    return parts;
  }
  const L = kind === 'long' ? len : len;
  parts.push(new THREE.CylinderGeometry(r0, r1, L, seg, 1, kind === 'long').translate(0, -L / 2, 0).rotateZ(sgn * ang).translate(shX, shY, 0));
  if (kind === 'rolled') parts.push(shade(new THREE.CylinderGeometry(r1 + 0.012, r1 + 0.012, 0.05, seg, 1, true).translate(0, -L + 0.025, 0).rotateZ(sgn * ang).translate(shX, shY, 0), 0.82));
  if (kind === 'short' && (o.neck === 'polo') && !lod) parts.push(shade(new THREE.CylinderGeometry(r1 + 0.004, r1 + 0.004, 0.03, seg, 1, true).translate(0, -L + 0.015, 0).rotateZ(sgn * ang).translate(shX, shY, 0), 0.8)); // ribbed polo cuff
  return parts;
}
const disc = (x: number, y: number, z: number, r = 0.011, s = 0.45): G => shade(new THREE.CylinderGeometry(r, r, 0.006, 6).rotateX(Math.PI / 2).translate(x, y, z), s);
/** Torso + sleeves + neck + front + pockets + hem + extras; origin = the garment's centre, top edge at +h/2, front +z. */
function garment(o: Garment, lod = false): G {
  const { w, h, d } = o, parts: G[] = [torso(o, lod)];
  const fz = d / 2 + 0.004, top = h / 2;
  for (const sgn of [-1, 1]) parts.push(...sleeve(o, sgn, lod));
  if (o.sleeve === 'strap') for (const sgn of [-1, 1]) parts.push(shade(box(0.03, 0.09, 0.02, sgn * 0.1, top - 0.045, 0), 0.9));
  if (o.sleeve === 'strap' || o.neck === 'scoop') parts.push(shade(box(0.16, 0.06, d + 0.004, 0, top - 0.03, 0), 0.4)); // the open neckline
  if (!lod) switch (o.neck) {
    case 'crew': case 'rib': parts.push(shade(cyl(0.1, 0.1, 0.035, 10, 0, top, 0, true), 0.78)); break;
    case 'v': parts.push(shade(cyl(0.1, 0.1, 0.02, 10, 0, top, 0, true), 0.78)); for (const sg of [-1, 1]) parts.push(shade(box(0.022, 0.19, 0.01, sg * 0.055, top - 0.085, fz, -sg * 0.5), 0.5)); break;
    case 'turtle': parts.push(shade(cyl(0.095, 0.105, 0.14, 10, 0, top + 0.05, 0, true), 0.85)); parts.push(shade(cyl(0.108, 0.108, 0.05, 10, 0, top + 0.1, 0, true), 0.78)); break; // rolled
    case 'mock': parts.push(shade(cyl(0.095, 0.1, 0.07, 10, 0, top + 0.025, 0, true), 0.85)); break;
    case 'stand': parts.push(shade(cyl(0.1, 0.095, 0.06, 10, 0, top + 0.02, 0, true), 0.9)); break;
    case 'band': parts.push(shade(cyl(0.098, 0.098, 0.035, 10, 0, top + 0.01, 0, true), 0.84)); break;
    case 'polo': parts.push(shade(cyl(0.098, 0.09, 0.04, 10, 0, top + 0.01, 0, true), 0.9)); for (const sg of [-1, 1]) parts.push(shade(box(0.09, 0.075, 0.012, sg * 0.055, top - 0.03, fz + 0.006, -sg * 0.6), 0.88)); break; // flat folded collar
    case 'shirt': parts.push(shade(cyl(0.1, 0.095, 0.045, 10, 0, top + 0.015, 0, true), 0.9)); for (const sg of [-1, 1]) { parts.push(shade(box(0.1, 0.085, 0.012, sg * 0.065, top - 0.03, fz + 0.006, -sg * 0.55), 0.9)); parts.push(shade(box(0.03, 0.03, 0.01, sg * 0.11, top - 0.075, fz + 0.008, -sg * 0.55), 0.9)); } break; // pointed collar + stand
    case 'camp': for (const sg of [-1, 1]) parts.push(shade(box(0.13, 0.1, 0.012, sg * 0.09, top - 0.045, fz + 0.006, -sg * 0.75), 0.9)); break;
    case 'lapel': for (const sg of [-1, 1]) { parts.push(shade(box(0.075, 0.3, 0.012, sg * 0.08, top - 0.17, fz + 0.006, -sg * 0.32), 0.85)); parts.push(shade(box(0.06, 0.05, 0.012, sg * 0.1, top - 0.04, fz + 0.007, -sg * 0.9), 0.85)); } break; // notch lapels
    case 'hood': { parts.push(new THREE.SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.1, 0.95).rotateX(-0.55).translate(0, top - 0.02, -d / 2 - 0.04)); if (o.drawstrings) for (const sg of [-1, 1]) { parts.push(shade(box(0.008, 0.16, 0.008, sg * 0.04, top - 0.14, fz + 0.006, sg * 0.12), 0.4)); parts.push(shade(box(0.012, 0.025, 0.012, sg * 0.055, top - 0.225, fz + 0.006), 0.3)); } break; }
    case 'scoop': break;
  }
  const len = h, mid = 0;
  if (!lod) switch (o.front) {
    case 'placket': parts.push(shade(box(0.028, len * 0.92, 0.008, 0, mid - len * 0.02, fz), 0.84)); for (let i = 0; i < (o.buttons ?? 6); i++) parts.push(disc(0, top - 0.1 - i * ((len * 0.82) / ((o.buttons ?? 6) - 1 || 1)), fz + 0.008)); break;
    case 'buttons': parts.push(shade(box(0.02, len * 0.9, 0.006, 0, mid - len * 0.02, fz - 0.001), 0.84)); for (let i = 0; i < (o.buttons ?? 3); i++) parts.push(disc(0, top - 0.12 - i * 0.15, fz + 0.007)); break;
    case 'zip': parts.push(shade(box(0.022, len * 0.94, 0.008, 0, mid - len * 0.02, fz), 0.55)); parts.push(shade(box(0.014, 0.035, 0.012, 0, top - 0.04, fz + 0.008), 0.3)); break; // tape + pull
    case 'halfzip': parts.push(shade(box(0.022, len * 0.32, 0.008, 0, top - len * 0.19, fz), 0.55)); parts.push(shade(box(0.014, 0.03, 0.012, 0, top - 0.04, fz + 0.008), 0.3)); break;
    case 'open': parts.push(shade(box(0.05, len * 0.92, 0.01, 0, mid - len * 0.02, fz), 0.45)); for (let i = 0; i < (o.buttons ?? 5); i++) parts.push(disc(-0.04, top - 0.14 - i * 0.11, fz + 0.008)); break;
    case 'double': parts.push(shade(box(0.02, len * 0.9, 0.006, 0.04, mid - len * 0.02, fz - 0.001), 0.84)); for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) parts.push(disc(sg * 0.075, top - 0.24 - i * 0.14, fz + 0.007, 0.015)); break;
    case 'snaps': parts.push(shade(box(0.024, len * 0.9, 0.008, 0, mid - len * 0.02, fz), 0.86)); for (let i = 0; i < 6; i++) parts.push(disc(0, top - 0.09 - i * ((len * 0.75) / 5), fz + 0.008, 0.009, 0.5)); break;
  }
  if (!lod) switch (o.pocket) {
    case 'kangaroo': parts.push(shade(box(0.32, 0.17, 0.014, 0, -top + 0.17, fz + 0.006), 0.88)); for (const sg of [-1, 1]) parts.push(shade(box(0.006, 0.17, 0.016, sg * 0.14, -top + 0.17, fz + 0.007, sg * 0.3), 0.6)); break;
    case 'chest': parts.push(shade(box(0.12, 0.12, 0.01, 0.13, top - 0.22, fz + 0.004), 0.88)); parts.push(shade(box(0.12, 0.006, 0.012, 0.13, top - 0.16, fz + 0.006), 0.6)); break;
    case 'chest2': for (const sg of [-1, 1]) parts.push(shade(box(0.12, 0.12, 0.01, sg * 0.13, top - 0.22, fz + 0.004), 0.88)); break;
    case 'chestFlap2': for (const sg of [-1, 1]) { parts.push(shade(box(0.12, 0.13, 0.01, sg * 0.13, top - 0.24, fz + 0.004), 0.88)); parts.push(shade(box(0.125, 0.04, 0.014, sg * 0.13, top - 0.165, fz + 0.007), 0.72)); parts.push(disc(sg * 0.13, top - 0.18, fz + 0.015, 0.008)); } break;
    case 'flap2': for (const sg of [-1, 1]) { parts.push(shade(box(0.14, 0.15, 0.012, sg * (w / 2 - 0.1), -top + 0.24, fz + 0.005), 0.88)); parts.push(shade(box(0.145, 0.045, 0.016, sg * (w / 2 - 0.1), -top + 0.33, fz + 0.008), 0.72)); parts.push(disc(sg * (w / 2 - 0.1), -top + 0.32, fz + 0.017, 0.008)); } break;
    case 'flapLow2': for (const sg of [-1, 1]) { parts.push(shade(box(0.15, 0.17, 0.012, sg * (w / 2 - 0.11), -top + 0.3, fz + 0.005), 0.88)); parts.push(shade(box(0.155, 0.05, 0.016, sg * (w / 2 - 0.11), -top + 0.4, fz + 0.008), 0.72)); } break;
    case 'side2': for (const sg of [-1, 1]) parts.push(shade(box(0.13, 0.014, 0.012, sg * (w / 2 - 0.1), -top + 0.26, fz + 0.006, sg * 0.25), 0.55)); break; // welts
    case 'breast': parts.push(shade(box(0.1, 0.012, 0.012, -0.13, top - 0.2, fz + 0.006), 0.55)); break;
  }
  if (!lod) {
    if (o.hem === 'rib') { parts.push(shade(box(w * (1 + (o.flare ?? 0.06)) + 0.012, 0.06, d + 0.014, 0, -top + 0.03, 0), 0.72)); parts.push(shade(box(w * (1 + (o.flare ?? 0.06)) + 0.014, 0.004, d + 0.016, 0, -top + 0.06, 0), 0.55)); }
    if (o.hem === 'straight') parts.push(shade(box(w * (1 + (o.flare ?? 0.06)) + 0.006, 0.012, d + 0.008, 0, -top + 0.006, 0), 0.8)); // double-fold hem
    if (o.hem === 'belt') { parts.push(shade(box(w + 0.03, 0.05, d + 0.03, 0, 0.02, 0), 0.6)); parts.push(shade(box(0.05, 0.06, 0.012, 0.0, 0.02, fz + 0.02), 0.35)); parts.push(shade(box(0.014, 0.3, 0.01, 0.07, -0.14, fz + 0.012), 0.6)); } // belt, buckle, hanging end
    if (o.hem === 'drawcord') for (const sg of [-1, 1]) parts.push(shade(box(0.008, 0.08, 0.008, sg * 0.03, -top + 0.03, fz + 0.004), 0.4));
    if (o.epaulettes) for (const sg of [-1, 1]) { parts.push(shade(box(0.11, 0.025, 0.05, sg * (w / 2 - 0.08), top + 0.012, 0, -sg * 0.1), 0.8)); parts.push(disc(sg * (w / 2 - 0.13), top + 0.03, 0.02, 0.008)); }
    if (o.stormFlap) parts.push(shade(box(0.16, 0.2, 0.012, 0.1, top - 0.17, fz + 0.006), 0.84));
    if (o.yoke) parts.push(shade(box(w + 0.006, 0.006, d + 0.008, 0, top - 0.14, 0), 0.6));
    if (o.gathers) for (let i = -2; i <= 2; i++) parts.push(shade(box(0.005, 0.1, 0.006, i * 0.04, top - 0.1, fz + 0.002), 0.85));
    if (o.quilt) for (let i = 1; i <= o.quilt; i++) parts.push(shade(box(w - 0.02, 0.006, d + 0.01, 0, top - (i * h) / (o.quilt + 1), 0), 0.62));
  }
  return merge(...parts);
}
export interface Legs {
  w: number; h: number;
  /** Leg radii at the thigh, knee and hem: the silhouette (sweat 0.11 / 0.09 / 0.065, wide 0.1 / 0.11 / 0.12 …). */
  top: number; knee?: number; bottom: number;
  /** Waist: flat band (trousers, loops), ribbed elastic (sweats), thin (ankle pants). */
  waist?: 'flat' | 'rib' | 'thin';
  drawstring?: boolean; loops?: boolean; fly?: boolean; button?: boolean; crease?: boolean;
  pockets?: 'slant' | 'curved' | 'cargo' | 'side' | 'five';
  coin?: boolean; rivets?: boolean; stripe?: boolean; split?: boolean; hemCord?: boolean; stack?: boolean; lowCrotch?: boolean;
  /** Hem: ribbed cuff (sweats / joggers), rolled turn-up (jeans), plain. */
  cuff?: 'rib' | 'roll';
  seam?: boolean; band?: number;
}
/** Waistband + two legs (thigh → knee → hem tubes, 6 sides) + the construction details that tell the cuts apart at 3 m. */
function legs(o: Legs): G {
  const { w, h } = o, parts: G[] = [];
  const bandH = o.waist === 'rib' ? 0.09 : o.waist === 'thin' ? 0.04 : 0.07, bandS = o.waist === 'rib' ? 0.78 : o.band ?? 1;
  const yW = h / 2 - bandH / 2, yTop = h / 2 - bandH, fz = 0.078; // front face of the waist
  parts.push(shade(box(w, bandH, 0.15, 0, yW, 0), bandS));
  if (o.waist === 'rib') for (let i = 0; i < 3; i++) parts.push(shade(box(w + 0.004, 0.008, 0.156, 0, yW - 0.03 + i * 0.03, 0), 0.5));
  if (o.drawstring) { parts.push(shade(box(0.016, 0.17, 0.01, -0.03, yW - 0.1, fz + 0.005, 0.15), 0.35)); parts.push(shade(box(0.016, 0.17, 0.01, 0.03, yW - 0.1, fz + 0.005, -0.15), 0.35)); }
  if (o.loops) for (const x of [-w / 2 + 0.03, 0.05, w / 2 - 0.03]) parts.push(shade(box(0.02, bandH + 0.012, 0.012, x, yW, fz + 0.004), 0.5));
  if (o.fly) parts.push(shade(box(0.014, 0.13, 0.008, 0.018, yTop - 0.07, fz + 0.003), 0.5));
  if (o.button) parts.push(shade(box(0.02, 0.02, 0.008, 0, yW, fz + 0.006), 0.45));
  const crotch = yTop - (o.lowCrotch ? 0.22 : 0.08);
  parts.push(box(w - 0.02, yTop - crotch + 0.02, 0.15, 0, (yTop + crotch) / 2 + 0.01, 0)); // the seat between waist and crotch
  const kneeR = o.knee ?? (o.top + o.bottom) / 2, lh = yTop + 0.02 - (-h / 2);
  const yKnee = -h / 2 + lh * 0.48;
  for (const sgn of [-1, 1]) {
    const x = sgn * (w / 2 - o.top);
    parts.push(cyl(o.top, kneeR, yTop + 0.02 - yKnee, 6, x, (yTop + 0.02 + yKnee) / 2, 0, true)); // open: the seat covers the top, the hem tube the joint
    parts.push(cyl(kneeR + 0.002, o.bottom, yKnee + 0.01 - -h / 2, 6, x, (yKnee + 0.01 - h / 2) / 2, 0, true));
    if (o.cuff === 'rib') parts.push(shade(cyl(o.bottom + 0.006, o.bottom + 0.006, 0.08, 6, x, -h / 2 + 0.04, 0, true), 0.55)); // outside the leg tube: a visible dark ribbed cuff
    if (o.cuff === 'roll') parts.push(shade(cyl(o.bottom + 0.01, o.bottom + 0.01, 0.055, 6, x, -h / 2 + 0.028, 0, true), 0.7));
    if (o.stack) for (let i = 0; i < 2; i++) parts.push(shade(cyl(o.bottom + 0.006, o.bottom + 0.006, 0.012, 6, x, -h / 2 + 0.08 + i * 0.07, 0, true), 0.8));
    if (o.crease) parts.push(shade(box(0.008, lh - 0.08, 0.004, x, (yTop + 0.02 - h / 2) / 2, kneeR + 0.004), 0.62));
    if (o.seam) parts.push(shade(box(0.01, lh - 0.06, 0.01, x + sgn * (kneeR + 0.002), (yTop + 0.02 - h / 2) / 2, 0), 0.5));
    if (o.stripe) parts.push(shade(box(0.016, lh - 0.08, 0.006, x + sgn * (kneeR + 0.004), (yTop - h / 2) / 2, 0), 0.5));
    if (o.pockets === 'slant') parts.push(shade(box(0.01, 0.15, 0.008, x + sgn * 0.03, yTop - 0.09, o.top + 0.002, sgn * 0.45), 0.45));
    if (o.pockets === 'curved' || o.pockets === 'five') parts.push(shade(box(0.01, 0.12, 0.008, x + sgn * 0.02, yTop - 0.08, o.top + 0.002, sgn * 1.0), 0.45));
    if (o.pockets === 'side') parts.push(shade(box(0.01, 0.13, 0.012, x + sgn * (o.top + 0.002), yTop - 0.1, 0.02), 0.45));
    if (o.pockets === 'cargo') { parts.push(shade(box(0.055, 0.15, 0.12, x + sgn * (o.top + 0.015), yKnee + 0.14, 0), 0.86)); parts.push(shade(box(0.06, 0.04, 0.125, x + sgn * (o.top + 0.015), yKnee + 0.225, 0), 0.72)); parts.push(shade(box(0.015, 0.015, 0.01, x + sgn * (o.top + 0.077), yKnee + 0.215, 0.02), 0.45)); }
    if (o.rivets) for (const [dx, dy] of [[0.05, -0.09]]) parts.push(shade(box(0.012, 0.012, 0.008, x + sgn * dx, yTop + dy, o.top + 0.004), 0.5));
    if (o.hemCord) parts.push(shade(box(0.01, 0.06, 0.008, x + sgn * 0.02, -h / 2 + 0.03, o.bottom + 0.003), 0.4));
    if (o.split) parts.push(shade(box(0.01, 0.05, 0.016, x + sgn * (o.bottom - 0.002), -h / 2 + 0.03, 0), 0.5));
  }
  if (o.coin) parts.push(shade(box(0.04, 0.035, 0.008, 0.07, yTop - 0.045, fz + 0.003), 0.5));
  return merge(...parts);
}
const dress = (h: number, rt: number, rb: number, sleeve: Garment['sleeve'], neck?: Garment['neck'], front?: Garment['front'], belt = false): G =>
  merge(cyl(rt, rb, h, 8, 0, 0, 0), garment({ w: rt * 2, h: 0.22, d: 0.1, sleeve, neck, front }).translate(0, h / 2 - 0.11, 0), ...(belt ? [shade(cyl(rt + 0.01, rt + 0.01, 0.04, 8, 0, h / 2 - 0.25, 0, true), 0.6)] : []));
export interface SkirtOpts { band?: number; pleats?: number; slit?: boolean; wrap?: boolean; zip?: boolean; tie?: boolean; shortsHint?: boolean; buttons?: boolean; pockets?: boolean }
const skirt = (h: number, rt: number, rb: number, seg = 8, o: SkirtOpts = {}): G => {
  const parts = [cyl(rt, rb, h, seg), shade(cyl(rt + 0.006, rt + 0.006, 0.04, seg, 0, h / 2 - 0.02, 0, true), o.band ?? 0.85)];
  if (o.pleats) for (let i = 0; i < o.pleats; i++) parts.push(shade(box(0.006, h - 0.03, 0.006).translate(0, 0, (rt + rb) / 2 + 0.002).rotateY((i * Math.PI * 2) / o.pleats + 0.2), 0.75));
  if (o.slit) parts.push(shade(box(0.012, h * 0.45, 0.006, 0.02, -h / 2 + h * 0.22, rb * 0.92), 0.5));
  if (o.wrap) parts.push(shade(box(0.11, h - 0.02, 0.01, 0.06, 0, rb * 0.88, 0.06), 0.9));
  if (o.tie) { parts.push(shade(box(0.016, 0.16, 0.01, -0.09, h / 2 - 0.12, rt + 0.01, 0.3), 0.6)); parts.push(shade(box(0.016, 0.14, 0.01, -0.12, h / 2 - 0.11, rt + 0.01, -0.2), 0.6)); }
  if (o.zip) parts.push(shade(box(0.006, h * 0.45, 0.008, -rt - 0.002, h / 2 - 0.02 - h * 0.225, 0), 0.5));
  if (o.shortsHint) for (const sgn of [-1, 1]) parts.push(shade(cyl(0.06, 0.06, 0.05, 6, sgn * 0.07, -h / 2 - 0.02, 0), 0.7));
  if (o.buttons) for (let i = 0; i < 4; i++) parts.push(shade(box(0.014, 0.014, 0.008, 0, h / 2 - 0.08 - i * 0.1, (rt + (rb - rt) * ((0.08 + i * 0.1) / h)) + 0.004), 0.45));
  if (o.pockets) for (const sgn of [-1, 1]) parts.push(shade(box(0.006, 0.09, 0.006, sgn * 0.085, h / 2 - 0.1, rt + 0.004, sgn * 1.0), 0.6));
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
  tee: { kind: 'garment', w: Z.tops.tee.chest, h: Z.tops.tee.length, d: 0.07, shoulder: Z.tops.tee.shoulder, sleeve: 'short', sleeveLen: Z.tops.tee.sleeveShort, neck: 'crew', hem: 'straight' },
  'tee-v': { kind: 'garment', w: Z.tops.tee.chest, h: Z.tops.tee.length, d: 0.07, shoulder: Z.tops.tee.shoulder, sleeve: 'short', sleeveLen: Z.tops.tee.sleeveShort, neck: 'v', hem: 'straight' },
  'tee-long': { kind: 'garment', w: Z.tops.tee.chest, h: Z.tops.tee.length, d: 0.07, shoulder: Z.tops.tee.shoulder, sleeve: 'long', sleeveLen: Z.tops.tee.sleeveLong, sleeveW: 0.12, neck: 'crew', hem: 'rib' },
  tank: { kind: 'garment', w: Z.tops.tank.chest, h: Z.tops.tank.length, d: 0.06, shoulder: Z.tops.tank.shoulder, sleeve: 'strap', hem: 'straight' },
  crop: { kind: 'garment', w: Z.tops.crop.chest, h: Z.tops.crop.length, d: 0.06, shoulder: Z.tops.crop.shoulder, sleeve: 'short', sleeveLen: Z.tops.crop.sleeveShort, neck: 'crew', hem: 'rib' },
  'tee-oversized': { kind: 'garment', w: Z.tops.oversized.chest, h: Z.tops.oversized.length, d: 0.09, shoulder: Z.tops.oversized.shoulder, sleeve: 'short', sleeveLen: Z.tops.oversized.sleeveShort, sleeveW: 0.2, neck: 'crew', dropShoulder: true, hem: 'straight', flare: 0.02 },
  polo: { kind: 'garment', w: Z.tops.polo.chest, h: Z.tops.polo.length, d: 0.07, shoulder: Z.tops.polo.shoulder, sleeve: 'short', sleeveLen: Z.tops.polo.sleeveShort, neck: 'polo', front: 'buttons', buttons: 3, hem: 'straight' },
  'polo-long': { kind: 'garment', w: Z.tops.polo.chest, h: Z.tops.polo.length, d: 0.07, shoulder: Z.tops.polo.shoulder, sleeve: 'long', sleeveLen: Z.tops.polo.sleeveLong, sleeveW: 0.12, neck: 'polo', front: 'buttons', buttons: 3, hem: 'rib' },
  shirt: { kind: 'garment', w: Z.tops.shirt.chest, h: Z.tops.shirt.length, d: 0.07, shoulder: Z.tops.shirt.shoulder, sleeve: 'long', sleeveLen: Z.tops.shirt.sleeveLong, sleeveW: 0.12, neck: 'shirt', front: 'placket', buttons: 7, pocket: 'chest', yoke: true, hem: 'straight' },
  'shirt-short': { kind: 'garment', w: Z.tops.shirt.chest + 0.02, h: Z.tops.shirt.length - 0.02, d: 0.07, shoulder: Z.tops.shirt.shoulder, sleeve: 'rolled', sleeveLen: Z.tops.shirt.sleeveShort, sleeveW: 0.15, neck: 'shirt', front: 'placket', buttons: 6, pocket: 'chest', hem: 'straight', drape: 0.02 },
  'shirt-band': { kind: 'garment', w: Z.tops.shirt.chest, h: Z.tops.shirt.length, d: 0.07, shoulder: Z.tops.shirt.shoulder, sleeve: 'long', sleeveLen: Z.tops.shirt.sleeveLong, sleeveW: 0.12, neck: 'band', front: 'placket', buttons: 6, hem: 'straight' },
  'shirt-camp': { kind: 'garment', w: Z.tops.shirt.chest + 0.04, h: Z.tops.shirt.length - 0.04, d: 0.07, shoulder: Z.tops.shirt.shoulder + 0.03, sleeve: 'short', sleeveLen: Z.tops.shirt.sleeveShort, sleeveW: 0.16, neck: 'camp', front: 'buttons', buttons: 4, pocket: 'chest', hem: 'straight', flare: 0.0 },
  blouse: { kind: 'garment', w: Z.tops.blouse.chest, h: Z.tops.blouse.length, d: 0.07, shoulder: Z.tops.blouse.shoulder, sleeve: 'puff', sleeveLen: 0.22, sleeveW: 0.12, neck: 'band', gathers: true, hem: 'straight', flare: 0.1, drape: 0.02 },
  hoodie: { kind: 'garment', w: Z.tops.hoodie.chest, h: Z.tops.hoodie.length, d: 0.1, shoulder: Z.tops.hoodie.shoulder, sleeve: 'long', sleeveLen: Z.tops.hoodie.sleeveLong, sleeveW: 0.15, neck: 'hood', drawstrings: true, pocket: 'kangaroo', hem: 'rib' },
  'hoodie-zip': { kind: 'garment', w: Z.tops.hoodie.chest, h: Z.tops.hoodie.length, d: 0.1, shoulder: Z.tops.hoodie.shoulder, sleeve: 'long', sleeveLen: Z.tops.hoodie.sleeveLong, sleeveW: 0.15, neck: 'hood', drawstrings: true, front: 'zip', pocket: 'side2', hem: 'rib' },
  sweatshirt: { kind: 'garment', w: Z.tops.sweatshirt.chest, h: Z.tops.sweatshirt.length, d: 0.1, shoulder: Z.tops.sweatshirt.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweatshirt.sleeveLong, sleeveW: 0.15, neck: 'crew', hem: 'rib' },
  'quarter-zip': { kind: 'garment', w: Z.tops.sweatshirt.chest, h: Z.tops.sweatshirt.length, d: 0.1, shoulder: Z.tops.sweatshirt.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweatshirt.sleeveLong, sleeveW: 0.15, neck: 'stand', front: 'halfzip', hem: 'rib' },
  sweater: { kind: 'garment', w: Z.tops.sweater.chest, h: Z.tops.sweater.length, d: 0.09, shoulder: Z.tops.sweater.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong, sleeveW: 0.14, neck: 'crew', hem: 'rib', knit: true },
  'knit-v': { kind: 'garment', w: Z.tops.sweater.chest, h: Z.tops.sweater.length, d: 0.09, shoulder: Z.tops.sweater.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong, sleeveW: 0.14, neck: 'v', hem: 'rib', knit: true },
  turtleneck: { kind: 'garment', w: Z.tops.sweater.chest - 0.03, h: Z.tops.sweater.length, d: 0.09, shoulder: Z.tops.sweater.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong, sleeveW: 0.13, neck: 'turtle', hem: 'rib', knit: true },
  mockneck: { kind: 'garment', w: Z.tops.sweater.chest, h: Z.tops.sweater.length + 0.04, d: 0.09, shoulder: Z.tops.sweater.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong, sleeveW: 0.14, neck: 'mock', hem: 'rib', knit: true },
  cardigan: { kind: 'garment', w: Z.outer.cardigan.chest, h: Z.outer.cardigan.length, d: 0.09, shoulder: Z.outer.cardigan.shoulder, sleeve: 'long', sleeveLen: Z.outer.cardigan.sleeveLong, sleeveW: 0.14, neck: 'v', front: 'open', buttons: 5, pocket: 'chest2', hem: 'rib', knit: true },
  'knit-vest': { kind: 'garment', w: Z.tops.vest.chest, h: Z.tops.vest.length, d: 0.08, shoulder: 0.36, sleeve: 'none', neck: 'v', hem: 'rib', knit: true },
  // ---- outerwear ----
  parka: { kind: 'garment', w: Z.outer.parka.chest, h: Z.outer.parka.length, d: 0.11, shoulder: Z.outer.parka.shoulder, sleeve: 'long', sleeveLen: Z.outer.parka.sleeveLong, sleeveW: 0.16, neck: 'hood', drawstrings: true, front: 'zip', pocket: 'flapLow2', hem: 'drawcord' },
  'uv-zip': { kind: 'garment', w: Z.outer.uvZip.chest, h: Z.outer.uvZip.length, d: 0.08, shoulder: Z.outer.uvZip.shoulder, sleeve: 'long', sleeveLen: Z.outer.uvZip.sleeveLong, sleeveW: 0.13, neck: 'hood', front: 'zip', hem: 'rib' },
  bomber: { kind: 'garment', w: Z.outer.bomber.chest, h: Z.outer.bomber.length, d: 0.12, shoulder: Z.outer.bomber.shoulder, sleeve: 'long', sleeveLen: Z.outer.bomber.sleeveLong, sleeveW: 0.17, neck: 'rib', front: 'zip', pocket: 'side2', hem: 'rib', flare: -0.04 },
  fleece: { kind: 'garment', w: Z.outer.fleece.chest, h: Z.outer.fleece.length, d: 0.12, shoulder: Z.outer.fleece.shoulder, sleeve: 'long', sleeveLen: Z.outer.fleece.sleeveLong, sleeveW: 0.16, neck: 'stand', front: 'zip', pocket: 'chest', hem: 'straight' },
  down: { kind: 'garment', w: Z.outer.down.chest, h: Z.outer.down.length, d: 0.14, shoulder: Z.outer.down.shoulder, sleeve: 'long', sleeveLen: Z.outer.down.sleeveLong, sleeveW: 0.17, neck: 'stand', front: 'zip', quilt: 5, pocket: 'side2', hem: 'straight' },
  'down-long': { kind: 'garment', w: Z.outer.downLong.chest, h: Z.outer.downLong.length, d: 0.16, shoulder: Z.outer.downLong.shoulder, sleeve: 'long', sleeveLen: Z.outer.downLong.sleeveLong, sleeveW: 0.18, neck: 'hood', front: 'zip', quilt: 7, pocket: 'side2', hem: 'straight' },
  'puffer-vest': { kind: 'garment', w: Z.outer.pufferVest.chest, h: Z.outer.pufferVest.length, d: 0.14, shoulder: 0.4, sleeve: 'none', neck: 'stand', front: 'zip', quilt: 5, pocket: 'side2' },
  blazer: { kind: 'garment', w: Z.outer.blazer.chest, h: Z.outer.blazer.length, d: 0.09, shoulder: Z.outer.blazer.shoulder, sleeve: 'long', sleeveLen: Z.outer.blazer.sleeveLong, sleeveW: 0.13, neck: 'lapel', front: 'buttons', buttons: 2, pocket: 'flap2', hem: 'straight', flare: 0.0 },
  trench: { kind: 'garment', w: Z.outer.trench.chest, h: Z.outer.trench.length, d: 0.1, shoulder: Z.outer.trench.shoulder, sleeve: 'long', sleeveLen: Z.outer.trench.sleeveLong, sleeveW: 0.14, neck: 'lapel', front: 'double', hem: 'belt', pocket: 'flapLow2', epaulettes: true, stormFlap: true, flare: 0.12 },
  coach: { kind: 'garment', w: Z.outer.coach.chest, h: Z.outer.coach.length, d: 0.09, shoulder: Z.outer.coach.shoulder, sleeve: 'long', sleeveLen: Z.outer.coach.sleeveLong, sleeveW: 0.15, neck: 'camp', front: 'snaps', pocket: 'side2', hem: 'drawcord' },
  'denim-jacket': { kind: 'garment', w: Z.outer.denimJacket.chest, h: Z.outer.denimJacket.length, d: 0.09, shoulder: Z.outer.denimJacket.shoulder, sleeve: 'long', sleeveLen: Z.outer.denimJacket.sleeveLong, sleeveW: 0.14, neck: 'shirt', front: 'placket', buttons: 5, pocket: 'chestFlap2', yoke: true, hem: 'rib', flare: -0.03 },
  'wool-coat': { kind: 'garment', w: Z.outer.woolCoat.chest, h: Z.outer.woolCoat.length, d: 0.11, shoulder: Z.outer.woolCoat.shoulder, sleeve: 'long', sleeveLen: Z.outer.woolCoat.sleeveLong, sleeveW: 0.15, neck: 'lapel', front: 'buttons', buttons: 3, pocket: 'flapLow2', hem: 'straight', flare: 0.1 },
  padded: { kind: 'garment', w: Z.outer.padded.chest, h: Z.outer.padded.length, d: 0.16, shoulder: Z.outer.padded.shoulder, sleeve: 'long', sleeveLen: Z.outer.padded.sleeveLong, sleeveW: 0.18, neck: 'hood', drawstrings: true, front: 'zip', pocket: 'flapLow2', hem: 'drawcord', quilt: 3 },
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
  pants: { kind: 'legs', w: 0.33, h: H.pants, top: 0.08, knee: 0.066, bottom: 0.055, waist: 'thin', loops: true, fly: true, crease: true, pockets: 'slant' }, // smart ankle: slim, cropped, no cuff,
  chinos: { kind: 'legs', w: 0.34, h: H.chinos, top: 0.09, knee: 0.078, bottom: 0.066, waist: 'flat', loops: true, fly: true, button: true, pockets: 'curved', coin: true, band: 0.92 },
  wide: { kind: 'legs', w: 0.4, h: H.wide, top: 0.1, knee: 0.11, bottom: 0.12, waist: 'flat', loops: true, fly: true, crease: true, pockets: 'slant', band: 0.9 },
  straight: { kind: 'legs', w: 0.34, h: H.straight, top: 0.085, knee: 0.08, bottom: 0.08, waist: 'flat', loops: true, fly: true, button: true, crease: true, pockets: 'slant' }, // dress trousers,
  cargo: { kind: 'legs', w: 0.37, h: H.cargo, top: 0.1, knee: 0.095, bottom: 0.085, waist: 'flat', loops: true, fly: true, pockets: 'cargo', hemCord: true, band: 0.9 },
  jogger: { kind: 'legs', w: 0.34, h: H.jogger, top: 0.095, knee: 0.075, bottom: 0.05, waist: 'rib', drawstring: true, cuff: 'rib', stripe: true, pockets: 'side' },
  sweatpants: { kind: 'legs', w: 0.37, h: H.sweatpants, top: 0.11, knee: 0.09, bottom: 0.065, waist: 'rib', drawstring: true, cuff: 'rib', pockets: 'side' },
  bootcut: { kind: 'legs', w: 0.34, h: H.bootcut, top: 0.085, knee: 0.068, bottom: 0.11, waist: 'flat', loops: true, fly: true, button: true, pockets: 'five', rivets: true, seam: true },
  bermuda: { kind: 'legs', w: 0.36, h: H.bermuda, top: 0.1, knee: 0.1, bottom: 0.1, waist: 'flat', loops: true, fly: true, pockets: 'slant', band: 0.9 },
  shorts: { kind: 'legs', w: 0.36, h: H.shorts, top: 0.1, knee: 0.105, bottom: 0.105, waist: 'rib', drawstring: true, split: true, band: 0.85 }, // sport short,
  cycling: { kind: 'legs', w: 0.3, h: H.cycling, top: 0.078, knee: 0.07, bottom: 0.065, waist: 'rib', band: 0.8 },
  'jeans-wide': { kind: 'legs', w: 0.4, h: H['jeans-wide'], top: 0.1, knee: 0.11, bottom: 0.12, waist: 'flat', loops: true, fly: true, button: true, pockets: 'five', coin: true, rivets: true, seam: true, band: 0.8 },
  'jeans-baggy': { kind: 'legs', w: 0.42, h: H['jeans-baggy'], top: 0.12, knee: 0.12, bottom: 0.11, waist: 'flat', loops: true, fly: true, button: true, pockets: 'five', rivets: true, seam: true, lowCrotch: true, stack: true, band: 0.8 },
  'jeans-tapered': { kind: 'legs', w: 0.34, h: H['jeans-tapered'], top: 0.092, knee: 0.07, bottom: 0.052, waist: 'flat', loops: true, fly: true, button: true, pockets: 'five', coin: true, rivets: true, seam: true, band: 0.8 },
  'shorts-chino': { kind: 'legs', w: 0.36, h: H['shorts-chino'], top: 0.1, knee: 0.1, bottom: 0.1, waist: 'flat', loops: true, fly: true, button: true, pockets: 'curved', coin: true, band: 0.9 },
  'jeans-straight': { kind: 'legs', w: 0.34, h: H['jeans-straight'], top: 0.088, knee: 0.082, bottom: 0.08, waist: 'flat', loops: true, fly: true, button: true, pockets: 'five', coin: true, rivets: true, seam: true, cuff: 'roll', band: 0.8 },
  // ---- dresses & skirts ----
  'dress-shirt': { kind: 'dress', h: H['dress-shirt'], rt: 0.17, rb: 0.26, sleeve: 'short', neck: 'polo', front: 'placket', belt: true },
  'dress-aline': { kind: 'custom', build: () => dress(H['dress-aline'], 0.16, 0.32, 'cap', 'crew') },
  'dress-maxi': { kind: 'dress', h: H['dress-maxi'], rt: 0.16, rb: 0.36, sleeve: 'short', neck: 'v' },
  'dress-slip': { kind: 'custom', build: () => dress(H['dress-slip'], 0.15, 0.24, 'strap') },
  'skirt-pleated': { kind: 'skirt', h: H['skirt-pleated'], rt: 0.16, rb: 0.27, seg: 14, opts: { pleats: 14 } },
  'skirt-aline': { kind: 'skirt', h: H['skirt-aline'], rt: 0.16, rb: 0.27, seg: 8, opts: { zip: true } },
  'skirt-flare': { kind: 'skirt', h: H['skirt-flare'], rt: 0.15, rb: 0.4, seg: 12, opts: { band: 0.9 } },
  'skirt-mini': { kind: 'skirt', h: H['skirt-mini'], rt: 0.16, rb: 0.19, seg: 8, opts: { band: 0.8 } },
  'skirt-tennis': { kind: 'skirt', h: H['skirt-tennis'], rt: 0.16, rb: 0.26, seg: 12, opts: { pleats: 10, band: 0.9, shortsHint: true } },
  'skirt-denim': { kind: 'skirt', h: H['skirt-denim'], rt: 0.16, rb: 0.22, seg: 8, opts: { band: 0.8, buttons: true, pockets: true } },
  'skirt-wrap': { kind: 'skirt', h: H['skirt-wrap'], rt: 0.16, rb: 0.26, seg: 8, opts: { wrap: true, tie: true } },
  'skirt-midi': { kind: 'skirt', h: H['skirt-midi'], rt: 0.16, rb: 0.3, seg: 10, opts: { slit: true } },
  // ---- underwear / homewear ----
  bra: { kind: 'custom', build: () => merge(dome(0.065, -0.07, -0.05, 0), dome(0.065, 0.07, -0.05, 0), shade(box(0.3, 0.025, 0.02, 0, -0.055, 0), 0.85)) },
  briefs: { kind: 'custom', build: () => merge(box(0.26, H.briefs, 0.2), shade(box(0.26, H.briefs + 0.004, 0.03, 0, 0, -0.085), 0.8)) },
  bratop: { kind: 'custom', build: () => merge(box(0.3, 0.3, 0.05, 0, -0.06, 0), shade(box(0.03, 0.14, 0.02, -0.09, 0.14, 0), 0.85), shade(box(0.03, 0.14, 0.02, 0.09, 0.14, 0), 0.85)) },
  pyjama: { kind: 'custom', build: () => merge(garment({ w: 0.42, h: 0.42, d: 0.07, sleeve: 'long', neck: 'camp', front: 'buttons', sleeveW: 0.11 }).translate(0, 0.24, 0), box(0.12, 0.42, 0.11, -0.085, -0.23, 0.02), box(0.12, 0.42, 0.11, 0.085, -0.23, 0.02)) },
  'lounge-pants': { kind: 'legs', w: 0.37, h: H['lounge-pants'], top: 0.1, knee: 0.1, bottom: 0.105, waist: 'rib', drawstring: true, band: 0.85 },
  // ---- footwear ----
  sneaker: { kind: 'custom', build: () => shoe(0.3, 0.035, 0.09, H.sneaker, true, true) },
  loafer: { kind: 'custom', build: () => shoe(0.3, 0.02, 0.065, H.loafer, false) },
  sandal: { kind: 'custom', build: () => merge(shade(box(0.11, 0.02, 0.28, 0, -0.02, 0), 0.7), box(0.11, 0.015, 0.035, 0, 0, 0.03), box(0.11, 0.015, 0.035, 0, 0, -0.05)) },
  slipper: { kind: 'custom', build: () => merge(shade(box(0.11, 0.02, 0.28, 0, -0.03, 0), 0.7), box(0.11, 0.055, 0.12, 0, 0.0075, 0.06)) },
  boot: { kind: 'custom', build: () => merge(shade(box(0.11, 0.03, 0.3, 0, -H.boot / 2 + 0.015, 0), 0.55), shade(box(0.09, 0.03, 0.08, 0, -H.boot / 2 + 0.045, -0.1), 0.55), box(0.1, 0.06, 0.3, 0, -H.boot / 2 + 0.065, 0), cyl(0.05, 0.055, 0.12, 8, 0, H.boot / 2 - 0.06, -0.075), shade(box(0.03, 0.02, 0.012, 0, H.boot / 2 - 0.03, -0.018), 0.4)) }, // sole, heel, foot, round shaft, pull tab
  'socks-ankle': { kind: 'custom', build: () => merge(box(0.07, 0.04, 0.2, 0, -0.03, 0.02), shade(box(0.07, 0.07, 0.07, 0, 0.015, -0.045), 0.85)) },
  'socks-crew': { kind: 'custom', build: () => merge(box(0.07, 0.04, 0.2, 0, -0.08, 0.02), shade(box(0.07, 0.17, 0.07, 0, 0.015, -0.045), 0.85)) },
  // ---- folded slabs ----
  'fold-top': { kind: 'custom', build: () => merge(...[0, 1, 2].map((i) => shade(box(Z.store.foldedW - i * 0.004, 0.064, Z.store.foldedD - i * 0.01, 0, -H['fold-top'] / 2 + 0.032 + i * 0.068, i * 0.004), 1 - i * 0.03)), ...[0, 1, 2].map((i) => shade(box(Z.store.foldedW + 0.002, 0.008, 0.01, 0, -H['fold-top'] / 2 + 0.068 * (i + 1) - 0.004, Z.store.foldedD / 2 - 0.003 + i * 0.004), 0.72)), shade(cyl(0.06, 0.06, 0.012, 8, 0, H['fold-top'] / 2, -0.09, true), 0.8), shade(box(0.26, 0.005, 0.006, 0, H['fold-top'] / 2, 0.02), 0.85)) }, // a stack of three folded pieces: fold edges front, collar on top
  'fold-bottom': { kind: 'custom', build: () => merge(...[0, 1, 2].map((i) => shade(box(Z.store.foldedW - 0.04 - i * 0.004, 0.064, Z.store.foldedD - i * 0.01, 0, -H['fold-bottom'] / 2 + 0.032 + i * 0.068, i * 0.004), 1 - i * 0.03)), ...[0, 1, 2].map((i) => shade(box(Z.store.foldedW - 0.04, 0.008, 0.01, 0, -H['fold-bottom'] / 2 + 0.068 * (i + 1) - 0.004, Z.store.foldedD / 2 - 0.003 + i * 0.004), 0.7)), shade(box(0.006, 0.005, 0.3, 0, H['fold-bottom'] / 2, 0), 0.8), shade(box(0.22, 0.03, 0.006, 0, H['fold-bottom'] / 2 - 0.02, -Z.store.foldedD / 2 + 0.002), 0.78)) }, // three folded pairs, waistband at the back
};
const BUILD = (sp: Spec, lod = false): G => sp.kind === 'garment' ? garment(sp, lod) : sp.kind === 'legs' ? legs(sp) : sp.kind === 'dress' ? dress(sp.h, sp.rt, sp.rb, sp.sleeve, sp.neck, sp.front, sp.belt) : sp.kind === 'skirt' ? skirt(sp.h, sp.rt, sp.rb, sp.seg, sp.opts) : sp.build();
/** The hanger drawn over every hanging item (one extra InstancedMesh, fixed colour). */
export const HANGER: G = merge(shade(box(0.012, 0.07, 0.012, 0, 0.055, 0), 0.4), shade(box(0.42, 0.014, 0.014, 0, 0.02, 0), 0.4));
/** Standing items turned on their shelf so the silhouette reads (shoes three-quarter on). */
const STAND_TURN: Partial<Record<ShapeId, number>> = { sneaker: 0.35, loafer: 0.35, sandal: 0.35, slipper: 0.35, boot: 0.35, 'socks-ankle': 0, 'socks-crew': 0, umbrella: 0 }; // shoes toe-out, slightly turned

const cache = new Map<string, G>();
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
export function shapeGeometry(id: ShapeId, lod = false): G {
  const k = lod ? `${id}@lod` : id;
  let g = cache.get(k);
  if (!g) {
    g = metricUV(BUILD(SPEC[id], lod));
    if (!g.getAttribute('color')) shade(g, 1);
    cache.set(k, g);
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
/** The same instanced attribute buffers as `from` (pattern / colour2 / scale / roughness) on another geometry (a LOD copy). */
function itemAttributesFrom(g: G, from: G, n: number): G {
  for (const k of ['iPattern', 'iColour2', 'iScale', 'iRough']) g.setAttribute(k, from.getAttribute(k));
  void n;
  return g;
}
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
  /** LOD: move every garment instance to its near (full) or far (≤ 30 % triangles) mesh by distance to `camLocal`
   *  (room-local); `floor` = draw only that floor's items (0 = both). Cheap: call at ≤ 5 Hz. */
  updateLod(camLocal: THREE.Vector3, floor?: 0 | 1 | 2): void;
}
export const LOD_DISTANCE = 7; // m: garments beyond this draw their LOD1 shape
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
  const lodPairs: { near: THREE.InstancedMesh; far: THREE.InstancedMesh; items: CatalogItem[] }[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const off = new Set<string>(); // ids hidden by setVisible (taken off the shelf)
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
    if (SPEC[shape].kind === 'garment') { // a far copy: same instances, plain geometry; instances are moved between the two by updateLod
      const far = new THREE.InstancedMesh(itemAttributesFrom(shapeGeometry(shape, true).clone(), geo, list.length), mat, list.length);
      far.name = `${shape}@lod`;
      list.forEach((it, i) => { far.setMatrixAt(i, hidden); far.setColorAt(i, col.set(it.colour.hex)); });
      far.instanceMatrix.needsUpdate = true;
      far.matrixAutoUpdate = false;
      far.frustumCulled = false;
      meshes.push(far);
      group.add(far);
      lodPairs.push({ near: mesh, far, items: list });
    }
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
  const pose = (it: CatalogItem) => m.compose(anchors.get(it.id)!, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, it.shelf.yaw + (STAND_TURN[displayShape(it.shape, it.display)] ?? 0)), s);
  return {
    group, meshes, anchors, triangles,
    setVisible(id, v) {
      const w = where.get(id);
      if (!w) return;
      if (v) { off.delete(id); const it = items.find((it) => it.id === id)!; w.mesh.setMatrixAt(w.i, pose(it)); }
      else { off.add(id); w.mesh.setMatrixAt(w.i, hidden); }
      w.mesh.instanceMatrix.needsUpdate = true;
      const pair = lodPairs.find((p) => p.near === w.mesh);
      if (pair) { pair.far.setMatrixAt(w.i, hidden); pair.far.instanceMatrix.needsUpdate = true; }
    },
    updateLod(cam, floor = 0) {
      const d2 = LOD_DISTANCE * LOD_DISTANCE;
      for (const { near, far, items: list } of lodPairs) {
        list.forEach((it, i) => {
          const shown = !off.has(it.id) && (floor === 0 || it.floor === floor);
          const nearBy = shown && cam.distanceToSquared(anchors.get(it.id)!) < d2;
          near.setMatrixAt(i, nearBy ? pose(it) : hidden);
          far.setMatrixAt(i, shown && !nearBy ? pose(it) : hidden);
        });
        near.instanceMatrix.needsUpdate = far.instanceMatrix.needsUpdate = true;
      }
      for (const mesh of meshes) { // non-garment shapes: floor filter only
        if (lodPairs.some((p) => p.near === mesh || p.far === mesh) || mesh.name === 'hangers') continue;
        const list = items.filter((it) => displayShape(it.shape, it.display) === mesh.name);
        list.forEach((it, i) => mesh.setMatrixAt(i, !off.has(it.id) && (floor === 0 || it.floor === floor) ? pose(it) : hidden));
        mesh.instanceMatrix.needsUpdate = true;
      }
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
