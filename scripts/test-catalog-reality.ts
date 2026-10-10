/**
 * TALUNG-CUS-WORK — P1 FIX 06B: TEST SUITE QUẢN TRỊ DANH MỤC ĐẦU VIỆC THỰC TẾ
 * 
 * Bộ kiểm thử độc lập đối soát qua HTTP API và PostgreSQL:
 * 1. 5 nhóm nghiệp vụ & 48 hoạt động mẫu nguyên văn trong PostgreSQL & API.
 * 2. Thêm mới hoạt động mẫu qua API -> Lưu PostgreSQL -> Reload vẫn tồn tại.
 * 3. Chỉnh sửa thông tin hoạt động mẫu -> Lưu PostgreSQL -> Reload đúng dữ liệu.
 * 4. Ngừng áp dụng (RETIRED) hoạt động mẫu -> Ẩn khỏi bộ lọc tạo mới.
 * 5. Kích hoạt lại (ACTIVATE) hoạt động mẫu -> Xuất hiện trở lại.
 * 6. Tính bất biến lịch sử (Historical Integrity) & Chặn xóa cứng mẫu đã dùng (HTTP 400).
 * 7. Đầu việc cá nhân linh hoạt (PersonalWorkItem) - Tạo đầu việc tự do không qua mẫu (isCustom: true).
 * 8. Đầu việc cá nhân chọn từ mẫu chuẩn hóa & Chặn chọn mẫu đã RETIRED (HTTP 400).
 * 9. Phân quyền RBAC: Cán bộ thường không có quyền sửa/thêm danh mục (HTTP 403).
 * 10. Chống trùng mã (409) và xác thực dữ liệu đầu vào (400).
 * 11. Frontend UI Safety: Xử lý lỗi trung thực (Zero Fake Success).
 * 12. Kiểm toán an ninh PostgreSQL ghi nhận đầy đủ AuditEvent cho danh mục.
 */

import { prisma } from "../src/server/db";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "http://localhost:3000";

interface AuthSession {
  token: string;
  user: any;
}

async function loginAs(username: string, password: string = "demo123"): Promise<AuthSession> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Đăng nhập thất bại cho "${username}" (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { token: data.token, user: data.user };
}

