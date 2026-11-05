import React, { useState, useEffect, useRef } from 'react';
import {
  AudioEngineStatus,
  BookChapter,
  BookItem,
  BookReadingProgress,
  BulletScope,
  ChapterSummaryMetadata,
  ClubSettings,
  PresetPersonalityId,
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
  Sliders,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Loader2,
  ShieldCheck,
  Database,
  FileWarning,
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
}

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
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setFocusMode(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);
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
  ttsChunksRef.current = ttsChunks;

  const detailLevel: SummaryDetailLevel =
    settings.summaryDetailLevel || 'compact';

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
    summaryAbortControllerRef.current?.abort();
    summaryAbortControllerRef.current = null;
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
      stopAndCleanupAudio(true);
    };
  }, []);

  const currentChapter: BookChapter | undefined =
    book.chapters[selectedChapterIdx] || book.chapters[0];

  // Persist chapter selection & mode changes
  useEffect(() => {
    if (!currentChapter) return;
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
    return Boolean(ch.isCompressed && ch.compactText && ch.compactText.length > 0);
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
    targetChapter: BookChapter
  ): Promise<boolean> {
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

    // 1. Check persisted client-side summary cache first
    const cachedEntry = summaryCache[localCacheKey];
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
    summaryAbortControllerRef.current?.abort();
    const controller = new AbortController();
    summaryAbortControllerRef.current = controller;

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
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
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

      // Honest failure handling: NEVER mark chapter as compressed or substitute fake AI text!
      const errorMsg =
        data?.message ||
        data?.error ||
        `AI summarization failed with HTTP ${response.status}.`;
      setAiErrorBanner(errorMsg);
      onMarkChapterSummaryFailed?.(book.id, targetChapter.id, errorMsg);
      return false;
    } catch (err: unknown) {
      if (
        controller.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
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

  async function handleCompressCurrentChapter() {
    if (!currentChapter || isAiRewriting) return;
    setIsAiRewriting(true);
    setAiErrorBanner(null);
    setAiStatusBanner(
      `Generating ${activeAuthorDisplayName}'s ${detailLevel} AI summary for Chapter ${currentChapter.number}...`
    );

    const ok = await compressSpecificChapter(currentChapter);

    if (ok) {
      setAiStatusBanner(
        `Chapter ${currentChapter.number} AI summary ready in ${activeAuthorDisplayName}'s voice.`
      );
    } else {
      setAiStatusBanner(null);
    }
    setIsAiRewriting(false);
  }

  async function handleCompressAllChaptersSequentially() {
    if (isBatchCompressing) return;
    setIsBatchCompressing(true);
    setAiErrorBanner(null);

    const uncompressedList = book.chapters.filter(
      (ch) => !isChapterCompressed(ch)
    );
    let succeededCount = 0;

    for (let i = 0; i < uncompressedList.length; i++) {
      const ch = uncompressedList[i];
      setAiStatusBanner(
        `Summarizing Chapter ${ch.number} of ${book.chapters.length} via AI...`
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
        `Summarized ${succeededCount} chapter${succeededCount === 1 ? '' : 's'} with verified AI output.`
      );
    }
    setIsBatchCompressing(false);
  }

  // Build source text for TTS (uses verified compact paragraphs if compressed, otherwise original chapter paragraphs)
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

    // Cancel any previous in-flight TTS generation session before starting a new one
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

    // Generate all pending chunks sequentially so audiobook only transitions to READY once all chunks succeed
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

      // Stop sequential generation if a chunk fails—allow per-chunk retry without losing previous chunks
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

    // If this retry succeeded, continue generating any remaining pending chunks
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
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: 'compact',
      numberLabel: 'COMPACT',
      shortTitle:
        book.compactTotalPages > 0
          ? `${book.compactTotalPages} Pages`
          : 'Chapter Summary',
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'super_short',
      numberLabel: 'BRIEF',
      shortTitle: 'Executive Overview',
      icon: <Zap className="w-4 h-4" />,
    },
    {
      id: 'bullet',
      numberLabel: 'HIGHLIGHTS',
      shortTitle: 'Key Points',
      icon: <ListChecks className="w-4 h-4" />,
    },
    {
      id: 'audiobook',
      numberLabel: 'AUDIOBOOK',
      shortTitle: 'Chunked TTS',
      icon: <Headphones className="w-4 h-4" />,
    },
  ];

  // Determine explicit summary status badge for current chapter
  const chapterSummaryBadge = (() => {
    if (!currentChapter) return null;
    if (currentChapter.summaryStatus === 'failed') {
      return {
        label: 'AI SUMMARY FAILED — UNCOMPRESSED',
        className: 'bg-[#E50914] text-white border-[#111]',
      };
    }
    if (currentChapter.summaryMetadata?.status === 'cached') {
      return {
        label: `CACHED AI SUMMARY (${currentChapter.summaryMetadata.model})`,
        className: 'bg-[#0047FF] text-white border-[#111]',
      };
    }
    if (
      currentChapter.summaryStatus === 'ai_generated' ||
      currentChapter.summaryMetadata?.status === 'ai_generated'
    ) {
      return {
        label: `AI GENERATED (${currentChapter.summaryMetadata?.model || 'gemini-3.8-flash'})`,
        className: 'bg-[#10B981] text-[#111] border-[#111]',
      };
    }
    if (book.isPreCompressed !== false || currentChapter.summaryStatus === 'curated_seed') {
      return {
        label: 'CURATED CLUB EDITION',
        className: 'bg-[#F6C90E] text-[#111] border-[#111]',
      };
    }
    return {
      label: 'UNCOMPRESSED ORIGINAL',
      className: 'bg-neutral-200 text-[#111] border-[#111]',
    };
  })();

  return (
    <section
      aria-label="Book Reader"
      data-reading-theme={settings.readingTheme || 'paper'}
      className={"reader-workspace reader-theme-" + (settings.readingTheme || 'paper') + " bg-reader-paper border-[3px] border-[#111] shadow-brutal-lg rounded-none overflow-hidden flex flex-col " + (focusMode ? 'reader-focus-mode' : '')}
    >
      {/* Top Back & Attribution Bar */}
      <div className="px-4 py-2.5 bg-[#111] text-white border-b-[3px] border-[#111] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex gap-1" role="group" aria-label="Reading theme">
            {(['paper', 'sepia', 'evening'] as const).map((theme) => (
              <button key={theme} type="button" aria-pressed={(settings.readingTheme || 'paper') === theme} onClick={() => onUpdateSettings({ readingTheme: theme })} className="px-2 py-1 border border-white bg-neutral-800 text-white font-mono-tech text-[10px] uppercase">
                {theme}
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)} className="px-2 py-1 bg-[#0047FF] text-white border border-white font-mono-tech text-[10px] uppercase">{focusMode ? 'Exit focus (Esc)' : 'Focus reader'}</button>
          {onBackToCatalog && (
            <button
              type="button"
              onClick={onBackToCatalog}
              className="px-3 py-1 bg-[#F6C90E] text-[#111] font-display-brutal text-xs uppercase border-2 border-white flex items-center gap-1.5 cursor-pointer hover:bg-[#FFE047]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Library</span>
            </button>
          )}
          <span
            className="px-2.5 py-0.5 font-mono-tech text-[11px] font-extrabold uppercase border border-white"
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
              className="px-2.5 py-0.5 bg-[#E50914] hover:bg-[#B8000A] text-white font-mono-tech text-[11px] font-bold uppercase border border-white cursor-pointer"
            >
              Remove from Library
            </button>
          )}
        </div>

        <span className="font-mono-tech text-xs text-neutral-300 truncate max-w-xl">
          Source: {book.sourceAttribution || 'The Readers Club Open Literary Archive'}
        </span>
      </div>

      {/* Top Book Header Strip with Original Book Poster */}
      <div
        className="px-4 py-4 border-b-[3px] border-[#111] flex flex-wrap items-center justify-between gap-4"
        style={{ backgroundColor: book.coverColor, color: '#FFFFFF' }}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-16 sm:w-14 sm:h-20 border-2 border-white shadow-brutal-sm shrink-0 overflow-hidden bg-[#111]">
            <BookPosterCover
              title={book.title}
              author={book.author}
              coverUrl={book.coverUrl}
              coverColor={book.coverColor}
              coverAccent={book.coverAccent}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-mono-tech uppercase tracking-wider opacity-95">
              <span>{book.genre}</span>
              <span aria-hidden="true">·</span>
              <span>{book.year}</span>
            </div>
            <h2 className="font-display-brutal text-xl sm:text-2xl uppercase tracking-tight truncate">
              {book.title}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-white/90 truncate">
              by {book.author}
            </p>
          </div>
        </div>

        <div className="bg-[#111] text-[#F6C90E] px-3 py-1.5 border-2 border-white font-mono-tech text-xs font-bold shrink-0">
          {book.chapters.length > 0
            ? `${book.chapters.length} ${
                book.chapterStructure === 'editorial_sections'
                  ? 'Editorial Sections'
                  : 'Chapters'
              } · ${book.originalTotalPages}p Original → ${book.compactTotalPages}p Compact`
            : availabilityStatus === 'metadata_only'
            ? 'Catalog Metadata Record (0 Verifiable Chapters)'
            : 'Verifying Manuscript...'}
        </div>
      </div>

      {/* 5 Clean Reading Mode Tabs */}
      <div
        role="tablist"
        aria-label="Reading Format"
        className="grid grid-cols-2 sm:grid-cols-5 border-b-[3px] border-[#111] bg-[#E5E5E5]"
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
              className={`px-3 py-3 text-left border-r-2 border-b-2 sm:border-b-0 last:border-r-0 border-[#111] transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                isSelected
                  ? 'bg-[#F6C90E] text-[#111] font-extrabold'
                  : 'bg-[#F4F4F0] text-[#222] hover:bg-[#FFF]'
              }`}
            >
              <div>
                <div className="font-display-brutal text-xs tracking-tight">
                  {m.numberLabel}
                </div>
                <div className="text-[11px] font-mono-tech opacity-80">
                  {m.shortTitle}
                </div>
              </div>
              {m.icon}
            </button>
          );
        })}
      </div>

      {/* Voice & Detail Level Toolbar */}
      <div className="px-4 py-2.5 bg-[#ECECEC] border-b-[3px] border-[#111] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono-tech font-bold uppercase text-[#111]">
            Author Voice:
          </span>
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
              !settings.useCustomAuthor && settings.authorPersonality === pid;
            return (
              <button
                key={pid}
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    authorPersonality: pid,
                    useCustomAuthor: false,
                  })
                }
                className={`px-2.5 py-1 border-2 border-[#111] font-bold transition-transform cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#111] text-[#F6C90E] -translate-y-0.5'
                    : 'bg-white text-[#111] hover:bg-[#F6C90E]/30'
                }`}
              >
                {p.name}
              </button>
            );
          })}

          <span className="font-mono-tech font-bold uppercase text-[#111] ml-1">
            Detail:
          </span>
          {(['compact', 'detailed', 'bullet'] as SummaryDetailLevel[]).map(
            (lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onUpdateSettings({ summaryDetailLevel: lvl })}
                className={`px-2 py-1 border-2 border-[#111] font-mono-tech text-[11px] font-bold uppercase cursor-pointer ${
                  detailLevel === lvl
                    ? 'bg-[#0047FF] text-white'
                    : 'bg-white text-[#111] hover:bg-neutral-100'
                }`}
              >
                {lvl}
              </button>
            )
          )}

          <button
            type="button"
            onClick={onOpenSettingsTab}
            className="px-2.5 py-1 border-2 border-[#111] bg-white hover:bg-[#F6C90E] text-[#111] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Voices</span>
          </button>
        </div>

        {currentChapter && (
          <button
            type="button"
            onClick={handleCompressCurrentChapter}
            disabled={isAiRewriting || isBatchCompressing}
            className="px-3.5 py-1.5 bg-[#E50914] hover:bg-[#B8000A] text-white border-2 border-[#111] shadow-brutal-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {isAiRewriting
                ? 'Requesting AI Summary...'
                : `AI Summarize Ch.${currentChapter.number} (${activeAuthorDisplayName})`}
            </span>
          </button>
        )}
      </div>

      {/* Status & Honest AI Failure Banners */}
      {aiStatusBanner && (
        <div className="px-4 py-2 bg-[#111] text-[#F6C90E] font-mono-tech text-xs flex items-center justify-between">
          <span>{aiStatusBanner}</span>
          <button
            type="button"
            onClick={() => setAiStatusBanner(null)}
            className="underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {aiErrorBanner && (
        <div
          role="alert"
          className="px-4 py-3 bg-[#7F1D1D] text-white border-b-[3px] border-[#111] font-mono-tech text-xs flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#FDE047] shrink-0" />
            <span>
              <strong>AI Summarization Unavailable:</strong> {aiErrorBanner}{' '}
              (Chapter kept uncompressed; no synthetic fallback text was substituted.)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCompressCurrentChapter}
              className="px-2.5 py-1 bg-[#F6C90E] text-[#111] font-bold border border-white cursor-pointer"
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

      {/* SPECIAL CASE 1: LOADING PROJECT GUTENBERG FULL TEXT */}
      {isLoadingGutenbergText && (
        <div className="p-12 bg-reader-paper flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-9 h-9 animate-spin text-[#0047FF]" />
          <h3 className="font-display-brutal text-lg uppercase text-[#111]">
            Retrieving Authentic Public-Domain Manuscript
          </h3>
          <p className="text-xs sm:text-sm font-mono-tech text-[#444] max-w-md">
            Fetching complete chapter text for {book.title} (Project Gutenberg #{book.gutenbergId})...
          </p>
        </div>
      )}

      {/* SPECIAL CASE 2: METADATA ONLY / EXTRACTION FAILED / NO CHAPTERS */}
      {!isLoadingGutenbergText && (!currentChapter || book.chapters.length === 0) && (
        <div className="p-8 sm:p-10 bg-reader-paper space-y-6">
          <div className="max-w-2xl mx-auto bg-white border-[3px] border-[#111] shadow-brutal-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              {availabilityStatus === 'extraction_failed' || gutenbergFetchError ? (
                <FileWarning className="w-7 h-7 text-[#E50914] shrink-0" />
              ) : (
                <Database className="w-7 h-7 text-[#F97316] shrink-0" />
              )}
              <div>
                <span className="font-mono-tech text-xs font-bold uppercase text-[#E50914]">
                  {availabilityStatus === 'extraction_failed' || gutenbergFetchError
                    ? 'Manuscript Extraction Failed'
                    : 'Catalog Metadata Record Only'}
                </span>
                <h3 className="font-display-brutal text-xl uppercase text-[#111]">
                  {book.title} — Full Manuscript Not Attached
                </h3>
              </div>
            </div>

            <p className="text-sm text-[#222] leading-relaxed font-medium">
              {gutenbergFetchError ||
                book.extractionError ||
                `This entry was discovered via ${
                  book.sourceAttribution || 'Google Books Discovery Catalog'
                }. Because full public-domain text is not available from this discovery record, The Readers Club never fabricates synthetic chapters from a book description.`}
            </p>

            <div className="p-4 bg-[#F3EFE6] border-2 border-[#111] space-y-1.5">
              <div className="font-mono-tech text-xs font-bold uppercase text-[#111]">
                Verified Catalog Synopsis
              </div>
              <p className="font-editorial text-sm text-[#222] leading-relaxed">
                {book.tagline || book.superShortExecutiveSummary.thesis}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {book.gutenbergId && (
                <button
                  type="button"
                  onClick={() => void fetchGutenbergManuscript()}
                  className="px-4 py-2 bg-[#0047FF] text-white border-2 border-[#111] shadow-brutal-sm font-display-brutal text-xs uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Gutenberg Retrieval</span>
                </button>
              )}
              {onOpenUploadTab && (
                <button
                  type="button"
                  onClick={onOpenUploadTab}
                  className="px-4 py-2 bg-[#F6C90E] text-[#111] border-2 border-[#111] shadow-brutal-sm font-display-brutal text-xs uppercase cursor-pointer"
                >
                  Upload Your Own EPUB / PDF Copy →
                </button>
              )}
              {onBackToCatalog && (
                <button
                  type="button"
                  onClick={onBackToCatalog}
                  className="px-4 py-2 bg-[#111] text-white border-2 border-[#111] font-display-brutal text-xs uppercase cursor-pointer"
                >
                  Browse Full-Text Public Domain Books
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN READER BODY WHEN VERIFIED CHAPTERS EXIST */}
      {!isLoadingGutenbergText && currentChapter && book.chapters.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
          {/* Left Chapters List */}
          <aside
            aria-label="Chapters"
            className="lg:col-span-4 border-b-[3px] lg:border-b-0 lg:border-r-[3px] border-[#111] bg-[#F3EFE6] p-3 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-2 mb-2 border-b-2 border-[#111]">
                <span className="font-display-brutal text-xs uppercase tracking-wider">
                  {book.chapterStructure === 'editorial_sections'
                    ? `SECTIONS (${book.chapters.length})`
                    : `CHAPTERS (${book.chapters.length})`}
                </span>
                {compressedChaptersCount < book.chapters.length && (
                  <button
                    type="button"
                    onClick={handleCompressAllChaptersSequentially}
                    disabled={isBatchCompressing}
                    className="text-[11px] font-mono-tech font-bold text-[#0047FF] hover:underline cursor-pointer"
                  >
                    {isBatchCompressing
                      ? 'Summarizing all...'
                      : 'AI Summarize All'}
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-[430px] overflow-y-auto pr-1">
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
                      }}
                      className={`w-full text-left p-2.5 border-2 border-[#111] transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-[#111] text-white shadow-brutal-sm'
                          : 'bg-white text-[#111] hover:bg-[#F6C90E]/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-mono-tech text-[10px] uppercase opacity-75">
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
                            <CheckCircle2 className="w-3 h-3 text-[#10B981] inline" />
                          )}
                          {chFailed && (
                            <AlertTriangle className="w-3 h-3 text-[#E50914] inline" />
                          )}
                        </div>
                        <div className="font-bold text-xs leading-snug line-clamp-1 mt-0.5">
                          {ch.title.replace(/^Chapter\s+\d+[:.-]?\s*/i, '')}
                        </div>
                      </div>
                      <span
                        className={`font-mono-tech text-[11px] font-bold px-1.5 py-0.5 border shrink-0 ${
                          isSelected
                            ? 'bg-[#F6C90E] text-[#111] border-[#F6C90E]'
                            : 'bg-[#F3EFE6] text-[#111] border-[#111]'
                        }`}
                      >
                        {ch.compactPages}p
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Right Reading / Listening Pane */}
          <div className="lg:col-span-8 p-5 sm:p-6 flex flex-col justify-between bg-reader-paper">
            {/* MODE 1: ORIGINAL */}
            {activeMode === 'original' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                  <div>
                    <span className="font-mono-tech text-xs font-bold uppercase text-[#E50914]">
                      {book.chapterStructure === 'editorial_sections'
                        ? `Condensed Editorial Excerpt · Section ${currentChapter.number}`
                        : `Original Manuscript · Chapter ${currentChapter.number}`}
                      {currentChapter.pageStart && currentChapter.pageEnd
                        ? ` (PDF Pages ${currentChapter.pageStart}–${currentChapter.pageEnd})`
                        : ''}
                    </span>
                    <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
                      {currentChapter.title}
                    </h3>
                  </div>
                  <span className="font-mono-tech text-xs font-bold bg-[#111] text-white px-2.5 py-1">
                    {currentChapter.originalPages} Pages
                  </span>
                </div>

                {book.availabilityStatus === 'condensed_edition' &&
                  book.gutenbergId && (
                    <div className="p-3 bg-[#F6C90E]/30 border-2 border-[#111] flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-bold">
                          Curated Condensed Edition ({book.chapters.length} Editorial Sections):
                        </span>{' '}
                        Full unabridged public-domain chapters are available from Project Gutenberg (#{book.gutenbergId}).
                      </div>
                      <button
                        type="button"
                        onClick={() => void fetchGutenbergManuscript()}
                        className="px-3 py-1 bg-[#111] text-[#F6C90E] font-mono-tech font-bold border border-[#111] cursor-pointer shrink-0 hover:bg-[#222]"
                      >
                        Load Unabridged Gutenberg Text →
                      </button>
                    </div>
                  )}

                <div className="space-y-4 font-editorial text-base leading-relaxed text-[#18181B]">
                  {currentChapter.originalText.map((para, i) => (
                    <p
                      key={i}
                      className="first-letter:font-bold first-letter:text-lg"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* MODE 2: COMPACT */}
            {activeMode === 'compact' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-tech text-xs font-bold uppercase text-[#0047FF]">
                        Compact Summary · Chapter {currentChapter.number} of{' '}
                        {book.chapters.length}
                      </span>
                      {chapterSummaryBadge && (
                        <span
                          className={`px-2 py-0.5 font-mono-tech text-[10px] font-bold border ${chapterSummaryBadge.className}`}
                        >
                          {chapterSummaryBadge.label}
                        </span>
                      )}
                    </div>
                    <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-1">
                      {currentChapter.title}
                    </h3>
                  </div>
                  <div className="font-mono-tech text-xs font-bold bg-[#F6C90E] text-[#111] border-2 border-[#111] px-2.5 py-1">
                    {currentChapter.compactPages} Pages
                  </div>
                </div>

                {/* Active Author Card */}
                <div className="flex items-center gap-3 p-3 bg-white border-2 border-[#111] shadow-brutal-sm">
                  <div className="w-12 h-12 border-2 border-[#111] shrink-0 overflow-hidden">
                    <PersonaPortraitSvg personaId={settings.authorPersonality} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold uppercase tracking-wide text-[#111]">
                      Adapter Persona: {activeAuthorDisplayName}
                    </div>
                    <p className="text-xs text-[#444] truncate mt-0.5">
                      {authorProfile.tagline}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectMode('audiobook')}
                    className="px-3 py-1.5 bg-[#111] text-[#F6C90E] font-mono-tech text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 hover:bg-[#333]"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>Listen</span>
                  </button>
                </div>

                {!currentChapterIsCompressed ? (
                  <div className="p-6 bg-white border-[3px] border-[#111] shadow-brutal text-center space-y-4 my-4">
                    <h4 className="font-display-brutal text-lg uppercase text-[#111]">
                      {currentChapter.summaryStatus === 'failed'
                        ? `AI Summarization Failed for ${currentChapter.title}`
                        : `Generate AI Summary for ${currentChapter.title}`}
                    </h4>
                    <p className="text-sm text-[#333] max-w-md mx-auto">
                      {currentChapter.summaryStatus === 'failed'
                        ? currentChapter.summaryErrorMessage ||
                          'The AI summarization request could not be completed. The chapter remains uncompressed so we never show fake AI output.'
                        : `Condense this ${currentChapter.originalPages}-page chapter into a ${currentChapter.compactPages}-page ${detailLevel} summary written in ${activeAuthorDisplayName}’s voice.`}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={handleCompressCurrentChapter}
                        disabled={isAiRewriting}
                        className="px-5 py-2.5 bg-[#E50914] hover:bg-[#B8000A] text-white font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm flex items-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>
                          {isAiRewriting
                            ? 'Summarizing...'
                            : currentChapter.summaryStatus === 'failed'
                            ? `Retry AI Summary (Ch.${currentChapter.number})`
                            : `AI Summarize Chapter ${currentChapter.number}`}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectMode('original')}
                        className="px-4 py-2.5 bg-[#111] hover:bg-[#222] text-[#F6C90E] font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm cursor-pointer"
                      >
                        Read Original Chapter Text
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 font-editorial text-base leading-relaxed text-[#111]">
                    {displayedCompactParagraphs.map((para, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-white border-2 border-[#111]"
                      >
                        <p>{para}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MODE 3: BRIEF (2-4 PAGE SUMMARY) */}
            {activeMode === 'super_short' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                  <div>
                    <span className="font-mono-tech text-xs font-bold uppercase text-[#E50914]">
                      Quick Overview
                    </span>
                    <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
                      {book.title} — {book.superShortPages}-Page Summary
                    </h3>
                  </div>
                </div>

                <div className="p-4 bg-[#F6C90E] border-2 border-[#111] shadow-brutal-sm">
                  <div className="font-mono-tech text-xs font-bold uppercase">
                    Core Theme
                  </div>
                  <p className="font-editorial font-semibold text-base mt-1 text-[#111]">
                    {book.superShortExecutiveSummary.thesis}
                  </p>
                </div>

                <div className="space-y-3">
                  {book.superShortExecutiveSummary.executivePages.map(
                    (pageText, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-white border-2 border-[#111] font-editorial text-sm sm:text-base leading-relaxed"
                      >
                        <div className="font-mono-tech text-xs font-bold text-[#E50914] mb-1">
                          Page {idx + 1} of {book.superShortPages}
                        </div>
                        <p>{pageText}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* MODE 4: HIGHLIGHTS (BULLETS) */}
            {activeMode === 'bullet' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                  <div>
                    <span className="font-mono-tech text-xs font-bold uppercase text-[#0047FF]">
                      Key Highlights
                    </span>
                    <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
                      {bulletScope === 'chapter'
                        ? currentChapter.title
                        : `${book.title} — All Chapters`}
                    </h3>
                  </div>

                  <div className="flex items-center border-2 border-[#111] bg-white">
                    <button
                      type="button"
                      onClick={() => setBulletScope('chapter')}
                      className={`px-3 py-1 text-xs font-bold cursor-pointer whitespace-nowrap ${
                        bulletScope === 'chapter'
                          ? 'bg-[#111] text-[#F6C90E]'
                          : 'text-[#111] hover:bg-[#EEE]'
                      }`}
                    >
                      This Chapter
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulletScope('entire_book')}
                      className={`px-3 py-1 text-xs font-bold border-l-2 border-[#111] cursor-pointer whitespace-nowrap ${
                        bulletScope === 'entire_book'
                          ? 'bg-[#111] text-[#F6C90E]'
                          : 'text-[#111] hover:bg-[#EEE]'
                      }`}
                    >
                      Entire Book
                    </button>
                  </div>
                </div>

                {bulletScope === 'chapter' && !currentChapterIsCompressed ? (
                  <div className="p-5 bg-white border-2 border-[#111] shadow-brutal-sm flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-display-brutal text-sm uppercase text-[#111]">
                        Generate Chapter {currentChapter.number} Highlights
                      </div>
                      <p className="text-xs text-[#444] mt-0.5">
                        Click to generate verified AI bullet takeaways for this chapter.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCompressCurrentChapter}
                      className="px-4 py-2 bg-[#E50914] text-white font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm cursor-pointer"
                    >
                      Generate Highlights
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {(bulletScope === 'chapter'
                      ? displayedChapterBullets
                      : book.masterBookBullets
                    ).map((item, idx) => (
                      <li
                        key={idx}
                        className="p-3.5 bg-white border-2 border-[#111] shadow-brutal-sm flex items-start gap-3"
                      >
                        <span className="w-6 h-6 bg-[#E50914] text-white font-mono-tech text-xs font-bold flex items-center justify-center border border-[#111] shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="text-sm sm:text-base font-medium text-[#111] leading-relaxed">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* MODE 5: LONG-FORM CHUNKED AUDIOBOOK */}
            {activeMode === 'audiobook' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tech text-xs font-bold uppercase text-[#E50914]">
                        Long-Form Audiobook · Chapter {currentChapter.number}
                      </span>
                      <span
                        className={`px-2 py-0.5 font-mono-tech text-[10px] font-bold uppercase border border-[#111] ${
                          audioEngineStatus === 'ready' ||
                          audioEngineStatus === 'playing'
                            ? 'bg-[#10B981] text-[#111]'
                            : audioEngineStatus === 'failed'
                            ? 'bg-[#E50914] text-white'
                            : audioEngineStatus === 'generating'
                            ? 'bg-[#F6C90E] text-[#111]'
                            : 'bg-neutral-200 text-[#111]'
                        }`}
                      >
                        STATUS: {audioEngineStatus.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
                      {currentChapter.title}
                    </h3>
                  </div>
                  <span className="font-mono-tech text-xs font-bold bg-[#111] text-[#F6C90E] px-2.5 py-1">
                    Narrator: {activeNarratorDisplayName}
                  </span>
                </div>

                <div className="p-4 bg-[#111] text-white border-[3px] border-[#111] shadow-brutal">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 border-2 border-[#F6C90E] overflow-hidden shrink-0">
                        <PersonaPortraitSvg
                          personaId={settings.narratorPersonality}
                        />
                      </div>
                      <div>
                        <div className="text-xs font-mono-tech text-[#F6C90E] uppercase">
                          {usingBrowserSpeechFallback
                            ? 'Browser Speech Synthesis'
                            : `Cloud Neural TTS (${narratorProfile.ttsVoiceName})`}
                        </div>
                        <div className="font-display-brutal text-lg">
                          {activeNarratorDisplayName}
                        </div>
                        <div className="text-xs text-neutral-300 font-mono-tech">
                          {ttsChunks.length > 0
                            ? `Chunk ${activeChunkIdx + 1} of ${ttsChunks.length} · ${
                                ttsChunks.filter((c) => c.status === 'ready')
                                  .length
                              }/${ttsChunks.length} Ready · ${audioPlaybackSeconds}s`
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
                            onClick={() => {
                              stopAndCleanupAudio(true);
                              onUpdateSettings({
                                narratorPersonality: pid,
                                useCustomNarrator: false,
                              });
                            }}
                            className={`px-2.5 py-1 text-xs font-bold border cursor-pointer whitespace-nowrap ${
                              active
                                ? 'bg-[#F6C90E] text-[#111] border-[#F6C90E]'
                                : 'bg-neutral-800 text-white border-neutral-600 hover:bg-neutral-700'
                            }`}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Audio Controls Bar */}
                  <div className="mt-4 pt-3 border-t border-neutral-700 flex flex-wrap items-center justify-between gap-3">
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
                        className="p-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 cursor-pointer"
                      >
                        <SkipBack className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={handlePauseResumeAudio}
                        disabled={audioEngineStatus === 'generating'}
                        className="px-4 py-2 bg-[#F6C90E] hover:bg-[#DDA900] text-[#111] font-display-brutal text-xs uppercase flex items-center gap-2 cursor-pointer disabled:opacity-60"
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
                        className="p-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 cursor-pointer"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePlayBrowserSpeechSynthesis(0)}
                        className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-mono-tech border border-neutral-600 cursor-pointer"
                      >
                        Use Browser Speech
                      </button>
                    </div>

                    {/* Speed Selector */}
                    <div className="flex items-center gap-1.5 font-mono-tech text-xs">
                      <Volume2 className="w-4 h-4 text-[#F6C90E]" />
                      <span>SPEED:</span>
                      {[1.0, 1.25, 1.5].map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => {
                            setPlaybackSpeed(spd);
                            if (audioElementRef.current) {
                              audioElementRef.current.playbackRate = spd;
                            }
                          }}
                          className={`px-2 py-0.5 border cursor-pointer ${
                            playbackSpeed === spd
                              ? 'bg-[#E50914] text-white border-white font-bold'
                              : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Chunk Queue Status & Per-Chunk Retry List */}
                <div className="space-y-2.5">
                  {(ttsChunks.length > 0
                    ? ttsChunks
                    : chunkTextForTts(getAudioSourceParagraphs(), 720)
                  ).map((chunk, idx) => {
                    const isCurrent = idx === activeChunkIdx;
                    const actualChunk = ttsChunks[idx] || chunk;
                    return (
                      <div
                        key={idx}
                        className={`p-3.5 border-2 border-[#111] transition-colors ${
                          isCurrent
                            ? 'bg-[#F6C90E]/35 shadow-brutal-sm'
                            : 'bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tech font-bold mb-1.5">
                          <span className="text-[#E50914]">
                            Audio Segment {idx + 1} ({actualChunk.text.length} chars)
                          </span>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 border border-[#111] uppercase ${
                                actualChunk.status === 'ready'
                                  ? 'bg-[#10B981] text-[#111]'
                                  : actualChunk.status === 'failed'
                                  ? 'bg-[#E50914] text-white'
                                  : actualChunk.status === 'generating'
                                  ? 'bg-[#F6C90E] text-[#111]'
                                  : 'bg-neutral-100 text-[#444]'
                              }`}
                            >
                              {actualChunk.status}
                            </span>

                            {actualChunk.status === 'failed' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleRetrySingleFailedChunk(idx)
                                }
                                className="px-2.5 py-0.5 bg-[#111] text-[#F6C90E] border border-[#111] cursor-pointer flex items-center gap-1"
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
                                className="px-2.5 py-0.5 bg-[#111] text-white cursor-pointer"
                              >
                                {isCurrent && isPlayingAudio
                                  ? '▶ Playing'
                                  : 'Play Segment'}
                              </button>
                            )}
                          </div>
                        </div>

                        {actualChunk.errorMessage && (
                          <div className="text-xs font-mono-tech text-[#E50914] mb-1">
                            Chunk Error: {actualChunk.errorMessage}
                          </div>
                        )}

                        <p className="font-editorial text-sm sm:text-base text-[#111] leading-relaxed">
                          {actualChunk.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom Chapter Prev/Next Bar */}
            <div className="mt-6 pt-4 border-t-2 border-[#111] flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={selectedChapterIdx === 0}
                onClick={() => {
                  setSelectedChapterIdx((i) => Math.max(0, i - 1));
                }}
                className="px-3 py-1.5 bg-white border-2 border-[#111] shadow-brutal-sm font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous Chapter</span>
              </button>

              <span className="font-mono-tech text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#059669]" />
                <span>
                  Chapter {currentChapter.number} of {book.chapters.length}
                </span>
              </span>

              <button
                type="button"
                disabled={selectedChapterIdx >= book.chapters.length - 1}
                onClick={() => {
                  setSelectedChapterIdx((i) =>
                    Math.min(book.chapters.length - 1, i + 1)
                  );
                }}
                className="px-3 py-1.5 bg-[#F6C90E] border-2 border-[#111] shadow-brutal-sm font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
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
