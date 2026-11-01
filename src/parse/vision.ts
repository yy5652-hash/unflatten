import type { Box } from "./types";
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
const ink = (p: Pixels, x: number, y: number) => {
  const i = (y * p.width + x) * 4;
  return p.data[i] + p.data[i + 1] + p.data[i + 2] < 420 && p.data[i + 3] > 0;
};
/** Projection concentration: horizontal baselines/rules form peaks at their true angle. */
export function estimateDeskew(p: Pixels): number {
  const points: number[][] = [];
  const step = Math.max(
    1,
    Math.floor(Math.sqrt((p.width * p.height) / 180000)),
  );
  for (let y = 0; y < p.height; y += step)
    for (let x = 0; x < p.width; x += step)
      if (ink(p, x, y)) points.push([x, y]);
  if (points.length < 30) return 0;
  const score = (a: number) => {
    const buckets = new Uint32Array(Math.ceil(p.height + p.width * 0.15) + 8),
      t = Math.tan((a * Math.PI) / 180),
      offset = Math.ceil(p.width * 0.075);
    for (const [x, y] of points) {
      const b = Math.round((y - t * x + offset) / step);
      if (b >= 0 && b < buckets.length) buckets[b]++;
    }
    return buckets.reduce((s, n) => s + n * n, 0);
  };
  let best = 0,
    top = score(0);
  const base = top;
  for (let a = -4; a <= 4; a += 0.2) {
    const s = score(a);
    if (s > top) {
      best = a;
      top = s;
    }
  }
  return top > base * 1.06 ? Math.round(best * 10) / 10 : 0;
}
export function normalizeContrast(p: Pixels): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  for (let i = 0; i < p.data.length; i += 4)
    hist[
      Math.round(
        (p.data[i] * 77 + p.data[i + 1] * 150 + p.data[i + 2] * 29) / 256,
      )
    ]++;
  let sum = 0,
    lo = 0,
    hi = 255;
  const n = p.width * p.height;
  for (let i = 0; i < 256; i++) {
    sum += hist[i];
    if (sum < n * 0.01) lo = i;
    if (sum < n * 0.96) hi = i;
  }
  if (hi - lo < 40) {
    lo = 0;
    hi = 255;
  }
  const out = new Uint8ClampedArray(p.data.length);
  for (let i = 0; i < out.length; i += 4) {
    const v =
      (((p.data[i] * 77 + p.data[i + 1] * 150 + p.data[i + 2] * 29) / 256 -
        lo) *
        255) /
      (hi - lo);
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}
export function cleanImage(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!,
    p = ctx.getImageData(0, 0, canvas.width, canvas.height);
  p.data.set(normalizeContrast(p));
  ctx.putImageData(p, 0, 0);
  const angle = estimateDeskew(p);
  if (angle) {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")!.drawImage(canvas, 0, 0);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((-angle * Math.PI) / 180);
    ctx.drawImage(copy, -copy.width / 2, -copy.height / 2);
    ctx.restore();
  }
  return angle;
}
/** Small hollow connected components, constrained by size and interior emptiness. */
export function detectCheckboxes(
  p: Pixels,
): (Box & { shape: "square" | "circle" })[] {
  const seen = new Uint8Array(p.width * p.height),
    out: (Box & { shape: "square" | "circle" })[] = [];
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const start = y * p.width + x;
      if (seen[start] || !ink(p, x, y)) continue;
      const queue = [start];
      seen[start] = 1;
      let x0 = x,
        x1 = x,
        y0 = y,
        y1 = y;
      for (let q = 0; q < queue.length; q++) {
        const v = queue[q],
          px = v % p.width,
          py = Math.floor(v / p.width);
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
        for (const [nx, ny] of [
          [px - 1, py],
          [px + 1, py],
          [px, py - 1],
          [px, py + 1],
        ])
          if (nx >= 0 && ny >= 0 && nx < p.width && ny < p.height) {
            const i = ny * p.width + nx;
            if (!seen[i] && ink(p, nx, ny)) {
              seen[i] = 1;
              queue.push(i);
            }
          }
      }
      const w = x1 - x0 + 1,
        h = y1 - y0 + 1;
      if (
        w < 10 ||
        h < 10 ||
        w > p.width * 0.055 ||
        h > p.height * 0.055 ||
        w / h < 0.75 ||
        w / h > 1.3
      )
        continue;
      let inside = 0,
        total = 0;
      for (let yy = y0 + Math.ceil(h * 0.25); yy < y1 - h * 0.25; yy++)
        for (let xx = x0 + Math.ceil(w * 0.25); xx < x1 - w * 0.25; xx++) {
          total++;
          if (ink(p, xx, yy)) inside++;
        }
      if (inside > total * 0.1 || queue.length < w + h) continue;
      const corner = ink(p, x0 + 1, y0 + 1) || ink(p, x1 - 1, y0 + 1);
      out.push({
        x: x0,
        y: y0,
        width: w,
        height: h,
        shape: corner ? "square" : "circle",
      });
    }
  return out;
}
interface Segment {
  pos: number;
  start: number;
  end: number;
}
function segments(p: Pixels, vertical: boolean): Segment[] {
  const out: Segment[] = [];
  const across = vertical ? p.width : p.height,
    length = vertical ? p.height : p.width,
    min = Math.max(60, length * 0.12);
  for (let a = 0; a < across; a++) {
    let start = -1;
    for (let b = 0; b <= length; b++) {
      const dark = b < length && ink(p, vertical ? a : b, vertical ? b : a);
      if (dark && start < 0) start = b;
      if (!dark && start >= 0) {
        if (b - start >= min) {
          const prev = out.find(
            (s) =>
              Math.abs(s.pos - a) < 5 &&
              Math.abs(s.start - start) < 6 &&
              Math.abs(s.end - b) < 6,
          );
          if (!prev) out.push({ pos: a, start, end: b });
        }
        start = -1;
      }
    }
  }
  return out;
}
export interface Grid extends Box {
  xs: number[];
  ys: number[];
}
export function detectGrids(p: Pixels): Grid[] {
  const hs = segments(p, false),
    vs = segments(p, true),
    grids: Grid[] = [];
  for (const top of hs) {
    if (grids.some((g) => top.pos >= g.y && top.pos <= g.y + g.height))
      continue;
    const verticals = vs.filter(
      (v) =>
        v.pos >= top.start - 5 &&
        v.pos <= top.end + 5 &&
        v.start <= top.pos + 5 &&
        v.end > top.pos + 30,
    );
    if (verticals.length < 3) continue;
    const bottom = Math.min(...verticals.map((v) => v.end)),
      rows = hs
        .filter(
          (h) =>
            h.pos >= top.pos &&
            h.pos <= bottom + 3 &&
            h.start <= verticals[0].pos + 5 &&
            h.end >= verticals.at(-1)!.pos - 5,
        )
        .map((h) => h.pos);
    if (rows.length < 3) continue;
    const xs = verticals.map((v) => v.pos).sort((a, b) => a - b),
      ys = rows.sort((a, b) => a - b);
    grids.push({
      x: xs[0],
      y: ys[0],
      width: xs.at(-1)! - xs[0],
      height: ys.at(-1)! - ys[0],
      xs,
      ys,
    });
  }
  return grids;
}
