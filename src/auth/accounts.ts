import Dexie, { type EntityTable } from 'dexie';
import { useSyncExternalStore } from 'react';
import { GUEST_DB, libraryName, newId, PaperTrailDb, switchLibrary, db } from '@/store/db';
import { b64, dump, ITERATIONS, open, restore, same, seal, stretch, unb64, type Sealed } from './vault';

/**
 * Accounts on this device. There is no server holding names or passwords, so there is nothing to leak.
 * Signing out encrypts the library with your passphrase and removes the readable copy.
 */
interface Account {
  id: string;
  name: string;
  /** Lower-case name, so "Yash" and "yash" are one account. */
  handle: string;
  salt: string;
  iterations: number;
  proof: string;
  createdAt: string;
  fails: number;
  lockedUntil: number;
  vault?: Sealed;
}
interface SessionRow { id: 'now'; accountId: string; key: CryptoKey; seenAt: number }

class AccountsDb extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  session!: EntityTable<SessionRow, 'id'>;
  constructor() {
    super('paper-trail-accounts');
    this.version(1).stores({ accounts: 'id, &handle', session: 'id' });
  }
}
export const accountsDb = new AccountsDb();

export const MIN_PASSPHRASE = 10;
const MAX_FAILS = 5;
const LOCK_MS = 60_000;
export const IDLE_MS = 2 * 60 * 60 * 1000;
const GUEST_KEY = 'pt-session';

export type Session = { kind: 'loading' } | { kind: 'none' } | { kind: 'guest' } | { kind: 'account'; id: string; name: string; since: string };
let session: Session = { kind: 'loading' };
const listeners = new Set<() => void>();
function set(s: Session): void {
  session = s;
  for (const l of listeners) l();
}
export const currentSession = (): Session => session;
export const useSession = (): Session =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    currentSession,
    currentSession,
  );

const guestFlag = (v?: 'guest' | null): string | null => {
  try {
    if (v === null) localStorage.removeItem(GUEST_KEY);
    else if (v) localStorage.setItem(GUEST_KEY, v);
    return localStorage.getItem(GUEST_KEY);
  } catch {
    return null;
  }
};

const asSession = (a: Account): Session => ({ kind: 'account', id: a.id, name: a.name, since: a.createdAt });

/** Runs once when the site opens. */
export async function resume(): Promise<void> {
  try {
    const row = await accountsDb.session.get('now');
    const acc = row && (await accountsDb.accounts.get(row.accountId));
    if (row && acc) {
      switchLibrary(acc.id);
      if (Date.now() - row.seenAt > IDLE_MS) await signOut();
      else {
        await accountsDb.session.update('now', { seenAt: Date.now() });
        set(asSession(acc));
      }
      return;
    }
  } catch {
    /* storage is blocked: the site still works for checking */
  }
  set(guestFlag() === 'guest' ? { kind: 'guest' } : { kind: 'none' });
}

let seen = 0;
/** Called on activity. Writes at most once a minute. */
export function touch(): void {
  if (session.kind !== 'account' || Date.now() - seen < 60_000) return;
  seen = Date.now();
  void accountsDb.session.update('now', { seenAt: seen });
}

export function continueAsGuest(): void {
  switchLibrary(null);
  guestFlag('guest');
  set({ kind: 'guest' });
}

const handleOf = (name: string): string => name.normalize('NFKC').trim().toLowerCase();

export function signUpProblems(name: string, pass: string, again: string): string[] {
  const out: string[] = [];
  const n = name.trim();
  if (n.length < 2 || n.length > 40) out.push('Choose a name of 2 to 40 characters.');
  if (pass.length < MIN_PASSPHRASE) out.push(`Use a passphrase of at least ${MIN_PASSPHRASE} characters. Three or four words work well.`);
  else if (/^(.)\1+$/.test(pass) || /^(password|passphrase|1234567890|qwertyuiop)/i.test(pass)) out.push('That passphrase is too easy to guess.');
  else if (n && pass.toLowerCase().includes(handleOf(n)) && handleOf(n).length > 3) out.push('Do not put your name in the passphrase.');
  if (pass !== again) out.push('The two passphrases are different.');
  return out;
}

export async function guestHasWork(): Promise<boolean> {
  if (!(await Dexie.exists(GUEST_DB))) return false;
  const g = new PaperTrailDb(GUEST_DB);
  const n = await g.projects.count().catch(() => 0);
  g.close();
  return n > 0;
}

