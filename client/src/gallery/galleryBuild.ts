// Pure layout / geometry builders for the comic-strip gallery dev room (client/gallery.html, entry gallery.ts). No DOM.
// 1 unit = 1 m. X across the hall, Z along it (entrance at +Z, feature wall at −Z), Y up, y 0 = parquet.
// Plan = a Horta-style iron-and-glass hall: a rectangular nave, engaged iron columns on the long walls carrying an eaves
// girder, glass gable roof on iron trusses; 11 drawing desks against the long walls (6 left, 5 right) facing the walls,
// their stools and "Bắt đầu" pedestals on the central aisle side.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Slot { x: number; y: number; z: number; yaw: number }
export interface Team { slot: number; name: string; color: string }

export const G = {
  halfW: 8, halfL: 15, wallH: 6.2, ridgeH: 9.8,
  pitch: 3.4, // desk spacing along the wall; trusses and columns follow it
  deskX: 6.55, // desk centre from the axis (top 0.8 deep → back edge 0.2 m off the wall)
  leftZ: [-8.5, -5.1, -1.7, 1.7, 5.1, 8.5], rightZ: [-6.8, -3.4, 0, 3.4, 6.8],
  trussZ: [-11.9, -8.5, -5.1, -1.7, 1.7, 5.1, 8.5, 11.9],
  window: { w: 1.5, y0: 1.6, y1: 5.4 }, // on the right wall, one behind each right desk
  mural: { w: 7.6, h: 4.2, y: 3.3 },
};
export const TEAMS: Team[] = [
  { slot: 1, name: 'Hai Long', color: '#b6e08a' }, { slot: 2, name: 'Chị 6', color: '#8eead8' }, { slot: 3, name: 'WindyPhon', color: '#d6249f' },
  { slot: 4, name: 'V.Hy', color: '#1a1a1a' }, { slot: 5, name: 'Chú Hiệp', color: '#a31621' }, { slot: 6, name: 'Đạt 0️⃣9️⃣', color: '#e0a800' },
  { slot: 7, name: 'Nhật Nhật', color: '#1e56d6' }, { slot: 8, name: '🌽 Hiếu', color: '#f7a8c4' }, { slot: 9, name: 'Mạnh Ka', color: '#eadcb8' },
  { slot: 10, name: 'Dừa L', color: '#6b4a37' }, { slot: 11, name: 'Như Chấn', color: '#6a2fb0' },
];

export interface DeskSlot extends Slot { slot: number }
/** Desks 1–6 along the left wall (entrance end first), 7–11 along the right wall; local −z faces the wall. */
export function deskSlots(): DeskSlot[] {
  const left = [...G.leftZ].reverse().map((z, i) => ({ x: -G.deskX, y: 0, z, yaw: Math.PI / 2, slot: i + 1 }));
  const right = [...G.rightZ].reverse().map((z, i) => ({ x: G.deskX, y: 0, z, yaw: -Math.PI / 2, slot: i + 7 }));
  return [...left, ...right];
}
/** World point of a desk-local offset (local −z = toward the wall, +x = the artist's right). */
export function deskLocal(d: Slot, lx: number, ly: number, lz: number): THREE.Vector3 {
  return new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw).add(new THREE.Vector3(d.x, d.y, d.z));
}

export interface Frame extends Slot { w: number; h: number; cell: number } // yaw: the picture's normal (facing the room), cell = art atlas cell
/** Framed prints: above every left desk, high between the right windows, flanking the mural and the entrance. */
export function frameSlots(): Frame[] {
  const out: Frame[] = [];
  let cell = 0;
  const put = (x: number, y: number, z: number, yaw: number, w: number, h: number) => out.push({ x, y, z, yaw, w, h, cell: cell++ % 16 });
  for (const z of G.leftZ) put(-G.halfW + 0.06, 2.9, z, Math.PI / 2, 1.3, 1.0);
  for (const z of [-10.2, 10.2, -11.9, 11.9]) put(-G.halfW + 0.06, z < 0 === (Math.abs(z) > 11) ? 2.4 : 2.9, z, Math.PI / 2, 0.8, 1.1);
  for (const z of [-11.9, 11.9]) put(G.halfW - 0.06, 2.9, z, -Math.PI / 2, 1.3, 1.0);
  for (const x of [-6.4, 6.4]) put(x, 2.6, -G.halfL + 0.06, 0, 1.4, 1.8); // flanking the mural
  for (const x of [-5.8, 5.8]) put(x, 2.6, G.halfL - 0.06, Math.PI, 1.6, 1.1); // either side of the entrance
  return out;
}

