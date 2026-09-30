// Track D (docs/plans/phase4b.md §3.9): pedestrians as skinned clones of the 4 avatars, pooled per avatar (a despawned
// pedestrian's clone serves the next one). ≤ npcRender.pedLod0 m from the camera: LOD0, shadows, mixer every frame;
// beyond: LOD1, no shadow, mixer every farAnimEvery frames. PedAnimator = pedClip (activity → clip + playback rate) +
// a crossfade; knocked = the root leans toward the push, fading out (staggerTilt).
// ponytail: ≤ crowd.max (40) skinned clones = ≤ 40 draw calls; baked-animation instancing for the far ones if
// p4b-density goes over the §9 budget.
import { type AnimationAction, AnimationMixer, Group, Mesh, type Object3D, Quaternion, SkinnedMesh, Sphere, Vector3 } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { character, crowd, npcAssets, npcRender as R } from '../config.ts';
import type { NpcAssets } from './NpcAssets.ts';
import { lerpPose, type Snap } from './NpcRenderer.ts';
import type { PedActivity, PedPose } from './types.ts';

const DEG = Math.PI / 180;
const WALKING = 0.05; // m/s: slower than this a 'walk' pedestrian plays idle (waiting at the kerb)

/** Clip name (npc-ped-anims.glb: m_walk, f_sit, …) and playback rate for an activity at a speed: walk vs stroll by the
 *  nearer root-motion speed (npcAssets.clipSpeed), rate = speed / that clip's speed so the feet don't slide. */
export function pedClip(activity: PedActivity, speed: number, g: 'm' | 'f'): { name: string; rate: number } {
  if (activity !== 'walk' || speed < WALKING) return { name: `${g}_${activity === 'walk' || activity === 'stand' ? 'idle' : activity}`, rate: 1 };
  const walk = npcAssets.clipSpeed[`${g}_walk`]!, stroll = npcAssets.clipSpeed[`${g}_stroll`]!;
  const name = `${g}_${speed < (walk + stroll) / 2 ? 'stroll' : 'walk'}`;
  return { name, rate: speed / npcAssets.clipSpeed[name]! };
}

/** Root lean (rad) t s after being knocked: up to stagger.tiltDeg in stagger.rise s, gone at crowd.stagger.seconds. */
export function staggerTilt(t: number): number {
  const T = crowd.stagger.seconds;
  if (t < 0 || t >= T) return 0;
  return R.stagger.tiltDeg * DEG * Math.sin((Math.min(1, t / R.stagger.rise) * Math.PI) / 2) * (1 - t / T) ** 2;
}

interface Entry {
  avatar: number;
  slot: number; // creation order: spreads the LOD1 mixer updates over the frames
  root: Group; // at the feet, turned to the heading; the clone below it
  lod0: Object3D[];
  lod1: Object3D[];
  near: boolean | null;
  mixer: AnimationMixer | null; // null without clips (asset stub)
  action: AnimationAction | null;
  clip: string;
  far: number; // s of animation owed while LOD1
}

const UP = new Vector3(0, 1, 0);
const q = new Quaternion(), tilt = new Quaternion(), axis = new Vector3();
const pose: Snap = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, wheel: 0, step: 0 };

export class PedRenderer {
  readonly root = new Group();
  readonly stats = { lod0: 0, lod1: 0, clones: 0 };
  private readonly byId = new Map<number, Entry>();
  private readonly free: Entry[][];
  private frame = 0;

  constructor(private readonly assets: NpcAssets) {
    this.free = assets.peds.map(() => []);
  }

