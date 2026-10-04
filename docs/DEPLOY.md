# Hướng dẫn triển khai Cuộc đua Paris lên Cloudflare (cho người không chuyên)

Game chạy hoàn toàn trên Cloudflare (gói Free đủ cho một cuộc đua 2 giờ, 8 đội): một **Worker** phục vụ trang web + API, một **Durable Object** `RaceRoom` (bộ nhớ SQLite) cho mỗi cuộc đua, một **bucket R2** `MEDIA` chứa hình mật thư, và một **secret** `HOST_PASSWORD` là mật khẩu trang Host. Không cần máy chủ riêng.

Mỗi lệnh dưới đây gõ trong Terminal (macOS) hoặc PowerShell (Windows), **tại thư mục gốc của dự án** (thư mục có file `package.json` và `CLAUDE.md`).

---

## 1. Cần gì trước

| Thứ | Làm sao |
|---|---|
| Tài khoản Cloudflare (Free) | Đăng ký tại <https://dash.cloudflare.com/sign-up>. Không cần thẻ tín dụng, không cần tên miền riêng (dùng tên miền `*.workers.dev` miễn phí). |
| Bật Workers + R2 trên tài khoản | Trong Dashboard: **Workers & Pages** → làm theo hướng dẫn chọn tên miền phụ `<tên>.workers.dev` (chỉ một lần). **R2 Object Storage** → bấm "Get started" / đồng ý điều khoản (gói Free, không nhập thẻ). |
| Node.js ≥ 22.13 | <https://nodejs.org> (bản LTS). Kiểm tra: `node -v`. |
| Mã nguồn + thư viện | Trong thư mục dự án: `npm install` (một lần, vài phút). |
| Đăng nhập wrangler | `npx wrangler login` → trình duyệt mở ra, bấm **Allow**. Kiểm tra: `npx wrangler whoami`. |

`wrangler` là công cụ dòng lệnh của Cloudflare, đã nằm sẵn trong dự án (`worker/package.json`), không cần cài riêng.

---

## 2. Tạo bucket R2 và đặt mật khẩu Host (một lần)

Tên các binding dưới đây phải **giữ đúng** vì mã nguồn đang dùng chúng (file `worker/wrangler.toml`):

```toml
name = "cuoc-dua-paris"              # tên Worker → URL https://cuoc-dua-paris.<tên>.workers.dev

[assets]
directory = "../client/dist"         # trang web (client build)
binding = "ASSETS"

[[durable_objects.bindings]]
name = "RACE_ROOM"                   # Durable Object, một bản cho mỗi mã cuộc đua
class_name = "RaceRoom"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RaceRoom"]

[[r2_buckets]]
binding = "MEDIA"                    # hình mật thư
bucket_name = "cuoc-dua-paris-media" # tên bucket thật trên Cloudflare
```

Không cần sửa file này. Chỉ làm 2 việc:

**2a. Tạo bucket R2** (tên phải là `cuoc-dua-paris-media`):

```
npx wrangler r2 bucket create cuoc-dua-paris-media --config worker/wrangler.toml
```

Kiểm tra: `npx wrangler r2 bucket list --config worker/wrangler.toml` phải liệt kê `cuoc-dua-paris-media`. Bucket là **riêng tư**: hình chỉ được Worker đưa cho đội đã mở đúng mật thư.

**2b. Đặt mật khẩu Host** (secret `HOST_PASSWORD`). Chọn mật khẩu dài, khó đoán (≥ 12 ký tự) – nó vừa là mật khẩu vào trang Host, vừa là khóa ký phiên đăng nhập của các đội:

```
npx wrangler secret put HOST_PASSWORD --config worker/wrangler.toml
```

Lệnh hỏi "Enter a secret value" → gõ mật khẩu (không hiện ra) → Enter. Nếu Worker chưa từng deploy, wrangler hỏi có tạo Worker mới không → chọn **Yes**. Đổi mật khẩu: chạy lại lệnh này (mọi phiên đang đăng nhập sẽ bị đăng xuất).

> Khi chạy thử trên máy mình (`npm run dev:worker`), mật khẩu nằm trong `worker/.dev.vars` (sao chép từ `worker/.dev.vars.example`). File này không lên Cloudflare và không được commit.

---

## 3. Build và deploy

```
npm run deploy
```