export function windowSlots(): Slot[] {
  return G.rightZ.map((z) => ({ x: G.halfW, y: (G.window.y0 + G.window.y1) / 2, z, yaw: -Math.PI / 2 }));
}
/** Engaged iron columns on each long wall at the midpoints between that wall's desks. */
export function columnSlots(): Slot[] {
  const mids = (zs: number[]) => [zs[0] - G.pitch, ...zs.map((z) => z + G.pitch / 2)].filter((z) => Math.abs(z) < G.halfL - 1);
  return [...mids(G.leftZ).map((z) => ({ x: -G.halfW + 0.3, y: 0, z, yaw: 0 })), ...mids(G.rightZ).map((z) => ({ x: G.halfW - 0.3, y: 0, z, yaw: 0 }))];
}

export const inside = (x: number, z: number, m = 0): boolean => Math.abs(x) < G.halfW - m && Math.abs(z) < G.halfL - m;
export const clampRoom = (p: THREE.Vector3, m = 0.4): THREE.Vector3 => p.set(THREE.MathUtils.clamp(p.x, -G.halfW + m, G.halfW - m), THREE.MathUtils.clamp(p.y, 0.5, G.ridgeH - 0.6), THREE.MathUtils.clamp(p.z, -G.halfL + m, G.halfL - m));

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, rz = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateZ(rz).translate(x, y, z);
const cyl = (rt: number, rb: number, h: number, x = 0, y = 0, z = 0, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n).translate(x, y, z);
const merge = (g: THREE.BufferGeometry[]) => mergeGeometries(g, false)!;

export const DESK_TILT = 0.28; // rad; the board rises toward the wall (−z)
const BOARD = { y: 0.98, z: -0.03, d: 0.8 }; // board centre / depth; a point zs along the slope (−0.4 wall … +0.4 artist) sits at onBoard(zs)
const onBoard = (zs: number) => ({ y: BOARD.y - zs * Math.sin(DESK_TILT), z: BOARD.z + zs * Math.cos(DESK_TILT) });
const TRAY = { ...onBoard(-0.4), d: 0.24 }; // flat shelf behind the high edge
TRAY.y += 0.03; TRAY.z -= TRAY.d / 2 + 0.01;
/** One drawing desk in local space (artist at +z), geometry per material: wood (trestle, top, stool), brass (lamp arm,
 *  bottle cap, pedestal plate), black (lamp shade, ink, brush pot), paper (sheets), bulb, pedestal (dark wood), cushion. */
