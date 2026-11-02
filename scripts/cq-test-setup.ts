// CETIQLO quick test (docs/plans/cetiqlo.md "Chạy thử CETIQLO"): against a RUNNING dev server (`npm run dev:api`, :8787) act as the Host over
// the WebSocket (sim.ts's login / socket helpers): load the quick leg (the start point IS the L1 box, so every team already stands at
// it), create the teams, start the race, print the ready-to-click URLs (`?race=…&code=…&autoCq=1`: the client logs in by itself and goes
// straight into the CETIQLO room). Idempotent: a race still in the lobby is reused (missing teams added); a race already started
// cannot take a leg again (host.leg is lobby-only), so a fresh id `<race>-<HHMMSS>` is used and printed instead.
//   npm run cq-test -- [--race cq] [--teams 3] [--port 8787 | --url http://host:port] [--client http://localhost:5174] [--password test1234] [--leg file]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { HostState, ServerMessage, Welcome } from '@race/shared/protocol';
import { openSocket, post } from './sim.ts';

type Msg = Exclude<ServerMessage, number[]>;
const isState = (m: Msg): m is HostState => m.t === 'host.state';
const isWelcome = (m: Msg): m is Welcome => m.t === 'welcome';
/** Names + shirt colours in the Host page's order (client/src/config.ts hostPage.colours). */
export const TEAM_NAMES = ['Đội Đỏ', 'Đội Xanh', 'Đội Vàng', 'Đội Lục', 'Đội Tím', 'Đội Cam', 'Đội Ngọc', 'Đội Hồng'];
const COLOURS = ['#d8342c', '#2c6bd8', '#e0b020', '#2c9a4a', '#8a3fc4', '#e07a20', '#20a8b8', '#c0408a'];
export const QUICK_LEG = join(import.meta.dirname, '../worker/legs/test/cetiqlo-quick.json');

export interface SetupOptions { url: string; race: string; teams: number; password: string; leg: string; client?: string }
export interface Setup { race: string; hostToken: string; teams: { name: string; code: string; slot: number; colour: string }[]; hostUrl: string; urls: { name: string; url: string }[]; fresh: boolean }

export async function setupRace(o: SetupOptions): Promise<Setup> {
  const base = o.url.replace(/\/$/, ''), client = (o.client ?? o.url).replace(/\/$/, '');
  const stats = { sent: 0, up: 0, down: 0 };
  const login = await post(base, { race: o.race, host: o.password });
  if (!login.ok) throw new Error(`Đăng nhập Host thất bại (${login.error}): kiểm tra HOST_PASSWORD của worker/.dev.vars và máy chủ ${base}`);
  const hs = await openSocket(base, o.race, login.token!, stats);
  try {
    await hs.until(isWelcome);
    hs.send({ t: 'host.createTeams', teams: [] }); // the cheapest way to get a host.state back (sim.ts does the same)
    let state = await hs.until(isState);
    if (state.status !== 'lobby') { // started / finished: a leg cannot be loaded any more → a fresh race id
      const d = new Date(), stamp = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');
      hs.close();
      const fresh = await setupRace({ ...o, race: `${o.race.replace(/-\d{6}$/, '')}-${stamp}` });
      return { ...fresh, fresh: true };
    }
    const json = readFileSync(o.leg, 'utf8'), legId = (JSON.parse(json) as { id: string }).id;
    if (state.leg?.id !== legId) {
      const mark = hs.log.length;
      hs.send({ t: 'host.leg', json });
      const res = await hs.until((m): m is Extract<Msg, { t: 'host.legResult' }> => m.t === 'host.legResult', 10_000, mark);
      if (!res.ok) throw new Error('Nạp chặng thất bại: ' + res.issues.filter((i) => i.level === 'error').map((i) => `${i.where}: ${i.message}`).join('; '));
    }
    const want = TEAM_NAMES.slice(0, Math.max(2, o.teams));
    const missing = want.filter((n) => !state.teams.some((t) => t.name === n));
    if (missing.length) {
      const mark = hs.log.length;
      hs.send({ t: 'host.createTeams', teams: missing.map((name) => ({ name, colour: COLOURS[TEAM_NAMES.indexOf(name)]!, player: `Người chơi ${name.slice(4)}` })) });
      state = await hs.until((m): m is HostState => isState(m) && want.every((n) => m.teams.some((t) => t.name === n)), 10_000, mark);
    }
    const mark = hs.log.length;
    hs.send({ t: 'host.race', op: 'start' });
    await hs.until((m): m is HostState => isState(m) && m.status === 'running', 10_000, mark).catch(() => null);
    const teams = want.map((name) => { const t = state.teams.find((x) => x.name === name)!; return { name, code: t.code, slot: t.slot, colour: t.colour }; });
    return {
      race: o.race, hostToken: login.token!, teams, fresh: false,
      hostUrl: `${client}/host.html?race=${encodeURIComponent(o.race)}`,
      urls: teams.map((t) => ({ name: t.name, url: `${client}/?race=${encodeURIComponent(o.race)}&code=${t.code}&autoCq=1` })),
    };
  } finally {
    hs.close();
  }
}

if (process.argv[1] && /cq-test-setup\.ts$/.test(process.argv[1])) {
  const { values: v } = parseArgs({ options: { race: { type: 'string', default: 'cq' }, teams: { type: 'string', default: '3' }, url: { type: 'string' }, port: { type: 'string', default: '8787' }, client: { type: 'string' }, password: { type: 'string', default: process.env.HOST_PASSWORD ?? 'test1234' }, leg: { type: 'string', default: QUICK_LEG } } });
  const s = await setupRace({ url: v.url ?? `http://localhost:${v.port}`, race: v.race!, teams: Number(v.teams), password: v.password!, leg: v.leg!, client: v.client });
  if (s.fresh) console.log(`Cuộc đua "${v.race}" đã chạy rồi (không nạp lại chặng được) → dùng mã mới: ${s.race}`);
  console.log(`Cuộc đua ${s.race} đang chạy, ${s.teams.length} đội, chặng ${QUICK_LEG === v.leg ? 'cetiqlo-quick' : v.leg} (đứng sẵn ở hòm L1).`);
  console.log(`Host:   ${s.hostUrl}`);
  for (const u of s.urls) console.log(`${u.name.padEnd(9)} ${u.url}`);
  console.log('(Trang ở :8787 là bản đã build: `npm run build` trước nếu client vừa đổi; hoặc `npm run dev` rồi dùng --client http://localhost:5174.)');
}
