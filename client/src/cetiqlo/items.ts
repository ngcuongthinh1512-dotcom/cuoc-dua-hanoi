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
  neck?: 'crew' | 'v' | 'turtle' | 'mock' | 'polo' | 'shirt' | 'band' | 'camp' | 'hood' | 'lapel' | 'scoop' | 'stand' | 'rib' | 'henley';
  /** Front: button placket (n buttons), zip (tape + pull), half zip, open front (cardigan), double-breasted, snap row. */
  front?: 'placket' | 'zip' | 'halfzip' | 'open' | 'double' | 'buttons' | 'snaps';
  buttons?: number;
  pocket?: 'kangaroo' | 'chest' | 'chest2' | 'side2' | 'flap2' | 'flapLow2' | 'breast' | 'chestFlap2';
  /** A second pocket kind (a chest zip welt over side welts, say). */
  pocket2?: Garment['pocket'];
  hem?: 'rib' | 'belt' | 'drawcord' | 'straight';
  /** Puffy baffles (count), hood drawstrings, epaulettes, storm flap, yoke seam line, elbow bend, drop shoulder, knit ribbing. */
  quilt?: number; drawstrings?: boolean; epaulettes?: boolean; stormFlap?: boolean; yoke?: boolean; dropShoulder?: boolean; knit?: boolean; gathers?: boolean;
  /** Round 4 glance details: contrast (darker) raglan sleeves, the sweatshirt's V-stitch at the neck, an open-collar notch (camp), horizontal rib lines on knit bands, a deeper V. */
  raglan?: boolean; vstitch?: boolean; notch?: boolean; ribLines?: boolean; deepV?: boolean;
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
/** A hood hanging down the BACK of the garment with its opening toward the FRONT (owner 2026-11-03: "hướng mũ phải quay cùng
 *  hướng với mặt trước"): an outer dome tilted back ≈ 65° so the cut edge faces +z / up, plus a darker inner shell (flipped
 *  winding) so the opening reads as the hood's inside instead of a hole. `y` = the neck line, `z` = behind the collar. */
export function hood(r: number, y: number, z: number): G[] {
  const outer = new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 0.9);
  const inner = shade(new THREE.SphereGeometry(r * 0.94, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(-1, 1.1, 0.9), 0.62); // negative x scale flips the faces inward
  return [outer, inner].map((g) => g.rotateX(-1.15).translate(0, y, z));
}
const disc = (x: number, y: number, z: number, r = 0.011, s = 0.45): G => shade(new THREE.CylinderGeometry(r, r, 0.006, 6).rotateX(Math.PI / 2).translate(x, y, z), s);
/** Torso + sleeves + neck + front + pockets + hem + extras; origin = the garment's centre, top edge at +h/2, front +z. */
function garment(o: Garment, lod = false): G {
  const { w, h, d } = o, parts: G[] = [torso(o, lod)];
  const fz = d / 2 + 0.004, top = h / 2;
  for (const sgn of [-1, 1]) parts.push(...sleeve(o, sgn, lod).map((g) => o.raglan && !g.getAttribute('color') ? shade(g, 0.74) : g)); // raglan: contrast sleeves
  if (o.raglan && !lod) for (const sgn of [-1, 1]) parts.push(shade(box(0.012, 0.3, d + 0.006, sgn * 0.13, top - 0.1, 0, sgn * 0.75), 0.6)); // the diagonal raglan seams
  if (o.sleeve === 'strap') for (const sgn of [-1, 1]) parts.push(shade(box(0.03, 0.09, 0.02, sgn * 0.1, top - 0.045, 0), 0.9));
  if (o.sleeve === 'strap' || o.neck === 'scoop') parts.push(shade(box(0.16, 0.06, d + 0.004, 0, top - 0.03, 0), 0.4)); // the open neckline
  if (!lod) switch (o.neck) {
    case 'crew': case 'rib': parts.push(shade(cyl(0.1, 0.1, o.knit ? 0.05 : 0.035, 10, 0, top, 0, true), 0.78)); break;
    case 'henley': parts.push(shade(cyl(0.1, 0.1, 0.035, 10, 0, top, 0, true), 0.78)); parts.push(shade(box(0.034, 0.19, 0.008, 0, top - 0.11, fz), 0.84)); for (let i = 0; i < 3; i++) parts.push(disc(0, top - 0.05 - i * 0.06, fz + 0.008, 0.01)); break; // short buttoned placket
    case 'v': { const vl = o.deepV ? 0.25 : 0.19; parts.push(shade(cyl(0.1, 0.1, 0.02, 10, 0, top, 0, true), 0.78)); for (const sg of [-1, 1]) parts.push(shade(box(0.022, vl, 0.01, sg * (0.03 + vl * 0.13), top - vl * 0.45, fz, -sg * 0.5), 0.5)); break; }
    case 'turtle': parts.push(shade(cyl(0.095, 0.105, 0.14, 10, 0, top + 0.05, 0, true), 0.85)); parts.push(shade(cyl(0.108, 0.108, 0.05, 10, 0, top + 0.1, 0, true), 0.78)); break; // rolled
    case 'mock': parts.push(shade(cyl(0.095, 0.1, 0.07, 10, 0, top + 0.025, 0, true), 0.85)); break;
    case 'stand': parts.push(shade(cyl(0.1, 0.095, 0.06, 10, 0, top + 0.02, 0, true), 0.9)); break;
    case 'band': parts.push(shade(cyl(0.098, 0.098, 0.035, 10, 0, top + 0.01, 0, true), 0.84)); break;
    case 'polo': parts.push(shade(cyl(0.1, 0.092, 0.045, 10, 0, top + 0.012, 0, true), 0.9)); for (const sg of [-1, 1]) parts.push(shade(box(0.105, 0.09, 0.014, sg * 0.062, top - 0.035, fz + 0.008, -sg * 0.55), 0.86)); break; // flat folded collar, wider than the shirt's
    case 'shirt': parts.push(shade(cyl(0.1, 0.095, 0.045, 10, 0, top + 0.015, 0, true), 0.9)); for (const sg of [-1, 1]) { parts.push(shade(box(0.1, 0.085, 0.012, sg * 0.065, top - 0.03, fz + 0.006, -sg * 0.55), 0.9)); parts.push(shade(box(0.03, 0.03, 0.01, sg * 0.11, top - 0.075, fz + 0.008, -sg * 0.55), 0.9)); } break; // pointed collar + stand
    case 'camp': for (const sg of [-1, 1]) parts.push(shade(box(0.13, 0.1, 0.012, sg * 0.09, top - 0.045, fz + 0.006, -sg * 0.75), 0.9)); if (o.notch) parts.push(shade(box(0.07, 0.11, 0.008, 0, top - 0.06, fz + 0.002), 0.35)); break; // the open neck shows dark
    case 'lapel': for (const sg of [-1, 1]) { parts.push(shade(box(0.075, 0.3, 0.012, sg * 0.08, top - 0.17, fz + 0.006, -sg * 0.32), 0.85)); parts.push(shade(box(0.06, 0.05, 0.012, sg * 0.1, top - 0.04, fz + 0.007, -sg * 0.9), 0.85)); } break; // notch lapels
    case 'hood': { parts.push(...hood(0.17, top + 0.01, -d / 2 - 0.07)); if (o.drawstrings) for (const sg of [-1, 1]) { parts.push(shade(box(0.008, 0.16, 0.008, sg * 0.04, top - 0.14, fz + 0.006, sg * 0.12), 0.4)); parts.push(shade(box(0.012, 0.025, 0.012, sg * 0.055, top - 0.225, fz + 0.006), 0.3)); } break; }
    case 'scoop': break;
  }
  const len = h, mid = 0;
  if (!lod) switch (o.front) {
    case 'placket': parts.push(shade(box(0.028, len * 0.92, 0.008, 0, mid - len * 0.02, fz), 0.84)); for (let i = 0; i < (o.buttons ?? 6); i++) parts.push(disc(0, top - 0.1 - i * ((len * 0.82) / ((o.buttons ?? 6) - 1 || 1)), fz + 0.008)); break;
    case 'buttons': if (o.neck === 'polo') { parts.push(shade(box(0.036, 0.2, 0.01, 0, top - 0.11, fz + 0.002), 0.8)); for (let i = 0; i < (o.buttons ?? 3); i++) parts.push(disc(0, top - 0.06 - i * 0.055, fz + 0.01, 0.01)); break; } // the polo's short placket
      parts.push(shade(box(0.02, len * 0.9, 0.006, 0, mid - len * 0.02, fz - 0.001), 0.84)); for (let i = 0; i < (o.buttons ?? 3); i++) parts.push(disc(0, top - 0.12 - i * 0.15, fz + 0.007)); break;
    case 'zip': parts.push(shade(box(0.022, len * 0.94, 0.008, 0, mid - len * 0.02, fz), 0.55)); parts.push(shade(box(0.014, 0.035, 0.012, 0, top - 0.04, fz + 0.008), 0.3)); break; // tape + pull
    case 'halfzip': parts.push(shade(box(0.022, len * 0.32, 0.008, 0, top - len * 0.19, fz), 0.55)); parts.push(shade(box(0.014, 0.03, 0.012, 0, top - 0.04, fz + 0.008), 0.3)); break;
    case 'open': parts.push(shade(box(0.05, len * 0.92, 0.01, 0, mid - len * 0.02, fz), 0.45)); for (let i = 0; i < (o.buttons ?? 5); i++) parts.push(disc(-0.04, top - 0.14 - i * 0.11, fz + 0.008)); break;
    case 'double': parts.push(shade(box(0.02, len * 0.9, 0.006, 0.04, mid - len * 0.02, fz - 0.001), 0.84)); for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) parts.push(disc(sg * 0.075, top - 0.24 - i * 0.14, fz + 0.007, 0.015)); break;
    case 'snaps': parts.push(shade(box(0.024, len * 0.9, 0.008, 0, mid - len * 0.02, fz), 0.86)); for (let i = 0; i < 6; i++) parts.push(disc(0, top - 0.09 - i * ((len * 0.75) / 5), fz + 0.008, 0.009, 0.5)); break;
  }
  if (!lod) for (const pk of [o.pocket, o.pocket2]) switch (pk) {
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
    if (o.hem === 'rib') { const rh = o.ribLines ? 0.08 : 0.06; parts.push(shade(box(w * (1 + (o.flare ?? 0.06)) + 0.012, rh, d + 0.014, 0, -top + rh / 2, 0), 0.72)); parts.push(shade(box(w * (1 + (o.flare ?? 0.06)) + 0.014, 0.004, d + 0.016, 0, -top + rh, 0), 0.55)); if (o.ribLines) for (const yy of [0.025, 0.05]) parts.push(shade(box(w * (1 + (o.flare ?? 0.06)) + 0.016, 0.004, d + 0.018, 0, -top + yy, 0), 0.55)); } // knit: ribbed band with visible rib lines
    if (o.vstitch) parts.push(shade(box(0.05, 0.05, 0.006, 0, top - 0.075, fz + 0.002, Math.PI / 4), 0.68)); // the sweatshirt's V-stitch under the neckband
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
/** A part in a FIXED neutral grey `v` (0..1) whatever the instance colour: rubber soles, foam midsoles, white laces, metal
 *  buckles — so a black sneaker still has its white sole (colour attribute = (v, v, −1); itemMaterial reads the flag). */
export function fixed(g: G, v: number): G {
  const n = g.getAttribute('position').count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = c[i * 3 + 1] = v; c[i * 3 + 2] = -1; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
/** Narrow a part toward +z (a pointed / tapered toe): x scaled from 1 at `z0` to `k` at `z1`. */
const taper = (g: G, z0: number, z1: number, k: number): G => {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, (p.getZ(i) - z0) / (z1 - z0))); p.setX(i, p.getX(i) * (1 - (1 - k) * t)); }
  g.computeVertexNormals();
  return g;
};
/** A box tilted about x (a diagonal side panel, a sloping instep). */
const slab = (w: number, h: number, d: number, x: number, y: number, z: number, rx: number): G => new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z);
export interface Shoe {
  /** SHAPE_H, length, width (m). */
  h: number; len?: number; w?: number;
  /** Outsole thickness; dark rubber (`soleShade`) or a fixed neutral rubber (`soleFixed` grey 0..1: cream canvas sole, white foam). */
  sole: number; soleShade?: number; soleFixed?: number;
  /** Thick foam midsole over the outsole (fixed white); `wedge` = thicker at the heel. Stacked heel block under the back (leather). */
  midsole?: number; wedge?: boolean; heel?: number;
  /** Upper height at the instep; the back / collar height (high-top, boot), default = upper; round shaft on top (boots). */
  upper: number; back?: number; shaft?: number;
  toe?: 'round' | 'pointed' | 'cap';
  /** Eyelet pairs on the instep + up the collar front; white (fixed) or same-colour laces. */
  lace?: number; laceUp?: number; laceWhite?: boolean;
  strap?: 'penny' | 'velcro';
  /** Elastic side gussets, heel pull tab, diagonal side overlay panel, foxing band round the sole, darker heel counter, padded
   *  collar roll, welt ledge (boots). */
  gusset?: boolean; tab?: boolean; panel?: boolean; foxing?: boolean; counter?: boolean; collar?: boolean; welt?: boolean;
}
/** A closed shoe: sole stack + quarter + toe box + the construction details that tell sneaker / runner / loafer / boot apart
 *  at a glance even in the same colour. Toe +z, origin centred on the SHAPE_H box. */
