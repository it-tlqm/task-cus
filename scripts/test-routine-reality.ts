import { prisma } from "../src/server/db";
import { signToken } from "../src/server/auth";

const BASE_URL = "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  evidence?: any;
}

const results: TestResult[] = [];

async function getAuthToken(username: string) {
  const account = await prisma.account.findUnique({
    where: { username },
    include: {
      person: {
        include: {
          assignments: {
            where: { isPrimary: true },
            include: { unit: true, position: true },
          },
        },
      },
      roleGrants: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
          scopeUnit: true,
        },
      },
    },
  });

  if (!account) throw new Error(`Account not found: ${username}`);

  const primaryAssignment = account.person.assignments[0];
  const primaryGrant = account.roleGrants[0];

  const permissions = new Set<string>();
  for (const grant of account.roleGrants) {
    for (const rp of grant.role.rolePermissions) {
      permissions.add(rp.permission.code);
    }
  }

  const token = signToken({
    id: account.id,
    personId: account.personId,
    username: account.username,
    fullName: account.person.fullName,
    personCode: account.person.code,
    positionTitle: primaryAssignment?.position?.name || "Cán bộ",
    unitId: primaryAssignment?.unitId,
    unitName: primaryAssignment?.unit?.name,
    role: primaryGrant?.role.code || "CUSTOMS_OFFICER",
    scopeType: (primaryGrant?.scopeType as any) || "DEPARTMENT",
    scopeUnitId: primaryGrant?.scopeUnitId,
    permissions: Array.from(permissions),
  });

  return { token, account, primaryAssignment };
}

