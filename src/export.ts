import css from "./style.css?raw";
import { type Preferences } from "./ui/view";
import type { Worksheet } from "./parse/types";
import { download } from "./ui/controller";
import { standaloneDocument } from "./standalone-document";
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
  const html = standaloneDocument({ doc, p, instance: crypto.randomUUID(), resources, licence }, styles, runtime);
  download("accessible-worksheet.html", html, "text/html;charset=utf-8");
}
