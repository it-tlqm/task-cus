# SMOKE TEST SAU CẤU HÌNH STORAGE — YC-31/32 (20/10/2026)

Mục đích: kiểm tra thực tế sau khi bucket private `work-evidence` và biến môi trường server-side đã được cấu hình.
Chỉ dùng **tài khoản DEMO** và dữ liệu test có tiền tố `[SMOKE]`; không dùng dữ liệu nghiệp vụ thật.

## 0. Chuẩn bị

- [ ] Có 2 cán bộ DEMO thuộc hai bộ phận khác trạng thái kích hoạt: **A** và **B**.
- [ ] Có lãnh đạo DEMO trong phạm vi A và một lãnh đạo ngoài phạm vi.
- [ ] Có quyền quản trị mapping TX.
- [ ] Có sẵn: một đầu việc A chưa duyệt, một đầu việc A thuộc kế hoạch **đã duyệt**, một kỳ đã chốt, một đầu việc lịch sử đã gắn TX.
- [ ] Đã ghi baseline Production (người, tài khoản, đầu việc, kết quả tháng, nhiệm vụ, mẫu, YC-25, sản phẩm, đơn vị, audit).
- [ ] Có file PDF hợp lệ nhỏ; file PDF giả (nội dung không phải PDF); file `.exe`; file PDF 5 MB để test giới hạn 4 MB.

Quy ước: **P0 = bắt buộc dừng nếu fail**; P1 = phải báo cáo nhưng có thể đánh giá tiếp.

## 1. Hạ tầng và phạm vi

| ID | Ưu tiên | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| S-01 | P0 | `GET /api/health` | 200; `db=up`; `commit` đúng bản deploy; không lộ khóa |
| S-02 | P0 | Kiểm tra bucket `work-evidence` bằng server-side | `public=false`; không có policy public; object test tải được qua route |
| S-03 | P0 | Truy cập thẳng object minh chứng khi không đăng nhập/không có key | Bị từ chối; **không** tải được tệp; không có URL public trong response |
| S-04 | P0 | Kiểm tra biến Vercel (chỉ xác nhận tên/có mặt) | Có service key server-side, bucket, driver, max MB; không có khóa trong `NEXT_PUBLIC_*` |

## 2. Chưa kích hoạt nhóm TX

| ID | Ưu tiên | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| S-10 | P0 | A gọi `GET /api/work-catalog` | 200; `entries=[]`; `legacyTemplatesSelectable=true`; `activation.status=NOT_ACTIVATED` |
| S-11 | P0 | B gọi `GET /api/work-catalog` | Như A; không thấy TX của bộ phận khác |
| S-12 | P0 | Quản trị gọi `GET /api/work-catalog/mappings` | Đủ 6 nhóm nguồn; **0 nhóm active** trước khi import/kích hoạt |
| S-13 | P0 | Tạo đầu việc mới bằng mẫu cũ | 201; không bị chặn bởi danh mục TX |

## 3. Kích hoạt một bộ phận (chỉ nhóm đã xác nhận)

| ID | Ưu tiên | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| S-20 | P0 | PATCH mapping nhóm đã xác nhận cho đúng `org_units` của A | 200; `isActive=true`, `unitId` đúng; có audit |
| S-21 | P0 | A gọi lại catalog | Nếu nhóm đã import: thấy đúng số entry ACTIVE; mẫu cũ bị ẩn. Nếu chưa import: 0 TX, mẫu cũ vẫn chọn được (không coi là lỗi) |
| S-22 | P0 | B gọi catalog | Không thấy TX của A; mẫu cũ vẫn chọn được |
| S-23 | P0 | A tạo đầu việc TX; B thử dùng entry của A | A: 201; B: 403 |
| S-24 | P0 | Thử bật mapping thiếu `unitId`, hoặc nhóm không có trong phiên bản | 400; không tạo mapping active |
| S-25 | P0 | Cán bộ thường PATCH mapping | 403 |

## 4. Hạn xử lý sau duyệt

| ID | Ưu tiên | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| S-30 | P0 | Tạo đầu việc A có `dueDate`, đưa kế hoạch sang trạng thái đã duyệt | Đầu việc hiển thị hạn; UI có nhãn “Hạn đã khóa” |
| S-31 | P0 | PATCH `dueDate` của đầu việc đã duyệt | **403**; hạn gốc không đổi; audit `PERSONAL_WORK_ITEM_DUE_DATE_DENIED` |
| S-32 | P0 | PATCH `completedDate` của cùng đầu việc | 200; trạng thái chuyển COMPLETED; hạn gốc vẫn giữ |
| S-33 | P0 | PATCH nội dung/tiêu đề đầu việc đã duyệt | 403; không ghi đè dữ liệu kế hoạch |
| S-34 | P1 | PATCH `dueDate` của đầu việc chưa duyệt | 200 (nếu có quyền); không ảnh hưởng đầu việc đã duyệt |

## 5. Minh chứng — upload/list

| ID | Ưu tiên | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| S-40 | P0 | A upload PDF hợp lệ vào đầu việc A | 201; response **không** có `fileUrl`/URL public; metadata đúng tên/dung lượng/MIME |
| S-41 | P0 | Kiểm tra DB `work_evidences` | `file_url = NULL`; `storage_key` nằm dưới `evidence/<workItemId>/`; có checksum |
| S-42 | P0 | A gọi `GET /api/work-evidence?workItemId=...` | 200; danh sách chỉ metadata; không có URL public; `canUpload` đúng |
| S-43 | P0 | B gọi list của đầu việc A | 403; audit `EVIDENCE_ACCESS_DENIED` |
| S-44 | P0 | Lãnh đạo trong phạm vi A gọi list | 200 |
| S-45 | P0 | Lãnh đạo ngoài phạm vi gọi list | 403 |
| S-46 | P0 | B upload tệp vào đầu việc của A | 403; audit `EVIDENCE_ACCESS_DENIED` operation `UPLOAD`; không ghi metadata/object |

