import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mostSupported, threeWay } from '@/core/claims/nli';

/**
 * The page side of both on-device models, with a FAKE worker. No model is downloaded: the fake answers
 * in the worker's message format, so these tests check the protocol, not the models.
 */
const ID2LABEL = { 0: 'contradiction', 1: 'entailment', 2: 'neutral' };

class FakeWorker {
  static made: FakeWorker[] = [];
  /** Model ids whose download fails, and whether the meaning model's download fails. */
  static failLoad = new Set<string>();
  static failEmbed = false;
  posted: any[] = [];
  terminated = false;
  failScoreFor = new Set<string>();
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeWorker.made.push(this);
  }
  private reply(m: any) {
    queueMicrotask(() => !this.terminated && this.onmessage?.({ data: m } as MessageEvent));
  }
  postMessage(m: any) {
    this.posted.push(m);
    if (m.type === 'load') {
      this.reply({ type: 'progress', loaded: 50, total: 100 });
      this.reply(FakeWorker.failLoad.has(m.model) ? { type: 'error', message: 'not found' } : { type: 'ready' });
    } else if (m.type === 'score') {
      if (this.failScoreFor.has(m.premise)) this.reply({ type: 'error', id: m.id, message: 'boom' });
      else this.reply({ type: 'score', id: m.id, ...threeWay(m.premise.includes('13%') ? [-2, 3, 0] : [2, -1, 0.5], ID2LABEL) });
    } else if (m.type === 'load-embed') this.reply(FakeWorker.failEmbed ? { type: 'embed-error', message: '429' } : { type: 'embed-ready' });
    else if (m.type === 'embed') {
      const data = new Float32Array(m.texts.length * 2);
      m.texts.forEach((t: string, i: number) => data.set([t.length, 1], i * 2));
      this.reply({ type: 'embedded', id: m.id, dims: 2, data });
    }
  }
  terminate() {
    this.terminated = true;
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  FakeWorker.made = [];
  FakeWorker.failLoad = new Set();
  FakeWorker.failEmbed = false;
  vi.resetModules();
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe('three-way answers from the support model', () => {
  it('softmax over all three labels, named by the model’s own label map', () => {
    const s = threeWay([0, 2, 1], ID2LABEL);
    const e = [Math.exp(0), Math.exp(2), Math.exp(1)];
    const sum = e[0]! + e[1]! + e[2]!;
    expect(s.contradicts).toBeCloseTo(e[0]! / sum);
    expect(s.entails).toBeCloseTo(e[1]! / sum);
    expect(s.neutral).toBeCloseTo(e[2]! / sum);
    expect(s.entails + s.neutral + s.contradicts).toBeCloseTo(1);
  });
  it('follows the label map, not the position', () => {
    const s = threeWay([5, 0, 0], { 0: 'ENTAILMENT', 1: 'NEUTRAL', 2: 'CONTRADICTION' });
    expect(s.entails).toBeGreaterThan(0.9);
  });
  it('starts on the sentence the model backs most; a tie keeps the closest one', () => {
    expect(mostSupported([{ entails: 0.2 }, { entails: 0.9 }, null])).toBe(1);
    expect(mostSupported([{ entails: 0.9 }, { entails: 0.9 }])).toBe(0);
    expect(mostSupported([null, null])).toBe(-1);
    expect(mostSupported([])).toBe(-1);
  });
});

describe('support model client', () => {
  it('loads, then scores with support, neutral and contradiction', async () => {
    const s = await import('@/core/claims/support');
    s.loadSupport();
    expect(s.supportState().status).toBe('loading');
    await settle();
    expect(s.supportState().status).toBe('ready');
    const r = await s.scoreSupport('Home working led to a 13% performance increase.', 'Remote work raised output 13%');
    expect(Object.keys(r).sort()).toEqual(['contradicts', 'entails', 'neutral']);
    expect(r.entails + r.neutral! + r.contradicts).toBeCloseTo(1);
    expect(r.entails).toBeGreaterThan(0.9);
  });
  it('scores the top 3 for one claim, in order; one failure does not stop the rest', async () => {
    const s = await import('@/core/claims/support');
    s.loadSupport();
    await settle();
    FakeWorker.made[0]!.failScoreFor.add('B sentence with no number.');
    const got = await s.scoreSupportMany(['A sentence with 13% in it.', 'B sentence with no number.', 'C sentence, nothing here.'], 'claim');
    expect(got).toHaveLength(3);
    expect(got[0]!.entails).toBeGreaterThan(0.9);
    expect(got[1]).toBeNull();
    expect(got[2]!.contradicts).toBeGreaterThan(got[2]!.entails);
  });
  it('refuses to score before it is loaded', async () => {
    const s = await import('@/core/claims/support');
    await expect(s.scoreSupport('a', 'b')).rejects.toThrow('not loaded');
  });
});

describe('one worker for both models', () => {
  it('the meaning model joins the support model’s worker', async () => {
    const s = await import('@/core/claims/support');
    const m = await import('@/core/semantic/meaning');
    s.loadSupport();
    m.loadMeaning();
    await settle();
    expect(FakeWorker.made).toHaveLength(1);
    expect(s.supportState().status).toBe('ready');
    expect(m.meaningState().status).toBe('ready');
  });
  it('unloading one model keeps the worker for the other; unloading both closes it', async () => {
    const s = await import('@/core/claims/support');
    const m = await import('@/core/semantic/meaning');
    s.loadSupport();
    m.loadMeaning();
    await settle();
    const w = FakeWorker.made[0]!;
    m.unloadMeaning();
    expect(w.terminated).toBe(false);
    expect(w.posted.at(-1)).toEqual({ type: 'unload', model: 'embed' });
    expect(await s.scoreSupport('x 13%', 'y')).toBeTruthy();
    s.cancelSupport();
    expect(w.terminated).toBe(true);
  });
  it('cancelling a download closes the worker, and the other model comes back by itself', async () => {
    const s = await import('@/core/claims/support');
    const m = await import('@/core/semantic/meaning');
    m.loadMeaning();
    await settle();
    s.loadSupport();
    expect(s.supportState().status).toBe('loading');
    s.cancelSupport();
    expect(FakeWorker.made[0]!.terminated).toBe(true);
    expect(s.supportState().status).toBe('off');
    await settle();
    expect(FakeWorker.made).toHaveLength(2);
    expect(m.meaningState().status).toBe('ready');
  });
  it('asks for our fine-tuned model from this site first', async () => {
    const s = await import('@/core/claims/support');
    s.loadSupport();
    await settle();
    expect(FakeWorker.made[0]!.posted[0]).toMatchObject({ type: 'load', model: s.SUPPORT_MODELS[s.SUPPORT.key].id, local: true });
    expect(s.supportModelLabel()).toBe(s.SUPPORT_MODELS[s.SUPPORT.key].label);
  });
  it('if ours does not load, the worker is closed, the original loads in a fresh one, and the meaning model comes back', async () => {
    const s = await import('@/core/claims/support');
    const m = await import('@/core/semantic/meaning');
    FakeWorker.failLoad.add(s.SUPPORT_MODELS.scifact.id);
    m.loadMeaning();
    await settle();
    s.loadSupport();
    await settle();
    await settle();
    // Closed, so requests left over from the failed download die with it.
    expect(FakeWorker.made[0]!.terminated).toBe(true);
    const fresh = FakeWorker.made.at(-1)!;
    expect(fresh.posted).toContainEqual(expect.objectContaining({ type: 'load', model: s.SUPPORT_MODELS.original.id, local: false }));
    expect(s.supportState().status).toBe('ready');
    expect(s.supportModelLabel()).toBe(s.SUPPORT_MODELS.original.label);
    expect(m.meaningState().status).toBe('ready');
  });
  it('if the original does not load either, it says so instead of trying again', async () => {
    const s = await import('@/core/claims/support');
    FakeWorker.failLoad.add(s.SUPPORT_MODELS.scifact.id);
    FakeWorker.failLoad.add(s.SUPPORT_MODELS.original.id);
    s.loadSupport();
    await settle();
    await settle();
    expect(s.supportState().status).toBe('failed');
    expect(FakeWorker.made).toHaveLength(2);
  });
  it('if the meaning model does not load, the worker is closed and the support model comes back by itself', async () => {
    const s = await import('@/core/claims/support');
    const m = await import('@/core/semantic/meaning');
    s.loadSupport();
    await settle();
    FakeWorker.failEmbed = true;
    m.loadMeaning();
    await settle();
    expect(FakeWorker.made[0]!.terminated).toBe(true);
    expect(m.meaningState().status).toBe('failed');
    await settle();
    expect(FakeWorker.made).toHaveLength(2);
    expect(s.supportState().status).toBe('ready');
  });
  it('a crash fails both, and says so', async () => {
    const s = await import('@/core/claims/support');
    const m = await import('@/core/semantic/meaning');
    s.loadSupport();
    m.loadMeaning();
    await settle();
    FakeWorker.made[0]!.onerror?.();
    expect(s.supportState().status).toBe('failed');
    expect(m.meaningState().status).toBe('failed');
  });
});

describe('meaning model client', () => {
  it('only the claim gets the search prefix, and vectors come back in order', async () => {
    const m = await import('@/core/semantic/meaning');
    const { QUERY_PREFIX } = await import('@/core/semantic/models');
    m.loadMeaning();
    await settle();
    const [q] = await m.embed(['my claim'], 'query');
    const ps = await m.embed(['short', 'a longer passage'], 'passage');
    const sent = FakeWorker.made[0]!.posted.filter((x) => x.type === 'embed').map((x) => x.texts);
    expect(sent).toEqual([[QUERY_PREFIX + 'my claim'], ['short', 'a longer passage']]);
    expect(Array.from(q!)).toEqual([(QUERY_PREFIX + 'my claim').length, 1]);
    expect(ps.map((v) => v[0])).toEqual([5, 16]);
  });
  it('remembers vectors in this tab, keyed by text and kind', async () => {
    const m = await import('@/core/semantic/meaning');
    m.loadMeaning();
    await settle();
    await m.embed(['one', 'two'], 'passage');
    await m.embed(['two', 'one', 'two'], 'passage');
    await m.embed(['one'], 'query');
    const sent = FakeWorker.made[0]!.posted.filter((x) => x.type === 'embed');
    expect(sent).toHaveLength(2);
    expect(m.textHash('one')).toBe(m.textHash('one'));
    expect(m.textHash('one')).not.toBe(m.textHash('two'));
  });
  it('refuses to embed before it is loaded', async () => {
    const m = await import('@/core/semantic/meaning');
    await expect(m.embed(['x'], 'passage')).rejects.toThrow('not loaded');
  });
  it('a browser without workers fails politely', async () => {
    vi.stubGlobal('Worker', function NoWorker() {
      throw new Error('no workers');
    });
    const m = await import('@/core/semantic/meaning');
    m.loadMeaning();
    expect(m.meaningState()).toEqual({ status: 'failed', why: 'This browser cannot run the meaning model.' });
  });
});
