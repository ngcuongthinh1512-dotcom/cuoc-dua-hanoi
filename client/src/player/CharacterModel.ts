// Track A (docs/plans/phase3.md). STUB until Track A lands: a capsule in the shirt colour, no GLB, no clips, no tag.
import {
  type AnimationClip,
  AnimationMixer,
  CapsuleGeometry,
  type ColorRepresentation,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type Vector3,
} from 'three';
import { character as C } from '../config.ts';

/** Loaded once (body + clips); every CharacterModel clones it. Shared geometry / textures: never dispose them per model. */
export interface CharacterAsset {
  readonly scene: Object3D;
  readonly clips: readonly AnimationClip[];
}

export async function loadCharacterAsset(url = C.modelUrl, clipsUrl = C.clipsUrl): Promise<CharacterAsset> {
  void [url, clipsUrl];
  const body = new Mesh(new CapsuleGeometry(0.3, 1.2));
  body.position.y = 0.9;
  return { scene: new Group().add(body), clips: [] };
}

export interface CharacterOptions {
  shirt: ColorRepresentation;
  /** Name tag above the head; omitted / null = no tag (pedestrians). */
  name?: string | null;
}

/** One character instance (local player, Phase 6 remote players, Phase 4B pedestrians). Origin at the feet. */
export class CharacterModel {
  readonly root = new Group();
  /** Bound to the cloned skeleton; the animator drives it. */
  readonly mixer: AnimationMixer;
  readonly clips: readonly AnimationClip[];
  private readonly material = new MeshStandardMaterial();

  constructor(asset: CharacterAsset, opts: CharacterOptions) {
    const body = asset.scene.clone();
    body.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.material = this.material;
      o.castShadow = true;
    });
    this.root.add(body);
    this.mixer = new AnimationMixer(body);
    this.clips = asset.clips;
    this.setShirt(opts.shirt);
  }

  setShirt(colour: ColorRepresentation) {
    this.material.color.set(colour);
  }

  setName(text: string | null) {
    void text;
  }

  /** Feet at `position`, facing `yaw` (PlayerState convention: 0 = north / −Z). */
  setPose(position: Vector3, yaw: number) {
    this.root.position.copy(position);
    this.root.rotation.y = yaw;
  }

  /** Frees what this instance owns (materials, tag texture), not the shared asset. */
  dispose() {
    this.root.removeFromParent();
    this.material.dispose();
  }
}
