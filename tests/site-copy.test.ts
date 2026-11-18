import { it, expect } from "vitest";
import { infoView } from "../src/ui/info";
import { legalView } from "../src/ui/legal";
import { comparison, fixView, resultView, defaults } from "../src/ui/view";
import type { Worksheet } from "../src/parse/types";

const doc: Worksheet = {
  id: "copy", name: "Worksheet", language: "en", blocks: [], answers: {}, updated: 0,
  original: { source: "image", pages: 1, characters: 17, fields: 2, headings: 0, tagged: null },
};
const policy = "Practice copies can include self-check keys. Assignment copies remove keys and correctness data. Neither is an exam-security system.";

it("describes the measured scan, computed embedded text counts and sample task accurately", () => {
  expect(infoView()).toContain("Synthetic perspective-and-shadow test: page correction increases detected questions from 1 to 3. One controlled example, not an accuracy estimate.");
  expect(comparison(doc)).toContain('17</b> embedded text characters · 2 form fields.');
  expect(resultView(doc, defaults, true)).toContain("Try question 2: fill both blanks, compare with Original, then Hand in.");
  expect(resultView(doc, defaults)).toContain("Answer a question");
});

it("keeps Practice and Assignment guidance consistent with the preparation route and privacy boundaries", () => {
  for (const html of [infoView(), infoView(true), fixView(doc, false, false), legalView("terms")])
    expect(html).toContain(policy);
  expect(infoView(true)).toContain("Prepare lesson → Purpose → Preview → Distribute");
  expect(infoView()).toContain("Anyone who receives the link can read the worksheet.");
  expect(infoView()).toContain("Links carry self-check keys only for Practice copies.");
  expect(infoView()).toContain("test results and known gaps are listed in the repository README");
  expect(infoView()).not.toContain("PROGRESS.md");
});

it("limits the accessibility statement to native controls and documented automated and keyboard checks", () => {
  const html = legalView("accessibility");
  for (const text of ["WCAG 2.2 AA", "native labelled controls", "automated axe checks", "keyboard browser checks", "Chromium", "1280 × 900", "360 × 800"])
    expect(html).toContain(text);
  expect(html).not.toMatch(/this version passes|Updated 2 November|screen-reader testing (?:passed|completed)/);
});
