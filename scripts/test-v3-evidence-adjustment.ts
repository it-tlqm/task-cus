/**
 * test-v3-evidence-adjustment.ts — V3.0.3: quy trình điều chỉnh minh chứng sau nghiệm thu (R3-C).
 *
 *  1) Công chức lập đề nghị (KHÔNG mở khóa hồ sơ)
 *  2) Lãnh đạo trực tiếp xem xét
 *  3) Trưởng bộ phận phê duyệt cuối cùng → mới thực hiện điều chỉnh
 *  4) Bản minh chứng cũ được GIỮ (không xoá vĩnh viễn)
 *  + Ngoại lệ chưa chốt: hai cấp trùng một người ⇒ bước phê duyệt bị KHOÁ
 */
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-evidence-adjustment"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const PASSWORD = process.env.V3_DEMO_PASSWORD || "LocalTest@2026";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}
async function login(username: string, password = PASSWORD) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`đăng nhập ${username} lỗi HTTP ${res.status}`);
  return json.token;
}
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

const created: { itemId?: string; evidenceId?: string; adjId?: string; personId?: string; accountId?: string } = {};

async function main() {
  console.log("=== V3.0.3 — QUY TRÌNH ĐIỀU CHỈNH MINH CHỨNG (R3-C, 2 CẤP) ===\n");

  const staffToken = await login("democb01");
  const leaderToken = await login("demold01");

  const staff = await prisma.person.findFirst({ where: { code: "DEMO-CB-01" } });
  const period = await prisma.reportingPeriod.findFirst({ where: { type: "MONTH", title: { contains: "10/2026" } } });
  const unitA = await prisma.orgUnit.findFirst({ where: { code: "BP_NGHIEPVU_A" } });
  const deptHeadRole = await prisma.role.findUnique({ where: { code: "DEPARTMENT_LEADER" } });
  if (!staff || !period || !unitA) return;

  // Tài khoản Trưởng bộ phận riêng (KHÁC lãnh đạo trực tiếp) để thử bước phê duyệt cuối
  const pw = crypto.randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(pw, 10);
  const dhPerson = await prisma.person.create({
    data: { code: `V3DH-${Date.now().toString(36).toUpperCase()}`, fullName: "V3 Trưởng bộ phận", status: "ACTIVE" },
  });
  created.personId = dhPerson.id;
  const dhAccount = await prisma.account.create({
    data: {
      username: `v3dh_${Date.now().toString(36)}`,
      passwordHash: hash,
      personId: dhPerson.id,
      status: "ACTIVE",
      roleGrants: { create: [{ roleId: deptHeadRole!.id, scopeType: "DEPARTMENT", scopeUnitId: unitA.id }] },
    },
  });
  created.accountId = dhAccount.id;
  const dhToken = await login(dhAccount.username, pw);
  console.log(`  (trưởng bộ phận thử: ${dhAccount.username})`);

  // ---------------------------------------------------------------- 1. Công việc + minh chứng
  const createRes = await fetch(`${BASE}/api/personal-work-items`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ personId: staff.id, periodId: period.id, title: "[V3-R3C] công việc có minh chứng", status: "IN_PROGRESS" }),
  });
  const createJson = await createRes.json().catch(() => ({}));
  created.itemId = createJson?.data?.id;
  check("1. Tạo được công việc", createRes.status === 201 && !!created.itemId, `HTTP ${createRes.status}`);
  if (!created.itemId) return;

  const fd = new FormData();
  fd.set("workItemId", created.itemId);
  fd.set("file", new Blob(["bANG chung goc"], { type: "text/plain" }), "bang-chung-goc.txt");
  const evRes = await fetch(`${BASE}/api/work-evidence`, { method: "POST", headers: { Authorization: `Bearer ${staffToken}` }, body: fd });
  const evJson = await evRes.json().catch(() => ({}));
  created.evidenceId = evJson?.data?.id;
  check("1. Tải lên minh chứng gốc", evRes.status === 201 && !!created.evidenceId, `HTTP ${evRes.status}`);

  // ---------------------------------------------------------------- 2. Chưa xác nhận thì chưa được đề nghị
  const early = await fetch(`${BASE}/api/evidence-adjustments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${staffToken}` },
    body: (() => {
      const f = new FormData();
      f.set("workItemId", created.itemId);
      f.set("kind", "REMOVE");
      f.set("reason", "Bổ sung bản thay thế sau khi xác nhận.");
      f.set("evidenceId", created.evidenceId);
      return f;
    })(),
  });
  check("2. Công việc chưa xác nhận ⇒ chưa được đề nghị điều chỉnh (409)", early.status === 409, `HTTP ${early.status}`);

  // ---------------------------------------------------------------- 3. Xác nhận công việc
  await fetch(`${BASE}/api/personal-work-items/${created.itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "Đã rà soát hồ sơ kèm minh chứng gốc.", completedOn: "2026-10-21" }),
  });
  const conf = await fetch(`${BASE}/api/personal-work-items/${created.itemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("3. Lãnh đạo xác nhận công việc", conf.status === 200, `HTTP ${conf.status}`);

  const lockedUpload = await fetch(`${BASE}/api/work-evidence`, {
    method: "POST",
    headers: { Authorization: `Bearer ${staffToken}` },
    body: (() => {
      const f = new FormData();
      f.set("workItemId", created.itemId);
      f.set("file", new Blob(["x"], { type: "text/plain" }), "moi.txt");
      return f;
    })(),
  });
  check("3. Sau khi xác nhận ⇒ khoá thêm minh chứng (409)", lockedUpload.status === 409, `HTTP ${lockedUpload.status}`);

  // ---------------------------------------------------------------- 4. Bước 1 — lập đề nghị
  const propRes = await fetch(`${BASE}/api/evidence-adjustments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${staffToken}` },
    body: (() => {
      const f = new FormData();
      f.set("workItemId", created.itemId);
      f.set("kind", "REMOVE");
      f.set("reason", "Bản gốc sai số liệu, đề nghị rút và bổ sung bản mới.");
      f.set("evidenceId", created.evidenceId);
      return f;
    })(),
  });
  const propJson = await propRes.json().catch(() => ({}));
  created.adjId = propJson?.data?.id;
  check("4. Công chức lập được đề nghị điều chỉnh", propRes.status === 201 && !!created.adjId, `HTTP ${propRes.status}`);
  const evDuring = await prisma.workEvidence.findUnique({ where: { id: created.evidenceId } });
  check("4. Đề nghị KHÔNG tự mở khóa minh chứng (vẫn ACTIVE)", evDuring?.status === "ACTIVE", String(evDuring?.status));

  const noReason = await fetch(`${BASE}/api/evidence-adjustments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${staffToken}` },
    body: (() => {
      const f = new FormData();
      f.set("workItemId", created.itemId);
      f.set("kind", "REMOVE");
      f.set("reason", "ab");
      f.set("evidenceId", created.evidenceId);
      return f;
    })(),
  });
  check("4. Đề nghị thiếu lý do ⇒ 400", noReason.status === 400, `HTTP ${noReason.status}`);

  // ---------------------------------------------------------------- 5. Bước 2 — lãnh đạo trực tiếp xem xét
  const staffEndorse = await fetch(`${BASE}/api/evidence-adjustments/${created.adjId}`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ action: "ENDORSE" }),
  });
  check("5. Công chức tự xem xét ⇒ 403", staffEndorse.status === 403, `HTTP ${staffEndorse.status}`);

  const endorse = await fetch(`${BASE}/api/evidence-adjustments/${created.adjId}`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "ENDORSE", note: "Đồng ý điều chỉnh, đã đối chiếu hồ sơ." }),
  });
  check("5. Lãnh đạo trực tiếp xem xét ⇒ 200", endorse.status === 200, `HTTP ${endorse.status}`);
  const adj1 = await prisma.workEvidenceAdjustment.findUnique({ where: { id: created.adjId } });
  check("5. Trạng thái = chờ phê duyệt cuối", adj1?.state === "LEADER_REVIEWED", String(adj1?.state));

  // ---------------------------------------------------------------- 6. Bước 3 — trưởng bộ phận phê duyệt
  const approve = await fetch(`${BASE}/api/evidence-adjustments/${created.adjId}`, {
    method: "PATCH",
    headers: H(dhToken),
    body: JSON.stringify({ action: "APPROVE", note: "Đồng ý điều chỉnh theo quy trình." }),
  });
  check("6. Trưởng bộ phận phê duyệt cuối ⇒ 200", approve.status === 200, `HTTP ${approve.status}`);
  const adj2 = await prisma.workEvidenceAdjustment.findUnique({ where: { id: created.adjId } });
  check("6. Trạng thái = đã phê duyệt", adj2?.state === "APPROVED", String(adj2?.state));
  check("6. Có ghi nhận thời điểm thực hiện", !!adj2?.appliedAt);

  const evAfter = await prisma.workEvidence.findUnique({ where: { id: created.evidenceId } });
  check("6. Minh chứng cũ được GIỮ (không xoá vĩnh viễn)", !!evAfter, evAfter ? "còn trong CSDL" : "đã mất");
  check("6. Minh chứng cũ chuyển sang WITHDRAWN", evAfter?.status === "WITHDRAWN", String(evAfter?.status));

  const delOld = await fetch(`${BASE}/api/work-evidence/${created.evidenceId}`, { method: "DELETE", headers: H(staffToken) });
  check("6. Xoá minh chứng đã rút ⇒ 409 (giữ để khôi phục)", delOld.status === 409, `HTTP ${delOld.status}`);

  // ---------------------------------------------------------------- 7. Ngoại lệ chưa chốt: hai cấp trùng một người
  const fd2 = new FormData();
  fd2.set("workItemId", created.itemId);
  fd2.set("kind", "ADD");
  fd2.set("reason", "Bổ sung bản minh chứng bổ sung theo yêu cầu.");
  const prop2 = await fetch(`${BASE}/api/evidence-adjustments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${staffToken}` },
    body: fd2,
  });
  const prop2Json = await prop2.json().catch(() => ({}));
  const adjId2 = prop2Json?.data?.id;
  check("7. Tạo được đề nghị thứ hai", prop2.status === 201 && !!adjId2, `HTTP ${prop2.status}`);
  if (adjId2) {
    await fetch(`${BASE}/api/evidence-adjustments/${adjId2}`, {
      method: "PATCH",
      headers: H(leaderToken),
      body: JSON.stringify({ action: "ENDORSE", note: "Xem xét đồng ý." }),
    });
    const selfApprove = await fetch(`${BASE}/api/evidence-adjustments/${adjId2}`, {
      method: "PATCH",
      headers: H(leaderToken),
      body: JSON.stringify({ action: "APPROVE" }),
    });
    check("7. Hai cấp phê duyệt trùng một người ⇒ KHOÁ bước phê duyệt (409)", selfApprove.status === 409, `HTTP ${selfApprove.status}`);
    const adj3 = await prisma.workEvidenceAdjustment.findUnique({ where: { id: adjId2 } });
    check("7. Đề nghị vẫn chờ xử lý (chưa áp dụng)", adj3?.state === "LEADER_REVIEWED", String(adj3?.state));
  }

  // ---------------------------------------------------------------- 8. Nhật ký
  const audit = await prisma.auditEvent.findMany({
    where: { action: { in: ["EVIDENCE_ADJUSTMENT_PROPOSE", "EVIDENCE_ADJUSTMENT_ENDORSE", "EVIDENCE_ADJUSTMENT_APPROVE"] } },
  });
  check("8. Có nhật ký đề nghị / xem xét / phê duyệt", audit.length >= 3, `${audit.length} mục`);

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exitCode = failed === 0 ? 0 : 1;
}

async function cleanup() {
  if (created.itemId) {
    try {
      await prisma.workEvidenceAdjustment.deleteMany({ where: { workItemId: created.itemId } });
      await prisma.workEvidence.deleteMany({ where: { workItemId: created.itemId } });
      await prisma.workItemReview.deleteMany({ where: { workItemId: created.itemId } });
      await prisma.personalWorkItem.delete({ where: { id: created.itemId } });
    } catch {}
  }
  if (created.accountId) {
    try {
      await prisma.roleGrant.deleteMany({ where: { accountId: created.accountId } });
      await prisma.account.delete({ where: { id: created.accountId } });
    } catch {}
  }
  if (created.personId) {
    try {
      await prisma.person.delete({ where: { id: created.personId } });
    } catch {}
  }
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
