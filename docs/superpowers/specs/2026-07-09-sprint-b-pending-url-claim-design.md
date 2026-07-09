# Sprint B — Pending URL claim post-login/signup

Status: approved, pending implementation plan
Date: 2026-07-09

## Purpose

Let an anonymous visitor submit a website URL from a new, unlinked public page, gate audit creation behind account creation/login, and — once authenticated — automatically create the audit they originally asked for, tied to their real `user_id`, with no duplicate audits under refresh/double-submit/concurrent-request races.

## Non-goals (explicitly deferred)

- The free preview AI pipeline (3 leaks, screenshot, rewrite teaser) — still not built. After claiming, the user lands on the existing `/audits/[id]` page, which today shows the founder-offer payment-required screen for an unpaid audit, not a preview. The new copy ("see your preview") is intentionally forward-looking — this is a known, accepted interim mismatch that resolves once the free-preview sprint ships.
- A real dashboard (list/search/history) — `/dashboard` stays the Sprint A placeholder, only gaining an optional error banner (see Error handling).
- Any Stripe change, Vercel Cron, credits, the 3-audit pack, or publishing the full landing page. The home page (`src/app/page.tsx`) is untouched — it stays the locked-down coming-soon page. The new public URL-input page is a **separate, unlinked route**, not reachable from the home page.

## Existing groundwork (confirmed, no changes needed)

- `src/components/landing/audit-form.tsx` — a working URL-input form that already POSTs to `/api/audits`. Reused here with rewritten copy (see UI section) — its current copy ("No signup · Homepage only") is the opposite of what this sprint does.
- `/audits/[id]` (`src/app/audits/[id]/page.tsx`) — already renders the correct state (pending/unpaid/running/failed/completed) for any audit id, with no ownership check today (any visitor with the id can view it — a pre-existing property of the whole app, not something this sprint changes). Reused unmodified as the post-claim redirect target.
- `assertSafeUrl` (`src/lib/security/url.ts`) — existing SSRF-safe URL validation, reused for both the initial submit and the claim-time re-validation.
- `createAudit()` (Sprint A) already accepts an optional `userId`.
- Login (`src/app/login/actions.ts`), signup confirm (`src/app/auth/confirm/route.ts`) — both already exist from Sprint A and gain one new call each to the shared claim helper below.

## Architecture

One new page, one new small library module, one small extension to `createAudit`, and one call added to each of the two existing post-auth success paths (login, email confirmation).

- `src/app/start/page.tsx` — new, public, **not linked from the home page**. Renders the existing `AuditForm` with updated copy.
- `src/app/start/actions.ts` — new Server Action `startAudit(formData)`:
  - Validates the URL via `assertSafeUrl`.
  - If a session already exists (`getClaims()`): creates the audit immediately with `user_id` set, redirects to `/audits/{id}`. No cookie involved — there's no redirect gap to bridge.
  - If no session: generates a new UUID for the future audit, writes the pending-audit cookie (see below), redirects to `/signup`.
- `src/lib/audit/pending-claim.ts` — new, the single shared module used by every call site that can complete a claim:
  - `setPendingAuditCookie({ auditId, url, pageGoal })` — writes the cookie.
  - `clearPendingAuditCookie()` — expires it.
  - `claimPendingAudit(userId): Promise<{ status: "claimed"; auditId: string } | { status: "invalid-url" } | { status: "none" }>` — the entire read → validate → insert-or-fetch → ownership-check → clear sequence, detailed below. Both `src/app/login/actions.ts` (after a successful `signInWithPassword`) and `src/app/auth/confirm/route.ts` (after a successful `verifyOtp`) call this one function and branch on its result — no duplicated logic between the two call sites.
- `src/lib/db/audits.ts` — `createAudit()` gains an optional fifth parameter `id?: string`. When provided, the insert uses it explicitly instead of letting Postgres generate one; on a primary-key conflict (Postgres error code `23505`), it does not throw — it fetches and returns the row that already exists. This is a plain, opinion-free compare-and-swap primitive at the data layer (mirrors the existing `claimCheckoutSession` pattern from the Stripe work). It never inspects `user_id` — that policy decision belongs to the caller (`claimPendingAudit`), not the data layer.

