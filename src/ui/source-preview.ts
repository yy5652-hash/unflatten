/** A small first-page preview while the full conversion runs. Uses the same
 * self-hosted PDF.js 6.4.299 assets as the converter; nothing leaves this site.
 * API: https://mozilla.github.io/pdf.js/examples/ (checked with installed types).
 */
export async function pdfPreview(
  file: File,
  signal: AbortSignal,
): Promise<string | undefined> {
  if (signal.aborted || file.size > 40 * 1024 * 1024) return;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (signal.aborted) return;
  const asset = (path: string) =>
    new URL(`./vendor/${path}`, document.baseURI).href;
  pdfjs.GlobalWorkerOptions.workerSrc = asset("pdf-worker.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: asset("pdf/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: asset("pdf/standard_fonts/"),
    wasmUrl: asset("pdf/wasm/"),
    iccUrl: asset("pdf/iccs/"),
  });
  const abort = () => {
    void task.destroy();
  };
  signal.addEventListener("abort", abort, { once: true });
  const canvas = document.createElement("canvas");
  try {
    if (signal.aborted) return;
    const pdf = await task.promise,
      page = await pdf.getPage(1),
      base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: Math.min(1, 500 / Math.max(base.width, base.height)),
    });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return signal.aborted ? undefined : canvas.toDataURL("image/png");
  } catch {
    return undefined;
  } finally {
    // The converter reports file errors; a preview must not block it.
    signal.removeEventListener("abort", abort);
    await task.destroy();
    canvas.width = canvas.height = 0;
  }
}
