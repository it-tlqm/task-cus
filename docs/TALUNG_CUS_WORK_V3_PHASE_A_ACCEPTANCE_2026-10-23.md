# TALUNG-CUS-WORK V3 — BÁO CÁO NGHIỆM THU GIAI ĐOẠN A

**Ngày:** 23/10/2026  
**Nhánh:** `codex/v3-phase-a-planning-2026-10-23`  
**Phạm vi:** YC-03, YC-04, YC-05 — Lập kế hoạch, hạng mục và đầu việc  
**Trạng thái:** Đã triển khai, đã kiểm thử trên DB kiểm thử `talung_v3_fixture`; **chưa deploy Production**.

---

## 1. Kết quả đã xử lý

### A1. Luồng kế hoạch

- Không còn mở biểu mẫu thêm đầu việc khi chưa có kế hoạch đang chọn.
- Bổ sung tạo kế hoạch, chọn kế hoạch, quản lý hạng mục trên Desktop/Mobile.
- Kế hoạch vẫn là cấp đơn vị/bộ phận theo quyền `plans.create` và phạm vi đơn vị.
- Không mở quyền lập kế hoạch cấp đơn vị cho cán bộ không có quyền.
- “Việc của tôi” là bộ lọc theo người phụ trách, **không phải một loại kế hoạch cá nhân mới**. Việc tách Plan scope cá nhân vẫn là quyết định D1 chưa chốt.

### A2. Lưu và sửa đầu việc

- Sửa lỗi `completedDate:null` trả 409 khi sửa form cũ.
- Chuẩn hóa kiểm tra phía server: hạng mục, kỳ, người phụ trách, đơn vị, trạng thái kế hoạch.
- Chặn gắn đầu việc vào hạng mục không tồn tại, sai kỳ hoặc khác đơn vị.
- Giữ nguyên dữ liệu đã nhập khi lỗi; hiển thị lỗi theo trường.
- Chống gửi trùng bằng `idempotencyKey` theo cặp `(personId, idempotencyKey)`.
- Cán bộ chỉ sửa/xóa đầu việc do mình phụ trách trên UI; lãnh đạo được sửa trong phạm vi kế hoạch. Backend kiểm tra lại quyền.

### A3. TX và QĐ1277

- Dùng chung một `WorkSourcePicker` cho TX và QĐ1277.
- Một đầu việc gắn được nhiều sản phẩm QĐ1277; mỗi liên kết có trạng thái đối chiếu riêng.
- Hiển thị mã, tên, nhóm, hệ số, đơn vị tính và trạng thái đối chiếu; không tự suy hệ số/số lượng/điểm.
- Giữ độc lập 5 nhóm Excel và 6 nhóm TX; không tự ánh xạ.
- Chỉ người thực hiện được đề xuất/bỏ sản phẩm QĐ1277. Lãnh đạo lập hộ chỉ giao việc, không đề xuất sản phẩm thay cán bộ.
- Liên kết đầu tiên là sản phẩm chính; xóa sản phẩm chính tự chuyển cờ chính và con trỏ `PersonalWorkItem.productItemId` sang liên kết còn lại.
- Sản phẩm đã được lãnh đạo xác nhận không thể bỏ; hệ số được chụp tại thời điểm xác nhận.

### A4. Trạng thái và phê duyệt

- Chặn tạo trực tiếp đầu việc ở trạng thái `COMPLETED`.
- Phân biệt hoàn thành thực tế (`status`, `completedDate`) với xác nhận của lãnh đạo (`reviewState`).
- Kế hoạch `SUBMITTED` khóa nội dung; `DRAFT`/`RETURNED` được sửa; `APPROVED`/`IN_EFFECT` chỉ sửa qua trình duyệt bổ sung.
- Chặn người lập kế hoạch tự phê duyệt.
- Không fallback quyền duyệt theo chức danh/phạm vi đơn vị. Không có tuyến phụ trách hợp lệ thì hồ sơ ở trạng thái “chờ phân tuyến”.
- Trả lại kế hoạch mở khóa nội dung; trình lại và phê duyệt bởi người có thẩm quyền khác hoạt động đúng luồng.

### A5. Desktop/Mobile

- Bộ chọn kỳ, kế hoạch, phạm vi hoạt động trên cả hai giao diện.
- Các nút chưa hỗ trợ chuyển kỳ được vô hiệu hóa kèm chú thích rõ ràng.
- Biểu mẫu thêm/sửa đầu việc nằm trong khung nhìn Mobile, không tràn ngang.
- Nút thêm/sửa/xóa và lưu hoạt động thực tế trên Desktop và Mobile.

