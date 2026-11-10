import { answerKeys, type Worksheet, type Block } from "../parse/types";
export const xml = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function blockText(b: Block, doc: Worksheet, withAnswers: boolean) {
  let i = 0;
  const text = b.text.replace(
    /_{2,}/g,
    () => (withAnswers && doc.answers[`${b.id}-${i++}`]) || "________",
  );
  const extras =
    b.kind === "fill-blank"
      ? []
      : answerKeys(b).map((k) =>
          withAnswers ? doc.answers[k] || "________" : "________",
        );
  return [
    text,
    ...(b.options ?? []).map((v, i) => `${String.fromCharCode(65 + i)}. ${v}`),
    ...(b.cells ?? []).map((r, i) =>
      r
        .map(
          (c, j) =>
            c ||
            (withAnswers ? doc.answers[`${b.id}-${i}-${j}`] : "") ||
            "________",
        )
        .join(" | "),
    ),
    ...(b.pairs ?? []).map(
      (p, i) =>
        `${p}: ${withAnswers ? doc.answers[`${b.id}-${i}`] || "________" : "________"}`,
    ),
    ...extras,
    b.figureDescription || "",
    b.figureText ? `Text found in this figure: ${b.figureText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
export const plainDocument = (doc: Worksheet, withAnswers = true) =>
  doc.blocks.map((b) => blockText(b, doc, withAnswers)).join("\n\n");
export function semanticHTML(doc: Worksheet, withAnswers: boolean) {
  return doc.blocks
    .map((b) => {
      const t = xml(b.text),
        id = xml(b.id);
      if (b.kind === "title") return `<h1 id="${id}">${t}</h1>`;
      if (b.kind === "heading") return `<h2 id="${id}">${t}</h2>`;
      if (b.kind === "table")
        return `<table id="${id}"><caption>${t}</caption>${(b.cells ?? []).map((r, i) => `<tr>${r.map((c, j) => `<${i === 0 ? 'th scope="col"' : "td"}>${xml(c || (withAnswers ? doc.answers[`${b.id}-${i}-${j}`] : "") || "________")}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</table>`;
      return `<section id="${id}"><p>${xml(b.text.replace(/_{2,}/g, () => " blank "))}</p>${b.options ? `<ul>${b.options.map((o) => `<li>${xml(o)}</li>`).join("")}</ul>` : ""}${b.pairs ? `<ul>${b.pairs.map((p, i) => `<li>${xml(p)}: ${xml(withAnswers ? doc.answers[`${b.id}-${i}`] || "________" : "________")}</li>`).join("")}</ul>` : ""}${answerKeys(
        b,
      )
        .map(
          (k, i) =>
            `<p>Answer ${i + 1}: ${xml(withAnswers ? doc.answers[k] || "________" : "________")}</p>`,
        )
        .join(
          "",
        )}${b.kind === "figure" ? `<p>${xml(b.figureDescription || b.figureText || "Figure needs a helper description.")}</p>` : ""}</section>`;
    })
    .join("\n");
}
