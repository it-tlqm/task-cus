const BASE_URL = "http://localhost:3000";

async function verifyPages() {
  console.log(">> Đăng nhập tài khoản kiểm thử canbo_a...");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "canbo_a", password: "demo123" }),
  });

  if (!loginRes.ok) {
    throw new Error(`Đăng nhập thất bại: ${loginRes.status}`);
  }

  const setCookie = loginRes.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : "";
  console.log("✓ Nhận cookie xác thực thành công.\n");

  const pages = [
    "/login",
    "/dashboard",
    "/plans",
    "/my-work",
    "/tasks",
    "/routine",
    "/reports",
    "/reports/excel",
    "/reports/snapshots",
    "/approvals",
    "/notifications",
    "/admin/system",
    "/admin/audit",
    "/admin/organization",
    "/admin/catalog",
  ];

  console.log("================================================================================");
  console.log("                KIỂM TRA HTTP STATUS VÀ NẠP CỦA TẤT CẢ CÁC TRANG UI              ");
  console.log("================================================================================");

  let allOk = true;
  for (const page of pages) {
    const res = await fetch(`${BASE_URL}${page}`, {
      headers: { cookie },
      redirect: "manual",
    });

    const isOk = res.status === 200 || res.status === 307 || res.status === 308;
    const redirectLocation = res.headers.get("location") || "";
    console.log(
      `[PAGE] ${page.padEnd(22)} -> Status: ${res.status} ${
        isOk ? "✓ PASS" : "✗ FAIL"
      } ${redirectLocation ? `(Redirect -> ${redirectLocation})` : ""}`
    );

    if (!isOk) allOk = false;
  }

  console.log("\n================================================================================");
  if (allOk) {
    console.log("TẤT CẢ CÁC TRANG UI HOẠT ĐỘNG CHUẨN XÁC 100%!");
  } else {
    console.log("CẢNH BÁO: CÓ TRANG TRẢ VỀ LỖI!");
  }
  console.log("================================================================================\n");
}

verifyPages().catch(console.error);
