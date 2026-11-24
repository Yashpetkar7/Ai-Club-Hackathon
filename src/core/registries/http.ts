/**
 * One polite HTTP client for every registry: spaced out, cached, retried on 429,
 * through our own server when it is running and direct when it is not (static hosting).
 */
export class RegistryError extends Error {}

const cache = new Map<string, unknown>();
const MISSING = Symbol('missing');

interface Lane {
  gap: number;
  next: number;
}
const lanes: Record<string, Lane> = {
  'crossref-search': { gap: 1050, next: 0 },
  crossref: { gap: 230, next: 0 },
  openalex: { gap: 120, next: 0 },
  other: { gap: 120, next: 0 },
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function takeTurn(lane: keyof typeof lanes | string): Promise<void> {
  const l = lanes[lane] ?? lanes.other!;
  const now = Date.now();
  const at = Math.max(now, l.next);
  l.next = at + l.gap;
  if (at > now) await sleep(at - now);
}

let proxy: Promise<boolean> | null = null;
/** True when our own server answers. Asked once per page load. */
export function hasServer(): Promise<boolean> {
  proxy ??= fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    .then(async (r) => r.ok && (await r.json()).ok === true)
    .catch(() => false);
  return proxy;
}

async function once(url: string): Promise<Response> {
  if (await hasServer()) {
    const viaServer = await fetch(`/api/registry?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(15000) });
    if (viaServer.status !== 502 && viaServer.status !== 403) return viaServer;
  }
  return fetch(url, { signal: AbortSignal.timeout(12000) });
}

/** A registry that says "come back in three hours" is believed, so the next search falls back at once. */
const closedUntil = new Map<string, number>();
const bucketOf = (url: string, lane: string): string => (/[?&]search=/.test(url) ? `${lane}:search` : lane);
export const resetClosed = (): void => closedUntil.clear();

/** Returns the JSON body, or null when the registry says the thing does not exist (404 or 410). */
export async function getJson<T>(url: string, lane: string): Promise<T | null> {
  if (cache.has(url)) {
    const v = cache.get(url);
    return v === MISSING ? null : (v as T);
  }
  const bucket = bucketOf(url, lane);
  if ((closedUntil.get(bucket) ?? 0) > Date.now()) throw new RegistryError('its free daily limit is used up');
  let last = 'no answer';
  for (let attempt = 0; attempt < 3; attempt++) {
    await takeTurn(lane);
    try {
      const res = await once(url);
      if (res.status === 404 || res.status === 410) {
        cache.set(url, MISSING);
        return null;
      }
      if (res.ok) {
        const body = (await res.json()) as T;
        cache.set(url, body);
        return body;
      }
      last = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
      const wait = Number(res.headers.get('retry-after')) || 0;
      if (res.status === 429 && wait > 20) {
        closedUntil.set(bucket, Date.now() + Math.min(wait, 6 * 3600) * 1000);
        throw new RegistryError('its free daily limit is used up');
      }
      await sleep(Math.min(8000, (Number(res.headers.get('retry-after')) || 1.2 * (attempt + 1)) * 1000));
    } catch (e) {
      if (e instanceof RegistryError) throw e;
      last = e instanceof Error && e.name === 'TimeoutError' ? 'timed out' : 'network error';
      await sleep(500 * (attempt + 1));
    }
  }
  throw new RegistryError(last);
}
