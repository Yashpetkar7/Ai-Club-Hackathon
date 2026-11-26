// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS so it also runs on Node without a build step
import { guardAi } from '../../server/guard.mjs';
// @ts-expect-error plain JS
import { ai, resetModels } from '../../server/handlers/ai.mjs';
// @ts-expect-error plain JS
import { route } from '../../server/router.mjs';

// Test keys are built at run time and never leave this file. They are not real keys.
const OWNER = ['gsk', 'o'.repeat(32)].join('_');
const ENV = ['gsk', 'e'.repeat(32)].join('_');
const HEADER = 'x-owner-ai-key';

const post = (body: unknown, headers: Record<string, string> = {}) => new Request('http://localhost/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const plan = { task: 'plan', level: 1, input: { question: 'Does remote work help?' } };
const explainInput = {
  claim: 'Home working led to a 13% performance increase.',
  sentence: 'Home working led to a 13% performance increase, of which 9% came from working more minutes.',
  label: 'verified',
  reasons: [],
  checks: { inSource: true, wordForWord: true, numbers: true, direction: true, scope: true },
  scores: { support: null, neutral: null, contradiction: null },
  lines: { support: 90, contradiction: 90 },
};

type Sent = { url: string; auth: string | null; body: any };
let sent: Sent[] = [];
/** Stands in for Groq and Gemini. ownerStatus/envStatus make Groq refuse that key. */
function services(o: { answer?: unknown; ownerStatus?: number; envStatus?: number; models?: string[]; gemini?: unknown }) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    const url = String(u);
    const auth = new Headers(init?.headers).get('authorization');
    sent.push({ url, auth, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.includes('api.groq.com')) {
      if (o.ownerStatus && auth === `Bearer ${OWNER}`) return new Response('{"error":{"message":"upstream detail"}}', { status: o.ownerStatus });
      if (o.envStatus && auth === `Bearer ${ENV}`) return new Response('{"error":{"message":"upstream detail"}}', { status: o.envStatus });
      if (url.endsWith('/openai/v1/models')) return Response.json({ data: (o.models ?? ['openai/gpt-oss-20b']).map((id) => ({ id })) });
      return Response.json({ choices: [{ message: { content: JSON.stringify(o.answer) } }] });
    }
    if (url.includes('/v1beta/models?')) return Response.json({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(o.gemini) }] } }] });
  });
}
const call = async (body: unknown, headers: Record<string, string> = {}) => {
  const r: Response = await route(post(body, { 'sec-fetch-site': 'same-origin', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}`, ...headers }));
  const text = await r.text();
  return { status: r.status, text, body: JSON.parse(text) };
};

beforeEach(() => {
  sent = [];
  resetModels();
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubEnv('GROQ_MODEL', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('owner key header at the guard', () => {
  it('is passed on when it is shaped like a Groq key', async () => {
    const g = await guardAi(post(plan, { [HEADER]: OWNER }));
    expect(g.req.headers.get(HEADER)).toBe(OWNER);
  });
  it.each([
    ['too short', ['gsk', 'x'.repeat(8)].join('_')],
    ['wrong start', ['sk', 'x'.repeat(32)].join('_')],
    ['a symbol in it', ['gsk', `${'x'.repeat(30)}-!`].join('_')],
    ['too long', ['gsk', 'x'.repeat(101)].join('_')],
    ['spaces around a word', 'please use my key'],
  ])('is dropped when it is not (%s)', async (_, value) => {
    const g = await guardAi(post(plan, { [HEADER]: value }));
    expect(g.req.headers.get(HEADER)).toBeNull();
    expect([...g.req.headers.keys()]).toEqual(['content-type']);
  });
  it('a dropped header leaves a server with no key of its own saying so', async () => {
    services({ answer: { queries: ['a b c'] } });
    expect(await call(plan, { [HEADER]: 'not-a-key' })).toMatchObject({ status: 503, body: { ok: false, reason: 'no-key' } });
    expect(sent).toEqual([]);
  });
});

describe('AI gateway with the owner key', () => {
  it('works with no server key at all, and says the owner key answered', async () => {
    services({ answer: { queries: ['telework output trial'] } });
    const r = await call(plan, { [HEADER]: OWNER });
    expect(r.body).toEqual({ ok: true, data: { queries: ['telework output trial'] }, model: 'openai/gpt-oss-20b (Groq)', owner: true });
    expect(r.text).not.toContain(OWNER);
  });
  it('is used before the server key, with its own model cache', async () => {
    vi.stubEnv('GROQ_API_KEY', ENV);
    services({ answer: { queries: ['a b c'] } });
    await call(plan, { [HEADER]: OWNER });
    expect(sent.map((s) => [s.url.replace('https://api.groq.com/openai/v1/', ''), s.auth === `Bearer ${OWNER}` ? 'owner' : 'env'])).toEqual([
      ['models', 'owner'],
      ['chat/completions', 'owner'],
    ]);
    // The server key still asks for its own model list the first time it is used.
    sent = [];
    await call(plan);
    expect(sent.map((s) => [s.url.replace('https://api.groq.com/openai/v1/', ''), s.auth === `Bearer ${ENV}` ? 'env' : 'owner'])).toEqual([
      ['models', 'env'],
      ['chat/completions', 'env'],
    ]);
  });
  it.each([401, 403])('a Groq %s for the owner key is said plainly, and nothing else is tried', async (status) => {
    vi.stubEnv('GROQ_API_KEY', ENV);
    services({ ownerStatus: status, answer: { queries: ['a b c'] } });
    const r = await call(plan, { [HEADER]: OWNER });
    expect(r).toMatchObject({ status: 401, body: { ok: false, reason: 'key-rejected' } });
    expect(Object.keys(r.body).sort()).toEqual(['ok', 'reason']);
    expect(r.text).not.toContain(OWNER);
    expect(r.text).not.toContain('upstream detail');
    expect(sent.every((s) => s.auth === `Bearer ${OWNER}`)).toBe(true);
  });
  it('a busy owner key falls back to the server key', async () => {
    vi.stubEnv('GROQ_API_KEY', ENV);
    services({ ownerStatus: 429, answer: { queries: ['a b c'] } });
    const r = await call(plan, { [HEADER]: OWNER });
    expect(r.body).toEqual({ ok: true, data: { queries: ['a b c'] }, model: 'openai/gpt-oss-20b (Groq)' });
  });
  it('the key is never in any response body', async () => {
    const outcomes = [
      () => services({ answer: { queries: ['a b c'] } }),
      () => services({ ownerStatus: 401 }),
      () => services({ ownerStatus: 500 }),
      () => services({ answer: { wrong: 1 } }),
    ];
    for (const setUp of outcomes) {
      vi.restoreAllMocks();
      resetModels();
      setUp();
      for (const body of [plan, { task: 'read', level: 1, input: {} }, { task: 'plan', level: 1, input: {} }, { task: 'nope', level: 3 }]) {
        const r = await call(body, { [HEADER]: OWNER });
        expect(r.text).not.toContain(OWNER);
        expect(r.text).not.toContain('gsk_');
      }
    }
  });
  it('asks the gpt-oss models for low reasoning effort and no reasoning text, and other models for neither', async () => {
    services({ answer: { queries: ['a b c'] } });
    await call(plan, { [HEADER]: OWNER });
    expect(sent.find((s) => s.url.endsWith('chat/completions'))!.body).toMatchObject({ reasoning_effort: 'low', include_reasoning: false, response_format: { type: 'json_object' } });
    vi.restoreAllMocks();
    resetModels();
    sent = [];
    services({ answer: { queries: ['a b c'] }, models: ['llama-3.3-70b-versatile'] });
    await call(plan, { [HEADER]: OWNER });
    const body = sent.find((s) => s.url.endsWith('chat/completions'))!.body;
    expect(body.model).toBe('llama-3.3-70b-versatile');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('include_reasoning');
  });
  it('never writes to the console', async () => {
    const seen = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));
    services({ ownerStatus: 401 });
    await call(plan, { [HEADER]: OWNER });
    services({ ownerStatus: 500 });
    await call(plan, { [HEADER]: OWNER });
    for (const s of seen) expect(s).not.toHaveBeenCalled();
  });
});

describe('the explain task at the gateway', () => {
  it('is locked below level 2, before any service is asked', async () => {
    services({ answer: { explanation: 'x' } });
    for (const level of [0, 1]) expect((await call({ task: 'explain', level, input: explainInput }, { [HEADER]: OWNER })).status).toBe(403);
    expect(sent).toEqual([]);
  });
  it('refuses input without a claim, a sentence or a known label', async () => {
    services({ answer: { explanation: 'x' } });
    for (const input of [{ ...explainInput, claim: '' }, { ...explainInput, sentence: 5 }, { ...explainInput, label: 'proven' }, { ...explainInput, label: 'toString' }]) {
      expect((await call({ task: 'explain', level: 2, input }, { [HEADER]: OWNER })).status).toBe(400);
    }
    expect(sent).toEqual([]);
  });
  it('returns a clean explanation and nothing else', async () => {
    const explanation = 'Your claim appears word for word in the source sentence, including 13%. Every plain-code check passed, so the label is Verified.';
    services({ answer: { explanation, label: 'disputed', source: 'invented' } });
    const r = await call({ task: 'explain', level: 2, input: explainInput }, { [HEADER]: OWNER });
    expect(r.body).toEqual({ ok: true, data: { explanation }, model: 'openai/gpt-oss-20b (Groq)', owner: true });
    // What the model saw: values only, with the label by name and the checks in words.
    const user = JSON.parse(sent.find((s) => s.url.endsWith('chat/completions'))!.body.messages[1].content);
    expect(user).toMatchObject({ label: 'Verified', checks: { numbersMatch: 'passed', claimWordsAppearInSource: 'passed' }, scores: { support: null }, lines: { support: 90 } });
  });
  it('an answer that breaks a rule is not passed on', async () => {
    services({ answer: { explanation: 'The authors et al. agree, so this is Verified.' } });
    expect(await call({ task: 'explain', level: 2, input: explainInput }, { [HEADER]: OWNER })).toMatchObject({ status: 502, body: { ok: false, reason: 'no answer' } });
  });
});

describe('the handler alone, without the guard', () => {
  it('still ignores a header that is not shaped like a key', async () => {
    services({ answer: { queries: ['a b c'] } });
    const r: Response = await ai(new Request('http://localhost/api/ai', { method: 'POST', headers: { [HEADER]: 'gsk_short' }, body: JSON.stringify(plan) }));
    expect(r.status).toBe(503);
    expect(sent).toEqual([]);
  });
});