Lệnh này = `npm run build` (kiểm tra kiểu toàn bộ, build trang web vào `client/dist`, chạy `wrangler deploy --dry-run` kiểm bundle) rồi `wrangler deploy` thật trong `worker/`. Lần đầu mất vài phút (tải ~445 file tĩnh, ≈ 62 MB; các lần sau chỉ tải file đổi). Kết thúc, wrangler in ra URL dạng:

```
https://cuoc-dua-paris.<tên>.workers.dev
```

Đó là **link game**. Nếu chỉ muốn kiểm mà không deploy: `npm run build` (có dry-run, không đụng Cloudflare).

Mỗi lần sửa mã / cập nhật bản mới → chạy lại `npm run deploy`. Dữ liệu cuộc đua (đội, tiến độ) nằm trong Durable Object, **không mất** khi deploy lại; hình R2 cũng giữ.

---

## 4. Sau khi deploy: chuẩn bị một cuộc đua trên trang Host

1. Mở `https://cuoc-dua-paris.<tên>.workers.dev/host.html`.
2. **Mã cuộc đua**: đặt một mã mới cho mỗi cuộc đua / mỗi buổi diễn tập, ví dụ `paris-2026-11-15` (chữ thường a–z, số, gạch ngang, ≤ 32 ký tự). Mỗi mã là một phòng riêng, dữ liệu không lẫn nhau. Gõ **Mật khẩu Host** (bước 2b) → **Đăng nhập**.
3. **Nạp chặng thật**: mục "Chặng" → "Nạp chặng từ file" → chọn file chặng thật (file này nằm **ngoài** repo, ví dụ trong `~/Documents/chang-that/`; đã kiểm bằng `npm run leg:check -- <đường dẫn file>` trước đó, 0 lỗi). Chặng nạp xong hiện tên + số bước; cảnh báo (nếu có) hiện ngay dưới. Chặng chỉ nằm trong Durable Object của mã cuộc đua này, không bao giờ vào trang web của người chơi.
4. **Hình mật thư (R2)**: mục này liệt kê mọi tên hình `r2:` mà chặng nhắc tới, kèm trạng thái "chưa có" / "đã có". Với từng tên: bấm chọn file (JPEG / PNG / WebP, ≤ 5 MB) → tải lên → bấm **Xem** để kiểm. Hình lưu theo mã cuộc đua (`<mã>/<tên>`): diễn tập ở mã khác thì phải tải lại.
5. **Tạo đội**: ô "Tạo đội", mỗi dòng một đội `Tên đội; Tên người chơi` → **Tạo đội & sinh mã**. Bảng "Các đội" / "Thứ tự vào game" hiện **mã đội 6 ký tự** mỗi đội kèm nút **Sao chép**. Chép từng mã vào bảng tính / giấy để phát cho các đội (in / tin nhắn). Mã không hiện lại trong game, nên lưu bảng này.
6. **Link cho người chơi**: trang Host hiện sẵn `https://cuoc-dua-paris.<tên>.workers.dev/?race=<mã cuộc đua>` + nút Sao chép. Đội mở link, gõ mã đội → vào game tại điểm xuất phát.
7. **Hành lang xe đạp**: trang Host tự tính và gửi các chỗ đặt xe (mục "Xe chung", nút "Tính hành lang & gửi ứng viên" nếu cần tính lại). Máy chủ chỉ chọn ngẫu nhiên từ danh sách này.
8. Khi các đội đã sẵn: mục "Cuộc đua" → **Mở cuộc đua** (có hỏi xác nhận, nhắc các ô còn trống; Tạm dừng / Tiếp tục khi cần). Trong lúc đua: cột "Chờ duyệt" (Duyệt / Phạt, Hoàn tác 10 giây), ma trận tiến độ (Cho qua), cờ đỏ vượt tốc + Xóa cờ, cảnh báo kẹt, khung **Bản đồ trực tiếp** (góc phải dưới, chỉ trang Host có: vị trí các đội theo thời gian thực + các điểm của chặng, điểm có đội đang tới viền trắng). Cuối: **Kết thúc** (đội chưa về đích → BỊ LOẠI), rồi **Xuất dữ liệu thời gian** (CSV mở bằng Excel + JSON).

Luật chơi cho đội: `docs/RACE_RULES.md` (cũng mở được trong game).

---

## 5. Checklist kiểm trước ngày đua (làm trên bản đã deploy, mã cuộc đua diễn tập riêng)

