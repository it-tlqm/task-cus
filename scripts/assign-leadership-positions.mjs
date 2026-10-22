/**
 * GAN CHUC VU LANH DAO DON VI — 22/10/2026 (sau reset Production)
 *
 * Boi canh:
 *   - He thong co 2 vai tro RBAC: UNIT_LEADER (Lanh dao don vi) va DEPARTMENT_LEADER.
 *   - Sau reset, ca 3 dong chi Lanh dao don vi deu co positionId = null → giao dien
 *     hien "Lanh dao don vi" / "Cong chuc", KHONG phan biet duoc:
 *        + Truong hai quan cua khau  (CHI_CUC_TRUONG)
 *        + Pho Truong hai quan cua khau (DEPUTY_CHIEF)
 *     (Chu du an / dong chi Nguyen Dan yeu cau 22/10/2026: "Thieu Truong va pho truong
 *      hai quan cua khau" · "Neu phan duoc thi e phan ra nhe").
 *
 * Cach lam:
 *   - Giu nguyen vai tro RBAC (quyen han giong nhau) — chi gan CHUC VU (position)
 *     de hien thi dung danh xung. Day la thiet ke chuan: Role = quyen, Position = chuc danh.
 *   - Gan theo tai khoan (username) + doi chieu ho ten de tranh gan nham.
 *   - Dua cac chuc vu trung lap trong danh muc (CHIEF, DEPT_LEADER) ve INACTIVE
 *     neu khong con phan cong nao su dung (khong xoa cung).
 *
 * An toan:
 *   - Mac dinh DRY-RUN; chi ghi khi co --confirm=ASSIGN-POSITIONS-2026-10-22.
 *   - Idempotent: chay lai khong doi gi neu da dung.
 *   - Khong dung mat khau / khong dung tai khoan khac.
 *
 * Dung:
 *   node scripts/assign-leadership-positions.mjs --db=<url> [--confirm=ASSIGN-POSITIONS-2026-10-22]
 */
import { createRequire } from "node:module";
import path from "node:path";

const REPO = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  ".."
);
const creq = createRequire(path.join(REPO, "package.json"));
const { PrismaClient } = creq("@prisma/client");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf("=");
    return i < 0 ? [a.replace(/^--/, ""), true] : [a.slice(2, i), a.slice(i + 1)];
  })
);
const DB_URL = args.db || process.env.DATABASE_URL;
const CONFIRM_TOKEN = "ASSIGN-POSITIONS-2026-10-22";
const CONFIRM = String(args.confirm || "");
const APPLY = CONFIRM === CONFIRM_TOKEN;
if (!DB_URL) {
  console.error("Thieu --db=<DATABASE_URL>");
  process.exit(2);
}

/* ---------- Chuc vu chuan (ma da co trong DB sau reset) ---------- */
const POS_CHIEF = "CHI_CUC_TRUONG"; // Truong hai quan cua khau
const POS_DEPUTY = "DEPUTY_CHIEF"; // Pho Truong hai quan cua khau

/* ---------- Phan cong chuc vu (theo tai khoan) ---------- */
const ASSIGNMENTS = [
  { username: "hqtl001", fullName: "Hoàng Văn Bằng", positionCode: POS_CHIEF },
  { username: "hqtl002", fullName: "Trần Nguyên Đán", positionCode: POS_DEPUTY },
  { username: "hqtl003", fullName: "Nông Xuân Ánh", positionCode: POS_DEPUTY },
];

/* ---------- Chuc vu trung lap can ngung dung (khong xoa cung) ---------- */
const DUPLICATE_POSITION_CODES = ["CHIEF", "DEPT_LEADER"];

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

