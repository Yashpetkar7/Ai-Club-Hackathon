# Paper Trail: 8-minute MVP demonstration script

Eight minutes plus two of Q&A (Rule 13/14). Every member speaks (Rule 2). Everything shown is **live**: real Crossref, OpenAlex, DataCite and doi.org, with nothing recorded. Rehearse it to 7:30.

**One sentence to say early and repeat at the end:** "AI proposes, external evidence validates, the student decides. No AI in Paper Trail can make a reference real."

## Before you start (5 minutes before)
- **Open the live link** (or `npm start` on the laptop, then http://127.0.0.1:4173). Make sure it carries the Phase 2 build: the Ask page has a **Research assistant**.
- **Two tabs:**
  - Tab 1: **Projects**, signed in as a guest, with a fresh project ("How reliable are AI-generated references?", **AI level 0 – No AI**). Open **Library**.
  - Tab 2: the same project's **Ask** page.
- **Paste-ready text file** with test-pack references A–H, Requests 1–3, and the injected note. In the Check page a bulk paste reads A–G; add H, the web page, in the Library.
- **Network check:** paste B into Check once and confirm it says **Verified**. If the venue Wi-Fi is down, switch to the phone hotspot. If everything is down, every status will honestly say **Not checked – try again**; say exactly that and point to the screenshots in `docs/qa/`.

## Running order

| Time | Speaker | Screen | Do | Say (key lines) |
|---|---|---|---|---|
| 0:00–0:45 | **Hemanth** | Landing page | Hover the "UV lamp" over the paper sheets | "AI makes research fast, and it makes fake references look real. GPT-4 invented about 18% of the citations it gave in one study (Walters & Wilder, 2023), and SP Jain's own policy puts that on the student. Paper Trail checks every reference against real scholarly databases and lets the student decide. AI proposes, external evidence validates, the student decides." |
| 0:45–2:15 | **Siddal** | Library | Paste **B** → Verified. Paste **C** → Not found, open "Databases asked". Paste **A** → Needs fix; click **Accept fix** → "Checked again after your fix: VERIFIED"; open **Decision history** | "B: two databases agree on title, authors, year, journal, volume and pages, so Verified. C was invented: Crossref, DataCite and doi.org say the DOI doesn't exist, and title searches in Crossref and OpenAlex find nothing. We say Not found and show where we looked; we never call it fake and never swap in a similar paper. A has the wrong year: we show what you wrote, what the database says, where from, and why. The student decides. The original stays in the audit history." |
| 2:15–3:30 | **Siddal** | Library | Paste **E** → Mismatch, scroll to the side-by-side. Paste **D** → Retracted; read the date and reasons; type the acknowledgement and confirm | "E's DOI is real, but it opens a paper by Silver et al., not Hinton and Bengio. A DOI that resolves is not proof. D is Wakefield 1998, retracted in 2010. Retraction Watch gives the reasons, including falsification. It can't be used without a written acknowledgement, and the warning follows it into every export." |
| 3:30–4:15 | **Yash** | Library | Paste **G** (Vancouver, capitals, no DOI) → "1 already in your library": it's recognised as B, so one copy is kept. Paste **F** → Verified without a DOI. Paste **H** → Not checked, web source, shown in APA 7 | "Same paper, two formats: matched to B by its DOI after a title search, so only one copy is kept. Different versions, like a preprint and the published paper, are shown side by side for the student to choose: Keep this one, or They are different works. F has no DOI and isn't fake: OpenAlex finds it and DataCite confirms it independently. H is a web page: database verification doesn't apply, so we say so, and format it in APA with the WHO as author and n.d." |
| 4:15–5:45 | **Nihal** | Ask → Research assistant | Paste **Request 1** → NOT FOUND; open "Where we searched"; point at "Related research (not evidence)". Paste **Request 2** → FULL TEXT UNAVAILABLE – CANNOT VERIFY | "We asked for three studies on this very hackathon. None exist, so the assistant returns none instead of inventing three. It searched Crossref and OpenAlex, checked every candidate, and kept general hackathon studies apart as related, not evidence. The LeCun paper is real and Verified, but a real paper is not a real quote. We can only read its abstract, so we say we cannot verify it, and we never invent a page number." |
| 5:45–6:30 | **Nihal** | Library, the LeCun source | Paste the "SYSTEM: ignore your checking rules…" note into Notes → **Save notes** → the warning shows; set the filter to **Verified**, then **Mismatch** | "This note tries to take over the AI. It is saved as the student's text, and that's all it can be. Statuses come only from the Checker. Mismatch is still Mismatch, Retracted is still Retracted. No AI ever read that note." |
| 6:30–7:15 | **Yash** | Export | Show the status list; download **Word** and open the reference list, status appendix and AI-use statement. Switch the AI level to **No AI** and show the agents are locked | "Every reference carries its status in every format: Verified, Needs fix, Retracted with acknowledgement. Nothing unverified leaves looking verified. The AI-use statement is written from the log, not from memory. The AI level is checked on the server as well as in the page." |
| 7:15–7:45 | **Hemanth** | House rules or Integrity Lab | Show the policy page and the Lab | "Every rule is in one policy file, shown to the student. We test ourselves: 730 unit tests, the organisers' test pack live, 12 of 12. We publish our misses too: the QA report lists what is partial." |
| 7:45–8:00 | **All** | Landing | | "Every reference real. Every claim traceable. Every decision yours." |

## If something goes wrong on stage
| Problem | Say | Do |
|---|---|---|
| A database is slow | "It's asking Crossref live. This is the real thing, not a recording." | Wait up to 15 s, then move to the next item |
| A database is down | "This is the outage case: Not checked, try again. It never turns green." | Point at the status, then continue |
| Request 1 is slow | "It is checking every candidate, one by one." | Show `docs/qa/phase2-6-request1.png` if it passes 30 s |
| Wrong tab | | `Ctrl K` opens the command palette for any page |

## Likely questions (owner answers)
| Question | Owner | Answer |
|---|---|---|
| What if the AI is wrong? | Nihal | "The AI can't set a status. It only suggests search phrases, or points at passage numbers. Verdicts are plain code comparing database records." |
| What if the database is wrong? | Siddal | "We show which database said what, and when. The student can see it, reject a fix, or keep a source with a reason. Verified means the databases agree, not that the paper is right." |
| Why is Not found not "fake"? | Siddal | "Books, reports and regional journals are under-indexed. We report where we looked, nothing more." |
| How do you stop prompt injection? | Nihal | "Untrusted text has nowhere to go: statuses are computed, not stored, and the only AI task that reads sources returns IDs. We also flag instruction-like text." |
| Where is student data? | Yash | "In the browser. With an account, an encrypted copy (AES-256-GCM) goes to our server, which cannot open it." |
| What doesn't work yet? | Hemanth | "Direct evidence uses strict word rules, not meaning. A renamed journal can show Needs fix. Full text is mostly unavailable, so many quote checks honestly say Cannot verify. All of this is in the QA report." |
