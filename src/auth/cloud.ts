import { useSyncExternalStore } from 'react';
import { b64, open, unb64, type Sealed } from './vault';

/**
 * Talks to our own server about one thing: keeping a locked copy of the library.
 * What leaves here is a proof of the passphrase and bytes already encrypted on this device. Never the key, never the passphrase.
 */
export interface Packed extends Sealed { z: 0 | 1 }

export type SaveState =
  | { at: 'none' } // guest, or nobody
  | { at: 'device'; why?: string } // an account that is only on this device
  | { at: 'saving' }
  | { at: 'saved'; when: string }
  | { at: 'offline' }
  | { at: 'conflict'; rev: number; when: string }
  | { at: 'changed' } // the passphrase was changed on another computer
  | { at: 'toobig' };

let state: SaveState = { at: 'none' };
const listeners = new Set<() => void>();
export const setSave = (s: SaveState): void => {
  state = s;
  for (const l of listeners) l();
};
export const saveState = (): SaveState => state;
export const useSave = (): SaveState =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    saveState,
    saveState,
  );

const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = (s: string): Promise<ArrayBuffer> => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));

/** The server knows an account by this, not by its name. */
export const cloudId = async (handle: string): Promise<string> => hex(await sha(`paper-trail-account|${handle}`));
/** Not the proof kept on this device, so one cannot stand in for the other. */
export const serverProof = async (proof: string): Promise<string> => b64(await sha(`paper-trail-server|${proof}`));

let able: boolean | null = null;
/** Whether this copy of the site has a server that can save. A "no" is asked again next time. */
export async function canSave(): Promise<boolean> {
  if (able) return true;
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
    able = r.ok && ((await r.json()) as { saves?: boolean }).saves === true;
  } catch {
    able = false;
  }
  return able;
}
export const forgetServer = (): void => {
  able = null;
};

export interface Answer { status: number; rev?: number; updated?: string; sealed?: Packed; salt?: string; iterations?: number; reason?: string }

/** Status 0 means the server did not answer. */
export async function ask(task: string, body: object, ms = 20_000): Promise<Answer> {
  try {
    const r = await fetch(`/api/vault/${task}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
    const j = (await r.json().catch(() => ({}))) as Omit<Answer, 'status'>;
    return { ...j, status: r.status };
  } catch {
    return { status: 0 };
  }
}

const through = async (bytes: Uint8Array<ArrayBuffer>, t: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> => new Uint8Array(await new Response(new Response(bytes).body!.pipeThrough(t as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)).arrayBuffer());

/** Squeezed, then locked with AES-256-GCM. */
export async function pack(key: CryptoKey, text: string): Promise<Packed> {
  const plain = new TextEncoder().encode(text);
  const z = typeof CompressionStream === 'undefined' ? 0 : 1;
  const bytes = z ? await through(plain, new CompressionStream('gzip')) : plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), data: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)), z };
}

/** Throws when the key is wrong or a byte was changed. */
export async function unpack(key: CryptoKey, p: Packed): Promise<string> {
  if (!p.z) return open(key, p);
  const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv) }, key, unb64(p.data)));
  return new TextDecoder().decode(await through(bytes, new DecompressionStream('gzip')));
}
