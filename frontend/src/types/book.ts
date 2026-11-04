export type SummaryMode =
  | 'original'
  | 'compact'
  | 'super_short'
  | 'bullet'
  | 'audiobook';

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
  originalText: string[];
  compactText: string[];
  bulletPoints: string[];
  /**
   * True for pre-pressed Compact Catalog books or after the user compresses this chapter on demand.
   * False for newly added / discovered books until compressed chapter-by-chapter.
   */
  isCompressed?: boolean;
  personaCompactCache?: Record<string, string[]>;
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
  /**
   * True only for the initial signature Pre-Pressed Compact Catalog.
   * False for all newly discovered / catalog / uploaded books, which compress chapter-by-chapter on demand.
   */
  isPreCompressed?: boolean;
  sourceType: 'open_source' | 'uploaded' | 'gutendex' | 'google_books';
  fileFormat?: 'EPUB' | 'PDF' | 'TXT' | 'ARCHIVE' | 'GUTENDEX' | 'GOOGLE BOOKS';
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
  chapterTitles?: string[];
  source?: 'gutendex' | 'google_books' | 'open_library';
  sourceApi?: 'gutendex' | 'google_books' | 'open_library';
  coverUrl: string;
  description: string;
  textUrl?: string;
  pageCount?: number;
}

export interface UserTasteProfile {
  viewedBookIds: string[];
  compressedBookIds: string[];
  favoriteGenres: Record<string, number>;
  activePersona: PresetPersonalityId;
  searchHistory: string[];
}

export interface ScoredBookRecommendation {
  book: ExternalCatalogBook | BookItem;
  matchPercentage: number;
  matchReason: string;
}

export interface ClubSettings {
  authorPersonality: PresetPersonalityId;
  narratorPersonality: PresetPersonalityId;
  customAuthorTrait: string;
  customNarratorTrait: string;
  useCustomAuthor: boolean;
  useCustomNarrator: boolean;
  targetCompactRatio: number;
}
