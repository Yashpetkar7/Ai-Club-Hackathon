> Historical snapshot: the current candidate and regenerated Lab evidence are described in [VALIDATION_CURRENT.md](VALIDATION_CURRENT.md) and [INTEGRATION_HANDOVER.md](INTEGRATION_HANDOVER.md). Do not quote the totals below as a new run.

# Repository update and implementation audit — 25 November 2026

> **Later Hemanth slice:** this audit's main/integration snapshots remain unchanged. Hemanth subsequently implemented the owned corpus and Lab route on `hemanth/lab-governance`; see [Lab results](LAB_RESULTS.md), [current handover](HANDOVER.md) and [validation](VALIDATION.md). The route statuses below are historical findings about the named main/integration commits, not a claim that Hemanth's branch still has a Lab stub. User-experience evidence and improvement tests are in the [new ledger](USER_EXPERIENCE_RESEARCH.md).

## Scope and baselines

This note separates what is present on main from newer work on Yash's integration branch. It updates the implementation picture behind Hemanth's deck and governance work. It does not claim a completed product, a deployment, a live-registry benchmark or a browser usability result.

| Inspected baseline | Exact commit | Relationship to Hemanth's work |
|---|---|---|
| `origin/main` | `7b0391ff0ec90e8b8f9fd2a030845cc42d3a753d` | Fetched and merged into `hemanth/lab-governance` in this session. The resulting Hemanth merge commit is `a550d45`. |
| `origin/yash/integration` | `59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5` | Inspected and verified separately in an isolated worktree. **Not merged or cherry-picked into Hemanth's branch.** |
| Earlier application baseline used by the 24 November audit | `723523c91b2cdcf26b8b9cbdf98e4facfc160df5` | Historical. Earlier “planned” labels for the code Challenger, Map, PDF reader and HTML report need updating. |

The integration delta consists of `ef56b3b` and `59a876d`. Git history and `git diff origin/main..origin/yash/integration` are the sources for this branch comparison. Integration-only source links below are pinned to its inspected commit; relative application links refer to current main code in this branch.

[NIHAL_ALIGNMENT.md](NIHAL_ALIGNMENT.md) maps every box in the supplied architecture screenshot, including its incompatible server database and assignment-generation implications. This note adds the detailed changes, tests and remaining owner requests. Application and shared-code ownership remain as defined in [CLAUDE.md](../../CLAUDE.md); this audit changes Hemanth's documentation only.

## Verification performed

These are executed command results from this session, not projected results.

| Baseline | Command | Test stage began, Dubai, 25 November 2026 | Observed result |
|---|---|---|---|
| Main application code on `hemanth/lab-governance` | `npm run verify` | 08:29:55 | Typecheck passed; **91 unit tests passed, 1 skipped, across 4 test files**; production build passed. |
| Isolated integration checkout at `59a876d` | `npm run verify` | 08:30:31 | Typecheck passed; **126 unit tests passed, 1 skipped, across 6 test files**; production build passed. |

The command expands to typecheck, unit tests and build in [package.json](../../package.json). Both runs skipped the same conditional test: `it.runIf(process.env.FINAL === '1')('no page is still a stub', ...)` in [guards.test.ts](../../tests/unit/guards.test.ts). **These green runs do not mean the unfinished pages satisfy the final completeness gate.** The integration checkout used the same dependency installation only after its package and lock files were checked to match; no dependency was added by this audit.

The main-based Hemanth gate was rerun before committing the documentation update. Its test stage began at **08:37:46 Dubai** and again recorded **91 passed, 1 skipped**, with typecheck and build passing and command exit **0**. [Validation record](VALIDATION.md).

