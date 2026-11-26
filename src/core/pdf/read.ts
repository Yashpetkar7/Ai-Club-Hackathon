import { findDoi } from '@/core/verify/normalise';
import { findInstructions } from './injection';
import { PAGE_BREAK } from './pages';

export interface PdfRead { text: string; pages: number; extractedPages: number; doi?: string; title?: string; instructions: string[] }
export class PdfError extends Error {}

/** Reads a PDF inside the browser. The file never leaves the device. */
export async function readPdf(file: Blob, onPage?: (n: number, of: number) => void): Promise<PdfRead> {
  if (file.size > 25_000_000) throw new PdfError('This PDF is larger than 25 MB.');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new PdfError(e instanceof Error && /password/i.test(e.message) ? 'This PDF is locked with a password.' : 'This file could not be read as a PDF.');
  }
  try {
    const pages: string[] = [];
    const n = Math.min(doc.numPages, 80);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const c = await page.getTextContent();
      pages.push(c.items.map((x) => ('str' in x ? x.str + (x.hasEOL ? '\n' : '') : '')).join(' ').replace(/-\s*\n\s*(?=\p{Ll})/gu, '').replace(/\s+/g, ' ').trim());
      onPage?.(i, n);
    }
    // Not trimmed: an empty first page must still count, or every page number would be one too low.
    const text = pages.join(PAGE_BREAK);
    if (text.trim().length < 40) throw new PdfError('This PDF has no readable text. It may be a scan.');
    const meta = (await doc.getMetadata().catch(() => null))?.info as { Title?: string } | undefined;
    const doi = findDoi(pages.slice(0, 2).join(' '));
    const title = meta?.Title?.trim();
    return { text, pages: doc.numPages, extractedPages: n, instructions: findInstructions(text), ...(doi ? { doi } : {}), ...(title && title.length > 8 && !/\.(docx?|pdf|tex)$|^microsoft|untitled/i.test(title) ? { title } : {}) };
  } finally {
    await task.destroy();
  }
}