function shoe(o: Shoe): G {
  const len = o.len ?? 0.3, W = o.w ?? 0.105, y0 = -o.h / 2, parts: G[] = [];
  let y = y0;
  if (o.heel) { parts.push(shade(box(W, o.heel, len * 0.3, 0, y + o.heel / 2, -len * 0.34), 0.35)); y += o.heel; }
  parts.push(o.soleFixed !== undefined ? fixed(box(W + 0.006, o.sole, len, 0, y + o.sole / 2, 0), o.soleFixed) : shade(box(W + 0.006, o.sole, len, 0, y + o.sole / 2, 0), o.soleShade ?? 0.35));
  y += o.sole;
  if (o.welt) { parts.push(shade(box(W + 0.014, 0.008, len + 0.008, 0, y + 0.004, 0), 0.72)); y += 0.008; }
  if (o.midsole) {
    parts.push(fixed(box(W + 0.004, o.midsole, len * 0.98, 0, y + o.midsole / 2, 0), 0.93));
    if (o.wedge) parts.push(fixed(box(W + 0.004, 0.014, len * 0.42, 0, y + o.midsole + 0.007, -len * 0.28), 0.93));
    y += o.midsole;
  }
  if (o.foxing) parts.push(shade(box(W + 0.012, 0.007, len + 0.006, 0, y - 0.004, 0), 0.4));
  const yB = y + (o.wedge ? 0.014 : 0), back = o.back ?? o.upper, up = o.upper;
  parts.push(box(W, back, len * 0.56, 0, yB + back / 2, -len * 0.22)); // the quarter (back half)
  const toeZ = len * 0.27, toeD = len * 0.46;
  const toe = box(W - 0.004, up * 0.58, toeD, 0, y + up * 0.29, toeZ);
  if (o.toe === 'pointed') taper(toe, len * 0.2, len * 0.5, 0.3);
  else { taper(toe, len * 0.3, len * 0.5, 0.75); parts.push(new THREE.CylinderGeometry(up * 0.26, up * 0.26, W - 0.03, 8).rotateZ(Math.PI / 2).translate(0, y + up * 0.29, len * 0.47)); }
  parts.push(toe);
  if (o.toe === 'cap') parts.push(fixed(taper(box(W - 0.002, up * 0.42, len * 0.14, 0, y + up * 0.21, len * 0.44), len * 0.4, len * 0.5, 0.8), 0.9)); // rubber toe cap
  parts.push(slab(W - 0.02, 0.012, len * 0.3, 0, y + up * 0.76, len * 0.02, 0.35)); // the instep slope down from the quarter to the toe box
  if (o.lace || o.laceUp) {
    parts.push(shade(slab(0.046, 0.01, len * 0.3, 0, y + up * 0.82, len * 0.02, 0.35), 0.92)); // tongue
    const L = (g: G) => (o.laceWhite ? fixed(g, 0.92) : shade(g, 0.45));
    for (let i = 0; i < (o.lace ?? 0); i++) { // instep pairs along the slope
      const t = i / Math.max(1, (o.lace ?? 1) - 1), z = len * 0.16 - t * len * 0.26, yy = y + up * 0.62 + t * up * 0.36;
      parts.push(L(box(0.05, 0.006, 0.012, 0, yy + 0.008, z)));
      for (const sg of [-1, 1]) parts.push(shade(box(0.008, 0.004, 0.008, sg * 0.024, yy + 0.009, z), 0.3));
    }
    for (let i = 0; i < (o.laceUp ?? 0); i++) { // pairs up the collar / shaft front
      const yy = yB + up + 0.02 + i * ((back + (o.shaft ?? 0) - up - 0.035) / Math.max(1, (o.laceUp ?? 1) - 1)), z = -len * 0.1 + (o.shaft && yy > yB + back ? 0.04 : 0.004);
      parts.push(L(box(0.05, 0.012, 0.006, 0, yy, z)));
      for (const sg of [-1, 1]) parts.push(shade(box(0.008, 0.008, 0.004, sg * 0.024, yy, z + 0.002), 0.3));
    }
  }
  if (o.shaft) { parts.push(cyl(0.05, 0.054, o.shaft, 8, 0, yB + back + o.shaft / 2, -len * 0.2)); parts.push(shade(cyl(0.053, 0.053, 0.014, 8, 0, yB + back + o.shaft - 0.007, -len * 0.2, true), 0.8)); } // round shaft + top binding
  if (o.collar) parts.push(shade(box(W + 0.006, 0.022, len * 0.5, 0, yB + back - 0.011, -len * 0.24), 0.8)); // padded collar roll
  if (o.counter) parts.push(shade(box(W + 0.004, back * 0.55, len * 0.22, 0, yB + back * 0.275, -len * 0.39), 0.78)); // darker heel counter
  if (o.gusset) for (const sg of [-1, 1]) parts.push(shade(box(0.006, back * 0.62, len * 0.2, sg * (W / 2), yB + back * 0.62, -len * 0.12), 0.45)); // elastic side panels
  if (o.tab) parts.push(shade(box(0.022, 0.03, 0.008, 0, yB + back + (o.shaft ?? 0) + 0.012, -len * 0.5 + 0.004), 0.4)); // heel pull tab
  if (o.panel) for (const sg of [-1, 1]) parts.push(shade(slab(0.006, 0.02, len * 0.42, sg * (W / 2), y + up * 0.4, -len * 0.04, sg * 0.32), 0.7)); // diagonal side overlay (no brand)
  if (o.strap === 'penny') { parts.push(shade(box(W + 0.004, 0.014, 0.032, 0, y + up * 0.58 + 0.006, len * 0.1), 0.78)); parts.push(shade(box(0.022, 0.018, 0.012, 0, y + up * 0.58 + 0.006, len * 0.1), 0.3)); } // strap over the vamp + slit
  if (o.strap === 'velcro') { parts.push(shade(box(W + 0.006, 0.026, 0.04, 0, y + up * 0.72, len * 0.02), 0.82)); parts.push(fixed(box(0.03, 0.028, 0.012, W / 2 - 0.01, y + up * 0.72, len * 0.02), 0.5)); }
  return merge(...parts);
}
/** A sock hanging flat: foot + heel + leg tube + cuff; contrast (darker) heel / toe, ribbed cuff lines, sport bands. */
function sock(h: number, leg: number, cuff: number, o: { bands?: number; tab?: boolean; rib?: boolean } = {}): G {
  const y0 = -h / 2, zl = -0.045, parts: G[] = [box(0.07, 0.038, 0.17, 0, y0 + 0.019, 0.045), new THREE.CylinderGeometry(0.019, 0.019, 0.068, 8).rotateZ(Math.PI / 2).translate(0, y0 + 0.019, 0.13)];
  parts.push(shade(box(0.072, 0.04, 0.036, 0, y0 + 0.019, 0.11), 0.7)); // toe
  parts.push(shade(box(0.072, 0.05, 0.05, 0, y0 + 0.025, zl), 0.7)); // heel
  parts.push(cyl(0.034, 0.036, leg, 8, 0, y0 + 0.04 + leg / 2, zl, true));
  const yc = y0 + 0.04 + leg;
  parts.push(shade(cyl(0.038, 0.037, cuff, 8, 0, yc + cuff / 2, zl), 0.82)); // cuff
  if (o.rib) for (const t of [0.3, 0.65]) parts.push(shade(cyl(0.0395, 0.0395, 0.004, 8, 0, yc + cuff * t, zl, true), 0.6)); // rib lines
  for (let i = 0; i < (o.bands ?? 0); i++) parts.push(shade(cyl(0.037, 0.037, 0.014, 8, 0, yc - 0.018 - i * 0.026, zl, true), 0.45)); // sport bands below the cuff
  if (o.tab) parts.push(shade(box(0.02, 0.022, 0.006, 0, yc + cuff + 0.008, zl - 0.036), 0.6)); // heel tab
  return merge(...parts);
}

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
  'tee-long': { kind: 'garment', w: Z.tops.tee.chest, h: Z.tops.tee.length, d: 0.07, shoulder: Z.tops.tee.shoulder, sleeve: 'long', sleeveLen: Z.tops.tee.sleeveLong, sleeveW: 0.12, neck: 'crew', hem: 'straight' }, // plain hem + slim sleeves (the sweatshirt is the ribbed one)
  'tee-raglan': { kind: 'garment', w: Z.tops.tee.chest, h: Z.tops.tee.length, d: 0.07, shoulder: Z.tops.tee.shoulder, sleeve: 'short', sleeveLen: Z.tops.tee.sleeveShort + 0.03, neck: 'crew', hem: 'straight', raglan: true },
  'tee-pocket': { kind: 'garment', w: Z.tops.tee.chest, h: Z.tops.tee.length, d: 0.07, shoulder: Z.tops.tee.shoulder, sleeve: 'short', sleeveLen: Z.tops.tee.sleeveShort, neck: 'crew', pocket: 'chest', hem: 'straight' },
  'tee-henley': { kind: 'garment', w: Z.tops.tee.chest, h: Z.tops.tee.length + 0.02, d: 0.07, shoulder: Z.tops.tee.shoulder, sleeve: 'short', sleeveLen: Z.tops.tee.sleeveShort, neck: 'henley', hem: 'straight' },
  tank: { kind: 'garment', w: Z.tops.tank.chest, h: Z.tops.tank.length, d: 0.06, shoulder: Z.tops.tank.shoulder, sleeve: 'strap', hem: 'straight' },
  crop: { kind: 'garment', w: Z.tops.crop.chest, h: Z.tops.crop.length, d: 0.06, shoulder: Z.tops.crop.shoulder, sleeve: 'short', sleeveLen: Z.tops.crop.sleeveShort, neck: 'crew', hem: 'rib' },
  'tee-oversized': { kind: 'garment', w: Z.tops.oversized.chest, h: Z.tops.oversized.length, d: 0.09, shoulder: Z.tops.oversized.shoulder, sleeve: 'short', sleeveLen: Z.tops.oversized.sleeveShort, sleeveW: 0.2, neck: 'crew', dropShoulder: true, hem: 'straight', flare: 0.02 },
  polo: { kind: 'garment', w: Z.tops.polo.chest, h: Z.tops.polo.length, d: 0.07, shoulder: Z.tops.polo.shoulder, sleeve: 'short', sleeveLen: Z.tops.polo.sleeveShort, neck: 'polo', front: 'buttons', buttons: 3, hem: 'straight' },
  'polo-long': { kind: 'garment', w: Z.tops.polo.chest, h: Z.tops.polo.length, d: 0.07, shoulder: Z.tops.polo.shoulder, sleeve: 'long', sleeveLen: Z.tops.polo.sleeveLong, sleeveW: 0.12, neck: 'polo', front: 'buttons', buttons: 3, hem: 'rib' },
  shirt: { kind: 'garment', w: Z.tops.shirt.chest, h: Z.tops.shirt.length, d: 0.07, shoulder: Z.tops.shirt.shoulder, sleeve: 'long', sleeveLen: Z.tops.shirt.sleeveLong, sleeveW: 0.12, neck: 'shirt', front: 'placket', buttons: 7, pocket: 'chest', yoke: true, hem: 'straight' },
  'shirt-short': { kind: 'garment', w: Z.tops.shirt.chest + 0.02, h: Z.tops.shirt.length - 0.02, d: 0.07, shoulder: Z.tops.shirt.shoulder, sleeve: 'rolled', sleeveLen: Z.tops.shirt.sleeveShort, sleeveW: 0.15, neck: 'shirt', front: 'placket', buttons: 6, pocket: 'chest', hem: 'straight', drape: 0.02 },
  'shirt-band': { kind: 'garment', w: Z.tops.shirt.chest, h: Z.tops.shirt.length, d: 0.07, shoulder: Z.tops.shirt.shoulder, sleeve: 'long', sleeveLen: Z.tops.shirt.sleeveLong, sleeveW: 0.12, neck: 'band', front: 'placket', buttons: 6, pocket: 'chest2', hem: 'straight' }, // two patch pockets
  'shirt-camp': { kind: 'garment', w: Z.tops.shirt.chest + 0.04, h: Z.tops.shirt.length - 0.04, d: 0.07, shoulder: Z.tops.shirt.shoulder + 0.03, sleeve: 'short', sleeveLen: Z.tops.shirt.sleeveShort, sleeveW: 0.16, neck: 'camp', front: 'buttons', buttons: 4, pocket: 'chest', hem: 'straight', flare: 0.0, notch: true },
  blouse: { kind: 'garment', w: Z.tops.blouse.chest, h: Z.tops.blouse.length, d: 0.07, shoulder: Z.tops.blouse.shoulder, sleeve: 'puff', sleeveLen: 0.22, sleeveW: 0.12, neck: 'band', gathers: true, hem: 'straight', flare: 0.1, drape: 0.02 },
  hoodie: { kind: 'garment', w: Z.tops.hoodie.chest, h: Z.tops.hoodie.length, d: 0.1, shoulder: Z.tops.hoodie.shoulder, sleeve: 'long', sleeveLen: Z.tops.hoodie.sleeveLong, sleeveW: 0.15, neck: 'hood', drawstrings: true, pocket: 'kangaroo', hem: 'rib' },
  'hoodie-zip': { kind: 'garment', w: Z.tops.hoodie.chest, h: Z.tops.hoodie.length, d: 0.1, shoulder: Z.tops.hoodie.shoulder, sleeve: 'long', sleeveLen: Z.tops.hoodie.sleeveLong, sleeveW: 0.15, neck: 'hood', drawstrings: true, front: 'zip', pocket: 'side2', hem: 'rib' },
  sweatshirt: { kind: 'garment', w: Z.tops.sweatshirt.chest, h: Z.tops.sweatshirt.length, d: 0.1, shoulder: Z.tops.sweatshirt.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweatshirt.sleeveLong, sleeveW: 0.15, neck: 'crew', hem: 'rib', vstitch: true, dropShoulder: true },
  'quarter-zip': { kind: 'garment', w: Z.tops.sweatshirt.chest, h: Z.tops.sweatshirt.length, d: 0.1, shoulder: Z.tops.sweatshirt.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweatshirt.sleeveLong, sleeveW: 0.15, neck: 'stand', front: 'halfzip', hem: 'rib' },
  sweater: { kind: 'garment', w: Z.tops.sweater.chest, h: Z.tops.sweater.length, d: 0.09, shoulder: Z.tops.sweater.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong, sleeveW: 0.13, neck: 'crew', hem: 'rib', knit: true, ribLines: true, flare: -0.02 },
  'sweater-chunky': { kind: 'garment', w: Z.tops.sweater.chest + 0.07, h: Z.tops.sweater.length + 0.04, d: 0.12, shoulder: Z.tops.sweater.shoulder + 0.08, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong - 0.04, sleeveW: 0.18, neck: 'crew', hem: 'rib', knit: true, ribLines: true, dropShoulder: true, flare: 0.0 },
  'knit-v': { kind: 'garment', w: Z.tops.sweater.chest, h: Z.tops.sweater.length, d: 0.09, shoulder: Z.tops.sweater.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong, sleeveW: 0.13, neck: 'v', deepV: true, hem: 'rib', knit: true, ribLines: true, flare: -0.02 },
  turtleneck: { kind: 'garment', w: Z.tops.sweater.chest - 0.03, h: Z.tops.sweater.length, d: 0.09, shoulder: Z.tops.sweater.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong, sleeveW: 0.13, neck: 'turtle', hem: 'rib', knit: true },
  mockneck: { kind: 'garment', w: Z.tops.sweater.chest, h: Z.tops.sweater.length + 0.04, d: 0.09, shoulder: Z.tops.sweater.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong, sleeveW: 0.14, neck: 'mock', hem: 'rib', knit: true },
  cardigan: { kind: 'garment', w: Z.outer.cardigan.chest, h: Z.outer.cardigan.length, d: 0.09, shoulder: Z.outer.cardigan.shoulder, sleeve: 'long', sleeveLen: Z.outer.cardigan.sleeveLong, sleeveW: 0.14, neck: 'v', front: 'open', buttons: 5, pocket: 'chest2', hem: 'rib', knit: true },
  'knit-vest': { kind: 'garment', w: Z.tops.vest.chest, h: Z.tops.vest.length, d: 0.08, shoulder: 0.36, sleeve: 'none', neck: 'v', hem: 'rib', knit: true },
  'knit-polo': { kind: 'garment', w: Z.tops.sweater.chest, h: Z.tops.sweater.length + 0.02, d: 0.09, shoulder: Z.tops.sweater.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong, sleeveW: 0.13, neck: 'polo', front: 'buttons', buttons: 3, hem: 'rib', knit: true, ribLines: true },
  'knit-halfzip': { kind: 'garment', w: Z.tops.sweater.chest, h: Z.tops.sweater.length + 0.02, d: 0.09, shoulder: Z.tops.sweater.shoulder, sleeve: 'long', sleeveLen: Z.tops.sweater.sleeveLong, sleeveW: 0.13, neck: 'stand', front: 'halfzip', hem: 'rib', knit: true, ribLines: true },
  // ---- outerwear ----
  parka: { kind: 'garment', w: Z.outer.parka.chest, h: Z.outer.parka.length, d: 0.11, shoulder: Z.outer.parka.shoulder, sleeve: 'long', sleeveLen: Z.outer.parka.sleeveLong, sleeveW: 0.16, neck: 'hood', drawstrings: true, front: 'zip', pocket: 'flapLow2', hem: 'drawcord', stormFlap: true },
  'uv-zip': { kind: 'garment', w: Z.outer.uvZip.chest, h: Z.outer.uvZip.length, d: 0.08, shoulder: Z.outer.uvZip.shoulder, sleeve: 'long', sleeveLen: Z.outer.uvZip.sleeveLong, sleeveW: 0.11, neck: 'hood', front: 'zip', pocket: 'breast', hem: 'straight' }, // slim, plain hem, one chest zip
  bomber: { kind: 'garment', w: Z.outer.bomber.chest, h: Z.outer.bomber.length, d: 0.12, shoulder: Z.outer.bomber.shoulder, sleeve: 'long', sleeveLen: Z.outer.bomber.sleeveLong, sleeveW: 0.17, neck: 'rib', front: 'zip', pocket: 'side2', hem: 'rib', flare: -0.04 },
  fleece: { kind: 'garment', w: Z.outer.fleece.chest, h: Z.outer.fleece.length, d: 0.12, shoulder: Z.outer.fleece.shoulder, sleeve: 'long', sleeveLen: Z.outer.fleece.sleeveLong, sleeveW: 0.16, neck: 'stand', front: 'zip', pocket: 'side2', pocket2: 'breast', hem: 'straight' },
  'fleece-pullover': { kind: 'garment', w: Z.outer.fleece.chest, h: Z.outer.fleece.length, d: 0.12, shoulder: Z.outer.fleece.shoulder, sleeve: 'long', sleeveLen: Z.outer.fleece.sleeveLong, sleeveW: 0.16, neck: 'stand', front: 'halfzip', pocket: 'chest', hem: 'straight' }, // snap-T style: half zip + patch chest pocket, plain hem
  down: { kind: 'garment', w: Z.outer.down.chest, h: Z.outer.down.length, d: 0.14, shoulder: Z.outer.down.shoulder, sleeve: 'long', sleeveLen: Z.outer.down.sleeveLong, sleeveW: 0.17, neck: 'stand', front: 'zip', quilt: 5, pocket: 'side2', hem: 'straight' },
  'down-long': { kind: 'garment', w: Z.outer.downLong.chest, h: Z.outer.downLong.length, d: 0.16, shoulder: Z.outer.downLong.shoulder, sleeve: 'long', sleeveLen: Z.outer.downLong.sleeveLong, sleeveW: 0.18, neck: 'hood', front: 'zip', quilt: 7, pocket: 'side2', hem: 'straight' },
  'puffer-vest': { kind: 'garment', w: Z.outer.pufferVest.chest, h: Z.outer.pufferVest.length, d: 0.14, shoulder: 0.4, sleeve: 'none', neck: 'stand', front: 'zip', quilt: 5, pocket: 'side2' },
  blazer: { kind: 'garment', w: Z.outer.blazer.chest, h: Z.outer.blazer.length, d: 0.09, shoulder: Z.outer.blazer.shoulder, sleeve: 'long', sleeveLen: Z.outer.blazer.sleeveLong, sleeveW: 0.13, neck: 'lapel', front: 'buttons', buttons: 2, pocket: 'flap2', hem: 'straight', flare: 0.0 },
  trench: { kind: 'garment', w: Z.outer.trench.chest, h: Z.outer.trench.length, d: 0.1, shoulder: Z.outer.trench.shoulder, sleeve: 'long', sleeveLen: Z.outer.trench.sleeveLong, sleeveW: 0.14, neck: 'lapel', front: 'double', hem: 'belt', pocket: 'flapLow2', epaulettes: true, stormFlap: true, flare: 0.12 },
  coach: { kind: 'garment', w: Z.outer.coach.chest, h: Z.outer.coach.length, d: 0.09, shoulder: Z.outer.coach.shoulder, sleeve: 'long', sleeveLen: Z.outer.coach.sleeveLong, sleeveW: 0.15, neck: 'camp', front: 'snaps', pocket: 'side2', hem: 'drawcord' },
  'denim-jacket': { kind: 'garment', w: Z.outer.denimJacket.chest, h: Z.outer.denimJacket.length, d: 0.09, shoulder: Z.outer.denimJacket.shoulder, sleeve: 'long', sleeveLen: Z.outer.denimJacket.sleeveLong, sleeveW: 0.14, neck: 'shirt', front: 'placket', buttons: 5, pocket: 'chestFlap2', yoke: true, hem: 'rib', flare: -0.03 },
  'wool-coat': { kind: 'garment', w: Z.outer.woolCoat.chest, h: Z.outer.woolCoat.length, d: 0.11, shoulder: Z.outer.woolCoat.shoulder, sleeve: 'long', sleeveLen: Z.outer.woolCoat.sleeveLong, sleeveW: 0.15, neck: 'lapel', front: 'buttons', buttons: 3, pocket: 'flapLow2', hem: 'straight', flare: 0.1 },
  anorak: { kind: 'garment', w: Z.outer.uvZip.chest + 0.04, h: 0.72, d: 0.1, shoulder: Z.outer.uvZip.shoulder + 0.02, sleeve: 'long', sleeveLen: Z.outer.uvZip.sleeveLong, sleeveW: 0.15, neck: 'hood', drawstrings: true, front: 'halfzip', pocket: 'kangaroo', hem: 'drawcord' },
  varsity: { kind: 'garment', w: Z.outer.bomber.chest, h: 0.64, d: 0.11, shoulder: Z.outer.bomber.shoulder, sleeve: 'long', sleeveLen: Z.outer.bomber.sleeveLong, sleeveW: 0.16, neck: 'rib', front: 'snaps', pocket: 'side2', hem: 'rib', raglan: true, flare: -0.03 },
  quilted: { kind: 'garment', w: 0.56, h: 0.72, d: 0.12, shoulder: 0.48, sleeve: 'long', sleeveLen: 0.63, sleeveW: 0.15, neck: 'stand', front: 'snaps', quilt: 7, pocket: 'flap2', hem: 'straight' },
  padded: { kind: 'garment', w: Z.outer.padded.chest, h: Z.outer.padded.length, d: 0.16, shoulder: Z.outer.padded.shoulder, sleeve: 'long', sleeveLen: Z.outer.padded.sleeveLong, sleeveW: 0.18, neck: 'hood', drawstrings: true, front: 'zip', pocket: 'flapLow2', hem: 'drawcord', quilt: 4 },
  // ---- bags & accessories ----
  duffel: { kind: 'custom', build: () => merge(cyl(0.15, 0.15, 0.44, 10, 0, -0.03, 0).rotateZ(Math.PI / 2), shade(box(0.02, 0.14, 0.02, -0.08, 0.1, 0), 0.6), shade(box(0.02, 0.14, 0.02, 0.08, 0.1, 0), 0.6), shade(box(0.18, 0.015, 0.02, 0, 0.165, 0), 0.6), shade(box(0.46, 0.03, 0.006, 0, -0.03, 0.152), 0.5)) },
  'waist-bag': { kind: 'custom', build: () => merge(box(0.26, 0.13, 0.08, 0, -0.02, 0), shade(box(0.26, 0.05, 0.085, 0, 0.02, 0), 0.82), shade(box(0.012, 0.1, 0.012, -0.12, 0.09, 0), 0.5), shade(box(0.012, 0.1, 0.012, 0.12, 0.09, 0), 0.5), shade(box(0.25, 0.012, 0.012, 0, 0.14, 0), 0.5), shade(box(0.06, 0.012, 0.01, 0.06, -0.02, 0.042), 0.4)) },
  'laptop-bag': { kind: 'custom', build: () => merge(box(0.36, 0.27, 0.05, 0, -0.04, 0), shade(box(0.36, 0.1, 0.055, 0, 0.04, 0), 0.84), shade(box(0.016, 0.1, 0.016, -0.07, 0.14, 0), 0.6), shade(box(0.016, 0.1, 0.016, 0.07, 0.14, 0), 0.6), shade(box(0.16, 0.016, 0.016, 0, 0.19, 0), 0.6), shade(box(0.03, 0.03, 0.008, 0, 0.0, 0.03), 0.45)) },
  'shoulder-bag': { kind: 'custom', build: () => merge(box(0.28, 0.2, 0.08, 0, -0.1, 0), shade(box(0.28, 0.09, 0.085, 0, 0.0, 0), 0.84), shade(box(0.012, 0.3, 0.012, -0.12, 0.05, 0), 0.5), shade(box(0.012, 0.3, 0.012, 0.12, 0.05, 0), 0.5), shade(box(0.25, 0.012, 0.012, 0, 0.195, 0), 0.5), shade(box(0.02, 0.02, 0.01, 0, -0.04, 0.045), 0.4)) },
  tote: { kind: 'custom', build: () => merge(box(0.36, 0.36, 0.1, 0, -0.06, 0), shade(box(0.02, 0.12, 0.02, -0.1, 0.18, 0), 0.7), shade(box(0.02, 0.12, 0.02, 0.1, 0.18, 0), 0.7), shade(box(0.22, 0.02, 0.02, 0, 0.23, 0), 0.7)) },
  'round-bag': { kind: 'custom', build: () => merge(cyl(0.12, 0.12, 0.07, 10, 0, -0.03, 0).rotateX(Math.PI / 2), shade(box(0.015, 0.14, 0.015, -0.1, 0.07, 0), 0.6), shade(box(0.015, 0.14, 0.015, 0.1, 0.07, 0), 0.6), shade(box(0.215, 0.015, 0.015, 0, 0.14, 0), 0.6), shade(box(0.2, 0.012, 0.004, 0, -0.03, 0.037), 0.5)) },
  backpack: { kind: 'custom', build: () => merge(box(0.3, 0.4, 0.15, 0, -0.02, 0), box(0.3, 0.1, 0.16, 0, 0.17, -0.005), shade(box(0.06, 0.34, 0.015, -0.08, -0.05, -0.08), 0.7), shade(box(0.06, 0.34, 0.015, 0.08, -0.05, -0.08), 0.7), shade(box(0.22, 0.12, 0.012, 0, -0.1, 0.08), 0.85)) },
  crossbody: { kind: 'custom', build: () => merge(box(0.22, 0.14, 0.07, 0, -0.05, 0), shade(box(0.22, 0.05, 0.075, 0, 0.03, 0), 0.85), shade(box(0.012, 0.12, 0.012, -0.1, 0.07, 0), 0.6), shade(box(0.012, 0.12, 0.012, 0.1, 0.07, 0), 0.6), shade(box(0.21, 0.012, 0.012, 0, 0.125, 0), 0.6)) },
  beret: { kind: 'custom', build: () => merge(dome(0.14, 0, -0.03, 0, 8).scale(1, 0.4, 1), shade(cyl(0.1, 0.1, 0.02, 8, 0, -0.035, 0, true), 0.75), shade(box(0.01, 0.025, 0.01, 0, 0.035, 0), 0.6)) },
  visor: { kind: 'custom', build: () => merge(shade(cyl(0.1, 0.1, 0.035, 8, 0, 0, 0, true), 0.95), shade(box(0.17, 0.012, 0.11, 0, -0.01, 0.12), 0.85)) },
  bandana: { kind: 'custom', build: () => merge(new THREE.CylinderGeometry(0.15, 0.15, 0.008, 3).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, -0.02, 0), shade(box(0.26, 0.012, 0.012, 0, 0.11, 0), 0.8)) },
  'umbrella-long': { kind: 'custom', build: () => merge(cyl(0.035, 0.015, 0.7, 6, 0, -0.03, 0), shade(box(0.016, 0.12, 0.016, 0, 0.36, 0), 0.5), shade(box(0.08, 0.016, 0.016, 0.035, 0.42, 0), 0.5), shade(box(0.016, 0.06, 0.016, 0.07, 0.4, 0), 0.5), shade(cyl(0.006, 0.006, 0.06, 4, 0, -0.41, 0), 0.4)) },
  belt: { kind: 'custom', build: () => merge(new THREE.TorusGeometry(0.085, 0.016, 5, 12).scale(1, 1, 0.5), shade(box(0.04, 0.035, 0.02, 0, 0.09, 0), 0.5), shade(box(0.02, 0.12, 0.014, 0.06, -0.03, 0.005), 0.9)) },
  wallet: { kind: 'custom', build: () => merge(box(0.11, 0.09, 0.025), shade(box(0.11, 0.04, 0.027, 0, 0.02, 0), 0.84), shade(box(0.014, 0.014, 0.008, 0, -0.01, 0.015), 0.45)) },
  cardholder: { kind: 'custom', build: () => merge(box(0.1, 0.07, 0.012), shade(box(0.1, 0.004, 0.014, 0, 0.012, 0), 0.5), shade(box(0.1, 0.004, 0.014, 0, -0.012, 0), 0.5)) },
  watch: { kind: 'custom', build: () => merge(shade(box(0.022, 0.12, 0.006, 0, 0, 0), 0.5), new THREE.TorusGeometry(0.02, 0.006, 5, 12), shade(new THREE.CircleGeometry(0.017, 12).translate(0, 0, 0.004), 0.9), shade(box(0.005, 0.005, 0.006, 0.023, 0, 0.002), 0.5)) },
  gloves: { kind: 'custom', build: () => merge(box(0.085, 0.2, 0.025, -0.05, -0.02, 0), box(0.085, 0.2, 0.025, 0.05, -0.02, 0), box(0.03, 0.07, 0.024, -0.1, -0.01, 0, 0.5), box(0.03, 0.07, 0.024, 0.1, -0.01, 0, -0.5), shade(box(0.09, 0.05, 0.027, -0.05, 0.1, 0), 0.75), shade(box(0.09, 0.05, 0.027, 0.05, 0.1, 0), 0.75)) },
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
  'jogger-cargo': { kind: 'legs', w: 0.35, h: H['jogger-cargo'], top: 0.1, knee: 0.08, bottom: 0.052, waist: 'rib', drawstring: true, cuff: 'rib', pockets: 'cargo' },
  'track-pants': { kind: 'legs', w: 0.35, h: H['track-pants'], top: 0.095, knee: 0.085, bottom: 0.085, waist: 'rib', drawstring: true, stripe: true, split: true, band: 0.85 },
  'shorts-denim': { kind: 'legs', w: 0.36, h: H['shorts-denim'], top: 0.1, knee: 0.1, bottom: 0.1, waist: 'flat', loops: true, fly: true, button: true, pockets: 'five', coin: true, rivets: true, cuff: 'roll', band: 0.8 },
  'shorts-cargo': { kind: 'legs', w: 0.37, h: H['shorts-cargo'], top: 0.105, knee: 0.1, bottom: 0.1, waist: 'flat', loops: true, fly: true, pockets: 'cargo', band: 0.9 },
  'shorts-chino': { kind: 'legs', w: 0.36, h: H['shorts-chino'], top: 0.1, knee: 0.1, bottom: 0.1, waist: 'flat', loops: true, fly: true, button: true, pockets: 'curved', coin: true, band: 0.9 },
  'jeans-straight': { kind: 'legs', w: 0.34, h: H['jeans-straight'], top: 0.088, knee: 0.082, bottom: 0.08, waist: 'flat', loops: true, fly: true, button: true, pockets: 'five', coin: true, rivets: true, seam: true, cuff: 'roll', band: 0.8 },
  // ---- dresses & skirts ----
  'dress-shirt': { kind: 'dress', h: H['dress-shirt'], rt: 0.17, rb: 0.26, sleeve: 'short', neck: 'polo', front: 'placket', belt: true },
  'dress-aline': { kind: 'custom', build: () => dress(H['dress-aline'], 0.16, 0.32, 'cap', 'crew') },
  'dress-maxi': { kind: 'dress', h: H['dress-maxi'], rt: 0.16, rb: 0.36, sleeve: 'short', neck: 'v' },
  'dress-slip': { kind: 'custom', build: () => dress(H['dress-slip'], 0.15, 0.24, 'strap') },
  'dress-wrap': { kind: 'dress', h: H['dress-wrap'], rt: 0.16, rb: 0.3, sleeve: 'short', neck: 'v', belt: true },
  'dress-tee': { kind: 'dress', h: H['dress-tee'], rt: 0.17, rb: 0.22, sleeve: 'short', neck: 'crew' },
  'skirt-pleated': { kind: 'skirt', h: H['skirt-pleated'], rt: 0.16, rb: 0.27, seg: 14, opts: { pleats: 14 } },
  'skirt-aline': { kind: 'skirt', h: H['skirt-aline'], rt: 0.16, rb: 0.27, seg: 8, opts: { zip: true } },
  'skirt-flare': { kind: 'skirt', h: H['skirt-flare'], rt: 0.15, rb: 0.4, seg: 12, opts: { band: 0.9 } },
  'skirt-mini': { kind: 'skirt', h: H['skirt-mini'], rt: 0.16, rb: 0.19, seg: 8, opts: { band: 0.8 } },
  'skirt-tennis': { kind: 'skirt', h: H['skirt-tennis'], rt: 0.16, rb: 0.26, seg: 12, opts: { pleats: 10, band: 0.9, shortsHint: true } },
  'skirt-denim': { kind: 'skirt', h: H['skirt-denim'], rt: 0.16, rb: 0.22, seg: 8, opts: { band: 0.8, buttons: true, pockets: true } },
  'skirt-wrap': { kind: 'skirt', h: H['skirt-wrap'], rt: 0.16, rb: 0.26, seg: 8, opts: { wrap: true, tie: true } },
  'skirt-midi': { kind: 'skirt', h: H['skirt-midi'], rt: 0.16, rb: 0.3, seg: 10, opts: { slit: true } },
  'skirt-pencil': { kind: 'skirt', h: H['skirt-pencil'], rt: 0.16, rb: 0.145, seg: 8, opts: { slit: true, zip: true, band: 0.8 } },
  'skirt-cargo': { kind: 'skirt', h: H['skirt-cargo'], rt: 0.16, rb: 0.21, seg: 8, opts: { pockets: true, buttons: true, band: 0.85, tie: true } },
  // ---- underwear / homewear ----
  bra: { kind: 'custom', build: () => merge(dome(0.065, -0.07, -0.05, 0), dome(0.065, 0.07, -0.05, 0), shade(box(0.3, 0.025, 0.02, 0, -0.055, 0), 0.85)) },
  briefs: { kind: 'custom', build: () => merge(box(0.26, H.briefs, 0.2), shade(box(0.26, H.briefs + 0.004, 0.03, 0, 0, -0.085), 0.8)) },
  bratop: { kind: 'custom', build: () => merge(box(0.3, 0.3, 0.05, 0, -0.06, 0), shade(box(0.03, 0.14, 0.02, -0.09, 0.14, 0), 0.85), shade(box(0.03, 0.14, 0.02, 0.09, 0.14, 0), 0.85)) },
  pyjama: { kind: 'custom', build: () => merge(garment({ w: 0.42, h: 0.42, d: 0.07, sleeve: 'long', neck: 'camp', front: 'buttons', sleeveW: 0.11 }).translate(0, 0.24, 0), box(0.12, 0.42, 0.11, -0.085, -0.23, 0.02), box(0.12, 0.42, 0.11, 0.085, -0.23, 0.02)) },
  robe: { kind: 'garment', w: 0.6, h: H.robe, d: 0.1, shoulder: 0.5, sleeve: 'long', sleeveLen: 0.5, sleeveW: 0.18, neck: 'camp', front: 'open', buttons: 0, hem: 'belt', flare: 0.08, drape: 0.02 },
  'lounge-pants': { kind: 'legs', w: 0.37, h: H['lounge-pants'], top: 0.1, knee: 0.1, bottom: 0.105, waist: 'rib', drawstring: true, band: 0.85 },
  // ---- footwear ----
  // ---- footwear: same colour, different shoe — each one has its own sole stack, toe, closure and at least one more tell ----
  sneaker: { kind: 'custom', build: () => shoe({ h: H.sneaker, sole: 0.022, soleFixed: 0.9, foxing: true, upper: 0.08, toe: 'cap', lace: 4, laceWhite: true, counter: true }) }, // low canvas: cream rubber sole + foxing band, rubber toe cap, 4 white lace pairs
  'running-shoe': { kind: 'custom', build: () => shoe({ h: H['running-shoe'], len: 0.31, sole: 0.012, soleShade: 0.3, midsole: 0.03, wedge: true, upper: 0.065, toe: 'pointed', lace: 3, laceWhite: true, panel: true, tab: true, counter: true }) }, // thick white foam wedge over a dark outsole, low tapered toe, diagonal side panel, heel tab
  'slip-on': { kind: 'custom', build: () => shoe({ h: H['slip-on'], sole: 0.02, soleFixed: 0.9, foxing: true, upper: 0.06, toe: 'round', gusset: true, collar: true }) }, // no laces: elastic side gussets, padded collar, cream sole
  'sneaker-hi': { kind: 'custom', build: () => shoe({ h: H['sneaker-hi'], sole: 0.022, soleFixed: 0.9, foxing: true, upper: 0.08, back: 0.135, toe: 'cap', lace: 3, laceUp: 3, laceWhite: true, collar: true }) }, // ankle collar with 3 more lace pairs up the front
  loafer: { kind: 'custom', build: () => shoe({ h: H.loafer, sole: 0.012, soleShade: 0.3, heel: 0.018, upper: 0.055, toe: 'pointed', strap: 'penny' }) }, // sleek: thin leather sole + stacked heel, pointed toe, penny strap with slit
  'boot-chelsea': { kind: 'custom', build: () => shoe({ h: H['boot-chelsea'], sole: 0.014, soleShade: 0.3, heel: 0.022, upper: 0.06, back: 0.14, toe: 'pointed', gusset: true, tab: true }) }, // smooth tall shaft, elastic side panels, pull tab, stacked heel
  boot: { kind: 'custom', build: () => shoe({ h: H.boot, sole: 0.028, soleShade: 0.3, welt: true, heel: 0.012, upper: 0.07, back: 0.1, shaft: 0.1, toe: 'round', lace: 2, laceUp: 4, tab: true }) }, // lug sole + welt ledge, round toe, laces up the shaft, round shaft with binding
  sandal: { kind: 'custom', build: () => merge(shade(box(0.106, 0.012, 0.28, 0, -0.019, 0), 0.4), shade(box(0.1, 0.014, 0.276, 0, -0.006, 0), 0.8), shade(box(0.096, 0.004, 0.27, 0, 0.003, 0), 0.95),
    box(0.108, 0.01, 0.026, 0, 0.012, 0.06), box(0.108, 0.01, 0.022, 0, 0.012, -0.01), shade(box(0.012, 0.03, 0.012, -0.046, 0.016, 0.12), 0.9), // contoured footbed (dark base, lighter top), toe-post + two cross straps
    box(0.1, 0.01, 0.006, 0, 0.02, -0.135), box(0.006, 0.02, 0.07, -0.047, 0.015, -0.1), box(0.006, 0.02, 0.07, 0.047, 0.015, -0.1), fixed(box(0.014, 0.012, 0.01, 0.05, 0.02, -0.07), 0.55)) }, // open heel strap + metal buckle
  slipper: { kind: 'custom', build: () => merge(fixed(box(0.108, 0.022, 0.28, 0, -0.029, 0), 0.9), shade(box(0.096, 0.004, 0.27, 0, -0.016, 0), 0.8), // thick cream felt sole, fleece lining showing at the open heel
    new THREE.CylinderGeometry(0.054, 0.054, 0.15, 8, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.72, 1).translate(0, -0.016, 0.055), shade(box(0.11, 0.012, 0.012, 0, 0.016, -0.02), 0.8), shade(box(0.03, 0.012, 0.03, 0, 0.026, 0.07), 0.6)) }, // puffy rounded vamp, binding at the mouth, a small bow
  'socks-ankle': { kind: 'custom', build: () => sock(H['socks-ankle'], 0.025, 0.02, { tab: true }) }, // short: heel tab, plain cuff
  'socks-crew': { kind: 'custom', build: () => sock(H['socks-crew'], 0.13, 0.04, { rib: true }) }, // tall ribbed cuff
  'socks-sport': { kind: 'custom', build: () => sock(H['socks-sport'], 0.13, 0.03, { rib: true, bands: 2 }) }, // tube: two dark bands under the cuff
  // ---- folded slabs ----
  'fold-top': { kind: 'custom', build: () => merge(...[0, 1, 2].map((i) => shade(box(Z.store.foldedW - i * 0.004, 0.064, Z.store.foldedD - i * 0.01, 0, -H['fold-top'] / 2 + 0.032 + i * 0.068, i * 0.004), 1 - i * 0.03)), ...[0, 1, 2].map((i) => shade(box(Z.store.foldedW + 0.002, 0.008, 0.01, 0, -H['fold-top'] / 2 + 0.068 * (i + 1) - 0.004, Z.store.foldedD / 2 - 0.003 + i * 0.004), 0.72)), shade(cyl(0.06, 0.06, 0.012, 8, 0, H['fold-top'] / 2, -0.09, true), 0.8), shade(box(0.26, 0.005, 0.006, 0, H['fold-top'] / 2, 0.02), 0.85)) }, // a stack of three folded pieces: fold edges front, collar on top
  'fold-bottom': { kind: 'custom', build: () => merge(...[0, 1, 2].map((i) => shade(box(Z.store.foldedW - 0.04 - i * 0.004, 0.064, Z.store.foldedD - i * 0.01, 0, -H['fold-bottom'] / 2 + 0.032 + i * 0.068, i * 0.004), 1 - i * 0.03)), ...[0, 1, 2].map((i) => shade(box(Z.store.foldedW - 0.04, 0.008, 0.01, 0, -H['fold-bottom'] / 2 + 0.068 * (i + 1) - 0.004, Z.store.foldedD / 2 - 0.003 + i * 0.004), 0.7)), shade(box(0.006, 0.005, 0.3, 0, H['fold-bottom'] / 2, 0), 0.8), shade(box(0.22, 0.03, 0.006, 0, H['fold-bottom'] / 2 - 0.02, -Z.store.foldedD / 2 + 0.002), 0.78)) }, // three folded pairs, waistband at the back
};
const BUILD = (sp: Spec, lod = false): G => sp.kind === 'garment' ? garment(sp, lod) : sp.kind === 'legs' ? legs(sp) : sp.kind === 'dress' ? dress(sp.h, sp.rt, sp.rb, sp.sleeve, sp.neck, sp.front, sp.belt) : sp.kind === 'skirt' ? skirt(sp.h, sp.rt, sp.rb, sp.seg, sp.opts) : sp.build();
/** The hanger drawn over every hanging item (one extra InstancedMesh, fixed colour). */
export const HANGER: G = merge(shade(box(0.012, 0.07, 0.012, 0, 0.055, 0), 0.4), shade(box(0.42, 0.014, 0.014, 0, 0.02, 0), 0.4));
/** Standing items turned on their shelf so the silhouette reads (shoes three-quarter on). */
const STAND_TURN: Partial<Record<ShapeId, number>> = { sneaker: 0.35, loafer: 0.35, sandal: 0.35, slipper: 0.35, boot: 0.35, 'running-shoe': 0.35, 'slip-on': 0.35, 'sneaker-hi': 0.35, 'boot-chelsea': 0.35, 'socks-ankle': 0, 'socks-crew': 0, 'socks-sport': 0, umbrella: 0 }; // shoes toe-out, slightly turned

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
/** Dark-garment details (shader rule in itemMaterial): a garment whose LINEAR luminance is ≤ `lumOn` lightens its detail parts
 *  (full), ≥ `lumOff` keeps the usual darker details; the band sits in the catalog's gap between rust (0.163) and teal / grey
 *  (0.27) so no colourway is half-way. `tone` = the light grey (linear ≈ sRGB #d0d0d0) the details go toward; a part's darkening
 *  below `shadeMax` × `gain` is its lightening: buttons / zip pulls (shade ≤ 0.45) come out pearl / silver, plackets / pocket bags
 *  (0.84) a step lighter than the cloth, the torso's own knit ribs / creases (≥ 0.92) untouched so a black sweater stays black. */
