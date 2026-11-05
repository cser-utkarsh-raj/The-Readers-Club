export type SummaryMode =
  | 'original'
  | 'compact'
  | 'super_short'
  | 'bullet'
  | 'audiobook';

export type SummaryDetailLevel = 'compact' | 'detailed' | 'bullet';

export type BulletScope = 'chapter' | 'entire_book';

export type PresetPersonalityId =
  | 'homelander'
  | 'taylor_swift'
  | 'deadpool'
  | 'gandalf';

export type AppPageRoute =
  | 'home'
  | 'catalog'
  | 'reader'
  | 'press'
  | 'voices';

/**
 * Explicit source & content availability states (Content Integrity V1.0.1)
 */
export type ContentAvailabilityStatus =
  | 'full_text'
  | 'full_text_available'
  | 'external_source_available'
  | 'condensed_edition'
  | 'user_uploaded'
  | 'preview'
  | 'metadata_only'
  | 'extraction_failed'
  | 'unsupported_format';

export type ChapterStructureType =
  | 'original_chapters'
  | 'editorial_sections'
  | 'unparsed';

/**
 * Explicit AI summary generation states (Section 2: AI Summarization Engine)
 */
export type SummaryGenerationStatus =
  | 'uncompressed'
  | 'not_summarized'
  | 'loading'
  | 'ai_generated'
  | 'cached'
  | 'curated_seed'
  | 'failed';

/**
 * Explicit Audiobook / TTS pipeline states (Section 3: Audiobook / TTS Engine)
 */
export type AudioEngineStatus =
  | 'idle'
  | 'loading'
  | 'generating'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'failed';

export interface TtsAudioChunk {
  index: number;
  text: string;
  hash?: string;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  audioBase64?: string;
  objectUrl?: string;
  mimeType?: string;
  retryCount?: number;
  attempts?: number;
  errorMessage?: string;
}

export interface SummaryFidelityMetadata {
  pipelineVersion: string;
  promptVersion: string;
  status: 'verified' | 'needs_review' | 'failed';
  sourceHash: string;
  evidenceCoverage: {
    plot: number;
    characters: number;
    worldBuilding: number;
    chronology: number;
    themes: number;
  };
  unsupportedClaims: number;
  omittedCriticalItems: string[];
  verificationModel?: string;
  verifiedAt?: string;
  reviewReasons?: string[];
}

export interface ChapterSummaryMetadata {
  status: SummaryGenerationStatus;
  source?: 'ai' | 'cache' | 'curated' | 'none';
  model?: string;
  contentHash?: string;
  detailLevel?: SummaryDetailLevel;
  chunkCount?: number;
  sourceParagraphCount?: number;
  sourceCharCount?: number;
  generatedAt?: string;
  errorMessage?: string;
}

export interface PersonalityProfile {
  id: PresetPersonalityId;
  name: string;
  roleTitle: string;
  tagline: string;
  authorStylePrompt: string;
  narratorStylePrompt: string;
  ttsVoiceName: 'Fenrir' | 'Kore' | 'Puck' | 'Charon' | 'Zephyr';
  speechPitch: number;
  speechRate: number;
  badgeColor: string;
  halftoneClass: string;
  accentHex: string;
  sampleQuote: string;
  avatarUrl?: string;
  preferredGenres?: string[];
}

export interface BookChapter {
  id: string;
  number: number;
  title: string;
  originalPages: number;
  compactPages: number;
  pageStart?: number;
  pageEnd?: number;
  originalText: string[];
  compactText: string[];
  detailedText?: string[];
  bulletPoints: string[];
  pageRangeLabel?: string;
  /**
   * True only for curated seed editions or after a verified AI summary succeeds.
   * Never set to true when AI summarization fails.
   */
  isCompressed?: boolean;
  summaryStatus?: SummaryGenerationStatus;
  summaryErrorMessage?: string;
  summaryMetadata?: ChapterSummaryMetadata;
  personaCompactCache?: Record<string, string[]>;
  personaDetailedCache?: Record<string, string[]>;
  personaBulletCache?: Record<string, string[]>;
}

