# BÁO CÁO GIAI ĐOẠN 3 — KIỂM ĐỊNH, HOÀN THIỆN VÀ CHUẨN BỊ UAT

**Ngày:** 21/10/2026 · **Base:** `93bd620` → **Commit triển khai:** `14574e1` (+ bản tài liệu)
**Production:** `https://task-cus.vercel.app`

> Báo cáo nêu **kết quả kiểm thử tự động** và **bằng chứng đối chiếu tài liệu gốc**.
> UAT nghiệp vụ do người phụ trách thực hiện; hệ thống **chưa** được tuyên bố đã UAT.

---

## 1. DANH SÁCH LỖI PHÁT HIỆN VÀ ĐÃ SỬA

| # | Mức | Lỗi | Nguyên nhân | Đã sửa | Bằng chứng |
|---|---|---|---|---|---|
| L1 | **Cao** | Báo cáo Giai đoạn 2 ghi YC-37 là commit `9633a43` — thực tế `9633a43` là commit **YC-30 (Giai đoạn 1)**; YC-37 là `446b4d6` | Ghi nhầm khi tổng hợp | Sửa cả 2 báo cáo | `git show 9633a43` → `feat(yc30): …`; `git show 446b4d6` → `feat(yc37): …` |
| L2 | **Cao** | Hệ số hợp lệ của đầu việc TX bị **vứt bỏ** nếu phiên bản danh mục đã bị thay thế (`PENDING_RULE`) | `work-catalog.ts` kiểm tra `version.status === "ACTIVE"` | Lấy đúng hệ số của **đầu việc đang tham chiếu** (giữ ổn định lịch sử, không tự tính lại kết quả đã chốt) | `src/server/scoring/index.ts`, `monthly-preview.ts` |
| L3 | **Cao** | Số ngày chậm tiến độ có thể **lệch 1 ngày** | `Math.floor((ms_a - ms_b)/86400000)` trên DateTime lưu theo giờ 00:00 địa phương → 2,958… ngày → còn 2 thay vì 3 | Tính theo **ngày lịch GMT+7** (`vnCalendarDayDiff`) | `src/server/scoring/date-util.ts` |
| L4 | Trung bình | File Excel xuất ghép dữ liệu theo **chỉ số mảng** → lệch dữ liệu khi số dòng engine ≠ số dòng nguồn (thiếu hệ số, bị loại trùng) | `p.tasks[i]` đối chiếu với `score.rows[i]` | Ghép theo **ID bản ghi kết quả** (`resultId`) | `src/server/evaluation-export.ts` |
| L5 | Trung bình | Quan hệ phụ trách **chồng lấn** trong cùng kỳ (thêm nhiều lần với `effectiveFrom` khác nhau) → cấp dưới bị **tính trùng** khi bình quân | Unique chỉ khóa `(manager, subordinate, effectiveFrom)` | Giữ **quan hệ mới nhất** cho mỗi cấp dưới; khử trùng đường đi | `src/server/scoring/leader-average.ts` |
| L6 | Trung bình | Thiếu **kết quả xếp loại cuối cùng** (cấp thẩm quyền quyết định) — mới chỉ có "đề xuất của cá nhân" | Yêu cầu YC-36 | Thêm `final_grade`, `final_grade_by_id`, `final_grade_at`, `final_grade_note`; **chỉ lãnh đạo trong phạm vi** mới ghi được | `prisma/schema.prisma` + `src/server/evaluation/assessment.ts` |
| L7 | Thấp | Hồ sơ quý **không có mốc thời gian** nộp theo CV 2431 (ngày 22 tháng cuối quý / ngày 05 tháng liền kề) | Chưa có | Ghi nhận trong báo cáo + danh sách xác nhận (chưa tự đặt ngưỡng) | `OPEN_QUESTIONS.md` |
| L8 | Thấp | `Mẫu 2D theo CV 1601.xlsx` trong bộ hồ sơ **đã bị CV 2431 thay thế** | CV 2431 mục V.3 + mục IV.1.1.c | Ghi nhận; **không** dùng file 2D cũ | `CV 2431` mục IV.1.1.c |
| L9 | Thấp | File `public/templates/kehoach-thang-02c-template.xlsx` mang nhãn **02C** nhưng là **kế hoạch tháng**; theo CV 2431, **02C là báo cáo kết quả các lĩnh vực công tác của đơn vị (theo quý)** | Nhầm lẫn từ bộ hồ sơ | Ghi nhận, đề xuất T8; **không** xoá hay đổi luồng cũ | `docs/YC33_37_KIEM_KE_FORM_TAO_CONG_VIEC_2026-10-21.md` |
| L10 | Thấp | Quy trình: script backup chạy **trước** DDL bằng Prisma Client đã đổi → lỗi cột chưa tồn tại, backup không tạo được | Sai thứ tự | Đã tạo lại backup **sau** DDL; DDL chỉ `ADD COLUMN` (nullable, không mất dữ liệu) và **đếm đối chiếu trước/sau không đổi** | `demo-ops/yc3-backup/*.json` + output DDL |

