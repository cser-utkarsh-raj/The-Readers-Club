import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SUMMARIZE_PROMPT_VERSION = 'v1.0.1';

export interface AiModelsClient {
  models: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generateContent: (params: any) => Promise<{
      text?: string;
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: {
              data?: string;
              mimeType?: string;
            };
          }>;
        };
      }>;
    }>;
  };
}

export interface CreateAppOptions {
  aiClient?: AiModelsClient | null;
  fetchImpl?: typeof fetch;
  rateLimitMaxPerWindow?: number;
  rateLimitWindowMs?: number;
  retryBaseDelayMs?: number;
  retryTimeoutMs?: number;
  maxConcurrentAi?: number;
}

export function getSummarizeModelName(): string {
  return (process.env.GEMINI_SUMMARIZE_MODEL || 'gemini-3.8-flash').trim();
}

export function getTtsModelName(): string {
  return (process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts').trim();
}

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 8) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function fetchWithTimeout(
  url: string,
  ms = 6500,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetchImpl(url, { signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

function isPermanentAiError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = Number((err as { status?: unknown }).status);
  if (
    Number.isFinite(status) &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  ) {
    return true;
  }
  const msg = err instanceof Error ? err.message : '';
  if (
    msg.includes('INVALID_ARGUMENT') ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('PERMISSION_DENIED')
  ) {
    return true;
  }
  return false;
}

export async function withRetryAndTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const {
    maxRetries = 2,
    baseDelayMs = 450,
    timeoutMs = 22000,
    signal,
  } = options;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    if (signal?.aborted) {
      throw new Error('AI request cancelled by caller');
    }

    attempt++;
    const attemptController = new AbortController();
    const onCallerAbort = () => attemptController.abort();
    signal?.addEventListener('abort', onCallerAbort, { once: true });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        operation(attemptController.signal),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            attemptController.abort();
            reject(new Error(`AI request timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
      return result;
    } catch (err) {
      lastError = err;
      if (signal?.aborted) {
        throw new Error('AI request cancelled by caller');
      }
      if (isPermanentAiError(err) || attempt > maxRetries) {
        break;
      }
      const jitter = Math.floor(Math.random() * 50);
      const backoff = Math.min(
        3000,
        baseDelayMs * Math.pow(2, attempt - 1) + jitter
      );
      await new Promise<void>((resolve) => {
        const backoffTimer = setTimeout(resolve, backoff);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(backoffTimer);
            resolve();
          },
          { once: true }
        );
      });
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('AI operation failed after retries');
}

function createConcurrencySemaphore(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function runWithLimit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = queue.shift();
      if (next) next();
    }
  };
}

export function computeServerContentHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function splitServerTextIntoChunks(
  paragraphs: string[],
  maxChunkChars = 5500
): Array<{ index: number; text: string; paragraphRange: [number, number] }> {
  const clean = paragraphs
    .map((p) => String(p || '').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
  if (clean.length === 0) return [];

  const chunks: Array<{
    index: number;
    text: string;
    paragraphRange: [number, number];
  }> = [];
  let buf: string[] = [];
  let len = 0;
  let startIdx = 0;

  for (let i = 0; i < clean.length; i++) {
    const p = clean[i];
    if (len > 0 && len + 2 + p.length > maxChunkChars) {
      chunks.push({
        index: chunks.length,
        text: buf.join('\n\n'),
        paragraphRange: [startIdx, i - 1],
      });
      buf = [p];
      len = p.length;
      startIdx = i;
    } else {
      if (buf.length === 0) startIdx = i;
      buf.push(p);
      len = len === 0 ? p.length : len + 2 + p.length;
    }
  }
  if (buf.length > 0) {
    chunks.push({
      index: chunks.length,
      text: buf.join('\n\n'),
      paragraphRange: [startIdx, clean.length - 1],
    });
  }
  return chunks;
}

export interface SummarizeRequestBody {
  bookTitle?: unknown;
  chapterId?: unknown;
  chapterTitle?: unknown;
  chapterNumber?: unknown;
  totalChapters?: unknown;
  originalText?: unknown;
  originalPages?: unknown;
  targetCompactPages?: unknown;
  detailLevel?: unknown;
  authorPersonaId?: unknown;
  authorPersonaName?: unknown;
  authorStylePrompt?: unknown;
  contentHash?: unknown;
}

export function validateSummarizeRequest(body: SummarizeRequestBody): {
  valid: boolean;
  error?: string;
  sanitized?: {
    bookTitle: string;
    chapterId: string;
    chapterTitle: string;
    chapterNumber: number;
    totalChapters: number;
    paragraphs: string[];
    originalPages: number;
    targetCompactPages: number;
    detailLevel: 'compact' | 'detailed' | 'bullet';
    authorPersonaId: string;
    authorPersonaName: string;
    authorStylePrompt: string;
    contentHash: string;
  };
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const bookTitle = String(body.bookTitle || '').trim();
  const chapterTitle = String(body.chapterTitle || '').trim();
  if (!bookTitle || !chapterTitle) {
    return {
      valid: false,
      error: 'Both bookTitle and chapterTitle are required.',
    };
  }

  const rawParas = Array.isArray(body.originalText)
    ? body.originalText.map((p) => String(p || '').trim()).filter(Boolean)
    : typeof body.originalText === 'string' && body.originalText.trim().length > 0
    ? body.originalText
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  const totalChars = rawParas.join(' ').length;
  if (rawParas.length === 0 || totalChars < 20) {
    return {
      valid: false,
      error:
        'Chapter originalText is empty or too short to summarize reliably (minimum 20 characters required).',
    };
  }

  const detailLevel: 'compact' | 'detailed' | 'bullet' =
    body.detailLevel === 'detailed' || body.detailLevel === 'bullet'
      ? body.detailLevel
      : 'compact';

  const chapterNumber = Math.max(1, Number(body.chapterNumber) || 1);
  const totalChapters = Math.max(chapterNumber, Number(body.totalChapters) || 1);
  const originalPages = Math.max(1, Number(body.originalPages) || 10);
  const targetCompactPages = Math.max(1, Number(body.targetCompactPages) || 2);
  const chapterId = String(body.chapterId || `ch-${chapterNumber}`).trim();
  const authorPersonaId = String(body.authorPersonaId || 'gandalf').trim();
  const authorPersonaName = String(body.authorPersonaName || 'Gandalf').trim();
  const authorStylePrompt = String(
    body.authorStylePrompt || 'Summarize with scholarly literary clarity.'
  )
    .trim()
    .slice(0, 800);

  // Always compute contentHash server-side from the sanitized chapter text — never trust client-supplied hashes
  const computedHash = computeServerContentHash(rawParas.join('\n\n'));

  return {
    valid: true,
    sanitized: {
      bookTitle,
      chapterId,
      chapterTitle,
      chapterNumber,
      totalChapters,
      paragraphs: rawParas,
      originalPages,
      targetCompactPages,
      detailLevel,
      authorPersonaId,
      authorPersonaName,
      authorStylePrompt,
      contentHash: computedHash,
    },
  };
}

export function validateSummarizeApiResponse(parsed: unknown): {
  valid: boolean;
  compactText: string[];
  bulletPoints: string[];
} {
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, compactText: [], bulletPoints: [] };
  }
  const obj = parsed as Record<string, unknown>;
  const compactText = Array.isArray(obj.compactText)
    ? obj.compactText
        .map((s) => String(s || '').trim())
        .filter((s) => s.length >= 15)
    : [];
  const bulletPoints = Array.isArray(obj.bulletPoints)
    ? obj.bulletPoints
        .map((s) => String(s || '').trim())
        .filter((s) => s.length >= 10)
    : [];

  if (compactText.length === 0 || bulletPoints.length === 0) {
    return { valid: false, compactText: [], bulletPoints: [] };
  }
  return { valid: true, compactText, bulletPoints };
}

export type MascotTaskTier = 'complex' | 'general' | 'fast';

export function resolveMascotModelTier(tier?: unknown): string {
  if (tier === 'fast') return 'gemini-3.1-flash-lite';
  if (tier === 'general') return 'gemini-3.8-flash';
  return 'gemini-4-argon';
}

export function validateMascotChatRequest(body: unknown): {
  valid: boolean;
  error?: string;
  sanitized?: {
    message: string;
    history: Array<{ role: 'user' | 'model'; text: string }>;
    taskTier: MascotTaskTier;
    modelName: string;
    personaName: string;
    personaStylePrompt: string;
    bookTitle: string;
    bookAuthor: string;
    chapterTitle: string;
    chapterExcerpt: string;
  };
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const obj = body as Record<string, unknown>;
  const message = String(obj.message || '').trim();
  if (!message) {
    return { valid: false, error: 'Message text cannot be empty.' };
  }
  if (message.length > 4000) {
    return {
      valid: false,
      error: 'Message exceeds maximum length of 4,000 characters.',
    };
  }

  const rawHistory = Array.isArray(obj.history) ? obj.history : [];
  const history: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const item of rawHistory.slice(-24)) {
    if (item && typeof item === 'object') {
      const turn = item as Record<string, unknown>;
      const role = turn.role === 'model' ? 'model' : 'user';
      const text = String(turn.text || '').trim().slice(0, 3000);
      if (text) {
        history.push({ role, text });
      }
    }
  }

  const taskTier: MascotTaskTier =
    obj.taskTier === 'complex' || obj.taskTier === 'general'
      ? obj.taskTier
      : 'fast';

  return {
    valid: true,
    sanitized: {
      message,
      history,
      taskTier,
      modelName: resolveMascotModelTier(taskTier),
      personaName: String(obj.personaName || 'Gandalf').trim().slice(0, 80),
      personaStylePrompt: String(
        obj.personaStylePrompt ||
          'Wise, warm, scholarly literary companion of The Readers Club.'
      )
        .trim()
        .slice(0, 800),
      bookTitle: String(obj.bookTitle || 'The Readers Club Library')
        .trim()
        .slice(0, 160),
      bookAuthor: String(obj.bookAuthor || 'Classic Author')
        .trim()
        .slice(0, 120),
      chapterTitle: String(obj.chapterTitle || '').trim().slice(0, 160),
      chapterExcerpt: String(obj.chapterExcerpt || '').trim().slice(0, 2500),
    },
  };
}

// Server-side LRU cache for verified AI summaries
const serverSummaryCache = new Map<
  string,
  {
    compactText: string[];
    bulletPoints: string[];
    metadata: {
      status: 'ai_generated' | 'cached';
      model: string;
      generatedAt: string;
      contentHash: string;
      detailLevel: 'compact' | 'detailed' | 'bullet';
      chunkCount: number;
      sourceCharCount: number;
    };
  }
>();

export function clearServerSummaryCache(): void {
  serverSummaryCache.clear();
}

export function buildServerSummaryCacheKey(params: {
  contentHash: string;
  chapterId: string;
  model: string;
  authorPersonaId: string;
  detailLevel: string;
  targetCompactPages: number;
  authorStylePrompt: string;
  promptVersion?: string;
}): string {
  return computeServerContentHash(
    [
      params.contentHash,
      params.chapterId,
      params.model,
      params.authorPersonaId,
      params.detailLevel,
      String(params.targetCompactPages),
      params.authorStylePrompt,
      params.promptVersion || SUMMARIZE_PROMPT_VERSION,
    ].join('::')
  );
}

/**
 * Extracts real chapters from Project Gutenberg raw text without artificial 5-paragraph truncation.
 */
export function parseGutenbergPlainTextChapters(rawText: string): Array<{
  number: number;
  title: string;
  originalText: string[];
  chapterStructure?: 'original_chapters' | 'editorial_sections';
}> {
  const startMarkerRegex = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;
  const endMarkerRegex = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i;

  const startMatch = rawText.match(startMarkerRegex);
  const endMatch = rawText.match(endMarkerRegex);

  const startIdx = startMatch && startMatch.index !== undefined
    ? startMatch.index + startMatch[0].length
    : 0;
  const endIdx = endMatch && endMatch.index !== undefined
    ? endMatch.index
    : rawText.length;

  const bodyText = rawText.slice(startIdx, endIdx).trim();
  if (bodyText.length < 200) return [];

  const chapterRegex =
    /(?:^|\r?\n)[ \t]*(?:CHAPTER|Chapter|BOOK|Book|PART|Part|CANTO|Canto|ACT|Act|LETTER|Letter|SCENE|Scene|STAVE|Stave)[ \t]+(?:[IVXLCDM\d]+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY|FIRST|SECOND|THIRD|FOURTH|FIFTH|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|First|Second|Third|Fourth|Fifth)\b\.?(?:[ \t]*[:.—-][ \t]*[^\r\n]+)?/g;
  const matches = [...bodyText.matchAll(chapterRegex)];

  const extractedChapters: Array<{
    number: number;
    title: string;
    originalText: string[];
    chapterStructure?: 'original_chapters' | 'editorial_sections';
  }> = [];

  if (matches.length >= 2) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index ?? 0;
      const end =
        i + 1 < matches.length
          ? (matches[i + 1].index ?? bodyText.length)
          : bodyText.length;
      const heading = matches[i][0].replace(/\s+/g, ' ').trim();
      const slice = bodyText.slice(start + matches[i][0].length, end).trim();

      // Skip Table of Contents lines that have very short bodies
      if (slice.length > 350) {
        const paras = slice
          .split(/\r?\n\s*\r?\n/)
          .map((p) => p.replace(/\s+/g, ' ').trim())
          .filter((p) => p.length > 35);
        if (paras.length >= 1) {
          extractedChapters.push({
            number: extractedChapters.length + 1,
            title: heading,
            originalText: paras,
            chapterStructure: 'original_chapters',
          });
        }
      }
    }
  }

  // Fallback for plays, essays, or treatises without "CHAPTER" headings: split into natural sections without truncating
  if (extractedChapters.length === 0) {
    const allParas = bodyText
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 40);

    const parasPerSection = 18;
    for (
      let i = 0;
      i < allParas.length;
      i += parasPerSection
    ) {
      const slice = allParas.slice(i, i + parasPerSection);
      if (slice.length > 0) {
        extractedChapters.push({
          number: extractedChapters.length + 1,
          title: `Section ${extractedChapters.length + 1}`,
          originalText: slice,
          chapterStructure: 'editorial_sections',
        });
      }
    }
  }

  return extractedChapters;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const fetchFn = options.fetchImpl || fetch;
  const resolveAi = (): AiModelsClient | null =>
    options.aiClient !== undefined ? options.aiClient : getAiClient();
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 450;
  const retryTimeoutMs = options.retryTimeoutMs ?? 22000;
  const runAiLimited = createConcurrencySemaphore(options.maxConcurrentAi ?? 4);

  // Sliding-window rate limiter for AI endpoints
  const rateLimitMax = options.rateLimitMaxPerWindow ?? 60;
  const rateLimitWindowMs = options.rateLimitWindowMs ?? 60_000;
  const ipRequestTimestamps = new Map<string, number[]>();

  const aiRateLimitMiddleware: express.RequestHandler = (req, res, next) => {
    const ip =
      String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local')
        .split(',')[0]
        .trim() || 'local';
    const now = Date.now();
    const recent = (ipRequestTimestamps.get(ip) || []).filter(
      (t) => now - t < rateLimitWindowMs
    );
    if (recent.length >= rateLimitMax) {
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        status: 'failed',
        message: 'Too many AI requests. Please wait a moment and try again.',
      });
      return;
    }
    recent.push(now);
    ipRequestTimestamps.set(ip, recent);
    next();
  };

  // Safe CORS headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'the-readers-club',
      version: '1.0.1',
      timestamp: new Date().toISOString(),
    });
  });

  // 1. Per-Chapter On-Demand AI Summarization Pipeline (with Chunking, Caching, Validation & Retries)
  app.post('/api/summarize', aiRateLimitMiddleware, async (req, res) => {
    const validation = validateSummarizeRequest(req.body);
    if (!validation.valid || !validation.sanitized) {
      return res.status(400).json({
        error: 'INVALID_SUMMARIZE_REQUEST',
        status: 'failed',
        message: validation.error || 'Invalid request payload',
      });
    }

    const {
      bookTitle,
      chapterId,
      chapterTitle,
      chapterNumber,
      totalChapters,
      paragraphs,
      originalPages,
      targetCompactPages,
      detailLevel,
      authorPersonaId,
      authorPersonaName,
      authorStylePrompt,
      contentHash,
    } = validation.sanitized;

    const modelName = getSummarizeModelName();
    const cacheKey = buildServerSummaryCacheKey({
      contentHash,
      chapterId,
      model: modelName,
      authorPersonaId,
      detailLevel,
      targetCompactPages,
      authorStylePrompt,
      promptVersion: SUMMARIZE_PROMPT_VERSION,
    });

    const cached = serverSummaryCache.get(cacheKey);
    if (cached) {
      return res.json({
        compactText: cached.compactText,
        bulletPoints: cached.bulletPoints,
        metadata: {
          ...cached.metadata,
          status: 'cached',
        },
      });
    }

    const ai = resolveAi();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY_NOT_CONFIGURED',
        status: 'failed',
        message:
          'Gemini API key is not configured on the server. AI summarization is unavailable; the chapter remains uncompressed.',
      });
    }

    try {
      const chunks = splitServerTextIntoChunks(paragraphs, 5500);
      if (chunks.length > 24) {
        return res.status(422).json({
          error: 'CHAPTER_EXCEEDS_MAX_CHUNKS',
          status: 'failed',
          message: `Chapter contains ${chunks.length} segments (exceeding the 24-segment safety limit). Split the manuscript into smaller chapters so it can be summarized completely without truncation.`,
        });
      }

      const sourceCharCount = paragraphs.join('\n\n').length;

      const targetParagraphCount =
        detailLevel === 'detailed' ? 5 : detailLevel === 'bullet' ? 2 : 3;
      const targetBulletCount =
        detailLevel === 'detailed' ? 6 : detailLevel === 'bullet' ? 7 : 4;

      const summarizeSinglePassage = async (
        passageText: string,
        chunkLabel: string
      ): Promise<{ compactText: string[]; bulletPoints: string[] }> => {
        const prompt = `You are "${authorPersonaName}" acting as the literary chapter summarizer for The Readers Club (Prompt ${SUMMARIZE_PROMPT_VERSION}).
Style instruction: ${authorStylePrompt}

Book: "${bookTitle}"
Chapter: "${chapterTitle}" (Chapter ${chapterNumber} of ${totalChapters}) — ${chunkLabel}
Original Chapter Scale: ${originalPages} pages -> Target Compact Scale: ${targetCompactPages} pages
Summary Detail Mode: ${detailLevel.toUpperCase()}

STRICT FACTUAL INTEGRITY RULES:
1. Summarize ONLY the events, arguments, names, chronology, and relationships present in the Source Passage below.
2. NEVER invent or hallucinate characters, events, or conclusions not supported by the source text.
3. Write ${targetParagraphCount} rich paragraphs ("compactText") and ${targetBulletCount} sharp bullet takeaways ("bulletPoints") in the voice of ${authorPersonaName}.

Source Passage:
${passageText}`;

        return runAiLimited(() =>
          withRetryAndTimeout(
            async () => {
              let activeModel = modelName;
              let response;
              try {
                response = await ai.models.generateContent({
                  model: activeModel,
                  contents: prompt,
                  config: {
                    systemInstruction:
                      'You are a factually rigorous, chapter-by-chapter literary summarizer. Never invent facts outside the provided text. Return valid JSON matching the schema.',
                    responseMimeType: 'application/json',
                    responseSchema: {
                      type: Type.OBJECT,
                      properties: {
                        compactText: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        bulletPoints: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                      required: ['compactText', 'bulletPoints'],
                    },
                  },
                });
              } catch (primaryErr: unknown) {
                const errStr = String(primaryErr);
                if (
                  activeModel !== 'gemini-3.1-flash-lite' &&
                  (errStr.includes('503') ||
                    errStr.includes('429') ||
                    errStr.includes('UNAVAILABLE') ||
                    errStr.includes('RESOURCE_EXHAUSTED'))
                ) {
                  activeModel = 'gemini-3.1-flash-lite';
                  response = await ai.models.generateContent({
                    model: activeModel,
                    contents: prompt,
                    config: {
                      systemInstruction:
                        'You are a factually rigorous, chapter-by-chapter literary summarizer. Never invent facts outside the provided text. Return valid JSON matching the schema.',
                      responseMimeType: 'application/json',
                      responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                          compactText: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                          },
                          bulletPoints: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                          },
                        },
                        required: ['compactText', 'bulletPoints'],
                      },
                    },
                  });
                } else {
                  throw primaryErr;
                }
              }

              const parsed = JSON.parse((response.text ?? '{}').trim());
              const validated = validateSummarizeApiResponse(parsed);
              if (!validated.valid) {
                throw new Error(
                  'Model returned malformed or empty summary arrays.'
                );
              }
              return {
                compactText: validated.compactText,
                bulletPoints: validated.bulletPoints,
              };
            },
            {
              maxRetries: 2,
              baseDelayMs: retryBaseDelayMs,
              timeoutMs: retryTimeoutMs,
            }
          )
        );
      };

      let finalCompactText: string[] = [];
      let finalBulletPoints: string[] = [];

      if (chunks.length <= 1) {
        const singleRes = await summarizeSinglePassage(
          chunks[0]?.text || paragraphs.join('\n\n'),
          'Complete Chapter'
        );
        finalCompactText = singleRes.compactText;
        finalBulletPoints = singleRes.bulletPoints;
      } else {
        // Multi-chunk map-reduce pipeline for long chapters — summarizes ALL chunks without .slice(0, 6) truncation
        const chunkSummaries: Array<{
          chunkIndex: number;
          paragraphRange: [number, number];
          compactText: string[];
          bulletPoints: string[];
        }> = [];

        for (const chunk of chunks) {
          const partRes = await summarizeSinglePassage(
            chunk.text,
            `Part ${chunk.index + 1} of ${chunks.length} (Paragraphs ${chunk.paragraphRange[0] + 1}–${chunk.paragraphRange[1] + 1})`
          );
          chunkSummaries.push({
            chunkIndex: chunk.index,
            paragraphRange: chunk.paragraphRange,
            ...partRes,
          });
        }

        // Merge chunk summaries while preserving chronology and source traceability
        const combinedNotes = chunkSummaries
          .map(
            (cs) =>
              `[Segment ${cs.chunkIndex + 1} — Paragraphs ${cs.paragraphRange[0] + 1} to ${cs.paragraphRange[1] + 1}]:\n${cs.compactText.join('\n')}\nKey Points:\n${cs.bulletPoints.join('\n')}`
          )
          .join('\n\n');

        const mergedRes = await summarizeSinglePassage(
          combinedNotes,
          `Unified Synthesis across ${chunkSummaries.length} sequential chapter segments`
        );
        finalCompactText = mergedRes.compactText;
        finalBulletPoints = mergedRes.bulletPoints;
      }

      const metadata = {
        status: 'ai_generated' as const,
        model: modelName,
        generatedAt: new Date().toISOString(),
        contentHash,
        detailLevel,
        chunkCount: chunks.length,
        sourceCharCount,
      };

      // Bound cache size to 250 entries
      if (serverSummaryCache.size >= 250) {
        const oldestKey = serverSummaryCache.keys().next().value;
        if (oldestKey) serverSummaryCache.delete(oldestKey);
      }
      serverSummaryCache.set(cacheKey, {
        compactText: finalCompactText,
        bulletPoints: finalBulletPoints,
        metadata,
      });

      return res.json({
        compactText: finalCompactText,
        bulletPoints: finalBulletPoints,
        metadata,
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'AI summarization failed';
      return res.status(502).json({
        error: 'SUMMARIZE_ERROR',
        status: 'failed',
        message: msg,
      });
    }
  });

  // 2. Long-Form Chunked TTS Audiobook Endpoint
  app.post('/api/tts', aiRateLimitMiddleware, async (req, res) => {
    try {
      const { text, voiceName, narratorStylePrompt } = req.body || {};
      const cleanText = String(text || '').trim();
      if (!cleanText) {
        return res.status(400).json({
          error: 'EMPTY_TTS_TEXT',
          message: 'Text is required for TTS generation.',
        });
      }
      if (cleanText.length > 4000) {
        return res.status(400).json({
          error: 'TTS_CHUNK_TOO_LARGE',
          message:
            'Individual TTS chunk exceeds 4,000 characters. Split long chapters using chunkTextForTts before calling /api/tts.',
        });
      }

      const ai = resolveAi();
      if (!ai) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY_NOT_CONFIGURED',
          message:
            'Gemini API key not configured on server; neural cloud TTS is unavailable.',
        });
      }

      const selectedVoice = ['Fenrir', 'Kore', 'Puck', 'Charon', 'Zephyr'].includes(
        voiceName
      )
        ? voiceName
        : 'Kore';

      const ttsModel = getTtsModelName();

      const response = await runAiLimited(() =>
        withRetryAndTimeout(
          async () =>
            ai.models.generateContent({
              model: ttsModel,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: cleanText,
                      speechMetadata: {
                        style:
                          narratorStylePrompt ||
                          'Expressive, engaging literary audiobook narrator',
                      },
                    },
                  ],
                },
              ],
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: selectedVoice },
                  },
                },
              },
            }),
          {
            maxRetries: 2,
            baseDelayMs: retryBaseDelayMs,
            timeoutMs: retryTimeoutMs,
          }
        )
      );

      const inlineData =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const base64Audio = inlineData?.data;

      if (!base64Audio) {
        return res.status(502).json({
          error: 'NO_AUDIO_DATA',
          message: 'No audio returned from TTS model.',
        });
      }

      return res.json({
        status: 'ready',
        audioBase64: base64Audio,
        mimeType: inlineData?.mimeType || 'audio/wav',
        model: ttsModel,
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'TTS generation failed';
      return res.status(502).json({ error: 'TTS_ERROR', message: msg });
    }
  });

  // 3. Live Paginated Book Discovery Endpoint (Gutendex Public Domain Full Text + Google Books Metadata Discovery)
  app.get('/api/books/discover', async (req, res) => {
    const query = String(req.query.q || '').trim();
    const topic = String(req.query.topic || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);

    let totalAvailableCount = 74200;
    const results: Array<{
      id: string;
      gutenbergId?: number;
      title: string;
      author: string;
      year: string;
      genre: string;
      subgenres: string[];
      mlTags: string[];
      trendingScore: number;
      chapterCount?: number;
      coverUrl: string;
      description: string;
      sourceApi: 'gutendex' | 'google_books';
      availabilityStatus:
        | 'full_text'
        | 'external_source_available'
        | 'preview'
        | 'metadata_only';
      sourceAttribution: string;
      pageCount?: number;
    }> = [];

    await Promise.allSettled([
      (async () => {
        const params = new URLSearchParams();
        if (query) params.set('search', query);
        if (topic) params.set('topic', topic);
        params.set('page', String(page));

        const gutendexUrl = `https://gutendex.com/books?${params.toString()}`;
        const r = await fetchWithTimeout(gutendexUrl, 5000, fetchFn);
        if (!r.ok) return;
        const data = (await r.json()) as {
          count?: number;
          results?: Array<{
            id: number;
            title: string;
            authors?: Array<{ name: string; birth_year?: number | null }>;
            subjects?: string[];
            bookshelves?: string[];
            Summaries?: string[];
            summaries?: string[];
            download_count?: number;
            formats?: Record<string, string>;
          }>;
        };
        if (typeof data.count === 'number' && data.count > 0) {
          totalAvailableCount = data.count;
        }
        for (const item of data.results || []) {
          const formats = item.formats || {};
          const hasPlainText = Object.keys(formats).some((k) =>
            k.startsWith('text/plain')
          );
          const cover =
            formats['image/jpeg'] ||
            `https://www.gutenberg.org/cache/epub/${item.id}/pg${item.id}.cover.medium.jpg`;
          const rawAuthor = item.authors?.[0]?.name || 'Public Domain Author';
          const formattedAuthor = rawAuthor.includes(',')
            ? rawAuthor
                .split(',')
                .reverse()
                .map((s) => s.trim())
                .join(' ')
            : rawAuthor;
          const summaryList = item.summaries || item.Summaries || [];
          const cleanSubjects = (item.subjects || [])
            .map((s) => s.split('--')[0].trim())
            .filter(Boolean);
          const primaryGenre = cleanSubjects[0] || topic || 'Classic Literature';
          const dlScore = item.download_count
            ? Math.min(
                99,
                Math.max(80, Math.round(78 + Math.log10(item.download_count + 1) * 4.5))
              )
            : 86;

          results.push({
            id: `gutendex-${item.id}`,
            gutenbergId: item.id,
            title: item.title.split(';')[0].trim(),
            author: formattedAuthor,
            year: item.authors?.[0]?.birth_year
              ? `${item.authors[0].birth_year + 35}`
              : 'Public Domain',
            genre: primaryGenre,
            subgenres: cleanSubjects.slice(0, 3),
            mlTags: [
              primaryGenre.toLowerCase(),
              formattedAuthor.toLowerCase(),
              ...cleanSubjects.slice(0, 3).map((s) => s.toLowerCase()),
            ],
            trendingScore: dlScore,
            coverUrl: cover,
            description:
              summaryList[0] ||
              `${item.title} by ${formattedAuthor}. Public-domain edition indexed via Project Gutenberg (#${item.id}).`,
            sourceApi: 'gutendex',
            availabilityStatus: hasPlainText
              ? 'external_source_available'
              : 'metadata_only',
            sourceAttribution: `Project Gutenberg Public Domain Archive (eBook #${item.id})`,
          });
        }
      })(),
      (async () => {
        const searchTerm =
          [query, topic].filter(Boolean).join(' ') || 'classic literature';
        const startIndex = (page - 1) * 12;
        const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
          searchTerm
        )}&startIndex=${startIndex}&maxResults=12&printType=books`;
        const r = await fetchWithTimeout(gbUrl, 5000, fetchFn);
        if (!r.ok) return;
        const data = (await r.json()) as {
          totalItems?: number;
          items?: Array<{
            id: string;
            volumeInfo?: {
              title?: string;
              authors?: string[];
              publishedDate?: string;
              categories?: string[];
              description?: string;
              pageCount?: number;
              imageLinks?: {
                thumbnail?: string;
                smallThumbnail?: string;
              };
            };
          }>;
        };
        for (const item of data.items || []) {
          const info = item.volumeInfo;
          if (!info?.title) continue;
          const rawThumb =
            info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
          if (!rawThumb) continue;
          const httpsCover = rawThumb
            .replace(/^http:\/\//i, 'https://')
            .replace('&edge=curl', '');
          const cat = info.categories?.[0] || topic || 'Literary Edition';

          results.push({
            id: `gbooks-${item.id}`,
            title: info.title,
            author: info.authors?.[0] || 'Catalog Author',
            year: (info.publishedDate || 'Catalog').slice(0, 4),
            genre: cat,
            subgenres: info.categories || [cat],
            mlTags: [
              cat.toLowerCase(),
              (info.authors?.[0] || '').toLowerCase(),
            ],
            trendingScore: 84,
            coverUrl: httpsCover,
            description:
              info.description ||
              `Catalog metadata entry for ${info.title} by ${info.authors?.[0] || 'Unknown Author'}.`,
            sourceApi: 'google_books',
            availabilityStatus: 'metadata_only',
            sourceAttribution:
              'Google Books Discovery Catalog (Metadata Only — Full Text Not Public Domain)',
            pageCount: info.pageCount,
          });
        }
      })(),
    ]);

    return res.json({
      totalAvailableCount,
      page,
      books: results,
    });
  });

  // 4. Real Project Gutenberg Full-Text Chapter Parser (No synthetic fallback, no 5-paragraph truncation)
  app.get('/api/books/gutenberg-chapters', async (req, res) => {
    const gutenbergId = Number(req.query.gutenbergId);
    if (!gutenbergId || Number.isNaN(gutenbergId) || gutenbergId <= 0) {
      return res.status(400).json({
        error: 'INVALID_GUTENBERG_ID',
        availabilityStatus: 'extraction_failed',
      });
    }

    const candidateUrls = [
      `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`,
      `https://www.gutenberg.org/files/${gutenbergId}/${gutenbergId}-0.txt`,
      `https://www.gutenberg.org/files/${gutenbergId}/${gutenbergId}.txt`,
    ];

    try {
      let rawText = '';
      let resolvedUrl = '';

      for (const url of candidateUrls) {
        try {
          const r = await fetchWithTimeout(url, 6500, fetchFn);
          if (r.ok) {
            const text = await r.text();
            if (text && text.length > 500) {
              rawText = text;
              resolvedUrl = url;
              break;
            }
          }
        } catch {
          // Try next mirror URL
        }
      }

      if (!rawText) {
        return res.status(404).json({
          error: 'MANUSCRIPT_NOT_FOUND',
          availabilityStatus: 'extraction_failed',
          message: `Project Gutenberg plain-text manuscript #${gutenbergId} could not be retrieved.`,
        });
      }

      const extractedChapters = parseGutenbergPlainTextChapters(rawText);
      if (extractedChapters.length === 0) {
        return res.status(422).json({
          error: 'CHAPTER_EXTRACTION_EMPTY',
          availabilityStatus: 'extraction_failed',
          message: `Project Gutenberg manuscript #${gutenbergId} contained no readable text sections.`,
        });
      }

      const chapterStructure =
        extractedChapters[0]?.chapterStructure || 'original_chapters';

      return res.json({
        gutenbergId,
        availabilityStatus: 'full_text',
        chapterStructure,
        verifiedChapterCount: extractedChapters.length,
        sourceAttribution: `Project Gutenberg Public Domain Text (${resolvedUrl})`,
        chapters: extractedChapters,
      });
    } catch {
      return res.status(502).json({
        error: 'UPSTREAM_GUTENBERG_TIMEOUT',
        availabilityStatus: 'extraction_failed',
        message: 'Timed out while retrieving Project Gutenberg text.',
      });
    }
  });

  // 5. Mascot Multi-Turn Literary Companion Chatbot Endpoint
  app.post('/api/mascot/chat', aiRateLimitMiddleware, async (req, res) => {
    const validation = validateMascotChatRequest(req.body);
    if (!validation.valid || !validation.sanitized) {
      return res.status(400).json({
        error: 'INVALID_MASCOT_CHAT_REQUEST',
        message: validation.error || 'Invalid chat request payload.',
      });
    }

    const ai = resolveAi();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY_NOT_CONFIGURED',
        message:
          'Server Gemini API key is not configured. Configure GEMINI_API_KEY in .env to chat live with Mascot.',
      });
    }

    const {
      message,
      history,
      modelName,
      personaName,
      personaStylePrompt,
      bookTitle,
      bookAuthor,
      chapterTitle,
      chapterExcerpt,
    } = validation.sanitized;

    const systemInstruction = `You are "Mascot", the official literary companion and club host of The Readers Club.
Currently channel the personality of ${personaName}: ${personaStylePrompt}
Active Book Context: "${bookTitle}" by ${bookAuthor}${chapterTitle ? ` (${chapterTitle})` : ''}.
${chapterExcerpt ? `Relevant Chapter Excerpt:\n${chapterExcerpt}\n` : ''}
Rules:
1. Maintain multi-turn conversational continuity with the reader.
2. Answer questions about plot, themes, character motives, historical context, or reading recommendations with literary accuracy and the distinctive wit/gravitas of ${personaName}.
3. Never fabricate quotes or claim a metadata-only record contains full text if it does not.`;

    try {
      const contents = [
        ...history.map((turn) => ({
          role: turn.role,
          parts: [{ text: turn.text }],
        })),
        {
          role: 'user' as const,
          parts: [{ text: message }],
        },
      ];

      let usedModel = modelName;
      let response;
      try {
        response = await runAiLimited(() =>
          withRetryAndTimeout(
            async () =>
              ai.models.generateContent({
                model: usedModel,
                contents,
                config: {
                  systemInstruction,
                },
              }),
            {
              maxRetries: 2,
              baseDelayMs: retryBaseDelayMs,
              timeoutMs: retryTimeoutMs,
            }
          )
        );
      } catch (chatErr: unknown) {
        const errStr = String(chatErr);
        if (
          usedModel !== 'gemini-3.1-flash-lite' &&
          (errStr.includes('429') ||
            errStr.includes('503') ||
            errStr.includes('RESOURCE_EXHAUSTED') ||
            errStr.includes('UNAVAILABLE'))
        ) {
          usedModel = 'gemini-3.1-flash-lite';
          response = await runAiLimited(() =>
            withRetryAndTimeout(
              async () =>
                ai.models.generateContent({
                  model: usedModel,
                  contents,
                  config: {
                    systemInstruction,
                  },
                }),
              {
                maxRetries: 1,
                baseDelayMs: retryBaseDelayMs,
                timeoutMs: retryTimeoutMs,
              }
            )
          );
        } else {
          throw chatErr;
        }
      }

      const replyText = (response.text ?? '').trim();
      if (!replyText) {
        return res.status(502).json({
          error: 'EMPTY_MASCOT_RESPONSE',
          message: 'Mascot returned an empty response.',
        });
      }

      return res.json({
        reply: replyText,
        model: usedModel,
        personaName,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Mascot chat request failed';
      return res.status(502).json({
        error: 'MASCOT_CHAT_ERROR',
        message: msg,
      });
    }
  });

  return app;
}

