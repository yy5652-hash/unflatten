import { Reader } from "../src/features/speech";
import type { Line } from "../src/parse/types";
import { findRules, placeRules, BLANK, type Word } from "../src/parse/rules";
import { describe, it, expect } from "vitest";
import { classify, textLines } from "../src/parse/classify";
import {
  readingOrder,
  dropRepeatedMargins,
  joinFragments,
} from "../src/parse/order";
import { blankParts, answerKeys, answered } from "../src/parse/types";
const line = (text: string, x: number, y: number, width = 180, page = 1) => ({
  ...textLines(text)[0],
  x,
  y,
  width,
  page,
  pageWidth: 600,
  pageHeight: 800,
});
describe("spatial reading order", () => {
  it("reads columns, not interleaved rows", () => {
    expect(
      readingOrder([
        line("L1", 40, 120),
        line("R1", 340, 120),
        line("L2", 40, 160),
        line("R2", 340, 160),
      ]).map((l) => l.text),
    ).toEqual(["L1", "L2", "R1", "R2"]);
  });
  it("keeps a spanning heading before both columns", () => {
    expect(
      readingOrder([
        line("Title", 40, 40, 500),
        line("L1", 40, 120),
        line("R1", 340, 120),
        line("L2", 40, 160),
        line("R2", 340, 160),
      ]).map((l) => l.text),
    ).toEqual(["Title", "L1", "L2", "R1", "R2"]);
  });
  it("does not reorder single column lines", () =>
    expect(
      readingOrder([line("b", 40, 80, 440), line("a", 40, 40, 440)]).map(
        (l) => l.text,
      ),
    ).toEqual(["a", "b"]));
  it("drops repeated margins only, including page numbers", () => {
    const result = dropRepeatedMargins([
      line("Header", 40, 10, 200, 1),
      line("Header", 40, 10, 200, 2),
      line("Body", 40, 200, 200, 1),
      line("Page 1", 40, 760, 200, 1),
      line("Page 2", 40, 760, 200, 2),
    ]);
    expect(result.map((l) => l.text)).toEqual(["Body"]);
  });
  it("joins text fragments without crossing columns", () =>
    expect(
      joinFragments([
        line("Hello", 40, 100, 40),
        line("world", 85, 100, 40),
        line("Other", 340, 100, 50),
      ]).map((l) => l.text),
    ).toEqual(["Hello world", "Other"]));
});
describe("classification", () => {
  it("classifies photosynthesis sample text", () => {
    const b = classify(
      textLines(
        "Photosynthesis\nName: ______ Date: ______\nInstructions: Read and answer.\n1. What powers photosynthesis?\na) Sunlight\nb) Moonlight\nc) Soil\n2. Plants take in ______ and release ______.\n3. Explain how a leaf helps a plant.\n__________",
      ),
    );
    expect(b.map((x) => x.kind)).toEqual([
      "title",
      "identity",
      "identity",
      "instructions",
      "multiple-choice",
      "fill-blank",
      "short-answer",
    ]);
    expect(b[4].options).toHaveLength(3);
  });
  it("classifies fractions sample including true/false", () =>
    expect(
      classify(
        textLines(
          "Fractions in the Kitchen\n1. Half of eight is ____.\n2. Two halves make a whole. True / False",
        ),
      ).map((b) => b.kind),
    ).toEqual(["title", "fill-blank", "true-false"]));
  it("recognizes A. and checkbox options", () => {
    for (const marker of ["A.", "a)", "☐", "□", "[ ]"])
      expect(
        classify(
          textLines(
            `Title\n1. Choose a colour.\n${marker} Green\n${marker === "A." ? "B." : marker} Blue`,
          ),
        )[1].options,
      ).toEqual(["Green", "Blue"]);
  });
  it("keeps each blank separate", () =>
    expect(blankParts("Use ___ and ______.")).toEqual(["Use ", " and ", "."]));
  it("does not mistake single underscores for blanks", () =>
    expect(blankParts("file_name")).toEqual(["file_name"]));
  it("uses following ruled or empty answer space", () =>
    expect(
      classify(textLines("Title\nDescribe your idea:\n______"))[1].kind,
    ).toBe("short-answer"));
  it("retains low confidence source lines", () => {
    const l = line("1. What is this?", 40, 40);
    l.confidence = 40;
    expect(classify([line("Title", 0, 0), l])[1].lines[0].confidence).toBe(40);
  });
  it("requires all blanks before a question is answered", () => {
    const b = classify(textLines("Title\n1. ___ plus ___"))[1];
    expect(answerKeys(b)).toEqual(["b1-0", "b1-1"]);
    expect(answered(b, { "b1-0": "one" })).toBe(false);
    expect(answered(b, { "b1-0": "one", "b1-1": "two" })).toBe(true);
  });
});

