# PRODUCTION — DASHBOARD V4 + ĐỊNH DẠNG SỐ (25/10/2026)

**Trạng thái:** `DEPLOYED — TECHNICAL SMOKE PASS — UAT PENDING`

**Production:** `https://task-cus.vercel.app`

**Deployment:** `dpl_GyaAiKyDsWokXHPkVzK7Z135sF5h`

**Code:** `b08d9b0` (bao gồm Dashboard V4 `80578c9` + định dạng số `b08d9b0`)

**Health:** `status=ok`, `db=up`, `commit=b08d9b0`, `env=production`

**Flags:** YC-10 ON, YC-11 OFF.

---

## 1. Đã triển khai

- Dashboard V4 tại `/dashboard/v4`; dashboard cũ vẫn mặc định.
- Nút “Thử giao diện V4” trên dashboard cũ.
- Nút “Nhập chỉ tiêu đối chiếu” trong khối so sánh; mở đúng tab Chỉ tiêu giao + chọn THU_NSNN.
- Định dạng số khi nhập:
  - `1000` → `1.000`
  - `1000000` → `1.000.000`
  - `1000,5` → `1.000,5`
  - raw gửi backend không có dấu phân cách.
- Áp dụng cho ô nhập số liệu giao ban và ô giá trị chỉ tiêu.

## 2. Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `scripts/test-formatted-number-input.ts` | 10/10 PASS |
| `scripts/test-dashboard-v4.ts` | 14/14 PASS |
| `/api/health` | 200, db up |
| `/login` | 200 |
| `/dashboard/v4` | 307 unauth |
| `/giao-ban/nhap` | 307 unauth |
| `/giao-ban/cau-hinh?...` | 307 unauth |
| Browser smoke V4 local | 200, không lỗi console |
| Browser smoke link cấu hình | mở đúng tab TARGET, chọn THU_NSNN |

## 3. Chưa kiểm tra

- UAT tài khoản thật trên Production (không dùng credential Production trong phiên này).
- Mobile thật 360/390.
- Nhập target thật và xác nhận %.
- Số thực tế tháng trước/cùng kỳ: cần dữ liệu lịch sử.

## 4. Rollback

Code rollback về bản trước Dashboard V4:

```powershell
vc rollback dpl_9MJ4xomnRZGzMdFL7uZw2mV8E7jx --scope tlqm --yes
```

Hoặc về bản trước V4:

```powershell
vc rollback dpl_3L6o1GfnKNRWuMJ75yNgSQzaRHU3 --scope tlqm --yes
```

Không có migration/schema cần rollback.

## 5. Hướng dẫn vận hành

Xem `docs/V3/HUONG_DAN_SO_LIEU_GIAO_BAN_2026-10-25.md`.
