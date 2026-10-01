// Phase 6 track B (docs/plans/phase6.md §5.2): online or offline? Online = a race id (URL ?race=<id> from the Host's
// link, else config net.defaultRace in a PROD build) and a team / Host token from the login screen (ui/Login.ts, SPEC §7,
// §8.10). Offline (null) = the Phase 1–5 test world: dev server without ?race=, ?offline=1, screenshots, ride-check.
import type { Role, Welcome } from '@race/shared/protocol';
import { net } from '../config.ts';
import { login, previewLogin } from '../ui/Login.ts';

export interface Session {
  race: string;
  token: string;
  role: Role;
  /** From /api/login (team) — the Host has none. */
  team?: { id: string; slot: number; name: string; colour: string };
  /** SPEC §8.10 "Chào mừng trở lại": filled by the login, shown before "Tiếp tục". */
  summary?: {
    reconnects: number;
    lastSeen: number | null;
    raceTime: number | null;
    /** Phase 7 (RaceEngine.summary): the current step's label ("Lộ trình 3"; a number = its index), absent before Phase 7. */
    step?: string | number | null;
  };
  /** Set by NetClient on `welcome` (movement / presence / pose for the spawn). */
  welcome?: Welcome;
}

/** Same rule as the Worker (worker/src/index.ts RACE_ID). */
const RACE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** In a real race: a ?race= link (or any PROD page), unless ?offline=1 (the test world, every preset, ride-check). */
export const isOnline = (q: URLSearchParams, prod: boolean = import.meta.env.PROD) => (q.has('race') || prod) && q.get('offline') !== '1';

/** The race of the Host's link; a missing / malformed id → net.defaultRace. */
export function raceId(q: URLSearchParams): string {
  const r = q.get('race') ?? '';
  return RACE_ID.test(r) ? r : net.defaultRace;
}

/** Offline → null at once. Online → the login screen (resolves once logged in, after "Tiếp tục" on a return).
 *  DEV ?login / ?login=back: the form / the "Chào mừng trở lại" screen drawn over the offline world (p6-login presets). */
export async function startSession(query: URLSearchParams): Promise<Session | null> {
  if (import.meta.env.DEV && query.has('login')) return previewLogin(query.get('login') === 'back'), null;
  return isOnline(query) ? login(raceId(query)) : null;
}
