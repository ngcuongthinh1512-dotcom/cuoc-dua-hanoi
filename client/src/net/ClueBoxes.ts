// Phase 6 track B (SPEC §17.10, docs/plans/phase6.md §3.20): this team's clue boxes, drawn as ordinary 3D objects (houses
// hide them, so does turning away) ONLY from what the server sent: welcome.boxes, then `box reveal` once the team is within
// boxReveal.radius of the current one, `box hide` when it walks away again (opened boxes stay). The client never knows
// a box before that. Phase 7 (track B): an opened box opens its lid in place (F → `race open` → reveal opened: true); a
// `kind: 'mat'` box is the Pit Stop mat (race/PitStop.ts); every change reports the zones (NPC exclusion, D20).
// Phase 8 (docs/plans/phase8.md D7): boxes keyed by step|branch (a detour branch's box), `box remove` after a branch
// switch, the box's front turned to BoxInfo.yaw.
import { matMesh } from '../race/PitStop.ts';
import type { BoxInfo, ServerMessage } from '@race/shared/protocol';
import {
  AdditiveBlending, BoxGeometry, CylinderGeometry, Float32BufferAttribute, Group, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, type Scene, Sprite, SpriteMaterial, type Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clueBox as C, lighting as LT } from '../config.ts';
import { additive, falloff, nightHdr } from '../world/glow.ts';
import { isNight } from '../world/night.ts';

export type BoxMessage = Extract<ServerMessage, { t: 'box' }>;

/** Phase 8 (D7): a box is one step's, or one detour branch's ("D1|A"): two branches of a step may stand at once. */
const keyOf = (b: { step: string; branch?: string }) => `${b.step}|${b.branch ?? ''}`;

/** The visible boxes after a `box` message, pure: reveal adds / replaces that step|branch; hide drops that step's box
 *  unless opened; remove (a branch switch, §17.16) drops that branch's box even when opened. */
export function nextBoxes(list: readonly BoxInfo[], m: BoxMessage): BoxInfo[] {
  if (m.op === 'reveal') return [...list.filter((b) => keyOf(b) !== keyOf(m.box)), m.box];
  if (m.op === 'remove') return list.filter((b) => keyOf(b) !== keyOf(m));
  return list.filter((b) => b.step !== m.step || b.opened);
}

/** root.rotation.y of a box whose front (the side the team reads it from) faces `yaw` (BoxInfo.yaw: 0 = north, + = west).
 *  The model's front is +z (the lid hinges at −z), so + π, like CharacterModel. */
export const boxRotation = (yaw = 0) => yaw + Math.PI;

/** DEV ?boxes=step[|branch],x,z[,opened][,yawDeg];… (p6-boxes, p8-box-*): stand-in boxes without a server (zone radius
 *  20 m); `kind` 'mat' (?mat, p7-mat): Pit Stop mats instead. */
export function parseBoxes(v: string | null, kind?: 'mat'): BoxInfo[] {
  return (v ?? '').split(';').flatMap((g) => {
    const [id, x, z, opened, yawDeg] = g.split(',');
    const [step, branch] = (id ?? '').split('|');
    const [px, pz, yd] = [Number(x), Number(z), Number(yawDeg)];
    if (!step || !Number.isFinite(px) || !Number.isFinite(pz) || !x?.trim() || !z?.trim()) return [];
    const yaw = yawDeg?.trim() && Number.isFinite(yd) ? { yaw: (yd * Math.PI) / 180 } : {};
    return [{ step, x: px, z: pz, opened: opened === 'opened', r: 20, ...(kind && { kind }), ...(branch && { branch }), ...yaw }];
  });
}

