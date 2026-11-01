import {
  type Block,
  type Worksheet,
  blankParts,
  isQuestion,
  answerKeys,
  answered,
} from "../parse/types";
export const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export interface Preferences {
  theme: "system" | "light" | "dark" | "contrast";
  size: string;
  spacing: string;
  font: boolean;
  focus: boolean;
}
export const defaults: Preferences = {
  theme: "system",
  size: "100",
  spacing: "1.7",
  font: false,
  focus: false,
};
export function applyPreferences(p: Preferences) {
  document.documentElement.dataset.theme = p.theme;
  document.documentElement.style.setProperty(
    "--scale",
    String(Number(p.size) / 100),
  );
  document.documentElement.style.setProperty("--leading", p.spacing);
  document.documentElement.classList.toggle("hyperlegible", p.font);
}
export function tools(p: Preferences) {
  return `<details class="tools no-print"><summary>Reading tools <span class="muted">Make this page yours</span></summary><div class="tool-grid"><label>Theme<select id="theme">${["system", "light", "dark", "contrast"].map((t) => `<option value="${t}" ${t === p.theme ? "selected" : ""}>${t === "contrast" ? "High contrast" : t[0].toUpperCase() + t.slice(1)}</option>`).join("")}</select></label><label>Text size<select id="size">${["100", "125", "150", "200"].map((t) => `<option ${t === p.size ? "selected" : ""} value="${t}">${t}%</option>`).join("")}</select></label><label>Line spacing<select id="spacing">${[
    ["1.5", "Comfortable"],
    ["1.7", "Spacious"],
    ["2.1", "Extra spacious"],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${v === p.spacing ? "selected" : ""}>${t}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="check"><input id="font" type="checkbox" ${p.font ? "checked" : ""}> Atkinson Hyperlegible</label><label class="check"><input id="focus-mode" type="checkbox" ${p.focus ? "checked" : ""}> One question at a time</label></div></details>`;
}
const warning = (b: Block) =>
  b.lines
    .filter((l) => l.confidence < 80)
    .map(
      (l) =>
        `<p class="warning"><strong>This line may have been misread</strong><span>${esc(l.text)} <span class="confidence">(${Math.round(l.confidence)}% confidence)</span></span></p>`,
    )
    .join("");
