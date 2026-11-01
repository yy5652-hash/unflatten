# Unflatten

**Your worksheet is a picture. We make it a page.**

A scanned worksheet says nothing to a screen reader and has nowhere to type. Unflatten turns a PDF, photo, Word file or pasted text into a real web worksheet: read in order, filled in by keyboard, usable offline, and your file never leaves your device.

Demo: **DEMO_URL**. No account and no personal details are needed. Press **Try Photosynthesis** and it converts in your browser.

## The barrier

A blind, low-vision or dyslexic student gets a worksheet as a scan or a phone photo. Their screen reader finds no text at all. On a two-column handout it can read across the columns and mix two passages together. Either way there is nowhere to type, so the student waits for someone to convert it, and the class moves on.

| Sample | Before | With Unflatten |
| --- | --- | --- |
| Photosynthesis, image-only scan | 0 characters a screen reader can reach, 0 form fields | 3 questions, 6 labelled form fields |
| Rock Cycle Review, image-only scan | 0 characters a screen reader can reach, 0 form fields | A real table, checkboxes and a word bank |
| The Water Cycle, two-column PDF | Text with no headings, no tags, 0 form fields | Column by column, 4 questions, 7 labelled form fields |

Every conversion measures this from the file and shows it across the top of the worksheet.

## What it does

| Need | What Unflatten gives you | The tools it was benchmarked against |
| --- | --- | --- |
| Read | Continuous read aloud with word highlighting, speed and voice control, six page colours, text, line, letter and column controls, a reading ruler and screen mask, syllable view, parts of speech, an offline dictionary | Immersive Reader, Kami Companion |
| Understand | Translate, Simplify and Explain with Chrome's on-device AI, where the browser provides it; simple math read as words | Kami Companion |
| Answer | Native radios, checkboxes, blanks, short answers, ruled tables and matching rows; voice typing; answers saved on the device; a question outline with progress | Kami, TeacherMade |
| Compare | The original page beside the worksheet. Focus a question and its source lines light up; select a line and you return to its question | Kami |
| Practise | A teacher sets an answer key and hints; students check answers, hear the feedback and retry | TeacherMade |
| Share | A link or QR code that carries the worksheet in the URL fragment, with no server and no accounts | TeacherMade |
| Hand in | Self-contained HTML, Word, EPUB 3, UEB Grade 1 braille (.brf), text, print or Save as PDF, Web Share and email | Anthology Ally |

Input covers PDFs, photos (several pages at once), Word, text and pasted screenshots, with OCR in English, Spanish, French, Portuguese, German, Vietnamese, Simplified Chinese and Arabic, including right-to-left layout.

## Try it in 30 seconds

1. Press **Try Photosynthesis**. The scan is recognised in your browser.
2. Press Tab and answer with only the keyboard. Each blank is announced with its place, such as "Blank 1 of 2: Plants take in blank and release blank."
3. Open **Original** and move between questions to see the source lines light up.
4. Press play in the bottom bar, then open **Tools** and change the page colour.
5. Turn off your connection, reload, and convert another sample.

## How it works

1. **Read the page.** PDF.js reads text and positions. A page without usable text is deskewed, cleaned up and recognised on the device with Tesseract.
2. **Find the blanks as ink.** OCR reads a run of underscores as nothing or as noise, so a plain OCR pipeline loses what makes a worksheet a worksheet. Unflatten finds long, thin dark lines in the page image, including skewed ones, and places them back into the sentence. Lines under real words count as underlines. Checkbox outlines and ruled tables are found the same way.
3. **Put it in reading order.** A whitespace cut separates columns, and repeated headers and footers are removed.
4. **Rebuild the structure.** Lines become a title, headings, instructions, passages, Name and Date fields, questions, tables and word banks, all as native HTML.
5. **Show the uncertainty.** A line below 80% OCR confidence is marked "This line may have been misread", on screen and for screen readers. Figures stay as pictures, with the text found inside them and a field for a helper's description. None is invented.

Fix mode lets a helper or the student correct text, change a block's kind, reorder, split, merge or delete blocks, by keyboard, with undo and redo.

## Privacy

Your file is processed in your browser. There are no accounts, analytics or uploads, and the site makes no third-party requests. Read aloud uses your device's voices. Voice typing is the one opt-in exception, and it says so at first use: the browser may send your voice to its speech service, and nothing goes to Unflatten. Answer keys travel with shared copies, so they are for practice and not for secure exams.

## Verified by tests

`npm test` runs 48 unit and OCR tests. `npm run e2e` runs 44 browser tests in Chromium at desktop and 360 px widths:

- Real OCR on the scanned samples gives the exact expected questions, tables and checkboxes.
- A two-column PDF reads column by column, and vector-line blanks become fields.
- A whole worksheet can be filled with the keyboard alone, and answers survive a reload.
- After the first load, a scan converts end to end with the network off.
- No request leaves the site during any flow.
- axe-core reports zero violations on every screen in all six page colours, and on the exported file.
- Nothing scrolls sideways at 320 px with text at 200%.
- Every export downloads a valid file, and a share link opens in a fresh browser with the worksheet and no answers.

The first screen loads 13 KB of gzipped JavaScript, and the offline pack is about 17 MB.

## Built during the event, and what came before

Everything in this repository was built from 1 November 2026 for AccessED Hacks. There was no earlier version. Third-party libraries, fonts, language models and the WordNet data are listed in [THIRD_PARTY.md](THIRD_PARTY.md). Built with AI assistance from OpenAI Codex and Claude Code. All sample worksheets are original and synthetic.

## What still needs work

- Handwriting, full math notation, and merged or borderless tables.
- Sideways pages, which need rotating before import.
- Describing diagrams, which still needs a person.
- Braille contractions: braille output is uncontracted UEB Grade 1, and technical braille is not covered.
- Sessions with screen-reader users and testing on older phones, which is the next step.

## Run it

```bash
npm ci
npm run dev
```

`npm run build` writes the static site to `dist/`. See `package.json` for the sample, asset and test scripts.

MIT licensed. See [LICENSE](LICENSE).
