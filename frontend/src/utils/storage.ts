import {
  BookItem,
  BookReadingProgress,
  ChapterSummaryMetadata,
  ClubSettings,
  PresetPersonalityId,
  UserTasteProfile,
} from '../types/book';

export const PERSISTENCE_SCHEMA_VERSION = 2;
export const LOCAL_STORAGE_STATE_KEY = 'the_readers_club_persisted_state_v2';
export const LEGACY_LOCAL_STORAGE_KEY_V1 = 'the_readers_club_state_v1';

export interface CachedSummaryEntry {
  cacheKey: string;
  bookId: string;
  chapterId: string;
  personaId: PresetPersonalityId;
  compactText: string[];
  bulletPoints: string[];
  metadata: ChapterSummaryMetadata;
}

export interface PersistedClubAppStateV2 {
  schemaVersion: 2;
  savedAt: string;
  settings: ClubSettings;
  tasteProfile: UserTasteProfile;
  readingProgressByBookId: Record<string, BookReadingProgress>;
  customBooks: BookItem[];
  summaryCache: Record<string, CachedSummaryEntry>;
  lastActiveBookId: string | null;
}

export const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  readingTheme: 'paper',
  readerFontSize: 'md',
  readerLineHeight: 'relaxed',
  readerParagraphSpacing: 'normal',
  readerContentWidth: 'comfortable',
  readerFontFamily: 'serif',
  authorPersonality: 'gandalf',
  narratorPersonality: 'gandalf',
  defaultSummaryMode: 'compact',
  summaryDetailLevel: 'compact',
  targetCompressionRatio: 0.175,
  customAuthorTrait: '',
  customNarratorTrait: '',
  useCustomAuthor: false,
  useCustomNarrator: false,
};

export const DEFAULT_USER_TASTE_PROFILE: UserTasteProfile = {
  favoriteGenres: {
    Philosophy: 3,
    Strategy: 2,
    'Classic Fiction': 3,
    Gothic: 2,
  },
  searchHistory: [],
  viewedBookIds: ['art-of-war', 'frankenstein'],
  completedBookIds: [],
  likedBookIds: [],
  dislikedBookIds: [],
  activePersona: 'gandalf',
};

/**
 * Validates and migrates any raw/legacy persisted JSON state into `PersistedClubAppStateV2`.
 * Handles missing fields, corrupted entries, and v1 -> v2 schema migrations safely.
 */
