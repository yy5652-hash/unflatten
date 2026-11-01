import Hypher from "hypher";
async function resource(path: string) {
  const embedded = (
    globalThis as unknown as { unflattenResources?: Record<string, unknown> }
  ).unflattenResources;
  if (embedded) {
    if (!embedded[path])
      throw Error(
        "This optional reading pack was not cached when this HTML copy was exported. Export again after using the tool online.",
      );
    return embedded[path];
  }
  const r = await fetch(new URL("./" + path, document.baseURI));
  if (!r.ok)
    throw Error(
      "Reading pack unavailable offline. Load it once from this site while connected.",
    );
  return r.json();
}
let dictionary: Promise<Record<string, string>> | undefined;
const patterns = new Map<string, Promise<Hypher>>();
export function lookupWord(word: string): Promise<string> {
  dictionary ??= resource("dictionary/en.json").catch((e) => {
    dictionary = undefined;
    throw e;
  });
  return dictionary.then(
    (d) =>
      d[word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "")] ||
      "No definition in the compact English dictionary. Try the base form of the word.",
  );
}
export async function syllables(word: string, lang: string) {
  if (!["en", "es"].includes(lang)) return word;
  const key = lang === "en" ? "en-us" : "es";
  if (!patterns.has(key))
    patterns.set(
      key,
      resource(`patterns/${key}.json`)
        .then((p) => new Hypher(p))
        .catch((e) => {
          patterns.delete(key);
          throw e;
        }),
    );
  return (await patterns.get(key)!).hyphenate(word).join("·");
}
export async function partsOfSpeech(text: string) {
  const { default: nlp } = await import("compromise");
  const doc = nlp(text);
  const tags = new Map<string, string>();
  for (const tag of ["Noun", "Verb", "Adjective", "Adverb"])
    for (const word of doc
      .match("#" + tag)
      .terms()
      .out("array") as string[])
      tags.set(word.toLowerCase().replace(/[^\p{L}]/gu, ""), tag.toLowerCase());
  return tags;
}
