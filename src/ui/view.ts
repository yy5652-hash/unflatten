import {
  type Block,
  type Worksheet,
  blankParts,
  isQuestion,
  answerKeys,
  answered,
  languages,
} from "../parse/types";
import { mathSpeech } from "../features/math";
export const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export interface Preferences {
  theme: string;
  size: string;
  spacing: string;
  letters: string;
  width: string;
  focus: boolean;
  ruler: boolean;
  mask: boolean;
  syllables: boolean;
  pos: boolean;
  dictionary: boolean;
  rate: string;
  voice: string;
  singleKeys: boolean;
  font?: boolean;
}
export const defaults: Preferences = {
  theme: "paper",
  size: "100",
  spacing: "1.7",
  letters: "0",
  width: "760",
  focus: false,
  ruler: false,
  mask: false,
  syllables: false,
  pos: false,
  dictionary: false,
  rate: "1",
  voice: "",
  singleKeys: false,
};
export function applyPreferences(p: Preferences) {
  const e = document.documentElement;
  e.dataset.theme = ["light", "system"].includes(p.theme) ? "paper" : p.theme;
  e.style.setProperty(
    "--scale",
    String(Math.max(1, Math.min(2, Number(p.size) / 100))),
  );
  e.style.setProperty("--leading", p.spacing);
  e.style.setProperty("--letter-space", p.letters + "em");
  e.style.setProperty("--column", p.width + "px");
  e.classList.toggle("dictionary-on", p.dictionary);
}
export const words = (text: string) =>
  text
    .split(/(\s+)/)
    .map((w) =>
      /\S/.test(w)
        ? `<span class="word" data-word="${esc(w)}" tabindex="-1">${mathSpeech(w) !== w ? `<span aria-hidden="true">${esc(w)}</span><span class="sr-only">${esc(mathSpeech(w))}</span>` : esc(w)}</span>`
        : w,
    )
    .join("");
const warning = (b: Block) =>
  b.lines
    .filter((l) => l.confidence < 80)
    .map(
      (l) =>
        `<p class="warning">This line may have been misread: ${esc(l.text)} (${Math.round(l.confidence)}% confidence)</p>`,
    )
    .join("");
const mic = (key: string, label = "answer") =>
  `<button class="mic no-print" data-mic="${esc(key)}" aria-label="Voice type: ${esc(label)}" hidden><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15Z" fill="currentColor"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`;