### Lỗi đã kiểm tra và **KHÔNG** phải sửa (bằng chứng)
| Mục | Phát hiện | Kết luận |
|---|---|---|
| **D26 → H20** | Sheet *"Bảng 1 (tính điểm CC)"* dòng 26: `D26 = H20` (ô **trống** → 0) trong khi dòng 27 `D27 = L20`, dòng 28 `D28 = N20`, dòng 29 `D29 = SUM(D26:D28)/3` → `60.40101` | Đây là **điểm lệch trong workbook gốc**, không phải lỗi hệ thống. Biểu **01A/01B/02A/02B** tham chiếu **đúng** `I20/L20/N20` → hệ thống bám theo biểu mẫu chính và **parity 38/38**. **Không tự sửa quy tắc nghiệp vụ chưa được duyệt** — đề nghị Hải quan xác nhận mục II của Bảng 1. |
| Thiếu hệ số | Đầu việc TX chưa có hệ số | `INSUFFICIENT_DATA`, **không** ra điểm giả, hiển thị lý do từng dòng |

---

## 2. BẰNG CHỨNG ĐỐI CHIẾU VỚI TÀI LIỆU GỐC

### 2.1. Công văn 2431/HQKV16-TCCB ngày 25/9/2026 (Chi cục Hải quan khu vực XVI) — **15 trang, trích xuất được toàn bộ text**

