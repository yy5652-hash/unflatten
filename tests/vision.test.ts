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
