# UX phản hồi 26/10/2026 — đợt 4

## Phạm vi

Xử lý các mục #6, #10, #16, #17, #7 và #11 trong danh sách phản hồi ngày 26/10/2026.

## Production

- **Code:** `5049967`
- **Deployment:** `dpl_8kQffkL8QL9pNKUXREmX4Q8JBJHa`
- **URL:** `https://task-cus.vercel.app`
- **Health:** `db=up`, `commit=5049967`
- **Migration:** không có migration mới.

## Kết quả

### #6 — Ẩn khai báo ca với lãnh đạo đội

- `UNIT_LEADER`, `SYSTEM_ADMIN`, `DEPARTMENT_LEADER` → `HIDDEN`.
- `STAFF` → `COLLAPSED`.
- Giả định hiện tại: “lãnh đạo đội” là `DEPARTMENT_LEADER`; “trưởng/phó nhóm” đang mang role `STAFF`.
- Nếu trưởng/phó nhóm mang role `DEPARTMENT_LEADER`, cần bổ sung role/field riêng trước khi bật lại.

### #10 — Thu gọn cảnh báo phân công

- Chuyển banner cảnh báo phân công thành `<details>` đóng mặc định.
- Tiêu đề hiển thị số dòng chưa phân nhóm: `Cảnh báo phân công (N)`.
- Bấm mới mở nội dung chi tiết.

### #16 — Bảng điều hành

- Kỳ `Hôm nay / Tuần / Tháng / Tất cả` nằm cùng một hàng, không xuống dòng.
- Thêm `aria-pressed` cho trạng thái kỳ đang chọn.
- Trên màn hình nhỏ, thanh kỳ co giãn full chiều rộng; bộ lọc đơn vị xuống hàng riêng.

### #17 — Bảng chỉ tiêu

- Cột Tháng/Quý/Năm được tô nền nhẹ, in đậm, màu primary.
- Header các cột lũy kế cũng in đậm/màu.
- Có tooltip “Lũy kế tự động từ các bản ghi phát sinh ngày”.
- Không dùng hiệu ứng nhấp nháy.

### #7 — Kế hoạch trùng

- Khi tạo kế hoạch bị trùng, màn hình hiển thị nút **Mở kế hoạch trùng để sửa/xóa**.
- Nút đóng modal tạo, tải lại danh sách và chọn đúng kế hoạch trùng.
- Từ đó lãnh đạo dùng nút **Sửa kế hoạch** hoặc **Hủy kế hoạch trùng** theo quyền hiện có.
- Chưa mở rộng hủy kế hoạch đã có hạng mục; giữ nguyên quy tắc audit hiện tại.

### #11 — Target Thu NSNN

- Thêm cảnh báo đơn vị trong màn hình target khi giá trị `Thu NSNN` nhỏ hơn 1.000 tỷ đồng.
- Có nút **Nhân 1.000 (đổi tỷ → đồng)** để tránh nhập thiếu 3 số 0.
- **Chưa tự sửa dữ liệu Production** vì cần xác nhận số gốc từ Quyết định 04/QĐ-HQKV16.
- Giá trị đang lưu: `1.685.000.000`, `1.700.000.000`, `200.000.000`.
- Đề xuất nếu xác nhận là 1.685 tỷ / 1.700 tỷ / 200 tỷ: sửa thành `1.685.000.000.000`, `1.700.000.000.000`, `200.000.000.000`.
- **Tổng Thu NSNN không cần ô nhập tay**: tổng = tổng các phân loại (ô tô + than cốc + hàng hóa khác). Nhập tổng tay sẽ cộng đôi.

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `scripts/test-ux-phase3b-routine-declaration.ts` | 35/35 PASS |
| `scripts/test-cumulative-helper.ts` | 9/9 PASS |
| `scripts/test-ux-phase4-polish.ts` | 7/7 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Production health | PASS |

## Rủi ro còn lại

- #6 phụ thuộc mapping role thực tế của trưởng/phó nhóm.
- #7 chỉ hủy kế hoạch trùng chưa có hạng mục; kế hoạch đã có hạng mục vẫn phải xử lý theo quy trình.
- #11 dữ liệu target Production chưa đổi; cần xác nhận nguồn.
