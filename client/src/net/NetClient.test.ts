import { CLOSE, encodeTick, NET, PROTOCOL_VERSION, type PoseSample, type Welcome } from '@race/shared/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { netClient, remote } from '../config.ts';
import { backoffMs, ClockSync, NetClient, type NetDown, PoseGate, type Socket } from './NetClient.ts';

const pose = (x = 0): PoseSample => ({ x, y: 0, z: 0, yaw: 0, mode: 'walk', action: 'none' });

describe('PoseGate (SPEC §3: 5 Hz, only on change)', () => {
  it('two identical poses → one message', () => {
    const g = new PoseGate();
    expect(g.next(pose(1), 0)).not.toBeNull();
    expect(g.next(pose(1), 1000)).toBeNull();
    expect(g.next(pose(1.001), 2000)).toBeNull(); // same once rounded to cm
  });

  it('20 different poses within 1 s → at most NET.sendHz messages', () => {
    const g = new PoseGate();
    let sent = 0;
    for (let i = 0; i < 20; i++) if (g.next(pose(i), i * 50)) sent++;
    expect(sent).toBeLessThanOrEqual(NET.sendHz);
    expect(sent).toBeGreaterThanOrEqual(NET.sendHz - 1);
  });

  it('reset (reconnect) sends the unchanged pose again at once', () => {
    const g = new PoseGate();
    g.next(pose(1), 0);
    g.reset();
    expect(g.next(pose(1), 10)).not.toBeNull();
  });
});

describe('backoff and clock', () => {
  it('backoffMs follows netClient.reconnectMs and repeats the last value', () => {
    const r = netClient.reconnectMs;
    expect(r.map((_, i) => backoffMs(i))).toEqual([...r]);
    expect(backoffMs(r.length + 7)).toBe(r.at(-1));
  });

  it('ClockSync keeps the least delayed sample and sinks by clockSlewMs per sample', () => {
    const c = new ClockSync();
    expect(c.now(100)).toBe(100); // no sample: local clock
    c.sample(10_000, 1_000); // offset 9000
    c.sample(10_100, 1_150); // arrived 50 ms later than the first: offset 8950 < 9000 − slew
    expect(c.offset).toBe(9000 - remote.clockSlewMs);
    c.sample(10_400, 1_390); // a faster one: 9010
    expect(c.offset).toBe(9010);
    expect(c.now(2_000)).toBe(11_010);
  });
});

/** A WebSocket stand-in: the test opens / closes it and pushes server frames. */
class FakeSocket implements Socket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: Socket['onopen'] = null;
  onmessage: Socket['onmessage'] = null;
  onclose: Socket['onclose'] = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
  }
  push(m: unknown) {
    this.onmessage?.({ data: typeof m === 'string' ? m : JSON.stringify(m) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const welcome = (v = PROTOCOL_VERSION): Welcome => ({
  t: 'welcome', v, race: 'paris', serverMs: Date.now(), status: 'lobby', role: 'team', teams: [],
  movement: { footSpeed: 4, bikeSpeedMultiplier: 1.3 }, presence: { renderRadius: 300, showOthersOnMinimap: false, interestRadius: 500 },
  pose: null, raceTime: null, bikes: [], boxes: [], view: null, startOrder: 1, showStartOrder: false, start: null,
});

describe('NetClient (fake socket, fake timers)', () => {
  let status: [boolean, NetDown | undefined][];
  let ticks: number;
  let client: NetClient;
  const last = () => FakeSocket.all.at(-1)!;
  const connect = () => {
    last().open();
    last().push(welcome());
  };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    status = [];
    ticks = 0;
    client = new NetClient(
      { race: 'paris', token: 'tok en', role: 'team' },
      { welcome: () => {}, tick: () => void ticks++, message: () => {}, status: (c, r) => void status.push([c, r]) },
      { open: (u) => new FakeSocket(u), url: 'ws://x/api/race/paris/ws' },
    );
    client.connect();
  });
  afterEach(() => {
    client.close();
    vi.useRealTimers();
  });

  it('opens the race socket with the token; connected after the welcome; poses only then', () => {
    expect(last().url).toBe('ws://x/api/race/paris/ws?token=tok%20en');
    last().open();
    client.sendPose(pose(1));
    expect(last().sent).toEqual([]); // no welcome yet
    last().push(welcome());
    expect(client.connected).toBe(true);
    expect(status).toEqual([[true, undefined]]);
    client.sendPose(pose(1));
    expect(last().sent).toEqual([JSON.stringify([1, 100, 0, 0, 0, 0, 0])]);
  });

  it('ticks reach the handler after the welcome; a malformed frame is skipped', () => {
    connect();
    last().push(encodeTick(Date.now(), [{ slot: 2, pose: pose(3) }]));
    last().push('{oops');
    last().push([2, 1, 0]);
    expect(ticks).toBe(1);
  });

  it('a dropped socket reconnects with backoff (1 s, 2 s, …), the welcome resets it', () => {
    connect();
    last().drop(1006);
    expect(status.at(-1)).toEqual([false, 'closed']);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(backoffMs(0) - 1);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(2);
    last().drop(1006); // the server is still down
    vi.advanceTimersByTime(backoffMs(1));
    expect(FakeSocket.all).toHaveLength(3);
    connect(); // back
    expect(client.connected).toBe(true);
    expect(client.stats.reconnects).toBe(2);
    last().drop(1001);
    vi.advanceTimersByTime(backoffMs(0));
    expect(FakeSocket.all).toHaveLength(4); // the attempt counter restarted
  });

  it('too many / too big / bad message closes reconnect with backoff (a stall flushes a burst of poses, review fix)', () => {
    for (const code of [CLOSE.tooFast, CLOSE.tooBig, CLOSE.badMessage]) {
      connect();
      const n = FakeSocket.all.length;
      last().drop(code);
      expect(status.at(-1)).toEqual([false, 'closed']);
      vi.advanceTimersByTime(backoffMs(0));
      expect(FakeSocket.all).toHaveLength(n + 1);
    }
  });

  it('kick / final close codes stop for good (other device, bad token); a protocol mismatch asks for a reload', () => {
    connect();
    last().push({ t: 'kick', reason: 'otherDevice' });
    last().drop(CLOSE.otherDevice);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(status.at(-1)).toEqual([false, 'otherDevice']);

    const c2 = new NetClient({ race: 'paris', token: 't', role: 'team' }, { welcome: () => {}, tick: () => {}, message: () => {}, status: (c, r) => void status.push([c, r]) }, { open: (u) => new FakeSocket(u), url: 'ws://x' });
    c2.connect();
    last().drop(CLOSE.badToken);
    vi.advanceTimersByTime(60_000);
    expect(status.at(-1)).toEqual([false, 'badToken']);
    expect(FakeSocket.all).toHaveLength(2);

    const c3 = new NetClient({ race: 'paris', token: 't', role: 'team' }, { welcome: () => {}, tick: () => {}, message: () => {}, status: (c, r) => void status.push([c, r]) }, { open: (u) => new FakeSocket(u), url: 'ws://x' });
    c3.connect();
    last().open();
    last().push(welcome(PROTOCOL_VERSION + 1));
    expect(status.at(-1)).toEqual([false, 'version']);
    expect(c3.connected).toBe(false);
  });

  it('pings every NET.pingMs once connected; the pong gives the round trip', () => {
    connect();
    vi.advanceTimersByTime(NET.pingMs);
    expect(last().sent).toEqual([NET.ping]);
    vi.advanceTimersByTime(42);
    last().push(NET.pong);
    expect(client.rtt).toBe(42);
  });
});
