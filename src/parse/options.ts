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

/** Preserve actual option text and marker positions, including inline choices. */
export function optionBoxes(words: Word[]) {
  const ordered = [...words].sort((a, b) => a.x - b.x),
    groups: Word[][] = [];
  for (const w of ordered) {
    if (/^\(?[a-hA-H][).]/.test(w.text)) groups.push([]);
    if (groups.length) groups.at(-1)!.push(w);
  }
  if (!groups.length)
    return ordered
      .filter((w) => /^(True|False|Verdadero|Falso)$/i.test(w.text))
      .map((w) => ({
        text: w.text,
        box: { x: w.x, y: w.y, width: w.width, height: w.height },
      }));
  return groups.map((g) => {
    const x = g[0].x,
      y = Math.min(...g.map((w) => w.y)),
      height = Math.max(...g.map((w) => w.y + w.height)) - y;
    const marker = g[0],
      m = marker.text.match(/^(\(?[a-hA-H][).])\s*/)!;
    return {
      text: g
        .map((w) => w.text)
        .join(" ")
        .replace(/^\(?[a-hA-H][).]\s*/, ""),
      box: { x, y, width: g.at(-1)!.x + g.at(-1)!.width - x, height },
      letter: {
        x: marker.x,
        y: marker.y,
        width: (marker.width * m[1].length) / Math.max(1, marker.text.length),
        height: marker.height,
      },
    };
  });
}
