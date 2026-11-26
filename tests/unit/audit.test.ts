import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auditReferences, bodyEnd, checkPair, citationsIn, findClaims, linkClaim, overall, refsFor, sourceOf, splitClaim, unsourced, type RefInfo } from '@/core/claims/audit';
import type { ReferenceCheck, RegistryRecord } from '@/core/contracts';
import { extractReferences } from '@/core/verify/parse';
import { AUDIT_SAMPLE } from '@/fixtures/audit-sample';

const ABSTRACT: Record<string, string> = JSON.parse(readFileSync('tests/unit/fixtures/abstracts.json', 'utf8'));
const BLOOM = ABSTRACT['10.1093/qje/qju032']!;
const NOY = ABSTRACT['10.1126/science.adh2586']!;

const record = (doi: string, family: string, year: number, abstract?: string): RegistryRecord => ({ registry: 'crossref', id: doi, doi, title: doi, authors: [{ family }], year, retracted: false, ...(abstract ? { abstract } : {}) });
const confirmed = (rec: RegistryRecord): ReferenceCheck => ({ verdict: 'confirmed', reasons: [], fields: [], trace: [], checkedAt: '2026-11-26T00:00:00Z', record: rec });
const notFound: ReferenceCheck = { verdict: 'not-found', reasons: ['DOI_DOES_NOT_EXIST'], fields: [], trace: [], checkedAt: '2026-11-26T00:00:00Z' };

describe('where the paragraph ends', () => {
  it('stops at a References heading', () => {
    const text = 'Home working led to a 13% performance increase (Bloom et al., 2015).\n\nReferences\n\nBloom, N. (2015). Title. Journal.';
    expect(text.slice(0, bodyEnd(text, []))).toBe('Home working led to a 13% performance increase (Bloom et al., 2015).\n\n');
  });
  it('without a heading, stops at the first line of a parsed reference', () => {
    const text = 'Home working led to a 13% performance increase (Bloom et al., 2015).\nBloom, N., Liang, J., Roberts, J., & Ying, Z. J. (2015). Does working from home work? Evidence from a Chinese experiment. The Quarterly Journal of Economics, 130(1), 165–218. https://doi.org/10.1093/qje/qju032';
    const refs = extractReferences(text).references;
    expect(refs).toHaveLength(1);
    expect(text.slice(0, bodyEnd(text, refs)).trim()).toBe('Home working led to a 13% performance increase (Bloom et al., 2015).');
  });
});

describe('references in a pasted paragraph', () => {
  it('a single sentence with no reference shape is a claim, not a title to look up', () => {
    expect(auditReferences('Home working led to a 13% performance increase.').references).toEqual([]);
  });
  it('a single DOI or a full reference is still a reference', () => {
    expect(auditReferences('10.1093/qje/qju032').references).toHaveLength(1);
    expect(auditReferences('Bloom, N., Liang, J., Roberts, J., & Ying, Z. J. (2015). Does working from home work? Evidence from a Chinese experiment. The Quarterly Journal of Economics, 130(1), 165–218.').references).toHaveLength(1);
  });
});

