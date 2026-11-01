import {
  answerKeys,
  isQuestion,
  type Worksheet,
  type Block,
} from "../parse/types";
const normalize = (s: string) =>
  s.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
export function checkBlock(
  b: Block,
  answers: Record<string, string>,
): "correct" | "retry" | "unkeyed" {
  const keys = answerKeys(b);
  if (!keys.length || keys.some((k) => !b.key?.[k]?.length)) return "unkeyed";
  return keys.every((k) => {
    if (b.kind === "checkbox") {
      try {
        const selected = JSON.parse(answers[k] || "[]") as string[];
        return (
          JSON.stringify(selected.map(normalize).sort()) ===
          JSON.stringify(b.key![k].map(normalize).sort())
        );
      } catch {
        return false;
      }
    }
    return b.key![k].some((a) => normalize(a) === normalize(answers[k] || ""));
  })
    ? "correct"
    : "retry";
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
