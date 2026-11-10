import { it, expect, vi, afterEach } from "vitest";
import { createCanvas, Image, loadImage } from "@napi-rs/canvas";
import { PDFDocument, PDFName } from "pdf-lib";
import {
  placeAnswers,
  renderPaper,
  makePaperPDF,
  drawAnswers,
  paperFont,
} from "../src/features/onpaper";
import { type Worksheet, type Block, type Line } from "../src/parse/types";
const box = { x: 150, y: 100, width: 300, height: 28 };
const line = (extra: Partial<Line> = {}): Line => ({
  text: "Question",
  page: 1,
  x: 30,
  y: 70,
  width: 400,
  height: 26,
  pageWidth: 700,
  pageHeight: 900,
  confidence: 100,
  ...extra,
});
const block = (kind: Block["kind"], extra: Partial<Block> = {}): Block => ({
  id: "q",
  kind,
  text: "Question ____",
  page: 1,
  lines: [line({ blanks: [box] })],
  ...extra,
});
function worksheet(b: Block, answers: Record<string, string>): Worksheet {
  const c = createCanvas(700, 900),
    ctx = c.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 700, 900);
  ctx.strokeStyle = "black";
  ctx.strokeRect(box.x, box.y + box.height, box.width, 1);
  return {
    id: "test",
    name: "Test worksheet",
    language: "en",
    blocks: [b],
    answers,
    updated: 0,
    original: {
      source: "image",
      pages: 1,
      characters: 0,
      headings: 0,
      fields: 0,
      tagged: null,
    },
    previews: [
      { page: 1, image: c.toDataURL("image/png"), width: 700, height: 900 },
    ],
  };
}
afterEach(() => vi.unstubAllGlobals());
it.each(["identity", "fill-blank", "short-answer"] as const)(
  "places %s on its rule",
  (kind) => {
    const plan = placeAnswers(
      worksheet(block(kind), { [kind === "fill-blank" ? "q-0" : "q"]: "Ada" }),
    );
    expect(plan.placed).toBe(1);
    expect(plan.unplaced).toEqual([]);
    expect(plan.pages[0].instructions[0].box.x).toBeGreaterThanOrEqual(box.x);
  },
);
it("preserves reading order across multiple blanks and wraps short answers over ruled lines", () => {
  const b = block("fill-blank", {
      text: "One ____ two ____",
      lines: [line({ blanks: [box, { ...box, x: 480, width: 160 }] })],
    }),
    doc = worksheet(b, { "q-0": "first", "q-1": "second" });
  expect(placeAnswers(doc).pages[0].instructions.map((i) => i.text)).toEqual([
    "first",
    "second",
  ]);
  doc.blocks = [
    block("short-answer", {
      lines: [
        line({
          blanks: [
            { ...box, width: 150 },
            { ...box, width: 150, y: 150 },
          ],
        }),
      ],
    }),
  ];
  doc.answers = { q: "This answer needs two lines" };
  const plan = placeAnswers(doc);
  expect(plan.placed).toBe(1);
  expect(plan.pages[0].instructions).toHaveLength(2);
});
it("rings the selected letter, ticks unlettered choices and checkbox glyphs", () => {
  const b = block("multiple-choice", {
    options: ["Yes", "No"],
    lines: [
      line({
        optionBoxes: [{ text: "Yes", box, letter: { ...box, width: 18 } }],
      }),
      line({ optionBoxes: [{ text: "No", box: { ...box, y: 160 } }] }),
    ],
  });
  expect(
    placeAnswers(worksheet(b, { q: "Yes" })).pages[0].instructions[0].kind,
  ).toBe("ring");
  expect(
    placeAnswers(worksheet(b, { q: "No" })).pages[0].instructions[0].kind,
  ).toBe("tick");
  b.kind = "checkbox";
  b.lines[0].glyph = { ...box, width: 24, height: 24 };
  b.lines[1].glyph = { ...box, y: 160, width: 24, height: 24 };
  const plan = placeAnswers(worksheet(b, { q: '["Yes","No"]' }));
  expect(plan.placed).toBe(1);
  expect(plan.pages[0].instructions).toHaveLength(2);
  expect(plan.pages[0].instructions.every((i) => i.kind === "tick")).toBe(true);
});
it("uses true/false option positions and table cell positions", () => {
  const b = block("true-false", {
    lines: [line({ optionBoxes: [{ text: "True", box }] })],
  });
  expect(placeAnswers(worksheet(b, { q: "True" })).placed).toBe(1);
  b.kind = "table";
  b.cells = [
    ["Label", "Answer"],
    ["Test", ""],
  ];
  b.lines = [
    line({
      cellBoxes: [
        [box, box],
        [box, { ...box, y: 200 }],
      ],
    }),
  ];
  const plan = placeAnswers(worksheet(b, { "q-1-1": "水" }));
  expect(plan.placed).toBe(1);
  expect(plan.pages[0].instructions[0].box.y).toBe(206);
});
it("retains all unsupported, missing, off-page and illegibly long answers as unplaced", () => {
  for (const b of [
    block("short-answer", { lines: [line()] }),
    block("identity", { lines: [line({ blanks: [{ ...box, x: 800 }] })] }),
    block("matching", { pairs: ["A"] }),
  ]) {
    const plan = placeAnswers(worksheet(b, { q: "answer", "q-0": "answer" }));
    expect(plan.placed).toBe(0);
    expect(plan.unplaced).toHaveLength(1);
    expect(plan.unplaced[0].answer).toBe("answer");
  }
  const plan = placeAnswers(
    worksheet(block("fill-blank"), { "q-0": "long answer ".repeat(100) }),
  );
  expect(plan.unplaced).toHaveLength(1);
  expect(plan.pages[0].instructions).toEqual([]);
  const doc = worksheet(block("identity"), { q: "Ada" });
  delete doc.previews;
  expect(placeAnswers(doc).unplaced).toHaveLength(1);
});
it("figure descriptions are content, not student answer slots", () => {
  const doc = worksheet(block("figure", { figureDescription: "Water rises into clouds." }), {});
  expect(placeAnswers(doc).unplaced).toEqual([]);
});
it("is pure and supports old saved documents without geometry", () => {
  const doc = worksheet(block("identity", { lines: [line()] }), { q: "Ada" }),
    before = structuredClone(doc);
  expect(placeAnswers(doc).unplaced).toEqual([
    { key: "q", question: "Question ____", answer: "Ada" },
  ]);
  expect(doc).toEqual(before);
});
it.each(["zh", "ar"] as const)(
  "lays out and draws %s with system fonts and real canvas metrics",
  (language) => {
    const doc = worksheet(block("short-answer"), {
      q: language === "ar" ? "مرحبا بالعالم" : "植物需要阳光",
    });
    doc.language = language;
    const c = createCanvas(700, 900),
      ctx = c.getContext("2d");
    const plan = placeAnswers(doc, (s, size) => {
      ctx.font = `${size}px ${paperFont}`;
      return ctx.measureText(s).width;
    });
    expect(plan.placed).toBe(1);
    drawAnswers(
      ctx as unknown as CanvasRenderingContext2D,
      plan.pages[0].instructions,
      language,
    );
    expect(
      ctx
        .getImageData(box.x, box.y, box.width, box.height)
        .data.some((v, i) => i % 4 === 3 && v > 0),
    ).toBe(true);
  },
);
it("renders ink inside the blank, leaves blank copies unchanged, and emits image-only PDFs with metadata and an extra page only when needed", async () => {
  vi.stubGlobal("document", { createElement: () => createCanvas(1, 1) });
  vi.stubGlobal("Image", Image);
  const doc = worksheet(block("fill-blank"), { "q-0": "Ada" });
  const filled = await renderPaper(doc),
    blank = await renderPaper(doc, 1, true);
  const a = filled.canvas
      .getContext("2d")!
      .getImageData(box.x, box.y, box.width, box.height).data,
    b = blank.canvas
      .getContext("2d")!
      .getImageData(box.x, box.y, box.width, box.height).data;
  expect(a.some((v, i) => i % 4 === 0 && v < b[i])).toBe(true);
  const original = createCanvas(700, 900),
    originalCtx = original.getContext("2d");
  originalCtx.drawImage(await loadImage(doc.previews![0].image), 0, 0);
  expect(b).toEqual(
    originalCtx.getImageData(box.x, box.y, box.width, box.height).data,
  );
  const bytes = await makePaperPDF(doc);
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getTitle()).toBe(doc.name);
  expect(pdf.getCreator()).toBe("Unflatten");
  expect(pdf.catalog.get(PDFName.of("Lang"))?.toString()).toContain("en");
  expect(pdf.getPage(0).getWidth() / pdf.getPage(0).getHeight()).toBeCloseTo(
    700 / 900,
  );
  doc.answers["q-0"] = "too long ".repeat(100);
  expect((await PDFDocument.load(await makePaperPDF(doc))).getPageCount()).toBe(
    2,
  );
  expect(
    (await PDFDocument.load(await makePaperPDF(doc, true))).getPageCount(),
  ).toBe(1);
});

it("keeps malformed or positionless checkbox selections unplaced", () => {
  const b = block("checkbox", {
    options: ["Yes"],
    lines: [line({ optionBoxes: [{ text: "Yes", box }] })],
  });
  for (const value of ["null", "{}", '["Yes"]'])
    expect(placeAnswers(worksheet(b, { q: value })).unplaced).toHaveLength(1);
});
