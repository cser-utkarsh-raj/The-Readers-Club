import { AudioEngineStatus, TtsAudioChunk } from '../types/book';
import { computeContentHash } from './bookLogic';

/**
 * Splits long chapter or summary text into natural TTS audio chunks at paragraph and sentence
 * boundaries so no sentence is cut off mid-word and punctuation/pauses are preserved.
 */
export function chunkTextForTts(
  input: string | string[],
  maxChunkChars = 750
): TtsAudioChunk[] {
  const safeMax = Math.max(180, Math.min(1600, maxChunkChars));
  const paragraphs = (Array.isArray(input) ? input : [input])
    .flatMap((block) => String(block || '').split(/\n\s*\n/))
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return [];

  const rawTextChunks: string[] = [];
  let currentBuffer = '';

  const flushBuffer = () => {
    const trimmed = currentBuffer.trim();
    if (trimmed.length > 0) {
      rawTextChunks.push(trimmed);
    }
    currentBuffer = '';
  };

  for (const para of paragraphs) {
    // If paragraph fits inside current buffer, append with paragraph pause
    if (
      currentBuffer.length > 0 &&
      currentBuffer.length + 2 + para.length <= safeMax
    ) {
      currentBuffer = `${currentBuffer}\n\n${para}`;
      continue;
    }

    if (para.length <= safeMax) {
      flushBuffer();
      currentBuffer = para;
      continue;
    }

    // Paragraph exceeds safeMax: split on sentence boundaries while keeping punctuation intact
    flushBuffer();
    const sentences =
      para.match(/[^.!?…]+[.!?…]+(?:["'”’)]+)?(?:\s+|$)|[^.!?…]+$/g) || [para];

    for (const rawSentence of sentences) {
      const sentence = rawSentence.trim();
      if (!sentence) continue;

      if (sentence.length > safeMax) {
        // Split extra-long clause on semicolons, colons, em-dashes, or commas
        flushBuffer();
        const clauses =
          sentence.match(/[^;:,—–]+[;:,—–]+(?:\s+|$)|[^;:,—–]+$/g) || [
            sentence,
          ];
        for (const rawClause of clauses) {
          const clause = rawClause.trim();
          if (!clause) continue;
          if (
            currentBuffer.length > 0 &&
            currentBuffer.length + 1 + clause.length > safeMax
          ) {
            flushBuffer();
          }
          if (clause.length > safeMax) {
            // Final word-boundary split if single clause is still longer than safeMax
            const words = clause.split(/\s+/);
            for (const word of words) {
              if (
                currentBuffer.length > 0 &&
                currentBuffer.length + 1 + word.length > safeMax
              ) {
                flushBuffer();
              }
              currentBuffer = currentBuffer ? `${currentBuffer} ${word}` : word;
            }
          } else {
            currentBuffer = currentBuffer
              ? `${currentBuffer} ${clause}`
              : clause;
          }
        }
        continue;
      }

      if (
        currentBuffer.length > 0 &&
        currentBuffer.length + 1 + sentence.length > safeMax
      ) {
        flushBuffer();
        currentBuffer = sentence;
      } else {
        currentBuffer = currentBuffer
          ? `${currentBuffer} ${sentence}`
          : sentence;
      }
    }
  }

  flushBuffer();

  return rawTextChunks.map((text, index) => ({
    index,
    text,
    status: 'pending',
    attempts: 0,
  }));
}

/**
 * Checks whether all chunks of an audiobook chapter have been generated and are ready.
 * Never claims an audiobook is ready until every required chunk has `status === 'ready'`.
 */
export function isAudiobookReady(chunks: TtsAudioChunk[]): boolean {
  if (!chunks || chunks.length === 0) return false;
  return chunks.every(
    (c) => c.status === 'ready' && Boolean(c.objectUrl || c.audioBase64)
  );
}

/**
 * Derives the overall AudioEngineStatus from the chunk queue and playback state.
 */
export function deriveAudioEngineStatus(
  chunks: TtsAudioChunk[],
  isPlaying: boolean,
  isPaused: boolean
): AudioEngineStatus {
  if (!chunks || chunks.length === 0) return 'idle';
  if (chunks.some((c) => c.status === 'failed')) return 'failed';
  if (chunks.some((c) => c.status === 'generating' || c.status === 'pending')) {
    return 'generating';
  }
  if (isAudiobookReady(chunks)) {
    if (isPlaying) return 'playing';
    if (isPaused) return 'paused';
    return 'ready';
  }
  return 'loading';
}

/**
 * Deduplication cache for in-flight and completed TTS chunk requests (keyed by text + voice + style).
 */
const inFlightTtsRequests = new Map<
  string,
  Promise<{ audioBase64: string; mimeType: string }>
>();
const completedTtsAudioCache = new Map<
  string,
  { audioBase64: string; mimeType: string }
>();

export function buildTtsChunkCacheKey(
  text: string,
  voiceName: string,
  narratorStylePrompt: string
): string {
  return computeContentHash(`${voiceName}::${narratorStylePrompt}::${text}`);
}

export function clearTtsDeduplicationCache(): void {
  inFlightTtsRequests.clear();
  completedTtsAudioCache.clear();
}

/**
 * Converts base64 audio (either raw 24kHz 16-bit mono PCM or WAV container) into a playable Blob.
 */
export function base64AudioToPlayableBlob(
  base64Data: string,
  mimeType = 'audio/wav'
): Blob {
  const binaryStr = atob(base64Data);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Check if the bytes already begin with a RIFF/WAV header ("RIFF")
  const hasRiffHeader =
    len >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46;   // F

  if (hasRiffHeader || (!mimeType.includes('pcm') && !mimeType.includes('raw') && hasRiffHeader)) {
    return new Blob([bytes], { type: 'audio/wav' });
  }

  // Wrap raw 24000Hz 16-bit mono PCM into a standard 44-byte WAV header so HTMLAudioElement plays it reliably
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const wavBuffer = new ArrayBuffer(44 + bytes.length);
  const view = new DataView(wavBuffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + bytes.length, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, 'data');
  view.setUint32(40, bytes.length, true);

  const wavBytes = new Uint8Array(wavBuffer);
  wavBytes.set(bytes, 44);
  return new Blob([wavBytes], { type: 'audio/wav' });
}

/**
 * Registry of temporary Object URLs created for TTS chunks so they can be revoked cleanly.
 */
const activeObjectUrls = new Set<string>();

export function createTrackedAudioObjectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  activeObjectUrls.add(url);
  return url;
}

export function revokeTrackedAudioObjectUrl(url?: string): void {
  if (!url) return;
  if (activeObjectUrls.has(url)) {
    activeObjectUrls.delete(url);
  }
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Ignore errors in non-browser test environments
  }
}

export function revokeAllTrackedAudioObjectUrls(chunks?: TtsAudioChunk[]): void {
  if (chunks) {
    for (const chunk of chunks) {
      if (chunk.objectUrl) {
        revokeTrackedAudioObjectUrl(chunk.objectUrl);
        chunk.objectUrl = undefined;
      }
    }
  }
  for (const url of Array.from(activeObjectUrls)) {
    revokeTrackedAudioObjectUrl(url);
  }
}

export function getActiveTrackedObjectUrlCount(): number {
  return activeObjectUrls.size;
}

export interface GenerateTtsChunkOptions {
  chunk: TtsAudioChunk;
  voiceName: string;
  narratorStylePrompt: string;
  maxRetries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

function isPermanentTtsError(status: number, errorCode?: string): boolean {
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return true;
  }
  if (errorCode === 'GEMINI_API_KEY_NOT_CONFIGURED') {
    return true;
  }
  return false;
}

/**
 * Generates a single TTS chunk with bounded exponential backoff retries, jitter, cancellation support,
 * and deduplication.
 * If one chunk fails, only that chunk is marked `failed` and can be retried individually without
 * discarding already-generated chunks.
 */
export async function generateSingleTtsChunkWithRetry(
  params: GenerateTtsChunkOptions
): Promise<TtsAudioChunk> {
  const {
    chunk,
    voiceName,
    narratorStylePrompt,
    maxRetries = 2,
    baseDelayMs = 300,
    signal,
    fetchImpl = fetch,
  } = params;

  if (signal?.aborted) {
    return {
      ...chunk,
      status: 'pending',
      errorMessage: 'TTS request cancelled',
    };
  }

  const cacheKey = buildTtsChunkCacheKey(
    chunk.text,
    voiceName,
    narratorStylePrompt
  );

  const cached = completedTtsAudioCache.get(cacheKey);
  if (cached) {
    if (signal?.aborted) {
      return {
        ...chunk,
        status: 'pending',
        errorMessage: 'TTS request cancelled',
      };
    }
    const blob = base64AudioToPlayableBlob(cached.audioBase64, cached.mimeType);
    const objectUrl = createTrackedAudioObjectUrl(blob);
    return {
      ...chunk,
      status: 'ready',
      audioBase64: cached.audioBase64,
      objectUrl,
      errorMessage: undefined,
    };
  }

  let attempt = 0;
  let lastError = 'TTS generation failed';

  while (attempt <= maxRetries) {
    if (signal?.aborted) {
      return {
        ...chunk,
        status: 'pending',
        errorMessage: 'TTS request cancelled',
      };
    }

    attempt++;
    let permanentFailure = false;

    try {
      let requestPromise = inFlightTtsRequests.get(cacheKey);
      if (!requestPromise) {
        requestPromise = (async () => {
          const resp = await fetchImpl('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: chunk.text,
              voiceName,
              narratorStylePrompt,
            }),
            signal,
          });
          if (!resp.ok) {
            const errBody = (await resp.json().catch(() => ({}))) as {
              error?: string;
              message?: string;
            };
            const err = new Error(
              errBody.message || errBody.error || `HTTP ${resp.status}`
            ) as Error & { status?: number; code?: string };
            err.status = resp.status;
            err.code = errBody.error;
            throw err;
          }
          const data = (await resp.json()) as {
            audioBase64?: string;
            mimeType?: string;
          };
          if (!data.audioBase64) {
            throw new Error('Empty audio payload from TTS endpoint');
          }
          return {
            audioBase64: data.audioBase64,
            mimeType: data.mimeType || 'audio/wav',
          };
        })();
        inFlightTtsRequests.set(cacheKey, requestPromise);
      }

      const result = await requestPromise;
      inFlightTtsRequests.delete(cacheKey);

      if (signal?.aborted) {
        return {
          ...chunk,
          status: 'pending',
          errorMessage: 'TTS request cancelled',
        };
      }

      completedTtsAudioCache.set(cacheKey, result);

      const blob = base64AudioToPlayableBlob(
        result.audioBase64,
        result.mimeType
      );
      const objectUrl = createTrackedAudioObjectUrl(blob);

      if (signal?.aborted) {
        revokeTrackedAudioObjectUrl(objectUrl);
        return {
          ...chunk,
          status: 'pending',
          errorMessage: 'TTS request cancelled',
        };
      }

      return {
        ...chunk,
        status: 'ready',
        attempts: (chunk.attempts || 0) + attempt,
        audioBase64: result.audioBase64,
        objectUrl,
        errorMessage: undefined,
      };
    } catch (err: unknown) {
      inFlightTtsRequests.delete(cacheKey);

      if (
        signal?.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return {
          ...chunk,
          status: 'pending',
          errorMessage: 'TTS request cancelled',
        };
      }

      const status = (err as { status?: number })?.status ?? 0;
      const code = (err as { code?: string })?.code;
      if (isPermanentTtsError(status, code)) {
        permanentFailure = true;
      }

      lastError = err instanceof Error ? err.message : 'TTS request failed';
      if (permanentFailure || attempt > maxRetries) {
        break;
      }

      const jitter = Math.floor(Math.random() * 60);
      const delay = Math.min(
        2500,
        baseDelayMs * Math.pow(2, attempt - 1) + jitter
      );
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
        }
      });
    }
  }

  if (signal?.aborted) {
    return {
      ...chunk,
      status: 'pending',
      errorMessage: 'TTS request cancelled',
    };
  }

  return {
    ...chunk,
    status: 'failed',
    attempts: (chunk.attempts || 0) + attempt,
    errorMessage: lastError,
  };
}
