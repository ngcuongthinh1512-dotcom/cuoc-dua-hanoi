// Phase 6 track B (docs/plans/phase6.md §5.2): the browser's WebSocket to the race's Durable Object. Sends the pose at
// NET.sendHz only when the rounded array changed (SPEC §3), ops as JSON, `ping` every NET.pingMs (auto-answered by the
// server without waking it: the round trip is the ping shown in F3), reconnects with backoff, stops on `kick`.
import {
  CLOSE, decodeTick, encodePose, NET, PROTOCOL_VERSION, samePose,
  type ClientMessage, type KickReason, type PoseSample, type ServerMessage, type TickArray, type TickEntry, type Welcome,
} from '@race/shared/protocol';
import { net, netClient, remote } from '../config.ts';
import type { Session } from './session.ts';

/** Why the connection is down: a kick / a close code that must not be retried, 'version' = the server speaks another
 *  PROTOCOL_VERSION (reload), 'closed' = dropped, reconnecting. */
export type NetDown = KickReason | 'version' | 'closed';

export interface NetEvents {
  welcome(w: Welcome): void;
  tick(serverMs: number, entries: readonly TickEntry[]): void;
  message(m: Exclude<ServerMessage, TickArray | Welcome>): void;
  /** Connected (a welcome arrived) / disconnected. */
  status(connected: boolean, reason?: NetDown): void;
}

/** Reconnect delay before attempt `n` (0-based): netClient.reconnectMs, the last value repeating. */
export const backoffMs = (n: number) => netClient.reconnectMs[Math.min(n, netClient.reconnectMs.length - 1)]!;

/** Close codes that end the session (no retry). */
const FINAL: Record<number, KickReason> = {
  [CLOSE.badToken]: 'badToken',
  [CLOSE.otherDevice]: 'otherDevice',
  [CLOSE.raceClosed]: 'raceClosed',
  [CLOSE.badMessage]: 'protocol',
  [CLOSE.tooBig]: 'protocol',
  [CLOSE.tooFast]: 'protocol',
};

/** SPEC §3: a pose goes out when its rounded array differs from the last one sent, at most NET.sendHz a second. */
export class PoseGate {
  private last: number[] | null = null;
  private at = -Infinity;

  /** The array to send now, or null. */
  next(p: PoseSample, now: number): number[] | null {
    if (now - this.at < 1000 / NET.sendHz) return null;
    const a = encodePose(p);
    if (this.last && samePose(a, this.last)) return null;
    [this.last, this.at] = [a, now];
    return a;
  }

  /** After a (re)connect the server must hear the pose at once. */
  reset() {
    [this.last, this.at] = [null, -Infinity];
  }
}

/** Server clock estimate: offset = the largest serverMs − local seen (the least delayed message), sinking by
 *  remote.clockSlewMs per sample so clock drift and a lucky early message wear off. */
export class ClockSync {
  offset = NaN;

  sample(serverMs: number, localMs: number) {
    const o = serverMs - localMs;
    this.offset = Number.isNaN(this.offset) ? o : Math.max(this.offset - remote.clockSlewMs, o);
  }

  now(localMs: number) {
    return localMs + (Number.isNaN(this.offset) ? 0 : this.offset);
  }
}

/** The bits of a browser WebSocket used here (tests pass a fake). */
export interface Socket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
}
const OPEN = 1;

export class NetClient {
  readonly stats = { sent: 0, received: 0, ticks: 0, reconnects: 0, bytesOut: 0, bytesIn: 0 };
  /** Last measured round trip, ms (NaN until the first pong). */
  rtt = NaN;
  private ws: Socket | null = null;
  private welcomed = false;
  private stopped = false;
  private attempt = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private pinger: ReturnType<typeof setInterval> | undefined;
  private pingAt = NaN;
  private readonly gate = new PoseGate();
  private readonly clock = new ClockSync();

