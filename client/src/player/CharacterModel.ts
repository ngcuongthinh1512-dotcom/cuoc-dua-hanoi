// Track A (docs/plans/phase3.md §2), Leg 2 (docs/plans/leg2-characters.md): the skinned player bodies (public/models/
// player.glb: Rocketbox avatars player_m / player_f with a backpack + player-anims.glb: retargeted UAL clips m_* / f_*, made
// by scripts/process-assets.ts), loaded once and cloned per character. The team colour tints the tank top and the backpack
// through the atlas alpha (one shared shader, per-instance colour uniform; a little glow at night); a canvas name tag sits
// above the head. Unreadable files → console.warn and a capsule in the shirt colour (the game still runs).
import {
  type AnimationClip,
  AnimationMixer,
  Box3,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  type ColorRepresentation,
  Group,
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
import { character as C, lighting } from '../config.ts';
import { isNight } from '../world/night.ts';

/** One avatar (body + its clips), loaded once; every CharacterModel clones it. Shared geometry / textures: never dispose
 *  them per model. `avatars` (loadCharacterAsset): every avatar by index (0 = Nam, 1 = Nữ), the asset itself = avatar 0. */
export interface CharacterAsset {
  readonly scene: Object3D;
  readonly clips: readonly AnimationClip[];
  readonly avatars?: readonly CharacterAsset[];
}

/** Root nodes of player.glb by avatar index (settings "Nhân vật": 0 = Nam, 1 = Nữ) and their clip prefixes. */
export const AVATARS = [{ node: 'player_m', clips: 'm_' }, { node: 'player_f', clips: 'f_' }] as const;

/** The clips of avatar `i` (player-anims.glb `m_Idle_Loop`…) under their UAL names (Animation.ts UAL_CLIPS); a file
 *  without prefixed clips (old rig, tests) keeps them all. */
export function avatarClips(clips: readonly AnimationClip[], i: number): AnimationClip[] {
  const p = AVATARS[i]?.clips ?? AVATARS[0].clips;
  const own = clips.filter((c) => c.name.startsWith(p));
  if (!own.length && !clips.some((c) => AVATARS.some((a) => c.name.startsWith(a.clips)))) return [...clips];
  return own.map((c) => Object.assign(c.clone(), { name: c.name.slice(p.length) }));
}

/** Bind-pose height (name tag) of the asset. */
export function prepareAsset(scene: Object3D, clips: readonly AnimationClip[]): CharacterAsset {
  scene.updateMatrixWorld(true);
  scene.userData.height ??= new Box3().setFromObject(scene).max.y; // skinned bounds in the bind pose
  return { scene, clips };
}

export async function loadCharacterAsset(url = C.modelUrl, clipsUrl = C.clipsUrl): Promise<CharacterAsset> {
  try {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [body, anims] = await Promise.all([loader.loadAsync(url), loader.loadAsync(clipsUrl)]);
    const avatars = AVATARS.map(({ node }, i) => {
      const scene = body.scene.getObjectByName(node);
      if (!scene) throw new Error(`no ${node}`);
      scene.removeFromParent();
      // GLTFLoader makes node names unique across the file (the second skeleton's pelvis → pelvis_1): back to the bones'
      // own names, which the clips and the animator use
      scene.traverse((o) => typeof o.userData.name === 'string' && (o.name = o.userData.name));
      return prepareAsset(scene, avatarClips(anims.animations, i));
    });
    return { ...avatars[0]!, avatars };
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
  /** Avatar index in CharacterAsset.avatars (0 = Nam, 1 = Nữ); omitted / unknown = 0. */
  avatar?: number;
}

type OutfitUniforms = Record<'uShirt', { value: Color }>;
const GLOW = (C.outfit.nightGlow * lighting.emissiveScale).toFixed(3);
/** One function object for every instance → one shared program (customProgramCacheKey = its source). Atlas tiles (uv):
 *  body (0, 0) | head (1, 0) / opacity (0, 1) | backpack (1, 1); alpha in the body and backpack tiles = the tint mask
 *  (1 = as is, ≤ 0.6 = × the team colour), in the opacity tile = the hair cut-out; no map (capsule) = all team colour. */
function outfitShader(this: Material, shader: WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, this.userData.outfit as OutfitUniforms);
  shader.fragmentShader = `uniform vec3 uShirt;\n${shader.fragmentShader}`
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
#ifdef USE_MAP
\tvec2 outfitTile = step(vec2(0.5), vMapUv);
\tfloat outfitM = (1.0 - abs(outfitTile.x - outfitTile.y)) * clamp((1.0 - diffuseColor.a) * 2.5, 0.0, 1.0);
\tdiffuseColor.a = mix(1.0, diffuseColor.a, outfitTile.y * (1.0 - outfitTile.x));
#else
\tfloat outfitM = 1.0;
#endif
\tdiffuseColor.rgb *= mix(vec3(1.0), uShirt, outfitM);`,
    )
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${isNight() ? `\n\ttotalEmissiveRadiance += diffuseColor.rgb * outfitM * ${GLOW};` : ''}`);
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
  private readonly outfit: OutfitUniforms = { uShirt: { value: new Color() } };
  private readonly materials: Material[] = []; // per-instance clones
  private readonly height: number;
  /** Avatar index drawn (CharacterOptions.avatar, 0 when the asset has no such avatar). */
  readonly avatar: number;
  /** × character.clipSpeed: this avatar's legs are this much longer than avatar 0's (player.glb extras.stride). */
  readonly stride: number;
  private tag: ReturnType<typeof nameTag> | undefined;
  private readonly tagColour: Color;
  private readonly tagDistance: number;

  constructor(assets: CharacterAsset, opts: CharacterOptions) {
    const asset = assets.avatars?.[opts.avatar ?? 0] ?? assets;
    this.avatar = asset === assets ? 0 : (opts.avatar ?? 0);
    this.stride = (asset.scene.userData.stride as number | undefined) ?? 1;
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

  /** Frees what this instance owns (materials, tag texture, the cloned skeleton's bone texture), not the shared asset. */
  dispose() {
    this.body.traverse((o) => o instanceof SkinnedMesh && o.skeleton.dispose());
    this.root.removeFromParent();
    this.setName(null);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    for (const m of this.materials) m.dispose();
  }
}
