/**
 * test-yc38-submit-approval.ts — Kiểm thử luồng TRÌNH DUYỆT KẾT QUẢ (YC-38 B4).
 *
 *   # 1) Khởi động server local (DB scratch có dữ liệu Production + schema YC-38):
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc38_restore"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx next dev -p 3100
 *   # 2) Chạy test:
 *   npx tsx scripts/test-yc38-submit-approval.ts
 *
 * Nhóm kiểm thử (theo yêu cầu V.):
 *  1. 50%  → IN_PROGRESS, kind=progress
 *  2. 100% → WAITING_REVIEW, kind=submit
 *  3. Một lần nộp = đúng một sự kiện submit
 *  4. Gửi lại / gửi đồng thời → không tạo bản ghi trùng
 *  5. Checkbox & giá trị submit đồng bộ (kiểm tra mã nguồn)
 *  6. Mở lại modal không giữ trạng thái cũ (kiểm tra mã nguồn)
 *  7. Nhiệm vụ xuất hiện trong hàng đợi lãnh đạo duyệt
 *  8. Lãnh đạo duyệt hợp lệ → hoàn thành theo quy trình
 *  9. Yêu cầu bổ sung → cán bộ cập nhật và trình lại
 * 10. Người không đủ quyền không được tự hoàn thành
 * 11. Luồng /my-work (newStatus/statusAfter) không bị ảnh hưởng
 */
import fs from "fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const DB = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: DB } } });
const secrets = JSON.parse(
  fs.readFileSync("D:/thanhnx/OpenCode/talung-cus-work/demo-ops/demo-secrets.json", "utf8")
);
const pw = Object.fromEntries(
  secrets.accounts.map((a: any) => [a.username, process.env.TEST_PASSWORD || a.password])
);

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

const TAG = "[YC38-B4-TEST]";
const created: string[] = [];

async function login(username: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: pw[username] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error(`đăng nhập ${username} lỗi HTTP ${r.status}`);
  return j.token;
}
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

