// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountsDb, changePassphrase, continueAsGuest, currentSession, deleteAccount, guestHasWork, IDLE_MS, resume, signIn, signOut, signUp, signUpProblems } from '@/auth/accounts';
import { dump, makeBackup, open, readBackup, restore, same, seal, stretch } from '@/auth/vault';
import { addSource, createProject } from '@/store/actions';
import { db, libraryName, switchLibrary } from '@/store/db';

const PASS = 'three plain words';
beforeEach(async () => {
  db.close();
  for (const n of await Dexie.getDatabaseNames()) if (n !== 'paper-trail-accounts') await Dexie.delete(n);
  await accountsDb.open();
  await accountsDb.accounts.clear();
  await accountsDb.session.clear();
  switchLibrary(null);
  vi.useRealTimers();
  await resume();
}, 30_000);

describe('signing up', () => {
  it.each([
    ['', PASS, PASS, /name of 2/],
    ['Asha', 'short', 'short', /at least 10/],
    ['Asha', 'aaaaaaaaaaaa', 'aaaaaaaaaaaa', /too easy/],
    ['Asha', 'password1234', 'password1234', /too easy/],
    ['Ashanti', 'ashanti and more', 'ashanti and more', /name in the passphrase/],
    ['Asha', PASS, 'three other words', /different/],
  ])('%s refuses a bad start', (n, p, a, why) => expect(signUpProblems(n, p, a)[0]).toMatch(why));

  it('signs in, out and in again, and the work is still there', async () => {
    await signUp('Asha', PASS, PASS);
    expect(currentSession()).toMatchObject({ kind: 'account', name: 'Asha' });
    const p = await createProject('Does remote work help?');
    await addSource(p.id, 'manual', { raw: { raw: 'a', title: 'A title' } });
    await signOut();
    expect(currentSession()).toEqual({ kind: 'none' });
    await signIn('  ASHA ', PASS);
    expect((await db.projects.toArray()).map((x) => x.question)).toEqual(['Does remote work help?']);
    expect(await db.sources.count()).toBe(1);
    expect((await db.log.toArray()).map((e) => e.action)).toEqual(['project.created', 'source.added']);
  }, 40_000);

  it('signing out leaves nothing readable on the device', async () => {
    await signUp('Asha', PASS, PASS);
    const id = (currentSession() as { id: string }).id;
    await createProject('A very private question');
    await signOut();
    expect(await Dexie.exists(libraryName(id))).toBe(false);
    const row = await accountsDb.accounts.get(id);
    expect(JSON.stringify(row)).not.toContain('private');
    expect(JSON.stringify(row)).not.toContain(PASS);
    expect(row!.vault!.data.length).toBeGreaterThan(50);
  }, 40_000);

  it('two people on one laptop never see each other’s work', async () => {
    await signUp('Asha', PASS, PASS);
    await createProject('Asha’s question');
    await signOut();
    await signUp('Ben', 'another three words', 'another three words');
    expect(await db.projects.count()).toBe(0);
    await createProject('Ben’s question');
    await signOut();
    continueAsGuest();
    expect(await db.projects.count()).toBe(0);
    await signIn('Asha', PASS);
    expect((await db.projects.toArray()).map((p) => p.question)).toEqual(['Asha’s question']);
  }, 60_000);

  it('one name, one account', async () => {
    await signUp('Asha', PASS, PASS);
    await expect(signUp('asha', PASS, PASS)).rejects.toThrow(/taken/);
  }, 30_000);

  it('brings guest work along when asked, and only then', async () => {
    continueAsGuest();
    await createProject('Started as a guest');
    expect(await guestHasWork()).toBe(true);
    await signUp('Asha', PASS, PASS, true);
    expect((await db.projects.toArray()).map((p) => p.question)).toEqual(['Started as a guest']);
    expect(await guestHasWork()).toBe(false);
  }, 30_000);
});

