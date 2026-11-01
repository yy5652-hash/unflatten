import { type Block, type Line, type Kind, blankParts } from "./types";
const option = /^\s*(?:\(?[a-hA-H][).]\s*|[☐□○◯]\s*|\[\s?\]\s*)(.+)$/;
// "A. 1754   B. 1776   C. 1783" on one row: a letter marker that follows the first one.
const inlineOption = /\s+\(?[b-hB-H][).]\s*/;
const numbered = /^\s*(?:Q(?:uestion)?\s*)?\d+\s*[.):]\s*/i;
const rules = /^\s*[_—–\-\s]{3,}$/;
export function textLines(text: string): Line[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((text, i) => ({
      text,
      page: 1,
      x: 0,
      y: i * 24,
      width: text.length * 8,
      height: 20,
      pageWidth: 700,
      pageHeight: Math.max(900, text.split("\n").length * 24),
      confidence: 100,
    }));
}
export function classify(lines: Line[]): Block[] {
  const blocks: Block[] = [];
  let serial = 0;
  const add = (kind: Kind, text: string, line: Line) => {
    const b: Block = {
      id: `b${serial++}`,
      kind,
      text,
      lines: [line],
      page: line.page,
    };
    blocks.push(b);
    return b;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      text = line.text.trim(),
      prev = blocks.at(-1);
    if (!text || rules.test(text)) {
      if (
        prev &&
        ["passage", "instructions", "heading"].includes(prev.kind) &&
        (text || /[?:]$/.test(prev.text))
      )
        prev.kind = "short-answer";
      continue;
    }
    const identityField =
      /\b(Name|Date|Class|Period|Teacher|Block|Hour|Group|Grade|Score|Nombre|Fecha|Clase)\s*(?:[:：]|(?=_{2,}))\s*[_\s.]*/gi;
    const identities = [...text.matchAll(identityField)];
    // Only a line made of nothing else is a form header; "Name: Ada" or a sentence is content.
    if (identities.length && !text.replace(identityField, "").trim()) {
      for (const m of identities) add("identity", m[1], line);
      continue;
    }
    if (
      /^(?:True\s*[/ ]\s*False|Verdadero\s*[/ ]\s*Falso)$/i.test(text) &&
      prev?.kind === "short-answer"
    ) {
      prev.kind = "true-false";
      prev.lines.push(line);
      continue;
    }
    const opt = text.match(option);
    if (
      opt &&
      prev &&
      ["short-answer", "multiple-choice"].includes(prev.kind)
    ) {
      prev.kind = "multiple-choice";
      (prev.options ??= []).push(...opt[1].split(inlineOption));
      prev.lines.push(line);
      continue;
    }
    let kind: Kind = "passage";
    if (
      /\btrue\s*(?:\/|or|\s)\s*false\b|\bverdadero\s*(?:\/|o)\s*falso\b/i.test(
        text,
      )
    )
      kind = "true-false";
    else if (blankParts(text).length > 1) kind = "fill-blank";
    else if (numbered.test(text) || /\?\s*$/.test(text)) kind = "short-answer";
    else if (!blocks.some((b) => b.kind !== "identity")) kind = "title";
    else if (
      /^(?:instructions?|directions?|instrucciones)\s*:/i.test(text) ||
      /^(?:Read|Choose|Complete|Answer|Use|Write|Circle)\b/.test(text)
    )
      kind = "instructions";
    else if (
      (line.fontSize && line.fontSize >= 15) ||
      /^[A-Z][A-Z\s]{3,}$/.test(text) ||
      /^(?:Part\s|Section\s|Reading\b|Explore\b|Practice\b|Think\b)/.test(
        text,
      ) ||
      (text.endsWith(":") && text.length < 65)
    )
      kind = "heading";
    else if (
      prev?.kind === "short-answer" &&
      !numbered.test(text) &&
      line.page === prev.page &&
      line.y - (prev.lines.at(-1)?.y ?? 0) < line.height * 1.8
    ) {
      prev.text += " " + text;
      prev.lines.push(line);
      continue;
    } else if (
      prev?.kind === "passage" &&
      line.page === prev.page &&
      line.y - (prev.lines.at(-1)?.y ?? 0) < line.height * 2.4
    ) {
      prev.text += " " + text;
      prev.lines.push(line);
      continue;
    }
    add(kind, text, line);
  }
  // Identity fields belong before the first instructional block, after the title.
  const title = blocks.find((b) => b.kind === "title");
  return [
    ...(title ? [title] : []),
    ...blocks.filter((b) => b.kind === "identity"),
    ...blocks.filter((b) => b !== title && b.kind !== "identity"),
  ];
}
