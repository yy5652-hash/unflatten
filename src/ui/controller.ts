import {
  resultView,
  reviewCount,
  fixView,
  applyPreferences,
  tools,
  outline,
  esc,
  plainAnswers,
  type Preferences,
} from "./view";
import {
  type Worksheet,
  type Block,
  isQuestion,
  answerKeys,
  answered,
  languages,
} from "../parse/types";
import { correctLine } from "../features/review";
import { History } from "../features/history";
import { checkAnswers } from "../features/answers";
import { Reader, recognitionAvailable, dictate } from "../features/speech";
import { detectAI, runAI } from "../features/ai";
import { local } from "../storage";
export function download(
  name: string,
  data: string | Blob | Uint8Array,
  type = "application/octet-stream",
) {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([typeof data === "string" ? data : new Uint8Array(data)], {
          type,
        });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
interface Actions {
  save: (d: Worksheet) => unknown;
  preferences: (p: Preferences) => void;
  home?: () => void;
  remove?: () => Promise<void>;
  html?: (doc: Worksheet) => Promise<void>;
  standalone?: boolean;
}
export function mountWorksheet(
  root: HTMLElement,
  doc: Worksheet,
  p: Preferences,
  actions: Actions,
) {
  let disposed = false,
    fix = false,
    index = 0,
    panel = "none",
    active = doc.blocks[0]?.id || "",
    saveSerial = 0,
    decoration = 0,
    rulerY = 200,
    pendingMic = "",
    lastAnswer = "",
    queueIndex = 0,
    editGroup: HTMLElement | undefined,
    queueBaseline: { input: HTMLElement; block: Block } | undefined,
    selectionTimer: ReturnType<typeof setTimeout> | undefined,
    stopMic: (() => void) | undefined;
  const history = new History(doc);
  let reader: Reader | undefined;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector);
  const status = (text: string) => {
    const el = fix ? $("#fix-status") : $("#action-status");
    if (el && el.textContent !== text) el.textContent = text;
  };
  const save = () => {
    doc.updated = Date.now();
    const serial = ++saveSerial;
    $("#save-status")?.setAttribute("data-pending", "true");
    Promise.resolve(actions.save(doc))
      .then(() => {
        if (!disposed && serial === saveSerial) {
          const el = $("#save-status");
          if (el) {
            if (el.textContent !== "Saved on this device")
              el.textContent = "Saved on this device";
            el.setAttribute("data-pending", "false");
          }
        }
      })
      .catch(() =>
        status(
          "Storage unavailable or full. Download an HTML copy to keep your changes.",
        ),
      );
  };
  const updateProgress = () => {
    const count = $("#answer-count");
    if (count)
      count.textContent = `${doc.blocks.filter((b) => isQuestion(b) && answered(b, doc.answers)).length} of ${doc.blocks.filter(isQuestion).length} answered`;
    const mobileCount = $("#mobile-answer-count");
    if (mobileCount && count) mobileCount.textContent = count.textContent;
    const progress = $<HTMLProgressElement>("#answer-progress");
    if (progress)
      progress.value = doc.blocks.filter(
        (b) => isQuestion(b) && answered(b, doc.answers),
      ).length;
    root.querySelectorAll<HTMLElement>("[data-jump]").forEach((el) =>
      el.classList.toggle(
        "answered",
        answered(
          doc.blocks.find((b) => b.id === el.dataset.jump)!,
          doc.answers,
        ),
      ),
    );
  };
  const ruler = () => {
    const el = $("#reading-ruler");
    if (!el) return;
    el.hidden = !p.ruler && !p.mask;
    el.classList.toggle("masked", p.mask);
    el.style.top = `${Math.max(0, Math.min(innerHeight - 90, rulerY))}px`;
  };
  const focusMode = () => {
    const qs = doc.blocks.filter(isQuestion);
    index = Math.max(0, Math.min(index, qs.length - 1));
    for (const b of qs) {
      const node = $(`#block-${b.id}`);
      if (node) node.hidden = p.focus && b !== qs[index];
    }
    const nav = $("#question-nav");
    if (nav) nav.hidden = !p.focus;
    const pos = $("#question-position");
    if (pos) pos.textContent = `${qs.length ? index + 1 : 0} of ${qs.length}`;
    const prev = $<HTMLButtonElement>("#previous-question"),
      next = $<HTMLButtonElement>("#next-question");
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index >= qs.length - 1;
  };
  const highlight = (id: string) => {
    active = id;
    root
      .querySelectorAll<HTMLElement>("[data-block]")
      .forEach((el) =>
        el.classList.toggle("active-block", el.dataset.block === id),
      );
    root.querySelectorAll<HTMLElement>("[data-source]").forEach((el) => {
      el.classList.toggle("linked", el.dataset.source === id);
      el.setAttribute("aria-pressed", String(el.dataset.source === id));
    });
    root
      .querySelectorAll<HTMLElement>("[data-jump]")
      .forEach((el) =>
        el.setAttribute("aria-current", String(el.dataset.jump === id)),
      );
  };
  const setPanel = (name: string) => {
    const previous = panel;
    panel = name;
    const right = $("#right-panel");
    if (!right) return;
    right.hidden = name === "none";
    $(".workspace")!.dataset.panelOpen = name;
    for (const n of ["original", "tools", "handin"])
      $(`#panel-${n}`)!.hidden = n !== name;
    root
      .querySelectorAll<HTMLElement>("[data-panel]")
      .forEach((b) =>
        b.setAttribute("aria-expanded", String(b.dataset.panel === name)),
      );
    const sheet = $(".paper-scroll"),
      top = $(".workspace-top"),
      dock = $("#player"),
      rail = $(".outline");
    for (const el of [sheet, top, dock, rail])
      if (el) el.inert = name !== "none" && innerWidth < 900;
    if (name !== "none") {
      right.scrollTop = 0;
      if (innerWidth < 900) $("#close-panel")?.focus();
    } else if (innerWidth < 900 && previous !== "none") {
      $(`[data-panel="${previous}"]`)?.focus();
    }
  };
  const jump = (id: string, field = false) => {
    if (fix) {
      highlight(id);
      if (innerWidth < 900) setPanel("none");
      const row = $(`#fix-${id} textarea`);
      row?.focus();
      row?.scrollIntoView({ block: "center", behavior: "instant" });
      return;
    }
    const q = doc.blocks.filter(isQuestion).findIndex((b) => b.id === id);
    if (q >= 0) index = q;
    focusMode();
    highlight(id);
    if (innerWidth < 900) setPanel("none");
    const node = $(`#block-${id}`);
    if (node) {
      const target = field
        ? (node.querySelector<HTMLElement>("input,textarea,select") ?? node)
        : node;
      target.focus();
      target.scrollIntoView({ block: "center", behavior: "instant" });
    }
  };
  const nextQuestion = (delta: number) => {
    const qs = doc.blocks.filter(isQuestion);
    if (qs.length)
      jump(qs[Math.max(0, Math.min(qs.length - 1, index + delta))].id);
  };
  const nextUnanswered = () => {
    const q = doc.blocks.filter(isQuestion),
      order = [...q.slice(index), ...q.slice(0, index)],
      b = order.find((b) => !answered(b, doc.answers));
    if (b) jump(b.id, true);
    else status("All questions have an answer. Ready to review.");
  };
  const persistPrefs = () => {
    applyPreferences(p);
    actions.preferences(p);
    focusMode();
    ruler();
    void decorate();
  };
  async function decorate() {
    const generation = ++decoration;
    const nodes = [
      ...root.querySelectorAll<HTMLElement>("#worksheet [data-word]"),
    ];
    for (const el of nodes) {
      el.tabIndex = p.dictionary ? 0 : -1;
      el.classList.remove(
        "pos-noun",
        "pos-verb",
        "pos-adjective",
        "pos-adverb",
      );
      if (el.dataset.original) el.innerHTML = el.dataset.original;
      else el.dataset.original = el.innerHTML;
    }
    if (!p.syllables && !p.pos) return;
    try {
      const m = await import("../features/language-tools");
      const tags =
        p.pos && doc.language === "en"
          ? await m.partsOfSpeech(
              doc.blocks
                .map((b) => b.text + " " + (b.options ?? []).join(" "))
                .join("\n"),
            )
          : new Map<string, string>();
      const decorations = await Promise.all(
        nodes.map(async (el) => ({
          el,
          word: el.dataset.word!,
          syllable: p.syllables
            ? await m.syllables(el.dataset.word!, doc.language)
            : el.dataset.word!,
        })),
      );
      if (disposed || generation !== decoration) return;
      for (const { el, word, syllable } of decorations) {
        if (syllable !== word)
          el.innerHTML = `<span aria-hidden="true">${esc(syllable)}</span><span class="sr-only">${esc(word)}</span>`;
        const tag = tags.get(word.toLowerCase().replace(/[^\p{L}]/gu, ""));
        if (tag) el.classList.add("pos-" + tag);
      }
    } catch (e) {
      status(e instanceof Error ? e.message : "Reading tools unavailable.");
    }
  }
  function voices() {
    if (!reader) return;
    const select = $<HTMLSelectElement>("#speech-voice");
    if (!select) return;
    select.innerHTML =
      reader
        .voices()
        .map(
          (v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`,
        )
        .join("") || '<option value="">No local voice installed</option>';
    if (reader.voices().some((v) => v.voiceURI === p.voice))
      select.value = p.voice;
  }
  function setupReader() {
    if (!("speechSynthesis" in window)) {
      document.documentElement.classList.add("no-speech");
      return;
    }
    document.documentElement.classList.remove("no-speech");
    $("#player")!.hidden = false;
    root
      .querySelectorAll<HTMLElement>("[data-read]")
      .forEach((b) => (b.hidden = false));
    reader = new Reader(doc.blocks, doc.language, {
      block: (i, text) => {
        const b = doc.blocks[i];
        highlight(b.id);
        const qi = doc.blocks.filter(isQuestion).indexOf(b);
        if (qi >= 0) {
          index = qi;
          focusMode();
        }
        const el = $("#player-text");
        if (el) {
          let offset = 0;
          el.innerHTML = text
            .split(/(\s+)/)
            .map((w) => {
              const start = offset;
              offset += w.length;
              return `<span data-start="${start}" data-end="${offset}">${esc(w)}</span>`;
            })
            .join("");
        }
      },
      word: (start, length) => {
        root
          .querySelectorAll<HTMLElement>("#player-text span")
          .forEach((el) =>
            el.classList.toggle(
              "spoken-word",
              Number(el.dataset.start) < start + length &&
                Number(el.dataset.end) > start,
            ),
          );
        const spoken = $("#player-text")
          ?.textContent?.slice(start, start + length)
          .trim()
          .toLowerCase();
        root
          .querySelectorAll<HTMLElement>("#worksheet [data-word]")
          .forEach((el) =>
            el.classList.toggle(
              "spoken-word",
              el.closest<HTMLElement>("[data-block]")?.dataset.block ===
                active &&
                (length > 70 || el.dataset.word?.toLowerCase() === spoken),
            ),
          );
      },
      state: (text) => {
        status(text);
        const toggle = $("#player-toggle");
        if (toggle) {
          toggle.textContent = reader?.playing && !reader.paused ? "Ⅱ" : "▶";
          toggle.setAttribute(
            "aria-label",
            reader?.playing && !reader.paused
              ? "Pause reading"
              : "Play worksheet",
          );
        }
      },
    });
    reader.rate = Number(p.rate);
    reader.voice = p.voice;
    voices();
    speechSynthesis.addEventListener("voiceschanged", voices);
  }
  function aiControls() {
    const cap = detectAI(),
      el = $("#ai-tools");
    if (!el) return;
    el.innerHTML =
      cap.translate || cap.simplify || cap.explain
        ? `<h3>On-device assistance</h3><p class="small">Applies to the current highlighted block. Uses an installed browser model. Review AI output.</p>${
            cap.translate
              ? `<label>Translate to<select id="translate-language">${Object.entries(
                  languages,
                )
                  .map(
                    ([v, [n]]) =>
                      `<option value="${v}" ${v === "es" ? "selected" : ""}>${n}</option>`,
                  )
                  .join(
                    "",
                  )}</select></label><button data-ai="translate">Translate block</button>`
              : ""
          }${cap.simplify ? '<button data-ai="simplify">Simplify this</button>' : ""}${cap.explain ? '<button data-ai="explain">Explain this</button>' : ""}`
        : "";
  }
  function show() {
    reader?.stop(false);
    if ("speechSynthesis" in window)
      speechSynthesis.removeEventListener("voiceschanged", voices);
    root.innerHTML = resultView(doc, p);
    if (!actions.home) $("#new-sheet")?.remove();
    if (!actions.remove) $("#delete-sheet")?.remove();
    if (!actions.html) $("#download-html")?.remove();
    if (actions.standalone) {
      $("#share-students")?.remove();
    }
    if ("share" in navigator) $("#web-share")!.hidden = false;
    if (recognitionAvailable()) {
      $("#dock-mic")!.hidden = false;
      $("#player")!.hidden = false;
    }
    setupReader();
    if (recognitionAvailable()) $("#player")!.hidden = false;
    focusMode();
    setPanel(panel);
    highlight(active);
    if (innerWidth < 900) {
      const measure = $(".comparison");
      if (measure) $(".paper-scroll")!.insertBefore(measure, $("#worksheet"));
    }
    ruler();
    aiControls();
    updateMic();
    void decorate();
  }
  function showFix() {
    reader?.stop(false);
    fix = true;
    if (reader) reader.blocks = doc.blocks;
    $("#worksheet")!.hidden = true;
    $("#question-nav")!.hidden = true;
    $("#editor")!.hidden = false;
    $("#editor")!.innerHTML = fixView(
      doc,
      history.canUndo,
      history.canRedo,
      queueIndex,
    );
    $("#answer-mode")?.setAttribute("aria-pressed", "false");
    $("#fix-mode")?.setAttribute("aria-pressed", "true");
    editGroup = undefined;
    if (!("speechSynthesis" in window))
      $("#queue-read")?.setAttribute("hidden", "");
    const mode = $("#fix-mode");
    if (mode)
      mode.textContent = reviewCount(doc)
        ? `Check ${reviewCount(doc)} ${reviewCount(doc) === 1 ? "line" : "lines"}`
        : "Edit";
  }
  function recordEdit(input: HTMLElement) {
    if (editGroup !== input) {
      history.record();
      editGroup = input;
    }
  }
  function updateUndo() {
    const undo = $<HTMLButtonElement>("#undo"),
      redo = $<HTMLButtonElement>("#redo");
    if (undo) undo.disabled = !history.canUndo;
    if (redo) redo.disabled = !history.canRedo;
  }
  function autosave(input: HTMLInputElement) {
    const card = input.closest<HTMLElement>("[data-fix]");
    if (!card) return;
    const b = doc.blocks.find((b) => b.id === card.dataset.fix)!;
    const edit = (key: string) =>
      card.querySelector<HTMLInputElement>(`[data-edit="${key}"]`)!;
    try {
      const text = edit("text").value.trim(),
        kind = edit("kind").value as Block["kind"],
        options = edit("options")
          .value.split("\n")
          .map((v) => v.trim())
          .filter(Boolean);
      if (!text) throw Error("A block needs text. Use Delete to remove it.");
      if (kind === "fill-blank" && !/_{2,}/.test(text))
        throw Error("Add at least two underscores for each blank.");
      if (["multiple-choice", "checkbox"].includes(kind) && options.length < 2)
        throw Error("Add at least two choices.");
      if (
        kind === "title" &&
        doc.blocks.some((x) => x !== b && x.kind === "title")
      )
        throw Error("There is already a title. Use heading for a section.");
      recordEdit(input);
      const changed =
        b.text !== text ||
        b.kind !== kind ||
        JSON.stringify(b.options ?? []) !== JSON.stringify(options);
      if (changed) {
        answerKeys(b).forEach((k) => delete doc.answers[k]);
        b.key = {};
      }
      b.text = text;
      b.kind = kind;
      b.options = options;

      b.hint = edit("hint")?.value || "";
      if (edit("cells"))
        b.cells = edit("cells")
          .value.split("\n")
          .map((r) => r.split("|").map((c) => c.trim()));
      if (edit("pairs"))
        b.pairs = edit("pairs").value.split("\n").filter(Boolean);
      if (kind === "table" && !b.cells)
        b.cells = [
          ["Item", "Answer"],
          ["Row 1", ""],
        ];
      if (kind === "matching" && !b.pairs) b.pairs = ["Match 1"];
      const key: Record<string, string[]> = {};
      card.querySelectorAll<HTMLInputElement>("[data-key]").forEach((el) => {
        const values = el.value
          .split("|")
          .map((v) => v.trim())
          .filter(Boolean);
        if (values.length && answerKeys(b).includes(el.dataset.key!))
          key[el.dataset.key!] = values;
      });
      const selected = [
        ...card.querySelectorAll<HTMLInputElement>("[data-key-option]:checked"),
      ].map((el) => el.value);
      if (
        selected.length &&
        ["multiple-choice", "checkbox", "true-false"].includes(b.kind)
      )
        key[b.id] = selected.filter((v) =>
          (b.kind === "true-false"
            ? doc.language === "es"
              ? ["Verdadero", "Falso"]
              : ["True", "False"]
            : (b.options ?? [])
          ).includes(v),
        );
      b.key = key;
      if (kind === "title") doc.name = text;

      save();
      updateUndo();
      status("Changes saved automatically.");
    } catch (e) {
      status(e instanceof Error ? e.message : "Check this edit.");
    }
  }
  async function definition(word: string) {
    if (!word.trim()) return;
    const dialog = $<HTMLDialogElement>("#word-dialog")!;
    $("#word-title")!.textContent = word;
    $("#definition")!.textContent = "Loading the compact English dictionary…";
    if (!dialog.open) dialog.showModal();
    try {
      const m = await import("../features/language-tools");
      const def = await m.lookupWord(word);
      if (!disposed) $("#definition")!.textContent = def;
    } catch (e) {
      if (!disposed)
        $("#definition")!.textContent =
          e instanceof Error ? e.message : "Dictionary unavailable.";
    }
  }
  function check() {
    const score = checkAnswers(doc);
    for (const r of score.results) {
      const b = doc.blocks.find((b) => b.id === r.id)!,
        el = $(`#feedback-${r.id}`);
      if (el) {
        el.textContent =
          r.result === "correct"
            ? "Correct."
            : r.result === "retry"
              ? `Try again.${b.hint ? " Hint: " + b.hint : ""}`
              : "No answer key for this question.";
        el.dataset.result = r.result;
      }
    }
    $("#score")!.textContent = score.total
      ? `${score.correct} of ${score.total} keyed questions correct. ${score.results.length - score.total} without a key.`
      : "No answer key yet. A teacher can add one in Edit.";
    $("#retry")!.hidden = !score.results.some((r) => r.result === "retry");
    status($("#score")!.textContent!);
  }
  function onInput(event: Event) {
    const el = event.target as HTMLInputElement;
    if (fix && el.id === "queue-text") {
      const b = doc.blocks.find((b) => b.id === el.dataset.lineBlock)!;
      if (editGroup !== el)
        queueBaseline = { input: el, block: structuredClone(b) };
      recordEdit(el);
      const keys = answerKeys(b),
        previousOptions = JSON.stringify(b.options);
      const edited = structuredClone(queueBaseline!.block);
      const mapped = correctLine(
        edited,
        Number(el.dataset.lineIndex),
        el.value,
      );
      Object.assign(b, edited);
      if (
        JSON.stringify(keys) !== JSON.stringify(answerKeys(b)) ||
        previousOptions !== JSON.stringify(b.options)
      ) {
        keys.forEach((key) => delete doc.answers[key]);
        b.key = {};
      }
      if (b.kind === "title") doc.name = b.text;
      if (!mapped)
        status(
          "Recognised line saved. Its structured text differs; adjust the block row below.",
        );
      const rowText = $<HTMLTextAreaElement>(`#fix-${b.id} [data-edit="text"]`);
      if (rowText) rowText.value = b.text;
      const rowOptions = $<HTMLTextAreaElement>(
        `#fix-${b.id} [data-edit="options"]`,
      );
      if (rowOptions) rowOptions.value = (b.options || []).join("\n");
      save();
      updateUndo();
      return;
    }
    if (fix && el.closest("[data-fix]")) {
      autosave(el);
      return;
    }
    if (el.id === "worksheet-title") {
      doc.name = el.value;
      const title = doc.blocks.find((b) => b.kind === "title");
      if (title) {
        title.text = el.value;
        const h = $(`#block-${title.id} h1`);
        if (h) h.textContent = el.value;
        const editorTitle = $("#editor h1");
        if (editorTitle) editorTitle.textContent = el.value;
      }
      save();
      return;
    }
    if (!el.dataset.answer) return;
    lastAnswer = el.dataset.answer;
    updateMic();
    const key = el.dataset.answer,
      b = doc.blocks.find((b) => answerKeys(b).includes(key));
    doc.answers[key] =
      el.type === "checkbox"
        ? JSON.stringify(
            [
              ...root.querySelectorAll<HTMLInputElement>(
                `input[data-answer="${key}"]:checked`,
              ),
            ].map((i) => i.value),
          )
        : el.value;
    if (b?.kind === "figure") {
      const image = $<HTMLImageElement>(`#figure-img-${b.id}`);
      if (image) image.alt = el.value || b.text;
      const caption = $(`#figure-caption-${b.id}`);
      if (caption) caption.textContent = el.value || b.text;
    }
    if (b) {
      const feedback = $(`#feedback-${b.id}`);
      if (feedback) feedback.textContent = "";
      const printed = $(`#block-${b.id}`)?.querySelectorAll(".print-answer");
      printed?.forEach(
        (s, i) => (s.textContent = doc.answers[answerKeys(b)[i]] || "________"),
      );
    }
    const score = $("#score");
    if (score) score.textContent = "";
    updateProgress();
    save();
  }
  function onChange(event: Event) {
    const el = event.target as HTMLInputElement;
    if (fix && el.closest("[data-fix]")) {
      if (el.tagName === "SELECT") {
        const blockId = el.closest<HTMLElement>("[data-fix]")?.dataset.fix;
        autosave(el);
        showFix();
        $(`#fix-${blockId} [data-edit="kind"]`)?.focus();
        status("Changes saved automatically.");
      }
      editGroup = undefined;
      return;
    }
    if (el.id === "teacher-format") {
      const button = $("[data-delivery=teacher] button")!;
      button.id = el.value;
      button.textContent =
        el.value === "print" ? "Print / Save as PDF" : "Download Word";
    }
    if (el.dataset.pref) {
      (p as unknown as Record<string, unknown>)[el.dataset.pref] = el.checked;
      persistPrefs();
    }
    if (el.id === "speech-rate") {
      p.rate = el.value;
      if (reader) {
        reader.rate = Number(el.value);
        if (reader.playing) reader.start();
      }
      actions.preferences(p);
    }
    if (el.id === "speech-voice") {
      p.voice = el.value;
      if (reader) {
        reader.voice = el.value;
        if (reader.playing) reader.start();
      }
      actions.preferences(p);
    }
  }
  function onFocus(event: FocusEvent) {
    const el = event.target as HTMLElement,
      b = el.closest<HTMLElement>("[data-block], [data-fix]");
    if (el.dataset.answer) {
      lastAnswer = el.dataset.answer;
      updateMic();
    }
    if (editGroup !== el) editGroup = undefined;
    if (b) {
      highlight(b.dataset.block || b.dataset.fix!);
      const qi = doc.blocks
        .filter(isQuestion)
        .findIndex((q) => q.id === active);
      if (qi >= 0) index = qi;
      rulerY = el.getBoundingClientRect().top - 12;
      ruler();
    }
  }
  function micTarget() {
    return (
      (doc.blocks.some((b) => answerKeys(b).includes(lastAnswer)) &&
        lastAnswer) ||
      doc.blocks
        .flatMap(answerKeys)
        .find((k) => !doc.answers[k]?.trim() || doc.answers[k] === "[]") ||
      ""
    );
  }
  function updateMic() {
    const key = micTarget(),
      input = $<HTMLInputElement>(`[data-answer="${key}"]`);
    $("#dock-mic")?.setAttribute(
      "aria-label",
      key
        ? `Voice type: ${input?.getAttribute("aria-label") || doc.blocks.find((b) => answerKeys(b).includes(key))?.text || "answer"}`
        : "Voice typing: no answer field",
    );
  }
  function startMic(key: string) {
    stopMic?.();
    const input =
      $<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        `#answer-${key}`,
      ) ?? $<HTMLInputElement>(`[data-answer="${key}"]`);
    if (!input) return;
    stopMic = dictate(
      doc.language,
      (text) => {
        if (
          input instanceof HTMLInputElement &&
          ["radio", "checkbox"].includes(input.type)
        ) {
          const options = [
            ...root.querySelectorAll<HTMLInputElement>(
              `input[data-answer="${key}"]`,
            ),
          ];
          const spoken = text
            .trim()
            .replace(/[.!?]+$/, "")
            .toLowerCase();
          const letter = spoken.match(/^(?:option )?([a-h])$/);
          const option = letter
            ? options[letter[1].charCodeAt(0) - 97]
            : options.find((o) => o.value.toLowerCase() === spoken);
          if (!option) {
            status("No matching option. Say the option text or its letter.");
            return;
          }
          option.checked = true;
          option.dispatchEvent(new Event("input", { bubbles: true }));
          option.focus();
          return;
        }
        if (input instanceof HTMLSelectElement) {
          const o = [...input.options].find(
            (o) => o.value.toLowerCase() === text.trim().toLowerCase(),
          );
          if (o) input.value = o.value;
          else {
            status("No matching option. Please choose an option.");
            return;
          }
        } else input.value = (input.value ? input.value + " " : "") + text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      },
      status,
    );
    $("#stop-mic")!.hidden = false;
  }
  async function onClick(event: MouseEvent) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!button) return;
    try {
      if (button.hasAttribute("data-close-dialog")) {
        button.closest<HTMLDialogElement>("dialog")?.close();
        return;
      }
      if (button.dataset.jump) {
        jump(button.dataset.jump);
        return;
      }
      if (button.dataset.source) {
        jump(button.dataset.source);
        return;
      }
      if (button.dataset.panel) {
        setPanel(
          panel === button.dataset.panel ? "none" : button.dataset.panel,
        );
        return;
      }
      if (button.dataset.read) {
        reader?.start(
          doc.blocks.findIndex((b) => b.id === button.dataset.read),
        );
        return;
      }
      if (button.dataset.themeChoice) {
        p.theme = button.dataset.themeChoice;
        $("#panel-tools")!.innerHTML = tools(p);
        persistPrefs();
        aiControls();
        voices();
        $(`[data-theme-choice="${p.theme}"]`)?.focus();
        return;
      }
      if (button.dataset.setting) {
        (p as unknown as Record<string, unknown>)[button.dataset.setting] =
          button.dataset.value;
        $("#panel-tools")!.innerHTML = tools(p);
        persistPrefs();
        aiControls();
        voices();
        $(
          `[data-setting="${button.dataset.setting}"][data-value="${button.dataset.value}"]`,
        )?.focus();
        return;
      }
      if (button.id === "dock-mic") {
        pendingMic = micTarget();
        if (!pendingMic) {
          status("No answer fields available.");
          return;
        }
        if (local.get("unflatten-voice-consent") === "yes")
          startMic(pendingMic);
        else $<HTMLDialogElement>("#voice-dialog")!.showModal();
        return;
      }
      if (button.dataset.ai) {
        const b = doc.blocks.find((b) => b.id === active);
        if (!b) return;
        const id = b.id,
          mode = button.dataset.ai as "translate" | "simplify" | "explain",
          target = $<HTMLSelectElement>("#translate-language")?.value || "es";
        status("Working with the installed on-device model…");
        const result = await runAI(mode, b.text, target);
        if (disposed) return;
        const resultNode = $(`#ai-${id}`);
        if (resultNode) {
          resultNode.innerHTML = `<div class="translation-pair"><section><h3>Original</h3><p>${esc(b.text)}</p></section><section><h3>${mode === "translate" ? "Translation" : mode === "simplify" ? "Simplified" : "Explanation"} · AI draft</h3><p lang="${mode === "translate" ? target : doc.language}" dir="${(mode === "translate" ? target : doc.language) === "ar" ? "rtl" : "ltr"}">${esc(result)}</p></section></div>`;
          jump(id);
          status("On-device draft ready. Review it against the original.");
        }
        return;
      }
      if (button.dataset.recipient) {
        root
          .querySelectorAll<HTMLElement>("[data-delivery]")
          .forEach(
            (el) =>
              (el.hidden = el.dataset.delivery !== button.dataset.recipient),
          );
        root
          .querySelectorAll<HTMLElement>("[data-recipient]")
          .forEach((el) =>
            el.setAttribute("aria-pressed", String(el === button)),
          );
        return;
      }
      const id = button.id;
      if (id === "queue-read") {
        const voice =
          reader?.voices().find((v) => v.voiceURI === p.voice) ||
          reader?.voices()[0];
        if (!voice) {
          status(
            "Install a local device voice for this language to read this line.",
          );
          return;
        }
        reader?.stop(false);
        const utterance = new SpeechSynthesisUtterance(
          $<HTMLInputElement>("#queue-text")!.value,
        );
        utterance.voice = voice;
        utterance.lang = doc.language;
        utterance.rate = Number(p.rate);
        speechSynthesis.speak(utterance);
        status("Reading the recognised line.");
        return;
      }
      if (id === "queue-next") {
        const n = reviewCount(doc);
        queueIndex = n ? (queueIndex + 1) % n : 0;
        showFix();
        $("#queue-text")?.focus();
        return;
      }
      if (id === "looks-right") {
        const input = $<HTMLInputElement>("#queue-text");
        if (input) {
          history.record();
          doc.blocks.find((b) => b.id === input.dataset.lineBlock)!.lines[
            Number(input.dataset.lineIndex)
          ].reviewed = true;
          queueIndex = Math.min(queueIndex, Math.max(0, reviewCount(doc) - 1));
          save();
          showFix();
          $("#queue-text")?.focus();
          status("Line checked. Warning cleared.");
        }
        return;
      }
      if (id === "new-sheet") actions.home?.();
      if (id === "delete-sheet") await actions.remove?.();
      if (id === "close-panel") setPanel("none");
      if (id === "next-unanswered" || id === "mobile-next-unanswered")
        nextUnanswered();
      if (id === "previous-question") nextQuestion(-1);
      if (id === "next-question") nextQuestion(1);
      if (id === "size-up" || id === "size-down") {
        p.size = String(
          Math.max(
            100,
            Math.min(200, Number(p.size) + (id === "size-up" ? 25 : -25)),
          ),
        );
        $("#size-value")!.textContent = p.size + "%";
        persistPrefs();
      }
      if (id === "ruler-up" || id === "ruler-down") {
        rulerY += id === "ruler-up" ? -50 : 50;
        ruler();
      }
      if (id === "player-toggle") reader?.toggle();
      if (id === "player-prev") reader?.start(Math.max(0, reader.index - 1));
      if (id === "player-next")
        reader?.start(Math.min(doc.blocks.length - 1, reader.index + 1));
      if (id === "help") $<HTMLDialogElement>("#help-dialog")!.showModal();
      if (id === "define-word")
        await definition($<HTMLInputElement>("#dictionary-word")!.value);
      if (id === "speak-word" && "speechSynthesis" in window) {
        const voice = speechSynthesis
          .getVoices()
          .find((v) => v.localService && v.lang.startsWith("en"));
        if (voice) {
          reader?.stop(false);
          const u = new SpeechSynthesisUtterance(
            $("#word-title")!.textContent!,
          );
          u.voice = voice;
          speechSynthesis.speak(u);
        } else
          $("#definition")!.textContent +=
            " No local English voice is installed.";
      }
      if (id === "voice-consent") {
        local.set("unflatten-voice-consent", "yes");
        $<HTMLDialogElement>("#voice-dialog")!.close();
        startMic(pendingMic);
      }
      if (id === "stop-mic") {
        stopMic?.();
        button.hidden = true;
      }
      if (id === "check-answers" || id === "rail-check-answers") check();
      if (id === "retry") {
        const result = checkAnswers(doc);
        for (const r of result.results.filter((r) => r.result === "retry")) {
          const b = doc.blocks.find((b) => b.id === r.id)!;
          for (const key of answerKeys(b)) delete doc.answers[key];
        }
        save();
        show();
        nextUnanswered();
        status("Incorrect answers cleared. Try again.");
      }
      if (id === "fix-mode") {
        showFix();
        $("#queue-text")?.focus();
      }
      if (id === "done-fixing" || id === "answer-mode") {
        fix = false;
        show();
        $("#worksheet")?.focus();
      }
      if (id === "undo" || id === "redo") {
        if (id === "undo") history.undo();
        else history.redo();
        save();
        showFix();
        status(id === "undo" ? "Edit undone." : "Edit restored.");
      }
      if (id === "add-block") {
        history.record();
        const b: Block = {
          id: "b-" + crypto.randomUUID(),
          kind: "short-answer",
          text: "New question",
          page: 1,
          lines: [],
        };
        doc.blocks.push(b);
        save();
        showFix();
        $(`#fix-${b.id} textarea`)?.focus();
      }
      if (button.dataset.fixAction) {
        const card = button.closest<HTMLElement>("[data-fix]")!,
          bi = doc.blocks.findIndex((b) => b.id === card.dataset.fix),
          b = doc.blocks[bi],
          action = button.dataset.fixAction;
        let message = "Block saved.";
        const edit = <
          T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
        >(
          k: string,
        ) => card.querySelector<T>(`[data-edit="${k}"]`)!;
        {
          history.record();
          if (action === "add") {
            doc.blocks.splice(bi + 1, 0, {
              id: "b-" + crypto.randomUUID(),
              kind: "short-answer",
              text: "New question",
              page: b.page,
              lines: [],
            });
            message = "Block added.";
          }
          if (action === "delete") {
            answerKeys(b).forEach((k) => delete doc.answers[k]);
            doc.blocks.splice(bi, 1);
            message = "Block deleted.";
          }
          if (action === "up" || action === "down") {
            const to = bi + (action === "up" ? -1 : 1);
            if (to >= 0 && to < doc.blocks.length)
              [doc.blocks[bi], doc.blocks[to]] = [
                doc.blocks[to],
                doc.blocks[bi],
              ];
            message = "Block moved.";
          }
          if (action === "merge") {
            const next = doc.blocks[bi + 1];
            if (next) {
              [...answerKeys(b), ...answerKeys(next)].forEach(
                (k) => delete doc.answers[k],
              );
              b.key = {};
              b.text += " " + next.text;
              b.lines.push(...next.lines);
              b.options = [...(b.options ?? []), ...(next.options ?? [])];
              doc.blocks.splice(bi + 1, 1);
            }
            message = "Blocks merged.";
          }
          if (action === "split") {
            const input = edit<HTMLTextAreaElement>("text"),
              at = input.selectionStart;
            if (at <= 0 || at >= input.value.length)
              throw Error(
                "Place the cursor inside the block text, then choose Split.",
              );
            const next = {
              ...b,
              id: "b-" + crypto.randomUUID(),
              text: input.value.slice(at).trim(),
              kind: b.kind === "title" ? ("heading" as const) : b.kind,
              lines: [],
              key: {},
            };
            answerKeys(b).forEach((k) => delete doc.answers[k]);
            b.text = input.value.slice(0, at).trim();
            b.key = {};
            doc.blocks.splice(bi + 1, 0, next);
            message = "Block split.";
          }
        }
        save();
        showFix();
        status(message);
        (
          $(`#fix-${b.id} textarea`) ??
          $("#editor textarea") ??
          $("#done-fixing")
        )?.focus();
        return;
      }
      const withAnswers =
        $<HTMLInputElement>('input[name="export-mode"]:checked')?.value !==
        "blank";
      const output = withAnswers ? doc : { ...doc, answers: {} };
      if (id === "download-html") {
        await actions.html?.(output);
        status("Accessible HTML downloaded.");
      }
      if (id === "download-text")
        download(
          "worksheet-answers.txt",
          plainAnswers(output),
          "text/plain;charset=utf-8",
        );
      if (id === "download-docx") {
        const { makeDocx } = await import("../output/docx");
        download("worksheet.docx", await makeDocx(doc, withAnswers));
      }
      if (id === "download-epub") {
        const { makeEpub } = await import("../output/epub");
        download(
          "worksheet.epub",
          makeEpub(doc, withAnswers),
          "application/epub+zip",
        );
      }
      if (id === "download-brf" || id === "preview-braille") {
        if (doc.language !== "en")
          throw Error(
            "UEB Grade 1 export supports English. Translate or use another format for this worksheet.",
          );
        const { toBRF, wrapBRF, unicodeBraille } =
          await import("../output/braille");
        const brf = wrapBRF(toBRF(plainAnswers(output)));
        if (id === "download-brf")
          download("worksheet-grade-1.brf", brf, "text/plain");
        else {
          const el = $("#braille-preview")!;
          el.hidden = false;
          el.textContent = unicodeBraille(brf);
        }
      }
      if (id === "copy") {
        await navigator.clipboard.writeText(plainAnswers(output));
        status("Answers copied.");
      }
      if (id === "email") {
        location.href =
          "mailto:?subject=" +
          encodeURIComponent(doc.name) +
          "&body=" +
          encodeURIComponent(plainAnswers(output));
      }
      if (id === "web-share") {
        const file = new File([plainAnswers(output)], "worksheet.txt", {
          type: "text/plain",
        });
        if (navigator.canShare?.({ files: [file] }))
          await navigator.share({ title: doc.name, files: [file] });
        else
          await navigator.share({
            title: doc.name,
            text: plainAnswers(output),
          });
      }
      if (id === "print") {
        reader?.stop(false);
        const editing = fix;
        if (editing) {
          fix = false;
          show();
        }
        const prior = p.focus;
        p.focus = false;
        focusMode();
        root.classList.toggle("print-blank", !withAnswers);
        window.print();
        root.classList.remove("print-blank");
        p.focus = prior;
        focusMode();
        if (editing) showFix();
      }
      if (id === "share-students") {
        const { packShare, shareQR } = await import("../features/share");
        const url = new URL(location.href);
        url.hash = packShare(doc);
        const el = $("#share-result")!;
        if (url.href.length > 2500) {
          el.innerHTML =
            '<p class="warning">This link is too long for reliable sharing or QR scanning. Download a blank HTML copy instead; it includes the original images.</p><button id="share-html-fallback">Download blank HTML</button>';
        } else {
          el.innerHTML = `<label>Class link<textarea id="share-url" readonly>${esc(url.href)}</textarea></label><button id="copy-link">Copy link</button><div class="qr" role="img" aria-label="QR code to open the blank worksheet">${await shareQR(url.href)}</div><p class="small">No student answers are included. Link data stays in the URL fragment and is not sent to the web server. Anyone with the link can read the worksheet and key.</p>`;
        }
      }
      if (id === "copy-link") {
        await navigator.clipboard.writeText(
          $<HTMLTextAreaElement>("#share-url")!.value,
        );
        status("Class link copied.");
      }
      if (id === "share-html-fallback")
        await actions.html?.({ ...doc, answers: {} });
    } catch (e) {
      status(
        e instanceof Error
          ? e.message
          : "That action could not finish. Your worksheet is still here.",
      );
    }
  }
  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement,
      typing = !!target.closest(
        'input,textarea,select,[contenteditable="true"]',
      );
    if (fix && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
      const blockId = target.closest<HTMLElement>("[data-fix]")?.dataset.fix;
      const edit = target.dataset.edit,
        key = target.dataset.key;
      save();
      showFix();
      const restored =
        target.id === "queue-text"
          ? $("#queue-text")
          : blockId
            ? $(
                `#fix-${blockId} ${edit ? `[data-edit="${edit}"]` : key ? `[data-key="${key}"]` : "textarea"}`,
              )
            : undefined;
      if (restored) {
        restored
          .closest<HTMLDetailsElement>("details")
          ?.setAttribute("open", "");
        restored.focus();
      } else $("#done-fixing")?.focus();
      return;
    }
    if (e.key === "Escape" && panel !== "none") {
      e.preventDefault();
      setPanel("none");
      return;
    }
    if (
      panel !== "none" &&
      innerWidth < 900 &&
      e.key === "Tab" &&
      !root.querySelector("dialog[open]")
    ) {
      const nodes = [
        ...$("#right-panel")!.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input, select, textarea, summary, a[href]",
        ),
      ].filter((el) => el.getClientRects().length);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (
        e.shiftKey &&
        (target === first || !$("#right-panel")!.contains(target))
      ) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && target === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    if (
      target.dataset.word &&
      p.dictionary &&
      (e.key === "Enter" || e.key === " ")
    ) {
      e.preventDefault();
      void definition(target.dataset.word);
      return;
    }
    if (
      fix ||
      (!e.altKey && (!p.singleKeys || typing)) ||
      e.ctrlKey ||
      e.metaKey
    )
      return;
    const key =
      e.altKey && /^Key[A-Z]$/.test(e.code)
        ? e.code.slice(3).toLowerCase()
        : e.key.toLowerCase();
    if (!["n", "p", "r", "u", "o"].includes(key)) return;
    e.preventDefault();
    if (key === "n") nextQuestion(1);
    if (key === "p") nextQuestion(-1);
    if (key === "r") reader?.toggle();
    if (key === "u") nextUnanswered();
    if (key === "o") setPanel(panel === "original" ? "none" : "original");
  }
  function onPointer(e: PointerEvent) {
    if (p.ruler || p.mask) {
      rulerY = e.clientY - 35;
      ruler();
    }
  }
  function onDoubleClick(e: MouseEvent) {
    clearTimeout(selectionTimer);
    if ((e.target as HTMLElement).closest("#worksheet")) {
      const word =
        getSelection()?.toString().trim() ||
        (e.target as HTMLElement).closest<HTMLElement>("[data-word]")?.dataset
          .word;
      if (word && word.length < 80) void definition(word);
    }
  }
  function onSelection(e: MouseEvent) {
    const word = getSelection()?.toString().trim();
    if (
      word &&
      /^[\p{L}'’-]{2,40}$/u.test(word) &&
      (e.target as HTMLElement).closest("#worksheet")
    ) {
      const input = $<HTMLInputElement>("#dictionary-word");
      if (input) input.value = word;
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(() => {
        if (!disposed) void definition(word);
      }, 250);
    }
  }
  const systemTheme = matchMedia("(prefers-color-scheme: light)");
  const syncShell = () => {
    if (p.shell === "system") applyPreferences(p);
  };
  systemTheme.addEventListener("change", syncShell);
  applyPreferences(p);
  show();
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("click", onClick);
  root.addEventListener("focusin", onFocus);
  root.addEventListener("dblclick", onDoubleClick);
  root.addEventListener("mouseup", onSelection);
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointermove", onPointer);
  return () => {
    disposed = true;
    systemTheme.removeEventListener("change", syncShell);
    clearTimeout(selectionTimer);
    decoration++;
    reader?.stop(false);
    stopMic?.();
    if ("speechSynthesis" in window)
      speechSynthesis.removeEventListener("voiceschanged", voices);
    root.removeEventListener("input", onInput);
    root.removeEventListener("change", onChange);
    root.removeEventListener("click", onClick);
    root.removeEventListener("focusin", onFocus);
    root.removeEventListener("dblclick", onDoubleClick);
    root.removeEventListener("mouseup", onSelection);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("pointermove", onPointer);
  };
}