// Geometries and materials shared by every box (4 draw calls and 3 materials each, + the light column); freed only by
// ClueBoxes.dispose.
let parts: ReturnType<typeof makeParts> | undefined;
function makeParts() {
  const { base: B, post: P, head: H, lid: L, beam: M, colours: c } = C;
  const box = (w: number, h: number, d: number, y: number) => new BoxGeometry(w, h, d).translate(0, y + h / 2, 0);
  const night = isNight();
  const NB = LT.boxes;
  // night: brighter emissive, an additive HDR column, a halo sprite + a ground pool (no real light); day: as before
  const lit = (color: string) => new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: night ? NB.emissive * LT.emissiveScale : C.glow, roughness: 0.5 });
  const halo = (k: number) => new SpriteMaterial({ map: falloff('round'), color: nightHdr(c.post, NB.halo.strength * k), blending: AdditiveBlending, depthWrite: false });
  const across = P.size + 2 * P.proud;
  const top = B.height + P.height + H.height + L.height;
  const beam = new CylinderGeometry(M.width / 2, M.width / 2, M.height, 8, 1, true).translate(0, top + M.height / 2, 0);
  const ys = beam.getAttribute('position');
  beam.setAttribute('color', new Float32BufferAttribute(Array.from({ length: ys.count }, (_, i) => [1, 1, 1, 1 - (ys.getY(i) - top) / M.height]).flat(), 4)); // alpha 1 → 0 upward
  return {
    beam,
    beamMat: night
      ? new MeshBasicMaterial({ color: nightHdr(c.post, NB.beam), vertexColors: true, transparent: true, depthWrite: false, opacity: 0, blending: AdditiveBlending })
      : new MeshBasicMaterial({ color: c.post, vertexColors: true, transparent: true, depthWrite: false, opacity: 0 }), // normal blending: stays yellow on a bright sky
    body: mergeGeometries([box(B.size, B.height + B.sink, B.size, -B.sink), box(H.size, H.height, H.size, B.height + P.height)])!,
    post: box(P.size, P.height, P.size, B.height),
    stripes: mergeGeometries([box(P.stripe, P.height, across, B.height), box(across, P.height, P.stripe, B.height)])!, // a "+" through the post: one stripe per face
    lid: box(L.size, L.height, L.size, 0).translate(0, 0, L.size / 2), // hinge (its back edge) at the origin
    grey: new MeshStandardMaterial({ color: c.grey, roughness: 0.7 }),
    yellow: lit(c.post),
    red: lit(c.stripe),
    redOpened: new MeshStandardMaterial({ color: c.opened, roughness: 0.8 }),
    ...(night && {
      halo: halo(1),
      haloOpened: halo(NB.opened),
      pool: new PlaneGeometry(2 * NB.pool.radius, 2 * NB.pool.radius).rotateX(-Math.PI / 2).translate(0, 0.03, 0),
      poolMat: additive('round', nightHdr(c.post, NB.pool.strength)),
      poolOpened: additive('round', nightHdr(c.post, NB.pool.strength * NB.opened)),
    }),
  };
}

/** The organiser's prop (config clueBox): base + head box, lid, yellow post, red stripes; + the light column (closed only). */
function boxMesh(opened: boolean) {
  const P = (parts ??= makeParts());
  const g = new Group();
  g.name = 'box';
  for (const [name, geo, mat] of [['body', P.body, P.grey], ['lid', P.lid, P.grey], ['post', P.post, P.yellow], ['stripes', P.stripes, P.red], ['beam', P.beam, P.beamMat]] as const) {
    const o = new Mesh(geo, mat);
    o.name = name;
    o.castShadow = o.receiveShadow = name !== 'beam';
    g.add(o);
  }
  g.getObjectByName('lid')!.position.set(0, C.base.height + C.post.height + C.head.height, -C.lid.size / 2);
  if (P.halo) {
    const halo = new Sprite(P.halo);
    halo.name = 'halo';
    halo.position.y = LT.boxes.halo.y;
    const pool = new Mesh(P.pool, P.poolMat);
    pool.name = 'pool';
    g.add(halo, pool);
  }
  return paint(g, opened);
}

/** Shut or opened (lid swung up about its back edge, stripes dimmed, no light column), in place. */
function paint(g: Group, opened: boolean) {
  g.getObjectByName('lid')!.rotation.x = opened ? (-C.lid.openDeg * Math.PI) / 180 : 0;
  (g.getObjectByName('stripes') as Mesh).material = opened ? parts!.redOpened : parts!.red;
  g.getObjectByName('beam')!.visible = !opened;
  const halo = g.getObjectByName('halo') as Sprite | undefined; // night: the next target bright, opened ones dim
  if (halo) halo.material = opened ? parts!.haloOpened! : parts!.halo!;
  const pool = g.getObjectByName('pool') as Mesh | undefined;
  if (pool) pool.material = opened ? parts!.poolOpened! : parts!.poolMat!;
  return g;
}

