// CETIQLO waiting room (owner 2026-11-03): the lobby (room-local z 10..16, glass to the sales floor) gets seating and a wall-mounted
// LIVE BOARD = one plane with a CanvasTexture on the lobby side of the glass partition, east of the opening (config `cetiqlo.board`),
// redrawn ONLY when a `cq.board` message arrives (no per-frame work); the same rows feed the HUD panel (hud.ts). Benches are low
// (seat 0.42 m < cetiqloRoom FLAT.minTop) so they never get a collider: the body walks through them like the shop's low fixtures.
// Budget: 3 draw calls (dark frame + legs, ash wood seats, the screen).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cetiqlo as C } from '../config.ts';
import type { CqBoardRow } from './contract.ts';
import { BOARD_STATUS_TEXT } from './logic.ts';

const RED = '#E60012';
const BADGE: Record<CqBoardRow['status'], { bg: string; fg: string }> = {
  playing: { bg: '#d8342c', fg: '#fff' }, waiting: { bg: '#e9ecef', fg: '#333' }, lost: { bg: '#f6c343', fg: '#3a2a00' }, drew: { bg: '#f6c343', fg: '#3a2a00' }, won: { bg: '#1d8a3a', fg: '#fff' }, done: { bg: '#8a8f98', fg: '#fff' },
};
/** Seats: two rows facing the board (east), one row on the west side; room-local {x, z, len} (along x), facing −z. */
const BENCHES = [{ x: 4.5, z: 12.4, len: 3.8 }, { x: 4.5, z: 14.0, len: 3.8 }, { x: -4.5, z: 12.4, len: 3.8 }];

/** Draw the board (rows ≤ maxTeamsInRoom; `you` = the viewer's slot, its row highlighted). Pure canvas 2D: also unit-testable in jsdom. */
export function drawBoard(canvas: HTMLCanvasElement, rows: readonly CqBoardRow[], you: number | null, colourOf: (slot: number) => string, maxRows = 11) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#15171b';
  ctx.fillRect(0, 0, W, H);
  // header: red band, logo, title
  const head = Math.round(H * 0.14);
  ctx.fillStyle = RED;
  ctx.fillRect(0, 0, W, head);
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${Math.round(head * 0.3)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('CETI', 22, head * 0.32); ctx.fillText('QLO', 22, head * 0.68);
  ctx.font = `800 ${Math.round(head * 0.42)}px system-ui, sans-serif`;
  ctx.fillText('PHÒNG CHỜ · THỨ TỰ THI ĐẤU', 120, head * 0.5);
  ctx.font = `500 ${Math.round(head * 0.26)}px system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('WAITING ROOM · PLAY ORDER', W - 22, head * 0.5);
  ctx.textAlign = 'left';
  // rows
  const top = head + 10, rowH = Math.floor((H - top - 8) / maxRows), fs = Math.round(rowH * 0.5);
  for (let i = 0; i < maxRows; i++) {
    const y = top + i * rowH, r = rows[i];
    ctx.fillStyle = i % 2 ? '#1c1f24' : '#20242a';
    ctx.fillRect(12, y, W - 24, rowH - 2);
    if (!r) { ctx.fillStyle = '#3a3f47'; ctx.font = `600 ${fs}px system-ui, sans-serif`; ctx.fillText(String(i + 1), 28, y + rowH / 2); continue; }
    if (r.slot === you) { ctx.fillStyle = 'rgba(230,0,18,.18)'; ctx.fillRect(12, y, W - 24, rowH - 2); ctx.fillStyle = RED; ctx.fillRect(12, y, 6, rowH - 2); }
    ctx.fillStyle = r.status === 'done' ? '#6c727c' : '#fff';
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    ctx.fillText(String(r.order), 28, y + rowH / 2);
    ctx.fillStyle = colourOf(r.slot);
    ctx.beginPath(); ctx.arc(92, y + rowH / 2, fs * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = r.status === 'done' ? '#8a8f98' : '#fff';
    ctx.font = `${r.status === 'playing' ? 800 : 600} ${fs}px system-ui, sans-serif`;
    ctx.fillText(r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name, 118, y + rowH / 2);
    const label = r.status === 'waiting' && r.queuePos ? `${BOARD_STATUS_TEXT.waiting} · thứ ${r.queuePos}` : BOARD_STATUS_TEXT[r.status];
    const b = BADGE[r.status], bw = Math.round(fs * 0.62 * label.length + 28);
    const bx = W - 24 - bw, by = y + (rowH - 2) * 0.17, bh = (rowH - 2) * 0.66;
    ctx.fillStyle = b.bg; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
    ctx.fillStyle = b.fg; ctx.font = `800 ${Math.round(fs * 0.8)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.fillText(label, bx + bw / 2, y + rowH / 2); ctx.textAlign = 'left';
  }
}

export interface BoardHandle { draw(rows: readonly CqBoardRow[], you: number | null, colourOf: (slot: number) => string): void; dispose(): void }
/** The waiting room's furniture + screen inside the room group (room-local). */
export function buildWaitingRoom(parent: THREE.Object3D): BoardHandle {
  const B = C.board;
  const canvas = document.createElement('canvas');
  canvas.width = B.px; canvas.height = Math.round(B.px * B.h / B.w);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const dark: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
  const box = (list: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => list.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  box(dark, B.w + 0.2, B.h + 0.2, 0.08, B.x, B.y, B.z + 0.06); // frame on the glass
  box(dark, 0.5, 0.05, 0.6, B.x, 0.7 + 0.025, B.z + 0.3); // a shelf-like ledge under it (the "control box")
  for (const b of BENCHES) {
    box(wood, b.len, 0.06, 0.45, b.x, 0.42, b.z);
    box(wood, b.len, 0.42, 0.04, b.x, 0.21 + 0.42 - 0.03, b.z + 0.24); // backrest (facing −z = the board / the shop)
    for (const sx of [-1, 1]) box(dark, 0.05, 0.39, 0.4, b.x + sx * (b.len / 2 - 0.15), 0.195, b.z);
  }
  const matDark = new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.7 });
  const matWood = new THREE.MeshStandardMaterial({ color: '#f1e8d8', roughness: 0.6 });
  const matScreen = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const meshes: THREE.Mesh[] = [new THREE.Mesh(mergeGeometries(dark, false)!, matDark), new THREE.Mesh(mergeGeometries(wood, false)!, matWood)];
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), matScreen);
  screen.position.set(B.x, B.y, B.z + 0.105); // in front of the frame, facing +z (the door / the people waiting)
  meshes.push(screen);
  for (const m of meshes) { m.matrixAutoUpdate = false; m.updateMatrix(); m.name = 'waiting-room'; parent.add(m); }
  drawBoard(canvas, [], null, () => '#888');
  tex.needsUpdate = true;
  return {
    draw(rows, you, colourOf) { drawBoard(canvas, rows, you, colourOf); tex.needsUpdate = true; },
    dispose() { for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); } tex.dispose(); matDark.dispose(); matWood.dispose(); matScreen.dispose(); },
  };
}
