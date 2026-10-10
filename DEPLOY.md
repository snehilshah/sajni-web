# Deploying sajni-web

Frontend ships to **Vercel** — Hobby tier (free) handles this app
easily. Hostname: `www.ohmysajni.com` with the apex redirecting to it.
The app calls same-origin `/api/*`; `vercel.json` rewrites those
requests to the Cloud Run default URL because Cloud Run domain mapping
is not available in the backend region.

```
push branch / PR       ─►  CI: eslint · tsc · vite build
                            Vercel: preview deploy (auto, per branch)
push main              ─►  CI only (no Vercel deployment)

push tag srf/release/v*─►  CI gate → vercel build --prod → vercel deploy --prod
                            (explicit promotion to ohmysajni.com)
```

Branch pushes get preview URLs from Vercel automatically. Production
URL is only updated when you push a `srf/release/v*` tag. `vercel.json`
sets `git.deploymentEnabled.main: false`, so a push to `main` deploys
nothing; without it, Vercel's git integration would push `main` straight
to production and the tag would be decorative.

---

## Cost math

Vercel Hobby: free. Bandwidth (100GB/mo), build minutes, and seat
all comfortably cover a hobby app. The repo doesn't ship anything
that would push you to Pro.

If you hit the limit later, the migration off Vercel is mechanically
small: build the static bundle in CI (`pnpm run build`), upload `dist/`
to a GCS bucket fronted by Cloud CDN. The frontend code never has to
change.

---

## One-time setup

### 1. Create the Vercel project

1. Sign in at [vercel.com](https://vercel.com) and **Add New →
   Project → Import Git Repository**. Pick `ohmysajni/sajni-web`.
2. Vercel auto-detects Vite from `vercel.json`. Leave defaults.
   Enable `ENABLE_EXPERIMENTAL_COREPACK=1` for Preview and Production in the
   project's environment settings so Vercel uses the pnpm version pinned in
   `package.json`, rather than its bundled older pnpm. Installs use
   `pnpm install --frozen-lockfile`.
3. No API URL environment variable is needed. The client always uses
   same-origin `/api`. Remove any old `VITE_API_URL` setting; it is ignored.
   This also keeps redacted values from `vercel pull` out of request URLs.
4. **Settings → Git → Production Branch**: leave as `main`.
   `vercel.json` already disables git deployments for `main`, so only
   the tag workflow reaches production.
5. **Settings → Domains**: add `ohmysajni.com` (and `www.ohmysajni.com`
   if you want www → apex redirect). Vercel will print the DNS records
   to add at your registrar.

### 2. Wire the GitHub repo to Vercel

The deploy workflow uses the Vercel CLI. It needs three values:

1. **Vercel access token.** Generate at
   [vercel.com/account/tokens](https://vercel.com/account/tokens) —
   scope it to your team and copy the token.
2. **Org ID and Project ID.** Either grab them from your Vercel
   project's settings, or run this once locally:
   ```sh
   pnpm add -g --allow-build=esbuild vercel
   vercel link              # follow prompts; pick the project you just made
   cat .vercel/project.json # contains orgId + projectId
   rm -rf .vercel           # don't commit it (already in .gitignore)
   ```

In `ohmysajni/sajni-web` → **Settings → Secrets and variables → Actions**:

| Where    | Name                | Value                              |
| -------- | ------------------- | ---------------------------------- |
| Secrets  | `VERCEL_TOKEN`      | the token from step 1              |
| Variables| `VERCEL_ORG_ID`     | `orgId` from `project.json`        |
| Variables| `VERCEL_PROJECT_ID` | `projectId` from `project.json`    |

That's it. `git push` for previews, `git tag srf/release/v*` for prod.

### 3. DNS for `ohmysajni.com`

At your registrar, add the records Vercel printed in step 1.5.
Typically:

```
A     @     76.76.21.21          ; Vercel's apex IP
CNAME www   cname.vercel-dns.com
```

No `api` record is needed while production uses Vercel rewrites to
Cloud Run.

---

## Releasing

```sh
# Make sure CI is green on main, then:
git tag srf/release/v0.1.0
git push origin srf/release/v0.1.0
```

The workflow:

1. Re-runs eslint + tsc.
2. `vercel pull` syncs the production env config. The built app always
   calls same-origin `/api`, independently of downloaded environment values.
3. `vercel build --prod` produces a static deployment artifact.
4. `vercel deploy --prebuilt --prod` ships it to `ohmysajni.com`.

### Deploys and open tabs

A deploy deletes the previous build's chunks, and a lazy chunk can also
fail to load on a bad connection. Both look the same in the browser
("Failed to fetch dynamically imported module"). How the app copes:

- **Prefetch.** Once signed in and idle, the shell fetches every screen's
  chunk (`src/lib/lazyPage.ts`; skipped in data-saver mode). A running tab then
  never needs the network to switch screens, so a deploy can't break it.
- **Version check.** Each build compiles in `__BUILD_ID__` (commit sha) and
  publishes `/version.json` (`buildVersion` in `vite.config.ts`). On returning
  to the app and on page changes (at most once a minute), the tab compares
  them; once a newer build is out, the next page change is a full load of
  that page (`src/lib/buildWatch.ts`).
- **Recovery.** A failed chunk asks `/version.json` which case it is: a newer
  build reloads at once, the same build (network) reloads after a 1s/2s/3s
  backoff. At most 3 automatic reloads per 2 minutes (sessionStorage), then
  "Couldn't load this page · Retry", which also retries by itself when the
  browser comes back online. "Loading Sajni…" offers a manual Reload after
  8s (`src/lib/chunkReload.ts`, `ErrorBoundary`).
- **Containment.** Page content, the task dialog, the palette and chat each
  sit in their own error boundary, so one failed chunk never blanks the app.

`pnpm run test:chunk-reload` (CI and release) covers the recovery rules.
HTML is revalidated on each navigation; hashed assets are cached for a year.

### Rollback

Vercel keeps every deploy as a unique URL. To roll back:

- Open the project → **Deployments** → find the previous one →
  **Promote to Production**. That's it; instant.
- Or via CLI: `vercel promote <deployment-url> --prod`.

---

## Local dev

```sh
pnpm install --frozen-lockfile
make dev      # Vite dev server on :5173, proxies /api to localhost:8080
make check    # what CI runs (eslint + tsc + build)
```

`vite.config.ts` proxies `/api/*` to `localhost:8080` in dev so you
can run sajni-api locally and the frontend talks to it without CORS.

---

## How the two repos talk

|                    | dev (laptop)           | prod                           |
| ------------------ | ---------------------- | ------------------------------ |
| Frontend           | `localhost:5173`       | `https://www.ohmysajni.com`     |
| Backend            | `localhost:8080`       | Cloud Run default URL           |
| Frontend → backend | Vite proxy (`/api/*`)  | Vercel rewrite (`/api/*`)       |
| CORS_ORIGIN (api)  | not needed (proxy)     | not needed for same-origin API  |

If a request works locally but fails in prod, check that `vercel.json`
points `/api/:path*` at the current Cloud Run service URL. The client
does not support overriding this prefix with `VITE_API_URL`.
