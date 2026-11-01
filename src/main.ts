import "./style.css";
import { getSheet, listSheets, saveSheet, deleteSheet, local } from "./storage";
import { esc, defaults, applyPreferences, type Preferences } from "./ui/view";
import {
  languages,
  type Language,
  type Worksheet,
  isQuestion,
  answered,
} from "./parse/types";
const root = document.querySelector<HTMLElement>("#main")!;
let unmount: (() => void) | undefined,
  conversion: AbortController | undefined,
  busy = false,
  screen = "home",
  photos: File[] = [],
  photoURLs: string[] = [];
let preferences: Preferences = { ...defaults };
try {
  preferences = {
    ...defaults,
    ...JSON.parse(local.get("unflatten-preferences") || "{}"),
  };
} catch {}
applyPreferences(preferences);
const samples = [
  [
    "A",
    "Photosynthesis",
    "Image-only scan",
    "photosynthesis.pdf",
    "photosynthesis-scan.png",
  ],
  [
    "B",
    "The Water Cycle",
    "Two-column PDF",
    "water-cycle.pdf",
    "water-cycle-preview.png",
  ],
  [
    "C",
    "Fractions in the Kitchen",
    "Phone photo",
    "fractions.png",
    "fractions.png",
  ],
  [
    "D",
    "Rock Cycle Review",
    "Table + checkboxes",
    "rock-cycle.png",
    "rock-cycle.png",
  ],
];
function reset() {
  unmount?.();
  unmount = undefined;
  root.onclick = null;
  root.onchange = null;
  root.ondragover = null;
  root.ondrop = null;
  document.body.classList.remove("in-workspace");
  for (const url of photoURLs) URL.revokeObjectURL(url);
  photoURLs = [];
}
function focusMain() {
  root.focus();
  window.scrollTo(0, 0);
}
const language = () =>
  (document.querySelector<HTMLSelectElement>("#ocr-language")
    ?.value as Language) || "en";
