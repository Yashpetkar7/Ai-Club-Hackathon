# Hemanth handover

## Current update: 25 November 2026

**Branch:** `hemanth/lab-governance`. Only this branch is authorised for Hemanth's push.

**Snapshots inspected:** main `7b0391ff0ec90e8b8f9fd2a030845cc42d3a753d`; Yash integration `59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5`. The session fetched origin, switched to Hemanth's branch and merged main without a conflict. Integration was inspected and tested in a detached worktree; its additional changes were not merged into Hemanth's branch.

### What works and what changed

Main now contains code for the Planner request/fallback, heuristic Challenger, citation map with a table equivalent, local PDF text extraction, downloadable HTML evidence report, tour, command palette and source-policy checks. This is a source-inspection finding supported by the executed unit/build gate; it is not a new live-browser demonstration of every feature. Successful AI provider calls remain unimplemented. Library, Evidence, Ask, Write, citation Export, Lab and the dedicated AI-use statement still have stubs. Rules remains the initial policy table. See [current repository review](REPO_UPDATE_2026-11-25.md).

The six-slide [deck](DECK.md), [architecture alignment](NIHAL_ALIGNMENT.md), [team ideas](TEAM_IDEAS.md), [research audit](RESEARCH_AUDIT.md) and [validation record](VALIDATION.md) now distinguish main from integration-only changes. The new comparison also records remaining gaps instead of describing all safeguards as complete.

The requested personal HTML teaching guide is prepared outside the repository and delivered separately in chat. It is not the official six-slide submission and is excluded from the commit and push.

### Tests actually executed

| Checkout | Command and Dubai test-stage time, 25 November | Observed result |
|---|---|---|
| Hemanth after merging main | `npm run verify`, 08:29:55 | Typecheck passed; **91 passed, 1 skipped** in 4 test files; build passed |
| Detached integration `59a876d` | `npm run verify`, 08:30:31 | Typecheck passed; **126 passed, 1 skipped** in 6 test files; build passed |
| Final main-based Hemanth verification | `npm run verify`, 08:37:46 | Typecheck passed; **91 passed, 1 skipped** in 4 test files; build passed |

All runs skip the existing `FINAL=1` no-stubs check. The branches' suites differ; their counts are not an accuracy comparison or a Lab result. No new application e2e, live-registry, 375 px, keyboard or axe outcome is claimed here. The private guide's own validation is separate from product validation.

### Architecture decision and shared-code requests

Nihal's logical separation is useful, but the screenshot is not the current deployment diagram. Replace PostgreSQL/server PDF/vector storage with browser IndexedDB and local document processing. Split AI search suggestions from code retrieval, keep assignment writing with the student, and describe on-demand retraction metadata rather than continuous publication monitoring. [Full mapping](NIHAL_ALIGNMENT.md).

| Owner | Request | Why it remains open |
|---|---|---|
| Yash | Review and integrate the new safeguards through the team's normal process | The executable hook fix, new neutral verdict, request guard, decision events and search fallback are in integration, not yet main |
| Yash | Define precise registry-coverage wording and tests | Integration returns `one-registry` on a silent secondary lookup, but a secondary not-found response can still yield `confirmed`; fields are not independently corroborated by two matching records |
| Yash and Siddal | Reconcile the strict three-key narrative with the reasoned-exception path | `exportable` is strict; `citable` permits an approved eligible exception. The completed citation export boundary still needs testing |
| Yash and Nihal | Complete provider execution and accurate decision accounting | The gateway still returns unavailable/not-built; integration's Planner decision log writes `changed: []` and can classify edits or trimmed suggestions as rejected |
| Yash | Correct PDF extraction coverage and tutorial narration | Extraction stops after 80 pages while the UI can report the document's total page count; tour narration contains fixed result wording |
| Yash | Describe policy switches by the evidence they use | Journal/conference type is not proof of peer review; the retraction switch is not fully wired into the checked policy path |
| Hemanth, with owners supplying event contracts | Keep disclosure limited to available events | Failed requests can be unrecorded; a valid hash chain does not prove complete history; missing decision categories stay unknown |

No message was sent to another teammate. These requests are recorded for Hemanth to discuss with the team.

### Scope and delivery

