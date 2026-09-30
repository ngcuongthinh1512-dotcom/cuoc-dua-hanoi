// The committed NPC GLBs (scripts/process-assets.ts) through the real GLTFLoader, like vehicle/BikeModel.test.ts.
import { readFileSync, statSync } from 'node:fs';
import { type AnimationClip, Box3, BufferAttribute, BufferGeometry, Group, Mesh, type Object3D, SkinnedMesh, Vector3 } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { npc, npcAssets as C } from '../config.ts';
import { loadNpcAssets, prepareVehicles, preparePeds } from './NpcAssets.ts';
import type { CarKind } from './types.ts';

const file = (n: string) => new URL(`../../public/models/${n}.glb`, import.meta.url);
const KINDS = Object.keys(npc.vehicles) as CarKind[];
const TWO_WHEELERS: CarKind[] = ['scooter', 'moto'];

/** GLTFLoader.parse in node: the atlas texture goes through a stub createImageBitmap. */
async function load(name: string) {
  Object.assign(globalThis, { self: globalThis, createImageBitmap: async () => ({ width: 1, height: 1, close() {} }) });
  const buf = readFileSync(file(name));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer;
  const gltf = await new Promise<{ scene: Group; animations: AnimationClip[] }>((res, rej) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(ab, '', res as never, rej));
  const len = buf.readUInt32LE(12); // the JSON chunk (extras of the animations are not kept by GLTFLoader)
  return { ...gltf, json: JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as { animations?: { name: string; extras: { duration: number; speed: number } }[] } };
}

/** Skinned vertex positions (world) of one mesh. */
function skinned(m: SkinnedMesh) {
  m.updateWorldMatrix(true, true);
  return Array.from({ length: m.geometry.getAttribute('position').count }, (_, i) => m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld));
}

describe('npc-vehicles.glb', async () => {
  const { scene } = await load('npc-vehicles');
  const templates = prepareVehicles(scene);

  it('a node per CarKind, file ≤ 1.5 MB', () => {
    for (const k of KINDS) expect(scene.getObjectByName(k), k).toBeTruthy();
    expect(statSync(file('npc-vehicles')).size).toBeLessThanOrEqual(1.5 * 2 ** 20);
  });

  it.each(KINDS)('%s: size = dims ± 3 %, on the ground, nose +Z, triangle budget', (kind) => {
    const t = templates.get(kind)!;
    const node = scene.getObjectByName(kind)!;
    const [w, h, l] = npc.vehicles[kind].dims;
    const [x0, , z0, x1, y1, z1] = node.userData.bodyBox as number[]; // the vehicle without its rider / roof lamp
    expect(Math.abs((x1! - x0!) / w - 1)).toBeLessThan(0.03);
    expect(Math.abs((z1! - z0!) / l - 1)).toBeLessThan(0.03);
    const box = t.geometry.boundingBox!;
    const ground = t.axles.length ? Math.min(...t.axles.map((a) => a[1] - t.wheelRadius)) : box.min.y;
    expect(ground).toBeGreaterThan(-0.02);
    expect(ground).toBeLessThan(0.02);
    expect(Math.abs((y1! - ground) / h - 1)).toBeLessThan(0.03);
    const front = node.userData.front as number[];
    expect(front[2]).toBeGreaterThan(TWO_WHEELERS.includes(kind) ? 0 : 0.5 * (l / 2));
    const tris = t.geometry.index!.count / 3;
    const big = kind === 'bus' || kind === 'truck';
    expect(tris).toBeLessThanOrEqual(TWO_WHEELERS.includes(kind) ? C.maxTris.car + C.maxTris.rider : big ? C.maxTris.big : C.maxTris.car);
  });

  it.each(KINDS.filter((k) => !TWO_WHEELERS.includes(k)))('%s: 4 axles with a radius, wheels inside the track', (kind) => {
    const t = templates.get(kind)!;
    const [w, , l] = npc.vehicles[kind].dims;
    expect(t.axles.length).toBeGreaterThanOrEqual(4);
    expect(t.wheelRadius).toBeGreaterThan(0.2);
    for (const [x, y, z] of t.axles) {
      expect(Math.abs(x)).toBeLessThanOrEqual(w / 2);
      expect(Math.abs(z)).toBeLessThan(l / 2);
      expect(y).toBeCloseTo(t.wheelRadius, 1);
    }
  });

  it.each(KINDS)('%s: vertex colours + _paint (body paint ≥ 20 % of the vertices; riders ≥ 5 %)', (kind) => {
    const g = templates.get(kind)!.geometry;
    expect(g.getAttribute('color')).toBeTruthy();
    const p = g.getAttribute('_paint');
    let n = 0;
    for (let i = 0; i < p.count; i++) n += p.getX(i) > 0.5 ? 1 : 0;
    expect(n / p.count).toBeGreaterThanOrEqual(TWO_WHEELERS.includes(kind) ? 0.05 : 0.2);
  });

  it('prepareVehicles: a node missing from the file is an error', () => {
    expect(() => prepareVehicles(new Group())).toThrow(/no node/);
  });

  it('prepareVehicles: a synthetic scene (mesh per kind) gives float attributes and the extras', () => {
    const s = new Group();
    for (const k of KINDS) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
      g.setAttribute('color', new BufferAttribute(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255]), 3, true));
      g.setAttribute('_paint', new BufferAttribute(new Float32Array([1, 0, 1]), 1));
      g.setIndex([0, 1, 2]);
      const m = new Mesh(g);
      m.name = k;
      m.position.set(0, 2, 0);
      m.userData = { axles: [[1, 0.3, 1]], wheelRadius: 0.3 };
      s.add(m);
    }
    const t = prepareVehicles(s).get('bus')!;
    expect(t.axles).toEqual([[1, 0.3, 1]]);
    expect(t.wheelRadius).toBe(0.3);
    expect(t.geometry.getAttribute('color').getX(0)).toBe(1); // normalised bytes → floats
    expect(t.geometry.getAttribute('position').getY(0)).toBe(2); // node matrix baked
  });
});

