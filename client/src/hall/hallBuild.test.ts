import { describe, expect, it } from 'vitest';
import { AISLE_X, H, ORCH, STALLS_MAP, orchestraSlots, standSlots, floorYAt, insidePlan, planPoints, rowR, rowY, seatLabel, stallsLayout } from './hallBuild.ts';

describe('hall builders', () => {
  it('plan is a closed symmetric horseshoe', () => {
    const p = planPoints(0);
    expect(p[0]).toEqual([-H.halfW, H.zFront]);
    expect(p.at(-1)).toEqual([H.halfW, H.zFront]);
    const rear = Math.max(...p.map(([, z]) => z));
    expect(rear).toBeCloseTo(H.zArc + H.rear);
    expect(insidePlan(0, 10)).toBe(true);
    expect(insidePlan(15, 27)).toBe(false);
  });
  it('seat counts per block / row follow the BOZAR seat map (front section)', () => {
    const { seats } = stallsLayout(), front = seats.filter((s) => !s.rear);
    const n = (block: string, row: string) => front.filter((s) => s.block === block && s.row === row).length;
    const centre = { A: 16, B: 16, C: 17, D: 17, E: 18, F: 18, G: 19, H: 19, I: 20, J: 20, K: 20, L: 20, M: 20, N: 20, O: 20, P: 20, Q: 26 };
    const side = { A: 9, B: 9, C: 9, D: 10, E: 12, F: 12, G: 12, H: 10, I: 10, J: 10, K: 10, L: 10, M: 0, N: 11, O: 11, P: 11, Q: 11 };
    for (const [row, c] of Object.entries(centre)) expect([row, n('C', row)]).toEqual([row, c]);
    for (const [row, c] of Object.entries(side)) {
      expect([row, n('L', row)]).toEqual([row, c]);
      expect([row, n('R', row)]).toEqual([row, c]);
    }
    expect(front.filter((s) => s.block === 'C').length).toBe(326);
    expect(front.filter((s) => s.block === 'L').length).toBe(167);
    expect(front.length).toBe(660);
  });
  it('seats stay inside the plan, clear of the diagonal aisles and sit on their terrace', () => {
    const { seats, plates, wc } = stallsLayout();
    expect(wc.length).toBe(6);
    expect(seats.filter((s) => s.rear && s.row === 'A').length).toBe(22 + 12);
    expect(plates.length).toBeGreaterThan(60);
    for (const s of seats) {
      expect(insidePlan(s.x, s.z, 1)).toBe(true);
      const i = STALLS_MAP.findIndex((r) => r.k === s.row && !!r.rear === s.rear);
      if (s.block === 'C') expect(Math.abs(s.x)).toBeLessThan(AISLE_X[i] - 0.25);
      else expect(Math.abs(s.x)).toBeGreaterThan(AISLE_X[i] + 0.25);
      expect(floorYAt(s.x, s.z)).toBeCloseTo(s.y); // the floor under every seat is that row's terrace
    }
  });
  it('seat numbers: 1 / 2 either side of the axis, odd left, even right, unbroken into the side blocks', () => {
    const { seats, wc } = stallsLayout();
    for (const row of STALLS_MAP) {
      const mine = seats.filter((s) => s.row === row.k && !!s.rear === !!row.rear);
      expect(new Set(mine.map((s) => s.num)).size).toBe(mine.length); // unique per row
      for (const s of mine) expect(s.num % 2).toBe(s.side === 'odd' ? 1 : 0);
      const oddX = mine.filter((s) => s.side === 'odd').map((s) => s.x), evenX = mine.filter((s) => s.side === 'even').map((s) => s.x);
      expect(Math.max(...oddX)).toBeLessThan(Math.min(...evenX)); // odd side wholly left of the even side
      for (const s of mine) if (s.block !== 'C') expect(s.side).toBe(s.block === 'L' ? 'odd' : 'even');
      if (row.rear || !row.l) continue; // rear rows: halves around an aisle; M: no side blocks
      const one = mine.find((s) => s.num === 1)!, two = mine.find((s) => s.num === 2)!, centre = mine.filter((s) => s.block === 'C');
      expect(one.block).toBe('C');
      expect(two.block).toBe('C');
      expect(two.x - one.x).toBeCloseTo(H.stalls.seat); // 1 and 2 are neighbours; across the axis unless the row says otherwise
      if (!row.odd) expect(Math.abs(one.x + two.x)).toBeLessThan(H.stalls.seat * 1.01);
      expect(Math.max(...centre.map((s) => s.x)) - Math.min(...centre.map((s) => s.x))).toBeCloseTo((centre.length - 1) * H.stalls.seat, 0);
      const nextOdd = Math.max(...centre.filter((s) => s.side === 'odd').map((s) => s.num)) + 2, nextEven = Math.max(...centre.filter((s) => s.side === 'even').map((s) => s.num)) + 2;
      expect(mine.find((s) => s.block === 'L' && s.num === nextOdd)).toBeDefined(); // the side blocks continue the count
      expect(mine.find((s) => s.block === 'R' && s.num === nextEven)).toBeDefined();
    }
    // printed end numbers on the numbered map (images 14–16): centre odd max / even max, side-block first numbers
    const ends: Record<string, [number, number]> = { A: [15, 16], B: [15, 16], C: [15, 18], D: [15, 18], E: [17, 18], F: [17, 18], G: [17, 20], H: [17, 20], I: [19, 20], J: [19, 20], K: [19, 20], L: [19, 20], M: [17, 22], N: [19, 20], O: [19, 20], P: [19, 20], Q: [25, 26] };
    for (const [row, [o, e]] of Object.entries(ends)) {
      const c = seats.filter((s) => s.row === row && !s.rear && s.block === 'C');
      expect([row, Math.max(...c.filter((s) => s.side === 'odd').map((s) => s.num)), Math.max(...c.filter((s) => s.side === 'even').map((s) => s.num))]).toEqual([row, o, e]);
      if (row === 'M') continue;
      expect(Math.min(...seats.filter((s) => s.row === row && !s.rear && s.block === 'L').map((s) => s.num))).toBe(o + 2);
      expect(Math.min(...seats.filter((s) => s.row === row && !s.rear && s.block === 'R').map((s) => s.num))).toBe(e + 2);
    }
    const c = seats.filter((s) => s.row === 'C' && !s.rear);
    expect(c.find((s) => s.block === 'L' && s.num === 17)).toBeDefined(); // map: left block C starts at 17 …
    expect(Math.min(...c.filter((s) => s.block === 'R').map((s) => s.num))).toBe(20); // … right block at 20
    expect(Math.min(...seats.filter((s) => s.row === 'A' && !s.rear && s.block === 'R').map((s) => s.num))).toBe(18);
    expect(seatLabel(c[0])).toMatch(/^C-\d+$/);
    expect(wc.every((w) => w.num! > 0)).toBe(true);
  });
  it('terraces rise one riser per row and the front is flat', () => {
    expect(floorYAt(0, H.zFront + 1)).toBe(0);
    STALLS_MAP.forEach((row, i) => expect(floorYAt(0, H.stalls.cz + rowR(row))).toBeCloseTo(rowY(i)));
  });
  it('orchestra slots: ~80 musicians on the stage, sections in place, back tiers rising', () => {
    const slots = orchestraSlots(), n = (k: string) => slots.filter((s) => s.kind === k).length;
    expect(slots.length).toBeGreaterThanOrEqual(75);
    expect(slots.length).toBeLessThanOrEqual(95);
    expect(n('vln1') + n('vln2') + n('vla') + n('vc')).toBeGreaterThanOrEqual(44);
    expect([n('db'), n('timp'), n('harp'), n('piano')]).toEqual([4, 3, 1, 1]);
    for (const s of slots) {
      expect(Math.abs(s.x)).toBeLessThan(H.stage.halfW);
      expect(s.z).toBeGreaterThan(H.stage.back + 2);
      expect(s.z).toBeLessThan(H.zFront - 1);
    }
    expect(Math.max(...slots.filter((s) => s.kind === 'vln1').map((s) => s.x))).toBeLessThan(0); // violins I left …
    expect(Math.min(...slots.filter((s) => s.kind === 'vc').map((s) => s.x))).toBeGreaterThan(0); // … cellos right
    const yOf = (k: string) => slots.find((s) => s.kind === k)!.y;
    expect(yOf('vln1')).toBe(H.stage.y);
    expect(yOf('brass') + 0.2).toBeLessThanOrEqual(yOf('timp') + 1e-9); // horns on the floor, timpani on step 2
    expect(Math.max(...slots.filter((s) => s.kind === 'brass').map((s) => s.y))).toBe(H.stage.y + ORCH.steps[0][2]);
    expect(yOf('timp')).toBe(H.stage.y + ORCH.steps[1][2]);
    const stands = standSlots(slots);
    expect(stands.length).toBeGreaterThan(40);
    for (const st of stands) expect(st.z).toBeGreaterThan(ORCH.c.z - 9.4);
  });
});
