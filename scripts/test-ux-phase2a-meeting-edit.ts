/**
 * test-ux-phase2a-meeting-edit.ts — Kiểm thử API sửa biên bản (Phase 2A / Task 2A1).
 *
 * Chạy trên database kiểm thử CỤC BỘ (chặn bởi test-db-safety):
 *   npx tsx scripts/test-ux-phase2a-meeting-edit.ts
 *
 * Phạm vi:
 *  1. Quyền XEM: người tạo, người chủ trì/phối hợp, hoặc thành viên cùng phạm vi đơn vị;
 *     người ngoài đơn vị bị 403 (chống IDOR).
 *  2. Quyền SỬA: chỉ người tạo hoặc lãnh đạo trong phạm vi đơn vị; STAFF cùng đơn vị
 *     xem được nhưng sửa bị 403.
 *  3. update_meeting validate tiêu đề/thời gian/chủ trì/ghi chú và ghi audit old/new.
 *  4. Kết luận chưa có task sửa được; kết luận đã có taskId trả 400.
 *  5. Thêm kết luận, chuyển/xóa giữ nguyên hành vi lãnh đạo.
 *  6. UNIT_LEADER phạm vi DEPARTMENT/SUBTREE không sửa chéo đơn vị khác.
 *  7. Biên bản cũ không có unitId: lãnh đạo ORGANIZATION xem/sửa được; STAFF vẫn 403.
 *
 * Script tự tạo fixture (1 biên bản + 2 kết luận) và dọn sạch trong finally.
 */
