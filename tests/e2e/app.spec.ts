import { test as base, expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import AxeBuilder from "@axe-core/playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
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
async function panel(page: Page, name: string) {
  await page.locator(`button[data-panel="${name}"]:visible`).first().click();
}
async function delivery(page: Page, id: string) {
  const recipient = (
    {
      "download-html": "reader",
      "download-docx": "teacher",
      print: "teacher",
      "download-brf": "braille",
      "preview-braille": "braille",
      "download-epub": "ebook",
    } as Record<string, string>
  )[id];
  if (recipient) {
    await page.locator(`[data-recipient="${recipient}"]`).click();
    if (recipient === "teacher")
      await page.locator("#teacher-format").selectOption(id);
  } else {
    if (
      !(await page
        .locator("#more-ways")
        .evaluate((el: HTMLDetailsElement) => el.open))
    )
      await page.locator("#more-ways summary").click();
  }
}
async function sample(page: Page, name: string) {
  await page.goto("./");
  await page.getByRole("button", { name: new RegExp(`^Try ${name}:`) }).click();
  await openedWorksheet(page, 90000);
}
async function openedWorksheet(page: Page, timeout = 20000) {
  // Reopening this source is an explicit choice; include the real modal in axe coverage.
  await expect(page.locator("#worksheet").or(page.locator("#continue-saved"))).toBeVisible({ timeout });
  if (await page.locator("#continue-saved").isVisible()) {
    await axe(page);
    await expect(page.locator("#continue-saved")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#convert-new")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#continue-saved")).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await expect(page.locator("#worksheet")).toBeVisible({ timeout });
}
async function paste(
  page: Page,
  text = "Keyboard worksheet\nName: ____\n1. Pick a colour.\na) Green\nb) Blue\n2. The sky is ____.\n3. Explain your choice.\n________\n4. Plants need light. True / False",
) {
  await page.goto("./");
  await page.locator("#show-paste").click();
  await page.locator("#paste").fill(text);
  await page.getByRole("button", { name: "Make it accessible" }).click();
  await openedWorksheet(page);
}
async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"])
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
  await tabTo(page, "#show-paste");
  await page.keyboard.press("Space");
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
    "Saved on this device",
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
    .getByRole("button", { name: "Try Photosynthesis: scan → form", exact: true })
    .click();
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".question")).toHaveCount(3);
  await expect(page.locator('[data-kind="fill-blank"] input')).toHaveCount(2);
  await page
    .locator('[data-kind="short-answer"] textarea')
    .fill("Leaves absorb sunlight.");
  const download = page.waitForEvent("download");
  await panel(page, "handin");
  await delivery(page, "download-html");
  await page.locator("#download-html").click();
  expect((await download).suggestedFilename()).toBe(
    "accessible-worksheet.html",
  );
});
test("all screens: zero axe violations in all six themes", async ({ page }) => {
  test.setTimeout(600000);
  for (const shell of ["dark", "light"])
    for (const theme of [
      "paper",
      "dark",
      "contrast",
      "cream",
      "blue",
      "rose",
    ]) {
      await page.goto("./");
      await page.evaluate(
        ({ theme, shell }) => {
          localStorage.setItem(
            "unflatten-preferences",
            JSON.stringify({
              theme,
              shell,
              size: "100",
              spacing: "1.7",
              font: false,
              focus: false,
            }),
          );
          localStorage.removeItem("unflatten-current");
          history.replaceState(null, "", location.pathname + location.search);
        },
        { theme, shell },
      );
      await page.reload();
      await axe(page);
      for (const pageName of ["privacy", "accessibility", "terms"]) {
        await page.locator(`[data-info="${pageName}"]`).click();
        await expect(page.locator("main h1")).toHaveCount(1);
        await axe(page);
        await page.locator("#back-home").click();
      }
      await page.locator("#teachers-link").click();
      await axe(page);
      await page.getByRole("button", { name: "About", exact: true }).click();
      await axe(page);
      await page.getByRole("button", { name: "Back to workspace" }).click();
      await page.locator("#show-paste").click();
      await page.getByRole("button", { name: "Make it accessible" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await axe(page);
      await paste(page);
      await axe(page);
      for (const name of ["tools", "handin"]) {
        await panel(page, name);
        await axe(page);
        if (name === "tools") {
          await page.locator("#help").click();
          await axe(page);
          await page.getByRole("button", { name: "Close shortcuts" }).click();
          await page.getByText("More reading tools", { exact: true }).click();
          await page.locator("#dictionary-word").fill("water");
          await page.locator("#define-word").click();
          await expect(page.locator("#definition")).not.toContainText(
            "Loading",
          );
          await axe(page);
          await page.getByRole("button", { name: "Close dictionary" }).click();
        }
        await page.locator("#close-panel").click();
      }
      await page.locator("#fix-mode").click();
      await axe(page);
      await page.locator("#done-fixing").click();
      await page.locator("#new-sheet").click();
      await page
        .getByRole("button", { name: "Try Photosynthesis: scan → form", exact: true })
        .click();
      await expect(page.locator(".processing")).toBeVisible();
      await axe(page);
      await openedWorksheet(page, 90000);
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
  await panel(page, "tools");
  await page.locator('[data-theme-choice="contrast"]').click();
  await page.locator("#size-up").click();
  await page.locator("#size-up").click();
  await page.locator("#close-panel").click();
  const wait = page.waitForEvent("download");
  await panel(page, "handin");
  await delivery(page, "download-html");
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
  await panel(exported, "tools");
  await exported.locator("#focus-mode").check();
  await exported.locator("#close-panel").click();
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
  await firstPassage.getByText("Advanced editing", { exact: true }).click();
  await firstPassage.locator('[data-edit="kind"]').selectOption("instructions");

  await expect(page.locator("#fix-status")).toHaveText(
    "Changes saved automatically.",
  );
  await page.locator(".fix-card").nth(1).locator(".row-more summary").click();
  await page
    .locator(".fix-card")
    .nth(1)
    .getByRole("button", { name: "Merge with next original block" })
    .click();
  await expect(page.locator("#fix-status")).toHaveText("Blocks merged.");
  await page.locator(".fix-card").nth(1).locator(".row-more summary").click();
  await page
    .locator(".fix-card")
    .nth(1)
    .getByRole("button", { name: /Delete block/ })
    .click();
  await expect(page.locator("#fix-status")).toHaveText("Block deleted.");
  const remaining = await page.locator(".fix-card").count();
  await page.locator("#undo").click();
  await expect(page.locator(".fix-card")).toHaveCount(remaining + 1);
  await page.locator("#redo").click();
  await expect(page.locator(".fix-card")).toHaveCount(remaining);
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
  await panel(page, "tools");
  for (let i = 0; i < 4; i++) await page.locator("#size-up").click();
  await page.locator("#close-panel").click();
  await check();
  await page.locator("#fix-mode").click();
  await check();
  await page.locator("#done-fixing").click();
  await page.locator("#new-sheet").click();
  await check();
  await page.getByRole("button", { name: "About", exact: true }).click();
  await check();
  for (const name of ["privacy", "accessibility", "terms"]) {
    await page.locator(`[data-info="${name}"]`).click();
    await check();
  }
});
test("one-question mode, next unanswered, text export, and delete", async ({
  page,
}) => {
  await paste(page);
  await panel(page, "tools");
  await page.locator("#focus-mode").check();
  await page.locator("#close-panel").click();
  await expect(page.locator(".question:visible")).toHaveCount(1);
  await page.locator('[data-kind="multiple-choice"] input').first().check();
  await page
    .locator("#next-unanswered:visible, #mobile-next-unanswered:visible")
    .click();
  await expect(page.locator('[data-kind="fill-blank"] input')).toBeFocused();
  await page.locator('[data-kind="fill-blank"] input').fill("blue");
  const download = page.waitForEvent("download");
  await panel(page, "handin");
  await delivery(page, "download-text");
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
  await expect(page.locator("#worksheet [data-mic]")).toHaveCount(0);
  await expect(page.locator("#dock-mic")).toHaveCount(1);
  const sentence = page.locator('[data-kind="fill-blank"] .blank-question');
  await expect(sentence).toHaveText(/1\. Plants take in\s+and release\s*\./, {
    useInnerText: true,
  });
});

test("the dock never hides the field that has focus", async ({ page }) => {
  await sample(page, "Rock Cycle Review");
  const fields = page.locator("#worksheet input:not([type=checkbox]):not([type=radio])");
  const count = await fields.count();
  const dock = page.locator("#player");
  for (let i = 0; i < count; i++) {
    await fields.nth(i).focus();
    const field = (await fields.nth(i).boundingBox())!;
    const bar = (await dock.boundingBox())!;
    expect(field.y + field.height).toBeLessThanOrEqual(bar.y);
  }
});

test("sample D: real OCR reconstructs the grid, checkbox options and word bank", async ({
  page,
}) => {
  await sample(page, "Rock Cycle Review");
  await expect(
    page.locator('[data-kind="checkbox"] input[type="checkbox"]'),
  ).toHaveCount(3);
  await expect(page.locator('[data-kind="table"] table')).toHaveCount(1);
  await expect(page.locator('[data-kind="table"] th')).toHaveCount(3);
  await expect(
    page.locator('[data-kind="table"] input[data-answer]'),
  ).toHaveCount(2);
  await expect(page.locator('[data-kind="word-bank"] li')).toHaveCount(3);
  await expect(page.locator('[data-kind="table"]')).toContainText("Igneous");
});
test("Original panel highlights both ways and retains the real image", async ({
  page,
}) => {
  await sample(page, "Photosynthesis");
  const block = page.locator(".question").first();
  const id = await block.getAttribute("data-block");
  await block.focus();
  await panel(page, "original");
  await expect(page.locator(".original-page img")).toHaveCount(1);
  expect(
    await page.locator(`[data-source="${id}"].linked`).count(),
  ).toBeGreaterThan(0);
  const target = page.locator(".question").last(),
    targetId = await target.getAttribute("data-block");
  await page.locator(`[data-source="${targetId}"]`).first().click();
  await expect(target).toBeFocused();
  await expect(target).toHaveClass(/active-block/);
});
test("player highlights words from speech boundary events and pauses", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const voice = {
      name: "Local test voice",
      voiceURI: "local-test",
      lang: "en-GB",
      localService: true,
      default: true,
    };
    // A real utterance only accepts a real voice object, so it is mocked too.
    (
      window as unknown as { SpeechSynthesisUtterance: unknown }
    ).SpeechSynthesisUtterance = class {
      onboundary: unknown = null;
      constructor(public text: string) {}
    };
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [voice],
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        speak: (u: SpeechSynthesisUtterance) => {
          setTimeout(
            () =>
              u.onboundary?.({
                charIndex: 0,
                charLength: 8,
                name: "word",
              } as SpeechSynthesisEvent),
            40,
          );
        },
      },
    });
  });
  await paste(page);
  await page.locator("#player-toggle").click();
  // The whole sentence is lit until the first word boundary arrives.
  await expect(page.locator("#player-text .spoken-word")).toHaveCount(1);
  await expect(page.locator("#player-text .spoken-word")).toHaveText(
    "Keyboard",
  );
  await expect(page.locator("#worksheet .spoken-word").first()).toHaveText(
    "Keyboard",
  );
  await page.locator("#player-toggle").click();
  await expect(page.locator("#action-status")).toContainText("paused");
});
test("teacher key gives announced feedback, retry, hint, undo and redo", async ({
  page,
}) => {
  await paste(page, "Practice\n1. The sky is ____.");
  await page.locator("#fix-mode").click();
  const card = page.locator(".fix-card").last();
  await card.locator(".answer-key summary").click();
  await card.locator("[data-key]").fill("blue | azure");
  await card.locator('[data-edit="hint"]').fill("Think of a clear day.");
  await card.locator('[data-edit="hint"]').blur();
  await page.locator("#undo").click();
  await page.locator(".answer-key summary").click();
  await expect(page.locator('[data-edit="hint"]').last()).toHaveValue("");
  await expect(page.locator("[data-key]")).toHaveValue("blue | azure");
  await page.locator("#undo").click();
  await page.locator(".answer-key summary").click();
  await expect(page.locator("[data-key]")).toHaveValue("");
  await page.locator("#redo").click();
  await page.locator("#redo").click();
  await page.locator(".answer-key summary").click();
  await expect(page.locator("[data-key]")).toHaveValue("blue | azure");
  await page.locator("#done-fixing").click();
  await expect(page.locator('[data-kind="title"] .feedback')).toHaveCount(0);
  const feedback = page.locator('[data-kind="fill-blank"] .feedback');
  await expect(page.locator(".feedback")).toHaveCount(1);
  await expect(feedback).toBeHidden();
  await page.locator("[data-answer]").fill("red");
  await page.locator("#check-answers").click();
  await expect(feedback).toBeVisible();
  await expect(
    page.locator('.feedback[role="status"]').filter({ hasText: "Try again." }),
  ).toContainText("clear day");
  await expect(page.locator("#score")).toContainText("0 of 1");
  await page.locator("#retry").click();
  await expect(page.locator("[data-answer]")).toHaveValue("red");
  await expect(page.locator("[data-answer]")).toBeFocused();
  await expect(page.locator(".feedback")).toContainText("clear day");
  await page.locator("[data-answer]").fill("BLUE");
  await expect(feedback).toBeHidden();
  await page.locator("#check-answers").click();
  await expect(feedback).toBeVisible();
  await expect(page.locator("#score")).toContainText("1 of 1");
  await expect(
    page.locator(".feedback").filter({ hasText: /^Correct\.$/ }),
  ).toHaveCount(1);
});
test("share link opens in a fresh context with the key and no student answers", async ({
  page,
  browser,
}) => {
  await paste(page, "Share practice\n1. The sky is ____.");
  await page.locator("#fix-mode").click();
  await page.locator(".answer-key summary").click();
  await page.locator("[data-key]").fill("blue");
  await page.locator("[data-key]").blur();
  await page.locator("#done-fixing").click();
  await page.locator("[data-answer]").fill("my private answer");
  await panel(page, "handin");
  await delivery(page, "share-students");
  await page.locator("#share-students").click();
  const link = await page.locator("#share-url").inputValue();
  expect(new URL(link).hash).toMatch(/^#worksheet=/);
  await expect(page.locator(".qr svg")).toBeVisible();
  const fresh = await browser.newContext();
  try {
    const p = await fresh.newPage();
    const leaked: string[] = [];
    p.on("request", (r) => {
      if (r.url().includes("private") || r.url().includes("#worksheet"))
        leaked.push(r.url());
    });
    await p.goto(link);
    await expect(p.locator("#worksheet")).toBeVisible();
    await expect(p.locator("[data-answer]")).toHaveValue("");
    await p.locator("[data-answer]").fill("blue");
    await p.locator("#check-answers").click();
    await expect(p.locator("#score")).toContainText("1 of 1");
    expect(leaked).toEqual([]);
  } finally {
    await fresh.close();
  }
});
test("each file export is nonempty and has valid expected structure", async ({
  page,
}, testInfo) => {
  await paste(page, "Export practice\nReading: Chapter\n1. Answer ____.");
  await page.locator("[data-answer]").fill("personal answer");
  await panel(page, "handin");
  for (const [id, extension] of [
    ["download-html", "html"],
    ["download-docx", "docx"],
    ["download-epub", "epub"],
    ["download-brf", "brf"],
    ["download-text", "txt"],
  ]) {
    const wait = page.waitForEvent("download");
    await delivery(page, id);
    await page.locator("#" + id).click();
    const d = await wait;
    const path = testInfo.outputPath("output." + extension);
    await d.saveAs(path);
    const bytes = await readFile(path);
    expect(bytes.length).toBeGreaterThan(20);
    if (extension === "docx")
      expect(strFromU8(unzipSync(bytes)["word/document.xml"])).toContain(
        "Heading1",
      );
    if (extension === "epub")
      expect(strFromU8(unzipSync(bytes)["OEBPS/nav.xhtml"])).toContain(
        'epub:type="toc"',
      );
    if (extension === "html")
      expect(bytes.toString()).toContain("worksheet-data");
    if (extension === "brf")
      expect(
        bytes
          .toString()
          .split(/\r?\n/)
          .every((l) => l.length <= 40),
      ).toBe(true);
  }
  await page.getByLabel("Blank copy", { exact: true }).check();
  const blankWait = page.waitForEvent("download");
  await delivery(page, "download-text");
  await page.locator("#download-text").click();
  const blank = await blankWait;
  const path = testInfo.outputPath("blank.txt");
  await blank.saveAs(path);
  expect(await readFile(path, "utf8")).not.toContain("personal answer");
});
test("worksheet library shows progress, thumbnail, last opened and delete", async ({
  page,
}) => {
  await paste(page, "Library worksheet\n1. Name a planet.");
  await page.locator("[data-answer]").fill("Earth");
  await expect(page.locator("#save-status")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#new-sheet").click();
  await expect(page.locator("#saved")).toContainText("Library worksheet");
  await expect(page.locator("#saved")).toContainText("1 / 1 answered");
  await expect(page.locator("#saved")).toContainText("Last opened");
  await page
    .getByRole("button", { name: "Delete Library worksheet", exact: true })
    .click();
  await expect(page.locator("#saved")).toBeHidden();
});
test("Arabic paste uses the selected language and right-to-left document direction", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#ocr-language").selectOption("ar");
  await page.locator("#show-paste").click();
  await page.locator("#paste").fill("ورقة العمل\n1. اكتب اسمك ____");
  await page.locator("#convert-text").click();
  await expect(page.locator("#worksheet")).toHaveAttribute("lang", "ar");
  await expect(page.locator("#worksheet")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("[data-answer]")).toHaveCount(1);
});
test("multiple photos can be reordered before real OCR conversion", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("./");
  await page
    .locator("#camera")
    .setInputFiles([
      "public/samples/fractions.png",
      "public/samples/photosynthesis-scan.png",
    ]);
  await expect(page.locator(".photo-list li")).toHaveCount(2);
  await page.locator('[data-photo-up="1"]').click();
  await expect(page.locator(".photo-list li").first()).toContainText(
    "photosynthesis",
  );
  await page.locator("#convert-photos").click();
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 120000 });
  await expect(page.locator(".question")).toHaveCount(7);
  await panel(page, "original");
  await expect(page.locator(".original-page")).toHaveCount(2);
});
test("text and Word input are local and produce real answer fields", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#file").setInputFiles({
    name: "practice.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Text practice\n1. Answer ____."),
  });
  await expect(page.locator('[data-kind="fill-blank"]')).toHaveCount(1);
  await panel(page, "handin");
  const wait = page.waitForEvent("download");
  await delivery(page, "download-docx");
  await page.locator("#download-docx").click();
  const d = await wait,
    path = await d.path();
  await page.locator("#close-panel").click();
  await page.locator("#new-sheet").click();
  await page.locator("#file").setInputFiles({
    name: "practice.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await readFile(path!),
  });
  await expect(page.locator("#worksheet")).toContainText("Text practice");
});

