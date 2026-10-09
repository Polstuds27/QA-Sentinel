// Records the real Linewise app for the demo video: one run online, one with all
// internet access blocked. Nothing here draws or edits the app; it drives the app the
// way a person would and saves what the browser showed.
//
//   node scripts/record-demo.mjs
//
// Needs `ollama serve` running. `npm run whisper` in client/ is used if it is running.
// The script starts its own copy of the app (a server with an empty database and a dev
// server pointed at it), so the calls already stored on this machine are not shown and
// not touched. It writes public/demo/ (footage, the exported report) and
// src/data/footage.json (when each thing happened, and where on screen).

import { execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.resolve(root, "..", "client");
const serverDir = path.resolve(root, "..", "server");
const demoDir = path.join(root, "public", "demo");
const footagePath = path.join(root, "src", "data", "footage.json");

// puppeteer-core is the client's dependency; borrow it rather than install it twice.
const puppeteer = (
  await import(
    pathToFileURL(
      createRequire(path.join(clientDir, "package.json")).resolve(
        "puppeteer-core",
      ),
    )
  )
).default;

const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SAMPLE = path.join(clientDir, "samples", "call-147.m4a");
const APP_PORT = 5183;
const SERVER_PORT = 8797;
const APP_URL = `http://localhost:${APP_PORT}/`;
const VIEWPORT = { width: 1920, height: 1080 };
// Captured at twice the size, so the video can zoom in and stay sharp.
const SCALE = 2;
const FPS = 30;
// Chrome looks nothing up outside this machine: what it is like with the internet off.
const NO_INTERNET = "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost";

const work = mkdtempSync(path.join(tmpdir(), "linewise-demo-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = [];
const cleanUp = () => {
  for (const child of children) child.kill();
  rmSync(work, { recursive: true, force: true });
};
process.on("exit", cleanUp);
process.on("SIGINT", () => process.exit(1));

const reachable = async (url, options) => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500), ...options });
    return true;
  } catch {
    return false;
  }
};
const waitFor = async (url, what) => {
  for (let i = 0; i < 120; i++) {
    if (await reachable(url)) return;
    await sleep(500);
  }
  throw new Error(`${what} did not start (${url}).`);
};

// ----- the app ---------------------------------------------------------------------

if (!(await reachable("http://localhost:11434/api/tags"))) {
  throw new Error("Ollama is not running. Start it with `ollama serve`.");
}
const nativeWhisper = await reachable("http://localhost:8178/", {
  mode: "no-cors",
});
console.log(
  nativeWhisper
    ? "Native Whisper is running."
    : "Native Whisper is not running: the app will transcribe in the browser.",
);

const start = (command, args, options) => {
  const child = spawn(command, args, {
    stdio: ["ignore", "ignore", "inherit"],
    ...options,
  });
  children.push(child);
};
start("node", ["index.mjs"], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(SERVER_PORT),
    LINEWISE_DATA: path.join(work, "server-data"),
  },
});
start("npx", ["vite", "--port", String(APP_PORT), "--strictPort"], {
  cwd: clientDir,
  env: {
    ...process.env,
    LINEWISE_SERVER: `http://localhost:${SERVER_PORT}`,
  },
});
await waitFor(`http://localhost:${SERVER_PORT}/api/info`, "The server");
await waitFor(APP_URL, "The dev server");

// ----- recording -------------------------------------------------------------------