async function showSheet(doc: Worksheet) {
  reset();
  screen = "worksheet";
  document.body.classList.add("in-workspace");
  local.set("unflatten-current", doc.id);
  document.title = `${doc.name} — Unflatten`;
  doc.updated = Date.now();
  const { mountWorksheet } = await import("./ui/controller");
  unmount = mountWorksheet(root, doc, preferences, {
    save: saveSheet,
    preferences: (p) => local.set("unflatten-preferences", JSON.stringify(p)),
    home: () => {
      local.remove("unflatten-current");
      history.replaceState(null, "", location.pathname + location.search);
      void home();
    },
    remove: async () => {
      await deleteSheet(doc.id);
      local.remove("unflatten-current");
      history.replaceState(null, "", location.pathname + location.search);
      await home();
      notice(
        "Worksheet and answers deleted from this device. Downloaded copies are separate files.",
      );
    },
    html: async (copy) => {
      const { exportHTML } = await import("./export");
      await exportHTML(copy, preferences);
    },
  });
  focusMain();
  try {
    await saveSheet(doc);
  } catch {
    notice(
      "Storage unavailable. Download an HTML copy to keep this worksheet.",
    );
  }
}
function notice(text: string, error = false) {
  const p = document.createElement("p");
  p.className = error ? "error" : "notice";
  p.setAttribute("role", error ? "alert" : "status");
  p.textContent = text;
  root.prepend(p);
}
async function convert(
  work: (p: (s: string) => void, signal: AbortSignal) => Promise<Worksheet>,
) {
  if (busy) return;
  busy = true;
  reset();
  screen = "processing";
  const controller = new AbortController();
  conversion = controller;
  root.innerHTML =
    '<section class="processing"><p class="eyebrow">FROM PICTURE TO PAGE</p><h1>Making room<br>for your answers.</h1><div class="processing-paper" aria-hidden="true"><span></span><span></span><span></span><i></i></div><p id="progress" role="status" aria-live="polite">Opening your worksheet on this device.</p><p>Your file stays here. Larger scans can take a moment.</p><button id="cancel">Cancel conversion</button></section>';
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
    } catch {}
    await showSheet(
      existing?.language === doc.language
        ? { ...existing, previews: existing.previews ?? doc.previews }
        : doc,
    );
  } catch (e) {
    if (!controller.signal.aborted) {
      await home();
      notice(
        `Could not convert this file. ${e instanceof Error ? e.message : "Try another file."}`,
        true,
      );
    }
  } finally {
    if (conversion === controller) {
      busy = false;
      conversion = undefined;
    }
  }
}
function fileWork(file: File) {
  const lang = language();
  void convert(async (p, s) =>
    (await import("./parse/input")).fromFile(file, lang, p, s),
  );
}
function hero() {
  return `<div class="hero-demo"><div class="demo-caption mono"><span>01 / THE SCAN</span><span>02 / YOUR PAGE</span></div><div class="demo-stage"><div class="demo-scan" aria-hidden="true"><b>Photosynthesis</b><p>Name: ______________</p><hr><p>1. What powers photosynthesis?</p><p>○ Sunlight</p><p>○ Moonlight</p><p>○ Soil</p><p>2. Plants take in ______.</p><div class="scan-bar"></div></div><section class="demo-page" aria-label="Interactive worksheet demonstration"><span class="demo-tag">A PICTURE, UNFLATTENED.</span><h2>Photosynthesis</h2><fieldset><legend>1. What powers photosynthesis?</legend><label class="choice"><input type="radio" name="demo-answer" value="Sunlight" checked><span>Sunlight</span><span class="selection-check" aria-hidden="true">✓</span></label><label class="choice"><input type="radio" name="demo-answer" value="Moonlight"><span>Moonlight</span><span class="selection-check" aria-hidden="true">✓</span></label><label class="choice"><input type="radio" name="demo-answer" value="Soil"><span>Soil</span><span class="selection-check" aria-hidden="true">✓</span></label></fieldset><label class="demo-blank">2. Plants take in<input aria-label="Demo: plants take in" placeholder="Your answer here"></label></section></div><div class="hear-demo"><h3>Hear the difference.</h3><div><button data-demo-speech="before">What a screen reader hears from a scan</button><button data-demo-speech="after" class="primary">After Unflatten <span aria-hidden="true">▶</span></button></div><p class="small">A demonstration using your device’s local voice.</p><p id="demo-status" role="status"></p></div></div>`;
}
function photoQueue() {
  const el = document.querySelector("#photo-queue");
  if (!el) return;
  for (const url of photoURLs) URL.revokeObjectURL(url);
  photoURLs = photos.map((f) => URL.createObjectURL(f));
  el.innerHTML = photos.length
    ? `<h3>Your pages, in order</h3><ol class="photo-list">${photos.map((f, i) => `<li><img src="${photoURLs[i]}" alt="Photo ${i + 1}: ${esc(f.name)}"><span>${i + 1}. ${esc(f.name)}</span><button data-photo-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move photo ${i + 1} up">↑</button><button data-photo-down="${i}" ${i === photos.length - 1 ? "disabled" : ""} aria-label="Move photo ${i + 1} down">↓</button><button data-photo-delete="${i}" aria-label="Remove photo ${i + 1}">Remove</button></li>`).join("")}</ol><label class="file-button">Add more photos<input id="more-photos" type="file" accept="image/png,image/jpeg" multiple></label><button id="convert-photos" class="primary">Convert ${photos.length} photo${photos.length === 1 ? "" : "s"}</button>`
    : "";
}
async function home() {
  reset();
  screen = "home";
  photos = [];
  document.title = "Unflatten — your worksheet, opened up";
  root.innerHTML = `<section class="home-hero"><div class="hero-copy"><p class="eyebrow">FREE. NO ACCOUNT. NOTHING UPLOADED.</p><h1>Your worksheet<br>is a picture.<br><span class="highlight-swipe">We make it</span><br><span class="highlight-swipe">a page.</span></h1><p class="hero-description">A screen reader can read it, a keyboard can fill it in,<br>and it still works offline.</p><section class="drop-zone" id="file-zone" aria-labelledby="drop-title"><h2 id="drop-title">Drop a PDF, photo or Word file</h2><p class="small">Or paste a screenshot with Ctrl / ⌘ + V. Up to 40 MB per file.</p><div class="actions"><label class="file-button primary">Choose file<input id="file" type="file" accept="application/pdf,image/png,image/jpeg,.docx,.txt" multiple></label><label class="file-button">Take a photo<input id="camera" type="file" accept="image/png,image/jpeg" capture="environment" multiple></label><button id="show-paste" aria-expanded="false">Paste text</button></div><div class="paste-box" hidden><label for="paste">Paste your worksheet, including its questions</label><textarea id="paste" rows="5" placeholder="A title, a question, a place to begin…"></textarea><button id="convert-text" class="primary">Make it accessible</button></div><div class="language-row"><label for="ocr-language">Worksheet language</label><select id="ocr-language">${Object.entries(
    languages,
  )
    .map(([v, [n]]) => `<option value="${v}">${n}</option>`)
    .join(
      "",
    )}</select></div><p class="small muted">English included offline. Other language packs load from this site on first use and are cached.</p><div id="photo-queue"></div></section><p class="privacy-line"><span aria-hidden="true">↳</span> Your files stay on this device. No account. No uploads.</p></div>${hero()}</section><section class="sample-section" aria-labelledby="samples-title"><div class="section-heading"><div><p class="eyebrow">START WITH A REAL CONVERSION</p><h2 id="samples-title">Try it on a real worksheet.</h2></div><p>Four original examples, converted live in your browser.</p></div><div class="samples">${samples.map(([letter, title, type, file, preview]) => `<article class="sample paper-card"><div class="sample-preview"><img src="./samples/${preview}" alt="Preview of ${title}" loading="lazy"><span class="sample-code">${letter}</span></div><div class="sample-content"><p class="eyebrow">${type}</p><h3>${title}</h3><button data-sample="${file}">Try ${title} <span aria-hidden="true">↗</span></button></div></article>`).join("")}</div></section><section id="saved" class="library-section" hidden aria-label="Saved worksheets"></section><section class="features-section"><p class="eyebrow">WHAT YOU GET</p><h2>Everything a flat worksheet can’t do.</h2><div class="feature-grid">${[
    [
      "01",
      "Listen, at your pace.",
      "A continuous reader, word highlighting and local device voices.",
    ],
    [
      "02",
      "Space to think.",
      "Six page colours, larger text, a reading ruler and a screen mask.",
    ],
    [
      "03",
      "A real place to answer.",
      "Keyboard-friendly questions, blanks, checkboxes and ruled tables.",
    ],
    [
      "04",
      "Take it with you.",
      "Accessible HTML, Word, EPUB, text and Grade 1 braille.",
    ],
  ]
    .map(
      ([n, h, t]) =>
        `<article><span class="feature-number">${n}</span><h3>${h}</h3><p>${t}</p></article>`,
    )
    .join("")}</div></section>`;
  root.onchange = (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    const files = [...input.files];
    if (
      ["camera", "more-photos"].includes(input.id) ||
      (input.id === "file" &&
        files.length > 1 &&
        files.every((f) => f.type.startsWith("image/")))
    ) {
      photos.push(...files);
      photoQueue();
      input.value = "";
    } else if (input.id === "file") fileWork(files[0]);
  };
  root.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    void (async () => {
      try {
        if (b.id === "show-paste") {
          const box = root.querySelector<HTMLElement>(".paste-box")!;
          box.hidden = !box.hidden;
          b.setAttribute("aria-expanded", String(!box.hidden));
          if (!box.hidden)
            root.querySelector<HTMLTextAreaElement>("#paste")!.focus();
        }
        if (b.id === "convert-text") {
          const input = root.querySelector<HTMLTextAreaElement>("#paste")!,
            text = input.value,
            lang = language();
          if (!text.trim()) {
            document.querySelector("#paste-error")?.remove();
            const p = document.createElement("p");
            p.id = "paste-error";
            p.className = "error";
            p.setAttribute("role", "alert");
            p.textContent = "Paste some worksheet text first.";
            input.after(p);
            input.setAttribute("aria-describedby", p.id);
            input.focus();
            return;
          }
          void convert(async () =>
            (await import("./parse/input")).fromText(text, lang),
          );
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
                "Sample unavailable. Wait for offline setup or use a file.",
              );
            return (await import("./parse/input")).fromFile(
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
          const doc = await getSheet(b.dataset.resume);
          if (doc) await showSheet(doc);
        }
        if (b.dataset.delete) {
          await deleteSheet(b.dataset.delete);
          await home();
          notice("Worksheet deleted from this device.");
        }
        if (
          b.hasAttribute("data-photo-up") ||
          b.hasAttribute("data-photo-down")
        ) {
          const up = b.hasAttribute("data-photo-up"),
            i = Number(up ? b.dataset.photoUp : b.dataset.photoDown),
            j = i + (up ? -1 : 1);
          [photos[i], photos[j]] = [photos[j], photos[i]];
          photoQueue();
        }
        if (b.hasAttribute("data-photo-delete")) {
          photos.splice(Number(b.dataset.photoDelete), 1);
          photoQueue();
        }
        if (b.id === "convert-photos") {
          const files = [...photos],
            lang = language();
          void convert(async (p, s) =>
            (await import("./parse/input")).fromPhotos(files, lang, p, s),
          );
        }
        if (b.dataset.demoSpeech) {
          const status = document.querySelector("#demo-status")!;
          if (!("speechSynthesis" in window)) {
            status.textContent = "Speech is not supported in this browser.";
            return;
          }
          const voice = speechSynthesis
            .getVoices()
            .find((v) => v.localService && v.lang.startsWith("en"));
          if (!voice) {
            status.textContent =
              "Install a local English device voice to hear this demonstration.";
            return;
          }
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(
            b.dataset.demoSpeech === "before"
              ? "Image."
              : "What powers photosynthesis? Option A, Sunlight. Option B, Moonlight. Option C, Soil.",
          );
          u.voice = voice;
          speechSynthesis.speak(u);
          status.textContent =
            "Playing a demonstration with your device’s local voice.";
        }
      } catch (e) {
        notice(
          e instanceof Error ? e.message : "That action could not finish.",
          true,
        );
      }
    })();
  };
  root.ondragover = (e) => {
    e.preventDefault();
    root.querySelector("#file-zone")?.classList.add("drag-over");
  };
  root.ondrop = (e) => {
    e.preventDefault();
    root.querySelector("#file-zone")?.classList.remove("drag-over");
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length > 1 && files.every((f) => f.type.startsWith("image/"))) {
      photos.push(...files);
      photoQueue();
    } else if (files[0]) fileWork(files[0]);
  };
  try {
    const docs = (await listSheets()).sort((a, b) => b.updated - a.updated),
      el = document.querySelector("#saved");
    if (el && docs.length) {
      el.removeAttribute("hidden");
      el.innerHTML = `<div class="section-heading"><div><p class="eyebrow">SAVED ON THIS DEVICE</p><h2>Your worksheet shelf.</h2></div><p>Pick up where you left off.</p></div><div class="library-grid">${docs.map((d) => `<article class="library-card"><div class="library-preview">${d.previews?.[0] ? `<img src="${esc(d.previews[0].image)}" alt="${esc(d.name)} preview" loading="lazy">` : `<strong>${esc(d.name)}</strong><p>${esc(d.blocks.find(isQuestion)?.text ?? "Ready to read")}</p><hr><hr><hr>`}</div><div><h3>${esc(d.name)}</h3><p class="mono">${d.blocks.filter((b) => isQuestion(b) && answered(b, d.answers)).length} / ${d.blocks.filter(isQuestion).length} answered</p><p class="small">Last opened ${new Date(d.updated).toLocaleDateString()}</p><div class="actions"><button data-resume="${d.id}">Open worksheet</button><button data-delete="${d.id}" aria-label="Delete ${esc(d.name)}">Delete</button></div></div></article>`).join("")}</div>`;
    }
  } catch {}
}
async function info(teachers = false) {
  reset();
  screen = teachers ? "teachers" : "about";
  document.title = (teachers ? "For teachers" : "About") + " — Unflatten";
  const { infoView } = await import("./ui/info");
  root.innerHTML = infoView(teachers);
  root.onclick = (e) => {
    if ((e.target as HTMLElement).closest("#back-home")) void home();
  };
  focusMain();
}
function navigate(fn: () => void) {
  conversion?.abort();
  busy = false;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  fn();
}
document.querySelector("#home-link")!.addEventListener("click", () =>
  navigate(() => {
    local.remove("unflatten-current");
    history.replaceState(null, "", location.pathname + location.search);
    void home();
  }),
);
document
  .querySelector("#about-link")!
  .addEventListener("click", () => navigate(() => void info()));
