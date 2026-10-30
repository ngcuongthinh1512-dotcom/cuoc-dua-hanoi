import type { RaceView } from '@race/shared/protocol';
import { describe, expect, it } from 'vitest';
import { demoRoomResult, demoRoomViews, GARDEROBE_CARD, NEXT_CARD, roomCard } from './roomDemo.ts';
import { rooms } from '../config.ts';
import { devFrame, enterSpot, exitSpot, roomFrame, toLocal, toWorld } from './roomFrame.ts';
import { RoomFlow, roomOf } from './roomState.ts';

const view = (card: RaceView['card']): RaceView => ({ status: 'running', finishAt: null, penaltyMinutes: 0, card, checkinAt: null, result: null });

describe('roomOf: the view → the room the team is in', () => {
  it('a chosen + opened branch whose task has room', () => {
    const t = roomOf(view(roomCard('chocolate', 2)));
    expect(t).toMatchObject({ step: 'D1', branch: 'A', room: { kind: 'chocolate', total: 5, done: 2, skipped: false } });
    expect(roomOf(view(roomCard('comic', 3)))?.branch).toBe('B');
  });
  it('none: no card, the box not opened, no branch, a done step, a task without room, a route card', () => {
    expect(roomOf(null)).toBeNull();
    expect(roomOf(view(null))).toBeNull();
    expect(roomOf(view({ ...roomCard('chocolate', 0), branchOpened: false }))).toBeNull();
    expect(roomOf(view({ ...roomCard('chocolate', 0), branch: null }))).toBeNull();
    expect(roomOf(view({ ...roomCard('chocolate', 0), status: 'done' }))).toBeNull();
    const c = roomCard('chocolate', 0);
    expect(roomOf(view({ ...c, branches: c.branches!.map((b) => ({ ...b, task: b.task && { ...b.task, room: undefined } })) }))).toBeNull();
    expect(roomOf(view(NEXT_CARD))).toBeNull();
  });
});

