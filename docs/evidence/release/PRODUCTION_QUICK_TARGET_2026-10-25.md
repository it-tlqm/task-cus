# PRODUCTION — NHẬP NHANH 3 CHỈ TIÊU ĐỐI CHIẾU (25/10/2026)

**Trạng thái:** `DEPLOYED — TECHNICAL SMOKE PASS — UAT PENDING`

- **Production:** `https://task-cus.vercel.app`
- **Deployment:** `dpl_55tXdRgnpFdGKRbt4fmifD9Qrpf8`
- **Code:** `d02d990`
- **Health:** `status=ok`, `db=up`, `commit=d02d990`, `env=production`
- **Phương án:** code-only, không migration/schema.

---

## 1. Thay đổi

Trong khối **So sánh kết quả thu NSNN**, nút **Nhập chỉ tiêu BTC/UBND/KH** mở modal nổi:

- Nhập trực tiếp 3 chỉ tiêu:
  - Bộ Tài chính — năm
  - UBND tỉnh — năm
  - Kế hoạch tháng HQTL
- Hiển thị chỉ tiêu/trạng thái hiện có.
- Nguồn/căn cứ bắt buộc.
- Bấm **Lưu & xác nhận**: lưu cả 3 rồi xác nhận ngay.
- Chỉ tiêu đã chốt không sửa trong modal; có link **Mở cấu hình đầy đủ**.
- Sau khi lưu, trang tự tải lại để cập nhật tỷ lệ.

## 2. Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| Local API: tạo target BTC 2099 | PASS (`PROPOSED`) |
| Local API: xác nhận target | PASS (`CONFIRMED`) |
| `scripts/test-comparison-quick-target.ts` | 8/8 PASS |
| `scripts/test-comparison-config.ts` | 11/11 PASS |
| `scripts/test-dashboard-v4.ts` | 14/14 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `/api/health` Production | 200, db up |
| `/login` | 200 |
| `/giao-ban` | 307 unauth |

## 3. Chưa kiểm tra

- UAT bằng tài khoản thật trên Production.
- Nhập 3 số thật và xem tỷ lệ % cập nhật.
- Trường hợp chỉ tiêu đã chốt.

## 4. Rollback

```powershell
vc rollback dpl_616eHTsS76WdNqDqVt8imwsvWQyZ --scope tlqm --yes
```

Không có migration/schema cần rollback.