---

## 2. File, API, schema và migration

### API / server

- `src/app/api/plans/route.ts` — danh sách/tạo kế hoạch, phân giải kỳ, kiểm tra phạm vi đơn vị.
- `src/app/api/plans/[id]/items/route.ts` — CRUD hạng mục, kiểm tra quyền/khóa kế hoạch.
- `src/app/api/plans/[id]/workflow/route.ts` — trình duyệt, trả lại, phê duyệt, hiệu lực, bổ sung; chặn tự duyệt.
- `src/app/api/plans/options/route.ts` — đơn vị/nhóm trong phạm vi và `canCreatePlan`.
- `src/app/api/personal-work-items/route.ts` — validation, idempotency, khóa kế hoạch, chặn tạo thẳng hoàn thành, bảo vệ con trỏ sản phẩm.
- `src/app/api/work-item-products/route.ts` — nhiều sản phẩm, sản phẩm chính, xóa có kiểm soát.
- `src/app/api/work-item-products/[id]/route.ts` — xác nhận/từ chối sản phẩm bởi lãnh đạo trực tiếp.
- `src/server/planning.ts` — quy tắc quyền và liên kết kế hoạch.
- `src/server/reporting-period.ts` — phân giải Ngày/Tuần/Tháng dùng chung.
- `src/server/work-item-review.ts` — tuyến phụ trách trực tiếp, chống tự duyệt/fallback.

### Giao diện

- `src/app/plans/page.tsx` — tạo/chọn kế hoạch, quản lý hạng mục, thêm/sửa/xóa đầu việc, chọn người phụ trách, khóa theo trạng thái, Desktop/Mobile.
- `src/components/work/WorkSourcePicker.tsx` — bộ chọn TX/QĐ1277 hợp nhất, nhiều sản phẩm, chế độ chỉ đọc khi lãnh đạo lập hộ.

### Schema / migration

- `prisma/schema.prisma`: thêm ràng buộc duy nhất `(person_id, idempotency_key)`.
- `prisma/migrations/20261023120000_v3_phase_a_planning/migration.sql`:
  - Đặt `idempotency_key = NULL` cho các bản ghi trùng cũ hơn, giữ bản ghi mới nhất.
  - Tạo unique index `personal_work_items_person_idempotency_key`.
  - Không xóa bản ghi nghiệp vụ.

### Rollback

1. Dừng triển khai phiên bản mới.
2. `DROP INDEX "personal_work_items_person_idempotency_key";`
3. Revert commit Phase A.
4. Các `idempotency_key` đã bị đặt `NULL` không tự khôi phục; chỉ ảnh hưởng khả năng chống gửi trùng của bản ghi cũ, không mất nội dung công việc.
5. Nếu cần khôi phục dữ liệu gốc, dùng backup/rehearsal snapshot đã lập trước khi chạy migration.

---

## 3. Quy tắc nghiệp vụ và căn cứ

- Kế hoạch cấp đơn vị; tách kế hoạch cá nhân là **D1 — PENDING BUSINESS DECISION**.
- Chỉ `DRAFT`/`RETURNED` được sửa nội dung; `SUBMITTED` khóa; `APPROVED`/`IN_EFFECT` dùng trình duyệt bổ sung.
- Không tự duyệt; không fallback tuyến duyệt.
- Hoàn thành thực tế và xác nhận lãnh đạo là hai bước riêng.
- TX và QĐ1277 độc lập; không tự ánh xạ nhóm; không tự suy hệ số/điểm.
- Sản phẩm QĐ1277 do người thực hiện đề xuất; lãnh đạo trực tiếp xác nhận.
- Quy tắc “cùng kỳ” thu NSNN chưa chốt; chưa công bố tỷ lệ chính thức.
- D6/D8/D9 và ranh giới Task/PersonalWorkItem vẫn chờ chủ dự án quyết định.

---

## 4. Kết quả kiểm thử

