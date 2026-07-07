# Lensiq

Lensiq is a professional AI website auditor focused on clarity, trust and conversion — supported by real browser evidence, technical measurements and specific recommendations.

## MVP

- Next.js 16 App Router frontend and API
- URL and DNS validation with private-network blocking
- Supabase/PostgreSQL job persistence
- Separate Playwright + Lighthouse worker
- Desktop and mobile annotated captures
- Safe same-origin CTA journey checks
- Eight specialist AI reviews plus an executive synthesis
- Prioritized report with evidence, impact, effort and copy rewrites

## Local setup

```bash
cp .env.example .env.local
npm install
npm run playwright:install
npm run dev
```

Apply [`supabase/migrations/0001_initial.sql`](supabase/migrations/0001_initial.sql) to a Supabase project, create the environment values, then run the worker separately:

```bash
npm run worker
```

The UI can be evaluated without external services at `/audits/demo`. A live audit never fabricates output: it needs Supabase, a browser runtime and one configured AI provider.

## Commands

```bash
npm run dev
npm run worker:once
npm run typecheck
npm run lint
npm run build
```

Docker Compose starts the web app and the browser worker as separate services. The production recommendation is Vercel for the web app and a container service with persistent Chromium support for the worker.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Product principles](docs/PRODUCT.md)
- [Implementation sprint](docs/SPRINT.md)
