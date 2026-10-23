# TALUNG-CUS-WORK V3 — MASTER PLAN PHÁT TRIỂN SONG SONG YC-01 → YC-13

**Phiên bản:** 1.0 — 23/10/2026  
**Loại tài liệu:** Sổ tay điều phối / nguồn tham chiếu chung (*single source of truth*) cho nhiều session OpenCode  
**Đường dẫn đề xuất trong repository:** `docs/V3/MULTI_SESSION_MASTER_PLAN_YC01_YC13_2026-10-23.md`  
**Phạm vi:** Lập kế hoạch, số liệu giao ban, nhiệm vụ/phê duyệt, lịch trực; bảo đảm tương thích thiết kế V3  
**Trạng thái:** ĐƯỢC PHÉP CHUẨN BỊ WORKTREE VÀ TRIỂN KHAI CÓ KIỂM SOÁT NHỮNG PHẦN ĐÃ RÕ — **KHÔNG PHẢI LỆNH MERGE/DEPLOY PRODUCTION**

> **LỆNH DÀNH CHO S0 / OPENCODE (đọc trước):** Không làm toàn bộ YC-01 → YC-13 trong một session. Đọc hết tài liệu này, kiểm tra git/nhánh/commit thực tế, dựng các worktree tách biệt, phân công phạm vi và điều phối các session. Chỉ lập trình các phần được đánh dấu **IMPLEMENT ĐƯỢC**; những quyết định còn mở chỉ phân tích và đề xuất. Sau mỗi session, S0 tiếp nhận báo cáo, hợp nhất có kiểm soát và cập nhật trạng thái vào mục 13 của **chính file này**. Không sửa Production, không tự merge vào `main`, không tự deploy.

---

## 1. Mục đích và nguyên tắc điều hành

1. Rút ngắn tiến độ bằng các session OpenCode độc lập, mỗi session có **Git worktree + nhánh riêng + phạm vi sở hữu rõ ràng**.
2. Không để nhiều agent sửa chung thư mục làm việc, dùng chung database kiểm thử có ghi dữ liệu hoặc tự thay đổi những service giao nhau.
3. Giữ quyết định nghiệp vụ Hải quan, tính toàn vẹn dữ liệu, phân quyền, kiểm thử và lịch sử phê duyệt làm ưu tiên cao hơn tốc độ merge.
4. Tách ba loại công việc: **(a) bug/rủi ro đã có căn cứ**, **(b) tính năng với quy tắc đã chốt**, **(c) câu hỏi nghiệp vụ chưa chốt**.
5. Chỉ session **S0 (Integration Owner)** được hợp nhất nhánh vào `integration`. Không session nào được merge hoặc push trực tiếp vào `main`, chạy migration hay triển khai Production.
6. File này lưu **trạng thái đã biết tại thời điểm lập tài liệu**; SHA Production, trạng thái database, quyền thực tế và test mới nhất phải được xác minh lại, không lấy dữ liệu trong tài liệu làm bằng chứng runtime.

### Tham chiếu bắt buộc

- `TALUNG_CUS_WORK_V3_YC01_YC07_REVIEW_YC03_05_V1_1_2026-10-23.md`: chốt phạm vi YC-01 → YC-07, quyết định còn mở, ví dụ số liệu giao ban.
- `TALUNG_CUS_WORK_V3_PHASE_A_ACCEPTANCE_2026-10-23.md`: báo cáo nghiệm thu kỹ thuật Phase A (YC-03/04/05).
- Báo cáo OpenCode **“BÁO CÁO REVIEW YC-08 → YC-13”**, ngày 23/10/2026: nguồn phát hiện Task approval, người phối hợp, chấm chất lượng, tuyến nhóm, lịch sử, lịch trực. Nếu chưa tồn tại trong repo, **S0 đưa bản báo cáo được chủ dự án cung cấp vào `docs/V3/REVIEW_YC08_YC13_2026-10-23.md`**; không tự sáng tác nội dung hay coi bản tóm tắt trong file này thay thế toàn bộ bằng chứng.
- Đặc tả/ADR V3 hiện có (`docs/V3/`, `V3_MASTER_SPEC.md`, `DECISIONS.md` nếu tồn tại trong repo): ưu tiên các quyết định **đã phê duyệt**, không dùng đề xuất của agent để thay thế.

> **Mức độ tin cậy:** Review YC-08 → YC-13 là **review mã nguồn, không xác minh live Production**. Các cảnh báo về `person_supervisions=0`, thiếu lịch sử, quyền legacy... phải kiểm chứng bằng code/test và (nếu cần) read-only Production trước khi phát biểu về tình trạng vận hành thực tế.

---

## 2. Ảnh chụp trạng thái dự án (không được quên)

| Hạng mục | Trạng thái được báo cáo đến 23/10/2026 | Hành động kế tiếp |
|---|---|---|
| **Phase A / YC-03–05** | Đã code trên `codex/v3-phase-a-planning-2026-10-23`; commit triển khai `2f20dce`, commit báo cáo `9534c6a`. **Chưa deploy Production.** | S1 chuẩn bị release readiness; S0 tích hợp sau gate. |
| **Phase A — kiểm thử** | 255/255 trường hợp được liệt kê đã PASS (gồm 13 UI Desktop/Mobile); typecheck/Prisma validate/build PASS. **Không khẳng định** 471 test lịch sử đã chạy lại. | Chạy regression thích hợp sau merge; hoàn thiện 2 test còn chặn. |
| **Phase A — 2 bộ chưa chạy trọn** | `test-yc23-25-api.ts` vướng credentials fixture; `test-v3-evidence-adjustment.ts` gặp Storage 503 fail-closed khi thiếu cấu hình bucket private. | Dùng fixture/storage test riêng, không hạ bảo mật. |
| **Phase A — migration** | `prisma/migrations/20261023120000_v3_phase_a_planning/`: unique `(person_id,idempotency_key)`; đặt khóa trùng cũ thành NULL, không xóa nội dung. Chỉ rehearsal trên `talung_v3_fixture`. | Xem trạng thái migration lịch sử và rehearsal trên schema snapshot trước khi release. |
| **YC-01/02 — Phase B** | Đã chốt nhập giá trị gốc và tự tính %; quy tắc kỳ trước/cùng kỳ, quyền chi tiết và dữ liệu lịch sử **chưa chốt**. | S2 implement phần không phụ thuộc quyết định mở; không tính chính thức khi thiếu căn cứ. |
| **YC-06/07 — Phase C** | Đã chốt ý nghĩa ô trống và % chỉ tiêu giao; dùng chung dữ liệu/kỳ/quyền với B. | S3 chốt contract cùng S2 **trước khi** sửa API/schema chung. |
| **YC-08–13** | OpenCode **đã review read-only**; phát hiện lỗi/thiếu chức năng, chưa implement. | S4 xử lý Task/approval phần đã rõ; S5 xử lý Lịch trực; S6 phân tích các quy tắc chưa chốt. |
| **Production** | Đã từng reset dữ liệu cũ, nạp nền; báo cáo sức khỏe tại commit cũ không thể coi là SHA hiện tại. | S0 phải truy vấn health + đối chiếu `origin/main` (read-only). **Không reset lại.** |

