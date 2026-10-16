-- Luu san loai su kien (kind) tren TaskUpdate de timeline khoi doan bang chu
ALTER TABLE "task_updates" ADD COLUMN IF NOT EXISTS "kind" TEXT;
