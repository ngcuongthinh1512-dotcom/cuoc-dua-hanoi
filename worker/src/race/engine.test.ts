// RaceEngine with a fake RaceIO that logs the order of calls (docs/plans/phase7.md track A: replaces the "SQLite before
// the race message" harness check, which the DO output gate makes unable to fail): rows first, messages after; a failing
// write sends nothing and leaves the cache as it was.
import { branchZone, stepZones, type Leg } from '@race/shared/leg';
import { NET, type HostReview, type PoseSample, type RaceOp, type RaceView, type ServerMessage } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import cqLegRaw from '../../legs/test/cetiqlo.json';
import { QuotaCounters } from '../counters.ts';
import { bundledLeg } from './leg.ts';
import { NEW_TEAM_RACE, RaceEngine, type TeamRace } from './engine.ts';

const mini = bundledLeg('mini')!;
const Z = stepZones(mini);

function fake() {
  const log: string[] = [];
  /** [first, end) log indexes of each transaction. */
  const txs: [number, number][] = [];
  const sent: [string, ServerMessage][] = [];
  const events: [string, unknown][] = [];
  const teams = new Map<string, TeamRace>([['t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1 }]]);
  const meta = new Map<string, string>();
  let fail = false;
  const sql = {
    exec(q: string, ...args: unknown[]) {
      if (fail && !q.startsWith('SELECT')) throw new Error('disk');
      log.push(`sql ${q.trim().split(/\s+/).slice(0, 3).join(' ')}`);
      if (q.startsWith('INSERT INTO meta')) meta.set(String(args[0]), String(args[1]));
      const rows = q.startsWith('SELECT value FROM meta') ? (meta.has(String(args[0])) ? [{ value: meta.get(String(args[0])) }] : []) : [];
      return { toArray: () => rows, rowsWritten: 1 };
    },
  } as unknown as SqlStorage;
  const poses = new Map<string, PoseSample>();
  const parks: unknown[] = [];
  const io = {
    sql, counters: new QuotaCounters(),
    transaction: <T,>(fn: () => T) => {
      const start = log.length;
      const r = fn();
      txs.push([start, log.length]);
      return r;
    },
    send: (team: string, m: ServerMessage) => (log.push(`send ${(m as { t: string }).t}`), sent.push([team, m])),
    changed: () => {},
    event: (_t: number, _team: string | null, type: string, data?: unknown) => {
      if (fail) throw new Error('disk');
      log.push(`event ${type}`);
      events.push([type, data]);
    },
    team: (id: string) => teams.get(id),
    saveTeam: (id: string, r: TeamRace) => {
      if (fail) throw new Error('disk');
      log.push('saveTeam');
      teams.set(id, r);
    },
    teamIds: () => [...teams.keys()],
    slot: (id: string) => [...teams.keys()].indexOf(id),
    name: (id: string) => `Đội ${id}`,
    online: () => [...teams.keys()],
    pose: (id: string) => poses.get(id) ?? null,
    park: (_t: string, _r: string, _n: number, box: unknown) => (log.push('park'), parks.push(box)),
    legLoaded: () => {},
    hideBox: (team: string, step: string, branch: string) => log.push(`hideBox ${team} ${step} ${branch}`),
  };
  return { io, log, txs, sent, teams, events, poses, parks, setFail: (v: boolean) => (fail = v) };
}

const at = (i: number, mode: PoseSample['mode'] = 'walk'): PoseSample => ({ x: Z[i]!.x, y: 0, z: Z[i]!.z, yaw: 0, mode, action: 'none' });

describe('RaceEngine', () => {
  it('writes the rows of a transition before it sends anything', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE }); // no team entered yet: the leg may be loaded
    const e = new RaceEngine(f.io);
    const replies: ServerMessage[] = [];
    e.onHost({ t: 'host.leg', id: 'mini' }, (m) => replies.push(m), 0);
    expect(replies).toEqual([{ t: 'host.legResult', ok: true, issues: [] }]);
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1 });
    e.onHost({ t: 'host.race', op: 'start' }, (m) => replies.push(m), 1);
    f.log.length = 0;
    f.sent.length = 0;
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0), 10);
    const firstSend = f.log.findIndex((l) => l.startsWith('send'));
    expect(f.log.slice(0, firstSend)).toEqual(['sql INSERT INTO step_progress', 'sql INSERT INTO step_progress', 'event arrive', 'event complete', 'saveTeam']);
    expect(f.log.slice(firstSend).every((l) => l.startsWith('send'))).toBe(true);
    expect(f.sent.map(([, m]) => m)).toEqual([
      { t: 'box', op: 'reveal', box: expect.objectContaining({ step: 'L1', opened: true }) }, // D5: opened at once
      { t: 'notice', code: 'clueNew' },
      { t: 'race', view: expect.objectContaining({ status: 'running', card: expect.objectContaining({ step: 'T1', receivedAt: 10 }) }) },
    ]);
    expect(f.teams.get('t0')!.step).toBe(1);
  });

  it('a failing write sends nothing and leaves the cache as it was', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    e.onHost({ t: 'host.leg', id: 'mini' }, () => {}, 0);
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1 });
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 1);
    const before = JSON.stringify(e.hostView(5));
    f.sent.length = 0;
    f.setFail(true);
    expect(() => e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0), 10)).toThrow('disk');
    expect(f.sent).toEqual([]);
    expect(JSON.stringify(e.hostView(5))).toBe(before);
    f.setFail(false);
    e.onOp('t0', { t: 'race', op: 'book' }, at(0), 11);
    expect(f.sent).toEqual([['t0', { t: 'book', cards: [expect.objectContaining({ step: 'L1', status: 'active', receivedAt: 1 })] }]]);
  });

  it('refused ops write nothing; status gates ops but not arrivals (D9)', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    e.onHost({ t: 'host.leg', id: 'mini' }, () => {}, 0);
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1 });
    f.log.length = 0;
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0), 10);
    e.onOp('t0', { t: 'race', op: 'checkin' }, at(0), 10); // periodic mat check-in: silent outside running
    expect(f.log).toEqual(['send notice']);
    expect(f.sent.at(-1)).toEqual(['t0', { t: 'notice', code: 'raceNotOpen' }]);
    e.onPose('t0', at(0), 20); // lobby: the arrival is still recorded
    expect(f.log.filter((l) => !l.startsWith('send'))).toEqual(['sql INSERT INTO step_progress', 'event arrive']);
    const r: ServerMessage[] = [];
    e.onHost({ t: 'host.race', op: 'resume' }, (m) => r.push(m), 30);
    e.onHost({ t: 'host.leg', id: 'hanoi-demo' }, (m) => r.push(m), 30);
    expect(r).toEqual([{ t: 'host.notice', level: 'error', message: expect.stringContaining('tạm dừng') }, { t: 'host.legResult', ok: false, issues: [expect.objectContaining({ message: expect.stringContaining('race id mới') })] }]);
    f.log.length = 0;
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0, 'bike'), 40);
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 41);
    f.log.length = 0;
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0, 'bike'), 42);
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(2), 42);
    expect(f.log).toEqual(['send notice', 'send notice']);
    expect(f.sent.slice(-2).map(([, m]) => m)).toEqual([{ t: 'notice', code: 'boxRiding' }, { t: 'notice', code: 'boxFar' }]);
  });

  // ── Phase 8 (docs/plans/phase8.md §6 Track A: pure RaceEngine with a fake RaceIO) ──
  /** mini loaded, running, `teams` entered (t0, t1 at the given steps). */
  function racing(steps: Record<string, number> = { t0: 1 }, leg: unknown = 'mini') {
    const f = fake();
    f.teams.clear();
    for (const id of Object.keys(steps)) f.teams.set(id, { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    const r: ServerMessage[] = [];
    e.onHost(typeof leg === 'string' ? { t: 'host.leg', id: leg } : { t: 'host.leg', json: JSON.stringify(leg) }, (m) => r.push(m), 0);
    expect(r).toMatchObject([{ ok: true }]);
    for (const [id, step] of Object.entries(steps)) f.teams.set(id, { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1, step });
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 1);
    f.log.length = 0;
    f.sent.length = 0;
    f.txs.length = 0;
    const host: ServerMessage[] = [];
    const review = (team: string, step: string, op: HostReview['op'], now: number, more: { id?: number; note?: string; score?: number } = {}) => e.onHost({ t: 'host.review', team, step, op, ...more }, (m) => host.push(m), now);
    const op = (team: string, m: RaceOp, now: number, pose: PoseSample | null = null) => e.onOp(team, m, pose, now);
    const to = (team: string) => f.sent.filter(([t]) => t === team).map(([, m]) => m);
    const card = (team: string) => (to(team).filter((m) => (m as { t: string }).t === 'race').at(-1) as { view: RaceView } | undefined)?.view.card;
    return { f, e, host, review, op, to, card };
  }
  /** Every sql / event line of the log sits inside a transaction, every send after the last of them. */
  const writesFirst = (f: ReturnType<typeof fake>) => {
    const writes = f.log.flatMap((l, i) => (/^(sql|event|saveTeam)/.test(l) ? [i] : []));
    expect(writes.length).toBeGreaterThan(0);
    for (const i of writes) expect(f.txs.some(([a, b]) => a <= i && i < b)).toBe(true);
    expect(f.log.findIndex((l) => l.startsWith('send'))).toBeGreaterThan(writes.at(-1)!);
  };

  it('answer: the step_progress row is written before the team hears "sent"; the Host queue lists it with the reference answers', () => {
    const { f, e, op, to, card } = racing();
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: '42' }, 5);
    expect(to('t0')).toEqual([{ t: 'notice', code: 'taskNotStarted' }]); // T1 has a teaser
    expect(f.log).toEqual(['send notice']);
    op('t0', { t: 'race', op: 'accept', step: 'T1' }, 6);
    expect(f.log.slice(1)).toEqual(['sql INSERT INTO step_progress', 'event accept', 'send race']);
    f.log.length = 0;
    f.txs.length = 0;
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: 'bốn hai' }, 10);
    expect(f.log).toEqual(['sql INSERT INTO step_progress', 'send notice', 'send race']); // one row, no event (D4)
    writesFirst(f);
    expect(to('t0').slice(-2)).toEqual([{ t: 'notice', code: 'answerSent' }, { t: 'race', view: expect.objectContaining({ card: expect.objectContaining({ status: 'pending' }) }) }]);
    expect(card('t0')!.answers).toEqual([{ id: 1, text: 'bốn hai', at: 10, status: 'pending' }]);
    expect(e.hostView(11).queue).toEqual([{ team: 't0', step: 'T1', label: 'Thử thách 1', branch: null, id: 1, text: 'bốn hai', at: 10, reference: ['42 (bốn mươi hai) – GIẢ'], note: '', lockMinutes: 3 }]);
    expect(e.hostView(11).progress.find((p) => p.step === 'T1')).toMatchObject({ pending: true, submittedAt: 10, startedAt: 6 });
  });

  it('review: row + event in one transaction before the team hears; penalize locks, approve (N4) completes; a second decision writes nothing', () => {
    const { f, e, host, review, op, to } = racing();
    op('t0', { t: 'race', op: 'accept', step: 'T1' }, 5);
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: '41' }, 10);
    f.log.length = 0;
    f.txs.length = 0;
    review('t0', 'T1', 'penalize', 30_010, { id: 1, note: 'sai' });
    expect(f.log).toEqual(['sql INSERT INTO step_progress', 'event review', 'sql INSERT INTO meta', 'send notice', 'send race']); // meta: its undo record (Phase 10)
    writesFirst(f);
    expect(to('t0').slice(-2)).toEqual([{ t: 'notice', code: 'penalized' }, { t: 'race', view: expect.objectContaining({ card: expect.objectContaining({ status: 'locked', lockKind: 'retry', lockedUntil: 30_010 + 3 * 60_000, retryPenaltyMinutes: 3 }) }) }]);
    expect(JSON.stringify(to('t0'))).not.toContain('sai'); // the Host note never reaches the team
    expect(e.hostView(30_011).progress.find((p) => p.step === 'T1')).toMatchObject({ rejections: 1, approvalWaitSeconds: 30, note: 'sai', answers: [{ id: 1, status: 'penalized', note: 'sai', branch: null }] });
    expect(e.hostView(30_011).queue).toEqual([]);
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: '42' }, 40_000);
    expect(to('t0').at(-1)).toEqual({ t: 'notice', code: 'answerLocked' });
    f.log.length = 0;
    review('t0', 'T1', 'penalize', 40_001, { id: 1 });
    expect(host.at(-1)).toEqual({ t: 'host.notice', level: 'warning', message: 'Bài này đã được xử lý.' });
    expect(f.log).toEqual([]);
    // N4: the Host clicked "Phạt" by mistake: "Duyệt" on that answer completes the step, one toast (M8: no clueNew)
    review('t0', 'T1', 'approve', 50_000, { id: 1 });
    // §17.32: L2 is walk-only → off the bike wherever the team is ('park' after the rows)
    expect(f.log.filter((l) => !l.startsWith('send'))).toEqual(['sql INSERT INTO step_progress', 'sql INSERT INTO step_progress', 'event review', 'event complete', 'sql INSERT INTO meta', 'saveTeam', 'park']);
    expect(to('t0').slice(-2)).toEqual([{ t: 'notice', code: 'approved' }, { t: 'race', view: expect.objectContaining({ card: expect.objectContaining({ step: 'L2', receivedAt: 50_000 }) }) }]);
    expect(f.teams.get('t0')!.step).toBe(2);
    // review R-11: the Host who clicked "Duyệt" hears it overruled a "Phạt" (a page a second old); one Host (§17.24): the way back is «Hoàn tác»
    expect(host.slice(1)).toEqual([{ t: 'host.notice', level: 'warning', message: expect.stringContaining('vừa bị Phạt, nay đã được Duyệt') }]);
    expect((host[1] as { message: string }).message).not.toContain('Host còn lại');
    f.log.length = 0;
    review('t0', 'T1', 'approve', 50_001, { id: 1 });
    expect(host.at(-1)).toMatchObject({ message: 'Bài này đã được xử lý.' });
    review('t0', 'L3', 'approve', 50_001);
    expect(host.at(-1)).toMatchObject({ message: 'Đội chưa tới bước này.' });
    expect(f.log).toEqual([]);
  });

  it('a failing review write sends nothing and leaves the cache (queue) as it was', () => {
    const { f, e, review, op } = racing();
    op('t0', { t: 'race', op: 'accept', step: 'T1' }, 5);
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: '41' }, 10);
    const before = JSON.stringify(e.hostView(20));
    f.sent.length = 0;
    f.setFail(true);
    expect(() => review('t0', 'T1', 'approve', 20, { id: 1 })).toThrow('disk');
    expect(f.sent).toEqual([]);
    expect(JSON.stringify(e.hostView(20))).toBe(before);
    f.setFail(false);
    expect(e.hostView(20).queue).toHaveLength(1);
  });

  it('the queue: every pending answer of every team, oldest first; reference = referenceAnswers, else answers', () => {
    const leg = structuredClone(bundledLeg('mini')!) as Leg;
    if (leg.steps[1]!.type === 'challenge') leg.steps[1]!.task.referenceAnswers = [];
    for (const l of ['mini', leg] as const) {
      const { e, op } = racing({ t0: 1, t1: 1 }, l);
      for (const [t, at] of [['t0', 30], ['t1', 20]] as const) {
        op(t, { t: 'race', op: 'accept', step: 'T1' }, at - 5);
        op(t, { t: 'race', op: 'answer', step: 'T1', text: `câu của ${t}` }, at);
      }
      const q = e.hostView(40).queue;
      expect(q.map((x) => [x.team, x.text, x.at])).toEqual([['t1', 'câu của t1', 20], ['t0', 'câu của t0', 30]]);
      expect(q[0]!.reference).toEqual(l === 'mini' ? ['42 (bốn mươi hai) – GIẢ'] : ['42']);
    }
  });

  it('two teams: nothing of team A\'s answers reaches team B (race / book / zone), only the Host', () => {
    const { e, op, to } = racing({ t0: 1, t1: 1 });
    op('t0', { t: 'race', op: 'accept', step: 'T1' }, 5);
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: 'BÍ MẬT ĐỘI A' }, 10);
    op('t1', { t: 'race', op: 'accept', step: 'T1' }, 11);
    op('t1', { t: 'race', op: 'book' }, 12);
    e.onPose('t1', at(1), 13);
    expect(JSON.stringify(to('t1'))).not.toContain('BÍ MẬT');
    expect(JSON.stringify(to('t0'))).toContain('BÍ MẬT');
    expect(JSON.stringify(e.hostView(14))).toContain('BÍ MẬT');
  });

  it('D24: answer / accept / branch / open in lobby or paused → a notice, 0 rows; the Host still reviews while paused', () => {
    const { f, e, review, op } = racing({ t0: 1 });
    op('t0', { t: 'race', op: 'accept', step: 'T1' }, 5);
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: '41' }, 10);
    e.onHost({ t: 'host.race', op: 'pause' }, () => {}, 11);
    f.log.length = 0;
    f.sent.length = 0;
    const rows = f.io.counters.rows;
    for (const m of [{ t: 'race', op: 'answer', step: 'T1', text: '42' }, { t: 'race', op: 'accept', step: 'T1' }, { t: 'race', op: 'branch', step: 'D1', branch: 'A' }, { t: 'race', op: 'open', step: 'D1', branch: 'A' }] as RaceOp[]) op('t0', m, 12, at(1));
    expect(f.log).toEqual(['send notice', 'send notice', 'send notice', 'send notice']);
    expect(f.sent.map(([, m]) => m)).toEqual(Array(4).fill({ t: 'notice', code: 'racePaused' }));
    expect(f.io.counters.rows).toBe(rows);
    review('t0', 'T1', 'approve', 13);
    expect(f.teams.get('t0')!.step).toBe(2);
    const lobby = fake();
    const e2 = new RaceEngine(lobby.io);
    lobby.log.length = 0;
    e2.onOp('t0', { t: 'race', op: 'answer', step: 'L1', text: 'x' }, null, 1);
    expect(lobby.sent.map(([, m]) => m)).toEqual([{ t: 'notice', code: 'raceNotOpen' }]);
    expect(lobby.log).toEqual(['send notice']);
  });

  it('D6: choose → the chosen branch\'s box; switch → hideBox BEFORE any message, the countdown, no box until it ends; open → opened box', () => {
    const { f, e, op, to, card } = racing({ t0: 3 });
    const za = branchZone(mini, Z, 3, 'A')!;
    expect(e.currentBox('t0', 5)).toBeNull(); // choose: no box at all
    op('t0', { t: 'race', op: 'branch', step: 'D1', branch: 'A' }, 5);
    expect(to('t0').slice(-2)).toEqual([{ t: 'notice', code: 'branchChosen' }, expect.objectContaining({ t: 'race' })]);
    expect(e.currentBox('t0', 6)).toMatchObject({ step: 'D1', branch: 'A', opened: false, x: Math.round(za.x * 100) / 100 });
    expect(card('t0')).toMatchObject({ status: 'goToBranch', branch: 'A' });
    f.log.length = 0;
    f.txs.length = 0;
    op('t0', { t: 'race', op: 'branch', step: 'D1', branch: 'B' }, 1000);
    expect(f.log).toEqual(['sql INSERT INTO step_progress', 'event switch', 'hideBox t0 D1 A', 'send notice', 'send race']);
    writesFirst(f);
    expect(card('t0')).toMatchObject({ status: 'switchLocked', lockKind: 'switch', lockedUntil: 1000 + 10 * 60_000, switches: 1, branch: 'B' });
    expect(e.currentBox('t0', 1000 + 10 * 60_000 - 1)).toBeNull();
    expect(e.currentBox('t0', 1000 + 10 * 60_000)).toMatchObject({ branch: 'B', opened: false });
    // the countdown is over (read against now): open B's box standing there on foot
    const zb = branchZone(mini, Z, 3, 'B')!;
    op('t0', { t: 'race', op: 'open', step: 'D1', branch: 'B' }, 1000 + 10 * 60_000, { x: zb.x, y: 0, z: zb.z, yaw: 0, mode: 'walk', action: 'none' });
    expect(to('t0').filter((m) => (m as { t: string }).t === 'box').at(-1)).toEqual({ t: 'box', op: 'reveal', box: expect.objectContaining({ step: 'D1', branch: 'B', opened: true }) });
    expect(card('t0')).toMatchObject({ status: 'active', branchOpened: true, branches: [{ id: 'A' }, { id: 'B', task: expect.objectContaining({ input: 'proof' }) }] });
    expect(card('t0')!.branches![0]!.task).toBeUndefined();
    expect(e.currentBox('t0', 2e9)).toMatchObject({ branch: 'B', opened: true });
    expect(e.welcome('t0', null, false, 2e9).boxes.filter((b) => b.step === 'D1')).toEqual([expect.objectContaining({ branch: 'B', opened: true })]); // opened: shown from anywhere
    expect(e.hostView(2e9).progress.find((p) => p.step === 'D1')).toMatchObject({ branch: 'B', branchSwitches: 1, branchOpenedAt: 1000 + 10 * 60_000 });
  });

  it('a switch keeps the old branch\'s answers for the Host (b = A) while the team\'s card lists only the current branch; arrival cleared', () => {
    const { e, f, op, card } = racing({ t0: 3 });
    const za = branchZone(mini, Z, 3, 'A')!;
    const foot: PoseSample = { x: za.x, y: 0, z: za.z, yaw: 0, mode: 'walk', action: 'none' };
    op('t0', { t: 'race', op: 'branch', step: 'D1', branch: 'A' }, 5);
    op('t0', { t: 'race', op: 'open', step: 'D1', branch: 'A' }, 6, foot);
    expect(f.parks.at(-1)).toEqual({ x: Math.round(za.x * 100) / 100, z: Math.round(za.z * 100) / 100, yaw: Math.round(za.yaw * 1000) / 1000 }); // §17.34: beside branch A's box
    op('t0', { t: 'race', op: 'answer', step: 'D1', text: '8' }, 7, foot); // auto: wrong
    expect(card('t0')).toMatchObject({ status: 'active', answers: [{ id: 1, text: '8', status: 'wrong' }] });
    expect(e.hostView(8).progress.find((p) => p.step === 'D1')).toMatchObject({ arrivedAt: 6, branchOpenedAt: 6, wrongAnswers: 1 });
    op('t0', { t: 'race', op: 'branch', step: 'D1', branch: 'B' }, 9);
    expect(card('t0')).toMatchObject({ status: 'switchLocked', branch: 'B', answers: [], branchOpened: false });
    expect(e.hostView(10).progress.find((p) => p.step === 'D1')).toMatchObject({ arrivedAt: null, branchOpenedAt: null, startedAt: null, branchSwitches: 1, answers: [{ id: 1, branch: 'A', status: 'wrong' }] });
  });

  it('"Tại điểm này" at a detour (C1, review R-8): only the chosen branch\'s place; after a switch the old place\'s list is cleared (verify-a 4.4)', () => {
    const za = branchZone(mini, Z, 3, 'A')!;
    const zb = branchZone(mini, Z, 3, 'B')!;
    const pz = (p: { x: number; z: number }): PoseSample => ({ x: p.x, y: 0, z: p.z, yaw: 0, mode: 'walk', action: 'none' });
    const branch = (b: string): RaceOp => ({ t: 'race', op: 'branch', step: 'D1', branch: b });
    const MIN = 60_000;
    {
      const { e, op, to } = racing({ t0: 3, t1: 3 });
      const zones = (team: string) => to(team).filter((m) => (m as { t: string }).t === 'zone');
      op('t1', branch('B'), 5);
      e.onPose('t1', pz(zb), 6);
      op('t0', branch('A'), 7);
      e.onPose('t0', pz(za), 8); // its own place: a list (nobody else there)
      expect(zones('t0')).toEqual([{ t: 'zone', teams: [] }]);
      e.onPose('t0', pz({ x: 1e5, z: 1e5 }), 9);
      e.onPose('t0', pz(zb), 10); // B's place while on A: no list (never confirm a place that is not its own)
      expect(zones('t0')).toHaveLength(1);
      expect(zones('t1').at(-1)).toEqual({ t: 'zone', teams: [expect.objectContaining({ slot: 0, branch: 'A', since: 10 })] });
      op('t0', branch('B'), 100); // switch, standing in B's place: still no list during the countdown
      expect(zones('t0')).toHaveLength(1);
      e.onPose('t0', pz(zb), 100 + 10 * MIN); // countdown over, at B: its place now (arrival where it already stood)
      expect(zones('t0').at(-1)).toEqual({ t: 'zone', teams: [expect.objectContaining({ slot: 1, branch: 'B' })] });
    }
    {
      const { e, op, to } = racing({ t0: 3, t1: 3 });
      const zones = (team: string) => to(team).filter((m) => (m as { t: string }).t === 'zone');
      for (const t of ['t0', 't1']) {
        op(t, branch('A'), 5);
        e.onPose(t, pz(za), 6);
      }
      expect(zones('t0').at(-1)).toEqual({ t: 'zone', teams: [expect.objectContaining({ slot: 1, branch: 'A' })] });
      op('t0', branch('B'), 100); // still standing at A: A is no longer its place
      expect(zones('t0').at(-1)).toEqual({ t: 'zone', teams: [] });
      expect(zones('t1').at(-1)).toEqual({ t: 'zone', teams: [expect.objectContaining({ slot: 0, branch: 'B' })] });
    }
  });

  it('SPEC §17.22: the finish fixes "Về đích thứ n" by real finish order, written before the team hears it; the leg\'s texts, the winner\'s own', () => {
    const { f, e, to } = racing({ t0: 4, t1: 4, t2: 1 });
    const finish = (team: string, now: number) => {
      f.log.length = 0;
      e.onPose(team, at(4), now);
      writesFirst(f);
      return (to(team).filter((m) => (m as { t: string }).t === 'race').at(-1) as { view: RaceView }).view;
    };
    const a = finish('t1', 100); // t1 entered after t0's order but touches the mat first
    expect(a.result).toEqual({ rank: 1, total: 3, kind: 'first', npc: '(GIẢ) Đội t1 về nhất tại Hồ Thiền Quang!', toast: '(GIẢ) Về đích thứ 1/3', card: '(GIẢ) Đội t1 về nhất trên 3 đội.' });
    expect(f.teams.get('t1')).toMatchObject({ rank: 1, out: false, finishAt: 100 });
    expect(f.events.at(-1)).toEqual(['finish', { rank: 1, out: false, total: 3 }]);
    const b = finish('t0', 200);
    expect(b.result).toMatchObject({ rank: 2, kind: 'finish', npc: '(GIẢ) Đội t0 về đích thứ 2 tại Hồ Thiền Quang!', card: '(GIẢ) Chúc mừng Đội t0: về đích thứ 2 trên 3 đội tại Hồ Thiền Quang.' });
    expect(Object.keys(b)).not.toContain('officialMs');
    e.onPose('t1', at(4), 300); // checked in already: nothing changes
    expect(f.teams.get('t1')!.rank).toBe(1);
    expect(e.hostView(400).ranking.map((r) => [r.team, r.rank, r.out])).toEqual([['t1', 1, false], ['t0', 2, false], ['t2', 3, false]]);
  });

  it('SPEC §17.23: the last team to finish (every other one already did) gets "BỊ LOẠI" with its final rank; a leg without texts uses the defaults', () => {
    const leg = structuredClone(bundledLeg('mini')!) as Leg;
    delete (leg.steps.at(-1) as { announce?: unknown }).announce;
    const { f, e, to } = racing({ t0: 4, t1: 4 }, leg);
    e.onPose('t0', at(4), 100);
    e.onPose('t1', at(4), 200);
    const v = (to('t1').filter((m) => (m as { t: string }).t === 'race').at(-1) as { view: RaceView }).view;
    expect(v.result).toEqual({ rank: 2, total: 2, kind: 'out', npc: 'Đội t1, rất tiếc, các bạn đã bị loại.', toast: 'BỊ LOẠI – hạng 2/2', card: 'Rất tiếc, Đội t1 đã BỊ LOẠI khỏi cuộc đua. Thứ hạng cuối: 2/2.' });
    expect(f.teams.get('t1')).toMatchObject({ rank: 2, out: true });
    expect(e.hostView(300).ranking.map((r) => [r.team, r.out])).toEqual([['t0', false], ['t1', true]]);
    // a race of one team: nobody else to beat, so it is not "the last" (never out by itself)
    const solo = racing({ t0: 4 });
    solo.e.onPose('t0', at(4), 100);
    expect(solo.f.teams.get('t0')).toMatchObject({ rank: 1, out: false });
  });

  it('Leg 3 finish-line penalty (host.finishPenalty): set before / after the finish, the card stays "Về đích thứ n" + the penalty, live; ranking adds it; clear', () => {
    const MIN = 60_000;
    const { f, e, to } = racing({ t0: 4, t1: 4, t2: 1 });
    const host: ServerMessage[] = [];
    const fp = (team: string, minutes: number, now: number, reason?: string) => e.onHost({ t: 'host.finishPenalty', team, minutes, ...(reason !== undefined ? { reason } : {}) }, (m) => host.push(m), now);
    const result = (team: string) => (to(team).filter((m) => (m as { t: string }).t === 'race').at(-1) as { view: RaceView } | undefined)?.view.result;
    // before the finish: written (event + teams.state, one transaction), nothing sent (no finish card yet)
    fp('t0', 20, 50);
    expect(f.log).toEqual(['event host.finishPenalty', 'saveTeam']);
    expect(f.txs).toHaveLength(1);
    expect(f.events.at(-1)).toEqual(['host.finishPenalty', { minutes: 20, reason: 'bỏ thử thách ở lựa chọn kép', was: null }]);
    expect(f.teams.get('t0')!.finishPenalty).toEqual({ minutes: 20, reason: 'bỏ thử thách ở lựa chọn kép', by: 'host' });
    expect(f.sent).toEqual([]);
    // t0 touches the mat first: told only "finished" + its penalty line + the wait (no rank until the penalty is served)
    e.onPose('t0', at(4), 100);
    expect(result('t0')).toMatchObject({ rank: 0, finishPenalty: { minutes: 20, reason: 'bỏ thử thách ở lựa chọn kép' }, waitUntil: 100 + 20 * MIN });
    // t1 finishes meanwhile with an earlier total (5 min < 20 min): ranked ahead of the waiting t0
    e.onPose('t1', at(4), 100 + 5 * MIN);
    expect(result('t1')).toMatchObject({ rank: 1, kind: 'first' });
    expect(result('t1')).not.toHaveProperty('finishPenalty');
    // the Host ranking: finishAt + penalty → t1 (5 min) ahead of t0 (0 + 20 min); the stored ranks told to the teams stay
    expect(e.hostView(200).ranking.map((r) => [r.team, r.rank])).toEqual([['t1', 1], ['t0', 2], ['t2', 3]]);
    // after the finish: the card updates live, written first
    f.log.length = f.txs.length = 0;
    fp('t1', 30, 300, '  đến muộn ');
    expect(f.log).toEqual(['event host.finishPenalty', 'saveTeam', 'send race']);
    writesFirst(f);
    expect(result('t1')).toMatchObject({ rank: 0, finishPenalty: { minutes: 30, reason: 'đến muộn' } }); // now waits too (5 + 30 min)
    expect(e.hostView(400).ranking.map((r) => r.team)).toEqual(['t0', 't1', 't2']); // 20 min < 5 + 30 min
    // the same value again / an unknown team: refused, nothing written
    f.log.length = 0;
    fp('t1', 30, 500, 'đến muộn');
    fp('nobody', 5, 500);
    expect(f.log).toEqual([]);
    expect(host).toEqual([{ t: 'host.notice', level: 'warning', message: 'Phạt vạch đích của đội này không đổi.' }, { t: 'host.notice', level: 'error', message: 'Không có đội này.' }]);
    // clear (0): the card has no penalty line any more; the event keeps what it was
    fp('t0', 0, 600);
    expect(f.teams.get('t0')!.finishPenalty).toBeNull();
    expect(f.events.at(-1)).toEqual(['host.finishPenalty', { minutes: 0, reason: null, was: { minutes: 20, reason: 'bỏ thử thách ở lựa chọn kép', by: 'host' } }]);
    expect(result('t0')).not.toHaveProperty('finishPenalty');
    // teams never hear of another team's penalty
    expect(to('t2')).toEqual([]);
    expect(JSON.stringify(to('t0'))).not.toContain('đến muộn');
    // after the Host's "Kết thúc" the Host still settles it
    e.onHost({ t: 'host.race', op: 'finish' }, () => {}, 700);
    fp('t0', 12, 800);
    expect(result('t0')).toMatchObject({ finishPenalty: { minutes: 12 } });
  });

  describe('Leg 3: auto-graded Thử thách 1 (hanoi-demo T1: 3 boxes with answers)', () => {
    const bx = bundledLeg('hanoi-demo')!;
    const T = bx.steps.findIndex((s) => s.id === 'T1');
    const RIGHT = ['Cuba', 'Singapore', 'Uzbekistan'];
    const ans = (parts: string[]): RaceOp => ({ t: 'race', op: 'answer', step: 'T1', text: '', parts });

    it('3/3: written, then "Chính xác!" + the next clue at once; the Host queue shows it until "✓ Đồng ý"', () => {
      const { f, e, op, to, card, review, host } = racing({ t0: T }, 'hanoi-demo');
      op('t0', ans(['cu-ba', 'XIN-GA-PO', 'udobekixtan']), 10);
      writesFirst(f);
      expect(to('t0').filter((m) => (m as { t: string }).t === 'notice')).toEqual([{ t: 'notice', code: 'autoCorrect', score: 3, of: 3 }]); // no extra clueNew
      expect(card('t0')!.step).toBe(bx.steps[T + 1]!.id);
      expect(f.events.find(([t]) => t === 'auto')).toEqual(['auto', { step: 'T1', id: 1, score: 3, of: 3 }]);
      const q = e.hostView(11).queue;
      expect(q).toEqual([expect.objectContaining({ team: 't0', step: 'T1', id: 1, reference: RIGHT, auto: { verdict: 'correct', marks: [true, true, true], score: 3, of: 3, canApprove: false } })]);
      expect(e.hostView(11).undo).toEqual([]); // nothing for the Host to undo
      review('t0', 'T1', 'approve', 12, { id: 1 }); // "Đúng" on a done step
      expect(host.at(-1)).toMatchObject({ level: 'warning' });
      f.log.length = 0;
      review('t0', 'T1', 'ack', 13, { id: 1 });
      expect(f.log).toEqual(['sql INSERT INTO step_progress', 'event review']); // quiet for the team
      expect(e.hostView(14).queue).toEqual([]);
    });

    it('1/3: Phạt at once (2 min) + "đúng 1/3"; the queue never blocks the team; Host score → live; "Đúng" lifts the lock + next clue', () => {
      const { f, e, op, to, card, review } = racing({ t0: T }, 'hanoi-demo');
      op('t0', ans(['Cuba', 'Latvia', 'Peru']), 10);
      expect(to('t0').filter((m) => (m as { t: string }).t === 'notice')).toEqual([{ t: 'notice', code: 'autoPenalized', score: 1, of: 3 }]);
      expect(card('t0')).toMatchObject({ step: 'T1', status: 'locked', lockKind: 'retry', lockedUntil: 10 + 2 * 60_000, answers: [{ id: 1, status: 'penalized', score: 1, of: 3 }] });
      expect(e.hostView(11).progress.find((p) => p.step === 'T1')).toMatchObject({ pending: false, rejections: 1, lockedUntil: 10 + 2 * 60_000 });
      expect(e.hostView(11).queue[0]!.auto).toEqual({ verdict: 'penalized', marks: [true, false, false], score: 1, of: 3, canApprove: true });
      review('t0', 'T1', 'score', 20, { id: 1, score: 2 });
      expect(to('t0').slice(-2)).toEqual([{ t: 'notice', code: 'scoreUpdated', score: 2, of: 3 }, expect.objectContaining({ t: 'race' })]);
      expect(card('t0')).toMatchObject({ status: 'locked', lockedUntil: 10 + 2 * 60_000, answers: [{ score: 2, of: 3 }] }); // the countdown unchanged
      review('t0', 'T1', 'approve', 30, { id: 1 }); // "Đúng – cho qua"
      expect(card('t0')!.step).toBe(bx.steps[T + 1]!.id);
      expect(e.hostView(31).queue).toEqual([]);
      expect(e.hostView(31).undo).toEqual([expect.objectContaining({ team: 't0', step: 'T1', id: 1, op: 'approve' })]); // the 10 s undo as before
      expect(f.teams.get('t0')!.step).toBe(T + 1);
    });
  });

  describe('Leg 3: Lựa chọn kép rooms (race room, hanoi-demo D1: A chocolate 5 × 20 min, B comic 9 × 12 min)', () => {
    const bx = bundledLeg('hanoi-demo')!;
    const BZ = stepZones(bx);
    const D = bx.steps.findIndex((s) => s.id === 'D1');
    const stand = (b: string): PoseSample => {
      const z = branchZone(bx, BZ, D, b)!;
      return { x: z.x, y: 0, z: z.z, yaw: 0, mode: 'walk', action: 'none' };
    };
    const room = (b: string, done: number, skipped = false): RaceOp => ({ t: 'race', op: 'room', step: 'D1', branch: b, done, skipped });
    /** t0 on D1, branch `b` chosen and its box opened. */
    const inRoom = (b = 'A') => {
      const h = racing({ t0: D, t1: D }, 'hanoi-demo');
      h.op('t0', { t: 'race', op: 'branch', step: 'D1', branch: b }, 5);
      h.op('t0', { t: 'race', op: 'open', step: 'D1', branch: b }, 6, stand(b));
      h.f.log.length = h.f.txs.length = 0;
      h.f.sent.length = 0;
      return h;
    };

    it('progress is written (teams.state + event) before the team hears; the card + Host matrix carry it; refused reports write nothing', () => {
      const { f, e, op, to, card } = inRoom();
      op('t0', room('A', 2), 10);
      expect(f.log).toEqual(['event room', 'saveTeam', 'send race']);
      writesFirst(f);
      expect(f.teams.get('t0')!.rooms).toEqual({ D1: { b: 'A', done: 2, skipped: false } });
      expect(card('t0')!.branches![0]!.task!.room).toEqual({ kind: 'chocolate', total: 5, penaltyMinutesEach: 20, done: 2, skipped: false });
      expect(e.hostView(11).progress.find((p) => p.team === 't0' && p.step === 'D1')!.room).toEqual({ branch: 'A', kind: 'chocolate', total: 5, done: 2, skipped: false });
      f.log.length = 0;
      op('t0', room('A', 1), 12); // down
      op('t0', room('B', 1), 12); // not the chosen branch
      op('t0', room('A', 6), 12); // over total
      op('t1', room('A', 1), 12); // t1 chose nothing
      expect(f.log).toEqual(['send notice', 'send notice', 'send notice', 'send notice']);
      expect(to('t0').slice(-1)).toEqual([{ t: 'notice', code: 'roomIgnored' }]);
    });

    it('done = total → passes at once (a correct "Hoàn thành phòng sô-cô-la: 5/5"), no Host queue item', () => {
      const { e, op, card } = inRoom();
      op('t0', room('A', 5), 10);
      expect(card('t0')!.step).not.toBe('D1');
      expect(e.hostView(11).queue).toEqual([]);
    });

    it('skip → the next clue at once + (total − done) × each at the finish line (by room); a later Host value is the Host\'s', () => {
      const { f, e, op, card } = inRoom();
      op('t0', room('A', 3), 10);
      op('t0', room('A', 3, true), 11);
      expect(card('t0')!.step).toBe(bx.steps[D + 1]!.id);
      expect(f.teams.get('t0')!.finishPenalty).toEqual({ minutes: 40, reason: 'bỏ thử thách ở lựa chọn kép', by: 'room' });
      expect(f.events.filter(([t]) => t === 'room.finishPenalty')).toEqual([['room.finishPenalty', { step: 'D1', minutes: 40, kept: false, was: null }]]);
      expect(e.hostView(12).progress.find((p) => p.team === 't0' && p.step === 'D1')!.room).toMatchObject({ done: 3, skipped: true });
      e.onHost({ t: 'host.finishPenalty', team: 't0', minutes: 30 }, () => {}, 13);
      expect(f.teams.get('t0')!.finishPenalty).toMatchObject({ minutes: 30, by: 'host' });
      f.log.length = 0;
      op('t0', room('A', 4), 14); // a done step: ignored
      expect(f.log).toEqual(['send notice']);
    });

    it('a Host-set finish-line penalty is never overwritten by a skipped room', () => {
      const { f, e, op } = inRoom('B');
      e.onHost({ t: 'host.finishPenalty', team: 't0', minutes: 7, reason: 'khác' }, () => {}, 8);
      op('t0', room('B', 4, true), 10);
      expect(f.teams.get('t0')!.finishPenalty).toEqual({ minutes: 7, reason: 'khác', by: 'host' });
      expect(f.events.at(-2)).toEqual(['room.finishPenalty', { step: 'D1', minutes: 60, kept: true, was: { minutes: 7, reason: 'khác', by: 'host' } }]);
    });

    it('a switch drops the room progress; back to A after both countdowns starts A from 0', () => {
      const { f, op, card } = inRoom();
      op('t0', room('A', 3), 10);
      op('t0', { t: 'race', op: 'branch', step: 'D1', branch: 'B' }, 20);
      expect(f.teams.get('t0')!.rooms).toEqual({});
      const t1 = 20 + 10 * 60_000;
      op('t0', { t: 'race', op: 'branch', step: 'D1', branch: 'A' }, t1);
      expect(card('t0')).toMatchObject({ status: 'switchLocked', branch: 'A', switches: 2 });
      op('t0', { t: 'race', op: 'open', step: 'D1', branch: 'A' }, t1 + 10 * 60_000, stand('A'));
      expect(card('t0')!.branches![0]!.task!.room).toMatchObject({ done: 0, skipped: false });
      op('t0', room('A', 1), t1 + 10 * 60_000 + 1); // 1 < the old 3: accepted, it starts again
      expect(f.teams.get('t0')!.rooms).toEqual({ D1: { b: 'A', done: 1, skipped: false } });
    });
  });

  it('Leg 3: a finish-line penalty set within an undo window survives the undo of that Duyệt', () => {
    const { f, e, review } = pendingT1();
    review('t0', 'T1', 'approve', 20_000, { id: 1 });
    e.onHost({ t: 'host.finishPenalty', team: 't0', minutes: 20 }, () => {}, 21_000);
    review('t0', 'T1', 'undo', 22_000, { id: 1 });
    expect(f.teams.get('t0')).toMatchObject({ step: 1, finishPenalty: { minutes: 20 } });
  });

  it('SPEC §17.23 (Chốt): "Kết thúc" with teams still racing: each is out, ranked after the finished ones (furthest step first), written with the status, then told', () => {
    const { f, e, to } = racing({ t0: 4, t1: 1, t2: 3 });
    e.onPose('t0', at(4), 100);
    f.log.length = f.txs.length = 0;
    e.onHost({ t: 'host.race', op: 'finish' }, () => {}, 500);
    writesFirst(f);
    expect(f.txs).toHaveLength(1); // status + the out marks: one transaction
    expect(f.teams.get('t2')).toMatchObject({ rank: 2, out: true, finishAt: null });
    expect(f.teams.get('t1')).toMatchObject({ rank: 3, out: true });
    expect(f.teams.get('t0')).toMatchObject({ rank: 1, out: false });
    const last = (team: string) => (to(team).filter((m) => (m as { t: string }).t === 'race').at(-1) as { view: RaceView }).view;
    expect(last('t1')).toMatchObject({ status: 'finished', result: { rank: 3, total: 3, kind: 'out', card: '(GIẢ) Đội t1 BỊ LOẠI, hạng cuối 3/3.' } });
    expect(last('t0').result).toMatchObject({ rank: 1, kind: 'first' });
    expect(e.hostView(600).ranking.map((r) => [r.team, r.rank, r.out])).toEqual([['t0', 1, false], ['t2', 2, true], ['t1', 3, true]]);
    // rebuilt after an eviction: the marks live in teams.state (a new engine over the same rows says the same)
    expect(new RaceEngine(f.io).welcome('t1', null, false, 700).view!.result).toMatchObject({ rank: 3, kind: 'out' });
  });

  it('media (D13): what the team has opened only; host.state carries the leg fields', () => {
    const { e, op } = racing({ t0: 0 });
    expect(e.mediaAllowed('t0', 'test-gia.jpg')).toBe(true);
    expect(e.mediaAllowed('t0', 'test-gia-2.jpg')).toBe(false);
    expect(e.mediaAllowed('nope', 'test-gia.jpg')).toBe(false);
    op('t0', { t: 'race', op: 'open', step: 'L1' }, 5, { ...at(0) });
    expect(e.mediaAllowed('t0', 'test-gia-2.jpg')).toBe(false); // T1 behind its teaser
    op('t0', { t: 'race', op: 'accept', step: 'T1' }, 6);
    expect(e.mediaAllowed('t0', 'test-gia-2.jpg')).toBe(true);
    const h = e.hostView(12);
    expect(h.leg).toMatchObject({ media: ['test-gia.jpg', 'test-gia-2.jpg'], penalties: { retryLockMinutes: 3, branchSwitchLockMinutes: 10 }, stuckMinutes: 45 });
    expect(h.leg!.steps.map((s) => [s.id, s.proof, s.branches?.map((b) => b.proof)])).toEqual([['L1', false, undefined], ['T1', false, undefined], ['L2', false, undefined], ['D1', false, [false, true]], ['L3', false, undefined], ['PS', false, undefined]]);
    expect(h.leg!.steps[3]!.branches!.map((b) => b.title)).toEqual(['Tính', 'Ảnh']); // the branch's own name for the Host page (visual#3), not its place
  });

  it('every status change reaches each online team as a race view, and its welcome carries it (lobby / paused / finished on screen)', () => {
    const f = fake();
    f.teams.set('t1', { ...NEW_TEAM_RACE, startOrder: 2, joinedAt: 1 });
    const e = new RaceEngine(f.io);
    expect(e.welcome('t1', null, false, 0).view!.status).toBe('lobby');
    for (const [op, status] of [['start', 'running'], ['pause', 'paused'], ['resume', 'running'], ['finish', 'finished']] as const) {
      f.sent.length = 0;
      e.onHost({ t: 'host.race', op }, () => {}, 1);
      expect(f.sent.filter(([, m]) => (m as { t: string }).t === 'race').map(([t, m]) => [t, (m as { view: { status: string } }).view.status])).toEqual([['t0', status], ['t1', status]]);
      expect(e.welcome('t1', null, false, 2).view!.status).toBe(status);
    }
  });

  it('a broken JSON leg gets a Vietnamese line / column, not the engine text (review)', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    const r: ServerMessage[] = [];
    e.onHost({ t: 'host.leg', json: '{\n  "id": "x",\n  "yawDeg": 33, // huong nhin\n}' }, (m) => r.push(m), 0);
    const msg = (r[0] as { issues: { message: string }[] }).issues[0]!.message;
    expect(msg).toMatch(/^File không phải JSON hợp lệ: lỗi cú pháp \(dòng 3, cột 17\)\. Có thể do: .*chú thích/);
    expect(msg).not.toMatch(/Expected|position|JSON at/);
  });

  it('after the Host\'s "Kết thúc" the view says finished and a pose writes nothing (read-only, SPEC §8.10)', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    e.onHost({ t: 'host.leg', id: 'mini' }, () => {}, 0);
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1 });
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 1);
    e.onHost({ t: 'host.race', op: 'finish' }, () => {}, 2);
    expect(f.sent.at(-1)).toEqual(['t0', { t: 'race', view: expect.objectContaining({ status: 'finished', finishAt: null }) }]);
    f.log.length = 0;
    e.onPose('t0', at(0), 10);
    e.onOp('t0', { t: 'race', op: 'open', step: 'L1' }, at(0), 11);
    expect(f.log).toEqual(['send notice']); // raceOver; no arrival row, no park
  });

  it('"Tại điểm này" never shows a team on a later step than the viewer (review m3: a later step\'s label there)', () => {
    const leg = structuredClone(bundledLeg('mini')!);
    (leg.steps[2] as { destination: unknown }).destination = (leg.steps[0] as { destination: unknown }).destination; // L2 back at L1's place
    const chaillot = stepZones(leg)[0]!;
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE }).set('t1', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    const r: ServerMessage[] = [];
    e.onHost({ t: 'host.leg', json: JSON.stringify(leg) }, (m) => r.push(m), 0);
    expect(r[0]).toMatchObject({ ok: true });
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1, step: 2 }).set('t1', { ...NEW_TEAM_RACE, startOrder: 2, joinedAt: 1, step: 1 });
    const p: PoseSample = { x: chaillot.x, y: 0, z: chaillot.z, yaw: 0, mode: 'walk', action: 'none' };
    e.onPose('t0', p, 10); // A arrives for L2
    e.onPose('t1', p, 11); // B (on T1) walks back to the L1 place it did
    const zones = (team: string) => f.sent.filter(([t, m]) => t === team && (m as { t: string }).t === 'zone').map(([, m]) => m);
    expect(zones('t1')).toEqual([{ t: 'zone', teams: [] }]);
    expect(zones('t0').at(-1)).toEqual({ t: 'zone', teams: [{ slot: 1, label: 'Thử thách 1', type: 'challenge', branch: null, since: 11 }] });
  });

  // ── Phase 10 (docs/plans/phase10.md §3.2, §5.2, §7) ──
  /** T1 accepted at 5 and answered "42" at 10 (pending), t0 on step 1. */
  const pendingT1 = (leg: unknown = 'mini') => {
    const r = racing({ t0: 1 }, leg);
    r.op('t0', { t: 'race', op: 'accept', step: 'T1' }, 5);
    r.op('t0', { t: 'race', op: 'answer', step: 'T1', text: '42' }, 10);
    return r;
  };
  const undoLog = (f: ReturnType<typeof fake>) => f.log.filter((l) => !l.startsWith('send'));

  it('SPEC §17.31 scoreOf: the Phạt notice + card carry "đúng x/4" only from scoreFromMinutes on; an undo removes it', () => {
    const scored = JSON.parse(JSON.stringify(mini)) as { steps: { task: object }[] };
    Object.assign(scored.steps[1]!.task, { scoreOf: 4, scoreFromMinutes: 30 });
    const MIN = 60_000;
    const { review, op, to, card, e } = pendingT1(scored); // task started at 5, answer 1 at 10
    review('t0', 'T1', 'penalize', 10 * MIN, { id: 1, score: 2 }); // minute 10: no number for the team
    expect(to('t0').at(-2)).toEqual({ t: 'notice', code: 'penalized' });
    expect(card('t0')!.answers).toEqual([{ id: 1, text: '42', at: 10, status: 'pending' }].map((a) => ({ ...a, status: 'penalized' })));
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: '43' }, 14 * MIN); // the 3-minute lock is over
    expect(e.hostView(14 * MIN).queue[0]).toMatchObject({ id: 2, scoreOf: 4, scoreFrom: 5 + 30 * MIN });
    review('t0', 'T1', 'penalize', 31 * MIN, { id: 2, score: 3 }); // past minute 30: the number goes out
    expect(to('t0').at(-2)).toEqual({ t: 'notice', code: 'penalized', score: 3, of: 4 });
    expect(card('t0')!.answers.at(-1)).toMatchObject({ id: 2, status: 'penalized', score: 3, of: 4 });
    review('t0', 'T1', 'undo', 31 * MIN + 5000, { id: 2 });
    expect(card('t0')!.answers.at(-1)).toEqual({ id: 2, text: '43', at: 14 * MIN, status: 'pending' });
    expect(JSON.stringify(to('t0'))).not.toContain('"score":2'); // the early count never reaches the team
  });

  it('undo (V2): a Duyệt undone in NET.undoMs — rows back (the next step\'s deleted), race fields, host.undo + meta in ONE transaction, then the team hears; queue again', () => {
    const { f, e, host, review, to, card } = pendingT1();
    const before = e.hostView(15);
    review('t0', 'T1', 'approve', 20_000, { id: 1 });
    expect(f.teams.get('t0')!.step).toBe(2);
    expect(e.hostView(20_001).undo).toEqual([{ team: 't0', step: 'T1', id: 1, op: 'approve', at: 20_000, until: 20_000 + NET.undoMs }]);
    f.log.length = f.txs.length = 0;
    const rows = f.io.counters.rows;
    review('t0', 'T1', 'undo', 25_000, { id: 1 });
    // T1 written back, L2 (created by the Duyệt) deleted; L2's box (route) hidden BEFORE the card
    expect(f.log).toEqual(['sql INSERT INTO step_progress', 'sql DELETE FROM step_progress', 'event host.undo', 'sql INSERT INTO meta', 'saveTeam', 'hideBox t0 L2 undefined', 'send notice', 'send race']);
    writesFirst(f);
    expect(f.txs).toHaveLength(1);
    expect(f.io.counters.rows - rows).toBe(3); // + the event (2) and teams.state (1) RaceRoom counts: 6 ≤ 7
    expect(f.events.at(-1)).toEqual(['host.undo', { step: 'T1', op: 'approve', id: 1 }]);
    expect(f.teams.get('t0')).toEqual({ ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1, step: 1 });
    expect(to('t0').slice(-2)).toEqual([{ t: 'notice', code: 'reviewUndone' }, { t: 'race', view: expect.objectContaining({ card: expect.objectContaining({ step: 'T1', status: 'pending' }) }) }]);
    expect(card('t0')!.answers).toEqual([{ id: 1, text: '42', at: 10, status: 'pending' }]);
    const after = e.hostView(25_001);
    expect([after.queue, after.progress, after.undo]).toEqual([before.queue, before.progress, []]);
    review('t0', 'T1', 'undo', 25_002, { id: 1 });
    expect(host.at(-1)).toEqual({ t: 'host.notice', level: 'warning', message: 'Không còn gì để hoàn tác cho bài này.' });
  });

  it('undo (review #1): 6 Duyệt of 6 teams within 10 s all stay undoable until their own NET.undoMs (no count cap)', () => {
    const ids = ['t0', 't1', 't2', 't3', 't4', 't5'];
    const { e, review, op } = racing(Object.fromEntries(ids.map((t) => [t, 1])));
    for (const t of ids) {
      op(t, { t: 'race', op: 'accept', step: 'T1' }, 5);
      op(t, { t: 'race', op: 'answer', step: 'T1', text: '42' }, 10);
    }
    ids.forEach((t, i) => review(t, 'T1', 'approve', 20_000 + i * 1000, { id: 1 }));
    expect(e.hostView(20_000 + NET.undoMs - 1).undo.map((u) => u.team)).toEqual(ids);
    review('t0', 'T1', 'undo', 20_000 + NET.undoMs - 1, { id: 1 });
    expect(e.hostView(20_000 + NET.undoMs).undo.map((u) => u.team)).toEqual(ids.slice(1));
  });

  it('undo (V2): a Phạt undone — the lock gone, the answer pending, back in the queue; no team field / box touched', () => {
    const { f, e, review, card } = pendingT1();
    review('t0', 'T1', 'penalize', 20_000, { id: 1, note: 'sai' });
    expect(card('t0')).toMatchObject({ status: 'locked' });
    expect(e.hostView(20_001)).toMatchObject({ queue: [], undo: [{ op: 'penalize', id: 1 }] });
    f.log.length = 0;
    review('t0', 'T1', 'undo', 21_000, { id: 1 });
    expect(undoLog(f)).toEqual(['sql INSERT INTO step_progress', 'event host.undo', 'sql INSERT INTO meta']);
    expect(card('t0')).toMatchObject({ status: 'pending', lockedUntil: null });
    const h = e.hostView(21_001);
    expect(h.queue).toMatchObject([{ team: 't0', step: 'T1', id: 1, text: '42' }]);
    expect(h.progress.find((p) => p.step === 'T1')).toMatchObject({ rejections: 0, lockedUntil: null, decidedAt: null, note: '', approvalWaitSeconds: 0, answers: [{ id: 1, status: 'pending' }] });
  });

  it('undo (M3): refused past NET.undoMs, a finished team, a team that moved on / got a newer decision, a race over; nothing written, hostView hides them', () => {
    const late = pendingT1();
    late.review('t0', 'T1', 'approve', 20_000, { id: 1 });
    late.f.log.length = 0;
    expect(late.e.hostView(20_000 + NET.undoMs + 1).undo).toEqual([]);
    late.review('t0', 'T1', 'undo', 20_000 + NET.undoMs + 1, { id: 1 });
    expect(late.host.at(-1)).toMatchObject({ level: 'warning', message: expect.stringContaining('Quá 10 giây') });
    expect(late.f.log).toEqual([]);

    const done = pendingT1();
    done.review('t0', 'T1', 'approve', 20_000, { id: 1 });
    done.f.teams.get('t0')!.finishAt = 20_100; // as if the Duyệt had settled it on the mat
    expect(done.e.hostView(20_200).undo).toEqual([]);
    done.review('t0', 'T1', 'undo', 20_200, { id: 1 });
    expect(done.host.at(-1)).toMatchObject({ message: expect.stringContaining('Đội đã về đích') });

    const moved = pendingT1();
    moved.review('t0', 'T1', 'approve', 20_000, { id: 1 });
    moved.op('t0', { t: 'race', op: 'open', step: 'L2' }, 20_100, at(2)); // L2's box opened at once: on to D1
    expect(moved.f.teams.get('t0')!.step).toBe(3);
    moved.f.log.length = 0;
    moved.review('t0', 'T1', 'undo', 20_200, { id: 1 });
    expect(moved.host.at(-1)).toMatchObject({ message: 'Đội đã đi tiếp / có quyết định mới hơn, không hoàn tác được.' });
    expect(moved.f.log).toEqual([]);

    // a newer decision of the team (no "Phạt" lock in this leg: answered again at once, then approved)
    const leg = structuredClone(mini) as Leg;
    (leg.steps[1] as { task: { retryLockMinutes?: number } }).task.retryLockMinutes = 0;
    const newer = pendingT1(leg);
    newer.review('t0', 'T1', 'penalize', 20_000, { id: 1 });
    newer.op('t0', { t: 'race', op: 'answer', step: 'T1', text: '43' }, 20_100);
    newer.review('t0', 'T1', 'approve', 20_200, { id: 2 });
    expect(newer.e.hostView(20_300).undo.map((u) => u.id)).toEqual([2]);
    newer.review('t0', 'T1', 'undo', 20_300, { id: 1 });
    expect(newer.host.at(-1)).toMatchObject({ message: 'Đội đã đi tiếp / có quyết định mới hơn, không hoàn tác được.' });

    const over = pendingT1();
    over.review('t0', 'T1', 'penalize', 20_000, { id: 1 });
    over.e.onHost({ t: 'host.race', op: 'finish' }, () => {}, 20_100);
    expect(over.e.hostView(20_200).undo).toEqual([]);
    over.review('t0', 'T1', 'undo', 20_200, { id: 1 });
    expect(over.host.at(-1)).toEqual({ t: 'host.notice', level: 'error', message: 'Cuộc đua đã kết thúc.' });
  });

  it('undo after "Phạt" then N4 "Duyệt" of the same answer: the Duyệt first (newest), then the Phạt; a Cho qua (V5) is undone by the answer it created', () => {
    const { f, e, review, card } = pendingT1();
    review('t0', 'T1', 'penalize', 20_000, { id: 1 });
    review('t0', 'T1', 'approve', 21_000, { id: 1 }); // N4
    review('t0', 'T1', 'undo', 22_000, { id: 1 });
    expect(card('t0')).toMatchObject({ step: 'T1', status: 'locked' }); // back to the Phạt
    review('t0', 'T1', 'undo', 23_000, { id: 1 });
    expect(card('t0')).toMatchObject({ step: 'T1', status: 'pending' });
    expect(f.teams.get('t0')!.step).toBe(1);
    // Cho qua: the typed task with nothing pending (the Phạt's lock waited out)
    review('t0', 'T1', 'penalize', 24_000, { id: 1 });
    review('t0', 'T1', 'approve', 24_000 + 3 * 60_000 + 1);
    expect(e.hostView(24_000 + 3 * 60_000 + 2).undo).toMatchObject([{ id: 2, op: 'approve' }]);
    review('t0', 'T1', 'undo', 24_000 + 3 * 60_000 + 3, { id: 2 });
    expect(card('t0')).toMatchObject({ step: 'T1', status: 'active', answers: [{ id: 1, status: 'penalized' }] });
  });

  it('undo drops what the team did meanwhile on those steps (M2), never parks again (M4), and works on a woken engine (meta "undo")', () => {
    const { f, e, review } = pendingT1();
    f.poses.set('t0', at(1)); // standing in T1's place on foot: the Duyệt racks its bike (L2 is walk-only, S3)
    review('t0', 'T1', 'approve', 20_000, { id: 1 });
    expect(f.log).toContain('park');
    expect(f.parks.at(-1)).toBeNull(); // §17.34: T1's own place has no clue box → next to the team
    e.onPose('t0', at(2), 20_500); // arrives at L2's place
    expect(e.hostView(20_600).progress.find((p) => p.step === 'L2')).toMatchObject({ arrivedAt: 20_500 });
    const woken = new RaceEngine(f.io); // the Durable Object evicted: meta 'undo' read back (step_progress too, in a real one)
    expect(woken.hostView(21_000).undo).toEqual([{ team: 't0', step: 'T1', id: 1, op: 'approve', at: 20_000, until: 20_000 + NET.undoMs }]);
    f.log.length = 0;
    woken.onHost({ t: 'host.review', team: 't0', step: 'T1', op: 'undo', id: 1 }, () => {}, 21_000);
    expect(f.log).not.toContain('park');
    expect(f.log).toContain('sql DELETE FROM step_progress'); // L2 and its arrival gone
    expect(woken.hostView(21_001).progress.map((p) => [p.step, p.pending])).toEqual([['L1', false], ['T1', true]]);
  });

  it('undo of a detour photo Duyệt: the mat box it moved on to hidden, the opened branch box revealed again', () => {
    const { f, review, op, to } = racing({ t0: 3 });
    const zb = branchZone(mini, Z, 3, 'B')!;
    const foot: PoseSample = { x: zb.x, y: 0, z: zb.z, yaw: 0, mode: 'walk', action: 'none' };
    op('t0', { t: 'race', op: 'branch', step: 'D1', branch: 'B' }, 5);
    op('t0', { t: 'race', op: 'open', step: 'D1', branch: 'B' }, 6, foot);
    op('t0', { t: 'race', op: 'answer', step: 'D1', text: '' }, 7, foot);
    review('t0', 'D1', 'approve', 20_000);
    expect(f.teams.get('t0')!.step).toBe(4);
    f.log.length = 0;
    review('t0', 'D1', 'undo', 21_000, { id: 1 });
    expect(f.log.slice(-4)).toEqual(['hideBox t0 PS undefined', 'send notice', 'send race', 'send box']);
    expect(to('t0').at(-1)).toEqual({ t: 'box', op: 'reveal', box: expect.objectContaining({ step: 'D1', branch: 'B', opened: true }) });
  });

  it('"vừa rời đi" (V4): a team that walks out / disconnects stays in the others\' list with `left` for NET.zoneLeftMs, gone when back; 0 rows', () => {
    const { f, e, to } = racing({ t0: 1, t1: 1, t2: 2 });
    const zones = (team: string) => to(team).filter((m) => (m as { t: string }).t === 'zone');
    const last = (team: string) => (zones(team).at(-1) as { teams: unknown[] } | undefined)?.teams;
    const far: PoseSample = { ...at(1), x: 1e5, z: 1e5 };
    e.onPose('t0', at(1), 10); // both arrive at T1's place (rows: their arrivals)
    e.onPose('t1', at(1), 11);
    e.onPose('t2', at(1), 12); // t2 (on L2, T1 done) back at T1's place: never in t1's list (a later step)
    f.log.length = 0;
    e.onPose('t0', far, 100);
    expect(last('t1')).toEqual([{ slot: 0, label: 'Thử thách 1', type: 'challenge', branch: null, since: 10, left: 100 }]);
    e.onPose('t0', at(1), 200); // back: no longer "left"
    expect(last('t1')).toEqual([{ slot: 0, label: 'Thử thách 1', type: 'challenge', branch: null, since: 200 }]);
    e.left('t0', 300); // its socket went
    expect(last('t1')).toEqual([{ slot: 0, label: 'Thử thách 1', type: 'challenge', branch: null, since: 200, left: 300 }]);
    e.onPose('t2', far, 310); // t2 left too, on a later step: still not shown to t1
    expect(last('t1')).toEqual([{ slot: 0, label: 'Thử thách 1', type: 'challenge', branch: null, since: 200, left: 300 }]);
    expect(last('t2')).toEqual([]); // t2 itself left (its own list cleared)
    // t1 walks out and back: within NET.zoneLeftMs t0 is still listed, past it no more
    e.onPose('t1', far, 400);
    e.onPose('t1', at(1), 300 + NET.zoneLeftMs);
    expect(last('t1')).toEqual([expect.objectContaining({ slot: 0, left: 300 })]);
    e.onPose('t1', far, 300 + NET.zoneLeftMs + 1);
    e.onPose('t1', at(1), 300 + NET.zoneLeftMs + 1);
    expect(last('t1')).toEqual([]);
    expect(f.log.filter((l) => !l.startsWith('send'))).toEqual([]); // memory only
  });

  it('"Tại điểm này" after an eviction / hibernation (review e2e F1): a team standing still hears the one that comes back', () => {
    const { f, e, to } = racing({ t0: 2, t1: 1 }); // t0 (on L2) back at T1's place, done: its list there is shown
    const last = (team: string) => (to(team).filter((m) => (m as { t: string }).t === 'zone').at(-1) as { teams: unknown[] } | undefined)?.teams;
    e.onPose('t0', at(1), 10);
    e.onPose('t1', at(1), 11);
    e.onPose('t1', { ...at(1), x: 1e5, z: 1e5 }, 100);
    expect(last('t0')).toEqual([expect.objectContaining({ slot: 1, left: 100 })]);
    f.poses.set('t0', at(1)); // its trusted pose (RaceRoom's snapshot), it sends nothing: standing still
    const woken = new RaceEngine(f.io); // memory gone
    woken.onPose('t1', at(1), 200);
    expect(last('t0')).toEqual([{ slot: 1, label: 'Thử thách 1', type: 'challenge', branch: null, since: 200 }]);
  });
  // SPEC §17.44: multi-box task
  const PARTS = [{ label: 'Địa điểm 1' }, { label: 'Địa điểm 2' }, { label: 'Địa điểm 3' }, { label: 'Địa điểm 4' }];
  const partsLeg = () => {
    const raw = structuredClone(bundledLeg('mini')!) as any;
    Object.assign(raw.steps[1], { teaser: '', task: { ...raw.steps[1].task, verification: 'host_approval', answers: [], referenceAnswers: [], parts: PARTS } });
    return raw;
  };
  it('parts: the N strings reach the Host\'s queue as one answer with partLabels + scoreOf = 4; Phạt "đúng 2/4" hidden before minute 30, told from it; Duyệt = done', () => {
    const { e, f, op, to, card, review } = racing({ t0: 0 }, partsLeg());
    op('t0', { t: 'race', op: 'open', step: 'L1' }, 10, at(0)); // T1 has no teaser: its task starts with its clue (task_started_at = 10)
    f.log.length = 0;
    f.sent.length = 0;
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: '', parts: ['nơi một', 'nơi hai', 'x', 'y'] }, 1000);
    writesFirst(f);
    expect(to('t0').find((m) => (m as { t: string }).t === 'notice')).toEqual({ t: 'notice', code: 'answerSent' });
    expect(card('t0')).toMatchObject({ status: 'pending', task: { input: 'parts', partLabels: ['Địa điểm 1', 'Địa điểm 2', 'Địa điểm 3', 'Địa điểm 4'] }, answers: [{ id: 1, text: 'nơi một | nơi hai | x | y', status: 'pending' }] });
    expect(e.hostView(1001).queue).toEqual([expect.objectContaining({ team: 't0', step: 'T1', id: 1, text: 'nơi một | nơi hai | x | y', reference: [], scoreOf: 4, scoreFrom: 10 + 30 * 60_000, partLabels: ['Địa điểm 1', 'Địa điểm 2', 'Địa điểm 3', 'Địa điểm 4'] })]);
    // Phạt with "đúng 2/4" before minute 30: locked 3 min, the team sees no number (ever, for this one)
    review('t0', 'T1', 'penalize', 2000, { id: 1, score: 2 });
    expect(to('t0').filter((m) => (m as { t: string }).t === 'notice').at(-1)).toEqual({ t: 'notice', code: 'penalized' });
    expect(card('t0')).toMatchObject({ status: 'locked', lockedUntil: 2000 + 3 * 60_000, answers: [{ id: 1, status: 'penalized' }] });
    expect(card('t0')!.answers[0]).not.toHaveProperty('score');
    expect(e.hostView(2001).progress.find((p) => p.step === 'T1')).toMatchObject({ rejections: 1, lockedUntil: 2000 + 3 * 60_000 });
    // past minute 30: the count rides on the toast and the card
    const t30 = 10 + 30 * 60_000;
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: '', parts: ['nơi một', 'nơi hai', 'nơi ba', 'z'] }, t30);
    review('t0', 'T1', 'penalize', t30 + 5, { id: 2, score: 3 });
    expect(to('t0').filter((m) => (m as { t: string }).t === 'notice').at(-1)).toEqual({ t: 'notice', code: 'penalized', score: 3, of: 4 });
    expect(card('t0')!.answers.at(-1)).toMatchObject({ id: 2, status: 'penalized', score: 3, of: 4 });
    op('t0', { t: 'race', op: 'answer', step: 'T1', text: '', parts: ['nơi một', 'nơi hai', 'nơi ba', 'nơi bốn'] }, t30 + 4 * 60_000);
    review('t0', 'T1', 'approve', t30 + 4 * 60_000 + 5, { id: 3 });
    expect(card('t0')).toMatchObject({ step: 'L2' });
  });
  it('Leg 3 CETIQLO: cqRelease completes the step like a win ("Chờ quá 10 phút, được rời đi"), cqWin too; the release is undoable by the Host, the win is not offered', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE });
    const e = new RaceEngine(f.io);
    const replies: ServerMessage[] = [];
    e.onHost({ t: 'host.leg', json: JSON.stringify(cqLegRaw) }, (m) => replies.push(m), 0);
    expect(replies).toEqual([{ t: 'host.legResult', ok: true, issues: expect.any(Array) }]);
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1, step: 1 });
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 1);
    expect(e.cqStep('t0')).toBe('CQ');
    e.cqRelease('t0', 'CQ', 5000);
    expect(f.teams.get('t0')!.step).toBe(2);
    expect(e.cqStep('t0')).toBeNull();
    expect(e.hostView(5001).progress.find((p) => p.team === 't0' && p.step === 'CQ')!.answers).toEqual([expect.objectContaining({ text: 'Chờ quá 10 phút, được rời đi', status: 'correct' })]);
    expect(e.hostView(5001).undo).toEqual([expect.objectContaining({ team: 't0', step: 'CQ', id: 1, op: 'approve' })]);
    const host: ServerMessage[] = [];
    e.onHost({ t: 'host.review', team: 't0', step: 'CQ', op: 'undo', id: 1 }, (m) => host.push(m), 6000);
    expect(f.teams.get('t0')!.step).toBe(1);
    expect(e.cqStep('t0')).toBe('CQ');
    e.cqWin('t0', 'CQ', 7000);
    expect(f.teams.get('t0')!.step).toBe(2);
    expect(e.hostView(7001).undo).toEqual([]); // a win is final
  });

});