**Không tự kết luận Production có một tài khoản duy nhất:** Sau reset, thông tin nhân sự/tài khoản có thể đã được cấu hình tiếp. Phải xem trạng thái thật bằng quyền hợp lệ.

---

## 3. Sơ đồ session và quy tắc sở hữu

```text
                        origin/main (bảo vệ)
                               │
                               ▼
                  S0 — integration + QA chung
                       (worktree riêng)
            ┌──────────┬─────────┼──────────┬──────────┐
            ▼          ▼         ▼          ▼          ▼
         S1 / A     S2 / B    S3 / C     S4 / D     S5 / E
        Phase A     YC01/02   YC06/07    YC08/09/12   YC13
        QA/Release  Giao ban  Chỉ tiêu   Task/review   Lịch trực
            │          │         │          │          │
            └──────────┴─────────┼──────────┴──────────┘
                               ▼
                 Integration → Test → UAT
                               │
                        Release gate riêng
                               │
                          Production

        S6 — YC09 đầy đủ / YC10 / YC11: SPEC/DECISION ONLY,
             không merge code cho tới khi chủ dự án chốt.
```

| Session | Trách nhiệm | Mức triển khai | Nhánh đề xuất | Sở hữu chính / hạn chế |
|---|---|---|---|---|
| **S0 — Coordinator** | Chốt commit nền, worktree, merge, conflict, regression, migration rehearsal, lịch bàn giao | Điều phối, không sửa nghiệp vụ thay session | `codex/v3-integration-yc01-13` | Độc quyền merge; cập nhật file master; quyết định thứ tự tích hợp |
| **S1 — Phase A QA** | Nghiệm thu kỹ thuật YC-03/04/05, fixture, migration/rollback, test còn thiếu | Test/fix phạm vi A; không deploy | Nhánh A đang có, hoặc nhánh QA riêng dựa trên nó | `/plans`, `personal-work-items`, `work-item-products` cùng migration A. Thông báo S0 trước khi đụng review service dùng chung. |
| **S2 — Phase B** | YC-01/02: Thu NSNN, giá trị gốc, khối so sánh | Implement phần đã chốt | `codex/v3-phase-b-revenue` | Thu NSNN, so sánh tại Dashboard và `/giao-ban`; **đầu mối hợp đồng dữ liệu chỉ tiêu giao ban** |
| **S3 — Phase C** | YC-06/07: trạng thái dữ liệu, chỉ tiêu giao, tỷ lệ | Contract trước, code sau khi S2/S0 đồng ý | `codex/v3-phase-c-metrics` | Các nhóm số liệu giao ban và giao chỉ tiêu; **không đồng thời sửa schema/API chung khi chưa chốt contract** |
| **S4 — Task & approval hardening** | YC-08; YC-09 sửa lỗi an toàn; YC-12 lịch sử phần đã rõ | Implement trên nhánh riêng | `codex/v3-task-approval-history` | Độc quyền sửa `approval-case`, legacy Task route, `TaskUpdate`, approvals/reviews trong làn này |
| **S5 — Duty Roster** | YC-13: bỏ icon lỗi, ghi chú, audit | Implement trên nhánh riêng | `codex/v3-roster-notes` | `/roster`, API rosters, `DutyRoster.notes`; không thay logic trực trưa/Excel nếu chưa duyệt |
| **S6 — Business design** | YC-09 mô hình per-person; YC-10 đánh giá chất lượng; YC-11 kiểm tra/trình duyệt nhiều cấp | **SPEC ONLY** | `codex/v3-approval-rules-spec` (nếu cần) | Viết phương án/ma trận quyền/migration proposal; **không tạo schema, không code nghiệp vụ chưa chốt** |

### Giới hạn xung đột quan trọng

- **S2 và S3**: có khả năng cùng sửa các thành phần `/giao-ban`, Dashboard, metric definitions, cấu hình chỉ tiêu, báo cáo và quyền. S0 chỉ định **S2 sở hữu hợp đồng dữ liệu chung** trước; S3 xây phần độc lập / mocks rồi mới tích hợp.
- **S1 và S4**: có thể cùng đụng `src/server/work-item-review.ts`, phê duyệt và test chống tự duyệt. S1 ưu tiên kiểm thử/đọc; **S4 sở hữu hardening các Task approval route**. Mọi sửa service dùng chung cần S0 đồng ý.
- **S4 và S6**: S4 tuyệt đối không bổ sung `qualityPercent`, `team`, `stage`, mô hình assignee mới chỉ theo bản đề xuất của S6 khi **chưa có quyết định nghiệp vụ**.
- **S5** ít phụ thuộc các nhóm còn lại, nên triển khai độc lập trước và đưa lên integration theo gate.

---

## 4. Phạm vi & nghiệm thu từng nhóm YC

### 4.1 YC-01 / YC-02 — S2 (Phase B, IMPLEMENT ĐƯỢC PHẦN ĐÃ CHỐT)

**YC-01:** Đưa “So sánh kết quả thu NSNN” lên **Bảng điều hành**, nhất quán với `/giao-ban`; có năm dòng: BTC, UBND tỉnh, kế hoạch tháng HQTL, tháng trước, cùng kỳ năm trước.

