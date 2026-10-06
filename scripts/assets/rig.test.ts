// Leg 2 player avatars: the bone table against the committed player.glb / player-anims.glb, the world-space retarget,
// the tank-top mask.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BIP_TO_UE, BONES, maskTop, retargeter, type RigBone, sampleTrack, UE_TO_UAL } from './rig.ts';

const MODELS = join(import.meta.dirname, '../../client/public/models');
const gltf = (name: string) => {
  const b = readFileSync(join(MODELS, name));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) as {
    nodes: { name: string; children?: number[]; extras?: Record<string, unknown> }[];
    scenes: { nodes: number[] }[];
    animations?: { name: string; channels: { target: { node: number; path: string } }[] }[];
  };
};

describe('bone table', () => {
  it('one-to-one: 52 body bones, unique names on every side; the client names Animation.ts drives are in it', () => {
    expect(BONES).toHaveLength(52);
    for (const k of [0, 1, 2]) expect(new Set(BONES.map((b) => b[k])).size).toBe(52);
    for (const n of ['pelvis', 'spine_01', 'spine_03', 'neck_01', 'Head', 'ball_l', 'middle_01_r', 'thumb_03_l', 'upperarm_r', 'lowerarm_l', 'hand_r'])
      expect(UE_TO_UAL.has(n), n).toBe(true);
    expect(BIP_TO_UE.get('Bip01_L_Finger0')).toBe('thumb_01_l');
    expect(BIP_TO_UE.get('Bip01_R_Finger42')).toBe('pinky_03_r');
    expect(UE_TO_UAL.get('pinky_03_r')).toBe('DEF-f_pinky.03.R');
  });

  it('player.glb: both avatars carry every mapped bone; player-anims.glb: 15 clips × m_ / f_, tracks on mapped bones only', () => {
    const body = gltf('player.glb');
    const under = (i: number): string[] => [body.nodes[i]!.name, ...(body.nodes[i]!.children ?? []).flatMap(under)];
    const roots = body.scenes[0]!.nodes.map((i) => body.nodes[i]!);
    expect(roots.map((n) => n.name)).toEqual(['player_m', 'player_f']);
    for (const i of body.scenes[0]!.nodes) {
      const names = new Set(under(i));
      for (const [, ue] of BONES) expect(names.has(ue), `${body.nodes[i]!.name} ${ue}`).toBe(true);
      expect(body.nodes[i]!.extras).toMatchObject({ height: expect.any(Number), stride: expect.any(Number) });
    }
    const anims = gltf('player-anims.glb');
    expect(anims.animations).toHaveLength(30);
    for (const a of anims.animations!) {
      expect(a.name).toMatch(/^[mf]_/);
      for (const c of a.channels) {
        const n = anims.nodes[c.target.node]!.name;
        expect(UE_TO_UAL.has(n), `${a.name} ${n}`).toBe(true);
        expect(c.target.path === 'rotation' || (n === 'pelvis' && c.target.path === 'translation'), `${a.name} ${n}.${c.target.path}`).toBe(true);
      }
    }
  });
});

