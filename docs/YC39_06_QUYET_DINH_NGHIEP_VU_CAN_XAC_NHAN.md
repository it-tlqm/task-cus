# YC-39 · BƯỚC 02 — 8 QUYẾT ĐỊNH NGHIỆP VỤ CẦN HẢI QUAN XÁC NHẬN

**Ngày:** 21/10/2026 · **Đi kèm:** `YC39_04` (rủi ro & bản vá) · `YC39_05` (thuật toán quyền) · `YC39_02` (ma trận quyền)

> ⚠️ **Các đề xuất kỹ thuật dưới đây KHÔNG phải quyết định nghiệp vụ đã được phê duyệt.**
> Mỗi mục nêu rõ: hiện trạng · phương án khuyến nghị (kỹ thuật) · phương án thay thế · ưu/nhược · ảnh hưởng quy trình Hải quan · **nội dung bắt buộc xin xác nhận**.

| Mã | Câu hỏi | Mức ưu tiên | Ảnh hưởng |
|---|---|---|---|
| Q-RB1 | Phạm vi dữ liệu của lãnh đạo đơn vị | 🔴 **Chặn P5/G5** | Rộng — quyết định có thu hẹp bypass `UNIT_LEADER` hay không |
| Q-RB2 | Cán bộ có tự giao việc cho nhau không | 🟠 | Ảnh hưởng `tasks.assign` cho `STAFF` |
| Q-RB3 | Ai quản trị vai trò; thứ tự ưu tiên khi nhiều vai trò | 🔴 | Chặn G6 (UI) + M5 |
| Q-RB4 | Quy trình ủy quyền khi lãnh đạo vắng mặt | 🟠 | Chặn phần ủy quyền (G7) |
| Q-RB5 | Cán bộ tự ghi nhận việc theo chỉ đạo ngoài hệ thống | 🟡 | Nhãn nguồn + `tasks.create` |
| Q-RB6 | Bình luận/minh chứng bổ sung trên nhiệm vụ đã nghiệm thu | 🟠 | Đang **chặn** (fail-closed) |
| Q-RB7 | `SYSTEM_ADMIN` có xem dữ liệu nghiệp vụ không | 🟡 | Ảnh hưởng bypass + hỗ trợ vận hành |
| Q-RB8 | Ai duyệt kết quả đánh giá/xếp loại cấp đơn vị | 🟠 | Ma trận `evaluations.approve` |

---

## Q-RB1 — Phạm vi dữ liệu của lãnh đạo đơn vị 🔴

**Hiện trạng (đã xác minh)**
`guard.ts:52-57`: `UNIT_LEADER` ⇒ `getAuthorizedUnitIds` trả `"ALL"` ⇒ **mọi** truy vấn lọc theo đơn vị đều không lọc.
`guard.ts:28-33`: `checkPermission` trả `true` cho mọi quyền trừ `system.config`.
3 tài khoản `UNIT_LEADER` ⇒ xem/sửa **toàn bộ** nhiệm vụ, đầu việc, kế hoạch, kết quả tháng, chỉ tiêu, lịch trực, văn bản, giao ban của **mọi** đơn vị.

**Phương án khuyến nghị (kỹ thuật)**
Thu hẹp **phạm vi** theo `role_grants.scope_unit_id` của chính lãnh đạo: `DEPARTMENT` ⇒ đơn vị được giao; `SUBTREE` ⇒ kèm cây con. Giữ nguyên **tập quyền** (không bỏ bypass toàn quyền ở G0–G4).

**Phương án thay thế**
(A) Giữ nguyên `"ALL"` — lãnh đạo xem toàn cục; chỉ ghi nhận rủi ro lộ dữ liệu liên bộ phận.
(B) `ORGANIZATION` cho cấp Chi cục, `DEPARTMENT` cho cấp Tà Lùng (thực tế đang là 1 cơ cấu chi cục duy nhất).

| | Khuyến nghị (thu hẹp theo grant) | Giữ `"ALL"` | Cấp theo cấp tổ chức |
|---|---|---|---|
| Ưu | Đúng nguyên tắc "phạm vi theo grant"; khớp mô hình RBAC | Không đổi hành vi, rủi ro thấp | Rõ ràng khi có nhiều cấp |
| Nhược | **Đổi hành vi**: lãnh đạo mất một phần dữ liệu | Giữ lỗ hổng lộ dữ liệu liên bộ phận | Cần cấu hình thêm theo từng cấp |

