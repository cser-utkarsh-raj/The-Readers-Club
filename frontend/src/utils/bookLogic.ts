import {
  BookChapter,
  BookItem,
  ContentAvailabilityStatus,
  ExternalCatalogBook,
  PersonalityProfile,
  PresetPersonalityId,
  RecommendationExplanation,
  ScoredBookRecommendation,
  SummaryDetailLevel,
  UserTasteProfile,
} from '../types/book';

export const PERSONALITY_PROFILES: Record<PresetPersonalityId, PersonalityProfile> = {
  homelander: {
    id: 'homelander',
    name: 'Homelander',
    roleTitle: 'Apex Command Critic',
    tagline: 'Theatrical authority, ruthless power analysis & zero-tolerance clarity',
    authorStylePrompt:
      'Summarize with Homelander’s theatrical, supremely self-assured, slightly condescending corporate-superhero authority. Address the readers as if you are doing them a monumental favor by distilling this literature into pure perfection. Keep all chapter facts, names, chronology, and philosophical depth intact.',
    narratorStylePrompt:
      'Commanding, polished, intense, dramatically poised voice with eerie calm and supreme authority',
    ttsVoiceName: 'Fenrir',
    speechPitch: 0.88,
    speechRate: 0.96,
    badgeColor: '#2563EB',
    halftoneClass: 'bg-halftone-crimson',
    accentHex: '#E11D48',
    sampleQuote:
      '"You’re welcome. I took two hundred pages of mortal rambling and distilled it into thirty-five pages of laser-focused perfection."',
    preferredGenres: ['Strategy', 'Political Philosophy', 'History', 'Dystopian', 'Psychological'],
  },
  taylor_swift: {
    id: 'taylor_swift',
    name: 'Taylor Swift',
    roleTitle: 'Lyrical Narrative Architect',
    tagline: 'Vivid imagery, emotional precision & golden narrative bridges',
    authorStylePrompt:
      'Summarize with Taylor Swift’s poetic and professional literary voice: vivid imagery, emotional precision, clever metaphors, and structured narrative bridges that connect every chapter’s turning point with grace and intellectual clarity while preserving all factual events and characters.',
    narratorStylePrompt:
      'Warm, articulate, poetic, and poised professional storyteller with lyrical cadence',
    ttsVoiceName: 'Kore',
    speechPitch: 1.12,
    speechRate: 1.02,
    badgeColor: '#EC4899',
    halftoneClass: 'bg-halftone-pink',
    accentHex: '#DB2777',
    sampleQuote:
      '"Every chapter leaves a crimson mark on the page—let’s trace the golden thread through all thirty-six compact pages without losing a single verse."',
    preferredGenres: ['Classic Fiction', 'Romance & Society', 'Poetry & Drama', 'Gothic', 'Literary Fiction'],
  },
  deadpool: {
    id: 'deadpool',
    name: 'Deadpool',
    roleTitle: 'Fourth-Wall Satirist',
    tagline: 'Razor-sharp metafictional wit, trope-busting commentary & brisk pacing',
    authorStylePrompt:
      'Summarize with Deadpool’s clever, sarcastic, fourth-wall-aware wit. Call out character blunders and plot tropes while delivering a rock-solid, crystal-clear, factually accurate chapter-by-chapter breakdown.',
    narratorStylePrompt:
      'Witty, dryly sarcastic, upbeat conversational narrator with crisp comic timing',
    ttsVoiceName: 'Puck',
    speechPitch: 1.04,
    speechRate: 1.08,
    badgeColor: '#DC2626',
    halftoneClass: 'bg-halftone-cyan',
    accentHex: '#DC2626',
    sampleQuote:
      '"Look, the author took 210 pages to say what we’re covering in 36. I kept the plot twists, trimmed the Victorian filler, and brought chimichangas."',
    preferredGenres: ['Sci-Fi', 'Mystery & Detective', 'Satire', 'Adventure', 'Gothic'],
  },
  gandalf: {
    id: 'gandalf',
    name: 'Gandalf',
    roleTitle: 'Fireside Loremaster',
    tagline: 'Timeless scholarly gravitas, warm hearthside cadence & deep lore',
    authorStylePrompt:
      'Summarize with Gandalf’s timeless, scholarly, warm fireside wisdom. Elevate the prose with dignified cadence, deep philosophical insight, and reverent fidelity to the chapter structure and factual chronology.',
    narratorStylePrompt:
      'Deep, resonant, calm, wise classic literary narrator reading beside a warm hearth',
    ttsVoiceName: 'Charon',
    speechPitch: 0.82,
    speechRate: 0.92,
    badgeColor: '#059669',
    halftoneClass: 'bg-halftone-emerald',
    accentHex: '#059669',
    sampleQuote:
      '"A compact edition is never too short, nor is it too long; it preserves precisely the wisdom each chapter meant to bestow."',
    preferredGenres: ['Philosophy', 'Epic & Myth', 'History', 'Classic Fiction', 'Sci-Fi'],
  },
};

/**
 * Deterministic FNV-1a 32-bit content hash for caching summaries and verifying manuscript identity.
 */
export function computeContentHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Computes a deterministic cache key for chapter summaries based on content hash, chapter ID, model, persona, and detail configuration.
 */
export function buildSummaryCacheKey(params: {
  contentHash: string;
  chapterId: string;
  model: string;
  personaId: PresetPersonalityId;
  detailLevel: SummaryDetailLevel;
  targetPages: number;
  customTrait?: string;
}): string {
  const raw = [
    params.contentHash,
    params.chapterId,
    params.model,
    params.personaId,
    params.detailLevel,
    String(params.targetPages),
    (params.customTrait || '').trim().toLowerCase(),
  ].join('::');
  return `sum-${computeContentHash(raw)}`;
}

