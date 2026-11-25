# Paper Trail

Every reference real. Every claim traceable. Every decision yours.

Paper Trail helps students find, organise and cite sources with AI that cannot invent one. A source is citable only after three different parties have turned a key: a scholarly registry **found** it, plain code **checked** it, and the student **approved** it. Team 1, SP Jain AI Club Hackathon 2026: Hemanth, Nihal, Siddal, Yash.

## Run it
Needs Node 20.19 or newer.

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173. For a production build on a laptop: `npm start`, then http://127.0.0.1:4173.

Optional free keys go in `.env.local` (copy `.env.example`). The site works without them.

## Check it
```bash
npm run verify   # types, unit tests, build
npm run e2e      # the whole journey in Chrome, with accessibility scans
AUDIT=1 npx playwright test tests/e2e/buttons.spec.ts   # clicks every control on every page
MODEL=1 npx playwright test tests/e2e/model.spec.ts     # the real support model on 104 claims
LIVE=1 npx vitest run tests/unit/real-lists.test.ts     # reference lists of published papers
```

Unit tests replay recorded answers from Crossref, OpenAlex, DataCite and doi.org, so they run offline.

## What works today
| Area | State |
|---|---|
| Check any text, list, BibTeX, RIS or DOI | Works, live |
| Projects, Plan (gate 1), Find (gate 2) | Works, live |
| 3D landing with a live check | Works; complete without 3D |
| Accounts on this device, dashboard, Back on every page | Works; signing out encrypts the library |
| The team: nine agents, three gates, run live | Works; AI agents only with a free key and at the right level |
| Library, Read and compare, Map | Works |
| Evidence (claim against exact sentence), Challenge, Ask | Works without AI; optional support model on the device |
| Write, Review, Export (APA 7, Harvard, MLA, Chicago, IEEE; Word, BibTeX, RIS) | Works |
| Draft check: copied text, false quotations, repetition, slips | Works; rules only, compares with your own library |
| Retraction check: retracted, corrected, under concern, cites retracted work | Works, live |
| Duplicates, papers you may be missing, page numbers on quotes | Works |
| Integrity Lab, House rules, AI statement, evidence report | Works |

## What it does not do
It does not write assignments, call sources fake, or promise that a verified claim is true. Verified means the source says it. The draft check compares with your own library only. It is not a plagiarism verdict and gives no score. Registries miss many books, reports and regional journals, so "Not found" lists where we looked and nothing more.

## Data and honesty
- Metadata comes from Crossref, OpenAlex, DataCite and doi.org. Projects stay in your browser.
- Sample content is labelled SAMPLE. Two references in the sample text are invented on purpose and say so.
- AI tools helped build this. Prompts are in `docs/AI_PROMPT_LOG.md` and `docs/prompts/`.

Working in this repo? Read `docs/team/HOW_WE_WORK.md` first.
