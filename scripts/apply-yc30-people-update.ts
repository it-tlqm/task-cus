/**
 * apply-yc30-people-update.ts — Cập nhật danh sách nhân sự theo file `danh.xlsx` (Hải quan 20/10/2026).
 *
 * NGUYÊN TẮC (theo yêu cầu V — "Cập nhật danh sách và bộ phận của những nhân sự đã xác minh chắc chắn"):
 *  1. KHỚP CHẮC CHẮN: tên khớp duy nhất (không dấu, không phân biệt hoa/thường) với 1 người trong DB
 *     → cập nhật email + số điện thoại từ file nguồn.
 *  2. TÊN NGẮN MƠ HỒ (nhiều ứng viên) → KHÔNG gán, in ra danh sách chờ xác nhận.
 *  3. KHÔNG tự tạo tài khoản đăng nhập / mật khẩu / mở rộng quyền.
 *  4. KHÔNG tự tạo hoặc sửa org_units — cấu trúc bộ phận mới cần Hải quan xác nhận (xem báo cáo).
 *  5. Người chưa có trong DB → tạo HỒ SƠ cán bộ (Person) KHÔNG có tài khoản, KHÔNG gán bộ phận;
 *     quản trị viên gán bộ phận/vai trò sau trên màn hình Tổ chức & Nhân sự.
 *  6. Idempotent: chạy lại không tạo trùng, không ghi đè dữ liệu đúng sẵn có.
 *  7. Mọi thay đổi đều ghi AuditEvent.
 *
 * Chạy (XEM TRƯỚC, không ghi):
 *   npx tsx scripts/apply-yc30-people-update.ts
 * Chạy (ghi vào DB):
 *   npx tsx scripts/apply-yc30-people-update.ts --apply
 *
 * CHỈ chạy trên DB đã được sao lưu. Không chạy `prisma migrate deploy`.
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

function norm(s: unknown): string {
  return String(s ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function key(s: string): string {
  return norm(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}
/** Khớp theo CỤM TỪ (không phải chuỗi con) — tránh "Phương" khớp "Hương". */
function hasWord(fullName: string, word: string): boolean {
  const tokens = key(fullName).split(/[\s.]+/);
  const want = key(word).split(/[\s.]+/);
  if (want.length === 1) return tokens.includes(want[0]);
  for (let i = 0; i + want.length <= tokens.length; i++) {
    if (want.every((w, j) => tokens[i + j] === w)) return true;
  }
  return false;
}

/** Nhóm được thông báo phân công → tên ngắn. */
const ASSIGNED_GROUPS: Array<{ group: string; short: string }> = [
  { group: "Bộ phận Tổng hợp", short: "Hoàng" },
  { group: "Bộ phận Tổng hợp", short: "Hương" },
  { group: "Bộ phận Tổng hợp", short: "Tuấn Anh" },
  { group: "Bộ phận Tổng hợp", short: "Nhật Anh" },
  { group: "Bộ phận CBL", short: "Huynh" },
  { group: "Bộ phận CBL", short: "Minh" },
  { group: "Bộ phận CBL", short: "Thiện" },
  { group: "Bộ phận CBL", short: "Nam" },
  { group: "Bộ phận CBL", short: "Tuấn" },
];

