# Hemanth: proof, governance and the deck

**Why it matters:** the deck is 30 points and is due first. The Integrity Lab is something no other team is likely to have: we test ourselves in front of the judges and show our own misses.

**Branch:** `hemanth/lab-governance`

**Your files only**
- `docs/deck/**`
- `src/core/lab/**`, `src/pages/Lab.tsx`, `src/pages/Lab.module.css`
- `src/pages/Rules.tsx`, `src/pages/Rules.module.css`, `src/pages/AiStatement.tsx`, `src/pages/AiStatement.module.css`
- `tests/unit/lab*.test.ts`, `tests/unit/statement*.test.ts`
- `docs/prompts/HEMANTH.md`

**You can use:** `checkReference` + `registries`; `POLICY`, `AGENTS`, `AI_LEVELS`; `db.log`, `verifyChain` from `@/log/log`; `deleteEverything` from `@/store/actions`; `VerdictStamp`.

## Tasks, in order
1. **Deck text, first draft by Wed 11:00.** Follow `docs/PHASE1_DECK_OUTLINE.md` exactly: six slides covering workflow, architecture, guardrails, ethics, governance, with slide 1 as the problem and our rule. It is read without a presenter, so each slide must explain itself. Write it in `docs/deck/DECK.md` first. Every number needs a source we opened or a test we ran. Yash and Claude turn it into PowerPoint. **Upload by Wed 22:00.**
2. **Integrity Lab data** `core/lab/corpus.ts`. At least 12 real references (reuse the papers in `tests/unit/verify.test.ts`; confirm any new one with our checker). Generate broken versions with code, following the published taxonomy (arXiv 2602.05930): total fabrication, part-corrupted (wrong author, wrong year), hijacked identifier, placeholder text, plausible-but-missing title. Same result every run.
3. **Integrity Lab page.** One button runs the real checker, live, with progress and Cancel. Show by type: caught, missed, false alarm on real references, could not check. **List every miss with its text.** Show when it ran. If registries do not answer, offer the last recorded run, labelled SAMPLE.
4. **House rules page.** Keep the live policy tables. Add: the SP Jain Academic Integrity Policy clause map (paraphrase, link the policy, do not quote), what we can and cannot check, what leaves the device and when, who is accountable for what, and a Delete everything button with a confirmation step.
5. **AI-use statement and evidence log** `AiStatement.tsx`. Written from the log only: which tools and models, dates, what for, how many suggestions were kept, changed or rejected, and what was not checked. If no AI was used, it says so. Below it, the log with a Verify button that uses `verifyChain` and explains "tamper-evident, not tamper-proof". Copy button. Read APA's AI contribution statement guide (apastyle.apa.org) yourself and match its required items.
6. **Q&A sheet** `docs/deck/QA.md`: the 15 hardest questions with two-sentence answers.

## Facts you may use in the deck (already opened and checked)
- 55% of GPT-3.5 and 18% of GPT-4 citations were fabricated: Walters & Wilder (2023), doi.org/10.1038/s41598-023-41032-5
- Conservative estimate of 146,932 hallucinated citations in 2025: arXiv 2605.07723
- 100 fabricated citations in 53 accepted NeurIPS 2025 papers, past 3 to 5 reviewers each: arXiv 2602.05930
- SP Jain Academic Integrity Policy v2 (24 Feb 2026), s10(h)(vi) to (ix), s3(a)(ii), s3(b)(iv), s10(g)(vi)
- Our checker's test results: use the numbers the Lab shows on the day, not older ones
- While planning, an AI typed ten DOIs from memory and one, 10.1073/pnas.1523821113, does not exist. Our checker caught it.

## Done means
- The deck covers all five required areas, six slides at most, no invented evidence.
- The Lab's corpus test passes offline using the replay in `tests/unit/replay.ts`.
- The statement changes when the log changes, and never claims a check that did not run.

## Your demo (2 slots) and questions to be ready for
Open: the AI that helped build this invented a reference; here it is. Close to the end: press Run in the Lab and show our own misses.
Q: Who is responsible if a wrong reference gets through? Q: What about sources that are not in English? Q: Is this against the school's AI policy?

