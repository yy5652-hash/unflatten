// node scripts/gallery.mjs — real dist app, six 1500 × 1000 Devpost images.
// No build, app-state injection, fixture UI or remote assets. Run outside the sandbox.
// Playwright 1.64.1: github.com/microsoft/playwright/blob/v1.64.1/docs/src/api/class-locator.md
// PDF.js 6.4.299: dist's engine + vendor assets, as in film/stage.html.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, readdir, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "docs/gallery");
const BASE = "/unflatten/";
const SIZE = { width: 1500, height: 1000 };
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".pdf": "application/pdf", ".wasm": "application/wasm",
  ".gz": "application/gzip", ".webmanifest": "application/manifest+json",
};
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let scene = "preflight";

async function visible(locator) {
  try {
    await locator.waitFor({ state: "visible" });
    assert.equal(await locator.count(), 1, "Expected exactly one match");
    return locator;
  } catch (error) {
    throw new Error(`[${scene}] Missing, ambiguous or hidden selector: ${locator}`, { cause: error });
  }
}
const click = async (locator) => (await visible(locator)).click();
const text = async (locator) => (await (await visible(locator)).innerText()).trim();
const fill = async (locator, value) => (await visible(locator)).fill(value);

async function assetFile(pattern, label) {
  const hits = (await readdir(path.join(DIST, "assets"))).filter((file) => pattern.test(file));
  assert.equal(hits.length, 1, `Expected one ${label} in dist/assets; found ${hits.length}. Use the current build.`);
  return `${BASE}assets/${hits[0]}`;
}

