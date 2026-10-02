# Phase 7 – verify round 3 (adversarial)

Status: DONE. Verdict: **issues (minor only)**: 0 blocker, 0 major, 9 minor. No source edited; scratch scripts in the session
scratchpad (zonesim.test.ts, npczone.mts, loc.mts, crafted leg files). No vite / workerd / Chrome left running.

## Round-3 tasks: done?
| Task | Result |
|---|---|
| server: task op refused while riding (D4) | done: `steps.ts` refuses before the zone check, engine passes the trusted pose's mode; tests assert notice + no rows |
| server: D15 start after finish test | done (`engine.test.ts`), plus clock monotone after Host changes |
| server: finished teams cannot claim bikes | done: `bikeBlock` 'finished' (check-in or race over); workerd test claims 1 m away → `finished` |
| server: rack spread | done: east–west row 0.9 m, places reused, full rack drops oldest; test |
| server: status in view | already there; test added for all 4 transitions + welcome |
| client: NPC cars out of zones | done, measured myself (below): 0 cars in zone at Rivoli / Étoile L1 / Alexandre III L4 in the running game |
| client: zones after start-up | `.then(n => n.setExclusionZones(npcZones()))` (round 2); in-game zone set after `__READY__` works |
| client: spectator on finished + badge | spectator: RaceClient (round 2) + test; badge "Chưa bắt đầu / Tạm dừng / Đã kết thúc" (p7-clock shot) |
| client: V disabled for finished teams | `canFly = () => !session`; handler needs `debug.visible && canFly()` |
| client: NPC tag overlap | host tag LOD 12 m; p7-mat shows only "Đội thử", p7-celebrate keeps the host tag |
| host-tools: shared jsonProblem | done; §12 messages reproduced |
| host-tools: rack typo bounds | done in leg:check (task place + branch racks); server side NOT (m3) |
| host-tools: LEG_FORMAT items | every command / example re-run: matches (below) |
| host-tools: RACE_RULES vs client | strings match the client (Toasts, RaceHud, format.ts); one wrong claim (m1) |
| host-tools: demo start move | NOT done (blocked by ownership of `worker/src/legs.test.ts`); p7-start still inside the vault (m2) |
| host-tools: README pointer | done ("Nhập chặng đua" + command table) |

## File ownership (git show --stat)
- e74e430 server: `shared/src/protocol/types.ts`, `worker/src/**`, its report. OK.
- c595daf client: `client/src/{config,main}.ts`, `npc/`, `player/`, `race/PitStop.ts`, `ui/`, `scripts/screenshot.ts`, report. OK.
- 775d9c5 host-tools: README, `client/src/host/main.ts`, LEG_FORMAT, RACE_RULES, `scripts/{leg-check,sim}*`, `worker/src/race/BikeService.test.ts`, report. OK
  (BikeService.test.ts was also edited by the server commit; both in scope, no conflict).
- 3cf2aa6: report only. Tree clean apart from untracked review reports.

## Findings (all minor)
- **m1 RACE_RULES §11 / HUD**: "Khi Host kết thúc chặng, nhãn là Đã kết thúc" is never seen: on Host finish `RaceClient` calls
  `finished(false)` → `spectateAt = 0` → next frame free-fly → `body.hud-off` hides every `.hud-box`, the badge included. A team
  learns the race ended only from the camera switch. Fix the sentence, or show a toast / keep a spectator line.
- **m2 demo start not moved**: bundled legs still start at 48.85569, 2.28758; `p7-start` (shot today) is the dark vault. Needs the
  commit listed in phase7-fix3-host-tools.md "Chưa làm 1" (3 leg JSONs + `worker/src/legs.test.ts` + hostView + docs §4/§10).
- **m3 server accepts off-map racks of task places / detour branches**: only `leg:check` errors; `shared/src/leg/check.ts`
  `outsideMap` still covers destination racks only, so "Nạp chặng từ file" on the Host page loads a rack typo (111 km) and
  `BikeService.park` moves the bike there. Patch is written out in the fix3 host-tools report.
- **m4 `Bikes.ts:212`**: claim reason `'finished'` falls into the `bikeLost` toast "Chậm một bước! Xe đã có người lấy." (rare: claim in
  flight when the Host ends the race).
- **m5 `Toasts.ts` boxRiding** "Xuống xe rồi mới mở được hộp mật thư" is now also the answer to a task op / check-in on a bike.
- **m6 leg:check "Trong game" link** puts the body at the box centre: v3-ingame-T1 shows the player standing inside the clue box.
  Offset the spawn ~2 m (or start at the zone edge).
- **m7 `npm run sim -- --leg <missing file>`** prints a raw English ENOENT stack trace; an unknown id prints a stack too
  (leg:check handles both in Vietnamese).
