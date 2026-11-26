# Current candidate validation

## Scope and release status

This is a local extension of the supplied `Ai-Club-Hackathon-yash-integration` download. It is **not yet reconciled with the remote branches, fully built, browser-verified or pushed**. Historical validation documents below this directory describe earlier snapshots; their totals must not be presented as new measurements.

The latest successful remote-reference query in this session returned:

| Remote branch | Observed head |
|---|---|
| `main` | `5e97ed16cc2b0bcdabbb234ea86b228944178433` |
| `yash/integration` | `4ab11ea28526241878ccc42fd996ed59142bed22` |
| `hemanth/lab-governance` | `65bc52db63b116e5ad33a07e64a96d1db7acc5aa` |

Knowing a branch head does not establish its file contents. Clone/fetch of those objects remains blocked by the active execution policy. The supplied deployment, `https://paper-trail-team1.vercel.app/`, could not be inspected through this session's available network tools; this is not evidence that the site is down.

## Executed checks

| Check | Observed result | What it does not establish |
|---|---|---|
| `npm run test:compass` | **27 passed, 0 failed, 0 skipped** | Full application correctness or competitive performance |
| Actual checker replay through unchanged recorded registry fixtures | **24 Lab cases executed**, new hashed SAMPLE artifact | Fresh registry state or live request latency |
| Syntax parse using cached TypeScript 5.9.3 | **104 source TS/TSX files; no parse errors** | Successful bundling or whole-program type safety |
| Targeted strict typecheck with cached TypeScript 5.9.3 | Contracts, priority, learning, disclosure, checker, log chain and policy eligibility passed | The repository's pinned TypeScript 7.0.2 full-project check |
| Static architecture and presenter guides in local Chrome | Desktop and 375px layout; navigation, quiz, reading persistence and read-all mode passed | App browser coverage or a WCAG conformance claim |
| PowerPoint structure | Exactly **6 slides**; text, tables and speaker notes updated | Native PowerPoint visual rendering; Office automation was unavailable |
| `npm run verify` | Blocked at `tsc --noEmit`: `tsc` executable unavailable | A full typecheck/test/build pass |
| Live readiness script against local server | **5 blocked** prerequisites; server not built/running | A live demonstration pass |

Offline tests exercise rank determinism, missing metadata, retraction visibility, immunity to citation-count inflation, exact-passage capture, instruction rejection, source-version binding, malformed progress, recall self-assessment, second-registry absence/disagreement, real recorded metadata, sample citation exclusion, live exception eligibility, disclosure accuracy, log consistency and invalid AI levels. Recorded fixture inputs are identified as recorded/test data and never substituted into the live readiness script.

## Lab evidence

Artifact: [sample-run.json](../../src/core/lab/sample-run.json). Replay recorded at `2026-11-25T18:50:09.750Z`; original registry capture time is unknown. Content SHA-256: `33942285b45f85243b50ed08087f21928f761c3350c0aaeb540f57245e830835`.

| Population | Size | Outcomes |
|---|---:|---|
| Real controls | 12 | 5 metadata matches; 1 expected retraction; 4 missing-replay checks; 2 incomplete registry checks; 0 false alarms |
| Generated invented exercises | 12 | 8 caught; 4 missing-replay checks; 0 missed |

Ten cases remain unresolved overall. Eight have missing fixture requests, which must not be represented as live network outages. Retry waits are simulated; there is no live latency claim or whole-corpus accuracy percentage. The corpus, original recorded responses and case selection were not changed to improve results.

One recorded example explains the conservative identity change: a request for Krugman's `10.1086/261763` receives an OpenAlex response containing `10.3386/w3275`, a different version. That response no longer creates a second confirmation or contributes its abstract to the requested work.

Reproduce the dependency-free checks on Node 22.19 or newer:

```sh
npm run test:compass
node --experimental-strip-types --loader ./scripts/source-loader.mjs scripts/record-lab-sample.mjs
```

The second command is read-only unless `--write` is explicitly supplied. Re-record only after a reviewed checker change, preserve the original fixture, and rerun the artifact/source-hash tests.

## Required before release

1. Fetch all three actual branches, check their instructions and reconcile changes on `hemanth/lab-governance` using normal merges; preserve teammates' work and hooks.
2. Verify authentication as **hbasired**, set repository-local author identity and inspect the final diff; do not use the other configured account.
3. Install the exact lockfile with `npm ci`; run `npm run verify` and `npm run e2e`, including the new Study studio journey.
4. Start the app, run `npm run demo:check`, then complete the real-data journey in [DEMO_GUIDE.html](DEMO_GUIDE.html): receipt, priority, reading, claim mutation, approval, actual download and disclosure.
5. Test the proposed deployment separately, prepare honest outage fallbacks, and visually review the six-slide deck in PowerPoint.
6. Commit and push only `hemanth/lab-governance`; confirm the remote head. No force-push, deployment or main-branch push is authorized by this handover.

Initial dependency installation failed offline because pinned packages were absent from the cache. A final `npm ci` also failed; after moving npm's cache into the writable workspace, a direct registry ping failed with `EACCES`. The active session refused network escalation even after permission-setting changes were reported; a refreshed execution environment is required before dependent work can be completed.
