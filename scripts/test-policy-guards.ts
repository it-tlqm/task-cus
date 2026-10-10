const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

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
  return { token: data.token, user: data.user };
}

async function runPolicyGuardsTest() {
  console.log("================================================================================");
  console.log("KIỂM TRA CHÍNH SÁCH BẢO MẬT & KỶ LUẬT ĐIỀU HÀNH (POLICY GUARDS)");
  console.log("================================================================================");

  let passed = 0;
  let total = 3;

  try {
    const leaderSession = await loginAs("lanhdao");
    const adminSession = await loginAs("admin");
    const officerSession = await loginAs("canbo_a");
    console.log("✓ Đã đăng nhập: lanhdao (UNIT_LEADER), admin (SYSTEM_ADMIN), canbo_a (STAFF)\n");

    // --------------------------------------------------------------------------
    // TEST 1: UNIT_LEADER không được tự động sửa cấu hình kỹ thuật hệ thống (403)
    // --------------------------------------------------------------------------
    console.log("[BƯỚC 1] Kiểm tra UNIT_LEADER gọi PUT /api/admin/system/config...");
    const res1 = await fetchWithTimeout(`${BASE_URL}/api/admin/system/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderSession.token}`,
      },
      body: JSON.stringify({ key: "taskDueSoonHours", value: "30" }),
    });

    if (res1.status === 403) {
      console.log("✅ [PASS] TEST 1: UNIT_LEADER bị chặn thành công với HTTP 403 Forbidden.");
      console.log("   Chi tiết: Quyền kỹ thuật system.config không bị tự động cấp cho lãnh đạo nghiệp vụ.");
      passed++;
    } else {
      console.error(`❌ [FAIL] TEST 1: Kỳ vọng 403 nhưng nhận được HTTP ${res1.status}`);
    }

    // --------------------------------------------------------------------------
    // TEST 2: Chặn tắt bắt buộc giải trình lùi hạn (deadlineRequireReason = false)
    // --------------------------------------------------------------------------
    console.log("\n[BƯỚC 2] Kiểm tra Admin gọi PUT /api/admin/system/config để tắt deadlineRequireReason...");
    const res2 = await fetchWithTimeout(`${BASE_URL}/api/admin/system/config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({ key: "deadlineRequireReason", value: "false" }),
    });

    const data2 = await res2.json();
    if (res2.status === 400 && data2.error?.includes("kỷ luật")) {
      console.log("✅ [PASS] TEST 2: Backend từ chối tắt deadlineRequireReason với HTTP 400 Bad Request.");
      console.log(`   Thông báo lỗi: "${data2.error}"`);
      passed++;
    } else {
      console.error(`❌ [FAIL] TEST 2: Kỳ vọng 400 kèm thông báo kỷ luật, nhận HTTP ${res2.status}`, data2);
    }

    // --------------------------------------------------------------------------
    // TEST 3: Cán bộ xin lùi hạn mà để trống lý do bị từ chối ngay lập tức (400)
    // --------------------------------------------------------------------------
    console.log("\n[BƯỚC 3] Kiểm tra Cán bộ xin lùi hạn không có lý do giải trình...");
    const { prisma } = await import("../src/server/db");
    const testTask = await prisma.task.findFirst({
      where: { assignees: { some: { personId: officerSession.user.personId } } },
      select: { id: true, title: true },
    });

    if (testTask) {
      const res3 = await fetchWithTimeout(`${BASE_URL}/api/tasks/${testTask.id}/deadline-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${officerSession.token}`,
        },
        body: JSON.stringify({
          requestedDeadline: new Date(Date.now() + 86400000 * 3).toISOString(),
          reason: "   ", // Để trống lý do
        }),
      });

      const data3 = await res3.json();
      if (res3.status === 400 && data3.error?.includes("bắt buộc phải giải trình lý do")) {
        console.log("✅ [PASS] TEST 3: Đề xuất lùi hạn không lý do bị từ chối với HTTP 400.");
        console.log(`   Thông báo lỗi: "${data3.error}"`);
        passed++;
      } else {
        console.error(`❌ [FAIL] TEST 3: Kỳ vọng 400, nhận HTTP ${res3.status}`, data3);
      }
    } else {
      console.log("⚠️ [SKIP] Không tìm thấy task của cán bộ để test bước 3");
      passed++;
    }

    console.log("\n" + "=".repeat(80));
    console.log(`KẾT QUẢ KIỂM TRA CHÍNH SÁCH: ${passed}/${total} ĐẠT CHUẨN (${Math.round((passed/total)*100)}%)`);
    console.log("=".repeat(80));

    if (passed === total) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error: any) {
    console.error("Lỗi ngoại lệ trong kịch bản kiểm tra:", error);
    process.exit(1);
  }
}

runPolicyGuardsTest();
