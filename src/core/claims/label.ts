import type { ClaimChecks, ClaimLabel, ReasonCode, Source } from '@/core/contracts';
import { findInstructions } from '@/core/pdf/injection';
import { POLICY } from '@/policy/policy';
import { findQuote, quotesExactly } from './quote';
import { coverage, runGuards, type Guard } from './guards';

/** Scores from the on-device model for this claim against this sentence. Null when it has not run. */
export interface Support { entails: number; contradicts: number }

export interface Judged { label: ClaimLabel; reasons: ReasonCode[]; checks: ClaimChecks; wordForWord: boolean }

const asCheck = (g: Guard): boolean | null => (g === 'none' ? null : g === 'ok');
const EMPTY: ClaimChecks = { exactQuote: false, support: null, contradiction: null, numbers: null, direction: null, scope: null };

/**
 * The only place a claim gets a label. When checks disagree or cannot run, the weaker label wins.
 * Verified needs all of: a source two registries confirmed, the sentence exactly in that source, support
 * (word for word, or the model above the threshold), and every guard passing.
 */
export function judge(claim: string, source: Pick<Source, 'check' | 'text'> | undefined, passage: string | undefined, support: Support | null = null, t = POLICY.thresholds): Judged {
  const reasons = new Set<ReasonCode>();
  const done = (label: ClaimLabel, checks: ClaimChecks = EMPTY, wordForWord = false): Judged => ({ label, reasons: [...reasons], checks, wordForWord });

  if (!source) {
    reasons.add('NO_SOURCE');
    return done('ai-reasoning');
  }
  if (!source.text?.trim()) {
    reasons.add('NO_READABLE_TEXT');
    return done('reported');
  }
  if (!passage) {
    reasons.add('QUOTE_NOT_IN_SOURCE');
    return done('reported');
  }
  const inSource = findQuote(passage, source.text);
  if (!inSource) {
    reasons.add('QUOTE_NOT_IN_SOURCE');
    return done('reported');
  }
  const hit = quotesExactly(claim, passage);
  const g = runGuards(claim, passage);
  const said = !!hit && !g.framed;
  const checks: ClaimChecks = {
    exactQuote: true,
    support: support?.entails ?? null,
    contradiction: support?.contradicts ?? null,
    numbers: asCheck(g.numbers),
    direction: g.negation === 'conflict' || g.direction === 'conflict' ? false : asCheck(g.direction === 'none' ? g.negation : g.direction),
    scope: asCheck(g.scope),
  };

  if (findInstructions(passage).length) {
    reasons.add('INSTRUCTION_IN_SOURCE');
    return done('reported', checks);
  }
  // Conflicts first. A number only counts as a conflict when the sentence is about the same thing.
  const close = coverage(claim, passage) >= 0.5;
  if (g.numbers === 'conflict') reasons.add('NUMBER_MISMATCH');
  if (g.direction === 'conflict' || g.negation === 'conflict') reasons.add('DIRECTION_FLIPPED');
  if (support && support.contradicts >= t.contradiction) reasons.add('CONTRADICTED_BY_SOURCE');
  if (g.scope === 'conflict') reasons.add('SCOPE_OVERCLAIM');
  if (reasons.has('CONTRADICTED_BY_SOURCE') || (close && (reasons.has('NUMBER_MISMATCH') || reasons.has('DIRECTION_FLIPPED')))) return done('disputed', checks, said);
  if (reasons.size) return done('reported', checks, said);

  if (g.numbers === 'missing') reasons.add('NUMBER_MISMATCH');
  if (g.scope === 'missing') reasons.add('SCOPE_OVERCLAIM');
  if (g.framed) reasons.add('SCOPE_OVERCLAIM');
  const backed = said || (!!support && support.entails >= t.supportVerified);
  // Word for word settles direction. Otherwise an unclear direction or negation is not enough.
  if (!said && (g.direction === 'missing' || g.negation === 'missing')) reasons.add('MODEL_UNSURE');
  if (!backed) reasons.add('MODEL_UNSURE');
  if (source.check?.verdict !== 'confirmed') reasons.add(source.check?.verdict === 'one-registry' ? 'SECOND_REGISTRY_UNREACHABLE' : source.check?.verdict === 'retracted' ? 'RETRACTED' : 'NO_MATCH_IN_REGISTRIES');
  return done(reasons.size ? 'reported' : 'verified', checks, said);
}