  /** Pose, LOD and clip of every pedestrian; clones of those gone go back to their avatar's pool. */
  update(peds: readonly PedPose[], prev: ReadonlyMap<number, Snap>, alpha: number, camera: Vector3, dt: number) {
    const n = this.assets.peds.length;
    if (!n) return;
    this.frame++;
    this.stats.lod0 = this.stats.lod1 = 0;
    const seen = new Set<number>();
    for (const p of peds) {
      seen.add(p.id);
      let e = this.byId.get(p.id);
      if (!e) {
        e = this.free[p.avatar % n]!.pop() ?? this.make(p.avatar % n);
        e.root.visible = true;
        e.clip = '';
        this.byId.set(p.id, e);
      }
      const r = lerpPose(p, prev.get(p.id), alpha, pose);
      e.root.position.set(r.x, r.y, r.z);
      q.setFromAxisAngle(UP, r.yaw + Math.PI); // glTF faces +Z, yaw 0 faces −Z
      const lean = p.stagger >= 0 ? staggerTilt(p.stagger) : 0;
      if (lean) {
        const [dx, dz] = [-Math.sin(p.staggerYaw), -Math.cos(p.staggerYaw)]; // pushed toward
        q.premultiply(tilt.setFromAxisAngle(axis.set(dz, 0, -dx), lean)); // up × d: up leans toward d
      }
      e.root.quaternion.copy(q);
      const near = e.root.position.distanceTo(camera) <= R.pedLod0 || !e.lod1.length;
      if (near !== e.near) {
        e.near = near;
        for (const o of e.lod0) o.visible = near;
        for (const o of e.lod1) o.visible = !near;
      }
      near ? this.stats.lod0++ : this.stats.lod1++;
      this.animate(e, p, dt, near);
    }
    for (const [id, e] of this.byId) {
      if (seen.has(id)) continue;
      this.byId.delete(id);
      e.root.visible = false;
      e.mixer?.stopAllAction();
      e.action = null;
      this.free[e.avatar]!.push(e);
    }
  }

  private animate(e: Entry, p: PedPose, dt: number, near: boolean) {
    if (!e.mixer) return;
    const g = this.assets.peds[e.avatar]!.gender;
    const c = pedClip(p.activity, p.speed, g);
    if (c.name !== e.clip) {
      const clip = this.assets.clips.get(c.name);
      if (clip) {
        const next = e.mixer.clipAction(clip).reset();
        next.time = (p.activityTime * c.rate) % clip.duration; // phase from the sim
        next.play();
        if (e.action && e.action !== next) next.crossFadeFrom(e.action, R.pedFade, false);
        e.action = next;
      }
      e.clip = c.name;
    }
    if (e.action) e.action.timeScale = c.rate;
    e.far += dt;
    if (near || (this.frame + e.slot) % R.farAnimEvery === 0) {
      e.mixer.update(e.far);
      e.far = 0;
    }
  }

  private make(avatar: number): Entry {
    const t = this.assets.peds[avatar]!;
    const body = cloneSkinned(t.scene);
    const root = new Group().add(body);
    root.updateMatrixWorld(true);
    const lod0: Object3D[] = [], lod1: Object3D[] = [];
    const { y, radius } = character.cullSphere;
    body.traverse((o) => {
      if (o.userData.lod === 1) lod1.push(o);
      else if (o.userData.lod === 0) lod0.push(o);
      if (!(o instanceof Mesh)) return;
      const far = lod1.includes(o) || o.parent?.userData.lod === 1;
      o.castShadow = !far;
      o.receiveShadow = true;
      // Fixed culling sphere (the bind-pose bounds miss the animated pose), as CharacterModel.
      if (o instanceof SkinnedMesh) {
        const s = o.matrixWorld.getMaxScaleOnAxis();
        o.boundingSphere = new Sphere(new Vector3(0, y, 0).applyMatrix4(o.matrixWorld.clone().invert()), radius / s);
      }
    });
    if (!lod0.length) lod0.push(body);
    this.root.add(root);
    this.stats.clones++;
    const mixer = this.assets.clips.size ? new AnimationMixer(body) : null;
    return { avatar, slot: this.stats.clones, root, lod0, lod1, near: null, mixer, action: null, clip: '', far: 0 };
  }
}
