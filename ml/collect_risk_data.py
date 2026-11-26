"""Collect Crossref records for the retraction-risk scorer.

Positives: a random sample of papers Retraction Watch lists as retracted (journal articles, published 2000 or later).
Negatives: Crossref's own random sample of journal articles over the same years, minus anything Retraction Watch lists.
Both sides come from the same Crossref API, so the model cannot learn a difference in where the data came from.

Run from the repo root:  python -I -X utf8 ml/collect_risk_data.py
Writes ml/work/risk_records.jsonl (git-ignored). About 3 to 5 minutes, one request per second.
"""
import csv
import json
import os
import random
import time
import urllib.parse
import urllib.request

ROOT = os.getcwd()
RW = os.path.join(ROOT, 'datasets/raw/retraction_watch.csv')
OUT = os.path.join(ROOT, 'ml/work/risk_records.jsonl')
UA = 'paper-trail-student-project/0.1'
N_POS = int(os.environ.get('N_POS', 6000))
N_NEG = int(os.environ.get('N_NEG', 6000))
# RESUME=1 keeps the records already saved and only tops up the negatives, three sample requests at a time.
RESUME = os.environ.get('RESUME') == '1'
SEED = 13


def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'user-agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print('retry', attempt, str(e)[:120], flush=True)
            time.sleep(3 * (attempt + 1))
    return None


def norm(d):
    return d.strip().lower()


# Retraction Watch: the latest non-correction notice decides, the same rule the shipped index uses.
notices = {}
with open(RW, encoding='utf-8') as f:
    for r in csv.DictReader(f):
        d = norm(r['OriginalPaperDOI'])
        if not d.startswith('10.') or ',' in d:
            continue
        if r['RetractionNature'] == 'Correction':
            continue
        m = r['RetractionDate'].split(' ')[0].split('/')
        date = f'{m[2]}-{m[0].zfill(2)}-{m[1].zfill(2)}' if len(m) == 3 else ''
        notices.setdefault(d, []).append((date, r['RetractionNature']))
listed = set(notices)
retracted = sorted(d for d, ns in notices.items() if sorted(ns)[-1][1] == 'Retraction')
rng = random.Random(SEED)
rng.shuffle(retracted)
print('retracted DOIs in Retraction Watch', len(retracted), flush=True)

seen = set()
pos = neg = 0
if RESUME and os.path.exists(OUT):
    with open(OUT, encoding='utf-8') as f:
        for line in f:
            r = json.loads(line)
            seen.add(norm(r['record'].get('DOI', '')))
            pos += r['label'] == 1
            neg += r['label'] == 0
    print('resuming with', pos, 'positives and', neg, 'negatives', flush=True)
with open(OUT, 'a' if RESUME else 'w', encoding='utf-8') as out:
    for i in range(0, len(retracted), 60):
        if pos >= N_POS:
            break
        batch = retracted[i:i + 60]
        flt = ','.join(['type:journal-article', 'from-pub-date:2000'] + [f'doi:{d}' for d in batch])
        j = get('https://api.crossref.org/works?rows=100&filter=' + urllib.parse.quote(flt, safe=':,/'))
        time.sleep(1)
        for it in (j or {}).get('message', {}).get('items', []):
            d = norm(it.get('DOI', ''))
            if d in seen:
                continue
            seen.add(d)
            out.write(json.dumps({'label': 1, 'record': it}) + '\n')
            pos += 1
        print('positives', pos, flush=True)

    from concurrent.futures import ThreadPoolExecutor
    url = 'https://api.crossref.org/works?sample=100&filter=type:journal-article,from-pub-date:2000'
    pool = ThreadPoolExecutor(3)
    while neg < N_NEG:
        items = [it for j in pool.map(get, [url] * 3) for it in (j or {}).get('message', {}).get('items', [])]
        time.sleep(1)
        for it in items:
            if neg >= N_NEG:
                break
            d = norm(it.get('DOI', ''))
            if d in seen or d in listed:
                continue
            # Belt and braces: Crossref's own retraction links also exclude a work from the negatives.
            if any('retract' in str(u.get('type', '')).lower() for u in it.get('updated-by', []) + it.get('update-to', [])):
                continue
            seen.add(d)
            out.write(json.dumps({'label': 0, 'record': it}) + '\n')
            neg += 1
        print('negatives', neg, flush=True)
print('wrote', OUT)
