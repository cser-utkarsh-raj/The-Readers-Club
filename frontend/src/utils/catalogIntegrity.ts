import {
  BookItem,
  ContentAvailabilityStatus,
  ExternalCatalogBook,
} from '../types/book';

export type CanonicalContentCategory =
  | 'metadata_only'
  | 'external_source_available'
  | 'full_text_available'
  | 'condensed_edition'
  | 'user_uploaded'
  | 'preview'
  | 'extraction_failed'
  | 'unsupported_format';

export interface CatalogValidationIssue {
  id: string;
  title: string;
  author: string;
  reason: string;
}

export interface CatalogIntegrityReport {
  generatedAt: string;
  totalRawRecords: number;
  curatedBookRecords: number;
  globalCatalogRecords: number;
  uniqueBooksCount: number;
  uniqueTitlesAcrossAllPools: number;
  duplicateRecords: CatalogValidationIssue[];
  invalidOrMissingSourceIds: CatalogValidationIssue[];
  brokenSourceMetadata: CatalogValidationIssue[];
  missingCovers: CatalogValidationIssue[];
  metadataOnlyBooks: { count: number; ids: string[] };
  externalSourceAvailableBooks: { count: number; ids: string[] };
  locallyAvailableFullTextBooks: { count: number; ids: string[] };
  condensedEditions: { count: number; ids: string[] };
  userUploadedBooks: { count: number; ids: string[] };
  suspiciousChapterCounts: CatalogValidationIssue[];
}

/**
 * Normalizes a string for metadata comparison while preserving edition markers.
 */
