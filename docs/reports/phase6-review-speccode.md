# Phase 6 review: spec + code + security + quota

Reviewer: spec/code/security/quota (2026-10-01). No servers started; only the worker test harness (`createTestHarness`,
in-process) and the `sim` bot on it. HEAD `c55a3e1`. No source edited.
Status: DONE. 1 blocker (B1), 2 major (M1, M2), 6 minor.

## Build + tests (real run)
- `npm run build`: exit 0 (tsc all workspaces, client build incl. `host.html`, `wrangler deploy --dry-run`).
- `npm test`: exit 0. scripts 20, shared 25, client 586, worker 52 (683 tests).
- `npm run sim -- --bots 2 --minutes 0.25` (harness): claim 1 / 2 ok, rejoin on the old spot, 0 flagged.
- Leak grep of `client/dist`: no clue text, no step names, no step coordinates (48.87348, 2.29666, 48.86215, "paris-demo").

## Findings

### B1 [blocker] Client never wires the server bikes: online, nobody can see, claim or ride a shared bike
- `client/src/main.ts:202` and `:210` are still the integration placeholders `// [C] …`. Nothing in `client/src`
  (outside tests) calls `bikes.applyServer`, `bikes.onClaimResult`, `bikes.setTeams`, sets `bikes.net`, `bikes.ground`
  or `bikes.notify` (grep).
- `Player.ts:191`: online (`o.online`) the dev bikes are not placed either. So online `player.bikes.list` is always
  empty: `welcome.bikes` and every `bikes` / `bike` message are dropped, F finds nothing, no `claim` is ever sent, no
  `mount` / `dismount`, no toast "Chậm một bước!", no re-mount after a reconnect (`welcome.pose.bikeId`, SPEC §8.10
  "đang ngồi trên xe hay không cũng như cũ").
- Failure: two browsers on `/?race=paris`, Host adds a bike next to a team ("Thêm xe") → the server stores it and sends
  it in `bikes` to the team, the client shows nothing, F does nothing. Shared bikes (SPEC §6.2–6.4, Phase 6 scope) only
  work for the `sim` bots.
- Reproduced: by code (grep); the server side works (`sim` claim 1/2). Tests do not catch it: `Bikes.test.ts` tests the
  class, nothing tests `main.ts` wiring.
- Fix: the 6 lines from `docs/reports/phase6-track-c.md` "main.ts / Player.ts (B)" (net, team, colour, ground, notify,
  setTeams + applyServer(w.bikes, [], true) in welcome, applyServer(m.list, m.gone, m.full) / onClaimResult(m) in
  message) + re-mount when `w.pose.bikeId` is set.

### M1 [major] 4429 / 4413 / 4400 end the session for good, while the server closes 4429 on a normal network burst
- `client/src/net/NetClient.ts:27-34`: `CLOSE.tooFast`, `tooBig`, `badMessage` are in `FINAL` → `stop('protocol')`,
  no reconnect, panel "Máy chủ đã ngắt kết nối. Tải lại trang để vào lại." Track A's hand-off
  (`phase6-track-a.md`, "Track B") says these codes reconnect with backoff.
- `worker/src/RaceRoom.ts:195, 438-446`: > `NET.maxMessagesPerSec` (15) messages in a fixed 1 s window → 4429.
  The browser keeps sending poses at ~5 Hz into a stalled TCP connection; when it recovers they arrive together. A
  stall ≥ ~3 s (Wi-Fi hiccup) = 16 queued poses → 4429 → the player is out of the race until a manual reload
  (verify-a R7 measured 3.2 s). Bell spam adds to it: `Player.ts:243` sends one `gesture` per R press with no client
  throttle (5 poses + 10 presses/s = 15).
- Reproduced: server side yes (existing test "16 tin/s → 4429" passes); client finality by code + `NetClient.test.ts`
  ("kick / 4401 … dừng hẳn").
- Fix: treat 4429 (and 4413 / 4400) as `closed` with backoff. A real protocol bug would then loop at the backoff cap
  (15 s, 1 request per try). Also throttle the bell `gesture` on the client.

