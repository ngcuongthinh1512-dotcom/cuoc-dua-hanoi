import { describe, expect, it } from 'vitest';
import { R, TEAMS, isLight, lampSlots, plainName, tableAt, tableSlots, vaultA, vaultR } from './chocoBuild.ts';

describe('choco builders', () => {
  it('11 teams with hex colours, placard names without emoji', () => {
    expect(TEAMS).toHaveLength(11);
    for (const t of TEAMS) expect(t.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(plainName(TEAMS[5])).toBe('Đạt 09');
    expect(plainName(TEAMS[7])).toBe('Hiếu');
    expect(plainName(TEAMS[0])).toBe('Hai Long');
    expect(plainName({ slot: 4, name: '🍫', color: '#000000' })).toBe('Đội 4');
    expect(isLight('#eadcb8')).toBe(true);
    expect(isLight('#1a1a1a')).toBe(false);
  });
  it('11 tables inside the room, in two rows facing the aisle, never overlapping', () => {
    const s = tableSlots();
    expect(s).toHaveLength(11);
    for (const t of s) {
      expect(Math.abs(t.x)).toBeLessThan(R.halfW - 1);
      expect(t.z).toBeGreaterThan(R.zBack + 3);
      expect(t.z).toBeLessThan(R.zFront - 3);
      expect(Math.sign(Math.sin(t.yaw))).toBe(-Math.sign(t.x)); // faces the aisle
      expect(tableAt(t, 1).x).toBeCloseTo(t.x - Math.sign(t.x));
    }
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) expect(Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z)).toBeGreaterThanOrEqual(2.5);
    expect(lampSlots()).toHaveLength(14);
  });
  it('vault arc spans the room width with the given rise', () => {
    const r = vaultR(), a = vaultA();
    expect(r * Math.sin(a)).toBeCloseTo(R.halfW);
    expect(R.apexY - r * (1 - Math.cos(a))).toBeCloseTo(R.springY);
  });
});