**YC-02:** Người có thẩm quyền nhập **giá trị gốc**, hệ thống tự tính %; lưu kỳ, phạm vi, đơn vị, căn cứ, lịch sử thay đổi, trạng thái nhập/xác nhận/chốt. Không gán quyền `system.config` rộng chỉ để nhập nghiệp vụ.

**Ví dụ đối chiếu từ Excel ngày 22/10/2026 (không phải dữ liệu để seed):**

- BTC năm 2026: **1.685 tỷ đồng**, tỷ lệ minh họa **78,18%** trên lũy kế năm **1.317.372.334.554 đồng**.
- UBND tỉnh: **1.700 tỷ đồng**, tỷ lệ **77,49%**.
- Kế hoạch tháng 10/2026: **200 tỷ đồng**, tỷ lệ **109,67%** trên lũy kế tháng **219.341.201.856 đồng**.
- Phát sinh ngày 22/10: **17.125.059.690 đồng**.
- So tháng trước **+30,07%**, cùng kỳ 2025 **−29,37%** chỉ là số trên Excel; **không hard-code, không công bố như công thức đã chốt**.

**Guard:** Không cộng lũy kế như FLOW ngày; không tự sửa ba dòng `THU_NSNN` Production từng bị nghi nhập lũy kế năm vào ngày 23/10. Không có dữ liệu/kỳ hợp lệ hoặc mẫu số bằng 0 thì trả **“Chưa có dữ liệu/Chưa xác định”**, không bịa %.

**Acceptance:** 3 tỷ lệ đầu tái hiện được bằng input fixture; hiển thị ngày chốt, đơn vị, nguồn; 2 mục kỳ trước/cùng kỳ vẫn chờ quy tắc đối chiếu nếu không đủ dữ liệu; quyền và audit hoạt động; Desktop/Mobile đủ khả năng xem/nhập theo phân quyền.

### 4.2 YC-03 / YC-04 / YC-05 — S1 (Phase A, ĐÃ CODE — QA TRƯỚC RELEASE)

Không viết lại Phase A; đánh giá nhánh `codex/v3-phase-a-planning-2026-10-23` đúng commit đã báo cáo.

- Chọn/tạo kế hoạch, hạng mục, add/edit/delete đầu việc trên Desktop/Mobile; `activePlan=null` không mở modal giả.
- Chặn sửa lỗi `completedDate:null` 409; validate người/kỳ/hạng mục/trạng thái; chống double submit bằng idempotency.
- Bộ chọn TX/QĐ1277 thống nhất; nhiều sản phẩm/công việc, không suy hệ số/điểm; giữ 5 nhóm Excel và 6 nhóm TX độc lập.
- Không tạo trực tiếp trạng thái `COMPLETED`; tách hoàn thành thực tế với lãnh đạo xác nhận; không tự duyệt/fallback; `SUBMITTED` khóa nội dung.
- Diễn tập migration bằng bản sao đúng schema Production hiện có; kiểm tra `_prisma_migrations` vì lịch sử có thể dùng `prisma db push`; backup các idempotency key trước khi NULL hóa.

**Gate riêng:** 2 test chưa chạy trọn cần xử lý bằng fixture hợp lệ và Storage riêng fail-closed; regression sau merge; UAT tạo/chọn/sửa/gửi/trả lại trên các role thật giả lập. D1/D6/D8/D9 tiếp tục chờ chốt, không tùy tiện làm mới Plan scope cá nhân.

### 4.3 YC-06 / YC-07 — S3 (Phase C, CONTRACT TRƯỚC)

- **YC-06:** Phân biệt `CHƯA_NHẬP`, `CHƯA_ĐỦ_KỲ`, `KHÔNG_PHÁT_SINH` (0 có xác nhận), `ĐÃ_NHẬP`, `ĐÃ_XÁC_NHẬN/CHỐT`, `KHÔNG_ÁP_DỤNG`. Không coi dấu trống là 0. Tổng hợp ngày/tuần/tháng/quý/năm phải hợp kiểu FLOW/snapshot và kỳ áp dụng.
- **YC-07:** Cho người có quyền nhập **giá trị chỉ tiêu giao** theo mã, kỳ, phạm vi, đơn vị tính; tự tính `% thực hiện = giá trị thực hiện hợp lệ / chỉ tiêu giao hợp lệ × 100`. Không ép mọi chỉ tiêu đều có chỉ tiêu giao. Không tự gắn đánh giá màu “đạt/vượt” với chỉ tiêu càng thấp càng tốt nếu thiếu quy tắc.
- Chốt hợp đồng dữ liệu **bằng văn bản giữa S2 + S3 + S0** trước khi sửa API/schema/permission dùng chung.
- Acceptance dùng dữ liệu giả lập cho các trạng thái thiếu/không phát sinh/không áp dụng; không đếm thiếu ngày sai kỳ; tỷ lệ không ra 0% khi thiếu mẫu số.

### 4.4 YC-08 — S4 (IMPLEMENT ĐƯỢC)

- Trên màn hình nhiệm vụ của công chức, tách: **tiến độ thực hiện**, **đã báo hoàn thành**, **chờ lãnh đạo**, **được duyệt**, **bị trả lại**.
- Phê duyệt/trả lại trong `ApprovalCase` phải phản ánh vào lịch sử `TaskUpdate`/projection nhất quán, kèm người, thời gian, ý kiến/lý do, thông báo cho chủ trì và phối hợp theo quyền.
- Không tự reset 100% hoặc tự coi `Task.status=COMPLETED` là bằng chứng một quyết định duyệt nếu thiếu hồ sơ xác nhận hợp lệ.
- Cần xử lý stale UI và deep link tới nhiệm vụ; không làm sai nội dung nhật ký cũ.

### 4.5 YC-09 — S4 (HOTFIX AN TOÀN); S6 (SPEC PHẦN MỞ)

**ĐƯỢC SỬA NGAY:**

1. API không được trả thành công khi `actualResultText` do người phối hợp gửi đã bị bỏ qua.
2. Người phối hợp không được ghi đè kết quả chung, sửa danh sách người nhận việc, hủy Task hoặc tự nộp thay người chủ trì qua các API legacy.
3. Whitelist chuyển trạng thái và thẩm quyền ở server. Test mọi route `tasks`, `tasks/[id]`, `tasks/[id]/updates` và quick approve.
4. Chặn tự duyệt mọi đường. **Test phải so sánh đúng trạng thái thực `AGREED`, không nhầm `APPROVED` dẫn tới PASS giả.**

