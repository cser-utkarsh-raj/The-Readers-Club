import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  buildBookFromExternalCatalogItem,
  buildBookFromExtractedText,
  buildSummaryCacheKey,
  calculateCompactPageAllocation,
  computeContentHash,
  computeMlRecommendations,
  hydrateBookWithGutenbergChapters,
  splitChapterIntoChunks,
} from './bookLogic';
import {
  decodeTextBufferWithEncoding,
  extractTextFromUploadedFile,
  parseEpubBuffer,
  parsePdfBuffer,
  parseTextBuffer,
  resolveEpubRelativePath,
} from './fileExtractor';
import {
  base64AudioToPlayableBlob,
  chunkTextForTts,
  clearTtsDeduplicationCache,
  deriveAudioEngineStatus,
  generateSingleTtsChunkWithRetry,
  getActiveTrackedObjectUrlCount,
  isAudiobookReady,
  revokeAllTrackedAudioObjectUrls,
} from './ttsEngine';
import {
  configureTestStorageAdapters,
  deleteBookFromIndexedDb,
  loadBooksFromIndexedDb,
  loadPersistedAppState,
  migratePersistedState,
  saveBooksToIndexedDb,
  savePersistedAppState,
} from './storage';
import {
  getMascotModelName,
  parseGutenbergPlainTextChapters,
  resolveMascotModelTier,
  validateMascotChatRequest,
  validateSummarizeApiResponse,
  validateSummarizeRequest,
} from '../../../backend/src/server';
import { ExternalCatalogBook, UserTasteProfile } from '../types/book';
import {
  auditCatalogIntegrity,
  classifyBookContentAvailability,
  deduplicateCatalogBooks,
  validateGutenbergSourceMetadata,
} from './catalogIntegrity';
import { OPEN_SOURCE_BOOKS } from '../data/openSourceBooks';
import { GLOBAL_CATALOG_BOOKS } from '../data/globalCatalogSeed';

// ============================================================================
// 1. EPUB MANIFEST & SPINE ORDERING TESTS
// ============================================================================

test('resolveEpubRelativePath resolves nested relative paths accurately', () => {
  assert.equal(
    resolveEpubRelativePath('OEBPS/content.opf', 'text/ch1.xhtml'),
    'OEBPS/text/ch1.xhtml'
  );
  assert.equal(
    resolveEpubRelativePath('OPS/package/book.opf', '../chapters/part1.html#sec1'),
    'OPS/chapters/part1.html'
  );
});

