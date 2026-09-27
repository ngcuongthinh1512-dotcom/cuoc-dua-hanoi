import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { attachBuildOut, withFallbacks } from './attach.ts';
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
        instances: [{ kind: 'tree', matrices: Float32Array.from([...new THREE.Matrix4().makeTranslation(5, 0, 5).elements, ...new THREE.Matrix4().elements]) }],
        colliders: [],
        textures: [{ material: 'sign', image }],
      },
      materials,
      props,
    );
    const treeTris = props.tree.geometry.index!.count / 3;
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
    expect(props.tree.geometry.index).not.toBeNull(); // shared prop mesh untouched
  });
});