async function main() {
  console.log("=== YC-38 B4 — Kiểm thử luồng trình duyệt kết quả ===\n");

  const leaderToken = await login("demold01");
  const staffToken = await login("democb01");
  const leaderAccount = await prisma.account.findUnique({
    where: { username: "demold01" },
    include: { person: { include: { assignments: true } } },
  });
  const staffAccount = await prisma.account.findUnique({
    where: { username: "democb01" },
    include: { person: { include: { assignments: true } } },
  });
  const leader =
    (await prisma.person.findFirst({
      where: { code: "DEMO-LD-01" },
      include: { assignments: true },
    })) || leaderAccount?.person;
  const staff =
    (await prisma.person.findFirst({
      where: { code: "DEMO-CB-01" },
      include: { assignments: true },
    })) || staffAccount?.person;
  if (!leader || !staff) throw new Error("thiếu tài khoản DEMO");

  // ---------------------------------------------------------------- tạo nhiệm vụ
  const title = `${TAG} nhiệm vụ kiểm thử trình duyệt`;
  const createRes = await fetch(`${BASE}/api/tasks`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({
      title,
      priority: "Cao",
      ownerId: staff.id,
      unitId: leader.assignments?.[0]?.unitId,
      currentDeadline: "2026-11-30T10:00:00.000Z",
      description: "YC38-B4 test",
    }),
  });
  const createJson = await createRes.json().catch(() => ({}));
  const taskId = createJson?.data?.id;
  check("0. Tạo nhiệm vụ để lãnh đạo giao", !!taskId, createJson?.data?.code || createJson?.error);
  if (!taskId) process.exit(1);
  created.push(taskId);

  const getTask = async () =>
    prisma.task.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
  const countKinds = async (kind: string) =>
    prisma.taskUpdate.count({ where: { taskId, kind } });

  // ---------------------------------------------------------------- cán bộ nhận việc
  const acceptRes = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: taskId, action: "ACCEPT_TASK" }),
  });
  check("0. Cán bộ nhận việc", acceptRes.ok, `HTTP ${acceptRes.status}`);

  // ================================================================ R1: 50%
  const r50 = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      progressPercent: 50,
      notes: `${TAG} cập nhật 50%`,
      submitForReview: false,
    }),
  });
  const j50 = await r50.json().catch(() => ({}));
  const t50 = await getTask();
  const k50 = await prisma.taskUpdate.findFirst({
    where: { taskId, kind: "progress" },
    orderBy: { createdAt: "desc" },
  });
  check("R1. 50% → HTTP 201", r50.status === 201, `HTTP ${r50.status}`);
  check("R1. 50% → status giữ IN_PROGRESS", t50?.status === "IN_PROGRESS", t50?.status);
  check("R1. 50% → kind=progress", k50?.kind === "progress", k50?.kind);
  check("R1. 50% → không tạo sự kiện submit", (await countKinds("submit")) === 0);

  // ================================================================ R2: 100% → trình duyệt
  const r100 = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      progressPercent: 100,
      notes: `${TAG} hoàn thành 100%`,
      submitForReview: true,
    }),
  });
  const j100 = await r100.json().catch(() => ({}));
  const t100 = await getTask();
  const submitCount1 = await countKinds("submit");
  check("R2. 100% → HTTP 201", r100.status === 201, `HTTP ${r100.status}`);
  check("R2. 100% → status = WAITING_REVIEW", t100?.status === "WAITING_REVIEW", t100?.status);
  check("R2. 100% → đúng 1 sự kiện kind=submit", submitCount1 === 1, `n=${submitCount1}`);
  check("R2. Response báo submitted=true", j100?.submitted === true);

  // ================================================================ R3: gửi lại (cùng nội dung)
  const rAgain = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      progressPercent: 100,
      notes: `${TAG} hoàn thành 100%`,
      submitForReview: true,
    }),
  });
  const jAgain = await rAgain.json().catch(() => ({}));
  const submitCount2 = await countKinds("submit");
  check(
    "R3. Gửi lại → không tạo sự kiện submit thứ 2",
    submitCount2 === 1,
    `n=${submitCount2} (HTTP ${rAgain.status})`
  );
  check(
    "R3. Trả lỗi rõ ràng khi đã chờ duyệt",
    rAgain.status === 409 || jAgain?.deduplicated === true,
    `HTTP ${rAgain.status} ${String(jAgain?.error || jAgain?.message || "").slice(0, 70)}`
  );

  // ================================================================ R4: gửi lại với nội dung KHÁC
  const rDiff = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      progressPercent: 100,
      notes: `${TAG} nộp lại với nội dung khác`,
      submitForReview: true,
    }),
  });
  const submitCount3 = await countKinds("submit");
  check("R4. Nộp lại (nội dung khác) → vẫn đúng 1 sự kiện submit", submitCount3 === 1, `n=${submitCount3}`);
  check("R4. Trả 409", rDiff.status === 409, `HTTP ${rDiff.status}`);

  // ================================================================ R5: gửi ĐỒNG THỜI
  const t2 = await prisma.task.findUnique({ where: { id: taskId } });
  await prisma.taskUpdate.deleteMany({ where: { taskId } });
  await prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
  const parallel = await Promise.all(
    [1, 2, 3].map((i) =>
      fetch(`${BASE}/api/tasks/${taskId}/updates`, {
        method: "POST",
        headers: H(staffToken),
        body: JSON.stringify({
          progressPercent: 100,
          notes: `${TAG} đồng thời ${i}`,
          submitForReview: true,
        }),
      })
    )
  );
  const submitCount4 = await countKinds("submit");
  check("R5. Gửi 3 request đồng thời → đúng 1 sự kiện submit", submitCount4 === 1, `n=${submitCount4}`);
  const tPar = await getTask();
  check("R5. Trạng thái sau khi gửi đồng thời = WAITING_REVIEW", tPar?.status === "WAITING_REVIEW", tPar?.status);
  check(
    "R5. Không có mã 500 khi gửi đồng thời",
    parallel.every((p) => p.status < 500),
    parallel.map((p) => p.status).join(",")
  );

  // ================================================================ R7: vào hàng đợi lãnh đạo
  const queue = await (
    await fetch(`${BASE}/api/tasks?status=WAITING_REVIEW&pageSize=100`, { headers: H(leaderToken) })
  ).json();
  const inQueue = (queue.data || []).some((t: any) => t.id === taskId);
  check("R7. Nhiệm vụ xuất hiện trong hàng đợi lãnh đạo duyệt", inQueue);

  // ================================================================ R10: cán bộ không tự hoàn thành
  const staffComplete = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(staffToken),
    body: JSON.stringify({ id: taskId, action: "CONFIRM_COMPLETION" }),
  });
  check(
    "R10. Cán bộ KHÔNG tự nghiệm thu hoàn thành (403)",
    staffComplete.status === 403,
    `HTTP ${staffComplete.status}`
  );
  const stillWaiting = await getTask();
  check("R10. Trạng thái không đổi sau khi cán bộ cố tự hoàn thành", stillWaiting?.status === "WAITING_REVIEW", stillWaiting?.status);

  // ================================================================ R9: lãnh đạo trả lại → cán bộ trình lại
  const returnRes = await fetch(`${BASE}/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ status: "IN_PROGRESS", notes: "Yêu cầu bổ sung nội dung" }),
  });
  const tReturned = await getTask();
  const returnEvent = await prisma.taskUpdate.findFirst({
    where: { taskId, kind: "return" },
    orderBy: { createdAt: "desc" },
  });
  check("R9. Lãnh đạo trả lại → IN_PROGRESS", tReturned?.status === "IN_PROGRESS", tReturned?.status);
  check("R9. Ghi sự kiện kind=return", !!returnEvent);

  const resubmit = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      progressPercent: 100,
      notes: `${TAG} đã bổ sung, trình lại`,
      submitForReview: true,
    }),
  });
  const tResub = await getTask();
  check("R9. Cán bộ trình lại → WAITING_REVIEW", tResub?.status === "WAITING_REVIEW", `${resubmit.status} ${tResub?.status}`);

  // ================================================================ R8: lãnh đạo duyệt
  const approveRes = await fetch(`${BASE}/api/tasks`, {
    method: "PATCH",
    headers: H(leaderToken),
    body: JSON.stringify({ id: taskId, action: "CONFIRM_COMPLETION" }),
  });
  const tApproved = await getTask();
  const approveEvent = await prisma.taskUpdate.findFirst({
    where: { taskId, kind: "approve" },
    orderBy: { createdAt: "desc" },
  });
  check("R8. Lãnh đạo nghiệm thu → COMPLETED", tApproved?.status === "COMPLETED", `${approveRes.status} ${tApproved?.status}`);
  check("R8. Ghi sự kiện kind=approve", !!approveEvent);

  // ================================================================ R11: luồng /my-work không bị ảnh hưởng
  const t2b = await prisma.task.findUnique({ where: { id: taskId } });
  await prisma.taskUpdate.deleteMany({ where: { taskId } });
  await prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
  const myworkRes = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      progressPercent: 100,
      notes: `${TAG} luồng /my-work (newStatus/statusAfter)`,
      newStatus: "WAITING_REVIEW",
      statusAfter: "WAITING_REVIEW",
    }),
  });
  const tMywork = await getTask();
  const myworkSubmit = await countKinds("submit");
  check("R11. Luồng /my-work (newStatus/statusAfter) → WAITING_REVIEW", tMywork?.status === "WAITING_REVIEW", `HTTP ${myworkRes.status} ${tMywork?.status}`);
  check("R11. Luồng /my-work → kind=submit", myworkSubmit === 1, `n=${myworkSubmit}`);

  // ================================================================ R5b: trình duyệt sớm (<100%) chưa triển khai
  await prisma.taskUpdate.deleteMany({ where: { taskId } });
  await prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
  const early = await fetch(`${BASE}/api/tasks/${taskId}/updates`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({
      progressPercent: 50,
      notes: `${TAG} xin trình duyệt sớm 50%`,
      submitForReview: true,
    }),
  });
  const jEarly = await early.json().catch(() => ({}));
  const tEarly = await getTask();
  check("R5b. Trình duyệt sớm ở 50% → KHÔNG chuyển WAITING_REVIEW", tEarly?.status === "IN_PROGRESS", tEarly?.status);
  check("R5b. Có ghi chú giải thích (đề xuất nghiệp vụ chờ xác nhận)", !!jEarly?.earlySubmitNote, String(jEarly?.earlySubmitNote || "").slice(0, 60));

  // ================================================================ R5/R6 (kiểm tra mã nguồn)
  const pageSrc = fs.readFileSync(
    "D:/thanhnx/OpenCode/talung-cus-work/src/app/tasks/[id]/page.tsx",
    "utf8"
  );
  const pageCode = pageSrc
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  check(
    "R5. O tick suy ra tu tien do (khong con state rieng lech hien thi)",
    /checked=\{newProgress === 100\}/.test(pageCode) && !/isSubmitReview/.test(pageCode),
    "checked={newProgress === 100}"
  );
  check(
    "R5. Payload submitForReview theo quy tắc 100%",
    /submitForReview: newProgress === 100/.test(pageSrc) &&
      !/submitForReview: isSubmitReview/.test(pageSrc)
  );
  check(
    "R6. Mở modal reset tiến độ + nội dung",
    /setNewProgress\(task\?\.progressPercent \?\? 0\)/.test(pageSrc) &&
      /setUpdateNotes\(""\)/.test(pageSrc)
  );
  check(
    "R5. Có thông báo khi nhiệm vụ đã chờ duyệt (chặn nộp lặp ở giao diện)",
    pageSrc.includes("không thể trình lặp lại")
  );
  const apiSrc = fs.readFileSync(
    "D:/thanhnx/OpenCode/talung-cus-work/src/app/api/tasks/[id]/updates/route.ts",
    "utf8"
  );
  check(
    "R4. API chống nộp trùng ở server (khoá + đọc lại trạng thái + 409)",
    apiSrc.includes("task-status:") &&
      apiSrc.includes("already_submitted") &&
      apiSrc.includes("409")
  );
  check(
    "R4. Ghi sự kiện + đổi trạng thái trong CÙNG transaction",
    apiSrc.includes("tx.taskUpdate.create") && apiSrc.includes("tx.task.update")
  );
  const guardSrc = fs.readFileSync(
    "D:/thanhnx/OpenCode/talung-cus-work/src/server/task-transitions.ts",
    "utf8"
  );
  check(
    "R4. Guard chặn lặp WAITING_REVIEW → WAITING_REVIEW",
    guardSrc.includes('currentStatus === "WAITING_REVIEW" && target === "WAITING_REVIEW"')
  );

  // don dep ban ghi test (chi o DB local)
  for (const id of created) {
    try {
      await prisma.workItemProduct.deleteMany({ where: { workItem: { title: { startsWith: TAG } } } });
      await prisma.workItemAssignment.deleteMany({ where: { workItem: { title: { startsWith: TAG } } } });
      await prisma.personalWorkItem.deleteMany({ where: { title: { startsWith: TAG } } });
      await prisma.task.deleteMany({ where: { id } });
    } catch {}
  }

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch(async (e) => {
    console.error(e);
    // dọn dẹp bản ghi test
    for (const id of created) {
      try {
        await prisma.workItemProduct.deleteMany({ where: { workItem: { title: { startsWith: TAG } } } });
        await prisma.workItemAssignment.deleteMany({ where: { workItem: { title: { startsWith: TAG } } } });
        await prisma.personalWorkItem.deleteMany({ where: { title: { startsWith: TAG } } });
        await prisma.task.deleteMany({ where: { id } });
      } catch {}
    }
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
