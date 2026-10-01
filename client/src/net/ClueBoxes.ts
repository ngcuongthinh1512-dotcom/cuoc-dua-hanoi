// Phase 6 track B (SPEC §17.10, docs/plans/phase6.md §3.20): this team's clue boxes, drawn as ordinary 3D objects (houses
// hide them, so does turning away) ONLY from what the server sent: welcome.boxes, then `box reveal` once the team is within
// boxReveal.radius of the current one, `box hide` when it walks away again (opened boxes stay). The client never knows
// a box before that. Phase 7 (track B): an opened box turns grey in place (F → `race open` → reveal opened: true); a
// `kind: 'mat'` box is the Pit Stop mat (race/PitStop.ts); every change reports the zones (NPC exclusion, D20).
import { matMesh } from '../race/PitStop.ts';
import type { BoxInfo, ServerMessage } from '@race/shared/protocol';
import { BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, type Scene } from 'three';
import { clueBox as C } from '../config.ts';

export type BoxMessage = Extract<ServerMessage, { t: 'box' }>;

/** The visible boxes after a `box` message: reveal adds / replaces that step, hide drops it unless opened. Pure. */
export function nextBoxes(list: readonly BoxInfo[], m: BoxMessage): BoxInfo[] {
  if (m.op === 'reveal') return [...list.filter((b) => b.step !== m.box.step), m.box];
  return list.filter((b) => b.step !== m.step || b.opened);
}

/** DEV ?boxes=step,x,z[,opened];… (p6-boxes): stand-in boxes without a server (zone radius 20 m); `kind` 'mat' (?mat,
 *  p7-mat): Pit Stop mats instead. */
export function parseBoxes(v: string | null, kind?: 'mat'): BoxInfo[] {
  return (v ?? '').split(';').flatMap((g) => {
    const [step, x, z, opened] = g.split(',');
    const [px, pz] = [Number(x), Number(z)];
    return step && Number.isFinite(px) && Number.isFinite(pz) && x?.trim() && z?.trim() ? [{ step, x: px, z: pz, opened: opened === 'opened', r: 20, ...(kind && { kind }) }] : [];
  });
}

let parts: ReturnType<typeof makeParts> | undefined;
function makeParts() {
  const mat = (colour: string, glow: number) => new MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: glow, roughness: 0.6, side: DoubleSide });
  const { size: s, flag: F } = C;
  return {
    box: new BoxGeometry(s, s, s).translate(0, s / 2, 0),
    band: new BoxGeometry(s * 1.02, s * 0.22, s * 1.02).translate(0, s / 2, 0),
    pole: new CylinderGeometry(0.025, 0.025, F.height, 6).translate(0, F.height / 2, 0),
    cloth: new PlaneGeometry(F.width, F.depth / 2).translate(F.width / 2 + 0.025, 0, 0),
    open: { box: mat(C.colours.opened, 0), band: mat(C.colours.opened, 0) },
    shut: { box: mat(C.colours.box, C.glow), band: mat(C.colours.band, C.glow) },
    poleMat: new MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.6, roughness: 0.4 }),
  };
}

/** One box: cube with a red band, a pole beside it with a yellow-over-red flag (route-marker colours). */
function boxMesh(opened: boolean) {
  const P = (parts ??= makeParts());
  const g = new Group();
  g.name = 'box';
  const mesh = (geo: BoxGeometry | CylinderGeometry | PlaneGeometry, part: 'box' | 'band' | null, x = 0, y = 0) => {
    const o = new Mesh(geo, P.poleMat);
    o.position.set(x, y, 0);
    o.castShadow = o.receiveShadow = true;
    o.userData.part = part;
    return g.add(o), o;
  };
  const pole = C.size * 0.75;
  mesh(P.box, 'box');
  mesh(P.band, 'band');
  mesh(P.pole, null, pole);
  mesh(P.cloth, 'box', pole, C.flag.height - C.flag.depth / 4);
  mesh(P.cloth, 'band', pole, C.flag.height - (3 * C.flag.depth) / 4);
  return paint(g, opened);
}

/** Shut (glowing yellow / red) or opened (faded) materials, in place. */
function paint(g: Group, opened: boolean) {
  const m = opened ? parts!.open : parts!.shut;
  for (const o of g.children) if (o instanceof Mesh && o.userData.part) o.material = m[o.userData.part as 'box' | 'band'];
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

  /** Every frame: a box moves onto the collider under it, and up again when a higher one appears (a bridge deck's chunk
   *  collider loads after the terrain heightfield the first ray hit: the box sat on the Seine bed). Never down: a far
   *  chunk's colliders unload while its flag is still in view. */
  update() {
    for (const d of this.drawn.values()) {
      const y = this.groundAt(d.info.x, d.info.z);
      if (y !== null && (!d.placed || y > d.root.position.y)) (d.root.position.y = y), (d.placed = true);
    }
  }

  private sync() {
    for (const [step, d] of this.drawn) {
      const b = this.list.find((x) => x.step === step);
      if (b && b.x === d.info.x && b.z === d.info.z && b.kind === d.info.kind) {
        if (b.opened !== d.info.opened && b.kind !== 'mat') paint(d.root, b.opened); // opened: same box, faded
        d.info = b;
        continue;
      }
      d.root.removeFromParent(); // shared geometry / materials: nothing to dispose
      this.drawn.delete(step);
    }
    for (const b of this.list) {
      if (this.drawn.has(b.step)) continue;
      const root = b.kind === 'mat' ? matMesh() : boxMesh(b.opened);
      root.position.set(b.x, this.terrainAt(b.x, b.z), b.z);
      this.scene.add(root);
      this.drawn.set(b.step, { root, info: b, placed: false });
    }
    this.update();
    this.onChange?.(this.list);
  }
}
