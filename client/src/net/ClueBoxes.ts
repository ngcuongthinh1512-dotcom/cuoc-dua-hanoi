// Phase 6 track B (SPEC §17.10, docs/plans/phase6.md §3.20): this team's clue boxes, drawn as ordinary 3D objects (houses
// hide them, so does turning away) ONLY from what the server sent: welcome.boxes, then `box reveal` once the team is within
// boxReveal.radius of the current one, `box hide` when it walks away again (opened boxes stay). The client never knows
// a box before that. Phase 7 adds opening (F) and the step logic.
import type { BoxInfo, ServerMessage } from '@race/shared/protocol';
import { BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, type Scene } from 'three';
import { clueBox as C } from '../config.ts';

export type BoxMessage = Extract<ServerMessage, { t: 'box' }>;

/** The visible boxes after a `box` message: reveal adds / replaces that step, hide drops it unless opened. Pure. */
export function nextBoxes(list: readonly BoxInfo[], m: BoxMessage): BoxInfo[] {
  if (m.op === 'reveal') return [...list.filter((b) => b.step !== m.box.step), m.box];
  return list.filter((b) => b.step !== m.step || b.opened);
}

/** DEV ?boxes=step,x,z[,opened];… (p6-boxes): stand-in boxes without a server (zone radius 20 m). */
export function parseBoxes(v: string | null): BoxInfo[] {
  return (v ?? '').split(';').flatMap((g) => {
    const [step, x, z, opened] = g.split(',');
    const [px, pz] = [Number(x), Number(z)];
    return step && Number.isFinite(px) && Number.isFinite(pz) && x?.trim() && z?.trim() ? [{ step, x: px, z: pz, opened: opened === 'opened', r: 20 }] : [];
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
  const m = opened ? P.open : P.shut;
  const g = new Group();
  const mesh = (geo: BoxGeometry | CylinderGeometry | PlaneGeometry, mat: MeshStandardMaterial, x = 0, y = 0) => {
    const o = new Mesh(geo, mat);
    o.position.set(x, y, 0);
    o.castShadow = o.receiveShadow = true;
    return g.add(o), o;
  };
  const pole = C.size * 0.75;
  mesh(P.box, m.box);
  mesh(P.band, m.band);
  mesh(P.pole, P.poleMat, pole);
  mesh(P.cloth, m.box, pole, C.flag.height - C.flag.depth / 4);
  mesh(P.cloth, m.band, pole, C.flag.height - (3 * C.flag.depth) / 4);
  return g;
}

export class ClueBoxes {
  private list: BoxInfo[] = [];
  private readonly drawn = new Map<string, { root: Group; info: BoxInfo; placed: boolean }>();

  constructor(
    private readonly scene: Scene,
    /** Top of the ground / deck at (x, z), or null while its collider is not loaded (then the terrain height). */
    private readonly groundAt: (x: number, z: number) => number | null,
    private readonly terrainAt: (x: number, z: number) => number,
  ) {}

  get boxes(): readonly BoxInfo[] {
    return this.list;
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

  /** Every frame: boxes still on the terrain height move onto the collider under them once it exists (bridge decks). */
  update() {
    for (const d of this.drawn.values()) {
      if (d.placed) continue;
      const y = this.groundAt(d.info.x, d.info.z);
      if (y !== null) (d.root.position.y = y), (d.placed = true);
    }
  }

  private sync() {
    for (const [step, d] of this.drawn) {
      const b = this.list.find((x) => x.step === step);
      if (b && b.opened === d.info.opened && b.x === d.info.x && b.z === d.info.z) continue;
      d.root.removeFromParent(); // shared geometry / materials: nothing to dispose
      this.drawn.delete(step);
    }
    for (const b of this.list) {
      if (this.drawn.has(b.step)) continue;
      const root = boxMesh(b.opened);
      root.position.set(b.x, this.terrainAt(b.x, b.z), b.z);
      this.scene.add(root);
      this.drawn.set(b.step, { root, info: b, placed: false });
    }
    this.update();
  }
}
