import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoadGraph, type RoadGraphFile } from '@race/shared/graph';
import { parseLeg, stepZones } from '@race/shared/leg';
import { decodePose, type HostState, type RaceView, type ServerMessage, type Welcome } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { answersOf, type Bot, legArg, legFailed, legRowBudget, playLeg, runSim } from './sim.ts';

// Real workerd + Durable Object (createTestHarness) and real WebSockets: 3 bots walk 30 simulated seconds on the A* road graph.
// speedup 2 (10 msg/s per bot) leaves margin under the server's 15 msg/s socket limit (1 s window) and is the CLI maximum;
// runSim throws when the server closes any bot / Host socket (4429 rate limit, 4408 silent), so a green run means none was.
describe('sim bots (docs/plans/phase6.md §6 D)', () => {
  it('3 bots, 30 s: no errors, counters match what was sent, rejoin lands on the old spot, two claims on one bike give one winner', { timeout: 90_000 }, async () => {
    const r = await runSim({ bots: 3, seconds: 30, speedup: 2, rejoinGapMs: 3000, race: 'sim-test', password: 'test-secret', log: () => {} });
    // every message the sim sent was counted by the Durable Object (±10 %: e.g. a pose in flight to a closing socket)
    expect(r.counters.wsIn).toBeGreaterThan(r.sent * 0.9);
    expect(r.counters.wsIn).toBeLessThan(r.sent * 1.1);
    // 3 bots × 30 s × 5 Hz poses are the bulk of it
    expect(r.sent).toBeGreaterThan(3 * 30 * 5 * 0.9);
    // §9 formula: billable = http + alarms + ⌈wsIn / 20⌉, and the per-bot-minute figure is that / bots / minutes
    expect(r.billableRequests).toBe(r.counters.http + r.counters.alarms + Math.ceil(r.counters.wsIn / 20));
    // docs/plans/phase6.md §9: 20 teams × 5 Hz × 7 200 s ÷ 20 = 36 000 requests when always moving (± 10 %)
    expect(r.extrapolated2h20).toBeGreaterThan(36_000 * 0.9);
    expect(r.extrapolated2h20).toBeLessThan(36_000 * 1.1);
    expect(r.perBotMinute).toBeCloseTo(r.billableRequests / 3 / 0.5, 6);
    expect(r.rejoin).toMatchObject({ ok: true });
    // null = no bike service in this build; once Track C is merged two claims on one bike must give exactly one winner
    expect(r.claim === null || r.claim.ok === 1).toBe(true);
  });

  it('speedup above 2 is refused (the server drops sockets above 15 msg/s)', async () => {
    await expect(runSim({ bots: 1, seconds: 1, speedup: 3, rejoinGapMs: 0, race: 'sim-x', password: 'x', log: () => {} })).rejects.toThrow('speedup');
  });
});

// Phase 7 (docs/plans/phase7.md track E): bots play a whole leg. `mini` is ~2.4 km (≈ 6 min real time at the trusted-point speed), so the
// test squeezes the same steps, branches, answers and Pit Stop onto the Bir-Hakeim bridge from the leg's own start (35 m apart, FAKE
// content as in mini).
const mini = readFileSync(join(import.meta.dirname, '../worker/legs/test/mini.json'), 'utf8');
function compactMini(): string {
  const spots = new Map<string, number>();
  const at = (o: { lat: number; lon: number }) => {
    const k = `${o.lat},${o.lon}`;
    if (!spots.has(k)) spots.set(k, spots.size);
    return spots.get(k)!;
  };
  const leg = JSON.parse(mini);
  const s0 = { lat: leg.start.lat as number, lon: leg.start.lon as number }; // spot 0 = the start, wherever mini.json puts it
  // NW along the bridge from the start: 35 m per spot
  const put = (o: { lat: number; lon: number }, i: number, extra = 0) => ((o.lat = s0.lat + 0.000262 * i + extra), (o.lon = s0.lon - 0.000263 * i + extra));
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown> & { lat?: number; lon?: number };
    if (typeof r.lat === 'number' && typeof r.lon === 'number') {
      const i = at(r as { lat: number; lon: number });
      const parking = r.bikeParking as { lat: number; lon: number } | undefined;
      put(r as { lat: number; lon: number }, i);
      if (parking) put(parking, i, 0.00005);
      return;
    }
    Object.values(r).forEach(walk);
  };
  walk(leg);
  return JSON.stringify(leg);
}
// ponytail: the full-leg test is skipped while worker/src/race/engine.ts is still the foundation stub (no race engine = nothing for the
// bots to play); the integrator merges track A first, after which it runs.
// Phase 8 track A: also skipped while the bot still plays the Phase 7 `race task` op (the server ignores it now; track E
// moves the bot to accept / answer / branch / open{branch} + a Host bot).
const engineReady = !readFileSync(join(import.meta.dirname, '../worker/src/race/engine.ts'), 'utf8').includes('FOUNDATION STUB') && !readFileSync(join(import.meta.dirname, 'sim.ts'), 'utf8').includes("op: 'task'");

