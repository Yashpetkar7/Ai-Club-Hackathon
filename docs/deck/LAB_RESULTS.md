> Historical snapshot: the current candidate and regenerated Lab evidence are described in [VALIDATION_CURRENT.md](VALIDATION_CURRENT.md) and [INTEGRATION_HANDOVER.md](INTEGRATION_HANDOVER.md). Do not quote the totals below as a new run.

# Integrity Lab: measured results and limits

## Task 3 recorded fallback: actual case-level evidence

**SAMPLE — an executed offline replay.** Execution recorded at **25 November 2026, 09:30:38 Dubai**; original registry capture time is **unknown**. Retry waits used a simulated clock; the stored request timings are not live latency measurements. The checker execution timestamps use wall time.

The complete snapshot is [sample-run.json](../../src/core/lab/sample-run.json). Its content SHA-256 is `77caf3ccc2c6138bdb3157cea124c5f39a1599d6740ea82e4d785cd3defb3ffe`. The artifact carries corpus and source-file hashes, actual checker results, traces and missing-request evidence. A matching hash is an internal content check, not an external signature. The recording test reruns the real checker through the unchanged shared replay and compares non-timing outcomes.

| Case ID | Family | Declared expectation | Actual verdict | Coverage evidence |
|---|---|---|---|---|
| `real:10.1016/j.ijinfomgt.2023.102642` | real | metadata-match | confirmed | Requested replay responses available |
| `real:10.1037/0033-2909.117.3.497` | real | metadata-match | confirmed | Requested replay responses available |
| `real:10.1038/s41598-023-41032-5` | real | metadata-match | confirmed | Requested replay responses available |
| `real:10.1086/261763` | real | metadata-match | confirmed | Requested replay responses available |
| `real:10.1093/qje/qju032` | real | metadata-match | confirmed | Requested replay responses available |
| `real:10.1108/jrit-01-2024-0017` | real | retraction-flag | retracted | Requested replay responses available |
| `real:10.1126/science.adh2586` | real | metadata-match | confirmed | Requested replay responses available |
| `real:10.1257/aer.20160696` | real | metadata-match | confirmed | Requested replay responses available |
| `real:10.1039/9781839167782-00159` | real | metadata-match | could-not-check | Missing recorded requests; unresolved |
| `real:10.1080/13546783.2024.2402129` | real | metadata-match | could-not-check | Missing recorded requests; unresolved |
| `real:10.15581/003.39.1.030` | real | metadata-match | could-not-check | Missing recorded requests; unresolved |
| `real:10.21125/inted.2022.1033` | real | metadata-match | could-not-check | Missing recorded requests; unresolved |
| `invented:total:1` | total-fabrication | reject-invented | could-not-check | Missing recorded requests; unresolved |
| `invented:author:1` | part-corrupted | reject-invented | details-differ | Requested replay responses available |
| `invented:year:1` | part-corrupted | reject-invented | details-differ | Requested replay responses available |
| `invented:identifier:1` | hijacked-identifier | reject-invented | wrong-paper | Requested replay responses available |
| `invented:placeholder:1` | placeholder | reject-invented | not-found | Input-only rejection; no registry request |
| `invented:plausible-title:1` | plausible-missing-title | reject-invented | could-not-check | Missing recorded requests; unresolved |
| `invented:total:2` | total-fabrication | reject-invented | could-not-check | Missing recorded requests; unresolved |
| `invented:author:2` | part-corrupted | reject-invented | details-differ | Requested replay responses available |
| `invented:year:2` | part-corrupted | reject-invented | details-differ | Requested replay responses available |
| `invented:identifier:2` | hijacked-identifier | reject-invented | wrong-paper | Requested replay responses available |
| `invented:placeholder:2` | placeholder | reject-invented | not-found | Input-only rejection; no registry request |
| `invented:plausible-title:2` | plausible-missing-title | reject-invented | could-not-check | Missing recorded requests; unresolved |

Generated reference text is shown with its invented label in the Lab; it is not copied into this document as a research citation. Every case remains in the run. The case-level table agrees with the family totals below.

