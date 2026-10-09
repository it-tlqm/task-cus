async function testHttp() {
  const base = "http://localhost:3000";
  const urls = [
    "/api/catalog/groups",
    "/api/catalog/templates",
    "/api/dashboard/kpi",
    "/dashboard",
    "/plans",
    "/my-work",
    "/admin/organization",
    "/admin/catalog",
    "/login",
  ];

  console.log("=========================================");
  console.log(" KIỂM THỬ HTTP ENDPOINTS TRÊN LOCALHOST  ");
  console.log("=========================================\n");

  let allOk = true;

  for (const u of urls) {
    try {
      const res = await fetch(base + u);
      if (res.status === 200) {
        console.log(`  [HTTP 200 OK] ${u}`);
      } else {
        console.log(`  [HTTP ${res.status}] ${u}`);
        allOk = false;
      }
    } catch (err: any) {
      console.error(`  [ERROR] ${u}:`, err.message);
      allOk = false;
    }
  }

  // Test Login API
  console.log("\nKiểm thử API Đăng nhập (/api/auth/login):");
  try {
    const loginRes = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "lanhdao", password: "demo123" }),
    });
    const loginData = await loginRes.json();
    console.log(`  [HTTP ${loginRes.status}] Đăng nhập thành công -> Họ tên: ${loginData.user?.fullName}, Chức danh: ${loginData.user?.position}, Vai trò: ${loginData.user?.role}`);

    // Test API lấy thông tin người dùng (/api/auth/me) với Cookie
    const cookie = loginRes.headers.get("set-cookie");
    if (cookie) {
      const meRes = await fetch(base + "/api/auth/me", {
        headers: { Cookie: cookie },
      });
      const meData = await meRes.json();
      console.log(`  [HTTP ${meRes.status}] /api/auth/me (Phiên hợp lệ) -> User: ${meData.user?.username}`);
    }
  } catch (err: any) {
    console.error("  [ERROR] Login test failed:", err.message);
    allOk = false;
  }

  console.log("\n-----------------------------------------");
  console.log(allOk ? "TẤT CẢ ENDPOINTS ĐỀU PHẢN HỒI HOÀN HẢO!" : "CÓ ENDPOINT BỊ LỖI!");
  console.log("-----------------------------------------");
}

testHttp();
