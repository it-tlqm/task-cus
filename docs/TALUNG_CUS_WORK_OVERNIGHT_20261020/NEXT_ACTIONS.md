# NEXT ACTIONS — sau đêm 21/10/2026

## 1. Checklist UAT buổi sáng (theo thứ tự ưu tiên)

### A. YC-37 — Chấp thuận / không đồng ý / giải trình
- [ ] Đăng nhập lãnh đạo demo (`demold01`) → mở **Phê duyệt** → bấm **Chấp thuận**:
      **phải mở modal xem trước**, thấy đủ mã/tiêu đề, người trình, hạn, tiến độ, kết quả,
      tệp đính kèm. **Chưa được duyệt ngay.**
- [ ] Trong modal chọn **Đồng ý** → hồ sơ biến mất khỏi danh sách chờ duyệt, nhiệm vụ sang `COMPLETED`.
- [ ] Chọn **Không đồng ý** → bắt buộc có lý do; nhiệm vụ về `IN_PROGRESS`, **kết quả đã ghi của cán bộ không bị ghi đè**.
- [ ] Chọn **Yêu cầu giải trình** → bắt buộc có nội dung; người trình thấy mục *Hồ sơ của tôi* → gửi giải trình → hồ sơ quay lại vòng 2, nhiệm vụ về `WAITING_REVIEW`.
- [ ] Bấm lại **Chấp thuận** lần 2 → phải bị chặn (409), không duyệt trùng.
- [ ] Đăng nhập cán bộ (`democb01`) → không thấy nút quyết định, không sửa được nhận xét của lãnh đạo.
- [ ] Mở *Nhật ký hệ thống* → thấy `APPROVAL_PREVIEW_VIEW` / `APPROVAL_AGREE` / `APPROVAL_REJECT` / `APPROVAL_CLARIFY` / `APPROVAL_RESPOND`.

### B. YC-33 — Điểm Bảng 1
- [ ] Mở **Kết quả công tác tháng** → khối *Điểm tính thử* hiện **trạng thái** (Đủ căn cứ / Chưa đủ dữ liệu / Chờ quy tắc / Chưa áp dụng).
- [ ] Mở phần *Chi tiết từng dòng* → thấy **nguồn hệ số** (QĐ1277 / Danh mục TX / Đã chốt) và các cột G / I / L / N.
- [ ] Công việc **chưa có hệ số** → dòng đó `Chưa đủ dữ liệu`, **không** ra điểm giả.
- [ ] So sánh với mẫu: Bảng 1 mẫu có `G19=1719.16 · I20=100 · L20=81.203029 · N20=100`; 01A có `D37=93.734343 · D38=65.61404 · D39=94.11404`.

### C. YC-34 — Biểu mẫu
- [ ] Mở **Kết quả công tác tháng** → khối *Biểu mẫu 01A/01B/02A/02B* → chọn mẫu → **Xem trước** → kiểm tra cảnh báo DỰ THẢO → **Tải Excel** → mở file, kiểm tra sheet, định dạng, vùng in.
- [ ] Phần **nhận xét của cấp có thẩm quyền** và **chữ ký** để trống (ghi tay hoặc nhập sau).
- [ ] 02A/02B có mục *Cá nhân tự đề xuất mức xếp loại*; 01A/01B **không** có (theo mẫu gốc).

### D. YC-36 — Tự đánh giá
- [ ] Mở **Kết quả công tác tháng** → khối *Tự đánh giá, nhận xét lãnh đạo và mức xếp loại đề xuất*.
- [ ] Ô *Gợi ý của hệ thống* phải hiện **"Chưa có gợi ý"** + lý do (chưa có quy tắc/ngưỡng được phê duyệt) — **không** hiện số bịa.
- [ ] Cán bộ nhập điểm tiêu chí chung (0…30), ưu điểm, hạn chế, mức xếp loại → lưu được.
- [ ] Cán bộ **không** sửa được ô nhận xét của lãnh đạo; lãnh đạo sửa được.
- [ ] Nhận xét lãnh đạo **mặc định để trống**.

### E. YC-35 — Quan hệ phụ trách
- [ ] Mở **Quản trị hệ thống → Quan hệ phụ trách** → thêm quan hệ (người phụ trách / cán bộ được phụ trách / phạm vi / thời hạn) → lưu.
- [ ] Thử tạo quan hệ ngược lại (vòng) → phải bị chặn.
- [ ] Chưa có quan hệ nào → điểm bình quân lãnh đạo báo **Chưa áp dụng** (không bịa điểm).

### F. Hồi quy YC-01→32
- [ ] Danh mục TX1 348 đầu việc, mã NV/CBL/TH…, hệ số 0 khác ô trống — còn nguyên.
- [ ] 48 mẫu cũ không mất lịch sử; 18 task / 5 plan / 26 đầu việc / 15 kết quả tháng — không đổi.

## 2. Việc còn lại (theo thứ tự ưu tiên)

