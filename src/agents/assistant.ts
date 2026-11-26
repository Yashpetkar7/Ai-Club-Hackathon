import type { RawReference, ReferenceCheck, RegistryRecord, Source } from '@/core/contracts';
import { findQuote } from '@/core/claims/quote';
import { findInstructions } from '@/core/pdf/injection';
import { cleanTitle, sameFamily, tokens } from '@/core/verify/normalise';
import { statusOf, type Status } from '@/core/verify/status';
import { checkReference, type Registries } from '@/core/verify/verdict';

/**
 * The research assistant (Phase 2). Plain code on top of the existing Scout (registry search) and Checker
 * (checkReference). It can only return records a registry returned, each checked again by the Checker.
 * It never writes an author, title, year, DOI, journal, finding or page number of its own, and it never pads a
 * list to the number asked for. The request text is data: nothing in it can change a rule or a status.
 */
export type RequestKind = 'research' | 'quote' | 'note' | 'library';

export function classify(text: string): RequestKind {
  const t = text.trim();
  if (/^\s*(please\s+)?(save|add|keep|store)\b[^.:]{0,40}\bnote\b/i.test(t)) return 'note';
  if (/\b(check|verify|confirm)\b[^.:]{0,30}\bquot(e|ation)\b/i.test(t) || (QUOTE.test(t) && CITE.test(t))) return 'quote';
  if (/\b(give|find|show|list|get|recommend|suggest|need)\b[^.]{0,40}\b(stud(y|ies)|papers?|articles?|research|sources?|evidence|literature)\b/i.test(t)) return 'research';
  return 'library';
}

