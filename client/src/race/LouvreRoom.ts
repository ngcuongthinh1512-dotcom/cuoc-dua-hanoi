// Phase 8B (docs/plans/phase8b.md §F): the Louvre room ("Thử thách 3") — a closed box `louvreRoom.below` m under the box
// just opened (card.task.louvre.room), its door straight under the box (going in / out only changes y: no teleport, no
// `respawn`), 23 artworks along the walls in leg order, a red / green button under each (this team's picks only), the lock
// button in the middle. Built synchronously at F (or before spawnAt on an F5 inside: the floor collider must be in Rapier
// first), unloaded only by leave().
// Room-local metres: origin = room centre on the floor, −z = the door wall (towards the box's front, room.yaw), +x = right
// of someone standing at the door looking in… mirrored: x' = x cos yaw + z sin yaw, z' = −x sin yaw + z cos yaw (three's
// rotation.y = yaw), so local (0, 0, −1) is the box's front direction (−sin yaw, −cos yaw).
import RAPIER from '@dimforge/rapier3d-compat';
import type { ArtworkView, CardStatus, ClueCard, LouvreView } from '@race/shared/protocol';
import {
  Box3, BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshMatcapMaterial, type Object3D, PlaneGeometry, RepeatWrapping, type Scene, SRGBColorSpace, type Texture, TextureLoader, Vector3,
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { louvreRoom as C } from '../config.ts';
import { liveStatus } from './ui/format.ts';

/** The card's Louvre room at server time `now` (null = the card has none). The status is the LIVE one (fix F2 (1)): the
 *  server sends no new card when a wrong lock's countdown ends, so card.status stays 'locked' until the next pick. */
export function roomCardOf(card: ClueCard | null | undefined, now: number): { step: string; status: CardStatus; lv: LouvreView } | null {
  return card?.task?.louvre ? { step: card.step, status: liveStatus(card, now), lv: card.task.louvre } : null;
}

/** A pick the server took: the step's picks grew (true: lit) or shrank (false); null = no change (refused, paused, a
 *  dropped send). The click sound plays on this, never on the send (fix F2 (7)). */
export function pickChange(was: readonly string[] | undefined, now: readonly string[] | undefined): boolean | null {
  if (!was || !now) return null;
  return now.some((p) => !was.includes(p)) ? true : was.some((p) => !now.includes(p)) ? false : null;
}

/** A painting's picture size (m) for image aspect k = width / height: painting.height tall, a wide one maxWidth wide. */
export function paintingSize(k: number): [number, number] {
  const P = C.painting;
  const w = Math.min(P.height * k, P.maxWidth);
  return [w, w / k];
}

/** One place along the walls (room-local metres: origin = room centre, −z = the door wall), its button in front of it. */
export interface RoomSlot {
  /** ArtworkView.id. */
  id: string;
  type: 'painting' | 'sculpture';
  /** On the wall's inner face. */
  x: number;
  z: number;
  /** rad, facing into the room (rotation.y of a plane facing +z). */
  yaw: number;
  /** Unit normal into the room. */
  nx: number;
  nz: number;
  button: { x: number; z: number };
}

/** What F does in the room (main.ts onInteract priority after the closed box: enter → button → lock → door → bikes). */
export type RoomTarget = { kind: 'button'; id: string } | { kind: 'lock' } | { kind: 'door' };

/** Pure: the 23 places along the walls in leg order, round the room: door wall right part (from the door outward), right
 *  wall (front → back), back wall, left wall (back → front), door wall left part (outward → door). Evenly spread on each
 *  run, `slots.cornerMargin` kept free at the corners and beside the door. */
export function wallSlots(artworks: readonly ArtworkView[]): RoomSlot[] {
  const { width: W, depth: D } = C.size;
  const [hw, hd, m, door] = [W / 2, D / 2, C.slots.cornerMargin, C.door.width / 2 + C.slots.cornerMargin];
  const { back, side, frontEachSide: front } = C.slots;
  // [count, from (x, z), to (x, z), inward normal]
  const runs: [number, number, number, number, number, number, number][] = [
    [front, door, -hd, hw - m, -hd, 0, 1],
    [side, hw, -hd + m, hw, hd - m, -1, 0],
    [back, hw - m, hd, -hw + m, hd, 0, -1],
    [side, -hw, hd - m, -hw, -hd + m, 1, 0],
    [front, -hw + m, -hd, -door, -hd, 0, 1],
  ];
  const out: RoomSlot[] = [];
  for (const [n, ax, az, bx, bz, nx, nz] of runs) {
    for (let i = 0; i < n; i++) {
      const a = artworks[out.length];
      if (!a) return out;
      const t = (i + 0.5) / n;
      const [x, z] = [ax + (bx - ax) * t, az + (bz - az) * t];
      const f = C.button.fromWall;
      out.push({ id: a.id, type: a.type, x, z, yaw: Math.atan2(nx, nz), nx, nz, button: { x: x + nx * f, z: z + nz * f } });
    }
  }
  return out;
}

/** Where the room sits: centre / yaw / floor, the feet on entering (inside the door) and on leaving (in front of the box).
 *  Both within louvreRoom.inset of the box's x, z: going in / out only changes y (critic S5). */
export function roomFrame(room: LouvreView['room'], groundY: number) {
  const [s, c] = [Math.sin(room.yaw), Math.cos(room.yaw)];
  const hd = C.size.depth / 2;
  const floorY = Math.max(groundY - C.below, C.minFloorY);
  return {
    cx: room.x + s * hd,
    cz: room.z + c * hd,
    yaw: room.yaw,
    floorY,
    /** Feet inside the door, facing into the room (body yaw = room.yaw + π). */
    enter: { x: room.x + s * C.inset, y: floorY, z: room.z + c * C.inset, yaw: room.yaw + Math.PI },
    /** Feet on the court in front of the box, facing away from it. */
    exit: { x: room.x - s * C.inset, z: room.z - c * C.inset, yaw: room.yaw },
  };
}
export type RoomFrame = ReturnType<typeof roomFrame>;

/** World (x, z) → room-local. */
export const toLocal = (f: RoomFrame, x: number, z: number) => {
  const [dx, dz, s, c] = [x - f.cx, z - f.cz, Math.sin(f.yaw), Math.cos(f.yaw)];
  return { x: dx * c - dz * s, z: dx * s + dz * c };
};
/** Room-local (x, z) → world. */
export const toWorld = (f: RoomFrame, x: number, z: number) => {
  const [s, c] = [Math.sin(f.yaw), Math.cos(f.yaw)];
  return { x: f.cx + x * c + z * s, z: f.cz - x * s + z * c };
};

/** Pure (room-local): what F does from feet (x, z) looking along (dx, dz): the nearest button within reach that the view
 *  faces, else the lock button within reach, else the door within reach. */
export function targetAt(slots: readonly RoomSlot[], x: number, z: number, dx: number, dz: number): RoomTarget | null {
  const len = Math.hypot(dx, dz) || 1;
  let best: RoomSlot | null = null;
  let bestD = C.button.reach;
  for (const s of slots) {
    const [bx, bz] = [s.button.x - x, s.button.z - z];
    const d = Math.hypot(bx, bz);
    if (d > bestD || (d > 0.3 && (bx * dx + bz * dz) / (d * len) <= C.button.aimDot)) continue; // standing on it: any heading
    [best, bestD] = [s, d];
  }
  if (best) return { kind: 'button', id: best.id };
  if (Math.hypot(x, z) <= C.lock.reach) return { kind: 'lock' };
  if (Math.hypot(x, z + C.size.depth / 2) <= C.doorReach) return { kind: 'door' };
  return null;
}

/** Pure: lit (green) or not (red) per slot — from THIS team's card picks only (SPEC §17.19: no other team's lights). */
export const buttonStates = (slots: readonly RoomSlot[], picks: readonly string[]) => slots.map((s) => picks.includes(s.id));

/** Pure: the prompt over the HUD in / at the room (null = none). */
export function roomPrompt(t: RoomTarget | null, lv: LouvreView | null, o: { done: boolean; locked: boolean }): string | null {
  if (!t) return null;
  if (t.kind === 'door') return o.done ? 'Đã xong – bấm F để ra' : 'Bấm F để ra (lựa chọn vẫn giữ)';
  if (o.done || !lv) return null;
  if (t.kind === 'lock') {
    if (o.locked) return 'Đang bị phạt – chờ hết đếm ngược để chốt (vẫn chọn / bỏ được)';
    return lv.picks.length ? `Bấm F để chốt (đang chọn ${lv.picks.length})` : 'Chưa chọn tác phẩm nào';
  }
  if (lv.picks.includes(t.id)) return 'Bấm F: bỏ chọn';
  if (lv.maxPicks !== null && lv.picks.length >= lv.maxPicks) return `Đã đủ ${lv.maxPicks} – bỏ một tác phẩm trước`;
  return 'Bấm F: chọn tác phẩm này';
}

/** DEV ?louvre=1 stand-in (no server): 15 paintings + 8 sculptures, numbered placeholders, a few picks. `real` (DEV
 *  ?artGlb=…&artPhoto=…, p8b-real-*): the files in public/art — those numbers are sculptures (.glb scan / photo on a
 *  plinth), every other one a painting (.webp). */
export function demoLouvre(x: number, z: number, yaw = 0, picks = ['art-04', 'art-11'], real?: { glb: number[]; photo: number[] }): LouvreView {
  const sculpture = new Set(real ? [...real.glb, ...real.photo] : [3, 6, 10, 13, 16, 19, 21, 23]);
  const artworks = Array.from({ length: 23 }, (_, i) => {
    const id = `art-${String(i + 1).padStart(2, '0')}`;
    return { id, type: sculpture.has(i + 1) ? ('sculpture' as const) : ('painting' as const), image: real ? `${id}.${real.glb.includes(i + 1) ? 'glb' : 'webp'}` : '' };
  });
  return { artworks, room: { x, z, r: 25, yaw }, picks, attempts: 0, hintAt: [0, 0], hintCount: null, hintCorrect: null, maxPicks: null };
}

// ── textures: static /art/<image>, cached for the page (in / out 3 times loads nothing again) ──
const textures = new Map<string, Texture>();
const glbs = new Map<string, Promise<Object3D | null>>();

/** Numbered placeholder ("Tác phẩm n", colour by n). */
function placeholder(n: number, sculpture: boolean): Texture {
  const key = `#${n}${sculpture ? 's' : ''}`;
  const hit = textures.get(key);
  if (hit) return hit;
  const cv = Object.assign(document.createElement('canvas'), { width: 256, height: sculpture ? 320 : 192 });
  const g = cv.getContext('2d')!;
  g.fillStyle = `hsl(${(n * 47) % 360} 35% 42%)`;
  g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 6;
  g.strokeRect(10, 10, cv.width - 20, cv.height - 20);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = 'bold 28px sans-serif';
  g.fillText(sculpture ? 'Tượng' : 'Tác phẩm', cv.width / 2, cv.height / 2 - 24);
  g.font = 'bold 64px sans-serif';
  g.fillText(String(n), cv.width / 2, cv.height / 2 + 44);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  textures.set(key, t);
  return t;
}

/** The artwork's picture (cached): its .webp once loaded (onLoad: aspect), else the placeholder; a 404 keeps that. */
function picture(a: ArtworkView, n: number, onLoad: (t: Texture) => void): Texture {
  if (!/\.webp$/.test(a.image)) return placeholder(n, a.type === 'sculpture');
  const hit = textures.get(a.image);
  if (hit) return hit;
  const ph = placeholder(n, a.type === 'sculpture');
  new TextureLoader().load(
    new URL(`art/${a.image}`, location.href).href,
    (t) => {
      t.colorSpace = SRGBColorSpace;
      textures.set(a.image, t);
      onLoad(t);
    },
    undefined,
    () => console.warn(`art/${a.image} missing: numbered placeholder`),
  );
  return ph;
}

/** Preload the pictures as soon as a louvre card is there (before F at the box). */
export function preloadArt(artworks: readonly ArtworkView[]) {
  artworks.forEach((a, i) => picture(a, i + 1, () => {}));
}

function loadGlb(name: string): Promise<Object3D | null> {
  let p = glbs.get(name);
  if (!p) {
    p = new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(new URL(`art/${name}`, location.href).href)
      .then((g) => g.scene)
      .catch((err: unknown) => (console.warn(`art/${name} missing: photo placeholder`, err), null));
    glbs.set(name, p);
  }
  return p;
}

// ── geometry helpers (room-local, vertex colours, merged into one draw call) ──
const tmpColour = new Color();
function coloured(g: BufferGeometry, colour: string, lit = 1): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute('position').count;
  tmpColour.set(colour).multiplyScalar(lit);
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([tmpColour.r, tmpColour.g, tmpColour.b], i * 3);
  geo.setAttribute('color', new Float32BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  return geo;
}
/** Box w × h × d, bottom centre at (x, y, z), turned yaw. */
const box = (w: number, h: number, d: number, x: number, y: number, z: number, colour: string, yaw = 0, lit = 1) =>
  coloured(new BoxGeometry(w, h, d).translate(0, h / 2, 0).rotateY(yaw).translate(x, y, z), colour, lit);
const cyl = (r: number, h: number, x: number, y: number, z: number, colour: string, seg = 16) =>
  coloured(new CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z), colour);

