/**
 * test-v3-review-flow.ts — V3.0.1: kiểm thử luồng cán bộ → lãnh đạo trực tiếp.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_v3_demo"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   $env:TEST_BASE_URL="http://localhost:3100"
 *   npx tsx scripts/test-v3-review-flow.ts
 *
 * Quy trình kiểm tra:
 *  1. Cán bộ tạo công việc tự ghi nhận → gửi lãnh đạo (bắt buộc nội dung kết quả + ngày thực tế)
 *  2. Khi chờ xác nhận ⇒ khóa chỉnh sửa + khóa minh chứng
 *  3. Lãnh đạo trả lại (bắt buộc có lý do) ⇒ mở lại chỉnh sửa, cán bộ sửa & gửi lại
 *  4. Lãnh đạo xác nhận ⇒ khóa kết quả, ghi lịch sử
 *  5. Chống gửi trùng, chặn người không đúng vai trò, không tạo 2 luồng duyệt cho 1 kết quả
 */
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-review-flow"
);
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const PASSWORD = process.env.V3_DEMO_PASSWORD || "LocalTest@2026";
const TAG = `[V3-TEST-${Date.now().toString(36).toUpperCase()}]`;

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

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`đăng nhập ${username} lỗi HTTP ${res.status}`);
  return json.token;
}
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

const createdItemIds: string[] = [];
const createdTaskIds: string[] = [];