## Cookie design

- Name: `lensiq_pending_audit`.
- Value: `{ auditId, url, pageGoal }` JSON, base64url-encoded (keeps the value free of characters that would need extra escaping in a `Set-Cookie` header).
- Attributes: `httpOnly`, `sameSite: "lax"` (survives the redirect to `/signup` and the separate navigation from an emailed confirmation link — cookies aren't tab-scoped, unlike `sessionStorage`), `secure: process.env.NODE_ENV === "production"`, `maxAge: 60 * 60 * 2` (2 hours — enough for a realistic signup-then-check-email-then-confirm gap), `path: "/"`.
- **No HMAC signing.** Evaluated and rejected: `httpOnly` blocks only `document.cookie` access from page JS, not manual tampering (devtools, a raw HTTP client) — but the actual security boundary is the ownership check below, which trusts only the verified session's `user_id` (from the JWT, unforgeable), never anything read from the cookie. A tampered `auditId` pointing at someone else's real audit fails the ownership check and is silently dropped rather than followed; a tampered `url`/`pageGoal` grants no more than what the attacker could already do by submitting that URL from their own account at `/start`, and is re-validated by `assertSafeUrl` regardless of where it came from. Given that, signing adds real complexity (a secret, an HMAC library or hand-rolled `node:crypto` verification, key-rotation questions) for no closed threat. In its place: strict validation on every read — `auditId` must match the UUID v4 shape, `pageGoal` must be one of the known enum values, and the URL is always re-validated live via `assertSafeUrl`, never trusted from a previous validation.

## `claimPendingAudit(userId)` — full logic

1. Read and base64url-decode the cookie. If absent or it fails to parse as the expected shape (missing fields, `auditId` not a UUID v4, `pageGoal` not one of the exact same five values already accepted by `/api/audits`'s `requestSchema` — `get-leads`, `book-demos`, `sell`, `signups`, `inform`): clear the cookie if present, return `{ status: "none" }`. (A malformed cookie is either a stale format or tampering, neither worth surfacing to the user — silently ignored, exactly like "there was never a pending claim.")
2. Re-validate the URL via `assertSafeUrl`. If it throws: clear the cookie, return `{ status: "invalid-url" }`.
3. Call `createAudit(url, normalizedUrl, pageGoal, userId, auditId)` (explicit id).
4. If the returned row's `user_id === userId` (true whether this call won the insert or lost a race to an identical concurrent claim from the same login — the winner of that race also used this same `userId`): clear the cookie, return `{ status: "claimed", auditId }`.
5. If the returned row's `user_id` is anything else (`null`, or a different user's id — only reachable via a forged/stale cookie referencing an unrelated real audit, since a same-user race always agrees on `userId`): clear the cookie, return `{ status: "none" }` — **never** redirect to an audit that isn't this user's.

## Call sites

- **`/start`'s `startAudit` Server Action** — no session: `setPendingAuditCookie()`, `redirect("/signup")`. (No claim call here — nothing to claim yet.)
- **`/login`'s `login` Server Action** — after `signInWithPassword` succeeds, call `claimPendingAudit(userId)`: `"claimed"` → `redirect(\`/audits/${auditId}\`)`; `"invalid-url"` → `redirect("/dashboard?error=" + encodeURIComponent("We couldn't start an audit for that website. Please try again."))`; `"none"` → `redirect("/dashboard")` (today's unchanged behavior).
- **`/auth/confirm`'s Route Handler** — after `verifyOtp` succeeds, same three-way branch, redirecting instead of using `next/navigation`'s `redirect()` (this file already builds `NextResponse.redirect(...)`, consistent with its existing style).
- **`/dashboard`'s page** — gains an optional `error` search param, rendered as a plain inline banner above the existing "Logged in as {email}" content when present. No other change to the placeholder.

## Already-authenticated submit (no cookie path at all)

If `/start`'s Server Action finds an existing session, it skips the cookie entirely: validate URL, `createAudit(url, normalizedUrl, pageGoal, userId)` (no explicit id — the ordinary auto-generated path, identical to how an authenticated `/api/audits` call already behaves since Sprint A), redirect straight to `/audits/{id}`. There's no redirect gap to bridge, so there's nothing to persist.

## UI copy (AuditForm, reused)

- Remove: "No signup · Homepage only · About 2 minutes".
- CTA button: "Start my audit" (kept simple; "Reveal my free preview" is deferred until the free-preview pipeline actually exists — using preview language before the product delivers one risks the exact overpromise this spec's non-goals section flags).
- Add a short line clarifying the account gate, e.g. "Create a free account to see your results."

## Error handling summary

| Situation | Behavior |
|---|---|
| Malformed/absent pending cookie at claim time | Treated as "nothing to claim," no user-facing error |
| Cookie present but URL now fails `assertSafeUrl` | Cookie cleared, redirect to `/dashboard?error=...` with a clear, generic message |
| Cookie references an audit belonging to someone else (forged/stale) | Cookie cleared, silently treated as "nothing to claim" — never redirects to another user's audit |
| Two concurrent claims of the same pending cookie (double-tab, refresh) | Exactly one `INSERT` wins; the other fetches the same row via the `23505` conflict path and reaches the identical `/audits/{id}` redirect — no duplicate row, no error shown |
| `/start` submit while already authenticated | Immediate creation, no cookie, no redirect to login |

## Testing / verification plan

Same approach as Sprint A — no unit test runner in this project; verify via `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"` plus scripted functional checks against the real Supabase project (no mocks), reusing the `generateLink`-driven signup technique from Sprint A so no real email inbox is required:

1. Anonymous `POST` to `/start`'s action → cookie set (verify via response `Set-Cookie` header presence, not its content) → redirect to `/signup`.
2. Complete signup via `generateLink` + hitting `/auth/confirm` with the session cookie AND the pending-audit cookie both attached → confirm the resulting redirect goes to `/audits/{id}`, not `/dashboard` → confirm via read-only query that the audit's `user_id` matches and the cookie is cleared (no `pending_audit` cookie in the response).
3. Repeat via the `/login` path for an existing (already-confirmed) test user with a pending cookie set.
4. Fire two concurrent requests at the claim path with the same pending-audit cookie (mirroring the earlier Stripe race test) → confirm exactly one audit row exists for that id, both requests land on the same `/audits/{id}`.
5. Set a pending cookie with a deliberately unsafe URL (e.g. a private-IP target already rejected by `assertSafeUrl`) → confirm claim returns `invalid-url`, cookie is cleared, `/dashboard` shows the error banner.
6. Set a pending cookie referencing a real, different, pre-existing audit id belonging to another test user → confirm the claim silently drops it (no redirect to that audit, lands on plain `/dashboard`).
7. Authenticated `/start` submission → confirm immediate audit creation with correct `user_id`, no cookie ever set.
8. Full `typecheck`/`lint`/`build` green on the complete diff.

## Acceptance criteria

- [ ] Anonymous submit at `/start` → redirected to `/signup`
- [ ] After signup + email confirmation → audit created with the correct `user_id`
- [ ] Pending cookie cleared after a successful claim
- [ ] Already-authenticated submit at `/start` → immediate audit creation, no login redirect
- [ ] Refresh/double-submit/concurrent claim of the same pending cookie never creates two audits
- [ ] An invalid/unsafe URL discovered at claim time is handled safely (cleared cookie, clear message, no crash)
- [ ] A forged/mismatched-owner cookie is never followed to someone else's audit
- [ ] typecheck/lint/build green
- [ ] No changes to Stripe, worker, RLS, the home page, or any other out-of-scope area listed above
