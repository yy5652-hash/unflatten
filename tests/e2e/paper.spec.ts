import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Worksheet } from "../../src/parse/types";
const test = base.extend<{ localOnly: void }>({
  localOnly: [
    async ({ context }, use) => {
      const external: string[] = [];
      context.on("request", (r) => {
        if (
          /^https?:/.test(r.url()) &&
          new URL(r.url()).origin !== "http://127.0.0.1:4173"
        )
          external.push(r.url());
      });
      await use();
      expect(external).toEqual([]);
    },
    { auto: true },
  ],
});
async function saved(page: Page): Promise<Worksheet> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("unflatten");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<Worksheet>((resolve, reject) => {
        const r = db
          .transaction("worksheets")
          .objectStore("worksheets")
          .get(localStorage.getItem("unflatten-current")!);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
}
async function downloadPDF(page: Page, count: number) {
  const event = page.waitForEvent("download");
  await page.locator("#download-paper").click();
  const file = await event,
    bytes = await readFile((await file.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(count);
  expect(pdf.getCreator()).toBe("Unflatten");
}
test("photo corner handles support preview-pixel keyboard movement, pointer input, whole photo, reset and axe", async ({
  page,
}) => {
  await page.goto("");
  await page
    .locator("#camera")
    .setInputFiles([resolve("public/samples/desk-photo.png")]);
  const handle = page.getByRole("button", {
    name: "Top left corner",
    exact: true,
  });
  await expect(handle).toBeVisible();
  const original = await handle.boundingBox();
  expect(original!.width).toBeGreaterThanOrEqual(44);
  expect(original!.height).toBeGreaterThanOrEqual(44);
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  const one = await handle.boundingBox();
  expect(one!.x - original!.x).toBeCloseTo(1, 0);
  await page.keyboard.press("Shift+ArrowDown");
  const ten = await handle.boundingBox();
  expect(ten!.y - one!.y).toBeCloseTo(10, 0);
  await expect(page.locator(".photo-corners [role=status]")).toContainText(
    "Top left corner",
  );
  // Pointer moves exercise the same source-coordinate selection as keyboard input.
  await page.mouse.move(ten!.x + 22, ten!.y + 22);
  await page.mouse.down();
  await page.mouse.move(ten!.x + 27, ten!.y + 27);
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Use whole photo", exact: true })
    .click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  expect((await handle.boundingBox())!.x).toBeCloseTo(original!.x, 0);
  expect(
    (await new AxeBuilder({ page }).include("#photo-queue").analyze())
      .violations,
  ).toEqual([]);
  // The reviewed corners flow through the photo queue's conversion path.
  await page.locator("#convert-photos").click();
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 90000 });
  expect(
    (await saved(page)).blocks.filter((b) =>
      ["multiple-choice", "fill-blank", "short-answer"].includes(b.kind),
    ),
  ).toHaveLength(3);
});
test("desk photo imports automatically, places answers on the original canvas, exports PDF and preserves a blank copy", async ({
  page,
}) => {
  await page.goto("");
  const photoBytes = await readFile(resolve("public/samples/desk-photo.png"));
  const transfer = await page.evaluateHandle((bytes) => {
    const data = new DataTransfer();
    data.items.add(
      new File([new Uint8Array(bytes)], "desk-photo.png", {
        type: "image/png",
      }),
    );
    return data;
  }, Array.from(photoBytes));
  await page
    .locator("#file-zone")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 90000 });
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Ada");
  await page.getByRole("textbox", { name: "Date", exact: true }).fill("2 Nov");
  await page.getByRole("radio", { name: /Sunlight/ }).check();
  await page.getByRole("textbox", { name: /^Blank 1 of 2/ }).fill("air");
  await page.getByRole("textbox", { name: /^Blank 2 of 2/ }).fill("oxygen");
  await page.locator("#worksheet textarea").fill("It takes in light.");
  await expect
    .poll(async () => Object.keys((await saved(page)).answers).length)
    .toBe(6);
  const doc = await saved(page),
    blank = doc.blocks
      .find((b) => b.kind === "fill-blank")!
      .lines.flatMap((l) => l.blanks ?? [])[0];
  expect(blank).toBeTruthy();
  await page.locator("#toggle-handin").click();
  await expect(page.locator("#teacher-format")).toHaveValue("download-paper");
  await expect(page.locator("#onpaper-count")).toHaveText(
    "All 6 answers placed",
  );
  await expect(page.locator("#onpaper-canvas canvas")).toHaveAccessibleName(
    /Page 1.*answers drawn/,
  );
  const blue = () =>
    page.locator("#onpaper-canvas canvas").evaluate((node, box) => {
      const ctx = (node as HTMLCanvasElement).getContext("2d")!,
        data = ctx.getImageData(box.x, box.y, box.width, box.height).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i] < 80 &&
          data[i + 1] < 125 &&
          data[i + 2] > 70 &&
          data[i + 2] > data[i] * 1.4
        )
          n++;
      return n;
    }, blank);
  expect(await blue()).toBeGreaterThan(0);
  await downloadPDF(page, 1);
  expect(
    (await new AxeBuilder({ page }).include("#panel-handin").analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole("radio", { name: "Blank copy", exact: true }).check();
  await expect(page.locator("#onpaper-count")).toHaveText(
    "All 0 answers placed",
  );
  expect(await blue()).toBe(0);
  await downloadPDF(page, 1);
  await page.locator("#close-panel").click();
  await page
    .locator("#worksheet textarea")
    .fill("This answer cannot fit. ".repeat(100));
  await page.locator("#toggle-handin").click();
  await page.getByRole("radio", { name: "With answers", exact: true }).check();
  await expect(page.locator("#onpaper-count")).toHaveText(
    "5 placed, 1 on an extra page",
  );
  await downloadPDF(page, 2);
});
test("digital PDF keeps vector/text geometry; pasted text has no on-original format", async ({
  page,
}) => {
  await page.goto("");
  await page
    .locator("#file")
    .setInputFiles(resolve("public/samples/water-cycle.pdf"));
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 90000 });
  const doc = await saved(page);
  expect(
    doc.blocks
      .filter((b) => b.kind === "identity")
      .every((b) => b.lines.some((l) => l.blanks?.length)),
  ).toBe(true);
  expect(
    doc.blocks
      .find((b) => b.kind === "multiple-choice")!
      .lines.some((l) => l.optionBoxes?.length),
  ).toBe(true);
  await page.locator("#toggle-handin").click();
  await expect(page.locator("#teacher-format")).toHaveValue("download-paper");
  await downloadPDF(page, 1);
  await page.locator("#close-panel").click();
  await page.locator("#new-sheet").click();
  await page.locator("#show-paste").click();
  await page.locator("#paste").fill("Practice\n1. Name a plant.");
  await page.locator("#convert-text").click();
  await page.locator("#toggle-handin").click();
  await expect(
    page.locator('#teacher-format option[value="download-paper"]'),
  ).toHaveCount(0);
});