export function deskGeometry(): Record<'wood' | 'brass' | 'black' | 'paper' | 'bulb' | 'pedestal' | 'cushion' | 'tray', THREE.BufferGeometry> {
  const legs: THREE.BufferGeometry[] = [];
  for (const sx of [-0.5, 0.5]) { // A-frame trestle: two splayed legs + foot + stretcher
    legs.push(box(0.05, 0.92, 0.05, sx, 0.46, 0.17, 0.3), box(0.05, 1.02, 0.05, sx, 0.51, -0.22, -0.2), box(0.06, 0.04, 0.7, sx, 0.02, -0.03), box(0.06, 0.05, 0.42, sx, 0.6, -0.04));
  }
  legs.push(box(1.0, 0.05, 0.05, 0, 0.42, -0.04)); // stretcher between the trestles
  const top = box(1.2, 0.03, BOARD.d, 0, BOARD.y, BOARD.z, DESK_TILT);
  const low = onBoard(0.4);
  const lip = box(1.2, 0.06, 0.035, 0, low.y + 0.025, low.z + 0.01, DESK_TILT); // pencil ledge at the low edge
  const tray = box(1.2, 0.03, TRAY.d, 0, TRAY.y, TRAY.z);
  const stool = merge([cyl(0.17, 0.17, 0.04, 0, 0.6, 0.72, 16), ...[0, 1, 2, 3].map((k) => box(0.035, 0.6, 0.035, 0.12 * Math.cos(k * Math.PI / 2 + Math.PI / 4), 0.3, 0.72 + 0.12 * Math.sin(k * Math.PI / 2 + Math.PI / 4), (k < 2 ? -1 : 1) * 0.08, 0)), cyl(0.13, 0.13, 0.025, 0, 0.28, 0.72, 12)]);
  const wood = merge([...legs, top, lip, stool]);
  // lamp clamped at the back-left of the tray: post, two arm segments, shade pointing down at the board
  const lb = { x: -0.5, y: TRAY.y + 0.015, z: TRAY.z };
  const shade = { x: lb.x + 0.42, y: lb.y + 0.36, z: lb.z + 0.62 };
  const brass = merge([
    cyl(0.025, 0.03, 0.36, lb.x, lb.y + 0.18, lb.z, 8),
    box(0.03, 0.03, 0.52, lb.x + 0.08, lb.y + 0.5, lb.z + 0.18, -0.75, 0),
    box(0.03, 0.03, 0.4, lb.x + 0.3, lb.y + 0.5, lb.z + 0.47, 1.15, 0),
    cyl(0.03, 0.03, 0.02, 0.42, TRAY.y + 0.095, TRAY.z, 8), // ink bottle cap
    box(0.28, 0.02, 0.28, 0.9, 1.0, 0.6), // pedestal brass plate
    cyl(0.09, 0.1, 0.02, 0.9, 1.02, 0.6, 20), // button bezel
  ]);
  const black = merge([
    new THREE.ConeGeometry(0.14, 0.2, 14, 1, true).rotateX(Math.PI).rotateX(-0.45).translate(shade.x, shade.y, shade.z), // shade
    cyl(0.035, 0.045, 0.07, 0.42, TRAY.y + 0.05, TRAY.z, 10), // ink bottle
    cyl(0.045, 0.04, 0.12, 0.26, TRAY.y + 0.075, TRAY.z, 10), // brush pot
    ...[0, 1, 2, 3, 4].map((k) => box(0.012, 0.24, 0.012, 0.26 + 0.03 * Math.cos(k * 1.3), TRAY.y + 0.2, TRAY.z + 0.03 * Math.sin(k * 1.3), 0.12 * Math.sin(k), 0.12 * Math.cos(k * 2))), // brushes
  ]);
  const bulb = new THREE.SphereGeometry(0.045, 10, 8).translate(shade.x, shade.y - 0.08, shade.z + 0.03);
  // sheets lying on the board: three slightly fanned, following the slope
  const sheet = (x: number, zs: number, rot: number) => { const p = onBoard(zs); return box(0.42, 0.004, 0.3).rotateY(rot).rotateX(DESK_TILT).translate(x, p.y + 0.018, p.z); };
  const paper = merge([sheet(-0.2, 0.02, 0.1), sheet(0.12, -0.05, -0.06), sheet(0.0, 0.05, 0.02)]);
  const pedestal = merge([box(0.3, 0.98, 0.3, 0.9, 0.49, 0.6), box(0.36, 0.04, 0.36, 0.9, 0.02, 0.6)]);
  const cushion = cyl(0.17, 0.17, 0.03, 0, 0.635, 0.72, 16);
  return { wood, brass, black, paper, bulb, pedestal, cushion, tray };
}
/** Position of the lamp bulb in desk-local space (a point light per desk). */
export const BULB_LOCAL = new THREE.Vector3(-0.08, TRAY.y + 0.3, TRAY.z + 0.65);
/** A top sheet's centre + the slope normal, for the sketch plane. */
export const SHEET_LOCAL = { ...onBoard(0.05), x: 0 };
/** The pressable button dome (own mesh per desk: hover / disabled tint), local space. */
export const buttonGeometry = (): THREE.BufferGeometry => new THREE.SphereGeometry(0.075, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0.9, 1.03, 0.6);
export const BUTTON_LOCAL = new THREE.Vector3(0.9, 1.05, 0.6);
/** Walk-mode collision box of one desk (desk-local: trestle + pedestal + stool), rooms/roomPlayer.ts. */
export const DESK_BOX = { x: 0.22, y: 0.5, z: 0.05, hx: 0.83, hy: 0.5, hz: 0.85 };

