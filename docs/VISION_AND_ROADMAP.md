# Hemanth's vision and the path to a release

## The vision

Paper Trail should make serious research approachable for any student: ask a question, discover useful real sources, understand the evidence, remember what matters, test an argument and produce traceable references. The experience should be clear and rewarding enough that students return because it helps them learn, with short activities, useful feedback and visible progress rather than pressure, endless feeds or superficial badges.

The ambition is to become students' preferred research companion worldwide. That is a product goal, not a measured claim about adoption, reliability or superiority today.

Automation should handle searches, metadata comparisons, reading assistance, citation formatting and disclosure preparation. Students should retain the decisions that carry academic responsibility: approving the plan, choosing sources, judging claims and writing the assignment. A strong system makes unsupported claims and missing checks visible; it cannot honestly promise that nobody can ever manipulate it or that every published finding is correct.

## The experience we are building

1. **Start with a clear next step.** Research Compass shows the project's state and guides the student toward the next useful action.
2. **Find what deserves attention.** Search actual registries and show why a paper appears in the reading order, including uncertainty and warnings.
3. **Understand a paper without losing its source.** Separate the available abstract from full text and link explanations to actual passages.
4. **Learn actively.** Explain the question, capture evidence, identify limitations and recall the result before revealing the source again.
5. **Challenge the argument.** Test a claim against source text, inspect an altered-number example and look for opposing evidence.
6. **Write with responsibility.** The student writes; the platform helps organise sources, inspect citations and review the available evidence.
7. **Leave a traceable record.** Export references, labelled exceptions, student decisions and a disclosure that distinguishes recorded activity from unknown activity.

The proposed differentiator is the connection between these steps: an inspectable research trail that also helps the student learn. It needs a successful real-data demonstration and independent evaluation before we claim that it outperforms established products.

## What exists locally now

The implementation lives in `paper-trail-hemanth/`, based on the supplied Yash download. The original download has been preserved; the latest GitHub files have not yet been fetched and merged into this candidate.

| Area | Existing foundation | Added or corrected in this session |
|---|---|---|
| Research flow | Plan, Find, Library, Read, Evidence, Challenge, Write, Export and Team | Research Compass and clearer next steps |
| Reading priority | Registry retrieval and verification | Three transparent presets, score breakdown, stable order, visible check groups and no citation-popularity bonus |
| Learning | Extractive reader with source sentences | Four-stage Study studio, exact-passage capture, reflections, recall, review due date and saved notes |
| Reference integrity | Deterministic metadata checker and receipts | Missing or conflicting second-registry identities stay incomplete; another work's abstract is not attached |
| Citation control | Student approval and written exceptions | SAMPLE receipts blocked from approval/citation, including exception attempts |
| Governance | Rules, log and AI statement | Recorded prompts, student disclosure supplements, accurate event counts, stale-result invalidation and clearer hash-chain limits |
| PDF and AI boundaries | Local PDF extraction and fixed server tasks | Visible page-extraction limits and strict AI-level validation |
| Hemanth deliverables | Integrity Lab, corpus, deck and documentation | Regenerated actual SAMPLE replay, corrected policy wording, fifteen-question Q&A and current validation |
| Presentation | Supplied PowerPoint and HTML materials | Exactly six slides, corrected speaker notes, updated presenter guide and private twelve-chapter architecture guide |

No additional npm dependency was introduced. Existing tools already include React, PDF.js, Transformers.js/ONNX, DeBERTa and optional Gemini/Groq tasks; these should be measured and integrated well before adding more providers or models.

## What was actually tested

- **27 offline tests passed**, including ranking, source-bound study progress, exact quotes, sample citation exclusion, registry disagreements, disclosure and log consistency.
- The real checker executed **24 recorded Lab cases**: 12 real controls and 12 generated exercises. Ten outcomes remain unresolved; this is disclosed SAMPLE evidence, not a fresh live run or a benchmark victory.
- **104 source TS/TSX files parsed** without syntax errors using an available cached compiler; seven core entry points passed a targeted strict typecheck.
- The static HTML guides passed local Chrome checks at desktop and 375px width, including navigation, quiz feedback and saved reading progress.
- The PowerPoint contains **exactly six slides**; native PowerPoint rendering could not run in this session.

See [the detailed validation record](deck/VALIDATION_CURRENT.md) for commands, artifact hashes, measured outcomes and limits. These checks do not replace the full application build or browser journey.

## What was not completed