describe('citations in a sentence', () => {
  it('takes out parenthetical citations and keeps the claim', () => {
    const { cites, bare } = citationsIn('Home working led to a 13% performance increase (Bloom et al., 2015).');
    expect(bare).toBe('Home working led to a 13% performance increase.');
    expect(cites).toEqual([{ text: 'Bloom et al., 2015', family: 'Bloom', year: 2015 }]);
  });
  it('reads two citations in one bracket', () => {
    const { cites, bare } = citationsIn('Both raised output (Bloom et al., 2015; Noy & Zhang, 2023).');
    expect(cites.map((c) => [c.family, c.year])).toEqual([['Bloom', 2015], ['Noy', 2023]]);
    expect(bare).toBe('Both raised output.');
  });
  it('drops a narrative citation and its reporting verb', () => {
    expect(citationsIn('Bloom et al. (2015) found that home working led to a 13% performance increase.').bare).toBe('Home working led to a 13% performance increase.');
    expect(citationsIn('According to Noy and Zhang (2023), output quality rose by 18%.').bare).toBe('Output quality rose by 18%.');
  });
  it('reads numbered markers and ranges', () => {
    const { cites, bare } = citationsIn('Output quality rose by 18% [2], as others found [3-5].');
    expect(cites.map((c) => c.n)).toEqual([[2], [3, 4, 5]]);
    expect(bare).toBe('Output quality rose by 18%, as others found.');
  });
  it('reads a DOI written in the sentence', () => {
    const { cites, bare } = citationsIn('Home working led to a 13% performance increase (https://doi.org/10.1093/qje/qju032).');
    expect(cites).toEqual([{ text: '10.1093/qje/qju032', doi: '10.1093/qje/qju032' }]);
    expect(bare).toBe('Home working led to a 13% performance increase.');
  });
  it('does not take an abbreviation in brackets for a citation', () => {
    const { cites, bare } = citationsIn('Staff who work from home (WFH) were more productive.');
    expect(cites).toEqual([]);
    expect(bare).toBe('Staff who work from home (WFH) were more productive.');
  });
});

describe('splitting a sentence into claims', () => {
  it('cuts two facts joined by "and"', () => {
    expect(splitClaim('With ChatGPT, the average time taken decreased by 40% and output quality rose by 18%.')).toEqual(['With ChatGPT, the average time taken decreased by 40%', 'Output quality rose by 18%.']);
    expect(splitClaim('Home workers reported improved work satisfaction, and their attrition rate halved.')).toEqual(['Home workers reported improved work satisfaction', 'Their attrition rate halved.']);
  });
  it('keeps one fact whole', () => {
    expect(splitClaim('Home working led to a 13% performance increase.')).toEqual(['Home working led to a 13% performance increase.']);
    expect(splitClaim('Concern and excitement about AI temporarily rose.')).toEqual(['Concern and excitement about AI temporarily rose.']);
    expect(splitClaim('Home workers reported fewer breaks and sick days.')).toEqual(['Home workers reported fewer breaks and sick days.']);
  });
  it('keeps a noun joined by "and" with the fact that follows it', () => {
    expect(splitClaim('Inequality between workers decreased, and concern and excitement about AI temporarily rose.')).toEqual(['Inequality between workers decreased', 'Concern and excitement about AI temporarily rose.']);
  });
  it('never cuts inside brackets', () => {
    const s = 'Home working led to a 13% performance increase (with fewer breaks and fewer sick days).';
    expect(splitClaim(s)).toEqual([s]);
  });
  it('cuts at a semicolon between two facts', () => {
    expect(splitClaim('Average time fell by 40%; output quality rose by 18%.')).toEqual(['Average time fell by 40%', 'Output quality rose by 18%.']);
  });
});

describe('the sample paragraph', () => {
  const refs = extractReferences(AUDIT_SAMPLE).references;
  const claims = findClaims(AUDIT_SAMPLE, refs);
  it('has three references with authors and years', () => {
    expect(refs.map((r) => [r.authors?.[0], r.year, r.doi])).toEqual([
      ['Bloom', 2015, '10.1093/qje/qju032'],
      ['Noy', 2023, '10.1126/science.adh2586'],
      ['Okonjo', 2022, '10.1073/pnas.1523821113'],
    ]);
  });
  it('has five claims, none from the reference list', () => {
    expect(claims.map((c) => c.text)).toEqual([
      'Home working led to a 13% performance increase.',
      'In short, home working led to a 31% performance increase.',
      'With ChatGPT, the average time taken decreased by 40%',
      'Output quality rose by 18%.',
      'Trust in automated tutoring falls over time.',
    ]);
    for (const c of claims) expect(AUDIT_SAMPLE.slice(c.start, c.end)).toBe(c.sentence);
    expect(claims.filter((c) => c.part)).toHaveLength(2);
  });
  it('links each claim to the reference it cites', () => {
    const info: RefInfo[] = refs.map((ref) => ({ ref }));
    expect(claims.map((c) => linkClaim(c, info))).toEqual([
      { refs: [0], how: 'cited', missing: [] },
      { refs: [0], how: 'cited', missing: [] },
      { refs: [1], how: 'cited', missing: [] },
      { refs: [1], how: 'cited', missing: [] },
      { refs: [2], how: 'cited', missing: [] },
    ]);
  });
});

