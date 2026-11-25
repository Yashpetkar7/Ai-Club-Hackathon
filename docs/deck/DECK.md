# Paper Trail: six-slide deck draft

**For Hemanth's review.** Updated 25 November 2026, Dubai time. This is the text and diagram specification, not the final PowerPoint. Follow [the Phase 1 outline](../PHASE1_DECK_OUTLINE.md): convert only the six slide sections below into slides. Preparation notes and evidence are not extra slides.

**Runtime basis:** main `7b0391ff0ec90e8b8f9fd2a030845cc42d3a753d`. The new Challenger, Map, local PDF import, evidence report, tour and command palette are present in that revision. Successful AI-provider tasks, the claim journey and citation exports are not. Code presence and unit verification do not establish that every feature has been exercised end to end. See [validation](VALIDATION.md), [research corrections](RESEARCH_AUDIT.md), [architecture alignment](NIHAL_ALIGNMENT.md) and [handover](HANDOVER.md).

**Separate candidate:** integration `59a876d6acf9fbdc6ea2a71697a0f6f16e16dcd5` has additional changes. They are not included in the slides' **Built** claims. Main verification at 08:29:55 Dubai on 25 November recorded 91 passed, 1 skipped across four unit-test files, with typecheck and build passing. The candidate's separate run at 08:30:31 recorded 126 passed, 1 skipped across six files, with typecheck and build passing. Both skipped the final no-stub-page check; neither result is an accuracy benchmark or completion certificate. [Run records](VALIDATION.md).

**Review blockers:** a genuine Check screenshot is still missing. The final citation-export behavior must resolve the strict three-key helper and the separate reason-based eligibility path. No Lab score, screenshot, usability measurement or accessibility result is supplied by this document.

## Preparation rules

- Use Marcellus headings, Public Sans body text and existing tokens from `src/ui/tokens.css`; square corners and thin straight borders. Green means an observed successful check.
- Use solid connectors for built paths and dashed connectors for planned paths. Label mixed components at the subcomponent level. A stub or successful mock response is not a working service.
- **Exact slide words** is the visible copy, including source footers. The diagram arranges that copy; do not duplicate the whole text beside it. Diagram labels are also visible.
- Aim for a silent reading of each composed slide within 60 seconds. That timing is a design target, not a measured usability result; conduct the reading before submission.
- **Points targeted** means rubric coverage, not points awarded. Weights come from the team extraction and Phase 1 outline; verify against the organisers' original rubric.

## Slide 1: The problem and our rule

**Title:** A convincing reference can still be wrong

### Exact slide words

A polished citation can name the wrong paper. A real paper can still fail to support a claim. The student answers for both.

**Paper Trail's rule:** registry found, code checked, student approved. AI holds no key.

**Built:** reference checks and receipts. Normal citation eligibility requires all keys and current rules; a separate approved-with-reason exception exists. **Planned:** complete citation exports with explicit exception handling.

**Measured:** main verification passed **91 unit tests; 1 was skipped**. Typecheck and build passed. The final no-stub-page check was skipped. These are software checks, not a citation-accuracy score.

**Source:** main `7b0391f`, 25 November 2026, 08:29:55 Dubai; [validation](VALIDATION.md).

**Screenshot slot:** actual Check result and receipt, labelled with mode, check time and completion status.

### Diagram and screenshot specification

| Box / area | Exact label | Connector |
|---|---|---|
| Registry | Registry found | To code: `Metadata` |
| Code | Code checked | To student: `Verdict and receipt` |
| Student | Student approved | To export: `Decision and any reason` |
| Dashed export box | Planned citation export | No outgoing arrow |
| Screenshot | Actual Check result and receipt | Caption states actual mode, check time and completion status |