**CHỜ CHỐT:** Cả chủ trì và phối hợp được **phản hồi kết thúc phần việc của riêng mình** theo yêu cầu lãnh đạo; mô hình per-assignee, ai được nộp kết quả chung, khi nào tổng hợp, có đợi toàn bộ người phối hợp hay không. Không coi hotfix (chặn nộp thay) là đã hoàn tất YC-09.

### 4.6 YC-10 — S6 (SPEC ONLY)

Lãnh đạo yêu cầu các mức **65%, 70%, 75%, 80%, 85%, 90%, 95%, 100%** khi phê duyệt kết quả.

Cần đề xuất và xin duyệt: đánh giá cho Task, kết quả hay từng người; bắt buộc khi đồng ý hay không; người điều chỉnh sau duyệt; lưu lịch sử round; ảnh hưởng bảng điểm công tác và xuất báo cáo. **Chất lượng không đồng nghĩa tiến độ, không tự thay hệ số/điểm QĐ1277, không mặc định 100%.**

Không thêm schema/API quality khi chưa được chốt.

### 4.7 YC-11 — S6 (SPEC ONLY)

Yêu cầu Trưởng/Phó nhóm kiểm tra sơ bộ, trình lãnh đạo đội/cấp có thẩm quyền. Cần làm rõ thực tế tổ chức, thẩm quyền được giao, vai trò kiêm nhiệm, thứ tự kiểm tra/duyệt, xử lý nhiều bộ phận. Không tự tạo `TEAM_LEADER`/`DEPUTY_LEADER`, stage mới hoặc gán tuyến mặc định.

Thiếu tuyến thì **chờ phân tuyến**; cấm tự duyệt; chỉ xác nhận/duyệt theo người được phân quyền thật. `person_supervisions=0` là dữ kiện từ báo cáo/comment cần **xác minh live read-only**, không là cơ sở tự seed.

### 4.8 YC-12 — S4 (IMPLEMENT PHẦN ĐÃ RÕ)

- Sửa badge và nút hành động của `/work-item-reviews` theo `reviewState` thực: đã xác nhận/đã trả lại không còn nút như đang chờ.
- Bổ sung lịch sử người đã xử lý (`reviewedById` / `decidedById` theo schema), không để mất lịch sử do tuyến trực tiếp hiện tại thay đổi khi vẫn có quyền xem hợp lệ.
- `/approvals` có phần “Đã xử lý”; bộ lọc cán bộ và tháng/năm đúng dữ liệu.
- Không mặc định `/work-item-reviews` đã bao gồm Task; nguồn `PersonalWorkItem`, `ApprovalCase`, `WorkItemProduct` phải ghi **rõ nhãn nguồn**, không đếm trùng.
- **CHỜ CHỐT** phạm vi lịch sử tổng hợp tất cả workflow.

### 4.9 YC-13 — S5 (IMPLEMENT PHẦN ĐÃ RÕ)

- Trên Phiếu phân công Lịch trực: **bỏ icon `error` đỏ** theo phản hồi; giữ quy tắc phát hiện trùng/kiêm nhiệm và cảnh báo chữ phù hợp (không biến xung đột thành hợp lệ chỉ vì ẩn icon).
- Thay ô chọn “người thay thế” hiện đang nổi bật bằng ô **“Ghi chú”** gắn người/vị trí đã phân công; dùng `DutyRoster.notes` đã có, lưu/đọc/sửa, audit giá trị cũ-mới.
- Nếu phải đổi người thực tế, giữ một thao tác **“Đổi người” tách riêng**, có lý do và audit, thay vì xóa khả năng đổi người. Điểm này cần được lãnh đạo xác nhận lại trước khi loại bỏ hoàn toàn dropdown cũ.
- Không đổi quy tắc trực trưa; không tự thay template Excel; ghi chú ô chưa có người/in Excel đang **chờ quyết định**.

---

## 5. Sổ quyết định chưa chốt — KHÔNG TỰ QUYẾT

| ID | Quyết định đang mở | Nhóm bị ảnh hưởng | Nguyên tắc trong lúc chờ |
|---|---|---|---|
| **D1** | Có phạm vi kế hoạch cá nhân độc lập không, ai tạo? | A | Dùng quyền hiện có; không tự thêm scope/role. |
| **D6** | Lãnh đạo tạo kế hoạch/giao Task cho cán bộ theo cơ chế nào? | A/D | Không suy hành động giao việc từ filter “Toàn đơn vị”. |
| **D8** | Ý nghĩa “Cột C” theo biểu mẫu gốc/ADR? | A | Không tự đổi ngữ nghĩa dữ liệu. |
| **D9** | Ranh giới `Task` và `PersonalWorkItem` khi phát sinh? | A/D | Giữ hai nguồn, không tính trùng. |
| **B1** | “Tháng trước/cùng kỳ” là cùng số ngày hay cả tháng? | B | Không công bố phần trăm thiếu căn cứ. |
| **B2** | Lịch sử nguồn, nhập bù số lũy kế, quyền nhập/xác nhận/chốt | B/C | Audit, không sửa trực tiếp Production. |
| **C1** | Chỉ tiêu được giao cho nhóm nghiệp vụ nào, chu kỳ và chiều đánh giá? | C | Không áp mục tiêu cho mọi chỉ tiêu. |
| **E8** | Trả lại Task: giữ tiến độ 100% kèm nhãn hay điều chỉnh tiến độ? | D | Không tự reset số liệu. |
| **E9** | Mỗi assignee báo phần mình; owner trình chung; điều kiện đủ để trình | D | Chỉ sửa lỗi bỏ dữ liệu/leo quyền, chưa code per-assignee. |
| **E10** | Chất lượng theo đối tượng nào, bắt buộc, chỉnh sửa, ảnh hưởng điểm/export? | D | 8 mức đã nêu; không mặc định, không nhân QĐ1277. |
| **E11** | “Nhóm”/“đội”/trưởng-phó nhóm là tổ chức nào, ai được trình/kiểm tra/duyệt? | D | Không tự cấp role/tuyến. |
| **E12** | Lịch sử hợp nhất bao gồm những nguồn nào? | D | Sửa lịch sử từng nguồn có căn cứ trước. |
| **E13** | Ghi chú khi ô trống, in Excel, có bỏ hẳn chức năng thay người không? | E | Chỉ chỉnh UI per-person, giữ đổi người có audit. |

