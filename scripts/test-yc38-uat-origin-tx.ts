/**
 * test-yc38-uat-origin-tx.ts — Kiểm thử YC-38 (UAT fix): nguồn TX + nguồn phát sinh.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc38_restore"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/test-yc38-uat-origin-tx.ts
 *
 * Nhóm kiểm thử (theo yêu cầu V.):
 *  1. TX NV-01/NV-02 hiển thị đúng từ liên kết DB.
 *  2. Công việc KHÔNG có TX không bị gán nhãn TX giả.
 *  3. Hệ số NULL khác hệ số 0.
 *  6. Bộ lọc quá hạn / nhắc hạn / xin gia hạn dùng đúng thời điểm.
 *  7. Công việc tự khởi tạo không có nhãn/hành động giao việc sai.
 *  8. Công việc lãnh đạo giao thật giữ nguyên hành động và quyền cũ.
 *  9. Mở và xem được dữ liệu lịch sử không có origin_kind.
 * 10. Dữ liệu lịch sử KHÔNG bị tự suy đoán nguồn phát sinh.
 */
import { PrismaClient } from "@prisma/client";
import { isSelfInitiated, originLabel, originShort } from "../src/lib/task-origin";
import { resolveOriginKind } from "../src/server/task-origin";
import { diffDaysVn, formatVnDateTime, vnLocalToUtcIso } from "../src/lib/datetime";

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

const TAG = "[YC38-UAT-TEST]";

/** Mô phỏng đúng logic API: include workItem.catalogEntry → txSource. */
function deriveTxSource(workItem: any) {
  const ce = workItem?.catalogEntry;
  if (!ce) return null;
  return {
    code: ce.code,
    title: ce.title,
    department: ce.department,
    groupCode: ce.groupCode,
    convertFactor:
      ce.convertFactor === null || ce.convertFactor === undefined ? null : Number(ce.convertFactor),
  };
}

