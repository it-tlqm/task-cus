# YC-38 · UAT-D5.1 — BÁO CÁO TRIỂN KHAI PRODUCTION V1 + V2

**Ngày triển khai:** 21/10/2026 · **Giờ Việt Nam:** 20:55 (13:55 UTC) — hoàn tất lúc **20:55:04 VN**
**Người phê duyệt:** Chủ dự án · **Phạm vi:** YC-38 · UAT-D5.1 · **V1 + V2**

| Hạng mục | Kết quả |
|---|---|
| **Trạng thái cuối** | **SUCCESS** (GATE 5 đạt **một phần** — xem mục 6, giới hạn công cụ đã ghi nhận) |

---

## 1. BASELINE & COMMIT

| Hạng mục | Giá trị |
|---|---|
| Baseline Production trước deploy | `82f11e2` (`{"status":"ok","db":"up"}` — kiểm tra lại lúc 20:41 VN, **không** mặc định) |
| Commit mới | **`5ad6967`** — `fix(yc38-uat-d5.1): V1 khoa dau viec cua nhiem vu da nghiem thu + V2 chuan hoa ngay theo gio Viet Nam` |
| Branch | `main` (push `82f11e2..5ad6967`, **không** force-push) |
| Remote | `git@github.com-company:it-tlqm/task-cus.git` |
| Cơ chế deploy | Push vào `main` ⇒ Vercel tự build + deploy Production (xác nhận qua `health` ở mọi lần deploy trước) |
| Deployment | Vercel Production — URL `https://task-cus.vercel.app`; xác nhận bằng `GET /api/health` trả `commit=5ad6967` lúc **20:55:04 VN**; build **thành công** (commit đã có mặt trên Production, không còn lỗi build) |
| Nội dung commit | **4 file nguồn** + 1 file test + 1 tài liệu (6 file, +715/−21). **Không** có file ngoài phạm vi |

---

## 2. KẾT QUẢ TỪNG GATE

| Gate | Nội dung | Kết quả |
|---|---|---|
| **GATE 1** | branch/HEAD/working tree/diff; không file lạ/secret; baseline Production | ✅ **PASS** — `main` @ `82f11e2`; working tree chỉ có 4 file V1/V2 + 1 file test ngoài phạm vi (`scripts/test-yc39-p1-orgunit.ts` — **không** stage) + tài liệu; quét secret/PII trên 6 file sẽ commit: **sạch**; `git add` **chỉ theo tên file** (không `git add .`/`-A`); Production lúc 20:41 VN: `82f11e2`, `db=up` (**không** lệch baseline) |
| **GATE 2** | backup + restore-test độc lập | ✅ **PASS** — backup `demo-ops/yc38c-backup/yc38c-before-2026-10-21T13-42-42-214Z.json` (74 model · **7.563** bản ghi · 4.423,7 KB · 20:42:42 VN); **7** bản backup cũ **được giữ** (không xoá); restore-test vào `talung_yc38_restore` (DB scratch **độc lập**, script từ chối đích không phải localhost): **JSON hợp lệ** ✔ · **count nguồn khớp backup** ✔ · nạp lại **63/74** bảng có dữ liệu, **7.563** bản ghi ✔ · **0 tham chiếu mồ côi** ✔ · đọc lại được (`personal_work_items=32`, `work_catalog_entries=348`, `monthly_work_results=15`) ✔; **không** thay đổi tài khoản/mật khẩu/dữ liệu Production |
| **GATE 3** | typecheck + build + test + commit đúng phạm vi | ✅ **PASS** — `tsc --noEmit` ✔ · `next build` ✔ (Compiled 32,9s · 91/91 trang) · test: **24/24** (V1/V2) · 15/15 (F1–F5) · 36/36 (submit) · 15/15 (P1) · 56/56 (hồi quy HTTP) · 28/28 · 23/23 · 19/19 · 38/38 (parity) · 20/20 · 32/32 · 25/25 = **331/331, 0 fail**; đã stage **đúng 6 file**, `git diff --cached` đã xem, 1 commit riêng, không sửa lịch sử |
| **GATE 4** | push + deploy + xác nhận commit | ✅ **PASS** — push `82f11e2..5ad6967` lúc 20:51 VN; theo dõi build; Production chuyển sang `5ad6967` lúc **20:55:04 VN**; `GET /api/health` ⇒ `{"status":"ok","db":"up","commit":"5ad6967","env":"production"}` |
| **GATE 5** | smoke test chỉ đọc | ⚠️ **PASS một phần** — xem mục 6 |

