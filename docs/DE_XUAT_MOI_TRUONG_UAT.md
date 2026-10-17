# ĐỀ XUẤT MÔI TRƯỜNG UAT RIÊNG (CHỈ ĐỀ XUẤT — CHƯA THIẾT LẬP)

**Ngày:** 17/10/2026 · **Trạng thái:** ĐỀ XUẤT, chờ duyệt. **Chưa tạo project, chưa migration, chưa seed, chưa đổi bất kỳ cấu hình nào.**

## 1. Vì sao cần môi trường UAT riêng

- Nghiệm thu hiện đang chạy trên **hệ thống thật** (`https://task-cus.vercel.app` + Supabase Production): mọi thao tác thử nhập liệu/đăng nhập đều ghi vào CSDL thật (audit, tài khoản, số liệu) — dù hiện **0 số liệu nghiệp vụ** nhưng vẫn rủi ro khi thử nghiệm sâu.
- Cần nơi thử **an toàn, reset được** cho: luồng nhập số liệu có xác nhận (Nháp → Gửi kiểm tra → Xác nhận), lưu/xóa phiên bản báo cáo giao ban, phân quyền theo vai trò, đăng nhập đa định dạng, tạo/xóa tài khoản demo.
- Là tiền đề nghiệm thu các hạng mục còn chờ: **YC-17, 19, 20, 22, 23, 24, 25** (bảng trạng thái YC) và các phần kiểm tra đăng nhập.

## 2. Phương án đề xuất (tối giản, chi phí 0)

- **Supabase UAT:** 1 project **MỚI**, tách hẳn project Production. (Gói Free: tối đa **2 project/tổ chức** — cần kiểm tra tổ chức hiện đang dùng 1 project → còn chỗ.)
- **Vercel:** dùng **Preview Deployment** với **bộ biến môi trường riêng cho môi trường Preview** (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` riêng). Preview chỉ trỏ CSDL UAT; Production giữ nguyên.
- **Chống nhầm Production (bắt buộc):**
  - Biến môi trường đặt **phạm vi Preview-only** (không đụng Production).
  - Mọi lệnh `prisma`/seed chạy UAT dùng **file env UAT riêng** (`.env.uat` — không commit) + **in host DATABASE_URL trước khi chạy** + kiểm tra trước khi seed.
  - Đối chiếu `/api/health` (đã hiển thị commit + trạng thái DB đang chạy) để xác nhận đúng môi trường.
- **Dữ liệu UAT:** **KHÔNG sao chép bất kỳ dữ liệu cá nhân / điểm đánh giá thật** từ `Dữ liệu.zip` hay Production. Chỉ nạp: cấu trúc (qua migration) + danh mục nghiệp vụ (5 nhóm, đầu việc mẫu, 49 chỉ tiêu **định nghĩa**, danh mục QĐ1277) + tài khoản demo mới + số liệu mẫu do người UAT tự nhập.
- **Reset:** cần script reset riêng chỉ chạy trên env UAT (xóa dữ liệu bảng nghiệp vụ + tài khoản demo, giữ danh mục) — không ảnh hưởng Production.

## 3. Các bước thiết lập (chỉ thực hiện KHI ĐƯỢC DUYỆT)

1. Kiểm tra hạn mức tổ chức Supabase (đang dùng 1 project → còn slot thứ 2 ở gói Free).
2. Tạo project UAT (region gần Việt Nam); lưu connection strings vào nơi quản lý bí mật — **không vào git**.
3. Trên Vercel: tạo bộ **env UAT scoped cho Preview** (DATABASE_URL, DIRECT_URL, JWT_SECRET mới). Giữ nguyên toàn bộ env Production.
4. Chạy `npx prisma migrate deploy` với env UAT; **xác nhận host đúng UAT trước khi chạy**.
5. Nạp dữ liệu nền cho UAT (danh mục, chỉ tiêu định nghĩa — **không số liệu chính thức**); tạo 3–5 tài khoản demo (mật khẩu mạnh, chỉ dùng UAT).
6. Deploy Preview; mở `/api/health` xác nhận DB UAT.
7. Chạy checklist UAT (mục 5) và ghi biên bản.
8. Sau đợt nghiệm thu: reset dữ liệu hoặc để project UAT "ngủ" (gói Free tự pause sau ~7 ngày không hoạt động; mở lại mất ~1 phút).

## 4. Chi phí & giới hạn

| Hạng mục | Chi phí | Lưu ý |
| :-- | :-- | :-- |
| Supabase project #2 (Free) | $0 | 500 MB CSDL; **pause sau ~7 ngày không hoạt động**; không có backup PITR |
| Vercel Preview (Hobby) | $0 | Preview build + deploy tự động từ nhánh |
| Nâng Supabase Pro (nếu đơn vị cần không pause / backup) | ~$25/tháng | chỉ khi yêu cầu |

➡️ Phương án mặc định **không phát sinh chi phí**.

## 5. Tiêu chí nghiệm thu MÔI TRƯỜNG (khi dựng xong)

- [ ] Preview mở được; `/api/health` hiển thị commit + DB **UAT** (khác Production).
- [ ] Đăng nhập được bằng tài khoản demo UAT; **tài khoản thật KHÔNG tồn tại** trên UAT.
- [ ] Thử luồng nhập số liệu: Nháp → Gửi kiểm tra → Xác nhận (một chỉ tiêu có bật kiểm soát); lưu phiên bản báo cáo — sửa nguồn sau đó **không đổi** snapshot.
- [ ] Nhập sai mật khẩu 10 lần → khóa 10 phút (chỉ trên UAT).
- [ ] **Production không thay đổi:** commit hiển thị trên `/api/health` Production giữ nguyên; không phát sinh bản ghi/audit mới từ UAT.
- [ ] Reset UAT về trạng thái ban đầu thành công.

## 6. Việc KHÔNG làm trong bước này

Không tạo project Supabase; không migration; không seed; không tạo/xóa biến môi trường; không đổi code. Tài liệu này **chỉ là đề xuất** để đơn vị quyết định.
