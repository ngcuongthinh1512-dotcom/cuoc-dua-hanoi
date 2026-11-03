// CETIQLO WAITING ROOM = the FORECOURT OUTSIDE the shop (owner 2026-11-03: "phòng chờ là chỗ ngoài của shop, phần cổng ra vào"):
// room-local z from the storefront (STORE.doorZ) out to the room door (cetiqloRoom DOOR_Z), full facade width + a margin. Paved
// porcelain tiles, a canopy with the CETIQLO wordmark over the glass door, planters, three low benches (seat 0.42 m < cetiqloRoom
// FLAT.minTop: no collider, the body walks through them like the shop's low fixtures), and the BIG LIVE BOARD on a free-standing
// pylon beside the door, facing the waiting area = one plane with a CanvasTexture redrawn ONLY on `cq.board` (no per-frame work).
// The street is faked: a backdrop wall (sky + building silhouettes, one canvas) closes the far side and the two sides; its colliders
// keep the body in. Budget: 6 draw calls (pavement, dark parts, wood, backdrop, fascia, screen), no extra light.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STORE } from '@race/shared/cetiqlo';
import { cetiqlo as C } from '../config.ts';
import type { Box } from '../rooms/roomPlayer.ts';
import { BRAND_RED, FONT, drawLogo } from './brand.ts';
import type { CqBoardRow } from './contract.ts';
import { BOARD_STATUS_TEXT } from './logic.ts';

const BADGE: Record<CqBoardRow['status'], { bg: string; fg: string }> = {
  playing: { bg: '#d8342c', fg: '#fff' }, waiting: { bg: '#e9ecef', fg: '#333' }, lost: { bg: '#f6c343', fg: '#3a2a00' }, drew: { bg: '#f6c343', fg: '#3a2a00' }, won: { bg: '#1d8a3a', fg: '#fff' }, done: { bg: '#8a8f98', fg: '#fff' },
};
/** The forecourt plan (room-local): z ∈ [STORE.doorZ, STORE.doorZ + depth], x ∈ ±halfW. */
export const FORECOURT = { depth: 14, halfW: STORE.halfW + 1.5, wallH: 7 };
/** Seats facing the shop / the board (−z); room-local {x, z, len} along x. */
const BENCHES = [{ x: 5.5, z: 23, len: 3.8 }, { x: 5.5, z: 25.6, len: 3.8 }, { x: -6, z: 23, len: 3.8 }];
const PLANTERS = [{ x: -13, z: 18 }, { x: 13, z: 18 }, { x: -12, z: 27.5 }, { x: 12.5, z: 27.5 }, { x: 2.2, z: 18.2 }, { x: -2.2, z: 18.2 }];

/** Draw the board (rows ≤ maxTeamsInRoom; `you` = the viewer's slot, its row highlighted). Pure canvas 2D: also unit-testable in jsdom. */
export function drawBoard(canvas: HTMLCanvasElement, rows: readonly CqBoardRow[], you: number | null, colourOf: (slot: number) => string, maxRows = 11) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#15171b';
  ctx.fillRect(0, 0, W, H);
  // header: red band, logo, title
  const head = Math.round(H * 0.14);
  ctx.fillStyle = BRAND_RED;
  ctx.fillRect(0, 0, W, head);
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${Math.round(head * 0.3)}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('CETI', 22, head * 0.32); ctx.fillText('QLO', 22, head * 0.68);
  ctx.font = `800 ${Math.round(head * 0.42)}px ${FONT}`;
  ctx.fillText('PHÒNG CHỜ · THỨ TỰ THI ĐẤU', 120, head * 0.5);
  ctx.font = `500 ${Math.round(head * 0.26)}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('WAITING AREA · PLAY ORDER', W - 22, head * 0.5);
  ctx.textAlign = 'left';
  // rows
  const top = head + 10, rowH = Math.floor((H - top - 8) / maxRows), fs = Math.round(rowH * 0.5);
  for (let i = 0; i < maxRows; i++) {
    const y = top + i * rowH, r = rows[i];
    ctx.fillStyle = i % 2 ? '#1c1f24' : '#20242a';
    ctx.fillRect(12, y, W - 24, rowH - 2);
    if (!r) { ctx.fillStyle = '#3a3f47'; ctx.font = `600 ${fs}px ${FONT}`; ctx.fillText(String(i + 1), 28, y + rowH / 2); continue; }
    if (r.slot === you) { ctx.fillStyle = 'rgba(230,0,18,.18)'; ctx.fillRect(12, y, W - 24, rowH - 2); ctx.fillStyle = BRAND_RED; ctx.fillRect(12, y, 6, rowH - 2); }
    ctx.fillStyle = r.status === 'done' ? '#6c727c' : '#fff';
    ctx.font = `700 ${fs}px ${FONT}`;
    ctx.fillText(String(r.order), 28, y + rowH / 2);
    ctx.fillStyle = colourOf(r.slot);
    ctx.beginPath(); ctx.arc(92, y + rowH / 2, fs * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = r.status === 'done' ? '#8a8f98' : '#fff';
    ctx.font = `${r.status === 'playing' ? 800 : 600} ${fs}px ${FONT}`;
    ctx.fillText(r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name, 118, y + rowH / 2);
    const label = r.status === 'waiting' && r.queuePos ? `${BOARD_STATUS_TEXT.waiting} · thứ ${r.queuePos}` : BOARD_STATUS_TEXT[r.status];
    const b = BADGE[r.status], bw = Math.round(fs * 0.62 * label.length + 28);
    const bx = W - 24 - bw, by = y + (rowH - 2) * 0.17, bh = (rowH - 2) * 0.66;
    ctx.fillStyle = b.bg; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
    ctx.fillStyle = b.fg; ctx.font = `800 ${Math.round(fs * 0.8)}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.fillText(label, bx + bw / 2, y + rowH / 2); ctx.textAlign = 'left';
  }
}

