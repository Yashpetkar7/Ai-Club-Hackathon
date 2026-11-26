// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { judge } from '@/core/claims/label';
import { CLAIM_TEXT } from '@/core/contracts';
import { checkExplanation as pageCheck, explainInput, explanationShape, factsOf, type ExplainFacts } from '@/core/lab/explain';
// @ts-expect-error plain JS so it also runs on Node without a build step
import { checkExplanation as serverCheck, explainTask, LABEL_NAMES } from '../../server/handlers/explain.mjs';

const claim = 'Home working led to a 13% performance increase.';
const sentence = 'Home working led to a 13% performance increase, of which 9% came from working more minutes.';
const facts: ExplainFacts = { claim, sentence, label: 'reported', numbers: [62, 4, 34, 90, 90] };

const CLEAN = [
  'Support from the on-device model is 62%, below the 90% line, so the label stays Reported, not checked.',
  'The numbers 13% and 9% come from the source sentence. The direction check passed. The scope check passed.',
  'The model was not sure this sentence backs your claim.',
];
const BAD: [string, string][] = [
  ['over 500 characters', `${'The support check was not sure about this sentence and your claim, '.repeat(8)}so it stays as it is.`],
  ['over 3 sentences', 'The numbers match. The direction matches. The scope matches. The model was not sure.'],
  ['a number not in the input', 'Support is 75%, below the 90% line.'],
  ['a year', 'A study from 2015 found this.'],
  ['a decimal score instead of a whole percentage', 'Support is 0.62, below the line.'],
  ['a DOI', 'See 10.1093/qje/qju032 for the sentence.'],
  ['a doi: prefix', 'The source is doi:qje.'],
  ['a URL', 'Read it at https://example.test/paper first.'],
  ['a bare web address', 'Read it on example.org first.'],
  ['et al.', 'The authors et al. reported this.'],
  ['another label: Verified', 'With more support this would be Verified.'],
  ['another label: Disputed', 'It is not Disputed because nothing contradicts it.'],
  ['another label: AI reasoning', 'This is not AI reasoning, because a source is attached.'],
  ['empty', '   '],
];

describe('explain answers: the server and the page apply the same rules', () => {
  it.each(CLEAN)('accepts a clean answer: %s', (text) => {
    expect(serverCheck(text, facts)).toBe(text);
    expect(pageCheck(text, facts)).toBe(text);
  });
  it.each(BAD)('rejects %s', (_, text) => {
    expect(serverCheck(text, facts)).toBeNull();
    expect(pageCheck(text, facts)).toBeNull();
  });
  it('may name the label it was given, and only that one', () => {
    const verified = { ...facts, label: 'verified' as const };
    const text = 'Your words appear in the source sentence, so the label is Verified.';
    expect(serverCheck(text, verified)).toBe(text);
    expect(pageCheck(text, verified)).toBe(text);
    expect(pageCheck(text, facts)).toBeNull();
    expect(serverCheck('It is Reported for now.', verified)).toBeNull();
  });
  it('the server knows the same label names the student sees', () => {
    expect(LABEL_NAMES).toEqual(Object.fromEntries(Object.entries(CLAIM_TEXT).map(([id, t]) => [id, t.label])));
  });
  it('rejects anything that is not a string', () => {
    for (const v of [null, 5, { explanation: 'x' }, ['x']]) {
      expect(serverCheck(v, facts)).toBeNull();
      expect(pageCheck(v, facts)).toBeNull();
    }
  });
});

describe('what the page sends for explain', () => {
  it('carries the label judge() made and the scores as whole percentages, and nothing else', () => {
    const source = { text: sentence, check: undefined };
    const judged = judge('Working from home increased performance by 13%.', source, sentence, { entails: 0.624, contradicts: 0.04, neutral: 0.336 });
    const input = explainInput('Working from home increased performance by 13%.', sentence, judged, { entails: 0.624, contradicts: 0.04, neutral: 0.336 });
    expect(input.label).toBe(judged.label);
    expect(input.reasons).toEqual(judged.reasons);
    expect(input.scores).toEqual({ support: 62, neutral: 34, contradiction: 4 });
    expect(input.lines).toEqual({ support: 90, contradiction: 90 });
    expect(Object.keys(input).sort()).toEqual(['checks', 'claim', 'label', 'lines', 'reasons', 'scores', 'sentence']);
    // The server reads the same input and allows the same numbers.
    const server = explainTask.input(input);
    expect(server.label).toBe(CLAIM_TEXT[judged.label].label);
    expect(explainTask.output({ explanation: 'Support is 62%, below the 90% line.' }, server)).toEqual({ explanation: 'Support is 62%, below the 90% line.' });
    expect(factsOf(input).numbers.sort((a, b) => a - b)).toEqual([4, 34, 62, 90, 90]);
  });
  it('the page-side zod check passes a clean answer and fails a bad one', () => {
    const judged = judge(claim, { text: sentence }, sentence, null);
    const shape = explanationShape(explainInput(claim, sentence, judged, null));
    expect(shape.safeParse({ explanation: '  Your words  appear in the source sentence.  ' })).toMatchObject({ success: true, data: { explanation: 'Your words appear in the source sentence.' } });
    expect(shape.safeParse({ explanation: 'Support is 99%.' }).success).toBe(false);
    expect(shape.safeParse({ text: 'no explanation field' }).success).toBe(false);
  });
});
