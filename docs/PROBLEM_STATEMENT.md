# Official problem statement

**Status: RECEIVED 24 Nov 2026.** The verbatim text is in the organisers' PDFs, emailed to every member. They are not ours to republish, so they stay out of this public repository; keep your copies in `docs/official/`, which git ignores.

**Rules and Regulations: received and read 24 Nov 2026.** It and the Teams list contain phone numbers and student emails, so they are **not** kept in this repository (Rule 10). The points that matter are below.

## Requirements extracted by the team

### Core problem
Reference managers organise sources but leave checking to the student. AI is fast but invents references. It can attach a real author to the wrong paper, cite a DOI that does not exist, quote a sentence the source never contained, or state a guess as fact. The student answers for every error.

### Target users
Students and researchers who find, organise and cite sources, increasingly with AI help.

### Required outcome
A website that has the organisation of a reference manager and the speed of AI, without invented references. A student can:

1. **find** sources
2. **organise** sources
3. **cite** sources
4. trust that **every reference is real**
5. trace **every claim to its source**
6. **stay in charge** of final decisions

It must also act as an **AI Research Assistant**.

### Mandatory features
The brief sets outcomes, not a feature list. Its ideas are explicitly optional: role-based agents, a Crossref/OpenAlex citation checker, trust labels, an honest "Not found", approval checkpoints, APA 7 export plus an AI-use statement. The rubric makes these effectively mandatory:

| Must be visible | Because |
|---|---|
| One core journey that runs end to end | Working MVP, 15 points |
| Find + organise + cite | Research and citation features, 12 points |
| At least one guardrail visibly working | Honesty and verification, 10 points |
| Usable with no instructions | User experience, 8 points |
| Sample AI output clearly labelled as a sample | "Good to know" section |
| Website matches the Phase 1 deck | Day-of requirements, 8 points |

### Constraints
- No paid services or paid API dependencies (`CLAUDE.md`, README). To confirm against Rules and Regulations.
- No fabricated citations, metrics, quotes or results anywhere, including our own deck.
- No secrets or team code in source control.
- Extra requirements arrive at 1:15 PM on 26 Nov, then 90 minutes to adapt.

### Evaluation criteria (100 points)

| Phase 1 deck | 30 | Phase 2 website | 65 |
|---|---|---|---|
| Workflow | 8 | Working MVP | 15 |
| Architecture | 6 | Research and citation features | 12 |
| Ethical considerations | 5 | Presentation and Q&A | 12 |
| Governance | 5 | Honesty and verification in action | 10 |
| Guardrails | 6 | Day-of requirements | 8 |
| | | User experience | 8 |

AI quiz: 5 points by team ranking. Ties go to the higher Phase 2 score.

### Submission requirements
- **Phase 1, 9:00 AM Thu 26 Nov:** one PowerPoint deck, 6 slides maximum, covering workflow, architecture, ethics, governance, guardrails. It is judged by reading, not presented. Late decks score zero.
- **Phase 2, 3:00 PM Thu 26 Nov:** GitHub repository the organisers can open, prompt log in order of use, live link if possible.
- **Presentation:** 8 minutes plus 2 minutes of Q&A. Every member contributes.

### Rules that bind us (Rules and Regulations, paraphrased)
| Rule | What we do |
|---|---|
| 2. Every member contributes; judges may question anyone | One owned area and one demo slot each. Everyone can explain the three-key rule |
| 4, 5. Any AI tool; free APIs at the team's choice | Free registries, free-tier LLM optional |
| 6, 7. Build before the event; ready by 3:00 PM | Feature freeze 21:00 Wed, submission by 14:50 Thu |
| 8. Keep a record of prompts | `docs/prompts/<NAME>.md`, merged into `AI_PROMPT_LOG.md` |
| 9. Never present invented references or samples as real | SAMPLE labels, enforced in the UI |
| 10. Do not copy another team's work; no confidential or personal data | Nothing from other teams. No emails, phone numbers or team code in git |
| 11. Follow SP Jain's integrity and AI-use policies | Mapped clause by clause in the product |
| 13, 14. Chit draw; 8 minutes plus 2; strict | Rehearsed to 7:30 |
| 15. Present from the live link submitted; changes after 3:00 PM do not count | Yash decides on deployment before Thu 12:00 |
| 16, 17. Quiz at 3:15 PM as a team, 5 minutes at most | Quiz captain: Nihal |

### Are we on topic? Yes
| The brief asks for | Where it is |
|---|---|
| Find sources | Plan and Find |
| Organise: library, folders, tags, notes, papers and **web sources** | Library |
| Cite while you write, APA 7 | Write and Export |
| AI Research Assistant | Ask, Evidence, Challenger |
| Every reference real | Check, three-key rule |
| Every claim traceable | Evidence |
| Student in charge | Three gates, AI dial |

Three things were too low in our plan and are now P0: Ask your library, citing while writing, and web sources.

### Corrections to this starter kit
| Starter says | Official rubric says |
|---|---|
| Deck may be "PowerPoint or PDF" (README) | PowerPoint |
| Deck outline: problem, solution, prototype, impact, next steps | Must cover workflow, architecture, ethics, governance, guardrails. The starter outline missed ethics, governance and guardrails as slides: 16 of 30 points. Fixed in `PHASE1_DECK_OUTLINE.md`. |

### Unclear points to ask organisers
1. Rule 15 says present from the live link; the guidelines allow a laptop demo. Which wins?
2. Will the venue network allow calls to `api.crossref.org`, `api.openalex.org` and `huggingface.co`?
