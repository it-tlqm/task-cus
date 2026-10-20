# CHECKLIST DEPLOY NGẮN — YC-31/32 (20/10/2026)

> **Trạng thái: ĐÃ THỰC HIỆN — CODE DEPLOYED — TX CHƯA KÍCH HOẠT.**
> Backup/restore, DDL additive, deploy `eee6321`, smoke API 55/55 và UI 14/14 đã PASS.
> Các ô `[ ]` bên dưới là checklist gốc để đối chiếu; kết quả thực tế ở bảng ngay sau đây.

## KẾT QUẢ THỰC HIỆN (20/10/2026)

| Bước | Kết quả |
|---|---|
| Backup Production | `prod-full.dump`, 960.851 bytes, SHA-256 `30BB27BC...B2482` |
| Restore kiểm chứng | `talung_restore_yc31_32`; 61/61 bảng và hash bảng chính khớp |
| DDL lần 1 | `executed_statements=27`, `schema_changed=true`, `f7964d26aa6e → cd4cfb9eb26d`, `checks_failed=0` |
| DDL lần 2 | `schema_changed=false`, cùng fingerprint, 11 constraint bỏ qua, `checks_failed=0` |
| Deploy | `main` tại `eee6321` → deployment `task-ed2wh92xn-tlqm.vercel.app`; `/api/health` `db=up`, commit `eee6321` |
| Smoke API | `YC3132PROD-20261020061922`: **55/55 PASS**, `cleanupErrors=[]` |
| UI | Desktop + mobile: **14/14 PASS**, không console/page error |
| Storage | `work-evidence` private/4 MB/0 object/0 policy; `task-attachments` public/2 object/4 policy — **không sửa** |
| Dữ liệu nền | 24 người, 24 tài khoản, 26 đầu việc, 15 kết quả tháng, 18 nhiệm vụ, 48 mẫu, 3 YC-25, 3.386 sản phẩm, 8 đơn vị |
| Audit | 1.013 bản ghi; tăng do smoke/UI, không xóa |
| TX | 0 version/0 entry/0 mapping; **chưa kích hoạt nhóm nào** |

**Chưa thực hiện (có chủ đích):** import/kích hoạt TX; sửa `task-attachments`; tạo `org_units` cho 3 nhóm chưa khớp; mở quy trình gia hạn hạn sau duyệt.

## 0. Cổng bắt buộc trước khi bắt đầu

- [ ] Bucket `work-evidence` đã tạo, **private**, đúng giới hạn/MIME; không có policy public.
- [ ] Vercel đã có `SUPABASE_SERVICE_ROLE_KEY` (hoặc `SUPABASE_SECRET_KEY`), `SUPABASE_EVIDENCE_BUCKET=work-evidence`, `STORAGE_DRIVER=supabase`, `WORK_EVIDENCE_MAX_MB=4`.
- [ ] Không có khóa bí mật trong biến `NEXT_PUBLIC_*`, mã client, log, tài liệu hay chat.
- [ ] Nhánh `b56ed48` đã được review/chấp thuận; không có thay đổi ngoài YC-31/32.
- [ ] Hải quan đã chốt nhóm TX nào được import/kích hoạt; nhóm chưa xác nhận giữ inactive. **Không bắt buộc chốt đủ 6 nhóm mới deploy code nền tảng.**
- [ ] Phân biệt rõ: mapping chặn **import/kích hoạt danh mục**, không chặn deploy code; Storage chặn **tính năng minh chứng**.
- [ ] Có cửa sổ bảo trì, người chịu trách nhiệm, và phương án dừng/rollback.
- [ ] Nếu bất kỳ mục nào chưa đạt: **dừng, không chạm Production**.

## 1. Kiểm tra read-only trước khi đổi Production

