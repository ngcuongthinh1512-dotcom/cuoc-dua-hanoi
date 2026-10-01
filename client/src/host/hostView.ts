// Minimal Host page, pure part (docs/plans/phase6.md §3.19): host.state → table rows / counter lines. No DOM, so it is
// testable in Node. Phase 10 replaces the page with SPEC §13; keep the page thin.
import { worldToLatLon } from '@race/shared';
import type { HostState, QuotaCounters } from '@race/shared/protocol';

/** Durable Object requests as Cloudflare bills them (same formula as worker/src/counters.ts, docs/plans/phase6.md §3.7). */
export const billableRequests = (c: QuotaCounters) => c.http + c.alarms + Math.ceil(c.wsIn / 20);

export interface TeamRow {
  slot: number;
  name: string;
  colour: string;
  code: string;
  player: string;
  status: 'online' | 'offline';
  lastSeen: string;
  reconnects: number;
  position: string;
  flagged: boolean;
}

/** "5 giây trước" / "3 phút trước" / "—" (never connected). */
export function ago(ms: number | null, now: number): string {
  if (ms === null) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s} giây trước` : s < 3600 ? `${Math.floor(s / 60)} phút trước` : `${Math.floor(s / 3600)} giờ trước`;
}

export function teamRows(state: HostState): TeamRow[] {
  return state.teams.map((t) => {
    const ll = t.pose && worldToLatLon(t.pose.x, t.pose.z);
    return {
      slot: t.slot,
      name: t.name,
      colour: t.colour,
      code: t.code,
      player: t.player,
      status: t.online ? 'online' : 'offline',
      lastSeen: t.online ? 'đang online' : ago(t.lastSeen, state.serverMs),
      reconnects: t.reconnects,
      position: ll ? `${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}` : '—',
      flagged: t.flagged,
    };
  });
}

/** [label, value] pairs of the quota panel (SPEC §3 / CLAUDE.md "Host debug view"). */
export function counterLines(state: HostState): [string, string][] {
  const c = state.counters;
  const n = (v: number) => v.toLocaleString('vi-VN');
  return [
    ['Tin WebSocket nhận', n(c.wsIn)],
    ['Tin WebSocket gửi', n(c.wsOut)],
    ['Request HTTP / WS mở', n(c.http)],
    ['Alarm', n(c.alarms)],
    ['Dòng SQLite ghi', n(c.rows)],
    ['Request tính phí (ước tính)', n(billableRequests(c))],
    ['Xe trên bản đồ', n(state.bikes.length)],
  ];
}

/** One team per line, "Tên đội; Tên người chơi"; colours handed out round-robin (config `hostPage.colours`). */
export function parseTeamLines(text: string, colours: readonly string[], first = 0): { name: string; colour: string; player?: string }[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const [name = '', player = ''] = l.split(';').map((s) => s.trim());
      return { name, colour: colours[(first + i) % colours.length]!, ...(player ? { player } : {}) };
    });
}

/** `/host.html?demo=1`: fake state for screenshots, no server. */
export function demoState(now = 1_000_000): HostState {
  const pose = (x: number, z: number) => ({ x, y: 0, z, yaw: 0, mode: 'walk' as const, action: 'none' as const });
  const team = (slot: number, name: string, colour: string, code: string, player: string, online: boolean, seenAgo: number | null, reconnects: number, p: ReturnType<typeof pose> | null, flagged = false) =>
    ({ slot, id: `t${slot}`, name, colour, online, code, player, lastSeen: seenAgo === null ? null : now - seenAgo, reconnects, pose: p, flagged });
  return {
    t: 'host.state',
    serverMs: now,
    status: 'lobby',
    teams: [
      team(0, 'Đội Xanh', '#2c6bd8', 'K7M3QX', 'An', true, 0, 1, pose(120, -310)),
      team(1, 'Đội Đỏ', '#d8342c', 'W9HT4B', 'Bình', true, 0, 0, pose(-80, 40), true),
      team(2, 'Đội Vàng', '#e0b020', 'R2NZ8P', 'Chi', false, 95_000, 3, pose(400, -520)),
      team(3, 'Đội Lục', '#2c9a4a', 'D5FY6E', '', false, null, 0, null),
    ],
    counters: { wsIn: 18_420, wsOut: 41_200, http: 12, alarms: 3, rows: 1_262 },
    bikes: [],
    spawning: { paused: false, candidates: 0, nextAt: null },
  };
}