/** Baked museum light: walls darker at the floor, lighter under the ceiling (vertex colour × height). */
function bakeLight(g: BufferGeometry) {
  const p = g.getAttribute('position');
  const c = g.getAttribute('color');
  for (let i = 0; i < p.count; i++) {
    const k = 0.72 + 0.33 * Math.min(1, Math.max(0, p.getY(i) / C.size.height));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
}

function signTexture(text: string, bg = C.colours.exitSign): CanvasTexture {
  const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 96 });
  const g = cv.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#fff';
  g.font = 'bold 50px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function floorTexture(): CanvasTexture {
  const cv = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const g = cv.getContext('2d')!;
  g.fillStyle = C.colours.floor;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = C.colours.floorLine;
  for (let i = 0; i < 8; i++) g.fillRect(0, i * 32, 256, 2), g.fillRect(((i * 97) % 256), i * 32, 2, 32); // planks
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(C.size.width / 4, C.size.depth / 4);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Lit-marble look for an untextured scan (no lights underground): a sphere lit from the upper left. */
let matcap: CanvasTexture | null = null;
function marbleMatcap(): CanvasTexture {
  if (matcap) return matcap;
  const cv = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(46, 40, 4, 64, 64, 64);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#c9c4bb');
  grad.addColorStop(1, '#5d5a55');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  matcap = new CanvasTexture(cv);
  matcap.colorSpace = SRGBColorSpace;
  return matcap;
}