  constructor(
    readonly session: Session,
    readonly events: NetEvents,
    private readonly deps: { open?: (url: string) => Socket; url?: string } = {},
  ) {}

  get connected() {
    return this.welcomed && this.ws?.readyState === OPEN;
  }

  connect() {
    if (this.stopped) return;
    const url =
      this.deps.url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${net.apiBase}/race/${encodeURIComponent(this.session.race)}/ws`;
    const ws = (this.ws = (this.deps.open ?? ((u) => new WebSocket(u) as unknown as Socket))(`${url}?token=${encodeURIComponent(this.session.token)}`));
    ws.onmessage = (e) => typeof e.data === 'string' && this.receive(e.data);
    ws.onclose = (e) => this.closed(ws, e.code);
  }

  /** Ends the session (no reconnect). */
  close() {
    this.stopped = true;
    this.drop();
  }

  /** Call every frame with the local pose; the client decides when to send. */
  sendPose(p: PoseSample) {
    if (!this.connected) return;
    const a = this.gate.next(p, Date.now());
    if (a) this.write(JSON.stringify(a));
  }

  send(m: ClientMessage) {
    if (this.connected) this.write(JSON.stringify(m));
  }

  /** Estimated server clock (ms) now, for interpolating remote players against tick timestamps. */
  serverNow(): number {
    return this.clock.now(Date.now());
  }

  private write(text: string) {
    this.ws!.send(text);
    this.stats.sent++;
    this.stats.bytesOut += text.length;
  }

  private receive(text: string) {
    this.stats.received++;
    this.stats.bytesIn += text.length;
    if (text === NET.pong) return void (this.rtt = Date.now() - this.pingAt);
    let m: unknown;
    try {
      m = JSON.parse(text);
    } catch {
      return; // not ours: ignored (the server closes on malformed frames, the client just skips them)
    }
    if (Array.isArray(m)) {
      const t = decodeTick(m);
      if (!t || !this.welcomed) return;
      this.stats.ticks++;
      this.clock.sample(t.serverMs, Date.now());
      return this.events.tick(t.serverMs, t.entries);
    }
    const msg = m as Exclude<ServerMessage, TickArray>;
    if (typeof msg !== 'object' || msg === null || typeof msg.t !== 'string') return;
    if (msg.t === 'welcome') return this.welcome(msg);
    if (msg.t === 'kick') return this.stop(msg.reason);
    this.events.message(msg);
  }

  private welcome(w: Welcome) {
    if (w.v !== PROTOCOL_VERSION) return this.stop('version');
    this.session.welcome = w;
    this.welcomed = true;
    this.attempt = 0;
    this.gate.reset();
    this.clock.sample(w.serverMs, Date.now());
    clearInterval(this.pinger);
    this.pinger = setInterval(() => {
      if (this.ws?.readyState !== OPEN) return;
      this.pingAt = Date.now();
      this.ws.send(NET.ping); // answered by the server's auto-response (not billed, does not wake it)
    }, NET.pingMs);
    this.events.welcome(w);
    this.events.status(true);
  }

  private stop(reason: NetDown) {
    if (this.stopped) return;
    this.close();
    this.events.status(false, reason);
  }

  private drop() {
    clearInterval(this.pinger);
    clearTimeout(this.retry);
    const ws = this.ws;
    this.ws = null;
    this.welcomed = false;
    if (ws && ws.readyState <= OPEN) ws.close(1000);
  }

  private closed(ws: Socket, code: number) {
    if (ws !== this.ws) return; // an old socket we already dropped
    const final = FINAL[code];
    if (final) return this.stop(final);
    const was = this.welcomed;
    this.drop();
    if (this.stopped) return;
    if (was || this.attempt === 0) this.events.status(false, 'closed');
    this.retry = setTimeout(() => {
      this.stats.reconnects++;
      this.connect();
    }, backoffMs(this.attempt++));
  }
}
