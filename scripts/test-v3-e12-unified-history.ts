/**
 * E12-A — Lịch sử hợp nhất: TaskUpdate + ApprovalDecision + participant events.
 *
 * Kiểm chứng:
 *  A. API `/api/tasks/[id]/history` trả đủ 3 nguồn, mỗi bản ghi có sourceLabel.
 *  B. Không gộp bình luận/tệp đính kèm (bình luận tạo ra không xuất hiện).
 *  C. Lọc theo source + limit; source lạ => 400.
 *  D. Giữ nguyên kiểm tra quyền READ (người ngoài đơn vị => 403).
 *  E. API lịch sử duyệt (`scope=decided`, preview) giữ filter hiện có và có nhãn nguồn.
 *
 * Chạy:
 *   TEST_BASE_URL=http://localhost:3118 \
 *   DATABASE_URL=postgresql://.../talung_v3_approval_impl_quality \
 *   npx tsx scripts/test-v3-e12-unified-history.ts
 */
import { createRequire } from "node:module";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const BASE = process.env.TEST_BASE_URL || "http://localhost:3117";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = `[E12-${Date.now().toString().slice(-6)}]`;
const COMMENT_TEXT = `${TAG} bình luận KHÔNG được gộp vào lịch sử hợp nhất`;

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

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`Đăng nhập ${username} lỗi HTTP ${res.status}: ${json.error || ""}`);
  return json.token as string;
}

const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
let createdTaskId: string | null = null;
let tempPersonId: string | null = null;
let tempAccountId: string | null = null;

