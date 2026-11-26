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

## What exists on the branch now

Everything below is on `hemanth/lab-governance`, pushed as hbasired and checked on 26 November 2026 (see [current validation](deck/VALIDATION_CURRENT.md)). The live site follows `main`, which has none of it until Yash merges and deploys.

| Area | Built on the existing foundation |
|---|---|
| Research flow | Research Compass, reading priority with visible weights, Study studio, and a Discover tab for papers by meaning and related works (OpenAlex) |
| Claims | Find by meaning with Snowflake arctic-embed-xs in the browser, which only orders sentences. A claim scorecard shows support, neutral and contradiction against the 90% lines and the numbers side by side. Check against every source. A measured rule for which sentence a page starts on |
| Polished answers | Audit a paragraph (`#/audit`): every reference checked with a receipt, and every claim linked to what it cites and labelled by `judge()` |
| Proof | The Integrity Lab works out claim and reference accuracy from labelled data, with ranges and every miss. Guardrails (`#/guardrails`) runs 10 checks live on the real code |
| Governance | A named Explainer agent at level 2, with code-checked answers. The AI-use statement counts every recorded AI task. House rules says what leaves the device. Our own mapping to NIST AI RMF 1.0, OWASP LLM Top 10 2025 and UNESCO 2023 |
| Navigation | Helpers under their step, a "where you are" line, a palette that reaches every page, and no dead ends |

No new npm dependency was added. The one new model, arctic-embed-xs (about 23 MB, pinned revision), loads through the existing Transformers.js stack. Its model card says Apache-2.0.

## What was actually tested

| Check | Result |
|---|---|
| Typecheck | Clean |
| Unit tests | 1,049 passed, 2 skipped |
| Offline tests | 27 of 27 |
| Build | Built |
| Browser tests in Chrome | 59 passed, 5 opt-in skipped |

The real models were also recorded on every candidate sentence of 104 labelled claims (449 support runs). On that data, starting on the closest sentence gave 0 of 80 false claims Verified, 72 Disputed, and no true claim Disputed.

These are development-set numbers: the claims were written by the team, and the hold-out set was turned into rules after its first run. They are not an independent benchmark and not a comparison with another product.

## What is still open

| Item | Why | Evidence needed |
|---|---|---|
| Merge and deploy | Only Yash merges into `main` and deploys | The live site shows Audit, Guardrails and the Lab accuracy section |
| A live AI call | Tests use stubbed answers; no real key was tried | One Groq answer through `/api/ai`, logged with its model name |
| Live readiness | `npm run demo:check` and `LIVE=1` were not run this session | A timestamped run against the real registries |
| Retrieval quality | Meaning search was judged by the support model's agreement | People mark the right sentence for each claim, and Recall@1 and @3 are reported |
| Full text | Claims are compared with abstracts unless a PDF is added | Open-access full text, such as Europe PMC, after a CSP and proxy review |
| An independent benchmark | All 104 claims are development data | A frozen set written by people outside the team, with baselines and every failure reported |

## What should happen next

### P0: make the merged build dependable

Yash reviews the shared-code requests in the [handover](deck/INTEGRATION_HANDOVER.md), merges and deploys. Then rehearse the [demo guide](deck/DEMO_GUIDE.html) on the live site:
- an invented DOI comes back Not found;
- the 13% claim against an altered 31% one;
- Audit on a polished paragraph;
- Guardrails, Run every check;
- the Lab's accuracy numbers with their caveats.

Keep a saved project and the recorded Lab replay as clearly announced backups.

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