| Bộ kiểm thử | Kết quả | Ghi chú |
|---|---:|---|
| `scripts/test-v3-phase-a-planning.ts` | **37/37 PASS** | Kế hoạch, hạng mục, TX/QĐ1277, khóa, trả lại, tự duyệt, phê duyệt |
| `scripts/test-v3-multi-product.ts` | **36/36 PASS** | Nhiều sản phẩm, xác nhận từng SP, khóa sau nghiệm thu |
| `scripts/test-v3-no-self-approval.ts` | **5/5 PASS** | Chống tự nghiệm thu/tự quyết định |
| `scripts/test-v3-review-flow.ts` | **38/38 PASS** | Cán bộ → lãnh đạo trực tiếp |
| `scripts/test-v3-permissions.ts` | **24/24 PASS** | Bảo mật trung tâm phân quyền |
| `scripts/test-v3-e2e-flow.ts` | **40/40 PASS** | Luồng end-to-end V3 |
| `scripts/test-v3-f01-f05.ts` | **22/22 PASS** | Luồng hoàn thành F01 + tương phản nút F05 |
| `scripts/test-v3-f18-routine.ts` | **26/26 PASS** | Nhật ký tác nghiệp, TX/QĐ1277, liên thông V3 |
| `scripts/test-v3-private-attachments.ts` | **14/14 PASS** | Tệp đính kèm private, phân quyền tải |
| Kiểm thử UI Desktop/Mobile (Puppeteer) | **13/13 PASS** | Tạo kế hoạch, hạng mục, đầu việc, QĐ1277, Mobile |
| `npx tsc --noEmit` | **PASS** | Không lỗi type |
| `npx prisma validate` | **PASS** | Schema hợp lệ |
| `npm run build` | **PASS** | Next.js 15.5.27, 98 trang |

### Chưa chạy được

- `scripts/test-yc23-25-api.ts`: bộ test yêu cầu mật khẩu `cb001/cb002` từ `demo-ops/demo-secrets.json`, không khớp mật khẩu fixture `LocalTest@2026`. Không thay đổi tài khoản/phân quyền để ép test PASS.
- `scripts/test-v3-evidence-adjustment.ts`: môi trường chạy `next start` không cấu hình kho minh chứng nên API `POST /api/work-evidence` trả **503 fail-closed** ngay bước tải minh chứng gốc. Đây là cấu hình môi trường, không phải thay đổi Phase A; không nới điều kiện bảo mật kho để ép test PASS.

### Bằng chứng giao diện

- `docs/evidence/phase-a/desktop-plan-draft.png`
- `docs/evidence/phase-a/mobile-plan-draft.png`
- `docs/evidence/phase-a/mobile-add-work-item.png`
- `docs/evidence/phase-a/mobile-plan-after-add.png`
- `docs/evidence/phase-a/mobile-plan-final.png`

---

## 5. Vấn đề còn tồn tại / cần chủ dự án quyết định

- **D1:** có hay không Plan scope cá nhân; hiện “Việc của tôi” chỉ là bộ lọc.
- **D6:** người được giao việc thay lãnh đạo và phạm vi chọn người phụ trách.
- **D8/D9:** quy tắc phê duyệt/bổ sung và ranh giới Task/PersonalWorkItem.
- Quy tắc “cùng kỳ” thu NSNN, nguồn số liệu lịch sử và vai trò nhập liệu chưa chốt.
- Chưa xác minh trạng thái Production: số kế hoạch, kế hoạch 0 đầu việc, `person_supervisions`, `selectionMode` thực tế.
- Chưa chạy migration trên Production; chỉ chạy trên `talung_v3_fixture`.

---

## 6. Trạng thái triển khai

- **Chưa deploy Production.**
- **Chưa thay đổi dữ liệu Production.**
- **Chưa reset tài khoản/phân quyền/tuyến duyệt.**
- Commit Phase A: `2f20dce` — `feat(plans): trien khai Phase A YC-03/04/05`
- Điều kiện tiếp theo: chủ dự án nghiệm thu Phase A và có lệnh phát hành riêng.

---

## 7. Checklist nghiệm thu

- [x] Tạo/chọn kế hoạch DRAFT trên Desktop.
- [x] Thêm/sửa/xóa hạng mục khi kế hoạch còn DRAFT.
- [x] Thêm/sửa/xóa đầu việc đúng hạng mục/kỳ/người phụ trách.
- [x] Không tạo thẳng đầu việc hoàn thành.
- [x] Không tự duyệt kế hoạch.
- [x] Kế hoạch SUBMITTED khóa nội dung.
- [x] Trả lại → sửa → trình lại → phê duyệt bởi người khác.
- [x] Một đầu việc gắn nhiều sản phẩm QĐ1277.
- [x] Không suy hệ số/điểm; sản phẩm đã xác nhận không bị bỏ.
- [x] Desktop/Mobile không tràn ngang; nút thêm/sửa/xóa/lưu hoạt động.
- [x] Typecheck, Prisma validate, build và regression liên quan PASS.
- [ ] Nghiệm thu của chủ dự án và lệnh phát hành Production (ngoài phạm vi báo cáo này).
