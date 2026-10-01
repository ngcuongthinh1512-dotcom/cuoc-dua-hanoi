// Estimated Cloudflare usage of one race (SPEC §3: the Host debug view shows them). Kept in memory, persisted inside the
// snapshot row (no extra row writes), reloaded on Durable Object start.
import type { QuotaCounters as Counters } from '@race/shared/protocol';

export class QuotaCounters implements Counters {
  wsIn = 0;
  wsOut = 0;
  http = 0;
  alarms = 0;
  rows = 0;

  static from(json: Partial<Counters> | undefined): QuotaCounters {
    return Object.assign(new QuotaCounters(), json ?? {});
  }

  /** Durable Object requests as Cloudflare bills them: HTTP + alarms + incoming WebSocket messages at 20:1. */
  get billableRequests() {
    return this.http + this.alarms + Math.ceil(this.wsIn / 20);
  }

  toJSON(): Counters {
    const { wsIn, wsOut, http, alarms, rows } = this;
    return { wsIn, wsOut, http, alarms, rows };
  }
}