let serverStarted = false;

export async function startServer() {
  if (serverStarted) return;
  serverStarted = true;

  const app = createApp();
  const PORT = 3000;

  const frontendDir = path.resolve(__dirname, '../../frontend');
  const distPath = path.resolve(__dirname, '../../dist');

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: frontendDir,
      configFile: path.resolve(frontendDir, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const listenPort = Number(process.env.PORT) || PORT;
  return new Promise<void>((resolve) => {
    const httpServer = app.listen(listenPort, '0.0.0.0', () => {
      console.log(
        `The Readers Club server listening on http://0.0.0.0:${listenPort}`
      );
      resolve();
    });

    const shutdown = () => {
      httpServer.close(() => {
        process.exit(0);
      });
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  });
}

// Start the Express listener when executed via root server.ts or backend/src/server.ts (not when imported by unit tests)
const rootServerEntry = path.resolve(__dirname, '../../server.ts');
const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectServerRun =
  !process.env.NODE_TEST_CONTEXT &&
  Boolean(
    entryArg &&
      (entryArg === path.resolve(__filename) ||
        entryArg === rootServerEntry ||
        entryArg.endsWith('/server.ts') ||
        entryArg.endsWith('\\server.ts'))
  );

if (isDirectServerRun) {
  startServer().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}

