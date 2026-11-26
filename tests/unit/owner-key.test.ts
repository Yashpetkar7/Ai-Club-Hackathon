import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/core/contracts';
import { askAi, postAi, SearchPhrases } from '@/core/aiClient';
import { clearOwnerKey, getOwnerKey, isOwnerKeyShape, OWNER_HEADER, OWNER_KEY_STORE, ownerKeySnapshot, ownerKeyWhere, setOwnerKey } from '@/core/ownerKey';
import { db } from '@/store/db';

// Built at run time, so no key-shaped text is ever written in this file. Not a real key.
const KEY = ['gsk', 'T3st'.repeat(8)].join('_');
const OTHER = ['gsk', 'Z'.repeat(40)].join('_');

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('owner key shape', () => {
  it('accepts gsk_ followed by 20 to 100 letters and digits', () => {
    expect(isOwnerKeyShape(KEY)).toBe(true);
    expect(isOwnerKeyShape(['gsk', 'a'.repeat(20)].join('_'))).toBe(true);
    expect(isOwnerKeyShape(['gsk', 'a'.repeat(100)].join('_'))).toBe(true);
  });
  it.each([['gsk', 'a'.repeat(19)].join('_'), ['gsk', 'a'.repeat(101)].join('_'), ['sk', 'a'.repeat(30)].join('_'), ` ${KEY}`, `${KEY}\n`, ['gsk', `${'a'.repeat(25)}-x`].join('_'), '', null, 42, { key: KEY }])('refuses %s', (v) => {
    expect(isOwnerKeyShape(v)).toBe(false);
  });
});

describe('where the owner key is kept', () => {
  it('for this tab only, by default', () => {
    expect(setOwnerKey(KEY, false)).toBe(true);
    expect(sessionStorage.getItem(OWNER_KEY_STORE)).toBe(KEY);
    expect(localStorage.getItem(OWNER_KEY_STORE)).toBeNull();
    expect(getOwnerKey()).toBe(KEY);
    expect(ownerKeyWhere()).toBe('tab');
  });
  it('on this device only when Remember is ticked, and unticking takes it off the device', () => {
    expect(setOwnerKey(KEY, true)).toBe(true);
    expect(localStorage.getItem(OWNER_KEY_STORE)).toBe(KEY);
    expect(sessionStorage.getItem(OWNER_KEY_STORE)).toBeNull();
    expect(ownerKeyWhere()).toBe('device');
    expect(setOwnerKey(OTHER, false)).toBe(true);
    expect(localStorage.getItem(OWNER_KEY_STORE)).toBeNull();
    expect(getOwnerKey()).toBe(OTHER);
  });
  it('Forget takes it out of both', () => {
    setOwnerKey(KEY, true);
    sessionStorage.setItem(OWNER_KEY_STORE, OTHER);
    expect(clearOwnerKey()).toBe(true);
    expect(getOwnerKey()).toBeNull();
    expect(sessionStorage.getItem(OWNER_KEY_STORE)).toBeNull();
    expect(localStorage.getItem(OWNER_KEY_STORE)).toBeNull();
  });
  it('a value that is not shaped like a key is neither saved nor read back', () => {
    expect(setOwnerKey('my key', false)).toBe(false);
    expect(sessionStorage.length).toBe(0);
    sessionStorage.setItem(OWNER_KEY_STORE, 'tampered');
    expect(getOwnerKey()).toBeNull();
  });
  it('the snapshot for the panel holds where and the last 4 characters, never the key', () => {
    expect(ownerKeySnapshot()).toBe('');
    setOwnerKey(KEY, false);
    expect(ownerKeySnapshot()).toBe(`tab:${KEY.slice(-4)}`);
    expect(ownerKeySnapshot()).not.toContain(KEY.slice(0, 10));
  });
  it('storage that throws is no key, and never an exception', () => {
    const boom = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    expect(getOwnerKey()).toBeNull();
    expect(ownerKeyWhere()).toBeNull();
    expect(setOwnerKey(KEY, false)).toBe(false);
    expect(setOwnerKey(KEY, true)).toBe(false);
    expect(clearOwnerKey()).toBe(false);
    expect(ownerKeySnapshot()).toBe('');
  });
  it('storage that is missing altogether is no key', () => {
    vi.stubGlobal('sessionStorage', undefined);
    vi.stubGlobal('localStorage', undefined);
    expect(getOwnerKey()).toBeNull();
    expect(setOwnerKey(KEY, false)).toBe(false);
  });
});

describe('the page side of /api/ai', () => {
  const project = { id: 'owner-key-test', aiLevel: 1 } as Project;
  type Seen = { url: string; headers: Headers };
  let seen: Seen[] = [];
  beforeEach(async () => {
    seen = [];
    vi.stubGlobal('crypto', webcrypto);
    await db.log.where('projectId').equals(project.id).delete();
    // The server says it has no key of its own.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
      seen.push({ url: String(u), headers: new Headers(init?.headers) });
      if (String(u) === '/api/health') return Response.json({ ok: true, ai: false });
      return Response.json({ ok: true, model: 'test-model', data: { queries: ['remote work output'] } });
    });
  });

  it('sends the header only when a key is saved', async () => {
    await postAi({ task: 'plan', level: 1, input: { question: 'q' } });
    expect(seen.at(-1)!.headers.has(OWNER_HEADER)).toBe(false);
    setOwnerKey(KEY, false);
    await postAi({ task: 'plan', level: 1, input: { question: 'q' } });
    expect(seen.at(-1)!.headers.get(OWNER_HEADER)).toBe(KEY);
    expect(seen.at(-1)!.url).toBe('/api/ai');
  });
  it('a server with no key is not asked without an owner key, and is asked with one; the key is never logged', async () => {
    expect(await askAi(project, 'plan', { question: 'Does remote work help?' }, SearchPhrases)).toEqual({ ok: false, reason: 'unavailable' });
    expect(seen.some((s) => s.url === '/api/ai')).toBe(false);
    setOwnerKey(KEY, false);
    expect(await askAi(project, 'plan', { question: 'Does remote work help?' }, SearchPhrases)).toMatchObject({ ok: true, model: 'test-model' });
    expect(seen.find((s) => s.url === '/api/ai')!.headers.get(OWNER_HEADER)).toBe(KEY);
    const log = await db.log.where('projectId').equals(project.id).toArray();
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log)).not.toContain(KEY);
    expect(JSON.stringify(log)).not.toContain('gsk_');
  });
  it('the level check still comes first: explain is locked below level 2 and nothing is sent', async () => {
    setOwnerKey(KEY, false);
    expect(await askAi(project, 'explain', {}, SearchPhrases)).toEqual({ ok: false, reason: 'locked' });
    expect(seen).toEqual([]);
  });
});
