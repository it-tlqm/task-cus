# RÀ SOÁT SAU PHÁT HÀNH V3 TRÊN PRODUCTION — 22/10/2026

**Production:** https://task-cus.vercel.app · **Phạm vi:** 6 mục rà soát (SHA/Vercel · rollback · API xác nhận khi `person_supervisions = 0` · quyền 24 tài khoản · quyền đọc Storage · checklist UAT).
**Nguyên tắc:** chỉ kiểm tra + sửa lỗi an toàn cần thiết theo quy trình deploy có backup. **KHÔNG** reset dữ liệu Production · **KHÔNG** tạo tài khoản · **KHÔNG** gán tuyến duyệt.

---

## 1. SHA & TRẠNG THÁI VERCEL PRODUCTION

| Hạng mục | Kết quả | Nguồn kiểm chứng |
|---|---|---|
| SHA đang chạy trên Production | `6b0fa94552cffcea862bdc578b33f5ca628d1a04` | `GET /api/health` → `{"status":"ok","db":"up","commit":"6b0fa94","env":"production"}` |
| `main` local = `origin/main` | cùng SHA `6b0fa94` ✔ | `git rev-parse main origin/main` |
| Số commit V3 trên `main` so với bản cũ `d524576` | **13 commit** (`git rev-list --count d524576..6b0fa94`) | git |
| Trạng thái deployment Vercel | **Không xác minh được trực tiếp** — máy không có `VERCEL_TOKEN`/`VERCEL_ORG_ID` (chỉ có `vercel` CLI chưa đăng nhập) | `vercel` CLI + biến môi trường |
| Điểm xác nhận gián tiếp | health trả `env=production`, `db=up`, `latency=29ms`; `/login` render; 10/10 API có xác thực trả 200; UI dùng đúng bundle V3 | smoke test |

> **Cần xác nhận của chủ dự án:** mở Vercel Dashboard → Project `talung-cus-work` → tab **Deployments** để đối chiếu deployment **Production** đang **Ready** và SHA `6b0fa94` (nếu ô Deployments không hiện SHA thì dùng URL deployment + nút ⋯ → *Inspect*).

---

## 2. TÀI LIỆU ROLLBACK — đã sửa về đúng `d524576`

**Vấn đề:** tài liệu cũ ghi `git revert 6b0fa94`. `6b0fa94` chỉ là commit PREPARE (script + tài liệu) ⇒ revert nó **không** gỡ mã V3 (13 commit vẫn nằm trên Production) ⇒ **rollback không đạt mục tiêu**.

**Đã sửa** (`docs/V3/DEPLOY_PRODUCTION_V3_2026-10-22.md` §6 + `docs/V3/GO_NO_GO_BAN_GIAO_2026-10-22.md` §8):

| Phương án | Cách làm | Rủi ro | Trạng thái |
|---|---|---|---|
| **A (khuyến nghị)** | `git revert --no-commit d524576..6b0fa94` → commit → `git push origin main` | Không ghi đè lịch sử | **Đã kiểm chứng**: exit 0, không xung đột, 62 file đổi, `git diff d524576` **rỗng** ⇒ cây mã sau revert **giống hệt `d524576`** |
| **B** | `git reset --hard d524576 && git push --force-with-lease origin main` | Ghi đè lịch sử `main` (đã có nhánh backup + `feature/v3-demo`) | Có rủi ro; chỉ dùng khi cần SHA `main` đúng bằng `d524576` |
| **C** | Deploy thẳng từ SHA `d524576` (Vercel Dashboard / `vercel --prod`) | Không đụng `main` | Cần `VERCEL_TOKEN` |
| **Schema/dữ liệu** | `pg-backup-restore.mjs restore --file=prod-predeploy-2026-10-22-123725.json` | Ghi đè dữ liệu phát sinh sau backup | **Không cần** khi rollback mã (migration V3 additive ⇒ mã cũ chạy được với schema V3) |

---

## 3. API XÁC NHẬN CÔNG VIỆC & SP KHI `person_supervisions = 0` — 🔴 LỖ HỔNG ĐÃ SỬA

