import { latLonToWorld, RACE_BBOX } from '@race/shared';
import { parseLeg } from '@race/shared/leg';
import { describe, expect, it } from 'vitest';
import leg from '../legs/bruxelles-demo.json';
import { BUNDLED_LEGS, bundledLeg } from './race/leg.ts';

describe('bundled legs (zod schema, docs/plans/phase7.md D11)', () => {
  it('every bundled leg parses with no error', () => {
    expect(BUNDLED_LEGS).toEqual(['bruxelles-demo', 'bruxelles-demo-filled', 'mini']);
    for (const id of BUNDLED_LEGS) expect(bundledLeg(id)?.id).toBe(id);
  });

  it('the demo leg is a draft: only the Host blanks of SPEC §10.1 are open; the filled test copy has none', () => {
    const r = parseLeg(leg);
    expect(r.ok).toBe(true);
    expect(new Set(r.issues.map((i) => i.level))).toEqual(new Set(['blank']));
    expect(r.issues.map((i) => i.where.split(' ›')[0])).toEqual(expect.arrayContaining(['Bước 3 (D1)', 'Bước 5 (T1)', 'Bước 8 (T2)']));
    expect(r.issues.filter((i) => i.where.startsWith('Host duyệt'))).toEqual([]); // SPEC §17.17: no Host Facebook link to fill
    for (const id of ['bruxelles-demo-filled', 'mini']) expect(parseLeg(bundledLeg(id)).issues).toEqual([]);
  });

  it('starts at the Place Sainte-Catherine (Leg 3 start; SPEC §17.12 = one agreed start): every bundled leg, within 25 m', () => {
    // Leg 1 (Paris) was the Pont de Bir-Hakeim; Leg 3 (Brussels): the Place Sainte-Catherine, north-west of the Grand-Place
    const start = latLonToWorld(50.8511, 4.3468);
    for (const id of BUNDLED_LEGS) {
      const s = bundledLeg(id)!.start;
      const p = latLonToWorld(s.lat, s.lon);
      expect(Math.hypot(p.x - start.x, p.z - start.z)).toBeLessThan(25);
    }
  });
});

// Pure data checks of the demo leg against SPEC §10.1.
describe('legs/bruxelles-demo.json', () => {
  const steps = leg.steps;
  const count = (type: string) => steps.filter((s) => s.type === type).length;

  it('has the 10 steps in order', () => {
    expect(steps.map((s) => s.id)).toEqual(['L1', 'L2', 'D1', 'L3', 'T1', 'L4', 'L5', 'T2', 'L6', 'PS']);
    expect([count('route_info'), count('detour'), count('challenge'), count('pit_stop')]).toEqual([6, 1, 2, 1]);
  });

  it('keeps every destination and the start inside RACE_BBOX', () => {
    const points = [leg.start, ...steps.map((s) => s.destination).filter((d) => d !== undefined)];
    expect(points).toHaveLength(8); // start + 6 route_info + pit_stop
    for (const p of points) {
      expect(p.lat).toBeGreaterThan(RACE_BBOX.south);
      expect(p.lat).toBeLessThan(RACE_BBOX.north);
      expect(p.lon).toBeGreaterThan(RACE_BBOX.west);
      expect(p.lon).toBeLessThan(RACE_BBOX.east);
    }
  });

  it('uses foot speed 4 m/s and bike = 1.3 × foot (Leg 2: no ×1.5 of SPEC §17.43)', () => {
    expect(leg.movement.footSpeed).toBe(4);
    expect(leg.movement.bikeSpeedMultiplier).toBe(1.3);
  });

  it('enables only the Express Pass', () => {
    const enabled = Object.entries(leg.specials).filter(([, v]) => v.enabled).map(([k]) => k);
    expect(enabled).toEqual(['expressPass']);
  });

  it('forces walking on L3 and L6, allows any transport on the other routes', () => {
    for (const s of steps.filter((s) => s.type === 'route_info')) {
      expect(s.transport).toEqual(s.id === 'L3' || s.id === 'L6' ? { mandatory: 'walk' } : { allowed: 'any' });
    }
  });

  it('leaves the Detour and both Challenges empty for the Host', () => {
    const d1 = steps.find((s) => s.id === 'D1');
    expect(d1?.clue).toBe('');
    const branches = d1?.branches ?? [];
    for (const b of branches) expect([b.name, b.summary]).toEqual(['', '']);
    const tasks = [...branches.map((b) => b.task), ...steps.map((s) => s.task).filter((t) => t !== undefined)];
    expect(tasks).toHaveLength(4);
    for (const t of tasks) {
      expect([t.title, t.description, t.proofInstruction]).toEqual(['', '', '']);
      expect([t.media, t.answers]).toEqual([[], []]);
    }
    for (const id of ['T1', 'T2']) expect(steps.find((s) => s.id === id)).toHaveProperty('teaser', '');
  });
});
