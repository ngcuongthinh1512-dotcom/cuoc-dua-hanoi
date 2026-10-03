// Phase 10 track S end to end through workerd (docs/plans/phase10.md §7 "DO thật", §10): Hoàn tác 10 s (Duyệt → undo →
// the old card, ≤ 7 rows; refused late / once the team moved on; after an eviction), clearing the red flag (3 rows,
// raised again on new evidence), "vừa rời đi" in "Tại điểm này", the SPEC §17.25 export (Host only, 0 rows, no answer,
// the same after an eviction). Teams walk (5 Hz poses) on the fake `nearLeg` (points 60 m apart, box within 40 m).
import { CLOSE, encodePose, NET, type ClueCard, type HostState, type RaceView, type Welcome, type ZoneMember } from '@race/shared/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answer, exportData, joinTeam, nearLeg, nearPoint, openSocket, raceHarness, review, setupRace, sleep, undo, walkTo } from './test/harness.ts';

const server = raceHarness();
beforeAll(async () => {
  await server.listen();
}, 60_000);
afterAll(() => server.close());

type Sock = Awaited<ReturnType<typeof joinTeam>>;
type Host = Awaited<ReturnType<typeof setupRace>>['host'];
type Pt = { x: number; z: number };
const P = [0, 1, 2, 3, 4, 5, 6].map((k) => nearPoint(k));
const sqlOf = (race: string) => server.getWorker().getDurableObjectStorage('RaceRoom', { name: race });
const query = async (race: string, q: string, ...args: unknown[]) => (await (await sqlOf(race)).exec(q, ...args)) as Record<string, unknown>[];
const W = (s: Sock) => s.welcome as unknown as Welcome;
const view = (s: Sock, match: (v: RaceView) => boolean) => s.until((m) => m.t === 'race' && match(m.view)) as Promise<{ view: RaceView }>;
const card = async (s: Sock, match: (c: ClueCard) => boolean) => (await view(s, (v) => !!v.card && match(v.card))).view.card!;
const step = (s: Sock, id: string) => card(s, (c) => c.step === id);
const notice = (s: Sock, code: string) => s.until((m) => m.t === 'notice' && m.code === code);
const hostState = (h: Host, match: (s: HostState) => boolean) => h.until((m) => m.t === 'host.state' && match(m)) as unknown as Promise<HostState>;
const hostNotice = (h: Host) => h.until((m) => m.t === 'host.notice') as Promise<{ level: string; message: string }>;
/** No pose for this long: the snapshot / replay rows are written and the tick loop is idle (row counts hold still). */
const settle = () => sleep(NET.replayMs + 500);
/** counters.rows now: a refused host.race (0 rows) makes the next host.state carry the current counters (everything
 *  queued before its notice skipped: an older host.state / host.notice). */
async function rowsNow(host: Host) {
  host.send({ t: 'host.race', op: 'resume' });
  await host.until((m) => m.t === 'host.notice' && m.message === 'Cuộc đua không ở trạng thái tạm dừng.');
  return (await hostState(host, () => true)).counters.rows;
}

/** A race on nearLeg, `n` teams joined, running. */
async function newRace(race: string, n: number) {
  const r = await setupRace(server, race, n);
  r.host.send({ t: 'host.leg', json: JSON.stringify(nearLeg()) });
  expect(await r.host.until((m) => m.t === 'host.legResult')).toMatchObject({ ok: true });
  const socks = await Promise.all(r.teams.map((t) => joinTeam(server, race, t.code)));
  r.host.send({ t: 'host.race', op: 'start' });
  await Promise.all(socks.map((s) => view(s, (v) => v.status === 'running')));
  return { ...r, socks };
}

/** From the team's start: L1 opened → T1 accepted → `text` answered (pending). Returns where it stands (L1's point). */
async function pendingT1(s: Sock, text = '42'): Promise<Pt> {
  const p = await walkTo(s, W(s).start!, P[1]!);
  s.send({ t: 'race', op: 'open', step: 'L1' });
  await step(s, 'T1');
  s.send({ t: 'race', op: 'accept', step: 'T1' });
  await card(s, (c) => c.status === 'active');
  answer(s, 'T1', text);
  await card(s, (c) => c.status === 'pending');
  return p;
}

