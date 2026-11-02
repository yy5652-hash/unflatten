export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Line extends Box {
  text: string;
  page: number;
  pageWidth: number;
  pageHeight: number;
  confidence: number;
  /** A human has checked this line; OCR confidence is preserved. */
  reviewed?: boolean;
  crop?: string;
  fontSize?: number;
  checkbox?: boolean;
  blanks?: Box[];
  glyph?: Box;
  optionBoxes?: { text: string; box: Box; letter?: Box }[];
  cellBoxes?: Box[][];
}
export type Language = "en" | "es" | "fr" | "pt" | "de" | "vi" | "zh" | "ar";
export const languages: Record<Language, [string, string]> = {
  en: ["English", "eng"],
  es: ["Spanish", "spa"],
  fr: ["French", "fra"],
  pt: ["Portuguese", "por"],
  de: ["German", "deu"],
  vi: ["Vietnamese", "vie"],
  zh: ["Simplified Chinese", "chi_sim"],
  ar: ["Arabic", "ara"],
};
export type Kind =
  | "title"
  | "heading"
  | "instructions"
  | "passage"
  | "multiple-choice"
  | "checkbox"
  | "true-false"
  | "fill-blank"
  | "short-answer"
  | "identity"
  | "figure"
  | "table"
  | "word-bank"
  | "matching";
export interface Block {
  id: string;
  kind: Kind;
  text: string;
  lines: Line[];
  options?: string[];
  image?: string;
  figureText?: string;
  page: number;
  cells?: string[][];
  pairs?: string[];
  key?: Record<string, string[]>;
  hint?: string;
}
export interface Original {
  characters: number;
  headings: number;
  fields: number;
  tagged: boolean | null;
  pages: number;
  source: "pdf" | "image" | "text" | "word";
}
export interface PagePreview {
  page: number;
  image: string;
  width: number;
  height: number;
}
export interface Worksheet {
  id: string;
  name: string;
  language: Language;
  blocks: Block[];
  original: Original;
  answers: Record<string, string>;
  updated: number;
  previews?: PagePreview[];
}
export const isQuestion = (b: Block) =>
  [
    "multiple-choice",
    "checkbox",
    "true-false",
    "fill-blank",
    "short-answer",
    "table",
    "matching",
  ].includes(b.kind);
export function blankParts(text: string): string[] {
  return text.split(/_{2,}/g);
}
export function answerKeys(b: Block): string[] {
  if (b.kind === "fill-blank")
    return blankParts(b.text)
      .slice(1)
      .map((_, i) => `${b.id}-${i}`);
  if (b.kind === "table")
    return (b.cells ?? []).flatMap((r, i) =>
      r.flatMap((c, j) => (i > 0 && !c.trim() ? [`${b.id}-${i}-${j}`] : [])),
    );
  if (b.kind === "matching")
    return (b.pairs ?? []).map((_, i) => `${b.id}-${i}`);
  return isQuestion(b) || ["identity", "figure"].includes(b.kind) ? [b.id] : [];
}
export function answered(b: Block, answers: Record<string, string>) {
  const keys = answerKeys(b);
  return (
    keys.length > 0 &&
    keys.every((k) => answers[k]?.trim() && answers[k] !== "[]")
  );
}
