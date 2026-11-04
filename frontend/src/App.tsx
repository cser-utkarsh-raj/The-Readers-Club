/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AppPageRoute,
  BookItem,
  ClubSettings,
  ExternalCatalogBook,
  PresetPersonalityId,
  SummaryMode,
  UserTasteProfile,
} from './types/book';
import { OPEN_SOURCE_BOOKS } from './data/openSourceBooks';
import {
  GENRE_CATEGORIES,
  GLOBAL_CATALOG_BOOKS,
} from './data/globalCatalogSeed';
import {
  PERSONALITY_PROFILES,
  buildBookFromExternalCatalogItem,
  buildBookFromExtractedText,
  computeMlRecommendations,
} from './utils/bookLogic';
import { extractTextFromUploadedFile } from './utils/fileExtractor';
import {
  BookPosterCover,
  CircularClubBadge,
  PersonaPortraitSvg,
  PocketCollageStrip,
  ReadersClubLogo,
} from './components/TactileArt';
import { ReaderWorkspace } from './components/ReaderModal';
import { DotFooter } from './components/DotFooter';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';
import {
  FileUp,
  ChevronDown,
  Mic,
  PenTool,
  Search,
  Loader2,
  Sparkles,
  Flame,
  Play,
  BookOpen,
} from 'lucide-react';

function getInitialRouteFromPath(): AppPageRoute {
  if (typeof window === 'undefined') return 'home';
  const p = window.location.pathname.toLowerCase();
  if (p.startsWith('/catalog')) return 'catalog';
  if (p.startsWith('/reader')) return 'reader';
  if (p.startsWith('/press')) return 'press';
  if (p.startsWith('/voices')) return 'voices';
  return 'home';
}

