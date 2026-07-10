# Access Control Hardening — Design Spec

**Date:** 2026-07-10
**Status:** Draft, awaiting review

## Goal

Today, `/audits/{id}`, `GET /api/audits/{id}` and `POST /api/checkout` are reachable by
anyone who knows (or guesses) an audit's UUID — there is no session check and no
ownership check anywhere on these paths. This sprint closes that gap:

- Only the authenticated owner of an audit can view its report, read its status, or pay for it.
- `/audits/demo` stays public.
- Anonymous audits and legacy rows with `user_id = null` are not accessible to anyone.
- No unauthorized request can create, read, or reuse a Stripe Checkout Session.

## Out of scope

RLS and any browser-side Supabase client. The worker and the Stripe webhook. The
founder price and its $29 copy. The landing page, legal pages, and cookie banner. The AI
pipeline. Screenshot storage. Returning the user automatically to the original audit
page after login (plain `/login` redirect only). No benchmark or competitor references
in code, commits, or docs.

## Architecture

A single shared server-side access-control helper is the only place that decides
whether a request may see a given audit. Every guarded surface calls it; none of them
re-implement the check.

**`src/lib/audit/access.ts` (new)**

```ts
export type AuditAccessResult =
  | { kind: "unauthenticated" }
  | { kind: "not-found" }
  | { kind: "ok"; audit: AuditRecord; userId: string };

export async function resolveAuditAccess(id: string): Promise<AuditAccessResult>
```

Behavior:
1. Read the session via the existing `createClient()` (`@/lib/supabase/server`) and
   `supabase.auth.getClaims()`. `userId` comes **only** from the verified JWT claim
   (`claims.sub`) — never from a route param, query string, or request body.
2. No `sub` in the claims (no session, or `getClaims()` itself errors) → `{ kind: "unauthenticated" }`.
   Any error from the auth call is treated as "no session," not as an exception that
   could accidentally fall through to an authorized branch — auth failures fail closed.
3. Otherwise call `getOwnedAuditSummary(id, userId)` (below). `null` → `{ kind: "not-found" }`.
   A row exists → `{ kind: "ok", audit, userId }`.

Because the query is scoped by `id` **and** `user_id` in the same `WHERE`, "doesn't
exist," "belongs to someone else," and "belongs to nobody (`user_id is null`)" are all
indistinguishable from the caller's side — they all produce `not-found`. A `user_id`
column is never `null` for an authenticated caller, and SQL `null = 'x'` is never true,
so legacy `user_id is null` rows are excluded by the query itself, with no special-case
branch required.

