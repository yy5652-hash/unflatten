import { test, expect, type Page } from "@playwright/test";

async function openText(page: Page, text = "Practice\n1. Plants take in ____ and release ____.\n2. Explain your choice.\n____") {
  await page.goto("./");
  await page.locator("#show-paste").click();
  await page.locator("#paste").fill(text);
  await page.locator("#convert-text").click();
  await expect(page.locator("#worksheet")).toBeVisible();
}
async function tabTo(page: Page, selector: string, reverse = false) {
  for (let n = 0; n < 80; n++) {
    if (await page.locator(selector).evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press(reverse ? "Shift+Tab" : "Tab");
  }
  throw Error(`Keyboard did not reach ${selector}`);
}

// The configured desktop and 360 px mobile projects both run every journey below.
for (const [name, firstControl] of [
  ["handin", '[data-recipient="teacher"]'],
  ["tools", "#focus-mode"],
  ["original", "#back-to-worksheet"],
]) {
  test(`keyboard ${name}: enter the labelled panel and restore opener after Close and Escape`, async ({ page }) => {
    await openText(page);
    const opener = page.locator(`#toggle-${name}`);
    for (const close of ["button", "escape"]) {
      await page.locator('[data-kind="fill-blank"] input').first().focus();
      await tabTo(page, `#toggle-${name}`);
      await page.keyboard.press("Enter");
      await expect(page.locator(`#${name}-title`)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.locator(firstControl)).toBeFocused();
      if (close === "button") {
        await tabTo(page, "#close-panel");
        await page.keyboard.press("Enter");
      } else await page.keyboard.press("Escape");
      await expect(page.locator("#right-panel")).toBeHidden();
      await expect(opener).toBeFocused();
    }
  });
}

test("keyboard Original is non-modal and Back to worksheet returns to the active question", async ({ page }) => {
  await openText(page);
  // Reopening must remember each question and the exact blank, even when
  // tabbing through the non-modal worksheet changes the highlighted block.
  const blanks = page.locator('[data-kind="fill-blank"] input');
  for (const answer of [blanks.first(), blanks.nth(1), page.locator('[data-kind="short-answer"] textarea')]) {
    await answer.focus();
    await page.keyboard.press("Alt+o");
    await expect(page.locator("#original-title")).toBeFocused();
    expect(await page.locator(".paper-scroll").evaluate((el) => (el as HTMLElement).inert)).toBe(false);
    await expect(answer).toBeVisible();
    // Shift+Tab out of the first panel control must reach the worksheet, not wrap.
    await page.locator("#close-panel").focus();
    await page.keyboard.press("Shift+Tab");
    expect(await page.locator("#right-panel").evaluate((el) => el.contains(document.activeElement))).toBe(false);
    await tabTo(page, "#back-to-worksheet");
    await page.keyboard.press("Enter");
    await expect(answer).toBeFocused();
    await expect(page.locator("#right-panel")).toBeHidden();
  }
});

test("keyboard Back to answers restores the edited question and keeps Tab inside the worksheet", async ({ page }) => {
  await openText(page);
  const question = page.locator('[data-kind="fill-blank"]');
  const id = await question.getAttribute("data-block");
  await question.locator("input").first().focus();
  await tabTo(page, "#fix-mode", true);
  await page.keyboard.press("Enter");
  const text = page.locator(`#fix-${id} [data-edit="text"]`);
  await expect(text).toBeFocused();
  await text.fill("1. Plants take in ____ and give out ____.");
  await tabTo(page, "#done-fixing");
  await page.keyboard.press("Enter");
  await expect(question.locator("input").first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(question.locator("input").nth(1)).toBeFocused();
});

test("Retry retains both blanks, hint and feedback, and focuses only the incorrect blank", async ({ page }) => {
  await openText(page);
  await page.locator("#fix-mode").click();
  const card = page.locator(".fix-card").filter({ has: page.locator('[data-key$="-1"]') });
  await card.locator(".answer-key summary").click();
  await card.locator("[data-key]").nth(0).fill("carbon dioxide");
  await card.locator("[data-key]").nth(1).fill("oxygen");
  await card.locator('[data-edit="hint"]').fill("Think about gases.");
  await page.locator("#done-fixing").click();
  const blanks = page.locator('[data-kind="fill-blank"] input');
  await blanks.nth(0).fill("carbon dioxide");
  await blanks.nth(1).fill("nitrogen");
  await page.locator("#check-answers").click();
  const feedback = page.locator('[data-kind="fill-blank"] .feedback');
  const message = await feedback.textContent();
  await page.locator("#retry").click();
  await expect(blanks.nth(0)).toHaveValue("carbon dioxide");
  await expect(blanks.nth(0)).not.toHaveAttribute("aria-invalid", "true");
  await expect(blanks.nth(1)).toHaveValue("nitrogen");
  await expect(blanks.nth(1)).toBeFocused();
  await expect(blanks.nth(1)).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator('[data-kind="fill-blank"] .revision-marker')).toHaveText("Needs another look");
  await expect(feedback).toHaveText(message!);
  await expect(feedback).toContainText("Think about gases.");
  await expect(page.locator("#action-status")).toHaveText("One part of this question needs another look. Your answers have been kept.");
  await blanks.nth(1).fill("oxygen");
  await page.locator("#check-answers").click();
  await expect(feedback).toHaveText("Correct.");
  await expect(page.locator("[aria-invalid=true]")).toHaveCount(0);
  await page.reload();
  await expect(blanks.nth(0)).toHaveValue("carbon dioxide");
  await expect(blanks.nth(1)).toHaveValue("oxygen");
});

test("home primary action runs real Photosynthesis OCR, shows measured result and remembers dismissed tip", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".home-hero .primary:visible")).toHaveCount(1);
  for (const name of ["Photosynthesis: scan → form", "Water Cycle: two columns", "Fractions: math read aloud", "Rock Cycle: table + checkboxes"])
    await expect(page.locator(".sample-chips button").filter({ hasText: name })).toBeVisible();
  await expect(page.locator(".preview-label")).toHaveText("Preview");
  await expect(page.locator(".demo-page [inert]")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "Simulated example: what a screen reader hears from a scan" }))
    .toHaveAccessibleDescription("Simulated with your device voice — not a screen reader recording.");
  await page.getByRole("button", { name: "Try a scanned worksheet — 30 seconds", exact: true }).click();
  await expect(page.locator("#worksheet")).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".question")).toHaveCount(3);
  await expect(page.locator("#conversion-result")).toHaveText("3 questions · 6 labelled fields · Saved on this device");
  await expect(page.locator("#worksheet-tip")).toContainText("Answer a question → compare with Original → Hand in to download your completed sheet.");
  await page.locator("#dismiss-tip").click();
  await expect(page.locator("#worksheet-tip")).toBeHidden();
  await page.reload();
  await expect(page.locator("#worksheet-tip")).toBeHidden();
});

