import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:4173/unflatten/",
  out = "docs/screenshots";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  }),
  page = await context.newPage();
await page.goto(base);
await page
  .getByText("Ready offline", { exact: true })
  .waitFor({ timeout: 90000 });
await page.screenshot({ path: `${out}/1-home.png`, fullPage: true });
await page
  .getByRole("button", { name: "Try Photosynthesis", exact: true })
  .click();
await page.locator("#worksheet").waitFor({ timeout: 90000 });
await page.getByRole("radio", { name: /Sunlight/ }).check();
await page
  .getByRole("textbox", { name: /^Blank 1 of 2/ })
  .fill("carbon dioxide");
await page.screenshot({ path: `${out}/2-workspace.png` });
await page.locator(".question").first().focus();
await page.locator("#toggle-original").click();
await page.screenshot({ path: `${out}/3-original-linked.png` });
await page.locator("#toggle-tools").click();
await page.locator('[data-theme-choice="contrast"]').click();
await page.screenshot({ path: `${out}/4-tools-high-contrast.png` });
await page.locator('[data-theme-choice="paper"]').click();
await page.locator('[data-setting="shell"][data-value="light"]').click();
await page.locator("#close-panel").click();
await page.screenshot({ path: `${out}/4b-light-shell.png` });
await page.locator("#toggle-tools").click();
await page.locator('[data-setting="shell"][data-value="dark"]').click();
await page.locator("#close-panel").click();
await page.locator("#fix-mode").click();
await page.screenshot({ path: `${out}/5-check-and-edit.png` });
await page.locator("#done-fixing").click();
await page.locator("#toggle-handin").click();
await page.screenshot({ path: `${out}/6-hand-in.png` });
await page.locator('[data-recipient="teacher"]').click();
await page.screenshot({ path: `${out}/6b-teacher-delivery.png` });
await page.locator("#onpaper-canvas canvas").waitFor();
await page.screenshot({ path: `${out}/6c-onpaper-preview.png` });
await page.locator("#close-panel").click();
await page.locator("#new-sheet").click();
await page.locator("#camera").setInputFiles("public/samples/desk-photo.png");
await page
  .getByRole("button", { name: "Top left corner", exact: true })
  .waitFor();
await page.screenshot({ path: `${out}/6d-corner-handles.png` });
await page.locator("#teachers-link").click();
await page.evaluate(() => scrollTo(0, 0));
await page.screenshot({ path: `${out}/7-teachers.png` });
for (const name of ["privacy", "accessibility", "terms"]) {
  await page.locator(`[data-info="${name}"]`).click();
  await page.screenshot({ path: `${out}/page-${name}.png`, fullPage: true });
  await page.locator("#back-home").click();
}
await context.close();
const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  }),
  m = await mobile.newPage();
await m.goto(base);
await m
  .getByRole("button", { name: "Try Rock Cycle Review", exact: true })
  .click();
await m.locator("#worksheet").waitFor({ timeout: 90000 });
await m.locator(".question").first().scrollIntoViewIfNeeded();
await m.screenshot({ path: `${out}/8-mobile.png` });
await m.locator("#toggle-original").click();
await m.screenshot({ path: `${out}/9-mobile-original.png` });
await browser.close();
