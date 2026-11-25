import Dexie, { liveQuery, type EntityTable, type Subscription } from 'dexie';
import { useSyncExternalStore } from 'react';
import { GUEST_DB, libraryName, newId, PaperTrailDb, switchLibrary, db } from '@/store/db';
import { ask, canSave, cloudId, pack, saveState, serverProof, setSave, unpack } from './cloud';
import { b64, dump, ITERATIONS, open, restore, same, seal, stretch, unb64, type Sealed } from './vault';

/**
 * Accounts. The library is worked on in this browser. When the site has a server, a copy locked with the passphrase is
 * kept there, so the same account opens on another computer. The server never sees a name, a passphrase or a key.
 * Signing out locks the library on this device too and removes the readable copy.
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
  /** Revision of the copy on the server that this device last had. Missing when the account is only on this device. */
  cloudRev?: number;
  /** Work on this device that the server does not have yet. */
  dirty?: boolean;
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
        void watch(acc.id, row.key);
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

const EMPTY = JSON.stringify({ projects: [], sources: [], claims: [], log: [], drafts: [] });

export async function signUp(name: string, pass: string, again: string, bringGuestWork = false): Promise<void> {
  const bad = signUpProblems(name, pass, again);
  if (bad.length) throw new Error(bad[0]);
  if (await accountsDb.accounts.where('handle').equals(handleOf(name)).first()) throw new Error('That name is taken on this device. Sign in, or choose another.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { proof, key } = await stretch(pass, salt);
  const acc: Account = { id: newId(), name: name.trim(), handle: handleOf(name), salt: b64(salt), iterations: ITERATIONS, proof, createdAt: new Date().toISOString(), fails: 0, lockedUntil: 0 };
  if (await canSave()) {
    const r = await ask('create', { id: await cloudId(acc.handle), salt: acc.salt, iterations: acc.iterations, proof: await serverProof(proof), sealed: await pack(key, EMPTY) });
    if (r.status === 409) throw new Error('That name is taken. Choose another, or sign in if it is yours.');
    if (r.status === 201 && r.rev) acc.cloudRev = r.rev;
  }
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
  void watch(acc.id, key);
}

/** The same answer for a wrong name and a wrong passphrase. */
const NO = 'That name and passphrase do not match an account.';

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
  const handle = handleOf(name);
  const acc = await accountsDb.accounts.where('handle').equals(handle).first();
  let key: CryptoKey;
  try {
    key = await check(acc, pass);
  } catch (e) {
    // Not here, or the passphrase was changed on another computer: the server may know it.
    if (await signInFromServer(name, pass, acc)) return;
    throw e;
  }
  if (acc!.vault) {
    const text = await open(key, acc!.vault);
    const d = new PaperTrailDb(libraryName(acc!.id));
    // A readable copy is only there when the tab closed before sign-out. It is newer, so it wins.
    if ((await d.projects.count()) + (await d.log.count()) === 0) await restore(d, JSON.parse(text));
    d.close();
  }
  await catchUp(acc!, key);
  await enter((await accountsDb.accounts.get(acc!.id))!, key);
}

/** Opens an account that this device does not have, or has with an older passphrase. */
async function signInFromServer(name: string, pass: string, old: Account | undefined): Promise<boolean> {
  if (!(await canSave())) return false;
  const handle = handleOf(name);
  const id = await cloudId(handle);
  const p = await ask('start', { id });
  if (p.status !== 200 || !p.salt || !p.iterations) return false;
  const { proof, key } = await stretch(pass, unb64(p.salt), p.iterations);
  const r = await ask('open', { id, proof: await serverProof(proof) });
  if (r.status === 429) throw new Error('Too many wrong tries. Wait a minute.');
  if (r.status !== 200 || !r.sealed || !r.rev) return false;
  const text = await unpack(key, r.sealed);
  const acc: Account = { id: old?.id ?? newId(), name: old?.name ?? name.trim(), handle, salt: p.salt, iterations: p.iterations, proof, createdAt: old?.createdAt ?? new Date().toISOString(), fails: 0, lockedUntil: 0, cloudRev: r.rev, dirty: false };
  const d = new PaperTrailDb(libraryName(acc.id));
  await restore(d, JSON.parse(text));
  d.close();
  await accountsDb.accounts.put(acc);
  await enter(acc, key);
  return true;
}

