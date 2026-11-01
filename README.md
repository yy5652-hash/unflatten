# Unflatten

**A scanned worksheet says nothing to a screen reader. Unflatten turns it into a real web worksheet: read in order, filled in by keyboard, usable offline, and your file never leaves your device.**

Demo: DEMO_URL. No account and no personal details are needed. Press **Try Photosynthesis** and it converts in seconds.

## The barrier

A blind, low-vision or dyslexic student gets a worksheet as a scanned PDF or a photo. Their screen reader finds no text at all. On a two-column handout it reads across the columns, mixing two passages together. Either way there is nowhere to type an answer, so the student waits until someone can convert it, and the class moves on.

| | Before | With Unflatten |
| --- | --- | --- |
| Photosynthesis sample, image-only scan | 0 characters a screen reader can reach, 0 headings, 0 form fields | 1 heading, 3 questions, 6 labelled form fields |
| Water Cycle sample, two-column PDF | Text available, no headings, 0 form fields, no tags | Column by column, 3 headings, 4 questions, 7 labelled form fields |

These numbers are measured from the file on every conversion and shown in the app, in the **Original vs now** panel.

## Try it in 30 seconds

1. Open the demo and press **Try Photosynthesis**. The scan is recognised in your browser.
2. Press Tab, and answer with only the keyboard. Each blank is announced with its position, such as "Blank 1 of 2: Plants take in blank and release blank."
3. Open **Reading tools** for high contrast, larger text, wider spacing, a more legible font, one question at a time, and read aloud.
4. Turn off your connection, reload, and do it again.
5. Press **Download accessible .html** to keep one file with the tools and answers inside.

## How it works

1. **Read the page.** PDF.js reads text and positions. A page with no usable text is rendered and recognised on the device with Tesseract.
2. **Find the blanks as ink.** OCR reads a run of underscores as nothing or as noise, so a plain OCR pipeline loses the very thing that makes a worksheet a worksheet. Unflatten finds long, thin dark lines in the page image, including skewed ones, and places them back into the sentence. Lines under real words count as underlines, and lines drawn in a digital PDF are found the same way.
3. **Put it in reading order.** A whitespace cut separates columns, and repeated headers and footers are removed.
4. **Rebuild the structure.** Lines become a title, headings, instructions, passages and Name and Date fields, plus multiple choice, true or false, fill-in-the-blank and short answer questions, as native HTML form controls.
5. **Stay honest about uncertainty.** A line below 80% OCR confidence is marked "This line may have been misread", visibly and for screen readers. Figures are kept as pictures with a field for a helper's description; none is invented.

Fix mode lets a helper or the student correct text, change a block's kind, merge or delete blocks, by keyboard. Answers save on the device. Hand-in options are print or Save as PDF, copy as text, a .txt file, and a single accessible .html file that a teacher can share with a class.

## Verified by tests

`npm test` and `npm run e2e` run in Chromium at desktop and 360 px widths:

- Real OCR on the scanned and photo samples gives the exact expected questions and kinds.
- A two-column PDF reads column by column, and vector-line blanks become fields.
- A whole worksheet can be filled with the keyboard alone, and answers survive a reload.
- After the first load, a scan converts end to end with the network off.
- No request leaves the site during any flow.
- axe-core reports zero violations on every screen in light, dark and high-contrast themes, and on the exported file.
- Nothing scrolls sideways at 320 px with text at 200%.

The first screen loads 16 KB of gzipped JavaScript. The reading engine loads only when needed, and the whole offline pack is about 15 MB.

## Built during the event, and what came before

Everything in this repository was built from 1 November 2026 for AccessED Hacks. There was no earlier version. Third-party libraries, fonts and language models are listed in [THIRD_PARTY.md](THIRD_PARTY.md). Built with AI assistance from OpenAI Codex and Claude Code. All sample worksheets are original and synthetic.

## What still needs work

- Math notation, handwriting and complex tables.
- Checkbox-style options and options spread across one row in scans, which are often misread. They are flagged for review and can be corrected in Fix mode.
- Describing diagrams, which today needs a person.
- Braille output.
- Testing with screen-reader users and on older phones, which is the next step.

## Run it

```bash
npm install
npm run dev
```

`npm run build` writes the static site to `dist/`, and `npm run samples` regenerates the samples.

MIT licensed. See [LICENSE](LICENSE).
