import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  AudioEngineStatus,
  BookChapter,
  BookItem,
  BookReadingProgress,
  BulletScope,
  ChapterSummaryMetadata,
  ClubSettings,
  PresetPersonalityId,
  ReaderContentWidth,
  ReaderFontFamily,
  ReaderFontSize,
  ReaderLineHeight,
  ReaderParagraphSpacing,
  ReadingTheme,
  SummaryDetailLevel,
  SummaryMode,
  TtsAudioChunk,
} from '../types/book';
import {
  PERSONALITY_PROFILES,
  applyPersonaVoiceToParagraphs,
  buildSummaryCacheKey,
  computeContentHash,
} from '../utils/bookLogic';
import {
  chunkTextForTts,
  deriveAudioEngineStatus,
  generateSingleTtsChunkWithRetry,
  isAudiobookReady,
  revokeAllTrackedAudioObjectUrls,
  revokeTrackedAudioObjectUrl,
} from '../utils/ttsEngine';
import { CachedSummaryEntry } from '../utils/storage';
import { BookPosterCover, PersonaPortraitSvg } from './TactileArt';
import {
  BookOpen,
  FileText,
  Zap,
  ListChecks,
  Headphones,
  Sparkles,
  Volume2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sliders,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Loader2,
  ShieldCheck,
  Database,
  FileWarning,
  Maximize2,
  Minimize2,
  Type,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';

interface ReaderWorkspaceProps {
  book: BookItem;
  activeMode: SummaryMode;
  onSelectMode: (mode: SummaryMode) => void;
  settings: ClubSettings;
  onUpdateSettings: (next: Partial<ClubSettings>) => void;
  onUpdateBookChapter: (
    bookId: string,
    chapterId: string,
    personaKey: string,
    compactText: string[],
    bulletPoints: string[],
    metadata?: ChapterSummaryMetadata
  ) => void;
  onMarkChapterSummaryFailed?: (
    bookId: string,
    chapterId: string,
    errorMessage: string
  ) => void;
  onHydrateGutenbergChapters?: (
    bookId: string,
    extracted: Array<{ number: number; title: string; originalText: string[] }>
  ) => void;
  onMarkGutenbergExtractionFailed?: (
    bookId: string,
    errorMessage: string
  ) => void;
  readingProgress?: BookReadingProgress;
  onUpdateReadingProgress?: (
    bookId: string,
    update: Partial<BookReadingProgress>
  ) => void;
  summaryCache?: Record<string, CachedSummaryEntry>;
  onOpenSettingsTab: () => void;
  onOpenUploadTab?: () => void;
  onBackToCatalog?: () => void;
  canRemoveFromLibrary?: boolean;
  onRemoveBookFromLibrary?: (bookId: string) => void;
  focusMode?: boolean;
  onToggleFocusMode?: (nextFocus: boolean) => void;
}

const FONT_SIZE_MAP: Record<ReaderFontSize, string> = {
  sm: '0.95rem',
  md: '1.08rem',
  lg: '1.22rem',
  xl: '1.38rem',
};

const LINE_HEIGHT_MAP: Record<ReaderLineHeight, number> = {
  snug: 1.6,
  relaxed: 1.82,
  loose: 2.05,
};

const PARAGRAPH_SPACING_MAP: Record<ReaderParagraphSpacing, string> = {
  compact: '0.85em',
  normal: '1.3em',
  roomy: '1.8em',
};

const CONTENT_WIDTH_MAP: Record<ReaderContentWidth, string> = {
  narrow: '54ch',
  comfortable: '66ch',
  wide: '78ch',
};

export const ReaderWorkspace: React.FC<ReaderWorkspaceProps> = ({
  book,
  activeMode,
  onSelectMode,
  settings,
  onUpdateSettings,
  onUpdateBookChapter,
  onMarkChapterSummaryFailed,
  onHydrateGutenbergChapters,
  onMarkGutenbergExtractionFailed,
  readingProgress,
  onUpdateReadingProgress,
  summaryCache = {},
  onOpenSettingsTab,
  onOpenUploadTab,
  onBackToCatalog,
  canRemoveFromLibrary = false,
  onRemoveBookFromLibrary,
  focusMode: controlledFocusMode,
  onToggleFocusMode,
}) => {
  const initialChapterIdx =
    readingProgress &&
    readingProgress.lastChapterIndex >= 0 &&
    readingProgress.lastChapterIndex < Math.max(1, book.chapters.length)
      ? readingProgress.lastChapterIndex
      : 0;

  const [selectedChapterIdx, setSelectedChapterIdx] =
    useState<number>(initialChapterIdx);
  const [bulletScope, setBulletScope] = useState<BulletScope>('chapter');
  const [internalFocusMode, setInternalFocusMode] = useState(false);

  const focusMode =
    controlledFocusMode !== undefined ? controlledFocusMode : internalFocusMode;

  const [isTypographyOpen, setIsTypographyOpen] = useState(false);
  const [isMobileChaptersOpen, setIsMobileChaptersOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isMobilePrefsOpen, setIsMobilePrefsOpen] = useState(false);
  const [confirmOverwriteChapterId, setConfirmOverwriteChapterId] = useState<
    string | null
  >(null);

  // Focus mode toolbar auto-hide on reading inactivity
  const [isFocusToolbarVisible, setIsFocusToolbarVisible] = useState(true);
  const focusToolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Scroll & reading progress preservation across normal <-> focus transitions
  const readerSectionRef = useRef<HTMLElement | null>(null);
  const readingProseRef = useRef<HTMLDivElement | null>(null);
  const savedScrollStateRef = useRef<{
    anchorIndex: number;
    anchorOffsetRatio: number;
    scrollRatio: number;
  }>({
    anchorIndex: 0,
    anchorOffsetRatio: 0,
    scrollRatio: readingProgress?.scrollRatio || 0,
  });
  const [chapterScrollPercent, setChapterScrollPercent] = useState<number>(0);

  const [isAiRewriting, setIsAiRewriting] = useState(false);
  const [isBatchCompressing, setIsBatchCompressing] = useState(false);
  const [aiStatusBanner, setAiStatusBanner] = useState<string | null>(null);
  const [aiErrorBanner, setAiErrorBanner] = useState<string | null>(null);
  const [isLoadingGutenbergText, setIsLoadingGutenbergText] = useState(false);
  const [gutenbergFetchError, setGutenbergFetchError] = useState<string | null>(
    null
  );

  // Long-form Chunked Audiobook State
  const [ttsChunks, setTtsChunks] = useState<TtsAudioChunk[]>([]);
  const [activeChunkIdx, setActiveChunkIdx] = useState<number>(
    readingProgress?.audioChunkIndex || 0
  );
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isPausedAudio, setIsPausedAudio] = useState(false);
  const [usingBrowserSpeechFallback, setUsingBrowserSpeechFallback] =
    useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [audioPlaybackSeconds, setAudioPlaybackSeconds] = useState<number>(
    readingProgress?.audioPlaybackSeconds || 0
  );

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsChunksRef = useRef<TtsAudioChunk[]>([]);
  const ttsSessionIdRef = useRef<number>(0);
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const summaryAbortControllerRef = useRef<AbortController | null>(null);
  const lookaheadAbortControllerRef = useRef<AbortController | null>(null);
  const [smartLookaheadBookId, setSmartLookaheadBookId] = useState<
    string | null
  >(null);
  const [lookaheadChapterNum, setLookaheadChapterNum] = useState<number | null>(
    null
  );
  ttsChunksRef.current = ttsChunks;

  const activeTheme: ReadingTheme = settings.readingTheme || 'paper';
  const fontSize: ReaderFontSize = settings.readerFontSize || 'md';
  const lineHeight: ReaderLineHeight = settings.readerLineHeight || 'relaxed';
  const paragraphSpacing: ReaderParagraphSpacing =
    settings.readerParagraphSpacing || 'normal';
  const contentWidth: ReaderContentWidth =
    settings.readerContentWidth || 'comfortable';
  const fontFamily: ReaderFontFamily = settings.readerFontFamily || 'serif';
  const detailLevel: SummaryDetailLevel =
    settings.summaryDetailLevel || 'compact';

  // Capture current reading scroll position before toggling focus mode
  function captureCurrentReadingPosition() {
    if (typeof window === 'undefined') return;
    const proseEl = readingProseRef.current;
    const sectionEl = readerSectionRef.current;

    let scrollRatio = savedScrollStateRef.current.scrollRatio;
    if (focusMode && sectionEl) {
      const maxScroll = Math.max(
        1,
        sectionEl.scrollHeight - sectionEl.clientHeight
      );
      if (sectionEl.scrollTop > 0) {
        scrollRatio = Math.max(0, Math.min(1, sectionEl.scrollTop / maxScroll));
      }
    } else {
      const docMax = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight
      );
      if (window.scrollY > 0) {
        scrollRatio = Math.max(0, Math.min(1, window.scrollY / docMax));
      }
    }

    let anchorIndex = 0;
    let anchorOffsetRatio = 0;
    if (proseEl) {
      const blocks = Array.from(proseEl.children) as HTMLElement[];
      const referenceTop = 72;
      for (let i = 0; i < blocks.length; i++) {
        const rect = blocks[i].getBoundingClientRect();
        if (rect.bottom > referenceTop) {
          anchorIndex = i;
          anchorOffsetRatio =
            rect.height > 0
              ? Math.max(
                  0,
                  Math.min(1, (referenceTop - rect.top) / rect.height)
                )
              : 0;
          break;
        }
      }
    }

    savedScrollStateRef.current = {
      anchorIndex,
      anchorOffsetRatio,
      scrollRatio,
    };
  }

  function handleSetFocusMode(nextFocus: boolean) {
    captureCurrentReadingPosition();
    setIsTypographyOpen(false);
    setIsFocusToolbarVisible(true);
    if (onToggleFocusMode) {
      onToggleFocusMode(nextFocus);
    } else {
      setInternalFocusMode(nextFocus);
    }
  }

  // Restore scroll position seamlessly when entering or leaving focus mode
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const { anchorIndex, anchorOffsetRatio, scrollRatio } =
      savedScrollStateRef.current;
    const proseEl = readingProseRef.current;
    const sectionEl = readerSectionRef.current;

    if (focusMode && sectionEl) {
      if (proseEl && proseEl.children[anchorIndex] && anchorIndex > 0) {
        const targetBlock = proseEl.children[anchorIndex] as HTMLElement;
        const targetTop =
          targetBlock.offsetTop +
          targetBlock.offsetHeight * anchorOffsetRatio -
          68;
        sectionEl.scrollTop = Math.max(0, targetTop);
      } else if (scrollRatio > 0) {
        const maxScroll = Math.max(
          0,
          sectionEl.scrollHeight - sectionEl.clientHeight
        );
        sectionEl.scrollTop = Math.round(scrollRatio * maxScroll);
      }
    } else if (!focusMode) {
      if (proseEl && proseEl.children[anchorIndex] && anchorIndex > 0) {
        const targetBlock = proseEl.children[anchorIndex] as HTMLElement;
        const rect = targetBlock.getBoundingClientRect();
        const absoluteTop =
          window.scrollY +
          rect.top +
          rect.height * anchorOffsetRatio -
          84;
        window.scrollTo({ top: Math.max(0, absoluteTop), behavior: 'instant' as ScrollBehavior });
      } else if (scrollRatio > 0) {
        const docMax = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight
        );
        window.scrollTo({
          top: Math.round(scrollRatio * docMax),
          behavior: 'instant' as ScrollBehavior,
        });
      }
    }
  }, [focusMode]);

  // Escape key exits focus mode (or closes open popover first if desired, then exits focus mode)
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsTypographyOpen(false);
        captureCurrentReadingPosition();
        if (onToggleFocusMode) {
          onToggleFocusMode(false);
        } else {
          setInternalFocusMode(false);
        }
      } else {
        setIsFocusToolbarVisible(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode, onToggleFocusMode]);

  // Auto-hide focus mode toolbar after 3.5s of reading inactivity; show on mouse/touch/keyboard activity
  useEffect(() => {
    if (!focusMode) {
      setIsFocusToolbarVisible(true);
      if (focusToolbarTimerRef.current) {
        clearTimeout(focusToolbarTimerRef.current);
      }
      return;
    }

    const scheduleHide = () => {
      if (focusToolbarTimerRef.current) {
        clearTimeout(focusToolbarTimerRef.current);
      }
      if (isTypographyOpen) {
        setIsFocusToolbarVisible(true);
        return;
      }
      focusToolbarTimerRef.current = setTimeout(() => {
        setIsFocusToolbarVisible(false);
      }, 3500);
    };

    const handleUserActivity = () => {
      setIsFocusToolbarVisible(true);
      scheduleHide();
    };

    scheduleHide();
    window.addEventListener('mousemove', handleUserActivity, { passive: true });
    window.addEventListener('touchstart', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity);

    return () => {
      if (focusToolbarTimerRef.current) {
        clearTimeout(focusToolbarTimerRef.current);
      }
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
    };
  }, [focusMode, isTypographyOpen]);

  // Track scroll depth inside focus mode or window
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateScrollMetrics = () => {
      const sectionEl = readerSectionRef.current;
      const proseEl = readingProseRef.current;

      if (focusMode && sectionEl) {
        const maxScroll = Math.max(
          1,
          sectionEl.scrollHeight - sectionEl.clientHeight
        );
        const ratio = Math.max(
          0,
          Math.min(1, sectionEl.scrollTop / maxScroll)
        );
        setChapterScrollPercent(Math.round(ratio * 100));
        savedScrollStateRef.current.scrollRatio = ratio;
      } else if (proseEl) {
        const rect = proseEl.getBoundingClientRect();
        const viewHeight = window.innerHeight;
        if (rect.height <= viewHeight) {
          setChapterScrollPercent(100);
        } else {
          const scrolled = Math.max(0, viewHeight * 0.65 - rect.top);
          const pct = Math.max(
            0,
            Math.min(100, Math.round((scrolled / rect.height) * 100))
          );
          setChapterScrollPercent(pct);
        }
        const docMax = Math.max(
          1,
          document.documentElement.scrollHeight - window.innerHeight
        );
        savedScrollStateRef.current.scrollRatio = Math.max(
          0,
          Math.min(1, window.scrollY / docMax)
        );
      }

      if (proseEl) {
        const blocks = Array.from(proseEl.children) as HTMLElement[];
        for (let i = 0; i < blocks.length; i++) {
          const r = blocks[i].getBoundingClientRect();
          if (r.bottom > 72) {
            savedScrollStateRef.current.anchorIndex = i;
            savedScrollStateRef.current.anchorOffsetRatio =
              r.height > 0
                ? Math.max(0, Math.min(1, (72 - r.top) / r.height))
                : 0;
            break;
          }
        }
      }
    };

    const sectionEl = readerSectionRef.current;
    updateScrollMetrics();
    window.addEventListener('scroll', updateScrollMetrics, { passive: true });
    sectionEl?.addEventListener('scroll', updateScrollMetrics, {
      passive: true,
    });
    return () => {
      window.removeEventListener('scroll', updateScrollMetrics);
      sectionEl?.removeEventListener('scroll', updateScrollMetrics);
    };
  }, [focusMode, selectedChapterIdx, activeMode]);

  // Fetch authentic Project Gutenberg chapters when opening a Gutendex book
  const fetchGutenbergManuscript = async () => {
    if (!book.gutenbergId || !onHydrateGutenbergChapters) return;
    setIsLoadingGutenbergText(true);
    setGutenbergFetchError(null);
    try {
      const r = await fetch(
        `/api/books/gutenberg-chapters?gutenbergId=${book.gutenbergId}`
      );
      const data = await r.json().catch(() => null);
      if (
        r.ok &&
        data &&
        Array.isArray(data.chapters) &&
        data.chapters.length > 0
      ) {
        onHydrateGutenbergChapters(book.id, data.chapters);
      } else {
        const errMsg =
          data?.message ||
          `Could not retrieve Project Gutenberg manuscript #${book.gutenbergId}.`;
        setGutenbergFetchError(errMsg);
        onMarkGutenbergExtractionFailed?.(book.id, errMsg);
      }
    } catch {
      const errMsg = `Network error while retrieving Project Gutenberg manuscript #${book.gutenbergId}.`;
      setGutenbergFetchError(errMsg);
      onMarkGutenbergExtractionFailed?.(book.id, errMsg);
    } finally {
      setIsLoadingGutenbergText(false);
    }
  };

  useEffect(() => {
    const savedChap =
      readingProgress &&
      readingProgress.lastChapterIndex >= 0 &&
      readingProgress.lastChapterIndex < Math.max(1, book.chapters.length)
        ? readingProgress.lastChapterIndex
        : 0;
    setSelectedChapterIdx(savedChap);
    setAiErrorBanner(null);
    setAiStatusBanner(null);
    setGutenbergFetchError(null);
    setConfirmOverwriteChapterId(null);
    summaryAbortControllerRef.current?.abort();
    summaryAbortControllerRef.current = null;
    lookaheadAbortControllerRef.current?.abort();
    lookaheadAbortControllerRef.current = null;
    setLookaheadChapterNum(null);
    stopAndCleanupAudio(true);

    if (
      book.gutenbergId &&
      book.isPreCompressed === false &&
      book.chapters.length === 0
    ) {
      void fetchGutenbergManuscript();
    }
  }, [book.id]);

  useEffect(() => {
    return () => {
      summaryAbortControllerRef.current?.abort();
      summaryAbortControllerRef.current = null;
      lookaheadAbortControllerRef.current?.abort();
      lookaheadAbortControllerRef.current = null;
      stopAndCleanupAudio(true);
    };
  }, []);

  const currentChapter: BookChapter | undefined =
    book.chapters[selectedChapterIdx] || book.chapters[0];

  // Persist chapter selection & mode changes
  useEffect(() => {
    if (!currentChapter) return;
    setConfirmOverwriteChapterId(null);
    onUpdateReadingProgress?.(book.id, {
      lastChapterIndex: selectedChapterIdx,
      lastSummaryMode: activeMode,
    });
  }, [selectedChapterIdx, activeMode, book.id]);

  // Reset TTS chunk queue when chapter or narrator voice changes
  useEffect(() => {
    stopAndCleanupAudio(true);
  }, [
    selectedChapterIdx,
    settings.narratorPersonality,
    settings.customNarratorTrait,
    settings.useCustomNarrator,
  ]);

  const authorProfile = PERSONALITY_PROFILES[settings.authorPersonality];
  const narratorProfile = PERSONALITY_PROFILES[settings.narratorPersonality];

  const activeAuthorDisplayName =
    settings.useCustomAuthor && settings.customAuthorTrait.trim()
      ? settings.customAuthorTrait.trim()
      : authorProfile.name;

  const activeNarratorDisplayName =
    settings.useCustomNarrator && settings.customNarratorTrait.trim()
      ? settings.customNarratorTrait.trim()
      : narratorProfile.name;

  const personaCacheKey =
    settings.useCustomAuthor && settings.customAuthorTrait.trim()
      ? `custom:${settings.customAuthorTrait.trim()}::${detailLevel}`
      : `${settings.authorPersonality}::${detailLevel}`;

  function isChapterCompressed(ch?: BookChapter): boolean {
    if (!ch) return false;
    if (ch.summaryStatus === 'failed') return false;
    if (book.isPreCompressed !== false) return true;
    if (ch.personaCompactCache?.[personaCacheKey]?.length) return true;
    if (ch.personaCompactCache?.[settings.authorPersonality]?.length) return true;
    return Boolean(
      ch.isCompressed && ch.compactText && ch.compactText.length > 0
    );
  }

  const currentChapterIsCompressed = isChapterCompressed(currentChapter);

  const compressedChaptersCount = book.chapters.filter((ch) =>
    isChapterCompressed(ch)
  ).length;

  const displayedCompactParagraphs =
    currentChapter && currentChapterIsCompressed
      ? currentChapter.personaCompactCache?.[personaCacheKey] ||
        currentChapter.personaCompactCache?.[settings.authorPersonality] ||
        (book.isPreCompressed !== false
          ? applyPersonaVoiceToParagraphs(
              currentChapter.compactText,
              settings.authorPersonality,
              currentChapter.title,
              settings.useCustomAuthor ? settings.customAuthorTrait : undefined
            )
          : currentChapter.compactText)
      : [];

  const displayedChapterBullets =
    currentChapter && currentChapterIsCompressed
      ? currentChapter.personaBulletCache?.[personaCacheKey] ||
        currentChapter.personaBulletCache?.[settings.authorPersonality] ||
        currentChapter.bulletPoints
      : [];

  function stopAndCleanupAudio(clearChunks = false) {
    ttsSessionIdRef.current += 1;
    if (ttsAbortControllerRef.current) {
      ttsAbortControllerRef.current.abort();
      ttsAbortControllerRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.onended = null;
      audioElementRef.current.ontimeupdate = null;
      audioElementRef.current.pause();
      try {
        audioElementRef.current.removeAttribute('src');
      } catch {
        // Ignore in non-DOM environments
      }
      audioElementRef.current = null;
    }
    if (speechSynthRef.current) {
      speechSynthRef.current.onend = null;
      speechSynthRef.current.onerror = null;
      speechSynthRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setIsPausedAudio(false);
    if (clearChunks) {
      revokeAllTrackedAudioObjectUrls(ttsChunksRef.current);
      setTtsChunks([]);
      setActiveChunkIdx(0);
      setAudioPlaybackSeconds(0);
      setUsingBrowserSpeechFallback(false);
    }
  }

  async function compressSpecificChapter(
    targetChapter: BookChapter,
    bypassClientCache = false,
    options?: { silent?: boolean; signal?: AbortSignal }
  ): Promise<boolean> {
    const isSilent = Boolean(options?.silent);
    const stylePrompt =
      settings.useCustomAuthor && settings.customAuthorTrait.trim()
        ? `Summarize with the personality of: ${settings.customAuthorTrait.trim()}. Keep all chapter facts, names, and narrative chronology intact.`
        : authorProfile.authorStylePrompt;

    const chapterContentHash = computeContentHash(
      targetChapter.originalText.join('\n\n')
    );
    const localCacheKey = buildSummaryCacheKey({
      contentHash: chapterContentHash,
      chapterId: targetChapter.id,
      model: 'gemini-3.8-flash',
      personaId: settings.authorPersonality,
      detailLevel,
      targetPages: targetChapter.compactPages,
      customTrait: settings.useCustomAuthor
        ? settings.customAuthorTrait
        : undefined,
    });

    // 1. Check persisted client-side summary cache first (unless explicitly regenerating)
    const cachedEntry = !bypassClientCache ? summaryCache[localCacheKey] : null;
    if (
      cachedEntry &&
      Array.isArray(cachedEntry.compactText) &&
      cachedEntry.compactText.length > 0
    ) {
      onUpdateBookChapter(
        book.id,
        targetChapter.id,
        personaCacheKey,
        cachedEntry.compactText,
        cachedEntry.bulletPoints,
        {
          ...cachedEntry.metadata,
          status: 'cached',
        }
      );
      return true;
    }

    // 2. Request genuine AI summary from backend with AbortController support
    let activeSignal = options?.signal;
    let localController: AbortController | null = null;
    if (!activeSignal) {
      summaryAbortControllerRef.current?.abort();
      localController = new AbortController();
      summaryAbortControllerRef.current = localController;
      activeSignal = localController.signal;
    }

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: book.title,
          chapterId: targetChapter.id,
          chapterTitle: targetChapter.title,
          chapterNumber: targetChapter.number,
          totalChapters: book.chapters.length,
          originalText: targetChapter.originalText,
          originalPages: targetChapter.originalPages,
          targetCompactPages: targetChapter.compactPages,
          detailLevel,
          authorPersonaId: settings.authorPersonality,
          authorPersonaName: activeAuthorDisplayName,
          authorStylePrompt: stylePrompt,
          contentHash: chapterContentHash,
        }),
        signal: activeSignal,
      });

      if (activeSignal.aborted) {
        return false;
      }

      const data = await response.json().catch(() => ({}));

      if (
        response.ok &&
        Array.isArray(data.compactText) &&
        data.compactText.length > 0
      ) {
        const metadata: ChapterSummaryMetadata = data.metadata || {
          status: 'ai_generated',
          model: 'gemini-3.8-flash',
          generatedAt: new Date().toISOString(),
          contentHash: chapterContentHash,
          detailLevel,
        };

        onUpdateBookChapter(
          book.id,
          targetChapter.id,
          personaCacheKey,
          data.compactText,
          Array.isArray(data.bulletPoints) && data.bulletPoints.length > 0
            ? data.bulletPoints
            : [],
          metadata
        );
        return true;
      }

      if (isSilent) {
        return false;
      }

      // Honest failure handling: NEVER mark chapter as compressed or substitute fake AI text
      const errorMsg =
        data?.message ||
        data?.error ||
        `AI summarization failed with HTTP ${response.status}.`;
      setAiErrorBanner(errorMsg);
      onMarkChapterSummaryFailed?.(book.id, targetChapter.id, errorMsg);
      return false;
    } catch (err: unknown) {
      if (
        activeSignal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return false;
      }
      if (isSilent) {
        return false;
      }
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Network error while contacting AI summarization service.';
      setAiErrorBanner(errorMsg);
      onMarkChapterSummaryFailed?.(book.id, targetChapter.id, errorMsg);
      return false;
    }
  }

  // Smart Rolling Lookahead: Once the user initiates summarization on a book,
  // automatically pre-summarize the next 3 chapters ahead of the active chapter in the background
  // without burning tokens on the entire book at once.
  const LOOKAHEAD_CHAPTER_COUNT = 3;
  useEffect(() => {
    if (
      smartLookaheadBookId !== book.id ||
      isAiRewriting ||
      isBatchCompressing ||
      lookaheadChapterNum !== null
    ) {
      return;
    }

    const windowSlice = book.chapters.slice(
      selectedChapterIdx + 1,
      selectedChapterIdx + 1 + LOOKAHEAD_CHAPTER_COUNT
    );
    const nextUncompressed = windowSlice.find(
      (ch) =>
        (!isChapterCompressed(ch) ||
          !ch.personaCompactCache?.[personaCacheKey]?.length) &&
        ch.summaryStatus !== 'failed'
    );

    if (!nextUncompressed) {
      return;
    }

    const controller = new AbortController();
    lookaheadAbortControllerRef.current = controller;
    setLookaheadChapterNum(nextUncompressed.number);

    void (async () => {
      const ok = await compressSpecificChapter(nextUncompressed, false, {
        silent: true,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setLookaheadChapterNum(null);
        if (!ok) {
          // Pause background lookahead if backend is offline or rate-limited
          setSmartLookaheadBookId(null);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    smartLookaheadBookId,
    book.id,
    book.chapters,
    selectedChapterIdx,
    isAiRewriting,
    isBatchCompressing,
    lookaheadChapterNum,
    personaCacheKey,
  ]);

  async function handleCompressCurrentChapter(forceRegenerate = false) {
    if (!currentChapter || isAiRewriting || isBatchCompressing) return;

    // Never silently overwrite an existing AI or curated summary without explicit confirmation
    const hasExistingPersonaSummary = Boolean(
      currentChapterIsCompressed ||
        currentChapter.personaCompactCache?.[personaCacheKey]?.length ||
        currentChapter.summaryStatus === 'ai_generated' ||
        currentChapter.summaryStatus === 'cached'
    );
    if (
      hasExistingPersonaSummary &&
      !forceRegenerate &&
      confirmOverwriteChapterId !== currentChapter.id
    ) {
      setConfirmOverwriteChapterId(currentChapter.id);
      return;
    }

    // Cancel any in-flight background lookahead while foreground chapter summarizes
    lookaheadAbortControllerRef.current?.abort();
    setLookaheadChapterNum(null);

    setConfirmOverwriteChapterId(null);
    setIsAiRewriting(true);
    setAiErrorBanner(null);
    setAiStatusBanner(
      `Summarizing Chapter ${currentChapter.number}: "${currentChapter.title}" (${activeAuthorDisplayName})...`
    );

    const ok = await compressSpecificChapter(currentChapter, forceRegenerate);

    if (ok) {
      // Activate smart rolling 3-chapter lookahead in the background for this book
      setSmartLookaheadBookId(book.id);
      setAiStatusBanner(
        `Chapter ${currentChapter.number} summary ready in ${activeAuthorDisplayName}'s voice. Smart Lookahead is pre-summarizing the next ${LOOKAHEAD_CHAPTER_COUNT} chapters in advance.`
      );
    } else {
      setAiStatusBanner(null);
    }
    setIsAiRewriting(false);
  }

  async function handleCompressAllChaptersSequentially() {
    if (isBatchCompressing || isAiRewriting) return;
    lookaheadAbortControllerRef.current?.abort();
    setLookaheadChapterNum(null);
    setSmartLookaheadBookId(null);
    setIsBatchCompressing(true);
    setAiErrorBanner(null);

    const missingCompressed = book.chapters.filter(
      (ch) =>
        !isChapterCompressed(ch) ||
        !ch.personaCompactCache?.[personaCacheKey]?.length
    );
    const uncompressedList =
      missingCompressed.length > 0 ? missingCompressed : book.chapters;
    let succeededCount = 0;

    for (let i = 0; i < uncompressedList.length; i++) {
      const ch = uncompressedList[i];
      setAiStatusBanner(
        `Summarizing Whole Book: Chapter ${ch.number} of ${book.chapters.length} ("${ch.title}")...`
      );
      const ok = await compressSpecificChapter(ch);
      if (!ok) {
        setAiStatusBanner(null);
        setIsBatchCompressing(false);
        return;
      }
      succeededCount++;
    }

    if (succeededCount > 0) {
      setAiStatusBanner(
        `Summarized all ${succeededCount} chapter${
          succeededCount === 1 ? '' : 's'
        } with verified AI output.`
      );
    }
    setIsBatchCompressing(false);
  }

  function getAudioSourceParagraphs(): string[] {
    if (!currentChapter) return [];
    if (displayedCompactParagraphs.length > 0) {
      return displayedCompactParagraphs;
    }
    return currentChapter.originalText || [];
  }

  async function handlePrepareAndPlayAudiobook(startFromChunkIdx = 0) {
    if (!currentChapter) return;
    setUsingBrowserSpeechFallback(false);

    const sourceParagraphs = getAudioSourceParagraphs();
    if (sourceParagraphs.length === 0) return;

    ttsAbortControllerRef.current?.abort();
    const controller = new AbortController();
    ttsAbortControllerRef.current = controller;
    const sessionId = ++ttsSessionIdRef.current;

    let workingChunks = [...ttsChunksRef.current];
    if (workingChunks.length === 0) {
      workingChunks = chunkTextForTts(sourceParagraphs, 720);
      setTtsChunks(workingChunks);
    }

    const narratorPrompt =
      settings.useCustomNarrator && settings.customNarratorTrait.trim()
        ? settings.customNarratorTrait.trim()
        : narratorProfile.narratorStylePrompt;

    for (let i = 0; i < workingChunks.length; i++) {
      if (ttsSessionIdRef.current !== sessionId || controller.signal.aborted) {
        return;
      }
      if (workingChunks[i].status === 'ready') continue;

      workingChunks = workingChunks.map((c, idx) =>
        idx === i ? { ...c, status: 'generating', errorMessage: undefined } : c
      );
      setTtsChunks([...workingChunks]);

      const generated = await generateSingleTtsChunkWithRetry({
        chunk: workingChunks[i],
        voiceName: narratorProfile.ttsVoiceName,
        narratorStylePrompt: narratorPrompt,
        maxRetries: 2,
        baseDelayMs: 350,
        signal: controller.signal,
      });

      if (ttsSessionIdRef.current !== sessionId || controller.signal.aborted) {
        if (generated.objectUrl) {
          revokeTrackedAudioObjectUrl(generated.objectUrl);
        }
        return;
      }

      workingChunks = workingChunks.map((c, idx) =>
        idx === i ? generated : c
      );
      setTtsChunks([...workingChunks]);

      if (generated.status === 'failed') {
        setIsPlayingAudio(false);
        return;
      }
    }

    if (
      ttsSessionIdRef.current === sessionId &&
      !controller.signal.aborted &&
      isAudiobookReady(workingChunks)
    ) {
      playReadyChunkAtIndex(workingChunks, startFromChunkIdx, sessionId);
    }
  }

  async function handleRetrySingleFailedChunk(chunkIndex: number) {
    const target = ttsChunksRef.current[chunkIndex];
    if (!target) return;

    ttsAbortControllerRef.current?.abort();
    const controller = new AbortController();
    ttsAbortControllerRef.current = controller;
    const sessionId = ++ttsSessionIdRef.current;

    const narratorPrompt =
      settings.useCustomNarrator && settings.customNarratorTrait.trim()
        ? settings.customNarratorTrait.trim()
        : narratorProfile.narratorStylePrompt;

    const markingGenerating = ttsChunksRef.current.map((c, idx) =>
      idx === chunkIndex
        ? { ...c, status: 'generating' as const, errorMessage: undefined }
        : c
    );
    setTtsChunks(markingGenerating);

    const retried = await generateSingleTtsChunkWithRetry({
      chunk: target,
      voiceName: narratorProfile.ttsVoiceName,
      narratorStylePrompt: narratorPrompt,
      maxRetries: 2,
      baseDelayMs: 350,
      signal: controller.signal,
    });

    if (ttsSessionIdRef.current !== sessionId || controller.signal.aborted) {
      if (retried.objectUrl) {
        revokeTrackedAudioObjectUrl(retried.objectUrl);
      }
      return;
    }

    const updated = ttsChunksRef.current.map((c, idx) =>
      idx === chunkIndex ? retried : c
    );
    setTtsChunks(updated);

    if (retried.status === 'ready') {
      const hasRemaining = updated.some(
        (c) => c.status === 'pending' || c.status === 'failed'
      );
      if (!hasRemaining && isAudiobookReady(updated)) {
        playReadyChunkAtIndex(updated, chunkIndex, sessionId);
      } else {
        await handlePrepareAndPlayAudiobook(chunkIndex);
      }
    }
  }

  function playReadyChunkAtIndex(
    chunksList: TtsAudioChunk[],
    idx: number,
    expectedSessionId = ttsSessionIdRef.current
  ) {
    if (expectedSessionId !== ttsSessionIdRef.current) return;
    const safeIdx = Math.max(0, Math.min(chunksList.length - 1, idx));
    const chunk = chunksList[safeIdx];
    if (!chunk || !chunk.objectUrl) return;

    if (audioElementRef.current) {
      audioElementRef.current.onended = null;
      audioElementRef.current.ontimeupdate = null;
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }

    const audio = new Audio(chunk.objectUrl);
    audio.playbackRate = playbackSpeed;
    audioElementRef.current = audio;
    setActiveChunkIdx(safeIdx);
    setIsPlayingAudio(true);
    setIsPausedAudio(false);

    audio.ontimeupdate = () => {
      if (expectedSessionId !== ttsSessionIdRef.current) return;
      const sec = Math.floor(audio.currentTime || 0);
      setAudioPlaybackSeconds(sec);
      onUpdateReadingProgress?.(book.id, {
        audioChunkIndex: safeIdx,
        audioPlaybackSeconds: sec,
      });
    };

    audio.onended = () => {
      if (expectedSessionId !== ttsSessionIdRef.current) return;
      if (safeIdx + 1 < chunksList.length) {
        playReadyChunkAtIndex(chunksList, safeIdx + 1, expectedSessionId);
      } else {
        setIsPlayingAudio(false);
        setIsPausedAudio(false);
      }
    };

    audio.play().catch(() => {
      if (expectedSessionId !== ttsSessionIdRef.current) return;
      setIsPlayingAudio(false);
      setIsPausedAudio(true);
    });
  }

  function handlePauseResumeAudio() {
    if (usingBrowserSpeechFallback) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        if (isPlayingAudio) {
          window.speechSynthesis.pause();
          setIsPlayingAudio(false);
          setIsPausedAudio(true);
        } else {
          window.speechSynthesis.resume();
          setIsPlayingAudio(true);
          setIsPausedAudio(false);
        }
      }
      return;
    }

    if (audioElementRef.current) {
      if (isPlayingAudio) {
        audioElementRef.current.pause();
        setIsPlayingAudio(false);
        setIsPausedAudio(true);
      } else {
        audioElementRef.current.play().catch(() => {});
        setIsPlayingAudio(true);
        setIsPausedAudio(false);
      }
      return;
    }

    void handlePrepareAndPlayAudiobook(activeChunkIdx);
  }

  function handlePlayBrowserSpeechSynthesis(startChunkIdx = 0) {
    stopAndCleanupAudio(false);
    const sessionId = ttsSessionIdRef.current;
    setUsingBrowserSpeechFallback(true);

    const sourceParagraphs = getAudioSourceParagraphs();
    let chunks = ttsChunksRef.current;
    if (chunks.length === 0) {
      chunks = chunkTextForTts(sourceParagraphs, 720);
      setTtsChunks(chunks);
    }

    const safeIdx = Math.max(0, Math.min(chunks.length - 1, startChunkIdx));
    const targetChunk = chunks[safeIdx];
    if (!targetChunk) return;

    setActiveChunkIdx(safeIdx);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(targetChunk.text);
      utterance.pitch = narratorProfile.speechPitch;
      utterance.rate = Number(
        (narratorProfile.speechRate * playbackSpeed).toFixed(2)
      );
      speechSynthRef.current = utterance;

      utterance.onend = () => {
        if (ttsSessionIdRef.current !== sessionId) return;
        if (safeIdx + 1 < chunks.length) {
          handlePlayBrowserSpeechSynthesis(safeIdx + 1);
        } else {
          setIsPlayingAudio(false);
          setIsPausedAudio(false);
        }
      };

      utterance.onerror = () => {
        if (ttsSessionIdRef.current !== sessionId) return;
        setIsPlayingAudio(false);
      };

      setIsPlayingAudio(true);
      setIsPausedAudio(false);
      window.speechSynthesis.speak(utterance);
    }
  }

  const audioEngineStatus: AudioEngineStatus = usingBrowserSpeechFallback
    ? isPlayingAudio
      ? 'playing'
      : isPausedAudio
      ? 'paused'
      : 'ready'
    : deriveAudioEngineStatus(ttsChunks, isPlayingAudio, isPausedAudio);

  const availabilityStatus =
    book.availabilityStatus ||
    (book.chapters.length > 0 ? 'full_text' : 'metadata_only');

  const availabilityBadgeConfig: Record<
    string,
    { label: string; bg: string; text: string }
  > = {
    full_text: {
      label:
        book.isPreCompressed !== false
          ? 'CURATED CONDENSED EDITION'
          : 'VERIFIED FULL TEXT',
      bg: book.isPreCompressed !== false ? '#F6C90E' : '#10B981',
      text: '#111111',
    },
    full_text_available: {
      label: 'VERIFIED FULL TEXT',
      bg: '#10B981',
      text: '#111111',
    },
    condensed_edition: {
      label: 'CURATED CONDENSED EDITION',
      bg: '#F6C90E',
      text: '#111111',
    },
    external_source_available: {
      label: 'EXTERNAL SOURCE (GUTENBERG)',
      bg: '#38BDF8',
      text: '#111111',
    },
    user_uploaded: {
      label: 'USER UPLOADED EDITION',
      bg: '#10B981',
      text: '#111111',
    },
    preview: {
      label: 'PUBLISHER PREVIEW ONLY',
      bg: '#F6C90E',
      text: '#111111',
    },
    metadata_only: {
      label: 'CATALOG METADATA ONLY',
      bg: '#F97316',
      text: '#111111',
    },
    extraction_failed: {
      label: 'EXTRACTION FAILED',
      bg: '#E50914',
      text: '#FFFFFF',
    },
    unsupported_format: {
      label: 'UNSUPPORTED FORMAT',
      bg: '#E50914',
      text: '#FFFFFF',
    },
  };

  const activeBadge =
    availabilityBadgeConfig[availabilityStatus] ||
    availabilityBadgeConfig.metadata_only;

  const summaryModes: {
    id: SummaryMode;
    numberLabel: string;
    shortTitle: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'original',
      numberLabel: 'ORIGINAL',
      shortTitle: 'Full Text',
      icon: <BookOpen className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'compact',
      numberLabel: 'COMPACT',
      shortTitle:
        book.compactTotalPages > 0
          ? `${book.compactTotalPages} Pages`
          : 'Chapter Summary',
      icon: <FileText className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'super_short',
      numberLabel: 'BRIEF',
      shortTitle: 'Executive Overview',
      icon: <Zap className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'bullet',
      numberLabel: 'HIGHLIGHTS',
      shortTitle: 'Key Points',
      icon: <ListChecks className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'audiobook',
      numberLabel: 'AUDIOBOOK',
      shortTitle: 'Chunked TTS',
      icon: <Headphones className="w-4 h-4 shrink-0" />,
    },
  ];

  const chapterSummaryBadge = (() => {
    if (!currentChapter) return null;
    if (currentChapter.summaryStatus === 'failed') {
      return {
        label: 'AI SUMMARY FAILED — UNCOMPRESSED',
        isAi: false,
      };
    }
    if (currentChapter.summaryMetadata?.status === 'cached') {
      return {
        label: 'CACHED AI SUMMARY',
        isAi: true,
      };
    }
    if (
      currentChapter.summaryStatus === 'ai_generated' ||
      currentChapter.summaryMetadata?.status === 'ai_generated'
    ) {
      return {
        label: 'AI GENERATED SUMMARY',
        isAi: true,
      };
    }
    if (
      book.isPreCompressed !== false ||
      currentChapter.summaryStatus === 'curated_seed'
    ) {
      return {
        label: 'CURATED CLUB EDITION',
        isAi: false,
      };
    }
    return {
      label: 'UNCOMPRESSED ORIGINAL',
      isAi: false,
    };
  })();

  const proseContainerStyle: React.CSSProperties = {
    fontSize: FONT_SIZE_MAP[fontSize],
    lineHeight: LINE_HEIGHT_MAP[lineHeight],
    maxWidth: CONTENT_WIDTH_MAP[contentWidth],
    fontFamily:
      fontFamily === 'sans' ? 'var(--font-sans)' : 'var(--font-serif)',
  };

  const paragraphGapStyle: React.CSSProperties = {
    marginBottom: PARAGRAPH_SPACING_MAP[paragraphSpacing],
  };

  const overallBookProgressPercent =
    book.chapters.length > 0
      ? Math.min(
          100,
          Math.max(
            1,
            Math.round(
              ((selectedChapterIdx + chapterScrollPercent / 100) /
                book.chapters.length) *
                100
            )
          )
        )
      : 0;

  // Reusable Typography & Comfort Popover
  const renderTypographyPanel = () => {
    if (!isTypographyOpen) return null;
    return (
      <div
        role="dialog"
        aria-label="Reading typography and appearance settings"
        className="reader-surface border-2 p-4 shadow-lg space-y-4 text-xs z-50 w-full sm:w-[360px]"
        style={{ borderColor: 'var(--reader-border-strong)' }}
      >
        <div className="flex items-center justify-between pb-2 border-b reader-divider">
          <span className="font-display-brutal uppercase tracking-wide text-xs reader-text-primary">
            Reading Comfort & Typography
          </span>
          <button
            type="button"
            aria-label="Close reading settings"
            onClick={() => setIsTypographyOpen(false)}
            className="p-1 reader-control-btn cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Theme Selection */}
        <div className="space-y-1.5">
          <div className="font-mono-tech text-[11px] font-bold uppercase reader-text-muted">
            Reading Theme
          </div>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Theme">
            {(
              [
                { id: 'paper', label: 'Paper' },
                { id: 'sepia', label: 'Sepia' },
                { id: 'evening', label: 'Evening' },
              ] as { id: ReadingTheme; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`theme-option-${t.id}`}
                aria-pressed={activeTheme === t.id}
                onClick={() => onUpdateSettings({ readingTheme: t.id })}
                className={`px-2.5 py-1.5 font-mono-tech text-xs font-bold cursor-pointer ${
                  activeTheme === t.id
                    ? 'reader-control-btn-active'
                    : 'reader-control-btn'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Font Family */}
        <div className="space-y-1.5">
          <div className="font-mono-tech text-[11px] font-bold uppercase reader-text-muted">
            Typeface
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                { id: 'serif', label: 'Book Serif (Fraunces)' },
                { id: 'sans', label: 'Clean Sans (Jakarta)' },
              ] as { id: ReaderFontFamily; label: string }[]
            ).map((ff) => (
              <button
                key={ff.id}
                type="button"
                aria-pressed={fontFamily === ff.id}
                onClick={() => onUpdateSettings({ readerFontFamily: ff.id })}
                className={`px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                  fontFamily === ff.id
                    ? 'reader-control-btn-active'
                    : 'reader-control-btn'
                }`}
              >
                {ff.label}
              </button>
            ))}
          </div>
        </div>

        {/* Font Size */}
        <div className="space-y-1.5">
          <div className="font-mono-tech text-[11px] font-bold uppercase reader-text-muted">
            Font Size
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { id: 'sm', label: 'A−' },
                { id: 'md', label: 'A' },
                { id: 'lg', label: 'A+' },
                { id: 'xl', label: 'A++' },
              ] as { id: ReaderFontSize; label: string }[]
            ).map((fs) => (
              <button
                key={fs.id}
                type="button"
                aria-label={`Font size ${fs.id}`}
                aria-pressed={fontSize === fs.id}
                onClick={() => onUpdateSettings({ readerFontSize: fs.id })}
                className={`px-2 py-1.5 font-mono-tech text-xs font-bold cursor-pointer ${
                  fontSize === fs.id
                    ? 'reader-control-btn-active'
                    : 'reader-control-btn'
                }`}
              >
                {fs.label}
              </button>
            ))}
          </div>
        </div>

        {/* Line Height */}
        <div className="space-y-1.5">
          <div className="font-mono-tech text-[11px] font-bold uppercase reader-text-muted">
            Line Spacing
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'snug', label: 'Snug' },
                { id: 'relaxed', label: 'Relaxed' },
                { id: 'loose', label: 'Loose' },
              ] as { id: ReaderLineHeight; label: string }[]
            ).map((lh) => (
              <button
                key={lh.id}
                type="button"
                aria-pressed={lineHeight === lh.id}
                onClick={() => onUpdateSettings({ readerLineHeight: lh.id })}
                className={`px-2 py-1.5 font-mono-tech text-xs font-bold cursor-pointer ${
                  lineHeight === lh.id
                    ? 'reader-control-btn-active'
                    : 'reader-control-btn'
                }`}
              >
                {lh.label}
              </button>
            ))}
          </div>
        </div>

        {/* Paragraph Spacing & Measure */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="font-mono-tech text-[11px] font-bold uppercase reader-text-muted">
              Paragraphs
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'compact', label: 'Tight' },
                  { id: 'normal', label: 'Normal' },
                  { id: 'roomy', label: 'Roomy' },
                ] as { id: ReaderParagraphSpacing; label: string }[]
              ).map((ps) => (
                <button
                  key={ps.id}
                  type="button"
                  aria-pressed={paragraphSpacing === ps.id}
                  onClick={() =>
                    onUpdateSettings({ readerParagraphSpacing: ps.id })
                  }
                  className={`px-1.5 py-1 font-mono-tech text-[11px] font-bold cursor-pointer ${
                    paragraphSpacing === ps.id
                      ? 'reader-control-btn-active'
                      : 'reader-control-btn'
                  }`}
                >
                  {ps.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="font-mono-tech text-[11px] font-bold uppercase reader-text-muted">
              Column Width
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'narrow', label: 'Narrow' },
                  { id: 'comfortable', label: 'Book' },
                  { id: 'wide', label: 'Wide' },
                ] as { id: ReaderContentWidth; label: string }[]
              ).map((cw) => (
                <button
                  key={cw.id}
                  type="button"
                  aria-pressed={contentWidth === cw.id}
                  onClick={() =>
                    onUpdateSettings({ readerContentWidth: cw.id })
                  }
                  className={`px-1.5 py-1 font-mono-tech text-[11px] font-bold cursor-pointer ${
                    contentWidth === cw.id
                      ? 'reader-control-btn-active'
                      : 'reader-control-btn'
                  }`}
                >
                  {cw.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Discreet Focus-Mode Chapter Action if user needs to summarize current chapter */}
        {focusMode && currentChapter && (
          <div className="pt-3 border-t reader-divider space-y-2">
            <div className="font-mono-tech text-[11px] font-bold uppercase reader-text-muted">
              Chapter {currentChapter.number} Action
            </div>
            <button
              type="button"
              disabled={isAiRewriting || isBatchCompressing}
              onClick={() => {
                setIsTypographyOpen(false);
                if (activeMode === 'original') {
                  onSelectMode('compact');
                }
                void handleCompressCurrentChapter(true);
              }}
              className="w-full px-3 py-2 reader-control-btn font-mono-tech text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isAiRewriting
                  ? 'Summarizing Chapter...'
                  : `Summarize Ch. ${currentChapter.number} (${activeAuthorDisplayName})`}
              </span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      ref={readerSectionRef}
      data-testid="reader-workspace"
      aria-label="Book Reader"
      data-reading-theme={activeTheme}
      data-focus-mode={focusMode ? 'true' : 'false'}
      className={`reader-workspace reader-theme-${activeTheme} border-[3px] shadow-brutal-lg rounded-none overflow-hidden flex flex-col ${
        focusMode ? 'reader-focus-mode' : ''
      }`}
    >
      {/* =====================================================================
          1. FOCUS MODE: SUBTLE PROGRESS BAR + MINIMAL AUTO-HIDING TOOLBAR
         ===================================================================== */}
      {focusMode && (
        <>
          <div
            role="progressbar"
            aria-label="Reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overallBookProgressPercent}
            className="sticky top-0 left-0 right-0 z-30 h-1 w-full"
            style={{ backgroundColor: 'var(--reader-progress-track)' }}
          >
            <div
              className="h-full transition-all duration-200"
              style={{
                width: `${overallBookProgressPercent}%`,
                backgroundColor: 'var(--reader-progress-fill)',
              }}
            />
          </div>

          <div
            role="toolbar"
            data-testid="focus-reader-toolbar"
            aria-label="Focus reading controls"
            onMouseEnter={() => setIsFocusToolbarVisible(true)}
            className={`sticky top-1 z-20 px-4 sm:px-6 py-2 border-b reader-divider flex flex-wrap items-center justify-between gap-2 transition-opacity duration-200 ${
              isFocusToolbarVisible || isTypographyOpen
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none focus-within:opacity-100 focus-within:pointer-events-auto'
            }`}
            style={{
              backgroundColor: 'var(--reader-toolbar-bg)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono-tech text-xs font-semibold reader-text-secondary truncate max-w-[180px] sm:max-w-xs">
                {book.title}
              </span>
              {currentChapter && (
                <>
                  <span aria-hidden="true" className="reader-text-muted">
                    ·
                  </span>
                  <span className="font-mono-tech text-xs reader-text-muted truncate max-w-[160px] sm:max-w-xs">
                    Ch. {currentChapter.number} of {book.chapters.length}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 relative">
              <button
                type="button"
                data-testid="appearance-settings-button"
                aria-label="Reading typography settings"
                aria-expanded={isTypographyOpen}
                onClick={() => setIsTypographyOpen((v) => !v)}
                className={`px-2.5 py-1 font-mono-tech text-xs font-bold flex items-center gap-1 cursor-pointer ${
                  isTypographyOpen
                    ? 'reader-control-btn-active'
                    : 'reader-control-btn'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Appearance</span>
              </button>

              <button
                type="button"
                data-testid="focus-exit-button"
                aria-pressed={focusMode}
                onClick={() => handleSetFocusMode(false)}
                className="px-2.5 py-1 reader-control-btn font-mono-tech text-[11px] font-bold uppercase flex items-center gap-1 cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Exit focus (Esc)</span>
              </button>

              {isTypographyOpen && (
                <div className="absolute right-0 top-full mt-2 z-50">
                  {renderTypographyPanel()}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* =====================================================================
          2. NORMAL MODE CHROME (COMPLETELY HIDDEN IN FOCUS MODE)
         ===================================================================== */}
      {!focusMode && (
        <>
          {/* Top Utility & Attribution Bar */}
          <div className="px-3 sm:px-5 py-2.5 reader-surface-muted border-b-2 reader-divider flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {onBackToCatalog && (
                <button
                  type="button"
                  onClick={onBackToCatalog}
                  className="px-2.5 py-1 reader-control-btn font-display-brutal text-xs uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Library</span>
                </button>
              )}

              <span
                className="px-2 py-0.5 font-mono-tech text-[10px] sm:text-[11px] font-extrabold uppercase border border-[#111]"
                style={{
                  backgroundColor: activeBadge.bg,
                  color: activeBadge.text,
                }}
              >
                {activeBadge.label}
              </span>

              {canRemoveFromLibrary && onRemoveBookFromLibrary && (
                <button
                  type="button"
                  onClick={() => onRemoveBookFromLibrary(book.id)}
                  title="Remove this book from library"
                  className="px-2.5 py-1 bg-[#E50914] hover:bg-[#B8000A] text-white font-mono-tech text-[11px] font-bold uppercase border border-[#111] cursor-pointer"
                >
                  Remove from Library
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 relative">
              <button
                type="button"
                data-testid="appearance-settings-button"
                aria-label="Reading typography settings"
                aria-expanded={isTypographyOpen}
                onClick={() => setIsTypographyOpen((v) => !v)}
                className={`px-2.5 py-1 font-mono-tech text-xs font-bold flex items-center gap-1 cursor-pointer ${
                  isTypographyOpen
                    ? 'reader-control-btn-active'
                    : 'reader-control-btn'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Appearance</span>
              </button>

              <button
                type="button"
                data-testid="enter-focus-mode-button"
                aria-pressed={focusMode}
                onClick={() => handleSetFocusMode(true)}
                className="px-2.5 py-1 reader-accent-btn font-mono-tech text-[11px] font-bold uppercase flex items-center gap-1.5 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Focus reader</span>
              </button>

              {isTypographyOpen && (
                <div className="fixed inset-x-3 top-20 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 z-50">
                  {renderTypographyPanel()}
                </div>
              )}
            </div>
          </div>

          {/* Book Identity Banner */}
          <div
            data-testid="reader-book-banner"
            className="px-4 sm:px-6 py-3.5 reader-surface border-b-2 reader-divider flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-14 sm:w-12 sm:h-16 border border-[#111] shrink-0 overflow-hidden bg-[#111]">
                <BookPosterCover
                  title={book.title}
                  author={book.author}
                  coverUrl={book.coverUrl}
                  coverColor={book.coverColor}
                  coverAccent={book.coverAccent}
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono-tech uppercase tracking-wider reader-text-muted">
                  <span>{book.genre}</span>
                  <span aria-hidden="true">·</span>
                  <span>{book.year}</span>
                  <span aria-hidden="true" className="hidden md:inline">
                    ·
                  </span>
                  <span className="hidden md:inline truncate max-w-sm">
                    {book.sourceAttribution ||
                      'The Readers Club Open Literary Archive'}
                  </span>
                </div>
                <h2 className="font-display-brutal text-lg sm:text-xl uppercase tracking-tight reader-text-primary truncate">
                  {book.title}
                </h2>
                <p className="text-xs sm:text-sm font-medium reader-text-secondary truncate">
                  by {book.author}
                </p>
              </div>
            </div>

            <div className="reader-surface-muted reader-text-primary px-3 py-1.5 border reader-divider font-mono-tech text-xs font-bold shrink-0">
              {book.chapters.length > 0
                ? `${book.chapters.length} ${
                    book.chapterStructure === 'editorial_sections'
                      ? 'Editorial Sections'
                      : 'Chapters'
                  } · ${book.originalTotalPages}p Original → ${
                    book.compactTotalPages
                  }p Compact`
                : availabilityStatus === 'metadata_only'
                ? 'Catalog Metadata Record (0 Verifiable Chapters)'
                : 'Verifying Manuscript...'}
            </div>
          </div>

          {/* 5 Reading Format Tabs */}
          <div
            role="tablist"
            data-testid="reader-mode-strip"
            aria-label="Reading Format"
            className="grid grid-cols-2 sm:grid-cols-5 border-b-2 reader-divider reader-surface-muted"
          >
            {summaryModes.map((m) => {
              const isSelected = activeMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => onSelectMode(m.id)}
                  className={`px-3 py-2.5 text-left border-r border-b sm:border-b-0 last:border-r-0 reader-divider transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'reader-control-btn-active font-extrabold'
                      : 'reader-surface reader-text-secondary hover:opacity-90'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-display-brutal text-xs tracking-tight truncate">
                      {m.numberLabel}
                    </div>
                    <div className="text-[11px] font-mono-tech opacity-80 truncate">
                      {m.shortTitle}
                    </div>
                  </div>
                  {m.icon}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* =====================================================================
          3. STATUS & HONEST AI ERROR BANNERS
         ===================================================================== */}
      {aiStatusBanner && (
        <div className="px-4 py-2 reader-surface-muted border-b reader-divider font-mono-tech text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isAiRewriting || isBatchCompressing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin reader-accent-text shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 reader-accent-text shrink-0" />
            )}
            <span className="reader-text-primary truncate">
              {aiStatusBanner}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAiStatusBanner(null)}
            className="underline reader-text-muted hover:reader-text-primary cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {aiErrorBanner && (
        <div
          role="alert"
          className="px-4 py-3 bg-[#7F1D1D] text-white border-b-2 reader-divider font-mono-tech text-xs flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#FDE047] shrink-0" />
            <span>
              <strong>AI Summarization Unavailable:</strong> {aiErrorBanner}{' '}
              (Chapter kept uncompressed; no synthetic fallback text was
              substituted.)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isAiRewriting}
              onClick={() => void handleCompressCurrentChapter(true)}
              className="px-2.5 py-1 bg-[#F6C90E] text-[#111] font-bold border border-white cursor-pointer disabled:opacity-50"
            >
              Retry AI Request
            </button>
            <button
              type="button"
              onClick={() => setAiErrorBanner(null)}
              className="underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. SPECIAL CASE 1: LOADING PROJECT GUTENBERG FULL TEXT
         ===================================================================== */}
      {isLoadingGutenbergText && (
        <div className="p-12 flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-9 h-9 animate-spin reader-accent-text" />
          <h3 className="font-display-brutal text-lg uppercase reader-text-primary">
            Retrieving Authentic Public-Domain Manuscript
          </h3>
          <p className="text-xs sm:text-sm font-mono-tech reader-text-secondary max-w-md">
            Fetching complete chapter text for {book.title} (Project Gutenberg #
            {book.gutenbergId})...
          </p>
        </div>
      )}

      {/* =====================================================================
          5. SPECIAL CASE 2: METADATA ONLY / EXTRACTION FAILED / NO CHAPTERS
         ===================================================================== */}
      {!isLoadingGutenbergText &&
        (!currentChapter || book.chapters.length === 0) && (
          <div className="p-6 sm:p-10 space-y-6">
            <div className="max-w-2xl mx-auto reader-surface border-2 reader-divider p-6 space-y-4">
              <div className="flex items-center gap-3">
                {availabilityStatus === 'extraction_failed' ||
                gutenbergFetchError ? (
                  <FileWarning className="w-7 h-7 reader-accent-text shrink-0" />
                ) : (
                  <Database className="w-7 h-7 reader-accent-text shrink-0" />
                )}
                <div>
                  <span className="font-mono-tech text-xs font-bold uppercase reader-accent-text">
                    {availabilityStatus === 'extraction_failed' ||
                    gutenbergFetchError
                      ? 'Manuscript Extraction Failed'
                      : 'Catalog Metadata Record Only'}
                  </span>
                  <h3 className="font-display-brutal text-xl uppercase reader-text-primary">
                    {book.title} — Full Manuscript Not Attached
                  </h3>
                </div>
              </div>

              <p className="text-sm reader-text-secondary leading-relaxed font-medium">
                {gutenbergFetchError ||
                  book.extractionError ||
                  `This entry was discovered via ${
                    book.sourceAttribution || 'Google Books Discovery Catalog'
                  }. Because full public-domain text is not available from this discovery record, The Readers Club never fabricates synthetic chapters from a book description.`}
              </p>

              <div className="p-4 reader-surface-muted border reader-divider space-y-1.5">
                <div className="font-mono-tech text-xs font-bold uppercase reader-text-muted">
                  Verified Catalog Synopsis
                </div>
                <p className="font-editorial text-sm reader-text-primary leading-relaxed reader-prose">
                  {book.tagline || book.superShortExecutiveSummary.thesis}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {book.gutenbergId && (
                  <button
                    type="button"
                    onClick={() => void fetchGutenbergManuscript()}
                    className="px-4 py-2 reader-accent-btn font-display-brutal text-xs uppercase flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry Gutenberg Retrieval</span>
                  </button>
                )}
                {onOpenUploadTab && (
                  <button
                    type="button"
                    onClick={onOpenUploadTab}
                    className="px-4 py-2 reader-control-btn font-display-brutal text-xs uppercase cursor-pointer"
                  >
                    Upload Your Own EPUB / PDF Copy →
                  </button>
                )}
                {onBackToCatalog && (
                  <button
                    type="button"
                    onClick={onBackToCatalog}
                    className="px-4 py-2 reader-control-btn font-display-brutal text-xs uppercase cursor-pointer"
                  >
                    Browse Full-Text Public Domain Books
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      {/* =====================================================================
          6. MAIN READER BODY WHEN VERIFIED CHAPTERS EXIST
         ===================================================================== */}
      {!isLoadingGutenbergText &&
        currentChapter &&
        book.chapters.length > 0 && (
          <div
            className={
              focusMode
                ? 'flex-1 flex flex-col'
                : 'grid grid-cols-1 lg:grid-cols-12 min-h-[540px]'
            }
          >
            {/* Mobile & Tablet Compact Chapter Bar (hidden on desktop and hidden in focus mode) */}
            {!focusMode && (
              <div className="lg:hidden px-3 sm:px-5 py-2.5 reader-surface border-b reader-divider flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={isMobileChaptersOpen}
                  onClick={() => setIsMobileChaptersOpen((v) => !v)}
                  className="px-3 py-1.5 reader-control-btn font-mono-tech text-xs font-bold flex items-center gap-1.5 cursor-pointer min-w-0"
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {book.chapterStructure === 'editorial_sections'
                      ? `Section ${currentChapter.number}/${book.chapters.length}`
                      : `Chapter ${currentChapter.number}/${book.chapters.length}`}
                    : {currentChapter.title.replace(/^Chapter\s+\d+[:.-]?\s*/i, '')}
                  </span>
                  {isMobileChaptersOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  )}
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label="Previous chapter"
                    disabled={selectedChapterIdx === 0}
                    onClick={() =>
                      setSelectedChapterIdx((i) => Math.max(0, i - 1))
                    }
                    className="p-1.5 reader-control-btn cursor-pointer disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next chapter"
                    disabled={selectedChapterIdx >= book.chapters.length - 1}
                    onClick={() =>
                      setSelectedChapterIdx((i) =>
                        Math.min(book.chapters.length - 1, i + 1)
                      )
                    }
                    className="p-1.5 reader-control-btn cursor-pointer disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Left Chapters Sidebar (Hidden completely in Focus Mode; collapsible on Mobile/Tablet/Desktop) */}
            {!focusMode && (
              <aside
                data-testid="reader-chapter-sidebar"
                aria-label="Chapters"
                className={`${
                  isMobileChaptersOpen ? 'flex' : 'hidden'
                } ${
                  isDesktopSidebarOpen
                    ? 'lg:flex lg:col-span-4 xl:col-span-3'
                    : 'lg:hidden'
                } border-b-2 lg:border-b-0 lg:border-r-2 reader-divider reader-surface-muted p-3 sm:p-4 flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b reader-divider">
                    <span className="font-display-brutal text-xs uppercase tracking-wider reader-text-primary">
                      {book.chapterStructure === 'editorial_sections'
                        ? `SECTIONS (${book.chapters.length})`
                        : `CHAPTERS (${book.chapters.length})`}
                    </span>
                    <div className="flex items-center gap-2">
                      {compressedChaptersCount < book.chapters.length && (
                        <button
                          type="button"
                          onClick={() => void handleCompressAllChaptersSequentially()}
                          disabled={isBatchCompressing || isAiRewriting}
                          className="text-[11px] font-mono-tech font-bold reader-accent-text hover:underline cursor-pointer disabled:opacity-50"
                        >
                          {isBatchCompressing
                            ? 'Summarizing all...'
                            : 'Summarize All'}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Collapse chapter list"
                        onClick={() => {
                          setIsDesktopSidebarOpen(false);
                          setIsMobileChaptersOpen(false);
                        }}
                        className="hidden lg:inline-flex p-1 reader-control-btn cursor-pointer"
                        title="Collapse Chapter Sidebar"
                      >
                        <PanelLeftClose className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-[360px] lg:max-h-[560px] overflow-y-auto pr-1">
                    {book.chapters.map((ch, idx) => {
                      const isSelected = idx === selectedChapterIdx;
                      const chCompressed = isChapterCompressed(ch);
                      const chFailed = ch.summaryStatus === 'failed';
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => {
                            setSelectedChapterIdx(idx);
                            setIsMobileChaptersOpen(false);
                          }}
                          className={`w-full text-left p-2.5 transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'reader-control-btn-active'
                              : 'reader-control-btn'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-mono-tech text-[10px] uppercase opacity-80">
                              <span>
                                {book.chapterStructure === 'editorial_sections'
                                  ? `Section ${ch.number}`
                                  : `Chapter ${ch.number}`}
                              </span>
                              {ch.pageStart && ch.pageEnd && (
                                <span>
                                  (pp. {ch.pageStart}–{ch.pageEnd})
                                </span>
                              )}
                              {chCompressed && (
                                <CheckCircle2 className="w-3 h-3 inline shrink-0" />
                              )}
                              {chFailed && (
                                <AlertTriangle className="w-3 h-3 text-[#E50914] inline shrink-0" />
                              )}
                            </div>
                            <div className="font-bold text-xs leading-snug line-clamp-1 mt-0.5">
                              {ch.title.replace(/^Chapter\s+\d+[:.-]?\s*/i, '')}
                            </div>
                          </div>
                          <span className="font-mono-tech text-[10px] font-bold px-1.5 py-0.5 border reader-divider shrink-0 opacity-90">
                            {activeMode === 'original'
                              ? `${ch.originalPages}p`
                              : `${ch.compactPages}p`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </aside>
            )}

            {/* Right / Main Reading Canvas */}
            <div
              className={`${
                focusMode
                  ? 'flex-1 w-full px-4 sm:px-8 md:px-14 py-8 sm:py-12'
                  : isDesktopSidebarOpen
                  ? 'lg:col-span-8 xl:col-span-9 p-4 sm:p-6 md:p-8'
                  : 'lg:col-span-12 p-4 sm:p-6 md:p-10'
              } flex flex-col justify-between`}
            >
              <div className="w-full mx-auto" style={{ maxWidth: CONTENT_WIDTH_MAP[contentWidth] }}>
                {/* Desktop button to reopen collapsed chapter sidebar in normal mode */}
                {!focusMode && !isDesktopSidebarOpen && (
                  <div className="hidden lg:flex mb-4">
                    <button
                      type="button"
                      onClick={() => setIsDesktopSidebarOpen(true)}
                      className="px-2.5 py-1 reader-control-btn font-mono-tech text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <PanelLeftOpen className="w-3.5 h-3.5" />
                      <span>
                        Show Chapters ({book.chapters.length})
                      </span>
                    </button>
                  </div>
                )}

                {/* =========================================================
                    MODE 1: ORIGINAL MANUSCRIPT
                   ========================================================= */}
                {activeMode === 'original' && (
                  <article className="space-y-6">
                    <header className="pb-4 border-b reader-divider flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-mono-tech text-xs font-bold uppercase reader-accent-text">
                          {book.chapterStructure === 'editorial_sections'
                            ? `Editorial Section ${currentChapter.number} of ${book.chapters.length}`
                            : `Chapter ${currentChapter.number} of ${book.chapters.length}`}
                          {currentChapter.pageStart && currentChapter.pageEnd
                            ? ` · Pages ${currentChapter.pageStart}–${currentChapter.pageEnd}`
                            : ` · ${currentChapter.originalPages} Pages`}
                        </div>
                        <h3 className="font-editorial font-bold text-xl sm:text-2xl md:text-3xl reader-text-primary leading-tight">
                          {currentChapter.title}
                        </h3>
                      </div>

                      {/* Contextual Chapter Action in Normal Mode */}
                      {!focusMode && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectMode('compact');
                            if (!currentChapterIsCompressed) {
                              void handleCompressCurrentChapter(false);
                            }
                          }}
                          className="px-3 py-1.5 reader-control-btn font-mono-tech text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Sparkles className="w-3.5 h-3.5 reader-accent-text" />
                          <span>
                            {currentChapterIsCompressed
                              ? `View Ch. ${currentChapter.number} Summary`
                              : `Summarize Ch. ${currentChapter.number}`}
                          </span>
                        </button>
                      )}
                    </header>

                    {!focusMode &&
                      book.availabilityStatus === 'condensed_edition' &&
                      book.gutenbergId && (
                        <div className="p-3.5 reader-surface-muted border reader-divider flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="reader-text-secondary">
                            <strong className="reader-text-primary">
                              Curated Condensed Edition ({book.chapters.length}{' '}
                              Editorial Sections):
                            </strong>{' '}
                            Full unabridged public-domain chapters are available
                            from Project Gutenberg (#{book.gutenbergId}).
                          </div>
                          <button
                            type="button"
                            onClick={() => void fetchGutenbergManuscript()}
                            className="px-3 py-1.5 reader-control-btn font-mono-tech font-bold cursor-pointer shrink-0"
                          >
                            Load Unabridged Gutenberg Text →
                          </button>
                        </div>
                      )}

                    <div
                      ref={readingProseRef}
                      data-testid="reader-prose-content"
                      style={proseContainerStyle}
                      className="reader-prose reader-text-primary"
                    >
                      {currentChapter.originalText.map((para, i) => (
                        <p
                          key={i}
                          style={paragraphGapStyle}
                          className={
                            i === 0
                              ? 'first-letter:font-bold first-letter:text-2xl first-letter:mr-0.5'
                              : ''
                          }
                        >
                          {para}
                        </p>
                      ))}
                    </div>
                  </article>
                )}

                {/* =========================================================
                    MODE 2: COMPACT EDITION (CHAPTER SUMMARY)
                   ========================================================= */}
                {activeMode === 'compact' && (
                  <article className="space-y-6">
                    <header className="pb-4 border-b reader-divider space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 font-mono-tech text-xs">
                            <span className="font-bold uppercase reader-accent-text">
                              Compact Edition · Chapter {currentChapter.number}{' '}
                              of {book.chapters.length}
                            </span>
                            {chapterSummaryBadge && (
                              <>
                                <span
                                  aria-hidden="true"
                                  className="reader-text-muted"
                                >
                                  ·
                                </span>
                                <span className="reader-text-muted font-semibold">
                                  {chapterSummaryBadge.label}
                                </span>
                              </>
                            )}
                          </div>
                          <h3 className="font-editorial font-bold text-xl sm:text-2xl md:text-3xl reader-text-primary leading-tight">
                            {currentChapter.title}
                          </h3>
                        </div>

                        <span className="font-mono-tech text-xs font-bold reader-surface-muted px-2.5 py-1 border reader-divider reader-text-secondary shrink-0">
                          {currentChapter.originalPages}p →{' '}
                          {currentChapter.compactPages}p
                        </span>
                      </div>

                      {/* Contextual Chapter Summarization Action Bar (Normal Mode) */}
                      {!focusMode && (
                        <div
                          data-testid="contextual-chapter-action"
                          className="p-3 reader-surface-muted border reader-divider flex flex-wrap items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 border reader-divider shrink-0 overflow-hidden">
                              <PersonaPortraitSvg
                                personaId={settings.authorPersonality}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold reader-text-primary truncate flex items-center gap-1.5">
                                <span>
                                  Chapter {currentChapter.number} Adapter:{' '}
                                  {activeAuthorDisplayName}
                                </span>
                                {smartLookaheadBookId === book.id && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-mono-tech uppercase reader-control-btn-active">
                                    {lookaheadChapterNum
                                      ? `Prefetching Ch. ${lookaheadChapterNum}...`
                                      : 'Smart 3-Ch Lookahead On'}
                                  </span>
                                )}
                              </div>
                              <div className="reader-text-muted text-[11px] truncate">
                                {lookaheadChapterNum
                                  ? `Auto-summarizing Ch. ${lookaheadChapterNum} in background (next 3 chapters rolling window)`
                                  : currentChapterIsCompressed
                                  ? `Verified summary active for "${currentChapter.title}"`
                                  : `Summarize this chapter & auto-prefetch the next 3 chapters as you read`}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {confirmOverwriteChapterId === currentChapter.id ? (
                              <div
                                data-testid="overwrite-summary-confirmation"
                                className="flex flex-wrap items-center gap-1.5"
                              >
                                <span className="font-mono-tech text-[11px] font-bold reader-accent-text">
                                  Overwrite Ch. {currentChapter.number} summary?
                                </span>
                                <button
                                  type="button"
                                  data-testid="confirm-overwrite-summary"
                                  disabled={isAiRewriting}
                                  onClick={() =>
                                    void handleCompressCurrentChapter(true)
                                  }
                                  className="px-2.5 py-1 reader-accent-btn font-mono-tech text-[11px] font-bold cursor-pointer"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  data-testid="cancel-overwrite-summary"
                                  onClick={() =>
                                    setConfirmOverwriteChapterId(null)
                                  }
                                  className="px-2 py-1 reader-control-btn font-mono-tech text-[11px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                data-testid="chapter-summarize-button"
                                onClick={() =>
                                  void handleCompressCurrentChapter(false)
                                }
                                disabled={isAiRewriting || isBatchCompressing}
                                className={`px-3 py-1.5 font-mono-tech text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                                  currentChapterIsCompressed
                                    ? 'reader-control-btn'
                                    : 'reader-accent-btn'
                                }`}
                              >
                                {isAiRewriting ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {isAiRewriting
                                    ? `Summarizing Ch. ${currentChapter.number}...`
                                    : currentChapterIsCompressed
                                    ? `Regenerate Ch. ${currentChapter.number} (${activeAuthorDisplayName})`
                                    : `Summarize Ch. ${currentChapter.number} + Next 3`}
                                </span>
                              </button>
                            )}

                            {book.chapters.length > 1 && (
                              <button
                                type="button"
                                data-testid="summarize-whole-book-button"
                                disabled={isBatchCompressing || isAiRewriting}
                                onClick={() =>
                                  void handleCompressAllChaptersSequentially()
                                }
                                className="px-2.5 py-1.5 reader-control-btn font-mono-tech text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Summarize all chapters in this book sequentially"
                              >
                                <Zap className="w-3.5 h-3.5" />
                                <span>
                                  {isBatchCompressing
                                    ? 'Summarizing Book...'
                                    : 'Summarize Whole Book'}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onSelectMode('audiobook')}
                              className="px-2.5 py-1.5 reader-control-btn font-mono-tech text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Headphones className="w-3.5 h-3.5" />
                              <span>Listen</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </header>

                    {!currentChapterIsCompressed ? (
                      <div className="p-6 reader-surface border-2 reader-divider text-center space-y-4 my-4">
                        <h4 className="font-display-brutal text-lg uppercase reader-text-primary">
                          {currentChapter.summaryStatus === 'failed'
                            ? `Summarization Failed for ${currentChapter.title}`
                            : `Summarize Chapter ${currentChapter.number}: ${currentChapter.title}`}
                        </h4>
                        <p className="text-sm reader-text-secondary max-w-md mx-auto">
                          {currentChapter.summaryStatus === 'failed'
                            ? currentChapter.summaryErrorMessage ||
                              'The AI summarization request could not be completed. The chapter remains uncompressed so we never show fake AI output.'
                            : `Condense this ${currentChapter.originalPages}-page chapter into a ${currentChapter.compactPages}-page ${detailLevel} summary in ${activeAuthorDisplayName}’s voice.`}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              void handleCompressCurrentChapter(true)
                            }
                            disabled={isAiRewriting}
                            className="px-5 py-2.5 reader-accent-btn font-display-brutal text-xs uppercase flex items-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            {isAiRewriting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
                            <span>
                              {isAiRewriting
                                ? 'Summarizing Chapter...'
                                : currentChapter.summaryStatus === 'failed'
                                ? `Retry AI Summary (Ch. ${currentChapter.number})`
                                : `AI Summarize Chapter ${currentChapter.number}`}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectMode('original')}
                            className="px-4 py-2.5 reader-control-btn font-display-brutal text-xs uppercase cursor-pointer"
                          >
                            Read Original Chapter Text
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        ref={readingProseRef}
                        data-testid="reader-prose-content"
                        style={proseContainerStyle}
                        className="reader-prose reader-text-primary"
                      >
                        {displayedCompactParagraphs.map((para, idx) => (
                          <p
                            key={idx}
                            style={paragraphGapStyle}
                            className={
                              idx === 0
                                ? 'first-letter:font-bold first-letter:text-2xl first-letter:mr-0.5'
                                : ''
                            }
                          >
                            {para}
                          </p>
                        ))}
                      </div>
                    )}
                  </article>
                )}

                {/* =========================================================
                    MODE 3: BRIEF (2-4 PAGE EXECUTIVE OVERVIEW)
                   ========================================================= */}
                {activeMode === 'super_short' && (
                  <article className="space-y-6">
                    <header className="pb-4 border-b reader-divider">
                      <span className="font-mono-tech text-xs font-bold uppercase reader-accent-text">
                        Executive Brief · {book.superShortPages}-Page Synthesis
                      </span>
                      <h3 className="font-editorial font-bold text-xl sm:text-2xl md:text-3xl reader-text-primary mt-1">
                        {book.title}
                      </h3>
                    </header>

                    <div className="p-4 reader-surface-muted border reader-divider">
                      <div className="font-mono-tech text-xs font-bold uppercase reader-accent-text">
                        Central Thesis
                      </div>
                      <p className="font-editorial font-semibold text-base mt-1 reader-text-primary reader-prose">
                        {book.superShortExecutiveSummary.thesis}
                      </p>
                    </div>

                    <div
                      ref={readingProseRef}
                      style={proseContainerStyle}
                      className="reader-prose reader-text-primary"
                    >
                      {book.superShortExecutiveSummary.executivePages.map(
                        (pageText, idx) => (
                          <div
                            key={idx}
                            style={paragraphGapStyle}
                            className="p-4 reader-surface border reader-divider"
                          >
                            <div className="font-mono-tech text-xs font-bold reader-accent-text mb-1.5 select-none">
                              Synthesis Movement {idx + 1} of{' '}
                              {book.superShortPages}
                            </div>
                            <p>{pageText}</p>
                          </div>
                        )
                      )}
                    </div>
                  </article>
                )}

                {/* =========================================================
                    MODE 4: HIGHLIGHTS (BULLETS)
                   ========================================================= */}
                {activeMode === 'bullet' && (
                  <article className="space-y-6">
                    <header className="pb-4 border-b reader-divider flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="font-mono-tech text-xs font-bold uppercase reader-accent-text">
                          Key Highlights & Takeaways
                        </span>
                        <h3 className="font-editorial font-bold text-xl sm:text-2xl reader-text-primary mt-0.5">
                          {bulletScope === 'chapter'
                            ? `Chapter ${currentChapter.number}: ${currentChapter.title}`
                            : `${book.title} — Complete Book`}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-pressed={bulletScope === 'chapter'}
                          onClick={() => setBulletScope('chapter')}
                          className={`px-3 py-1 text-xs font-bold cursor-pointer whitespace-nowrap ${
                            bulletScope === 'chapter'
                              ? 'reader-control-btn-active'
                              : 'reader-control-btn'
                          }`}
                        >
                          This Chapter
                        </button>
                        <button
                          type="button"
                          aria-pressed={bulletScope === 'entire_book'}
                          onClick={() => setBulletScope('entire_book')}
                          className={`px-3 py-1 text-xs font-bold cursor-pointer whitespace-nowrap ${
                            bulletScope === 'entire_book'
                              ? 'reader-control-btn-active'
                              : 'reader-control-btn'
                          }`}
                        >
                          Entire Book
                        </button>
                      </div>
                    </header>

                    {bulletScope === 'chapter' && !currentChapterIsCompressed ? (
                      <div className="p-5 reader-surface border reader-divider flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-display-brutal text-sm uppercase reader-text-primary">
                            Generate Chapter {currentChapter.number} Highlights
                          </div>
                          <p className="text-xs reader-text-secondary mt-0.5">
                            Generate verified AI bullet takeaways for "
                            {currentChapter.title}".
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isAiRewriting}
                          onClick={() => void handleCompressCurrentChapter(true)}
                          className="px-4 py-2 reader-accent-btn font-display-brutal text-xs uppercase cursor-pointer disabled:opacity-50"
                        >
                          {isAiRewriting
                            ? 'Generating...'
                            : `Summarize Ch. ${currentChapter.number} Highlights`}
                        </button>
                      </div>
                    ) : (
                      <div ref={readingProseRef} style={proseContainerStyle}>
                        <ul className="space-y-3 reader-prose">
                          {(bulletScope === 'chapter'
                            ? displayedChapterBullets
                            : book.masterBookBullets
                          ).map((item, idx) => (
                            <li
                              key={idx}
                              className="p-3.5 reader-surface border reader-divider flex items-start gap-3"
                            >
                              <span className="w-6 h-6 reader-control-btn-active font-mono-tech text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 select-none">
                                {idx + 1}
                              </span>
                              <span className="reader-text-primary leading-relaxed">
                                {item}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                )}

                {/* =========================================================
                    MODE 5: LONG-FORM CHUNKED AUDIOBOOK
                   ========================================================= */}
                {activeMode === 'audiobook' && (
                  <article className="space-y-6">
                    <header className="pb-4 border-b reader-divider flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 font-mono-tech text-xs">
                          <span className="font-bold uppercase reader-accent-text">
                            Long-Form Audiobook · Chapter{' '}
                            {currentChapter.number}
                          </span>
                          <span aria-hidden="true" className="reader-text-muted">
                            ·
                          </span>
                          <span className="font-bold uppercase reader-text-secondary">
                            STATUS: {audioEngineStatus.toUpperCase()}
                          </span>
                        </div>
                        <h3 className="font-editorial font-bold text-xl sm:text-2xl reader-text-primary mt-0.5">
                          {currentChapter.title}
                        </h3>
                      </div>
                      <span className="font-mono-tech text-xs font-bold reader-surface-muted border reader-divider px-2.5 py-1 reader-text-primary">
                        Narrator: {activeNarratorDisplayName}
                      </span>
                    </header>

                    <div className="p-4 reader-surface-muted border-2 reader-divider space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-14 border-2 reader-divider overflow-hidden shrink-0">
                            <PersonaPortraitSvg
                              personaId={settings.narratorPersonality}
                            />
                          </div>
                          <div>
                            <div className="text-xs font-mono-tech reader-accent-text uppercase font-bold">
                              {usingBrowserSpeechFallback
                                ? 'Browser Speech Synthesis'
                                : `Cloud Neural TTS (${narratorProfile.ttsVoiceName})`}
                            </div>
                            <div className="font-display-brutal text-base sm:text-lg reader-text-primary">
                              {activeNarratorDisplayName}
                            </div>
                            <div className="text-xs reader-text-muted font-mono-tech">
                              {ttsChunks.length > 0
                                ? `Chunk ${activeChunkIdx + 1} of ${
                                    ttsChunks.length
                                  } · ${
                                    ttsChunks.filter(
                                      (c) => c.status === 'ready'
                                    ).length
                                  }/${
                                    ttsChunks.length
                                  } Ready · ${audioPlaybackSeconds}s`
                                : 'Sentence/paragraph boundary chunking ready'}
                            </div>
                          </div>
                        </div>

                        {/* Narrator Quick Switcher */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              'homelander',
                              'taylor_swift',
                              'deadpool',
                              'gandalf',
                            ] as PresetPersonalityId[]
                          ).map((pid) => {
                            const p = PERSONALITY_PROFILES[pid];
                            const active =
                              !settings.useCustomNarrator &&
                              settings.narratorPersonality === pid;
                            return (
                              <button
                                key={pid}
                                type="button"
                                aria-pressed={active}
                                onClick={() => {
                                  stopAndCleanupAudio(true);
                                  onUpdateSettings({
                                    narratorPersonality: pid,
                                    useCustomNarrator: false,
                                  });
                                }}
                                className={`px-2.5 py-1 text-xs font-bold cursor-pointer whitespace-nowrap ${
                                  active
                                    ? 'reader-control-btn-active'
                                    : 'reader-control-btn'
                                }`}
                              >
                                {p.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Audio Controls Bar */}
                      <div className="pt-3 border-t reader-divider flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            aria-label="Previous audio chunk"
                            onClick={() => {
                              const prev = Math.max(0, activeChunkIdx - 1);
                              if (usingBrowserSpeechFallback) {
                                handlePlayBrowserSpeechSynthesis(prev);
                              } else if (isAudiobookReady(ttsChunks)) {
                                playReadyChunkAtIndex(ttsChunks, prev);
                              } else {
                                setActiveChunkIdx(prev);
                              }
                            }}
                            className="p-2 reader-control-btn cursor-pointer"
                          >
                            <SkipBack className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={handlePauseResumeAudio}
                            disabled={audioEngineStatus === 'generating'}
                            className="px-4 py-2 reader-accent-btn font-display-brutal text-xs uppercase flex items-center gap-2 cursor-pointer disabled:opacity-60"
                          >
                            {isPlayingAudio ? (
                              <>
                                <Pause className="w-4 h-4 fill-current" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 fill-current" />
                                <span>
                                  {audioEngineStatus === 'generating'
                                    ? 'Generating Audio Chunks...'
                                    : isPausedAudio
                                    ? 'Resume Chapter'
                                    : 'Generate & Play Chapter'}
                                </span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            aria-label="Next audio chunk"
                            onClick={() => {
                              const next = Math.min(
                                Math.max(0, ttsChunks.length - 1),
                                activeChunkIdx + 1
                              );
                              if (usingBrowserSpeechFallback) {
                                handlePlayBrowserSpeechSynthesis(next);
                              } else if (isAudiobookReady(ttsChunks)) {
                                playReadyChunkAtIndex(ttsChunks, next);
                              } else {
                                setActiveChunkIdx(next);
                              }
                            }}
                            className="p-2 reader-control-btn cursor-pointer"
                          >
                            <SkipForward className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handlePlayBrowserSpeechSynthesis(0)}
                            className="px-3 py-2 reader-control-btn text-xs font-mono-tech font-bold cursor-pointer"
                          >
                            Use Browser Speech
                          </button>
                        </div>

                        {/* Speed Selector */}
                        <div className="flex items-center gap-1.5 font-mono-tech text-xs">
                          <Volume2 className="w-4 h-4 reader-accent-text" />
                          <span className="reader-text-muted">SPEED:</span>
                          {[1.0, 1.25, 1.5].map((spd) => (
                            <button
                              key={spd}
                              type="button"
                              aria-pressed={playbackSpeed === spd}
                              onClick={() => {
                                setPlaybackSpeed(spd);
                                if (audioElementRef.current) {
                                  audioElementRef.current.playbackRate = spd;
                                }
                              }}
                              className={`px-2 py-0.5 cursor-pointer font-bold ${
                                playbackSpeed === spd
                                  ? 'reader-control-btn-active'
                                  : 'reader-control-btn'
                              }`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Chunk Queue Status & Per-Chunk Retry List */}
                    <div
                      ref={readingProseRef}
                      style={proseContainerStyle}
                      className="space-y-3 reader-prose"
                    >
                      {(ttsChunks.length > 0
                        ? ttsChunks
                        : chunkTextForTts(getAudioSourceParagraphs(), 720)
                      ).map((chunk, idx) => {
                        const isCurrent = idx === activeChunkIdx;
                        const actualChunk = ttsChunks[idx] || chunk;
                        return (
                          <div
                            key={idx}
                            className={`p-3.5 border transition-colors ${
                              isCurrent
                                ? 'reader-surface-muted border-2'
                                : 'reader-surface reader-divider'
                            }`}
                            style={
                              isCurrent
                                ? { borderColor: 'var(--reader-accent)' }
                                : undefined
                            }
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tech font-bold mb-1.5 select-none">
                              <span className="reader-accent-text">
                                Audio Segment {idx + 1} (
                                {actualChunk.text.length} chars)
                              </span>

                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 reader-surface-muted border reader-divider uppercase reader-text-secondary">
                                  {actualChunk.status}
                                </span>

                                {actualChunk.status === 'failed' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleRetrySingleFailedChunk(idx)
                                    }
                                    className="px-2.5 py-0.5 reader-accent-btn cursor-pointer flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Retry Segment {idx + 1}</span>
                                  </button>
                                )}

                                {actualChunk.status === 'ready' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      playReadyChunkAtIndex(ttsChunks, idx)
                                    }
                                    className="px-2.5 py-0.5 reader-control-btn-active cursor-pointer"
                                  >
                                    {isCurrent && isPlayingAudio
                                      ? '▶ Playing'
                                      : 'Play Segment'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {actualChunk.errorMessage && (
                              <div className="text-xs font-mono-tech text-[#E50914] mb-1 select-none">
                                Chunk Error: {actualChunk.errorMessage}
                              </div>
                            )}

                            <p className="reader-text-primary leading-relaxed">
                              {actualChunk.text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                )}
              </div>

              {/* Bottom Chapter Prev/Next & Reading Progress Footer */}
              <div
                className="w-full mx-auto mt-10 pt-5 border-t reader-divider flex flex-wrap items-center justify-between gap-3"
                style={{ maxWidth: CONTENT_WIDTH_MAP[contentWidth] }}
              >
                <button
                  type="button"
                  disabled={selectedChapterIdx === 0}
                  onClick={() => {
                    setSelectedChapterIdx((i) => Math.max(0, i - 1));
                    if (focusMode && readerSectionRef.current) {
                      readerSectionRef.current.scrollTo({
                        top: 0,
                        behavior: 'smooth',
                      });
                    }
                  }}
                  className="px-3.5 py-2 reader-control-btn font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous Chapter</span>
                </button>

                <span className="font-mono-tech text-xs font-semibold reader-text-muted flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 reader-accent-text shrink-0" />
                  <span>
                    Chapter {currentChapter.number} of {book.chapters.length} ·{' '}
                    {overallBookProgressPercent}%
                  </span>
                </span>

                <button
                  type="button"
                  disabled={selectedChapterIdx >= book.chapters.length - 1}
                  onClick={() => {
                    setSelectedChapterIdx((i) =>
                      Math.min(book.chapters.length - 1, i + 1)
                    );
                    if (focusMode && readerSectionRef.current) {
                      readerSectionRef.current.scrollTo({
                        top: 0,
                        behavior: 'smooth',
                      });
                    }
                  }}
                  className="px-3.5 py-2 reader-control-btn-active font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <span>Next Chapter</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
    </section>
  );
};
