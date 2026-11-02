// CETIQLO room: the pure parts (tested in Node): the item to label, the server-synced clock, the queue line, the result rows.
import type { CatalogItem, CqMark, CqTeamResult } from './contract.ts';

export interface Anchor { id: string; x: number; y: number; z: number }

/** The item to label from feet (px, py, pz): the nearest within `r` m on the same floor (|dy| ≤ 2.2), the ones in front of the
 *  look direction (fx, fz) before those behind (× 1.6, like the BOZAR seats). null = none. */
export function nearestItem(px: number, py: number, pz: number, fx: number, fz: number, anchors: Iterable<Anchor>, r: number): Anchor | null {
  let best: Anchor | null = null, score = Infinity;
  for (const a of anchors) {
    if (Math.abs(a.y - py) > 2.2) continue;
    const dx = a.x - px, dz = a.z - pz, d = Math.hypot(dx, dz);
    if (d > r) continue;
    const k = d * (dx * fx + dz * fz < 0 ? 1.6 : 1);
    if (k < score) [best, score] = [a, k];
  }
  return best;
}

export const labelText = (it: CatalogItem) => `${it.name} · ${it.colour.name} · [F] Lấy`;

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

export const MARK_TEXT: Record<CqMark, string> = { ok: '✅ đúng', wrong: '❌ sai', extra: '➕ thừa', missing: '⬜ thiếu' };
export interface ResultRow { text: string; mark: CqMark }
/** One row per set position (the set item, or the wrong item of that slot the team took), then the extras: set order, then bag order. */
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
  for (const b of r.bag) if (!used.has(b) && !set.includes(b)) (used.add(b), rows.push({ text: nameOf(b), mark: 'extra' }));
  return rows;
}

/** "47.213 s" after the match start, or "Không hoàn thành". */
export const lockTimeText = (lockedAtMs: number | null, startAt: number) => (lockedAtMs === null ? 'Không hoàn thành' : `${((lockedAtMs - startAt) / 1000).toFixed(3)} s`);

export const WINNER_TEXT = { you: 'ĐỘI BẠN THẮNG!', opp: 'Đội bạn thua', draw: 'HÒA' } as const;
export const REASON_TEXT = {
  completion: 'hoàn thành trước khi hết giờ',
  score: 'điểm cao hơn',
  speed: 'chốt sớm hơn',
  draw: 'cả hai đội xuống cuối hàng chờ, đấu tiếp với đội khác',
} as const;
