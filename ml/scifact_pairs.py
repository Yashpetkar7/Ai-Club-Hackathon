"""SciFact dev pairs and metrics, built exactly as ml/finetune_claims.py builds them (same rule, same seed)."""
import json
import os
import random
import re

import numpy as np

DATA = os.path.join(os.getcwd(), 'datasets/raw/scifact/data')
SEED = 13
THRESHOLD = 0.9


def label_ids(label2id):
    return {k: int(v) for k, v in label2id.items()}


def _corpus():
    out = {}
    with open(os.path.join(DATA, 'corpus.jsonl'), encoding='utf-8') as f:
        for line in f:
            d = json.loads(line)
            out[d['doc_id']] = d['abstract']
    return out


def _words(s):
    return set(re.findall(r'[a-z0-9]+', s.lower()))


def _overlap(a, b):
    wa, wb = _words(a), _words(b)
    return len(wa & wb) / max(1, len(wa))


def dev_pairs(L):
    corpus = _corpus()
    rng = random.Random(SEED + 2)
    with open(os.path.join(DATA, 'claims_dev.jsonl'), encoding='utf-8') as f:
        claims = [json.loads(x) for x in f]
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
            rest = sorted((i for i in range(len(sents)) if i not in skip), key=lambda i: -_overlap(claim, sents[i]))
            pick = rest[:2] + (rng.sample(rest[2:], 1) if len(rest) > 2 else [])
            for i in pick:
                out.append((sents[i], claim, L['neutral']))
    return out


def metrics(p, g, label2id):
    L = label_ids(label2id)
    pred = p.argmax(-1)
    f1s = {}
    for name, k in L.items():
        tp = int(((pred == k) & (g == k)).sum())
        fp = int(((pred == k) & (g != k)).sum())
        fn = int(((pred != k) & (g == k)).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1s[name] = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    ent, con = L['entailment'], L['contradiction']
    not_sup, not_con = g != ent, g != con
    return {
        'pairs': int(len(g)),
        'accuracy': round(float((pred == g).mean()), 4),
        'macroF1': round(sum(f1s.values()) / 3, 4),
        'f1': {k: round(v, 4) for k, v in f1s.items()},
        'falseSupport': int(((p[:, ent] >= THRESHOLD) & not_sup).sum()),
        'falseSupportRate': round(float(((p[:, ent] >= THRESHOLD) & not_sup).sum() / max(1, not_sup.sum())), 4),
        'supportRecallAt09': round(float(((p[:, ent] >= THRESHOLD) & ~not_sup).sum() / max(1, (~not_sup).sum())), 4),
        'falseContradiction': int(((p[:, con] >= THRESHOLD) & not_con).sum()),
        'contradictionRecallAt09': round(float(((p[:, con] >= THRESHOLD) & ~not_con).sum() / max(1, (~not_con).sum())), 4),
    }
