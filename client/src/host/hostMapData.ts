// SPEC §17.41 "Bản đồ trực tiếp", pure part (no DOM, no map code: host/main.ts imports it at once, hostMap.ts draws it).
// The loaded leg's places come ONLY from host.state.leg (the Host socket): nothing of a leg is in the bundle or a static file.
import { PIT_MAT } from '@race/shared';
import { encodeTick, type HostState, type TickArray } from '@race/shared/protocol';

type Leg = NonNullable<HostState['leg']>;
type Team = HostState['teams'][number];
export type PlaceKind = 'start' | Leg['steps'][number]['type'];
/** One step (or detour branch) done at a place. key: 'start', the step id, or "<step id>|<branch id>". */
export interface PlaceEntry { key: string; label: string; name: string; kind: PlaceKind }
/** A point of the leg; steps done at the same point (< 1 m apart: a route's box, then the challenge there) share it. */
export interface Place { x: number; z: number; r: number; mat: boolean; kind: PlaceKind; entries: PlaceEntry[] }

/** The kind a shared place shows (its pin colour): the first of these among its entries. */
export const PLACE_RANK: readonly PlaceKind[] = ['pit_stop', 'challenge', 'detour', 'route_info', 'start'];

/** Start, every step's zone (route box, task place, Pit Stop mat) and every detour branch's. */
export function legPlaces(leg: Leg): Place[] {
  const out: Place[] = [];
  const add = (x: number, z: number, r: number, e: PlaceEntry, mat = false) => {
    const p = out.find((q) => Math.hypot(q.x - x, q.z - z) < 1);
    if (!p) return void out.push({ x, z, r, mat, kind: e.kind, entries: [e] });
    p.entries.push(e);
    p.r = Math.max(p.r, r);
    p.mat ||= mat;
    if (PLACE_RANK.indexOf(e.kind) < PLACE_RANK.indexOf(p.kind)) p.kind = e.kind;
  };
  add(leg.start.x, leg.start.z, 0, { key: 'start', label: 'Xuất phát', name: '', kind: 'start' });
  for (const s of leg.steps) {
    add(s.x, s.z, s.r, { key: s.id, label: s.label, name: s.name, kind: s.type }, s.type === 'pit_stop');
    for (const b of s.branches ?? []) add(b.x, b.z, b.r, { key: `${s.id}|${b.id}`, label: `${s.label} ${b.id}`, name: `${b.title} · ${b.name}`, kind: s.type });
  }
  return out;
}

/** "Lộ trình 2 · Lựa chọn kép +1 · 2 đội": the first two steps there, how many more, how many teams head for it. */
export function placeLabel(p: Place, teams: number): string {
  const names = [...new Set(p.entries.map((e) => e.label))];
  return `${names.slice(0, 2).join(' · ')}${names.length > 2 ? ` +${names.length - 2}` : ''}${teams ? ` · ${teams} đội` : ''}`;
}

/** Team id → the entry key it is heading for: its current step (a detour: the chosen branch once picked, host.state progress).
 *  Left out: never entered, finished, race over. */
export function heading(state: HostState): Map<string, string> {
  const out = new Map<string, string>();
  if (state.status === 'finished') return out;
  for (const t of state.teams) {
    const s = state.leg?.steps[t.step];
    if (!s || t.finishAt !== null || t.joinedAt === null) continue;
    const branch = s.branches && state.progress.find((p) => p.team === t.id && p.step === s.id)?.branch;
    out.set(t.id, branch ? `${s.id}|${branch}` : s.id);
  }
  return out;
}

/** Entry key → names of the teams heading for it. */
export function byEntry(state: HostState, head: ReadonlyMap<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const t of state.teams) {
    const k = head.get(t.id);
    if (k) out.set(k, [...(out.get(k) ?? []), t.name]);
  }
  return out;
}

/** Centre + m per px showing every point `pad` px inside a w × h view, the scale kept within [lo, hi]. `pts` not empty. */
export function fitView(pts: readonly { x: number; z: number }[], w: number, h: number, lo: number, hi: number, pad: number): { cx: number; cz: number; mpp: number } {
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const mpp = Math.max((x1 - x0) / Math.max(1, w - 2 * pad), (z1 - z0) / Math.max(1, h - 2 * pad));
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, mpp: Math.min(hi, Math.max(lo, mpp)) };
}

