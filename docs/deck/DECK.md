# Paper Trail: six-slide deck draft

**For Hemanth's first review.** Prepared 24 November 2026, Dubai time. This is the deck text and diagram specification requested in the brief, not the final PowerPoint submission. The slide sequence follows [the Phase 1 outline](../PHASE1_DECK_OUTLINE.md). Convert only the six numbered slide sections into slides; preparation notes and evidence are not extra slides.

**Evidence baseline:** repository `723523c91b2cdcf26b8b9cbdf98e4facfc160df5`. Implementation and executed tests take precedence over the build plan or earlier report. See [validation](VALIDATION.md), [report corrections](RESEARCH_AUDIT.md), [Nihal architecture alignment](NIHAL_ALIGNMENT.md) and [shared-code requests](HANDOVER.md).

**Review blockers:** slide 1 still needs an actual Check screenshot. Local browser launch failed, and the cloud browser could not access the local app. No screenshot, Lab score, usability result or accessibility result has been fabricated. Strict three-key export remains a design target until the citation exception is resolved and the completed export journey is tested.

## Preparation rules

- Use Marcellus headings, Public Sans body text and the existing values in `src/ui/tokens.css`. Use square corners and thin straight borders. Reserve `--ok` green for an observed successful check.
- Use solid connectors for built paths and dashed connectors for planned paths, with a visible legend. Keep **Built** and **Planned** beside the relevant content.
- **Exact slide words** is the visible copy, including table labels and source footers. The diagram specification gives placement and arrow labels. It is an alternative visual arrangement of the same content, not a second block of duplicate prose.
- Keep the composed slides readable without narration. A timed human reading of each composed slide is still pending; the 60-second requirement has not been measured.
- **Points targeted** means rubric coverage, not points already awarded. The weights come from the team's extraction in `docs/PROBLEM_STATEMENT.md`; check the organisers' original rubric before submission.

## Slide 1: The problem and our rule

**Title:** A convincing reference can still be wrong

### Exact slide words

Students answer for the sources they submit. A polished citation can contain the wrong title, author, year or identifier. A real paper can also fail to support the claim attached to it.

**Paper Trail's rule:** registry found, code checked, student approved. AI holds no key.

**Built:** reference checks and inspectable receipts. **Planned:** the complete research-to-export journey, with the three-key rule enforced at export.

**Observed in this checkout:** all **3 of 3** simulated total-registry-outage tests returned **Could not check**. This is a controlled unit-test result, not an accuracy estimate or a live Lab score.

**Source:** `tests/unit/verify.test.ts`, run 24 November 2026, 22:24 Dubai; [validation record](VALIDATION.md).

**Screenshot slot:** actual Check result and receipt. Capture and label its real mode and check time before submission.

### Diagram and screenshot specification

| Box / area | Exact label or content | Connector |
|---|---|---|
| Registry box | Registry found | To code: `Metadata record` |
| Code box | Code checked | To student: `Verdict and receipt` |
| Student box | Student approved | To export: `Approved source` |
| Export box, dashed | Planned export gate | No outgoing arrow |
| Screenshot area | Actual Check interface with its selected receipt visible | Caption states live versus SAMPLE, time and completion status |

