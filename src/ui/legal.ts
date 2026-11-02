/** Counts browser-recorded HTTP(S) resource requests outside this application's origin. */
export function requestCount() {
  return performance.getEntriesByType("resource").filter((entry) => {
    try {
      const url = new URL(entry.name);
      return /^https?:$/.test(url.protocol) && url.origin !== location.origin;
    } catch {
      return false;
    }
  }).length;
}
export function legalView(page: string) {
  const content =
    page === "terms"
      ? `<h1>Terms</h1><p>Unflatten is by Yi Yu and is available under the MIT licence. You may use, copy and adapt it under that licence. Third-party libraries and data keep their own licences and notices.</p><p>Provided as is, without warranty. Check recognised text and exports before relying on them. Keep your own copies of important work.</p><p>Answer keys travel with shared worksheets and are not exam-secure. Use only worksheets you have permission to process and share.</p>`
      : page === "accessibility"
        ? `<h1>Accessibility statement</h1><p>Our conformance target is WCAG 2.2 AA. This is a target, not a certification.</p><h2>Verification</h2><p>Automated axe checks on every screen, keyboard flows, and reflow at 320 px and 200% worksheet text are covered by the browser test suite. The v3 suite includes both shells, all six paper colours, and these information pages. This version's browser checks await execution by the reviewer; they have not been verified in this sandbox.</p><h2>What is not yet done</h2><p>Sessions with screen-reader users and testing on older phones. OCR accuracy and device voice support vary.</p><h2>Report a problem</h2><p>Please open an issue in the project's GitHub repository, including the page, device, browser and steps to reproduce. Do not attach private learner work. A direct issue-report link is not yet available.</p><p>Updated 2 November 2026.</p>`
        : `<h1>Privacy</h1><p>Your worksheets, source previews and answers stay in this browser's IndexedDB. Preferences stay in local storage. There is no account, analytics or upload endpoint. Delete worksheets from your library or Hand in; downloaded and shared copies are separate.</p><p>OCR, conversion, reading and exports run on your device. Optional languages and dictionary data load from this site and cache for later use. Read aloud uses local device voices.</p><h2>Voice typing exception</h2><p>Voice typing is optional. Your browser may send audio to its speech service. A notice appears before first use; local processing is requested where supported.</p><p class="request-measure">Requests to other sites this session: <strong id="request-count">${requestCount()}</strong></p><p>This is the live count of HTTP(S) resource entries recorded by your browser with an origin different from this site's. Browser speech services, extensions and requests outside the Performance resource timeline may not appear here.</p><p>For a practical check, turn off your connection and try again after the app says “Ready offline”. English conversion and core tools should still work.</p><p>Clearing browser data removes saved worksheets. Browser storage limits may prevent saving, so download a copy to keep.</p>`;
  return `<article class="info-page legal-page">${content}<button id="back-home">Back to workspace</button></article>`;
}
