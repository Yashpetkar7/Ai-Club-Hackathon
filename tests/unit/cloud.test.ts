import Dexie from 'dexie';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountsDb, changePassphrase, chooseCopy, currentSession, deleteAccount, putOnline, saveNow, signIn, signOut, signUp } from '@/auth/accounts';
import { ask, forgetServer, pack, saveState, unpack } from '@/auth/cloud';
import { stretch } from '@/auth/vault';
import { createProject } from '@/store/actions';
import { db } from '@/store/db';
// @ts-expect-error plain JS so it also runs on Node without a build step
import { closeStore, openStore } from '../../server/store.mjs';
// @ts-expect-error plain JS
import { route } from '../../server/router.mjs';

/** The real client against the real server code, with a cookie jar for each computer. Passphrases are made up for these tests. */
const WORDS = 'test only four words';
const NEWER = 'test only newer words';
const dir = mkdtempSync(join(tmpdir(), 'pt-cloud-'));
let jar = '';
let up = true;
let net = 0;

beforeEach(async () => {
  net++;
  up = true;
  jar = '';
  vi.stubEnv('DATA_DIR', dir);
  closeStore();
  const store = await openStore(dir);
  expect(store).toBeTruthy();
  forgetServer();
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (!up) throw new TypeError('offline');
    const r: Response = await route(new Request(`http://localhost${url}`, { ...init, signal: null, headers: { ...(init.headers as Record<string, string>), 'x-forwarded-for': `10.1.0.${net}`, ...(jar ? { cookie: jar } : {}) } }));
    const set = r.headers.get('set-cookie');
    if (set) jar = set.startsWith('pt_sid=;') ? '' : set.split(';')[0]!;
    return r;
  });
});
afterEach(async () => {
  if (currentSession().kind === 'account') await signOut().catch(() => undefined);
  await new Promise((r) => setTimeout(r, 60));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => {
  closeStore();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** Another computer: nothing stored in the browser, no cookie. */
async function newComputer(): Promise<void> {
  if (currentSession().kind === 'account') await signOut();
  await new Promise((r) => setTimeout(r, 40));
  const names = await Dexie.getDatabaseNames();
  await accountsDb.accounts.clear();
  await accountsDb.session.clear();
  for (const n of names) if (n.startsWith('paper-trail-') && n !== 'paper-trail-accounts') await Dexie.delete(n);
  jar = '';
}
const until = async (f: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 200; i++) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`never: ${JSON.stringify(saveState())}`);
};
const questions = async () => (await db.projects.toArray()).map((p) => p.question).sort();

describe('an account that is saved online', () => {
  it('work made here opens on another computer', async () => {
    await signUp('Asha', WORDS, WORDS);
    await createProject('A question made on the first computer');
    await saveNow();
    expect(saveState().at).toBe('saved');
    await newComputer();
    await signIn('asha', WORDS);
    expect(await questions()).toEqual(['A question made on the first computer']);
    expect(currentSession()).toMatchObject({ kind: 'account', name: 'asha' });
  });

  it('a change is saved by itself a moment later', async () => {
    await signUp('Ben', WORDS, WORDS);
    await until(() => saveState().at === 'saved');
    await createProject('Saved without pressing anything');
    await until(() => saveState().at === 'saving');
    await until(() => saveState().at === 'saved');
    await newComputer();
    await signIn('Ben', WORDS);
    expect(await questions()).toEqual(['Saved without pressing anything']);
  });

  it('signing out sends what was not saved yet', async () => {
    await signUp('Cleo', WORDS, WORDS);
    await createProject('Typed just before leaving');
    await signOut();
    await newComputer();
    await signIn('Cleo', WORDS);
    expect(await questions()).toEqual(['Typed just before leaving']);
  });

  it('a wrong passphrase opens nothing, here or there', async () => {
    await signUp('Dina', WORDS, WORDS);
    await newComputer();
    await expect(signIn('Dina', NEWER)).rejects.toThrow('do not match');
    await expect(signIn('Nobody', WORDS)).rejects.toThrow('do not match');
    expect(currentSession().kind).not.toBe('account');
  });

  it('a name that is taken online is refused at sign-up, and nothing is stored', async () => {
    await signUp('Eli', WORDS, WORDS);
    await newComputer();
    await expect(signUp('eli', NEWER, NEWER)).rejects.toThrow('taken');
    expect(await accountsDb.accounts.count()).toBe(0);
  });

  it('the server keeps no name, no passphrase and no readable word', async () => {
    await signUp('Farouk Unusualname', WORDS, WORDS);
    await createProject('Zebrafish and the quiet harbour');
    await saveNow();
    closeStore();
    const all = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? all(join(d, f)) : [readFileSync(join(d, f), 'latin1')]));
    const disk = all(dir).join('\n').toLowerCase();
    for (const word of ['farouk', 'unusualname', 'zebrafish', 'harbour', WORDS]) expect(disk).not.toContain(word);
    await openStore(dir);
  });
});

