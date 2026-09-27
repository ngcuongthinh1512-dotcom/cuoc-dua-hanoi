import { DurableObject } from 'cloudflare:workers';

// Phase 0: just enough to prove the Durable Object + SQLite wiring. Phase 6 builds the real room.
export class RaceRoom extends DurableObject {
  async fetch() {
    const { one } = this.ctx.storage.sql.exec<{ one: number }>('SELECT 1 AS one').one();
    return Response.json({ ok: one === 1, room: 'dev', sqlite: this.ctx.storage.sql.databaseSize });
  }
}
