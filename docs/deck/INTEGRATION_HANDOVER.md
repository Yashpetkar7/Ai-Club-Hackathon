# Handover for Yash: `hemanth/lab-governance`

**Branch:** `hemanth/lab-governance`, pushed as hbasired with normal fast-forward pushes (no force). On 26 November it was brought up to date with `main` (`a39d992`, merge commit `553b3d3`), so merging it back into `main` has no conflicts (checked with `git merge-tree`). **Deploying is not automatic:** `vercel.json` has `"git": {"deploymentEnabled": false}`, so after merging, deploy by hand as before.

Product direction and what is still open: [vision and roadmap](../VISION_AND_ROADMAP.md). Test output and measured numbers: [current validation](VALIDATION_CURRENT.md). Phase 2 case by case: [PHASE2_CASES.md](PHASE2_CASES.md).

## Phase 2 day-of changes (26 November, after 13:15)

General rules, none written for a test-pack reference. Each needs its owner's look before merging.

**Yash**
- `src/core/verify/verdict.ts`:
  - A DOI whose record has none of the given authors is Wrong paper.
  - A web page with no scholarly details gets `could-not-check` with `WEB_SOURCE`.
  - A reference with no DOI and no clean Crossref match is also searched in OpenAlex by title. The result is looked up by its DOI in Crossref or DataCite, so OpenAlex never vouches for itself; a work found only there with no DOI is One registry only (`NO_DOI_ONE_REGISTRY`).
  - The Lab sample was re-recorded, and no verdict changed.
- `src/core/verify/fix.ts` (new): `registryFix()` builds a suggested fix from the record only. `duplicateGroups()` finds the same work twice in one list.
- `src/core/contracts.ts`: two reason codes, `NO_DOI_ONE_REGISTRY` and `WEB_SOURCE`, with their text.
- `src/core/registries/index.ts`: `openalexSearch()` (OpenAlex `title.search`).
- `src/pages/Check.tsx`:
  - Accept the fix or Keep mine; an accepted fix is checked again.
  - "You pasted" against "This DOI points to" for Wrong paper.
  - Duplicate groups with Keep one and merge, or They are different works.
- `src/core/pdf/injection.ts`: three patterns for orders aimed at the checker ("SYSTEM:", "ignore … rules", "mark … as verified").

**Siddal**
- `src/core/cite/export.ts`: every exported entry carries its status (`exportStatus()`), in text, BibTeX (note), RIS (N1) and Word. The words are Verified, Needs fix, Mismatch, Retracted, Not found, Not checked, plus SAMPLE and "kept by the student with a reason".
- `src/pages/Export.tsx`: one sentence changed to say the status travels with each entry.
- `src/pages/Library.tsx`: a calm notice under Notes when a note reads like an instruction to an AI. Notes save as typed.

**Nihal**
- `src/pages/Ask.tsx`:
  - "Not found" plus a link to registry search; asking works with an empty library.
  - A quotation is checked word for word against the cited source's text (`src/core/claims/quoteCheck.ts`, new, using your `quotesExactly()`), and closest sentences are not shown for a quotation.
  - `src/core/claims/quote.ts` was overwritten by mistake during this work and restored from git, unchanged, before any commit.

Tests: `tests/unit/phase2-cases.test.ts` (16 cases on the real checker with SAMPLE stand-in registries).

## What works