export async function signUp(name: string, pass: string, again: string, bringGuestWork = false): Promise<void> {
  const bad = signUpProblems(name, pass, again);
  if (bad.length) throw new Error(bad[0]);
  if (await accountsDb.accounts.where('handle').equals(handleOf(name)).first()) throw new Error('That name is taken on this device. Sign in, or choose another.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { proof, key } = await stretch(pass, salt);
  const acc: Account = { id: newId(), name: name.trim(), handle: handleOf(name), salt: b64(salt), iterations: ITERATIONS, proof, createdAt: new Date().toISOString(), fails: 0, lockedUntil: 0 };
  await accountsDb.accounts.add(acc);
  if (bringGuestWork && (await guestHasWork())) {
    const g = new PaperTrailDb(GUEST_DB);
    const copy = await dump(g);
    const mine = new PaperTrailDb(libraryName(acc.id));
    await restore(mine, copy);
    mine.close();
    // Only once the copy is safely in the new library.
    await Promise.all([g.projects.clear(), g.sources.clear(), g.claims.clear(), g.log.clear(), g.drafts.clear()]);
    g.close();
  }
  await enter(acc, key);
}

async function enter(acc: Account, key: CryptoKey): Promise<void> {
  await accountsDb.session.put({ id: 'now', accountId: acc.id, key, seenAt: Date.now() });
  guestFlag(null);
  switchLibrary(acc.id);
  set(asSession(acc));
}

/** The same answer for a wrong name and a wrong passphrase. */
const NO = 'That name and passphrase do not match an account on this device.';

async function check(acc: Account | undefined, pass: string): Promise<CryptoKey> {
  if (!acc) {
    // Spend the same time as a real check, so the answer does not reveal which names exist.
    await stretch(pass, new Uint8Array(16));
    throw new Error(NO);
  }
  const wait = acc.lockedUntil - Date.now();
  if (wait > 0) throw new Error(`Too many wrong tries. Wait ${Math.ceil(wait / 1000)} seconds.`);
  const s = await stretch(pass, unb64(acc.salt), acc.iterations);
  if (!same(s.proof, acc.proof)) {
    const fails = acc.fails + 1;
    await accountsDb.accounts.update(acc.id, fails >= MAX_FAILS ? { fails: 0, lockedUntil: Date.now() + LOCK_MS } : { fails });
    throw new Error(fails >= MAX_FAILS ? `Too many wrong tries. Wait ${LOCK_MS / 1000} seconds.` : NO);
  }
  if (acc.fails) await accountsDb.accounts.update(acc.id, { fails: 0, lockedUntil: 0 });
  return s.key;
}

export async function signIn(name: string, pass: string): Promise<void> {
  const acc = await accountsDb.accounts.where('handle').equals(handleOf(name)).first();
  const key = await check(acc, pass);
  if (acc!.vault) {
    const text = await open(key, acc!.vault);
    const d = new PaperTrailDb(libraryName(acc!.id));
    // A readable copy is only there when the tab closed before sign-out. It is newer, so it wins.
    if ((await d.projects.count()) + (await d.log.count()) === 0) await restore(d, JSON.parse(text));
    d.close();
  }
  await enter(acc!, key);
}

/** Encrypts the library, proves the copy opens, then removes the readable one. */
export async function signOut(): Promise<void> {
  const row = await accountsDb.session.get('now');
  if (row) {
    const before = session;
    // Open pages close first, so a half-typed draft is saved before the library is locked.
    set({ kind: 'loading' });
    await new Promise((r) => setTimeout(r, 30));
    try {
      await lock(row);
    } catch (e) {
      set(before);
      throw e;
    }
  }
  guestFlag(null);
  switchLibrary(null);
  set({ kind: 'none' });
}

async function lock(row: SessionRow): Promise<void> {
  const lib = new PaperTrailDb(libraryName(row.accountId));
  const text = JSON.stringify(await dump(lib));
  const sealed = await seal(row.key, text);
  if ((await open(row.key, sealed)) !== text) throw new Error('The library could not be locked, so nothing was removed. You are still signed in.');
  await accountsDb.accounts.update(row.accountId, { vault: sealed });
  lib.close();
  db.close();
  await Dexie.delete(libraryName(row.accountId));
  await accountsDb.session.delete('now');
}

async function me(): Promise<Account> {
  if (session.kind !== 'account') throw new Error('Sign in first.');
  const acc = await accountsDb.accounts.get(session.id);
  if (!acc) throw new Error('This account no longer exists.');
  return acc;
}

export async function changePassphrase(old: string, pass: string, again: string): Promise<void> {
  const acc = await me();
  await check(acc, old);
  const bad = signUpProblems(acc.name, pass, again);
  if (bad.length) throw new Error(bad[0]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { proof, key } = await stretch(pass, salt);
  // Any older locked copy used the old key, so it goes. The open library is the current one.
  await accountsDb.transaction('rw', accountsDb.accounts, accountsDb.session, async () => {
    const { vault: _old, ...rest } = acc;
    await accountsDb.accounts.put({ ...rest, salt: b64(salt), iterations: ITERATIONS, proof });
    await accountsDb.session.put({ id: 'now', accountId: acc.id, key, seenAt: Date.now() });
  });
}

/** Removes the account and everything in it. Asks for the passphrase again. */
export async function deleteAccount(pass: string): Promise<void> {
  const acc = await me();
  await check(acc, pass);
  db.close();
  await Dexie.delete(libraryName(acc.id));
  await accountsDb.session.delete('now');
  await accountsDb.accounts.delete(acc.id);
  switchLibrary(null);
  set({ kind: 'none' });
}

export const accountNames = async (): Promise<string[]> => (await accountsDb.accounts.toArray()).map((a) => a.name);