### 3.1. Nguyên nhân gốc

`src/server/work-item-review.ts` → `canReviewAsDirectLeader()` **lùi về phạm vi đơn vị** khi cán bộ chưa có quan hệ phụ trách:

```ts
const leaderIds = await resolveDirectLeaderIds(subordinatePersonId);
if (leaderIds.length > 0) return leaderIds.includes(user.personId);
// ❌ lùi về phạm vi đơn vị:
if (authorized === "ALL") return user.role === "UNIT_LEADER";      // mọi UNIT_LEADER phạm vi ORGANIZATION
if (user.role !== "DEPARTMENT_LEADER") return false;               // mọi Trưởng bộ phận cùng đơn vị
return assignments.some((a) => authorized.includes(a.unitId));
```

**Production có `person_supervisions = 0` (đã kiểm chứng: `SELECT count(*) FROM person_supervisions` → 0)** ⇒ **100% hồ sơ rơi vào fallback**.

**Hệ quả (rủi ro 🔴 cao):** 3 tài khoản `UNIT_LEADER/ORGANIZATION` (`cb016`, `dantn`, `demold01`) và 3 `DEPARTMENT_LEADER` có thể **xác nhận / trả lại hồ sơ của BẤT KỲ cán bộ nào** trong cơ quan, không cần quan hệ phụ trách — trái nghiệp vụ đã chốt *"tuyến chưa có người duyệt hợp lệ phải chờ phân tuyến"*.

Phạm vi ảnh hưởng (đã xác minh bằng grep, tất cả đều đi qua cùng một cổng kiểm tra):

| API | Vai trò |
|---|---|
| `POST /api/personal-work-items/{id}/review` (RETURN/CONFIRM) | dùng `canReviewAsDirectLeader` |
| `PATCH /api/work-item-products/{id}` (xác nhận/từ chối từng SP QĐ1277) | dùng `canReviewAsDirectLeader` |
| `POST /api/work-item-products` (đề xuất/thêm SP) | dùng `canReviewAsDirectLeader` |
| `GET /api/personal-work-items/review-queue` (danh sách hồ sơ chờ duyệt) | dùng `canReviewAsDirectLeader` |
| `GET/POST/PATCH /api/evidence-adjustments` (R3-C 2 cấp) | dùng `canReviewAsDirectLeader` |

### 3.2. Bản vá đã áp (mã, không đụng dữ liệu)

* `canReviewAsDirectLeader()`: **xoá hoàn toàn fallback phạm vi đơn vị** ⇒ quyền duyệt **chỉ** đến từ `person_supervisions` đang hiệu lực; `SYSTEM_ADMIN` vẫn không có quyền nghiệp vụ.
* Thêm `reviewDeniedMessage()`: trả lời rõ ràng — *"Cán bộ này chưa có tuyến phê duyệt hợp lệ — hồ sơ đang chờ phân tuyến"* (khác với *"Bạn không phải lãnh đạo trực tiếp…"*) để giao diện hiển thị đúng nguyên nhân.
* Áp cho cả 2 đường duyệt công việc và duyệt từng SP QĐ1277.
* `src/server/auth.ts`: vai trò chính ở **mỗi lần gọi API** nay dùng đúng bộ chọn *"phạm vi rộng nhất"* như lúc đăng nhập (`pickPrimaryGrant`) — trước đó API lấy `roleGrants[0]` (thứ tự CSDL tùy ý) ⇒ có thể lệch vai trò giữa giao diện và kiểm tra quyền khi một tài khoản có nhiều grant đang hiệu lực.

### 3.3. Kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| `tsc --noEmit` | ✅ exit 0 |
| `npm run build` | ✅ exit 0 (`Compiled successfully`) |
| 15 bộ regression (DB fixture) | ✅ **452 pass / 0 fail** (fixture có đúng 2 quan hệ `DEMO-LD-01 → DEMO-CB-01/02` nên lãnh đạo vẫn xác nhận hợp lệ) |
| **Deploy Production** | commit bản vá **`aa9abe0`** → live lúc **13:05:58** (`/api/health` → `commit=aa9abe0`, `status=ok`, `db=up`) |
| **Smoke ghi trên Production sau bản vá** | ✅ **11/11** — xem bảng dưới |

