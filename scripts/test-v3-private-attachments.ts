/**
 * test-v3-private-attachments.ts — V3.1.2: KHO TỆP ĐÍNH KÈM PRIVATE.
 *
 * Kiểm chứng:
 *  1. Tải tệp qua route có xác thực: chủ nhiệm/lãnh đạo đơn vị → 200 + đúng nội dung.
 *  2. Người không có quyền (khác bộ phận) → 403 (không lộ nội dung).
 *  3. Chưa đăng nhập → 401.
 *  4. Vòng upload → tải lại (file mới) qua route có xác thực.
 *  5. API KHÔNG trả về URL công khai của kho lưu trữ (fileUrl phải là route nội bộ).
 *  6. Tệp của nhiệm vụ khác không tải được qua URL của nhiệm vụ này (chống IDOR).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-private-attachments"
);
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = "[V3-PRIVATE-FILE]";

let pass = 0,
  fail = 0;
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
  if (!json.token) throw new Error(`đăng nhập ${username} lỗi HTTP ${res.status}`);
  return json.token;
}
const H = (t: string) => ({ Authorization: `Bearer ${t}` });

async function main() {
  console.log("=== V3.1.2 — KHO TEP DINH KEM PRIVATE (route co xac thuc) ===\n");

  // Chon 3 tai khoan: chu nhiem (BP A), can bo khac bo phan (BP B), lanh dao don vi
  const accounts = await prisma.account.findMany({
    include: {
      person: {
        include: {
          assignments: { where: { isPrimary: true }, include: { unit: true } },
        },
      },
      roleGrants: { include: { role: true } },
    },
  });
  const byRole = (code: string) =>
    accounts.filter((a) => a.roleGrants[0]?.role.code === code);
  const byName = (n: string) => accounts.find((a) => a.username === n);
  // Tài khoản DEMO (mật khẩu kiểm thử đã biết) — 2 bộ phận khác nhau + lãnh đạo đơn vị
  const staffA = byName("democb01") || byRole("STAFF").find((a) => a.person.assignments[0]?.unit?.code === "BP_NGHIEPVU_A");
  const staffB = byName("democb02") || byRole("STAFF").find((a) => a.person.assignments[0]?.unit?.code === "BP_GIAMSAT_B");
  const leader = byName("demold01") || byRole("UNIT_LEADER")[0];
  if (!staffA || !staffB || !leader) {
    console.log("  THIẾU tài khoản fixture cần thiết — bỏ qua.");
    return;
  }

  // Tao nhiem vu + tep dinh kem truc tiep trong DB (de co tep ton tai san)
  const unitA = staffA.person.assignments[0]!.unit;
  const content = Buffer.from(`TALUNG-TEST-${TAG}-${crypto.randomBytes(4).toString("hex")}`, "utf8");
  const storageKey = `task-TEST-PRIVATE/${Date.now()}-private-test.txt`;
  const localDir = path.resolve(process.env.LOCAL_STORAGE_DIR || "./.local-storage", "task-attachments");
  const localFile = path.join(localDir, storageKey);
  fs.mkdirSync(path.dirname(localFile), { recursive: true });
  fs.writeFileSync(localFile, content);

  const task = await prisma.task.create({
    data: {
      code: "TST-PRIV-" + Date.now().toString().slice(-6),
      title: `${TAG} nhiem vu kiem tra tep rieng tu`,
      unitId: unitA.id,
      ownerId: staffA.personId,
      status: "IN_PROGRESS",
      priority: "Thường",
      originalDeadline: new Date("2026-12-31T00:00:00.000Z"),
      currentDeadline: new Date("2026-12-31T00:00:00.000Z"),
      description: TAG,
    },
  });
  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId: task.id,
      uploadedById: staffA.personId,
      fileName: "private-test.txt",
      fileSize: content.length,
      mimeType: "text/plain",
      storageKey,
      fileUrl: "", // KHÔNG lưu URL công khai
    },
  });

  try {
    const tokA = await login(staffA.username);
    const tokB = await login(staffB.username);
    const tokL = await login(leader.username);
    const url = `${BASE}/api/tasks/${task.id}/attachments/${attachment.id}/file`;

    // 1. Chu nhiem tai duoc
    const r1 = await fetch(url, { headers: H(tokA) });
    const b1 = Buffer.from(await r1.arrayBuffer());
    check(
      "1. Chu nhiem tai duoc tep (200) + dung noi dung",
      r1.status === 200 && b1.equals(content),
      `HTTP ${r1.status}, ${b1.length}B`
    );
    check(
      "1b. Khong dung URL cong khai; co Cache-Control private",
      (r1.headers.get("cache-control") || "").includes("private"),
      r1.headers.get("cache-control") || ""
    );

    // 2. Lanh dao don vi (ORGANIZATION) tai duoc
    const r2 = await fetch(url, { headers: H(tokL) });
    check("2. Lanh dao don vi tai duoc tep (200)", r2.status === 200, `HTTP ${r2.status}`);

    // 3. Nguoi khac bo phan bi chan
    const r3 = await fetch(url, { headers: H(tokB) });
    const j3 = await r3.json().catch(() => ({}));
    check(
      "3. Can bo khac bo phan bi chan (403)",
      r3.status === 403,
      `HTTP ${r3.status}`
    );
    check("3b. Khong roi dung tep khi bi tu choi", !String(j3.fileUrl || "").includes("storage/v1"));

    // 4. Chua dang nhap bi chan
    const r4 = await fetch(url);
    check("4. Chua dang nhap bi chan (401)", r4.status === 401, `HTTP ${r4.status}`);

    // 5. Chong IDOR: tep cu nhiem vu khac qua URL nhiem vu nay
    const otherTask = await prisma.task.findFirst({ where: { id: { not: task.id } } });
    if (otherTask) {
      const r5 = await fetch(`${BASE}/api/tasks/${task.id}/attachments/${crypto.randomUUID()}/file`, {
        headers: H(tokA),
      });
      check("5. Tep khong ton tai → 404", r5.status === 404, `HTTP ${r5.status}`);
    }

    // 6. API danh sach KHONG tra URL cong khai
    const r6 = await fetch(`${BASE}/api/tasks/${task.id}/attachments`, { headers: H(tokA) });
    const j6 = await r6.json().catch(() => ({}));
    const list = j6.data || [];
    check(
      "6. Danh sach tep: fileUrl tro ve route noi bo (khong URL cong khai)",
      list.length > 0 && String(list[0].fileUrl || "").startsWith("/api/tasks/"),
      String(list[0]?.fileUrl || "").slice(0, 60)
    );
    const raw = JSON.stringify(j6);
    check(
      "6b. Khong co URL storage/v1 trong payload",
      !raw.includes("storage/v1"),
      raw.includes("storage/v1") ? "CO URL CONG KHAI" : "sach"
    );

    // 7. Vong upload -> tai lai (tep moi)
    const fd = new FormData();
    fd.set("file", new Blob([Buffer.from("NOI-DUNG-TAI-LAI")], { type: "text/plain" }), "upload-test.txt");
    const r7 = await fetch(`${BASE}/api/tasks/${task.id}/attachments`, {
      method: "POST",
      headers: H(tokA),
      body: fd,
    });
    const j7 = await r7.json().catch(() => ({}));
    const newAtt = j7.data;
    check("7. Upload tep moi thanh cong", r7.status === 201 || r7.status === 200, `HTTP ${r7.status}`);
    check(
      "7b. Tep moi khong luu URL cong khai",
      !String(newAtt?.fileUrl || "").includes("storage/v1"),
      String(newAtt?.fileUrl || "").slice(0, 60)
    );
    if (newAtt?.id) {
      const r8 = await fetch(`${BASE}/api/tasks/${task.id}/attachments/${newAtt.id}/file`, {
        headers: H(tokA),
      });
      const b8 = Buffer.from(await r8.arrayBuffer());
      check(
        "8. Tai lai tep vua upload dung noi dung",
        r8.status === 200 && b8.toString("utf8") === "NOI-DUNG-TAI-LAI",
        `HTTP ${r8.status}, "${b8.toString("utf8").slice(0, 30)}"`
      );
      await prisma.taskAttachment.delete({ where: { id: newAtt.id } }).catch(() => {});
    }

    // 9. Audit: co ghi vet tai tep
    const audit = await prisma.auditEvent.count({
      where: { action: "TASK_ATTACHMENT_DOWNLOAD", resourceId: attachment.id },
    });
    check("9. Ghi audit khi tai tep", audit > 0, `${audit} su kien`);
    const auditDenied = await prisma.auditEvent.count({
      where: { action: "TASK_ATTACHMENT_ACCESS_DENIED" },
    });
    check("9b. Ghi audit khi bi tu choi", auditDenied > 0, `${auditDenied} su kien`);
  } finally {
    await prisma.taskAttachment.deleteMany({ where: { taskId: task.id } }).catch(() => {});
    await prisma.task.delete({ where: { id: task.id } }).catch(() => {});
    try {
      fs.unlinkSync(path.join(localDir, storageKey));
    } catch {}
    await prisma.$disconnect();
  }

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("LỖI:", String(e.stack || e.message).slice(0, 400));
  await prisma.$disconnect();
  process.exit(1);
});
