import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { louvreRoom as C } from '../config.ts';
import type { ClueCard, TaskView } from '@race/shared/protocol';
import { raceClient } from '../config.ts';
import { addColliders, autoExitLeft, buttonStates, demoLouvre, paintingSize, pickChange, ROOM_TEXT, roomCardOf, roomFrame, roomPrompt, targetAt, toLocal, toWorld, wallSlots } from './LouvreRoom.ts';

const lv = demoLouvre(100, -50, 1.1);
const slots = wallSlots(lv.artworks);
const { width: W, depth: D } = C.size;

describe('wallSlots (docs/plans/phase8b.md §F)', () => {
  it('23 places in leg order, inside the room, ≥ minSpacing apart, none at the entry gap', () => {
    expect(slots.map((s) => s.id)).toEqual(lv.artworks.map((a) => a.id));
    expect(slots.filter((s) => s.type === 'sculpture')).toHaveLength(8);
    for (const [i, a] of slots.entries()) {
      expect(Math.abs(a.x)).toBeLessThanOrEqual(W / 2 + 1e-9);
      expect(Math.abs(a.z)).toBeLessThanOrEqual(D / 2 + 1e-9);
      if (a.z === -D / 2) expect(Math.abs(a.x)).toBeGreaterThan(C.door.width / 2 + 1); // front wall: clear of the entry gap
      for (const b of slots.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(C.slots.minSpacing);
        expect(Math.hypot(a.button.x - b.button.x, a.button.z - b.button.z)).toBeGreaterThan(1); // buttons apart
      }
    }
  });
  it('buttons button.fromWall off the wall, in front of (not inside) a plinth, facing into the room', () => {
    const P = C.plinth;
    for (const s of slots) {
      expect(Math.hypot(s.button.x - s.x, s.button.z - s.z)).toBeCloseTo(C.button.fromWall);
      expect(Math.hypot(s.nx, s.nz)).toBeCloseTo(1);
      expect(Math.sin(s.yaw)).toBeCloseTo(s.nx);
      expect(Math.cos(s.yaw)).toBeCloseTo(s.nz);
      expect(Math.abs(s.x + s.nx) < W / 2 && Math.abs(s.z + s.nz) < D / 2).toBe(true); // the normal points inward
      if (s.type === 'sculpture') expect(C.button.fromWall - C.button.radius).toBeGreaterThan(P.fromWall + P.size); // the plinth does not hide the button
    }
  });
});

describe('room frame: the entry point straight under the box, in / out keep x, z (critic S5)', () => {
  const f = roomFrame(lv.room, 13.7);
  it('the entry point is at the box, the room behind it, the floor below.m under the ground (≥ minFloorY)', () => {
    const door = toWorld(f, 0, -D / 2);
    expect(door.x).toBeCloseTo(lv.room.x);
    expect(door.z).toBeCloseTo(lv.room.z);
    expect(f.floorY).toBeCloseTo(13.7 - C.below);
    expect(roomFrame(lv.room, -20).floorY).toBe(C.minFloorY);
    const back = toLocal(f, f.cx - Math.sin(f.yaw) * 3, f.cz - Math.cos(f.yaw) * 3); // 3 m towards the box's front from the centre
    expect(back.z).toBeCloseTo(-3);
  });
  it('enter / exit within louvreRoom.inset (≤ 2 m) of the box: only y changes; enter is inside, exit outside', () => {
    expect(Math.hypot(f.enter.x - lv.room.x, f.enter.z - lv.room.z)).toBeCloseTo(C.inset);
    expect(Math.hypot(f.exit.x - lv.room.x, f.exit.z - lv.room.z)).toBeCloseTo(C.inset);
    expect(C.inset).toBeLessThanOrEqual(2);
    const e = toLocal(f, f.enter.x, f.enter.z);
    expect(Math.abs(e.x)).toBeLessThan(0.01);
    expect(e.z).toBeGreaterThan(-D / 2);
    expect(toLocal(f, f.exit.x, f.exit.z).z).toBeLessThan(-D / 2);
    // entering faces into the room (body yaw: forward = (−sin, −cos))
    const fwd = toLocal(f, f.cx - Math.sin(f.enter.yaw), f.cz - Math.cos(f.enter.yaw));
    expect(fwd.z).toBeCloseTo(1);
  });
  it('toLocal ∘ toWorld = identity', () => {
    const w = toWorld(f, 3.2, -4.5);
    const l = toLocal(f, w.x, w.z);
    expect(l.x).toBeCloseTo(3.2);
    expect(l.z).toBeCloseTo(-4.5);
  });
});

