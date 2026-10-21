/**
 * test-yc38-v1-v2-workitem.ts — YC-38 (UAT-D5.1) · V1 + V2.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc38_restore"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx next dev -p 3100          # chạy song song
 *   npx tsx scripts/test-yc38-v1-v2-workitem.ts
 *
 * V1 — khoá đầu việc gắn với nhiệm vụ đã nghiệm thu (COMPLETED/DONE/CANCELED)
 * V2 — ngày hoàn thành theo giờ Việt Nam (không phụ thuộc múi giờ thiết bị)
 *
 * Tài khoản test: tạo riêng trên DB LOCAL, mật khẩu ngẫu nhiên do script sinh.
 * Không dùng mật khẩu demo Production, không reset mật khẩu tài khoản người dùng.
 */
import crypto from "node:crypto";
import path from "node:path";
import fs from "fs";
import { createRequire } from "node:module";
const require = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

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

const TMP = "[YC38-V1V2]";
const tempPersonIds: string[] = [];
const tempAccountIds: string[] = [];
const tempWorkItemIds: string[] = [];
const tempTaskIds: string[] = [];

async function login(username: string, password: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j.token || null };
}
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

async function patchWI(token: string, id: string, payload: any) {
  const r = await fetch(`${BASE}/api/personal-work-items`, {
    method: "PATCH",
    headers: H(token),
    body: JSON.stringify({ id, ...payload }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function deleteWI(token: string, id: string) {
  const r = await fetch(`${BASE}/api/personal-work-items?id=${id}`, { method: "DELETE", headers: H(token) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function main() {
  console.log("=== YC-38 UAT-D5.1 — V1 (khoá đầu việc) + V2 (giờ Việt Nam) ===\n");

  const pw = crypto.randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(pw, 10);
  const staffRole = await prisma.role.findUnique({ where: { code: "STAFF" } });
  const leaderRole = await prisma.role.findUnique({ where: { code: "UNIT_LEADER" } });
  const sysRole = await prisma.role.findUnique({ where: { code: "SYSTEM_ADMIN" } });
  const rootUnit = await prisma.orgUnit.findFirst({ where: { parentId: null } });
  const period = await prisma.reportingPeriod.findFirst({ orderBy: { startAt: "asc" } });

  // dọn sót từ lần chạy trước (chỉ DB local) để chạy lại được nhiều lần
  await prisma.account.deleteMany({ where: { person: { code: { startsWith: "YC38-V1V2" } } } });
  await prisma.person.deleteMany({ where: { code: { startsWith: "YC38-V1V2" } } });
  await prisma.task.deleteMany({ where: { code: { startsWith: TMP } } });
  await prisma.personalWorkItem.deleteMany({ where: { title: { startsWith: TMP } } });

  const mkAccount = async (code: string, roleId: string, scopeType: string) => {
    const person = await prisma.person.create({
      data: { code, fullName: `YC38 V1V2 ${code}`, status: "ACTIVE" },
    });
    tempPersonIds.push(person.id);
    const acc = await prisma.account.create({
      data: {
        username: `${code.toLowerCase()}_${Date.now().toString(36)}`,
        passwordHash: hash,
        personId: person.id,
        status: "ACTIVE",
        roleGrants: { create: [{ roleId, scopeType }] },
      },
    });
    tempAccountIds.push(acc.id);
    return { acc, username: acc.username, personId: person.id };
  };

  const staff = await mkAccount("YC38-V1V2-STAFF", staffRole!.id, "DEPARTMENT");
  const leader = await mkAccount("YC38-V1V2-LEADER", leaderRole!.id, "ORGANIZATION");
  const admin = await mkAccount("YC38-V1V2-ADMIN", sysRole!.id, "ORGANIZATION");

  // ---- Fixture: 1) đầu việc gắn nhiệm vụ ĐÃ NGHIỆM THU
  const closedTask = await prisma.task.create({
    data: {
      code: `${TMP}-TASK-CLOSED`,
      title: `${TMP} nhiem vu da nghiem thu`,
      ownerId: staff.personId,
      unitId: rootUnit!.id,
      priority: "Cao",
      status: "COMPLETED",
      originalDeadline: new Date("2026-10-20T10:00:00Z"),
      currentDeadline: new Date("2026-10-20T10:00:00Z"),
    },
  });
  tempTaskIds.push(closedTask.id);
  const wiClosed = await prisma.personalWorkItem.create({
    data: {
      personId: staff.personId,
      periodId: period!.id,
      taskId: closedTask.id,
      title: `${TMP} dau viec gan nhiem vu da nghiem thu`,
      status: "COMPLETED",
      completedDate: new Date("2026-10-21T00:00:00Z"),
    },
  });
  tempWorkItemIds.push(wiClosed.id);

  // ---- Fixture: 2) đầu việc gắn nhiệm vụ CHƯA hoàn thành
  const openTask = await prisma.task.create({
    data: {
      code: `${TMP}-TASK-OPEN`,
      title: `${TMP} nhiem vu dang thuc hien`,
      ownerId: staff.personId,
      unitId: rootUnit!.id,
      priority: "Cao",
      status: "IN_PROGRESS",
      originalDeadline: new Date("2026-11-20T10:00:00Z"),
      currentDeadline: new Date("2026-11-20T10:00:00Z"),
    },
  });
  tempTaskIds.push(openTask.id);
  const wiOpen = await prisma.personalWorkItem.create({
    data: {
      personId: staff.personId,
      periodId: period!.id,
      taskId: openTask.id,
      title: `${TMP} dau viec gan nhiem vu dang thuc hien`,
      status: "IN_PROGRESS",
    },
  });
  tempWorkItemIds.push(wiOpen.id);

  // ---- Fixture: 3) đầu việc ĐỘC LẬP (không gắn nhiệm vụ)
  const wiSolo = await prisma.personalWorkItem.create({
    data: {
      personId: staff.personId,
      periodId: period!.id,
      title: `${TMP} dau viec doc lap`,
      status: "IN_PROGRESS",
    },
  });
  tempWorkItemIds.push(wiSolo.id);

  const sLogin = await login(staff.username, pw);
  const lLogin = await login(leader.username, pw);
  const aLogin = await login(admin.username, pw);
  check("0. Đăng nhập 3 tài khoản test (cán bộ / lãnh đạo / quản trị)", !!sLogin.token && !!lLogin.token && !!aLogin.token);

  // ================================================================ V1
  // 1) PATCH đầu việc của nhiệm vụ đã nghiệm thu → 409
  const p1 = await patchWI(sLogin.token!, wiClosed.id, { title: `${TMP} sua tieu de` });
  check("V1-1. PATCH đầu việc của nhiệm vụ đã nghiệm thu → bị chặn 409", p1.status === 409, `HTTP ${p1.status}`);

  // 2) DELETE đầu việc của nhiệm vụ đã nghiệm thu → 409
  const d1 = await deleteWI(sLogin.token!, wiClosed.id);
  check("V1-2. DELETE đầu việc của nhiệm vụ đã nghiệm thu → bị chặn 409", d1.status === 409, `HTTP ${d1.status}`);
  const stillThere = await prisma.personalWorkItem.findUnique({ where: { id: wiClosed.id } });
  check("V1-2b. Bản ghi vẫn còn nguyên (không bị xoá/đổi)", !!stillThere && stillThere.title === wiClosed.title);

  // 3) Lãnh đạo cũng bị chặn (không mở rộng quyền)
  const p2 = await patchWI(lLogin.token!, wiClosed.id, { title: `${TMP} lanh dao sua` });
  check("V1-3. Lãnh đạo cũng bị chặn (không nới quyền)", p2.status === 409, `HTTP ${p2.status}`);

  // 4) Quản trị kỹ thuật: vẫn 403 như trước (không mở rộng quyền)
  const p3 = await patchWI(aLogin.token!, wiClosed.id, { title: `${TMP} admin sua` });
  check("V1-4. Quản trị kỹ thuật vẫn bị từ chối (403)", p3.status === 403, `HTTP ${p3.status}`);

  // 5) Vượt khóa bằng cách GỠ liên kết (taskId = null) → vẫn 409
  const p4 = await patchWI(sLogin.token!, wiClosed.id, { taskId: null });
  check("V1-5. Vượt khóa bằng cách gỡ liên kết (taskId=null) → vẫn 409", p4.status === 409, `HTTP ${p4.status}`);
  const relStill = await prisma.personalWorkItem.findUnique({ where: { id: wiClosed.id }, select: { taskId: true } });
  check("V1-5b. Liên kết vẫn nguyên vẹn", relStill?.taskId === closedTask.id);

  // 6) Vượt khóa bằng cách trỏ sang nhiệm vụ khác → 409
  const p5 = await patchWI(sLogin.token!, wiClosed.id, { taskId: openTask.id });
  check("V1-6. Vượt khóa bằng cách trỏ sang nhiệm vụ khác → vẫn 409", p5.status === 409, `HTTP ${p5.status}`);

  // 7) Gửi taskId/status giả trong body → không giúp vượt khóa
  const p6 = await patchWI(sLogin.token!, wiClosed.id, { taskId: openTask.id, status: "IN_PROGRESS", title: `${TMP} gia` });
  check("V1-7. Gửi taskId/status giả trong body → vẫn 409", p6.status === 409, `HTTP ${p6.status}`);

  // 8) Liên kết đầu việc ĐỘC LẬP vào nhiệm vụ đã nghiệm thu → 409
  const p7 = await patchWI(sLogin.token!, wiSolo.id, { taskId: closedTask.id });
  check("V1-8. Liên kết đầu việc độc lập vào nhiệm vụ đã nghiệm thu → 409", p7.status === 409, `HTTP ${p7.status}`);

  // 9) Nhiệm vụ CHƯA hoàn thành: thao tác hợp lệ KHÔNG bị khóa nhầm
  const p8 = await patchWI(sLogin.token!, wiOpen.id, { title: `${TMP} sua tieu de hop le` });
  check("V1-9. Đầu việc của nhiệm vụ chưa hoàn thành → vẫn sửa được", p8.status === 200, `HTTP ${p8.status}`);

  // 10) Đầu việc độc lập: vẫn vận hành đúng
  const p9 = await patchWI(sLogin.token!, wiSolo.id, { title: `${TMP} sua dau viec doc lap` });
  check("V1-10. Đầu việc độc lập (không có nhiệm vụ) → vẫn sửa được", p9.status === 200, `HTTP ${p9.status}`);

  // 11) Đầu việc độc lập: xoá vẫn được (không khóa nhầm)
  const d2 = await deleteWI(sLogin.token!, wiSolo.id);
  check("V1-11. Xoá đầu việc độc lập → vẫn được (không khóa nhầm)", d2.status === 200, `HTTP ${d2.status}`);

  // 12) Quyền xem/khả năng truy cập lịch sử KHÔNG bị thu hẹp
  const g1 = await fetch(`${BASE}/api/personal-work-items?year=2026&month=10`, { headers: H(sLogin.token!) });
  check("V1-12. GET danh sách/chi tiết đầu việc vẫn hoạt động (không thu hẹp quyền xem)", g1.status === 200, `HTTP ${g1.status}`);

  // 13) Dữ liệu đầu việc của nhiệm vụ đã nghiệm thu KHÔNG bị thay đổi
  const after = await prisma.personalWorkItem.findUnique({ where: { id: wiClosed.id } });
  check(
    "V1-13. Dữ liệu đầu việc đã nghiệm thu KHÔNG bị thay đổi sau các request bị chặn",
    !!after && after.title === wiClosed.title && after.status === "COMPLETED",
    `status=${after?.status}`
  );

  // ================================================================ V2
  const dtSrc = fs.readFileSync("D:/thanhnx/OpenCode/talung-cus-work/src/lib/datetime.ts", "utf8");
  check("V2-1. Helper vnDateOnly tồn tại (ngày theo Asia/Ho_Chi_Minh)", dtSrc.includes("export function vnDateOnly"));
  const mwSrc = fs.readFileSync("D:/thanhnx/OpenCode/talung-cus-work/src/app/my-work/MyWorkItemsSection.tsx", "utf8");
  check(
    "V2-2. Form dùng helper giờ Việt Nam (không dùng getDate() của thiết bị)",
    mwSrc.includes("vnDateOnly(d)") && !/toDateInput = \(d: Date\) => `\$\{d\.getFullYear/.test(mwSrc)
  );

  // V2-3: kết quả KHÔNG phụ thuộc múi giờ thiết bị (chạy tiến trình con với TZ khác nhau)
  const snippet = path.join(tmpdir(), "yc38-v2-tz.ts");
  fs.writeFileSync(
    snippet,
    `import { vnDateOnly, formatVnDateTime } from "${pathToFileUrl(
      "D:/thanhnx/OpenCode/talung-cus-work/src/lib/datetime.ts"
    )}";
console.log(JSON.stringify({
  d: vnDateOnly(new Date("2026-10-21T17:30:00Z")),
  n: formatVnDateTime(new Date("2026-10-21T17:30:00Z")),
  near: vnDateOnly(new Date("2026-10-21T16:59:59Z")),
}));`,
    "utf8"
  );
  const tzResults = TZS.map((tz) => {
    try {
      const out = execFileSync(TSX_BIN, [snippet], {
        env: { ...process.env, TZ: tz },
        encoding: "utf8",
        shell: process.platform === "win32",
      });
      const line = out.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
      return { tz, data: JSON.parse(line || "{}") };
    } catch (e: any) {
      return { tz, data: null, err: String(e.message).slice(0, 120) };
    }
  });
  for (const r of tzResults) {
    check(
      `V2-3. TZ=${r.tz}: 17:30Z ⇒ ngày 22/10/2026 giờ Việt Nam`,
      r.data?.d === "2026-10-22" && r.data?.n === "22/10/2026 00:30",
      r.data ? `${r.data.d} · ${r.data.n}` : r.err || "lỗi"
    );
  }
  const distinct = new Set(tzResults.map((r) => r.data?.d).filter(Boolean));
  check("V2-4. Kết quả giống nhau trên mọi múi giờ thiết bị", distinct.size === 1, `các giá trị: ${[...distinct].join(",")}`);
  check(
    "V2-5. Ranh giới 00:00 Việt Nam: 16:59:59Z ⇒ 21/10 (23:59 VN), 17:00:00Z ⇒ 22/10 (00:00 VN)",
    tzResults[0]?.data?.near === "2026-10-21" && tzResults[0]?.data?.d === "2026-10-22",
    `16:59:59Z ⇒ ${tzResults[0]?.data?.near} · 17:00:00Z ⇒ ${tzResults[0]?.data?.d}`
  );

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(failed === 0 ? 0 : 1);
}

// ---- helper cho phần test múi giờ ----
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const tmpdir = () => os.tmpdir();
const pathToFileUrl = (p: string) => pathToFileURL(p).href;
const TSX_BIN = "D:/thanhnx/OpenCode/talung-cus-work/node_modules/.bin/tsx.cmd";
const TZS = ["Asia/Ho_Chi_Minh", "UTC", "America/New_York", "Asia/Tokyo"];

async function cleanup() {
  for (const id of tempWorkItemIds) {
    try {
      await prisma.personalWorkItem.delete({ where: { id } });
    } catch {}
  }
  try {
    await prisma.personalWorkItem.deleteMany({ where: { title: { startsWith: TMP } } });
  } catch {}
  try {
    await prisma.task.deleteMany({ where: { code: { startsWith: TMP } } });
  } catch {}
  for (const id of tempAccountIds) {
    try {
      await prisma.account.delete({ where: { id } });
    } catch {}
  }
  try {
    await prisma.person.deleteMany({ where: { id: { in: tempPersonIds } } });
  } catch {}
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
