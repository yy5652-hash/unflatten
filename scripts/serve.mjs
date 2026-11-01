import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const port = Number(process.env.PORT || 4173),
  base = "/unflatten/",
  root = path.resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".gz": "application/gzip",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (!url.pathname.startsWith(base)) {
        res.writeHead(302, { Location: base });
        res.end();
        return;
      }
      let file = path.resolve(
        root,
        decodeURIComponent(url.pathname.slice(base.length)) || "index.html",
      );
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      if ((await stat(file)).isDirectory())
        file = path.join(file, "index.html");
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-cache");
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Unflatten local preview: http://127.0.0.1:${port}${base}`),
  );