---

## 3. NỘI DUNG ĐÃ TRIỂN KHAI (đúng phạm vi)

**V1 — Khóa đầu việc của nhiệm vụ đã kết thúc**
- `src/server/work-item-linkage.ts`: `assertWorkItemNotLinkedToClosedTask()` — đọc lại `personal_work_items.task_id` từ **server**, khoá dòng `tasks` bằng `SELECT … FOR UPDATE`, ném `AuthorizationError(409)`.
- `src/app/api/personal-work-items/route.ts`: `PATCH`/`DELETE` ghi trong `prisma.$transaction` (kiểm tra khoá **rồi mới** ghi); chặn **gỡ** liên kết / **thay** `taskId` / gửi `taskId`+`status` giả; chặn liên kết vào nhiệm vụ `COMPLETED/DONE/CANCELED`.
- **Không** mở rộng quyền công chức / lãnh đạo / quản trị CNTT; quyền xem & lịch sử giữ nguyên; đầu việc độc lập không bị khóa; **F1–F5 giữ nguyên**.

**V2 — Ngày theo `Asia/Ho_Chi_Minh`**
- `src/lib/datetime.ts`: `vnDateOnly()`.
- `src/app/my-work/MyWorkItemsSection.tsx`: `toDateInput()` dùng `vnDateOnly` (3 vị trí: ngày hoàn thành, hạn khi tạo nhiệm vụ từ đầu việc, nạp ô hạn xử lý).
- **Không** sửa ngày đã lưu trong DB; **không** đổi cách lưu dữ liệu ngày.

**Không** triển khai: V3, chính sách A/A1/B2/C1/D1-A/E1-A/F1-A, R3 (minh chứng), đồng bộ 2 lớp, công thức điểm/hệ số/kết quả tháng/Biểu 01A–02B, migration, schema, dữ liệu lịch sử.

---

## 4. BACKUP & RESTORE-TEST (bằng chứng, không lộ secret)

| Hạng mục | Giá trị |
|---|---|
| Đường dẫn lưu an toàn | `demo-ops/yc38c-backup/yc38c-before-2026-10-21T13-42-42-214Z.json` (ngoài Git — `.gitignore` dòng `demo-ops/`) |
| Thời điểm | 21/10/2026 **13:42:42 UTC = 20:42:42 VN** (trước deploy ~12 phút) |
| Kích thước / nội dung | 74 model · **7.563** bản ghi · 4.423,7 KB |
| Restore-test | `POSTGRES → talung_yc38_restore` (scratch độc lập) — **RESTORE-TEST PASS**: JSON hợp lệ · count nguồn khớp backup · 63/74 bảng có dữ liệu nạp lại đủ · **0 tham chiếu mồ côi** · đọc lại được (`personal_work_items=32`, `work_catalog_entries=348`, `monthly_work_results=15`) |
| Số liệu trong backup | `Task=23` · `PersonalWorkItem=32` · `MonthlyWorkResult=15` · `WorkItemAssignment=4` · `WorkItemProduct=1` · `WorkCatalogEntry=348` · `ProductItem=3.386` · `ActivityTemplate=48` · `EvaluationAssessment=3` · `ApprovalCase=3` · `AuditEvent=1.471` · `Person=38` · `OrgUnit=8` |
| Không lộ secret | ✔ (không in connection string / mật khẩu / token) |

---

## 5. SMOKE TEST PRODUCTION — CHỈ ĐỌC

