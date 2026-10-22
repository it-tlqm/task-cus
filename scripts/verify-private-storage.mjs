/**
 * verify-private-storage.mjs — KIỂM CHỨNG kho tệp PRIVATE sau khi chủ dự án
 * cấu hình Supabase/Vercel. Chạy lại ngay sau khi flip bucket + đặt biến môi trường.
 *
 * node scripts/verify-private-storage.mjs
 *
 * Kết quả PASS khi: URL công khai bị từ chối · không liệt kê được tệp ·
 * route nội bộ trả 200 cho người có quyền, 403 cho người không có quyền, 401 khi chưa đăng nhập.
 */
import { createRequire } from "node:module";
const creq = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = creq("@prisma/client");
const jwt = creq("jsonwebtoken");

const BASE = process.env.APP_BASE_URL || "https://task-cus.vercel.app";
const SUPA = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ekswvjbpqblssxcdwagi.supabase.co").replace(/\/$/, "");
const PK = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "task-attachments";
const SRK = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();

let pass = 0, fail = 0;
const chk = (n, c, d = "") => { if (c) { pass++; console.log(`  [PASS] ${n}${d ? " - " + d : ""}`); } else { fail++; console.log(`  [FAIL] ${n}${d ? " - " + d : ""}`); } };

(async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
  console.log(`=== KIEM CHUNG KHO TEP PRIVATE ===\nURL app: ${BASE}\nbucket: ${BUCKET}\n`);

  // 1) Bucket tren server phai PRIVATE
  if (SRK) {
    const r = await fetch(`${SUPA}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`, {
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
    });
    const j = await r.json().catch(() => ({}));
    chk("1. Bucket tren server = PRIVATE", r.ok && j.public === false, `public=${j.public}`);
  } else {
    console.log("  (bo qua kiem tra bucket tren server: thieu khoa service-role o may chay lenh)");
  }

  // 2) Lay 1 tep ton tai de kiem tra duong cong khai
  const att = await prisma.taskAttachment.findFirst();
  if (!att) {
    console.log("  KHONG CO tep de kiem tra (da reset?) — bo qua cac buoc doc tep.");
  } else {
    const pub = `${SUPA}/storage/v1/object/public/${BUCKET}/${att.storageKey}`;
    const rPub = await fetch(pub);
    chk("2. Doc URL CONG KHAI khong khoa => BI TU CHOI", !rPub.ok, `HTTP ${rPub.status}`);

    const rList = await fetch(`${SUPA}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { apikey: PK, Authorization: `Bearer ${PK}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 100 }),
    });
    chk("3. Liet ke object bang publishable key => BI TU CHOI", !rList.ok, `HTTP ${rList.status}`);

    // 4) Route noi bo van hoat dong
    const mk = async (u) => {
      const acc = await prisma.account.findFirst({ where: { username: u }, include: { person: { include: { assignments: { where: { isPrimary: true }, include: { unit: true, position: true } } } } } });
      const g = await prisma.roleGrant.findFirst({ where: { accountId: acc.id }, include: { role: true } });
      const a = acc.person.assignments[0];
      return jwt.sign({ id: acc.id, personId: acc.personId, username: acc.username, fullName: acc.person.fullName, personCode: acc.person.code, positionTitle: (a && a.position && a.position.title) || "Lanh dao", unitId: a ? a.unitId : null, unitName: a && a.unit ? a.unit.name : null, role: (g && g.role.code) || "STAFF", scopeType: (g && g.scopeType) || "DEPARTMENT", scopeUnitId: g ? g.scopeUnitId : null, permissions: ["plans.view", "reports.view"] }, process.env.JWT_SECRET, { expiresIn: "1h" });
    };
    const url = `${BASE}/api/tasks/${att.taskId}/attachments/${att.id}/file`;
    const leaders = await prisma.account.findMany({ where: { roleGrants: { some: { role: { code: "UNIT_LEADER" } } } } });
    const staff = await prisma.account.findFirst({ where: { username: "democb01" } });
    if (leaders.length && staff) {
      const tl = await mk(leaders[0].username);
      const ts = await mk(staff.username);
      const rOk = await fetch(url, { headers: { Authorization: "Bearer " + tl } });
      chk("4. Route noi bo: nguoi co quyen tai duoc (200)", rOk.status === 200, `HTTP ${rOk.status}`);
      const rNo = await fetch(url, { headers: { Authorization: "Bearer " + ts } });
      chk("5. Route noi bo: nguoi khong co quyen bi chan (403)", rNo.status === 403, `HTTP ${rNo.status}`);
      const rAnon = await fetch(url);
      chk("6. Route noi bo: chua dang nhap bi chan (401)", rAnon.status === 401, `HTTP ${rAnon.status}`);
    }
  }

  // 7) Che do private tren may chu
  const envRes = await fetch(`${BASE}/api/admin/system/env-status`);
  if (envRes.ok) {
    const j = await envRes.json().catch(() => ({}));
    const d = j.data || {};
    console.log("\n=== TRANG THAI CAU HINH MAY CHU (chi boolean) ===");
    for (const [k, v] of Object.entries(d.checks || {})) console.log(`  [${v ? "OK " : "NO "}] ${k}`);
  } else {
    console.log("\n  (khong xac thuc duoc env-status: can dang nhap co quyen system.config)");
  }

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("LOI:", String(e.message).slice(0, 250)); process.exit(1); });