> S0 chỉ đánh dấu một quyết định **APPROVED** khi có xác nhận rõ từ chủ dự án/lãnh đạo nghiệp vụ và dẫn đến tài liệu/quyết định đó. Session không thể “chốt” bằng cách đoán từ mã nguồn.

---

## 6. Tổ chức Git Worktree an toàn trên Windows

### 6.1 Preflight S0 — thực hiện trước mọi worktree

Tại thư mục repository chính, chạy **lệnh chỉ đọc**:

```powershell
git status --short
git branch -avv
git worktree list --porcelain
git log -5 --oneline
git fetch origin
git rev-parse origin/main
git rev-parse 2f20dce
git rev-parse 9534c6a
```

Kiểm tra trên Production bằng health **read-only** khi có quyền, so sánh SHA deploy, không coi `origin/main` luôn là phiên bản đang chạy. Không xóa/chuyển `dirty/untracked` hiện hữu; nếu có thay đổi cần ghi nhận chủ sở hữu trước.

### 6.2 Ví dụ tạo worktree (chỉ khi các nhánh/path chưa tồn tại)

```powershell
# Ví dụ chạy từ repository chính; S0 phải kiểm tra path/branch trước.
# Chọn commit nền đã xác minh. KHÔNG mặc định origin/main chứa Phase A.
git worktree add -b codex/v3-integration-yc01-13 ../talung-integration origin/main

# Các session khác nên xuất phát từ CÙNG MỘT commit nền đã thống nhất.
# BẮT BUỘC thay nội dung biến base bằng SHA đầy đủ đã xác minh.
$base = 'REPLACE_WITH_VERIFIED_SHA'
if ($base -eq 'REPLACE_WITH_VERIFIED_SHA') { throw 'Chưa khai báo commit nền. Dừng tạo worktree.' }
git worktree add -b codex/v3-phase-b-revenue ../talung-phase-b $base
git worktree add -b codex/v3-phase-c-metrics ../talung-phase-c $base
git worktree add -b codex/v3-task-approval-history ../talung-task-approval $base
git worktree add -b codex/v3-roster-notes ../talung-roster $base
```

**Không chạy ví dụ nguyên văn nếu branch đã tồn tại.** Worktree Phase A sẵn có thì dùng lại đúng nhánh, không cưỡng ép tạo lại. Nếu Phase A chưa được tích hợp vào commit nền của các nhánh khác, S0 chọn thời điểm merge/rebase rõ ràng để tránh xây trên API/schema cũ. Không dùng `git reset --hard`, `git clean -fd`, `--force` hoặc ép overwrite thay đổi của người khác.

### 6.3 Mỗi session phải cách ly runtime

- Chạy OpenCode với **working directory trỏ đúng worktree**; không dùng một session ở folder chính rồi đổi branch giữa chừng.
- Mỗi session có `PORT` khác nhau, database fixture khác nhau hoặc schema/cơ sở dữ liệu kiểm thử cách ly thật, seed giả lập và chỉ dùng credentials test.
- `.env` phải được cấp riêng, không tự sao chép `.env` Production. Không in credentials/secret vào log/báo cáo/Git.
- Preview/Vercel **không được dùng chung DATABASE_URL Production**; nếu chưa bảo đảm tách biệt thì không deploy Preview.
- Không gọi API Production có ghi dữ liệu, không chạy `prisma db push`, `migrate deploy`, seed, purge, reset trên Production.
- Không sửa/tắt fail-closed Storage hoặc mở rộng quyền System Admin để làm test PASS.

---

## 7. Quy trình giao việc và báo cáo giữa session

### Bước khởi động (bắt buộc cho mọi session)

1. Đọc file master này từ đầu đến cuối.
2. Đọc tài liệu nguồn của nhóm YC mình phụ trách; xác minh branch/SHA và code hiện có trong worktree.
3. Gửi S0: `SESSION_ID`, `BRANCH`, `BASE_SHA`, module sở hữu, phần giao nhau, test dự kiến, quyết định còn chờ.
4. Không sửa module thuộc session khác khi chưa có chấp thuận bằng văn bản trong session S0.

### Bàn giao mỗi đợt code

Mỗi session gửi báo cáo theo khung sau (lưu trong nhánh riêng dưới `docs/evidence/multi-session/` nếu phù hợp, nhưng **không cùng chỉnh file master**):

```text
SESSION: Sx
YC: ...
BRANCH: ...
BASE_SHA: ...
COMMIT_SHA: ...
FILES_CHANGED: ...
SCHEMA_OR_MIGRATION: ...
TESTS_PASS: tên bộ / số pass / số fail
TESTS_NOT_RUN: tên bộ / lý do / tác động
UI_EVIDENCE: path + màn hình
SECURITY_CHECKS: ...
DECISIONS_PENDING: ...
CONFLICT_EXPECTED: ...
PRODUCTION_TOUCHED: NO (bắt buộc)
READY_FOR_INTEGRATION: YES/NO + điều kiện
```

S0 cập nhật **mục 13** sau khi xác minh, không chỉ chép tuyên bố “PASS” từ session.

---

## 8. Thứ tự tích hợp/merge đề xuất