/** A minimal stand-in for the race engine (the real one is track A): steps by the plan's table, judged on the last pose sent. */
function fakeEngine(legJson: string) {
  const r = parseLeg(JSON.parse(legJson));
  if (!r.ok) throw new Error('leg');
  const leg = r.leg;
  const zones = stepZones(leg);
  const answers = answersOf(legJson);
  const log: ServerMessage[] = [];
  const ops: string[] = [];
  let step = 0, finished = false, at = { x: 0, z: 0 };
  const view = (): RaceView => ({ status: 'running', startAt: 1, finishAt: finished ? 2 : null, penaltyMinutes: 0, card: { step: leg.steps[step]!.id, type: leg.steps[step]!.type, label: '', text: '', media: [], status: 'active', lockedUntil: null, lockKind: null, answers: [], receivedAt: 0, completedAt: null }, checkinAt: null, officialMs: null });
  const inZone = (z: { x: number; z: number; r: number }) => Math.hypot(at.x - z.x, at.z - z.z) <= z.r;
  const push = () => log.push({ t: 'race', view: view() });
  const advance = () => {
    if (finished) return;
    const st = leg.steps[step]!;
    if (st.type === 'route_info' && leg.steps[step + 1]?.type === 'pit_stop' && inZone(zones[step]!)) step++;
    else if (st.type === 'pit_stop' && inZone(zones[step]!)) finished = true;
    else return;
    push();
    advance();
  };
  const sock = {
    log,
    send(m: unknown) {
      const pose = decodePose(m);
      if (pose) return void ((at = pose), advance());
      const op = m as { op: string; step?: string; branch?: string; answer?: string };
      ops.push(op.op);
      const st = leg.steps[step]!;
      const ok =
        op.op === 'checkin' ? st.type === 'pit_stop' && inZone(zones[step]!)
        : op.step !== st.id || !inZone(zones[step]!) ? false
        : op.op === 'open' ? st.type === 'route_info'
        : (st.type === 'challenge' || (st.type === 'detour' && op.branch !== undefined)) && (op.answer === undefined || [...answers.values()].includes(op.answer));
      if (!ok) return void log.push({ t: 'notice', code: 'boxFar' });
      if (op.op === 'checkin') finished = true;
      else step++;
      push();
      if (!finished) log.push({ t: 'notice', code: 'clueNew' }); // like engine.ts: news, not a refusal
    },
    until: async (pred: (m: ServerMessage) => boolean, _t = 0, from = 0) => {
      for (let k = 0; k < 60; k++) {
        const hit = log.slice(from).find(pred);
        if (hit) return hit;
        await new Promise((res) => setTimeout(res, 5));
      }
      throw new Error('timeout');
    },
  };
  return { leg, sock: sock as never as Bot['s'], ops, state: () => ({ step, finished }) };
}

describe('sim bot against a stand-in engine (no workerd)', () => {
  it('walks the compacted leg step by step: open, task with the right answer, enter the mat, check in', async () => {
    const json = compactMini();
    const eng = fakeEngine(json);
    const graph = RoadGraph.decode(JSON.parse(readFileSync(join(import.meta.dirname, '../shared/data/roadgraph.json'), 'utf8')) as RoadGraphFile);
    const zones = stepZones(eng.leg);
    const legState = {
      id: 'mini', title: '', timezone: 'Asia/Ho_Chi_Minh', start: { x: zones[0]!.x, z: zones[0]!.z }, bundled: [], issues: [], vehicles: eng.leg.vehicles,
      steps: eng.leg.steps.map((s, i) => ({ id: s.id, type: s.type, label: s.label, name: '', x: zones[i]!.x, z: zones[i]!.z, r: zones[i]!.r, proof: false })),
      media: [], penalties: { retryLockMinutes: 3, branchSwitchLockMinutes: 10 }, stuckMinutes: 45,
    } as NonNullable<HostState['leg']>;
    const welcome = { movement: { footSpeed: 400, bikeSpeedMultiplier: 1.3 }, start: { x: legState.start.x, z: legState.start.z, yaw: 0 }, pose: null, view: { card: { step: 'L1' }, finishAt: null } } as unknown as Welcome;
    const refused: string[] = [];
    const t = await playLeg({ i: 0, s: eng.sock, welcome }, legState, answersOf(json), graph, { speedup: 1, deadline: Date.now() + 60_000, refused });
    expect(t).toBe(2);
    expect(eng.state()).toEqual({ step: 5, finished: true });
    expect(eng.ops.filter((o) => o === 'open')).toHaveLength(2); // L1, L2 (L3 is done by entering the mat)
    expect(eng.ops.filter((o) => o === 'task')).toHaveLength(2); // T1, D1
    // organiser review: "Mật thư mới đã vào Sổ mật thư" (clueNew) was printed as a refused op
    expect(eng.sock.log.some((m) => !Array.isArray(m) && m.t === 'notice' && m.code === 'clueNew')).toBe(true);
    expect(refused.filter((r) => r.endsWith('clueNew'))).toEqual([]);
  });
});

