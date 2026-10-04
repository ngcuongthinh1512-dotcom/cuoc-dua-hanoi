import type { PoseSample } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { needsTick, tickEntries, tickKey, type Peer } from './presence.ts';

const at = (x: number, z = 0): PoseSample => ({ x, y: 0, z, yaw: 0, mode: 'walk', action: 'none' });
const peers: Peer[] = [
  { team: 'a', slot: 0, pose: at(0) },
  { team: 'b', slot: 1, pose: at(300, 400) }, // 500 m from a: inside (≤)
  { team: 'c', slot: 2, pose: at(0, 501) },
];

describe('presence', () => {
  it('gives a team the peers within the radius, never itself; the Host all; nothing before its first pose', () => {
    expect(tickEntries({ team: 'a', pose: at(0) }, peers, 500).map((e) => e.slot)).toEqual([1]);
    expect(tickEntries({ team: 'c', pose: at(0, 501) }, peers, 500).map((e) => e.slot)).toEqual([1]); // a is 501 m away
    expect(tickEntries(null, peers, 500).map((e) => e.slot)).toEqual([0, 1, 2]);
    expect(tickEntries({ team: 'a', pose: null }, peers, 500)).toEqual([]);
  });

  it('SPEC §17.40: a finished team in the watch mode (`all`) gets every peer but itself, even without a pose', () => {
    expect(tickEntries({ team: 'a', pose: at(0), all: true }, peers, 500).map((e) => e.slot)).toEqual([1, 2]);
    expect(tickEntries({ team: 'a', pose: null, all: true }, peers, 500).map((e) => e.slot)).toEqual([1, 2]);
    expect(tickEntries({ team: 'a', pose: at(0), all: false }, peers, 500).map((e) => e.slot)).toEqual([1]);
  });

  it('ticks only when a peer in it moved or the set changed', () => {
    const e = tickEntries(null, peers, 500);
    expect(needsTick(e, new Set(), tickKey(e))).toBe(false); // nobody moved
    expect(needsTick(e, new Set([2]), tickKey(e))).toBe(true);
    expect(needsTick(e.slice(0, 2), new Set(), tickKey(e))).toBe(true); // c left
    expect(needsTick(e, new Set([9]), tickKey(e))).toBe(false); // someone out of view moved
    expect(needsTick([], new Set([9]))).toBe(false); // empty, never sent
  });
});
