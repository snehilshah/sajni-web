# sajni-web

Web frontend for **Sajni**, built with React, TypeScript, and Vite.

## Local development

Requirements:

- Node.js 24
- npm
- `sajni-api` running locally for live backend data

Set up and run the app:

```sh
npm ci
cp .env.example .env
make dev
```

The Vite dev server runs on `http://localhost:5173`.

Leave `VITE_API_URL` blank for the normal local setup. Vite proxies `/api/*` to `http://localhost:8080`, so the browser can use same-origin API paths while the backend runs locally.

The backend repository is `snehilshah/sajni-api`.

## Checks

```sh
make check
```

This runs the core CI checks: ESLint, TypeScript type checking, and a production build.

Useful commands:

```sh
make dev
make lint
make build
make preview
make fmt
```

## Documentation

The user-facing Sajni Field Guide lives in `src/pages/docs/` and is served at:

```text
/docs
```

The Field Guide is also an internal product reference. When behavior in a primary app space changes, update the corresponding `*Doc.tsx` page alongside the implementation.

## Deployment

Production is deployed to Vercel. The app uses same-origin `/api/*` requests; Vercel rewrites those requests to the Cloud Run backend.

Production promotion is triggered by tags matching:

```text
srf/release/v*
```

See [`DEPLOY.md`](./DEPLOY.md) for the complete deployment, release, DNS, and rollback setup.