export function normalizeMetadataString(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves the canonical V1.0.1 content availability category for any BookItem or ExternalCatalogBook.
 * Never treats a Gutenberg ID, title, description, or cover URL alone as proof that full text is already locally available.
 */
export function classifyBookContentAvailability(
  record: BookItem | ExternalCatalogBook
): CanonicalContentCategory {
  if (record.availabilityStatus === 'extraction_failed') {
    return 'extraction_failed';
  }
  if (record.availabilityStatus === 'unsupported_format') {
    return 'unsupported_format';
  }
  if (record.availabilityStatus === 'preview') {
    return 'preview';
  }

  const isBookItem = 'chapters' in record && Array.isArray(record.chapters);

  if (isBookItem) {
    const book = record as BookItem;
    if (book.sourceType === 'uploaded' || book.availabilityStatus === 'user_uploaded') {
      return book.chapters.length > 0 ? 'user_uploaded' : 'extraction_failed';
    }

    if (
      book.availabilityStatus === 'condensed_edition' ||
      (book.sourceType === 'open_source' && book.isPreCompressed !== false)
    ) {
      return 'condensed_edition';
    }

    // Check if full original chapters have actually been parsed and populated
    const totalWords = book.chapters.reduce(
      (sum, ch) =>
        sum +
        (ch.originalText || [])
          .join(' ')
          .split(/\s+/)
          .filter(Boolean).length,
      0
    );

    if (book.chapters.length > 0 && totalWords >= 800) {
      return 'full_text_available';
    }

    if (book.chapters.length > 0 && book.isPreCompressed) {
      return 'condensed_edition';
    }

    if (
      book.availabilityStatus === 'external_source_available' ||
      (book.gutenbergId && book.gutenbergId > 0 && book.chapters.length === 0)
    ) {
      return 'external_source_available';
    }

    if (book.chapters.length > 0) {
      return 'full_text_available';
    }

    return 'metadata_only';
  }

  // ExternalCatalogBook (unhydrated catalog item)
  const ext = record as ExternalCatalogBook;
  if (ext.availabilityStatus === 'condensed_edition') {
    return 'condensed_edition';
  }
  if (ext.availabilityStatus === 'full_text_available') {
    return 'full_text_available';
  }
  if (ext.previewText && ext.previewText.length > 0) {
    return 'preview';
  }
  const src = ext.sourceApi || ext.source || (ext.gutenbergId ? 'gutendex' : 'google_books');
  if (src === 'gutendex' && typeof ext.gutenbergId === 'number' && ext.gutenbergId > 0) {
    return 'external_source_available';
  }
  return 'metadata_only';
}

/**
 * Validates a Project Gutenberg source reference on a catalog or book record.
 */
export function validateGutenbergSourceMetadata(
  record: BookItem | ExternalCatalogBook
): {
  valid: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const src =
    'sourceType' in record
      ? record.sourceType
      : record.sourceApi || record.source;

  if (src === 'gutendex' || record.gutenbergId !== undefined) {
    if (
      typeof record.gutenbergId !== 'number' ||
      !Number.isInteger(record.gutenbergId) ||
      record.gutenbergId <= 0
    ) {
      reasons.push(
        'Missing or invalid positive integer gutenbergId for Gutenberg record.'
      );
    }
  }

  if (typeof record.gutenbergId === 'number' && record.gutenbergId > 0) {
    const cover = record.coverUrl || '';
    const coverMatch = cover.match(/\/epub\/(\d+)\/pg(\d+)\./i);
    if (coverMatch) {
      const dirId = Number(coverMatch[1]);
      const fileId = Number(coverMatch[2]);
      if (dirId !== record.gutenbergId || fileId !== record.gutenbergId) {
        reasons.push(
          `Cover URL Gutenberg ID (${dirId}/${fileId}) does not match record gutenbergId (${record.gutenbergId}).`
        );
      }
    }
  }

  if (!record.title || record.title.trim().length < 2) {
    reasons.push('Missing or invalid book title.');
  }
  if (!record.author || record.author.trim().length < 2) {
    reasons.push('Missing or invalid book author.');
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

/**
 * Deduplicates ExternalCatalogBook entries using stable identifiers and edition-aware metadata.
 * - Never merges two different editions (different gutenbergId or different publication year/subtitle)
 *   merely because their main titles match.
 * - Merges exact duplicates that share the same gutenbergId, or identical id, or identical (title + author + year + sourceApi).
 */
export function deduplicateCatalogBooks(books: ExternalCatalogBook[]): {
  uniqueBooks: ExternalCatalogBook[];
  duplicates: CatalogValidationIssue[];
} {
  const seenGutenbergIds = new Map<number, string>();
  const seenRecordIds = new Set<string>();
  const seenEditionSignatures = new Map<string, string>();

  const uniqueBooks: ExternalCatalogBook[] = [];
  const duplicates: CatalogValidationIssue[] = [];

  for (const item of books) {
    if (!item || typeof item !== 'object') continue;

    // 1. Check exact record ID collision
    if (seenRecordIds.has(item.id)) {
      duplicates.push({
        id: item.id,
        title: item.title,
        author: item.author,
        reason: `Duplicate record ID "${item.id}"`,
      });
      continue;
    }

    // 2. Check exact Project Gutenberg ID collision
    if (typeof item.gutenbergId === 'number' && item.gutenbergId > 0) {
      const existingId = seenGutenbergIds.get(item.gutenbergId);
      if (existingId) {
        duplicates.push({
          id: item.id,
          title: item.title,
          author: item.author,
          reason: `Duplicate gutenbergId #${item.gutenbergId} (already present as "${existingId}")`,
        });
        continue;
      }
    }

    // 3. Edition-aware signature: normalized title + author + year + sourceApi + gutenbergId (if present)
    // Different editions (e.g. different years or different Gutenberg IDs) are preserved!
    const normTitle = normalizeMetadataString(item.title);
    const normAuthor = normalizeMetadataString(item.author);
    const normYear = normalizeMetadataString(item.year || '');
    const srcApi = item.sourceApi || item.source || (item.gutenbergId ? 'gutendex' : 'google_books');
    const editionKey = item.gutenbergId
      ? `pg::${item.gutenbergId}::${normTitle}::${normAuthor}`
      : `${srcApi}::${normTitle}::${normAuthor}::${normYear}`;

    const existingSigId = seenEditionSignatures.get(editionKey);
    if (existingSigId) {
      duplicates.push({
        id: item.id,
        title: item.title,
        author: item.author,
        reason: `Duplicate edition signature "${editionKey}" (already present as "${existingSigId}")`,
      });
      continue;
    }

    seenRecordIds.add(item.id);
    if (typeof item.gutenbergId === 'number' && item.gutenbergId > 0) {
      seenGutenbergIds.set(item.gutenbergId, item.id);
    }
    seenEditionSignatures.set(editionKey, item.id);

    const category = classifyBookContentAvailability(item);
    const resolvedStatus: ContentAvailabilityStatus =
      item.availabilityStatus ||
      (category === 'external_source_available'
        ? 'external_source_available'
        : category === 'preview'
        ? 'preview'
        : 'metadata_only');

    uniqueBooks.push({
      ...item,
      availabilityStatus: resolvedStatus,
      estimatedChapterCount: item.estimatedChapterCount ?? item.chapterCount,
      chapterStructure: item.chapterStructure || 'unparsed',
      sourceAttribution:
        item.sourceAttribution ||
        (item.gutenbergId
          ? `Project Gutenberg Public Domain Archive (eBook #${item.gutenbergId} — External Hydration Available)`
          : 'Google Books Discovery Catalog (Metadata Only)'),
    });
  }

  return { uniqueBooks, duplicates };
}

/**
 * Runs a complete non-destructive audit across the curated books (`OPEN_SOURCE_BOOKS`)
 * and global catalogue books (`GLOBAL_CATALOG_BOOKS`).
 */
export function auditCatalogIntegrity(
  curatedBooks: BookItem[],
  globalCatalogBooks: ExternalCatalogBook[]
): CatalogIntegrityReport {
  const duplicateRecords: CatalogValidationIssue[] = [];
  const invalidOrMissingSourceIds: CatalogValidationIssue[] = [];
  const brokenSourceMetadata: CatalogValidationIssue[] = [];
  const missingCovers: CatalogValidationIssue[] = [];
  const suspiciousChapterCounts: CatalogValidationIssue[] = [];

  const metadataOnlyIds: string[] = [];
  const externalSourceIds: string[] = [];
  const localFullTextIds: string[] = [];
  const condensedEditionIds: string[] = [];
  const userUploadedIds: string[] = [];

  // Deduplicate global catalog first
  const dedupedGlobal = deduplicateCatalogBooks(globalCatalogBooks);
  duplicateRecords.push(...dedupedGlobal.duplicates);

  // Check curated books for duplicate IDs
  const seenCuratedIds = new Set<string>();
  for (const book of curatedBooks) {
    if (seenCuratedIds.has(book.id)) {
      duplicateRecords.push({
        id: book.id,
        title: book.title,
        author: book.author,
        reason: `Duplicate curated book ID "${book.id}"`,
      });
    }
    seenCuratedIds.add(book.id);
  }

  const allRecords: Array<BookItem | ExternalCatalogBook> = [
    ...curatedBooks,
    ...globalCatalogBooks,
  ];

  // Track chapterCount frequency across globalCatalogBooks to detect template/hardcoded chapter counts
  const globalChapterCountFreq = new Map<number, number>();
  for (const g of globalCatalogBooks) {
    if (typeof g.chapterCount === 'number') {
      globalChapterCountFreq.set(
        g.chapterCount,
        (globalChapterCountFreq.get(g.chapterCount) || 0) + 1
      );
    }
  }

  for (const record of allRecords) {
    // 1. Source ID check
    const isBookItem = 'chapters' in record;
    const src = isBookItem
      ? (record as BookItem).sourceType
      : (record as ExternalCatalogBook).sourceApi ||
        (record as ExternalCatalogBook).source ||
        'gutendex';

    if (
      (src === 'gutendex' || src === 'open_source') &&
      (typeof record.gutenbergId !== 'number' || record.gutenbergId <= 0)
    ) {
      invalidOrMissingSourceIds.push({
        id: record.id,
        title: record.title,
        author: record.author,
        reason: `Record with source "${src}" is missing a valid positive gutenbergId.`,
      });
    }

    // 2. Source metadata check
    const metaCheck = validateGutenbergSourceMetadata(record);
    if (!metaCheck.valid) {
      brokenSourceMetadata.push({
        id: record.id,
        title: record.title,
        author: record.author,
        reason: metaCheck.reasons.join(' '),
      });
    }

    // 3. Cover check
    if (
      !record.coverUrl ||
      typeof record.coverUrl !== 'string' ||
      !/^https?:\/\/.+/i.test(record.coverUrl.trim())
    ) {
      missingCovers.push({
        id: record.id,
        title: record.title,
        author: record.author,
        reason: 'Missing or invalid coverUrl.',
      });
    }

    // 4. Classify content availability
    const category = classifyBookContentAvailability(record);
    switch (category) {
      case 'metadata_only':
        metadataOnlyIds.push(record.id);
        break;
      case 'external_source_available':
        externalSourceIds.push(record.id);
        break;
      case 'full_text_available':
        localFullTextIds.push(record.id);
        break;
      case 'condensed_edition':
        condensedEditionIds.push(record.id);
        break;
      case 'user_uploaded':
        userUploadedIds.push(record.id);
        break;
      default:
        break;
    }

    // 5. Suspicious chapter count checks
    if (isBookItem) {
      const b = record as BookItem;
      const totalWords = b.chapters.reduce(
        (sum, c) =>
          sum +
          (c.originalText || [])
            .join(' ')
            .split(/\s+/)
            .filter(Boolean).length,
        0
      );
      if (
        b.availabilityStatus !== 'condensed_edition' &&
        b.chapters.length > 0 &&
        b.chapters.length <= 6 &&
        totalWords < 1000
      ) {
        suspiciousChapterCounts.push({
          id: b.id,
          title: b.title,
          author: b.author,
          reason: `Book has only ${b.chapters.length} sections (${totalWords} words) but is not marked as condensed_edition.`,
        });
      }
    } else {
      const ext = record as ExternalCatalogBook;
      if (typeof ext.chapterCount === 'number' && !ext.verifiedChapterCount) {
        const freq = globalChapterCountFreq.get(ext.chapterCount) || 0;
        if (freq >= 25) {
          suspiciousChapterCounts.push({
            id: ext.id,
            title: ext.title,
            author: ext.author,
            reason: `Unverified seed chapterCount=${ext.chapterCount} appears ${freq} times across catalog seed (treated as unparsed estimate until hydrated from Project Gutenberg).`,
          });
        }
      }
    }
  }

  // Unique titles across both pools
  const uniqueTitleAuthorSet = new Set<string>();
  for (const r of [...curatedBooks, ...dedupedGlobal.uniqueBooks]) {
    uniqueTitleAuthorSet.add(
      `${normalizeMetadataString(r.title)}::${normalizeMetadataString(r.author)}`
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    totalRawRecords: curatedBooks.length + globalCatalogBooks.length,
    curatedBookRecords: curatedBooks.length,
    globalCatalogRecords: globalCatalogBooks.length,
    uniqueBooksCount: seenCuratedIds.size + dedupedGlobal.uniqueBooks.length,
    uniqueTitlesAcrossAllPools: uniqueTitleAuthorSet.size,
    duplicateRecords,
    invalidOrMissingSourceIds,
    brokenSourceMetadata,
    missingCovers,
    metadataOnlyBooks: {
      count: metadataOnlyIds.length,
      ids: metadataOnlyIds,
    },
    externalSourceAvailableBooks: {
      count: externalSourceIds.length,
      ids: externalSourceIds,
    },
    locallyAvailableFullTextBooks: {
      count: localFullTextIds.length,
      ids: localFullTextIds,
    },
    condensedEditions: {
      count: condensedEditionIds.length,
      ids: condensedEditionIds,
    },
    userUploadedBooks: {
      count: userUploadedIds.length,
      ids: userUploadedIds,
    },
    suspiciousChapterCounts,
  };
}
