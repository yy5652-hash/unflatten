import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { unpackShare } from "../../src/features/share";

// Every test runs in the existing desktop and 360 px mobile projects.
// Download APIs: Playwright 1.64.1 official docs, docs/src/api/class-download.md
// at https://github.com/microsoft/playwright/tree/v1.64.1
async function sample(page: Page, name: string) {
  await page.goto("./");
  await page.getByRole("button", { name: new RegExp(`^Try ${name}:`) }).click();
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 90000 });
}
async function paste(page: Page) {
  await page.goto("./");
  await page.locator("#show-paste").click();
  await page.locator("#paste").fill("Practice\nName: ____\n1. Plants use ____ and release ____.\n2. Explain why.\n____");
  await page.locator("#convert-text").click();
  await expect(page.locator("#worksheet")).toBeVisible();
}
async function share(page: Page) {
  await page.locator("#toggle-handin").click();
  await page.locator("#more-ways summary").click();
  await page.locator("#share-students").click();
  return page.locator("#share-url").inputValue();
}
async function html(page: Page, info: TestInfo, name: string, blank: boolean) {
  if (!(await page.locator("#panel-handin").isVisible())) await page.locator("#toggle-handin").click();
  await page.locator(`[name="export-mode"][value="${blank ? "blank" : "answers"}"]`).check();
  await page.locator('[data-recipient="reader"]').click();
  const wait = page.waitForEvent("download");
  await page.locator("#download-html").click();
  const file = info.outputPath(name);
  await (await wait).saveAs(file);
  return file;
}
async function saved(page: Page) {
  await expect(page.locator("#save-status")).toHaveText("Saved on this device");
  await expect(page.locator("#save-status")).toHaveAttribute("data-pending", "false");
}