describe('F in the room: targetAt (button → lock; SPEC §17.33: no door)', () => {
  const s = slots[10]!;
  it('the nearest button within reach the view faces; facing away: not that one', () => {
    const [x, z] = [s.button.x + s.nx * 1, s.button.z + s.nz * 1];
    expect(targetAt(slots, x, z, -s.nx, -s.nz)).toEqual({ kind: 'button', id: s.id });
    expect(targetAt(slots, x, z, s.nx, s.nz)).toBeNull();
    expect(targetAt(slots, s.button.x + s.nx * 3, s.button.z + s.nz * 3, -s.nx, -s.nz)).toBeNull(); // out of reach
  });
  it('the lock button in the middle; nothing at the front wall (no door)', () => {
    expect(targetAt(slots, 1, 0, 0, 1)).toEqual({ kind: 'lock' });
    expect(targetAt(slots, 0, -D / 2 + C.inset, 0, -1)).toBeNull();
    expect(targetAt(slots, 0, -3, 0, 1)).toBeNull();
  });
});

describe('lights from this team only (SPEC §17.19)', () => {
  it('green = in the card picks, red otherwise; nothing else feeds them', () => {
    const on = buttonStates(slots, ['art-04', 'art-11']);
    expect(on.filter(Boolean)).toHaveLength(2);
    expect(on[3]).toBe(true);
    expect(on[10]).toBe(true);
    expect(buttonStates(slots, [])).toEqual(slots.map(() => false));
  });
  it('prompts: choose / unpick / full at 5 / lock (no door line)', () => {
    const o = { done: false, locked: false };
    expect(roomPrompt({ kind: 'button', id: 'art-01' }, lv, o)).toBe('Bấm F: chọn tác phẩm này');
    expect(roomPrompt({ kind: 'button', id: 'art-04' }, lv, o)).toBe('Bấm F: bỏ chọn');
    const five = { ...lv, picks: ['a', 'b', 'c', 'd', 'e'], maxPicks: 5 };
    expect(roomPrompt({ kind: 'button', id: 'art-01' }, five, o)).toBe('Đã đủ 5 – bỏ một tác phẩm trước');
    expect(roomPrompt({ kind: 'lock' }, lv, o)).toBe('Bấm F để chốt (đang chọn 2)');
    expect(roomPrompt({ kind: 'lock' }, { ...lv, picks: [] }, o)).toBe('Chưa chọn tác phẩm nào');
    expect(roomPrompt({ kind: 'button', id: 'art-01' }, lv, { done: true, locked: false })).toBeNull();
  });
});

describe('colliders: floor + walls + plinths, NO ceiling (critic C2)', () => {
  beforeAll(() => RAPIER.init());
  it('a ray from above lands on the floor (surface() / "Kẹt?" stay in the room), the walls hold', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const f = roomFrame(lv.room, 13.7);
    const cs = addColliders(world, f, slots);
    world.step();
    expect(cs.length).toBe(6 + 23 + 8);
    const down = (x: number, z: number, from: number) => world.castRay(new RAPIER.Ray({ x, y: from, z }, { x: 0, y: -1, z: 0 }), 100, true);
    const hit = down(f.enter.x, f.enter.z, f.floorY + 12);
    expect(hit && f.floorY + 12 - hit.timeOfImpact).toBeCloseTo(f.floorY);
    const lock = down(f.cx, f.cz, f.floorY + 12);
    expect(lock && f.floorY + 12 - lock.timeOfImpact).toBeCloseTo(f.floorY + C.plinth.height);
    // walking out of the back wall: a horizontal ray from the centre hits it
    const dir = { x: Math.sin(f.yaw), y: 0, z: Math.cos(f.yaw) }; // towards the back wall (away from the box)
    const p = toWorld(f, 0, 2);
    const wall = world.castRay(new RAPIER.Ray({ x: p.x, y: f.floorY + 2.5, z: p.z }, dir), 50, true);
    expect(wall?.timeOfImpact).toBeCloseTo(D / 2 - 2);
  });
});

