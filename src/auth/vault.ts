import type { PaperTrailDb } from '@/store/db';

/**
 * Passphrase handling and encryption. Web Crypto only, nothing home-made.
 * The passphrase is stretched with PBKDF2-SHA-256. Half of the result proves who you are, the other half is the AES-256-GCM key.
 * Neither the passphrase nor the key is ever written down in readable form, and neither leaves this device.
 */
export const ITERATIONS = 600_000;
const TABLES = ['projects', 'sources', 'claims', 'log', 'drafts'] as const;

export const b64 = (b: ArrayBuffer | Uint8Array): string => {
  let s = '';
  for (const x of b instanceof Uint8Array ? b : new Uint8Array(b)) s += String.fromCharCode(x);
  return btoa(s);
};
export const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface Secret { proof: string; key: CryptoKey }

export async function stretch(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations = ITERATIONS): Promise<Secret> {
  if (!globalThis.crypto?.subtle) throw new Error('Accounts need a secure address (https, or this computer). Continue as guest instead.');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 512));
  const proof = b64(await crypto.subtle.digest('SHA-256', bits.slice(0, 32)));
  // Not extractable: scripts can use this key while you are signed in, and cannot read it out.
  const key = await crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { proof, key };
}

/** Compares without stopping early, so timing says nothing about how much matched. */
export function same(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

export interface Sealed { iv: string; data: string }

export async function seal(key: CryptoKey, text: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), data: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))) };
}

/** Throws when the key is wrong or a single byte was changed. */
export async function open(key: CryptoKey, s: Sealed): Promise<string> {
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, key, unb64(s.data)));
}

export type Dump = Record<(typeof TABLES)[number], unknown[]>;

export async function dump(d: PaperTrailDb): Promise<Dump> {
  const out = {} as Dump;
  await d.transaction('r', TABLES.map((t) => d[t]), async () => {
    for (const t of TABLES) out[t] = await d[t].toArray();
  });
  return out;
}

const isDump = (v: unknown): v is Dump => !!v && typeof v === 'object' && TABLES.every((t) => Array.isArray((v as Dump)[t]) && (v as Dump)[t].every((r) => !!r && typeof r === 'object'));

/** Replaces what is there. All or nothing. */
export async function restore(d: PaperTrailDb, v: unknown): Promise<void> {
  if (!isDump(v)) throw new Error('This is not a Paper Trail library.');
  await d.transaction('rw', TABLES.map((t) => d[t]), async () => {
    for (const t of TABLES) {
      await d[t].clear();
      await (d[t] as { bulkAdd(rows: unknown[]): Promise<unknown> }).bulkAdd(v[t]);
    }
  });
}

/** A backup file that opens only with its passphrase, on any laptop. */
export interface Backup { kind: 'paper-trail-backup'; version: 1; salt: string; iterations: number; sealed: Sealed }

export async function makeBackup(d: PaperTrailDb, passphrase: string): Promise<Backup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { key } = await stretch(passphrase, salt);
  return { kind: 'paper-trail-backup', version: 1, salt: b64(salt), iterations: ITERATIONS, sealed: await seal(key, JSON.stringify(await dump(d))) };
}

export async function readBackup(text: string, passphrase: string): Promise<Dump> {
  let v: Backup;
  try {
    v = JSON.parse(text) as Backup;
  } catch {
    throw new Error('This is not a Paper Trail backup file.');
  }
  if (v?.kind !== 'paper-trail-backup' || v.version !== 1 || typeof v.salt !== 'string' || typeof v.sealed?.data !== 'string' || !(v.iterations >= 100_000 && v.iterations <= 2_000_000)) throw new Error('This is not a Paper Trail backup file.');
  const { key } = await stretch(passphrase, unb64(v.salt), v.iterations);
  let plain: string;
  try {
    plain = await open(key, v.sealed);
  } catch {
    throw new Error('That passphrase does not open this file, or the file was changed.');
  }
  const d: unknown = JSON.parse(plain);
  if (!isDump(d)) throw new Error('This is not a Paper Trail library.');
  return d;
}
