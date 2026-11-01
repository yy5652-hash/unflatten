import css from "./style.css?raw";
import { esc, type Preferences } from "./ui/view";
import type { Worksheet } from "./parse/types";
import { download } from "./ui/controller";
const json = (data: unknown) =>
  JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
export async function exportHTML(doc: Worksheet, p: Preferences) {
  const fetchAsset = async (path: string) => {
    const r = await fetch(new URL("./" + path, document.baseURI));
    if (!r.ok)
      throw Error(
        `Export asset unavailable: ${path}. Connect once to finish offline setup.`,
      );
    return r;
  };
  const runtime = await (await fetchAsset("export-runtime.js")).text();
  let styles = css;
  for (const name of ["atkinson-next", "atkinson-mono"]) {
    const bytes = new Uint8Array(
      await (await fetchAsset(`vendor/fonts/${name}.woff2`)).arrayBuffer(),
    );
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    styles = styles.replace(
      `../public/vendor/fonts/${name}.woff2`,
      `data:font/woff2;base64,${btoa(binary)}`,
    );
  }
  // Optional reading assets are included when cached/available, with an honest fallback.
  const resources: Record<string, unknown> = {};
  for (const path of [
    "dictionary/en.json",
    "patterns/en-us.json",
    "patterns/es.json",
  ])
    try {
      resources[path] = await (await fetchAsset(path)).json();
    } catch {
      resources[path] = null;
    }
  const licence = await (
    await fetchAsset("licenses/NOTICES.txt")
  )
    .text()
    .catch(
      () =>
        "WordNet 3.0 Copyright 2006 Princeton University. See THIRD_PARTY.md.",
    );
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(doc.name)} — Unflatten</title><style>${styles}</style></head><body class="in-workspace"><a class="skip" href="#main">Skip to worksheet</a><header class="site-header"><span class="brand">Un<span>flat</span>ten.</span><span class="small">Your offline worksheet</span></header><main id="main" tabindex="-1"></main><script id="worksheet-data" type="application/json">${json({ doc, p, instance: crypto.randomUUID(), resources, licence })}</script><script>${runtime.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  download("accessible-worksheet.html", html, "text/html;charset=utf-8");
}
