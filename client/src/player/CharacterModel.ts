// Track A (docs/plans/phase3.md §2): the skinned player body (public/models/player.glb + player-anims.glb, made by
// scripts/process-assets.ts), loaded once and cloned per character. Team shirt / trousers / shoes are painted by a
// bone-weight mask in one shared shader (per-instance colour uniforms); a canvas name tag sits above the head.
// Unreadable files → console.warn and a capsule in the shirt colour (the game still runs).
import {
  type AnimationClip,
  AnimationMixer,
  Box3,
  type BufferAttribute,
  Float32BufferAttribute,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  type ColorRepresentation,
  Group,
  type InterleavedBufferAttribute,
  LOD,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  Sphere,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { character as C } from '../config.ts';

/** Loaded once (body + clips); every CharacterModel clones it. Shared geometry / textures: never dispose them per model. */
export interface CharacterAsset {
  readonly scene: Object3D;
  readonly clips: readonly AnimationClip[];
}

/** Bones whose skin weights make the shirt (to the elbow), trousers (to the ankle), shoes: UBC / UE names. */
export const OUTFIT_BONES = [/^(spine_0[1-3]|clavicle_|upperarm_)/, /^(pelvis|thigh_|calf_)/, /^(foot_|ball_)/] as const;

type Attr = BufferAttribute | InterleavedBufferAttribute;
/** Per vertex [shirt, pants, shoes] = the summed skin weights of each part's bones (0…1). */
export function outfitMask(skinIndex: Attr, skinWeight: Attr, boneNames: readonly string[]): Float32Array {
  const part = boneNames.map((n) => OUTFIT_BONES.findIndex((re) => re.test(n)));
  const out = new Float32Array(skinIndex.count * 3);
  for (let i = 0; i < skinIndex.count; i++) {
    for (let c = 0; c < 4; c++) {
      const k = part[skinIndex.getComponent(i, c)] ?? -1;
      if (k >= 0) out[i * 3 + k]! += skinWeight.getComponent(i, c);
    }
  }
  return out;
}

/** Adds the outfit mask to every mesh that has one (unskinned = all shirt: the capsule) and the head height. */
export function prepareAsset(scene: Object3D, clips: readonly AnimationClip[]): CharacterAsset {
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const g = o.geometry;
    const mask =
      o instanceof SkinnedMesh
        ? outfitMask(g.getAttribute('skinIndex'), g.getAttribute('skinWeight'), o.skeleton.bones.map((b) => b.name))
        : new Float32Array(g.getAttribute('position').count * 3).map((_, i) => (i % 3 ? 0 : 1));
    if (mask.some((v) => v > 0)) g.setAttribute('outfit', new Float32BufferAttribute(mask, 3));
    const m = o.material as MeshStandardMaterial;
    if (m.name === 'MI_Hair_1') m.color.set(C.outfit.hair); // shared by hair + eyebrows, tinted once per asset
  });
  scene.userData.height = new Box3().setFromObject(scene).max.y; // skinned bounds in the bind pose
  return { scene, clips };
}

export async function loadCharacterAsset(url = C.modelUrl, clipsUrl = C.clipsUrl): Promise<CharacterAsset> {
  try {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [body, anims] = await Promise.all([loader.loadAsync(url), loader.loadAsync(clipsUrl)]);
    return prepareAsset(body.scene, anims.animations);
  } catch (e) {
    console.warn(`CharacterModel: ${url} / ${clipsUrl} missing or unreadable, capsule stand-in`, e);
    const body = new Mesh(new CapsuleGeometry(0.3, 1.2), new MeshStandardMaterial());
    body.position.y = 0.9;
    return prepareAsset(new Group().add(body), []);
  }
}

export interface CharacterOptions {
  shirt: ColorRepresentation;
  /** Name tag above the head; omitted / null = no tag (pedestrians). */
  name?: string | null;
  /** Name tag colour; omitted = the shirt (team colour). The Pit Stop host's dark suit needs a readable one. */
  tag?: ColorRepresentation;
  /** m from the camera beyond which the tag hides; omitted = character.nameTag.maxDistance. */
  tagDistance?: number;
}

type OutfitUniforms = Record<'uShirt' | 'uPants' | 'uShoes', { value: Color }>;
const [E0, E1] = C.outfit.edge.map((v) => v.toFixed(3));
/** One function object for every instance → one shared program (customProgramCacheKey = its source). */
function outfitShader(this: Material, shader: WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, this.userData.outfit as OutfitUniforms);
  shader.vertexShader = `attribute vec3 outfit;\nvarying vec3 vOutfit;\n${shader.vertexShader}`.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n\tvOutfit = outfit;',
  );
  shader.fragmentShader = `uniform vec3 uShirt, uPants, uShoes;\nvarying vec3 vOutfit;\n${shader.fragmentShader}`.replace(
    '#include <map_fragment>',
    `#include <map_fragment>
\tvec3 outfitW = smoothstep(vec3(${E0}), vec3(${E1}), vOutfit);
\tdiffuseColor.rgb = mix(mix(mix(diffuseColor.rgb, uShirt, outfitW.x), uPants, outfitW.y), uShoes, outfitW.z);`,
  );
}

