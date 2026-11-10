import { expect, it } from "vitest";
import { classify, textLines } from "../src/parse/classify";
import type { Worksheet } from "../src/parse/types";
import { editBlock, splitBlock, mergeBlock, deleteBlock, undoAffectedEdit } from "../src/features/review";
import { blankWorksheet, migrateWorksheet } from "../src/features/worksheet";
import { packShare, unpackShare, shareIdentity } from "../src/features/share";
import { standaloneDocument } from "../src/standalone-document";
import { defaults } from "../src/ui/view";

function sheet(): Worksheet {
  return { id: "practice", name: "Practice", language: "en", updated: 0,
    blocks: [{ id: "q", kind: "fill-blank", text: "Plants use ____ and release ____.", page: 1, lines: [], key: { "q-0": ["sun"], "q-1": ["oxygen"] } }],
    answers: { "q-0": "light", "q-1": "oxygen" },
    original: { source: "text", characters: 0, headings: 0, fields: 0, tagged: null, pages: 1 } };
}
it("punctuation and OCR text corrections keep two answers and their keys", () => {
  const doc = sheet(), keys = structuredClone(doc.blocks[0].key), answers = { ...doc.answers };
  editBlock(doc, "q", { text: doc.blocks[0].text + "." });
  expect(doc.answers).toEqual(answers);
  expect(doc.blocks[0].key).toEqual(keys);
  expect(doc.editNotes).toBeUndefined();
});
it("removed slots keep surviving answers and keys and expose a persistent undo note", () => {
  let doc = sheet();
  editBlock(doc, "q", { text: "Plants use ____." });
  expect(doc.answers).toEqual({ "q-0": "light" });
  expect(doc.blocks[0].key).toEqual({ "q-0": ["sun"] });
  expect(doc.editNotes?.[0].answers).toEqual({ "q-1": "oxygen" });
  doc = JSON.parse(JSON.stringify(doc));
  doc.answers["q-0"] = "new surviving answer";
  undoAffectedEdit(doc, doc.editNotes![0].id);
  expect(doc.answers).toEqual({ "q-0": "new surviving answer", "q-1": "oxygen" });
  expect(doc.blocks[0].key?.["q-1"]).toEqual(["oxygen"]);
});
it("text-only choice corrections retain the selected option and its key", () => {
  for (const kind of ["multiple-choice", "checkbox"] as const) {
    const doc = sheet();
    doc.blocks[0] = { id: "q", kind, text: "What powers plants?", page: 1,
      lines: [], options: ["Sunligt", "Moonlight"], key: { q: ["Sunligt"] } };
    doc.answers = { q: kind === "checkbox" ? '["Sunligt"]' : "Sunligt" };
    editBlock(doc, "q", { options: ["Sunlight", "Moonlight"] });
    expect(doc.answers.q).toBe(kind === "checkbox" ? '["Sunlight"]' : "Sunlight");
    expect(doc.blocks[0].key).toEqual({ q: ["Sunlight"] });
    expect(doc.editNotes).toBeUndefined();
  }
});
it("split and merge transfer blank slots and keys without losing answers", () => {
  const doc = sheet();
  splitBlock(doc, "q", doc.blocks[0].text.indexOf("and"));
  const next = doc.blocks[1];
  expect(doc.answers).toEqual({ "q-0": "light", [`${next.id}-0`]: "oxygen" });
  expect(next.key).toEqual({ [`${next.id}-0`]: ["oxygen"] });
  mergeBlock(doc, "q");
  expect(doc.answers).toEqual({ "q-0": "light", "q-1": "oxygen" });
  expect(doc.blocks[0].key).toEqual({ "q-0": ["sun"], "q-1": ["oxygen"] });
  expect(doc.editNotes).toBeUndefined();
});
it("kind changes, deleted questions and incompatible merges retain affected values with undo", () => {
  for (const operation of [
    (doc: Worksheet) => editBlock(doc, "q", { kind: "passage" }),
    (doc: Worksheet) => deleteBlock(doc, "q"),
    (doc: Worksheet) => { doc.blocks.unshift({ id: "p", kind: "passage", text: "Intro", lines: [], page: 1 }); mergeBlock(doc, "p"); },
  ]) {
    const doc = sheet();
    operation(doc);
    expect(doc.editNotes?.[0].answers).toEqual({ "q-0": "light", "q-1": "oxygen" });
    undoAffectedEdit(doc, doc.editNotes![0].id);
    expect(doc.answers["q-1"]).toBe("oxygen");
    expect(doc.blocks.find((b) => b.id === "q")).toBeTruthy();
  }
});
it("blank and class copies migrate descriptions, retain corrected content and exclude private recovery notes", async () => {
  const doc = sheet();
  doc.blocks.push({ id: "figure", kind: "figure", text: "Water Cycle", lines: [], page: 1 });
  doc.answers.figure = "Water evaporates into clouds.";
  doc.blocks.push(...classify(textLines("Name: ____")));
  doc.answers[doc.blocks.at(-1)!.id] = "PRIVATE_NAME_459";
  editBlock(doc, "q", { text: "Corrected OCR: Plants use ____." });
  doc.editNotes![0].answers["q-1"] = "PRIVATE_REMOVED_735";
  doc.answers["q-0"] = "PRIVATE_ANSWER_621";
  const blank = blankWorksheet(doc), shared = unpackShare(packShare(doc));
  expect(doc.answers.figure).toBe("Water evaporates into clouds."); // source unchanged
  for (const copy of [blank, shared]) {
    const raw = JSON.stringify(copy);
    expect(raw).toContain("Water evaporates into clouds.");
    expect(raw).toContain("Corrected OCR");
    expect(raw).not.toContain("PRIVATE_");
    expect(copy.answers).toEqual({});
  }
  expect(migrateWorksheet(structuredClone(doc)).blocks.find((b) => b.id === "figure")?.figureDescription).toBe("Water evaporates into clouds.");
  const html = standaloneDocument({ doc: blank, p: defaults, instance: "test", resources: {}, licence: "" }, "", "");
  expect(html).not.toContain("PRIVATE_");
  expect(html).toContain("Water evaporates into clouds.");
  const hash = packShare(doc);
  expect(await shareIdentity(hash)).toBe(await shareIdentity(hash));
  expect(await shareIdentity(hash)).not.toBe(await shareIdentity(packShare({ ...doc, name: "Other" })));
  doc.assignment = true;
  expect(blankWorksheet(doc).blocks[0].key).toBeUndefined();
  expect(unpackShare(packShare(doc)).blocks[0].key).toBeUndefined();
});
