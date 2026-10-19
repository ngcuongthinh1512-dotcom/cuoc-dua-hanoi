import { ORIGIN } from '@race/shared';
import { MEDIA, PROTOCOL_VERSION } from '@race/shared/protocol';
import { constantTimeEqual, HOST, newClaims, signToken, verifyToken } from './auth.ts';

export { RaceRoom } from './RaceRoom.ts';

export interface Env {
  ASSETS: Fetcher;
  RACE_ROOM: DurableObjectNamespace;
  MEDIA: R2Bucket;
  HOST_PASSWORD: string;
}

/** Race ids come from the Host's link (/?race=<id>): short slugs, one Durable Object each (docs/plans/phase6.md §3.1). */
const RACE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** A link without ?race= (client config net.defaultRace). */
const DEFAULT_RACE = 'bruxelles';
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
      const race = body?.race === undefined ? DEFAULT_RACE : typeof body.race === 'string' && RACE_ID.test(body.race) ? body.race : null;
      if (!body || !race) return json({ ok: false, error: 'bad_race' }, 400);
      if (typeof body.host === 'string') {
        if (!env.HOST_PASSWORD || !constantTimeEqual(body.host, env.HOST_PASSWORD)) return json({ ok: false, error: 'bad_password' }, 401);
        return json({ ok: true, token: await signToken(env.HOST_PASSWORD, newClaims(race, HOST)), role: HOST });
      }
      return env.RACE_ROOM.getByName(race).fetch(new Request(`${url.origin}/login`, { method: 'POST', headers: request.headers, body: JSON.stringify({ code: body.code }) }));
    }

    // WebSocket (token from /api/login as ?token=): the object verifies it and accepts with the Hibernation API.
    // Path segments are checked raw (never decoded): a valid race id / image name has no character encodeURIComponent
    // changes, and a broken escape (%E0) is a 400, not a URIError 500 (review R-11).
    const ws = /^\/api\/race\/([^/]+)\/ws$/.exec(pathname);
    if (ws && request.method === 'GET') {
      const race = ws[1]!;
      if (!RACE_ID.test(race)) return json({ ok: false, error: 'bad_race' }, 400);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ ok: false, error: 'expected_websocket' }, 426);
      return env.RACE_ROOM.getByName(race).fetch(new Request(`${url.origin}/ws${url.search}`, request));
    }
    const media = /^\/api\/race\/([^/]+)\/media\/([^/]+)$/.exec(pathname);
    if (media) return serveMedia(request, env, media[1]!, media[2]!);
    // SPEC §17.25: the raw timing data, Host token in `Authorization: Bearer` (never in the URL), ?format=csv (default) | json
    const exp = /^\/api\/race\/([^/]+)\/export$/.exec(pathname);
    if (exp && request.method === 'GET') {
      const race = exp[1]!;
      if (!RACE_ID.test(race)) return json({ ok: false, error: 'bad_race' }, 400);
      const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
      if ((await verifyToken(env.HOST_PASSWORD, token, race))?.t !== HOST) return json({ ok: false, error: 'bad_token' }, 401);
      const format = url.searchParams.get('format') ?? 'csv';
      if (format !== 'csv' && format !== 'json') return json({ ok: false, error: 'bad_format' }, 400);
      return env.RACE_ROOM.getByName(race).fetch(`https://do/export?format=${format}`);
    }
    return json({ ok: false, error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;

/** Phase 8 (docs/plans/phase8.md D12–D14): clue images on R2 (private bucket MEDIA, key `<race>/<name>`), the token in
 *  `Authorization: Bearer` (never in the URL). PUT / HEAD: Host token, R2 directly (no DO). GET: the Host always; a team
 *  only for an image of a clue it has opened (its DO answers 204 / 404, the Worker streams R2 itself) — "missing" and "not
 *  yet yours" are the same 404, so a later step's image name leaks nothing. `private, no-cache` + ETag (review R-9): the
 *  browser asks again each time (304 when unchanged, still one DO question), so an image the Host re-uploads under the
 *  same name reaches the teams that already saw the old one. */
async function serveMedia(request: Request, env: Env, race: string, name: string): Promise<Response> {
  if (!RACE_ID.test(race) || !MEDIA.name.test(name)) return json({ ok: false, error: 'bad_name' }, 400);
  const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  const claims = await verifyToken(env.HOST_PASSWORD, token, race);
  if (!claims) return json({ ok: false, error: 'bad_token' }, 401);
  const key = `${race}/${name}`;
  const host = claims.t === HOST;
  if (request.method === 'GET') {
    const allowed = host || (await env.RACE_ROOM.getByName(race).fetch(`https://do/media?name=${encodeURIComponent(name)}&team=${encodeURIComponent(claims.t)}`)).status === 204;
    const obj = allowed ? await env.MEDIA.get(key, { onlyIf: request.headers }) : null;
    if (!obj) return json({ ok: false, error: 'not_found' }, 404);
    const headers = new Headers({ 'Cache-Control': 'private, no-cache', ETag: obj.httpEtag });
    obj.writeHttpMetadata(headers);
    // If-None-Match matched: R2 returns the object without its body
    return 'body' in obj ? new Response((obj as R2ObjectBody).body, { headers }) : new Response(null, { status: 304, headers });
  }
  if (!host) return json({ ok: false, error: 'host_only' }, 403);
  if (request.method === 'HEAD') {
    const h = await env.MEDIA.head(key);
    return new Response(null, { status: h ? 200 : 404, headers: h ? { 'Content-Length': String(h.size), 'Content-Type': h.httpMetadata?.contentType ?? '' } : {} });
  }
  if (request.method !== 'PUT') return json({ ok: false, error: 'method' }, 405);
  const type = (request.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!(MEDIA.types as readonly string[]).includes(type)) return json({ ok: false, error: 'bad_type', types: MEDIA.types }, 415);
  const length = request.headers.get('Content-Length');
  if (length === null || !request.body) return json({ ok: false, error: 'length_required' }, 411); // R2 put(stream) needs it
  const size = Number(length);
  if (!(size > 0 && size <= MEDIA.maxBytes)) return json({ ok: false, error: 'too_big', maxBytes: MEDIA.maxBytes }, 413);
  await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type } });
  return json({ ok: true, size });
}
