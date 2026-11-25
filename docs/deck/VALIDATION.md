# Deck evidence and validation

Maintained 25 November 2026, Dubai time. This record distinguishes executed checks from source inspection and pending work. Earlier runs retain their dates. It is supporting evidence, not an extra slide.

## Task 2 corpus verification, 25 November 2026

After the user's follow-up about missing implementation, the session fetched origin, stayed on `hemanth/lab-governance`, and merged `origin/main`; Git reported `Already up to date`. Main and integration remained at the snapshots below. No integration-only code was imported.

The new `tests/unit/lab-corpus.test.ts` was written before the corpus implementation. Its initial run failed on the missing corpus module. The completed targeted suite passed **42 tests**. It checks distinct real sources, the declared selection and transformation rules, reproducibility, explicit invented labels, metadata provenance, retraction expectations and actual checker outcomes through the unchanged `tests/unit/replay.ts`.

The full `npm run verify` test stage began at **09:21:51 Dubai, 25 November 2026** and exited **0**: typecheck passed, **133 tests passed / 1 skipped in five files**, and the production build passed. The existing `FINAL=1` no-stubs check remains skipped; its condition was not changed.

[LAB_RESULTS.md](LAB_RESULTS.md) records the executed 24-case replay. Eight cases encountered missing recorded requests. These are replay-coverage gaps, not a measured live outage or successful rejection. The corpus supplies structured fields to the checker; parser quality, claim support and whole-platform accuracy are outside the measurement. No new live-network or browser result is claimed by Task 2.

The source fixture is unchanged, with SHA-256 `31230615fc87ac024c8e8336b95c661d33ad573eb640a48f2dc4a4daf9f21c7a`. The owned seed extractor copies recorded metadata only; it does not create missing HTTP responses.

## 25 November branch verification

The session fetched origin, switched to `hemanth/lab-governance`, and merged main `7b0391ff0ec90e8b8f9fd2a030845cc42d3a753d` without conflicts. Integration `59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5` was checked out in a separate detached worktree for read-only source review and verification; it was not merged into Hemanth's branch.

| Execution | Test stage began, Dubai | Typecheck | Unit tests | Production build |
|---|---|---|---|---|
| `npm run verify` on the main-based Hemanth checkout | 25 November, 08:29:55 | Passed | 4 files passed; **91 tests passed, 1 skipped**, 92 total | Passed |
| `npm run verify` on isolated integration | 25 November, 08:30:31 | Passed | 6 files passed; **126 tests passed, 1 skipped**, 127 total | Passed |
| Final `npm run verify` on the main-based Hemanth checkout | 25 November, 08:37:46 | Passed | 4 files passed; **91 tests passed, 1 skipped**, 92 total | Passed |

All commands exited **0**. Each skipped the existing `no page is still a stub` test because `FINAL=1` was not enabled. The code still contains stubs, so passing this normal gate is not final-completion evidence. The two branches contain different test suites; do not turn their counts into a comparative accuracy chart.

`package.json` and `package-lock.json` were identical between the two snapshots. The isolated worktree reused the existing installation through an ignored `node_modules` symlink. No dependency was added, and no package or lockfile was edited. No new application browser journey, live registry benchmark, manual keyboard/375 px inspection or axe result was executed in this update.

The private HTML guide is a separate learning artifact outside the repository. Its diagrams and illustrative scenarios do not count as application screenshots, live results or proof that a planned feature works.

## Original 24 November baseline and scope

- Branch: `hemanth/lab-governance`.
- Audited source commit: `723523c91b2cdcf26b8b9cbdf98e4facfc160df5`.
- Preparation: cloned the specified repository, fetched `origin`, created the permitted branch from `origin/main`, and merged `origin/main`. Git reported `Already up to date.`
- No implementation outside Hemanth's ownership was changed. Product implementation is deferred to the required deck review.

## Executed checker test

Command from the repository root:

```sh
npm run test -- tests/unit/verify.test.ts --reporter=verbose --reporter=json --outputFile=/workspace/scratch/c28352149419/checker-baseline.json
```

Observed at **22:24:52 Dubai, 24 November 2026**:

| Measure | Observed result | What it establishes |
|---|---|---|
| Test files | 1 passed | The existing checker test file ran |
| Tests reported by the runner | 38 passed, 0 failed, 0 pending | This existing suite passed in this environment |
| Simulated total-registry-outage cases | 3 passed out of 3 | Each returned `could-not-check`, included `REGISTRY_UNREACHABLE`, and had error traces |
| Registry data for other cases | Existing offline replay fixture | Recorded responses, not a live registry accuracy measurement |

The reporter's `success` was `true`. The fixture's SHA-256 was `31230615fc87ac024c8e8336b95c661d33ad573eb640a48f2dc4a4daf9f21c7a`.

