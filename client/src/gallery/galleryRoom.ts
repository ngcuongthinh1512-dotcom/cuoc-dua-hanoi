// "Phòng tranh truyện tranh" — a Brussels comic-strip gallery / drawing studio in the spirit of the Belgian Comic Strip
// Center (Horta's Waucquez hall): iron-and-glass gable roof on riveted trusses, engaged iron columns, herringbone parquet,
// framed abstract comic prints, daylight through the roof and the tall right-hand windows, 11 identical draughtsman's desks
// (one per team) along the long walls, each with a "Bắt đầu" pedestal button that opens the Ligne Claire drawing game
// (public/games/ligne-claire.html, snapshot) in a letterboxed overlay. `mountRoom(opts)` (rooms/types.ts) builds the room as
// ONE group in room-local metres (door at +z = G.halfL, rooms/roomFrame.ts) into the given scene, the overlay DOM and the
// exit ring; the dev page (gallery.ts) adds its own walker / camera / composer, the race (main.ts) walks the game's body on
// colliders put into the game's Rapier world, `rooms.below` m under the branch box, next to the other teams in the room.
// Privacy: the tally (overlay, hint) is the OWN desk's only. Minimal graphics by default (`?hq=1`: shadows, bloom, every light).
// Dev params (gallery.ts): team=1..11 (that desk highlighted, the avatar spawns at it, only its button works; without it every
// button works) · view=overview|desk|plan / cam=x,y,z,yawDeg,pitchDeg / fly=1 · open=1 (overlay open at start) · skip=1 (with
// open: the "Bỏ qua" confirm open) · done=n (with team: seeds n passed drawings) · post=0 · avatar=0|1, autoMove=walk|sprint.
// Controls: the game's avatar (WASD, Shift sprint, mouse look under pointer lock, dev V = free-fly: WASD + Q/E, Shift fast);
// F within 1.8 m of the own desk's button opens the game (never the mouse); Esc / "Thoát" leaves the overlay. The race seeds
// the game from the server's tally (postMessage 'room-init') and reports results through onResult.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BULB_LOCAL, BUTTON_LOCAL, DESK_BOX, DESK_TILT, type DeskSlot, G, SHEET_LOCAL, type Slot, TEAMS, type Team, bubbleGeometry, buttonGeometry, columnSlots, deskGeometry,
  deskLocal, deskSlots, figureGeometry, frameSlots, trussGeometry, windowSlots, clampRoom,
} from './galleryBuild.ts';
import { makeExitRing } from '../rooms/exitRing.ts';
import { groupPose, toLocal, toWorld } from '../rooms/roomFrame.ts';
import { type Box, createRoomPlayer, nearestButton, shellBoxes, slotBox } from '../rooms/roomPlayer.ts';
import type { RoomHandle, RoomMountOptions } from '../rooms/types.ts';

