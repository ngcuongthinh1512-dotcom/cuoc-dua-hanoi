// DEV offline (main.ts `?roomDemo=cetiqlo`): an in-page CETIQLO server = the worker's REAL service class (worker/src/race/cetiqlo/index.ts
// over match.ts) driven through a fake CqIO (no SQLite, setTimeout for the alarm), + a scripted opponent bot ('Đội Cam') that walks to
// 4 items (2 of the set, 2 wrong) over ~60 s, takes them and checks out — so one browser tab plays a whole match. The bot's body is
// a RemotePlayers tick (`tick()`), its team a TeamInfo (`botTeam`). `?roomState=` scripts the HUD states for the p11-room-cetiqlo*
// presets (see CQ_DEMO_STATES). Flip to the real server: main.ts uses cetiqloNet.ts `netLink(net)` instead of this file.
import type { TeamInfo, TickEntry } from '@race/shared/protocol';
import { CATALOG, ITEM_BY_ID, STORE } from '@race/shared/cetiqlo';
import { CETIQLO, CHECKOUT_ZONE } from '../../../worker/src/race/cetiqlo/config.ts';
import { Cetiqlo, type CqIO } from '../../../worker/src/race/cetiqlo/index.ts';
import type { CqLink } from './cetiqloNet.ts';

export const CQ_DEMO_STATES = ['match', 'lobby', 'bag', 'label', 'warn', 'checkout', 'result-win', 'result-lose', 'result-draw'] as const;
export type CqDemoState = (typeof CQ_DEMO_STATES)[number];

const YOU = 'you', BOT = 'bot';
const BOT_SPEED = 2.6; // m/s, straight lines (the mock walks through fixtures)

export interface CqMock {
  link: CqLink;
  botTeam: TeamInfo;
  /** The bot's pose for RemotePlayers at `ms` (the tick clock); `toWorld` maps room-local metres (the frame's). */
  tick(ms: number): TickEntry[];
  /** The team won: the step completes (main.ts shows the next card). */
  onAdvance?: () => void;
  dispose(): void;
}

export function createCqMock(you: { slot: number; name: string }, state: CqDemoState, toWorld: (lx: number, ly: number, lz: number) => { x: number; y: number; z: number }): CqMock {
  const oppSlot = you.slot === 5 ? 6 : 5;
  const botTeam: TeamInfo = { slot: oppSlot, id: BOT, name: 'Đội Cam', colour: '#f07f1d', online: true, avatar: 1 };
  const who = (t: string) => (t === YOU ? { slot: you.slot, name: you.name } : { slot: oppSlot, name: botTeam.name });
  // ponytail: the worker's Cfg is `as const` (literal numbers), so a demo override needs the cast; ask the server agent for `Cfg` with plain numbers
  const cfg = { ...CETIQLO, pickMs: state === 'warn' ? 27_000 : state === 'result-draw' ? 4_000 : CETIQLO.pickMs, resultHoldMs: 6_000 } as unknown as typeof CETIQLO;
  const seen = { state: false, match: false, bag: 0, locked: false, result: false, botMoved: false };
  /** The scripted state is on screen (screenshots wait for it). */
  const ready = () => state === 'lobby' ? seen.state : state.startsWith('result') ? seen.result : state === 'checkout' ? seen.locked : state === 'bag' ? seen.bag >= 3 : state === 'warn' ? seen.match : seen.match && seen.botMoved;
  const link: CqLink = { send: (m) => receive(m), onMessage: null, serverNow: () => Date.now(), ready };
  let alarm: ReturnType<typeof setTimeout> | undefined;
  let set: string[] = [];
  let startAt = 0;
  // the bot: in the lobby, then its script (targets → checkout), then back to the lobby
  const bot = { x: 3, y: 0, z: 13, yaw: 0, floor: 1 as 1 | 2, targets: [] as { x: number; z: number; floor: 1 | 2; id: string | null; at: number }[], i: 0, wait: 0, done: true, lastMs: NaN };
  const io: CqIO = {
    load: () => undefined,
    save: () => {},
    online: () => true,
    who,
    stepOf: () => 'T1',
    win: () => {},
    event: () => {},
    setAlarm: (at) => { clearTimeout(alarm); alarm = setTimeout(() => cq.tick(Date.now()), Math.max(0, at - Date.now()) + 5); },
    send: (team, m) => {
      if (team === YOU) {
        if (m.t === 'cq.state' && m.startSpot && state === 'label') m = { ...m, startSpot: { x: -8.3, z: 8.4, yaw: 0 } }; // beside the tees table, facing it
        if (m.t === 'cq.advance') onAdvance();
        seen.state ||= m.t === 'cq.state';
        if (m.t === 'cq.state' && m.phase === 'match') (seen.match = true), (seen.locked ||= !!m.match?.yourLocked), (seen.bag = Math.max(seen.bag, m.match?.yourBag.length ?? 0));
        if (m.t === 'cq.bag') seen.bag = Math.max(seen.bag, m.bag.length);
        seen.result ||= m.t === 'cq.result';
        link.onMessage?.(m);
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
    if (state === 'warn' || state === 'result-win' || state === 'result-lose') scriptedEnd(at);
  }
  /** Scripted endings for the presets: the bot (and the team) act at once so the HUD state is on screen within a second. */
  function scriptedEnd(at: number) {
    let t = at + 200;
    const take = (team: string, id: string) => { const it = ITEM_BY_ID.get(id)!; cq.take(team, id, it.shelf.x, it.shelf.z, (t += 150)); };
    const checkoutNow = (team: string) => cq.checkout(team, CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, (t += 150));
    const botBag = state === 'result-lose' ? set : set.slice(0, 4);
    for (const id of botBag) take(BOT, id);
    checkoutNow(BOT);
    bot.targets = []; bot.done = true;
    if (state === 'result-win') { for (const id of set) take(YOU, id); checkoutNow(YOU); }
    if (state === 'result-lose') { for (const id of set.slice(0, 3)) take(YOU, id); take(YOU, CATALOG.find((i) => i.slot === 'acc' && i.id !== set[5])!.id); checkoutNow(YOU); }
  }
  function receive(m: Parameters<CqLink['send']>[0]) {
    const now = Date.now();
    switch (m.t) {
      case 'cq.join': {
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
    let t = Date.now() + 300;
    const take = (team: string, id: string) => { const it = ITEM_BY_ID.get(id)!; setTimeout(() => cq.take(team, id, it.shelf.x, it.shelf.z, Date.now()), (t += 160) - Date.now()); };
    if (state === 'bag' || state === 'checkout') for (const id of [set[0]!, set[3]!, CATALOG.find((i) => i.family === ITEM_BY_ID.get(set[1]!)!.family && i.id !== set[1])!.id]) take(YOU, id);
    if (state === 'checkout') setTimeout(() => cq.checkout(YOU, CHECKOUT_ZONE.x, CHECKOUT_ZONE.z, Date.now()), 1500);
    if (state === 'result-draw') for (const team of [YOU, BOT]) for (const id of set.slice(0, 3)) take(team, id); // nobody checks out, same bag → time up → draw
  }

  const mock: CqMock = {
    link, botTeam,
    tick(ms) {
      const dt = Number.isNaN(bot.lastMs) ? 0 : Math.min(0.5, (ms - bot.lastMs) / 1000);
      bot.lastMs = ms;
      const now = Date.now();
      let target: { x: number; z: number; floor: 1 | 2 } = { x: 3, z: 13, floor: 1 };
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
        seen.botMoved ||= step > 0 && Math.hypot(bot.x - 3, bot.z - 13) > 3;
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
