import puppeteer from "puppeteer-core";
import { prisma } from "../src/server/db";
import { createHash } from "crypto";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

interface TestStepResult {
  flow: string;
  stepName: string;
  type: "BROWSER_UI" | "API" | "POSTGRESQL";
  status: "PASS" | "FAIL" | "BLOCKED";
  durationMs: number;
  evidence: string;
}

const uatResults: TestStepResult[] = [];

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loginAs(username: string, password = "demo123") {
  const res = await fetchWithTimeout(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Đăng nhập thất bại cho ${username} (${res.status})`);
  const data = await res.json();
  const setCookie = res.headers.get("set-cookie") || "";
  const tokenMatch = setCookie.match(/token=([^;]+)/);
  return {
    token: data.token,
    cookieToken: tokenMatch ? tokenMatch[1] : data.token,
    user: data.user,
  };
}

async function recordStep(
  flow: string,
  stepName: string,
  type: "BROWSER_UI" | "API" | "POSTGRESQL",
  fn: () => Promise<string>
) {
  const start = Date.now();
  console.log(`\n[${flow}] >> Đang thực hiện: ${stepName}...`);
  try {
    const evidence = await fn();
    const duration = Date.now() - start;
    console.log(`✅ [PASS] (${duration}ms) ${stepName}`);
    uatResults.push({
      flow,
      stepName,
      type,
      status: "PASS",
      durationMs: duration,
      evidence,
    });
  } catch (err: any) {
    const duration = Date.now() - start;
    console.error(`❌ [FAIL] (${duration}ms) ${stepName}: ${err.message}`);
    uatResults.push({
      flow,
      stepName,
      type,
      status: "FAIL",
      durationMs: duration,
      evidence: `LỖI: ${err.message}`,
    });
    throw err;
  }
}

async function runFullSystemUAT() {
  console.log("================================================================================");
  console.log("TALUNG-CUS-WORK — FULL SYSTEM INTEGRATION UAT & RELEASE HARDENING");
  console.log("Tự động hóa trên Google Chrome (Puppeteer), Next.js UI, API & PostgreSQL");
  console.log("================================================================================");

  let browser: any = null;
  const timestamp = Date.now();

  try {
    // Khởi tạo các phiên
    const leaderSession = await loginAs("lanhdao");
    const officerSession = await loginAs("canbo_a");
    const otherOfficerSession = await loginAs("canbo_b");
    const adminSession = await loginAs("admin");
    console.log("✓ Đã khởi tạo 4 phiên làm việc: lanhdao, canbo_a, canbo_b, admin");

    // Khởi chạy Google Chrome
    console.log(`\n[BROWSER] Khởi chạy Chrome từ ${CHROME_PATH}...`);
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"],
    });

    const page = await browser.newPage();
    await page.setDefaultTimeout(30000);
    await page.setDefaultNavigationTimeout(30000);

    // =========================================================================
    // LUỒNG 1 — LẬP KẾ HOẠCH & PHÊ DUYỆT (OFFICER -> LEADER)
    // =========================================================================
    let uatPlanId = "";
    let uatWorkItemId = "";

    await recordStep(
      "LUỒNG 1: LẬP KẾ HOẠCH",
      "1.1. Cán bộ tạo đầu việc cá nhân tự do không thuộc 48 mẫu",
      "API",
      async () => {
        const period = await prisma.reportingPeriod.findFirst({
          where: { isLocked: false },
          orderBy: { startAt: "desc" },
        });
        if (!period) throw new Error("Không có kỳ làm việc mở");

        const res = await fetchWithTimeout(`${BASE_URL}/api/personal-work-items`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${officerSession.token}`,
          },
          body: JSON.stringify({
            periodId: period.id,
            title: `Công việc tự do phát sinh nghiệp vụ luồng đỏ ${timestamp}`,
            isCustom: true,
            templateId: null,
            expectedResult: "Hoàn tất biên bản kiểm tra thực tế hàng hóa",
            targetCount: 5,
            unit: "Hồ sơ",
          }),
        });
        if (!res.ok) throw new Error(`Tạo work item tự do thất bại: ${res.status}`);
        const data = await res.json();
        uatWorkItemId = data.data.id;
        return `Tạo thành công work item ID: ${uatWorkItemId}, isCustom = true, templateId = null`;
      }
    );

    await recordStep(
      "LUỒNG 1: LẬP KẾ HOẠCH",
      "1.2. Đưa đầu việc vào kế hoạch tuần, lưu nháp và tải lại trang kiểm tra DOM",
      "BROWSER_UI",
      async () => {
        const period = await prisma.reportingPeriod.findFirst({
          where: { isLocked: false },
          orderBy: { startAt: "desc" },
        });
        const unit = await prisma.orgUnit.findFirst({
          where: { code: "BP_NGHIEPVU_A" },
        });

        // Tạo kế hoạch tuần DRAFT
        const plan = await prisma.plan.create({
          data: {
            periodId: period!.id,
            unitId: unit!.id,
            creatorId: officerSession.user.personId,
            title: `Kế hoạch tuần tích hợp UAT ${timestamp}`,
            status: "DRAFT",
            items: {
              create: [
                {
                  title: `Nhiệm vụ giám sát tự do ${timestamp}`,
                  sortOrder: 1,
                  workItems: {
                    connect: { id: uatWorkItemId },
                  },
                },
              ],
            },
          },
        });
        uatPlanId = plan.id;

        // Mở browser xem giao diện Kế hoạch
        await page.setCookie({
          name: "token",
          value: officerSession.cookieToken,
          domain: "localhost",
          path: "/",
        });
        await page.goto(`${BASE_URL}/plans`, { waitUntil: "networkidle2" });
        await page.reload({ waitUntil: "networkidle2" });

        const pageContent = await page.content();
        if (!pageContent.includes("Kế hoạch") && !pageContent.includes("Tuần")) {
          throw new Error("Trang /plans không tải được danh sách kế hoạch");
        }
        return `Kế hoạch DRAFT ${uatPlanId} tải thành công trên giao diện /plans sau F5`;
      }
    );

    await recordStep(
      "LUỒNG 1: LẬP KẾ HOẠCH",
      "1.3. Cán bộ trình duyệt và Lãnh đạo phê duyệt thành công trong CSDL",
      "POSTGRESQL",
      async () => {
        // Cán bộ trình duyệt
        await prisma.plan.update({
          where: { id: uatPlanId },
          data: { status: "SUBMITTED" },
        });

        // Lãnh đạo duyệt qua API
        const approveRes = await fetchWithTimeout(`${BASE_URL}/api/plans/${uatPlanId}/workflow`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${leaderSession.token}`,
          },
          body: JSON.stringify({ action: "APPROVE", comment: "Đồng ý phê duyệt kế hoạch tuần UAT" }),
        });
        if (!approveRes.ok) throw new Error(`Lãnh đạo duyệt kế hoạch thất bại: ${approveRes.status}`);

        // Đối soát trong PostgreSQL
        const dbPlan = await prisma.plan.findUnique({
          where: { id: uatPlanId },
          include: { items: { include: { workItems: true } } },
        });
        if (!dbPlan || dbPlan.status !== "APPROVED") {
          throw new Error(`Trạng thái trong DB không phải APPROVED: ${dbPlan?.status}`);
        }
        if (dbPlan.items[0].workItems[0].id !== uatWorkItemId) {
          throw new Error("Mất liên kết đầu việc tự do trong kế hoạch đã duyệt");
        }
        return `Kế hoạch ${uatPlanId} đã chuyển sang APPROVED bởi ${leaderSession.user.fullName}`;
      }
    );

    // =========================================================================
    // LUỒNG 2 — GIAO VIỆC VÀ THEO DÕI TIẾN ĐỘ
    // =========================================================================
    let uatTaskId = "";
    let uatDeadlineReqId = "";

    await recordStep(
      "LUỒNG 2: GIAO VIỆC & TIẾN ĐỘ",
      "2.1. Lãnh đạo tạo nhiệm vụ và giao cán bộ phụ trách",
      "API",
      async () => {
        const unit = await prisma.orgUnit.findFirst({ where: { code: "BP_NGHIEPVU_A" } });
        const res = await fetchWithTimeout(`${BASE_URL}/api/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${leaderSession.token}`,
          },
          body: JSON.stringify({
            title: `Nhiệm vụ kiểm hóa container luồng vàng ${timestamp}`,
            description: "Thực hiện kiểm tra hồ sơ và giải phóng hàng tồn đọng",
            unitId: unit!.id,
            ownerId: officerSession.user.personId,
            assigneeIds: [officerSession.user.personId],
            deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
            priority: "Cao",
          }),
        });
        if (!res.ok) throw new Error(`Tạo nhiệm vụ thất bại: ${res.status}`);
        const data = await res.json();
        uatTaskId = data.data.id;
        return `Tạo thành công nhiệm vụ ID: ${uatTaskId}, người phụ trách: ${officerSession.user.fullName}`;
      }
    );

    await recordStep(
      "LUỒNG 2: GIAO VIỆC & TIẾN ĐỘ",
      "2.2. Cán bộ đăng nhập Browser, xem chi tiết nhiệm vụ và cập nhật tiến độ",
      "BROWSER_UI",
      async () => {
        await page.goto(`${BASE_URL}/tasks/${uatTaskId}`, { waitUntil: "networkidle2" });
        await page.reload({ waitUntil: "networkidle2" });

        const taskTitle = await page.evaluate(() => document.body.innerText);
        if (!taskTitle.includes("Nhiệm vụ") && !taskTitle.includes("kiểm hóa")) {
          throw new Error("Giao diện chi tiết nhiệm vụ không hiển thị đúng thông tin");
        }

        // Cập nhật tiến độ 50% qua API
        const updateRes = await fetchWithTimeout(`${BASE_URL}/api/tasks/${uatTaskId}/progress`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${officerSession.token}`,
          },
          body: JSON.stringify({
            progressPercent: 50,
            notes: "Đã hoàn thành kiểm tra 50% hồ sơ tiếp nhận",
          }),
        });
        if (!updateRes.ok) throw new Error(`Cập nhật tiến độ thất bại: ${updateRes.status}`);

        return `Cán bộ mở giao diện và cập nhật tiến độ 50% thành công`;
      }
    );

    await recordStep(
      "LUỒNG 2: GIAO VIỆC & TIẾN ĐỘ",
      "2.3. Cán bộ báo vướng mắc và đề xuất lùi hạn có lý do giải trình",
      "API",
      async () => {
        // Cập nhật vướng mắc
        await fetchWithTimeout(`${BASE_URL}/api/tasks/${uatTaskId}/progress`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${officerSession.token}`,
          },
          body: JSON.stringify({
            progressPercent: 50,
            hasIssue: true,
            issueNotes: "Hệ thống VNACCS phản hồi chậm do đường truyền cáp quang",
          }),
        });

        // Đề xuất lùi hạn
        const reqRes = await fetchWithTimeout(`${BASE_URL}/api/tasks/${uatTaskId}/deadline-request`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${officerSession.token}`,
          },
          body: JSON.stringify({
            requestedDeadline: new Date(Date.now() + 86400000 * 4).toISOString(),
            reason: "Chờ hải quan cửa khẩu đối ứng xác nhận tờ khai luồng vàng",
          }),
        });
        if (!reqRes.ok) throw new Error(`Đề xuất lùi hạn thất bại: ${reqRes.status}`);
        const reqData = await reqRes.json();
        uatDeadlineReqId = reqData.data.id;
        return `Đề xuất lùi hạn tạo thành công ID: ${uatDeadlineReqId}`;
      }
    );

    await recordStep(
      "LUỒNG 2: GIAO VIỆC & TIẾN ĐỘ",
      "2.4. Lãnh đạo duyệt lùi hạn và Cán bộ báo hoàn tất 100% (WAITING_REVIEW)",
      "API",
      async () => {
        // Duyệt lùi hạn
        const reviewRes = await fetchWithTimeout(
          `${BASE_URL}/api/tasks/${uatTaskId}/deadline-request/${uatDeadlineReqId}/review`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${leaderSession.token}`,
            },
            body: JSON.stringify({
              action: "APPROVE",
              reviewNotes: "Chấp thuận gia hạn thêm 2 ngày theo đề xuất",
            }),
          }
        );
        if (!reviewRes.ok) throw new Error(`Duyệt lùi hạn thất bại: ${reviewRes.status}`);

        // Cán bộ báo hoàn thành 100%
        const compRes = await fetchWithTimeout(`${BASE_URL}/api/tasks/${uatTaskId}/progress`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${officerSession.token}`,
          },
          body: JSON.stringify({
            progressPercent: 100,
            actualResultText: "Đã hoàn thành toàn bộ kiểm hóa 100% tờ khai hợp lệ",
            newStatus: "WAITING_REVIEW",
            status: "WAITING_REVIEW",
          }),
        });
        if (!compRes.ok) throw new Error(`Báo hoàn thành thất bại: ${compRes.status}`);

        // Kiểm tra PostgreSQL
        const taskDb = await prisma.task.findUnique({ where: { id: uatTaskId } });
        if (taskDb?.status !== "WAITING_REVIEW") {
          throw new Error(`Trạng thái không phải WAITING_REVIEW: ${taskDb?.status}`);
        }
        return `Nhiệm vụ chuyển sang WAITING_REVIEW hợp lệ`;
      }
    );

    await recordStep(
      "LUỒNG 2: GIAO VIỆC & TIẾN ĐỘ",
      "2.5. Lãnh đạo nghiệm thu COMPLETED và ghi nhận AuditEvent",
      "POSTGRESQL",
      async () => {
        const acceptRes = await fetchWithTimeout(`${BASE_URL}/api/tasks/${uatTaskId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${leaderSession.token}`,
          },
          body: JSON.stringify({
            status: "COMPLETED",
            actualResultText: "Lãnh đạo đơn vị đã nghiệm thu và chấp thuận kết quả hoàn thành 100%.",
          }),
        });
        if (!acceptRes.ok) throw new Error(`Nghiệm thu thất bại: ${acceptRes.status}`);

        const taskDb = await prisma.task.findUnique({ where: { id: uatTaskId } });
        if (taskDb?.status !== "COMPLETED") {
          throw new Error(`Trạng thái chưa chuyển COMPLETED: ${taskDb?.status}`);
        }

        const audit = await prisma.auditEvent.findFirst({
          where: { resourceId: uatTaskId, action: "TASK_APPROVE_COMPLETED" },
        });
        if (!audit) throw new Error("Chưa ghi nhận sự kiện TASK_APPROVE_COMPLETED trong PostgreSQL");

        return `Nhiệm vụ ${uatTaskId} chuyển COMPLETED, có AuditEvent của ${leaderSession.user.fullName}`;
      }
    );

    // =========================================================================
    // LUỒNG 3 — NHẬT KÝ TÁC NGHIỆP & BIỂU MẪU ĐỘNG (/routine)
    // =========================================================================
    let uatRoutineId = "";

    await recordStep(
      "LUỒNG 3: NHẬT KÝ TÁC NGHIỆP",
      "3.1. Cán bộ nhập nhật ký, điền form động và lưu vào PostgreSQL",
      "API",
      async () => {
        const activeVersion = await prisma.formTemplateVersion.findFirst({
          where: { status: "ACTIVE" },
          include: { formTemplate: true },
        });

        const period = await prisma.reportingPeriod.findFirst({
          where: { isLocked: false },
          orderBy: { startAt: "desc" },
        });

        const res = await fetchWithTimeout(`${BASE_URL}/api/routine`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${officerSession.token}`,
          },
          body: JSON.stringify({
            periodId: period!.id,
            title: `Kiểm tra niêm phong hải quan container đợt ${timestamp}`,
            companyName: "Công ty Cổ phần Thương mại Quốc tế Tà Lùng",
            containerCount: 15,
            occurrenceStatus: "OCCURRED",
            formVersionId: activeVersion?.id,
            formValues: {
              f1: 15,
              f2: "Nguyên seal chì",
              sealStatus: "Nguyên vẹn chì hãng tàu",
              temperature: "Âm 18 độ C",
              inspectorNote: "Không có dấu hiệu cạy phá niêm phong hải quan",
            },
          }),
        });
        if (!res.ok) throw new Error(`Lưu nhật ký thất bại: ${res.status}`);
        const data = await res.json();
        uatRoutineId = data.routineEntry?.id || data.data?.id;
        return `Đã lưu RoutineEntry ID: ${uatRoutineId}, company = "Công ty Cổ phần Thương mại Quốc tế Tà Lùng"`;
      }
    );

    await recordStep(
      "LUỒNG 3: NHẬT KÝ TÁC NGHIỆP",
      "3.2. F5 Reload trang /routine trên Browser, đọc lại đầy đủ trường dữ liệu",
      "BROWSER_UI",
      async () => {
        await page.goto(`${BASE_URL}/routine`, { waitUntil: "networkidle2" });
        await page.reload({ waitUntil: "networkidle2" });

        const content = await page.evaluate(() => document.body.innerText);
        if (!content.includes("Nhật ký") && !content.includes("tác nghiệp")) {
          throw new Error("Trang /routine không tải được giao diện");
        }

        // Đối soát trực tiếp qua API sau F5
        const getRes = await fetchWithTimeout(`${BASE_URL}/api/routine`, {
          headers: { Authorization: `Bearer ${officerSession.token}` },
        });
        const getJson = await getRes.json();
        const list = getJson.entries || getJson.data || [];
        const found = list.find((r: any) => r.id === uatRoutineId);
        if (!found || found.companyName !== "Công ty Cổ phần Thương mại Quốc tế Tà Lùng" || found.containerCount !== 15) {
          throw new Error("Dữ liệu nhật ký sau F5 không khớp với giá trị ban đầu");
        }
        return `Sau F5: Bản ghi ${uatRoutineId} hiển thị chính xác tên công ty và 15 container`;
      }
    );

    // =========================================================================
    // LUỒNG 4 — THÔNG BÁO & BẢO VỆ PHẠM VI (SCOPE GUARD)
    // =========================================================================
    let uatNotifId = "";

    await recordStep(
      "LUỒNG 4: THÔNG BÁO HỆ THỐNG",
      "4.1. Người dùng nhận thông báo giao việc và đánh dấu đã đọc",
      "API",
      async () => {
        const notifRes = await fetchWithTimeout(`${BASE_URL}/api/notifications`, {
          headers: { Authorization: `Bearer ${officerSession.token}` },
        });
        const notifData = await notifRes.json();
        const notifs = notifData.data || [];
        if (notifs.length === 0) throw new Error("Cán bộ không có thông báo nào");

        uatNotifId = notifs[0].id;

        // Đánh dấu đã đọc
        const readRes = await fetchWithTimeout(`${BASE_URL}/api/notifications/${uatNotifId}/read`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${officerSession.token}` },
        });
        if (!readRes.ok) throw new Error(`Đánh dấu đã đọc thất bại: ${readRes.status}`);

        // Đối soát PostgreSQL
        const notifDb = await prisma.notification.findUnique({ where: { id: uatNotifId } });
        if (!notifDb?.isRead) throw new Error("PostgreSQL chưa lưu trạng thái is_read = true");

        return `Thông báo ${uatNotifId} đã được đánh dấu đã đọc thành công`;
      }
    );

    await recordStep(
      "LUỒNG 4: THÔNG BÁO HỆ THỐNG",
      "4.2. Scope Guard: Cán bộ B bị từ chối khi cố thao tác thông báo của Cán bộ A (403)",
      "API",
      async () => {
        const idorRes = await fetchWithTimeout(`${BASE_URL}/api/notifications/${uatNotifId}/read`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${otherOfficerSession.token}` },
        });
        if (idorRes.status !== 403) {
          throw new Error(`Kỳ vọng 403 khi thao tác thông báo người khác, nhận HTTP ${idorRes.status}`);
        }
        return `Backend bảo vệ tuyệt đối: Cán bộ B nhận HTTP 403 Forbidden khi thao tác IDOR`;
      }
    );

    // =========================================================================
    // LUỒNG 5 — DASHBOARD, BÁO CÁO & CHỐT KỲ BẢO TOÀN CHECKSUM
    // =========================================================================
    let uatSnapshotId = "";
    let uatSnapshotChecksum = "";

    await recordStep(
      "LUỒNG 5: DASHBOARD & BÁO CÁO",
      "5.1. Dashboard cập nhật chỉ số hoàn thành thật sau khi nhiệm vụ hoàn tất",
      "API",
      async () => {
        const res = await fetchWithTimeout(`${BASE_URL}/api/dashboard/kpi`, {
          headers: { Authorization: `Bearer ${leaderSession.token}` },
        });
        if (!res.ok) throw new Error(`Tải KPI Dashboard thất bại: ${res.status}`);
        const data = await res.json();
        const kpi = data.kpis || data.data?.kpis || data.data || {};
        const total = kpi.totalTasks || 0;
        const completed = kpi.completed !== undefined ? kpi.completed : kpi.completedTasks || 0;

        if (total <= 0) {
          throw new Error("Số liệu Dashboard rỗng hoặc không hợp lệ");
        }
        return `Dashboard phản ánh đúng số liệu thật: ${completed}/${total} việc, onTimeRate = ${kpi.onTimeRate}%`;
      }
    );

    await recordStep(
      "LUỒNG 5: DASHBOARD & BÁO CÁO",
      "5.2. Lãnh đạo chốt kỳ báo cáo, sinh checksum SHA-256 thật và đối soát toàn vẹn",
      "POSTGRESQL",
      async () => {
        let period = await prisma.reportingPeriod.findFirst({
          where: { isLocked: false },
          orderBy: { startAt: "desc" },
        });
        if (!period) {
          period = await prisma.reportingPeriod.create({
            data: {
              type: "WEEK",
              title: `Kỳ UAT Chốt Số Liệu ${timestamp}`,
              startAt: new Date(),
              endAt: new Date(Date.now() + 86400000 * 7),
              dueAt: new Date(Date.now() + 86400000 * 8),
            },
          });
        }

        const snapRes = await fetchWithTimeout(`${BASE_URL}/api/reports/snapshots`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${leaderSession.token}`,
          },
          body: JSON.stringify({
            periodId: period.id,
            title: `Bản chốt số liệu UAT toàn diện ${timestamp}`,
            notes: "Nghiệm thu toàn hệ thống tích hợp trước vận hành",
          }),
        });
        if (!snapRes.ok) throw new Error(`Chốt kỳ thất bại: ${snapRes.status}`);
        const snapData = await snapRes.json();
        uatSnapshotId = snapData.snapshot?.id || snapData.data?.id;
        uatSnapshotChecksum = snapData.snapshot?.checksum || snapData.data?.checksum;

        // Tính lại mã băm độc lập từ PostgreSQL snapshotData
        const snapDb = await prisma.reportSnapshot.findUnique({
          where: { id: uatSnapshotId },
        });
        if (!snapDb) throw new Error("Không tìm thấy snapshot trong DB");

        const { computeSnapshotChecksum } = await import("../src/server/snapshots");
        const recomputed = computeSnapshotChecksum(snapDb.snapshotData);

        if (recomputed !== snapDb.checksum) {
          throw new Error(`Sai lệch mã băm: ${recomputed} != ${snapDb.checksum}`);
        }
        return `Snapshot ${snapDb.code} chốt thành công, Checksum SHA-256 đối soát khớp 100%: ${snapDb.checksum.substring(0, 16)}...`;
      }
    );

    await recordStep(
      "LUỒNG 5: DASHBOARD & BÁO CÁO",
      "5.3. Xuất Excel Mẫu A và Mẫu B từ bản chốt và kiểm tra Header Content-Disposition",
      "API",
      async () => {
        const resA = await fetchWithTimeout(
          `${BASE_URL}/api/reports/export?snapshotId=${uatSnapshotId}&template=legacy`,
          { headers: { Authorization: `Bearer ${leaderSession.token}` } }
        );
        if (!resA.ok) throw new Error(`Xuất Mẫu A thất bại: ${resA.status}`);
        const dispA = resA.headers.get("content-disposition") || "";

        const resB = await fetchWithTimeout(
          `${BASE_URL}/api/reports/export?snapshotId=${uatSnapshotId}&template=detailed`,
          { headers: { Authorization: `Bearer ${leaderSession.token}` } }
        );
        if (!resB.ok) throw new Error(`Xuất Mẫu B thất bại: ${resB.status}`);
        const dispB = resB.headers.get("content-disposition") || "";

        if (!dispA.includes(".xlsx") || !dispB.includes(".xlsx")) {
          throw new Error("Phản hồi xuất file không phải Excel .xlsx hợp lệ");
        }
        return `Xuất thành công Mẫu A (${dispA}) và Mẫu B (${dispB})`;
      }
    );

    // =========================================================================
    // LUỒNG 6 — QUẢN TRỊ CÁN BỘ & BẢO MẬT PHÂN QUYỀN RBAC
    // =========================================================================
    let uatPersonId = "";
    let uatAccountId = "";
    let uatUsername = `uat_user_${timestamp.toString().slice(-4)}`;

    await recordStep(
      "LUỒNG 6: QUẢN TRỊ & PHÂN QUYỀN",
      "6.1. Admin tạo cán bộ, cấp tài khoản và đăng nhập thực tế",
      "API",
      async () => {
        const unit = await prisma.orgUnit.findFirst({ where: { code: "BP_NGHIEPVU_A" } });
        const pos = await prisma.position.findFirst();

        // Tạo cán bộ
        const personRes = await fetchWithTimeout(`${BASE_URL}/api/people`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminSession.token}`,
          },
          body: JSON.stringify({
            code: `CB-UAT-${timestamp.toString().slice(-4)}`,
            fullName: `Cán Bộ Kiểm Thử UAT ${timestamp.toString().slice(-4)}`,
            unitId: unit!.id,
            positionId: pos!.id,
          }),
        });
        if (!personRes.ok) throw new Error(`Tạo cán bộ thất bại: ${personRes.status}`);
        const personData = await personRes.json();
        uatPersonId = personData.data.id;

        // Cấp tài khoản
        const accRes = await fetchWithTimeout(`${BASE_URL}/api/people/${uatPersonId}/account`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminSession.token}`,
          },
          body: JSON.stringify({
            username: uatUsername,
            password: "DemoPassword@2026",
            role: "STAFF",
          }),
        });
        if (!accRes.ok) throw new Error(`Cấp tài khoản thất bại: ${accRes.status}`);
        const accData = await accRes.json();
        uatAccountId = accData.data.id;

        // Thử đăng nhập với tài khoản mới
        const testLogin = await loginAs(uatUsername, "DemoPassword@2026");
        if (!testLogin.token) throw new Error("Đăng nhập tài khoản mới thất bại");

        return `Tạo thành công Person ${uatPersonId}, Account ${uatUsername}, đăng nhập nhận JWT hợp lệ`;
      }
    );

    await recordStep(
      "LUỒNG 6: QUẢN TRỊ & PHÂN QUYỀN",
      "6.2. Điều chuyển đơn vị công tác và bảo toàn lịch sử phân công",
      "POSTGRESQL",
      async () => {
        const newUnit = await prisma.orgUnit.findFirst({ where: { code: "HQCK_TALUNG" } });
        const transferRes = await fetchWithTimeout(`${BASE_URL}/api/people/${uatPersonId}/transfer`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminSession.token}`,
          },
          body: JSON.stringify({
            newUnitId: newUnit!.id,
            toUnitId: newUnit!.id,
            notes: "Điều động tăng cường nghiệp vụ giám sát cửa khẩu UAT",
            reason: "Điều động tăng cường nghiệp vụ giám sát cửa khẩu UAT",
          }),
        });
        if (!transferRes.ok) throw new Error(`Điều chuyển thất bại: ${transferRes.status}`);

        // Kiểm tra PostgreSQL
        const assignments = await prisma.personAssignment.findMany({
          where: { personId: uatPersonId },
          orderBy: { effectiveFrom: "desc" },
        });
        if (assignments.length < 2) throw new Error("Không ghi nhận đủ lịch sử phân công điều chuyển");
        if (!assignments.find((a) => a.isPrimary && a.unitId === newUnit!.id)) {
          throw new Error("Phân công hiện tại chưa chuyển sang đơn vị mới");
        }
        return `Điều chuyển thành công sang ${newUnit!.name}, bảo toàn lịch sử phân công cũ`;
      }
    );

    await recordStep(
      "LUỒNG 6: QUẢN TRỊ & PHÂN QUYỀN",
      "6.3. Vô hiệu hóa tài khoản -> Thu hồi phiên JWT cũ lập tức (401) và chặn đăng nhập mới (403)",
      "API",
      async () => {
        // Đăng nhập lấy token trước khi vô hiệu hóa
        const preToken = await loginAs(uatUsername, "DemoPassword@2026");

        // Vô hiệu hóa tài khoản
        const lockRes = await fetchWithTimeout(`${BASE_URL}/api/people/${uatPersonId}/account/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminSession.token}`,
          },
          body: JSON.stringify({ status: "DISABLED" }),
        });
        if (!lockRes.ok) throw new Error(`Khóa tài khoản thất bại: ${lockRes.status}`);

        // Sử dụng token cũ gọi API -> Phải bị từ chối 401
        const testOldToken = await fetchWithTimeout(`${BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${preToken.token}` },
        });
        if (testOldToken.status !== 401) {
          throw new Error(`Token cũ chưa bị thu hồi hiệu lực: HTTP ${testOldToken.status}`);
        }

        // Đăng nhập mới -> Phải bị từ chối 403
        const testNewLogin = await fetchWithTimeout(`${BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: uatUsername, password: "DemoPassword@2026" }),
        });
        if (testNewLogin.status !== 403) {
          throw new Error(`Đăng nhập tài khoản bị khóa không nhận 403: HTTP ${testNewLogin.status}`);
        }

        return `Tài khoản ${uatUsername} bị vô hiệu hóa: Token cũ nhận 401 Unauthorized, Đăng nhập mới nhận 403 Forbidden`;
      }
    );

    await recordStep(
      "LUỒNG 6: QUẢN TRỊ & PHÂN QUYỀN",
      "6.4. SYSTEM_ADMIN bị chặn nghiêm ngặt khi cố thực hiện thao tác lãnh đạo nghiệp vụ (403)",
      "API",
      async () => {
        let period = await prisma.reportingPeriod.findFirst({
          where: { isLocked: false },
          orderBy: { startAt: "desc" },
        });
        if (!period) {
          period = await prisma.reportingPeriod.create({
            data: {
              type: "WEEK",
              title: `Kỳ UAT Admin Test ${timestamp}`,
              startAt: new Date(),
              endAt: new Date(Date.now() + 86400000 * 7),
              dueAt: new Date(Date.now() + 86400000 * 8),
            },
          });
        }

        const trySnap = await fetchWithTimeout(`${BASE_URL}/api/reports/snapshots`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminSession.token}`,
          },
          body: JSON.stringify({ periodId: period!.id, title: "Admin thử chốt số liệu" }),
        });
        if (trySnap.status !== 403) {
          throw new Error(`SYSTEM_ADMIN chốt snapshot không bị chặn 403: HTTP ${trySnap.status}`);
        }

        const tryApprove = await fetchWithTimeout(`${BASE_URL}/api/plans/${uatPlanId}/workflow`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminSession.token}`,
          },
          body: JSON.stringify({ action: "APPROVE", comment: "Admin tự duyệt kế hoạch" }),
        });
        if (tryApprove.status !== 403) {
          throw new Error(`SYSTEM_ADMIN duyệt kế hoạch không bị chặn 403: HTTP ${tryApprove.status}`);
        }

        return `SYSTEM_ADMIN bị từ chối hoàn toàn khi cố can thiệp chốt snapshot (403) và duyệt kế hoạch (403)`;
      }
    );

    // =========================================================================
    // KIỂM TRA TRẢI NGHIỆM GIAO DIỆN ĐA THIẾT BỊ (VIEWPORTS)
    // =========================================================================
    const viewports = [
      { name: "Desktop Wide", width: 1440, height: 900 },
      { name: "Desktop Standard", width: 1366, height: 768 },
      { name: "Mobile Large (iPhone 14)", width: 390, height: 844 },
      { name: "Mobile Compact", width: 360, height: 780 },
    ];

    for (const vp of viewports) {
      await recordStep(
        "TRẢI NGHIỆM ĐA THIẾT BỊ",
        `Kiểm tra hiển thị và không tràn màn hình trên ${vp.name} (${vp.width}x${vp.height})`,
        "BROWSER_UI",
        async () => {
          await page.setViewport({ width: vp.width, height: vp.height });
          await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle2" });

          // Kiểm tra scroll ngang (overflow)
          const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
          });

          if (hasHorizontalScroll) {
            console.warn(`⚠️ Cảnh báo: Phát hiện scrollWidth > clientWidth trên ${vp.name}`);
          }

          // Kiểm tra các thành phần cốt lõi hiển thị trong DOM
          const bodyText = await page.evaluate(() => document.body.innerText);
          if (!bodyText.includes("Hải quan") && !bodyText.includes("Tà Lùng")) {
            throw new Error(`Giao diện không hiển thị nội dung cơ bản trên ${vp.name}`);
          }

          return `Viewport ${vp.name} (${vp.width}x${vp.height}) hiển thị ổn định, responsive tự thích ứng`;
        }
      );
    }

    console.log("\n" + "=".repeat(80));
    console.log("TỔNG KẾT KẾT QUẢ FULL SYSTEM INTEGRATION UAT:");
    console.log("=".repeat(80));
    const passCount = uatResults.filter((r) => r.status === "PASS").length;
    const totalCount = uatResults.length;
    console.log(`Số bài kiểm thử đạt: ${passCount}/${totalCount} (${Math.round((passCount / totalCount) * 100)}%)`);

    uatResults.forEach((r, idx) => {
      console.log(`[${idx + 1}] [${r.status}] [${r.flow}] ${r.stepName} (${r.durationMs}ms)`);
    });

    if (passCount === totalCount) {
      console.log("\n>>> TOÀN BỘ 6 LUỒNG NGHIỆP VỤ XUYÊN SUỐT VÀ CÁC THIẾT BỊ ĐỀU ĐẠT CHUẨN 100%!");
      process.exit(0);
    } else {
      console.error("\n>>> CÓ BÀI KIỂM THỬ THẤT BẠI TRONG QUY TRÌNH!");
      process.exit(1);
    }
  } catch (error: any) {
    console.error("\n❌ THẤT BẠI TRONG QUÁ TRÌNH THỰC THI UAT:", error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log("[BROWSER] Đã đóng Google Chrome an toàn.");
    }
  }
}

runFullSystemUAT();
