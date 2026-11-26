import { sentences } from '@/core/challenge/challenge';
import { findCitations } from '@/core/cite/draft';
import type { ClaimLabel, RawReference, ReferenceCheck, RegistryRecord, Source } from '@/core/contracts';
import { listStart } from '@/core/draftcheck/text';
import { hybridRank, type Candidate, type Embed } from '@/core/semantic/rank';
import { findDoi, sameFamily } from '@/core/verify/normalise';
import { extractReferences, type Extracted } from '@/core/verify/parse';
import { POLICY } from '@/policy/policy';
import { directionWords, numbers, subjectWords } from './guards';
import { judge, type Judged, type Support } from './label';
import { startAt } from './nli';

/**
 * Auditing a pasted paragraph. Plain code cuts it into claims, finds what each claim cites, and asks judge()
 * for every claim against every cited reference. Nothing here makes a label of its own: the label always
 * comes from judge(), and the ranking scores only put sentences in order.
 */

/** One in-text citation: (Bloom et al., 2015), Noy and Zhang (2023), [2] or a DOI. */
export interface InText {
  text: string;
  family?: string;
  year?: number;
  noDate?: boolean;
  /** Numbers in a [1] or [2-4] marker. */
  n?: number[];
  doi?: string;
}

export interface AuditClaim {
  id: string;
  /** What is judged: the sentence, or one part of it, without its citations. */
  text: string;
  /** The whole sentence as pasted. */
  sentence: string;
  /** Where the sentence sits in the pasted text. */
  start: number;
  end: number;
  cites: InText[];
  /** True when the sentence held two facts and this is one of them. */
  part: boolean;
}

/** A reference as written, and the record a registry gave for it, when one did. */
export interface RefInfo { ref: RawReference; record?: RegistryRecord | undefined }

export interface Link {
  refs: number[];
  /** 'cited': the claim's own citations. 'all': it cites nothing we can match, so every reference is tried. 'none': no references. */
  how: 'cited' | 'all' | 'none';
  /** Citations in the sentence with no matching entry in the reference list. */
  missing: string[];
}

/** Abbreviations whose full stop does not end a sentence. Masked with a character of the same length. */
const ABBREV = /\b(?:et al|e\.g|i\.e|cf|vs|approx|ca|pp|p|no|vol|fig|eq|ed|eds)\./gi;

/**
 * The references in a pasted paragraph, from the checker's own parser. On the Check page one short line is
 * looked up as a title; here a line with no DOI and no reference shape is a claim, not a reference.
 */
export function auditReferences(text: string): Extracted {
  const x = extractReferences(text);
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  const only = x.references.length === 1 ? x.references[0]! : undefined;
  if (only && flat(only.raw) === flat(text) && !only.doi && !only.authors?.length) return { ...x, references: [] };
  return x;
}

/** Where the reference list begins: a heading, or else the first line that belongs to a parsed reference. */
export function bodyEnd(text: string, refs: RawReference[]): number {
  const head = listStart(text);
  if (head < text.length) return head;
  const long = refs.filter((r) => r.raw.length >= 15);
  for (const m of text.matchAll(/[^\n]+/g)) {
    const line = m[0].replace(/\s+/g, ' ').trim();
    if (line.length >= 15 && long.some((r) => r.raw.includes(line))) return m.index;
  }
  return text.length;
}

