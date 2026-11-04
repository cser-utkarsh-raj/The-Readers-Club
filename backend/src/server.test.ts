import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  AiModelsClient,
  clearServerSummaryCache,
  createApp,
  CreateAppOptions,
} from './server';

async function withTestServer(
  options: CreateAppOptions,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = createApp(options);
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('Failed to bind ephemeral test port');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('GET /api/health returns 200 ok with version 1.0.1', async () => {
  await withTestServer({ aiClient: null }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      status: string;
      service: string;
      version: string;
    };
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'the-readers-club');
    assert.equal(body.version, '1.0.1');
  });
});

test('POST /api/summarize validates requests, returns 503 when AI is unconfigured, summarizes >6-chunk chapters completely, and serves cache hits', async () => {
  clearServerSummaryCache();

  // 1. Test with unconfigured AI client (null)
  await withTestServer({ aiClient: null }, async (baseUrl) => {
    const invalidRes = await fetch(`${baseUrl}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookTitle: 'X', originalText: ['too short'] }),
    });
    assert.equal(invalidRes.status, 400);

    const noKeyRes = await fetch(`${baseUrl}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookTitle: 'The Odyssey',
        chapterTitle: 'Book I',
        originalText: [
          'Tell me, O Muse, of that ingenious hero who travelled far and wide after he had sacked the famous town of Troy.',
        ],
      }),
    });
    assert.equal(noKeyRes.status, 503);
    const noKeyJson = (await noKeyRes.json()) as { error: string };
    assert.equal(noKeyJson.error, 'GEMINI_API_KEY_NOT_CONFIGURED');
  });

  // 2. Test with mocked AI client on an 8-chunk chapter (>6 chunks) to verify zero silent truncation
  let aiCallCount = 0;
  const mockAiClient: AiModelsClient = {
    models: {
      generateContent: async ({ contents }) => {
        aiCallCount++;
        const promptText = String(contents);
        return {
          text: JSON.stringify({
            compactText: [
              `Summarized paragraph A from AI call #${aiCallCount} (${promptText.includes('Unified Synthesis') ? 'final synthesis' : 'chunk pass'}) with rich literary detail.`,
              `Summarized paragraph B from AI call #${aiCallCount} preserving chronology and character arcs.`,
              `Summarized paragraph C from AI call #${aiCallCount} concluding the faithful passage summary.`,
            ],
            bulletPoints: [
              `Key takeaway #1 from AI call #${aiCallCount}.`,
              `Key takeaway #2 from AI call #${aiCallCount}.`,
            ],
          }),
        };
      },
    },
  };

  // Build 8 chunks (each paragraph ~2,900 chars -> 1 paragraph per 5,500-char chunk -> 8 chunks)
  const eightLongParagraphs = Array.from({ length: 8 }, (_, idx) => {
    const base = `Segment ${idx + 1}: Odysseus navigated the treacherous wine-dark sea while Athena pleaded his case before Zeus on Mount Olympus. `;
    return base.repeat(24); // ~2,900 chars per paragraph -> each pair exceeds 5,500 chars -> 8 chunks
  });

  await withTestServer(
    { aiClient: mockAiClient, retryBaseDelayMs: 5 },
    async (baseUrl) => {
      const firstRes = await fetch(`${baseUrl}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: 'The Odyssey',
          chapterId: 'odyssey-book-1-long',
          chapterTitle: 'Book I: Athena Inspires the Prince',
          chapterNumber: 1,
          totalChapters: 24,
          originalText: eightLongParagraphs,
          detailLevel: 'compact',
          authorPersonaId: 'gandalf',
          authorPersonaName: 'Gandalf',
          authorStylePrompt: 'Wise, scholarly narrator',
        }),
      });

      assert.equal(firstRes.status, 200);
      const firstJson = (await firstRes.json()) as {
        compactText: string[];
        bulletPoints: string[];
        metadata: {
          status: string;
          chunkCount: number;
          contentHash: string;
        };
      };

      assert.equal(firstJson.metadata.status, 'ai_generated');
      assert.equal(
        firstJson.metadata.chunkCount,
        8,
        'Should split into 8 chunks (>6 chunks)'
      );
      assert.equal(
        aiCallCount,
        9,
        'All 8 chunks must be summarized (8 calls) plus 1 synthesis call = 9 total calls (no 6-chunk truncation)'
      );
      assert.ok(firstJson.compactText[0].includes('final synthesis'));

      // Second identical call should hit the server summary cache without calling AI again
      const cachedRes = await fetch(`${baseUrl}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle: 'The Odyssey',
          chapterId: 'odyssey-book-1-long',
          chapterTitle: 'Book I: Athena Inspires the Prince',
          chapterNumber: 1,
          totalChapters: 24,
          originalText: eightLongParagraphs,
          detailLevel: 'compact',
          authorPersonaId: 'gandalf',
          authorPersonaName: 'Gandalf',
          authorStylePrompt: 'Wise, scholarly narrator',
        }),
      });
      assert.equal(cachedRes.status, 200);
      const cachedJson = (await cachedRes.json()) as {
        metadata: { status: string };
      };
      assert.equal(cachedJson.metadata.status, 'cached');
      assert.equal(
        aiCallCount,
        9,
        'Cached response must not invoke AI client again'
      );
    }
  );
});

