"""Fine-tune the on-device claim-support model on SciFact.

Base:  cross-encoder/nli-deberta-v3-xsmall (the model Paper Trail already runs, before ONNX conversion).
Data:  SciFact (Wadden et al., 2020), claims checked against sentences of real paper abstracts.
Shape: premise = ONE sentence, hypothesis = the claim. That is exactly how the app calls the model.

Split: SciFact train (minus 10% for picking the epoch) to learn; SciFact dev is never seen until the final report.
Rule:  an epoch is only eligible if its false-support rate on the validation split is no worse than the base model's.
       False support = the model gives entails >= 0.9 (the app's threshold) to a pair that is not SUPPORT.

Run from the repo root:  python -I -X utf8 ml/finetune_claims.py
Writes ml/work/finetuned/ (weights, git-ignored) and ml/results/finetune.json (numbers, committed).
"""
import json
import os
import random
import re
import sys
import time

import torch
from torch.utils.data import DataLoader
from transformers import AutoModelForSequenceClassification, AutoTokenizer

ROOT = os.getcwd()
DATA = os.path.join(ROOT, 'datasets/raw/scifact/data')
BASE = os.path.join(ROOT, 'ml/work/base')
OUT = os.path.join(ROOT, 'ml/work/finetuned')
RESULTS = os.path.join(ROOT, 'ml/results/finetune.json')
THRESHOLD = 0.9  # POLICY.thresholds.supportVerified and .contradiction
SEED = 13
EPOCHS = int(os.environ.get('EPOCHS', 3))
LR = 3e-5
BATCH = 16
MAX_LEN = 192

random.seed(SEED)
torch.manual_seed(SEED)
torch.set_num_threads(os.cpu_count() or 4)

tok = AutoTokenizer.from_pretrained(BASE)
base_cfg = AutoModelForSequenceClassification.from_pretrained(BASE).config
L = base_cfg.label2id  # contradiction 0, entailment 1, neutral 2
assert set(L) == {'contradiction', 'entailment', 'neutral'}, L

corpus = {}
with open(os.path.join(DATA, 'corpus.jsonl'), encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        corpus[d['doc_id']] = d['abstract']


def words(s):
    return set(re.findall(r'[a-z0-9]+', s.lower()))


def overlap(a, b):
    wa, wb = words(a), words(b)
    return len(wa & wb) / max(1, len(wa))


def pairs_for(claims, rng):
    """Every pair is (sentence, claim, label). Neutral pairs are the hardest ones: the abstract's sentences closest to the claim."""
    out = []
    for c in claims:
        claim = c['claim']
        used = {}
        for doc, groups in c.get('evidence', {}).items():
            doc = int(doc)
            sents = corpus.get(doc)
            if not sents:
                continue
            for g in groups:
                idx = g['sentences']
                lab = 'entailment' if g['label'] == 'SUPPORT' else 'contradiction'
                out.append((' '.join(sents[i] for i in idx), claim, L[lab]))
                used.setdefault(doc, set()).update(idx)
        for doc in c.get('cited_doc_ids', []):
            sents = corpus.get(doc)
            if not sents:
                continue
            skip = used.get(doc, set())
            rest = sorted((i for i in range(len(sents)) if i not in skip), key=lambda i: -overlap(claim, sents[i]))
            pick = rest[:2] + (rng.sample(rest[2:], 1) if len(rest) > 2 else [])
            for i in pick:
                out.append((sents[i], claim, L['neutral']))
    return out


def load(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as f:
        return [json.loads(x) for x in f]


train_claims = load('claims_train.jsonl')
random.Random(SEED).shuffle(train_claims)
cut = len(train_claims) // 10
val_claims, fit_claims = train_claims[:cut], train_claims[cut:]
dev_claims = load('claims_dev.jsonl')

fit = pairs_for(fit_claims, random.Random(SEED))
val = pairs_for(val_claims, random.Random(SEED + 1))
dev = pairs_for(dev_claims, random.Random(SEED + 2))


def count(ps):
    names = {v: k for k, v in L.items()}
    c = {}
    for _, _, y in ps:
        c[names[y]] = c.get(names[y], 0) + 1
    return c


print('pairs', {'fit': count(fit), 'val': count(val), 'dev': count(dev)}, flush=True)


def collate(batch):
    enc = tok([b[0] for b in batch], [b[1] for b in batch], truncation=True, max_length=MAX_LEN, padding=True, return_tensors='pt')
    enc['labels'] = torch.tensor([b[2] for b in batch])
    return enc


@torch.no_grad()
def evaluate(model, ps):
    model.eval()
    probs, gold = [], []
    for i in range(0, len(ps), 64):
        b = ps[i:i + 64]
        enc = tok([x[0] for x in b], [x[1] for x in b], truncation=True, max_length=MAX_LEN, padding=True, return_tensors='pt')
        p = torch.softmax(model(**enc).logits, -1)
        probs.append(p)
        gold += [x[2] for x in b]
    p = torch.cat(probs)
    g = torch.tensor(gold)
    pred = p.argmax(-1)
    f1s = {}
    for name, k in L.items():
        tp = ((pred == k) & (g == k)).sum().item()
        fp = ((pred == k) & (g != k)).sum().item()
        fn = ((pred != k) & (g == k)).sum().item()
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1s[name] = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    ent, con = L['entailment'], L['contradiction']
    not_sup = g != ent
    not_con = g != con
    return {
        'pairs': len(ps),
        'accuracy': round((pred == g).float().mean().item(), 4),
        'macroF1': round(sum(f1s.values()) / 3, 4),
        'f1': {k: round(v, 4) for k, v in f1s.items()},
        # The two numbers the app cares about, at its 0.9 threshold.
        'falseSupport': int(((p[:, ent] >= THRESHOLD) & not_sup).sum().item()),
        'falseSupportRate': round(((p[:, ent] >= THRESHOLD) & not_sup).sum().item() / max(1, not_sup.sum().item()), 4),
        'supportRecallAt09': round(((p[:, ent] >= THRESHOLD) & ~not_sup).sum().item() / max(1, (~not_sup).sum().item()), 4),
        'falseContradiction': int(((p[:, con] >= THRESHOLD) & not_con).sum().item()),
        'contradictionRecallAt09': round(((p[:, con] >= THRESHOLD) & ~not_con).sum().item() / max(1, (~not_con).sum().item()), 4),
    }


model = AutoModelForSequenceClassification.from_pretrained(BASE)
t0 = time.time()
base_val = evaluate(model, val)
base_dev = evaluate(model, dev)
print('base val', base_val, flush=True)
print('base dev', base_dev, f'{time.time() - t0:.0f}s', flush=True)

opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
loader = DataLoader(fit, batch_size=BATCH, shuffle=True, collate_fn=collate, generator=torch.Generator().manual_seed(SEED))
total = EPOCHS * len(loader)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / (0.1 * total)) * max(0.0, (total - s) / total))