## Prompt to paste (Claude Opus 5.5, Extra effort)
Pick Opus 5.5 and Extra effort first. Paste it once, in this folder, and let it run; turns are long at this setting.

```text
GIT RULE, FIRST AND ALWAYS. My branch is hemanth/lab-governance. Push my code to hemanth/lab-governance by default, and nowhere else.
- Start of every session: git fetch origin; git switch hemanth/lab-governance (or git switch -c hemanth/lab-governance origin/main the first time); git merge origin/main.
- After every finished task: npm run verify, commit, then git push -u origin hemanth/lab-governance. You do not need to ask me for this push.
- Never push to main or to anyone else's branch. Never force-push, rebase pushed work, delete a branch, or use --no-verify. Yash alone merges into main.
- Change only the files my brief lists. That is what keeps us free of merge conflicts. If a merge conflicts in a file that is not mine, run git merge --abort and tell me.
- If GitHub or the hook rejects a push, keep the commit, do not work around it, and tell me the message.

You are the writer and engineer for our deck, Integrity Lab, House rules and AI-use statement on Paper Trail, our hackathon website. I am Hemanth. Build my whole brief, docs/team/HEMANTH.md, tasks 1 to 6, deck first because it is due first.

Read first: CLAUDE.md, docs/team/HEMANTH.md, docs/PHASE1_DECK_OUTLINE.md, docs/PROBLEM_STATEMENT.md, docs/BUILD_PLAN.md, src/core/contracts.ts, src/policy/policy.ts, src/core/verify/verdict.ts, src/log/log.ts, tests/unit/verify.test.ts, tests/unit/replay.ts, src/pages/Check.tsx.

The outcome, part one: docs/deck/DECK.md, six slides that judges read with nobody presenting, worth 30 points. Cover workflow (8), architecture (6), guardrails (6), ethics (5) and governance (5), with slide 1 as the problem and the three-key rule. For each slide give the title, the exact words, what the diagram shows box by box with its arrow labels, and the points it earns. Each must be readable in 60 seconds. Describe only what is built or in the build plan, because judges check the website against this deck.

The outcome, part two: an Integrity Lab that runs our real checker live on real and deliberately broken references and shows our misses as clearly as our hits; House rules that map SP Jain's policy to features; and an AI-use statement written only from the log.

Evidence. Every number comes from the facts list in my brief or a test we ran, with the source beside it. Do not tune the corpus to flatter us. Invented references exist only inside the Lab corpus, generated by code and labelled invented. Paraphrase the SP Jain policy and link it. I will read APA's AI contribution statement guide myself; leave a marked slot for its required items and do not guess them.

Boundaries. Do not deploy, open a pull request, add a dependency, change GitHub settings, or open any other team's repository. If shared code blocks you, do not edit it: write the request for Yash and carry on with the next piece. Never invent a paper, DOI, quote, number or result. Keys live only in .env.local.

Design. Match Check and Find exactly: tokens from src/ui/tokens.css, square corners, 1px lines, Marcellus headings, Public Sans text. Do not use gradients, glass or blur, pill shapes, drop shadows on cards, emoji or sparkle icons, numbered 01/02/03 labels, uppercase eyebrow labels, or any new colour. Green only for proven.

How to work. Make routine choices yourself and note them; ask me only if two readings would lead to different products. Before writing a page, write its tests. Give me a two-line update when each task is finished, not for every step. Stop for my review after the deck draft, after task 3 with the Lab results table, and after task 5.

After each task: run npm run verify, fix what fails, add a row to docs/prompts/HEMANTH.md with this prompt or my follow-up and what it produced, commit, and push to my branch.

Done means: the deck covers all five areas in six slides with no unsupported claim; npm run verify is green; the Lab corpus has at least 12 real references and all five failure types, gives the same cases every run, and its test passes offline through tests/unit/replay.ts; a live run can be cancelled and a registry outage shows as Could not check; the statement changes when the log changes and never claims a check that did not run; Delete everything asks before it deletes; pages have a clean axe scan, work at 375 px and by keyboard. Finish with the handover note from CLAUDE.md and docs/deck/QA.md.
```