document
  .querySelector("#teachers-link")!
  .addEventListener("click", () => navigate(() => void info(true)));
document.addEventListener("paste", (e) => {
  if (screen !== "home") return;
  const file = [...(e.clipboardData?.items ?? [])]
    .find((i) => i.type.startsWith("image/"))
    ?.getAsFile();
  if (file) {
    e.preventDefault();
    fileWork(file);
  }
});
async function start() {
  if (location.hash.startsWith("#worksheet=")) {
    try {
      const { unpackShare } = await import("./features/share");
      const doc = unpackShare(location.hash);
      await showSheet(doc);
      return;
    } catch (e) {
      await home();
      notice(
        e instanceof Error ? e.message : "Could not open shared worksheet.",
        true,
      );
      return;
    }
  }
  const current = local.get("unflatten-current");
  if (current)
    try {
      const doc = await getSheet(current);
      if (doc) {
        await showSheet(doc);
        return;
      }
    } catch {}
  await home();
}
void start();
if ("serviceWorker" in navigator && import.meta.env.PROD)
  void navigator.serviceWorker
    .register(new URL("./sw.js", document.baseURI), { scope: "./" })
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      document.querySelector("#offline-status")!.textContent = "Ready offline";
      document
        .querySelector("#offline-status")!
        .setAttribute(
          "title",
          "English conversion and core tools are cached. Other languages and dictionary cache after first use.",
        );
      document.querySelector("#offline-status")!.classList.add("ready");
    })
    .catch(
      () =>
        (document.querySelector("#offline-status")!.textContent =
          "Offline setup unavailable"),
    );
else
  document.querySelector("#offline-status")!.textContent =
    "Works offline · after setup";