No end-to-end browser run, axe scan, 375 px inspection, keyboard walkthrough or live Lab run is reported here. Unit-test totals are not a reference-corpus accuracy rate. The Integrity Lab corpus and its failure-type results remain separate work. [Hemanth's acceptance criteria](../team/HEMANTH.md), [validation record](VALIDATION.md).

## What is now implemented on main

“Implemented” means present in the inspected code, with the verification scope above. It does not imply that every intended scenario is complete.

| Area | Change now present on main | Boundary that must stay visible | Evidence |
|---|---|---|---|
| Plan and optional AI request path | Plan can request fixed-task suggestions, validate search-phrase shape, and use a code fallback. | The server has no successful AI task implementation. With no configured key it returns unavailable; with a key it still returns not built. Do not advertise successful AI planning from this source alone. | [Plan](../../src/pages/Plan.tsx), [AI client](../../src/core/aiClient.ts), [AI handler](../../server/handlers/ai.mjs) |
| Code Challenger | Searches for supporting/opposing/null findings, chooses existing sentence slices and flags overclaim or evidence-concentration risks. | Direction and relevance are word-based reading aids. They neither implement the planned semantic-support pipeline nor assign the final claim label. | [Challenge page](../../src/pages/Challenge.tsx), [algorithm](../../src/core/challenge/challenge.ts), [tests](../../tests/unit/lead.test.ts) |
| Source map | Constructs citation edges and shared-reference links from stored registry reference lists; supplies a table alternative and source-balance views. | An absent edge may mean absent metadata. A shared reference does not establish agreement, research quality or semantic similarity. | [Map](../../src/pages/Map.tsx), [graph](../../src/map/graph.ts), [tests](../../tests/unit/lead.test.ts) |
| Local PDF reading | Extracts text in the browser, looks up a DOI/title or filename-derived query, stores the extracted text on a source, and flags a limited set of instruction-like strings. | The PDF file is not uploaded by this path; lookup fields can leave the device. Extraction has no OCR and reads at most 80 pages. The page-count display currently overstates the amount read for longer files. | [Reader](../../src/core/pdf/read.ts), [PDF component](../../src/ui/PdfDrop.tsx), [instruction patterns](../../src/core/pdf/injection.ts) |
| HTML evidence report | Builds a self-contained report from local sources, claims and log entries; escapes inserted values and provides a download control. | It reports stored data, rather than rerunning verification. It is not formatted citation export, the completed AI-use statement, or evidence of a complete activity history. | [Report](../../src/core/report/report.ts), [Project shell](../../src/app/ProjectShell.tsx), [report tests](../../tests/unit/lead.test.ts) |
| Policy application | Shared policy checks assess year and source type; source approval consults them. | The configured peer-review restriction uses source-type categories, not independent proof of peer review. A student's reasoned exception is still allowed by `citable`. `policyIssues` does not consume `blockRetracted`, and the current Rules page does not use `policyLines`; not every switch changes enforcement and displayed copy. | [Policy application](../../src/policy/apply.ts), [actions](../../src/store/actions.ts), [policy](../../src/policy/policy.ts), [Rules](../../src/pages/Rules.tsx) |
| Navigation support | Command palette and tour components have implementations. | Their presence is not an observed usability or accessibility result. | [Palette](../../src/app/CommandPalette.tsx), [Tour](../../src/app/Tour.tsx) |

### Work that remains unfinished on both inspected branches

The Library, Write, Export, Evidence, Ask, Integrity Lab and AI-use statement pages still contain stubs. House rules still provides its existing live policy tables; Hemanth's policy clause map, fuller data disclosure, accountability explanation and deletion confirmation are not completed by this documentation task. The claim-support pipeline and successful fixed AI tasks remain planned. [Library](../../src/pages/Library.tsx), [Write](../../src/pages/Write.tsx), [Export](../../src/pages/Export.tsx), [Evidence](../../src/pages/Evidence.tsx), [Ask](../../src/pages/Ask.tsx), [Lab](../../src/pages/Lab.tsx), [AiStatement](../../src/pages/AiStatement.tsx), [Rules](../../src/pages/Rules.tsx), [AI handler](../../server/handlers/ai.mjs).

The HTML evidence report is a useful addition, but it does not complete those pages or the three student checkpoints. Plan approval and source selection are implemented; claim accept/rewrite/reject remains part of the planned Evidence interface. [Actions](../../src/store/actions.ts), [Evidence](../../src/pages/Evidence.tsx).

## Improvements present only on Yash's newer integration branch

These changes are useful evidence for team discussion. They are not yet capabilities of current main or Hemanth's application baseline.

| Integration change | What the code now does | What it still does not establish | Pinned source |
|---|---|---|---|
| Neutral partial-registry result | A clean primary-record match becomes `one-registry` when the OpenAlex lookup throws. The UI says “One registry only” and permits retry. A detected mismatch or retraction still stands. | “Two registries agree” is too strong. A successful OpenAlex no-record response still permits Confirmed; OpenAlex's title/author/year are not compared with the primary record. | [Verifier](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/verify/verdict.ts), [labels](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/contracts.ts), [Check](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/pages/Check.tsx) |
| Broader secondary lookup and DOI uncertainty handling | DataCite DOI records also receive the OpenAlex enrichment/retraction lookup. A DOI that could not be resolved is not excused by a title-search result carrying a different DOI. | This does not add comprehensive registry agreement, correction monitoring or guaranteed retraction coverage. | [Verifier and tests](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/tests/unit/verify.test.ts) |
| AI request guard | Validates method, JSON, integer declared level from 0 to 3, task-name type, body length and an optional browser cross-site header; the handler rejects unknown task names. Adds an in-memory forwarded-address bucket rate limit before the handler. | Task-specific input validation remains unfinished. It does not authenticate school permission, implement successful AI tasks, or enforce the per-project call cap on the server. A missing cross-site header is not identity proof; forwarded-address attribution depends on an unestablished trusted-proxy boundary. | [Guard](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/server/guard.mjs), [router](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/server/router.mjs), [server tests](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/tests/unit/server.test.ts) |
| More decision events | Adds events for source edits, skips and Plan suggestion decisions. | Plan emits `changed: []` and treats a suggestion missing from the final exact-string list as rejected. Editing a suggestion is therefore not represented as a changed suggestion. No durable suggestion identity or full lifecycle exists. | [Actions](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/store/actions.ts), [Plan](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/pages/Plan.tsx) |
| Registry cooldown and fallback | A 429 response with a numeric Retry-After greater than 20 seconds puts that request bucket into cooldown, capped at six hours. Searches can immediately fall back to Crossref; search cooldown is separate from DOI lookup. Crossref first requests records with abstracts, then broadens if needed. | This detects a long retry instruction, not the reason for it. “Daily allowance exhausted” is an inference. HTTP-date Retry-After values are not parsed, and the Crossref fallback does not enforce the `openAccessOnly` option. | [HTTP](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/registries/http.ts), [search](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/registries/index.ts), [tests](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/tests/unit/registries.test.ts) |
| More cautious Challenger | Requires subject overlap, focuses direction words near an inferred outcome, recognizes several null-result patterns, and returns unclear for added mismatched-topic examples. | It uses a limited English vocabulary, word positions and hand-written patterns. This is neither semantic proof nor measured general accuracy across disciplines or languages. | [Algorithm](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/challenge/challenge.ts), [tests](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/tests/unit/lead.test.ts) |
| Executable local hooks | Git file modes for both hooks change from `100644` to `100755`; a guard test checks indexed modes. | File modes alone do not prove that hooks are configured in every clone, that a push was accepted, or that server-side branch protections exist. Hemanth must not modify these owner-controlled files or bypass a rejection. | [Commit diff](https://github.com/Yashpetkar7/Ai-Club-Hackathon/commit/ef56b3b), [guard test](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/tests/unit/guards.test.ts), [repository rules](../../CLAUDE.md) |
| Owned replay overlay | Adds `installReplayWith(file)` to combine an additional recording with the shared registry fixture. | This enables future Lab tests; it does not provide the Lab corpus or certify its reference coverage. Any new fixture must remain inside Hemanth's allowed paths unless Yash changes the ownership agreement. | [Replay helper](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/tests/unit/replay.ts), [Hemanth's file list](../team/HEMANTH.md) |

### Partial-registry behavior checked directly

A targeted in-memory probe used the existing recorded real Noy and Zhang reference metadata, the actual verifier from each branch, and controlled secondary-registry responses. These are injected-response checks, not live registry measurements.

| Primary record matches; secondary response | Main `7b0391f` | Integration `59a876d` |
|---|---|---|
| Matching record returned | Confirmed | Confirmed |
| Successful no-record response | Confirmed | Confirmed; OpenAlex trace says not-found |
| Lookup throws | Confirmed | One registry only; secondary-registry-unreachable reason |

Sources: [recorded registry fixture](../../tests/unit/fixtures/registry.json), [main verifier](../../src/core/verify/verdict.ts), [integration verifier](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/verify/verdict.ts). The integration unit suite independently includes assertions for these secondary-response cases. [Integration verifier tests](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/tests/unit/verify.test.ts).

This supports the narrow claim that integration improves handling of a secondary outage. It does not support “every outage becomes Could not check”: the new result is intentionally different, and a known mismatch or retraction may still be shown despite a secondary outage.

## Remaining limits and precise owner requests

### Citation eligibility and meaning of confirmation

The contract's `exportable` function requires all three keys. The `citable` helper additionally allows an approved source kept with a written reason, including certain manual/web sources. The current report uses that helper for its “May be cited” column. Consequently, the deck's strict three-key rule is a product rule that is **not consistently enforced by every current eligibility path**. [Contracts](../../src/core/contracts.ts), [actions](../../src/store/actions.ts), [report](../../src/core/report/report.ts).

**Request to Yash and Siddal:** settle whether exceptions may appear only in a separate flagged record or may be cited. Make the helper, report language and eventual export preflight agree. Test an unconfirmed source with approval and a reason; it must not be presented as checked merely because it was retained.

**Request to Yash:** decide the exact meaning of Confirmed when the second registry has no record or returns conflicting metadata. Test those cases and show coverage separately from field matching. Retraction flags are lookup metadata, not a guarantee that all retractions or corrections have been found. [Integration verifier](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/verify/verdict.ts), [registry mapping](../../src/core/registries/map.ts).

### Server controls and AI activity

Main's client checks the configured cap of 40 recorded AI events per project. The existing handler checks minimum task level but has no successful task body. Integration validates the declared level more strictly and adds a separate rate limit of 60 requests per forwarded-address bucket per ten-minute window. The bucket key trusts the first `x-forwarded-for` value, or uses the shared `local` bucket when absent. The inspected code does not establish trusted-proxy handling or reliable client-address attribution. These are different controls: that rate limit is not a server-enforced per-project budget or institutional authorization. Its in-memory state resets with the process. Task-specific input payload validation also remains unfinished. [AI client](../../src/core/aiClient.ts), [policy](../../src/policy/policy.ts), [handler](../../server/handlers/ai.mjs), [integration guard](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/server/guard.mjs).

The client logs AI activity only after parsing a successful envelope; many unavailable or malformed-envelope attempts return without such an event. Its cap check is not an atomic reservation for simultaneous requests. Therefore “every AI request is logged” and “the server enforces the project's full budget” are unsupported. [AI client](../../src/core/aiClient.ts).

**Request to Yash and Nihal:** define request identity, terminal outcomes, cap semantics and what permission is actually enforceable without accounts. Add tests for unavailable/malformed responses, simultaneous requests and deliberate client bypass. Keep the student-declaration boundary explicit; no institution-authentication feature is introduced by this request.

### Statement counts and log integrity

Integration's new Plan decision event is a useful start, but `changed: []` is always emitted. Edited suggestions can become “rejected,” and component-local suggestion tracking does not preserve a durable history across navigation. The general decision helper accepts Reader/Challenger task names, but that alone does not establish implemented call sites or complete event coverage. Hemanth must not invent changed counts or infer that an unrecorded action did not occur. [Integration Plan](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/pages/Plan.tsx), [integration actions](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/store/actions.ts).

The report currently counts `actor === 'ai'` entries and calls the number “AI calls.” There is no request identifier or deduplication step. This audit did **not** observe duplicate calls; the supported statement is that the count is an **event count**, not an independently verified count of unique provider requests. [Report](../../src/core/report/report.ts).

Hash-chain verification checks the entries supplied to it. It can expose covered edits or broken links, but cannot establish that no valid tail was deleted, that all activity was recorded, or that the whole chain was never rebuilt. Sequence numbers are not included in the hashed field list. “Tamper-evident, not tamper-proof” still needs this completeness qualification. [Log implementation](../../src/log/log.ts).

**Request to Yash and Nihal:** add durable suggestion/request identity and accurate kept/changed/rejected transitions before those counts drive a statement. Hemanth should use “No AI calls are recorded in this log” where that is all the evidence supports, and show unavailable counts as unknown. Keep the user-reviewed APA requirements slot open.

### What was read and what the report can disclose

The PDF loop processes `Math.min(doc.numPages, 80)` pages, while the return value uses `pages: doc.numPages`; the component displays that value as “pages read.” A longer PDF can therefore be described as fully read when only its first 80 pages were extracted. This is a source-code finding, not a claim that a particular user's PDF failed in a live run. [Reader](../../src/core/pdf/read.ts), [PDF component](../../src/ui/PdfDrop.tsx).

**Request to Yash:** return and display pages processed, total pages and a truncation flag; propagate that coverage into the source and report. Add a longer-than-limit test. The instruction detector is a finite pattern list and the extracted text remains stored; a flag is not proof that all malicious instructions were removed or rendered harmless for future AI processing. [Instruction detector](../../src/core/pdf/injection.ts), [PDF component](../../src/ui/PdfDrop.tsx).

The report's count of unchecked sources includes missing checks and `could-not-check`, but not integration's new `one-registry` status. Individual rows still use the status label, yet the summary should disclose partial coverage too. Presence of `source.text` also does not prove that a claim-support check ran. [Report](../../src/core/report/report.ts), [integration labels](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/contracts.ts).

**Request to Yash and Hemanth:** make report/statement language derive from explicit performed-check and coverage records, including truncated PDFs, abstracts only, partial registry coverage and unrun claim checks. Do not substitute text availability for a completed analysis.

### Search and Challenger limits

The integration cooldown improves responsiveness for a particular long 429 response. It does not prove a daily budget was exhausted. The fallback preserves the year constraint but does not enforce OpenAlex's open-access-only filter; users should not silently receive a different filter guarantee after fallback. [Integration HTTP](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/registries/http.ts), [search](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/registries/index.ts).

**Request to Yash:** use neutral rate-limit wording, decide how to handle HTTP-date Retry-After and preserve or disclose unavailable filters. Exercise both-registry failure separately from a valid empty result.

The integration Challenger improves specific subject/outcome regressions, but broader support checking remains Nihal's planned responsibility. A word match, an exact sentence slice and a semantic-support inference are distinct evidence steps. **Request to Yash and Nihal:** preserve the “reading aid” label and test unrelated subjects sharing outcome words, different outcomes sharing subjects, null findings, negation and unsupported languages without claiming a general accuracy rate from those cases. [Integration Challenger](https://github.com/Yashpetkar7/Ai-Club-Hackathon/blob/59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5/src/core/challenge/challenge.ts), [Nihal's brief](../team/NIHAL.md).