/** Riveted iron roof truss across the hall at z: a shallow arched tie, king post, rafters to the ridge; y relative to the eaves. */
export function trussGeometry(z: number): THREE.BufferGeometry {
  const { halfW, wallH, ridgeH } = G, parts: THREE.BufferGeometry[] = [], P = (x: number, y: number) => new THREE.Vector3(x, y, z);
  const bar = (a: THREE.Vector3, b: THREE.Vector3, w: number, h = w) => {
    const d = b.clone().sub(a), m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0)).setPosition(a.clone().add(b).multiplyScalar(0.5));
    return new THREE.BoxGeometry(w, h, d.length()).applyMatrix4(m);
  };
  const n = 12; // arched tie (lower chord): a flat arc from eaves to eaves, 1.4 m rise
  const arc = (t: number) => P(-halfW + 2 * halfW * t, wallH + 1.4 * Math.sin(Math.PI * t));
  for (let i = 0; i < n; i++) parts.push(bar(arc(i / n), arc((i + 1) / n), 0.12, 0.18));
  const ridge = P(0, ridgeH - 0.15);
  parts.push(bar(P(-halfW, wallH), ridge, 0.1, 0.16), bar(P(halfW, wallH), ridge, 0.1, 0.16)); // rafters
  for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) { // posts from the tie to the rafters, with diagonals
    const a = arc(t), yr = wallH + (ridgeH - 0.15 - wallH) * (1 - Math.abs(2 * t - 1));
    parts.push(bar(a, P(a.x, yr), 0.06));
    if (t !== 0.5) parts.push(bar(a, P(a.x + (t < 0.5 ? 2.4 : -2.4), wallH + (ridgeH - 0.15 - wallH) * (1 - Math.abs(2 * (t + (t < 0.5 ? 0.15 : -0.15)) - 1))), 0.05));
  }
  for (const s of [-1, 1]) parts.push(new THREE.TorusGeometry(0.42, 0.04, 6, 16, Math.PI / 2).rotateZ(s > 0 ? Math.PI : -Math.PI / 2).translate(s * (halfW - 0.45), wallH + 0.45, z)); // spandrel curls (Art Nouveau)
  return merge(parts);
}

/** Speech-bubble silhouette (rounded blob + tail) extruded: generic sculptural prop. */
export function bubbleGeometry(w: number, h: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const r = h / 2;
  s.moveTo(-w / 2 + r, -r);
  s.lineTo(w / 2 - r, -r);
  s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, r);
  s.absarc(-w / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  s.lineTo(-w / 2 + r - 0.1, -r); // the tail hangs off the lower left
  s.lineTo(-w / 2 + r - 0.25, -r - h * 0.55);
  s.lineTo(-w / 2 + r + 0.45, -r);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 24 }).translate(0, 0, -depth / 2);
}
/** Flat generic standing figure silhouette (head, shoulders, body, legs) as a shape, 1 unit tall. */
export function figureGeometry(h: number, depth = 0.05): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.absarc(0, 0.86, 0.1, 0, Math.PI * 2, false);
  const body = new THREE.Shape();
  body.moveTo(-0.17, 0.74);
  body.quadraticCurveTo(0, 0.8, 0.17, 0.74);
  body.lineTo(0.2, 0.5);
  body.lineTo(0.14, 0.5);
  body.lineTo(0.14, 0.46);
  body.lineTo(0.11, 0.04);
  body.lineTo(0.16, 0);
  body.lineTo(0.02, 0);
  body.lineTo(0, 0.4);
  body.lineTo(-0.02, 0);
  body.lineTo(-0.16, 0);
  body.lineTo(-0.11, 0.04);
  body.lineTo(-0.14, 0.46);
  body.lineTo(-0.14, 0.5);
  body.lineTo(-0.2, 0.5);
  body.closePath();
  const opt = { depth, bevelEnabled: false, curveSegments: 12 };
  return merge([new THREE.ExtrudeGeometry(s, opt), new THREE.ExtrudeGeometry(body, opt)]).scale(h, h, 1).translate(0, 0, -depth / 2);
}
