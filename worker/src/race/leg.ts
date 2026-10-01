// Server-only leg content (SPEC §3: never in static assets or the client bundle). The bundled legs below are imported
// into the Worker and validated with the zod schema (@race/shared/leg); a race loads one of them (or a file the Host
// uploads, `host.leg`) into its Durable Object's SQLite (docs/plans/phase7.md D11). Phase 7 track A: the engine
// (race/engine.ts) owns the loaded leg; `legRules()` of the default leg stays for the bike tests.
import { type Leg, parseLeg } from '@race/shared/leg';
import demo from '../../legs/paris-demo.json';
import filled from '../../legs/test/paris-demo.filled.json';
import mini from '../../legs/test/mini.json';

export type { VehiclesConfig } from '@race/shared/leg';

/** Bundled legs by id. paris-demo = SPEC §10.1 test points, tasks empty for the Host (§17.9: the real leg is not in);
 *  test/* = fake content for tests and the sim bots (SPEC §15 Phase 11). The user's real leg is uploaded by the Host. */
const FILES: Record<string, unknown> = { 'paris-demo': demo, 'paris-demo-filled': filled, mini };

export const DEFAULT_LEG_ID = 'paris-demo';
export const BUNDLED_LEGS = Object.keys(FILES);

/** A bundled leg, parsed (defaults filled). Throws if a bundled file is invalid (worker/src/legs.test.ts catches it). */
export function bundledLeg(id: string): Leg | null {
  const json = FILES[id];
  if (json === undefined) return null;
  const r = parseLeg(json);
  if (!r.ok) throw new Error(`legs/${id}: ${r.issues.map((i) => `${i.where}: ${i.message}`).join('; ')}`);
  return r.leg;
}

export const demoLeg: Leg = bundledLeg(DEFAULT_LEG_ID)!;

/** The rule blocks every client gets in `welcome` / the spawner and the box-reveal check use. */
export function legRules(leg: Leg = demoLeg) {
  return { movement: leg.movement, presence: leg.presence, vehicles: leg.vehicles, boxReveal: leg.boxReveal };
}
