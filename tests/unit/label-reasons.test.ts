// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { REASON_TEXT, type ReasonCode, type ReferenceCheck } from '@/core/contracts';
import { numbers } from '@/core/claims/guards';
import { judge } from '@/core/claims/label';
import { rankSentences } from '@/core/claims/rank';
import { BLOOM } from '../claims-set';

const confirmed = { verdict: 'confirmed', reasons: [], fields: [], trace: [], checkedAt: '' } as ReferenceCheck;
const paraphrase = 'Working from home increased performance by 13%';
const passage = rankSentences(BLOOM, paraphrase)[0]!.text;

describe('the reason says whether the meaning was compared at all', () => {
  it('model never ran: MEANING_NOT_COMPARED, never MODEL_UNSURE', () => {
    const r = judge(paraphrase, { text: BLOOM, check: confirmed }, passage, null);
    expect(r.label).toBe('reported');
    expect(r.reasons).toContain('MEANING_NOT_COMPARED');
    expect(r.reasons).not.toContain('MODEL_UNSURE');
    expect(REASON_TEXT.MEANING_NOT_COMPARED).toBe('Not word for word, and the meaning has not been compared yet.');
  });
  it('model ran and was not sure: MODEL_UNSURE, never MEANING_NOT_COMPARED', () => {
    const r = judge(paraphrase, { text: BLOOM, check: confirmed }, passage, { entails: 0.5, neutral: 0.45, contradicts: 0.05 });
    expect(r.label).toBe('reported');
    expect(r.reasons).toContain('MODEL_UNSURE');
    expect(r.reasons).not.toContain('MEANING_NOT_COMPARED');
  });
  it('word for word needs neither', () => {
    const r = judge('Home working led to a 13% performance increase.', { text: BLOOM, check: confirmed }, rankSentences(BLOOM, 'Home working led to a 13% performance increase.')[0]!.text, null);
    expect(r).toMatchObject({ label: 'verified', reasons: [], wordForWord: true });
    expect(r.checks.wordForWord).toBe(true);
  });
  it('the checks keep all three model scores', () => {
    const r = judge(paraphrase, { text: BLOOM, check: confirmed }, passage, { entails: 0.95, neutral: 0.04, contradicts: 0.01 });
    expect(r.checks).toMatchObject({ support: 0.95, neutral: 0.04, contradiction: 0.01, wordForWord: false });
    expect(r.label).toBe('verified');
  });
  it('an older caller with two scores still works', () => {
    const r = judge(paraphrase, { text: BLOOM, check: confirmed }, passage, { entails: 0.95, contradicts: 0.01 });
    expect(r.label).toBe('verified');
    expect(r.checks.neutral).toBeNull();
  });
});

describe('a one-registry source keeps the checker’s own reason', () => {
  const claim = 'Home working led to a 13% performance increase.';
  const p = rankSentences(BLOOM, claim)[0]!.text;
  it.each<[ReasonCode[], ReasonCode]>([
    [['SECOND_REGISTRY_NO_RECORD'], 'SECOND_REGISTRY_NO_RECORD'],
    [['REGISTRY_METADATA_DISAGREES'], 'REGISTRY_METADATA_DISAGREES'],
    [['SECOND_REGISTRY_UNREACHABLE'], 'SECOND_REGISTRY_UNREACHABLE'],
    [[], 'SECOND_REGISTRY_UNREACHABLE'],
  ])('%j gives %s', (given, want) => {
    const r = judge(claim, { text: BLOOM, check: { ...confirmed, verdict: 'one-registry', reasons: given } }, p, null);
    expect(r.label).toBe('reported');
    expect(r.reasons).toEqual([want]);
  });
  it('other verdicts are unchanged', () => {
    expect(judge(claim, { text: BLOOM, check: { ...confirmed, verdict: 'retracted', reasons: ['RETRACTED'] } }, p).reasons).toEqual(['RETRACTED']);
    expect(judge(claim, { text: BLOOM, check: { ...confirmed, verdict: 'not-found', reasons: [] } }, p).reasons).toEqual(['NO_MATCH_IN_REGISTRIES']);
  });
});

describe('number words are found wherever they stand', () => {
  it.each([
    ['Telecommuting staff delivered thirteen percent higher output', [[13, '%']]],
    ['it rose by thirteen percent', [[13, '%']]],
    ['a rise of twenty-five per cent', [[25, '%']]],
    ['twenty five percent of staff', [[25, '%']]],
  ])('%s', (t, want) => expect(numbers(t).map((n) => [n.value, n.unit])).toEqual(want));
  it('so a spelled-out number is checked against the source', () => {
    const r = judge('Telecommuting staff delivered thirty percent higher output', { text: BLOOM, check: confirmed }, rankSentences(BLOOM, 'Home working led to a 13% performance increase.')[0]!.text, { entails: 0.99, contradicts: 0.001 });
    expect(r.checks.numbers).toBe(false);
    expect(r.label).not.toBe('verified');
  });
});