### M2 [major] A modified client can burn the SQLite row budget: per-team row writers with no cap
- Respawn / jump events are capped per team (`NET.maxRespawns`, comment in `constants.ts:25-28`: "a client spamming
  respawns cannot burn the SQLite row budget"), but two other paths are not:
  1. Bike `dismount` → `mount` on the team's own bike: each writes the `bikes` row (`BikeService.ts:80`, `:92`), with no
     event and no limit except 15 msgs/s. **Reproduced** (harness, scratch test): 50 alternating messages in 3.5 s →
     **52 rows** (counter uses `rowsWritten`, so it is exact). At 14 msgs/s that is about 14 rows/s per team: the
     20 000-row race budget is gone in about 24 min, the 100 000/day Free quota in about 2 h.
  2. Speed episodes: `RaceRoom.ts:234-237` writes one `speed` event (3 rows, see m1) each time the window goes from
     ok to over. **Reproduced**: a 25 m hop every 3.4 s while standing → 4 events in 14 s, about 6 300 rows per 2 h
     per such team. The `flagged` bit is already set after the first one, so the later events add nothing for the Host.
- Honest clients do not loop (crash → F → claim), so this needs a modified or buggy client. Fix: give these the same
  per-team budget as respawns (for example ≤ N bike row writes and ≤ N speed events per `NET.respawnWindowMs`, then
  update memory only), or close the socket with 4429 past the budget.

### m1 [minor] The rows counter undercounts: events cost 3 rows, not 2
- Measured in workerd (scratch DO, `cursor.rowsWritten`, same DDL as `db.ts`): `events` insert = **3** (table +
  `events_team` index + `sqlite_sequence` because of `AUTOINCREMENT`), `teams` insert = **3** (TEXT PK autoindex + UNIQUE
  code), `meta` first insert = 2 / update 1, `snapshot` 1, `replay` 1, `bikes` insert 2 / update 1 / delete 1.
- Code counts events as 2 (`RaceRoom.ts:511-514`, `BikeService.ts:248-252`, comment `db.ts:60`), team inserts as 2
  (`RaceRoom.ts:457`) and meta writes as 1. Events are the second-biggest row item, so the Host's "Dòng SQLite ghi"
  is about 15–20 % low over a race. The live test `RaceRoom.live.test.ts` "rows2h" adds the plan's constant 2 750 for
  everything but snapshot / replay, so it cannot see this.
- Fix: count `sql.exec(...).rowsWritten` everywhere (BikeService already does), or drop `AUTOINCREMENT` (a plain
  `INTEGER PRIMARY KEY` saves 1 row per event, ~900 rows per race).

### m2 [minor] Counters are persisted only with the snapshot row: lost on every hibernation (known R10, still present)
- `RaceRoom.ts:94` reloads them from the snapshot; the snapshot is written only after a pose (`moved`) or a disconnect.
  Logins / connects / alarms / Host ops on a quiet room (`http`, `alarms`, `rows`) are lost when it hibernates.
  Small, but these are the numbers Phase 12 will compare with the budget.

### m3 [minor] Client-declared `mode: 'bike'` raises the speed limit ×1.3 with no check that the team rides a bike
- `RaceRoom.ts:229, 233`: the bike limit (6.5 m/s) applies for 3 s after any pose with mode `bike`; the server has the
  answer in `bikes` (owner + rider) but does not look. A modified client walking at 6.4 m/s and claiming `bike` is never
  flagged. Known (verify-a), not fixed; Phase 9's walk-only penalty uses the same window, so fix it before then.

### m4 [minor] `sim` end-to-end claim test passes when the claim scenario is skipped
- `scripts/sim.test.ts:23` accepts `r.claim === null`. `sim.ts:188-197` sets null when no `bikes` message with the new
  bike reaches bot 0 within 1.5 s, so a regression in BikeService views / Host add makes the test skip, not fail.
  Today it runs (`npm run sim`: "1 / 2 thành công"); after the C merge the test should require exactly 1.

### m5 [minor] Host password: no rate limit
- `worker/src/index.ts:32-34`: `/api/login {host}` is checked in the Worker with no attempt counter (team codes have
  5 → 60 s). Unlimited online guesses against `HOST_PASSWORD`, which also signs every token. Worker requests only
  (not DO), so not a quota item; security only.

### m6 [minor] Any valid race slug creates a Durable Object and writes to its SQLite
- `index.ts:36, 45` route any `/^[a-z0-9][a-z0-9-]{0,31}$/` to `getByName(race)`; the constructor runs `migrate`, which
  inserts `meta.schema` (2 rows, `db.ts:47`). An unauthenticated `POST /api/login {"race":"x1","code":"A"}` per new slug
  = 1 DO request + 2 rows + a new SQLite store. Fix: only the Host token may create a race (for example set
  `meta.race` at Host connect; teams' login / ws on a race without it → 404 before `migrate` writes).

## Cross-track seams (checked)
| Seam | Result |
|---|---|
| `bikes.tick(players, online, now)` every `slowTickMs` | ok `RaceRoom.ts:354` |
| `bikes.alarm(players, now)` after `closeDead` | ok `:218-219` |
| `bikes.forTeam` in team `welcome`, `list()` for the Host only | ok `:553` (no leak of other teams' ridden bikes) |
| `bikes.onTeam` only from team sockets, `walkOnly = false` (Phase 7) | ok `:286-290` |
| `bikes.onHost` + `soon()` | ok `:281-285` |
| `host.state` fields used by `host/main.ts` / `hostView.ts` (teams[].code/player/lastSeen/reconnects/pose/flagged, counters, bikes, spawning, steps, serverMs) | ok, all present |
| `welcome.boxes` + `box` reveal/hide → `ClueBoxes` | ok `main.ts:198, 209` |
| `welcome.pose` → spawn (first welcome only) | ok `main.ts:200` |
| `welcome.bikes`, `bikes`, `bike`, `welcome.pose.bikeId` → `Bikes` | **missing (B1)** |
| `movement` / `presence.renderRadius` / `teams` from welcome | ok `main.ts:195-197` |
| close 4401 / 4409 final, 4408 reconnect | ok `NetClient.ts:27-34` |
| close 4413 / 4429 / 4400 | final on the client, server expects reconnect (**M1**) |
| `ping` every `NET.pingMs` (game, Host page, sim) | ok `NetClient.ts:175`, `host/main.ts:38`, sim |
| Offline (`?offline=1`, dev without `?race=`) | unchanged: `startSession` → null, no `NetClient`, dev bikes placed, `canFly`, overrides kept |

## Server principles (checked)
- DO authoritative for claims (sync handler, first wins: harness test + sim 1/2), speed flags, boxes, team state.
- Write before ack: login event, connect (team state + event), createTeams, claim (bikes row + event), dismount, Host
  ops, all `sql.exec` (sync, output gate) before `send`. Poses are batched by design (snapshot 2 s + at disconnect).
- Rebuild: constructor reads the snapshot (poses, `validAt`, counters, seq); teams / bikes / spawner / candidates lazy
  from SQLite; per-socket role / team / revealed box in the attachment (test with `evictDurableObject` close and
  hibernate). Memory-only by design: replay buffer ≤ 10 s, login lock, teleport budget, ridden bike spot (ponytails).
- No heavy compute: corridors + candidates in the Host browser (`host/main.ts:139-140`); the DO only picks
  (`VehicleSpawner.pick`).
- Leg content: only `movement` / `presence` / `vehicles` / `boxReveal` leave the server; `steps` only in `host.state`
  (Host tag); no clue text or step coordinates in `client/dist` (grep). Future boxes never sent (`welcomeBoxes`,
  `checkBoxes` per team socket, Host never gets `box`).
- Other teams: ticks filtered to 500 m of the viewer (Host all), bikes per team view (250 m, never ridden ones), `code`
  only in `host.state`. Note (accepted until Phase 9): a flagged teleporting client still gets ticks / bike view / box
  reveal around the spoofed spot (`l.pose`, and `l.valid` catches up after one 3 s window).
- Tokens: HMAC-SHA256 verify, expiry, race id in the claims (other race → 4401), unknown team → 4401 (tests).

## Quota (recomputed from the code paths, 2 h, 20 teams)
Requests (billed):
| Item | Code path | Typical | Worst |
|---|---|---|---|
| Poses | `PoseGate` ≤ 5 Hz only on change (`NetClient.ts:42-48`), 1/20 each | 70 % moving: 25 200 | 100 %: 36 000 |
| Upgrades + team logins | NetClient reconnect reuses the token: 1 upgrade; page load: login + upgrade | ~160 | ~250 |
| Ops (gesture, respawn, bike) ÷ 20 | — | ~100 | ~150 |
| Alarms | `spawnIntervalMinutes` 3, re-armed only with players online | 40 | 40 |
| Pings | auto-response | 0 | 0 |
| **Total** | | **≈ 25 500** | **≈ 36 450** (< 40 000, 9 % margin) |

SQLite rows (measured costs: event 3, team insert 3, snapshot 1, replay 1, bike insert 2 / update 1, setAlarm 1):
| Item | Rows |
|---|---|
| snapshot (1 / 2 s while anyone moves + 1 per disconnect) | 3 680 |
| replay (1 / 10 s) | 720 |
| sessions (~80 page loads: login 3 + connect 3 + state 1 + spawn respawn 3 + disconnect 3 + state 1 + snapshot counted above) | 1 120 |
| teams (20 × 3) + createTeams event | 63 |
| bikes: 40 alarms × (setAlarm 1 + spawner 1 + spawn event 3 + ~1.5 bikes × 2) | 320 |
| claims ~150 × (row 1 + event 3 + old bike 1), dismount / remount ~400 × 1, gone ~50 × 4 | 1 350 |
| **Total** | **≈ 7 250** (< 20 000) |
- The plan's table holds (events at 3 rows add ~900). The two uncapped writers of M2 are the only way past the budget.
- The tick loop (`setTimeout` 200 ms) runs only while someone moved in the last `idleStopMs` 10 s or a write is due;
  no alarm and no loop with nobody connected (alarm re-arms only with players; Host-only = auto-answered pings).

## Not findings (checked, fine)
- Malformed / oversized frames: 4413 / 4400 before any state change; respawn / dismount points bounded to the codec range.
- Unbounded memory: `live`, `told`, `seen` (WeakMap) bounded by teams / sockets; `loginFails` grows per failing IP but
  is dropped with the object.
- Atomic claim under concurrency: harness test (2 sockets) + `sim` 1 / 2.
- Not verified (needs a real browser, outside this role): background tabs may throttle the 5 s ping below the 30 s
  dead-socket limit → 4408 → reconnect churn (≈ 1 request + ~9 rows per cycle).

Status: DONE.

