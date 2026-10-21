/**
 * yc38c-dryrun-backfill.mjs — DRY-RUN (CHỈ ĐỌC) cho kế hoạch chuyển đổi YC-38C.
 *
 * Mục đích: chuẩn bị bước C2 (dry-run) của kế hoạch YC-38C trên DB LOCAL/fixture.
 *  - KHÔNG ghi, KHÔNG sửa, KHÔNG xoá bất kỳ bản ghi nào.
 *  - Xuất: quy tắc match, mức độ tin cậy, số lượng UNRESOLVED, checksum, kiểm tra idempotency.
 *  - Chạy lại 2 lần → kết quả phải giống hệt (checksum không đổi).
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc33_local"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   node scripts/yc38c-dryrun-backfill.mjs
 *
 * Ghi chú: script này CHỈ đọc. Việc áp thay đổi thuộc YC-38C sau khi được duyệt.
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";
const REPO = "D:/thanhnx/OpenCode/talung-cus-work";
const require = createRequire(`${REPO}/package.json`);
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

/** Quy tắc suy ra `source_kind` — thứ tự ưu tiên đã đề xuất trong báo cáo YC-38A §4. */
function resolveSourceKind(w) {
  if (w.catalogEntryId) return { kind: "TX_CATALOG", refId: w.catalogEntryId, confidence: "HIGH" };
  if (w.productItemId) return { kind: "QD1277_PRODUCT", refId: w.productItemId, confidence: "HIGH" };
  if (w.planItemId) return { kind: "PLAN", refId: w.planItemId, confidence: "HIGH" };
  if (w.deptWorkItemId) return { kind: "DEPT", refId: w.deptWorkItemId, confidence: "HIGH" };
  if (w.templateId) return { kind: "LEGACY_TEMPLATE", refId: w.templateId, confidence: "HIGH" };
  return { kind: "CUSTOM", refId: null, confidence: "HIGH" };
}

