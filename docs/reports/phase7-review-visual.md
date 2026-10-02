# Phase 7 – visual / UX review

Reviewer: visual/UX (port 5421). Status: DONE. No source edits.

## Checks run
- `SCREENSHOT_PORT=5421 npm run screenshot -- p7` (all 16 presets, exit 0, no console errors); opened every PNG.
- `... -- p6 p5-hud p5-menu p5-minimap p4-ride p4b-street p3-idle` (exit 0); opened every PNG. No regression seen vs earlier phases.
- Bir-Hakeim: free-cam overview + start spots 2, 5, 6, 7, 8 (`?start=` of `startSpot(paris-demo, n)`) with F3: feet y = 1.60 at every spot (metro top is 7.2) → on the walkway under the viaduct, not on it.
- 1024×640 (playwright-core + Vite on 5421, scratch script): full card, Sổ mật thư, Pit Stop line + PHẠT row, zone panel + start-order banner, Host page.
- Start-order banner at 14.5 s / 16.5 s: headless sim only reached 14 s in 90 s, so the fade is not visually verified (format.test.ts covers the 15 s rule; CSS fade = `.rc-banner.on`).

## OK
- Vietnamese with diacritics everywhere (cards, book, banner, prompts, toasts, Host page). Test leg marked "(NỘI DUNG GIẢ)".
- Compact card colours/icons per type, full card, book (current pinned + "Về mật thư hiện tại"), "Tại điểm này", clock "--:--", PHẠT row, penalty countdown: readable at 1280×720, no overlap with HUD/minimap/toasts.
- Banner "Xuất phát ở vị trí thứ n" on the right, street-label style.
- Pit Stop mat (red + yellow stripes) on the Pont d'Iéna deck, host NPC beside it; box + flag on the deck, "Bấm F để mở hộp mật thư" prompt.
- Host page: status buttons, leg load (disabled with explanation once teams joined), start-time inputs with T+ preview, progress matrix (green done / yellow current), ranking, "Vượt tốc" in red.

## Findings
1. **major – minimap / street label / clock drawn over the Sổ mật thư and the full card at 1024×640.** `client/src/race/ui/race.css:122` `.rc-overlay { z-index: 0 }` sits under the HUD boxes, so the minimap (x 15–317) covers the book's lower-left text ("Nút tạm…", "Nhận lúc…", the next card's text) and "Place de la Concorde" covers its right edge. At 1280×720 the 520 px panel just clears them (minimap stays undimmed there too). Reproduced (s-book.png, s-card-full.png at 1024×640). Fix: hide `.hud-box` while the overlay is open, or give the overlay a z-index above the HUD (still below the menu's 1 → e.g. HUD to auto, overlay 1, menu 2).
2. **minor – Bir-Hakeim first view is mostly the dark inside of the island arch.** Start (48.85569, 2.28758, yaw 33°) is 1–5 m in front of the stone arch passage; the follow camera sits inside the vault (p7-start, p7-start-island, rv-spot-6/7/8: half the screen is a dark faceted vault). Placement itself is correct (deck, y 1.6). Suggest moving `start` a few metres forward along yaw (leg content; demo leg only).
3. **minor – host NPC name tag unreadable and overlapping.** `client/src/config.ts:1070` host `shirt: '#23262d'` is also the tag colour (PitStop.ts:52 passes it to CharacterModel), so "Người dẫn chương trình" is near-black on dark trees/buildings (p7-celebrate) and overlaps the own "Đội thử" tag at distance (p7-mat).
4. **minor – Host T+ preview wrong for a finished team.** `client/src/host/hostView.ts:148-153` `startPreview` uses now − start, ignoring `finishAt`: Đội Xanh (finished) shows "Đồng hồ đội sẽ hiện T+00:50:00" while its official time is 00:46:00 (p7-host). It also does not flag `at > finishAt` (server error, D15) before the Host presses Lưu.
5. **minor – Host tables need horizontal scroll at 1024 px.** "Bước hiện tại" / "Phạt" (Giờ xuất phát) and "Phạt / Về đích / Chính thức / Cách" (ranking) are off-screen in the `.scroll` container at 1024×640 (s-host.png): the ranking result is hidden unless the Host scrolls sideways.
6. **minor – controls help lacks Tab.** `client/index.html:44` `#keys-src` lists F, C, G, M, Esc… but not `Tab` Sổ mật thư (nor Enter / 1 / 2 for the task buttons); only the compact card's "Tab: Sổ mật thư" hint mentions it.
