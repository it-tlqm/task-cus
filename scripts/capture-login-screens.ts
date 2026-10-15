/** Chụp màn hình thật trang đăng nhập (desktop + mobile) bằng Brave headless. */
import puppeteer from "puppeteer-core";

const BRAVE = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";

async function main() {
  const browser = await puppeteer.launch({
    executablePath: BRAVE,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:3111/login", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    await page.setViewport({ width: 1440, height: 900 });
    await page.screenshot({ path: "docs/screenshots/login-desktop.png" });
    const demoGone = await page.evaluate(() => !document.body.innerText.includes("Tài khoản UAT"));
    const hasOfficial = await page.evaluate(() =>
      document.body.innerText.includes("CHI CỤC HẢI QUAN KHU VỰC XVI - HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG")
    );
    const logoOk = await page.evaluate(() => {
      const imgs = Array.from(document.images).filter((i) => i.src.includes("logo-haiquan"));
      return imgs.length > 0;
    });
    console.log("demo block removed:", demoGone);
    console.log("official name shown:", hasOfficial);
    console.log("logo img present:", logoOk);
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: "docs/screenshots/login-mobile.png" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    console.log("screenshots saved to docs/screenshots/");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