test("Review scan queue: acknowledgement persists, text autosaves and undo groups a change", async ({
  page,
}) => {
  await paste(
    page,
    "Check practice\n1. The sky is ____.\n2. Name a planet.\n_______",
  );
  // Seed deterministic OCR review fixtures in the real saved worksheet store.
  await page.evaluate(async () => {
    const request = indexedDB.open("unflatten");
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const db = request.result;
    const transaction = db.transaction("worksheets", "readwrite");
    const store = transaction.objectStore("worksheets"),
      get = store.get(localStorage.getItem("unflatten-current")!);
    get.onsuccess = () => {
      const doc = get.result;
      for (const b of doc.blocks.filter((b: { kind: string }) =>
        ["fill-blank", "short-answer"].includes(b.kind),
      ))
        b.lines = [
          {
            text: b.text,
            confidence: 60,
            page: 1,
            x: 0,
            y: 0,
            width: 100,
            height: 20,
            pageWidth: 100,
            pageHeight: 100,
            crop: "/unflatten/samples/photosynthesis-scan.png",
          },
        ];
      store.put(doc);
    };
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator("#fix-mode")).toHaveText("Review scan (2 lines)");
  await page.locator("#fix-mode").click();
  await expect(page.locator(".check-queue h3")).toHaveText("Review line 1 of 2");
  await expect(page.locator(".check-queue img")).toBeVisible();
  await expect(page.locator(".check-queue")).toContainText("If you can't see the image, ask a sighted helper to compare this line with the Original.");
  await axe(page);
  await page.locator("#queue-text").selectText();
  await page.keyboard.press("Backspace");
  await page.keyboard.type("1. The sea is ____.");
  await expect(page.locator("#save-status")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("#queue-text")).toHaveValue("1. The sky is ____.");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator("#queue-text")).toHaveValue("1. The sea is ____.");
  await page.locator("#looks-right").click();
  await expect(page.locator("#fix-mode")).toHaveText("Review scan (1 line)");
  await expect(page.locator("#save-status")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.reload();
  await page.locator("#fix-mode").click();
  await expect(page.locator(".check-queue h3")).toHaveText("Review line 1 of 1");
  await expect(page.locator("#queue-text")).not.toHaveValue(
    "1. The sea is ____.",
  );
  await page.locator("#done-fixing").click();
  await expect(page.locator("#worksheet")).toContainText("The sea is");
  await expect(page.getByRole("button", { name: /^Save block/ })).toHaveCount(
    0,
  );
});

test("Hand in offers one primary action for each recipient and keeps more ways", async ({
  page,
}) => {
  await paste(page);
  await panel(page, "handin");
  await expect(page.locator('[data-recipient="teacher"]')).toHaveAccessibleName("Teacher — Word document");
  await expect(page.locator('[data-recipient="reader"]')).toHaveAccessibleName("Screen-reader user — accessible HTML");
  for (const [recipient, id, label] of [
    ["teacher", "download-docx", "Download Word"],
    ["reader", "download-html", "Download accessible HTML"],
    ["braille", "download-brf", "Download braille (.brf)"],
    ["ebook", "download-epub", "Download EPUB"],
  ]) {
    await page.locator(`[data-recipient="${recipient}"]`).click();
    await expect(page.locator("#panel-handin .primary:visible")).toHaveCount(1);
    await expect(page.locator(`#${id}`)).toHaveText(label);
    await axe(page);
  }
  await delivery(page, "print");
  await expect(page.locator("#print")).toBeVisible();
  await delivery(page, "preview-braille");
  await page.locator("#preview-braille").click();
  await expect(page.locator("#braille-preview")).toBeVisible();
  await page.locator("#more-ways summary").click();
  await expect(page.locator("#copy")).toBeVisible();
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#share-students")).toBeVisible();
});

test("single voice typing control targets focused, last focused and next unanswered fields", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", {
      value: class {
        onresult?: (event: unknown) => void;
        start() {
          this.onresult?.({ results: [[{ transcript: "dictated answer" }]] });
        }
        stop() {}
      },
    });
  });
  await paste(page, "Voice practice\n1. First ____.\n2. Second ____.");
  await expect(page.locator("#dock-mic")).toBeVisible();
  await expect(page.locator("#worksheet .mic")).toHaveCount(0);
  await page.locator("#dock-mic").click();
  await expect(page.locator("#voice-dialog")).toBeVisible();
  await axe(page);
  await page.locator("#voice-consent").click();
  await expect(page.locator("[data-answer]").first()).toHaveValue(
    "dictated answer",
  );
  const second = page.locator("[data-answer]").nth(1);
  await second.focus();
  await expect(page.locator("#dock-mic")).toHaveAttribute(
    "aria-label",
    /Second/,
  );
  await page.locator("#player-toggle").focus();
  await page.locator("#dock-mic").click();
  await expect(second).toHaveValue("dictated answer");
  await expect(page.locator("[data-answer]").first()).toHaveValue(
    "dictated answer",
  );
  await page.locator("#new-sheet").click();
  await page
    .getByRole("button", { name: "Open worksheet", exact: true })
    .click();
  await page.locator("[data-answer]").first().focus();
  await page.locator("#dock-mic").click();
  await expect(page.locator("[data-answer]").first()).toHaveValue(
    "dictated answer dictated answer",
  );
});

test("Privacy reports the measured live resource count, including a nonzero entry", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator('[data-info="privacy"]').click();
  const actual = () =>
    page.evaluate(
      () =>
        performance.getEntriesByType("resource").filter((e) => {
          const u = new URL(e.name);
          return /^https?:$/.test(u.protocol) && u.origin !== location.origin;
        }).length,
    );
  await expect(page.locator("#request-count")).toHaveText(
    String(await actual()),
  );
  // Synthetic browser timeline fixture: no external network request is made.
  await page.evaluate(() => {
    const original = performance.getEntriesByType.bind(performance);
    performance.getEntriesByType = (type: string) =>
      type === "resource"
        ? [
            ...original(type),
            {
              name: "https://outside.invalid/resource",
              entryType: "resource",
            } as PerformanceEntry,
          ]
        : original(type);
  });
  await page.evaluate(async () => {
    await fetch("./samples/photosynthesis.pdf?privacy-count-fixture=1");
  });
  await expect(page.locator("#request-count")).toHaveText(
    String(await actual()),
  );
  expect(
    Number(await page.locator("#request-count").innerText()),
  ).toBeGreaterThan(0);
  await expect(page.locator("main")).toContainText(
    "turn off your connection and try again",
  );
});