/** Pure-ish (Rapier only): floor + 4 walls + plinths / button posts + the lock plinth. NO ceiling collider (critic C2:
 *  every surface() ray in the room falls onto the floor, "Kẹt?" stays in the room; a jump ≈ 1 m < the 5 m ceiling). */
export function addColliders(world: RAPIER.World, f: RoomFrame, slots: readonly RoomSlot[]): RAPIER.Collider[] {
  const { width: W, depth: D, height: H } = C.size;
  const t = 0.3; // wall thickness
  const rot = { x: 0, y: Math.sin(f.yaw / 2), z: 0, w: Math.cos(f.yaw / 2) };
  const add = (hx: number, hy: number, hz: number, x: number, y: number, z: number, yaw = 0) => {
    const p = toWorld(f, x, z);
    const q = yaw ? { x: 0, y: Math.sin((f.yaw + yaw) / 2), z: 0, w: Math.cos((f.yaw + yaw) / 2) } : rot;
    return world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x, f.floorY + y, p.z).setRotation(q));
  };
  const out = [
    add(W / 2 + t, 0.5, D / 2 + t, 0, -0.5, 0),
    add(W / 2 + t, H / 2, t / 2, 0, H / 2, -D / 2 - t / 2),
    add(W / 2 + t, H / 2, t / 2, 0, H / 2, D / 2 + t / 2),
    add(t / 2, H / 2, D / 2, -W / 2 - t / 2, H / 2, 0),
    add(t / 2, H / 2, D / 2, W / 2 + t / 2, H / 2, 0),
    add(C.lock.plinthRadius, C.plinth.height / 2, C.lock.plinthRadius, 0, C.plinth.height / 2, 0),
  ];
  const P = C.plinth;
  for (const s of slots) {
    out.push(add(0.06, C.button.postHeight / 2, 0.06, s.button.x, C.button.postHeight / 2, s.button.z));
    if (s.type === 'sculpture') {
      const d = P.fromWall + P.size / 2;
      out.push(add(P.size / 2, P.height / 2, P.size / 2, s.x + s.nx * d, P.height / 2, s.z + s.nz * d, s.yaw));
    }
  }
  return out;
}

