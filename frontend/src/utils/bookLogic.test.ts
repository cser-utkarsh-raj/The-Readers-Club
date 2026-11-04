import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCompactPageAllocation,
  applyPersonaVoiceToParagraphs,
  buildBookFromExtractedText,
  buildBookFromExternalCatalogItem,
  compressSingleChapterDeterministic,
  computeMlRecommendations,
  PERSONALITY_PROFILES,
} from './bookLogic';

test('18-chapter 200-page book proportionally summarizes into 30-40 pages while preserving all 18 chapters 1-to-1', () => {
  const original18Chapters = [
    11, 12, 10, 11, 12, 11, 10, 12, 11, 11, 12, 10, 11, 12, 11, 11, 11, 11,
  ]; // 18 chapters summing to 200 pages
  const result = calculateCompactPageAllocation(original18Chapters, 0.175);

  assert.equal(result.totalOriginal, 200);
  assert.equal(result.chapterCompactPages.length, 18);
  assert.ok(
    result.totalCompact >= 30 && result.totalCompact <= 40,
    `Expected compact pages between 30 and 40, got ${result.totalCompact}`
  );
  const sumCompact = result.chapterCompactPages.reduce((a, b) => a + b, 0);
  assert.equal(sumCompact, result.totalCompact);
  assert.ok(result.chapterCompactPages.every((p) => p >= 1));
});

test('all 4 preset personalities exist and transform chapter paragraphs distinctly', () => {
  const keys = Object.keys(PERSONALITY_PROFILES);
  assert.deepEqual(keys.sort(), ['deadpool', 'gandalf', 'homelander', 'taylor_swift']);

  const baseParas = [
    'The general must study terrain and logistics before engaging the opposing force.',
    'Victory belongs to those who calculate every variable before dawn.',
  ];

  const homelanderOut = applyPersonaVoiceToParagraphs(baseParas, 'homelander', 'Chapter 1: Laying Plans');
  const taylorOut = applyPersonaVoiceToParagraphs(baseParas, 'taylor_swift', 'Chapter 1: Laying Plans');
  const deadpoolOut = applyPersonaVoiceToParagraphs(baseParas, 'deadpool', 'Chapter 1: Laying Plans');
  const gandalfOut = applyPersonaVoiceToParagraphs(baseParas, 'gandalf', 'Chapter 1: Laying Plans');

  assert.notEqual(homelanderOut[0], taylorOut[0]);
  assert.notEqual(deadpoolOut[0], gandalfOut[0]);
});

test('buildBookFromExternalCatalogItem keeps all 18 chapters uncompressed by default and compresses single chapters on demand', () => {
  const catalogItem = buildBookFromExternalCatalogItem(
    {
      id: 'gutendex-1342',
      title: 'Pride and Prejudice',
      author: 'Jane Austen',
      year: '1813',
      genre: 'Romance & Society',
      chapterCount: 18,
      coverUrl: 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg',
      description: 'A classic novel of manners, marriage, and moral growth across English country society.',
      sourceApi: 'gutendex',
      pageCount: 216,
    },
    'taylor_swift',
    false // Do NOT pre-compress new books
  );

  assert.equal(catalogItem.chapters.length, 18);
  assert.equal(catalogItem.isPreCompressed, false);
  assert.equal(catalogItem.chapters[0].isCompressed, false);
  assert.equal(catalogItem.chapters[0].compactText.length, 0);

  // Now compress Chapter 1 individually on demand
  const ch1Compressed = compressSingleChapterDeterministic(
    catalogItem.chapters[0],
    catalogItem.title,
    catalogItem.author,
    'taylor_swift'
  );
  assert.ok(ch1Compressed.compactText.length >= 3);
  assert.ok(ch1Compressed.bulletPoints.length >= 3);
});

test('buildBookFromExtractedText preserves all 18 chapters when an 18-chapter manuscript is uploaded', () => {
  const eighteenChaptersText = Array.from({ length: 18 }, (_, idx) => {
    return `Chapter ${idx + 1}: Structural Movement ${idx + 1}\nIn this chapter of the manuscript, the protagonists navigate the trials of the expedition and record their astronomical observations across the archipelago.`;
  }).join('\n\n');

  const uploadedBook = buildBookFromExtractedText(
    'The Eighteen Voyages',
    'Captain Vance',
    eighteenChaptersText,
    'EPUB',
    'gandalf',
    false
  );

  assert.equal(uploadedBook.chapters.length, 18);
  assert.equal(uploadedBook.isPreCompressed, false);
  assert.ok(uploadedBook.compactTotalPages >= 30 && uploadedBook.compactTotalPages <= 40);
});

test('computeMlRecommendations ranks books matching user genre affinity and active Persona higher', () => {
  const candidates = [
    {
      id: 'b-romance',
      title: 'Sense and Sensibility',
      author: 'Jane Austen',
      year: '1811',
      genre: 'Romance & Society',
      mlTags: ['romance', 'society', 'classic'],
      trendingScore: 84,
      chapterCount: 18,
      coverUrl: 'https://www.gutenberg.org/cache/epub/161/pg161.cover.medium.jpg',
      description: 'The Dashwood sisters navigate love and heartbreak.',
    },
    {
      id: 'b-strategy',
      title: 'The Prince',
      author: 'Niccolò Machiavelli',
      year: '1532',
      genre: 'Strategy',
      mlTags: ['strategy', 'power', 'political philosophy', 'history'],
      trendingScore: 95,
      chapterCount: 26,
      coverUrl: 'https://www.gutenberg.org/cache/epub/1232/pg1232.cover.medium.jpg',
      description: 'Treatise on statecraft, power dynamics, and sovereignty.',
    },
  ];

  const recs = computeMlRecommendations(candidates, {
    viewedBookIds: [],
    compressedBookIds: [],
    favoriteGenres: { Strategy: 5, History: 3 },
    activePersona: 'homelander',
    searchHistory: ['power strategy'],
  });

  assert.equal(recs[0].book.id, 'b-strategy');
  assert.ok(recs[0].matchPercentage > recs[1].matchPercentage);
});