**`not-found` means a clean "no matching row," not a failure — a DB error must never
become `notFound()`.** `resolveAuditAccess` does not catch exceptions from
`getOwnedAuditSummary` (a genuine DB error is not the same thing as "you don't own
this"). The page handler follows exactly two paths: the query completes and finds no
row (or `resolveAuditAccess` cleanly returns `not-found`/`unauthenticated`) →
`notFound()` / `redirect("/login")`, the normal, expected outcomes. A thrown
Supabase/database exception → log it (audit id and error message/code only, no
cookies, tokens, or raw request data — "sanitized" here means exactly that) and
**rethrow**, so Next.js's own error handling takes over and the response is a real
error boundary/500, not a 404. The API routes already do this correctly today
(`catch { … return 500 }`) and are unchanged. Folding a real infrastructure failure into
a fake `not-found` would make outages indistinguishable from correct denials in the
logs, which defeats the point of a clean 401/404 split. This sprint does not add a
custom `error.tsx` — an uncaught throw from the page falls through to Next.js's default
error boundary, which is out of scope to restyle here.

## Database layer — two query tiers

**`src/lib/db/audits.ts`** gets two new functions. `getAudit()` itself is not modified —
`stripe/checkout.ts` and `pending-claim.ts` depend on its current unscoped behavior and
are out of scope for this sprint.

**Tier 1 — summary (ownership check, polling, checkout):**

```ts
export async function getOwnedAuditSummary(id: string, userId: string): Promise<AuditRecord | null>
```

Queries only the base `audits` table — `select("*").eq("id", id).eq("user_id", userId).maybeSingle()`
— and maps it with the existing (unexported) `mapAudit()`. No join against
`audit_pages`, `audit_metrics`, or `audit_reports`. This is what `resolveAuditAccess`
uses, so it's also what backs the polling endpoint and the checkout endpoint — neither
ever triggers the report/metrics/screenshot join.

**Tier 2 — full (the authorized report page only):**

```ts
export async function getOwnedAuditFull(id: string, userId: string): Promise<AuditRecord | null>
```

Same `id + user_id` scoping on the base row; only if that row is found does it run the
existing three-way join (`audit_pages`, `audit_metrics`, `audit_reports`) and attach
`.page`/`.metrics`/`.report`, exactly like today's `getAudit()` does unconditionally.
Called exactly once per page render, and only when the audit's status is already
`"completed"` — never during the pending/running polling window.

## Surfaces

### `/audits/[id]` (`src/app/audits/[id]/page.tsx`)

1. `id === "demo"` → today's static fixture, unchanged, still public.
2. Otherwise, if `id` doesn't match the UUID pattern → `notFound()` immediately, no auth
   check performed (matches the API route's existing posture for garbage ids).
3. `access = await resolveAuditAccess(id)`.
4. `unauthenticated` → `redirect("/login")`.
5. `not-found` → `notFound()`.
6. `ok`, status `!== "completed"` → render `AuditPending` from `access.audit`
   (`id`, `status`, `paid`, `errorMessage`) — no full-load query needed.
7. `ok`, status `=== "completed"` → `full = await getOwnedAuditFull(id, access.userId)`.
   If `full` and `full.report` and `full.metrics` are all present → `<ReportView audit={full} />`.
   A thrown error from this call is **not** caught into `notFound()` — same rule as
   above: log and rethrow, let it surface as a real error boundary/500.

   If the query succeeds but `full.report` or `full.metrics` is still missing while
   `status` is `"completed"`, this is **not** treated as "still processing" and must
   **not** render `AuditPending`. Today's code falls back to the pending UI here, but
   that's a trap: `GET /api/audits/{id}` reports `status: "completed"` regardless of
   whether the join data landed, and `AuditPending`'s own polling loop does
   `if (status === "completed") router.refresh()` — so rendering `AuditPending` in this
   state produces an immediate refresh, which re-runs this same check, which renders
   `AuditPending` again: an infinite completed → refresh loop, not a transient wait.
   Instead, this is a server-side data inconsistency (status flipped without its
   report/metrics, which the atomic `complete_audit` RPC should prevent but this handler
   must not assume): log the audit id and throw, surfacing the same error boundary/500
   as any other infrastructure failure above, never a polling state.

### `GET /api/audits/[id]`

1. UUID-format check, unchanged (already 404s `demo` and any non-UUID id today).
2. `access = await resolveAuditAccess(id)`.
3. `unauthenticated` → `401 { error: "Sign in required." }`.
4. `not-found` → `404 { error: "Audit not found." }` (unchanged message).
5. `ok` → `200` with **only** `{ id, status, paid, errorMessage }` — never `url`,
   `normalizedUrl`, `pageGoal`, `userId`, `stripeCheckoutSessionId`, `overallScore`,
   `createdAt`, `completedAt`, or (as guaranteed by using the summary tier) `page`/`metrics`/`report`.

### `POST /api/checkout`

1. Existing zod validation of `auditId`, unchanged.
2. `access = await resolveAuditAccess(auditId)` — **before any Stripe call.**
3. `unauthenticated` → `401 { error: "Sign in required." }`.
4. `not-found` → `404 { error: "Audit not found." }`.
5. `ok` → `await getOrCreateCheckoutSession(access.audit.id)`, exactly as today.

`stripe/checkout.ts` is not modified. Its existing conditional-claim logic
(`claimCheckoutSession`, keyed on `stripe_checkout_session_id`) already makes two
concurrent requests from the same owner (double tab / double click) converge on one
session — that mechanism sits entirely downstream of the new gate and is unaffected by
it. Because the gate runs first, no unauthorized request reaches `getOrCreateCheckoutSession`
at all, so no Stripe API call is made and `stripe_checkout_session_id` is never written
for a denied request.

### `POST /api/audits`

Reordered so an anonymous request never triggers URL/DNS validation or touches the database:

1. `supabase.auth.getClaims()`.
2. No `sub` → `401 { error: "Sign in required." }` — returned immediately, before body
   parsing, before `assertSafeUrl`.
3. Parse/validate the request body (existing zod schema, existing 400 on failure).
4. `assertSafeUrl(body.url)` (existing 400 on failure).
5. `createAudit(url, normalizedUrl, pageGoal, userId)` — `userId` is now always a real
   value; the `?? null` fallback is removed.

This endpoint's only consumer, `audit-form.tsx`, lives inside the dormant
`full-landing-page.tsx` (unreachable in production today), so this change has no live
user-facing effect. `/start`'s `startAudit` server action is untouched — it already
either creates the audit directly with a real `userId`, or defers to the
`lensiq_pending_audit` cookie + `claimPendingAudit`, which also always assigns a real
`userId`. Neither path calls `POST /api/audits`, so there is no interaction between this
change and the pending-claim flow.

## Client: `AuditPending` (`src/components/report/audit-pending.tsx`)

The polling `setInterval` callback currently does `if (!response.ok) return;` — silently
ignoring 401, 404, and 5xx alike, which would otherwise poll forever against a
now-guarded endpoint. The whole body of the interval callback (the `fetch` call and the
subsequent `.json()` parse) is wrapped in `try/catch`: an `async` function passed to
`setInterval` returns a promise nothing awaits, so a rejected `fetch` (offline, DNS
failure, any network-level error) becomes an **unhandled promise rejection**, not a
value silently discarded — leaving it unwrapped was a real bug in the original spec
text, not a difference that doesn't matter. On a caught network error: no state change,
just return — the next tick retries naturally, same posture as a transient 5xx.

For a successful response, checked in this order:

- **`response.status === 401`** — clear the interval, redirect to `/login` with
  `router.replace("/login")`, **not** `router.push`. `replace` is required, not
  cosmetic: `push` leaves the audit page in browser history, so pressing Back from
  `/login` would land straight back on a page whose next poll immediately 401s again.
  Covers a session that expires while the tab is sitting on this page; the timer is
  cleared before navigating so no further tick can fire.
- **`response.status === 404`** — clear the interval, switch to a new local state
  (`"unavailable"`) rendered as a new branch alongside the existing `"failed"` branch:
  eyebrow "Audit unavailable", heading "We can't find this audit.", body "It may have
  been removed, or you may not have access to it.", and a "Back home" link to `/`. This
  wording doesn't confirm or deny that the audit ever existed.
- **Any other non-`ok` status** (5xx, or anything else transient) — no state change,
  same as today: skip this tick, let the next interval retry. The audit is not marked
  failed.

`pay()`'s existing fetch to `/api/checkout` gets one new branch: if the response status
is `401`, `router.replace("/login")` (same reasoning as above — not `push`) instead of
setting the generic `payError` message. Any other non-ok response (404, 5xx) keeps
today's generic inline error behavior.

## Error semantics

`401` means "we don't know who you are." `404` means "we know who you are, but this
isn't yours, or it doesn't exist" — the two cases are never distinguished, so a `404`
never confirms an audit exists. `403` is not used anywhere in this design. Anonymous
requests always get `401`/`redirect("/login")` regardless of whether the underlying
audit belongs to nobody, someone else, or is legacy-null — no branch reveals more to an
anonymous caller than to a rejected authenticated one.

## Testing plan

Live verification via this project's established docker-compose + Playwright pattern,
plus `typecheck`/`lint`/`build`.

1. **Owner** — sees pending state and the completed report on `/audits/{id}`; `GET
   /api/audits/{id}` returns the minimal shape; `POST /api/checkout` returns a payable
   URL.
2. **Second authenticated user** — `/audits/{id}` → `notFound()` (404 page); `GET
   /api/audits/{id}` → 404; `POST /api/checkout` → 404, and `stripe_checkout_session_id`
   is confirmed still `null` on that audit row afterward.
3. **Anonymous** — `/audits/{id}` → redirected to `/login`; `GET /api/audits/{id}` → 401;
   `POST /api/checkout` → 401; `POST /api/audits` → 401, and confirmed that no audit row
   is created and no DNS/SSRF validation call is triggered (no network call to the
   submitted host).
4. **Legacy `user_id = null` audit** — not accessible to either an anonymous caller or
   an authenticated non-owner. Test data note: since this sprint closes the only
   remaining code path that could create such a row, one is created **before** the
   `POST /api/audits` change is applied, through that same current (pre-fix) anonymous
   endpoint — no raw SQL insert.
5. **`/audits/demo`** — confirmed still public and rendering correctly, unaffected.
6. **Owner, two tabs** — both `POST /api/checkout` calls resolve to the same Stripe Test
   Mode session id; no second payable session is created.
7. **Session expires mid-poll** — simulated by clearing the session cookie while
   `AuditPending` is actively polling; confirms the interval stops, the browser is
   redirected to `/login` via `replace` (confirmed by checking that browser Back from
   `/login` does not return to the audit page), and the audit is never shown as `"failed"`.
8. **Completed audit with permanently missing report/metrics** — simulated by pointing
   the page at a completed audit whose joined data is deliberately absent; confirms the
   page throws/surfaces an error boundary rather than looping between `AuditPending`
   and a refresh.
9. **Audit created via `POST /api/audits` while authenticated** — confirms the created
   row's `user_id` matches the authenticated user.
10. `typecheck`, `lint`, `build` all green.

**Test data protocol:** every test audit id and test user id is listed out before
cleanup. For each test user, sessions are signed out/revoked where the Admin API allows
it **before** calling `supabase.auth.admin.deleteUser` — deleting the user record alone
does not guarantee immediate invalidation of any JWT already issued to it, since
Supabase access tokens are self-contained and valid until they expire regardless of
whether the underlying user still exists. Audits and users are deleted by explicit id
either way, deletion is not skipped because revocation isn't available for a given
case. Any Stripe Test Mode session created during verification is disclosed by id. No
leftover rows in the database and a clean working tree at the end.