| Outstanding item | Why it remains open | Completion evidence needed |
|---|---|---|
| Read and reconcile the actual main, Yash and Hemanth branch files | Remote heads were listed, but object fetch was blocked by the active local execution policy | Fetched commits, branch comparison and reviewed merge on Hemanth's branch |
| Install all locked dependencies | Required cache entries are missing; a registry request with a workspace-local cache fails with `EACCES` | Successful `npm ci` using the unchanged lockfile |
| Complete production build and whole-project verification | `npm run verify` stops because the pinned TypeScript executable is unavailable | Successful typecheck, all unit tests, offline tests and production build |
| Run the new app browser/accessibility test | Browser test dependencies and built app are unavailable | Passing Playwright journey, keyboard/375px checks and reviewed accessibility results |
| Confirm the current Vercel site and its backend | Site and health endpoint could not be accessed from the available tools | Observed real-data flow against `https://paper-trail-team1.vercel.app/` and backend readiness |
| Rehearse a working live demo | Network and build prerequisites remain open | A timestamped run from question through downloaded export, with real registry responses |
| Validate six-slide visual layout in PowerPoint | Office automation failed in the sandbox session | Open every slide and check text fit, diagrams, tables and notes |
| Commit and push as hbasired | No fetched checkout, verified authentication or passing full gate yet | Successful normal push to `hemanth/lab-governance` and matching remote head |
| Demonstrate benchmark superiority or educational benefit | No independent comparative evaluation was performed | Frozen evaluation protocol, independent labels/assessment, baselines and reported failures |

No deployment or teammate-branch modification was performed. No commit was made under the other configured GitHub identity.

## What should happen next

### P0 — finish the integration and make the demo dependable

Reopen this task after its local permissions have refreshed; the running task continued to report `sandbox_approval=false` after settings were changed. Fetch the actual repository, read any updated instructions, preserve each teammate's work and reconcile main/Yash into Hemanth's branch without force-pushing or rewriting their history. Use `hbasired` for authenticated GitHub actions and repository-local author configuration.

Apply only the reviewed candidate changes, install the exact lockfile, then run `npm run verify` and `npm run e2e`. Fix failures in the integrated implementation before treating the candidate as complete; passing isolated core tests is insufficient.

Rehearse [the demo guide](deck/DEMO_GUIDE.html) with the working-from-home paper identified by DOI `10.1093/qje/qju032`: inspect real metadata and its receipt, explain priority, capture source text, compare the reported 13% result with a deliberately altered 31% claim, inspect the returned labels, and download/open an actual citation export. Search ordering and verdicts must follow the returned data, not a scripted expectation.

Run `npm run demo:check` against the actual local server and inspect the deployed site separately. Prepare a saved project and recorded Lab replay as explicitly announced backups; an outage must remain visible. Keep the six-slide deck, presenter guide and private architecture guide aligned with the verified final commit, then push only Hemanth's branch.

### P1 — test whether the differentiator helps students

Evaluate reading priority against the existing ordering on frozen questions and candidate lists using independent relevance labels, Precision@5 and nDCG@10. Include older foundational papers, missing metadata, conflicting records and non-English queries; do not tune and report on the same small set.

Evaluate guided study against ordinary reading using an independent delayed comprehension assessment and task-completion observations. The current one-day recall reminder is a simple self-assessment schedule, not an adaptive learning system. Add more elaborate spaced review, personalised paths or achievements only when they improve learning and remain separate from credibility badges.

Improve query expansion, semantic retrieval and duplicate/version handling only after collecting failure cases. Keep explanations, uncertainty and student control visible even if a model later contributes to ranking.

### P2 — build the foundations for broader adoption

Add accessible onboarding, robust mobile layouts and language support, with real student usability sessions. Define meaningful measures such as completing a first source review, understanding a warning, recovering from an outage and producing a correct export; do not optimise solely for time spent in the app.

Strengthen provenance with explicit metadata retrieval timestamps, version relationships and external log checkpoints where appropriate. Preserve privacy boundaries and do not describe browser-only hashes as an independent audit authority.

Investigate prepared offline reading, cache expiry, retrieval quotas, durable encrypted storage, account recovery and operational monitoring before promising global availability. Any new provider requires a review of cost, limits, licences, data handling and measured benefit; a famous provider name is not itself a differentiator.

## Definition of a credible completed release

The actual branch history is reconciled; the exact application builds and passes its required checks; a fresh real-data journey succeeds; failures and SAMPLE modes are visible; source/claim/export gates work; the six-slide presentation matches that commit; and the push is confirmed on Hemanth's branch as hbasired. Broader learning and benchmark claims remain separate milestones until their evidence exists.
