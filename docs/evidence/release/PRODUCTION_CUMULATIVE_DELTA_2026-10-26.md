# PRODUCTION — TÍNH PHÁT SINH TỪ LŨY KẾ (26/10/2026)

**Trạng thái:** `DEPLOYED — CODE PASS — DATA CORRECTION PENDING`

- **Production:** `https://task-cus.vercel.app`
- **Deployment:** `dpl_EFf5gFQFtLrcoZRCN2g6exoR9jsX`
- **Code:** `94e0dbf`
- **Health:** `db=up`, `commit=94e0dbf`

## 1. Thay đổi

Màn hình `/giao-ban/nhap` có nút **Tính từ lũy kế** cạnh mỗi ô nhập được phép sửa:

- Nhập **Lũy kế hôm nay**.
- Nhập **Lũy kế hôm trước**.
- Hệ thống tính: `phát sinh ngày = lũy kế hôm nay − lũy kế hôm trước`.
- Chỉ điền vào ô nhập, **không tự lưu**; người nhập kiểm tra rồi bấm **Lưu số liệu**.

Ví dụ 24/10/2026:

- Ô tô: `976.580.710.648 − 959.496.645.254 = 17.084.065.394`
- Than cốc: `3.095.562.726 − 3.083.377.273 = 12.185.453`
- Hàng hóa khác: `354.765.262.432 − 354.792.312.027 = -27.049.595`
- Tổng: `17.069.201.252`

## 2. Nguyên nhân số 2.651.813.870.360

Read-only Production xác nhận:

- 23/10/2026: `1.317.372.334.554`
- 24/10/2026: `1.334.441.535.806`
- Hệ thống FLOW cộng hai ngày = `2.651.813.870.360`.

Đây là hai **số lũy kế YTD**, không phải phát sinh ngày. Cần sửa dữ liệu 24/10 theo hiệu số trên.

## 3. Target đang lưu

Read-only Production:

- BTC năm: `1.685.000.000` (nghi thiếu 3 số 0; cần đối chiếu QĐ 04/QĐ-HQKV16)
- UBND năm: `1.700.000.000` (nghi thiếu 3 số 0)
- KH tháng 10: `200.000.000` (cần đối chiếu nguồn)

Chưa tự sửa target vì là số liệu nghiệp vụ.

## 4. Phân quyền sửa

- Người được phân công nhập được sửa khi trạng thái: trống, `DRAFT`, `RECORDED`, `NEEDS_FIX`.
- `SUBMITTED`/`CONFIRMED`: người nhập không sửa trực tiếp; lãnh đạo bấm **Cần điều chỉnh** kèm lý do.
- `LOCKED`: phải mở khóa theo quy trình.
- `SYSTEM_ADMIN`/CNTT không mặc định có quyền nhập; cần `metrics.entry_all` hoặc phân công.

## 5. Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `scripts/test-cumulative-helper.ts` | 7/7 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `/api/health` Production | 200, db up |
| `/giao-ban/nhap` | 307 unauth |

## 6. Việc còn lại

- Người được phân công sửa 24/10 bằng nút **Tính từ lũy kế** và bấm Lưu.
- Đối chiếu/sửa 3 target đúng đơn vị đồng.
- Sau đó kiểm tra lại LK tháng/năm và %.