**Smoke sau bản vá (11/11 PASS, dữ liệu thử dọn sạch 0/0):**

| # | Kiểm tra | Kết quả |
|---|---|---|
| 1 | Tạo đầu việc (cán bộ) | HTTP 201 · `reviewState = DRAFT` (không tự duyệt) |
| 2 | Cán bộ gửi lên lãnh đạo | HTTP 200 |
| 3 | Cán bộ **tự duyệt** việc của mình | **HTTP 403** (giữ nguyên) |
| 4 | **Lãnh đạo `UNIT_LEADER/ORGANIZATION` (`demold01`) xác nhận hồ sơ không có tuyến** | **HTTP 403 — đã chặn** (trước bản vá: 200) |
| 5 | Thông điệp trả về | *"Cán bộ này chưa có tuyến phê duyệt hợp lệ — hồ sơ đang chờ phân tuyến, chưa thể xác nhận."* |
| 6 | **Trưởng bộ phận cùng đơn vị (`cb001`) xác nhận** | **HTTP 403 — không mở rộng theo đơn vị** (trước bản vá: 200) |
| 7 | Hàng đợi chờ duyệt của lãnh đạo | `n=0` (không còn thấy hồ sơ của người không có tuyến) |
| 8 | Trạng thái hồ sơ sau khi bị chặn | vẫn `SUBMITTED` — **chờ phân tuyến**, không mất dữ liệu |
| 9 | API thêm SP QĐ1277 | HTTP 400 (thiếu tham số) — **không lỗi 500**, không sập |
| 10 | Dọn dữ liệu thử | `workItem left=0`, `work_items 33/33`, `work_item_reviews 0/0` ✔ |

> Ghi chú: `personal_work_items` = **33** (không phải 32 như lúc deploy) do tài khoản `dantn` tự tạo 1 đầu việc lúc 12:xx trong khi bạn thử trên Production — **không** phải dữ liệu thử còn sót (0 bản ghi có tiền tố `[PROD-V3-TEST]`).

### 3.4. Hệ quả cần chủ dự án quyết định (⚠️ không tự quyết)

* Sau bản vá, **không ai duyệt được** hồ sơ cho tới khi có `person_supervisions` ⇒ **35 cán bộ thật + 3 tài khoản DEMO đều đang ở trạng thái "chờ phân tuyến"**.
* Đây đúng nghiệp vụ đã chốt, nhưng cần bạn quyết định:
  1. **Gán tuyến phê duyệt thật** theo từng bộ phận (màn hình sẵn có: `/admin/supervisions`) — cần danh sách Trưởng bộ phận/Trưởng nhóm; hoặc
  2. **Tạm cấp tuyến cho cặp DEMO** (`demold01 → democb01`, `demold01 → democb02`) để UAT luồng xác nhận trên Production — **2 dòng dữ liệu, cần bạn phê duyệt** (tôi KHÔNG tự gán).

---

## 4. QUYỀN 24 TÀI KHOẢN CŨ & TÌNH TRẠNG TÀI KHOẢN DEMO (chỉ đọc, KHÔNG sửa)

### 4.1. Tổng quan

| Hạng mục | Kết quả |
|---|---|
| Tổng tài khoản | **24** — tất cả `status=ACTIVE`, người dùng `ACTIVE` |
| Phân bố vai trò | `STAFF` 19 · `DEPARTMENT_LEADER` 3 (`cb001`, `cb0018`, `cb002`) · `UNIT_LEADER` 3 (`cb016`, `dantn`, `demold01`) · `SYSTEM_ADMIN` **0 tài khoản** |
| Grant hết hạn | 1 (`cb002` có 1 grant `STAFF` đã hết hạn → **không còn hiệu lực**, đã sửa ở V3.1) |
| Tài khoản nhiều grant | 1 (`cb002` — 2 grant nhưng chỉ 1 còn hiệu lực) |
| Tài khoản thiếu quyền / thiếu đơn vị | `cb020` (HQCK_TALUNG) · `testacc` (BP_TONDONG_C) — đã có đơn vị ✔; **6 người HĐLD 111 chưa gán đơn vị** (B-5) |