| # | Kiểm tra | Kết quả |
|---|---|---|
| 1 | `GET /login` | **200** — trang đăng nhập tải bình thường |
| 1 | `GET /my-work`, `/tasks`, `/plans`, `/monthly-results`, `/reports`, `/products`, `/approvals` | **307 → `/login?redirect=…`** — điều hướng chính tải bình thường (middleware chưa đăng nhập) |
| 2 | Thành phần Nhật ký công việc | **Không kiểm chứng được ở mức giao diện** — cần phiên đăng nhập (mục 6) |
| 3 | `GET /api/tasks`, `/api/personal-work-items?year=2026&month=10`, `/api/products?pageSize=5`, `/api/work-catalog?scope=all` | **401** — API bảo vệ đúng (chưa đăng nhập); **không** có side effect (chỉ GET) |
| 4 | Đọc nhiệm vụ đã hoàn thành | Xem mục 6 — dự kiến qua UI của người kiểm thử |
| 5 | `NV-2026-0020` không bị thay đổi | Xem mục 6 |
| 6 | `/monthly-results` | 307 → `/login` (route OK); dữ liệu tháng **không bị tác động** (không có code ghi lúc deploy) |
| 7 | `/reports`, `/products` | 307 → `/login` (route OK) |
| 8 | Kiểm tra phân quyền đọc bằng tài khoản test | **Không thực hiện được** — mật khẩu 3 tài khoản demo trên Production đã thay đổi (file `demo-ops/demo-secrets.json` không còn khớp ⇒ 401). **Không** reset mật khẩu Production (cấm) ⇒ đề nghị người kiểm thử xác nhận bằng tài khoản UAT của họ |
| 9 | Health / DB | ✔ ổn định qua nhiều lần đo: `{"status":"ok","db":"up","commit":"5ad6967","latencyMs":21–31}` |
| 10 | Log deploy / log lỗi | Build Vercel thành công; **không** thực hiện request ghi để kiểm chứng 409 (theo yêu cầu) — bằng chứng 409 lấy từ test local |
| — | **Cấm** | Không POST/PATCH/PUT/DELETE nghiệp vụ · không đánh dấu/bỏ hoàn thành · không duyệt/trả lại · không upload/xoá minh chứng · không tạo đầu việc/nhiệm vụ · không reset mật khẩu · không tính lại điểm/chốt kỳ |

---

## 6. GIỚI HẠN CỦA GATE 5 (ghi nhận minh bạch)

**Không** đọc lại được DB Production **từ máy của tôi** sau khi deploy: kết nối trực tiếp tới
`aws-0-ap-northeast-1.pooler.supabase.com` (5432 và 6543) bị **từ chối ở tầng xác thực** trong khi
TCP vẫn thông — dấu hiệu giới hạn số kết nối theo IP sau nhiều phiên kiểm thử.
*(Lưu ý: chính phiên backup lúc 20:42 VN đã kết nối được; lỗi xuất hiện **sau** đó, không liên quan mã deploy.)*

**Bằng chứng thay thế cho phép đối chiếu trực tiếp:**
1. **Backup trước deploy (20:42:42 VN)** chứa toàn bộ trạng thái Production (7.563 bản ghi, 74 model).
2. **Runtime Production báo `db=up`** liên tục (Vercel → DB thông).
3. **Bản vá không chứa code ghi dữ liệu lúc khởi động**: 4 file thay đổi chỉ là *request handler* (`personal-work-items/route.ts`), *helper* (`work-item-linkage.ts`, `datetime.ts`) và *UI* (`MyWorkItemsSection.tsx`) ⇒ **không thể** thay đổi dữ liệu lúc deploy; không có migration/seeding.
4. **Mọi thao tác kiểm thử ghi** trong phiên này đều ở DB local/scratch; Production chỉ bị **đọc**.

**Đề nghị:** người kiểm thử xác nhận bằng giao diện (chỉ đọc) rằng `NV-2026-0020` vẫn ở trạng thái cũ
(`COMPLETED`, ngày hoàn thành 21/10/2026, nhiệm vụ `NOT_STARTED`, lịch sử 5 sự kiện). Tôi sẽ chạy lại đối chiếu
DB trực tiếp ngay khi đường kết nối từ máy này hoạt động trở lại.

---

## 7. XÁC NHẬN AN TOÀN

| Nội dung | Xác nhận |
|---|---|
| Migration / schema | ❌ **không có** — `git show --stat` không có thay đổi trong `prisma/migrations` |
| Sửa dữ liệu lịch sử | ❌ **không** — không có lệnh ghi nào lên Production |
| `NV-2026-0020` | ❌ **không** sửa (bằng chứng: mục 6) |
| Công thức điểm / hệ số QĐ1277 / kết quả tháng / Biểu 01A–02B | ❌ **không** sửa — parity 38/38, flow 20/20, eval 32/32, approval 25/25 sau thay đổi |
| F1–F5 (khóa nhiệm vụ đã nghiệm thu) | ❌ **không** sửa — locked-task 15/15 sau thay đổi |
| File ngoài phạm vi trong commit | ❌ **không** — commit `5ad6967` chỉ có 4 file nguồn V1/V2 + 1 test + 1 tài liệu |
| Force-push / sửa lịch sử commit | ❌ **không** — push thường `82f11e2..5ad6967` |
| Secret / PII trong commit | ❌ **không** — đã quét 6 file (mật khẩu, private key, DSN, JWT, email, SĐT) |
| Thao tác test ghi trên Production | ❌ **không** — chỉ GET/HEAD; mọi ghi ở DB local/scratch |

