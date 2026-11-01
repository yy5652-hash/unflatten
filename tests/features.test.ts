import { describe, it, expect, vi } from "vitest";
import { classify, textLines } from "../src/parse/classify";
import type { Worksheet } from "../src/parse/types";
import { toBRF, unicodeBraille, wrapBRF } from "../src/output/braille";
import { mathSpeech } from "../src/features/math";
import { checkAnswers } from "../src/features/answers";
import { packShare, unpackShare } from "../src/features/share";
import { detectAI, runAI, type AIHost } from "../src/features/ai";
import { History } from "../src/features/history";
import { makeDocx } from "../src/output/docx";
import { makeEpub } from "../src/output/epub";
import { unzipSync, strFromU8 } from "fflate";
const sheet = (): Worksheet => ({
  id: "test",
  name: "Science",
  language: "en",
  blocks: classify(
    textLines(
      "Science\nReading: Plants\n1. Plants need ____.\n2. Pick a colour.\na) Green\nb) Blue",
    ),
  ),
  answers: {},
  original: {
    characters: 0,
    fields: 0,
    headings: 0,
    tagged: null,
    pages: 1,
    source: "image",
  },
  updated: 1,
  previews: [
    { page: 1, image: "data:image/png;base64,AA", width: 100, height: 100 },
  ],
});
describe("UEB Grade 1 literary subset", () => {
  it("translates known letters, capitals and numbers", () => {
    expect(toBRF("Hello world")).toBe(",HELLO WORLD");
    expect(unicodeBraille(toBRF("Ab 12"))).toBe("⠠⠁⠃ ⠼⠁⠃");
    expect(toBRF("NASA")).toBe(",,NASA");
    expect(toBRF("12a 3.14")).toBe("#AB;A #C4AD");
  });
  it("uses UEB punctuation and low-line blank symbols", () => {
    expect(toBRF("Hi, Sam! Is it 2? ____")).toBe(",HI1 ,SAM6 ,IS IT #B8 .-");
    expect(toBRF("(a); b: c/d")).toBe('"<A">2 B3 C_/D');
  });
  it("wraps at 40 cells and paginates every 25 lines", () => {
    const result = wrapBRF(Array(55).fill("A".repeat(45)).join("\n"));
    const pages = result.split("\f");
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const lines = page.replace(/\r\n$/, "").split("\r\n");
      expect(lines.length).toBeLessThanOrEqual(25);
      expect(lines.every((l) => l.length <= 40)).toBe(true);
    }
  });
});
it("speaks simple maths without pretending to recognize math layout", () => {
  expect(mathSpeech("3/4 × x^2 ÷ y³ = ____")).toBe(
    "3 over 4 times x squared divided by y cubed = blank",
  );
  expect(mathSpeech("x² + a^12")).toBe("x squared + a to the power of 12");
});
describe("answer checking", () => {
  it("normalizes case and whitespace, reports unkeyed questions separately", () => {
    const d = sheet(),
      b = d.blocks.find((b) => b.kind === "fill-blank")!;
    b.key = { [b.id + "-0"]: ["Sun light", "SUN"] };
    d.answers[b.id + "-0"] = "  sun   LIGHT ";
    expect(checkAnswers(d)).toMatchObject({ correct: 1, total: 1 });
    d.answers[b.id + "-0"] = "rain";
    expect(checkAnswers(d).results.find((r) => r.id === b.id)?.result).toBe(
      "retry",
    );
  });
  it("requires the exact checkbox set and all table cells", () => {
    const d = sheet();
    d.blocks = [
      {
        id: "check",
        page: 1,
        lines: [],
        kind: "checkbox",
        text: "Choose",
        options: ["Heat", "Pressure", "Light"],
        key: { check: ["Heat", "Pressure"] },
      },
      {
        id: "table",
        page: 1,
        lines: [],
        kind: "table",
        text: "Table",
        cells: [
          ["Rock", "Process"],
          ["Igneous", ""],
        ],
        key: { "table-1-1": ["cooling"] },
      },
    ];
    d.answers = { check: '["Pressure","Heat"]', "table-1-1": "Cooling" };
    expect(checkAnswers(d)).toMatchObject({ correct: 2, total: 2 });
    d.answers.check = '["Heat"]';
    expect(checkAnswers(d).correct).toBe(1);
  });
});
describe("class links", () => {
  it("round trips keys and structural content, stripping all answers and images", () => {
    const d = sheet();
    const b = d.blocks[2];
    b.key = { [b.id + "-0"]: ["sun"] };
    d.answers[b.id + "-0"] = "private answer";
    d.blocks.push({
      id: "figure",
      kind: "figure",
      text: "Diagram",
      page: 1,
      lines: [],
      image: "data:image/png;base64,ABC",
    });
    const hash = packShare(d),
      copy = unpackShare(hash);
    expect(copy.name).toBe(d.name);
    expect(copy.answers).toEqual({});
    expect(copy.previews).toEqual([]);
    expect(copy.blocks[2].key).toEqual(b.key);
    expect(copy.blocks.at(-1)?.image).toBeUndefined();
    expect(copy.blocks.at(-1)?.text).toContain("omitted");
    expect(copy.id).not.toBe(d.id);
  });
  it("rejects malicious ids and oversized fragments", () => {
    const d = sheet();
    d.blocks[0].id = '" onfocus="bad';
    expect(() => unpackShare(packShare(d))).toThrow("Invalid worksheet block");
    expect(() => unpackShare("#worksheet=" + "A".repeat(100001))).toThrow();
    expect(() => unpackShare("#worksheet=<>")).toThrow();
  });
});
describe("on-device AI with injected mocks", () => {
  it("feature-detects independently", () => {
    expect(detectAI({})).toEqual({
      translate: false,
      simplify: false,
      explain: false,
    });
    expect(detectAI({ Translator: {} as never })).toMatchObject({
      translate: false,
    });
    expect(
      detectAI({ Rewriter: {} as never, LanguageModel: {} as never }),
    ).toMatchObject({ simplify: true, explain: true });
  });
  it("detects source language, translates locally and releases models", async () => {
    const destroy = vi.fn(),
      create = vi.fn(async () => ({
        translate: async (t: string) => "es:" + t,
        destroy,
      }));
    const host: AIHost = {
      LanguageDetector: {
        availability: async () => "available",
        create: async () => ({
          detect: async () => [{ detectedLanguage: "en" }],
          destroy,
        }),
      },
      Translator: { availability: async () => "available", create },
    };
    expect(await runAI("translate", "Hello", "es", host)).toBe("es:Hello");
    expect(create).toHaveBeenCalledWith({
      sourceLanguage: "en",
      targetLanguage: "es",
    });
    expect(destroy).toHaveBeenCalledTimes(2);
  });
  it("does not create or download unavailable models", async () => {
    const create = vi.fn();
    await expect(
      runAI("simplify", "text", "en", {
        Rewriter: { availability: async () => "downloadable", create },
      }),
    ).rejects.toThrow("No text was sent");
    expect(create).not.toHaveBeenCalled();
  });
  it("uses Rewriter, Summarizer fallback and LanguageModel", async () => {
    const available = { availability: async () => "available" };
    expect(
      await runAI("simplify", "text", "en", {
        Rewriter: {
          ...available,
          create: async () => ({ rewrite: async () => "simple" }),
        },
      }),
    ).toBe("simple");
    expect(
      await runAI("simplify", "text", "en", {
        Summarizer: {
          ...available,
          create: async () => ({ summarize: async () => "summary" }),
        },
      }),
    ).toBe("summary");
    expect(
      await runAI("explain", "text", "en", {
        LanguageModel: {
          ...available,
          create: async () => ({ prompt: async () => "explanation" }),
        },
      }),
    ).toBe("explanation");
  });
});
it("undo and redo preserve document, keys and answers", () => {
  const d = sheet(),
    history = new History(d);
  history.record();
  d.name = "Changed";
  d.answers.a = "One";
  history.undo();
  expect(d.name).toBe("Science");
  expect(d.answers).toEqual({});
  history.redo();
  expect(d.answers.a).toBe("One");
  history.record();
  d.name = "Branch";
  expect(history.canRedo).toBe(false);
});
describe("portable export structure", () => {
  it("creates a DOCX with real headings and bullet definitions, and respects blank mode", async () => {
    const d = sheet();
    d.answers[d.blocks[2].id + "-0"] = "SECRET ANSWER";
    const blob = await makeDocx(d, true),
      zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(zip["[Content_Types].xml"]).toBeDefined();
    const document = strFromU8(zip["word/document.xml"]);
    expect(document).toContain("Heading1");
    expect(document).toContain("Heading2");
    expect(document).toContain("SECRET ANSWER");
    expect(zip["word/numbering.xml"]).toBeDefined();
    const blank = unzipSync(
      new Uint8Array(await (await makeDocx(d, false)).arrayBuffer()),
    );
    expect(strFromU8(blank["word/document.xml"])).not.toContain(
      "SECRET ANSWER",
    );
  });
  it("creates EPUB 3 container, package, nav and semantic content with first uncompressed mimetype", () => {
    const d = sheet(),
      bytes = makeEpub(d, false),
      zip = unzipSync(bytes);
    expect(strFromU8(zip.mimetype)).toBe("application/epub+zip");
    expect(new DataView(bytes.buffer).getUint16(8, true)).toBe(0);
    expect(strFromU8(zip["META-INF/container.xml"])).toContain(
      "OEBPS/package.opf",
    );
    expect(strFromU8(zip["OEBPS/package.opf"])).toContain('version="3.0"');
    expect(strFromU8(zip["OEBPS/nav.xhtml"])).toContain('epub:type="toc"');
    expect(strFromU8(zip["OEBPS/content.xhtml"])).toMatch(/<h1[^>]*>Science/);
    expect(strFromU8(zip["OEBPS/content.xhtml"])).toContain("<ul>");
  });
});
