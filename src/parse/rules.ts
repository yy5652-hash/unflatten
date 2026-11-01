import type { Box } from "./types";

/** A horizontal printed line on a page: an answer blank, seen in pixels. */
export interface Rule {
  x0: number;
  x1: number;
  y: number;
}
export interface Word extends Box {
  text: string;
  confidence: number;
}
export const BLANK = "______";

const TILE = 64;

/**
 * Finds answer blanks directly in the image. OCR engines read a run of
 * underscores as nothing or as noise, so a blank has to be found as ink:
 * long dark horizontal runs, joined across rows so that a skewed line stays one
 * line, and kept only when the result is long and thin.
 */
export function findRules(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Rule[] {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++)
    gray[i] =
      (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;

  // Local thresholds cope with a shadow across a phone photo.
  const cols = Math.ceil(width / TILE),
    rows = Math.ceil(height / TILE);
  const thresholds = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let sum = 0,
        n = 0;
      const y1 = Math.min(height, (r + 1) * TILE),
        x1 = Math.min(width, (c + 1) * TILE);
      for (let y = r * TILE; y < y1; y += 2)
        for (let x = c * TILE; x < x1; x += 2) {
          sum += gray[y * width + x];
          n++;
        }
      thresholds[r * cols + c] = (sum / Math.max(1, n)) * 0.72;
    }

  const minRun = 8;
  const parent: number[] = [];
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const runs: { x0: number; x1: number; y: number }[] = [];
  let previous: number[] = [];
  for (let y = 0; y < height; y++) {
    const current: number[] = [];
    let x = 0;
    while (x < width) {
      const dark = (px: number) =>
        gray[y * width + px] <
        thresholds[Math.floor(y / TILE) * cols + Math.floor(px / TILE)];
      if (!dark(x)) {
        x++;
        continue;
      }
      const start = x;
      while (x < width && dark(x)) x++;
      if (x - start < minRun) continue;
      const id = runs.length;
      runs.push({ x0: start, x1: x, y });
      parent.push(id);
      for (const p of previous)
        if (runs[p].x0 <= x && runs[p].x1 >= start) parent[find(id)] = find(p);
      current.push(id);
    }
    previous = current;
  }

  const groups = new Map<number, typeof runs>();
  runs.forEach((run, id) => {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(run);
  });
  const minWidth = Math.max(36, width * 0.03);
  const out: Rule[] = [];
  for (const group of groups.values()) {
    const x0 = Math.min(...group.map((r) => r.x0)),
      x1 = Math.max(...group.map((r) => r.x1)),
      y0 = Math.min(...group.map((r) => r.y)),
      y1 = Math.max(...group.map((r) => r.y)),
      w = x1 - x0,
      h = y1 - y0 + 1,
      ink = group.reduce((n, r) => n + r.x1 - r.x0, 0);
    if (w >= minWidth && h <= 4 + w * 0.05 && ink / w <= 10)
      out.push({ x0, x1, y: (y0 + y1) / 2 });
  }
  return out.sort((a, b) => a.y - b.y || a.x0 - b.x0);
}

const overlap = (rule: Rule, box: Box) =>
  Math.max(0, Math.min(rule.x1, box.x + box.width) - Math.max(rule.x0, box.x));

const hasLetters = (s: string) => /[\p{L}\p{N}]/u.test(s);

/**
 * Puts blanks into text lines. A rule beneath real words is an underline and is
 * ignored. A rule beside or inside a line becomes a blank in that line, and OCR
 * noise read off the rule itself is removed. A rule with no line is returned as
 * free, which is how a question's answer lines look.
 * With `trustText`, text is from a PDF text layer: any text on top of the rule is
 * what drew it (typed underscores), so the rule adds nothing.
 */
export function placeRules(
  lines: { box: Box; words: Word[] }[],
  rules: Rule[],
  trustText = false,
): { lines: { box: Box; words: Word[] }[]; free: Rule[] } {
  const out = lines.map((l) => ({ box: { ...l.box }, words: [...l.words] }));
  const free: Rule[] = [];
  for (const rule of rules) {
    const length = rule.x1 - rule.x0;
    const covered = out
      .flatMap((l) => l.words)
      .filter(
        (w) =>
          rule.y >= w.y - w.height * 0.1 &&
          rule.y <= w.y + w.height * 1.45 &&
          overlap(rule, w) > 0 &&
          (trustText || (hasLetters(w.text) && w.confidence >= 60)),
      )
      .reduce((n, w) => n + overlap(rule, w), 0);
    if (covered >= length * 0.5) continue;
    let best: (typeof out)[number] | undefined;
    let bestDistance = Infinity;
    for (const l of out) {
      const h = l.box.height,
        bottom = l.box.y + h;
      if (rule.y < l.box.y - h * 0.1 || rule.y > bottom + h * 0.45) continue;
      const gap = Math.max(
        l.box.x - rule.x1,
        rule.x0 - (l.box.x + l.box.width),
        0,
      );
      if (gap > h * 4) continue;
      const distance = Math.abs(rule.y - bottom) + gap * 0.01;
      if (distance < bestDistance) {
        best = l;
        bestDistance = distance;
      }
    }
    if (!best) {
      free.push(rule);
      continue;
    }
    if (!trustText)
      best.words = best.words.filter(
        (w) =>
          (hasLetters(w.text) && w.confidence >= 60) ||
          overlap(rule, w) < w.width * 0.5,
      );
    best.words.push({
      text: BLANK,
      confidence: 100,
      x: rule.x0,
      y: best.box.y,
      width: length,
      height: best.box.height,
    });
    best.box.width =
      Math.max(best.box.x + best.box.width, rule.x1) -
      Math.min(best.box.x, rule.x0);
    best.box.x = Math.min(best.box.x, rule.x0);
  }
  return { lines: out, free };
}