// ---- procedural textures (module level: one page lifetime, shared by every mount; never disposed) -----------------------
let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
function canvasTex(w: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, rep = 1, h = w): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const parquetTex = canvasTex(512, (c, s) => { // herringbone oak: two interleaved families of 45° blocks
  c.fillStyle = '#b07a44';
  c.fillRect(0, 0, s, s);
  const L = s / 4, W = L / 4;
  c.save();
  c.translate(s / 2, s / 2);
  c.rotate(Math.PI / 4);
  for (let i = -8; i < 8; i++) for (let j = -8; j < 8; j++) {
    const even = (i + j) % 2 === 0, x = i * L, y = j * L;
    const g = c.createLinearGradient(x, y, x + (even ? L : 0), y + (even ? 0 : L));
    const base = 150 + rnd() * 50, t = rnd() * 0.5;
    g.addColorStop(0, `rgb(${base + 20},${base * 0.62 + 10},${base * 0.36})`);
    g.addColorStop(1, `rgb(${base - 20 * t},${base * 0.6 - 10 * t},${base * 0.33})`);
    c.fillStyle = g;
    if (even) c.fillRect(x, y, L, W); else c.fillRect(x, y, W, L);
    c.strokeStyle = 'rgba(60,30,10,0.55)';
    c.lineWidth = 1.2;
    if (even) c.strokeRect(x, y, L, W); else c.strokeRect(x, y, W, L);
    c.strokeStyle = 'rgba(80,45,15,0.25)'; // grain
    for (let k = 0; k < 4; k++) { c.beginPath(); if (even) { const yy = y + W * (k + 0.5) / 4; c.moveTo(x, yy); c.lineTo(x + L, yy + (rnd() - 0.5) * 3); } else { const xx = x + W * (k + 0.5) / 4; c.moveTo(xx, y); c.lineTo(xx + (rnd() - 0.5) * 3, y + L); } c.stroke(); }
  }
  c.restore();
}, 10);
const plasterTex = (base: string, cloud: string) => canvasTex(512, (c, s) => {
  c.fillStyle = base;
  c.fillRect(0, 0, s, s);
  for (let i = 0; i < 26; i++) { const x = rnd() * s, y = rnd() * s, r = s * (0.1 + 0.25 * rnd()), g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${cloud},0.08)`); g.addColorStop(1, `rgba(${cloud},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (let i = 0; i < 5000; i++) { const v = 150 + rnd() * 100; c.fillStyle = `rgba(${v},${v},${v},0.05)`; c.fillRect(rnd() * s, rnd() * s, 2, 2); }
}, 2);
const skyTex = canvasTex(64, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5d93d6'); g.addColorStop(0.45, '#a9c9ea'); g.addColorStop(0.75, '#e8eef3'); g.addColorStop(1, '#d9ddd8'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, 1, 256);
// comic page art: 16 atlas cells, each a page of flat-colour panels with abstract shapes, a silhouette, motion lines and a bubble
const PAL = ['#f2c14e', '#e63b2e', '#3a7bd5', '#7cc24a', '#8fd3ff', '#f29a3e', '#1d2b55', '#fff3d0', '#bfe3f7', '#f7a8c4', '#2f8f4e', '#e9c982'];
function comicPage(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, rows: number) {
  c.fillStyle = '#f6ecd4';
  c.fillRect(x0, y0, w, h);
  const gut = w * 0.035, ph = (h - gut * (rows + 1)) / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 1 + Math.floor(rnd() * 3), pw = (w - gut * (cols + 1)) / cols;
    for (let k = 0; k < cols; k++) {
      const x = x0 + gut + k * (pw + gut), y = y0 + gut + r * (ph + gut);
      c.fillStyle = pick(PAL);
      c.fillRect(x, y, pw, ph);
      c.save();
      c.beginPath();
      c.rect(x, y, pw, ph);
      c.clip();
      const kind = rnd();
      if (kind < 0.35) { // horizon + sun / building blocks
        c.fillStyle = pick(PAL); c.fillRect(x, y + ph * 0.6, pw, ph * 0.4);
        c.fillStyle = '#15131a'; for (let b = 0; b < 4; b++) c.fillRect(x + pw * (0.05 + b * 0.24), y + ph * (0.25 + rnd() * 0.3), pw * 0.16, ph);
        c.fillStyle = '#fff3d0'; c.beginPath(); c.arc(x + pw * 0.75, y + ph * 0.25, Math.min(pw, ph) * 0.14, 0, 7); c.fill();
      } else if (kind < 0.7) { // silhouette figure walking + motion lines
        c.fillStyle = '#15131a';
        const fx = x + pw * (0.3 + rnd() * 0.4), fy = y + ph * 0.92, sc = ph * 0.75;
        c.beginPath(); c.arc(fx, fy - sc * 0.86, sc * 0.1, 0, 7); c.fill();
        c.beginPath(); c.moveTo(fx - sc * 0.16, fy - sc * 0.74); c.lineTo(fx + sc * 0.16, fy - sc * 0.74); c.lineTo(fx + sc * 0.12, fy - sc * 0.4); c.lineTo(fx + sc * 0.22, fy); c.lineTo(fx + sc * 0.1, fy); c.lineTo(fx, fy - sc * 0.3); c.lineTo(fx - sc * 0.14, fy); c.lineTo(fx - sc * 0.26, fy); c.lineTo(fx - sc * 0.1, fy - sc * 0.42); c.closePath(); c.fill();
        c.strokeStyle = '#15131a'; c.lineWidth = 2; for (let m = 0; m < 4; m++) { c.beginPath(); c.moveTo(x + pw * 0.05, fy - sc * (0.3 + m * 0.12)); c.lineTo(fx - sc * 0.3, fy - sc * (0.3 + m * 0.12)); c.stroke(); }
      } else { // halftone dots + a big abstract blob
        c.fillStyle = 'rgba(21,19,26,0.35)'; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.beginPath(); c.arc(x + pw * (i + 0.5) / 8, y + ph * (j + 0.5) / 8, Math.min(pw, ph) * 0.03 * (0.5 + rnd()), 0, 7); c.fill(); }
        c.fillStyle = pick(PAL); c.beginPath(); c.ellipse(x + pw * 0.5, y + ph * 0.55, pw * 0.3, ph * 0.3, rnd(), 0, 7); c.fill();
      }
      if (rnd() < 0.6) { // speech bubble with squiggle text
        const bx = x + pw * (0.2 + rnd() * 0.4), by = y + ph * 0.22, bw = pw * 0.3, bh = ph * 0.18;
        c.fillStyle = '#fff'; c.strokeStyle = '#15131a'; c.lineWidth = 2.5;
        c.beginPath(); c.ellipse(bx, by, bw, bh, 0, 0, 7); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(bx - bw * 0.3, by + bh * 0.9); c.lineTo(bx - bw * 0.5, by + bh * 1.8); c.lineTo(bx, by + bh * 0.95); c.closePath(); c.fill(); c.stroke();
        c.lineWidth = 1.5; for (let t = 0; t < 2; t++) { c.beginPath(); c.moveTo(bx - bw * 0.55, by - bh * 0.3 + t * bh * 0.5); for (let u = 0; u < 8; u++) c.lineTo(bx - bw * 0.55 + (u + 1) * bw * 0.14, by - bh * 0.3 + t * bh * 0.5 + (rnd() - 0.5) * bh * 0.3); c.stroke(); }
      }
      c.restore();
      c.strokeStyle = '#15131a';
      c.lineWidth = Math.max(2, w * 0.012);
      c.strokeRect(x, y, pw, ph);
    }
  }
}
const artAtlas = canvasTex(1024, (c) => { for (let i = 0; i < 16; i++) comicPage(c, (i % 4) * 256 + 8, Math.floor(i / 4) * 256 + 8, 240, 240, 2 + Math.floor(rnd() * 2)); });
const muralTex = canvasTex(1024, (c, w, h) => { comicPage(c, 0, 0, w, h, 2); c.fillStyle = '#15131a'; c.font = 'bold 60px "Marker Felt","Comic Sans MS",system-ui'; c.textAlign = 'right'; c.fillText('ATELIER BD · BRUXELLES', w - 40, h - 36); c.fillStyle = '#f6ecd4'; c.fillText('ATELIER BD · BRUXELLES', w - 44, h - 40); }, 1, 576);
const sketchTex = canvasTex(256, (c, s) => { // pencil sketch on paper: construction circles and a loose figure
  c.fillStyle = '#f8f2e2';
  c.fillRect(0, 0, s, s);
  c.strokeStyle = 'rgba(60,60,80,0.55)';
  c.lineWidth = 1.5;
  c.beginPath(); c.arc(s * 0.5, s * 0.3, s * 0.11, 0, 7); c.stroke();
  c.beginPath(); c.ellipse(s * 0.5, s * 0.62, s * 0.16, s * 0.22, 0, 0, 7); c.stroke();
  for (let i = 0; i < 24; i++) { c.beginPath(); const x = s * (0.2 + 0.6 * rnd()), y = s * (0.15 + 0.75 * rnd()); c.moveTo(x, y); c.bezierCurveTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 60, x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 60, x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 40); c.stroke(); }
  c.strokeStyle = 'rgba(40,80,160,0.35)'; c.strokeRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88);
});
const labelTex = canvasTex(256, (c, w, h) => { c.fillStyle = '#2a1a0c'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8c87a'; c.font = 'bold 54px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BẮT ĐẦU', w / 2, h / 2 + 2); c.strokeStyle = '#e8c87a'; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, h - 16); }, 1, 96);

// ---- materials -----------------------------------------------------------------------------------------------------
const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
export const PROMPT = 'Bấm F để bắt đầu', WRONG = 'Đây không phải bàn của đội bạn', LOCKED = 'Bạn đã đổi lựa chọn kép – ra khỏi phòng để đi tiếp';
// minimal graphics (default): round things at half the segments (never under 6); `hq` = the full count
let lowPoly = true;
const SEG = (n: number) => (lowPoly ? Math.max(6, Math.round(n / 2)) : n);
const cylG = (rt: number, rb: number, h: number, n: number, hs = 1, open = false) => new THREE.CylinderGeometry(rt, rb, h, SEG(n), hs, open);
const torus = (r: number, t: number, rs: number, ts: number, arc?: number) => new THREE.TorusGeometry(r, t, SEG(rs), SEG(ts), arc);
const sphere = (r: number, w: number, h: number) => new THREE.SphereGeometry(r, SEG(w), SEG(h));
const M = {
  parquet: std({ map: parquetTex, roughness: 0.45, metalness: 0.05 }),
  wall: std({ map: plasterTex('#efe6d6', '120,95,60'), side: THREE.DoubleSide }),
  dado: std({ map: plasterTex('#c9b89a', '90,70,40'), roughness: 0.7 }),
  iron: std({ color: '#3c4a44', metalness: 0.65, roughness: 0.5 }), // Horta green-grey painted iron
  ironLight: std({ color: '#5a6a62', metalness: 0.6, roughness: 0.5 }),
  brass: std({ color: '#c99a3c', metalness: 0.9, roughness: 0.3 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#dff0ff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, transmission: 0, side: THREE.DoubleSide, depthWrite: false }),
  sky: new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide }),
  daylight: new THREE.MeshBasicMaterial({ color: '#e4eefb' }),
  frameWood: std({ color: '#1d1a17', roughness: 0.45 }),
  mat: std({ color: '#f7f2e6', roughness: 0.95 }),
  art: std({ map: artAtlas, roughness: 0.9 }),
  mural: std({ map: muralTex, roughness: 0.9 }),
  deskWood: std({ color: '#8d5a2b', roughness: 0.5 }),
  darkWood: std({ color: '#3b2614', roughness: 0.55 }),
  black: std({ color: '#1a1a1c', roughness: 0.6 }),
  paper: std({ color: '#fbf7ec', roughness: 0.95 }),
  sketch: std({ map: sketchTex, roughness: 0.95 }),
  bulb: std({ color: '#fff6dc', emissive: '#ffe2a0', emissiveIntensity: 2.8 }),
  cushion: std({ color: '#7b2c2c', roughness: 0.95 }),
  white: std({ color: '#f7f7f4', roughness: 0.7 }),
  silhouette: std({ color: '#15131a', roughness: 0.6 }),
  label: std({ map: labelTex, roughness: 0.7 }),
  bench: std({ color: '#4a2f1a', roughness: 0.6 }),
  leather: std({ color: '#2d4a3e', roughness: 0.8 }),
};
M.wall.map!.repeat.set(4, 2);
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const slotMatrix = (s: Slot, scale = 1) => new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), new THREE.Vector3(scale, scale, scale));
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const TOTAL_DEFAULT = 9, PEN_DEFAULT = 12; // ligne-claire.html: 9 drawings

