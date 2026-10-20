# KẾ HOẠCH KHẮC PHỤC BUCKET PUBLIC `task-attachments` (20/10/2026)

> **Trạng thái: KẾ HOẠCH RIÊNG — CHƯA THỰC HIỆN.**
> Không đổi bucket, policy, object hoặc URL trong đợt triển khai YC-31/32.
> Tài liệu này chỉ mô tả cách chuyển sang kho private an toàn, có kiểm thử và rollback.

## 1. Hiện trạng Production (read-only, 20/10/2026)

| Hạng mục | Giá trị |
|---|---|
| Bucket | `task-attachments` |
| Public | **`true`** |
| Giới hạn | 50 MB |
| MIME cho phép | PDF, JPEG, PNG, XLSX, DOCX, DOC, XLS |
| Số object | **2** |
| Policy đang có | 4 policy role `public`: SELECT, INSERT, UPDATE, DELETE |

Tên policy chính xác:

- `Allow public select on task-attachments`
- `Allow public insert on task-attachments`
- `Allow public update on task-attachments`
- `Allow public delete on task-attachments`

## 2. Vì sao rủi ro cao

1. **Bỏ qua kiểm tra quyền ứng dụng:** URL public dạng `/storage/v1/object/public/task-attachments/...` tải trực tiếp, không đi qua `authenticateRequest`/`verifyTaskAccess`.
2. **Publishable key nằm trong trình duyệt:** người có key có thể gọi trực tiếp Storage API.
3. **4 policy public cho cả ghi/ghi đè/xóa:** không chỉ đọc; có thể làm mất hoặc thay nội dung tệp.
4. **API trả `fileUrl`:** danh sách tệp hiện trả cả URL public; UI dùng URL đó để mở tệp.
5. **Audit chưa đầy đủ:** chưa có audit tải tệp; audit upload có thể chứa URL public.
6. **Không có kiểm tra magic bytes:** upload hiện tin `Content-Type`/đuôi tệp; bucket chỉ giới hạn MIME khai báo.
7. **URL đã phát tán:** URL cũ có thể nằm trong lịch sử trình duyệt, audit, tệp xuất hoặc tin nhắn; đổi bucket không thu hồi được các bản sao.

Rủi ro tổng hợp: **CAO** — cần xử lý thành đợt riêng, không trộn với YC-31/32.

## 3. Mục tiêu và nguyên tắc

**Mục tiêu:** tệp đính kèm nhiệm vụ chỉ đọc/ghi qua server đã xác thực; bucket không public; không trả URL public; có audit; giữ được 2 tệp lịch sử.

**Nguyên tắc:**

- Không dùng signed URL dài hạn; dùng route proxy server-side có kiểm tra quyền.
- Không fallback sang bucket public nếu bucket private lỗi; fail-closed.
- Không đổi bucket `task-attachments` cho đến khi code mới và bản sao private đã kiểm thử xong.
- Không xóa audit cũ; không xóa object nguồn cho đến hết thời gian lưu giữ.
- Không trộn thay đổi này vào deploy YC-31/32.

## 4. Thiết kế đề xuất

### 4.1. Kho private mới

- Bucket: `task-attachments-private` (tên cấu hình qua `TASK_ATTACHMENT_BUCKET`).
- `public=false`; không policy public.
- Server dùng `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`; không dùng publishable key.
- Giới hạn đề xuất: 25 MB và đúng danh sách MIME hiện có; nếu cần giảm sau khi đo thực tế.
- Bucket `task-attachments` cũ giữ nguyên trong giai đoạn chuyển tiếp.

### 4.2. Metadata

Thêm cột additive vào `task_attachments`:

```text
storage_bucket  TEXT NULL   -- 'task-attachments' (cũ) hoặc 'task-attachments-private' (mới)
```

- Dòng cũ backfill `task-attachments`.
- Dòng mới ghi `task-attachments-private`.
- `file_url` giữ để tương thích nhưng **không trả ra API/UI**; sau cutover đặt rỗng cho dòng đã chuyển.
- Không đổi `storage_key` hiện có; key mới giữ prefix `task-<code>/...`.

### 4.3. API