/** After the passphrase is right on this device: fetch newer work, or put this account on the server for the first time. */
async function catchUp(acc: Account, key: CryptoKey): Promise<void> {
  if (!(await canSave())) return;
  const id = await cloudId(acc.handle);
  const proof = await serverProof(acc.proof);
  if (acc.cloudRev === undefined) {
    await link(acc, key);
    return;
  }
  const r = await ask('open', { id, proof });
  if (r.status !== 200 || !r.rev || !r.sealed) return;
  const d = new PaperTrailDb(libraryName(acc.id));
  const empty = (await d.projects.count()) + (await d.log.count()) === 0;
  // This device has nothing new, so the newer copy can simply take its place. A browser that lost its storage has nothing new either.
  if (!acc.dirty && (r.rev > acc.cloudRev || empty)) {
    await restore(d, JSON.parse(await unpack(key, r.sealed)));
    await accountsDb.accounts.update(acc.id, { cloudRev: r.rev, dirty: false });
  }
  d.close();
}

async function link(acc: Account, key: CryptoKey): Promise<'linked' | 'taken' | 'silent'> {
  const lib = new PaperTrailDb(libraryName(acc.id));
  const sealed = await pack(key, JSON.stringify(await dump(lib)));
  lib.close();
  const r = await ask('create', { id: await cloudId(acc.handle), salt: acc.salt, iterations: acc.iterations, proof: await serverProof(acc.proof), sealed });
  if (r.status === 201 && r.rev) {
    await accountsDb.accounts.update(acc.id, { cloudRev: r.rev, dirty: false });
    return 'linked';
  }
  return r.status === 409 ? 'taken' : 'silent';
}

/* ---- saving as you work ---- */
let sub: Subscription | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let working: { id: string; key: CryptoKey } | null = null;
let busy: Promise<void> | null = null;
let quietUntil = 0;

/** Watches the open library and saves a locked copy shortly after each change. */
async function watch(id: string, key: CryptoKey): Promise<void> {
  unwatch();
  working = { id, key };
  const acc = await accountsDb.accounts.get(id);
  if (working?.id !== id || !acc) return;
  const server = await canSave();
  if (working?.id !== id) return;
  if (acc.cloudRev === undefined) {
    setSave({ at: 'device', ...(server ? { why: 'not online yet' } : { why: 'no server' }) });
    return;
  }
  setSave(server ? { at: 'saving' } : { at: 'offline' });
  let first = true;
  // Every change writes to the log, except typing in a draft.
  sub = liveQuery(async () => {
    const lib = db;
    if (lib.name !== libraryName(id)) return 'closed';
    const last = await lib.log.orderBy('seq').last();
    const drafts = await lib.drafts.toArray();
    return `${last?.seq ?? 0}|${drafts.map((d) => d.updatedAt).join()}|${await lib.sources.count()}|${await lib.claims.count()}|${await lib.projects.count()}`;
  }).subscribe({
    next: (v) => {
      if (working?.id !== id || v === 'closed') return;
      if (first) {
        first = false;
        void saveNow(false);
        return;
      }
      if (Date.now() < quietUntil) return;
      void accountsDb.accounts.update(id, { dirty: true });
      if (saveState().at !== 'conflict' && saveState().at !== 'changed') setSave({ at: 'saving' });
      clearTimeout(timer);
      timer = setTimeout(() => void saveNow(), 2500);
    },
    error: () => undefined,
  });
}
function unwatch(): void {
  sub?.unsubscribe();
  sub = null;
  clearTimeout(timer);
  working = null;
  setSave({ at: 'none' });
}
if (typeof window !== 'undefined') window.addEventListener('online', () => void saveNow());

