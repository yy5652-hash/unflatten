import { answerKeys, type Block, type Worksheet } from "../parse/types";

/** Reconcile only slots touched by an edit. Missing values remain recoverable. */
export function preserveEditedAnswers(
  doc: Worksheet, before: Block[], after: Block[], index: number,
  remap: Record<string, string> = {},
) {
  const surviving = new Set(after.flatMap(answerKeys));
  const affected: Record<string, string> = {};
  for (const block of before) {
    const edited = after.find((b) => b.id === block.id);
    // Choices use their displayed text as values. A spelling correction must
    // keep the selected option and its key attached to the same choice.
    if (edited && edited.kind === block.kind &&
      ["multiple-choice", "checkbox"].includes(block.kind) &&
      block.options?.length === edited.options?.length) {
      const corrected = (value: string) => {
        if (edited.options?.includes(value)) return value;
        const index = block.options?.indexOf(value) ?? -1;
        return index >= 0 ? edited.options![index] : value;
      };
      const value = doc.answers[block.id];
      if (value && block.kind === "checkbox") {
        try {
          const values: unknown = JSON.parse(value);
          if (Array.isArray(values) && values.every((v) => typeof v === "string"))
            doc.answers[block.id] = JSON.stringify(values.map(corrected));
        } catch { /* Preserve unrecognised older answers verbatim. */ }
      } else if (value) doc.answers[block.id] = corrected(value);
      if (edited.key?.[block.id])
        edited.key[block.id] = edited.key[block.id].map(corrected);
    }
    for (const slot of answerKeys(block)) {
      const target = remap[slot] ?? slot;
      if (surviving.has(target)) {
        if (target !== slot) {
          if (doc.answers[slot] !== undefined) doc.answers[target] = doc.answers[slot];
          const dest = after.find((b) => answerKeys(b).includes(target))!;
          if (block.key?.[slot]) (dest.key ??= {})[target] = block.key[slot];
          delete doc.answers[slot];
        }
      } else {
        if (doc.answers[slot]?.trim()) affected[slot] = doc.answers[slot];
        delete doc.answers[slot];
      }
    }
  }
  for (const block of after)
    if (block.key)
      for (const slot of Object.keys(block.key))
        if (!answerKeys(block).includes(slot)) delete block.key[slot];
  if (Object.keys(affected).length) {
    (doc.editNotes ??= []).push({
      id: crypto.randomUUID(), blockId: after[0]?.id ?? before[0].id,
      text: before.map((b) => b.text).join(" "), answers: affected,
      before: structuredClone(before), afterIds: after.map((b) => b.id), index,
    });
  }
}

export function editBlock(doc: Worksheet, id: string, patch: Partial<Block>) {
  const index = doc.blocks.findIndex((b) => b.id === id), block = doc.blocks[index];
  const before = structuredClone(block);
  Object.assign(block, patch);
  preserveEditedAnswers(doc, [before], [block], index);
}

export function splitBlock(doc: Worksheet, id: string, at: number) {
  const index = doc.blocks.findIndex((b) => b.id === id), block = doc.blocks[index];
  if (at <= 0 || at >= block.text.length || !block.text.slice(0, at).trim() || !block.text.slice(at).trim())
    throw Error("Place the cursor inside the block text, then choose Split.");
  if (block.text[at - 1] === "_" && block.text[at] === "_")
    throw Error("Split between answer blanks, not inside a blank.");
  const before = structuredClone(block);
  const next: Block = { ...structuredClone(block), id: "b-" + crypto.randomUUID(),
    text: block.text.slice(at).trim(), lines: [], key: {},
    kind: block.kind === "title" ? "heading" : block.kind };
  block.text = block.text.slice(0, at).trim();
  const remap: Record<string, string> = {};
  if (block.kind === "fill-blank") {
    const left = answerKeys(block).length;
    answerKeys(before).slice(left).forEach((slot, i) => { remap[slot] = `${next.id}-${i}`; });
    if (!left) block.kind = "passage";
    if (!answerKeys(next).length) next.kind = "passage";
  }
  doc.blocks.splice(index + 1, 0, next);
  preserveEditedAnswers(doc, [before], [block, next], index, remap);
}

export function mergeBlock(doc: Worksheet, id: string) {
  const index = doc.blocks.findIndex((b) => b.id === id), block = doc.blocks[index], next = doc.blocks[index + 1];
  if (!next) return;
  const before = structuredClone([block, next]);
  const remap: Record<string, string> = {};
  if (block.kind === "fill-blank" && next.kind === "fill-blank") {
    const offset = answerKeys(block).length;
    answerKeys(next).forEach((slot, i) => { remap[slot] = `${block.id}-${offset + i}`; });
  }
  block.text += " " + next.text;
  block.lines.push(...next.lines);
  block.options = [...(block.options ?? []), ...(next.options ?? [])];
  doc.blocks.splice(index + 1, 1);
  preserveEditedAnswers(doc, before, [block], index, remap);
}

export function deleteBlock(doc: Worksheet, id: string) {
  const index = doc.blocks.findIndex((b) => b.id === id);
  const before = doc.blocks.splice(index, 1);
  preserveEditedAnswers(doc, before, [], index);
}

export function undoAffectedEdit(doc: Worksheet, id: string) {
  const note = doc.editNotes?.find((n) => n.id === id);
  if (!note) return;
  const currentIndex = doc.blocks.findIndex((b) => note.afterIds.includes(b.id));
  doc.blocks = doc.blocks.filter((b) => !note.afterIds.includes(b.id));
  doc.blocks.splice(currentIndex < 0 ? note.index : currentIndex, 0, ...structuredClone(note.before));
  Object.assign(doc.answers, note.answers);
  doc.editNotes = doc.editNotes!.filter((n) => n !== note);
}

/** Apply a source-line correction to its structured text without replacing other lines.
 * Option labels and other parser-added/removed prefixes remain outside the edit.
 * If a user has already rewritten the block independently, retain the line correction
 * and let the row editor resolve the ambiguity rather than overwriting their work.
 */
export function correctLine(
  block: Block,
  index: number,
  text: string,
): boolean {
  const line = block.lines[index];
  if (!line) return false;
  const before = line.text;
  if (before === text) return true;
  let prefix = 0,
    suffix = 0;
  while (
    prefix < Math.min(before.length, text.length) &&
    before[prefix] === text[prefix]
  )
    prefix++;
  while (
    suffix < Math.min(before.length, text.length) - prefix &&
    before[before.length - suffix - 1] === text[text.length - suffix - 1]
  )
    suffix++;
  const oldEnd = before.length - suffix,
    newEnd = text.length - suffix;
  let mapped = false;
  const replace = (value: string) => {
    if (!value) return value;
    if (value.includes(before) && before) {
      mapped = true;
      return value.replace(before, text);
    }
    const start = before.indexOf(value),
      end = start + value.length;
    if (start >= 0 && prefix >= start && oldEnd <= end) {
      mapped = true;
      return (
        value.slice(0, prefix - start) +
        text.slice(prefix, newEnd) +
        value.slice(oldEnd - start)
      );
    }
    return value;
  };
  block.text = replace(block.text);
  block.options = block.options?.map(replace);
  block.pairs = block.pairs?.map(replace);
  block.cells = block.cells?.map((row) => row.map(replace));
  line.text = text;
  return mapped;
}
