import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankSentencesWithTextRank,
  selectRankedSentences,
  splitIntoSentences,
} from '../frontend/src/utils/fidelity/textRank';

test('sentence splitting preserves punctuation and handles common abbreviations', () => {
  assert.deepEqual(
    splitIntoSentences('Dr. Vale entered the room. The door closed!'),
    ['Dr. Vale entered the room.', 'The door closed!']
  );
});

test('TextRank is deterministic and returns source order', () => {
  const source = [
    'The city depended on the river for water.',
    'Mara crossed the bridge before sunrise.',
    'The river supplied every district in the city.',
    'A bell rang from the northern tower.',
  ].join(' ');
  const first = rankSentencesWithTextRank(source);
  const second = rankSentencesWithTextRank(source);

  assert.deepEqual(first, second);
  assert.deepEqual(first.map((item) => item.index), [0, 1, 2, 3]);
  assert.ok(first.every((item) => item.score >= 0 && Number.isFinite(item.score)));
  assert.ok(Math.abs(first.reduce((sum, item) => sum + item.score, 0) - 1) < 1e-9);
});

test('empty and single-sentence inputs are handled', () => {
  assert.deepEqual(rankSentencesWithTextRank('   '), []);
  assert.deepEqual(rankSentencesWithTextRank('One complete sentence.'), [
    { index: 0, text: 'One complete sentence.', score: 1 },
  ]);
});

test('selection respects the budget and restores chronological order', () => {
  const ranked = [
    { index: 0, text: 'First.', score: 0.1 },
    { index: 1, text: 'Second important sentence.', score: 0.8 },
    { index: 2, text: 'Third.', score: 0.2 },
  ];
  const selected = selectRankedSentences(ranked, 36);
  assert.deepEqual(selected.map((item) => item.index), [1, 2]);
  assert.ok(selected.reduce((sum, item) => sum + item.text.length, 0) + selected.length - 1 <= 36);
});
