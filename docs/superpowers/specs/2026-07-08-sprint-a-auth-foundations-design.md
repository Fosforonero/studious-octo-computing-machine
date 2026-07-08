# Sprint A — Supabase Auth foundations

Status: approved, pending implementation plan
Date: 2026-07-08

## Purpose

Add Supabase Auth as the minimal application-layer foundation the rest of the product roadmap (free preview, dashboard, credits) depends on. This sprint proves signup, login, logout, session handling, protected routes, and linking an audit to a real `user_id` — nothing else.

## Non-goals (explicitly deferred)

- Free preview pipeline or UI
- Pending-URL capture/claim flow
- A real dashboard (list of audits, search, re-analyze)
- Credits / 3-audit pack
- Client-side Supabase usage (`createBrowserClient`) of any kind
- New RLS policies (RLS stays enabled with zero policies, as today — all data access remains server-mediated through the existing service-role client)
- Any change to Stripe checkout, webhook, or worker logic
- Any landing page redesign

## Existing groundwork (confirmed by code audit before this design)

- `public.users (id uuid references auth.users(id), email text not null, created_at timestamptz)` already exists (migration `0001_initial.sql`), unused until now.
- `public.audits.user_id` already exists as a nullable FK to `public.users(id)`, already indexed (`audits_user_id_idx`).
- RLS is already enabled on every table, with zero policies (default-deny). This sprint does not change that.
- `src/lib/db/client.ts` exports `getSupabaseAdmin()`, a service-role client used by API routes and the worker. This sprint adds a **second, independent** client scoped to auth only — it does not touch `getSupabaseAdmin()`.

## Architecture

Two Supabase clients coexist, with a hard separation of purpose:

| Client | Key | Used for | Used by |
|---|---|---|---|
| `getSupabaseAdmin()` (existing, unchanged) | `SUPABASE_SERVICE_ROLE_KEY` | All data reads/writes (audits, pages, reports, metrics), bypassing RLS | API routes, worker, Stripe webhook |
| New auth server client | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth only: `signUp`, `signInWithPassword`, `signOut`, `getClaims`, `verifyOtp` | Server Actions, `proxy.ts`, `/dashboard`, `/auth/confirm` |

The auth client is never given the service-role key, and the service-role client is never used for login/session operations. No browser-side Supabase client is introduced in this sprint — every auth operation runs server-side (Server Actions, Route Handlers, Proxy).

## Files

