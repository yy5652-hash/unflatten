import { answerKeys, type Box, type Worksheet } from "../parse/types";
export type Drawing = {
  key: string;
  kind: "text" | "ring" | "tick";
  box: Box;
  text?: string;
  size?: number;
};
export interface Unplaced {
  key: string;
  question: string;
  answer: string;
}
export interface PaperPlan {
  pages: { page: number; instructions: Drawing[] }[];
  unplaced: Unplaced[];
  placed: number;
}
export const inkColor = "#163b79";
export const paperFont = 'system-ui, "Segoe UI", Arial, sans-serif';
type Measure = (text: string, size: number) => number;
// A conservative system-font-independent estimate. The canvas path supplies its real metrics.
const estimate: Measure = (text, size) =>
  Array.from(text).reduce(
    (n, c) => n + (/[\u0000-\u007f]/.test(c) ? 0.68 : 1.1) * size,
    0,
  );
const graphemes = (s: string) =>
  [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s),
  ].map((v) => v.segment);
function fit(
  text: string,
  boxes: Box[],
  minimum: number,
  measure: Measure,
  target: number,
  centre = false,
): Omit<Drawing, "key">[] | null {
  if (!boxes.length) return null;
  // Answers match the printed text, not the height of the rule or cell they sit in.
  // Inside a table cell the text also has to stay within the cell.
  const start = centre
    ? Math.min(target, Math.min(...boxes.map((b) => b.height)) / 1.15)
    : target;
  for (let size = Math.max(minimum, start); size >= minimum; size -= 1) {
    const chars = graphemes(text.trim()),
      drawings: Omit<Drawing, "key">[] = [];
    let at = 0;
    for (const b of boxes) {
      const rows = Math.max(1, Math.floor((b.height + 1) / (size * 1.15)));
      for (let row = 0; row < rows; row++) {
        while (chars[at] === " ") at++;
        const start = at;
        let end = at,
          lastSpace = -1;
        while (
          end < chars.length &&
          chars[end] !== "\n" &&
          measure(chars.slice(start, end + 1).join(""), size) <= b.width - 6
        ) {
          if (/\s/.test(chars[end])) lastSpace = end;
          end++;
        }
        if (end < chars.length && lastSpace > start) end = lastSpace;
        if (end === start) break;
        drawings.push({
          kind: "text",
          text: chars.slice(start, end).join(""),
          size,
          box: {
            x: b.x + 3,
            // A single row sits on the rule, even when the text is taller than the box.
            y:
              rows === 1
                ? b.y + b.height - size * 1.15
                : b.y + row * size * 1.15,
            width: b.width - 6,
            height: size * 1.15,
          },
        });
        at = end;
        if (chars[at] === "\n") at++;
        if (at === chars.length) {
          if (centre && drawings.length) {
            const shift = (b.height - drawings.length * size * 1.15) / 2;
            if (shift > 0 && rows > 1)
              for (const d of drawings)
                if (d.box) d.box.y += shift;
          }
          return drawings;
        }
      }
    }
  }
  return null;
}
function printedSize(doc: Worksheet, page: number, minimum: number) {
  const heights = doc.blocks
    .filter((b) => b.page === page && !["title", "heading"].includes(b.kind))
    .flatMap((b) => b.lines)
    .filter((l) => /\p{L}{3}/u.test(l.text) && l.height > 0)
    .map((l) => l.height)
    .sort((a, c) => a - c);
  return heights.length
    ? heights[heights.length >> 1] * 0.85
    : minimum * 1.6;
}
/** Pure layout. Never invent a position from the question's text bounds. */
export function placeAnswers(
  doc: Worksheet,
  measure: Measure = estimate,
): PaperPlan {
  const plan: PaperPlan = {
    pages: (doc.previews ?? []).map((p) => ({
      page: p.page,
      instructions: [],
    })),
    unplaced: [],
    placed: 0,
  };
  for (const b of doc.blocks) {
    const page = plan.pages.find((p) => p.page === b.page),
      preview = doc.previews?.find((p) => p.page === b.page),
      min = Math.max(
        10,
        Math.max(preview?.width ?? 1600, preview?.height ?? 1600) * 0.0075,
      ),
      blanks = b.lines.flatMap((l) => l.blanks ?? []);
    for (const key of answerKeys(b)) {
      const answer = doc.answers[key]?.trim();
      if (!answer || answer === "[]") continue;
      let instructions: Drawing[] | null = null;
      if (["multiple-choice", "checkbox", "true-false"].includes(b.kind)) {
        let values: string[] = [];
        try {
          const parsed: unknown =
            b.kind === "checkbox" ? JSON.parse(answer) : [answer];
          if (
            Array.isArray(parsed) &&
            parsed.every((v) => typeof v === "string")
          )
            values = parsed;
        } catch {
          /* preserve malformed saved answers below */
        }
        const marks: Drawing[] = [];
        if (Array.isArray(values))
          for (const v of values) {
            const l = b.lines.find((l) =>
                l.optionBoxes?.some((o) => o.text === v),
              ),
              option = l?.optionBoxes?.find((o) => o.text === v);
            if (!l || !option) break;
            if (b.kind === "checkbox") {
              if (!l.glyph) break;
              marks.push({ key, kind: "tick", box: l.glyph });
            } else if (option.letter)
              marks.push({ key, kind: "ring", box: option.letter });
            else
              marks.push({
                key,
                kind: "tick",
                box: {
                  x: option.box.x - Math.max(14, option.box.height),
                  y: option.box.y,
                  width: Math.max(12, option.box.height * 0.8),
                  height: option.box.height,
                },
              });
          }
        if (values.length && marks.length === values.length)
          instructions = marks;
      } else {
        let boxes: Box[] = [];
        if (b.kind === "table") {
          const suffix = key
              .slice(b.id.length + 1)
              .split("-")
              .map(Number),
            cells = b.lines.find((l) => l.cellBoxes)?.cellBoxes,
            box = cells?.[suffix[0]]?.[suffix[1]];
          if (box)
            boxes = [
              {
                x: box.x + 6,
                y: box.y + 6,
                width: box.width - 12,
                height: box.height - 12,
              },
            ];
        } else if (b.kind === "fill-blank") {
          const i = Number(key.slice(b.id.length + 1));
          if (blanks[i]) boxes = [blanks[i]];
        } else if (["short-answer", "identity"].includes(b.kind))
          boxes = blanks;
        const fitted = fit(
          answer,
          boxes,
          min,
          measure,
          printedSize(doc, b.page, min),
          b.kind === "table",
        );
        if (fitted) instructions = fitted.map((d) => ({ ...d, key }));
      }
      if (
        instructions &&
        page &&
        preview &&
        instructions.every(
          (d) =>
            [d.box.x, d.box.y, d.box.width, d.box.height].every(
              Number.isFinite,
            ) &&
            d.box.x >= 0 &&
            d.box.y >= 0 &&
            d.box.x + d.box.width <= preview.width + 1 &&
            d.box.y + d.box.height <= preview.height + 1,
        )
      ) {
        page.instructions.push(...instructions);
        plan.placed++;
      } else plan.unplaced.push({ key, question: b.text, answer });
    }
  }
  return plan;
}
export function drawAnswers(
  ctx: CanvasRenderingContext2D,
  instructions: Drawing[],
  language: string,
) {
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = inkColor;
  ctx.textBaseline = "top";
  ctx.direction = language === "ar" ? "rtl" : "ltr";
  for (const d of instructions) {
    const b = d.box;
    ctx.lineWidth = Math.max(2, b.height * 0.085);
    if (d.kind === "text") {
      ctx.font = `${d.size}px ${paperFont}`;
      ctx.textAlign = language === "ar" ? "right" : "left";
      ctx.fillText(d.text!, language === "ar" ? b.x + b.width : b.x, b.y);
    } else if (d.kind === "ring") {
      ctx.beginPath();
      ctx.ellipse(
        b.x + b.width / 2,
        b.y + b.height / 2,
        b.width / 2 + 3,
        b.height / 2 + 3,
        0,
        0,
        2 * Math.PI,
      );
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(b.x + b.width * 0.15, b.y + b.height * 0.5);
      ctx.lineTo(b.x + b.width * 0.42, b.y + b.height * 0.8);
      ctx.lineTo(b.x + b.width * 0.88, b.y + b.height * 0.15);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function measureOn(ctx: CanvasRenderingContext2D): Measure {
  return (text, size) => {
    ctx.font = `${size}px ${paperFont}`;
    return ctx.measureText(text).width;
  };
}
export async function renderPaper(
  doc: Worksheet,
  pageNumber = 1,
  blank = false,
) {
  const p = doc.previews?.find((p) => p.page === pageNumber);
  if (!p) throw Error("No original page is stored.");
  const canvas = document.createElement("canvas");
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext("2d")!,
    image = new Image();
  image.src = p.image;
  await image.decode();
  ctx.drawImage(image, 0, 0, p.width, p.height);
  const plan = placeAnswers(
    blank ? { ...doc, answers: {} } : doc,
    measureOn(ctx),
  );
  drawAnswers(
    ctx,
    plan.pages.find((p) => p.page === pageNumber)?.instructions ?? [],
    doc.language,
  );
  return { canvas, plan };
}
export async function makePaperPDF(doc: Worksheet, blank = false) {
  if (!doc.previews?.length) throw Error("No original pages are stored.");
  const { PDFDocument } = await import("pdf-lib"),
    pdf = await PDFDocument.create();
  pdf.setTitle(doc.name);
  pdf.setLanguage(doc.language);
  pdf.setCreator("Unflatten");
  let unplaced: Unplaced[] = [];
  const add = async (canvas: HTMLCanvasElement) => {
    const image = await pdf.embedPng(canvas.toDataURL("image/png")),
      scale = 792 / Math.max(canvas.width, canvas.height),
      w = canvas.width * scale,
      h = canvas.height * scale;
    pdf.addPage([w, h]).drawImage(image, { x: 0, y: 0, width: w, height: h });
  };
  for (const p of doc.previews) {
    const rendered = await renderPaper(doc, p.page, blank);
    unplaced = rendered.plan.unplaced;
    await add(rendered.canvas);
  }
  if (unplaced.length) {
    // A single final page grows to retain every answer, without clipping or font loss.
    const c = document.createElement("canvas");
    c.width = 1600;
    const ctx = c.getContext("2d")!,
      size = 26,
      lineHeight = 38,
      margin = 70;
    ctx.font = `${size}px ${paperFont}`;
    const rows: string[] = [];
    for (const u of unplaced) {
      for (const text of [u.question, u.answer]) {
        let row = "";
        for (const char of graphemes(text)) {
          if (char === "\n" || ctx.measureText(row + char).width > 1460) {
            rows.push(row);
            row = "";
          }
          if (char !== "\n") row += char;
        }
        rows.push(row);
      }
      rows.push("");
    }
    c.height = 160 + rows.length * lineHeight;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = inkColor;
    ctx.font = `bold 34px ${paperFont}`;
    ctx.fillText("Answers that could not be placed", margin, 70);
    ctx.font = `${size}px ${paperFont}`;
    ctx.direction = doc.language === "ar" ? "rtl" : "ltr";
    ctx.textAlign = doc.language === "ar" ? "right" : "left";
    rows.forEach((r, i) =>
      ctx.fillText(
        r,
        doc.language === "ar" ? 1530 : margin,
        145 + i * lineHeight,
      ),
    );
    // Use a consistent physical text size for a long final page.
    const image = await pdf.embedPng(c.toDataURL("image/png")),
      scale = 612 / c.width;
    pdf
      .addPage([612, c.height * scale])
      .drawImage(image, { x: 0, y: 0, width: 612, height: c.height * scale });
  }
  return pdf.save();
}
