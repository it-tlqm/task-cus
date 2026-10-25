/**
 * test-ux-phase2a-collaborator-notifications.ts — Kiểm thử API (Phase 2A / Task 2A4).
 *
 * Chạy trên database kiểm thử CỤC BỘ (chặn bởi test-db-safety):
 *   npx tsx scripts/test-ux-phase2a-collaborator-notifications.ts
 *
 * Yêu cầu database đã áp migration `task_participant_results` (nhánh ACCEPT_TASK).
 * Nếu DB mặc định chưa có bảng này, trỏ sang fixture đã cập nhật, ví dụ:
 *   DATABASE_URL=postgresql://...@localhost:5432/talung_v3_fixture_integration \
 *     npx tsx scripts/test-ux-phase2a-collaborator-notifications.ts
 *
 * Phạm vi:
 *  1. Kết luận giao ban → nhiệm vụ: owner + TỪNG người phối hợp nhận thông báo có link task;
 *     bấm chuyển lại (dedup) không sinh thông báo mới.
 *  2. PATCH nhiệm vụ bổ sung người phối hợp: chỉ người MỚI nhận thông báo; người cũ không bị báo lại;
 *     gọi lại vẫn không nhân đôi.
 *  3. Người phối hợp ACCEPT_TASK: owner (và người giao việc nếu có) nhận đúng 1 thông báo;
 *     người nhận không tự báo chính mình; gọi lại không nhân đôi.
 *
 * Script tự tạo fixture (1 biên bản + 1 task giao việc) và dọn sạch trong finally.
 */
import fs from "fs";
import { randomUUID } from "crypto";
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

