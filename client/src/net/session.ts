// Phase 6 track B (docs/plans/phase6.md §5.2): online or offline? Online = a race id (URL ?race=<id> from the Host's
// link, else config net.defaultRace in a PROD build) and a team / Host token from the login screen (ui/Login.ts, SPEC §7,
// §8.10). Offline (null) = the Phase 1–5 test world: dev server without ?race=, ?offline=1, screenshots, ride-check.
import type { Role, Welcome } from '@race/shared/protocol';

export interface Session {
  race: string;
  token: string;
  role: Role;
  /** From /api/login (team) — the Host has none. */
  team?: { id: string; slot: number; name: string; colour: string };
  /** SPEC §8.10 "Chào mừng trở lại": filled by the login, shown before "Tiếp tục". */
  summary?: { reconnects: number; lastSeen: number | null; raceTime: number | null };
  /** Set by NetClient on `welcome` (movement / presence / pose for the spawn). */
  welcome?: Welcome;
}

/** Foundation stub: always offline. Track B: pick the race, show the login screen, remember the code (localStorage). */
export async function startSession(_query: URLSearchParams): Promise<Session | null> {
  return null;
}