describe('sim --leg (Phase 7)', () => {
  it('reads the right answers from the leg file and nothing else', () => {
    const a = answersOf(mini);
    expect(a.get('T1')).toBe('42');
    expect(a.get('D1/A')).toBe('7');
    expect(a.has('D1/B')).toBe(false); // host_approval branch: no answer to send
    expect(a.has('L1')).toBe(false);
  });

  it('--leg <id> finds the test leg file; unknown id says so', () => {
    expect(legArg('mini')).toMatchObject({ id: 'mini' });
    // the id the Host page lists → its file test/paris-demo.filled.json (organiser review: "Không tìm thấy chặng")
    expect(legArg('paris-demo-filled')).toMatchObject({ id: 'paris-demo-filled', file: expect.stringMatching(/worker\/legs\/test\/paris-demo\.filled\.json$/) });
    expect(legArg('paris-demo').file).toMatch(/worker\/legs\/paris-demo\.json$/);
    expect(() => legArg('khong-co')).toThrow('khong-co');
    expect(() => legArg('/khong/co/chang.json')).toThrow('Không tìm thấy file chặng "/khong/co/chang.json"');
  });

  it('CLI: an unknown --leg id or a missing file prints a Vietnamese line + the usage, exit 2, no stack trace (verify3 m7)', () => {
    const root = join(import.meta.dirname, '..');
    for (const leg of ['khong-co', '/khong/co/chang.json']) {
      const r = spawnSync(join(root, 'node_modules/.bin/tsx'), [join(root, 'scripts/sim.ts'), '--leg', leg], { encoding: 'utf8' });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/^Không tìm thấy (chặng|file chặng) "[^\n]+\n\nCách dùng: npm run sim/);
      expect(r.stderr).not.toMatch(/\n\s+at |ENOENT/);
    }
  }, 20_000);

  it('the compacted leg stays a valid leg with the same steps', () => {
    const r = parseLeg(JSON.parse(compactMini()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.leg.steps.map((s) => s.id)).toEqual(['L1', 'T1', 'L2', 'D1', 'L3', 'PS']);
  });

  it.skipIf(!engineReady)('3 bots finish the whole leg: all checked in, ranking has 3 rows, ≤ 110 SQLite rows per team', { timeout: 300_000 }, async () => {
    const r = await runSim({ bots: 3, seconds: 600, speedup: 2, rejoinGapMs: 0, race: 'sim-leg', password: 'test-secret', log: () => {}, leg: { json: compactMini() } });
    expect(r.leg).toMatchObject({ id: 'mini', steps: 6, finished: 3, ranked: 3, rowBudget: 110 });
    // per team = rows written while the race ran minus the shared snapshot / replay rows (they do not grow with the team count)
    expect(r.leg!.sharedRows).toBeGreaterThan(0);
    expect(r.leg!.rowsPerTeam).toBeGreaterThan(10);
    expect(r.leg!.rowsPerTeam! * 3 + r.leg!.sharedRows!).toBeLessThanOrEqual(r.counters.rows);
    expect(r.leg!.rowsPerTeam).toBeLessThanOrEqual(r.leg!.rowBudget);
    expect(legFailed(r)).toBe(false);
  });

  it('a long leg is not reported as LỖI for the shared rows: the budget counts per-team race rows (organiser review)', () => {
    // the organiser's 4-step leg, 2 bots, 826 s at speedup 2: 324 rows = 2 × 40 race rows + 244 snapshot / replay rows (413 s real,
    // one every 2 s + one every 10 s); the old check divided all 324 by 2 → "162 > 110 ← LỖI"
    const leg = { id: 'x', steps: 4, finished: 2, ranked: 2, rowsPerTeam: 40, sharedRows: 244, rowBudget: legRowBudget(4), refused: [] };
    const r = { bots: 2, counters: { wsIn: 0, wsOut: 0, http: 0, alarms: 0, rows: 324 }, leg } as unknown as Parameters<typeof legFailed>[0];
    expect(legFailed(r)).toBe(false);
    expect(legFailed({ ...r, leg: { ...leg, rowsPerTeam: 111 } })).toBe(true);
    expect(legFailed({ ...r, leg: { ...leg, finished: 1 } })).toBe(true);
    expect(legFailed({ ...r, leg: { ...leg, rowsPerTeam: null } })).toBe(false); // --url: not measured, not a failure
    expect([legRowBudget(4), legRowBudget(10), legRowBudget(12)]).toEqual([110, 110, 132]);
  });
});