1. **S0 preflight và xác minh Phase A.** Chọn baseline thống nhất; merge Phase A vào nhánh `integration` **chỉ sau khi** kiểm tra diff, migration và báo cáo QA. Đây không phải merge vào `main`.
2. **S5 / YC-13** có thể tích hợp sớm do ít giao file; chạy regression roster/audit và toàn bộ typecheck/build liên quan.
3. **S4 / YC-08 + lỗi an toàn YC-09 + YC-12** sau khi khóa ownership của approval service; review kỹ trường hợp legacy route, tự duyệt và quyền collaborator. Không trộn tính năng quality/tuyến chưa chốt.
4. **S2 / YC-01/02** sau khi hợp đồng số liệu với S3 được đóng băng; xác minh tính FLOW/lũy kế và quyền.
5. **S3 / YC-06/07** trên hợp đồng đã thống nhất; conflict `/giao-ban`/Dashboard xử lý bằng review logic, không nhận “ours/theirs” mù quáng.
6. **S6 / YC-09 full, YC-10/11** chỉ chuyển thành implementation sau khi có quyết định chính thức; sẽ có nhánh triển khai khác hoặc mở PR riêng.
7. Mỗi merge hoàn thành một vòng kiểm thử tự động + kiểm tra quyền, audit, migration và UAT liên quan. Không tích hợp một loạt rồi mới phát hiện sai.

**Quy trình merge:** fetch → review diff/commits → đối chiếu chủ sở hữu file → merge vào integration → giải quyết conflict có người chịu trách nhiệm → test → ghi SHA / kết quả → mới nhận nhánh kế tiếp. Không `git push --force` lên `main`.

---

## 9. Ma trận kiểm thử bắt buộc sau tích hợp

| Nhóm | Test bắt buộc / tình huống nghiệp vụ |
|---|---|
| **Baseline** | `tsc --noEmit`, `prisma validate`, `npm run build`, các bộ regression hiện hành; **liệt kê chính xác bộ nào đã chạy**, không gộp con số 255 với 471 lịch sử. |
| **Phase A** | Tạo/chọn kế hoạch + hạng mục; sửa 409; thêm nhiều QĐ1277; no self-approval; `SUBMITTED` lock; Mobile; idempotency; migration rehearsal. |
| **Task/YC-08** | AGREE/REJECT/CLARIFY qua từng API/đường legacy cho cùng projection lịch sử; owner/collaborator thấy trạng thái thật; 100% không bị nhầm là đã duyệt; người trả lại và lý do lưu đúng. |
| **Security/YC-09** | Chủ nhiệm không tự duyệt bất kỳ path nào; assertion `AGREED` đúng; collaborator không ghi đè kết quả, hủy task, đổi assignee; API không báo thành công khi bỏ dữ liệu. |
| **History/YC-12** | Tab chờ/đã duyệt/trả lại; lịch sử theo người ra quyết định không mất khi thay đổi tuyến nếu còn quyền hợp lệ; không hiển thị hành động duyệt trên hồ sơ đã xử lý; tìm theo tên/kỳ chính xác. |
| **Roster/YC-13** | Notes per-person lưu/đọc/sửa; audit old/new; bỏ icon không bỏ guard/cảnh báo cần thiết; đổi người có lý do; trực trưa riêng; không phá in phiếu/Excel. |
| **Giao ban B/C** | Chỉ tiêu BTC/UBND/tháng tính từ số liệu gốc; không hard-code; thiếu khác 0; FLOW vs lũy kế; cùng kỳ chưa chốt hiển thị phù hợp; auth/audit; nhiều kỳ/năm; zero denominator; Desktop/Mobile. |
| **Migration** | Schema diff, lịch sử `db push` / migrations; test áp dụng lên bản sao schema và dữ liệu gần nhất; rollback giữ dữ liệu; không chạy DDL Production khi chưa có release. |
| **Storage/Minh chứng** | Giữ fail-closed và phân quyền; fixture/test config độc lập. Không coi 503 là lý do bỏ xác minh bảo mật. |

**Tiêu chí chặn merge/release:** bất kỳ lỗi P0/leo quyền/tự duyệt, test hồi quy thất bại chưa giải thích, thay đổi schema không có diễn tập, frontend/backend contract lệch, dữ liệu fixture không cách ly hoặc quyết định nghiệp vụ chưa chốt nhưng đã bị hard-code.

---

## 10. Phân biệt Integration, Preview, Production

- **Dev/Worktree:** Agent được sửa code, commit trên nhánh riêng, test bằng fixture; không tác động môi trường khác.
- **Integration:** S0 hợp nhất và kiểm thử; không phải Production, có thể chưa được nghiệm thu bởi người dùng.
- **Preview/UAT:** Chỉ dùng database và tài khoản kiểm thử riêng; phản ánh đúng phân quyền thật nhưng dữ liệu giả lập. UAT do chủ dự án chấp thuận.
- **Production:** Chỉ merge/release theo lệnh riêng sau review bảo mật, migration rehearsal, backup mới nhất, rollback plan, smoke/UAT và chốt SHA. **File này không cấp phép phát hành.**

Một số yếu tố cần nhớ: Production đã từng reset dữ liệu nghiệp vụ cũ; **không được reset lại** để hợp thức hóa demo/test; có rủi ro Storage còn tồn đọng, không được tự mở tệp hoặc nới quyền vì phục vụ Preview.

---

## 11. Quyết định kỹ thuật khi có xung đột

1. Phát hiện cùng một file được hai session sửa: S0 tạm dừng merge nhánh sau, yêu cầu hai session mô tả lý do và API contract; chọn một owner rồi xử lý bằng cherry-pick/merge có kiểm chứng.
2. Migration trùng: S0 đối chiếu tên thư mục, thứ tự migration và trạng thái thật DB thử nghiệm; không tự đổi migration đã từng apply vào môi trường khác mà thiếu kế hoạch.
3. Một session thất bại test do fixture: báo `BLOCKED_BY_FIXTURE` riêng, không tự sửa password/tài khoản thật hoặc làm test luôn trả PASS.
4. Phát hiện lỗ hổng ở một session khác: báo ngay S0; có thể tạo hotfix branch riêng, không dùng việc đó làm lý do phá ownership ở nhánh hiện tại.
5. Nếu phát hiện một YC mới ảnh hưởng các session: S0 cập nhật file master **theo phiên bản** và thông báo toàn bộ session trước khi mở rộng phạm vi.

---

## 12. Prompt khởi động sử dụng file này

### Gửi cho S0 — Integration Owner