- [ ] `git fetch origin main`; HEAD `b56ed48`, `origin/main` `b65f104`, ahead 10/behind 0.
- [ ] `git status` chỉ còn tệp local/demo cố ý không commit.
- [ ] `git diff --name-status origin/main...HEAD`: 31 tệp, chỉ YC-31/32; không Sidebar/YC-33…37.
- [ ] `/api/health` Production: `db=up`, `commit=b65f104`.
- [ ] `to_regclass('public._prisma_migrations')` = **NULL**.
- [ ] Chạy lại script DDL trên clone lần cuối: `checks_failed=0`, `schema_changed=false`, fingerprint không đổi.
- [ ] Kiểm tra chưa kích hoạt: cán bộ A/B thấy 0 TX, mẫu cũ vẫn chọn được, trạng thái `NOT_ACTIVATED`.
- [x] Ghi lại baseline trước smoke: 24 người, 24 tài khoản, 26 đầu việc, 15 kết quả tháng, 18 nhiệm vụ, 48 mẫu, 3 YC-25, 3.386 sản phẩm, 8 đơn vị, 954 audit. Sau smoke/UI là 1.013 audit (tăng dự kiến, không xóa).

## 2. Sau khi người dùng báo đã cấu hình Storage

### 2.1. Xác minh Storage (không in khóa)

- [ ] Gọi server-side `GET /storage/v1/bucket/work-evidence` bằng service key: phải trả `public=false`.
- [ ] Thử truy cập object không có quyền/không có Authorization: phải bị từ chối (không tải được tệp).
- [ ] Kiểm tra tên biến trên Vercel; chỉ xác nhận **có/không**, không đọc/in giá trị khóa.
- [ ] Upload một tệp PDF nhỏ vào đầu việc demo: 201, response **không có URL public**; DB `work_evidences.file_url = NULL`; object nằm trong `work-evidence`.
- [ ] Nếu bucket public/không tồn tại/thiếu key → API trả 503. **DỪNG**, không deploy.

### 2.2. Backup + checksum + restore

- [ ] Thông báo cửa sổ bảo trì; tạm dừng ghi dữ liệu nghiệp vụ nếu có thể.
- [ ] Backup Production bằng `pg_dump` custom format; tạo thêm bản schema-only và danh sách object Storage.
- [ ] Tính SHA-256 cho file backup; ghi kích thước, thời điểm, người thực hiện.
- [ ] Restore bản backup vào database tạm; chạy kiểm tra đếm baseline và mở được các bảng chính.
- [ ] Chỉ tiếp tục khi checksum khớp và restore tạm thành công. Nếu không: **DỪNG**.
- [ ] Không xóa bản backup cũ; không ghi đè Production bằng restore khi chưa có phê duyệt riêng.

### 2.3. Xác minh đúng project

- [ ] Supabase project: `ekswvjbpqblssxcdwagi` (chỉ in host/project ref, không in connection string).
- [ ] Vercel project/domain: `task-cus` / `task-cus.vercel.app`.
- [ ] `DATABASE_URL` và `DIRECT_URL` trỏ đúng project Production; service key đúng project.
- [ ] Xác nhận lại Production vẫn `commit=b65f104`, `db=up` ngay trước DDL.

### 2.4. DDL (chỉ sau phê duyệt)

- [ ] Ghi fingerprint schema trước và baseline counts.
- [ ] Chạy `npx tsx scripts/apply-yc31-32-ddl.ts` với biến môi trường Production.
- [ ] Kỳ vọng: `schema_changed=true`, `checks_failed=0`, fingerprint trước khác sau.
- [ ] Chạy lại cùng script: `schema_changed=false`, fingerprint **giữ nguyên**, `checks_failed=0`.
- [ ] Đọc lại schema: 4 bảng mới, 4 cột mới nullable, unique/index/FK/CHECK đúng; baseline không đổi ngoài phần additive.
- [ ] **Không chạy `prisma migrate deploy`.** Không áp drift cũ ngoài YC-31/32.
- [ ] Nếu lỗi: dừng, không tự DROP; đánh giá additive và khôi phục theo kế hoạch đã duyệt.

### 2.5. Merge/push và deploy code