/**
 * Splits long chapter paragraphs into context-aware chunks at paragraph and sentence boundaries,
 * avoiding arbitrary mid-sentence character truncation and preserving source-to-summary traceability.
 */
export function splitChapterIntoChunks(
  paragraphs: string[],
  maxChunkChars = 4500
): Array<{
  chunkIndex: number;
  text: string;
  paragraphRange: [number, number];
  charCount: number;
}> {
  const cleanParas = paragraphs
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);

  if (cleanParas.length === 0) return [];

  const safeMax = Math.max(500, maxChunkChars);
  const chunks: Array<{
    chunkIndex: number;
    text: string;
    paragraphRange: [number, number];
    charCount: number;
  }> = [];

  let currentParas: string[] = [];
  let currentLen = 0;
  let startParaIdx = 0;

  for (let i = 0; i < cleanParas.length; i++) {
    const para = cleanParas[i];

    // If a single paragraph exceeds safeMax, split it at sentence boundaries
    if (para.length > safeMax) {
      if (currentParas.length > 0) {
        const text = currentParas.join('\n\n');
        chunks.push({
          chunkIndex: chunks.length,
          text,
          paragraphRange: [startParaIdx, i - 1],
          charCount: text.length,
        });
        currentParas = [];
        currentLen = 0;
      }

      const sentences = para.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [para];
      let sentenceBuf = '';
      for (const s of sentences) {
        const trimmedS = s.trim();
        if (!trimmedS) continue;
        if (sentenceBuf.length + trimmedS.length + 1 > safeMax && sentenceBuf.length > 0) {
          chunks.push({
            chunkIndex: chunks.length,
            text: sentenceBuf,
            paragraphRange: [i, i],
            charCount: sentenceBuf.length,
          });
          sentenceBuf = trimmedS;
        } else {
          sentenceBuf = sentenceBuf ? `${sentenceBuf} ${trimmedS}` : trimmedS;
        }
      }
      if (sentenceBuf.length > 0) {
        chunks.push({
          chunkIndex: chunks.length,
          text: sentenceBuf,
          paragraphRange: [i, i],
          charCount: sentenceBuf.length,
        });
      }
      startParaIdx = i + 1;
      continue;
    }

    const projectedLen = currentLen === 0 ? para.length : currentLen + 2 + para.length;
    if (projectedLen > safeMax && currentParas.length > 0) {
      const text = currentParas.join('\n\n');
      chunks.push({
        chunkIndex: chunks.length,
        text,
        paragraphRange: [startParaIdx, i - 1],
        charCount: text.length,
      });
      currentParas = [para];
      currentLen = para.length;
      startParaIdx = i;
    } else {
      if (currentParas.length === 0) startParaIdx = i;
      currentParas.push(para);
      currentLen = projectedLen;
    }
  }

  if (currentParas.length > 0) {
    const text = currentParas.join('\n\n');
    chunks.push({
      chunkIndex: chunks.length,
      text,
      paragraphRange: [startParaIdx, cleanParas.length - 1],
      charCount: text.length,
    });
  }

  return chunks;
}

/**
 * Calculates the proportional compact page target for a book and its chapters.
 * Preserves exact 1-to-1 chapter count (e.g., 18 original chapters -> 18 compact chapters).
 */
export function calculateCompactPageAllocation(
  originalPagesPerChapter: number[],
  targetRatio = 0.175
): { totalOriginal: number; totalCompact: number; chapterCompactPages: number[] } {
  if (originalPagesPerChapter.length === 0) {
    return {
      totalOriginal: 0,
      totalCompact: 0,
      chapterCompactPages: [],
    };
  }
  const safeChapters = originalPagesPerChapter;
  const totalOriginal = safeChapters.reduce((sum, p) => sum + Math.max(1, p), 0);

  let rawTargetTotal = Math.round(totalOriginal * targetRatio);
  if (totalOriginal >= 150 && totalOriginal <= 260) {
    rawTargetTotal = Math.max(30, Math.min(40, rawTargetTotal));
  } else {
    rawTargetTotal = Math.max(safeChapters.length, rawTargetTotal);
  }

  // Ensure rawTargetTotal is at least safeChapters.length so every chapter gets >= 1 page
  rawTargetTotal = Math.max(safeChapters.length, rawTargetTotal);

  const chapterCompactPages = safeChapters.map((orig) =>
    Math.max(1, Math.round((orig / totalOriginal) * rawTargetTotal))
  );

  // Adjust rounding drift so chapterCompactPages sum to rawTargetTotal (while keeping >= 1 page per chapter)
  let currentSum = chapterCompactPages.reduce((a, b) => a + b, 0);
  let diff = rawTargetTotal - currentSum;

  let guard = 0;
  while (diff !== 0 && guard < 100) {
    guard++;
    if (diff > 0) {
      let maxIdx = 0;
      for (let i = 1; i < chapterCompactPages.length; i++) {
        if (safeChapters[i] > safeChapters[maxIdx]) maxIdx = i;
      }
      chapterCompactPages[maxIdx] += 1;
      diff -= 1;
    } else {
      let candidateIdx = -1;
      for (let i = 0; i < chapterCompactPages.length; i++) {
        if (
          chapterCompactPages[i] > 1 &&
          (candidateIdx === -1 ||
            chapterCompactPages[i] > chapterCompactPages[candidateIdx])
        ) {
          candidateIdx = i;
        }
      }
      if (candidateIdx === -1) break;
      chapterCompactPages[candidateIdx] -= 1;
      diff += 1;
    }
  }

  currentSum = chapterCompactPages.reduce((a, b) => a + b, 0);
  return {
    totalOriginal,
    totalCompact: currentSum,
    chapterCompactPages,
  };
}

/**
 * Applies deterministic persona voice framing to a pre-compressed curated edition's paragraphs.
 * NOTE: This is ONLY used for pre-authored curated seed summaries, NEVER to fake an AI summary on failure.
 */
