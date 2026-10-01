// Outfit mask from the skin weights, team colour only on the masked (body) material, missing files → capsule.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { character as C, raceClient } from '../config.ts';
import { CharacterModel, loadCharacterAsset, OUTFIT_BONES, outfitMask, prepareAsset } from './CharacterModel.ts';

afterEach(() => vi.unstubAllGlobals());

const BONES = ['root', 'pelvis', 'spine_01', 'Head', 'thigh_l', 'foot_l', 'upperarm_r', 'hand_r'];
const attr = (a: number[], normalized = false) => new THREE.BufferAttribute(normalized ? new Uint8Array(a) : new Uint16Array(a), 4, normalized);

describe('outfitMask', () => {
  it('sums the weights per part: one shirt bone → shirt 1, trousers 0; blends split; skin (Head, hand) stays 0', () => {
    const idx = attr([2, 0, 0, 0, 1, 4, 0, 0, 3, 7, 0, 0, 5, 6, 0, 0]);
    const w = attr([255, 0, 0, 0, 128, 127, 0, 0, 255, 0, 0, 0, 51, 204, 0, 0], true); // u8 normalized, as in player.glb
    const m = outfitMask(idx, w, BONES);
    expect([...m.subarray(0, 3)]).toEqual([1, 0, 0]); // spine_01
    expect(m[3]).toBe(0);
    expect(m[4]).toBeCloseTo(1); // pelvis + thigh = trousers
    expect([...m.subarray(6, 9)]).toEqual([0, 0, 0]); // Head (+ hand_r at weight 0)
    expect(m[9]).toBeCloseTo(0.8); // upperarm_r 0.8 → shirt …
    expect(m[11]).toBeCloseTo(0.2); // … foot_l 0.2 → shoes
  });

  it('the part bones exist in player.glb', () => {
    const b = readFileSync(new URL('../../public/models/player.glb', import.meta.url));
    const names = (JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) as { nodes: { name: string }[] }).nodes.map((n) => n.name);
    for (const re of OUTFIT_BONES) expect(names.filter((n) => re.test(n)).length).toBeGreaterThanOrEqual(2);
  });
});

/** A two-mesh skinned character: a body weighted to spine_01 and a head-only "eyes" mesh sharing nothing. */
function fixture() {
  const bones = BONES.map((n) => Object.assign(new THREE.Bone(), { name: n }));
  const skinned = (joint: number, name: string) => {
    const g = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const n = g.getAttribute('position').count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : joint)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : 1)), 4));
    const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ name }));
    m.name = name;
    m.bind(new THREE.Skeleton(bones));
    return m;
  };
  return new THREE.Group().add(bones[0]!, skinned(2, 'body'), skinned(3, 'eyes'));
}

