-- E1: vòng đời kế hoạch APPROVED → IN_EFFECT + lịch sử phiên bản + serial mã NV
CREATE TABLE "plan_versions" (
  "id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status_before" TEXT NOT NULL,
  "status_after" TEXT NOT NULL,
  "reason" TEXT,
  "snapshot_data" JSONB NOT NULL,
  "created_by_id" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_versions_plan_id_version_key" ON "plan_versions"("plan_id", "version");

ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "task_counters" (
  "year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "task_counters_pkey" PRIMARY KEY ("year")
);
