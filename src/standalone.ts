import { mountWorksheet, download } from "./ui/controller";
import { defaults, type Preferences } from "./ui/view";
import type { Worksheet } from "./parse/types";
const seed = JSON.parse(
  document.querySelector("#worksheet-data")!.textContent!,
) as {
  doc: Worksheet;
  p: Preferences;
  instance: string;
  resources: Record<string, unknown>;
  licence: string;
};
(
  globalThis as unknown as { unflattenResources: Record<string, unknown> }
).unflattenResources = seed.resources;
let doc = seed.doc;
const p = { ...defaults, ...seed.p };
const key = `unflatten-export-${seed.instance}`;
try {
  const saved = JSON.parse(localStorage.getItem(key) || "null");
  if (saved?.id === doc.id && saved.updated > doc.updated) doc = saved;
} catch {}
mountWorksheet(document.querySelector("#main")!, doc, p, {
  standalone: true,
  save: () => {
    localStorage.setItem(key, JSON.stringify(doc));
  },
  preferences: () => {},
  html: async (copy) => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelector("#worksheet-data")!.textContent = JSON.stringify({
      ...seed,
      doc: copy,
      p,
      instance: crypto.randomUUID(),
    })
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");
    download(
      "accessible-worksheet.html",
      "<!doctype html>" + clone.outerHTML,
      "text/html;charset=utf-8",
    );
  },
});
