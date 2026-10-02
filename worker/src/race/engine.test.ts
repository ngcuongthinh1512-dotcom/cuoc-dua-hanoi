// RaceEngine with a fake RaceIO that logs the order of calls (docs/plans/phase7.md track A: replaces the "SQLite before
// the race message" harness check, which the DO output gate makes unable to fail): rows first, messages after; a failing
// write sends nothing and leaves the cache as it was.
import { branchZone, stepZones, type Leg } from '@race/shared/leg';
import type { PoseSample, RaceOp, RaceView, ServerMessage } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
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
    event: (_t: number, _team: string | null, type: string) => {
      if (fail) throw new Error('disk');
      log.push(`event ${type}`);
    },
    team: (id: string) => teams.get(id),
    saveTeam: (id: string, r: TeamRace) => {
      if (fail) throw new Error('disk');
      log.push('saveTeam');
      teams.set(id, r);
    },
    teamIds: () => [...teams.keys()],
    slot: (id: string) => [...teams.keys()].indexOf(id),
    online: () => [...teams.keys()],
    pose: (id: string) => poses.get(id) ?? null,
    park: () => log.push('park'),
    legLoaded: () => {},
    hideBox: (team: string, step: string, branch: string) => log.push(`hideBox ${team} ${step} ${branch}`),
  };
  return { io, log, txs, sent, teams, setFail: (v: boolean) => (fail = v) };
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
    e.onHost({ t: 'host.leg', id: 'paris-demo' }, (m) => r.push(m), 30);
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
    for (const [id, step] of Object.entries(steps)) f.teams.set(id, { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1, startAt: 1, step });
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 1);
    f.log.length = 0;
    f.sent.length = 0;
    f.txs.length = 0;
    const host: ServerMessage[] = [];
    const review = (team: string, step: string, op: 'approve' | 'penalize' | 'note', now: number, more: { id?: number; note?: string } = {}) => e.onHost({ t: 'host.review', team, step, op, ...more }, (m) => host.push(m), now);
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
    expect(f.log).toEqual(['sql INSERT INTO step_progress', 'event review', 'send notice', 'send race']);
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
    expect(f.log.filter((l) => !l.startsWith('send'))).toEqual(['sql INSERT INTO step_progress', 'sql INSERT INTO step_progress', 'event review', 'event complete', 'saveTeam']);
    expect(to('t0').slice(-2)).toEqual([{ t: 'notice', code: 'approved' }, { t: 'race', view: expect.objectContaining({ card: expect.objectContaining({ step: 'L2', receivedAt: 50_000 }) }) }]);
    expect(f.teams.get('t0')!.step).toBe(2);
    // review R-11: the Host who clicked "Duyệt" hears it overruled a "Phạt" (a second Host's screen a second old)
    expect(host.slice(1)).toEqual([{ t: 'host.notice', level: 'warning', message: expect.stringContaining('vừa bị Phạt, nay đã được Duyệt') }]);
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
    const { e, op, card } = racing({ t0: 3 });
    const za = branchZone(mini, Z, 3, 'A')!;
    const foot: PoseSample = { x: za.x, y: 0, z: za.z, yaw: 0, mode: 'walk', action: 'none' };
    op('t0', { t: 'race', op: 'branch', step: 'D1', branch: 'A' }, 5);
    op('t0', { t: 'race', op: 'open', step: 'D1', branch: 'A' }, 6, foot);
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

  it('officialMs deducts the approval waits (SPEC §8.9) unless hostApproval.approvalWaitCounts', () => {
    for (const counts of [false, true]) {
      const leg = structuredClone(bundledLeg('mini')!) as Leg;
      leg.hostApproval.approvalWaitCounts = counts;
      const { f, review, op, e, host } = racing({ t0: 1 }, leg);
      op('t0', { t: 'race', op: 'accept', step: 'T1' }, 5);
      op('t0', { t: 'race', op: 'answer', step: 'T1', text: '42' }, 10_000);
      review('t0', 'T1', 'approve', 40_000);
      expect(host).toEqual([]); // a plain approval: no notice to the Host (R-11 warns only over a "Phạt")
      f.teams.set('t0', { ...f.teams.get('t0')!, step: 4 }); // L3: the route into the Pit Stop zone
      e.onPose('t0', at(4), 100_001);
      const v = (f.sent.filter(([, m]) => (m as { t: string }).t === 'race').at(-1)![1] as { view: RaceView }).view;
      expect(v.officialMs).toBe(100_000 - (counts ? 0 : 30_000));
      expect(e.hostView(100_002).ranking[0]!.officialMs).toBe(v.officialMs);
    }
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

  it('D15: a start time after the team\'s check-in is refused; a change for a running team moves its clock, which then only runs forward', () => {
    const f = fake();
    f.teams.set('t0', { ...NEW_TEAM_RACE, startOrder: 1, joinedAt: 1, startAt: 100_000, finishAt: 900_000 }).set('t1', { ...NEW_TEAM_RACE, startOrder: 2, joinedAt: 1 });
    const e = new RaceEngine(f.io);
    e.onHost({ t: 'host.race', op: 'start' }, () => {}, 0);
    const r: ServerMessage[] = [];
    const startAt = (team: string, at: number | 'now', now: number) => e.onHost({ t: 'host.team', op: 'startAt', team, at }, (m) => r.push(m), now);
    f.log.length = 0;
    startAt('t0', 900_001, 1_000_000);
    expect(r).toEqual([{ t: 'host.notice', level: 'error', message: expect.stringContaining('về đích') }]);
    expect(f.log).toEqual([]); // nothing written, nothing sent to the team
    expect(f.teams.get('t0')!.startAt).toBe(100_000);
    startAt('t0', 900_000, 1_000_000); // = the check-in: allowed
    expect(f.sent.at(-1)).toEqual(['t0', { t: 'race', view: expect.objectContaining({ startAt: 900_000, officialMs: 0 }) }]);
    // a running team: each change moves its clock; from there it only runs forward and never below 0 (≤ 60 s ahead is
    // accepted for a clock skew)
    const clock = (now: number) => e.summary('t1', now).raceTime;
    startAt('t1', 400_000, 1_000_000);
    expect([1_000_000, 1_005_000].map(clock)).toEqual([600, 605]);
    startAt('t1', 'now', 1_010_000);
    expect([1_010_000, 1_011_000].map(clock)).toEqual([0, 1]);
    startAt('t1', 1_050_000, 1_020_000);
    expect([1_020_000, 1_040_000, 1_050_000, 1_055_000].map(clock)).toEqual([0, 0, 0, 5]);
    const views = f.sent.filter(([t, m]) => t === 't1' && (m as { t: string }).t === 'race').map(([, m]) => (m as { view: { startAt: number | null } }).view.startAt);
    expect(views.slice(-3)).toEqual([400_000, 1_010_000, 1_050_000]);
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
});