| Nội dung gốc | Vị trí | Đối chiếu hệ thống |
|---|---|---|
| **"6 rõ"**: rõ người, rõ việc, rõ thời gian, rõ trách nhiệm, rõ sản phẩm, rõ thẩm quyền; **một việc chỉ phân công một đầu mối (cá nhân hoặc bộ phận) chủ trì** | mục I.1.4 | ⚠️ Hệ thống **chưa** có cờ "đầu mối chủ trì" → đề xuất T1 (chưa triển khai) |
| **Thẩm quyền**: Trưởng phòng **nhận xét, đánh giá, đề xuất** mức xếp loại; **Chi cục trưởng quyết định, phê duyệt** mức xếp loại từ Phó Chi cục trưởng trở xuống | mục II.1 | ✅ Đã tách 2 mức: `selfGradeChoice` (đề xuất) và `finalGrade` (quyết định) — L6 |
| **Ngưỡng xếp loại (điểm KPI)**: Hoàn thành xuất sắc **≥ 90**; Hoàn thành tốt **70 → <90**; Hoàn thành **50 → <70**; Không hoàn thành **< 50**; kèm điều kiện (100% đúng hạn, **≥30% vượt mức**, không chậm muộn, kỷ luật…) | mục II.5 (công chức), II.2, II.4 | ✅ Đưa vào **cấu hình hệ thống làm dữ liệu THAM CHIẾU** (`evaluation.grade.reference`, `autoApply=false`) → hiển thị trong phiếu đánh giá. ⛔ **KHÔNG tự suy ra mức xếp loại**: ngưỡng gốc áp cho *"điểm đánh giá KPI theo quy định"*, chưa xác nhận tương đương với tổng điểm Bảng 1 (30 + 70) |
| Tỷ lệ "Hoàn thành xuất sắc" ≤ **20%** (tối đa 25% nếu thành tích nội trội) | mục V.1.1 | Ghi nhận, chưa hiện thực (cần thống kê theo quý) |
| Tổng hợp **cả năm**: Hoàn thành xuất sắc nếu ≥ 02 quý Hoàn thành xuất sắc và không có quý Không hoàn thành; Hoàn thành tốt nếu ≤ 02 quý Hoàn thành hoặc ≤ 01 quý Không hoàn thành; Không hoàn thành nếu ≥ 02 quý Không hoàn thành | mục II.6 | Ghi nhận — chưa có mô hình tổng hợp năm trong hệ thống |
| Người đứng đầu đơn vị **không cao hơn** mức của đơn vị; công chức/lãnh đạo liên quan không cao hơn người đứng đầu | mục II.2(c), III | Ghi nhận — chưa có kiểm soát trần xếp loại |
| **Hạn nộp hồ sơ**: Thủ trưởng đơn vị gửi về Phòng Tổ chức cán bộ **chậm nhất ngày 22 tháng cuối quý**; hồ sơ đánh giá quý gửi **trước ngày 05 tháng liền kề quý đánh giá**; số liệu báo cáo **từ ngày đầu tháng quý → ngày cuối tháng cuối quý** | mục IV.1.1.a, IV.1.1.c, IV.2 | Ghi nhận (L7) — chưa tự đặt mốc thời gian |
| **Bộ hồ sơ quý**: Công văn đề xuất + **mẫu 2C** (báo cáo kết quả thực hiện nhiệm vụ) + **mẫu 02A/02B** (phiếu đánh giá, xếp loại) + **mẫu 2D** (bảng tổng hợp kết quả đánh giá) + **mẫu 2E** (bảng kết quả chỉ tiêu kế hoạch lĩnh vực trọng tâm) | mục IV.1.1.c | ✅ 02A/02B đã xuất được (YC-34). ⛔ 2C/2D/2E **ngoài phạm vi đã giao** (báo cáo L9, đề xuất T8) |
| Đánh giá **theo quý, hàng năm**; cá nhân làm việc **từ 01 tháng trở xuống** trong quý thì chưa đánh giá, kết quả xem xét sang quý sau | mục II, V.2 | Ghi nhận — chưa có quy tắc tự động |
| Công văn này **thay thế** 938/HQKV16 (05/5/2026), 1234/HQKV16 (29/5/2026), 1601/HQKV16 (01/7/2026) | mục V.3 | ✅ Ghi nhận (L8) — file *Mẫu 2D theo CV 1601* **không dùng lại** |
| Công văn 2431/HQKV16 ngày 25/9/2026 (đơn vị trực thuộc): nộp **2C + 02A/02B + 2D + 2E**; người ký **Đội trưởng** | file `Công văn.docx` | ✅ Xác nhận vai trò người ký; phát sinh hồ sơ quý của đơn vị |
| Mẫu 2C (báo cáo KQ các lĩnh vực công tác của đơn vị) có cấu trúc: số nhiệm vụ giao có hạn trong quý / đã hoàn thành / **hoàn thành trước hạn / đúng hạn / chưa hoàn thành** + ghi chú tên, thời hạn, thời gian thực tế, nguyên nhân khách quan/chủ quan | file `Mẫu 2C …docx` | ⚠️ Hệ thống **chưa** có báo cáo 2C; dữ liệu "hoàn thành vượt mức / trước hạn / đúng hạn" **chưa được thu thập** → cũn theo tiêu chí ≥30% vượt mức của CV 2431 |

