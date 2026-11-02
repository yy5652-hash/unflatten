import type { Block } from "../parse/types";

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
