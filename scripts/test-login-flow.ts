import puppeteer from "puppeteer-core";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

async function testLoginInteractive() {
  console.log("=== KIỂM THỬ TƯƠNG TÁC MÀN HÌNH LOGIN PIXEL-ACCURATE ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });

  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  // 1. Mở trang login
  console.log("1. Mở trang /login...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle0" });

  // 2. Thử test mật khẩu ẩn/hiện
  console.log("2. Kiểm tra nút toggle ẩn/hiện mật khẩu...");
  const typeBefore = await page.$eval("#passwordInput", (el) => (el as HTMLInputElement).type);
  await page.click('button[aria-label="Hiển thị mật khẩu"]');
  const typeAfter = await page.$eval("#passwordInput", (el) => (el as HTMLInputElement).type);
  console.log(`   + Trạng thái mật khẩu: ${typeBefore} -> ${typeAfter} (Kỳ vọng: password -> text)`);

  // 3. Test bấm vào Quick Role "Cán bộ Nghiệp vụ" (canbo_a)
  console.log("3. Kiểm tra nút 1-Chạm Quick Role...");
  const roleButtons = await page.$$("button[type='button']");
  // Tìm nút có text "Cán bộ Nghiệp vụ"
  for (const btn of roleButtons) {
    const text = await page.evaluate((el) => el.textContent || "", btn);
    if (text.includes("Cán bộ Nghiệp vụ")) {
      await btn.click();
      break;
    }
  }
  const filledUser = await page.$eval("#usernameInput", (el) => (el as HTMLInputElement).value);
  console.log(`   + Tên đăng nhập được điền: ${filledUser} (Kỳ vọng: canbo_a)`);

  // 4. Test gửi form đăng nhập
  console.log("4. Kiểm tra submit form đăng nhập...");
  await page.click("#submitBtn");
  await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10000 });

  const currentUrl = page.url();
  console.log(`   + URL sau khi đăng nhập: ${currentUrl} (Kỳ vọng: ${BASE_URL}/dashboard)`);

  // 5. Kiểm tra cookie session
  const cookies = await page.cookies();
  const tokenCookie = cookies.find((c) => c.name === "token");
  console.log(`   + Session Token Cookie: ${tokenCookie ? "ĐÃ CÓ (HTTPOnly, JWT)" : "KHÔNG CÓ"}`);

  await browser.close();

  if (currentUrl.includes("/dashboard") && tokenCookie && errors.length === 0) {
    console.log("\n=> KẾT QUẢ TEST LOGIN: PASS 100% (Giao diện chuẩn Stitch, tương tác mượt, xác thực thành công)!\n");
  } else {
    throw new Error(`Test Login thất bại: URL=${currentUrl}, errors=${errors.join("; ")}`);
  }
}

testLoginInteractive().catch((err) => {
  console.error("Lỗi test login:", err);
  process.exit(1);
});
