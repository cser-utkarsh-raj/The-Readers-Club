import { rankSentencesWithTextRank, RankedSentence } from './textRank';

export type NarrativeSignal =
  | 'character'
  | 'dialogue'
  | 'event'
  | 'causality'
  | 'world_rule'
  | 'revelation'
  | 'decision'
  | 'setting';

export interface NarrativeEvidence extends RankedSentence {
  signals: NarrativeSignal[];
  entityIds: string[];
  critical: boolean;
}

export interface NarrativeSelection {
  selected: NarrativeEvidence[];
  omittedCriticalIds: string[];
  coveredSignals: NarrativeSignal[];
  usedCharacters: number;
}

/**
 * Select evidence with explicit, caller-supplied narrative annotations.
 * Signals are not inferred here: a model/extractor must attach them with
 * source evidence. Critical items are selected before relevance-ranked filler.
 */
export function selectNarrativeEvidence(
  text: string,
  annotations: Array<{
    sentenceIndex: number;
    signals: NarrativeSignal[];
    entityIds?: string[];
    critical?: boolean;
  }>,
  maxCharacters: number
): NarrativeSelection {
  const ranked = rankSentencesWithTextRank(text);
  const byIndex = new Map(annotations.map((item) => [item.sentenceIndex, item]));
  const evidence: NarrativeEvidence[] = ranked.map((sentence) => {
    const annotation = byIndex.get(sentence.index);
    return {
      ...sentence,
      signals: annotation?.signals ?? [],
      entityIds: annotation?.entityIds ?? [],
      critical: annotation?.critical ?? false,
    };
  });

  if (!Number.isFinite(maxCharacters) || maxCharacters <= 0) {
    return {
      selected: [],
      omittedCriticalIds: evidence.filter((item) => item.critical).map((item) => String(item.index)),
      coveredSignals: [],
      usedCharacters: 0,
    };
  }

  const chosen = new Set<number>();
  let usedCharacters = 0;
  const add = (item: NarrativeEvidence) => {
    if (chosen.has(item.index)) return true;
    const cost = item.text.length + (chosen.size ? 1 : 0);
    if (usedCharacters + cost > maxCharacters) return false;
    chosen.add(item.index);
    usedCharacters += cost;
    return true;
  };

  // Preserve critical events/revelations first; report those that cannot fit.
  for (const item of evidence.filter((entry) => entry.critical).sort((a, b) => a.index - b.index)) add(item);

  // Prefer evidence that contributes a not-yet-covered narrative signal/entity.
  const remaining = evidence.filter((item) => !chosen.has(item.index)).sort((a, b) => {
    const coverageA = a.signals.length + new Set(a.entityIds).size;
    const coverageB = b.signals.length + new Set(b.entityIds).size;
    return coverageB - coverageA || b.score - a.score || a.index - b.index;
  });
  const coveredSignals = new Set<NarrativeSignal>();
  const entities = new Set<string>();
  for (const item of evidence.filter((entry) => chosen.has(entry.index))) {
    item.signals.forEach((signal) => coveredSignals.add(signal));
    item.entityIds.forEach((id) => entities.add(id));
  }
  for (const item of remaining) {
    const addsCoverage = item.signals.some((signal) => !coveredSignals.has(signal)) ||
      item.entityIds.some((id) => !entities.has(id));
    if (!addsCoverage && item.score < 0.05) continue;
    if (add(item)) {
      item.signals.forEach((signal) => coveredSignals.add(signal));
      item.entityIds.forEach((id) => entities.add(id));
    }
  }

  const selected = evidence.filter((item) => chosen.has(item.index)).sort((a, b) => a.index - b.index);
  return {
    selected,
    omittedCriticalIds: evidence.filter((item) => item.critical && !chosen.has(item.index)).map((item) => String(item.index)),
    coveredSignals: [...coveredSignals],
    usedCharacters,
  };
}