> Đọc toàn bộ `docs/V3/MULTI_SESSION_MASTER_PLAN_YC01_YC13_2026-10-23.md`. Đây là tài liệu gốc của dự án multi-session. Trước tiên thực hiện preflight chỉ đọc, đối chiếu nhánh Phase A và SHA Production, kiểm tra dirty files. Lập sơ đồ worktree, branch, quyền sở hữu file, baseline và cơ chế cô lập DB; tạo worktree an toàn sau khi kiểm tra không trùng. Phân việc S1–S6 theo bảng, yêu cầu mỗi session đọc file master. Nhận handoff từng session, chỉ S0 merge vào integration và chạy test; cập nhật mục 13. Không tự deploy Production. Nếu có quyết định nghiệp vụ mở, ghi PENDING chứ không tự code.

### Gửi cho một session chức năng

> Bạn là **Sx — [TÊN SESSION]**. Làm việc **chỉ trong worktree/branch riêng** do S0 cấp. Đọc đầy đủ file `docs/V3/MULTI_SESSION_MASTER_PLAN_YC01_YC13_2026-10-23.md`, tài liệu gốc liên quan và trạng thái repo hiện tại. Thực hiện đúng mục 4 của nhóm YC được giao; không thay đổi module thuộc session khác hoặc triển khai phần PENDING. Chạy bộ test liên quan, commit riêng và bàn giao đúng mẫu mục 7 cho S0. Không merge main, không deploy, không ghi Production.

---

## 13. BẢNG THEO DÕI LÂU DÀI — S0 DUY NHẤT CẬP NHẬT

> Mục đích: mỗi lần mở session mới, Agent có thể đọc ngay tình trạng hiện hành thay vì hỏi lại hoặc tự suy từ lịch sử hội thoại. Dòng dưới là **trạng thái khởi tạo**, phải được S0 cập nhật khi có bằng chứng commit/test mới.

| Session | Trạng thái 23/10/2026 | Branch thực tế | SHA mới nhất | Test/UAT | Chặn / quyết định | Ready merge? |
|---|---|---|---|---|---|---|
| S0 — Integration | **Integration Manager**; đã merge S1/S3-partial/S4/S5/S6-plan; S2 blocked | `codex/v3-integration-yc01-13` | `7d86639` | Phase A 37/37, S4 40/40, no-self 5/5, review 38/38, YC37 25/25, e2e 40/40, S3 96/96, roster API 22/22; build PASS | S2 Q9/Q11 blocker; S3 full waits S2; S6 implementation branch after S4 | N/A — không merge `main`/không release |
| S1 — Phase A QA | **MERGED**; DB `talung_v3_phase_a_qa`, port 3111 | `codex/v3-phase-a-qa` | `3708672` | Báo cáo 313/313; S0 rerun Phase A 37/37; release gate pending | Production audit/backup + UAT + lệnh release | N/A — đã merge |
| S2 — Phase B | **BLOCKED_BY_CONTRACT_ALIGNMENT**; DB `talung_v3_phase_b`, port 3112 | `codex/v3-phase-b-revenue` | `207dcfc` | 34/34 API + 14/14 UI báo cáo; chưa merge | **Q9**: DEMO label phải thay bằng `isOfficial/dataSource`; **Q11/YC-02**: API 1 chữ số phải thành 2 chữ số; B1/B2/C1 PENDING | NO |
| S3 — Phase C | **PARTIAL MERGED**; helper + target UI mock; target-only chờ S2 schema | `codex/v3-phase-c-metrics` | `3ec7b9e` | S0 rerun **96/96 PASS**, tsc/build PASS; không schema/API | Q1–Q12 đã chốt; Q3=A (S2 owns schema); Q6 per-code semantics PENDING | N/A — partial; full waits S2 |
| S4 — Task Approval | **MERGED — STANDBY**; không code thêm; DB `talung_v3_task_approval`, port 3114 | `codex/v3-task-approval-history` | `56a8d68` | S0 rerun 40/40 + 5/5; review 38/38; YC37 25/25; e2e 40/40; sẵn sàng rerun khi S0 yêu cầu | E8/E9/E12 PENDING; không quality/team/stage/per-assignee; không merge main/không Production | N/A — đã merge, standby |
| S5 — Roster | **MERGED**; DB `talung_v3_roster`, port 3115 | `codex/v3-roster-notes` | `2bc645d` | Báo cáo 22/22 API + 24/24 UI; S0 rerun 22/22 + 24/24 | E13 ghi chú ô trống/Excel PENDING | N/A — đã merge |
| S6 — Business Spec | **PLAN MERGED**; docs-only, không DB/port | `codex/v3-approval-rules-spec` | `21c37ae` | Docs-only; spec + 3-phase implementation/migration/test plan | P1/Q1/R1 + E9/E10/E11/P-1..P-5 APPROVED; implementation branch after S4 | N/A — plan merged |

### Nhật ký tích hợp (S0 điền sau, không xóa lịch sử)

