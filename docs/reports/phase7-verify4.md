# Phase 7 – gate verifier 4 (cleanup commit 6054995)

Scope: `6054995 fix(phase7): cleanup - leftovers from the final verifier` (on top of 3cf2aa6). Independent run, no source edits,
no commit. Verdict: **pass** (one documentation nit).

## Gate (run by me, HEAD 6054995)
- `npm run build`: pass (exit 0; tsc + client build + `wrangler deploy --dry-run`).
- `npm test`: pass (exit 0): scripts 49 (5 files), shared 47 (6), client 628 (64), worker 90 (11).
- `SCREENSHOT_PORT=5495 npm run ride-check`: OK, exit 0 (walk 4.000, bike 5.200, ratio 1.300, lean 15.6°, brake 1.25 s,
  lowest −0.02 m, heap 133.6 → 149.1 MB, ≈ 11 draw calls, crash / get up 3.58 s / remount / dismount OK).
- `npm run leg:check` (all exit 0), last lines match `docs/LEG_FORMAT.md` §10 table exactly:
  - `worker/legs/paris-demo.json`: `Hợp lệ: 1 cảnh báo, 18 ô còn trống.` (only `Bước 9 (L6) › điểm đến … 39 m`)
  - `worker/legs/test/mini.json`: `Hợp lệ: 0 cảnh báo, 0 ô còn trống.`
  - `worker/legs/test/paris-demo.filled.json`: `Hợp lệ: 1 cảnh báo, 0 ô còn trống.` (L6)
  - `worker/legs/test/near.json`: `Hợp lệ: 2 cảnh báo, 0 ô còn trống.` (start + L2 on the carriageway, as documented)
  - §8 T1 block = real `mini` output, character for character (diffed); §10 JSON example == `mini.json` after parse.
- Screenshots (`SCREENSHOT_PORT=5495`, no console errors, all opened):
  - `p7-start`: open walkway under the metro viaduct, feet y 1.52 (deck, not metro top), camera far behind the player in
    open air; **not inside the stone vault**.
  - `p7-start-island` (spread spot 4, the nearest to the vault): same open walkway, feet y 1.52.
  - `p7-host`: demo Host page renders (mini leg, Asia/Ho_Chi_Minh).
  - `p6-bike-lost`: "Chậm một bước! Xe đã có người lấy." toast (reason `taken`, unchanged path).
  - extra `verify4-ingame-T1` (leg:check "Trong game" link of mini T1): player ≈ 12 m before the box on the Trocadéro
    path, facing it, Eiffel Tower behind, "Bấm F để mở hộp mật thư".
- No vite / wrangler / workerd left running (pgrep empty).

## The 5 cleanup items
1. **Demo start off the vault (m2)**: all three legs `start` = 48.85585, 2.28744 (`worker/legs/paris-demo.json:68-70`,
   `worker/legs/test/mini.json:8-10`, `worker/legs/test/paris-demo.filled.json:68-70`); `worker/src/legs.test.ts:21-29` checks
   every bundled leg within 25 m of the OSM centre (measured 20.5 m; spread spots 1–24 are 17.3–25.4 m from it, min = spot
   4 = `ISLAND_SPOT`, `scripts/screenshot.ts:228-230`); `client/src/host/hostView.ts:311` demo start; harness `LEG_START`
   follows mini (`worker/src/test/harness.ts:93`). Shots confirm. OK.
2. **shared `check.ts`**: (a) `outsideMap` pushes task-place + branch racks (`shared/src/leg/check.ts:255-256`); the CLI
   duplicate is gone (`scripts/leg-check.ts` mapReport); test `shared/src/leg/leg.test.ts:83-92`. I also ran `parseLeg` (the
   server path, `worker/src/race/engine.ts:213`) on a rack at lon 2.2849: error. (b) timezone text
   `check.ts:142`, test `leg.test.ts:103`, LEG_FORMAT §11 line 389. (c) task place names in the leak scan
   `check.ts:192-194`, test `leg.test.ts:94-99`. (d) `LegGeo.building` comment `check.ts:21-22`. OK.
3. **Toasts (m4, m5)**: `client/src/vehicle/Bikes.ts:61` (`ClaimNotice` + `raceOver`), `:212` (`finished` → `raceOver`);
   `client/src/ui/Toasts.ts:24,26`; tests `Bikes.test.ts:168-176`, `Toasts.test.ts:52-54`. Server reasons match
   (`shared/src/protocol/types.ts:255`, `worker/src/race/engine.ts:234-236`). `main.ts:221` wires `notify = notice`. OK.
4. **RACE_RULES §11 (m1)**: `docs/RACE_RULES.md:245` now says the team switches to spectator at once, no message. Matches
   the code: `client/src/race/RaceClient.ts:57` `finished(false)` → `main.ts:244` `spectateAt = 0` → `main.ts:495` hud-off. OK.
5. **sim / leg:check (m6, m7, m8)**: `scripts/sim.ts:162,167` Vietnamese errors, `:513-519` catch → usage, exit 2 (also ran
   by hand: exit 2, no stack); test `scripts/sim.test.ts:166-174`. `scripts/leg-check.ts:237-250` `approach()` (12 m back
   along the A* walk, yaw math checked: forward (−sin, −cos) points at the box), used at `:314`; test
   `scripts/leg-check.test.ts:71-77`. Far rack warning `check.ts:219-220` with `LEG_LIMITS.rackFar` = 300
   (`shared/src/leg/schema.ts:19`); test `leg-check.test.ts:265-273`; LEG_FORMAT §7 / §11 updated. OK.

## File ownership
The commit touches no `docs/SPEC.md`, `TODO.md`, `CLAUDE.md` or `docs/reports/HANDOFF.md` (git show --stat: 20 files, client /
scripts / shared / worker / docs LEG_FORMAT, RACE_RULES, reports/phase7-fix4-cleanup.md).

## Regression hunt
- Stricter server `outsideMap`: `parseLeg` on all four `worker/legs` files → ok, 0 errors; the fake `nearLeg()` (moved 20 m
  with `LEG_START`, points ≤ 300 m east, racks 25 m south: inside the bbox) still loads via `host.leg`
  (`RaceRoom.race.test.ts:65-67`, `RaceRoom.live.test.ts:24,226,246`, all green). A leg already stored in a DO that fails the
  new rule is kept with its issues (`engine.ts:87-93`), no crash on wake.
- Timezone: `Etc/GMT-7`, `europe/paris` still accepted (Intl accepts them, the Host page formats with the same Intl), `Paris`,
  `UTC+7`, `Europe/Paris ` refused. No stale "dùng tên IANA" text outside docs/plans.
- Toasts: no stale old strings anywhere (grep). The long `raceOver` line has no max-width (`client/src/ui/menu.css:13-16`);
  ≈ 600 px at 15 px, fits beside the minimap at 1280 px.
- Old coordinates 48.85569, 2.28758 remain only where they mean the OSM centre (plans, LEG_FORMAT "don't use", railDecks
  test, leg-check "viaduct over land" test, legs.test.ts reference).

## Issues
- minor (doc): `docs/LEG_FORMAT.md:212` still ends "`leg:check` cảnh báo nếu thấy … trong mật thư, tiêu đề, mô tả, gợi ý."
  — the scan now also covers the task place name (and already covered branch summaries), see `check.ts:192-194`; the §11
  table (line ~397) is updated, this sentence is not.