describe('linking citations to references', () => {
  const info: RefInfo[] = [
    { ref: { raw: 'Bloom, N. (2015). Does working from home work?', authors: ['Bloom'], year: 2015, doi: '10.1093/qje/qju032' } },
    { ref: { raw: '10.1126/science.adh2586', doi: '10.1126/science.adh2586' }, record: record('10.1126/science.adh2586', 'Noy', 2023) },
  ];
  it('matches by first author and year, then by a year one out', () => {
    expect(refsFor({ text: 'Bloom et al., 2015', family: 'Bloom', year: 2015 }, info)).toEqual([0]);
    expect(refsFor({ text: 'Bloom et al., 2014', family: 'Bloom', year: 2014 }, info)).toEqual([0]);
    expect(refsFor({ text: 'Bloom et al., 2010', family: 'Bloom', year: 2010 }, info)).toEqual([]);
  });
  it('uses the registry record when the reference was only a DOI', () => {
    expect(refsFor({ text: 'Noy & Zhang, 2023', family: 'Noy', year: 2023 }, info)).toEqual([1]);
  });
  it('matches by DOI and by number', () => {
    expect(refsFor({ text: '10.1093/qje/qju032', doi: '10.1093/qje/qju032' }, info)).toEqual([0]);
    expect(refsFor({ text: '[2]', n: [2] }, info)).toEqual([1]);
    const numbered: RefInfo[] = [{ ref: { raw: '[2] Noy, S. (2023). Title.' } }, { ref: { raw: '[1] Bloom, N. (2015). Title.' } }];
    expect(refsFor({ text: '[1]', n: [1] }, numbered)).toEqual([1]);
  });
  it('tries every reference when the sentence cites nothing, and names a citation with no entry', () => {
    expect(linkClaim({ cites: [] }, info)).toEqual({ refs: [0, 1], how: 'all', missing: [] });
    expect(linkClaim({ cites: [{ text: 'Smith, 2020', family: 'Smith', year: 2020 }] }, info)).toEqual({ refs: [0, 1], how: 'all', missing: ['Smith, 2020'] });
    expect(linkClaim({ cites: [{ text: 'Smith, 2020', family: 'Smith', year: 2020 }] }, [])).toEqual({ refs: [], how: 'none', missing: ['Smith, 2020'] });
  });
});

