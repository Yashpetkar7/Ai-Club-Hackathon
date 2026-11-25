# Integrity Lab corpus, version 1

This folder contains Task 2 data and its provenance. It does not implement the live runner or the Lab page.

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
