# Phase 7 review – spec + code + security + quota

Reviewer: spec + code + security + quota (no servers; scripts in the scratchpad only). Date 2026-10-01, HEAD `e8c1c87`.
Status: DONE.

## Checks run (real results)
- `npm run build` → exit 0. Worker bundle (wrangler dry-run): **894.73 KiB / gzip 155.76 KiB**.
- `npm test` → exit 0: scripts **42**, shared **42**, client **618**, worker **81** (all pass).
- `client/dist`: no zod (`ZodError` / `_zod` / `strictObject` = 0; the only "zod" bytes are inside the Rapier wasm base64). Every
  string ≥ 8 chars of the 4 bundled / test legs scanned against every js/html/json/css in `client/dist`: no clue, description
  or answer; only step labels and the (GIẢ) `mini` names / title inside the Host demo state (`host-*.js`) and map names.
- `LEG_FORMAT.md` §10 example == `worker/legs/test/mini.json` byte-for-byte (after JSON.parse) and `parseLeg` → ok, 0 issues.
  Malformed variants (typo field, "48,85" as string, roadblock, first step not a route, missing start, no route before the Pit
  Stop, two Pit Stops, lat/lon swapped, duplicate step id, duplicate branch id) → readable Vietnamese errors with the right "where".
- `npm run leg:check`: paris-demo → valid, 2 warnings, 18 blanks; mini → valid, **1 warning** (Bir-Hakeim start "cầu không bắc qua
  sông"); paris-demo.filled → 2 warnings; near → clean. Bad JSON (decimal comma) → "dòng 22, cột 19" + hint, exit 1.
- `TrustedPoint` replay (tsx): reconnect churn every 2 s moves the trusted point 780 m in 60 s vs 390 m without (see M3).

## Findings

### M1 [major] invalid `timezone` is accepted by the server and breaks the Host page
- `shared/src/leg/schema.ts:97` `timezone: z.string()` – only `scripts/leg-check.ts:182` tests it, as a **warning**. `parseLeg` (used by
  `host.leg`) accepts `"Paris"`.
- `client/src/host/hostView.ts:107` `new Intl.DateTimeFormat(…, { timeZone: tz })` throws `RangeError` (checked in Node 24).
  `main.ts:252 drawStart` → `startRows` → `fmtTimeOfDay(joinedAt)` throws as soon as one team entered (or after "Bây giờ"),
  so `render()` stops before the matrix, the team table (team codes), counters and bikes; "Lưu" throws in `inputToMs`.
  The leg cannot be replaced any more (locked once a team entered, D11).
- Fix: make an invalid IANA zone an **error** in `checkLeg` (server side), or `refine` in the schema.

### M2 [major] bike claims, bike views and tick interest still use the client pose (D4 bypass)
- `worker/src/RaceRoom.ts:364` `bikes.onTeam(…, { x: l.pose.x, z: l.pose.z })`; `:447`/`:634` `players()` = `l.pose` (bike tick, view
  sync, abandonment); `:468` tick interest = `l.pose`; `:646` `welcome.bikes` = `l.pose`. `follow()` (`:313`) sets `l.pose` to
  whatever the client sent.
- Scenario (modified client): send a pose next to any free / parked bike 2 km away → `claim` passes `CLAIM_REACH` 3.5 m from
  that fake pose → bike taken from afar, then `dismount` puts it anywhere within 10 m of the next fake pose. Sweeping fake poses
  also makes `bikes.tick` send every bike within 250 m (`VIEW_METERS`) incl. `parked: true` bikes at the racks of points the
  leading teams already reached (D18) and ticks of teams within the interest radius → a remote scanner for race points ahead.
- Fix: pass `l.valid` (trusted) to `onTeam`, `players()`, `forTeam` and the tick viewer. Not reproduced in workerd (code path only).

### M3 [major] reconnect churn: 2× trust speed, no speed flag, unbounded rows + requests (partly pre-existing Phase 6)
- `RaceRoom.ts:288-289` grants `unseen × rate` on each new window, and `TrustedPoint.follow` (`shared/src/protocol/speed.ts`) also refills
  `min(cap, rate × elapsed)` for the same interval → both count the same seconds. Reconnecting every 2 s doubles the trusted speed
  (replayed: 780 m vs 390 m per minute); each new window resets `SpeedWindow`, so no `speed` flag, and `grew` is 0 so no `jump`.
- Every WS upgrade writes `connect` event (2 rows) + `teams.state` (1 row) (`RaceRoom.ts:209, 219`) with no per-window cap; every
  successful POST /login writes 2 rows (`:181`). A loop of reconnects at 10/s ≈ 108 000 rows/h: above the race budget (20 000) and
  the Free daily 100 000. Plan §8 asked the integrator to log this in TODO.md; it is not there yet.
- Fix: subtract the refill when a grant is given (or grant only `unseen × rate − budget refill`); count connects per
  `respawnWindowMs` like bike ops (close + no row past N).

### m1 [minor] task op does not flush the pose first (D4)
- `client/src/main.ts:223` RaceHud `task` → `net.send` directly, not `race.op` (which resets the gate + sends the pose, `:232-236`).
  After a network stall the trusted point can stay ≤ 13 m behind a team standing still in a 15 m task zone: every
  "Hoàn thành (tạm)" → `taskFar`, forever, until the player moves (standing still sends no pose).

### m2 [minor] after Host "Kết thúc", unfinished teams get no spectator / read-only mode (D19)
- `client/src/race/RaceClient.ts:44-46` goes spectator only on `view.finishAt`; `status === 'finished'` is not handled.
  Arrivals are still written after the finish (`steps.ts:97` arrive runs when `!running`; 3 rows + a `park` move per arrival).

### m3 [minor] "Tại điểm này" can leak a later step's label / type
- `engine.ts:434` sends other teams' **current** step label + type. Team B (behind) standing at a place it already did sees
  team A "đang làm Lộ trình 5" there when the leg comes back to that place later → B learns step 5 is at that point.

### m4 [minor] `respawn` makes the trusted pose walk-mode
- `RaceRoom.ts:377` forces `mode: 'walk'` into `valid`; a modified client riding sends `respawn` (0 m) then `open` → no `boxRiding`.

### m5 [minor] Host matrix `fmtMinSec` rounds wrong
- `hostView.ts:140`: minutes floored, seconds rounded: 59.6 s → "00:00", 119.6 s → "01:00" (cells and the gap column).

### m6 [minor] polish / docs
- `engine.ts:210` Host JSON error is the raw English V8 text ("Expected double-quoted property name…"), unlike leg:check.
- `shared/src/leg/check.ts:203` "tâm vùng nằm trong một tòa nhà (yes)" shows the raw OSM tag value.
- `LEG_FORMAT.md` §10 says mini → "Hợp lệ, không cảnh báo"; real output has 1 warning (Bir-Hakeim start flagged as a bridge over
  land, a false positive: the centroid is over Île aux Cygnes). `CLAUDE.md` / README / TODO.md not yet updated (integrator step).

### Test quality (would they fail?)
- Good: `engine.test.ts` order (write before send, failed write sends nothing), `steps.test.ts` card leak scan over `mini` +
  `paris-demo-filled`, ranking D10 example, D4 chain-of-respawns test, start-order `Promise.all`, eviction rebuild.
- Weak: `RaceRoom.race.test.ts:104` claims "reveal before the new card" but only checks containment (no order);
  `:109` excludes `race` messages from the "L2" scan (a next-step id leaking inside a card would pass). No test for an invalid
  timezone, claims from a fake pose, reconnect churn, or the Host page with a bad zone.

## Requirement coverage (plan D1–D25 vs code)
All present: zod schema + leg:check + LEG_FORMAT (D1, D12, D13), state machine 4 types with auto-pass stub (D2, D14:
`worker/src/race/steps.ts`, `tasks.ts`), D3 step-1 clue time on read (`engine.ts:298-305`), D4 TrustedPoint (`RaceRoom.ts:267-315,
371-390`; gaps M2, M3, m4), D5 boxes per step (`steps.ts:157`, `engine.ts:123-134,361-363`, `RaceRoom.ts:478`), D6 step_progress
(`db.ts`), D7 cardOf (`steps.ts:175`), D8 book, D9 status (`engine.ts:62-67,153-157,168-183`; gap m2), D10 ranking, D11 leg load
lock, D15 start times (`engine.ts:184-198`, Host page), D16 startOrder (`RaceRoom.ts:204-211`), D17 start spot, D18 parks,
D19 Pit Stop + spectator (gap m2), D20 NPC zones (`main.ts:323-324`), D21 zone (m3), D22 HUD, D23 F, D24, D25 v2.
Stubbed by design: `verifyTask` = pass, penalties always 0, Phase 8–10 items.

## Seams after the merge
- Box open: server order `bikes`/`bikeParked` → `box reveal {opened}` → `notice clueNew` → `race` (`engine.ts:350-381`); client:
  ClueBoxes repaint, toast, `RaceHud.setView` → full card (key `step@receivedAt`). OK.
- Toasts: every new ServerNotice has Vietnamese text (`Toasts.ts`), repeats merged by `nextFeed`; periodic check-in refusals
  for status are silent. OK. Bike `walkOnly` reason → toast (`Bikes.ts:212`).
- HostState fields read by the Host page (`status`, `serverMs`, `leg.{timezone,steps,branches,vehicles,start,bundled,issues}`,
  `teams[].{startAt,startOrder,joinedAt,step,finishAt,penaltyMinutes}`, `progress`, `ranking`, `spawning.candidates`) are all sent.
- Login summary `{raceTime, step}` → `Login.ts:64` shows both.

## Server principles
- SQLite before ack: every transition in one `transactionSync`, cache patched after, sends after (`engine.ts:371-381`); Host
  `host.team` (`:190-196`), `host.leg` (`:215-222`). OK.
- Rebuild after eviction: leg/status/rows from SQLite, trusted pose from the snapshot, box attachment survives. OK.
- Idempotent completion: earlier step → `boxOpened` / silent, later step silent, finished → silent. OK.
- No answer / params / future coordinates: audited `welcome` (`RaceRoom.ts:641`, `engine.ts:123`), `race`, `book`, `box`
  (current box only within radius; opened ones), `zone` (m3), `notice`, `host.*` (Host sockets only, tag `host`). OK except m3, M2.
- Host-only ops: `isClientMessage(m, role)` + role from the HMAC token. OK.
- Start-time validation: future > 60 s refused, after finish refused, after joinedAt warned. OK.
- Ranking: deterministic (slot last), own-clock for unfinished, negative clock = no time. OK.
- startOrder: same sync section as the connect write; rejoin keeps it, banner once. OK.

## Quota (recomputed from the write paths)
- Per team, measured: 42 rows for the 6-step `mini` (`RaceRoom.race.test.ts:194`) ≈ 7 rows / step (arrive 1+2, complete 2+2+1,
  finish …). 10-step leg ≈ 70 + start time 3 + parks (bike row + event) ≤ 15 → **≈ 90 rows / team**.
- Rows per race: 7 teams ≈ 5 320 (Phase 6) + 630 = **≈ 5 950**; 20 teams ≈ 7 100 + 1 800 = **≈ 8 900** (< 20 000).
- Requests: + ≈ 60 race messages / team (opens, tasks, ~30 Tab, check-ins, pose flushes) ÷ 20 ≈ 3 / team → 7 teams ≈ 8 980
  (worst 12 770), 20 teams ≈ 25 460 (worst 36 360; 9 % margin). Host pushes (`host.state` ≤ 1/s, ~30–40 KB for 20 teams) are
  outbound, not billed.
- Unbounded writers: WS upgrade (3 rows) and POST /login (2 rows) without a window cap (M3). Pose path writes nothing new;
  refused ops write nothing; `jump`/`speed`/`respawn` events capped per window.
