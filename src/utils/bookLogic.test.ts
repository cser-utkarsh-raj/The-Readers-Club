import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCompactPageAllocation,
  applyPersonaVoiceToParagraphs,
  buildBookFromExtractedText,
  PERSONALITY_PROFILES,
} from './bookLogic';

test('200-page book proportionally summarizes into 30-40 pages while preserving chapter count', () => {
  const originalChapters = [35, 42, 38, 45, 40]; // sum = 200 pages
  const result = calculateCompactPageAllocation(originalChapters, 0.175);

  assert.equal(result.totalOriginal, 200);
  assert.ok(
    result.totalCompact >= 30 && result.totalCompact <= 40,
    `Expected compact pages between 30 and 40, got ${result.totalCompact}`
  );
  assert.equal(result.chapterCompactPages.length, originalChapters.length);
  const sumCompact = result.chapterCompactPages.reduce((a, b) => a + b, 0);
  assert.equal(sumCompact, result.totalCompact);
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
  assert.ok(homelanderOut[0].includes('Chapter 1: Laying Plans'));
  assert.ok(taylorOut[0].includes('autumn light'));
  assert.ok(deadpoolOut[0].includes('82%'));
  assert.ok(gandalfOut[0].includes('lamp'));
});

test('buildBookFromExtractedText splits chapters and produces 30-40 page compact edition', () => {
  const sampleManuscript = `
Chapter 1: The Clockwork Harbor
The merchant vessels arrived at dawn carrying navigational instruments and rare manuscripts from across the sea. Captains debated the safest passage through the narrows while cartographers redrew the coastline.

Every guild hall along the quay buzzed with speculation about the northern expedition. Supplies were tallied, sails mended, and contracts sealed in crimson wax.

Chapter 2: The Observatory Tower
High above the cliffs, astronomers calibrated the brass astrolabe to track the winter solstice. Their calculations revealed a subtle drift in the planetary tables that none of the ancient codices had predicted.

Apprentices worked through the night copying star charts onto vellum scrolls so each ship would carry an accurate reckoning.

Chapter 3: The Sea Trial
When the flagship finally cleared the breakwater, gale-force winds tested every timber. Yet the new rudder design held steady, proving the engineers right and opening a faster route across the archipelago.
  `;

  const book = buildBookFromExtractedText(
    'The Clockwork Navigator',
    'Captain E. Vance',
    sampleManuscript,
    'EPUB',
    'deadpool'
  );

  assert.equal(book.title, 'The Clockwork Navigator');
  assert.equal(book.chapters.length, 3);
  assert.ok(book.compactTotalPages >= 30 && book.compactTotalPages <= 40);
  assert.equal(book.superShortExecutiveSummary.executivePages.length, 3);
});
