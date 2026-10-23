-- TALUNG-CUS-WORK V3.1 — PREFLIGHT SUPABASE SQL EDITOR (READ-ONLY)
-- Dùng cho Supabase Dashboard → SQL Editor. Không có lệnh ghi/DDL.
-- Chạy từng block; copy toàn bộ kết quả gửi S0 (không gửi mật khẩu/connection string).

-- 1. Danh tính / thời điểm
select current_database() as database, current_user as db_user, now() as checked_at, version() as pg_version;

-- 2. Lịch sử migration (kỳ vọng NULL)
select to_regclass('public._prisma_migrations') as prisma_migrations_table;

-- 3. Baseline counts
select 'people' as table_name, count(*) as rows from people
union all select 'accounts', count(*) from accounts
union all select 'tasks', count(*) from tasks
union all select 'task_updates', count(*) from task_updates
union all select 'approval_cases', count(*) from approval_cases
union all select 'approval_decisions', count(*) from approval_decisions
union all select 'personal_work_items', count(*) from personal_work_items
union all select 'metric_plan_targets', count(*) from metric_plan_targets
union all select 'metric_baselines', count(*) from metric_baselines
union all select 'metric_daily_entries', count(*) from metric_daily_entries;

-- 4. Cột V3 đã tồn tại (chỉ đọc information_schema)
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'personal_work_items' and column_name = 'idempotency_key')
    or (table_name = 'metric_plan_targets' and column_name in ('comparison_kind','source_note','status','proposed_by_id','confirmed_by_id','confirmed_at','locked_by_id','locked_at','data_source'))
    or (table_name = 'metric_baselines' and column_name in ('locked_by_id','locked_at','data_source'))
    or (table_name = 'metric_daily_entries' and column_name = 'data_source')
    or (table_name = 'task_updates' and column_name in ('participant_event_id','subject_person_id'))
    or (table_name = 'approval_decisions' and column_name = 'quality_percent')
  )
order by table_name, column_name;

-- 5. Bảng V3 đã tồn tại
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'metric_plan_target_revisions',
    'metric_baseline_revisions',
    'task_participant_results',
    'task_participant_events',
    'task_submission_snapshots',
    'approval_quality_adjustments',
    'approval_route_snapshots'
  )
order by table_name;

-- 6. Index/constraint quan trọng
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'personal_work_items','approval_quality_adjustments','approval_route_snapshots',
    'task_participant_results','task_participant_events','task_submission_snapshots'
  )
order by tablename, indexname;

select conname
from pg_constraint
where conname in (
  'personal_work_items_person_idempotency_key',
  'metric_plan_targets_data_source_check',
  'metric_baselines_data_source_check',
  'metric_daily_entries_data_source_check',
  'approval_decisions_quality_percent_check',
  'approval_quality_adjustments_decision_id_revision_key',
  'approval_route_snapshots_task_id_round_key',
  'approval_route_snapshots_route_status_check'
)
order by conname;

-- 7. Kiểm tra khóa idempotency trùng (chỉ chạy khi cột đã tồn tại)
do $$
declare n bigint;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='personal_work_items' and column_name='idempotency_key'
  ) then
    execute $q$
      select count(*) from (
        select person_id, idempotency_key
        from personal_work_items
        where idempotency_key is not null
        group by person_id, idempotency_key
        having count(*) > 1
      ) t
    $q$ into n;
    raise notice 'duplicate_idempotency_groups=%', n;
  else
    raise notice 'idempotency_key_column=ABSENT';
  end if;
end $$;

-- 8. Đếm DEMO (chỉ dùng khi cột data_source đã tồn tại)
do $$
declare n bigint;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='metric_plan_targets' and column_name='data_source'
  ) then
    execute 'select count(*) from metric_plan_targets where data_source = ''DEMO''' into n;
    raise notice 'demo_targets=%', n;
  else
    raise notice 'data_source_column=ABSENT';
  end if;
end $$;

-- 9. Kết luận điền tay:
-- [ ] _prisma_migrations = NULL
-- [ ] Phase A/150000/160000/170000/180000/190000: all-present / none-present / partial
-- [ ] Không có khóa idempotency trùng (hoặc đã có phương án backup/NULL hóa)
-- [ ] DEMO rows đã đối chiếu
-- [ ] Backup + restore test PASS
-- [ ] Người audit / thời điểm: ____________________
