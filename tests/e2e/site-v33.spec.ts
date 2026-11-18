import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

// Both configured projects exercise the real sample: desktop and 360 px Chromium.
async function sample(page: Page) {
  await page.goto("./");
  await page.getByRole("button", { name: "Try a scanned worksheet — 30 seconds", exact: true }).click();
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 90000 });
  await expect(page.locator("#worksheet-tip")).toContainText("Try question 2: fill both blanks, compare with Original, then Hand in.");
}

type Ink = { text: string; size: number; width: number; height: number };

test("Teacher PDF: Photosynthesis ink is at least 9 pt; overflow has question/blank labels and a truthful count", async ({ page }) => {
  await sample(page);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Ada");
  await page.getByRole("textbox", { name: "Date", exact: true }).fill("18 Nov");
  await page.getByRole("radio", { name: /Sunlight/ }).check();
  await page.getByRole("textbox", { name: /^Blank 1 of 2/ }).fill("carbon dioxide");
  await page.getByRole("textbox", { name: /^Blank 2 of 2/ }).fill("oxygen");
  await page.locator("#worksheet textarea").fill("Light.");
  // Observe the actual raster ink used for the preview and PDF, whose text is image-only.
  await page.evaluate(() => {
    const probe = window as typeof window & { answerInk: Ink[] };
    probe.answerInk = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.fillStyle === "#163b79") probe.answerInk.push({
        text, size: Number(this.font.match(/([\d.]+)px/)?.[1]),
        width: this.canvas.width, height: this.canvas.height,
      });
      if (maxWidth === undefined) fill.call(this, text, x, y);
      else fill.call(this, text, x, y, maxWidth);
    };
  });
  await page.locator("#toggle-handin").click();
  await expect(page.locator("#onpaper-count")).toHaveText(/All 6 answers placed|\d+ placed, \d+ on an extra page/);
  const dimensions = await page.locator("#onpaper-canvas canvas").evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height }));
  await page.evaluate(() => { (window as typeof window & { answerInk: Ink[] }).answerInk = []; });
  const waiting = page.waitForEvent("download");
  await page.locator("#download-paper").click();
  const pdf = await PDFDocument.load(await readFile((await (await waiting).path())!));
  const ink = await page.evaluate(() => (window as typeof window & { answerInk: Ink[] }).answerInk);
  const sheet = ink.filter(i => i.width === dimensions.width && i.height === dimensions.height);
  const appendix = ink.filter(i => i.width !== dimensions.width || i.height !== dimensions.height);
  expect(sheet.length).toBeGreaterThan(0);
  // The browser serializes ctx.font with rounded decimal pixels.
  for (const i of sheet) expect(i.size * pdf.getPage(0).getHeight() / dimensions.height).toBeGreaterThanOrEqual(9 - 0.001);
  const overflow = appendix.filter(i => i.text === "").length;
  expect(pdf.getPageCount()).toBe(overflow ? 2 : 1);
  await expect(page.locator("#onpaper-count")).toHaveText(overflow ? `${6 - overflow} placed, ${overflow} on an extra page` : "All 6 answers placed");
  for (const [index, answer] of ["carbon dioxide", "oxygen"].entries()) {
    if (!sheet.map(i => i.text).join(" ").includes(answer))
      expect(appendix.map(i => i.text).join(" ")).toContain(`Question 2, blank ${index + 1} of 2: ${answer}`);
  }
});

test("Hand in: recipient, primary download, preview, Return and feedback files, More ways in DOM order with axe", async ({ page }) => {
  await sample(page);
  await page.locator("#toggle-handin").click();
  await expect(page.locator("#onpaper-count")).toHaveText("All 0 answers placed");
  for (const recipient of ["teacher", "reader"]) {
    await page.locator(`[data-recipient="${recipient}"]`).click();
    const primary = recipient === "teacher" ? "#download-paper" : "#download-html";
    await expect(page.locator(primary)).toBeVisible();
    expect(await page.locator("#panel-handin").evaluate((panel, selector) => {
      const delivery = panel.querySelector<HTMLElement>("[data-delivery]:not([hidden])")!;
      const preview = delivery.querySelector(".onpaper-preview") || delivery.querySelector("p")!;
      const nodes = [panel.querySelector(".recipient-choices")!, panel.querySelector(selector)!, preview, panel.querySelector("#return-feedback")!, panel.querySelector("#more-ways")!];
      return nodes.every((node, i) => !i || !!(nodes[i - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING));
    }, primary)).toBe(true);
    for (const disclosure of ["#return-feedback", "#more-ways"])
      await expect(page.locator(disclosure)).not.toHaveAttribute("open");
    await expect(page.locator("#download-answers")).toBeHidden();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
    expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
