import "./style.css";
import { getSheet, listSheets, saveSheet, deleteSheet, local } from "./storage";
import { esc, defaults, applyPreferences, type Preferences } from "./ui/view";
import {
  languages,
  type Language,
  type Worksheet,
  isQuestion,
  answered,
  answerKeys,
} from "./parse/types";
const root = document.querySelector<HTMLElement>("#main")!;
let pageCleanup: (() => void) | undefined;
let conversionPreview = "";
let unmount: (() => void) | undefined,
  conversion: AbortController | undefined,
  busy = false,
  screen = "home",
  photos: File[] = [],
  photoURLs: string[] = [];
const photoSelections = new WeakMap<
  File,
  { corners?: import("./parse/vision").Quad | null }
>();
let photoQueueVersion = 0;
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
    "Photosynthesis: scan → form",
    "photosynthesis.pdf",
    "photosynthesis-scan.png",
  ],
  [
    "B",
    "The Water Cycle",
    "Water Cycle: two columns",
    "water-cycle.pdf",
    "water-cycle-preview.png",
  ],
  [
    "C",
    "Fractions in the Kitchen",
    "Fractions: math read aloud",
    "fractions.png",
    "fractions.png",
  ],
  [
    "D",
    "Rock Cycle Review",
    "Rock Cycle: table + checkboxes",
    "rock-cycle.png",
    "rock-cycle.png",
  ],
];
function reset() {
  pageCleanup?.();
  pageCleanup = undefined;
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
  root.querySelector<HTMLElement>("#worksheet h1")?.focus();
  window.scrollTo(0, 0);
  setTimeout(() => {
    const status = root.querySelector("#action-status");
    if (status)
      status.textContent = `${doc.blocks.filter(isQuestion).length} questions, ${doc.blocks.reduce((n, b) => n + answerKeys(b).length, 0)} fields. Press Tab to start.`;
  }, 100);
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
  root.innerHTML = `<section class="processing"><h1>Opening your worksheet.</h1><div class="processing-paper" aria-hidden="true">${conversionPreview ? `<img src="${esc(conversionPreview)}" alt="">` : "<span>Your worksheet</span>"}<i></i></div><p id="progress" role="status" aria-live="polite">Reading your file on this device.</p><ol id="conversion-stages"><li data-stage="reading" aria-current="step">Reading</li><li data-stage="recognising">Recognising text, when needed</li><li data-stage="blanks">Finding blanks</li><li data-stage="order">Reading order</li><li data-stage="building">Building your page</li></ol><p>Your file stays here. Larger scans can take a moment.</p><button id="cancel">Cancel conversion</button></section>`;
  focusMain();
  document.querySelector<HTMLButtonElement>("#cancel")!.onclick = () => {
    controller.abort();
    busy = false;
    void home();
  };
  try {
    let lastStage = "";
    const report = (message: string, stage: string) => {
      if (lastStage === stage) return;
      lastStage = stage;
      const el = document.querySelector("#progress");
      if (el) el.textContent = message;
      root.querySelectorAll<HTMLElement>("[data-stage]").forEach((el) => {
        if (el.dataset.stage === stage) el.setAttribute("aria-current", "step");
        else el.removeAttribute("aria-current");
      });
    };
    const doc = await work((message) => {
      const stage = /reading order/i.test(message)
        ? "order"
        : /recognition|reading the image/i.test(message)
          ? "recognising"
          : /blank|field|rule/i.test(message)
            ? "blanks"
            : "reading";
      report(message.replace(/, \d+ percent\./g, "."), stage);
    }, controller.signal);
    if (doc.previews?.[0]) {
      const paper = root.querySelector(".processing-paper");
      if (paper)
        paper.innerHTML = `<img src="${esc(doc.previews[0].image)}" alt=""><i></i>`;
    }
    report("Finding blanks: answer fields identified.", "blanks");
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    report("Reading order ready.", "order");
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    report("Building your accessible page.", "building");
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
  conversionPreview = file.type.startsWith("image/")
    ? URL.createObjectURL(file)
    : "";
  const preview = conversionPreview;
  void convert(async (p, s) => {
    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      const image = await (
        await import("./ui/source-preview")
      ).pdfPreview(file, s);
      const paper = root.querySelector(".processing-paper");
      if (image && paper && !s.aborted)
        paper.innerHTML = `<img src="${esc(image)}" alt=""><i></i>`;
    }
    if (
      (file.type === "text/plain" ||
        file.name.toLowerCase().endsWith(".txt")) &&
      file.size <= 40 * 1024 * 1024
    ) {
      const text = await file.text(),
        paper = root.querySelector(".processing-paper");
      if (paper && !s.aborted)
        paper.innerHTML = `<pre>${esc(text)}</pre><i></i>`;
    }
    return (await import("./parse/input")).fromFile(file, lang, p, s);
  }).finally(() => {
    if (preview) URL.revokeObjectURL(preview);
    conversionPreview = "";
  });
}
function hero() {
  return `<div class="hero-demo" id="hero-art"><img class="demo-scan" src="./samples/photosynthesis-scan.png" alt="Original synthetic photosynthesis worksheet"><section class="demo-page" aria-label="Preview: a scan converted to a labelled multiple-choice question with Sunlight selected."><p class="preview-label">Preview</p><div inert aria-hidden="true"><h2>Photosynthesis</h2><fieldset><legend>1. What powers photosynthesis?</legend>${["Sunlight", "Moonlight", "Soil"].map((v, i) => `<label class="choice"><input type="radio" name="demo-answer" ${i === 0 ? "checked" : ""}><span>${v}</span></label>`).join("")}</fieldset></div></section></div>`;
}
function beforeAfter() {
  return `<section class="before-after" aria-labelledby="difference-title"><img src="./samples/photosynthesis-scan.png" alt="Original photosynthesis scan" loading="lazy"><div><h2 id="difference-title">Hear the difference.</h2><section class="strip-converted" aria-label="After: converted sample"><h3>Photosynthesis</h3><fieldset><legend>1. What powers photosynthesis?</legend><label><input type="radio" name="strip-answer"> Sunlight</label><label><input type="radio" name="strip-answer"> Moonlight</label><label><input type="radio" name="strip-answer"> Soil</label></fieldset></section><div class="actions"><button data-demo-speech="before" aria-describedby="simulation-note">Simulated example: what a screen reader hears from a scan</button><button data-demo-speech="after">After Unflatten</button></div><p class="small" id="simulation-note">Simulated with your device voice — not a screen reader recording.</p><p id="demo-status" role="status"></p></div></section>`;
}
function photoQueue() {
  const el = document.querySelector("#photo-queue");
  if (!el) return;
  for (const url of photoURLs) URL.revokeObjectURL(url);
  photoURLs = photos.map((f) => URL.createObjectURL(f));
  el.innerHTML = photos.length
    ? `<h3>Your pages, in order</h3><ol class="photo-list">${photos.map((f, i) => `<li><div class="photo-corners" data-photo-corners="${i}"><img src="${photoURLs[i]}" alt="Photo ${i + 1}: ${esc(f.name)}"></div><span>${i + 1}. ${esc(f.name)}</span><button data-photo-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move photo ${i + 1} up">↑</button><button data-photo-down="${i}" ${i === photos.length - 1 ? "disabled" : ""} aria-label="Move photo ${i + 1} down">↓</button><button data-photo-delete="${i}" aria-label="Remove photo ${i + 1}">Remove</button></li>`).join("")}</ol><label class="file-button">Add more photos<input id="more-photos" type="file" accept="image/png,image/jpeg" multiple></label><button id="convert-photos" class="primary">Convert ${photos.length} photo${photos.length === 1 ? "" : "s"}</button>`
    : "";
  const version = ++photoQueueVersion;
  void import("./features/photo").then(async ({ mountCorners }) => {
    for (const [i, file] of photos.entries()) {
      const container = el.querySelector<HTMLElement>(
        `[data-photo-corners="${i}"]`,
      );
      if (!container || version !== photoQueueVersion) return;
      const selection = photoSelections.get(file) ?? {};
      photoSelections.set(file, selection);
      try {
        await mountCorners(
          container,
          file,
          selection,
          () => version === photoQueueVersion && container.isConnected,
        );
      } catch (e) {
        notice(e instanceof Error ? e.message : "Could not read this photo.");
      }
    }
  });
}
async function home() {
  reset();
  screen = "home";
  conversionPreview = "";
  photos = [];
  document.title = "Unflatten — your worksheet, opened up";
  root.innerHTML = `<section class="home-hero"><div class="hero-copy"><h1>Your worksheet<br>is a picture.<br><span>We make it a page.</span></h1><p class="hero-description">Read by a screen reader. Filled in by keyboard. Offline, with nothing uploaded.</p><button class="primary try-scan" data-sample="photosynthesis.pdf">Try a scanned worksheet — 30 seconds</button><section class="drop-zone" id="file-zone" aria-labelledby="drop-title"><h2 id="drop-title">Drop a PDF, photo or Word file</h2><p class="small">Or paste a screenshot with Ctrl / ⌘ + V. Up to 40 MB per file.</p><div class="actions"><label class="file-button">Choose file<input id="file" type="file" accept="application/pdf,image/png,image/jpeg,.docx,.txt" multiple></label><label class="file-button">Take a photo<input id="camera" type="file" accept="image/png,image/jpeg" capture="environment" multiple></label><button id="show-paste" aria-expanded="false">Paste text</button></div><div class="paste-box" hidden><label for="paste">Paste your worksheet, including its questions</label><textarea id="paste" rows="5" placeholder="A title, a question, a place to begin…"></textarea><button id="convert-text" class="primary">Make it accessible</button></div><div class="language-row"><label for="ocr-language">Worksheet language</label><select id="ocr-language">${Object.entries(
    languages,
  )
    .map(([v, [n]]) => `<option value="${v}">${n}</option>`)
    .join(
      "",
    )}</select></div><p class="small muted">English included offline. Other language packs load from this site on first use and are cached.</p><div id="photo-queue"></div></section><div class="sample-chips" aria-label="Try a sample"><span>Or try one:</span>${samples.map(([, title, proof, file]) => `<button data-sample="${file}" aria-label="Try ${title}: ${proof.split(": ")[1]}">${proof}</button>`).join("")}</div></div><div class="home-right">${hero()}<section id="saved" class="library-section" hidden aria-label="Your worksheets"></section></div></section>${beforeAfter()}<section class="home-points" aria-label="What you can do"><p><strong>Listen at your pace.</strong> Local voices and word highlighting.</p><p><strong>Make room to think.</strong> Page colours, spacing and one question at a time.</p><p><strong>Take your answers with you.</strong> Accessible files for the way you work.</p></section>`;
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
          void convert(async () => {
            const paper = root.querySelector(".processing-paper");
            if (paper) paper.innerHTML = `<pre>${esc(text)}</pre><i></i>`;
            return (await import("./parse/input")).fromText(text, lang);
          });
        }
        if (b.dataset.sample) {
          const path = b.dataset.sample,
            lang = language();
          conversionPreview = `./samples/${samples.find((item) => item[3] === path)?.[4] || "photosynthesis-scan.png"}`;
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
          const preview = URL.createObjectURL(files[0]);
          conversionPreview = preview;
          void convert(async (p, s) =>
            (await import("./parse/input")).fromPhotos(
              files,
              lang,
              p,
              s,
              files.map((f) => photoSelections.get(f)?.corners),
            ),
          ).finally(() => {
            URL.revokeObjectURL(preview);
            conversionPreview = "";
          });
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
            "Playing a simulated example with your device’s local voice, not a screen reader recording.";
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
      root.querySelector("#hero-art")?.setAttribute("hidden", "");
      el.innerHTML = `<div class="section-heading"><div><p class="eyebrow">SAVED ON THIS DEVICE</p><h2>Your worksheets</h2></div><p>Pick up where you left off.</p></div><div class="library-grid">${docs.map((d) => `<article class="library-card"><div class="library-preview">${d.previews?.[0] ? `<img src="${esc(d.previews[0].image)}" alt="${esc(d.name)} preview" loading="lazy">` : `<strong>${esc(d.name)}</strong><p>${esc(d.blocks.find(isQuestion)?.text ?? "Ready to read")}</p><hr><hr><hr>`}</div><div><h3>${esc(d.name)}</h3><p class="mono">${d.blocks.filter((b) => isQuestion(b) && answered(b, d.answers)).length} / ${d.blocks.filter(isQuestion).length} answered</p><p class="small">Last opened ${new Date(d.updated).toLocaleDateString()}</p><div class="actions"><button data-resume="${d.id}">Open worksheet</button><button data-delete="${d.id}" aria-label="Delete ${esc(d.name)}">Delete</button></div></div></article>`).join("")}</div>`;
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
  if (["#privacy", "#accessibility", "#terms"].includes(location.hash)) {
    await legal(location.hash.slice(1));
    return;
  }
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
document.addEventListener("click", (e) => {
  const link = (e.target as HTMLElement).closest<HTMLAnchorElement>(
    "[data-info]",
  );
  if (!link) return;
  e.preventDefault();
  const page = link.dataset.info!;
  history.replaceState(null, "", `#${page}`);
  navigate(() => {
    if (page === "teachers") {
      void info(true);
      return;
    }
    if (page === "about") {
      void info();
      return;
    }
    void legal(page);
  });
});
async function legal(page: string) {
  reset();
  screen = page;
  const { legalView, requestCount } = await import("./ui/legal");
  root.innerHTML = legalView(page);
  document.title = `${page === "accessibility" ? "Accessibility" : page === "terms" ? "Terms" : "Privacy"} — Unflatten`;
  root.onclick = (e) => {
    if ((e.target as HTMLElement).closest("#back-home")) {
      history.replaceState(null, "", location.pathname + location.search);
      void home();
    }
  };
  const update = () => {
    const el = root.querySelector("#request-count");
    if (el) el.textContent = String(requestCount());
  };
  update();
  if (page === "privacy") {
    const observer = new PerformanceObserver(update);
    observer.observe({ type: "resource", buffered: true });
    pageCleanup = () => observer.disconnect();
  }
  focusMain();
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
