// CETIQLO end-to-end against the REAL RaceRoom (`npm run dev:api` on :8787 must be running): a fresh race (cq-test-setup.ts), its own Vite
// dev server (proxying /api to :8787), two headless Chrome pages log in with `?code=…&autoCq=1`, land in the CETIQLO lobby, get paired;
// team A takes the 6 right items, team B 4 right + 1 wrong, both check out; both pages must get `cq.result` (A wins 100 % vs 66 %),
// A sees the next card + the lit exit ring, B is back in the lobby; a third page joins and B is paired with it. Prints timings and
// console errors; exit 1 on any failed check. `npm run cq-e2e [-- --port 8787 --password test1234]` (the dev server: `npm run dev:worker`).
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Page, chromium } from 'playwright-core';
import { createServer } from 'vite';
import { QUICK_LEG, setupRace } from './cq-test-setup.ts';

const { values: v } = parseArgs({ options: { url: { type: 'string' }, port: { type: 'string', default: '8787' }, password: { type: 'string', default: process.env.HOST_PASSWORD ?? 'test1234' }, vitePort: { type: 'string', default: '5375' } } });
const URL_ = v.url ?? `http://localhost:${v.port}`;
const PORT = Number(v.vitePort);
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'OK ' : 'FAIL'} ${at()}  ${what}`); if (!ok) failures.push(what); };
type CqState = { phase: string; matchId: string | null; set: string[]; bag: string[]; locked: boolean; oppLocked: boolean; queuePos?: number; queueLen?: number; result: { winner: string; youPct: number; oppPct: number; reason: string } | null; exitLit: boolean };
const stateOf = (p: Page) => p.evaluate(() => (globalThis as unknown as { __GAME__?: { cq?: () => { state(): unknown } | undefined } }).__GAME__?.cq?.()?.state() ?? null) as Promise<CqState | null>;
const cardOf = (p: Page) => p.evaluate(() => (globalThis as unknown as { __GAME__?: { race?: { view?: { card?: { step: string } | null } | null } } }).__GAME__?.race?.view?.card?.step ?? null);
async function waitFor<T>(p: Page, read: (p: Page) => Promise<T>, pred: (v: T) => boolean, what: string, timeoutMs = 60_000): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const s = await read(p).catch(() => null as T);
    if (s !== null && pred(s)) return s;
    if (Date.now() > end) { check(false, `${what} (hết ${timeoutMs / 1000} s)`); return null; }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
const race = `cqe2e-${stamp}`;
const setup = await setupRace({ url: URL_, race, teams: 3, password: v.password!, leg: QUICK_LEG, client: `http://localhost:${PORT}` });
console.log(`${at()}  race ${setup.race}: ${setup.teams.map((t) => `${t.name} ${t.code}`).join(' · ')}`);
const server = await createServer({ root: join(import.meta.dirname, '../client'), logLevel: 'warn', server: { port: PORT, strictPort: true, proxy: { '/api': { target: URL_, ws: true } } } }); // the client's /api → the chosen dev server
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
try {
  const open = async (i: number) => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 960, height: 540 });
    page.on('pageerror', (e) => void errors.push(`[${setup.teams[i]!.name}] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${setup.teams[i]!.name}] ${m.text().slice(0, 200)}`); });
    await page.goto(setup.urls[i]!.url);
    return page;
  };
  const [A, B] = await Promise.all([open(0), open(1)]);
  const inLobby = (s: CqState | null) => !!s && (s.phase === 'lobby' || s.phase === 'match');
  const sa = await waitFor(A, stateOf, inLobby, 'A trong phòng CETIQLO (sảnh / trận)', 90_000);
  const sb = await waitFor(B, stateOf, inLobby, 'B trong phòng CETIQLO (sảnh / trận)', 90_000);
  check(!!sa && !!sb, `cả hai vào phòng (A ${sa?.phase}, B ${sb?.phase})`);
  const ma = await waitFor(A, stateOf, (s) => !!s && s.phase === 'match' && s.set.length === 6, 'A: trận bắt đầu (cq.state match, set 6 món)');
  const mb = await waitFor(B, stateOf, (s) => !!s && s.phase === 'match' && s.matchId === ma?.matchId, 'B: cùng trận với A');
  check(!!ma && !!mb && ma.set.join() === mb.set.join(), `cùng set: ${ma?.set.join(', ')}`);
  const tookA = await A.evaluate(() => (globalThis as unknown as { __GAME__: { cq(): { takeSet(c: number, w?: number): Promise<string[]> } } }).__GAME__.cq().takeSet(6, 0));
  const tookB = await B.evaluate(() => (globalThis as unknown as { __GAME__: { cq(): { takeSet(c: number, w?: number): Promise<string[]> } } }).__GAME__.cq().takeSet(4, 1));
  const bagA = await waitFor(A, stateOf, (s) => !!s && s.bag.length === 6, 'A: túi 6 món (cq.bag)', 15_000);
  const bagB = await waitFor(B, stateOf, (s) => !!s && s.bag.length === 5, 'B: túi 5 món (cq.bag)', 15_000);
  check(!!bagA && tookA.every((id) => bagA.bag.includes(id)), `A lấy đúng 6: ${tookA.length} gửi, túi ${bagA?.bag.length}`);
  check(!!bagB && tookB.every((id) => bagB.bag.includes(id)), `B lấy 4 đúng + 1 sai: túi ${bagB?.bag.length}`);
  await A.evaluate(() => (globalThis as unknown as { __GAME__: { cq(): { checkout(): void } } }).__GAME__.cq().checkout());
  const la = await waitFor(A, stateOf, (s) => !!s && s.locked, 'A đã chốt (yourLocked)', 10_000);
  const ob = await waitFor(B, stateOf, (s) => !!s && s.oppLocked, 'B thấy đối thủ đã chốt (cq.opp)', 10_000);
  check(!!la && !!ob, 'chốt A → cq.state locked + cq.opp cho B');
  await B.evaluate(() => (globalThis as unknown as { __GAME__: { cq(): { checkout(): void } } }).__GAME__.cq().checkout());
  const ra = await waitFor(A, stateOf, (s) => !!s?.result, 'A nhận cq.result', 15_000);
  const rb = await waitFor(B, stateOf, (s) => !!s?.result, 'B nhận cq.result', 15_000);
  // score = max(0, 100 − 17 × errors), errors = max(6, bag) − correct: A 6/6 → 100; B 5 items, 4 correct → errors 2 → 66
  check(ra?.result?.winner === 'you' && ra.result.youPct === 100 && ra.result.oppPct === 66, `A: thắng, 100 % vs 66 % (có: ${JSON.stringify(ra?.result)})`);
  check(rb?.result?.winner === 'opp' && rb.result.youPct === 66 && rb.result.oppPct === 100 && rb.result.reason === 'score', `B: thua vì điểm (có: ${JSON.stringify(rb?.result)})`);
  const cardA = await waitFor(A, cardOf, (c) => c === 'L2', 'A: thẻ kế L2 (bước xong)', 15_000);
  const exitA = await waitFor(A, stateOf, (s) => !!s?.exitLit, 'A: vòng ra sáng', 15_000);
  check(cardA === 'L2' && !!exitA, 'A: mật thư kế + vòng sáng thoát');
  const lobbyB = await waitFor(B, stateOf, (s) => !!s && s.phase === 'lobby', 'B: về sảnh (cq.state lobby sau resultHoldMs)', 30_000);
  check(!!lobbyB, `B: sảnh, vị trí ${lobbyB?.queuePos} / ${lobbyB?.queueLen}`);
  const C = await open(2);
  const mc = await waitFor(C, stateOf, (s) => !!s && s.phase === 'match', 'C: ghép trận', 90_000);
  const mb2 = await waitFor(B, stateOf, (s) => !!s && s.phase === 'match' && s.matchId !== ma?.matchId, 'B: trận mới với C', 30_000);
  check(!!mc && !!mb2 && mc.matchId === mb2.matchId, `B ↔ C cùng trận ${mb2?.matchId}`);
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) console.log(`Lỗi console (${errors.length}):\n` + [...new Set(errors)].slice(0, 10).join('\n'));
console.log(failures.length ? `THẤT BẠI: ${failures.length} kiểm tra` : `Đạt hết (${at()})`);
process.exit(failures.length ? 1 : 0);