const OVERLAY_HTML = `<style>
#xh{position:fixed;left:50%;top:50%;width:14px;height:14px;margin:-7px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px #000a;pointer-events:none;display:none}
#gl-help{position:fixed;left:14px;bottom:12px;padding:6px 10px;border-radius:8px;background:#15131a99;color:#fff;font:500 12px system-ui;pointer-events:none}
#ov{position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background:#0c0a08f2;z-index:10;font:15px system-ui,sans-serif;color:#f7efdc}
#ov.on{display:flex}
#ovBox{display:flex;flex-direction:column;width:min(100vw,1680px);height:100vh}
#ovBar{display:flex;align-items:center;gap:14px;height:52px;padding:0 16px;background:#1d1611;border-bottom:2px solid #3a2a1c}
#ovBar .sw{width:18px;height:18px;border-radius:50%;border:2px solid #fff8;box-shadow:0 0 8px #000a}
#ovBar b{font-size:17px}#ovBar .tl{color:#e8c87a;font-weight:600}#ovBar .sp{flex:1}
#ovBar button{padding:7px 16px;border:2px solid #e8c87a;border-radius:8px;background:#2a1a0c;color:#f7e6c4;font:700 14px system-ui;cursor:pointer}
#ovBar button:hover{background:#3f2a14}#ov .ovSkip{padding:10px 22px;border:2px solid #ff8c5a;border-radius:10px;background:linear-gradient(#e8651f,#b3261e);color:#fff;font:800 16px system-ui;cursor:pointer;box-shadow:0 0 14px #ff8c5a66}#ov .ovSkip:hover{filter:brightness(1.12);background:linear-gradient(#f0774a,#c43a2a)}.ovSkip[hidden]{display:none}#ovBottom{display:flex;justify-content:center;padding:10px 0 12px;background:#1d1611}
#ovFrame{display:block;width:100%;flex:1;border:0;background:#4e3119}
#ovModal,#ovEnd{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#1a0e06b8;backdrop-filter:blur(3px)}
#ovModal.on,#ovEnd.on{display:flex}
.card{max-width:520px;padding:30px 32px 26px;background:linear-gradient(#fffbe9,#f4e8cc);color:#3a2410;text-align:center;box-shadow:0 30px 60px #000c;transform:rotate(-1deg);border:3px solid #15131a}
.card h2{margin:0 0 10px;font:900 26px "Marker Felt","Chalkboard SE","Comic Sans MS",ui-rounded,sans-serif;color:#b3261e}.card p{margin:0 0 20px;line-height:1.5;font-size:16px}.card b{color:#b3261e}
.card .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.card button{padding:12px 22px;border:3px solid #2a1608;border-radius:10px;font:900 16px system-ui;cursor:pointer;box-shadow:0 5px 0 #7a5a18}
.card .no{background:linear-gradient(#f3d58a,#c99a3c);color:#2a1608}.card .yes{background:linear-gradient(#e86a5a,#b3261e);color:#fff;box-shadow:0 5px 0 #5a1208}
#gl-prompt{position:fixed;left:50%;bottom:22%;transform:translateX(-50%);padding:6px 16px;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;font:600 18px system-ui,sans-serif;text-shadow:0 1px 2px #000;pointer-events:none;white-space:nowrap}#gl-prompt.off{color:#bbb}
</style><div id="xh"></div><div id="gl-prompt" hidden></div><div id="gl-help">WASD đi · chuột nhìn quanh (nhấp để khoá) · Shift chạy · <b>F</b> bắt đầu ở bàn của đội · V bay tự do</div>
<div id="ov"><div id="ovBox"><div id="ovBar"><span class="sw"></span><b id="ovTeam"></b><span class="tl" id="ovTally"></span><span class="sp"></span><button id="ovSkip" class="ovSkip" title="Bỏ thử thách và nhận phạt tại vạch đích">⚑ Bỏ thử thách</button><button id="ovExit">Thoát (Esc)</button></div><iframe id="ovFrame" title="Nét Mực Ligne Claire"></iframe><div id="ovBottom"><button id="ovSkip2" class="ovSkip" title="Bỏ thử thách và nhận phạt tại vạch đích">⚑ Bỏ thử thách và nhận phạt tại vạch đích</button></div></div>
<div id="ovModal"><div class="card"><h2>Bỏ thử thách?</h2><p id="ovModalText"></p><div class="row"><button class="no" id="ovBack">Quay lại làm tiếp</button><button class="yes" id="ovConfirm">Bỏ thử thách và nhận phạt</button></div></div></div>
<div id="ovEnd"><div class="card"><h2 id="ovEndTitle"></h2><p id="ovEndText"></p><div class="row"><button class="no" id="ovEndClose">Về phòng tranh</button></div></div></div></div>`;

interface Progress { done: number; skipped: boolean; penaltyMinutes: number; total: number }

/** Room-local z of the door end (rooms/roomFrame.ts: the box stands here). */
export const DOOR_Z = G.halfL;

