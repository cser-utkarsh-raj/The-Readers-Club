import React, { useState, useRef, useEffect } from 'react';
import {
  BookChapter,
  BookItem,
  ClubSettings,
  PresetPersonalityId,
} from '../types/book';
import { PERSONALITY_PROFILES } from '../utils/bookLogic';
import { PersonaPortraitSvg, ReadersClubLogo } from './TactileArt';
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Trash2,
  Loader2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export interface MascotChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  personaId?: PresetPersonalityId;
  timestamp: string;
  isError?: boolean;
  failedPrompt?: string;
}

const MASCOT_STORAGE_KEY = 'the_readers_club_mascot_chat_v1';

interface MascotChatWidgetProps {
  activeBook: BookItem;
  currentChapter?: BookChapter;
  settings: ClubSettings;
  hidden?: boolean;
}

export const MascotChatWidget: React.FC<MascotChatWidgetProps> = ({
  activeBook,
  currentChapter: activeChapterProp,
  settings,
  hidden = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const activePersona =
    PERSONALITY_PROFILES[settings.authorPersonality] ||
    PERSONALITY_PROFILES.gandalf;

  const [messages, setMessages] = useState<MascotChatMessage[]>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(MASCOT_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // Fallback to initial greeting
      }
    }
    return [
      {
        id: 'mascot-welcome',
        role: 'model',
        text: `Welcome to The Readers Club! I’m Mascot, your literary companion—currently channeling ${activePersona.name}. Ask me anything about "${activeBook.title}", dissect a chapter’s themes, or ask what to read next!`,
        personaId: settings.authorPersonality,
        timestamp: new Date().toISOString(),
      },
    ];
  });

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (hidden && isOpen) {
      setIsOpen(false);
    }
  }, [hidden, isOpen]);

  useEffect(() => {
    return () => {
      requestAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(
          MASCOT_STORAGE_KEY,
          JSON.stringify(messages.slice(-40))
        );
      } catch {
        // Ignore storage quota error
      }
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const currentChapter = activeChapterProp || activeBook.chapters[0];
  const chapterExcerpt = currentChapter?.originalText?.length
    ? currentChapter.originalText.slice(0, 2).join('\n\n').slice(0, 1200)
    : activeBook.tagline;

  async function handleSendMessage(customPrompt?: string) {
    const textToSend = (customPrompt ?? inputMessage).trim().slice(0, 2000);
    if (!textToSend || isSending) return;

    const userMsg: MascotChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    const historyForApi = messages
      .filter((m) => !m.isError)
      .slice(-14)
      .map((m) => ({
        role: m.role,
        text: m.text.slice(0, 2000),
      }));

    setMessages((prev) => [...prev.filter((m) => !m.isError), userMsg]);
    if (!customPrompt) setInputMessage('');
    setIsSending(true);

    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 24000);

    try {
      const response = await fetch('/api/mascot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: textToSend,
          history: historyForApi,
          personaName:
            settings.useCustomAuthor && settings.customAuthorTrait.trim()
              ? settings.customAuthorTrait.trim()
              : activePersona.name,
          personaStylePrompt:
            settings.useCustomAuthor && settings.customAuthorTrait.trim()
              ? settings.customAuthorTrait.trim()
              : activePersona.authorStylePrompt,
          bookTitle: activeBook.title,
          bookAuthor: activeBook.author,
          chapterTitle: currentChapter?.title || '',
          chapterExcerpt,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.reply) {
        const botMsg: MascotChatMessage = {
          id: `mascot-${Date.now()}`,
          role: 'model',
          text: String(data.reply),
          personaId: settings.authorPersonality,
          timestamp: data.timestamp || new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        const errText =
          data.message ||
          data.error ||
          `Mascot is temporarily unavailable (HTTP ${response.status}). Please try again in a moment.`;
        setMessages((prev) => [
          ...prev,
          {
            id: `mascot-err-${Date.now()}`,
            role: 'model',
            text: errText,
            timestamp: new Date().toISOString(),
            isError: true,
            failedPrompt: textToSend,
          },
        ]);
      }
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('aborted'));
      const errText = isAbort
        ? 'Request timed out while waiting for Mascot. The literary assistant may be temporarily busy.'
        : err instanceof Error
        ? err.message
        : 'Network error while reaching Mascot.';
      setMessages((prev) => [
        ...prev,
        {
          id: `mascot-err-${Date.now()}`,
          role: 'model',
          text: errText,
          timestamp: new Date().toISOString(),
          isError: true,
          failedPrompt: textToSend,
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setIsSending(false);
    }
  }

  function handleClearHistory() {
    const resetMsg: MascotChatMessage = {
      id: `mascot-welcome-${Date.now()}`,
      role: 'model',
      text: `Fresh page! I’m Mascot (speaking in ${activePersona.name}’s voice). What shall we explore in "${activeBook.title}"?`,
      personaId: settings.authorPersonality,
      timestamp: new Date().toISOString(),
    };
    setMessages([resetMsg]);
  }

  if (hidden) {
    return null;
  }

  const quickPrompts = [
    `What is the core theme of ${activeBook.title}?`,
    currentChapter
      ? `Explain ${currentChapter.title}`
      : `Analyze the protagonist's strategy in ${activeBook.title}`,
    `Recommend a similar classic book`,
  ];

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 flex flex-col items-end mascot-chat-widget select-none">
      {/* EXPANDED MASCOT CHAT DRAWER */}
      {isOpen && (
        <section
          data-testid="mascot-chat-panel"
          aria-label="Mascot Literary Companion Chat"
          className="mb-3 w-[calc(100vw-2rem)] sm:w-[390px] h-[480px] max-h-[75dvh] bg-reader-paper border-[3px] border-[#111] shadow-brutal-lg flex flex-col overflow-hidden"
        >
          {/* Top Header */}
          <div className="px-3.5 py-2.5 bg-[#111] text-white border-b-[3px] border-[#111] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 border-2 border-[#F6C90E] overflow-hidden shrink-0 bg-[#FF1493]">
                <PersonaPortraitSvg personaId={settings.authorPersonality} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-display-brutal text-xs sm:text-sm uppercase tracking-tight text-[#F6C90E]">
                    MASCOT
                  </span>
                  <span className="text-[10px] font-mono-tech text-neutral-300">
                    · {activePersona.name} Voice
                  </span>
                </div>
                <p className="font-mono-tech text-[10px] text-neutral-300 truncate">
                  {activeBook.title}
                  {currentChapter ? ` · Ch. ${currentChapter.number}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Clear Mascot chat history"
                onClick={handleClearHistory}
                className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 cursor-pointer"
                title="Clear Conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-testid="mascot-close-button"
                aria-label="Close Mascot chat"
                onClick={() => setIsOpen(false)}
                className="p-1.5 bg-[#E50914] hover:bg-[#B8000A] text-white border border-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Message Thread */}
          <div
            ref={scrollContainerRef}
            className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-reader-paper select-text"
          >
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 font-mono-tech text-[10px] font-bold text-[#555] select-none">
                    <span>
                      {isUser ? 'YOU' : `MASCOT · ${activePersona.name.toUpperCase()}`}
                    </span>
                  </div>

                  <div
                    className={`max-w-[90%] p-3 border-2 border-[#111] text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#F6C90E] text-[#111] font-medium shadow-brutal-sm'
                        : msg.isError
                        ? 'bg-[#7F1D1D] text-white font-mono-tech'
                        : 'bg-white text-[#111] font-editorial shadow-brutal-sm'
                    }`}
                  >
                    {msg.isError && (
                      <div className="flex items-center gap-1.5 text-[#FDE047] font-bold mb-1 select-none">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Literary Assistant Notice</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    {msg.isError && msg.failedPrompt && (
                      <button
                        type="button"
                        disabled={isSending}
                        onClick={() => void handleSendMessage(msg.failedPrompt)}
                        className="mt-2 px-2.5 py-1 bg-[#F6C90E] text-[#111] border border-white font-mono-tech text-[11px] font-bold flex items-center gap-1 cursor-pointer select-none disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry Question</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex items-center gap-2 p-2.5 bg-white border-2 border-[#111] w-fit font-mono-tech text-xs select-none">
                <Loader2 className="w-4 h-4 animate-spin text-[#E50914]" />
                <span>Consulting the library...</span>
              </div>
            )}
          </div>

          {/* Quick Prompt Chips */}
          <div className="px-3 py-1.5 bg-[#F3EFE6] border-t-2 border-[#111] flex items-center gap-1.5 overflow-x-auto">
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isSending}
                onClick={() => void handleSendMessage(qp)}
                className="px-2 py-1 bg-white hover:bg-[#F6C90E] text-[#111] border border-[#111] font-mono-tech text-[10px] font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {qp}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendMessage();
            }}
            className="p-2.5 bg-white border-t-[3px] border-[#111] flex items-center gap-2"
          >
            <input
              type="text"
              aria-label="Ask Mascot a question"
              maxLength={2000}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={`Ask about "${activeBook.title}"...`}
              className="flex-1 min-w-0 px-3 py-2 bg-[#F4F4F0] border-2 border-[#111] text-xs sm:text-sm font-medium focus:outline-none focus:bg-white select-text"
            />
            <button
              type="submit"
              aria-label="Send message to Mascot"
              disabled={isSending || !inputMessage.trim()}
              className="px-3 py-2 bg-[#111] text-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </section>
      )}

      {/* COMPACT FLOATING MASCOT LAUNCHER BUTTON */}
      <button
        type="button"
        data-testid="mascot-toggle-button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close Mascot' : 'Open Mascot'}
        aria-expanded={isOpen}
        className="px-3.5 py-2 bg-[#F6C90E] hover:bg-[#FFE047] text-[#111] border-[2.5px] border-[#111] shadow-brutal flex items-center gap-2 cursor-pointer transition-transform hover:-translate-y-0.5"
      >
        <ReadersClubLogo className="w-6 h-6 border-[#111] shrink-0" />
        <div className="text-left">
          <div className="font-display-brutal text-xs uppercase tracking-tight flex items-center gap-1 leading-none">
            <span>MASCOT</span>
            <Sparkles className="w-3 h-3 text-[#E50914]" />
          </div>
          <div className="font-mono-tech text-[10px] font-bold text-[#333] leading-tight mt-0.5 hidden sm:block">
            {activePersona.name} · Companion
          </div>
        </div>
        <MessageSquare className="w-3.5 h-3.5 ml-0.5 text-[#111] shrink-0" />
      </button>
    </div>
  );
};

