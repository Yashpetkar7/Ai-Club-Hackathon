import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatSources, isPage, STYLE_FILE, type StyleFiles } from '@/core/cite/engine';
import { findCitations, numberCitations, sourceFor } from '@/core/cite/draft';
import type { CitationStyle, Notice, RegistryRecord, Source } from '@/core/contracts';
import { alreadyHave, better, findDuplicates, isPreprint } from '@/core/library/duplicates';
import { mergeSources, notTheSame } from '@/core/library/merge';
import { checkAgain, watchLibrary, type Ask } from '@/core/library/watch';
import { articlePages, pageAt, pageText } from '@/core/pdf/pages';
import { fromCrossref } from '@/core/registries/map';
import { statementLines } from '@/core/report/statement';
import { reviewProject } from '@/core/review/review';
import { sharedMissing } from '@/map/missing';
import { policyIssues } from '@/policy/apply';
import { POLICY } from '@/policy/policy';
import { approveSource, createProject } from '@/store/actions';
import { db, newId } from '@/store/db';

const store = JSON.parse(readFileSync('tests/unit/fixtures/registry.json', 'utf8'));
const ABS: Record<string, string> = JSON.parse(readFileSync('tests/unit/fixtures/abstracts.json', 'utf8'));
const file = (n: string): string => readFileSync(`public/styles/${n}`, 'utf8');
const styleFiles = (s: CitationStyle): StyleFiles => ({ style: file(`${STYLE_FILE[s]}.csl`), locales: { 'en-US': file('locales-en-US.xml'), 'en-GB': file('locales-en-GB.xml') } });
const BLOOM = '10.1093/qje/qju032';
const real = (doi: string): RegistryRecord => fromCrossref(store[`https://api.crossref.org/works/${doi}`].body.message);
let pid = 'p';
const source = (over: Partial<Source> = {}): Source => ({ id: newId(), projectId: pid, origin: 'doi', keys: { found: true, checked: true, approved: true }, tags: [], notes: '', addedAt: new Date().toISOString(), record: real(BLOOM), text: ABS[BLOOM], textOrigin: 'abstract', check: { verdict: 'confirmed', reasons: [], fields: [], trace: [], checkedAt: '2026-11-24T10:00:00Z', record: real(BLOOM) }, ...over }) as Source;
const rec = (over: Partial<RegistryRecord>): RegistryRecord => ({ registry: 'crossref', id: 'x', title: 'Untitled', authors: [], retracted: false, ...over });

beforeEach(async () => {
  await Promise.all([db.projects.clear(), db.sources.clear(), db.claims.clear(), db.log.clear(), db.drafts.clear()]);
  pid = (await createProject('Does working from home help?')).id;
});

describe('notices from Crossref', () => {
  const m = (updates: unknown[], extra: object = {}) => fromCrossref({ DOI: '10.1/x', title: ['A title of a paper'], author: [{ family: 'Lee' }], 'updated-by': updates, ...extra });
  const at = (...d: number[]) => ({ 'date-parts': [d] });
  it('a real retracted record keeps its date and says who reported it', () => {
    const r = real('10.1108/jrit-01-2024-0017');
    expect(r.retracted).toBe(true);
    expect(r.notices![0]).toMatchObject({ kind: 'retraction', by: 'publisher' });
    expect(r.notices![0]!.on).toBe(r.retractedOn);
  });
  it('a correction and an expression of concern are not retractions', () => {
    const r = m([{ type: 'correction', label: 'Correction', source: 'retraction-watch', updated: at(2004, 3, 6), DOI: '10.1/c' }, { type: 'expression_of_concern', label: 'Expression of concern', source: 'publisher', updated: at(2026, 5, 1), DOI: '10.1/e' }]);
    expect(r.retracted).toBe(false);
    expect(r.notices!.map((x: Notice) => [x.kind, x.on, x.by])).toEqual([['concern', '2026-05-01', 'publisher'], ['correction', '2004-03-06', 'retraction-watch']]);
  });
  it('the spellings publishers really deposit', () => {
    for (const t of ['retraction', 'Retraction', 'retration', 'retracion', 'withdrawal', 'removal']) expect(m([{ type: t }]).retracted).toBe(true);
    for (const t of ['erratum', 'Erratum', 'corrigendum', 'addendum', 'corrected-article']) expect(m([{ type: t }]).notices![0]!.kind).toBe('correction');
    for (const t of ['expression-of-concern', 'partial_retraction']) expect(m([{ type: t }]).notices![0]!.kind).toBe('concern');
    for (const t of ['new_version', 'article', 'comment', 'sample_update']) expect(m([{ type: t }]).notices).toBeUndefined();
  });
  it('the same notice from two places is one line', () => expect(m([{ type: 'retraction', DOI: '10.1/N', source: 'publisher' }, { type: 'retraction', DOI: '10.1/n', source: 'retraction-watch' }]).notices).toHaveLength(1));
  it('versions named by the publisher', () => expect(m([], { relation: { 'has-preprint': [{ 'id-type': 'doi', id: '10.2/PRE' }], cites: [{ 'id-type': 'doi', id: '10.3/no' }] } }).versions).toEqual(['10.2/pre']));
  it('concern needs a written reason, a correction does not', async () => {
    const concern = rec({ notices: [{ kind: 'concern', label: 'Expression of concern', by: 'publisher', on: '2026-05-01' }] });
    expect(policyIssues(concern)).toHaveLength(1);
    expect(policyIssues(concern, { ...POLICY, flagConcerns: false })).toEqual([]);
    expect(policyIssues(rec({ notices: [{ kind: 'correction', label: 'Correction', by: 'publisher' }] }))).toEqual([]);
    const s = source({ record: { ...real(BLOOM), notices: concern.notices! }, keys: { found: true, checked: true, approved: false } });
    await db.sources.add(s);
    await expect(approveSource(s.id)).rejects.toThrow(/at least/);
    expect((await approveSource(s.id, 'I discuss the concern itself.')).keptWithReason).toBeTruthy();
  });
});

