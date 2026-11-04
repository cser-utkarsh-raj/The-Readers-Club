import JSZip from 'jszip';
import { ContentAvailabilityStatus } from '../types/book';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB max upload size

export interface ExtractedChapterSection {
  number: number;
  title: string;
  paragraphs: string[];
  pageRangeLabel?: string;
  estimatedPages?: number;
}

export interface FileExtractionResult {
  text: string;
  detectedFormat: 'EPUB' | 'PDF' | 'TXT';
  availabilityStatus: ContentAvailabilityStatus;
  sourceAttribution: string;
  extractedTitle?: string;
  extractedAuthor?: string;
  chapters: ExtractedChapterSection[];
  pageCount?: number;
  warningMessage?: string;
  errorMessage?: string;
}

/**
 * Resolves a relative path against a base directory inside an EPUB ZIP archive.
 */
export function resolveEpubRelativePath(baseDirOrFile: string, relativeHref: string): string {
  const cleanHref = decodeURIComponent(relativeHref.split('#')[0].trim());
  const normalizedBase = /\.(opf|xml|ncx|xhtml|html)$/i.test(baseDirOrFile)
    ? baseDirOrFile.includes('/')
      ? baseDirOrFile.slice(0, baseDirOrFile.lastIndexOf('/'))
      : ''
    : baseDirOrFile;
  if (!normalizedBase) return cleanHref.replace(/^\/+/, '');
  const combined = `${normalizedBase.replace(/\/+$/, '')}/${cleanHref}`;
  const parts = combined.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

/**
 * Strips HTML/XHTML tags and decodes common entities into clean paragraphs.
 * Works identically in browser and Node.js test environments.
 */
export function extractParagraphsFromHtml(rawHtml: string): {
  heading?: string;
  paragraphs: string[];
} {
  // Remove script, style, head, nav, svg
  const withoutScripts = rawHtml
    .replace(/<(script|style|head|nav|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Extract first h1/h2/h3 or title
  const headingMatch =
    withoutScripts.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i) ||
    rawHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const rawHeading = headingMatch
    ? decodeHtmlEntities(headingMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    : undefined;

  // Split block elements (<p>, <div>, <li>, <blockquote>, <h1-h6>, <br>) into paragraph boundaries
  const blockMatches = [
    ...withoutScripts.matchAll(
      /<(p|blockquote|li|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi
    ),
  ];

  const paragraphs: string[] = [];
  if (blockMatches.length > 0) {
    for (const m of blockMatches) {
      const tag = m[1].toLowerCase();
      const text = decodeHtmlEntities(
        m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      );
      if (!text) continue;
      // Avoid duplicating the chapter heading as the first paragraph
      if (/^h[1-3]$/.test(tag) && text === rawHeading) continue;
      if (text.length >= 20) {
        paragraphs.push(text);
      }
    }
  }

  if (paragraphs.length === 0) {
    const plainText = decodeHtmlEntities(
      withoutScripts
        .replace(/<\/(p|div|section|article|li|blockquote|h[1-6]|tr)>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
    );
    for (const block of plainText.split(/\n\s*\n/)) {
      const cleaned = block.replace(/\s+/g, ' ').trim();
      if (cleaned.length >= 20 && cleaned !== rawHeading) {
        paragraphs.push(cleaned);
      }
    }
  }

  return {
    heading: rawHeading && rawHeading.length > 1 ? rawHeading : undefined,
    paragraphs,
  };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&rsquo;|&#8217;/gi, '’')
    .replace(/&lsquo;|&#8216;/gi, '‘')
    .replace(/&ldquo;|&#8220;/gi, '“')
    .replace(/&rdquo;|&#8221;/gi, '”')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Decodes a binary buffer into text, handling UTF-8 BOM, UTF-16LE/BE BOM, and Latin-1 fallback.
 */
export function decodeTextBufferWithEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return '';

  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  // UTF-16LE BOM
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  // UTF-16BE BOM
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * Parses an EPUB archive following the official EPUB container.xml -> OPF manifest & spine specification.
 */
export async function parseEpubBuffer(
  arrayBuffer: ArrayBuffer,
  fileName = 'book.epub'
): Promise<FileExtractionResult> {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return {
      text: '',
      detectedFormat: 'EPUB',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded EPUB (${fileName})`,
      chapters: [],
      errorMessage: 'EMPTY_FILE: The uploaded EPUB file is empty.',
    };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    return {
      text: '',
      detectedFormat: 'EPUB',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded EPUB (${fileName})`,
      chapters: [],
      errorMessage:
        'MALFORMED_EPUB: The file is not a valid EPUB ZIP archive or is corrupted.',
    };
  }

  // 1. Locate OPF package path via META-INF/container.xml
  let opfPath: string | null = null;
  const containerEntry =
    zip.file('META-INF/container.xml') ||
    zip.file(
      Object.keys(zip.files).find((k) =>
        k.toLowerCase().endsWith('meta-inf/container.xml')
      ) || ''
    );

  if (containerEntry) {
    const containerXml = await containerEntry.async('string');
    const fullPathMatch = containerXml.match(/full-path\s*=\s*["']([^"']+)["']/i);
    if (fullPathMatch) {
      opfPath = fullPathMatch[1].trim();
    }
  }

  // Fallback if container.xml is missing: search for .opf file in archive
  if (!opfPath || !zip.file(opfPath)) {
    const opfCandidate = Object.keys(zip.files).find((k) =>
      k.toLowerCase().endsWith('.opf')
    );
    if (opfCandidate) {
      opfPath = opfCandidate;
    }
  }

  if (!opfPath || !zip.file(opfPath)) {
    return {
      text: '',
      detectedFormat: 'EPUB',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded EPUB (${fileName})`,
      chapters: [],
      errorMessage:
        'MISSING_OPF_PACKAGE: Could not locate the EPUB OPF package document (container.xml / content.opf).',
    };
  }

  const opfXml = await zip.file(opfPath)!.async('string');
  const opfDir = opfPath.includes('/')
    ? opfPath.slice(0, opfPath.lastIndexOf('/'))
    : '';

  // 2. Extract metadata (dc:title, dc:creator)
  const titleMatch = opfXml.match(/<(?:dc:)?title\b[^>]*>([\s\S]*?)<\/(?:dc:)?title>/i);
  const creatorMatch = opfXml.match(
    /<(?:dc:)?creator\b[^>]*>([\s\S]*?)<\/(?:dc:)?creator>/i
  );
  const extractedTitle = titleMatch
    ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim())
    : undefined;
  const extractedAuthor = creatorMatch
    ? decodeHtmlEntities(creatorMatch[1].replace(/<[^>]+>/g, '').trim())
    : undefined;

  // 3. Parse <manifest> items: id -> { href, mediaType, properties }
  const manifestMap = new Map<
    string,
    { href: string; mediaType: string; properties: string }
  >();
  const itemRegex = /<item\b([^>]*?)\/?>/gi;
  for (const match of opfXml.matchAll(itemRegex)) {
    const attrs = match[1];
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    const mediaType =
      attrs.match(/\bmedia-type\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    const properties =
      attrs.match(/\bproperties\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (id && href) {
      manifestMap.set(id, { href, mediaType, properties });
    }
  }

  // 4. Parse navigation titles from NCX or EPUB3 Nav Document
  const hrefTitleMap = new Map<string, string>();
  for (const [, item] of manifestMap.entries()) {
    const isNcx =
      item.mediaType.includes('dtbncx') ||
      item.href.toLowerCase().endsWith('.ncx');
    const isNav = item.properties.split(/\s+/).includes('nav');

    if (isNcx || isNav) {
      const navZipPath = resolveEpubRelativePath(opfDir, item.href);
      const navFile = zip.file(navZipPath);
      if (!navFile) continue;
      const navContent = await navFile.async('string');
      const navDir = navZipPath.includes('/')
        ? navZipPath.slice(0, navZipPath.lastIndexOf('/'))
        : '';

      if (isNcx) {
        const navPointRegex =
          /<navPoint\b[\s\S]*?<navLabel>\s*<text>([\s\S]*?)<\/text>\s*<\/navLabel>\s*<content\b[^>]*src\s*=\s*["']([^"']+)["']/gi;
        for (const nm of navContent.matchAll(navPointRegex)) {
          const label = decodeHtmlEntities(nm[1].replace(/<[^>]+>/g, '').trim());
          const resolvedTarget = resolveEpubRelativePath(navDir, nm[2]);
          if (label && resolvedTarget && !hrefTitleMap.has(resolvedTarget)) {
            hrefTitleMap.set(resolvedTarget, label);
          }
        }
      } else {
        const linkRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        for (const lm of navContent.matchAll(linkRegex)) {
          const label = decodeHtmlEntities(lm[2].replace(/<[^>]+>/g, '').trim());
          const resolvedTarget = resolveEpubRelativePath(navDir, lm[1]);
          if (label && resolvedTarget && !hrefTitleMap.has(resolvedTarget)) {
            hrefTitleMap.set(resolvedTarget, label);
          }
        }
      }
    }
  }

  // 5. Parse <spine> <itemref idref="..."> in exact spine reading order
  const spineIdrefs: string[] = [];
  const spineMatch = opfXml.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i);
  const spineBlock = spineMatch ? spineMatch[1] : opfXml;
  const itemrefRegex = /<itemref\b([^>]*?)\/?>/gi;
  for (const match of spineBlock.matchAll(itemrefRegex)) {
    const attrs = match[1];
    const linear = attrs.match(/\blinear\s*=\s*["']([^"']+)["']/i)?.[1];
    if (linear && linear.toLowerCase() === 'no') continue;
    const idref = attrs.match(/\bidref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (idref) {
      spineIdrefs.push(idref);
    }
  }

  // Build ordered list of zip file paths from the OPF spine
  const orderedZipPaths: string[] = [];
  for (const idref of spineIdrefs) {
    const manifestItem = manifestMap.get(idref);
    if (!manifestItem) continue;
    if (manifestItem.properties.split(/\s+/).includes('nav')) continue;
    const resolvedPath = resolveEpubRelativePath(opfDir, manifestItem.href);
    if (!orderedZipPaths.includes(resolvedPath)) {
      orderedZipPaths.push(resolvedPath);
    }
  }

  const chapters: ExtractedChapterSection[] = [];

  for (const zipPath of orderedZipPaths) {
    // Case-insensitive lookup if needed
    const entry =
      zip.file(zipPath) ||
      zip.file(
        Object.keys(zip.files).find(
          (k) => k.toLowerCase() === zipPath.toLowerCase()
        ) || ''
      );
    if (!entry) continue;

    const rawBytes = await entry.async('arraybuffer');
    const rawHtml = decodeTextBufferWithEncoding(rawBytes);
    const { heading, paragraphs } = extractParagraphsFromHtml(rawHtml);

    const totalChars = paragraphs.join(' ').length;
    if (paragraphs.length === 0 || totalChars < 60) {
      continue;
    }

    const navTitle = hrefTitleMap.get(zipPath);
    const rawTitle = navTitle || heading || `Chapter ${chapters.length + 1}`;
    // Skip pure table-of-contents or license boilerplate if short
    if (
      /^(table of contents|contents|copyright|colophon)$/i.test(rawTitle.trim()) &&
      totalChars < 500
    ) {
      continue;
    }

    const chapterNum = chapters.length + 1;
    const formattedTitle = /^(chapter|book|part|act|canto|section|prologue|epilogue)\b/i.test(
      rawTitle.trim()
    )
      ? rawTitle.trim()
      : `Chapter ${chapterNum}: ${rawTitle.trim()}`;

    const wordCount = paragraphs.join(' ').split(/\s+/).length;
    const estimatedPages = Math.max(1, Math.round(wordCount / 250));

    chapters.push({
      number: chapterNum,
      title: formattedTitle,
      paragraphs,
      estimatedPages,
    });
  }

  if (chapters.length === 0) {
    return {
      text: '',
      detectedFormat: 'EPUB',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded EPUB (${fileName})`,
      extractedTitle,
      extractedAuthor,
      chapters: [],
      errorMessage:
        'EPUB_NO_READABLE_CHAPTERS: No readable text chapters could be extracted from the EPUB spine.',
    };
  }

  const combinedText = chapters
    .map((ch) => `${ch.title}\n\n${ch.paragraphs.join('\n\n')}`)
    .join('\n\n');

  return {
    text: combinedText,
    detectedFormat: 'EPUB',
    availabilityStatus: 'full_text',
    sourceAttribution: `Uploaded EPUB (${fileName}) · ${chapters.length} Spine Chapters`,
    extractedTitle,
    extractedAuthor,
    chapters,
  };
}

/**
 * Extracts text from a PDF buffer using pdfjs-dist, preserving page boundaries
 * and detecting scanned / image-only PDFs that require OCR.
 */
export async function parsePdfBuffer(
  arrayBuffer: ArrayBuffer,
  fileName = 'document.pdf'
): Promise<FileExtractionResult> {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return {
      text: '',
      detectedFormat: 'PDF',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded PDF (${fileName})`,
      chapters: [],
      errorMessage: 'EMPTY_FILE: The uploaded PDF file is empty.',
    };
  }

  const headerBytes = new Uint8Array(arrayBuffer.slice(0, 8));
  const headerStr = new TextDecoder('ascii').decode(headerBytes);
  if (!headerStr.startsWith('%PDF-')) {
    return {
      text: '',
      detectedFormat: 'PDF',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded PDF (${fileName})`,
      chapters: [],
      errorMessage:
        'INVALID_PDF_HEADER: File does not start with a valid %PDF- signature.',
    };
  }

  let pageTexts: { pageNumber: number; paragraphs: string[]; rawText: string }[] = [];
  let numPages = 0;

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0)),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdfDoc = await loadingTask.promise;
    numPages = pdfDoc.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const lines: string[] = [];
      let currentLine = '';
      let lastY: number | null = null;

      for (const item of textContent.items as Array<{
        str?: string;
        transform?: number[];
        hasEOL?: boolean;
      }>) {
        if (typeof item.str !== 'string') continue;
        const y = Array.isArray(item.transform) ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 6) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = item.str;
        } else {
          currentLine += (currentLine && !currentLine.endsWith(' ') ? ' ' : '') + item.str;
        }
        if (item.hasEOL) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
          lastY = null;
        } else {
          lastY = y;
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());

      const rawPageText = lines.join('\n').trim();
      // Group lines into paragraphs
      const paras: string[] = [];
      let bufferPara = '';
      for (const line of lines) {
        if (!line) continue;
        bufferPara += (bufferPara ? ' ' : '') + line;
        if (/[.!?]["'”’)]?$/.test(line) && bufferPara.length >= 120) {
          paras.push(bufferPara.replace(/\s+/g, ' ').trim());
          bufferPara = '';
        }
      }
      if (bufferPara.trim()) {
        paras.push(bufferPara.replace(/\s+/g, ' ').trim());
      }

      pageTexts.push({
        pageNumber: pageNum,
        paragraphs: paras,
        rawText: rawPageText,
      });
    }
  } catch (pdfErr: unknown) {
    const errMsg =
      pdfErr instanceof Error ? pdfErr.message : 'Unable to parse PDF structure.';
    return {
      text: '',
      detectedFormat: 'PDF',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded PDF (${fileName})`,
      chapters: [],
      errorMessage: `PDF_EXTRACTION_ERROR: ${errMsg}`,
    };
  }

  const totalAlphaChars = pageTexts
    .map((p) => p.rawText.replace(/[^a-zA-Z0-9]/g, ''))
    .join('').length;

  // Detect scanned / image-only PDFs that require OCR
  if (numPages >= 1 && totalAlphaChars < 40) {
    return {
      text: '',
      detectedFormat: 'PDF',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded PDF (${fileName} · ${numPages} page${numPages === 1 ? '' : 's'})`,
      pageCount: numPages,
      chapters: [],
      warningMessage:
        'OCR_REQUIRED: This PDF appears to be a scanned or image-only document without an extractable text layer.',
      errorMessage:
        'OCR_REQUIRED: No extractable text layer was found in this PDF. Please run OCR on the scanned document before uploading.',
    };
  }

  // Group PDF pages into chapters by detecting chapter headings or grouping into page ranges
  const chapters: ExtractedChapterSection[] = [];
  const headingRegex =
    /^(?:CHAPTER|Chapter|BOOK|Book|PART|Part|SECTION|Section)\s+(?:[IVXLCDM\d]+|[A-Za-z]+)(?:[:.\s-].*)?$/;

  let currentChapterTitle = 'Chapter 1: Opening Pages';
  let currentParagraphs: string[] = [];
  let startPage = 1;
  let lastPage = 1;

  for (const pt of pageTexts) {
    if (pt.paragraphs.length === 0) continue;
    const firstPara = pt.paragraphs[0].trim();
    const firstLine = pt.rawText.split('\n')[0]?.trim() || '';

    const detectedHeading = headingRegex.test(firstLine)
      ? firstLine
      : headingRegex.test(firstPara) && firstPara.length < 90
      ? firstPara
      : null;

    if (detectedHeading && currentParagraphs.length > 0) {
      chapters.push({
        number: chapters.length + 1,
        title: currentChapterTitle,
        paragraphs: currentParagraphs,
        pageRangeLabel:
          startPage === lastPage
            ? `Page ${startPage}`
            : `Pages ${startPage}–${lastPage}`,
        estimatedPages: Math.max(1, lastPage - startPage + 1),
      });
      currentChapterTitle = detectedHeading;
      currentParagraphs = [];
      startPage = pt.pageNumber;
    } else if (detectedHeading && currentParagraphs.length === 0) {
      currentChapterTitle = detectedHeading;
      startPage = pt.pageNumber;
    }

    for (const p of pt.paragraphs) {
      if (p === detectedHeading) continue;
      currentParagraphs.push(p);
    }
    lastPage = pt.pageNumber;
  }

  if (currentParagraphs.length > 0) {
    chapters.push({
      number: chapters.length + 1,
      title: currentChapterTitle,
      paragraphs: currentParagraphs,
      pageRangeLabel:
        startPage === lastPage
          ? `Page ${startPage}`
          : `Pages ${startPage}–${lastPage}`,
      estimatedPages: Math.max(1, lastPage - startPage + 1),
    });
  }

  // If no explicit Chapter headings were in a multi-page PDF, group every ~5 pages cleanly
  if (chapters.length === 1 && pageTexts.length >= 6) {
    const pagedChapters: ExtractedChapterSection[] = [];
    const pagesPerSection = Math.max(3, Math.ceil(pageTexts.length / Math.min(12, Math.ceil(pageTexts.length / 4))));
    for (let i = 0; i < pageTexts.length; i += pagesPerSection) {
      const slice = pageTexts.slice(i, i + pagesPerSection);
      const paras = slice.flatMap((s) => s.paragraphs).filter(Boolean);
      if (paras.length === 0) continue;
      const pStart = slice[0].pageNumber;
      const pEnd = slice[slice.length - 1].pageNumber;
      const num = pagedChapters.length + 1;
      pagedChapters.push({
        number: num,
        title: `Chapter ${num} (Pages ${pStart}–${pEnd})`,
        paragraphs: paras,
        pageRangeLabel: pStart === pEnd ? `Page ${pStart}` : `Pages ${pStart}–${pEnd}`,
        estimatedPages: Math.max(1, pEnd - pStart + 1),
      });
    }
    if (pagedChapters.length > 1) {
      chapters.splice(0, chapters.length, ...pagedChapters);
    }
  }

  const combinedText = chapters
    .map((ch) => `${ch.title}\n\n${ch.paragraphs.join('\n\n')}`)
    .join('\n\n');

  return {
    text: combinedText,
    detectedFormat: 'PDF',
    availabilityStatus: 'full_text',
    sourceAttribution: `Uploaded PDF (${fileName} · ${numPages} page${numPages === 1 ? '' : 's'})`,
    pageCount: numPages,
    chapters,
  };
}

/**
 * Parses a plain text / Markdown buffer into structured chapters without fabricating content.
 */
export function parseTextBuffer(
  arrayBuffer: ArrayBuffer,
  fileName = 'book.txt'
): FileExtractionResult {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return {
      text: '',
      detectedFormat: 'TXT',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded Text (${fileName})`,
      chapters: [],
      errorMessage: 'EMPTY_FILE: The uploaded text file is empty.',
    };
  }

  const decoded = decodeTextBufferWithEncoding(arrayBuffer)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (decoded.replace(/\s+/g, '').length < 30) {
    return {
      text: '',
      detectedFormat: 'TXT',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: `Uploaded Text (${fileName})`,
      chapters: [],
      errorMessage:
        'INSUFFICIENT_TEXT: The uploaded text file contains fewer than 30 readable characters.',
    };
  }

  // Support multiple heading styles: "Chapter X", "BOOK X", "PART X", Markdown "# Heading", or Roman numeral headings "I. Title"
  const headingRegex =
    /(?:^|\n)[ \t]*(?:(?:#{1,3}\s+[^\n]+)|(?:(?:CHAPTER|Chapter|BOOK|Book|PART|Part|SECTION|Section|ACT|Act|CANTO|Canto)\s+(?:[IVXLCDM\d]+|[A-Za-z]+)(?:[:.\s-][^\n]*)?)|(?:[IVXLCDM]{1,6}\.\s+[A-Z][^\n]{2,60}))(?=\n|$)/g;

  const matches = [...decoded.matchAll(headingRegex)];
  const chapters: ExtractedChapterSection[] = [];

  if (matches.length >= 2) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index ?? 0;
      const end =
        i + 1 < matches.length ? (matches[i + 1].index ?? decoded.length) : decoded.length;
      const rawHeading = matches[i][0].replace(/^[\n\s#]+/, '').trim();
      const bodySlice = decoded.slice(start + matches[i][0].length, end).trim();
      const paras = bodySlice
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter((p) => p.length > 0);

      if (paras.length > 0 && paras.join(' ').length >= 25) {
        const num = chapters.length + 1;
        const normalizedTitle = /^(chapter|book|part|act|canto|section)\b/i.test(rawHeading)
          ? rawHeading
          : `Chapter ${num}: ${rawHeading}`;
        const words = paras.join(' ').split(/\s+/).length;
        chapters.push({
          number: num,
          title: normalizedTitle,
          paragraphs: paras,
          estimatedPages: Math.max(1, Math.round(words / 250)),
        });
      }
    }
  }

  if (chapters.length === 0) {
    const allParas = decoded
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    if (allParas.length <= 6) {
      const words = allParas.join(' ').split(/\s+/).length;
      chapters.push({
        number: 1,
        title: 'Chapter 1: Complete Text',
        paragraphs: allParas,
        estimatedPages: Math.max(1, Math.round(words / 250)),
      });
    } else {
      const parasPerSection = Math.max(4, Math.ceil(allParas.length / Math.min(18, Math.ceil(allParas.length / 4))));
      for (let i = 0; i < allParas.length; i += parasPerSection) {
        const slice = allParas.slice(i, i + parasPerSection);
        const num = chapters.length + 1;
        const words = slice.join(' ').split(/\s+/).length;
        chapters.push({
          number: num,
          title: `Chapter ${num}`,
          paragraphs: slice,
          estimatedPages: Math.max(1, Math.round(words / 250)),
        });
      }
    }
  }

  return {
    text: decoded,
    detectedFormat: 'TXT',
    availabilityStatus: 'full_text',
    sourceAttribution: `Uploaded Text (${fileName})`,
    chapters,
  };
}

/**
 * Unified entry point for extracting and validating uploaded files (.epub, .pdf, .txt, .md).
 * Never fabricates synthetic chapter content on extraction failure.
 */
export async function extractTextFromUploadedFile(
  file: File
): Promise<FileExtractionResult> {
  const lowerName = (file.name || '').toLowerCase().trim();

  if (file.size === 0) {
    return {
      text: '',
      detectedFormat: 'TXT',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: file.name || 'Uploaded File',
      chapters: [],
      errorMessage: 'EMPTY_FILE: The selected file is empty (0 bytes).',
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      text: '',
      detectedFormat: 'TXT',
      availabilityStatus: 'extraction_failed',
      sourceAttribution: file.name,
      chapters: [],
      errorMessage: `FILE_TOO_LARGE: File exceeds the 50 MB limit (${(
        file.size /
        (1024 * 1024)
      ).toFixed(1)} MB).`,
    };
  }

  const isEpub = lowerName.endsWith('.epub');
  const isPdf = lowerName.endsWith('.pdf');
  const isTxt = lowerName.endsWith('.txt') || lowerName.endsWith('.md');

  if (!isEpub && !isPdf && !isTxt) {
    return {
      text: '',
      detectedFormat: 'TXT',
      availabilityStatus: 'unsupported_format',
      sourceAttribution: file.name,
      chapters: [],
      errorMessage: `UNSUPPORTED_FORMAT: "${file.name}" is not a supported format. Please upload an .epub, .pdf, .txt, or .md file.`,
    };
  }

  const buffer = await file.arrayBuffer();

  if (isEpub) {
    return parseEpubBuffer(buffer, file.name);
  }
  if (isPdf) {
    return parsePdfBuffer(buffer, file.name);
  }
  return parseTextBuffer(buffer, file.name);
}
