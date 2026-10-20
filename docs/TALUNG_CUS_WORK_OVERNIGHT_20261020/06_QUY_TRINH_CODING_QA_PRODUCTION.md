# 06 — RUNBOOK CHẠY CODING XUYÊN ĐÊM / KIỂM THỬ / DEPLOY PRODUCTION

## I. Cách vận hành không cần UAT ban đêm

Người dùng cho phép coding, tự kiểm thử, commit/push/deploy Production trong phạm vi này. **UAT thủ công sẽ thực hiện sau khi Agent báo cáo**. Không hỏi xác nhận từng commit hoặc deploy bình thường. Điều kiện bắt buộc: tests và backup phù hợp, không mất dữ liệu, không tự ra điểm/xếp loại không có căn cứ.

Chạy tiếp các chặng độc lập khi một chặng thiếu quy tắc. Nếu gặp điều không thể xác minh, ghi blocker rõ, đánh dấu tính năng chưa đủ căn cứ và chuyển chặng có thể thực hiện. Không thay user bằng cách tự xác nhận nghiệp vụ.

## II. Preflight đầu ca (chỉ đọc)

- `git status --short`, `git branch --show-current`, `git log -5 --oneline`, `git remote -v`; fetch repo đúng tài khoản/SSH Host công ty, bảo toàn file untracked của người dùng.
- Kiểm tra project Vercel đúng `tlqm/task-cus`, Production health và commit thật, xác nhận Supabase project là `task-cus` đúng tài khoản công ty. Trên Windows người dùng đã cấu hình `vc`/`vp`, `sbc`/`sbp`; ưu tiên wrapper công ty đúng ngữ cảnh, nhưng không assume `vc` command luôn sẵn trong môi trường Agent — tự kiểm tra.
- Khảo sát `prisma/schema.prisma`, các routes/API, RBAC, deploy notes, tests đã tồn tại; đọc tài liệu Giai đoạn 1 mà repo có.
- Kiểm tra các file input được đặt trong thư mục private ngoài repo; nguồn thiếu thì ghi `SOURCE_MISSING`, không đưa private Excel lên GitHub để giải quyết.
- Ghi snapshot baseline số người, người dùng, org units, plans, tasks, personal work items, monthly results, templates TX/legacy, products QĐ1277, evidence object count và audit (bằng truy vấn đọc có quyền); không in PII.
- Kiểm tra an toàn Storage: `work-evidence` phải private; `task-attachments` đang public cần ghi rủi ro nhưng không thay policy trong đợt này.

## III. Thứ tự thực thi không phụ thuộc UAT

| Chặng | Ưu tiên | Thực hiện | Gate để chuyển chặng |
|---|---|---|---|
| S0 | Cao | Audit source + spec + traceability, xác minh DB/permission, lập test baseline | Không thay code trước khi hiểu luồng hiện tại |
| S1 | Cao | YC-37 preview/decision/explanation tại ngữ cảnh có căn cứ | unit/API UI test, deploy nếu qua gate |
| S2 | Cao | YC-33 scoring service explainable + formula parity, null handling, snapshot | Không có công thức thật thì dừng output điểm, vẫn test/service tiếp |
| S3 | Cao | YC-36 form tự đánh giá, nhận xét, suggest-vs-user fields, RBAC | Không ra xếp loại chính thức khi chưa đủ căn cứ |
| S4 | Cao | YC-34 01A/01B/02A/02B preview/export và print fidelity | Bản thiếu điểm phải là DRAFT; test từng biểu |
| S5 | Trung bình | YC-35 quan hệ phụ trách kỳ + điểm lãnh đạo và 02B dựa vào dữ liệu xác nhận | Không gán quan hệ từ tên ngắn; không chia số người cố định |
| S6 | Trung bình | Tổng regression, demo/fixture cleanup, report, danh sách điểm còn chờ Hải quan | Giao lại để UAT sáng sau |

Tùy dependency code thực tế có thể xây engine YC-33 trước exporter, hoặc làm approval song song trên branch riêng; **không được trộn đổi schema chưa kiểm tra trên cùng nhánh production**.

## IV. Gate trước một lần đổi schema/dữ liệu Production

1. Kiểm tra scope và loại thao tác: chỉ additive hoặc chỉnh dữ liệu có kế hoạch, không DROP/TRUNCATE, không sửa bulk người dùng thật ngoài nguồn đã xác minh.
2. **Backup mới** trước DDL/data mutation rủi ro, lưu ngoài thư mục Temp; không commit backup; kiểm tra SHA-256 và dung lượng.
3. **Restore thử** sang DB tách biệt; so counts/hash bảng quan trọng; xác nhận bằng log/exit code.
4. Dry-run DDL trên clone, kiểm tra idempotent lần hai và backward compatibility với mã trước deploy.
5. Áp Production khi script an toàn, có transaction/rollback logic thích hợp; snapshot counts/hash sau thay đổi; kiểm tra 0 lỗi constraint.
6. Nếu backup/restore fail, schema drift bất ngờ, dữ liệu giảm trái kế hoạch hoặc quyền Storage không an toàn: **không thay Production theo bước rủi ro**; tiếp tục frontend/tests độc lập và báo blocker.
7. Production này **chưa có lịch sử `_prisma_migrations` phù hợp**: cấm `prisma migrate deploy`, `prisma db push`, reset hoặc destructive rebase chỉ để cho typecheck pass.

