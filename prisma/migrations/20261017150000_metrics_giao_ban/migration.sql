-- YC-16 → YC-22 — Giai đoạn 2: cấu hình chỉ tiêu giao ban + nhập liệu ngày (additive, không đụng bảng cũ)
CREATE TABLE "metric_groups" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "metric_groups_code_key" ON "metric_groups"("code");

CREATE TABLE "metric_definitions" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit_type" TEXT NOT NULL DEFAULT 'COUNT',
  "unit_label" TEXT,
  "display_scale" INTEGER NOT NULL DEFAULT 1,
  "decimals" INTEGER NOT NULL DEFAULT 0,
  "value_kind" TEXT NOT NULL DEFAULT 'FLOW',
  "derivation" JSONB,
  "require_confirm" BOOLEAN NOT NULL DEFAULT false,
  "show_on_dashboard" BOOLEAN NOT NULL DEFAULT false,
  "dashboard_order" INTEGER NOT NULL DEFAULT 0,
  "allow_backdate_days" INTEGER NOT NULL DEFAULT 0,
  "expect_daily" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "metric_definitions_code_key" ON "metric_definitions"("code");
CREATE INDEX "metric_definitions_group_id_sort_order_idx" ON "metric_definitions"("group_id", "sort_order");

CREATE TABLE "metric_classifications" (
  "id" TEXT NOT NULL,
  "metric_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_classifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "metric_classifications_metric_id_code_key" ON "metric_classifications"("metric_id", "code");

CREATE TABLE "metric_daily_entries" (
  "id" TEXT NOT NULL,
  "metric_id" TEXT NOT NULL,
  "classification_id" TEXT NOT NULL DEFAULT '',
  "entry_date" DATE NOT NULL,
  "value_numeric" DECIMAL(24,4) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECORDED',
  "note" TEXT,
  "entered_by_id" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3),
  "confirmed_by_id" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_daily_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "metric_daily_entries_metric_id_classification_id_entry_dat_key" ON "metric_daily_entries"("metric_id", "classification_id", "entry_date");
CREATE INDEX "metric_daily_entries_entry_date_idx" ON "metric_daily_entries"("entry_date");

CREATE TABLE "metric_entry_revisions" (
  "id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "old_value" DECIMAL(24,4),
  "new_value" DECIMAL(24,4),
  "old_status" TEXT,
  "new_status" TEXT,
  "reason" TEXT,
  "edited_by_id" TEXT NOT NULL,
  "edited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_entry_revisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "metric_entry_revisions_entry_id_edited_at_idx" ON "metric_entry_revisions"("entry_id", "edited_at");

CREATE TABLE "metric_baselines" (
  "id" TEXT NOT NULL,
  "metric_id" TEXT NOT NULL,
  "classification_id" TEXT NOT NULL DEFAULT '',
  "cum_kind" TEXT NOT NULL,
  "as_of_date" DATE NOT NULL,
  "value_numeric" DECIMAL(24,4) NOT NULL,
  "source_note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "proposed_by_id" TEXT,
  "confirmed_by_id" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_baselines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "metric_baselines_metric_id_classification_id_cum_kind_as_of_key" ON "metric_baselines"("metric_id", "classification_id", "cum_kind", "as_of_date");

CREATE TABLE "metric_plan_targets" (
  "id" TEXT NOT NULL,
  "metric_id" TEXT NOT NULL,
  "classification_id" TEXT NOT NULL DEFAULT '',
  "label" TEXT NOT NULL,
  "period_type" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "period_no" INTEGER,
  "value_numeric" DECIMAL(24,4) NOT NULL,
  "note" TEXT,
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_plan_targets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "metric_plan_targets_metric_id_classification_id_label_period_key" ON "metric_plan_targets"("metric_id", "classification_id", "label", "period_type", "year", "period_no");

CREATE TABLE "metric_entry_assignments" (
  "id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "group_id" TEXT,
  "metric_id" TEXT,
  "can_enter" BOOLEAN NOT NULL DEFAULT true,
  "can_confirm" BOOLEAN NOT NULL DEFAULT false,
  "allow_backdate_days" INTEGER,
  "valid_from" DATE,
  "valid_to" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_entry_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "metric_entry_assignments_person_id_active_idx" ON "metric_entry_assignments"("person_id", "active");

CREATE TABLE "narrative_sections" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "group_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "narrative_sections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "narrative_sections_code_key" ON "narrative_sections"("code");

CREATE TABLE "briefing_narratives" (
  "id" TEXT NOT NULL,
  "section_id" TEXT NOT NULL,
  "period_type" TEXT NOT NULL,
  "period_key" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "briefing_narratives_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "briefing_narratives_section_id_period_type_period_key_key" ON "briefing_narratives"("section_id", "period_type", "period_key");

ALTER TABLE "metric_definitions" ADD CONSTRAINT "metric_definitions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "metric_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metric_classifications" ADD CONSTRAINT "metric_classifications_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metric_daily_entries" ADD CONSTRAINT "metric_daily_entries_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metric_baselines" ADD CONSTRAINT "metric_baselines_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metric_plan_targets" ADD CONSTRAINT "metric_plan_targets_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metric_entry_assignments" ADD CONSTRAINT "metric_entry_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "metric_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "narrative_sections" ADD CONSTRAINT "narrative_sections_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "metric_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "briefing_narratives" ADD CONSTRAINT "briefing_narratives_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "narrative_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
