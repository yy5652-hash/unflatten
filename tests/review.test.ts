import { it, expect } from "vitest";
import { classify, textLines } from "../src/parse/classify";
import { correctLine } from "../src/features/review";
import { History } from "../src/features/history";
import { reviewCount } from "../src/ui/view";
import type { Worksheet } from "../src/parse/types";

it("corrects an option source line without replacing the question or the other options", () => {
  const block = classify(
    textLines("1. What powers plants?\na) Sunligt\nb) Moonlight"),
  )[0];
  const confidence = block.lines[1].confidence;
  expect(correctLine(block, 1, "a) Sunlight")).toBe(true);
  expect(block.text).toBe("1. What powers plants?");
  expect(block.options).toEqual(["Sunlight", "Moonlight"]);
  expect(block.lines[1].confidence).toBe(confidence);
});
it("corrects a source line within a longer passage without removing its neighbours", () => {
  const block = classify(
    textLines("Title\nPlants use ligt.\nTheir leaves absorb it."),
  )[1];
  expect(correctLine(block, 0, "Plants use light.")).toBe(true);
  expect(block.text).toContain("Plants use light.");
  expect(block.text).toContain("Their leaves absorb it.");
});
it("retains independent block edits when a source line cannot be mapped safely", () => {
  const block = classify(textLines("1. Original question?"))[0];
  block.text = "A teacher has completely rewritten this question.";
  expect(correctLine(block, 0, "1. Corrected question?")).toBe(false);
  expect(block.text).toBe("A teacher has completely rewritten this question.");
  expect(block.lines[0].text).toBe("1. Corrected question?");
});
it("review acknowledgement survives serialization and remains undoable without inventing OCR confidence", () => {
  const blocks = classify(textLines("Title\n1. A question?"));
  blocks[1].lines[0].confidence = 60;
  const doc: Worksheet = {
    id: "review",
    name: "Title",
    language: "en",
    blocks,
    answers: {},
    updated: 0,
    original: {
      characters: 0,
      fields: 0,
      headings: 0,
      pages: 1,
      source: "image",
      tagged: false,
    },
  };
  const history = new History(doc);
  expect(reviewCount(doc)).toBe(1);
  history.record();
  blocks[1].lines[0].reviewed = true;
  expect(reviewCount(JSON.parse(JSON.stringify(doc)))).toBe(0);
  expect(blocks[1].lines[0].confidence).toBe(60);
  history.undo();
  expect(reviewCount(doc)).toBe(1);
  history.redo();
  expect(reviewCount(doc)).toBe(0);
});
