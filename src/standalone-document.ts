import { esc, type Preferences } from "./ui/view";
import type { Worksheet } from "./parse/types";

export interface StandaloneSeed {
  doc: Worksheet;
  p: Preferences;
  instance: string;
  resources: Record<string, unknown>;
  licence: string;
}
const json = (data: unknown) => JSON.stringify(data)
  .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

/** Rebuild a fresh document from data; no student-populated DOM is serialized. */
export function standaloneDocument(seed: StandaloneSeed, styles: string, runtime: string) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(seed.doc.name)} — Unflatten</title><style id="worksheet-style">${styles}</style></head><body class="in-workspace"><a class="skip" href="#main">Skip to worksheet</a><header class="site-header"><span class="brand">Un<span>flat</span>ten.</span><span class="small">Your offline worksheet</span></header><main id="main" tabindex="-1"></main><script id="worksheet-data" type="application/json">${json(seed)}</script><script id="worksheet-runtime">${runtime.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
}