| Area | Where | What a student or judge sees |
|---|---|---|
| Research Compass, Study studio, reading priority | `#/p/<id>/compass`, `learn`, Find | The next step. Read, capture an exact passage, question it, recall it. Visible priority weights, with no bonus for citation counts. |
| Find by meaning and the claim scorecard | Evidence | The closest sentences by meaning and shared words (Snowflake arctic-embed-xs, running in the browser). Support, neutral and contradiction bars against the 90% lines. Claim and source numbers side by side (31% against 13%). One click checks a claim against every source. `judge()` still makes every label. |
| Audit a paragraph | `#/audit` | Paste polished text with references. Every reference is checked and gets a receipt. Every claim is linked to what it cites and labelled, in a claims-by-references grid. The SAMPLE is built from real recorded lookups. |
| How accurate is it? | Integrity Lab | Claim and reference numbers worked out on load from labelled data, with ranges, an ablation, a threshold chart and every miss listed. |
| Guardrails, run live | `#/guardrails` (from House rules, the Lab, the More menu and the palette) | 10 checks with 39 cases. Each case runs the real code on a SAMPLE input and compares the expected result with the actual one. Also shows what runs where, model cards with measured numbers, and our own mapping to NIST AI RMF 1.0, the OWASP Top 10 for LLM Applications 2025 and UNESCO's 2023 guidance, labelled as not a certification. |
| Discover | A new helper tab next to Find (Find is unchanged) | OpenAlex keyword and meaning searches merged by reciprocal rank fusion, each result tagged by how it was found, plus related works for a library source. Adding a paper runs the checker and saves it unapproved. |
| Explain this label (AI) | Evidence, at level 2 and up | A new Explainer agent in the house rules. At most three sentences, checked by code on the server and the page: no number that is not in the checks, no reference, no other label. It never changes the label. |
| Navigation | Project rail, palette, empty pages | Helpers under their step with hints, a "where you are" line, every page in the palette, and one button out of every empty page. |

## Shared-code requests

Several of these go beyond one-line hooks. Each needs its owner's review before you merge.

**Yash**
1. Merge `hemanth/lab-governance` when you are happy with it, then deploy. Nothing was deployed from this branch.
2. Navigation was restructured, not only hooked:
   - The rail markup moved from `ProjectShell.tsx` into `src/app/Trail.tsx`.
   - `App.tsx` has the `#/audit` and `#/guardrails` routes and an empty default step.
   - `router.tsx` sends Back to `/p/<id>`.
   - Also changed: `CommandPalette.tsx` (it now reads `src/app/places.ts`), `TopBar.tsx` (an Audit link, and Guardrails under More), and `Projects.tsx` and `Home.tsx` (they use `projectPath()`).
   - `Check.tsx`, `Read.tsx`, `Map.tsx` and `Challenge.tsx` each gained one `FixFirst` or `SeeAlso` line.
   - `Guide.tsx` has one new section and a corrected helper list.
3. `policy.ts` has a new Explainer agent (AI, level 2), and the level 2 text now mentions explaining a label.
   - The Lab sample was re-recorded because it hashes `policy.ts`. No verdict changed.
   - `Team.tsx` maps the Explainer to Evidence.
   - `statement.ts` now counts `ai.explain` calls and names meaning-model runs.
4. `contracts.ts`, additive only: the reason code `MEANING_NOT_COMPARED` with its text, optional `ClaimChecks.neutral` and `wordForWord`, and optional `Claim.match`.
5. `server/guard.mjs` forwards one header, `x-owner-ai-key`, and only when it is shaped like a Groq key. `src/core/aiClient.ts` has `postAi()`, the single place the page calls `/api/ai`.
6. `package.json`: the engine was raised to Node 22.19 for `test:compass`, which needs type stripping. `verify` now includes `test:compass`, and `demo:check` was added. Please check which Node version the Vercel project uses; I have not confirmed it.
7. A later change, with a Lab re-record: in `http.ts`, make `bucketOf` match `search.semantic=`, and export `OA_FIELDS` from `registries/index.ts`, so Discover can drop its own copy.
8. In Vercel's environment:
   - A server-side `GROQ_API_KEY` is the proper way to give everyone AI.
   - `OPENALEX_API_KEY` raises Discover's budget. Without it, everyone on one IP address shares about 50 searches a day.
9. Next sources, not added: Europe PMC full text and Semantic Scholar TLDRs. Each needs new CSP hosts in `index.html`, `vercel.json` and `server/headers.mjs`, plus the proxy ALLOW list.
10. Add `src/core/semantic`, `src/core/discover` and `src/core/guardrails` to the code map in `CLAUDE.md`.

**Nihal**
1. `Evidence.tsx` was extended in place, not given a separate page. It gained find by meaning, the scorecard, check against every source, and one `ExplainLabel` line.
2. `label.ts`: `MEANING_NOT_COMPARED` when no model ran (`MODEL_UNSURE` only when it ran). A one-registry source keeps the checker's own reason.
3. `guards.ts`: fixes a bug where a spelled-out number right after a word was missed. It also adds display-only `directionWords` and `scopeWords`.
4. `support.ts` and `support.worker.ts` now share one worker for both models (`src/core/claims/host.ts`).
5. `server/handlers/ai.mjs`:
   - The owner key is tried first.
   - There is a new `explain` task (level 2).
   - For gpt-oss models the request now sends `reasoning_effort: 'low'` and `include_reasoning: false`. This also affects the server's own key, and it has not been tried against live Groq.
