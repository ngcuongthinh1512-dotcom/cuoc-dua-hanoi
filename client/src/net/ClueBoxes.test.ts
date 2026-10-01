import type { BoxInfo } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { nextBoxes, parseBoxes } from './ClueBoxes.ts';

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
  it('reveal opened: true repaints the same box; kind mat draws the mat; every change reports the list', async () => {
    const { Scene } = await import('three');
    const { ClueBoxes } = await import('./ClueBoxes.ts');
    const scene = new Scene();
    const cb = new ClueBoxes(scene, () => 1.5, () => 0);
    const seen: number[] = [];
    cb.onChange = (l) => seen.push(l.length);
    cb.reset([box('L1')]);
    const root = scene.children[0]!;
    const glow = () => (root.children[0] as unknown as { material: { emissiveIntensity: number } }).material.emissiveIntensity;
    expect([root.name, root.position.y, glow() > 0]).toEqual(['box', 1.5, true]);
    cb.apply({ t: 'box', op: 'reveal', box: box('L1', true) });
    expect([scene.children.length, scene.children[0], glow()]).toEqual([1, root, 0]);
    cb.apply({ t: 'box', op: 'reveal', box: { step: 'PS', x: 40, z: 0, opened: false, r: 20, kind: 'mat' } });
    expect(cb.mat?.name).toBe('mat');
    expect(cb.mat?.position.x).toBe(40);
    expect(seen).toEqual([1, 1, 2]);
  });
});