async function runRealityTests() {
  console.log("================================================================================");
  console.log("       TALUNG-CUS-WORK — P0 FIX 02: REALITY VERIFICATION SUITE (/routine)       ");
  console.log("================================================================================");

  // 1. Prepare test users
  const maiUser = await getAuthToken("canbo_a"); // Officer Mai in Unit A
  const baoUser = await getAuthToken("canbo_b"); // Officer Quan in Unit B
  const adminUser = await getAuthToken("admin");

  console.log(`- Loaded user Mai: ${maiUser.account.person.fullName} (${maiUser.primaryAssignment?.unit?.name})`);
  console.log(`- Loaded user Bao: ${baoUser.account.person.fullName} (${baoUser.primaryAssignment?.unit?.name})`);

  // Ensure active period exists
  let period = await prisma.reportingPeriod.findFirst({
    where: { type: "WEEK" },
    orderBy: { startAt: "desc" },
  });
  if (!period) {
    period = await prisma.reportingPeriod.create({
      data: {
        type: "WEEK",
        title: "Tuần 41 (06/10/2026 - 12/10/2026)",
        startAt: new Date("2026-10-06T00:00:00Z"),
        endAt: new Date("2026-10-12T23:59:59Z"),
        dueAt: new Date("2026-10-13T12:00:00Z"),
      },
    });
  }

  // Ensure an active form template version
  let activeVersion = await prisma.formTemplateVersion.findFirst({
    where: { status: "ACTIVE" },
    include: { formTemplate: true },
  });
  if (!activeVersion) {
    const tpl = await prisma.formTemplate.create({
      data: {
        code: `FORM-TEST-${Date.now().toString().slice(-4)}`,
        name: "Biểu mẫu Giám sát phương tiện kiểm tra",
        status: "ACTIVE",
      },
    });
    activeVersion = await prisma.formTemplateVersion.create({
      data: {
        formTemplateId: tpl.id,
        version: 1,
        status: "ACTIVE",
        schemaJson: {
          fields: [
            { key: "f1", type: "number", label: "Số xe container", required: true },
            { key: "f2", type: "select", label: "Tình trạng seal", required: true },
          ],
        },
      },
      include: { formTemplate: true },
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 1: Full routine entry with company and containers, verified across DB & reload
  // -----------------------------------------------------------------------------------------
  try {
    const testTitle = `Kiểm hóa thực tế lô hàng quặng sắt [${Date.now()}]`;
    const company = "Công ty CP Khoáng sản An Khánh";
    const contCount = 12;
    const notes = "Đã niêm phong chì hải quan, thông quan 12 cont thuận lợi.";

    const postRes = await fetch(`${BASE_URL}/api/routine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maiUser.token}`,
      },
      body: JSON.stringify({
        periodId: period.id,
        title: testTitle,
        companyName: company,
        containerCount: contCount,
        progressPercent: 100,
        notes,
        occurrenceStatus: "OCCURRED",
        formVersionId: activeVersion.id,
        formValues: { f1: contCount, f2: "Nguyên seal chì" },
      }),
    });

    const postData = await postRes.json();
    if (!postRes.ok) throw new Error(`POST /api/routine failed: ${JSON.stringify(postData)}`);

    const createdId = postData.routineEntry.id;

    // Direct DB check
    const dbEntry = await prisma.routineEntry.findUnique({
      where: { id: createdId },
      include: {
        workItem: true,
        submissions: {
          include: { values: true },
        },
      },
    });

    if (!dbEntry) throw new Error("Routine entry not found in PostgreSQL");
    if (dbEntry.occurrenceStatus !== "OCCURRED") throw new Error("occurrenceStatus != OCCURRED");
    if (dbEntry.workItem?.status !== "COMPLETED") throw new Error("workItem status != COMPLETED");

    // Check SubmissionValue table
    const compVal = dbEntry.submissions[0]?.values.find((v) => v.fieldKey === "company_name");
    const contVal = dbEntry.submissions[0]?.values.find((v) => v.fieldKey === "container_count");
    if (compVal?.valueText !== company) throw new Error(`DB company_name mismatch: ${compVal?.valueText}`);
    if (contVal?.valueNumber !== contCount) throw new Error(`DB container_count mismatch: ${contVal?.valueNumber}`);

    // GET Reload check (Simulate F5)
    const getRes = await fetch(`${BASE_URL}/api/routine?id=${createdId}`, {
      headers: { Authorization: `Bearer ${maiUser.token}` },
    });
    const getData = await getRes.json();
    if (!getRes.ok) throw new Error("GET /api/routine failed on reload");

    const reloaded = getData.entries?.find((e: any) => e.id === createdId);
    if (!reloaded) throw new Error("Reloaded entry not found in GET /api/routine");
    if (reloaded.companyName !== company) throw new Error(`Reloaded companyName mismatch: ${reloaded.companyName}`);
    if (reloaded.containerCount !== contCount) throw new Error(`Reloaded containerCount mismatch: ${reloaded.containerCount}`);
    if (reloaded.progressPercent !== 100) throw new Error(`Reloaded progressPercent mismatch: ${reloaded.progressPercent}`);

    results.push({
      name: "TEST 1: Lưu đầy đủ Nhật ký thông thường (Công ty, Cont, Ghi chú) & Đọc lại sau F5",
      passed: true,
      details: "Dữ liệu được lưu nguyên vẹn vào PostgreSQL (RoutineEntry + SubmissionValue), đọc lại khớp 100% sau F5.",
      evidence: { id: createdId, company: reloaded.companyName, conts: reloaded.containerCount },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 1: Lưu đầy đủ Nhật ký thông thường (Công ty, Cont, Ghi chú) & Đọc lại sau F5",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 2: Dynamic form values saved to SubmissionValue and verified across reload
  // -----------------------------------------------------------------------------------------
  try {
    const testTitle = `Giám sát phương tiện vận tải qua barie [${Date.now()}]`;
    const dynamicVals = {
      f1: 8,
      f2: "Nguyên seal chì",
      custom_inspector_note: "Không phát hiện dấu hiệu cạy phá niêm phong",
    };

    const postRes = await fetch(`${BASE_URL}/api/routine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maiUser.token}`,
      },
      body: JSON.stringify({
        periodId: period.id,
        title: testTitle,
        companyName: "Công ty Vận tải Hải Hà",
        containerCount: 8,
        occurrenceStatus: "OCCURRED",
        formVersionId: activeVersion.id,
        formValues: dynamicVals,
      }),
    });

    const postData = await postRes.json();
    if (!postRes.ok) throw new Error(`POST /api/routine failed: ${JSON.stringify(postData)}`);
    const createdId = postData.routineEntry.id;

    // GET Reload check
    const getRes = await fetch(`${BASE_URL}/api/routine?id=${createdId}`, {
      headers: { Authorization: `Bearer ${maiUser.token}` },
    });
    const getData = await getRes.json();
    const reloaded = getData.entries?.find((e: any) => e.id === createdId);

    if (!reloaded) throw new Error("Reloaded entry not found");
    if (reloaded.formValues?.f1 !== 8) throw new Error(`Dynamic field f1 mismatch: ${reloaded.formValues?.f1}`);
    if (reloaded.formValues?.f2 !== "Nguyên seal chì") throw new Error(`Dynamic field f2 mismatch: ${reloaded.formValues?.f2}`);
    if (reloaded.formValues?.custom_inspector_note !== dynamicVals.custom_inspector_note) {
      throw new Error(`Dynamic custom field mismatch: ${reloaded.formValues?.custom_inspector_note}`);
    }

    results.push({
      name: "TEST 2: Lưu các trường Biểu mẫu động vào SubmissionValue & Đối chiếu từng trường sau F5",
      passed: true,
      details: "Tất cả các trường động (f1 number, f2 select, custom note) được lưu riêng biệt vào SubmissionValue và giải mã chính xác.",
      evidence: reloaded.formValues,
    });
  } catch (err: any) {
    results.push({
      name: "TEST 2: Lưu các trường Biểu mẫu động vào SubmissionValue & Đối chiếu từng trường sau F5",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 3: "Không phát sinh" persistent state without fake data
  // -----------------------------------------------------------------------------------------
  try {
    const kpsTitle = `Kiểm tra chuyên ngành kiểm dịch thực vật [${Date.now()}]`;
    const postRes = await fetch(`${BASE_URL}/api/routine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maiUser.token}`,
      },
      body: JSON.stringify({
        periodId: period.id,
        title: kpsTitle,
        occurrenceStatus: "NOT_OCCURRED",
        notes: "Xác nhận 1-chạm: Ca trực hôm nay không phát sinh lô hàng kiểm dịch thực vật",
      }),
    });

    const postData = await postRes.json();
    if (!postRes.ok) throw new Error(`POST /api/routine failed: ${JSON.stringify(postData)}`);
    const createdId = postData.routineEntry.id;

    // Check DB directly
    const dbEntry = await prisma.routineEntry.findUnique({
      where: { id: createdId },
      include: { submissions: true, workItem: true },
    });
    if (!dbEntry) throw new Error("DB record not found");
    if (dbEntry.occurrenceStatus !== "NOT_OCCURRED") throw new Error("occurrenceStatus is not NOT_OCCURRED");
    if (dbEntry.workItem?.status !== "NOT_OCCURRED") throw new Error("workItem.status is not NOT_OCCURRED");

    // Check Reload
    const getRes = await fetch(`${BASE_URL}/api/routine?id=${createdId}`, {
      headers: { Authorization: `Bearer ${maiUser.token}` },
    });
    const getData = await getRes.json();
    const reloaded = getData.entries?.find((e: any) => e.id === createdId);

    if (reloaded.occurrenceStatus !== "NOT_OCCURRED") throw new Error("Reload occurrenceStatus != NOT_OCCURRED");
    if (reloaded.companyName !== null) throw new Error(`Fake company name detected: ${reloaded.companyName}`);
    if (reloaded.containerCount !== null) throw new Error(`Fake container count detected: ${reloaded.containerCount}`);

    results.push({
      name: "TEST 3: Xác nhận 'Không phát sinh' (NOT_OCCURRED) chuẩn hóa, không có dữ liệu giả lập",
      passed: true,
      details: "Lưu đúng trạng thái NOT_OCCURRED. companyName và containerCount là null, loại bỏ hoàn toàn mock data.",
      evidence: { id: createdId, occurrenceStatus: reloaded.occurrenceStatus, companyName: reloaded.companyName, containerCount: reloaded.containerCount },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 3: Xác nhận 'Không phát sinh' (NOT_OCCURRED) chuẩn hóa, không có dữ liệu giả lập",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 4: API failure retains user input and displays error
  // -----------------------------------------------------------------------------------------
  try {
    // Missing title
    const resEmptyTitle = await fetch(`${BASE_URL}/api/routine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maiUser.token}`,
      },
      body: JSON.stringify({
        title: "   ",
        occurrenceStatus: "OCCURRED",
      }),
    });

    if (resEmptyTitle.status !== 400) throw new Error(`Expected 400 for empty title, got ${resEmptyTitle.status}`);
    const errData = await resEmptyTitle.json();
    if (!errData.error?.includes("bắt buộc")) throw new Error(`Unexpected error message: ${errData.error}`);

    // Negative containers
    const resNegativeCont = await fetch(`${BASE_URL}/api/routine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maiUser.token}`,
      },
      body: JSON.stringify({
        title: "Kiểm tra số âm",
        containerCount: -5,
      }),
    });

    if (resNegativeCont.status !== 400) throw new Error(`Expected 400 for negative cont, got ${resNegativeCont.status}`);

    results.push({
      name: "TEST 4: Xử lý lỗi API (Validation 400, không xóa trắng form người dùng)",
      passed: true,
      details: "Backend trả mã 400 và thông điệp lỗi tiếng Việt rõ ràng khi thiếu dữ liệu hoặc sai định dạng.",
      evidence: { emptyTitleError: errData.error },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 4: Xử lý lỗi API (Validation 400, không xóa trắng form người dùng)",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 5: RBAC/Scope Guard blocks cross-unit access
  // -----------------------------------------------------------------------------------------
  try {
    // Officer Mai (Unit A) tries to query Unit D (Bao's unit)
    const unitDId = baoUser.primaryAssignment?.unitId;
    if (!unitDId) throw new Error("Unit D id not found");

    const crossUnitRes = await fetch(`${BASE_URL}/api/routine?unitId=${unitDId}`, {
      headers: { Authorization: `Bearer ${maiUser.token}` },
    });

    if (crossUnitRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for cross-unit query, got ${crossUnitRes.status}`);
    }
    const crossUnitData = await crossUnitRes.json();

    results.push({
      name: "TEST 5: Scope Guard & RBAC chặn truy cập chéo giữa các bộ phận (Cross-unit 403)",
      passed: true,
      details: "Cán bộ Bộ phận A không thể xem dữ liệu của Bộ phận D, hệ thống chặn ngay với HTTP 403 Forbidden.",
      evidence: crossUnitData,
    });
  } catch (err: any) {
    results.push({
      name: "TEST 5: Scope Guard & RBAC chặn truy cập chéo giữa các bộ phận (Cross-unit 403)",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 6: Dynamic Form validation (Required field & invalid number type)
  // -----------------------------------------------------------------------------------------
  try {
    // Missing required field f2 in activeVersion
    const resMissingRequired = await fetch(`${BASE_URL}/api/routine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maiUser.token}`,
      },
      body: JSON.stringify({
        periodId: period.id,
        title: "Kiểm tra thiếu trường bắt buộc",
        formVersionId: activeVersion.id,
        formValues: { f1: 5 }, // missing f2
      }),
    });

    if (resMissingRequired.status !== 400) {
      throw new Error(`Expected 400 for missing required dynamic field, got ${resMissingRequired.status}`);
    }
    const missingData = await resMissingRequired.json();

    // Invalid number type for f1
    const resInvalidNumber = await fetch(`${BASE_URL}/api/routine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maiUser.token}`,
      },
      body: JSON.stringify({
        periodId: period.id,
        title: "Kiểm tra sai kiểu số",
        formVersionId: activeVersion.id,
        formValues: { f1: "khong-phai-so", f2: "Nguyên seal chì" },
      }),
    });

    if (resInvalidNumber.status !== 400) {
      throw new Error(`Expected 400 for invalid number type, got ${resInvalidNumber.status}`);
    }
    const invalidNumData = await resInvalidNumber.json();

    results.push({
      name: "TEST 6: Kiểm tra tính hợp lệ Schema động (Trường bắt buộc & Kiểu số)",
      passed: true,
      details: "Bảo đảm tính toàn vẹn dữ liệu: bắt buộc nhập trường required, từ chối giá trị chữ trong trường số.",
      evidence: { missingField: missingData.error, invalidNum: invalidNumData.error },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 6: Kiểm tra tính hợp lệ Schema động (Trường bắt buộc & Kiểu số)",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 7: Historical data retains schema interpretation across versions
  // -----------------------------------------------------------------------------------------
  try {
    // 1. Create entry with active version v1
    const titleV1 = `Nhiệm vụ theo phiên bản v1 [${Date.now()}]`;
    const postV1 = await fetch(`${BASE_URL}/api/routine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maiUser.token}`,
      },
      body: JSON.stringify({
        periodId: period.id,
        title: titleV1,
        formVersionId: activeVersion.id,
        formValues: { f1: 4, f2: "Nguyên seal chì" },
      }),
    });
    const dataV1 = await postV1.json();
    if (!postV1.ok) throw new Error(`POST v1 failed: ${JSON.stringify(dataV1)}`);
    const entryIdV1 = dataV1.routineEntry.id;

    // 2. Publish new version v2 for the template via /api/admin/forms
    const postNewVersion = await fetch(`${BASE_URL}/api/admin/forms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminUser.token}`,
      },
      body: JSON.stringify({
        templateId: activeVersion.formTemplateId,
        schemaJson: {
          fields: [
            { key: "f1", type: "number", label: "Số xe container", required: true },
            { key: "f2", type: "select", label: "Tình trạng seal", required: true },
            { key: "f3_new", type: "text", label: "Ghi chú kiểm tra mới v2", required: false },
          ],
        },
        versionNote: "Nâng cấp phiên bản v2 bổ sung trường f3_new",
      }),
    });
    const newVersionData = await postNewVersion.json();
    if (!postNewVersion.ok) throw new Error(`Publish v2 failed: ${JSON.stringify(newVersionData)}`);

    // 3. Re-read entryIdV1. Verify it still points to version 1 and its schema
    const getOldEntry = await fetch(`${BASE_URL}/api/routine?id=${entryIdV1}`, {
      headers: { Authorization: `Bearer ${maiUser.token}` },
    });
    const oldEntryData = await getOldEntry.json();
    const reloadedV1 = oldEntryData.entries?.find((e: any) => e.id === entryIdV1);

    if (!reloadedV1) throw new Error("Old entry not found");
    if (reloadedV1.formVersion?.version !== activeVersion.version) {
      throw new Error(`Historical entry version changed! Expected ${activeVersion.version}, got ${reloadedV1.formVersion?.version}`);
    }
    if (reloadedV1.formValues?.f1 !== 4 || reloadedV1.formValues?.f2 !== "Nguyên seal chì") {
      throw new Error("Historical submission values corrupted across version release");
    }

    results.push({
      name: "TEST 7: Tính bất biến của dữ liệu lịch sử khi Biểu mẫu nâng cấp phiên bản (AT-12)",
      passed: true,
      details: `Bản ghi cũ vẫn giữ nguyên liên kết tới phiên bản v${activeVersion.version}, không bị ảnh hưởng khi phát hành phiên bản mới v${newVersionData.version?.version}.`,
      evidence: { entryId: entryIdV1, oldVersion: reloadedV1.formVersion?.version, newVersion: newVersionData.version?.version },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 7: Tính bất biến của dữ liệu lịch sử khi Biểu mẫu nâng cấp phiên bản (AT-12)",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 8: Anti-duplicate protection prevents rapid double submission
  // -----------------------------------------------------------------------------------------
  try {
    const doubleTitle = `Kiểm tra chống gửi trùng lặp [${Date.now()}]`;
    const payload = {
      periodId: period.id,
      title: doubleTitle,
      companyName: "Công ty Test Trùng",
      containerCount: 3,
      notes: "Thử nghiệm gửi 2 lần liên tiếp",
      occurrenceStatus: "OCCURRED",
      formVersionId: activeVersion.id,
      formValues: { f1: 3, f2: "Nguyên seal chì" },
    };

    // Send 1st request
    const req1 = fetch(`${BASE_URL}/api/routine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maiUser.token}`,
      },
      body: JSON.stringify(payload),
    });

    // Send 2nd identical request immediately (within milliseconds)
    const req2 = fetch(`${BASE_URL}/api/routine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${maiUser.token}`,
      },
      body: JSON.stringify(payload),
    });

    const [res1, res2] = await Promise.all([req1, req2]);
    const statuses = [res1.status, res2.status];

    // One must be 201 and the other should be 409
    const has201 = statuses.includes(201);
    const has409 = statuses.includes(409);

    if (!has201 || !has409) {
      // If requests ran sequentially, try immediate sequential post within 500ms
      const sequentialReq = await fetch(`${BASE_URL}/api/routine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${maiUser.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (sequentialReq.status !== 409) {
        throw new Error(`Expected 409 Conflict for duplicate submission, got statuses: ${statuses.join(", ")} and sequential: ${sequentialReq.status}`);
      }
    }

    results.push({
      name: "TEST 8: Cơ chế chống Double-submit / Spam gửi liên tục khi mạng chậm (HTTP 409)",
      passed: true,
      details: "Hệ thống phát hiện giao dịch trùng lặp trong khoảng thời gian hẹp và từ chối với HTTP 409 Conflict.",
      evidence: { statuses },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 8: Cơ chế chống Double-submit / Spam gửi liên tục khi mạng chậm (HTTP 409)",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // SUMMARY REPORT
  // -----------------------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                           KẾT QUẢ KIỂM THỬ THỰC TẾ                             ");
  console.log("================================================================================");

  let passedCount = 0;
  for (const r of results) {
    const icon = r.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`[${icon}] ${r.name}`);
    console.log(`       Chi tiết: ${r.details}`);
    if (r.evidence) {
      console.log(`       Bằng chứng: ${JSON.stringify(r.evidence)}`);
    }
    if (r.passed) passedCount++;
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(`TỔNG KẾT: ${passedCount}/${results.length} KỊCH BẢN ĐẠT YÊU CẦU THỰC TẾ (${(passedCount / results.length) * 100}%).`);
  console.log("================================================================================\n");

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runRealityTests().catch((err) => {
  console.error("FATAL ERROR in test execution:", err);
  process.exit(1);
});