describe.concurrent('Phase 10 (workerd)', () => {
  it('Duyệt → Hoàn tác: the team hears reviewUndone + its old card within 1 s, ≤ 7 rows, no later box; again → notice; a Phạt past 10 s refused; a team socket closed', async () => {
    const race = 'p10-undo';
    const { host, teams, socks: [a] } = await newRace(race, 1);
    const id = teams[0]!.id;
    await pendingT1(a!);
    await settle();
    review(host, id, 'T1', 'approve', 1);
    await notice(a!, 'approved');
    await step(a!, 'L2');
    const st = await hostState(host, (s) => s.undo.length > 0);
    expect(st.undo).toEqual([{ team: id, step: 'T1', id: 1, op: 'approve', at: expect.any(Number), until: st.undo[0]!.at + NET.undoMs }]);
    const t0 = Date.now();
    undo(host, id, 'T1', 1);
    const seen: any[] = [];
    const back = ((await a!.until((m) => (seen.push(m), m.t === 'race'))) as unknown as { view: RaceView }).view.card!;
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(back).toMatchObject({ step: 'T1', status: 'pending', answers: [{ id: 1, text: '42', status: 'pending' }] });
    const st2 = await hostState(host, () => true);
    expect(st2.counters.rows - st.counters.rows).toBeLessThanOrEqual(7);
    expect([st2.undo, st2.queue.map((q) => [q.team, q.step, q.id]), st2.teams[0]!.step]).toEqual([[], [[id, 'T1', 1]], 1]);
    seen.push(...(await a!.drain(2500)));
    a!.send({ t: 'race', op: 'view' }); // a sign of life (0 rows): the socket stays under NET.deadSocketMs of silence
    expect(seen.filter((m) => m.t === 'notice').map((m) => m.code)).toEqual(['reviewUndone']);
    expect(seen.filter((m) => m.t === 'box')).toEqual([{ t: 'box', op: 'hide', step: 'L2' }]); // never a later step's box
    expect(await query(race, 'SELECT step FROM step_progress WHERE team = ? ORDER BY step', id)).toEqual([{ step: 'L1' }, { step: 'T1' }]); // L2 deleted
    const ev = await query(race, "SELECT type, data FROM events WHERE team = ? AND type IN ('review', 'host.undo') ORDER BY id", id);
    expect(ev.map((e) => [e.type, JSON.parse(e.data as string)])).toEqual([['review', { step: 'T1', op: 'approve', id: 1, by: 'host' }], ['host.undo', { step: 'T1', op: 'approve', id: 1 }]]);
    undo(host, id, 'T1', 1);
    expect(await hostNotice(host)).toEqual({ t: 'host.notice', level: 'warning', message: 'Không còn gì để hoàn tác cho bài này.' });
    // a Phạt, undone past NET.undoMs: refused (the Host uses «Duyệt câu vừa phạt» then)
    review(host, id, 'T1', 'penalize', 1);
    await card(a!, (c) => c.status === 'locked');
    await sleep(NET.undoMs + 300);
    undo(host, id, 'T1', 1);
    expect(await hostNotice(host)).toMatchObject({ level: 'warning', message: expect.stringContaining('Quá 10 giây') });
    // a team socket: the codec takes host.review from a Host only
    a!.send({ t: 'host.review', team: id, step: 'T1', op: 'undo', id: 1 });
    expect(await a!.until(() => false, 3000)).toEqual({ closed: CLOSE.badMessage });
    host.close();
  }, 90_000);

  it('Hoàn tác refused once the team moved on (opened the next box)', async () => {
    const race = 'p10-undo-moved';
    const { host, teams, socks: [a] } = await newRace(race, 1);
    const id = teams[0]!.id;
    await walkTo(a!, await pendingT1(a!), P[3]!); // to L2's point while T1 waits for the Host
    review(host, id, 'T1', 'approve', 1);
    await step(a!, 'L2');
    a!.send({ t: 'race', op: 'open', step: 'L2' });
    await step(a!, 'D1');
    undo(host, id, 'T1', 1);
    expect(await hostNotice(host)).toMatchObject({ level: 'warning', message: 'Đội đã đi tiếp / có quyết định mới hơn, không hoàn tác được.' });
    expect((await hostState(host, (s) => s.teams[0]!.step === 3)).undo).toEqual([]);
    for (const s of [a!, host]) s.close();
  }, 60_000);

  it('red flag: raised with its reason + time, "Xóa cờ" = 3 rows + host.unflag, raised again on new evidence (another reason)', async () => {
    const race = 'p10-flag';
    const { host, teams } = await setupRace(server, race, 1); // the default leg: 4 m/s on foot
    const a = await joinTeam(server, race, teams[0]!.code);
    const id = teams[0]!.id;
    const s0 = W(a).start!;
    await walkTo(a, s0, { x: s0.x + 60, z: s0.z }, 20); // 20 m/s for 3 s
    const st = await hostState(host, (s) => s.teams[0]!.flagged);
    expect(st.teams[0]).toMatchObject({ flagged: true, flagWhy: ['speed'], flagAt: expect.any(Number) });
    await settle();
    const r0 = await rowsNow(host);
    host.send({ t: 'host.flag', op: 'clear', team: id });
    const st2 = await hostState(host, (s) => !s.teams[0]!.flagged);
    expect(st2.teams[0]).toMatchObject({ flagged: false, flagWhy: [], flagAt: null });
    expect(st2.counters.rows - r0).toBe(3);
    const ev = await query(race, "SELECT data FROM events WHERE type = 'host.unflag' AND team = ?", id);
    expect(ev.map((e) => JSON.parse(e.data as string))).toEqual([{ why: ['speed'], since: st.teams[0]!.flagAt }]);
    host.send({ t: 'host.flag', op: 'clear', team: id });
    expect(await hostNotice(host)).toEqual({ t: 'host.notice', level: 'warning', message: 'Đội này không có cờ.' });
    host.send({ t: 'host.flag', op: 'clear', team: 'nope' });
    expect(await hostNotice(host)).toMatchObject({ level: 'error', message: 'Không có đội này.' });
    // new evidence: a 2 km jump (still the old speed episode: no new `speed`) → flagged again, for the jump, a new time
    a.send(encodePose({ x: s0.x + 2060, y: 0, z: s0.z, yaw: 0, mode: 'walk', action: 'none' }));
    const st3 = await hostState(host, (s) => s.teams[0]!.flagged);
    expect(st3.teams[0]).toMatchObject({ flagWhy: ['jump'], flagAt: expect.any(Number) });
    expect(st3.teams[0]!.flagAt!).toBeGreaterThan(st.teams[0]!.flagAt!);
    for (const s of [a, host]) s.close();
  }, 60_000);

  it('"vừa rời đi" (V4): a team that walks out / disconnects stays in the other\'s "Tại điểm này" with `left`; back = no `left`', async () => {
    const race = 'p10-zone';
    const { host, teams, socks: [a, b] } = await newRace(race, 2);
    const slotA = teams[0]!.slot;
    const away = { x: P[1]!.x, z: P[1]!.z + 100 };
    const listOfB = (match: (z: ZoneMember | undefined) => boolean) => b!.until((m) => m.t === 'zone' && match((m.teams as ZoneMember[]).find((z) => z.slot === slotA))) as Promise<{ teams: ZoneMember[] }>;
    await Promise.all([walkTo(a!, W(a!).start!, P[1]!), walkTo(b!, W(b!).start!, P[1]!)]); // both arrive at L1's point
    await listOfB((z) => !!z && z.left === undefined);
    await walkTo(a!, P[1]!, away);
    const out = await listOfB((z) => !!z?.left);
    expect(out.teams).toEqual([{ slot: slotA, label: 'Lộ trình 1', type: 'route_info', branch: null, since: expect.any(Number), left: expect.any(Number) }]);
    expect(out.teams[0]!.left!).toBeGreaterThan(out.teams[0]!.since);
    await walkTo(a!, away, P[1]!);
    await listOfB((z) => !!z && z.left === undefined); // back: there again
    a!.close();
    expect((await listOfB((z) => !!z?.left)).teams).toHaveLength(1); // its socket went: "vừa rời đi" too
    for (const s of [b!, host]) s.close();
  }, 60_000);

  it('SPEC §17.25 export: Host token only, csv (BOM, Vietnamese headers) / json = the SQLite rows, no answer / note, 0 rows written', async () => {
    const race = 'p10-export';
    const { host, hostToken, teams, socks: [a] } = await newRace(race, 1);
    const id = teams[0]!.id;
    await pendingT1(a!, 'ĐÁP ÁN BÍ MẬT');
    review(host, id, 'T1', 'penalize', 1, 'GHI CHÚ BÍ MẬT');
    await card(a!, (c) => c.status === 'locked');
    review(host, id, 'T1', 'approve', 1); // N4
    await step(a!, 'L2');
    expect((await exportData(server, race)).status).toBe(401);
    expect((await exportData(server, race, a!.token, 'json')).status).toBe(401); // a team's token
    expect((await exportData(server, race, hostToken, 'xml')).status).toBe(400);
    await settle();
    const r0 = await rowsNow(host);
    const res = await exportData(server, race, hostToken, 'json');
    expect([res.status, res.headers.get('Content-Disposition'), res.headers.get('Content-Type')]).toEqual([200, `attachment; filename="race-${race}-thoi-gian.json"`, 'application/json; charset=utf-8']);
    const text = await res.text();
    const j = JSON.parse(text) as { race: string; teams: Record<string, unknown>[]; steps: Record<string, unknown>[]; events: Record<string, unknown>[] };
    const [t1] = await query(race, 'SELECT * FROM step_progress WHERE team = ? AND step = ?', id, 'T1');
    expect(j.steps.map((s) => s.step)).toEqual(['L1', 'T1', 'L2']);
    expect(j.steps[1]).toMatchObject({
      team: id, openedAt: t1!.clue_opened_at, startedAt: t1!.task_started_at, completedAt: t1!.completed_at, rejections: 1, wrongAnswers: 0,
      approvalWaitSeconds: Math.round(t1!.approval_wait_seconds as number), completedAtFromPrev: Math.round(((t1!.completed_at as number) - (t1!.clue_opened_at as number)) / 1000),
    });
    expect(j.teams).toEqual([expect.objectContaining({ team: id, startOrder: 1, rank: null, finishAt: null, out: false })]);
    expect(j.events.map((e) => e.type)).toEqual(expect.arrayContaining(['host.race', 'arrive', 'complete', 'review']));
    const csv = await exportData(server, race, hostToken);
    expect([csv.headers.get('Content-Type'), csv.headers.get('Content-Disposition')]).toEqual(['text/csv; charset=utf-8', `attachment; filename="race-${race}-thoi-gian.csv"`]);
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csvText = new TextDecoder().decode(bytes);
    expect(csvText).toContain('Bảng 1 – Thời gian đội × bước\r\nĐội (id),Tên đội,Mã bước,');
    for (const s of [text, csvText]) for (const secret of ['BÍ MẬT', 'bốn mươi hai']) expect(s).not.toContain(secret);
    expect(await rowsNow(host)).toBe(r0); // read only
    for (const s of [a!, host]) s.close();
  }, 60_000);
});

