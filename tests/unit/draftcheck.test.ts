import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RegistryRecord, Source } from '@/core/contracts';
import { checkCopied, quoteIn, type CopyKind } from '@/core/draftcheck/copied';
import { applyEdits, checkLanguage } from '@/core/draftcheck/language';
import { quotedSpans } from '@/core/draftcheck/text';
import { fromCrossref } from '@/core/registries/map';
import { BLOOM, CLEAN, CLOSE, COPIED, NOY, OWN, SLIPS } from '../draft-set';

const ABS: Record<string, string> = JSON.parse(readFileSync('tests/unit/fixtures/abstracts.json', 'utf8'));
const store = JSON.parse(readFileSync('tests/unit/fixtures/registry.json', 'utf8'));
const rec = (doi: string): RegistryRecord | undefined => {
  const b = store[`https://api.crossref.org/works/${doi}`]?.body?.message;
  return b ? fromCrossref(b) : undefined;
};
const src = (doi: string, over: Partial<Source> = {}): Source => ({
  id: doi, projectId: 'p', origin: 'doi', keys: { found: true, checked: true, approved: true }, tags: [], notes: '', addedAt: '2026-11-25', text: ABS[doi], textOrigin: 'abstract',
  ...(rec(doi) ? { record: rec(doi) } : { raw: { raw: doi, title: doi } }), ...over,
});
const LIB = Object.keys(ABS).map((d) => src(d));
const kinds = (draft: string, lib = LIB): CopyKind[] => checkCopied(draft, lib).items.map((i) => i.kind);

describe('copied text', () => {
  it.each(COPIED)('%s copied: %s', (doi, text) => {
    const hit = checkCopied(text, LIB).items.find((i) => i.kind === 'copied');
    expect(hit?.source?.id).toBe(doi);
    expect(hit!.words).toBeGreaterThanOrEqual(8);
    expect(ABS[doi]).toContain(hit!.passage);
    expect(text.slice(hit!.start, hit!.end)).toBe(hit!.text);
  });
  it.each(CLOSE)('%s close: %s', (doi, text) => {
    const hit = checkCopied(text, LIB).items[0];
    expect(hit?.source?.id).toBe(doi);
    expect(['close', 'copied']).toContain(hit?.kind);
  });
  it.each(OWN)('%s in own words: %s', (_doi, text) => expect(kinds(text)).toEqual([]));

  it('says whether the source is cited', () => {
    expect(checkCopied('Their attrition rate halved, but their promotion rate conditional on performance fell (Bloom et al., 2015).', LIB).items[0]!.cited).toBe(true);
    expect(checkCopied('Their attrition rate halved, but their promotion rate conditional on performance fell.', LIB).items[0]!.cited).toBe(false);
  });
  it('a title is not copying, nor is the list pasted under the draft', () => {
    const withTitle = LIB.map((s) => (s.id === BLOOM ? { ...s, text: `Does Working from Home Work? Evidence from a Chinese Experiment Nicholas Bloom. ${s.text}` } : s));
    expect(kinds('I read Does Working from Home Work? Evidence from a Chinese Experiment last week and liked it.', withTitle)).toEqual([]);
    expect(kinds('My point is different.\n\nReferences\nHome working led to a 13% performance increase, of which 9% was from working more minutes per shift.')).toEqual([]);
  });
  it('an empty library compares nothing and says so', () => {
    const r = checkCopied(COPIED[0]![1], [src(BLOOM, { text: undefined, textOrigin: undefined })]);
    expect(r.items).toEqual([]);
    expect(r.compared).toEqual([]);
    expect(r.unreadable).toHaveLength(1);
  });
  it('is quick on a long draft and a large library', () => {
    const filler = (n: number) => Array.from({ length: 900 }, (_, i) => `Unit ${n} sentence ${i} speaks of matter ${(i * 7919 + n) % 1013} and of topic ${(i * 104729 + n) % 997} in plain terms.`).join(' ');
    const big = Array.from({ length: 12 }, (_, n) => src(BLOOM, { id: `big${n}`, text: filler(n), textOrigin: 'pdf' }));
    const draft = Array.from({ length: 250 }, (_, i) => `My own thought number ${i} touches question ${(i * 31) % 89} and reason ${(i * 17) % 71} without help.`).join(' ');
    const t = performance.now();
    checkCopied(draft, big);
    checkCopied(draft, big);
    expect(performance.now() - t).toBeLessThan(6000);
  });
});