describe('RoomFlow: enter / progress / exitReady + hold / resume / switched / left', () => {
  it('enters on the first room view, then only updates the target (no hold)', () => {
    const f = new RoomFlow();
    expect(f.onView(view(NEXT_CARD))).toEqual({ event: null, hold: false });
    expect(f.key).toBeNull();
    expect(f.onView(view(roomCard('chocolate', 0)))).toEqual({ event: 'enter', hold: false });
    expect(f.key).toBe('D1|A');
    expect(f.onView(view(roomCard('chocolate', 3)))).toEqual({ event: null, hold: false });
    expect(f.target?.room.done).toBe(3);
    expect(f.onView(view(roomCard('chocolate', 5, false, 'pending')))).toEqual({ event: null, hold: false }); // pending: still inside
  });
  it('the step completes inside: exitReady + the next card held until left(); a Host undo resumes', () => {
    const f = new RoomFlow();
    f.onView(view(roomCard('comic', 9, false, 'pending')));
    expect(f.onView(view(NEXT_CARD))).toEqual({ event: 'exitReady', hold: true });
    expect(f.exitReady).toBe(true);
    expect(f.key).toBe('D1|B'); // still inside until the body walks into the ring
    expect(f.onView(view(NEXT_CARD))).toEqual({ event: 'exitReady', hold: true }); // another message while waiting: still held
    expect(f.onView(view(roomCard('comic', 9, false, 'pending')))).toEqual({ event: 'resume', hold: false }); // "Hoàn tác"
    expect(f.exitReady).toBe(false);
    f.onView(view(NEXT_CARD));
    f.left();
    expect(f.key).toBeNull();
    expect(f.exitReady).toBe(false);
    expect(f.target).toBeNull();
    expect(f.onView(view(NEXT_CARD))).toEqual({ event: null, hold: false });
  });
  it('a skip is the same completion (the next card comes at once)', () => {
    const f = new RoomFlow();
    f.onView(view(roomCard('chocolate', 2)));
    expect(f.onView(view(NEXT_CARD)).event).toBe('exitReady');
  });
  it('a branch switch inside: the ring lights, the table locks, the view passes through; the team walks out by itself', () => {
    const f = new RoomFlow();
    const c = roomCard('chocolate', 2);
    f.onView(view(c));
    const sw = { ...c, branch: 'B', branchOpened: false, status: 'switchLocked' as const, leftRoom: 'chocolate' as const };
    expect(f.onView(view(sw))).toEqual({ event: 'switched', hold: false });
    expect(f.key).toBe('D1|~');
    expect(f.exitReady && f.locked).toBe(true);
    expect(f.target).toMatchObject({ exiting: true, room: { kind: 'chocolate' } });
    expect(f.onView(view(sw))).toEqual({ event: null, hold: false }); // the same again: nothing new
    expect(f.onView(view({ ...sw, status: 'goToBranch', lockedUntil: null, leftRoom: undefined }))).toEqual({ event: null, hold: false }); // the countdown over while still inside: still waiting at the ring
    f.left();
    expect(f.key).toBeNull();
    // the other branch's box opened: its room, from 0 (the server reset the progress)
    expect(f.onView(view(roomCard('comic', 0)))).toEqual({ event: 'enter', hold: false });
    expect(f.key).toBe('D1|B');
  });
  it('a reload after a switch (switchLocked + leftRoom): back in the old room, ring lit, table locked; without leftRoom: the world', () => {
    const f = new RoomFlow();
    const c = roomCard('comic', 3);
    expect(f.onView(view({ ...c, branch: 'A', branchOpened: false, status: 'switchLocked', leftRoom: 'comic' }))).toEqual({ event: 'enter', hold: false });
    expect(f.exitReady && f.locked).toBe(true);
    expect(f.target?.room.kind).toBe('comic');
    const g = new RoomFlow();
    expect(g.onView(view({ ...c, branch: 'A', branchOpened: false, status: 'switchLocked' }))).toEqual({ event: null, hold: false });
  });
  it('a reload inside: the welcome view enters again (same path)', () => {
    const f = new RoomFlow();
    expect(f.onView(view(roomCard('comic', 4))).event).toBe('enter');
  });
});

describe('the GardeRobe challenge room (ClueCard.room): enter, walk out at will, F back in, hold only when done inside', () => {
  it('roomOf: a challenge card with room → kind garderobe, no branch, no tally; none once done / without room', () => {
    expect(roomOf(view(GARDEROBE_CARD))).toMatchObject({ step: 'T1', branch: null, exiting: false, room: { kind: 'garderobe', total: 0 } });
    expect(roomOf(view({ ...GARDEROBE_CARD, status: 'done' }))).toBeNull();
    expect(roomOf(view({ ...GARDEROBE_CARD, room: undefined }))).toBeNull();
    expect(roomOf(view({ ...GARDEROBE_CARD, status: 'teaser', task: undefined }))?.room.kind).toBe('garderobe'); // the teaser card already enters
  });
  it('walks out before answering: the same card does not pull it back; F at the box re-enters; a card change (lock / pending) inside is no event', () => {
    const f = new RoomFlow();
    expect(f.onView(view(GARDEROBE_CARD))).toEqual({ event: 'enter', hold: false });
    expect(f.key).toBe('T1|~');
    expect(f.onView(view({ ...GARDEROBE_CARD, status: 'locked', lockedUntil: 5000, lockKind: 'retry' }))).toEqual({ event: null, hold: false });
    f.left();
    expect(f.key).toBeNull();
    expect(f.leftKey).toBe('T1|~');
    expect(f.onView(view(GARDEROBE_CARD))).toEqual({ event: null, hold: false }); // outside, the card still active: stays outside
    f.reenter();
    expect(f.onView(view(GARDEROBE_CARD))).toEqual({ event: 'enter', hold: false });
  });
  it('the step completes inside: the next card is held until left(); completes while outside: it pops at once', () => {
    const f = new RoomFlow();
    f.onView(view(GARDEROBE_CARD));
    expect(f.onView(view(NEXT_CARD))).toEqual({ event: 'exitReady', hold: true });
    f.left();
    expect(f.onView(view(NEXT_CARD))).toEqual({ event: null, hold: false });
    const g = new RoomFlow();
    g.onView(view(GARDEROBE_CARD));
    g.left();
    expect(g.onView(view(NEXT_CARD))).toEqual({ event: null, hold: false });
    expect(g.onView(view(GARDEROBE_CARD))).toEqual({ event: null, hold: false }); // a Host undo while outside: still outside (F re-enters)
  });
  it('demo: in / done / left views', () => {
    expect(demoRoomViews('garderobe', 'in')).toEqual({ first: expect.objectContaining({ card: GARDEROBE_CARD }), then: null });
    expect(demoRoomViews('garderobe', 'done').then?.card?.step).toBe('L2');
    expect(demoRoomViews('garderobe', 'left').then?.card?.step).toBe('L2');
  });
});