Use one row of four boxes. Do not insert a recreated UI, generated screenshot, simulated success or invented citation. The source image is **not yet available**. The capture procedure is in [VALIDATION.md](VALIDATION.md#required-screenshot).

**Points targeted:** frames all five assessed areas; no additional scoring category.

**Composer caveat:** `src/core/contracts.ts:exportable` requires all keys, but `src/store/actions.ts:citable` also permits an approved item kept with a reason. Export is a stub. Retain **Planned** until that conflict is resolved and tested.

## Slide 2: Workflow

**Title:** The student controls the research journey

### Exact slide words

| Role, in order | Work and student control |
|---|---|
| Planner | Planned AI search suggestions. Built today: editable keyword plan. **Gate 1: approve the plan.** |
| Scout | Built: retrieve records from scholarly registries. |
| Checker | Built: compare metadata and show the receipt. **Gate 2: keep or skip each source.** |
| Reader | Planned: connect claims to exact passages. Quote guard checks the text. |
| Challenger | Planned: seek conflicting evidence and flag overclaims. **Gate 3: accept, rewrite or reject each claim.** |
| Clerk | Planned: format citations, check export eligibility and assemble disclosure from recorded activity. |

The student organises sources and writes the assignment. Library, Evidence, Write and Export are still planned in this checkout.

**Source:** `src/pages/Plan.tsx`, `Find.tsx`, `src/policy/policy.ts`, `docs/BUILD_PLAN.md`.

### Diagram specification

Create one diagram across three rows, with at most four boxes side by side. Keep the six role names in the order above. Quote guard is a sublabel inside Reader, not an additional principal role.

| From | Arrow label | To |
|---|---|---|
| Student question | `Question and assessment permission` | Planner |
| Planner | `Editable plan` | Gate 1: approve the plan |
| Gate 1 | `Approved searches` | Scout |
| Scout | `Registry candidates` | Checker |
| Checker | `Verdict and receipt` | Gate 2: keep or skip |
| Gate 2 | `Kept source passages` | Reader |
| Reader | `Claims and passages` | Challenger |
| Challenger | `Evidence and objections` | Gate 3: accept, rewrite or reject |
| Gate 3 | `Student decisions and writing` | Clerk |

Solid paths end at Gate 2. The AI part of Planner, Reader, Challenger, Gate 3 and Clerk have dashed borders/connectors and explicit **Planned** labels. Show student organising and writing alongside the path.

**Points targeted:** workflow, **8**. Includes six roles, three gates and deterministic checking. Weight source: `docs/PHASE1_DECK_OUTLINE.md`.

## Slide 3: Architecture

**Title:** Reference checking works without AI

### Exact slide words

**Browser, built:** Check, editable Plan, Find, metadata comparison and receipts. Project records and selected activity events stay in IndexedDB.

**Registry handler, built:** allow-listed proxy and cache. The browser checker selects Crossref, OpenAlex, DataCite or doi.org as needed. A separate health route reports availability.

**AI handler, scaffold:** minimum-level checks exist. Successful AI responses are not implemented.

**Planned:** passage and claim checks, on-device inference, citation formatting and export. Approved AI requests would send selected input to an external provider.

**Day-of adaptation:** use the **90-minute** window to revise the shared policy, then rerun verification and the affected journey. Extra requirements arrive at **13:15 on 26 November**.

**Sources:** `server/router.mjs`, `server/handlers/`, `src/core/registries/`, `src/store/db.ts`; `docs/PROBLEM_STATEMENT.md` for event timing.

### Diagram specification

| Box | Contents / status |
|---|---|
| Browser workspace | Check, Plan, Find, deterministic checker, receipts — built |
| Local storage | IndexedDB: projects, sources, claims, drafts, log — schema built; some consumers planned |
| Registry handler | `/api/registry`: allow-list and cache — built |
| AI handler | `/api/ai`: permission scaffold — successful tasks planned |
| Registry services | Crossref, OpenAlex, DataCite, doi.org — external metadata |
| On-device inference | Planned browser worker |
| External AI service | Planned optional service |

| From | Arrow label | To |
|---|---|---|
| Browser workspace | `Save and read project data` | Local storage |
| Browser workspace | `DOI or search fields` | Registry handler |
| Registry handler | `Lookup requests` | Registry services |
| Registry services | `Metadata or failure` | Registry handler |
| Registry handler | `Records and status` | Browser workspace |
| Browser workspace | `Selected input and declared AI level — planned` | AI handler |
| AI handler | `Approved task input — planned` | External AI service |
| External AI service | `Candidate response — planned` | AI handler |
| AI handler | `Candidate response — planned` | Browser workspace |
| Browser workspace | `Local passage processing — planned` | On-device inference |

Put both service handlers inside a server boundary. Add `/api/health` as a supporting route. Put on-device inference inside the browser boundary. The client can also call registries directly when the server is unavailable: label that secondary built path `Direct lookup fallback`. This is a data-flow diagram, not a deployment claim.

**Points targeted:** architecture, **6**. Includes browser, two service handlers, registries, planned on-device AI, storage, data flow and adaptation. Weight source: `docs/PHASE1_DECK_OUTLINE.md`.

**Composer caveat:** the build plan's later schedule has an inconsistent adaptation start. Use the explicit **13:15** announcement and **90-minute** window from the problem statement, not the predicted timetable.

## Slide 4: Guardrails

**Title:** A check explains its result

### Exact slide words

| Failure | Mechanism | Student sees |
|---|---|---|
| No matching reference | Built: identifier lookup and search | Not found and search trace |
| Real DOI, different paper | Built: compare supplied title | Wrong paper when the mismatch meets that rule |
| Wrong author or year | Built: field comparison | Details differ and registry values |
| Retraction flag | Built: available registry notices | Retracted; coverage is incomplete |
| Total registry outage in tested cases | Built: preserve lookup errors | Could not check |
| Invented quote or unsupported claim | Planned: exact-quote and support checks | Planned claim labels and source passage |
| Guess presented as evidence | Planned: separate AI reasoning | No verified label without required checks |

A secondary registry can fail after another provides a match. Inspect the receipt: **Confirmed is a metadata result, not proof of claim support or complete retraction coverage.**

**Sources:** `src/core/verify/verdict.ts`, `src/core/registries/map.ts`, `src/core/contracts.ts`, `tests/unit/verify.test.ts`, `docs/BUILD_PLAN.md`.

### Diagram specification

Use the table as the main visual. Beneath it place `Submitted fields`, `Checker`, `Receipt`. Label the arrows `Compare with returned metadata` and `Verdict, reasons and registry trace`. Add a dashed path from `Claim and passage` to `Planned claim checks`, labelled `Text and support evidence`.

**Points targeted:** guardrails, **6**. Covers reference, quotation and unsupported-claim failures with status and observable outcomes. Weight source: `docs/PHASE1_DECK_OUTLINE.md`.

**Evidence caveat:** slide 1 covers total outages, not every partial failure. The checker currently confirms an otherwise matching Crossref record when OpenAlex enrichment fails. Do not promise a different behavior.

## Slide 5: Ethical considerations

**Title:** Integrity includes showing the limits

### Exact slide words

| Risk | Response and current status |
|---|---|
| Invention | Built: compare registry metadata. Planned: publish Lab misses and false alarms. |
| Plagiarism | The student writes. Planned: link quotations to passages and disclose recorded AI assistance. |
| Privacy | Built: browser storage. Lookup fields leave the device; external fonts also load. Planned: explain AI data flows and confirm deletion. |
| Bias | Registry coverage can exclude real work. Planned: disclose coverage gaps and seek contrary evidence. |
| Over-reliance | Built: plan and source decisions. Planned: claim approval and a list of unchecked work. |
| False accusation | Not found describes our search. It does not establish fabrication or misconduct. |

The Lab will keep a fixed corpus and show every miss. Results will describe that corpus, not universal accuracy.

**Sources:** `src/core/contracts.ts`, `src/store/db.ts`, `src/core/registries/http.ts`, `index.html`, `docs/team/HEMANTH.md`.

### Diagram specification

Use the six-row table, without decorative icons. Under it place two dashed boxes, `Fixed Lab corpus` and `Published outcomes`, connected by `Run the actual checker`. The second box contains `Caught, missed, false alarm, could not check`. Mark the whole Lab diagram **Planned** until tasks 2 and 3 pass verification.

**Points targeted:** ethical considerations, **5**. Covers invention, plagiarism, privacy, bias, over-reliance and false accusation. Weight source: `docs/PHASE1_DECK_OUTLINE.md`.

## Slide 6: Governance

**Title:** Responsibility stays visible

### Exact slide words

**Student:** follows assessment permission, checks source use and approves decisions. **Team:** owns implementation, testing and disclosed limitations. **Faculty:** sets assessment conditions and evaluates submitted work. AI approves nothing.

**AI levels:** 0 No AI; 1 search terms; 2 passages and summaries; 3 challenge. The policy model exists. Successful AI tasks and complete enforcement remain planned.

| SP Jain clause | Product response |
|---|---|
| 3(a)(ii), 3(b)(iv), 10(h)(vii) | Assessment permission governs AI use |
| 10(h)(vi) | Planned APA citation output |
| 10(h)(viii) | Planned statement from recorded activity |
| 10(h)(ix) | Built checker; planned Integrity Lab |
| 10(g)(vi) | Planned evidence for faculty inspection |

The local log checks chain consistency: **tamper-evident, not tamper-proof**. It cannot prove the history is complete. APA statement requirements await Hemanth's review.

**Sources:** [SP Jain Academic Integrity Policy v2, 24 February 2026](https://www.spjain.org/hubfs/policies-pdf/Academic-Integrity-Policy-and-Procedures.pdf), `src/policy/policy.ts`, `src/log/log.ts`, `server/handlers/ai.mjs`.

### Diagram specification

Use responsibility boxes `Student`, `Paper Trail team`, `Faculty` above the clause map. Connect Faculty to Student with `Assessment conditions`. Connect Student to a dashed `Disclosure and evidence` box with `Recorded decisions`, and that box to Faculty with `Material for review`. Connect Paper Trail team to the evidence box with `Tests and limitations`. The software does not decide misconduct, and a student-selected level does not prove institutional authorisation.

**Points targeted:** governance, **5**. Names accountable people, policy constraints, AI levels and disclosure. Weight source: `docs/PHASE1_DECK_OUTLINE.md`.

**Marked APA slot, outside the submitted slide:** `[Hemanth to supply the guide's confirmed required items and date reviewed.]` Do not fill from memory. The statement must disclose recorded activities only and distinguish missing evidence from a confirmed absence of AI use.

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

Before submission: insert the genuine screenshot; resolve shared-code gaps or retain their qualifications; update status only after verification; check source footers and original rubric; time a silent reading of each composed slide. Preserve six slides and the uncertainty labels. Hemanth's review stop is here, before Lab implementation.
