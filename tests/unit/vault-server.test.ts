// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS so it also runs on Node without a build step
import { closeStore, openStore } from '../../server/store.mjs';
// @ts-expect-error plain JS
import { route } from '../../server/router.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const PROOF = Buffer.from('proof of a made-up phrase, 32 b.').toString('base64');
const WRONG = Buffer.from('proof of another phrase, 32 byt.').toString('base64');
const SALT = Buffer.from('sixteen bytes ok').toString('base64');
const sealed = (s: string) => ({ iv: Buffer.from('twelve bytes').toString('base64'), data: Buffer.from(`locked:${s}`).toString('base64'), z: 1 });
let net = 0;
const call = async (task: string, body: unknown, o: { cookie?: string; headers?: Record<string, string>; method?: string } = {}) => {
  const r: Response = await route(new Request(`http://localhost/api/vault/${task}`, { method: o.method ?? 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${net}`, ...(o.cookie ? { cookie: o.cookie } : {}), ...o.headers }, ...(o.method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }));
  const set = r.headers.get('set-cookie');
  return { status: r.status, json: (await r.json().catch(() => ({}))) as any, cookie: set?.split(';')[0] ?? '', set: set ?? '' };
};
const make = (id = A, proof = PROOF) => call('create', { id, salt: SALT, iterations: 600_000, proof, sealed: sealed('one') });

describe.each(['sqlite', 'files'] as const)('saving on the server, %s', (kind) => {
  let dir = '';
  beforeEach(async () => {
    net++;
    dir = mkdtempSync(join(tmpdir(), 'pt-store-'));
    vi.stubEnv('DATA_DIR', dir);
    if (kind === 'files') vi.stubEnv('STORE', 'files');
    closeStore();
    expect((await openStore(dir, kind === 'files' ? 'files' : undefined)).kind).toBe(kind);
  });
  afterEach(() => {
    closeStore();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('create, save, read, open on another computer', async () => {
    const c = await make();
    expect(c.status).toBe(201);
    expect(c.set).toMatch(/HttpOnly; SameSite=Strict/);
    expect((await call('save', { baseRev: 1, sealed: sealed('two') }, { cookie: c.cookie })).json).toMatchObject({ ok: true, rev: 2 });
    expect((await call('read', {}, { cookie: c.cookie })).json.sealed).toEqual(sealed('two'));
    const other = await call('open', { id: A, proof: PROOF });
    expect(other.json).toMatchObject({ rev: 2, sealed: sealed('two') });
    expect((await call('open', { id: A, proof: PROOF, wantData: false })).json.sealed).toBeUndefined();
  });

  it('survives a restart', async () => {
    const c = await make();
    closeStore();
    await openStore(dir, kind === 'files' ? 'files' : undefined);
    // The same cookie still works, because the signing secret is kept beside the data.
    expect((await call('save', { baseRev: 1, sealed: sealed('after') }, { cookie: c.cookie })).status).toBe(200);
  });

  it('never writes over newer work', async () => {
    const c = await make();
    await call('save', { baseRev: 1, sealed: sealed('laptop') }, { cookie: c.cookie });
    const late = await call('save', { baseRev: 1, sealed: sealed('old phone') }, { cookie: c.cookie });
    expect(late.status).toBe(409);
    expect(late.json).toMatchObject({ reason: 'newer', rev: 2 });
    expect((await call('read', {}, { cookie: c.cookie })).json.sealed).toEqual(sealed('laptop'));
  });

  it('a taken name is refused, and a wrong passphrase says the same as an unknown name', async () => {
    await make();
    expect((await make(A, WRONG)).status).toBe(409);
    const wrong = await call('open', { id: A, proof: WRONG });
    const nobody = await call('open', { id: B, proof: WRONG });
    expect([wrong.status, wrong.json]).toEqual([nobody.status, nobody.json]);
    expect(wrong.cookie).toBe('');
  });

  it('asking how to stretch a passphrase does not reveal which names exist', async () => {
    await make();
    const real = await call('start', { id: A });
    const fake = await call('start', { id: B });
    expect(real.json).toEqual({ ok: true, salt: SALT, iterations: 600_000 });
    expect(Object.keys(fake.json)).toEqual(Object.keys(real.json));
    expect(fake.json.salt).toHaveLength(SALT.length);
    expect((await call('start', { id: B })).json.salt).toBe(fake.json.salt);
  });

  it('five wrong tries lock the account for a minute, even for the right passphrase', async () => {
    await make();
    for (let i = 0; i < 4; i++) expect((await call('open', { id: A, proof: WRONG })).status).toBe(401);
    expect((await call('open', { id: A, proof: WRONG })).status).toBe(429);
    expect((await call('open', { id: A, proof: PROOF })).status).toBe(429);
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 61_000 });
    expect((await call('open', { id: A, proof: PROOF })).status).toBe(200);
  });

  it('a made-up, changed or expired cookie opens nothing', async () => {
    const c = await make();
    await make(B);
    const [, sid] = c.cookie.split('=');
    const swapped = `pt_sid=${sid!.replace(A, B)}`;
    for (const cookie of ['', 'pt_sid=x', swapped, `${c.cookie.slice(0, -1)}${c.cookie.endsWith('0') ? '1' : '0'}`]) expect((await call('read', {}, { cookie })).status).toBe(401);
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 13 * 3600_000 });
    expect((await call('read', {}, { cookie: c.cookie })).status).toBe(401);
  });

  it('a new passphrase ends every older session and the old proof', async () => {
    const c = await make();
    const k = await call('rekey', { id: A, proof: PROOF, salt: SALT, iterations: 600_000, newProof: WRONG, baseRev: 1, sealed: sealed('rekeyed') });
    expect(k.json).toMatchObject({ ok: true, rev: 2 });
    expect((await call('save', { baseRev: 2, sealed: sealed('x') }, { cookie: c.cookie })).status).toBe(401);
    expect((await call('open', { id: A, proof: PROOF })).status).toBe(401);
    expect((await call('open', { id: A, proof: WRONG })).json.sealed).toEqual(sealed('rekeyed'));
    expect((await call('rekey', { id: A, proof: WRONG, salt: SALT, iterations: 600_000, newProof: PROOF, baseRev: 1, sealed: sealed('late') })).status).toBe(409);
  });

  it('deleting needs the passphrase and leaves nothing', async () => {
    await make();
    expect((await call('delete', { id: A, proof: WRONG })).status).toBe(401);
    expect((await call('delete', { id: A, proof: PROOF })).status).toBe(200);
    expect((await call('open', { id: A, proof: PROOF })).status).toBe(401);
    expect((await make()).status).toBe(201);
  });

  it('other sites, other methods, other types and nonsense are refused', async () => {
    expect((await call('start', { id: A }, { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await call('start', { id: A }, { headers: { 'sec-fetch-site': 'same-site' } })).status).toBe(403);
    expect((await call('start', {}, { method: 'GET' })).status).toBe(405);
    expect((await call('start', 'id=x', { headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status).toBe(415);
    expect((await call('start', '{', {})).status).toBe(400);
    for (const id of ['', '../../etc/passwd', 'A'.repeat(64), 'a'.repeat(63), 5, null, ['a'.repeat(64)]]) expect((await call('start', { id })).status).toBe(400);
    for (const t of ['nope', '__proto__', 'constructor', 'toString', '']) expect((await call(t, { id: A })).status).toBe(404);
    const bad = { id: A, salt: SALT, iterations: 600_000, proof: PROOF };
    for (const s of [undefined, 'x', { iv: 'a', data: 'b', z: 1 }, { ...sealed('x'), z: 9 }, { ...sealed('x'), data: '<script>' }, { ...sealed('x'), data: 5 }]) expect((await call('create', { ...bad, sealed: s })).status).toBe(400);
    expect((await call('create', { ...bad, iterations: 5, sealed: sealed('x') })).status).toBe(400);
    expect((await call('create', { ...bad, sealed: { ...sealed('x'), data: 'A'.repeat(8_000_004) } })).status).toBeGreaterThanOrEqual(400);
  });

  it('one network cannot ask without end', async () => {
    for (let i = 0; i < 20; i++) await call('delete', { id: B, proof: PROOF });
    expect((await call('delete', { id: B, proof: PROOF })).status).toBe(429);
  }, 60_000);

  it('what is on the disk holds no proof, no passphrase and no readable word', async () => {
    const c = await make();
    await call('save', { baseRev: 1, sealed: sealed('two') }, { cookie: c.cookie });
    closeStore();
    const all = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? all(join(d, f)) : [readFileSync(join(d, f), 'latin1')]));
    const disk = all(dir).join('\n');
    expect(disk).toContain(A);
    expect(disk).not.toContain(PROOF);
    expect(disk).not.toContain('proof of a made-up');
  });
});

describe('the server says whether it can save', () => {
  afterEach(() => {
    closeStore();
    vi.unstubAllEnvs();
  });
  it('yes with a disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pt-store-'));
    vi.stubEnv('DATA_DIR', dir);
    closeStore();
    expect((await (await route(new Request('http://localhost/api/health'))).json()).saves).toBe(true);
    closeStore();
    rmSync(dir, { recursive: true, force: true });
  });
  it('no when nothing can be written, and then it refuses instead of pretending', async () => {
    vi.stubEnv('DATA_DIR', join(__filename, 'not-a-folder'));
    closeStore();
    expect((await (await route(new Request('http://localhost/api/health'))).json()).saves).toBe(false);
    net++;
    expect((await call('start', { id: A })).status).toBe(503);
  });
});
