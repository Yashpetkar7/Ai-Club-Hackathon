// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS so it also runs on Node without a build step
import { guardAi, tooMany } from '../../server/guard.mjs';
// @ts-expect-error plain JS
import { route } from '../../server/router.mjs';

const post = (body: unknown, headers: Record<string, string> = {}) => new Request('http://localhost/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const status = async (body: unknown, headers?: Record<string, string>) => (await route(post(body, headers))).status;
afterEach(() => vi.unstubAllEnvs());

describe('AI gateway guard', () => {
  it.each([99, -1, 1.5, '3', null, undefined, true, [3], Infinity])('refuses level %s', async (level) => expect(await status({ task: 'plan', level })).toBe(400));
  it('refuses a task above the declared level', async () => {
    for (const [task, level] of [['plan', 0], ['read', 1], ['challenge', 2]] as const) expect(await status({ task, level })).toBe(403);
  });
  it('refuses unknown tasks, bad JSON, long bodies and other sites', async () => {
    expect(await status({ task: 'write-essay', level: 3 })).toBe(400);
    expect(await status({ task: 7, level: 3 })).toBe(400);
    expect(await status('{nope')).toBe(400);
    expect(await status({ task: 'plan', level: 1, input: 'x'.repeat(70_000) })).toBe(413);
    expect(await status({ task: 'plan', level: 1 }, { 'sec-fetch-site': 'cross-site' })).toBe(403);
    expect((await route(new Request('http://localhost/api/ai'))).status).toBe(405);
  });
  it('lets a good request through to the handler', async () => {
    const g = await guardAi(post({ task: 'plan', level: 1, input: {} }, { 'x-forwarded-for': '9.9.9.9', 'sec-fetch-site': 'same-origin' }));
    expect(await g.req.json()).toMatchObject({ task: 'plan', level: 1 });
  });
  it('limits one network', () => {
    const hits = Array.from({ length: 5 }, (_, i) => tooMany('k', 3, 1000, i));
    expect(hits).toEqual([false, false, false, true, true]);
    expect(tooMany('k', 3, 1000, 5000)).toBe(false);
  });
});

describe('registry proxy', () => {
  it.each(['https://evil.example/', 'http://api.crossref.org/works', 'https://doi.org/10.1/x', 'file:///etc/passwd', 'not a url'])('refuses %s', async (u) => expect([400, 403]).toContain((await route(new Request(`http://localhost/api/registry?url=${encodeURIComponent(u)}`))).status));
});

describe('registry proxy answers are data and stay on the list', () => {
  afterEach(() => vi.restoreAllMocks());
  const ask = (u: string, headers: Record<string, string> = {}): Promise<Response> => route(new Request(`http://localhost/api/registry?url=${encodeURIComponent(u)}`, { headers }));
  it('a page sent back by a registry cannot run as a page here', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<script>alert(1)</script>', { headers: { 'content-type': 'text/html' } }));
    const r = await ask('https://api.crossref.org/works/10.1/evil');
    expect(r.headers.get('content-type')).toMatch(/^application\/json/);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain('sandbox');
  });
  it('a redirect off the list is refused', async () => {
    const res = new Response('{}');
    Object.defineProperty(res, 'redirected', { value: true });
    Object.defineProperty(res, 'url', { value: 'https://169.254.169.254/latest' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);
    expect((await ask('https://api.crossref.org/works/10.1/away')).status).toBe(403);
  });
  it.each(['https://www.ebi.ac.uk/x', 'https://openlibrary.org/x', 'https://api.crossref.org.evil.example/x', 'https://api.crossref.org@evil.example/x'])('only the four registries: %s', async (u) => expect((await ask(u)).status).toBe(403));
  it('other sites may not use it', async () => expect((await ask('https://api.crossref.org/works/10.1/a', { 'sec-fetch-site': 'cross-site' })).status).toBe(403));
});

describe('asking a registry again', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('an old copy is used, unless the page asks for a fresh answer, and then at most once a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ n: ++n })));
    const u = encodeURIComponent('https://api.crossref.org/works/10.5555/again');
    const ask = async (fresh: boolean): Promise<number> => (await (await route(new Request(`http://localhost/api/registry?url=${u}${fresh ? '&fresh=1' : ''}`))).json()).n;
    expect(await ask(false)).toBe(1);
    expect(await ask(true)).toBe(1);
    vi.setSystemTime(Date.now() + 120_000);
    expect(await ask(false)).toBe(1);
    expect(await ask(true)).toBe(2);
    expect(await ask(false)).toBe(2);
  });
});
