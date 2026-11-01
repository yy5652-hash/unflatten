import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
// WordNet sense counts provide a reproducible common-word filter (tagged sense >= 1).
const dict = Object.create(null);
for (const pos of ["noun", "verb", "adj", "adv"]) {
  const data = await readFile(`node_modules/wordnet-db/dict/data.${pos}`),
    index = await readFile(`node_modules/wordnet-db/dict/index.${pos}`, "utf8");
  for (const line of index.split("\n")) {
    if (!line || line.startsWith(" ")) continue;
    const f = line.split(/\s+/),
      word = f[0],
      pointers = Number(f[3]),
      tagged = Number(f[5 + pointers]),
      offset = Number(f[6 + pointers]);
    if (!/^[a-z]{2,20}$/.test(word) || tagged < 1 || dict[word]) continue;
    const entry = data.subarray(offset, data.indexOf(10, offset)).toString(),
      gloss = entry.split("|")[1]?.trim().split('; "')[0];
    if (gloss) dict[word] = gloss.slice(0, 300);
  }
}
await mkdir("public/dictionary", { recursive: true });
const payload = JSON.stringify(dict);
if (gzipSync(payload).length >= 4e6)
  throw Error("Dictionary exceeds 4 MB gzip");
await writeFile("public/dictionary/en.json", payload);
await copyFile("node_modules/wordnet-db/LICENSE", "public/dictionary/LICENSE");
console.log(
  `Dictionary: ${Object.keys(dict).length} common words, ${gzipSync(payload).length} bytes gzip`,
);
