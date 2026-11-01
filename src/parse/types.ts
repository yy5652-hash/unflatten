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
  crop?: string;
  fontSize?: number;
}
export type Kind =
  | "title"
  | "heading"
  | "instructions"
  | "passage"
  | "multiple-choice"
  | "true-false"
  | "fill-blank"
  | "short-answer"
  | "identity"
  | "figure";
export interface Block {
  id: string;
  kind: Kind;
  text: string;
  lines: Line[];
  options?: string[];
  image?: string;
  page: number;
}
export interface Original {
  characters: number;
  headings: number;
  fields: number;
  tagged: boolean | null;
  pages: number;
  source: "pdf" | "image" | "text";
}
export interface Worksheet {
  id: string;
  name: string;
  language: "en" | "es";
  blocks: Block[];
  original: Original;
  answers: Record<string, string>;
  updated: number;
}
export const isQuestion = (b: Block) =>
  ["multiple-choice", "true-false", "fill-blank", "short-answer"].includes(
    b.kind,
  );
export function blankParts(text: string): string[] {
  return text.split(/_{2,}/g);
}
export function answerKeys(b: Block): string[] {
  if (b.kind === "fill-blank")
    return Array.from(
      { length: blankParts(b.text).length - 1 },
      (_, i) => `${b.id}-${i}`,
    );
  return isQuestion(b) || b.kind === "identity" || b.kind === "figure"
    ? [b.id]
    : [];
}
export function answered(b: Block, answers: Record<string, string>) {
  const keys = answerKeys(b);
  return keys.length > 0 && keys.every((k) => answers[k]?.trim());
}
