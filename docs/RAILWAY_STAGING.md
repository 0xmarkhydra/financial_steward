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

Before the next release:
- Verify `/healthz`, manifest, Service Worker, CORS preflight and browser login with a test account, no real financial data.
- Make sure Postgres volume is mounted and backups are configured before production.
- Add email verification, password recovery, MFA, distributed auth rate limits and production monitoring before exposing to personal financial data.
- This is a staging environment, not an approval to operate with real customer finance records.
