# Siddal: Library, Write, Cite, Export

**Why it matters:** "find, organise and cite" is 12 points. You own organise and cite. Most teams will ship a wrong APA list; ours will be right.

**Branch:** `siddal/library-cite`

**Your files only**
- `src/core/cite/**`, `src/core/import/**`, `public/styles/**`
- `src/pages/Library.tsx`, `Write.tsx`, `Export.tsx` and their `.module.css` files (keep `<AiStatement project={project} />` at the bottom of Export; Hemanth owns that component)
- `tests/unit/cite*.test.ts`, `tests/unit/import*.test.ts`, `tests/e2e/library.spec.ts`
- `docs/prompts/SIDDAL.md`

**You can use:** `parseBibtex`, `parseRis`, `extractReferences` from `@/core/verify/parse`; `checkReference` + `registries`; `addSource`, `approveSource`, `removeSource`, `editSource`, `setStyle`, `citable` from `@/store/actions`; `Receipt`, `VerdictStamp`; `db.drafts` for the editor.

## Tasks, in order
1. **Library page.** List with title, authors, year, verdict stamp and key status (found, checked, approved). Folders, tags, notes, search box, filter by label, sort. Open a source to see its receipt. Approve; or keep a flagged one with a written reason; or remove. Good empty state that sends people to Find and Check.
2. **Add sources.** By DOI or title (runs the checker). By BibTeX or RIS, pasted or as a file. **Web page:** URL, title, author or organisation, date; saved with origin `web`, never shown as Confirmed, needs a reason to approve.
3. **Citation engine** `core/cite`. `citeproc` with CSL styles in `public/styles` (APA 7, Harvard Cite Them Right, MLA 9, Chicago author-date, IEEE) and the en-US locale, from the citation-style-language project on GitHub (CC BY-SA; add a credit file). In-text citation and reference list. **APA needs sentence case titles**: convert, protect names and acronyms (words with inner capitals, all-caps words, words after a colon), and flag titles for the student to check. Never use doi.org's APA text; it gets this wrong.
4. **Write page.** The student writes in their own words. "Cite" inserts `(Noy & Zhang, 2023)` from the library only, searchable by keyboard. Margin panel: cited and in the library; cited but not in the library; in the library but never cited. Autosave to `db.drafts`.
5. **Export page.** Pre-flight first: blocks anything without three keys unless kept with a reason; blocks retracted sources unless kept with a reason; lists what was not checked. Then: preview, copy, Word (`docx`), BibTeX, RIS, plain text. Hanging indent and italics must survive in Word.
6. **PDF (only if 1 to 5 are green).** `pdfjs-dist`, read in the browser, never uploaded. Find a DOI in the first two pages, run the checker, store the text with `textOrigin: 'pdf'`.

## Done means
- Tests for APA output on at least eight real papers from `tests/unit/verify.test.ts`, with expected text you worked out by hand from the APA 7 rules. Include: two authors, four authors, 21 or more authors, a title with a question mark, a title with "ChatGPT" or "AI", no issue number, article number instead of pages, missing year (n.d.).
- Importing the same DOI twice never makes a duplicate.
- A source that fails pre-flight can never reach an exported file. Write a test that tries.
- Works by keyboard, works at 375 px.

## Your demo (90 s) and questions to be ready for
Show: paste a polished AI paragraph in Check, hand a judge the keyboard, save the good ones, tag and filter, cite one in Write, export in APA 7 and open the Word file.
Q: How is this different from Zotero? Q: What happens to a book that Crossref does not have? Q: Where is my data?

## Prompt to paste (Claude Opus 5.5, Extra effort)
Pick Opus 5.5 and Extra effort first. Paste it once, in this folder, and let it run; turns are long at this setting.

```text
You are the engineer for Library, Write and Export on Paper Trail, our hackathon website. I am Siddal. Build my whole brief, docs/team/SIDDAL.md, tasks 1 to 5. Task 6 only if everything else is green.

Read first: CLAUDE.md, docs/team/SIDDAL.md, docs/PROBLEM_STATEMENT.md, docs/BUILD_PLAN.md sections 3 and 5, src/core/contracts.ts, src/store/actions.ts, src/core/verify/parse.ts, src/pages/Check.tsx, src/pages/Find.tsx, src/ui/Receipt.tsx.

The outcome. A student organises real sources with folders, tags and notes, adds new ones by DOI, title, BibTeX, RIS or web page, cites them while writing, and exports a reference list a librarian would accept, in APA 7 and four other styles, as Word, BibTeX, RIS and text. This carries most of our 12 points for find, organise and cite.

Two things must be true whatever else happens. First, nothing leaves through Export unless it has all three keys or a written reason, and a test tries to get a bad source out and fails. Second, the APA 7 output is right. Work the expected strings out by hand from the APA 7 rules before you run the engine, and never paste engine output into a test. Titles go to sentence case while names, acronyms and words such as ChatGPT keep their capitals; when you cannot be sure, flag the title for the student. doi.org's own APA text gets this wrong, so do not use it.

Pages never set a verdict or a key; they call src/store/actions.ts. A web page is saved as origin web, is never shown as Confirmed, and needs a reason to approve. Keep <AiStatement project={project} /> at the foot of Export; Hemanth owns it. CSL styles are CC BY-SA, so add a credit file beside them.

Boundaries. Work only on branch siddal/library-cite (git switch -c siddal/library-cite if it does not exist; git fetch and merge origin/main first). Change only the files my brief lists. Commit locally as you go. Do not push, open a pull request, deploy, set PUSH_OK, use --no-verify, add a dependency, or open any other team's repository. If shared code blocks you, do not edit it: write the request for Yash and carry on with the next piece. Never invent a paper, DOI, quote, number or result. Keys live only in .env.local.

Design. Match Check and Find exactly: tokens from src/ui/tokens.css, square corners, 1px lines, Marcellus headings, Public Sans text. Do not use gradients, glass or blur, pill shapes, drop shadows on cards, emoji or sparkle icons, numbered 01/02/03 labels, uppercase eyebrow labels, or any new colour. Green only for proven.

How to work. Make routine choices yourself and note them; ask me only if two readings would lead to different products. Before writing a page, write its tests. Give me a two-line update when each task is finished, not for every step. Stop for my review after task 2, after task 3 with a table of expected against actual APA strings, and after task 5.

After each task: run npm run verify, fix what fails, commit, and add a row to docs/prompts/SIDDAL.md with this prompt or my follow-up and what it produced.

Done means: npm run verify is green; at least eight real papers from tests/unit/verify.test.ts format correctly, including two authors, four authors, 21 or more authors, a question-mark title, an acronym title, no issue, an article number, and no date; importing a DOI twice never duplicates; the Word file keeps italics and hanging indents, checked by reading its XML in a test; tests/e2e/library.spec.ts runs add, tag, filter, approve, cite, export in Chrome with no console errors and a clean axe scan; works at 375 px and by keyboard. Finish with the handover note from CLAUDE.md.
```
