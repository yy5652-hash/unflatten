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
  const runtime = await fetch(new URL("./export-runtime.js", document.baseURI));
  if (!runtime.ok) throw Error("Export runtime unavailable");
  let styles = css;
  for (const weight of [400, 700]) {
    const response = await fetch(
      new URL(`./vendor/fonts/atkinson-${weight}.woff2`, document.baseURI),
    );
    if (!response.ok) throw Error("Font unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    styles = styles.replace(
      `../public/vendor/fonts/atkinson-${weight}.woff2`,
      `data:font/woff2;base64,${btoa(binary)}`,
    );
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(doc.name)} — Unflatten</title><style>${styles}</style></head><body><a class="skip" href="#main">Skip to worksheet</a><header class="site-header"><span class="brand">unflatten.</span><span class="muted">Accessible worksheet · offline copy</span></header><main id="main" tabindex="-1"></main><footer class="site-footer">This file works offline. Answers stay in this browser; download a fresh copy to share changes.</footer><script id="worksheet-data" type="application/json">${json({ doc, p })}</script><script>${(await runtime.text()).replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  download("accessible-worksheet.html", html, "text/html;charset=utf-8");
}