// Saves every frame the browser paints, with the time it was painted.
const capture = async (page, name) => {
  const dir = path.join(work, name);
  mkdirSync(dir, { recursive: true });
  const cdp = await page.createCDPSession();
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `raw-${frames.length}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, at: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: VIEWPORT.width * SCALE,
    maxHeight: VIEWPORT.height * SCALE,
    everyNthFrame: 1,
  });
  while (frames.length === 0) await sleep(50);
  const began = frames[0].at;
  const events = [];
  return {
    // Seconds since the footage began.
    now: () => Date.now() / 1000 - began,
    mark(event, details = {}) {
      const at = Date.now() / 1000 - began;
      events.push({ at: Number(at.toFixed(3)), event, ...details });
      return at;
    },
    events,
    // Lays the frames out at a steady rate (holding each one until the next was
    // painted) and encodes them. No frame is altered.
    async finish() {
      await sleep(400);
      await cdp.send("Page.stopScreencast");
      const length = Date.now() / 1000 - began;
      let index = 0;
      const total = Math.ceil(length * FPS);
      for (let n = 0; n < total; n++) {
        const at = began + n / FPS;
        while (index + 1 < frames.length && frames[index + 1].at <= at) index++;
        linkSync(frames[index].file, path.join(dir, `frame-${n}.jpg`));
      }
      const file = `${name}.mp4`;
      execFileSync(
        "npx",
        [
          "remotion",
          "ffmpeg",
          "-y",
          "-framerate",
          String(FPS),
          "-i",
          path.join(dir, "frame-%d.jpg"),
          "-c:v",
          "libx264",
          "-preset",
          "slow",
          "-crf",
          "16",
          "-pix_fmt",
          "yuv420p",
          "-g",
          String(FPS / 2),
          "-movflags",
          "+faststart",
          path.join(demoDir, file),
        ],
        { cwd: root, stdio: "ignore" },
      );
      console.log(
        `${file}: ${length.toFixed(1)}s, ${frames.length} frames painted ` +
          `(${(frames.length / length).toFixed(0)} a second)`,
      );
      return {
        file: `demo/${file}`,
        fps: FPS,
        seconds: Number((total / FPS).toFixed(3)),
        events,
      };
    },
  };
};

const openApp = async (name, extraArgs = []) => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    // A new profile every time, so the app starts with nothing in it.
    userDataDir: path.join(work, `profile-${name}`),
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
      "--hide-scrollbars",
      // Without this the frames come out at the viewport's size, not SCALE times it.
      `--force-device-scale-factor=${SCALE}`,
      ...extraArgs,
    ],
    protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  await page.setViewport({ ...VIEWPORT, deviceScaleFactor: SCALE });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "dark" },
  ]);
  const session = await page.createCDPSession();
  const downloads = path.join(work, `downloads-${name}`);
  mkdirSync(downloads, { recursive: true });
  await session.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloads,
  });
  // Every address the page asks for that is not this machine.
  const outside = new Set();
  page.on("request", (request) => {
    const url = request.url();
    if (!/^(https?|wss?):/.test(url)) return;
    const { hostname } = new URL(url);
    if (hostname !== "localhost" && hostname !== "127.0.0.1")
      outside.add(hostname);
  });
  page.on("pageerror", (error) =>
    console.log(`[${name}] page error:`, String(error).slice(0, 200)),
  );
  await page.goto(APP_URL, { waitUntil: "networkidle2" });
  // No switch to click: the app checks Ollama by itself and says so in the header.
  await page.waitForFunction(
    () =>
      document.body.textContent?.includes(
        "Local AI ready (Whisper + Ollama 3B)",
      ),
    { timeout: 30000 },
  );
  await page.mouse.move(VIEWPORT.width / 2, 40);
  return { browser, page, downloads, outside };
};

// Where something is on screen right now, in the viewport's own pixels.
const boxOf = async (handle) => {
  const box = await handle.boundingBox();
  if (!box) throw new Error("An element the recording needs is not on screen.");
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
};
const find = async (page, description, fn, ...args) => {
  const handle = (await page.evaluateHandle(fn, ...args)).asElement();
  if (!handle) throw new Error(`Could not find ${description} in the app.`);
  return handle;
};
const withText = (page, selector, text) =>
  find(
    page,
    `"${text}"`,
    (sel, t) =>
      [...document.querySelectorAll(sel)].find((el) =>
        el.textContent?.trim().startsWith(t),
      ) ?? null,
    selector,
    text,
  );
const scrollTo = async (page, top) => {
  await page.evaluate(
    (y) => window.scrollTo({ top: y, behavior: "smooth" }),
    Math.max(0, Math.round(top)),
  );
  await sleep(1100);
};
const scrollY = (page) => page.evaluate(() => window.scrollY);
const click = async (page, rec, handle, what) => {
  const box = await boxOf(handle);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 20 });
  await sleep(350);
  rec.mark("click", { what, x: Math.round(x), y: Math.round(y), box });
  await page.mouse.click(x, y);
};

// Drops the sample call in and lets the app transcribe and score it.
const uploadAndScore = async (page, rec) => {
  const upload = await page.$('[data-testid="upload"]');
  const zone = await find(
    page,
    "the upload area",
    (el) => el.closest("label"),
    upload,
  );
  rec.mark("upload-area", { box: await boxOf(zone) });
  await sleep(900);
  await upload.uploadFile(SAMPLE);
  rec.mark("dropped");
  const button = await page.waitForSelector(
    "button[data-testid^='transcribe-']",
  );
  const row = await find(
    page,
    "the queue row",
    (el) => el.closest("li"),
    button,
  );
  rec.mark("queued", { box: await boxOf(row) });
  await sleep(1100);
  await click(page, rec, button, "Transcribe & score");
  let last = "";
  for (;;) {
    const status = await page.$eval(
      "[data-testid^='queue-status-']",
      (el) => el.textContent ?? "",
    );
    if (status !== last) {
      rec.mark("status", { status });
      last = status;
    }
    if (status.startsWith("done")) break;
    if (
      status === "ready" &&
      rec.events.some((e) => e.event === "status" && e.status !== "ready")
    ) {
      const problem = await page
        .$eval("[role='alert']", (el) => el.textContent)
        .catch(() => "");
      throw new Error(`The app could not score the call: ${problem}`);
    }
    await sleep(80);
  }
  await sleep(1200);
  const call = await page.waitForSelector("button[data-testid^='call-']");
  await scrollTo(page, (await scrollY(page)) + (await boxOf(call)).y - 420);
  rec.mark("call-row", { box: await boxOf(call) });
  await sleep(700);
  await click(page, rec, call, "the scored call");
  await sleep(600);
  await scrollTo(page, 0);
  const score = await find(
    page,
    "the score",
    () =>
      [...document.querySelectorAll("p")].find((el) =>
        /^\d+\s*\/\s*100$/.test(el.textContent?.trim() ?? ""),
      ) ?? null,
  );
  rec.mark("call-open", {
    box: await boxOf(score),
    score: await score.evaluate((el) => el.textContent?.trim()),
    title: await page.$eval("h2", (el) => el.textContent?.trim()),
  });
};

// ----- 1. online: the whole walk-through ------------------------------------------

mkdirSync(demoDir, { recursive: true });
const footage = { recordedAt: new Date().toISOString(), viewport: VIEWPORT };

{
  const { browser, page, downloads, outside } = await openApp("online");
  const rec = await capture(page, "online");
  await sleep(600);
  await uploadAndScore(page, rec);

  const column = (heading) =>
    find(
      page,
      `the ${heading} column`,
      (text) =>
        [...document.querySelectorAll("h3")].find(
          (el) => el.textContent?.trim() === text,
        )?.parentElement ?? null,
      heading,
    );
  const player = await find(
    page,
    "the player",
    () =>
      document.querySelector("button[aria-label='Play']")?.parentElement ??
      null,
  );
  rec.mark("detail", {
    player: await boxOf(player),
    transcript: await boxOf(await column("Transcript")),
    scorecard: await boxOf(await column("Scorecard")),
    // Each scorecard row, and the quoted evidence under the ones that failed.
    checks: await page.evaluate(() => {
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      };
      const list = [...document.querySelectorAll("h3")].find(
        (el) => el.textContent?.trim() === "Scorecard",
      )?.nextElementSibling;
      return [...(list?.children ?? [])].map((row) => ({
        verdict: row.querySelector("span")?.textContent?.trim() ?? "",
        box: box(row),
        evidence: row.querySelector("p") ? box(row.querySelector("p")) : null,
      }));
    }),
    engine: await page.evaluate(
      () =>
        [...document.querySelectorAll("p")].find((el) =>
          el.textContent?.startsWith("Transcribed with"),
        )?.textContent ?? "",
    ),
  });
  await sleep(900);

  // Play it: the transcript follows the audio.
  await click(page, rec, await page.$("button[aria-label='Play']"), "Play");
  rec.mark("playing");
  await sleep(9300);

  // Click the flag for the card read back: playback jumps to that moment.
  const flags = await page.$$("button[aria-label^='Jump to']");
  if (flags.length === 0) throw new Error("The call has no flags to click.");
  const flag = flags[flags.length - 1];
  rec.mark("flags", {
    labels: await Promise.all(
      flags.map((f) => f.evaluate((el) => el.getAttribute("aria-label"))),
    ),
  });
  await click(
    page,
    rec,
    flag,
    await flag.evaluate((el) => el.getAttribute("aria-label")),
  );
  rec.mark("jumped");
  await sleep(5000);
  await click(page, rec, await page.$("button[aria-label='Pause']"), "Pause");
  await sleep(500);

  // Down to the scorecard and the redacted transcript.
  const scorecard = await column("Scorecard");
  await scrollTo(
    page,
    (await scrollY(page)) + (await boxOf(scorecard)).y - 150,
  );
  const redacted = await find(
    page,
    "a redacted line",
    () =>
      [...document.querySelectorAll("li")].find((el) =>
        el.textContent?.includes("[CARD"),
      ) ?? null,
  );
  rec.mark("scorecard", {
    scorecard: await boxOf(scorecard),
    transcript: await boxOf(await column("Transcript")),
    redacted: await boxOf(redacted),
    redactedText: await redacted.evaluate((el) =>
      el.textContent?.replace(/\s+/g, " ").trim(),
    ),
  });
  await sleep(2800);

  // A coaching note, written by the local model.
  const coaching = await find(
    page,
    "the coaching note",
    () =>
      [...document.querySelectorAll("h3")].find(
        (el) => el.textContent?.trim() === "Coaching note",
      )?.parentElement ?? null,
  );
  await scrollTo(page, (await scrollY(page)) + (await boxOf(coaching)).y - 420);
  await click(
    page,
    rec,
    await withText(page, "button", "Generate note"),
    "Generate note",
  );
  await page.waitForFunction(
    (el) =>
      [...el.querySelectorAll("p")].some((p) =>
        p.textContent?.startsWith("\u201c"),
      ),
    { timeout: 180000 },
    coaching,
  );
  rec.mark("coaching", { box: await boxOf(coaching) });
  await sleep(2600);

  // Export the report.
  const exportButton = await withText(page, "button", "Export PDF");
  await scrollTo(
    page,
    (await scrollY(page)) + (await boxOf(exportButton)).y - 640,
  );
  await click(page, rec, exportButton, "Export PDF");
  let pdf;
  for (let i = 0; i < 100 && !pdf; i++) {
    await sleep(100);
    pdf = readdirSync(downloads).find((name) => name.endsWith(".pdf"));
  }
  if (!pdf) throw new Error("The PDF export did not download.");
  rec.mark("exported", { name: pdf });
  await sleep(6000);

  // The other screens, a moment each.
  const openTab = async (name) => {
    await click(
      page,
      rec,
      await withText(page, "header nav button", name),
      `the ${name} tab`,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);
  };
  const section = (heading) =>
    find(
      page,
      `the "${heading}" section`,
      (text) =>
        [...document.querySelectorAll("h2")]
          .find((el) => el.textContent?.includes(text))
          ?.closest("section, [role='tabpanel']") ?? null,
      heading,
    );

  await openTab("Scorecards");
  rec.mark("scorecards", {
    box: await boxOf(await section("Scorecard editor")),
  });
  await sleep(1300);
  await click(
    page,
    rec,
    await withText(page, "button", "Edit scorecard"),
    "Edit scorecard",
  );
  await sleep(2200);

  await openTab("Agents");
  rec.mark("phones", {
    box: await boxOf(await section("Agents and their phones")),
  });
  await sleep(2200);
  const dashboard = await section("Agent dashboard");
  await scrollTo(
    page,
    (await scrollY(page)) + (await boxOf(dashboard)).y - 140,
  );
  rec.mark("dashboard", { box: await boxOf(dashboard) });
  await sleep(2400);

  await openTab("Export");
  rec.mark("export-tab", {
    box: await boxOf(await section("Export (redacted)")),
  });
  await sleep(1800);

  footage.online = await rec.finish();
  footage.online.outside = [...outside];
  await browser.close();

  // The exported report, as the app wrote it. Quick Look draws its first page as an
  // image, on white as a PDF viewer would show it.
  copyFileSync(path.join(downloads, pdf), path.join(demoDir, "report.pdf"));
  const drawn = path.join(work, "report");
  mkdirSync(drawn);
  execFileSync(
    "qlmanage",
    ["-t", "-s", "2400", "-o", drawn, path.join(demoDir, "report.pdf")],
    { stdio: "ignore" },
  );
  copyFileSync(
    path.join(drawn, "report.pdf.png"),
    path.join(demoDir, "report.png"),
  );
  footage.report = {
    pdf: "demo/report.pdf",
    image: "demo/report.png",
    name: pdf,
  };
}

// ----- 2. the same upload with the internet blocked --------------------------------

{
  const { browser, page, outside } = await openApp("offline", [NO_INTERNET]);
  // Shows that the block is real: this address does not resolve from this browser.
  const blocked = await page.evaluate(() =>
    fetch("https://example.com/", { mode: "no-cors" }).then(
      () => false,
      () => true,
    ),
  );
  if (!blocked)
    throw new Error("The internet block is not in effect; not recording.");
  const rec = await capture(page, "offline");
  await sleep(600);
  await uploadAndScore(page, rec);
  await sleep(2500);
  footage.offline = await rec.finish();
  footage.offline.outside = [...outside].filter(
    (host) => host !== "example.com",
  );
  footage.offline.internetBlocked = blocked;
  await browser.close();
}

footage.nativeWhisper = nativeWhisper;
writeFileSync(footagePath, JSON.stringify(footage, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, footagePath)} and public/demo/.`);
if (!existsSync(path.join(demoDir, "report.png")))
  console.log("Warning: report.png was not written.");
process.exit(0);
