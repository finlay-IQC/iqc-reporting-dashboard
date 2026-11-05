@AGENTS.md

## Project notes

- Next.js 16 **without** Cache Components (classic dynamic rendering). `middleware` is now `src/proxy.ts`. Route props use the generated `PageProps<"/route">` / `LayoutProps` globals, and `params`/`searchParams` are Promises.
- All data reads go through `src/lib/data/reports.ts`, which calls `getCurrentUser()` first and then queries as the user, so RLS applies. Sync jobs use `createAdminClient()` (secret key) and must authorise the caller themselves (`CRON_SECRET`).
- Reporting logic lives in SQL views (`campaign_segments`, `lead_attribution`, `segment_daily`). Change it with a **new** migration file. Never edit an applied one.
- CRM code must return `NormalizedLead` (`src/lib/crm/types.ts`). Nothing outside `src/lib/crm/` should know which CRM a lead came from.
- Before committing: `npm run typecheck && npm run lint && npm test && npm run db:test`.
- Brand colours in `src/app/globals.css` are placeholders until IQC's real palette and logo arrive.
