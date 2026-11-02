import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
await mkdir("public/licenses", { recursive: true });
let notices = "UNFLATTEN — THIRD-PARTY NOTICES\n\n";
notices +=
  "Lucide panels-top-left — ISC\n" +
  (await readFile("public/licenses/lucide.txt", "utf8")) +
  "\n\n";
const packages = [
  "fflate",
  "docx",
  "mammoth",
  "compromise",
  "qrcode-generator",
  "hypher",
  "@fontsource-variable/atkinson-hyperlegible-next",
  "@fontsource/atkinson-hyperlegible-mono",
];
for (const name of packages) {
  const path = "node_modules/" + name,
    p = JSON.parse(await readFile(path + "/package.json"));
  const files = await readdir(path);
  const file = files.find((f) => /^(license|licence|bsd)(\.|$)/i.test(f));
  let licence = file ? await readFile(path + "/" + file, "utf8") : "";
  if (name === "qrcode-generator")
    licence =
      "Copyright (c) 2009 Kazuhiko Arase\n\n" +
      (await readFile("node_modules/fflate/LICENSE", "utf8"))
        .split("\n")
        .slice(2)
        .join("\n");
  notices += `${name} ${p.version} — ${p.license}\n${licence}\n\n`;
}
for (const path of [
  "dictionary/LICENSE",
  "patterns/en-us-LICENSE.txt",
  "patterns/es-LICENSE.txt",
])
  notices += `${path}\n${await readFile("public/" + path, "utf8")}\n\n`;
await writeFile("public/licenses/NOTICES.txt", notices);
