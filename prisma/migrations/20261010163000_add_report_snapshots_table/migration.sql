-- CreateTable
CREATE TABLE "report_snapshots" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "snapshot_data" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "locked_by_id" TEXT NOT NULL,
    "locked_by_name" TEXT NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'LOCKED',
    "scope_unit_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_snapshots_code_key" ON "report_snapshots"("code");

-- CreateIndex
CREATE INDEX "report_snapshots_checksum_idx" ON "report_snapshots"("checksum");

-- CreateIndex
CREATE INDEX "report_snapshots_period_id_status_idx" ON "report_snapshots"("period_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "report_snapshots_period_id_version_key" ON "report_snapshots"("period_id", "version");

-- AddForeignKey
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "reporting_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_scope_unit_id_fkey" FOREIGN KEY ("scope_unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
