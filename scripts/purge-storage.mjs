/**
 * purge-storage.mjs — DỌN KHO TỆP Storage sau khi đã lưu trữ (archive) đầy đủ.
 *
 * Mục đích: sau khi làm sạch dữ liệu nghiệp vụ, KHÔNG còn tệp cũ tải được công khai.
 *
 * Lệnh:
 *   node scripts/purge-storage.mjs --bucket=task-attachments --dry-run     (xem danh sach)
 *   node scripts/purge-storage.mjs --bucket=task-attachments --confirm=PURGE-2026-10-22
 *
 * Yêu cầu khóa service-role (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY).
 * KHÔNG in khoá ra log. KHÔNG xoá nếu chưa có --confirm.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const REPO = "D:/thanhnx/OpenCode/talung-cus-work/";
const creq = createRequire(path.join(REPO, "package.json"));

const arg = (k, d = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const BUCKET = arg("bucket", process.env.SUPABASE_STORAGE_BUCKET || "task-attachments");
const CONFIRM = arg("confirm", "");
const DRY = process.argv.includes("--dry-run") || !CONFIRM;
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");

if (!URL) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL");
  process.exit(2);
}
if (!KEY) {
  console.error(
    "Thiếu khóa service-role (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY).\n" +
      "KHÔNG dùng publishable key để xoá (không đủ quyền). Thiết lập secret trên máy chủ/Vercel."
  );
  process.exit(2);
}
if (!DRY && CONFIRM !== "PURGE-2026-10-22") {
  console.error("Cần --confirm=PURGE-2026-10-22 để thực thi xoá.");
  process.exit(2);
}

const H = { apikey: KEY, Authorization: "Bearer " + KEY };

async function listObjects(prefix = "") {
  const out = [];
  let cursor = "";
  do {
    const r = await fetch(`${URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) }),
    });
    if (!r.ok) throw new Error(`list khong duoc (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`);
    const items = await r.json();
    for (const it of items) {
      if (it.name && it.name.includes("/")) out.push(it.name); // thư mục con → đệ quy
      else if (it.name) out.push(it.name);
    }
    cursor = items.length === 1000 ? items[items.length - 1].name : "";
    if (items.length === 0) break;
    if (!cursor) break;
  } while (true);
  return out;
}

async function remove(key) {
  const r = await fetch(`${URL}/storage/v1/object/${BUCKET}/${key}`, { method: "DELETE", headers: H });
  return r.ok;
}

(async () => {
  console.log(`BUCKET: ${BUCKET} | che do: ${DRY ? "DRY-RUN (khong xoa)" : "THUC THI XOA"}`);
  const objects = await listObjects();
  console.log(`  so doi tuong: ${objects.length}`);
  for (const o of objects.slice(0, 50)) console.log(`   - ${o}`);
  if (objects.length > 50) console.log(`   ... va ${objects.length - 50} doi tuong khac`);

  if (DRY) {
    const out = path.join(REPO, "demo-ops", "reset", "storage-purge-plan.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ bucket: BUCKET, objects, generatedAt: new Date().toISOString() }, null, 2));
    console.log(`  KE HOACH: ${path.relative(REPO, out)}`);
    console.log("  (chua xoa gi — them --confirm=PURGE-2026-10-22 de thuc thi)");
    return;
  }

  let ok = 0, fail = 0;
  for (const o of objects) {
    if (await remove(o)) ok++;
    else fail++;
  }
  console.log(`  da xoa: ${ok} | that bai: ${fail}`);
  const after = await listObjects();
  console.log(`  con lai trong bucket: ${after.length}`);
  if (after.length > 0) {
    console.error("KET QUA: FAIL - bucket chua sach");
    process.exit(1);
  }
  console.log("KET QUA: PASS - bucket sach");
})().catch((e) => {
  console.error("LOI:", String(e.message).slice(0, 300));
  process.exit(1);
});