Keep the four boxes in one row. The screenshot must come from the running app; do not recreate a success or invent its data. The image is **not yet available**. Use the [capture procedure](VALIDATION.md#required-screenshot).

**Points targeted:** frames the five assessed areas; no additional scoring category.

**Composer caveat:** `exportable()` in `src/core/contracts.ts` requires all three keys. `citable()` in `src/store/actions.ts` also permits an approved item with a saved reason when it has a record or a web/manual origin. `approveSource()` enforces the configured reason length for an unclean source; the reason does not turn its checked key on. Citation Export is still a stub. Do not promise strict exclusion until the team settles and tests the output boundary.

## Slide 2: Workflow

**Title:** The student controls the research journey

### Exact slide words

| Role, in order | Work and student control |
|---|---|
| Planner | **Built:** editable searches and code fallback; AI client wired, service unfinished. **Gate 1: approve plan.** |
| Scout | **Built:** retrieve registry records. |
| Checker | **Built:** compare metadata and show receipts. **Gate 2: keep or skip.** |
| Reader | **Planned:** claims linked to passages, with quote and support checks. |
| Challenger | **Built:** opposing searches, exact text slices and heuristic warnings. **Gate 3, planned: accept, rewrite or reject claims.** |
| Clerk | **Built:** HTML evidence report. **Planned:** citation files and log-derived AI-use statement. |

Map and local PDF import support the journey. Library, Evidence, Ask, Write and citation Export remain unfinished. The student writes the assignment.

**Sources:** `src/pages/`, `src/core/challenge/`, `src/core/report/`, `server/handlers/ai.mjs`; `docs/BUILD_PLAN.md`.

### Diagram specification

Arrange the six named roles in the stated order across three rows. Use these boxes and arrow labels; put Quote guard inside the planned Reader box.

| From | Arrow label | To |
|---|---|---|
| Student question | `Question and declared AI level` | Planner |
| Planner | `Editable searches` | Gate 1: approve plan |
| Gate 1 | `Approved searches` | Scout |
| Scout | `Registry records` | Checker |
| Checker | `Verdict and receipt` | Gate 2: keep or skip |
| Gate 2 | `Kept source text — planned` | Reader |
| Reader | `Claims and passages — planned` | Challenger |
| Student claim | `Claim to challenge — built` | Challenger |
| Challenger | `Pointers and warnings — planned handoff` | Gate 3: accept, rewrite or reject |
| Gate 3 | `Student decisions — planned` | Clerk |
| Saved project | `Current records and log — built` | Clerk: evidence report |

Keep normal paths through Gate 2 solid. Reader, Gate 3, their connecting paths, and the citation/statement part of Clerk are dashed. Challenger is a built standalone route; its connection to a completed claim-decision journey is planned. The built HTML report must not appear as a completed citation exporter. Map and PDF import are small supporting labels, not additional principal roles.

**Points targeted:** workflow, **8**. Six roles, three gates and checking are visible. Weight source: `docs/PHASE1_DECK_OUTLINE.md`.

## Slide 3: Architecture

**Title:** Reference checking works without AI

### Exact slide words

**Browser, built:** checks, receipts, editable planning, search, heuristic Challenger, Map, PDF text extraction and HTML report. Project data is stored in IndexedDB.

**Registry handler, built:** allow-listed proxy and cache for Crossref, OpenAlex, DataCite and doi.org. Direct lookup fallback also exists.

**AI handler, scaffold:** checks a declared permission level; successful provider tasks are unfinished. AI clients exist, with code fallbacks.

**Planned:** Reader, on-device inference, claim decisions, citation exports and AI-use statement. The implementation has no PostgreSQL, vector index or publication monitor.

**Adaptation:** revise policy and affected behavior, then rerun verification and the journey during the **90-minute** window announced at **13:15 on 26 November**.

**Sources:** `src/core/`, `src/store/db.ts`, `server/router.mjs`, `server/handlers/`; event timing: `docs/PROBLEM_STATEMENT.md`.

### Diagram specification

| Box | Contents and status |
|---|---|
| Browser workspace | Check, Plan, Find, Challenger, Map, PDF reader, receipts — built |
| Browser storage | IndexedDB: project data and log — built; some consumers planned |
| HTML report | Download from current project data — built |
| Registry handler | `/api/registry`: allow-list and cache — built |
| AI handler | `/api/ai`: declared-level checks — scaffold |
| Registry services | Crossref, OpenAlex, DataCite, doi.org — external metadata |
| On-device inference | Browser worker — planned |
| External AI service | Provider task execution — planned |

| From | Arrow label | To |
|---|---|---|
| Browser workspace | `Read and save` | Browser storage |
| Browser storage | `Current records and log` | HTML report |
| Browser workspace | `DOI or search fields` | Registry handler |
| Registry handler | `Lookups` | Registry services |
| Registry services | `Metadata or failure` | Registry handler |
| Registry handler | `Records and status` | Browser workspace |
| Browser workspace | `Direct lookup fallback` | Registry services |
| Browser workspace | `Task input and declared level — client built` | AI handler |
| AI handler | `Selected task input — planned` | External AI service |
| External AI service | `Candidate response — planned` | AI handler |
| AI handler | `Candidate response — planned` | Browser workspace |
| Browser workspace | `Local passage processing — planned` | On-device inference |

Put the two handlers inside a server boundary, with `/api/health` as a supporting route. Keep storage, PDF extraction, report generation and planned on-device inference inside the browser boundary. Use at most four boxes across. This shows data flow, not deployment or universal offline operation.

**Points targeted:** architecture, **6**. Browser, two handlers, registries, planned on-device AI, storage, arrows and adaptation. Weight source: `docs/PHASE1_DECK_OUTLINE.md`.

**Composer caveat:** follow the explicit 13:15 announcement and 90-minute window in the problem statement, not the build plan's inconsistent predicted timetable. The supplied future architecture image is not evidence of deployed database, vector or monitoring services.

## Slide 4: Guardrails

**Title:** A check explains its result

### Exact slide words

| Failure | Mechanism and visible outcome |
|---|---|
| Missing reference or identifier | **Built:** lookup and search; Not found with a trace |
| Real DOI, wrong paper | **Built:** title comparison; Wrong paper when its rule triggers |
| Wrong author or year | **Built:** field comparison; Details differ |
| Retraction | **Built:** available registry flags; Retracted, with incomplete coverage |
| Required lookups unavailable | **Built:** preserve errors; Could not check in tested outage cases |
| Invented quotation or unsupported claim | **Planned:** quote/support checks and claim labels |
| Guess presented as evidence | **Planned:** separate AI reasoning from supported claims |

**Built Challenger:** exact text slices and word-based warnings are reading aids, not proof of support. **Confirmed** concerns metadata; optional enrichment can fail while main still confirms.

**Sources:** `src/core/verify/verdict.ts`, `src/core/challenge/challenge.ts`, `tests/unit/verify.test.ts`, `docs/BUILD_PLAN.md`.

### Diagram specification

Use the table as the main visual. Under it place `Submitted fields` → `Checker` → `Receipt`, with arrow labels `Compare returned metadata` and `Verdict, reasons, trace`. A second, dashed path runs `Claim and passage` → `Planned claim checks`, labelled `Quotation and support`. A separate built `Challenger` box receives `Claim and available text` and outputs `Reading pointers, not claim verdicts`.

**Points targeted:** guardrails, **6**. Each brief failure has a mechanism, visible outcome and status. Weight source: `docs/PHASE1_DECK_OUTLINE.md`.

**Evidence caveat:** main can confirm a matching Crossref record after OpenAlex fails or returns no record. The separate integration candidate distinguishes some secondary-service failures but still does not require two agreeing records. Do not import that candidate's behavior into a main-based slide or call registry overlap independent proof.

## Slide 5: Ethical considerations

**Title:** Integrity includes showing the limits

### Exact slide words

| Risk | Response and current status |
|---|---|
| Invention | **Built:** metadata comparison. **Planned:** fixed Lab corpus with visible misses and false alarms. |
| Plagiarism | Student authorship remains the goal; this is not a plagiarism detector. **Planned:** passage-linked claims and disclosure. |
| Privacy | **Built:** browser storage and local PDF extraction. Lookup fields leave the device; external fonts load. **Planned:** deletion confirmation. |
| Bias | **Built:** opposing searches and source-balance counts. Neither measures all coverage or viewpoint bias. |
| Over-reliance | **Built:** plan/source decisions and report limitations. **Planned:** claim approval. |
| False accusation | Not found reports a search outcome; it does not establish fabrication or misconduct. |

The planned Lab will retain every declared case and publish every miss. Its results describe its corpus.

**Sources:** `src/core/report/`, `src/core/pdf/`, `src/pages/Challenge.tsx`, `src/store/db.ts`, `index.html`, `docs/team/HEMANTH.md`.

### Diagram specification

Use the six-row risk table without decorative icons. Beneath it, dashed `Fixed Lab corpus` → `Published outcomes`, with the arrow `Run the actual checker`. The outcomes box lists `Caught, missed, false alarm, could not check`. Label the whole Lab path **Planned** until corpus and page verification are complete.

**Points targeted:** ethical considerations, **5**. Invention, plagiarism, privacy, bias, over-reliance and false accusation. Weight source: `docs/PHASE1_DECK_OUTLINE.md`.

**Composer caveat:** PDF text extraction is bounded and has no OCR. Do not promise full-document reading, complete injection protection, comprehensive literature coverage or scientific truth. The present file path does not upload PDF bytes; it does send metadata for checks.

## Slide 6: Governance

**Title:** Responsibility stays visible

### Exact slide words

**Student:** follows assessment permission and owns source use. **Team:** owns implementation, tests and limitations. **Faculty:** sets conditions and evaluates work. AI grants no approval.

**AI levels:** 0 none; 1 search terms; 2 passages/summaries; 3 challenge. Declared-level checks exist; successful AI tasks remain unfinished. A selected level does not prove institutional permission.

| SP Jain clause | Product response |
|---|---|
| 3(a)(ii), 3(b)(iv), 10(h)(vii) | Assessment authorization governs AI use |
| 10(h)(vi) | Planned citation output |
| 10(h)(viii) | Planned log-derived statement |
| 10(h)(ix) | Built checker; planned Lab |
| 10(g)(vi) | Built HTML evidence report for inspection |

The report checks local log consistency: **tamper-evident, not tamper-proof**. It cannot prove complete history. APA statement requirements await Hemanth's review.

**Sources:** [SP Jain policy v2, 24 February 2026](https://www.spjain.org/hubfs/policies-pdf/Academic-Integrity-Policy-and-Procedures.pdf), `src/policy/policy.ts`, `src/core/report/report.ts`, `src/log/log.ts`.

### Diagram specification

Place `Student`, `Paper Trail team` and `Faculty` above the clause map. Connect Faculty → Student with `Assessment conditions`; Student → `HTML evidence report — built` with `Available recorded activity`; report → Faculty with `Material for inspection`; Team → report with `Tests and limitations`. Add dashed `AI-use statement — planned` fed from `Available log`, labelled `Disclose only recorded evidence`. Software does not decide misconduct.

**Points targeted:** governance, **5**. Accountable people, permission levels, disclosure and policy clauses. Weight source: `docs/PHASE1_DECK_OUTLINE.md`.

**Marked APA slot, outside the submitted slide:** `[Hemanth to supply the guide's confirmed required items and date reviewed.]` Do not infer them. Missing log evidence is not proof that no AI was used. The report is available; the standalone AI-use statement and its review workflow remain planned.

## Coverage and release review

| Required area | Main slide | Rubric weight |
|---|---|---|
| Workflow | 2 | 8 |
| Architecture | 3 | 6 |
| Guardrails | 4 | 6 |
| Ethical considerations | 5 | 5 |
| Governance | 6 | 5 |
| Problem and three-key rule | 1 | Frames the above |

Weights total **30**, from `docs/PHASE1_DECK_OUTLINE.md`. No score is promised.

Before submission: insert the genuine screenshot; keep main and candidate evidence separate; retain planned labels until completion is verified; settle citation exceptions; check source footers and the original rubric; time each composed slide's silent reading. Preserve six slides. The existing review stop after the deck draft remains in force before Lab implementation.