6. `Ask.tsx`: the "no approved sources" paragraph became a `FixFirst` button with the same words.
7. Where a page starts among several candidate sentences was measured on the real models (`tests/unit/best-candidate.test.ts`). Starting on the closest sentence won; see the validation record.

**Siddal:** no files in your area changed.

## What was tested

Full details are in [current validation](VALIDATION_CURRENT.md). In short:

| Check | Result |
|---|---|
| Typecheck | Clean |
| Unit tests | 1,049 passed, 2 skipped |
| Offline tests | 27 of 27 |
| Build | Built |
| Browser tests in Chrome | 59 passed, 5 opt-in skipped |
| Real-model recording | 449 support runs over 104 labelled claims |

## What does not work yet, or was not tried

- There was no live Groq call with a real key. AI answers in the tests are stubs.
- Not run this session: `buttons.spec.ts` with `AUDIT=1`, `live.spec.ts`, `npm run demo:check`, and a check of the six slides in PowerPoint.
- Retrieval by meaning was measured against the support model's agreement, not against sentences a person marked as correct.
- Claims are compared with abstracts unless a PDF is added.
- On a phone the project rail is taller than before. Read and Study studio still overlap.
- The deck submitted at 09:00 says there are three fixed AI tasks and that keys are server-side. The gateway now has four tasks (Explain is the fourth), and for a demo an owner can supply a key from their own browser tab.

## Files changed since `main` (35 test and doc files not listed)

#### Hemanth, existing files
- `docs/deck/DECK.md` +228/-158
- `docs/deck/DEMO_GUIDE.html` +30/-0 (new)
- `docs/deck/HANDOVER.md` +2/-0
- `docs/deck/INTEGRATION_HANDOVER.md` +33/-0 (new)
- `docs/deck/LAB_RESULTS.md` +2/-0
- `docs/deck/QA.md` +21/-0 (new)
- `docs/deck/REPO_UPDATE_2026-11-25.md` +2/-0
- `docs/deck/Team1_PaperTrail.pptx` +-/-- (new)
- `docs/deck/VALIDATION.md` +2/-0
- `docs/deck/VALIDATION_CURRENT.md` +63/-0 (new)
- `docs/prompts/HEMANTH.md` +80/-0
- `src/core/lab/README.md` +19/-1
- `src/core/lab/benchmark.ts` +22/-0 (new)
- `src/core/lab/claims-data.ts` +85/-0 (new)
- `src/core/lab/claims-eval.json` +1187/-0 (new)
- `src/core/lab/explain.ts` +77/-0 (new)
- `src/core/lab/metrics.ts` +272/-0 (new)
- `src/core/lab/retrieval.ts` +62/-0 (new)
- `src/core/lab/sample-run.json` +88/-87
- `src/core/lab/sample.ts` +1/-1
- `src/pages/AiStatement.tsx` +22/-6
- `src/pages/Lab.module.css` +41/-0
- `src/pages/Lab.tsx` +392/-3
- `src/pages/Rules.module.css` +1/-0
- `src/pages/Rules.tsx` +17/-8


