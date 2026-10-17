-- YC-16 → YC-22 — Giai đoạn 3: báo cáo giao ban (cấu trúc khối hiển thị + phiên bản snapshot) — additive, không đụng bảng cũ
CREATE TABLE "report_blocks" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "kind" TEXT NOT NULL DEFAULT 'HEADING',
  "group_id" TEXT,
  "section_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_blocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "report_blocks_code_key" ON "report_blocks"("code");

CREATE TABLE "briefing_report_versions" (
  "id" TEXT NOT NULL,
  "period_type" TEXT NOT NULL,
  "period_key" TEXT NOT NULL,
  "version_no" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "meeting_start" TEXT,
  "meeting_end" TEXT,
  "content_json" JSONB NOT NULL,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "briefing_report_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "briefing_report_versions_period_type_period_key_version_no_key" ON "briefing_report_versions"("period_type", "period_key", "version_no");
CREATE INDEX "briefing_report_versions_period_type_period_key_idx" ON "briefing_report_versions"("period_type", "period_key");

ALTER TABLE "report_blocks" ADD CONSTRAINT "report_blocks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "metric_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_blocks" ADD CONSTRAINT "report_blocks_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "narrative_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
