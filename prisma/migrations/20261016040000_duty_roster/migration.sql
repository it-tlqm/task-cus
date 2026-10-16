-- Lich truc ca (additive)
CREATE TABLE "duty_rosters" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "shift" TEXT NOT NULL DEFAULT 'CA_NGAY',
  "post" TEXT,
  "person_id" TEXT NOT NULL,
  "unit_id" TEXT,
  "notes" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "duty_rosters_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "duty_rosters_date_unit_id_idx" ON "duty_rosters"("date", "unit_id");
ALTER TABLE "duty_rosters" ADD CONSTRAINT "duty_rosters_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "duty_rosters" ADD CONSTRAINT "duty_rosters_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