describe('retargeter', () => {
  const q = (axis: [number, number, number], deg: number) => new Quaternion().setFromAxisAngle(new Vector3(...axis), (deg * Math.PI) / 180).toArray();
  /** hips → spine, a left arm (shoulder at +X) whose rest points along `armDeg` below horizontal. */
  const rig = (prefix: string, armDeg: number, scale = 1): RigBone[] => [
    { name: `${prefix}hips`, parent: null, t: [0, 1 * scale, 0], q: [0, 0, 0, 1] },
    { name: `${prefix}spine`, parent: `${prefix}hips`, t: [0, 0.3 * scale, 0], q: [0, 0, 0, 1] },
    { name: `${prefix}arm`, parent: `${prefix}spine`, t: [0.2 * scale, 0.2 * scale, 0], q: q([0, 0, 1], -armDeg) },
    { name: `${prefix}fore`, parent: `${prefix}arm`, t: [0.3 * scale, 0, 0], q: [0, 0, 0, 1] },
  ];
  const worldDir = (w: ReturnType<ReturnType<typeof retargeter>['frame']>['world'], a: string, b: string) =>
    new Vector3().setFromMatrixPosition(w.get(b)!).sub(new Vector3().setFromMatrixPosition(w.get(a)!)).normalize();

  it('a T-pose source on an A-pose target: the target arm follows the source arm, also when it moves; hips scaled', () => {
    // AIM is keyed by client names: rename the test bones through it (pelvis → spine_01, upperarm_l → lowerarm_l)
    const ren = (r: RigBone[], p: string) => r.map((b) => ({ ...b, name: N[b.name.slice(p.length)]!, parent: b.parent && N[b.parent.slice(p.length)]! }));
    const N: Record<string, string> = { hips: 'pelvis', spine: 'spine_01', arm: 'upperarm_l', fore: 'lowerarm_l' };
    const src = ren(rig('s_', 0), 's_').map((b) => ({ ...b, name: `S${b.name}`, parent: b.parent && `S${b.parent}` }));
    const dst = ren(rig('d_', 45, 0.9), 'd_');
    const p = new Map(Object.values(N).map((n) => [n, `S${n}`]));
    const { frame, k } = retargeter(src, dst, p, 'pelvis', ['pelvis', 'Spelvis']);
    expect(k).toBeCloseTo(0.9);
    const rest = frame(new Map());
    expect(worldDir(rest.world, 'upperarm_l', 'lowerarm_l').toArray().map((v) => +v.toFixed(5))).toEqual([1, 0, 0]); // horizontal like the source
    const moved = frame(new Map([['Supperarm_l', { q: q([0, 0, 1], 90) }], ['Spelvis', { t: [0, 0.8, 0.1] }]]));
    expect(worldDir(moved.world, 'upperarm_l', 'lowerarm_l').y).toBeCloseTo(1); // raised straight up, as the source
    const hips = moved.local.get('pelvis')!.t!;
    expect([hips.x, hips.y, hips.z].map((v) => +v.toFixed(5))).toEqual([0, 0.9 - 0.2 * 0.9, 0.09]); // rest + k × the offset
    expect(moved.local.has('spine_01') && !moved.local.get('spine_01')!.t).toBe(true); // rotation only
  });

  it('the same skeleton both sides: locals come back unchanged', () => {
    const N: Record<string, string> = { hips: 'pelvis', spine: 'spine_01', arm: 'upperarm_l', fore: 'lowerarm_l' };
    const base = rig('', 30).map((b) => ({ ...b, name: N[b.name]!, parent: b.parent && N[b.parent]! }));
    const src = base.map((b) => ({ ...b, name: `S${b.name}`, parent: b.parent && `S${b.parent}` }));
    const { frame } = retargeter(src, base, new Map(base.map((b) => [b.name, `S${b.name}`])), 'pelvis', ['pelvis', 'Spelvis']);
    const turn = q([1, 0, 0], 40);
    const out = frame(new Map([['Supperarm_l', { q: turn }]]));
    expect(new Quaternion(...turn).angleTo(out.local.get('upperarm_l')!.q)).toBeLessThan(1e-5);
    expect(new Quaternion().angleTo(out.local.get('spine_01')!.q)).toBeLessThan(1e-5);
  });

  it('sampleTrack: linear between keys, slerp for quaternions, clamped at the ends', () => {
    expect(sampleTrack([0, 1], [0, 0, 0, 2, 4, 6], 3, 0.5)).toEqual([1, 2, 3]);
    expect(sampleTrack([0, 1], [0, 0, 0, 2, 4, 6], 3, 5)).toEqual([2, 4, 6]);
    const half = sampleTrack([0, 2], [...q([0, 1, 0], 0), ...q([0, 1, 0], 90)], 4, 1);
    expect(new Quaternion(...half).angleTo(new Quaternion(...q([0, 1, 0], 45)))).toBeLessThan(1e-6);
  });
});

describe('maskTop', () => {
  it('picked texels become a grey (brightness kept relative to the median) with the tint alpha; the rest is untouched', () => {
    const size = 2;
    const px = Uint8Array.from([20, 40, 200, 255, 10, 20, 100, 255, 200, 150, 120, 255, 255, 255, 255, 255]); // blue, dark blue, skin, white
    const share = maskTop(px, size, (r, g, b) => b > r + 25 && b > g + 10, 0.75, 153);
    expect(share).toBe(0.5);
    expect([px[3], px[7], px[11], px[15]]).toEqual([153, 153, 255, 255]);
    expect(px[0]).toBe(px[1]);
    expect(px[0]).toBe(px[2]); // grey
    expect(px[0]).toBeGreaterThan(px[4]!); // the brighter blue stays brighter
    expect([...px.subarray(8, 16)]).toEqual([200, 150, 120, 255, 255, 255, 255, 255]);
    expect(maskTop(new Uint8Array(16), size, () => false, 0.75, 153)).toBe(0);
  });
});