### 2.2. Workbook gốc (đối chiếu công thức) — parity **38/38**
| Chỉ số | File gốc | Hệ thống |
|---|---:|---:|
| G19 / H19 / I19 | 1719.16 / 660 / 1719.16 | ✅ khớp |
| L19 / M19 / N19 | 1396.01 / 0 / 1719.16 | ✅ khớp |
| I20 / L20 / N20 | 100 / 81.203029 / 100 | ✅ khớp |
| 01A: D37 / D38 / D39 | 93.734343 / 65.61404 / 94.11404 | ✅ khớp |

### 2.3. Nguyên tắc "6 rõ" — hiện trạng
| Rõ | Hiện trạng hệ thống | Còn thiếu |
|---|---|---|
| Rõ người | `tasks.ownerId`, `task_assignees` | Chưa phân biệt **đầu mối chủ trì** vs người phối hợp (T1) |
| Rõ việc | `tasks.title`, `personal_work_items.title` | 2 nơi đặt tên → dễ lệch (T4) |
| Rõ thời gian | `currentDeadline`, `dueDate`, `completedDate` | Có nhưng 2 hệ thống ngày (Task vs WorkItem) |
| Rõ trách nhiệm | `ownerId` + assignee | OK |
| Rõ sản phẩm | `expectedResultText`, `outputText`, `productItemId` | `expectedResultText` (Task) và `expectedResult` (WorkItem) là 2 ô cùng nghĩa (T4) |
| Rõ thẩm quyền | `scopeType`, `verifyTaskAccess`, `isTaskLeader` | OK |
| **1 đầu mối chủ trì** | — | ❌ **Chưa có** → T1 |

---

## 3. KẾT QUẢ KIỂM THỬ VÀ DEPLOY THỰC TẾ

### 3.1. Kiểm thử tự động
| Bộ kiểm thử | Nơi chạy | KQ |
|---|---|---|
| `test-yc33-scoring-parity.ts` (đối chiếu workbook gốc) | local | **38/38** |
| `test-yc33-scoring-flow.ts` | local DB | **20/20** |
| `test-yc34-36-eval.ts` | local DB | **32/32** |
| `test-yc37-approval-flow.ts` | local DB | **25/25** |
| `test-yc30-navigation.ts` | local | 197/197 |
| `test-yc30-ui.ts` | local + **Production** | 55/55 |
| `test-yc30-regression.ts` (YC-23→32) | **Production** | 56/56 |
| `test-yc37-approval-preview.ts` | **Production** | 18/18 |
| `test-yc33-36-production-smoke.ts` | **Production** | 23/23 |
| `tsc --noEmit` / `next build` | local | 0 lỗi / build thành công |
| DDL idempotent | local + **Production** | lần 2 `schema_changed=false`, `checks_failed=0` |

### 3.2. Deploy
| Mục | Giá trị |
|---|---|
| Commit cuối | `14574e1` (+ tài liệu Giai đoạn 3) |
| DDL Production | `scripts/apply-yc33-37-ddl.ts` — 25 câu lệnh, **chỉ CREATE TABLE/INDEX + ADD COLUMN (nullable)**, `checks_failed=0` |
| Đối chiếu dữ liệu trước/sau | `tx_entries=348 · work_items=26 · monthly_results=15 · tasks=18 · plans=5 · people=38 · accounts=24` — **không đổi** |
| Backup | `demo-ops/yc3-backup/yc3-before-finalgrade-*.json` (ngoài Git) |
| Lệnh cấm | Không chạy `prisma migrate deploy` · Không DROP/TRUNCATE/reset |

---

## 4. BỐN FILE EXCEL XUẤT THỬ TỪ HỆ THỐNG

Sinh bằng **đúng mã xuất của hệ thống** (`src/server/evaluation-export.ts`) trên DB local với **fixture DEMO** (`[MẪU] …`), không có dữ liệu nhân sự thật; fixture được dọn sạch sau khi sinh.