describe('npc-peds.glb + npc-ped-anims.glb', async () => {
  const peds = await load('npc-peds');
  const anims = await load('npc-ped-anims');
  const { peds: templates, clips } = preparePeds(peds.scene, anims.animations);

  it('4 avatars (m, f, m, f), file ≤ 5 MB', () => {
    expect(templates.map((t) => t.gender)).toEqual(['m', 'f', 'm', 'f']);
    expect(statSync(file('npc-peds')).size).toBeLessThanOrEqual(5 * 2 ** 20);
  });

  it.each([0, 1, 2, 3])('avatar %i: LOD0 ≤ 9 000 + LOD1 ≤ 2 500 triangles, one MASK material, 1.65–1.85 m, 80 bones', (i) => {
    const t = templates[i]!;
    const meshes: SkinnedMesh[] = [];
    t.scene.traverse((o) => o instanceof SkinnedMesh && meshes.push(o));
    const [l0, l1] = [0, 1].map((lod) => meshes.find((m) => m.userData.lod === lod)!);
    expect(l0!.geometry.index!.count / 3).toBeLessThanOrEqual(9000);
    expect(l1!.geometry.index!.count / 3).toBeLessThanOrEqual(2500);
    expect(meshes).toHaveLength(2);
    expect(l0!.material).toBe(l1!.material);
    expect((l0!.material as { alphaTest: number }).alphaTest).toBeGreaterThan(0);
    const box = new Box3().setFromPoints(skinned(l0!));
    expect(box.max.y - box.min.y).toBeGreaterThan(1.65);
    expect(box.max.y - box.min.y).toBeLessThan(1.85);
    expect(box.min.y).toBeGreaterThan(-0.03);
    expect(Math.abs(t.height - (box.max.y - box.min.y))).toBeLessThan(0.01);
    expect(l0!.skeleton.bones).toHaveLength(80);
    const names = (m: SkinnedMesh) => m.skeleton.bones.map((b) => b.name).sort();
    const first: SkinnedMesh[] = [];
    templates[0]!.scene.traverse((o) => o instanceof SkinnedMesh && first.push(o));
    expect(names(l0!)).toEqual(names(first[0]!)); // same real names (GLTFLoader's unique suffixes undone)
    expect(l0!.skeleton.bones.map((b) => b.name)).toContain('Bip01_Pelvis');
  });

  const FRAME = 1 / 30 + 1e-3;
  const LENGTHS: Record<string, number> = {
    m_walk: 1.2, m_stroll: 1.5667, m_idle: 11.6667, m_lookAround: 4.6333, m_phone: 31.9, m_sit: 36.1, m_wave: 2.8333,
    f_walk: 1.2, f_stroll: 1.4, f_idle: 15.5333, f_lookAround: 4.4667, f_phone: 41.1667, f_sit: 33.2333, f_wave: 5.5333,
  };
  it('the 14 clips, durations of the originals ± 1 frame, file ≤ 2 MB', () => {
    expect([...clips.keys()].sort()).toEqual(Object.keys(LENGTHS).sort());
    for (const [n, d] of Object.entries(LENGTHS)) expect(Math.abs(clips.get(n)!.duration - d), n).toBeLessThanOrEqual(FRAME);
    expect(statSync(file('npc-ped-anims')).size).toBeLessThanOrEqual(2 * 2 ** 20);
  });

  it('walk in place: Bip01 x / z constant, ≤ 2 position tracks, no face-bone / helper tracks', () => {
    for (const c of clips.values()) {
      const pos = c.tracks.filter((t) => t.name.endsWith('.position'));
      expect(pos.length, c.name).toBeLessThanOrEqual(2);
      const root = pos.find((t) => t.name === 'Bip01.position')!;
      for (let i = 0; i < root.values.length; i += 3) {
        expect(root.values[i]).toBeCloseTo(0, 6);
        expect(root.values[i + 2]).toBeCloseTo(0, 6);
      }
      for (const t of c.tracks) expect(t.name, c.name).not.toMatch(/^Bip01_([LRM][A-Z]|Footsteps)|MotionExtraction|\.scale$/);
      expect(c.tracks.every((t) => /^Bip01(_\w+)?\.(position|quaternion)$/.test(t.name))).toBe(true);
    }
  });

  it('clipSpeed = the root motion of the originals ± 5 %', () => {
    for (const a of anims.json.animations!) {
      const want = C.clipSpeed[a.name];
      if (want !== undefined) expect(Math.abs(a.extras.speed / want - 1), a.name).toBeLessThan(0.05);
      else expect(a.extras.speed, a.name).toBe(0);
    }
    expect(Object.keys(C.clipSpeed).sort()).toEqual(['f_stroll', 'f_walk', 'm_stroll', 'm_walk']);
  });

  it('the clip binds to a cloned avatar: no missing bone', () => {
    const root = templates[1]!.scene;
    const bones = new Set<string>();
    root.traverse((o: Object3D) => bones.add(o.name));
    for (const t of clips.get('f_walk')!.tracks) expect(bones.has(t.name.split('.')[0]!), t.name).toBe(true);
  });

  it('preparePeds: synthetic scene sorted by index, real names restored, clips by name', () => {
    const s = new Group();
    for (const i of [1, 0]) {
      const g = new Group();
      g.name = `ped_${i}`;
      g.userData = { gender: i ? 'f' : 'm', height: 1.7 };
      const b = new Group();
      b.name = 'Bip01_1';
      b.userData = { name: 'Bip01' };
      g.add(b);
      s.add(g);
    }
    const r = preparePeds(s, [{ name: 'm_walk' } as AnimationClip]);
    expect(r.peds.map((p) => p.gender)).toEqual(['m', 'f']);
    expect(r.peds[0]!.scene.children[0]!.name).toBe('Bip01');
    expect(r.clips.has('m_walk')).toBe(true);
  });
});

describe('loadNpcAssets', () => {
  it('unreadable files → a warning per file and stand-ins (boxes of the dims, 4 capsules, no clips)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = await loadNpcAssets();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
    expect(a.vehicles.size).toBe(10);
    expect(a.peds).toHaveLength(4);
    expect(a.clips.size).toBe(0);
    expect(a.vehicles.get('bus')!.geometry.getAttribute('_paint').count).toBeGreaterThan(0);
  });
});