export class ClueBoxes {
  private list: BoxInfo[] = [];
  private readonly drawn = new Map<string, { root: Group; info: BoxInfo; placed: boolean }>();
  /** After every change (D20: main.ts → Npc.setExclusionZones). */
  onChange?: (list: readonly BoxInfo[]) => void;

  constructor(
    private readonly scene: Scene,
    /** Top of the ground / deck at (x, z), or null while its collider is not loaded (then the terrain height). */
    private readonly groundAt: (x: number, z: number) => number | null,
    private readonly terrainAt: (x: number, z: number) => number,
  ) {}

  get boxes(): readonly BoxInfo[] {
    return this.list;
  }

  /** The drawn Pit Stop mat (its position = the zone centre on the ground), null if none. */
  get mat(): Group | null {
    for (const d of this.drawn.values()) if (d.info.kind === 'mat') return d.root;
    return null;
  }

  /** welcome.boxes (also after a reconnect: replaces everything). */
  reset(list: readonly BoxInfo[]) {
    this.list = [...list];
    this.sync();
  }

  apply(m: BoxMessage) {
    this.list = nextBoxes(this.list, m);
    this.sync();
  }

  /** Drops every box and frees the shared box parts (the next box builds them again). */
  dispose() {
    this.reset([]);
    for (const p of Object.values(parts ?? {})) p.dispose(); // the falloff texture is shared (world/glow.ts): kept
    parts = undefined;
  }

  /** Every frame: a box moves onto the collider under it, and up again when a higher one appears (a bridge deck's chunk
   *  collider loads after the terrain heightfield the first ray hit: the box sat on the Seine bed). Never down: a far
   *  chunk's colliders unload while its box is still in view. `eye` (the camera): the light column's width and fade. */
  update(eye?: Vector3) {
    let near = Infinity;
    for (const d of this.drawn.values()) {
      const y = this.groundAt(d.info.x, d.info.z);
      if (y !== null && (!d.placed || y > d.root.position.y)) (d.root.position.y = y), (d.placed = true);
      const halo = eye && d.root.getObjectByName('halo');
      if (halo) halo.scale.setScalar(Math.max(LT.boxes.halo.size, Math.hypot(d.info.x - eye.x, d.info.z - eye.z) * LT.boxes.halo.spread));
      const beam = d.root.getObjectByName('beam');
      if (!eye || !beam?.visible) continue;
      const dist = Math.hypot(d.info.x - eye.x, d.info.z - eye.z);
      const { width = C.beam.width, spread = C.beam.spread } = beam.userData as { width?: number; spread?: number }; // the mat's own column (PitStop.ts)
      beam.scale.x = beam.scale.z = Math.max(1, (dist * spread) / width);
      if (d.info.kind !== 'mat') near = Math.min(near, dist); // the mat's column never fades
    }
    // ponytail: one shared fade (the nearest closed box); the server only ever sends one unopened box at a time
    if (!eye || !parts) return;
    parts.beamMat.opacity = C.beam.opacity * MathUtils.smoothstep(near, C.beam.fade[0], C.beam.fade[1]);
    parts.beamMat.visible = parts.beamMat.opacity > 0; // no draw call up close
  }

  private sync() {
    for (const [key, d] of this.drawn) {
      const b = this.list.find((x) => keyOf(x) === key);
      if (b && b.x === d.info.x && b.z === d.info.z && b.kind === d.info.kind && b.yaw === d.info.yaw) {
        if (b.opened !== d.info.opened && b.kind !== 'mat') paint(d.root, b.opened); // opened: same box, faded
        d.info = b;
        continue;
      }
      d.root.removeFromParent(); // shared geometry / materials: nothing to dispose
      this.drawn.delete(key);
    }
    for (const b of this.list) {
      const key = keyOf(b);
      if (this.drawn.has(key)) continue;
      const root = b.kind === 'mat' ? matMesh() : boxMesh(b.opened);
      root.position.set(b.x, this.terrainAt(b.x, b.z), b.z);
      root.rotation.y = b.kind === 'mat' ? (b.yaw ?? 0) : boxRotation(b.yaw); // the mat: long axis along the zone yaw (= the server's onPitMat rectangle, SPEC §17.38)
      this.scene.add(root);
      this.drawn.set(key, { root, info: b, placed: false });
    }
    this.update();
    this.onChange?.(this.list);
  }
}
