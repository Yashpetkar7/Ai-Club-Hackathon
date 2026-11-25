/** Text helpers shared by every check. Pure functions, no network. */

/** Real tags only, so "p < 0.05 and n > 30" survives. Run twice because some registries escape their tags. */
const TAG = /<\/?[a-z][a-z0-9:-]*(?:\s[^<>]*)?\/?>/gi;

export const stripTags = (s: string): string =>
  s
    .replace(TAG, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(TAG, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Letters that Unicode does not split into a base letter and an accent. Without this, real names look like mismatches. */
const LETTERS: Record<string, string> = { 'ı': 'i', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ħ': 'h', 'ŧ': 't', 'ŋ': 'n' };

export const norm = (s: string): string =>
  stripTags(s)
    .toLowerCase()
    .replace(/[ıłøđðþßæœħŧŋ]/g, (c) => LETTERS[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’`']/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const tokens = (s: string): string[] => norm(s).split(' ').filter(Boolean);

/** Registry titles carry notices such as "RETRACTED:" and stray footnote marks. Compare without them. */
export const cleanTitle = (s: string): string =>
  stripTags(s)
    .replace(/^\s*(retracted( article)?|withdrawn|retraction|expression of concern)\s*[:.\-–]\s*/i, '')
    .replace(/\s*[*†‡]+\s*$/u, '')
    .trim();

/** Dice overlap on words, counting repeats. 1 means the same bag of words. */
export function titleScore(a: string, b: string): number {
  const x = tokens(cleanTitle(a));
  const y = tokens(cleanTitle(b));
  if (!x.length || !y.length) return 0;
  const bag = new Map<string, number>();
  for (const t of x) bag.set(t, (bag.get(t) ?? 0) + 1);
  let hit = 0;
  for (const t of y) {
    const n = bag.get(t) ?? 0;
    if (n > 0) {
      hit++;
      bag.set(t, n - 1);
    }
  }
  return (2 * hit) / (x.length + y.length);
}

/** True when one title is a run of words inside the other, for example a dropped subtitle. */
export function titleContained(short: string, long: string): boolean {
  const s = tokens(cleanTitle(short));
  const l = tokens(cleanTitle(long));
  if (s.length < 4 || s.length > l.length) return false;
  for (let i = 0; i + s.length <= l.length; i++) if (s.every((t, k) => t === l[i + k])) return true;
  return false;
}

const SMALL = new Set('a an the and or of in on at to for from by with without as is are be its their into via versus vs'.split(' '));

/** Edits between two words. Small differences are spelling. "Increase" and "decrease" are not, so the first letter must agree. */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (a[0] !== b[0]) return false;
  const max = Math.min(a.length, b.length) >= 6 ? 2 : 1;
  if (Math.abs(a.length - b.length) > max || Math.min(a.length, b.length) < 4) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length]! <= max;
}

/**
 * Words the student's title has and the registry's does not. Leaving out a subtitle is common and fine.
 * Adding one turns a real paper into one that does not exist, so it never counts as the same title.
 */
export function addedWords(given: string, registry: string, also = ''): string[] {
  const left = tokens(cleanTitle(registry).replace(/-/g, ' '));
  const joined = left.join('');
  // A journal or author that ran on into the title when we read the reference is not an invented word.
  const other = new Set(tokens(also));
  const out: string[] = [];
  for (const w of tokens(cleanTitle(given).replace(/-/g, ' '))) {
    const i = left.findIndex((x) => near(w, x));
    if (i >= 0) left.splice(i, 1);
    else if (!SMALL.has(w) && !other.has(w) && !/^\d+$/.test(w) && !(w.length >= 5 && joined.includes(w))) out.push(w);
  }
  return out;
}

/**
 * True when the registry title appears word for word inside free text.
 * Used only when we could not work out which words are the title. Short titles never count:
 * "Honest Signals" must not match "The honest machine: Provenance signals".
 */
export function titleInText(title: string, text: string): boolean {
  const t = tokens(cleanTitle(title));
  if (t.length < 4) return false;
  return ` ${tokens(text).join(' ')} `.includes(` ${t.join(' ')} `);
}

const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'di', 'da', 'dos', 'la', 'le', 'bin', 'al', 'el', 'ter', 'ten']);

/** Last meaningful word of a family name, so "van der Aalst" and "Aalst" agree. */
export function familyKey(name: string): string {
  const all = tokens(name.replace(/-/g, ' '));
  const t = all.filter((w) => !PARTICLES.has(w));
  return t[t.length - 1] ?? all[0] ?? '';
}

export function sameFamily(a: string, b: string): boolean {
  const ka = familyKey(a);
  const kb = familyKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const ta = tokens(a.replace(/-/g, ' '));
  const tb = tokens(b.replace(/-/g, ' '));
  return ta.includes(kb) || tb.includes(ka);
}

const DOI_RE = /\b10\.\d{4,9}\/[^\s"<>\]}]+/i;

/** Finds a DOI inside text and trims sentence punctuation, keeping DOIs that contain brackets. */
export function findDoi(s: string): string | undefined {
  const m = s.match(DOI_RE);
  if (!m) return undefined;
  let d = m[0].replace(/[.,;:'’”]+$/u, '');
  while (d.endsWith(')') && (d.match(/\(/g)?.length ?? 0) < (d.match(/\)/g)?.length ?? 0)) {
    d = d.slice(0, -1).replace(/[.,;:]+$/u, '');
  }
  return d.toLowerCase();
}

export const cleanDoi = (s: string): string => (findDoi(s) ?? s.trim()).toLowerCase();
