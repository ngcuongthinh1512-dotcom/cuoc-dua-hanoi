import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { attachBuildOut, lodInstances, type StaticProp, withFallbacks } from './attach.ts';
import { MeshBuffer } from './geom.ts';
import { createPropMeshes } from './StreetProps.ts';

describe('attachBuildOut', () => {
  it('one mesh per bucket, one InstancedMesh per set, sign atlas on a clone; dispose frees only its own', () => {
    const wall = new MeshBuffer('wall');
    wall.quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]);
    const sign = new MeshBuffer('sign');
    sign.tri([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    const image = { width: 256, height: 64, close: vi.fn() } as unknown as ImageBitmap;
    const materials = withFallbacks({});
    const props = createPropMeshes();
    const a = attachBuildOut(
      {
        meshes: [wall.bucket(), sign.bucket(), new MeshBuffer('roof').bucket()],
        instances: [{ kind: 'metro', matrices: Float32Array.from([...new THREE.Matrix4().makeTranslation(5, 0, 5).elements, ...new THREE.Matrix4().elements]) }],
        colliders: [],
        textures: [{ material: 'sign', image }],
      },
      materials,
      props,
    );
    const metro = props.metro as StaticProp;
    const treeTris = metro.geometry.index!.count / 3;
    expect(a.drawCalls).toBe(3); // empty roof bucket skipped
    expect(a.triangles).toBe(2 + 1 + 2 * treeTris);
    const [w, s, trees] = a.object.children as [THREE.Mesh, THREE.Mesh, THREE.InstancedMesh];
    expect(w.material).toBe(materials.wall);
    expect((w.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    expect(w.geometry.getAttribute('color').count).toBe(4);
    expect(s.material).not.toBe(materials.sign);
    expect((s.material as THREE.MeshStandardMaterial).map?.image).toBe(image);
    expect(trees.count).toBe(2);
    expect(trees.instanceMatrix.array[12]).toBe(5);

    const scene = new THREE.Scene().add(a.object);
    a.dispose();
    expect(scene.children).toHaveLength(0);
    expect(image.close).toHaveBeenCalledOnce();
    expect(metro.geometry.index).not.toBeNull(); // shared prop mesh untouched
  });

  it('lodInstances: each instance drawn at the level its camera distance picks, none beyond the last; levels swap later', () => {
    const geo = (n: number) => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(9 * n).fill(0), 3));
    const mat = new THREE.MeshBasicMaterial();
    const lods = { radius: 1, levels: [{ parts: [{ geometry: geo(1), material: mat }], distance: 10 }, { parts: [{ geometry: geo(2), material: mat }], distance: 50 }] };
    const at = (...xs: number[]) => Float32Array.from(xs.flatMap((x) => new THREE.Matrix4().makeTranslation(x, 0, 0).elements));
    const l = lodInstances(at(0, 20, 30, 100), lods);
    const cam = new THREE.PerspectiveCamera();
    cam.updateMatrixWorld();
    (l.object as THREE.LOD).update(cam); // camera at the origin
    const meshes = l.object.children as THREE.InstancedMesh[];
    expect(meshes.map((m) => m.count)).toEqual([1, 2]); // 0 m → level 0; 20, 30 m → level 1; 100 m → none
    expect(meshes[1]!.instanceMatrix.array[12]).toBe(20);
    cam.position.set(95, 0, 0);
    cam.updateMatrixWorld();
    (l.object as THREE.LOD).update(cam);
    expect(meshes.map((m) => [m.count, m.visible])).toEqual([[1, true], [0, false]]); // only the instance at 100 m, level 0
    lods.levels = [{ parts: [{ geometry: geo(1), material: mat }], distance: Infinity }];
    (l.object as THREE.LOD).update(cam);
    expect((l.object.children as THREE.InstancedMesh[]).map((m) => m.count)).toEqual([4]);
    l.dispose();
  });
});
