# Models we trained

Two small models. Neither can create a verdict or a claim label: verdicts are made only in `src/core/verify`, claim labels only in `src/core/claims`. The numbers below come from `ml/results/*.json`, written by the scripts themselves. Raw data and weights in progress live in git-ignored `datasets/raw/` and `ml/work/`; see `datasets/README.md` for downloads.

Requirements: Python 3.11, `torch`, `transformers`, `onnxruntime`, `scikit-learn`, `numpy`. CPU is enough. These are used only to train; the site adds no new npm dependency.

## 1. Claim support, fine-tuned on SciFact

**Question it answers:** does this one sentence of a paper support, contradict or say nothing about the student's claim?

| | |
|---|---|
| Base | `cross-encoder/nli-deberta-v3-xsmall`, the model the site already ran (as `Xenova/nli-deberta-v3-xsmall`) |
| Data | SciFact (Wadden et al., 2020): 809 training claims, 300 dev claims, 5,183 abstracts |
| Pairs | premise = one abstract sentence (or a multi-sentence rationale), hypothesis = the claim, exactly as `src/pages/Evidence.tsx` calls the model. Neutral pairs are the cited abstract's sentences closest to the claim, plus one random sentence, so the model learns that "same words" is not "supports" |
| Split | train minus 10% (to choose the epoch); dev held out until the final report |
| Rule | an epoch is eligible only if its false-support rate on the validation split is no worse than the base model's. False support = entails >= 0.9 (the site's threshold) on a pair that is not SUPPORT |
| Shipped file | 8-bit ONNX, the same format the site already ran. Dev numbers are re-measured on that file, not on the full-precision weights |

```sh
python -I -X utf8 ml/finetune_claims.py   # about an hour on a laptop CPU
python -I -X utf8 ml/export_onnx.py       # writes public/models/paper-trail-nli-scifact/
MODEL=1 SUPPORT_MODEL=scifact npx playwright test tests/e2e/model.spec.ts   # scores our own claim sets in Chrome
```

Results: `ml/results/finetune.json` (`baseDev`, `tunedDev`, `shipped`, `inChrome`). Which model the site runs, and why, is `SUPPORT` in `src/core/claims/support.ts`. The model is switched only if it does at least as well on SciFact dev **and** lets no false claim from our own claim sets become Verified (`tests/unit/claims*.test.ts`).

## 2. Retraction risk signal

**Question it answers:** compared with ordinary journal articles, does this paper's publication record look like the records of papers that were later retracted?

| | |
|---|---|
| Positives | Crossref records of papers Retraction Watch lists as retracted (journal articles, 2000 on) |
| Negatives | Crossref's random sample of journal articles over the same years, minus anything Retraction Watch lists or Crossref links to a retraction |
| Features | only what the site's own Crossref record holds: publisher, journal, year band, number of authors. No title, notices or citation counts, which would leak the answer. Page, volume and issue were tried and dropped: papers withdrawn before print never get a volume, so those fields partly encode the retraction and would flag every new online-first paper |
| Model | logistic regression (scikit-learn), balanced classes, publishers and journals with at least 8 papers get their own weight |
| Tests | random 80/20 split, and a split by journal (papers from journals never seen in training), and a version without publisher or journal names |

```sh
python -I -X utf8 ml/collect_risk_data.py   # about 5 minutes, one Crossref request a second
python -I -X utf8 ml/train_risk.py          # seconds; writes src/core/risk/model.json
```

Results: `ml/results/risk.json`. The receipt shows the signal only when a paper scores above the 90th percentile of ordinary held-out papers, in grey, with the facts that pushed it up and the words "a trained model, not a check".

**Limits, said plainly.** Training data is balanced, so the score ranks papers; it is not a probability (real retraction rates are far below 1%). Much of the signal is the publisher and journal, which says where retractions cluster, not that one paper is unsound. It never changes a verdict and never turns anything red or green.
