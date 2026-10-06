// Leg 2 player avatars (docs/plans/leg2-characters.md (b)): pure helpers of scripts/process-assets.ts `player` /
// `player-anims` (tested in rig.test.ts): the Rocketbox Bip01 ↔ client (UE) ↔ UAL (Rigify DEF-) bone table, the world-space
// retarget of one frame, and the team-colour mask of the tank top in the body texture.
import { Matrix4, Quaternion, Vector3 } from 'three';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
const UAL_FINGER = { thumb: 'thumb', index: 'f_index', middle: 'f_middle', ring: 'f_ring', pinky: 'f_pinky' } as const;

/** [Rocketbox Bip01 bone, its name in the client (UE / UBC names: Animation.ts arms, rider IK, trunk), UAL source bone]. */
export const BONES: readonly (readonly [string, string, string])[] = [
  ['Bip01_Pelvis', 'pelvis', 'DEF-hips'],
  ['Bip01_Spine', 'spine_01', 'DEF-spine.001'],
  ['Bip01_Spine1', 'spine_02', 'DEF-spine.002'],
  ['Bip01_Spine2', 'spine_03', 'DEF-spine.003'],
  ['Bip01_Neck', 'neck_01', 'DEF-neck'],
  ['Bip01_Head', 'Head', 'DEF-head'],
  ...(['L', 'R'] as const).flatMap((S) => {
    const s = S.toLowerCase();
    return [
      [`Bip01_${S}_Clavicle`, `clavicle_${s}`, `DEF-shoulder.${S}`],
      [`Bip01_${S}_UpperArm`, `upperarm_${s}`, `DEF-upper_arm.${S}`],
      [`Bip01_${S}_Forearm`, `lowerarm_${s}`, `DEF-forearm.${S}`],
      [`Bip01_${S}_Hand`, `hand_${s}`, `DEF-hand.${S}`],
      [`Bip01_${S}_Thigh`, `thigh_${s}`, `DEF-thigh.${S}`],
      [`Bip01_${S}_Calf`, `calf_${s}`, `DEF-shin.${S}`],
      [`Bip01_${S}_Foot`, `foot_${s}`, `DEF-foot.${S}`],
      [`Bip01_${S}_Toe0`, `ball_${s}`, `DEF-toe.${S}`],
      // Biped Finger0 / 01 / 02 = thumb, Finger1x = index … Finger4x = pinky
      ...FINGERS.flatMap((f, k) => [1, 2, 3].map((i) => [`Bip01_${S}_Finger${k}${i > 1 ? i - 1 : ''}`, `${f}_0${i}_${s}`, `DEF-${UAL_FINGER[f]}.0${i}.${S}`] as const)),
    ] as const;
  }),
];
export const BIP_TO_UE: ReadonlyMap<string, string> = new Map(BONES.map(([b, u]) => [b, u]));
export const UE_TO_UAL: ReadonlyMap<string, string> = new Map(BONES.map(([, u, s]) => [u, s]));

/** The child each bone points at in the rest pose (its rest-pose correction); a bone without one takes its parent's. */
const AIM: Record<string, string> = {
  pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'Head',
  ...Object.fromEntries(['l', 'r'].flatMap((s) => [
    [`clavicle_${s}`, `upperarm_${s}`], [`upperarm_${s}`, `lowerarm_${s}`], [`lowerarm_${s}`, `hand_${s}`], [`hand_${s}`, `middle_01_${s}`],
    [`thigh_${s}`, `calf_${s}`], [`calf_${s}`, `foot_${s}`], [`foot_${s}`, `ball_${s}`],
    ...FINGERS.flatMap((f) => [[`${f}_01_${s}`, `${f}_02_${s}`], [`${f}_02_${s}`, `${f}_03_${s}`]]),
  ])),
};

/** A bone at rest: local translation (m) and rotation, parent by name (null = the rig's root). */
export interface RigBone { name: string; parent: string | null; t: readonly number[]; q: readonly number[] }
/** Animated locals by bone name (missing = the rest value). */
export type Pose = ReadonlyMap<string, { t?: readonly number[]; q?: readonly number[] }>;

const ONE = new Vector3(1, 1, 1);
const pos = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);
const rot = (m: Matrix4) => new Quaternion().setFromRotationMatrix(m);

/** Parents before children. */
function sorted(bones: readonly RigBone[]) {
  const by = new Map(bones.map((b) => [b.name, b]));
  const depth = (b: RigBone): number => (b.parent && by.has(b.parent) ? 1 + depth(by.get(b.parent)!) : 0);
  return [...bones].sort((a, b) => depth(a) - depth(b));
}

function worlds(order: readonly RigBone[], pose?: Pose) {
  const W = new Map<string, Matrix4>();
  for (const b of order) {
    const p = pose?.get(b.name);
    const l = new Matrix4().compose(new Vector3(...(p?.t ?? b.t)), new Quaternion(...(p?.q ?? b.q)), ONE);
    W.set(b.name, b.parent && W.has(b.parent) ? W.get(b.parent)!.clone().multiply(l) : l);
  }
  return W;
}

