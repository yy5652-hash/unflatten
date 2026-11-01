import { it, expect, vi, afterEach } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import "tesseract.js";
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
      ) =>
        recognize(
          image.toBuffer ? image.toBuffer("image/png") : (image as never),
          ...(args as []),
        )) as typeof worker.recognize;
      return worker;
    },
  };
});
afterEach(() => vi.unstubAllGlobals());
async function convert(name: string) {
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
  const bytes = await readFile("public/samples/" + name);
  return fromFile(
    new File([bytes], name, { type: "image/png" }),
    "en",
    () => {},
  );
}
it("real OCR sample A preserves 3 questions and two reconstructed blanks", async () => {
  const doc = await convert("photosynthesis-scan.png");
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
