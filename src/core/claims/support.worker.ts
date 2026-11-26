/// <reference lib="webworker" />
import { AutoModelForSequenceClassification, AutoTokenizer, env } from '@huggingface/transformers';

/** Runs the support model on this device. It scores a claim against one sentence. It writes no text. */
let MODEL = 'Xenova/nli-deberta-v3-xsmall';
env.allowLocalModels = false;

type Loaded = { tokenizer: any; model: any };
let ready: Promise<Loaded> | null = null;

/** Our own fine-tuned model is served by this site under /models/; the original comes from Hugging Face. */
function choose(model?: string, local?: boolean, base = '/'): void {
  if (!model || ready) return;
  MODEL = model;
  env.allowLocalModels = !!local;
  env.allowRemoteModels = !local;
  if (local) env.localModelPath = `${base}models/`;
}

function load(): Promise<Loaded> {
  ready ??= (async () => {
    const files = new Map<string, { loaded: number; total: number }>();
    const progress_callback = (p: any) => {
      if (p.status !== 'progress' || !p.total) return;
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      postMessage({ type: 'progress', loaded, total });
    };
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL, { progress_callback });
    const model = await AutoModelForSequenceClassification.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm', progress_callback });
    return { tokenizer, model };
  })();
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

async function score(premise: string, hypothesis: string): Promise<{ entails: number; contradicts: number }> {
  const { tokenizer, model } = await load();
  const inputs = await tokenizer(premise, { text_pair: hypothesis, truncation: true });
  const { logits } = await model(inputs);
  const raw = Array.from(logits.data as Float32Array);
  const max = Math.max(...raw);
  const exp = raw.map((x) => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  const out = { entails: 0, contradicts: 0 };
  for (const [i, name] of Object.entries(model.config.id2label as Record<string, string>)) {
    if (/entail/i.test(name)) out.entails = exp[Number(i)]! / sum;
    if (/contradict/i.test(name)) out.contradicts = exp[Number(i)]! / sum;
  }
  return out;
}

onmessage = async (e: MessageEvent<{ type: 'load'; model?: string; local?: boolean; base?: string } | { type: 'score'; id: number; premise: string; hypothesis: string }>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      choose(m.model, m.local, m.base);
      await load();
      postMessage({ type: 'ready' });
    } else postMessage({ type: 'score', id: m.id, ...(await score(m.premise, m.hypothesis)) });
  } catch (err) {
    postMessage({ type: 'error', id: m.type === 'score' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