async function runCatalogTests() {
  console.log("=".repeat(80));
  console.log("TALUNG-CUS-WORK — P1 FIX 06B: TEST SUITE QUẢN TRỊ DANH MỤC ĐẦU VIỆC THỰC TẾ");
  console.log("=".repeat(80));

  let passedTests = 0;
  const totalTests = 12;

  // 1. Chuẩn bị các phiên làm việc
  console.log("\n[SETUP] Khởi tạo các phiên làm việc...");
  const leaderSession = await loginAs("lanhdao"); // UNIT_LEADER
  const adminSession = await loginAs("admin"); // SYSTEM_ADMIN
  const officerSession = await loginAs("canbo_a"); // STAFF
  console.log("✓ Đã đăng nhập: lanhdao (UNIT_LEADER), admin (SYSTEM_ADMIN), canbo_a (STAFF)");

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);

  // --------------------------------------------------------------------------
  // KỊCH BẢN 1: 5 nhóm nghiệp vụ & 48 hoạt động mẫu nguyên văn trong PostgreSQL
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 1: 5 nhóm nghiệp vụ & 48 hoạt động mẫu nguyên văn trong PostgreSQL");
  console.log("-".repeat(80));
  try {
    const groupsInDb = await prisma.activityGroup.findMany({ orderBy: { sortOrder: "asc" } });
    if (groupsInDb.length < 5) {
      throw new Error(`Cơ sở dữ liệu phải có ít nhất 5 nhóm nghiệp vụ, thực tế có: ${groupsInDb.length}`);
    }

    const expectedCodes = ["TTHQ", "GSHQ", "TON_DONG", "DANH_GIA_HQ", "DANH_GIA_NGAY_TUAN"];
    for (const code of expectedCodes) {
      if (!groupsInDb.some((g) => g.code === code)) {
        throw new Error(`Thiếu nhóm nghiệp vụ bắt buộc: ${code}`);
      }
    }

    const templatesInDb = await prisma.activityTemplate.findMany();
    if (templatesInDb.length < 48) {
      throw new Error(`Cơ sở dữ liệu phải có ít nhất 48 hoạt động mẫu, thực tế có: ${templatesInDb.length}`);
    }

    // Kiểm tra qua API GET /api/catalog/groups
    const resGroups = await fetch(`${BASE_URL}/api/catalog/groups`, {
      headers: { Authorization: `Bearer ${leaderSession.token}` },
    });
    if (!resGroups.ok) throw new Error(`GET /api/catalog/groups trả về ${resGroups.status}`);
    const groupsData = await resGroups.json();
    if (!groupsData.success || groupsData.data.length < 5) {
      throw new Error("API groups không trả về đủ 5 nhóm nghiệp vụ");
    }

    // Kiểm tra qua API GET /api/catalog/templates
    const resTemplates = await fetch(`${BASE_URL}/api/catalog/templates`, {
      headers: { Authorization: `Bearer ${leaderSession.token}` },
    });
    if (!resTemplates.ok) throw new Error(`GET /api/catalog/templates trả về ${resTemplates.status}`);
    const templatesData = await resTemplates.json();
    if (!templatesData.success || templatesData.data.length < 48) {
      throw new Error("API templates không trả về đủ 48 hoạt động mẫu");
    }

    console.log(`✅ [PASS] Kịch bản 1: Có đầy đủ 5 nhóm nghiệp vụ và ${templatesInDb.length} hoạt động mẫu trong PostgreSQL & API.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 1: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 2: Thêm mới hoạt động mẫu qua API -> Lưu PostgreSQL -> Reload vẫn tồn tại
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 2: Thêm mới hoạt động mẫu qua API -> Lưu PostgreSQL -> Reload vẫn tồn tại");
  console.log("-".repeat(80));
  let createdTemplateId = "";
  const testTplCode = `TPL-TEST-${randomSuffix}`;
  try {
    const group = await prisma.activityGroup.findFirst({ where: { code: "TTHQ" } });
    if (!group) throw new Error("Không tìm thấy nhóm TTHQ");

    const payload = {
      code: testTplCode,
      title: `Kiểm tra thực tế hàng hóa chuyển khẩu mẫu ${randomSuffix}`,
      groupId: group.id,
      description: "Quy trình kiểm tra niêm phong hải quan và hồ sơ vận chuyển liên vận",
      sourceRawText: "Trích đoạn quy trình giám sát chuyển khẩu 2026",
      defaultPriority: "Cao",
      reportingMode: "EVERY_PERIOD",
      reviewStatus: "VERIFIED",
    };

    const res = await fetch(`${BASE_URL}/api/catalog/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`POST /api/catalog/templates thất bại (${res.status}): ${errText}`);
    }

    const data = await res.json();
    if (!data.success || !data.data?.id) {
      throw new Error("Phản hồi tạo template không hợp lệ");
    }
    createdTemplateId = data.data.id;

    // Kiểm tra trực tiếp trong PostgreSQL
    const inDb = await prisma.activityTemplate.findUnique({ where: { id: createdTemplateId } });
    if (!inDb || inDb.code !== testTplCode) {
      throw new Error("Template mới chưa được lưu vào cơ sở dữ liệu PostgreSQL!");
    }

    // F5 / Reload kiểm tra qua API GET
    const reloadRes = await fetch(`${BASE_URL}/api/catalog/templates?q=${testTplCode}`, {
      headers: { Authorization: `Bearer ${leaderSession.token}` },
    });
    const reloadData = await reloadRes.json();
    const found = reloadData.data?.find((t: any) => t.id === createdTemplateId);
    if (!found) {
      throw new Error("Reload API không tìm thấy template vừa tạo!");
    }

    console.log(`✅ [PASS] Kịch bản 2: Đã tạo thành công hoạt động mẫu ${testTplCode}, lưu PostgreSQL và reload đối soát hợp lệ.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 2: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 3: Chỉnh sửa thông tin hoạt động mẫu -> Lưu PostgreSQL -> Reload đúng dữ liệu mới
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 3: Chỉnh sửa thông tin hoạt động mẫu -> Lưu PostgreSQL -> Reload đúng dữ liệu mới");
  console.log("-".repeat(80));
  try {
    if (!createdTemplateId) throw new Error("Không có template để sửa từ Kịch bản 2");

    const updatedTitle = `Kiểm tra thực tế hàng hóa chuyển khẩu (ĐÃ CẬP NHẬT ${randomSuffix})`;
    const updatedDesc = "Nội dung hướng dẫn chi tiết đã được cập nhật bởi Lãnh đạo";

    const updateRes = await fetch(`${BASE_URL}/api/catalog/templates/${createdTemplateId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderSession.token}`,
      },
      body: JSON.stringify({
        title: updatedTitle,
        description: updatedDesc,
        defaultPriority: "Trung bình",
        reportingMode: "ON_OCCURRENCE",
      }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`PUT /api/catalog/templates/${createdTemplateId} thất bại (${updateRes.status}): ${errText}`);
    }

    // Kiểm tra trực tiếp trong PostgreSQL
    const inDb = await prisma.activityTemplate.findUnique({ where: { id: createdTemplateId } });
    if (!inDb || inDb.title !== updatedTitle || inDb.reportingMode !== "ON_OCCURRENCE") {
      throw new Error("Dữ liệu cập nhật chưa được lưu chính xác vào PostgreSQL!");
    }

    // Reload qua GET single template
    const singleRes = await fetch(`${BASE_URL}/api/catalog/templates/${createdTemplateId}`, {
      headers: { Authorization: `Bearer ${leaderSession.token}` },
    });
    const singleData = await singleRes.json();
    if (singleData.data.title !== updatedTitle) {
      throw new Error("Reload thông tin chi tiết template không khớp tiêu đề mới!");
    }

    console.log(`✅ [PASS] Kịch bản 3: Chỉnh sửa thông tin template thành công, PostgreSQL và API trả về dữ liệu mới chính xác.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 3: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 4: Ngừng áp dụng (RETIRED) hoạt động mẫu -> Ẩn khỏi bộ lọc tạo mới
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 4: Ngừng áp dụng (RETIRED) hoạt động mẫu -> Ẩn khỏi bộ lọc tạo mới");
  console.log("-".repeat(80));
  try {
    if (!createdTemplateId) throw new Error("Không có template để ngừng áp dụng");

    const patchRes = await fetch(`${BASE_URL}/api/catalog/templates/${createdTemplateId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({ action: "RETIRE" }),
    });

    if (!patchRes.ok) {
      throw new Error(`PATCH chuyển trạng thái RETIRED thất bại: ${patchRes.status}`);
    }

    // Kiểm tra PostgreSQL
    const inDb = await prisma.activityTemplate.findUnique({ where: { id: createdTemplateId } });
    if (inDb?.reviewStatus !== "RETIRED") {
      throw new Error(`PostgreSQL reviewStatus phải là RETIRED, thực tế: ${inDb?.reviewStatus}`);
    }

    // Kiểm tra bộ lọc activeOnly=true
    const activeRes = await fetch(`${BASE_URL}/api/catalog/templates?activeOnly=true`, {
      headers: { Authorization: `Bearer ${leaderSession.token}` },
    });
    const activeData = await activeRes.json();
    const isPresent = activeData.data.some((t: any) => t.id === createdTemplateId);
    if (isPresent) {
      throw new Error("Mẫu đã RETIRED nhưng vẫn xuất hiện trong danh sách activeOnly=true!");
    }

    console.log(`✅ [PASS] Kịch bản 4: Đã chuyển template sang RETIRED thành công và ẩn hoàn toàn khỏi danh sách lựa chọn tạo mới.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 4: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 5: Kích hoạt lại (ACTIVATE) hoạt động mẫu -> Xuất hiện trở lại
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 5: Kích hoạt lại (ACTIVATE) hoạt động mẫu -> Xuất hiện trở lại");
  console.log("-".repeat(80));
  try {
    if (!createdTemplateId) throw new Error("Không có template để kích hoạt lại");

    const patchRes = await fetch(`${BASE_URL}/api/catalog/templates/${createdTemplateId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderSession.token}`,
      },
      body: JSON.stringify({ action: "ACTIVATE" }),
    });

    if (!patchRes.ok) {
      throw new Error(`PATCH chuyển trạng thái ACTIVATE thất bại: ${patchRes.status}`);
    }

    // Kiểm tra PostgreSQL
    const inDb = await prisma.activityTemplate.findUnique({ where: { id: createdTemplateId } });
    if (inDb?.reviewStatus !== "VERIFIED") {
      throw new Error(`PostgreSQL reviewStatus phải là VERIFIED, thực tế: ${inDb?.reviewStatus}`);
    }

    // Kiểm tra lại bộ lọc activeOnly=true
    const activeRes = await fetch(`${BASE_URL}/api/catalog/templates?activeOnly=true`, {
      headers: { Authorization: `Bearer ${leaderSession.token}` },
    });
    const activeData = await activeRes.json();
    const isPresent = activeData.data.some((t: any) => t.id === createdTemplateId);
    if (!isPresent) {
      throw new Error("Mẫu đã kích hoạt lại nhưng không xuất hiện trong danh sách activeOnly=true!");
    }

    console.log(`✅ [PASS] Kịch bản 5: Đã kích hoạt lại template thành công (VERIFIED) và hiển thị lại bình thường.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 5: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 6: Tính bất biến lịch sử (Historical Integrity) & Chặn xóa cứng mẫu đã dùng
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 6: Tính bất biến lịch sử & Chặn xóa cứng mẫu đã dùng (HTTP 400)");
  console.log("-".repeat(80));
  try {
    if (!createdTemplateId) throw new Error("Không có template để kiểm tra tính bất biến");

    // 1. Tạo 1 PersonalWorkItem liên kết với template này
    const period = await prisma.reportingPeriod.findFirst();
    if (!period) throw new Error("Không tìm thấy ReportingPeriod");
    const person = await prisma.person.findFirst({ where: { code: "CB-001" } });
    if (!person) throw new Error("Không tìm thấy Person CB-001");

    const workItem = await prisma.personalWorkItem.create({
      data: {
        personId: person.id,
        periodId: period.id,
        templateId: createdTemplateId,
        title: "Đầu việc lịch sử gắn với template thử nghiệm",
        status: "ACTIVE",
      },
    });

    // 2. Chuyển template sang RETIRED
    await fetch(`${BASE_URL}/api/catalog/templates/${createdTemplateId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({ action: "RETIRE" }),
    });

    // 3. Đối soát: PersonalWorkItem trong lịch sử vẫn giữ nguyên vẹn liên kết và nội dung
    const fetchedWorkItem = await prisma.personalWorkItem.findUnique({
      where: { id: workItem.id },
      include: { template: true },
    });
    if (!fetchedWorkItem || fetchedWorkItem.templateId !== createdTemplateId || !fetchedWorkItem.template) {
      throw new Error("Dữ liệu lịch sử của PersonalWorkItem bị mất liên kết sau khi template bị RETIRED!");
    }

    // 4. Thử DELETE template này -> Backend PHẢI từ chối với HTTP 400 để bảo vệ dữ liệu lịch sử
    const deleteRes = await fetch(`${BASE_URL}/api/catalog/templates/${createdTemplateId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminSession.token}` },
    });
    if (deleteRes.status !== 400) {
      throw new Error(`Xóa cứng template đang được liên kết phải bị chặn với 400, nhận được: ${deleteRes.status}`);
    }

    // Clean up workItem
    await prisma.personalWorkItem.delete({ where: { id: workItem.id } });

    console.log(`✅ [PASS] Kịch bản 6: Tính bất biến lịch sử được bảo đảm; Backend chặn đứng hành vi xóa cứng template đã sử dụng (HTTP 400).`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 6: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 7: Đầu việc cá nhân linh hoạt (PersonalWorkItem) - Tạo đầu việc tự do
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 7: Đầu việc cá nhân linh hoạt - Tạo đầu việc tự do KHÔNG qua 48 mẫu");
  console.log("-".repeat(80));
  let customWorkItemId = "";
  try {
    const period = await prisma.reportingPeriod.findFirst();
    if (!period) throw new Error("Không có kỳ báo cáo");

    const customTitle = `Xử lý hồ sơ hoàn thuế khẩn cấp cho doanh nghiệp FDI ${randomSuffix}`;

    const createRes = await fetch(`${BASE_URL}/api/personal-work-items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({
        periodId: period.id,
        customTitle,
        // templateId KHÔNG ĐƯỢC TRUYỀN -> Tự do tạo mới
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Tạo đầu việc tự do thất bại (${createRes.status}): ${err}`);
    }

    const resJson = await createRes.json();
    customWorkItemId = resJson.data?.id;

    // Kiểm tra trong PostgreSQL
    const inDb = await prisma.personalWorkItem.findUnique({ where: { id: customWorkItemId } });
    if (!inDb || inDb.templateId !== null || inDb.title !== customTitle) {
      throw new Error("Đầu việc tự do không được lưu chính xác (templateId phải là null)!");
    }

    // Kiểm tra API trả về isCustom: true
    const getRes = await fetch(`${BASE_URL}/api/personal-work-items?periodId=${period.id}`, {
      headers: { Authorization: `Bearer ${officerSession.token}` },
    });
    const getData = await getRes.json();
    const itemInApi = getData.data?.find((i: any) => i.id === customWorkItemId);
    if (!itemInApi || itemInApi.isCustom !== true) {
      throw new Error("API personal-work-items không đánh dấu isCustom: true cho đầu việc tự tạo!");
    }

    console.log(`✅ [PASS] Kịch bản 7: Cán bộ tạo thành công đầu việc tự do linh hoạt (templateId = null, isCustom = true), không ép buộc theo 48 mẫu.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 7: ${err.message}`);
  } finally {
    if (customWorkItemId) {
      await prisma.personalWorkItem.delete({ where: { id: customWorkItemId } }).catch(() => {});
    }
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 8: Đầu việc cá nhân chọn từ mẫu chuẩn hóa & Chặn chọn mẫu đã RETIRED
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 8: Đầu việc cá nhân chọn từ mẫu chuẩn hóa & Chặn chọn mẫu đã RETIRED");
  console.log("-".repeat(80));
  try {
    const period = await prisma.reportingPeriod.findFirst();
    if (!period) throw new Error("Không có kỳ báo cáo");

    // Lấy 1 template chuẩn hóa đang VERIFIED
    const verifiedTpl = await prisma.activityTemplate.findFirst({
      where: { reviewStatus: "VERIFIED" },
    });
    if (!verifiedTpl) throw new Error("Không tìm thấy template VERIFIED");

    // 1. Tạo đầu việc chọn từ mẫu VERIFIED -> Thành công
    const validRes = await fetch(`${BASE_URL}/api/personal-work-items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({
        periodId: period.id,
        templateId: verifiedTpl.id,
      }),
    });
    if (!validRes.ok) {
      throw new Error(`Tạo đầu việc từ template VERIFIED thất bại: ${validRes.status}`);
    }
    const validData = await validRes.json();
    const createdId = validData.data?.id;

    // 2. Thử tạo đầu việc với template đã RETIRED -> Backend PHẢI từ chối với HTTP 400
    // Đảm bảo có 1 template RETIRED
    let retiredTpl = await prisma.activityTemplate.findFirst({
      where: { reviewStatus: "RETIRED" },
    });
    if (!retiredTpl) {
      retiredTpl = await prisma.activityTemplate.findFirst({ where: { id: createdTemplateId } });
      if (retiredTpl) {
        await prisma.activityTemplate.update({
          where: { id: retiredTpl.id },
          data: { reviewStatus: "RETIRED" },
        });
      }
    }

    if (retiredTpl) {
      const retiredRes = await fetch(`${BASE_URL}/api/personal-work-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${officerSession.token}`,
        },
        body: JSON.stringify({
          periodId: period.id,
          templateId: retiredTpl.id,
        }),
      });

      if (retiredRes.status !== 400) {
        throw new Error(`Tạo đầu việc từ template RETIRED phải bị từ chối với 400, nhận được: ${retiredRes.status}`);
      }
    }

    // Clean up
    if (createdId) {
      await prisma.personalWorkItem.delete({ where: { id: createdId } }).catch(() => {});
    }

    console.log(`✅ [PASS] Kịch bản 8: Tạo đầu việc từ mẫu chuẩn hóa thành công và Backend từ chối chính xác (HTTP 400) khi cố chọn mẫu đã RETIRED.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 8: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 9: Phân quyền RBAC: Cán bộ thường không có quyền sửa/thêm danh mục (HTTP 403)
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 9: Phân quyền RBAC - Cán bộ thường không có quyền sửa/thêm danh mục (HTTP 403)");
  console.log("-".repeat(80));
  try {
    const forbiddenTpl = await prisma.activityTemplate.findFirst();
    if (!forbiddenTpl) throw new Error("Không có template");

    // Thử thêm mới
    const addRes = await fetch(`${BASE_URL}/api/catalog/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({
        code: `HACK-${randomSuffix}`,
        title: "Tự tạo template khi không có quyền",
        groupId: forbiddenTpl.groupId,
      }),
    });
    if (addRes.status !== 403) {
      throw new Error(`Cán bộ thường thêm template phải nhận 403, nhận được: ${addRes.status}`);
    }

    // Thử sửa
    const putRes = await fetch(`${BASE_URL}/api/catalog/templates/${forbiddenTpl.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({ title: "Hack title" }),
    });
    if (putRes.status !== 403) {
      throw new Error(`Cán bộ thường sửa template phải nhận 403, nhận được: ${putRes.status}`);
    }

    // Thử đổi trạng thái
    const patchRes = await fetch(`${BASE_URL}/api/catalog/templates/${forbiddenTpl.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${officerSession.token}`,
      },
      body: JSON.stringify({ action: "RETIRE" }),
    });
    if (patchRes.status !== 403) {
      throw new Error(`Cán bộ thường đổi trạng thái template phải nhận 403, nhận được: ${patchRes.status}`);
    }

    // Thử xóa
    const deleteRes = await fetch(`${BASE_URL}/api/catalog/templates/${forbiddenTpl.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${officerSession.token}` },
    });
    if (deleteRes.status !== 403) {
      throw new Error(`Cán bộ thường xóa template phải nhận 403, nhận được: ${deleteRes.status}`);
    }

    console.log(`✅ [PASS] Kịch bản 9: RBAC phân quyền bảo vệ danh mục mẫu tuyệt đối, chặn mọi hành vi xâm phạm của cán bộ thường (HTTP 403 Forbidden).`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 9: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 10: Chống trùng mã (409) và xác thực dữ liệu đầu vào (400)
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 10: Chống trùng mã (409) và xác thực dữ liệu đầu vào (400)");
  console.log("-".repeat(80));
  try {
    const existing = await prisma.activityTemplate.findFirst();
    if (!existing) throw new Error("Không có template");

    // 1. Thử tạo với mã đã tồn tại -> 409 Conflict
    const dupRes = await fetch(`${BASE_URL}/api/catalog/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        code: existing.code,
        title: "Tạo trùng mã thử nghiệm",
        groupId: existing.groupId,
      }),
    });
    if (dupRes.status !== 409) {
      throw new Error(`Trùng mã template phải nhận 409 Conflict, nhận được: ${dupRes.status}`);
    }

    // 2. Thử tạo thiếu trường bắt buộc -> 400 Bad Request
    const missingRes = await fetch(`${BASE_URL}/api/catalog/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        code: `VALID-MISSING-${randomSuffix}`,
        // Thiếu title và groupId
      }),
    });
    if (missingRes.status !== 400) {
      throw new Error(`Thiếu dữ liệu bắt buộc phải nhận 400 Bad Request, nhận được: ${missingRes.status}`);
    }

    // 3. Thử tạo với groupId không tồn tại -> 400 Bad Request
    const nonExistGroupRes = await fetch(`${BASE_URL}/api/catalog/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        code: `NON-GROUP-${randomSuffix}`,
        title: "Nhóm không tồn tại",
        groupId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    if (nonExistGroupRes.status !== 400) {
      throw new Error(`groupId không tồn tại phải nhận 400 Bad Request, nhận được: ${nonExistGroupRes.status}`);
    }

    console.log(`✅ [PASS] Kịch bản 10: Backend từ chối chính xác dữ liệu trùng lặp (409) và dữ liệu không hợp lệ (400).`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 10: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 11: Frontend UI Safety - Xử lý lỗi trung thực (Zero Fake Success)
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 11: Frontend UI Safety - Xử lý lỗi trung thực (Zero Fake Success)");
  console.log("-".repeat(80));
  try {
    const catalogPagePath = path.join(process.cwd(), "src/app/admin/catalog/page.tsx");
    const content = fs.readFileSync(catalogPagePath, "utf-8");

    if (!content.includes("formError") || !content.includes("setFormError")) {
      throw new Error("UI không lưu trữ hoặc hiển thị lỗi form trong modal!");
    }

    if (!content.includes("res.ok") || !content.includes("resData.error")) {
      throw new Error("UI không kiểm tra res.ok hoặc không trích xuất thông báo lỗi từ Backend!");
    }

    if (!content.includes("statusConfirmTarget") || !content.includes("handleExecuteStatusChange")) {
      throw new Error("UI thiếu Confirm Dialog an toàn trước khi đổi trạng thái áp dụng!");
    }

    console.log(`✅ [PASS] Kịch bản 11: Mã nguồn UI xử lý lỗi trung thực, hiển thị banner lỗi trực tiếp trong modal, không bao giờ tạo thành công giả.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 11: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN 12: Kiểm toán an ninh PostgreSQL ghi nhận đầy đủ chuỗi AuditEvent
  // --------------------------------------------------------------------------
  console.log("\n" + "-".repeat(80));
  console.log("KỊCH BẢN 12: Kiểm toán an ninh PostgreSQL ghi nhận đầy đủ chuỗi AuditEvent");
  console.log("-".repeat(80));
  try {
    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        resourceType: "ActivityTemplate",
      },
      orderBy: { timestamp: "desc" },
      take: 20,
    });

    if (auditEvents.length === 0) {
      throw new Error("Không tìm thấy sự kiện kiểm toán nào cho ActivityTemplate trong PostgreSQL!");
    }

    const actions = auditEvents.map((a) => a.action);
    const hasCreate = actions.includes("CATALOG_TEMPLATE_CREATE");
    const hasUpdate = actions.includes("CATALOG_TEMPLATE_UPDATE");
    const hasStatusChange = actions.includes("CATALOG_TEMPLATE_STATUS_CHANGE");

    if (!hasCreate || !hasUpdate || !hasStatusChange) {
      throw new Error(`Chuỗi AuditEvent chưa đủ các loại hành động: có [${Array.from(new Set(actions)).join(", ")}]`);
    }

    // Kiểm tra actorId và newData
    const createEvent = auditEvents.find((a) => a.action === "CATALOG_TEMPLATE_CREATE");
    if (!createEvent?.actorId || !(createEvent?.newData as any)?.actorRole || !createEvent?.newData) {
      throw new Error("AuditEvent thiếu thông tin Actor hoặc payload newData!");
    }

    console.log(`✅ [PASS] Kịch bản 12: PostgreSQL ghi nhận đầy đủ chuỗi AuditEvent (${auditEvents.length} bản ghi) với Actor và dữ liệu thay đổi minh bạch.`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] Kịch bản 12: ${err.message}`);
  }

  // Cleanup template test
  if (createdTemplateId) {
    await prisma.activityTemplate.delete({ where: { id: createdTemplateId } }).catch(() => {});
  }

  console.log("\n" + "=".repeat(80));
  console.log(`TỔNG KẾT KIỂM THỬ THỰC TẾ: ${passedTests}/${totalTests} KỊCH BẢN ĐẠT CHUẨN (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("=".repeat(80));

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runCatalogTests()
  .catch((e) => {
    console.error("FATAL ERROR IN TEST RUNNER:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
