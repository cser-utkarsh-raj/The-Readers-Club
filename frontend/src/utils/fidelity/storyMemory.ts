/**
 * Provenance-backed story memory contracts.
 *
 * Extraction of facts is intentionally supplied by a caller/model. This module
 * validates provenance and merges records; it does not guess character motives,
 * relationships, events, or world rules from names or keyword heuristics.
 */
export type StoryFactKind =
  | 'character'
  | 'relationship'
  | 'event'
  | 'motivation'
  | 'causal_link'
  | 'world_rule'
  | 'location'
  | 'faction'
  | 'object'
  | 'mystery'
  | 'revelation';

export interface StoryProvenance {
  segmentId: string;
  sourceHash: string;
  startOffset: number;
  endOffset: number;
  excerpt: string;
}

export interface StoryFact {
  id: string;
  kind: StoryFactKind;
  statement: string;
  entities: string[];
  chapterOrdinal: number;
  provenance: StoryProvenance[];
  spoilerLevel: number;
  confidence: number;
}

export interface StoryMemory {
  sourceHash: string;
  facts: StoryFact[];
  updatedThroughChapter: number;
}

export interface StoryMemoryValidation {
  valid: boolean;
  errors: string[];
}

export function validateStoryFact(fact: StoryFact): StoryMemoryValidation {
  const errors: string[] = [];
  if (!fact.id.trim()) errors.push('Fact id is required.');
  if (!fact.statement.trim()) errors.push('Fact statement is required.');
  if (!Number.isInteger(fact.chapterOrdinal) || fact.chapterOrdinal < 1) {
    errors.push('chapterOrdinal must be a positive integer.');
  }
  if (!Number.isFinite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1) {
    errors.push('confidence must be between 0 and 1.');
  }
  if (!Number.isFinite(fact.spoilerLevel) || fact.spoilerLevel < 0) {
    errors.push('spoilerLevel must be a non-negative number.');
  }
  if (fact.provenance.length === 0) errors.push('At least one source provenance record is required.');
  for (const source of fact.provenance) {
    if (!source.segmentId || !source.sourceHash || !source.excerpt.trim()) {
      errors.push('Each provenance record needs segmentId, sourceHash, and excerpt.');
    }
    if (source.startOffset < 0 || source.endOffset <= source.startOffset) {
      errors.push('Provenance offsets must describe a non-empty source range.');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function createEmptyStoryMemory(sourceHash: string): StoryMemory {
  return { sourceHash, facts: [], updatedThroughChapter: 0 };
}

/**
 * Add only facts grounded in this manuscript. Facts from later chapters are
 * excluded when building a spoiler-limited view.
 */
export function appendStoryFacts(
  memory: StoryMemory,
  facts: StoryFact[],
  options: { throughChapter: number; maxSpoilerLevel?: number }
): StoryMemory {
  const accepted = facts.filter((fact) => {
    const validation = validateStoryFact(fact);
    return validation.valid &&
      fact.chapterOrdinal <= options.throughChapter &&
      (options.maxSpoilerLevel === undefined || fact.spoilerLevel <= options.maxSpoilerLevel) &&
      fact.provenance.every((item) => item.sourceHash === memory.sourceHash);
  });

  const byId = new Map(memory.facts.map((fact) => [fact.id, fact]));
  for (const fact of accepted) byId.set(fact.id, fact);
  return {
    sourceHash: memory.sourceHash,
    facts: [...byId.values()].sort((a, b) => a.chapterOrdinal - b.chapterOrdinal || a.id.localeCompare(b.id)),
    updatedThroughChapter: Math.max(memory.updatedThroughChapter, options.throughChapter),
  };
}

export function getStoryMemoryAtChapter(
  memory: StoryMemory,
  chapterOrdinal: number,
  maxSpoilerLevel = Number.POSITIVE_INFINITY
): StoryFact[] {
  return memory.facts.filter(
    (fact) => fact.chapterOrdinal <= chapterOrdinal && fact.spoilerLevel <= maxSpoilerLevel
  );
}
