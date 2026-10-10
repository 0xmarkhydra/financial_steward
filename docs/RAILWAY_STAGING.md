# Railway staging — Quản gia tài chính Web PWA

Dedicated Railway project: `financial-steward-pwa` (LYNX AI's Projects).
Project ID: `ca0894e7-cebf-4d27-b1e0-912a43067812`
Environment: `staging` (id: `baa6c081-a7fb-4639-9ad1-d80d54855ccb`).

Services:
- `Postgres`: dedicated Railway PostgreSQL template, private connection.
- `api`: Go API, Dockerfile: `backend/Dockerfile`, root: `backend/`, health endpoint `/healthz`.
- `frontend`: React/Vite static PWA, Dockerfile: `Dockerfile`, root: `/`, healthcheck `/`.

Endpoints:
- Web: https://frontend-staging-2146.up.railway.app
- API: https://api-staging-706c3.up.railway.app
- API healthcheck: https://api-staging-706c3.up.railway.app/healthz

Staging variables (never commit actual passwords or connection URLs):
- `api`: `DATABASE_URL=${{Postgres.DATABASE_URL}}`; `APP_ENV=production`; `CORS_ORIGINS=https://frontend-staging-2146.up.railway.app`; `PORT=8080`.
- `frontend`: `VITE_API_URL=https://api-staging-706c3.up.railway.app`; `PORT=8080`.

Deploy explicitly to staging (avoid deploying other environments):
```bash
railway environment link staging
railway up ./backend --path-as-root --service api --environment staging --detach
railway up --service frontend --environment staging --detach
railway deployment list --service api --environment staging --json
railway deployment list --service frontend --environment staging --json
```

## Staging acceptance checks

Run `npm run smoke:staging` to execute 14 automated integration checks against HTTPS frontend, API, PostgreSQL, login, logout, revision-conflict protection, PWA assets and CORS. The disposable account is deleted automatically. Run the same suite manually via the GitHub Actions `Staging integration smoke test` workflow (`workflow_dispatch`).

On iPhone, open the staging website in Safari, use Share > Add to Home Screen, launch the standalone app and test login and navigation on the actual device. Chrome Android: choose Install app. There is no connected mobile test device at present, so real-device install testing remains an acceptance gate.

## Deployment gates / unfinished dependencies

- PostgreSQL has a mounted persistent volume, but point-in-time recovery is **not enabled**; confirm and provision a backup plan before production. Do not assume persistence is a backup.
- Email verification, password reset, MFA, shared/distributed auth throttling and operational monitoring still require implementation and (for emails) a provider integration.
- Do not store real financial information in staging. The login screen displays an explicit staging warning.
- Do not automatically connect the API service to GitHub without first setting its repo root to `/backend`; current deployments use explicit `railway up` to avoid a broken root-path build.
- API integration tests use synthetic accounts only; device-specific installation, notifications and accessibility still need testing.
- `APP_ENV=production` on staging enables server security checks but does not mean production approval.
