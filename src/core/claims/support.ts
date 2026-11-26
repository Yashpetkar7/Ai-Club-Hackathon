import { listen, nextId, release, send, start, stop, type HostMessage } from './host';
import type { Support } from './label';

/** The page side of the on-device support model. Nothing loads until the student asks, and Cancel really stops it. */
export const SUPPORT_MODELS = {
  original: { id: 'Xenova/nli-deberta-v3-xsmall', local: false, label: 'nli-deberta-v3-xsmall', mb: 100 },
  scifact: { id: 'paper-trail-nli-scifact', local: true, label: 'nli-deberta-v3-xsmall fine-tuned on SciFact', mb: 90 },
} as const;
export type SupportModelKey = keyof typeof SUPPORT_MODELS;

/** The model this site runs, and why. Changed only when a new model beats the old one on held-out data AND on our claim sets. */
export const SUPPORT: { key: SupportModelKey; label: string; why: string } = {
  key: 'scifact',
  label: SUPPORT_MODELS.scifact.label,
  why: 'On held-out SciFact it was right more often (81% against 64%) and made far fewer wrong calls (3 against 12 wrong “supports”, 11 against 165 wrong “contradicts”), at the cost of finding slightly fewer real supports. On our own claim sets in Chrome both models let 0 of 80 false claims through and Verified 21 of 24 true ones. If this site cannot serve it, the original model loads instead.',
};
export const SUPPORT_MODEL = SUPPORT_MODELS[SUPPORT.key].label;
export const SUPPORT_MB = SUPPORT_MODELS[SUPPORT.key].mb;

export type SupportState = { status: 'off' } | { status: 'loading'; loaded: number; total: number } | { status: 'ready' } | { status: 'failed'; why: string };

let state: SupportState = { status: 'off' };
const waiting = new Map<number, { ok: (s: Support) => void; no: (e: Error) => void }>();
const listeners = new Set<() => void>();
let wired = false;

const set = (s: SupportState): void => {
  state = s;
  for (const l of listeners) l();
};
export const supportState = (): SupportState => state;
export function onSupport(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function fail(why: string): void {
  for (const w of waiting.values()) w.no(new Error(why));
  waiting.clear();
}

function heard(m: HostMessage): void {
  if (m.type === 'progress' && state.status === 'loading') set({ status: 'loading', loaded: m.loaded, total: m.total });
  else if (m.type === 'ready' && state.status === 'loading') set({ status: 'ready' });
  else if (m.type === 'score') {
    waiting.get(m.id)?.ok({ entails: m.entails, neutral: m.neutral, contradicts: m.contradicts });
    waiting.delete(m.id);
  } else if (m.type === 'error') {
    if (m.id !== undefined) {
      waiting.get(m.id)?.no(new Error(m.message));
      waiting.delete(m.id);
    } else if (state.status === 'loading') {
      fail('not loaded');
      release('nli');
      // Our own model is served by this site. If the host does not have it, use the original instead of failing.
      if (loading !== 'original') {
        set({ status: 'off' });
        loadSupport('original');
      } else set({ status: 'failed', why: navigator.onLine === false ? 'You are offline, and the model is not saved in this browser yet. Everything else still works.' : 'The model did not load. Everything else still works.' });
    }
  } else if (m.type === 'crashed') {
    fail('stopped');
    if (state.status !== 'off') set({ status: 'failed', why: 'The model stopped. Everything else still works.' });
  } else if (m.type === 'stopped') {
    fail('stopped');
    const was = state.status;
    set({ status: 'off' });
    // The meaning model's download was cancelled, which closed the shared worker. Ours comes back from the browser's cache.
    if (m.by !== 'nli' && (was === 'ready' || was === 'loading')) loadSupport(loading);
  }
}

let loading: SupportModelKey = SUPPORT.key;
/** The model that actually loaded, for the evidence log. */
export const supportModelLabel = (): string => SUPPORT_MODELS[loading].label;

export function loadSupport(model: SupportModelKey = SUPPORT.key): void {
  if (state.status === 'loading' || state.status === 'ready') return;
  loading = model;
  if (!wired) {
    wired = true;
    listen(heard);
  }
  if (!start('nli')) {
    set({ status: 'failed', why: 'This browser cannot run the model.' });
    return;
  }
  set({ status: 'loading', loaded: 0, total: 0 });
  send({ type: 'load', model: SUPPORT_MODELS[model].id, local: SUPPORT_MODELS[model].local, base: import.meta.env.BASE_URL });
}

export function cancelSupport(): void {
  const was = state.status;
  fail('cancelled');
  set({ status: 'off' });
  if (was === 'loading') stop('nli');
  else if (was === 'ready') release('nli');
}

/** Scores one sentence. Never a whole abstract, because a long text hides a wrong detail. */
export function scoreSupport(premise: string, hypothesis: string, ms = 20_000): Promise<Support> {
  if (state.status !== 'ready') return Promise.reject(new Error('The model is not loaded.'));
  const id = nextId();
  return new Promise((ok, no) => {
    const t = setTimeout(() => {
      waiting.delete(id);
      no(new Error('The model took too long.'));
    }, ms);
    waiting.set(id, {
      ok: (s) => {
        clearTimeout(t);
        ok(s);
      },
      no: (e) => {
        clearTimeout(t);
        no(e);
      },
    });
    if (!send({ type: 'score', id, premise, hypothesis })) {
      waiting.get(id)?.no(new Error('The model is not loaded.'));
      waiting.delete(id);
    }
  });
}

/** Scores a few sentences for one claim, one after another. A sentence that fails gets null, the rest still count. */
export async function scoreSupportMany(premises: string[], hypothesis: string, ms = 20_000): Promise<(Support | null)[]> {
  const out: (Support | null)[] = [];
  for (const p of premises) out.push(await scoreSupport(p, hypothesis, ms).catch(() => null));
  return out;
}