function textInput(key: string, label: string, value: string, inline = false) {
  if (inline)
    return `<span class="inline-blank"><input type="text" aria-label="${esc(label)}" data-answer="${esc(key)}" id="answer-${esc(key)}" value="${esc(value)}" autocomplete="off"></span><span class="print-answer">${esc(value) || "________________"}</span>`;
  return `<label class="field-label">${esc(label)}<input type="text" data-answer="${esc(key)}" id="answer-${esc(key)}" value="${esc(value)}" autocomplete="off"></label><span class="print-answer">${esc(value) || "________________"}</span>`;
}
export function blockView(b: Block, doc: Worksheet): string {
  const value = doc.answers[b.id] || "",
    warn = warning(b);
  let body = "";
  if (b.kind === "title") body = `<h1>${esc(b.text)}</h1>`;
  if (b.kind === "heading") body = `<h2>${esc(b.text)}</h2>`;
  if (b.kind === "instructions" || b.kind === "passage")
    body = `<p class="${b.kind}">${esc(b.text)}</p>`;
  if (b.kind === "identity") body = textInput(b.id, b.text, value);
  if (b.kind === "fill-blank") {
    const parts = blankParts(b.text);
    body = `<p class="blank-question">${parts.map((p, i) => esc(p) + (i < parts.length - 1 ? textInput(`${b.id}-${i}`, `Blank ${i + 1} of ${parts.length - 1}: ${b.text.replace(/_{2,}/g, "blank")}`, doc.answers[`${b.id}-${i}`] || "", true) : "")).join("")}</p>`;
  }
  if (b.kind === "short-answer")
    body = `<label class="field-label" for="answer-${b.id}">${esc(b.text)}</label><textarea data-answer="${b.id}" id="answer-${b.id}" rows="3">${esc(value)}</textarea><p class="print-answer">${esc(value) || "Not answered"}</p>`;
  if (b.kind === "multiple-choice" || b.kind === "true-false") {
    const options =
      b.kind === "true-false"
        ? doc.language === "es"
          ? ["Verdadero", "Falso"]
          : ["True", "False"]
        : b.options || [];
    body = `<fieldset><legend>${esc(b.text)}</legend>${options.map((o, i) => `<label class="choice"><input type="radio" name="${b.id}" data-answer="${b.id}" value="${esc(o)}" ${value === o ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}</fieldset><p class="print-answer">Answer: ${esc(value) || "Not answered"}</p>`;
  }
  if (b.kind === "figure")
    body = `<figure>${b.image ? `<img id="figure-img-${b.id}" src="${esc(b.image)}" alt="${esc(value || b.text)}" loading="lazy">` : ""}<figcaption id="figure-caption-${b.id}">${esc(value || b.text)}${b.image ? "<small>From the original page</small>" : ""}</figcaption></figure><label class="field-label" for="answer-${b.id}">Figure description (a helper can add this)</label><textarea id="answer-${b.id}" data-answer="${b.id}" rows="2">${esc(value)}</textarea><p class="print-answer">${esc(value) || esc(b.text)}</p>`;
  return `<section class="block ${isQuestion(b) ? "question" : ""} ${b.kind === "identity" ? "identity" : ""}" data-block="${b.id}" data-kind="${b.kind}" id="block-${b.id}" tabindex="-1">${isQuestion(b) ? `<div class="question-meta">Question ${doc.blocks.filter(isQuestion).findIndex((x) => x.id === b.id) + 1}<span>Page ${b.page}</span></div>` : ""}${body}${warn}${!["identity", "title", "heading"].includes(b.kind) ? `<button class="read-button quiet no-print" data-read="${b.id}" hidden aria-label="Read aloud: ${esc(b.text.replace(/_{2,}/g, "blank").slice(0, 65))}">Read aloud</button>` : ""}</section>`;
}
export function comparison(doc: Worksheet) {
  const o = doc.original;
  const count = doc.blocks.reduce((n, b) => n + answerKeys(b).length, 0);
  return `<details class="comparison no-print" open><summary>Original vs now</summary><p class="muted small">Measured from this ${o.source === "pdf" ? "PDF" : o.source === "image" ? "image" : "text"} and the converted worksheet. Text characters are a proxy for screen-reader reach, not a full accessibility audit.</p><div class="compare-grid"><section aria-label="Original"><h2 class="panel-heading">Original</h2><dl><div><dt>Reachable characters</dt><dd data-stat="characters">${o.characters.toLocaleString("en")}</dd></div><div><dt>Headings</dt><dd>${o.headings}</dd></div><div><dt>Form fields</dt><dd>${o.fields}</dd></div><div><dt>Tagged PDF</dt><dd>${o.tagged === null ? "Not applicable" : o.tagged ? "Yes" : "No"}</dd></div></dl></section><section aria-label="Now"><h2 class="panel-heading">Now, yours to use</h2><dl><div><dt>Headings</dt><dd>${Math.max(1, doc.blocks.filter((b) => b.kind === "heading" || b.kind === "title").length)}</dd></div><div><dt>Questions</dt><dd data-stat="questions">${doc.blocks.filter(isQuestion).length}</dd></div><div><dt>Form fields</dt><dd data-stat="fields">${count}</dd></div><div><dt>Reading order</dt><dd>Structured</dd></div></dl></section></div></details>`;
}
export function resultView(doc: Worksheet, p: Preferences) {
  return `<div class="result-top no-print"><div><p class="eyebrow">YOUR WORKSPACE</p><p class="muted">${doc.original.pages} ${doc.original.pages === 1 ? "page" : "pages"} converted · Stored on this device</p></div><button id="new-sheet" class="quiet">Open another worksheet</button></div>${tools(p)}<div class="workspace"><div><div class="answer-toolbar no-print"><span id="answer-count" role="status" aria-live="polite">${answerCount(doc)}</span><button id="next-unanswered" class="quiet">Next unanswered</button></div><article id="worksheet" class="worksheet" lang="${doc.language}" aria-label="Converted worksheet">${doc.blocks.some((b) => b.kind === "title") ? "" : `<h1>${esc(doc.name)}</h1>`}${doc.blocks.map((b) => blockView(b, doc)).join("")}</article><div id="question-nav" class="actions no-print" ${p.focus ? "" : "hidden"}><button id="previous-question">Previous question</button><span id="question-position"></span><button id="next-question">Next question</button></div></div><aside class="sidebar no-print" aria-label="Worksheet actions">${comparison(doc)}<section class="side-card"><p class="eyebrow">REVIEW</p><h2>Make it accurate</h2><p>Check the reading order and any uncertain lines before you hand it in.</p><button id="fix-mode">Fix this worksheet</button></section><section class="side-card"><p class="eyebrow">HAND IN</p><h2>Take your work with you</h2><div class="stack"><button id="print">Print / Save as PDF</button><button id="copy">Copy answers</button><button id="download-text">Download .txt</button><button id="download-html">Download accessible .html</button></div><p class="small muted">The HTML file includes your answers and reading tools. Share a blank copy before filling it in.</p></section><button id="delete-sheet" class="danger">Delete this worksheet from this device</button></aside></div><p id="action-status" class="notice no-print" role="status" aria-live="polite"></p><p id="save-status" class="sr-only" role="status"></p>`;
}
export function answerCount(doc: Worksheet) {
  const questions = doc.blocks.filter(isQuestion);
  return `${questions.filter((b) => answered(b, doc.answers)).length} of ${questions.length} answered`;
}
const kinds: Block["kind"][] = [
  "title",
  "heading",
  "instructions",
  "passage",
  "multiple-choice",
  "true-false",
  "fill-blank",
  "short-answer",
  "identity",
  "figure",
];
export function fixView(doc: Worksheet) {
  const sorted = [...doc.blocks].sort(
    (a, b) =>
      Number(b.lines.some((l) => l.confidence < 80)) -
      Number(a.lines.some((l) => l.confidence < 80)),
  );
  return `<div class="page-heading"><p class="eyebrow">REVIEW & REPAIR</p><h1>Give the worksheet a second look.</h1><p>Uncertain lines come first. Edits save on this device. Changing a question clears its answers.</p><button id="done-fixing" class="primary">Done fixing</button></div><p id="fix-status" role="status"></p><div class="fix-list">${sorted
    .map(
      (b) =>
        `<section class="fix-card" id="fix-${b.id}" data-fix="${b.id}"><h2>Block ${doc.blocks.indexOf(b) + 1} · Page ${b.page}</h2>${warning(b)}${b.lines
          .filter((l) => l.crop)
          .map(
            (l) =>
              `<figure><img src="${esc(l.crop)}" alt="Original line. OCR or extracted text: ${esc(l.text)}" loading="lazy"></figure>`,
          )
          .join(
            "",
          )}<label>Block text<textarea data-edit="text" rows="3">${esc(b.text)}</textarea></label><label>Block kind<select data-edit="kind">${kinds.map((k) => `<option value="${k}" ${k === b.kind ? "selected" : ""}>${k.replace(/-/g, " ")}</option>`).join("")}</select></label><label>Choices (one per line; for multiple choice)<textarea data-edit="options" rows="2">${esc((b.options || []).join("\n"))}</textarea></label><div class="actions"><button data-fix-action="save">Save block ${doc.blocks.indexOf(b) + 1}</button><button data-fix-action="merge" ${doc.blocks.indexOf(b) === doc.blocks.length - 1 ? "disabled" : ""}>Merge with next original block</button><button data-fix-action="delete" class="danger">Delete block ${doc.blocks.indexOf(b) + 1}</button></div></section>`,
    )
    .join("")}</div>`;
}
export function plainAnswers(doc: Worksheet) {
  return [
    doc.name,
    ...doc.blocks
      .filter((b) => answerKeys(b).length)
      .map(
        (b) =>
          `${b.text}\n${answerKeys(b)
            .map(
              (k, i) =>
                `${b.kind === "fill-blank" ? `Blank ${i + 1}: ` : ""}${doc.answers[k] || "(not answered)"}`,
            )
            .join("\n")}`,
      ),
  ].join("\n\n");
}
