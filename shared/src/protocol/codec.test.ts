import { describe, expect, it } from 'vitest';
import { decodePose, decodeTick, encodePose, encodeTick, isClientMessage, parseFrame, POSE_LEN, samePose } from './codec.ts';
import { NET, PROTOCOL_VERSION } from './constants.ts';
import { type FeedMessage, type HostMessage, type LouvreView, MOVE_MODES, PLAYER_ACTIONS, type PoseSample, type RaceOp, type ServerMessage, submitCode, TAG, type UndoItem, type ZoneMember } from './types.ts';

const pose: PoseSample = { x: 123.456, y: 1.234, z: -910.117, yaw: 2.5, mode: 'bike', action: 'none' };

describe('pose codec', () => {
  it('round-trips within 1 cm / 1 mrad and stays small', () => {
    const a = encodePose(pose);
    expect(a).toHaveLength(POSE_LEN);
    expect(a[0]).toBe(TAG.pos);
    expect(a.every(Number.isInteger)).toBe(true);
    const p = decodePose(a)!;
    expect(Math.abs(p.x - pose.x)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(p.y - pose.y)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(p.z - pose.z)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(p.yaw - pose.yaw)).toBeLessThanOrEqual(0.0005);
    expect([p.mode, p.action]).toEqual(['bike', 'none']);
    expect(JSON.stringify(a).length).toBeLessThan(40);
  });

  it('wraps the heading and encodes a still body to the same array', () => {
    expect(decodePose(encodePose({ ...pose, yaw: 2.5 + 2 * Math.PI }))!.yaw).toBeCloseTo(2.5, 3);
    expect(samePose(encodePose(pose), encodePose({ ...pose, x: pose.x + 0.004 }))).toBe(true); // < 1 cm: no send
    expect(samePose(encodePose(pose), encodePose({ ...pose, x: pose.x + 0.02 }))).toBe(false);
  });

  it('covers every mode and action', () => {
    for (const mode of MOVE_MODES) for (const action of PLAYER_ACTIONS) expect(decodePose(encodePose({ ...pose, mode, action }))).toMatchObject({ mode, action });
  });

  it('rejects malformed poses', () => {
    const ok = encodePose(pose);
    expect(decodePose(ok.slice(0, 6))).toBeNull(); // short
    expect(decodePose([...ok, 1])).toBeNull(); // long
    expect(decodePose([TAG.tick, ...ok.slice(1)])).toBeNull(); // wrong tag
    expect(decodePose([TAG.pos, 1.5, 0, 0, 0, 0, 0])).toBeNull(); // not an integer
    expect(decodePose([TAG.pos, 2_000_000, 0, 0, 0, 0, 0])).toBeNull(); // 20 km away
    expect(decodePose([TAG.pos, 0, -20_000, 0, 0, 0, 0])).toBeNull(); // 200 m under the Seine
    expect(decodePose([TAG.pos, 0, 0, 0, 0, MOVE_MODES.length, 0])).toBeNull();
    expect(decodePose([TAG.pos, 0, 0, 0, 0, 0, -1])).toBeNull();
    expect(decodePose([TAG.pos, 0, 0, 0, 0, 0, 'none'])).toBeNull();
    expect(decodePose([TAG.pos, 0, 0, 0, Infinity, 0, 0])).toBeNull();
    expect(decodePose({ t: 'pos' })).toBeNull();
    expect(decodePose(null)).toBeNull();
  });
});

describe('tick codec', () => {
  const entries = Array.from({ length: 20 }, (_, slot) => ({ slot, pose: { ...pose, x: pose.x + slot * 10, action: PLAYER_ACTIONS[slot % PLAYER_ACTIONS.length]! } }));

  it('round-trips 20 players in one small array', () => {
    const a = encodeTick(1_727_779_200_123.4, entries);
    const t = decodeTick(a)!;
    expect(t.serverMs).toBe(1_727_779_200_123);
    expect(t.entries).toHaveLength(20);
    t.entries.forEach((e, i) => {
      expect(e.slot).toBe(i);
      expect(e.pose.x).toBeCloseTo(entries[i]!.pose.x, 2);
      expect(e.pose.action).toBe(entries[i]!.pose.action);
    });
    expect(JSON.stringify(a).length).toBeLessThan(700); // measured 627 B (docs/plans/phase6.md §2)
    expect(decodeTick(encodeTick(5, []))).toEqual({ serverMs: 5, entries: [] });
  });

  it('rejects malformed ticks', () => {
    const a = encodeTick(1000, entries.slice(0, 2));
    expect(decodeTick(a.slice(0, -1))).toBeNull(); // stride broken
    expect(decodeTick([TAG.pos, ...a.slice(1)])).toBeNull();
    expect(decodeTick([TAG.tick, -1])).toBeNull();
    expect(decodeTick([TAG.tick, 1000, 20_000, ...a.slice(3, 9)])).toBeNull(); // slot out of range
    expect(decodeTick([TAG.tick, 1000, 0, 1.5, 0, 0, 0, 0, 0])).toBeNull();
  });
});

