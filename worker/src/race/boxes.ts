// Clue boxes per team (SPEC §17.10): the current step's box is sent only within boxReveal.radius, earlier steps' boxes
// are "opened" and always shown, later ones never leave the server. Pure; RaceRoom checks every NET.boxCheckMs.
import { latLonToWorld } from '@race/shared';
import { type BoxInfo, type BoxReveal, type PoseSample } from '@race/shared/protocol';
import { demoLeg } from './leg.ts';

// ponytail: Phase 6 boxes = the demo leg's step destinations (steps without one, e.g. a detour, have no box); Phase 7
// reads the leg from SQLite and the current step from teams.state.
const BOXES = demoLeg.steps.map((s) => {
  const d = 'destination' in s ? s.destination : undefined;
  if (!d) return null;
  const { x, z } = latLonToWorld(d.lat, d.lon);
  return { step: s.id, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
});

/** The box of step index `step` (no `opened` flag), null when that step has none. */
export const stepBox = (step: number) => BOXES[step] ?? null;

/** Every leg point a Host may see (start + step destinations, world m): the Host page's bike corridors use them. */
export function legPoints(): { id: string; x: number; z: number }[] {
  const s = latLonToWorld(demoLeg.start.lat, demoLeg.start.lon);
  return [{ id: 'start', x: s.x, z: s.z }, ...BOXES.filter((b) => b !== null).map((b) => ({ id: b.step, x: b.x, z: b.z }))];
}

/** `welcome.boxes`: the opened boxes of earlier steps + the current one when `pose` is within the radius. */
export function welcomeBoxes(step: number, pose: PoseSample | null | undefined, r: BoxReveal): BoxInfo[] {
  const out: BoxInfo[] = [];
  for (let i = 0; i < step; i++) {
    const b = stepBox(i);
    if (b) out.push({ ...b, opened: true });
  }
  const cur = stepBox(step);
  if (cur && pose && Math.hypot(pose.x - cur.x, pose.z - cur.z) <= r.radius) out.push({ ...cur, opened: false });
  return out;
}
