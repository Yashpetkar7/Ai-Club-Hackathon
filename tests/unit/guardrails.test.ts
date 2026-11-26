// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENTS } from '@/policy/policy';
import { FALLBACK_REPO, MODELS, PROXY_HOSTS, SERVER_MIN_LEVEL, SUPPORT_REPO, TASK_AGENT, askAiKey, taskRows } from '@/core/guardrails/architecture';
import { SUPPORT, SUPPORT_MODELS } from '@/core/claims/support';
import { GUARDRAILS, overall, probeServer, runGuardrail, runGuardrails, type CheckEnv } from '@/core/guardrails/checks';
import { ALL_LINKS, MAPPING } from '@/core/guardrails/frameworks';
import { MEANING_REVISION } from '@/core/semantic/models';
// @ts-expect-error plain JS so it also runs on Node without a build step
import { route } from '../../server/router.mjs';

/** Our own server's router, called in-process: the real guard and AI handler, with no network. */
const server: CheckEnv = {
  fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res: Response | null = await route(new Request(new URL(String(input), 'http://localhost'), init));
    return res ?? new Response('not an api path', { status: 404 });
  }) as typeof fetch,
};
const answer = (body: BodyInit, status: number, type = 'application/json'): CheckEnv => ({ fetch: (async () => new Response(body, { status, headers: { 'content-type': type } })) as typeof fetch });

describe('every guardrail the deck promises, run on the real code', () => {
  for (const check of GUARDRAILS) {
    it(`${check.guardrail}: every case matches what the deck says`, async () => {
      const r = await runGuardrail(check, server);
      expect(r.error).toBeUndefined();
      expect(r.cases.map((c) => ({ input: c.input, actual: c.actual }))).toEqual(check.cases.map((c) => ({ input: c.input, actual: c.expected })));
      expect(r.outcome).toBe('pass');
    });
  }

  it('runs them all in order, one at a time, and can stop part way', async () => {
    const seen: string[] = [];
    const all = await runGuardrails(server, (r) => seen.push(r.id));
    expect(seen).toEqual(GUARDRAILS.map((c) => c.id));
    expect(all.every((r) => r.outcome === 'pass')).toBe(true);
    let n = 0;
    const part = await runGuardrails(server, () => n++, () => n >= 2);
    expect(part).toHaveLength(2);
  });

  it('every case states its expected result before anything runs, and the limits are marked as limits', () => {
    for (const c of GUARDRAILS) {
      expect(c.cases.length).toBeGreaterThan(0);
      for (const k of c.cases) expect(k.expected.trim()).not.toBe('');
      expect(c.where.length).toBeGreaterThan(0);
    }
    const log = GUARDRAILS.find((c) => c.id === 'log')!;
    expect(log.cases.filter((k) => k.limit).map((k) => k.input)).toEqual(['The last entry removed', 'Entry 2 edited, then every hash after it worked out again']);
    expect(log.limit).toMatch(/not tamper-proof/);
  });

  it('never calls a source by the word the house rules forbid', () => {
    const words = JSON.stringify(GUARDRAILS.map(({ run: _run, ...rest }) => rest)) + JSON.stringify(MAPPING);
    expect(words).not.toMatch(/\bfake\b/i);
  });
});

describe('the server check, with stand-in answers', () => {
  it('passes only on 403 locked', async () => {
    expect(await probeServer(answer(JSON.stringify({ ok: false, reason: 'locked' }), 403).fetch)).toMatchObject({ actual: 'Refused: locked (HTTP 403)' });
    expect(await probeServer(answer(JSON.stringify({ ok: true, data: {} }), 200).fetch)).toMatchObject({ actual: 'Not refused for the level: answered (HTTP 200)' });
    expect(await probeServer(answer(JSON.stringify({ ok: false, reason: 'bad input' }), 400).fetch)).toMatchObject({ actual: 'Not refused for the level: bad input (HTTP 400)' });
  });
  it('says Could not run when there is no server, never a pass', async () => {
    const down: CheckEnv = { fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch };
    expect(await probeServer(down.fetch)).toHaveProperty('couldNotRun');
    expect(await probeServer(answer('<!doctype html><title>Paper Trail</title>', 200, 'text/html').fetch)).toHaveProperty('couldNotRun');
    const level = GUARDRAILS.find((c) => c.id === 'level')!;
    const r = await runGuardrail(level, down);
    expect(r.outcome).toBe('could-not-run');
    expect(r.cases.map((c) => c.outcome)).toEqual(['pass', 'could-not-run']);
  });
  it('a fail outweighs a check that could not run, and nothing is a pass by default', () => {
    expect(overall(['pass', 'could-not-run', 'fail'])).toBe('fail');
    expect(overall(['pass', 'could-not-run'])).toBe('could-not-run');
    expect(overall([])).toBe('could-not-run');
    expect(overall(['pass', 'pass'])).toBe('pass');
  });
  it('a check that throws is Could not run', async () => {
    const broken = { ...GUARDRAILS[0]!, run: async () => { throw new Error('boom'); } };
    const r = await runGuardrail(broken, server);
    expect(r).toMatchObject({ outcome: 'could-not-run', error: 'boom' });
    expect(r.cases.every((c) => c.outcome === 'could-not-run')).toBe(true);
  });
});