describe('two computers', () => {
  it('newer work comes in when this one has nothing new', async () => {
    await signUp('Gita', WORDS, WORDS);
    await createProject('First');
    await signOut();
    const here = { accounts: await accountsDb.accounts.toArray() };
    await newComputer();
    await signIn('Gita', WORDS);
    await createProject('Second, from the other computer');
    await signOut();
    // Back at the first computer, as it was left.
    await newComputer();
    await accountsDb.accounts.bulkPut(here.accounts);
    await signIn('Gita', WORDS);
    expect(await questions()).toEqual(['First', 'Second, from the other computer']);
  });

  it('both changed: nothing is overwritten until the student chooses', async () => {
    await signUp('Hugo', WORDS, WORDS);
    await createProject('Shared');
    await saveNow();
    const acc = (await accountsDb.accounts.where('handle').equals('hugo').first())!;
    // The other computer saves something in between.
    const { id, proof } = await import('@/auth/cloud').then(async (c) => ({ id: await c.cloudId('hugo'), proof: await c.serverProof(acc.proof) }));
    const opened = await ask('open', { id, proof });
    const secret = await stretch(WORDS, Uint8Array.from(atob(acc.salt), (c) => c.charCodeAt(0)), acc.iterations);
    const theirs = JSON.parse(await unpack(secret.key, opened.sealed!));
    theirs.projects[0].question = 'Changed elsewhere';
    expect((await ask('save', { baseRev: opened.rev, sealed: await pack(secret.key, JSON.stringify(theirs)) })).status).toBe(200);

    await createProject('Changed here');
    await saveNow();
    expect(saveState().at).toBe('conflict');
    expect(await questions()).toEqual(['Changed here', 'Shared']);
    await chooseCopy('server');
    expect(await questions()).toEqual(['Changed elsewhere']);
    expect(saveState().at).toBe('saved');
  });

  it('keeping this device wins only when the student says so', async () => {
    await signUp('Ines', WORDS, WORDS);
    await createProject('Mine');
    await saveNow();
    const acc = (await accountsDb.accounts.where('handle').equals('ines').first())!;
    const c = await import('@/auth/cloud');
    const id = await c.cloudId('ines');
    const proof = await c.serverProof(acc.proof);
    const opened = await ask('open', { id, proof });
    await ask('save', { baseRev: opened.rev, sealed: opened.sealed! });
    await createProject('Also mine');
    await saveNow();
    expect(saveState().at).toBe('conflict');
    await chooseCopy('here');
    expect(saveState().at).toBe('saved');
    await newComputer();
    await signIn('Ines', WORDS);
    expect(await questions()).toEqual(['Also mine', 'Mine']);
  });

  it('a browser that lost its storage gets the work back instead of saving an empty library', async () => {
    await signUp('Jun', WORDS, WORDS);
    await createProject('Must not be lost');
    await signOut();
    const acc = (await accountsDb.accounts.where('handle').equals('jun').first())!;
    const { vault: _gone, ...rest } = acc;
    await accountsDb.accounts.put(rest);
    await signIn('Jun', WORDS);
    expect(await questions()).toEqual(['Must not be lost']);
  });
});