| Endpoint | Thay đổi |
|---|---|
| `GET /api/tasks/[id]/attachments` | Bắt buộc `verifyTaskAccess(..., "READ")`; không trả `fileUrl`/`storageKey`; trả metadata + đường dẫn tải nội bộ |
| `POST /api/tasks/[id]/attachments` | `verifyTaskAccess(..., "WRITE")`; upload vào bucket private; kiểm tra magic bytes/MIME/dung lượng; không lưu URL public |
| `GET /api/tasks/[id]/attachments/[attachmentId]/file` | **Mới**: xác thực, kiểm tra attachment thuộc task, `verifyTaskAccess READ`, tải server-side, trả file; audit `TASK_ATTACHMENT_DOWNLOAD`; 401/403/404 |
| `DELETE /api/tasks/[id]/attachments?attachmentId=...` | Gọi `verifyTaskAccess` trước khi xóa; xóa đúng bucket theo metadata; audit |

Route tải phải trả:

```text
Content-Type: <mime>
Content-Disposition: attachment; filename="<safe-name>"
Cache-Control: private, no-store, max-age=0
X-Content-Type-Options: nosniff
```

Không trả `storageKey`, đường dẫn bucket hoặc URL public. Không tạo signed URL thường trực.

### 4.4. UI

Thay mọi chỗ dùng `fileUrl` trực tiếp bằng nút tải gọi route trên, kèm Authorization theo helper đăng nhập hiện tại:

- `src/app/tasks/[id]/page.tsx`
- `src/app/my-work/page.tsx`
- `src/app/approvals/page.tsx`
- các màn hình upload/tải tệp liên quan trên dashboard/tasks

Nếu dùng thẻ `<a>`, chỉ dùng khi auth bằng cookie; nếu token nằm trong localStorage thì phải `fetch` có header rồi tạo blob URL tạm thời, không ghép URL công khai.

### 4.5. Audit

- Thêm `TASK_ATTACHMENT_DOWNLOAD` cho lượt tải thành công.
- Thêm `TASK_ATTACHMENT_ACCESS_DENIED` cho lượt bị từ chối (list/download/delete).
- Bỏ URL public khỏi `newData` của audit upload.
- Không xóa audit cũ; rà soát và quyết định riêng việc che URL lịch sử (không tự sửa).

## 5. Các giai đoạn thực hiện

### Giai đoạn 0 — Kiểm kê (read-only)

- [ ] Liệt kê 2 object: key, kích thước, MIME, thời điểm, hash SHA-256.
- [ ] Đối chiếu từng object với `task_attachments.storage_key`/`file_url`; phát hiện object mồ côi hoặc thiếu.
- [ ] Tìm URL public trong audit, dữ liệu xuất, giao diện và tài liệu.
- [ ] Chụp lại policy/bucket hiện tại để có phương án khôi phục.
- [ ] Xác nhận dung lượng/MIME thực tế trước khi đặt giới hạn mới.

**Cổng:** không có object mồ côi chưa rõ nguồn gốc; có danh sách đối chiếu đầy đủ.

### Giai đoạn 1 — Chuẩn bị code + bucket private

- [ ] Tạo bucket `task-attachments-private` (private, không policy public).
- [ ] Thêm cột `storage_bucket` nullable; backfill dòng cũ.
- [ ] Viết route tải mới + sửa API/UI/audit như mục 4.
- [ ] Chạy local: upload/download/403/404/401/413; so sánh hash.
- [ ] Chạy preview với bucket private; **chưa** đổi bucket public.

**Cổng:** preview PASS toàn bộ; không có URL public trong response.

### Giai đoạn 2 — Sao chép và đối chiếu

- [ ] Copy 2 object sang `task-attachments-private` (giữ nguyên key hoặc key mới có mapping).
- [ ] So sánh kích thước + SHA-256 từng object.
- [ ] Cập nhật `storage_bucket` và `file_url` trong một transaction; giữ object nguồn.
- [ ] Chạy lại danh sách/tải qua route mới cho cả 2 tệp.
- [ ] Kiểm tra audit, không có URL public.

**Cổng:** 2/2 tệp tải đúng; hash khớp; không mất metadata.

### Giai đoạn 3 — Cutover bucket public

Chỉ sau khi Giai đoạn 2 PASS, có backup và cửa sổ bảo trì:

```sql
-- CHỈ CHẠY TRONG ĐỢT RIÊNG, SAU BACKUP VÀ PHÊ DUYỆT.
-- KHÔNG CHẠY TRONG DEPLOY YC-31/32.
update storage.buckets
set public = false
where id = 'task-attachments';

drop policy "Allow public select on task-attachments" on storage.objects;
drop policy "Allow public insert on task-attachments" on storage.objects;
drop policy "Allow public update on task-attachments" on storage.objects;
drop policy "Allow public delete on task-attachments" on storage.objects;
```

Sau đó kiểm tra:

