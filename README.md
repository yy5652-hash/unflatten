# Unflatten

**Turn scanned worksheets into questions students can read, answer by keyboard, and return.**

A student receives a science worksheet as an image-only scan: the words are visible, but the file has no embedded text and no answer fields. Unflatten rebuilds supported printed worksheets as web pages with labelled controls, so the student can read the questions, answer by keyboard and hand back the same assignment. Processing happens in the browser; recognised text and answer placement can always be checked against the original.

Demo: **https://yy5652-hash.github.io/unflatten/**. No account and no personal details are needed. Press **Try a scanned worksheet — 30 seconds** and it converts in your browser.

## For judges: what to check

- **Four-step route:** Try a scanned worksheet → Tab into question 2 and fill both blanks → Original (source lines light up) → Hand in → Teacher — original-layout PDF.
- **Test report:** [Verified by tests](#verified-by-tests), dated, with the exact commands.
- **Scope:** clear printed worksheets in the supported layouts; see [What still needs work](#what-still-needs-work).

| Area | What it shows |
| --- | --- |
| `src/parse/` | Reading order, questions, blanks found as ink, tables and checkboxes |
| `src/ui/view.ts` | Native controls and their accessible names |
| `src/features/onpaper.ts` | Answers placed back on the original page, with a labelled extra page for anything that does not fit |
| `src/features/files.ts` | `studentWorksheet()` strips keys from Assignment copies; file validation, returns and feedback |
| `scripts/build-offline.mjs` | The offline pack and its size gate |
| `tests/` | Unit, OCR and browser tests |

## The barrier

An image-only worksheet can lack embedded text, reading structure and answer controls. Even when OCR extracts the words, a blind, low-vision or dyslexic student may still have no practical way to move between the questions and complete the exercise by keyboard. On a two-column handout, text can be read straight across the columns. So the student waits for someone to convert the sheet, and the class moves on.

| Sample | Before | With Unflatten |
| --- | --- | --- |
| Photosynthesis, image-only scan | 0 embedded text characters, 0 form fields | 3 questions, 6 labelled form fields (Name, Date and four answers) |
| Rock Cycle Review, image-only scan | 0 embedded text characters, 0 form fields | A real table, checkboxes and a word bank |
| The Water Cycle, two-column PDF | Text with no headings, no tags, 0 form fields | Column by column, 4 questions, 7 labelled form fields |

Synthetic perspective-and-shadow test: page correction increases detected questions from 1 to 3. One controlled example, not an accuracy estimate.

Every conversion measures the before/after counts from the file and shows them beside the worksheet. All samples are original synthetic worksheets made for this project.

## What it does

| Need | What Unflatten gives you | The tools it was benchmarked against |
| --- | --- | --- |
| Read | Continuous read aloud with word highlighting, speed up to 3× and voice control, six page colours, text, line, letter and column controls, a reading ruler and screen mask, syllable view, parts of speech, an offline dictionary | Immersive Reader, Kami Companion, Speechify |
| Understand | Translate, Simplify and Explain with Chrome's on-device AI, where the browser provides it; simple math read as words | Kami Companion |
| Answer | Native radios, checkboxes, blanks, short answers, ruled tables and matching rows; voice typing; answers saved on the device; a question outline with progress | Kami, TeacherMade |
| Compare | The original page beside the worksheet. Focus a question and its source lines light up; select a line and you return to its question | Kami |
| Practise | A teacher sets an answer key and hints; students check answers, hear the feedback and retry | TeacherMade |
| Prepare & distribute | Review uncertain lines and undescribed figures, choose Practice self-check keys or an Assignment with keys removed, preview the student copy, and download offline HTML with the original page; compact links omit original pages and figure images | TeacherMade |
| Keep a master | Download a versioned `.unflatten.json` backup, import backups or Unflatten HTML from home/library, duplicate for another class, and choose saved work or a new conversion when reopening a source | — |
| Shared devices | Students choose device saving or a temporary session, download using an optional student code, then end and clear temporary work | — |
| Local feedback | Import multiple student return files, flag version mismatches, avoid duplicate entries, add question and overall comments, and return a feedback file students can import while keeping their answers | — |
| Hand in | Choose who it is for. Teachers get the original page back with the answers drawn in place; screen-reader users get self-contained HTML; also Word, EPUB 3, UEB Grade 1 braille (.brf), text, print, Web Share and email | Anthology Ally, Kami |
| Clean up photos | Finds the sheet, corrects perspective, removes shadows and turns sideways pages upright, with four corners you can adjust by pointer or arrow keys | CamScanner |

Input covers PDFs, photos (several pages at once), Word, text and pasted screenshots, with OCR in English, Spanish, French, Portuguese, German, Vietnamese, Simplified Chinese and Arabic, including right-to-left layout.

## Try it in 30 seconds

1. Press **Try a scanned worksheet — 30 seconds**. The scan is recognised in your browser.
2. Press Tab and answer question 2 with only the keyboard. Each blank has an accessible name with its place, such as "Blank 1 of 2: Plants take in blank and release blank."
3. Open **Original** and move between questions to see the source lines light up.
4. Open **Hand in** → **Teacher — original-layout PDF**: download it and your answers are on the original page.
5. Practice mode: in **Review scan** add an answer key and a hint, answer wrongly, press **Check answers**, read the hint, press **Retry incorrect answers** (your answers stay and focus moves to the wrong blank) and correct it.
6. After **Ready offline** appears, turn off your connection, reload, and convert another sample.

## How it works

1. **Read the page.** PDF.js reads text and positions. A photo is cropped to the sheet, flattened and freed of shadows. A page without usable text is deskewed, turned upright if needed and recognised on the device with Tesseract.
2. **Find the blanks as ink.** OCR reads a run of underscores as nothing or as noise, so a plain OCR pipeline loses what makes a worksheet a worksheet. Unflatten finds long, thin dark lines in the page image, including skewed ones, and places them back into the sentence. Lines under real words count as underlines. Checkbox outlines and ruled tables are found the same way.
3. **Put it in reading order.** A whitespace cut separates columns, and repeated headers and footers are removed.
4. **Rebuild the structure.** Lines become a title, headings, instructions, passages, Name and Date fields, questions, tables and word banks, all as native HTML.
5. **Show the uncertainty.** A line below 80% OCR confidence is marked "This line may have been misread", on screen and for screen readers. Figures stay as pictures, with the text found inside them and a field for a helper's description. None is invented.

6. **Put answers back on the paper.** Each blank, option, checkbox and table cell keeps its position on the page, so typed answers can be drawn where a pen would have put them. An answer that has no reliable position goes on a labelled extra page. It is never guessed.

Review scan walks through the uncertain lines one at a time, with the image crop, read aloud and "Looks right". Text saves as you type. Every block can still be corrected, retyped, reordered, split, merged or deleted, by keyboard, with undo and redo.

## Privacy

Worksheet conversion and exports run on your device. Unflatten has no upload endpoint, accounts or analytics, and the site makes no third-party requests. Read aloud uses your device's voices. Voice typing is the one opt-in exception, and it says so at first use: the browser may send your voice to its speech service, and nothing goes to Unflatten. Compact links store the worksheet in the URL fragment, which is not sent to the web server; anyone who receives a link can read its contents. Practice copies can include self-check keys. Assignment copies remove keys and correctness data from the student data itself (a whitelist in `studentWorksheet()`, `src/features/files.ts`), not just from the screen. Neither is an exam-security system. Files and teacher comments move by download/import, with no live classroom connection. Temporary work stays in memory/session storage until it is cleared; downloaded copies are separate files.

## Verified by tests

Last full run: **18 November 2026**, on the v3.3 source that is deployed to the demo, macOS 27.2, Node 24.21, Playwright 1.64.1 with its bundled Chromium.

| Command | Result |
| --- | --- |
| `npm test` (unit and OCR tests, 10 files) | 103 passed, 0 failed, 0 skipped |
| `npm run e2e` (browser tests, desktop 1280 × 900 and phone 360 × 800) | 110 passed, 0 failed, 0 skipped |
| `npm run build` size gates | first screen 18.5 KB gzipped JavaScript (limit 60 KB); offline pack 18.6 MB (limit 25 MB) |

The browser tests cover:

- Real OCR on the scanned samples gives the exact expected questions, tables and checkboxes; pages turned 90, 180 and 270 degrees give the same questions.
- A two-column PDF reads column by column, and vector-line blanks become fields.
- A whole worksheet can be filled with the keyboard alone, each field has the expected accessible name, and answers survive a reload.
- Practice: Check answers shows the teacher's hint; Retry keeps the answers and focuses only the incorrect blank.
- After "Ready offline", a scan converts end to end with the network off, and no request leaves the site during any flow.
- axe-core reports zero violations on every screen tested, in all six page colours, and on exported files.
- Teacher PDF: every answer drawn on the sheet is at least 9 pt; anything that does not fit goes on an extra page labelled with its question and blank, and the count says so.
- Prepare lesson: an Assignment copy contains no answer key or correctness data in its raw file.
- Master files import and duplicate without touching the original; shared-device temporary sessions end with download or discard and leave nothing behind.
- Return files and teacher feedback round-trip; mismatched versions are flagged.

Reproduce from a clean checkout:

```bash
npm ci
npx playwright install chromium
npm test
npm run build
npm run e2e
```

## Built during the event, and what came before

I built the application interface, the reconstruction logic and the student and teacher workflows during the event (from 1 November 2026), on top of the credited open-source components. Core runtime: PDF.js, Tesseract and my own reconstruction code. Optional runtime features: Chrome's on-device AI (Translate, Simplify, Explain) where the browser provides it. Third-party libraries, fonts, language models and the WordNet data are listed in [THIRD_PARTY.md](THIRD_PARTY.md). Development used AI coding assistance from OpenAI Codex and Claude Code. All sample worksheets are original and synthetic; no real learner data is used.

## What still needs work

- Handwriting, full math notation, and merged or borderless tables.
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