history = []
best = None
step = 0
for epoch in range(1, EPOCHS + 1):
    model.train()
    t0 = time.time()
    for batch in loader:
        loss = model(**batch).loss
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        sched.step()
        opt.zero_grad()
        step += 1
        if step % 25 == 0:
            print(f'epoch {epoch} step {step}/{total} loss {loss.item():.4f} {time.time() - t0:.0f}s', flush=True)
    v = evaluate(model, val)
    eligible = v['falseSupportRate'] <= base_val['falseSupportRate']
    history.append({'epoch': epoch, 'val': v, 'eligible': eligible, 'seconds': round(time.time() - t0)})
    print('epoch', epoch, 'val', v, 'eligible', eligible, flush=True)
    if eligible and (best is None or v['macroF1'] > best[1]['macroF1']):
        best = (epoch, v)
        model.save_pretrained(OUT)
        tok.save_pretrained(OUT)

result = {
    'base': 'cross-encoder/nli-deberta-v3-xsmall',
    'data': 'SciFact (allenai), claims_train.jsonl for training, claims_dev.jsonl held out',
    'pairing': 'premise = one abstract sentence (or a multi-sentence rationale), hypothesis = claim; neutral = closest non-rationale sentences of the cited abstract plus one random',
    'threshold': THRESHOLD,
    'settings': {'epochs': EPOCHS, 'lr': LR, 'batch': BATCH, 'maxLen': MAX_LEN, 'seed': SEED},
    'pairs': {'fit': count(fit), 'val': count(val), 'dev': count(dev)},
    'baseVal': base_val,
    'history': history,
    'chosenEpoch': best[0] if best else None,
    'baseDev': base_dev,
}
if best:
    tuned = AutoModelForSequenceClassification.from_pretrained(OUT)
    result['tunedDev'] = evaluate(tuned, dev)
    print('tuned dev', result['tunedDev'], flush=True)
else:
    print('No epoch kept false support at or below the base model. Nothing saved.', flush=True)

os.makedirs(os.path.dirname(RESULTS), exist_ok=True)
with open(RESULTS, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=1)
print('wrote', RESULTS)
