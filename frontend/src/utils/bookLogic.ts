import {
  BookChapter,
  BookItem,
  ExternalCatalogBook,
  PersonalityProfile,
  PresetPersonalityId,
} from '../types/book';

export const PERSONALITY_PROFILES: Record<PresetPersonalityId, PersonalityProfile> = {
  homelander: {
    id: 'homelander',
    name: 'Homelander',
    roleTitle: 'Apex Command Critic',
    tagline: 'Theatrical authority, ruthless power analysis & zero-tolerance clarity',
    authorStylePrompt:
      'Summarize with Homelander’s theatrical, supremely self-assured, slightly condescending corporate-superhero authority. Address the readers as if you are doing them a monumental favor by distilling this literature into pure perfection. Keep all chapter facts and philosophical depth intact.',
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
  },
  taylor_swift: {
    id: 'taylor_swift',
    name: 'Taylor Swift',
    roleTitle: 'Lyrical Narrative Architect',
    tagline: 'Vivid imagery, emotional precision & golden narrative bridges',
    authorStylePrompt:
      'Summarize with Taylor Swift’s poetic and professional literary voice: vivid imagery, emotional precision, clever metaphors, and structured narrative bridges that connect every chapter’s turning point with grace and intellectual clarity.',
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
  },
  deadpool: {
    id: 'deadpool',
    name: 'Deadpool',
    roleTitle: 'Fourth-Wall Satirist',
    tagline: 'Razor-sharp metafictional wit, trope-busting commentary & brisk pacing',
    authorStylePrompt:
      'Summarize with Deadpool’s clever, sarcastic, fourth-wall-aware wit. Call out character blunders and plot tropes while delivering a rock-solid, crystal-clear chapter-by-chapter breakdown.',
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
  },
  gandalf: {
    id: 'gandalf',
    name: 'Gandalf',
    roleTitle: 'Fireside Loremaster',
    tagline: 'Timeless scholarly gravitas, warm hearthside cadence & deep lore',
    authorStylePrompt:
      'Summarize with Gandalf’s timeless, scholarly, warm fireside wisdom. Elevate the prose with dignified cadence, deep philosophical insight, and reverent fidelity to the chapter structure.',
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
  },
};

/**
 * Calculates the proportional compact page target for a book and its chapters.
 * Main goal: a ~200-page book scales to 30-40 pages (default ~17.5% ratio),
 * preserving exact chapter-by-chapter structure.
 */
export function calculateCompactPageAllocation(
  originalPagesPerChapter: number[],
  targetRatio = 0.175
): { totalOriginal: number; totalCompact: number; chapterCompactPages: number[] } {
  const safeChapters =
    originalPagesPerChapter.length > 0 ? originalPagesPerChapter : [30];
  const totalOriginal = safeChapters.reduce((sum, p) => sum + Math.max(1, p), 0);

  // Guarantee standard full-length books (~150-260 pages) land squarely in the 30-40 page window
  let rawTargetTotal = Math.round(totalOriginal * targetRatio);
  if (totalOriginal >= 150 && totalOriginal <= 260) {
    rawTargetTotal = Math.max(30, Math.min(40, rawTargetTotal));
  } else {
    rawTargetTotal = Math.max(safeChapters.length, rawTargetTotal);
  }

  const chapterCompactPages = safeChapters.map((orig) =>
    Math.max(1, Math.round((orig / totalOriginal) * rawTargetTotal))
  );

  // Adjust rounding drift so chapterCompactPages sum to rawTargetTotal
  const currentSum = chapterCompactPages.reduce((a, b) => a + b, 0);
  const diff = rawTargetTotal - currentSum;
  if (diff !== 0 && chapterCompactPages.length > 0) {
    // Apply adjustment to the largest chapter
    let maxIdx = 0;
    for (let i = 1; i < chapterCompactPages.length; i++) {
      if (chapterCompactPages[i] > chapterCompactPages[maxIdx]) {
        maxIdx = i;
      }
    }
    chapterCompactPages[maxIdx] = Math.max(1, chapterCompactPages[maxIdx] + diff);
  }

  const totalCompact = chapterCompactPages.reduce((a, b) => a + b, 0);
  return {
    totalOriginal,
    totalCompact,
    chapterCompactPages,
  };
}

/**
 * Applies deterministic persona voice framing to a chapter's compact text
 * when instant preview or offline fallback is needed.
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
      idx === 0
        ? `[${cleanTrait} Edition — ${chapterTitle}] ${p}`
        : p
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
 * Splits raw uploaded book text (from TXT, Markdown, PDF text stream, or EPUB chapters)
 * into structured Chapterwise Compact BookItem data.
 */
