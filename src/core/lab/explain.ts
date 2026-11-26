import { z } from 'zod';
import type { ClaimLabel } from '@/core/contracts';
import type { Judged, Support } from '@/core/claims/label';
import { POLICY } from '@/policy/policy';

/**
 * Page side of the "explain" AI task. judge() has already made the label; this only builds what the AI may see
 * and checks its answer. The same rules run on the server (server/handlers/explain.mjs), and
 * tests/unit/explain-label.test.ts keeps the two in step.
 */
export interface ExplainInput {
  claim: string;
  sentence: string;
  label: ClaimLabel;
  reasons: string[];
  checks: { inSource: boolean; wordForWord: boolean; numbers: boolean | null; direction: boolean | null; scope: boolean | null };
  /** Whole percentages from the on-device support model; null when it has not run. */
  scores: { support: number | null; neutral: number | null; contradiction: number | null };
  /** The policy lines, as whole percentages, so the AI can say which side of a line a score is on. */
  lines: { support: number; contradiction: number };
}

const whole = (x: number | null | undefined): number | null => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) : null);

export function explainInput(claim: string, sentence: string, judged: Judged, support: Support | null): ExplainInput {
  return {
    claim: claim.trim(),
    sentence,
    label: judged.label,
    reasons: [...judged.reasons],
    checks: { inSource: judged.checks.exactQuote, wordForWord: judged.wordForWord, numbers: judged.checks.numbers, direction: judged.checks.direction, scope: judged.checks.scope },
    scores: { support: whole(support?.entails), neutral: whole(support?.neutral), contradiction: whole(support?.contradicts) },
    lines: { support: whole(POLICY.thresholds.supportVerified)!, contradiction: whole(POLICY.thresholds.contradiction)! },
  };
}

export const MAX_CHARS = 500;
export const MAX_SENTENCES = 3;
const OTHER_LABEL: Partial<Record<ClaimLabel, RegExp>> = { verified: /\bverified\b/i, reported: /\breported\b/i, disputed: /\bdisputed\b/i, 'ai-reasoning': /\bai[\s-]+reasoning\b/i };
const REFERENCE = /\b10\.\d{4,9}\/|\bdoi:|https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|org|net|edu|gov|io|ac)\b|\bet\s+al\b/i;
const numbersIn = (s: string): string[] => (s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
const sentenceCount = (t: string): number => t.split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length;

export interface ExplainFacts {
  claim: string;
  sentence: string;
  label: ClaimLabel;
  numbers: number[];
}

/** The cleaned explanation, or null when it breaks a rule. Mirrors checkExplanation() in server/handlers/explain.mjs. */
export function checkExplanation(text: unknown, facts: ExplainFacts): string | null {
  if (typeof text !== 'string') return null;
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t || t.length > MAX_CHARS || sentenceCount(t) > MAX_SENTENCES) return null;
  if (REFERENCE.test(t)) return null;
  const allowed = new Set([...numbersIn(facts.claim), ...numbersIn(facts.sentence), ...facts.numbers.map((n) => String(n))]);
  if (numbersIn(t).some((n) => !allowed.has(n))) return null;
  for (const [id, re] of Object.entries(OTHER_LABEL)) if (id !== facts.label && re.test(t)) return null;
  return t;
}

export const factsOf = (i: ExplainInput): ExplainFacts => ({
  claim: i.claim,
  sentence: i.sentence,
  label: i.label,
  numbers: [i.scores.support, i.scores.neutral, i.scores.contradiction, i.lines.support, i.lines.contradiction].filter((n): n is number => n !== null),
});

/** The zod shape askAi() checks the answer against, for this one input. */
export const explanationShape = (input: ExplainInput) => {
  const facts = factsOf(input);
  return z
    .object({ explanation: z.string() })
    .refine((d) => checkExplanation(d.explanation, facts) !== null)
    .transform((d) => ({ explanation: checkExplanation(d.explanation, facts)! }));
};
