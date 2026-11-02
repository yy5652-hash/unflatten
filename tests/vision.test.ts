import { it, expect } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  estimateDeskew,
  detectCheckboxes,
  detectGrids,
  normalizeContrast,
} from "../src/parse/vision";
import { classify, textLines } from "../src/parse/classify";
function canvas() {
  const c = createCanvas(700, 800),
    ctx = c.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 700, 800);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3;
  return { c, ctx, pixels: () => ctx.getImageData(0, 0, 700, 800) };
}
it("estimates positive and negative rule angles within half a degree", () => {
  for (const angle of [-2, 2.6]) {
    const { ctx, pixels } = canvas();
    ctx.translate(350, 400);
    ctx.rotate((angle * Math.PI) / 180);
    for (let y = -250; y < 250; y += 55) {
      ctx.beginPath();
      ctx.moveTo(-240, y);
      ctx.lineTo(240, y);
      ctx.stroke();
    }
    expect(Math.abs(estimateDeskew(pixels()) - angle)).toBeLessThan(0.5);
  }
});
it("does not rotate a blank page and normalizes low contrast", () => {
  const { ctx, pixels } = canvas();
  expect(estimateDeskew(pixels())).toBe(0);
  ctx.fillStyle = "#aaa";
  ctx.fillRect(50, 50, 200, 200);
  const p = pixels(),
    normalized = normalizeContrast(p);
  expect(normalized[(100 * 700 + 100) * 4]).toBeLessThan(20);
  expect(normalized[0]).toBe(255);
});
it("finds hollow square and circle but rejects filled blobs and underline rules", () => {
  const { ctx, pixels } = canvas();
  ctx.strokeRect(30, 50, 24, 24);
  ctx.beginPath();
  ctx.arc(42, 130, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.fillRect(30, 180, 25, 25);
  ctx.beginPath();
  ctx.moveTo(30, 250);
  ctx.lineTo(300, 250);
  ctx.stroke();
  const boxes = detectCheckboxes(pixels());
  expect(boxes).toHaveLength(2);
  expect(boxes.map((b) => b.shape)).toEqual(["square", "circle"]);
});
it("detects a complete ruled grid, not parallel answer lines", () => {
  const { ctx, pixels } = canvas();
  for (const x of [50, 250, 450]) {
    ctx.beginPath();
    ctx.moveTo(x, 100);
    ctx.lineTo(x, 500);
    ctx.stroke();
  }
  for (const y of [100, 200, 350, 500]) {
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(450, y);
    ctx.stroke();
  }
  const grids = detectGrids(pixels());
  expect(grids).toHaveLength(1);
  expect(grids[0].xs).toHaveLength(3);
  expect(grids[0].ys).toHaveLength(4);
  const b = canvas();
  for (let y = 100; y < 500; y += 100) {
    b.ctx.beginPath();
    b.ctx.moveTo(50, y);
    b.ctx.lineTo(450, y);
    b.ctx.stroke();
  }
  expect(detectGrids(b.pixels())).toEqual([]);
});
it("sample D really contains a ruled 3-column grid and 3 ink checkbox outlines", async () => {
  const image = await loadImage("public/samples/rock-cycle.png"),
    c = createCanvas(image.width, image.height),
    ctx = c.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const p = ctx.getImageData(0, 0, c.width, c.height);
  const grids = detectGrids(p);
  expect(grids).toHaveLength(1);
  expect(grids[0].xs).toHaveLength(4);
  expect(grids[0].ys).toHaveLength(4);
  const boxes = detectCheckboxes(p).filter(
    (b) => b.x < 110 && b.y > 500 && b.y < 700,
  );
  expect(boxes).toHaveLength(3);
}, 20000);
it("preserves word banks and recognizes supported matching rows", () => {
  const blocks = classify(
    textLines(
      "Review\nWord bank: cooling, heat, pressure\nMatch column A to column B\n1. Rock A. Solid\n2. Water B. Liquid",
    ),
  );
  expect(blocks[1]).toMatchObject({
    kind: "word-bank",
    options: ["cooling", "heat", "pressure"],
  });
  expect(blocks[2]).toMatchObject({
    kind: "matching",
    pairs: ["Rock", "Water"],
    options: ["Solid", "Liquid"],
  });
});
it("checkbox lines use ink flags while inline letter options retain order", () => {
  const lines = textLines("Review\n1. Choose all.\n☐ Heat\n☐ Pressure");
  lines[2].checkbox = true;
  lines[3].checkbox = true;
  expect(classify(lines)[1]).toMatchObject({
    kind: "checkbox",
    options: ["Heat", "Pressure"],
  });
  expect(
    classify(textLines("Review\n1. Choose.\na) One b) Two c) Three"))[1]
      .options,
  ).toEqual(["One", "Two", "Three"]);
});

it("splits reliably marked inline options using word-box gaps", async () => {
  const { inlineOptions } = await import("../src/parse/options");
  const w = (text: string, x: number, width: number) => ({
    text,
    x,
    width,
    y: 10,
    height: 20,
    confidence: 100,
  });
  expect(
    inlineOptions([
      w("a)", 10, 15),
      w("Red", 30, 30),
      w("Blue", 120, 40),
      w("Green", 220, 50),
    ]),
  ).toBe("a) Red b) Blue c) Green");
  expect(
    inlineOptions([
      w("An", 10, 15),
      w("ordinary", 120, 80),
      w("sentence", 260, 90),
    ]),
  ).toBeUndefined();
});

import {
  findPageQuad,
  warpQuad,
  quadPoint,
  flattenIllumination,
  type Quad,
} from "../src/parse/vision";
import { findRules } from "../src/parse/rules";
it("finds ordered paper corners and abstains on full-frame, small or absent paper", () => {
  const { ctx, pixels } = canvas();
  ctx.fillStyle = "#242424";
  ctx.fillRect(0, 0, 700, 800);
  expect(findPageQuad(pixels())).toBeNull();
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(100, 90);
  ctx.lineTo(600, 120);
  ctx.lineTo(570, 730);
  ctx.lineTo(70, 680);
  ctx.closePath();
  ctx.fill();
  const q = findPageQuad(pixels())!;
  expect(q).not.toBeNull();
  for (const [i, p] of [
    { x: 100, y: 90 },
    { x: 600, y: 120 },
    { x: 570, y: 730 },
    { x: 70, y: 680 },
  ].entries())
    expect(Math.hypot(q[i].x - p.x, q[i].y - p.y)).toBeLessThan(9);
  ctx.fillRect(0, 0, 700, 800);
  expect(findPageQuad(pixels())).toBeNull();
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, 700, 800);
  ctx.fillStyle = "white";
  ctx.fillRect(80, 80, 100, 100);
  expect(findPageQuad(pixels())).toBeNull();
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, 700, 800);
  ctx.fillStyle = "white";
  ctx.fillRect(100, 100, 500, 600);
  ctx.fillStyle = "#222";
  ctx.fillRect(250, 100, 350, 400);
  expect(findPageQuad(pixels())).toBeNull();
});
it("inverse-warps a known projective quadrilateral with bilinear samples", () => {
  const { ctx, pixels } = canvas();
  const p = pixels();
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      p.data[i] = x / 3;
      p.data[i + 1] = y / 4;
      p.data[i + 2] = 0;
    }
  const project = (u: number, v: number) => ({
    x: (500 * u + 40 * v + 40) / (1 + 0.2 * u + 0.1 * v),
    y: (50 * u + 600 * v + 30) / (1 + 0.2 * u + 0.1 * v),
  });
  const q: Quad = [project(0, 0), project(1, 0), project(1, 1), project(0, 1)],
    out = warpQuad(p, q);
  for (const [u, v] of [
    [0, 0],
    [0.5, 0.5],
    [1, 1],
    [0.2, 0.8],
  ]) {
    const x = Math.round(u * (out.width - 1)),
      y = Math.round(v * (out.height - 1)),
      a = project(x / (out.width - 1), y / (out.height - 1)),
      i = (y * out.width + x) * 4;
    expect(out.data[i]).toBeCloseTo(Math.round(a.x / 3), 0);
    expect(out.data[i + 1]).toBeCloseTo(Math.round(a.y / 4), 0);
  }
  expect(quadPoint(q, 1, 0).x).toBeCloseTo(q[1].x, 6);
  expect(quadPoint(q, 1, 0).y).toBeCloseTo(q[1].y, 6);
  expect(() => warpQuad(p, [q[0], q[2], q[1], q[3]])).toThrow();
});
it("removes a shadow while keeping a one-pixel answer rule", () => {
  const { ctx, pixels } = canvas();
  const gradient = ctx.createLinearGradient(0, 0, 700, 0);
  gradient.addColorStop(0, "#888");
  gradient.addColorStop(1, "#eee");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 700, 800);
  ctx.fillStyle = "#111";
  ctx.fillRect(90, 400, 500, 1);
  const p = pixels(),
    data = flattenIllumination(p);
  expect(
    Math.abs(data[(200 * 700 + 100) * 4] - data[(200 * 700 + 600) * 4]),
  ).toBeLessThan(10);
  expect(
    findRules(data, 700, 800).some(
      (r) => Math.abs(r.y - 400) < 2 && r.x1 - r.x0 >= 490,
    ),
  ).toBe(true);
});
