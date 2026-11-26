# Prompt log: SIDDAL

One row per main prompt, in the order used. Paste the prompt itself, not a summary.

| # | Date and time (Dubai) | Tool and model | Prompt | What it produced, and did we use it? |
|---|---|---|---|---|
| 1 | 26 Nov 2026, 13:35 | Claude (Claude app, Claude Opus 5.5) | "The phase 2 has started I want you to go to the website https://ai-hackathon-tau-green.vercel.app/ And check it out" | Read the day-of test pack and ran all 8 references and 3 requests through our live site. Found: no accept or reject for a small error, duplicates saved silently with no merge offer, "Details differ" where the pack asks for "Mismatch", the web page dropped from Check, a wrong 2025 year suggested for Vaswani. Used to plan the fixes. |
| 2 | 26 Nov 2026, 13:57 | Claude (Claude app, Claude Opus 5.5) | "Okay lets go with your suggestions and start building it" (with the five requirements from the platform pasted below it) | On `siddal/library-cite`: Library "Paste a list" tab (every line gets a label, web addresses saved as web pages, not checked), duplicate offer with "Merge into one entry" or "Discard this copy", "Accept the fix" and "Reject the fix" for a small error (the checker runs again on the registry's details), and a label on every added line instead of "1 added". New unit test `tests/unit/import-list.test.ts`. `npm run verify`: 710 passed, build ok. Used. Mismatch label and the Check page web row are requests to Yash, not changed here. |