| File | Sheet | Kiểm chứng nội dung |
|---|---|---|
| `docs/samples/YC33_37_bieu_mau/Phieu-01A-T10-2026.xlsx` | `Bảng 1 (tính điểm)` + `Biểu 01A (CC)` | TỔNG CỘNG: G=303.5 · H=122 · I=303.5 · L=300.875 · M=1 · N=302.625 · I20=100 · L20=99.135091 · N20=99.711697; biểu: C31=27 · D34=100 · D35=99.135091 · D36=99.711697 · D37=99.615596 · D38=69.7309172 · D39=96.730917 |
| `Phieu-01B-T10-2026.xlsx` | `01B tháng` | a/b/c lấy từ **bình quân theo quan hệ phụ trách** (YC-35); d/đ/e để trống cho lãnh đạo nhập |
| `Phieu-02A-Q3-2026.xlsx` | `Bảng 1 (tính điểm)` + `Biểu 02A (CC)` | Có mục *"Cá nhân tự đề xuất mức xếp loại"*; ô thiếu căn cứ gắn nhãn `DỰ THẢO` |
| `Phieu-02B-Q3-2026.xlsx` | `02B quý (LĐ)` | a/b/c từ bình quân; d/đ/e để trống |

Đối chiếu tay: `G = 2.5×120 + 1.75×2 = 303.5`; `L = 300 + (3.5 − 3×25%×3.5) = 300.875`; `N = 300 + (3.5 − 1×25%×3.5) = 302.625`; `a = 303.5/303.5 = 100%`; `d = (100 + 99.135091 + 99.711697)/3 = 99.615596`; `D38 = 99.615596×0.7 = 69.7309172`; `D39 = 69.7309172 + 27 = 96.730917` → **khớp hoàn toàn công thức file gốc**.

---

## 5. BÁO CÁO KIỂM KÊ CÁC FORM TẠO CÔNG VIỆC
Tài liệu riêng: `docs/YC33_37_KIEM_KE_FORM_TAO_CONG_VIEC_2026-10-21.md` (8 luồng F1–F8, bảng AS-IS, đề xuất TO-BE T1–T8, phần "không làm trong đợt này").

Tóm tắt rủi ro trùng dữ liệu:
- `tasks` (nhiệm vụ giao) và `personal_work_items` (đầu việc đánh giá) là **hai bảng song song**, liên kết bằng `taskId` **không có ràng buộc unique**.
- **F1/F4** (tạo Task từ Nhật ký công việc / Công việc phát sinh) cho nhập tên tự do → **không gắn danh mục TX/QĐ1277** → không tính được điểm, không lên biểu 01A/02A.
- **F5** (Nhật ký tác nghiệp) **tự sinh thêm `personal_work_items`** → 1 việc có thể có 2 bản ghi (vi phạm "một lần nhập").
- **F8** (ca trực) **không** sinh WorkItem → công việc ca trực không vào kết quả đánh giá.

---

## 6. CÁC VẤN ĐỀ THỰC SỰ CẦN HẢI QUAN XÁC NHẬN