describe('Phase 8B fix F2', () => {
  const task: TaskView = { title: 'P', description: '', media: [], kind: 'louvre', verification: 'auto', input: 'room', proofInstruction: '', timeLimitMinutes: null, louvre: lv };
  const locked: ClueCard = { step: 'T3', type: 'challenge', label: 'Thử thách 3', text: '', media: [], status: 'locked', lockedUntil: 180_000, lockKind: 'retry', answers: [], receivedAt: 0, completedAt: null, retryPenaltyMinutes: 3, task };

  it('(1) a wrong lock whose 3 minutes ran out unlocks the lock button with no new card from the server', () => {
    expect(roomCardOf(locked, 100_000)?.status).toBe('locked');
    const after = roomCardOf(locked, 180_000 + raceClient.lockEndSlackMs);
    expect(after?.status).toBe('active');
    expect(roomPrompt({ kind: 'lock' }, after!.lv, { done: false, locked: after!.status === 'locked' })).toBe(`Bấm F để chốt (đang chọn ${lv.picks.length})`);
    expect(roomCardOf({ ...locked, task: undefined }, 0)).toBeNull();
  });

  it('(7) the click plays only for a pick the server took', () => {
    expect(pickChange(['a'], ['a', 'b'])).toBe(true);
    expect(pickChange(['a', 'b'], ['a'])).toBe(false);
    expect(pickChange(['a'], ['a'])).toBeNull(); // refused / paused: same picks
    expect(pickChange(undefined, ['a'])).toBeNull();
  });

  it('(6) the picture keeps its aspect: painting.height tall, a wide one maxWidth wide', () => {
    const P = C.painting;
    expect(paintingSize(0.67)).toEqual([P.height * 0.67, P.height]);
    const [w, h] = paintingSize(3);
    expect(w).toBe(P.maxWidth);
    expect(h).toBeCloseTo(P.maxWidth / 3);
    // the widest frame still fits between two neighbours
    expect(P.maxWidth + 2 * P.frame).toBeLessThan(Math.min(...slots.slice(1).map((s, i) => Math.hypot(s.x - slots[i]!.x, s.z - slots[i]!.z))));
  });

  it('(7) a scan never overhangs its plinth', () => {
    expect(Math.max(C.plinth.glbBox[0], C.plinth.glbBox[2])).toBeLessThanOrEqual(C.plinth.size);
  });
});

describe('SPEC §17.33: a right lock → "CHÍNH XÁC", the automatic exit autoExitSeconds later', () => {
  it('no countdown before the step is done; whole seconds left; 0 = leave now, never negative', () => {
    expect(autoExitLeft(null, 10_000)).toBeNull();
    expect(autoExitLeft(10_000, 10_000)).toBe(C.autoExitSeconds);
    expect(autoExitLeft(10_000, 10_000 + C.autoExitSeconds * 1000 - 1)).toBe(1);
    expect(autoExitLeft(10_000, 10_000 + C.autoExitSeconds * 1000)).toBe(0);
    expect(autoExitLeft(10_000, 10_000 + C.autoExitSeconds * 1000 + 999)).toBe(0);
  });

  it('the words: a big "CHÍNH XÁC", the small countdown line', () => {
    expect(ROOM_TEXT.correct).toBe('CHÍNH XÁC');
    expect(ROOM_TEXT.autoExit(5)).toBe('Bạn sẽ ra khỏi phòng sau 5 giây…');
    expect(C.autoExitSeconds).toBe(5);
  });
});
