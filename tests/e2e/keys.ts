import type { Page } from "@playwright/test";

// Safari's default (and WebKit on macOS) moves Tab between text fields only;
// Option+Tab reaches every control, as a Safari keyboard user would press it.
const isWebKit = (page: Page) => page.context().browser()?.browserType().name() === "webkit";
export const tabKey = (page: Page) => (isWebKit(page) ? "Alt+Tab" : "Tab");
export const shiftTabKey = (page: Page) => (isWebKit(page) ? "Alt+Shift+Tab" : "Shift+Tab");
