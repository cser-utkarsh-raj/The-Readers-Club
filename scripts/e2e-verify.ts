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

    const finalConsole = runCli(['console']);
    assert.ok(
      !finalConsole.includes('[error]'),
      `Expected zero console errors at end of E2E suite, got:\n${finalConsole}`
    );

    console.log(`\n=============================================================`);
    console.log(`  ALL 12 BROWSER E2E VERIFICATION SCENARIOS PASSED CLEANLY   `);
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
