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
  personaCompactCache?: Record<string, string[]>;
  personaBulletCache?: Record<string, string[]>;
}

export interface BookItem {
  id: string;
  title: string;
  author: string;
  year: string;
  genre: string;
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
  title: string;
  author: string;
  year: string;
  genre: string;
  source?: 'gutendex' | 'google_books';
  sourceApi?: 'gutendex' | 'google_books';
  coverUrl: string;
  description: string;
  textUrl?: string;
  pageCount?: number;
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
