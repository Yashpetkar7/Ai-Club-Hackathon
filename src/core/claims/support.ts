import type { Support } from './label';

/** The page side of the on-device model. Nothing loads until the student asks, and Cancel really stops it. */
export const SUPPORT_MODEL = 'nli-deberta-v3-xsmall';
export const SUPPORT_MB = 100;

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

export function loadSupport(): void {
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
        set({ status: 'failed', why: 'The model did not load. Everything else still works.' });
      }
    }
  };
  worker.onerror = () => {
    drop('stopped');
    set({ status: 'failed', why: 'The model stopped. Everything else still works.' });
  };
  worker.postMessage({ type: 'load' });
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