describe('Phase 10 after an eviction', () => {
  it('a Duyệt is undone after the Durable Object was evicted (meta "undo"); the export reads the same from SQLite', async () => {
    const race = 'p10-evict';
    const { host, hostToken, teams, socks: [a] } = await newRace(race, 1);
    const id = teams[0]!.id;
    await pendingT1(a!);
    await settle(); // the tick loop idle: the eviction does not wait for it
    review(host, id, 'T1', 'approve', 1);
    await step(a!, 'L2');
    const before = await (await exportData(server, race, hostToken, 'json')).json() as { steps: unknown[]; teams: unknown[]; events: unknown[] };
    await server.getWorker().evictDurableObject('RaceRoom', { name: race, webSockets: 'close' });
    const after = await (await exportData(server, race, hostToken, 'json')).json() as typeof before;
    expect([after.steps, after.teams, after.events.slice(0, before.events.length)]).toEqual([before.steps, before.teams, before.events]);
    const h2 = await openSocket(server, race, hostToken);
    expect((await hostState(h2, () => true)).undo).toMatchObject([{ team: id, step: 'T1', id: 1, op: 'approve' }]);
    undo(h2, id, 'T1', 1);
    await hostState(h2, (s) => s.teams[0]!.step === 1 && !s.undo.length);
    const a2 = await joinTeam(server, race, teams[0]!.code);
    expect(W(a2).view!.card).toMatchObject({ step: 'T1', status: 'pending', answers: [{ id: 1, status: 'pending' }] });
    for (const s of [a2, h2, host]) s.close();
  }, 90_000);
});