| # | Vấn đề | Vì sao chưa tự quyết | Trạng thái hệ thống |
|---|---|---|---|
| Q1 | **Ánh xạ "điểm đánh giá KPI" (CV 2431) ↔ tổng điểm Bảng 1 (30 + 70)** | CV 2431 nói *"điểm đánh giá KPI theo quy định"*; chưa có văn bản nào khẳng định đó là tổng điểm biểu 01A/02A | Ngưỡng đã lưu làm **tham chiếu** (`autoApply=false`); hệ thống **không** tự gợi ý xếp loại |
| Q2 | **Công thức tổng hợp tháng → quý** (điểm a/b/c của 02A/02B) | Mẫu 02A gốc nhập tay; CV 2431 không nêu công thức gộp 3 tháng | Ô a/b/c của biểu quý để trống + nhãn DỰ THẢO |
| Q3 | **Mục II của Bảng 1 (`D26 = H20`)** | Sai lệch trong **workbook gốc**; sửa là thay đổi quy tắc nghiệp vụ chưa được duyệt | Hệ thống bám theo 01A/01B/02A/02B (parity 38/38); **chưa** sửa quy tắc |
| Q4 | **"Một việc chỉ phân công một đầu mối chủ trì"** (mục I.1.4) | Cần chốt mô hình dữ liệu (cờ `isPrimaryOwner` vs tách bảng) | Chưa hiện thực — đề xuất T1 |
| Q5 | **Ca trực có phải đầu vào kết quả đánh giá quý?** | CV 2431 không nêu trực tiếp | Chưa nối — đề xuất T6 |
| Q6 | **Mẫu 2C**: dùng bản "Báo cáo KQ các lĩnh vực công tác của đơn vị" (theo CV 2431) hay giữ file kế hoạch tháng đang mang nhãn 02C? | Trùng nhãn giữa 2 tài liệu | Chưa đổi — đề xuất T8 |
| Q7 | **Mẫu 2D/2E** (tổng hợp kết quả đánh giá, chỉ tiêu kế hoạch trọng tâm) | Ngoài phạm vi đã giao; mẫu 2D theo CV 1601 đã bị thay thế | Chưa triển khai |
| Q8 | **Thu thập "hoàn thành vượt mức / trước hạn / đúng hạn"** (điều kiện ≥30% của CV 2431) | Chưa có trường dữ liệu | Chưa có — ảnh hưởng điều kiện xếp loại "Hoàn thành xuất sắc" |
| Q9 | **Cơ cấu phụ trách thực tế** (Đội trưởng / Đội phó / công chức) | Chưa xác nhận → bảng `person_supervisions` đang **rỗng** | Có màn quản trị để nhập; chưa có dữ liệu |
| Q10 | **Mốc thời gian nộp hồ sơ quý** (ngày 22 tháng cuối quý / ngày 05 tháng liền kề) | Có trong CV 2431 nhưng chưa rõ hệ thống có cần nhắc hạn | Ghi nhận, chưa hiện thực |
| Q11 | Ánh xạ 6 nhóm danh mục TX → bộ phận; tên bộ phận mới; 2 tên ngắn nhiều ứng viên; 12 cặp tên trùng; số lượng 32 vs 35 | Còn từ Giai đoạn 1 | Danh mục ở chế độ mở (`selectionMode=ALL`) |
| Q12 | Ngưỡng tổng hợp **cả năm** (mục II.6) và trần xếp loại (mục II.2(c)) | Có trong CV 2431 nhưng chưa có mô hình dữ liệu | Chưa triển khai |

---

## 7. CHECKLIST UAT ĐƠN GIẢN CHO NGƯỜI DÙNG

