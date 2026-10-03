# Xe mồi bấm F báo "Xe này bị hỏng" (2026-10-03, SPEC §17.30)

- Worker: `VehicleSpawner.claim()` từ chối `bike.segment === -1` bằng `reason: 'broken'` ngay sau kiểm tra `gone` (trước `taken` / `far`), nên cả claim lẫn mount lại đều không cấp xe; `BikeService.onTeam` trả lời thẳng, không ghi SQLite, không đổi chủ / rider; xe hoang / dọn xe với decoy giữ như cũ.
- Client không nhận cờ decoy nào (BikeInfo không đổi); chỉ phản hồi sau khi bấm F: `Bikes.onClaimResult` → `ClaimNotice 'bikeBroken'` → toast "Xe này bị hỏng" (`ui/Toasts.ts`), không lên xe. Giữ F không spam: `pending` + `claimTimeoutMs` của Bikes và `toasts.repeatGap` đã lọc.
- Test: `VehicleSpawner.test.ts` (decoy → broken, xe nguyên trạng), `bikeLink.test.ts` (toast), `Toasts.test.ts` (mã mới). Build xanh. Không chạy ride-check / sim / screenshot (theo yêu cầu).
- Docs: RACE_RULES §3, SPEC §17.30. README / CLAUDE.md / TODO không nhắc xe mồi → không đổi.
