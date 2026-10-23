/**
 * YC-10 Phase 2 — mức chất lượng kết quả Task (65..100, bước 5).
 *
 * Chạy trên DB fixture cục bộ: talung_v3_approval_impl_quality (port 3117).
 * Server phải chạy với V3_YC10_QUALITY=true cho phần HTTP.
 * Phần "flag off" kiểm tra trực tiếp service với env=false (không cần restart server).
 */
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const bcrypt = creq("bcryptjs");
const ExcelJS = creq("exceljs");

const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-yc10-quality"
);
process.env.DATABASE_URL = dbUrl;
process.env.DIRECT_URL = dbUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET || "phase_a_local_test_secret";

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3117";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = `YC10-${Date.now().toString().slice(-6)}`;
const createdTaskIds: string[] = [];
const createdMonthlyIds: string[] = [];
const tempAccountIds: string[] = [];

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
};

const QUALITY_VALUES = [65, 70, 75, 80, 85, 90, 95, 100];
const INVALID_VALUES: Array<number | string> = [60, 64, 66, 72, 99, 101, 65.5, "80"];

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`đăng nhập ${username} lỗi HTTP ${res.status}`);
  return json.token as string;
}
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

async function createTask(input: {
  code: string;
  title: string;
  ownerId: string;
  unitId: string;
  collaboratorId?: string;
  status?: string;
  actualResultText?: string;
}) {
  const row = await prisma.task.create({
    data: {
      code: input.code,
      title: input.title,
      ownerId: input.ownerId,
      unitId: input.unitId,
      status: input.status || "WAITING_REVIEW",
      priority: "Trung bình",
      originalDeadline: new Date("2026-12-31T00:00:00.000Z"),
      currentDeadline: new Date("2026-12-31T00:00:00.000Z"),
      description: TAG,
      actualResultText: input.actualResultText ?? `Kết quả ${input.code}`,
      assignees: input.collaboratorId
        ? { create: [{ personId: input.collaboratorId, role: "COLLABORATOR" }] }
        : undefined,
    },
  });
  createdTaskIds.push(row.id);
  return row;
}

async function createTempAccount(input: {
  username: string;
  fullName: string;
  roleCode: "UNIT_LEADER" | "SYSTEM_ADMIN";
  unitId: string;
}) {
  const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
  if (!role) throw new Error(`thiếu role ${input.roleCode}`);
  const person = await prisma.person.create({
    data: {
      code: `${input.username.toUpperCase()}-CODE`,
      fullName: input.fullName,
      status: "ACTIVE",
      assignments: { create: [{ unitId: input.unitId, isPrimary: true }] },
    },
  });
  const account = await prisma.account.create({
    data: {
      personId: person.id,
      username: input.username,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      status: "ACTIVE",
      roleGrants: {
        create: [
          {
            roleId: role.id,
            scopeType: input.roleCode === "UNIT_LEADER" ? "ORGANIZATION" : "ORGANIZATION",
          },
        ],
      },
    },
  });
  tempAccountIds.push(account.id);
  return { person, account };
}

function toSessionUser(account: any, person: any): any {
  const grant = account.roleGrants[0];
  return {
    id: account.id,
    personId: person.id,
    username: account.username,
    fullName: person.fullName,
    personCode: person.code,
    unitId: person.assignments?.[0]?.unitId,
    unitName: person.assignments?.[0]?.unit?.name,
    role: grant?.role?.code || "UNIT_LEADER",
    scopeType: grant?.scopeType || "ORGANIZATION",
    scopeUnitId: grant?.scopeUnitId ?? null,
    permissions: [],
  };
}

