// CETIQLO room: the pure parts (tested in Node): the item to label, the server-synced clock, the queue line, the result rows.
import type { CatalogItem, CqBoardStatus, CqMark, CqTeamResult } from './contract.ts';
export type { CatalogItem };

export interface Anchor { id: string; x: number; y: number; z: number }
export interface PickOpts {
  /** m, horizontal reach from the feet. */
  range: number;
  /** degrees, half-angle of the cone around the camera ray (angular: far items stay hard, near ones easy; ×1.6 within 1.5 m). */
  coneDeg: number;
  /** m above the feet an item may be and still be grabbed (upper rail tiers ≈ 1.95 m); below: −0.5 m (a low shelf from a step). */
  reachUp: number;
  /** A neighbour must beat the held item's score by this much… */
  margin: number;
  /** …for this long (ms) before the highlight moves (no flicker between neighbours). */
  holdMs: number;
}
export interface PickState { id: string | null; candidate: string | null; since: number }
export const NO_PICK: PickState = { id: null, candidate: null, since: 0 };
/** Look-to-select with the REAL camera ray: among the items within reach (horizontal `range` from the feet, −0.5 m ≤ dy ≤ reachUp
 *  above the feet), the one nearest the view centre = the smallest angle between the camera's forward vector (`dir`, unit, with pitch)
 *  and the vector from the camera (`eye`) to the item's centre (`anchors` = bounding-box centres), inside the cone; score = angle / cone
 *  + 0.3 × distance / range (lower = better). Hysteresis: the held item stays unless another beats it by `margin` for `holdMs`; a held
 *  item that left the cone / reach drops at once. */
export function pickItem(eye: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, feet: { x: number; y: number; z: number }, anchors: Iterable<Anchor>, st: PickState, now: number, o: PickOpts): PickState {
  let best: Anchor | null = null, bestScore = Infinity, heldScore = Infinity;
  const dl = Math.hypot(dir.x, dir.y, dir.z) || 1e-6, dx = dir.x / dl, dy = dir.y / dl, dz = dir.z / dl;
  for (const a of anchors) {
    const up = a.y - feet.y;
    if (up < -0.5 || up > o.reachUp) continue;
    const d = Math.hypot(a.x - feet.x, a.z - feet.z);
    if (d > o.range) continue;
    const vx = a.x - eye.x, vy = a.y - eye.y, vz = a.z - eye.z, len = Math.hypot(vx, vy, vz) || 1e-6;
    const cos = (vx * dx + vy * dy + vz * dz) / len;
    const cone = (o.coneDeg * Math.PI / 180) * (d < 1.5 ? 1.6 : 1);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (ang > cone) continue;
    const score = ang / cone + 0.3 * (d / o.range);
    if (a.id === st.id) heldScore = score;
    if (score < bestScore) (best = a), (bestScore = score);
  }
  if (!best) return st.id === null && st.candidate === null ? st : { id: null, candidate: null, since: now };
  if (st.id !== null && heldScore === Infinity) return { id: best.id, candidate: null, since: now }; // the held one left the cone / reach
  if (best.id === st.id || st.id === null) return best.id === st.id ? (st.candidate === null ? st : { id: st.id, candidate: null, since: now }) : { id: best.id, candidate: null, since: now };
  if (bestScore >= heldScore - o.margin) return st.candidate === null ? st : { id: st.id, candidate: null, since: now }; // not clearly better
  if (st.candidate !== best.id) return { id: st.id, candidate: best.id, since: now };
  return now - st.since >= o.holdMs ? { id: best.id, candidate: null, since: now } : st;
}

/** Feet inside the CHECKOUT square (half side `half`) or circle (`radius`). */
export const insideCheckout = (x: number, z: number, c: { x: number; z: number; half?: number; radius: number }) =>
  c.half !== undefined ? Math.abs(x - c.x) <= c.half && Math.abs(z - c.z) <= c.half : Math.hypot(x - c.x, z - c.z) <= c.radius;

