/**
 * Phase A regression: lập kế hoạch, hạng mục, liên kết đầu việc, khóa kế hoạch,
 * completedDate:null, chống gửi trùng và chống tự duyệt.
 *
 * CHỈ chạy trên DB kiểm thử:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/talung_v3_fixture
 *   TEST_BASE_URL=http://localhost:3100 npx tsx scripts/test-v3-phase-a-planning.ts
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { canReviewAsDirectLeader } from "../src/server/work-item-review";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-phase-a-planning"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = `[PHASE-A-${Date.now()}]`;

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    fail++;
    const line = `${name}${detail ? " - " + detail : ""}`;
    failures.push(line);
    console.log(`[FAIL] ${line}`);
  }
}

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`Đăng nhập ${username} lỗi HTTP ${res.status}`);
  return json as { token: string; user: any };
}
const H = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});
async function req(path: string, token: string, method: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: H(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  console.log(`=== V3 PHASE A — ${TAG} ===\n`);
  const staffLogin = await login("democb01");
  const leaderLogin = await login("demold01");
  const staff = await prisma.person.findFirst({
    where: { code: "DEMO-CB-01" },
    include: { assignments: true },
  });
  const leader = await prisma.person.findFirst({ where: { code: "DEMO-LD-01" } });
  if (!staff || !leader) throw new Error("Thiếu person fixture DEMO-CB-01/DEMO-LD-01");
  const unitId = staff.assignments[0]?.unitId;
  if (!unitId) throw new Error("Thiếu đơn vị của DEMO-CB-01");
  const weekPeriod = await prisma.reportingPeriod.findFirst({
    where: { type: "WEEK" },
    orderBy: { startAt: "desc" },
  });
  const monthPeriod = await prisma.reportingPeriod.findFirst({
    where: { type: "MONTH" },
    orderBy: { startAt: "desc" },
  });
  if (!weekPeriod || !monthPeriod) throw new Error("Thiếu kỳ WEEK/MONTH fixture");

  const planIds: string[] = [];
  const itemIds: string[] = [];
  const workItemIds: string[] = [];
  const supervisionIds: string[] = [];

  try {
    // 1. Cán bộ không có plans.create không được lập kế hoạch.
    const staffPlanRes = await req("/api/plans", staffLogin.token, "POST", {
      type: "WEEK",
      date: "2026-10-23",
      unitId,
      title: `${TAG} staff tự lập`,
    });
    check(
      "A1. STAFF không có plans.create bị chặn lập kế hoạch (403)",
      staffPlanRes.status === 403,
      `HTTP ${staffPlanRes.status} ${staffPlanRes.json?.error || ""}`
    );

    // 2. Kế hoạch rỗng được tạo nhưng KHÔNG được trình duyệt.
    const emptyPlanRes = await req("/api/plans", leaderLogin.token, "POST", {
      type: "WEEK",
      date: "2026-10-23",
      unitId,
      title: `${TAG} kế hoạch rỗng`,
    });
    const emptyPlanId = emptyPlanRes.json?.data?.id;
    if (emptyPlanId) planIds.push(emptyPlanId);
    check(
      "A1. Trưởng đơn vị tạo được kế hoạch DRAFT",
      emptyPlanRes.status === 201 && !!emptyPlanId,
      `HTTP ${emptyPlanRes.status}`
    );
    const emptySubmit = await req(
      `/api/plans/${emptyPlanId}/workflow`,
      leaderLogin.token,
      "POST",
      { action: "SUBMIT" }
    );
    check(
      "A4. Kế hoạch không có hạng mục bị chặn trình duyệt (409)",
      emptySubmit.status === 409,
      `HTTP ${emptySubmit.status} ${emptySubmit.json?.error || ""}`
    );

    // 3. Tạo kế hoạch có hạng mục, thêm/sửa hạng mục qua API riêng.
    const planRes = await req("/api/plans", leaderLogin.token, "POST", {
      type: "WEEK",
      date: "2026-10-23",
      unitId,
      title: `${TAG} kế hoạch hợp lệ`,
      items: [{ title: `${TAG} hạng mục gốc` }],
    });
    const plan = planRes.json?.data;
    const itemId = plan?.items?.[0]?.id;
    if (plan?.id) planIds.push(plan.id);
    if (itemId) itemIds.push(itemId);
    check(
      "A1. Tạo kế hoạch kèm hạng mục đúng kỳ/đơn vị",
      planRes.status === 201 && plan?.periodId === weekPeriod.id && !!itemId,
      `HTTP ${planRes.status} period=${plan?.periodId}`
    );

    const addItem = await req(`/api/plans/${plan.id}/items`, leaderLogin.token, "POST", {
      title: `${TAG} hạng mục thêm`,
    });
    const extraItemId = addItem.json?.data?.id;
    if (extraItemId) itemIds.push(extraItemId);
    check(
      "A1. Thêm hạng mục vào kế hoạch DRAFT",
      addItem.status === 201 && !!extraItemId,
      `HTTP ${addItem.status}`
    );

    const editItem = await req(`/api/plans/${plan.id}/items`, leaderLogin.token, "PATCH", {
      itemId: extraItemId,
      title: `${TAG} hạng mục thêm (đã sửa)`,
    });
    check(
      "A1. Sửa tên hạng mục DRAFT",
      editItem.status === 200 &&
        editItem.json?.data?.title === `${TAG} hạng mục thêm (đã sửa)`,
      `HTTP ${editItem.status}`
    );

    // 4. Gắn đầu việc vào đúng hạng mục, đúng kỳ.
    const createWork = await req(
      "/api/personal-work-items",
      staffLogin.token,
      "POST",
      {
        personId: staff.id,
        periodId: plan.periodId,
        planItemId: itemId,
        title: `${TAG} đầu việc liên kết`,
        status: "IN_PROGRESS",
      }
    );
    const workItemId = createWork.json?.data?.id;
    if (workItemId) workItemIds.push(workItemId);
    check(
      "A2. Tạo đầu việc gắn đúng hạng mục/kỳ",
      createWork.status === 201 &&
        createWork.json?.data?.planItemId === itemId,
      `HTTP ${createWork.status} ${createWork.json?.error || ""}`
    );

    // 4b. QĐ1277: nhiều sản phẩm, đúng người đề xuất, đúng con trỏ chính.
    const activeProducts = await prisma.productItem.findMany({
      where: { status: "ACTIVE", version: { status: "ACTIVE" } },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
      take: 3,
    });
    check(
      "A3. Có ít nhất 2 sản phẩm QĐ1277 đang áp dụng để kiểm thử",
      activeProducts.length >= 2,
      `count=${activeProducts.length}`
    );
    const [prodA, prodB, prodC] = activeProducts;
    if (prodA && prodB && workItemId) {
      const addA = await req("/api/work-item-products", staffLogin.token, "POST", {
        workItemId,
        productItemId: prodA.id,
      });
      const addB = await req("/api/work-item-products", staffLogin.token, "POST", {
        workItemId,
        productItemId: prodB.id,
      });
      check(
        "A3. Người thực hiện gắn được nhiều sản phẩm QĐ1277",
        addA.status === 201 && addB.status === 201,
        `HTTP ${addA.status}/${addB.status}`
      );

      const linksRes = await req(
        `/api/work-item-products?workItemId=${workItemId}`,
        staffLogin.token,
        "GET"
      );
      const links = linksRes.json?.data || [];
      const pointer = await prisma.personalWorkItem.findUnique({
        where: { id: workItemId },
        select: { productItemId: true },
      });
      check(
        "A3. Liên kết đầu tiên là sản phẩm chính và con trỏ PWI khớp",
        links.length === 2 &&
          links[0]?.isPrimary === true &&
          links[1]?.isPrimary === false &&
          pointer?.productItemId === prodA.id,
        `links=${links.length} primary=${links[0]?.isPrimary}/${links[1]?.isPrimary} ptr=${pointer?.productItemId}`
      );

      const dup = await req("/api/work-item-products", staffLogin.token, "POST", {
        workItemId,
        productItemId: prodA.id,
      });
      check(
        "A3. Gắn trùng một sản phẩm QĐ1277 bị chặn (409)",
        dup.status === 409,
        `HTTP ${dup.status} ${dup.json?.error || ""}`
      );

      const leaderAddForStaff = await req(
        "/api/work-item-products",
        leaderLogin.token,
        "POST",
        { workItemId, productItemId: prodA.id }
      );
      check(
        "A3. Lãnh đạo không được đề xuất sản phẩm thay người thực hiện (403)",
        leaderAddForStaff.status === 403,
        `HTTP ${leaderAddForStaff.status}`
      );

      const leaderDeleteForStaff = await req(
        "/api/work-item-products",
        leaderLogin.token,
        "DELETE",
        { workItemId, productItemId: prodA.id }
      );
      check(
        "A3. Lãnh đạo không được bỏ sản phẩm của người thực hiện (403)",
        leaderDeleteForStaff.status === 403,
        `HTTP ${leaderDeleteForStaff.status}`
      );

      const leaderPatchPointer = await req(
        "/api/personal-work-items",
        leaderLogin.token,
        "PATCH",
        { id: workItemId, productItemId: prodB.id }
      );
      check(
        "A3. Lãnh đạo không được đổi con trỏ sản phẩm chính của người khác (403)",
        leaderPatchPointer.status === 403,
        `HTTP ${leaderPatchPointer.status}`
      );

      const leaderCreateWithProduct = await req(
        "/api/personal-work-items",
        leaderLogin.token,
        "POST",
        {
          personId: staff.id,
          periodId: weekPeriod.id,
          title: `${TAG} lãnh đạo gắn SP hộ`,
          productItemId: prodA.id,
        }
      );
      const leakedCreate = await prisma.personalWorkItem.count({
        where: { personId: staff.id, title: `${TAG} lãnh đạo gắn SP hộ` },
      });
      check(
        "A3. Tạo hộ kèm sản phẩm QĐ1277 bị chặn, không tạo bản ghi mồ côi",
        leaderCreateWithProduct.status === 403 && leakedCreate === 0,
        `HTTP ${leaderCreateWithProduct.status} leaked=${leakedCreate}`
      );

      // Xác nhận sản phẩm phải do lãnh đạo trực tiếp; tạo tuyến test nếu fixture chưa có.
      let supervision = await prisma.personSupervision.findFirst({
        where: {
          managerPersonId: leader.id,
          subordinatePersonId: staff.id,
          status: "CONFIRMED",
        },
      });
      if (!supervision) {
        supervision = await prisma.personSupervision.create({
          data: {
            managerPersonId: leader.id,
            subordinatePersonId: staff.id,
            status: "CONFIRMED",
            effectiveFrom: new Date(Date.now() - 60_000),
            note: `${TAG} tuyến phụ trách dùng cho test`,
          },
        });
        supervisionIds.push(supervision.id);
      }

      const confirmA = await req(
        `/api/work-item-products/${links[0]?.id}`,
        leaderLogin.token,
        "PATCH",
        { action: "CONFIRM" }
      );
      check(
        "A3. Lãnh đạo trực tiếp xác nhận được sản phẩm QĐ1277",
        confirmA.status === 200 &&
          confirmA.json?.data?.reviewState === "CONFIRMED" &&
          confirmA.json?.data?.factorSnapshot !== undefined,
        `HTTP ${confirmA.status} state=${confirmA.json?.data?.reviewState}`
      );

      const deleteConfirmed = await req(
        "/api/work-item-products",
        staffLogin.token,
        "DELETE",
        { workItemId, productItemId: prodA.id }
      );
      check(
        "A3. Sản phẩm đã xác nhận không thể bỏ (409)",
        deleteConfirmed.status === 409,
        `HTTP ${deleteConfirmed.status} ${deleteConfirmed.json?.error || ""}`
      );

      const deleteSecondary = await req(
        "/api/work-item-products",
        staffLogin.token,
        "DELETE",
        { workItemId, productItemId: prodB.id }
      );
      check(
        "A3. Người thực hiện bỏ được sản phẩm chưa xác nhận",
        deleteSecondary.status === 200,
        `HTTP ${deleteSecondary.status} ${deleteSecondary.json?.error || ""}`
      );
    }

    // 4c. Xóa sản phẩm chính phải chuyển con trỏ + cờ chính sang sản phẩm còn lại.
    let primaryItemId: string | null = null;
    if (prodB && prodC) {
      const primaryItem = await req(
        "/api/personal-work-items",
        staffLogin.token,
        "POST",
        {
          personId: staff.id,
          periodId: weekPeriod.id,
          title: `${TAG} kiểm tra chuyển sản phẩm chính`,
        }
      );
      primaryItemId = primaryItem.json?.data?.id || null;
      if (primaryItemId) workItemIds.push(primaryItemId);
      check(
        "A3. Tạo được đầu việc riêng để kiểm tra chuyển sản phẩm chính",
        primaryItem.status === 201 && !!primaryItemId,
        `HTTP ${primaryItem.status}`
      );
      if (primaryItemId) {
        await req("/api/work-item-products", staffLogin.token, "POST", {
          workItemId: primaryItemId,
          productItemId: prodB.id,
        });
        await req("/api/work-item-products", staffLogin.token, "POST", {
          workItemId: primaryItemId,
          productItemId: prodC.id,
        });
        const delPrimary = await req(
          "/api/work-item-products",
          staffLogin.token,
          "DELETE",
          { workItemId: primaryItemId, productItemId: prodB.id }
        );
        const remaining = await req(
          `/api/work-item-products?workItemId=${primaryItemId}`,
          staffLogin.token,
          "GET"
        );
        const remainingLinks = remaining.json?.data || [];
        const ptr = await prisma.personalWorkItem.findUnique({
          where: { id: primaryItemId },
          select: { productItemId: true },
        });
        check(
          "A3. Xóa sản phẩm chính tự chuyển sản phẩm chính + con trỏ",
          delPrimary.status === 200 &&
            remainingLinks.length === 1 &&
            remainingLinks[0]?.isPrimary === true &&
            ptr?.productItemId === prodC.id,
          `HTTP ${delPrimary.status} links=${remainingLinks.length} primary=${remainingLinks[0]?.isPrimary} ptr=${ptr?.productItemId}`
        );
      }
    }

    // 5. P0: client cũ gửi completedDate:null trên form sửa không còn 409.
    const editNullDate = await req(
      "/api/personal-work-items",
      staffLogin.token,
      "PATCH",
      {
        id: workItemId,
        title: `${TAG} đầu việc liên kết (đã sửa)`,
        planItemId: itemId,
        completedDate: null,
      }
    );
    check(
      "A2. PATCH với completedDate:null không còn 409",
      editNullDate.status === 200 && editNullDate.json?.data?.completedDate == null,
      `HTTP ${editNullDate.status} ${editNullDate.json?.error || ""}`
    );

    // 6. planItemId sai phải trả 400, không rò lỗi FK 500.
    const badLink = await req(
      "/api/personal-work-items",
      staffLogin.token,
      "POST",
      {
        personId: staff.id,
        periodId: weekPeriod.id,
        planItemId: randomUUID(),
        title: `${TAG} đầu việc planItem sai`,
      }
    );
    check(
      "A2. planItemId không tồn tại trả 400 (không 500)",
      badLink.status === 400,
      `HTTP ${badLink.status} ${badLink.json?.error || ""}`
    );

    // 7. Hạng mục khác kỳ phải bị chặn.
    const wrongPeriod = await req(
      "/api/personal-work-items",
      staffLogin.token,
      "POST",
      {
        personId: staff.id,
        periodId: monthPeriod.id,
        planItemId: itemId,
        title: `${TAG} đầu việc sai kỳ`,
      }
    );
    check(
      "A2. Hạng mục khác kỳ bị chặn (400)",
      wrongPeriod.status === 400,
      `HTTP ${wrongPeriod.status} ${wrongPeriod.json?.error || ""}`
    );

    // 8. Không được tạo trực tiếp trạng thái COMPLETED.
    const directCompleted = await req(
      "/api/personal-work-items",
      staffLogin.token,
      "POST",
      {
        personId: staff.id,
        periodId: weekPeriod.id,
        title: `${TAG} tạo thẳng hoàn thành`,
        status: "COMPLETED",
      }
    );
    check(
      "A4. Tạo trực tiếp COMPLETED bị chặn (409)",
      directCompleted.status === 409,
      `HTTP ${directCompleted.status} ${directCompleted.json?.error || ""}`
    );

    // 9. Gửi trùng cùng idempotencyKey chỉ tạo một đầu việc.
    const idemKey = `phase-a-${Date.now()}`;
    const idemBody = {
      personId: staff.id,
      periodId: weekPeriod.id,
      title: `${TAG} chống gửi trùng`,
      idempotencyKey: idemKey,
    };
    const idem1 = await req(
      "/api/personal-work-items",
      staffLogin.token,
      "POST",
      idemBody
    );
    const idem2 = await req(
      "/api/personal-work-items",
      staffLogin.token,
      "POST",
      idemBody
    );
    const idem1Id = idem1.json?.data?.id;
    if (idem1Id) workItemIds.push(idem1Id);
    const idemCount = await prisma.personalWorkItem.count({
      where: { personId: staff.id, idempotencyKey: idemKey },
    });
    check(
      "A2. Gửi trùng idempotencyKey chỉ tạo 1 bản ghi",
      idem1.status === 201 &&
        idem2.status === 200 &&
        idem2.json?.deduplicated === true &&
        idem1Id === idem2.json?.data?.id &&
        idemCount === 1,
      `HTTP ${idem1.status}/${idem2.status}, count=${idemCount}`
    );

    // 10. Không xóa hạng mục đang có đầu việc.
    const deleteLinked = await req(
      `/api/plans/${plan.id}/items?itemId=${itemId}`,
      leaderLogin.token,
      "DELETE"
    );
    check(
      "A1/A2. Không xóa hạng mục đang có đầu việc (409)",
      deleteLinked.status === 409,
      `HTTP ${deleteLinked.status}`
    );

    // 11. Trình duyệt kế hoạch có nội dung.
    const submit = await req(
      `/api/plans/${plan.id}/workflow`,
      leaderLogin.token,
      "POST",
      { action: "SUBMIT" }
    );
    check(
      "A4. Trình duyệt kế hoạch có hạng mục + đầu việc",
      submit.status === 200,
      `HTTP ${submit.status} ${submit.json?.error || ""}`
    );

    // 12. Kế hoạch SUBMITTED khóa sửa đầu việc và hạng mục.
    const editSubmitted = await req(
      "/api/personal-work-items",
      staffLogin.token,
      "PATCH",
      { id: workItemId, title: `${TAG} cố sửa khi chờ duyệt` }
    );
    check(
      "A4. Kế hoạch SUBMITTED khóa sửa đầu việc (409)",
      editSubmitted.status === 409,
      `HTTP ${editSubmitted.status} ${editSubmitted.json?.error || ""}`
    );
    const addItemSubmitted = await req(
      `/api/plans/${plan.id}/items`,
      leaderLogin.token,
      "POST",
      { title: `${TAG} hạng mục khi chờ duyệt` }
    );
    check(
      "A4. Kế hoạch SUBMITTED khóa thêm hạng mục (409)",
      addItemSubmitted.status === 409,
      `HTTP ${addItemSubmitted.status}`
    );

    // 12b. Trả lại → sửa → trình lại → chặn tự duyệt → người khác duyệt.
    const returned = await req(
      `/api/plans/${plan.id}/workflow`,
      leaderLogin.token,
      "POST",
      { action: "RETURN", reviewNotes: `${TAG} yêu cầu bổ sung nội dung` }
    );
    const returnedRow = await prisma.plan.findUnique({ where: { id: plan.id } });
    check(
      "A4. Trả lại kế hoạch SUBMITTED kèm lý do",
      returned.status === 200 && returnedRow?.status === "RETURNED",
      `HTTP ${returned.status} status=${returnedRow?.status}`
    );

    const editReturned = await req(
      "/api/personal-work-items",
      staffLogin.token,
      "PATCH",
      { id: workItemId, title: `${TAG} đầu việc sửa sau khi trả lại` }
    );
    check(
      "A4. Kế hoạch RETURNED cho phép sửa lại nội dung",
      editReturned.status === 200,
      `HTTP ${editReturned.status} ${editReturned.json?.error || ""}`
    );

    const resubmit = await req(
      `/api/plans/${plan.id}/workflow`,
      leaderLogin.token,
      "POST",
      { action: "SUBMIT" }
    );
    check(
      "A4. Trình lại kế hoạch sau khi bị trả lại",
      resubmit.status === 200,
      `HTTP ${resubmit.status} ${resubmit.json?.error || ""}`
    );

    const selfApprove = await req(
      `/api/plans/${plan.id}/workflow`,
      leaderLogin.token,
      "POST",
      { action: "APPROVE" }
    );
    check(
      "A4. Người lập kế hoạch không được tự phê duyệt (403)",
      selfApprove.status === 403,
      `HTTP ${selfApprove.status} ${selfApprove.json?.error || ""}`
    );

    // Mô phỏng kế hoạch do người khác lập để kiểm tra nhánh phê duyệt hợp lệ.
    // Chỉ đổi creatorId trên bản ghi test; không thay đổi tài khoản/phân quyền.
    await prisma.plan.update({
      where: { id: plan.id },
      data: { creatorId: staff.id },
    });
    const approve = await req(
      `/api/plans/${plan.id}/workflow`,
      leaderLogin.token,
      "POST",
      { action: "APPROVE" }
    );
    const approvedRow = await prisma.plan.findUnique({ where: { id: plan.id } });
    check(
      "A4. Người có thẩm quyền khác phê duyệt được kế hoạch",
      approve.status === 200 &&
        approvedRow?.status === "APPROVED" &&
        approvedRow?.approvedBy === leader.id,
      `HTTP ${approve.status} status=${approvedRow?.status} by=${approvedRow?.approvedBy}`
    );

    const editApproved = await req(
      "/api/personal-work-items",
      staffLogin.token,
      "PATCH",
      { id: workItemId, title: `${TAG} cố sửa khi đã duyệt` }
    );
    check(
      "A4. Kế hoạch APPROVED khóa sửa nội dung trực tiếp",
      editApproved.status === 403 || editApproved.status === 409,
      `HTTP ${editApproved.status} ${editApproved.json?.error || ""}`
    );

    const effect = await req(
      `/api/plans/${plan.id}/workflow`,
      leaderLogin.token,
      "POST",
      { action: "EFFECT" }
    );
    const effectRow = await prisma.plan.findUnique({ where: { id: plan.id } });
    check(
      "A4. Ban hành hiệu lực sau phê duyệt",
      effect.status === 200 && effectRow?.status === "IN_EFFECT",
      `HTTP ${effect.status} status=${effectRow?.status}`
    );

    // 13. Chống tự duyệt kể cả khi có bản ghi giám sát trỏ chính mình.
    const now = new Date();
    const selfSup = await prisma.personSupervision.create({
      data: {
        managerPersonId: leader.id,
        subordinatePersonId: leader.id,
        status: "CONFIRMED",
        effectiveFrom: new Date(now.getTime() - 60_000),
        note: `${TAG} self supervision dùng cho test`,
      },
    });
    supervisionIds.push(selfSup.id);
    const selfAllowed = await canReviewAsDirectLeader(
      leaderLogin.user,
      leader.id
    );
    check(
      "A4. Lãnh đạo không được tự xác nhận công việc của chính mình",
      selfAllowed === false,
      `canReviewAsDirectLeader=${selfAllowed}`
    );

    console.log(`\n=== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ===`);
    if (failures.length) {
      console.log("Các test lỗi:");
      failures.forEach((f) => console.log(" - " + f));
    }
  } finally {
    // Dọn dữ liệu test theo thứ tự khóa ngoại.
    if (workItemIds.length) {
      await prisma.workItemProduct.deleteMany({
        where: { workItemId: { in: workItemIds } },
      });
      await prisma.workItemAssignment.deleteMany({
        where: { workItemId: { in: workItemIds } },
      });
      await prisma.workItemReview.deleteMany({
        where: { workItemId: { in: workItemIds } },
      });
      await prisma.planItem.updateMany({
        where: { workItemId: { in: workItemIds } },
        data: { workItemId: null },
      });
      await prisma.personalWorkItem.deleteMany({
        where: { id: { in: workItemIds } },
      });
    }
    if (planIds.length) {
      await prisma.approvalDecision.deleteMany({
        where: { case: { caseType: "PLAN", resourceId: { in: planIds } } },
      });
      await prisma.approvalCase.deleteMany({
        where: { caseType: "PLAN", resourceId: { in: planIds } },
      });
      await prisma.planVersion.deleteMany({ where: { planId: { in: planIds } } });
      await prisma.planItem.deleteMany({ where: { planId: { in: planIds } } });
      await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    }
    if (supervisionIds.length) {
      await prisma.personSupervision.deleteMany({
        where: { id: { in: supervisionIds } },
      });
    }
    await prisma.$disconnect();
  }

  if (fail > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error("LỖI CHẠY TEST:", error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
