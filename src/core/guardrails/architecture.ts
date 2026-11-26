import { SUPPORT_MB, SUPPORT_MODEL } from '@/core/claims/support';
import { MEANING_MB, MEANING_MODEL, MEANING_REVISION } from '@/core/semantic/models';
import { AGENTS, type AgentId } from '@/policy/policy';

/**
 * What runs where, read from code constants. Two values exist only on the server, so this page keeps a copy
 * and tests/unit/guardrails.test.ts reads the server files and fails when a copy drifts.
 */

/** Copy of ALLOW in server/handlers/registry.mjs. */
export const PROXY_HOSTS = ['api.crossref.org', 'api.openalex.org', 'api.datacite.org', 'doi.org'] as const;

/** Copy of MIN_LEVEL in server/handlers/ai.mjs. */
export const SERVER_MIN_LEVEL = { plan: 1, read: 2, challenge: 3, explain: 2 } as const;
export type AiTaskName = keyof typeof SERVER_MIN_LEVEL;

/** Copy of AGENT in src/core/aiClient.ts: which house-rules agent each server task is. */
export const TASK_AGENT: Record<AiTaskName, AgentId> = { plan: 'planner', read: 'reader', challenge: 'challenger', explain: 'explainer' };

export const TASK_WORDS: Record<AiTaskName, string> = {
  plan: 'Suggests search phrases for your question',
  read: 'Points at passages in sources you kept',
  challenge: 'Suggests one search for the other side of a claim',
  explain: 'Explains a claim’s label in plain words, from the checks’ own values',
};

export interface TaskRow { task: AiTaskName; agent: string; does: string; server: number; page: number | null; agree: boolean }
/** Each AI task with the level the server demands and the level the page's house rules demand. */
export function taskRows(): TaskRow[] {
  return (Object.keys(SERVER_MIN_LEVEL) as AiTaskName[]).map((task) => {
    const agent = AGENTS.find((a) => a.id === TASK_AGENT[task]);
    const page = agent ? agent.minLevel : null;
    return { task, agent: agent?.name ?? TASK_AGENT[task], does: TASK_WORDS[task], server: SERVER_MIN_LEVEL[task], page, agree: page === SERVER_MIN_LEVEL[task] };
  });
}

/** Copy of MODEL in src/core/claims/support.worker.ts. The worker loads it without a pinned revision. */
export const SUPPORT_REPO = `Xenova/${SUPPORT_MODEL}`;

export interface Licence {
  /** Confirmed only when a licence was found for these exact files. */
  confirmed: boolean;
  short: string;
  text: string;
  /** Where it was looked up. */
  checked: { label: string; url: string }[];
}
export interface ModelFacts {
  key: 'support' | 'meaning';
  name: string;
  repo: string;
  /** null when the code loads the newest files instead of a pinned revision. */
  revision: string | null;
  mb: number;
  licence: Licence;
}

/** When the licences below were looked up, with curl, from the Hugging Face API and the model cards. */
export const LICENCES_CHECKED_ON = '26 November 2026';

export const MODELS: readonly ModelFacts[] = [
  {
    key: 'support',
    name: 'Support model',
    repo: SUPPORT_REPO,
    revision: null,
    mb: SUPPORT_MB,
    licence: {
      confirmed: false,
      short: 'Not confirmed',
      text: 'This ONNX conversion gives no licence: its Hugging Face metadata has no licence field and its card names none. It names cross-encoder/nli-deberta-v3-xsmall as its base, which is listed as Apache 2.0; that model is built on microsoft/deberta-v3-xsmall, listed as MIT.',
      checked: [
        { label: 'Xenova/nli-deberta-v3-xsmall on Hugging Face', url: 'https://huggingface.co/Xenova/nli-deberta-v3-xsmall' },
        { label: 'Base model: cross-encoder/nli-deberta-v3-xsmall', url: 'https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall' },
        { label: 'Its base: microsoft/deberta-v3-xsmall', url: 'https://huggingface.co/microsoft/deberta-v3-xsmall' },
      ],
    },
  },
  {
    key: 'meaning',
    name: 'Meaning model',
    repo: MEANING_MODEL,
    revision: MEANING_REVISION,
    mb: MEANING_MB,
    licence: {
      confirmed: true,
      short: 'Apache 2.0',
      text: 'The model card at the pinned revision says Arctic is licensed under Apache 2.0. The Hugging Face metadata itself has no licence field.',
      checked: [{ label: 'Model card at the pinned revision', url: `https://huggingface.co/${MEANING_MODEL}/blob/${MEANING_REVISION}/README.md` }],
    },
  },
];

export type AiKey = 'yes' | 'no' | 'no-server';
/** Asks this site's own server whether it holds an AI key. It never sends or receives the key. */
export async function askAiKey(f: typeof fetch = fetch): Promise<AiKey> {
  try {
    const r = await f('/api/health', { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return 'no-server';
    const j = (await r.json().catch(() => null)) as { ok?: unknown; ai?: unknown } | null;
    if (j?.ok !== true) return 'no-server';
    return j.ai === true ? 'yes' : 'no';
  } catch {
    return 'no-server';
  }
}