async function serve() {
  // Same local dist-serving approach as scripts/serve.mjs, on an owned free port.
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/__gallery/") {
        res.setHeader("Content-Type", "text/html");
        res.end("<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>");
        return;
      }
      if (!url.pathname.startsWith(BASE)) {
        res.writeHead(404).end("Not found");
        return;
      }
      let file = path.resolve(DIST, decodeURIComponent(url.pathname.slice(BASE.length)) || "index.html");
      if (file !== DIST && !file.startsWith(DIST + path.sep)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
      res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function saved(page) {
  await visible(page.locator('#save-status[data-pending="false"]'));
}

async function convert(page, sample) {
  await click(page.locator(`[data-sample="${sample}"]`).first());
  await visible(page.locator("#worksheet"));
  await saved(page);
  await page.evaluate(() => document.fonts.ready);
  await click(page.locator("#dismiss-tip"));
}

async function keyboardTo(page, target) {
  await visible(target);
  for (let n = 0; n < 160; n++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`[${scene}] Keyboard Tab never reached ${target}`);
}

async function accessibleName(locator) {
  const snapshot = await locator.ariaSnapshot();
  const match = snapshot.match(/^\s*-? ?'?textbox "((?:\\.|[^"\\])*)"/m);
  assert(match, `Focused field has no computed textbox name in ariaSnapshot(): ${snapshot}`);
  const name = JSON.parse(`"${match[1]}"`);
  assert(name.trim(), "Computed accessible name is empty");
  return name;
}

async function shot(locator, regions = {}) {
  await visible(locator);
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox();
  assert(bounds?.width && bounds?.height, `No screenshot bounds for ${locator}`);
  const crops = {};
  for (const [name, region] of Object.entries(regions)) {
    await visible(region);
    const r = await region.boundingBox();
    assert(r, `No crop bounds for ${region}`);
    crops[name] = { x: r.x - bounds.x, y: r.y - bounds.y, w: r.width, h: r.height };
  }
  const png = await locator.screenshot({ type: "png", animations: "disabled", caret: "initial", scale: "device" });
  return { src: `data:image/png;base64,${png.toString("base64")}`, w: bounds.width, h: bounds.height, crops };
}

// All UI below is raster data from locator.screenshot(). Cropping/reusing the
// same capture keeps the enlarged Q2 details in their real worksheet context.
function around(image, region, aspect) {
  // Expand into neighbouring real pixels, never stretch a short row into a card.
  const w = Math.max(region.w, region.h * aspect), h = w / aspect;
  if (w > image.w || h > image.h) return region;
  return { x: Math.max(0, Math.min(image.w - w, region.x + (region.w - w) / 2)),
    y: Math.max(0, Math.min(image.h - h, region.y + (region.h - h) / 2)), w, h };
}

function picture(image, rect, { crop, ring = false, phone = false } = {}) {
  const c = crop || { x: 0, y: 0, w: image.w, h: image.h };
  assert(c.w > 0 && c.h > 0 && c.x >= -1 && c.y >= -1 &&
    c.x + c.w <= image.w + 1 && c.y + c.h <= image.h + 1, "Crop lies outside its real screenshot");
  const scale = Math.min(rect.w / c.w, rect.h / c.h);
  const w = c.w * scale, h = c.h * scale;
  return `<div class="capture${ring ? " ring" : ""}${phone ? " phone" : ""}" style="left:${rect.x + (rect.w - w) / 2}px;top:${rect.y + (rect.h - h) / 2}px;width:${w}px;height:${h}px"><img alt="" src="${image.src}" style="width:${image.w * scale}px;height:${image.h * scale}px;left:${-c.x * scale}px;top:${-c.y * scale}px"></div>`;
}

function label(value, x, y, w, className = "") {
  return `<p class="label ${className}" style="left:${x}px;top:${y}px;width:${w}px">${escapeHTML(value)}</p>`;
}

async function compose(stage, fontURL, palette, title, content, file, { phone = false } = {}) {
  assert(title.split(/\s+/).length <= 8, "Gallery titles must be at most eight words");
  await stage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:Atkinson;src:url('${fontURL}') format('woff2');font-weight:200 800;font-display:block}
    :root{${Object.entries(palette).map(([k, v]) => `${k}:${v};`).join("")}}
    *{box-sizing:border-box}html,body{margin:0;width:1500px;height:1000px;overflow:hidden}
    body{background:var(--desk);color:var(--text);font-family:Atkinson,Arial,sans-serif}
    #gallery{position:relative;width:1500px;height:1000px;background:var(--desk)}
    h1{position:absolute;left:40px;top:36px;margin:0;width:1420px;font-size:49px;line-height:1.15;font-weight:650;letter-spacing:-.025em}
    h1.phone-title{left:80px;top:338px;width:680px;font-size:100px;line-height:1.08}
    .capture{position:absolute;overflow:hidden;border-radius:12px;outline:1px solid var(--line);background:var(--panel)}
    .capture img{position:absolute;display:block;max-width:none}
    .capture.ring{outline:2px solid var(--primary);outline-offset:5px}
    .capture.phone{border-radius:30px;outline:7px solid var(--raised);box-shadow:0 0 0 8px var(--line)}
    .label{position:absolute;margin:0;color:var(--shell-muted);font-size:36px;line-height:1.35}
    .label.heading{color:var(--text);font-size:38px;font-weight:600}
    .label.small{font-size:32px}
    .chip{position:absolute;padding:30px 36px;border:1px solid var(--line);border-radius:18px;background:var(--panel);font-size:38px;line-height:1.35;overflow-wrap:anywhere}
    .chip strong{display:block;color:var(--primary);font-size:32px;margin-bottom:14px;font-weight:600}
  </style></head><body><main id="gallery"><h1 class="${phone ? "phone-title" : ""}">${escapeHTML(title)}</h1>${content}</main></body></html>`);
  await stage.evaluate(async () => {
    await document.fonts.ready;
    if (!document.fonts.check("600 49px Atkinson")) throw new Error("dist Atkinson font failed to load");
    await Promise.all([...document.images].map((img) => img.decode()));
    const title = document.querySelector("h1").getBoundingClientRect();
    if (title.right > 1500 || title.bottom > 1000) throw new Error("Gallery title is clipped");
  });
  const png = await stage.locator("#gallery").screenshot({ type: "png", path: path.join(OUT, file), scale: "css" });
  assert.equal(png.readUInt32BE(16), SIZE.width, "Output PNG width");
  assert.equal(png.readUInt32BE(20), SIZE.height, "Output PNG height");
  console.log(`Wrote docs/gallery/${file}`);
}

async function original(page, question) {
  await (await visible(question)).focus();
  await page.keyboard.press("Alt+o");
  await visible(page.locator("#panel-original"));
  await (await visible(page.locator(".original-page > img").first())).evaluate((img) => img.decode());
  const id = await question.getAttribute("data-block");
  assert(id, "Question 2 lacks data-block");
  const linked = page.locator(".source-line.linked");
  assert(await linked.count(), "Original has no highlighted source lines for question 2");
  assert((await linked.evaluateAll((els) => els.map((el) => el.dataset.source))).every((v) => v === id),
    "Original highlights a different question");
  // Read normalised source geometry from the actual app's highlighted overlays.
  const geometry = await page.locator(".original-page").first().evaluate((figure, id) => {
    const image = figure.querySelector("img");
    const lines = [...figure.querySelectorAll(".source-line.linked")].filter((el) => el.dataset.source === id);
    if (!image?.naturalWidth || !lines.length) throw new Error("Question 2 source geometry is missing on page 1");
    const rects = lines.map((el) => ({
      x: parseFloat(el.style.left) / 100, y: parseFloat(el.style.top) / 100,
      w: parseFloat(el.style.width) / 100, h: parseFloat(el.style.height) / 100,
    }));
    const x = Math.max(0, Math.min(...rects.map((r) => r.x)) - .025);
    const y = Math.max(0, Math.min(...rects.map((r) => r.y)) - .025);
    return { x, y, w: Math.min(1, Math.max(...rects.map((r) => r.x + r.w)) + .025) - x,
      h: Math.min(1, Math.max(...rects.map((r) => r.y + r.h)) + .035) - y };
  }, id);
  return geometry;
}

async function renderPDF(stage, bytes, module, vendor) {
  await stage.setContent('<!doctype html><html><body style="margin:0"><canvas id="returned-pdf" style="display:block"></canvas></body></html>');
  return stage.evaluate(async ({ bytes, module, vendor }) => {
    const pdfjs = await import(module);
    if (pdfjs.version !== "6.4.299") throw new Error(`Expected current PDF.js 6.4.299; got ${pdfjs.version}`);
    pdfjs.GlobalWorkerOptions.workerSrc = vendor + "pdf-worker.mjs";
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), cMapUrl: vendor + "pdf/cmaps/",
      cMapPacked: true, standardFontDataUrl: vendor + "pdf/standard_fonts/",
      wasmUrl: vendor + "pdf/wasm/", iccUrl: vendor + "pdf/iccs/" });
    try {
      const doc = await task.promise;
      if (doc.numPages !== 1) throw new Error(`Expected all answers on the original single page; got ${doc.numPages} pages`);
      const pdfPage = await doc.getPage(1);
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: 1400 / base.width });
      const canvas = document.querySelector("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await pdfPage.render({ canvas, viewport }).promise;
      const meta = await doc.getMetadata();
      if (meta.info.Creator !== "Unflatten") throw new Error("Downloaded PDF was not created by Unflatten");
      return { w: canvas.width, h: canvas.height };
    } finally {
      await task.destroy();
    }
  }, { bytes: [...bytes], module, vendor });
}

async function main() {
  await stat(path.join(DIST, "index.html"));
  await stat(path.join(DIST, "samples/photosynthesis-scan.png"));
  const font = await assetFile(/^atkinson-next-.*\.woff2$/, "Atkinson Hyperlegible Next font");
  const pdfModule = await assetFile(/^pdf-.*\.js$/, "PDF.js module");
  await mkdir(OUT, { recursive: true });
  const { server, origin } = await serve();
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 3,
      reducedMotion: "reduce", colorScheme: "dark", locale: "en-GB", acceptDownloads: true,
    });
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(30000);
    const page = await context.newPage();
    const composition = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, reducedMotion: "reduce" });
    composition.setDefaultTimeout(15000);
    const stage = await composition.newPage();
    await stage.goto(`${origin}/__gallery/`);
    scene = "1-before-after";
    await page.goto(origin + BASE);
    // Native OCR can take much longer than ordinary selector waits.
    page.setDefaultTimeout(120000);
    await convert(page, "photosynthesis.pdf");
    page.setDefaultTimeout(15000);
    // Use the app's own reading preferences, rather than restyling screenshot UI.
    // The narrower real layout wraps Q2; 150% text remains readable in 700px cards.
    await click(page.locator("#toggle-tools"));
    await click(page.locator("#size-up"));
    await click(page.locator("#size-up"));
    await click(page.locator("#close-panel"));
    const question = page.locator('.question[data-kind="fill-blank"]');
    await visible(question);
    assert.equal(await page.locator(".question").nth(1).getAttribute("data-block"), await question.getAttribute("data-block"), "Fill-blank block must be question 2");
    const blanks = question.locator("input[data-answer]");
    assert.equal(await blanks.count(), 2, "Question 2 must have two blanks");
    const palette = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(["--desk", "--panel", "--raised", "--line", "--text", "--shell-muted", "--primary"]
        .map((key) => { const value = style.getPropertyValue(key).trim(); if (!value) throw new Error(`Missing app palette token ${key}`); return [key, value]; }));
    });
    const make = (title, content, file, options) => compose(stage, origin + font, palette, title, content, file, options);
    const before = await text(page.locator(".comparison > span").first());
    const counts = before.match(/^Before:\s*(\d+) embedded text characters\s*·\s*(\d+) form fields\.$/);
    assert(counts, `Unexpected real comparison text: ${before}`);
    assert.deepEqual(counts.slice(1), ["0", "0"], "Sample must actually have zero embedded text and form fields");
    const beforeLabel = `${counts[1]} embedded text characters · ${counts[2]} form fields`;
    const banner = await text(page.locator("#conversion-result"));
    assert.match(banner, /^3 questions · 6 labelled fields · Saved on this device$/);
    // Read the desktop comparison above before its real responsive rail hides.
    await page.setViewportSize({ width: 560, height: 1100 });
    const result = await shot(page.locator("#conversion-result"));
    const worksheet = await shot(page.locator("#worksheet"), { question });
    const sourcePage = await context.newPage();
    await sourcePage.goto(origin + "/__gallery/");
    await sourcePage.setContent(`<img id="scan" alt="Original image-only sample" src="${origin + BASE}samples/photosynthesis-scan.png" style="display:block;width:700px">`);
    await sourcePage.locator("#scan").evaluate((img) => img.decode());
    const scan = await shot(sourcePage.locator("#scan"));
    await sourcePage.close();
    const converted = around(worksheet, worksheet.crops.question, scan.w / scan.h);
    const comparisonHeight = Math.min(700, 690 * scan.h / scan.w, 690 * converted.h / converted.w);
    await make("Image-only scan → labelled worksheet",
      label(beforeLabel, 40, 108, 1420, "small") +
      picture(result, { x: 40, y: 162, w: 1420, h: 100 }) +
      picture(scan, { x: 40, y: 280, w: 690, h: comparisonHeight }) +
      picture(worksheet, { x: 770, y: 280, w: 690, h: comparisonHeight }, { crop: converted, ring: true }),
      "1-before-after.png");

    scene = "2-keyboard";
    // A wider real viewport gives the keyboard close-up room for both blanks.
    await page.setViewportSize({ width: 1000, height: 1100 });
    // Real Tab navigation and keystrokes, including the Tab from blank 1 to 2.
    await keyboardTo(page, blanks.nth(0));
    await page.keyboard.type("CO2");
    await page.keyboard.press("Tab");
    assert(await blanks.nth(1).evaluate((el) => el === document.activeElement), "Blank 2 must follow blank 1 by keyboard");
    await page.keyboard.type("oxygen");
    assert.equal(await blanks.nth(0).inputValue(), "CO2");
    assert.equal(await blanks.nth(1).inputValue(), "oxygen");
    assert(await blanks.nth(1).evaluate((el) => el.matches(":focus-visible") && parseFloat(getComputedStyle(el).outlineWidth) > 0), "Blank 2 must have the app's visible keyboard focus ring");
    const name = await accessibleName(blanks.nth(1));
    await make("Answer by keyboard",
      picture(await shot(question), { x: 250, y: 150, w: 1000, h: 520 }, { ring: true }) +
      `<aside class="chip" style="left:250px;top:720px;width:1000px"><strong>Accessible name</strong>${escapeHTML(name)}</aside>`,
      "2-keyboard.png");

    scene = "5-original";
    await original(page, question);
    await question.evaluate((e) => e.scrollIntoView({ block: "center" }));
    const originalPanel = await shot(page.locator("#panel-original"));
    const linkedQuestion = await shot(page.locator("#worksheet"), { question });
    await make("Check it against the original",
      picture(originalPanel, { x: 40, y: 130, w: 690, h: 830 }) +
      picture(linkedQuestion, { x: 770, y: 170, w: 690, h: 750 }, { crop: around(linkedQuestion, linkedQuestion.crops.question, 690 / 750), ring: true }),
      "5-original.png");
    await click(page.locator("#close-panel"));

    scene = "3-returned-pdf";
    const sourceBounds = await original(page, question);
    await click(page.locator("#close-panel"));
    await fill(page.getByRole("textbox", { name: "Name", exact: true }), "Ada");
    await fill(page.getByRole("textbox", { name: "Date", exact: true }), "9 Nov");
    await (await visible(page.getByRole("radio", { name: /Sunlight/ }))).check();
    await fill(page.locator('#worksheet [data-kind="short-answer"] textarea'), "Leaves use sunlight to make food.");
    await saved(page);
    await click(page.locator("#toggle-handin"));
    const teacher = page.getByRole("button", { name: "Teacher — original-layout PDF", exact: true });
    await click(teacher);
    await page.locator("#onpaper-count").filter({ hasText: /^All 6 answers placed$/ }).waitFor({ state: "visible", timeout: 30000 });
    const placement = await text(page.locator("#onpaper-count"));
    assert.equal(placement, "All 6 answers placed", "All answers must be placed on the original page");
    await visible(page.locator("#onpaper-canvas canvas"));
    const pending = page.waitForEvent("download", { timeout: 30000 });
    await click(page.locator("#download-paper"));
    const download = await pending;
    assert.equal(await download.failure(), null, "Teacher PDF download failed");
    const downloadedPath = await download.path();
    assert(downloadedPath, "Teacher PDF download has no local file");
    const bytes = await readFile(downloadedPath);
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF", "Downloaded file is not a PDF");
    // The browser-owned temporary download is removed when its context closes.
    const pdfPage = await context.newPage();
    await pdfPage.goto(origin + "/__gallery/");
    const dimensions = await renderPDF(pdfPage, bytes, origin + pdfModule, origin + BASE + "vendor/");
    const pdf = await shot(pdfPage.locator("#returned-pdf"));
    const inset = { x: sourceBounds.x * dimensions.w, y: sourceBounds.y * dimensions.h,
      w: sourceBounds.w * dimensions.w, h: sourceBounds.h * dimensions.h };
    const blueInk = await pdfPage.locator("#returned-pdf").evaluate((canvas, r) => {
      const data = canvas.getContext("2d").getImageData(Math.floor(r.x), Math.floor(r.y), Math.ceil(r.w), Math.ceil(r.h)).data;
      let pixels = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i] < 140 && data[i + 2] > 60 && data[i + 2] > data[i] * 1.2 && data[i + 2] > data[i + 1] * 1.1) pixels++;
      return pixels;
    }, inset);
    assert(blueInk > 6, "Downloaded PDF has no visible answer ink around question 2");
    await make("The teacher's sheet, with the answers placed",
      picture(pdf, { x: 40, y: 140, w: 720, h: 820 }) +
      label(placement, 800, 155, 660, "heading") + label("Question 2", 800, 230, 660) +
      picture(pdf, { x: 660, y: 320, w: 800, h: 620 }, { crop: around(pdf, inset, 800 / 620), ring: true }),
      "3-returned-pdf.png");
    await pdfPage.close();
    await click(page.locator("#close-panel"));

    scene = "4-practice";
    await page.setViewportSize({ width: 560, height: 1100 });
    const keys = await blanks.evaluateAll((els) => els.map((el) => el.dataset.answer));
    assert(keys.every(Boolean), "Question 2 answer keys are missing");
    await click(page.locator("#fix-mode"));
    const card = page.locator(".fix-card").filter({ has: page.locator(`[data-key="${keys[0]}"]`) });
    await click(card.locator(".answer-key summary"));
    await fill(card.locator(`[data-key="${keys[0]}"]`), "carbon dioxide | CO2");
    await fill(card.locator(`[data-key="${keys[1]}"]`), "oxygen | O2");
    await fill(card.locator('[data-edit="hint"]'), "Think about the two gases.");
    await click(page.locator("#done-fixing"));
    assert.equal(await blanks.nth(0).inputValue(), "CO2", "Review scan must preserve the first answer");
    await fill(blanks.nth(1), "nitrogen");
    await click(page.locator("#check-answers"));
    const feedback = question.locator(".feedback");
    assert.equal(await feedback.getAttribute("data-result"), "retry");
    assert.match(await text(feedback), /Think about the two gases\./);
    const hint = await shot(page.locator("#worksheet"), { question });
    await click(page.getByRole("button", { name: "Retry incorrect answers", exact: true }));
    assert(await blanks.nth(1).evaluate((el) => el === document.activeElement), "Retry must focus the incorrect second blank");
    assert.equal(await blanks.nth(0).inputValue(), "CO2");
    assert.equal(await blanks.nth(1).inputValue(), "nitrogen");
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("oxygen");
    await click(page.locator("#check-answers"));
    assert.equal(await feedback.getAttribute("data-result"), "correct");
    assert.equal(await text(feedback), "Correct.");
    const corrected = await shot(page.locator("#worksheet"), { question });
    await make("A hint, then another try",
      label("Hint", 40, 130, 690, "heading") + label("Corrected", 770, 130, 690, "heading") +
      picture(hint, { x: 40, y: 200, w: 690, h: 650 }, { crop: around(hint, hint.crops.question, 690 / 650), ring: true }) +
      picture(corrected, { x: 770, y: 200, w: 690, h: 650 }, { crop: around(corrected, corrected.crops.question, 690 / 650) }) +
      label("Practice key and hint set by the teacher", 40, 908, 1420, "small"),
      "4-practice.png");

    scene = "6-phone";
    const mobile = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2,
      reducedMotion: "reduce", colorScheme: "dark", locale: "en-GB", isMobile: true, hasTouch: true });
    mobile.setDefaultTimeout(120000);
    const phone = await mobile.newPage();
    await phone.goto(origin + BASE);
    await convert(phone, "rock-cycle.png");
    mobile.setDefaultTimeout(15000);
    const table = phone.locator('[data-kind="table"]');
    await visible(table);
    const field = table.locator("input[data-answer]").first();
    await keyboardTo(phone, field);
    await accessibleName(field); // Require the real table field to be labelled.
    await table.evaluate((el) => {
      const r = el.getBoundingClientRect();
      window.scrollBy({ top: r.top - 85, behavior: "instant" });
    });
    await visible(phone.locator("#player"));
    assert(await field.evaluate((el) => el === document.activeElement && el.matches(":focus-visible")), "Phone table field must retain visible keyboard focus");
    const fieldBox = await field.boundingBox(), barBox = await phone.locator("#player").boundingBox();
    assert(fieldBox && barBox && fieldBox.y >= 0 && fieldBox.y + fieldBox.height < barBox.y && barBox.y + barBox.height <= 800,
      "Phone crop must show the focused table field above the compact reader bar");
    assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Phone app has horizontal overflow");
    // A transparent fixed measuring surface makes locator.screenshot capture
    // exactly the 360 × 800 viewport, including the REAL fixed reader bar. It
    // neither replaces nor restyles any app UI and does not intercept input.
    await phone.evaluate(() => {
      const surface = document.createElement("div");
      surface.id = "gallery-viewport-capture";
      surface.setAttribute("aria-hidden", "true");
      surface.style.cssText = "position:fixed;inset:0;pointer-events:none;";
      document.body.append(surface);
    });
    const phoneImage = await shot(phone.locator("#gallery-viewport-capture"));
    assert.equal(phoneImage.w, 360); assert.equal(phoneImage.h, 800);
    await make("Works on a phone",
      picture(phoneImage, { x: 880, y: 30, w: 423, h: 940 }, { phone: true }),
      "6-phone.png", { phone: true });
  } finally {
    try { await browser?.close(); }
    finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  }
}

main().catch((error) => {
  console.error(`Gallery failed [${scene}]: ${error.stack || error}`);
  if (error.cause) console.error(`Cause: ${error.cause.stack || error.cause}`);
  process.exitCode = 1;
});