## V. Gate code, tests, deployment

- Không cam kết tự có quyền browse UI; kiểm tra công cụ được cài trong OpenCode. Nếu không có browser automation, ghi `UI_NOT_AUTOMATED`, không báo 100% UI PASS giả.
- Test ưu tiên: pure scoring, user roles/RBAC, approval state transition, export template integrity, mobile navigation regression, work-evidence upload/download private, locked-period logic, YC31 TX selector và 48 legacy historical.
- Build/typecheck PASS; lint nếu config có sẵn (không cài ESLint tương tác rồi đứng chờ qua đêm).
- Dùng demo accounts/test fixtures được phép; test Production với ID/marker riêng, teardown idempotent. **Không xóa lịch sử audit nghiệp vụ khi cleanup.**
- Mỗi chặng: `git diff --check`; scan secrets/file xlsx, xls, zip, backup, `.env`; stage cụ thể thay vì `git add .`; commit thông tin thay đổi rõ ràng; push đúng origin; đợi Vercel ready + verify `health` commit mới, DB up, HTTP 5xx=0 trong khung smoke nếu có telemetry.
- `commit health` của deploy sau docs update có thể khác commit feature; kiểm tra thay đổi mã thực tế, không gắn kết quả test với sai version.
- Nếu deployment fail/cấp quyền lộ/critical regression: rollback **code** về bản đang chạy tốt gần nhất, kiểm tra tương thích schema additive, giữ DB/audit, báo cáo; không tự drop schema để rollback.

## VI. Quy tắc đánh dấu trạng thái trung thực

- `DEPLOYED_AUTO_VERIFIED`: có bằng chứng test + commit + health + deployment.
- `IMPLEMENTED_NOT_DEPLOYED`: local pass nhưng release gate chưa đủ.
- `DRAFT_PREVIEW_ONLY`: chức năng/UI xuất dự thảo, thiếu công thức/ý kiến chính thức.
- `BLOCKED_BUSINESS_RULE`: cần nguồn hoặc Hải quan xác nhận; có mô tả cụ thể.
- `BLOCKED_ENVIRONMENT`: CLI, key, backup, Storage, network thiếu.
- `NOT_STARTED`: chưa có tiến độ.

**Không sử dụng:** `UAT_APPROVED`, `OFFICIALLY_ACCEPTED`, `SCORED_FINAL` khi người dùng/Hải quan chưa thực hiện UAT/chấp thuận.

## VII. Checkpoint liên tục, tránh mất tiến độ xuyên đêm

- Sau mỗi chặng: cập nhật `docs/.../OVERNIGHT_STATUS.md` (không PII/secrets), commit các thành phần hoàn chỉnh, lưu cả test command + kết quả thật.
- Nếu gần hết context/agent restart: viết `NEXT_ACTIONS.md` chứa HEAD, branch, server, file đã sửa, diff chưa commit, test đã chạy, blockers và bước an toàn tiếp theo; không in secrets.
- Khi phát hiện một blocker: ghi ngay `OPEN_QUESTIONS.md`, tiếp tục việc không phụ thuộc blocker. Không hỏi người dùng vào ban đêm trừ **rủi ro phá hủy dữ liệu hoặc xung đột không thể giải quyết an toàn**.
- Không xây, bật, hoặc commit phương án **thống nhất các form tạo việc** (đó là backlog chưa được phép triển khai).

## VIII. Mẫu báo cáo cuối

1. HEAD, branch, Project, Production health.
2. Từng YC/chặng: trạng thái, routes, DB schema, API.
3. Công thức nào có nguồn thật, ví dụ cell + phiên bản; công thức nào chờ xác nhận.
4. Từng mẫu 01A/01B/02A/02B: triển khai, export, fidelity, số test PASS/FAIL.
5. YC37: flow, rights, audit, tests.
6. Dữ liệu trước/sau Production không mất; TX 348, 207/141, legacy 48, QĐ1277, mã người khác giữ.
7. Backup restore-test nếu có DDL; đường dẫn backup private **không chứa secret**.
8. Commit/deploy và regression.
9. Blockers thực sự + câu hỏi ngắn cho Hải quan.
10. Checklist UAT buổi sáng, những chức năng chỉ draft.