/** The server clock estimate: `offset` = serverNow − Date.now() at the message (the latest message wins). */
export const clockOffset = (serverNow: number, localNow: number) => serverNow - localNow;
export interface Countdown { leftMs: number; text: string; warn: boolean; second: number }
/** Time left to `endsAt` on the server clock (`localNow + offset`), clamped at 0; `second` changes once a second (the DOM write gate). */
export function countdown(endsAt: number, localNow: number, offset: number, warnMs: number): Countdown {
  const leftMs = Math.max(0, endsAt - (localNow + offset));
  const second = Math.ceil(leftMs / 1000);
  return { leftMs, second, text: `${Math.floor(second / 60)}:${String(second % 60).padStart(2, '0')}`, warn: leftMs <= warnMs };
}

export const queueText = (pos: number | undefined, len: number | undefined) =>
  pos && len ? `Đang chờ đối thủ · vị trí ${pos} / ${len} trong hàng chờ` : 'Đang chờ đối thủ…';

export const MARK_TEXT: Record<CqMark, string> = { ok: '✅ đúng', wrong: '❌ sai', missing: '⬜ thiếu' };
export interface ResultRow { text: string; mark: CqMark }
/** One row per set position (the set item, or the wrong item of that slot the team took), then every further bag item as a wrong row: set order, then bag order. */
export function resultRows(set: readonly string[], r: CqTeamResult, nameOf: (id: string) => string, slotOf: (id: string) => string | undefined): ResultRow[] {
  const rows: ResultRow[] = [];
  const used = new Set<string>();
  set.forEach((id, i) => {
    const mark = r.marks[i] ?? 'missing';
    let shown = id;
    if (mark === 'wrong') { // the bag item of that slot that is not in the set
      const w = r.bag.find((b) => !set.includes(b) && !used.has(b) && slotOf(b) === slotOf(id));
      if (w) (shown = w), used.add(w);
    }
    if (mark === 'ok') used.add(id);
    rows.push({ text: nameOf(shown), mark });
  });
  for (const b of r.bag) if (!used.has(b) && !set.includes(b)) (used.add(b), rows.push({ text: nameOf(b), mark: 'wrong' }));
  return rows;
}

/** Points (0–100, 1 decimal) as "74,3 điểm" / "100 điểm" (Vietnamese comma, no trailing ,0). */
export const pointsText = (score: number) => `${(Math.round(score * 10) / 10).toString().replace('.', ',')} điểm`;
export const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** "Còn chờ tối đa mm:ss – không có đối thủ thì được rời đi" for any team waiting in the lobby (owner: everybody is let go after 10 min); null once the wait is over. */
export function waitText(waitFrom: number, maxWaitMs: number, serverNow: number): string | null {
  const left = waitFrom + maxWaitMs - serverNow;
  if (left <= 0) return null;
  return `Còn chờ tối đa ${mmss(left)} – không có đối thủ thì được rời đi`;
}
/** The waiting-room board's status badges (cq.board rows). */
export const BOARD_STATUS_TEXT: Record<CqBoardStatus, string> = { playing: 'ĐANG CHƠI', waiting: 'CHỜ', lost: 'ĐÃ THUA · chờ lượt', drew: 'HÒA · chờ lượt', won: 'ĐÃ THẮNG', done: 'ĐÃ XONG · đã đi' };
/** "47.213 s" after the match start, or "Không hoàn thành". */
export const lockTimeText = (lockedAtMs: number | null, startAt: number) => (lockedAtMs === null ? 'Không hoàn thành' : `${((lockedAtMs - startAt) / 1000).toFixed(3)} s`);

export const WINNER_TEXT = { you: 'ĐỘI BẠN THẮNG!', opp: 'Đội bạn thua', draw: 'HÒA' } as const;
export const REASON_TEXT = {
  completion: 'hoàn thành trước khi hết giờ',
  score: 'điểm cao hơn',
  speed: 'chốt sớm hơn',
  draw: 'cả hai đội xuống cuối hàng chờ, đấu tiếp với đội khác',
} as const;
