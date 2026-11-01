import "./style.css";
import { fromFile, fromText } from "./parse/input";
import { getSheet, listSheets, saveSheet, deleteSheet, local } from "./storage";
import { mountWorksheet } from "./ui/controller";
import { esc, defaults, applyPreferences, type Preferences } from "./ui/view";
import type { Worksheet } from "./parse/types";
const root = document.querySelector<HTMLElement>("#main")!;
let unmount: undefined | (() => void);
let conversion: AbortController | undefined;
let busy = false;
let preferences: Preferences = { ...defaults };
try {
  preferences = {
    ...defaults,
    ...JSON.parse(local.get("unflatten-preferences") || "{}"),
  };
} catch {
  /* Use defaults. */
}
applyPreferences(preferences);
const samples = [
  [
    "A",
    "Photosynthesis",
    "Image-only scan",
    "Science questions, brought back to life.",
    "photosynthesis.pdf",
  ],
  [
    "B",
    "The Water Cycle",
    "Two-column PDF",
    "Two columns, one sensible reading order.",
    "water-cycle.pdf",
  ],
  [
    "C",
    "Fractions in the Kitchen",
    "Phone photo",
    "Everyday maths, with space to answer.",
    "fractions.png",
  ],
];
function reset() {
  unmount?.();
  unmount = undefined;
  root.onclick = null;
  root.onchange = null;
  root.ondragover = null;
  root.ondrop = null;
}
function focusMain() {
  root.focus();
  window.scrollTo(0, 0);
}
async function showSheet(doc: Worksheet) {
  reset();
  local.set("unflatten-current", doc.id);
  document.title = `${doc.name} — Unflatten`;
  unmount = mountWorksheet(root, doc, preferences, {
    save: saveSheet,
    preferences: (p) => local.set("unflatten-preferences", JSON.stringify(p)),
    home: () => {
      local.remove("unflatten-current");
      void home();
    },
    remove: async () => {
      await deleteSheet(doc.id);
      local.remove("unflatten-current");
      await home();
      const notice = document.createElement("p");
      notice.className = "notice";
      notice.setAttribute("role", "status");
      notice.textContent =
        "Worksheet and answers deleted from this device. Downloaded copies are separate files.";
      root.prepend(notice);
    },
    html: async () => {
      const { exportHTML } = await import("./export");
      await exportHTML(doc, preferences);
    },
  });
  focusMain();
}
async function convert(
  work: (p: (s: string) => void, signal: AbortSignal) => Promise<Worksheet>,
) {
  if (busy) return;
  busy = true;
  reset();
  conversion = new AbortController();
  const controller = conversion;
  root.innerHTML = `<section class="processing"><p class="eyebrow">ONE PAGE AT A TIME</p><h1>Making room for your answers.</h1><p id="progress" role="status" aria-live="polite" aria-atomic="true">Opening your worksheet on this device.</p><div class="progress-track" aria-hidden="true"></div><p class="muted">Your file stays here. The first scan can take a little longer while the reading engine gets ready.</p><button id="cancel">Cancel conversion</button></section>`;
  focusMain();
  document.querySelector<HTMLButtonElement>("#cancel")!.onclick = () => {
    controller.abort();
    busy = false;
    void home();
  };
  try {
    const doc = await work((s) => {
      const el = document.querySelector("#progress");
      if (el) el.textContent = s;
    }, controller.signal);
    if (controller.signal.aborted) return;
    let existing: Worksheet | undefined;
    try {
      existing = await getSheet(doc.id);
    } catch {
      /* Save failure is reported below. */
    }
    const restored =
      existing && existing.language === doc.language ? existing : doc;
    let failed = false;
    try {
      await saveSheet(restored);
    } catch {
      failed = true;
    }
    await showSheet(restored);
    if (failed)
      document.querySelector("#action-status")!.textContent =
        "Device storage is unavailable. Download an HTML copy to keep your work.";
  } catch (error) {
    if (!controller.signal.aborted) {
      await home();
      const p = document.createElement("p");
      p.className = "error";
      p.setAttribute("role", "alert");
      p.textContent = `Could not convert this file. ${error instanceof Error ? error.message : "Try another file."}`;
      root.prepend(p);
      focusMain();
    }
  } finally {
    if (conversion === controller) {
      busy = false;
      conversion = undefined;
    }
  }
}
async function home() {
  reset();
  document.title = "Unflatten — a worksheet you can use";
  root.innerHTML = `<section class="intro"><p class="eyebrow">A WORKSHEET YOU CAN USE</p><h1>Any worksheet, ready for your screen reader.</h1><p>Turn a scanned worksheet into a page you can read, navigate and fill in.</p><p class="privacy-line">Your file stays on this device. No account. No uploads.</p></section><div class="language-row"><label for="ocr-language">Worksheet / OCR language</label><select id="ocr-language"><option value="en">English</option><option value="es">Spanish</option></select><span class="small muted">English works offline. Spanish downloads once, from this site.</span></div><div class="input-grid"><section class="input-card"><span class="step" aria-hidden="true">01</span><h2>Start with a file</h2><p class="muted small">A PDF, scan or photo of a printed worksheet.</p><div class="file-zone" id="file-zone"><label for="file">Choose your worksheet</label><input id="file" type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"><small>Or drop a file here · up to 40 MB</small><label class="small" for="camera">Take a photo</label><input id="camera" type="file" accept="image/*" capture="environment"></div></section><section class="input-card"><span class="step" aria-hidden="true">02</span><h2>Or start with text</h2><label for="paste" class="small muted">Paste the worksheet, including its questions.</label><textarea id="paste" placeholder="A title, a question, a place to begin…" rows="4"></textarea><button id="convert-text" class="primary">Make it accessible</button></section></div><section aria-labelledby="sample-title"><div class="samples-heading"><h2 id="sample-title">Try a worksheet</h2><p class="muted small">Three original examples. The real conversion.</p></div><div class="samples">${samples.map(([letter, title, type, desc, file]) => `<article class="sample"><p class="sample-label">${letter} / ${type.toUpperCase()}</p><h3>${title}</h3><p>${desc}</p><button data-sample="${file}">Try ${title}</button></article>`).join("")}</div></section><section id="saved" class="resume" hidden aria-label="Saved worksheets"></section>`;
  const language = () =>
    document.querySelector<HTMLSelectElement>("#ocr-language")!.value as
      "en" | "es";
  const handle = (file: File) => {
    const lang = language();
    void convert((progress, signal) => fromFile(file, lang, progress, signal));
  };
  root.onchange = (event) => {
    const input = event.target as HTMLInputElement;
    if (["file", "camera"].includes(input.id) && input.files?.[0])
      handle(input.files[0]);
  };
  root.onclick = (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!b) return;
    if (b.id === "convert-text") {
      const box = document.querySelector<HTMLTextAreaElement>("#paste")!,
        text = box.value,
        lang = language();
      // An empty box is a slip, not a failed conversion: stay here and say so beside the field.
      if (!text.trim()) {
        document.querySelector("#paste-error")?.remove();
        const p = document.createElement("p");
        p.id = "paste-error";
        p.className = "error";
        p.setAttribute("role", "alert");
        p.textContent = "Paste some worksheet text first.";
        box.after(p);
        box.setAttribute("aria-invalid", "true");
        box.setAttribute("aria-describedby", p.id);
        box.focus();
        return;
      }
      void convert(() => fromText(text, lang));
    }
    if (b.dataset.sample) {
      const path = b.dataset.sample,
        lang = language();
      void convert(async (progress, signal) => {
        const res = await fetch(
          new URL(`./samples/${path}`, document.baseURI),
          { signal },
        );
        if (!res.ok)
          throw Error(
            "The sample is not available yet. Wait for offline access to finish or use your own file.",
          );
        return fromFile(
          new File([await res.blob()], path, {
            type: path.endsWith(".pdf") ? "application/pdf" : "image/png",
          }),
          lang,
          progress,
          signal,
        );
      });
    }
    if (b.dataset.resume) {
      void getSheet(b.dataset.resume).then((doc) => {
        if (doc) void showSheet(doc);
      });
    }
  };
  root.ondragover = (e) => {
    e.preventDefault();
  };
  root.ondrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files[0]) handle(e.dataTransfer.files[0]);
  };
  try {
    const docs = (await listSheets()).sort((a, b) => b.updated - a.updated);
    const saved = document.querySelector<HTMLElement>("#saved");
    if (saved && docs.length) {
      saved.hidden = false;
      saved.innerHTML = `<h2>Pick up where you left off</h2><ul>${docs.map((d) => `<li><button data-resume="${d.id}">${esc(d.name)}</button></li>`).join("")}</ul>`;
    }
  } catch {
    /* File conversion still works without storage. */
  }
}
function about() {
  reset();
  root.innerHTML = `<article class="about"><p class="eyebrow">ABOUT UNFLATTEN</p><h1>A page should never be a barrier.</h1><p>A scanned worksheet can be silent to a screen reader. A photo can have no place to type. Unflatten turns printed text into an ordered, fillable web worksheet for blind, low-vision and dyslexic students.</p><section><h2>How it works</h2><p>PDF.js reads a PDF’s text and positions. When a page has no useful text, Tesseract recognises the image on your device. Answer blanks are found as ink in the page image, because OCR reads them as nothing. A whitespace-based column detector puts lines in reading order; worksheet rules create headings and labelled questions.</p><p>Recognition is imperfect. Lines below 80% confidence are marked for review. Fix mode shows the original line and lets you edit, change kinds, merge or delete blocks. Figures need a person’s description.</p></section><section><h2>Your file stays here</h2><p>No accounts, analytics, uploads or external runtime requests. Files are processed in your browser. Converted text, line crops and answers are saved in this browser’s IndexedDB. Reading preferences are saved locally. Delete a worksheet to remove its saved content; downloaded copies must be deleted separately.</p><p>After “Ready offline” appears, English conversion works without a connection. Spanish language data is fetched from this same site when first used, then cached. Clearing site data removes worksheets, preferences and offline assets. Private browsing or device storage limits can prevent saving.</p><p>Read aloud uses installed, local device voices only. If no local voice matches, we explain how to add one without sending text to a speech service.</p></section><section><h2>What we built</h2><p>Built from 1 November 2026 for AccessED Hacks: the reading-order and classification pipeline, accessible worksheet controls, review workflow, offline packaging, local persistence, exports, synthetic samples and tests. There was no pre-existing application in this repository.</p><h2>Credits & AI assistance</h2><p>PDF.js (Apache-2.0), Tesseract.js and Tesseract language models (Apache-2.0), Atkinson Hyperlegible by the Braille Institute via Fontsource (OFL-1.1), and Vite (MIT). LiteParse’s approach was reviewed; its code is not included. Unflatten’s original code and samples are MIT licensed.</p><p>Built with AI assistance from OpenAI Codex and Claude Code. Tests document what has been verified; human review is still needed.</p></section><section><h2>What still needs work</h2><p>Math notation, handwriting, complex tables, irregular layouts, describing diagrams and braille output. OCR confidence is a clue, not a guarantee. Keep the source worksheet and check the conversion.</p><p>Older phones may take longer to recognise scans. A modern browser with WebAssembly is required; real assistive-technology and older-device testing remains important.</p></section><button id="back-home" class="primary">Back to workspace</button></article>`;
  root.onclick = (e) => {
    if ((e.target as HTMLElement).id === "back-home") void home();
  };
  focusMain();
}
document.querySelector("#home-link")!.addEventListener("click", () => {
  conversion?.abort();
  busy = false;
  local.remove("unflatten-current");
  void home();
});
document.querySelector("#about-link")!.addEventListener("click", () => {
  conversion?.abort();
  busy = false;
  about();
});
async function start() {
  const current = local.get("unflatten-current");
  if (current) {
    try {
      const doc = await getSheet(current);
      if (doc) {
        await showSheet(doc);
        return;
      }
    } catch {
      /* Open home when storage is unavailable. */
    }
  }
  await home();
}
void start();
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker
    .register(new URL("./sw.js", document.baseURI), { scope: "./" })
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      document.querySelector("#offline-status")!.textContent =
        "Ready offline · English included";
    })
    .catch(() => {
      document.querySelector("#offline-status")!.textContent =
        "Offline setup unavailable. Keep this page open.";
    });
} else
  document.querySelector("#offline-status")!.textContent = import.meta.env.DEV
    ? "Local development · offline mode in production build"
    : "Offline storage is unavailable in this browser";
