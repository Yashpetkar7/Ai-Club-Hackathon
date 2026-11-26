import type { Support } from './label';

/** The page side of the on-device model. Nothing loads until the student asks, and Cancel really stops it. */
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

let worker: Worker | null = null;
let state: SupportState = { status: 'off' };
let next = 1;
const waiting = new Map<number, { ok: (s: Support) => void; no: (e: Error) => void }>();
const listeners = new Set<() => void>();

const set = (s: SupportState): void => {
  state = s;
  for (const l of listeners) l();
};
export const supportState = (): SupportState => state;
export function onSupport(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function drop(why: string): void {
  for (const w of waiting.values()) w.no(new Error(why));
  waiting.clear();
  worker?.terminate();
  worker = null;
}

let loading: SupportModelKey = SUPPORT.key;
/** The model that actually loaded, for the evidence log. */
export const supportModelLabel = (): string => SUPPORT_MODELS[loading].label;

export function loadSupport(model: SupportModelKey = SUPPORT.key): void {
  loading = model;
  if (state.status === 'loading' || state.status === 'ready') return;
  try {
    worker = new Worker(new URL('./support.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    set({ status: 'failed', why: 'This browser cannot run the model.' });
    return;
  }
  set({ status: 'loading', loaded: 0, total: 0 });
  worker.onmessage = (e: MessageEvent<any>) => {
    const m = e.data;
    if (m.type === 'progress' && state.status === 'loading') set({ status: 'loading', loaded: m.loaded, total: m.total });
    else if (m.type === 'ready') set({ status: 'ready' });
    else if (m.type === 'score') {
      waiting.get(m.id)?.ok({ entails: m.entails, contradicts: m.contradicts });
      waiting.delete(m.id);
    } else if (m.type === 'error') {
      if (m.id !== undefined) {
        waiting.get(m.id)?.no(new Error(m.message));
        waiting.delete(m.id);
      } else {
        drop('not loaded');
        // Our own model is served by this site. If the host does not have it, use the original instead of failing.
        if (loading !== 'original') {
          set({ status: 'off' });
          loadSupport('original');
        } else set({ status: 'failed', why: 'The model did not load. Everything else still works.' });
      }
    }
  };
  worker.onerror = () => {
    drop('stopped');
    set({ status: 'failed', why: 'The model stopped. Everything else still works.' });
  };
  worker.postMessage({ type: 'load', model: SUPPORT_MODELS[model].id, local: SUPPORT_MODELS[model].local, base: import.meta.env.BASE_URL });
}

export function cancelSupport(): void {
  drop('cancelled');
  set({ status: 'off' });
}

/** Scores one sentence. Never a whole abstract, because a long text hides a wrong detail. */
export function scoreSupport(premise: string, hypothesis: string, ms = 20_000): Promise<Support> {
  if (!worker || state.status !== 'ready') return Promise.reject(new Error('The model is not loaded.'));
  const id = next++;
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
    worker!.postMessage({ type: 'score', id, premise, hypothesis });
  });
}
