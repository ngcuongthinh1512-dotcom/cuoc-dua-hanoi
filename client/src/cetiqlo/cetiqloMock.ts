// DEV offline (main.ts `?roomDemo=cetiqlo`): an in-page CETIQLO server = the worker's REAL service class (worker/src/race/cetiqlo/index.ts
// over match.ts) driven through a fake CqIO (no SQLite, setTimeout for the alarm), + a scripted opponent bot ('Đội Cam') that walks to
// 4 items (2 of the set, 2 wrong) over ~60 s, takes them and checks out — so one browser tab plays a whole match. The bot's body is
// a RemotePlayers tick (`tick()`), its team a TeamInfo (`botTeam`). `?roomState=` scripts the HUD states for the p11-room-cetiqlo*
// presets (see CQ_DEMO_STATES). Flip to the real server: main.ts uses cetiqloNet.ts `netLink(net)` instead of this file.
import type { TeamInfo, TickEntry } from '@race/shared/protocol';
import { CATALOG, ITEM_BY_ID, STORE } from '@race/shared/cetiqlo';
import { CETIQLO, CHECKOUT_ZONE } from '../../../worker/src/race/cetiqlo/config.ts';
import { Cetiqlo, type CqIO } from '../../../worker/src/race/cetiqlo/index.ts';
import type { Cfg } from '../../../worker/src/race/cetiqlo/match.ts';
import type { CqLink } from './cetiqloNet.ts';

export const CQ_DEMO_STATES = ['match', 'lobby', 'bag', 'label', 'warn', 'checkout', 'result-win', 'result-lose', 'result-draw', 'timeout', 'board', 'countdown', 'reading'] as const;
export type CqDemoState = (typeof CQ_DEMO_STATES)[number];

const YOU = 'you', BOT = 'bot';
const BOT_SPEED = 2.6; // m/s, straight lines (the mock walks through fixtures)
/** `?roomState=board`: nine more teams (no bodies) fill the waiting room to 11 so the LIVE BOARD is seen full: the first pair plays a 3 s match
 *  (one wins and leaves = "đã đi", the loser goes offline and stays "đã thua · chờ lượt"), then the next pair plays a normal 3:30 match. */
const EXTRAS = [['Đội Đỏ', '#d8342c'], ['Đội Xanh', '#2f6fde'], ['Đội Vàng', '#e2b43a'], ['Đội Lục', '#2e9e5b'], ['Đội Tím', '#8e5bd6'], ['Đội Hồng', '#e2679a'], ['Đội Nâu', '#8a5a2b'], ['Đội Xám', '#7a8290'], ['Đội Trắng', '#e8e8e8']] as const;

export interface CqMock {
  link: CqLink;
  botTeam: TeamInfo;
  /** Every mock team (the bot + the board state's extras): main.ts hands them to the room / RemotePlayers for names + colours. */
  teams: TeamInfo[];
  /** The bot's pose for RemotePlayers at `ms` (the tick clock); `toWorld` maps room-local metres (the frame's). */
  tick(ms: number): TickEntry[];
  /** The team won: the step completes (main.ts shows the next card). */
  onAdvance?: () => void;
  dispose(): void;
}

