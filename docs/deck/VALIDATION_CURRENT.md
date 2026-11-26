# Current validation: `hemanth/lab-governance`

**Updated 26 November 2026, 10:30 Dubai. Code checked at `13e8fbc`, pushed as hbasired; this document is committed after it.** Earlier validation files in this folder describe earlier snapshots. Do not present their totals as new measurements.

## Where the work is

| Place | State |
|---|---|
| `hemanth/lab-governance` | All work below, pushed with normal fast-forward pushes (no force). |
| `main` and the live site `https://paper-trail-team1.vercel.app/` | The deployed bundle matched `main` when it was compared on 26 November. It has the Integrity Lab and House rules, but none of this branch's newer work. Only Yash merges into `main` and deploys. |

## Checks run on the branch head

All commands were run on the same machine, one at a time.

| Check | Result | What it does not establish |
|---|---|---|
| `npx tsc --noEmit` | Clean | Behaviour |
| `npx vitest run` | 37 files passed, 1 skipped; **1,049 tests passed**, 2 skipped (opt-in) | Browser behaviour |
| `npm run test:compass` (offline, Node 22.19+) | **27 passed**, 0 failed | Live registries |
| `npm run build` | Built | Deployment |
| `npx playwright test` (Chrome, 1 worker) | **59 passed**, 5 skipped (opt-in: `LIVE=1`, `MODEL=1`, `AUDIT=1`). Run in two batches because the machine is short of memory. | Live registry answers. The specs replay recorded registry answers, and on-device models are stand-ins unless `MODEL=1` is set. |
| `MODEL=1 npx playwright test tests/e2e/model-candidates.spec.ts` | Passed. Both real on-device models ran in Chrome on every candidate sentence of all 104 labelled claims: 449 support-model runs, recorded in `tests/unit/fixtures/nli-candidates.json` (26 November, 04:02 UTC). | Other claims, other papers, other languages |

Not run in this session: `buttons.spec.ts` with `AUDIT=1`, `live.spec.ts` with `LIVE=1`, `npm run demo:check` against a running server, a live Groq call with a real key, and a visual check of the six slides in PowerPoint.

## Measured numbers, and how far they reach

The Integrity Lab works these out from the data each time it loads. None is typed in.

**Claim checker** (`src/core/lab/claims-eval.json`, recorded support-model scores):

| Measure | Result | 95% range (Wilson) |
|---|---|---|
| False claims labelled Verified | 0 of 80 | 0% to 4.6% |
| True claims labelled Verified | 21 of 24 | 69% to 95.7% |
| Verified labels that were right | 21 of 21 | 84.5% to 100% |
| False claims labelled Disputed | 72 of 80 | 81.5% to 94.9% |
| Support model alone: ROC AUC, Brier score | 0.987, 0.056 | not computed |

Limits:
- The 104 claims were written by the team against 8 real abstracts.
- The hold-out set was used once as a test and then turned into rules (its file says so), so all 104 are now development data. This is not an independent benchmark and not a comparison with any other product.
- The model scores are one recording, made on 25 November.

**Where a page starts when it has scored several sentences** (`tests/unit/best-candidate.test.ts` on the real-model recording, top 3):

| Rule | False Verified | False Disputed | True Verified | True Disputed |
|---|---|---|---|---|
| Closest sentence (the rule the pages use; an exact quote wins) | 0 / 80 | 72 | 21 / 24 | 0 |
| Sentence the model backs most | 0 / 80 | 44 to 52 | 21 / 24 | 0 |
| Any sentence that disputes the claim | 0 / 80 | 75 to 76 | 18 to 19 / 24 | 5 to 6 |

**Reference checker** (`src/core/lab/sample-run.json`, a recorded replay, SAMPLE; recorded 2026-11-26T05:41:05Z after the policy change, with no verdict changed, SHA-256 `863b000838ae2ebc2f6ec0cacdfd4f331f01a9800a2a29c88346b4c0405edb3e`):
- Invented references caught: 8 of 8 among those that got an answer (95% range 67.6% to 100%). Counting the unanswered ones as misses, it is 8 of 12.
- False alarms on real references that got an answer: 0 of 7. With only 7 cases, the 95% range runs up to 35.4%.
- Coverage: 15 of 24 cases got an answer. The rest are listed one by one in the Lab, never counted as caught.

## Checked live from this machine

- On 26 November, around 09:50 Dubai, the invented DOI used in the samples, `10.1073/pnas.1523821113`, returned 404 from Crossref, DataCite and OpenAlex. The doi.org handle service answered "handle not found" (code 100).
- OpenAlex `search.semantic` answered without a key or email. It allows at most 50 results a page, and only some filters work beside it. This was checked by the Discover slice.

## Honest gaps

- Retrieval "by meaning" was measured against the support model's agreement, not against sentences a person marked as correct.
- Audit and Evidence compare claims with abstracts only, unless a PDF is added. A claim drawn from a paper's full text stays Reported.
- The owner AI key path and the Explain task were tested with stubbed AI answers only.
- See `docs/deck/INTEGRATION_HANDOVER.md` for what each owner needs to review.
