import { build } from "vite";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
await build({
  configFile: false,
  logLevel: "warn",
  build: {
    target: "es2022",
    emptyOutDir: false,
    lib: {
      entry: "src/standalone.ts",
      name: "UnflattenExport",
      formats: ["iife"],
      fileName: () => "export-runtime.js",
    },
    rolldownOptions: { output: { inlineDynamicImports: true } },
  },
});
async function walk(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true }))
        .filter((e) => !e.name.startsWith("."))
        .map(async (e) =>
          e.isDirectory() ? walk(`${dir}/${e.name}`) : `${dir}/${e.name}`,
        ),
    )
  ).flat();
}
const files = (await walk("dist"))
  .filter(
    (f) =>
      !f.endsWith("/sw.js") &&
      !f.endsWith("/spa.traineddata.gz") &&
      !f.includes("/vendor/pdf/cmaps/") &&
      !f.endsWith("/bundle-report.json"),
  )
  .sort();
const hash = createHash("sha256");
for (const f of files) hash.update(await readFile(f));
const version = hash.digest("hex").slice(0, 16);
const precache = files.map((f) => "./" + f.slice(5));
await writeFile(
  "dist/sw.js",
  `const CACHE='unflatten-${version}';const ASSETS=${JSON.stringify(precache)};self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting();})()));self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('unflatten-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET')return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(event.request);if(cached)return cached;if(event.request.mode==='navigate'){const shell=await cache.match(new URL('./index.html',self.registration.scope));if(shell)return shell;}const response=await fetch(event.request);if(response.ok&&url.pathname.startsWith(new URL(self.registration.scope).pathname))await cache.put(event.request,response.clone());return response;})());});`,
);
const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
const entry = manifest["index.html"];
const initial = new Set([entry.file]);
function visit(item) {
  for (const key of item.imports ?? []) {
    initial.add(manifest[key].file);
    visit(manifest[key]);
  }
}
visit(entry);
const sizes = [];
for (const file of initial) {
  const bytes = await readFile(`dist/${file}`);
  sizes.push({ file, bytes: bytes.length, gzip: gzipSync(bytes).length });
}
const initialGzip = sizes.reduce((n, s) => n + s.gzip, 0);
const precacheBytes = (await Promise.all(files.map((f) => readFile(f)))).reduce(
  (n, b) => n + b.length,
  0,
);
const report = {
  initialJavaScript: sizes,
  initialGzip,
  limit: 60000,
  precacheFiles: files.length,
  precacheBytes,
  spanishPrecached: false,
};
await writeFile(
  "dist/bundle-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (initialGzip >= 60000) throw Error("Initial JavaScript exceeds 60 KB gzip");
