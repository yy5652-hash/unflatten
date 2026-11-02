# Third-party components and notices

Direct runtime libraries are MIT, Apache-2.0 or BSD. No GPL/AGPL libraries were added. Fonts, language data and the specifically requested WordNet database retain their own notices. `public/licenses/NOTICES.txt` and the per-data notices accompany distributed assets; HTML exports embed notices as part of their data payload.

| Component / locked version                                                                                                                     | Licence      | Use / loading                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [pdf-lib](https://github.com/Hopding/pdf-lib), `pdf-lib` 1.17.1                                                                                | MIT          | Lazy image-only original-page PDF export; local canvas renders system fonts for every script                                              |
| [PDF.js](https://github.com/mozilla/pdf.js), `pdfjs-dist` 6.4.299                                                                              | Apache-2.0   | Lazy PDF extraction and rendering; self-hosted worker, fonts, CMaps and WASM                                                              |
| [Tesseract.js](https://github.com/naptha/tesseract.js) 7.0.0 and its core                                                                      | Apache-2.0   | Lazy local OCR; English LSTM core included offline                                                                                        |
| [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) eng, spa, fra, por, deu, vie, chi_sim, ara                                     | Apache-2.0   | English precached; seven optional self-hosted packs cached on demand. Sources, byte sizes and hashes in `public/vendor/data-sources.json` |
| [Atkinson Hyperlegible Next](https://fontsource.org/fonts/atkinson-hyperlegible-next), `@fontsource-variable/atkinson-hyperlegible-next` 5.3.0 | OFL-1.1      | Self-hosted variable Latin face, primary UI and worksheet font                                                                            |
| [Atkinson Hyperlegible Mono](https://fontsource.org/fonts/atkinson-hyperlegible-mono), `@fontsource/atkinson-hyperlegible-mono` 5.3.0          | OFL-1.1      | Self-hosted counts and numbers                                                                                                            |
| [fflate](https://github.com/101arrowz/fflate) 0.8.3                                                                                            | MIT          | Lazy compressed class links and EPUB ZIP containers                                                                                       |
| [docx](https://github.com/dolanmiu/docx) 9.15.1                                                                                                | MIT          | Lazy Word export, native headings/lists/tables                                                                                            |
| [Mammoth](https://github.com/mwilliamson/mammoth.js) 1.13.0                                                                                    | BSD-2-Clause | Lazy `.docx` text extraction; external image loading is not used                                                                          |
| [compromise](https://github.com/spencermountain/compromise) 14.19.0                                                                            | MIT          | Lazy English parts-of-speech labels                                                                                                       |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4                                                                    | MIT          | Lazy local SVG QR generation                                                                                                              |
| [Hypher](https://github.com/bramstein/hypher) 0.2.5                                                                                            | BSD-3-Clause | Lazy hyphenation engine; permissible substitute for the brief’s suggested MIT library                                                     |

## Hyphenation data

The `hyphenation.en-us` and `hyphenation.es` npm wrappers were inspected and removed: their package metadata did not establish a sufficiently clear licence, and the wrapper repository gives a blanket LGPL notice. They are not dependencies and are not shipped.

Instead, `scripts/vendor-patterns.mjs` converts the explicitly licensed files from [tex-hyphen](https://github.com/hyphenation/tex-hyphen/tree/master/hyph-utf8/tex/generic/hyph-utf8/patterns/tex). The generated JSON and original notices are in `public/patterns/`, fetched only on use:

- `hyph-es.tex`: Javier Bezos / CervanTeX, MIT/X11, version 5.0 (2019-09-24).
- `hyph-en-us.tex`: Gerard D. C. Kuiken / original TeX tables, version 2005-05-30; explicit permission to copy and distribute with or without modification, preserving notices. This is data under its original permissive notice, not an LGPL library.

Hyphenation is a reading aid, not an authoritative spoken-syllable dictionary.

## Dictionary

[`wordnet-db` 3.1.14](https://github.com/moos/wordnet-db) is a build-only dependency. Its package metadata says MIT, but the bundled **WordNet 3.0 database has the Princeton WordNet licence**. That licence permits use, copying, modification and distribution without fee, with its copyright and disclaimer retained. The database is not described as MIT in the app.

The build selects single-word entries with at least one tagged sense and emits short first-sense glosses. The full database is not shipped. `public/dictionary/LICENSE` preserves the actual licence and disclaimer; the combined notices and HTML copies include it. WordNet 3.0 Copyright 2006 by Princeton University. No endorsement is implied.

## Development only

Vite 8.3.5 (MIT), TypeScript 7.0.2 (Apache-2.0), Vitest 5.0.5 (MIT), Playwright 1.64.1 (Apache-2.0), axe-core/@axe-core/playwright 4.14.0 (MPL-2.0), @napi-rs/canvas 1.1.0 (MIT), @types/node (MIT) and wordnet-db build the app and tests. Prettier 3.9.10 (MIT) was used via `npx` to format changed files; it is not a runtime dependency. The lockfile records transitive dependencies. Third-party PDF fonts/CMaps/WASM keep the upstream notices already included under `public/vendor/pdf/`.

## Official API references checked for this implementation

Context7 was used for fflate 0.8.3, docx, Mammoth, compromise, Tesseract.js and Prettier 3.9.10. Where an exact release was not indexed, documentation was checked against installed package types and source. Hypher and qrcode-generator were not found correctly by Context7; their official repository/package documentation was used instead.

- [fflate API](https://github.com/101arrowz/fflate/blob/v0.8.3/docs/README.md)
- [docx documentation](https://github.com/dolanmiu/docx/tree/master/docs)
- [Mammoth browser input](https://github.com/mwilliamson/mammoth.js#api)
- [compromise API](https://github.com/spencermountain/compromise#api)
- [Tesseract worker and OSD prerequisites](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)
- [Chrome Translator](https://developer.chrome.com/docs/ai/translator-api), [Rewriter](https://developer.chrome.com/docs/ai/rewriter-api), [built-in AI availability](https://developer.chrome.com/docs/ai/get-started)
- [UEB rules](https://iceb.org/publications/ueb/), [UEB punctuation overview](https://www.brailleauthority.org/ueb/abcs/abcs-ueb.html). The small translator in this repository is original code; these are notation references, not a certification.

## Feature benchmarks

About links to [Kami Companion reading](https://help.kamiapp.com/companion-help-center/read-aloud), [Microsoft learning tools](https://support.microsoft.com/en-us/education/student-help-center/boost-reading-comprehension-with-learning-tools), [Anthology Ally alternative formats](https://help.anthology.com/ally-web/en/visitors/alternative-formats.html) and [TeacherMade](https://teachermade.com/). These references inform the feature checklist. No claim of identical accuracy, institution integration, pricing superiority or endorsement is made.

## Original work and AI assistance

The UI, reading-order/rule/classifier extensions, editing and feedback workflows, sharing, offline packaging, exports, synthetic sample worksheets and tests are project code. The app was built with OpenAI Codex and Claude Code. Samples A–D contain no real learner data. LiteParse was considered for v1 but its code is not included.

## v3 interface icons

The inline `panels-top-left` icon is from [Lucide](https://github.com/lucide-icons/lucide/blob/main/icons/panels-top-left.svg), under its [ISC licence](https://github.com/lucide-icons/lucide/blob/main/LICENSE). Copyright (c) 2026 Lucide Icons and Contributors. Only this SVG is bundled, with no runtime dependency. Its notice is in `public/licenses/lucide.txt`, the combined notices, and standalone HTML exports.

For v3 browser-test changes, Context7 CLI retrieval failed (network fetch). Playwright 1.64.1 installed types and the [official Locator API](https://playwright.dev/docs/api/class-locator#locator-blur) were used instead; no dependency versions changed.

The v3 conversion preview uses the already pinned PDF.js 6.4.299 API and self-hosted worker/data. Context7 retrieval also failed for this query; the [official PDF.js canvas example](https://mozilla.github.io/pdf.js/examples/), installed types and existing converter setup were checked.

Phase 2 uses pdf-lib 1.17.1, checked against Context7 official repository documentation and the installed release types (including `setLanguage`). Tesseract.js 7.0.0 uses its existing worker and `recognize` blocks output; Context7 indexed no exact v7 documentation, so the installed v7 API/types were also checked. No OSD or third-party runtime requests are used.
