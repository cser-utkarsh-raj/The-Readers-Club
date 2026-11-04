import React, { useState, useEffect, useRef } from 'react';
import {
  BookItem,
  BulletScope,
  ClubSettings,
  PresetPersonalityId,
  SummaryMode,
} from '../types/book';
import {
  PERSONALITY_PROFILES,
  applyPersonaVoiceToParagraphs,
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
  onOpenSettingsTab: () => void;
}

export const ReaderWorkspace: React.FC<ReaderWorkspaceProps> = ({
  book,
  activeMode,
  onSelectMode,
  settings,
  onUpdateSettings,
  onUpdateBookChapter,
  onOpenSettingsTab,
}) => {
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(0);
  const [bulletScope, setBulletScope] = useState<BulletScope>('chapter');
  const [isAiRewriting, setIsAiRewriting] = useState(false);
  const [aiStatusBanner, setAiStatusBanner] = useState<string | null>(null);

  // Audiobook Playback State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [activeAudioParagraphIdx, setActiveAudioParagraphIdx] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [audioSourceLabel, setAudioSourceLabel] = useState<string>(
    'Ready · Studio Audio Edition'
  );

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Reset chapter index when switching books
  useEffect(() => {
    setSelectedChapterIdx(0);
    stopAudioPlayback();
  }, [book.id]);

  // Stop audio when unmounting
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

  const personaCacheKey = settings.useCustomAuthor && settings.customAuthorTrait.trim()
    ? `custom:${settings.customAuthorTrait.trim()}`
    : settings.authorPersonality;

  // Determine the chapter's Compact paragraphs in the active Author Persona
  const displayedCompactParagraphs =
    currentChapter.personaCompactCache?.[personaCacheKey] ||
    applyPersonaVoiceToParagraphs(
      currentChapter.compactText,
      settings.authorPersonality,
      currentChapter.title,
      settings.useCustomAuthor ? settings.customAuthorTrait : undefined
    );

  const displayedChapterBullets =
    currentChapter.personaBulletCache?.[personaCacheKey] ||
    currentChapter.bulletPoints;

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

  async function handleGenerateAiPersonaSummary() {
    if (isAiRewriting) return;
    setIsAiRewriting(true);
    setAiStatusBanner(
      `Composing ${activeAuthorDisplayName} commentary for ${currentChapter.title}...`
    );

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
          chapterTitle: currentChapter.title,
          originalText: currentChapter.originalText,
          originalPages: currentChapter.originalPages,
          targetCompactPages: currentChapter.compactPages,
          authorPersonaName: activeAuthorDisplayName,
          authorStylePrompt: stylePrompt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (
          Array.isArray(data.compactText) &&
          data.compactText.length > 0
        ) {
          onUpdateBookChapter(
            book.id,
            currentChapter.id,
            personaCacheKey,
            data.compactText,
            Array.isArray(data.bulletPoints) && data.bulletPoints.length > 0
              ? data.bulletPoints
              : currentChapter.bulletPoints
          );
          setAiStatusBanner(
            `Fresh chapter edition composed by ${activeAuthorDisplayName}.`
          );
          setIsAiRewriting(false);
          return;
        }
      }
    } catch {
      // Fallback handled cleanly below
    }

    // Instant deterministic persona rewrite if offline or key not set
    const rewrittenCompact = applyPersonaVoiceToParagraphs(
      currentChapter.compactText,
      settings.authorPersonality,
      currentChapter.title,
      settings.useCustomAuthor ? settings.customAuthorTrait : undefined
    );
    const rewrittenBullets = currentChapter.bulletPoints.map(
      (b, idx) => `[${activeAuthorDisplayName} Note #${idx + 1}] ${b}`
    );

    onUpdateBookChapter(
      book.id,
      currentChapter.id,
      personaCacheKey,
      rewrittenCompact,
      rewrittenBullets
    );
    setAiStatusBanner(
      `${activeAuthorDisplayName} Edition applied to ${currentChapter.title}.`
    );
    setIsAiRewriting(false);
  }

  async function handleToggleAudiobookPlayback(startIdx?: number) {
    const targetIdx =
      typeof startIdx === 'number' ? startIdx : activeAudioParagraphIdx;

    if (isPlayingAudio && typeof startIdx !== 'number') {
      stopAudioPlayback();
      setAudioSourceLabel('Paused · Studio Audio Edition');
      return;
    }

    stopAudioPlayback();
    setActiveAudioParagraphIdx(targetIdx);
    setIsGeneratingTts(true);

    const textToRead =
      displayedCompactParagraphs[targetIdx] ||
      displayedCompactParagraphs[0] ||
      '';

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
          setAudioSourceLabel(
            `Studio Voice (${activeNarratorDisplayName} · ${narratorProfile.ttsVoiceName})`
          );

          audio.onended = () => {
            if (targetIdx + 1 < displayedCompactParagraphs.length) {
              handleToggleAudiobookPlayback(targetIdx + 1);
            } else {
              setIsPlayingAudio(false);
              setAudioSourceLabel('Chapter Audio Complete');
            }
          };

          await audio.play();
          return;
        }
      }
    } catch {
      // Fallback to Web Speech API
    }

    // Immediate Web Speech Synthesis with Narrator Persona Pitch & Rate
    setIsGeneratingTts(false);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToRead);
      utterance.pitch = narratorProfile.speechPitch;
      utterance.rate = Number((narratorProfile.speechRate * playbackSpeed).toFixed(2));
      speechSynthRef.current = utterance;

      utterance.onend = () => {
        if (targetIdx + 1 < displayedCompactParagraphs.length) {
          handleToggleAudiobookPlayback(targetIdx + 1);
        } else {
          setIsPlayingAudio(false);
          setAudioSourceLabel('Chapter Audio Complete');
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
        `${activeNarratorDisplayName} Audio Stream (${playbackSpeed}x)`
      );
    }
  }

  const summaryModes: {
    id: SummaryMode;
    numberLabel: string;
    shortTitle: string;
    badgeNote: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'original',
      numberLabel: 'ORIGINAL',
      shortTitle: `${book.originalTotalPages}p Full Text`,
      badgeNote: 'Unabridged',
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: 'compact',
      numberLabel: 'COMPACT',
      shortTitle: `${book.compactTotalPages}p Chapterwise`,
      badgeNote: 'Club Edition',
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'super_short',
      numberLabel: 'EXECUTIVE',
      shortTitle: `${book.superShortPages}p Briefing`,
      badgeNote: 'Digest',
      icon: <Zap className="w-4 h-4" />,
    },
    {
      id: 'bullet',
      numberLabel: 'KEY POINTS',
      shortTitle: 'Chapter / Book',
      badgeNote: 'Takeaways',
      icon: <ListChecks className="w-4 h-4" />,
    },
    {
      id: 'audiobook',
      numberLabel: 'AUDIOBOOK',
      shortTitle: 'Studio Audio',
      badgeNote: 'Narrated',
      icon: <Headphones className="w-4 h-4" />,
    },
  ];

  const compressionPercent = Math.round(
    (1 - book.compactTotalPages / Math.max(1, book.originalTotalPages)) * 100
  );

  return (
    <section
      aria-label="Active Book Reader Studio"
      className="bg-reader-paper border-[3px] border-[#111] shadow-brutal-lg rounded-none overflow-hidden flex flex-col"
    >
      {/* Top Book Header Strip with Original Book Poster */}
      <div
        className="px-4 py-3.5 border-b-[3px] border-[#111] flex flex-wrap items-center justify-between gap-4"
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
              {book.title} — {book.author}
            </h2>
            <p className="text-xs text-white/85 truncate max-w-xl mt-0.5">
              {book.tagline}
            </p>
          </div>
        </div>

        {/* Proportional Page Math Readout */}
        <div className="bg-[#111] text-[#F6C90E] px-3 py-1.5 border-2 border-white font-mono-tech text-xs font-bold shrink-0">
          {book.originalTotalPages}p ORIGINAL → {book.compactTotalPages}p COMPACT ({compressionPercent}% CONDENSED · {book.chapters.length} CHAPTERS)
        </div>
      </div>

      {/* 5 Summary Mode Selector Bar */}
      <div
        role="tablist"
        aria-label="Reading Format Selector"
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
              className={`px-3 py-2.5 text-left border-r-2 border-b-2 sm:border-b-0 last:border-r-0 border-[#111] transition-colors cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-[#F6C90E] text-[#111] font-extrabold'
                  : 'bg-[#F4F4F0] text-[#222] hover:bg-[#FFF]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-display-brutal text-xs tracking-tight whitespace-nowrap">
                  {m.numberLabel}
                </span>
                {m.icon}
              </div>
              <div className="mt-1 flex items-center justify-between gap-1 text-[11px] font-mono-tech">
                <span className="truncate font-semibold">{m.shortTitle}</span>
                <span className="opacity-75 hidden xl:inline">· {m.badgeNote}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Persona & Chapter Navigation Toolbar */}
      <div className="px-4 py-2.5 bg-[#ECECEC] border-b-[3px] border-[#111] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono-tech font-bold uppercase text-[#111]">
            Editorial Voice:
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
            <span>Voice Studio</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleGenerateAiPersonaSummary}
          disabled={isAiRewriting}
          className="px-3 py-1.5 bg-[#E50914] hover:bg-[#B8000A] text-white border-2 border-[#111] shadow-brutal-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {isAiRewriting
              ? 'Composing Chapter...'
              : `Compose in ${activeAuthorDisplayName}'s Voice`}
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

      {/* Main Reader Body: Chapter Sidebar + Manuscript Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[460px]">
        {/* Left Chapter-wise Structure Sidebar */}
        <aside
          aria-label="Chapter Table of Contents"
          className="lg:col-span-4 border-b-[3px] lg:border-b-0 lg:border-r-[3px] border-[#111] bg-[#F3EFE6] p-3 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-2 mb-2 border-b-2 border-[#111]">
              <span className="font-display-brutal text-xs uppercase tracking-wider">
                CHAPTER INDEX ({book.chapters.length})
              </span>
              <span className="font-mono-tech text-[11px] font-bold">
                ORIG → COMPACT
              </span>
            </div>

            <div className="space-y-1.5">
              {book.chapters.map((ch, idx) => {
                const isSelected = idx === selectedChapterIdx;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      setSelectedChapterIdx(idx);
                      stopAudioPlayback();
                    }}
                    className={`w-full text-left p-2.5 border-2 border-[#111] transition-all cursor-pointer flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'bg-[#111] text-white shadow-brutal-sm'
                        : 'bg-white text-[#111] hover:bg-[#F6C90E]/25'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono-tech text-[10px] uppercase opacity-75">
                        CHAPTER 0{ch.number}
                      </div>
                      <div className="font-bold text-xs leading-snug line-clamp-2">
                        {ch.title.replace(/^Chapter\s+\d+[:.-]?\s*/i, '')}
                      </div>
                    </div>
                    <div
                      className={`font-mono-tech text-[11px] font-bold px-1.5 py-0.5 border shrink-0 ${
                        isSelected
                          ? 'bg-[#F6C90E] text-[#111] border-[#F6C90E]'
                          : 'bg-[#F3EFE6] text-[#111] border-[#111]'
                      }`}
                    >
                      {ch.originalPages}p→{ch.compactPages}p
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chapter Proportional Ratio Footnote */}
          <div className="mt-4 p-2.5 bg-white border-2 border-[#111] text-[11px] leading-relaxed">
            <div className="font-display-brutal uppercase text-[#E50914] text-xs">
              Chapter-Preserving Condensation
            </div>
            <p className="mt-1 text-[#222]">
              Every chapter of the {book.originalTotalPages}-page volume is
              preserved in sequence across a {book.compactTotalPages}-page
              reading edition.
            </p>
          </div>
        </aside>

        {/* Right Reading / Listening Pane */}
        <div className="lg:col-span-8 p-5 sm:p-6 flex flex-col justify-between bg-reader-paper">
          {/* MODE 1: ORIGINAL FULL TEXT */}
          {activeMode === 'original' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                <div>
                  <span className="font-mono-tech text-xs font-bold uppercase text-[#E50914]">
                    UNABRIDGED ARCHIVE TEXT
                  </span>
                  <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
                    {currentChapter.title}
                  </h3>
                </div>
                <span className="font-mono-tech text-xs font-bold bg-[#111] text-white px-2.5 py-1">
                  Original Scale: {currentChapter.originalPages} Pages
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

          {/* MODE 2: COMPACT EDITION */}
          {activeMode === 'compact' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono-tech font-bold text-[#0047FF]">
                    <span>COMPACT CHAPTERWISE EDITION</span>
                    <span aria-hidden="true">·</span>
                    <span>CURATED BY {activeAuthorDisplayName.toUpperCase()}</span>
                  </div>
                  <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
                    {currentChapter.title}
                  </h3>
                </div>
                <div className="font-mono-tech text-xs font-bold bg-[#F6C90E] text-[#111] border-2 border-[#111] px-2.5 py-1">
                  {currentChapter.originalPages}p → {currentChapter.compactPages} Compact Pages
                </div>
              </div>

              {/* Author Persona Callout Strip */}
              <div className="flex items-center gap-3 p-3 bg-white border-2 border-[#111] shadow-brutal-sm">
                <div className="w-12 h-12 border-2 border-[#111] shrink-0 overflow-hidden">
                  <PersonaPortraitSvg personaId={settings.authorPersonality} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wide text-[#111]">
                    Adapted by {activeAuthorDisplayName} ·{' '}
                    <span className="font-normal text-[#444]">
                      {settings.useCustomAuthor && settings.customAuthorTrait
                        ? 'Custom Club Persona'
                        : authorProfile.roleTitle}
                    </span>
                  </div>
                  <p className="text-xs text-[#333] truncate mt-0.5">
                    {authorProfile.tagline}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectMode('audiobook')}
                  className="px-3 py-1.5 bg-[#111] text-[#F6C90E] font-mono-tech text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 hover:bg-[#333]"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Listen Audio</span>
                </button>
              </div>

              {/* Proportional Chapterwise Paragraphs */}
              <div className="space-y-4 font-editorial text-base leading-relaxed text-[#111]">
                {displayedCompactParagraphs.map((para, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-white border-2 border-[#111] relative"
                  >
                    <div className="flex items-center justify-between mb-1.5 font-mono-tech text-[11px] text-[#555]">
                      <span>
                        COMPACT PAGE{' '}
                        {book.chapters
                          .slice(0, selectedChapterIdx)
                          .reduce((acc, c) => acc + c.compactPages, 0) +
                          Math.min(currentChapter.compactPages, idx * 2 + 1)}{' '}
                        OF {book.compactTotalPages}
                      </span>
                      <span>CHAPTER {currentChapter.number} · SECTION {idx + 1}</span>
                    </div>
                    <p>{para}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MODE 3: EXECUTIVE SUMMARY */}
          {activeMode === 'super_short' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                <div>
                  <span className="font-mono-tech text-xs font-bold uppercase text-[#E50914]">
                    EXECUTIVE BRIEFING EDITION
                  </span>
                  <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
                    {book.title} — {book.superShortPages}-Page Executive Synthesis
                  </h3>
                </div>
                <span className="font-mono-tech text-xs font-bold bg-[#111] text-[#F6C90E] px-2.5 py-1">
                  {book.originalTotalPages}p → {book.superShortPages}p Executive Digest
                </span>
              </div>

              <div className="p-4 bg-[#F6C90E] border-2 border-[#111] shadow-brutal-sm">
                <div className="font-mono-tech text-xs font-bold uppercase">
                  CENTRAL THESIS ({activeAuthorDisplayName} EDITION)
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
                        BRIEFING FOLIO 0{idx + 1} OF 0{book.superShortPages}
                      </div>
                      <p>{pageText}</p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* MODE 4: KEY POINTS */}
          {activeMode === 'bullet' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                <div>
                  <span className="font-mono-tech text-xs font-bold uppercase text-[#0047FF]">
                    STRUCTURED KEY TAKEAWAYS
                  </span>
                  <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
                    {bulletScope === 'chapter'
                      ? `${currentChapter.title} — Chapter Key Points`
                      : `${book.title} — Complete Volume Key Points`}
                  </h3>
                </div>

                {/* Toggle between Each Chapter vs Entire Book */}
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
                    Current Chapter
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
                    Full Volume ({book.chapters.length} Ch.)
                  </button>
                </div>
              </div>

              <ul className="space-y-2.5">
                {(bulletScope === 'chapter'
                  ? displayedChapterBullets
                  : book.masterBookBullets
                ).map((item, idx) => (
                  <li
                    key={idx}
                    className="p-3.5 bg-white border-2 border-[#111] shadow-brutal-sm flex items-start gap-3"
                  >
                    <span className="w-6 h-6 bg-[#E50914] text-white font-mono-tech text-xs font-bold flex items-center justify-center border border-[#111] shrink-0 mt-0.5">
                      0{idx + 1}
                    </span>
                    <span className="text-sm sm:text-base font-medium text-[#111] leading-relaxed">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* MODE 5: STUDIO AUDIOBOOK */}
          {activeMode === 'audiobook' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-[#111]">
                <div>
                  <span className="font-mono-tech text-xs font-bold uppercase text-[#E50914]">
                    COMPACT EDITION AUDIOBOOK STUDIO
                  </span>
                  <h3 className="font-display-brutal text-lg sm:text-xl text-[#111] mt-0.5">
                    {currentChapter.title} ({currentChapter.compactPages}p Audio Edition)
                  </h3>
                </div>
                <span className="font-mono-tech text-xs font-bold bg-[#111] text-[#F6C90E] px-2.5 py-1">
                  Narrator: {activeNarratorDisplayName}
                </span>
              </div>

              {/* Tactile Audiobook Cassette / Lanyard Deck */}
              <div className="p-4 bg-[#111] text-white border-[3px] border-[#111] shadow-brutal">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 border-2 border-[#F6C90E] overflow-hidden shrink-0">
                      <PersonaPortraitSvg personaId={settings.narratorPersonality} />
                    </div>
                    <div>
                      <div className="text-xs font-mono-tech text-[#F6C90E] uppercase">
                        STUDIO NARRATOR VOICE
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
                      aria-label="Previous paragraph"
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
                          <span>Pause Compact Audio</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" />
                          <span>
                            {isGeneratingTts
                              ? 'Synthesizing Voice...'
                              : 'Play Compact Audiobook'}
                          </span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      aria-label="Next paragraph"
                      onClick={() => {
                        const next = Math.min(
                          displayedCompactParagraphs.length - 1,
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

              {/* Synchronized Compact Transcript Cards */}
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
                          COMPACT AUDIO TRACK {currentChapter.number}.{idx + 1}
                        </span>
                        <span>
                          {isCurrent && isPlayingAudio
                            ? '▶ NARRATING NOW'
                            : 'CLICK TO LISTEN'}
                        </span>
                      </div>
                      <p className="font-editorial text-sm sm:text-base text-[#111] leading-relaxed">
                        {para}
                      </p>
                    </button>
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
                stopAudioPlayback();
              }}
              className="px-3 py-1.5 bg-white border-2 border-[#111] shadow-brutal-sm font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous Chapter</span>
            </button>

            <span className="font-mono-tech text-xs font-bold">
              Chapter {currentChapter.number} of {book.chapters.length} ·{' '}
              {currentChapter.originalPages}p Orig / {currentChapter.compactPages}p Compact
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
