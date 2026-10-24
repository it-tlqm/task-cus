/**
 * purge-storage.mjs — DỌN KHO TỆP Storage sau khi đã lưu trữ (archive) đầy đủ.
 *
 * Mục đích: sau khi làm sạch dữ liệu nghiệp vụ, KHÔNG còn tệp cũ tải được công khai.
 *
 * Lệnh:
 *   node scripts/purge-storage.mjs --bucket=task-attachments --dry-run     (xem danh sach)
 *   STORAGE_PURGE_TOKEN=<bi-mat> node scripts/purge-storage.mjs --bucket=task-attachments --confirm="$STORAGE_PURGE_TOKEN"
 *
 * Yêu cầu khóa service-role (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY)
 * và STORAGE_PURGE_TOKEN cho lượt xoá thật. KHÔNG in khoá/token ra log.
 * KHÔNG xoá nếu chưa có --confirm; mặc định dry-run.
 * Bucket work-evidence bị chặn cứng (cần quy trình riêng có backup/phê duyệt).
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
// Không cho `.`/`..`/segment rỗng trong key: tránh DELETE thoát khỏi bucket.
const isSafeKey = (key) =>
  typeof key === "string" &&
  key.length > 0 &&
  key.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
const BUCKET = String(arg("bucket", process.env.SUPABASE_STORAGE_BUCKET || "task-attachments")).trim();
const EXPECTED_CONFIRM = (process.env.STORAGE_PURGE_TOKEN || "").trim();
const CONFIRM = arg("confirm", "");
const DRY = process.argv.includes("--dry-run") || !CONFIRM;
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");

// Tên bucket là MỘT segment URL: chặn separator/dot-segment và mọi biến thể work-evidence.
if (
  !BUCKET ||
  BUCKET === "." ||
  BUCKET === ".." ||
  BUCKET.includes("/") ||
  BUCKET.includes("\\") ||
  BUCKET.toLowerCase().includes("work-evidence")
) {
  console.error(
    "Bucket không hợp lệ hoặc bị chặn: work-evidence (và biến thể) phải được dọn bằng quy trình riêng có backup và phê duyệt."
  );
  process.exit(2);
}
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
if (!DRY && !EXPECTED_CONFIRM) {
  console.error(
    "Thiếu STORAGE_PURGE_TOKEN — chỉ cho phép dry-run. Đặt biến môi trường này trên máy chạy lệnh rồi dùng --confirm=\"$STORAGE_PURGE_TOKEN\"."
  );
  process.exit(2);
}
if (!DRY && CONFIRM !== EXPECTED_CONFIRM) {
  console.error("Xác nhận không khớp STORAGE_PURGE_TOKEN — chỉ cho phép dry-run.");
  process.exit(2);
}

const H = { apikey: KEY, Authorization: "Bearer " + KEY };

async function listObjects(prefix = "") {
  const out = [];
  let cursor = "";
  do {
    const r = await fetch(`${URL}/storage/v1/object/list/${encodeURIComponent(BUCKET)}`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) }),
    });
    if (!r.ok) throw new Error(`list khong duoc (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`);
    const items = await r.json();
    for (const it of items) {
      if (!it?.name) continue;
      if (!isSafeKey(it.name)) {
        throw new Error("Tên object không an toàn (dot-segment/rỗng) — dừng để tránh xoá ngoài bucket");
      }
      out.push(it.name);
    }
    cursor = items.length === 1000 ? items[items.length - 1].name : "";
    if (items.length === 0) break;
    if (!cursor) break;
  } while (true);
  return out;
}

async function remove(key) {
  if (!isSafeKey(key)) return false;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const r = await fetch(`${URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodedKey}`, {
    method: "DELETE",
    headers: H,
  });
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
    console.log(
      '  (chua xoa gi — dat STORAGE_PURGE_TOKEN va them --confirm="$STORAGE_PURGE_TOKEN" de thuc thi)'
    );
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
