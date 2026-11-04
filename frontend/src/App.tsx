/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  BookItem,
  ClubSettings,
  ExternalCatalogBook,
  PresetPersonalityId,
  SummaryMode,
} from './types/book';
import { OPEN_SOURCE_BOOKS } from './data/openSourceBooks';
import {
  PERSONALITY_PROFILES,
  buildBookFromExternalCatalogItem,
  buildBookFromExtractedText,
} from './utils/bookLogic';
import { extractTextFromUploadedFile } from './utils/fileExtractor';
import {
  BookPosterCover,
  CircularClubBadge,
  PersonaPortraitSvg,
  PocketCollageStrip,
} from './components/TactileArt';
import { ReaderWorkspace } from './components/ReaderModal';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';
import {
  FileUp,
  ChevronDown,
  Mic,
  PenTool,
  Search,
  Globe,
  Loader2,
  BookMarked,
} from 'lucide-react';

type PocketTab = 'library' | 'upload' | 'settings';

const CATALOG_CATEGORIES = [
  { id: 'curated', label: 'Club Archive', query: '' },
  { id: 'classics', label: 'Gutendex Classics', query: 'classic literature' },
  { id: 'philosophy', label: 'Philosophy', query: 'philosophy stoicism plato' },
  { id: 'scifi', label: 'Sci-Fi & Mystery', query: 'science fiction mystery verne' },
  { id: 'history', label: 'History & Strategy', query: 'history civilization biography' },
];

