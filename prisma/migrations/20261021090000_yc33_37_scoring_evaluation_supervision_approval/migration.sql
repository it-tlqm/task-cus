-- YC-33 → YC-37 — Schema additive (2026-10-21)
--
-- BẢN CHẤT:
--  1. score_runs / score_run_items      — snapshot kỳ tính điểm (YC-33)
--  2. evaluation_assessments            — tự đánh giá, nhận xét lãnh đạo, xếp loại (YC-36)
--  3. person_supervisions               — quan hệ phụ trách theo kỳ (YC-35)
--  4. approval_cases / approval_decisions — hồ sơ chấp thuận / giải trình (YC-37)
--  5. evaluation_assessments: cột KẾT QUẢ XẾP LOẠI CUỐI CÙNG (bổ sung Giai đoạn 3)
--
-- AN TOÀN DỮ LIỆU:
--  - CHỈ CREATE TABLE/INDEX + ADD COLUMN (nullable). KHÔNG DROP, KHÔNG UPDATE/DELETE.
--  - Không khai báo FOREIGN KEY sang bảng nghiệp vụ.
--  - Idempotent: chạy lại nhiều lần đều an toàn.

-- ---------------------------------------------------------------- YC-33
CREATE TABLE IF NOT EXISTS "score_runs" (
  "id"                TEXT NOT NULL,
  "person_id"         TEXT NOT NULL,
  "period_type"       TEXT NOT NULL,
  "period_year"       INTEGER NOT NULL,
  "period_number"     INTEGER NOT NULL,
  "formula_version"   TEXT NOT NULL,
  "product_version_id" TEXT,
  "catalog_version_id" TEXT,
  "status"            TEXT NOT NULL DEFAULT 'DRAFT',
  "overall_score"     DOUBLE PRECISION,
  "summary_json"      JSONB,
  "reasons_json"      JSONB,
  "computed_by_id"    TEXT,
  "computed_at"       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "score_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "score_runs_person_id_period_type_period_year_period_nu_key"
  ON "score_runs" ("person_id", "period_type", "period_year", "period_number", "formula_version");
CREATE INDEX IF NOT EXISTS "score_runs_period_type_period_year_period_number_idx"
  ON "score_runs" ("period_type", "period_year", "period_number");
CREATE INDEX IF NOT EXISTS "score_runs_person_id_period_type_idx"
  ON "score_runs" ("person_id", "period_type");

CREATE TABLE IF NOT EXISTS "score_run_items" (
  "id"                  TEXT NOT NULL,
  "score_run_id"        TEXT NOT NULL,
  "work_item_id"        TEXT,
  "task_id"             TEXT,
  "monthly_result_id"   TEXT,
  "sequence"            INTEGER NOT NULL DEFAULT 0,
  "title"               TEXT NOT NULL,
  "factor_source"       TEXT NOT NULL,
  "factor"              DOUBLE PRECISION,
  "factor_snapshot"     JSONB,
  "assigned_qty"        DOUBLE PRECISION,
  "completed_qty"       DOUBLE PRECISION,
  "late_days"           INTEGER NOT NULL DEFAULT 0,
  "rework_count"        INTEGER NOT NULL DEFAULT 0,
  "g_assigned_converted"  DOUBLE PRECISION,
  "i_completed_converted" DOUBLE PRECISION,
  "l_progress_converted"  DOUBLE PRECISION,
  "n_quality_converted"   DOUBLE PRECISION,
  "status"              TEXT NOT NULL DEFAULT 'KNOWN',
  "reasons"             JSONB,
  "created_at"          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "score_run_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "score_run_items_score_run_id_sequence_idx"
  ON "score_run_items" ("score_run_id", "sequence");

-- ---------------------------------------------------------------- YC-36
CREATE TABLE IF NOT EXISTS "evaluation_assessments" (
  "id"                        TEXT NOT NULL,
  "subject_person_id"         TEXT NOT NULL,
  "period_type"               TEXT NOT NULL,
  "period_year"               INTEGER NOT NULL,
  "period_number"             INTEGER NOT NULL,
  "period_start"              TIMESTAMP NOT NULL,
  "period_end"                TIMESTAMP NOT NULL,
  "role_at_period"            TEXT,
  "is_leader_subject"         BOOLEAN NOT NULL DEFAULT false,
  "common_criteria_suggested" DOUBLE PRECISION,
  "common_criteria_score"     DOUBLE PRECISION,
  "task_result_score"         DOUBLE PRECISION,
  "self_grade_suggestion"     TEXT,
  "self_grade_choice"         TEXT,
  "strengths"                 TEXT,
  "weaknesses"                TEXT,
  "reviewer_comment"          TEXT,
  "reviewer_id"               TEXT,
  "review_timestamp"          TIMESTAMP,
  "evaluation_status"         TEXT NOT NULL DEFAULT 'DRAFT',
  "formula_version"           TEXT,
  "created_by_id"             TEXT,
  "created_at"                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluation_assessments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_assessments_subject_person_id_period_type_period_y_key"
  ON "evaluation_assessments" ("subject_person_id", "period_type", "period_year", "period_number");
CREATE INDEX IF NOT EXISTS "evaluation_assessments_period_type_period_year_period_number_idx"
  ON "evaluation_assessments" ("period_type", "period_year", "period_number");
CREATE INDEX IF NOT EXISTS "evaluation_assessments_evaluation_status_idx"
  ON "evaluation_assessments" ("evaluation_status");

-- Giai đoạn 3: kết quả xếp loại CUỐI CÙNG do cấp có thẩm quyền quyết định
-- (theo CV 2431: Trưởng đơn vị ĐỀ XUẤT, Chi cục trưởng QUYẾT ĐỊNH, phê duyệt)
ALTER TABLE "evaluation_assessments" ADD COLUMN IF NOT EXISTS "final_grade" TEXT;
ALTER TABLE "evaluation_assessments" ADD COLUMN IF NOT EXISTS "final_grade_by_id" TEXT;
ALTER TABLE "evaluation_assessments" ADD COLUMN IF NOT EXISTS "final_grade_at" TIMESTAMP;
ALTER TABLE "evaluation_assessments" ADD COLUMN IF NOT EXISTS "final_grade_note" TEXT;

-- ---------------------------------------------------------------- YC-35
CREATE TABLE IF NOT EXISTS "person_supervisions" (
  "id"                     TEXT NOT NULL,
  "manager_person_id"      TEXT NOT NULL,
  "subordinate_person_id"  TEXT NOT NULL,
  "scope_type"             TEXT NOT NULL DEFAULT 'UNIT',
  "scope_note"             TEXT,
  "effective_from"         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to"           TIMESTAMP,
  "status"                 TEXT NOT NULL DEFAULT 'CONFIRMED',
  "confirmed_by_id"        TEXT,
  "confirmed_at"           TIMESTAMP,
  "note"                   TEXT,
  "created_at"             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "person_supervisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "person_supervisions_manager_person_id_subordinate_person_id_key"
  ON "person_supervisions" ("manager_person_id", "subordinate_person_id", "effective_from");
CREATE INDEX IF NOT EXISTS "person_supervisions_subordinate_person_id_status_idx"
  ON "person_supervisions" ("subordinate_person_id", "status");
CREATE INDEX IF NOT EXISTS "person_supervisions_manager_person_id_status_idx"
  ON "person_supervisions" ("manager_person_id", "status");

-- ---------------------------------------------------------------- YC-37
CREATE TABLE IF NOT EXISTS "approval_cases" (
  "id"              TEXT NOT NULL,
  "case_type"       TEXT NOT NULL,
  "resource_id"     TEXT NOT NULL,
  "resource_code"   TEXT,
  "title"           TEXT NOT NULL,
  "unit_id"         TEXT,
  "submitted_by_id" TEXT,
  "status"          TEXT NOT NULL DEFAULT 'OPEN',
  "current_round"   INTEGER NOT NULL DEFAULT 1,
  "decided_by_id"   TEXT,
  "decided_at"      TIMESTAMP,
  "deadline_at"     TIMESTAMP,
  "created_at"      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "approval_cases_case_type_resource_id_key"
  ON "approval_cases" ("case_type", "resource_id");
CREATE INDEX IF NOT EXISTS "approval_cases_status_created_at_idx"
  ON "approval_cases" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "approval_cases_submitted_by_id_status_idx"
  ON "approval_cases" ("submitted_by_id", "status");

CREATE TABLE IF NOT EXISTS "approval_decisions" (
  "id"              TEXT NOT NULL,
  "case_id"         TEXT NOT NULL,
  "round"           INTEGER NOT NULL DEFAULT 1,
  "action"          TEXT NOT NULL,
  "reason"          TEXT,
  "content"         TEXT,
  "actor_id"        TEXT NOT NULL,
  "actor_person_id" TEXT,
  "created_at"      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "approval_decisions_case_id_round_idx"
  ON "approval_decisions" ("case_id", "round");
CREATE INDEX IF NOT EXISTS "approval_decisions_actor_id_created_at_idx"
  ON "approval_decisions" ("actor_id", "created_at");