describe('checking a whole library again', () => {
  const ask = (over: Partial<Record<keyof Ask['registries'], unknown>> = {}, refs: Ask['retractedReferences'] = async () => []): Ask => ({
    registries: { crossrefByDoi: async () => real(BLOOM), openalexByDoi: async () => ({ ...real(BLOOM), registry: 'openalex', openalexId: 'W1' }), dataciteByDoi: async () => null, doiExists: async () => true, crossrefSearch: async () => [], ...over } as Ask['registries'],
    retractedReferences: refs,
  });
  it('a newly retracted source loses its approval and is named', async () => {
    const s = source();
    await db.sources.add(s);
    const w = await watchLibrary(pid, () => undefined, () => false, ask({ crossrefByDoi: async () => ({ ...real(BLOOM), retracted: true, retractedOn: '2026-11-25', notices: [{ kind: 'retraction', label: 'Retraction', by: 'retraction-watch' }] }) }));
    expect(w.retracted).toHaveLength(1);
    const now = (await db.sources.get(s.id))!;
    expect(now.check!.verdict).toBe('retracted');
    expect(now.keys.approved).toBe(false);
    expect((await db.log.toArray()).at(-1)!.action).toBe('library.watched');
  });
  it('a silent registry never strips an approval and never counts as a pass', async () => {
    const s = source();
    await db.sources.add(s);
    const down = async () => { throw new Error('down'); };
    const w = await watchLibrary(pid, () => undefined, () => false, ask({ crossrefByDoi: down, openalexByDoi: down, dataciteByDoi: down, doiExists: down, crossrefSearch: down }, down));
    expect(w).toMatchObject({ checked: 0, retracted: [] });
    expect(w.unsure).toHaveLength(1);
    const now = (await db.sources.get(s.id))!;
    expect(now.check!.checkedAt).toBe('2026-11-24T10:00:00Z');
    expect(now.keys.approved).toBe(true);
    expect((await checkAgain(now, ask({ openalexByDoi: down }))).ok).toBe(false);
  });
  it('stops asking after two silent answers in a row', async () => {
    await db.sources.bulkAdd(Array.from({ length: 6 }, (_, i) => source({ record: { ...real(BLOOM), id: `s${i}` } })));
    const down = vi.fn(async () => { throw new Error('down'); });
    const w = await watchLibrary(pid, () => undefined, () => false, ask({ crossrefByDoi: down, openalexByDoi: down, dataciteByDoi: down, doiExists: down, crossrefSearch: down }, down));
    expect(w).toMatchObject({ silent: true, checked: 0 });
    expect(w.unsure).toHaveLength(6);
    expect(down.mock.calls.length).toBeLessThan(14);
  });
  it('remembers which sources cite retracted work', async () => {
    const s = source();
    await db.sources.add(s);
    const refs = vi.fn(async () => [{ id: 'W9', title: 'A withdrawn study', doi: '10.1/w' }]);
    const w = await watchLibrary(pid, () => undefined, () => false, ask({}, refs));
    expect(refs).toHaveBeenCalledWith('W1');
    expect(w.leaning).toHaveLength(1);
    const now = (await db.sources.get(s.id))!;
    expect(now.retractedRefs!.items[0]!.title).toBe('A withdrawn study');
    // Citing retracted work is a reason to look, not a reason to block.
    expect(now.keys.approved).toBe(true);
    const r = reviewProject({ projectId: pid, sources: [now], claims: [], draft: '', log: [] });
    expect(r.findings.find((f) => f.id === 'leaning')).toMatchObject({ level: 'look' });
  });
  it('can be stopped, and skips sources with no record', async () => {
    await db.sources.bulkAdd([source(), source({ record: undefined, raw: { raw: 'A web page' }, check: undefined }), source({ record: { ...real(BLOOM), id: 'y' } })]);
    let k = 0;
    const w = await watchLibrary(pid, () => k++, () => k >= 1, ask());
    expect(w.stopped).toBe(true);
    expect(w.checked).toBe(1);
  });
});