describe('frames and JSON messages', () => {
  it('parses within the size limit only', () => {
    expect(parseFrame('[1,2]', NET.maxPlayerBytes)).toEqual([1, 2]);
    expect(parseFrame('x'.repeat(NET.maxPlayerBytes + 1), NET.maxPlayerBytes)).toBeNull();
    expect(parseFrame('{bad', NET.maxPlayerBytes)).toBeNull();
    expect(parseFrame(new ArrayBuffer(4), NET.maxPlayerBytes)).toBeNull();
  });

  it('accepts the player ops and refuses Host ops from a team', () => {
    expect(isClientMessage({ t: 'respawn', x: 1, y: 2, z: 3, yaw: 0, how: 'stairs' }, 'team')).toBe(true);
    expect(isClientMessage({ t: 'respawn', x: 1, y: 2, z: 3, yaw: 0, how: 'teleport' }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'respawn', x: 1, y: 2, z: 3, how: 'safe' }, 'team')).toBe(false); // yaw missing
    // metre bounds = the pose codec's: anything accepted encodes to a pose decodePose / decodeTick take back
    for (const [x, y] of [[9_999.999, -100], [-10_000, 1_000]] as const) {
      expect(isClientMessage({ t: 'respawn', x, y, z: 0, yaw: 7, how: 'safe' }, 'team')).toBe(true);
      expect(decodePose(encodePose({ x, y, z: 0, yaw: 7, mode: 'walk', action: 'none' }))).not.toBeNull();
    }
    for (const [x, y] of [[10_000.01, 0], [500_000, 0], [0, 5_000], [0, -101]] as const) {
      expect(isClientMessage({ t: 'respawn', x, y, z: 0, yaw: 0, how: 'safe' }, 'team')).toBe(false);
    }
    expect(isClientMessage({ t: 'gesture', g: 'bell' }, 'team')).toBe(true);
    expect(isClientMessage({ t: 'gesture', g: 'dance' }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'bike', op: 'claim', id: 'b1' }, 'team')).toBe(true);
    expect(isClientMessage({ t: 'bike', op: 'dismount', id: 'b1' }, 'team')).toBe(false); // needs the resting pose
    expect(isClientMessage({ t: 'bike', op: 'dismount', id: 'b1', x: 1, y: 0, z: 2, yaw: 1 }, 'team')).toBe(true);
    expect(isClientMessage({ t: 'bike', op: 'steal', id: 'b1' }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'host.spawning', paused: true }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'host.spawning', paused: true }, 'host')).toBe(true);
    expect(isClientMessage({ t: 'host.createTeams', teams: [{ name: 'Đội Xanh', colour: '#2c6bd8' }] }, 'host')).toBe(true);
    expect(isClientMessage({ t: 'host.createTeams', teams: [{ name: '', colour: '#2c6bd8' }] }, 'host')).toBe(false);
    expect(isClientMessage({ t: 'host.candidates', segments: [[1, 2, 3, 4], []], decoys: [5, 6] }, 'host')).toBe(true);
    expect(isClientMessage({ t: 'host.candidates', segments: [[1, 2, 3]], decoys: [] }, 'host')).toBe(false);
    expect(isClientMessage([1, 2, 3], 'team')).toBe(false);
    expect(isClientMessage('respawn', 'team')).toBe(false);
    expect(isClientMessage({ t: 'welcome' }, 'team')).toBe(false);
  });

  it('Phase 7: race ops from a team, race / team / leg ops from the Host only', () => {
    for (const m of [{ t: 'race', op: 'open', step: 'L1' }, { t: 'race', op: 'open', step: 'D1', branch: 'A' }, { t: 'race', op: 'answer', step: 'T1', text: 'bảy' }, { t: 'race', op: 'checkin' }, { t: 'race', op: 'book' }])
      expect(isClientMessage(m, 'team')).toBe(true);
    expect(isClientMessage({ t: 'race', op: 'open' }, 'team')).toBe(false); // which box?
    expect(isClientMessage({ t: 'race', op: 'open', step: 'x'.repeat(17) }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'race', op: 'task', step: 'T1', answer: 'bảy' }, 'team')).toBe(false); // Phase 7 op, gone in v3
    expect(isClientMessage({ t: 'race', op: 'skip', step: 'L1' }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'host.race', op: 'pause' }, 'host')).toBe(true);
    expect(isClientMessage({ t: 'host.race', op: 'pause' }, 'team')).toBe(false);
    expect(isClientMessage({ t: 'host.race', op: 'restart' }, 'host')).toBe(false);
    // SPEC §17.23: no per-team start time any more (v5)
    for (const at of [1_790_000_000_000, null, 'now']) expect(isClientMessage({ t: 'host.team', op: 'startAt', team: 't0', at }, 'host')).toBe(false);
    expect(isClientMessage({ t: 'race', op: 'book' }, 'host')).toBe(false); // the Host socket has no team
    expect(isClientMessage({ t: 'host.leg', id: 'paris-demo' }, 'host')).toBe(true);
    expect(isClientMessage({ t: 'host.leg', json: '{}' }, 'host')).toBe(true);
    expect(isClientMessage({ t: 'host.leg', id: 'a', json: '{}' }, 'host')).toBe(false); // one or the other
    expect(isClientMessage({ t: 'host.leg', id: 'paris-demo' }, 'team')).toBe(false);
  });

  it('Phase 8: answer / accept / branch / open{branch} from a team, host.review from the Host, through a JSON frame', () => {
    const longest = 'Đ'.repeat(NET.answerMax); // Vietnamese, the full input length: one player frame still
    const team = [
      { t: 'race', op: 'answer', step: 'T1', text: 'Tháp Eiffel' },
      { t: 'race', op: 'answer', step: 'D1', text: '' }, // "Tôi đã gửi bài" of a photo task
      { t: 'race', op: 'answer', step: 'T2', text: longest },
      { t: 'race', op: 'accept', step: 'T1' },
      { t: 'race', op: 'branch', step: 'D1', branch: 'A' },
      { t: 'race', op: 'open', step: 'D1', branch: 'B' },
    ];
    const host = [
      { t: 'host.review', team: 't0', step: 'T1', op: 'approve', id: 2, note: 'đúng ý' },
      { t: 'host.review', team: 't0', step: 'D1', op: 'approve' }, // photo approved before the team pressed its button
      { t: 'host.review', team: 't0', step: 'T1', op: 'penalize', id: 1 },
      { t: 'host.review', team: 't0', step: 'T1', op: 'note', note: '' },
    ];
    for (const [list, role, max] of [[team, 'team', NET.maxPlayerBytes], [host, 'host', NET.maxHostBytes]] as const)
      for (const m of list) {
        const back = parseFrame(JSON.stringify(m), max);
        expect(back).toEqual(m);
        expect(isClientMessage(back, role)).toBe(true);
        expect(isClientMessage(back, role === 'team' ? 'host' : 'team')).toBe(false); // each side only its own
      }
  });

  it('Phase 8: refuses malformed answers, branches and reviews', () => {
    const bad: [unknown, 'team' | 'host'][] = [
      [{ t: 'race', op: 'answer', step: 'T1' }, 'team'], // no text
      [{ t: 'race', op: 'answer', step: 'T1', text: 'a'.repeat(NET.answerMax + 1) }, 'team'],
      [{ t: 'race', op: 'answer', step: 'T1', text: 42 }, 'team'],
      [{ t: 'race', op: 'branch', step: 'D1' }, 'team'], // which branch?
      [{ t: 'race', op: 'branch', step: 'D1', branch: '' }, 'team'],
      [{ t: 'race', op: 'open', step: 'D1', branch: 'x'.repeat(17) }, 'team'],
      [{ t: 'race', op: 'accept' }, 'team'],
      [{ t: 'host.review', team: 't0', step: 'T1', op: 'reject', id: 1 }, 'host'],
      [{ t: 'host.review', team: 't0', step: 'T1', op: 'approve', id: 0 }, 'host'],
      [{ t: 'host.review', team: 't0', step: 'T1', op: 'approve', id: 1.5 }, 'host'],
      [{ t: 'host.review', team: '', step: 'T1', op: 'approve', id: 1 }, 'host'],
      [{ t: 'host.review', team: 't0', step: 'T1', op: 'note', note: 'x'.repeat(NET.noteMax + 1) }, 'host'],
    ];
    for (const [m, role] of bad) expect(isClientMessage(m, role), JSON.stringify(m).slice(0, 80)).toBe(false);
  });

  it('Phase 10 (v6): host.review undo needs an id, host.flag clear; both from the Host only', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(6);
    const ok: HostMessage[] = [
      { t: 'host.review', team: 't0', step: 'T1', op: 'undo', id: 2 },
      { t: 'host.flag', op: 'clear', team: 't0' },
    ];
    for (const m of ok) {
      const back = parseFrame(JSON.stringify(m), NET.maxHostBytes);
      expect(back).toEqual(m);
      expect(isClientMessage(back, 'host')).toBe(true);
      expect(isClientMessage(back, 'team')).toBe(false);
    }
    const bad: unknown[] = [
      { t: 'host.review', team: 't0', step: 'T1', op: 'undo' }, // which decision?
      { t: 'host.review', team: 't0', step: 'T1', op: 'undo', id: 0 },
      { t: 'host.flag', op: 'set', team: 't0' },
      { t: 'host.flag', op: 'clear' },
      { t: 'host.flag', op: 'clear', team: '' },
    ];
    for (const m of bad) expect(isClientMessage(m, 'host'), JSON.stringify(m)).toBe(false);
    // server → client shapes with the new optional / required fields survive a JSON round trip
    const zone: ZoneMember = { slot: 2, label: 'Thử thách 2', type: 'challenge', branch: null, since: 1_000, left: 2_000 };
    const undo: UndoItem = { team: 't0', step: 'T1', id: 2, op: 'approve', at: 5_000, until: 5_000 + NET.undoMs };
    expect(JSON.parse(JSON.stringify({ zone, undo }))).toEqual({ zone, undo });
  });

  it('Phase 8B (v4): pick / lock / view / credits from a team only, through a JSON frame; view / credits carry no step', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(4); // 5: SPEC §17.22 / §17.23 (no team clock, RaceView.result)
    const ok: RaceOp[] = [
      { t: 'race', op: 'pick', step: 'T3', art: 'art-07', on: true },
      { t: 'race', op: 'pick', step: 'T3', art: 'x'.repeat(16), on: false },
      { t: 'race', op: 'lock', step: 'T3' },
      { t: 'race', op: 'view' },
      { t: 'race', op: 'credits' },
    ];
    for (const m of ok) {
      const back = parseFrame(JSON.stringify(m), NET.maxPlayerBytes);
      expect(back).toEqual(m);
      expect(isClientMessage(back, 'team')).toBe(true);
      expect(isClientMessage(back, 'host')).toBe(false);
    }
    const bad: unknown[] = [
      { t: 'race', op: 'pick', step: 'T3', art: 'art-07' }, // on?
      { t: 'race', op: 'pick', step: 'T3', art: 'art-07', on: 1 },
      { t: 'race', op: 'pick', step: 'T3', art: '', on: true },
      { t: 'race', op: 'pick', step: 'T3', art: 'x'.repeat(17), on: true },
      { t: 'race', op: 'pick', step: 'T3', art: 'art 07', on: true },
      { t: 'race', op: 'pick', art: 'art-07', on: true }, // which step?
      { t: 'race', op: 'lock' },
    ];
    for (const m of bad) expect(isClientMessage(m, 'team'), JSON.stringify(m)).toBe(false);
  });

  it('Phase 8B (v4): server → client louvre shapes survive a JSON round trip (welcome.feed, feed, credits, card)', () => {
    const feed: FeedMessage = { t: 'feed', at: 1_700_000_000_000, slot: 2, ok: false, minutes: 3, n: 2, of: 5 };
    const lv: LouvreView = { artworks: [{ id: 'art-01', type: 'sculpture', image: 'art-01.webp' }], room: { x: 1.5, z: -2, r: 20, yaw: 1.571 }, picks: ['art-01'], attempts: 1, hintAt: [10, 20], hintCount: 5, hintCorrect: null, maxPicks: 5 };
    const msgs: ServerMessage[] = [feed, { t: 'credits', items: [{ file: 'art-01.webp', title: '(GIẢ) Tranh', artist: '', photo: '', license: 'CC-BY-SA', source: '' }] }, { t: 'notice', code: 'pickLimit' }];
    for (const m of [...msgs, lv]) expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });

  it('Phase 8: submission code "<team>-<step>[-<branch>]" (card, Sổ, Host queue: one function)', () => {
    expect(submitCode('Đội Xanh', 'D1', 'A')).toBe('Đội Xanh-D1-A');
    expect(submitCode('Đội Xanh', 'T2', null)).toBe('Đội Xanh-T2');
  });
});
