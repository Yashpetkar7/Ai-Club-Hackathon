# Yash: lead, integration, and the features that make it memorable

**Branch:** `yash/integration`. You are the only one who updates `main`.

**Your files:** everything not listed in another brief, including all shared code, plus the new ones below.
- `src/pages/Challenge*`, `src/core/challenge/**`
- `src/pages/Map*`, `src/map/**`
- `src/core/pdf/**`, `src/core/report/**`, `src/app/CommandPalette*`, `src/app/Tour*`
- `docs/prompts/YASH.md`, `docs/deck/*.pptx`

## Built already (24 Nov)
Contracts, policy, verify engine, registry clients, log, store, app shell, Check, Projects, Plan, Find, 3D landing, unit and end-to-end tests, GitHub checks and branch rules.

## Your build tasks, in order
1. **Integration all day.** Review and merge each branch (order: Siddal's library, Nihal's claims, Hemanth's pages). Keep `main` green.
2. **Planner** (`Plan.tsx`, `src/agents` stays Nihal's). At AI level 1 and above, offer search phrases from the `plan` task when the gateway answers; plain-code suggestions otherwise. The student edits and approves either way. Log which was used.
3. **Challenger** (`Challenge.tsx`, `core/challenge`). For a claim, search for the opposite, keep only checked papers, show agree and disagree side by side with the exact sentence each way, and flag single-source and old-evidence risks. At level 3 the AI may suggest the opposite search phrase; below that, plain code does. Until Nihal's support model is merged, show sentences without a support score and label nothing Verified.
4. **Judge tour and command palette.** A 60-second tour that drives the real app on sample data marked SAMPLE and stops on any touch or key. `Ctrl K` finds pages, projects and sources by keyboard.
5. **Map** (`Map.tsx`, `src/map`). A 3D constellation of the student's kept sources, joined only by real citation links (`record.references`), with flagged sources drawn differently, click to open, and a table that says the same thing. Lazy chunk. No link is ever drawn that the data does not have.
6. **PDF reading** (`core/pdf`). `pdfjs-dist` in the browser, nothing uploaded. Find a DOI in the first two pages, run the checker, return text for `editSource`. Spot instructions aimed at an AI and report `INSTRUCTION_IN_SOURCE`. Wire it into Library after Siddal's merge.
7. **Evidence report for faculty** (`core/report`). One self-contained HTML file: references with verdicts, claims with exact sentences, overrides with reasons, the log with its hash check, and what was not checked. Safe to open offline; escapes all source text.
8. **Day-of readiness.** Policy switches for year, type, peer-reviewed only and AI cap, each with a test and a line on House rules, so a surprise requirement is one edit. A source-balance panel: years, venues, open access, countries where known.

## Lead tasks
- Turn Hemanth's text into the PowerPoint. Uploaded by Wed 22:00.
- At 21:00 Wed: `FINAL=1 npx vitest run tests/unit/guards.test.ts` must pass.
- Decide on deployment by Thu 12:00. Rehearse at 08:00. Merge the prompt logs. Submit by 14:50 and open the repo link in a private window.

## Your demo (90 s) and questions to be ready for
Show: the claim challenged by a paper that disagrees, the map, export blocked by a retracted source, AI dial to 0.
Q: What did AI build and what did you decide? Q: How did you adapt today? Q: What would break first at scale?

## Repo rules
`main` needs a pull request, an approval and a green `verify`, and only you can update it. Members push to their own branch; every other branch name stays closed. Change this under Settings, Rules, Rulesets.

## Prompt to paste (Claude Opus 5.5, Extra effort)
Pick Opus 5.5 and Extra effort first. Paste it once, in this folder, and let it run; turns are long at this setting.

```text
GIT RULE, FIRST AND ALWAYS. My branch is yash/integration. Push my code to yash/integration by default, and nowhere else.
- Start of every session: git fetch origin; git switch yash/integration (or git switch -c yash/integration origin/main the first time); git merge origin/main.
- After every finished task: npm run verify, commit, then git push -u origin yash/integration. You do not need to ask me for this push.
- Never push to main or to anyone else's branch. Never force-push, rebase pushed work, delete a branch, or use --no-verify. Yash alone merges into main.
- Change only the files my brief lists. That is what keeps us free of merge conflicts. If a merge conflicts in a file that is not mine, run git merge --abort and tell me.
- If GitHub or the hook rejects a push, keep the commit, do not work around it, and tell me the message.

You are the lead engineer and integrator of Paper Trail, our hackathon website. I am Yash. Build my whole brief, docs/team/YASH.md, and integrate everyone's work.

Read first: CLAUDE.md, docs/PROBLEM_STATEMENT.md, docs/BUILD_PLAN.md, docs/team/HOW_WE_WORK.md, all four briefs in docs/team/, src/core/contracts.ts, src/policy/policy.ts, src/app/ProjectShell.tsx, src/pages/Find.tsx, src/landing/. Then run npm run verify and npm run e2e and tell me the starting state.

The outcome: by 21:00 on Wednesday 25 November, main holds a site where a judge can check, plan, find, organise, trace a claim, ask, write and export without help in under eight minutes, and nothing on it is untrue. A smaller site that works beats a bigger one that does not. Guard the core journey before adding anything.

Build, in this order: tasks 1 to 4 are must-have, 5 to 8 only with every test green. Each ends with its own tests.

Integrating. When I paste a handover note or say a branch is ready: check it out in a separate worktree, run npm run verify and npm run e2e, read the whole diff against their brief and the hard rules, and look hardest for a path to a false green label, a source leaving without three keys, an invented reference, a secret, or an edit outside their files. Try to break their page by hand. Answer merge, fix first, or reject, with file, line, what goes wrong and the smallest fix. Do not edit their files unless I ask.

Boundaries. Do not deploy, open a pull request, add a dependency, change GitHub settings, or open any other team's repository. Shared code is mine, so you may change it, but never break a teammate's contract without telling me. Never invent a paper, DOI, quote, number or result. Keys live only in .env.local.

Design. Match Check and Find exactly: tokens from src/ui/tokens.css, square corners, 1px lines, Marcellus headings, Public Sans text. Do not use gradients, glass or blur, pill shapes, drop shadows on cards, emoji or sparkle icons, numbered 01/02/03 labels, uppercase eyebrow labels, or any new colour. Green only for proven.

How to work. Make routine choices yourself and note them; ask me only if two readings would lead to different products. Before writing a page, write its tests. Give me a two-line update when each task is finished, not for every step. Stop and ask before any merge into main, push to main, deploy, settings change or message to anyone. One yes from me covers one action.

After each task: run npm run verify, fix what fails, add a row to docs/prompts/YASH.md with this prompt or my follow-up and what it produced, commit, and push to my branch.

Done means: npm run verify and npm run e2e are green on the merged result, not only on the branch; LIVE=1 npx playwright test tests/e2e/live.spec.ts passes; three.js stays out of the entry bundle; every new page has a clean axe scan, works at 375 px and by keyboard, and has a plain alternative to any 3D; no console errors; and you have told me what you could not check.
```