async function main() {
  console.log("=== V3.0.1 — LUỒNG CÁN BỘ → LÃNH ĐẠO TRỰC TIẾP ===\n");

  const staffToken = await login("democb01");
  const leaderToken = await login("demold01");
  const otherToken = await login("democb02");

  const staff = await prisma.person.findFirst({ where: { code: "DEMO-CB-01" } });
  const leader = await prisma.person.findFirst({ where: { code: "DEMO-LD-01" } });
  const other = await prisma.person.findFirst({ where: { code: "DEMO-CB-02" } });
  const period = await prisma.reportingPeriod.findFirst({
    where: { type: "MONTH", title: { contains: "10/2026" } },
  });
  check(
    "0. Dữ liệu demo V3 sẵn sàng (người, kỳ tháng 10/2026)",
    !!(staff && leader && other && period),
    `period=${period?.title}`
  );
  if (!staff || !leader || !other || !period) return;

  // Quan hệ phụ trách (lãnh đạo trực tiếp)
  const sup = await prisma.personSupervision.findFirst({
    where: { managerPersonId: leader.id, subordinatePersonId: staff.id, status: "CONFIRMED" },
  });
  check("0. Quan hệ phụ trách DEMO-LD-01 → DEMO-CB-01 tồn tại", !!sup);

  // ---------------------------------------------------------------- 1. Tạo việc
  const createRes = await fetch(`${BASE}/api/personal-work-items`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      personId: staff.id,
      periodId: period.id,
      title: `${TAG} công việc tự ghi nhận`,
      status: "IN_PROGRESS",
      dueDate: "2026-10-30",
    }),
  });
  const createJson = await createRes.json().catch(() => ({}));
  const itemId = createJson?.data?.id;
  check("1. Cán bộ tạo được công việc tự ghi nhận", createRes.status === 201 && !!itemId, `HTTP ${createRes.status}`);
  if (!itemId) return;
  createdItemIds.push(itemId);

  const item0 = await prisma.personalWorkItem.findUnique({ where: { id: itemId } });
  check(
    "1. Công việc mới ở trạng thái 'Chưa gửi lãnh đạo'",
    (item0?.reviewState || "DRAFT") === "DRAFT",
    `reviewState=${item0?.reviewState}`
  );
  check("1. Công việc mới chưa có nội dung kết quả", !item0?.resultText);

  // ---------------------------------------------------------------- 2. Gửi lên lãnh đạo
  const badSubmit = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "", completedOn: "2026-10-21" }),
  });
  check("2. Thiếu nội dung kết quả ⇒ bị từ chối (B2)", badSubmit.status === 400, `HTTP ${badSubmit.status}`);

  const badDate = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "Đã hoàn thành", completedOn: "" }),
  });
  check("2. Thiếu ngày hoàn thành thực tế ⇒ bị từ chối (C1)", badDate.status === 400, `HTTP ${badDate.status}`);

  const submitRes = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      action: "SUBMIT",
      resultText: "Đã rà soát hồ sơ và lập biên bản đối chiếu.",
      completedOn: "2026-10-21",
    }),
  });
  check("2. Cán bộ gửi lên lãnh đạo thành công", submitRes.status === 200, `HTTP ${submitRes.status}`);

  const item1 = await prisma.personalWorkItem.findUnique({ where: { id: itemId } });
  check("2. Trạng thái = 'Đã gửi — chờ lãnh đạo xác nhận'", item1?.reviewState === "SUBMITTED", item1?.reviewState);
  check("2. Nội dung kết quả được lưu", !!item1?.resultText, String(item1?.resultText).slice(0, 40));
  check(
    "2. Ngày hoàn thành thực tế = 21/10/2026",
    item1?.completedDate?.toISOString().slice(0, 10) === "2026-10-21",
    item1?.completedDate?.toISOString()
  );
  check("2. Số lần gửi = 1", item1?.submitCount === 1, String(item1?.submitCount));
  const reviews1 = await prisma.workItemReview.count({ where: { workItemId: itemId } });
  check("2. Ghi lịch sử xử lý (1 mục)", reviews1 === 1, `reviews=${reviews1}`);

  // ---------------------------------------------------------------- 3. Khóa khi chờ xác nhận
  const patchLocked = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: itemId, title: `${TAG} sửa khi đang chờ` }),
  });
  check("3. Khóa chỉnh sửa khi đang chờ xác nhận (D1-A)", patchLocked.status === 409, `HTTP ${patchLocked.status}`);

  const evLocked = await fetch(`${BASE}/api/work-evidence`, {
    method: "POST",
    headers: { Authorization: `Bearer ${staffToken}` },
    body: (() => {
      const fd = new FormData();
      fd.set("workItemId", itemId);
      fd.set("file", new Blob(["demo"], { type: "text/plain" }), "demo.txt");
      return fd;
    })(),
  });
  check("3. Khóa thêm minh chứng khi đang chờ xác nhận (R3-C)", evLocked.status === 409, `HTTP ${evLocked.status}`);

  const dupSubmit = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "gửi lại lần hai", completedOn: "2026-10-21" }),
  });
  check("3. Chống gửi trùng khi đang chờ xác nhận", dupSubmit.status === 409, `HTTP ${dupSubmit.status}`);

  // ---------------------------------------------------------------- 4. Quyền của người khác
  const otherSubmit = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(otherToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "cố gửi hộ", completedOn: "2026-10-21" }),
  });
  check("4. Người khác không thể gửi hộ công việc này", otherSubmit.status === 403, `HTTP ${otherSubmit.status}`);

  const otherConfirm = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(otherToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("4. Không phải lãnh đạo trực tiếp thì không xác nhận được", otherConfirm.status === 403, `HTTP ${otherConfirm.status}`);

  const queueRes = await fetch(`${BASE}/api/personal-work-items/review-queue`, { headers: H(leaderToken) });
  const queueJson = await queueRes.json().catch(() => ({}));
  const inQueue = (queueJson.data || []).filter((x: any) => x.id === itemId);
  check("4. Hồ sơ xuất hiện trong hàng đợi của lãnh đạo trực tiếp", inQueue.length === 1, `HTTP ${queueRes.status}`);
  const otherQueue = await fetch(`${BASE}/api/personal-work-items/review-queue`, { headers: H(otherToken) });
  const otherQueueJson = await otherQueue.json().catch(() => ({}));
  check(
    "4. Người không phải lãnh đạo không thấy hồ sơ của người khác",
    (otherQueueJson.data || []).filter((x: any) => x.id === itemId).length === 0
  );

  // ---------------------------------------------------------------- 5. Trả lại
  const returnNoNote = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "RETURN", note: "" }),
  });
  check("5. Trả lại mà không ghi lý do ⇒ bị từ chối", returnNoNote.status === 400, `HTTP ${returnNoNote.status}`);

  const returnRes = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "RETURN", note: "Bổ sung số liệu đối chiếu còn thiếu." }),
  });
  check("5. Lãnh đạo trả lại thành công", returnRes.status === 200, `HTTP ${returnRes.status}`);
  const item2 = await prisma.personalWorkItem.findUnique({ where: { id: itemId } });
  check("5. Trạng thái = 'Lãnh đạo trả lại'", item2?.reviewState === "RETURNED", item2?.reviewState);
  check("5. Lý do trả lại được ghi nhận", !!item2?.reviewNote, String(item2?.reviewNote).slice(0, 40));

  const patchAfterReturn = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: itemId, title: `${TAG} đã sửa sau khi bị trả lại` }),
  });
  check("5. Sau khi bị trả lại, cán bộ sửa được", patchAfterReturn.status === 200, `HTTP ${patchAfterReturn.status}`);

  // ---------------------------------------------------------------- 6. Gửi lại + xác nhận
  const resubmit = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      action: "SUBMIT",
      resultText: "Đã bổ sung số liệu đối chiếu đầy đủ theo yêu cầu.",
      completedOn: "2026-10-21",
    }),
  });
  check("6. Cán bộ sửa và gửi lại thành công", resubmit.status === 200, `HTTP ${resubmit.status}`);
  const item3 = await prisma.personalWorkItem.findUnique({ where: { id: itemId } });
  check("6. Số lần gửi = 2", item3?.submitCount === 2, String(item3?.submitCount));

  const confirmRes = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ action: "CONFIRM" }),
  });
  check("6. Lãnh đạo xác nhận thành công", confirmRes.status === 200, `HTTP ${confirmRes.status}`);
  const item4 = await prisma.personalWorkItem.findUnique({ where: { id: itemId } });
  check("6. Trạng thái = 'Đã được lãnh đạo xác nhận'", item4?.reviewState === "CONFIRMED", item4?.reviewState);
  check("6. Người xác nhận được ghi nhận", item4?.reviewedById === leader.id);
  check(
    "6. Ngày hoàn thành thực tế giữ nguyên 21/10/2026",
    item4?.completedDate?.toISOString().slice(0, 10) === "2026-10-21"
  );

  const patchAfterConfirm = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: itemId, title: `${TAG} sửa sau khi đã xác nhận` }),
  });
  check("6. Sau khi xác nhận ⇒ khóa chỉnh sửa", patchAfterConfirm.status === 409, `HTTP ${patchAfterConfirm.status}`);

  const evAfterConfirm = await fetch(`${BASE}/api/work-evidence`, {
    method: "POST",
    headers: { Authorization: `Bearer ${staffToken}` },
    body: (() => {
      const fd = new FormData();
      fd.set("workItemId", itemId);
      fd.set("file", new Blob(["demo"], { type: "text/plain" }), "demo.txt");
      return fd;
    })(),
  });
  check("6. Sau khi xác nhận ⇒ khóa thêm minh chứng", evAfterConfirm.status === 409, `HTTP ${evAfterConfirm.status}`);

  const resubmitAfterConfirm = await fetch(`${BASE}/api/personal-work-items/${itemId}/review`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ action: "SUBMIT", resultText: "gửi lại sau khi xác nhận", completedOn: "2026-10-21" }),
  });
  check("6. Không gửi lại được sau khi đã xác nhận", resubmitAfterConfirm.status === 409, `HTTP ${resubmitAfterConfirm.status}`);

  const reviews4 = await prisma.workItemReview.findMany({
    where: { workItemId: itemId },
    orderBy: { createdAt: "asc" },
  });
  check(
    "6. Lịch sử đầy đủ: gửi → trả lại → gửi lại → xác nhận",
    reviews4.length === 4 &&
      reviews4[0].action === "SUBMITTED" &&
      reviews4[1].action === "RETURNED" &&
      reviews4[2].action === "SUBMITTED" &&
      reviews4[3].action === "CONFIRMED",
    reviews4.map((r: any) => r.action).join(" → ")
  );

  // ---------------------------------------------------------------- 7. Không 2 luồng duyệt
  const taskRes = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({
      title: `${TAG} nhiệm vụ liên kết`,
      description: "nhiệm vụ để kiểm tra không tạo 2 luồng duyệt",
      ownerId: staff.id,
      assigneeIds: [staff.id],
      currentDeadline: "2026-10-30T10:00:00.000Z",
      priority: "Cao",
    }),
  });
  const taskJson = await taskRes.json().catch(() => ({}));
  const taskId = taskJson?.data?.id;
  check("7. Tạo được nhiệm vụ để kiểm tra", taskRes.status < 300 && !!taskId, `HTTP ${taskRes.status}`);
  if (taskId) {
    createdTaskIds.push(taskId);
    const linkRes = await fetch(`${BASE}/api/personal-work-items`, {
      method: "PATCH",
      headers: H(staffToken),
      body: JSON.stringify({ id: itemId, taskId }),
    });
    // item đã CONFIRMED nên bị khoá trước — dùng 1 việc mới để kiểm tra
    const create2 = await fetch(`${BASE}/api/personal-work-items`, {
      method: "POST",
      headers: H(staffToken),
      body: JSON.stringify({
        personId: staff.id,
        periodId: period.id,
        title: `${TAG} việc gắn nhiệm vụ`,
        taskId,
      }),
    });
    const cj2 = await create2.json().catch(() => ({}));
    const item2Id = cj2?.data?.id;
    check("7. Tạo được công việc gắn nhiệm vụ", create2.status === 201 && !!item2Id, `HTTP ${create2.status}`);
    if (item2Id) {
      createdItemIds.push(item2Id);
      const submitTaskLinked = await fetch(`${BASE}/api/personal-work-items/${item2Id}/review`, {
        method: "POST",
        headers: H(staffToken),
        body: JSON.stringify({ action: "SUBMIT", resultText: "xong rồi", completedOn: "2026-10-21" }),
      });
      check(
        "7. Công việc gắn nhiệm vụ không mở thêm luồng duyệt riêng",
        submitTaskLinked.status === 409,
        `HTTP ${submitTaskLinked.status}`
      );
    }
  }

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exitCode = failed === 0 ? 0 : 1;
}

async function cleanup() {
  for (const id of createdItemIds) {
    try {
      await prisma.workItemReview.deleteMany({ where: { workItemId: id } });
      await prisma.personalWorkItem.delete({ where: { id } });
    } catch {}
  }
  for (const id of createdTaskIds) {
    try {
      await prisma.taskUpdate.deleteMany({ where: { taskId: id } });
      await prisma.task.delete({ where: { id } });
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
