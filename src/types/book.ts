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
  /** Optional cached AI-rewritten compact paragraphs keyed by persona id */
  personaCompactCache?: Record<string, string[]>;
  /** Optional cached AI-rewritten bullet points keyed by persona id */
  personaBulletCache?: Record<string, string[]>;
}

export interface BookItem {
  id: string;
  title: string;
  author: string;
  year: string;
  genre: string;
  sourceType: 'open_source' | 'uploaded';
  fileFormat?: 'EPUB' | 'PDF' | 'TXT' | 'GUTENBERG';
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

export interface ClubSettings {
  authorPersonality: PresetPersonalityId;
  narratorPersonality: PresetPersonalityId;
  customAuthorTrait: string;
  customNarratorTrait: string;
  useCustomAuthor: boolean;
  useCustomNarrator: boolean;
  targetCompactRatio: number; // default ~0.18 (e.g., 200p -> 36p)
}