test("P0-1 Photosynthesis class link resumes through three reloads and original-link reopening; explicit new copy is blank", async ({ page, context }) => {
  await sample(page, "Photosynthesis");
  const link = await share(page);
  await page.locator("#close-panel").click();
  await page.locator("#new-sheet").click();
  await page.locator("[data-delete]").click();
  await expect(page.locator(".library-card")).toHaveCount(0);
  // Same browser device, new tab, as in the live repro.
  const student = await context.newPage();
  await student.goto(link);
  await expect(student).toHaveURL(/#w=/);
  const attempt = student.url();
  await student.locator('[data-kind="identity"] input').first().fill("Student Testname");
  await student.locator('[data-kind="fill-blank"] input').nth(0).fill("carbon dioxide");
  await student.locator('[data-kind="fill-blank"] input').nth(1).fill("oxygen");
  await saved(student);
  for (let n = 0; n < 4; n++) {
    if (n < 3) await student.reload(); else await student.goto(link);
    await expect(student).toHaveURL(attempt);
    await expect(student.locator('[data-kind="identity"] input').first()).toHaveValue("Student Testname");
    await expect(student.locator('[data-kind="fill-blank"] input').nth(0)).toHaveValue("carbon dioxide");
    await expect(student.locator('[data-kind="fill-blank"] input').nth(1)).toHaveValue("oxygen");
    await expect(student.locator("#answer-count")).toHaveText("1 of 3 answered");
  }
  await saved(student);
  await student.locator("#new-sheet").click();
  await expect(student.locator(".library-card")).toHaveCount(1);
  await student.goto(link);
  await student.getByRole("button", { name: "Start a new copy", exact: true }).click();
  await expect(student).not.toHaveURL(attempt);
  await expect(student.locator('[data-kind="identity"] input').first()).toHaveValue("");
  for (const field of await student.locator('[data-kind="fill-blank"] input').all()) await expect(field).toHaveValue("");
  await saved(student);
  const second = student.url();
  await student.locator("#new-sheet").click();
  await expect(student.locator(".library-card")).toHaveCount(2);
  await student.goto(link);
  await expect(student).toHaveURL(second);
});

test("P0-2 exact Photosynthesis punctuation repro retains two typed answers and the key", async ({ page }) => {
  await sample(page, "Photosynthesis");
  const block = page.locator('[data-kind="fill-blank"]'), id = await block.getAttribute("data-block");
  await page.locator("#fix-mode").click();
  await page.locator(`#fix-${id} .answer-key summary`).click();
  await page.locator(`#fix-${id} [data-key]`).nth(0).fill("carbon dioxide");
  await page.locator(`#fix-${id} [data-key]`).nth(1).fill("oxygen");
  await page.locator("#done-fixing").click();
  await block.locator("input").nth(0).fill("carbon dioxide");
  await block.locator("input").nth(1).fill("oxygen");
  await page.locator("#fix-mode").click();
  const prompt = page.locator(`#fix-${id} [data-edit="text"]`);
  await prompt.fill((await prompt.inputValue()) + ".");
  await page.locator("#done-fixing").click();
  await expect(block.locator("input").nth(0)).toHaveValue("carbon dioxide");
  await expect(block.locator("input").nth(1)).toHaveValue("oxygen");
  await page.locator("#check-answers").click();
  await expect(block.locator(".feedback")).toHaveText("Correct.");
  await saved(page);
  await page.reload();
  await expect(block.locator("input").nth(1)).toHaveValue("oxygen");
});

test("P0-2 split and merge preserve surviving blanks; removed slots and deletion show recoverable notes", async ({ page }) => {
  await paste(page);
  const block = page.locator('[data-kind="fill-blank"]'), id = await block.getAttribute("data-block");
  await block.locator("input").nth(0).fill("light");
  await block.locator("input").nth(1).fill("oxygen");
  await page.locator("#fix-mode").click();
  let card = page.locator(`#fix-${id}`);
  await card.locator(".row-more summary").click();
  await card.locator('[data-edit="text"]').evaluate((el: HTMLTextAreaElement) => { const at = el.value.indexOf("and"); el.setSelectionRange(at, at); });
  await card.locator('[data-fix-action="split"]').click();
  await page.locator("#done-fixing").click();
  await expect(page.locator('[data-kind="fill-blank"] input').nth(0)).toHaveValue("light");
  await expect(page.locator('[data-kind="fill-blank"] input').nth(1)).toHaveValue("oxygen");
  await page.locator("#fix-mode").click();
  card = page.locator(`#fix-${id}`);
  await card.locator(".row-more summary").click();
  await card.locator('[data-fix-action="merge"]').click();
  await page.locator("#done-fixing").click();
  await expect(block.locator("input").nth(0)).toHaveValue("light");
  await expect(block.locator("input").nth(1)).toHaveValue("oxygen");
  await page.locator("#fix-mode").click();
  await card.locator('[data-edit="text"]').fill("1. Plants use ____.");
  await expect(card.locator(".affected-answers")).toContainText("Answers affected by your edit");
  await expect(card.locator(".affected-answers")).toContainText("oxygen");
  await page.locator("#done-fixing").click();
  await expect(block.locator("input")).toHaveValue("light");
  await saved(page);
  await page.reload();
  await block.getByRole("button", { name: "Undo this edit" }).click();
  await expect(block.locator("input").nth(1)).toHaveValue("oxygen");
  await page.locator("#fix-mode").click();
  await card.locator(".row-more summary").click();
  await card.locator('[data-fix-action="delete"]').click();
  await expect(page.locator(".affected-answers")).toContainText("light");
  await page.locator(".affected-answers button").click();
  await page.locator("#done-fixing").click();
  await expect(block.locator("input").nth(1)).toHaveValue("oxygen");
});

test("P0-3 Water Cycle description and corrected OCR survive class and blank copies, including answered standalone re-export", async ({ page, context }, info) => {
  await sample(page, "The Water Cycle");
  const description = "Water rises into clouds and falls as rain. Teacher description.";
  await page.getByLabel("Figure description (a helper can add this)").fill(description);
  await saved(page);
  // Simulate a pre-v3.2 IndexedDB worksheet, then exercise load migration.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open("unflatten", 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("worksheets", "readwrite"), store = tx.objectStore("worksheets");
      const request = store.get(localStorage.getItem("unflatten-current")!);
      request.onsuccess = () => {
        const doc = request.result, figure = doc.blocks.find((b: { kind: string }) => b.kind === "figure");
        doc.answers[figure.id] = figure.figureDescription;
        delete figure.figureDescription;
        store.put(doc);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator("[data-figure-description]")).toHaveValue(description);
  await page.locator("#fix-mode").click();
  await page.locator('[data-edit="text"]').first().fill("The Water Cycle — corrected OCR line");
  await page.locator("#done-fixing").click();
  // Populate student data without relying on OCR's exact question wording.
  const fields = page.locator("#worksheet input:not([type=radio]):not([type=checkbox]), #worksheet textarea:not([data-figure-description])");
  for (const field of await fields.all()) await field.fill("PRIVATE_STUDENT_6381");
  await saved(page);
  const link = await share(page);
  const model = unpackShare(new URL(link).hash), raw = JSON.stringify(model);
  expect(raw).toContain(description);
  expect(raw).toContain("corrected OCR line");
  expect(raw).not.toContain("PRIVATE_STUDENT_6381");
  expect(model.answers).toEqual({});
  const blankFile = await html(page, info, "blank.html", true);
  const blankRaw = await readFile(blankFile, "utf8");
  expect(blankRaw).toContain(description);
  expect(blankRaw).toContain("corrected OCR line");
  expect(blankRaw).not.toContain("PRIVATE_STUDENT_6381");
  const answeredFile = await html(page, info, "answered.html", false);
  expect(await readFile(answeredFile, "utf8")).toContain("PRIVATE_STUDENT_6381");
  const standalone = await context.newPage();
  await standalone.goto(pathToFileURL(resolve(answeredFile)).href);
  await expect(standalone.locator('[data-figure-description]')).toHaveValue(description);
  await standalone.locator("#worksheet textarea:not([data-figure-description])").first().fill("PRIVATE_STANDALONE_9823");
  const reexport = await html(standalone, info, "standalone-blank.html", true);
  const reexportRaw = await readFile(reexport, "utf8");
  expect(reexportRaw).toContain(description);
  expect(reexportRaw).toContain("corrected OCR line");
  expect(reexportRaw).not.toMatch(/PRIVATE_STUDENT_6381|PRIVATE_STANDALONE_9823/);
  const reopened = await context.newPage();
  await reopened.goto(pathToFileURL(resolve(reexport)).href);
  await expect(reopened.locator('[data-figure-description]')).toHaveValue(description);
  for (const field of await reopened.locator("#worksheet [data-answer]:not([type=radio]):not([type=checkbox])").all()) await expect(field).toHaveValue("");
});

test("P1 failed IndexedDB write shows a visible download action and recovers after successful save", async ({ page }, info) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    Object.assign(window, { failTestWrites: true });
    IDBObjectStore.prototype.put = function (...args) {
      if ((window as unknown as { failTestWrites: boolean }).failTestWrites) {
        const request = original.apply(this, args);
        this.transaction.abort(); // actual rejected transaction, not a cosmetic status stub
        return request;
      }
      return original.apply(this, args);
    };
  });
  await paste(page);
  const field = page.locator('[data-kind="fill-blank"] input').first();
  await field.fill("UNSAVED_ANSWER_2685");
  await expect(page.locator("#save-status")).toContainText("Not saved — download a copy");
  await expect(page.locator("#save-status")).toBeVisible();
  await page.locator("#save-status").scrollIntoViewIfNeeded();
  await expect(page.locator("#download-unsaved")).toBeInViewport();
  const wait = page.waitForEvent("download");
  await page.locator("#download-unsaved").click();
  const file = info.outputPath("unsaved.html");
  await (await wait).saveAs(file);
  expect(await readFile(file, "utf8")).toContain("UNSAVED_ANSWER_2685");
  await page.evaluate(() => Object.assign(window, { failTestWrites: false }));
  await field.fill("now persisted");
  await saved(page);
  await page.reload();
  await expect(field).toHaveValue("now persisted");
});