/** Saves now. With `force` off, only checks that this device has the newest copy. */
export async function saveNow(force = true): Promise<void> {
  while (busy) await busy;
  const w = working;
  if (!w) return;
  busy = save(w, force).finally(() => {
    busy = null;
  });
  return busy;
}

async function save(w: { id: string; key: CryptoKey }, force: boolean): Promise<void> {
  const acc = await accountsDb.accounts.get(w.id);
  if (!acc || acc.cloudRev === undefined) return;
  const retry = () => {
    setSave({ at: 'offline' });
    clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), 20_000);
  };
  const id = await cloudId(acc.handle);
  const proof = await serverProof(acc.proof);
  if (!force && !acc.dirty) {
    const r = await ask('open', { id, proof, wantData: false });
    if (working?.id !== w.id) return;
    if (r.status === 200 && r.rev) {
      if (r.rev === acc.cloudRev) setSave({ at: 'saved', when: r.updated ?? '' });
      else {
        setSave({ at: 'conflict', rev: r.rev, when: r.updated ?? '' });
        // This device has nothing new, so there is nothing to choose between.
        if (!(await accountsDb.accounts.get(w.id))?.dirty) await takeServerCopy(w).catch(() => undefined);
      }
    } else if (r.status === 401) setSave({ at: 'changed' });
    else retry();
    return;
  }
  const lib = db;
  if (lib.name !== libraryName(w.id) || working?.id !== w.id) return;
  setSave({ at: 'saving' });
  const text = JSON.stringify(await dump(lib));
  const mark = (await lib.log.orderBy('seq').last())?.seq ?? 0;
  const typed = (await lib.drafts.toArray()).map((d) => d.updatedAt).join();
  const sealed = await pack(w.key, text);
  if (sealed.data.length > 7_500_000) {
    setSave({ at: 'toobig' });
    return;
  }
  let r = await ask('save', { baseRev: acc.cloudRev, sealed });
  if (r.status === 401) {
    // The session on the server ran out. The proof on this device opens a new one.
    const again = await ask('open', { id, proof, wantData: false });
    if (again.status === 401) {
      if (working?.id === w.id) setSave({ at: 'changed' });
      return;
    }
    r = await ask('save', { baseRev: acc.cloudRev, sealed });
  }
  if (r.status === 200 && r.rev) {
    const here = working?.id === w.id && db === lib;
    const now = here ? ((await lib.log.orderBy('seq').last())?.seq ?? 0) : mark;
    const nowTyped = here ? (await lib.drafts.toArray()).map((d) => d.updatedAt).join() : typed;
    await accountsDb.accounts.update(w.id, { cloudRev: r.rev, dirty: now !== mark || nowTyped !== typed });
    if (here) setSave({ at: 'saved', when: r.updated ?? new Date().toISOString() });
  } else if (r.status === 409 && r.rev) {
    await accountsDb.accounts.update(w.id, { dirty: true });
    if (working?.id === w.id) setSave({ at: 'conflict', rev: r.rev, when: r.updated ?? '' });
  } else if (working?.id === w.id) retry();
}

/** Two computers worked on the same account. The student chooses which work stays. */
export async function chooseCopy(which: 'server' | 'here'): Promise<void> {
  const w = working;
  const s = saveState();
  if (!w || s.at !== 'conflict') return;
  if (which === 'here') {
    await accountsDb.accounts.update(w.id, { cloudRev: s.rev, dirty: true });
    await saveNow();
    return;
  }
  await takeServerCopy(w);
}