**A. Nhật ký công việc** (https://task-cus.vercel.app → *Nhật ký công việc*)
1. Mở *Nhật ký công việc* → thấy thanh bộ lọc: **Hôm nay / Tuần này / Tháng này / Tất cả thời gian**; **Tất cả / Từ kế hoạch / Phát sinh**; **Tất cả / Đang thực hiện / Chậm hạn / Đã hoàn thành**.
2. Bấm "Từ kế hoạch" → phần việc phát sinh biến mất; bấm "Tất cả thời gian" → hiện lại.
3. Thấy 2 khối: **Đầu việc kế hoạch** (hạn, ngày hoàn thành, minh chứng) và **Nhiệm vụ được giao**.

**B. Chấp thuận / giải trình** (menu *Nhật ký công việc → Phê duyệt*, đăng nhập lãnh đạo)
4. Bấm **Chấp thuận** → **phải mở modal xem trước** (mã, người trình, hạn, tiến độ, kết quả, tệp đính kèm) — **không tự duyệt**.
5. Chọn **Đồng ý** → hồ sơ biến mất khỏi danh sách.
6. Chọn **Không đồng ý** → bắt buộc có lý do; nhiệm vụ quay lại *Đang thực hiện*, **kết quả đã ghi của cán bộ không bị mất**.
7. Chọn **Yêu cầu giải trình** → bắt buộc có nội dung; đăng nhập cán bộ → mục **Hồ sơ của tôi** → *Gửi giải trình* → hồ sơ quay lại hàng đợi, **vòng 2**.
8. Bấm *Chấp thuận* lần 2 sau khi đã xử lý → bị từ chối.

**C. Điểm Bảng 1** (menu *Kết quả & báo cáo → Kết quả công tác tháng*)
9. Thấy khối *Điểm tính thử* với **nhãn trạng thái** (Đủ căn cứ / Chưa đủ dữ liệu / Chờ quy tắc / Chưa áp dụng).
10. Mở *Chi tiết từng dòng* → thấy **nguồn hệ số** (QĐ1277 / Danh mục TX / Đã chốt) và các cột G/I/L/N; dòng thiếu hệ số → *Chưa đủ dữ liệu*, **không** có điểm.

**D. Tự đánh giá / xếp loại** (cùng màn *Kết quả công tác tháng*)
11. Khối *Tự đánh giá…*: ô **Gợi ý của hệ thống** = *"Chưa có gợi ý"* + lý do; **bên dưới** có bảng **ngưỡng tham chiếu** (≥90 / 70–<90 / 50–<70 / <50) kèm nguồn CV 2431.
12. Nhập điểm tiêu chí chung (0…30), ưu điểm, hạn chế, mức xếp loại → lưu được.
13. Cán bộ **không** sửa được ô *nhận xét của lãnh đạo*; lãnh đạo sửa được; ô này **để trống mặc định**.
14. Lãnh đạo chọn được **Kết quả xếp loại cuối cùng** (tách khỏi mức đề xuất của cán bộ).

**E. Biểu mẫu** (cùng màn)
15. Khối *Biểu mẫu 01A/01B/02A/02B* → chọn mẫu → **Xem trước** (phải có cảnh báo) → **Tải Excel** → mở file kiểm tra: đúng sheet, đúng số, **chữ ký và nhận xét để trống**, ô thiếu căn cứ ghi *DỰ THẢO*.
16. So 4 file mẫu trong `docs/samples/YC33_37_bieu_mau/` (đã commit) — chỉ dùng để so cấu trúc.

**F. Quan hệ phụ trách** (đăng nhập quản trị → *Quản trị hệ thống → Quan hệ phụ trách*)
17. Thêm quan hệ (người phụ trách / cán bộ / phạm vi / thời hạn) → lưu được; thử tạo **vòng** → bị chặn.
18. Mở *Kết quả công tác tháng* → *Điểm tính thử* của người được phụ trách dùng **bình quân** khi xuất 01B/02B.

**G. Không mất dữ liệu**
19. Danh mục **348** đầu việc, mã `NV-/CNTT-/CBL-/PT-/TH-/DANG-` còn nguyên; hệ số `0` **khác** ô trống; **48** mẫu cũ còn nguyên.
20. Số liệu không đổi: **38** người / **24** tài khoản / **18** nhiệm vụ / **5** kế hoạch / **26** đầu việc / **15** kết quả tháng.

---

## 8. PHẦN CHƯA LÀM (nêu rõ)
- Chưa hiện thực T1–T8 của báo cáo kiểm kê form (theo yêu cầu "khảo sát, chưa triển khai tái cấu trúc").
- Chưa triển khai mẫu 2C/2D/2E (ngoài phạm vi đã giao).
- Chưa tự áp dụng ngưỡng xếp loại, công thức quý, tổng hợp cả năm, trần xếp loại.
- Chưa có bảng dữ liệu quan hệ phụ trách thật (chờ Hải quan xác nhận cơ cấu).
