# Integrity Lab: measured results and limits

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

The next slice adds the live runner, cancellation, visible case-by-case results, misses and a labelled recorded fallback. A live run must carry its own time and actual outcomes; this sample must never be relabelled live. Any in-flight transport limitation must be stated plainly because the current shared checker does not accept an abort signal.
