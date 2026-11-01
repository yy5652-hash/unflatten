import { test as base, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import AxeBuilder from "@axe-core/playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const origin = "http://127.0.0.1:4173";
const test = base.extend<{ networkGuard: void }>({
  networkGuard: [
    async ({ context }, use) => {
      const escaped: string[] = [];
      context.on("request", (req) => {
        const url = req.url();
        if (/^https?:/.test(url) && new URL(url).origin !== origin)
          escaped.push(url);
      });
      await use();
      expect(escaped, "No third-party runtime requests").toEqual([]);
    },
    { auto: true },
  ],
});
async function sample(page: Page, name: string) {
  await page.goto("./");
  await page.getByRole("button", { name: `Try ${name}`, exact: true }).click();
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 90000 });
}
async function paste(
  page: Page,
  text = "Keyboard worksheet\nName: ____\n1. Pick a colour.\na) Green\nb) Blue\n2. The sky is ____.\n3. Explain your choice.\n________\n4. Plants need light. True / False",
) {
  await page.goto("./");
  await page.locator("#paste").fill(text);
  await page.getByRole("button", { name: "Make it accessible" }).click();
  await expect(page.locator("#worksheet")).toBeVisible();
}
async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      description: v.description,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}
async function tabTo(page: Page, selector: string) {
  for (let i = 0; i < 100; i++) {
    if (
      await page
        .locator(selector)
        .evaluate((el) => el === document.activeElement)
    )
      return;
    await page.keyboard.press("Tab");
  }
  throw Error(`Could not tab to ${selector}`);
}
test("sample A: real OCR produces exactly three questions and correct kinds", async ({
  page,
}) => {
  await sample(page, "Photosynthesis");
  await expect(page.locator("#worksheet h1")).toContainText("Photosynthesis");
  await expect(page.locator(".question")).toHaveCount(3);
  await expect(page.locator('[data-kind="multiple-choice"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="fill-blank"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="short-answer"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="fill-blank"] input')).toHaveCount(2);
  await expect(page.locator('[data-kind="identity"]')).toHaveCount(2);
  await expect(page.locator('[data-stat="characters"]')).toHaveText("0");
  await expect(page.locator('[data-stat="fields"]')).toHaveText("6");
});
test("sample B: left column before right, figure description becomes alt text", async ({
  page,
}) => {
  await sample(page, "The Water Cycle");
  const texts = await page.locator("#worksheet .block").allTextContents();
  const joined = texts.join("\n");
  expect(joined.indexOf("Water vapour rises")).toBeLessThan(
    joined.indexOf("Think: Back to the ground"),
  );
  await expect(page.locator(".question")).toHaveCount(4);
  await expect(page.locator('[data-kind="figure"]')).toHaveCount(1);
  await page
    .getByLabel("Figure description (a helper can add this)")
    .fill("Water rises, forms clouds, and falls as rain.");
  await expect(page.locator('[data-kind="figure"] img')).toHaveAttribute(
    "alt",
    "Water rises, forms clouds, and falls as rain.",
  );
  expect(
    Number(
      (await page.locator('[data-stat="characters"]').innerText()).replace(
        /,/g,
        "",
      ),
    ),
  ).toBeGreaterThan(400);
});
test("sample C: phone photo yields two blanks and two true/false questions", async ({
  page,
}) => {
  await sample(page, "Fractions in the Kitchen");
  await expect(page.locator(".question")).toHaveCount(4);
  await expect(page.locator('[data-kind="fill-blank"]')).toHaveCount(2);
  await expect(page.locator('[data-kind="true-false"]')).toHaveCount(2);
});
test("keyboard only: open, fill every field, and persist across reload", async ({
  page,
}) => {
  await page.goto("./");
  await tabTo(page, "#paste");
  await page.keyboard.type(
    "Keyboard worksheet\nName: ____\n1. Pick a colour.\na) Green\nb) Blue\n2. The sky is ____.\n3. Explain your choice.\n________\n4. Plants need light. True / False",
  );
  await tabTo(page, "#convert-text");
  await page.keyboard.press("Space");
  await expect(page.locator("#worksheet")).toBeVisible();
  await tabTo(page, '[data-kind="identity"] input');
  await page.keyboard.type("Alex");
  await tabTo(page, '[data-kind="multiple-choice"] input[value="Green"]');
  await page.keyboard.press("Space");
  await tabTo(page, '[data-kind="fill-blank"] input');
  await page.keyboard.type("blue");
  await tabTo(page, '[data-kind="short-answer"] textarea');
  await page.keyboard.type("I can see a clear sky.");
  await tabTo(page, '[data-kind="true-false"] input[value="True"]');
  await page.keyboard.press("Space");
  await expect(page.locator("#answer-count")).toHaveText("4 of 4 answered");
  await expect(page.locator("#save-status")).toHaveText(
    "Answers saved on this device.",
  );
  await expect(page.locator("#save-status")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.reload();
  await expect(page.locator("#answer-count")).toHaveText("4 of 4 answered");
  await expect(page.locator('[data-kind="identity"] input')).toHaveValue(
    "Alex",
  );
  await expect(page.locator('[data-kind="short-answer"] textarea')).toHaveValue(
    "I can see a clear sky.",
  );
});
test("offline after first load: reload and run image-only sample A end to end", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(page.locator("#offline-status")).toContainText("Ready offline", {
    timeout: 90000,
  });
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Try Photosynthesis", exact: true })
    .click();
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".question")).toHaveCount(3);
  await expect(page.locator('[data-kind="fill-blank"] input')).toHaveCount(2);
  await page
    .locator('[data-kind="short-answer"] textarea')
    .fill("Leaves absorb sunlight.");
  const download = page.waitForEvent("download");
  await page.locator("#download-html").click();
  expect((await download).suggestedFilename()).toBe(
    "accessible-worksheet.html",
  );
});
test("all screens: zero axe violations in light, dark and high contrast", async ({
  page,
}) => {
  for (const theme of ["light", "dark", "contrast"]) {
    await page.goto("./");
    await page.evaluate((theme) => {
      localStorage.setItem(
        "unflatten-preferences",
        JSON.stringify({
          theme,
          size: "100",
          spacing: "1.7",
          font: false,
          focus: false,
        }),
      );
      localStorage.removeItem("unflatten-current");
    }, theme);
    await page.reload();
    await axe(page);
    await page.getByRole("button", { name: "About & privacy" }).click();
    await axe(page);
    await page.getByRole("button", { name: "Back to workspace" }).click();
    await page.getByRole("button", { name: "Make it accessible" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await axe(page);
    await paste(page);
    await axe(page);
    await page.locator("#fix-mode").click();
    await axe(page);
    await page.locator("#done-fixing").click();
    await page.locator("#new-sheet").click();
    await page
      .getByRole("button", { name: "Try Photosynthesis", exact: true })
      .click();
    await expect(page.locator(".processing")).toBeVisible();
    await axe(page);
    await expect(page.locator("#worksheet")).toBeVisible({ timeout: 90000 });
    await page.locator("#new-sheet").click();
  }
});
test("exported HTML opens via file URL, retains answers and tools, passes axe", async ({
  page,
  context,
}, testInfo) => {
  await paste(page);
  await page
    .locator('[data-kind="short-answer"] textarea')
    .fill("My answer with <script> kept as text.");
  await page.locator(".tools summary").click();
  await page.locator("#theme").selectOption("contrast");
  await page.locator("#size").selectOption("150");
  const wait = page.waitForEvent("download");
  await page.locator("#download-html").click();
  const download = await wait;
  const file = testInfo.outputPath("worksheet.html");
  await download.saveAs(file);
  const exported = await context.newPage();
  await exported.goto(pathToFileURL(resolve(file)).href);
  await expect(
    exported.locator('[data-kind="short-answer"] textarea'),
  ).toHaveValue("My answer with <script> kept as text.");
  await expect(exported.locator("html")).toHaveAttribute(
    "data-theme",
    "contrast",
  );
  await axe(exported);
  await exported.locator(".tools summary").click();
  await exported.locator("#focus-mode").check();
  await expect(exported.locator(".question:visible")).toHaveCount(1);
  await exported.locator("#next-question").click();
  await expect(exported.locator("#question-position")).toHaveText("2 of 4");
});
test("fix mode: keyboard edits, kind change, merge, delete, and persistence", async ({
  page,
}) => {
  await paste(
    page,
    "Repair worksheet\nReading: Explore\nA line of text.\nAnother separate paragraph.\n1. Say something.\n_______",
  );
  await page.locator("#fix-mode").click();
  const card = page.locator(".fix-card").filter({
    has: page
      .getByLabel("Block text", { exact: true })
      .filter({ hasText: "A line" }),
  });
  const firstPassage = page
    .locator(".fix-card")
    .filter({
      has: page.locator('textarea[data-edit="text"]', {
        hasText: "A line of text.",
      }),
    })
    .first();
  await expect(firstPassage).toBeVisible();
  await firstPassage
    .locator('[data-edit="text"]')
    .fill("Repaired text goes here.");
  await firstPassage.locator('[data-edit="kind"]').selectOption("instructions");
  await firstPassage.getByRole("button", { name: /Save block/ }).click();
  await expect(page.locator("#fix-status")).toHaveText("Block saved.");
  await page
    .locator(".fix-card")
    .nth(1)
    .getByRole("button", { name: "Merge with next original block" })
    .click();
  await expect(page.locator("#fix-status")).toHaveText("Blocks merged.");
  await page
    .locator(".fix-card")
    .nth(1)
    .getByRole("button", { name: /Delete block/ })
    .click();
  await expect(page.locator("#fix-status")).toHaveText("Block deleted.");
  await page.locator("#done-fixing").click();
  await expect(page.locator("#worksheet")).not.toContainText(
    "Repaired text goes here.",
  );
  await page.reload();
  await expect(page.locator("#worksheet")).not.toContainText(
    "Repaired text goes here.",
  );
});
test("reflow: no horizontal overflow at 320px and 200% text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const check = async () =>
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  await page.goto("./");
  await check();
  await sample(page, "The Water Cycle");
  await check();
  await page.locator(".tools summary").click();
  await page.locator("#size").selectOption("200");
  await check();
  await page.locator("#fix-mode").click();
  await check();
  await page.locator("#done-fixing").click();
  await page.locator("#new-sheet").click();
  await check();
  await page.getByRole("button", { name: "About & privacy" }).click();
  await check();
});
test("one-question mode, next unanswered, text export, and delete", async ({
  page,
}) => {
  await paste(page);
  await page.locator(".tools summary").click();
  await page.locator("#focus-mode").check();
  await expect(page.locator(".question:visible")).toHaveCount(1);
  await page.locator('[data-kind="multiple-choice"] input').first().check();
  await page.locator("#next-unanswered").click();
  await expect(page.locator('[data-kind="fill-blank"] input')).toBeFocused();
  await page.locator('[data-kind="fill-blank"] input').fill("blue");
  const download = page.waitForEvent("download");
  await page.locator("#download-text").click();
  expect((await download).suggestedFilename()).toBe("worksheet-answers.txt");
  await page.locator("#delete-sheet").click();
  await expect(page.locator(".notice")).toContainText("deleted");
  await page.reload();
  await expect(page.locator("#saved")).toBeHidden();
});
test("digital PDF: blanks drawn as vector lines become fields; underlined words do not", async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const sheet = pdf.addPage([612, 792]);
  const text = (s: string, x: number, y: number, size = 12) =>
    sheet.drawText(s, { x, y: 792 - y, size, font });
  const rule = (x0: number, x1: number, y: number) =>
    sheet.drawLine({
      start: { x: x0, y: 792 - y },
      end: { x: x1, y: 792 - y },
      thickness: 1,
    });
  text("Rivers of Europe", 60, 60, 22);
  text("1. The longest river in Europe is", 60, 120);
  rule(250, 370, 122);
  text("2. Important rivers carry trade.", 60, 170);
  rule(60, 120, 172);
  text("3. Describe one river you know.", 60, 220);
  rule(60, 500, 260);
  rule(60, 500, 290);
  await page.goto("./");
  await page.locator("#file").setInputFiles({
    name: "rivers.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".question")).toHaveCount(3);
  await expect(page.locator('[data-kind="fill-blank"] input')).toHaveCount(1);
  await expect(page.locator('[data-kind="short-answer"] textarea')).toHaveCount(
    2,
  );
});
test("the screen reader hears each blank once, with its position", async ({
  page,
}) => {
  await paste(page, "Sheet\n1. Plants take in ____ and release ____.");
  await expect(
    page.getByRole("textbox", {
      name: /^Blank 1 of 2: 1\. Plants take in blank/,
    }),
  ).toHaveCount(1);
  const sentence = page.locator('[data-kind="fill-blank"] .blank-question');
  await expect(sentence).toHaveText(/1\. Plants take in\s+and release\s*\./, {
    useInnerText: true,
  });
});
