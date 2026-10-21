# OVERNIGHT STATUS — YC-33 → YC-37

**Cập nhật:** 21/10/2026 · **Base:** `efe2bde` (Giai đoạn 1) · **Production:** `https://task-cus.vercel.app`

Trạng thái dùng: `DEPLOYED_AUTO_VERIFIED` · `IMPLEMENTED_NOT_DEPLOYED` · `DRAFT_PREVIEW_ONLY` · `BLOCKED_BUSINESS_RULE` · `BLOCKED_ENVIRONMENT` · `NOT_STARTED`

---

## Tổng quan

| YC | Nội dung | Trạng thái | Bằng chứng |
|---|---|---|---|
| YC-37 | Xem trước hồ sơ · Đồng ý / Không đồng ý / Yêu cầu giải trình · RBAC · audit | `DEPLOYED_AUTO_VERIFIED` | Luồng 25/25 (local) · Xem trước 18/18 (Production) |
| YC-33 | Bộ máy tính điểm Bảng 1 có căn cứ, decimal-safe, phân biệt TX/QĐ1277 | `DEPLOYED_AUTO_VERIFIED` | Parity 38/38 với file gốc · Luồng 20/20 |
| YC-36 | Tự đánh giá, gợi ý tiêu chí chung, ưu điểm/hạn chế, nhận xét lãnh đạo, xếp loại đề xuất | `DEPLOYED_AUTO_VERIFIED` | 32/32 (chung YC-34/35/36) |
| YC-34 | Xem trước + xuất 01A/01B (tháng), 02A/02B (quý) | `DEPLOYED_AUTO_VERIFIED` (bản DỰ THẢO) | 32/32 |
| YC-35 | Quan hệ phụ trách theo kỳ + bình quân lãnh đạo | `DEPLOYED_AUTO_VERIFIED` (chưa có dữ liệu phụ trách) | 32/32 |
| YC-33 phần quý | Công thức tổng hợp tháng → quý | `BLOCKED_BUSINESS_RULE` | Xem `OPEN_QUESTIONS.md` §3 |
| Ngưỡng xếp loại | Bảng điểm → mức xếp loại | `BLOCKED_BUSINESS_RULE` | Xem `OPEN_QUESTIONS.md` §1 |
| Gợi ý điểm tiêu chí chung | Cơ chế gợi ý | `BLOCKED_BUSINESS_RULE` | Xem `OPEN_QUESTIONS.md` §2 |

---

## S0 — Audit (đã xong)

| Hạng mục | Kết quả |
|---|---|
| Health Production | `db=up` |
| Migration history | Production **không có** `_prisma_migrations` → cấm `prisma migrate deploy`; dùng `scripts/apply-*.ts` |
| Nút "Chấp thuận" | `src/app/approvals/page.tsx` — trước đây gọi API phê duyệt **ngay**, không có bước xem trước → gap YC-37 đã sửa |
| Quy trình phê duyệt hiện có | 3 loại: task nghiệm thu · kế hoạch · đề nghị gia hạn — giữ tách biệt, không gộp |
| RBAC | `src/server/guard.ts` — `UNIT_LEADER` toàn quyền nghiệp vụ; `DEPARTMENT_LEADER` theo phạm vi; `SYSTEM_ADMIN` không đọc/sửa nghiệp vụ |
| Audit | `src/server/audit.ts` → `audit_events` (đã có `IDOR_ATTEMPT_BLOCKED`) |
| Công thức Bảng 1 | Đọc trực tiếp từ workbook gốc `Dữ liệu.zip` (xem `NEXT_ACTIONS.md` §Công thức) |
| Công thức 01A/01B/02A/02B | Đọc trực tiếp từ workbook gốc |

---

## Công thức đã đối chiếu (nguồn: `Dữ liệu.zip`)

**Bảng 1 (tính điểm CC)** — sheet "Bảng 1 (tính điểm CC)", dòng 12–20:
```
(7)  G = (5) × (6)                      hệ số × số lượng giao
(9)  I = (5) × (8)                      hệ số × số lượng hoàn thành thực tế
(11) K = IF(J − C > 0; J − C; 0)        số ngày chậm tiến độ
(12) L = (9) − (11) × 25% × (9)        hoàn thành đạt TIẾN ĐỘ quy đổi
(14) N = (9) − (13) × 25% × (9)        hoàn thành đạt CHẤT LƯỢNG quy đổi
TỔNG CỘNG: G19=ΣG · I19=ΣI · L19=ΣL · M19=ΣM · N19=ΣN
I20 = (I19/G19)×100   L20 = (L19/G19)×100   N20 = (N19/G19)×100
```

**Biểu 01A (CC)** — sheet "Biểu 01A (CC)", dòng 28–39:
```
D28 = D23+D18+D15  (tiêu chí chung, tối đa 30)   C31 = D28
D34 = 'Bảng 1'!I20   D35 = 'Bảng 1'!L20   D36 = 'Bảng 1'!N20
D37 = (D34+D35+D36)/3      D38 = D37×70/100      D33 = D38      D39 = D33 + C31
```

**Biểu 01B (LĐ)** — sheet "01B tháng 9", dòng 33–41:
```
F33 = SUM(G33:AD33)/24   ← điểm trung bình cán chức thuộc thẩm quyền giao phụ trách (24 = số cột của VÍ DỤ, không hard-code)
D33 = +F33 (a)   D34 = +F34 (b)   D35 = +F35 (c)
D36, D37, D38 = do lãnh đạo tự nhập (d, đ, e — mức đơn vị)
D39 = SUM(D33:D38)/6   (g = (a+b+c+d+đ+e)/6)
D40 = D39×70/100        D41 = D32 + C30
```

