-- Chong tao trung ky cong tac (da kiem tra: khong co ban ghi trung hien huu)
CREATE UNIQUE INDEX IF NOT EXISTS "reporting_periods_type_title_key" ON "reporting_periods"("type", "title");