The outage cases use a full reference with DOI, a full reference without DOI, and a bare DOI for the real Noy and Zhang paper already in the repository. All registry methods deliberately throw. This does **not** establish correctness for partial outages, every input style, all languages or the future Lab corpus.

`verify.test.ts` repeats representations of some works. Its test count is not a distinct-reference count, a Lab corpus count, a precision score or a recall score.

## Environment setup

Ordinary `npm ci --no-audit --no-fund` failed while the existing ONNX dependency downloaded additional binaries: `ERR_PROXY_TUNNEL`, proxy tunnel timeout. Installation then succeeded with the package's supported option to skip binaries not bundled in the package:

```sh
npm ci --no-audit --no-fund --onnxruntime-node-install=skip
```

No declared dependency or lockfile changed. The project's `prepare` script ran and installed its normal hook path. No hook was disabled. GPU/native inference was not validated. The option is documented in the installed `node_modules/onnxruntime-node/script/install.js` and [official package README](https://github.com/microsoft/onnxruntime/blob/main/js/node/README.md).

## Git hook limitation discovered at commit

The first commit reported that `.githooks/pre-commit` was ignored because it was not executable. Both tracked hooks have mode `100644`, so installing the hook path did not make automatic execution work. The first committed patch was applied to the index of a disposable checkout at the audited base; running the unchanged pre-commit hook explicitly with `sh .githooks/pre-commit` passed. The patch also applied cleanly to that base. The disposable checkout was then removed.

The documentation follow-up is checked with the same hook explicitly before its commit. The pre-push hook must likewise be executed explicitly against the intended own-branch update before the push. These checks do not fix automatic hook execution for future contributors. The tracked permission fix belongs to Yash; Hemanth has not edited the hooks or their modes, and no `--no-verify` or bypass variable is used.

## Full repository gate

`npm run verify` completed with exit code **0**. Its test stage started at **22:30:14 Dubai, 24 November 2026**.

| Gate | Observed result |
|---|---|
| TypeScript typecheck | Passed |
| Unit tests | 3 files passed; **49 tests passed, 1 skipped**, 50 total |
| Production build | Passed |

The skipped test is `no page is still a stub` in `tests/unit/guards.test.ts`. The repository runs it only when `FINAL=1`; that variable was not enabled for this draft. Several pages are still stubs, as explicitly disclosed in the deck. Passing the normal verification command therefore does **not** establish that the whole application is ready for submission. No test was changed or newly disabled.

## Architecture-alignment follow-up verification

After the user supplied Nihal's architecture, the session fetched `origin`, switched to `hemanth/lab-governance` and merged `origin/main`; Git reported `Already up to date.` Application source and tests remained unchanged. The follow-up changes only Hemanth-owned documentation, including `NIHAL_ALIGNMENT.md` and the prompt log.

`npm run verify` completed again with exit code **0**, with its test stage starting at **22:46:56 Dubai, 24 November 2026**. Typecheck passed; **3 test files passed, 49 tests passed and 1 was skipped**; the production build passed. The skipped test is the same `FINAL=1`-only no-stubs check described above. No new runtime, browser, accessibility or competitive-performance result is implied.

All local Markdown file links in the changed documents resolved, and the deck still contained exactly six slide sections. The architecture note was checked against the current source, the approved plan and the owners' briefs. Its Mermaid source is a conceptual diagram; no rendered-diagram visual inspection is claimed.

## Required screenshot

**Pending. No screenshot is supplied or implied.**

The development server started on `http://127.0.0.1:5173/`. Local Chromium failed before opening a page: `socket() failed: Operation not permitted`. The cloud browser could not connect to the local app; subsequent observation was denied by browser policy. No policy workaround was attempted.

For the final slide, a teammate can run the app locally, open `/#/check`, paste the real reference already in `tests/unit/verify.test.ts`, run Check, select its receipt and capture the result:

> Noy, S., & Zhang, W. (2023). Experimental evidence on the productivity effects of generative artificial intelligence. Science, 381(6654), 187–192. https://doi.org/10.1126/science.adh2586

Save the actual screenshot under `docs/deck/assets/`. Record the commit and capture/check time. Retain the real verdict and trace. For replay, visibly label **SAMPLE: recorded registry responses**. Do not show pending, mocked, replayed or recreated output as a completed live check.

## Not claimed or not yet run

- No live Lab run or Lab accuracy metric: the corpus and page are later tasks.
- No successful live registry result here: browser launch failed before the check.
- No end-to-end AI, claim-review or export result: these paths are unfinished.
- No visual QA, 375 px result, manual keyboard result or clean axe scan. Required when the pages are implemented.
- No timed 60-second reading of a composed PowerPoint. This deliverable is Markdown text and diagram specifications.
- No PowerPoint submission, deployment, pull request or merge into `main`.

## Review checkpoint

The brief says to stop after the deck draft, after task 3 with the Lab table, and after task 5. This is the first checkpoint. Tasks 2–6 and the final `docs/deck/QA.md` are not marked complete.
