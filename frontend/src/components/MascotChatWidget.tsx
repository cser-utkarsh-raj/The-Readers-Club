import React, { useState, useRef, useEffect } from 'react';
import { BookItem, ClubSettings, PresetPersonalityId } from '../types/book';
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
} from 'lucide-react';

export type MascotTaskTier = 'complex' | 'general' | 'fast';

export interface MascotChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  personaId?: PresetPersonalityId;
  timestamp: string;
  isError?: boolean;
}

const MASCOT_STORAGE_KEY = 'the_readers_club_mascot_chat_v1';

interface MascotChatWidgetProps {
  activeBook: BookItem;
  settings: ClubSettings;
}

export const MascotChatWidget: React.FC<MascotChatWidgetProps> = ({
  activeBook,
  settings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [taskTier, setTaskTier] = useState<MascotTaskTier>('fast');
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
        modelUsed: 'gemini-3.1-flash-lite',
        personaId: settings.authorPersonality,
        timestamp: new Date().toISOString(),
      },
    ];
  });

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

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

  const currentChapter = activeBook.chapters[0];
  const chapterExcerpt = currentChapter?.originalText
    ? currentChapter.originalText.slice(0, 2).join('\n\n').slice(0, 1200)
    : activeBook.tagline;

  async function handleSendMessage(customPrompt?: string) {
    const textToSend = (customPrompt ?? inputMessage).trim();
    if (!textToSend || isSending) return;

    const userMsg: MascotChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    const historyForApi = messages
      .filter((m) => !m.isError)
      .slice(-16)
      .map((m) => ({
        role: m.role,
        text: m.text,
      }));

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputMessage('');
    setIsSending(true);

    try {
      const response = await fetch('/api/mascot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: historyForApi,
          taskTier,
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
          modelUsed: data.model || 'gemini-4-argon',
          personaId: settings.authorPersonality,
          timestamp: data.timestamp || new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        const errText =
          data.message ||
          data.error ||
          `Mascot could not respond (HTTP ${response.status}).`;
        setMessages((prev) => [
          ...prev,
          {
            id: `mascot-err-${Date.now()}`,
            role: 'model',
            text: errText,
            timestamp: new Date().toISOString(),
            isError: true,
          },
        ]);
      }
    } catch (err: unknown) {
      const errText =
        err instanceof Error
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
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleClearHistory() {
    const resetMsg: MascotChatMessage = {
      id: `mascot-welcome-${Date.now()}`,
      role: 'model',
      text: `Fresh page! I’m Mascot (speaking in ${activePersona.name}’s voice). What shall we explore in "${activeBook.title}"?`,
      modelUsed:
        taskTier === 'complex'
          ? 'gemini-4-argon'
          : taskTier === 'general'
          ? 'gemini-3.8-flash'
          : 'gemini-3.1-flash-lite',
      personaId: settings.authorPersonality,
      timestamp: new Date().toISOString(),
    };
    setMessages([resetMsg]);
  }

  const quickPrompts = [
    `What is the core theme of ${activeBook.title}?`,
    `Analyze the protagonist's strategy in ${activeBook.title}`,
    `Recommend a similar classic book`,
  ];

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end mascot-chat-widget">
      {/* EXPANDED MASCOT CHAT DRAWER */}
      {isOpen && (
        <section
          aria-label="Mascot Literary Companion Chat"
          className="mb-3 w-[92vw] sm:w-[410px] h-[540px] max-h-[80vh] bg-reader-paper border-[3px] border-[#111] shadow-brutal-lg flex flex-col overflow-hidden"
        >
          {/* Top Header */}
          <div className="px-3.5 py-2.5 bg-[#111] text-white border-b-[3px] border-[#111] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 border-2 border-[#F6C90E] overflow-hidden shrink-0 bg-[#FF1493]">
                <PersonaPortraitSvg personaId={settings.authorPersonality} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-display-brutal text-sm uppercase tracking-tight text-[#F6C90E]">
                    MASCOT
                  </span>
                  <span className="px-1.5 py-0.5 bg-[#E50914] text-white font-mono-tech text-[9px] font-bold uppercase border border-white">
                    {activePersona.name} Mode
                  </span>
                </div>
                <p className="font-mono-tech text-[10px] text-neutral-300 truncate">
                  Reading: {activeBook.title}
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
                aria-label="Close Mascot chat"
                onClick={() => setIsOpen(false)}
                className="p-1.5 bg-[#E50914] hover:bg-[#B8000A] text-white border border-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Model Tier Selector Strip */}
          <div className="px-3 py-1.5 bg-[#ECECEC] border-b-2 border-[#111] flex items-center justify-between gap-1 text-[10px] font-mono-tech">
            <span className="font-bold uppercase text-[#111]">
              Mascot Engine:
            </span>
            <div className="flex items-center gap-1">
              {(
                [
                  {
                    id: 'complex',
                    label: 'Deep (4-Argon)',
                  },
                  {
                    id: 'general',
                    label: 'General (3.8-Flash)',
                  },
                  {
                    id: 'fast',
                    label: 'Fast (3.1-Lite)',
                  },
                ] as { id: MascotTaskTier; label: string }[]
              ).map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setTaskTier(tier.id)}
                  className={`px-2 py-0.5 border border-[#111] font-bold cursor-pointer ${
                    taskTier === tier.id
                      ? 'bg-[#0047FF] text-white'
                      : 'bg-white text-[#111] hover:bg-[#F6C90E]/40'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Message Thread */}
          <div
            ref={scrollContainerRef}
            className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-reader-paper"
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
                  <div className="flex items-center gap-1.5 mb-1 font-mono-tech text-[10px] font-bold text-[#555]">
                    <span>{isUser ? 'YOU' : 'MASCOT'}</span>
                    {!isUser && msg.modelUsed && (
                      <span className="text-[#0047FF]">· {msg.modelUsed}</span>
                    )}
                  </div>

                  <div
                    className={`max-w-[88%] p-3 border-2 border-[#111] text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[#F6C90E] text-[#111] font-medium shadow-brutal-sm'
                        : msg.isError
                        ? 'bg-[#7F1D1D] text-white font-mono-tech'
                        : 'bg-white text-[#111] font-editorial shadow-brutal-sm'
                    }`}
                  >
                    {msg.isError && (
                      <div className="flex items-center gap-1.5 text-[#FDE047] font-bold mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Mascot Notice</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex items-center gap-2 p-2.5 bg-white border-2 border-[#111] w-fit font-mono-tech text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-[#E50914]" />
                <span>Mascot is thinking...</span>
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
                className="px-2 py-1 bg-white hover:bg-[#F6C90E] text-[#111] border border-[#111] font-mono-tech text-[10px] font-bold whitespace-nowrap shrink-0 cursor-pointer"
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
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={`Ask Mascot (${activePersona.name})...`}
              className="flex-1 px-3 py-2 bg-[#F4F4F0] border-2 border-[#111] text-xs sm:text-sm font-medium focus:outline-none focus:bg-white"
            />
            <button
              type="submit"
              aria-label="Send message to Mascot"
              disabled={isSending || !inputMessage.trim()}
              className="px-3.5 py-2 bg-[#111] text-[#F6C90E] border-2 border-[#111] font-display-brutal text-xs uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </section>
      )}

      {/* FLOATING MASCOT LAUNCHER BUTTON */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close Mascot' : 'Open Mascot'}
        className="px-4 py-2.5 bg-[#F6C90E] hover:bg-[#FFE047] text-[#111] border-[3px] border-[#111] shadow-brutal-lg flex items-center gap-2.5 cursor-pointer group transition-transform hover:-translate-y-0.5"
      >
        <ReadersClubLogo className="w-7 h-7 border-[#111]" />
        <div className="text-left">
          <div className="font-display-brutal text-xs sm:text-sm uppercase tracking-tight flex items-center gap-1">
            <span>MASCOT</span>
            <Sparkles className="w-3.5 h-3.5 text-[#E50914]" />
          </div>
          <div className="font-mono-tech text-[10px] font-bold text-[#333]">
            {activePersona.name} · Literary Chat
          </div>
        </div>
        <MessageSquare className="w-4 h-4 ml-1 text-[#111]" />
      </button>
    </div>
  );
};