/** World-space retarget from `src` onto `dst` (both standing y-up, facing +Z, left at +X). `pairs`: dst bone → src bone.
 *  Per mapped bone: world(dst) = world(src) · Q, Q = src rest⁻¹ · A · dst rest, A = the shortest turn that points the dst
 *  bone (rest) along its src bone (AIM child): an A-pose target follows a T-pose source. `hips` (dst) also moves: its
 *  world offset from rest = the src offset × the hip-height ratio (`legs` = [dst, src] hip joints). Unmapped dst bones keep
 *  their rest locals. Returns the frame function: mapped dst locals (+ the hips translation) and every dst world matrix. */
export function retargeter(src: readonly RigBone[], dst: readonly RigBone[], pairs: ReadonlyMap<string, string>, hips: string, legs: readonly [string, string]) {
  const [S, D] = [sorted(src), sorted(dst)];
  const [S0, D0] = [worlds(S), worlds(D)];
  const k = pos(D0.get(legs[0])!).y / pos(S0.get(legs[1])!).y;
  const A = new Map<string, Quaternion>();
  const Q = new Map<string, Quaternion>();
  for (const b of D) {
    const s = pairs.get(b.name);
    if (!s) continue;
    if (!S0.has(s)) throw new Error(`retarget: source bone ${s} (for ${b.name}) missing`);
    const c = AIM[b.name];
    const sc = c && pairs.get(c);
    if (c && sc && D0.has(c) && S0.has(sc)) {
      const dd = pos(D0.get(c)!).sub(pos(D0.get(b.name)!)).normalize();
      const ds = pos(S0.get(sc)!).sub(pos(S0.get(s)!)).normalize();
      A.set(b.name, new Quaternion().setFromUnitVectors(dd, ds));
    } else A.set(b.name, (b.parent && A.get(b.parent)?.clone()) || new Quaternion());
    Q.set(b.name, rot(S0.get(s)!).invert().multiply(A.get(b.name)!).multiply(rot(D0.get(b.name)!)));
  }
  const [hs, h0s, h0d] = [pairs.get(hips)!, pos(S0.get(pairs.get(hips)!)!), pos(D0.get(hips)!)];
  const frame = (pose: Pose) => {
    const SW = worlds(S, pose);
    const local = new Map<string, { q: Quaternion; t?: Vector3 }>();
    const DW = new Map<string, Matrix4>();
    for (const b of D) {
      const parent = b.parent && DW.has(b.parent) ? DW.get(b.parent)! : new Matrix4();
      const s = pairs.get(b.name);
      let t = new Vector3(...b.t);
      let q = new Quaternion(...b.q);
      if (s) {
        q = rot(parent).invert().multiply(rot(SW.get(s)!).multiply(Q.get(b.name)!));
        if (b.name === hips) t = pos(SW.get(hs)!).sub(h0s).multiplyScalar(k).add(h0d).applyMatrix4(parent.clone().invert());
        local.set(b.name, b.name === hips ? { q, t } : { q });
      }
      DW.set(b.name, parent.clone().multiply(new Matrix4().compose(t, q, ONE)));
    }
    return { local, world: DW };
  };
  return { frame, k };
}

/** Linear (glTF LINEAR) sample of a track at t: `n` components; quaternions (n = 4) slerped. */
export function sampleTrack(times: ArrayLike<number>, values: ArrayLike<number>, n: number, t: number): number[] {
  let i = 0;
  while (i < times.length - 2 && times[i + 1]! <= t) i++;
  const [a, b] = [times[i]!, times[Math.min(i + 1, times.length - 1)]!];
  const f = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
  const at = (j: number) => Array.from({ length: n }, (_, c) => values[j * n + c]!);
  const [p, q] = [at(i), at(Math.min(i + 1, times.length - 1))];
  if (n === 4) return new Quaternion(...p).slerp(new Quaternion(...q), f).toArray();
  return p.map((v, c) => v + (q[c]! - v) * f);
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const srgb8 = (v: number) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));

/** Team-colour mask of the tank top in a body tile (RGBA, `size`², edited in place): the texels `top(r, g, b, x, y)`
 *  picks (sRGB 0–255, x / y = 0–1 across the tile) become a neutral grey (linear luma / the median × `grey`: folds and the
 *  two-tone panels kept) with alpha `alpha` (the shader tints alpha < 1 outside the opacity tile). Returns their share. */
export function maskTop(px: Uint8Array, size: number, top: (r: number, g: number, b: number, x: number, y: number) => boolean, grey: number, alpha: number) {
  const luma = (i: number) => 0.2126 * lin(px[i]! / 255) + 0.7152 * lin(px[i + 1]! / 255) + 0.0722 * lin(px[i + 2]! / 255);
  const sel: number[] = [];
  for (let i = 0; i < size * size; i++) if (top(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!, (i % size) / size, Math.floor(i / size) / size)) sel.push(i * 4);
  if (!sel.length) return 0;
  const L = sel.map(luma);
  const median = [...L].sort((a, b) => a - b)[L.length >> 1]! || 1;
  sel.forEach((i, j) => {
    const v = srgb8(Math.min(1, (L[j]! / median) * grey));
    px.set([v, v, v, alpha], i);
  });
  return sel.length / (size * size);
}
