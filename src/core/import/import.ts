import { webParts, webRaw } from '@/core/verify/web';
import { extractReferences } from '@/core/verify/parse';
import type { RawReference, Source } from '@/core/contracts';
import { registries } from '@/core/registries';
import { findDoi } from '@/core/verify/normalise';
import { parseBibtex, parseRis } from '@/core/verify/parse';
import { checkReference, type Registries } from '@/core/verify/verdict';
import { addSource } from '@/store/actions';

export interface Added { source: Source; isNew: boolean }

/** A DOI, a DOI link or a title. Always through the checker. */
export function refFromLine(line: string): RawReference | null {
  const t = line.trim();
  const doi = findDoi(t);
  // Phase 2: a full reference (APA, Harvard, IEEE, Vancouver...) keeps its title, authors and year, so the Checker
  // compares every field. Only a bare DOI or DOI link is looked up by DOI alone.
  const rest = t.replace(/https?:\/\/(dx\.)?doi\.org\/\S+|\bdoi:\s*\S+|\b10\.\d{4,9}\/\S+/gi, '').trim();
  if (doi && rest.split(/\s+/).filter(Boolean).length <= 2) return { raw: t, doi };
  const parsed = rest.split(/\s+/).length >= 4 ? extractReferences(t).references[0] : undefined;
  if (parsed && (parsed.title || parsed.authors?.length)) return { ...parsed, raw: t, ...(doi && !parsed.doi ? { doi } : {}) };
  if (doi) return { raw: t, doi };
  return t.split(/\s+/).length >= 3 ? { raw: t, title: t } : null;
}

export function refsFromFile(text: string): { kind: 'bibtex' | 'ris'; refs: RawReference[] } | null {
  if (/^\s*@\w+\s*\{/m.test(text)) return { kind: 'bibtex', refs: parseBibtex(text) };
  if (/^TY\s{2}-/m.test(text)) return { kind: 'ris', refs: parseRis(text) };
  return null;
}

export async function addChecked(projectId: string, origin: 'doi' | 'bibtex' | 'ris', ref: RawReference, reg: Registries = registries): Promise<Added> {
  const check = await checkReference(ref, reg);
  const started = new Date().toISOString();
  // B2: a web page keeps its parts (organisation as author, n.d.) so it is formatted in APA 7 as a web source.
  const w = check.verdict === 'web-source' ? webParts(ref) : null;
  const source = w ? await addSource(projectId, 'web', { raw: webRaw(ref, w), check }) : await addSource(projectId, origin, { raw: ref, check });
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