describe('roomDemo stand-ins', () => {
  it('every state yields a first view in the room; done / skipped / switch / left add a second', () => {
    for (const s of ['in', 'pending'] as const) expect(demoRoomViews('chocolate', s).then).toBeNull();
    for (const s of ['done', 'skipped', 'left'] as const) expect(demoRoomViews('comic', s).then?.card?.step).toBe('L2');
    expect(demoRoomViews('chocolate', 'switch').then?.card).toMatchObject({ status: 'switchLocked', leftRoom: 'chocolate' });
    expect(roomOf(demoRoomViews('chocolate', 'pending').first)?.room.done).toBe(5);
  });
  it('demoRoomResult: done grows, n/n → pending, a skip → the next card', () => {
    const v = demoRoomViews('chocolate', 'in').first;
    expect(roomOf(demoRoomResult(v, 3, false))?.room.done).toBe(3);
    expect(demoRoomResult(v, 5, false).card?.status).toBe('pending');
    expect(demoRoomResult(v, 2, true).card?.step).toBe('L2');
  });
});

describe('roomFrame: a room under its box, in / out only change y', () => {
  it('the door end sits at the box; enter / exit spots within rooms.inset of it; local ↔ world round-trips', () => {
    const f = roomFrame({ x: 100, z: -50, yaw: Math.PI / 2 }, 12, 12);
    expect(f.floorY).toBe(12 - rooms.below);
    expect(f.yaw).toBeCloseTo(Math.PI / 2 + Math.PI);
    // the exit spot is on the box's FRONT side (front = (−sin yaw, −cos yaw) = (−1, 0) for yaw π/2: west of the box), facing the box
    const ex = exitSpot(f);
    expect(ex.x).toBeLessThan(100);
    expect(ex.yaw).toBeCloseTo(f.yaw);
    const door = toWorld(f, 0, 12);
    expect(door.x).toBeCloseTo(100);
    expect(door.z).toBeCloseTo(-50);
    const e = enterSpot(f), x = exitSpot(f);
    expect(Math.hypot(e.x - 100, e.z + 50)).toBeCloseTo(rooms.enterInset);
    expect(Math.hypot(x.x - 100, x.z + 50)).toBeCloseTo(rooms.exitInset);
    expect(e.y).toBe(f.floorY);
    const l = toLocal(f, e.x, e.z);
    expect(l.x).toBeCloseTo(0);
    expect(l.z).toBeCloseTo(12 - rooms.enterInset);
    const w = toWorld(f, -3.4, 2.75), back = toLocal(f, w.x, w.z);
    expect(back.x).toBeCloseTo(-3.4);
    expect(back.z).toBeCloseTo(2.75);
    expect(roomFrame({ x: 0, z: 0 }, -100, 12).floorY).toBe(rooms.minFloorY); // never under the respawn line
    const d = devFrame(15);
    expect(toWorld(d, 1, 2)).toEqual({ x: 1, z: 2 });
  });
});
