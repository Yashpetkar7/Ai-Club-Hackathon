"""Train the retraction-risk signal: a small, readable logistic regression.

Input:  ml/work/risk_records.jsonl from ml/collect_risk_data.py (Crossref records, label 1 = Retraction Watch lists it as retracted).
Output: src/core/risk/model.json (weights the browser uses) and ml/results/risk.json (how it was tested).

Only fields the app's own Crossref record holds (src/core/registries/map.ts, fromCrossref) are used, so the browser computes
exactly the features the model was trained on: publisher, journal, year and number of authors.
Page, volume and issue were tried and dropped: a paper retracted before it was printed never gets a volume, so those
fields partly encode the retraction itself and would flag every new online-first paper. No title (retracted titles often start with "RETRACTED"), no notices, no citation counts.

Two tests, both on papers the model never saw:
  random split    papers from journals it may have seen in training
  journal split   papers from journals it never saw, so it cannot lean on the journal's name
Run from the repo root:  python -I -X utf8 ml/train_risk.py
"""
import json
import math
import os
import random
from collections import Counter

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupShuffleSplit, train_test_split

ROOT = os.getcwd()
SRC = os.path.join(ROOT, 'ml/work/risk_records.jsonl')
MODEL = os.path.join(ROOT, 'src/core/risk/model.json')
RESULTS = os.path.join(ROOT, 'ml/results/risk.json')
SEED = 13
MIN_COUNT = 8  # a publisher or journal needs this many training papers to get its own weight
YEARS = [(2000, 2004), (2005, 2009), (2010, 2014), (2015, 2017), (2018, 2019), (2020, 2021), (2022, 2023), (2024, 2100)]


def clean(s):
    return ' '.join(str(s or '').split()).strip().lower()


def year_of(m):
    for k in ('issued', 'published-print', 'published-online', 'published', 'created'):  # same order as crossrefYear in map.ts
        d = (m.get(k) or {}).get('date-parts') or [[None]]
        if d and d[0] and d[0][0]:
            return int(d[0][0])
    return None


def facts(m):
    """The same facts src/core/risk/risk.ts reads from a RegistryRecord."""
    people = m.get('author') or m.get('editor') or []
    authors = [a for a in people if any(ch.isalpha() for ch in str(a.get('family') or a.get('name') or a.get('given') or ''))]
    return {
        'publisher': clean(m.get('publisher')),
        'journal': clean((m.get('container-title') or [''])[0]),
        'year': year_of(m),
        'authors': len(authors),
        'pages': bool(clean(m.get('page')) or clean(m.get('article-number'))),
        'volume': bool(clean(m.get('volume'))),
        'issue': bool(clean(m.get('issue'))),
    }


rows = []
with open(SRC, encoding='utf-8') as f:
    for line in f:
        r = json.loads(line)
        rows.append((facts(r['record']), r['label']))
print('records', len(rows), Counter(y for _, y in rows))


def numeric(x):
    out = {
        'log_authors': math.log1p(x['authors']),
        'single_author': 1.0 if x['authors'] == 1 else 0.0,
        'no_authors': 1.0 if x['authors'] == 0 else 0.0,
    }
    for lo, hi in YEARS:
        out[f'year_{lo}'] = 1.0 if x['year'] and lo <= x['year'] <= hi else 0.0
    out['year_unknown'] = 0.0 if x['year'] else 1.0
    return out


NUM = list(numeric(rows[0][0]).keys())


def vocab(train, field):
    c = Counter(x[field] for x, _ in train if x[field])
    return sorted(k for k, n in c.items() if n >= MIN_COUNT)


def matrix(data, pubs, jours):
    pi = {k: i for i, k in enumerate(pubs)}
    ji = {k: i for i, k in enumerate(jours)}
    X = np.zeros((len(data), len(NUM) + len(pubs) + len(jours)), dtype=np.float32)
    for r, (x, _) in enumerate(data):
        n = numeric(x)
        X[r, :len(NUM)] = [n[k] for k in NUM]
        if x['publisher'] in pi:
            X[r, len(NUM) + pi[x['publisher']]] = 1
        if x['journal'] in ji:
            X[r, len(NUM) + len(pubs) + ji[x['journal']]] = 1
    return X, np.array([y for _, y in data])


def fit(train):
    pubs, jours = vocab(train, 'publisher'), vocab(train, 'journal')
    X, y = matrix(train, pubs, jours)
    clf = LogisticRegression(C=0.5, max_iter=3000, class_weight='balanced')
    clf.fit(X, y)
    return clf, pubs, jours