**Ảnh hưởng quy trình Hải quan**: lãnh đạo có thể **không** xem được báo cáo tổng hợp cấp chi cục nữa (nếu chọn thu hẹp) ⇒ phải thông báo và cho biết đường lấy số liệu ngoài phạm vi.

> **Xin Hải quan xác nhận:**
> 1. Lãnh đạo Tà Lùng có cần xem **toàn bộ** số liệu các bộ phận trực thuộc không, hay chỉ bộ phận của mình?
> 2. Nếu cần xem toàn cục: có chấp nhận cơ chế **"lệnh xem liên bộ phận có ghi log"** (in thời điểm + mục đích) không?
> 3. Có đồng ý **thu hẹp** phạm vi (và đồng ý thay đổi hành vi này) không?

---

## Q-RB2 — Cán bộ có tự giao việc cho nhau được không? 🟠

**Hiện trạng**: `verifyTaskAccess(WRITE)` (`guard.ts:141-146`) cho phép **chủ trì hoặc người được phân công** sửa nhiệm vụ; lệnh tạo nhiệm vụ (`POST /api/tasks`) không kiểm tra quyền giao ⇒ bất kỳ cán bộ nào cũng có thể tạo nhiệm vụ **có tên mình** làm chủ trì. Không có đường để cán bộ giao việc **cho người khác** trừ khi thông qua form của lãnh đạo.

**Khuyến nghị (kỹ thuật)**: giữ nguyên — cán bộ chỉ tạo việc cho chính mình; **giao cho người khác là quyền của lãnh đạo** (`tasks.assign`). Gán `tasks.assign` cho `STAFF` **không**.

**Phương án thay thế**: cho phép cán bộ "giao việc phối hợp" trong phạm vi cùng bộ phận, kèm cờ `tasks.assign.own_unit` + nhật ký.

| | Khuyến nghị | Cho phép STAFF giao trong đơn vị |
|---|---|---|
| Ưu | Khớp tình huống đã gặp (YC-38 B1: lãnh đạo giao, cán bộ nhận) | Giảm tải cho lãnh đạo |
| Nhược | Cán bộ phải chờ lãnh đạo | Cần thêm quyền + màn hình + phân quyền đối tượng mới |

**Ảnh hưởng quy trình**: ảnh hưởng trực tiếp cách lãnh đạo giao việc hằng ngày.

> **Xin xác nhận:** trong quy trình hiện tại, **việc giao nhiệm vụ luôn do lãnh đạo thực hiện** trên hệ thống, hay có trường hợp cán bộ giao cho nhau?

---

## Q-RB3 — Ai quản trị vai trò; thứ tự ưu tiên khi nhiều vai trò 🔴

**Hiện trạng (đã xác minh)**
- **Chưa có** UI/API quản trị vai trò (`/api/roles` chỉ có GET). Mọi thay đổi quyền hiện phải sửa DB bằng tay.
- `role_grants` **không có `orderBy`** ⇒ `role_grants[0]` (vai trò chính) là **ngẫu nhiên theo thứ tự DB**. Đã có 1 tài khoản nhiều vai trò (`cb002`).
- `SYSTEM_ADMIN` có **0 grant** ⇒ quyền đến từ hard-code `SYSTEM_ADMIN_PERMISSIONS`, **không** quản lý được bằng DB.
- Không có cơ chế chống tự nâng quyền (vì chưa có UI).

**Khuyến nghị (kỹ thuật)**
1. **Quản trị vai trò**: `SYSTEM_ADMIN` (quản trị hệ thống) là người quản trị, **kèm** giới hạn: không cấp được quyền mình không có; không tự cấp/gỡ quyền `roles.manage` cho chính mình; mọi thao tác ghi `role_audits`.
2. **Thứ tự ưu tiên vai trò** khi nhiều grant: `SYSTEM_ADMIN > UNIT_LEADER > DEPARTMENT_LEADER > STAFF` (theo mức thẩm quyền) — thay vì "grant cũ nhất" (P4).
3. Bổ sung **vai trò hệ thống "Quản trị vai trò"** riêng để không phụ thuộc một người; ít nhất 2 tài khoản giữ vai trò này.
4. Gán `SYSTEM_ADMIN` **một grant** để quản lý được bằng DB; giữ bypass quyền kỹ thuật.

