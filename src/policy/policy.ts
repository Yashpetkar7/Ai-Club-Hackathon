import type { AiLevel, Policy } from '@/core/contracts';

/**
 * House rules as data. New requirements on 26 November usually land here first.
 * Everything in this file is shown to the student at #/rules.
 */
export const POLICY: Policy = {
  allowedTypes: ['journal-article', 'proceedings-article', 'book', 'book-chapter', 'posted-content', 'report', 'dissertation', 'monograph', 'web'],
  minYear: null,
  peerReviewedOnly: false,
  blockRetracted: true,
  flagConcerns: true,
  draftCheck: { copied: true, language: true },
  maxAiCallsPerProject: 40,
  overrideReasonMinChars: 12,
  thresholds: { titleMatch: 0.9, titlePossible: 0.75, yearTolerance: 1, supportVerified: 0.9, contradiction: 0.9 },
  styles: ['apa', 'harvard', 'mla', 'chicago', 'ieee'],
};

export type AgentId = 'planner' | 'scout' | 'checker' | 'analyst' | 'reader' | 'explainer' | 'quote-guard' | 'challenger' | 'reviewer' | 'clerk';

export interface AgentSpec {
  id: AgentId;
  name: string;
  kind: 'ai' | 'code';
  /** Lowest AI permission level at which this agent may run. Code agents are always allowed. */
  minLevel: AiLevel;
  does: string;
  cannot: string;
}

export const AGENTS: AgentSpec[] = [
  { id: 'planner', name: 'Planner', kind: 'ai', minLevel: 1, does: 'Turns your question into search terms.', cannot: 'See or write references.' },
  { id: 'scout', name: 'Scout', kind: 'code', minLevel: 0, does: 'Queries scholarly registries.', cannot: 'Generate text.' },
  { id: 'checker', name: 'Checker', kind: 'code', minLevel: 0, does: 'Compares every field and issues the verdict.', cannot: 'Be overruled by AI.' },
  { id: 'analyst', name: 'Analyst', kind: 'code', minLevel: 0, does: 'Sorts a paper\u2019s own sentences into aim, method, findings and limits.', cannot: 'Write a sentence of its own.' },
  { id: 'reader', name: 'Reader', kind: 'ai', minLevel: 2, does: 'Points at passages in sources you kept.', cannot: 'Return words that are not in the source.' },
  { id: 'explainer', name: 'Explainer', kind: 'ai', minLevel: 2, does: 'Explains in plain words why the checks gave a claim its label, from the checks’ own values.', cannot: 'Change a label, name a source, or use a number the checks did not give it. Code rejects any answer that does.' },
  { id: 'quote-guard', name: 'Quote guard', kind: 'code', minLevel: 0, does: 'Rejects any quote that is not an exact match.', cannot: 'Let a paraphrase through as a quote.' },
  { id: 'challenger', name: 'Challenger', kind: 'ai', minLevel: 3, does: 'Looks for evidence against you and flags overclaims.', cannot: 'Edit or delete your claims.' },
  { id: 'reviewer', name: 'Reviewer', kind: 'code', minLevel: 0, does: 'Reads the whole project, compares your draft with your sources, and lists what a marker could question.', cannot: 'Approve your work.' },
  { id: 'clerk', name: 'Clerk', kind: 'code', minLevel: 0, does: 'Formats references and writes the AI-use statement from the log.', cannot: 'Include anything missing a key.' },
];

export const AI_LEVELS: { level: AiLevel; name: string; means: string }[] = [
  { level: 0, name: 'No AI', means: 'Library, search and checking only. Every AI agent is locked.' },
  { level: 1, name: 'Find and check', means: 'AI may suggest search terms.' },
  { level: 2, name: 'Read and summarise', means: 'AI may also point at passages in sources you kept, and explain a claim’s label in plain words. The label stays the one the checks gave.' },
  { level: 3, name: 'Challenge my draft', means: 'AI may also argue against your claims. It still never writes your assignment.' },
];

export const agentAllowed = (id: AgentId, level: AiLevel): boolean => {
  const a = AGENTS.find((x) => x.id === id);
  return !!a && (a.kind === 'code' || level >= a.minLevel);
};