- **m8 leg:check**: a rack inside the map but far from its point (typo, e.g. 686 m away) is only printed ("cách tâm 686 m"), no
  warning; suggest a warning beyond ~150 m.
- **m9 leftovers listed by the fixers, still open**: timezone message "dùng tên IANA" (shared), answer leak check ignores
  `task.location.name` (shown to teams), CLAUDE.md `--speedup 3`.

Pre-existing (not round 3, FYI): NPC jam without any zone on Rue de Rivoli eastbound (edge 170570, 7 cars standing up to 385 s,
headless seed 2) and a car standing 110–215 s near Étoile in the in-game L1 run, already standing before the zone was set.

## Gate (run by me, HEAD 3cf2aa6)
- `npm run build`: pass (exit 0).
- `npm test`: pass: scripts 47, shared 45, client 627 (64 files), worker 90 (11 files).
- `SCREENSHOT_PORT=5491 npm run ride-check`: OK, exit 0 (walk 4.000, bike 5.200, ratio 1.300, lean 15.6°, heap 134→145 MB, ≈ 11 draw calls).

## leg:check / LEG_FORMAT re-run (done)
- §10 table: mini 1 warning, paris-demo 2 + 18 blanks, filled 2, near 2: all match.
- §10 JSON example == mini.json (parsed), valid outside the project (only the bridge warning).
- §8 T1 sample block matches the real output byte for byte.
- §12 four JSON errors (+ line comment, block comment): messages as documented.
- Rule error (tz "Paris") + Palais de Tokyo centre + 2 rack typos: 4 errors in one run (map checks not hidden).
- Pond / carriageway / step 1 = start / compass -34 → 34° NE: as documented.
- File location rules (client/ error, project warning, worker/legs none): as documented.
- Suggested outdoor points (Grand Palais, Louvre, Invalides, Opéra Garnier) all pass leg:check; < 1 s per run.
- Recommended start 48.85585, 2.28744: 0 warnings.

## NPC zones, headless sim on the real graph (done; scratch zonesim.test.ts)
120 s no zone vs 120 s zone (after 15 s settle), seeds 1/2/3/5, Traffic + Crowd, 60 Hz:
- Rivoli (454.2, 16.9, r20): in 20 m 275–407 → 0–8 samples, standing 113–239 → 0.
- demo L1 Étoile/Champs (r30): 152–318 → 0–24, standing 35–103 → 0–1.
- demo L4 Pont Alexandre III (r35): 62–126 → 0–1.
- Opéra (r30): 325–429 → 0–11, standing 187–235 → 0.
- Car pairs < 1.8 m near the zone: 0 in every run (no red-running collisions seen); no new long jams.
- traffic ms/step with zone: ≤ 0.173 (43 cars), no zone 0.126: inside the 0.5 ms budget.
- Pre-existing (not round 3): Rivoli eastbound edge 170570 jams WITHOUT a zone (7 cars standing up to 385 s, seed 2).

## NPC zones in the RUNNING game (Vite :5493 + headless Chrome, zone set after __READY__ via npcs().setExclusionZones)
- Rivoli (player 100 m away, seed 1): 90 s no zone: 214 samples in 20 m, 96 standing → zone (after 15 s): **0 / 0**, inMargin 0,
  car overlaps 0, longest standing car within 150 m 0 s; traffic step avg 0.033 ms (max 0.3); no console errors.
- demo L1 Étoile / Champs (r30, 42 cars): 80 / 26 → **0 / 0**, overlaps 0, step avg 0.113 ms (max 1.4).
- demo L4 Pont Alexandre III (r35, 23 cars): 12 / 0 → **0 / 0**, overlaps 0, step avg 0.054 ms (max 0.9).
- Budget (plan 4B: traffic ≤ 0.5 ms / step, 60 cars): met in game and headless.

## sim (LEG_FORMAT §13 command, example leg copied outside the project)
`npm run sim -- --leg <scratch>/example.json --bots 2 --speedup 2`: exit 0, "Chặng mini (6 bước): 2 / 2 đội về đích · xếp hạng 2 dòng ·
dòng ghi / đội 47,5 (≤ 110)", no clueNew counted as refused, 9 min 39 s wall (1128 s simulated). `--help`, bad option: OK.

## Screenshots (SCREENSHOT_PORT=5492; script fails on console errors: none)
player, p5-hud, p6-peers, p7-clock, p7-mat, p7-celebrate, p7-pit + leg:check "Xem" (T1), "Trong game" (T1), new start.
- p7-clock: "Chưa bắt đầu" badge above THỜI GIAN --:--. Offline presets: no badge.
- p7-mat: only "Đội thử" tag (host tag gone at distance); p7-celebrate: host tag visible near.
- Xem T1: mat in the middle of the picture. New start 48.85585, 2.28744: open walkway under the viaduct.

Note: the Mac slept 03:20–07:32 during the first in-game / sim runs (invalidated, rerun under caffeinate).