**Biểu 02A (CC)** — sheet "Biểu 02A Quý III (CC)": `D34/D35/D36` là **giá trị nhập tay** (quý không tự tính từ tháng) · `D37=(a+b+c)/3` · `D38=D37×70/100` · `D39=D33+C31` · có mục **"Cá nhân tự đề xuất mức xếp loại"** với 4 lựa chọn (Hoàn thành xuất sắc / Hoàn thành tốt / Hoàn thành / Không hoàn thành).

**Quan sát cần lưu ý (chưa tự sửa):** trong sheet "Bảng 1", mục II (dòng 26–29) tham chiếu `D26=H20` (ô TRỐNG → 0) thay vì `I20`, khiến `D29 = 60.40101` thay vì điểm quy đổi. **Biểu 01A/01B/02A/02B tham chiếu đúng `I20/L20/N20`** → hệ thống bám theo biểu mẫu chính (đã xác minh), và ghi nhận sai lệch này để Hải quan xác nhận.

---

## Schema đã áp Production (additive)

Migration: `prisma/migrations/20261021090000_yc33_37_scoring_evaluation_supervision_approval/migration.sql`
Apply-script: `scripts/apply-yc33-37-ddl.ts` (idempotent, không FK sang bảng nghiệp vụ)

| Bảng | YC | Mục đích |
|---|---|---|
| `score_runs` / `score_run_items` | YC-33 | Snapshot kỳ tính: công thức, phiên bản danh mục/sản phẩm, trạng thái từng dòng |
| `evaluation_assessments` | YC-36 | Tự đánh giá, gợi ý, ưu điểm/hạn chế, nhận xét lãnh đạo, xếp loại đề xuất |
| `person_supervisions` | YC-35 | Quan hệ phụ trách theo kỳ |
| `approval_cases` / `approval_decisions` | YC-37 | Hồ sơ + lịch sử mọi lượt chấp thuận/từ chối/giải trình/phản hồi |

**Kiểm chứng DDL:** local lần 1 `schema_changed=true`, lần 2 `schema_changed=false` (cùng fingerprint), `checks_failed=0`; Production lần 1 `schema_changed=true`, lần 2 `schema_changed=false`, `checks_failed=0`. Chỉ CREATE TABLE/INDEX — không DROP/ALTER bảng cũ, không UPDATE/DELETE dữ liệu.

---

## Dữ liệu Production (đối chiếu trước/sau)

| Đối tượng | Trước | Sau |
|---|---:|---:|
| `people` / `accounts` | 38 / 24 | 38 / 24 |
| `work_catalog_versions` / `entries` | 1 / 348 | 1 / 348 |
| `work_catalog_department_mappings` | 0 | 0 |
| `activity_templates` | 48 | 48 |
| `tasks` / `plans` | 18 / 5 | 18 / 5 |
| `personal_work_items` / `monthly_work_results` / `work_evidences` | 26 / 15 / 0 | 26 / 15 / 0 |
| `approval_cases` / `approval_decisions` | — (chưa có) | 0 / 0 (chưa có hồ sơ nào được quyết định) |
| `score_runs` / `score_run_items` | — | 0 / 0 |
| `evaluation_assessments` | — | 0 / 0 |
| `person_supervisions` | — | 0 / 0 (chờ Hải quan xác nhận quan hệ phụ trách) |

---

## Ghi chú an toàn

- Mọi thay đổi schema chỉ **CREATE TABLE/INDEX mới** → tương thích code cũ, rollback = deploy lại commit cũ.
- Không tạo bản ghi nghiệp vụ mới ngoài dữ liệu test đã dọn sạch.
- Không commit workbook gốc, dữ liệu nhân sự, hồ sơ đánh giá, token hay mật khẩu.
- Không chạy `prisma migrate deploy` trên Production.

---

## CẬP NHẬT 21/10/2026 — YC-38B / YC-38C (ĐÃ DEPLOY)

| Mục | Trạng thái |
|---|---|
| YC-38A (đặc tả kiến trúc v2) | ✅ `a69311b` — đã duyệt Phương án A |
| YC-38B (bộ chọn nguồn thông minh) | ✅ **đã deploy** `d905a1d` — /plans, /my-work, /tasks |
| YC-38C (liên thông dữ liệu) | ✅ **đã deploy** — schema additive + write path + bảng phân công |
| Backup + restore-test | ✅ PASS (71 model, 7.391 bản ghi, 0 tham chiếu mồ côi) |
| Hồi quy YC-01→37 | ✅ 56/56 · 23/23 · 38/38 · 20/20 · 32/32 · 25/25 · **YC-38C 28/28** |
| Dữ liệu Production | ✅ Không đổi: tasks 18 · work_items 26 · monthly 15 · TX 348 · SP 3.386 · 48 mẫu |
| UAT nghiệp vụ | ⛔ **CHỜ xác nhận** — xem checklist trong `docs/YC38B_C_BAO_CAO_BAN_GIAO_2026-10-21.md` |

Báo cáo bàn giao + checklist UAT: `docs/YC38B_C_BAO_CAO_BAN_GIAO_2026-10-21.md`
