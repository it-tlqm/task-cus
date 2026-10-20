# 04 — YC-35/36: ĐÁNH GIÁ CÔNG CHỨC, LÃNH ĐẠO VÀ XẾP LOẠI

## YC-36 — Tự đánh giá, nhận xét, xếp loại

### A. Yêu cầu đã được phản hồi

- Hệ thống **gợi ý** điểm tiêu chí chung, công chức có thể sửa theo thẩm quyền.
- Có trường ưu điểm, hạn chế/khuyết điểm; cho phép để trống và bổ sung sau.
- Hệ thống gợi ý mức **cá nhân tự đề xuất xếp loại** khi có đầy đủ căn cứ; công chức được sửa.
- **Ý kiến nhận xét của người trực tiếp sử dụng/Đội trưởng** phải để trống mặc định, có thể nhập trực tiếp hoặc để trống trên bản in để ghi tay.
- Không coi tự đề xuất của cá nhân là đánh giá chính thức của cấp có thẩm quyền.

### B. Mô hình dữ liệu gợi ý (đối chiếu thực tế, không tạo trùng)

Một bản đánh giá cần có `subject_id`, `period_type`, `period_start/end`, `role_at_period`, `common_criteria_score_suggestion`, `common_criteria_self_score`, `task_result_score`, `self_grade_suggestion`, `self_grade_choice`, `strengths`, `weaknesses`, `reviewer_comment`, `reviewer_id`, `review_timestamp`, `evaluation_status`, `formula_version`, `audit`. Dùng đúng schema đã tồn tại hoặc mở rộng additive phù hợp; không tạo nhiều bản cùng người-kỳ-loại-biểu khi chưa có cơ chế phiên bản.

Bắt buộc tách **gợi ý**, **cán bộ tự điều chỉnh**, **người đánh giá nhận xét**, **người có thẩm quyền quyết định**. Khóa theo vai trò/kỳ, tránh cán bộ tự sửa ý kiến người duyệt.

### C. Quy tắc dự thảo

- Không tự động cho 30/30 điểm chung hoặc mặc định xếp loại xuất sắc.
- Công văn 2431 có các điều kiện ngoài KPI: nhiệm vụ chậm, chất lượng, chỉ tiêu đơn vị, ngoại lệ, tỷ lệ, kỷ luật, thời gian công tác... Phần không có dữ liệu xác thực phải hiện 'cần xác nhận', không tự kết luận.
- Không tự ý dùng điểm 90/70/50 làm toàn bộ thuật toán xét xếp loại cho mọi vị trí/kỳ; văn bản có nhiều nhánh và thẩm quyền khác nhau.
- Người chưa đủ thời gian công tác trong quý là trường hợp cần quy trình riêng theo văn bản, không tự xếp loại.
- Dữ liệu nhận xét nhạy cảm: chỉ hiển thị cho người có quyền, không đưa chi tiết vào log.
- Nếu thiếu căn cứ gợi ý, để trống hoặc nhãn `CHƯA ĐỦ CĂN CỨ`, vẫn cho phép cán bộ tự nhập theo quyền.

### D. UI & kiểm thử

- Từng tiêu chí hiển thị điểm tối đa, điểm gợi ý, điểm người dùng sửa, ghi chú (nếu có), tổng cập nhật theo rule hợp lệ; không chấm ngầm.
- Người đánh giá thấy nội dung trước khi nhận xét; nhập nhận xét nhiều dòng, có thể để trống.
- Người dùng có bản preview 01A/02A của mình và lịch sử; người quản lý thấy đúng đối tượng phụ trách.
- Test RBAC sửa nhận xét, sửa điểm tự chấm, độc lập người-kỳ, audit, locked period, file draft, null suggestions và không có quyền.

## YC-35 — Điểm lãnh đạo / quan hệ quản lý / 02B

### A. Yêu cầu Hải quan đã phản hồi (chưa xác nhận tất cả ngoại lệ)