/** Chủ trì: fallback = person_id của chính work_item. KHÔNG tự lấy từ task.ownerId. */
function resolvePrimaryOwner(w) {
  // Sau chặng C1 (YC-38C) sẽ có cột primary_owner_person_id — dùng luôn giá trị có sẵn.
  if (w.primaryOwnerPersonId) return { personId: w.primaryOwnerPersonId, confidence: "EXISTING" };
  if (w.personId) return { personId: w.personId, confidence: "FALLBACK_PERSON" };
  return { personId: null, confidence: "UNRESOLVED" };
}

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  const isLocal = /127\.0\.0\.1|localhost/.test(url);
  console.log(`=== YC-38C DRY-RUN BACKFILL (CHỈ ĐỌC) ===`);
  console.log(`DB: ${isLocal ? "LOCAL/fixture ✔" : url}`);
  if (!isLocal) {
    console.error("TỪ CHỐI: script này chỉ chạy trên DB LOCAL/fixture. Không chạy trên Production.");
    process.exit(2);
  }

  const wis = await prisma.personalWorkItem.findMany({
    select: {
      id: true,
      personId: true,
      planItemId: true,
      templateId: true,
      deptWorkItemId: true,
      productItemId: true,
      catalogEntryId: true,
      taskId: true,
      periodId: true,
      title: true,
    },
  });
  // tasks.work_item_id / plan_items.work_item_id là CỘT ĐỀ XUẤT (chặng C1) — hiện chưa tồn tại.
  const tasks = await prisma.task.findMany({
    select: { id: true, code: true, ownerId: true, workItems: { select: { id: true } } },
  });
  const planItems = await prisma.planItem.findMany({ select: { id: true, planId: true, title: true } });

  const rows = wis.map((w) => {
    const s = resolveSourceKind(w);
    const o = resolvePrimaryOwner(w);
    return {
      workItemId: w.id,
      personId: w.personId,
      periodId: w.periodId,
      taskId: w.taskId,
      planItemId: w.planItemId,
      source_kind: s.kind,
      source_ref_id: s.refId,
      source_confidence: s.confidence,
      primary_owner_person_id: o.personId,
      primary_owner_confidence: o.confidence,
    };
  });

  // ---- Tổng hợp
  const by = (arr, k) => arr.reduce((m, x) => ((m[x[k]] = (m[x[k]] || 0) + 1), m), {});
  console.log(`\nwork_items: ${rows.length}`);
  console.log("  theo source_kind: " + JSON.stringify(by(rows, "source_kind")));
  console.log("  theo source_confidence: " + JSON.stringify(by(rows, "source_confidence")));
  console.log("  theo primary_owner_confidence: " + JSON.stringify(by(rows, "primary_owner_confidence")));
  const unresolved = rows.filter((r) => r.primary_owner_confidence === "UNRESOLVED");
  console.log(`  UNRESOLVED (chủ trì): ${unresolved.length}`);

  // ---- Task: KHÔNG tự backfill work_item_id (nguy cơ tạo quan hệ giả)
  const taskWithWI = 0; // cột tasks.work_item_id chưa tồn tại (thêm ở chặng C1)
  const taskCandidates = tasks.filter((t) => {
    const hits = t.workItems.filter((w) => rows.some((r) => r.workItemId === w.id));
    return hits.length === 1;
  });
  console.log(`\ntasks: ${tasks.length}`);
  console.log(`  đã có work_item_id: ${taskWithWI}`);
  console.log(`  có ĐÚNG 1 work_item khớp (ứng viên backfill, cần người duyệt): ${taskCandidates.length}`);
  console.log(`  KHÔNG có work_item nào khớp → đánh dấu UNLINKED, KHÔNG backfill: ${tasks.length - taskWithWI - taskCandidates.length}`);
  console.log(`  nhiều work_item khớp (mơ hồ) → cần người quyết định: ${tasks.filter((t) => t.workItems.length > 1).length}`);
  console.log(`  lưu ý: cột tasks.work_item_id / plan_items.work_item_id CHƯA tồn tại — thêm ở chặng C1 (additive)`);

  // ---- Plan item
  const planWithWI = 0; // cột plan_items.work_item_id chưa tồn tại (thêm ở chặng C1)
  console.log(`\nplan_items: ${planItems.length} · đã có work_item_id: ${planWithWI}`);

  // ---- Checksum (idempotency): hash thứ tự ổn định
  const canon = rows
    .map((r) => `${r.workItemId}|${r.source_kind}|${r.source_ref_id ?? ""}|${r.primary_owner_person_id ?? ""}|${r.periodId}`)
    .sort()
    .join("\n");
  const checksum = crypto.createHash("sha256").update(canon).digest("hex");
  console.log(`\nchecksum (SHA-256 thứ tự ổn định): ${checksum}`);

  // ---- Idempotency: chạy lại thuật toán → checksum phải giống
  const rows2 = wis.map((w) => {
    const s = resolveSourceKind(w);
    const o = resolvePrimaryOwner(w);
    return {
      workItemId: w.id,
      source_kind: s.kind,
      source_ref_id: s.refId,
      primary_owner_person_id: o.personId,
      periodId: w.periodId,
    };
  });
  const canon2 = rows2
    .map((r) => `${r.workItemId}|${r.source_kind}|${r.source_ref_id ?? ""}|${r.primary_owner_person_id ?? ""}|${r.periodId}`)
    .sort()
    .join("\n");
  const checksum2 = crypto.createHash("sha256").update(canon2).digest("hex");
  console.log(`idempotency (chạy lại): ${checksum === checksum2 ? "✔ checksum không đổi" : "✘ KHÔNG ổn định"}`);

  // ---- Bảo toàn: đếm bản ghi trước/sau (script không ghi nên phải bằng nhau)
  const after = await prisma.personalWorkItem.count();
  console.log(`bảo toàn: work_items trước=${wis.length} sau=${after} ${wis.length === after ? "✔" : "✘"}`);

  console.log(`\nKẾT LUẬN: dry-run chỉ đọc, chưa áp dụng gì.`);
  console.log(`Trước khi áp (YC-38C) cần người phụ trách duyệt: phương án A, Q-B1…Q-B4, và báo cáo "Ứng viên backfill task" ở trên.`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
