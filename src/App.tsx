/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  BookItem,
  ClubSettings,
  PresetPersonalityId,
  SummaryMode,
} from './types/book';
import { OPEN_SOURCE_BOOKS } from './data/openSourceBooks';
import {
  PERSONALITY_PROFILES,
  buildBookFromExtractedText,
} from './utils/bookLogic';
import { extractTextFromUploadedFile } from './utils/fileExtractor';
import {
  CircularClubBadge,
  PersonaPortraitSvg,
  PocketCollageStrip,
} from './components/TactileArt';
import { ReaderWorkspace } from './components/ReaderModal';
import {
  Upload,
  BookOpen,
  Headphones,
  Sparkles,
  Check,
  FileUp,
  ChevronDown,
  UserCheck,
  Mic,
  PenTool,
  Layers,
} from 'lucide-react';

type PocketTab = 'library' | 'upload' | 'settings';

export default function App() {
  const [books, setBooks] = useState<BookItem[]>(OPEN_SOURCE_BOOKS);
  const [selectedBookId, setSelectedBookId] = useState<string>(
    OPEN_SOURCE_BOOKS[0].id
  );
  const [activeMode, setActiveMode] = useState<SummaryMode>('compact');
  const [activePocketTab, setActivePocketTab] = useState<PocketTab>('library');

  const [settings, setSettings] = useState<ClubSettings>({
    authorPersonality: 'taylor_swift',
    narratorPersonality: 'gandalf',
    customAuthorTrait: '',
    customNarratorTrait: '',
    useCustomAuthor: false,
    useCustomNarrator: false,
    targetCompactRatio: 0.175,
  });

  // Upload state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [uploadRawText, setUploadRawText] = useState('');
  const [uploadFormat, setUploadFormat] = useState<'EPUB' | 'PDF' | 'TXT'>('EPUB');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const readerSectionRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeBook =
    books.find((b) => b.id === selectedBookId) || books[0];

  const activeAuthorProfile = PERSONALITY_PROFILES[settings.authorPersonality];
  const activeNarratorProfile =
    PERSONALITY_PROFILES[settings.narratorPersonality];

  function handleUpdateSettings(partial: Partial<ClubSettings>) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  function handleUpdateBookChapter(
    bookId: string,
    chapterId: string,
    personaKey: string,
    compactText: string[],
    bulletPoints: string[]
  ) {
    setBooks((prevBooks) =>
      prevBooks.map((b) => {
        if (b.id !== bookId) return b;
        return {
          ...b,
          chapters: b.chapters.map((ch) => {
            if (ch.id !== chapterId) return ch;
            return {
              ...ch,
              personaCompactCache: {
                ...(ch.personaCompactCache || {}),
                [personaKey]: compactText,
              },
              personaBulletCache: {
                ...(ch.personaBulletCache || {}),
                [personaKey]: bulletPoints,
              },
            };
          }),
        };
      })
    );
  }

  function scrollToReader() {
    readerSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setIsProcessingUpload(true);
    setUploadedFileName(file.name);

    try {
      const { text, detectedFormat } = await extractTextFromUploadedFile(file);
      setUploadFormat(detectedFormat);
      setUploadRawText(text);
      if (!uploadTitle.trim()) {
        setUploadTitle(
          file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
        );
      }
      if (!uploadAuthor.trim()) {
        setUploadAuthor('Uploaded Edition');
      }
    } catch {
      setUploadError(
        'Could not parse file stream. Please try another EPUB, PDF, or TXT file.'
      );
    } finally {
      setIsProcessingUpload(false);
    }
  }

  async function handleCreateUploadedBook(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadTitle.trim()) {
      setUploadError('Please enter a book title before generating.');
      return;
    }
    if (!uploadRawText.trim() || uploadRawText.trim().length < 60) {
      setUploadError(
        'Please upload an EPUB/PDF/TXT file or paste at least a paragraph of book text.'
      );
      return;
    }

    setUploadError(null);
    setIsProcessingUpload(true);

    const newBook = buildBookFromExtractedText(
      uploadTitle.trim(),
      uploadAuthor.trim() || 'Independent Author',
      uploadRawText,
      uploadFormat,
      settings.authorPersonality
    );

    // Attempt live Gemini 3.8 Flash chapter summarization for Chapter 1
    try {
      const firstChapter = newBook.chapters[0];
      if (firstChapter) {
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookTitle: newBook.title,
            chapterTitle: firstChapter.title,
            originalText: firstChapter.originalText,
            originalPages: firstChapter.originalPages,
            targetCompactPages: firstChapter.compactPages,
            authorPersonaName:
              settings.useCustomAuthor && settings.customAuthorTrait.trim()
                ? settings.customAuthorTrait.trim()
                : activeAuthorProfile.name,
            authorStylePrompt:
              settings.useCustomAuthor && settings.customAuthorTrait.trim()
                ? settings.customAuthorTrait.trim()
                : activeAuthorProfile.authorStylePrompt,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.compactText) && data.compactText.length > 0) {
            firstChapter.compactText = data.compactText;
          }
          if (
            Array.isArray(data.bulletPoints) &&
            data.bulletPoints.length > 0
          ) {
            firstChapter.bulletPoints = data.bulletPoints;
          }
        }
      }
    } catch {
      // Deterministic chapter-wise compact edition already built
    }

    setBooks((prev) => [newBook, ...prev]);
    setSelectedBookId(newBook.id);
    setActiveMode('compact');
    setIsProcessingUpload(false);
    setUploadTitle('');
    setUploadAuthor('');
    setUploadRawText('');
    setUploadedFileName(null);
    scrollToReader();
  }

  function handleLoadSampleEpubText() {
    setUploadTitle('The Time Machine (1895 EPUB Import)');
    setUploadAuthor('H. G. Wells');
    setUploadFormat('EPUB');
    setUploadedFileName('the-time-machine-wells.epub');
    setUploadError(null);
    setUploadRawText(`Chapter 1: The Time Traveller’s Fourth Dimension
The Time Traveller was expounding a recondite matter to us in his smoking-room. His grey eyes shone and twinkled, and his usually pale face was flushed and animated. He explained that just as a mathematical plane has two dimensions and a solid cube has three, no real body can exist without extending along a Fourth Dimension: Duration across Time.

To prove that human beings can travel forward and backward along the Fourth Dimension just as they move up and down in space, he placed a glittering miniature brass-and-ivory mechanism upon the table and invited the Psychologist to press the lever—sending the model vanishing into the future before our eyes.

Chapter 2: The Year 802,701 & The Eloi
Seated in the full-scale laboratory Time Machine, I pressed the starting lever and watched days and nights flicker like the wings of a black-and-white moth until the sun became a band of fire and the buildings of London melted into rising and falling hills. Braking in the year 802,701 beside a colossal white marble Sphinx, I met the frail, childlike Eloi—four-foot-tall vegetarians living in decaying palaces without work, struggle, or fear.

Yet when my Time Machine vanished inside the bronze pedestal of the White Sphinx, I noticed deep circular dry wells dotting the landscape, each echoing with the metallic thudding of subterranean engines.

Chapter 3: The Subterranean Morlocks & The Dying Sun
Climbing down a ventilation shaft into the pitch-black underworld, I discovered the evolutionary split of humanity: the surface-dwelling Eloi were the descendants of the idle aristocracy, while the nocturnal, ape-like Morlocks tending the underground machines were the descendants of industrial laborers—who now bred and harvested the Eloi like cattle.

After recovering my Time Machine from the bronze doors of the Sphinx and escaping the Morlocks, I traveled thirty million years further into the future, standing on a frozen crimson beach beneath an eclipsed, dying red giant sun before returning to Victorian London to tell my tale.`);
  }

  return (
    <div className="min-h-screen bg-jacket-orange text-[#111] flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#111] text-white border-b-[3px] border-[#111] sticky top-0 z-40">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          className="font-display-brutal text-lg tracking-tight text-[#F6C90E] whitespace-nowrap shrink-0"
        >
          THE READERS CLUB
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-bold text-neutral-200"
        >
          <button
            type="button"
            onClick={() => setActivePocketTab('library')}
            className="hover:text-[#F6C90E] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open Library
          </button>
          <button
            type="button"
            onClick={() => setActivePocketTab('upload')}
            className="hover:text-[#F6C90E] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Upload EPUB/PDF
          </button>
          <button
            type="button"
            onClick={() => setActivePocketTab('settings')}
            className="hover:text-[#F6C90E] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Persona Studio
          </button>
          <button
            type="button"
            onClick={scrollToReader}
            className="hover:text-[#F6C90E] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reader Deck
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setActivePocketTab('upload')}
            className="px-4 py-2 text-xs font-display-brutal uppercase bg-[#F6C90E] text-[#111] border-2 border-white hover:bg-[#FFE047] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Upload Book
          </button>
        </div>
      </header>

      {/* MAIN TACTILE JACKET WORKSPACE (DIRECTLY INSPIRED BY REFERENCE IMAGE) */}
      <main id="top" className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start relative">
          {/* LEFT JACKET PANEL (5 COLS): METAL SIGN PLATE + POP-ART ENAMEL BADGES + QUICK STATS */}
          <div className="lg:col-span-5 flex flex-col gap-6 pt-2">
            <div className="relative">
              {/* Top-Right Overlapping Hippo Enamel Badge (Matching Reference Image) */}
              <div className="hidden sm:block absolute -top-8 -right-4 z-20">
                <CircularClubBadge
                  topText="THIS IS NOT A 2-PAGE TL;DR"
                  bottomText="IT'S A 30-40P EDITION"
                  bgColor="#0047FF"
                  iconType="hippo_reader"
                  onClick={() => {
                    setActiveMode('compact');
                    scrollToReader();
                  }}
                />
              </div>

              {/* Riveted Brushed Metal Sign Plate */}
              <div className="bg-metal-plate border-[3px] border-[#111] rounded-xl p-6 sm:p-8 shadow-brutal-lg relative">
                {/* 4 Corner Rivets */}
                <span
                  aria-hidden="true"
                  className="w-3 h-3 rounded-full bg-neutral-300 border-2 border-[#444] absolute top-3 left-3"
                />
                <span
                  aria-hidden="true"
                  className="w-3 h-3 rounded-full bg-neutral-300 border-2 border-[#444] absolute top-3 right-3"
                />
                <span
                  aria-hidden="true"
                  className="w-3 h-3 rounded-full bg-neutral-300 border-2 border-[#444] absolute bottom-3 left-3"
                />
                <span
                  aria-hidden="true"
                  className="w-3 h-3 rounded-full bg-neutral-300 border-2 border-[#444] absolute bottom-3 right-3"
                />

                <div className="text-sm font-bold text-[#666] tracking-wide mb-2">
                  est. 2026 · open source & epub/pdf club
                </div>

                <h1 className="font-display-brutal text-3xl sm:text-5xl leading-[1.03] uppercase tracking-tight text-[#111] text-balance">
                  THE READERS
                  <br />
                  CLUB FOR
                  <br />
                  <span className="text-[#EB5600]">COMPACT</span>
                  <br />
                  EDITIONS
                </h1>

                <p className="mt-4 text-sm sm:text-base font-semibold text-[#222] leading-relaxed max-w-md">
                  200-page books condensed into{' '}
                  <strong className="underline decoration-[#EB5600] decoration-2">
                    30–40 pages in the exact same chapter-wise structure
                  </strong>
                  —never a shallow 2-page blurb. Plus Original, Super Short
                  (2–4p), Bullet, and Compact Audiobook modes.
                </p>

                {/* Primary Quick Mode Pill-Free Action Bar */}
                <div className="mt-5 pt-4 border-t-2 border-neutral-300 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode('compact');
                      scrollToReader();
                    }}
                    className="px-4 py-2 bg-[#111] text-[#F6C90E] font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm hover:bg-[#222] cursor-pointer whitespace-nowrap"
                  >
                    Read 30-40p Compact ★
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode('audiobook');
                      scrollToReader();
                    }}
                    className="px-4 py-2 bg-[#E50914] text-white font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm hover:bg-[#B8000A] cursor-pointer whitespace-nowrap"
                  >
                    Play Compact Audio
                  </button>
                </div>
              </div>

              {/* Bottom Enamel Club Badges Row (Matching Bird & Bee Badges in Reference Image) */}
              <div className="mt-5 flex items-center justify-start gap-5 pl-2">
                <CircularClubBadge
                  topText="READ LIKE YOU GIVE A DAMN"
                  bottomText="CHAPTER BY CHAPTER"
                  bgColor="#F6C90E"
                  iconType="bird_scribe"
                  onClick={() => {
                    setActiveMode('bullet');
                    scrollToReader();
                  }}
                />
                <CircularClubBadge
                  topText="TRUST ME · I TESTED IT!"
                  bottomText="4 ICONIC PERSONAS"
                  bgColor="#E50914"
                  iconType="bee_tester"
                  onClick={() => setActivePocketTab('settings')}
                />
              </div>
            </div>

            {/* Active Book Compression Snapshot Card on Left Jacket */}
            <div className="bg-white border-[3px] border-[#111] p-4 shadow-brutal">
              <div className="flex items-center justify-between text-xs font-mono-tech font-bold text-[#555] pb-2 border-b-2 border-[#111]">
                <span>NOW ON THE TURNTABLE</span>
                <span>5 SUMMARY MODES READY</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display-brutal text-lg uppercase text-[#111]">
                    {activeBook.title}
                  </h2>
                  <p className="text-xs font-medium text-[#444]">
                    {activeBook.author} · {activeBook.originalTotalPages}p Original →{' '}
                    <strong className="text-[#E50914]">
                      {activeBook.compactTotalPages}p Compact Edition
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={scrollToReader}
                  className="px-3 py-2 bg-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase shadow-brutal-sm cursor-pointer shrink-0"
                >
                  Open Reader ↓
                </button>
              </div>
            </div>
          </div>

          {/* CENTER ZIPPER DIVIDER COLUMN (1 COL ON DESKTOP, MATCHING REFERENCE IMAGE) */}
          <div className="hidden lg:flex lg:col-span-1 flex-col items-center self-stretch relative py-2 select-none">
            {/* Zipper Pull Slider at Top */}
            <button
              type="button"
              onClick={scrollToReader}
              aria-label="Scroll to Reader Studio"
              className="z-20 flex flex-col items-center group cursor-pointer focus:outline-none"
            >
              {/* Yellow Zipper Crown */}
              <div className="w-8 h-9 bg-[#F6C90E] border-[3px] border-[#111] rounded-t-md flex items-center justify-center">
                <div className="w-2.5 h-4 bg-[#EB5600] border-2 border-[#111]" />
              </div>
              {/* Dark Navy Metallic Pull Tab ("scroll") */}
              <div className="w-16 h-12 bg-[#0B192C] text-white border-[3px] border-[#111] rounded-md shadow-brutal flex flex-col items-center justify-center group-hover:translate-y-1 transition-transform">
                <ChevronDown className="w-4 h-4 text-[#F6C90E] -mb-0.5" />
                <span className="font-bold text-xs tracking-tight">scroll</span>
              </div>
            </button>

            {/* Interlocking Black & Orange Zipper Teeth Track */}
            <div
              aria-hidden="true"
              className="w-7 flex-1 bg-[#111] border-x-[3px] border-[#111] -mt-1 relative overflow-hidden"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(180deg, #111111 0px, #111111 6px, #EB5600 6px, #EB5600 12px)',
              }}
            >
              <div className="w-1.5 h-full mx-auto bg-[#111]/60" />
            </div>
          </div>

          {/* RIGHT JACKET POCKET + FOLDER TABS + HANGING LANYARD ID CARD (6 COLS) */}
          <div className="lg:col-span-6 flex flex-col pt-2 relative">
            {/* THREE FOLDER TABS STICKING OUT OF POCKET TOP (YELLOW, BLUE, RED) */}
            <div
              role="tablist"
              aria-label="Club Pocket Folders"
              className="grid grid-cols-3 gap-1.5 px-2 items-end"
            >
              {/* Tab 1: Yellow (LIBRARY) */}
              <button
                type="button"
                role="tab"
                aria-selected={activePocketTab === 'library'}
                onClick={() => setActivePocketTab('library')}
                className={`border-t-[3px] border-x-[3px] border-[#111] rounded-t-2xl px-3 transition-all cursor-pointer flex flex-col items-center justify-center ${
                  activePocketTab === 'library'
                    ? 'h-16 bg-[#F5B800] text-[#111] shadow-brutal-sm z-10'
                    : 'h-13 bg-[#E0A800] text-[#111] hover:h-15'
                }`}
              >
                <span className="font-display-brutal text-xs sm:text-sm uppercase tracking-tight whitespace-nowrap">
                  LIBRARY
                </span>
                <span className="font-mono-tech text-[10px] font-bold">
                  {books.length} VOLUMES
                </span>
              </button>

              {/* Tab 2: Cobalt Blue (UPLOAD EPUB/PDF) */}
              <button
                type="button"
                role="tab"
                aria-selected={activePocketTab === 'upload'}
                onClick={() => setActivePocketTab('upload')}
                className={`border-t-[3px] border-x-[3px] border-[#111] rounded-t-2xl px-3 transition-all cursor-pointer flex flex-col items-center justify-center ${
                  activePocketTab === 'upload'
                    ? 'h-16 bg-[#0047FF] text-white shadow-brutal-sm z-10'
                    : 'h-13 bg-[#0039CC] text-white hover:h-15'
                }`}
              >
                <span className="font-display-brutal text-xs sm:text-sm uppercase tracking-tight whitespace-nowrap">
                  UPLOAD
                </span>
                <span className="font-mono-tech text-[10px] font-bold text-[#F6C90E]">
                  EPUB / PDF
                </span>
              </button>

              {/* Tab 3: Bright Red (PERSONAS / SETTINGS) */}
              <button
                type="button"
                role="tab"
                aria-selected={activePocketTab === 'settings'}
                onClick={() => setActivePocketTab('settings')}
                className={`border-t-[3px] border-x-[3px] border-[#111] rounded-t-2xl px-3 transition-all cursor-pointer flex flex-col items-center justify-center ${
                  activePocketTab === 'settings'
                    ? 'h-16 bg-[#FF1E1E] text-white shadow-brutal-sm z-10'
                    : 'h-13 bg-[#D91616] text-white hover:h-15'
                }`}
              >
                <span className="font-display-brutal text-xs sm:text-sm uppercase tracking-tight whitespace-nowrap">
                  PERSONAS
                </span>
                <span className="font-mono-tech text-[10px] font-bold text-white/90">
                  4 PRESETS + AI
                </span>
              </button>
            </div>

            {/* Illustrated Pop-Art Collage Strip inside Pocket Mouth */}
            <PocketCollageStrip />

            {/* RED CORDUROY POCKET BODY */}
            <div className="bg-pocket-red border-[3px] border-[#111] shadow-brutal-lg p-4 sm:p-5 relative">
              {/* Stitched Inner Seam Line */}
              <div className="border-2 border-dashed border-[#111]/60 p-3 sm:p-4 bg-white/95">
                {/* POCKET TAB 1: FREE & OPEN SOURCE BOOK LIBRARY */}
                {activePocketTab === 'library' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#111] pb-2">
                      <div>
                        <h2 className="font-display-brutal text-base uppercase text-[#111]">
                          OPEN-SOURCE & UPLOADED CLUB SHELF
                        </h2>
                        <p className="text-xs text-[#444]">
                          Pick any volume to read in 1. Original, 2. Compact
                          (30–40p), 3. Super Short, 4. Bullet, or 5. Compact
                          Audiobook.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[265px] overflow-y-auto pr-1">
                      {books.map((b) => {
                        const isSelected = b.id === selectedBookId;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              setSelectedBookId(b.id);
                            }}
                            className={`text-left p-2.5 border-2 border-[#111] transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'bg-[#F6C90E] shadow-brutal-sm -translate-y-0.5'
                                : 'bg-white hover:bg-neutral-100'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1 text-[10px] font-mono-tech font-bold uppercase">
                                <span
                                  className="px-1.5 py-0.5 text-white border border-[#111]"
                                  style={{ backgroundColor: b.coverColor }}
                                >
                                  {b.fileFormat || 'OPEN SOURCE'}
                                </span>
                                <span>
                                  {b.originalTotalPages}p → {b.compactTotalPages}p
                                </span>
                              </div>
                              <div className="font-display-brutal text-sm uppercase mt-1 text-[#111] line-clamp-1">
                                {b.title}
                              </div>
                              <div className="text-xs font-semibold text-[#333]">
                                {b.author} · {b.chapters.length} Chapters
                              </div>
                            </div>

                            <div className="mt-1.5 pt-1 border-t border-[#111]/20 flex items-center justify-between text-[11px] font-mono-tech font-bold">
                              <span>
                                {isSelected ? '✓ ACTIVE IN READER' : 'SELECT BOOK'}
                              </span>
                              <span className="underline">Read →</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* POCKET TAB 2: UPLOAD EPUB / PDF / TXT */}
                {activePocketTab === 'upload' && (
                  <form onSubmit={handleCreateUploadedBook} className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#111] pb-2">
                      <div>
                        <h2 className="font-display-brutal text-base uppercase text-[#111]">
                          UPLOAD EPUB / PDF TO 30–40P COMPACT EDITION
                        </h2>
                        <p className="text-xs text-[#444]">
                          Preserves chapter-by-chapter structure proportionally
                          instead of flattening into a 2-page summary.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleLoadSampleEpubText}
                        className="px-2.5 py-1 bg-[#F6C90E] border-2 border-[#111] font-mono-tech text-xs font-bold cursor-pointer hover:bg-[#FFE047]"
                      >
                        Load Sample EPUB
                      </button>
                    </div>

                    {/* File Drop / Picker Button */}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".epub,.pdf,.txt,.md"
                        onChange={handleFileChange}
                        className="hidden"
                        id="book-file-upload"
                      />
                      <label
                        htmlFor="book-file-upload"
                        className="px-3.5 py-1.5 bg-[#0047FF] text-white border-2 border-[#111] shadow-brutal-sm font-display-brutal text-xs uppercase flex items-center gap-2 cursor-pointer hover:bg-[#0039CC]"
                      >
                        <FileUp className="w-4 h-4" />
                        <span>Choose .EPUB / .PDF / .TXT File</span>
                      </label>
                      {uploadedFileName && (
                        <span className="font-mono-tech text-xs font-bold text-[#059669]">
                          Loaded: {uploadedFileName} ({uploadFormat})
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label
                          htmlFor="upload-book-title"
                          className="block font-mono-tech text-xs font-bold uppercase mb-1"
                        >
                          Book Title *
                        </label>
                        <input
                          id="upload-book-title"
                          type="text"
                          value={uploadTitle}
                          onChange={(e) => setUploadTitle(e.target.value)}
                          placeholder="e.g., The Time Machine"
                          className="w-full px-3 py-1.5 bg-white border-2 border-[#111] text-sm font-medium focus:outline-none focus:bg-[#F6C90E]/15"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="upload-book-author"
                          className="block font-mono-tech text-xs font-bold uppercase mb-1"
                        >
                          Original Author
                        </label>
                        <input
                          id="upload-book-author"
                          type="text"
                          value={uploadAuthor}
                          onChange={(e) => setUploadAuthor(e.target.value)}
                          placeholder="e.g., H. G. Wells"
                          className="w-full px-3 py-1.5 bg-white border-2 border-[#111] text-sm font-medium focus:outline-none focus:bg-[#F6C90E]/15"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="upload-book-manuscript"
                        className="block font-mono-tech text-xs font-bold uppercase mb-1"
                      >
                        Extracted Manuscript / Chapters (Auto-filled from EPUB/PDF or Paste) *
                      </label>
                      <textarea
                        id="upload-book-manuscript"
                        rows={3}
                        value={uploadRawText}
                        onChange={(e) => setUploadRawText(e.target.value)}
                        placeholder="Upload an .epub or .pdf file above, click 'Load Sample EPUB', or paste chapters here..."
                        className="w-full p-2 bg-white border-2 border-[#111] text-xs font-mono-tech focus:outline-none"
                      />
                    </div>

                    {uploadError && (
                      <div
                        role="alert"
                        className="p-2 bg-[#E50914] text-white font-mono-tech text-xs font-bold border-2 border-[#111]"
                      >
                        {uploadError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isProcessingUpload}
                      className="w-full py-2 bg-[#111] text-[#F6C90E] hover:bg-[#222] font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm cursor-pointer disabled:opacity-50"
                    >
                      {isProcessingUpload
                        ? 'Building Proportional 30–40p Chapterwise Edition...'
                        : 'Generate 30–40p Compact Edition + All 5 Formats →'}
                    </button>
                  </form>
                )}

                {/* POCKET TAB 3: SETTINGS — AUTHOR & NARRATOR PERSONALITIES */}
                {activePocketTab === 'settings' && (
                  <div className="space-y-3">
                    <div className="border-b-2 border-[#111] pb-1.5">
                      <h2 className="font-display-brutal text-base uppercase text-[#111]">
                        AUTHOR & NARRATOR PERSONALITY STUDIO
                      </h2>
                      <p className="text-xs text-[#444]">
                        Assign any of the 4 preset personalities (or a custom
                        persona like &ldquo;Sarcastic teacher&rdquo; or &ldquo;Calm
                        narrator&rdquo;) independently to your{' '}
                        <strong>Author</strong> and <strong>Narrator</strong>.
                      </p>
                    </div>

                    {/* 1. AUTHOR PERSONALITY SELECTOR */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-display-brutal text-xs uppercase flex items-center gap-1.5">
                          <PenTool className="w-3.5 h-3.5 text-[#E50914]" />
                          <span>1. Author Personality (Text Summarizer)</span>
                        </span>
                        <span className="font-mono-tech text-[11px] font-bold text-[#0047FF]">
                          Active:{' '}
                          {settings.useCustomAuthor && settings.customAuthorTrait
                            ? settings.customAuthorTrait
                            : activeAuthorProfile.name}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(
                          [
                            'homelander',
                            'taylor_swift',
                            'deadpool',
                            'gandalf',
                          ] as PresetPersonalityId[]
                        ).map((pid, idx) => {
                          const p = PERSONALITY_PROFILES[pid];
                          const isSelected =
                            !settings.useCustomAuthor &&
                            settings.authorPersonality === pid;
                          return (
                            <button
                              key={pid}
                              type="button"
                              aria-label={`Set Author personality to ${p.name}`}
                              onClick={() =>
                                handleUpdateSettings({
                                  authorPersonality: pid,
                                  useCustomAuthor: false,
                                })
                              }
                              className={`p-2 border-2 border-[#111] text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-[#F6C90E] shadow-brutal-sm -translate-y-0.5'
                                  : 'bg-white hover:bg-neutral-100'
                              }`}
                            >
                              <div className="font-mono-tech text-[10px] font-bold">
                                0{idx + 1}. AUTHOR
                              </div>
                              <div className="font-display-brutal text-xs uppercase truncate">
                                {p.name}
                              </div>
                              <div className="text-[10px] text-[#333] line-clamp-1">
                                {p.roleTitle}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Author Personality Input (e.g., Sarcastic teacher) */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          aria-label="Custom Author Personality"
                          value={settings.customAuthorTrait}
                          onChange={(e) =>
                            handleUpdateSettings({
                              customAuthorTrait: e.target.value,
                              useCustomAuthor: e.target.value.trim().length > 0,
                            })
                          }
                          placeholder="Or type custom Author style (e.g. Sarcastic teacher, Detective noir)..."
                          className="flex-1 px-2.5 py-1 bg-white border-2 border-[#111] text-xs font-medium"
                        />
                      </div>
                    </div>

                    {/* 2. NARRATOR PERSONALITY SELECTOR */}
                    <div className="space-y-1.5 pt-2 border-t-2 border-[#111]/20">
                      <div className="flex items-center justify-between">
                        <span className="font-display-brutal text-xs uppercase flex items-center gap-1.5">
                          <Mic className="w-3.5 h-3.5 text-[#0047FF]" />
                          <span>2. Narrator Personality (Compact Audio)</span>
                        </span>
                        <span className="font-mono-tech text-[11px] font-bold text-[#E50914]">
                          Active:{' '}
                          {settings.useCustomNarrator &&
                          settings.customNarratorTrait
                            ? settings.customNarratorTrait
                            : activeNarratorProfile.name}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(
                          [
                            'homelander',
                            'taylor_swift',
                            'deadpool',
                            'gandalf',
                          ] as PresetPersonalityId[]
                        ).map((pid, idx) => {
                          const p = PERSONALITY_PROFILES[pid];
                          const isSelected =
                            !settings.useCustomNarrator &&
                            settings.narratorPersonality === pid;
                          return (
                            <button
                              key={pid}
                              type="button"
                              aria-label={`Set Narrator personality to ${p.name}`}
                              onClick={() =>
                                handleUpdateSettings({
                                  narratorPersonality: pid,
                                  useCustomNarrator: false,
                                })
                              }
                              className={`p-2 border-2 border-[#111] text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-[#0047FF] text-white shadow-brutal-sm -translate-y-0.5'
                                  : 'bg-white text-[#111] hover:bg-neutral-100'
                              }`}
                            >
                              <div className="font-mono-tech text-[10px] font-bold opacity-80">
                                0{idx + 1}. NARRATOR
                              </div>
                              <div className="font-display-brutal text-xs uppercase truncate">
                                {p.name}
                              </div>
                              <div className="text-[10px] opacity-90 line-clamp-1">
                                Voice: {p.ttsVoiceName}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Narrator Personality Input (e.g., Calm narrator style) */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          aria-label="Custom Narrator Personality"
                          value={settings.customNarratorTrait}
                          onChange={(e) =>
                            handleUpdateSettings({
                              customNarratorTrait: e.target.value,
                              useCustomNarrator: e.target.value.trim().length > 0,
                            })
                          }
                          placeholder="Or type custom Narrator style (e.g. Calm bedtime narrator, Late-night radio host)..."
                          className="flex-1 px-2.5 py-1 bg-white border-2 border-[#111] text-xs font-medium"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* HANGING YELLOW LANYARD ID CARD (MATCHING "LEILA" BADGE IN REFERENCE IMAGE) */}
              <div className="mt-3.5 flex flex-col sm:flex-row items-center gap-4 bg-badge-yellow border-[3px] border-[#111] rounded-2xl p-3.5 shadow-brutal-lg relative">
                {/* Halftone Pop-Art Portrait Frame with Badge Slot */}
                <div className="flex flex-col items-center shrink-0">
                  <div
                    aria-hidden="true"
                    className="w-8 h-2 bg-[#B8860B] border border-[#111] rounded-full mb-1.5"
                  />
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-[3px] border-[#111] overflow-hidden shadow-brutal-sm bg-[#FF1493]">
                    <PersonaPortraitSvg personaId={settings.authorPersonality} />
                  </div>
                </div>

                {/* Torn-Paper Style Persona Name Strips & Quick Switcher */}
                <div className="flex-1 min-w-0 w-full">
                  <div className="bg-white border-2 border-[#111] px-3 py-1 text-center sm:text-left shadow-brutal-sm flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono-tech text-[10px] font-bold uppercase text-[#555]">
                        ACTIVE CLUB ID BADGE · AUTHOR / NARRATOR
                      </div>
                      <div className="font-display-brutal text-base sm:text-lg uppercase text-[#111] truncate">
                        Author:{' '}
                        {settings.useCustomAuthor && settings.customAuthorTrait
                          ? settings.customAuthorTrait
                          : activeAuthorProfile.name}{' '}
                        · Audio:{' '}
                        {settings.useCustomNarrator && settings.customNarratorTrait
                          ? settings.customNarratorTrait
                          : activeNarratorProfile.name}
                      </div>
                    </div>
                  </div>

                  <div className="mt-1.5 bg-white border-2 border-[#111] px-3 py-1 text-xs font-semibold text-[#222] truncate">
                    {activeAuthorProfile.sampleQuote}
                  </div>

                  {/* 4 Preset Personality Buttons in a Single Clean 4-Column Row */}
                  <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'homelander', label: '1. Homelander' },
                        { id: 'taylor_swift', label: '2. Taylor Swift' },
                        { id: 'deadpool', label: '3. Deadpool' },
                        { id: 'gandalf', label: '4. Gandalf' },
                      ] as { id: PresetPersonalityId; label: string }[]
                    ).map((item) => {
                      const isCurrent =
                        !settings.useCustomAuthor &&
                        settings.authorPersonality === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            handleUpdateSettings({
                              authorPersonality: item.id,
                              narratorPersonality: item.id,
                              useCustomAuthor: false,
                              useCustomNarrator: false,
                            })
                          }
                          className={`px-2 py-1.5 rounded-md border-2 border-[#111] font-mono-tech text-[11px] font-bold transition-transform cursor-pointer truncate whitespace-nowrap text-center ${
                            isCurrent
                              ? 'bg-[#111] text-[#F6C90E] -translate-y-0.5'
                              : 'bg-white text-[#111] hover:bg-[#111] hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FULL CHAPTER-WISE READER & COMPACT AUDIOBOOK WORKSPACE BELOW THE FOLD */}
        <div ref={readerSectionRef} className="mt-10">
          <ReaderWorkspace
            book={activeBook}
            activeMode={activeMode}
            onSelectMode={setActiveMode}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onUpdateBookChapter={handleUpdateBookChapter}
            onOpenSettingsTab={() => {
              setActivePocketTab('settings');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      </main>

      {/* QUIET EDITORIAL FOOTER */}
      <footer className="mt-12 bg-[#111] text-neutral-300 border-t-[3px] border-[#111] px-6 py-4">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
          <span className="font-display-brutal text-[#F6C90E] tracking-tight">
            THE READERS CLUB · PROPORTIONAL 30–40 PAGE CHAPTERWISE EDITIONS
          </span>
          <div className="flex items-center gap-3 font-mono-tech">
            <span>1. Original</span>
            <span aria-hidden="true">·</span>
            <span>2. Compact (30-40p)</span>
            <span aria-hidden="true">·</span>
            <span>3. Super Short (2-4p)</span>
            <span aria-hidden="true">·</span>
            <span>4. Bullet</span>
            <span aria-hidden="true">·</span>
            <span>5. Compact Audiobook</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
