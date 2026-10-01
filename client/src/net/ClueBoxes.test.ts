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
