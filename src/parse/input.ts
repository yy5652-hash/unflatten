import { classify, textLines } from "./classify";
import { readingOrder, dropRepeatedMargins, joinFragments } from "./order";
import { findRules, placeRules, BLANK, type Rule, type Word } from "./rules";
import {
  languages,
  type Language,
  type Box,
  type Line,
  type Worksheet,
  type Block,
  type Original,
  type PagePreview,
} from "./types";
import { cleanImage, detectCheckboxes, detectGrids } from "./vision";
import { inlineOptions } from "./options";
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
  language: Language,
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
  language: Language,
  progress: (message: string) => void,
  signal?: AbortSignal,
): Promise<Worksheet> {
  if (file.size > 40 * 1024 * 1024)
    throw Error("This file is over 40 MB. Try fewer pages or a smaller photo.");
  if (/\.txt$/i.test(file.name) || file.type === "text/plain")
    return fromText(await file.text(), language);
  if (/\.docx$/i.test(file.name)) {
    progress("Reading Word paragraphs on this device.");
    const { extractRawText } = await import("mammoth");
    const result = await extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    const doc = await fromText(result.value, language);
    doc.original.source = "word";
    return doc;
  }
  const previews: PagePreview[] = [];
  const tables: Block[] = [];
  const remember = (canvas: HTMLCanvasElement) => {
    if (!previews.some((p) => p.page === pageNumber))
      previews.push({
        page: pageNumber,
        image: canvas.toDataURL("image/jpeg", 0.8),
        width: canvas.width,
        height: canvas.height,
      });
  };
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
      worker = await createWorker(languages[language][1], 1, {
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
    cleanImage(canvas);
    remember(canvas);
    const pixels = canvas
      .getContext("2d", { willReadFrequently: true })!
      .getImageData(0, 0, canvas.width, canvas.height);
    const glyphs = detectCheckboxes(pixels),
      grids = detectGrids(pixels);
    // Rules are useful to structure the table but confuse character recognition.
    // Remove them on a separate recognition copy, preserving the real source preview.
    const sourceRules = pageRules(canvas);
    let recognitionCanvas = canvas;
    if (grids.length || sourceRules.length) {
      recognitionCanvas = document.createElement("canvas");
      recognitionCanvas.width = canvas.width;
      recognitionCanvas.height = canvas.height;
      const ctx = recognitionCanvas.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      ctx.fillStyle = "white";
      for (const r of sourceRules)
        ctx.fillRect(r.x0 - 2, r.y - 3, r.x1 - r.x0 + 4, 7);
      for (const g of grids) {
        for (const x of g.xs) ctx.fillRect(x - 4, g.y - 4, 9, g.height + 8);
        for (const y of g.ys) ctx.fillRect(g.x - 4, y - 4, g.width + 8, 9);
      }
    }
    const { data: result } = await worker.recognize(
      recognitionCanvas,
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
    const allWords = ocrLines.flatMap((l) => l.words);
    for (const [gi, g] of grids.entries()) {
      const cells = g.ys.slice(0, -1).map((y, r) =>
        g.xs.slice(0, -1).map((x, c) =>
          allWords
            .filter(
              (w) =>
                w.x + w.width / 2 > x &&
                w.x + w.width / 2 < g.xs[c + 1] &&
                w.y + w.height / 2 > y &&
                w.y + w.height / 2 < g.ys[r + 1],
            )
            .sort((a, b) => a.y - b.y || a.x - b.x)
            .map((w) => w.text)
            .join(" ")
            .replace(/^[|_\s]+$/, ""),
        ),
      );
      tables.push({
        id: `table-${pageNumber}-${gi}`,
        kind: "table",
        text: `Table on page ${pageNumber}`,
        page: pageNumber,
        cells,
        lines: [
          {
            ...g,
            text: "Ruled table",
            page: pageNumber,
            pageWidth: canvas.width,
            pageHeight: canvas.height,
            confidence: Math.min(
              100,
              ...allWords
                .filter(
                  (w) =>
                    w.x > g.x &&
                    w.x < g.x + g.width &&
                    w.y > g.y &&
                    w.y < g.y + g.height,
                )
                .map((w) => w.confidence),
            ),
          },
        ],
      });
    }
    const withinGrid = (x: number, y: number) =>
      grids.some(
        (g) =>
          x >= g.x - 5 &&
          x <= g.x + g.width + 5 &&
          y >= g.y - 5 &&
          y <= g.y + g.height + 5,
      );
    const placed = placeRules(
      ocrLines.filter(
        (l) =>
          !withinGrid(l.box.x + l.box.width / 2, l.box.y + l.box.height / 2),
      ),
      pageRules(canvas).filter(
        (r) =>
          !withinGrid((r.x0 + r.x1) / 2, r.y) &&
          !ocrLines.some(
            (l) =>
              /^[|_\s]*word bank/i.test(l.words.map((w) => w.text).join(" ")) &&
              Math.abs(r.y - (l.box.y + l.box.height / 2)) <
                l.box.height * 2.5 &&
              r.x1 - r.x0 > l.box.width * 0.7,
          ),
      ),
    );
    const pageLines: Line[] = [];
    for (const l of placed.lines) {
      const words = [...l.words].sort((a, b) => a.x - b.x);
      if (!words.length) continue;
      // Marks and rules are not words: an unsure checkbox glyph says nothing about the text beside it.
      const read = words.filter((w) => /[\p{L}\p{N}]/u.test(w.text));
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
      const leftGlyphs = glyphs.filter(
        (g) =>
          Math.abs(g.y + g.height / 2 - (line.y + line.height / 2)) <
            Math.max(g.height, line.height) &&
          g.x >= line.x - 60 &&
          g.x < line.x + line.width &&
          !words.some(
            (w) =>
              w.x < g.x + g.width &&
              w.x + w.width > g.x &&
              w.width > g.width * 1.5,
          ) &&
          words.some(
            (w) =>
              w.x >= g.x + g.width * 0.8 &&
              w.x - g.x - g.width < line.height * 2.5,
          ),
      );
      if (leftGlyphs.length) {
        const ordered = [...leftGlyphs].sort((a, b) => a.x - b.x);
        for (const [i, g] of ordered.entries()) {
          const own = words.filter(
            (w) =>
              w.x > g.x + g.width * 0.7 &&
              (!ordered[i + 1] || w.x < ordered[i + 1].x),
          );
          const text = own.map((w) => w.text).join(" ");
          if (text)
            pageLines.push({
              ...line,
              // Judged on this option's own words, not on noise OCR read off the box.
              confidence:
                own.reduce((n, w) => n + w.confidence, 0) / own.length,
              text: "☐ " + text,
              checkbox: g.shape === "square",
              x: g.x,
              width: (ordered[i + 1]?.x ?? line.x + line.width) - g.x,
              crop: crop(canvas, line),
            });
        }
        continue;
      }
      line.text = inlineOptions(words) ?? line.text;
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
            remember(canvas);
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
            const digitalGrids = detectGrids(
              canvas
                .getContext("2d", { willReadFrequently: true })!
                .getImageData(0, 0, canvas.width, canvas.height),
            );
            const inGrid = (x: number, y: number) =>
              digitalGrids.some(
                (g) =>
                  x >= g.x - 3 &&
                  x <= g.x + g.width + 3 &&
                  y >= g.y - 3 &&
                  y <= g.y + g.height + 3,
              );
            for (const [gi, g] of digitalGrids.entries())
              tables.push({
                id: `table-${pageNumber}-${gi}`,
                kind: "table",
                text: `Table on page ${pageNumber}`,
                page: pageNumber,
                cells: g.ys.slice(0, -1).map((y, r) =>
                  g.xs.slice(0, -1).map((x, c) =>
                    fragments
                      .filter(
                        (w) =>
                          w.x + w.width / 2 > x &&
                          w.x + w.width / 2 < g.xs[c + 1] &&
                          w.y + w.height / 2 > y &&
                          w.y + w.height / 2 < g.ys[r + 1],
                      )
                      .sort((a, b) => a.y - b.y || a.x - b.x)
                      .map((w) => w.text)
                      .join(" "),
                  ),
                ),
                lines: [
                  {
                    ...g,
                    text: "Ruled table",
                    page: pageNumber,
                    pageWidth: canvas.width,
                    pageHeight: canvas.height,
                    confidence: 100,
                  },
                ],
              });
            const bodyFragments = fragments.filter(
              (f) => !inGrid(f.x + f.width / 2, f.y + f.height / 2),
            );
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
              bodyFragments.map((f) => ({
                box: { x: f.x, y: f.y, width: f.width, height: f.height },
                words: [{ ...f }],
              })),
              pageRules(canvas).filter(
                (r) =>
                  !pictures.some((box) => inBox(r, box)) &&
                  !inGrid((r.x0 + r.x1) / 2, r.y),
              ),
              true,
            );
            const withBlanks: Line[] = drawn.lines.flatMap((l, i) =>
              l.words.map((w) => ({
                ...bodyFragments[i],
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
            for (const [n, box] of pictures.entries()) {
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
              // Reuse the local OCR worker on the figure crop without adding crop text to page order.
              let figureText = "";
              if (!worker) {
                const { createWorker } = await import("tesseract.js");
                worker = await createWorker(languages[language][1], 1, {
                  workerPath: asset("ocr-worker.js"),
                  corePath: asset(
                    simd
                      ? "core/tesseract-core-simd-lstm.wasm.js"
                      : "core/tesseract-core-lstm.wasm.js",
                  ),
                  langPath: asset("").replace(/\/$/, ""),
                  workerBlobURL: false,
                  cacheMethod: "none",
                });
              }
              try {
                figureText = (await worker.recognize(preview)).data.text.trim();
              } catch {
                /* The actual image is still preserved. */
              }
              figures.push({
                id: `figure-${pageNumber}-${n}`,
                kind: "figure",
                text: `Figure on page ${pageNumber} has no description`,
                page: pageNumber,
                lines: [],
                figureText,
                image: preview.toDataURL("image/jpeg", 0.85),
              });
            }
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
      const imageContext = canvas.getContext("2d")!;
      imageContext.fillStyle = "white";
      imageContext.fillRect(0, 0, canvas.width, canvas.height);
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      await ocr(canvas);
      canvas.width = canvas.height = 0;
    } else throw Error("Choose a PDF, PNG, JPEG, Word (.docx) or .txt file.");
    check();
    progress("Putting the worksheet in reading order.");
    const blocks = classify(readingOrder(dropRepeatedMargins(lines)));
    for (const table of tables) {
      let index = blocks.findIndex(
        (b) =>
          b.page > table.page ||
          (b.page === table.page && (b.lines[0]?.y ?? 0) > table.lines[0].y),
      );
      if (index < 0) index = blocks.length;
      const prev = blocks[index - 1];
      if (
        prev?.kind === "short-answer" &&
        /table|grid/i.test(prev.text) &&
        prev.page === table.page
      ) {
        table.text = prev.text;
        table.lines.unshift(...prev.lines);
        blocks.splice(index - 1, 1, table);
      } else blocks.splice(index, 0, table);
    }
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
      previews,
      answers: {},
      updated: Date.now(),
    };
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (worker) await worker.terminate();
  }
}

export async function fromPhotos(
  files: File[],
  language: Language,
  progress: (s: string) => void,
  signal?: AbortSignal,
): Promise<Worksheet> {
  if (!files.length) throw Error("Add a photo first.");
  const docs: Worksheet[] = [];
  for (const [i, file] of files.entries()) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    progress(`Converting photo ${i + 1} of ${files.length}`);
    docs.push(await fromFile(file, language, progress, signal));
  }
  const doc = docs[0];
  let offset = 0;
  const blocks: Block[] = [],
    previews: PagePreview[] = [];
  for (const [i, d] of docs.entries()) {
    for (const b of d.blocks)
      blocks.push({
        ...b,
        kind: i > 0 && b.kind === "title" ? "heading" : b.kind,
        id: `p${i}-${b.id}`,
        page: b.page + offset,
        lines: b.lines.map((l) => ({ ...l, page: l.page + offset })),
      });
    previews.push(
      ...(d.previews ?? []).map((p) => ({ ...p, page: p.page + offset })),
    );
    offset += d.original.pages;
  }
  return {
    ...doc,
    id: await documentHash(docs.map((d) => d.id).join(",")),
    blocks,
    previews,
    original: { ...doc.original, pages: offset },
  };
}
