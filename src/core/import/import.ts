import type { RawReference, ReferenceCheck, Source } from '@/core/contracts';
import { registries } from '@/core/registries';
import { findDoi } from '@/core/verify/normalise';
import { parseBibtex, parseReference, parseRis } from '@/core/verify/parse';
import { checkReference, type Registries } from '@/core/verify/verdict';
import { addSource } from '@/store/actions';

export interface Added { source: Source; isNew: boolean }

/** A DOI, a DOI link or a title. Always through the checker. */
export function refFromLine(line: string): RawReference | null {
  const t = line.trim();
  const doi = findDoi(t);
  if (doi) return { raw: t, doi };
  return t.split(/\s+/).length >= 3 ? { raw: t, title: t } : null;
}

export function refsFromFile(text: string): { kind: 'bibtex' | 'ris'; refs: RawReference[] } | null {
  if (/^\s*@\w+\s*\{/m.test(text)) return { kind: 'bibtex', refs: parseBibtex(text) };
  if (/^TY\s{2}-/m.test(text)) return { kind: 'ris', refs: parseRis(text) };
  return null;
}

/** One line of a pasted list: a reference for the checker, or a web page no registry covers. */
export type ListItem = { kind: 'ref'; line: string; ref: RawReference } | { kind: 'web'; line: string; page: WebPage };

const YEAR_PART = /^\(?(n\.\s?d\.|(?:19|20)\d{2})[a-z]?\)?$/i;
/** Hosts of papers, preprints and journals. A link to one of these is a paper to look up, not a web page. */
const SCHOLARLY_HOST = /(^|\.)(arxiv\.org|ssrn\.com|openreview\.net|aclanthology\.org|neurips\.cc|nips\.cc|proceedings\.mlr\.press|jstor\.org|ncbi\.nlm\.nih\.gov|pubmed\.gov|sciencedirect\.com|springer\.com|wiley\.com|tandfonline\.com|ieeexplore\.ieee\.org|acm\.org|nature\.com|science\.org|oup\.com|cambridge\.org|sagepub\.com|mdpi\.com|frontiersin\.org|plos\.org|biorxiv\.org|medrxiv\.org|researchgate\.net|semanticscholar\.org)$/i;
const scholarly = (url: string): boolean => {
  try {
    return SCHOLARLY_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** A web address with no DOI is read as a web page: organisation or author, year if given, title. Nothing is guessed. */
function webFromLine(line: string, url: string): WebPage {
  const before = line.slice(0, line.indexOf(url)).trim().replace(/[\s.,;:]+$/, '');
  const parts = before.split(/\.\s+/).map((p) => p.trim()).filter(Boolean);
  const at = parts.findIndex((p) => YEAR_PART.test(p));
  const yearWord = at >= 0 ? parts[at]!.replace(/[()]/g, '') : '';
  const year = /^\d{4}/.test(yearWord) ? yearWord.slice(0, 4) : '';
  if (at > 0) return { url, author: parts.slice(0, at).join('. '), year, title: parts[at + 1] ?? parts[0]!, site: '' };
  return { url, title: parts[0] ?? url, author: parts.slice(1).join('. '), year, site: '' };
}

/**
 * A pasted reference list. Blank lines separate references when there are any; otherwise each line is one.
 * Every line comes back, so none is dropped without a status.
 */
export function itemsFromList(text: string): ListItem[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const lines = blocks.length > 1 ? blocks : text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const url = line.match(/https?:\/\/\S+/)?.[0]?.replace(/[.,;)]+$/, '');
    if (url && !findDoi(line) && !scholarly(url)) return { kind: 'web', line, page: webFromLine(line, url) };
    return { kind: 'ref', line, ref: parseReference(line) };
  });
}

/**
 * The student accepted the registry's details. The checker runs again on the reference as the registry has it,
 * so the new label still comes from plain code, never from this function.
 */
