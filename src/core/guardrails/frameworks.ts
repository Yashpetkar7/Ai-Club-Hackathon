import { POLICY } from '@/policy/policy';

/**
 * Our own mapping of Paper Trail's controls to three published frameworks. Not a certification, audit or
 * compliance claim. Every title and link below was opened with curl on 26 November 2026; only entries whose
 * titles were confirmed are used.
 */

export interface FrameworkLink { id: string; title: string; url: string }

/** NIST AI RMF 1.0. Its core has four functions. NIST's AI RMF page says version 1.0 is being revised. */
export const NIST = {
  name: 'NIST AI Risk Management Framework (AI RMF 1.0)',
  core: 'https://airc.nist.gov/airmf-resources/airmf/5-sec-core/',
  home: 'https://www.nist.gov/itl/ai-risk-management-framework',
  revision: 'NIST’s AI RMF page says AI RMF 1.0 is being revised.',
} as const;
export type NistFunction = 'Govern' | 'Map' | 'Measure' | 'Manage';

const owasp = (id: string, title: string, slug: string): FrameworkLink => ({ id, title, url: `https://genai.owasp.org/llmrisk/${slug}/` });
/** OWASP Top 10 for LLM Applications 2025: only the entries this page maps to. */
export const OWASP = {
  name: 'OWASP Top 10 for LLM Applications 2025',
  home: 'https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/',
  LLM01: owasp('LLM01', 'Prompt Injection', 'llm01-prompt-injection'),
  LLM02: owasp('LLM02', 'Sensitive Information Disclosure', 'llm022025-sensitive-information-disclosure'),
  LLM03: owasp('LLM03', 'Supply Chain', 'llm032025-supply-chain'),
  LLM05: owasp('LLM05', 'Improper Output Handling', 'llm052025-improper-output-handling'),
  LLM06: owasp('LLM06', 'Excessive Agency', 'llm062025-excessive-agency'),
  LLM09: owasp('LLM09', 'Misinformation', 'llm092025-misinformation'),
  LLM10: owasp('LLM10', 'Unbounded Consumption', 'llm102025-unbounded-consumption'),
} as const;

/** UNESCO (2023). Title and year confirmed in Crossref (DOI 10.54675/EWZM9535); the two themes are in its published summary. */
export const UNESCO = {
  name: 'UNESCO (2023), Guidance for generative AI in education and research',
  home: 'https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research',
  agency: 'Protecting human agency',
  validate: 'Institutions validating AI tools for education',
} as const;

export interface MappingRow {
  control: string;
  /** Where to see it work on this page or in the product. */
  evidence: string;
  nist: NistFunction[];
  owasp: FrameworkLink[];
  unesco: string[];
}

export const MAPPING: readonly MappingRow[] = [
  {
    control: 'Text from sources is data. Detected instructions are rejected, and the AI gateway runs only fixed tasks: there is no open prompt.',
    evidence: 'Source instructions, above',
    nist: ['Manage'],
    owasp: [OWASP.LLM01],
    unesco: [],
  },
  {
    control: 'Code checks every AI answer before it is used: a reference or link in a search phrase is dropped, and an explanation with a number or label the checks did not give is rejected.',
    evidence: 'AI holds no key, above',
    nist: ['Measure', 'Manage'],
    owasp: [OWASP.LLM05, OWASP.LLM09],
    unesco: [],
  },
  {
    control: 'AI holds no key. The student declares the AI level, the server refuses tasks above it, and every source and claim waits for the student.',
    evidence: 'AI level checked by the server; Export without approval, above',
    nist: ['Govern', 'Manage'],
    owasp: [OWASP.LLM06],
    unesco: [UNESCO.agency],
  },
  {
    control: 'Verdicts and labels come from plain code with two registries. Could not check stays apart from Not found, and green only means proven.',
    evidence: 'Unconfirmed identity, A failed lookup and Wrong claim, above',
    nist: ['Measure'],
    owasp: [OWASP.LLM09],
    unesco: [],
  },
  {
    control: 'The library is worked on in the browser and locked before any copy is saved. Only the selected input of a pressed AI button goes to an AI service.',
    evidence: 'House rules: What leaves this device',
    nist: ['Govern', 'Map'],
    owasp: [OWASP.LLM02],
    unesco: [],
  },
  {
    control: 'Every on-device model is named with where its files come from, its size and its licence status. The support model ships with the site, so its files change only with the code. The meaning model is pinned to one revision; the fallback support model is not, and this page says so.',
    evidence: 'What runs where, above',
    nist: ['Govern', 'Map'],
    owasp: [OWASP.LLM03],
    unesco: [],
  },
  {
    control: `AI calls are capped at ${POLICY.maxAiCallsPerProject} per project, the server limits requests from each network and the size of each prompt, and the registry proxy is rate-limited and cached.`,
    evidence: 'Code: src/core/aiClient.ts, server/guard.mjs, server/handlers/ai.mjs',
    nist: ['Manage'],
    owasp: [OWASP.LLM10],
    unesco: [],
  },
  {
    control: 'The Integrity Lab and this page test our own checks in public, with every miss listed, so a school can see what the tool gets wrong before relying on it.',
    evidence: 'Integrity Lab; this page',
    nist: ['Measure', 'Govern'],
    owasp: [OWASP.LLM09],
    unesco: [UNESCO.validate],
  },
  {
    control: 'A hash-chained evidence log and an AI-use statement written from it. The student answers for what is handed in; the school decides what is misconduct.',
    evidence: 'Changed evidence log, above; House rules: Who is accountable',
    nist: ['Govern'],
    owasp: [],
    unesco: [UNESCO.agency],
  },
];

/** Every outside link this module uses, for the test that keeps them https and on the official sites. */
export const ALL_LINKS: readonly string[] = [NIST.core, NIST.home, OWASP.home, ...Object.values(OWASP).flatMap((v) => (typeof v === 'object' ? [v.url] : [])), UNESCO.home];
