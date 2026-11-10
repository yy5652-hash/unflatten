import type { Worksheet } from "../parse/types";

/** Older copies stored teacher descriptions in the student answer map. */
export function migrateWorksheet(doc: Worksheet): Worksheet {
  for (const block of doc.blocks) {
    if (block.kind !== "figure") continue;
    if (block.figureDescription === undefined && doc.answers[block.id])
      block.figureDescription = doc.answers[block.id];
    delete doc.answers[block.id];
  }
  return doc;
}

/** Explicit content model: never carry answer recovery notes into a blank copy. */
export function blankWorksheet(source: Worksheet): Worksheet {
  const doc = migrateWorksheet(structuredClone(source));
  return {
    id: doc.id, name: doc.name, language: doc.language,
    original: doc.original, updated: doc.updated, previews: doc.previews,
    shareId: doc.shareId, assignment: doc.assignment, answers: {},
    blocks: doc.blocks.map((block) => {
      if (doc.assignment) delete block.key;
      return block;
    }),
  };
}
