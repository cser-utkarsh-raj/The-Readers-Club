/**
 * Deterministic sentence ranking for the V2 Compact Edition pipeline.
 *
 * This is an evidence-selection primitive, not a summarizer or a truth detector.
 * Callers must preserve source order when assembling selected sentences and must
 * run downstream coverage and faithfulness checks before publishing a summary.
 */

export interface RankedSentence {
  index: number;
  text: string;
  score: number;
}

const STOP_WORDS = new Set(
  `a an and are as at be been but by for from had has have he her hers him his
  i if in into is it its me my of on or our ours she that the their them then
  there these they this those to was we were what when where which who will with
  you your`.split(/\\s+/)
);

const ABBREVIATIONS = new Set([
  'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'st.', 'vs.', 'etc.',
  'e.g.', 'i.e.', 'no.', 'fig.',
]);

function tokenize(text: string): string[] {
  return (text.toLocaleLowerCase().match(/[\\p{L}\\p{N}][\\p{L}\\p{N}'’-]*/gu) ?? [])
    .map((token) => token.replace(/^['’-]+|['’-]+$/g, ''))
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * Split prose into sentences while avoiding common title/initial abbreviations.
 * The original sentence text is retained; no normalization is applied to output.
 */
export function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\\r\\n?/g, '\\n').trim();
  if (!normalized) return [];

  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char !== '.' && char !== '!' && char !== '?' && char !== '\\n') continue;

    if (char === '.' && i > 0) {
      const prefix = normalized.slice(Math.max(start, i - 12), i + 1).toLowerCase();
      const abbreviation = [...ABBREVIATIONS].some((item) => prefix.endsWith(item));
      const initial = /\\b[A-Z]$/.test(normalized.slice(Math.max(start, i - 1), i));
      if (abbreviation || initial) continue;
    }

    let end = i + 1;
    while (end < normalized.length && /["'”’)]/.test(normalized[end])) end += 1;
    const sentence = normalized.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
    while (start < normalized.length && /\\s/.test(normalized[start])) start += 1;
    i = start - 1;
  }

  const tail = normalized.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const value of a.values()) normA += value * value;
  for (const value of b.values()) normB += value * value;
  if (!normA || !normB) return 0;

  for (const [term, value] of a) dot += value * (b.get(term) ?? 0);
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildTfidfVectors(sentences: string[]): Map<string, number>[] {
  const tokenized = sentences.map(tokenize);
  const documentFrequency = new Map<string, number>();

  for (const tokens of tokenized) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return tokenized.map((tokens) => {
    const counts = new Map<string, number>();
    for (const term of tokens) counts.set(term, (counts.get(term) ?? 0) + 1);

    const vector = new Map<string, number>();
    for (const [term, count] of counts) {
      const tf = count / Math.max(tokens.length, 1);
      const idf = Math.log(1 + sentences.length / (1 + (documentFrequency.get(term) ?? 0)));
      vector.set(term, tf * idf);
    }
    return vector;
  });
}

export interface TextRankOptions {
  dampingFactor?: number;
  iterations?: number;
  tolerance?: number;
  similarityThreshold?: number;
}

/**
 * Scores sentences using a weighted TextRank graph built from TF-IDF cosine
 * similarity. Scores are returned in original source order for safe rendering.
 */
export function rankSentencesWithTextRank(
  text: string,
  options: TextRankOptions = {}
): RankedSentence[] {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];
  if (sentences.length === 1) return [{ index: 0, text: sentences[0], score: 1 }];

  const damping = options.dampingFactor ?? 0.85;
  const iterations = options.iterations ?? 40;
  const tolerance = options.tolerance ?? 1e-7;
  const threshold = options.similarityThreshold ?? 0.05;
  const vectors = buildTfidfVectors(sentences);
  const graph = sentences.map(() => [] as Array<{ target: number; weight: number }>);
  const weights = sentences.map(() => 0);

  for (let i = 0; i < sentences.length; i += 1) {
    for (let j = i + 1; j < sentences.length; j += 1) {
      const similarity = cosineSimilarity(vectors[i], vectors[j]);
      if (similarity < threshold) continue;
      graph[i].push({ target: j, weight: similarity });
      graph[j].push({ target: i, weight: similarity });
      weights[i] += similarity;
      weights[j] += similarity;
    }
  }

  let scores = sentences.map(() => 1 / sentences.length);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = sentences.map(() => (1 - damping) / sentences.length);
    for (let node = 0; node < graph.length; node += 1) {
      if (weights[node] === 0) continue;
      for (const edge of graph[node]) {
        next[edge.target] += damping * scores[node] * edge.weight / weights[node];
      }
    }
    const delta = next.reduce((sum, value, index) => sum + Math.abs(value - scores[index]), 0);
    scores = next;
    if (delta < tolerance) break;
  }

  const total = scores.reduce((sum, score) => sum + score, 0) || 1;
  return sentences.map((sentence, index) => ({
    index,
    text: sentence,
    score: scores[index] / total,
  }));
}

/**
 * Selects high-ranked sentences within a character budget, then restores source
 * order. This is intentionally a simple baseline; callers should add narrative
 * coverage constraints (entities, events, dialogue, causality) before production.
 */
export function selectRankedSentences(
  ranked: RankedSentence[],
  maxCharacters: number
): RankedSentence[] {
  if (!Number.isFinite(maxCharacters) || maxCharacters <= 0) return [];

  const selected: RankedSentence[] = [];
  let used = 0;
  const byImportance = [...ranked].sort((a, b) => b.score - a.score || a.index - b.index);

  for (const sentence of byImportance) {
    const cost = sentence.text.length + (selected.length ? 1 : 0);
    if (used + cost > maxCharacters) continue;
    selected.push(sentence);
    used += cost;
  }

  return selected.sort((a, b) => a.index - b.index);
}