describe('judging each claim against its reference, with no model', () => {
  const bloom = sourceOf(confirmed(record('10.1093/qje/qju032', 'Bloom', 2015, BLOOM)));
  const noy = sourceOf(confirmed(record('10.1126/science.adh2586', 'Noy', 2023, NOY)));
  it('Verified for the 13% claim in the abstract’s own words', async () => {
    const r = await checkPair('Home working led to a 13% performance increase.', bloom);
    expect(r.judged.label).toBe('verified');
    expect(r.candidates[r.pick]!.text).toContain('Home working led to a 13% performance increase');
    expect(r.support).toEqual([null, null, null].slice(0, r.candidates.length));
  });
  it('Disputed for 31%, with the number named', async () => {
    const r = await checkPair('In short, home working led to a 31% performance increase.', bloom);
    expect(r.judged.label).toBe('disputed');
    expect(r.judged.reasons).toContain('NUMBER_MISMATCH');
    expect(r.candidates[r.pick]!.text).toContain('13% performance increase');
  });
  it('each half of a joined sentence gets its own label', async () => {
    expect((await checkPair('Output quality rose by 18%.', noy)).judged.label).toBe('verified');
    const first = await checkPair('With ChatGPT, the average time taken decreased by 40%', noy);
    expect(first.judged.label).toBe('reported');
    expect(first.judged.reasons).toContain('MEANING_NOT_COMPARED');
  });
  it('a reference with no text is Reported, not checked, and cannot be traced', async () => {
    const r = await checkPair('Trust in automated tutoring falls over time.', sourceOf(notFound));
    expect(r.hasText).toBe(false);
    expect(r.judged.label).toBe('reported');
    expect(r.judged.reasons).toEqual(['NO_READABLE_TEXT']);
    expect(overall([{ label: r.judged.label, hasText: r.hasText }], 'cited').bucket).toBe('untraceable');
  });
  it('never compares with the paper a wrong DOI opens', () => {
    expect(sourceOf({ ...confirmed(record('10.1/x', 'Other', 2020, BLOOM)), verdict: 'wrong-paper' }).text).toBeUndefined();
  });
  it('a claim with no reference at all has no source', () => {
    expect(unsourced('Home working led to a 13% performance increase.').reasons).toEqual(['NO_SOURCE']);
  });
});

describe('judging with the on-device models (FAKE stand-ins, nothing downloaded)', () => {
  const noy = sourceOf(confirmed(record('10.1126/science.adh2586', 'Noy', 2023, NOY)));
  const bloom = sourceOf(confirmed(record('10.1093/qje/qju032', 'Bloom', 2015, BLOOM)));
  // Made-up numbers in the model's shape. They test the plumbing, not the model.
  const score = async (premise: string, hypothesis: string) => (/40%/.test(premise) && /40%/.test(hypothesis) ? { entails: 0.95, neutral: 0.04, contradicts: 0.01 } : { entails: 0.05, neutral: 0.9, contradicts: 0.05 });
  const embed = async (texts: string[]) => texts.map((t) => [/40%|time/.test(t) ? 1 : 0, /13%|performance/.test(t) ? 1 : 0, 0.1]);
  it('support above the line turns Reported into Verified when every check passes', async () => {
    const r = await checkPair('With ChatGPT, the average time taken decreased by 40%', noy, { embed, score });
    expect(r.judged.label).toBe('verified');
    expect(r.support[r.pick]?.entails).toBe(0.95);
    expect(r.candidates[r.pick]!.meaning).not.toBeNull();
  });
  it('support never rescues a wrong number', async () => {
    const yes = async () => ({ entails: 0.99, neutral: 0.005, contradicts: 0.005 });
    const r = await checkPair('In short, home working led to a 31% performance increase.', bloom, { score: yes });
    expect(r.judged.label).toBe('disputed');
  });
  it('a broken meaning model falls back to shared words', async () => {
    const broken = async () => {
      throw new Error('no model');
    };
    const r = await checkPair('Home working led to a 13% performance increase.', bloom, { embed: broken });
    expect(r.fellBack).toBe(true);
    expect(r.judged.label).toBe('verified');
  });
  it('points at another candidate the model reads as the opposite', async () => {
    const against = async (premise: string) => (/13% performance/.test(premise) ? { entails: 0.95, neutral: 0.04, contradicts: 0.01 } : { entails: 0.01, neutral: 0.04, contradicts: 0.95 });
    const r = await checkPair('Home working led to a 13% performance increase.', bloom, { score: against });
    if (r.candidates.length > 1) expect(r.against).toBeGreaterThanOrEqual(0);
    expect(r.against).not.toBe(r.pick);
  });
});