test("Review scan has an honest empty state and structural controls start collapsed", async ({ page }) => {
  await openText(page);
  await page.getByRole("button", { name: "Review scan", exact: true }).click();
  await expect(page.locator(".check-queue")).toContainText("No low-confidence lines were detected. Recognition can still contain mistakes.");
  await expect(page.locator('[data-edit="kind"]').first()).toBeHidden();
  await expect(page.locator("#add-block")).toBeHidden();
  await page.locator(".fix-card").first().getByText("Advanced editing", { exact: true }).click();
  await expect(page.locator('[data-edit="kind"]').first()).toBeVisible();
});

test("speech preflight explains missing voices before Play and reacts to lazy voices", async ({ page }) => {
  await page.addInitScript(() => {
    let installed = false;
    const listeners = new Set<() => void>();
    Object.defineProperty(window, "speechSynthesis", { value: {
      getVoices: () => installed ? [{ name: "Local voice", voiceURI: "test", lang: "en-GB", localService: true, default: true }] : [],
      cancel() {},
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    } });
    Object.assign(window, { installTestVoice: () => { installed = true; listeners.forEach((fn) => fn()); } });
  });
  await openText(page);
  await expect(page.locator("#player-toggle")).toBeDisabled();
  await expect(page.locator("#voice-status")).toHaveText("Read aloud needs an installed device voice");
  await expect(page.locator("#player-toggle")).toHaveAccessibleDescription("Read aloud needs an installed device voice");
  await page.evaluate(() => (window as unknown as { installTestVoice: () => void }).installTestVoice());
  await expect(page.locator("#player-toggle")).toBeEnabled();
  await expect(page.locator("#voice-status")).toBeHidden();
});

test("unavailable on-device models explain requirements before activation and leave answers usable", async ({ page }) => {
  await page.addInitScript(() => {
    for (const api of ["Translator", "LanguageDetector", "Rewriter", "Summarizer", "LanguageModel"])
      Object.defineProperty(window, api, { value: {
        availability: async () => "downloadable",
        create: () => { throw Error("Preflight must never create a model"); },
      } });
  });
  await openText(page);
  await page.locator("#toggle-tools").click();
  await expect(page.getByRole("group", { name: "Needs Chrome's on-device AI", exact: true })).toBeVisible();
  await expect(page.locator("#ai-requirement")).toContainText("already-installed on-device model");
  for (const mode of ["translate", "simplify", "explain"])
    await expect(page.locator(`[data-ai="${mode}"]`)).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.locator('[data-kind="fill-blank"] input').first().fill("carbon dioxide");
  await expect(page.locator('[data-kind="fill-blank"] input').first()).toHaveValue("carbon dioxide");
});

test("installed on-device tools enable independently and translation rechecks the selected language pair", async ({ page }) => {
  await page.addInitScript(() => {
    for (const api of ["Translator", "LanguageDetector", "Rewriter", "Summarizer", "LanguageModel"])
      Object.defineProperty(window, api, { value: {
        availability: async (options?: { targetLanguage?: string }) =>
          api === "Translator" && options?.targetLanguage === "fr" ? "downloadable" : "available",
        create: () => { throw Error("Availability must not create sessions"); },
      } });
  });
  await openText(page);
  await page.locator("#toggle-tools").click();
  for (const mode of ["translate", "simplify", "explain"])
    await expect(page.locator(`[data-ai="${mode}"]`)).toBeEnabled();
  await expect(page.locator("#ai-required")).toBeHidden();
  await page.locator("#translate-language").selectOption("fr");
  await expect(page.locator('#ai-required [data-ai="translate"]')).toBeDisabled();
  await expect(page.locator('#ai-ready [data-ai="simplify"]')).toBeEnabled();
  await expect(page.locator('#ai-ready [data-ai="explain"]')).toBeEnabled();
});
