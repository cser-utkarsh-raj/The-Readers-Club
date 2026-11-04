import React, { useState, useEffect, useRef } from 'react';
import {
  BookChapter,
  BookItem,
  BulletScope,
  ClubSettings,
  PresetPersonalityId,
  SummaryMode,
} from '../types/book';
import {
  PERSONALITY_PROFILES,
  applyPersonaVoiceToParagraphs,
  compressSingleChapterDeterministic,
} from '../utils/bookLogic';
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
    bulletPoints: string[]
  ) => void;
  onHydrateGutenbergChapters?: (
    bookId: string,
    extracted: Array<{ number: number; title: string; originalText: string[] }>
  ) => void;
  onOpenSettingsTab: () => void;
  onBackToCatalog?: () => void;
}

export const ReaderWorkspace: React.FC<ReaderWorkspaceProps> = ({
  book,
  activeMode,
  onSelectMode,
  settings,
  onUpdateSettings,
  onUpdateBookChapter,
  onHydrateGutenbergChapters,
  onOpenSettingsTab,
  onBackToCatalog,
}) => {
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(0);
  const [bulletScope, setBulletScope] = useState<BulletScope>('chapter');
  const [isAiRewriting, setIsAiRewriting] = useState(false);
  const [isBatchCompressing, setIsBatchCompressing] = useState(false);
  const [aiStatusBanner, setAiStatusBanner] = useState<string | null>(null);

  // Audiobook Playback State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [activeAudioParagraphIdx, setActiveAudioParagraphIdx] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [audioSourceLabel, setAudioSourceLabel] = useState<string>(
    'Ready to Listen'
  );

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setSelectedChapterIdx(0);
    stopAudioPlayback();

    if (book.gutenbergId && book.isPreCompressed === false && onHydrateGutenbergChapters) {
      let cancelled = false;
      fetch(`/api/books/gutenberg-chapters?gutenbergId=${book.gutenbergId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (
            !cancelled &&
            data &&
            Array.isArray(data.chapters) &&
            data.chapters.length >= 6
          ) {
            onHydrateGutenbergChapters(book.id, data.chapters);
          }
        })
        .catch(() => {
          // Keep structured chapters
        });
      return () => {
        cancelled = true;
      };
    }
  }, [book.id]);

  useEffect(() => {
    return () => {
      stopAudioPlayback();
    };
  }, []);

  const currentChapter =
    book.chapters[selectedChapterIdx] || book.chapters[0];

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
      ? `custom:${settings.customAuthorTrait.trim()}`
      : settings.authorPersonality;

  function isChapterCompressed(ch: BookChapter): boolean {
    if (book.isPreCompressed !== false) return true;
    if (ch.isCompressed) return true;
    if (ch.personaCompactCache?.[personaCacheKey]?.length) return true;
    return ch.compactText && ch.compactText.length > 0;
  }

  const currentChapterIsCompressed = isChapterCompressed(currentChapter);

  const compressedChaptersCount = book.chapters.filter((ch) =>
    isChapterCompressed(ch)
  ).length;

  const displayedCompactParagraphs = currentChapterIsCompressed
    ? currentChapter.personaCompactCache?.[personaCacheKey] ||
      applyPersonaVoiceToParagraphs(
        currentChapter.compactText,
        settings.authorPersonality,
        currentChapter.title,
        settings.useCustomAuthor ? settings.customAuthorTrait : undefined
      )
    : [];

  const displayedChapterBullets = currentChapterIsCompressed
    ? currentChapter.personaBulletCache?.[personaCacheKey] ||
      currentChapter.bulletPoints
    : [];

  function stopAudioPlayback() {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setIsGeneratingTts(false);
  }

  async function compressSpecificChapter(targetChapter: BookChapter) {
    const stylePrompt =
      settings.useCustomAuthor && settings.customAuthorTrait.trim()
        ? `Summarize with the personality of: ${settings.customAuthorTrait.trim()}. Keep all chapter facts and narrative flow intact.`
        : authorProfile.authorStylePrompt;

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: book.title,
          chapterTitle: targetChapter.title,
          chapterNumber: targetChapter.number,
          totalChapters: book.chapters.length,
          originalText: targetChapter.originalText,
          originalPages: targetChapter.originalPages,
          targetCompactPages: targetChapter.compactPages,
          authorPersonaName: activeAuthorDisplayName,
          authorStylePrompt: stylePrompt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.compactText) && data.compactText.length > 0) {
          onUpdateBookChapter(
            book.id,
            targetChapter.id,
            personaCacheKey,
            data.compactText,
            Array.isArray(data.bulletPoints) && data.bulletPoints.length > 0
              ? data.bulletPoints
              : targetChapter.bulletPoints
          );
          return;
        }
      }
    } catch {
      // Deterministic per-chapter fallback below
    }

    const deterministic = compressSingleChapterDeterministic(
      targetChapter,
      book.title,
      book.author,
      settings.authorPersonality,
      settings.useCustomAuthor ? settings.customAuthorTrait : undefined
    );

    onUpdateBookChapter(
      book.id,
      targetChapter.id,
      personaCacheKey,
      deterministic.compactText,
      deterministic.bulletPoints
    );
  }

  async function handleCompressCurrentChapter() {
    if (isAiRewriting) return;
    setIsAiRewriting(true);
    setAiStatusBanner(
      `Creating ${activeAuthorDisplayName}'s summary for Chapter ${currentChapter.number}...`
    );

    await compressSpecificChapter(currentChapter);

    setAiStatusBanner(
      `Chapter ${currentChapter.number} is ready in ${activeAuthorDisplayName}'s voice.`
    );
    setIsAiRewriting(false);
  }

  async function handleCompressAllChaptersSequentially() {
    if (isBatchCompressing) return;
    setIsBatchCompressing(true);

    const uncompressedList = book.chapters.filter((ch) => !isChapterCompressed(ch));
    for (let i = 0; i < uncompressedList.length; i++) {
      const ch = uncompressedList[i];
      setAiStatusBanner(
        `Summarizing Chapter ${ch.number} of ${book.chapters.length}...`
      );
      await compressSpecificChapter(ch);
    }

    setAiStatusBanner(
      `All ${book.chapters.length} chapters are summarized and ready to read!`
    );
    setIsBatchCompressing(false);
  }

  async function handleToggleAudiobookPlayback(startIdx?: number) {
    if (!currentChapterIsCompressed) {
      await handleCompressCurrentChapter();
    }

    const targetIdx =
      typeof startIdx === 'number' ? startIdx : activeAudioParagraphIdx;

    if (isPlayingAudio && typeof startIdx !== 'number') {
      stopAudioPlayback();
      setAudioSourceLabel('Paused');
      return;
    }

    stopAudioPlayback();
    setActiveAudioParagraphIdx(targetIdx);
    setIsGeneratingTts(true);

    const paragraphs =
      displayedCompactParagraphs.length > 0
        ? displayedCompactParagraphs
        : compressSingleChapterDeterministic(
            currentChapter,
            book.title,
            book.author,
            settings.authorPersonality
          ).compactText;

    const textToRead = paragraphs[targetIdx] || paragraphs[0] || '';

    const narratorPrompt =
      settings.useCustomNarrator && settings.customNarratorTrait.trim()
        ? settings.customNarratorTrait.trim()
        : narratorProfile.narratorStylePrompt;

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToRead,
          voiceName: narratorProfile.ttsVoiceName,
          narratorStylePrompt: narratorPrompt,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          const audio = new Audio(
            `data:${data.mimeType || 'audio/wav'};base64:${data.audioBase64}`
          );
          audio.playbackRate = playbackSpeed;
          audioElementRef.current = audio;
          setIsGeneratingTts(false);
          setIsPlayingAudio(true);
          setAudioSourceLabel(`Narrated by ${activeNarratorDisplayName}`);

          audio.onended = () => {
            if (targetIdx + 1 < paragraphs.length) {
              handleToggleAudiobookPlayback(targetIdx + 1);
            } else {
              setIsPlayingAudio(false);
              setAudioSourceLabel('Chapter Finished');
            }
          };

          await audio.play();
          return;
        }
      }
    } catch {
      // Fallback to Web Speech API
    }

    setIsGeneratingTts(false);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToRead);
      utterance.pitch = narratorProfile.speechPitch;
      utterance.rate = Number((narratorProfile.speechRate * playbackSpeed).toFixed(2));
      speechSynthRef.current = utterance;

      utterance.onend = () => {
        if (targetIdx + 1 < paragraphs.length) {
          handleToggleAudiobookPlayback(targetIdx + 1);
        } else {
          setIsPlayingAudio(false);
          setAudioSourceLabel('Chapter Finished');
        }
      };

      utterance.onerror = () => {
        setIsPlayingAudio(false);
      };

      setIsPlayingAudio(true);
      setAudioSourceLabel(
        `Narrated by ${activeNarratorDisplayName} (${playbackSpeed}x)`
      );
      window.speechSynthesis.speak(utterance);
    } else {
      setIsPlayingAudio(true);
      setAudioSourceLabel(
        `Narrated by ${activeNarratorDisplayName} (${playbackSpeed}x)`
      );
    }
  }

  const summaryModes: {
    id: SummaryMode;
    numberLabel: string;
    shortTitle: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'original',
      numberLabel: 'ORIGINAL',
      shortTitle: 'Full Book',
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: 'compact',
      numberLabel: 'COMPACT',
      shortTitle: `${book.compactTotalPages} Pages`,
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'super_short',
      numberLabel: 'BRIEF',
      shortTitle: 'Quick Read',
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
      shortTitle: 'Listen',
      icon: <Headphones className="w-4 h-4" />,
    },
  ];

  return (
    <section
      aria-label="Book Reader"
      className="bg-reader-paper border-[3px] border-[#111] shadow-brutal-lg rounded-none overflow-hidden flex flex-col"
    >
      {/* Clean Back Bar */}
      {onBackToCatalog && (
        <div className="px-4 py-2.5 bg-[#111] text-white border-b-[3px] border-[#111] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToCatalog}
            className="px-3 py-1 bg-[#F6C90E] text-[#111] font-display-brutal text-xs uppercase border-2 border-white flex items-center gap-1.5 cursor-pointer hover:bg-[#FFE047]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Library</span>
          </button>

          <span className="font-mono-tech text-xs text-neutral-300">
            {book.chapters.length} Chapters · {book.compactTotalPages}-Page Compact Edition
          </span>
        </div>
      )}

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
          {book.originalTotalPages}p Original → {book.compactTotalPages}p Compact
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

      {/* Simple Voice Switcher Toolbar */}
      <div className="px-4 py-2.5 bg-[#ECECEC] border-b-[3px] border-[#111] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono-tech font-bold uppercase text-[#111]">
            Author Voice:
          </span>
          {(['homelander', 'taylor_swift', 'deadpool', 'gandalf'] as PresetPersonalityId[]).map(
            (pid) => {
              const p = PERSONALITY_PROFILES[pid];
              const active = !settings.useCustomAuthor && settings.authorPersonality === pid;
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
            }
          )}
          <button
            type="button"
            onClick={onOpenSettingsTab}
            className="px-2.5 py-1 border-2 border-[#111] bg-white hover:bg-[#F6C90E] text-[#111] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>More Voices</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleCompressCurrentChapter}
          disabled={isAiRewriting || isBatchCompressing}
          className="px-3.5 py-1.5 bg-[#E50914] hover:bg-[#B8000A] text-white border-2 border-[#111] shadow-brutal-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {isAiRewriting
              ? 'Summarizing...'
              : currentChapterIsCompressed
              ? `Rewrite with ${activeAuthorDisplayName}`
              : `Summarize Chapter ${currentChapter.number}`}
          </span>
        </button>
      </div>

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

      {/* Main Reader Body: Chapters Sidebar + Reading Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
        {/* Left Chapters List */}
        <aside
          aria-label="Chapters"
          className="lg:col-span-4 border-b-[3px] lg:border-b-0 lg:border-r-[3px] border-[#111] bg-[#F3EFE6] p-3 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-2 mb-2 border-b-2 border-[#111]">
              <span className="font-display-brutal text-xs uppercase tracking-wider">
                CHAPTERS ({book.chapters.length})
              </span>
              {compressedChaptersCount < book.chapters.length && (
                <button
                  type="button"
                  onClick={handleCompressAllChaptersSequentially}
                  disabled={isBatchCompressing}
                  className="text-[11px] font-mono-tech font-bold text-[#0047FF] hover:underline cursor-pointer"
                >
                  {isBatchCompressing ? 'Summarizing all...' : 'Summarize All'}
                </button>
              )}
            </div>

            <div className="space-y-1.5 max-h-[430px] overflow-y-auto pr-1">
              {book.chapters.map((ch, idx) => {
                const isSelected = idx === selectedChapterIdx;
                const chCompressed = isChapterCompressed(ch);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      setSelectedChapterIdx(idx);
                      stopAudioPlayback();
                    }}
                    className={`w-full text-left p-2.5 border-2 border-[#111] transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-[#111] text-white shadow-brutal-sm'
                        : 'bg-white text-[#111] hover:bg-[#F6C90E]/25'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-mono-tech text-[10px] uppercase opacity-75">
                        <span>Chapter {ch.number}</span>
                        {chCompressed && (
                          <CheckCircle2 className="w-3 h-3 text-[#10B981] inline" />
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
                    Original Text · Chapter {currentChapter.number}
                  </span>
                  <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
                    {currentChapter.title}
                  </h3>
                </div>
                <span className="font-mono-tech text-xs font-bold bg-[#111] text-white px-2.5 py-1">
                  {currentChapter.originalPages} Pages
                </span>
              </div>

              <div className="space-y-4 font-editorial text-base leading-relaxed text-[#18181B]">
                {currentChapter.originalText.map((para, i) => (
                  <p key={i} className="first-letter:font-bold first-letter:text-lg">
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
                  <span className="font-mono-tech text-xs font-bold uppercase text-[#0047FF]">
                    Compact Summary · Chapter {currentChapter.number} of {book.chapters.length}
                  </span>
                  <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
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
                    Summarized by {activeAuthorDisplayName}
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
                    Summarize {currentChapter.title}
                  </h4>
                  <p className="text-sm text-[#333] max-w-md mx-auto">
                    Condense this {currentChapter.originalPages}-page chapter into a{' '}
                    {currentChapter.compactPages}-page summary written in{' '}
                    <strong>{activeAuthorDisplayName}&rsquo;s</strong> style.
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
                          : `Summarize Chapter ${currentChapter.number}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCompressAllChaptersSequentially}
                      disabled={isBatchCompressing}
                      className="px-4 py-2.5 bg-[#111] hover:bg-[#222] text-[#F6C90E] font-display-brutal text-xs uppercase border-2 border-[#111] shadow-brutal-sm cursor-pointer"
                    >
                      {isBatchCompressing
                        ? 'Summarizing Book...'
                        : `Summarize All ${book.chapters.length} Chapters`}
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
                      Click to extract key points for this chapter.
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

          {/* MODE 5: AUDIOBOOK */}
          {activeMode === 'audiobook' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                <div>
                  <span className="font-mono-tech text-xs font-bold uppercase text-[#E50914]">
                    Audiobook · Chapter {currentChapter.number}
                  </span>
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
                      <PersonaPortraitSvg personaId={settings.narratorPersonality} />
                    </div>
                    <div>
                      <div className="text-xs font-mono-tech text-[#F6C90E] uppercase">
                        Narrator
                      </div>
                      <div className="font-display-brutal text-lg">
                        {activeNarratorDisplayName}
                      </div>
                      <div className="text-xs text-neutral-300">
                        {audioSourceLabel}
                      </div>
                    </div>
                  </div>

                  {/* Narrator Quick Switcher */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      ['homelander', 'taylor_swift', 'deadpool', 'gandalf'] as PresetPersonalityId[]
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
                            stopAudioPlayback();
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Previous section"
                      onClick={() => {
                        const prev = Math.max(0, activeAudioParagraphIdx - 1);
                        handleToggleAudiobookPlayback(prev);
                      }}
                      className="p-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 cursor-pointer"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleAudiobookPlayback()}
                      disabled={isGeneratingTts}
                      className="px-4 py-2 bg-[#F6C90E] hover:bg-[#DDA900] text-[#111] font-display-brutal text-xs uppercase flex items-center gap-2 cursor-pointer"
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
                            {isGeneratingTts ? 'Loading Audio...' : 'Play Chapter'}
                          </span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      aria-label="Next section"
                      onClick={() => {
                        const next = Math.min(
                          Math.max(0, displayedCompactParagraphs.length - 1),
                          activeAudioParagraphIdx + 1
                        );
                        handleToggleAudiobookPlayback(next);
                      }}
                      className="p-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 cursor-pointer"
                    >
                      <SkipForward className="w-4 h-4" />
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
                        onClick={() => setPlaybackSpeed(spd)}
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

              {currentChapterIsCompressed && (
                <div className="space-y-2.5">
                  {displayedCompactParagraphs.map((para, idx) => {
                    const isCurrent = idx === activeAudioParagraphIdx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleToggleAudiobookPlayback(idx)}
                        className={`w-full text-left p-3.5 border-2 border-[#111] transition-colors cursor-pointer block ${
                          isCurrent
                            ? 'bg-[#F6C90E]/35 shadow-brutal-sm'
                            : 'bg-white hover:bg-neutral-50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono-tech font-bold mb-1">
                          <span className="text-[#E50914]">
                            Part {idx + 1}
                          </span>
                          <span>
                            {isCurrent && isPlayingAudio ? '▶ Playing' : 'Tap to Listen'}
                          </span>
                        </div>
                        <p className="font-editorial text-sm sm:text-base text-[#111] leading-relaxed">
                          {para}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Bottom Chapter Prev/Next Bar */}
          <div className="mt-6 pt-4 border-t-2 border-[#111] flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={selectedChapterIdx === 0}
              onClick={() => {
                setSelectedChapterIdx((i) => Math.max(0, i - 1));
                stopAudioPlayback();
              }}
              className="px-3 py-1.5 bg-white border-2 border-[#111] shadow-brutal-sm font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous Chapter</span>
            </button>

            <span className="font-mono-tech text-xs font-bold">
              Chapter {currentChapter.number} of {book.chapters.length}
            </span>

            <button
              type="button"
              disabled={selectedChapterIdx >= book.chapters.length - 1}
              onClick={() => {
                setSelectedChapterIdx((i) =>
                  Math.min(book.chapters.length - 1, i + 1)
                );
                stopAudioPlayback();
              }}
              className="px-3 py-1.5 bg-[#F6C90E] border-2 border-[#111] shadow-brutal-sm font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
            >
              <span>Next Chapter</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