function textInput(key: string, label: string, value: string, inline = false) {
  return `<span class="${inline ? "inline-blank" : "text-field"}"><${inline ? "span" : "label"} ${inline ? "" : `for="answer-${key}"`}>${inline ? "" : esc(label)}</${inline ? "span" : "label"}><input id="answer-${key}" data-answer="${key}" aria-label="${esc(label)}" value="${esc(value)}" autocomplete="off">${mic(key, label)}</span><span class="print-answer">${esc(value) || "________"}</span>`;
}
export function blockView(b: Block, doc: Worksheet): string {
  const value = doc.answers[b.id] || "";
  let body = "";
  const text = words(b.text);
  if (b.kind === "title") body = `<h1>${text}</h1>`;
  if (b.kind === "heading") body = `<h2>${text}</h2>`;
  if (["instructions", "passage"].includes(b.kind))
    body = `<p class="${b.kind}">${text}</p>`;
  if (b.kind === "identity") body = textInput(b.id, b.text, value);
  if (b.kind === "fill-blank") {
    const parts = blankParts(b.text);
    body = `<p class="blank-question">${parts.map((p, i) => words(p) + (i < parts.length - 1 ? textInput(`${b.id}-${i}`, `Blank ${i + 1} of ${parts.length - 1}: ${b.text.replace(/_{2,}/g, "blank")}`, doc.answers[`${b.id}-${i}`] || "", true) : "")).join("")}</p>`;
  }
  if (b.kind === "short-answer")
    body = `<label class="field-label" for="answer-${b.id}">${text}</label><textarea data-answer="${b.id}" id="answer-${b.id}" rows="3">${esc(value)}</textarea>${mic(b.id, b.text)}<p class="print-answer">${esc(value) || "________"}</p>`;
  if (["multiple-choice", "checkbox", "true-false"].includes(b.kind)) {
    const options =
      b.kind === "true-false"
        ? doc.language === "es"
          ? ["Verdadero", "Falso"]
          : ["True", "False"]
        : (b.options ?? []);
    let checked: string[] = [];
    if (b.kind === "checkbox")
      try {
        checked = JSON.parse(value || "[]");
      } catch {}
    body = `<fieldset><legend>${text}</legend>${b.kind === "checkbox" ? '<p class="small">Choose all that apply.</p>' : ""}${options.map((o, i) => `<label class="choice"><input type="${b.kind === "checkbox" ? "checkbox" : "radio"}" name="${b.id}" data-answer="${b.id}" value="${esc(o)}" ${(b.kind === "checkbox" ? checked.includes(o) : value === o) ? "checked" : ""}><span class="option-letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span>${words(o)}</span><span class="selection-check" aria-hidden="true">✓</span></label>`).join("")}</fieldset>`;
  }
  if (b.kind === "word-bank")
    body = `<aside class="word-bank" aria-label="Word bank"><h2>${text}</h2><ul>${(b.options ?? []).map((o) => `<li>${words(o)}</li>`).join("")}</ul></aside>`;
  if (b.kind === "matching")
    body = `<fieldset><legend>${text}</legend>${(b.pairs ?? []).map((q, i) => `<label class="match-row">${words(q)}<select data-answer="${b.id}-${i}" id="answer-${b.id}-${i}"><option value="">Choose a match</option>${(b.options ?? []).map((o) => `<option ${doc.answers[`${b.id}-${i}`] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>${mic(`${b.id}-${i}`, q)}</label>`).join("")}</fieldset>`;
  if (b.kind === "table")
    body = `<table><caption>${text}</caption><thead><tr>${(b.cells?.[0] ?? []).map((c, j) => `<th scope="col">${words(c || `Column ${j + 1}`)}</th>`).join("")}</tr></thead><tbody>${(
      b.cells ?? []
    )
      .slice(1)
      .map(
        (r, i) =>
          `<tr>${r.map((c, j) => `<td>${c ? words(c) : textInput(`${b.id}-${i + 1}-${j}`, `${b.text}, row ${i + 1}${r[0] ? ": " + r[0] : ""}, ${b.cells?.[0][j] || "column " + (j + 1)}`, doc.answers[`${b.id}-${i + 1}-${j}`] || "", true)}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table>`;
  if (b.kind === "figure")
    body = `<figure>${b.image ? `<img id="figure-img-${b.id}" src="${esc(b.image)}" alt="${esc(value || b.text)}" loading="lazy">` : ""}<figcaption id="figure-caption-${b.id}">${esc(value || b.text)}</figcaption></figure>${b.figureText ? `<p>Text found in this figure: ${esc(b.figureText)}</p>` : ""}<label for="answer-${b.id}">Figure description (a helper can add this)</label><textarea id="answer-${b.id}" data-answer="${b.id}">${esc(value)}</textarea>${mic(b.id, b.text)}`;
  return `<section class="block ${isQuestion(b) ? "question" : ""} ${b.kind === "identity" ? "identity" : ""}" data-block="${b.id}" data-kind="${b.kind}" id="block-${b.id}" tabindex="-1">${isQuestion(b) ? `<div class="question-meta"><span>Question ${doc.blocks.filter(isQuestion).findIndex((q) => q.id === b.id) + 1}</span><span>Page ${b.page}</span></div>` : ""}${body}${warning(b)}<button class="block-play no-print" data-read="${b.id}" aria-label="Read from ${esc(b.text.slice(0, 70))}" hidden>▶</button><p class="feedback" id="feedback-${b.id}" role="status"></p><div class="ai-result" id="ai-${b.id}"></div></section>`;
}
export function answerCount(doc: Worksheet) {
  const q = doc.blocks.filter(isQuestion);
  return `${q.filter((b) => answered(b, doc.answers)).length} of ${q.length} answered`;
}
export function outline(doc: Worksheet) {
  let n = 0;
  return `<h2>On this worksheet</h2><p id="answer-count" class="mono">${answerCount(doc)}</p><progress id="answer-progress" max="${Math.max(1, doc.blocks.filter(isQuestion).length)}" value="${doc.blocks.filter((b) => isQuestion(b) && answered(b, doc.answers)).length}" aria-label="Questions answered"></progress><button id="next-unanswered">Next unanswered <span aria-hidden="true">↓</span></button><ol class="outline-list">${doc.blocks
    .filter(
      (b) =>
        isQuestion(b) || ["title", "heading", "word-bank"].includes(b.kind),
    )
    .map(
      (b) =>
        `<li><button data-jump="${b.id}" class="${answered(b, doc.answers) ? "answered" : ""}">${isQuestion(b) ? `<span class="question-chip">${++n}</span>` : ""}<span>${esc(b.text.replace(/_{2,}/g, "blank").slice(0, 75))}</span></button></li>`,
    )
    .join("")}</ol>`;
}
export function comparison(doc: Worksheet) {
  return `<div class="comparison"><span>Before: <b data-stat="characters">${doc.original.characters}</b> readable characters, ${doc.original.fields} fields.</span><span>Now: <b data-stat="questions">${doc.blocks.filter(isQuestion).length}</b> questions, <b data-stat="fields">${doc.blocks.reduce((n, b) => n + answerKeys(b).length, 0)}</b> fields.</span></div>`;
}
export function originalView(doc: Worksheet) {
  return `<h2>Original</h2><p class="small">Focus a question to locate its source. Select a highlighted line to return to the worksheet.</p>${doc.previews?.length ? doc.previews.map((p) => `<figure class="original-page"><img src="${esc(p.image)}" alt="Original worksheet, page ${p.page}"><div class="source-overlays">${doc.blocks.flatMap((b) => b.lines.filter((l) => l.page === p.page).map((l, i) => `<button class="source-line" data-source="${b.id}" aria-label="Go to ${esc(b.text.slice(0, 80))}, source line ${i + 1}" style="left:${Math.max(0, (l.x / p.width) * 100)}%;top:${Math.max(0, (l.y / p.height) * 100)}%;width:${Math.min(100, (l.width / p.width) * 100)}%;height:${Math.max(1, (l.height / p.height) * 100)}%"></button>`)).join("")}</div><figcaption>Page ${p.page}</figcaption></figure>`).join("") : "<p>No source page image is stored for this worksheet. Text and Word input have no page preview; older saved scans can be reconverted to add one.</p>"}`;
}
const toggle = (key: keyof Preferences, name: string, p: Preferences) =>
  `<label class="toggle"><input type="checkbox" id="${key === "focus" ? "focus-mode" : key}" data-pref="${key}" ${p[key] ? "checked" : ""}>${name}</label>`;
export function tools(p: Preferences) {
  return `<h2>Reading tools</h2><fieldset><legend>Page colour</legend><div class="theme-tiles">${[
    ["paper", "Paper"],
    ["dark", "Dark"],
    ["contrast", "High contrast"],
    ["cream", "Cream"],
    ["blue", "Blue tint"],
    ["rose", "Rose tint"],
  ]
    .map(
      ([v, n]) =>
        `<button data-theme-choice="${v}" class="theme-tile theme-${v}" aria-pressed="${p.theme === v}"><span aria-hidden="true">Aa</span>${n}</button>`,
    )
    .join(
      "",
    )}</div></fieldset><div class="stepper"><span>Text size</span><button id="size-down" aria-label="Decrease text size">−</button><output id="size-value">${p.size}%</output><button id="size-up" aria-label="Increase text size">+</button></div>${[
    [
      "spacing",
      "Line spacing",
      [
        ["1.5", "Standard"],
        ["1.7", "Roomy"],
        ["2.1", "Extra"],
      ],
    ],
    [
      "letters",
      "Letter spacing",
      [
        ["0", "Standard"],
        ["0.04", "Wide"],
        ["0.08", "Wider"],
      ],
    ],
    [
      "width",
      "Column width",
      [
        ["560", "Narrow"],
        ["660", "Medium"],
        ["760", "Wide"],
      ],
    ],
  ]
    .map(
      ([key, label, opts]) =>
        `<fieldset><legend>${label}</legend><div class="segments">${(opts as string[][]).map(([v, t]) => `<button data-setting="${key}" data-value="${v}" aria-pressed="${p[key as keyof Preferences] === v}">${t}</button>`).join("")}</div></fieldset>`,
    )
    .join(
      "",
    )}<h3>Focus & language</h3>${toggle("focus", "One question at a time", p)}${toggle("ruler", "Reading ruler", p)}${toggle("mask", "Screen mask", p)}<p class="small">The ruler follows your pointer or focus. Use its arrow buttons to move it with a keyboard.</p><div class="segments"><button id="ruler-up">Ruler up</button><button id="ruler-down">Ruler down</button></div>${toggle("syllables", "Syllable view (English / Spanish)", p)}<p class="small">Uses hyphenation patterns as reading cues; some word divisions differ from spoken syllables.</p>${toggle("pos", "Parts of speech (English)", p)}<p class="pos-legend"><span class="pos-noun">Noun · underline</span> <span class="pos-verb">Verb · double</span> <span class="pos-adjective">Adjective · dotted</span> <span class="pos-adverb">Adverb · dashed</span></p>${toggle("dictionary", "Keyboard word lookup", p)}<p class="small">Select or double-click a word. With word lookup on, Tab to a word and press Enter.</p><label>Dictionary word<input id="dictionary-word" autocomplete="off"></label><button id="define-word">Look up word</button><div id="ai-tools"></div>${toggle("singleKeys", "Enable single-letter shortcuts", p)}<button id="help">Keyboard shortcuts</button>`;
}
export function handIn(doc: Worksheet) {
  return `<h2>Take your work with you.</h2><fieldset><legend>Include answers</legend><label><input type="radio" name="export-mode" value="answers" checked> With answers</label><label><input type="radio" name="export-mode" value="blank"> Blank copy</label></fieldset><div class="export-grid"><button id="download-html">Download accessible .html</button><button id="download-docx">Word .docx</button><button id="download-epub">EPUB 3</button><button id="download-brf">Braille .brf</button><button id="download-text">Download .txt</button><button id="print">Print / Save as PDF</button><button id="copy">Copy answers</button><button id="web-share" hidden>Share file</button><button id="email">Email my answers</button></div><p class="small">Braille is uncontracted UEB Grade 1 (English literary subset), 40 cells × 25 lines. Review before embossing. Unsupported symbols become question marks.</p><button id="preview-braille">Preview braille</button><pre id="braille-preview" hidden aria-label="Unicode braille preview"></pre><hr><h3>Share with a class</h3><p>The link opens a blank worksheet. Its answer key travels with it: this is not exam-secure. Figure images and original pages stay in the HTML file, not the link.</p><button id="share-students" class="primary">Share with students</button><div id="share-result"></div><hr><button id="delete-sheet" class="danger">Delete this worksheet from this device</button>`;
}
export function resultView(doc: Worksheet, p: Preferences) {
  return `<div class="workspace-top no-print"><button id="new-sheet" aria-label="Open another worksheet">← Worksheets</button><label class="title-edit"><span class="sr-only">Worksheet title</span><input id="worksheet-title" value="${esc(doc.name)}"></label><span id="save-status" class="small" role="status">Saved on this device</span><div class="workspace-actions"><button data-panel="original" id="toggle-original" aria-expanded="false">Original</button><button data-panel="tools" id="toggle-tools" aria-expanded="false">Tools</button><button id="fix-mode">Fix</button><button id="check-answers">Check answers</button><button data-panel="handin" id="toggle-handin" class="primary" aria-expanded="false">Hand in</button></div></div><div class="workspace" data-panel-open="none"><aside class="outline no-print" aria-label="Worksheet outline">${outline(doc)}</aside><div class="paper-scroll"><div class="mobile-progress no-print"><span id="mobile-answer-count" class="mono">${answerCount(doc)}</span><button id="mobile-next-unanswered">Next unanswered</button></div>${comparison(doc)}<article id="worksheet" class="worksheet" lang="${doc.language}" dir="${doc.language === "ar" ? "rtl" : "ltr"}" aria-label="Converted worksheet">${doc.blocks.some((b) => b.kind === "title") ? "" : `<h1>${esc(doc.name)}</h1>`}${doc.blocks.map((b) => blockView(b, doc)).join("")}</article><div id="question-nav" class="no-print" ${p.focus ? "" : "hidden"}><button id="previous-question">Previous question</button><span id="question-position"></span><button id="next-question">Next question</button></div><p id="score" role="status"></p><button id="retry" hidden>Retry incorrect answers</button></div><aside class="right-panel no-print" id="right-panel" aria-label="Worksheet panel" hidden><button id="close-panel" aria-label="Close panel">Close ×</button><section id="panel-original" hidden>${originalView(doc)}</section><section id="panel-tools" hidden>${tools(p)}</section><section id="panel-handin" hidden>${handIn(doc)}</section></aside></div><p id="action-status" class="action-status no-print" role="status" aria-live="polite"></p><nav class="mobile-tabs no-print" aria-label="Workspace views"><button data-panel="none" aria-current="page">Worksheet</button><button data-panel="original">Original</button><button data-panel="tools">Tools</button><button data-panel="handin">Hand in</button></nav><div id="player" class="player no-print" hidden role="region" aria-label="Reading player"><button id="player-prev" aria-label="Previous block">|◀</button><button id="player-toggle" class="primary" aria-label="Play worksheet">▶</button><button id="player-next" aria-label="Next block">▶|</button><div id="player-text" aria-hidden="true">Press play to hear the whole worksheet.</div><label>Speed<select id="speech-rate">${["0.5", "0.75", "1", "1.25", "1.5", "1.75", "2"].map((v) => `<option value="${v}" ${p.rate === v ? "selected" : ""}>${v}×</option>`).join("")}</select></label><label>Voice<select id="speech-voice"><option>Loading local voices</option></select></label></div><div id="reading-ruler" class="reading-ruler no-print" aria-hidden="true" hidden></div><dialog id="word-dialog" aria-labelledby="word-title"><h2 id="word-title">Dictionary</h2><p id="definition"></p><button id="speak-word">Speak word</button><button data-close-dialog>Close dictionary</button></dialog><dialog id="help-dialog" aria-labelledby="help-title"><h2 id="help-title">Keyboard shortcuts</h2><dl><dt>Alt + N / P</dt><dd>Next / previous question</dd><dt>Alt + R</dt><dd>Play / pause</dd><dt>Alt + U</dt><dd>Next unanswered</dd><dt>Alt + O</dt><dd>Toggle Original</dd><dt>Ctrl / Cmd + Z · Shift + Z</dt><dd>Undo / redo structural edits in Fix mode</dd></dl><p>Single letters work only after enabling them in Tools, outside input fields. Escape closes dialogs.</p><button data-close-dialog>Close shortcuts</button></dialog><dialog id="voice-dialog" aria-labelledby="voice-title"><h2 id="voice-title">Voice typing</h2><p>Your browser may send your voice to its speech service. Nothing goes to Unflatten.</p><p>Where supported, we request local processing. Your browser will ask for microphone permission.</p><button id="voice-consent" class="primary">Continue with voice typing</button><button data-close-dialog>Cancel</button></dialog><button id="stop-mic" class="no-print" hidden>Stop microphone</button>`;
}
const kinds: Block["kind"][] = [
  "title",
  "heading",
  "instructions",
  "passage",
  "multiple-choice",
  "checkbox",
  "true-false",
  "fill-blank",
  "short-answer",
  "identity",
  "figure",
  "table",
  "word-bank",
  "matching",
];
export function fixView(doc: Worksheet, undo = false, redo = false) {
  return `<section class="fix-page"><div class="fix-heading"><p class="eyebrow">TEACHER WORKSPACE / FIX</p><h1>Fix anything it got wrong.</h1><p>Low-confidence lines come first. Edits save on this device. The answer key travels with shared copies and is not exam-secure.</p><div class="actions"><button id="done-fixing" class="primary">Done fixing</button><button id="undo" ${undo ? "" : "disabled"}>Undo</button><button id="redo" ${redo ? "" : "disabled"}>Redo</button><button id="add-block">Add a block</button></div></div><p id="fix-status" role="status"></p>${[
    ...doc.blocks,
  ]
    .sort(
      (a, b) =>
        Number(b.lines.some((l) => l.confidence < 80)) -
        Number(a.lines.some((l) => l.confidence < 80)),
    )
    .map(
      (b) =>
        `<section class="fix-card" id="fix-${b.id}" data-fix="${b.id}"><h2>Block ${doc.blocks.indexOf(b) + 1} · Page ${b.page}</h2>${warning(b)}${b.lines
          .filter((l) => l.crop)
          .map(
            (l) =>
              `<img src="${esc(l.crop)}" alt="Original line: ${esc(l.text)}" loading="lazy">`,
          )
          .join(
            "",
          )}<label>Block text<textarea data-edit="text" rows="3">${esc(b.text)}</textarea></label><label>Block kind<select data-edit="kind">${kinds.map((k) => `<option value="${k}" ${k === b.kind ? "selected" : ""}>${k.replace(/-/g, " ")}</option>`).join("")}</select></label><label>Choices (one per line)<textarea data-edit="options" rows="2">${esc((b.options ?? []).join("\n"))}</textarea></label>${b.cells ? `<label>Table cells (one row per line, separate cells with |)<textarea data-edit="cells">${esc(b.cells.map((r) => r.join(" | ")).join("\n"))}</textarea></label>` : ""}${b.pairs ? `<label>Matching prompts (one per line)<textarea data-edit="pairs">${esc(b.pairs.join("\n"))}</textarea></label>` : ""}${
          isQuestion(b)
            ? `<fieldset><legend>Answer key</legend>${
                ["multiple-choice", "checkbox", "true-false"].includes(b.kind)
                  ? (b.kind === "true-false"
                      ? doc.language === "es"
                        ? ["Verdadero", "Falso"]
                        : ["True", "False"]
                      : (b.options ?? [])
                    )
                      .map(
                        (o) =>
                          `<label class="choice"><input type="${b.kind === "checkbox" ? "checkbox" : "radio"}" name="key-${b.id}" data-key-option value="${esc(o)}" ${b.key?.[b.id]?.includes(o) ? "checked" : ""}>${esc(o)}</label>`,
                      )
                      .join("")
                  : `${answerKeys(b)
                      .map(
                        (k, i) =>
                          `<label>Accepted answers ${i + 1} (separate alternatives with |)<input data-key="${k}" value="${esc(b.key?.[k]?.join(" | ") || "")}"></label>`,
                      )
                      .join("")}`
              }<label>Teacher hint (optional)<input data-edit="hint" value="${esc(b.hint || "")}"></label></fieldset>`
            : ""
        }<div class="actions"><button data-fix-action="save" class="primary">Save block ${doc.blocks.indexOf(b) + 1}</button><button data-fix-action="up" ${doc.blocks.indexOf(b) === 0 ? "disabled" : ""}>Move up</button><button data-fix-action="down" ${doc.blocks.indexOf(b) === doc.blocks.length - 1 ? "disabled" : ""}>Move down</button><button data-fix-action="split">Split at cursor</button><button data-fix-action="merge" ${doc.blocks.indexOf(b) === doc.blocks.length - 1 ? "disabled" : ""}>Merge with next original block</button><button data-fix-action="delete" class="danger">Delete block ${doc.blocks.indexOf(b) + 1}</button></div></section>`,
    )
    .join("")}</section>`;
}
export { plainDocument as plainAnswers } from "../output/content";