const dbUrl = assertLocalTestDatabase(process.env.DATABASE_URL, "test-ux-phase2a-collaborator-notifications");

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
  const { PATCH: patchMeeting } = await import("../src/app/api/meetings/[id]/route");
  const { PATCH: patchTaskById } = await import("../src/app/api/tasks/[id]/route");
  const { PATCH: patchTasks } = await import("../src/app/api/tasks/route");

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const now = new Date();
  let meetingId = "";
  const taskIds: string[] = [];

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

    const mapped = accounts
      .map((a) => {
        const grant = pickPrimaryGrant(a.roleGrants);
        return {
          ...a,
          roleCode: grant?.role.code || "STAFF",
          scopeType: grant?.scopeType || "DEPARTMENT",
          scopeUnitId: grant?.scopeUnitId || null,
          unitId: a.person?.assignments?.[0]?.unitId || null,
        };
      })
      .filter((a) => !!a.person);

    const leader =
      mapped.find((a) => a.roleCode === "DEPARTMENT_LEADER" && (a.scopeUnitId || a.unitId)) ||
      mapped.find((a) => a.roleCode === "UNIT_LEADER" && (a.scopeUnitId || a.unitId));
    const unitId = leader?.scopeUnitId || leader?.unitId || null;

    const staffByPerson = new Map<string, typeof mapped[number]>();
    for (const a of mapped) {
      if (a.roleCode !== "STAFF") continue;
      if (leader && a.person!.id === leader.person!.id) continue;
      if (!staffByPerson.has(a.person!.id)) staffByPerson.set(a.person!.id, a);
    }
    const staff = [...staffByPerson.values()];
    const [owner, collabA, collabB, collabC] = staff;

    if (!leader || !unitId || !owner || !collabA || !collabB || !collabC) {
      throw new Error(
        "Fixture thiếu dữ liệu: cần 1 DEPARTMENT_LEADER/UNIT_LEADER có đơn vị và 4 STAFF khác nhau."
      );
    }

    const tokenOf = (a: typeof mapped[number]) =>
      signToken({
        id: a.id,
        personId: a.person!.id,
        username: a.username,
        fullName: a.person!.fullName,
        role: a.roleCode,
        scopeType: a.scopeType as any,
        permissions: [],
      });
    const leaderToken = tokenOf(leader);
    const collabBToken = tokenOf(collabB);
    const collabCToken = tokenOf(collabC);

    const call = async (
      fn: any,
      params: any,
      tok: string,
      method: string,
      url: string,
      payload?: any
    ) => {
      const req = new Request(url, {
        method,
        headers: {
          authorization: `Bearer ${tok}`,
          ...(payload ? { "content-type": "application/json" } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const res = await fn(req as any, params as any);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    };

    const notificationOf = (taskId: string, recipientId: string, type?: string, key?: string) =>
      prisma.notification.findMany({
        where: {
          entityId: taskId,
          recipientId,
          ...(type ? { type } : {}),
          ...(key ? { idempotencyKey: key } : {}),
        },
      });

    // =====================================================================
    // 1. Biên bản → nhiệm vụ: báo owner + từng người phối hợp.
    // =====================================================================
    meetingId = (
      await prisma.meeting.create({
        data: {
          title: "[TEST-2A4] Giao ban thông báo phối hợp",
          meetingAt: new Date("2026-10-20T00:00:00.000Z"),
          unitId,
          createdById: leader.person!.id,
        },
      })
    ).id;
    const conclusion = await prisma.meetingConclusion.create({
      data: {
        meetingId,
        content: "Kiểm thử thông báo công chức phối hợp",
        ownerId: owner.person!.id,
        assigneeIds: [collabA.person!.id, collabB.person!.id],
        priority: "Cao",
        deadline: new Date("2026-11-15T00:00:00.000Z"),
        sortOrder: 1,
      },
    });

    const convert = await call(
      patchMeeting,
      { params: Promise.resolve({ id: meetingId }) },
      leaderToken,
      "PATCH",
      `http://localhost/api/meetings/${meetingId}`,
      { action: "convert", conclusionId: conclusion.id }
    );
    check("Chuyển kết luận thành nhiệm vụ thành công", convert.status === 201, `status=${convert.status}`);
    const meetingTask = convert.json?.data;
    check("Nhiệm vụ có mã và id", !!meetingTask?.id && !!meetingTask?.code);
    if (!meetingTask?.id) throw new Error("Không tạo được nhiệm vụ từ kết luận");
    taskIds.push(meetingTask.id);

    const ownerNotifs = await notificationOf(
      meetingTask.id,
      owner.person!.id,
      "TASK_ASSIGNED",
      `EVENT_MEET_CONV_${conclusion.id}_${owner.person!.id}`
    );
    check("Chủ trì nhận 1 thông báo giao việc từ giao ban", ownerNotifs.length === 1, `count=${ownerNotifs.length}`);

    for (const [label, person] of [
      ["Người phối hợp A", collabA],
      ["Người phối hợp B", collabB],
    ] as const) {
      const rows = await notificationOf(
        meetingTask.id,
        person.person!.id,
        "TASK_ASSIGNED",
        `EVENT_MEET_CONV_${conclusion.id}_${person.person!.id}`
      );
      check(`${label} nhận 1 thông báo phối hợp từ giao ban`, rows.length === 1, `count=${rows.length}`);
      check(`${label} thông báo có link tới nhiệm vụ`, rows[0]?.actionUrl === `/tasks/${meetingTask.id}`, rows[0]?.actionUrl || "");
      check(`${label} thông báo đúng nhãn phối hợp`, rows[0]?.tag === "PHỐI HỢP", rows[0]?.tag || "");
    }

    const leaderMeetingNotifs = await prisma.notification.findMany({
      where: { entityId: meetingTask.id, recipientId: leader.person!.id },
    });
    check("Người chuyển kết luận không tự nhận thông báo giao việc", leaderMeetingNotifs.length === 0, `count=${leaderMeetingNotifs.length}`);

    const convertRetry = await call(
      patchMeeting,
      { params: Promise.resolve({ id: meetingId }) },
      leaderToken,
      "PATCH",
      `http://localhost/api/meetings/${meetingId}`,
      { action: "convert", conclusionId: conclusion.id }
    );
    check("Chuyển lại kết luận trả deduplicated", convertRetry.status === 200 && convertRetry.json?.deduplicated === true, `status=${convertRetry.status}`);
    const collabAAfterRetry = await notificationOf(
      meetingTask.id,
      collabA.person!.id,
      "TASK_ASSIGNED",
      `EVENT_MEET_CONV_${conclusion.id}_${collabA.person!.id}`
    );
    check("Chuyển lại không nhân đôi thông báo phối hợp", collabAAfterRetry.length === 1, `count=${collabAAfterRetry.length}`);

    // =====================================================================
    // 2. PATCH nhiệm vụ: chỉ báo người phối hợp MỚI được bổ sung.
    // =====================================================================
    const assignPayload = { id: meetingTask.id, assigneeIds: [collabA.person!.id, collabC.person!.id] };
    const assign = await call(
      patchTaskById,
      { params: Promise.resolve({ id: meetingTask.id }) },
      leaderToken,
      "PATCH",
      `http://localhost/api/tasks/${meetingTask.id}`,
      assignPayload
    );
    check("Lãnh đạo bổ sung người phối hợp thành công", assign.status === 200, `status=${assign.status}`);

    const newCollabNotifs = await notificationOf(
      meetingTask.id,
      collabC.person!.id,
      "TASK_ASSIGNED",
      `EVENT_TASK_COLLAB_ADDED_${meetingTask.id}_${collabC.person!.id}`
    );
    check("Người phối hợp mới nhận 1 thông báo", newCollabNotifs.length === 1, `count=${newCollabNotifs.length}`);
    check("Thông báo người mới có link nhiệm vụ", newCollabNotifs[0]?.actionUrl === `/tasks/${meetingTask.id}`, newCollabNotifs[0]?.actionUrl || "");
    check("Thông báo người mới đúng nhãn phối hợp", newCollabNotifs[0]?.tag === "PHỐI HỢP", newCollabNotifs[0]?.tag || "");

    const existingCollabNotifs = await notificationOf(
      meetingTask.id,
      collabA.person!.id,
      "TASK_ASSIGNED",
      `EVENT_TASK_COLLAB_ADDED_${meetingTask.id}_${collabA.person!.id}`
    );
    check("Người phối hợp cũ không bị báo lại", existingCollabNotifs.length === 0, `count=${existingCollabNotifs.length}`);

    const removedCollabNotifs = await notificationOf(
      meetingTask.id,
      collabB.person!.id,
      "TASK_ASSIGNED",
      `EVENT_TASK_COLLAB_ADDED_${meetingTask.id}_${collabB.person!.id}`
    );
    check("Người bị bỏ khỏi danh sách không nhận thông báo thêm", removedCollabNotifs.length === 0, `count=${removedCollabNotifs.length}`);

    const assigneesInDb = await prisma.taskAssignee.findMany({
      where: { taskId: meetingTask.id },
      select: { personId: true },
    });
    check(
      "Danh sách phối hợp trong DB đúng sau khi sửa",
      assigneesInDb.length === 2 &&
        assigneesInDb.some((a) => a.personId === collabA.person!.id) &&
        assigneesInDb.some((a) => a.personId === collabC.person!.id),
      assigneesInDb.map((a) => a.personId).join(",")
    );

    const assignRetry = await call(
      patchTaskById,
      { params: Promise.resolve({ id: meetingTask.id }) },
      leaderToken,
      "PATCH",
      `http://localhost/api/tasks/${meetingTask.id}`,
      assignPayload
    );
    check("Sửa lại danh sách phối hợp vẫn thành công", assignRetry.status === 200, `status=${assignRetry.status}`);
    const newCollabAfterRetry = await notificationOf(
      meetingTask.id,
      collabC.person!.id,
      "TASK_ASSIGNED",
      `EVENT_TASK_COLLAB_ADDED_${meetingTask.id}_${collabC.person!.id}`
    );
    check("Sửa lại không nhân đôi thông báo người mới", newCollabAfterRetry.length === 1, `count=${newCollabAfterRetry.length}`);

    // =====================================================================
    // 3. Người phối hợp nhận phần việc → báo owner + người giao việc.
    // =====================================================================
    const accept = await call(
      patchTasks,
      {},
      collabCToken,
      "PATCH",
      "http://localhost/api/tasks",
      { id: meetingTask.id, action: "ACCEPT_TASK" }
    );
    check("Người phối hợp xác nhận nhận phần việc thành công", accept.status === 200, `status=${accept.status}`);
    check(
      "Thông điệp xác nhận đúng nhánh phần việc",
      String(accept.json?.message || "").includes("phần việc"),
      String(accept.json?.message || "")
    );

    const ownerAcceptNotifs = await notificationOf(
      meetingTask.id,
      owner.person!.id,
      "TASK_ACCEPTED",
      `participant-accept-task:${meetingTask.id}:${collabC.person!.id}:${owner.person!.id}`
    );
    check("Chủ trì nhận 1 thông báo người phối hợp đã nhận việc", ownerAcceptNotifs.length === 1, `count=${ownerAcceptNotifs.length}`);
    check("Thông báo nhận việc có link nhiệm vụ", ownerAcceptNotifs[0]?.actionUrl === `/tasks/${meetingTask.id}`, ownerAcceptNotifs[0]?.actionUrl || "");

    const selfAcceptNotifs = await notificationOf(meetingTask.id, collabC.person!.id, "TASK_ACCEPTED");
    check("Người nhận việc không tự báo chính mình", selfAcceptNotifs.length === 0, `count=${selfAcceptNotifs.length}`);

    const acceptRetry = await call(
      patchTasks,
      {},
      collabCToken,
      "PATCH",
      "http://localhost/api/tasks",
      { id: meetingTask.id, action: "ACCEPT_TASK" }
    );
    check("Xác nhận nhận việc lần 2 vẫn trả thành công", acceptRetry.status === 200, `status=${acceptRetry.status}`);
    const ownerAcceptAfterRetry = await notificationOf(
      meetingTask.id,
      owner.person!.id,
      "TASK_ACCEPTED",
      `participant-accept-task:${meetingTask.id}:${collabC.person!.id}:${owner.person!.id}`
    );
    check("Xác nhận lần 2 không nhân đôi thông báo chủ trì", ownerAcceptAfterRetry.length === 1, `count=${ownerAcceptAfterRetry.length}`);

    // Nhiệm vụ có assignedById: báo cả người giao việc (khác owner).
    const assignedTask = await prisma.task.create({
      data: {
        code: `2A4-${randomUUID().slice(0, 8).toUpperCase()}`,
        title: "[TEST-2A4] Nhiệm vụ có người giao việc",
        ownerId: owner.person!.id,
        unitId,
        priority: "Cao",
        status: "NOT_STARTED",
        originalDeadline: new Date("2026-11-20T00:00:00.000Z"),
        currentDeadline: new Date("2026-11-20T00:00:00.000Z"),
        createdById: leader.person!.id,
        assignedById: leader.person!.id,
        originKind: "LEADER_ASSIGNED",
        assignees: { create: [{ personId: collabB.person!.id, role: "COLLABORATOR" }] },
      },
    });
    taskIds.push(assignedTask.id);

    const acceptAssigned = await call(
      patchTasks,
      {},
      collabBToken,
      "PATCH",
      "http://localhost/api/tasks",
      { id: assignedTask.id, action: "ACCEPT_TASK" }
    );
    check("Người phối hợp nhận việc trên nhiệm vụ giao trực tiếp", acceptAssigned.status === 200, `status=${acceptAssigned.status}`);

    const ownerAssignedNotifs = await notificationOf(
      assignedTask.id,
      owner.person!.id,
      "TASK_ACCEPTED",
      `participant-accept-task:${assignedTask.id}:${collabB.person!.id}:${owner.person!.id}`
    );
    const assignerNotifs = await notificationOf(
      assignedTask.id,
      leader.person!.id,
      "TASK_ACCEPTED",
      `participant-accept-task:${assignedTask.id}:${collabB.person!.id}:${leader.person!.id}`
    );
    check("Chủ trì nhận thông báo nhận việc", ownerAssignedNotifs.length === 1, `count=${ownerAssignedNotifs.length}`);
    check("Người giao việc nhận thông báo nhận việc", assignerNotifs.length === 1, `count=${assignerNotifs.length}`);

    const selfAssignedNotifs = await notificationOf(assignedTask.id, collabB.person!.id, "TASK_ACCEPTED");
    check("Người nhận không tự báo trên nhiệm vụ giao trực tiếp", selfAssignedNotifs.length === 0, `count=${selfAssignedNotifs.length}`);
  } finally {
    const ids = taskIds.filter(Boolean);
    if (ids.length > 0) {
      await prisma.notification.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
      await prisma.auditEvent.deleteMany({ where: { resourceId: { in: ids } } }).catch(() => {});
      await prisma.task.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
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
