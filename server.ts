import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // 1. Chapter / Book Persona Summarization Endpoint
  app.post('/api/summarize', async (req, res) => {
    try {
      const {
        bookTitle,
        chapterTitle,
        originalText,
        originalPages,
        targetCompactPages,
        authorPersonaName,
        authorStylePrompt,
      } = req.body;

      const ai = getAiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY_NOT_CONFIGURED',
          message: 'Server Gemini key not configured; using instant Club Persona Engine.',
        });
      }

      const sourcePassage = Array.isArray(originalText)
        ? originalText.join('\n\n')
        : String(originalText || '');

      const prompt = `You are "${authorPersonaName}" acting as the lead literary summarizer for The Readers Club.
Style instruction: ${authorStylePrompt}

Book: "${bookTitle}"
Chapter: "${chapterTitle}"
Original Chapter Length: ${originalPages || 35} pages
Target Compact Chapter Scale: ${targetCompactPages || 6} pages (part of a 30-40 page proportional chapter-wise compact book edition).

Source Chapter Text:
${sourcePassage.slice(0, 12000)}

Task:
1. Write 3 rich, high-substance paragraphs ("compactText") that condense this chapter proportionally while keeping its narrative arc, core arguments, and chapter structure intact, distinctly written in the voice of ${authorPersonaName}.
2. Write 4 sharp, memorable bullet takeaways ("bulletPoints") for this chapter in the voice of ${authorPersonaName}.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an elite chapter-wise book condensation author for The Readers Club. Return valid JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              compactText: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 detailed paragraphs summarizing the chapter in the requested author personality.',
              },
              bulletPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '4 key bullet points for this chapter in the requested author personality.',
              },
            },
            required: ['compactText', 'bulletPoints'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({
        compactText: parsed.compactText || [],
        bulletPoints: parsed.bulletPoints || [],
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Summarization failed';
      return res.status(500).json({ error: 'SUMMARIZE_ERROR', message: msg });
    }
  });

  // 2. Gemini 3.8 TTS Audiobook Endpoint (for Compact Edition)
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voiceName, narratorStylePrompt } = req.body;
      const ai = getAiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY_NOT_CONFIGURED',
          message: 'Using browser neural speech synthesis with persona tuning.',
        });
      }

      const cleanText = String(text || '').slice(0, 1800);
      const selectedVoice = ['Fenrir', 'Kore', 'Puck', 'Charon', 'Zephyr'].includes(voiceName)
        ? voiceName
        : 'Kore';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
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
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        return res.status(500).json({
          error: 'NO_AUDIO_DATA',
          message: 'No audio returned from TTS model',
        });
      }

      return res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'TTS generation failed';
      return res.status(500).json({ error: 'TTS_ERROR', message: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const listenPort = Number(process.env.PORT) || PORT;
  app.listen(listenPort, '0.0.0.0', () => {
    console.log(`The Readers Club server listening on http://0.0.0.0:${listenPort}`);
  });
}

startServer();