1. **Công thức quý (YC-33/YC-34)** — chờ Hải quan công bố cách tổng hợp 3 tháng → quý. Hiện biểu 02A/02B để trống ô a/b/c.
2. **Bảng ngưỡng điểm → mức xếp loại** — chờ Hải quan; hiện `selfGradeSuggestion = NULL`.
3. **Quy tắc gợi ý điểm tiêu chí chung** — chờ Hải quan; hiện `commonCriteriaSuggested = NULL`.
4. **Quan hệ phụ trách thực tế** — quản trị viên nhập tại *Quản trị hệ thống → Quan hệ phụ trách* sau khi Hải quan xác nhận cơ cấu.
5. **Ánh xạ 6 nhóm danh mục TX → bộ phận** (còn từ Giai đoạn 1) — hiện `selectionMode=ALL`.
6. **Bổ sung bộ phận cho 14 hồ sơ nhân sự mới** — cần Hải quan xác nhận tên bộ phận chính thức.
7. **Bản in 02A/02B vùng in chi tiết** — hiện đã đặt A4 + print area; nếu Hải quan yêu cầu khổ giấy khác thì chỉnh `pageSetup`.
8. **Mẫu 01A/01B dùng template cũ `bang1-01a-template.xlsx` ở luồng xuất Bảng 1 cũ** — chưa đồng nhất hoàn toàn với bộ sinh mới; nên thống nhất 1 luồng xuất.

## 3. Lệnh chạy lại bộ kiểm thử

```bash
# Cấu trúc menu (không cần DB)
npx tsx scripts/test-yc30-navigation.ts

# Giao diện desktop + mobile (trỏ Production)
$env:TEST_BASE_URL="https://task-cus.vercel.app"
$env:TEST_LEADER_USER="demold01"; $env:TEST_STAFF_USER="democb01"
npx tsx scripts/test-yc30-ui.ts
npx tsx scripts/test-yc30-regression.ts

# YC-37
npx tsx scripts/test-yc37-approval-preview.ts      # Production (chỉ đọc)
npx tsx scripts/test-yc37-approval-flow.ts         # DB LOCAL

# YC-33
npx tsx scripts/test-yc33-scoring-parity.ts        # parity với workbook gốc
npx tsx scripts/test-yc33-scoring-flow.ts          # DB LOCAL

# YC-34/35/36
npx tsx scripts/test-yc34-36-eval.ts               # DB LOCAL
```

> Mật khẩu đọc từ `demo-ops/demo-secrets.json` (ngoài Git) hoặc biến môi trường `TEST_*_PASS` — **không ghi mật khẩu vào mã nguồn hay tài liệu**.

## 4. Rủi ro còn lại

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Công thức quý chưa chốt → 02A/02B có ô trống | Trung bình | Đã gắn nhãn DỰ THẢO; chờ Hải quan |
| Chưa có quan hệ phụ trách → 01B/02B chưa có a/b/c | Trung bình | Có màn quản trị để nhập; chờ xác nhận cơ cấu |
| 6 nhóm TX chưa ánh xạ bộ phận | Thấp | Đang ở chế độ mở (`ALL`), không chặn sử dụng |
| Bản in chưa khớp tuyệt đối giấy in thực tế | Thấp | Đã đặt A4 + print area; UAT sẽ xác nhận |
| Số liệu file gốc có 12 cặp tên trùng | Thấp | Giữ đủ 12 dòng, mỗi dòng một mã; chờ Hải quan xác nhận |

---

## 21/10/2026 — Sau YC-38B/38C (đã deploy `d905a1d`)

### Đã xong
- [x] C0 backup toàn bộ DB + restore-test PASS
- [x] C1 schema additive (3 bảng + 20 cột) — local + Production, 0 mất dữ liệu
- [x] C2 bộ chọn nguồn dùng chung (/plans, /my-work, /tasks)
- [x] C3/C4 write path liên thông (task/việc gốc/provenance/phân công)
- [x] C6 kiểm thử: YC-38C 28/28 + hồi quy YC-01→37 xanh
- [x] C7 deploy + smoke Production (gợi ý TX, tìm không dấu, E2E tạo việc có nguồn)

### Còn lại (chờ quyết định)
- [ ] **Q-B4** — chốt thứ tự ưu tiên hệ số TX vs QĐ1277 (hiện hệ thống hiển thị cả hai, **không** tự chọn)
- [ ] Q-B1/Q-B2/Q-B3 — xác nhận 3 quyết định nghiệp vụ đã triển khai theo khuyến nghị
- [ ] 48 mẫu cũ: rà phụ thuộc rồi mới ẩn khỏi form tạo mới
- [ ] Dọn 2 phiếu `evaluation_assessments` DRAFT rỗng + 2 `approval_cases` do test tạo (cần duyệt trước khi xoá)
- [ ] UI phân công tiếp (bảng `work_item_assignments` đã sẵn sàng, chưa có màn hình) — chốt phạm vi
- [ ] Backfill `work_item_id` cho 15 kết quả tháng DEMO — **không** tự làm, cần Hải quan quyết từng dòng