export interface BookItem {
  id: string;
  gutenbergId?: number;
  title: string;
  author: string;
  year: string;
  genre: string;
  subgenres?: string[];
  mlTags?: string[];
  trendingScore?: number;
  isFeatured?: boolean;
  isPreCompressed?: boolean;
  sourceType: 'open_source' | 'uploaded' | 'gutendex' | 'google_books';
  fileFormat?: 'EPUB' | 'PDF' | 'TXT' | 'ARCHIVE' | 'GUTENDEX' | 'GOOGLE BOOKS';
  availabilityStatus?: ContentAvailabilityStatus;
  chapterStructure?: ChapterStructureType;
  verifiedChapterCount?: number;
  estimatedChapterCount?: number;
  sourceAttribution?: string;
  extractionWarning?: string;
  extractionError?: string;
  contentHash?: string;
  coverUrl?: string;
  coverColor: string;
  coverAccent: string;
  originalTotalPages: number;
  compactTotalPages: number;
  superShortPages: number;
  tagline: string;
  superShortExecutiveSummary: {
    thesis: string;
    executivePages: string[];
    coreTakeaways: string[];
  };
  masterBookBullets: string[];
  chapters: BookChapter[];
}

export interface ExternalCatalogBook {
  id: string;
  gutenbergId?: number;
  title: string;
  author: string;
  year: string;
  genre: string;
  subgenres?: string[];
  mlTags?: string[];
  trendingScore?: number;
  isFeatured?: boolean;
  chapterCount?: number;
  verifiedChapterCount?: number;
  estimatedChapterCount?: number;
  chapterStructure?: ChapterStructureType;
  chapterTitles?: string[];
  source?: 'gutendex' | 'google_books' | 'open_library';
  sourceApi?: 'gutendex' | 'google_books' | 'open_library';
  availabilityStatus?: ContentAvailabilityStatus;
  sourceAttribution?: string;
  coverUrl: string;
  description: string;
  previewText?: string[];
  textUrl?: string;
  pageCount?: number;
}

export interface BookReadingProgress {
  bookId: string;
  chapterIndex?: number;
  lastChapterIndex: number;
  mode?: SummaryMode;
  lastSummaryMode: SummaryMode;
  detailLevel?: SummaryDetailLevel;
  audioChunkIndex?: number;
  audioPlaybackSeconds?: number;
  completedChapterIds?: string[];
  updatedAt: string;
}

export interface UserTasteProfile {
  viewedBookIds: string[];
  compressedBookIds?: string[];
  completedBookIds?: string[];
  likedBookIds?: string[];
  dislikedBookIds?: string[];
  favoriteGenres: Record<string, number>;
  activePersona: PresetPersonalityId;
  searchHistory: string[];
}

export type RecommendationReasonType =
  | 'similar_themes'
  | 'shared_genre'
  | 'related_author'
  | 'reading_history'
  | 'cold_start_popular';

export interface RecommendationExplanation {
  type: RecommendationReasonType;
  label: string;
}

export interface ScoredBookRecommendation {
  book: ExternalCatalogBook | BookItem;
  cosineSimilarity?: number;
  similarityScore?: number;
  matchPercentage: number;
  matchReason: string;
  reasonType?: RecommendationReasonType;
  explanationReasons?: RecommendationExplanation[];
  isColdStart?: boolean;
}

export type ReadingTheme = 'paper' | 'sepia' | 'evening';

export interface ClubSettings {
  readingTheme?: ReadingTheme;
  authorPersonality: PresetPersonalityId;
  narratorPersonality: PresetPersonalityId;
  defaultSummaryMode?: SummaryMode;
  summaryDetailLevel?: SummaryDetailLevel;
  targetCompactRatio?: number;
  targetCompressionRatio?: number;
  customAuthorTrait: string;
  customNarratorTrait: string;
  useCustomAuthor?: boolean;
  useCustomNarrator?: boolean;
}
