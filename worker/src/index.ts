import { ORIGIN } from '@race/shared';

export { RaceRoom } from './RaceRoom.ts';

export interface Env {
  ASSETS: Fetcher;
  RACE_ROOM: DurableObjectNamespace;
  MEDIA: R2Bucket;
  HOST_PASSWORD: string;
}

// Static assets (client/dist) are matched before this handler runs; only unmatched paths get here.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/api/health') return Response.json({ ok: true, origin: ORIGIN });
    // ponytail: one fixed room "dev"; Phase 6 routes each race to its own RaceRoom.
    if (request.method === 'GET' && pathname === '/api/room/ping') return env.RACE_ROOM.getByName('dev').fetch(request);
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