**Phương án thay thế**: lãnh đạo đơn vị tự quản trị vai trò **trong đơn vị** (cần mô hình role theo đơn vị — phức tạp hơn nhiều).

| | Khuyến nghị | Lãnh đạo tự quản trị |
|---|---|---|
| Ưu | Đơn giản, tập trung, dễ kiểm soát | Linh hoạt theo đơn vị |
| Nhược | Lãnh đạo phải gửi yêu cầu | Cần mô hình role theo đơn vị, phạm vi rộng |

**Ảnh hưởng quy trình**: quy trình cấp/thu hồi quyền của Hải quan (ai gửi, ai duyệt, có cần ký).

> **Xin xác nhận:** (1) Ai là quản trị vai trò? (2) Có cần vai trò riêng "quản trị vai trò" hay dùng `SYSTEM_ADMIN`? (3) Khi một cán bộ mang nhiều vai trò, **vai trò nào được tính khi kiểm tra thẩm quyền theo vai trò** (đề xuất: mức cao nhất)? (4) Quy trình cấp/thu hồi quyền cần ký/xác nhận của ai?

---

## Q-RB4 — Quy trình ủy quyền khi lãnh đạo vắng mặt 🟠

**Hiện trạng (đã xác minh)**: hạ tầng **đã có** (`role_grants.valid_from/valid_to`, nhiều grant/tài khoản) nhưng **chưa có UI** và **chưa ai dùng** (chỉ 1 grant đã hết hạn). Ủy quyền hiện **không khả dụng** với người dùng.

**Khuyến nghị (kỹ thuật)**: dùng nguyên `role_grants`; UI cho phép chọn thời hạn (mặc định ≤30 ngày); tự thu hồi khi hết hạn; **ghi log** cả khi cấp lẫn thu hồi; **không** ủy quyền được quyền `roles.manage` (chống leo thang).

**Phương án thay thế**: (A) chỉ lãnh đạo cấp cao hơn ủy quyền cho cấp dưới, **cần lãnh đạo cấp trên duyệt**; (B) ủy quyền tự động theo quy tắc (ví dụ trưởng nhóm ủy quyền khi trưởng bộ phận vắng).

| | Khuyến nghị (thời hạn có kiểm soát) | Ủy quyền tự động theo quy tắc |
|---|---|---|
| Ưu | Minh bạch, có dấu vết, thu hồi tự động | Không cần người xử lý khi vắng |
| Nhược | Cần thao tác | Rủi ro cấp nhầm, khó kiểm soát |

**Ảnh hưởng quy trình**: cần quy định ai được ủy quyền cho ai, thời hạn, và có cần phê duyệt không.

> **Xin xác nhận:** (1) Có nhu cầu ủy quyền khi lãnh đạo vắng mặt không — ví dụ trưởng nhóm thay trưởng bộ phận? (2) Thời hạn ủy quyền tối đa? (3) Ủy quyền có cần lãnh đạo cấp trên phê duyệt không? (4) Ủy quyền có được bao gồm quyền nghiệm thu không?

---

## Q-RB5 — Cán bộ tự ghi nhận việc theo chỉ đạo ngoài hệ thống 🟡

**Hiện trạng (đã xác minh ở YC-38 B1)**: nghiệp vụ **đã xảy ra thực tế** — `NV-2026-0019` được lãnh đạo giao, cán bộ nhận việc và nộp duyệt. Ngoài ra YC-38 B1 đã hỗ trợ "công việc tự khởi tạo" (`tasks.origin_kind = SELF_INITIATED`) với nhãn *"Công việc tự khởi tạo"*, và `"Tự ghi nhận theo chỉ đạo ngoài hệ thống"` (`OUTSIDE_DIRECTIVE`) — cả hai **chưa** có quy trình nghiệm thu riêng.

**Khuyến nghị (kỹ thuật)**: giữ 2 nhãn đã có; **không** coi `OUTSIDE_DIRECTIVE` là lệnh giao chính thức (đã bảo đảm: không tạo bằng chứng lệnh giao); cán bộ tự khai vẫn đi qua **cùng** quy trình nộp duyệt của việc được giao.

**Phương án thay thế**: hợp nhất về một loại "tự khởi tạo" (bỏ `OUTSIDE_DIRECTIVE`) — đơn giản hơn nhưng mất thông tin về nguồn chỉ đạo.

