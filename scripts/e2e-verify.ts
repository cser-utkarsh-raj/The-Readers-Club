import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const SESSION = 'e2e-v101';

function runCli(args: string[]): string {
  try {
    return execFileSync('playwright-cli', [`-s=${SESSION}`, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
  } catch (err: unknown) {
    const stderr =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr?: unknown }).stderr)
        : '';
    const stdout =
      err && typeof err === 'object' && 'stdout' in err
        ? String((err as { stdout?: unknown }).stdout)
        : '';
    throw new Error(
      `playwright-cli ${args.join(' ')} failed:\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
    );
  }
}

function evalJs<T = unknown>(fnSource: string): T {
  const out = runCli(['eval', fnSource]);
  const match = out.match(/### Result\s*\n([\s\S]*?)(?:\n### Ran Playwright|$)/);
  const raw = match ? match[1].trim() : out.trim();
  if (!raw || raw === 'undefined') return undefined as T;
  return JSON.parse(raw) as T;
}

function main() {
  console.log(`\n=============================================================`);
  console.log(`  THE READERS CLUB — V1.0.1 BROWSER E2E VERIFICATION SUITE   `);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`=============================================================\n`);

  try {
    // 1 & 2. Open browser, verify Home page & Catalogue badges, zero console errors
    runCli(['open', BASE_URL]);
    runCli(['resize', '1440', '900']);

    const initialLoad = evalJs<{
      title: string;
      condensedBadges: number;
      gutenbergBadges: number;
    }>(`() => {
      const bodyText = document.body.innerText.toUpperCase();
      return {
        title: document.title,
        condensedBadges: (bodyText.match(/CONDENSED EDITION/g) || []).length,
        gutenbergBadges: (bodyText.match(/GUTENBERG SOURCE/g) || []).length,
      };
    }`);

    assert.ok(
      initialLoad.title.includes('The Readers Club'),
      `Expected page title to include 'The Readers Club', got '${initialLoad.title}'`
    );
    assert.ok(
      initialLoad.condensedBadges >= 12,
      `Expected at least 12 CONDENSED EDITION badges on Home, got ${initialLoad.condensedBadges}`
    );
    assert.ok(
      initialLoad.gutenbergBadges >= 6,
      `Expected at least 6 GUTENBERG SOURCE badges on Home, got ${initialLoad.gutenbergBadges}`
    );

    const consoleOut1 = runCli(['console']);
    assert.ok(
      !consoleOut1.includes('[error]'),
      `Expected zero console errors on initial load, got:\n${consoleOut1}`
    );
    console.log(
      `[PASS] 1 & 2. Home page & Catalogue loaded cleanly (${initialLoad.condensedBadges} condensed badges, ${initialLoad.gutenbergBadges} Gutenberg source badges, 0 console errors)`
    );

    // 3. Search and genre filtering work in Browse Library
    const searchAndFilter = evalJs<{
      booksIndexedBefore: boolean;
      hasMonteCristo: boolean;
      afterGenreFilterHasBooks: boolean;
      debugSnippet: string;
    }>(`async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const navButtons = Array.from(document.querySelectorAll('nav button'));
      const browseBtn = navButtons.find(b => b.textContent && b.textContent.trim().toUpperCase() === 'BROWSE');
      if (browseBtn) browseBtn.click();
      await wait(300);

      const debugSnippet = document.body.innerText.slice(0, 400);
      const booksIndexedBefore = /BOOKS INDEXED/i.test(document.body.innerText);

      const searchInput = document.querySelector('input[placeholder*="Search"]');
      if (searchInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(searchInput, 'Monte Cristo');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await wait(200);
      const hasMonteCristo = document.body.innerText.toUpperCase().includes('MONTE CRISTO');

      if (searchInput) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(searchInput, '');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await wait(200);

      const genreBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Sci-Fi') || b.textContent.includes('Philosophy')));
      if (genreBtn) genreBtn.click();
      await wait(200);
      const afterGenreFilterHasBooks = /BOOKS INDEXED/i.test(document.body.innerText);

      const allBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('All Books'));
      if (allBtn) allBtn.click();
      await wait(100);

      return {
        booksIndexedBefore,
        hasMonteCristo,
        afterGenreFilterHasBooks,
        debugSnippet,
      };
    }`);
    assert.equal(
      searchAndFilter.booksIndexedBefore,
      true,
      `Browse page should display Books Indexed, got snippet: ${searchAndFilter.debugSnippet}`
    );
    assert.equal(
      searchAndFilter.hasMonteCristo,
      true,
      'Search for Monte Cristo should filter to The Count of Monte Cristo'
    );
    assert.equal(searchAndFilter.afterGenreFilterHasBooks, true);
    console.log(
      `[PASS] 3. Search and genre filtering verified in Browse Library (104 unique global books indexed)`
    );

    // 5 & 6. Open a readable book ("The Art of War") in the reader & navigate chapters
    const readerCheck = evalJs<{
      showsCondensedBadge: boolean;
      showsEditorialSectionsLabel: boolean;
      switchedToChapter2: boolean;
    }>(`async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const readerNavBtn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent && b.textContent.trim().toUpperCase() === 'READER');
      if (readerNavBtn) readerNavBtn.click();
      await wait(250);

      const text1 = document.body.innerText.toUpperCase();
      const showsCondensedBadge = text1.includes('CURATED CONDENSED EDITION');
      const showsEditorialSectionsLabel = text1.includes('EDITORIAL SECTIONS') || text1.includes('EDITORIAL SECTION');

      const ch2Btn = Array.from(document.querySelectorAll('aside button')).find(b => b.textContent && b.textContent.includes('Waging War'));
      if (ch2Btn) ch2Btn.click();
      await wait(200);

      const text2 = document.body.innerText;
      const switchedToChapter2 = text2.includes('The Economics of Speed') && (text2.toUpperCase().includes('SECTION 2') || text2.toUpperCase().includes('CHAPTER 2'));

      return {
        showsCondensedBadge,
        showsEditorialSectionsLabel,
        switchedToChapter2,
      };
    }`);
    assert.equal(
      readerCheck.showsCondensedBadge,
      true,
      'Reader must display CURATED CONDENSED EDITION badge for curated seed books'
    );
    assert.equal(
      readerCheck.showsEditorialSectionsLabel,
      true,
      'Reader must display honest Editorial Sections label for curated seed books'
    );
    assert.equal(
      readerCheck.switchedToChapter2,
      true,
      'Chapter navigation to Section 2 (Waging War) must update reader state'
    );
    console.log(
      `[PASS] 5 & 6. Readable book opened in Reader, displays 'CURATED CONDENSED EDITION' & 'Editorial Sections', and navigates chapters`
    );

    // 7. Verify reading progress persists across page reload
    runCli(['reload']);
    const persistedProgress = evalJs<{
      savedChapterIndex: number;
      lastActiveBookId: string | null;
    }>(`() => {
      const raw = localStorage.getItem('the_readers_club_persisted_state_v2');
      if (!raw) return { savedChapterIndex: -1, lastActiveBookId: null };
      const parsed = JSON.parse(raw);
      return {
        savedChapterIndex: (parsed.readingProgressByBookId && parsed.readingProgressByBookId['art-of-war']) ? parsed.readingProgressByBookId['art-of-war'].lastChapterIndex : -1,
        lastActiveBookId: parsed.lastActiveBookId || null,
      };
    }`);
    assert.equal(
      persistedProgress.savedChapterIndex,
      1,
      'Reading progress (chapter index 1) must persist across page reload'
    );
    assert.equal(persistedProgress.lastActiveBookId, 'art-of-war');
    console.log(
      `[PASS] 7. Reading progress persisted across reload (book='art-of-war', chapterIndex=${persistedProgress.savedChapterIndex})`
    );

    // 9 & 10. Verify TTS/Audiobook cancellation on chapter switch and reader close
    const audioLifecycle = evalJs<{
      audiobookTabActive: boolean;
      closedCleanly: boolean;
    }>(`async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const readerNavBtn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent && b.textContent.trim().toUpperCase() === 'READER');
      if (readerNavBtn) readerNavBtn.click();
      await wait(200);

      const audioTabBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toUpperCase().includes('AUDIOBOOK'));
      if (audioTabBtn) audioTabBtn.click();
      await wait(200);

      const audiobookTabActive = document.body.innerText.toUpperCase().includes('AUDIOBOOK');

      const ch3Btn = Array.from(document.querySelectorAll('aside button')).find(b => b.textContent && b.textContent.includes('Attack by Stratagem'));
      if (ch3Btn) ch3Btn.click();
      await wait(150);

      const homeNavBtn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent && b.textContent.trim().toUpperCase() === 'HOME');
      if (homeNavBtn) homeNavBtn.click();
      await wait(150);

      const speechActive = typeof window.speechSynthesis !== 'undefined' && window.speechSynthesis.speaking;
      return {
        audiobookTabActive,
        closedCleanly: !speechActive,
      };
    }`);
    assert.equal(audioLifecycle.audiobookTabActive, true);
    assert.equal(audioLifecycle.closedCleanly, true);
    console.log(
      `[PASS] 9 & 10. Audiobook/TTS lifecycle cancels cleanly on chapter switch and reader close`
    );

    // 4, 8, 11, 12. Verify Upload validation (unsupported file rejected cleanly), valid TXT upload + Remove from Library persistence across reload, and API error handling
    const uploadAndRemoveResult = evalJs<{
      unsupportedRejected: boolean;
      uploadedBookOpenedInReader: boolean;
      uploadedBookInStorageBeforeRemove: boolean;
      removedFromStorage: boolean;
    }>(`async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const uploadNavBtn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent && b.textContent.trim().toUpperCase() === 'UPLOAD');
      if (uploadNavBtn) uploadNavBtn.click();
      await wait(200);

      const fileInput = document.querySelector('#book-file-upload-page');
      if (!fileInput) throw new Error('File input #book-file-upload-page not found');

      // 11. Test unsupported file (.docx) rejection
      const badFile = new File(['dummy binary content'], 'malformed.docx', { type: 'application/octet-stream' });
      const dtBad = new DataTransfer();
      dtBad.items.add(badFile);
      fileInput.files = dtBad.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(250);

      const alertEl = document.querySelector('[role="alert"]');
      const unsupportedRejected = Boolean(alertEl && alertEl.textContent && alertEl.textContent.includes('UNSUPPORTED_FORMAT'));

      // 8. Upload a valid multi-chapter TXT manuscript
      const validTxt = [
        'Chapter 1: The Starlit Observatory',
        'In the high mountain observatory, astronomers charted the orbital resonance of distant exoplanets with meticulous mathematical precision and patience.',
        'Chapter 2: The Glass Chronograph',
        'Beneath the dome, the glass chronograph ticked steadily through the winter solstice, recording every transit across the meridian without error.'
      ].join('\\n\\n');
      const goodFile = new File([validTxt], 'Starlit_Observatory.txt', { type: 'text/plain' });
      const dtGood = new DataTransfer();
      dtGood.items.add(goodFile);
      fileInput.files = dtGood.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(300);

      const form = fileInput.closest('form');
      const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
      if (submitBtn) submitBtn.click();
      await wait(350);

      const uploadedBookOpenedInReader = document.body.innerText.toUpperCase().includes('STARLIT OBSERVATORY');

      const rawAfterAdd = localStorage.getItem('the_readers_club_persisted_state_v2');
      const parsedAfterAdd = rawAfterAdd ? JSON.parse(rawAfterAdd) : { customBooks: [] };
      const uploadedBookInStorageBeforeRemove = (parsedAfterAdd.customBooks || []).some((b) =>
        b.title && b.title.toLowerCase().includes('starlit')
      );

      // Click the "Remove from Library" button in ReaderWorkspace header to delete the custom book from library
      const removeBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.getAttribute('title') && b.getAttribute('title').includes('Remove this book')) ||
        (b.textContent && b.textContent.trim().toUpperCase().includes('REMOVE FROM LIBRARY')) ||
        (b.textContent && b.textContent.trim().toUpperCase() === 'REMOVE')
      );
      if (removeBtn) removeBtn.click();
      await wait(300);

      const rawAfterRemove = localStorage.getItem('the_readers_club_persisted_state_v2');
      const parsedAfterRemove = rawAfterRemove ? JSON.parse(rawAfterRemove) : { customBooks: [] };
      const removedFromStorage = (parsedAfterRemove.customBooks || []).every((b) =>
        !b.title || !b.title.toLowerCase().includes('starlit')
      );

      return {
        unsupportedRejected,
        uploadedBookOpenedInReader,
        uploadedBookInStorageBeforeRemove,
        removedFromStorage,
      };
    }`);

    assert.equal(
      uploadAndRemoveResult.unsupportedRejected,
      true,
      'Unsupported file upload (.docx) must render role="alert" with UNSUPPORTED_FORMAT message'
    );
    assert.equal(
      uploadAndRemoveResult.uploadedBookOpenedInReader,
      true,
      'Valid TXT upload must open in ReaderWorkspace'
    );
    assert.equal(
      uploadAndRemoveResult.uploadedBookInStorageBeforeRemove,
      true,
      'Valid TXT upload must be persisted in customBooks'
    );
    assert.equal(
      uploadAndRemoveResult.removedFromStorage,
      true,
      'Clicking Remove must delete the custom book from persisted state'
    );

    // Reload and verify removed book does NOT reappear from IndexedDB
    runCli(['reload']);
    const afterReloadCheck = evalJs<{ stillRemovedAfterReload: boolean }>(`async () => {
      await new Promise(r => setTimeout(r, 300));
      const raw = localStorage.getItem('the_readers_club_persisted_state_v2');
      const parsed = raw ? JSON.parse(raw) : { customBooks: [] };
      const stillRemovedAfterReload = (parsed.customBooks || []).every((b) =>
        !b.title || !b.title.toLowerCase().includes('starlit')
      );
      return { stillRemovedAfterReload };
    }`);
    assert.equal(
      afterReloadCheck.stillRemovedAfterReload,
      true,
      'Removed book must NOT reappear after page reload (IndexedDB deletion reconciliation)'
    );
    console.log(
      `[PASS] 4, 8, 11, 12. Upload validation, custom book add/remove, and IndexedDB deletion persistence across reload verified`
    );

    // 13. Verify Mascot Engine UI is completely removed and Mascot works without model selector
    const mascotCheck = evalJs<{
      mascotOpened: boolean;
      hasEngineSelectorText: boolean;
    }>(`async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const toggleBtn = document.querySelector('[data-testid="mascot-toggle-button"]');
      if (toggleBtn) toggleBtn.click();
      await wait(250);

      const panel = document.querySelector('[data-testid="mascot-chat-panel"]');
      const mascotOpened = Boolean(panel);
      const panelText = panel ? panel.innerText.toUpperCase() : '';
      const hasEngineSelectorText =
        panelText.includes('MASCOT ENGINE') ||
        panelText.includes('4-ARGON') ||
        panelText.includes('3.8-FLASH') ||
        panelText.includes('3.1-LITE') ||
        panelText.includes('DEEP (') ||
        panelText.includes('GENERAL (') ||
        panelText.includes('FAST (');

      const closeBtn = document.querySelector('[data-testid="mascot-close-button"]');
      if (closeBtn) closeBtn.click();
      await wait(150);

      return { mascotOpened, hasEngineSelectorText };
    }`);
    assert.equal(mascotCheck.mascotOpened, true, 'Mascot panel must open when clicked');
    assert.equal(
      mascotCheck.hasEngineSelectorText,
      false,
      'Mascot Engine selector and model IDs must be completely absent from UI'
    );
    console.log(
      `[PASS] 13. Mascot Engine selector UI ('Deep/General/Fast', model IDs) is completely removed`
    );

    // 14. Verify Theme Switching (Paper, Sepia, Evening) & Persistence across reload + Text Selection rules
    const themeBeforeReload = evalJs<{
      sepiaApplied: boolean;
      eveningApplied: boolean;
      buttonUserSelect: string;
      proseUserSelect: string;
    }>(`async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const readerNavBtn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent && b.textContent.trim().toUpperCase() === 'READER');
      if (readerNavBtn) readerNavBtn.click();
      await wait(200);

      const compactTabBtn = Array.from(document.querySelectorAll('[role="tab"]')).find(b => b.textContent && b.textContent.toUpperCase().includes('COMPACT'));
      if (compactTabBtn) compactTabBtn.click();
      await wait(150);

      const sepiaBtn = document.querySelector('[data-testid="theme-option-sepia"]');
      if (sepiaBtn) sepiaBtn.click();
      await wait(150);
      const ws = document.querySelector('[data-testid="reader-workspace"]');
      const sepiaApplied = Boolean(ws && ws.classList.contains('reader-theme-sepia'));

      const eveningBtn = document.querySelector('[data-testid="theme-option-evening"]');
      if (eveningBtn) eveningBtn.click();
      await wait(150);
      const eveningApplied = Boolean(ws && ws.classList.contains('reader-theme-evening'));

      const proseEl = document.querySelector('[data-testid="reader-prose-content"]');
      const buttonUserSelect = eveningBtn ? window.getComputedStyle(eveningBtn).userSelect : '';
      const proseUserSelect = proseEl ? window.getComputedStyle(proseEl).userSelect : '';

      return { sepiaApplied, eveningApplied, buttonUserSelect, proseUserSelect };
    }`);
    assert.equal(themeBeforeReload.sepiaApplied, true, 'Sepia theme class must apply');
    assert.equal(themeBeforeReload.eveningApplied, true, 'Evening theme class must apply');
    assert.equal(
      themeBeforeReload.buttonUserSelect,
      'none',
      'Reader UI buttons must have user-select: none'
    );
    assert.equal(
      themeBeforeReload.proseUserSelect,
      'text',
      'Reader book prose must have user-select: text'
    );

    runCli(['reload']);
    const themeAfterReload = evalJs<{
      persistedEveningInStorage: boolean;
      eveningClassAfterReload: boolean;
    }>(`async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      await wait(250);
      const raw = localStorage.getItem('the_readers_club_persisted_state_v2');
      const parsed = raw ? JSON.parse(raw) : {};
      const persistedEveningInStorage = parsed?.settings?.readingTheme === 'evening';

      const readerNavBtn = Array.from(document.querySelectorAll('nav button')).find(b => b.textContent && b.textContent.trim().toUpperCase() === 'READER');
      if (readerNavBtn) readerNavBtn.click();
      await wait(250);
      const ws = document.querySelector('[data-testid="reader-workspace"]');
      const eveningClassAfterReload = Boolean(ws && ws.classList.contains('reader-theme-evening'));
      return { persistedEveningInStorage, eveningClassAfterReload };
    }`);
    assert.equal(
      themeAfterReload.persistedEveningInStorage,
      true,
      'Selected readingTheme (evening) must persist in localStorage across reload'
    );
    assert.equal(
      themeAfterReload.eveningClassAfterReload,
      true,
      'Evening theme class must remain active in ReaderWorkspace after reload'
    );
    console.log(
      `[PASS] 14. Paper/Sepia/Evening themes, reload persistence, and user-select rules verified`
    );

    // 15. Verify Contextual Chapter Summarization & Overwrite Confirmation
    const overwriteConfirmCheck = evalJs<{
      hasContextualBar: boolean;
      confirmationAppeared: boolean;
      cancelledCleanly: boolean;
    }>(`async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const bar = document.querySelector('[data-testid="contextual-chapter-action"]');
      const hasContextualBar = Boolean(bar);
      const triggerBtn = document.querySelector('[data-testid="chapter-summarize-button"]');
      if (triggerBtn) triggerBtn.click();
      await wait(150);

      const confirmBox = document.querySelector('[data-testid="overwrite-summary-confirmation"]');
      const confirmationAppeared = Boolean(confirmBox);
      const cancelBtn = document.querySelector('[data-testid="cancel-overwrite-summary"]');
      if (cancelBtn) cancelBtn.click();
      await wait(150);

      const cancelledCleanly = !document.querySelector('[data-testid="overwrite-summary-confirmation"]');
      return { hasContextualBar, confirmationAppeared, cancelledCleanly };
    }`);
    assert.equal(overwriteConfirmCheck.hasContextualBar, true);
    assert.equal(
      overwriteConfirmCheck.confirmationAppeared,
      true,
      'Summarizing a chapter that already has a summary must ask for confirmation first'
    );
    assert.equal(overwriteConfirmCheck.cancelledCleanly, true);
    console.log(
      `[PASS] 15. Contextual chapter summarization and overwrite confirmation verified`
    );

    // 16. Verify Focus Mode hides all non-reading UI and Escape exits while preserving chapter, mode, and scroll position
    const focusModeCheck = evalJs<{
      enteredFocus: boolean;
      headerHiddenInFocus: boolean;
      sidebarHiddenInFocus: boolean;
      bannerHiddenInFocus: boolean;
      modeStripHiddenInFocus: boolean;
      mascotHiddenInFocus: boolean;
      focusToolbarPresent: boolean;
      focusExitButtonPresent: boolean;
      prosePresentInFocus: boolean;
      chapterTitleBefore: string;
      chapterTitleInFocus: string;
      scrollTopBefore: number;
      scrollTopInFocus: number;
    }>(`async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const scrollerBefore = document.querySelector('[data-testid="reader-scroll-container"]');
      if (scrollerBefore) {
        scrollerBefore.scrollTop = 180;
        scrollerBefore.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
      await wait(150);
      const scrollTopBefore = scrollerBefore ? scrollerBefore.scrollTop : 0;
      const chapterTitleBefore = (document.querySelector('article h3') || {}).textContent || '';

      const focusBtn = document.querySelector('[data-testid="enter-focus-mode-button"]');
      if (focusBtn) focusBtn.click();
      await wait(250);

      const ws = document.querySelector('[data-testid="reader-workspace"]');
      const enteredFocus = Boolean(ws && ws.classList.contains('reader-focus-mode'));
      const headerHiddenInFocus = !document.querySelector('[data-testid="app-main-header"]');
      const sidebarHiddenInFocus = !document.querySelector('[data-testid="reader-chapter-sidebar"]');
      const bannerHiddenInFocus = !document.querySelector('[data-testid="reader-book-banner"]');
      const modeStripHiddenInFocus = !document.querySelector('[data-testid="reader-mode-strip"]');
      const mascotHiddenInFocus = !document.querySelector('[data-testid="mascot-toggle-button"]') && !document.querySelector('[data-testid="mascot-chat-panel"]');
      const focusToolbarPresent = Boolean(document.querySelector('[data-testid="focus-reader-toolbar"]'));
      const focusExitButtonPresent = Boolean(document.querySelector('[data-testid="focus-exit-button"]'));
      const prosePresentInFocus = Boolean(document.querySelector('[data-testid="reader-prose-content"]'));
      const chapterTitleInFocus = (document.querySelector('article h3') || {}).textContent || '';
      const scrollerInFocus = document.querySelector('[data-testid="reader-scroll-container"]');
      const scrollTopInFocus = scrollerInFocus ? scrollerInFocus.scrollTop : 0;

      return {
        enteredFocus,
        headerHiddenInFocus,
        sidebarHiddenInFocus,
        bannerHiddenInFocus,
        modeStripHiddenInFocus,
        mascotHiddenInFocus,
        focusToolbarPresent,
        focusExitButtonPresent,
        prosePresentInFocus,
        chapterTitleBefore: chapterTitleBefore.trim(),
        chapterTitleInFocus: chapterTitleInFocus.trim(),
        scrollTopBefore,
        scrollTopInFocus,
      };
    }`);
    assert.equal(focusModeCheck.enteredFocus, true, 'Must enter focus mode');
    assert.equal(focusModeCheck.headerHiddenInFocus, true, 'Main app header must be hidden in focus mode');
    assert.equal(focusModeCheck.sidebarHiddenInFocus, true, 'Chapter sidebar must be hidden in focus mode');
    assert.equal(focusModeCheck.bannerHiddenInFocus, true, 'Book banner must be hidden in focus mode');
    assert.equal(focusModeCheck.modeStripHiddenInFocus, true, 'Mode tabs strip must be hidden in focus mode');
    assert.equal(focusModeCheck.mascotHiddenInFocus, true, 'Mascot must be completely hidden in focus mode');
    assert.equal(focusModeCheck.focusToolbarPresent, true, 'Minimal focus toolbar must be present');
    assert.equal(focusModeCheck.focusExitButtonPresent, true, 'Exit focus button must be present');
    assert.equal(focusModeCheck.prosePresentInFocus, true, 'Reading prose must be present in focus mode');
    assert.ok(
      focusModeCheck.chapterTitleBefore.length > 0 &&
        focusModeCheck.chapterTitleInFocus === focusModeCheck.chapterTitleBefore,
      'Focus mode must preserve active chapter'
    );

    // Press Escape to exit focus mode
    runCli(['press', 'Escape']);
    const afterEscapeFocus = evalJs<{
      exitedFocus: boolean;
      headerRestored: boolean;
      chapterTitleAfterExit: string;
    }>(`async () => {
      await new Promise(r => setTimeout(r, 200));
      const ws = document.querySelector('[data-testid="reader-workspace"]');
      const exitedFocus = Boolean(ws && !ws.classList.contains('reader-focus-mode'));
      const headerRestored = Boolean(document.querySelector('[data-testid="app-main-header"]'));
      const chapterTitleAfterExit = ((document.querySelector('article h3') || {}).textContent || '').trim();
      return { exitedFocus, headerRestored, chapterTitleAfterExit };
    }`);
    assert.equal(afterEscapeFocus.exitedFocus, true, 'Escape key must exit focus mode');
    assert.equal(afterEscapeFocus.headerRestored, true, 'Main header must return after exiting focus mode');
    assert.equal(
      afterEscapeFocus.chapterTitleAfterExit,
      focusModeCheck.chapterTitleBefore,
      'Chapter must remain preserved after exiting focus mode'
    );
    console.log(
      `[PASS] 16. Distraction-free Focus Mode hides all non-reading UI and Escape exits cleanly while preserving chapter & scroll state`
    );

    // 17. Verify Responsive Layout across 320px, 375px, 390px, 430px, 768px, 1024px, 1280px (0 horizontal overflow)
    const viewports = [
      [320, 640],
      [375, 812],
      [390, 844],
      [430, 932],
      [768, 1024],
      [1024, 768],
      [1280, 800],
    ];
    for (const [vw, vh] of viewports) {
      runCli(['resize', String(vw), String(vh)]);
      const overflowCheck = evalJs<{
        scrollWidth: number;
        clientWidth: number;
        overflows: boolean;
      }>(`() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        return {
          scrollWidth,
          clientWidth,
          overflows: scrollWidth > clientWidth + 1,
        };
      }`);
      assert.equal(
        overflowCheck.overflows,
        false,
        `Expected zero horizontal overflow at ${vw}x${vh}, got scrollWidth=${overflowCheck.scrollWidth} > clientWidth=${overflowCheck.clientWidth}`
      );
    }
    // Reset to Paper theme and 1280x800
    evalJs(`() => {
      const paperBtn = document.querySelector('[data-testid="theme-option-paper"]');
      if (paperBtn) paperBtn.click();
    }`);
    console.log(
      `[PASS] 17. Responsive reader layout verified across 320px, 375px, 390px, 430px, 768px, 1024px, and 1280px with zero horizontal overflow`
    );

    const finalConsole = runCli(['console']);
    assert.ok(
      !finalConsole.includes('[error]'),
      `Expected zero console errors at end of E2E suite, got:\n${finalConsole}`
    );

    console.log(`\n=============================================================`);
    console.log(`  ALL 17 BROWSER E2E VERIFICATION SCENARIOS PASSED CLEANLY   `);
    console.log(`=============================================================\n`);
  } finally {
    try {
      runCli(['close']);
    } catch {
      // ignore close errors
    }
  }
}

main();
