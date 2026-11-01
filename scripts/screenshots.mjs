import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:4173/unflatten/";
const out = "docs/screenshots";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const open = async (viewport) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByText("Ready offline").waitFor({ timeout: 90000 });
  return page;
};
const sample = (page, name) =>
  page.getByRole("button", { name: `Try ${name}`, exact: true }).click();

let page = await open({ width: 1280, height: 860 });
await page.screenshot({ path: `${out}/1-start.png` });

await sample(page, "Photosynthesis");
await page.locator("#progress").waitFor();
await page.waitForFunction(() =>
  /percent/.test(document.querySelector("#progress")?.textContent || ""),
);
await page.screenshot({ path: `${out}/2-processing.png` });
await page.locator("#worksheet").waitFor({ timeout: 90000 });
await page.locator("#answer-b1").fill("Ada");
await page.getByLabel("Sunlight").check();
await page
  .getByRole("textbox", { name: /^Blank 1 of 2/ })
  .fill("carbon dioxide");
await page.evaluate(() => scrollTo(0, 0));
await page.screenshot({ path: `${out}/3-result.png`, fullPage: true });

await page.locator(".tools summary").click();
await page.locator("#size").selectOption("150");
await page.locator("#theme").selectOption("contrast");
await page.evaluate(() => scrollTo(0, 0));
await page.screenshot({ path: `${out}/4-high-contrast-large-text.png` });
await page.context().close();

page = await open({ width: 390, height: 844 });
await sample(page, "The Water Cycle");
await page.locator("#worksheet").waitFor({ timeout: 90000 });
await page.locator(".question").first().scrollIntoViewIfNeeded();
await page.screenshot({ path: `${out}/5-mobile.png` });
await browser.close();
