// Leg 2 avatars: clip split per avatar, team colour on a per-instance clone of one shared shader (atlas-alpha mask),
// avatar choice + stride, missing files → capsule.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { character as C, raceClient } from '../config.ts';
import { AVATARS, avatarClips, type CharacterAsset, CharacterModel, loadCharacterAsset, prepareAsset } from './CharacterModel.ts';

afterEach(() => vi.unstubAllGlobals());

const BONES = ['Bip01', 'pelvis', 'spine_01', 'spine_03', 'Head', 'thigh_l', 'foot_l', 'upperarm_r', 'hand_r'];

describe('avatarClips', () => {
  const clip = (n: string) => new THREE.AnimationClip(n, 1, [new THREE.QuaternionKeyframeTrack('pelvis.quaternion', [0], [0, 0, 0, 1])]);
  it('the m_ / f_ clips of an avatar under their UAL names; an unprefixed file keeps all; an unknown index = avatar 0', () => {
    const all = ['m_Idle_Loop', 'm_Walk_Loop', 'f_Idle_Loop', 'f_Walk_Loop'].map(clip);
    expect(avatarClips(all, 0).map((c) => c.name)).toEqual(['Idle_Loop', 'Walk_Loop']);
    expect(avatarClips(all, 1).map((c) => c.name)).toEqual(['Idle_Loop', 'Walk_Loop']);
    expect(avatarClips(all, 1)[0]).not.toBe(all[2]); // clones: the loaded clips keep their names
    expect(all[2]!.name).toBe('f_Idle_Loop');
    expect(avatarClips(all, 9).map((c) => c.name)).toEqual(['Idle_Loop', 'Walk_Loop']);
    expect(avatarClips([clip('Idle_Loop')], 1).map((c) => c.name)).toEqual(['Idle_Loop']);
    expect(AVATARS.map((a) => a.node)).toEqual(['player_m', 'player_f']);
  });
});

/** One skinned avatar mesh (textured: the atlas path of the shader) on a few named bones; `stride` like player.glb's extras. */
function fixture(stride?: number) {
  const bones = BONES.map((n) => Object.assign(new THREE.Bone(), { name: n }));
  for (let i = 1; i < bones.length; i++) bones[0]!.add(bones[i]!);
  const g = new THREE.BoxGeometry(0.4, 1.7, 0.3).translate(0, 0.85, 0);
  const n = g.getAttribute('position').count;
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : 2)), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : 1)), 4));
  const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ name: 'body', map: new THREE.Texture() }));
  m.name = 'body';
  m.bind(new THREE.Skeleton(bones));
  const root = new THREE.Group().add(bones[0]!, m);
  if (stride) root.userData.stride = stride;
  return root;
}
const twoAvatars = (): CharacterAsset => {
  const avatars = [prepareAsset(fixture(), []), prepareAsset(fixture(1.03), [])];
  return { ...avatars[0]!, avatars };
};

describe('CharacterModel', () => {
  it('team colour on a per-instance clone of one shared program; avatar + stride; π turn; culling; dispose', () => {
    const asset = twoAvatars();
    const [a, b] = [new CharacterModel(asset, { shirt: '#d8342c' }), new CharacterModel(asset, { shirt: '#2c6bd8', avatar: 1 })];
    const mat = (m: CharacterModel) => (m.root.getObjectByName('body') as THREE.Mesh).material as THREE.Material;
    expect(mat(a)).not.toBe(mat(b));
    expect(mat(a)).not.toBe((asset.scene.getObjectByName('body') as THREE.Mesh).material); // the asset's stays untouched
    expect(mat(a).onBeforeCompile).toBe(mat(b).onBeforeCompile); // one program
    expect([a.avatar, b.avatar, a.stride, b.stride]).toEqual([0, 1, 1, 1.03]);
    expect(new CharacterModel(asset, { shirt: '#fff', avatar: 5 }).avatar).toBe(0); // unknown → Nam
    expect(new CharacterModel(prepareAsset(fixture(), []), { shirt: '#fff', avatar: 1 }).avatar).toBe(0); // one-avatar asset
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

  it('shader: tint = team colour × the atlas mask (body / backpack tiles), hair cut-out only in the opacity tile', () => {
    const m = new CharacterModel(twoAvatars(), { shirt: '#d8342c' });
    const material = (m.root.getObjectByName('body') as THREE.Mesh).material as THREE.Material;
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: 'void main() {\n#include <map_fragment>\n#include <emissivemap_fragment>\n}' } as unknown as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect((shader.uniforms as Record<string, { value: THREE.Color }>).uShirt!.value).toBe(m.shirt);
    const f = shader.fragmentShader;
    expect(f).toContain('uniform vec3 uShirt');
    expect(f).toContain('outfitTile = step(vec2(0.5), vMapUv)');
    expect(f).toContain('diffuseColor.rgb *= mix(vec3(1.0), uShirt, outfitM)');
    expect(f).toContain('outfitTile.y * (1.0 - outfitTile.x)'); // alpha kept only in the opacity tile (0, 1)
  });

  it('name tag: the Vietnamese text drawn once, above the head, shown within nameTag.maxDistance only', () => {
    const drawn: string[] = [];
    const ctx = new Proxy({ measureText: (t: string) => ({ width: t.length * 20 }), fillText: (t: string) => drawn.push(t) }, {
      get: (o, k) => (o as Record<string | symbol, unknown>)[k] ?? (() => {}), // beginPath, roundRect, fill…
      set: () => true,
    });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    const m = new CharacterModel(twoAvatars(), { shirt: '#d8342c', name: 'Đội Xanh dương', avatar: 1 });
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

  it('missing files → console.warn and a capsule in the shirt colour (no map: all tinted), no clips, one avatar', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const asset = await loadCharacterAsset('http://test/missing.glb', 'http://test/missing-anims.glb');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing or unreadable'), expect.anything());
    expect(asset.clips).toHaveLength(0);
    expect(asset.avatars).toBeUndefined();
    expect(asset.scene.userData.height).toBeCloseTo(1.8);
    const m = new CharacterModel(asset, { shirt: '#d8342c', avatar: 1 });
    expect(m.avatar).toBe(0);
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <map_fragment>\n#include <emissivemap_fragment>' } as unknown as THREE.WebGLProgramParametersWithUniforms;
    ((m.root.getObjectByProperty('isMesh', true) as THREE.Mesh).material as THREE.Material).onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toMatch(/#else\n\tfloat outfitM = 1\.0;/);
    warn.mockRestore();
  });
});