export const DARK_DETAIL = { lumOn: '0.19', lumOff: '0.24', tone: 'vec3(0.62)', shadeMax: '0.92', gain: '1.8' } as const;
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
      .replace('#include <common>', '#include <common>\nattribute float iPattern; attribute vec3 iColour2; attribute float iScale; attribute float iRough;\nvarying float vPattern; varying vec3 vColour2; varying float vScale; varying float vRough; varying float vShade; varying float vFixed; varying vec3 vBase;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPattern = iPattern; vColour2 = iColour2; vScale = iScale; vRough = iRough; vShade = color.r; vFixed = color.b < 0.0 ? color.r : -1.0;\n#ifdef USE_INSTANCING_COLOR\nvBase = instanceColor.rgb;\n#else\nvBase = vec3(1.0);\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D patternAtlas; varying float vPattern; varying vec3 vColour2; varying float vScale; varying float vRough; varying float vShade; varying float vFixed; varying vec3 vBase;`)
      .replace('#include <color_fragment>', `
\tif (vFixed >= 0.0) diffuseColor.rgb = vec3(vFixed); // items.ts fixed(): neutral parts (soles, laces, buckles) ignore the instance colour
\telse { // DARK_DETAIL rule (owner 2026-11-03): on a dark garment every detail part (vertex shade < 1: buttons, plackets, zips, welts, seams,
\t\t// bands, hood lining) is LIGHTENED toward a light grey tinted by the garment's hue instead of darkened, so the construction reads
\t\tfloat lum = dot(vBase, vec3(0.2126, 0.7152, 0.0722)); // linear luminance of the instance colour
\t\tfloat dark = 1.0 - smoothstep(${DARK_DETAIL.lumOn}, ${DARK_DETAIL.lumOff}, lum);
\t\tvec3 light = ${DARK_DETAIL.tone} * (0.7 + 0.3 * vBase / max(max(vBase.r, max(vBase.g, vBase.b)), 1e-4)); // black → grey, navy → grey-blue
\t\tvec3 lit = mix(vBase, light, clamp((${DARK_DETAIL.shadeMax} - vShade) * ${DARK_DETAIL.gain}, 0.0, 1.0)); // shade 0.45 (button) → ≈ full light; 0.84 (placket) → a step; ≥ 0.92 (knit ribs, cloth) → none
\t\tdiffuseColor.rgb *= mix(vColor.rgb, lit, dark);
\t}
\tif (vPattern >= 0.0 && vFixed < 0.0) {
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

/** One item EXACTLY as the store shows it (display shape, shelf pose incl. the stand turn, the store hanger), room-local:
 *  the brief stills draw this so the brief and the shelf are the same picture. */
export function shelfPiece(it: CatalogItem): THREE.Group {
  const g = new THREE.Group(), shape = displayShape(it.shape, it.display);
  const m = itemMesh(it, shapeGeometry(shape));
  m.position.set(it.shelf.x, it.shelf.y, it.shelf.z);
  m.rotation.y = it.shelf.yaw + (STAND_TURN[shape] ?? 0);
  g.add(m);
  if (it.display === 'hang') {
    const h = new THREE.Mesh(HANGER, HANGER_MAT);
    h.position.set(it.shelf.x, it.shelf.y + SHAPE_H[it.shape] / 2 + 0.01, it.shelf.z);
    h.rotation.y = it.shelf.yaw;
    g.add(h);
  }
  return g;
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