- [ ] Trước khi push: xác nhận Vercel có auto-deploy từ `main` hay không.
- [ ] Nếu `main` auto-deploy: **chỉ merge/push sau khi DDL PASS**, để tránh code mới chạy trước schema.
- [ ] Nếu deploy thủ công: vẫn chỉ deploy đúng commit `b56ed48` sau DDL PASS.
- [ ] Sau deploy: `/api/health` trả đúng commit, `db=up`; log không lộ khóa/URL public.
- [ ] Nếu deploy lỗi: rollback code về `b65f104`; bảng/cột mới additive nên mã cũ vẫn chạy.

### 2.6. Smoke test

- [ ] Chạy `docs/SMOKE_TEST_YC31_YC32_2026-10-20.md` trên tài khoản DEMO.
- [ ] Bắt buộc PASS: upload/download; người ngoài phạm vi 403; thiếu quyền 401/403; tệp sai loại/quá dung lượng; xóa; object thiếu 404; audit.
- [ ] Bắt buộc PASS: hai bộ phận khác trạng thái kích hoạt; khóa hạn sau duyệt 403; ngày hoàn thành vẫn cập nhật; dữ liệu lịch sử giữ liên kết.
- [ ] Bắt buộc PASS: hồi quy YC-23→29, 48 mẫu cũ, YC-25, Excel.
- [ ] Có lỗi P0/P1 → **DỪNG**, không import TX, báo cáo ngay.

### 2.7. Kích hoạt/import danh mục TX (sau smoke test)

> **CHƯA THỰC HIỆN — có chủ đích.** Production hiện 0 version/0 entry/0 mapping; không import 143 dòng, không bật nhóm nào cho tới khi Hải quan xác nhận mapping.

- [ ] Chỉ import nhóm đã được Hải quan xác nhận; dry-run và đối chiếu 143 dòng nguồn.
- [ ] Bật mapping cho đúng `org_units` đã xác nhận; không tự tạo đơn vị.
- [ ] Kiểm tra bộ phận đã bật thấy đúng số TX, bộ phận chưa bật vẫn dùng mẫu cũ.
- [ ] Các nhóm CNTT/Điều tra CBL/Công tác Đảng và mọi nhóm chưa xác nhận: **giữ UNACTIVATED**.
- [ ] Ghi audit, số lượng entry, người thực hiện, thời điểm.

## 3. Điều kiện dừng ngay

- Bucket không private, thiếu key, hoặc API minh chứng trả 503 ngoài dự kiến.
- Backup/checksum/restore tạm thất bại.
- DDL báo `checks_failed > 0`, fingerprint thay đổi ngoài dự kiến, hoặc baseline bị ảnh hưởng.
- Deploy làm `/api/health` sai commit hoặc `db` không up.
- Bất kỳ test P0 nào fail, đặc biệt upload/download/403/404/413 hoặc dữ liệu lịch sử.
- Phát hiện URL public của minh chứng hoặc khóa bí mật bị lộ.

## 4. Rollback

- **Code:** deploy lại `b65f104`; schema mới additive/nullable nên mã cũ không bị chặn.
- **Dữ liệu:** không DROP bảng/cột ngay; tắt mapping và ngừng import là đủ để trở về trạng thái không phát TX.
- **Storage:** không xóa object minh chứng; giữ metadata để đối chiếu.
- **Sau rollback:** vẫn phải bảo vệ bucket private và báo cáo sự cố; không đưa minh chứng sang bucket public.

## 5. Bàn giao sau deploy

- [ ] Ghi commit deployed, thời điểm, người thực hiện, kết quả health.
- [ ] Ghi kết quả smoke test và các lỗi còn mở.
- [ ] Ghi nhóm TX đã import/kích hoạt và nhóm còn UNACTIVATED.
- [ ] Xác nhận `task-attachments` **không bị thay đổi** trong đợt này; chuyển kế hoạch riêng.
- [ ] Lưu backup/checksum ở vị trí được kiểm soát, không kèm khóa bí mật.
