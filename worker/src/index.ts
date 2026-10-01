import { ORIGIN } from '@race/shared';
import { PROTOCOL_VERSION } from '@race/shared/protocol';
import { constantTimeEqual, HOST, newClaims, signToken } from './auth.ts';

export { RaceRoom } from './RaceRoom.ts';

export interface Env {
  ASSETS: Fetcher;
  RACE_ROOM: DurableObjectNamespace;
  MEDIA: R2Bucket;
  HOST_PASSWORD: string;
}

/** Race ids come from the Host's link (/?race=<id>): short slugs, one Durable Object each (docs/plans/phase6.md §3.1). */
const RACE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const json = (body: unknown, status = 200) => Response.json(body, { status });

// Static assets (client/dist) are matched before this handler runs; only unmatched paths get here.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === 'GET' && pathname === '/api/health') return json({ ok: true, origin: ORIGIN, v: PROTOCOL_VERSION });

    // Login (SPEC §3, §7): {race, code} → the race's object checks the team code; {race, host} → password → Host token.
    if (request.method === 'POST' && pathname === '/api/login') {
      const body = (await request.json().catch(() => null)) as { race?: unknown; code?: unknown; host?: unknown } | null;
      const race = typeof body?.race === 'string' && RACE_ID.test(body.race) ? body.race : null;
      if (!body || !race) return json({ ok: false, error: 'bad_race' }, 400);
      if (typeof body.host === 'string') {
        if (!env.HOST_PASSWORD || !constantTimeEqual(body.host, env.HOST_PASSWORD)) return json({ ok: false, error: 'bad_password' }, 401);
        return json({ ok: true, token: await signToken(env.HOST_PASSWORD, newClaims(race, HOST)), role: HOST });
      }
      return env.RACE_ROOM.getByName(race).fetch(new Request(`${url.origin}/login`, { method: 'POST', headers: request.headers, body: JSON.stringify({ code: body.code }) }));
    }

    // WebSocket (token from /api/login as ?token=): the object verifies it and accepts with the Hibernation API.
    const ws = /^\/api\/race\/([^/]+)\/ws$/.exec(pathname);
    if (ws && request.method === 'GET') {
      const race = decodeURIComponent(ws[1]!);
      if (!RACE_ID.test(race)) return json({ ok: false, error: 'bad_race' }, 400);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ ok: false, error: 'expected_websocket' }, 426);
      return env.RACE_ROOM.getByName(race).fetch(new Request(`${url.origin}/ws${url.search}`, request));
    }
    return json({ ok: false, error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
