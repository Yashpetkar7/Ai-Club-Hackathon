# Integrity Lab corpus, version 1

This folder contains the fixed corpus, the live-run controller, separate evaluation rules and the recorded SAMPLE used by the Integrity Lab page.

## What the corpus measures

`corpus.ts` exports `CORPUS_MANIFEST`, `LAB_CORPUS`, `FAILURE_FAMILIES` and `buildCorpus()`. Each case contains structured `RawReference` fields for the real `checkReference` function, a declared expectation, a visible authenticity label and provenance. This scope is **metadata checking**. The reference parser, scientific truth and semantic claim support are outside this corpus.

The corpus contains twelve distinct real controls and twelve code-generated exercises. The exercise counts are two complete inventions, four partial corruptions (two author and two year changes), two swapped identifiers, two placeholders and two plausible titles with invented wording. These are predeclared design choices, not estimates of how often errors occur in real research. The five requested families come from `docs/team/HEMANTH.md`; the brief links the motivating taxonomy at <https://arxiv.org/abs/2602.05930>.

All direct Crossref records in the shared fixture are retained, including its retracted work. Four further records are selected by the documented DOI order and metadata rules before checker measurement. Repeated styles or versions of the same title do not supply the minimum number of controls. The additional controls include a book chapter and a conference contribution; the corpus is not described as twelve independent journal studies.

Every invented exercise is generated inside `corpus.ts` and labelled **Invented for this Lab; do not cite**. Display that label beside its reference. No DOI is invented: identifier corruption swaps two known real identifiers. A plausible title with added wording is an intentionally altered input, not a claim that every registry was searched or that no coincidental work exists.

## Where the real data comes from

`recorded-seeds.json` contains unchanged metadata excerpts from `tests/unit/fixtures/registry.json`, including the original request URL and search-result index where applicable. Its SHA-256 value identifies the source fixture. It is **not** an HTTP replay file; in particular, a record seen in a search response is not passed off as a recorded response to that work's DOI endpoint.

From the repository root, `node src/core/lab/collect-seeds.mjs` reproduces these excerpts without network access. A changed source selection needs a new corpus-version review. Do not remove difficult cases or add favorable cases after observing their results. The tests compare every real control's fields with the actual source entry in the shared fixture.

The fixture does not provide a capture timestamp. None is invented. Its metadata and any replay based on it must be identified as recorded/SAMPLE when displayed, not a live check.

## Offline replay coverage

`tests/unit/lab-corpus.test.ts` calls the actual checker and registry client through the unchanged `tests/unit/replay.ts`. It refuses recording mode so it cannot overwrite the shared fixture. Its fetch wrapper observes and rethrows unrecorded-request errors; it never supplies missing registry responses.

The initial executed replay covered all twenty-four cases. It returned seven Confirmed, one Retracted, four Details differ, two Wrong paper, two Not found and eight Could not check results. The eight unresolved cases were four real controls with search metadata but missing DOI requests, both total-invention searches, and both plausible-title searches. These are **replay coverage gaps**, not measured live registry outages. The result on the known retracted control is expected, not a false alarm. No invented reference was confirmed in this recorded run; unresolved cases are not counted as caught.

Reproduce the test and its machine-readable measurement output with:

```sh
npx vitest run tests/unit/lab-corpus.test.ts --disableConsoleIntercept --silent=false
```

The initial run passed forty-two tests. The tests were written before the implementation; the first run failed because the corpus module did not yet exist. These numbers describe this test execution, not whole-platform accuracy or a representative benchmark.

Future measurements must keep every case, actual verdict, trace and unresolved reason. An unexpected confirmation of an invented case is a miss to display, not a reason to change the case. A real control that cannot be checked is unresolved. Do not infer that absent replay coverage is a real-time network failure. Any live result may differ as registry data changes; preserve the corpus version and show when the actual run occurred.

## Live runs and cancellation

`runner.ts` defaults to the real `checkReference` and `registries`. It freezes a copy of the full case list before work begins, runs one case at a time, and publishes snapshots with explicit unrun, active, completed, cancelled or error states. A thrown exception is stored as a run error; no `ReferenceCheck` is manufactured for it.

Cancel resolves the run immediately, preserves completed results, marks the active case cancelled and leaves later cases unrun. It stops scheduling and ignores late results. The shared checker has no caller abort signal, so an in-flight request and its internal retries may still finish. The page cancels on unmount and invalidates callbacks from earlier runs.

The shared registry client has an in-memory cache. A live run may reuse data already fetched during this page load. Run and check timestamps therefore do not prove the registry was freshly fetched at those times. Fresh lookup controls and cache-age reporting require a shared-code change by Yash; this folder does not alter the client.