(async () => {
  console.log(`\n=== GAN CHUC VU LANH DAO (${APPLY ? "THUC THI" : "DRY-RUN"}) ===`);
  const stamp = new Date().toISOString();

  const positions = await prisma.position.findMany();
  const posByCode = new Map(positions.map((p) => [p.code, p]));
  for (const code of [POS_CHIEF, POS_DEPUTY]) {
    if (!posByCode.has(code)) throw new Error(`Khong tim thay chuc vu ${code} trong DB`);
  }

  const accounts = await prisma.account.findMany({
    where: { username: { in: ASSIGNMENTS.map((a) => a.username) } },
    include: {
      person: {
        include: {
          assignments: { include: { unit: true, position: true } },
        },
      },
    },
  });
  const accByUsername = new Map(accounts.map((a) => [a.username, a]));

  const plan = [];
  for (const item of ASSIGNMENTS) {
    const acc = accByUsername.get(item.username);
    if (!acc) throw new Error(`Khong tim thay tai khoan ${item.username}`);
    if (acc.person.fullName !== item.fullName) {
      throw new Error(
        `Lech ho ten ${item.username}: DB="${acc.person.fullName}" / ke hoach="${item.fullName}" — dung lai`
      );
    }
    const primary = acc.person.assignments.find((a) => a.isPrimary) || acc.person.assignments[0];
    if (!primary) throw new Error(`${item.username} chua co phan cong don vi`);
    const target = posByCode.get(item.positionCode);
    plan.push({
      username: item.username,
      fullName: acc.person.fullName,
      unitName: primary.unit.name,
      assignmentId: primary.id,
      oldPositionCode: primary.position?.code || null,
      newPositionCode: item.positionCode,
      newPositionTitle: target.title,
      changed: primary.positionId !== target.id,
    });
  }

  console.log("\n--- Chuc vu se gan ---");
  for (const p of plan) {
    console.log(
      `  ${p.username} | ${p.fullName} | ${p.unitName} | ${p.oldPositionCode || "(trong)"} -> ${p.newPositionCode} (${p.newPositionTitle})${p.changed ? "" : " [da dung]"}`
    );
  }

  // Chuc vu trung lap: chi ngung dung neu khong con phan cong nao
  const dupPlan = [];
  for (const code of DUPLICATE_POSITION_CODES) {
    const pos = posByCode.get(code);
    if (!pos) continue;
    const used = await prisma.personAssignment.count({ where: { positionId: pos.id } });
    dupPlan.push({ code, id: pos.id, title: pos.title, status: pos.status, used });
  }
  console.log("\n--- Chuc vu trung lap trong danh muc ---");
  for (const d of dupPlan) {
    console.log(
      `  ${d.code} | ${d.title} | trang thai=${d.status} | dang dung=${d.used}${d.used === 0 && d.status !== "INACTIVE" ? " -> se chuyen INACTIVE" : ""}`
    );
  }

  if (!APPLY) {
    console.log("\n>>> DRY-RUN: chua ghi gi. Them --confirm=" + CONFIRM_TOKEN + " de thuc thi.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const p of plan) {
    if (!p.changed) continue;
    const pos = posByCode.get(p.newPositionCode);
    await prisma.personAssignment.update({
      where: { id: p.assignmentId },
      data: { positionId: pos.id },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: null,
        action: "POSITION_ASSIGN",
        resourceType: "PersonAssignment",
        resourceId: p.assignmentId,
        oldData: { positionCode: p.oldPositionCode },
        newData: {
          positionCode: p.newPositionCode,
          positionTitle: p.newPositionTitle,
          person: p.fullName,
          username: p.username,
          unit: p.unitName,
          source: "assign-leadership-positions.mjs",
          at: stamp,
        },
      },
    });
    updated++;
  }

  let deactivated = 0;
  for (const d of dupPlan) {
    if (d.used !== 0 || d.status === "INACTIVE") continue;
    await prisma.position.update({ where: { id: d.id }, data: { status: "INACTIVE" } });
    await prisma.auditEvent.create({
      data: {
        actorId: null,
        action: "POSITION_DEACTIVATE_DUPLICATE",
        resourceType: "Position",
        resourceId: d.id,
        oldData: { code: d.code, title: d.title, status: d.status },
        newData: { code: d.code, title: d.title, status: "INACTIVE", reason: "duplicate catalog entry", source: "assign-leadership-positions.mjs", at: stamp },
      },
    });
    deactivated++;
  }

  console.log(`\n>>> DA GHI: cap nhat ${updated} phan cong, ngung ${deactivated} chuc vu trung lap.`);

  // Kiem chung lai
  const check = await prisma.account.findMany({
    where: { username: { in: ASSIGNMENTS.map((a) => a.username) } },
    include: { person: { include: { assignments: { include: { unit: true, position: true } } } } },
    orderBy: { username: "asc" },
  });
  console.log("\n--- KIEM CHUNG ---");
  for (const a of check) {
    const primary = a.person.assignments.find((x) => x.isPrimary) || a.person.assignments[0];
    console.log(`  ${a.username} | ${a.person.fullName} | ${primary?.unit?.name || "?"} | ${primary?.position?.title || "(trong)"}`);
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