The live runner uses the actual registry client, which may reuse in-memory responses. A new run timestamp does not establish a new registry retrieval. Cancellation stops the queue and discards late UI results; it does not abort already-issued HTTP requests through the current shared API. Completed live rows remain available when inspecting the recorded sample.

A detected miss remains a miss even if secondary coverage is limited. A caught discrepancy can also carry a coverage gap; those counts overlap. A clean real reference returned Confirmed alongside an error trace is unresolved in Lab evaluation. The checker verdict itself is never rewritten by the Lab.

## Task 2 recorded-response run, 25 November 2026

**Mode: SAMPLE — recorded registry responses, not a live check.** Corpus version 1 supplies structured reference fields to the real metadata checker. The paste parser, claim support and whole-product reliability are not measured.

Source: `tests/unit/lab-corpus.test.ts`, executed through the unchanged `tests/unit/replay.ts`; full verification test stage **09:21:51 Dubai, 25 November 2026**. The fixed manifest and source provenance are in `src/core/lab/corpus.ts` and `src/core/lab/recorded-seeds.json`. No result below is a competitor benchmark.

| Family | Declared cases | Actual checker outcomes | Interpretation |
|---|---:|---|---|
| Real controls | 12 | 7 Confirmed; 1 Retracted; 4 Could not check | The known retraction is an expected flag, not a false alarm. Four direct lookups are missing from the replay. |
| Total fabrication | 2 | 2 Could not check | Search requests are unrecorded; neither is counted as caught. |
| Part-corrupted | 4 | 4 Details differ | Two wrong-author and two wrong-year exercises were flagged. |
| Hijacked identifier | 2 | 2 Wrong paper | Both deliberately incorrect DOI-to-work associations were flagged. |
| Placeholder | 2 | 2 Not found | The reason is insufficient information to search; this is input rejection, not proof of nonexistence. |
| Plausible missing title | 2 | 2 Could not check | Search requests are unrecorded; neither is counted as caught. |
| **Total** | **24** | **16 resolved outcomes; 8 unresolved** | Fixed cases retained, including incomplete coverage. |

No invented case was Confirmed in this replay, and no unexpected false alarm was observed on a resolved real control. Those observations exclude eight unresolved cases and do **not** imply 100% accuracy. The generated exercises have eight flagged outcomes and four unresolved outcomes. The real controls have eight expected outcomes and four unresolved outcomes.

All eight unresolved cases correspond to observed `not recorded` requests. They are a limitation of the supplied replay coverage, not evidence of live registry downtime. Eight real controls have direct Crossref recordings; the other four have genuine captured search metadata but no recorded direct lookup. No missing HTTP response was synthesized.

The twelve controls include a retracted work, a book chapter and a conference contribution. They are distinct references, not twelve representative journal studies. Registry metadata itself can contain errors; a matching record does not establish scientific validity.

## Reproduction

```sh
npx vitest run tests/unit/lab-corpus.test.ts --disableConsoleIntercept --silent=false
npm run verify
```

The targeted suite passed **42 tests**. The full gate passed typecheck, **133 tests / 1 skipped**, and build. The skipped test is the repository's existing `FINAL=1` no-stubs check. Test counts are not accuracy scores.

The manifest fixes the selection rule before measurement: retain all eight direct recorded controls, then the first four eligible additional distinct-title records in DOI order. Code applies the same six transformations to the first two controls. Do not replace a case to improve the result. The shared fixture SHA-256 is `31230615fc87ac024c8e8336b95c661d33ad573eb640a48f2dc4a4daf9f21c7a`; its capture time is absent and is not guessed.

## Task 3 review checkpoint

The Lab page and runner are implemented on `hemanth/lab-governance`, with case-by-case evidence, cancellation, visible misses, partial-result restoration and the labelled recorded fallback. `npm run verify`, test stage **09:36:47 Dubai, 25 November 2026**, passed typecheck, **165 tests / 1 existing skip across nine files**, and build. The Lab-specific suite has **74 passing tests**. [Validation scope](VALIDATION.md).

The requested review stops here, after Task 3. A successful live-registry run, full-browser visual/375 px review and native assistive-technology checks remain pending. The sample must never be relabelled live. Rules, the standalone statement and the final Q&A are later tasks, not implied complete by this results table.