Manual edits in this update are confined to `docs/deck/**` and `docs/prompts/HEMANTH.md`. Shared application changes arrived through the required merge from main, not edits by Hemanth. The private presentation is outside Git. No pull request, deployment, dependency addition, force-push or branch deletion is part of this work. The final delivery response records the actual pushed commit after GitHub confirms it.

The original review after the deck draft remains the implementation checkpoint. This update and private teaching guide do not mark tasks 2–6 complete. The genuine Check screenshot and final PowerPoint composition remain pending, along with Hemanth's APA-guide input.

## Archived deck-review handover: 24 November 2026

The remainder records the earlier delivery and its then-current findings. Use the update above and the dated repository review for current implementation status.

**Branch:** `hemanth/lab-governance`

**Baseline:** `723523c91b2cdcf26b8b9cbdf98e4facfc160df5`

**Prepared:** 24 November 2026, Dubai time

**Stage:** first deck draft and research audit, awaiting Hemanth's required review. Tasks 2–6 are not complete.

## What works / what was produced

- [DECK.md](DECK.md): six slides in the required order, with exact copy, box/arrow specifications, rubric coverage and explicit built/planned distinctions.
- [RESEARCH_AUDIT.md](RESEARCH_AUDIT.md): corrections to the recovered report, source-linked competitor evidence, qualified adoption/pricing claims and research-verification limits.
- [TEAM_IDEAS.md](TEAM_IDEAS.md): proposals with owners, file boundaries and behavioral acceptance tests.
- [VALIDATION.md](VALIDATION.md): actual test results, installation limitation, missing visual evidence and screenshot capture instructions.
- [NIHAL_ALIGNMENT.md](NIHAL_ALIGNMENT.md): the supplied architecture mapped to current code and agreed roles; storage/synthesis conflicts, planned features, corrected data paths and owner decisions.
- Hemanth's exact follow-up is recorded in `docs/prompts/HEMANTH.md`.

No product source, shared verifier, schema, logging code, dependency manifest or lockfile was changed.

## Tested and observed

The existing checker suite ran with recorded registry responses: **38 tests passed**, including **3 of 3 total-outage cases**. This is regression evidence, not a Lab score or a production accuracy estimate. See [VALIDATION.md](VALIDATION.md) for the command, time and fixture hash.

The full `npm run verify` gate also passed: typecheck, **49 passed / 1 skipped** across three test files, and production build. The skipped test is the existing `FINAL=1`-only check that no page remains a stub. This draft does not meet that final-submission condition. See [VALIDATION.md](VALIDATION.md) for the exact scope.

## What does not work or remains incomplete

- A genuine screenshot is missing. Local Chromium launch was denied before it opened a page; the cloud browser could not reach the development server and subsequent observation was blocked by browser policy. The deck contains a marked slot, not fabricated UI.
- No visual, 375 px, keyboard or axe result is claimed.
- The six-slide text is not a submitted PowerPoint. The team's planned composition and timed reading review remain.
- No live Lab result exists. Corpus, Lab, Rules additions, statement UI and the final fifteen-question `QA.md` follow the review checkpoints in the brief.
- The existing AI handler does not implement successful tasks, and Evidence/Ask/Library/Write/Export/Lab/AiStatement are stubs at the audited baseline.
- The separate original Rules and Regulations and Submission Guidelines/Rubrics PDFs were not available for this audit. The deck uses the team's extracted rubric; the team should cross-check the originals before submission.
- APA contribution-statement requirements remain a marked Hemanth-supplied slot.

## Requests for Yash and the relevant owners