async function main() {
  console.log(`=== E12-A UNIFIED HISTORY — ${BASE} ===\n`);

  const accounts = await prisma.account.findMany({
    include: {
      person: { include: { assignments: { where: { isPrimary: true } } } },
      roleGrants: { include: { role: true } },
    },
  });
  const leader = accounts.find(
    (a) => a.username === "demold01" && a.roleGrants.some((g) => g.role.code === "UNIT_LEADER")
  );
  const owner = accounts.find((a) => a.username === "democb01");
  const collaborator = accounts.find((a) => a.username === "democb02");
  if (!leader || !owner || !collaborator) {
    console.log("  THIẾU tài khoản fixture (demold01/democb01/democb02) — bỏ qua.");
    return;
  }
  const unitId = owner.person.assignments[0]?.unitId || leader.person.assignments[0]!.unitId;
  const tokOwner = await login(owner.username);
  const tokLeader = await login(leader.username);
  const tokCollab = await login(collaborator.username);

  const task = await prisma.task.create({
    data: {
      code: `E12-${Date.now().toString().slice(-5)}`,
      title: `${TAG} nhiệm vụ lịch sử hợp nhất`,
      ownerId: owner.personId,
      unitId,
      status: "IN_PROGRESS",
      priority: "Trung bình",
      originalDeadline: new Date("2026-12-31T00:00:00.000Z"),
      currentDeadline: new Date("2026-12-31T00:00:00.000Z"),
      description: TAG,
      assignees: { create: [{ personId: collaborator.personId, role: "COLLABORATOR" }] },
    },
  });
  createdTaskId = task.id;

  // 1) TaskUpdate cấp nhiệm vụ
  const ownerProgress = await fetch(`${BASE}/api/tasks/${task.id}/updates`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({ progressPercent: 40, notes: `${TAG} chủ trì báo 40%` }),
  });
  check("A1. Chủ trì ghi TaskUpdate 40% => 201", ownerProgress.status === 201, `HTTP ${ownerProgress.status}`);

  // 2) Participant event PROGRESS
  const partProgress = await fetch(`${BASE}/api/tasks/${task.id}/participant-results`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({
      action: "PROGRESS",
      progressPercent: 20,
      notes: `${TAG} phối hợp báo 20%`,
    }),
  });
  check("A2. Phối hợp báo phần việc => 201", partProgress.status === 201, `HTTP ${partProgress.status}`);

  // 3) Participant event SUBMIT (để đủ điều kiện nộp chung)
  const partSubmit = await fetch(`${BASE}/api/tasks/${task.id}/participant-results`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({
      action: "SUBMIT",
      partResultText: `${TAG} kết quả phần việc phối hợp`,
      partCompletedOn: "2026-10-24",
      partProgressPercent: 100,
      notes: `${TAG} hoàn thành phần việc`,
    }),
  });
  check("A3. Phối hợp nộp phần việc => 201", partSubmit.status === 201, `HTTP ${partSubmit.status}`);

  // 4) Bình luận — phải KHÔNG xuất hiện trong lịch sử hợp nhất
  const comment = await fetch(`${BASE}/api/tasks/${task.id}/comments`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({ content: COMMENT_TEXT }),
  });
  check("A4. Tạo bình luận (để kiểm chứng không gộp) => 201", comment.status === 201, `HTTP ${comment.status}`);

  // 5) Nộp chung -> REJECT -> phối hợp nộp lại -> nộp chung -> AGREE
  const submit1 = await fetch(`${BASE}/api/tasks/${task.id}/updates`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({
      progressPercent: 100,
      notes: `${TAG} nộp chung lần 1`,
      submitForReview: true,
      actualResultText: `${TAG} kết quả chung lần 1`,
    }),
  });
  check("A5. Nộp chung lần 1 => 201", submit1.status === 201, `HTTP ${submit1.status}`);

  const reject1 = await fetch(`${BASE}/api/approvals/TASK_RESULT/${task.id}/decision`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ action: "REJECT", reason: `${TAG} thiếu chứng từ lần 1` }),
  });
  check("A6. Lãnh đạo trả lại => 200", reject1.status === 200, `HTTP ${reject1.status}`);

  const partResubmit = await fetch(`${BASE}/api/tasks/${task.id}/participant-results`, {
    method: "POST",
    headers: H(tokCollab),
    body: JSON.stringify({
      action: "SUBMIT",
      partResultText: `${TAG} kết quả phần việc bổ sung`,
      partCompletedOn: "2026-10-24",
      partProgressPercent: 100,
      notes: `${TAG} bổ sung phần việc`,
    }),
  });
  check("A7. Phối hợp nộp lại phần việc => 201", partResubmit.status === 201, `HTTP ${partResubmit.status}`);

  const submit2 = await fetch(`${BASE}/api/tasks/${task.id}/updates`, {
    method: "POST",
    headers: H(tokOwner),
    body: JSON.stringify({
      progressPercent: 100,
      notes: `${TAG} nộp chung lần 2`,
      submitForReview: true,
      actualResultText: `${TAG} kết quả chung lần 2`,
    }),
  });
  check("A8. Nộp chung lần 2 => 201", submit2.status === 201, `HTTP ${submit2.status}`);

  const agree = await fetch(`${BASE}/api/approvals/TASK_RESULT/${task.id}/decision`, {
    method: "POST",
    headers: H(tokLeader),
    body: JSON.stringify({ action: "AGREE", reason: `${TAG} đạt yêu cầu` }),
  });
  check("A9. Lãnh đạo đồng ý => 200", agree.status === 200, `HTTP ${agree.status}`);

  // ------------------------------------------------------------------ history API
  const historyRes = await fetch(`${BASE}/api/tasks/${task.id}/history`, { headers: H(tokOwner) });
  const historyJson = await historyRes.json().catch(() => null);
  const entries: any[] = historyJson?.data?.entries || [];
  const sources = new Set(entries.map((e) => e.source));
  check("B1. GET history => 200", historyRes.status === 200, `HTTP ${historyRes.status}`);
  check(
    "B2. Có đủ 3 nguồn TASK_UPDATE + APPROVAL_DECISION + PARTICIPANT_EVENT",
    sources.has("TASK_UPDATE") && sources.has("APPROVAL_DECISION") && sources.has("PARTICIPANT_EVENT"),
    [...sources].join(",")
  );
  check(
    "B3. Mọi bản ghi có sourceLabel rõ ràng, không có nguồn lạ",
    entries.length > 0 &&
      entries.every((e) => typeof e.sourceLabel === "string" && e.sourceLabel.length > 0) &&
      entries.every((e) =>
        ["TASK_UPDATE", "APPROVAL_DECISION", "PARTICIPANT_EVENT"].includes(e.source)
      ),
    `n=${entries.length}`
  );
  const decisionEntries = entries.filter((e) => e.source === "APPROVAL_DECISION");
  const participantEntries = entries.filter((e) => e.source === "PARTICIPANT_EVENT");
  check(
    "B4. Quyết định duyệt có lý do + nhãn hành động",
    decisionEntries.some(
      (e) => e.action === "REJECT" && /thiếu chứng từ lần 1/.test(String(e.detail)) && e.actionLabel
    ) && decisionEntries.some((e) => e.action === "AGREE"),
    `decisions=${decisionEntries.length}`
  );
  check(
    "B5. Participant event có người được ghi nhận + nội dung phần việc",
    participantEntries.some(
      (e) => e.subjectPersonName === collaborator.person.fullName && /phần việc/.test(String(e.detail))
    ),
    `events=${participantEntries.length}`
  );
  check(
    "B6. KHÔNG gộp bình luận vào lịch sử hợp nhất",
    entries.every(
      (e) =>
        !JSON.stringify(e).includes(COMMENT_TEXT) &&
        !String(e.kind || "").toLowerCase().includes("comment")
    )
  );
  check(
    "B7. Không có nguồn tệp đính kèm/bình luận",
    entries.every((e) => !["COMMENT", "ATTACHMENT", "FILE"].includes(e.source))
  );

  const onlyDecisions = await (
    await fetch(`${BASE}/api/tasks/${task.id}/history?source=APPROVAL_DECISION`, {
      headers: H(tokOwner),
    })
  ).json();
  check(
    "C1. Filter source=APPROVAL_DECISION chỉ trả quyết định duyệt",
    Array.isArray(onlyDecisions?.data?.entries) &&
      onlyDecisions.data.entries.length > 0 &&
      onlyDecisions.data.entries.every((e: any) => e.source === "APPROVAL_DECISION") &&
      onlyDecisions?.data?.counts?.TASK_UPDATE > 0,
    `n=${onlyDecisions?.data?.entries?.length}`
  );

  const limited = await (
    await fetch(`${BASE}/api/tasks/${task.id}/history?limit=2`, { headers: H(tokOwner) })
  ).json();
  check("C2. limit=2 chỉ trả tối đa 2 bản ghi", limited?.data?.entries?.length === 2, `n=${limited?.data?.entries?.length}`);

  const invalidSource = await fetch(`${BASE}/api/tasks/${task.id}/history?source=COMMENT`, {
    headers: H(tokOwner),
  });
  check("C3. Source lạ => 400", invalidSource.status === 400, `HTTP ${invalidSource.status}`);

  // ------------------------------------------------------------------ permissions
  const passwordHash = owner.passwordHash;
  const otherUnit = await prisma.orgUnit.findFirst({ where: { id: { not: unitId } } });
  const staffRole = await prisma.role.findUnique({ where: { code: "STAFF" } });
  if (otherUnit && staffRole) {
    const tempPerson = await prisma.person.create({
      data: {
        code: `E12-OUT-${Date.now().toString().slice(-6)}`,
        fullName: `${TAG} người ngoài đơn vị`,
        assignments: { create: [{ unitId: otherUnit.id, isPrimary: true }] },
      },
    });
    tempPersonId = tempPerson.id;
    const tempAccount = await prisma.account.create({
      data: {
        personId: tempPerson.id,
        username: `e12out${Date.now().toString().slice(-6)}`,
        passwordHash,
        status: "ACTIVE",
        roleGrants: { create: [{ roleId: staffRole.id, scopeType: "OWN" }] },
      },
    });
    tempAccountId = tempAccount.id;
    const tokOut = await login(tempAccount.username);
    const forbidden = await fetch(`${BASE}/api/tasks/${task.id}/history`, { headers: H(tokOut) });
    check("D1. Người ngoài đơn vị => 403 (giữ nguyên quyền READ)", forbidden.status === 403, `HTTP ${forbidden.status}`);
  } else {
    check("D1. Người ngoài đơn vị => 403 (giữ nguyên quyền READ)", false, "Thiếu fixture unit/role");
  }

  // ------------------------------------------------------------------ approval history APIs
  const year = new Date().getFullYear();
  const decidedRes = await fetch(
    `${BASE}/api/approvals/cases?scope=decided&person=${encodeURIComponent(owner.person.code)}&year=${year}`,
    { headers: H(tokLeader) }
  );
  const decidedJson = await decidedRes.json().catch(() => null);
  const decidedCase = (decidedJson?.data || []).find((c: any) => c.resourceId === task.id);
  check(
    "E1. API 'Đã xử lý' giữ filter cán bộ/năm và trả hồ sơ của nhiệm vụ",
    decidedRes.status === 200 && !!decidedCase,
    `HTTP ${decidedRes.status}, n=${decidedJson?.data?.length}`
  );
  check(
    "E2. latestDecision + history có nhãn 'Quyết định duyệt'",
    decidedCase?.latestDecision?.sourceLabel === "Quyết định duyệt" &&
      Array.isArray(decidedCase?.history) &&
      decidedCase.history.length >= 2 &&
      decidedCase.history.every(
        (h: any) => h.source === "APPROVAL_DECISION" && h.sourceLabel === "Quyết định duyệt"
      ),
    `history=${decidedCase?.history?.length}`
  );

  const noMatchRes = await fetch(
    `${BASE}/api/approvals/cases?scope=decided&person=E12_KHONG_TON_TAI&year=${year}`,
    { headers: H(tokLeader) }
  );
  const noMatchJson = await noMatchRes.json().catch(() => null);
  check(
    "E3. Filter cán bộ không khớp => rỗng (không nới quyền)",
    noMatchRes.status === 200 && Array.isArray(noMatchJson?.data) && noMatchJson.data.length === 0,
    `n=${noMatchJson?.data?.length}`
  );

  const previewRes = await fetch(`${BASE}/api/approvals/TASK_RESULT/${task.id}/preview`, {
    headers: H(tokLeader),
  });
  const previewJson = await previewRes.json().catch(() => null);
  const previewHistory: any[] = previewJson?.data?.history || [];
  check(
    "E4. Preview duyệt trả lịch sử quyết định kèm nhãn nguồn",
    previewRes.status === 200 &&
      previewHistory.length >= 2 &&
      previewHistory.every(
        (h) => h.source === "APPROVAL_DECISION" && h.sourceLabel === "Quyết định duyệt"
      ),
    `n=${previewHistory.length}`
  );

  console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
}

main()
  .catch((err) => {
    fail++;
    console.error("LỖI TEST:", err);
  })
  .finally(async () => {
    if (tempAccountId) await prisma.account.delete({ where: { id: tempAccountId } }).catch(() => {});
    if (tempPersonId) await prisma.person.delete({ where: { id: tempPersonId } }).catch(() => {});
    if (createdTaskId) await prisma.task.delete({ where: { id: createdTaskId } }).catch(() => {});
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  });