describe('the same work saved twice', () => {
  const pub = () => source({ record: rec({ id: '10.1/pub', doi: '10.1/pub', title: 'Remote Work and Team Performance: Evidence from Call Centres', authors: [{ family: 'Rao' }, { family: 'Lind' }], year: 2023, type: 'journal-article', container: 'Journal of Work' }) });
  const pre = (over: Partial<RegistryRecord> = {}) => source({ record: rec({ id: '10.2/pre', doi: '10.2/pre', title: 'Remote work and team performance: evidence from call centres', authors: [{ family: 'Rao' }, { family: 'Lind' }], year: 2021, type: 'posted-content', container: 'SSRN', ...over }) });
  it('a preprint and the printed paper', () => {
    const [p] = findDuplicates([pub(), pre()]);
    expect(p!.why).toContain('preprint');
    expect(better(p!.a, p!.b).record!.doi).toBe('10.1/pub');
    expect(isPreprint(p!.b.record)).toBe(true);
  });
  it('a dropped subtitle', () => expect(findDuplicates([pub(), pre({ title: 'Remote Work and Team Performance' })])).toHaveLength(1));
  it('the publisher says so, whatever the titles', () => expect(findDuplicates([source({ record: { ...pub().record!, versions: ['10.2/pre'] } }), pre({ title: 'A very different early title for it' })])[0]!.why).toContain('publisher'));
  it.each([
    ['other authors', pre({ authors: [{ family: 'Okafor' }] })],
    ['another part', pre({ title: 'Remote work and team performance: evidence from call centres, part 2' })],
    ['one word different', pre({ title: 'Remote work and team morale: evidence from call centres' })],
    ['a new edition years later', pre({ year: 2012 })],
  ])('not the same: %s', (name, s) => {
    const found = findDuplicates([pub(), s]);
    // "part 2" only adds words at the end, so the first title sits inside it. Same author and year: worth a look, never merged alone.
    if (name === 'another part') expect(found.length).toBeLessThanOrEqual(1);
    else expect(found).toEqual([]);
  });
  it('real library: eight different papers, no pair', () => expect(findDuplicates(Object.keys(store).filter((u) => u.startsWith('https://api.crossref.org/works/10.') && store[u].status === 200).map((u) => source({ id: newId(), record: fromCrossref(store[u].body.message) })))).toEqual([]));
  it('a search result already held under another DOI', () => expect(alreadyHave(pre().record!, [pub()])?.record?.doi).toBe('10.1/pub'));

  it('keeping one moves notes, tags and the claims whose words are in it', async () => {
    const keep = source({ notes: 'Mine.', tags: ['a'] });
    const drop = source({ record: { ...real(BLOOM), id: '10.2/pre', doi: '10.2/pre' }, notes: 'Also mine.', tags: ['b'], folder: 'Field', text: `${ABS[BLOOM]} Only the preprint says that profit rose tenfold in a week.` });
    await db.sources.bulkAdd([keep, drop]);
    const words = 'Home workers also reported improved work satisfaction, and their attrition rate halved, but their promotion rate conditional on performance fell.';
    const base = { projectId: pid, label: 'verified' as const, reasons: [], checks: { exactQuote: true, support: null, contradiction: null, numbers: null, direction: null, scope: null }, by: 'student' as const, decision: 'accepted' as const, createdAt: '2026-11-25' };
    await db.claims.bulkAdd([
      { ...base, id: 'c1', text: words, sourceId: drop.id, passage: { id: 'x', sourceId: drop.id, text: words, start: 0, end: 5 } },
      { ...base, id: 'c2', text: 'Profit rose tenfold.', sourceId: drop.id, passage: { id: 'y', sourceId: drop.id, text: 'Only the preprint says that profit rose tenfold in a week.', start: 0, end: 5 } },
    ]);
    const m = await mergeSources(keep.id, drop.id);
    expect(m).toMatchObject({ moved: 1, left: 1, textCopied: false });
    const now = (await db.sources.get(keep.id))!;
    expect(now).toMatchObject({ notes: 'Mine.\nAlso mine.', tags: ['a', 'b'], folder: 'Field' });
    expect(now.text).not.toContain('tenfold');
    expect(await db.sources.get(drop.id)).toBeUndefined();
    const c1 = (await db.claims.get('c1'))!;
    expect(c1.sourceId).toBe(keep.id);
    expect(now.text!.slice(c1.passage!.start, c1.passage!.end)).toBe(words);
    // A sentence only the preprint has is never moved onto the printed paper.
    expect((await db.claims.get('c2'))!.sourceId).toBe(drop.id);
  });
  it('a claim is judged again when the source that stays was not confirmed', async () => {
    const keep = source({ check: { ...source().check!, verdict: 'details-differ' } });
    const drop = source({ record: { ...real(BLOOM), id: 'z', doi: '10.2/z' } });
    await db.sources.bulkAdd([keep, drop]);
    const words = 'Home working led to a 13% performance increase';
    await db.claims.add({ id: 'c', projectId: pid, text: `${words}.`, label: 'verified', reasons: [], checks: { exactQuote: true, support: null, contradiction: null, numbers: null, direction: null, scope: null }, by: 'student', decision: 'accepted', createdAt: '2026-11-25', sourceId: drop.id, passage: { id: 'x', sourceId: drop.id, text: words, start: 0, end: 5 } });
    await mergeSources(keep.id, drop.id);
    expect((await db.claims.get('c'))!.label).not.toBe('verified');
  });
  it('"they are different" is remembered and logged', async () => {
    await notTheSame(pid, 'a|b', 'A | B');
    await notTheSame(pid, 'a|b', 'A | B');
    expect((await db.projects.get(pid))!.notTheSame).toEqual(['a|b']);
    expect((await db.log.toArray()).some((e) => e.action === 'source.not-the-same')).toBe(true);
  });
  it('refuses to merge a source with itself or a missing one', async () => {
    const s = source();
    await db.sources.add(s);
    await expect(mergeSources(s.id, s.id)).rejects.toThrow();
    await expect(mergeSources(s.id, 'gone')).rejects.toThrow();
  });
});

