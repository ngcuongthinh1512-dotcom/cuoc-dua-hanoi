# CLAUDE.md – Cuộc đua Paris

Browser 3D race game (1 leg in central Paris) + Host screen. Full spec: `docs/SPEC.md` (§17 overrides earlier sections). Never edit `docs/SPEC.md`.

## Stack
- Everything on Cloudflare: Workers Static Assets (client build) + Worker (API) + one SQLite-backed Durable Object `RaceRoom` per race + R2 bucket `MEDIA` + secret `HOST_PASSWORD`. No Node server, no Colyseus, no VPS.
- npm workspaces, TypeScript strict (`tsconfig.base.json`, TS 7 native `tsc`), Vitest, Vite, wrangler, Playwright (`playwright-core` + system Chrome).
- Client (from Phase 1): Three.js + @dimforge/rapier3d-compat. Leg schema: zod in `/shared` (Phase 7).

## Folders
```
client/   Vite app (game + Host screen at /host) → client/dist = static assets
worker/   Worker (src/index.ts) + Durable Object RaceRoom (src/RaceRoom.ts), wrangler.toml, legs/*.json (server-only leg content)
shared/   @race/shared, TS source only (no build): constants, projection; later protocol + zod schema
scripts/  screenshot.ts; later fetch-osm, fetch-dem, build-graph, sim
docs/     SPEC.md, RACE_RULES.md (player rules, Vietnamese); DEPLOY.md in Phase 12
```

## Coordinates
- 1 unit = 1 m. Origin (0,0,0) = Concorde obelisk 48.86548, 2.32115. X = East, Z = −North, Y = up.
- Use only `latLonToWorld` / `worldToLatLon` from `shared/src/projection.ts`; `RACE_BBOX` / `ORIGIN` in `shared/src/constants.ts`.

## Server principles
- The Durable Object is authoritative (clues, answers, timing, penalties, ranking, bike claims).
- Leg content (clues, answers) never goes into static assets or the client bundle; answers are never sent to the client (client sends an answer, gets right/wrong); R2 media (private bucket) is served by the Worker only to teams that have unlocked that clue.
- Write every important change to DO SQLite BEFORE acking the client; rebuild all state from SQLite on DO start.
- No heavy compute in the DO: road graph / A* / bike corridors are computed in the Host browser; the DO only picks randomly from the submitted candidates.

## Cloudflare quota budget (SPEC §3, mandatory)
- Client sends position 5 Hz, only on change, as compact number arrays rounded to cm (20 WS messages = 1 billable request).
- Server batches all positions into 1 broadcast per tick at 5 Hz.
- SQLite batched writes: last positions of ALL teams = 1 upserted row every 2 s; replay log 1 row per 10 s; race events immediately.
- Budget for a 2 h / 20-team race: < 40,000 billable requests and < 20,000 SQLite rows written.
- DO Alarms for periodic bike spawning; no loop when nobody is connected.
- Each static asset ≤ 25 MB (Draco/Meshopt, KTX2); big media on R2.
- Host debug view shows estimated counters: WS messages received, SQLite rows written.

## Input (SPEC §17: PC Windows + macOS only)
- No Ctrl / Alt / Option / Cmd / Win as gameplay keys; no F-key as the only binding; never F5 / F11 / F12.
- Bindings by `KeyboardEvent.code` in `client/src/config.ts` (Phase 1), several keys per action. Key table: SPEC §17.2.

## Commands
- `npm run dev` – client Vite dev server.
- `npm run dev:worker` – builds client, then `wrangler dev` on :8787 (static assets + API + DO + SQLite + R2 locally). Copy `worker/.dev.vars.example` → `worker/.dev.vars`.
- `npm run build` – typecheck everything + client build + `wrangler deploy --dry-run` bundle check. Run it from the root: the worker build needs `client/dist`.
- `npm test` – Vitest in every workspace.
- `npm run screenshot [preset]` – headless Chrome → `screenshots/<preset>.png`; fails on console errors. Pages set `window.__READY__ = true` once rendered and settled (game: a few frames drawn, physics boxes at rest); presets live in `scripts/screenshot.ts`.
- Client URL overrides: `?cam=x,y,z,yawDeg,pitchDeg` (camera pose, yaw 0 = north / −Z), `?debug=1` (F3 overlay on).
- Later: `fetch-map` (Phase 2), `build-graph` (Phase 4), `sim` (Phase 11), `deploy` (Phase 12).

## Workflow
- Before each phase: read `docs/SPEC.md` + this file, write a short plan, list packages to install.
- `npm run build && npm test` must pass after each phase; commit `feat(phaseN): …`.
- Anything not done (missing model, API key…) → placeholder + `TODO.md`. Never silently drop a requirement.
- All tunables in `client/src/config.ts` or the leg config; never hard-code speeds etc. elsewhere.
- UI / player & Host docs / README / TODO in Vietnamese with diacritics; code, identifiers, files, APIs in English.
- Visual check via `npm run screenshot`, then look at the PNG.
- Minimal code; deliberate shortcuts get `// ponytail: <ceiling>, <upgrade path>`.
- Do not leave `wrangler dev` / `workerd` / `vite` running.