describe('passphrase and deleting', () => {
  it('a changed passphrase works on another computer, and the old one does not', async () => {
    await signUp('Kofi', WORDS, WORDS);
    await createProject('Before the change');
    await changePassphrase(WORDS, NEWER, NEWER);
    await newComputer();
    await expect(signIn('Kofi', WORDS)).rejects.toThrow('do not match');
    await signIn('Kofi', NEWER);
    expect(await questions()).toEqual(['Before the change']);
  });

  it('a device that still has the old passphrase can sign in with the new one', async () => {
    await signUp('Lena', WORDS, WORDS);
    await createProject('Old device');
    await signOut();
    const old = await accountsDb.accounts.toArray();
    await newComputer();
    await signIn('Lena', WORDS);
    await changePassphrase(WORDS, NEWER, NEWER);
    await signOut();
    await newComputer();
    await accountsDb.accounts.bulkPut(old);
    await signIn('Lena', NEWER);
    expect(await questions()).toEqual(['Old device']);
  });

  it('without the server a passphrase is not half changed, and nothing is half deleted', async () => {
    await signUp('Mona', WORDS, WORDS);
    await createProject('Safe');
    await saveNow();
    up = false;
    await expect(changePassphrase(WORDS, NEWER, NEWER)).rejects.toThrow('not changed');
    await expect(deleteAccount(WORDS)).rejects.toThrow('nothing was deleted');
    up = true;
    await signOut();
    await signIn('Mona', WORDS);
    expect(await questions()).toEqual(['Safe']);
  });

  it('deleting removes it here and there', async () => {
    await signUp('Nour', WORDS, WORDS);
    await deleteAccount(WORDS);
    await expect(signIn('Nour', WORDS)).rejects.toThrow('do not match');
    await signUp('Nour', NEWER, NEWER);
  });
});

describe('no server, or a server that is down', () => {
  it('an account still works on the device, and goes online later', async () => {
    up = false;
    await signUp('Omar', WORDS, WORDS);
    await createProject('Made offline');
    await until(() => saveState().at === 'device');
    up = true;
    await putOnline();
    await saveNow();
    await newComputer();
    await signIn('Omar', WORDS);
    expect(await questions()).toEqual(['Made offline']);
  });

  it('work done while the server is down is saved when it is back', async () => {
    await signUp('Pia', WORDS, WORDS);
    await until(() => saveState().at === 'saved');
    up = false;
    await createProject('Written on the train');
    await saveNow();
    expect(saveState().at).toBe('offline');
    up = true;
    await saveNow();
    expect(saveState().at).toBe('saved');
    await newComputer();
    await signIn('Pia', WORDS);
    expect(await questions()).toEqual(['Written on the train']);
  });

  it('a session that ran out on the server is opened again without asking', async () => {
    await signUp('Quinn', WORDS, WORDS);
    await until(() => saveState().at === 'saved');
    jar = '';
    await createProject('After twelve hours');
    await saveNow();
    expect(saveState().at).toBe('saved');
  });
});

describe('the locked copy', () => {
  it('opens only with its key, and not when a byte was changed', async () => {
    const salt = new Uint8Array(16);
    const { key } = await stretch(WORDS, salt, 100_000);
    const { key: other } = await stretch(NEWER, salt, 100_000);
    const text = JSON.stringify({ a: 'words '.repeat(2000) });
    const p = await pack(key, text);
    expect(await unpack(key, p)).toBe(text);
    expect(p.data.length).toBeLessThan(text.length / 4);
    await expect(unpack(other, p)).rejects.toThrow();
    await expect(unpack(key, { ...p, data: `${p.data[0] === 'A' ? 'B' : 'A'}${p.data.slice(1)}` })).rejects.toThrow();
  });
});