test('GET /api/books/gutenberg-chapters validates ID, handles upstream 404, and parses full chapters on 200', async () => {
  const sampleGutenbergText = `*** START OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***
CHAPTER I.

It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.

"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?" Mr. Bennet replied that he had not. "But it is," returned she; "for Mrs. Long has just been here, and she told me all about it."

CHAPTER II.

Mr. Bennet was among the earliest of those who waited on Mr. Bingley. He had always intended to visit him, though to the last always assuring his wife that he should not go; and till the evening after the visit was paid she had no knowledge of it. It was then disclosed in the following manner, observing his second daughter employed in trimming a hat.

"I hope Mr. Bingley will like it, Lizzy," said her mother. "We are not in a way to know what Mr. Bingley likes," said her daughter resentfully, "since we are not to visit." "But you forget, mamma," said Elizabeth, "that we shall meet him at the assemblies, and that Mrs. Long promised to introduce him."
*** END OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***`;

  const mockFetch = (async (url: string) => {
    if (String(url).includes('999999')) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(sampleGutenbergText, { status: 200 });
  }) as unknown as typeof fetch;

  await withTestServer({ aiClient: null, fetchImpl: mockFetch }, async (baseUrl) => {
    // Invalid ID
    const badIdRes = await fetch(
      `${baseUrl}/api/books/gutenberg-chapters?gutenbergId=abc`
    );
    assert.equal(badIdRes.status, 400);

    // Upstream 404
    const notFoundRes = await fetch(
      `${baseUrl}/api/books/gutenberg-chapters?gutenbergId=999999`
    );
    assert.equal(notFoundRes.status, 404);

    // Valid Gutenberg book
    const okRes = await fetch(
      `${baseUrl}/api/books/gutenberg-chapters?gutenbergId=1342`
    );
    assert.equal(okRes.status, 200);
    const okJson = (await okRes.json()) as {
      gutenbergId: number;
      availabilityStatus: string;
      chapterStructure: string;
      chapters: Array<{ number: number; title: string; originalText: string[] }>;
    };
    assert.equal(okJson.gutenbergId, 1342);
    assert.equal(okJson.availabilityStatus, 'full_text');
    assert.equal(okJson.chapterStructure, 'original_chapters');
    assert.equal(okJson.chapters.length, 2);
  });
});

test('POST /api/tts, POST /api/mascot/chat, and AI rate limiter behave deterministically', async () => {
  const mockAiClient: AiModelsClient = {
    models: {
      generateContent: async ({ model }) => {
        if (model.includes('tts')) {
          return {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        data: 'AAAA',
                        mimeType: 'audio/pcm',
                      },
                    },
                  ],
                },
              },
            ],
          };
        }
        return {
          text: 'Greetings from Mascot! Chapter 1 explores strategic discipline.',
        };
      },
    },
  };

  await withTestServer(
    {
      aiClient: mockAiClient,
      rateLimitMaxPerWindow: 3,
      rateLimitWindowMs: 60_000,
    },
    async (baseUrl) => {
      // 1. Invalid empty TTS payload (consumes 1 rate-limit token)
      const emptyTts = await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ' }),
      });
      assert.equal(emptyTts.status, 400);

      // 2. Valid TTS synthesis (consumes 2nd rate-limit token)
      const validTts = await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Call me Ishmael. Some years ago, never mind how long precisely.',
          voiceName: 'Charon',
          narratorStylePrompt: 'Calm dramatic narrator',
        }),
      });
      assert.equal(validTts.status, 200);
      const ttsJson = (await validTts.json()) as {
        audioBase64: string;
        mimeType: string;
        status: string;
      };
      assert.equal(ttsJson.status, 'ready');
      assert.equal(ttsJson.audioBase64, 'AAAA');

      // 3. Valid Mascot chat request (consumes 3rd rate-limit token)
      const chatRes = await fetch(`${baseUrl}/api/mascot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Summarize the main conflict of Chapter 1.',
          taskTier: 'fast',
          personaName: 'Gandalf',
          bookTitle: 'The Art of War',
        }),
      });
      assert.equal(chatRes.status, 200);
      const chatJson = (await chatRes.json()) as {
        reply: string;
        model: string;
        taskTier: string;
      };
      assert.equal(chatJson.model, 'gemini-3.1-flash-lite');
      assert.ok(chatJson.reply.includes('Greetings from Mascot'));

      // 4. 4th request within window must trigger HTTP 429 RATE_LIMIT_EXCEEDED
      const rateLimitedRes = await fetch(`${baseUrl}/api/mascot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'One request too many in the window',
        }),
      });
      assert.equal(rateLimitedRes.status, 429);
      const rlJson = (await rateLimitedRes.json()) as { error: string };
      assert.equal(rlJson.error, 'RATE_LIMIT_EXCEEDED');
    }
  );
});