export default function App() {
  const [books, setBooks] = useState<BookItem[]>(OPEN_SOURCE_BOOKS);
  const [selectedBookId, setSelectedBookId] = useState<string>(
    OPEN_SOURCE_BOOKS[0].id
  );
  const [activeMode, setActiveMode] = useState<SummaryMode>('compact');
  const [activePocketTab, setActivePocketTab] = useState<PocketTab>('library');

  // External Catalog Discovery State (Gutendex + Google Books API)
  const [catalogCategory, setCatalogCategory] = useState<string>('curated');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [discoveredBooks, setDiscoveredBooks] = useState<ExternalCatalogBook[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState<boolean>(false);

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

  async function fetchExternalCatalog(queryText: string) {
    if (!queryText.trim()) {
      setDiscoveredBooks([]);
      return;
    }
    setIsSearchingCatalog(true);
    try {
      const resp = await fetch(
        `/api/books/discover?q=${encodeURIComponent(queryText.trim())}`
      );
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.books) && data.books.length > 0) {
          setDiscoveredBooks(data.books);
          setIsSearchingCatalog(false);
          return;
        }
      }
    } catch {
      // Fallback to direct client-side Google Books / Gutendex fetch if needed
    }

    try {
      const gbRes = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
          queryText.trim()
        )}&maxResults=10&printType=books`
      );
      if (gbRes.ok) {
        const gbData = await gbRes.json();
        const items: ExternalCatalogBook[] = (gbData.items || [])
          .filter((it: { volumeInfo?: { title?: string; imageLinks?: { thumbnail?: string } } }) =>
            Boolean(it.volumeInfo?.title && it.volumeInfo?.imageLinks?.thumbnail)
          )
          .map((it: {
            id: string;
            volumeInfo: {
              title: string;
              authors?: string[];
              publishedDate?: string;
              categories?: string[];
              description?: string;
              pageCount?: number;
              imageLinks: { thumbnail: string };
            };
          }) => ({
            id: `gbooks-${it.id}`,
            title: it.volumeInfo.title,
            author: it.volumeInfo.authors?.[0] || 'Featured Author',
            year: (it.volumeInfo.publishedDate || 'Classic').slice(0, 4),
            genre: it.volumeInfo.categories?.[0] || 'Literary Edition',
            coverUrl: it.volumeInfo.imageLinks.thumbnail.replace(/^http:\/\//i, 'https://'),
            description:
              it.volumeInfo.description ||
              `${it.volumeInfo.title} by ${it.volumeInfo.authors?.[0] || 'Featured Author'}.`,
            sourceApi: 'google_books',
            pageCount: it.volumeInfo.pageCount || 210,
          }));
        setDiscoveredBooks(items);
      }
    } catch {
      setDiscoveredBooks([]);
    } finally {
      setIsSearchingCatalog(false);
    }
  }

  useEffect(() => {
    const cat = CATALOG_CATEGORIES.find((c) => c.id === catalogCategory);
    if (cat && cat.query) {
      fetchExternalCatalog(cat.query);
    } else if (catalogCategory === 'curated' && !searchQuery.trim()) {
      setDiscoveredBooks([]);
    }
  }, [catalogCategory]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setCatalogCategory('curated');
      setDiscoveredBooks([]);
      return;
    }
    setCatalogCategory('search');
    fetchExternalCatalog(searchQuery);
  }

  function handleSelectDiscoveredBook(extBook: ExternalCatalogBook) {
    const existing = books.find((b) => b.id === extBook.id);
    if (existing) {
      setSelectedBookId(existing.id);
      scrollToReader();
      return;
    }
    const hydrated = buildBookFromExternalCatalogItem(
      extBook,
      settings.authorPersonality
    );
    setBooks((prev) => [hydrated, ...prev]);
    setSelectedBookId(hydrated.id);
    scrollToReader();
  }

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
        setUploadAuthor('Independent Author');
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
      setUploadError('Please enter a book title before building the edition.');
      return;
    }
    if (!uploadRawText.trim() || uploadRawText.trim().length < 60) {
      setUploadError(
        'Please upload an EPUB/PDF/TXT file or paste at least a paragraph of manuscript text.'
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
    setUploadTitle('The Time Machine');
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
            Catalog Archive
          </button>
          <button
            type="button"
            onClick={() => setActivePocketTab('upload')}
            className="hover:text-[#F6C90E] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Import Manuscript
          </button>
          <button
            type="button"
            onClick={() => setActivePocketTab('settings')}
            className="hover:text-[#F6C90E] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Voice Studio
          </button>
          <button
            type="button"
            onClick={scrollToReader}
            className="hover:text-[#F6C90E] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reading Room
          </button>
        </nav>

        {/* Zone 3: Primary action + PWA Install */}
        <div className="flex items-center gap-2.5 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={() => setActivePocketTab('upload')}
            className="px-4 py-2 text-xs font-display-brutal uppercase bg-[#F6C90E] text-[#111] border-2 border-white hover:bg-[#FFE047] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Import Book
          </button>
        </div>
      </header>

      {/* MAIN TACTILE JACKET WORKSPACE */}
      <main id="top" className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start relative">
          {/* LEFT JACKET PANEL (5 COLS): METAL SIGN PLATE + POP-ART ENAMEL BADGES + TURNTABLE CARD */}
          <div className="lg:col-span-5 flex flex-col gap-6 pt-2">
            <div className="relative">
              {/* Top-Right Overlapping Enamel Badge */}
              <div className="hidden sm:block absolute -top-8 -right-4 z-20">
                <CircularClubBadge
                  topText="CHAPTER BY CHAPTER"
                  bottomText="CLUB ARCHIVE EDITION"
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
                  est. 2020 · literary archive & audio press
                </div>

                <h1 className="font-display-brutal text-3xl sm:text-5xl leading-[1.03] uppercase tracking-tight text-[#111] text-balance">
                  WORKING
                  <br />
                  EDITIONS FOR
                  <br />
                  <span className="text-[#EB5600]">CLASSIC</span>
                  <br />
                  LITERATURE
                </h1>

                <p className="mt-4 text-sm sm:text-base font-semibold text-[#222] leading-relaxed max-w-md">
                  Full-length world classics and imported manuscripts distilled into{' '}
                  <strong className="underline decoration-[#EB5600] decoration-2">
                    proportional chapter-by-chapter compact editions
                  </strong>
                  , executive briefings, structured takeaways, and studio audio.
                </p>

                {/* Primary Quick Mode Action Bar */}
                <div className="mt-5 pt-4 border-t-2 border-neutral-300 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode('compact');
                      scrollToReader();
                    }}
                    className="px-4 py-2 bg-[#111] text-[#F6C90E] font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm hover:bg-[#222] cursor-pointer whitespace-nowrap"
                  >
                    Open Compact Edition
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode('audiobook');
                      scrollToReader();
                    }}
                    className="px-4 py-2 bg-[#E50914] text-white font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm hover:bg-[#B8000A] cursor-pointer whitespace-nowrap"
                  >
                    Listen Studio Audio
                  </button>
                </div>
              </div>

              {/* Bottom Enamel Club Badges Row */}
              <div className="mt-5 flex items-center justify-start gap-5 pl-2">
                <CircularClubBadge
                  topText="READ LIKE YOU GIVE A DAMN"
                  bottomText="EVERY CHAPTER INTACT"
                  bgColor="#F6C90E"
                  iconType="bird_scribe"
                  onClick={() => {
                    setActiveMode('bullet');
                    scrollToReader();
                  }}
                />
                <CircularClubBadge
                  topText="TRUST ME · I TESTED IT!"
                  bottomText="VOICE & NARRATOR STUDIO"
                  bgColor="#E50914"
                  iconType="bee_tester"
                  onClick={() => setActivePocketTab('settings')}
                />
              </div>
            </div>

            {/* Active Book Snapshot Card on Left Jacket with Original Cover Poster */}
            <div className="bg-white border-[3px] border-[#111] p-4 shadow-brutal">
              <div className="flex items-center justify-between text-xs font-mono-tech font-bold text-[#555] pb-2 border-b-2 border-[#111]">
                <span>NOW ON THE READING DESK</span>
                <span>{activeBook.chapters.length} CHAPTERS · 5 EDITIONS</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3.5">
                <div className="w-14 h-20 border-2 border-[#111] shadow-brutal-sm shrink-0 overflow-hidden bg-[#111]">
                  <BookPosterCover
                    title={activeBook.title}
                    author={activeBook.author}
                    coverUrl={activeBook.coverUrl}
                    coverColor={activeBook.coverColor}
                    coverAccent={activeBook.coverAccent}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display-brutal text-lg uppercase text-[#111] truncate">
                    {activeBook.title}
                  </h2>
                  <p className="text-xs font-semibold text-[#444] truncate">
                    {activeBook.author} · {activeBook.year}
                  </p>
                  <p className="text-xs font-mono-tech font-bold text-[#E50914] mt-1">
                    {activeBook.originalTotalPages}p Archive → {activeBook.compactTotalPages}p Compact
                  </p>
                </div>
                <button
                  type="button"
                  onClick={scrollToReader}
                  className="px-3 py-2 bg-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase shadow-brutal-sm cursor-pointer shrink-0"
                >
                  Read ↓
                </button>
              </div>
            </div>
          </div>

          {/* CENTER ZIPPER DIVIDER COLUMN (1 COL ON DESKTOP) */}
          <div className="hidden lg:flex lg:col-span-1 flex-col items-center self-stretch relative py-2 select-none">
            {/* Zipper Pull Slider at Top */}
            <button
              type="button"
              onClick={scrollToReader}
              aria-label="Scroll to Reading Room"
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
              {/* Tab 1: Yellow (CATALOG) */}
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
                  CATALOG
                </span>
                <span className="font-mono-tech text-[10px] font-bold">
                  ARCHIVE & API
                </span>
              </button>

              {/* Tab 2: Cobalt Blue (IMPORT) */}
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
                  IMPORT
                </span>
                <span className="font-mono-tech text-[10px] font-bold text-[#F6C90E]">
                  EPUB / PDF
                </span>
              </button>

              {/* Tab 3: Bright Red (VOICES) */}
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
                  VOICES
                </span>
                <span className="font-mono-tech text-[10px] font-bold text-white/90">
                  STUDIO CAST
                </span>
              </button>
            </div>

            {/* AI-Generated Pop-Art Collage Strip inside Pocket Mouth */}
            <PocketCollageStrip />

            {/* RED CORDUROY POCKET BODY */}
            <div className="bg-pocket-red border-[3px] border-[#111] shadow-brutal-lg p-4 sm:p-5 relative">
              {/* Stitched Inner Seam Line */}
              <div className="border-2 border-dashed border-[#111]/60 p-3 sm:p-4 bg-white/95">
                {/* POCKET TAB 1: BOOK CATALOG WITH GUTENDEX & GOOGLE BOOKS DISCOVERY + ORIGINAL COVER POSTERS */}
                {activePocketTab === 'library' && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#111] pb-2">
                      <div>
                        <h2 className="font-display-brutal text-base uppercase text-[#111] flex items-center gap-1.5">
                          <BookMarked className="w-4 h-4 text-[#E50914]" />
                          <span>CLUB ARCHIVE & GLOBAL BOOK CATALOG</span>
                        </h2>
                        <p className="text-xs text-[#444]">
                          Browse curated editions or search Gutendex &amp; Google Books with original cover posters.
                        </p>
                      </div>
                    </div>

                    {/* Search Bar + Category Filter Chips */}
                    <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-[#555] absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search Gutendex & Google Books (e.g., Dune, Jane Eyre, Kafka, Odyssey)..."
                          className="w-full pl-8 pr-3 py-1.5 bg-white border-2 border-[#111] text-xs font-medium focus:outline-none focus:bg-[#F6C90E]/15"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSearchingCatalog}
                        className="px-3 py-1.5 bg-[#111] text-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase cursor-pointer hover:bg-[#222] shrink-0"
                      >
                        {isSearchingCatalog ? 'Searching...' : 'Search'}
                      </button>
                    </form>

                    {/* Category Filter Bar */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {CATALOG_CATEGORIES.map((cat) => {
                        const active = catalogCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setCatalogCategory(cat.id);
                              if (cat.id === 'curated') {
                                setSearchQuery('');
                              }
                            }}
                            className={`px-2.5 py-1 border-2 border-[#111] font-mono-tech text-[11px] font-bold cursor-pointer transition-colors ${
                              active
                                ? 'bg-[#111] text-[#F6C90E]'
                                : 'bg-white text-[#111] hover:bg-[#F6C90E]/30'
                            }`}
                          >
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Book Grid with Original Cover Posters */}
                    {isSearchingCatalog ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs font-mono-tech text-[#333]">
                        <Loader2 className="w-6 h-6 animate-spin text-[#E50914]" />
                        <span>Fetching editions &amp; original cover posters from Gutendex &amp; Google Books...</span>
                      </div>
                    ) : catalogCategory === 'curated' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[290px] overflow-y-auto pr-1">
                        {books.map((b) => {
                          const isSelected = b.id === selectedBookId;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                setSelectedBookId(b.id);
                              }}
                              className={`text-left p-2.5 border-2 border-[#111] transition-all cursor-pointer flex items-start gap-3 ${
                                isSelected
                                  ? 'bg-[#F6C90E] shadow-brutal-sm -translate-y-0.5'
                                  : 'bg-white hover:bg-neutral-100'
                              }`}
                            >
                              {/* Original Cover Poster Thumbnail */}
                              <div className="w-12 h-17 border-2 border-[#111] shrink-0 overflow-hidden bg-[#111] shadow-brutal-sm">
                                <BookPosterCover
                                  title={b.title}
                                  author={b.author}
                                  coverUrl={b.coverUrl}
                                  coverColor={b.coverColor}
                                  coverAccent={b.coverAccent}
                                />
                              </div>

                              <div className="min-w-0 flex-1 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-center justify-between gap-1 text-[10px] font-mono-tech font-bold uppercase">
                                    <span
                                      className="px-1.5 py-0.5 text-white border border-[#111] truncate"
                                      style={{ backgroundColor: b.coverColor }}
                                    >
                                      {b.year}
                                    </span>
                                    <span className="shrink-0">
                                      {b.originalTotalPages}p → {b.compactTotalPages}p
                                    </span>
                                  </div>
                                  <div className="font-display-brutal text-xs sm:text-sm uppercase mt-1 text-[#111] line-clamp-1">
                                    {b.title}
                                  </div>
                                  <div className="text-[11px] font-semibold text-[#333] truncate">
                                    {b.author}
                                  </div>
                                </div>

                                <div className="mt-1.5 pt-1 border-t border-[#111]/20 flex items-center justify-between text-[10px] font-mono-tech font-bold">
                                  <span>
                                    {isSelected ? '✓ ON DESK' : `${b.chapters.length} CHAPTERS`}
                                  </span>
                                  <span className="underline">Open →</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[290px] overflow-y-auto pr-1">
                        {discoveredBooks.map((ext) => {
                          const isSelected = selectedBookId === ext.id;
                          return (
                            <button
                              key={ext.id}
                              type="button"
                              onClick={() => handleSelectDiscoveredBook(ext)}
                              className={`text-left p-2.5 border-2 border-[#111] transition-all cursor-pointer flex items-start gap-3 ${
                                isSelected
                                  ? 'bg-[#F6C90E] shadow-brutal-sm -translate-y-0.5'
                                  : 'bg-white hover:bg-neutral-100'
                              }`}
                            >
                              <div className="w-12 h-17 border-2 border-[#111] shrink-0 overflow-hidden bg-[#111] shadow-brutal-sm">
                                <BookPosterCover
                                  title={ext.title}
                                  author={ext.author}
                                  coverUrl={ext.coverUrl}
                                  coverColor="#1E293B"
                                  coverAccent="#F6C90E"
                                />
                              </div>

                              <div className="min-w-0 flex-1 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-center justify-between gap-1 text-[10px] font-mono-tech font-bold uppercase">
                                    <span className="px-1.5 py-0.5 bg-[#0047FF] text-white border border-[#111] flex items-center gap-1">
                                      <Globe className="w-2.5 h-2.5" />
                                      <span>
                                        {ext.sourceApi === 'gutendex' ? 'GUTENDEX' : 'GOOGLE BOOKS'}
                                      </span>
                                    </span>
                                    <span>{ext.year}</span>
                                  </div>
                                  <div className="font-display-brutal text-xs sm:text-sm uppercase mt-1 text-[#111] line-clamp-1">
                                    {ext.title}
                                  </div>
                                  <div className="text-[11px] font-semibold text-[#333] truncate">
                                    {ext.author}
                                  </div>
                                </div>

                                <div className="mt-1.5 pt-1 border-t border-[#111]/20 flex items-center justify-between text-[10px] font-mono-tech font-bold">
                                  <span>BUILD 5 EDITIONS</span>
                                  <span className="underline text-[#E50914]">Read →</span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* POCKET TAB 2: IMPORT EPUB / PDF / TXT */}
                {activePocketTab === 'upload' && (
                  <form onSubmit={handleCreateUploadedBook} className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#111] pb-2">
                      <div>
                        <h2 className="font-display-brutal text-base uppercase text-[#111]">
                          MANUSCRIPT &amp; E-BOOK PRESS (EPUB / PDF / TXT)
                        </h2>
                        <p className="text-xs text-[#444]">
                          Import any digital volume to generate a proportional chapter-by-chapter compact edition and audio stream.
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
                        <span>Select .EPUB / .PDF / .TXT File</span>
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
                          Volume Title *
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
                          Author
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
                        Extracted Manuscript Chapters *
                      </label>
                      <textarea
                        id="upload-book-manuscript"
                        rows={3}
                        value={uploadRawText}
                        onChange={(e) => setUploadRawText(e.target.value)}
                        placeholder="Select an .epub or .pdf file above, load the sample manuscript, or paste chapters here..."
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
                        ? 'Building Chapterwise Compact Edition...'
                        : 'Press Volume into Club Archive →'}
                    </button>
                  </form>
                )}

                {/* POCKET TAB 3: STUDIO VOICES — AUTHOR & NARRATOR PERSONALITIES WITH AI POP-ART PORTRAITS */}
                {activePocketTab === 'settings' && (
                  <div className="space-y-3">
                    <div className="border-b-2 border-[#111] pb-1.5">
                      <h2 className="font-display-brutal text-base uppercase text-[#111]">
                        EDITORIAL &amp; NARRATOR VOICE STUDIO
                      </h2>
                      <p className="text-xs text-[#444]">
                        Pair any resident personality—or a custom literary voice—independently for written adaptation and studio audio.
                      </p>
                    </div>

                    {/* 1. AUTHOR PERSONALITY SELECTOR */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-display-brutal text-xs uppercase flex items-center gap-1.5">
                          <PenTool className="w-3.5 h-3.5 text-[#E50914]" />
                          <span>Editorial Adapter (Written Editions)</span>
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
                        ).map((pid) => {
                          const p = PERSONALITY_PROFILES[pid];
                          const isSelected =
                            !settings.useCustomAuthor &&
                            settings.authorPersonality === pid;
                          return (
                            <button
                              key={pid}
                              type="button"
                              aria-label={`Set Editorial personality to ${p.name}`}
                              onClick={() =>
                                handleUpdateSettings({
                                  authorPersonality: pid,
                                  useCustomAuthor: false,
                                })
                              }
                              className={`p-2 border-2 border-[#111] text-left transition-all cursor-pointer flex items-center gap-2 ${
                                isSelected
                                  ? 'bg-[#F6C90E] shadow-brutal-sm -translate-y-0.5'
                                  : 'bg-white hover:bg-neutral-100'
                              }`}
                            >
                              <div className="w-9 h-9 border border-[#111] shrink-0 overflow-hidden">
                                <PersonaPortraitSvg personaId={pid} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-display-brutal text-[11px] uppercase truncate">
                                  {p.name}
                                </div>
                                <div className="text-[10px] text-[#333] truncate">
                                  {p.roleTitle}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Author Personality Input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          aria-label="Custom Editorial Voice"
                          value={settings.customAuthorTrait}
                          onChange={(e) =>
                            handleUpdateSettings({
                              customAuthorTrait: e.target.value,
                              useCustomAuthor: e.target.value.trim().length > 0,
                            })
                          }
                          placeholder="Or enter a custom editorial voice (e.g., Oxford historian, Noir detective)..."
                          className="flex-1 px-2.5 py-1 bg-white border-2 border-[#111] text-xs font-medium"
                        />
                      </div>
                    </div>

                    {/* 2. NARRATOR PERSONALITY SELECTOR */}
                    <div className="space-y-1.5 pt-2 border-t-2 border-[#111]/20">
                      <div className="flex items-center justify-between">
                        <span className="font-display-brutal text-xs uppercase flex items-center gap-1.5">
                          <Mic className="w-3.5 h-3.5 text-[#0047FF]" />
                          <span>Studio Narrator (Audio Editions)</span>
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
                        ).map((pid) => {
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
                              className={`p-2 border-2 border-[#111] text-left transition-all cursor-pointer flex items-center gap-2 ${
                                isSelected
                                  ? 'bg-[#0047FF] text-white shadow-brutal-sm -translate-y-0.5'
                                  : 'bg-white text-[#111] hover:bg-neutral-100'
                              }`}
                            >
                              <div className="w-9 h-9 border border-[#111] shrink-0 overflow-hidden">
                                <PersonaPortraitSvg personaId={pid} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-display-brutal text-[11px] uppercase truncate">
                                  {p.name}
                                </div>
                                <div className="text-[10px] opacity-90 truncate">
                                  Studio: {p.ttsVoiceName}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Narrator Personality Input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          aria-label="Custom Narrator Voice"
                          value={settings.customNarratorTrait}
                          onChange={(e) =>
                            handleUpdateSettings({
                              customNarratorTrait: e.target.value,
                              useCustomNarrator: e.target.value.trim().length > 0,
                            })
                          }
                          placeholder="Or enter a custom narrator cadence (e.g., Fireside baritone, Late-night broadcast)..."
                          className="flex-1 px-2.5 py-1 bg-white border-2 border-[#111] text-xs font-medium"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* HANGING YELLOW LANYARD ID CARD WITH AI POP-ART PORTRAIT */}
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
                        RESIDENT PRESS CREDENTIAL · ACTIVE VOICE CAST
                      </div>
                      <div className="font-display-brutal text-base sm:text-lg uppercase text-[#111] truncate">
                        Editor:{' '}
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

                  {/* 4 Preset Personality Buttons in a Clean 4-Column Row */}
                  <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'homelander', label: 'Homelander' },
                        { id: 'taylor_swift', label: 'Taylor Swift' },
                        { id: 'deadpool', label: 'Deadpool' },
                        { id: 'gandalf', label: 'Gandalf' },
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

        {/* FULL CHAPTER-WISE READER & STUDIO AUDIOBOOK WORKSPACE BELOW THE FOLD */}
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
            THE READERS CLUB · LITERARY ARCHIVE &amp; AUDIO PRESS
          </span>
          <div className="flex items-center gap-3 font-mono-tech">
            <span>Original Archive</span>
            <span aria-hidden="true">·</span>
            <span>Compact Edition</span>
            <span aria-hidden="true">·</span>
            <span>Executive Briefing</span>
            <span aria-hidden="true">·</span>
            <span>Key Takeaways</span>
            <span aria-hidden="true">·</span>
            <span>Studio Audiobook</span>
          </div>
        </div>
      </footer>

      <OfflineIndicator />
    </div>
  );
}
