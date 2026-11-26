# Pitch fact check

Checked on 26 November 2026, about 14:20 Dubai time, against the code on `hemanth/lab-governance`. This branch contains all of `main`, `yash/integration` and Siddal's latest Library work. Each line says whether the pitch is right and gives words to use instead where it is not. Outside facts were checked by web search.

## Outside facts

| Pitch says | Verdict | Use this |
|---|---|---|
| Lawyers fined for ChatGPT cases, Mata v. Avianca, New York, 2023 | Right | Judge Castel (S.D.N.Y.) fined two lawyers and their firm $5,000 on 22 June 2023 for citing cases ChatGPT invented. |
| Walters & Wilder (2023), Scientific Reports: 18% of GPT-4's citations fabricated | Right | The abstract, stored in `tests/unit/fixtures/abstracts.json`, says: "55% of the GPT-3.5 citations but just 18% of the GPT-4 citations are fabricated." |
| "ChatGPT in the classroom" (Emerald, 2024), retracted | Mostly right | "ChatGPT in the classroom: Navigating the generative AI wave in management education", *Journal of Research in Innovative Teaching & Learning*, DOI 10.1108/JRIT-01-2024-0017. The fixtures do not name the publisher, so name the journal or the DOI. |

## Product claims

| Pitch says | Verdict | Use this |
|---|---|---|
| Each reference is looked up in Crossref, OpenAlex, DataCite and doi.org, and now Retraction Watch | Partly | "A DOI is looked up in Crossref, then DataCite, then doi.org, until one has it. A match is cross-checked in OpenAlex and in the Retraction Watch index that ships with the site. A reference without a DOI is searched by title in Crossref and OpenAlex." Retraction Watch is a shipped index, not a live service. |
| Verdicts: Confirmed, Details differ, Wrong paper, Retracted, Not found, Could not check | Partly | Add **One registry only**: a clean match that a second registry did not confirm. |
| Plan: AI (Gemini) suggests phrases, always including one against you | Partly | "AI (Groq or Gemini) suggests search phrases and is asked to include one that looks for evidence against you. Plain code also suggests a 'limitations criticism' search. You edit and approve them." The AI is asked, but code does not enforce it. |
| Evidence labels Verified, Reported, Disputed; "the on-device model we trained" | Partly | "Verified, Reported (not checked) and Disputed. A small model we **fine-tuned** on SciFact runs in your browser when you ask, and helps with paraphrases. It never decides the label alone." |
| Citations inserted only from approved sources | Right, with a caveat | "The Cite button inserts only approved sources. A citation typed by hand is flagged." |
| APA 7, Harvard, MLA, Chicago, IEEE; Word, BibTeX, RIS; AI-use statement from the log | Right | Chicago is author-date and Harvard is Cite Them Right. Since today each exported entry also carries its status. |
| Team runs all nine agents | Partly | "There are ten agents (four AI, six code). Team runs nine of them in order; the Explainer works on the Evidence page." |
| AI gateway tries Groq, then Gemini (Gemini 3.5 Flash Lite) | Partly | "Fixed tasks only, with the AI level enforced on the server. It tries the owner's key, then Groq, then Gemini, using the newest Flash-Lite model the key can use." No model name is fixed in the code, so do not name one unless you saw it in the AI-use statement. |
| Library encrypted in the browser (AES-256) before our server; stored in SQLite | Right, with a caveat | AES-256-GCM, with the key derived by PBKDF2-SHA-256 at 600,000 iterations. The server uses SQLite, or JSON files. **On Vercel, saving to the server is switched off and the library stays in the browser.** |
| Retraction Watch, 62,611 retracted papers, 6 MB index | Right | 62,611 retracted, plus 1,676 expressions of concern; 65,097 DOIs; 5.6 MB. The index's `latestNotice` field says 2027-08-27, a future date, so Yash should check it. |
| Training data: SciFact and a Crossref random sample | Partly | "SciFact for the claim model. For the retraction-risk model, Crossref records of papers Retraction Watch lists as retracted, and a Crossref random sample." |
| Wrong "contradicts" calls dropped from 165 to 11 on held-out data | Right | "From 165 to 11 on 1,353 held-out SciFact pairs (8-bit browser files)." |
| Retraction-risk model is a grey caution only and never changes a verdict | Right | Nothing in `src/core/verify` reads it. |
| Vitest: 704 automated tests | **Wrong** | "1,100 automated unit tests pass (3 skipped), plus 27 offline tests." That was the run of 26 November, about 14:15. |
| A robot that clicks all 414 controls | **Not recorded** | "A robot clicks every kind of control on every page." The number is printed only when that test runs (`AUDIT=1`), and 414 is not in any record. |
| Data page: 20 of 20 outside references right, 0 of 80 false claims, 62k retractions | Partly | "20 of 20 outside references got the expected label in a live spot check on 26 November (10 real, 5 retracted, 5 altered). 0 of 80 false claims from our claim sets were Verified. 62,611 retractions." The spot check was run with `main`'s checker before today's stricter rules. |
| Every demo item says SAMPLE | Mostly right | The samples on Check, Audit, Guardrails and the Lab say SAMPLE. The example chips on the landing page run live checks and carry no label. |
| Check → Try a sample: 2 Confirmed, 1 Retracted, 1 Wrong paper, 1 Not found | Right in the tests | The browser test asserts exactly this with recorded registry answers. A live run can differ, for example One registry only when a registry is slow. |
| Evidence: "13%" Verified, "31%" Disputed | Right, but on the **Audit** page | Show it with Audit → Try the sample. On Evidence, the same two claims typed in go through the same checks. |
| No paid services | Mostly right | "No paid service is needed. The optional assistant uses free-tier Groq or Gemini keys." |

## Likely questions

These answers stand as written: "What if a database is down?", "Can AI still lie here?", "Is it plagiarism detection?" and "Why trust your model?". For the last one, add that the guards also stopped every false claim the model alone would have passed.
