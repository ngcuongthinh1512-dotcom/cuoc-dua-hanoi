import { Bone, BufferGeometry, Color, Float32BufferAttribute, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { crowd, npcAssets, npcRender as R } from '../config.ts';
import { loadNpcAssets, type NpcAssets } from './NpcAssets.ts';
import { PedRenderer, pedClip, pedOutfit, pedOutfitMask, staggerTilt } from './PedRenderer.ts';
import type { PedPose } from './types.ts';

let assets: NpcAssets;
beforeAll(async () => void (assets = await loadNpcAssets()));

const ped = (id: number, avatar: number, x: number, o: Partial<PedPose> = {}): PedPose =>
  ({ id, avatar, x, y: 0, z: 0, yaw: 0, speed: 1, activity: 'walk', activityTime: 0, stagger: -1, staggerYaw: 0, ...o });
const lodVisible = (r: PedRenderer, lod: 0 | 1) => {
  const out: boolean[] = [];
  r.root.traverse((o) => void (o.userData.lod === lod && o.parent?.parent?.visible !== false && out.push(o.visible)));
  return out;
};

describe('pedClip (PedAnimator: activity → clip + rate)', () => {
  it('walk vs stroll by the nearer clip speed, rate = speed / clip speed (no foot sliding)', () => {
    const w = npcAssets.clipSpeed.m_walk!, s = npcAssets.clipSpeed.m_stroll!;
    expect(pedClip('walk', 1.3, 'm')).toEqual({ name: 'm_walk', rate: 1.3 / w });
    expect(pedClip('walk', 0.75, 'm')).toEqual({ name: 'm_stroll', rate: 0.75 / s });
    expect(pedClip('walk', 1.1, 'f').name).toBe('f_walk');
  });
  it('standing (or waiting at the kerb) = idle; other activities = their own clip', () => {
    expect(pedClip('walk', 0, 'f')).toEqual({ name: 'f_idle', rate: 1 });
    expect(pedClip('stand', 0, 'm').name).toBe('m_idle');
    expect(['lookAround', 'phone', 'wave', 'sit'].map((a) => pedClip(a as PedPose['activity'], 0, 'm').name)).toEqual(['m_lookAround', 'm_phone', 'm_wave', 'm_sit']);
  });
});

describe('staggerTilt', () => {
  it(`0 when not knocked; up to ${R.stagger.tiltDeg}° fast, fading to 0 at crowd.stagger.seconds`, () => {
    const T = crowd.stagger.seconds;
    expect([staggerTilt(-1), staggerTilt(0), staggerTilt(T), staggerTilt(T + 1)]).toEqual([0, 0, 0, 0]);
    const ts = Array.from({ length: 50 }, (_, i) => (i / 50) * T);
    const peak = Math.max(...ts.map(staggerTilt));
    expect(peak).toBeLessThanOrEqual((R.stagger.tiltDeg * Math.PI) / 180);
    expect(peak).toBeGreaterThan((0.6 * R.stagger.tiltDeg * Math.PI) / 180);
    const after = ts.filter((t) => t >= R.stagger.rise).map(staggerTilt);
    expect(after.every((v, i) => i === 0 || v <= after[i - 1]!)).toBe(true);
  });
});

describe('pedOutfit / pedOutfitMask (SPEC §17.11: 4 avatars, clothes recoloured)', () => {
  it('deterministic by id, spread over the palette, a few keep the texture', () => {
    const ids = Array.from({ length: 400 }, (_, i) => i * 7 + 3);
    expect(ids.map(pedOutfit)).toEqual(ids.map(pedOutfit));
    const outfits = ids.map(pedOutfit);
    const kept = outfits.filter((o) => !o).length / ids.length;
    expect(kept).toBeGreaterThan(R.pedOutfit.keep / 2);
    expect(kept).toBeLessThan(R.pedOutfit.keep * 2);
    const tops = new Set(outfits.map((o) => o?.top)), bottoms = new Set(outfits.map((o) => o?.bottom));
    expect(tops.size).toBe(R.pedOutfit.top.length + 1);
    expect(bottoms.size).toBe(R.pedOutfit.bottom.length + 1);
    // 40 consecutive ids (one crowd): ≥ 20 distinct top + bottom pairs
    expect(new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(pedOutfit(i)))).size).toBeGreaterThanOrEqual(20);
  });

  it('mask = spine / arm → top, pelvis / leg → bottom, only inside the body tile; hands, head, feet 0', () => {
    const names = ['Bip01_Spine1', 'Bip01_L_Forearm', 'Bip01_Pelvis', 'Bip01_R_Calf', 'Bip01_L_Hand', 'Bip01_Head', 'Bip01_R_Foot'];
    const bones = names.map((n) => Object.assign(new Bone(), { name: n }));
    const n = names.length + 1;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute([...names.flatMap((_, i) => [i, 0, 0, 0]), 0, 0, 0, 0], 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute([...names.flatMap(() => [1, 0, 0, 0]), 1, 0, 0, 0], 4));
    g.setAttribute('uv', new Float32BufferAttribute([...names.flatMap(() => [0.2, 0.3]), 0.7, 0.2], 2)); // last: head tile
    const mesh = new SkinnedMesh(g, new MeshStandardMaterial());
    mesh.bind(new Skeleton(bones));
    expect([...pedOutfitMask(mesh)]).toEqual([1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('renderer: each clone its own outfit uniforms (one shader function), set from the id, again when pooled', () => {
    const bones = [Object.assign(new Bone(), { name: 'Bip01_Spine' })];
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, 1, 0], 3));
    g.setAttribute('skinIndex', new Uint16BufferAttribute([0, 0, 0, 0], 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0], 4));
    const mesh = new SkinnedMesh(g, new MeshStandardMaterial());
    mesh.add(bones[0]!);
    mesh.bind(new Skeleton(bones));
    const fake: NpcAssets = { vehicles: new Map(), peds: [{ scene: new Group().add(mesh), gender: 'm', height: 1.8 }], clips: new Map() };
    const r = new PedRenderer(fake);
    const colours = () => {
      const out: { mat: MeshStandardMaterial; on: number; top: string; bottom: string }[] = [];
      r.root.traverse((o) => {
        if (!(o instanceof SkinnedMesh) || !o.parent?.parent?.visible) return;
        const u = o.material.userData.outfit;
        out.push({ mat: o.material, on: u.uOn.value, top: u.uTop.value.getHexString(), bottom: u.uBottom.value.getHexString() });
      });
      return out;
    };
    const want = (id: number) => {
      const o = pedOutfit(id);
      const hex = (s: string) => new Color(s).getHexString();
      return o ? { on: 1, top: hex(R.pedOutfit.top[o.top]!), bottom: hex(R.pedOutfit.bottom[o.bottom]!) } : { on: 0 };
    };
    const ids = [1, 2, 3, 4, 5, 6].filter((id) => pedOutfit(id)).slice(0, 2);
    r.update(ids.map((id) => ped(id, 0, 5)), new Map(), 1, new Vector3(), 1 / 60);
    const [a, b] = colours();
    expect(a!.mat).not.toBe(b!.mat);
    expect(a!.mat.onBeforeCompile).toBe(b!.mat.onBeforeCompile); // one program
    expect(a!.mat).not.toBe(mesh.material); // the template keeps its own
    expect(g.getAttribute('pedOutfit').getX(0)).toBe(1);
    expect(colours().map(({ mat: _, ...c }) => c)).toEqual(ids.map(want).map((w) => expect.objectContaining(w)));
    r.update([ped(ids[1]!, 0, 5)], new Map(), 1, new Vector3(), 1 / 60);
    const next = [7, 8, 9, 10, 11].find((id) => pedOutfit(id) && JSON.stringify(pedOutfit(id)) !== JSON.stringify(pedOutfit(ids[0]!)))!;
    r.update([ped(ids[1]!, 0, 5), ped(next, 0, 5)], new Map(), 1, new Vector3(), 1 / 60);
    expect(r.stats.clones).toBe(2); // pooled clone, recoloured
    expect(colours().map(({ mat: _, ...c }) => c)).toEqual(expect.arrayContaining([expect.objectContaining(want(next))]));
  });
});

