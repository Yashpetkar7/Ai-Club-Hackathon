# Ideas for the team to discuss

**Prepared:** 24 November 2026, Asia/Dubai.

**Status:** proposals and owner requests; not claims that these features are built.

**Basis:** [research and code audit](RESEARCH_AUDIT.md), [Hemanth brief](../team/HEMANTH.md), and [ownership rules](../../CLAUDE.md).

## Recommendation

Complete the approved integrity workflow before expanding feature count. Its strongest demonstration is a reference the checker handles, a reference it misses, and an unavailable check that it refuses to call successful. The competitive audit found source excerpts, retraction alerts, human review and audit trails in existing products, so none should be advertised as unique. [Evidence table](RESEARCH_AUDIT.md#competitor-features-keep-the-comparison-specific).

Proposed positioning for review: **Paper Trail helps students see what was checked, what remains uncertain, and what they personally approved.** A claim of better accuracy or usability needs a fair comparison, not a feature list.

Effort below is qualitative, not an estimate of hours: **small** means confined presentation/aggregation work; **medium** means meaningful state handling and tests; **cross-team** means a shared behavior or contract must be agreed. The assigned owner must assess feasibility against the current branch before implementation.

## Prioritized decisions and acceptance tests

| Priority / proposal | Why it matters | Owner and files | Effort | Acceptance evidence needed |
|---|---|---|---|---|
| **P0 — Resolve the export rule** | The deck's hard three-key promise conflicts with `citable()` allowing approved exceptions. A decision must precede a claim that export is blocked. | **Yash + Siddal**: `src/core/contracts.ts`, `src/store/actions.ts`, `src/core/cite/**`, `src/pages/Export.tsx`. Hemanth records the agreed behavior in `docs/deck/DECK.md`. | Cross-team | Exercise all combinations of found/checked/approved at the actual export boundary. If the team chooses strict export, an approved exception with a reason must remain blocked. If exceptions remain, every output must disclose them and deck wording must change. Test the exported artifact, not only the helper. |
| **P0 — Honest Lab scorekeeping** | Demonstrating misses is credible only when the selection and scoring rules are fixed before seeing results. | **Hemanth**: `src/core/lab/**`, `src/pages/Lab.tsx`, `src/pages/Lab.module.css`, `tests/unit/lab*.test.ts`. | Medium | Declare each case's expected outcome and failure family. Keep at least 12 distinct real references plus the brief's generated failure types. A known retraction correctly flagged is not a false alarm. A corrupted case confirmed is a miss; an unavailable check is unresolved. Every miss remains visible with its input. Run through `tests/unit/replay.ts` and keep all predeclared cases. |
| **P0 — Disclose partial registry coverage** | A Crossref match can remain confirmed when optional OpenAlex enrichment fails. “Any outage blocks confirmation” is not the current behavior. | **Yash**: `src/core/verify/**`, `src/core/registries/**`, `src/core/contracts.ts`; **Hemanth**: Lab explanations and Rules after agreement. | Cross-team | Simulate a matching Crossref response and failed OpenAlex enrichment. Show the trace/error and the agreed implication for retraction coverage. Separately test a required lookup outage produces Could not check. Pages must not fabricate or replace core verdicts. |
| **P0 — Make statements strictly event-derived** | A clean hash chain cannot establish that every action was logged, or that no external AI was used. | **Hemanth**: `src/pages/AiStatement.tsx`, its CSS and `tests/unit/statement*.test.ts`; **Yash/Nihal** supply missing event semantics through their owned files. | Medium plus possible shared request | Empty/incomplete logs say no AI use is recorded in the available log. Add/edit/remove a relevant event and confirm the statement changes. Count kept/changed/rejected suggestions only when explicit events identify those decisions; missing categories remain unknown. Runtime tool/version information is retained when recorded. |
| **P0 — Give log verification a precise meaning** | “Tamper-evident” must not imply immutable or complete history. | **Hemanth**: AiStatement copy/tests; **Yash**: shared log changes only if separately agreed. | Small | State that verification checks the supplied entries' consistency. Changing an entry's hashed content without recomputing its hash fails verification. A valid prefix can pass after the suffix is removed; the page must not treat that pass as proof that nothing was deleted. A complete local rewrite is outside the guarantee. |
| **P0 — Finish policy and deletion controls** | Students need an assessment rule they can understand and a clear account of deletion scope. | **Hemanth**: `src/pages/Rules.tsx`, `src/pages/Rules.module.css`; call existing `deleteEverything()`. | Medium | Link current policy v2, amended 24 February 2026. Map clauses to built/planned features; do not claim institutional certification. Confirm before deleting; cancel preserves data; confirmation calls the action once. Check what the shared action actually clears before saying “everything.” |
| **P1 — Preserve completed results on cancellation** | Cancellation must be predictable and must not turn unrun cases into misses or passes. | **Hemanth**: Lab runner/page/tests. **Yash** owns any `AbortSignal` addition to registry/checker APIs. | Medium | Cancel stops scheduling new cases, freezes completed rows and marks remaining cases unrun. A late response cannot overwrite a later run. Say whether in-flight requests continue; claim network abort only if that behavior is implemented and tested. |
| **P1 — Make a result easy to inspect and act on** | Competing tools already expose evidence. Paper Trail can focus that interaction on the student's immediate correction. | **Hemanth**: Lab detail rows and Rules; **Yash** for enhancements to Check/Find. | Small to medium | Each outcome offers plain-language reason, submitted text, registry evidence when present, run time and an appropriate next action. Keyboard users can expand/collapse details and return to the same place. No green status for uncertainty. |
| **P1 — Show the same proof on a narrow screen** | A readable Lab and policy page matter more than decorative additions to the demo. | **Hemanth**: owned pages/CSS; existing tokens only. | Medium | Record actual axe results, keyboard journeys and a 375 px inspection. The run/cancel controls, misses and status text remain usable. A clean automated scan is reported as an automated scan, not blanket accessibility certification. |

The policy proposal is grounded in the [official policy](https://www.spjain.org/hubfs/policies-pdf/Academic-Integrity-Policy-and-Procedures.pdf), particularly assessment authorization, attribution, responsibility for references and procedural fairness. It does not replace the assessment's own permission terms. The technical gaps above are grounded in the [audited code table](RESEARCH_AUDIT.md#corrections-that-affect-the-deck-and-implementation); no new runtime behavior is claimed here.

## One useful extension after the required work

**Proposed: a compact check receipt.** Let a student inspect or copy the submitted reference, matched metadata, comparison findings, consulted registries, unavailable stages, date and final student decision. Build it from existing structured results and logged events; do not add a generated assurance sentence that overstates the checks. Hemanth can present the Lab receipt using owned files; any reusable Check/export component belongs to Yash/Siddal.

Acceptance would be a receipt that remains truthful when enrichment fails, no match is found, a result is replayed, or a student keeps a flagged source. The recipient must be able to distinguish identity checking from claim support and scientific validity. This is a focused workflow improvement, not a novelty claim: Zotero, Elicit and Consensus already expose forms of source evidence. [Competitor sources](RESEARCH_AUDIT.md#competitor-features-keep-the-comparison-specific).

## Decisions to leave out of this slice

Avoid adding another registry, a new graph, account sharing, external uploads, a new dependency or a new visual system within Hemanth's work. These would expand ownership and verification work before the required Lab and disclosure are complete. Existing reference managers and mapping products have substantial documented capabilities; matching their breadth is not a realistic acceptance criterion for this slice. [Build scope](../team/HEMANTH.md), [feature audit](RESEARCH_AUDIT.md#competitor-features-keep-the-comparison-specific).

Keep competitor adoption counts and prices in the research background only. The deck must use the brief's permitted facts and actual test evidence, and must label planned capabilities. A useful comparison later would use the same predeclared references and tasks across products, publish misses and false alarms separately, and avoid extrapolating from a small demonstration to all research.

## Disclosure and review boundaries

These documents do not identify their builder or include coauthor attribution. The product's runtime log remains evidence: the request to omit builder attribution must not remove recorded tool/version metadata from a student's AI-use statement or create a false claim that no AI was used.

**APA contribution-statement slot:** `[Hemanth to provide the required items after reading APA's guide.]` The team should not claim APA compliance until that input is supplied and checked.

Work remains in the brief's order: deck, corpus, Lab, Rules, statement, Q&A. Write page behavior tests before implementing pages. Respect the review stops after the deck draft, after task 3 with the Lab results table, and after task 5; shared-code requests go to Yash rather than edits in another owner's files. These proposals do not authorize deployment, a pull request, changes to another branch, or additional dependencies. [Hemanth brief](../team/HEMANTH.md), [repository rules](../../CLAUDE.md).