- [ ] `select id, public from storage.buckets where id in ('task-attachments','task-attachments-private');` → cả hai `false`.
- [ ] `select policyname ... where schemaname='storage' and tablename='objects';` → không còn 4 policy public.
- [ ] URL public cũ trả lỗi/không tải được.
- [ ] Route server với tài khoản hợp lệ vẫn tải được cả 2 tệp.
- [ ] Người ngoài phạm vi nhận 403; chưa đăng nhập nhận 401.

**Cổng:** cutover chỉ một chiều. Sau bước này **không bật lại public** để rollback; nếu lỗi phải fix-forward hoặc khôi phục theo kế hoạch sự cố đã duyệt.

### Giai đoạn 4 — Dọn dẹp có kiểm soát

- [ ] Giữ object nguồn trong thời gian lưu giữ đã thống nhất.
- [ ] Sau thời gian đó, xóa object nguồn bằng script có đối chiếu hash, không xóa hàng loạt.
- [ ] Giữ cột `file_url` nhưng để rỗng/không dùng; chỉ drop khi có phê duyệt riêng.
- [ ] Cập nhật tài liệu vận hành và audit.

## 6. Kiểm thử bắt buộc

| ID | Bài test | Kỳ vọng |
|---|---|---|
| TA-01 | Chưa đăng nhập gọi route tải | 401 |
| TA-02 | Cán bộ ngoài phạm vi tải tệp | 403 + audit denied |
| TA-03 | Chủ nhiệm vụ/người upload tải | 200; hash khớp; `Content-Disposition: attachment` |
| TA-04 | Lãnh đạo trong phạm vi tải | 200 |
| TA-05 | Lãnh đạo ngoài phạm vi tải | 403 |
| TA-06 | Upload tệp hợp lệ | 201; không có URL public; object nằm trong bucket private |
| TA-07 | Upload `.exe`/file giả PDF | 400; không ghi metadata/object |
| TA-08 | Upload quá 25 MB | 413; không ghi metadata/object |
| TA-09 | Tải object đã bị xóa | 404; không lộ storage key |
| TA-10 | Xóa bởi người không có quyền | 403; object còn |
| TA-11 | Xóa hợp lệ | 200; object mất; tải lại 404 |
| TA-12 | Danh sách tệp | Không có `fileUrl`/URL public/storage key |
| TA-13 | URL public cũ sau cutover | Không tải được |
| TA-14 | 2 tệp lịch sử | Tải đúng sau migration; hash khớp |
| TA-15 | Audit | Có download/denied/delete; không có URL public |
| TA-16 | Hồi quy task/approval/my-work | Tải tệp vẫn hoạt động; không lỗi UI |

## 7. Rollback

**Trước cutover (bucket còn public):**

- Revert code về bản cũ; URL public vẫn hoạt động.
- Giữ bucket private mới và bản sao; không xóa dữ liệu.

**Sau cutover (bucket đã private):**

- Không bật lại public.
- Rollback code chỉ được trỏ về route private mới; nếu route lỗi, fix-forward.
- Khôi phục bucket metadata/policy chỉ theo kế hoạch sự cố được phê duyệt, không tự phát.
- Giữ backup/object nguồn đến khi xác nhận ổn định.

## 8. Ngoài phạm vi

- Không thay đổi bucket/policy trong đợt YC-31/32.
- Không dùng bucket `work-evidence` cho tệp nhiệm vụ.
- Không dùng permanent signed URL.
- Không xóa audit lịch sử.
- Không tự động chuyển toàn bộ dữ liệu nếu chưa đối chiếu 2 object.
- Không sửa Sidebar/YC-33…37.

## 9. Điều kiện bắt đầu

1. YC-31/32 đã deploy ổn định (hoặc tách hoàn toàn khỏi cửa sổ deploy).
2. Có backup + checksum + restore plan cho DB và Storage.
3. Có phê duyệt riêng cho thay đổi bucket/policy.
4. Đã chụp lại 4 policy public và thông số bucket.
5. Đã chuẩn bị preview environment để test trước cutover.

## 10. Kết luận

`task-attachments` đang public và có thể bị đọc/ghi/xóa ngoài ứng dụng. Đây là lỗ hổng cần xử lý, nhưng **không được sửa nóng** trong đợt YC-31/32 vì còn 2 tệp/URL lịch sử. Kế hoạch an toàn là: sao chép sang bucket private → chuyển code sang route có kiểm quyền → kiểm thử → cutover một chiều → chỉ sau đó mới bỏ policy public.