export function createCqMock(you: { slot: number; name: string }, state: CqDemoState, toWorld: (lx: number, ly: number, lz: number) => { x: number; y: number; z: number }): CqMock {
  const oppSlot = you.slot === 5 ? 6 : 5;
  const botTeam: TeamInfo = { slot: oppSlot, id: BOT, name: 'Đội Cam', colour: '#f07f1d', online: true, avatar: 1 };
  const slots = [you.slot, oppSlot];
  const extras: TeamInfo[] = state === 'board' ? EXTRAS.map(([name, colour], i) => { let s = 1; while (slots.includes(s)) s++; slots.push(s); return { slot: s, id: `e${i + 1}`, name, colour, online: true, avatar: (i % 2) as 0 | 1 }; }) : [];
  const teams = [botTeam, ...extras];
  const who = (t: string) => (t === YOU ? { slot: you.slot, name: you.name } : { slot: teams.find((x) => x.id === t)?.slot ?? oppSlot, name: teams.find((x) => x.id === t)?.name ?? botTeam.name });
  const cfg: { -readonly [K in keyof Cfg]: number } = { ...CETIQLO, pickMs: state === 'warn' ? 27_000 : state === 'result-draw' ? 4_000 : state === 'board' ? 3_000 : CETIQLO.pickMs, resultHoldMs: state === 'board' ? 2_000 : 6_000, readMs: state === 'reading' ? 3_600_000 : state === 'match' ? CETIQLO.readMs : 0, countdownMs: state === 'countdown' ? 3_600_000 : state === 'board' ? 0 : CETIQLO.countdownMs }; // 'countdown' holds the 5-4-3-2-1 (the number stays huge); 'board' skips it for its quick first match
  const offline = new Set<string>(); // board state: the first loser stays offline (never paired again) so a "đã thua · chờ lượt" row stays on the board
  const seen = { state: false, match: false, bag: 0, locked: false, result: false, botMoved: false, advance: false, boardLost: false };
  /** The scripted state is on screen (screenshots wait for it). */
  const ready = () => state === 'lobby' ? seen.state : state === 'board' ? seen.boardLost : state === 'countdown' || state === 'reading' ? seen.match : state === 'timeout' ? seen.advance : state.startsWith('result') ? seen.result : state === 'checkout' ? seen.locked : state === 'bag' ? seen.bag >= 3 : state === 'warn' ? seen.match : seen.match && seen.botMoved;
  const link: CqLink = { send: (m) => receive(m), onMessage: null, serverNow: () => Date.now(), ready };
  let alarm: ReturnType<typeof setTimeout> | undefined;
  let set: string[] = [];
  let startAt = 0;
  // the bot: in the lobby, then its script (targets → checkout), then back to the lobby
  const bot = { x: 3, y: 0, z: 24, yaw: 0, floor: 1 as 1 | 2, targets: [] as { x: number; z: number; floor: 1 | 2; id: string | null; at: number }[], i: 0, wait: 0, done: true, lastMs: NaN };
  const io: CqIO = {
    load: () => undefined,
    save: () => {},
    online: (t) => !offline.has(t),
    who,
    stepOf: () => 'T1',
    win: () => {},
    release: () => {},
    event: () => {},
    watch: () => undefined, setAlarm: (at) => { clearTimeout(alarm); alarm = setTimeout(() => cq.tick(Date.now()), Math.max(0, at - Date.now()) + 5); },
    send: (team, m) => {
      if (team === YOU) {
        if (m.t === 'cq.state' && m.startSpot && state === 'label') m = { ...m, startSpot: { x: -8.3, z: 8.4, yaw: 0 } }; // beside the tees table, facing it
        if (m.t === 'cq.advance') (seen.advance = true), onAdvance();
        seen.state ||= m.t === 'cq.state';
        if (m.t === 'cq.state' && m.phase === 'match') (seen.match = true), (seen.locked ||= !!m.match?.yourLocked), (seen.bag = Math.max(seen.bag, m.match?.yourBag.length ?? 0));
        if (m.t === 'cq.bag') seen.bag = Math.max(seen.bag, m.bag.length);
        if (m.t === 'cq.result' && state === 'timeout') { const id = m.matchId; setTimeout(() => io.send(YOU, { t: 'cq.advance', matchId: id, reason: 'timeout' }), cfg.resultHoldMs + 1500); } // the loser waited "10 minutes" (demo: right after the hold)
        seen.result ||= m.t === 'cq.result';
        if (m.t === 'cq.board') seen.boardLost ||= m.rows.length >= 11 && m.rows.some((r) => r.status === 'lost');
        link.onMessage?.(m);
      } else if (state === 'board') {
        if (m.t === 'cq.state' && m.phase === 'match' && m.match && team === 'e1' && !offline.size) { // e1 takes the whole set and checks out: it wins the 3 s match and leaves ("đã đi")
          let t = Date.now() + 200;
          for (const id of m.match.set) { const it = ITEM_BY_ID.get(id)!; cq.take(team, id, it.shelf.x, it.shelf.z, (t += 150)); }
          cq.checkout(team, CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, (t += 150));
        }
        if (m.t === 'cq.result' && m.winner === 'opp' && !offline.size) { offline.add(team); cfg.pickMs = CETIQLO.pickMs; } // the first loser stays "chờ lượt" (offline: never paired); the next matches run the real 3:30
        if (m.t === 'cq.state' && m.phase === 'match' && m.match && team === BOT) plan(m.match.set, m.match.startAt);
      } else if (m.t === 'cq.state' && m.phase === 'match' && m.match) plan(m.match.set, m.match.startAt);
    },
  };
  const cq = new Cetiqlo(io, () => CATALOG, cfg);
  const onAdvance = () => mock.onAdvance?.();

  /** The bot's shopping list once a match starts: the set's top + bottom, a wrong colour of the set's outer, a random bag; ~12 s apart. */
  function plan(s: string[], at: number) {
    if (startAt === at) return;
    set = s; startAt = at;
    const wrongOf = (id: string) => CATALOG.find((i) => i.family === ITEM_BY_ID.get(id)!.family && i.id !== id) ?? ITEM_BY_ID.get(id)!;
    const list = [ITEM_BY_ID.get(s[0]!)!, ITEM_BY_ID.get(s[2]!)!, wrongOf(s[1]!), CATALOG.find((i) => i.slot === 'bag' && i.id !== s[4])!];
    bot.targets = list.map((it, k) => ({ x: it.shelf.x, z: it.shelf.z, floor: it.floor, id: it.id, at: at + 6_000 + k * 12_000 }));
    bot.targets.push({ x: STORE.checkout.x, z: STORE.checkout.z, floor: 1, id: null, at: at + 60_000 });
    bot.i = 0; bot.done = false;
    if (state === 'warn' || state === 'result-win' || state === 'result-lose' || state === 'timeout') scriptedEnd(at);
  }
  /** Scripted endings for the presets: the bot (and the team) act at once so the HUD state is on screen within a second. */
  function scriptedEnd(at: number) {
    let t = at + 200;
    const take = (team: string, id: string) => { const it = ITEM_BY_ID.get(id)!; cq.take(team, id, it.shelf.x, it.shelf.z, (t += 150)); };
    const checkoutNow = (team: string) => cq.checkout(team, CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, (t += 150));
    const botBag = state === 'result-lose' || state === 'timeout' ? set : set.slice(0, 4);
    for (const id of botBag) take(BOT, id);
    checkoutNow(BOT);
    bot.targets = []; bot.done = true;
    if (state === 'result-win') { for (const id of set) take(YOU, id); checkoutNow(YOU); }
    if (state === 'result-lose' || state === 'timeout') { for (const id of set.slice(0, 3)) take(YOU, id); take(YOU, CATALOG.find((i) => i.slot === 'acc' && i.id !== set[5])!.id); checkoutNow(YOU); }
  }
  function receive(m: Parameters<CqLink['send']>[0]) {
    const now = Date.now();
    switch (m.t) {
      case 'cq.join': {
        if (state === 'board') { // 11 teams in arrival order: e1 ↔ e2 play (3 s), e3…e7 wait, the bot, you (9th), e8, e9
          const order = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', BOT, YOU, 'e8', 'e9'];
          order.forEach((t, i) => setTimeout(() => cq.join(t, Date.now()), 150 * i));
          return;
        }
        cq.join(YOU, now);
        if (state !== 'lobby') setTimeout(() => { cq.join(BOT, Date.now()); afterStart(); }, 1200);
        return;
      }
      case 'cq.leave': return cq.leave(YOU, now);
      case 'cq.take': return cq.take(YOU, m.id, m.x, m.z, now);
      case 'cq.drop': return cq.drop(YOU, m.id, now);
      case 'cq.checkout': return cq.checkout(YOU, m.x, m.z, now);
    }
  }
  /** Right after the pairing: the team's scripted bag / checkout / draw bags. */
  function afterStart() {
    let t = Date.now() + cfg.readMs + cfg.countdownMs + 300; // after the 5-4-3-2-1 (takes before startAt are refused)
    const take = (team: string, id: string) => { const it = ITEM_BY_ID.get(id)!; setTimeout(() => cq.take(team, id, it.shelf.x, it.shelf.z, Date.now()), (t += 160) - Date.now()); };
    if (state === 'bag' || state === 'checkout') for (const id of [set[0]!, set[3]!, CATALOG.find((i) => i.family === ITEM_BY_ID.get(set[1]!)!.family && i.id !== set[1])!.id]) take(YOU, id);
    if (state === 'checkout') setTimeout(() => cq.checkout(YOU, CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, Date.now()), cfg.readMs + cfg.countdownMs + 1500);
    if (state === 'result-draw') for (const team of [YOU, BOT]) for (const id of set.slice(0, 3)) take(team, id); // nobody checks out, same bag → time up → draw
  }

  const mock: CqMock = {
    link, botTeam, teams,
    tick(ms) {
      const dt = Number.isNaN(bot.lastMs) ? 0 : Math.min(0.5, (ms - bot.lastMs) / 1000);
      bot.lastMs = ms;
      const now = Date.now();
      let target: { x: number; z: number; floor: 1 | 2 } = { x: 3, z: 24, floor: 1 }; // the forecourt (the waiting area outside the shop)
      let moving = false;
      if (!bot.done) {
        const tg = bot.targets[bot.i];
        if (tg) {
          target = tg;
          const d = Math.hypot(tg.x - bot.x, tg.z - bot.z);
          if (d > 0.6) moving = true;
          else if (now >= tg.at) { // arrived and due: act, next target
            if (tg.id) cq.take(BOT, tg.id, bot.x, bot.z, now);
            else { cq.checkout(BOT, bot.x, bot.z, now); bot.done = true; }
            bot.i++;
          }
        } else bot.done = true;
      }
      if (moving || (bot.done && Math.hypot(target.x - bot.x, target.z - bot.z) > 0.6)) {
        const dx = target.x - bot.x, dz = target.z - bot.z, d = Math.hypot(dx, dz), step = Math.min(d, BOT_SPEED * dt);
        bot.x += (dx / d) * step; bot.z += (dz / d) * step;
        bot.yaw = Math.atan2(-dx, -dz);
        moving = true;
        seen.botMoved ||= step > 0 && Math.hypot(bot.x - 3, bot.z - 24) > 3;
      }
      const wantY = target.floor === 2 ? STORE.floor2Y : 0;
      bot.y += Math.sign(wantY - bot.y) * Math.min(Math.abs(wantY - bot.y), 1.2 * dt);
      const p = toWorld(bot.x, bot.y, bot.z);
      return [{ slot: oppSlot, pose: { x: p.x, y: p.y, z: p.z, yaw: bot.yaw, mode: 'walk', action: 'none' } }];
    },
    dispose() { clearTimeout(alarm); link.onMessage = null; },
  };
  return mock;
}
