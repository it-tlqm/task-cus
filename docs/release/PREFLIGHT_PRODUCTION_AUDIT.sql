-- TALUNG-CUS-WORK V3 — PREFLIGHT PRODUCTION AUDIT (READ-ONLY)
-- RC: ede75cb
-- Chạy bằng credential READ-ONLY. Không chạy UPDATE/INSERT/DELETE/DDL trong file này.
-- Lưu toàn bộ output vào biên bản release; không ghi credential vào file/log.
-- Chạy từng section. Nếu một cột/bảng mới chưa tồn tại, truy vấn tương ứng có thể lỗi:
-- đó là tín hiệu "chưa áp dụng"; ghi nhận rồi chuyển section tiếp theo, không sửa dữ liệu.

\echo '=== 0. DANH TÍNH / THỜI ĐIỂM / PHIÊN BẢN ==='
SELECT current_database() AS database,
       current_user AS db_user,
       now() AS checked_at,
       version() AS pg_version;

\echo '=== 1. LỊCH SỬ MIGRATION ==='
SELECT to_regclass('public._prisma_migrations') AS prisma_migrations_table;
-- Kỳ vọng: NULL (Production dựng bằng db push). Nếu khác: STOP, lập phương án baseline.

\echo '=== 2. BASELINE COUNTS (KHÔNG GHI) ==='
SELECT 'people' AS table_name, count(*) AS rows FROM "people"
UNION ALL SELECT 'accounts', count(*) FROM "accounts"
UNION ALL SELECT 'tasks', count(*) FROM "tasks"
UNION ALL SELECT 'task_updates', count(*) FROM "task_updates"
UNION ALL SELECT 'approval_cases', count(*) FROM "approval_cases"
UNION ALL SELECT 'approval_decisions', count(*) FROM "approval_decisions"
UNION ALL SELECT 'personal_work_items', count(*) FROM "personal_work_items"
UNION ALL SELECT 'metric_plan_targets', count(*) FROM "metric_plan_targets"
UNION ALL SELECT 'metric_baselines', count(*) FROM "metric_baselines"
UNION ALL SELECT 'metric_daily_entries', count(*) FROM "metric_daily_entries";

\echo '=== 3. PHASE A — personal_work_items.idempotency_key ==='
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'personal_work_items'
  AND column_name = 'idempotency_key';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'personal_work_items'
  AND indexname = 'personal_work_items_person_idempotency_key';

-- Khóa trùng phải được xử lý trước khi tạo unique index.
SELECT person_id, idempotency_key, count(*) AS duplicate_count
FROM "personal_work_items"
WHERE idempotency_key IS NOT NULL
GROUP BY person_id, idempotency_key
HAVING count(*) > 1
ORDER BY duplicate_count DESC, person_id;

\echo '=== 4. PHASE B 150000 — target/baseline/revision/permissions ==='
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'metric_plan_targets' AND column_name IN
      ('comparison_kind','source_note','status','proposed_by_id','confirmed_by_id','confirmed_at','locked_by_id','locked_at'))
    OR
    (table_name = 'metric_baselines' AND column_name IN ('locked_by_id','locked_at'))
  )
ORDER BY table_name, column_name;

SELECT to_regclass('public.metric_plan_target_revisions') AS metric_plan_target_revisions,
       to_regclass('public.metric_baseline_revisions') AS metric_baseline_revisions;

SELECT code FROM "permissions"
WHERE code IN ('metrics.config','metrics.entry_all')
ORDER BY code;

SELECT r.code AS role_code, p.code AS permission_code
FROM "roles" r
JOIN "role_permissions" rp ON rp.role_id = r.id
JOIN "permissions" p ON p.id = rp.permission_id
WHERE p.code IN ('metrics.config','metrics.entry_all')
ORDER BY r.code, p.code;

\echo '=== 5. PHASE B 160000 — data_source / backfill / constraints ==='
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('metric_plan_targets','metric_baselines','metric_daily_entries')
  AND column_name = 'data_source'
ORDER BY table_name;

SELECT conname
FROM pg_constraint
WHERE conname IN (
  'metric_plan_targets_data_source_check',
  'metric_baselines_data_source_check',
  'metric_daily_entries_data_source_check'
)
ORDER BY conname;

