# Phase 7 – fix round 2: host-tools

Area: `client/src/host/**`, `client/host.html`, `scripts/sim*.ts`, `scripts/leg-check*.ts`, `docs/LEG_FORMAT.md`, `worker/legs/**`.

## Done

### Finding (major): `sim --leg` reports LỖI on every realistic run
- `scripts/sim.ts`: per-team rows now count only the rows written **while the race ran** (from the `running` host.state), **minus the shared snapshot and replay rows**. The sim reads those exactly from the Durable Object's SQLite (snapshot `seq` + replay row count), the same way `RaceRoom.race.test.ts` does. It then waits `NET.replayMs + 1 s` after the last pose so that late timed rows land before counting. Rows are only measured in the in-process harness; with `--url`, `rowsPerTeam` is `null` and the output says so (it is not a failure).
- The budget is `legRowBudget(steps) = 11 × max(10, steps)`: plan §9 estimates ≈ 100 rows per team for a 10-step leg, plus 10 %. It stays 110 for `mini` and the organiser's 4-step leg, and scales for longer legs.
- `legFailed()` replaces the two copies of the exit check (the LỖI line and the exit code).
- Reproduced with the finding's own command, `npx tsx scripts/sim.ts --leg mini --bots 2 --speedup 2`: 444 rows in all. Before: "221 / đội ← LỖI", exit 1. Now: "dòng ghi / đội 47,5 (ngân sách ≤ 110; không tính 318 dòng vị trí + replay chung cho mọi đội)", exit 0, 2 / 2 teams finished and ranked.
- Tests (`scripts/sim.test.ts`):
  - The full-leg run asserts `sharedRows > 0`, `rowsPerTeam × 3 + sharedRows ≤ counters.rows`, `rowsPerTeam ≤ rowBudget` and `!legFailed`.
  - A pure test replays the organiser's numbers (324 rows, 2 bots, 4 steps) and checks they are not a failure. It also checks that 111 rows per team or an unfinished team is a failure, and that `--url` (`null` rows) is not one.

### Backlog
- **sim claim scenario.** Bots 0 and 1 now start at the midpoint of their own welcome spots: the leg start, spread by start order, so ≤ `spreadMeters` from each. A first pose there is within the trust the server grants for the time they were unseen. The bike goes on that spot. Every bot's route starts at its trusted spot, not at a random point about 100 m away. Before the fix, `sim.test.ts` "two claims on one bike give one winner" failed (0 winners); it now passes (exactly 1). `compactMini` in the test also anchors its spots on `mini.json`'s own `start` instead of a hard-coded coordinate.
- **leg-check timezone.** Removed the dead `Intl.DateTimeFormat` warning in `mapReport`: `checkLeg` already gives an error for a bad time zone. The test now checks that a river point is still a warning (leg ok) and that a bad timezone is an ERROR on "múi giờ" (leg not ok).
- **leg-check, extra 1-line fix.** The start's screenshot command printed `--name leg-xu-t-ph-t` (`\W` eats Vietnamese letters); it now prints `--name leg-start`, with a test.
- **docs/LEG_FORMAT.md.**
  - §3.1 `timezone`: a wrong name is now LỖI (the server refuses the leg).
  - §11: the timezone row moved from CẢNH BÁO to the LỖI rows, with the tool's real message.
  - §8 sample: the `Xem:` line now uses 5 decimals (`48.86050,2.29030`), like the tool.
- **hostView `fmtMinSec`.** It now rounds once to whole seconds: 59.6 s gives `01:00`, not `00:00`. Test added.
- **hostView `startPreview`.** It takes the team's `finishAt`. A finished team's hint shows "Đội đã về đích: thời gian sẽ là T+…" (finishAt − start), and a start after the finish is `bad` (the server refuses it, D15). `main.ts` passes `finishAt`. Test added.
- **Host tables at 1024 px.**
  - "Giờ xuất phát" columns are now Đội, Bước hiện tại, Phạt, Thứ tự vào, Vào game lúc, Giờ xuất phát. The T+ hint sits on its own line under the input, so the table fits at 1024 px.
  - Progress matrix: Đội, Hạng, Chính thức, Cách, Phạt, Về đích come before the step columns, so the result is visible without scrolling sideways.
  - In both tables the team column is sticky (`table.pin`) and left-aligned.
  - Checked with headless Chrome at 1024×640 on `/host.html?demo=1`: every start-table header is in view; in the matrix only the last 2 step columns need scrolling, and the team cell stays at x = 32 while the matrix is scrolled. No console errors.

## Not done: demo start out of the island vault (needs a change outside this area)

- **Geometry.** Computed from `client/src/world/landmarks/g2.ts` `site()` on the real chunk + carved grid:
  - The stone massif over Île aux Cygnes covers bridge-axis s ∈ [−2.35, 11.65] m.
  - The current start (48.85569, 2.28758) is at s = −1.44, on the vault's centre line: 0.9 m **inside** the arch mouth.
- **New point: 48.85585, 2.28744.** It is 22 m NW along the bridge, on the centre line under the Line 6 viaduct, over the river arm:
  - The nearest spread spot is about 14.6 m from the vault.
  - leg-check: in water and on the bridge, so the misleading "cầu trên đất liền" warning goes away; no building; snap to the walk graph 6.8 m.
  - `npm run screenshot -- --path "/?start=-2472.48,1070.92,33&…"`: open walkway, feet y 1.52 on the deck, no vault in view.
- **Why it is not applied.** I moved `mini` and `paris-demo.filled` first, and two worker tests outside this area failed:
  - `worker/src/race/BikeService.test.ts:281` adds the bike at `LEG_START` (taken from `mini.json`), while the race runs the default `paris-demo` leg. So **all bundled legs must keep the same start**.
  - `worker/src/legs.test.ts:22` hard-codes `paris-demo`'s start `{ lat: 48.85569, lon: 2.28758 }`.
  - I reverted the move; the worker suite is green again (86 / 86).
- **Exact change to apply together** (one commit, see notFixed):
  1. `worker/src/legs.test.ts:22`: `expect(leg.start).toMatchObject({ lat: 48.85585, lon: 2.28744 })`.
  2. In `worker/legs/paris-demo.json`, `worker/legs/test/mini.json` and `worker/legs/test/paris-demo.filled.json`, set `start.lat` 48.85585 and `start.lon` 2.28744; name "Cầu Bir-Hakeim – lối đi bộ dưới cầu cạn metro, phía Passy". Keep `yawDeg` 33 and `spreadMeters` 5.
  3. `docs/LEG_FORMAT.md` §10 example start (same values).
  4. `client/src/host/hostView.ts` demo start: `latLonToWorld(48.85585, 2.28744)`.
  5. `scripts/leg-check.test.ts` "mini: … only warning is the viaduct start" → `toEqual([])`. This also makes the doc's "mini: Hợp lệ, không cảnh báo" true.
  6. `scripts/screenshot.ts`: the `p7-start-island` comment ("spread spot over the Île aux Cygnes") becomes stale.

  `sim.test.ts` already reads the start from `mini.json`.

## Gate
- `npm run build` passes.
- `npm test` passes (with the other agents' in-flight edits in the tree): scripts 43, shared 45, client 624, worker 86.
- No vite / wrangler / workerd left running (the scripts' in-process servers close themselves).
