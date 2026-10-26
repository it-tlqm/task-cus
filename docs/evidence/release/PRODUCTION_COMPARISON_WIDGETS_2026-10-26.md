# So sánh thu NSNN dạng widget — 26/10/2026

## Production

- **Code:** `a38c315`
- **Deployment:** `dpl_AfSjFjz92WDCas5si89izpWtycHN`
- **URL:** `https://task-cus.vercel.app`
- **Health:** `db=up`, `commit=a38c315`
- **Migration:** không có.

## Thay đổi

Khối **So sánh kết quả thu NSNN** không còn là bảng rộng. Đã chia thành widget:

### Nhóm “Chỉ tiêu giao” — 3 widget

- Chỉ tiêu Bộ Tài chính (năm)
- Chỉ tiêu UBND tỉnh (năm)
- Kế hoạch tháng HQTL

Mỗi widget:

- Giá trị thực tế / chỉ tiêu, rút gọn theo tỷ/triệu.
- Tỷ lệ % ở góc phải.
- Trạng thái chỉ tiêu (Đã xác nhận, Chưa xác nhận, Chưa cấu hình…).
- Không còn cột Nguồn / Kỳ.

### Nhóm “So sánh kỳ” — 2 widget

- So với tháng trước.
- So với cùng kỳ năm trước.

Mỗi widget:

- Giá trị hiện tại so với kỳ đối chiếu.
- Tỷ lệ tăng/giảm.
- Số ngày so sánh hoặc “Chưa đủ kỳ”.
- Nếu thiếu dữ liệu: “Chưa có dữ liệu đối chiếu” + link nhập số thực tế.

## Phạm vi áp dụng

Component dùng chung nên tự áp dụng ở:

- Dashboard chính (`/dashboard`)
- Dashboard V4 (`/dashboard/v4`) — cả bảng so sánh mới thêm.
- Trang Số liệu giao ban (`/giao-ban`).

Responsive:

- Desktop: 3 widget chỉ tiêu + 2 widget so sánh.
- Tablet/mobile: xếp dọc.

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `scripts/test-comparison-config.ts` | 14/14 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Production health | PASS |

## Lưu ý

- Tỷ lệ vẫn cao do 3 target Production đang thiếu 3 số 0; chưa tự sửa khi chưa xác nhận nguồn.
- Giá trị gốc vẫn xem được khi rê chuột vào widget.
