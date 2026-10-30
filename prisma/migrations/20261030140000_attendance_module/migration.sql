-- Module chấm công tháng + bàn giao người trực
CREATE TABLE "attendance_sheets" (
  "id" TEXT NOT NULL,
  "unit_id" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_sheets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_sheets_unit_id_month_year_key"
  ON "attendance_sheets"("unit_id", "month", "year");
CREATE INDEX "attendance_sheets_year_month_idx"
  ON "attendance_sheets"("year", "month");

CREATE TABLE "attendance_entries" (
  "id" TEXT NOT NULL,
  "sheet_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "symbol" TEXT NOT NULL DEFAULT 'X',
  "note" TEXT,
  "marked_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_entries_sheet_id_person_id_date_key"
  ON "attendance_entries"("sheet_id", "person_id", "date");
CREATE INDEX "attendance_entries_sheet_id_date_idx"
  ON "attendance_entries"("sheet_id", "date");

CREATE TABLE "attendance_grades" (
  "id" TEXT NOT NULL,
  "sheet_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "grade" TEXT NOT NULL,
  "reason" TEXT,
  "updated_by_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_grades_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_grades_sheet_id_person_id_key"
  ON "attendance_grades"("sheet_id", "person_id");

CREATE TABLE "attendance_handovers" (
  "id" TEXT NOT NULL,
  "unit_id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "from_person_id" TEXT NOT NULL,
  "to_person_id" TEXT NOT NULL,
  "note" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_handovers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_handovers_unit_id_date_key"
  ON "attendance_handovers"("unit_id", "date");
CREATE INDEX "attendance_handovers_unit_id_date_idx"
  ON "attendance_handovers"("unit_id", "date");
