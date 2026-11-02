import { it, expect, vi, afterEach } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import "tesseract.js";
const metrics = vi.hoisted(() => ({ passes: 0 }));
// Native canvas replaces only browser I/O. Recognition, cleanup, rules, order,
// classification and preview retention execute the production path unchanged.
vi.mock("tesseract.js", async () => {
  const actual =
    await vi.importActual<typeof import("tesseract.js")>("tesseract.js");
  return {
    ...actual,
    createWorker: async (lang: string) => {
      const worker = await actual.createWorker(lang, 1, {
        langPath: resolve("public/vendor"),
        cacheMethod: "none",
      });
      const recognize = worker.recognize.bind(worker);
      worker.recognize = ((
        image: { toBuffer?: (s: string) => Buffer },
        ...args: unknown[]
      ) => (
        metrics.passes++,
        recognize(
          image.toBuffer ? image.toBuffer("image/png") : (image as never),
          ...(args as []),
        )
      )) as typeof worker.recognize;
      return worker;
    },
  };
});
afterEach(() => vi.unstubAllGlobals());
async function convert(
  name: string,
  cleanup = true,
  manual = false,
  generated?: Uint8Array,
) {
  metrics.passes = 0;
  vi.stubGlobal("document", {
    baseURI: pathToFileURL(resolve("public") + "/").href,
    createElement: (tag: string) => {
      if (tag !== "canvas") throw Error("Unexpected element " + tag);
      return createCanvas(1, 1);
    },
  });
  vi.stubGlobal("createImageBitmap", async (file: File) => {
    const image = await loadImage(Buffer.from(await file.arrayBuffer()));
    Object.assign(image, { close: () => {} });
    return image;
  });
  const { fromFile } = await import("../src/parse/input");
  let bytes = generated
    ? Buffer.from(generated)
    : await readFile("public/samples/" + name);
  let corners: import("../src/parse/vision").Quad | undefined;
  if (manual) {
    const image = await loadImage(bytes),
      large = createCanvas(image.width * 2, image.height * 2),
      ctx = large.getContext("2d");
    ctx.drawImage(image, 0, 0, large.width, large.height);
    const { findPageQuad } = await import("../src/parse/vision");
    corners = findPageQuad(ctx.getImageData(0, 0, large.width, large.height))!;
    bytes = Buffer.from(large.toBuffer("image/png"));
  }
  return fromFile(
    new File([bytes], name, { type: "image/png" }),
    "en",
    () => {},
    undefined,
    cleanup ? corners : false,
  );
}
it("real OCR sample A preserves 3 questions and two reconstructed blanks", async () => {
  const doc = await convert("photosynthesis-scan.png");
  expect(
    metrics.passes,
    "A good page does not pay for orientation probes",
  ).toBe(1);
  expect(
    doc.blocks.filter((b) =>
      ["multiple-choice", "short-answer", "fill-blank"].includes(b.kind),
    ),
  ).toHaveLength(3);
  expect(doc.blocks.find((b) => b.kind === "multiple-choice")?.options).toEqual(
    ["Sunlight", "Moonlight", "Soil"],
  );
  expect(
    doc.blocks.find((b) => b.kind === "fill-blank")?.text.match(/_{2,}/g),
  ).toHaveLength(2);
  expect(doc.previews).toHaveLength(1);
  expect(doc.previews?.[0].image).toMatch(/^data:image\/jpeg/);
}, 90000);
it("real OCR photo C preserves two blanks and two true/false questions after deskew", async () => {
  const doc = await convert("fractions.png");
  expect(doc.blocks.filter((b) => b.kind === "fill-blank")).toHaveLength(2);
  expect(doc.blocks.filter((b) => b.kind === "true-false")).toHaveLength(2);
}, 90000);
it("real OCR sample D reconstructs 3 checkbox options, a 3-column table and word bank", async () => {
  const doc = await convert("rock-cycle.png");
  const table = doc.blocks.find((b) => b.kind === "table");
  expect(table?.cells).toHaveLength(3);
  expect(table?.cells?.[0]).toEqual(["Rock type", "Process", "Example"]);
  expect(table?.cells?.slice(1).map((r) => r[1])).toEqual(["", ""]);
  expect(doc.blocks.find((b) => b.kind === "checkbox")?.options).toEqual([
    "Heat",
    "Pressure",
    "Sunlight",
  ]);
  expect(doc.blocks.find((b) => b.kind === "word-bank")?.options).toEqual([
    "cooling",
    "heat",
    "pressure",
  ]);
  expect(doc.blocks.filter((b) => b.kind === "short-answer")).toHaveLength(0);
}, 90000);

