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
