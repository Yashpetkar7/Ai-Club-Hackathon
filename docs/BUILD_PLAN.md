# Build plan: Paper Trail

**Status: v3, APPROVED and being built, 24 Nov 2026 (evening).** The foundation, Check, Plan, Find and the 3D landing work locally. Briefs for each member are in `docs/team/`.

v2 added the landing page, 3D and the no-deploy rule. v3 follows the Rules and Regulations: nothing from any other team's members, the live-link rule, and one branch per person. The 3D landing exists as a working prototype (design only): https://claude.ai/artifact/UWdYvnn3S3sQHkQdZCDAz2

Facts in this plan were tested or read on 24 Nov 2026. Anything else is marked *assumption* or *estimate*.

---

## 1. Challenge understanding

- **Problem in one sentence:** AI makes research fast and makes fake references look real, and the student is blamed for every one.
- **Who experiences it:** students writing assessed work, and the faculty who must check it.
- **Why current approaches are insufficient:** reference managers format whatever you give them. AI assistants summarise but do not prove. Dedicated checkers stop at "does this reference exist", and a July 2026 review of five of them found extraction errors, incomplete metadata, limited coverage and inconsistent results ([arXiv 2607.22693](https://arxiv.org/abs/2607.22693)). The gap nobody covers for students is the next step: **the paper is real, and it still does not say that.**
- **What success looks like:** a judge pastes any paragraph and watches every reference and claim get checked in front of them, then follows one claim back to the exact sentence in the exact paper.

### Evidence we can cite (all opened on 24 Nov)

| Finding | Source |
|---|---|
| 55% of GPT-3.5 citations and 18% of GPT-4 citations were fabricated | Walters & Wilder (2023), [10.1038/s41598-023-41032-5](https://doi.org/10.1038/s41598-023-41032-5) |
| Conservative estimate of 146,932 hallucinated citations in 2025; they over-credit prominent and male scholars | [arXiv 2605.07723](https://arxiv.org/abs/2605.07723) |
| 100 fabricated citations in 53 accepted NeurIPS 2025 papers got past 3 to 5 reviewers each. Five failure types: total fabrication 66%, part-corrupted 27%, hijacked identifier 4%, placeholder 2%, semantic 1% | [arXiv 2602.05930](https://arxiv.org/html/2602.05930v1) |
| SP Jain's own policy names AI-fabricated references as a student responsibility | [Academic Integrity Policy v2, 24 Feb 2026](https://www.spjain.ae/hubfs/policies-pdf/Academic-Integrity-Policy-and-Procedures.pdf), s10(h)(ix) |

### Our own first case
While preparing tests for this plan, the AI assistant was asked for ten DOIs from memory. One, `10.1073/pnas.1523821113`, does not exist: Crossref 404, OpenAlex 404, doi.org "handle not found". Our checker caught it. This is a true story we can open the presentation with.

---

## 2. Three solutions considered

| | A. Reference Forensics | **B. Paper Trail** | C. Evidence Map |
|---|---|---|---|
| Idea | Paste a draft, get a forensic report on every reference and claim | Research desk where AI proposes, registries confirm and the student approves. Forensics is its front door | Ask a question, see papers as a map of who agrees and disagrees, agents debate |
| Find / organise / cite | None / none / weak | Full | Strong / weak / weak |
| Honesty in action | Excellent | Excellent | Moderate |
| Demo moment | Immediate | Immediate, then a full journey | Pretty, slow to explain |
| Build risk | Low | Medium, cut by shipping in slices | High |
| Adapts on the day | Little to adapt | Rules live in one policy file | Hard to bend |
| **Estimated Phase 2 build points out of 53** | 43 (14+5+10+6+8) | **50 (13+12+10+8+7)** | 34 (10+8+6+5+5) |

Scores are our own estimates in rubric order: MVP, research features, honesty, day-of, UX.

**Recommendation: B, built so that A is finished first.** If we run out of time at any point we still own a complete, winning version of A.

---

## 3. Proposed solution

- **Product name:** Paper Trail *(working title)*
- **Value proposition:** Every reference real. Every claim traceable. Every decision yours.
- **Primary user:** an SP Jain student with an assignment due.
- **What we refuse to build:** Paper Trail does not write the assignment. It finds, checks, challenges and formats. That is a product decision and it matches policy s2(b) and s3(a)(ii).

### The three-key rule

No reference enters an export unless three different parties have turned a key:

1. **Found** by a scholarly registry. Never by the AI. There is no code path where model text becomes a reference.
2. **Checked** by deterministic code. Title, authors, year, DOI, retraction. No AI opinion.
3. **Approved** by the student.

### Main user journey

| Step | Who works | What the student sees | Gate |
|---|---|---|---|
| 0. Start | Student | Assignment question, citation style, **AI permission level** for this assessment | |
| 1. Plan | Planner (AI) | Sub-questions, search terms, inclusion rules | **Gate 1: edit and approve the plan** |
| 2. Find | Scout (code) + Checker (code) | Real papers, each stamped as registries reply | **Gate 2: keep or skip each source** |
| 3. Organise | Student | Library with folders, tags, notes, import, duplicates merged | |
| 4. Read | Reader (AI + code) + Challenger (AI + code) | Claim cards with the exact sentence highlighted, and evidence that disagrees | **Gate 3: accept, rewrite or reject each claim** |
| 5. Write | Student | Editor with cite-from-library and live margin checks | |
| 6. Export | Clerk (code) | Pre-flight, reference list, AI-use statement, evidence log | |

**Check** is also the home page. Paste anything, no account, no project.

### Agents: role is enforced by what each one can touch

| Agent | Engine | May do | Cannot do |
|---|---|---|---|
| Planner | LLM | Turn a question into search terms | See or write references |
| Scout | Code | Query registries, merge duplicates | Generate text |
| Checker | Code | Compare fields, issue the verdict | Be overruled by AI |
| Reader | LLM + on-device | Point at passages by ID | Return a quote that is not an exact substring; code rejects it |
| Challenger | LLM + on-device | Search for the opposite, flag overclaims | Delete or edit a claim |
| Clerk | Code | Format, export, write the statement from the log | Include anything missing a key |

### What happens if AI or an API is unavailable

1. **Live:** free-tier LLM through our server function.
2. **On-device:** small models in the browser, no key, no quota. Answers become extractive (exact quotes only).
3. **Recorded sample:** last resort, stamped SAMPLE on every card, as the rules require.

The Check journey needs no LLM at all. A failed network call shows **Could not check**, never "Not found".

---

## 3A. Experience design

### One idea: hold it to the light
Banknotes and passports prove themselves under UV light. Real papers here carry a watermark and fibres that glow. Forged ones are hollow. The whole site uses that one image: a dark inspection room on the landing page, and a bright, quiet workspace once the lights come on.

### Landing: six chapters, one scene, one draw call for the paper

| Chapter | What the 980 sheets do | What the visitor learns | Where the number comes from |
|---|---|---|---|
| 1. Hero | Drift in the dark. The cursor is a UV lamp; a tag names the paper under it. A working Check field sits beside it | 18 in 100 are hollow | GPT-4 rate, Walters & Wilder (2023). The share of hollow sheets is exactly 18% |
| 2. Scale | Every sheet turns hollow | 146,932, each sheet stands for 150 | Zhao et al. (2026), conservative estimate for 2025 |
| 3. Three keys | Stream through three rings; fakes fall and dissolve at the first | Found, Checked, Approved | Product rule |
| 4. Claim | Lay down as a trail. At 31% the trail shatters; at 13% it heals | A real paper can still be misquoted | Bloom et al. (2015); 0.98 contradiction in our test |
| 5. Dial | Form a rotating library | The student sets how much AI is allowed | Product rule |
| 6. Lights on | Night becomes day, workspace appears | This is where you work | |

Then: what Paper Trail will not do, our public test results, call to action. A 60-second tour plays the story and stops on any touch.

### Rules for the 3D
- **It never blocks anything.** Text, Check field and buttons work before, during and without it.
- **Everything visible means something.** No decorative particles. Sheet share, sheet count and labels come from sources or from real checks.
- Poster first, scene on idle; off for reduced motion, Save-Data and no WebGL; pauses when hidden.
- Quality governor lowers resolution, then sheet count. It only reacts below 25 fps, because preview panes and battery savers cap at 30 without the GPU being slow.
- three.js sits in its own lazy chunk; a test fails the build if it enters the entry bundle.
- Keyboard and screen-reader users get the same story as text. The canvas is hidden from assistive technology.

**Measured on Yash's laptop (Intel integrated graphics, 1440×860, 24 Nov):** 4 to 6 ms of GPU work per frame in every chapter at 1152 px canvas width. Phone layout at 390 px has no sideways scroll. The no-WebGL and reduced-motion paths were checked using test switches.

### Workspace
Left: the trail itself as navigation, with gates as round nodes. Centre: one task at a time. Right: the source, with the exact sentence highlighted. Stamps press when the student approves. Receipts print when a check finishes. `Ctrl K` opens everything. Light by default, dark as an option.

**Type:** Marcellus for headings, Public Sans for text, Sometype Mono for machine-written strips only. **Colour:** green only ever means proven.

### Name
Paper Trail stays the recommendation because the 3D story, the product and the audit log are all the same trail. Alternatives considered: Candela (the unit of light), Proofmark (the stamp on tested metal), Citelight. The team can overrule this in one word.

### Where the ideas come from
Rule 10 forbids copying another team's work. On 24 Nov we looked at past projects by two friends for inspiration, then learned from the Teams list that both compete on other teams. No code was copied. Every idea that came only from their projects was removed from this plan. What remains was in our first plan before that, is our own earlier work, or is ordinary engineering practice (progressive enhancement, reduced-motion support, hash-chained logs, accessibility tests). Do not open, copy or quote any other team's repository.

---

## 4. Trust labels

**References**

| Label | Rule in code |
|---|---|
| Confirmed | Registry record matches: title ≥ 0.90, all listed authors present, year within 1, no retraction |
| Details differ | Real work found, one or more fields wrong. Shows each difference and offers the registry value |
| Wrong paper | The DOI is real and belongs to something else |
| Retracted | Registry carries a retraction notice |
| Not found | No match in the registries searched. We list which. Never called "fake": books, reports and regional journals are under-indexed |
| Could not check | Network or rate limit. Never counts as a pass or a fail |

**Claims** (the brief's four, plus one)

| Label | Rule in code |
|---|---|
| Verified | Source Confirmed **and** quote is an exact substring **and** support model agrees **and** number, negation and scope guards pass |
| Reported, not checked | Source real, but we could not read the text or the model was unsure |
| AI reasoning | No source. Visually different, left out of exports by default |
| Disputed | The cited source, or another one found, says otherwise |
| Not found | Searched, nothing reliable. The searches are shown |

Neither the AI nor the student can set Verified by hand. The student may keep any claim with a typed reason; the label stays and the reason is logged. **Verified means the source says this. It does not mean the source is right.** The UI says so.

---

## 5. MVP feature list

Owners follow `TEAM_ROLES.md` and can be swapped. "Owner" means the person who can explain and demo it.

| Priority | Feature | User value | Demo / test | Owner |
|---|---|---|---|---|
| **P0** | Check: paste text or a bibliography, every reference verified with a field-by-field diff | Catches invented references in seconds | Judge pastes their own | Siddal |
| P0 | Registry engine: Crossref, OpenAlex, DataCite, doi.org, retraction | References are real | Unit tests + Integrity Lab | Nihal |
| P0 | Find: plan, search, stamped results, keep or skip | Find real sources | Core journey | Nihal |
| P0 | Library: folders, tags, notes, search, filter by label, add by DOI, BibTeX or RIS | Organise | Core journey | Siddal |
| P0 | Evidence: claim cards with highlighted exact quote and label | Claims trace to a sentence | Flip 13% to 31%, watch it fail | Nihal |
| P0 | Three gates | Student in charge | Core journey | Yash |
| P0 | Cite and export: APA 7 with sentence-case cleanup, BibTeX, RIS, .docx | Cite | Compare with doi.org output | Siddal |
| P0 | AI-use statement generated from the log | Honest disclosure | Export step | Yash |
| P0 | AI permission level that truly switches agents off | Follows the assessment rules | Set to No AI, try to use AI | Hemanth |
| P0 | Landing page with 3D story and a working Check field | Understood in ten seconds | Move the lamp; paste a DOI | Yash |
| P0 | Reason codes on every receipt | Explains itself | Open any receipt | Yash |
| **P1** | Challenger: opposite-evidence search and overclaim flags | No cherry-picking | Disputed card | Nihal |
| P0 | Write: editor with cite picker and margin checks (the brief names citing while you write) | Cite while writing | Cite something not in the library | Siddal |
| P1 | Integrity Lab: live self-test against the published five failure types | We publish our own error rate | Press Run | Hemanth |
| P0 | Add web pages (the brief names web sources) | Save any source | Paste a URL | Siddal |
| P1 | Add by PDF (read in the browser, never uploaded) | Full-text quotes | Drop a PDF | Siddal |
| P1 | Constellation: 3D map of the student's own sources from real citation links, with a table twin | See how sources connect | Click a node | Siddal |
| P1 | 60-second judge tour that drives the real app | Runs the demo if nerves strike | Press Play | Yash |
| P1 | Command palette, stamp press, printing receipts | Feels finished | `Ctrl K` | Siddal |
| P1 | Evidence log with a Verify button (tamper-evident) | Faculty can trust the record | Edit a line, watch it fail | Hemanth |
| P0 | Ask your library: answers from kept sources or an honest Not found (the brief says "AI Research Assistant") | Research assistant | Ask something absent | Nihal |
| **P2** | Harvard, MLA, Chicago, IEEE styles | Other courses | Style switch | Siddal |
| P2 | Source balance: year, venue, open access, single-source warning | Bias awareness | Library panel | Hemanth |
| P2 | Save from any page (bookmarklet) | One-click save | Click on a journal page | Yash |
| P2 | Share a read-only evidence report | Faculty can check | Open the file | Yash |

**Rejection codes (closed list):** `NO_SOURCE`, `SOURCE_UNRESOLVED`, `SOURCE_RETRACTED`, `QUOTE_NOT_IN_SOURCE`, `NUMBER_MISMATCH`, `DIRECTION_FLIPPED`, `SCOPE_OVERCLAIM`, `INSTRUCTION_IN_SOURCE`, `THIN_COVERAGE`, `COULD_NOT_CHECK`.

**Not building:** accounts, payments, native extension, essay generation, plagiarism scoring, AI-text detection.

---

## 6. Website pages

| Route | Page | Job |
|---|---|---|
| `/` | Landing + Check | 3D story, paste and see verdicts, start a project |
| `/p/:id/plan` | Plan | Gate 1 |
| `/p/:id/find` | Find | Gate 2 |
| `/p/:id/library` | Library | Organise |
| `/p/:id/evidence` | Evidence | Gate 3 |
| `/p/:id/write` | Write | Editor with margin checks |
| `/p/:id/export` | Export | Pre-flight, references, statement, log |
| `/lab` | Integrity Lab | Live self-test |
| `/rules` | House rules | Policy in force, agents, SP Jain clause map, privacy |

Every page has empty, loading, partial, error and offline states.

---

## 7. Architecture

```text
 Browser (React + TypeScript + Vite)
 ├─ Pages and gates
 ├─ Orchestrator ........ step order, gates, permission level
 ├─ Verify engine ....... pure functions, no AI, unit tested
 ├─ On-device AI worker . MiniLM (23 MB) + NLI (87 MB), loaded only when needed
 ├─ Citation engine ..... CSL styles + our APA 7 cleanup
 ├─ 3D stage ............ plain three.js, lazy chunk, optional
 ├─ Policy file ......... every rule and limit in one place
 ├─ Event log ........... append-only, hash-chained
 └─ IndexedDB ........... library, claims, decisions. Stays on this device
        │
 Our small server (2 routes, runs on the laptop)
 ├─ /api/registry ....... cached, allow-listed proxy to registries
 └─ /api/ai ............. fixed tasks, JSON schema in and out, no prompts stored
        │
 Free services
 Crossref · OpenAlex · DataCite · doi.org · Europe PMC · arXiv · Open Library · DOAJ
 Free-tier LLM (optional)
```

### Why these choices (measured 24 Nov)

| Choice | Reason |
|---|---|
| Find with OpenAlex, verify with Crossref | On three business questions OpenAlex returned abstracts for 10/10 results each time. Crossref returned 3, 4 and 5 |
| Route registry calls through our function with a cache | Keyless OpenAlex gives one network address $0.10 a day, about 100 searches **shared by everyone on the venue Wi-Fi**. Crossref allows 5 lookups and 1 search per second per address. DOI lookups on OpenAlex are free |
| Skip Semantic Scholar and Google Books | Both returned 429 on first call; Semantic Scholar has no CORS header |
| Proxy arXiv and Europe PMC full text | Neither sends a CORS header |
| Skip Unpaywall | Requires an email address. OpenAlex already gives open-access links |
| Not GitHub Models | Retired 30 July 2026 |
| Own APA formatter over doi.org's | doi.org's APA output for Bloom et al. kept Title Case and a stray `*`, which is not APA 7 |
| Year tolerance of 1 | Bloom et al. is 2014 online and 2015 in print. An exact-year rule would raise a false alarm on a famous real paper |
| Sentence-level support check | The same 87 MB model scored 7/15 on whole abstracts and 12/15 per sentence |
| Smallest support model, threshold 0.90, never alone | Our target is zero false "Verified", so we accept more "Reported, not checked". A larger model can be switched on for the demo laptop. When AI is allowed, the LLM gives a second opinion on paraphrases, and disagreement resolves to the weaker label |
| Number guard must bind a number to its noun | "18%" appears in the Noy & Zhang abstract, but for quality, not time. Checking only that the digits exist is not enough |

### Running it, and deployment
`npm run dev` for development. `npm start` builds and serves the site and both routes from one small Node server on the laptop. **Nothing is deployed, and no repo is linked to a host, unless Yash says so.** Be aware: Rule 15 says to present from the live link submitted, and changes after 3:00 PM do not count. The Submission Guidelines allow a laptop demo if we declare it. The two routes are plain request handlers, so if Yash does say go, any host can run them without a rewrite.

### Stack (versions read from npm on 24 Nov, pinned exactly at install)
React 19.3, Vite 8.3, TypeScript, three 0.187 (no React wrapper: the scene is one shader and one file), Dexie 4, zod 4, citeproc 2.4, pdf.js 6, transformers.js 4.3. Tests: Vitest 5, Playwright 1.65, axe. The starter's `latest` ranges are removed.

### LLM
Free tier only. Candidates: **Groq** (primary) and **Gemini** (backup). Third-party pages report about 30 requests a minute and 1,000 a day for Groq's free plan with an 8K tokens-per-minute cap, and about 20 a day for Gemini Flash. *Official numbers were not published on the pages we could open, so confirm them in the account console.* Prompts stay under 3K tokens each. A team member creates the key and puts it in `.env.local` and the host's settings. Never in chat, never in git.

### Data model

```ts
Project  { id, question, style, aiLevel, createdAt }
Source   { id, projectId, ids:{doi,openalex,arxiv,isbn}, csl, check, text?, folder, tags[], notes, keys:{found,checked,approved} }
Check    { verdict, fields:[{name, given, registry, score}], registries:[{name, status, at}], retraction? }
Passage  { id, sourceId, text, start, end, origin:'abstract'|'fulltext'|'pdf' }
Claim    { id, projectId, text, passageIds[], label, checks:{exactQuote, support, numbers, negation, scope}, decision }
Decision { target, action, reason?, at }
LogEvent { seq, prevHash, hash, at, actor:'student'|'code'|'ai', model?, task, promptHash, summary }
```

### Folder layout

```text
src/core/verify/      normalise, parse, compare, verdict      (pure, tested)
src/core/registries/  one file per registry, same interface
src/core/claims/      quote match, guards, labels
src/core/cite/        CSL, APA cleanup, exports
src/agents/           planner, scout, checker, reader, challenger, clerk
src/policy/policy.ts  the single rule file
src/log/              hash-chained events
src/store/            IndexedDB
src/ui/               tokens, components, pages
api/                  registry.ts, ai.ts
tests/                unit, journey, lab corpus
```

---

## 8. Data, privacy and AI

- **Inputs:** text, references and PDFs the student provides.
- **Outputs:** verdicts, claim cards, reference lists, AI-use statement, evidence log.
- **Data sources:** open scholarly metadata APIs, used within their published limits.
- **Privacy:** no accounts, no tracking, library stays in the browser, PDFs are read locally. Only the search terms, or the passage under check if an LLM is allowed, leave the device. One-button delete everything.
- **Prompt injection:** source text is data. The model may only answer with passage IDs, so a malicious PDF cannot create a reference even if the model obeys it.
- **Demo data:** captured runs are stored as fixtures and stamped SAMPLE when shown.

---

## 9. Ethics and governance

| Risk | Response in the product |
|---|---|
| Invented citations | Three-key rule |
| Real paper, wrong claim | Exact quote + support + number guards |
| Plagiarism and ghost-writing | No drafting feature. Quotes carry quotation marks and page or section |
| Privacy | Local-first storage, minimal sends, delete button |
| Biased sources | Challenger, source balance, no ranking by fame |
| Over-reliance | Three gates, reasons for overrides, "what we did not check" on every export |
| **False accusation** | "Not found" is never "fake"; coverage limits are stated; student can attach proof |
| Retracted work | Blocked at pre-flight unless kept with a reason |

**Accountability:** the student owns the work. The team owns the checker and publishes its error rate. The registry owns the record. The AI owns nothing and can approve nothing.

**SP Jain Academic Integrity Policy v2 (24 Feb 2026) mapped to features**

| Clause (paraphrased) | Feature |
|---|---|
| s10(h)(vi) acknowledge others' work using APA | APA 7 engine is the default |
| s10(h)(vii) use generative AI only as the assessment authorises | AI permission level per project |
| s10(h)(viii) identify AI tools and prompts and acknowledge them | AI-use statement from the log |
| s10(h)(ix) beware non-existent references from AI | Checker and three-key rule |
| s3(a)(ii), s3(b)(iv) no unauthorised AI-produced work | No drafting; agents locked at level 0 |
| s10(g)(vi) faculty verify references and citations | Shareable evidence report |

APA published an AI contribution statement guide; its snippet confirms dates of use are required. *We could not open the full list automatically, so a teammate should read [the guide](https://apastyle.apa.org/instructional-aids/ai-contribution-statement.pdf) before we finalise the template.*

**AI permission levels:** 0 No AI · 1 Find and check · 2 Read and summarise · 3 Challenge my draft. Enforced at the server function, not just hidden buttons.

---

## 10. Day-of flexibility

Rules live in `src/policy/policy.ts`, and the active policy is visible at `/rules`. Likely requirements and how they land (*predictions, not known*):

| If they ask for | We change | Minutes (estimate) |
|---|---|---|
| Another citation style | Add a CSL file | 5 |
| Only recent or peer-reviewed sources | Policy filter | 5 |
| A cap on AI calls, or no AI at all | Policy limit; level 0 already exists | 5 |
| Retraction or predatory-journal warning | Done; DOAJ lookup | 15 |
| Non-scholarly sources with a credibility label | New source type + rule | 25 |
| Explain why a label was given | Receipt panel already holds it | 10 |
| Supervisor view or sharing | Read-only report | 25 |
| Accessibility or another language | Tokens and string table ready | 30 |
| Word limit or group contribution log | Log already records actor | 25 |
| Prompt-injection defence | Already structural; add a demo file | 10 |

Quick test after any change: `npm run verify` (types, unit tests, Lab corpus, build), then the journey test.

---

## 11. Build sequence

Each slice ends working and demoable on localhost. Times are Dubai time.

| When | Slice | Done when |
|---|---|---|
| Tue 24, 20:30–24:00 | **1. Repo, design system, verify engine, Check page** | Pasted references get correct verdicts on localhost |
| Wed 25, 09:00–12:30 | **2. Projects, Find, gates 1 and 2, Library** | A question becomes a library of confirmed sources |
| Wed 25, 12:30–16:30 | **3. Evidence, labels, Challenger, gate 3** | A claim opens on its exact sentence; a flipped number fails |
| Wed 25, 16:30–19:30 | **4. Write, export, AI statement, permission levels** | Full journey runs end to end |
| Wed 25, 19:30–21:00 | **5. Landing ported from the prototype, Integrity Lab, accessibility, phone** | Journey test green; no-WebGL and reduced-motion tests green |
| If slices 1–4 finish early | Constellation, command palette, tour | Only with the journey test green |
| Wed 25, 21:00–22:00 | **Deck uploaded** | 11 hours before the deadline |
| Thu 26, 08:00–12:00 | Rehearse twice, freeze, offline fallback check | 8-minute run under 7:30 |
| Thu 26, 13:30–15:00 | Day-of changes | Submitted by 14:50 |

### Proven in the real app, 24 Nov (evening)
| Test | Result | Limits |
|---|---|---|
| Real references in 11 formats (APA, IEEE, Harvard, MLA, BibTeX, RIS, bare DOI) | 11 of 11 confirmed | Eight different papers |
| Broken references of 8 kinds | 8 of 8 caught, none confirmed | Hand-picked; the Lab will run more |
| Live sweep: 40 papers returned by OpenAlex, checked in a second registry | 36 confirmed, 4 flagged. All 4 flags were true: one DOI that does not exist, three records with no authors | One evening, four topics |
| Registry switched off | Always "Could not check", never a pass or a fail | |
| Journey in Chrome, with accessibility scans, phone width, no-3D path | 6 of 6 pass offline, live run passes | Library, Evidence, Write and Export are not built yet |

Two bugs the tests caught before anyone saw them: a short registry title ("Honest Signals") matching an invented one, and names such as Elamın being called a mismatch because of one Turkish letter. Both are fixed and pinned by tests.

### Already proven in throwaway tests (not app code)

| Test | Result | Limits |
|---|---|---|
| Reference checker, 7 cases on 9 real papers + 3 invented | **66 of 66 correct** | Small, clean, structured input, well-known papers. Parsing messy text is harder and comes next |
| Keyless claim-support model, 15 claims on 2 real abstracts, smallest model, sentence by sentence | **12 of 15**, and no unsupported claim passed as supported | Tiny set, Node not browser. One near miss: "Attrition rose" scored 0.99 support and 1.00 contradiction |
| Same test style, 18 harder claims (paraphrase, swapped numbers), three model sizes, support threshold 0.80 | xsmall **13/18, 0 false support**, 18 ms · small **15/18, 1 false support**, 34 ms · base **17/18, 0 false support**, 56 ms | The small model passed "cut the time by 18%" (18% was the quality gain) at 0.94. The xsmall model misses fair paraphrases |
| Retraction detection | Correct on Wakefield 1998 and on a retracted 2024 paper about ChatGPT in management education | Two cases |

---

## 12. Demo run (8 minutes)

| Time | Speaker | Beat |
|---|---|---|
| 0:00 | Hemanth | The AI that helped build this invented a reference. Here it is. Policy s10(h)(ix) says that is on us |
| 0:50 | Siddal | Paste a polished paragraph. Real, wrong paper, retracted, not found. Then hand the keyboard to a judge |
| 2:20 | Nihal | Question to plan to real papers. Gates. Evidence card opens on the exact sentence. Change 13% to 31% and it fails. Disputed card |
| 5:00 | Yash | Write, cite, pre-flight blocks the retracted paper, export APA 7 and the AI statement. Switch to No AI and watch the agents lock |
| 6:20 | Hemanth | Integrity Lab: our own error rate, live. Day-of requirement |
| 7:20 | All | Close |

---

## 13. Risks

| Risk | Response |
|---|---|
| The repo is public | No keys, emails, team code or organisers' PDFs in git; hooks check; other teams can read what we push |
| `package.json` pins nothing (`latest`) | Pin exact versions and commit the lockfile so event day builds match |
| Venue Wi-Fi or shared rate limits | Server-side cache, on-device AI, phone hotspot, stamped samples |
| NLI model download (87 MB) on slow Wi-Fi | Load on demand, cache, warm the demo laptop beforehand |
| Scope | Slice order above; P2 only after the journey test is green |
| 3D eats the schedule | The scene already exists as a prototype. It is ported last, time-boxed to 90 minutes, and the site is complete without it |
| Looking like copied work | Nothing from other teams, no exceptions. Rule 10 allows disqualification |
| No live link | Rule 15 says to present from the submitted live link; the guidelines allow a laptop demo if declared. Yash decides by Thu 12:00. The site is static-host ready, so deploying takes minutes once he says yes |
| Verified oversold | Copy states what it means; Lab shows misses |

## 14. Decisions needed

1. Approve B, Paper Trail, and the "does not write your assignment" position.
2. Who creates the free Groq and OpenAlex keys. The site works without them; search volume and summaries improve with them.
3. Repository: github.com/Yashpetkar7/Ai-Club-Hackathon, public (decided 24 Nov).
4. Deployment is off until Yash says so. Decide by Thu 12:00 whether to submit a live link.
5. Rules and Regulations: received 24 Nov.

## 15. Acceptance checklist

- [ ] The website directly addresses every mandatory requirement.
- [ ] The primary user journey works end to end, tested by script and by hand.
- [ ] No broken buttons or dead-end screens.
- [ ] Sample or simulated data is stamped SAMPLE.
- [ ] No secrets, team code or personal data in the repository or its history.
- [ ] Responsive at 375, 768 and 1440 px; keyboard and screen-reader pass.
- [ ] Production build succeeds from a clean clone.
- [ ] Demo completes in under 8 minutes with all four speaking.
- [ ] Website matches the Phase 1 deck.
- [ ] Prompt log complete and in order.