describe('PedRenderer (asset stub)', () => {
  it(`≤ pedLod0 (${R.pedLod0} m) from the camera: LOD0 shown, farther: LOD1`, () => {
    const r = new PedRenderer(assets);
    r.update([ped(1, 0, 10), ped(2, 1, R.pedLod0 + 20)], new Map(), 1, new Vector3(), 1 / 60);
    expect(r.stats).toMatchObject({ lod0: 1, lod1: 1, clones: 2 });
    expect(lodVisible(r, 0).sort()).toEqual([false, true]);
    expect(lodVisible(r, 1).sort()).toEqual([false, true]);
  });

  it('pool: a despawned pedestrian’s clone serves the next one of the same avatar', () => {
    const r = new PedRenderer(assets);
    r.update([ped(1, 2, 5), ped(2, 3, 5)], new Map(), 1, new Vector3(), 1 / 60);
    const roots = [...r.root.children];
    r.update([ped(2, 3, 5)], new Map(), 1, new Vector3(), 1 / 60);
    expect(roots.filter((o) => o.visible).length).toBe(1);
    r.update([ped(2, 3, 5), ped(7, 2, 8)], new Map(), 1, new Vector3(), 1 / 60);
    expect([r.stats.clones, r.root.children.length, roots.every((o) => o.visible)]).toEqual([2, 2, true]);
    r.update([ped(2, 3, 5), ped(7, 2, 8), ped(8, 2, 8)], new Map(), 1, new Vector3(), 1 / 60);
    expect(r.stats.clones).toBe(3); // none free for avatar 2: a new clone
  });

  it('knocked: the root leans toward staggerYaw; heading yaw 0 faces north', () => {
    const r = new PedRenderer(assets);
    r.update([ped(1, 0, 0, { yaw: 0, stagger: R.stagger.rise, staggerYaw: Math.PI / 2 })], new Map(), 1, new Vector3(), 1 / 60);
    const root = r.root.children[0]!;
    const up = new Vector3(0, 1, 0).applyQuaternion(root.quaternion);
    expect(up.x).toBeLessThan(-0.1); // pushed west
    expect(Math.abs(up.z)).toBeLessThan(1e-6);
    r.update([ped(1, 0, 0, { yaw: 0 })], new Map(), 1, new Vector3(), 1 / 60);
    const face = new Vector3(0, 0, 1).applyQuaternion(root.quaternion); // glTF front +Z
    expect(face.z).toBeCloseTo(-1, 6);
  });
});
