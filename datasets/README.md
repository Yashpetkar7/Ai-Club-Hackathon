# Datasets

Raw downloads go in `datasets/raw/`, which git ignores. Only small files built from them are committed, and every one of them can be rebuilt from the commands below. The site also shows this on its **Data and models** page (`#/data`).

| Dataset | Where from | Used for | What is committed |
|---|---|---|---|
| Retraction Watch database | Crossref, <https://gitlab.com/crossref/retraction-watch-data> (`retraction_watch.csv`, about 68 MB, updated every working day) | Third retraction source in every check; training the retraction-risk signal | `public/data/retraction-watch/` (256 DOI shards plus `meta.json`, about 6 MB) |
| SciFact | Allen Institute for AI, Wadden et al. (2020), *Fact or Fiction: Verifying Scientific Claims*, <https://github.com/allenai/scifact> (`data.tar.gz`, about 3 MB) | Fine-tuning and testing the on-device claim-support model | Nothing from the data; the trained model and its scores (see `ml/README.md`) |
| Crossref sample | Crossref REST API, `/works?sample=100` and DOI filters, fetched by `ml/collect_risk_data.py` | Ordinary papers (negatives) and the Crossref records of retracted papers (positives) for the risk signal | Nothing from the records; the model weights in `src/core/risk/model.json` |

## Rebuild

From the repository root:

```sh
mkdir -p datasets/raw/scifact
curl -L -o datasets/raw/retraction_watch.csv https://gitlab.com/crossref/retraction-watch-data/-/raw/main/retraction_watch.csv
curl -L -o datasets/raw/scifact/data.tar.gz https://scifact.s3-us-west-2.amazonaws.com/release/latest/data.tar.gz
tar -xzf datasets/raw/scifact/data.tar.gz -C datasets/raw/scifact
node scripts/build-retraction-index.mjs
```

`meta.json` records the SHA-256 of the CSV the index was built from, the number of notices read, and the rule used. A newer CSV gives a newer index; the tests check the shape, not exact counts.

## The rule for the Retraction Watch index

- One entry per original-paper DOI. Notices without a DOI cannot be looked up and are left out (counted in `meta.json`).
- Corrections are ignored. Of the remaining notices for a paper, the latest decides: **Retraction** gives `R`, **Expression of concern** gives `C`, **Reinstatement** removes the paper.
- Reasons are Retraction Watch's own controlled list, the union over the paper's notices.
- No author names, affiliations or notes are copied into the index.

## What the index may decide

It can add a retraction or an expression of concern to a check, with its reasons. It can never clear a retraction that Crossref or OpenAlex reported. If the index cannot be read, the check records "Retraction Watch did not answer" and nothing else changes. See `withRetractionWatch` in `src/core/verify/verdict.ts` and `tests/unit/retraction-watch.test.ts`.

Not every retraction is in Retraction Watch: the retracted paper in our demo (`10.1108/jrit-01-2024-0017`) is reported by its publisher through Crossref but has no Retraction Watch entry. That is why all three sources are asked.