## Consequences for the deck and Hemanth's next work

The six-slide deck can now describe the implemented code Challenger, Map, local PDF extraction and HTML evidence report, with their limits. It must retain planned labels for full claim support, successful AI tasks, citation export, the completed Lab and the AI-use statement. The newer partial-registry handling belongs to the integration branch until Yash merges it; it must not be presented as current main behavior. [Main source mapping](#what-is-now-implemented-on-main), [integration comparison](#improvements-present-only-on-yashs-newer-integration-branch).

The most defensible product emphasis is inspectable evidence and honest uncertainty, not a claim to be the first platform with discovery, citation, review or auditing. The Lab can make that emphasis concrete only after it has a fixed corpus, offline replay, visible misses and actual run results. Do not turn the unit-test counts above into a claim of reference accuracy or competitive superiority. [Research audit](RESEARCH_AUDIT.md), [Hemanth's Lab requirements](../team/HEMANTH.md).

Before the final demonstration, the team still needs an actual browser journey, narrow-screen and keyboard checks, an axe scan, and the no-stub completeness gate with `FINAL=1`. Those are outstanding validation tasks, not tests passed by this review. Hemanth's required review stops remain in force: deck draft, task 3 with the Lab results table, and task 5. This update neither implements later tasks nor authorizes changes to another owner's code. [Repository instructions](../../CLAUDE.md), [Hemanth's brief](../team/HEMANTH.md).