SELECT 'metric_plan_targets' AS table_name,
       count(*) FILTER (WHERE data_source = 'DEMO') AS demo_rows,
       count(*) FILTER (WHERE data_source = 'REAL') AS real_rows,
       count(*) FILTER (WHERE data_source IS NULL) AS null_rows
FROM "metric_plan_targets"
UNION ALL
SELECT 'metric_baselines',
       count(*) FILTER (WHERE data_source = 'DEMO'),
       count(*) FILTER (WHERE data_source = 'REAL'),
       count(*) FILTER (WHERE data_source IS NULL)
FROM "metric_baselines"
UNION ALL
SELECT 'metric_daily_entries',
       count(*) FILTER (WHERE data_source = 'DEMO'),
       count(*) FILTER (WHERE data_source = 'REAL'),
       count(*) FILTER (WHERE data_source IS NULL)
FROM "metric_daily_entries";

-- Nếu cột data_source chưa có, câu trên sẽ lỗi; chạy riêng từng khối sau khi xác nhận cột tồn tại.
-- Đếm nhãn DEMO cũ để đối chiếu backfill:
SELECT 'target_label_DEMO' AS check_name, count(*) AS rows
FROM "metric_plan_targets" WHERE label LIKE '%[DEMO%'
UNION ALL
SELECT 'baseline_note_DEMO', count(*)
FROM "metric_baselines" WHERE COALESCE(source_note,'') LIKE '%[DEMO%'
UNION ALL
SELECT 'entry_note_DEMO', count(*)
FROM "metric_daily_entries" WHERE COALESCE(note,'') LIKE '%[DEMO%';

\echo '=== 6. S6 PHASE 1 — task participant objects ==='
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'task_updates'
  AND column_name IN ('participant_event_id','subject_person_id')
ORDER BY column_name;

SELECT to_regclass('public.task_participant_results') AS task_participant_results,
       to_regclass('public.task_participant_events') AS task_participant_events,
       to_regclass('public.task_submission_snapshots') AS task_submission_snapshots;

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('task_participant_results','task_participant_events','task_submission_snapshots')
ORDER BY tablename, indexname;

SELECT conname
FROM pg_constraint
WHERE conname IN (
  'task_updates_subject_person_id_fkey',
  'task_participant_results_task_id_person_id_key',
  'task_submission_snapshots_task_id_round_key'
)
ORDER BY conname;

\echo '=== 7. S6 PHASE 2 — quality objects ==='
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'approval_decisions'
  AND column_name = 'quality_percent';

SELECT to_regclass('public.approval_quality_adjustments') AS approval_quality_adjustments;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'approval_quality_adjustments'
ORDER BY indexname;

SELECT conname
FROM pg_constraint
WHERE conname IN (
  'approval_decisions_quality_percent_check',
  'approval_quality_adjustments_decision_id_revision_key',
  'approval_quality_adjustments_case_id_fkey',
  'approval_quality_adjustments_decision_id_fkey'
)
ORDER BY conname;

\echo '=== 7b. S6 PHASE 3 — approval_route_snapshots ==='
SELECT to_regclass('public.approval_route_snapshots') AS approval_route_snapshots;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'approval_route_snapshots'
ORDER BY ordinal_position;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'approval_route_snapshots'
ORDER BY indexname;

SELECT conname
FROM pg_constraint
WHERE conname IN (
  'approval_route_snapshots_task_id_round_key',
  'approval_route_snapshots_route_status_check',
  'approval_route_snapshots_task_id_fkey'
)
ORDER BY conname;

\echo '=== 8. KIỂM TRA DRIFT TỐI THIỂU ==='
-- Các cột/tables lạ ngoài phạm vi không sửa; chỉ ghi nhận.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('personal_work_items','metric_plan_targets','metric_baselines','metric_daily_entries','task_updates','approval_decisions')
ORDER BY table_name, ordinal_position;

\echo '=== 9. KẾT LUẬN PREFLIGHT (điền tay) ==='
-- [ ] _prisma_migrations = NULL
-- [ ] Không có khóa idempotency trùng (hoặc đã có phương án backup/NULL hóa)
-- [ ] Object Phase A/150000/160000/170000/180000: all-present / none-present / partial
-- [ ] DEMO rows đã đối chiếu và chủ dự án xác nhận
-- [ ] Không có drift lạ trong phạm vi release
-- [ ] Backup + restore test PASS
-- [ ] Người audit / thời điểm / checksum output: ____________________