export function migratePersistedState(raw: unknown): PersistedClubAppStateV2 {
  const baseState: PersistedClubAppStateV2 = {
    schemaVersion: 2,
    savedAt: new Date().toISOString(),
    settings: { ...DEFAULT_CLUB_SETTINGS },
    tasteProfile: {
      ...DEFAULT_USER_TASTE_PROFILE,
      favoriteGenres: { ...DEFAULT_USER_TASTE_PROFILE.favoriteGenres },
    },
    readingProgressByBookId: {},
    customBooks: [],
    summaryCache: {},
    lastActiveBookId: 'art-of-war',
  };

  if (!raw || typeof raw !== 'object') {
    return baseState;
  }

  const record = raw as Record<string, unknown>;

  // Migrate settings
  if (record.settings && typeof record.settings === 'object') {
    const s = record.settings as Record<string, unknown>;
    const validPersonas: PresetPersonalityId[] = [
      'homelander',
      'taylor_swift',
      'deadpool',
      'gandalf',
    ];
    if (
      typeof s.readingTheme === 'string' &&
      ['paper', 'sepia', 'evening'].includes(s.readingTheme)
    ) {
      baseState.settings.readingTheme =
        s.readingTheme as ClubSettings['readingTheme'];
    }
    if (
      typeof s.readerFontSize === 'string' &&
      ['sm', 'md', 'lg', 'xl'].includes(s.readerFontSize)
    ) {
      baseState.settings.readerFontSize =
        s.readerFontSize as ClubSettings['readerFontSize'];
    }
    if (
      typeof s.readerLineHeight === 'string' &&
      ['snug', 'relaxed', 'loose'].includes(s.readerLineHeight)
    ) {
      baseState.settings.readerLineHeight =
        s.readerLineHeight as ClubSettings['readerLineHeight'];
    }
    if (
      typeof s.readerParagraphSpacing === 'string' &&
      ['compact', 'normal', 'roomy'].includes(s.readerParagraphSpacing)
    ) {
      baseState.settings.readerParagraphSpacing =
        s.readerParagraphSpacing as ClubSettings['readerParagraphSpacing'];
    }
    if (
      typeof s.readerContentWidth === 'string' &&
      ['narrow', 'comfortable', 'wide'].includes(s.readerContentWidth)
    ) {
      baseState.settings.readerContentWidth =
        s.readerContentWidth as ClubSettings['readerContentWidth'];
    }
    if (
      typeof s.readerFontFamily === 'string' &&
      ['serif', 'sans'].includes(s.readerFontFamily)
    ) {
      baseState.settings.readerFontFamily =
        s.readerFontFamily as ClubSettings['readerFontFamily'];
    }
    if (
      typeof s.authorPersonality === 'string' &&
      validPersonas.includes(s.authorPersonality as PresetPersonalityId)
    ) {
      baseState.settings.authorPersonality =
        s.authorPersonality as PresetPersonalityId;
    }
    if (
      typeof s.narratorPersonality === 'string' &&
      validPersonas.includes(s.narratorPersonality as PresetPersonalityId)
    ) {
      baseState.settings.narratorPersonality =
        s.narratorPersonality as PresetPersonalityId;
    }
    if (
      typeof s.defaultSummaryMode === 'string' &&
      ['original', 'compact', 'super_short', 'bullet', 'audiobook'].includes(
        s.defaultSummaryMode
      )
    ) {
      baseState.settings.defaultSummaryMode =
        s.defaultSummaryMode as ClubSettings['defaultSummaryMode'];
    }
    if (
      typeof s.summaryDetailLevel === 'string' &&
      ['compact', 'detailed', 'bullet'].includes(s.summaryDetailLevel)
    ) {
      baseState.settings.summaryDetailLevel = s.summaryDetailLevel as
        | 'compact'
        | 'detailed'
        | 'bullet';
    }
    if (typeof s.targetCompressionRatio === 'number') {
      baseState.settings.targetCompressionRatio = Math.min(
        0.5,
        Math.max(0.08, s.targetCompressionRatio)
      );
    }
    if (typeof s.customAuthorTrait === 'string') {
      baseState.settings.customAuthorTrait = s.customAuthorTrait.slice(0, 120);
    }
    if (typeof s.customNarratorTrait === 'string') {
      baseState.settings.customNarratorTrait = s.customNarratorTrait.slice(0, 120);
    }
    if (typeof s.useCustomAuthor === 'boolean') {
      baseState.settings.useCustomAuthor = s.useCustomAuthor;
    }
    if (typeof s.useCustomNarrator === 'boolean') {
      baseState.settings.useCustomNarrator = s.useCustomNarrator;
    }
  }

  // Migrate tasteProfile (supporting v1 where likedBookIds / dislikedBookIds / completedBookIds did not exist)
  if (record.tasteProfile && typeof record.tasteProfile === 'object') {
    const tp = record.tasteProfile as Record<string, unknown>;
    if (tp.favoriteGenres && typeof tp.favoriteGenres === 'object') {
      const cleanGenres: Record<string, number> = {};
      for (const [k, v] of Object.entries(
        tp.favoriteGenres as Record<string, unknown>
      )) {
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
          cleanGenres[k] = v;
        }
      }
      if (Object.keys(cleanGenres).length > 0) {
        baseState.tasteProfile.favoriteGenres = cleanGenres;
      }
    }
    if (Array.isArray(tp.searchHistory)) {
      baseState.tasteProfile.searchHistory = tp.searchHistory
        .filter((x): x is string => typeof x === 'string')
        .slice(-20);
    }
    if (Array.isArray(tp.viewedBookIds)) {
      baseState.tasteProfile.viewedBookIds = Array.from(
        new Set(tp.viewedBookIds.filter((x): x is string => typeof x === 'string'))
      );
    }
    if (Array.isArray(tp.completedBookIds)) {
      baseState.tasteProfile.completedBookIds = Array.from(
        new Set(
          tp.completedBookIds.filter((x): x is string => typeof x === 'string')
        )
      );
    }
    if (Array.isArray(tp.likedBookIds)) {
      baseState.tasteProfile.likedBookIds = Array.from(
        new Set(tp.likedBookIds.filter((x): x is string => typeof x === 'string'))
      );
    }
    if (Array.isArray(tp.dislikedBookIds)) {
      baseState.tasteProfile.dislikedBookIds = Array.from(
        new Set(
          tp.dislikedBookIds.filter((x): x is string => typeof x === 'string')
        )
      );
    }
    baseState.tasteProfile.activePersona = baseState.settings.authorPersonality;
  }

  // Migrate readingProgressByBookId
  if (
    record.readingProgressByBookId &&
    typeof record.readingProgressByBookId === 'object'
  ) {
    const rp = record.readingProgressByBookId as Record<string, unknown>;
    for (const [bookId, item] of Object.entries(rp)) {
      if (item && typeof item === 'object') {
        const entry = item as Record<string, unknown>;
        baseState.readingProgressByBookId[bookId] = {
          bookId,
          lastChapterIndex:
            typeof entry.lastChapterIndex === 'number'
              ? Math.max(0, entry.lastChapterIndex)
              : 0,
          lastSummaryMode:
            typeof entry.lastSummaryMode === 'string'
              ? (entry.lastSummaryMode as BookReadingProgress['lastSummaryMode'])
              : 'compact',
          scrollRatio:
            typeof entry.scrollRatio === 'number' &&
            Number.isFinite(entry.scrollRatio)
              ? Math.max(0, Math.min(1, entry.scrollRatio))
              : 0,
          audioChunkIndex:
            typeof entry.audioChunkIndex === 'number'
              ? Math.max(0, entry.audioChunkIndex)
              : 0,
          audioPlaybackSeconds:
            typeof entry.audioPlaybackSeconds === 'number'
              ? Math.max(0, entry.audioPlaybackSeconds)
              : 0,
          completedChapterIds: Array.isArray(entry.completedChapterIds)
            ? entry.completedChapterIds.filter(
                (x): x is string => typeof x === 'string'
              )
            : [],
          updatedAt:
            typeof entry.updatedAt === 'string'
              ? entry.updatedAt
              : new Date().toISOString(),
        };
      }
    }
  }

  // Migrate customBooks (uploaded or external books saved to user library)
  if (Array.isArray(record.customBooks)) {
    baseState.customBooks = record.customBooks
      .filter(
        (b): b is BookItem =>
          Boolean(b && typeof b === 'object' && typeof (b as BookItem).id === 'string' && typeof (b as BookItem).title === 'string')
      )
      .map((b) => ({
        ...b,
        availabilityStatus:
          b.availabilityStatus ||
          (b.chapters && b.chapters.length > 0 ? 'full_text' : 'metadata_only'),
        chapters: Array.isArray(b.chapters) ? b.chapters : [],
      }));
  }

  // Migrate summaryCache
  if (record.summaryCache && typeof record.summaryCache === 'object') {
    const sc = record.summaryCache as Record<string, unknown>;
    for (const [key, val] of Object.entries(sc)) {
      if (val && typeof val === 'object') {
        const entry = val as CachedSummaryEntry;
        if (
          Array.isArray(entry.compactText) &&
          entry.compactText.length > 0 &&
          Array.isArray(entry.bulletPoints)
        ) {
          baseState.summaryCache[key] = entry;
        }
      }
    }
  }

  if (typeof record.lastActiveBookId === 'string') {
    baseState.lastActiveBookId = record.lastActiveBookId;
  }

  return baseState;
}

