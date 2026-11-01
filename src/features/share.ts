import { gzipSync, gunzipSync, strToU8, strFromU8 } from "fflate";
import { languages, type Worksheet, type Kind } from "../parse/types";
const kinds: Kind[] = [
  "title",
  "heading",
  "instructions",
  "passage",
  "multiple-choice",
  "checkbox",
  "true-false",
  "fill-blank",
  "short-answer",
  "identity",
  "figure",
  "table",
  "word-bank",
  "matching",
];
export function packShare(doc: Worksheet): string {
  const clean = {
    ...doc,
    id: doc.id,
    answers: {},
    previews: [],
    blocks: doc.blocks.map((b) => ({
      ...b,
      image: undefined,
      lines: [],
      text:
        b.kind === "figure"
          ? `${b.text} (Image omitted from shared link; request the HTML copy.)`
          : b.text,
    })),
  };
  const bytes = gzipSync(strToU8(JSON.stringify({ v: 1, doc: clean })));
  let binary = "";
  for (const n of bytes) binary += String.fromCharCode(n);
  return (
    "#worksheet=" +
    btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  );
}
export function unpackShare(fragment: string): Worksheet {
  const raw = fragment.replace(/^#worksheet=/, "");
  if (raw.length > 100000 || !/^[\w-]+$/.test(raw))
    throw Error("Invalid or oversized worksheet link.");
  const bytes = Uint8Array.from(
    atob(raw.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  // Gzip ISIZE checked before allocation; a fixed output bound also limits malformed streams.
  const size = new DataView(bytes.buffer).getUint32(bytes.length - 4, true);
  if (size > 2000000)
    throw Error("Worksheet link is too large. Ask for an HTML file.");
  const parsed = JSON.parse(
    strFromU8(gunzipSync(bytes, { out: new Uint8Array(size) })),
  );
  const d = parsed.doc as Worksheet;
  if (
    parsed.v !== 1 ||
    !d ||
    typeof d.name !== "string" ||
    d.name.length > 5000 ||
    !languages[d.language] ||
    !Array.isArray(d.blocks) ||
    d.blocks.length > 1000 ||
    !d.original
  )
    throw Error("Invalid worksheet structure.");
  if (
    !["pdf", "image", "text", "word"].includes(d.original.source) ||
    !["characters", "fields", "headings", "pages"].every(
      (k) =>
        Number.isSafeInteger(
          (d.original as unknown as Record<string, unknown>)[k],
        ) &&
        Number((d.original as unknown as Record<string, unknown>)[k]) >= 0 &&
        Number((d.original as unknown as Record<string, unknown>)[k]) <
          10000000,
    )
  )
    throw Error("Invalid source statistics.");
  const ids = new Set<string>();
  for (const b of d.blocks) {
    if (
      !/^[\w-]{1,100}$/.test(b.id) ||
      ids.has(b.id) ||
      !kinds.includes(b.kind) ||
      typeof b.text !== "string" ||
      b.text.length > 50000 ||
      !Number.isSafeInteger(b.page) ||
      b.page < 1
    )
      throw Error("Invalid worksheet block.");
    ids.add(b.id);
    if (
      b.options &&
      (!Array.isArray(b.options) ||
        b.options.some((s) => typeof s !== "string"))
    )
      throw Error("Invalid choices.");
    if (
      b.cells &&
      (!Array.isArray(b.cells) ||
        b.cells.some(
          (r) => !Array.isArray(r) || r.some((s) => typeof s !== "string"),
        ))
    )
      throw Error("Invalid table.");
    if (
      b.pairs &&
      (!Array.isArray(b.pairs) || b.pairs.some((s) => typeof s !== "string"))
    )
      throw Error("Invalid matching rows.");
    if (
      b.key &&
      (typeof b.key !== "object" ||
        Object.values(b.key).some(
          (a) => !Array.isArray(a) || a.some((s) => typeof s !== "string"),
        ))
    )
      throw Error("Invalid answer key.");
    b.lines = [];
    delete b.image;
  }
  return {
    ...d,
    id: crypto.randomUUID(),
    answers: {},
    previews: [],
    updated: Date.now(),
  };
}
export async function shareQR(url: string) {
  const { default: qrcode } = await import("qrcode-generator");
  const qr = qrcode(0, "L");
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ scalable: true, margin: 4 });
}
