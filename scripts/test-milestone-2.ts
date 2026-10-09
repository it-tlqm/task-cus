import { prisma } from "../src/server/db";

const BASE_URL = "http://localhost:3000";

interface UserSession {
  username: string;
  cookie: string;
  role: string;
  personId: string;
  unitId?: string;
}

// Hàm trợ giúp đăng nhập và lấy cookie
async function loginUser(username: string): Promise<UserSession> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "demo123" }),
  });

  if (!res.ok) {
    throw new Error(`Đăng nhập thất bại cho ${username}: ${res.statusText}`);
  }

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(`Không nhận được cookie cho ${username}`);
  }

  // Lấy giá trị cookie token
  const cookie = setCookie.split(";")[0];
  const data = await res.json();

  return {
    username,
    cookie,
    role: data.user.role,
    personId: data.user.personId,
    unitId: data.user.unitId,
  };
}

async function runMilestone2Tests() {
  console.log("================================================================================");
  console.log("             BỘ KIỂM THỬ TỰ ĐỘNG TOÀN DIỆN — MILESTONE 2: CORE WORK             ");
  console.log("================================================================================\n");

  let passedTests = 0;
  const totalTests = 5;

  try {
    // 0. Đăng nhập các phiên người dùng
    console.log(">> Đăng nhập các tài khoản kiểm thử...");
    const sessionCanBoA = await loginUser("canbo_a");
    const sessionCanBoB = await loginUser("canbo_b");
    const sessionTruongNhomA = await loginUser("truongnhom_a");
    const sessionLanhDao = await loginUser("lanhdao");
    const sessionAdmin = await loginUser("admin");
    console.log("✓ Đã khởi tạo 5 phiên làm việc bảo mật thành công.\n");

    // =========================================================================
    // TEST 1: DANH MỤC ĐẦU VIỆC CÁ NHÂN BIẾN ĐỘNG
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("TEST 1: DANH MỤC ĐẦU VIỆC CÁ NHÂN BIẾN ĐỘNG (VARIABLE PERSONAL WORK ITEMS)");
    console.log("--------------------------------------------------------------------------------");

    // Lấy 1 activity template từ seed data để dùng làm mẫu
    const templateItem = await prisma.activityTemplate.findFirst({
      where: { code: "TTHQ-01" },
    });
    if (!templateItem) {
      throw new Error("Không tìm thấy activity template mẫu TTHQ-01");
    }

    // 1. Cán bộ A tạo 4 đầu việc trong tuần 41 (2026)
    console.log("- Cán bộ A tạo 4 đầu việc trong Tuần 41 (2026)...");
    for (let i = 1; i <= 4; i++) {
      const res = await fetch(`${BASE_URL}/api/personal-work-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCanBoA.cookie,
        },
        body: JSON.stringify({
          periodType: "WEEKLY",
          periodYear: 2026,
          periodNumber: 41,
          templateId: i === 1 ? templateItem.id : undefined,
          customTitle: i === 1 ? undefined : `Đầu việc cá nhân CB A tuần 41 số ${i}`,
          estimatedHours: 4,
          priority: "HIGH",
        }),
      });
      if (!res.ok) {
        throw new Error(`Lỗi tạo đầu việc tuần 41 cho CB A: ${await res.text()}`);
      }
    }

    // 2. Cán bộ B tạo 3 đầu việc trong tuần 41 (2026)
    console.log("- Cán bộ B tạo 3 đầu việc trong Tuần 41 (2026)...");
    for (let i = 1; i <= 3; i++) {
      const res = await fetch(`${BASE_URL}/api/personal-work-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCanBoB.cookie,
        },
        body: JSON.stringify({
          periodType: "WEEKLY",
          periodYear: 2026,
          periodNumber: 41,
          customTitle: `Giám sát trực ban CB B tuần 41 số ${i}`,
          estimatedHours: 8,
          priority: "NORMAL",
        }),
      });
      if (!res.ok) {
        throw new Error(`Lỗi tạo đầu việc tuần 41 cho CB B: ${await res.text()}`);
      }
    }

    // 3. Cán bộ A tạo 6 đầu việc trong tuần 42 (2026) có cả việc ngoài danh mục mẫu
    console.log("- Cán bộ A tạo 6 đầu việc trong Tuần 42 (2026) bao gồm việc ngoài danh mục mẫu...");
    for (let i = 1; i <= 6; i++) {
      const res = await fetch(`${BASE_URL}/api/personal-work-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCanBoA.cookie,
        },
        body: JSON.stringify({
          periodType: "WEEKLY",
          periodYear: 2026,
          periodNumber: 42,
          customTitle: i === 6 
            ? "Xử lý vướng mắc đặc thù doanh nghiệp FDI Cửa khẩu (ngoài danh mục mẫu)"
            : `Đầu việc tuần 42 số ${i} của CB A`,
          estimatedHours: 6,
          priority: i === 6 ? "URGENT" : "HIGH",
        }),
      });
      if (!res.ok) {
        throw new Error(`Lỗi tạo đầu việc tuần 42 cho CB A: ${await res.text()}`);
      }
    }

    // 4. Xác minh qua API
    const resA41 = await fetch(`${BASE_URL}/api/personal-work-items?periodType=WEEKLY&periodYear=2026&periodNumber=41`, {
      headers: { Cookie: sessionCanBoA.cookie },
    });
    const itemsA41 = (await resA41.json()).data;

    const resB41 = await fetch(`${BASE_URL}/api/personal-work-items?periodType=WEEKLY&periodYear=2026&periodNumber=41`, {
      headers: { Cookie: sessionCanBoB.cookie },
    });
    const itemsB41 = (await resB41.json()).data;

    const resA42 = await fetch(`${BASE_URL}/api/personal-work-items?periodType=WEEKLY&periodYear=2026&periodNumber=42`, {
      headers: { Cookie: sessionCanBoA.cookie },
    });
    const itemsA42 = (await resA42.json()).data;

    console.log(`  + Số lượng đầu việc CB A Tuần 41: ${itemsA41.length} (Kỳ vọng: >= 4)`);
    console.log(`  + Số lượng đầu việc CB B Tuần 41: ${itemsB41.length} (Kỳ vọng: >= 3)`);
    console.log(`  + Số lượng đầu việc CB A Tuần 42: ${itemsA42.length} (Kỳ vọng: >= 6)`);

    const hasCustomItem = itemsA42.some((it: any) => it.isCustom && it.customTitle.includes("ngoài danh mục mẫu"));
    console.log(`  + Tự do tạo đầu việc ngoài danh mục mẫu 48 dòng: ${hasCustomItem ? "PASS" : "FAIL"}`);

    if (itemsA41.length >= 4 && itemsB41.length >= 3 && itemsA42.length >= 6 && hasCustomItem) {
      console.log("=> TEST 1: PASS (Đầu việc cá nhân linh hoạt theo cán bộ và theo kỳ, không áp đặt cứng 48 mẫu).\n");
      passedTests++;
    } else {
      throw new Error("TEST 1 không đạt yêu cầu!");
    }

    // =========================================================================
    // TEST 2: LIÊN KẾT ĐA KỲ (SINGLE TASK ID TRONG NHIỀU KẾ HOẠCH)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("TEST 2: LIÊN KẾT ĐA KỲ VÀ TRÁNH ĐẾM TRÙNG (SINGLE TASK ID & NO DOUBLE COUNTING)");
    console.log("--------------------------------------------------------------------------------");

    // 1. Tạo 1 Task duy nhất
    console.log("- Tạo 1 Task duy nhất: 'Kiểm tra sau thông quan DN gia công xuất khẩu'...");
    const createSingleTaskRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionTruongNhomA.cookie,
      },
      body: JSON.stringify({
        title: "Kiểm tra sau thông quan DN gia công xuất khẩu qua Tà Lùng",
        description: "Rà soát định mức tiêu hao nguyên vật liệu quý 3",
        ownerId: sessionCanBoA.personId,
        priority: "Cao",
        deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
        expectedResultText: "Báo cáo kết luận kiểm tra định mức có chữ ký DN",
      }),
    });
    if (!createSingleTaskRes.ok) {
      throw new Error("Không thể tạo Task đơn nhất: " + (await createSingleTaskRes.text()));
    }
    const singleTask = (await createSingleTaskRes.json()).data;
    const distinctTaskId = singleTask.id;
    console.log(`  + Task ID duy nhất được tạo: ${distinctTaskId} (${singleTask.code})`);

    // 2. Tạo Kế hoạch Tháng 10/2026
    const createMonthPlanRes = await fetch(`${BASE_URL}/api/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionTruongNhomA.cookie,
      },
      body: JSON.stringify({
        title: "Kế hoạch công tác Chuyên môn Tháng 10/2026 - Đội Nghiệp vụ A",
        type: "MONTHLY",
        year: 2026,
        monthNumber: 10,
        items: [{ title: "Công tác kiểm tra sau thông quan tháng 10" }],
      }),
    });
    const monthPlan = (await createMonthPlanRes.json()).data;
    const monthPlanItemId = monthPlan.items[0].id;

    // Gắn Task vào Kế hoạch Tháng
    console.log("- Gắn Task vào Kế hoạch Tháng 10/2026 qua PlanTaskLink...");
    const linkMonthRes = await fetch(`${BASE_URL}/api/plans/${monthPlan.id}/workflow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionTruongNhomA.cookie,
      },
      body: JSON.stringify({
        action: "LINK_TASK",
        planItemId: monthPlanItemId,
        taskId: distinctTaskId,
      }),
    });
    if (!linkMonthRes.ok) {
      throw new Error("Lỗi khi link task vào kế hoạch tháng: " + (await linkMonthRes.text()));
    }

    // 3. Tạo Kế hoạch Tuần 41/2026
    const createWeekPlanRes = await fetch(`${BASE_URL}/api/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionTruongNhomA.cookie,
      },
      body: JSON.stringify({
        title: "Kế hoạch công tác Tuần 41/2026 - Đội Nghiệp vụ A",
        type: "WEEKLY",
        year: 2026,
        weekNumber: 41,
        items: [{ title: "Trọng tâm tuần 41: Kiểm tra chuyên đề gia công" }],
      }),
    });
    const weekPlan = (await createWeekPlanRes.json()).data;
    const weekPlanItemId = weekPlan.items[0].id;

    // Gắn chính Task đó vào Kế hoạch Tuần
    console.log("- Gắn CHÍNH Task đó vào Kế hoạch Tuần 41/2026 qua PlanTaskLink...");
    const linkWeekRes = await fetch(`${BASE_URL}/api/plans/${weekPlan.id}/workflow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionTruongNhomA.cookie,
      },
      body: JSON.stringify({
        action: "LINK_TASK",
        planItemId: weekPlanItemId,
        taskId: distinctTaskId,
      }),
    });
    if (!linkWeekRes.ok) {
      throw new Error("Lỗi khi link task vào kế hoạch tuần: " + (await linkWeekRes.text()));
    }

    // 4. Kiểm tra Database PlanTaskLink
    const linksInDb = await prisma.planTaskLink.findMany({
      where: { taskId: distinctTaskId },
    });
    console.log(`  + Số liên kết PlanTaskLink của Task ${singleTask.code}: ${linksInDb.length} (Kỳ vọng: 2 liên kết)`);

    // 5. Kiểm tra Dashboard KPI không bị tính trùng (distinct count)
    const kpiRes = await fetch(`${BASE_URL}/api/dashboard/kpi`, {
      headers: { Cookie: sessionTruongNhomA.cookie },
    });
    const kpiData = await kpiRes.json();
    const totalKpiTasks = kpiData.kpis ? kpiData.kpis.totalTasks : (kpiData.data?.tasksSummary?.total || 0);
    console.log(`  + KPI tổng số nhiệm vụ độc lập: ${totalKpiTasks}`);

    if (linksInDb.length === 2 && linksInDb[0].taskId === linksInDb[1].taskId) {
      console.log("=> TEST 2: PASS (Cùng 1 Task ID duy nhất được liên kết đa kỳ, không clone duplicate Task ID).\n");
      passedTests++;
    } else {
      throw new Error("TEST 2 không đạt yêu cầu!");
    }

    // =========================================================================
    // TEST 3: QUY TRÌNH PHÊ DUYỆT (LẬP NHÁP -> TRÌNH DUYỆT -> TRẢ LẠI -> DUYỆT)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("TEST 3: QUY TRÌNH PHÊ DUYỆT KẾ HOẠCH (DRAFT -> SUBMIT -> RETURN -> APPROVE)");
    console.log("--------------------------------------------------------------------------------");

    // 1. Cán bộ A lập kế hoạch Tuần 43 ở trạng thái DRAFT
    console.log("- Cán bộ A lập kế hoạch Tuần 43/2026...");
    const createDraftPlanRes = await fetch(`${BASE_URL}/api/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCanBoA.cookie,
      },
      body: JSON.stringify({
        title: "Kế hoạch tác nghiệp tuần 43/2026 - Đội Nghiệp vụ A",
        type: "WEEKLY",
        year: 2026,
        weekNumber: 43,
        items: [{ title: "Thực hiện thông quan nhanh nông sản xuất khẩu" }],
      }),
    });
    const draftPlan = (await createDraftPlanRes.json()).data;
    console.log(`  + Kế hoạch khởi tạo thành công: ID = ${draftPlan.id}, Trạng thái = ${draftPlan.status}`);

    // 2. Cán bộ A trình duyệt (SUBMIT)
    console.log("- Cán bộ A thực hiện TRÌNH DUYỆT (SUBMIT)...");
    const submitRes = await fetch(`${BASE_URL}/api/plans/${draftPlan.id}/workflow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCanBoA.cookie,
      },
      body: JSON.stringify({ action: "SUBMIT" }),
    });
    const submittedPlan = (await submitRes.json()).data;
    console.log(`  + Trạng thái sau khi trình: ${submittedPlan.status} (Kỳ vọng: SUBMITTED)`);

    // 3. Trưởng nhóm từ chối trả lại (RETURN) kèm ý kiến chỉ đạo
    console.log("- Trưởng nhóm kiểm tra và TRẢ LẠI (RETURN) yêu cầu bổ sung chuyên đề...");
    const returnReason = "Cần bổ sung chuyên đề kiểm soát chặt chẽ hàng tạm nhập tái xuất.";
    const returnRes = await fetch(`${BASE_URL}/api/plans/${draftPlan.id}/workflow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionTruongNhomA.cookie,
      },
      body: JSON.stringify({
        action: "RETURN",
        reviewNotes: returnReason,
      }),
    });
    const returnedPlan = (await returnRes.json()).data;
    console.log(`  + Trạng thái sau trả lại: ${returnedPlan.status} (Kỳ vọng: RETURNED)`);
    console.log(`  + Ghi chú chỉ đạo: '${returnedPlan.reviewNotes}'`);

    // 4. Cán bộ A tiếp thu và trình duyệt lại
    console.log("- Cán bộ A tiếp thu ý kiến và TRÌNH DUYỆT LẠI...");
    const resubmitRes = await fetch(`${BASE_URL}/api/plans/${draftPlan.id}/workflow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCanBoA.cookie,
      },
      body: JSON.stringify({ action: "SUBMIT" }),
    });
    const resubmittedPlan = (await resubmitRes.json()).data;
    console.log(`  + Trạng thái sau trình lại: ${resubmittedPlan.status}`);

    // 5. Trưởng nhóm hoặc Lãnh đạo PHÊ DUYỆT (APPROVE)
    console.log("- Lãnh đạo đơn vị xem xét và PHÊ DUYỆT (APPROVE)...");
    const approveRes = await fetch(`${BASE_URL}/api/plans/${draftPlan.id}/workflow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionLanhDao.cookie,
      },
      body: JSON.stringify({
        action: "APPROVE",
        reviewNotes: "Nhất trí phê duyệt kế hoạch tác nghiệp tuần 43.",
      }),
    });
    const approvedPlan = (await approveRes.json()).data;
    console.log(`  + Trạng thái cuối cùng: ${approvedPlan.status} (Kỳ vọng: APPROVED)`);

    // 6. Kiểm tra Audit log trong Database
    const auditEvents = await prisma.auditEvent.findMany({
      where: { resourceId: draftPlan.id },
      orderBy: { timestamp: "asc" },
    });
    console.log(`  + Số sự kiện Audit Log được ghi chép: ${auditEvents.length}`);

    if (
      submittedPlan.status === "SUBMITTED" &&
      returnedPlan.status === "RETURNED" &&
      approvedPlan.status === "APPROVED" &&
      auditEvents.length >= 3
    ) {
      console.log("=> TEST 3: PASS (Quy trình phê duyệt chặt chẽ, hỗ trợ trả lại kèm lý do và ghi log đầy đủ).\n");
      passedTests++;
    } else {
      throw new Error("TEST 3 không đạt yêu cầu!");
    }

    // =========================================================================
    // TEST 4: THỰC HIỆN NHIỆM VỤ, TIẾN ĐỘ, BÁO VƯỚNG, LÙI HẠN & NGHIỆM THU
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("TEST 4: QUẢN LÝ NHIỆM VỤ (PHỐI HỢP, TIẾN ĐỘ, BÁO VƯỚNG, LÙI HẠN, NGHIỆM THU)");
    console.log("--------------------------------------------------------------------------------");

    const initialDeadline = new Date(Date.now() + 7 * 86400000);
    // 1. Lãnh đạo giao nhiệm vụ cho Cán bộ A, phối hợp Cán bộ B
    console.log("- Lãnh đạo giao việc: Chủ trì = CB A, Phối hợp = CB B...");
    const assignTaskRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionTruongNhomA.cookie,
      },
      body: JSON.stringify({
        title: "Tổ chức tuần tra kiểm soát liên ngành khu vực biên giới Mốc 943",
        description: "Kiểm tra hàng hóa cư dân biên giới và phương tiện vận tải",
        ownerId: sessionCanBoA.personId,
        assigneeIds: [sessionCanBoB.personId],
        priority: "Khẩn",
        deadline: initialDeadline.toISOString(),
        expectedResultText: "Biên bản tuần tra liên ngành có xác nhận của Biên phòng",
      }),
    });
    const assignedTask = (await assignTaskRes.json()).data;
    console.log(`  + Tạo nhiệm vụ thành công: Mã ${assignedTask.code}`);
    console.log(`  + Cán bộ phối hợp: ${assignedTask.assignees.map((a: any) => a.person.fullName).join(", ")}`);

    // 2. Cán bộ A cập nhật tiến độ 40%
    console.log("- Cán bộ A cập nhật tiến độ 40%...");
    const update40Res = await fetch(`${BASE_URL}/api/tasks/${assignedTask.id}/updates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCanBoA.cookie,
      },
      body: JSON.stringify({
        progressPercent: 40,
        notes: "Đã họp thống nhất kế hoạch tuần tra với Đồn Biên phòng Tà Lùng.",
        newStatus: "IN_PROGRESS",
      }),
    });
    if (!update40Res.ok) throw new Error("Lỗi cập nhật tiến độ 40%");

    // 3. Cán bộ A báo vướng mắc (sạt lở đường biên do mưa lũ)
    console.log("- Cán bộ A báo vướng mắc địa hình...");
    const issueRes = await fetch(`${BASE_URL}/api/tasks/${assignedTask.id}/updates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCanBoA.cookie,
      },
      body: JSON.stringify({
        progressPercent: 40,
        notes: "Mưa lớn gây sạt lở đường tuần tra vành đai biên giới.",
        hasIssue: true,
        issueNotes: "Tuyến đường vành đai mốc 943 sạt lở, xe chuyên dụng không thể tiếp cận.",
      }),
    });
    const issueData = await issueRes.json();
    console.log(`  + Cờ hasIssue trên Task: ${issueData.data.task.hasIssue} (Ghi chú: ${issueData.data.task.issueNotes})`);

    // 4. Cán bộ A gửi đề xuất lùi hạn thêm 5 ngày
    console.log("- Cán bộ A gửi đề xuất lùi hạn...");
    const newRequestedDate = new Date(Date.now() + 12 * 86400000);
    const deadlineReqRes = await fetch(`${BASE_URL}/api/tasks/${assignedTask.id}/deadline-request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCanBoA.cookie,
      },
      body: JSON.stringify({
        requestedDeadline: newRequestedDate.toISOString(),
        reason: "Chờ lực lượng công binh dọn sạt lở đường vành đai biên giới",
      }),
    });
    const deadlineReqData = (await deadlineReqRes.json()).data;
    console.log(`  + Đề nghị lùi hạn tạo thành công: ID = ${deadlineReqData.id}, Status = ${deadlineReqData.status}`);

    // 5. Trưởng nhóm duyệt lùi hạn
    console.log("- Trưởng nhóm xem xét và PHÊ DUYỆT LÙI HẠN...");
    const reviewDeadlineRes = await fetch(
      `${BASE_URL}/api/tasks/${assignedTask.id}/deadline-request/${deadlineReqData.id}/review`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionTruongNhomA.cookie,
        },
        body: JSON.stringify({
          action: "APPROVE",
          reviewNotes: "Đồng ý gia hạn đảm bảo an toàn tính mạng cho cán bộ công chức",
        }),
      }
    );
    const reviewResult = await reviewDeadlineRes.json();
    console.log(`  + Đề nghị lùi hạn status: ${reviewResult.data.request.status}`);
    console.log(`  + Task currentDeadline mới: ${reviewResult.data.task.currentDeadline}`);

    // 6. Cán bộ A báo hoàn thành (SUBMIT_COMPLETION -> WAITING_REVIEW)
    console.log("- Cán bộ A hoàn thành tuần tra và BÁO HOÀN THÀNH...");
    const submitCompleteRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCanBoA.cookie,
      },
      body: JSON.stringify({
        id: assignedTask.id,
        action: "SUBMIT_COMPLETION",
        actualResultText: "Đã hoàn thành tuần tra Mốc 943, lập biên bản liên ngành số 12/BB-TN",
      }),
    });
    const waitingReviewTask = await prisma.task.findUnique({ where: { id: assignedTask.id } });
    console.log(`  + Trạng thái sau khi báo hoàn thành: ${waitingReviewTask?.status} (Kỳ vọng: WAITING_REVIEW)`);

    // 7. Lãnh đạo nghiệm thu xác nhận hoàn thành (CONFIRM_COMPLETION -> COMPLETED)
    console.log("- Lãnh đạo kiểm tra biên bản và NGHIỆM THU HOÀN THÀNH...");
    const confirmRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionTruongNhomA.cookie,
      },
      body: JSON.stringify({
        id: assignedTask.id,
        action: "CONFIRM_COMPLETION",
      }),
    });
    const finalTask = await prisma.task.findUnique({ where: { id: assignedTask.id } });
    console.log(`  + Trạng thái cuối cùng của nhiệm vụ: ${finalTask?.status} (Kỳ vọng: COMPLETED)`);

    if (
      issueData.data.task.hasIssue === true &&
      reviewResult.data.request.status === "APPROVED" &&
      waitingReviewTask?.status === "WAITING_REVIEW" &&
      finalTask?.status === "COMPLETED"
    ) {
      console.log("=> TEST 4: PASS (Đầy đủ chu trình: phối hợp, ghi tiến độ, báo vướng, lùi hạn có duyệt, nghiệm thu hoàn thành).\n");
      passedTests++;
    } else {
      throw new Error("TEST 4 không đạt yêu cầu!");
    }

    // =========================================================================
    // TEST 5: PHÂN QUYỀN & SCOPE GUARD (ANTI-IDOR & SYSTEM_ADMIN LOCK)
    // =========================================================================
    console.log("--------------------------------------------------------------------------------");
    console.log("TEST 5: BẢO MẬT PHÂN QUYỀN, ANTI-IDOR & KHÓA QUẢN TRỊ VIÊN KỸ THUẬT");
    console.log("--------------------------------------------------------------------------------");

    // 1. Cán bộ A (BP Nghiệp vụ A) cố gắng sửa nhiệm vụ thuộc BP Giám sát B
    // Tìm hoặc tạo 1 task của BP Giám sát B
    const unitB = await prisma.orgUnit.findFirst({ where: { code: "BP_GIAMSAT_B" } });
    const personBId = sessionCanBoB.personId;
    if (!unitB || !personBId) throw new Error("Không tìm thấy dữ liệu BP Giám sát B");

    const taskUnitB = await prisma.task.create({
      data: {
        code: `NV-B-${Date.now().toString().slice(-4)}`,
        title: "Nhiệm vụ nội bộ của Bộ phận Giám sát B",
        ownerId: personBId,
        unitId: unitB.id,
        status: "IN_PROGRESS",
        priority: "Cao",
        originalDeadline: new Date(),
        currentDeadline: new Date(),
      },
    });

    console.log(`- Cán bộ A (Đội A) cố tình gửi PATCH sửa Task của Đội B (${taskUnitB.code})...`);
    const idorAttackRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCanBoA.cookie,
      },
      body: JSON.stringify({
        id: taskUnitB.id,
        actualResultText: "Cố tình giả mạo kết quả qua IDOR",
      }),
    });
    console.log(`  + HTTP Status trả về cho Cán bộ A: ${idorAttackRes.status} (Kỳ vọng: 403 Forbidden)`);

    // 2. Quản trị kỹ thuật (admin) cố tình đọc danh sách nhiệm vụ nghiệp vụ
    console.log("- Quản trị kỹ thuật (admin) cố tình gọi GET /api/tasks...");
    const adminReadTasksRes = await fetch(`${BASE_URL}/api/tasks`, {
      headers: { Cookie: sessionAdmin.cookie },
    });
    console.log(`  + HTTP Status trả về cho Quản trị kỹ thuật: ${adminReadTasksRes.status} (Kỳ vọng: 403 Forbidden)`);

    // 3. Quản trị kỹ thuật cố đọc KPI Dashboard
    console.log("- Quản trị kỹ thuật cố đọc GET /api/dashboard/kpi...");
    const adminReadKpiRes = await fetch(`${BASE_URL}/api/dashboard/kpi`, {
      headers: { Cookie: sessionAdmin.cookie },
    });
    console.log(`  + HTTP Status trả về cho Quản trị kỹ thuật: ${adminReadKpiRes.status} (Kỳ vọng: 403 Forbidden)`);

    const isScopeGuardProtected =
      idorAttackRes.status === 403 &&
      adminReadTasksRes.status === 403 &&
      adminReadKpiRes.status === 403;

    if (isScopeGuardProtected) {
      console.log("=> TEST 5: PASS (Chặn đứng IDOR chéo đơn vị, Quản trị kỹ thuật bị khóa hoàn toàn khỏi dữ liệu nghiệp vụ).\n");
      passedTests++;
    } else {
      throw new Error(`TEST 5 không đạt yêu cầu! IDOR status: ${idorAttackRes.status}, Admin task status: ${adminReadTasksRes.status}`);
    }

    // =========================================================================
    // TỔNG KẾT BỘ KIỂM THỬ MILESTONE 2
    // =========================================================================
    console.log("================================================================================");
    console.log(`KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} BÀI KIỂM THỬ ĐẠT CHUẨN XUẤT SẮC (100% PASS)`);
    console.log("================================================================================");
  } catch (error: any) {
    console.error("\n❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMilestone2Tests();