/** Replaces the work on this device with the newer copy. The old work is only dropped once the new one has opened. */
async function takeServerCopy(w: { id: string; key: CryptoKey }): Promise<void> {
  const acc = await accountsDb.accounts.get(w.id);
  if (!acc) return;
  const r = await ask('open', { id: await cloudId(acc.handle), proof: await serverProof(acc.proof) });
  if (r.status !== 200 || !r.sealed || !r.rev) throw new Error('The server did not answer. Nothing was changed.');
  const text = await unpack(w.key, r.sealed);
  if (working?.id !== w.id) return;
  await restore(db, JSON.parse(text));
  await accountsDb.accounts.update(w.id, { cloudRev: r.rev, dirty: false });
  setSave({ at: 'saved', when: r.updated ?? '' });
  clearTimeout(timer);
  // The change we just made ourselves is not new work.
  quietUntil = Date.now() + 1500;
}

/** Puts an account that is only on this device on the server too. */
export async function putOnline(): Promise<void> {
  const row = await accountsDb.session.get('now');
  const acc = await me();
  if (!row) throw new Error('Sign in first.');
  if (!(await canSave())) throw new Error('This copy of the site has no server that can save. Your work stays on this device.');
  const r = await link(acc, row.key);
  if (r === 'taken') throw new Error('Someone already uses that name online. Make a new account with another name, and bring your work with a backup file.');
  if (r === 'silent') throw new Error('The server did not answer. Try again in a minute.');
  await watch(acc.id, row.key);
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
      // What is not on the server yet goes now. Without an answer it waits, locked, on this device.
      const acc = await accountsDb.accounts.get(row.accountId);
      if (working && acc?.cloudRev !== undefined && saveState().at !== 'conflict' && saveState().at !== 'changed') await Promise.race([saveNow(), new Promise((r) => setTimeout(r, 6000))]);
      unwatch();
      await lock(row);
      void ask('close', {}, 3000);
    } catch (e) {
      set(before);
      void watch(row.accountId, row.key);
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
  let cloudRev = acc.cloudRev;
  if (cloudRev !== undefined) {
    // The server first. If it does not agree, nothing changes anywhere.
    while (busy) await busy;
    const r = await ask('rekey', { id: await cloudId(acc.handle), proof: await serverProof(acc.proof), salt: b64(salt), iterations: ITERATIONS, newProof: await serverProof(proof), baseRev: (await accountsDb.accounts.get(acc.id))?.cloudRev ?? cloudRev, sealed: await pack(key, JSON.stringify(await dump(db))) });
    if (r.status === 409) throw new Error('Another computer saved newer work. Choose which work to keep first, then change your passphrase.');
    if (r.status !== 200 || !r.rev) throw new Error('The server did not answer, so your passphrase was not changed. Try again in a minute.');
    cloudRev = r.rev;
  }
  // Any older locked copy used the old key, so it goes. The open library is the current one.
  await accountsDb.transaction('rw', accountsDb.accounts, accountsDb.session, async () => {
    const { vault: _old, ...rest } = acc;
    await accountsDb.accounts.put({ ...rest, salt: b64(salt), iterations: ITERATIONS, proof, dirty: false, ...(cloudRev !== undefined ? { cloudRev } : {}) });
    await accountsDb.session.put({ id: 'now', accountId: acc.id, key, seenAt: Date.now() });
  });
  await watch(acc.id, key);
}

/** Removes the account and everything in it. Asks for the passphrase again. */
export async function deleteAccount(pass: string): Promise<void> {
  const acc = await me();
  await check(acc, pass);
  if (acc.cloudRev !== undefined) {
    const r = await ask('delete', { id: await cloudId(acc.handle), proof: await serverProof(acc.proof) });
    // 401 means it is already gone there, or belongs to a newer passphrase we do not have.
    if (r.status !== 200 && r.status !== 401) throw new Error('The server did not answer, so nothing was deleted. Try again in a minute.');
  }
  unwatch();
  db.close();
  await Dexie.delete(libraryName(acc.id));
  await accountsDb.session.delete('now');
  await accountsDb.accounts.delete(acc.id);
  switchLibrary(null);
  set({ kind: 'none' });
}

export const accountNames = async (): Promise<string[]> => (await accountsDb.accounts.toArray()).map((a) => a.name);