describe("answer blanks found as ink", () => {
  const page = (
    w: number,
    h: number,
    ink: [number, number, number, number][],
  ) => {
    const px = new Uint8ClampedArray(w * h * 4).fill(245);
    for (const [x0, y0, x1, y1] of ink)
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++)
          for (let c = 0; c < 3; c++) px[(y * w + x) * 4 + c] = 20;
    return px;
  };
  const word = (text: string, x: number, width: number): Word => ({
    text,
    x,
    y: 100,
    width,
    height: 20,
    confidence: 95,
  });
  it("finds a long thin line, including a skewed one, and ignores letters and solid areas", () => {
    const skewed: [number, number, number, number][] = Array.from(
      { length: 6 },
      (_, i) => [200 + i * 40, 300 + i, 240 + i * 40, 303 + i],
    );
    const rules = findRules(
      page(800, 500, [
        [100, 100, 400, 103], // a blank
        [100, 150, 112, 170], // a letter stem
        [500, 100, 700, 200], // a photo-like solid area
        ...skewed,
      ]),
      800,
      500,
    );
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ x0: 100, x1: 400 });
    expect(rules[1]).toMatchObject({ x0: 200, x1: 440 });
  });
  it("puts a blank inside its line and removes OCR noise read off the rule", () => {
    const box = { x: 40, y: 100, width: 600, height: 20 };
    const { lines, free } = placeRules(
      [
        {
          box,
          words: [
            word("is", 40, 30),
            { ...word("~~~", 90, 180), confidence: 20 },
            word("apples", 300, 80),
          ],
        },
      ],
      [{ x0: 90, x1: 280, y: 118 }],
    );
    expect(free).toEqual([]);
    expect(
      [...lines[0].words].sort((a, b) => a.x - b.x).map((w) => w.text),
    ).toEqual(["is", BLANK, "apples"]);
  });
  it("treats a rule under real words as an underline, and a lone rule as an answer line", () => {
    const box = { x: 40, y: 100, width: 200, height: 20 };
    const { lines, free } = placeRules(
      [{ box, words: [word("Important", 40, 200)] }],
      [
        { x0: 40, x1: 240, y: 122 },
        { x0: 40, x1: 600, y: 300 },
      ],
    );
    expect(lines[0].words).toHaveLength(1);
    expect(free).toEqual([{ x0: 40, x1: 600, y: 300 }]);
  });
  it("adds nothing where a PDF text layer already typed the underscores", () => {
    const box = { x: 40, y: 100, width: 200, height: 20 };
    const { lines, free } = placeRules(
      [{ box, words: [word("______", 40, 200)] }],
      [{ x0: 40, x1: 240, y: 118 }],
      true,
    );
    expect(lines[0].words).toHaveLength(1);
    expect(free).toEqual([]);
  });
});

describe("two columns with lines of different lengths", () => {
  it("prefers the clean gutter over a cut that a few lines cross", () => {
    const line = (text: string, x: number, y: number, width: number): Line => ({
      text,
      x,
      y,
      width,
      height: 22,
      page: 1,
      pageWidth: 1224,
      pageHeight: 1584,
      confidence: 100,
    });
    const order = readingOrder([
      line("L1", 84, 100, 405),
      line("R1", 660, 100, 396),
      line("L2", 84, 150, 400),
      line("R2", 660, 150, 369),
      line("L3", 84, 200, 143),
      line("R3", 660, 200, 417),
      line("L4", 84, 250, 122),
      line("R4", 660, 250, 392),
    ]).map((l) => l.text);
    expect(order).toEqual(["L1", "L2", "L3", "L4", "R1", "R2", "R3", "R4"]);
  });
});

describe("worksheet conventions from other teachers", () => {
  const kinds = (text: string) => classify(textLines(text));
  it("reads parenthesised options, Q numbering and a header row without colons", () => {
    const blocks = kinds(
      "Review\nName ______ Date ____ Period ___\nQ1. Who wrote it?\n(a) Jefferson\n(b) Adams",
    );
    expect(
      blocks.filter((b) => b.kind === "identity").map((b) => b.text),
    ).toEqual(["Name", "Date", "Period"]);
    const mc = blocks.find((b) => b.kind === "multiple-choice");
    expect(mc?.options).toEqual(["Jefferson", "Adams"]);
  });
  it("splits several options on one row", () => {
    const mc = kinds(
      "Review\n2) Which year?\nA. 1754   B. 1776   C. 1783",
    ).find((b) => b.kind === "multiple-choice");
    expect(mc?.options).toEqual(["1754", "1776", "1783"]);
  });
  it("leaves a sentence mentioning a date as content", () => {
    expect(
      kinds("Review\nDate: of the treaty was 1783.").some(
        (b) => b.kind === "identity",
      ),
    ).toBe(false);
  });
});

describe("choosing a voice", () => {
  const voice = (name: string, isDefault = false) =>
    ({
      name,
      lang: "en-US",
      localService: true,
      default: isDefault,
    }) as SpeechSynthesisVoice;
  const reader = (voices: SpeechSynthesisVoice[]) =>
    new Reader([], "en", {} as never, { getVoices: () => voices } as never);
  it("puts the system default first and leaves out novelty voices", () => {
    expect(
      reader([voice("Albert"), voice("Daniel"), voice("Samantha", true)])
        .voices()
        .map((v) => v.name),
    ).toEqual(["Samantha", "Daniel"]);
  });
  it("still offers a novelty voice when nothing else is installed", () => {
    expect(reader([voice("Albert")]).voices()).toHaveLength(1);
  });
});
