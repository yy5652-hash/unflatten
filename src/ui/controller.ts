import {
  type Worksheet,
  type Block,
  isQuestion,
  answerKeys,
  answered,
} from "../parse/types";
import {
  resultView,
  fixView,
  applyPreferences,
  answerCount,
  plainAnswers,
  type Preferences,
} from "./view";
export interface Actions {
  save: (doc: Worksheet) => Promise<unknown> | void;
  preferences: (p: Preferences) => void;
  home?: () => void;
  remove?: () => Promise<void>;
  html?: () => Promise<void>;
}
export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function mountWorksheet(
  root: HTMLElement,
  doc: Worksheet,
  p: Preferences,
  actions: Actions,
) {
  let index = 0;
  let disposed = false;
  let speaking: SpeechSynthesisUtterance | undefined;
  let saveSerial = 0;
  const status = (s: string) => {
    const el =
      root.querySelector("#action-status") || root.querySelector("#fix-status");
    if (el) el.textContent = s;
  };
  const save = () => {
    doc.updated = Date.now();
    const serial = ++saveSerial;
    // An attribute, not text: this is a live region, and screen readers must not hear every keystroke.
    root
      .querySelector<HTMLElement>("#save-status")
      ?.setAttribute("data-pending", "true");
    Promise.resolve(actions.save(doc))
      .then(() => {
        if (!disposed && serial === saveSerial) {
          const el = root.querySelector("#save-status");
          if (el) {
            el.textContent = "Answers saved on this device.";
            el.setAttribute("data-pending", "false");
          }
        }
      })
      .catch(() =>
        status(
          "Your changes are visible, but device storage is unavailable or full. Download the HTML file to keep your work.",
        ),
      );
  };
  const stop = () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    speaking = undefined;
    root
      .querySelectorAll(".speaking")
      .forEach((el) => el.classList.remove("speaking"));
  };
  const focusQuestion = () => {
    const questions = doc.blocks.filter(isQuestion);
    index = Math.max(0, Math.min(index, questions.length - 1));
    for (const b of questions) {
      const node = root.querySelector<HTMLElement>(`#block-${b.id}`);
      if (node) node.hidden = p.focus && b !== questions[index];
    }
    const nav = root.querySelector<HTMLElement>("#question-nav");
    if (nav) nav.hidden = !p.focus;
    const pos = root.querySelector("#question-position");
    if (pos)
      pos.textContent = questions.length
        ? `${index + 1} of ${questions.length}`
        : "No questions";
    const prev = root.querySelector<HTMLButtonElement>("#previous-question"),
      next = root.querySelector<HTMLButtonElement>("#next-question");
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index >= questions.length - 1;
  };
  const show = () => {
    stop();
    root.innerHTML = resultView(doc, p);
    if (!actions.home) root.querySelector("#new-sheet")?.remove();
    if (!actions.remove) root.querySelector("#delete-sheet")?.remove();
    if (!actions.html) root.querySelector("#download-html")?.remove();
    if ("speechSynthesis" in window)
      root
        .querySelectorAll<HTMLButtonElement>("[data-read]")
        .forEach((b) => (b.hidden = false));
    focusQuestion();
  };
  const onInput = (event: Event) => {
    const el = event.target as HTMLInputElement;
    if (!el.dataset.answer) return;
    doc.answers[el.dataset.answer] = el.value;
    const count = root.querySelector("#answer-count");
    if (count) count.textContent = answerCount(doc);
    const b = doc.blocks.find((b) => b.id === el.dataset.answer);
    if (b?.kind === "figure") {
      const img = root.querySelector<HTMLImageElement>(`#figure-img-${b.id}`);
      if (img) img.alt = el.value || b.text;
      const caption = root.querySelector(`#figure-caption-${b.id}`);
      if (caption) caption.textContent = el.value || b.text;
    }
    const section = el.closest(".block");
    if (section) {
      const spans = section.querySelectorAll(".print-answer");
      const keys = b
        ? answerKeys(b)
        : answerKeys(
            doc.blocks.find(
              (b) => b.id === section.getAttribute("data-block"),
            )!,
          );
      spans.forEach(
        (s, i) => (s.textContent = doc.answers[keys[i]] || "Not answered"),
      );
    }
    save();
  };
  const onChange = (event: Event) => {
    const el = event.target as HTMLInputElement;
    if (["theme", "size", "spacing", "font", "focus-mode"].includes(el.id)) {
      if (el.id === "theme") p.theme = el.value as Preferences["theme"];
      if (el.id === "size") p.size = el.value;
      if (el.id === "spacing") p.spacing = el.value;
      if (el.id === "font") p.font = el.checked;
      if (el.id === "focus-mode") p.focus = el.checked;
      applyPreferences(p);
      actions.preferences(p);
      focusQuestion();
    }
  };
  const onClick = async (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!button) return;
    try {
      if (button.dataset.read) {
        const b = doc.blocks.find((b) => b.id === button.dataset.read)!;
        if (speaking) {
          stop();
          button.textContent = "Read aloud";
          return;
        }
        const voices = speechSynthesis
          .getVoices()
          .filter((v) => v.localService && v.lang.startsWith(doc.language));
        if (!voices.length) {
          status(
            "No offline voice for this language is installed. Add a device voice in your system settings to use read aloud privately.",
          );
          return;
        }
        speaking = new SpeechSynthesisUtterance(
          [b.text.replace(/_{2,}/g, "blank"), ...(b.options || [])].join(". "),
        );
        speaking.voice = voices[0];
        speaking.lang = doc.language;
        const block = root.querySelector(`#block-${b.id}`);
        block?.classList.add("speaking");
        button.textContent = "Stop reading";
        speaking.onend = speaking.onerror = () => {
          block?.classList.remove("speaking");
          button.textContent = "Read aloud";
          speaking = undefined;
        };
        speechSynthesis.speak(speaking);
        return;
      }
      const id = button.id;
      if (id === "new-sheet") {
        stop();
        actions.home?.();
      }
      if (id === "print") {
        stop();
        const old = p.focus;
        p.focus = false;
        focusQuestion();
        window.print();
        p.focus = old;
        focusQuestion();
      }
      if (id === "copy") {
        try {
          await navigator.clipboard.writeText(plainAnswers(doc));
          status("Answers copied.");
        } catch {
          status("Clipboard access is unavailable. Use Download .txt instead.");
        }
      }
      if (id === "download-text")
        download(
          "worksheet-answers.txt",
          plainAnswers(doc),
          "text/plain;charset=utf-8",
        );
      if (id === "download-html") {
        await actions.html?.();
        status("Accessible HTML downloaded with your current answers.");
      }
      if (id === "delete-sheet") {
        await actions.remove?.();
      }
      if (id === "fix-mode") {
        stop();
        root.innerHTML = fixView(doc);
        root.querySelector<HTMLElement>("h1")?.setAttribute("tabindex", "-1");
        root.querySelector<HTMLElement>("h1")?.focus();
      }
      if (id === "done-fixing") {
        show();
        root.querySelector<HTMLElement>("h1")?.setAttribute("tabindex", "-1");
        root.querySelector<HTMLElement>("h1")?.focus();
      }
      if (id === "next-question" || id === "previous-question") {
        stop();
        index += id === "next-question" ? 1 : -1;
        focusQuestion();
        root
          .querySelector<HTMLElement>(
            `#block-${doc.blocks.filter(isQuestion)[index]?.id}`,
          )
          ?.focus();
      }
      if (id === "next-unanswered") {
        const qs = doc.blocks.filter(isQuestion);
        const next = qs.findIndex((b) => !answered(b, doc.answers));
        if (next < 0) {
          status("All questions have an answer. Ready to review.");
          return;
        }
        index = next;
        focusQuestion();
        root
          .querySelector<HTMLElement>(
            `#block-${qs[next].id} input, #block-${qs[next].id} textarea`,
          )
          ?.focus();
      }
      if (button.dataset.fixAction) {
        const card = button.closest<HTMLElement>("[data-fix]")!,
          bi = doc.blocks.findIndex((b) => b.id === card.dataset.fix),
          b = doc.blocks[bi];
        let message = "";
        if (button.dataset.fixAction === "save") {
          const text = card
              .querySelector<HTMLTextAreaElement>('[data-edit="text"]')!
              .value.trim(),
            kind = card.querySelector<HTMLSelectElement>('[data-edit="kind"]')!
              .value as Block["kind"],
            options = card
              .querySelector<HTMLTextAreaElement>('[data-edit="options"]')!
              .value.split("\n")
              .map((v) => v.trim())
              .filter(Boolean);
          if (!text) {
            status("A block needs some text. Use Delete to remove it.");
            return;
          }
          if (kind === "fill-blank" && !/_{2,}/.test(text)) {
            status("Add at least two underscores for each blank.");
            return;
          }
          if (kind === "multiple-choice" && options.length < 2) {
            status("Add at least two choices, one per line.");
            return;
          }
          if (
            kind === "title" &&
            doc.blocks.some((x) => x !== b && x.kind === "title")
          ) {
            status(
              "There is already a title. Use heading for another section.",
            );
            return;
          }
          answerKeys(b).forEach((k) => delete doc.answers[k]);
          b.text = text;
          b.kind = kind;
          b.options = options;
          b.lines = b.lines.map((l) => ({ ...l, confidence: 100 }));
          if (kind === "title") doc.name = text;
          message = "Block saved.";
        }
        if (button.dataset.fixAction === "delete") {
          answerKeys(b).forEach((k) => delete doc.answers[k]);
          doc.blocks.splice(bi, 1);
          message = "Block deleted.";
        }
        if (button.dataset.fixAction === "merge") {
          const next = doc.blocks[bi + 1];
          if (!next) return;
          [...answerKeys(b), ...answerKeys(next)].forEach(
            (k) => delete doc.answers[k],
          );
          b.text += " " + next.text;
          b.lines.push(...next.lines);
          if (next.options) b.options = [...(b.options || []), ...next.options];
          doc.blocks.splice(bi + 1, 1);
          message = "Blocks merged.";
        }
        save();
        root.innerHTML = fixView(doc);
        status(message);
        root.querySelector<HTMLElement>(`#fix-${b.id} textarea`)?.focus();
        if (!root.querySelector(`#fix-${b.id}`))
          root.querySelector<HTMLButtonElement>("#done-fixing")?.focus();
      }
    } catch {
      status(
        "That action could not finish. Your worksheet is still here. Try downloading a copy.",
      );
    }
  };
  applyPreferences(p);
  show();
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("click", onClick);
  return () => {
    disposed = true;
    stop();
    root.removeEventListener("input", onInput);
    root.removeEventListener("change", onChange);
    root.removeEventListener("click", onClick);
  };
}
