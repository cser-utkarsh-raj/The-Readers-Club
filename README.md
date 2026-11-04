# The Readers Club

A literary archive, manuscript press, and studio audiobook application built with a modular `frontend/` + `backend/` workspace architecture.

## Project Structure

```text
the-readers-club/
├── frontend/             # Everything Vite + React + PWA
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── public/
│   │   └── assets/
│   └── src/
│       ├── App.tsx
│       ├── assets/       # AI pop-art portraits, enamel badges & studio banner
│       ├── components/   # ReaderModal, TactileArt, PWAInstallButton
│       ├── data/         # Curated public-domain books with cover posters
│       ├── hooks/        # usePWAInstall hook
│       ├── types/        # TypeScript interfaces
│       └── utils/        # Proportional chapter condensation & file extraction
│
├── backend/              # Everything API & Server-side
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   └── server.ts     # Express + Gemini 3.8 Flash/TTS + Gutendex & Google Books API
│   └── .env.example
│
├── .gitignore
├── package.json          # Root workspace scripts & shared dependencies
└── README.md
```

## Core Capabilities

- **Five Reading & Listening Editions**:
  1. **Original Archive**: Unabridged chapter manuscript text.
  2. **Compact Edition**: Proportional chapter-by-chapter condensation (scaling a ~200-page volume into a 30–40 page structured edition).
  3. **Executive Briefing**: Concise 3-page synthesis and central thesis.
  4. **Key Takeaways**: Chapter-level or full-volume structured bullet takeaways.
  5. **Studio Audiobook**: Synchronized audio playback of the Compact Edition.
- **Global Catalog Discovery**: Live search across **Gutendex (Project Gutenberg)** and **Google Books API** with original cover posters.
- **Digital Manuscript Press**: Import `.epub`, `.pdf`, or `.txt` files directly in the browser.
- **Editorial & Narrator Voice Studio**: Distinct AI pop-art resident personas (**Homelander**, **Taylor Swift**, **Deadpool**, **Gandalf**) plus custom literary voices.
- **Progressive Web App (PWA)**: Installable desktop/mobile experience with offline asset and cover poster caching.