export function buildBookFromExtractedText(
  title: string,
  author: string,
  rawText: string,
  fileFormat: 'EPUB' | 'PDF' | 'TXT',
  personaId: PresetPersonalityId = 'gandalf'
): BookItem {
  const cleaned = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Split by Chapter headings or fallback to balanced chunks
  const chapterRegex = /(?:^|\n)(?:CHAPTER|Chapter|BOOK|Book|PART|Part|SECTION|Section)\s+(?:[IVXLCDM\d]+|[A-Za-z]+)(?:[:.-]\s*[^\n]+)?/g;
  const matches = [...cleaned.matchAll(chapterRegex)];

  const rawChunks: { title: string; body: string }[] = [];

  if (matches.length >= 2) {
    for (let i = 0; i < matches.length && i < 12; i++) {
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? cleaned.length) : cleaned.length;
      const headingLine = matches[i][0].trim();
      const body = cleaned.slice(start + matches[i][0].length, end).trim();
      if (body.length > 80) {
        rawChunks.push({ title: headingLine, body });
      }
    }
  }

  if (rawChunks.length === 0) {
    const paragraphs = cleaned
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 30);

    const numChapters = Math.min(6, Math.max(3, Math.ceil(paragraphs.length / 4)));
    const perChap = Math.max(1, Math.ceil(paragraphs.length / numChapters));

    for (let i = 0; i < numChapters; i++) {
      const slice = paragraphs.slice(i * perChap, (i + 1) * perChap);
      if (slice.length > 0) {
        rawChunks.push({
          title: `Chapter ${i + 1}: ${slice[0].split(/\s+/).slice(0, 5).join(' ').replace(/[^\w\s]/g, '')}...`,
          body: slice.join('\n\n'),
        });
      }
    }
  }

  // Estimate original pages (~200 page baseline scale for uploaded books)
  const wordCountTotal = cleaned.split(/\s+/).filter(Boolean).length;
  const estimatedBookPages = Math.max(
    195,
    Math.min(240, Math.round(wordCountTotal / 15) || 200)
  );

  const totalBodyLen = Math.max(
    1,
    rawChunks.reduce((acc, c) => acc + c.body.length, 0)
  );

  const origPagesList = rawChunks.map((chunk) => {
    const ratio = Math.max(0.1, chunk.body.length / totalBodyLen);
    return Math.max(15, Math.round(estimatedBookPages * ratio));
  });

  const allocation = calculateCompactPageAllocation(origPagesList, 0.175);

  const chapters: BookChapter[] = rawChunks.map((chunk, idx) => {
    const paras = chunk.body
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const originalText =
      paras.length >= 3
        ? paras
        : [
            chunk.body || 'Original chapter manuscript text extracted from uploaded volume.',
            'The narrative develops its central conflict through detailed scenes, character exchanges, and thematic exposition.',
            'Key arguments and turning points establish the foundation for the subsequent chapter.',
          ];

    // Build condensed chapter-wise compact paragraphs (preserving chapter structure)
    const compactBase = originalText.slice(0, 3).map((p) => {
      const sentences = p.match(/[^.!?]+[.!?]+/g) || [p];
      return sentences.slice(0, 2).join(' ').trim();
    });

    const compactText = applyPersonaVoiceToParagraphs(
      compactBase,
      personaId,
      chunk.title
    );

    const bulletPoints = compactBase.map((s, bIdx) => {
      const cleanSentence = s.replace(/^\[.*?\]\s*/, '');
      return `Key Point ${idx + 1}.${bIdx + 1}: ${cleanSentence}`;
    });

    return {
      id: `up-ch-${idx + 1}`,
      number: idx + 1,
      title: chunk.title,
      originalPages: origPagesList[idx],
      compactPages: allocation.chapterCompactPages[idx],
      originalText,
      compactText,
      bulletPoints,
    };
  });

  const masterBookBullets = chapters.map(
    (ch) => `${ch.title} (${ch.originalPages}p → ${ch.compactPages}p): ${ch.bulletPoints[0] || ''}`
  );

  return {
    id: `uploaded-${Date.now()}`,
    title: title || 'Uploaded Club Manuscript',
    author: author || 'Club Member Upload',
    year: '2026',
    genre: `${fileFormat} Import · Chapterwise Edition`,
    sourceType: 'uploaded',
    fileFormat,
    coverColor: '#0047FF',
    coverAccent: '#F6C90E',
    originalTotalPages: allocation.totalOriginal,
    compactTotalPages: allocation.totalCompact,
    superShortPages: 3,
    tagline: `Uploaded ${fileFormat} condensed from ${allocation.totalOriginal}p into a ${allocation.totalCompact}p chapter-wise compact edition.`,
    superShortExecutiveSummary: {
      thesis: `${title} explores its core thesis across ${chapters.length} distinct structural movements, distilled here into a 3-page executive briefing.`,
      executivePages: [
        `Page 1 (Foundation & Premise): ${chapters[0]?.compactText[0] || ''}`,
        `Page 2 (Structural Progression): ${chapters
          .slice(1, -1)
          .map((c) => c.compactText[0])
          .join(' ') || chapters[0]?.compactText.slice(-1)[0] || ''}`,
        `Page 3 (Resolution & Synthesis): ${chapters[chapters.length - 1]?.compactText.join(' ') || ''}`,
      ],
      coreTakeaways: masterBookBullets.slice(0, 4),
    },
    masterBookBullets,
    chapters,
  };
}