describe('quotations', () => {
  const q = 'Home working led to a 13% performance increase';
  const full = LIB.map((s) => (s.id === BLOOM ? { ...s, textOrigin: 'pdf' as const, pdfPages: 54, text: `First page text here.\n\nSecond page text here.\n\n${s.text}` } : s));

  it('with a citation and a page is in order', () => {
    const r = checkCopied(`As one study put it, “${q}” (Bloom et al., 2015, p. 167).`, LIB);
    expect(r.items).toEqual([]);
    expect(r.quotesOk).toBe(1);
  });
  it('without a page is a reminder, with the printed page when we know it', () => {
    const r = checkCopied(`“${q}” (Bloom et al., 2015).`, full);
    expect(r.items.map((i) => i.kind)).toEqual(['quote-no-page']);
    // The article is pages 165 to 218 and the file has 54 pages, so PDF page 3 is printed page 167.
    expect(r.items[0]!.page).toMatchObject({ page: 3, printed: 167 });
  });
  it('no citation', () => expect(kinds(`The gain was real: “${q}”.`)).toEqual(['quote-no-citation']));
  it('the citation after a full stop still counts', () => expect(kinds(`It was plain. “${q}.” (Bloom et al., 2015, p. 167) Others differ.`)).toEqual([]));
  it('the wrong source', () => {
    const r = checkCopied(`“${q}” (Noy & Zhang, 2023, p. 187).`, LIB);
    expect(r.items.map((i) => i.kind)).toEqual(['quote-wrong-source']);
    expect(r.items[0]!.source!.id).toBe(BLOOM);
  });
  it('invented words, read in full', () => expect(kinds('“Home working doubled the profit of every single team” (Bloom et al., 2015, p. 170).', full)).toEqual(['quote-not-there']));
  it('invented words, only the abstract read, is never called invented', () => expect(kinds('“Home working doubled the profit of every single team” (Bloom et al., 2015, p. 170).')).toEqual(['quote-not-seen']));
  it('one changed digit is not the same quotation', () => expect(kinds('“Home working led to a 31% performance increase” (Bloom et al., 2015, p. 167).', full)).toEqual(['quote-not-there']));
  it('no citation and found nowhere', () => expect(kinds('“The moon is made of a very old green cheese”, people say.')).toEqual(['quote-unknown']));
  it('short quoted terms are left alone', () => expect(kinds('So-called “shirking from home” is a worry.')).toEqual([]));
  it('leaving words out and adding words in square brackets is allowed', () => {
    expect(quoteIn('Home working led to a 13% performance increase … and 4% from more calls per minute', ABS[BLOOM]!)).not.toBeNull();
    expect(quoteIn('[h]ome working led to a 13% performance increase', ABS[BLOOM]!)).not.toBeNull();
    expect(quoteIn('Home working led to a [large] performance increase', ABS[BLOOM]!)).not.toBeNull();
    expect(quoteIn('Home working led to a 14% performance increase … and 4% from more calls per minute', ABS[BLOOM]!)).toBeNull();
  });
  it('quoted words are not also reported as copied', () => expect(kinds(`“${ABS[BLOOM]!.slice(ABS[BLOOM]!.indexOf('Home working led'), ABS[BLOOM]!.indexOf(' and 4%'))}” (Bloom et al., 2015, p. 167).`)).toEqual([]));
  it('copied words that run on after the closing mark are still reported', () => expect(kinds('“Home working led to a 13% performance increase” of which 9% was from working more minutes per shift (Bloom et al., 2015, p. 167).')).toEqual(['copied']));
  it('IEEE marks and MLA pages', () => {
    expect(checkCopied(`“${q}” (Bloom et al. 167).`, LIB, 'mla').items).toEqual([]);
    expect(checkCopied(`“${q}” (Bloom et al. 2015, 167).`, LIB, 'chicago').items).toEqual([]);
    expect(checkCopied(`“${q}” (Bloom et al., 2015).`, LIB, 'ieee').items).toEqual([]);
  });
  it('apostrophes are not quotation marks', () => expect(quotedSpans("The firm's staff didn't mind, and the manager's view wasn't asked.")).toEqual([]));
});

