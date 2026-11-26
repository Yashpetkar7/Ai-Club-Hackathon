# Deploying Paper Trail

Written 26 November 2026. It covers a deployment from a personal copy of the repository, such as `hbasired/AI-Hackathon`, with the branch `hemanth/lab-governance`. That branch contains all of `main`, `yash/integration`, Siddal's latest Library work and Hemanth's work. Plans and limits on hosting sites change, so check the current pages before relying on any limit named here.

## Which host

| | Vercel (recommended for the demo) | Render |
|---|---|---|
| Already set up in this repo | Yes: `vercel.json` (build, CSP headers, `/api` rewrite) and `api/index.mjs` | Needs the settings below; `HOST` support was added for it |
| Speed | Global CDN; no cold start for the pages | The free plan sleeps when idle; the first visit after that can take about a minute |
| Same as on a laptop? | Everything except saving locked copies of a library to the server. On Vercel, `openStore()` returns null, so the site saves in the browser only. The team's live site works the same way. | Yes, including server-side saves, but only with a persistent disk, which needs a paid plan. On the free plan, saved data is lost when the service restarts |
| Cost | Free (Hobby) | Free with sleep; disk and always-on cost money |

**Recommendation:** use Vercel for the demo today. It is faster, it is how the team's site already runs, and the setup is already in the repository. Use Render only if you need accounts saved on the server, and then use a paid instance with a disk. The free plan's sleep is a risk in a live demo.

The fallback that always works is the laptop: `npm start`, then open http://127.0.0.1:4173. That is exactly the local behaviour.

## Vercel, step by step (about 5 minutes)

1. Go to https://vercel.com and sign in with the GitHub account that owns the repository.
2. **Add New → Project → Import** `hbasired/AI-Hackathon`. The branch is `hemanth/lab-governance`, the repository's default branch.
3. **Framework preset:** Vite. `vercel.json` already sets the build command (`npm run build`) and the output folder (`dist`). Leave the root directory as `./`.
4. **Node.js version:** in Project Settings (under General, or Build and Deployment, depending on the dashboard version) set Node.js Version to **22.x**. `package.json` asks for Node 22.19 or newer.
5. **Environment variables** are optional, and each one only adds a feature:
   - `GROQ_API_KEY` or `GEMINI_API_KEY` turn on the AI tasks (Plan suggestions, Reader, Challenger, Explain). Without them, every page still works without AI. You can also paste a Groq key into the hidden owner panel in your own browser tab.
   - `OPENALEX_API_KEY` raises the OpenAlex search budget for Discover.
   - Never put a key in the repository.
6. Press **Deploy**.

### Two things that may stop the first deploy

- **Automatic deploys are turned off in `vercel.json`** (`"git": {"deploymentEnabled": false}`). The team set this on purpose so that only Yash deploys the team site. If Vercel does not deploy after import, or pushes do not deploy, choose one:
  - In your copy only, on GitHub, edit `vercel.json` and delete the `"git": {...}` block, then commit. Every push to your repository then deploys. Do not send this change back to the team repository.
  - Or deploy from the laptop with the Vercel CLI: `npx vercel@latest login`, then `npx vercel@latest --prod` in the project folder.
- **File size.** The fine-tuned support model (`public/models/paper-trail-nli-scifact`) is about 95 MB with its tokenizer. Vercel's limits page lists 100 MB for static file uploads on the free plan, so the deployment may be refused. If it is, add a file named `.vercelignore` to your copy containing the line `public/models`, then deploy again. The site then loads the original support model from Hugging Face instead (about 100 MB, downloaded by the browser). The code already falls back to it when its own model is missing, so the meaning comparison keeps working.

### After it deploys

Open the site and check four things:
1. `/api/health` shows `"ok":true`.
2. **Check references → Try a sample** gives real labels.
3. **Guardrails → Run every check** matches.
4. With a key set, `ai` in `/api/health` is `true`.

## Render, step by step (exactly like the laptop, including saves)

1. Go to https://render.com, then **New → Web Service**, and connect `hbasired/AI-Hackathon` on branch `hemanth/lab-governance`.
2. **Runtime:** Node.
3. **Build command:** `npm ci && npm run build`.
4. **Start command:** `node --disable-warning=ExperimentalWarning server/start.mjs`.
5. **Environment variables:**
   - `HOST` = `0.0.0.0` (required: without it the server only listens inside its own machine).
   - `NODE_VERSION` = `22.19.0`.
   - Optional: `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENALEX_API_KEY`.
   - Render sets `PORT` itself, and the server reads it.
6. **For saved accounts:** add a persistent disk (paid instance) mounted at `/var/data`, and set `DATA_DIR` = `/var/data`. Without a disk, saves last only until the next restart.
7. Deploy, then run the same four checks as above.

## What the team's own site needs

The team site at `https://paper-trail-team1.vercel.app/` deploys only when Yash deploys it, because automatic deploys are off. Merging into `main` alone does not update it.