| | Khuyến nghị (giữ 2 nhãn) | Hợp nhất 1 nhãn |
|---|---|---|
| Ưu | Giữ được thông tin nguồn; phù hợp thực tế đã gặp | Đơn giản, ít nhãn trên giao diện |
| Nhược | Cần giải thích 2 nhãn cho người dùng | Mất thông tin phân biệt |

> **Xin xác nhận:** việc cán bộ **tự tạo nhiệm vụ** theo chỉ đạo ngoài hệ thống có được chấp nhận không? Nếu có, nhãn nào phù hợp ("Công việc tự khởi tạo" / "Tự ghi nhận theo chỉ đạo")? Việc đó có **đi qua bước lãnh đạo duyệt** như nhiệm vụ được giao không?

---

## Q-RB6 — Bình luận / minh chứng bổ sung trên nhiệm vụ đã nghiệm thu 🟠

**Hiện trạng (đã xác minh)**: sau bản vá F1–F5, `POST /api/tasks/[id]/comments` và `POST /api/tasks/[id]/attachments` **bị chặn 409** trên nhiệm vụ `COMPLETED/DONE/CANCELED` (fail-closed, vì **chưa có chính sách** cho phép hay không). Trước bản vá, các endpoint này vẫn mở.

**Khuyến nghị (kỹ thuật)**: giữ chặn cho tới khi có chính sách; nếu Hải quan cho phép thì mở **chỉ** bình luận (không sửa kết quả, không ghi đè `actualResultText`, không đổi `status`), và gắn nhãn *"bình luận sau nghiệm thu"* trong nhật ký.

**Phương án thay thế**: (A) cấm vĩnh viễn (đơn giản, có thẻ khiến vận hành); (B) cho phép bình luận nhưng **ẩn khỏi** báo cáo/điểm (tránh nhiễu).

| | Khuyến nghị (mở bình luận có nhãn) | Cấm vĩnh viễn |
|---|---|---|
| Ưu | Không chặn trao đổi cần thiết | Không rủi ro sửa kết quả |
| Nhược | Cần cơ chế phân biệt bình luận sau nghiệm thu | Có thể gây bất tiện khi cần trao đổi |

**Ảnh hưởng quy trình**: có thể phát sinh ý kiến/bất đồng sau khi đã nghiệm thu — cần quy định ai xử lý.

> **Xin xác nhận:** sau khi lãnh đạo đã ký nghiệm thu, cán bộ còn được **bình luận / gửi minh chứng bổ sung** không? Nếu có, ý kiến đó có được hiển thị trong hồ sơ nghiệm thu và ảnh hưởng kết quả đánh giá không?

---

## Q-RB7 — `SYSTEM_ADMIN` có xem dữ liệu nghiệp vụ không? 🟡

