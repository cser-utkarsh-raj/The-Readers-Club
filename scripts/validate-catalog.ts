import { OPEN_SOURCE_BOOKS } from '../frontend/src/data/openSourceBooks';
import { GLOBAL_CATALOG_BOOKS } from '../frontend/src/data/globalCatalogSeed';
import { auditCatalogIntegrity } from '../frontend/src/utils/catalogIntegrity';

const report = auditCatalogIntegrity(OPEN_SOURCE_BOOKS, GLOBAL_CATALOG_BOOKS);

console.log('==========================================================');
console.log(' THE READERS CLUB — CATALOGUE INTEGRITY VALIDATION REPORT');
console.log('==========================================================');
console.log(`Generated At                     : ${report.generatedAt}`);
console.log(`Total Raw Records                : ${report.totalRawRecords}`);
console.log(`  - Curated Seed Records         : ${report.curatedBookRecords}`);
console.log(`  - Global Catalogue Records     : ${report.globalCatalogRecords}`);
console.log(`Unique Books (by ID/Edition)     : ${report.uniqueBooksCount}`);
console.log(`Unique Titles (Normalized)       : ${report.uniqueTitlesAcrossAllPools}`);
console.log(`Duplicate Records                : ${report.duplicateRecords.length}`);
console.log(`Invalid / Missing Source IDs     : ${report.invalidOrMissingSourceIds.length}`);
console.log(`Broken Source Metadata           : ${report.brokenSourceMetadata.length}`);
console.log(`Missing Covers                   : ${report.missingCovers.length}`);
console.log('----------------------------------------------------------');
console.log(' CONTENT AVAILABILITY BREAKDOWN:');
console.log(`  - Condensed Editions (Local)   : ${report.condensedEditions.count}`);
console.log(`  - Locally Available Full Text  : ${report.locallyAvailableFullTextBooks.count}`);
console.log(`  - External Source Available    : ${report.externalSourceAvailableBooks.count}`);
console.log(`  - Metadata-Only Books          : ${report.metadataOnlyBooks.count}`);
console.log(`  - User Uploaded Books          : ${report.userUploadedBooks.count}`);
console.log('----------------------------------------------------------');
console.log(`Suspicious Chapter Counts Flagged: ${report.suspiciousChapterCounts.length}`);
if (report.suspiciousChapterCounts.length > 0) {
  console.log(
    `  (Note: ${report.suspiciousChapterCounts.length} unhydrated seed entries carry an unverified chapterCount=18 estimate; these are marked as 'unparsed' estimates in the UI until hydrated from Project Gutenberg.)`
  );
}
console.log('==========================================================');

if (
  report.duplicateRecords.length > 0 ||
  report.invalidOrMissingSourceIds.length > 0 ||
  report.brokenSourceMetadata.length > 0 ||
  report.missingCovers.length > 0
) {
  console.error('Catalogue validation detected structural errors:', {
    duplicateRecords: report.duplicateRecords,
    invalidOrMissingSourceIds: report.invalidOrMissingSourceIds,
    brokenSourceMetadata: report.brokenSourceMetadata,
    missingCovers: report.missingCovers,
  });
  process.exit(1);
}