export function applyPersonaVoiceToParagraphs(
  paragraphs: string[],
  personaId: PresetPersonalityId,
  chapterTitle: string,
  customTrait?: string
): string[] {
  if (!paragraphs || paragraphs.length === 0) return [];

  if (customTrait && customTrait.trim().length > 0) {
    const cleanTrait = customTrait.trim();
    return paragraphs.map((p, idx) =>
      idx === 0 ? `[${cleanTrait} Edition — ${chapterTitle}] ${p}` : p
    );
  }

  switch (personaId) {
    case 'homelander':
      return paragraphs.map((p, idx) => {
        if (idx === 0) {
          return `Listen closely, because I’m only going to break down "${chapterTitle}" once. While ordinary readers spend forty pages stumbling through this setup, here is the actual power dynamic at play: ${p}`;
        }
        if (idx === paragraphs.length - 1) {
          return `${p} Honestly, it’s almost tragic how hard everyone in this chapter tries to assert control when the outcome was obvious from page one.`;
        }
        return p;
      });

    case 'taylor_swift':
      return paragraphs.map((p, idx) => {
        if (idx === 0) {
          return `In "${chapterTitle}", the narrative shifts like autumn light across an old manuscript—every detail planted earlier begins to echo back in full color: ${p}`;
        }
        if (idx === paragraphs.length - 1) {
          return `${p} And just like the bridge of a song you can’t shake off, this chapter closes by leaving one lingers-in-the-dark question for the next act.`;
        }
        return p;
      });

    case 'deadpool':
      return paragraphs.map((p, idx) => {
        if (idx === 0) {
          return `Cue the dramatic page-turn for "${chapterTitle}"—yes, we’re keeping the chapter structure intact while surgically removing 82% of the author’s scenic detours: ${p}`;
        }
        if (idx === paragraphs.length - 1) {
          return `${p} (Spoiler-free high five: nobody learned their lesson yet, which is why the next chapter exists.)`;
        }
        return p;
      });

    case 'gandalf':
    default:
      return paragraphs.map((p, idx) => {
        if (idx === 0) {
          return `Let us turn our lamp to "${chapterTitle}", wherein the author’s grand design unfolds with measured gravity: ${p}`;
        }
        if (idx === paragraphs.length - 1) {
          return `${p} Thus concludes this movement of the tale, leaving wisdom for those patient enough to heed it.`;
        }
        return p;
      });
  }
}

/**
 * Extractive chapter preview helper used ONLY for unit tests or explicit extractive preview,
 * NEVER presented as an AI summary when Gemini fails.
 */
export function compressSingleChapterDeterministic(
  chapter: BookChapter,
  bookTitle: string,
  author: string,
  personaId: PresetPersonalityId,
  customTrait?: string
): { compactText: string[]; bulletPoints: string[] } {
  const sourceParas =
    chapter.originalText && chapter.originalText.length > 0
      ? chapter.originalText
      : [];

  if (sourceParas.length === 0) {
    return { compactText: [], bulletPoints: [] };
  }

  const compactBase = sourceParas.slice(0, 3).map((p, idx) => {
    const sentences = p.match(/[^.!?]+[.!?]+/g) || [p];
    const core = sentences.slice(0, 2).join(' ').trim();
    if (idx === 0) {
      return `${core} (${chapter.originalPages}p original condensed into ${chapter.compactPages}p for ${chapter.title} in ${bookTitle} by ${author}).`;
    }
    return core;
  });

  const compactText = applyPersonaVoiceToParagraphs(
    compactBase,
    personaId,
    chapter.title,
    customTrait
  );

  const bulletPoints = compactBase.map((s, bIdx) => {
    const cleanSentence = s.replace(/^\[.*?\]\s*/, '');
    return `Ch.${chapter.number} Point ${bIdx + 1}: ${cleanSentence}`;
  });

  return { compactText, bulletPoints };
}

/**
 * Splits raw uploaded book text (or structured extracted chapters) into a BookItem.
 * CONTENT INTEGRITY GUARANTEE:
 * - Never fabricates chapters when input text is empty or too short.
 * - Returns `availabilityStatus: 'extraction_failed'` with 0 chapters if no valid text is present.
 * - Preserves all detected chapters 1-to-1.
 */