export class LouvreRoom {
  /** The local player is inside (Player's own env: heightAt = floorY, waterLevel null — critic C2; never the shared env). */
  active = false;
  /** The step id the room was built for (card.step !== step → done: buttons off, door sign "Đã xong – bấm F để ra"). */
  step: string | null = null;
  frame: RoomFrame | null = null;
  slots: RoomSlot[] = [];
  private group: Group | null = null;
  private colliders: RAPIER.Collider[] = [];
  private buttons: { off: InstancedMesh; on: InstancedMesh } | null = null;
  private sign: { mesh: Mesh; done: boolean } | null = null;
  private lit = '';

  constructor(
    private readonly scene: Scene,
    private readonly world: RAPIER.World,
    /** The shared terrain grid (main.ts env.heightAt — never the Player's own env). */
    private readonly groundAt: (x: number, z: number) => number,
  ) {}

  /** The room's meshes (null before build): kept visible while the city is hidden (main.ts, world/hideWorld.ts). */
  get root(): Group | null {
    return this.group;
  }

  /** World y of the floor (0 before build). */
  get floorY() {
    return this.frame?.floorY ?? 0;
  }

  /** Builds the room for `step` (a no-op when it stands already): meshes (≤ 40 draw calls) + colliders, synchronously. */
  build(step: string, view: LouvreView): void {
    if (this.group && this.step === step) return;
    this.unload();
    const f = (this.frame = roomFrame(view.room, this.groundAt(view.room.x, view.room.z)));
    this.step = step;
    this.slots = wallSlots(view.artworks);
    this.colliders = addColliders(this.world, f, this.slots);
    const g = (this.group = new Group());
    g.position.set(f.cx, f.floorY, f.cz);
    g.rotation.y = f.yaw;
    const { width: W, depth: D, height: H } = C.size;
    const c = C.colours;
    const t = 0.3;
    // static parts, one draw call: walls (+ baked light), ceiling + lights, door, frames, picture lights, plinths, posts, lock
    const walls = [
      box(W + 2 * t, H, t, 0, 0, -D / 2 - t / 2, c.wall),
      box(W + 2 * t, H, t, 0, 0, D / 2 + t / 2, c.wall),
      box(t, H, D, -W / 2 - t / 2, 0, 0, c.wall),
      box(t, H, D, W / 2 + t / 2, 0, 0, c.wall),
      box(W, 0.12, 0.04, 0, 0, -D / 2 + 0.02, c.door), // skirting
      box(W, 0.12, 0.04, 0, 0, D / 2 - 0.02, c.door),
      box(0.04, 0.12, D, -W / 2 + 0.02, 0, 0, c.door),
      box(0.04, 0.12, D, W / 2 - 0.02, 0, 0, c.door),
    ];
    const parts: BufferGeometry[] = [
      box(W + 2 * t, 0.1, D + 2 * t, 0, H, 0, c.ceiling),
      // cornice under the ceiling (gilded, like the Louvre's galleries)
      box(W, 0.25, 0.12, 0, H - 0.25, -D / 2 + 0.06, c.frame),
      box(W, 0.25, 0.12, 0, H - 0.25, D / 2 - 0.06, c.frame),
      box(0.12, 0.25, D, -W / 2 + 0.06, H - 0.25, 0, c.frame),
      box(0.12, 0.25, D, W / 2 - 0.06, H - 0.25, 0, c.frame),
      box(C.door.width, C.door.height, 0.08, 0, 0, -D / 2 + 0.04, c.door),
      box(0.06, C.door.height, 0.1, 0, 0, -D / 2 + 0.05, '#2c1c10'), // the gap between the two leaves
      cyl(C.lock.plinthRadius, C.plinth.height, 0, 0, 0, c.plinth, 24),
      cyl(C.lock.buttonRadius, 0.12, 0, C.plinth.height, 0, c.lock, 24),
      ...[-0.9, 0.9].map((x) => box(0.02, H - C.lockSign.y - C.lockSign.size[1], 0.02, x * (C.lockSign.size[0] / 2), C.lockSign.y + C.lockSign.size[1], 0, c.post)), // the lock sign's wires
    ];
    for (let i = 0; i < C.ceilingLights; i++) {
      const [col, row] = [i % 3, Math.floor(i / 3)];
      parts.push(box(3, 0.06, 1.2, (col - 1) * (W / 3), H - 0.06, (row - 0.5) * (D / 2), c.light));
    }
    const P = C.painting;
    const pictures: Mesh[] = [];
    // gilt frames: one instanced draw call, each hugging its picture (resized when the image's aspect is known)
    const frames = new InstancedMesh(new BoxGeometry(1, 1, 0.05).translate(0, 0, 0.025), new MeshBasicMaterial({ color: c.frame }), Math.max(1, this.slots.length));
    frames.count = 0;
    const frameAt = new Matrix4();
    this.slots.forEach((s, i) => {
      const a = view.artworks[i]!;
      const post = cyl(0.05, C.button.postHeight, s.button.x, 0, s.button.z, c.post, 8);
      parts.push(post);
      let mesh: Mesh;
      let fi = -1;
      if (a.type === 'painting') {
        parts.push(box(0.5, 0.04, 0.12, s.x + s.nx * 0.08, P.centreY + P.height / 2 + 0.12, s.z + s.nz * 0.08, c.light, s.yaw)); // picture light
        mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial());
        mesh.position.set(s.x + s.nx * 0.056, P.centreY, s.z + s.nz * 0.056);
        fi = frames.count++;
      } else {
        const L = C.plinth;
        const d = L.fromWall + L.size / 2;
        const [px, pz] = [s.x + s.nx * d, s.z + s.nz * d];
        parts.push(box(L.size, L.height, L.size, px, 0, pz, c.plinth, s.yaw));
        mesh = new Mesh(new PlaneGeometry(L.photo[0], L.photo[1]), new MeshBasicMaterial());
        mesh.position.set(px, L.height + L.photo[1] / 2 + 0.02, pz);
        if (/\.glb$/.test(a.image)) void this.placeGlb(a.image, mesh, step);
      }
      mesh.rotation.y = s.yaw;
      const [bw, bh] = C.plinth.photo;
      const fit = (tex: Texture) => {
        const img = tex.image as { width: number; height: number } | undefined;
        if (!img?.width || !img.height) return;
        const k = img.width / img.height;
        if (fi < 0) return void mesh.scale.set(Math.min(1, (bh * k) / bw), Math.min(1, bw / k / bh), 1);
        const [w, h] = paintingSize(k);
        mesh.scale.set(w, h, 1);
        frameAt.makeRotationY(s.yaw).scale(new Vector3(w + 2 * P.frame, h + 2 * P.frame, 1)).setPosition(s.x, P.centreY, s.z);
        frames.setMatrixAt(fi, frameAt);
        frames.instanceMatrix.needsUpdate = true;
        frames.computeBoundingSphere();
      };
      const tex = picture(a, i + 1, (tx) => {
        (mesh.material as MeshBasicMaterial).map = tx;
        (mesh.material as MeshBasicMaterial).needsUpdate = true;
        fit(tx);
      });
      (mesh.material as MeshBasicMaterial).map = tex;
      fit(tex); // the cached picture, else the placeholder's aspect until it loads
      pictures.push(mesh);
    });
    const wallGeo = mergeGeometries(walls)!;
    bakeLight(wallGeo);
    const staticMesh = new Mesh(mergeGeometries([wallGeo, ...parts])!, new MeshBasicMaterial({ vertexColors: true }));
    const floor = new Mesh(new PlaneGeometry(W, D).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: floorTexture() }));
    // buttons: 2 instanced meshes (red = not picked, green = picked), one instance per slot, hidden by a zero scale
    const btn = new CylinderGeometry(C.button.radius, C.button.radius, 0.08, 16).translate(0, C.button.postHeight + 0.04, 0);
    const mk = (colour: string) => new InstancedMesh(btn, new MeshBasicMaterial({ color: colour }), Math.max(1, this.slots.length));
    this.buttons = { off: mk(c.off), on: mk(c.on) };
    this.lit = '\u0000'; // forces the first setPicks
    const sign = new Mesh(new PlaneGeometry(...C.exitSign), new MeshBasicMaterial({ map: signTexture('Lối ra – bấm F') }));
    sign.position.set(0, C.door.height + 0.1 + C.exitSign[1] / 2, -D / 2 + 0.03);
    this.sign = { mesh: sign, done: false };
    // "Chốt đáp án" hanging over the lock button, readable from both halves of the room (two faces, one texture)
    const [lw, lh] = C.lockSign.size;
    const lockGeo = mergeGeometries([new PlaneGeometry(lw, lh), new PlaneGeometry(lw, lh).rotateY(Math.PI)])!.translate(0, C.lockSign.y + lh / 2, 0);
    const lockSign = new Mesh(lockGeo, new MeshBasicMaterial({ map: signTexture('Chốt đáp án', c.lockSign) }));
    g.add(staticMesh, floor, frames, this.buttons.off, this.buttons.on, sign, lockSign, ...pictures);
    this.scene.add(g);
    this.setPicks(view.picks, false);
  }

  /** A sculpture's scan (.glb), fitted in plinth.glbBox on its plinth, unlit (MeshBasicMaterial: no sun underground); the
   *  photo placeholder goes once it is in. +1 draw call per mesh of the scan. */
  private async placeGlb(name: string, photo: Mesh, step: string) {
    const src = await loadGlb(name);
    if (!src || this.step !== step || !photo.parent) return;
    const m = src.clone();
    m.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const old = mesh.material as MeshBasicMaterial & { normalMap?: Texture | null };
      if (!old.map && !mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals(); // art-02 ships none: the matcap needs them
      // a textured scan keeps its baked look; an untextured one (colour + normal / AO only, art-02) gets the marble matcap
      // and its normal map, else it is a flat grey silhouette (visual review M1)
      mesh.material = old.map ? new MeshBasicMaterial({ map: old.map }) : new MeshMatcapMaterial({ color: old.color.clone().multiplyScalar(1 / Math.max(0.05, old.color.r, old.color.g, old.color.b)), matcap: marbleMatcap(), normalMap: old.normalMap ?? null });
    });
    const bb = new Box3().setFromObject(m);
    const size = bb.getSize(new Vector3());
    const [gx, gy, gz] = C.plinth.glbBox;
    const k = Math.min(gx / (size.x || 1), gy / (size.y || 1), gz / (size.z || 1));
    m.scale.setScalar(k);
    const centre = bb.getCenter(new Vector3());
    m.position.set(photo.position.x - centre.x * k, C.plinth.height - bb.min.y * k, photo.position.z - centre.z * k);
    m.rotation.y = photo.rotation.y;
    photo.parent.add(m);
    photo.visible = false;
  }

  /** Every frame: the team's lit buttons (card.task.louvre.picks; null = keep them: the card moved on), `done` (the step
   *  is over: exit sign). */
  setPicks(picks: readonly string[] | null, done: boolean): void {
    if (this.sign && this.sign.done !== done) {
      this.sign.done = done;
      const mat = this.sign.mesh.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.map = signTexture(done ? 'Đã xong – bấm F để ra' : 'Lối ra – bấm F');
      mat.needsUpdate = true;
    }
    if (!this.buttons || !picks || picks.join(',') === this.lit) return;
    const key = picks.join(',');
    this.lit = key;
    const on = buttonStates(this.slots, picks);
    const m = new Matrix4();
    const zero = new Matrix4().makeScale(0, 0, 0);
    const lit = new Matrix4();
    this.slots.forEach((s, i) => {
      m.makeTranslation(s.button.x, 0, s.button.z);
      lit.makeScale(1.4, 1, 1.4).setPosition(s.button.x, 0, s.button.z); // a lit button: wider (seen past a body)
      this.buttons!.on.setMatrixAt(i, on[i] ? lit : zero);
      this.buttons!.off.setMatrixAt(i, on[i] ? zero : m);
    });
    this.buttons.on.instanceMatrix.needsUpdate = this.buttons.off.instanceMatrix.needsUpdate = true;
    this.buttons.on.computeBoundingSphere();
    this.buttons.off.computeBoundingSphere();
  }

  /** F at the box: feet inside the door (≤ louvreRoom.inset from the box's x, z), on the floor; sets active. */
  enter(): RoomFrame['enter'] | null {
    if (!this.frame) return null;
    this.active = true;
    return this.frame.enter;
  }

  /** F at the door: back on the court in front of the box (same x, z ± inset); clears active, unloads. */
  leave(): RoomFrame['exit'] | null {
    const f = this.frame;
    this.active = false;
    this.unload();
    return f?.exit ?? null;
  }

  /** Feet (world) inside the room box. */
  inside(x: number, y: number, z: number): boolean {
    const f = this.frame;
    if (!f) return false;
    const l = toLocal(f, x, z);
    return Math.abs(l.x) <= C.size.width / 2 && Math.abs(l.z) <= C.size.depth / 2 && y >= f.floorY - 1 && y <= f.floorY + C.size.height;
  }

  /** What F would do from feet (x, z) looking along (dx, dz) (world), null = nothing in reach. */
  nearest(x: number, z: number, dx: number, dz: number): RoomTarget | null {
    const f = this.frame;
    if (!f) return null;
    const p = toLocal(f, x, z);
    const [s, c] = [Math.sin(f.yaw), Math.cos(f.yaw)];
    return targetAt(this.slots, p.x, p.z, dx * c - dz * s, dx * s + dz * c);
  }

  /** DEV ?louvre=1&roomAt=view|button|lock (p8b-room* presets): feet (world) + body yaw: `view` 5 m in from the door,
   *  `button` 1 m in front of the first lit button, `lock` 1.2 m in front of the lock button; else the door (enter). */
  demoSpot(at: string | null, picks: readonly string[]): { x: number; z: number; yaw: number } | null {
    const f = this.frame;
    if (!f) return null;
    const s = this.slots.find((q) => q.id === at) ?? this.slots.find((q) => picks.includes(q.id)); // roomAt=<art id>: in front of that one
    // beside the button / lock (the third-person camera behind the body sees it past the shoulder), facing it
    const [lx, lz, fx, fz] =
      at === 'view' ? [0, -C.size.depth / 2 + 5, 0, 1]
      : at === 'lock' ? [1, -1.6, -1, 1.6]
      : (at === 'button' || at === s?.id) && s ? [s.button.x + s.nx * 1.2 - s.nz, s.button.z + s.nz * 1.2 + s.nx, -s.nx * 1.2 + s.nz, -s.nz * 1.2 - s.nx]
      : [NaN, 0, 0, 0];
    if (Number.isNaN(lx)) return f.enter;
    const a = at === 'view' ? 0 : 0.6; // turned off the target: the camera behind the body sees it beside the shoulder (within button.aimDot)
    const p = toWorld(f, lx, lz);
    const d = toWorld(f, lx + fx * Math.cos(a) - fz * Math.sin(a), lz + fx * Math.sin(a) + fz * Math.cos(a));
    return { ...p, yaw: Math.atan2(-(d.x - p.x), -(d.z - p.z)) };
  }

  /** Meshes + colliders away (the cached textures stay). */
  private unload() {
    for (const col of this.colliders) this.world.removeCollider(col, false);
    this.colliders = [];
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mat = m.material as MeshBasicMaterial;
        if (mat.map && ![...textures.values()].includes(mat.map)) mat.map.dispose();
        mat.dispose();
      });
    }
    this.group = this.buttons = this.sign = this.frame = null;
    this.step = null;
    this.slots = [];
  }
}
