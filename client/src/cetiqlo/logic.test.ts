import { describe, expect, it } from 'vitest';
import type { CqTeamResult } from './contract.ts';
import { NO_PICK, countdown, insideCheckout, lockTimeText, loserWaitText, pickItem, pointsText, queueText, resultRows } from './logic.ts';

const A = [
  { id: 'a', x: 0, y: 1, z: -2 }, // 2 m ahead (looking −z)
  { id: 'b', x: 0.5, y: 1, z: -2 }, // its neighbour, half a metre to the right
  { id: 'behind', x: 0, y: 1, z: 1.5 },
  { id: 'up', x: 0, y: 4.84, z: -1 }, // floor 2, right above
  { id: 'far', x: 0, y: 1, z: -5 },
];
const O = { range: 3, coneDeg: 28, margin: 0.15, holdMs: 120 };
const feet = { x: 0, y: 0, z: 0 }, ahead = { x: 0, z: -1 };
const pick = (dir: { x: number; z: number } = ahead, st = NO_PICK, now = 0, anchors = A) => pickItem(dir, feet, anchors, st, now, O);

describe('pickItem: look-to-select with hysteresis', () => {
  it('the item at the crosshair wins; behind / other floor / beyond reach never', () => {
    expect(pick().id).toBe('a');
    expect(pick({ x: 0, z: 1 }).id).toBe('behind'); // turning round: the one behind is now at the crosshair
    expect(pick(ahead, NO_PICK, 0, [A[3]!, A[4]!]).id).toBeNull();
    expect(pick(ahead, NO_PICK, 0, []).id).toBeNull();
  });
  it('a neighbour takes over only when clearly better for holdMs; the held item drops at once when it leaves the cone', () => {
    const right = { x: Math.sin(0.24), z: -Math.cos(0.24) }; // 14° right: b is at the view centre
    let st = pick(); // a
    st = pick(right, st, 0);
    expect(st).toMatchObject({ id: 'a', candidate: 'b' }); // noted, not switched
    st = pick(right, st, 100);
    expect(st.id).toBe('a');
    st = pick(right, st, 130);
    expect(st.id).toBe('b');
    st = pick({ x: 1, z: 0 }, st, 200); // looking sideways: nothing in the cone
    expect(st.id).toBeNull();
  });
  it('a small advantage (under the margin) keeps the held item', () => {
    const slight = { x: Math.sin(0.04), z: -Math.cos(0.04) };
    let st = pick();
    for (let t = 0; t < 1000; t += 50) st = pick(slight, st, t);
    expect(st.id).toBe('a');
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
    expect(pointsText(100)).toBe('100 điểm');
    expect(pointsText(74.3)).toBe('74,3 điểm');
    expect(pointsText(57.66)).toBe('57,7 điểm');
    expect(loserWaitText(1000, 600_000, 1000 + 61_000)).toBe('Chờ thêm 8:59 nữa nếu không có đối thủ thì được rời đi');
    expect(loserWaitText(1000, 600_000, 1000 + 600_000)).toBeNull();
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
  const team = (bag: string[], marks: CqTeamResult['marks']): CqTeamResult => ({ slot: 1, name: 'x', bag, marks, correct: 0, errors: 0, score: 0, lockedAtMs: null });
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