- [ ] `npm run deploy` xong không lỗi; mở link game, thấy Paris + nhân vật ở Bir-Hakeim / xuất phát của chặng.
- [ ] **FPS máy thật**: game không còn phím mở bảng FPS (người chơi không thấy). Để tự kiểm, mở `https://<địa chỉ>/?offline=1&debug=1` (thế giới thử, có bảng thông số). Mục tiêu ≥ 30 ổn định. Nếu thấp: **Esc → Cài đặt → Chất lượng đồ họa → Thấp**, tải lại trang. Máy yếu tự chọn Thấp; ở Cao, nếu FPS tụt game tự hạ cấp (hiện thông báo nhỏ). Nhớ dặn các đội cách này.
- [ ] Thử trên **2 trình duyệt** (Chrome + Edge hoặc Firefox / Safari) và ít nhất một máy Windows + một macOS: đăng nhập mã đội, đi, lấy xe (F), mở hòm (F), Sổ mật thư (Tab), Enter mở lại thẻ.
- [ ] Trang Host trên một máy khác: nạp chặng, tải đủ hình R2 (mọi dòng "đã có", bấm Xem được), tạo 2 đội thử, chép mã, đăng nhập 2 đội trên 2 tab / 2 máy, thấy nhau trên bản đồ.
- [ ] Chạy thử một bước có thử thách: đội gõ đáp án → Host **Duyệt**, rồi bấm **Hoàn tác** trong 10 giây → thẻ đội quay lại; Duyệt lại. Thử **Phạt** (đội thấy đếm ngược) và **Cho qua**.
- [ ] Thử mất mạng: tắt Wi-Fi 20 giây rồi mở lại → game nối lại đúng chỗ cũ.
- [ ] **Xuất CSV** sau diễn tập: file mở trong Excel đọc được tiếng Việt (có BOM), đủ số đội, không có IP.
- [ ] Hẹn giờ: Worker Free không giới hạn giờ chạy; nhưng tạo **mã cuộc đua mới** cho ngày thật (đừng dùng lại mã diễn tập), tải lại hình R2 cho mã đó, kiểm `leg:check` lần cuối với file chặng cuối cùng.
- [ ] Đổi `HOST_PASSWORD` nếu đã lộ cho người ngoài ban tổ chức (bước 2b), rồi đăng nhập Host lại.

---

## 6. Hạn mức gói Free và cách đọc bộ đếm trên trang Host

Gói Workers Free (số liệu Cloudflare công bố, kiểm lại trên Dashboard vì có thể đổi): Worker **100 000 request / ngày**; Durable Object **100 000 request / ngày**, SQLite **100 000 dòng ghi / ngày**, 5 triệu dòng đọc / ngày, 5 GB lưu; R2 10 GB lưu, 1 triệu lần ghi / tháng, 10 triệu lần đọc / tháng. Ngân sách đặt ra trong SPEC §3 cho cuộc đua 2 giờ, 20 đội: **< 40 000 request tính phí và < 20 000 dòng SQLite**; cho 8 đội là **< 16 000 request / < 8 000 dòng** (tỉ lệ theo số đội).

Đo bằng bot (Phase 11, `npm run sim -- --full --teams 8`, 8 bot đi liên tục 2 giờ – trường hợp xấu nhất): **≈ 13 800 request và ≈ 2 800 dòng SQLite** → đạt, biên ≈ 14 % về request. Con số thật sẽ thấp hơn khi đội dừng đọc mật thư (không gửi vị trí).

**Đọc bộ đếm trên trang Host** (mục "Hạn mức Cloudflare (ước tính)"): `Tin WebSocket nhận`, `Tin WebSocket gửi`, `Request HTTP / WS mở`, `Alarm`, `Dòng SQLite ghi`, `Request tính phí (ước tính)` = HTTP + WS mở + tin WebSocket nhận ÷ 20 + alarm. Bộ đếm cộng dồn cho cả mã cuộc đua (lưu cùng ảnh chụp vị trí, không mất khi Durable Object ngủ) – nên diễn tập dùng mã khác để số của ngày thật sạch; thực tế Cloudflare tính cao hơn 15–20 % (bộ đếm hụt một số request hệ thống). Trong lúc đua, nếu "Request tính phí" vượt **8 000 sau 1 giờ** (8 đội) là đang sát; kế hoạch dự phòng: không có gì phải tắt – 100 000 / ngày của gói Free vẫn còn xa; chỉ cần không chạy nhiều cuộc đua song song trong cùng ngày.

Số thật trên Cloudflare: Dashboard → **Workers & Pages → cuoc-dua-paris → Metrics** (Requests), **Durable Objects → Metrics**. Ghi lại sau cuộc đua vào `TODO.md` ("Đo lại trên Cloudflare thật").