test('parseEpubBuffer follows exact OPF spine order rather than alphabetical filename order', async () => {
  const zip = new JSZip();

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`
  );

  // Notice filenames are z_opening.xhtml, m_middle.xhtml, a_finale.xhtml
  // An alphabetical ZIP parser would read a_finale first! A true spine parser must read z_opening -> m_middle -> a_finale.
  zip.file(
    'OEBPS/package.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="2.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Chronicles of the Spine</dc:title>
        <dc:creator>Ada Lovelace</dc:creator>
      </metadata>
      <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        <item id="cover-doc" href="text/00_cover.xhtml" media-type="application/xhtml+xml"/>
        <item id="ch-first" href="text/z_opening.xhtml" media-type="application/xhtml+xml"/>
        <item id="ch-second" href="text/m_middle.xhtml" media-type="application/xhtml+xml"/>
        <item id="ch-third" href="text/a_finale.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine toc="ncx">
        <itemref idref="cover-doc" linear="no"/>
        <itemref idref="ch-first"/>
        <itemref idref="ch-second"/>
        <itemref idref="ch-third"/>
      </spine>
    </package>`
  );

  zip.file(
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
    <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
      <navMap>
        <navPoint id="np1" playOrder="1">
          <navLabel><text>Chapter I: The Analytical Engine</text></navLabel>
          <content src="text/z_opening.xhtml"/>
        </navPoint>
        <navPoint id="np2" playOrder="2">
          <navLabel><text>Chapter II: Notes on Menabrea</text></navLabel>
          <content src="text/m_middle.xhtml"/>
        </navPoint>
        <navPoint id="np3" playOrder="3">
          <navLabel><text>Chapter III: Poetic Science</text></navLabel>
          <content src="text/a_finale.xhtml"/>
        </navPoint>
      </navMap>
    </ncx>`
  );

  zip.file(
    'OEBPS/text/00_cover.xhtml',
    `<html><body><p>Cover Page Ignored Because linear="no"</p></body></html>`
  );
  zip.file(
    'OEBPS/text/z_opening.xhtml',
    `<html><body><h1>Opening</h1><p>First spine chapter paragraph with sufficient literary length to be verified.</p></body></html>`
  );
  zip.file(
    'OEBPS/text/m_middle.xhtml',
    `<html><body><h1>Middle</h1><p>Second spine chapter paragraph continuing the mathematical treatise in sequence.</p></body></html>`
  );
  zip.file(
    'OEBPS/text/a_finale.xhtml',
    `<html><body><h1>Finale</h1><p>Third spine chapter paragraph concluding the work in exact OPF spine order.</p></body></html>`
  );

  const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });
  const result = await parseEpubBuffer(arrayBuffer, 'spine-test.epub');

  assert.equal(result.availabilityStatus, 'full_text');
  assert.equal(result.extractedTitle, 'Chronicles of the Spine');
  assert.equal(result.extractedAuthor, 'Ada Lovelace');
  assert.equal(result.chapters.length, 3);
  assert.equal(result.chapters[0].title, 'Chapter I: The Analytical Engine');
  assert.equal(result.chapters[1].title, 'Chapter II: Notes on Menabrea');
  assert.equal(result.chapters[2].title, 'Chapter III: Poetic Science');
  assert.ok(result.chapters[0].paragraphs[0].includes('First spine chapter'));
  assert.ok(result.chapters[2].paragraphs[0].includes('Third spine chapter'));
});

// ============================================================================
// 2. PDF EXTRACTION FAILURES & EMPTY/MALFORMED/UNSUPPORTED FILE TESTS
// ============================================================================

test('parsePdfBuffer fails honestly on corrupted PDF bytes without fabricating chapters', async () => {
  const corruptedBytes = new TextEncoder().encode('%PDF-1.4 corrupted binary stream').buffer;
  const res = await parsePdfBuffer(corruptedBytes, 'corrupted.pdf');

  assert.equal(res.availabilityStatus, 'extraction_failed');
  assert.equal(res.chapters.length, 0);
  assert.equal(res.text, '');
  assert.ok(res.errorMessage && res.errorMessage.length > 0);
});

test('extractTextFromUploadedFile rejects empty and unsupported files without synthetic fallback', async () => {
  const emptyFile = new File([], 'empty.epub', { type: 'application/epub+zip' });
  const emptyRes = await extractTextFromUploadedFile(emptyFile);
  assert.equal(emptyRes.availabilityStatus, 'extraction_failed');
  assert.equal(emptyRes.chapters.length, 0);

  const unsupportedFile = new File(['binary content'], 'archive.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const unsupportedRes = await extractTextFromUploadedFile(unsupportedFile);
  assert.equal(unsupportedRes.availabilityStatus, 'unsupported_format');
  assert.equal(unsupportedRes.chapters.length, 0);
});

test('decodeTextBufferWithEncoding handles UTF-16LE BOM and UTF-8 cleanly', () => {
  // UTF-16LE BOM (0xFF, 0xFE) + "Hello"
  const utf16Bytes = new Uint8Array([
    0xff, 0xfe, 0x48, 0x00, 0x65, 0x00, 0x6c, 0x00, 0x6c, 0x00, 0x6f, 0x00,
  ]);
  const decoded = decodeTextBufferWithEncoding(utf16Bytes.buffer);
  assert.equal(decoded, 'Hello');

  const txtResult = parseTextBuffer(
    new TextEncoder().encode(
      `Chapter 1: The First Dawn\n\nParagraph one of the first chapter has plenty of readable words.\n\nChapter 2: The Second Dusk\n\nParagraph one of the second chapter continues the narrative.`
    ).buffer
  );
  assert.equal(txtResult.availabilityStatus, 'full_text');
  assert.equal(txtResult.chapters.length, 2);
  assert.equal(txtResult.chapters[0].title, 'Chapter 1: The First Dawn');
  assert.equal(txtResult.chapters[1].title, 'Chapter 2: The Second Dusk');
});

test('buildBookFromExtractedText never fabricates chapters when input text is empty', () => {
  const failedBook = buildBookFromExtractedText(
    'Empty Upload',
    'No Author',
    '   ',
    'TXT'
  );
  assert.equal(failedBook.availabilityStatus, 'extraction_failed');
  assert.equal(failedBook.chapters.length, 0);
});

// ============================================================================
// 3. EXTERNAL BOOK AVAILABILITY INTEGRITY (NO FAKE CHAPTERS FROM DESCRIPTION)
// ============================================================================

test('buildBookFromExternalCatalogItem marks Google Books items as metadata_only with 0 fake chapters', () => {
  const googleBooksItem: ExternalCatalogBook = {
    id: 'gbooks-test-1',
    title: 'Modern Copyrighted Novel',
    author: 'Contemporary Author',
    year: '2022',
    genre: 'Literary Fiction',
    coverUrl: 'https://example.com/cover.jpg',
    description:
      'A short publisher blurb about a modern novel that does not provide full public domain text.',
    sourceApi: 'google_books',
  };

  const book = buildBookFromExternalCatalogItem(googleBooksItem);
  assert.equal(book.availabilityStatus, 'metadata_only');
  assert.equal(
    book.chapters.length,
    0,
    'Must NEVER manufacture 18 synthetic chapters from a catalog description'
  );
  assert.ok(book.sourceAttribution?.includes('Google Books'));
});

test('buildBookFromExternalCatalogItem and hydrateBookWithGutenbergChapters handle Project Gutenberg books honestly', () => {
  const gutenbergCatalogItem: ExternalCatalogBook = {
    id: 'gutendex-1342',
    gutenbergId: 1342,
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    year: '1813',
    genre: 'Classic Romance',
    chapterCount: 61,
    coverUrl: 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg',
    description: 'Jane Austen classic novel.',
    sourceApi: 'gutendex',
  };

  // Before hydration, chapters array is empty and status is external_source_available (not claiming local full text yet)
  const unhydrated = buildBookFromExternalCatalogItem(gutenbergCatalogItem);
  assert.equal(unhydrated.availabilityStatus, 'external_source_available');
  assert.equal(unhydrated.chapterStructure, 'unparsed');
  assert.equal(unhydrated.verifiedChapterCount, 0);
  assert.equal(unhydrated.estimatedChapterCount, 61);
  assert.equal(unhydrated.chapters.length, 0);

  // Hydrate with real extracted Gutenberg chapters
  const hydrated = hydrateBookWithGutenbergChapters(unhydrated, [
    {
      number: 1,
      title: 'Chapter 1',
      originalText: [
        'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
        'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.',
      ],
    },
    {
      number: 2,
      title: 'Chapter 2',
      originalText: [
        'Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him, though to the last always assuring his wife that he should not go.',
      ],
    },
  ]);

  assert.equal(hydrated.availabilityStatus, 'full_text');
  assert.equal(hydrated.chapterStructure, 'original_chapters');
  assert.equal(hydrated.verifiedChapterCount, 2);
  assert.equal(hydrated.chapters.length, 2);
  assert.ok(hydrated.contentHash?.startsWith('fnv1a-'));
  assert.equal(hydrated.chapters[0].isCompressed, false);
});

test('parseGutenbergPlainTextChapters extracts >80 chapters and >60 paragraphs per chapter without truncation', () => {
  const seventyFiveParas = Array.from(
    { length: 75 },
    (_, idx) =>
      `Paragraph number ${idx + 1} with more than sixty characters of authentic public domain prose from Project Gutenberg.`
  ).join('\n\n');

  const shortChapterBody = Array.from(
    { length: 4 },
    (_, idx) =>
      `Chapter body paragraph ${idx + 1} with sufficient length to pass the 350-character table-of-contents filter cleanly.`
  ).join('\n\n');

  const chaptersText = Array.from({ length: 95 }, (_, cIdx) => {
    const body = cIdx === 0 ? seventyFiveParas : shortChapterBody;
    return `CHAPTER ${cIdx + 1}. The Movement Number ${cIdx + 1}\n\n${body}`;
  }).join('\n\n');

  const sampleGutenberg = `*** START OF THE PROJECT GUTENBERG EBOOK SAMPLE ***\n${chaptersText}\n*** END OF THE PROJECT GUTENBERG EBOOK SAMPLE ***`;

  const chapters = parseGutenbergPlainTextChapters(sampleGutenberg);
  assert.equal(
    chapters.length,
    95,
    'All 95 chapters must be preserved without an 80-chapter cap'
  );
  assert.equal(
    chapters[0].originalText.length,
    75,
    'All 75 paragraphs in Chapter 1 must be preserved without a 60-paragraph cap'
  );
  assert.equal(chapters[0].chapterStructure, 'original_chapters');
});

test('buildBookFromExtractedText preserves >120 chapters without truncation', () => {
  const raw130Chapters = Array.from(
    { length: 130 },
    (_, i) =>
      `Chapter ${i + 1}: Chronicle Part ${i + 1}\n\nThis is the complete narrative paragraph for chapter ${i + 1}, containing over eighty characters of prose so it parses as a full chapter.`
  ).join('\n\n');

  const book = buildBookFromExtractedText(
    'Epic 130-Chapter Tome',
    'Classic Chronicler',
    raw130Chapters,
    'TXT'
  );

  assert.equal(book.availabilityStatus, 'full_text');
  assert.equal(book.chapterStructure, 'original_chapters');
  assert.equal(
    book.chapters.length,
    130,
    'All 130 chapters must be preserved without a 120-chapter cap'
  );
  assert.equal(book.verifiedChapterCount, 130);
});

// ============================================================================
// 4. AI SUMMARIZATION CHUNKING, CACHING & VALIDATION TESTS
// ============================================================================

test('splitChapterIntoChunks splits long chapters at paragraph/sentence boundaries with traceability', () => {
  const longParagraphs = Array.from(
    { length: 20 },
    (_, i) =>
      `Paragraph ${i + 1}: ` +
      'The philosopher examined the ancient manuscript with careful attention to chronology and character relationships. '.repeat(
        6
      )
  );

  const chunks = splitChapterIntoChunks(longParagraphs, 2500);
  assert.ok(chunks.length >= 5, 'Should split ~14,000 chars into multiple chunks');
  assert.equal(chunks[0].paragraphRange[0], 0);
  assert.equal(
    chunks[chunks.length - 1].paragraphRange[1],
    longParagraphs.length - 1
  );
  for (const c of chunks) {
    assert.ok(c.charCount <= 2500);
  }
});

test('buildSummaryCacheKey produces deterministic keys and invalidates when parameters change', () => {
  const hash1 = computeContentHash('Chapter text version A');
  const hash2 = computeContentHash('Chapter text version B');

  const key1 = buildSummaryCacheKey({
    contentHash: hash1,
    chapterId: 'ch-1',
    model: 'gemini-3.8-flash',
    personaId: 'gandalf',
    detailLevel: 'compact',
    targetPages: 2,
  });

  const key1Duplicate = buildSummaryCacheKey({
    contentHash: hash1,
    chapterId: 'ch-1',
    model: 'gemini-3.8-flash',
    personaId: 'gandalf',
    detailLevel: 'compact',
    targetPages: 2,
  });

  const keyDifferentPersona = buildSummaryCacheKey({
    contentHash: hash1,
    chapterId: 'ch-1',
    model: 'gemini-3.8-flash',
    personaId: 'deadpool',
    detailLevel: 'compact',
    targetPages: 2,
  });

  const keyDifferentContent = buildSummaryCacheKey({
    contentHash: hash2,
    chapterId: 'ch-1',
    model: 'gemini-3.8-flash',
    personaId: 'gandalf',
    detailLevel: 'compact',
    targetPages: 2,
  });

  assert.equal(key1, key1Duplicate);
  assert.notEqual(key1, keyDifferentPersona);
  assert.notEqual(key1, keyDifferentContent);
});

test('validateSummarizeRequest and validateSummarizeApiResponse reject invalid inputs', () => {
  const invalidReq = validateSummarizeRequest({
    bookTitle: 'Test Book',
    chapterTitle: 'Chapter 1',
    originalText: ['Too short'],
  });
  assert.equal(invalidReq.valid, false);

  const validReq = validateSummarizeRequest({
    bookTitle: 'The Odyssey',
    chapterTitle: 'Book I',
    originalText: [
      'Tell me, O Muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy.',
    ],
  });
  assert.equal(validReq.valid, true);
  assert.equal(validReq.sanitized?.detailLevel, 'compact');

  assert.equal(
    validateSummarizeApiResponse({ compactText: [], bulletPoints: [] }).valid,
    false
  );
  assert.equal(
    validateSummarizeApiResponse({
      compactText: ['A valid summarized paragraph with substantive literary detail.'],
      bulletPoints: ['A valid bullet point summarizing key events.'],
    }).valid,
    true
  );
});

// ============================================================================
// 5. AUDIOBOOK / TTS CHUNKING, PER-CHUNK RETRY & READINESS STATE TESTS
// ============================================================================

test('chunkTextForTts splits long text at sentence boundaries and preserves punctuation', () => {
  const longText = [
    'First paragraph opens the chapter with a dramatic question? Yes, it immediately establishes the tone!',
    'Second paragraph is much longer. ' +
      'It contains several distinct sentences that must never be sliced in the middle of a word. '.repeat(
        12
      ),
  ];

  const chunks = chunkTextForTts(longText, 400);
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) {
    assert.ok(
      chunk.text.length <= 400,
      `Chunk length ${chunk.text.length} exceeded 400`
    );
    assert.equal(chunk.status, 'pending');
    assert.ok(
      /[.!?]$/.test(chunk.text),
      `Chunk should end cleanly on sentence punctuation: "${chunk.text.slice(-20)}"`
    );
  }
});

test('isAudiobookReady only returns true when all chunks have succeeded, and generateSingleTtsChunkWithRetry retries failed chunks', async () => {
  clearTtsDeduplicationCache();
  const chunks = chunkTextForTts(
    [
      'Sentence one of chunk one is ready for long-form audio synthesis with natural cadence, expressive pauses, and complete sentence boundaries.',
      'Sentence two of chunk two will be tested with a simulated transient network error on the first attempt before succeeding on retry.',
    ],
    200
  );
  assert.equal(chunks.length, 2);
  assert.equal(isAudiobookReady(chunks), false);
  assert.equal(deriveAudioEngineStatus(chunks, false, false), 'generating');

  let callCount = 0;
  const mockFetch = (async () => {
    callCount++;
    if (callCount === 1) {
      return new Response(JSON.stringify({ message: 'Transient 502 error' }), {
        status: 502,
      });
    }
    // 4 bytes of dummy PCM encoded in base64 ("AAAA")
    return new Response(
      JSON.stringify({ audioBase64: 'AAAA', mimeType: 'audio/pcm' }),
      { status: 200 }
    );
  }) as unknown as typeof fetch;

  const firstChunkRes = await generateSingleTtsChunkWithRetry({
    chunk: chunks[0],
    voiceName: 'Charon',
    narratorStylePrompt: 'Calm narrator',
    maxRetries: 2,
    baseDelayMs: 10,
    fetchImpl: mockFetch,
  });

  assert.equal(firstChunkRes.status, 'ready');
  assert.equal(callCount, 2, 'Should have retried after transient failure');
  assert.ok(firstChunkRes.objectUrl);

  // With only chunk 0 ready and chunk 1 still pending, audiobook must NOT claim to be ready
  const partialList = [firstChunkRes, chunks[1]];
  assert.equal(isAudiobookReady(partialList), false);

  const secondChunkRes = await generateSingleTtsChunkWithRetry({
    chunk: chunks[1],
    voiceName: 'Charon',
    narratorStylePrompt: 'Calm narrator',
    maxRetries: 1,
    baseDelayMs: 10,
    fetchImpl: mockFetch,
  });

  const completeList = [firstChunkRes, secondChunkRes];
  assert.equal(isAudiobookReady(completeList), true);
  assert.equal(deriveAudioEngineStatus(completeList, false, false), 'ready');

  const blob = base64AudioToPlayableBlob('AAAA', 'audio/pcm');
  assert.equal(blob.type, 'audio/wav');
  assert.equal(blob.size, 44 + 3);

  revokeAllTrackedAudioObjectUrls(completeList);
});

// ============================================================================
// 6. PERSISTENCE MIGRATION TESTS
// ============================================================================

test('migratePersistedState upgrades legacy v1 state and preserves progress, library, and likes', () => {
  const legacyV1State = {
    settings: {
      authorPersonality: 'deadpool',
      narratorPersonality: 'homelander',
      summaryDetailLevel: 'detailed',
    },
    tasteProfile: {
      favoriteGenres: { SciFi: 5 },
      viewedBookIds: ['book-1', 'book-1'],
      likedBookIds: ['book-1'],
      dislikedBookIds: ['book-2'],
    },
    readingProgressByBookId: {
      'book-1': {
        lastChapterIndex: 4,
        lastSummaryMode: 'audiobook',
        audioChunkIndex: 2,
        audioPlaybackSeconds: 37,
      },
    },
    lastActiveBookId: 'book-1',
  };

  const migrated = migratePersistedState(legacyV1State);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.settings.authorPersonality, 'deadpool');
  assert.equal(migrated.settings.narratorPersonality, 'homelander');
  assert.equal(migrated.settings.summaryDetailLevel, 'detailed');
  assert.deepEqual(migrated.tasteProfile.viewedBookIds, ['book-1']);
  assert.deepEqual(migrated.tasteProfile.likedBookIds, ['book-1']);
  assert.deepEqual(migrated.tasteProfile.dislikedBookIds, ['book-2']);
  assert.equal(migrated.readingProgressByBookId['book-1'].lastChapterIndex, 4);
  assert.equal(migrated.readingProgressByBookId['book-1'].audioChunkIndex, 2);
});

// ============================================================================
// 7. TF-IDF + COSINE SIMILARITY + MMR RECOMMENDATION ENGINE TESTS
// ============================================================================

test('computeMlRecommendations ranks TF-IDF matches, penalizes dislikes, enforces MMR diversity, and emits explanations', () => {
  const candidates: ExternalCatalogBook[] = [
    {
      id: 'dumas-1',
      gutenbergId: 1184,
      title: 'The Count of Monte Cristo',
      author: 'Alexandre Dumas',
      year: '1844',
      genre: 'Epic & Adventure',
      subgenres: ['Revenge', 'Strategy'],
      mlTags: ['revenge', 'betrayal', 'prison', 'treasure', 'strategy'],
      coverUrl: 'https://example.com/1.jpg',
      description: 'Edmond Dantes seeks strategic revenge after wrongful imprisonment.',
    },
    {
      id: 'dumas-2',
      gutenbergId: 1257,
      title: 'The Three Musketeers',
      author: 'Alexandre Dumas',
      year: '1844',
      genre: 'Epic & Adventure',
      subgenres: ['Swashbuckler', 'Strategy'],
      mlTags: ['revenge', 'conspiracy', 'france', 'strategy'],
      coverUrl: 'https://example.com/2.jpg',
      description: 'DArtagnan and the Musketeers foil Cardinal Richelieu strategic plots.',
    },
    {
      id: 'austen-1',
      gutenbergId: 1342,
      title: 'Pride and Prejudice',
      author: 'Jane Austen',
      year: '1813',
      genre: 'Romance & Society',
      subgenres: ['Regency', 'Social Satire'],
      mlTags: ['marriage', 'manners', 'society', 'sisterhood'],
      coverUrl: 'https://example.com/3.jpg',
      description: 'Elizabeth Bennet navigates manners and marriage in Regency England.',
    },
  ];

  const taste: UserTasteProfile = {
    favoriteGenres: { 'Epic & Adventure': 4 },
    searchHistory: ['revenge strategy'],
    viewedBookIds: ['dumas-1'],
    likedBookIds: ['dumas-1'],
    dislikedBookIds: ['austen-1'],
    activePersona: 'homelander',
  };

  const recs = computeMlRecommendations(candidates, taste, 3);
  assert.equal(recs.length, 3);
  assert.equal(
    recs[0].book.id,
    'dumas-1',
    'Liked & matching TF-IDF book should rank highest'
  );
  assert.equal(
    recs[1].book.id,
    'dumas-2',
    'Related author & shared theme book should rank second'
  );
  assert.equal(
    recs[2].book.id,
    'austen-1',
    'Explicitly disliked book must be demoted to last place'
  );
  assert.ok(
    recs[1].explanationReasons && recs[1].explanationReasons.length > 0,
    'Must include structured human-readable recommendation explanations'
  );
  assert.ok(
    recs[1].explanationReasons?.some(
      (r) => r.type === 'related_author' || r.type === 'reading_history'
    )
  );
});

test('calculateCompactPageAllocation preserves exact 1-to-1 chapter count', () => {
  const chapters18 = Array.from({ length: 18 }, () => 12);
  const res = calculateCompactPageAllocation(chapters18);
  assert.equal(res.chapterCompactPages.length, 18);
  assert.ok(res.totalCompact >= 30 && res.totalCompact <= 40);
});

test('validateMascotChatRequest enforces fixed server-side mascot model and ignores client tier escalation', () => {
  const prevEnv = process.env.GEMINI_MASCOT_MODEL;
  delete process.env.GEMINI_MASCOT_MODEL;
  try {
    assert.equal(getMascotModelName(), 'gemini-3.1-flash-lite');
    assert.equal(resolveMascotModelTier('complex'), 'gemini-3.1-flash-lite');
    assert.equal(resolveMascotModelTier('general'), 'gemini-3.1-flash-lite');
    assert.equal(resolveMascotModelTier('fast'), 'gemini-3.1-flash-lite');

    const emptyCheck = validateMascotChatRequest({ message: '   ' });
    assert.equal(emptyCheck.valid, false);

    const validChat = validateMascotChatRequest({
      message: 'What is the central strategic lesson of Chapter 1?',
      taskTier: 'complex',
      personaName: 'Gandalf',
      bookTitle: 'The Art of War',
      bookAuthor: 'Sun Tzu',
      history: [
        { role: 'model', text: 'Welcome to The Readers Club! I am Mascot.' },
        { role: 'user', text: 'Tell me about Sun Tzu.' },
      ],
    });

    assert.equal(validChat.valid, true);
    assert.equal(validChat.sanitized?.modelName, 'gemini-3.1-flash-lite');
    assert.equal(validChat.sanitized?.taskTier, 'fast');
    assert.equal(validChat.sanitized?.history.length, 2);
    assert.equal(validChat.sanitized?.history[0].role, 'model');
    assert.equal(validChat.sanitized?.history[1].role, 'user');

    process.env.GEMINI_MASCOT_MODEL = 'gemini-custom-mascot-lite';
    assert.equal(getMascotModelName(), 'gemini-custom-mascot-lite');
    assert.equal(resolveMascotModelTier('complex'), 'gemini-custom-mascot-lite');
  } finally {
    if (prevEnv === undefined) {
      delete process.env.GEMINI_MASCOT_MODEL;
    } else {
      process.env.GEMINI_MASCOT_MODEL = prevEnv;
    }
  }
});

test('migratePersistedState preserves readingTheme, typography preferences, and reading progress scrollRatio across reloads', () => {
  for (const theme of ['paper', 'sepia', 'evening'] as const) {
    const migrated = migratePersistedState({
      version: 2,
      settings: {
        readingTheme: theme,
        readerFontSize: 'lg',
        readerLineHeight: 'loose',
        readerParagraphSpacing: 'roomy',
        readerContentWidth: 'narrow',
        readerFontFamily: 'sans',
      },
      readingProgressByBookId: {
        'book-1': {
          bookId: 'book-1',
          lastChapterIndex: 2,
          completedChapterIds: ['ch-1', 'ch-2'],
          lastReadMode: 'compact',
          scrollRatio: 0.64,
          updatedAt: '2026-11-06T00:00:00.000Z',
        },
      },
    });

    assert.equal(migrated.settings.readingTheme, theme);
    assert.equal(migrated.settings.readerFontSize, 'lg');
    assert.equal(migrated.settings.readerLineHeight, 'loose');
    assert.equal(migrated.settings.readerParagraphSpacing, 'roomy');
    assert.equal(migrated.settings.readerContentWidth, 'narrow');
    assert.equal(migrated.settings.readerFontFamily, 'sans');
    assert.equal(migrated.readingProgressByBookId['book-1']?.scrollRatio, 0.64);
  }
});

// ============================================================================
// 8. CATALOGUE INTEGRITY, DEDUPLICATION & SOURCE VALIDATION TESTS
// ============================================================================

test('deduplicateCatalogBooks deduplicates by Gutenberg ID and edition signature while preserving distinct editions', () => {
  const duplicateList: ExternalCatalogBook[] = [
    {
      id: 'gut-1',
      gutenbergId: 84,
      title: 'Frankenstein; Or, The Modern Prometheus',
      author: 'Mary Shelley',
      year: '1818',
      genre: 'Gothic',
      coverUrl: 'https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg',
      description: 'First record',
    },
    {
      id: 'gut-2-dup-id',
      gutenbergId: 84,
      title: 'Frankenstein',
      author: 'Mary Wollstonecraft Shelley',
      year: '1818',
      genre: 'Gothic',
      coverUrl: 'https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg',
      description: 'Duplicate Gutenberg ID 84',
    },
    {
      id: 'gbooks-edition-2',
      title: 'Frankenstein; Or, The Modern Prometheus',
      author: 'Mary Shelley',
      year: '1831',
      genre: 'Gothic',
      sourceApi: 'google_books',
      coverUrl: 'https://example.com/frankenstein-1831.jpg',
      description: 'Distinct 1831 revised edition from Google Books',
    },
    {
      id: 'gbooks-edition-2-dup',
      title: 'Frankenstein: Or, The Modern Prometheus!',
      author: 'Mary Shelley',
      year: '1831',
      genre: 'Gothic',
      sourceApi: 'google_books',
      coverUrl: 'https://example.com/frankenstein-1831.jpg',
      description: 'Exact duplicate of the 1831 Google Books edition',
    },
  ];

  const deduped = deduplicateCatalogBooks(duplicateList);
  assert.equal(deduped.uniqueBooks.length, 2);
  assert.equal(deduped.duplicates.length, 2);
  assert.equal(deduped.uniqueBooks[0].id, 'gut-1');
  assert.equal(deduped.uniqueBooks[1].id, 'gbooks-edition-2');
});

test('classifyBookContentAvailability and validateGutenbergSourceMetadata enforce honest status and valid IDs', () => {
  const curatedCondensed = OPEN_SOURCE_BOOKS[0];
  assert.equal(
    classifyBookContentAvailability(curatedCondensed),
    'condensed_edition'
  );

  const externalSeed = GLOBAL_CATALOG_BOOKS[0];
  assert.equal(
    classifyBookContentAvailability(externalSeed),
    'external_source_available'
  );

  const brokenGutenberg: ExternalCatalogBook = {
    id: 'broken-1',
    gutenbergId: -42,
    title: 'Broken Book',
    author: 'Unknown',
    year: '1900',
    genre: 'Fiction',
    coverUrl: 'https://www.gutenberg.org/cache/epub/999/pg999.cover.medium.jpg',
    description: 'Mismatched ID',
  };
  const validation = validateGutenbergSourceMetadata(brokenGutenberg);
  assert.equal(validation.valid, false);
  assert.ok(validation.reasons.length >= 1);

  const report = auditCatalogIntegrity(OPEN_SOURCE_BOOKS, GLOBAL_CATALOG_BOOKS);
  assert.equal(report.curatedBookRecords, 12);
  assert.equal(report.globalCatalogRecords, 104);
  assert.equal(report.uniqueBooksCount, 116);
  assert.equal(report.brokenSourceMetadata.length, 0);
});

test('IndexedDB save, load, and delete reconciliation removes deleted books and preserves full manuscripts on quota fallback', async () => {
  const idbMap = new Map();
  const lsMap = new Map<string, string>();
  let simulateQuotaFailureOnFirstWrite = false;

  configureTestStorageAdapters({
    idbMap,
    localStorage: {
      getItem: (k) => lsMap.get(k) ?? null,
      setItem: (k, v) => {
        if (simulateQuotaFailureOnFirstWrite && v.includes('Paragraph 45')) {
          throw new Error('QuotaExceededError');
        }
        lsMap.set(k, v);
      },
    },
  });

  try {
    const fiftyParas = Array.from(
      { length: 50 },
      (_, idx) =>
        `Paragraph ${idx + 1} with substantial literary narrative content that exceeds fifty characters.`
    );
    const customBookA = buildBookFromExtractedText(
      'Custom Volume Alpha',
      'Author Alpha',
      `Chapter 1: Opening\n\n${fiftyParas.join('\n\n')}\n\nChapter 2: Continuation\n\n${fiftyParas.join('\n\n')}`,
      'TXT'
    );
    const customBookB = buildBookFromExtractedText(
      'Custom Volume Beta',
      'Author Beta',
      `Chapter 1: Opening\n\n${fiftyParas.join('\n\n')}\n\nChapter 2: Continuation\n\n${fiftyParas.join('\n\n')}`,
      'TXT'
    );

    // 1. Save both books to IndexedDB
    await saveBooksToIndexedDb([customBookA, customBookB]);
    const loadedBoth = await loadBooksFromIndexedDb();
    assert.equal(loadedBoth.length, 2);
    assert.equal(loadedBoth[0].chapters[0].originalText.length, 50);

    // 2. Remove customBookA via reconciliation (saving only [customBookB])
    await saveBooksToIndexedDb([customBookB]);
    const afterReconcile = await loadBooksFromIndexedDb();
    assert.equal(afterReconcile.length, 1);
    assert.equal(afterReconcile[0].id, customBookB.id);

    // 3. Explicit deleteBookFromIndexedDb removes customBookB
    await deleteBookFromIndexedDb(customBookB.id);
    const afterDelete = await loadBooksFromIndexedDb();
    assert.equal(afterDelete.length, 0);

    // 4. QuotaExceededError fallback: never truncates chapter paragraphs to 30 in localStorage while pretending completeness;
    // stores shell in localStorage and full 50-paragraph manuscript in IndexedDB
    simulateQuotaFailureOnFirstWrite = true;
    savePersistedAppState({
      customBooks: [customBookA],
    });

    const lsState = loadPersistedAppState();
    assert.equal(lsState.customBooks.length, 1);
    assert.equal(
      lsState.customBooks[0].chapters.length,
      0,
      'Quota fallback stores shell in localStorage instead of silently truncating to 30 paragraphs'
    );

    const idbRestored = await loadBooksFromIndexedDb();
    assert.equal(idbRestored.length, 1);
    assert.equal(
      idbRestored[0].chapters[0].originalText.length,
      50,
      'Full 50 paragraphs remain intact in IndexedDB'
    );
  } finally {
    configureTestStorageAdapters({ localStorage: null, idbMap: null });
  }
});

test('generateSingleTtsChunkWithRetry cancels cleanly on AbortSignal without leaking Object URLs and avoids retrying permanent errors', async () => {
  clearTtsDeduplicationCache();
  revokeAllTrackedAudioObjectUrls();
  assert.equal(getActiveTrackedObjectUrlCount(), 0);

  const chunks = chunkTextForTts(
    [
      'This first chapter audio chunk will be cancelled mid-flight when the reader switches chapters or closes the active audiobook workspace.',
      'This second chapter audio chunk encounters a permanent 400 validation error from the server and must not waste time retrying.',
    ],
    180
  );

  const controller = new AbortController();
  const slowMockFetch = (async (_url: string, init?: RequestInit) => {
    // Abort while request is in flight
    controller.abort();
    if (init?.signal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    return new Response(
      JSON.stringify({ audioBase64: 'AAAA', mimeType: 'audio/pcm' }),
      { status: 200 }
    );
  }) as unknown as typeof fetch;

  const cancelledRes = await generateSingleTtsChunkWithRetry({
    chunk: chunks[0],
    voiceName: 'Kore',
    narratorStylePrompt: 'Warm narrator',
    maxRetries: 3,
    baseDelayMs: 50,
    signal: controller.signal,
    fetchImpl: slowMockFetch,
  });

  assert.equal(cancelledRes.status, 'pending');
  assert.equal(cancelledRes.objectUrl, undefined);
  assert.equal(
    getActiveTrackedObjectUrlCount(),
    0,
    'Cancelled TTS request must not leak tracked Object URLs'
  );

  // Permanent 400 error should stop after 1 attempt without retrying
  let permanentAttempts = 0;
  const permanentFailFetch = (async () => {
    permanentAttempts++;
    return new Response(
      JSON.stringify({ error: 'EMPTY_TTS_TEXT', message: 'Invalid chunk' }),
      { status: 400 }
    );
  }) as unknown as typeof fetch;

  const permanentRes = await generateSingleTtsChunkWithRetry({
    chunk: chunks[1],
    voiceName: 'Kore',
    narratorStylePrompt: 'Warm narrator',
    maxRetries: 3,
    baseDelayMs: 10,
    fetchImpl: permanentFailFetch,
  });

  assert.equal(permanentRes.status, 'failed');
  assert.equal(
    permanentAttempts,
    1,
    'Permanent 4xx TTS error must not waste retries'
  );
});

test('validateSummarizeRequest ignores tampered client contentHash and withRetryAndTimeout handles permanent errors & cancellation', async () => {
  const { buildServerSummaryCacheKey, withRetryAndTimeout } = await import(
    '../../../backend/src/server'
  );

  const reqA = validateSummarizeRequest({
    bookTitle: 'The Odyssey',
    chapterTitle: 'Book I',
    contentHash: 'tampered-hash-from-client',
    originalText: [
      'Tell me, O Muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy.',
    ],
  });
  const reqB = validateSummarizeRequest({
    bookTitle: 'The Odyssey',
    chapterTitle: 'Book I',
    contentHash: 'tampered-hash-from-client',
    originalText: [
      'Now all the other heroes who had escaped destruction at Troy were safe at home and had survived the war and the sea.',
    ],
  });

  assert.equal(reqA.valid, true);
  assert.equal(reqB.valid, true);
  assert.notEqual(
    reqA.sanitized?.contentHash,
    'tampered-hash-from-client',
    'Server must compute contentHash from actual paragraphs rather than trusting client hash'
  );
  assert.notEqual(
    reqA.sanitized?.contentHash,
    reqB.sanitized?.contentHash,
    'Different chapter text must produce distinct server contentHash even if client sends identical contentHash'
  );

  // Prompt version changes must invalidate both client and server summary cache keys
  const clientKeyV1 = buildSummaryCacheKey({
    contentHash: reqA.sanitized!.contentHash,
    chapterId: 'ch-1',
    model: 'gemini-3.8-flash',
    personaId: 'gandalf',
    detailLevel: 'compact',
    targetPages: 2,
    promptVersion: 'v1.0.0',
  });
  const clientKeyV2 = buildSummaryCacheKey({
    contentHash: reqA.sanitized!.contentHash,
    chapterId: 'ch-1',
    model: 'gemini-3.8-flash',
    personaId: 'gandalf',
    detailLevel: 'compact',
    targetPages: 2,
    promptVersion: 'v1.0.1',
  });
  assert.notEqual(clientKeyV1, clientKeyV2);

  const serverKeyV1 = buildServerSummaryCacheKey({
    contentHash: reqA.sanitized!.contentHash,
    chapterId: 'ch-1',
    model: 'gemini-3.8-flash',
    authorPersonaId: 'gandalf',
    detailLevel: 'compact',
    targetCompactPages: 2,
    authorStylePrompt: 'Wise scholar',
    promptVersion: 'v1.0.0',
  });
  const serverKeyV2 = buildServerSummaryCacheKey({
    contentHash: reqA.sanitized!.contentHash,
    chapterId: 'ch-1',
    model: 'gemini-3.8-flash',
    authorPersonaId: 'gandalf',
    detailLevel: 'compact',
    targetCompactPages: 2,
    authorStylePrompt: 'Wise scholar',
    promptVersion: 'v1.0.1',
  });
  assert.notEqual(serverKeyV1, serverKeyV2);

  // withRetryAndTimeout should not retry permanent 400 errors
  let attempts = 0;
  await assert.rejects(
    async () => {
      await withRetryAndTimeout(
        async () => {
          attempts++;
          const err = new Error('INVALID_ARGUMENT: bad request') as Error & {
            status?: number;
          };
          err.status = 400;
          throw err;
        },
        { maxRetries: 3, baseDelayMs: 5, timeoutMs: 500 }
      );
    },
    /INVALID_ARGUMENT/
  );
  assert.equal(attempts, 1, 'Permanent 400 AI error must not retry');
});
