// Phase 7 track B (SPEC §8.6, docs/plans/phase7.md D19): the Pit Stop as the team sees it. The mat (a red carpet with
// yellow stripes, drawn by ClueBoxes for a `kind: 'mat'` box: the route leading to the Pit Stop and the Pit Stop itself)
// and the host NPC beside it (the player's UBC character in a dark suit-coloured shirt, a gold name tag): idle, waving while
// the team is near and when it checks in. The check-in zone is the whole Pit Stop radius (BoxInfo.r), not the carpet.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { raceClient } from '../config.ts';
import { CharacterAnimator } from '../player/Animation.ts';
import { tickAction, yawOf } from '../player/CharacterController.ts';
import { type CharacterAsset, CharacterModel } from '../player/CharacterModel.ts';
import type { PlayerState } from '../player/types.ts';

const M = raceClient.mat;
let parts: { carpet: BoxGeometry; stripe: BoxGeometry; red: MeshStandardMaterial; yellow: MeshStandardMaterial } | undefined;

/** The mat: carpet + a stripe along each long edge and across each end (shared geometry / materials). */
export function matMesh(): Group {
  const P = (parts ??= {
    carpet: new BoxGeometry(M.width, M.lift, M.length).translate(0, M.lift / 2, 0),
    stripe: new BoxGeometry(M.stripeWidth, M.lift, M.length).translate(0, M.lift, 0),
    red: new MeshStandardMaterial({ color: M.colour, roughness: 0.9 }),
    yellow: new MeshStandardMaterial({ color: M.stripe, emissive: M.stripe, emissiveIntensity: 0.25, roughness: 0.7 }),
  });
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
    const s = this.state;
    s.position.set(mat.position.x + side!, mat.position.y, mat.position.z + along!);
    const near = Math.hypot(team.x - s.position.x, team.z - s.position.z) < raceClient.host.waveRadius;
    s.yaw = near ? yawOf(team.x - s.position.x, team.z - s.position.z) : yawOf(-side!, 0); // faces the team, else the mat
    tickAction(s, dt);
    if (near && s.action === 'none' && (this.since += dt) >= raceClient.host.waveEveryS) this.cheer();
    this.model.setPose(s.position, s.yaw);
    this.animator.update(s, dt);
  }
}