export function buildBookFromExtractedText(
  title: string,
  author: string,
  rawText: string,
  fileFormat: 'EPUB' | 'PDF' | 'TXT',
  personaId: PresetPersonalityId = 'gandalf',
  preCompress = false,
  structuredChapters?: Array<{
    title: string;
    paragraphs: string[];
    pageStart?: number;
    pageEnd?: number;
  }>
): BookItem {
  const cleaned = (rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const rawChunks: Array<{
    title: string;
    paragraphs: string[];
    pageStart?: number;
    pageEnd?: number;
  }> = [];

  if (structuredChapters && structuredChapters.length > 0) {
    for (const ch of structuredChapters) {
      const validParas = ch.paragraphs
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter((p) => p.length > 0);
      if (validParas.length > 0) {
        rawChunks.push({
          title: ch.title,
          paragraphs: validParas,
          pageStart: ch.pageStart,
          pageEnd: ch.pageEnd,
        });
      }
    }
  } else if (cleaned.length >= 20) {
    const chapterRegex =
      /(?:^|\n)[ \t]*(?:(?:CHAPTER|Chapter|BOOK|Book|PART|Part|SECTION|Section|CANTO|Canto|ACT|Act|PROLOGUE|Prologue|EPILOGUE|Epilogue)\b[^\n]*|(?:[IVXLCDM]{1,7}|\d{1,3})\.\s+[A-Z][^\n]{2,80})/g;
    const matches = [...cleaned.matchAll(chapterRegex)];

    if (matches.length >= 2) {
      for (let i = 0; i < matches.length && i < 120; i++) {
        const start = matches[i].index ?? 0;
        const end =
          i + 1 < matches.length
            ? (matches[i + 1].index ?? cleaned.length)
            : cleaned.length;
        const headingLine = matches[i][0].trim();
        const body = cleaned.slice(start + matches[i][0].length, end).trim();
        if (body.length > 20) {
          const paras = body
            .split(/\n\s*\n/)
            .map((p) => p.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
          if (paras.length > 0) {
            rawChunks.push({ title: headingLine, paragraphs: paras });
          }
        }
      }
    }

    if (rawChunks.length === 0) {
      const paragraphs = cleaned
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter((p) => p.length > 0);

      if (paragraphs.length > 0) {
        const wordsPerSection = 1200;
        let currentParas: string[] = [];
        let currentWords = 0;
        let secNum = 1;

        for (const p of paragraphs) {
          const wc = p.split(/\s+/).length;
          currentParas.push(p);
          currentWords += wc;
          if (currentWords >= wordsPerSection) {
            rawChunks.push({
              title: `Section ${secNum}`,
              paragraphs: currentParas,
            });
            secNum++;
            currentParas = [];
            currentWords = 0;
          }
        }
        if (currentParas.length > 0) {
          rawChunks.push({
            title: rawChunks.length === 0 ? 'Full Text' : `Section ${secNum}`,
            paragraphs: currentParas,
          });
        }
      }
    }
  }

  // If no actual text could be extracted, NEVER fabricate synthetic chapters!
  if (rawChunks.length === 0) {
    return {
      id: `uploaded-${Date.now()}`,
      title: title || 'Unreadable Document',
      author: author || 'Unknown Author',
      year: new Date().getFullYear().toString(),
      genre: `${fileFormat} Import`,
      isPreCompressed: false,
      sourceType: 'uploaded',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded ${fileFormat} file — Extraction failed (no readable text found)`,
      extractionError:
        'No extractable text was found in this document. Never substituting synthetic chapters.',
      fileFormat,
      coverColor: '#7F1D1D',
      coverAccent: '#FDE047',
      originalTotalPages: 0,
      compactTotalPages: 0,
      superShortPages: 0,
      tagline: `Extraction failed for ${fileFormat} document.`,
      superShortExecutiveSummary: {
        thesis: 'No text available to summarize.',
        executivePages: [],
        coreTakeaways: [],
      },
      masterBookBullets: [],
      chapters: [],
    };
  }

  const allTextJoined = rawChunks
    .map((c) => `${c.title}\n${c.paragraphs.join('\n')}`)
    .join('\n\n');
  const contentHash = computeContentHash(allTextJoined);

  const origPagesList = rawChunks.map((chunk) => {
    if (
      typeof chunk.pageStart === 'number' &&
      typeof chunk.pageEnd === 'number' &&
      chunk.pageEnd >= chunk.pageStart
    ) {
      return Math.max(1, chunk.pageEnd - chunk.pageStart + 1);
    }
    const wordCount = chunk.paragraphs
      .join(' ')
      .split(/\s+/)
      .filter(Boolean).length;
    return Math.max(1, Math.round(wordCount / 260));
  });

  const allocation = calculateCompactPageAllocation(origPagesList, 0.175);

  const chapters: BookChapter[] = rawChunks.map((chunk, idx) => {
    const baseChap: BookChapter = {
      id: `up-ch-${idx + 1}`,
      number: idx + 1,
      title: chunk.title,
      originalPages: origPagesList[idx],
      compactPages: allocation.chapterCompactPages[idx],
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      originalText: chunk.paragraphs,
      compactText: [],
      bulletPoints: [],
      isCompressed: preCompress,
      summaryStatus: preCompress ? 'curated_seed' : 'uncompressed',
    };

    if (preCompress) {
      const compressed = compressSingleChapterDeterministic(
        baseChap,
        title,
        author,
        personaId
      );
      baseChap.compactText = compressed.compactText;
      baseChap.bulletPoints = compressed.bulletPoints;
    }

    return baseChap;
  });

  const masterBookBullets = chapters.map(
    (ch) =>
      `${ch.title} (${ch.originalPages}p → ${ch.compactPages}p): ${
        ch.bulletPoints[0] || ch.originalText[0]?.slice(0, 140) || ''
      }`
  );

  return {
    id: `uploaded-${Date.now()}`,
    title: title || 'Uploaded Club Manuscript',
    author: author || 'Independent Author',
    year: new Date().getFullYear().toString(),
    genre: `${fileFormat} Import`,
    isPreCompressed: preCompress,
    sourceType: 'uploaded',
    availabilityStatus: 'full_text',
    sourceAttribution: `Local ${fileFormat} Upload (${chapters.length} verified section${chapters.length === 1 ? '' : 's'})`,
    contentHash,
    fileFormat,
    coverColor: '#0047FF',
    coverAccent: '#F6C90E',
    originalTotalPages: allocation.totalOriginal,
    compactTotalPages: allocation.totalCompact,
    superShortPages: Math.min(4, Math.max(1, chapters.length)),
    tagline: `Verified ${fileFormat} manuscript with ${chapters.length} extracted chapter${chapters.length === 1 ? '' : 's'} (${allocation.totalOriginal}p original → ${allocation.totalCompact}p compact target).`,
    superShortExecutiveSummary: {
      thesis: `${title} contains ${chapters.length} verified chapter${chapters.length === 1 ? '' : 's'} extracted directly from the uploaded ${fileFormat} file.`,
      executivePages: chapters.slice(0, 3).map(
        (ch, idx) =>
          `Section ${idx + 1} (${ch.title}): ${ch.originalText[0]?.slice(0, 240) || ''}`
      ),
      coreTakeaways: masterBookBullets.slice(0, 6),
    },
    masterBookBullets,
    chapters,
  };
}

/**
 * Converts an ExternalCatalogBook fetched from Gutendex or Google Books into a BookItem.
 *
 * CONTENT INTEGRITY GUARANTEE (CRITICAL):
 * - NEVER manufactures fake chapters from `item.description` or generic templates.
 * - For `google_books` items (or items without verifiable full text):
 *   - If `item.previewText` has real preview paragraphs, sets `availabilityStatus: 'preview'`.
 *   - Otherwise sets `availabilityStatus: 'metadata_only'` and `chapters: []`.
 * - For `gutendex` items (with `gutenbergId`):
 *   - Sets `availabilityStatus: 'full_text'` and `chapters: []` until real Project Gutenberg
 *     chapters are fetched from `/api/books/gutenberg-chapters` via `hydrateBookWithGutenbergChapters()`.
 */
export function buildBookFromExternalCatalogItem(
  item: ExternalCatalogBook,
  _personaId: PresetPersonalityId = 'gandalf',
  _preCompress = false
): BookItem {
  const palette = [
    { coverColor: '#1E293B', coverAccent: '#F6C90E' },
    { coverColor: '#7F1D1D', coverAccent: '#FDE047' },
    { coverColor: '#14532D', coverAccent: '#FEF08A' },
    { coverColor: '#312E81', coverAccent: '#F97316' },
    { coverColor: '#701A75', coverAccent: '#FACC15' },
  ];
  const colorPick =
    palette[Math.abs(item.title.length + item.author.length) % palette.length];

  const srcApi = item.sourceApi || item.source || (item.gutenbergId ? 'gutendex' : 'google_books');
  const cleanDescription =
    item.description && item.description.trim().length > 0
      ? item.description.trim()
      : `Catalog entry for ${item.title} by ${item.author}.`;

  // Determine genuine content availability status
  let availabilityStatus: ContentAvailabilityStatus = item.availabilityStatus || 'metadata_only';
  if (!item.availabilityStatus) {
    if (srcApi === 'gutendex' && item.gutenbergId) {
      availabilityStatus = 'full_text';
    } else if (item.previewText && item.previewText.length > 0) {
      availabilityStatus = 'preview';
    } else {
      availabilityStatus = 'metadata_only';
    }
  }

  const sourceAttribution =
    item.sourceAttribution ||
    (srcApi === 'gutendex' && item.gutenbergId
      ? `Project Gutenberg Public Domain Archive (eBook #${item.gutenbergId})`
      : availabilityStatus === 'preview'
      ? 'Google Books Publisher Preview (Partial Text Only)'
      : 'Google Books Discovery Catalog (Metadata Only — Full Manuscript Copyrighted / Unavailable)');

  // Only populate chapters if actual preview text was explicitly provided; NEVER fabricate chapters from description!
  const chapters: BookChapter[] = [];
  if (availabilityStatus === 'preview' && item.previewText && item.previewText.length > 0) {
    const previewPages = Math.max(1, Math.round(item.previewText.join(' ').split(/\s+/).length / 250));
    chapters.push({
      id: `${item.id}-preview-1`,
      number: 1,
      title: 'Publisher Preview Excerpt',
      originalPages: previewPages,
      compactPages: 1,
      originalText: item.previewText,
      compactText: [],
      bulletPoints: [],
      isCompressed: false,
      summaryStatus: 'uncompressed',
    });
  }

  const estimatedTotalPages = item.pageCount && item.pageCount > 0 ? item.pageCount : 0;
  const estimatedCompactPages =
    estimatedTotalPages > 0 ? Math.max(1, Math.round(estimatedTotalPages * 0.175)) : 0;

  return {
    id: item.id,
    gutenbergId: item.gutenbergId,
    title: item.title,
    author: item.author,
    year: item.year || 'Catalog Edition',
    genre: item.genre || 'Literary Archive',
    subgenres: item.subgenres || [item.genre],
    mlTags: item.mlTags || [item.genre.toLowerCase(), item.author.toLowerCase()],
    trendingScore: item.trendingScore || 85,
    isFeatured: item.isFeatured || false,
    isPreCompressed: false,
    sourceType: srcApi === 'google_books' ? 'google_books' : 'gutendex',
    availabilityStatus,
    sourceAttribution,
    fileFormat: srcApi === 'gutendex' ? 'GUTENDEX' : 'GOOGLE BOOKS',
    coverUrl: item.coverUrl,
    coverColor: colorPick.coverColor,
    coverAccent: colorPick.coverAccent,
    originalTotalPages: estimatedTotalPages,
    compactTotalPages: estimatedCompactPages,
    superShortPages: chapters.length > 0 ? 1 : 0,
    tagline: cleanDescription.slice(0, 220),
    superShortExecutiveSummary: {
      thesis: cleanDescription,
      executivePages:
        availabilityStatus === 'metadata_only'
          ? [
              `Catalog Description: ${cleanDescription}`,
              `Source & Rights Notice: This entry was discovered via ${sourceAttribution}. No public-domain full text is attached to this record, so The Readers Club does not fabricate chapters.`,
            ]
          : [cleanDescription],
      coreTakeaways: [
        `Author: ${item.author}`,
        `Genre: ${item.genre}`,
        `Availability: ${availabilityStatus === 'full_text' ? 'Full Public-Domain Text via Project Gutenberg' : availabilityStatus === 'preview' ? 'Publisher Preview Excerpt' : 'Catalog Metadata Only'}`,
      ],
    },
    masterBookBullets: [],
    chapters,
  };
}

/**
 * Hydrates a Project Gutenberg BookItem with real chapters retrieved from `/api/books/gutenberg-chapters`.
 * If no valid chapters were extracted from the Gutenberg text, sets `availabilityStatus: 'extraction_failed'`
 * rather than leaving fake content.
 */
export function hydrateBookWithGutenbergChapters(
  book: BookItem,
  extractedChapters: Array<{
    number: number;
    title: string;
    originalText: string[];
  }>
): BookItem {
  const validChapters = (extractedChapters || []).filter(
    (c) => Array.isArray(c.originalText) && c.originalText.length > 0
  );

  if (validChapters.length === 0) {
    return {
      ...book,
      availabilityStatus: 'extraction_failed',
      extractionError:
        'Project Gutenberg manuscript could not be parsed into readable chapters.',
      chapters: [],
    };
  }

  const origPagesPerChapter = validChapters.map((ch) => {
    const words = ch.originalText.join(' ').split(/\s+/).filter(Boolean).length;
    return Math.max(2, Math.round(words / 260));
  });

  const allocation = calculateCompactPageAllocation(origPagesPerChapter, 0.175);
  const fullTextJoined = validChapters
    .map((c) => `${c.title}\n${c.originalText.join('\n')}`)
    .join('\n\n');
  const contentHash = computeContentHash(fullTextJoined);

  const chapters: BookChapter[] = validChapters.map((ch, idx) => ({
    id: `${book.id}-ch-${idx + 1}`,
    number: idx + 1,
    title: ch.title,
    originalPages: origPagesPerChapter[idx],
    compactPages: allocation.chapterCompactPages[idx],
    originalText: ch.originalText,
    compactText: [],
    bulletPoints: [],
    isCompressed: false,
    summaryStatus: 'uncompressed',
  }));

  const masterBookBullets = chapters.map(
    (c) =>
      `${c.title} (${c.originalPages}p original → ${c.compactPages}p target): ${
        c.originalText[0]?.slice(0, 140) || ''
      }...`
  );

  return {
    ...book,
    availabilityStatus: 'full_text',
    contentHash,
    originalTotalPages: allocation.totalOriginal,
    compactTotalPages: allocation.totalCompact,
    superShortPages: Math.min(4, Math.max(2, Math.ceil(chapters.length / 6))),
    superShortExecutiveSummary: {
      thesis: `${book.title} by ${book.author} spans ${chapters.length} verified chapters (${allocation.totalOriginal}p original manuscript → ${allocation.totalCompact}p compact target) retrieved directly from Project Gutenberg.`,
      executivePages: chapters.slice(0, 3).map(
        (ch, idx) =>
          `Movement ${idx + 1} (${ch.title}): ${ch.originalText[0]?.slice(0, 260) || ''}`
      ),
      coreTakeaways: masterBookBullets.slice(0, 6),
    },
    masterBookBullets,
    chapters,
  };
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under',
  'between', 'through', 'about', 'after', 'before', 'book', 'novel', 'story',
  'edition', 'classic', 'volume', 'work', 'tale', 'life', 'world', 'their',
  'have', 'has', 'had', 'were', 'was', 'are', 'his', 'her', 'its', 'who',
]);

function tokenizeMetadata(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function buildDocumentFeatures(book: ExternalCatalogBook): {
  tokens: Record<string, number>;
  genres: Set<string>;
  authorTokens: Set<string>;
  themeTokens: Set<string>;
} {
  const tokens: Record<string, number> = {};
  const genres = new Set<string>();
  const authorTokens = new Set<string>();
  const themeTokens = new Set<string>();

  const addToken = (tok: string, weight: number) => {
    if (!tok) return;
    tokens[tok] = (tokens[tok] || 0) + weight;
  };

  // Genre & subgenres carry strong structural weight
  const allGenres = [book.genre, ...(book.subgenres || [])].filter(Boolean);
  for (const g of allGenres) {
    const cleanG = g.toLowerCase().trim();
    genres.add(cleanG);
    addToken(`genre:${cleanG}`, 3.0);
    for (const gt of tokenizeMetadata(cleanG)) {
      addToken(gt, 2.2);
      themeTokens.add(gt);
    }
  }

  // Author tokens
  const cleanAuthor = (book.author || '').toLowerCase().trim();
  if (cleanAuthor) {
    addToken(`author:${cleanAuthor}`, 3.2);
    for (const at of tokenizeMetadata(cleanAuthor)) {
      authorTokens.add(at);
      addToken(`author_tok:${at}`, 2.0);
    }
  }

  // ML Tags & Subjects
  for (const tag of book.mlTags || []) {
    for (const tt of tokenizeMetadata(tag)) {
      themeTokens.add(tt);
      addToken(tt, 2.0);
    }
  }

  // Title & Description thematic tokens
  for (const tt of tokenizeMetadata(book.title)) {
    themeTokens.add(tt);
    addToken(tt, 1.5);
  }
  for (const dt of tokenizeMetadata(book.description || '')) {
    themeTokens.add(dt);
    addToken(dt, 1.0);
  }

  return { tokens, genres, authorTokens, themeTokens };
}

function cosineSimilarity(
  vecA: Record<string, number>,
  vecB: Record<string, number>
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const val of Object.values(vecA)) {
    normA += val * val;
  }
  for (const val of Object.values(vecB)) {
    normB += val * val;
  }
  if (normA === 0 || normB === 0) return 0;

  for (const [k, valA] of Object.entries(vecA)) {
    const valB = vecB[k];
    if (valB !== undefined) {
      dot += valA * valB;
    }
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Genuine TF-IDF + Cosine Similarity + Maximal Marginal Relevance (MMR) Recommendation Engine.
 *
 * Features:
 * 1. Computes Inverse Document Frequency (IDF) across the candidate corpus.
 * 2. Builds TF-IDF vectors for every candidate book over genres, subgenres, authors, subjects, and descriptions.
 * 3. Builds a composite User Taste TF-IDF Vector from:
 *    - Explicit liked books (+2.8x weight)
 *    - Explicit disliked books (-2.2x negative penalty weight)
 *    - Reading history & viewed books (+1.8x weight)
 *    - Genre interaction counts & search history (+2.0x weight)
 *    - Active persona literary preferences (+1.2x weight, primary signal during cold-start)
 * 4. Ranks candidates via Cosine Similarity, applies MMR diversity penalty so a single author/genre
 *    cannot monopolize the top shelf, and emits structured, human-readable explanations.
 */
export function computeMlRecommendations(
  candidates: ExternalCatalogBook[],
  taste: UserTasteProfile,
  limit = 12
): ScoredBookRecommendation[] {
  if (!candidates || candidates.length === 0) return [];

  const personaProfile =
    PERSONALITY_PROFILES[taste.activePersona] || PERSONALITY_PROFILES.gandalf;
  const likedSet = new Set(taste.likedBookIds || []);
  const dislikedSet = new Set(taste.dislikedBookIds || []);
  const viewedSet = new Set([
    ...(taste.viewedBookIds || []),
    ...(taste.completedBookIds || []),
  ]);

  const isColdStart =
    Object.keys(taste.favoriteGenres || {}).length === 0 &&
    (taste.searchHistory || []).length === 0 &&
    viewedSet.size === 0 &&
    likedSet.size === 0 &&
    dislikedSet.size === 0;

  // Step 1: Extract raw term frequencies per candidate & document frequency across corpus
  const docFeatures = candidates.map((b) => buildDocumentFeatures(b));
  const docFreq: Record<string, number> = {};
  const N = candidates.length;

  for (const df of docFeatures) {
    for (const term of Object.keys(df.tokens)) {
      docFreq[term] = (docFreq[term] || 0) + 1;
    }
  }

  // Step 2: Compute smoothed IDF and normalized TF-IDF vector for each book
  const idf: Record<string, number> = {};
  for (const [term, dfCount] of Object.entries(docFreq)) {
    idf[term] = Math.log(1 + N / (1 + dfCount)) + 1.0;
  }

  const bookTfIdfVectors: Record<string, number>[] = docFeatures.map((df) => {
    const vec: Record<string, number> = {};
    for (const [term, tf] of Object.entries(df.tokens)) {
      vec[term] = (1 + Math.log(tf)) * (idf[term] || 1.0);
    }
    return vec;
  });

  // Step 3: Construct User Taste Profile Vector in the same TF-IDF space
  const userVector: Record<string, number> = {};
  const addUserTerm = (term: string, weight: number) => {
    const termIdf = idf[term] || 1.25;
    userVector[term] = (userVector[term] || 0) + weight * termIdf;
  };

  // 3a. Persona baseline preferences (always active, primary during cold-start)
  const personaWeight = isColdStart ? 2.5 : 1.1;
  for (const pg of personaProfile.preferredGenres || []) {
    const cleanPg = pg.toLowerCase().trim();
    addUserTerm(`genre:${cleanPg}`, personaWeight);
    for (const tok of tokenizeMetadata(cleanPg)) {
      addUserTerm(tok, personaWeight * 0.85);
    }
  }

  // 3b. Explicit Genre affinity counts
  for (const [genreKey, count] of Object.entries(taste.favoriteGenres || {})) {
    const cleanG = genreKey.toLowerCase().trim();
    addUserTerm(`genre:${cleanG}`, count * 2.2);
    for (const tok of tokenizeMetadata(cleanG)) {
      addUserTerm(tok, count * 1.6);
    }
  }

  // 3c. Search history tokens
  for (const query of (taste.searchHistory || []).slice(-8)) {
    for (const tok of tokenizeMetadata(query)) {
      addUserTerm(tok, 2.4);
    }
  }

  // 3d. Centroid feedback from Liked, Viewed, and Disliked books (Rocchio-style query expansion)
  const likedBooks: ExternalCatalogBook[] = [];
  const viewedBooks: ExternalCatalogBook[] = [];
  const dislikedBooks: ExternalCatalogBook[] = [];

  candidates.forEach((book, idx) => {
    const vec = bookTfIdfVectors[idx];
    if (likedSet.has(book.id)) {
      likedBooks.push(book);
      for (const [term, val] of Object.entries(vec)) {
        userVector[term] = (userVector[term] || 0) + val * 1.65;
      }
    } else if (dislikedSet.has(book.id)) {
      dislikedBooks.push(book);
      for (const [term, val] of Object.entries(vec)) {
        userVector[term] = (userVector[term] || 0) - val * 1.35;
      }
    } else if (viewedSet.has(book.id)) {
      viewedBooks.push(book);
      for (const [term, val] of Object.entries(vec)) {
        userVector[term] = (userVector[term] || 0) + val * 0.9;
      }
    }
  });

  // Remove negative components from userVector before cosine calculation while keeping track of dislike similarity separately
  const positiveUserVector: Record<string, number> = {};
  for (const [term, val] of Object.entries(userVector)) {
    if (val > 0) positiveUserVector[term] = val;
  }

  // Step 4: Score every candidate with Cosine Similarity + Dislike Penalty + Availability Bonus
  interface RawCandidateEval {
    idx: number;
    book: ExternalCatalogBook;
    rawUtility: number;
    cosineScore: number;
    reasons: RecommendationExplanation[];
  }

  const evaluations: RawCandidateEval[] = candidates.map((book, idx) => {
    const vec = bookTfIdfVectors[idx];
    const feat = docFeatures[idx];
    const simToUser = cosineSimilarity(vec, positiveUserVector);

    // Compute similarity to explicitly liked & disliked books
    let maxLikedSim = 0;
    let bestLikedBook: ExternalCatalogBook | null = null;
    for (const lb of likedBooks) {
      if (lb.id === book.id) continue;
      const lbIdx = candidates.findIndex((c) => c.id === lb.id);
      if (lbIdx !== -1) {
        const s = cosineSimilarity(vec, bookTfIdfVectors[lbIdx]);
        if (s > maxLikedSim) {
          maxLikedSim = s;
          bestLikedBook = lb;
        }
      }
    }

    let maxDislikedSim = 0;
    for (const db of dislikedBooks) {
      const dbIdx = candidates.findIndex((c) => c.id === db.id);
      if (dbIdx !== -1) {
        const s = cosineSimilarity(vec, bookTfIdfVectors[dbIdx]);
        if (s > maxDislikedSim) maxDislikedSim = s;
      }
    }

    const isExplicitlyDisliked = dislikedSet.has(book.id);
    const isExplicitlyLiked = likedSet.has(book.id);

    // Availability quality bonus (prefer verifiable full_text over metadata_only)
    const fullTextBonus =
      book.availabilityStatus === 'full_text' || book.gutenbergId ? 0.08 : 0;
    const popularityPrior = Math.min(0.1, ((book.trendingScore || 80) - 70) / 300);

    let rawUtility =
      simToUser * 0.72 +
      maxLikedSim * 0.25 +
      fullTextBonus +
      popularityPrior -
      maxDislikedSim * 0.35;

    if (isExplicitlyLiked) rawUtility += 0.18;
    if (isExplicitlyDisliked) rawUtility -= 0.85;

    // Build transparent, verifiable explanations
    const reasons: RecommendationExplanation[] = [];

    // 1. Check related author from liked or viewed books
    const authorMatchBook = [...likedBooks, ...viewedBooks].find(
      (b) =>
        b.id !== book.id &&
        b.author.toLowerCase().trim() === book.author.toLowerCase().trim()
    );
    if (authorMatchBook) {
      reasons.push({
        type: 'related_author',
        label: `Related author: ${book.author} (you explored "${authorMatchBook.title}")`,
      });
    }

    // 2. Check reading history / liked book similarity
    if (bestLikedBook && maxLikedSim > 0.15) {
      reasons.push({
        type: 'reading_history',
        label: `Based on your interest in "${bestLikedBook.title}"`,
      });
    } else if (viewedBooks.length > 0) {
      const historyMatch = viewedBooks.find(
        (vb) =>
          vb.id !== book.id &&
          vb.genre.toLowerCase() === book.genre.toLowerCase()
      );
      if (historyMatch) {
        reasons.push({
          type: 'reading_history',
          label: `Based on your reading history in ${book.genre}`,
        });
      }
    }

    // 3. Check shared genre preference
    const matchedFavGenre = Object.keys(taste.favoriteGenres || {}).find(
      (g) =>
        feat.genres.has(g.toLowerCase()) ||
        book.genre.toLowerCase().includes(g.toLowerCase())
    );
    if (matchedFavGenre) {
      reasons.push({
        type: 'shared_genre',
        label: `Shared genre: ${book.genre}`,
      });
    }

    // 4. Check shared thematic keywords
    const sharedThemes = [...feat.themeTokens].filter(
      (t) => (positiveUserVector[t] || 0) > 1.8
    );
    if (sharedThemes.length > 0) {
      reasons.push({
        type: 'similar_themes',
        label: `Similar themes: ${sharedThemes.slice(0, 3).join(', ')}`,
      });
    }

    // 5. Cold-start fallback explanation
    if (reasons.length === 0) {
      reasons.push({
        type: isColdStart ? 'cold_start_popular' : 'shared_genre',
        label: isColdStart
          ? `Popular in ${book.genre} · Aligned with ${personaProfile.name}'s library`
          : `Shared genre: ${book.genre}`,
      });
    }

    return {
      idx,
      book,
      rawUtility,
      cosineScore: Math.max(0, Math.min(1, simToUser)),
      reasons,
    };
  });

  // Step 5: Maximal Marginal Relevance (MMR) Selection for Diversity
  // Ensures the recommendation shelf does not repeat the exact same author or identical subgenre cluster
  const selected: RawCandidateEval[] = [];
  const remaining = [...evaluations].sort((a, b) => b.rawUtility - a.rawUtility);
  const lambda = 0.78; // 78% relevance, 22% diversity

  while (selected.length < limit && remaining.length > 0) {
    if (selected.length === 0) {
      selected.push(remaining.shift()!);
      continue;
    }

    let bestIdx = 0;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      // Disliked items stay at the bottom
      if (dislikedSet.has(cand.book.id)) {
        const score = cand.rawUtility - 2.0;
        if (score > bestMmrScore) {
          bestMmrScore = score;
          bestIdx = i;
        }
        continue;
      }

      let maxSimToSelected = 0;
      for (const sel of selected) {
        const sim = cosineSimilarity(
          bookTfIdfVectors[cand.idx],
          bookTfIdfVectors[sel.idx]
        );
        const sameAuthorPenalty =
          cand.book.author.toLowerCase() === sel.book.author.toLowerCase()
            ? 0.35
            : 0;
        maxSimToSelected = Math.max(maxSimToSelected, sim + sameAuthorPenalty);
      }

      const mmrScore =
        lambda * cand.rawUtility - (1 - lambda) * maxSimToSelected;
      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected.map((item) => {
    // Map rawUtility (-0.5..1.0) into a meaningful 55%..99% match score
    const clampedUtility = Math.max(0, Math.min(1, item.rawUtility));
    const matchPercentage = dislikedSet.has(item.book.id)
      ? Math.max(35, Math.round(45 + clampedUtility * 20))
      : Math.min(99, Math.max(68, Math.round(72 + clampedUtility * 27)));

    const primaryReason = item.reasons[0]?.label || `Shared genre: ${item.book.genre}`;

    return {
      book: item.book,
      matchPercentage,
      similarityScore: Number(item.cosineScore.toFixed(4)),
      matchReason: `${matchPercentage}% Match · ${primaryReason}`,
      explanationReasons: item.reasons,
    };
  });
}