| Priority | Request and evidence | Acceptance before a stronger deck claim |
|---|---|---|
| First | **Make automatic Git hooks work.** Both checked-in hooks have mode `100644`; the first commit reported that the non-executable pre-commit hook was ignored. The unchanged hook passed when explicitly run against this slice's staged patch. | Yash sets executable modes in the owned hook files and verifies normal commit/push invocation runs them. Installing `core.hooksPath` alone is insufficient. Hemanth does not change shared hook files or use a bypass. |
| First | **Resolve the export exception.** `contracts.exportable` requires all keys; `store/actions.citable` also accepts approved items with a reason and an eligible origin/record. Export is unbuilt. | Agree strict export or explicitly disclosed exceptions. Test the actual exported output for every key combination and any exception. Hemanth must not silently decide this policy through page code. |
| First | **Define partial-registry behavior.** After a Crossref match, failed OpenAlex enrichment can coexist with `confirmed` and an error trace. OpenAlex may contribute retraction metadata. | Decide whether missing enrichment blocks confirmation or is separately disclosed. Pin the agreed behavior with a regression test and update receipt wording. Preserve core ownership of verdicts. |
| First | **Finish and validate AI enforcement.** The gateway checks a client-declared minimum level, has no successful task implementation, and does not reject all values outside the allowed set. | Validate task and level, enforce the agreed permission boundary, implement the task and test it. Do not claim tamper-resistant institutional authorization from a student-set browser value. |
| Before statement completion | **Define log event semantics for AI actions and decisions.** Generic action/detail strings do not establish kept/changed/rejected counts; `editSource` and Find's Skip are not fully recorded. | Record explicit attributable events or accept that the statement shows unknown/unrecorded categories. No inference of “no AI used” from a missing event. Hemanth can implement the truthful fallback in owned files. |
| Before screenshot/copy freeze | **Correct Check's registry-coverage sentence.** It currently implies every reference is checked in all services, but the verifier branches. | Wording matches the actual trace and available retraction coverage. No implication of full bibliographic or scientific validation. |
| Before corpus expansion | **Confirm supplementary replay ownership if needed.** Hemanth can add Lab files/tests but cannot edit `tests/unit/replay.ts` or its shared fixture under the brief. | Reuse recorded real metadata when sufficient. If new lookups are needed, agree an owned supplemental fixture mechanism or have Yash add the recordings. Never synthesize a registry response and call it a recording. |
| If network cancellation is required | **Expose caller cancellation in the checker/registry API.** Current page patterns ignore stale runs but cannot abort an issued HTTP request. | Test transport abort if promised; otherwise disclose that Cancel stops new cases and ignores late results while in-flight requests may finish. |

Additional log limit: verifying a valid prefix cannot detect a removed suffix. A rebuilt local chain can also pass. The statement should say the supplied entries are internally consistent, with the required “tamper-evident, not tamper-proof” explanation.

These are handover requests only. No message has been sent to another team member.

## Routine decisions made

- Used the measured total-outage result on slide 1, rather than a competitor score or unverified claim of improved accuracy.
- Omitted market-share and price numbers from the slides.
- Corrected the policy date/version using the current official PDF.
- Marked unfinished functionality as planned, even when a type/comment or build plan describes it.
- Left the screenshot and APA requirements visibly pending.
- Preserved runtime-disclosure requirements. The user's omission of the builder model's identity does not authorize inventing “no AI used” or discarding relevant application events.
- Used the dependency's supported optional-binary skip for local installation after a network failure. No dependency was added or version changed.

## Files in this slice

`docs/deck/DECK.md`, `docs/deck/RESEARCH_AUDIT.md`, `docs/deck/TEAM_IDEAS.md`, `docs/deck/VALIDATION.md`, `docs/deck/HANDOVER.md`, `docs/deck/NIHAL_ALIGNMENT.md`, `docs/prompts/HEMANTH.md`. The first six-file slice was followed by the requested architecture-alignment note and related documentation updates.

## Verification and delivery outcome

The first slice's normal repository verification completed with exit code **0**, with its test stage starting at **22:30:14 Dubai, 24 November 2026**. The architecture follow-up also passed `npm run verify`, with its test stage starting at **22:46:56 Dubai**: typecheck passed, **49 tests passed / 1 skipped** in three files, and the production build passed. The skipped final-submission test and other limits are recorded in [VALIDATION.md](VALIDATION.md).

The first push failed with `fatal: could not read Username for 'https://github.com': terminal prompts disabled`. Its two commits were preserved. The user subsequently confirmed GitHub authorization and requested the architecture comparison. The earlier sign-in process could not be resumed after the execution session changed; `gh auth status` still showed no account. A fresh sign-in was started. The delivery response will state the observed final commit and push result; authentication is not assumed from a user approval alone. No hook or authorization check is bypassed.

## Required next review

Hemanth's original brief explicitly requires a stop after the deck draft. Review the six-slide narrative and its planned/built labels, supply a genuine screenshot when available, and decide with Yash how to reconcile the export rule. After this checkpoint, the next slice is the fixed Lab corpus, then the Lab UI and its results-table review. The next review stop after that is task 5.