describe('page-side copies of server values do not drift', () => {
  const read = (p: string) => readFileSync(p, 'utf8');

  it('registry hosts the proxy allows', () => {
    const allow = read('server/handlers/registry.mjs').match(/const ALLOW = new Set\(\[([^\]]*)\]\)/)?.[1];
    expect(allow).toBeTruthy();
    expect([...allow!.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...PROXY_HOSTS]);
  });

  it('minimum AI level of each server task', () => {
    const body = read('server/handlers/ai.mjs').match(/const MIN_LEVEL = \{([^}]*)\}/)?.[1];
    expect(body).toBeTruthy();
    expect(Object.fromEntries([...body!.matchAll(/(\w+):\s*(\d)/g)].map((m) => [m[1], Number(m[2])]))).toEqual(SERVER_MIN_LEVEL);
  });

  it('which agent each task is, as the page posts it', () => {
    const body = read('src/core/aiClient.ts').match(/const AGENT = \{([^}]*)\}/)?.[1];
    expect(body).toBeTruthy();
    expect(Object.fromEntries([...body!.matchAll(/(\w+):\s*'([\w-]+)'/g)].map((m) => [m[1], m[2]]))).toEqual(TASK_AGENT);
  });

  it('the page’s house rules ask for the same level as the server', () => {
    for (const row of taskRows()) expect(row, row.task).toMatchObject({ agree: true });
    for (const [task, agent] of Object.entries(TASK_AGENT)) expect(AGENTS.find((a) => a.id === agent)?.kind, task).toBe('ai');
  });

  it('the support model the site ships, the one it falls back to, and whether each is pinned', () => {
    const support = MODELS.find((m) => m.key === 'support')!;
    const fallback = MODELS.find((m) => m.key === 'fallback')!;
    expect(support.repo).toBe(SUPPORT_MODELS[SUPPORT.key].id);
    expect(support).toMatchObject({ from: 'site', mb: SUPPORT_MODELS[SUPPORT.key].mb });
    expect(fallback).toMatchObject({ repo: SUPPORT_MODELS.original.id, from: 'hub', mb: SUPPORT_MODELS.original.mb });
    // "From this site" is true only while the files are in public/models.
    for (const f of ['config.json', 'tokenizer.json', 'onnx/model_quantized.onnx']) expect(existsSync(`public/models/${SUPPORT_REPO}/${f}`), f).toBe(true);
    const worker = read('src/core/claims/support.worker.ts');
    expect(worker.match(/model: '([^']+)', local: false/)?.[1]).toBe(FALLBACK_REPO);
    // The page says "not pinned" only while the worker loads the support model without a revision.
    const loadsWithRevision = /from_pretrained\(id,\s*\{[^}]*revision/.test(worker);
    expect(/from_pretrained\(id,/.test(worker)).toBe(true);
    expect(fallback.revision === null).toBe(!loadsWithRevision);
    expect(MODELS.find((m) => m.key === 'meaning')!.revision).toBe(MEANING_REVISION);
  });

  it('a licence is shown as confirmed only with a source for it', () => {
    for (const m of MODELS) {
      expect(m.licence.checked.length).toBeGreaterThan(0);
      if (!m.licence.confirmed) expect(m.licence.short).toBe('Not confirmed');
    }
  });

  it('outside links are https and on the official sites', () => {
    for (const u of ALL_LINKS) expect(new URL(u).hostname).toMatch(/^(airc\.nist\.gov|www\.nist\.gov|genai\.owasp\.org|www\.unesco\.org)$/);
    for (const row of MAPPING) expect(row.nist.length + row.owasp.length + row.unesco.length).toBeGreaterThan(0);
  });
});

describe('asking this site whether it has an AI key', () => {
  it('reads only the health flag', async () => {
    expect(await askAiKey(answer(JSON.stringify({ ok: true, ai: true }), 200).fetch)).toBe('yes');
    expect(await askAiKey(answer(JSON.stringify({ ok: true, ai: false }), 200).fetch)).toBe('no');
    expect(await askAiKey(answer('<!doctype html>', 200, 'text/html').fetch)).toBe('no-server');
    expect(await askAiKey((async () => { throw new TypeError('offline'); }) as typeof fetch)).toBe('no-server');
  });
});