def auc(clf, pubs, jours, test):
    X, y = matrix(test, pubs, jours)
    return float(roc_auc_score(y, clf.predict_proba(X)[:, 1])), clf.decision_function(X), y


labels = [y for _, y in rows]
train, test = train_test_split(rows, test_size=0.2, random_state=SEED, stratify=labels)
clf, pubs, jours = fit(train)
auc_random, scores, ytest = auc(clf, pubs, jours, test)

groups = [x['journal'] or f'none-{i}' for i, (x, _) in enumerate(rows)]
gtr, gte = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED).split(rows, labels, groups))
clf_g, pubs_g, jours_g = fit([rows[i] for i in gtr])
auc_journal, _, yg = auc(clf_g, pubs_g, jours_g, [rows[i] for i in gte])

# Facts-only baseline: what is left without publisher and journal names.
def fit_numeric(train):
    X, y = matrix(train, [], [])
    c = LogisticRegression(C=0.5, max_iter=3000, class_weight='balanced').fit(X, y)
    return c
c_num = fit_numeric(train)
Xn, yn = matrix(test, [], [])
auc_numeric = float(roc_auc_score(yn, c_num.predict_proba(Xn)[:, 1]))
print('AUC random split', round(auc_random, 4), '| journal split', round(auc_journal, 4), '| without publisher/journal', round(auc_numeric, 4))

# Bands are read off ORDINARY held-out papers, so "higher than 95% of ordinary papers" means exactly that.
neg = np.sort(scores[ytest == 0])
p90, p97 = float(np.quantile(neg, 0.90)), float(np.quantile(neg, 0.97))
pos = scores[ytest == 1]
band_hits = {'above_p90': round(float((pos >= p90).mean()), 4), 'above_p97': round(float((pos >= p97).mean()), 4)}
print('retracted held-out papers above the 90th / 97th percentile of ordinary ones', band_hits)

# The shipped model is trained on all records, with the same settings.
final, fpubs, fjours = fit(rows)
w = final.coef_[0]
model = {
    'kind': 'logistic-regression',
    'note': 'Trained by ml/train_risk.py. A caution signal, never a verdict.',
    'intercept': float(final.intercept_[0]),
    'numeric': {k: float(w[i]) for i, k in enumerate(NUM)},
    'years': YEARS,
    'publisher': {k: round(float(w[len(NUM) + i]), 4) for i, k in enumerate(fpubs)},
    'journal': {k: round(float(w[len(NUM) + len(fpubs) + i]), 4) for i, k in enumerate(fjours)},
    'bands': {'p90': p90, 'p97': p97},
    'trainedOn': {'positives': int(sum(labels)), 'negatives': int(len(labels) - sum(labels))},
    'test': {'n': int(len(test)), 'auc': round(auc_random, 4), 'aucUnseenJournals': round(auc_journal, 4), 'aucWithoutNames': round(auc_numeric, 4), **band_hits},
}
os.makedirs(os.path.dirname(MODEL), exist_ok=True)
with open(MODEL, 'w', encoding='utf-8') as f:
    json.dump(model, f, separators=(',', ':'))
top = sorted(((v, k) for k, v in model['publisher'].items()), reverse=True)
result = {
    'data': 'Positives: Crossref records of papers Retraction Watch lists as retracted (journal articles, 2000 on). Negatives: Crossref random sample of journal articles, 2000 on, minus anything Retraction Watch lists.',
    'features': NUM + ['publisher one-hot (>= %d papers)' % MIN_COUNT, 'journal one-hot (>= %d papers)' % MIN_COUNT],
    'records': len(rows),
    'trainedOn': model['trainedOn'],
    'test': model['test'],
    'vocab': {'publishers': len(fpubs), 'journals': len(fjours)},
    'strongestPublishers': [k for _, k in top[:8]],
    'weakestPublishers': [k for _, k in top[-8:]],
    'numericWeights': model['numeric'],
    'dropped': 'page, volume and issue: they partly encode the retraction (papers withdrawn before print never get a volume) and would flag every new online-first paper',
    'caveat': 'Balanced training data: scores rank papers, they are not probabilities. Real retraction rates are far below 1%. Much of the signal is the publisher and journal, which says more about where retractions cluster than about any one paper.',
}
os.makedirs(os.path.dirname(RESULTS), exist_ok=True)
with open(RESULTS, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=1)
print('wrote', MODEL, round(os.path.getsize(MODEL) / 1e3, 1), 'KB and', RESULTS)
