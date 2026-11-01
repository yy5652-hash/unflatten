import {
  mkdir,
  copyFile,
  readdir,
  writeFile,
  readFile,
  cp,
  rm,
} from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
await mkdir("public/vendor/core", { recursive: true });
// Only the two LSTM builds the app selects between; the others add 40 MB to the offline pack.
await rm("public/vendor/core", { recursive: true, force: true });
await mkdir("public/vendor/core", { recursive: true });
for (const f of await readdir("node_modules/tesseract.js-core"))
  if (
    [
      "tesseract-core-simd-lstm.wasm.js",
      "tesseract-core-lstm.wasm.js",
    ].includes(f)
  )
    await copyFile(
      `node_modules/tesseract.js-core/${f}`,
      `public/vendor/core/${f}`,
    );
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  "public/vendor/ocr-worker.js",
);
await copyFile(
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  "public/vendor/pdf-worker.mjs",
);
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  try {
    await cp(`node_modules/pdfjs-dist/${dir}`, `public/vendor/pdf/${dir}`, {
      recursive: true,
    });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
await mkdir("public/vendor/fonts", { recursive: true });
await copyFile(
  "node_modules/@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2",
  "public/vendor/fonts/atkinson-next.woff2",
);
await copyFile(
  "node_modules/@fontsource/atkinson-hyperlegible-mono/files/atkinson-hyperlegible-mono-latin-400-normal.woff2",
  "public/vendor/fonts/atkinson-mono.woff2",
);
const sources = [];
for (const lang of [
  "eng",
  "spa",
  "fra",
  "por",
  "deu",
  "vie",
  "chi_sim",
  "ara",
]) {
  const path = `public/vendor/${lang}.traineddata.gz`;
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    const url = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${lang}.traineddata`;
    const res = await fetch(url);
    if (!res.ok) throw Error(`${url}: ${res.status}`);
    bytes = gzipSync(Buffer.from(await res.arrayBuffer()));
    await writeFile(path, bytes);
  }
  sources.push({
    language: lang,
    source: `https://github.com/tesseract-ocr/tessdata_fast/blob/main/${lang}.traineddata`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  });
}
await writeFile(
  "public/vendor/data-sources.json",
  JSON.stringify(sources, null, 2) + "\n",
);
console.log(
  "Self-hosted PDF/OCR workers, cores, fonts and eight language packs ready (English precached).",
);
