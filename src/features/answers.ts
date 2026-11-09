import {
  answerKeys,
  isQuestion,
  type Worksheet,
  type Block,
} from "../parse/types";
const normalize = (s: string) =>
  s.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
export function checkField(b: Block, key: string, answers: Record<string, string>) {
  if (!b.key?.[key]?.length) return "unkeyed";
  if (b.kind === "checkbox") {
    try {
      const selected: unknown = JSON.parse(answers[key] || "[]");
      return Array.isArray(selected) && selected.every((v) => typeof v === "string") &&
        JSON.stringify(selected.map(normalize).sort()) ===
        JSON.stringify(b.key[key].map(normalize).sort()) ? "correct" : "retry";
    } catch {
      return "retry";
    }
  }
  return b.key[key].some((a) => normalize(a) === normalize(answers[key] || ""))
    ? "correct" : "retry";
}
export function checkBlock(
  b: Block,
  answers: Record<string, string>,
): "correct" | "retry" | "unkeyed" {
  const keys = answerKeys(b);
  if (!keys.length || keys.some((k) => !b.key?.[k]?.length)) return "unkeyed";
  return keys.every((k) => checkField(b, k, answers) === "correct")
    ? "correct"
    : "retry";
}
// A retry is a navigation plan; it never changes a student's answers.
export function retryAnswers(doc: Worksheet) {
  const keys = doc.blocks.filter((b) => isQuestion(b) && checkBlock(b, doc.answers) === "retry")
    .flatMap((b) => answerKeys(b).filter((k) => checkField(b, k, doc.answers) === "retry"));
  return {
    keys,
    announcement: keys.length === 1
      ? "One part of this question needs another look. Your answers have been kept."
      : `${keys.length} parts need another look. Your answers have been kept.`,
  };
}
export function checkAnswers(doc: Worksheet) {
  const results = doc.blocks
    .filter(isQuestion)
    .map((b) => ({ id: b.id, result: checkBlock(b, doc.answers) }));
  return {
    results,
    correct: results.filter((r) => r.result === "correct").length,
    total: results.filter((r) => r.result !== "unkeyed").length,
  };
}