---

## 8. RỦI RO CÒN LẠI (ĐƯỢC CHẤP NHẬN TẠM THỜI — CHƯA HOÀN THÀNH)

| Mã | Rủi ro | Trạng thái |
|---|---|---|
| **R3** | Đường thêm/xoá **minh chứng** (`POST /api/work-evidence`, `DELETE /api/work-evidence/[id]`) **chưa** được V1 khóa ⇒ vẫn ghi/xoá được sau nghiệm thu (chỉ kiểm tra `checkWorkItemAccess` + `isPeriodLocked`, **không** kiểm tra trạng thái nhiệm vụ) | ⛔ **CHƯA** xử lý — đề xuất vá ~6 dòng bằng `assertWorkItemNotLinkedToClosedTask` (chờ duyệt) |
| **R4** | Trạng thái **đầu việc** và **nhiệm vụ** chưa tự đồng bộ (đánh dấu hoàn thành ở đầu việc không kích hoạt nghiệm thu của nhiệm vụ) | ⛔ **CHƯA** xử lý — chờ quyết định nghiệp vụ B1 |
| **R5** | Kết quả tháng chưa được phân tách hoàn toàn giữa *dự thảo/chờ xác nhận* và *điểm chính thức*; hệ số vẫn theo **nguồn người nhập khai** | ⛔ **CHƯA** xử lý — chờ chính sách |
| **Q-B4** | Cơ chế xác nhận & quy đổi hệ số (TX vs QĐ1277) còn đang `PENDING_RULE`; hệ thống **không** tự chọn hệ số | ⛔ **CHƯA** hoàn thiện |
| **C1** | V2 mới **chuẩn hóa ngày mặc định**; **chưa** có giao diện chọn ngày hoàn thành thực tế | ⛔ **CHƯA** xử lý |

> Các mục trên **không** được mô tả là đã hoàn thành.

---

## 9. HƯỚNG ROLLBACK

| Cấp | Cách | Ảnh hưởng |
|---|---|---|
| 1 | `git revert 5ad6967` + push | Trả về hành vi trước V1/V2. **Lưu ý:** trả về cả lỗ hổng V1 (đường vòng qua route đầu việc) |
| 2 | Bỏ **riêng** helper + 2 lời gọi trong `personal-work-items/route.ts` | Giữ V2 (giờ Việt Nam), bỏ V1 |
| 3 | Bỏ **riêng** `vnDateOnly` + `toDateInput` | Giữ V1, bỏ V2 (ngày hoàn thành trở lại theo múi giờ thiết bị) |
| — | **Không** có feature flag cho V1/V2 (cố ý): V1 là **khóa an toàn**, tắt cờ dễ mất tác dụng; V2 chỉ sửa cách tính ngày | Cờ sẽ được cân nhắc khi triển khai G0–G7 (RBAC) |

Không có migration ⇒ rollback **không** cần DDL, **không** cần khôi phục dữ liệu.

---

## 10. TRẠNG THÁI CUỐI

```
GATE_1_PRECHECK        = PASS
GATE_2_BACKUP_RESTORE  = PASS   (74 model / 7.563 ban ghi; restore-test 0 tham chieu moi coi)
GATE_3_TEST_COMMIT     = PASS   (typecheck + build OK; 331/331 test; commit 5ad6967 dung pham vi)
GATE_4_PUSH_DEPLOY     = PASS   (5ad6967 live luc 20:55:04 VN; health ok, db=up)
GATE_5_SMOKE_READONLY  = PARTIAL (read route OK 200/307/401; doc DB truc tiep tu may nay bi tu choi
                                  ket noi pooler — bang chung thay the: backup truoc deploy + db=up
                                  + ban va khong co code ghi du lieu luc deploy)
DEPLOYMENT            = SUCCESS  (V1 + V2 tai Production)
MIGRATION             = NONE
DATA_HISTORY_CHANGED   = NONE
NEXT_ACTIONS          = DUNG — cho UAT xac nhan lai; KHONG trien khai V3; KHONG xu ly R3;
                          KHONG chay them test ghi Production
```
