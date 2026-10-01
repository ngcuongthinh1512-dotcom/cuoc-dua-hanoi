// Server-only leg content (SPEC §3: never in static assets or the client bundle). Phase 6 reads the race rules the
// clients need (movement, presence, vehicles) straight from the demo file; Phase 7 loads the whole leg into SQLite
// (zod schema in /shared) and serves clues step by step (§17.10).
import { type BoxReveal, DEFAULT_BOX_REVEAL } from '@race/shared/protocol';
import leg from '../../legs/paris-demo.json';

export type VehiclesConfig = typeof leg.vehicles;

export const demoLeg = leg;

/** The rule blocks every client gets in `welcome` / the spawner and the box-reveal check use. */
export function legRules() {
  const boxReveal: BoxReveal = { ...DEFAULT_BOX_REVEAL, ...(leg as { boxReveal?: Partial<BoxReveal> }).boxReveal };
  return { movement: leg.movement, presence: leg.presence, vehicles: leg.vehicles, boxReveal };
}