import fs from "fs";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const dbUrl = assertLocalTestDatabase(process.env.DATABASE_URL, "test-ux-phase2a-meeting-edit");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(name + (detail ? " - " + detail : ""));
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { pickPrimaryGrant, signToken } = await import("../src/server/auth");
  const { GET, POST, PATCH } = await import("../src/app/api/meetings/[id]/route");

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const now = new Date();
  let meetingId = "";
  let nullUnitMeetingId = "";
  let tempGrantId = "";

  try {
    const accounts = await prisma.account.findMany({
      where: { status: "ACTIVE", person: { status: "ACTIVE" } },
      include: {
        person: {
          include: {
            assignments: {
              where: {
                isPrimary: true,
                effectiveFrom: { lte: now },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
              },
            },
          },
        },
        roleGrants: {
          where: {
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gte: now } }],
          },
          include: { role: true },
        },
      },
    });

    const mapped = accounts.map((a) => {
      const grant = pickPrimaryGrant(a.roleGrants);
      return {
        ...a,
        roleCode: grant?.role.code || "STAFF",
        scopeType: grant?.scopeType || "DEPARTMENT",
        scopeUnitId: grant?.scopeUnitId || null,
        unitId: a.person?.assignments?.[0]?.unitId || null,
      };
    });

    const unitA = await prisma.orgUnit.findFirst({ where: { level: 2 }, orderBy: { createdAt: "asc" } });
    if (!unitA) throw new Error("Fixture thiếu đơn vị cấp 2");

    const deptLeaders = mapped.filter((a) => a.roleCode === "DEPARTMENT_LEADER" && a.scopeUnitId);
    const inScopeLeader = deptLeaders.find((a) => a.scopeUnitId === unitA.id) || deptLeaders[0];
    const scopedUnitId = inScopeLeader?.scopeUnitId || unitA.id;
    const outsiderLeader = deptLeaders.find((a) => a.scopeUnitId !== scopedUnitId);
    const orgLeader = mapped.find(
      (a) => a.roleCode === "UNIT_LEADER" && a.scopeType === "ORGANIZATION" && a.person
    );

    const staffAccounts = mapped.filter((a) => a.roleCode === "STAFF" && a.person);
    const creator = staffAccounts.find((a) => a.unitId !== scopedUnitId) || staffAccounts[0];
    const sameUnitStaff = staffAccounts.find(
      (a) => a.unitId === scopedUnitId && a.person!.id !== creator?.person?.id
    );
    const outsiderStaff = staffAccounts.find(
      (a) => a.unitId !== scopedUnitId && a.person!.id !== creator?.person?.id
    );
    const assigneeStaff = staffAccounts.find(
      (a) =>
        a.unitId !== scopedUnitId &&
        ![creator, sameUnitStaff, outsiderStaff].some((x) => x?.person?.id === a.person!.id)
    );

    if (
      !inScopeLeader ||
      !outsiderLeader ||
      !orgLeader ||
      !creator ||
      !sameUnitStaff ||
      !outsiderStaff ||
      !assigneeStaff
    ) {
      throw new Error(
        "Fixture thiếu tài khoản phù hợp (cần 1 trưởng bộ phận trong đơn vị, 1 ngoài đơn vị, " +
          "1 UNIT_LEADER phạm vi ORGANIZATION, 1 STAFF cùng đơn vị, 2 STAFF ngoài đơn vị)"
      );
    }

    const token = (a: typeof creator) =>
      signToken({
        id: a.id,
        personId: a.person!.id,
        username: a.username,
        fullName: a.person!.fullName,
        role: a.roleCode,
        scopeType: a.scopeType as any,
        permissions: [],
      });

    const tokenInScope = token(inScopeLeader);
    const tokenOutsider = token(outsiderLeader);
    const tokenOrgLeader = token(orgLeader);
    const tokenCreator = token(creator);
    const tokenSameUnitStaff = token(sameUnitStaff);
    const tokenOutsiderStaff = token(outsiderStaff);
    const tokenAssigneeStaff = token(assigneeStaff);

    meetingId = (
      await prisma.meeting.create({
        data: {
          title: "[TEST-2A1] Giao ban kiểm thử",
          meetingAt: new Date("2026-10-20T00:00:00.000Z"),
          chair: "Chủ trì cũ",
          notes: null,
          unitId: scopedUnitId,
          createdById: creator.person!.id,
        },
      })
    ).id;

    const c1 = await prisma.meetingConclusion.create({
      data: {
        meetingId,
        content: "Kết luận chưa chuyển nhiệm vụ",
        assigneeIds: [assigneeStaff.person!.id],
        priority: "Cao",
        sortOrder: 1,
      },
    });
    const c2 = await prisma.meetingConclusion.create({
      data: {
        meetingId,
        content: "Kết luận đã chuyển nhiệm vụ",
        assigneeIds: [],
        priority: "Cao",
        sortOrder: 2,
        taskId: "00000000-0000-4000-8000-000000000000",
      },
    });

    // Biên bản cũ có thể không gắn unitId — dùng cho kiểm thử quyền xem của lãnh đạo ORGANIZATION.
    nullUnitMeetingId = (
      await prisma.meeting.create({
        data: {
          title: "[TEST-2A1] Giao ban không đơn vị",
          meetingAt: new Date("2026-10-22T00:00:00.000Z"),
          unitId: null,
          createdById: creator.person!.id,
        },
      })
    ).id;

    const request = (tok: string, method: string, payload?: any) =>
      new Request(`http://localhost/api/meetings/${meetingId}`, {
        method,
        headers: {
          authorization: `Bearer ${tok}`,
          ...(payload ? { "content-type": "application/json" } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });

    const params = { params: Promise.resolve({ id: meetingId }) };
    const call = async (fn: any, tok: string, method: string, payload?: any) => {
      const res = await fn(request(tok, method, payload) as any, params as any);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    };

    // Gọi handler cho biên bản khác (biên bản không có unitId).
    const callAt = async (mid: string, fn: any, tok: string, method: string, payload?: any) => {
      const req = new Request(`http://localhost/api/meetings/${mid}`, {
        method,
        headers: {
          authorization: `Bearer ${tok}`,
          ...(payload ? { "content-type": "application/json" } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const res = await fn(req as any, { params: Promise.resolve({ id: mid }) } as any);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    };

    // --- 1. Phân quyền XEM: cùng đơn vị/người phối hợp được xem, ngoài đơn vị bị chặn
    const outsiderGet = await call(GET, tokenOutsider, "GET");
    check("Người ngoài đơn vị GET biên bản bị 403", outsiderGet.status === 403, `status=${outsiderGet.status}`);
    check("403 không lộ tiêu đề biên bản", !JSON.stringify(outsiderGet.json).includes("[TEST-2A1]"));

    const outsiderPatch = await call(PATCH, tokenOutsider, "PATCH", { action: "update_meeting", title: "Chiếm biên bản" });
    check("Người ngoài đơn vị PATCH update_meeting bị 403", outsiderPatch.status === 403, `status=${outsiderPatch.status}`);

    const outsiderPost = await call(POST, tokenOutsider, "POST", { content: "Chen kết luận" });
    check("Người ngoài đơn vị POST kết luận bị 403", outsiderPost.status === 403, `status=${outsiderPost.status}`);

    const outsiderStaffGet = await call(GET, tokenOutsiderStaff, "GET");
    check("STAFF ngoài đơn vị, không liên quan GET bị 403", outsiderStaffGet.status === 403, `status=${outsiderStaffGet.status}`);

    const sameUnitGet = await call(GET, tokenSameUnitStaff, "GET");
    check("STAFF cùng đơn vị (không phải người tạo) GET được", sameUnitGet.status === 200, `status=${sameUnitGet.status}`);
    check("STAFF cùng đơn vị nhận canEdit=false", sameUnitGet.json?.data?.canEdit === false);

    const sameUnitPatch = await call(PATCH, tokenSameUnitStaff, "PATCH", {
      action: "update_meeting",
      title: "STAFF tự sửa biên bản",
    });
    check("STAFF cùng đơn vị không sửa được biên bản", sameUnitPatch.status === 403, `status=${sameUnitPatch.status}`);

    const sameUnitConclusion = await call(PATCH, tokenSameUnitStaff, "PATCH", {
      action: "update",
      conclusionId: c1.id,
      content: "STAFF tự sửa kết luận",
    });
    check("STAFF cùng đơn vị không sửa được kết luận", sameUnitConclusion.status === 403, `status=${sameUnitConclusion.status}`);

    const assigneeGet = await call(GET, tokenAssigneeStaff, "GET");
    check("Người phối hợp ngoài đơn vị GET được", assigneeGet.status === 200, `status=${assigneeGet.status}`);
    check("Người phối hợp ngoài đơn vị nhận canEdit=false", assigneeGet.json?.data?.canEdit === false);

    // --- 2. Người tạo (STAFF) xem + sửa header
    const creatorGet = await call(GET, tokenCreator, "GET");
    check("Người tạo biên bản GET được", creatorGet.status === 200, `status=${creatorGet.status}`);
    check("GET trả canEdit=true cho người tạo", creatorGet.json?.data?.canEdit === true);

    const creatorUpdate = await call(PATCH, tokenCreator, "PATCH", {
      action: "update_meeting",
      title: "[TEST-2A1] Giao ban đã sửa",
      meetingAt: "2026-10-21",
      chair: "Chủ trì mới",
      notes: "Ghi chú mới",
    });
    check("Người tạo cập nhật được thông tin biên bản", creatorUpdate.status === 200, `status=${creatorUpdate.status}`);

    const afterCreator = await prisma.meeting.findUnique({ where: { id: meetingId } });
    check("DB lưu tiêu đề mới", afterCreator?.title === "[TEST-2A1] Giao ban đã sửa", afterCreator?.title || "");
    check("DB lưu chủ trì mới", afterCreator?.chair === "Chủ trì mới", afterCreator?.chair || "");
    check("DB lưu ghi chú mới", afterCreator?.notes === "Ghi chú mới", afterCreator?.notes || "");
    check(
      "DB lưu ngày họp mới",
      afterCreator?.meetingAt.toISOString().startsWith("2026-10-21"),
      afterCreator?.meetingAt.toISOString() || ""
    );

    const creatorConclusion = await call(PATCH, tokenCreator, "PATCH", {
      action: "update",
      conclusionId: c1.id,
      content: "Người tạo tự sửa kết luận",
    });
    check("Người tạo không phải lãnh đạo không sửa được kết luận (giữ hành vi cũ)", creatorConclusion.status === 403, `status=${creatorConclusion.status}`);

    // --- 3. Trưởng bộ phận trong đơn vị
    const leaderGet = await call(GET, tokenInScope, "GET");
    check("Trưởng bộ phận trong đơn vị GET được", leaderGet.status === 200, `status=${leaderGet.status}`);
    check("GET trả canEdit=true cho lãnh đạo trong phạm vi", leaderGet.json?.data?.canEdit === true);

    const emptyTitle = await call(PATCH, tokenInScope, "PATCH", { action: "update_meeting", title: "   " });
    check("update_meeting chặn tiêu đề rỗng", emptyTitle.status === 400, `status=${emptyTitle.status}`);

    const longTitle = await call(PATCH, tokenInScope, "PATCH", { action: "update_meeting", title: "x".repeat(201) });
    check("update_meeting chặn tiêu đề quá 200 ký tự", longTitle.status === 400, `status=${longTitle.status}`);

    const badDate = await call(PATCH, tokenInScope, "PATCH", { action: "update_meeting", meetingAt: "khong-phai-ngay" });
    check("update_meeting chặn ngày họp không hợp lệ", badDate.status === 400, `status=${badDate.status}`);

    const emptyBody = await call(PATCH, tokenInScope, "PATCH", { action: "update_meeting" });
    check("update_meeting chặn body rỗng", emptyBody.status === 400, `status=${emptyBody.status}`);

    const badChair = await call(PATCH, tokenInScope, "PATCH", { action: "update_meeting", chair: 123 });
    check("update_meeting chặn chủ trì không phải chuỗi", badChair.status === 400, `status=${badChair.status}`);

    const badNotes = await call(PATCH, tokenInScope, "PATCH", {
      action: "update_meeting",
      notes: { text: "không phải chuỗi" },
    });
    check("update_meeting chặn ghi chú không phải chuỗi", badNotes.status === 400, `status=${badNotes.status}`);

    const leaderUpdate = await call(PATCH, tokenInScope, "PATCH", {
      action: "update_meeting",
      title: "[TEST-2A1] Giao ban lãnh đạo sửa",
      notes: "Ghi chú lãnh đạo",
      chair: "",
    });
    check("Trưởng bộ phận trong đơn vị sửa được biên bản", leaderUpdate.status === 200, `status=${leaderUpdate.status}`);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: "MEETING_UPDATE", resourceType: "Meeting", resourceId: meetingId },
      orderBy: { timestamp: "desc" },
    });
    const auditOld = (audit?.oldData || {}) as any;
    const auditNew = (audit?.newData || {}) as any;
    check("Có audit MEETING_UPDATE", !!audit);
    check("Audit lưu old/new tiêu đề", auditOld.title === "[TEST-2A1] Giao ban đã sửa" && auditNew.title === "[TEST-2A1] Giao ban lãnh đạo sửa");
    check("Audit lưu old/new ghi chú", auditOld.notes === "Ghi chú mới" && auditNew.notes === "Ghi chú lãnh đạo");

    // --- 4. Sửa kết luận chưa chuyển nhiệm vụ
    const conclUpdate = await call(PATCH, tokenInScope, "PATCH", {
      action: "update",
      conclusionId: c1.id,
      content: "Kết luận đã sửa",
      ownerId: "",
      assigneeIds: [],
      deadline: "2026-10-30T10:00:00.000Z",
      priority: "Khẩn",
    });
    check("Sửa kết luận chưa có task thành công", conclUpdate.status === 200, `status=${conclUpdate.status}`);
    const c1After = await prisma.meetingConclusion.findUnique({ where: { id: c1.id } });
    check("DB lưu nội dung kết luận mới", c1After?.content === "Kết luận đã sửa", c1After?.content || "");
    check("DB lưu ưu tiên kết luận mới", c1After?.priority === "Khẩn", c1After?.priority || "");

    const conclLocked = await call(PATCH, tokenInScope, "PATCH", {
      action: "update",
      conclusionId: c2.id,
      content: "Sửa kết luận đã chuyển",
    });
    check("Sửa kết luận đã có taskId bị 400", conclLocked.status === 400, `status=${conclLocked.status}`);
    check("Thông báo khóa kết luận đã chuyển nhiệm vụ", String(conclLocked.json?.error || "").includes("nhiệm vụ"), String(conclLocked.json?.error || ""));

    // --- 5. Thêm kết luận giữ nguyên hành vi lãnh đạo
    const addConcl = await call(POST, tokenInScope, "POST", { content: "Kết luận thêm mới" });
    check("Lãnh đạo trong đơn vị thêm được kết luận", addConcl.status === 201, `status=${addConcl.status}`);
    const creatorAdd = await call(POST, tokenCreator, "POST", { content: "Người tạo tự thêm" });
    check("Người tạo STAFF vẫn không thêm được kết luận", creatorAdd.status === 403, `status=${creatorAdd.status}`);

    // --- 6. UNIT_LEADER phạm vi DEPARTMENT không sửa chéo đơn vị
    const unitLeaderRole = await prisma.role.findFirst({ where: { code: "UNIT_LEADER" } });
    if (!unitLeaderRole) throw new Error("Fixture thiếu role UNIT_LEADER");
    const tempGrant = await prisma.roleGrant.create({
      data: {
        accountId: outsiderLeader.id,
        roleId: unitLeaderRole.id,
        scopeType: "DEPARTMENT",
        scopeUnitId: outsiderLeader.scopeUnitId || outsiderLeader.unitId || null,
        validFrom: new Date(Date.now() - 60_000),
      },
    });
    tempGrantId = tempGrant.id;

    const crossUnitGet = await call(GET, tokenOutsider, "GET");
    check(
      "UNIT_LEADER phạm vi DEPARTMENT xem được theo phạm vi danh sách (getAuthorizedUnitIds trả ALL)",
      crossUnitGet.status === 200,
      `status=${crossUnitGet.status}`
    );
    const crossUnitUpdate = await call(PATCH, tokenOutsider, "PATCH", {
      action: "update_meeting",
      title: "Sửa chéo đơn vị",
    });
    check("UNIT_LEADER phạm vi DEPARTMENT khác đơn vị PATCH bị 403", crossUnitUpdate.status === 403, `status=${crossUnitUpdate.status}`);

    // --- 7. Biên bản cũ không có unitId: lãnh đạo ORGANIZATION xem + sửa được
    const nullOrgGet = await callAt(nullUnitMeetingId, GET, tokenOrgLeader, "GET");
    check("UNIT_LEADER ORGANIZATION GET biên bản không đơn vị", nullOrgGet.status === 200, `status=${nullOrgGet.status}`);
    check("UNIT_LEADER ORGANIZATION nhận canEdit=true cho biên bản không đơn vị", nullOrgGet.json?.data?.canEdit === true);

    const nullCreatorGet = await callAt(nullUnitMeetingId, GET, tokenCreator, "GET");
    check("Người tạo GET biên bản không đơn vị", nullCreatorGet.status === 200, `status=${nullCreatorGet.status}`);
    check("Người tạo nhận canEdit=true cho biên bản không đơn vị", nullCreatorGet.json?.data?.canEdit === true);

    const nullStaffGet = await callAt(nullUnitMeetingId, GET, tokenSameUnitStaff, "GET");
    check("STAFF cùng đơn vị GET biên bản không đơn vị bị 403", nullStaffGet.status === 403, `status=${nullStaffGet.status}`);

    const nullOutsiderGet = await callAt(nullUnitMeetingId, GET, tokenOutsiderStaff, "GET");
    check("STAFF ngoài đơn vị GET biên bản không đơn vị bị 403", nullOutsiderGet.status === 403, `status=${nullOutsiderGet.status}`);
  } finally {
    if (tempGrantId) await prisma.roleGrant.delete({ where: { id: tempGrantId } }).catch(() => {});
    if (nullUnitMeetingId) {
      await prisma.meeting.delete({ where: { id: nullUnitMeetingId } }).catch(() => {});
    }
    if (meetingId) {
      await prisma.auditEvent.deleteMany({ where: { resourceId: meetingId } }).catch(() => {});
      await prisma.meeting.delete({ where: { id: meetingId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n== Kết quả: ${passed} pass / ${failed} fail ==`);
  if (failed > 0) {
    console.log("Failures:\n- " + failures.join("\n- "));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exitCode = 1;
});