**Hiện trạng (đã xác minh)**: `SYSTEM_ADMIN` **không** đọc dữ liệu nghiệp vụ — `getAuthorizedUnitIds` trả `[]` cho họ trừ tác vụ quản trị tổ chức (`guard.ts:54`), và `server/snapshots.ts:87/368` chặn rõ *"Quản trị kỹ thuật không có thẩm quyền … nghiệp vụ"`. Quyền kỹ thuật của họ là 6 mã hard-code.

**Khuyến nghị (kỹ thuật)**: giữ nguyên (an toàn); cung cấp hỗ trợ qua **quyền tạm thời có thời hạn** (dùng `role_grants` sẵn có) thay vì mở vĩnh viễn.

**Phương án thay thế**: (A) `SYSTEM_ADMIN` xem được dữ liệu **đọc** toàn hệ thống (nhưng không sửa) — thuận tiện hỗ trợ, tăng bề mặt lộ dữ liệu; (B) giữ hiện tại + tính năng "xem dữ liệu hỗ trợ" có log.

| | Khuyến nghị (giữ + ủy quyền tạm) | Cho xem đọc toàn hệ thống |
|---|---|---|
| Ưu | Bề mặt lộ dữ liệu nhỏ, có dấu vết | Hỗ trợ nhanh |
| Nhược | Cần thao tác cấp quyền | Bất đồng bộ với "quản trị không xem nghiệp vụ" |

> **Xin xác nhận:** khi cán bộ nghiệp vụ cần hỗ trợ, quản trị hệ thống có được xem dữ liệu đó không? Nếu **có**, theo cách nào (ủy quyền có thời hạn có ghi log là phương án an toàn hơn)?

---

## Q-RB8 — Ai duyệt kết quả đánh giá / xếp loại cấp đơn vị? 🟠

**Hiện trạng (đã xác minh)**: YC-33→37 dùng `person_supervisions` (quan hệ phụ trách) để tính **điểm lãnh đạo** và `score_run_items` cho điểm cá nhân; `approvals` (YC-37) dùng `role_grants` + `isTaskLeader` để **duyệt kết quả nhiệm vụ**. Hiện **chưa** có mã quyền riêng cho duyệt đánh giá; quyền nghiệm thu đang dùng `isTaskLeader` (vai trò + đơn vị) và `person_supervisions` (quan hệ) — **hai nguồn quyền khác nhau** cùng tồn tại.

**Khuyến nghị (kỹ thuật)**: tách rõ 3 lớp — `tasks.approve` (nghiệm thu **nhiệm vụ**, theo vai trò + đơn vị) · `evaluations.approve` (duyệt **kết quả đánh giá**, theo quan hệ phụ trách `person_supervisions`) · `evaluations.score` (chấm điểm đề xuất). **Không** gộp hai lớp nghiệp vụ vào một mã quyền.

**Phương án thay thế**: (A) chỉ dùng quan hệ phụ trách cho cả hai (đơn giản, bỏ vai trò khỏi duyệt); (B) chỉ dùng vai trò (bỏ quan hệ phụ trách khỏi duyệt).

| | Khuyến nghị (tách 3 lớp) | Dùng quan hệ phụ trách cho cả | Dùng vai trò cho cả |
|---|---|---|---|
| Ưu | Khớp nghiệp vụ, không lẫn lộn | Đơn giản | Đồng nhất với phân quyền |
| Nhược | Cần 3 mã quyền + quy tắc rõ | Không kiểm soát việc giao ngoài quan hệ | Bỏ tính "lãnh đạo trực tiếp" |

**Ảnh hưởng quy trình**: ai ký xếp loại, ký báo cáo đánh giá, và xử lý khi quan hệ phụ trách thay đổi.

> **Xin xác nhận:** (1) Kết quả đánh giá/xếp loại của cán bộ do **trưởng bộ phận trực tiếp** ký, hay theo **quan hệ phụ trách**? (2) Cán bộ kiêm nhiệm 2 bộ phận thì ai ký? (3) Khi trưởng bộ phận thay đổi, hồ sơ xếp loại đã ký được giữ nguyên hiệu lực không?

---

## TỔNG HỢP NỘI DUNG BẮT BUỘC XIN XÁC NHẬN

| # | Nội dung cần Hải quan quyết |
|---|---|
| 1 | **Q-RB1**: lãnh đạo xem phạm vi nào; có đồng ý thu hẹp (đổi hành vi) không |
| 2 | **Q-RB2**: việc giao nhiệm vụ luôn do lãnh đạo thực hiện hay có ngoại lệ |
| 3 | **Q-RB3**: ai quản trị vai trò; thứ tự ưu tiên khi nhiều vai trò; quy trình cấp/thu hồi quyền |
| 4 | **Q-RB4**: có ủy quyền tạm không; thời hạn; có cần duyệt không; có gồm quyền nghiệm thu không |
| 5 | **Q-RB5**: công việc tự khởi tạo theo chỉ đạo ngoài hệ thống — nhãn & có qua duyệt không |
| 6 | **Q-RB6**: bình luận/minh chứng bổ sung sau nghiệm thu — cho phép không; ảnh hưởng điểm không |
| 7 | **Q-RB7**: quản trị hệ thống có xem dữ liệu nghiệp vụ để hỗ trợ không |
| 8 | **Q-RB8**: ai ký xếp loại; xử lý kiêm nhiệm & thay đổi lãnh đạo |

**Việc KHÔNG cần xin xác nhận** (chỉ siết, không mở rộng quyền, không đổi hành vi hợp lệ):
- **P1** chặn tạo đơn vị với người không có `org.manage` (`/api/org-units/tree`).
- **P2** chặn cán bộ sửa số liệu nháp của người khác cùng chỉ tiêu (`/api/metrics/entries`).
- **P4** xác định thứ tự `role_grants` + bổ sung `roles[]` (giữ nguyên `role` cũ).
- **P7** vá sub-route `/api/reports/snapshots/[id]` **nếu** rà ra lỗ hổng.
