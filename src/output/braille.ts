// Literary UEB Grade 1 subset, using Braille ASCII for BRF. No contractions.
// Capital word indicators, numeric mode and a-j numeric terminators follow UEB.
const ascii =
  " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=";
const punct: Record<string, string> = {
  ",": "1",
  ";": "2",
  ":": "3",
  ".": "4",
  "!": "6",
  "?": "8",
  "'": "'",
  "’": "'",
  "-": "-",
  "—": ",-",
  "–": ",-",
  _: ".-",
  "(": '"<',
  ")": '">',
  "[": ".<",
  "]": ".>",
  "/": "_/",
  "+": '"6',
  "=": '"7',
  "×": '"8',
  "÷": '"/',
  "“": "8",
  "”": "0",
  '"': "8",
};
export function toBRF(text: string): string {
  let number = false,
    quote = false;
  let out = "";
  const tokens =
    text.replace(/_{2,}/g, "_").match(/[A-Z]{2,}(?![a-z])|[\s\S]/g) ?? [];
  for (const t of tokens) {
    if (/^[A-Z]{2,}$/.test(t)) {
      out += ",," + t;
      number = false;
      continue;
    }
    const c = t;
    if (/\d/.test(c)) {
      if (!number) out += "#";
      out += "JABCDEFGHI"[Number(c)];
      number = true;
      continue;
    }
    if (/[a-z]/i.test(c)) {
      if (number && /[a-j]/.test(c)) out += ";";
      if (/[A-Z]/.test(c)) out += ",";
      out += c.toUpperCase();
      number = false;
      continue;
    }
    if (c === '"') {
      out += quote ? "0" : "8";
      quote = !quote;
    } else out += punct[c] ?? (/\s/.test(c) ? c : "8");
    if (!/[.,]/.test(c)) number = false;
  }
  return out;
}
export function unicodeBraille(brf: string): string {
  return [...brf]
    .map((c) =>
      /\s/.test(c)
        ? c
        : String.fromCharCode(0x2800 + Math.max(0, ascii.indexOf(c))),
    )
    .join("");
}
export function wrapBRF(brf: string, width = 40, pageLines = 25): string {
  const lines: string[] = [];
  for (const paragraph of brf.split(/\r?\n/)) {
    let line = "";
    for (let word of paragraph.split(/\s+/)) {
      while (word.length > width) {
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (line.length + word.length + 1 > width) {
        lines.push(line);
        line = "";
      }
      line += (line ? " " : "") + word;
    }
    lines.push(line);
  }
  return lines
    .map((l, i) => (i && i % pageLines === 0 ? "\f" : "") + l)
    .join("\r\n");
}
