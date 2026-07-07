# Lensiq architecture

## System shape

```text
Browser → Next.js web/API → PostgreSQL audit queue
                              ↓ claim with SKIP LOCKED
                         Browser worker
                   ↙ Playwright   Lighthouse ↘
                  screenshots + evidence + metrics
                              ↓
                    specialist AI reviewers
                              ↓
                      executive synthesis
                              ↓
                  PostgreSQL + object storage
                              ↓
                         report UI
```

The request path only validates input and inserts a `pending` audit. It never starts Chromium. A separate long-running worker atomically claims one job, marks it `running`, and writes either a complete report or a bounded error.

## Folders

```text
src/app/                  Pages and route handlers
src/components/           Landing, report and UI primitives
src/lib/security/         URL normalization, DNS checks and SSRF controls
src/lib/db/               Lazy Supabase client and repositories
src/lib/audit/            Browser, Lighthouse, AI and job orchestration
src/lib/audit/experts/    One prompt module per specialist
src/lib/storage/          Screenshot persistence
scripts/                  Standalone worker entrypoint
supabase/migrations/      PostgreSQL schema and queue claim function
```

## API

### `POST /api/audits`

Body: `{ "url": "example.com", "pageGoal": "get-leads" }`. Normalizes the URL, resolves DNS, rejects private/internal destinations, inserts a job, and returns `202` with its id.

### `GET /api/audits/:id`

Returns current job state and report data when complete. The loading screen polls this endpoint every three seconds.

## Security boundary

- Only HTTP and HTTPS URLs are accepted.
- Localhost, special-use hostnames, literal private addresses and DNS answers in private ranges are rejected.
- Every browser request is intercepted; newly encountered hosts are resolved before the request continues.
- Redirect destinations are checked again.
- CTA journey checks only follow HTTP GET links. Forms and JavaScript buttons are not submitted.
- Service-role and AI keys stay server/worker-side.
- The worker runs without frontend request privileges and claims jobs through a restricted database function.

DNS rebinding protection should be strengthened in production by pinning approved DNS answers at the outbound proxy/firewall layer. Application checks are necessary but not sufficient as the only network boundary.

## Worker stages

1. Claim the oldest pending audit with `FOR UPDATE SKIP LOCKED`.
2. Render desktop and mobile contexts.
3. Extract headings, content, CTAs, links, forms, landmarks, fold content and trust signals.
4. Follow up to five safe same-origin CTA links in disposable pages.
5. Add numbered evidence markers and capture full-page JPEGs.
6. Run Lighthouse categories and capture Core Web Vitals/supporting metrics.
7. Upload captures and persist raw evidence.
8. Run eight specialists concurrently on the efficient expert model; visual specialists also receive both captures.
9. Run the stronger executive model with visual evidence to de-duplicate, prioritize and write final recommendations.
10. Persist the final report and mark the job complete.

## Deployment

- Web/API: Vercel.
- Database and object storage: Supabase.
- Browser worker: Fly.io, Railway, Render, Cloud Run, ECS, or another container runtime with Chromium and enough memory.
- AI: provider abstraction selected by `AI_PROVIDER`.

Expert and executive phases can use different providers. For example, `AI_EXPERT_PROVIDER=openai` with `gpt-5.4-mini` and `AI_REVIEW_PROVIDER=anthropic` with `claude-opus-4-8`. Both vision-capable provider paths receive the annotated captures.

For production add rate limiting, audit expiry, retry counts, a dead-letter state, signed screenshot URLs, observability, idempotency keys and per-user quotas.
