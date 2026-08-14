# SignalDesk

Private internal CRM for ingesting Shopify orders, reporting UTM performance, and delivering eligible new-order `Purchase` events to Meta through the Conversions API.

## What is implemented

- Next.js 16 App Router, TypeScript, Tailwind CSS 4 and shadcn/ui
- Supabase email/password authentication with Admin, Operator and Viewer roles
- Admin-controlled invitations and one-time initial-admin bootstrap
- Multi-store Shopify connections with AES-256-GCM encrypted credentials
- HMAC-verified, idempotent, durable Shopify webhook receipts
- 30-day Shopify historical import that is hard-coded as CRM-only
- Private-schema isolation for customer PII, raw Shopify payloads and connection tokens
- Meta Purchase construction with normalized SHA-256 matching fields
- Retryable Meta queue, manual Operator retry and daily scheduled retry
- Global and per-store fail-closed gates for live Meta sending
- Live dashboards, order and UTM reports, notifications and CSV/XLSX exports
- Aggregate-only OpenAI analyst tools; customer PII is never included
- RLS, explicit Data API grants, audit logs, tests and zero known npm advisories

## Safety contract

1. Historical imports call `ingestShopifyOrder(..., queueMeta: false)` and never create Meta Purchase events.
2. `META_PRODUCTION_SEND_ENABLED=false` is the global lock. Each store and Meta connection also has a separate database lock.
3. While locked, a Meta Test Event code is mandatory. Missing test codes fail closed.
4. Keep browser `InitiateCheckout`. Disable Releasit server-side Purchase before SignalDesk becomes the production sender.
5. Do not enable live delivery until browser and server Purchase use the same `event_id` and Meta confirms deduplication.

## Local setup

```bash
npm install
npx vercel link
npx vercel env pull .env.local --environment=development --yes
npm run check
npm run dev
```

Create the first administrator once, after migrations are applied:

```bash
npm run bootstrap-admin -- admin@example.com 'a-strong-12+-character-password' 'Full Name'
```

Bootstrap refuses to run after the first profile exists. Further users must be invited from Settings.

## Store connection requirements

Create a Shopify custom app with `read_orders` and webhook subscription access. Enter its Admin API access token and app client secret in Stores. Optional Meta setup requires a Dataset ID, system-user access token with dataset permission, and a Test Event code. SignalDesk verifies Shopify before saving credentials and registers order create/update/cancel/refund webhooks when `APP_URL` is configured.

## Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
npx supabase db lint --linked --schema public,private --level warning --fail-on error
```

All production secrets belong in Vercel/Supabase configuration, never in Git.
