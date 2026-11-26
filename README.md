# Paper Trail

Find sources, inspect the evidence, learn from the text, and keep the final decision.

**Local Hemanth candidate:** implementation and offline checks are available, but current remote branches, the full build and the live deployment still require reconciliation and verification. See [current validation](docs/deck/VALIDATION_CURRENT.md) and [integration handover](docs/deck/INTEGRATION_HANDOVER.md).

Read [Hemanth's vision, completed work and next steps](docs/VISION_AND_ROADMAP.md) for the intended product and the remaining release work.

Paper Trail helps students find, organise, study and cite sources using inspectable registry and text checks. The usual citation path has three keys: a scholarly registry **found** the source, plain code **checked** it, and the student **approved** it; eligible written exceptions remain labelled in exports. SAMPLE receipts cannot be cited as live evidence. Team 1, SP Jain AI Club Hackathon 2026: Hemanth, Nihal, Siddal, Yash.

## Run it
Needs Node 22.19 or newer.

```bash
npm ci
npm run dev
```

Open http://127.0.0.1:5173. For a production build on a laptop: `npm start`, then http://127.0.0.1:4173.

Optional provider keys go in `.env.local` (copy `.env.example`). Code-based research paths do not require a generative-AI key; retrieval still requires network access and optional models/assets may need downloads. Free tiers and provider terms vary.

## Where the backend keeps things
`npm start` runs the site and the API in one Node process. Locked libraries go to `data/paper-trail.db` (SQLite, or one file per account on Node older than 22.13). The folder is not in git.

| Setting | Meaning |
|---|---|
| `DATA_DIR` | Another folder for the data |
| `SESSION_SECRET` | 32 or more characters to sign session cookies. Made once and kept in the data folder when missing |

It needs a host with a disk that stays. On a host without one the site still works and says that work stays on the device.

## Check it
```bash
npm run verify   # types, unit tests, offline regressions, build
npm run e2e      # the whole journey in Chrome, with accessibility scans
AUDIT=1 npx playwright test tests/e2e/buttons.spec.ts   # clicks every control on every page
MODEL=1 npx playwright test tests/e2e/model.spec.ts     # the real support model on 104 claims
LIVE=1 npx vitest run tests/unit/real-lists.test.ts     # reference lists of published papers
```

Unit tests replay recorded answers from Crossref, OpenAlex, DataCite and doi.org, so they run offline.

## Implementation in this candidate

The supplied Yash snapshot implements planning, retrieval, library organisation, reading, claim checks, draft review, citations, account backups, the research team and Integrity Lab. Its earlier recorded test totals are historical evidence, not a rerun on this candidate.

This extension adds Research Compass, explainable reading priority, Study studio with exact-passage capture and recall, stricter second-registry identity checking, sample citation exclusion and fuller disclosure. The study flow uses the existing project log; it never changes a source verdict or approval.

```bash
npm run test:compass  # dependency-free core regressions on Node 22.19+
npm start            # build and serve the application
npm run demo:check   # run separately while the server is running
```

The readiness script makes real requests and writes `test-results/live-readiness.json`; it does not replace the full browser journey. Follow [the presenter guide](docs/deck/DEMO_GUIDE.html), [six-slide deck](docs/deck/Team1_PaperTrail.pptx) and [Q&A](docs/deck/QA.md).

## What it does not do
It does not write assignments, call sources fake, or promise that a verified claim is true. Verified means the source says it. The draft check compares with your own library only. It is not a plagiarism verdict and gives no score. Registries miss many books, reports and regional journals, so "Not found" lists where we looked and nothing more.

## Data and honesty
- Metadata comes from Crossref, OpenAlex, DataCite and doi.org, asked live.
- The Retraction Watch database (made public by Crossref) ships with the site as a DOI index in `public/data/retraction-watch/`, a third retraction source in every check. It can add a retraction and its reasons, never remove one. Sources and rebuild steps: `datasets/README.md`.
- Two models we trained: the claim-support model fine-tuned on SciFact, and a retraction-risk signal trained on Retraction Watch and a Crossref sample. Neither can set a verdict or a claim label. Method and held-out results: `ml/README.md` and `ml/results/`.
- Every source, dataset and model is listed on the site's **Data and models** page (`#/data`).
- As a guest, projects stay in your browser. With an account, a copy locked with your passphrase (AES-256-GCM, PBKDF2 600,000 rounds) is kept on the server. The server has no name, passphrase or key, so it cannot open it.
- Sample content is labelled SAMPLE. Two references in the sample text are invented on purpose and say so.
- AI tools helped build this. Prompts are in `docs/AI_PROMPT_LOG.md` and `docs/prompts/`.

Working in this repo? Read `docs/team/HOW_WE_WORK.md` first.
