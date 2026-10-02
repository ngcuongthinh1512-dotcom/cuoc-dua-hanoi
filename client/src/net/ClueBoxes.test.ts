import type { BoxInfo } from '@race/shared/protocol';
import { type BufferGeometry, type Mesh, type MeshStandardMaterial, type Object3D, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { clueBox } from '../config.ts';
import { ClueBoxes, nextBoxes, parseBoxes } from './ClueBoxes.ts';

const box = (step: string, opened = false): BoxInfo => ({ step, x: 10, z: -20, opened, r: 20 });

describe('clue boxes (SPEC §17.10: drawn only from what the server sent)', () => {
  it('reveal adds a box, a second reveal of the same step replaces it', () => {
    let list = nextBoxes([], { t: 'box', op: 'reveal', box: box('L1') });
    expect(list).toEqual([box('L1')]);
    list = nextBoxes(list, { t: 'box', op: 'reveal', box: { ...box('L1'), x: 11 } });
    expect(list).toEqual([{ ...box('L1'), x: 11 }]);
  });

  it('hide removes the current box, never an opened one', () => {
    const list = [box('L1', true), box('L2')];
    expect(nextBoxes(list, { t: 'box', op: 'hide', step: 'L2' })).toEqual([box('L1', true)]);
    expect(nextBoxes(list, { t: 'box', op: 'hide', step: 'L1' })).toEqual(list);
  });

  it('DEV ?boxes=step,x,z[,opened];… stand-ins', () => {
    expect(parseBoxes('L1,10,-20,opened;L2,5,6;bad;L3,,1')).toEqual([box('L1', true), { step: 'L2', x: 5, z: 6, opened: false, r: 20 }]);
    expect(parseBoxes(null)).toEqual([]);
  });
});

describe('ClueBoxes scene (Phase 7: opened in place, Pit Stop mat, zones out)', () => {
  const meshes = (o: Object3D) => o.children as Mesh<BufferGeometry, MeshStandardMaterial>[];
  const part = (o: Object3D, name: string) => meshes(o).find((m) => m.name === name)!;
  const uuids = (o: Object3D) => meshes(o).map((m) => m.geometry.uuid);

  it('reveal opened: true repaints the same box; kind mat draws the mat; every change reports the list', () => {
    const scene = new Scene();
    const cb = new ClueBoxes(scene, () => 1.5, () => 0);
    const seen: number[] = [];
    cb.onChange = (l) => seen.push(l.length);
    cb.reset([box('L1')]);
    const root = scene.children[0]!;
    const glow = () => ((m) => m.emissive.getHex() > 0 && m.emissiveIntensity > 0)(part(root, 'stripes').material);
    expect([root.name, root.position.y, glow(), part(root, 'lid').rotation.x]).toEqual(['box', 1.5, true, 0]);
    cb.apply({ t: 'box', op: 'reveal', box: box('L1', true) });
    expect([scene.children.length, scene.children[0], glow()]).toEqual([1, root, false]);
    cb.apply({ t: 'box', op: 'reveal', box: { step: 'PS', x: 40, z: 0, opened: false, r: 20, kind: 'mat' } });
    expect(cb.mat?.name).toBe('mat');
    expect(cb.mat?.position.x).toBe(40);
    expect(seen).toEqual([1, 1, 2]);
    cb.dispose();
  });

  it('the prop: 4 meshes, 3 materials (+ the light column), all shared by every box; opened = lid up, stripes dimmed', () => {
    const scene = new Scene();
    const cb = new ClueBoxes(scene, () => 0, () => 0);
    cb.reset([box('L1'), { ...box('L2', true), x: 30 }]);
    const [shut, open] = scene.children;
    expect(meshes(shut!).map((m) => m.name)).toEqual(['body', 'lid', 'post', 'stripes', 'beam']);
    for (const g of [shut!, open!]) expect(new Set(meshes(g).flatMap((m) => (m.name === 'beam' ? [] : [m.material]))).size).toBe(3);
    expect(uuids(open!)).toEqual(uuids(shut!));
    expect(part(open!, 'post').material).toBe(part(shut!, 'post').material);
    expect(part(open!, 'stripes').material).not.toBe(part(shut!, 'stripes').material);
    expect((part(open!, 'lid').rotation.x * 180) / Math.PI).toBeCloseTo(-100, 5); // swung up and back about the hinge
    // the closed lid sits on the head box and overhangs it; opened, its free edge is high above the box, behind the hinge
    shut!.updateMatrixWorld(), open!.updateMatrixWorld();
    const top = (m: Mesh) => (m.geometry.computeBoundingBox(), m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    const [lidShut, body, lidOpen] = [top(part(shut!, 'lid')), top(part(shut!, 'body')), top(part(open!, 'lid'))];
    expect(lidShut.min.y).toBeCloseTo(body.max.y, 5);
    expect(lidShut.max.x - lidShut.min.x).toBeGreaterThan(clueBox.head.size);
    expect(lidOpen.max.y - body.max.y).toBeGreaterThan(0.5);
    expect(lidOpen.max.z).toBeCloseTo(lidShut.min.z, 5); // nothing in front of the hinge
    cb.dispose();
  });

  it('light column: closed box only, invisible up close, ≥ spread m wide per m of distance far away', () => {
    const scene = new Scene();
    const cb = new ClueBoxes(scene, () => 0, () => 0);
    cb.reset([box('L1'), { ...box('L2', true), x: 30 }]);
    const [shut, open] = scene.children;
    const beam = part(shut!, 'beam');
    expect([beam.visible, part(open!, 'beam').visible]).toEqual([true, false]);
    cb.update(new Vector3(10, 1.7, -17));
    expect([beam.material.opacity, beam.scale.x]).toEqual([0, 1]);
    cb.update(new Vector3(10 + 150, 1.7, -20));
    expect(beam.material.opacity).toBeCloseTo(clueBox.beam.opacity, 5);
    expect(beam.scale.x * clueBox.beam.width).toBeCloseTo(150 * clueBox.beam.spread, 5);
    cb.dispose();
  });

  it('reveal / hide many times reuses the parts; dispose frees them (and a later box builds new ones)', () => {
    const scene = new Scene();
    const cb = new ClueBoxes(scene, () => 0, () => 0);
    cb.reset([box('L1')]);
    const first = meshes(scene.children[0]!);
    const ids = uuids(scene.children[0]!);
    for (let i = 0; i < 50; i++) {
      cb.apply({ t: 'box', op: 'hide', step: 'L1' });
      cb.apply({ t: 'box', op: 'reveal', box: box('L1', i % 2 === 1) });
    }
    expect(scene.children.length).toBe(1);
    expect(uuids(scene.children[0]!)).toEqual(ids);
    const freed = new Set<unknown>();
    const owned = new Set<BufferGeometry | MeshStandardMaterial>([...first.map((m) => m.geometry), ...first.map((m) => m.material), part(scene.children[0]!, 'stripes').material]);
    for (const o of owned) o.addEventListener('dispose', () => freed.add(o));
    cb.dispose();
    expect([scene.children.length, cb.boxes.length, freed.size, owned.size]).toEqual([0, 0, 10, 10]); // 5 geometries, grey / yellow / red / dimmed red / light column
    cb.reset([box('L1')]);
    expect(uuids(scene.children[0]!).some((u) => ids.includes(u))).toBe(false);
    cb.dispose();
  });
});