## 6. Minh chứng — download

| ID | Ưu tiên | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| S-50 | P0 | A tải `GET /api/work-evidence/{id}/file` | 200; đúng nội dung; `Content-Disposition: attachment`; `Cache-Control: private, no-store`; không lộ storage key |
| S-51 | P0 | So sánh SHA-256 file tải với file gốc | Khớp |
| S-52 | P0 | B tải file của A | 403; audit `EVIDENCE_ACCESS_DENIED` operation `DOWNLOAD` |
| S-53 | P0 | Người chưa đăng nhập gọi file | 401 |
| S-54 | P0 | Lãnh đạo trong phạm vi tải | 200; audit `EVIDENCE_DOWNLOAD` |
| S-55 | P0 | Xóa object khỏi kho (test) rồi tải lại | 404; không trả stack trace/đường dẫn kho |

## 7. Minh chứng — loại tệp, dung lượng, dữ liệu sai

| ID | Ưu tiên | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| S-60 | P0 | Upload `.exe` | 400; không ghi metadata/object |
| S-61 | P0 | Upload file đuôi `.pdf` nhưng nội dung không phải PDF | 400; kiểm tra magic bytes |
| S-62 | P0 | Upload PDF 5 MB khi giới hạn 4 MB | 413; không ghi metadata/object |
| S-63 | P0 | Upload thiếu `file` | 400 |
| S-64 | P0 | Upload thiếu `workItemId` | 400 |
| S-65 | P0 | Upload vào kỳ đã chốt | 423; không ghi metadata/object |
| S-66 | P0 | Gửi `Content-Length` vượt ngưỡng | 413 trước khi parse multipart; server không treo |

## 8. Minh chứng — xóa

| ID | Ưu tiên | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| S-70 | P0 | A xóa minh chứng của A | 200; list không còn; tải lại 404; object đã xóa |
| S-71 | P0 | B xóa minh chứng của A | 403; object còn nguyên |
| S-72 | P0 | Xóa minh chứng trong kỳ đã chốt | 423 |
| S-73 | P0 | Xóa minh chứng không tồn tại | 404 |
| S-74 | P0 | Kiểm tra audit sau upload/download/delete/deny | Có đủ `EVIDENCE_UPLOAD`, `EVIDENCE_DOWNLOAD`, `EVIDENCE_DELETE`, `EVIDENCE_ACCESS_DENIED`; không có URL public |

## 9. Phân quyền và dữ liệu lịch sử

| ID | Ưu tiên | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| S-80 | P0 | Tắt mapping của A sau khi đã có đầu việc TX | Đầu việc cũ vẫn giữ liên kết TX; đọc/sửa hợp lệ không bị mất nguồn |
| S-81 | P0 | A tạo đầu việc TX mới sau khi tắt mapping | Bị chặn 403 |
| S-82 | P0 | A chọn mẫu cũ sau khi tắt mapping | Được phép; 48 mẫu cũ vẫn đọc đủ |
| S-83 | P0 | B (chưa từng kích hoạt) dùng mẫu cũ/YC-25 | 201; không bị ảnh hưởng bởi A |
| S-84 | P1 | Kiểm tra đầu việc lịch sử có `catalog_entry_id` sau khi đổi phiên bản | Liên kết cũ không bị tự đổi/xóa |

## 10. Hồi quy và dữ liệu nền

| ID | Ưu tiên | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| S-90 | P0 | Hồi quy YC-23→29 (kế hoạch, YC-25, kết quả tháng, nhiệm vụ, mẫu cũ, sản phẩm, KPI, thông báo, báo cáo) | 18/18 PASS như local |
| S-91 | P0 | Xuất Excel Bảng 1, 01A, kết quả tháng | 200; file mở được; không lỗi font/cột |
| S-92 | P0 | Đếm baseline sau deploy | Không đổi ngoài phần additive; không mất dữ liệu cũ |
| S-93 | P1 | Kiểm tra `task-attachments` cũ vẫn hiển thị trong ứng dụng | Không thay đổi policy/bucket trong đợt này; ghi nhận rủi ro public riêng |
| S-94 | P1 | Kiểm tra log Vercel | Không có khóa bí mật, connection string, storage key hay URL public của minh chứng |

## 11. Tiêu chí đạt

- Tất cả **P0 PASS**, không có lỗi 500 không kiểm soát.
- Không có URL public nào của minh chứng trong API/UI/audit/log.
- Người ngoài phạm vi luôn nhận 401/403; object không tồn tại nhận 404; quá dung lượng nhận 413.
- Dữ liệu lịch sử, 48 mẫu cũ, YC-25 và kết quả tháng không bị thay đổi ngoài dự kiến.
- Nếu bất kỳ P0 fail: dừng, không import/kích hoạt TX, báo cáo kèm mã lỗi và thời điểm.

## 12. Dọn dữ liệu test

- Xóa đầu việc/minh chứng `[SMOKE]` bằng API hợp lệ; kiểm tra object đã xóa khỏi `work-evidence`.
- Không xóa audit; audit test được giữ để truy vết.
- Đưa mapping về trạng thái đã được duyệt; không để nhóm chưa xác nhận ở trạng thái active.
- Ghi lại số lượng trước/sau dọn để chứng minh không ảnh hưởng dữ liệu thật.