/** Hover text of a place: every step there with its place name and the teams on it. */
export function placeTip(p: Place, by: ReadonlyMap<string, readonly string[]>): string {
  const lines = p.entries.map((e) => `${e.label}${e.name ? ` – ${e.name}` : ''}${by.get(e.key)?.length ? `\n   đội ở bước này: ${by.get(e.key)!.join(', ')}` : ''}`);
  return [...lines, ...(p.mat ? [`Thảm về đích ${PIT_MAT.width} × ${PIT_MAT.length} m`] : [])].join('\n');
}

/** Hover text of a team dot. */
export function teamTip(state: HostState, t: Team, key: string | undefined): string {
  const s = state.leg?.steps[t.step];
  const branch = key?.split('|')[1];
  const at = t.finishAt !== null ? 'Đã về đích' : s ? `Bước hiện tại: ${s.label}${branch ? ` (nhánh ${branch})` : ''}` : '—';
  return `${t.name} · ${t.online ? 'online' : 'offline'}\n${at}`;
}

const placeOf = (places: readonly Place[], head: ReadonlyMap<string, string>, t: Team) =>
  t.finishAt !== null ? places.find((p) => p.mat) : places.find((p) => p.entries.some((e) => e.key === head.get(t.id)));

/** `/host.html?demo=1`: Đội Ngọc + Đội Hồng (online, on Lộ trình 1 / 2) join, and every known pose sits near the team's
 *  place (demoState's poses are around the Concorde, far from its leg). Fake names and codes, no leg text. */
export function withMapDemo(state: HostState): HostState {
  const now = state.serverMs;
  const min = 60_000;
  const leg = state.leg!;
  const idOf = (i: number) => leg.steps[i]!.id;
  const row = state.progress[0]!; // shape only
  const done = (team: string, i: number, at: number) => ({ ...row, team, step: idOf(i), branch: null, openedAt: at, arrivedAt: at + 6 * min, startedAt: at + 7 * min, completedAt: at + 8 * min });
  const team = (slot: number, name: string, colour: string, code: string, step: number): Team => ({ ...state.teams[1]!, slot, id: `t${slot}`, name, colour, code, player: '', online: true, lastSeen: now, reconnects: 0, pose: null, flagged: false, flagWhy: [], flagAt: null, startOrder: slot + 1, step, finishAt: null, penaltyMinutes: 0, joinedAt: now - 25 * min });
  const s: HostState = {
    ...state,
    teams: [...state.teams, team(7, 'Đội Ngọc', '#20a8b8', 'N6QK2W', 0), team(8, 'Đội Hồng', '#c0408a', 'P3HZ9R', 2)], // slots after demoState's t0…t6
    progress: [...state.progress, { ...done('t7', 0, now - 9 * min), arrivedAt: null, startedAt: null, completedAt: null }, done('t8', 0, now - 25 * min), done('t8', 1, now - 17 * min), { ...done('t8', 2, now - 9 * min), arrivedAt: null, startedAt: null, completedAt: null }],
  };
  const places = legPlaces(leg);
  const head = heading(s);
  return {
    ...s,
    teams: s.teams.map((t) => {
      const p = (t.pose || t.online) && placeOf(places, head, t);
      const [r, a] = [t.finishAt !== null ? 3 : 45, t.slot * 2.4];
      return p ? { ...t, pose: { x: p.x + r * Math.cos(a), y: 0, z: p.z + r * Math.sin(a), yaw: 0, mode: 'walk' as const, action: 'none' as const } } : t;
    }),
  };
}

/** `?demo=1`: the frame the server sends the Host at 5 Hz: every online team on a slow circle around its place (finished: on the mat). */
export function demoTick(state: HostState, now: number): TickArray {
  const places = state.leg ? legPlaces(state.leg) : [];
  const head = heading(state);
  return encodeTick(now, state.teams.flatMap((t) => {
    const p = t.online ? placeOf(places, head, t) : undefined;
    if (!p) return [];
    const [r, a] = t.finishAt !== null ? [1, t.slot] : [60 + 25 * (t.slot % 3), t.slot * 2.4 + (now / 1000) * ((2 * Math.PI) / 90)];
    return [{ slot: t.slot, pose: { x: p.x + r * Math.cos(a), y: 0, z: p.z + r * Math.sin(a), yaw: a, mode: 'walk' as const, action: 'none' as const } }];
  }));
}
