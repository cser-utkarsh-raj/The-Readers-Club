/**
 * Source-preserving manuscript segmentation.
 *
 * This parser deliberately recognizes only explicit, configurable headings.
 * It never invents chapter boundaries or rewrites the source. Unrecognized
 * documents remain one section so callers can surface an honest "unparsed"
 * state instead of manufacturing structure.
 */
export interface SourceSegment {
  id: string;
  ordinal: number;
  heading: string | null;
  headingStart: number | null;
  contentStart: number;
  contentEnd: number;
  text: string;
  sourceHash: string;
}

export interface SegmentationOptions {
  headingPattern?: RegExp;
  includeHeadingInText?: boolean;
}

export function hashSourceText(text: string): string {
  // FNV-1a 32-bit, matching the existing client-side content hash convention.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function segmentSourceText(
  source: string,
  options: SegmentationOptions = {}
): SourceSegment[] {
  if (!source.trim()) return [];

  const pattern = options.headingPattern ?? /^\s*(?:chapter|book|part)\s+(?:[\divxlcdm]+|[a-z]+)(?:\s*[:.\-—].*)?\s*$/gim;
  // Clone the regex so caller-owned lastIndex cannot affect deterministic output.
  const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const headings: Array<{ start: number; end: number; title: string }> = [];
  for (const match of source.matchAll(matcher)) {
    if (match.index === undefined) continue;
    headings.push({ start: match.index, end: match.index + match[0].length, title: match[0].trim() });
  }

  if (headings.length === 0) {
    return [{
      id: 'segment-1',
      ordinal: 1,
      heading: null,
      headingStart: null,
      contentStart: 0,
      contentEnd: source.length,
      text: source,
      sourceHash: hashSourceText(source),
    }];
  }

  const segments: SourceSegment[] = [];
  // Preserve any prologue before the first explicit chapter as its own segment.
  if (source.slice(0, headings[0].start).trim()) {
    const text = source.slice(0, headings[0].start);
    segments.push({
      id: 'segment-1',
      ordinal: 1,
      heading: null,
      headingStart: null,
      contentStart: 0,
      contentEnd: headings[0].start,
      text,
      sourceHash: hashSourceText(text),
    });
  }

  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i];
    const nextStart = headings[i + 1]?.start ?? source.length;
    const contentStart = options.includeHeadingInText ? current.start : current.end;
    const text = source.slice(contentStart, nextStart);
    segments.push({
      id: `segment-${segments.length + 1}`,
      ordinal: segments.length + 1,
      heading: current.title,
      headingStart: current.start,
      contentStart,
      contentEnd: nextStart,
      text,
      sourceHash: hashSourceText(text),
    });
  }
  return segments;
}

/** Verify a segment still points to the exact immutable source slice. */
export function verifySourceSegment(source: string, segment: SourceSegment): boolean {
  if (segment.contentStart < 0 || segment.contentEnd > source.length || segment.contentStart > segment.contentEnd) {
    return false;
  }
  const slice = source.slice(segment.contentStart, segment.contentEnd);
  return slice === segment.text && hashSourceText(slice) === segment.sourceHash;
}
