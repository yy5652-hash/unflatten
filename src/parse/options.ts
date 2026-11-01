import type { Word } from "./rules";
/** Wide word-box gaps split inline options only when a real leading option marker exists. */
export function inlineOptions(words: Word[]): string | undefined {
  const ordered = [...words].sort((a, b) => a.x - b.x),
    text = ordered.map((w) => w.text).join(" ");
  if (!/^\s*(?:\(?[a-hA-H][).]|[☐□○◯])\s*/.test(text)) return;
  const groups: Word[][] = [[]];
  for (const w of ordered) {
    const previous = groups.at(-1)!.at(-1);
    if (
      previous &&
      w.x - previous.x - previous.width > Math.max(w.height * 1.8, 30)
    )
      groups.push([]);
    groups.at(-1)!.push(w);
  }
  if (groups.length < 2 || groups.length > 8) return;
  return groups
    .map((g, i) => {
      const s = g.map((w) => w.text).join(" ");
      return i && !/^\(?[a-hA-H][).]/.test(s)
        ? `${String.fromCharCode(97 + i)}) ${s}`
        : s;
    })
    .join(" ");
}
