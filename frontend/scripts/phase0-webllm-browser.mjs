// Phase 0 check B (browser) — drives headed/headless Chrome to /phase0.html,
// waits for the WebLLM verdict marker, prints it. Usage:
//   1. npm run dev -- --port 5173   (background)
//   2. node scripts/phase0-webllm-browser.mjs
import puppeteer from "puppeteer-core";

const swiftshader = process.env.PHASE0_SWIFTSHADER === "1";
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: "new",
  userDataDir: "C:\\Users\\leomo\\AppData\\Local\\Temp\\opencode\\phase0-chrome-profile",
  args: swiftshader
    ? ["--no-sandbox", "--disable-gpu", "--enable-unsafe-swiftshader"]
    : ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => console.log("[page]", m.type(), m.text().slice(0, 300)));
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  await page.goto("http://localhost:5173/phase0.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.title === "PHASE0_DONE" || document.title === "PHASE0_ERROR",
    { timeout: 840000, polling: 2000 },
  );
  console.log("title:", await page.title());
  console.log(await page.$eval("#r", (el) => el.textContent));
} finally {
  await browser.close();
}
