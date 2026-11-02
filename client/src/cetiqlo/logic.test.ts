import { describe, expect, it } from 'vitest';
import type { CqTeamResult } from './contract.ts';
import { countdown, insideCheckout, lockTimeText, nearestItem, queueText, resultRows } from './logic.ts';

const A = [
  { id: 'a', x: 0, y: 0, z: -2 }, // 2 m ahead (looking −z)
  { id: 'b', x: 0, y: 0, z: 1.5 }, // 1.5 m behind
  { id: 'up', x: 0, y: 3.84, z: -1 }, // floor 2, right above
  { id: 'far', x: 5, y: 0, z: 0 },
];

describe('nearestItem', () => {
  it('prefers the item in front (behind counts × 1.6), skips the other floor and anything beyond r', () => {
    expect(nearestItem(0, 0, 0, 0, -1, A, 3)?.id).toBe('a'); // 2 < 1.5 × 1.6
    expect(nearestItem(0, 0, 0, 0, 1, A, 3)?.id).toBe('b');
    expect(nearestItem(0, 3.84, 0, 0, -1, A, 3)?.id).toBe('up');
    expect(nearestItem(0, 0, 0, 0, -1, A, 1)).toBeNull();
  });
});

describe('countdown', () => {
  it('counts from endsAt on the server clock, warns in the last 30 s, clamps at 0', () => {
    const offset = 1000; // the server is 1 s ahead
    expect(countdown(10_000 + 181_000, 10_000, offset, 30_000)).toMatchObject({ text: '3:00', warn: false, second: 180 });
    expect(countdown(10_000 + 26_000, 10_000, offset, 30_000)).toMatchObject({ text: '0:25', warn: true });
    expect(countdown(0, 10_000, offset, 30_000)).toMatchObject({ leftMs: 0, text: '0:00', warn: true });
  });
});

describe('queue / checkout / lock time', () => {
  it('texts', () => {
    expect(queueText(2, 3)).toBe('Đang chờ đối thủ · vị trí 2 / 3 trong hàng chờ');
    expect(queueText(undefined, undefined)).toBe('Đang chờ đối thủ…');
    expect(lockTimeText(1_047_213, 1_000_000)).toBe('47.213 s');
    expect(lockTimeText(null, 0)).toBe('Không hoàn thành');
  });
  it('insideCheckout: the square when half is given, else the circle', () => {
    const c = { x: -4.5, z: 7.5, half: 1.5, radius: 2.1 };
    expect(insideCheckout(-3.1, 8.9, c)).toBe(true);
    expect(insideCheckout(-3.1, 9.1, c)).toBe(false);
    expect(insideCheckout(-4.5, 9.5, { x: -4.5, z: 7.5, radius: 2.1 })).toBe(true);
  });
});

describe('resultRows', () => {
  const set = ['top.a', 'outer.b', 'bottom.c'];
  const slotOf = (id: string) => id.split('.')[0];
  const nameOf = (id: string) => id.toUpperCase();
  const team = (bag: string[], marks: CqTeamResult['marks']): CqTeamResult => ({ slot: 1, name: 'x', bag, marks, correct: 0, errors: 0, scorePct: 0, lockedAtMs: null });
  it('set order with the wrong item of a slot shown in its row, extras after', () => {
    const rows = resultRows(set, team(['top.a', 'outer.z', 'acc.q'], ['ok', 'wrong', 'missing', 'extra']), nameOf, slotOf);
    expect(rows).toEqual([
      { text: 'TOP.A', mark: 'ok' },
      { text: 'OUTER.Z', mark: 'wrong' },
      { text: 'BOTTOM.C', mark: 'missing' },
      { text: 'ACC.Q', mark: 'extra' },
    ]);
  });
});