`evaluate.ts` keeps exercise outcomes separate from checker verdicts and preserves the returned verdict in full. An invented reference confirmed by the checker, or a known retraction confirmed as clean, remains a visible miss even if another registry failed. A detected mismatch can remain caught with a separate coverage limitation. A clean real control returned as Confirmed with an error trace is unresolved. Unknown verdicts cannot count as success. Coverage-gap counts overlap outcome counts; they must not be added to the case total.

## Recorded SAMPLE artifact

`sample-run.json` was refreshed for this candidate by executing the actual checker and unchanged replay using `scripts/record-lab-sample.mjs --write`. The original Vitest recording test remains the full-suite comparison; current measured results and limitations are in `docs/deck/VALIDATION_CURRENT.md`. It includes the complete case snapshot, actual returned checks, per-case missing-request URLs, source hashes and a content hash. The replay execution timestamp is separate from the original registry capture timestamp, which is unknown. Retry waits were simulated to keep the test offline and quick; stored trace timings must not be presented as live performance measurements.

Generate an updated artifact only after reviewing a source or corpus change:

```sh
LAB_WRITE_SAMPLE=1 npx vitest run tests/unit/lab-recording.test.ts --disableConsoleIntercept --silent=false
```

Without `LAB_WRITE_SAMPLE=1`, the test reruns the checker and compares the result content with the stored artifact; it does not write files. It refuses `RECORD=1` and never fills missing registry responses. `sample.ts` checks the artifact's content hash, corpus identity, mode and provenance before exposing an immutable snapshot. These checks detect mismatches; they are not an external signature or proof of complete history.

Live registry availability, real-browser cancellation interaction, contrast, visual layout and 375 px rendering still need browser validation. Unit and jsdom structural checks do not establish those results.

## How accurate is it? (claim benchmark and metrics)

The Lab page opens with numbers worked out in the browser on every visit, with no network:

- `claims-eval.json` is a browser copy of `tests/claims-set.ts` (FALSE_CLAIMS 42, TRUE_CLAIMS 14) and `tests/claims-holdout-set.ts` (HOLD_FALSE 38, HOLD_TRUE 10), the 8 real abstracts in `tests/unit/fixtures/abstracts.json` and the recorded scores of the support model the site ships: `tests/unit/fixtures/nli-scifact.json` while `SUPPORT.key` in `src/core/claims/support.ts` is `scifact` (since the 26 November merge of main), `tests/unit/fixtures/nli.json` for the original model. Its provenance block names the source files and their SHA-256 values (line endings normalised), the model, when the scores were recorded, and the hold-out caveat copied word for word from its file. `tests/unit/lab-claims-eval.test.ts` rebuilds it from those files and fails when the copy drifts. Refresh it only after a reviewed source change:

  ```sh
  LAB_WRITE_CLAIMS=1 npx vitest run tests/unit/lab-claims-eval.test.ts
  ```

- Each claim stores the sentence its recorded score belongs to (`premise`). Neither score file stores it; it is the closest sentence by shared words, the way `tests/e2e/model.spec.ts` records it. On 26 November 2026 the ranking code at commit 5827eca (where `nli.json` was committed) and the current code picked the same sentence for all 104 claims. If the ranking ever picks another sentence, the drift test fails and the page leaves that score out instead of applying it to the wrong sentence. Record again with `MODEL=1`.
- `claims-data.ts` checks the copy's hash, kinds, counts, gold labels per set and score ranges before anything is shown.
- `metrics.ts` runs the real `rankSentences` and `judge()` over every claim three ways (recorded scores, no model, model forced to say yes), and works out the confusion matrix, false-Verified rate, precision, recall, F1 and Wilson 95% intervals; the support score alone by threshold, its ROC AUC and Brier score; and the contradiction score alone. Each claim is judged as if its source had passed the reference check, so only the claim checker is measured; that input is never stored or shown as a verdict. For the reference checker it reads `evaluateCase` over the recorded replay: detection on invented cases, false alarms on real controls and coverage, each with its denominator. Cases without an answer are left out of the rates and listed; they are never counted as caught.
- `retrieval.ts` compares picking sentences by shared words with picking them by meaning and words (`hybridRank`). It needs both on-device models, so it only runs when the student presses Compare on this device; unit tests use stand-in models. The support model is the referee, not a person who marked the right sentence.
- `tests/unit/lab-metrics.test.ts` checks the numbers against `judge()` run directly on the test sets, checks that they agree with each other, and pins the values measured on 26 November 2026.

These are development numbers: the team wrote the claims against 8 abstracts, the rules were tuned on both sets, and the model scores are a recording. The only genuinely held-out measurement is the hold-out set's first run, quoted from its file. This is not a comparison with any other product.