export async function checkWithRegistryDetails(s: Source, reg: Registries = registries): Promise<ReferenceCheck> {
  const rec = s.check?.record ?? s.record;
  if (!rec) throw new Error('There is no registry record to take the details from.');
  const ref: RawReference = {
    raw: s.raw?.raw ?? rec.title,
    title: rec.title,
    authors: rec.authors.map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)),
    ...((rec.printYear ?? rec.year) ? { year: (rec.printYear ?? rec.year)! } : {}),
    ...(rec.doi ? { doi: rec.doi } : {}),
    ...(rec.container ? { container: rec.container } : {}),
  };
  return checkReference(ref, reg);
}

export interface ListResult { line: string; source?: Source; isNew: boolean; error?: string }

/**
 * Checks a pasted list four at a time, then saves in the order pasted, so a second copy of the same work is
 * recognised as a duplicate of the first and never saved twice.
 */
export async function addList(projectId: string, origin: 'doi' | 'bibtex' | 'ris', items: ListItem[], onProgress: (done: number, total: number) => void = () => {}, reg: Registries = registries): Promise<ListResult[]> {
  const checks: (ReferenceCheck | Error | null)[] = new Array(items.length).fill(null);
  let done = 0;
  for (let i = 0; i < items.length; i += 4) {
    await Promise.all(
      items.slice(i, i + 4).map(async (it, k) => {
        if (it.kind === 'ref') checks[i + k] = await checkReference(it.ref, reg).catch((e: unknown) => (e instanceof Error ? e : new Error('The check did not run.')));
        onProgress(++done, items.length);
      }),
    );
  }
  const out: ListResult[] = [];
  for (const [i, it] of items.entries()) {
    const started = new Date().toISOString();
    try {
      if (it.kind === 'web') {
        const s = await addWebPage(projectId, it.page);
        out.push({ line: it.line, source: s, isNew: s.addedAt >= started });
        continue;
      }
      const c = checks[i];
      if (c instanceof Error || !c) throw c ?? new Error('The check did not run.');
      const s = await addSource(projectId, origin, { raw: it.ref, check: c });
      out.push({ line: it.line, source: s, isNew: s.addedAt >= started });
    } catch (e) {
      out.push({ line: it.line, isNew: false, error: e instanceof Error ? e.message : 'That did not work.' });
    }
  }
  return out;
}

export async function addChecked(projectId: string, origin: 'doi' | 'bibtex' | 'ris', ref: RawReference, reg: Registries = registries): Promise<Added> {
  const check = await checkReference(ref, reg);
  const started = new Date().toISOString();
  const source = await addSource(projectId, origin, { raw: ref, check });
  return { source, isNew: source.addedAt >= started };
}

export interface WebPage { url: string; title: string; author: string; year: string; site: string }

export function webProblems(w: WebPage): string[] {
  const out: string[] = [];
  let ok = false;
  try {
    ok = /^https?:$/.test(new URL(w.url.trim()).protocol);
  } catch {
    ok = false;
  }
  if (!ok) out.push('Enter the full address, starting with https://');
  if (w.title.trim().length < 3) out.push('Enter the page title.');
  if (w.year.trim() && !/^(1[89]|20)\d{2}$/.test(w.year.trim())) out.push('Enter the year as four digits, or leave it empty.');
  return out;
}

/** A web page has no registry record, so it holds no found or checked key and needs a written reason. */
export async function addWebPage(projectId: string, w: WebPage): Promise<Source> {
  const bad = webProblems(w);
  if (bad.length) throw new Error(bad[0]);
  const raw: RawReference = {
    raw: [w.author, w.year, w.title, w.site, w.url].map((x) => x.trim()).filter(Boolean).join('. '),
    title: w.title.trim(),
    url: w.url.trim(),
    ...(w.author.trim() ? { authors: w.author.split(';').map((x) => x.trim()).filter(Boolean) } : {}),
    ...(w.year.trim() ? { year: Number(w.year) } : {}),
    ...(w.site.trim() ? { container: w.site.trim() } : {}),
  };
  return addSource(projectId, 'web', { raw });
}
