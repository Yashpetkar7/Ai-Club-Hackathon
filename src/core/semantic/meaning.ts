import { listen, nextId, release, send, start, stop, type HostMessage } from '@/core/claims/host';
import { MEANING_FILE, QUERY_PREFIX } from './models';
import type { Embed } from './rank';

/**
 * The page side of the meaning model. It turns sentences into vectors on this device so they can be put
 * in order by meaning. Nothing loads until the student turns it on, and the claim is never sent anywhere.
 */
export type MeaningState = { status: 'off' } | { status: 'loading'; loaded: number; total: number } | { status: 'ready' } | { status: 'failed'; why: string };

let state: MeaningState = { status: 'off' };
const waiting = new Map<number, { ok: (v: Float32Array[]) => void; no: (e: Error) => void }>();
const listeners = new Set<() => void>();
let wired = false;

const set = (s: MeaningState): void => {
  state = s;
  for (const l of listeners) l();
};
export const meaningState = (): MeaningState => state;
export function onMeaning(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function fail(why: string): void {
  for (const w of waiting.values()) w.no(new Error(why));
  waiting.clear();
}

/** Vectors already made in this tab, keyed by a hash of the text. Lost on reload; never saved. */
const cache = new Map<string, Float32Array>();
const CACHE_MAX = 6000;

/** cyrb53: a fast 53-bit string hash. Enough to tell sentences apart in one tab; not for security. */
export function textHash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const keyOf = (text: string, kind: 'query' | 'passage'): string => `${kind[0]}${text.length}:${textHash(text)}`;

function heard(m: HostMessage): void {
  if (m.type === 'embed-progress' && state.status === 'loading') set({ status: 'loading', loaded: m.loaded, total: m.total });
  else if (m.type === 'embed-ready' && state.status === 'loading') set({ status: 'ready' });
  else if (m.type === 'embedded') {
    const w = waiting.get(m.id);
    waiting.delete(m.id);
    if (!w) return;
    const data = m.data as Float32Array;
    const dims = Number(m.dims) || 1;
    w.ok(Array.from({ length: Math.floor(data.length / dims) }, (_, i) => data.subarray(i * dims, (i + 1) * dims)));
  } else if (m.type === 'error' && m.id !== undefined && waiting.has(m.id)) {
    waiting.get(m.id)!.no(new Error(m.message));
    waiting.delete(m.id);
  } else if (m.type === 'embed-error' && state.status === 'loading') {
    fail('not loaded');
    release('embed');
    set({ status: 'failed', why: navigator.onLine === false ? 'You are offline, and the meaning model is not saved in this browser yet. Finding by words still works.' : 'The meaning model did not load. Finding by words still works.' });
  } else if (m.type === 'crashed') {
    fail('stopped');
    if (state.status !== 'off') set({ status: 'failed', why: 'The meaning model stopped. Finding by words still works.' });
  } else if (m.type === 'stopped') {
    fail('stopped');
    const was = state.status;
    set({ status: 'off' });
    // The support model's download was cancelled, which closed the shared worker. Ours comes back from the browser's cache.
    if (m.by !== 'embed' && (was === 'ready' || was === 'loading')) loadMeaning();
  }
}

export function loadMeaning(): void {
  if (state.status === 'loading' || state.status === 'ready') return;
  if (!wired) {
    wired = true;
    listen(heard);
  }
  if (!start('embed')) {
    set({ status: 'failed', why: 'This browser cannot run the meaning model.' });
    return;
  }
  set({ status: 'loading', loaded: 0, total: 0 });
  send({ type: 'load-embed' });
}

/** Stops a download. It closes the shared worker, the only way to stop one. */
export function cancelMeaning(): void {
  const was = state.status;
  fail('cancelled');
  set({ status: 'off' });
  if (was === 'loading') stop('embed');
  else if (was === 'ready') release('embed');
}

/** Gives the memory back. The files stay saved in the browser, so turning it on again is quick. */
export function unloadMeaning(): void {
  cancelMeaning();
}

function ask(texts: string[], ms: number): Promise<Float32Array[]> {
  const id = nextId();
  return new Promise((ok, no) => {
    const t = setTimeout(() => {
      waiting.delete(id);
      no(new Error('The meaning model took too long.'));
    }, ms);
    waiting.set(id, {
      ok: (v) => {
        clearTimeout(t);
        ok(v);
      },
      no: (e) => {
        clearTimeout(t);
        no(e);
      },
    });
    if (!send({ type: 'embed', id, texts })) {
      waiting.get(id)?.no(new Error('The meaning model is not loaded.'));
      waiting.delete(id);
    }
  });
}

/**
 * Vectors for these texts, in the same order. A claim or question is 'query' and gets the model's search prefix;
 * source text is 'passage'. Texts seen before in this tab come from memory.
 */
export async function embed(texts: string[], kind: 'query' | 'passage'): Promise<Float32Array[]> {
  if (state.status !== 'ready') throw new Error('The meaning model is not loaded.');
  const keys = texts.map((t) => keyOf(t, kind));
  const got = new Map<string, Float32Array>();
  const queued = new Set<string>();
  keys.forEach((k, i) => {
    const v = cache.get(k);
    if (v) got.set(k, v);
    else queued.add(texts[i]!);
  });
  const missing = [...queued];
  for (let i = 0; i < missing.length; i += 32) {
    const chunk = missing.slice(i, i + 32);
    const vectors = await ask(chunk.map((t) => (kind === 'query' ? QUERY_PREFIX + t : t)), 30_000 + chunk.length * 500);
    chunk.forEach((t, k) => {
      const v = vectors[k];
      if (!v) return;
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(keyOf(t, kind), v);
      got.set(keyOf(t, kind), v);
    });
  }
  return keys.map((k) => {
    const v = got.get(k);
    if (!v) throw new Error('The meaning model returned too few vectors.');
    return v;
  });
}

/** For hybridRank. */
export const embedder: Embed = embed;

/** True when the model's main file is already in the browser's cache, so turning it on downloads nothing. */
export async function meaningSaved(): Promise<boolean> {
  try {
    return typeof caches !== 'undefined' && !!(await caches.match(MEANING_FILE));
  } catch {
    return false;
  }
}

/** For tests only. */
export const clearMeaningCache = (): void => cache.clear();
