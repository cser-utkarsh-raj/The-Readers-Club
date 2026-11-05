import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentSourceText, verifySourceSegment } from '../../frontend/src/utils/fidelity/sourceIntegrity';
import { appendStoryFacts, createEmptyStoryMemory, getStoryMemoryAtChapter, StoryFact } from '../../frontend/src/utils/fidelity/storyMemory';
import { selectNarrativeEvidence } from '../../frontend/src/utils/fidelity/narrativeSelection';

test('source segmentation preserves exact source slices and headings', () => {
  const source = 'Prologue text.\n\nChapter 1: Arrival\nMira enters the city.\n\nChapter 2\nThe gates close.';
  const segments = segmentSourceText(source);
  assert.equal(segments.length, 3);
  assert.equal(segments[0].heading, null);
  assert.equal(segments[1].heading, 'Chapter 1: Arrival');
  assert.ok(segments.every((segment) => verifySourceSegment(source, segment)));
});

test('unrecognized manuscript remains one unparsed segment', () => {
  const source = 'A poem\nwithout chapter labels.';
  const segments = segmentSourceText(source);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, source);
  assert.equal(segments[0].heading, null);
});

test('story memory rejects missing or foreign provenance and respects spoiler boundary', () => {
  const sourceHash = 'fnv1a-source';
  const fact = (id: string, chapterOrdinal: number, hash = sourceHash): StoryFact => ({
    id, kind: 'event', statement: 'The gate closes.', entities: ['gate'],
    chapterOrdinal, provenance: [{ segmentId: 'segment-1', sourceHash: hash, startOffset: 0, endOffset: 10, excerpt: 'gate closes' }],
    spoilerLevel: chapterOrdinal, confidence: 0.9,
  });
  const memory = appendStoryFacts(createEmptyStoryMemory(sourceHash), [fact('a', 1), fact('b', 2), fact('c', 3, 'other')], { throughChapter: 3 });
  assert.deepEqual(getStoryMemoryAtChapter(memory, 1).map((item) => item.id), ['a']);
  assert.deepEqual(memory.facts.map((item) => item.id), ['a', 'b']);
});

test('narrative selection keeps critical evidence first and restores source order', () => {
  const text = 'Mira enters the city. The gates close behind her. She discovers the city is underwater.';
  const result = selectNarrativeEvidence(text, [
    { sentenceIndex: 1, signals: ['event', 'causality'], critical: true },
    { sentenceIndex: 2, signals: ['world_rule'], entityIds: ['city'] },
  ], 120);
  assert.ok(result.selected.some((item) => item.index === 1));
  assert.deepEqual(result.selected.map((item) => item.index), [...result.selected.map((item) => item.index)].sort((a,b)=>a-b));
});
