# Phase 8B – Track C (HUD): thẻ louvre, feed, Ghi nguồn, toast

Nhánh `phase8b-track-C`. Không đụng main.ts / worker / shared.

## Đã làm
- `race/ui/format.ts`: `louvreInfo(card, lv, {now, inRoom})` (trạng thái chưa vào / trong phòng / đang phạt / xong; "Đang chọn k[/5] tác phẩm"; "Chốt sai: n lần"; "Đáp án bao gồm 5 tác phẩm" từ phút 40; "Đúng x/5" sống từ phút 70, "Đúng 0/5 (chưa chọn tác phẩm nào)"); `cardPanel(...).louvreInfo` (null trong Sổ); `answerLines` thêm "· đúng c/5" khi `AnswerView.correct` có. Đếm ngược 3 phút dùng lại `lockLine` / `timerLine` của Phase 8.
- `RaceHud.ts`: khối `.rc-louvre` trên thẻ; `setRoom(inside)` (track B gọi với `LouvreRoom.active`); `feed()` vẽ thật; `credits(items)`; `actions.credits?()` tùy chọn; `DEMO_LOUVRE`, `DEMO_CARDS.louvre`, `louvre-locked`; demo `?feed=n`, `?credits=louvre`.
- `ui/Feed.ts`: `feedText`, `liveEntries` thuần + DOM (góc theo `feed.corner`, tự mờ sau `feed.seconds`, tối đa `feed.lines`, không nhận chuột).
- `ui/Credits.ts`: cổng `setCreditsGate` (RaceHud.setView: về đích / Host kết thúc), `setCreditItems`, `onCreditsRequest`, `creditLines`; trước đích hiện "Mở sau khi về đích" + toast `creditsLocked`; offline xem đầy đủ; sau đích có mục "Phòng Louvre" (hiện đầu danh sách), yêu cầu `credits` một lần mỗi lần mở.
- `ui/Toasts.ts`: `lockWrongText(minutes)`. Menu.ts không cần sửa (nút Ghi nguồn đã bấm `#credits-open`, cổng nằm trong Credits).
- config `feed.bottomLift`; scripts/screenshot.ts: preset `p8b-card-louvre-small`, `p8b-feed-small` (1024×640).
- Test `race/ui/louvre.test.ts`.

## Track B / main.ts cần nối
1. Truyền `credits: () => raceClient.credits()` vào actions của RaceHud; khi nhận `{t:'credits'}` gọi `hud.credits(items)`.
2. `hud.setRoom(louvreRoom.active)` khi vào / ra phòng.
3. Toast `lockWrong` dùng `toast(lockWrongText(card.retryPenaltyMinutes))` thay `notice('lockWrong')`.

## Lệch
- Feed mặc định dưới trái nhưng đặt bên PHẢI minimap (không chồng minimap và toast ở trên nó).
- Dòng feed của lần welcome hiện như dòng mới (tuổi không biết trên đồng hồ client).
