import type { RawReference } from '@/core/contracts';

/**
 * B2: a web page pasted as a line, read into APA 7 parts. Plain rules, no lookup.
 *   "Mental health. World Health Organization. https://…"          -> title, organisation
 *   "World Health Organization. (n.d.). Mental health. https://…"  -> APA order
 * The organisation stands as author when no person is named. A missing date is n.d.
 */
export interface WebParts { title: string; author?: string; year?: number; site?: string; url: string }

export function webParts(ref: RawReference): WebParts | null {
  const url = ref.url ?? ref.raw.match(/https?:\/\/[^\s<>"]+/)?.[0]?.replace(/[.,;)]+$/, '');
  if (!url) return null;
  const body = ref.raw.replace(/https?:\/\/\S+/g, '').replace(/\b(retrieved|accessed)\b.*$/i, '').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  const apa = body.match(/^(.+?)\.?\s*\((\d{4}|n\.\s?d\.?)[^)]*\)\.?\s*(.+?)(?:\.\s+(.+))?$/i);
  if (apa) {
    const year = /^\d{4}$/.test(apa[2]!) ? Number(apa[2]) : undefined;
    return { title: apa[3]!.trim(), author: apa[1]!.trim(), ...(year ? { year } : {}), ...(apa[4] && apa[4].trim() !== apa[1]!.trim() ? { site: apa[4].trim() } : {}), url };
  }
  const parts = body.split(/\.\s+/).map((x) => x.trim()).filter(Boolean);
  const year = Number(body.match(/\b(19|20)\d{2}\b/)?.[0]) || undefined;
  const title = (parts[0] ?? ref.title ?? url).replace(/\s*\((19|20)\d{2}\)$/, '');
  const author = parts[1]?.replace(/\s*\((19|20)\d{2}\)$/, '');
  return { title, ...(author ? { author } : {}), ...(year ? { year } : {}), ...(parts[2] && parts[2] !== author ? { site: parts[2] } : {}), url };
}

/** The same parts as a reference the citation engine formats as a web page (organisation as author, no date -> n.d.). */
export const webRaw = (ref: RawReference, w: WebParts): RawReference => ({
  raw: ref.raw,
  title: w.title,
  url: w.url,
  ...(w.author ? { authors: [w.author] } : {}),
  ...(w.year ? { year: w.year } : {}),
  ...(w.site ? { container: w.site } : {}),
});

/** APA 7 for a web page, for the receipt. Exports use the citation engine with the same parts. */
export function apaWeb(w: WebParts): { before: string; title: string; after: string } {
  const date = `(${w.year ?? 'n.d.'}).`;
  if (w.author) return { before: `${w.author}. ${date} `, title: w.title, after: `. ${w.site ? `${w.site}. ` : ''}${w.url}` };
  return { before: '', title: w.title, after: `. ${date} ${w.site ? `${w.site}. ` : ''}${w.url}` };
}