### 4.2. Chi tiết từng tài khoản (vai trò / phạm vi / quyền)

| Tài khoản | Họ tên | Vai trò | Phạm vi | Số quyền | Ghi chú |
|---|---|---|---|---|---|
| cb001 | Nguyễn Đình Giang | DEPARTMENT_LEADER | DEPARTMENT — Bộ phận Nghiệp vụ Hải quan | 7 | ✔ |
| cb0018 | Trần Minh Hoàng | DEPARTMENT_LEADER | DEPARTMENT — Bộ phận Phúc tập & KT STQ | 7 | ✔ |
| cb002 | Nguyễn Hải Yên | DEPARTMENT_LEADER | DEPARTMENT — Bộ phận Kiểm tra giám sát B | 7 | 1 grant `STAFF` **hết hạn** (không tính) ✔ |
| cb003–cb009, cb011, cb014, cb015, cb017 | (9 cán bộ) | STAFF | DEPARTMENT | 3 | ✔ |
| cb010, cb012, cb013 | (3 cán bộ) | STAFF | DEPARTMENT — Giám sát B | 3 | ✔ |
| cb016 | Hoàng Văn Bằng | UNIT_LEADER | ORGANIZATION | 11 | lãnh đạo đơn vị ✔ |
| cb020 | Nguyễn Tuấn Anh | STAFF | DEPARTMENT — HQCK Tà Lùng | 3 | ✔ (đơn vị "cấp 1") |
| dantn | Trần Nguyên Đán | UNIT_LEADER | ORGANIZATION | 11 | ✔ |
| testacc | HQTATTTT | STAFF | DEPARTMENT — BP Tồn đọng C | 3 | ✔ |
| democb01 | Cán bộ DEMO 01 | STAFF | DEPARTMENT — Nghiệp vụ Hải quan | 3 | ACTIVE ✔ |
| democb02 | Cán bộ DEMO 02 | STAFF | DEPARTMENT — Giám sát B | 3 | ACTIVE ✔ |
| demold01 | Lãnh đạo DEMO | UNIT_LEADER | ORGANIZATION | 11 | ACTIVE ✔ |

### 4.3. Tình trạng tài khoản DEMO

* Có **3** tài khoản `demo*` (democb01, democb02, demold01) — tất cả `ACTIVE`, đúng vai trò, **không** có tài khoản demo thừa.
* **Mật khẩu demo trên Production đã được đổi** (không khớp file `demo-secrets.json`) ⇒ 3 bộ test chạy bằng **mật khẩu** không đăng nhập được Production. Đã xác nhận **không để lại dữ liệu** (chỉ +3 `audit_events`).
* **Không** có tài khoản `SYSTEM_ADMIN` trên Production ⇒ **chưa có tài khoản quản trị kỹ thuật** (file credential `admin.tk` mới tạo cho DB local, **không** có trên Production). Trung tâm phân quyền hiện do 3 `UNIT_LEADER` vận hành (đúng thiết kế: Trưởng đơn vị điều hành toàn đơn vị).
* ⚠️ Cần bạn quyết định: có tạo tài khoản `SYSTEM_ADMIN` trên Production để quản trị kỹ thuật (có tờ `system.config`) hay không — **tôi KHÔNG tự tạo**.

---

## 5. QUYỀN ĐỌC TỆP SUPABASE STORAGE — 🔴 ĐỌC CÔNG KHAI (chưa sửa, cần quyết định)

### 5.1. Kết quả kiểm chứng (đo trực tiếp trên project `ekswvjbpqblssxcdwagi`)