function counts(doc: import("../src/parse/types").Worksheet) {
  return {
    questions: doc.blocks.filter((b) =>
      ["multiple-choice", "short-answer", "fill-blank"].includes(b.kind),
    ).length,
    fields: doc.blocks.flatMap((b) => answerKeys(b)).length,
    previewBytes: Math.floor(
      ((doc.previews?.[0].image.split(",")[1].length ?? 0) * 3) / 4,
    ),
    confidence: Math.round(
      doc.blocks.flatMap((b) => b.lines).reduce((s, l) => s + l.confidence, 0) /
        Math.max(1, doc.blocks.flatMap((b) => b.lines).length),
    ),
  };
}
import { answerKeys } from "../src/parse/types";
import { placeAnswers, paperFont } from "../src/features/onpaper";
it("desk photo cleanup matches the clean sheet's questions and fields", async () => {
  const clean = await convert("photosynthesis-scan.png"),
    raw = await convert("desk-photo.png", false),
    fixed = await convert("desk-photo.png");
  console.log(
    "OCR clean / desk without cleanup / desk with cleanup:",
    JSON.stringify([counts(clean), counts(raw), counts(fixed)]),
  );
  expect(counts(fixed).questions).toBe(counts(clean).questions);
  expect(counts(fixed).fields).toBe(counts(clean).fields);
  const ctx = createCanvas(1, 1).getContext("2d");
  for (const b of fixed.blocks)
    for (const [i, key] of answerKeys(b).entries()) {
      fixed.answers[key] =
        b.kind === "multiple-choice"
          ? b.options![0]
          : b.kind === "short-answer"
            ? "It takes in light."
            : b.kind === "fill-blank"
              ? i
                ? "oxygen"
                : "air"
              : "Ada";
    }
  const plan = placeAnswers(fixed, (text, size) => {
    ctx.font = `${size}px ${paperFont}`;
    return ctx.measureText(text).width;
  });
  expect(plan.unplaced).toEqual([]);
  expect(plan.placed).toBe(6);

  expect(
    fixed.blocks
      .filter((b) =>
        ["identity", "multiple-choice", "short-answer", "fill-blank"].includes(
          b.kind,
        ),
      )
      .map((b) => [b.kind, b.text.replace(/\s+/g, " "), b.options]),
  ).toEqual(
    clean.blocks
      .filter((b) =>
        ["identity", "multiple-choice", "short-answer", "fill-blank"].includes(
          b.kind,
        ),
      )
      .map((b) => [b.kind, b.text.replace(/\s+/g, " "), b.options]),
  );
}, 180000);
for (const angle of [90, 180, 270])
  it(`auto-rotates ${angle} degrees with the existing OCR worker`, async () => {
    const doc = await convert(`sideways-${angle}.png`);
    console.log(`OCR sideways ${angle}:`, JSON.stringify(counts(doc)));
    expect(counts(doc).questions).toBe(3);
    expect(counts(doc).fields).toBe(6);
    expect(
      doc.blocks.find((b) => b.kind === "multiple-choice")?.options,
    ).toEqual(["Sunlight", "Moonlight", "Soil"]);
    expect(doc.blocks.find((b) => b.kind === "fill-blank")?.text).toMatch(
      /Plants take in _+ and release _+/,
    );
  }, 180000);

it("digital PDF retains vector/text blanks and option geometry without photo cleanup", async () => {
  const doc = await convert("water-cycle.pdf");
  expect(doc.original.source).toBe("pdf");
  expect(doc.blocks.filter((b) => b.kind === "identity")).toHaveLength(2);
  expect(
    doc.blocks
      .filter((b) => b.kind === "identity")
      .every((b) => b.lines.some((l) => l.blanks?.length === 1)),
  ).toBe(true);
  expect(
    doc.blocks
      .find((b) => b.kind === "multiple-choice")
      ?.lines.flatMap((l) => l.optionBoxes ?? [])
      .map((o) => o.text),
  ).toEqual(["Evaporation", "Collection", "Freezing"]);
  expect(
    doc.blocks
      .find((b) => b.kind === "short-answer")
      ?.lines.flatMap((l) => l.blanks ?? []),
  ).toHaveLength(2);
}, 90000);

it("scales manually reviewed photo corners with a large source bitmap", async () => {
  const doc = await convert("desk-photo.png", true, true);
  expect(counts(doc).questions).toBe(3);
  expect(counts(doc).fields).toBe(6);
  expect(doc.previews![0].width).toBeLessThan(2000);
  expect(doc.previews![0].height).toBeLessThan(2000);
}, 90000);

it("retains digital vector answer rules and does not invoke OCR on text-only PDFs", async () => {
  const { PDFDocument } = await import("pdf-lib"),
    pdf = await PDFDocument.create(),
    page = pdf.addPage([400, 600]);
  page.drawText("Practice", { x: 30, y: 580, size: 18 });
  page.drawText("Name:", { x: 30, y: 540, size: 12 });
  page.drawLine({
    start: { x: 100, y: 538 },
    end: { x: 300, y: 538 },
    thickness: 1,
  });
  page.drawText("1. Explain the cycle.", { x: 30, y: 440, size: 12 });
  for (const y of [400, 370])
    page.drawLine({ start: { x: 30, y }, end: { x: 300, y }, thickness: 1 });
  const doc = await convert("vector-rules.pdf", true, false, await pdf.save());
  expect(metrics.passes).toBe(0);
  const name = doc.blocks.find((b) => b.kind === "identity")!;
  expect(name.lines.flatMap((l) => l.blanks ?? [])).toHaveLength(1);
  const question = doc.blocks.find((b) => b.kind === "short-answer")!;
  expect(question.lines.flatMap((l) => l.blanks ?? [])).toHaveLength(2);
}, 90000);
