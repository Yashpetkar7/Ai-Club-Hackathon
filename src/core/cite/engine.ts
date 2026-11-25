import CSL from 'citeproc';
import type { CitationStyle, Source } from '@/core/contracts';
import { sourceToCsl, type CslItem } from './csl';

export interface StyleFiles { style: string; locales: Record<string, string> }
export const STYLE_FILE: Record<CitationStyle, string> = { apa: 'apa', harvard: 'harvard-cite-them-right', mla: 'modern-language-association', chicago: 'chicago-author-date', ieee: 'ieee' };
export const STYLE_NAME: Record<CitationStyle, string> = { apa: 'APA 7', harvard: 'Harvard (Cite Them Right)', mla: 'MLA 9', chicago: 'Chicago author-date', ieee: 'IEEE' };
export const LIST_HEADING: Record<CitationStyle, string> = { apa: 'References', harvard: 'Reference list', mla: 'Works Cited', chicago: 'References', ieee: 'References' };
/** Styles that print titles in sentence case. MLA and Chicago set their own title case. */
const SENTENCE = new Set<CitationStyle>(['apa', 'harvard', 'ieee']);

export interface Run { text: string; italic?: boolean; bold?: boolean }
export interface Entry { id: string; runs: Run[]; text: string; label?: string }
export interface Formatted { entries: Entry[]; inText: Map<string, string> }

const decode = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

/** Turns citeproc's small HTML into runs. Nothing is ever inserted into the page as HTML. */
export function toRuns(html: string): Run[] {
  const runs: Run[] = [];
  let italic = 0;
  let bold = 0;
  for (const part of html.replace(/\s*\n\s*/g, '').split(/(<[^>]+>)/)) {
    if (!part) continue;
    if (part.startsWith('<')) {
      if (/^<i\b/i.test(part)) italic++;
      else if (/^<\/i>/i.test(part)) italic--;
      else if (/^<b\b/i.test(part)) bold++;
      else if (/^<\/b>/i.test(part)) bold--;
      continue;
    }
    runs.push({ text: decode(part), ...(italic > 0 ? { italic: true } : {}), ...(bold > 0 ? { bold: true } : {}) });
  }
  return runs;
}
const plain = (runs: Run[]): string => runs.map((r) => r.text).join('');

/** Formats items in the order given. IEEE numbers follow that order; the other styles sort themselves. */
export function formatItems(items: CslItem[], style: CitationStyle, files: StyleFiles): Formatted {
  if (!items.length) return { entries: [], inText: new Map() };
  const byId = new Map(items.map((i) => [i.id, i]));
  const engine = new CSL.Engine({ retrieveLocale: (l) => files.locales[l] ?? files.locales['en-US']!, retrieveItem: (id) => structuredClone(byId.get(id)) }, files.style);
  engine.updateItems(items.map((i) => i.id));
  const bib = engine.makeBibliography();
  const entries: Entry[] = [];
  if (bib)
    bib[1].forEach((html, n) => {
      const left = html.match(/<div class="csl-left-margin">([\s\S]*?)<\/div>/);
      const body = left ? html.slice(html.indexOf(left[0]) + left[0].length) : html;
      const runs = toRuns(body);
      // APA prints the author ellipsis as three spaced points.
      if (style === 'apa') for (const r of runs) r.text = r.text.replace(', … ', ', . . . ');
      if (runs.length) {
        runs[0]!.text = runs[0]!.text.trimStart();
        runs[runs.length - 1]!.text = runs[runs.length - 1]!.text.trimEnd();
      }
      const label = left ? plain(toRuns(left[1]!)).trim() : undefined;
      entries.push({ id: bib[0].entry_ids[n]![0]!, runs, text: `${label ? `${label} ` : ''}${plain(runs)}`, ...(label ? { label } : {}) });
    });
  const inText = new Map(items.map((i) => [i.id, plain(toRuns(engine.makeCitationCluster([{ id: i.id }])))]));
  return { entries, inText };
}

export function formatSources(sources: Source[], style: CitationStyle, files: StyleFiles): Formatted {
  return formatItems(sources.map((s) => sourceToCsl(s, SENTENCE.has(style))).filter((x): x is CslItem => !!x), style, files);
}