/** A Hà Nội street-front backdrop: soft sky over a row of narrow tube-house facades (silhouettes with lit windows). */
function backdropTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#dfe6ee'); sky.addColorStop(1, '#c9d2dc');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1024, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const tints = ['#d9c9a8', '#e3d3b0', '#cfc1a4', '#e8dcc4', '#d6c7ae', '#c8b89a'];
  for (let x = 0; x < 1024;) {
    const w = 40 + Math.floor(rnd() * 50), h = 90 + Math.floor(rnd() * 110);
    ctx.fillStyle = tints[Math.floor(rnd() * tints.length)]!;
    ctx.fillRect(x, 256 - h, w, h);
    ctx.fillStyle = '#9a3b2e'; ctx.fillRect(x, 256 - h - 6, w, 6); // tiled roof edge
    ctx.fillStyle = 'rgba(70,80,95,.55)';
    for (let y = 256 - h + 14; y < 240; y += 22) for (let wx = x + 8; wx < x + w - 10; wx += 16) ctx.fillRect(wx, y, 8, 12);
    x += w + 3;
  }
  ctx.fillStyle = '#b9b3a8'; ctx.fillRect(0, 236, 1024, 20); // kerb / far pavement
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Porcelain pavement tile (0.6 m) with a thin joint. */
function pavementTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#cfcac2'; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#d8d3cb'; ctx.fillRect(3, 3, 122, 122);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set((2 * FORECOURT.halfW) / 0.6, FORECOURT.depth / 0.6);
  t.anisotropy = 4;
  return t;
}
/** The canopy fascia: the logo square + the wordmark on white. */
function fasciaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1024, 128);
  drawLogo(ctx, 24, 14, 100);
  ctx.fillStyle = BRAND_RED;
  ctx.font = `900 84px ${FONT}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('CETIQLO', 150, 66);
  ctx.fillStyle = '#555'; ctx.font = `600 30px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText('PHÒNG CHỜ · WAITING AREA', 1000, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface BoardHandle {
  /** Cuboid colliders (room-local): the pavement slab, the backdrop walls, the board pylon. */
  colliders: Box[];
  draw(rows: readonly CqBoardRow[], you: number | null, colourOf: (slot: number) => string): void;
  dispose(): void;
}
/** The forecourt + board inside the room group (room-local). */
export function buildWaitingRoom(parent: THREE.Object3D): BoardHandle {
  const B = C.board, F = FORECOURT, D = STORE.doorZ, FAR = D + F.depth, W = F.halfW;
  const canvas = document.createElement('canvas');
  canvas.width = B.px; canvas.height = Math.round(B.px * B.h / B.w);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const colliders: Box[] = [];
  const dark: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [], back: THREE.BufferGeometry[] = [];
  const box = (list: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, collide = false) => {
    list.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    if (collide) colliders.push({ x, y, z, hx: w / 2, hy: h / 2, hz: d / 2 });
  };
  // pavement + its slab (continues the shop's floor-1 slab, which ends at doorZ + 1)
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, F.depth).rotateX(-Math.PI / 2).translate(0, 0.001, (D + FAR) / 2), new THREE.MeshStandardMaterial({ map: pavementTexture(), roughness: 0.75 }));
  colliders.push({ x: 0, y: -0.5, z: (D + FAR) / 2, hx: W + 1, hy: 0.5, hz: F.depth / 2 + 0.5 });
  // the street backdrop: far wall + two side walls (drawn inward), colliders keep the body in
  const wall = (w: number, x: number, z: number, yaw: number) => { const g = new THREE.PlaneGeometry(w, F.wallH).translate(0, F.wallH / 2, 0); g.rotateY(yaw); g.translate(x, 0, z); back.push(g); };
  wall(2 * W, 0, FAR, Math.PI); // far side, faces −z
  wall(F.depth, -W, (D + FAR) / 2, Math.PI / 2); // west, faces +x
  wall(F.depth, W, (D + FAR) / 2, -Math.PI / 2); // east, faces −x
  colliders.push({ x: 0, y: F.wallH / 2, z: FAR + 0.3, hx: W + 1, hy: F.wallH / 2, hz: 0.3 }, { x: -W - 0.3, y: F.wallH / 2, z: (D + FAR) / 2, hx: 0.3, hy: F.wallH / 2, hz: F.depth / 2 + 1 }, { x: W + 0.3, y: F.wallH / 2, z: (D + FAR) / 2, hx: 0.3, hy: F.wallH / 2, hz: F.depth / 2 + 1 });
  for (const sx of [-1, 1]) box(dark, W - STORE.halfW, 4.4, 0.3, sx * (W + STORE.halfW) / 2, 2.2, D, true); // facade returns beyond the glass
  // canopy over the door: dark slab + white fascia with the wordmark, two slim posts
  box(dark, 9, 0.22, 2.4, 0, 3.75, D + 1.2);
  for (const sx of [-1, 1]) box(dark, 0.12, 3.64, 0.12, sx * 4.3, 1.82, D + 2.3, true);
  const fascia = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), new THREE.MeshBasicMaterial({ map: fasciaTexture(), toneMapped: false }));
  fascia.position.set(0, 4.4, D + 2.41);
  // benches (no collider: seat under FLAT.minTop) + planters (dark box, green top)
  for (const b of BENCHES) {
    box(wood, b.len, 0.06, 0.45, b.x, 0.42, b.z);
    box(wood, b.len, 0.42, 0.04, b.x, 0.6, b.z + 0.24); // backrest on the street side: people face the shop / the board
    for (const sx of [-1, 1]) box(dark, 0.05, 0.39, 0.4, b.x + sx * (b.len / 2 - 0.15), 0.195, b.z);
  }
  const plant: THREE.BufferGeometry[] = [];
  for (const p of PLANTERS) { box(dark, 0.7, 0.5, 0.7, p.x, 0.25, p.z, true); plant.push(new THREE.SphereGeometry(0.42, 8, 6).translate(p.x, 0.78, p.z)); }
  // the board on a free-standing pylon beside the door, screen facing +z (the waiting area)
  box(dark, B.w + 0.2, B.h + 0.2, 0.16, B.x, B.y, B.z, true); // frame / pylon body
  box(dark, 0.6, B.y - B.h / 2 - 0.1 + 0.05, 0.4, B.x, (B.y - B.h / 2 - 0.1) / 2, B.z, true); // the stem
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(B.x, B.y, B.z + 0.085);
  const mats = {
    dark: new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ color: '#f1e8d8', roughness: 0.6 }),
    back: new THREE.MeshBasicMaterial({ map: backdropTexture(), toneMapped: false }),
    plant: new THREE.MeshStandardMaterial({ color: '#4f8a3f', roughness: 0.9, flatShading: true }),
  };
  const meshes: THREE.Mesh[] = [
    pave, fascia, screen,
    new THREE.Mesh(mergeGeometries(dark, false)!, mats.dark), new THREE.Mesh(mergeGeometries(wood, false)!, mats.wood),
    new THREE.Mesh(mergeGeometries(back, false)!, mats.back), new THREE.Mesh(mergeGeometries(plant, false)!, mats.plant),
  ];
  for (const m of meshes) { m.matrixAutoUpdate = false; m.updateMatrix(); m.name = 'forecourt'; parent.add(m); }
  drawBoard(canvas, [], null, () => '#888');
  tex.needsUpdate = true;
  return {
    colliders,
    draw(rows, you, colourOf) { drawBoard(canvas, rows, you, colourOf); tex.needsUpdate = true; },
    dispose() {
      for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); const mm = m.material as THREE.MeshStandardMaterial; mm.map?.dispose(); mm.dispose(); }
      tex.dispose();
    },
  };
}