| Thời điểm | Session/YC | Base → Head SHA | Commit nhận | Kiểm thử sau merge | Kết quả | Người xác minh |
|---|---|---|---|---|---|---|
| 23/10/2026 | Khởi tạo kế hoạch | — | — | — | Chưa có merge theo tài liệu này | — |
| 23/10/2026 | S0 — Phase A baseline | `origin/main 4c7eb52` + Phase A `9534c6a` → `a68d31e`; docs `c10c643` | `a68d31e` merge `--no-ff` | `tsc --noEmit` PASS; `prisma validate` PASS; `pnpm build` PASS; Phase A 37/37; no-self 5/5; multi-product 36/36 trên `talung_v3_fixture_integration` | **PASS baseline** — chưa release, 2 bộ test Phase A còn chặn theo báo cáo | S0 |
| 23/10/2026 | S0 — start signal S1–S6 | `244aa49` → `50daed3` | `50daed3` docs | DB từng worktree: localhost, đúng `talung_v3_*`, 24 accounts; docs hash identical; no Production | **READY** S1/S2/S4/S5/S6; **WAIT_CONTRACT** S3 | S0 |
| 23/10/2026 | S0 — review S3/S6 handoff | `6cacc50` → `8af7a66` (S3), `af197d7` (S6) | Không merge | S3 pure test 43/43 + tsc PASS; S6 docs-only; không schema/API | **S3 WAIT_CONTRACT**; **S6 SPEC COMPLETE**; quyết định nghiệp vụ còn chờ | S0 |
| 23/10/2026 | S0 — chủ dự án chốt decisions | — | Decision log `S0_DECISION_LOG_2026-10-23.md` | Không code; chỉ ghi nhận quyết định | **S3 CONTRACT APPROVED**; **S6 DECISIONS APPROVED**; implementation có cổng | S0 + chủ dự án |
| 23/10/2026 | S5 — YC-13 roster | `6cacc50` → `2bc645d` | `532c3f6` merge `--no-ff` | S5 API 22/22 + UI 24/24; build integration PASS | **MERGED** | S0 |
| 23/10/2026 | S4 — YC-08/09/12 | `6cacc50` → `56a8d68` | `5d5c299` merge `--no-ff` | S4 hardening 40/40 + no-self 5/5 trên integration; build PASS | **MERGED** | S0 |
| 23/10/2026 | S1 — Phase A QA | `6cacc50` → `3708672` | `06c5d19` merge `--no-ff` | S0 rerun Phase A 37/37; S1 báo cáo 313/313 + migration rehearsal 14/14 | **MERGED — QA gate pending release** | S0 |
| 23/10/2026 | S0 — regression sau merge S1/S4/S5 | `06c5d19` | — | Phase A 37/37; S4 hardening 40/40; no-self 5/5; review-flow 38/38; YC37 25/25; e2e 40/40; roster API 22/22; tsc/prisma validate/build PASS | **PASS** — S2 vẫn blocked | S0 |
| 23/10/2026 | S3/S6 — cập nhật sau decisions | S3 `3ec7b9e`; S6 `21c37ae` | Chưa merge | S3 96/96 + tsc PASS; S6 docs/plan only | **PARTIAL/PLAN READY** — chờ S2 schema/S4 implementation branch | S0 |
| 23/10/2026 | S3 — partial helper/UI mock | `f0d211c` → `3ec7b9e` | `a1076fd` merge `--no-ff` | S0 rerun 96/96, tsc/prisma/build PASS | **PARTIAL MERGED** — target-only waits S2 | S0 |
| 23/10/2026 | S6 — spec + 3-phase plans | `f0d211c` → `21c37ae` | `7d86639` merge `--no-ff` | Docs-only; no runtime test | **PLAN MERGED** — implementation branch after S4 | S0 |
| 23/10/2026 | S2 — Phase B | `6cacc50` → `207dcfc` | Chưa merge | S2 34/34 + 14/14 báo cáo; S0 thấy contract lệch Q9/Q11 | **BLOCKED** — sửa `isOfficial/dataSource` và 2 chữ số trước | S0 |

> **Bootstrap 23/10/2026:** S1–S6 đã được fast-forward tới `50daed3` (master + runtime matrix + assignment cards + baseline results + start signal). Chưa session nào bắt đầu code. Chỉ S0 được merge vào `codex/v3-integration-yc01-13`; không có merge `main`, không có deploy Production.
>
> **Start signal 23/10/2026:** S1, S2, S4, S5, S6 = `READY TO START`; S3 = `WAIT_CONTRACT`. S0 đã kiểm tra kết nối DB từng worktree: tất cả trỏ `localhost:5432`, đúng database test `talung_v3_*`, không có Production. S6 SPEC ONLY không có DB. Prompt khởi động nằm trong `docs/V3/SESSION_ASSIGNMENTS_2026-10-23.md`.
>
> **Review handoff S3/S6:** S0 đã nhận, không merge code. S3 đạt 43/43 pure test + tsc, không schema/API, giữ `WAIT_CONTRACT`. S6 hoàn tất spec docs-only, chờ E9/E10/E11. Quyết định đã được chủ dự án chấp thuận: `docs/V3/S0_DECISION_LOG_2026-10-23.md`.
>
> **S2 blocker:** B-C-1 hiện lệch Q9 (dùng nhãn `[DEMO]` thay vì `isOfficial/dataSource`) và Q11 (API 1 chữ số thay vì 2). Không merge S2 `207dcfc`; chi tiết: `docs/V3/S2_CONTRACT_ALIGNMENT_BLOCKER_2026-10-23.md`.

### Checklist phát hành cuối

- [ ] Code nhánh integration thống nhất và không còn conflict.
- [ ] Từng YC đã được đối chiếu với quy tắc nghiệp vụ/phạm vi và quyết định còn mở.
- [ ] Không còn lỗi bảo mật tự duyệt, IDOR, collaborator leo quyền.
- [ ] Tất cả test bắt buộc phù hợp đã chạy; báo rõ test chưa chạy, không đánh đồng với PASS.
- [ ] Migration rehearsal + backup + rollback được xác minh trên bản sao tương đồng Production.
- [ ] Preview/UAT bằng dữ liệu giả, tài khoản vai trò thật giả lập hoàn tất.
- [ ] Deployment plan ghi rõ SHA, kiểm tra sau phát hành, phương án hạ phiên bản.
- [ ] **Có lệnh phát hành Production riêng của chủ dự án.**

---

## 14. Các điều cấm không được tự nới

- Không tự duyệt, không fallback cấp duyệt theo chức danh/đơn vị, không tự tạo `person_supervisions` hay ủy quyền.
- `SYSTEM_ADMIN` là vai trò kỹ thuật, không có quyền duyệt nghiệp vụ mặc định; không động credentials `admin.tk` hoặc tài khoản đang dùng.
- Không tự suy hệ số/điểm QĐ1277; một đầu việc có thể có nhiều sản phẩm nhưng phải theo xác nhận hợp lệ.
- Không coi trạng thái `COMPLETED`, tiến độ `100%` hoặc nhật ký “đã nộp” là kết quả đã phê duyệt.
- Không đổi dấu trống/thiếu dữ liệu thành 0 hoặc hard-code kết quả Excel.
- Không bỏ fail-closed Storage, bỏ auth/audit/validation để né 403/409/503 hoặc ép test PASS.
- Không commit secret, file credential, `.env`, dữ liệu cá nhân/nhật ký thật vào Git.
- Không thực hiện reset/purge/seed/migration/deploy trên Production theo tài liệu này.

**KẾT LUẬN:** Đây là bản đồ thực thi duy nhất để S0 điều phối các session. **Song song phát triển, tuần tự hợp nhất có kiểm thử; chỉ phát hành Production khi có lệnh riêng.**