describe('writing check', () => {
  it.each(SLIPS)('%s: %s', (rule, before, after) => {
    const slip = checkLanguage(before).find((s) => s.rule === rule);
    expect(slip, JSON.stringify(checkLanguage(before))).toBeTruthy();
    expect(applyEdits(before, slip!.edits!)).toBe(after);
  });
  it.each(CLEAN)('leaves alone: %s', (text) => expect(checkLanguage(text).map((s) => `${s.rule}: ${s.say}`)).toEqual([]));
  it('never touches a quotation, a citation, an address or the reference list', () => {
    for (const t of ['He wrote “the the goverment could of shown a effect” (Okafor, 2020, p. 3).', 'It is at https://example.org/seperate,wich.', 'A fine point.\n\nReferences\nSmith, J. (2020). The the goverment. Recieve, 3.'])
      expect(checkLanguage(t).filter((s) => s.edits)).toEqual([]);
  });
  it('the real abstracts, which were edited by professionals, raise no slips with a fix', () => {
    const bad = Object.values(ABS).flatMap((t) => checkLanguage(t).filter((s) => s.edits).map((s) => `${s.rule}: ${s.text} ${s.say}`));
    expect(bad).toEqual([]);
  });
  it('both spellings, very long sentences, missing brackets', () => {
    expect(checkLanguage('The behaviour of staff matters. Their behavior at home matters too.').map((s) => s.rule)).toEqual(['Two spellings']);
    expect(checkLanguage(`It ${'goes on and '.repeat(20)}stops here.`).map((s) => s.rule)).toContain('Long sentence');
    expect(checkLanguage('The sample (which was small is not random. We know this.').map((s) => s.rule)).toContain('Missing pair');
  });
  it('the same thing said twice', () => {
    const a = 'Home work helped staff finish more calls in every shift.';
    expect(checkLanguage(`${a} We think this matters. ${a}`).map((s) => s.rule)).toEqual(['Said twice']);
    expect(checkLanguage(`${a} We think this matters. Home work helped the staff finish many more calls in every shift.`).map((s) => s.rule)).toEqual(['Said twice']);
    expect(checkLanguage(`${a} Office work helped managers see problems sooner than before.`).map((s) => s.rule)).toEqual([]);
  });
  it('one word again and again', () => {
    const t = 'Managers like control. Managers ask for control of time, control of place and control of method, and without control they worry that staff at home will rest, call friends, cook lunch, or walk the dog when nobody in the office can see them do it.';
    expect(checkLanguage(t).map((s) => s.say).join(' ')).toContain('“control” 5 times');
  });
  it('every edit is exact', () => {
    for (const [, before] of SLIPS) for (const s of checkLanguage(before)) for (const e of s.edits ?? []) expect(e.start).toBeLessThanOrEqual(e.end);
    expect(applyEdits('a  b  c', [{ start: 1, end: 3, text: ' ' }, { start: 4, end: 6, text: ' ' }])).toBe('a b c');
  });
  it('is quick on a long draft', () => {
    const t = performance.now();
    checkLanguage(Array.from({ length: 400 }, (_, i) => `My own thought number ${i} touches question ${(i * 31) % 89} and reason ${(i * 17) % 71} without help.`).join(' '));
    expect(performance.now() - t).toBeLessThan(4000);
  });
});