export interface StorageWriteResult {
  state: PersistedClubAppStateV2;
  localStorageSucceeded: boolean;
  quotaExceeded: boolean;
  storageWarning?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

let customTestLocalStorage: StorageLike | null = null;
let customTestIdbStore: Map<string, BookItem> | null = null;

/**
 * Allows unit tests in Node.js to inject deterministic storage and IndexedDB mocks.
 */
export function configureTestStorageAdapters(options: {
  localStorage?: StorageLike | null;
  idbMap?: Map<string, BookItem> | null;
}): void {
  customTestLocalStorage = options.localStorage ?? null;
  customTestIdbStore = options.idbMap ?? null;
}

function getActiveLocalStorage(): StorageLike | null {
  if (customTestLocalStorage) return customTestLocalStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * Loads persisted state synchronously from `localStorage` (with automatic v1 -> v2 migration).
 */
export function loadPersistedAppState(): PersistedClubAppStateV2 {
  const storage = getActiveLocalStorage();
  if (!storage) {
    return migratePersistedState(null);
  }

  try {
    const rawV2 = storage.getItem(LOCAL_STORAGE_STATE_KEY);
    if (rawV2) {
      return migratePersistedState(JSON.parse(rawV2));
    }

    const rawV1 = storage.getItem(LEGACY_LOCAL_STORAGE_KEY_V1);
    if (rawV1) {
      const migrated = migratePersistedState(JSON.parse(rawV1));
      savePersistedAppState(migrated);
      return migrated;
    }
  } catch {
    // Corrupted JSON falls back cleanly to defaults
  }

  return migratePersistedState(null);
}

/**
 * Persists application state to `localStorage` with quota protection.
 * Never silently truncates chapter paragraphs into a partial chapter claiming to be complete:
 * if `localStorage` quota is exceeded, `localStorage` stores only lightweight book metadata shells
 * while full book manuscripts are persisted to `IndexedDB`.
 */
export function savePersistedAppState(
  state: Partial<PersistedClubAppStateV2>,
  options: { syncIndexedDb?: boolean } = {}
): PersistedClubAppStateV2 {
  const { syncIndexedDb = true } = options;
  const current = loadPersistedAppState();
  const merged: PersistedClubAppStateV2 = {
    ...current,
    ...state,
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
  };

  const storage = getActiveLocalStorage();
  if (storage) {
    try {
      storage.setItem(LOCAL_STORAGE_STATE_KEY, JSON.stringify(merged));
    } catch {
      // QuotaExceededError: Never silently truncate chapter paragraphs to 30 and pretend it is complete!
      // Instead, store lightweight book metadata shells in localStorage and rely on IndexedDB for full chapter text.
      try {
        const metadataShellBooks = merged.customBooks.slice(0, 50).map((b) => ({
          ...b,
          chapters: [],
          extractionError:
            b.extractionError ||
            'Full manuscript stored in IndexedDB (localStorage quota exceeded).',
        }));
        storage.setItem(
          LOCAL_STORAGE_STATE_KEY,
          JSON.stringify({ ...merged, customBooks: metadataShellBooks })
        );
      } catch {
        // Ignore storage write failure in restricted iframe environments
      }
    }
  }

  if (syncIndexedDb) {
    void saveBooksToIndexedDb(merged.customBooks);
  }
  return merged;
}

const IDB_NAME = 'TheReadersClubDB';
const IDB_VERSION = 2;
const IDB_STORE_BOOKS = 'custom_books';

function openClubIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_BOOKS)) {
          db.createObjectStore(IDB_STORE_BOOKS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Saves custom books to IndexedDB, awaiting transaction completion (`tx.oncomplete`)
 * and reconciling removed books so deleted books do not reappear after reload.
 */
export async function saveBooksToIndexedDb(
  books: BookItem[],
  reconcileDeletions = true
): Promise<boolean> {
  if (customTestIdbStore) {
    if (reconcileDeletions) {
      const keepIds = new Set(books.map((b) => b.id));
      for (const existingKey of Array.from(customTestIdbStore.keys())) {
        if (!keepIds.has(existingKey)) {
          customTestIdbStore.delete(existingKey);
        }
      }
    }
    for (const book of books) {
      customTestIdbStore.set(book.id, structuredClone(book));
    }
    return true;
  }

  const db = await openClubIndexedDb();
  if (!db) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_BOOKS, 'readwrite');
      const store = tx.objectStore(IDB_STORE_BOOKS);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);

      const writeCurrentBooks = () => {
        for (const book of books) {
          store.put(book);
        }
      };

      if (reconcileDeletions) {
        const keysReq = store.getAllKeys();
        keysReq.onsuccess = () => {
          const keepIds = new Set(books.map((b) => b.id));
          const existingKeys = Array.isArray(keysReq.result)
            ? keysReq.result
            : [];
          for (const key of existingKeys) {
            if (typeof key === 'string' && !keepIds.has(key)) {
              store.delete(key);
            }
          }
          writeCurrentBooks();
        };
        keysReq.onerror = () => {
          writeCurrentBooks();
        };
      } else {
        writeCurrentBooks();
      }
    } catch {
      resolve(false);
    }
  });
}

/**
 * Deletes a single book by ID from IndexedDB and awaits transaction completion.
 */
export async function deleteBookFromIndexedDb(bookId: string): Promise<boolean> {
  if (!bookId) return false;
  if (customTestIdbStore) {
    return customTestIdbStore.delete(bookId);
  }

  const db = await openClubIndexedDb();
  if (!db) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_BOOKS, 'readwrite');
      const store = tx.objectStore(IDB_STORE_BOOKS);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      store.delete(bookId);
    } catch {
      resolve(false);
    }
  });
}

export async function loadBooksFromIndexedDb(): Promise<BookItem[]> {
  if (customTestIdbStore) {
    return Array.from(customTestIdbStore.values()).map((b) =>
      structuredClone(b)
    );
  }

  const db = await openClubIndexedDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_BOOKS, 'readonly');
      const store = tx.objectStore(IDB_STORE_BOOKS);
      const req = store.getAll();
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? (req.result as BookItem[]) : []);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}
