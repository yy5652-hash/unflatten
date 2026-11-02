import type { Line } from "./types";
/** XY whitespace cuts. A small number of spanning lines delimit column bands. */
export function readingOrder(lines: Line[]): Line[] {
  return [...new Set(lines.map((l) => l.page))]
    .sort((a, b) => a - b)
    .flatMap((page) =>
      cut(
        lines.filter((l) => l.page === page),
        0,
      ),
    );
}
function cut(lines: Line[], depth: number): Line[] {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  if (lines.length < 4 || depth > 8) return sorted;
  const width = lines[0].pageWidth;
  const edges = [
    ...new Set(lines.flatMap((l) => [l.x - 6, l.x + l.width + 6])),
  ].sort((a, b) => a - b);
  let best:
    { left: Line[]; right: Line[]; span: Line[]; score: number } | undefined;
  for (let i = 0; i < edges.length - 1; i++) {
    const x = (edges[i] + edges[i + 1]) / 2;
    if (x < width * 0.22 || x > width * 0.78) continue;
    const left = lines.filter((l) => l.x + l.width < x),
      right = lines.filter((l) => l.x > x),
      span = lines.filter((l) => l.x <= x && l.x + l.width >= x);
    if (
      left.length < 2 ||
      right.length < 2 ||
      span.length > Math.max(2, lines.length * 0.16)
    )
      continue;
    const gap =
      Math.min(...right.map((l) => l.x)) -
      Math.max(...left.map((l) => l.x + l.width));
    const overlap =
      Math.min(
        Math.max(...left.map((l) => l.y)),
        Math.max(...right.map((l) => l.y)),
      ) -
      Math.max(
        Math.min(...left.map((l) => l.y)),
        Math.min(...right.map((l) => l.y)),
      );
    if (gap < width * 0.035 || overlap < 20) continue;
    // A clean gutter always beats one that a few lines cross; only then does a wider gap win.
    const score = gap - span.length * 100000;
    if (!best || score > best.score) best = { left, right, span, score };
  }
  if (!best) return sorted;
  const { left, right, span } = best;
  if (!span.length) return [...cut(left, depth + 1), ...cut(right, depth + 1)];
  const out: Line[] = [];
  let start = -Infinity;
  for (const s of [...span].sort((a, b) => a.y - b.y)) {
    out.push(
      ...cut(
        [...left, ...right].filter((l) => l.y >= start && l.y < s.y),
        depth + 1,
      ),
      s,
    );
    start = s.y;
  }
  out.push(
    ...cut(
      [...left, ...right].filter((l) => l.y >= start),
      depth + 1,
    ),
  );
  return out;
}
export function dropRepeatedMargins(lines: Line[]): Line[] {
  const pages = new Set(lines.map((l) => l.page));
  if (pages.size < 2) return lines;
  const normalize = (s: string) => s.toLowerCase().replace(/\d+/g, "#").trim();
  const candidates = lines.filter(
    (l) => l.y < l.pageHeight * 0.07 || l.y > l.pageHeight * 0.92,
  );
  const counts = new Map<string, Set<number>>();
  for (const l of candidates) {
    const k = normalize(l.text);
    if (!counts.has(k)) counts.set(k, new Set());
    counts.get(k)!.add(l.page);
  }
  return lines.filter(
    (l) =>
      !candidates.includes(l) ||
      (counts.get(normalize(l.text))?.size || 0) <
        Math.max(2, Math.ceil(pages.size * 0.6)),
  );
}
/** Group text fragments on a baseline without bridging a column gutter. */
export function joinFragments(items: Line[]): Line[] {
  const rows: Line[][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = rows.find(
      (r) =>
        Math.abs(r[0].y - item.y) < Math.min(r[0].height, item.height) * 0.45,
    );
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(item);
  }
  return rows.flatMap((row) => {
    const out: Line[] = [];
    for (const item of row.sort((a, b) => a.x - b.x)) {
      const prev = out.at(-1),
        gap = prev ? item.x - prev.x - prev.width : Infinity;
      if (prev && gap < Math.max(14, item.height * 1.8)) {
        prev.blanks = [...(prev.blanks ?? []), ...(item.blanks ?? [])];
        prev.optionBoxes = [
          ...(prev.optionBoxes ?? []),
          ...(item.optionBoxes ?? []),
        ];
        prev.text += `${gap > 2 ? " " : ""}${item.text}`;
        prev.width = item.x + item.width - prev.x;
        prev.confidence = Math.min(prev.confidence, item.confidence);
      } else out.push({ ...item });
    }
    return out;
  });
}