- `proxy.ts` (project root) + `src/lib/supabase/proxy.ts` — refreshes the session cookie on every request via `getClaims()` (verifies the JWT signature locally; never trusts the raw cookie via `getSession()`). Redirects unauthenticated requests away from protected paths (`/dashboard` for now; matcher designed so adding future private routes is a one-line change). Excludes static assets, `/api/*` (API routes do their own auth-independent logic — including the anonymous guest-checkout path — and must never be redirected to `/login`), and `/login`, `/signup`, `/auth/confirm` themselves (a logged-out visitor must be able to reach these).
- `src/lib/supabase/server.ts` — factory returning a `createServerClient` (from `@supabase/ssr`) using `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the Next.js `cookies()` store. This is the only client used for auth operations.
- `src/app/login/page.tsx` — email/password form, submits to a Server Action calling `supabase.auth.signInWithPassword()`. On success, redirect to `/dashboard`. On failure, show the error inline.
- `src/app/signup/page.tsx` — email/password form, submits to a Server Action calling `supabase.auth.signUp()` with `emailRedirectTo` pointing at `/auth/confirm`. Shows a "check your email" interim screen (`signUp()` returns no active session while confirmation is pending).
- `src/app/auth/confirm/route.ts` — Route Handler completing confirmation. **Uses `verifyOtp({ type, token_hash })`**, matching the `token_hash`/`type=email` link Supabase's email/password confirmation flow actually sends (confirmed against current Supabase docs) — not `exchangeCodeForSession`, which is for the separate OAuth/PKCE `code` param flow this project doesn't use. On success, redirect to `/dashboard`; on failure, redirect to `/login` with an error query param.
- `src/app/dashboard/page.tsx` — Server Component. Independently re-checks the session via `getClaims()` (defense in depth — never relies on `proxy.ts` alone, per Next.js's own guidance that Proxy coverage can silently be bypassed by routing changes). Renders a placeholder: the logged-in user's email and a logout button (a Server Action calling `supabase.auth.signOut()`). No design investment beyond this — plain, functional.
- `src/lib/db/audits.ts` — `createAudit()` gains an optional fourth parameter, `userId: string | null`. When present, it's written to `audits.user_id`; when absent/null, behavior is identical to today (guest audits keep working unchanged).
- `src/app/api/audits/route.ts` — reads the current session server-side (via the new auth server client's `getClaims()`) before calling `createAudit()`, passing the resulting user id (or `null` if no session). This is the only change to the existing audit-creation path; checkout/payment logic is untouched.
- `supabase/migrations/0004_auth_user_sync.sql` — trigger populating `public.users` (see below).
- `.env.example` — add `NEXT_PUBLIC_SUPABASE_ANON_KEY=` (currently missing; `NEXT_PUBLIC_SUPABASE_URL` already present).

## Data model change

Only a trigger — no table/column changes (the schema was already prepared for this).

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- **Idempotent**: `on conflict (id) do update` means re-running the migration, or the trigger somehow firing twice for the same id, never errors and never leaves a stale row — it just re-syncs the email.
- **`security definer` + `set search_path = ''`**: required because the trigger must write to `public.users` under `auth.users`' own execution context (which doesn't have insert rights on `public.users` otherwise), and the empty search path blocks a search-path-hijack attack (every identifier in the body is schema-qualified — `public.users` — so this is already satisfied).
- **Doesn't break if the user already exists**: the `on conflict` clause is exactly this guarantee — this covers both a re-run of the migration and any edge case where a `public.users` row was somehow created ahead of the trigger.
- Run `get_advisors` (Supabase advisors) after applying, per the Supabase security checklist for any new `security definer` function.

## Security notes

- `getClaims()`, not `getSession()`, is used everywhere an authorization decision is made (Proxy, `/dashboard`, the API route's session check) — it verifies the JWT signature against the project's published keys on every call, with no network round-trip, unlike the unverified cookie read `getSession()` performs.
- `getUser()` (network call to the Auth server, detects server-side revocation) is not needed for this sprint's scope — no high-sensitivity action (e.g. account deletion) exists yet. Noted here so it's not forgotten if such an action is added later.
- Never use `raw_user_meta_data`/`user_metadata` for any authorization decision (Supabase security checklist) — not applicable yet since this sprint makes no authorization decisions beyond "is there a session," but stated here as a standing constraint for later sprints (e.g. if `app_metadata` roles are introduced for credits/plans).
- No RLS policy changes. `public.users` and `public.audits` remain reachable only through the service-role client server-side, exactly as today.

## Testing / verification plan

Typecheck/lint/build are necessary but not sufficient — the user explicitly does not want a confirm route that "only works in theory." Verification plan, in order:

1. `npm run typecheck && npm run lint && npm run build` — must be green.
2. **Real signup test against the actual Supabase project**, without depending on a real email inbox: use the service-role client's admin API (`supabase.auth.admin.generateLink({ type: 'signup', email, password })`, run from a throwaway, uncommitted verification script inside the docker `web` container — service-role key never leaves the container/env-file, and this script is not part of the shipped application, only a one-off test aid deleted after use) to obtain the real `token_hash` Supabase would have emailed, then drive `/auth/confirm?token_hash=...&type=email` exactly as a real user's browser would. This exercises the actual `verifyOtp` code path end-to-end, not a mock.
3. Confirm via SQL (read-only `select`, not a write): a real `auth.users` row exists, and a matching `public.users` row was created by the trigger.
4. Login with the same credentials via `/login`, confirm redirect to `/dashboard` and that the page shows the correct email.
5. Confirm `/dashboard` redirects to `/login` when visited without a session (fresh browser context / cleared cookies).
6. Logout, confirm `/dashboard` becomes inaccessible again.
7. Create an audit while authenticated (direct API call, session cookie attached) and confirm `audits.user_id` is set; create one without a session and confirm it's still `null` (no regression on the guest path).
8. Re-run `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"` one final time against the full diff.
9. Manually re-verify the existing Stripe checkout flow still works unmodified (no code in this sprint touches it, but confirm no accidental import/type collateral damage).

## Acceptance criteria

- [ ] Real signup works (via the generateLink-driven confirm test above)
- [ ] `public.users` row is created on signup
- [ ] Login/logout work
- [ ] `/dashboard` blocks anonymous visitors
- [ ] `/dashboard` shows the logged-in user's email
- [ ] An audit created by an authenticated request has `user_id` set; guest audits remain unaffected
- [ ] typecheck/lint/build green
- [ ] No secrets in the repo
- [ ] Stripe checkout/webhook/worker unmodified and still functioning