describe('one line per claim in the summary', () => {
  it('with its own citations, a source that disagrees outweighs one that agrees', () => {
    expect(overall([{ label: 'verified', hasText: true }, { label: 'disputed', hasText: true }], 'cited')).toEqual({ bucket: 'disputed', pick: 1 });
  });
  // Changed after review on 26 November: a claim that cites nothing we can match is not "verified against its
  // cited sources", and a listed paper that disagrees is shown rather than hidden behind one that agrees.
  it('tried against every reference: one that disagrees shows, and one that backs it is not counted as traced', () => {
    expect(overall([{ label: 'disputed', hasText: true }, { label: 'verified', hasText: true }], 'all')).toEqual({ bucket: 'disputed', pick: 0 });
    expect(overall([{ label: 'reported', hasText: true }, { label: 'verified', hasText: true }], 'all')).toEqual({ bucket: 'reported', pick: 1 });
  });
  it('Reported when a source had text, untraceable when none had', () => {
    expect(overall([{ label: 'reported', hasText: false }, { label: 'reported', hasText: true }], 'cited')).toEqual({ bucket: 'reported', pick: 1 });
    expect(overall([{ label: 'reported', hasText: false }], 'cited')).toEqual({ bucket: 'untraceable', pick: 0 });
  });
  it('unchecked while references are still being looked up, untraceable with no references', () => {
    expect(overall([null], 'cited')).toEqual({ bucket: 'unchecked', pick: -1 });
    expect(overall([{ label: 'reported', hasText: false }, null], 'cited')).toEqual({ bucket: 'unchecked', pick: 0 });
    expect(overall([], 'none')).toEqual({ bucket: 'untraceable', pick: -1 });
  });
});

describe('found in review: inline DOIs, short sentences, overlapping parts, nothing green too early', () => {
  it('a DOI inside a sentence is a citation: its claims stay, and the DOI is looked up on its own', () => {
    const t = 'Home working led to a 13% performance increase in a large field experiment 10.1093/qje/qju032. Quitting fell by half in the same study 10.1093/qje/qju032.';
    const x = auditReferences(t);
    expect(x.references).toEqual([{ raw: '10.1093/qje/qju032', doi: '10.1093/qje/qju032' }]);
    expect(findClaims(t, x.references).map((c) => c.text)).toEqual(['Home working led to a 13% performance increase in a large field experiment.', 'Quitting fell by half in the same study.']);
    const two = 'Home working led to a 13% performance increase in a large field experiment.\nQuitting fell by half in the same study (doi:10.1093/qje/qju032).';
    expect(findClaims(two, auditReferences(two).references)).toHaveLength(2);
  });
  it('short cited sentences are claims too', () => {
    const t = 'Sales rose by 12%; output fell by 9% (Bloom et al., 2015). Pay rose 5% [1]. Costs fell 9% [1].\n\nReferences\n[1] Bloom, N., Liang, J., Roberts, J., & Ying, Z. J. (2015). Does working from home work? Evidence from a Chinese experiment. The Quarterly Journal of Economics, 130(1), 165-218. https://doi.org/10.1093/qje/qju032';
    expect(findClaims(t, auditReferences(t).references).map((c) => c.text)).toEqual(['Sales rose by 12%', 'Output fell by 9%.', 'Pay rose 5%.', 'Costs fell 9%.']);
  });
  it('a joined sentence never repeats words across its parts', () => {
    expect(splitClaim('Costs fell by 5%; staff and managers but output rose by 9%')).toEqual(['Costs fell by 5%; staff and managers', 'Output rose by 9%']);
  });
  it('nothing is green while a cited source is unchecked, and a claim tried against every reference is not traced', () => {
    expect(overall([{ label: 'verified', hasText: true }, null], 'cited').bucket).toBe('unchecked');
    expect(overall([{ label: 'verified', hasText: true }, null, { label: 'disputed', hasText: true }], 'cited').bucket).toBe('disputed');
    expect(overall([{ label: 'verified', hasText: true }, { label: 'reported', hasText: true }], 'all').bucket).toBe('reported');
    expect(overall([{ label: 'verified', hasText: true }, { label: 'disputed', hasText: true }], 'all').bucket).toBe('disputed');
  });
});
