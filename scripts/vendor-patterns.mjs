import { mkdir, writeFile } from "node:fs/promises";
await mkdir("public/patterns", { recursive: true });
for (const lang of ["en-us", "es"]) {
  const url = `https://raw.githubusercontent.com/hyphenation/tex-hyphen/master/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-${lang}.tex`;
  const res = await fetch(url);
  if (!res.ok) throw Error("Patterns unavailable");
  const source = await res.text();
  const clean = source.replace(/%[^\n]*/g, ""),
    values = [...clean.matchAll(/\\patterns\s*\{([^}]+)\}/g)].flatMap((m) =>
      m[1].trim().split(/\s+/),
    );
  const patterns = {};
  for (const value of values) {
    const p = value.replace(/\./g, "_");
    patterns[p.length] = (patterns[p.length] || "") + p;
  }
  const exceptions = [...clean.matchAll(/\\hyphenation\s*\{([^}]+)\}/g)]
    .flatMap((m) => m[1].trim().split(/\s+/))
    .map((s) => s.replace(/-/g, "‧"))
    .join(",");
  await writeFile(
    `public/patterns/${lang}.json`,
    JSON.stringify({
      leftmin: 2,
      rightmin: lang === "es" ? 2 : 3,
      patterns,
      exceptions,
    }),
  );
  await writeFile(
    `public/patterns/${lang}-LICENSE.txt`,
    source.split("\\patterns")[0],
  );
}
