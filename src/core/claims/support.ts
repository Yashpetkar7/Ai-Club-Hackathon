import { listen, nextId, release, send, start, stop, type HostMessage } from './host';
import type { Support } from './label';

/** The page side of the on-device model. Nothing loads until the student asks, and Cancel really stops it. */
export const SUPPORT_MODEL = 'nli-deberta-v3-xsmall';
export const SUPPORT_MB = 100;

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
      set({ status: 'failed', why: navigator.onLine === false ? 'You are offline, and the model is not saved in this browser yet. Everything else still works.' : 'The model did not load. Everything else still works.' });
    }
  } else if (m.type === 'crashed') {
    fail('stopped');
    if (state.status !== 'off') set({ status: 'failed', why: 'The model stopped. Everything else still works.' });
  } else if (m.type === 'stopped') {
    fail('stopped');
    const was = state.status;
    set({ status: 'off' });
    // The meaning model's download was cancelled, which closed the shared worker. Ours comes back from the browser's cache.
    if (m.by !== 'nli' && (was === 'ready' || was === 'loading')) loadSupport();
  }
}

export function loadSupport(): void {
  if (state.status === 'loading' || state.status === 'ready') return;
  if (!wired) {
    wired = true;
    listen(heard);
  }
  if (!start('nli')) {
    set({ status: 'failed', why: 'This browser cannot run the model.' });
    return;
  }
  set({ status: 'loading', loaded: 0, total: 0 });
  send({ type: 'load' });
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