export default function App() {
  const [activePage, setActivePage] = useState<AppPageRoute>(getInitialRouteFromPath);

  const [books, setBooks] = useState<BookItem[]>(OPEN_SOURCE_BOOKS);
  const [selectedBookId, setSelectedBookId] = useState<string>(
    OPEN_SOURCE_BOOKS[0].id
  );
  const [activeMode, setActiveMode] = useState<SummaryMode>('compact');

  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [liveApiBooks, setLiveApiBooks] = useState<ExternalCatalogBook[]>([]);
  const [catalogPage, setCatalogPage] = useState<number>(1);
  const [isSearchingApi, setIsSearchingApi] = useState<boolean>(false);
  const [featuredIndex, setFeaturedIndex] = useState<number>(0);

  const [settings, setSettings] = useState<ClubSettings>({
    authorPersonality: 'taylor_swift',
    narratorPersonality: 'gandalf',
    customAuthorTrait: '',
    customNarratorTrait: '',
    useCustomAuthor: false,
    useCustomNarrator: false,
    targetCompactRatio: 0.175,
  });

  const [tasteProfile, setTasteProfile] = useState<UserTasteProfile>({
    viewedBookIds: ['art-of-war', 'cat-pg-1184'],
    compressedBookIds: [],
    favoriteGenres: {
      'Philosophy & Strategy': 3,
      'Sci-Fi & Dystopia': 2,
      'Epic & Adventure': 2,
    },
    activePersona: 'taylor_swift',
    searchHistory: [],
  });

  // Upload state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [uploadRawText, setUploadRawText] = useState('');
  const [uploadFormat, setUploadFormat] = useState<'EPUB' | 'PDF' | 'TXT'>('EPUB');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const discoveryDeckRef = useRef<HTMLDivElement | null>(null);

  function navigateToPage(page: AppPageRoute) {
    setActivePage(page);
    if (typeof window !== 'undefined') {
      const targetPath = page === 'home' ? '/' : `/${page}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ page }, '', targetPath);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  useEffect(() => {
    const onPopState = () => {
      setActivePage(getInitialRouteFromPath());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    setTasteProfile((prev) => ({
      ...prev,
      activePersona: settings.authorPersonality,
    }));
  }, [settings.authorPersonality]);

  const activeBook =
    books.find((b) => b.id === selectedBookId) || books[0];

  const activeAuthorProfile = PERSONALITY_PROFILES[settings.authorPersonality];
  const activeNarratorProfile =
    PERSONALITY_PROFILES[settings.narratorPersonality];

  const featuredCatalogBooks = useMemo(
    () => GLOBAL_CATALOG_BOOKS.filter((b) => b.isFeatured),
    []
  );
  const currentFeaturedBook =
    featuredCatalogBooks[featuredIndex % Math.max(1, featuredCatalogBooks.length)] ||
    GLOBAL_CATALOG_BOOKS[0];

  const combinedArchivePool = useMemo(() => {
    const seen = new Set<string>();
    const merged: ExternalCatalogBook[] = [];
    for (const item of [...GLOBAL_CATALOG_BOOKS, ...liveApiBooks]) {
      const key = `${item.title.toLowerCase()}::${item.author.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
    return merged;
  }, [liveApiBooks]);

  const filteredArchiveBooks = useMemo(() => {
    return combinedArchivePool.filter((b) => {
      const matchesGenre =
        selectedGenre === 'all' ||
        b.genre.toLowerCase().includes(selectedGenre.split('&')[0].trim().toLowerCase()) ||
        (b.subgenres || []).some((s) =>
          s.toLowerCase().includes(selectedGenre.split('&')[0].trim().toLowerCase())
        );

      if (!searchQuery.trim()) return matchesGenre;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.genre.toLowerCase().includes(q) ||
        (b.mlTags || []).some((t) => t.toLowerCase().includes(q));

      return matchesGenre && matchesSearch;
    });
  }, [combinedArchivePool, selectedGenre, searchQuery]);

  const mlRecommendations = useMemo(() => {
    return computeMlRecommendations(combinedArchivePool, tasteProfile, 12);
  }, [combinedArchivePool, tasteProfile]);

  const trendingBooks = useMemo(() => {
    return [...combinedArchivePool]
      .sort((a, b) => (b.trendingScore || 85) - (a.trendingScore || 85))
      .slice(0, 12);
  }, [combinedArchivePool]);

  const worldClassicsShelf = useMemo(() => {
    return combinedArchivePool
      .filter((b) => (b.chapterCount || 18) >= 18)
      .slice(0, 12);
  }, [combinedArchivePool]);

  async function fetchLiveArchivePage(queryText: string, genreId: string, pageNum: number) {
    setIsSearchingApi(true);
    const catObj = GENRE_CATEGORIES.find((g) => g.id === genreId);
    const topicParam = catObj?.apiTopic || '';

    try {
      const params = new URLSearchParams();
      if (queryText.trim()) params.set('q', queryText.trim());
      if (topicParam) params.set('topic', topicParam);
      params.set('page', String(pageNum));

      const resp = await fetch(`/api/books/discover?${params.toString()}`);
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.books) && data.books.length > 0) {
          setLiveApiBooks((prev) =>
            pageNum === 1 ? data.books : [...prev, ...data.books]
          );
        }
      }
    } catch {
      // Covered by local catalog seed
    } finally {
      setIsSearchingApi(false);
    }
  }

  useEffect(() => {
    fetchLiveArchivePage(searchQuery, selectedGenre, catalogPage);
  }, [selectedGenre, catalogPage]);

  function handleDynamicSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      setTasteProfile((prev) => ({
        ...prev,
        searchHistory: [...prev.searchHistory.slice(-8), searchQuery.trim()],
      }));
    }
    setCatalogPage(1);
    fetchLiveArchivePage(searchQuery, selectedGenre, 1);
  }

  function handleOpenCatalogVolume(
    extBook: ExternalCatalogBook,
    initialMode: SummaryMode = 'compact'
  ) {
    setTasteProfile((prev) => ({
      ...prev,
      viewedBookIds: [...new Set([extBook.id, ...prev.viewedBookIds])].slice(0, 25),
      favoriteGenres: {
        ...prev.favoriteGenres,
        [extBook.genre]: (prev.favoriteGenres[extBook.genre] || 0) + 1,
      },
    }));

    const existing = books.find((b) => b.id === extBook.id);
    if (existing) {
      setSelectedBookId(existing.id);
      setActiveMode(initialMode);
      navigateToPage('reader');
      return;
    }

    const hydrated = buildBookFromExternalCatalogItem(
      extBook,
      settings.authorPersonality,
      false
    );
    setBooks((prev) => [hydrated, ...prev]);
    setSelectedBookId(hydrated.id);
    setActiveMode(initialMode);
    navigateToPage('reader');
  }

  function handleOpenPrePressedBook(
    bookItem: BookItem,
    initialMode: SummaryMode = 'compact'
  ) {
    setTasteProfile((prev) => ({
      ...prev,
      viewedBookIds: [...new Set([bookItem.id, ...prev.viewedBookIds])].slice(0, 25),
      favoriteGenres: {
        ...prev.favoriteGenres,
        [bookItem.genre]: (prev.favoriteGenres[bookItem.genre] || 0) + 1,
      },
    }));
    setSelectedBookId(bookItem.id);
    setActiveMode(initialMode);
    navigateToPage('reader');
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
    setTasteProfile((prev) => ({
      ...prev,
      compressedBookIds: [...new Set([bookId, ...prev.compressedBookIds])],
    }));

    setBooks((prevBooks) =>
      prevBooks.map((b) => {
        if (b.id !== bookId) return b;
        const updatedChapters = b.chapters.map((ch) => {
          if (ch.id !== chapterId) return ch;
          return {
            ...ch,
            isCompressed: true,
            compactText: compactText.length > 0 ? compactText : ch.compactText,
            bulletPoints: bulletPoints.length > 0 ? bulletPoints : ch.bulletPoints,
            personaCompactCache: {
              ...(ch.personaCompactCache || {}),
              [personaKey]: compactText,
            },
            personaBulletCache: {
              ...(ch.personaBulletCache || {}),
              [personaKey]: bulletPoints,
            },
          };
        });

        const updatedMasterBullets = updatedChapters.map(
          (c) =>
            `${c.title}: ${
              c.bulletPoints[0] || 'Select this chapter in the reader to generate highlights.'
            }`
        );

        return {
          ...b,
          chapters: updatedChapters,
          masterBookBullets: updatedMasterBullets,
        };
      })
    );
  }

  function handleHydrateGutenbergChapters(
    bookId: string,
    extracted: Array<{ number: number; title: string; originalText: string[] }>
  ) {
    setBooks((prevBooks) =>
      prevBooks.map((b) => {
        if (b.id !== bookId) return b;
        const updatedChapters = b.chapters.map((ch, idx) => {
          const ext = extracted[idx];
          if (!ext) return ch;
          return {
            ...ch,
            title: ext.title || ch.title,
            originalText:
              ext.originalText && ext.originalText.length >= 2
                ? ext.originalText
                : ch.originalText,
          };
        });
        return {
          ...b,
          chapters: updatedChapters,
        };
      })
    );
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
        'Could not read that file. Please try another EPUB, PDF, or TXT file.'
      );
    } finally {
      setIsProcessingUpload(false);
    }
  }

  async function handleCreateUploadedBook(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadTitle.trim()) {
      setUploadError('Please enter a book title.');
      return;
    }
    if (!uploadRawText.trim() || uploadRawText.trim().length < 60) {
      setUploadError(
        'Please choose an EPUB/PDF/TXT file or paste your book text.'
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
      settings.authorPersonality,
      false
    );

    setBooks((prev) => [newBook, ...prev]);
    setSelectedBookId(newBook.id);
    setActiveMode('compact');
    setIsProcessingUpload(false);
    setUploadTitle('');
    setUploadAuthor('');
    setUploadRawText('');
    setUploadedFileName(null);
    navigateToPage('reader');
  }

  function handleLoadSampleBook() {
    setUploadTitle('The Time Machine');
    setUploadAuthor('H. G. Wells');
    setUploadFormat('EPUB');
    setUploadedFileName('the-time-machine.epub');
    setUploadError(null);
    const sample18 = Array.from({ length: 18 }, (_, i) => {
      return `Chapter ${i + 1}: Part ${i + 1} of the Voyage
In this chapter, the Time Traveller recounts the next stage of his journey through time, observing how society, nature, and the earth itself transform across the ages.

Each scene builds on the previous chapter’s discoveries while raising new questions about humanity’s future.`;
    }).join('\n\n');
    setUploadRawText(sample18);
  }

  const navItems: { id: AppPageRoute; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'catalog', label: 'Browse' },
    { id: 'reader', label: 'Reader' },
    { id: 'press', label: 'Upload' },
    { id: 'voices', label: 'Voices' },
  ];

  return (
    <div className="min-h-screen bg-jacket-orange text-[#111] flex flex-col">
      {/* CLEAN, USER-FRIENDLY HEADER WITH CUSTOM POP-ART LOGO */}
      <header className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 bg-[#111] text-white border-b-[3px] border-[#111] sticky top-0 z-40">
        {/* Zone 1: Pop-Art Logo + Brand Name */}
        <button
          type="button"
          onClick={() => navigateToPage('home')}
          className="flex items-center gap-2.5 cursor-pointer shrink-0 group"
        >
          <ReadersClubLogo className="w-9 h-9 group-hover:scale-105 transition-transform" />
          <span className="font-display-brutal text-lg tracking-tight text-[#F6C90E] whitespace-nowrap">
            THE READERS CLUB
          </span>
        </button>

        {/* Zone 2: Simple 5-Page Navigation */}
        <nav
          aria-label="Main Navigation"
          className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1"
        >
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateToPage(item.id)}
                className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer border-2 ${
                  isActive
                    ? 'bg-[#F6C90E] text-[#111] border-white font-display-brutal uppercase'
                    : 'bg-transparent text-neutral-200 border-transparent hover:text-[#F6C90E] hover:border-neutral-700'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Continue Reading + PWA Install */}
        <div className="hidden lg:flex items-center gap-2.5 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={() => navigateToPage('reader')}
            className="px-3.5 py-1.5 text-xs font-display-brutal uppercase bg-[#E50914] text-white border-2 border-white hover:bg-[#B8000A] transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Continue Reading</span>
          </button>
        </div>
      </header>

      {/* =====================================================================
          PAGE 1: HOME (`/`)
         ===================================================================== */}
      {activePage === 'home' && (
        <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-10">
          {/* TOP TACTILE JACKET HERO */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start relative">
            {/* LEFT JACKET PANEL (5 COLS) */}
            <div className="lg:col-span-5 flex flex-col gap-6 pt-2">
              <div className="relative">
                {/* Overlapping Enamel Pin Badge */}
                <div className="hidden sm:block absolute -top-8 -right-4 z-20">
                  <CircularClubBadge
                    topText="ONE MORE CHAPTER"
                    bottomText="THE READERS CLUB"
                    bgColor="#0047FF"
                    iconType="hippo_reader"
                    onClick={() => navigateToPage('catalog')}
                  />
                </div>

                {/* Riveted Brushed Metal Sign Plate */}
                <div className="bg-metal-plate border-[3px] border-[#111] rounded-xl p-6 sm:p-8 shadow-brutal-lg relative">
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

                  <div className="flex items-center gap-2 text-sm font-bold text-[#555] tracking-wide mb-3">
                    <ReadersClubLogo className="w-7 h-7 border-[#111]" />
                    <span>books · chapter summaries · audiobooks</span>
                  </div>

                  <h1 className="font-display-brutal text-3xl sm:text-5xl leading-[1.03] uppercase tracking-tight text-[#111] text-balance">
                    EVERY GREAT
                    <br />
                    BOOK, IN
                    <br />
                    <span className="text-[#EB5600]">YOUR</span>
                    <br />
                    STYLE
                  </h1>

                  <p className="mt-4 text-sm sm:text-base font-semibold text-[#222] leading-relaxed max-w-md">
                    Read timeless classics or upload your own books. Switch effortlessly between the original book, chapter-by-chapter compact editions, quick highlights, and narrated audio.
                  </p>

                  <div className="mt-5 pt-4 border-t-2 border-neutral-300 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => navigateToPage('reader')}
                      className="px-4 py-2.5 bg-[#111] text-[#F6C90E] font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm hover:bg-[#222] cursor-pointer whitespace-nowrap"
                    >
                      Start Reading
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateToPage('catalog')}
                      className="px-4 py-2.5 bg-[#E50914] text-white font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm hover:bg-[#B8000A] cursor-pointer whitespace-nowrap"
                    >
                      Browse Library
                    </button>
                  </div>
                </div>

                {/* Bottom Enamel Club Badges Row */}
                <div className="mt-5 flex items-center justify-start gap-5 pl-2">
                  <CircularClubBadge
                    topText="READ LIKE YOU GIVE A DAMN"
                    bottomText="CHAPTER BY CHAPTER"
                    bgColor="#F6C90E"
                    iconType="bird_scribe"
                    onClick={() => navigateToPage('reader')}
                  />
                  <CircularClubBadge
                    topText="PICK YOUR NARRATOR"
                    bottomText="4 ICONIC VOICES"
                    bgColor="#E50914"
                    iconType="bee_tester"
                    onClick={() => navigateToPage('voices')}
                  />
                </div>
              </div>

              {/* Currently Reading Card */}
              <div className="bg-white border-[3px] border-[#111] p-4 shadow-brutal">
                <div className="flex items-center justify-between text-xs font-mono-tech font-bold text-[#555] pb-2 border-b-2 border-[#111]">
                  <span>CONTINUE READING</span>
                  <span>{activeBook.chapters.length} CHAPTERS</span>
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
                      {activeBook.author}
                    </p>
                    <p className="text-xs font-mono-tech font-bold text-[#E50914] mt-1">
                      {activeBook.compactTotalPages}-Page Compact Edition
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateToPage('reader')}
                    className="px-3.5 py-2 bg-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase shadow-brutal-sm cursor-pointer shrink-0"
                  >
                    Read →
                  </button>
                </div>
              </div>
            </div>

            {/* CENTER ZIPPER DIVIDER COLUMN */}
            <div className="hidden lg:flex lg:col-span-1 flex-col items-center self-stretch relative py-2 select-none">
              <button
                type="button"
                onClick={() =>
                  discoveryDeckRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
                aria-label="Scroll to Books"
                className="z-20 flex flex-col items-center group cursor-pointer focus:outline-none"
              >
                <div className="w-8 h-9 bg-[#F6C90E] border-[3px] border-[#111] rounded-t-md flex items-center justify-center">
                  <div className="w-2.5 h-4 bg-[#EB5600] border-2 border-[#111]" />
                </div>
                <div className="w-16 h-12 bg-[#0B192C] text-white border-[3px] border-[#111] rounded-md shadow-brutal flex flex-col items-center justify-center group-hover:translate-y-1 transition-transform">
                  <ChevronDown className="w-4 h-4 text-[#F6C90E] -mb-0.5" />
                  <span className="font-bold text-xs tracking-tight">scroll</span>
                </div>
              </button>

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

            {/* RIGHT JACKET POCKET: SEARCH, FEATURED BOOK & ACTIVE VOICE CARD (6 COLS) */}
            <div className="lg:col-span-6 flex flex-col pt-2 relative">
              {/* THREE SIMPLE POCKET TABS */}
              <div className="grid grid-cols-3 gap-1.5 px-2 items-end">
                <button
                  type="button"
                  onClick={() => navigateToPage('catalog')}
                  className="h-15 bg-[#F5B800] text-[#111] border-t-[3px] border-x-[3px] border-[#111] rounded-t-2xl px-3 shadow-brutal-sm z-10 cursor-pointer flex flex-col items-center justify-center"
                >
                  <span className="font-display-brutal text-xs sm:text-sm uppercase tracking-tight">
                    LIBRARY
                  </span>
                  <span className="font-mono-tech text-[10px] font-bold">
                    BROWSE ALL
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToPage('press')}
                  className="h-13 hover:h-15 bg-[#0047FF] text-white border-t-[3px] border-x-[3px] border-[#111] rounded-t-2xl px-3 transition-all cursor-pointer flex flex-col items-center justify-center"
                >
                  <span className="font-display-brutal text-xs sm:text-sm uppercase tracking-tight">
                    UPLOAD
                  </span>
                  <span className="font-mono-tech text-[10px] font-bold text-[#F6C90E]">
                    EPUB / PDF
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToPage('voices')}
                  className="h-13 hover:h-15 bg-[#FF1E1E] text-white border-t-[3px] border-x-[3px] border-[#111] rounded-t-2xl px-3 transition-all cursor-pointer flex flex-col items-center justify-center"
                >
                  <span className="font-display-brutal text-xs sm:text-sm uppercase tracking-tight">
                    VOICES
                  </span>
                  <span className="font-mono-tech text-[10px] font-bold text-white/90">
                    4 PERSONAS
                  </span>
                </button>
              </div>

              <PocketCollageStrip />

              {/* RED CORDUROY POCKET BODY */}
              <div className="bg-pocket-red border-[3px] border-[#111] shadow-brutal-lg p-4 sm:p-5 relative">
                <div className="border-2 border-dashed border-[#111]/60 p-3.5 sm:p-4 bg-white/95 space-y-3.5">
                  {/* Simple Search & Genre Filter */}
                  <form onSubmit={handleDynamicSearchSubmit} className="space-y-2">
                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-[#555] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          id="home-dynamic-search"
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search books, authors, or genres..."
                          className="w-full pl-9 pr-3 py-2 bg-white border-2 border-[#111] text-xs sm:text-sm font-medium focus:outline-none focus:bg-[#F6C90E]/15"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#111] text-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase cursor-pointer hover:bg-[#222] shrink-0"
                      >
                        Search
                      </button>
                    </div>

                    {/* Clean Genre Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {GENRE_CATEGORIES.map((g) => {
                        const active = selectedGenre === g.id;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => {
                              setSelectedGenre(g.id);
                              discoveryDeckRef.current?.scrollIntoView({
                                behavior: 'smooth',
                              });
                            }}
                            className={`px-2.5 py-1 border-2 border-[#111] font-mono-tech text-[10px] font-bold cursor-pointer transition-colors ${
                              active
                                ? 'bg-[#E50914] text-white'
                                : 'bg-white text-[#111] hover:bg-[#F6C90E]/40'
                            }`}
                          >
                            {g.label}
                          </button>
                        );
                      })}
                    </div>
                  </form>

                  {/* FEATURED BOOK SPOTLIGHT */}
                  <div className="p-3.5 bg-[#111] text-white border-[3px] border-[#111] shadow-brutal relative">
                    <div className="flex items-start gap-4">
                      <div className="w-20 h-28 sm:w-24 sm:h-34 border-2 border-[#F6C90E] shrink-0 overflow-hidden bg-neutral-900 shadow-brutal-sm">
                        <BookPosterCover
                          title={currentFeaturedBook.title}
                          author={currentFeaturedBook.author}
                          coverUrl={currentFeaturedBook.coverUrl}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono-tech font-bold">
                          <span className="px-1.5 py-0.5 bg-[#E50914] text-white border border-white">
                            FEATURED BOOK
                          </span>
                          <span className="px-1.5 py-0.5 bg-[#10B981] text-[#111] font-extrabold">
                            98% MATCH
                          </span>
                        </div>

                        <h2 className="font-display-brutal text-base sm:text-xl uppercase text-white mt-1.5 truncate">
                          {currentFeaturedBook.title}
                        </h2>
                        <div className="text-xs font-mono-tech text-[#F6C90E]">
                          {currentFeaturedBook.author} · {currentFeaturedBook.genre}
                        </div>

                        <p className="text-xs text-neutral-300 line-clamp-2 mt-1.5 leading-relaxed">
                          {currentFeaturedBook.description}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenCatalogVolume(currentFeaturedBook, 'compact')
                            }
                            className="px-3.5 py-1.5 bg-[#F6C90E] text-[#111] font-display-brutal text-xs uppercase border border-white cursor-pointer hover:bg-[#FFE047] flex items-center gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Read Now</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setFeaturedIndex(
                                (i) => (i + 1) % featuredCatalogBooks.length
                              )
                            }
                            className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white font-mono-tech text-xs border border-neutral-600 cursor-pointer"
                          >
                            Next Book →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* HANGING YELLOW LANYARD ID CARD WITH POP-ART PORTRAITS */}
                <div className="mt-3.5 flex flex-col sm:flex-row items-center gap-4 bg-badge-yellow border-[3px] border-[#111] rounded-2xl p-3.5 shadow-brutal-lg relative">
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      aria-hidden="true"
                      className="w-8 h-2 bg-[#B8860B] border border-[#111] rounded-full mb-1.5"
                    />
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-[3px] border-[#111] overflow-hidden shadow-brutal-sm bg-[#FF1493]">
                      <PersonaPortraitSvg personaId={settings.authorPersonality} />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 w-full">
                    <div className="bg-white border-2 border-[#111] px-3 py-1 text-center sm:text-left shadow-brutal-sm">
                      <div className="font-mono-tech text-[10px] font-bold uppercase text-[#555]">
                        ACTIVE NARRATOR &amp; SUMMARY VOICE
                      </div>
                      <div className="font-display-brutal text-base sm:text-lg uppercase text-[#111] truncate">
                        {settings.useCustomAuthor && settings.customAuthorTrait
                          ? settings.customAuthorTrait
                          : activeAuthorProfile.name}
                      </div>
                    </div>

                    <div className="mt-1.5 bg-white border-2 border-[#111] px-3 py-1 text-xs font-semibold text-[#222] truncate">
                      {activeAuthorProfile.sampleQuote}
                    </div>

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

          {/* =================================================================
              CLEAN, USER-FRIENDLY BOOK SHELVES
             ================================================================= */}
          <div ref={discoveryDeckRef} className="space-y-8 pt-2">
            {/* Search or Genre Filter Results */}
            {(searchQuery.trim() !== '' || selectedGenre !== 'all') && (
              <section className="bg-reader-paper border-[3px] border-[#111] p-5 shadow-brutal-lg">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b-[3px] border-[#111]">
                  <div>
                    <h2 className="font-display-brutal text-xl uppercase text-[#111]">
                      {selectedGenre === 'all' ? 'Search Results' : selectedGenre}
                      {searchQuery.trim() ? ` — "${searchQuery.trim()}"` : ''}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGenre('all');
                        setSearchQuery('');
                      }}
                      className="px-3 py-1.5 bg-white border-2 border-[#111] font-mono-tech text-xs font-bold cursor-pointer hover:bg-[#F6C90E]"
                    >
                      Clear Filter
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateToPage('catalog')}
                      className="px-3 py-1.5 bg-[#111] text-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase cursor-pointer"
                    >
                      See All Books →
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filteredArchiveBooks.slice(0, 18).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleOpenCatalogVolume(item, 'compact')}
                      className="text-left bg-white border-[3px] border-[#111] shadow-brutal-sm hover:-translate-y-1 transition-transform cursor-pointer flex flex-col justify-between overflow-hidden group"
                    >
                      <div className="w-full aspect-[2/3] border-b-2 border-[#111] relative bg-[#18181B] overflow-hidden">
                        <BookPosterCover
                          title={item.title}
                          author={item.author}
                          coverUrl={item.coverUrl}
                        />
                      </div>
                      <div className="p-2.5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="font-mono-tech text-[10px] font-bold text-[#E50914] uppercase truncate">
                            {item.genre}
                          </div>
                          <div className="font-display-brutal text-xs uppercase text-[#111] line-clamp-2 min-h-[2rem] mt-0.5 leading-tight">
                            {item.title}
                          </div>
                          <div className="text-[11px] font-semibold text-[#444] truncate mt-0.5">
                            {item.author}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* SHELF 1: PICKED FOR YOU (ML RECOMMENDATIONS) */}
            <section className="bg-reader-paper border-[3px] border-[#111] p-5 shadow-brutal-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b-[3px] border-[#111]">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-mono-tech font-bold text-[#0047FF]">
                    <Sparkles className="w-4 h-4" />
                    <span>PERSONALIZED RECOMMENDATIONS</span>
                  </div>
                  <h2 className="font-display-brutal text-xl sm:text-2xl uppercase text-[#111] mt-0.5">
                    Picked for You
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigateToPage('catalog')}
                  className="px-3 py-1.5 bg-[#111] text-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase cursor-pointer"
                >
                  Browse All →
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {mlRecommendations.slice(0, 6).map(({ book, matchPercentage }) => {
                  const ext = book as ExternalCatalogBook;
                  return (
                    <button
                      key={ext.id}
                      type="button"
                      onClick={() => handleOpenCatalogVolume(ext, 'compact')}
                      className="text-left bg-white border-[3px] border-[#111] shadow-brutal-sm hover:-translate-y-1 transition-transform cursor-pointer flex flex-col justify-between overflow-hidden group"
                    >
                      <div className="w-full aspect-[2/3] border-b-2 border-[#111] relative bg-[#18181B] overflow-hidden">
                        <BookPosterCover
                          title={ext.title}
                          author={ext.author}
                          coverUrl={ext.coverUrl}
                        />
                        <span className="absolute top-2 left-2 z-20 bg-[#10B981] text-[#111] border-2 border-[#111] px-1.5 py-0.5 font-mono-tech text-[10px] font-extrabold shadow-brutal-sm">
                          {matchPercentage}% Match
                        </span>
                      </div>

                      <div className="p-2.5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="font-mono-tech text-[10px] font-bold text-[#0047FF] uppercase truncate">
                            {ext.genre}
                          </div>
                          <div className="font-display-brutal text-xs uppercase text-[#111] line-clamp-2 min-h-[2rem] mt-0.5 leading-tight">
                            {ext.title}
                          </div>
                          <div className="text-[11px] font-semibold text-[#444] truncate">
                            {ext.author}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* SHELF 2: TRENDING NOW */}
            <section className="bg-[#111] text-white border-[3px] border-[#111] p-5 shadow-brutal-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b-2 border-neutral-700">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-mono-tech font-bold text-[#F6C90E]">
                    <Flame className="w-4 h-4 text-[#E50914]" />
                    <span>MOST READ THIS WEEK</span>
                  </div>
                  <h2 className="font-display-brutal text-xl sm:text-2xl uppercase text-white mt-0.5">
                    Trending Now
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigateToPage('catalog')}
                  className="px-3 py-1.5 bg-[#F6C90E] text-[#111] border-2 border-white font-display-brutal text-xs uppercase cursor-pointer"
                >
                  See All →
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {trendingBooks.slice(0, 6).map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleOpenCatalogVolume(item, 'compact')}
                    className="text-left bg-neutral-900 border-2 border-neutral-600 hover:border-[#F6C90E] transition-all cursor-pointer flex flex-col justify-between overflow-hidden group relative"
                  >
                    <div className="w-full aspect-[2/3] border-b border-neutral-700 relative bg-black overflow-hidden">
                      <BookPosterCover
                        title={item.title}
                        author={item.author}
                        coverUrl={item.coverUrl}
                      />
                      <span className="absolute top-2 left-2 z-20 bg-[#E50914] text-white border-2 border-white px-2 py-0.5 font-display-brutal text-xs">
                        #{idx + 1}
                      </span>
                    </div>

                    <div className="p-2.5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="font-mono-tech text-[10px] text-[#F6C90E] uppercase truncate">
                          {item.genre}
                        </div>
                        <div className="font-display-brutal text-xs uppercase text-white line-clamp-2 min-h-[2rem] mt-0.5 leading-tight">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-neutral-300 truncate">
                          {item.author}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* SHELF 3: CLUB FAVORITES */}
            <section className="bg-reader-paper border-[3px] border-[#111] p-5 shadow-brutal-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b-[3px] border-[#111]">
                <div>
                  <span className="font-mono-tech text-xs font-bold uppercase text-[#059669]">
                    CURATED COMPACT EDITIONS
                  </span>
                  <h2 className="font-display-brutal text-xl sm:text-2xl uppercase text-[#111] mt-0.5">
                    Club Favorites
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {OPEN_SOURCE_BOOKS.slice(0, 12).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleOpenPrePressedBook(b, 'compact')}
                    className="text-left bg-white border-[3px] border-[#111] shadow-brutal-sm hover:-translate-y-1 transition-transform cursor-pointer flex flex-col justify-between overflow-hidden group"
                  >
                    <div className="w-full aspect-[2/3] border-b-2 border-[#111] relative bg-[#18181B] overflow-hidden">
                      <BookPosterCover
                        title={b.title}
                        author={b.author}
                        coverUrl={b.coverUrl}
                        coverColor={b.coverColor}
                        coverAccent={b.coverAccent}
                      />
                    </div>

                    <div className="p-2.5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="font-mono-tech text-[10px] font-bold text-[#059669] uppercase truncate">
                          {b.genre}
                        </div>
                        <div className="font-display-brutal text-xs uppercase text-[#111] line-clamp-2 min-h-[2rem] mt-0.5 leading-tight">
                          {b.title}
                        </div>
                        <div className="text-[11px] font-semibold text-[#444] truncate mt-0.5">
                          {b.author}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* SHELF 4: TIMELESS CLASSICS */}
            <section className="bg-reader-paper border-[3px] border-[#111] p-5 shadow-brutal-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b-[3px] border-[#111]">
                <div>
                  <span className="font-mono-tech text-xs font-bold uppercase text-[#E50914]">
                    ESSENTIAL READING
                  </span>
                  <h2 className="font-display-brutal text-xl sm:text-2xl uppercase text-[#111] mt-0.5">
                    World Classics
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigateToPage('catalog')}
                  className="px-3 py-1.5 bg-[#0047FF] text-white border-2 border-[#111] font-display-brutal text-xs uppercase cursor-pointer"
                >
                  Explore All Books →
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {worldClassicsShelf.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleOpenCatalogVolume(item, 'compact')}
                    className="text-left bg-white border-[3px] border-[#111] shadow-brutal-sm hover:-translate-y-1 transition-transform cursor-pointer flex flex-col justify-between overflow-hidden group"
                  >
                    <div className="w-full aspect-[2/3] border-b-2 border-[#111] relative bg-[#18181B] overflow-hidden">
                      <BookPosterCover
                        title={item.title}
                        author={item.author}
                        coverUrl={item.coverUrl}
                      />
                    </div>

                    <div className="p-2.5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="font-mono-tech text-[10px] font-bold text-[#E50914] uppercase truncate">
                          {item.genre}
                        </div>
                        <div className="font-display-brutal text-xs uppercase text-[#111] line-clamp-2 min-h-[2rem] mt-0.5 leading-tight">
                          {item.title}
                        </div>
                        <div className="text-[11px] font-semibold text-[#444] truncate">
                          {item.author}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </main>
      )}

      {/* =====================================================================
          PAGE 2: BROWSE LIBRARY (`/catalog`)
         ===================================================================== */}
      {activePage === 'catalog' && (
        <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">
          <div className="bg-metal-plate border-[3px] border-[#111] p-6 shadow-brutal-lg">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-2 border-[#111]">
              <div>
                <h1 className="font-display-brutal text-2xl sm:text-4xl uppercase text-[#111]">
                  Browse Library
                </h1>
                <p className="text-xs sm:text-sm font-semibold text-[#333] mt-1">
                  Search by title, author, or genre. Click any book to read or listen.
                </p>
              </div>

              <form onSubmit={handleDynamicSearchSubmit} className="flex gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search books or authors..."
                  className="w-full sm:w-80 px-3 py-2 bg-white border-2 border-[#111] text-xs sm:text-sm font-medium"
                />
                <button
                  type="submit"
                  disabled={isSearchingApi}
                  className="px-4 py-2 bg-[#111] text-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase cursor-pointer shrink-0"
                >
                  {isSearchingApi ? 'Searching...' : 'Search'}
                </button>
              </form>
            </div>

            {/* Genre Filter Bar */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {GENRE_CATEGORIES.map((g) => {
                const active = selectedGenre === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setSelectedGenre(g.id);
                      setCatalogPage(1);
                    }}
                    className={`px-3 py-1.5 border-2 border-[#111] font-mono-tech text-xs font-bold cursor-pointer ${
                      active
                        ? 'bg-[#111] text-[#F6C90E] shadow-brutal-sm'
                        : 'bg-white text-[#111] hover:bg-[#F6C90E]/30'
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Catalog Grid */}
          <div className="bg-reader-paper border-[3px] border-[#111] p-5 shadow-brutal-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b-2 border-[#111]">
              <span className="font-display-brutal text-sm uppercase">
                {filteredArchiveBooks.length} Books
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={catalogPage <= 1 || isSearchingApi}
                  onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 bg-white border-2 border-[#111] font-mono-tech text-xs font-bold cursor-pointer disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="font-mono-tech text-xs font-bold px-2">
                  Page {catalogPage}
                </span>
                <button
                  type="button"
                  disabled={isSearchingApi}
                  onClick={() => setCatalogPage((p) => p + 1)}
                  className="px-3 py-1 bg-[#F6C90E] border-2 border-[#111] font-mono-tech text-xs font-bold cursor-pointer"
                >
                  Load More Books →
                </button>
              </div>
            </div>

            {isSearchingApi && filteredArchiveBooks.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 font-mono-tech text-sm">
                <Loader2 className="w-8 h-8 animate-spin text-[#E50914]" />
                <span>Loading books...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {filteredArchiveBooks.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleOpenCatalogVolume(item, 'compact')}
                    className="text-left bg-white border-[3px] border-[#111] shadow-brutal-sm hover:-translate-y-1 transition-transform cursor-pointer flex flex-col justify-between overflow-hidden group"
                  >
                    <div className="w-full aspect-[2/3] border-b-2 border-[#111] relative bg-[#18181B] overflow-hidden">
                      <BookPosterCover
                        title={item.title}
                        author={item.author}
                        coverUrl={item.coverUrl}
                      />
                    </div>

                    <div className="p-2.5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="font-mono-tech text-[10px] font-bold text-[#0047FF] uppercase truncate">
                          {item.genre}
                        </div>
                        <div className="font-display-brutal text-xs uppercase text-[#111] line-clamp-2 min-h-[2rem] mt-0.5 leading-tight">
                          {item.title}
                        </div>
                        <div className="text-[11px] font-semibold text-[#444] truncate mt-0.5">
                          {item.author}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* =====================================================================
          PAGE 3: READER (`/reader`)
         ===================================================================== */}
      {activePage === 'reader' && (
        <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 flex-1">
          <ReaderWorkspace
            book={activeBook}
            activeMode={activeMode}
            onSelectMode={setActiveMode}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onUpdateBookChapter={handleUpdateBookChapter}
            onHydrateGutenbergChapters={handleHydrateGutenbergChapters}
            onOpenSettingsTab={() => navigateToPage('voices')}
            onBackToCatalog={() => navigateToPage('home')}
          />
        </main>
      )}

      {/* =====================================================================
          PAGE 4: UPLOAD BOOK (`/press`)
         ===================================================================== */}
      {activePage === 'press' && (
        <main className="max-w-[960px] w-full mx-auto px-4 sm:px-6 py-8 flex-1">
          <div className="bg-pocket-red border-[3px] border-[#111] shadow-brutal-lg p-5 sm:p-6">
            <div className="border-2 border-dashed border-[#111]/60 p-5 sm:p-6 bg-white/95">
              <form onSubmit={handleCreateUploadedBook} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-[#111] pb-3">
                  <div>
                    <h1 className="font-display-brutal text-2xl sm:text-3xl uppercase text-[#111]">
                      Upload Your Book
                    </h1>
                    <p className="text-xs sm:text-sm text-[#444] mt-1">
                      Upload an EPUB, PDF, or TXT file to read chapter-by-chapter summaries, highlights, and audio.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLoadSampleBook}
                    className="px-3.5 py-2 bg-[#F6C90E] border-2 border-[#111] shadow-brutal-sm font-display-brutal text-xs uppercase cursor-pointer hover:bg-[#FFE047]"
                  >
                    Try Sample Book
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 p-3.5 bg-[#F3EFE6] border-2 border-[#111]">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".epub,.pdf,.txt,.md"
                    onChange={handleFileChange}
                    className="hidden"
                    id="book-file-upload-page"
                  />
                  <label
                    htmlFor="book-file-upload-page"
                    className="px-4 py-2 bg-[#0047FF] text-white border-2 border-[#111] shadow-brutal-sm font-display-brutal text-xs uppercase flex items-center gap-2 cursor-pointer hover:bg-[#0039CC]"
                  >
                    <FileUp className="w-4 h-4" />
                    <span>Choose File (.EPUB, .PDF, .TXT)</span>
                  </label>
                  {uploadedFileName && (
                    <span className="font-mono-tech text-xs font-bold text-[#059669]">
                      Selected: {uploadedFileName}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      className="w-full px-3 py-2 bg-white border-2 border-[#111] text-sm font-medium focus:outline-none focus:bg-[#F6C90E]/15"
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
                      className="w-full px-3 py-2 bg-white border-2 border-[#111] text-sm font-medium focus:outline-none focus:bg-[#F6C90E]/15"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="upload-book-manuscript"
                    className="block font-mono-tech text-xs font-bold uppercase mb-1"
                  >
                    Book Text (Auto-filled from file or paste below) *
                  </label>
                  <textarea
                    id="upload-book-manuscript"
                    rows={7}
                    value={uploadRawText}
                    onChange={(e) => setUploadRawText(e.target.value)}
                    placeholder="Choose a file above, click 'Try Sample Book', or paste chapters here..."
                    className="w-full p-3 bg-white border-2 border-[#111] text-xs font-mono-tech focus:outline-none"
                  />
                </div>

                {uploadError && (
                  <div
                    role="alert"
                    className="p-3 bg-[#E50914] text-white font-mono-tech text-xs font-bold border-2 border-[#111]"
                  >
                    {uploadError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isProcessingUpload}
                  className="w-full py-3 bg-[#111] text-[#F6C90E] hover:bg-[#222] font-display-brutal text-sm uppercase border-2 border-[#111] shadow-brutal cursor-pointer disabled:opacity-50"
                >
                  {isProcessingUpload ? 'Adding Book...' : 'Open Book in Reader →'}
                </button>
              </form>
            </div>
          </div>
        </main>
      )}

      {/* =====================================================================
          PAGE 5: VOICES (`/voices`)
         ===================================================================== */}
      {activePage === 'voices' && (
        <main className="max-w-[1140px] w-full mx-auto px-4 sm:px-6 py-8 flex-1 space-y-6">
          <div className="bg-pocket-red border-[3px] border-[#111] shadow-brutal-lg p-5 sm:p-6">
            <div className="border-2 border-dashed border-[#111]/60 p-5 bg-white/95 space-y-6">
              <div className="border-b-[3px] border-[#111] pb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-display-brutal text-2xl sm:text-3xl uppercase text-[#111]">
                    Author &amp; Narrator Voices
                  </h1>
                  <p className="text-xs sm:text-sm text-[#444] mt-1">
                    Choose who summarizes your chapters and who narrates your audiobooks, or type your own custom personality.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigateToPage('reader')}
                  className="px-4 py-2 bg-[#111] text-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase cursor-pointer"
                >
                  Back to Reader →
                </button>
              </div>

              {/* 1. AUTHOR VOICE */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display-brutal text-sm uppercase flex items-center gap-2">
                    <PenTool className="w-4 h-4 text-[#E50914]" />
                    <span>Author Style (Written Summaries)</span>
                  </span>
                  <span className="font-mono-tech text-xs font-bold text-[#0047FF]">
                    Selected:{' '}
                    {settings.useCustomAuthor && settings.customAuthorTrait
                      ? settings.customAuthorTrait
                      : activeAuthorProfile.name}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                        onClick={() =>
                          handleUpdateSettings({
                            authorPersonality: pid,
                            useCustomAuthor: false,
                          })
                        }
                        className={`p-3 border-[3px] border-[#111] text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-[#F6C90E] shadow-brutal -translate-y-0.5'
                            : 'bg-white hover:bg-neutral-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-14 border-2 border-[#111] shrink-0 overflow-hidden">
                            <PersonaPortraitSvg personaId={pid} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-display-brutal text-sm uppercase truncate">
                              {p.name}
                            </div>
                            <div className="text-xs font-bold text-[#333] truncate">
                              {p.roleTitle}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-[#222] mt-2 leading-snug">
                          {p.tagline}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  aria-label="Custom Author Voice"
                  value={settings.customAuthorTrait}
                  onChange={(e) =>
                    handleUpdateSettings({
                      customAuthorTrait: e.target.value,
                      useCustomAuthor: e.target.value.trim().length > 0,
                    })
                  }
                  placeholder="Or type a custom author style (e.g., Sarcastic teacher, Cozy storyteller)..."
                  className="w-full px-3 py-2 bg-white border-2 border-[#111] text-xs sm:text-sm font-medium"
                />
              </div>

              {/* 2. NARRATOR VOICE */}
              <div className="space-y-3 pt-4 border-t-2 border-[#111]/20">
                <div className="flex items-center justify-between">
                  <span className="font-display-brutal text-sm uppercase flex items-center gap-2">
                    <Mic className="w-4 h-4 text-[#0047FF]" />
                    <span>Narrator Voice (Audiobooks)</span>
                  </span>
                  <span className="font-mono-tech text-xs font-bold text-[#E50914]">
                    Selected:{' '}
                    {settings.useCustomNarrator && settings.customNarratorTrait
                      ? settings.customNarratorTrait
                      : activeNarratorProfile.name}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                        onClick={() =>
                          handleUpdateSettings({
                            narratorPersonality: pid,
                            useCustomNarrator: false,
                          })
                        }
                        className={`p-3 border-[3px] border-[#111] text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-[#0047FF] text-white shadow-brutal -translate-y-0.5'
                            : 'bg-white text-[#111] hover:bg-neutral-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-14 border-2 border-[#111] shrink-0 overflow-hidden">
                            <PersonaPortraitSvg personaId={pid} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-display-brutal text-sm uppercase truncate">
                              {p.name}
                            </div>
                            <div className="text-xs opacity-90 truncate">
                              Voice: {p.ttsVoiceName}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs opacity-90 mt-2 leading-snug">
                          {p.narratorStylePrompt}
                        </p>
                      </button>
                    );
                  })}
                </div>

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
                  placeholder="Or type a custom narrator style (e.g., Calm narrator, Late-night host)..."
                  className="w-full px-3 py-2 bg-white border-2 border-[#111] text-xs sm:text-sm font-medium"
                />
              </div>
            </div>
          </div>
        </main>
      )}

      <DotFooter appName="The Readers Club" navItems={navItems} onNavigate={navigateToPage} />

      <OfflineIndicator />
    </div>
  );
}