const QUOTE = /[‘“'"]([^‘’“”"]{8,600})[’”'"]/;
const CITE = /\(([^()]*?\b(1[89]\d{2}|20\d{2})[a-z]?)\)/;

export interface Searched { registry: 'Crossref' | 'OpenAlex'; query: string; at: string; outcome: string }
export interface Candidate { record: RegistryRecord; check: ReferenceCheck; status: Status; why: string }
export interface ResearchAnswer {
  kind: 'research';
  verdict: 'FOUND' | 'NOT FOUND';
  asked: number | null;
  direct: Candidate[];
  related: Candidate[];
  searched: Searched[];
  specific: string[];
  note: string;
}

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const REQUEST_WORDS = new Set('give me find show list get recommend suggest need please some any peer reviewed peerreviewed study studies paper papers article articles research sources source evidence literature that which who measure measured measures how what whether did does do the a an of on in at to for and or by with about from into is are was were be been has have had this these those their our my your three two one four five six seven eight nine ten improved improve improves improving affect affected affects effect effects impact impacted impacts increase increased reduce reduced change changed'.split(' '));
const stem = (w: string): string => w.replace(/'s$/, '').replace(/(ies)$/, 'y').replace(/(es|s)$/, '').slice(0, 7);

/** Names of particular things in the request: an event, a place, an organisation, a year. Evidence must name them. */
export function specifics(q: string): string[] {
  const out: string[] = [];
  const re = /\b([A-Z][\w&-]*(?:\s+(?:[A-Z][\w&-]*|\d{4}|at|of|and|in|for))*\s+(?:[A-Z][\w&-]*|\d{4}))\b/g;
  for (const m of q.matchAll(re)) {
    const phrase = m[1]!.replace(/^(Give|Find|Show|List|Get|Please|Check|Save)\s+/, '');
    if (phrase.split(/\s+/).length >= 2) out.push(phrase);
  }
  for (const m of q.matchAll(/["“]([^"”]{3,80})["”]/g)) out.push(m[1]!);
  return [...new Set(out)];
}

const specificTokens = (phrases: string[]): string[] => [...new Set(phrases.flatMap((p) => tokens(p)).filter((w) => !['at', 'of', 'and', 'in', 'for', 'the', 'ai'].includes(w)))];

export interface Deps { registries: Registries; now?: () => string }

/** Request 1 and Case 6. Direct evidence must name every specific thing in the question; anything else is at most related. */
export async function research(question: string, deps: Deps): Promise<ResearchAnswer> {
  const now = deps.now ?? (() => new Date().toISOString());
  const reg = deps.registries;
  const askedN = (() => {
    const m = question.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b\s+(?:[\w-]+\s+){0,2}(stud|paper|article|source)/);
    return m ? (NUM[m[1]!] ?? Number(m[1])) : null;
  })();
  const spec = specifics(question);
  const specTok = specificTokens(spec);
  const content = tokens(question).filter((w) => !REQUEST_WORDS.has(w) && w.length > 2);
  const outcome = content.filter((w) => !specTok.includes(w));
  // Two searches: the specific claim as asked, and the general topic (long topical words plus the outcome).
  const broad = [...new Set([...specTok.filter((w) => w.length >= 6 && !/^\d+$/.test(w)), ...outcome])].join(' ');
  const queries = [...new Set([content.join(' '), broad].filter((x) => x.split(' ').length >= 2))];
  const searched: Searched[] = [];
  const pool = new Map<string, RegistryRecord>();
  for (const q of queries) {
    for (const [name, run] of [['Crossref', () => reg.crossrefSearch(q)], ['OpenAlex', () => (reg.openalexSearch ? reg.openalexSearch(q) : Promise.resolve([]))]] as const) {
      try {
        const recs = await run();
        searched.push({ registry: name, query: q, at: now(), outcome: `${recs.length} candidates` });
        for (const r of recs) if (r.title) pool.set(r.doi?.toLowerCase() ?? r.id, r);
      } catch (e) {
        searched.push({ registry: name, query: q, at: now(), outcome: `did not answer (${e instanceof Error ? e.message.slice(0, 60) : 'error'})` });
      }
    }
  }
  const text = (r: RegistryRecord) => ` ${tokens(`${r.title} ${r.abstract ?? ''} ${r.container ?? ''}`).join(' ')} `;
  const has = (r: RegistryRecord, w: string) => text(r).includes(` ${w}`) || text(r).split(' ').some((x) => x && stem(x) === stem(w));
  const scored = [...pool.values()].map((r) => {
    const direct = specTok.length > 0 && specTok.every((w) => has(r, w)) && (outcome.length === 0 || outcome.some((w) => has(r, w)));
    const shared = content.filter((w) => has(r, w)).length;
    return { r, direct, shared };
  });
  const directRecs = scored.filter((x) => x.direct);
  const relatedRecs = scored.filter((x) => !x.direct && x.shared >= 2).sort((a, b) => b.shared - a.shared).slice(0, 4);
  // Every candidate is checked again by the Checker, independently of the search that found it.
  const verify = async (x: { r: RegistryRecord; shared: number }, why: string): Promise<Candidate> => {
    const raw: RawReference = { raw: x.r.title, title: x.r.title, authors: x.r.authors.slice(0, 6).map((a) => a.family), ...(x.r.year ? { year: x.r.year } : {}), ...(x.r.doi ? { doi: x.r.doi } : {}) };
    const check = await checkReference(raw, reg, now);
    return { record: check.record ?? x.r, check, status: statusOf(check), why };
  };
  const direct: Candidate[] = [];
  for (const x of directRecs.slice(0, 6)) direct.push(await verify(x, `Names ${spec.join(', ')} and ${outcome.join(', ') || 'the outcome'}.`));
  const related: Candidate[] = [];
  for (const x of relatedRecs) related.push(await verify(x, `Shares ${x.shared} topic words with your question but does not study ${spec.join(', ') || 'what you asked about'}. Related, not direct evidence.`));
  const directOk = direct.filter((c) => c.status === 'VERIFIED' || c.status === 'NEEDS FIX');
  const allFailed = searched.length > 0 && searched.every((s) => s.outcome.startsWith('did not answer'));
  return {
    kind: 'research',
    verdict: directOk.length ? 'FOUND' : 'NOT FOUND',
    asked: askedN,
    direct,
    related: related.filter((c) => c.status !== 'RETRACTED'),
    searched,
    specific: spec,
    note: allFailed
      ? 'No database answered, so nothing could be verified. This is not evidence that none exist. Try again.'
      : directOk.length
        ? `${directOk.length} ${directOk.length === 1 ? 'study names' : 'studies name'} what you asked about.${askedN && directOk.length < askedN ? ` You asked for ${askedN}; only ${directOk.length} could be verified, and no more are made up.` : ''}`
        : `No study we could verify measures ${spec.length ? spec.join(', ') : 'this'}${outcome.length ? ` and ${outcome.join(', ')}` : ''}.${askedN ? ` You asked for ${askedN}; none are given rather than invented.` : ''}`,
  };
}

export interface QuoteAnswer {
  kind: 'quote';
  quote: string;
  cited: string;
  verdict: 'QUOTE FOUND' | 'QUOTE NOT FOUND' | 'FULL TEXT UNAVAILABLE – CANNOT VERIFY' | 'CITED PAPER NOT IDENTIFIED';
  paper?: { title: string; status: Status; check?: ReferenceCheck; from: 'library' | 'registry' };
  read: 'full text' | 'PDF' | 'abstract only' | 'nothing';
  note: string;
  searched: Searched[];
}

/** Families and year from a citation such as (LeCun, Bengio & Hinton, 2015). */
export function parseCitation(c: string): { families: string[]; year?: number } {
  const year = Number(c.match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1]) || undefined;
  const names = c.replace(/\b(1[89]\d{2}|20\d{2})[a-z]?\b/g, '').replace(/\bet al\.?/gi, '').split(/,|&|\band\b/).map((x) => x.trim()).filter((x) => /^[\p{Lu}][\p{L}'’-]+$/u.test(x));
  return { families: names, ...(year ? { year } : {}) };
}

const byAuthors = (families: string[], year: number | undefined, authors: { family: string }[], y?: number) => families.length > 0 && families.every((f) => authors.some((a) => sameFamily(f, a.family))) && (!year || !y || Math.abs(year - y) <= 1);

/** Request 2 and B3. A real paper is not a real quote: the words must be in text we could read, or we say we could not read it. */
export async function checkQuote(text: string, library: Source[], deps: Deps): Promise<QuoteAnswer> {
  const now = deps.now ?? (() => new Date().toISOString());
  const quote = text.match(QUOTE)?.[1]?.trim() ?? '';
  const cited = text.match(CITE)?.[1] ?? '';
  const { families, year } = parseCitation(cited);
  const searched: Searched[] = [];
  const base = { kind: 'quote' as const, quote, cited, searched };
  let src = library.find((s) => s.record && byAuthors(families, year, s.record.authors, s.record.year));
  let rec = src?.record;
  let check = src?.check;
  if (!rec && families.length) {
    const q = `${families.join(' ')} ${year ?? ''}`.trim();
    try {
      const recs = await deps.registries.crossrefSearch(q);
      searched.push({ registry: 'Crossref', query: q, at: now(), outcome: `${recs.length} candidates` });
      rec = recs.find((r) => byAuthors(families, year, r.authors, r.year));
    } catch {
      searched.push({ registry: 'Crossref', query: q, at: now(), outcome: 'did not answer' });
    }
    if (rec) check = await checkReference({ raw: rec.title, title: rec.title, authors: rec.authors.slice(0, 6).map((a) => a.family), ...(rec.year ? { year: rec.year } : {}), ...(rec.doi ? { doi: rec.doi } : {}) }, deps.registries, now);
  }
  if (!rec) return { ...base, verdict: 'CITED PAPER NOT IDENTIFIED', read: 'nothing', note: `No paper by ${families.join(', ') || 'these authors'}${year ? ` from ${year}` : ''} was found in your library or in Crossref, so the quote cannot be checked.` };
  const status = statusOf(check);
  const paper = { title: cleanTitle(rec.title), status, ...(check ? { check } : {}), from: (src ? 'library' : 'registry') as 'library' | 'registry' };
  const body = src?.text ?? check?.record?.abstract ?? rec.abstract;
  const origin = src?.text ? src.textOrigin : body ? 'abstract' : undefined;
  const read: QuoteAnswer['read'] = !body ? 'nothing' : origin === 'pdf' ? 'PDF' : origin === 'fulltext' ? 'full text' : 'abstract only';
  if (body && quote && findQuote(quote, body)) return { ...base, verdict: 'QUOTE FOUND', paper, read, note: `These exact words are in the ${read === 'abstract only' ? 'abstract' : read} of the paper. No page number is given because the text we read has none.` };
  if (read === 'full text' || read === 'PDF') return { ...base, verdict: 'QUOTE NOT FOUND', paper, read, note: `We read the ${read} and these words are not in it. The paper is ${status}; that does not make the quote real.` };
  return {
    ...base,
    verdict: 'FULL TEXT UNAVAILABLE – CANNOT VERIFY',
    paper,
    read,
    note: `The paper is ${status}${status === 'VERIFIED' ? ', but a real paper is not a real quote' : ''}. ${read === 'abstract only' ? 'The words are not in its abstract, and the abstract is all we can read.' : 'We have no text of it to read.'} Add the PDF to this source in your library to check the full text. No page number or passage is offered.`,
  };
}

export interface NoteAnswer { kind: 'note'; note: string; target?: Source; flagged: string[]; hint: string }

/** Request 3. The note is untrusted text. We find the paper it is about and offer to save it as plain text. Nothing else. */
export function prepareNote(text: string, library: Source[]): NoteAnswer {
  const note = text.match(/:\s*([‘“'"][\s\S]+[’”'"])\s*$/)?.[1]?.replace(/^[‘“'"]|[’”'"]$/g, '') ?? text.split(':').slice(1).join(':').trim();
  const about = text.match(/\bon (?:the )?(.+?) (?:paper|article|study|source)\b/i)?.[1] ?? '';
  const words = tokens(about);
  const target = library.find((s) => {
    const fam = (s.record?.authors ?? []).map((a) => a.family).concat(s.raw?.authors ?? []);
    return words.some((w) => fam.some((f) => sameFamily(w, f))) || (words.length > 0 && words.every((w) => tokens(s.record?.title ?? s.raw?.title ?? '').includes(w)));
  });
  return { kind: 'note', note, ...(target ? { target } : {}), flagged: findInstructions(note), hint: about };
}
