import { latLonToWorld } from '@race/shared';
import { DEFAULT_BOX_REVEAL } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { legPoints, stepBox, welcomeBoxes } from './boxes.ts';
import type { RouteInfoStep } from '@race/shared/leg';
import { demoLeg } from './leg.ts';

const near = (b: { x: number; z: number }, d: number) => ({ x: b.x + d, y: 0, z: b.z, yaw: 0, mode: 'walk' as const, action: 'none' as const });

describe('boxes', () => {
  it('puts each step box at its destination (none for detours / tasks without one)', () => {
    const d = (demoLeg.steps[0] as RouteInfoStep).destination;
    const l1 = latLonToWorld(d.lat, d.lon);
    expect(stepBox(0)).toEqual({ step: 'L1', x: expect.closeTo(l1.x, 2), z: expect.closeTo(l1.z, 2), r: d.radius });
    expect(stepBox(2)).toBeNull(); // D1
    expect(stepBox(99)).toBeNull();
    expect(legPoints().map((p) => p.id)).toEqual(['start', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'PS']);
  });

  it('welcome: opened boxes of earlier steps + the current one only within the radius, never a later one', () => {
    const l1 = stepBox(0)!, l2 = stepBox(1)!;
    expect(welcomeBoxes(0, near(l1, 151), DEFAULT_BOX_REVEAL)).toEqual([]);
    expect(welcomeBoxes(0, near(l1, 150), DEFAULT_BOX_REVEAL)).toEqual([{ ...l1, opened: false }]);
    expect(welcomeBoxes(0, null, DEFAULT_BOX_REVEAL)).toEqual([]);
    expect(welcomeBoxes(1, near(l1, 0), DEFAULT_BOX_REVEAL)).toEqual([{ ...l1, opened: true }]);
    expect(welcomeBoxes(1, near(l2, 10), DEFAULT_BOX_REVEAL)).toEqual([{ ...l1, opened: true }, { ...l2, opened: false }]);
  });
});