/** Canvas sprite, constant size on screen (character.nameTag), hidden beyond maxDistance by an LOD. STYLE_GUIDE:
 *  team-coloured text, no frame: white text × material.color (= the shirt uniform, so setShirt recolours it, or opts.tag). */
function nameTag(text: string, y: number, colour: Color, maxDistance: number) {
  const T = C.nameTag;
  const font = `700 ${T.fontPx}px system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`; // Vietnamese glyphs
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width + T.fontPx);
  canvas.height = Math.ceil(T.fontPx * 1.6); // room for stacked diacritics (ộ, ử)
  Object.assign(ctx, { font, textAlign: 'center', textBaseline: 'middle', lineJoin: 'round', lineWidth: T.fontPx / 6 }); // reset by the resize
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'; // dark outline: readable over sky and stone
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map, sizeAttenuation: false, depthWrite: false }));
  sprite.material.color = colour;
  sprite.center.set(0.5, 0);
  sprite.scale.set((T.scale * canvas.width) / canvas.height, T.scale, 1);
  const lod = new LOD();
  lod.position.y = y;
  lod.addLevel(sprite, 0);
  lod.addLevel(new Object3D(), maxDistance);
  return { lod, sprite };
}

/** One character instance (local player, Phase 6 remote players, Phase 4B pedestrians). Origin at the feet. */
export class CharacterModel {
  readonly root = new Group();
  /** The cloned asset under root (turned π); the animator lifts it for clips posed off the feet (character.clipLift). */
  readonly body: Object3D;
  /** Bound to the cloned skeleton; the animator drives it. */
  readonly mixer: AnimationMixer;
  readonly clips: readonly AnimationClip[];
  private readonly outfit: OutfitUniforms = {
    uShirt: { value: new Color() },
    uPants: { value: new Color(C.outfit.pants) },
    uShoes: { value: new Color(C.outfit.shoes) },
  };
  private readonly materials: Material[] = []; // per-instance clones (the shared eye / hair materials are the asset's)
  private readonly height: number;
  private tag: ReturnType<typeof nameTag> | undefined;
  private readonly tagColour: Color;
  private readonly tagDistance: number;

  constructor(asset: CharacterAsset, opts: CharacterOptions) {
    const body = (this.body = cloneSkinned(asset.scene));
    body.rotation.y = Math.PI; // glTF faces +Z; PlayerState yaw 0 faces −Z
    body.updateMatrixWorld(true);
    const { y, radius } = C.cullSphere;
    body.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.castShadow = o.receiveShadow = true;
      // Fixed culling sphere (mesh-local; the bind-pose bounds miss the animated pose): still culled off screen, which
      // Phase 4B pedestrians / Phase 6 remote players need.
      if (o instanceof SkinnedMesh) {
        const s = o.matrixWorld.getMaxScaleOnAxis();
        o.boundingSphere = new Sphere(new Vector3(0, y, 0).applyMatrix4(o.matrixWorld.clone().invert()), radius / s);
      }
      if (!o.geometry.hasAttribute('outfit')) return;
      const m = (o.material as Material).clone();
      m.userData.outfit = this.outfit;
      m.onBeforeCompile = outfitShader;
      this.materials.push((o.material = m));
    });
    this.root.add(body);
    this.mixer = new AnimationMixer(body);
    this.clips = asset.clips;
    this.height = (asset.scene.userData.height as number | undefined) ?? 1.8;
    this.tagColour = opts.tag === undefined ? this.outfit.uShirt.value : new Color(opts.tag);
    this.tagDistance = opts.tagDistance ?? C.nameTag.maxDistance;
    this.setShirt(opts.shirt);
    this.setName(opts.name ?? null);
  }

  get shirt(): Readonly<Color> {
    return this.outfit.uShirt.value;
  }

  setShirt(colour: ColorRepresentation) {
    this.outfit.uShirt.value.set(colour);
  }

  setName(text: string | null) {
    if (this.tag) {
      this.tag.lod.removeFromParent();
      this.tag.sprite.material.map?.dispose();
      this.tag.sprite.material.dispose();
    }
    this.tag = text ? nameTag(text, this.height + C.nameTag.lift, this.tagColour, this.tagDistance) : undefined;
    if (this.tag) this.root.add(this.tag.lod);
  }

  /** Feet at `position`, facing `yaw` (PlayerState convention: 0 = north / −Z). */
  setPose(position: Vector3, yaw: number) {
    this.root.position.copy(position);
    this.root.rotation.y = yaw;
  }

  /** Frees what this instance owns (materials, tag texture, the cloned skeletons' bone textures), not the shared asset.
   *  ponytail: SkeletonUtils.clone gives each of the 4 meshes its own Skeleton (4 bone textures per character); bind them
   *  to one if Phase 4B crowds show bone uploads (player.glb's 4 skins have separate inverse-bind accessors). */
  dispose() {
    this.body.traverse((o) => o instanceof SkinnedMesh && o.skeleton.dispose());
    this.root.removeFromParent();
    this.setName(null);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    for (const m of this.materials) m.dispose();
  }
}