describe('CharacterModel', () => {
  it('team colour on a per-instance clone of the masked material only; shared eyes untouched; π turn; no NaN', () => {
    const asset = prepareAsset(fixture(), []);
    const eyes = asset.scene.getObjectByName('eyes') as THREE.Mesh;
    expect(eyes.geometry.hasAttribute('outfit')).toBe(false);
    const [a, b] = [new CharacterModel(asset, { shirt: '#d8342c' }), new CharacterModel(asset, { shirt: '#2c6bd8' })];
    const mat = (m: CharacterModel, n: string) => (m.root.getObjectByName(n) as THREE.Mesh).material as THREE.Material;
    expect(mat(a, 'body')).not.toBe(mat(b, 'body'));
    expect(mat(a, 'body').onBeforeCompile).toBe(mat(b, 'body').onBeforeCompile); // one program
    expect(mat(a, 'eyes')).toBe(eyes.material);
    expect(a.shirt.getHexString()).toBe('d8342c');
    b.setShirt('#ffffff');
    expect([a.shirt.getHexString(), b.shirt.getHexString()]).toEqual(['d8342c', 'ffffff']);
    a.setPose(new THREE.Vector3(1, 2, 3), 0.5);
    expect(a.root.children[0]!.rotation.y).toBeCloseTo(Math.PI);
    expect(a.root.rotation.y).toBe(0.5);
    const skins: THREE.SkinnedMesh[] = [];
    a.root.traverse((o) => o instanceof THREE.SkinnedMesh && skins.push(o));
    for (const m of skins) {
      expect(m.frustumCulled).toBe(true);
      expect(m.boundingSphere).toEqual(new THREE.Sphere(new THREE.Vector3(0, C.cullSphere.y, 0), C.cullSphere.radius));
    }
    const freed = skins.map((m) => vi.spyOn(m.skeleton, 'dispose'));
    a.dispose();
    expect(a.root.parent).toBeNull();
    for (const f of freed) expect(f).toHaveBeenCalledOnce();
  });

  it('name tag: the Vietnamese text drawn once, above the head, shown within nameTag.maxDistance only', () => {
    const drawn: string[] = [];
    const ctx = new Proxy({ measureText: (t: string) => ({ width: t.length * 20 }), fillText: (t: string) => drawn.push(t) }, {
      get: (o, k) => (o as Record<string | symbol, unknown>)[k] ?? (() => {}), // beginPath, roundRect, fill…
      set: () => true,
    });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    const m = new CharacterModel(prepareAsset(fixture(), []), { shirt: '#d8342c', name: 'Đội Xanh dương' });
    expect(drawn).toEqual(['Đội Xanh dương']);
    const lod = m.root.children.find((o): o is THREE.LOD => o instanceof THREE.LOD)!;
    expect(lod.position.y).toBeGreaterThan(0);
    const cam = new THREE.PerspectiveCamera();
    const visibleAt = (d: number) => {
      cam.position.set(0, 1.7, d);
      cam.updateMatrixWorld();
      m.root.updateMatrixWorld(true);
      lod.update(cam);
      return lod.levels[0]!.object.visible;
    };
    expect([visibleAt(3), visibleAt(20), visibleAt(C.nameTag.maxDistance + 5)]).toEqual([true, true, false]);
    const tagColour = (c: CharacterModel) => ((c.root.children.find((o) => o instanceof THREE.LOD) as THREE.LOD).levels[0]!.object as THREE.Sprite).material.color;
    expect(tagColour(m).getHexString()).toBe(m.shirt.getHexString()); // team colour
    m.setName(null);
    expect(m.root.children.some((o) => o instanceof THREE.LOD)).toBe(false);
    // the Pit Stop host: dark suit, its own readable tag colour (visual review: #23262d text was unreadable)
    const H = raceClient.host;
    const host = new CharacterModel(prepareAsset(fixture(), []), { shirt: H.shirt, name: H.name, tag: H.tag, tagDistance: H.tagDistance });
    const hsl = tagColour(host).getHSL({ h: 0, s: 0, l: 0 });
    expect(hsl.l).toBeGreaterThan(0.5);
    expect(host.shirt.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.3);
    // …and it hides beyond tagDistance (screen-size tags: from afar it lay on the team's own tag, p7-mat review)
    const hostLod = host.root.children.find((o): o is THREE.LOD => o instanceof THREE.LOD)!;
    expect(H.tagDistance).toBeLessThan(20);
    expect(hostLod.levels[1]!.distance).toBe(H.tagDistance);
    expect(lod.levels[1]!.distance).toBe(C.nameTag.maxDistance); // teams keep the long one
  });

  it('missing files → console.warn and a capsule in the shirt colour (all-shirt mask), no clips', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const asset = await loadCharacterAsset('http://test/missing.glb', 'http://test/missing-anims.glb');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing or unreadable'), expect.anything());
    expect(asset.clips).toHaveLength(0);
    let mask: THREE.BufferAttribute | undefined;
    asset.scene.traverse((o) => void (o instanceof THREE.Mesh && (mask = o.geometry.getAttribute('outfit') as THREE.BufferAttribute)));
    expect(mask?.getX(0)).toBe(1);
    expect(asset.scene.userData.height).toBeCloseTo(1.8);
    warn.mockRestore();
  });
});
