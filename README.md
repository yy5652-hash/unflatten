# Unflatten

**Your worksheet is a picture. We make it a page.**

A scanned worksheet says nothing to a screen reader and has nowhere to type. Unflatten turns a PDF, photo, Word file or pasted text into a real web worksheet: read in order, filled in by keyboard, usable offline, and your file never leaves your device.

Demo: **https://yy5652-hash.github.io/unflatten/**. No account and no personal details are needed. Press **Try a scanned worksheet — 30 seconds** and it converts in your browser.

## The barrier

A blind, low-vision or dyslexic student gets a worksheet as a scan or a phone photo. Their screen reader finds no text at all. On a two-column handout it can read across the columns and mix two passages together. Either way there is nowhere to type, so the student waits for someone to convert it, and the class moves on.

| Sample | Before | With Unflatten |
| --- | --- | --- |
| Photosynthesis, image-only scan | 0 characters a screen reader can reach, 0 form fields | 3 questions, 6 labelled form fields |
| Rock Cycle Review, image-only scan | 0 characters a screen reader can reach, 0 form fields | A real table, checkboxes and a word bank |
| The Water Cycle, two-column PDF | Text with no headings, no tags, 0 form fields | Column by column, 4 questions, 7 labelled form fields |

Synthetic perspective-and-shadow test: 0 questions without page correction, 3 with page correction.

Every conversion measures this from the file and shows it beside the worksheet.

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
2. Press Tab and answer with only the keyboard. Each blank is announced with its place, such as "Blank 1 of 2: Plants take in blank and release blank."
3. Open **Original** and move between questions to see the source lines light up.
4. Press play in the bottom bar, then open **Aa** and change the page colour.
5. Open **Hand in**: the preview shows your answers on the original page.
6. Turn off your connection, reload, and convert another sample.

## How it works

1. **Read the page.** PDF.js reads text and positions. A photo is cropped to the sheet, flattened and freed of shadows. A page without usable text is deskewed, turned upright if needed and recognised on the device with Tesseract.
2. **Find the blanks as ink.** OCR reads a run of underscores as nothing or as noise, so a plain OCR pipeline loses what makes a worksheet a worksheet. Unflatten finds long, thin dark lines in the page image, including skewed ones, and places them back into the sentence. Lines under real words count as underlines. Checkbox outlines and ruled tables are found the same way.
3. **Put it in reading order.** A whitespace cut separates columns, and repeated headers and footers are removed.
4. **Rebuild the structure.** Lines become a title, headings, instructions, passages, Name and Date fields, questions, tables and word banks, all as native HTML.
5. **Show the uncertainty.** A line below 80% OCR confidence is marked "This line may have been misread", on screen and for screen readers. Figures stay as pictures, with the text found inside them and a field for a helper's description. None is invented.

6. **Put answers back on the paper.** Each blank, option, checkbox and table cell keeps its position on the page, so typed answers can be drawn where a pen would have put them. An answer that has no reliable position goes on a labelled extra page. It is never guessed.

Review scan walks through the uncertain lines one at a time, with the image crop, read aloud and "Looks right". Text saves as you type. Every block can still be corrected, retyped, reordered, split, merged or deleted, by keyboard, with undo and redo.

## Privacy

Your file is processed in your browser. There are no accounts, analytics or uploads, and the site makes no third-party requests. Read aloud uses your device's voices. Voice typing is the one opt-in exception, and it says so at first use: the browser may send your voice to its speech service, and nothing goes to Unflatten. Practice copies include the selected self-check keys. Prepare lesson → Assignment removes keys and correctness data from the student model. Files and teacher comments move by download/import, with no live classroom connection. Temporary work stays in memory/session storage until it is cleared; downloaded copies are separate files.

## Verified by tests

`npm test` runs unit and OCR tests. `npm run e2e` runs browser tests in Chromium at desktop and 360 px widths:

- Real OCR on the scanned samples gives the exact expected questions, tables and checkboxes.
- Pages turned 90, 180 and 270 degrees give the same questions as the clean scan.
- A two-column PDF reads column by column, and vector-line blanks become fields.
- A whole worksheet can be filled with the keyboard alone, and answers survive a reload.
- After the first load, a scan converts end to end with the network off.
- No request leaves the site during any flow.
- axe-core reports zero violations on every screen in all six page colours and both shells, and on the exported file.
- The floating reader never covers the field that has focus.
- Nothing scrolls sideways at 320 px with text at 200%.
- Answers appear as ink inside the first blank on the rendered original, and not on a blank copy.
- Every export downloads a valid file, and a share link opens in a fresh browser with the worksheet and no answers.

The first screen loads about 18 KB of gzipped JavaScript, and the offline pack is about 18.6 MB. The build enforces limits of 60 KB and 25 MB respectively.

The v3.2-B file and feedback unit tests pass. New teacher/student browser journeys and axe checks are in `tests/e2e/site-v32b.spec.ts` for both desktop and 360 px; they require a local browser run (`npm run e2e`).

## Built during the event, and what came before

The application and conversion workflow were built for this event on top of the credited open-source libraries. Development began on 1 November 2026. Third-party libraries, fonts, language models and the WordNet data are listed in [THIRD_PARTY.md](THIRD_PARTY.md). Built with AI assistance from OpenAI Codex and Claude Code. All sample worksheets are original and synthetic.

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
