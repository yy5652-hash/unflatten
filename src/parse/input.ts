import { classify, textLines } from "./classify";
import { readingOrder, dropRepeatedMargins, joinFragments } from "./order";
import { findRules, placeRules, BLANK, type Rule, type Word } from "./rules";
import type { Box, Line, Worksheet, Block, Original } from "./types";
import type { Worker } from "tesseract.js";
const asset = (s: string) => new URL(`./vendor/${s}`, document.baseURI).href;
// A minimal module using one v128 instruction: validates only where SIMD works.
const simd = WebAssembly.validate(
  new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1,
    8, 0, 65, 0, 253, 15, 253, 98, 11,
  ]),
);
const pageRules = (canvas: HTMLCanvasElement): Rule[] =>
  findRules(
    canvas
      .getContext("2d", { willReadFrequently: true })!
      .getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height,
  );
const inBox = (rule: Rule, box: Box) =>
  rule.y >= box.y &&
  rule.y <= box.y + box.height &&
  (rule.x0 + rule.x1) / 2 >= box.x &&
  (rule.x0 + rule.x1) / 2 <= box.x + box.width;
/** Where each image lands on the rendered page, read from the drawing operators. */
function imageBoxes(
  ops: { fnArray: number[]; argsArray: unknown[] },
  OPS: Record<string, number>,
  multiply: (a: number[], b: number[]) => number[],
  viewport: number[],
): Box[] {
  const paint = new Set([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
  ]);
  const stack: number[][] = [];
  let ctm = viewport;
  const boxes: Box[] = [];
  ops.fnArray.forEach((fn, i) => {
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform)
      ctm = multiply(ctm, ops.argsArray[i] as number[]);
    else if (paint.has(fn)) {
      const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2]],
        ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3]];
      boxes.push({
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      });
    }
  });
  return boxes;
}
function ruleLine(rule: Rule, canvas: HTMLCanvasElement, page: number): Line {
  return {
    text: BLANK,
    x: rule.x0,
    y: rule.y - 16,
    width: rule.x1 - rule.x0,
    height: 20,
    page,
    pageWidth: canvas.width,
    pageHeight: canvas.height,
    confidence: 100,
  };
}
export async function documentHash(data: ArrayBuffer | string) {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function fromText(
  text: string,
  language: "en" | "es",
): Promise<Worksheet> {
  if (!text.trim()) throw Error("Paste some worksheet text first.");
  const blocks = classify(textLines(text));
  return {
    id: await documentHash(text),
    name: blocks.find((b) => b.kind === "title")?.text || "Pasted worksheet",
    language,
    blocks,
    answers: {},
    updated: Date.now(),
    original: {
      characters: text.length,
      headings: 0,
      fields: 0,
      tagged: null,
      pages: 1,
      source: "text",
    },
  };
}
function crop(canvas: HTMLCanvasElement, line: Line): string {
  const c = document.createElement("canvas");
  const pad = 5,
    x = Math.max(0, line.x - pad),
    y = Math.max(0, line.y - pad),
    w = Math.min(canvas.width - x, line.width + pad * 2),
    h = Math.min(canvas.height - y, line.height + pad * 2);
  const scale = Math.min(1, 1000 / w);
  c.width = Math.max(1, w * scale);
  c.height = Math.max(1, h * scale);
  c.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}
export async function fromFile(
  file: File,
  language: "en" | "es",
  progress: (message: string) => void,
  signal?: AbortSignal,
): Promise<Worksheet> {
  if (file.size > 40 * 1024 * 1024)
    throw Error("This file is over 40 MB. Try fewer pages or a smaller photo.");
  const data = await file.arrayBuffer(),
    id = await documentHash(data);
  let worker: Worker | undefined;
  let pageNumber = 1,
    totalPages = 1;
  const check = () => {
    if (signal?.aborted)
      throw new DOMException("Conversion cancelled", "AbortError");
  };
  const cancel = () => {
    void worker?.terminate();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const original: Original = {
    characters: 0,
    headings: 0,
    fields: 0,
    tagged: null,
    pages: 1,
    source: "image",
  };
  const lines: Line[] = [],
    figures: Block[] = [];
  const ocr = async (canvas: HTMLCanvasElement) => {
    check();
    progress(
      `Page ${pageNumber} of ${totalPages}: preparing text recognition.`,
    );
    if (!worker) {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker(language === "es" ? "spa" : "eng", 1, {
        workerPath: asset("ocr-worker.js"),
        corePath: asset(
          simd
            ? "core/tesseract-core-simd-lstm.wasm.js"
            : "core/tesseract-core-lstm.wasm.js",
        ),
        langPath: asset("").replace(/\/$/, ""),
        workerBlobURL: false,
        cacheMethod: "none",
        logger: (m) => {
          if (m.status === "recognizing text")
            progress(
              `Page ${pageNumber} of ${totalPages}: reading the image, ${Math.round(m.progress * 100)} percent.`,
            );
        },
      });
    }
    check();
    const { data: result } = await worker.recognize(
      canvas,
      {},
      { blocks: true },
    );
    check();
    const ocrLines = (result.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines
          .filter((l) => l.text.trim())
          .map((l) => ({
            box: {
              x: l.bbox.x0,
              y: l.bbox.y0,
              width: l.bbox.x1 - l.bbox.x0,
              height: l.bbox.y1 - l.bbox.y0,
            },
            words: l.words.map((w): Word => ({
              text: w.text,
              confidence: w.confidence,
              x: w.bbox.x0,
              y: w.bbox.y0,
              width: w.bbox.x1 - w.bbox.x0,
              height: w.bbox.y1 - w.bbox.y0,
            })),
          })),
      ),
    );
    const placed = placeRules(ocrLines, pageRules(canvas));
    const pageLines: Line[] = [];
    for (const l of placed.lines) {
      const words = [...l.words].sort((a, b) => a.x - b.x);
      if (!words.length) continue;
      const read = words.filter((w) => w.text !== BLANK);
      const line: Line = {
        ...l.box,
        // Attach closing punctuation that OCR split off a blank.
        text: words
          .map((w) => w.text.trim())
          .join(" ")
          .replace(/\s+([.,;:?!])/g, "$1"),
        page: pageNumber,
        pageWidth: canvas.width,
        pageHeight: canvas.height,
        confidence: read.length
          ? read.reduce((n, w) => n + w.confidence, 0) / read.length
          : 100,
      };
      line.crop = crop(canvas, line);
      pageLines.push(line);
    }
    for (const rule of placed.free)
      pageLines.push(ruleLine(rule, canvas, pageNumber));
    lines.push(...pageLines);
  };
  try {
    check();
    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      original.source = "pdf";
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = asset("pdf-worker.mjs");
      const task = pdfjs.getDocument({
        data,
        cMapUrl: asset("pdf/cmaps/"),
        cMapPacked: true,
        standardFontDataUrl: asset("pdf/standard_fonts/"),
        wasmUrl: asset("pdf/wasm/"),
        iccUrl: asset("pdf/iccs/"),
      });
      const abortPdf = () => {
        void task.destroy();
      };
      signal?.addEventListener("abort", abortPdf, { once: true });
      try {
        const pdf = await task.promise;
        totalPages = pdf.numPages;
        original.pages = totalPages;
        if (totalPages > 40)
          throw Error(
            "Please split this PDF into batches of 40 pages or fewer.",
          );
        original.tagged = Boolean((await pdf.getMarkInfo())?.Marked);
        const fields = await pdf.getFieldObjects();
        const values: unknown[] =
          fields instanceof Map
            ? [...fields.values()]
            : fields
              ? Object.values(fields)
              : [];
        original.fields = values.reduce<number>(
          (n, a) => n + (Array.isArray(a) ? a.length : 0),
          0,
        );
        for (pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
          check();
          progress(
            `Page ${pageNumber} of ${totalPages}: checking for readable text.`,
          );
          const page = await pdf.getPage(pageNumber),
            text = await page.getTextContent(),
            baseViewport = page.getViewport({ scale: 1 });
          const items = text.items.filter(
            (t): t is import("pdfjs-dist/types/src/display/api").TextItem =>
              "str" in t,
          );
          const raw = items.map((t) => t.str).join("");
          original.characters += raw.length;
          const tree = await page.getStructTree();
          const countHeadings = (node: unknown): number => {
            if (!node || typeof node !== "object") return 0;
            const n = node as { role?: string; children?: unknown[] };
            return (
              (/^H[1-6]?$/.test(n.role || "") ? 1 : 0) +
              (n.children ?? []).reduce<number>(
                (sum, c) => sum + countHeadings(c),
                0,
              )
            );
          };
          original.headings += countHeadings(tree);
          const realText = (raw.match(/[\p{L}\p{N}]/gu) || []).length >= 3;
          const viewport = page.getViewport({
            scale: Math.min(
              2,
              1800 / Math.max(baseViewport.width, baseViewport.height),
            ),
          });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          check();
          if (realText) {
            const fragments = items
              .filter((t) => t.str.trim())
              .map((t) => {
                const tr = pdfjs.Util.transform(
                  viewport.transform,
                  t.transform,
                );
                const h = Math.hypot(tr[2], tr[3]);
                return {
                  text: t.str,
                  x: tr[4],
                  y: tr[5] - h,
                  width: Math.max(t.width * viewport.scale, 1),
                  height: h || 12,
                  page: pageNumber,
                  pageWidth: canvas.width,
                  pageHeight: canvas.height,
                  confidence: 100,
                  fontSize: t.height,
                } satisfies Line;
              });
            const ops = await page.getOperatorList();
            const pictures = imageBoxes(
              ops,
              pdfjs.OPS as unknown as Record<string, number>,
              pdfjs.Util.transform,
              viewport.transform,
            ).filter((box) => {
              const share =
                (box.width * box.height) / (canvas.width * canvas.height);
              return share > 0.005 && share < 0.85;
            });
            // Blanks drawn as vector lines are not in the text layer at all.
            const drawn = placeRules(
              fragments.map((f) => ({
                box: { x: f.x, y: f.y, width: f.width, height: f.height },
                words: [{ ...f }],
              })),
              pageRules(canvas).filter(
                (r) => !pictures.some((box) => inBox(r, box)),
              ),
              true,
            );
            const withBlanks: Line[] = drawn.lines.flatMap((l, i) =>
              l.words.map((w) => ({
                ...fragments[i],
                x: w.x,
                width: w.width,
                text: w.text,
              })),
            );
            const joined = joinFragments(withBlanks);
            for (const rule of drawn.free)
              joined.push(ruleLine(rule, canvas, pageNumber));
            for (const l of joined) l.crop = crop(canvas, l);
            lines.push(...joined);
            // The crop keeps the picture itself; nothing here invents a description of it.
            pictures.forEach((box, n) => {
              const preview = document.createElement("canvas");
              preview.width = Math.min(800, box.width);
              preview.height = (box.height * preview.width) / box.width;
              preview
                .getContext("2d")!
                .drawImage(
                  canvas,
                  box.x,
                  box.y,
                  box.width,
                  box.height,
                  0,
                  0,
                  preview.width,
                  preview.height,
                );
              figures.push({
                id: `figure-${pageNumber}-${n}`,
                kind: "figure",
                text: `Figure on page ${pageNumber} has no description`,
                page: pageNumber,
                lines: [],
                image: preview.toDataURL("image/jpeg", 0.85),
              });
            });
          } else await ocr(canvas);
          canvas.width = canvas.height = 0;
          page.cleanup();
        }
      } finally {
        signal?.removeEventListener("abort", abortPdf);
        await task.destroy();
      }
    } else if (
      /^image\/(png|jpeg)$/.test(file.type) ||
      /\.(png|jpe?g)$/i.test(file.name)
    ) {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement("canvas");
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      await ocr(canvas);
      canvas.width = canvas.height = 0;
    } else throw Error("Choose a PDF, PNG or JPEG file.");
    check();
    progress("Putting the worksheet in reading order.");
    const blocks = classify(readingOrder(dropRepeatedMargins(lines)));
    for (const figure of figures) {
      let index = blocks.findIndex((b) => b.page > figure.page);
      if (index === -1) index = blocks.length;
      blocks.splice(index, 0, figure);
    }
    if (!blocks.some((b) => b.text.trim()))
      throw Error(
        "No readable text was found. Try a clearer, straight-on photo or paste the text.",
      );
    return {
      id,
      name: blocks.find((b) => b.kind === "title")?.text || file.name,
      language,
      blocks,
      original,
      answers: {},
      updated: Date.now(),
    };
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (worker) await worker.terminate();
  }
}
