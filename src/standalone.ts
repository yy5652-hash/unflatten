import { mountWorksheet, download } from "./ui/controller";
import { defaults } from "./ui/view";
import { migrateWorksheet } from "./features/worksheet";
import { standaloneDocument, type StandaloneSeed } from "./standalone-document";
const seed = JSON.parse(
  document.querySelector("#worksheet-data")!.textContent!,
) as StandaloneSeed;
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
doc = migrateWorksheet(doc);
mountWorksheet(document.querySelector("#main")!, doc, p, {
  standalone: true,
  save: () => {
    localStorage.setItem(key, JSON.stringify(doc));
  },
  preferences: () => {},
  html: async (copy) => {
    const html = standaloneDocument({
      ...seed,
      doc: copy,
      p,
      instance: crypto.randomUUID(),
    }, document.querySelector("#worksheet-style")!.textContent!,
      document.querySelector("#worksheet-runtime")!.textContent!);
    download(
      "accessible-worksheet.html",
      html,
      "text/html;charset=utf-8",
    );
  },
});