describe('papers you may be missing', () => {
  const withRefs = (id: string, refs: string[]) => source({ id, record: { ...real(BLOOM), id, doi: `10.9/${id.toLowerCase()}`, openalexId: id, references: refs } });
  it('counts only what two or more sources cite, most first, and nothing you have', () => {
    const r = sharedMissing([withRefs('W1', ['W2', 'W7', 'W8']), withRefs('W2', ['W7', 'W8', 'W9']), withRefs('W3', ['W8', 'W2']), source({ record: { ...real(BLOOM), id: 'n' } })]);
    expect(r.list.map((m) => [m.id, m.by.length])).toEqual([['W8', 3], ['W7', 2]]);
    expect(r).toMatchObject({ withList: 3, without: 1 });
  });
  it('a reference listed twice in one paper counts once', () => expect(sharedMissing([withRefs('W1', ['W5', 'W5']), withRefs('W2', ['W6'])]).list).toEqual([]));
});

describe('page numbers', () => {
  const pdf = (over: Partial<Source> = {}) => source({ textOrigin: 'pdf', text: 'Page one words here.\n\nPage two words here.\n\nPage three words here.', pdfPages: 54, ...over });
  const where = (s: Source, words: string) => pageAt(s, s.text!.indexOf(words), s.text!.indexOf(words) + words.length);
  it('page of the file, and the printed page when the counts agree', () => {
    expect(where(pdf(), 'Page two')).toEqual({ page: 2, printed: 166 });
    expect(pageText(where(pdf(), 'Page two')!)).toBe('Page 166 (page 2 of the PDF)');
  });
  it('never guesses the printed page when the file has a cover sheet', () => {
    expect(where(pdf({ pdfPages: 55 }), 'Page two')).toEqual({ page: 2 });
    expect(pageText({ page: 2 })).toBe('Page 2 of the PDF');
  });
  it('a sentence over two pages', () => expect(pageAt(pdf(), 5, pdf().text!.indexOf('two'))).toMatchObject({ page: 1, to: 2, printed: 165, printedTo: 166 }));
  it('an empty first page still counts', () => expect(where(pdf({ text: '\n\nPage two words here.', pdfPages: 3 }), 'Page two')).toEqual({ page: 2 }));
  it('abstracts have none', () => expect(pageAt(source(), 0, 10)).toBeNull());
  it('ranges from the registry', () => {
    expect(articlePages('165-218')).toEqual({ first: 165, last: 218 });
    expect(articlePages('1488–542')).toEqual({ first: 1488, last: 1542 });
    for (const x of ['102642', 'e12-e15', '20-10', '497-29', undefined, '']) expect(articlePages(x)).toBeNull();
  });
  it('citations with a page, worked out by hand from each style', () => {
    const one = (style: 'apa' | 'harvard' | 'mla' | 'chicago', page: string) => formatSources([source({ id: 'a' })], style, styleFiles(style), page).inText.get('a');
    expect(one('apa', '167')).toBe('(Bloom et al., 2015, p. 167)');
    expect(one('apa', '167-168')).toBe('(Bloom et al., 2015, pp. 167–168)');
    expect(one('mla', '167')).toBe('(Bloom et al. 167)');
    expect(one('chicago', '167')).toBe('(Bloom et al. 2015, 167)');
    expect(one('harvard', '167')).toBe('(Bloom et al., 2015, p. 167)');
    expect(one('apa', '<b>1')).toBe('(Bloom et al., 2015)');
  });
  it('what counts as a page', () => {
    for (const x of ['1', '167', '167-168', '167–168', 'e12', 'S4']) expect(isPage(x)).toBe(true);
    for (const x of ['', 'p. 5', 'x', '1,2', '12345678', '<script>']) expect(isPage(x)).toBe(false);
  });
  it('a draft citation with a page still finds its source, and IEEE keeps the page', () => {
    const s = source({ id: 'a' });
    for (const t of ['(Bloom et al., 2015, p. 167)', '(Bloom et al. 2015, 167)', '(Bloom et al. 167)', 'Bloom et al. (2015, p. 167)']) expect(findCitations(`It rose ${t}.`).map((c) => sourceFor(c, [s])?.id)).toEqual(['a']);
    expect(numberCitations('It rose (Bloom et al., 2015, p. 167).', [s])).toBe('It rose [1, p. 167].');
    expect(numberCitations('It rose (Bloom et al., 2015).', [s])).toBe('It rose [1].');
  });
  it('an MLA page that looks like a year is still a page', () => {
    const s = source({ id: 'k', record: { ...real(BLOOM), pages: '1821-1851' } });
    expect(findCitations('It rose (Bloom et al. 1840).').map((c) => sourceFor(c, [s])?.id)).toEqual(['k']);
    expect(findCitations('It rose (Bloom et al., 1840).').map((c) => sourceFor(c, [s])?.id)).toEqual([undefined]);
  });
});