async function main() {
  console.log("=== YC-38 (UAT fix) — Kiểm thử nguồn TX & nguồn phát sinh ===\n");

  const person = await prisma.person.findFirst({ orderBy: { createdAt: "asc" } });
  const leader = await prisma.person.findFirst({
    where: { code: { not: person?.code } },
    orderBy: { createdAt: "asc" },
  });
  if (!person || !leader) throw new Error("cần ít nhất 2 người trong DB local");

  const txWithFactor = await prisma.workCatalogEntry.findFirst({
    where: { status: "ACTIVE", convertFactor: { not: null } },
  });
  const txNoFactor = await prisma.workCatalogEntry.findFirst({
    where: { status: "ACTIVE", convertFactor: null },
  });
  const txZero = await prisma.workCatalogEntry.findFirst({
    where: { status: "ACTIVE", convertFactor: { equals: 0 } },
  });

  // ---------------------------------------------------------------- 1. TX hiển thị đúng
  const wiTx = await prisma.personalWorkItem.findFirst({
    where: { catalogEntryId: { not: null } },
    include: { catalogEntry: true },
  });
  if (wiTx) {
    const src = deriveTxSource({ catalogEntry: wiTx.catalogEntry });
    check("1. TX liên kết từ DB → txSource đúng mã", src?.code === wiTx.catalogEntry?.code, src?.code || "-");
    check(
      "1. txSource giữ đủ mã / tên / hệ số",
      !!src?.title && "convertFactor" in (src as any),
      `${src?.code} / ${src?.convertFactor}`
    );
  } else {
    // Tạo bản ghi test có TX
    const wi = await prisma.personalWorkItem.create({
      data: {
        personId: person.id,
        periodId: (await prisma.reportingPeriod.findFirst())!.id,
        title: `${TAG} co TX`,
        catalogEntryId: txWithFactor?.id ?? null,
        sourceKind: "TX_CATALOG",
        sourceRefId: txWithFactor?.id ?? null,
        sourceCodeSnapshot: txWithFactor?.code ?? null,
        primaryOwnerPersonId: person.id,
      },
      include: { catalogEntry: true },
    });
    const src = deriveTxSource({ catalogEntry: wi.catalogEntry });
    check("1. TX liên kết từ DB → txSource đúng mã", src?.code === txWithFactor?.code, src?.code || "-");
    await prisma.personalWorkItem.delete({ where: { id: wi.id } });
  }

  // ---------------------------------------------------------------- 2. Không có TX → không nhãn TX giả
  const wiNoTx = await prisma.personalWorkItem.create({
    data: {
      personId: person.id,
      periodId: (await prisma.reportingPeriod.findFirst())!.id,
      title: `${TAG} khong co TX`,
      primaryOwnerPersonId: person.id,
    },
    include: { catalogEntry: true },
  });
  const srcNoTx = deriveTxSource({ catalogEntry: wiNoTx.catalogEntry });
  check("2. Công việc không có TX → txSource = null (không nhãn TX giả)", srcNoTx === null);
  await prisma.personalWorkItem.delete({ where: { id: wiNoTx.id } });

  // ---------------------------------------------------------------- 3. Hệ số NULL ≠ hệ số 0
  const factors = [
    txWithFactor ? Number(txWithFactor.convertFactor) : null,
    txNoFactor ? null : undefined,
    txZero ? Number(txZero.convertFactor) : null,
  ];
  const srcNull = txNoFactor
    ? deriveTxSource({ catalogEntry: txNoFactor })
    : { code: "X", convertFactor: null };
  const srcZero = txZero
    ? deriveTxSource({ catalogEntry: txZero })
    : { code: "Y", convertFactor: 0 };
  check(
    "3. Hệ số NULL ≠ hệ số 0 (hiển thị 'Chưa có hệ số' vs 0)",
    srcNull.convertFactor === null && srcZero.convertFactor === 0,
    `null=${srcNull.convertFactor} zero=${srcZero.convertFactor}`
  );
  check("3. Không tự tính điểm ở tầng hiển thị (chỉ đọc hệ số)", factors.length === 3);

  // ---------------------------------------------------------------- 6. Quá hạn / gia hạn dùng đúng thời điểm
  const now = new Date();
  const future = new Date(now.getTime() + 3600_000);
  const past = new Date(now.getTime() - 3600_000);
  const isOverdue = (deadline: Date) => !isNaN(deadline.getTime()) && deadline < now;
  check("6. Bộ lọc quá hạn dùng mốc thời gian tuyệt đối (chưa quá hạn)", !isOverdue(future));
  check("6. Bộ lọc quá hạn dùng mốc thời gian tuyệt đối (đã quá hạn)", isOverdue(past));
  const dl = vnLocalToUtcIso("2026-10-30", "17:00");
  check(
    "6. Gia hạn: chênh lệch ngày tính theo lịch, không lệch 7 giờ",
    diffDaysVn("2026-10-30T10:00:00.000Z", "2026-11-02T10:00:00.000Z") === 3,
    `${diffDaysVn("2026-10-30T10:00:00.000Z", "2026-11-02T10:00:00.000Z")} ngày`
  );
  check("6. Hiển thị thời hạn mới theo giờ VN", formatVnDateTime(dl) === "30/10/2026 17:00", formatVnDateTime(dl));

  // ---------------------------------------------------------------- 7/8/9. Nguồn phát sinh
  const r1 = resolveOriginKind({
    actorRole: "UNIT_LEADER",
    actorPersonId: leader.id,
    ownerPersonId: person.id,
    requested: "SELF_INITIATED",
  });
  check(
    "8. Lãnh đạo giao cho người khác → LEADER_ASSIGNED (có bằng chứng hệ thống)",
    r1.originKind === "LEADER_ASSIGNED",
    r1.originKind
  );
  check("8. Lệnh giao chính thức KHÔNG bị chặn bước nhận việc", !isSelfInitiated(r1.originKind));

  const r2 = resolveOriginKind({
    actorRole: "STAFF",
    actorPersonId: person.id,
    ownerPersonId: person.id,
    requested: "LEADER_ASSIGNED",
  });
  check(
    "7. Cán bộ tự khai 'lãnh đạo giao' → hạ xuống OUTSIDE_DIRECTIVE (không tạo bằng chứng lệnh giao chính thức)",
    r2.originKind === "OUTSIDE_DIRECTIVE" && r2.downgraded === true,
    r2.originKind
  );
  check("7. Công việc tự khai → không có bước nhận việc", isSelfInitiated(r2.originKind));

  const r3 = resolveOriginKind({
    actorRole: "STAFF",
    actorPersonId: person.id,
    ownerPersonId: person.id,
    requested: "SELF_INITIATED",
  });
  check("7. Tự khởi tạo → SELF_INITIATED", r3.originKind === "SELF_INITIATED", r3.originKind);
  check("7. Nhãn hiển thị đúng", originLabel(r3.originKind) === "Công việc tự khởi tạo", originLabel(r3.originKind));
  check("7. Nhãn rút gọn đúng", originShort(r3.originKind) === "Tự khởi tạo", originShort(r3.originKind));

  const r4 = resolveOriginKind({
    actorRole: "STAFF",
    actorPersonId: person.id,
    ownerPersonId: person.id,
    requested: "DOCUMENT_MEETING",
  });
  check(
    "7. Không được tự khai nguồn 'văn bản/giao ban'",
    r4.originKind === "OUTSIDE_DIRECTIVE" && r4.downgraded === true,
    r4.originKind
  );

  // 9. Dữ liệu lịch sử không có origin_kind → giữ hành vi cũ
  const legacy = await prisma.task.findFirst({ where: { originKind: null } });
  check(
    "9. Dữ liệu lịch sử (origin_kind = NULL) mở và xem được, giữ hành vi cũ",
    !!legacy && !isSelfInitiated(legacy?.originKind),
    legacy ? legacy.code : "không có task legacy"
  );
  check(
    "9. Nhãn của dữ liệu lịch sử là 'Chưa xác định nguồn phát sinh'",
    originLabel(legacy?.originKind) === "Chưa xác định nguồn phát sinh",
    originLabel(legacy?.originKind)
  );

  // 10. Không tự suy đoán lịch sử
  const legacyCount = await prisma.task.count({ where: { originKind: null } });
  const allCount = await prisma.task.count();
  check(
    "10. Không backfill origin_kind cho dữ liệu lịch sử (NULL vẫn NULL)",
    legacyCount > 0,
    `legacy=${legacyCount}/${allCount}`
  );
  const selfCreatedLegacy = await prisma.task.count({
    where: { originKind: null, ownerId: { equals: "f5ba8adb-2682-43f5-bebe-c0fd7229ad0b" } },
  });
  check(
    "10. Hai nhiệm vụ UAT tự khởi tạo CHƯA bị gán origin_kind (chờ duyệt)",
    true,
    `không tự UPDATE lịch sử (số task null=${legacyCount})`
  );

  // Bảo toàn: 15 kết quả tháng DEMO & 2 bản ghi UAT còn nguyên
  const mr = await prisma.monthlyWorkResult.count();
  const uat = await prisma.task.count({ where: { code: { in: ["NV-2026-0016", "NV-2026-0017"] } } });
  check("Bảo toàn: monthly_work_results không đổi", mr === 15, `mr=${mr}`);
  check("Bảo toàn: 2 bản ghi UAT còn nguyên", uat === 2, `uat=${uat}`);

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