| Yêu cầu | Kết quả | Ý nghĩa |
|---|---|---|
| `GET /storage/v1/object/public/task-attachments/<key>` **không gửi khoá** | **HTTP 200 — 2.185.864 bytes** | 🔴 **Bất kỳ ai trên Internet** cũng tải được tệp đính kèm nếu biết/khoá đường dẫn |
| `GET /storage/v1/object/task-attachments/<key>` không gửi khoá | **HTTP 200 — 2.185.864 bytes** | 🔴 không cần khoá |
| `POST /storage/v1/object/list/task-attachments` với publishable key | **HTTP 200 — trả về danh sách thư mục** | 🟠 có thể **liệt kê** toàn bộ tệp trong bucket |
| `GET /storage/v1/bucket` | HTTP 200, `[]` | không lộ danh sách bucket |
| Bucket minh chứng `work-evidence`: `object/public` không khoá | HTTP 400 `NoSuchBucket` | ✔ bucket **private** |
| Bucket minh chứng `work-evidence`: `object` với publishable key | HTTP 400 `NoSuchKey` | ✔ bucket **tồn tại nhưng private**, publishable key **không** đọc được |

### 5.2. Đánh giá

* **Kho minh chứng (`work-evidence`)**: thiết kế **đúng** — private, chỉ service-role đọc (`storage.ts` chặn trả URL công khai, `assertReady()` từ chối bucket public, không bao giờ fallback sang publishable key). Hiện Production có **0 bản ghi minh chứng** nên đường này chưa được kiểm chứng bằng dữ liệu thật.
* **Bucket tệp đính kèm nhiệm vụ (`task-attachments`)**: **đang PUBLIC**. Mã lưu `file_url` dạng URL công khai (`/storage/v1/object/public/...`) và giao diện dựng thẳng `<img src=file_url>` (`src/app/my-work/page.tsx`, `src/app/approvals/page.tsx`). Cột `is_signed=true` **không có tác dụng** — URL không có token, không hết hạn ⇒ không phải signed URL.
* ⇒ **Vi phạm yêu cầu "không có quyền đọc tệp riêng tư ngoài phạm vi được cấp"**: tệp đính kèm nhiệm vụ (có thể gồm tài liệu đơn vị, ảnh hiện trường, hồ sơ) **đọc được không cần đăng nhập**.

### 5.3. Đề xuất khắc phục (chưa thực hiện — cần bạn phê duyệt vì đụng hạ tầng)

| # | Phương án | Nội dung | Rủi ro / ảnh hưởng |
|---|---|---|---|
| 1 | **Chuyển bucket `task-attachments` sang PRIVATE** + phát signed URL ngắn hạn qua API đã xác thực | Bổ sung route `GET /api/tasks/{id}/attachments/{attachmentId}/file` kiểm tra quyền rồi trả signed URL (TTL 5–10 phút); UI dùng URL đó thay vì URL công khai | 🟡 Trung bình: cần sửa 2–3 chỗ giao diện + thêm route; cần **service-role key** hoặc khoá có quyền tạo signed URL |
| 2 | **Giữ public nhưng dùng key dài hạn (không khuyến nghị)** | — | 🔴 Không giải quyết được: URL vẫn công khai vĩnh viễn |
| 3 | Tách bucket theo độ nhạy cảm | Tệp nhiệm vụ nhạy cảm → bucket private; tệp công khai (ảnh minh họa) → bucket public | 🟡 Nhiều việc hơn phương án 1 |

> **Điều kiện tiên quyết:** cần `SUPABASE_SERVICE_ROLE_KEY` (hoặc `SUPABASE_SECRET_KEY`) cho Production — hiện **không** có trong `.env` cục bộ và tôi **không** đọc được biến môi trường trên Vercel (thiếu `VERCEL_TOKEN`).

---

## 6. CHECKLIST UAT GIAO DIỆN PRODUCTION

Xem tài liệu riêng: **`docs/V3/UAT_CHECKLIST_PRODUCTION_2026-10-22.md`** (6 nhóm màn hình · 32 bước · cột kết quả để ghi khi UAT).

---

## 7. TỔNG HỢP MỨC RỦI RO & ĐỀ XUẤT

