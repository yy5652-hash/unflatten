import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
const css = readFileSync("src/style.css", "utf8");
function props(body: string) {
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[\da-fA-F]{3,6})\s*;/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
}
const base = props(css.match(/:root\s*\{([^}]+)\}/)![1]);
function luminance(hex: string) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const rgb = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
const ratio = (a: string, b: string) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
it("all six themes meet AA for authored text tokens; high contrast meets AAA", () => {
  for (const theme of ["paper", "dark", "contrast", "cream", "blue", "rose"]) {
    const block =
      css.match(
        new RegExp(
          ":root\\[data-theme=[\"\\']?" +
            theme +
            "[\"\\']?\\]\\s*\\{([^}]+)\\}",
        ),
      )?.[1] || "";
    const p = { ...base, ...props(block) };
    for (const foreground of [
      "ink",
      "muted",
      "blue",
      "success",
      "error",
      "noun",
      "verb",
      "adj",
      "adv",
    ])
      expect(
        ratio(p[foreground], p.paper),
        `${theme}: ${foreground}`,
      ).toBeGreaterThanOrEqual(theme === "contrast" ? 7 : 4.5);
  }
  expect(ratio("#111111", base.highlight)).toBeGreaterThan(7);
});
