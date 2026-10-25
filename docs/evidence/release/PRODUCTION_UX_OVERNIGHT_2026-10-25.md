# PRODUCTION — BATCH UX ĐÊM 25/10/2026

**Trạng thái:** `DEPLOYED — TECHNICAL SMOKE PASS — UAT PENDING`

- **Production:** `https://task-cus.vercel.app`
- **Code hiện tại:** `057e9fd`
- **Health:** `db=up`, `commit=057e9fd`, `env=production`
- **Dashboard V4:** vẫn chỉ là bản xem trước; `/dashboard` cũ mặc định.

---

## 1. Đợt 1 — `6cb35be`

Deployment: `dpl_3BQSHuARnKvMWnrERaE16cAsVB1p`

### Nhập số thực tế ngay từ So sánh
- Dòng “So với tháng trước” / “So với cùng kỳ năm trước” có nút **Nhập số thực tế** khi thiếu dữ liệu.
- Link mở `/giao-ban/nhap` với:
  - `date` = cùng ngày cutoff của kỳ trước/cùng kỳ;
  - `metric=THU_NSNN`.
- Trang nhập đọc `date`/`metric`, cuộn tới và làm nổi bật đúng chỉ tiêu.
- Ngày tháng trước/cùng kỳ được clamp đúng (31/03 → 28/02, 29/02 → 28/02).

### Làm gọn đầu trang Kế hoạch
- Tách tiêu đề và hàng thao tác; không còn ép tiêu đề vào 7 nút.
- Metadata đơn vị dạng chip.
- Nhãn lọc ngắn hơn: **Phụ trách**, **Ưu tiên**; thêm **Xóa lọc**.
- Bỏ hiển thị “0 cán bộ” khó hiểu.
- Empty state đúng ngữ cảnh:
  - chưa có đầu việc;
  - bộ lọc không khớp;
  - chế độ “Việc của tôi”.
- Thu gọn “Quy tắc nghiệp vụ Cột C” trong `<details>`.
- Rút gọn tiêu đề cột C thành **Đầu việc / Danh mục**.

## 2. Đợt 2 — `66cb285`

Deployment: `dpl_8wNZro3caUPnDc6iQShFZbbFW2mS`

### Command Palette
- Mở bằng **Ctrl + K** hoặc nút tìm nhanh trên Header/mobile.
- Tìm trang, hành động, nhiệm vụ.
- Điều hướng nhanh: Dashboard, Nhiệm vụ, Nhật ký, Kế hoạch, Duyệt hồ sơ, Tác nghiệp, Giao ban, Báo cáo, Lịch trực, Thông báo.
- Hành động: Giao nhiệm vụ, Nhập số liệu, Cấu hình số liệu, Quản trị.
- Phím ↑ ↓, Enter, Esc.
- Khi gõ từ khóa, trang/hành động khớp trực tiếp được ưu tiên; tìm nhiệm vụ là lựa chọn cuối.

## 3. Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `test-comparison-actual-entry.ts` | 9/9 PASS |
| `test-plans-header-layout.ts` | 8/8 PASS |
| `test-command-palette.ts` | 9/9 PASS |
| Command Palette E2E (Ctrl+K → “kế hoạch” → Enter) | PASS (`/plans`) |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `/api/health` Production | 200, db up |
| `/login` | 200 |
| `/dashboard`, `/plans`, `/giao-ban` | 307 unauth |

## 4. Chưa làm / còn tồn

- Trung tâm “Việc cần xử lý” hợp nhất trên Dashboard.
- Sao chép lịch trực / kế hoạch tuần trước.
- Bulk xử lý Góp ý.
- Duyệt tuần tự “hồ sơ tiếp theo”.
- Nhập actual lịch sử tháng 9/2026 và tháng 10/2025 — cần dữ liệu thật.
- YC-11 vẫn chặn bởi `person_supervisions=0`.
- UAT tài khoản thật trên Production.

## 5. Rollback

Về trước batch đêm:

```powershell
vc rollback dpl_5vAFy7twhW15n5uSjBxKPcQW7obF --scope tlqm --yes
```

Hoặc chỉ rollback Command Palette:

```powershell
vc rollback dpl_3BQSHuARnKvMWnrERaE16cAsVB1p --scope tlqm --yes
```

Không có migration/schema trong batch này.

---

## 6. Bổ sung — xử lý Góp ý hàng loạt (`057e9fd`)

- **Deployment:** `dpl_6Hxj9gLzxdcHXbXdTsispmL5RYDG`
- **Code:** `057e9fd`
- **Health:** `commit=057e9fd`, `db=up`, `env=production`

Trang `/admin/feedback`:
- Chọn từng góp ý mới hoặc **Chọn trang**.
- Nhập **ghi chú chung**.
- Bấm **Đánh dấu đã xử lý** để xử lý nhiều góp ý một lần.
- Có **Bỏ chọn**.
- Chỉ hiện checkbox cho góp ý trạng thái `NEW`.

| Kiểm tra | Kết quả |
|---|---|
| `scripts/test-feedback-bulk.ts` | 7/7 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `/api/health` Production | 200, db up |
| `/admin/feedback` | 307 unauth |

Rollback riêng batch này:

```powershell
vc rollback dpl_8wNZro3caUPnDc6iQShFZbbFW2mS --scope tlqm --yes
```