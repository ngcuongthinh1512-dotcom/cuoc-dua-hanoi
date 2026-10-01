import { describe, expect, it } from 'vitest';
import { runSim } from './sim.ts';

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