- Đội trưởng: có yêu cầu lấy **điểm trung bình hai Đội phó**.
- Đội phó: có yêu cầu lấy **điểm trung bình các công chức phụ trách**.
- Đầu ra: **Biểu 02B**; hồ sơ mẫu còn có **01B theo tháng**.

**Không đồng nghĩa cứ lấy toàn bộ điểm 01A/02A làm đầu vào và áp bình quân cho tất cả chỉ tiêu.** Phải xác minh: bình quân số lượng/tiến độ/chất lượng hay điểm tổng, kỳ nào, trọng số, trường hợp người nghỉ/kiêm nhiệm, ai thuộc phạm vi phụ trách, số lượng người thay đổi giữa kỳ.

### B. Quan hệ phụ trách theo thời gian

- Thiết kế source of truth `manager_person_id` → `report_person_id` hoặc `unit_id`, `scope`, `effective_from`, `effective_to`, `period`, `confirmed_by`, `status`; không phụ thuộc vào role kỹ thuật (`SYSTEM_ADMIN` không mặc nhiên là lãnh đạo).
- Một cán bộ có thể tham gia phối hợp nhiều nhiệm vụ nhưng không tự bị tính trùng trong tập người thuộc một lãnh đạo.
- Phát hiện vòng quản lý, liên kết bản thân, quan hệ chồng kỳ, thiếu dữ liệu, người đã thôi phụ trách.
- `danh.xlsx` và tên gọi ngắn không đủ để gán tự động quan hệ phụ trách; chỉ dùng quan hệ đã xác nhận.

### C. Tính bình quân với điều kiện hợp lệ

- Tính preview trên **bộ quan hệ đã xác nhận tại kỳ đánh giá**, nguồn điểm của từng người có trạng thái rõ.
- Không chia cứng `2` nếu chưa xác nhận đủ chính xác hai Đội phó; không lấy 0 thay điểm chưa có, không chọn đại cán bộ để đủ mẫu số.
- Nếu quan hệ, thẩm quyền, kỳ, hoặc định nghĩa 'điểm nào bình quân' chưa chốt: xây được màn hình cấu hình, đối chiếu và preview, trả trạng thái `WAITING_RELATION_OR_RULE`, **không phát hành điểm chính thức**.
- Lưu snapshot người được tính, công thức, kỳ, kết quả, phiên bản quy tắc và audit; không tự cập nhật lịch sử khi điều chuyển nhân sự.

### D. Tích hợp hồ sơ

- `01B` cho lãnh đạo theo tháng; `02B` theo quý; không nhầm với 01A/02A công chức.
- Workbook 01B/02B mẫu có ba tỷ lệ số lượng/tiến độ/chất lượng và ba thành phần lãnh đạo khác; một số chia `/24` theo ví dụ mẫu. **Không coi /24 là quy tắc cố định.**
- Không để điểm tổng kết đơn vị hoặc xếp loại chính thức tự suy từ điểm bình quân khi thiếu điều kiện văn bản.

### E. Test tối thiểu

- Nhiều người phụ trách, thay đổi giữa quý, một người ở hai nhóm phối hợp, vòng quan hệ, quan hệ chưa xác nhận, một người chưa có điểm, chia 0, kỳ bị khóa.
- Trưởng phụ trách hai Đội phó; Phó phụ trách số công chức thay đổi; chỉ preview khi đúng dữ liệu, quyền manager-scoped và server-side.
- Đối soát biểu mẫu lãnh đạo bằng fixtures đã ẩn danh, không hardcode tên người/điểm thực tế.

## Tiêu chí hoàn thành giai đoạn

- **YC-36:** form/rules/provenance/rbac/audit và draft usable; chấm gợi ý phải có căn cứ hoặc để thiếu rõ.
- **YC-35:** cấu hình quan hệ theo kỳ và preview an toàn; chính thức tính điểm/02B chỉ khi mối quan hệ và công thức xác nhận đủ.