#### Hemanth, new files
- `server/handlers/explain.mjs` +75/-0 (new)
- `server/ownerKey.mjs` +13/-0 (new)
- `src/app/Trail.module.css` +56/-0 (new)
- `src/app/Trail.tsx` +133/-0 (new)
- `src/app/places.ts` +44/-0 (new)
- `src/core/claims/audit.ts` +373/-0 (new)
- `src/core/claims/explain.ts` +67/-0 (new)
- `src/core/claims/host.ts` +72/-0 (new)
- `src/core/claims/nli.ts` +48/-0 (new)
- `src/core/discover/fuse.ts` +80/-0 (new)
- `src/core/discover/index.ts` +82/-0 (new)
- `src/core/discover/openalex.ts` +84/-0 (new)
- `src/core/guardrails/architecture.ts` +106/-0 (new)
- `src/core/guardrails/checks.ts` +537/-0 (new)
- `src/core/guardrails/frameworks.ts` +118/-0 (new)
- `src/core/guardrails/samples.ts` +91/-0 (new)
- `src/core/ownerKey.ts` +76/-0 (new)
- `src/core/semantic/meaning.ts` +177/-0 (new)
- `src/core/semantic/models.ts` +10/-0 (new)
- `src/core/semantic/rank.ts` +152/-0 (new)
- `src/fixtures/audit-sample.ts` +23/-0 (new)
- `src/pages/Audit.module.css` +105/-0 (new)
- `src/pages/Audit.tsx` +890/-0 (new)
- `src/pages/Discover.module.css` +22/-0 (new)
- `src/pages/Discover.tsx` +363/-0 (new)
- `src/pages/ExplainLabel.module.css` +7/-0 (new)
- `src/pages/ExplainLabel.tsx` +97/-0 (new)
- `src/pages/Guardrails.module.css` +59/-0 (new)
- `src/pages/Guardrails.tsx` +365/-0 (new)
- `src/pages/HowChecksWork.module.css` +7/-0 (new)
- `src/pages/HowChecksWork.tsx` +64/-0 (new)
- `src/pages/OwnerKey.module.css` +10/-0 (new)
- `src/pages/OwnerKey.tsx` +161/-0 (new)
- `src/pages/Signposts.module.css` +3/-0 (new)
- `src/pages/Signposts.tsx` +63/-0 (new)


#### Nihal
- `server/handlers/ai.mjs` +32/-12
- `src/core/claims/guards.ts` +22/-3
- `src/core/claims/label.ts` +14/-4
- `src/core/claims/store.ts` +5/-0
- `src/core/claims/support.ts` +53/-34
- `src/core/claims/support.worker.ts` +102/-29
- `src/pages/Ask.tsx` +2/-5
- `src/pages/Evidence.module.css` +27/-0
- `src/pages/Evidence.tsx` +437/-66


#### Yash
- `src/app/App.tsx` +5/-1
- `src/app/CommandPalette.tsx` +10/-14
- `src/app/ProjectShell.module.css` +0/-25
- `src/app/ProjectShell.tsx` +20/-29
- `src/app/TopBar.tsx` +2/-0
- `src/app/router.tsx` +2/-1
- `src/core/contracts.ts` +13/-1
- `src/core/pdf/read.ts` +2/-2
- `src/core/report/statement.ts` +19/-6
- `src/core/verify/verdict.ts` +36/-6
- `src/log/chain.ts` +23/-0 (new)
- `src/log/log.ts` +4/-20
- `src/pages/Challenge.tsx` +2/-0
- `src/pages/Check.tsx` +2/-0
- `src/pages/Find.module.css` +5/-0
- `src/pages/Find.tsx` +66/-18
- `src/pages/Guide.tsx` +6/-2
- `src/pages/Home.tsx` +3/-2
- `src/pages/Map.tsx` +2/-0
- `src/pages/Projects.tsx` +2/-1
- `src/pages/Read.tsx` +2/-0
- `src/pages/Team.tsx` +1/-1
- `src/policy/apply.ts` +11/-2
- `src/policy/policy.ts` +3/-2
- `src/store/actions.ts` +7/-6
- `src/ui/PdfDrop.tsx` +4/-2


#### Yash, backend
- `server/guard.mjs` +5/-1


#### Not in the code map (earlier candidate and shared client)
- `README.md` +23/-23
- `package-lock.json` +1/-1
- `package.json` +4/-2
- `scripts/demo-readiness.mjs` +55/-0 (new)
- `scripts/record-lab-sample.mjs` +46/-0 (new)
- `scripts/source-loader.mjs` +22/-0 (new)
- `src/core/aiClient.ts` +14/-4
- `src/core/learning/study.ts` +72/-0 (new)
- `src/core/research/priority.ts` +59/-0 (new)
- `src/pages/Compass.module.css` +14/-0 (new)
- `src/pages/Compass.tsx` +39/-0 (new)
- `src/pages/Learn.module.css` +16/-0 (new)
- `src/pages/Learn.tsx` +114/-0 (new)
