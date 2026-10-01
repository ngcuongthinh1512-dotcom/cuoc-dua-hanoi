# Phase 7 – kiểm chứng Track E (adversarial)

Branch `p7-track-e` @ 1a41a9c, diffed against fee5e6f.

## Build / test
- `npm run build`: passes. `npm test`: passes (24+1 skipped / 42 / 597 / 56). The skipped test is the full-leg harness test (`scripts/sim.test.ts:204`, `it.skipIf(!engineReady)`).
- File ownership: the diff touches only `client/src/host/*`, the `hostPage` block in `client/src/config.ts`, one line in `scripts/screenshot.ts`, `scripts/sim(.test).ts` and the report. It does not touch SPEC, TODO or CLAUDE.md.

## Reproduced: the required full-leg test FAILS against Track A's engine
- I made a scratch worktree from `p7-track-e`, applied the uncommitted diff from the `p7-a` worktree (engine without `FOUNDATION STUB`), then ran `npx vitest run scripts/sim.test.ts -t "whole leg"`.
- Result: `Bot 3: kẹt ở bước L3 (không có phản hồi)`. It failed twice in a row.
- Debug output: `sock.dropped = 4429`. The server closed the bot's socket for too many messages (> `NET.maxMessagesPerSec` = 15 per 1 s window).
- Cause: `playLeg` sends ops with no pacing at step changes, at `--speedup 2` (10 poses/s):
  - `settle` sends pose + op;
  - the next `goto` starts at once (`due = Date.now()`);
  - a same-place step (L2 → D1 branch A) adds 1 pose + 2 more messages.
  Together that is more than 15 messages in one window.
- `Sock.send` silently does nothing on a closed socket, so the bot "retries" for 60 s and then reports "không có phản hồi" instead of the 4429.
- Adding 400 ms of pacing before each op and at the start of each `goto` (scratch only) → the test **passes** (3 bots finish, ranking has 3 rows, ≤ 110 rows per team).

## Other bugs
- `client/src/host/main.ts` `autoCandidates`: it returns when `s.leg.id === computedFor`, even when `spawning.candidates === 0`.
  - The server deletes candidates on every `host.leg` (`BikeService.resetForLeg`).
  - So when the Host loads a corrected file with the SAME `id`, the corridor is not recomputed and no bikes spawn until someone presses the button by hand.
  - The report says "or no candidates exist", which is not true here.
  - A graph-load failure also sets `computedFor` already, so there is never an automatic retry.
- `sim.ts` `rowsPerTeam = c.rows / opts.bots` counts snapshot / replay rows, which do not depend on the number of teams (§9 counts them separately). With `--leg mini --bots 1` (≈ 6 min real time) that is about 216 rows → "LỖI" + exit 1 even though the budget is fine.
- `drawStart`: the signature includes each team's `stepLabel` / `penalty`. When any team moves on a step, the whole input table is rebuilt: the draft is kept, but the field the Host is typing in loses focus.

## Checked and OK
- D9 buttons, confirm + blanks list, red banner, `host.notice` 15 s.
- Leg lock (lobby + no `startOrder`), with the "new race id" procedure.
- `inputToMs` / `msToInput` by `leg.timezone`; 'now' is stamped by the server.
- Start time only on button press (critic m10 / item 10).
- §13.6 matrix + T+ mode, corridor points + checkpoints from `host.state.leg` (critic M3 / M4), `hostPage.corridor` removed.
- The stand-in-engine test is not vacuous.