export async function mountRoom(o: RoomMountOptions): Promise<RoomHandle> {
  const { renderer, scene, frame } = o;
  const RACE = !!o.world || !!o.viewer; // the race (colliders) or a watching spectator (drawn only)
  const HQ = !!o.hq;
  lowPoly = !HQ;
  const q = RACE ? new URLSearchParams() : o.q; // the race reads none of the dev params
  const TEAM = o.team?.slot ?? (Number(q.get('team')) || 0), PLAN = q.get('view') === 'plan';
  const TOTAL = o.room?.total ?? TOTAL_DEFAULT, PEN = o.room?.penaltyMinutesEach ?? PEN_DEFAULT;
  const teamOf = (slot: number): Team => {
    const t = o.team?.slot === slot ? o.team : o.teams?.find((x) => x.slot === slot);
    return t ? { slot, name: t.name, color: t.colour } : TEAMS[slot - 1]!; // a team not in the list yet: its desk keeps its own colour (the 11 fixed ones)
  };
  const teams = TEAMS.map((t) => teamOf(t.slot));
  const was = { exposure: renderer.toneMappingExposure, background: scene.background, fog: scene.fog, environment: scene.environment, envIntensity: scene.environmentIntensity, pixelRatio: renderer.getPixelRatio() };
  renderer.toneMappingExposure = 0.9;
  scene.background = null;
  scene.fog = null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  const g = new THREE.Group();
  g.name = 'room';
  const gp = groupPose(frame);
  g.position.set(gp.x, gp.y, gp.z);
  g.rotation.y = gp.yaw;
  scene.add(g);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = g) => { const mesh = new THREE.Mesh(geo, m); parent.add(mesh); return mesh; };
  const merged = (parts: THREE.BufferGeometry[], m: THREE.Material) => add(mergeGeometries(parts, false)!, m);
  function instanced(geo: THREE.BufferGeometry, m: THREE.Material, slots: Slot[], shadow = true, tint?: (i: number) => THREE.Color) {
    const im = new THREE.InstancedMesh(geo, m, slots.length);
    slots.forEach((s, i) => { im.setMatrixAt(i, slotMatrix(s)); if (tint) im.setColorAt(i, tint(i)); });
    im.castShadow = im.receiveShadow = shadow && HQ;
    g.add(im);
    return im;
  }

  // ---- hall shell: parquet, walls, dado, columns, eaves girder, trusses, glass roof, sky --------------------------------
  const { halfW, halfL, wallH, ridgeH } = G;
  add(new THREE.PlaneGeometry(2 * halfW, 2 * halfL).rotateX(-Math.PI / 2), M.parquet).receiveShadow = HQ;
  {
    const walls = [box(0.02, wallH, 2 * halfL, -halfW, wallH / 2, 0), box(2 * halfW, wallH, 0.02, 0, wallH / 2, -halfL), box(2 * halfW, wallH, 0.02, 0, wallH / 2, halfL)]; // the right wall is built around its windows below
    // gable triangles above the end walls
    const gable = (z: number) => { const s = new THREE.Shape([new THREE.Vector2(-halfW, wallH), new THREE.Vector2(halfW, wallH), new THREE.Vector2(0, ridgeH)]); return new THREE.ShapeGeometry(s).translate(0, 0, z); };
    merged([...walls, gable(-halfL), gable(halfL)], M.wall).receiveShadow = HQ;
    merged([box(0.12, 1.1, 2 * halfL, -halfW + 0.06, 0.55, 0), box(0.12, 1.1, 2 * halfL, halfW - 0.06, 0.55, 0), box(2 * halfW, 1.1, 0.12, 0, 0.55, -halfL + 0.06), box(2 * halfW, 1.1, 0.12, 0, 0.55, halfL - 0.06)], M.dado).receiveShadow = HQ; // dado
    merged([box(0.16, 0.08, 2 * halfL, -halfW + 0.08, 1.12, 0), box(0.16, 0.08, 2 * halfL, halfW - 0.08, 1.12, 0), box(2 * halfW, 0.08, 0.16, 0, 1.12, -halfL + 0.08), box(2 * halfW, 0.08, 0.16, 0, 1.12, halfL - 0.08)], M.darkWood); // dado rail
    merged([box(0.3, 0.5, 2 * halfL, -halfW + 0.15, wallH - 0.25, 0), box(0.3, 0.5, 2 * halfL, halfW - 0.15, wallH - 0.25, 0)], M.iron); // eaves girders
    merged([box(0.3, 0.12, 2 * halfL, -halfW + 0.15, wallH - 0.56, 0), box(0.3, 0.12, 2 * halfL, halfW - 0.15, wallH - 0.56, 0)], M.brass); // gilded fillet under the girder
  }
  { // engaged iron columns with ring mouldings and leaf capitals (Art Nouveau), brackets to the girder
    const col = mergeGeometries([
      cylG(0.17, 0.2, wallH - 1.2, 20).translate(0, (wallH - 1.2) / 2 + 0.35, 0),
      cylG(0.28, 0.3, 0.35, 20).translate(0, 0.175, 0),
      torus(0.19, 0.03, 8, 20).rotateX(Math.PI / 2).translate(0, 1.15, 0),
      torus(0.19, 0.03, 8, 20).rotateX(Math.PI / 2).translate(0, 3.4, 0),
      cylG(0.34, 0.2, 0.5, 20).translate(0, wallH - 0.85, 0), // capital bell
      new THREE.BoxGeometry(0.7, 0.12, 0.7).translate(0, wallH - 0.56, 0),
    ], false)!;
    instanced(col, M.ironLight, columnSlots());
    instanced(torus(0.3, 0.035, 8, 24).rotateX(Math.PI / 2), M.brass, columnSlots().map((s) => ({ ...s, y: wallH - 1.12 })));
  }
  { // roof: trusses at every pitch, purlins along the slopes, glass panes, glazing bars, ridge
    merged(G.trussZ.map(trussGeometry), M.iron).castShadow = HQ;
    const slope = Math.hypot(halfW, ridgeH - wallH), ang = Math.atan2(ridgeH - wallH, halfW), bars: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const m = new THREE.Matrix4().makeRotationZ(s * ang).setPosition(s * halfW / 2, (wallH + ridgeH) / 2, 0);
      add(new THREE.PlaneGeometry(slope, 2 * halfL).rotateX(-Math.PI / 2).applyMatrix4(m), M.glass);
      for (let k = 1; k < 5; k++) bars.push(new THREE.BoxGeometry(0.08, 0.1, 2 * halfL).translate(-slope / 2 + (slope * k) / 5, 0.05, 0).applyMatrix4(m)); // purlins
      for (let z = -halfL + 0.85; z < halfL; z += 0.85) bars.push(new THREE.BoxGeometry(slope, 0.05, 0.04).translate(0, 0.03, z).applyMatrix4(m)); // glazing bars
    }
    bars.push(new THREE.BoxGeometry(0.3, 0.24, 2 * halfL + 0.2).translate(0, ridgeH + 0.02, 0));
    merged(bars, M.iron).castShadow = HQ;
    add(new THREE.BoxGeometry(0.1, 0.5, 2 * halfL).translate(0, ridgeH + 0.3, 0), M.brass); // ridge crest
    add(sphere(80, 24, 12), M.sky); // sky seen through the glass
  }
  { // right-wall windows behind the right desks: splayed reveal, stone sill, mullion + transom, glass, a bright "outside"
    const { w, y0, y1 } = G.window, reveal: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], outs: THREE.BufferGeometry[] = [];
    for (const s of windowSlots()) {
      const h = y1 - y0, cy = s.y, x = halfW;
      reveal.push(box(0.5, h, 0.12, x - 0.25, cy, s.z - w / 2 - 0.06), box(0.5, h, 0.12, x - 0.25, cy, s.z + w / 2 + 0.06));
      reveal.push(box(0.5, 0.14, w + 0.24, x - 0.25, y1 + 0.07, s.z)); // head
      stone.push(box(0.6, 0.12, w + 0.4, x - 0.3, y0 - 0.06, s.z)); // sill
      glass.push(box(0.02, h, w, x - 0.05, cy, s.z));
      reveal.push(box(0.08, h, 0.06, x - 0.05, cy, s.z), box(0.08, 0.06, w, x - 0.05, y0 + h * 0.62, s.z)); // mullion, transom
      for (let k = 1; k < 4; k++) reveal.push(box(0.05, 0.03, w, x - 0.05, y0 + (h * 0.62 * k) / 4, s.z), box(0.05, 0.03, w, x - 0.05, y0 + h * 0.62 + (h * 0.38 * k) / 4, s.z)); // glazing bars
      outs.push(box(0.02, h + 0.6, w + 0.6, x + 0.25, cy, s.z));
      // arched top: half disc of glass + a fanlight frame
      glass.push(new THREE.CircleGeometry(w / 2, SEG(24), 0, Math.PI).rotateY(-Math.PI / 2).translate(x - 0.05, y1, s.z));
      reveal.push(torus(w / 2 + 0.06, 0.06, 8, 24, Math.PI).rotateY(-Math.PI / 2).translate(x - 0.12, y1, s.z));
      outs.push(new THREE.CircleGeometry(w / 2 + 0.3, SEG(24)).rotateY(-Math.PI / 2).translate(x + 0.25, y1, s.z));
      for (const sg of [-1, 1]) { const sp = new THREE.Shape(); sp.moveTo(0, w / 2 + 0.12); sp.lineTo(sg * (w / 2 + 0.12), w / 2 + 0.12); sp.lineTo(sg * (w / 2 + 0.12), 0); sp.absarc(0, 0, w / 2 + 0.06, sg > 0 ? 0 : Math.PI, Math.PI / 2, sg < 0); stone.push(new THREE.ShapeGeometry(sp, 16).rotateY(-Math.PI / 2).translate(x - 0.02, y1, s.z)); } // spandrels beside the arch
    }
    merged(reveal, M.iron);
    merged(stone, M.dado);
    merged(glass, M.glass);
    merged(outs, M.daylight);
    // the right wall: full-height piers between the windows + the strips under the sills and over the arches (real openings)
    const walls: THREE.BufferGeometry[] = [], edges = [-halfL, ...G.rightZ.flatMap((z) => [z - w / 2 - 0.12, z + w / 2 + 0.12]), halfL];
    for (let i = 0; i < edges.length; i += 2) walls.push(box(0.02, wallH, edges[i + 1]! - edges[i]!, halfW, wallH / 2, (edges[i]! + edges[i + 1]!) / 2));
    for (const z of G.rightZ) walls.push(box(0.02, y0, w + 0.24, halfW, y0 / 2, z), box(0.02, wallH - y1 - w / 2, w + 0.24, halfW, (wallH + y1 + w / 2) / 2, z));
    merged(walls, M.wall).receiveShadow = HQ;
  }
  { // entrance (+z): double door with brass fittings, fanlight; feature wall (−z): the mural in an iron frame, lit by spots
    const d: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) d.push(box(1.1, 2.6, 0.08, s * 0.57, 1.3, halfL - 0.1), box(0.6, 1.0, 0.03, s * 0.57, 1.9, halfL - 0.16), box(0.6, 0.8, 0.03, s * 0.57, 0.75, halfL - 0.16));
    merged(d, M.darkWood);
    merged([box(2.8, 0.2, 0.2, 0, 2.75, halfL - 0.1), box(0.3, 2.9, 0.2, -1.4, 1.45, halfL - 0.1), box(0.3, 2.9, 0.2, 1.4, 1.45, halfL - 0.1)], M.dado);
    add(new THREE.CircleGeometry(1.3, SEG(24), 0, Math.PI).translate(0, 2.85, halfL - 0.08), M.daylight);
    merged([torus(1.3, 0.06, 8, 24, Math.PI).translate(0, 2.85, halfL - 0.1), ...[0.6, 1.2, 1.8, 2.4].map((a) => new THREE.BoxGeometry(0.04, 1.25, 0.04).rotateZ(Math.PI / 2 - a).translate(0.62 * Math.cos(a), 2.85 + 0.62 * Math.sin(a), halfL - 0.1))], M.iron);
    merged([sphere(0.04, 8, 6).translate(-0.12, 1.05, halfL - 0.16), sphere(0.04, 8, 6).translate(0.12, 1.05, halfL - 0.16)], M.brass);
    const { w, h, y } = G.mural;
    add(new THREE.PlaneGeometry(w, h).translate(0, y, -halfL + 0.1), M.mural);
    merged([box(w + 0.3, 0.15, 0.14, 0, y + h / 2 + 0.075, -halfL + 0.1), box(w + 0.3, 0.15, 0.14, 0, y - h / 2 - 0.075, -halfL + 0.1), box(0.15, h + 0.3, 0.14, -w / 2 - 0.075, y, -halfL + 0.1), box(0.15, h + 0.3, 0.14, w / 2 + 0.075, y, -halfL + 0.1)], M.iron);
  }
  { // framed prints: black frames, white mats, art from the atlas (uv per cell)
    const wood: THREE.BufferGeometry[] = [], mats: THREE.BufferGeometry[] = [], art: THREE.BufferGeometry[] = [];
    for (const f of frameSlots()) {
      const m = new THREE.Matrix4().makeRotationY(f.yaw).setPosition(f.x, f.y, f.z);
      wood.push(box(f.w + 0.16, 0.08, 0.06, 0, f.h / 2 + 0.04, 0.03).applyMatrix4(m), box(f.w + 0.16, 0.08, 0.06, 0, -f.h / 2 - 0.04, 0.03).applyMatrix4(m), box(0.08, f.h, 0.06, -f.w / 2 - 0.04, 0, 0.03).applyMatrix4(m), box(0.08, f.h, 0.06, f.w / 2 + 0.04, 0, 0.03).applyMatrix4(m));
      mats.push(new THREE.PlaneGeometry(f.w, f.h).translate(0, 0, 0.02).applyMatrix4(m));
      const g = new THREE.PlaneGeometry(f.w * 0.82, f.h * 0.82).translate(0, 0, 0.025), uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (f.cell % 4 + uv.getX(i)) / 4, (Math.floor(f.cell / 4) + uv.getY(i)) / 4);
      art.push(g.applyMatrix4(m));
    }
    merged(wood, M.frameWood).castShadow = HQ;
    merged(mats, M.mat);
    merged(art, M.art);
  }
  { // sculptural props: two white speech-bubble sculptures on plinths by the mural, three silhouette figures, two aisle benches
    const plinths: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const x = s * 4.2, z = -halfL + 2.2;
      plinths.push(box(1.0, 1.0, 1.0, x, 0.5, z));
      add(bubbleGeometry(1.9, 1.1, 0.28).translate(0, 0.6, 0).rotateY(s * 0.35).translate(x, 1.1 + 0.55, z), M.white).castShadow = HQ;
    }
    merged(plinths, M.dado).castShadow = HQ;
    for (const [x, z, yaw] of [[-2.2, 11.5, 0.5], [2.6, 11.2, -0.3], [0.4, -12.3, 2.9]] as [number, number, number][]) add(figureGeometry(1.85, 0.06).rotateY(yaw).translate(x, 0.05, z), M.silhouette).castShadow = HQ;
    merged(([[-2.2, 11.5], [2.6, 11.2], [0.4, -12.3]] as [number, number][]).map(([x, z]) => cylG(0.4, 0.45, 0.05, 20).translate(x, 0.025, z)), M.black);
    const banners: THREE.BufferGeometry[] = [], rods: THREE.BufferGeometry[] = [];
    [-11.9, -5.1, 1.7, 8.5].forEach((z, k) => { // double-sided comic banners hung from the trusses over the aisle
      for (const side of [1, -1]) {
        const g = new THREE.PlaneGeometry(1.6, 2.4), uv = g.attributes.uv as THREE.BufferAttribute, cell = (k * 5 + 3) % 16;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (cell % 4 + uv.getX(i)) / 4, (Math.floor(cell / 4) + uv.getY(i)) / 4);
        banners.push(g.rotateY(side > 0 ? 0 : Math.PI).translate(0, wallH + 0.1, z + side * 0.005));
      }
      rods.push(cylG(0.02, 0.02, 1.8, 8).rotateZ(Math.PI / 2).translate(0, wallH + 1.32, z), cylG(0.01, 0.01, 1.2, 6).translate(0, wallH + 1.9, z));
    });
    merged(banners, M.art).castShadow = HQ;
    merged(rods, M.iron);
    for (const z of [-4.5, 4.5]) {
      merged([box(2.6, 0.08, 0.6, 0, 0.44, z), ...[-1.1, 1.1].map((x) => box(0.1, 0.4, 0.5, x, 0.2, z))], M.bench).castShadow = HQ;
      add(box(2.5, 0.08, 0.55, 0, 0.52, z), M.leather).castShadow = HQ;
    }
  }

  // ---- desks: 11 instances per part, then per-desk button / placard / sketch / runner / lamp light ---------------------
  const desks = deskSlots();
  const deskG = deskGeometry();
  instanced(deskG.wood, M.deskWood, desks);
  instanced(deskG.tray, M.deskWood, desks);
  instanced(deskG.brass, M.brass, desks);
  instanced(deskG.black, M.black, desks);
  instanced(deskG.paper, M.paper, desks);
  instanced(deskG.bulb, M.bulb, desks, false);
  instanced(deskG.pedestal, M.darkWood, desks);
  instanced(deskG.cushion, M.cushion, desks);
  instanced(new THREE.PlaneGeometry(0.26, 0.1).translate(0.9, 0.8, 0.6 + 0.151), M.label, desks, false); // "BẮT ĐẦU" plate on the pedestal's aisle (+z) face
  instanced(new THREE.PlaneGeometry(0.4, 0.28).rotateX(-Math.PI / 2 + DESK_TILT).translate(SHEET_LOCAL.x, SHEET_LOCAL.y + 0.021, SHEET_LOCAL.z), M.sketch, desks, false);
  instanced(new THREE.BoxGeometry(2.4, 0.012, 2.2).translate(0, 0.006, 0.2), std({ color: '#ffffff', roughness: 1 }), desks, false, (i) => new THREE.Color(teams[i]!.color).lerp(new THREE.Color('#8a7a68'), 0.35)); // runner in the team colour
  const own = TEAM ? desks.find((d) => d.slot === TEAM) : undefined;
  if (!RACE && TEAM && q.get('done')) localStorage.setItem(`ligne:${TEAM}`, JSON.stringify({ st: Array.from({ length: TOTAL_DEFAULT }, (_, i) => (i < Number(q.get('done')) ? 'pass' : '')), best: Array.from({ length: TOTAL_DEFAULT }, (_, i) => (i < Number(q.get('done')) ? 0.9 : 0)), skipped: false })); // dev: seed progress

  // the race: the server's tally (setProgress); the dev page: the game stores its state in localStorage (same origin), key ligne:<team>
  const served = new Map<number, Progress>();
  const progress = (slot: number): Progress => {
    const s = served.get(slot);
    if (s) return s;
    if (RACE) return { done: 0, skipped: false, penaltyMinutes: 0, total: TOTAL };
    try {
      const j = JSON.parse(localStorage.getItem(`ligne:${slot}`) ?? 'null') as { st?: string[]; skipped?: boolean } | null;
      const done = j?.st?.filter((v) => v === 'pass').length ?? 0;
      return { done, skipped: !!j?.skipped, penaltyMinutes: j?.skipped ? (TOTAL - done) * PEN : 0, total: TOTAL };
    } catch { return { done: 0, skipped: false, penaltyMinutes: 0, total: TOTAL }; }
  };
  const tallyText = (p: Progress) => `${p.done}/${p.total}${p.skipped ? ` · bỏ qua · phạt ${p.penaltyMinutes} phút` : p.done === p.total ? ' ✓' : ''}`;
  const buttonColour = (slot: number, hot = false) => { const t = teams[slot - 1]!; return !TEAM || slot === TEAM ? new THREE.Color(t.color).multiplyScalar(hot ? 1.8 : 1) : new THREE.Color('#5a5a5a'); };
  const buttons = instanced(buttonGeometry(), std({ color: '#ffffff', roughness: 0.35, metalness: 0.1 }), desks, true, (i) => buttonColour(desks[i]!.slot));
  if (HQ) for (const d of desks) { // a warm point per desk lamp (minimal: the bulbs glow by their emissive alone)
    const l = new THREE.PointLight('#ffd9a0', own && d.slot !== TEAM ? 0.8 : 1.3, 3, 2);
    l.position.copy(deskLocal(d, BULB_LOCAL.x, BULB_LOCAL.y, BULB_LOCAL.z));
    g.add(l);
  }
  if (own) { // the team's own desk: a glowing ring on the parquet + a warm spot from above
    const ring = add(new THREE.RingGeometry(1.45, 1.6, SEG(48)).rotateX(-Math.PI / 2), std({ color: teams[own.slot - 1]!.color, emissive: teams[own.slot - 1]!.color, emissiveIntensity: 1.6, side: THREE.DoubleSide }));
    ring.position.copy(deskLocal(own, 0, 0.02, 0.2));
    const sp = new THREE.SpotLight('#fff1d6', 14, 9, 0.5, 0.5, 2);
    sp.position.set(own.x * 0.6, wallH - 0.3, own.z);
    sp.target.position.copy(deskLocal(own, 0, 1, 0.3));
    g.add(sp, sp.target);
  }

  // ---- lights: sun through the glass roof (hq: shadows), sky / ground fill; hq adds the warm track spots on the mural and the prints ----
  g.add(new THREE.HemisphereLight('#dbe8f8', '#6b5238', HQ ? 0.9 : 1.2));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(14, 26, -8);
  if (HQ) {
    sun.castShadow = HQ;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 24, bottom: -24, near: 4, far: 70 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
  }
  g.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#cfe0ff', 0.5);
  fill.position.set(-10, 12, 10);
  g.add(fill);
  if (HQ) {
    for (const x of [-2.4, 2.4]) {
      const sp = new THREE.SpotLight('#ffe6c0', 260, 12, 0.45, 0.6, 1.6);
      sp.position.set(x, wallH - 0.4, -halfL + 4.5);
      sp.target.position.set(x, G.mural.y, -halfL);
      g.add(sp, sp.target);
    }
    for (const z of [-9, 0, 9]) { // warm gallery spots along the left wall of prints
      const sp = new THREE.SpotLight('#ffe6c0', 120, 10, 0.55, 0.7, 1.6);
      sp.position.set(-4.5, wallH - 0.4, z);
      sp.target.position.set(-halfW, 2.6, z);
      g.add(sp, sp.target);
    }
  }
  // the exit portal in front of the mural (the door is the entrance end: +z)
  const exit = makeExitRing(g, 0, -halfL + 4.4, wallH - 0.5, 1.1, '#ffb43c'); // warm: reads against the daylight and the green iron

  // ---- game overlay: letterboxed iframe, team header, tally, "Bỏ qua" (global, confirm modal), "Thoát" / Esc -----------
  const dom = document.createElement('div');
  dom.innerHTML = OVERLAY_HTML;
  document.body.append(dom);
  const $ = <T extends HTMLElement>(id: string) => dom.querySelector<T>(`#${id}`)!;
  const ovRoot = $('ov'), ovFrame = $<HTMLIFrameElement>('ovFrame'), ovTally = $('ovTally'), ovSkip = $<HTMLButtonElement>('ovSkip'), ovSkip2 = $<HTMLButtonElement>('ovSkip2'), ovModal = $('ovModal'), ovEnd = $('ovEnd'), xh = $('xh');
  $('gl-help').hidden = RACE;
  const overlayOpen = () => ovRoot.classList.contains('on');
  let current: Progress = { done: 0, skipped: false, penaltyMinutes: 0, total: TOTAL };
  let currentSlot = 0;
  let frameLoaded = Promise.resolve();
  const keys = new Set<string>();
  let locked = false; // "Đổi lựa chọn kép": the own button is off, only the exit ring is left
  function press(slot: number) {
    if ((TEAM && slot !== TEAM) || overlayOpen() || locked) return;
    const b = { slot };
    const t = teams[b.slot - 1]!;
    currentSlot = b.slot;
    $('ovTeam').textContent = `Đội ${b.slot} · ${t.name}`;
    dom.querySelector<HTMLElement>('.sw')!.style.background = t.color;
    showProgress(progress(b.slot));
    ovModal.classList.remove('on');
    ovEnd.classList.remove('on');
    frameLoaded = new Promise((r) => ovFrame.addEventListener('load', () => {
      // the race: the server's tally seeds the game (a switch away and back reset it; another device): never localStorage
      if (RACE) ovFrame.contentWindow?.postMessage({ type: 'room-init', done: current.done, skipped: current.skipped, key: `race:${b.slot}` }, '*');
      r();
    }, { once: true }));
    ovFrame.src = `/games/ligne-claire.html?team=${b.slot}`;
    document.exitPointerLock();
    keys.clear();
    ovRoot.classList.add('on');
    ovFrame.focus();
  }
  function showProgress(p: Progress) {
    current = p;
    if (currentSlot) served.set(currentSlot, p);
    ovTally.textContent = `${p.done}/${p.total} bức đạt`;
    ovSkip.hidden = ovSkip2.hidden = p.skipped || p.done >= p.total;
    if (p.skipped) {
      $('ovEndTitle').textContent = 'Đã bỏ qua';
      $('ovEndText').innerHTML = `Đội hoàn thành <b>${p.done}/${p.total}</b> bức. Còn ${p.total - p.done} bức chưa vẽ → phạt <b>${p.penaltyMinutes} phút</b> tại vạch đích${RACE ? '' : ' (Host áp dụng thủ công)'}.`;
      ovEnd.classList.add('on');
    }
  }
  function close() {
    ovRoot.classList.remove('on'); ovModal.classList.remove('on'); ovEnd.classList.remove('on'); ovFrame.src = 'about:blank';
    (document.activeElement as HTMLElement | null)?.blur(); window.focus(); // the keyboard back to the page (the iframe kept the focus)
    o.onClose?.();
  }
  $('ovExit').onclick = close;
  $('ovEndClose').onclick = close;
  ovSkip.onclick = () => {
    const rem = current.total - current.done;
    $('ovModalText').innerHTML = `Bạn còn <b>${rem} bức tranh</b> chưa hoàn thành. Nếu bỏ qua, đội sẽ bị phạt <b>${rem * PEN} phút</b> tại vạch đích (${PEN} phút × ${rem} bức). Các bức còn lại sẽ bị khoá.`;
    ovModal.classList.add('on');
  };
  ovSkip2.onclick = () => ovSkip.click();
  $('ovBack').onclick = () => { ovModal.classList.remove('on'); ovFrame.focus(); };
  $('ovConfirm').onclick = () => { ovModal.classList.remove('on'); ovFrame.contentWindow?.postMessage({ type: 'gallery-skip' }, '*'); };
  const onMessage = (e: MessageEvent) => {
    const d = e.data as { type?: string; done?: number; total?: number; skipped?: boolean; penaltyMinutes?: number; scores?: number[] };
    if (!d || e.source !== ovFrame.contentWindow) return;
    if (d.type === 'gallery-close') { if (ovModal.classList.contains('on')) ovModal.classList.remove('on'); else close(); }
    if (d.type === 'gallery-result') {
      const done = d.done ?? 0, skipped = !!d.skipped;
      showProgress({ done, skipped, penaltyMinutes: skipped ? (TOTAL - done) * PEN : 0, total: TOTAL });
      o.onResult?.({ done, skipped });
    }
  };
  addEventListener('message', onMessage);
  const onKey = (e: KeyboardEvent) => {
    if (!overlayOpen()) return void keys.add(e.code);
    if (e.key === 'Escape') { if (ovModal.classList.contains('on')) ovModal.classList.remove('on'); else close(); }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKeyUp);
  if (!RACE) Object.assign(window, { __GALLERY__: { press, progress, tallyText } });

  // ---- the walker: the race = the game's body on colliders in the game's world; the dev page = a RoomPlayer of its own ------
  // ponytail: collision = room shell + one box per desk / plinth / bench / figure base; columns and the mural frame are left out
  const roomButtons = desks.map((d) => ({ slot: d.slot, ...deskLocal(d, BUTTON_LOCAL.x, BUTTON_LOCAL.y, BUTTON_LOCAL.z), active: !TEAM || d.slot === TEAM }));
  const boxes: Box[] = [
    ...shellBoxes(-halfW, halfW, -halfL, halfL, wallH),
    ...desks.map((d) => slotBox(d, DESK_BOX)),
    ...[-1, 1].map((s) => ({ x: s * 4.2, y: 0.5, z: -halfL + 2.2, hx: 0.5, hy: 0.5, hz: 0.5 })),
    ...[-4.5, 4.5].map((z) => ({ x: 0, y: 0.3, z, hx: 1.3, hy: 0.3, hz: 0.3 })),
    ...([[-2.2, 11.5], [2.6, 11.2], [0.4, -12.3]] as [number, number][]).map(([x, z]) => ({ x, y: 0.5, z, hx: 0.4, hy: 0.5, hz: 0.4 })),
  ];
  const frozen = () => overlayOpen() || !!o.frozen?.();
  const colliders: RAPIER.Collider[] = [];
  if (o.world) for (const b of boxes) { // the race: into the game's physics, at the frame
    const p = toWorld(frame, b.x, b.z), yaw = (b.yaw ?? 0) + frame.yaw;
    colliders.push(o.world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(p.x, frame.floorY + b.y, p.z).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })));
  }
  const camera = RACE ? undefined : new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 200);
  const euler = new THREE.Euler();
  const walk = camera
    ? await createRoomPlayer({
        scene, camera, canvas: renderer.domElement, q, buttons: roomButtons, boxes,
        spawn: own ? { ...deskLocal(own, 0.45, 0, 1.6), yaw: own.yaw } : { x: 0, z: halfL - 2.5, yaw: 0 },
        team: own ? { name: `Đội ${own.slot} · ${teams[own.slot - 1]!.name}`, colour: teams[own.slot - 1]!.color } : undefined,
        frozen, locked: () => (locked ? LOCKED : null), onPress: press,
        onFly: (flying: boolean) => { if (flying) euler.setFromQuaternion(camera.quaternion, 'YXZ'); },
      })
    : undefined;
  const feet = () => (walk ? { x: walk.position.x, z: walk.position.z } : toLocal(frame, o.feet!().x, o.feet!().z));
  const nearOwn = () => { const f = feet(); return nearestButton(f.x, f.z, roomButtons, 1.8); };
  if (q.get('open') === '1') {
    press(TEAM || 1);
    if (q.get('skip') === '1') void frameLoaded.then(() => ovSkip.click());
  }
  const pointerLocked = () => document.pointerLockElement === renderer.domElement;
  const onMove = (e: MouseEvent) => {
    if (!pointerLocked() || !walk?.flying) return;
    euler.y -= e.movementX * 0.0022;
    euler.x = THREE.MathUtils.clamp(euler.x - e.movementY * 0.0022, -1.5, 1.5);
  };
  const onClick = () => { if (walk?.flying && !overlayOpen()) renderer.domElement.requestPointerLock(); }; // walking: roomPlayer's Input locks
  let composer: EffectComposer | null = null;
  if (camera) { // dev page: camera presets, free-fly, composer (hq)
    renderer.shadowMap.enabled = HQ;
    renderer.setPixelRatio(HQ ? Math.min(devicePixelRatio, 1.5) : 1);
    const deskView = (d: DeskSlot): [THREE.Vector3, THREE.Vector3] => [deskLocal(d, 0.35, 1.85, 3.1), deskLocal(d, -0.05, 1.0, 0)];
    const first = own ?? desks[0]!;
    const VIEWS: Record<string, [THREE.Vector3, THREE.Vector3]> = { overview: [v3(-4.2, 4.6, 13.6), v3(1.2, 1.6, -6)], desk: deskView(first), plan: [v3(0, 16, 0), v3(0, 0, 0)] };
    const [from, to] = own && !q.get('view') ? [deskLocal(own, 0, 1.65, 3.4), deskLocal(own, 0, 1.0, -0.2)] : VIEWS[q.get('view') ?? 'overview'] ?? VIEWS.overview!;
    camera.position.copy(from);
    camera.lookAt(to);
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    if (PLAN) { // straight down, the hall's long axis across the screen, roof hidden
      euler.set(-Math.PI / 2, 0, Math.PI / 2);
      camera.fov = 58;
      camera.updateProjectionMatrix();
      g.traverse((ob) => { if (ob instanceof THREE.Mesh && ob.geometry.boundingBox === null) ob.geometry.computeBoundingBox(); if (ob instanceof THREE.Mesh && ob.geometry.boundingBox!.min.y > 4.6 && !(ob.material === M.sky)) ob.visible = false; });
    }
    if (q.get('cam')) {
      const [x, y, z, yaw, pitch] = q.get('cam')!.split(',').map(Number);
      camera.position.set(x!, y!, z!);
      euler.set(THREE.MathUtils.degToRad(pitch!), THREE.MathUtils.degToRad(yaw!), 0);
    }
    if (HQ) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new OutputPass());
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.22, 0.5, 0.92));
      composer.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - 0.28 * smoothstep(0.4, 0.95, d); c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.94), 0.3); gl_FragColor = c; }',
      }));
    }
    addEventListener('mousemove', onMove);
    renderer.domElement.addEventListener('click', onClick);
  } else renderer.setPixelRatio(1); // the race: minimal graphics inside (main.ts resize() keeps it while the room is up)
  const promptEl = dom.querySelector<HTMLElement>('#gl-prompt')!;
  function hoverCheck() { // the button of the desk in reach glows (a prop, not a mouse target); the race draws the prompt here
    const near = walk?.flying ? null : nearOwn();
    desks.forEach((d, i) => buttons.setColorAt(i, buttonColour(d.slot, !!near?.active && near.slot === d.slot && !locked)));
    buttons.instanceColor!.needsUpdate = true;
    xh.style.display = pointerLocked() && !!walk?.flying && !overlayOpen() ? 'block' : 'none';
    if (!walk) {
      const text = near ? (locked ? LOCKED : near.active ? PROMPT : WRONG) : '';
      promptEl.hidden = !text || frozen();
      promptEl.textContent = text;
      promptEl.classList.toggle('off', locked || !near?.active);
    }
  }

  const clock = new THREE.Clock();
  let frames = 0, loaded = false;
  void frameLoaded.then(() => (loaded = true));
  return {
    group: g,
    ceiling: G.wallH,
    player: walk,
    update(dt) {
      const v = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 10 : 3.2) * dt;
      walk?.update(dt);
      if (walk?.flying && camera) {
        camera.quaternion.setFromEuler(euler);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        if (keys.has('KeyW')) camera.position.addScaledVector(fwd, v);
        if (keys.has('KeyS')) camera.position.addScaledVector(fwd, -v);
        if (keys.has('KeyD')) camera.position.addScaledVector(right, v);
        if (keys.has('KeyA')) camera.position.addScaledVector(right, -v);
        if (keys.has('KeyE')) camera.position.y += v;
        if (keys.has('KeyQ')) camera.position.y -= v;
        if (!PLAN && !q.get('cam')) clampRoom(camera.position);
      }
      clock.getDelta();
      exit.update(clock.elapsedTime);
      hoverCheck();
      frames++;
    },
    interact() {
      const near = nearOwn();
      if (!near?.active || locked || frozen()) return false;
      press(near.slot);
      return true;
    },
    render() {
      if (!camera) return;
      if (composer) { renderer.info.autoReset = false; renderer.info.reset(); composer.render(); } else renderer.render(scene, camera);
    },
    resize() {
      if (!camera) return;
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      composer?.setSize(innerWidth, innerHeight);
    },
    setProgress(done, skipped) {
      if (!TEAM) return;
      const p = { done, skipped, penaltyMinutes: skipped ? (TOTAL - done) * PEN : 0, total: TOTAL };
      served.set(TEAM, p);
      if (overlayOpen() && currentSlot === TEAM) showProgress(p);
    },
    setExit(on) {
      exit.set(on);
      if (on) walk?.face(exit.x, exit.z);
    },
    setLocked(on) {
      locked = on;
      if (on && overlayOpen()) close();
    },
    exitHit: () => { const f = feet(); return exit.hit(f.x, f.z); },
    overlayOpen,
    settled: () => frames >= 3 && loaded,
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    dispose() {
      if (overlayOpen()) close();
      removeEventListener('message', onMessage);
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('mousemove', onMove);
      renderer.domElement.removeEventListener('click', onClick);
      walk?.dispose();
      dom.remove();
      composer?.dispose();
      pmrem.dispose();
      for (const c of colliders) o.world!.removeCollider(c, false);
      scene.remove(g);
      renderer.toneMappingExposure = was.exposure;
      renderer.setPixelRatio(was.pixelRatio);
      scene.background = was.background;
      scene.fog = was.fog;
      scene.environment = was.environment;
      scene.environmentIntensity = was.envIntensity;
      renderer.info.autoReset = true;
      // ponytail: per-mount geometries are left to the GC (materials / textures are module-level and shared); dispose them when a race shows a memory climb
    },
  };
}
