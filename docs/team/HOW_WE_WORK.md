# How we work

## The rule
Everyone works on, and pushes to, **their own branch only**. **Only Yash merges into `main`.** Nobody edits another person's files, so there is nothing to conflict.

## The repo is public
Other teams can read everything we push. Never push keys, emails, phone numbers, the team code, the organisers' PDFs, or anything you would not show a judge.

## Set up (10 minutes)
```bash
git clone https://github.com/Yashpetkar7/Ai-Club-Hackathon.git
cd Ai-Club-Hackathon
git config user.name "Your Name"
npm install
git switch -c <your branch from the table>
npm run dev
```

| Member | Branch |
|---|---|
| Hemanth | `hemanth/lab-governance` |
| Nihal | `nihal/evidence-ask` |
| Siddal | `siddal/library-cite` |
| Yash | `yash/integration` |

Then open your AI tool in this folder and paste the prompt from the end of your brief in `docs/team/`.

## Pushing and asking for a merge
1. After each finished task: `npm run verify`, commit, then `git push -u origin <your branch>`.
2. At a checkpoint, send Yash your handover note: branch, what works, what you tested, what does not, files changed.
3. Yash reviews and merges. Do not open or merge anything into `main` yourself.

The hook and GitHub's rules stop pushes to `main`. If a push is rejected, send Yash the message.

## Getting Yash's latest main
```bash
git fetch origin
git merge origin/main
```
Fix conflicts only in your own files. If a shared file conflicts, stop and tell Yash.

## Checkpoints (Dubai time)
| When | What |
|---|---|
| Tue 24, 21:30 | Everyone cloned, running, prompt started |
| Wed 25, 13:00 | Checkpoint 1: your first slice works. Handover note to Yash |
| Wed 25, 18:00 | Checkpoint 2: your page is complete |
| Wed 25, 21:00 | Feature freeze. Fixes only |
| Wed 25, 22:00 | Deck uploaded |
| Thu 26, 08:00 | Rehearsal 1, rehearsal 2 |
| Thu 26, 13:15 | Arrive, formal dress, charged laptop |
| Thu 26, 14:50 | Submitted |

## If you get stuck for 20 minutes
Message the group with what you tried and the exact error. Do not push a workaround and do not edit someone else's files.