test("P1 source-free links explain the missing original once and omit Original controls and tip", async ({ page }) => {
  await paste(page);
  const link = await share(page);
  await page.goto(link);
  await expect(page.locator("#source-unavailable")).toHaveText("This link doesn't include the original page.");
  await expect(page.getByText("This link doesn't include the original page.", { exact: true })).toHaveCount(1);
  await expect(page.locator("#toggle-original")).toHaveCount(0);
  await expect(page.locator("#worksheet-tip")).not.toContainText("Original");
  await page.keyboard.press("Alt+o");
  await expect(page.locator("#right-panel")).toBeHidden();
});

test("P1 reading and AI extras are disclosed; core reading controls remain visible; workspace has no simulated demo", async ({ page }) => {
  await paste(page);
  await expect(page.locator("#simulation-note, [data-demo-speech], .hero-demo, .before-after")).toHaveCount(0);
  await page.locator("#toggle-tools").click();
  for (const selector of ["#focus-mode", "#size-up", '[data-setting="spacing"]', '[data-theme-choice="paper"]', "#speech-voice"])
    await expect(page.locator(selector).first()).toBeVisible();
  for (const selector of ["#syllables", "#pos", "#dictionary-word", "[data-ai]"])
    await expect(page.locator(selector).first()).toBeHidden();
  await page.getByText("More reading tools", { exact: true }).click();
  for (const selector of ["#syllables", "#pos", "#dictionary-word"]) await expect(page.locator(selector)).toBeVisible();
  await page.getByText("More tools", { exact: true }).click();
  await expect(page.locator("#ai-tools")).toBeVisible();
  await expect(page.locator("#ai-requirement")).toContainText("on-device model");
});
