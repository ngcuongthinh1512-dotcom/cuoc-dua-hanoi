// Phase 6 track B (docs/plans/phase6.md §5.2): the browser's WebSocket to the race's Durable Object. Sends the pose at
// NET.sendHz only when the rounded array changed (SPEC §3), ops as JSON, `ping` every NET.pingMs (auto-answered by the
// server without waking it: the round trip is the ping shown in F3), reconnects with backoff, stops on `kick`.
import type { ClientMessage, KickReason, PoseSample, ServerMessage, TickArray, TickEntry, Welcome } from '@race/shared/protocol';
import type { Session } from './session.ts';

export interface NetEvents {
  welcome(w: Welcome): void;
  tick(serverMs: number, entries: readonly TickEntry[]): void;
  message(m: Exclude<ServerMessage, TickArray | Welcome>): void;
  /** Connected / disconnected (reason: a kick, or 'closed' = will reconnect). */
  status(connected: boolean, reason?: KickReason | 'closed'): void;
}

/** Foundation stub: never connects. Track B replaces the bodies, keeps the signatures. */
export class NetClient {
  readonly stats = { sent: 0, received: 0, ticks: 0, reconnects: 0, bytesOut: 0, bytesIn: 0 };
  /** Last measured round trip, ms (NaN until the first pong). */
  rtt = NaN;

  constructor(
    readonly session: Session,
    readonly events: NetEvents,
  ) {}

  get connected() {
    return false;
  }

  connect() {}

  close() {}

  /** Call every frame with the local pose; the client decides when to send. */
  sendPose(_p: PoseSample) {}

  send(_m: ClientMessage) {}

  /** Estimated server clock (ms) now, for interpolating remote players against tick timestamps. */
  serverNow(): number {
    return Date.now();
  }
}
