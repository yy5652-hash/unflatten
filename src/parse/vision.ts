import type { Box } from "./types";
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
/** Clockwise from top left, in source pixels. */
export type Quad = [Point, Point, Point, Point];
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function validQuad(q: Quad): boolean {
  return q.every(
    (p, i) =>
      Number.isFinite(p.x + p.y) &&
      cross(p, q[(i + 1) % 4], q[(i + 2) % 4]) > 1,
  );
}
/** Bright connected sheet on a darker desk. Work at <= 420px; abstain on weak evidence. */
export function findPageQuad(p: Pixels): Quad | null {
  const scale = Math.min(1, 420 / Math.max(p.width, p.height)),
    w = Math.round(p.width * scale),
    h = Math.round(p.height * scale),
    gray = new Uint8Array(w * h),
    hist = new Uint32Array(256);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i =
        (Math.min(p.height - 1, Math.floor(y / scale)) * p.width +
          Math.min(p.width - 1, Math.floor(x / scale))) *
        4;
      const v = Math.round((p.data[i] + p.data[i + 1] + p.data[i + 2]) / 3);
      gray[y * w + x] = v;
      hist[v]++;
    }
  let total = 0;
  for (let i = 0; i < 256; i++) total += i * hist[i];
  let n = 0,
    sum = 0,
    best = 0,
    threshold = 0;
  for (let i = 0; i < 255; i++) {
    n += hist[i];
    sum += i * hist[i];
    if (!n || n === w * h) continue;
    const d = sum / n - (total - sum) / (w * h - n),
      score = n * (w * h - n) * d * d;
    if (score > best) {
      best = score;
      threshold = i;
    }
  }
  if (!best) return null;
  const seen = new Uint8Array(w * h);
  let largest: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || gray[i] <= threshold) continue;
    const queue = [i];
    seen[i] = 1;
    for (let k = 0; k < queue.length; k++) {
      const v = queue[k],
        x = v % w,
        y = Math.floor(v / w);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!seen[j] && gray[j] > threshold) {
          seen[j] = 1;
          queue.push(j);
        }
      }
    }
    if (queue.length > largest.length) largest = queue;
  }
  if (largest.length < w * h * 0.25 || largest.length > w * h * 0.96)
    return null;
  const pts = largest
    .filter(
      (i) =>
        i % w === 0 ||
        i % w === w - 1 ||
        i < w ||
        i >= w * (h - 1) ||
        gray[i - 1] <= threshold ||
        gray[i + 1] <= threshold ||
        gray[i - w] <= threshold ||
        gray[i + w] <= threshold,
    )
    .map((i) => ({ x: i % w, y: Math.floor(i / w) }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (points: Point[]) => {
    const hull: Point[] = [];
    for (const a of points) {
      while (hull.length > 1 && cross(hull.at(-2)!, hull.at(-1)!, a) <= 0)
        hull.pop();
      hull.push(a);
    }
    return hull.slice(0, -1);
  };
  const hull = [...half(pts), ...half([...pts].reverse())];
  while (hull.length > 4) {
    let at = 0,
      min = Infinity;
    for (let i = 0; i < hull.length; i++) {
      const a = Math.abs(
        cross(
          hull[(i + hull.length - 1) % hull.length],
          hull[i],
          hull[(i + 1) % hull.length],
        ),
      );
      if (a < min) {
        min = a;
        at = i;
      }
    }
    hull.splice(at, 1);
  }
  if (hull.length !== 4) return null;
  const start = hull.reduce(
    (a, p, i) => (p.x + p.y < hull[a].x + hull[a].y ? i : a),
    0,
  );
  let q = [...hull.slice(start), ...hull.slice(0, start)] as Quad;
  // Fit the long straight edges; hull simplification alone clips rasterized corners.
  const edges = q.map((a, i) => {
    const b = q[(i + 1) % 4],
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy);
    const edge = pts.filter((p) => {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
      return t > 0.1 && t < 0.9 && Math.abs(cross(a, b, p)) / len < 3;
    });
    if (edge.length < 8) return { a, b };
    const x = edge.reduce((s, p) => s + p.x, 0) / edge.length,
      y = edge.reduce((s, p) => s + p.y, 0) / edge.length;
    let xx = 0,
      yy = 0,
      xy = 0;
    for (const p of edge) {
      xx += (p.x - x) ** 2;
      yy += (p.y - y) ** 2;
      xy += (p.x - x) * (p.y - y);
    }
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    return {
      a: { x, y },
      b: { x: x + Math.cos(angle), y: y + Math.sin(angle) },
    };
  });
  q = q.map((p, i) => {
    const { a, b } = edges[(i + 3) % 4],
      { a: c, b: d } = edges[i],
      dx = b.x - a.x,
      dy = b.y - a.y,
      ex = d.x - c.x,
      ey = d.y - c.y,
      det = dx * ey - dy * ex;
    if (Math.abs(det) < 0.01) return p;
    const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / det;
    return { x: a.x + t * dx, y: a.y + t * dy };
  }) as Quad;
  const area =
    Math.abs(
      q.reduce((s, a, i) => {
        const b = q[(i + 1) % 4];
        return s + a.x * b.y - b.x * a.y;
      }, 0),
    ) / 2;
  if (
    !validQuad(q) ||
    area < w * h * 0.25 ||
    area > w * h * 0.94 ||
    largest.length / area < 0.85
  )
    return null;
  return q.map((a) => ({ x: a.x / scale, y: a.y / scale })) as Quad;
}
/** Inverse homography from a unit destination square to the source quad. */
export function quadPoint(q: Quad, u: number, v: number): Point {
  const [a, b, c, d] = q,
    dx = b.x - c.x,
    dy = b.y - c.y,
    ex = d.x - c.x,
    ey = d.y - c.y,
    fx = a.x - b.x + c.x - d.x,
    fy = a.y - b.y + c.y - d.y,
    det = dx * ey - ex * dy;
  const g = Math.abs(det) < 1e-10 ? 0 : (fx * ey - ex * fy) / det,
    h = Math.abs(det) < 1e-10 ? 0 : (dx * fy - fx * dy) / det,
    z = g * u + h * v + 1;
  return {
    x: ((b.x - a.x + g * b.x) * u + (d.x - a.x + h * d.x) * v + a.x) / z,
    y: ((b.y - a.y + g * b.y) * u + (d.y - a.y + h * d.y) * v + a.y) / z,
  };
}
export function warpQuad(p: Pixels, q: Quad): Pixels {
  if (!validQuad(q)) throw Error("The corners must outline a convex page.");
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y),
    width = Math.max(
      2,
      Math.round(Math.max(dist(q[0], q[1]), dist(q[3], q[2]))),
    ),
    height = Math.max(
      2,
      Math.round(Math.max(dist(q[0], q[3]), dist(q[1], q[2]))),
    ),
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const a = quadPoint(q, x / (width - 1), y / (height - 1)),
        sx = Math.max(0, Math.min(p.width - 1, a.x)),
        sy = Math.max(0, Math.min(p.height - 1, a.y)),
        x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        x1 = Math.min(p.width - 1, x0 + 1),
        y1 = Math.min(p.height - 1, y0 + 1),
        tx = sx - x0,
        ty = sy - y0;
      for (let k = 0; k < 4; k++)
        data[(y * width + x) * 4 + k] =
          p.data[(y0 * p.width + x0) * 4 + k] * (1 - tx) * (1 - ty) +
          p.data[(y0 * p.width + x1) * 4 + k] * tx * (1 - ty) +
          p.data[(y1 * p.width + x0) * 4 + k] * (1 - tx) * ty +
          p.data[(y1 * p.width + x1) * 4 + k] * tx * ty;
    }
  return { data, width, height };
}
/** Broad box blur is an illumination estimate, never a blur of the answer ink. */
export function flattenIllumination(p: Pixels): Uint8ClampedArray {
  // The paper's brightness comes from the brightest pixel of each cell, so text
  // does not darken the estimate and leave a halo around itself.
  const { width: w, height: h } = p,
    size = Math.max(8, Math.round(Math.min(w, h) / 64)),
    cols = Math.ceil(w / size),
    rows = Math.ceil(h / size);
  let grid = new Float32Array(cols * rows);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4,
        cell = ((y / size) | 0) * cols + ((x / size) | 0),
        luma =
          (p.data[i] * 77 + p.data[i + 1] * 150 + p.data[i + 2] * 29) / 256;
      if (luma > grid[cell]) grid[cell] = luma;
    }
  for (let pass = 0; pass < 3; pass++) {
    const next = new Float32Array(grid.length);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        let sum = 0,
          n = 0;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y + dy,
              xx = x + dx;
            if (yy >= 0 && yy < rows && xx >= 0 && xx < cols) {
              sum += grid[yy * cols + xx];
              n++;
            }
          }
        next[y * cols + x] = sum / n;
      }
    grid = next;
  }
  const out = new Uint8ClampedArray(p.data.length);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(rows - 1, Math.max(0, y / size - 0.5)),
      y0 = gy | 0,
      y1 = Math.min(rows - 1, y0 + 1),
      fy = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = Math.min(cols - 1, Math.max(0, x / size - 0.5)),
        x0 = gx | 0,
        x1 = Math.min(cols - 1, x0 + 1),
        fx = gx - x0,
        bg =
          (grid[y0 * cols + x0] * (1 - fx) + grid[y0 * cols + x1] * fx) *
            (1 - fy) +
          (grid[y1 * cols + x0] * (1 - fx) + grid[y1 * cols + x1] * fx) * fy,
        i = (y * w + x) * 4;
      // Slightly past 255 so ordinary paper texture becomes clean white.
      for (let k = 0; k < 3; k++)
        out[i + k] = (p.data[i + k] * 280) / Math.max(25, bg);
      out[i + 3] = 255;
    }
  }
  return out;
}
export function correctPhoto(canvas: HTMLCanvasElement, corners?: Quad | null) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let p: Pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const q = corners === undefined ? findPageQuad(p) : corners;
  if (q) {
    p = warpQuad(p, q);
    canvas.width = p.width;
    canvas.height = p.height;
  }
  const image = ctx.createImageData(p.width, p.height);
  image.data.set(flattenIllumination(p));
  ctx.putImageData(image, 0, 0);
}
export function rotateCanvas(
  canvas: HTMLCanvasElement,
  degrees: number,
  maxEdge = Infinity,
) {
  const c = document.createElement("canvas"),
    swap = degrees % 180 !== 0,
    scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));
  c.width = Math.round((swap ? canvas.height : canvas.width) * scale);
  c.height = Math.round((swap ? canvas.width : canvas.height) * scale);
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return c;
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
          // A solid desk/background is not a thin table border.
          if (
            a >= 6 &&
            a < across - 6 &&
            [0.25, 0.5, 0.75].filter((t) => {
              const n = Math.floor(start + (b - start) * t);
              return (
                ink(p, vertical ? a - 6 : n, vertical ? n : a - 6) &&
                ink(p, vertical ? a + 6 : n, vertical ? n : a + 6)
              );
            }).length >= 2
          ) {
            start = -1;
            continue;
          }
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
