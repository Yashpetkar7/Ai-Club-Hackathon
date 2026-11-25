import type { Source } from '@/core/contracts';
import { articlePages } from '@/core/pdf/pages';
import { sameFamily } from '@/core/verify/normalise';
import { citeKey } from './csl';

/** Reads the citations a student has written. Text in, guesses out, matched only against their own library. */
export interface Found {
  text: string;
  start: number;
  end: number;
  family: string;
  year?: number;
  noDate?: boolean;
}

const YEAR = /((?:1[89]|20)\d{2})[a-z]?|n\.d\./;
const firstName = (s: string): string =>
  s
    .replace(/^(?:see(?: also)?|e\.g\.,?|cf\.|as cited in|also)\s+/i, '')
    .split(/\s+et al\b|,|\s+&\s+|\s+and\s+/i)[0]!
    .trim();

export function findCitations(text: string): Found[] {
  const out: Found[] = [];
  // Narrative: Noy and Zhang (2023), Bloom et al. (2015)
  for (const m of text.matchAll(/(\p{Lu}[\p{L}’'\-]+(?:\s+(?:&|and)\s+\p{Lu}[\p{L}’'\-]+|\s+et al\.)?)\s+\(((?:1[89]|20)\d{2}[a-z]?|n\.d\.)(?:,\s*p[^)]*)?\)/gu)) {
    const y = Number(m[2]!.slice(0, 4));
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length, family: firstName(m[1]!), ...(y ? { year: y } : { noDate: true }) });
  }
  const taken = out.map((o) => [o.start, o.end] as const);
  for (const m of text.matchAll(/\(([^()]{3,300})\)/g)) {
    if (taken.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
    let at = m.index + 1;
    for (const part of m[1]!.split(';')) {
      const start = at + (part.length - part.trimStart().length);
      at += part.length + 1;
      const p = part.trim();
      const fam = firstName(p.replace(YEAR, '').trim()).replace(/[\s,]+$/, '');
      if (!/^\p{Lu}/u.test(fam) || fam.split(/\s+/).length > 7) continue;
      const y = p.match(YEAR);
      const year = y?.[1] ? Number(y[1]) : undefined;
      out.push({ text: p, start, end: start + p.length, family: fam, ...(year ? { year } : {}), ...(y && !year ? { noDate: true } : {}) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function sourceFor(c: Found, sources: Source[]): Source | undefined {
  return sources.find((s) => {
    const k = citeKey(s);
    if (!k.family) return false;
    const name = sameFamily(c.family, k.family) || c.family.toLowerCase() === k.family.toLowerCase();
    if (!name) return false;
    if (c.year) {
      if (c.year === k.year || (!!s.record?.year && c.year === s.record.year)) return true;
      // MLA writes only a page, and a long journal has pages that look like years: (Krugman 1889).
      const p = articlePages(s.record?.pages);
      return !!p && c.year >= p.first && c.year <= p.last && !/,/.test(c.text);
    }
    return c.noDate ? !k.year : true;
  });
}

export interface DraftCheck {
  cited: { source: Source; times: number; order: number }[];
  /** Written in the draft with a year, and not in the library. */
  unknown: string[];
  neverCited: Source[];
}

export function checkDraft(text: string, citableSources: Source[], library: Source[] = citableSources): DraftCheck & { notCitable: { text: string; source: Source }[] } {
  const cited = new Map<string, { source: Source; times: number; order: number }>();
  const unknown = new Set<string>();
  const notCitable = new Map<string, { text: string; source: Source }>();
  for (const c of findCitations(text)) {
    const s = sourceFor(c, citableSources);
    if (s) {
      const e = cited.get(s.id) ?? { source: s, times: 0, order: cited.size };
      e.times++;
      cited.set(s.id, e);
      continue;
    }
    const lib = sourceFor(c, library);
    if (lib && (c.year || c.noDate)) notCitable.set(lib.id, { text: c.text, source: lib });
    // Brackets without a year are ordinary prose unless they name a library author.
    else if (c.year || c.noDate) unknown.add(c.text);
  }
  return { cited: [...cited.values()], unknown: [...unknown], neverCited: citableSources.filter((s) => !cited.has(s.id)), notCitable: [...notCitable.values()] };
}

/** IEEE numbers works by first mention, so author and year markers become [1], [2] only on export. */
export function numberCitations(text: string, citableSources: Source[]): string {
  const order = new Map(checkDraft(text, citableSources).cited.map((c) => [c.source.id, c.order + 1]));
  let out = text;
  const groups = [...text.matchAll(/\(([^()]{3,300})\)/g)].reverse();
  for (const g of groups) {
    const inside = findCitations(g[0]);
    const ids = inside.map((c) => ({ s: sourceFor(c, citableSources), page: c.text.match(/,\s*(pp?\.\s*[^,;)]+)$/i)?.[1] })).map((x) => ({ n: x.s ? order.get(x.s.id) : undefined, page: x.page }));
    if (inside.length && ids.every((x) => x.n !== undefined)) out = `${out.slice(0, g.index)}${ids.map((x) => `[${x.n}${x.page ? `, ${x.page}` : ''}]`).join(', ')}${out.slice(g.index + g[0].length)}`;
  }
  return out;
}
