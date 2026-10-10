// Times the real app on this machine: from pressing "Transcribe & score" to the scored
// call appearing, for each recording in samples/, with each speech engine.
//
//   node scripts/benchmark.mjs [runs per recording, default 3]
//
// Needs `ollama serve`. Native Whisper is timed too if `npm run whisper` is running.
// The script starts its own copy of the app with empty in-browser storage, so the calls
// already on this machine are not shown and not touched. It prints a table and, as its
// last line, the same numbers as JSON. These are timings of scripted test recordings on
// one machine. They say how fast it ran here, not how accurate it is.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = Number(process.argv[2] ?? 3);
const PORT = 5199;
const APP = `http://localhost:${PORT}/`;
const NATIVE_WHISPER = "http://localhost:8178";
const SAMPLES = ["call-147.m4a", "call-148.m4a", "call-149.m4a"];
const CHROME =
  process.env.CHROME ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "/usr/bin/google-chrome");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = (url) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok || r.status < 500, () => false);

if (!(await up("http://localhost:11434/api/tags"))) {
  console.error("Ollama is not running. Start it with `ollama serve` first.");
  process.exit(1);
}
const nativeUp = await up(NATIVE_WHISPER);

// No upload server at this address, so the app keeps its calls in the browser profile
// this script throws away.
const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: client,
  env: { ...process.env, LINEWISE_SERVER: "http://localhost:1" },
  stdio: "ignore",
  shell: process.platform === "win32",
});
const stop = () => vite.kill();
process.on("exit", stop);
for (let i = 0; i < 120 && !(await up(APP)); i++) await sleep(500);

// Presses the button on the newest queue row and watches its status text change.
const timeOneCall = (page) =>
  page.evaluate(async () => {
    const button = document.querySelector("button[data-testid^='transcribe-']");
    const row = button.closest("li");
    const status = () => row.querySelector("[data-testid^='queue-status-']")?.textContent ?? "";
    const seen = {};
    const start = performance.now();
    button.click();
    for (;;) {
      await new Promise((r) => setTimeout(r, 20));
      const now = performance.now() - start;
      const text = status();
      for (const stage of ["transcribing", "redacting", "scoring", "done"]) {
        if (text.startsWith(stage) && seen[stage] === undefined) seen[stage] = now;
      }
      if (seen.done !== undefined) break;
      if (text === "ready" && now > 1000) throw new Error(document.querySelector('[role="alert"]')?.textContent ?? "The call was not scored.");
      if (now > 600_000) throw new Error("Timed out after 10 minutes.");
    }
    return {
      transcribe: (seen.redacting ?? seen.scoring) / 1000,
      redact: (seen.scoring - (seen.redacting ?? seen.scoring)) / 1000,
      score: (seen.done - seen.scoring) / 1000,
      total: seen.done / 1000,
    };
  });

async function runEngine(engine) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir: mkdtempSync(path.join(tmpdir(), "linewise-benchmark-")),
    args: ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
    protocolTimeout: 900_000,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    if (engine === "browser") {
      // With the native service out of reach, the app falls back to Whisper base in the tab.
      await page.setRequestInterception(true);
      page.on("request", (r) => (r.url().startsWith(NATIVE_WHISPER) ? r.abort() : r.continue()));
    }
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.textContent?.includes("Local AI ready (Whisper + Ollama 3B)"), { timeout: 60_000 });

    const one = async (sample) => {
      // Clear the file field first: choosing the same file twice in a row is not a change.
      await page.$eval('[data-testid="upload"]', (el) => { el.value = ""; });
      await (await page.$('[data-testid="upload"]')).uploadFile(path.join(client, "samples", sample));
      await page.waitForSelector("button[data-testid^='transcribe-']", { timeout: 15_000 });
      const times = await timeOneCall(page);
      await page.waitForSelector("button[data-testid^='call-']", { timeout: 15_000 });
      const row = await page.$eval("button[data-testid^='call-']", (el) => el.textContent ?? "");
      return { ...times, length: row.match(/· (\d+:\d\d) ·/)?.[1] ?? "", result: row.match(/(\d+ \/ 100 · [A-Za-z ]+)$/)?.[1] ?? row.trim().slice(-30) };
    };

    // The first call loads the models (Whisper into the tab, the scoring model into
    // Ollama), so it is run once and not counted.
    // The dev server reloads the page once the first time it meets the speech worker's
    // code; if that happens, wait for the app to come back and start the warm-up again.
    let warmup;
    for (let attempt = 0; ; attempt++) {
      try {
        warmup = await one(SAMPLES.at(-1));
        break;
      } catch (e) {
        if (attempt >= 2 || !String(e).includes("Execution context was destroyed")) throw e;
        await page.waitForFunction(() => document.body.textContent?.includes("Local AI ready (Whisper + Ollama 3B)"), { timeout: 60_000 });
      }
    }
    console.log(`${engine}: warm-up call took ${warmup.total.toFixed(1)} s (not counted)`);
    const rows = [];
    for (const sample of SAMPLES) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        runs.push(await one(sample));
        console.log(`${engine}: ${sample} run ${i + 1}: ${runs.at(-1).total.toFixed(1)} s (${runs.at(-1).result})`);
      }
      rows.push({ engine, sample, length: runs[0].length, results: [...new Set(runs.map((r) => r.result))], runs });
    }
    return { warmup: warmup.total, rows };
  } finally {
    await browser.close();
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const spread = (runs, key) => {
  const xs = runs.map((r) => r[key]);
  return `${median(xs).toFixed(1)} (${Math.min(...xs).toFixed(1)} to ${Math.max(...xs).toFixed(1)})`;
};
const ENGINE_NAME = { native: "Whisper large-v3-turbo (whisper.cpp)", browser: "Whisper base (in browser)" };

try {
  const engines = [...(nativeUp ? ["native"] : []), "browser"];
  const out = {};
  for (const engine of engines) out[engine] = await runEngine(engine);

  console.log(`\nSeconds, median of ${RUNS} runs (lowest to highest).\n`);
  console.log("| Recording | Length | Speech engine | Transcribe and split speakers | Redaction | Scoring (7 rules) | Total | Result |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const engine of engines) {
    for (const r of out[engine].rows) {
      console.log(`| ${r.sample} | ${r.length} | ${ENGINE_NAME[engine]} | ${spread(r.runs, "transcribe")} | ${spread(r.runs, "redact")} | ${spread(r.runs, "score")} | ${spread(r.runs, "total")} | ${r.results.join("; ")} |`);
    }
  }
  console.log(`\n${JSON.stringify({ runs: RUNS, nativeWhisper: nativeUp, out })}`);
} finally {
  stop();
}