| # | Phát hiện | Mức | Trạng thái | Đề xuất |
|---|---|---|---|---|
| 1 | **Fallback phạm vi đơn vị cấp quyền duyệt** khi `person_supervisions = 0` (mọi UNIT_LEADER/DEPARTMENT_LEADER duyệt được mọi hồ sơ) | 🔴 Cao | **Đã sửa + deploy `aa9abe0`** (smoke 11/11) | Giữ nguyên bản vá; gán tuyến thật qua `/admin/supervisions` |
| 2 | **Bucket tệp đính kèm PUBLIC** — đọc không cần khoá, liệt kê được | 🔴 Cao | **Chưa sửa** (cần quyết định + service-role key) | Phương án 1 ở §5.3 |
| 3 | Vai trò lúc gọi API có thể lệch vai trò lúc đăng nhập (khi nhiều grant) | 🟡 Trung bình (tiềm ẩn) | **Đã sửa + deploy `aa9abe0`** | Không cần làm thêm |
| 4 | Không có tài khoản `SYSTEM_ADMIN` trên Production | 🟡 Trung bình | **Chưa làm** (không tự tạo) | Bạn quyết định có cấp hay không |
| 5 | `person_supervisions = 0` ⇒ **không ai duyệt được** hồ sơ (đúng nghiệp vụ, nhưng chặn UAT luồng duyệt) | 🟡 Trung bình | **Chờ quyết định** | Duyệt 2 dòng tuyến cho cặp DEMO để UAT |
| 6 | Tài liệu rollback chỉ revert 1 commit cuối (không về được `d524576`) | 🟡 Trung bình | **Đã sửa + kiểm chứng** | Dùng phương án A |
| 7 | 3 bộ test chạy bằng mật khẩu không vào được Production | 🟢 Thấp | Ghi nhận | Cấp 1 tài khoản kiểm thử riêng cho UAT |
| 8 | `routine_entries.review_state` dữ liệu cũ = NULL ⇒ hiện *"chưa gửi lãnh đạo"* | 🟢 Thấp | Đúng yêu cầu | Khi chạy reset dữ liệu sạch sẽ rõ |
| 9 | Kho minh chứng private — chưa có bản ghi thật để kiểm chứng end-to-end | 🟢 Thấp | Ghi nhận | Kiểm thử 1 minh chứng thật khi UAT |

### Nhật ký thay đổi trong đợt rà soát này

| Commit | Nội dung | Đã deploy Production? |
|---|---|---|
| `b6b8cd8` | Bản báo cáo triển khai V3 (đưa từ nhánh V3 lên `main`) | ✅ (tài liệu) |
| **`aa9abe0`** | **Bản vá bảo mật: bỏ fallback cấp quyền duyệt theo phạm vi đơn vị + thống nhất cách xác định vai trò + sửa tài liệu rollback + báo cáo rà soát + checklist UAT** | ✅ **live 13:05:58** |
| (commit tài liệu) | Bổ sung kết quả smoke 11/11 vào báo cáo rà soát | ✅ (tài liệu) |

> **Không có** thay đổi nào lên schema/dữ liệu Production trong đợt này (chỉ mã + tài liệu). Backup trước bản vá: `demo-ops/yc38c-backup/prod-pre-fix-20261022-130254.json` (74 bảng / 7.598 bản ghi / sha256 `…`).

### Đề xuất thứ tự ưu tiên

1. **Phê duyệt + tạo 2 tuyến DEMO** (`demold01 → democb01/democb02`) để UAT luồng xác nhận trên Production chạy được ngay.
2. **Cấp `SUPABASE_SERVICE_ROLE_KEY`** (nếu đồng ý phương án 1 §5.3) để chuyển bucket tệp đính kèm sang private + phát signed URL.
3. **Chốt tuyến phê duyệt thật** cho 35 cán bộ (theo bộ phận) — điều kiện để tính điểm chính thức.
4. **Quyết định tài khoản `SYSTEM_ADMIN`** trên Production.
5. Lệnh **reset dữ liệu sạch** (chờ §9 của `GO_NO_GO_BAN_GIAO_2026-10-22.md`).
