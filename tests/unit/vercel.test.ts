import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS
import { GET, POST } from '../../api/index.mjs';
// @ts-expect-error plain JS
import { HEADERS } from '../../server/headers.mjs';
// @ts-expect-error plain JS
import { closeStore } from '../../server/store.mjs';

const conf = JSON.parse(readFileSync('vercel.json', 'utf8'));

describe('on Vercel', () => {
  afterEach(() => {
    closeStore();
    vi.unstubAllEnvs();
  });
  it('sends the same security headers as the laptop server, and never deploys by itself', () => {
    expect(Object.fromEntries(conf.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]))).toEqual(HEADERS);
    expect(conf.git.deploymentEnabled).toBe(false);
  });
  it('answers, and says it cannot save', async () => {
    vi.stubEnv('VERCEL', '1');
    closeStore();
    expect(await (await GET(new Request('https://x.test/api/health'))).json()).toMatchObject({ ok: true, saves: false });
    const r = await POST(new Request('https://x.test/api/vault/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'a'.repeat(64) }) }));
    expect(r.status).toBe(503);
  });
  it('unknown paths are 404, other sites are refused', async () => {
    expect((await GET(new Request('https://x.test/api/nothing'))).status).toBe(404);
    expect((await GET(new Request('https://x.test/api/registry?url=https%3A%2F%2Fevil.test'))).status).toBe(403);
  });
});
