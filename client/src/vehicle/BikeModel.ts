// Track A (docs/plans/phase4.md): the Vélib'-style bicycle (public/models/bike.glb from scripts/process-assets.ts), loaded
// once and cloned per bike: wheels + crank spin from BikeState, lean and steer, team lock marker, sparkle when available.
// FOUNDATION STUB: a grey box placeholder with the final signatures, so track B can ride and screenshot before A lands.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D, Vector3 } from 'three';
import { bikeModel as C } from '../config.ts';
import type { BikeState, RiderTargets } from './types.ts';

export interface BikeAsset {
  /** Frame (+ basket), front fork group, two wheels, crank: separate pivots (A fills it). */
  readonly scene: Object3D | null;
}

/** Loads models/bike.glb once; unreadable → console.warn and the placeholder (the game still runs). */
export async function loadBikeAsset(_url = C.url): Promise<BikeAsset> {
  return { scene: null };
}

export class BikeModel {
  readonly root = new Group();
  private readonly targets: RiderTargets = {
    saddle: new Vector3(), pedalL: new Vector3(), pedalR: new Vector3(), gripL: new Vector3(), gripR: new Vector3(),
  };

  constructor(_asset: BikeAsset) {
    const box = new Mesh(new BoxGeometry(0.08, 1, 1.75), new MeshStandardMaterial({ color: C.colours.frame }));
    box.position.y = 0.5;
    this.root.add(box);
  }

  /** Pose from the state: position (pivot at ground contact), yaw, lean, steer, wheel / crank angles, lock marker
   *  (ownerColour), sparkle on/off (the caller decides: available and ≤ bikeRules.sparkleRadius from the local player). */
  update(b: Readonly<BikeState>, _sparkle: boolean, _dt: number) {
    this.root.position.copy(b.position);
    this.root.rotation.set(0, b.yaw, 0);
  }

  /** IK targets at the current pose (after update). */
  riderTargets(): RiderTargets {
    const t = this.targets;
    for (const v of [t.saddle, t.pedalL, t.pedalR, t.gripL, t.gripR]) v.copy(this.root.position).setY(this.root.position.y + 1);
    return t;
  }

  dispose() {
    this.root.removeFromParent();
  }
}
