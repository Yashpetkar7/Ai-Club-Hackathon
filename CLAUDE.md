# Paper Trail: instructions for any AI assistant working in this repo

Team 1, SP Jain AI Club Hackathon 2026: Hemanth, Nihal, Siddal, Yash. Yash leads and integrates.
Read `docs/PROBLEM_STATEMENT.md`, then `docs/BUILD_PLAN.md`, then the brief of the person you are helping in `docs/team/`.

## Hard rules
1. **Never push.** Nobody pushes until Yash gives permission for that push, in that conversation. Do not run `git push`, do not set `PUSH_OK`, do not open pull requests, do not use `--no-verify`, do not edit `.githooks/`.
2. **Work only on your person's branch** (names below). Never commit to `main`. Never rebase, force, reset or delete someone else's work.
3. **Never deploy** to Vercel or any other host, and never link this repo to one, unless Yash says so in that session.
4. **Touch only the files your brief lists.** If you need a change in shared code, stop and write the request in your handover note for Yash.
5. **No new dependencies.** Everything planned is installed. If you think you need one, ask Yash.
6. **Nothing from other teams.** Do not open, copy or quote any other team's repository or site. Rule 10 allows disqualification.
7. **No secrets or personal data in git:** no API keys, no team code, no student emails or phone numbers. Keys go in `.env.local` only.
8. **Never invent** a reference, DOI, quote, number, test result or user comment, in code, tests, docs or the deck. If you need a real paper, look it up in Crossref and run our own checker on it. Anything that is not live gets a visible SAMPLE label.
9. **Log your prompts** in `docs/prompts/<NAME>.md` as you go. The log is submitted.

## What the product is
- Three keys: a source is citable only when it was **found** by a registry, **checked** by plain code, and **approved** by the student. AI holds no key.
- Verdicts are created only in `src/core/verify`. Claim labels are created only in `src/core/claims`. Pages never set them.
- Green (`t-ok`) only ever means proven. A failure to check is never a pass and never "not found".
- We never call a source "fake". We say where we looked and what we did not find.
- Paper Trail does not write the student's assignment.
- AI permission level (0 to 3) is enforced in the server handler as well as the page.
- The library stays in the browser. Never add tracking, accounts or uploads.

## Code map
| Path | What | Owner |
|---|---|---|
| `src/core/contracts.ts` | Types everyone shares | Yash |
| `src/policy/policy.ts` | House rules as data; day-of changes land here first | Yash |
| `src/core/verify`, `src/core/registries` | The checker and registry clients | Yash |
| `src/store`, `src/log` | Storage actions, evidence log | Yash |
| `src/app`, `src/ui`, `src/landing` | Shell, design system, 3D landing | Yash |
| `src/pages/Check, Projects, Plan, Find` | Built | Yash |
| `src/core/claims`, `src/agents`, `src/pages/Evidence, Ask`, `server/handlers/ai.mjs` | Evidence and the assistant | Nihal |
| `src/core/cite`, `src/core/import`, `src/pages/Library, Write, Export` | Organise and cite | Siddal |
| `src/core/lab`, `src/pages/Lab, Rules, AiStatement`, `docs/deck` | Proof, governance, deck | Hemanth |

Branches: `nihal/evidence-ask`, `siddal/library-cite`, `hemanth/lab-governance`, `yash/integration`.

## How to work
- `npm install`, `npm run dev` (http://127.0.0.1:5173). Node 20.19 or newer.
- `npm run verify` (types, unit tests, build) must pass before you say anything is done. `npm run e2e` runs the journey in Chrome.
- Pages receive `{ project }` (`StepProps` in `src/app/ProjectShell.tsx`). Read data with `useLiveQuery`; change data only through `src/store/actions.ts`; log decisions with `record()` from `src/log/log.ts`.
- Each page has its own CSS module. Use the tokens in `src/ui/tokens.css` and the classes `btn`, `field`, `card`, `stack`, `row`, `soft`, `stamp`. No new colours, no gradients, no glass, no emoji icons.
- Every page handles empty, loading, partial, error and offline states, works at 375 px, and works by keyboard.
- Interface words: plain, short, sentence case. Buttons say what they do.
- Commit small and often on your own branch with clear messages. Committing is fine; pushing is not.

## Handover note
When a slice is ready, write this in your reply so your person can send it to Yash:
branch, what works, what you tested and the output, what does not work, files changed, any shared-code request.