---

## 7. Sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| `npx wrangler login` không mở trình duyệt | Chạy lại, hoặc `npx wrangler login --browser=false` rồi dán URL vào trình duyệt. |
| `wrangler deploy` báo thiếu `HOST_PASSWORD` / `MEDIA` | Chưa làm bước 2a / 2b. Chạy lại hai lệnh đó rồi `npm run deploy`. |
| `npm run build` lỗi `client/dist` không có | Chạy từ thư mục gốc, đúng lệnh `npm run build` (nó build client trước). |
| Deploy báo "You need to register a workers.dev subdomain" | Dashboard → Workers & Pages → đặt tên miền phụ (một lần). |
| Trang Host: "Sai mật khẩu Host" | Secret đặt khác với mật khẩu gõ; đặt lại bằng bước 2b (có phân biệt hoa thường, dấu cách). |
| Trang Host: "Mã cuộc đua không hợp lệ" | Chỉ a–z, 0–9, gạch ngang; bắt đầu bằng chữ / số; ≤ 32 ký tự. |
| Đội: "Mã đội không đúng" | Mã 6 ký tự, đúng mã cuộc đua trong link (`?race=`); đội của mã khác không vào được. |
| Hình mật thư "chưa có" dù đã tải ở lần diễn tập | Hình lưu theo mã cuộc đua: tải lại cho mã mới. |
| Hình tải lên lỗi 413 / "quá 5 MB" | Nén hình (JPEG chất lượng 80, ≤ 2 000 px) rồi tải lại. |
| Game đứng hình / FPS thấp | Esc → Cài đặt → Chất lượng đồ họa → Thấp; đóng tab khác; cắm nguồn laptop; Chrome/Edge dùng GPU rời (Windows: Cài đặt đồ họa). |
| Đội "Mất kết nối, đang nối lại…" lâu | Mạng của đội; game tự nối lại và giữ vị trí. Nếu đội kẹt ở một bước vì lỗi: trang Host → ô bước đó → **Cho qua**. |
| Host bấm nhầm Duyệt / Phạt | **Hoàn tác** trong 10 giây (thanh "Hoàn tác (còn n s)"). Quá 10 giây: Phạt nhầm → nút "Duyệt câu vừa phạt"; Duyệt nhầm → không hoàn được, ghi chú vào bảng. |
| Cuộc đua bị dừng giữa chừng (Host đóng trình duyệt, mất điện) | Dữ liệu nằm trên Cloudflare: mở lại `/host.html`, cùng mã + mật khẩu, mọi thứ còn nguyên; đội không bị ảnh hưởng. |

### Xóa dữ liệu cuộc đua cũ

- **Cách đơn giản, khuyên dùng**: không xóa; cứ dùng **mã cuộc đua mới** cho mỗi buổi. Mã cũ nằm im, không tốn request, dung lượng SQLite không đáng kể (vài nghìn dòng / cuộc đua). Nhưng lưu ý `Xuất dữ liệu thời gian` trước khi quên mã.
- Xóa hình R2 của một mã cũ (để không tốn dung lượng): `npx wrangler r2 object delete cuoc-dua-paris-media/<mã>/<tên hình> --config worker/wrangler.toml` (từng file), hoặc xóa trong Dashboard → R2 → bucket → thư mục `<mã>/`.
- Xóa **toàn bộ** (mọi cuộc đua, mọi đội): `npx wrangler delete --config worker/wrangler.toml` xóa Worker cùng mọi Durable Object của nó (không hoàn tác!), hình R2 vẫn giữ trong bucket. Sau đó deploy lại bằng bước 3 (secret phải đặt lại, bước 2b).
- Không có nút "Đặt lại" trong trang Host (cố ý: tránh bấm nhầm trong lúc đua).

---

## 8. Những gì KHÔNG được lên Cloudflare

- File chặng thật và đáp án: chỉ nạp qua trang Host vào Durable Object, không nằm trong mã nguồn hay trang web. Trước khi deploy, `npm run leg:check -- <file chặng>` quét `client/public` + `client/dist` để chắc không rò đáp án.
- `worker/.dev.vars` (mật khẩu local), `.cache/` (asset gốc), `~/Documents/chang-that/` – đều nằm ngoài bundle (đã kiểm bằng grep khi chuẩn bị Phase 12, xem `docs/reports/phase12-prep.md`).
- Bundle Worker chỉ chứa các chặng demo / test đánh dấu (GIẢ) (`worker/legs/`), không có nội dung thật.
