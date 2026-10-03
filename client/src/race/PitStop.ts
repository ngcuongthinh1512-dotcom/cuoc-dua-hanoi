// Phase 7 track B (SPEC §8.6, docs/plans/phase7.md D19): the Pit Stop as the team sees it. The mat (a red carpet with
// yellow stripes, drawn by ClueBoxes for a `kind: 'mat'` box: the route leading to the Pit Stop and the Pit Stop itself)
// and the host NPC beside it (the player's UBC character in a dark suit-coloured shirt, a gold name tag): idle, waving while
// the team is near and when it checks in.
// 2026-10-03 (SPEC §17.38): the mat is PIT_MAT (16 × 32 m, shared/src/constants.ts), turned to the zone yaw (ClueBoxes), and
// IS the check-in zone (the server: onPitMat); a red light column marks it. The "VỀ ĐÍCH" gate was dropped.
import { BoxGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import { raceClient } from '../config.ts';
import { CharacterAnimator } from '../player/Animation.ts';
import { tickAction, yawOf } from '../player/CharacterController.ts';
import { type CharacterAsset, CharacterModel } from '../player/CharacterModel.ts';
import type { PlayerState } from '../player/types.ts';

const M = raceClient.mat;
const BM = raceClient.matBeam;
let parts: ReturnType<typeof makeParts> | undefined;

function makeParts() {
  const beam = new CylinderGeometry(BM.width / 2, BM.width / 2, BM.height, 8, 1, true).translate(0, BM.height / 2, 0);
  const ys = beam.getAttribute('position');
  beam.setAttribute('color', new Float32BufferAttribute(Array.from({ length: ys.count }, (_, i) => [1, 1, 1, 1 - ys.getY(i) / BM.height]).flat(), 4)); // alpha 1 → 0 upward
  return {
    carpet: new BoxGeometry(M.width, M.lift, M.length).translate(0, M.lift / 2, 0),
    stripe: new BoxGeometry(M.stripeWidth, M.lift, M.length).translate(0, M.lift, 0),
    red: new MeshStandardMaterial({ color: M.colour, roughness: 0.9 }),
    yellow: new MeshStandardMaterial({ color: M.stripe, emissive: M.stripe, emissiveIntensity: 0.25, roughness: 0.7 }),
    beam,
    beamMat: new MeshBasicMaterial({ color: BM.colour, vertexColors: true, transparent: true, depthWrite: false, opacity: BM.opacity }),
  };
}

/** The mat: carpet + a stripe along each long edge and across each end + the red light column (shared geometry / materials;
 *  6 draw calls). Local x = across, z = along the long axis; ClueBoxes turns it to the zone yaw. */
export function matMesh(): Group {
  const P = (parts ??= makeParts());
  const g = new Group();
  g.name = 'mat';
  const add = (o: Mesh, x: number, z: number, yaw = 0) => {
    o.position.set(x, 0, z);
    o.rotation.y = yaw;
    o.receiveShadow = true;
    g.add(o);
  };
  add(new Mesh(P.carpet, P.red), 0, 0);
  const inset = M.stripeWidth * 1.5;
  for (const s of [-1, 1]) {
    add(new Mesh(P.stripe, P.yellow), s * (M.width / 2 - inset), 0);
    const end = new Mesh(P.stripe, P.yellow);
    end.scale.z = (M.width - 2 * inset) / M.length;
    add(end, 0, s * (M.length / 2 - inset), Math.PI / 2);
  }
  const beam = new Mesh(P.beam, P.beamMat);
  beam.name = 'beam'; // ClueBoxes.update widens it with distance (userData.width / spread)
  beam.userData = { width: BM.width, spread: BM.spread };
  g.add(beam);
  return g;
}

/** The host NPC at the mat (one at most: a leg has one Pit Stop). */
export class PitHost {
  readonly model: CharacterModel;
  private readonly animator: CharacterAnimator;
  private readonly state: PlayerState = {
    position: new Vector3(), velocity: new Vector3(), yaw: 0, grounded: true, inWater: false, moveMode: 'walk', jumps: 0, action: 'none', actionTime: 0,
  };
  private since = Infinity; // s since the last wave (first one as soon as the team is near)

  constructor(asset: CharacterAsset) {
    const H = raceClient.host;
    this.model = new CharacterModel(asset, { shirt: H.shirt, name: H.name, tag: H.tag, tagDistance: H.tagDistance });
    this.model.root.visible = false;
    this.model.root.scale.setScalar(H.scale); // a touch taller than a player: seen from afar
    this.animator = new CharacterAnimator(this.model);
  }

  /** The finish (SPEC §8.6): a wave now. */
  cheer() {
    [this.state.action, this.state.actionTime] = ['wave', 0];
    this.since = 0;
  }

  /** `mat` = the drawn mat (ClueBoxes.mat) or null; `team` = the local player's feet. */
  update(dt: number, mat: Group | null, team: Vector3) {
    const root = this.model.root;
    if (mat && !root.parent) mat.parent?.add(root);
    root.visible = !!mat;
    if (!mat) return root.removeFromParent();
    const [side, along] = raceClient.host.offset;
    const [c, sn] = [Math.cos(mat.rotation.y), Math.sin(mat.rotation.y)]; // the offset turns with the mat
    const s = this.state;
    s.position.set(mat.position.x + side! * c + along! * sn, mat.position.y, mat.position.z - side! * sn + along! * c);
    const near = Math.hypot(team.x - s.position.x, team.z - s.position.z) < raceClient.host.waveRadius;
    s.yaw = yawOf(team.x - s.position.x, team.z - s.position.z); // always faces the arriving team
    tickAction(s, dt);
    if (near && s.action === 'none' && (this.since += dt) >= raceClient.host.waveEveryS) this.cheer();
    this.model.setPose(s.position, s.yaw);
    this.animator.update(s, dt);
  }
}
