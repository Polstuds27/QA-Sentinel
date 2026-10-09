// Phase 1+2 end-to-end: wait for the local AI to report ready, upload the TTS sample, transcribe + score,
// print the resulting call. Usage (dev server must be up):
//   node scripts/phase1-e2e.mjs [wavPath]
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wav = process.argv[2] ?? fileURLToPath(new URL("../samples/call-sample.wav", import.meta.url));
if (!wav || !existsSync(wav)) throw new Error(`wav not found: ${wav}`);

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: "new",
  userDataDir: "C:\\Users\\leomo\\AppData\\Local\\Temp\\opencode\\phase1-e2e-profile",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  protocolTimeout: 600000,
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  if (process.env.PHASE1_OFFLINE === "1") {
    await page.setOfflineMode(true);
    console.log("offline-mode: ON for transcription (Wi-Fi-off simulation; localhost still live)");
  }

  // No switch to click: the app checks Ollama by itself and says so in the header.
  await page.waitForFunction(
    () => document.body.textContent?.includes("Local AI ready (Whisper + Ollama 3B)"),
    { timeout: 30000 },
  );
  console.log("local AI: ready");

  const navs = await page.$$("header nav button");
  for (const b of navs) {
    if ((await b.evaluate((el) => el.textContent))?.trim() === "Calls") await b.click();
  }
  await page.waitForSelector('[data-testid="upload"]', { timeout: 15000 });
  const input = await page.$('[data-testid="upload"]');
  await input.uploadFile(wav);
  await page.waitForSelector("button[data-testid^='transcribe-']", { timeout: 30000 });
  console.log("upload: queued");
  await page.click("button[data-testid^='transcribe-']");

  const pageLogs = [];
  page.on("console", (m) => { if (m.type() === "error") pageLogs.push(m.text().slice(0, 200)); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let found = false;
  for (let i = 0; i < 15; i++) {
    await sleep(20000);
    const snap = await page.evaluate(() => ({
      call: !!document.querySelector("button[data-testid^='call-ai-']"),
      queue: [...document.querySelectorAll("[data-testid^='queue-status-']")].map((el) => el.textContent),
      banners: [...document.querySelectorAll("main p")].map((el) => el.textContent).filter((t) => t && t.length < 300),
    }));
    console.log(`t${(i + 1) * 20}s:`, JSON.stringify(snap).slice(0, 400));
    if (process.env.PHASE1_OFFLINE === "1" && snap.queue.some((s) => s.startsWith("scoring"))) {
      await page.setOfflineMode(false);
      console.log("offline-mode: OFF (transcription survived on cache; scoring needs localhost)");
      delete process.env.PHASE1_OFFLINE;
    }
    if (pageLogs.length) console.log("console.errors:", JSON.stringify(pageLogs.slice(-3)));
    if (snap.call) { found = true; break; }
    if (snap.queue.every((s) => s === "ready" || s.startsWith("done")) && i >= 5) break;
  }
  if (!found) throw new Error("AI call never appeared — see status trace above.");
  const summary = await page.$eval("button[data-testid^='call-ai-']", (el) => el.textContent);
  console.log("AI CALL:", summary?.replace(/\s+/g, " ").trim());

  await page.click("button[data-testid^='call-ai-']");
  await new Promise((r) => setTimeout(r, 1500));
  const detail = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log("---DETAIL---");
  console.log(detail);
} finally {
  await browser.close();
}
