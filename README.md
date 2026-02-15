# Website Reports MVP (Cloudflare + PageSpeed)

This repo contains a single-site Cloudflare Worker MVP that generates a one-page monthly PDF report.

## What it does

For one hardcoded site (`src/config.ts`), each run:

1. Pulls Cloudflare traffic analytics for the report month and previous month.
2. Pulls Cloudflare security analytics for the report month.
3. Calls Google PageSpeed Insights for Mobile + Desktop Lighthouse category scores.
4. Renders a one-page HTML report.
5. Converts HTML to PDF using Cloudflare Browser Rendering `/pdf`.
6. Stores both outputs in R2 and saves a JSON snapshot to D1.

## Output keys

- HTML: `reports/<client_id>/<YYYY-MM>.html`
- PDF: `reports/<client_id>/<YYYY-MM>.pdf`

Example: `reports/demo-client/2026-01.pdf`

## Required Cloudflare resources

- Worker
- R2 bucket bound as `REPORTS_BUCKET`
- D1 database bound as `REPORTS_DB`
- API token with:
  - GraphQL analytics read permissions
  - Browser Rendering access

## Required secrets

Set with `wrangler secret put`:

- `CF_API_TOKEN`
- `CF_ACCOUNT_ID`
- `PSI_API_KEY`
- Optional: `RUN_TOKEN` (required by `/run` if set)

## Prerequisites

- Node.js `25.x`

## Setup

1. Configure `src/config.ts` with your real `clientId`, `zoneId`, `domain`, and URLs.
2. Update `wrangler.toml`:
   - set real `database_id`
   - set real R2 bucket name
3. Install deps:

```bash
npm install
```

4. Run local D1 migration:

```bash
npm run db:migrate:local
```

5. Start Worker:

```bash
npm run dev
```

## Manual test run

Generate a specific month (example requested in MVP spec):

```bash
curl "http://127.0.0.1:8787/run?month=2026-01" \
  -H "x-run-token: <RUN_TOKEN_IF_SET>"
```

Expected response includes generated keys:

```json
{
  "ok": true,
  "month": "2026-01",
  "htmlKey": "reports/demo-client/2026-01.html",
  "pdfKey": "reports/demo-client/2026-01.pdf",
  "warnings": []
}
```

## Cron schedule

`wrangler.toml` is configured to run monthly:

- `0 6 1 * *` (06:00 UTC on the first day of each month)

The scheduled run defaults to the previous month.