const NUMBERED = /\[(\d{1,3}(?:\s*[-–,]\s*\d{1,3})*)\]/g;
const DOI_SPAN = /(?:https?:\/\/(?:dx\.)?doi\.org\/|\bdoi\s*:\s*)?\b10\.\d{4,9}\/[^\s"<>\]}]+/gi;

function expand(list: string): number[] {
  const out: number[] = [];
  for (const part of list.split(',')) {
    const [a, b] = part.split(/[-–]/).map((x) => Number(x.trim()));
    if (!a) continue;
    if (b && b >= a && b - a < 50) for (let k = a; k <= b; k++) out.push(k);
    else out.push(a);
  }
  return out;
}

/** The citations in one sentence, and the sentence with them taken out. */
export function citationsIn(sentence: string): { cites: InText[]; bare: string } {
  const cut: { start: number; end: number }[] = [];
  const cites: InText[] = [];
  for (const c of findCitations(sentence)) {
    // "(WFH)" is not a citation: a citation has a year or says n.d.
    if (!c.year && !c.noDate) continue;
    cut.push({ start: c.start, end: c.end });
    cites.push({ text: c.text, family: c.family, ...(c.year ? { year: c.year } : {}), ...(c.noDate ? { noDate: true } : {}) });
  }
  for (const m of sentence.matchAll(NUMBERED)) {
    cut.push({ start: m.index, end: m.index + m[0].length });
    cites.push({ text: m[0], n: expand(m[1]!) });
  }
  for (const m of sentence.matchAll(DOI_SPAN)) {
    const doi = findDoi(m[0]);
    if (!doi) continue;
    const end = m.index + m[0].replace(/[.,;:)]+$/, '').length;
    cut.push({ start: m.index, end });
    cites.push({ text: doi, doi });
  }
  let bare = sentence;
  for (const c of [...cut].sort((a, b) => b.start - a.start)) bare = bare.slice(0, c.start) + bare.slice(c.end);
  bare = bare
    .replace(/\(\s*[;,\s]*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  // "Bloom et al. (2015) found that X" says X. "According to Bloom et al. (2015), X" says X too.
  const narrative = cites.some((c) => c.family && c.text.includes('('));
  if (narrative) {
    bare = bare
      .replace(/^according to\s*,?\s*/i, '')
      .replace(/^(?:also\s+)?(?:found|finds|find|reports?|reported|shows?|showed|notes?|noted|observes?|observed|demonstrates?|demonstrated|concludes?|concluded)\s+(?:that\s+)?/i, '')
      .replace(/^,\s*/, '');
  }
  if (bare) bare = bare[0]!.toUpperCase() + bare.slice(1);
  return { cites, bare };
}

/** A piece that states something of its own: a number or a direction, about something, in at least three words. */
const statesFact = (piece: string): boolean => piece.trim().split(/\s+/).length >= 3 && subjectWords(piece).length > 0 && (numbers(piece).length > 0 || directionWords(piece).some((w) => w.dir !== 'not'));

/**
 * Cuts a sentence that joins two facts ("time fell by 40% and quality rose by 18%") into one claim per fact.
 * It only cuts at a semicolon or a joining word outside brackets, and only when both sides state a fact.
 * A piece with no fact of its own stays with its neighbour: "concern and excitement rose" is one claim.
 */
export function splitClaim(bare: string): string[] {
  const seps: { start: number; end: number; and: boolean }[] = [];
  let depth = 0;
  const re = /[()]|;\s*|,?\s+(and|but|whereas|while|yet)\s+/gi;
  for (const m of bare.matchAll(re)) {
    if (m[0] === '(') depth++;
    else if (m[0] === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) seps.push({ start: m.index, end: m.index + m[0].length, and: (m[1] ?? '').toLowerCase() === 'and' });
  }
  if (!seps.length) return [bare];
  const pieces: { text: string; and: boolean }[] = [];
  let from = 0;
  for (const s of seps) {
    pieces.push({ text: bare.slice(from, s.start), and: s.and });
    from = s.end;
  }
  pieces.push({ text: bare.slice(from), and: false });
  if (pieces.filter((p) => statesFact(p.text)).length < 2) return [bare];

  // Each group starts at a piece that states a fact. A piece without one joins the next fact when "and" follows it, else the one before.
  const groups: { from: number; to: number }[] = [];
  let pending: number | null = null;
  pieces.forEach((p, i) => {
    if (statesFact(p.text)) {
      groups.push({ from: pending ?? i, to: i });
      pending = null;
    } else if (p.and && i < pieces.length - 1 && pieces.slice(i + 1).some((q) => statesFact(q.text))) pending ??= i;
    else if (groups.length) groups[groups.length - 1]!.to = i;
    else pending ??= i;
  });
  if (pending !== null) {
    if (groups.length) groups[groups.length - 1]!.to = pieces.length - 1;
    else return [bare];
  }
  const startOf = (i: number) => (i === 0 ? 0 : seps[i - 1]!.end);
  const endOf = (i: number) => (i === pieces.length - 1 ? bare.length : seps[i]!.start);
  const parts = groups.map((g) => bare.slice(startOf(g.from), endOf(g.to)).trim().replace(/[,;]+$/, ''));
  return parts.length > 1 ? parts.map((p) => p[0]!.toUpperCase() + p.slice(1)) : [bare];
}

/** The claims in the paragraph above the reference list, one per sentence or per fact in a joined sentence. */
export function findClaims(text: string, refs: RawReference[]): AuditClaim[] {
  const body = text.slice(0, bodyEnd(text, refs));
  // "et al." must not end a sentence. The mask keeps every position the same.
  const masked = body.replace(ABBREV, (m) => m.replace(/\./g, '_'));
  const out: AuditClaim[] = [];
  for (const s of sentences(masked)) {
    const sentence = body.slice(s.start, s.end);
    if (/\?\s*["”’)]*$/.test(sentence)) continue;
    const { cites, bare } = citationsIn(sentence);
    if (bare.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length < 3) continue;
    const parts = splitClaim(bare);
    for (const p of parts) out.push({ id: `c${out.length + 1}`, text: p, sentence, start: s.start, end: s.end, cites, part: parts.length > 1 });
  }
  return out;
}

const familyOf = (r: RefInfo): string | undefined => r.ref.authors?.[0] ?? r.record?.authors[0]?.family;
const yearsOf = (r: RefInfo): number[] => [r.ref.year, r.record?.year, r.record?.printYear].filter((y): y is number => typeof y === 'number');
const doisOf = (r: RefInfo): string[] => [r.ref.doi, r.record?.doi].filter((d): d is string => !!d).map((d) => d.toLowerCase());
const numberOf = (r: RefInfo): number | undefined => {
  const m = r.ref.raw.match(/^\s*(?:\[(\d{1,3})\]|(\d{1,3})[.)])\s/);
  return m ? Number(m[1] ?? m[2]) : undefined;
};

/** The references one in-text citation points at. By DOI, by number, or by first author and year. */
export function refsFor(c: InText, refs: RefInfo[]): number[] {
  const all = refs.map((r, i) => ({ r, i }));
  if (c.doi) return all.filter(({ r }) => doisOf(r).includes(c.doi!.toLowerCase())).map(({ i }) => i);
  if (c.n) {
    const numbered = all.some(({ r }) => numberOf(r) !== undefined);
    return c.n.flatMap((k) => (numbered ? all.filter(({ r }) => numberOf(r) === k).map(({ i }) => i) : refs[k - 1] ? [k - 1] : []));
  }
  if (!c.family) return [];
  const named = all.filter(({ r }) => {
    const f = familyOf(r);
    return !!f && (sameFamily(c.family!, f) || c.family!.toLowerCase() === f.toLowerCase());
  });
  if (!c.year) return named.map(({ i }) => i);
  const exact = named.filter(({ r }) => yearsOf(r).includes(c.year!));
  if (exact.length) return exact.map(({ i }) => i);
  // A year one out is how online-first and print years differ.
  return named.filter(({ r }) => yearsOf(r).some((y) => Math.abs(y - c.year!) <= POLICY.thresholds.yearTolerance)).map(({ i }) => i);
}

/** Which references a claim is checked against. */
export function linkClaim(claim: Pick<AuditClaim, 'cites'>, refs: RefInfo[]): Link {
  if (!refs.length) return { refs: [], how: 'none', missing: claim.cites.map((c) => c.text) };
  const found = new Set<number>();
  const missing: string[] = [];
  for (const c of claim.cites) {
    const hit = refsFor(c, refs);
    if (hit.length) hit.forEach((i) => found.add(i));
    else missing.push(c.text);
  }
  if (found.size) return { refs: [...found].sort((a, b) => a - b), how: 'cited', missing };
  return { refs: refs.map((_, i) => i), how: 'all', missing };
}

/** The text a claim is compared with: the abstract the checker attached. Never from a different paper. */
export function sourceOf(check: ReferenceCheck): Pick<Source, 'check' | 'text'> {
  const text = check.verdict === 'wrong-paper' ? undefined : check.record?.abstract?.trim() || undefined;
  return { check, ...(text ? { text } : {}) };
}

export interface PairResult {
  /** Up to three closest sentences, best first. Ranking aids only. */
  candidates: Candidate[];
  /** The support model's scores for each candidate, or null where it did not run. */
  support: (Support | null)[];
  /** The candidate the label was judged on. */
  pick: number;
  judged: Judged;
  /** True when the source had text to compare with. */
  hasText: boolean;
  /** Another candidate the model reads as saying the opposite, or -1. */
  against: number;
  /** True when finding by meaning failed and words alone were used. */
  fellBack: boolean;
}

export interface PairOptions {
  embed?: Embed | undefined;
  score?: ((premise: string, hypothesis: string) => Promise<Support | null>) | undefined;
}

/**
 * One claim against one reference: the closest sentences, their support scores when the model is on,
 * then judge() on the sentence the model backs most (the closest one when it is off).
 */
export async function checkPair(claim: string, source: Pick<Source, 'check' | 'text'>, o: PairOptions = {}): Promise<PairResult> {
  if (!source.text?.trim()) return { candidates: [], support: [], pick: -1, judged: judge(claim, source, undefined, null), hasText: false, against: -1, fellBack: false };
  let fellBack = false;
  let candidates: Candidate[];
  try {
    candidates = await hybridRank(claim, source.text, o.embed);
  } catch {
    fellBack = !!o.embed;
    candidates = await hybridRank(claim, source.text);
  }
  const support: (Support | null)[] = [];
  for (const c of candidates) support.push(o.score ? await o.score(c.text, claim).catch(() => null) : null);
  // Every candidate is judged. Start on one that disputes the claim if there is one, else on the best supported.
  const all = candidates.map((c, i) => judge(claim, source, c.text, support[i] ?? null));
  const pick = candidates.length ? startAt(all, support) : -1;
  const judged = all[pick] ?? judge(claim, source, undefined, null);
  const against = candidates.findIndex((_, i) => i !== pick && (support[i]?.contradicts ?? 0) >= POLICY.thresholds.contradiction);
  return { candidates, support, pick, judged, hasText: true, against, fellBack };
}

/** A claim with no reference at all to check it against. */
export const unsourced = (claim: string): Judged => judge(claim, undefined, undefined, null);

/** How a claim counts in the summary. A traceability count, not a truth score. */
export type Bucket = 'verified' | 'disputed' | 'reported' | 'untraceable' | 'unchecked';

export interface Cell { label: ClaimLabel; hasText: boolean }

/**
 * One line per claim from its cells, each labelled by judge(). With its own citations, one source that
 * disagrees outweighs one that agrees. Tried against every reference because it cites nothing we can
 * match, the reference that backs it counts. With no text in any reference, it cannot be traced.
 * Returns which cell to show; -1 when nothing was checked.
 */
export function overall(cells: (Cell | null)[], how: Link['how']): { bucket: Bucket; pick: number } {
  const done = cells.map((c, i) => ({ c, i })).filter((x): x is { c: Cell; i: number } => !!x.c);
  if (!done.length) return { bucket: how === 'none' ? 'untraceable' : 'unchecked', pick: -1 };
  const readable = done.filter((x) => x.c.hasText);
  const first = (label: ClaimLabel) => readable.find((x) => x.c.label === label);
  const order: ClaimLabel[] = how === 'cited' ? ['disputed', 'verified'] : ['verified', 'disputed'];
  for (const l of order) {
    const hit = first(l);
    if (hit) return { bucket: l === 'verified' ? 'verified' : 'disputed', pick: hit.i };
  }
  if (readable.length) return { bucket: 'reported', pick: readable[0]!.i };
  // Some references are still being checked: there may yet be text to compare with.
  return { bucket: done.length < cells.length ? 'unchecked' : 'untraceable', pick: done[0]!.i };
}
