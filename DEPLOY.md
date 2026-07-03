# Deploying Football Finance Machine

The web app is a standard **Next.js 16 (App Router)** project. It lives in the
`epl-trade-machine/` subfolder of the `Football Finance Machine` folder — that
subfolder matters for hosting config (see the ⚠️ note below).

Everything is production-ready: `npm run build` succeeds locally, and there is no
backend, database, or environment variable to configure. Static club data ships
in the bundle.

---

## 0. One-time local check (recommended)

From the app folder, confirm it builds on your machine before you push:

```bash
cd "Football Finance Machine/epl-trade-machine"
npm install
npm run build      # should finish with "Compiled successfully"
npm run start      # optional: serve the production build at http://localhost:3000
```

If `npm run build` passes, deployment will too.

---

## Option A — Vercel via GitHub (recommended)

Vercel is made by the Next.js team; this is the smoothest path and gives you
auto-deploys on every push.

**1. Put the project on GitHub.**

```bash
cd "Football Finance Machine/epl-trade-machine"
git init
git add -A
git commit -m "Football Finance Machine — initial commit"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<your-username>/football-finance-machine.git
git branch -M main
git push -u origin main
```

> Tip: initialise git **inside `epl-trade-machine/`** (as above) so the Next.js
> app is at the repo root. That avoids the subfolder gotcha below.

**2. Import it on Vercel.**

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Select the `football-finance-machine` repo → **Import**.
3. Framework Preset: **Next.js** (auto-detected).
4. Build Command `next build`, Output `.next`, Install `npm install` — all
   auto-filled. Leave them.
5. ⚠️ **Root Directory:** only change this if you pushed the *whole*
   `Football Finance Machine` folder instead of just `epl-trade-machine`. In that
   case set **Root Directory → `epl-trade-machine`**. If you followed step 1 and
   the Next app is at the repo root, leave it as `./`.
6. Click **Deploy**. ~1–2 minutes later you get a live URL like
   `https://football-finance-machine.vercel.app`.

Every future `git push` to `main` redeploys automatically. Add a custom domain
under **Project → Settings → Domains** if you want.

---

## Option B — Vercel CLI (no GitHub)

```bash
cd "Football Finance Machine/epl-trade-machine"
npm i -g vercel
vercel            # first run: log in + link/create a project, follow prompts
vercel --prod     # promote to your production URL
```

The CLI detects Next.js automatically. Because you run it *inside*
`epl-trade-machine/`, there's no root-directory step.

---

## Option C — Netlify

1. Push to GitHub as in Option A.
2. <https://app.netlify.com> → **Add new site → Import an existing project** →
   pick the repo.
3. Netlify auto-detects Next.js via its build plugin. If you pushed the parent
   folder, set **Base directory → `epl-trade-machine`**.
4. Build command `next build`, publish directory `.next`. **Deploy**.

---

## After it's live

- Share the URL (e.g. with ChatGPT for feedback).
- Re-deploy is just another `git push` (Options A/C) or `vercel --prod` (Option B).
- No secrets to rotate, no server to keep running — it's a static/edge Next.js
  build.

## Troubleshooting

- **404 / blank on Vercel** → almost always the Root Directory setting. Point it
  at the folder that contains `package.json` + `next.config.ts`
  (`epl-trade-machine`).
- **Build fails on `next/font`** → not applicable here; this project already uses
  a system font stack in `src/app/layout.tsx`. Keep it.
- **Type or lint error blocks the build** → run `npx tsc --noEmit` and
  `npx eslint src` locally; both are currently clean.
