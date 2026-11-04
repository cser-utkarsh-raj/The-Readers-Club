# The Readers Club — V1.0.1

A reliable, AI-powered literary archive, manuscript press, and chunked audiobook studio application built with a modular React + Vite frontend and an Express backend.

## Project Architecture

```text
the-readers-club/
├── frontend/             # React 19 + Vite + Tailwind CSS + PWA
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── public/
│   │   └── assets/
│   └── src/
│       ├── App.tsx       # Main multi-page shell with brutalist pop-art design
│       ├── assets/       # Resident pop-art portraits & tactile badges
│       ├── components/   # ReaderModal, TactileArt, PWAInstallButton
│       ├── data/         # Curated condensed classics & global catalogue seed
│       ├── types/        # Typed BookItem, BookChapter, and content availability schemas
│       └── utils/        # EPUB/PDF/TXT parser, TTS engine, IndexedDB & ML recommendations
│
├── backend/              # Node.js + Express + Google GenAI SDK (Gemini)
│   ├── src/
│   │   ├── server.ts     # Health, summarization, TTS, Mascot chat & Gutenberg endpoints
│   │   └── server.test.ts # Server integration tests with mocked AI boundaries
│   └── .env.example
│
├── scripts/
│   ├── validate-catalog.ts # Automated catalogue integrity auditor
│   └── e2e-verify.ts       # 12-scenario Playwright E2E verification suite
│
├── .github/workflows/
│   └── ci.yml            # Automated CI pipeline (lint, validate:catalog, test, build)
├── package.json          # Root scripts & shared dependencies
└── README.md
```

## Content Integrity & Availability

The application strictly enforces honest content availability statuses and never fabricates synthetic chapters from book blurbs or placeholder metadata:

- **Curated Condensed Edition (`condensed_edition`)**: 12 curated seed classics stored with proportional, hand-audited editorial sections, verified chapter counts, and full-text Project Gutenberg hydration hooks.
- **External Source Available (`external_source_available`)**: 104 verified Project Gutenberg titles indexed with authentic eBook IDs (`gutenbergId`) and hydrated on demand into unabridged full text.
- **Full Text (`full_text`)**: Unabridged original manuscripts parsed cleanly from verified Project Gutenberg mirrors or user uploads.
- **Metadata Only (`metadata_only`)**: Google Books discovery records displayed honestly with 0 synthetic chapters.
- **Extraction Failed (`extraction_failed`)**: Corrupted or empty user uploads surfaced with clear, recoverable error messages.

### Verified Catalogue Audit (116 Records)
- **Curated Books**: 12
- **Global Catalogue Seed**: 104
- **Unique Titles (Deduplicated)**: 116
- **Duplicate Records**: 0
- **Broken / Missing Source IDs**: 0
- **Missing Covers**: 0

## Core Capabilities

1. **5 Reading & Listening Editions**:
   - **Original Archive**: Unabridged chapter manuscripts without chapter/paragraph truncation caps.
   - **Compact Edition**: Proportional chapter condensation without fabricated events.
   - **Executive Briefing**: High-level thematic synopsis.
   - **Key Takeaways**: Faithful bullet points derived strictly from source chapters.
   - **Studio Audiobook**: Sentence-aware chunked TTS with AbortSignal cancellation and per-chunk retry resilience.
2. **Deterministic Recommendation Engine**:
   - TF-IDF document vectors + Cosine similarity + MMR diversity reranking + explicit user like/dislike penalties.
3. **Manuscript Press (Uploads)**:
   - Robust EPUB (OPF package/spine order parser), page-aware PDF text extraction, and multi-encoding plain text.
4. **Persistent Multi-Tier Storage**:
   - IndexedDB for large uncompressed manuscripts + localStorage metadata shells with transactional rollback protection.

## Testing & Quality Verification

```bash
# Run unit & backend integration test suites (28 tests)
npm test

# Audit catalogue integrity and source metadata
npm run validate:catalog

# Run automated 12-scenario browser E2E verification suite
npm run test:e2e

# Check TypeScript types
npm run lint

# Compile production bundle
npm run build
```
