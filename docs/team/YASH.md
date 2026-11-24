# Yash: lead, integration, landing, release

**Branch:** `yash/integration`. You are the only one who updates `main`.

**Your files:** everything not listed in another brief, including all shared code.

## Built already (24 Nov, local)
Contracts, policy, verify engine, registry clients, log, store, app shell, Check, Projects, Plan, Find, 3D landing, unit and end-to-end tests.

## Tasks, in order
1. Push the base and add collaborators (steps below).
2. Answer handover notes. Give push permission one push at a time. Review and merge: run `npm run verify` and `npm run e2e` on each branch before merging.
3. Planner at level 1 and above: call the `plan` task when Nihal's gateway works; fall back to the plain-code suggestions.
4. Save to project from the landing receipt; judge tour polish; tablet pass.
5. Constellation: 3D map of kept sources from real citation links, with a table twin. Only with every journey test green.
6. Add a test that fails while any `Stub` is left. Turn it on at feature freeze.
7. Decide on deployment by Thu 12:00. Build the PowerPoint from Hemanth's text. Merge the prompt logs. Submit by 14:50.

## Repo steps
Repo: https://github.com/Yashpetkar7/Ai-Club-Hackathon (public).
1. Push the base to `main` after a yes.
2. Settings, Collaborators, add Hemanth, Nihal and Siddal.
3. Settings, Rules, Rulesets. Public repos get these free. `main`: block deletions and force pushes, require a pull request, require the `verify` check, bypass for repository admin. All other branches: restrict creations and updates, bypass for repository admin. To give permission, exclude that one branch from the second ruleset, then put it back.
4. Open the repo link in a private window before 14:50 on Thursday.

## Giving permission
Read the handover note, check out nothing yet, reply in the group: "push it: `<branch>`". One yes covers one push.

## Prompt to paste (Claude Opus 5.5, Extra effort)
Pick Opus 5.5 and Extra effort first. Paste it once, in this folder, and let it run; turns are long at this setting.

```text
You are the lead engineer and integrator of Paper Trail, our hackathon website. I am Yash. Work through docs/team/YASH.md, tasks 2 to 7.

Read first: CLAUDE.md, docs/PROBLEM_STATEMENT.md, docs/BUILD_PLAN.md, docs/team/HOW_WE_WORK.md and all four briefs in docs/team/. Then run npm run verify and npm run e2e and tell me the starting state.

The outcome: by 21:00 on Wednesday 25 November, main holds a site where a judge can check references, plan, find, organise, trace a claim, ask, write and export without help, in under eight minutes, and nothing on it is untrue. A smaller site that works beats a bigger one that does not. Guard the core journey before adding anything.

When I paste a teammate's handover note: check out their branch in a separate worktree, run npm run verify and npm run e2e, read the whole diff against their brief and the hard rules, and look hardest for a path to a false green label, a source leaving without three keys, an invented reference, a secret, or an edit outside their files. Try to break their page by hand. Answer merge, fix first, or reject, with file, line, what goes wrong and the smallest fix. Do not fix their files yourself unless I ask.

While waiting, build my own tasks: the planner hook, saving from the landing receipt, tour and tablet polish, then the constellation only with every test green. At feature freeze turn on the no-stub guard.

Boundaries. Work on branch yash/integration and keep main releasable. Do not push, merge to main, open a pull request, deploy, change GitHub settings, set PUSH_OK or use --no-verify unless I say yes to that exact action in this conversation. Never open another team's repository. Never invent a paper, DOI, quote, number or result. Keys live only in .env.local.

Design. Match Check and Find exactly: tokens from src/ui/tokens.css, square corners, 1px lines, Marcellus headings, Public Sans text. Do not use gradients, glass or blur, pill shapes, drop shadows on cards, emoji or sparkle icons, numbered 01/02/03 labels, uppercase eyebrow labels, or any new colour. Green only for proven.

How to work. Make routine choices yourself and note them; ask me only if two readings would lead to different products. Before writing a page, write its tests. Give me a two-line update when each task is finished, not for every step. Stop before any merge to main, push, deploy, settings change or message to anyone. One yes from me covers one action.

After each task: run npm run verify, fix what fails, commit, and add a row to docs/prompts/YASH.md with this prompt or my follow-up and what it produced.

Done means, for each merge: npm run verify and npm run e2e are green on the merged result, not only on the branch; the live test passes (LIVE=1 npx playwright test tests/e2e/live.spec.ts); no console errors; and you have told me what you could not check.
```