describe('the Reviewer and the statement use the draft check', () => {
  it('lists copied words, false quotations and corrections', () => {
    const s = source({ id: 'a', textOrigin: 'pdf', pdfPages: 54, record: { ...real(BLOOM), notices: [{ kind: 'correction', label: 'Correction', by: 'publisher' }] } });
    const draft = 'Their attrition rate halved, but their promotion rate conditional on performance fell. “Home working doubled the profit of every single team” (Bloom et al., 2015, p. 170).';
    const r = reviewProject({ projectId: pid, sources: [s], claims: [], draft, log: [] });
    const level = (id: string) => r.findings.find((f) => f.id === id)?.level;
    expect(level('copied')).toBe('fix');
    expect(level('quotes')).toBe('fix');
    expect(level('corrected')).toBe('look');
  });
  it('says what it compared when nothing was copied', () => {
    const r = reviewProject({ projectId: pid, sources: [source()], claims: [], draft: 'Staff at home did about an eighth more work (Bloom et al., 2015).', log: [] });
    expect(r.findings.find((f) => f.id === 'ownwords')!.detail).toContain('cannot see the web');
  });
  it('the AI-use statement names the rule-based check and counts the clicks', () => {
    const e = (action: string) => ({ seq: 1, projectId: pid, at: '2026-11-25T10:00:00Z', actor: 'student' as const, action, detail: '', prevHash: '', hash: '' });
    const t = statementLines([e('draft.checked'), e('draft.fix'), e('draft.fix')], { aiLevel: 0 }).join(' ');
    expect(t).toContain('which is not AI');
    expect(t).toContain('I applied 2 of its corrections');
    expect(statementLines([], { aiLevel: 0 }).join(' ')).not.toContain('rule-based');
  });
});