describe('signing in', () => {
  it('says the same thing for a wrong name and a wrong passphrase, and locks after five tries', async () => {
    await signUp('Asha', PASS, PASS);
    await signOut();
    const said = async (n: string, p: string) => signIn(n, p).then(() => 'in', (e: Error) => e.message);
    const a = await said('Nobody', PASS);
    const b = await said('Asha', 'wrong words here');
    expect(a).toBe(b);
    for (let i = 0; i < 4; i++) await said('Asha', 'wrong words here');
    expect(await said('Asha', PASS)).toMatch(/Too many wrong tries/);
    const id = (await accountsDb.accounts.toCollection().first())!.id;
    await accountsDb.accounts.update(id, { lockedUntil: Date.now() - 1 });
    expect(await said('Asha', PASS)).toBe('in');
  }, 60_000);

  it('a reload keeps you in, two idle hours lock the library', async () => {
    await signUp('Asha', PASS, PASS);
    const id = (currentSession() as { id: string }).id;
    await createProject('Kept across a reload');
    await resume();
    expect(currentSession()).toMatchObject({ kind: 'account', name: 'Asha' });
    await accountsDb.session.update('now', { seenAt: Date.now() - IDLE_MS - 1 });
    await resume();
    expect(currentSession()).toEqual({ kind: 'none' });
    expect(await Dexie.exists(libraryName(id))).toBe(false);
    await signIn('Asha', PASS);
    expect(await db.projects.count()).toBe(1);
  }, 60_000);

  it('a tab closed without signing out loses nothing', async () => {
    await signUp('Asha', PASS, PASS);
    await createProject('First');
    await signOut();
    await signIn('Asha', PASS);
    await createProject('Second, then the tab closed');
    await accountsDb.session.clear();
    await signIn('Asha', PASS);
    expect(await db.projects.count()).toBe(2);
  }, 60_000);

  it('changes the passphrase, and the old one stops working', async () => {
    await signUp('Asha', PASS, PASS);
    await createProject('Still here');
    await expect(changePassphrase('wrong words here', 'some newer words', 'some newer words')).rejects.toThrow(/do not match/);
    await changePassphrase(PASS, 'some newer words', 'some newer words');
    await signOut();
    await expect(signIn('Asha', PASS)).rejects.toThrow();
    await signIn('Asha', 'some newer words');
    expect(await db.projects.count()).toBe(1);
  }, 60_000);

  it('deletes the account only with the passphrase', async () => {
    await signUp('Asha', PASS, PASS);
    const id = (currentSession() as { id: string }).id;
    await expect(deleteAccount('wrong words here')).rejects.toThrow();
    await deleteAccount(PASS);
    expect(await accountsDb.accounts.count()).toBe(0);
    expect(await Dexie.exists(libraryName(id))).toBe(false);
  }, 40_000);
});

describe('encryption', () => {
  it('opens only with the right key, and notices one changed byte', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const a = await stretch('one two three', salt, 100_000);
    const b = await stretch('one two four', salt, 100_000);
    const s = await seal(a.key, 'hello');
    expect(await open(a.key, s)).toBe('hello');
    await expect(open(b.key, s)).rejects.toThrow();
    await expect(open(a.key, { ...s, data: (s.data[0] === 'A' ? 'B' : 'A') + s.data.slice(1) })).rejects.toThrow();
    expect(a.key.extractable).toBe(false);
    expect([same('abc', 'abc'), same('abc', 'abd'), same('abc', 'ab')]).toEqual([true, false, false]);
  }, 20_000);

  it('a backup moves the library and refuses a wrong passphrase, junk and bombs', async () => {
    continueAsGuest();
    await createProject('To move');
    const file = JSON.stringify(await makeBackup(db, PASS));
    expect(file).not.toContain('To move');
    await db.projects.clear();
    await expect(readBackup(file, 'not the words')).rejects.toThrow(/does not open/);
    await expect(readBackup('{}', PASS)).rejects.toThrow(/not a Paper Trail backup/);
    await expect(readBackup('junk', PASS)).rejects.toThrow(/not a Paper Trail backup/);
    await expect(readBackup(JSON.stringify({ ...JSON.parse(file), iterations: 1e9 }), PASS)).rejects.toThrow(/not a Paper Trail backup/);
    await restore(db, await readBackup(file, PASS));
    expect((await db.projects.toArray()).map((p) => p.question)).toEqual(['To move']);
    await expect(restore(db, { projects: 'x' })).rejects.toThrow();
    expect(Object.keys(await dump(db)).sort()).toEqual(['claims', 'drafts', 'log', 'projects', 'sources']);
  }, 40_000);
});
