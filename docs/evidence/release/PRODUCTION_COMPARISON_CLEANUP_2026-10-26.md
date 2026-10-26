# Dọn khối So sánh thu NSNN — 26/10/2026

## Production

- **Code:** `c278c8c`
- **Deployment:** `dpl_2z67APeiQ4CPjJHGXvJwPh9Gjnwy`
- **URL:** `https://task-cus.vercel.app`
- **Health:** `db=up`, `commit=c278c8c`
- **Migration:** không có.

## Thay đổi

Trong khối **So sánh kết quả thu NSNN** (dùng chung Dashboard, `/giao-ban` và V4):

- Bỏ cột **Nguồn / Kỳ**.
- Bỏ đoạn **Công thức: % BTC/UBND...** ở cuối bảng.
- Bảng còn 3 cột:
  1. Nội dung đối chiếu
  2. Số liệu đối chiếu
  3. Tỷ lệ
- Giữ nhãn quy tắc **“Kỳ trước/cùng kỳ: SO CÙNG SỐ NGÀY (B1-A)”** vì đây là quy tắc so sánh, không phải công thức tính tỷ lệ.
- Dòng thiếu dữ liệu vẫn hiển thị “Chưa xác định” / “Chưa đủ kỳ”, không tự hiện 0%.

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `scripts/test-comparison-config.ts` | 13/13 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Production health | PASS |

## Lưu ý dữ liệu

Tỷ lệ BTC/UBND/KH tháng vẫn đang rất lớn vì target Production đang lưu:

- BTC: `1.685.000.000`
- UBND: `1.700.000.000`
- KH tháng: `200.000.000`

Nếu số đúng là 1.685 tỷ / 1.700 tỷ / 200 tỷ thì cần sửa thành:

- `1.685.000.000.000`
- `1.700.000.000.000`
- `200.000.000.000`

Chưa tự sửa dữ liệu Production khi chưa xác nhận nguồn.