/**
 * Converts an ExternalCatalogBook fetched from Gutendex or Google Books API
 * into a structured 5-mode BookItem with its original cover poster preserved.
 */
export function buildBookFromExternalCatalogItem(
  item: ExternalCatalogBook,
  personaId: PresetPersonalityId = 'gandalf'
): BookItem {
  const palette = [
    { coverColor: '#1E293B', coverAccent: '#F6C90E' },
    { coverColor: '#7F1D1D', coverAccent: '#FDE047' },
    { coverColor: '#14532D', coverAccent: '#FEF08A' },
    { coverColor: '#312E81', coverAccent: '#F97316' },
    { coverColor: '#701A75', coverAccent: '#FACC15' },
  ];
  const colorPick = palette[Math.abs(item.title.length + item.author.length) % palette.length];

  const basePages = item.pageCount && item.pageCount >= 150 && item.pageCount <= 260
    ? item.pageCount
    : 210;

  const chapterWeights = [34, 36, 35, 36, 34, 35];
  const scale = basePages / 210;
  const origPagesList = chapterWeights.map((w) => Math.max(20, Math.round(w * scale)));
  const allocation = calculateCompactPageAllocation(origPagesList, 0.175);

  const summarySeed =
    item.description && item.description.trim().length > 40
      ? item.description.trim()
      : `${item.title} by ${item.author} is a landmark work of ${item.genre.toLowerCase()} exploring human ambition, moral consequence, and the forces that shape society.`;

  const movementTitles = [
    `Chapter 1: Premise & Opening World of ${item.title}`,
    `Chapter 2: Rising Tensions & Catalyst`,
    `Chapter 3: The Crucible of Conflict`,
    `Chapter 4: Philosophical & Narrative Turning Point`,
    `Chapter 5: Convergence & Climax`,
    `Chapter 6: Resolution & Enduring Legacy`,
  ];

  const chapters: BookChapter[] = movementTitles.map((chTitle, idx) => {
    const origP = origPagesList[idx];
    const compP = allocation.chapterCompactPages[idx];

    const originalText = [
      `${summarySeed} In this movement (${chTitle}), ${item.author} establishes the foundational stakes and draws the reader into the central dramatic architecture of the work.`,
      `Across these ${origP} pages of the unabridged edition, key characters and arguments are tested against the social, historical, and psychological pressures of ${item.genre.toLowerCase()}.`,
      `Every detail in this section builds toward the next structural movement, reinforcing why ${item.title} remains an essential volume in world literature.`,
    ];

    const compactBase = [
      `${chTitle} distills ${origP} original pages into ${compP} proportional pages: ${summarySeed.slice(0, 260)}`,
      `${item.author} advances the central conflict by contrasting appearances against underlying motives, sharpening the thematic focus of the work.`,
      `The movement concludes by locking the narrative trajectory into place for the chapters that follow.`,
    ];

    const compactText = applyPersonaVoiceToParagraphs(
      compactBase,
      personaId,
      chTitle
    );

    const bulletPoints = [
      `Core Focus: ${chTitle.replace(/^Chapter \d+:\s*/, '')} anchors the narrative arc of ${item.title}.`,
      `Thematic Weight: ${item.author} examines the tension between individual agency and systemic circumstance.`,
      `Structural Progression: Condenses ${origP} unabridged pages into ${compP} focused compact pages.`,
    ];

    return {
      id: `${item.id}-ch-${idx + 1}`,
      number: idx + 1,
      title: chTitle,
      originalPages: origP,
      compactPages: compP,
      originalText,
      compactText,
      bulletPoints,
    };
  });

  const masterBookBullets = chapters.map(
    (c) => `${c.title} (${c.originalPages}p → ${c.compactPages}p): ${c.bulletPoints[0]}`
  );

  return {
    id: item.id,
    title: item.title,
    author: item.author,
    year: item.year || 'Classic Edition',
    genre: item.genre || 'Literary Archive',
    sourceType: 'open_source',
    fileFormat: item.sourceApi === 'gutendex' ? 'GUTENDEX' : 'GOOGLE BOOKS',
    coverUrl: item.coverUrl,
    coverColor: colorPick.coverColor,
    coverAccent: colorPick.coverAccent,
    originalTotalPages: allocation.totalOriginal,
    compactTotalPages: allocation.totalCompact,
    superShortPages: 3,
    tagline: summarySeed.slice(0, 160),
    superShortExecutiveSummary: {
      thesis: `${item.title} by ${item.author} (${item.year}) is presented here in a proportional ${allocation.totalCompact}-page chapter-wise edition alongside a 3-page executive briefing.`,
      executivePages: [
        `Page 1 — Foundation & Context: ${summarySeed}`,
        `Page 2 — Structural Arc: Across six distinct chapters, ${item.author} develops the central themes of ${item.genre.toLowerCase()} with escalating precision and psychological depth.`,
        `Page 3 — Synthesis & Legacy: The resolution ties together the opening premise and enduring cultural impact of ${item.title}.`,
      ],
      coreTakeaways: masterBookBullets.slice(0, 4),
    },
    masterBookBullets,
    chapters,
  };
}