async function loadRoster() {
  const repo = process.cwd();
  const dir = fs.readdirSync(path.join(repo, "docs")).find((d) => d.includes("file-hai-quan-gui"));
  if (!dir) throw new Error("khong tim thay thu muc file Hải quan gửi trong docs/");
  const src = path.join(repo, "docs", dir, "danh.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(src);
  const ws = wb.worksheets[0];
  const rows: Array<{ stt: string; name: string; title: string; phone: string; email: string }> = [];
  ws.eachRow((row, n) => {
    if (n < 3) return;
    const v = (c: number) => norm((row.getCell(c).value as any)?.text ?? (row.getCell(c).value as any));
    const name = v(2);
    if (!name) return;
    rows.push({ stt: v(1), name, title: v(3), phone: v(4), email: v(5) });
  });
  return { src, rows };
}

async function main() {
  const { src, rows } = await loadRoster();
  console.log(`Nguon: ${src}`);
  console.log(`Che do: ${APPLY ? "GHI vao DB" : "XEM TRUOC (khong ghi)"}\n`);

  const people = await prisma.person.findMany({
    include: {
      assignments: { include: { unit: true, position: true } },
      account: { select: { username: true } },
    },
  });
  const byKey = new Map<string, typeof people>();
  for (const p of people) {
    const k = key(p.fullName);
    if (!byKey.has(k)) byKey.set(k, []);
    (byKey.get(k) as any).push(p);
  }

  const plan: {
    update: Array<{ row: any; person: any; email: string | null; phone: string | null }>;
    create: Array<{ row: any; group: string | null }>;
    pending: Array<{ name: string; group: string; candidates: string[] }>;
  } = { update: [], create: [], pending: [] };

  // 1) Khớp chắc chắn theo tên đầy đủ
  for (const r of rows) {
    const hits = (byKey.get(key(r.name)) || []) as any[];
    if (hits.length !== 1) continue;
    const person = hits[0];
    const email = r.email ? r.email.trim().toLowerCase() : null;
    const phone = r.phone ? r.phone.trim() : null;
    const emailChanged = !!email && person.email !== email;
    const phoneChanged = !!phone && person.phone !== phone;
    if (emailChanged || phoneChanged) {
      plan.update.push({ row: r, person, email: emailChanged ? email : null, phone: phoneChanged ? phone : null });
    }
  }

  // 2) Người chưa có trong DB → tạo hồ sơ (không tài khoản, chưa gán bộ phận)
  const groupOf = (name: string): string | null => {
    const hits = ASSIGNED_GROUPS.filter((g) => hasWord(name, g.short));
    const groups = [...new Set(hits.map((h) => h.group))];
    if (groups.length === 1) return groups[0];
    return null;
  };
  for (const r of rows) {
    const hits = (byKey.get(key(r.name)) || []) as any[];
    if (hits.length > 0) continue;
    plan.create.push({ row: r, group: groupOf(r.name) });
  }

  // 3) Tên ngắn mơ hồ → chờ xác nhận
  for (const g of ASSIGNED_GROUPS) {
    const cands = rows.filter((r) => hasWord(r.name, g.short));
    if (cands.length === 1) continue;
    if (cands.length === 0) {
      plan.pending.push({ name: g.short, group: g.group, candidates: [] });
      continue;
    }
    const names = cands.map((c) => c.name);
    // Loại trừ ứng viên đã khớp chắc chắn ở nhóm khác (đã được phân công nơi khác)
    const others = ASSIGNED_GROUPS.filter((x) => x.group !== g.group && x.short !== g.short).map(
      (x) => x.short
    );
    const stillAmbiguous = cands.filter(
      (c) => !others.some((o) => hasWord(c.name, o))
    );
    if (stillAmbiguous.length > 1) {
      plan.pending.push({ name: g.short, group: g.group, candidates: stillAmbiguous.map((c) => c.name) });
    }
  }

  console.log("=== KẾ HOẠCH CẬP NHẬT HỒ SƠ (email / điện thoại) ===");
  for (const u of plan.update) {
    console.log(
      `  ${u.row.name.padEnd(24)} | ${u.person.code.padEnd(13)} | email: ${u.email || "(giữ nguyên)"} | điện thoại: ${u.phone || "(giữ nguyên)"}`
    );
  }
  console.log(`  Tổng: ${plan.update.length}\n`);

  console.log("=== KẾ HOẠCH TẠO HỒ SƠ MỚI (KHÔNG tài khoản, CHƯA gán bộ phận) ===");
  for (const c of plan.create) {
    console.log(
      `  ${c.row.name.padEnd(24)} | nhóm theo thông báo: ${c.group || "CHƯA XÁC ĐỊNH (chờ Hải quan)"} | ${c.row.title}`
    );
  }
  console.log(`  Tổng: ${plan.create.length}\n`);

  console.log("=== DANH SÁCH CHỜ HẢI QUAN XÁC NHẬN (tên ngắn nhiều ứng viên) ===");
  for (const p of plan.pending) {
    console.log(`  [${p.group}] "${p.name}" → ${p.candidates.join(" | ") || "không tìm thấy trong danh.xlsx"}`);
  }

  if (!APPLY) {
    console.log("\nXEM TRƯỚC XONG — chạy lại với --apply để ghi vào DB.");
    await prisma.$disconnect();
    return;
  }

  if (plan.update.length === 0 && plan.create.length === 0) {
    console.log("\nKhông có thay đổi nào cần ghi.");
    await prisma.$disconnect();
    return;
  }

  const actor = await prisma.account.findFirst({
    where: { person: { assignments: { some: { unit: { code: "BAN_LANH_DAO" } } } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, person: { select: { id: true, code: true } } },
  });
  if (!actor) {
    console.error("Khong tim thay tai khoan quan tri de ghi audit — huy thay doi.");
    process.exit(2);
  }

  let updated = 0;
  for (const u of plan.update) {
    const before = { email: u.person.email, phone: u.person.phone };
    const after = { email: u.email || u.person.email, phone: u.phone || u.person.phone };
    await prisma.$transaction([
      prisma.person.update({
        where: { id: u.person.id },
        data: { email: after.email, phone: after.phone },
      }),
      prisma.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "PEOPLE_PROFILE_UPDATE",
          resourceType: "Person",
          resourceId: u.person.id,
          oldData: before,
          newData: { ...after, source: "danh.xlsx (20/10/2026)" },
        },
      }),
    ]);
    updated++;
  }

  let created = 0;
  for (const c of plan.create) {
    // Mã cán bộ: CB-xxx với số thứ tự lớn hơn mã đang có, không trùng.
    const existingCodes = await prisma.person.findMany({ select: { code: true } });
    let n = 100;
    const used = new Set(existingCodes.map((p) => p.code));
    while (used.has(`CB-${n}`)) n++;
    const code = `CB-${n}`;
    const person = await prisma.person.create({
      data: {
        code,
        fullName: c.row.name,
        email: c.row.email ? c.row.email.trim().toLowerCase() : null,
        phone: c.row.phone ? c.row.phone.trim() : null,
        status: "ACTIVE",
        notes: `Tạo từ danh.xlsx (20/10/2026). Nhóm theo thông báo: ${
          c.group || "chờ Hải quan xác nhận"
        }. Chưa gán bộ phận / chức vụ — quản trị viên hoàn thiện tại màn hình Tổ chức & Nhân sự.`,
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "PEOPLE_PROFILE_CREATE",
        resourceType: "Person",
        resourceId: person.id,
        newData: {
          code: person.code,
          fullName: person.fullName,
          group: c.group,
          source: "danh.xlsx (20/10/2026)",
          note: "Không tạo tài khoản đăng nhập",
        },
      },
    });
    created++;
  }

  console.log(`\nDA GHI: ${updated} hồ sơ cập nhật, ${created} hồ sơ mới (không tạo tài khoản).`);
  await prisma.$disconnect();
}

main()
  .catch(async (e) => {
    console.error("LỖI:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
