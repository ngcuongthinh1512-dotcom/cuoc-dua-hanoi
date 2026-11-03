import { describe, expect, it } from 'vitest';
import type { CqTeamResult } from './contract.ts';
import { NO_PICK, countdown, insideCheckout, lockTimeText, loserWaitText, pickItem, pointsText, queueText, resultRows } from './logic.ts';

// a wall rail 2 m ahead (−z) with three tiers: low 0.6 m, middle 1.2 m, top 1.95 m; two neighbours 0.55 m apart on the middle tier
const A = [
  { id: 'low', x: 0, y: 0.6, z: -2 },
  { id: 'mid', x: 0, y: 1.2, z: -2 },
  { id: 'mid-right', x: 0.55, y: 1.2, z: -2 },
  { id: 'top', x: 0, y: 1.95, z: -2 },
  { id: 'too-high', x: 0, y: 2.8, z: -2 },
  { id: 'far', x: 0, y: 1.2, z: -6 },
];
const O = { range: 3.5, coneDeg: 13, reachUp: 2.3, margin: 0.12, holdMs: 120 };
const feet = { x: 0, y: 0, z: 0 };
// a third-person camera 2 m behind and 1.6 m up, aimed at a point (tx, ty, tz)
const eye = { x: 0, y: 1.6, z: 2 };
const aimAt = (tx: number, ty: number, tz: number) => { const v = { x: tx - eye.x, y: ty - eye.y, z: tz - eye.z }, l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const pick = (dir: { x: number; y: number; z: number }, st = NO_PICK, now = 0, anchors = A) => pickItem(eye, dir, feet, anchors, st, now, O);

describe('pickItem: look-to-select along the real camera ray', () => {
  it('looking up at the top rail picks the top item; level at the low one picks it; the floor picks nothing', () => {
    expect(pick(aimAt(0, 1.95, -2)).id).toBe('top');
    expect(pick(aimAt(0, 0.6, -2)).id).toBe('low');
    expect(pick(aimAt(0, 1.2, -2)).id).toBe('mid');
    expect(pick(aimAt(0, 0, -0.5)).id).toBeNull(); // pitched down at the floor in front of the feet
    expect(pick(aimAt(0, 2.8, -2)).id).toBe('top'); // above reach: never 'too-high' (the top item under it is the nearest in the cone, if any)
    expect(pick(aimAt(0, 1.2, -6), NO_PICK, 0, [A[5]!]).id).toBeNull(); // beyond range
    expect(pick(aimAt(0, 1.2, -2), NO_PICK, 0, []).id).toBeNull();
  });
  it('neighbours 0.55 m apart on the same tier are separable at 2 m', () => {
    expect(pick(aimAt(0, 1.2, -2)).id).toBe('mid');
    expect(pick(aimAt(0.55, 1.2, -2)).id).toBe('mid-right');
  });
  it('hysteresis: the neighbour takes over only when clearly better for holdMs; a held item out of the cone drops at once', () => {
    let st = pick(aimAt(0, 1.2, -2));
    const right = aimAt(0.55, 1.2, -2);
    st = pick(right, st, 0);
    expect(st).toMatchObject({ id: 'mid', candidate: 'mid-right' });
    st = pick(right, st, 100);
    expect(st.id).toBe('mid');
    st = pick(right, st, 130);
    expect(st.id).toBe('mid-right');
    st = pick(aimAt(3, 1.2, 2), st, 200); // looking away
    expect(st.id).toBeNull();
  });
  it('a small advantage (under the margin) keeps the held item', () => {
    let st = pick(aimAt(0, 1.2, -2));
    const slight = aimAt(0.12, 1.2, -2);
    for (let t = 0; t < 1000; t += 50) st = pick(slight, st, t);
    expect(st.id).toBe('mid');
  });
});

describe('countdown', () => {
  it('counts from endsAt on the server clock, warns in the last 30 s, clamps at 0', () => {
    const offset = 1000; // the server is 1 s ahead
    expect(countdown(10_000 + 211_000, 10_000, offset, 30_000)).toMatchObject({ text: '3:30', warn: false, second: 210 });
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
  it('set order with the wrong item of a slot shown in its row, further bag items after as wrong', () => {
    const rows = resultRows(set, team(['top.a', 'outer.z', 'acc.q'], ['ok', 'wrong', 'missing', 'wrong']), nameOf, slotOf);
    expect(rows).toEqual([
      { text: 'TOP.A', mark: 'ok' },
      { text: 'OUTER.Z', mark: 'wrong' },
      { text: 'BOTTOM.C', mark: 'missing' },
      { text: 'ACC.Q', mark: 'wrong' },
    ]);
  });
});