async function decision(
  token: string,
  taskId: string,
  body: Record<string, unknown>
) {
  const res = await fetch(`${BASE}/api/approvals/TASK_RESULT/${taskId}/decision`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function preview(token: string, taskId: string) {
  const res = await fetch(`${BASE}/api/approvals/TASK_RESULT/${taskId}/preview`, {
    headers: H(token),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json, data: json?.data };
}

async function getTask(token: string, taskId: string) {
  const res = await fetch(`${BASE}/api/tasks/${taskId}`, { headers: H(token) });
  const json = await res.json().catch(() => ({}));
  return { res, json, task: json?.data };
}

async function caseOf(taskId: string) {
  return prisma.approvalCase.findUnique({
    where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: taskId } },
    include: {
      decisions: { orderBy: { createdAt: "asc" } },
      qualityAdjustments: { orderBy: { requestedAt: "asc" } },
    },
  });
}

function cellSnapshot(ws: any): string {
  const rows: any[] = [];
  ws.eachRow({ includeEmpty: true }, (row: any, rowNumber: number) => {
    const vals: any[] = [];
    row.eachCell({ includeEmpty: true }, (cell: any, col: number) => {
      vals.push([col, cell.value]);
    });
    rows.push([rowNumber, vals]);
  });
  return JSON.stringify(rows);
}

async function main() {
  console.log(`=== YC-10 PHASE 2 QUALITY — ${BASE} ===\n`);

  const accounts = await prisma.account.findMany({
    include: {
      person: { include: { assignments: { where: { isPrimary: true }, include: { unit: true } } } },
      roleGrants: { include: { role: true } },
    },
  });
  const leaderAccount = accounts.find(
    (a) => a.username === "demold01" && a.roleGrants.some((g) => g.role.code === "UNIT_LEADER")
  );
  const ownerAccount = accounts.find((a) => a.username === "democb01");
  const collabAccount = accounts.find((a) => a.username === "democb02");
  if (!leaderAccount || !ownerAccount || !collabAccount) {
    console.log("  THIẾU tài khoản fixture (demold01/democb01/democb02) — bỏ qua.");
    return;
  }
  const unitId =
    ownerAccount.person.assignments[0]?.unitId ||
    leaderAccount.person.assignments[0]!.unitId;
  const leaderUnitId = leaderAccount.person.assignments[0]!.unitId;

  const tokLeader = await login(leaderAccount.username);
  const tokOwner = await login(ownerAccount.username);
  const tokCollab = await login(collabAccount.username);

  const tempLeader = await createTempAccount({
    username: `yc10leader${TAG.slice(-4).toLowerCase()}`,
    fullName: `${TAG} Lãnh đạo dự phòng`,
    roleCode: "UNIT_LEADER",
    unitId: leaderUnitId,
  });
  const tempLeader2 = await createTempAccount({
    username: `yc10leader2${TAG.slice(-4).toLowerCase()}`,
    fullName: `${TAG} Lãnh đạo dự phòng 2`,
    roleCode: "UNIT_LEADER",
    unitId: leaderUnitId,
  });
  const tempAdmin = await createTempAccount({
    username: `yc10admin${TAG.slice(-4).toLowerCase()}`,
    fullName: `${TAG} Quản trị kỹ thuật`,
    roleCode: "SYSTEM_ADMIN",
    unitId: leaderUnitId,
  });
  const tokTempLeader = await login(tempLeader.account.username);
  const tokTempLeader2 = await login(tempLeader2.account.username);
  const tokTempAdmin = await login(tempAdmin.account.username);

  // Baseline score/QĐ1277/monthly
  const baselineMonthly = await prisma.monthlyWorkResult.count();
  const baselineProducts = await prisma.productItem.count();
  const baselineWorkProducts = await prisma.workItemProduct.count();
  const baselineAssessments = await prisma.evaluationAssessment.count();
  const sampleProduct = await prisma.productItem.findFirst({
    select: { id: true, convertFactor: true, maxScore: true, pointValue: true },
  });

  // ================================================================
  // A. Flag + preview + validation (không mutation)
  // ================================================================
  console.log("\n--- A. Flag / preview / validate ---");
  const taskA = await createTask({
    code: `${TAG}-A`,
    title: `${TAG} nhiệm vụ A`,
    ownerId: ownerAccount.personId,
    unitId,
    collaboratorId: collabAccount.personId,
  });

  let pv = await preview(tokLeader, taskA.id);
  check("A1. Preview leader 200", pv.res.ok, `HTTP ${pv.res.status}`);
  check("A2. Flag quality bật trong preview", pv.data?.quality?.enabled === true);
  check("A3. Quality required = true với TASK_RESULT", pv.data?.quality?.required === true);
  check("A4. Chưa có quality => original/effective NULL", pv.data?.quality?.original === null && pv.data?.quality?.effective === null);
  check("A5. Leader xem được quality (visible)", pv.data?.quality?.visible === true);

  let d = await decision(tokLeader, taskA.id, { action: "AGREE" });
  check("A6. AGREE thiếu quality => 422", d.res.status === 422, `HTTP ${d.res.status}`);
  check("A7. Không tạo ApprovalCase khi 422", (await caseOf(taskA.id)) === null);
  check(
    "A8. Task vẫn WAITING_REVIEW khi 422",
    (await prisma.task.findUnique({ where: { id: taskA.id } }))?.status === "WAITING_REVIEW"
  );

  for (const invalid of INVALID_VALUES) {
    d = await decision(tokLeader, taskA.id, { action: "AGREE", qualityPercent: invalid });
    check(
      `A9. AGREE quality ${String(invalid)} => 422, không mutation`,
      d.res.status === 422 && (await caseOf(taskA.id)) === null,
      `HTTP ${d.res.status}`
    );
  }

  d = await decision(tokLeader, taskA.id, { action: "AGREE", qualityPercent: 65 });
  const caseA = await caseOf(taskA.id);
  const taskAAfter = await prisma.task.findUnique({ where: { id: taskA.id } });
  check("A10. AGREE 65 => 200", d.res.status === 200, `HTTP ${d.res.status}`);
  check("A11. Task COMPLETED", taskAAfter?.status === "COMPLETED", String(taskAAfter?.status));
  check("A12. Decision quality 65", caseA?.decisions[0]?.qualityPercent === 65);
  check("A13. Case AGREED", caseA?.status === "AGREED");

  pv = await preview(tokLeader, taskA.id);
  check("A14. Preview original/effective 65", pv.data?.quality?.original === 65 && pv.data?.quality?.effective === 65);
  check("A15. History có vòng 1 AGREE quality 65", pv.data?.quality?.history?.[0]?.qualityPercent === 65);
  check(
    "A16. MonthlyWorkResult không sinh cho task test",
    (await prisma.monthlyWorkResult.count({ where: { taskId: taskA.id } })) === 0
  );

  // Các mức hợp lệ còn lại (70..100)
  console.log("\n--- A2. Các mức hợp lệ 70..100 ---");
  for (const value of QUALITY_VALUES.filter((v) => v !== 65)) {
    const t = await createTask({
      code: `${TAG}-V${value}`,
      title: `${TAG} nhiệm vụ quality ${value}`,
      ownerId: ownerAccount.personId,
      unitId,
    });
    const r = await decision(tokLeader, t.id, { action: "AGREE", qualityPercent: value });
    const c = await caseOf(t.id);
    check(
      `A17. AGREE quality ${value} => 200 + lưu đúng`,
      r.res.status === 200 && c?.decisions[0]?.qualityPercent === value,
      `HTTP ${r.res.status}`
    );
  }

  // ================================================================
  // B. REJECT / CLARIFY optional
  // ================================================================
  console.log("\n--- B. REJECT/CLARIFY không bắt buộc ---");
  const taskB1 = await createTask({
    code: `${TAG}-B1`,
    title: `${TAG} nhiệm vụ B1`,
    ownerId: ownerAccount.personId,
    unitId,
  });
  d = await decision(tokLeader, taskB1.id, { action: "REJECT", reason: "Chưa đạt nội dung" });
  let caseB1 = await caseOf(taskB1.id);
  check("B1. REJECT không quality => 200", d.res.status === 200, `HTTP ${d.res.status}`);
  check("B2. REJECT quality NULL", caseB1?.decisions[0]?.qualityPercent === null);
  check(
    "B3. Task trả về IN_PROGRESS",
    (await prisma.task.findUnique({ where: { id: taskB1.id } }))?.status === "IN_PROGRESS"
  );

  const taskB2 = await createTask({
    code: `${TAG}-B2`,
    title: `${TAG} nhiệm vụ B2`,
    ownerId: ownerAccount.personId,
    unitId,
  });
  d = await decision(tokLeader, taskB2.id, { action: "CLARIFY", content: "Cần giải trình thêm" });
  check("B4. CLARIFY không quality => 200", d.res.status === 200, `HTTP ${d.res.status}`);
  check("B5. CLARIFY quality NULL", (await caseOf(taskB2.id))?.decisions[0]?.qualityPercent === null);

  const taskB3 = await createTask({
    code: `${TAG}-B3`,
    title: `${TAG} nhiệm vụ B3`,
    ownerId: ownerAccount.personId,
    unitId,
  });
  d = await decision(tokLeader, taskB3.id, { action: "REJECT", reason: "Trả lại", qualityPercent: 70 });
  check("B6. REJECT kèm quality 70 => 200", d.res.status === 200, `HTTP ${d.res.status}`);
  check("B7. REJECT lưu quality 70 (chỉ lịch sử)", (await caseOf(taskB3.id))?.decisions[0]?.qualityPercent === 70);

  const taskB4 = await createTask({
    code: `${TAG}-B4`,
    title: `${TAG} nhiệm vụ B4`,
    ownerId: ownerAccount.personId,
    unitId,
  });
  d = await decision(tokLeader, taskB4.id, { action: "REJECT", reason: "Trả lại", qualityPercent: 72 });
  check(
    "B8. REJECT quality 72 => 422, không tạo case",
    d.res.status === 422 && (await caseOf(taskB4.id)) === null,
    `HTTP ${d.res.status}`
  );

  // ================================================================
  // C. Lịch sử theo vòng + quality hiệu lực
  // ================================================================
  console.log("\n--- C. Lịch sử theo vòng ---");
  const taskC = await createTask({
    code: `${TAG}-C`,
    title: `${TAG} nhiệm vụ C`,
    ownerId: ownerAccount.personId,
    unitId,
  });
  d = await decision(tokLeader, taskC.id, {
    action: "CLARIFY",
    content: "Cần bổ sung minh chứng",
    qualityPercent: 70,
  });
  check("C1. Vòng 1 CLARIFY quality 70", d.res.status === 200, `HTTP ${d.res.status}`);
  let resp = await fetch(`${BASE}/api/approvals/TASK_RESULT/${taskC.id}/response`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({ content: "Đã bổ sung nội dung" }),
  });
  check("C2. Owner gửi giải trình => 200", resp.status === 200, `HTTP ${resp.status}`);
  d = await decision(tokLeader, taskC.id, { action: "AGREE", qualityPercent: 85 });
  check("C3. Vòng 2 AGREE quality 85", d.res.status === 200, `HTTP ${d.res.status}`);
  pv = await preview(tokLeader, taskC.id);
  const historyC = pv.data?.quality?.history || [];
  check(
    "C4. History giữ vòng 1 (70) + vòng 2 (85)",
    historyC.length === 2 && historyC[0].qualityPercent === 70 && historyC[1].qualityPercent === 85,
    JSON.stringify(historyC.map((h: any) => `${h.round}:${h.qualityPercent}`))
  );
  check(
    "C5. Quality gốc = AGREE cuối (85), effective 85",
    pv.data?.quality?.original === 85 && pv.data?.quality?.effective === 85
  );

  // ================================================================
  // D. Visibility
  // ================================================================
  console.log("\n--- D. Quyền xem quality ---");
  let detail = await getTask(tokOwner, taskA.id);
  check("D1. Owner thấy quality", detail.task?.approval?.quality?.visible === true && detail.task?.approval?.quality?.effective === 65);
  detail = await getTask(tokLeader, taskA.id);
  check("D2. Leader thấy quality", detail.task?.approval?.quality?.visible === true);
  detail = await getTask(tokCollab, taskA.id);
  check(
    "D3. Collaborator không thấy quality (visible=false, không dữ liệu)",
    detail.task?.approval?.quality?.visible === false &&
      detail.task?.approval?.quality?.effective === null &&
      (detail.task?.approval?.quality?.history || []).length === 0
  );
  pv = await preview(tokCollab, taskA.id);
  check(
    "D4. Preview collaborator ẩn quality",
    pv.res.ok && pv.data?.quality?.visible === false && pv.data?.quality?.effective === null,
    `HTTP ${pv.res.status}`
  );
  pv = await preview(tokOwner, taskA.id);
  check("D5. Preview owner thấy quality", pv.data?.quality?.visible === true);
  const adminPreview = await preview(tokTempAdmin, taskA.id);
  check("D6. SYSTEM_ADMIN preview Task => 403", adminPreview.res.status === 403, `HTTP ${adminPreview.res.status}`);
  const adminDecision = await decision(tokTempAdmin, taskA.id, { action: "REJECT", reason: "x" });
  check("D7. SYSTEM_ADMIN quyết định => 403", adminDecision.res.status === 403, `HTTP ${adminDecision.res.status}`);

  // ================================================================
  // E. Adjustment A1
  // ================================================================
  console.log("\n--- E. Điều chỉnh chất lượng A1 ---");
  const adjReq = async (token: string, taskId: string, body: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/api/approvals/TASK_RESULT/${taskId}/quality-adjustments`, {
      method: "POST",
      headers: H(token),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  };
  const adjDecide = async (token: string, id: string, body: Record<string, unknown>) => {
    const res = await fetch(`${BASE}/api/approvals/quality-adjustments/${id}/decision`, {
      method: "POST",
      headers: H(token),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  };

  let ar = await adjReq(tokOwner, taskA.id, { newQualityPercent: 80 });
  check("E1. Thiếu lý do => 422", ar.res.status === 422, `HTTP ${ar.res.status}`);
  ar = await adjReq(tokOwner, taskA.id, { newQualityPercent: 72, reason: "Sai" });
  check("E2. New quality 72 => 422", ar.res.status === 422, `HTTP ${ar.res.status}`);
  ar = await adjReq(tokOwner, taskA.id, { newQualityPercent: 65, reason: "Trùng" });
  check("E3. Trùng mức hiện tại 65 => 422", ar.res.status === 422, `HTTP ${ar.res.status}`);
  ar = await adjReq(tokCollab, taskA.id, { newQualityPercent: 80, reason: "Collaborator" });
  check("E4. Collaborator yêu cầu => 403", ar.res.status === 403, `HTTP ${ar.res.status}`);
  ar = await adjReq(tokTempAdmin, taskA.id, { newQualityPercent: 80, reason: "Admin" });
  check("E5. SYSTEM_ADMIN yêu cầu => 403", ar.res.status === 403, `HTTP ${ar.res.status}`);

  ar = await adjReq(tokOwner, taskA.id, {
    newQualityPercent: 80,
    reason: "Điều chỉnh theo kết luận họp",
  });
  check("E6. Owner yêu cầu 80 => 201", ar.res.status === 201, `HTTP ${ar.res.status}`);
  const adj1Id = ar.json?.data?.id as string;
  const adj1 = await prisma.approvalQualityAdjustment.findUnique({ where: { id: adj1Id } });
  check(
    "E7. Lưu old/new/reason/requester/status PENDING",
    adj1?.oldQualityPercent === 65 &&
      adj1?.newQualityPercent === 80 &&
      adj1?.reason === "Điều chỉnh theo kết luận họp" &&
      adj1?.requestedById === ownerAccount.personId &&
      adj1?.requestedByAccountId === ownerAccount.id &&
      adj1?.status === "PENDING"
  );
  check(
    "E8. Decision gốc KHÔNG bị update",
    (await prisma.approvalDecision.findFirst({ where: { caseId: caseA!.id, action: "AGREE" } }))?.qualityPercent === 65
  );

  ar = await adjReq(tokOwner, taskA.id, { newQualityPercent: 85, reason: "Yêu cầu thứ hai" });
  check("E9. Đã có PENDING => 409", ar.res.status === 409, `HTTP ${ar.res.status}`);

  pv = await preview(tokLeader, taskA.id);
  const pendingView = (pv.data?.quality?.adjustments || []).find((a: any) => a.id === adj1Id);
  check("E10. Preview leader thấy PENDING + canDecide", pendingView?.status === "PENDING" && pendingView?.canDecide === true);
  check("E11. Effective vẫn 65 khi chưa duyệt", pv.data?.quality?.effective === 65 && pv.data?.quality?.adjusted === false);
  pv = await preview(tokOwner, taskA.id);
  const pendingOwnerView = (pv.data?.quality?.adjustments || []).find((a: any) => a.id === adj1Id);
  check("E12. Người yêu cầu không được tự duyệt (canDecide=false)", pendingOwnerView?.canDecide === false);

  let ad = await adjDecide(tokOwner, adj1Id, { action: "APPROVE" });
  check("E13. Owner tự duyệt yêu cầu => 403", ad.res.status === 403, `HTTP ${ad.res.status}`);
  ad = await adjDecide(tokLeader, adj1Id, { action: "APPROVE" });
  check("E14. Leader duyệt yêu cầu của owner => 200", ad.res.status === 200, `HTTP ${ad.res.status}`);
  const adj1After = await prisma.approvalQualityAdjustment.findUnique({ where: { id: adj1Id } });
  check(
    "E15. Lưu decider/thời gian/status APPROVED",
    adj1After?.status === "APPROVED" &&
      adj1After?.decidedById === leaderAccount.personId &&
      !!adj1After?.decidedAt
  );
  pv = await preview(tokOwner, taskA.id);
  check(
    "E16. Effective 80, original vẫn 65, adjusted=true",
    pv.data?.quality?.effective === 80 &&
      pv.data?.quality?.original === 65 &&
      pv.data?.quality?.adjusted === true
  );

  // Leader tự yêu cầu -> không tự duyệt; lãnh đạo khác duyệt
  ar = await adjReq(tokLeader, taskA.id, { newQualityPercent: 90, reason: "Điều chỉnh lần 2" });
  check("E17. Leader yêu cầu 90 => 201", ar.res.status === 201, `HTTP ${ar.res.status}`);
  const adj2Id = ar.json?.data?.id as string;
  check("E18. Old của yêu cầu 2 = effective 80", ar.json?.data?.oldQualityPercent === 80);
  ad = await adjDecide(tokLeader, adj2Id, { action: "APPROVE" });
  check("E19. Leader tự duyệt yêu cầu của mình => 403", ad.res.status === 403, `HTTP ${ad.res.status}`);
  ad = await adjDecide(tokTempLeader, adj2Id, { action: "APPROVE" });
  check("E20. Lãnh đạo khác thẩm quyền duyệt => 200", ad.res.status === 200, `HTTP ${ad.res.status}`);
  pv = await preview(tokOwner, taskA.id);
  check("E21. Effective 90 sau điều chỉnh 2", pv.data?.quality?.effective === 90);
  check(
    "E22. Decision gốc vẫn 65 sau 2 lần điều chỉnh",
    (await prisma.approvalDecision.findFirst({ where: { caseId: caseA!.id, action: "AGREE" } }))?.qualityPercent === 65
  );

  // Reject adjustment
  ar = await adjReq(tokOwner, taskA.id, { newQualityPercent: 95, reason: "Đề nghị lần 3" });
  const adj3Id = ar.json?.data?.id as string;
  check("E23. Yêu cầu 95 => 201", ar.res.status === 201, `HTTP ${ar.res.status}`);
  ad = await adjDecide(tokTempLeader, adj3Id, { action: "REJECT", note: "Không đủ căn cứ" });
  check("E24. Từ chối điều chỉnh => 200", ad.res.status === 200, `HTTP ${ad.res.status}`);
  const adj3 = await prisma.approvalQualityAdjustment.findUnique({ where: { id: adj3Id } });
  check(
    "E25. Status REJECTED + note + decider",
    adj3?.status === "REJECTED" && adj3?.decisionNote === "Không đủ căn cứ" && !!adj3?.decidedById
  );
  pv = await preview(tokOwner, taskA.id);
  check("E26. Từ chối không đổi effective (vẫn 90)", pv.data?.quality?.effective === 90);

  const auditRows = await prisma.auditEvent.findMany({
    where: {
      action: {
        in: [
          "APPROVAL_QUALITY_ADJUSTMENT_REQUESTED",
          "APPROVAL_QUALITY_ADJUSTMENT_APPROVED",
          "APPROVAL_QUALITY_ADJUSTMENT_REJECTED",
        ],
      },
      resourceId: { in: [adj1Id, adj2Id, adj3Id] },
    },
  });
  check(
    "E27. Audit đủ requested/approved/rejected + old/new/reason",
    auditRows.some((a) => a.action === "APPROVAL_QUALITY_ADJUSTMENT_REQUESTED") &&
      auditRows.some((a) => a.action === "APPROVAL_QUALITY_ADJUSTMENT_APPROVED") &&
      auditRows.some((a) => a.action === "APPROVAL_QUALITY_ADJUSTMENT_REJECTED") &&
      auditRows.every((a) => (a.newData as any)?.oldQualityPercent !== undefined || a.action === "APPROVAL_QUALITY_ADJUSTMENT_REQUESTED")
  );

  // ================================================================
  // F. Self-approval / collaborator decide
  // ================================================================
  console.log("\n--- F. Tự duyệt / collaborator ---");
  const taskF = await createTask({
    code: `${TAG}-F`,
    title: `${TAG} nhiệm vụ F (leader owner)`,
    ownerId: leaderAccount.personId,
    unitId: leaderUnitId,
  });
  d = await decision(tokLeader, taskF.id, { action: "AGREE", qualityPercent: 80 });
  check("F1. Leader tự duyệt task của mình => 403", d.res.status === 403, `HTTP ${d.res.status}`);
  check("F2. Không tạo case khi tự duyệt", (await caseOf(taskF.id)) === null);

  const taskG = await createTask({
    code: `${TAG}-G`,
    title: `${TAG} nhiệm vụ G`,
    ownerId: ownerAccount.personId,
    unitId,
    collaboratorId: collabAccount.personId,
  });
  d = await decision(tokCollab, taskG.id, { action: "AGREE", qualityPercent: 80 });
  check("F3. Collaborator quyết định => 403", d.res.status === 403, `HTTP ${d.res.status}`);
  check("F4. Collaborator không tạo case", (await caseOf(taskG.id)) === null);

  // F5-F7: quick approve trên My Work phải fail-closed khi flag bật
  const taskQ = await createTask({
    code: `${TAG}-Q`,
    title: `${TAG} nhiệm vụ quick approve`,
    ownerId: ownerAccount.personId,
    unitId,
  });
  const quickRes = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(tokLeader),
    body: JSON.stringify({ id: taskQ.id, action: "CONFIRM_COMPLETION" }),
  });
  const quickJson = await quickRes.json().catch(() => ({}));
  check("F5. CONFIRM_COMPLETION thiếu quality => 422", quickRes.status === 422, `HTTP ${quickRes.status}`);
  check("F6. Quick approve 422 không tạo case", (await caseOf(taskQ.id)) === null);
  check(
    "F7. Quick approve 422 không đổi Task (WAITING_REVIEW)",
    (await prisma.task.findUnique({ where: { id: taskQ.id } }))?.status === "WAITING_REVIEW" &&
      String(quickJson?.error || "").includes("chất lượng")
  );

  // F8-F13: người trình gốc không được tự duyệt adjustment do người khác yêu cầu
  const taskI = await createTask({
    code: `${TAG}-I`,
    title: `${TAG} nhiệm vụ submitter adjustment`,
    ownerId: tempLeader.person.id,
    unitId: leaderUnitId,
    status: "COMPLETED",
  });
  const caseI = await prisma.approvalCase.create({
    data: {
      caseType: "TASK_RESULT",
      resourceId: taskI.id,
      resourceCode: taskI.code,
      title: taskI.title,
      unitId: leaderUnitId,
      submittedById: tempLeader.person.id,
      status: "AGREED",
      currentRound: 1,
      decidedById: leaderAccount.personId,
      decidedAt: new Date(),
    },
  });
  await prisma.approvalDecision.create({
    data: {
      caseId: caseI.id,
      round: 1,
      action: "AGREE",
      reason: "Đồng ý nghiệm thu",
      qualityPercent: 65,
      actorId: leaderAccount.id,
      actorPersonId: leaderAccount.personId,
    },
  });
  const arI = await adjReq(tokLeader, taskI.id, {
    newQualityPercent: 80,
    reason: "Điều chỉnh do lãnh đạo quyết định đề nghị",
  });
  check("F8. Người quyết định khác yêu cầu adjustment => 201", arI.res.status === 201, `HTTP ${arI.res.status}`);
  const adjIId = arI.json?.data?.id as string;
  pv = await preview(tokTempLeader, taskI.id);
  const adjIView = (pv.data?.quality?.adjustments || []).find((a: any) => a.id === adjIId);
  check(
    "F9. Preview người trình gốc: canDecide=false",
    adjIView?.canDecide === false,
    JSON.stringify(adjIView || null)
  );
  let adI = await adjDecide(tokTempLeader, adjIId, { action: "APPROVE" });
  check("F10. Người trình gốc tự duyệt adjustment => 403", adI.res.status === 403, `HTTP ${adI.res.status}`);
  check(
    "F11. Adjustment vẫn PENDING sau khi bị chặn",
    (await prisma.approvalQualityAdjustment.findUnique({ where: { id: adjIId } }))?.status === "PENDING"
  );
  adI = await adjDecide(tokTempLeader2, adjIId, { action: "APPROVE" });
  check("F12. Lãnh đạo khác thẩm quyền duyệt => 200", adI.res.status === 200, `HTTP ${adI.res.status}`);
  pv = await preview(tokLeader, taskI.id);
  check("F13. Effective 80 sau khi lãnh đạo khác duyệt", pv.data?.quality?.effective === 80);

  // ================================================================
  // G. Flag OFF — legacy behavior (gọi service trực tiếp)
  // ================================================================
  console.log("\n--- G. Feature flag OFF (legacy) ---");
  const svcLeader = toSessionUser(leaderAccount, leaderAccount.person);
  const taskH = await createTask({
    code: `${TAG}-H`,
    title: `${TAG} nhiệm vụ H legacy`,
    ownerId: ownerAccount.personId,
    unitId,
  });
  process.env.V3_YC10_QUALITY = "false";
  const caseSvc = await import("../src/server/approval-case");
  const qualitySvc = await import("../src/server/approval-quality");
  const legacyDecision = await caseSvc.decideApproval({
    user: svcLeader,
    caseType: "TASK_RESULT",
    resourceId: taskH.id,
    action: "AGREE",
  });
  const caseH = await caseOf(taskH.id);
  check("G1. Flag off: AGREE thiếu quality vẫn thành công", legacyDecision.success === true, JSON.stringify(legacyDecision).slice(0, 160));
  check("G2. Flag off: decision quality NULL (legacy)", caseH?.decisions[0]?.qualityPercent === null);
  check(
    "G3. Flag off: Task vẫn COMPLETED",
    (await prisma.task.findUnique({ where: { id: taskH.id } }))?.status === "COMPLETED"
  );
  const offView = await qualitySvc.buildApprovalQualityView({
    user: svcLeader,
    caseType: "TASK_RESULT",
    case: caseH,
    decisions: caseH?.decisions || [],
    adjustments: caseH?.qualityAdjustments || [],
    ownerId: ownerAccount.personId,
  });
  check("G4. Flag off: quality view disabled/hidden", offView.enabled === false && offView.visible === false);
  const offReq = await qualitySvc.requestQualityAdjustment({
    user: svcLeader,
    caseType: "TASK_RESULT",
    resourceId: taskH.id,
    newQualityPercent: 80,
    reason: "off",
  });
  check("G5. Flag off: adjustment API/service bị chặn 409", offReq.success === false && offReq.status === 409);
  process.env.V3_YC10_QUALITY = "true";

  // ================================================================
  // H. DB constraints
  // ================================================================
  console.log("\n--- H. DB constraints ---");
  const colRows: any[] = await prisma.$queryRawUnsafe(
    `select column_name, data_type, is_nullable from information_schema.columns where table_name='approval_decisions' and column_name='quality_percent'`
  );
  check(
    "H1. Cột quality_percent nullable integer",
    colRows.length === 1 && colRows[0].data_type === "integer" && colRows[0].is_nullable === "YES"
  );
  const tableRows: any[] = await prisma.$queryRawUnsafe(
    `select table_name from information_schema.tables where table_schema='public' and table_name='approval_quality_adjustments'`
  );
  check("H2. Bảng approval_quality_adjustments tồn tại", tableRows.length === 1);
  const fkRows: any[] = await prisma.$queryRawUnsafe(
    `select conname from pg_constraint where conrelid='approval_quality_adjustments'::regclass and contype='f'`
  );
  check("H3. Đủ FK case/decision/requester/decider", fkRows.length >= 4, fkRows.map((r) => r.conname).join(","));
  const uniqueRows: any[] = await prisma.$queryRawUnsafe(
    `select indexname from pg_indexes where tablename='approval_quality_adjustments' and indexname like '%decision_id_revision%'`
  );
  check("H4. Unique (decision_id, revision)", uniqueRows.length === 1);
  let dbRejected = false;
  try {
    await prisma.$executeRawUnsafe(
      `update approval_decisions set quality_percent = 60 where id = '${caseA!.decisions[0].id}'`
    );
  } catch {
    dbRejected = true;
  }
  check("H5. DB từ chối quality 60 (CHECK)", dbRejected);
  let dbRejected2 = false;
  try {
    await prisma.$executeRawUnsafe(
      `update approval_quality_adjustments set new_quality_percent = 72 where id = '${adj1Id}'`
    );
  } catch {
    dbRejected2 = true;
  }
  check("H6. DB từ chối adjustment new 72 (CHECK)", dbRejected2);
  check(
    "H7. Decision gốc vẫn 65 sau thử DB bypass",
    (await prisma.approvalDecision.findUnique({ where: { id: caseA!.decisions[0].id } }))?.qualityPercent === 65
  );

  // ================================================================
  // I. Export sheet phụ + không đổi ô chính thức
  // ================================================================
  console.log("\n--- I. Export ---");
  const monthly1 = await prisma.monthlyWorkResult.create({
    data: {
      personId: ownerAccount.personId,
      periodYear: 2026,
      periodMonth: 10,
      taskId: taskA.id,
      title: taskA.title,
      subjectKind: "TASK",
      subjectId: taskA.id,
      createdById: ownerAccount.personId,
    },
  });
  createdMonthlyIds.push(monthly1.id);
  const monthly2 = await prisma.monthlyWorkResult.create({
    data: {
      personId: ownerAccount.personId,
      periodYear: 2026,
      periodMonth: 10,
      taskId: taskB1.id,
      title: taskB1.title,
      subjectKind: "TASK",
      subjectId: taskB1.id,
      createdById: ownerAccount.personId,
    },
  });
  createdMonthlyIds.push(monthly2.id);

  const exportRes = await fetch(
    `${BASE}/api/evaluation-export?template=01A&periodType=MONTH&year=2026&number=10&personId=${ownerAccount.personId}`,
    { headers: H(tokOwner) }
  );
  check("I1. Export 01A => 200", exportRes.status === 200, `HTTP ${exportRes.status}`);
  const exportBuf = Buffer.from(await exportRes.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(exportBuf);
  const sheetNames = wb.worksheets.map((w: any) => w.name);
  check("I2. Có sheet phụ 'Đánh giá chất lượng'", sheetNames.includes("Đánh giá chất lượng"), sheetNames.join(" | "));
  check("I3. Vẫn có sheet chính thức 01A", sheetNames.some((n: string) => n.includes("01A")));
  const qws = wb.getWorksheet("Đánh giá chất lượng");
  const qRows: any[] = [];
  qws?.eachRow((row: any) => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => row.getCell(i).value);
    if (vals[1] === taskA.code) qRows.push(vals);
  });
  check(
    "I4. Dòng quality task A: gốc 65, hiệu lực 90, có điều chỉnh",
    qRows.length === 1 && qRows[0][4] === 65 && qRows[0][5] === 90 && qRows[0][6] === "Có điều chỉnh",
    JSON.stringify(qRows[0] || [])
  );
  const qRowsNull: any[] = [];
  qws?.eachRow((row: any) => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => row.getCell(i).value);
    if (vals[1] === taskB1.code) qRowsNull.push(vals);
  });
  check(
    "I5. Quality NULL hiển thị 'Chưa đánh giá'",
    qRowsNull.length === 1 && qRowsNull[0][4] === "Chưa đánh giá" && qRowsNull[0][5] === "Chưa đánh giá",
    JSON.stringify(qRowsNull[0] || [])
  );

  // Flag OFF: route export không trả quality preview và không thêm sheet phụ
  const exportUrl = `${BASE}/api/evaluation-export?template=01A&periodType=MONTH&year=2026&number=10&personId=${ownerAccount.personId}`;
  process.env.V3_YC10_QUALITY = "false";
  const { NextRequest } = await import("next/server");
  const exportRoute = await import("../src/app/api/evaluation-export/route");
  const offPreviewRes = await exportRoute.GET(
    new NextRequest(`${exportUrl}&preview=1`, {
      headers: { Authorization: `Bearer ${tokOwner}` },
    })
  );
  const offPreviewJson = await offPreviewRes.json().catch(() => ({}));
  check(
    "I6. Flag OFF: preview export KHÔNG có quality",
    offPreviewRes.status === 200 &&
      !Object.prototype.hasOwnProperty.call(offPreviewJson?.data || {}, "quality"),
    `HTTP ${offPreviewRes.status}`
  );
  const offFileRes = await exportRoute.GET(
    new NextRequest(exportUrl, { headers: { Authorization: `Bearer ${tokOwner}` } })
  );
  const offBuf = Buffer.from(await offFileRes.arrayBuffer());
  const offWb = new ExcelJS.Workbook();
  await offWb.xlsx.load(offBuf);
  const offSheetNames = offWb.worksheets.map((w: any) => w.name);
  check(
    "I7. Flag OFF: file export KHÔNG có sheet 'Đánh giá chất lượng'",
    offFileRes.status === 200 && !offSheetNames.includes("Đánh giá chất lượng"),
    `HTTP ${offFileRes.status} | ${offSheetNames.join(" | ")}`
  );
  check(
    "I8. Flag OFF: vẫn có sheet chính thức 01A",
    offSheetNames.some((n: string) => n.includes("01A"))
  );
  process.env.V3_YC10_QUALITY = "true";

  // So sánh trực tiếp: thêm sheet phụ không đổi bất kỳ ô nào của sheet chính thức
  const exportSvc = await import("../src/server/evaluation-export");
  const baseParams: any = {
    template: "01A",
    periodType: "MONTH",
    year: 2026,
    number: 10,
    person: {
      fullName: "Người kiểm thử",
      positionTitle: "Công chức",
      unitName: "Đơn vị kiểm thử",
      commonCriteriaScore: null,
      commonCriteriaSuggested: null,
      selfGradeChoice: null,
      selfGradeSuggestion: null,
      strengths: null,
      weaknesses: null,
      reviewerComment: null,
      evaluationStatus: "DRAFT",
    },
    tasks: [
      {
        resultId: "r1",
        title: "Nhiệm vụ kiểm thử",
        dueDate: "31/10/2026",
        product: "Sản phẩm",
        factor: 1,
        assignedQty: 1,
        completedQty: 1,
        completedDate: "30/10/2026",
        lateDays: 0,
        reworkCount: 0,
      },
    ],
    score: null,
    leader: null,
  };
  const bufNoQuality = await exportSvc.buildEvaluationWorkbook(baseParams);
  const bufWithQuality = await exportSvc.buildEvaluationWorkbook({
    ...baseParams,
    qualityRows: [
      {
        taskId: "t1",
        taskCode: "T-01",
        taskTitle: "Nhiệm vụ kiểm thử",
        decisionRound: 1,
        originalQualityPercent: 65,
        effectiveQualityPercent: 90,
        adjusted: true,
        adjustmentReason: "Lý do",
        decidedByName: "Lãnh đạo",
        decidedAt: new Date("2026-10-23T10:00:00Z").toISOString(),
      },
    ],
  });
  const wbNo = new ExcelJS.Workbook();
  await wbNo.xlsx.load(bufNoQuality);
  const wbYes = new ExcelJS.Workbook();
  await wbYes.xlsx.load(bufWithQuality);
  let officialIdentical = true;
  let comparedSheets = 0;
  for (const wsNo of wbNo.worksheets) {
    const wsYes = wbYes.getWorksheet(wsNo.name);
    if (!wsYes) {
      officialIdentical = false;
      break;
    }
    comparedSheets++;
    if (cellSnapshot(wsNo) !== cellSnapshot(wsYes)) {
      officialIdentical = false;
      break;
    }
  }
  check(
    "I9. Thêm sheet quality KHÔNG đổi ô chính thức (01A/Bảng 1)",
    officialIdentical && comparedSheets >= 2,
    `sheets=${comparedSheets}`
  );
  check(
    "I10. Workbook có qualityRows có thêm đúng 1 sheet",
    wbYes.worksheets.length === wbNo.worksheets.length + 1
  );
  check(
    "I11. Builder không truyền qualityRows => không có sheet quality",
    !wbNo.worksheets.some((w: any) => w.name === "Đánh giá chất lượng")
  );

  // ================================================================
  // J. Không chạm score/QĐ1277/monthly
  // ================================================================
  console.log("\n--- J. Không chạm điểm/QĐ1277/monthly ---");
  check(
    "J1. Không sinh MonthlyWorkResult cho task test (ngoài fixture export đã tạo)",
    (await prisma.monthlyWorkResult.count({ where: { taskId: { in: createdTaskIds } } })) === createdMonthlyIds.length,
    String(await prisma.monthlyWorkResult.count({ where: { taskId: { in: createdTaskIds } } }))
  );
  const afterProducts = await prisma.productItem.count();
  const afterWorkProducts = await prisma.workItemProduct.count();
  const afterAssessments = await prisma.evaluationAssessment.count();
  check("J2. ProductItem không đổi", afterProducts === baselineProducts, `${baselineProducts} -> ${afterProducts}`);
  check("J3. WorkItemProduct không đổi", afterWorkProducts === baselineWorkProducts, `${baselineWorkProducts} -> ${afterWorkProducts}`);
  check("J4. EvaluationAssessment không đổi", afterAssessments === baselineAssessments, `${baselineAssessments} -> ${afterAssessments}`);
  if (sampleProduct) {
    const nowProduct = await prisma.productItem.findUnique({
      where: { id: sampleProduct.id },
      select: { convertFactor: true, maxScore: true, pointValue: true },
    });
    check(
      "J5. QĐ1277 convertFactor/maxScore/pointValue không đổi",
      nowProduct?.convertFactor === sampleProduct.convertFactor &&
        nowProduct?.maxScore === sampleProduct.maxScore &&
        nowProduct?.pointValue === sampleProduct.pointValue
    );
  } else {
    check("J5. QĐ1277 convertFactor/updatedAt không đổi", true, "không có ProductItem mẫu");
  }
  const decisionScores = await prisma.approvalDecision.findMany({
    where: { caseId: caseA!.id },
    select: { action: true, qualityPercent: true },
  });
  check(
    "J6. Quality chỉ nằm trên ApprovalDecision, không sinh dòng điểm",
    decisionScores.every((d) => ["AGREE", "REJECT", "CLARIFY", "RESPOND"].includes(d.action))
  );

  // Cleanup monthly export fixtures before final baseline check
  await prisma.monthlyWorkResult.deleteMany({ where: { id: { in: createdMonthlyIds } } });
  check("J7. Monthly baseline trở lại sau cleanup", (await prisma.monthlyWorkResult.count()) === baselineMonthly);

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
}

main()
  .catch((err) => {
    fail++;
    console.error("\n[FATAL]", err);
  })
  .finally(async () => {
    try {
      if (createdMonthlyIds.length > 0) {
        await prisma.monthlyWorkResult.deleteMany({ where: { id: { in: createdMonthlyIds } } });
      }
      if (createdTaskIds.length > 0) {
        await prisma.approvalCase.deleteMany({
          where: { caseType: "TASK_RESULT", resourceId: { in: createdTaskIds } },
        });
        await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
      }
      if (tempAccountIds.length > 0) {
        await prisma.auditEvent.deleteMany({ where: { actorId: { in: tempAccountIds } } });
        await prisma.account.deleteMany({ where: { id: { in: tempAccountIds } } });
      }
    } catch (e) {
      console.error("[CLEANUP]", e);
    }
    await prisma.$disconnect();
    if (fail > 0) process.exitCode = 1;
  });
