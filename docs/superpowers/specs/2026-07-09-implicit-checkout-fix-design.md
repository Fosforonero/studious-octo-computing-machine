# Fix Implicit Stripe Checkout Session Creation — Design

**Goal:** A Stripe Checkout Session must only ever be created from an explicit user click ("Complete payment" / "Unlock full audit"), never as an automatic side effect of creating an audit.

## Context

This was flagged as a backlog item after Sprint B's live functional verification (2026-07-09): a test row unexpectedly gained a `stripe_checkout_session_id` without an explicit payment click being made. The original hypothesis (a mount-time effect on `/audits/{id}`) turned out to be wrong on investigation — the actual root cause is one step earlier, at audit-creation time.

## Root cause (confirmed by reading the code, not guessed)

`getOrCreateCheckoutSession` (`src/lib/stripe/checkout.ts`) has exactly two callers in the codebase:

1. **`src/app/api/checkout/route.ts` (POST)** — called only from `AuditPending`'s `pay()` function (`src/components/report/audit-pending.tsx`), itself only invoked by an explicit click on the "Complete payment — $29" button. **Already correct — no fix needed here.**

2. **`src/app/api/audits/route.ts` (POST)** — the pre-existing anonymous "Run free audit" endpoint (predates Sprint A/B). This one calls `getOrCreateCheckoutSession(audit.id)` **unconditionally**, immediately after creating any audit, and returns the resulting `checkoutUrl` in its JSON response. **This is the bug.**

`AuditForm`'s default submit handler (`src/components/landing/audit-form.tsx`) — the only consumer of `/api/audits` POST, reached via the dormant `full-landing-page.tsx` (`<AuditForm />` with no `onSubmit` prop) — does:
```ts
return { redirect: data.checkoutUrl ?? `/audits/${data.id}` };
```
and the component then does `window.location.href = result.redirect` when the redirect looks like a URL. Since `checkoutUrl` is always populated today, a visitor submitting a URL through this form is redirected straight to Stripe Checkout — before ever seeing the audit page or clicking anything resembling "pay."

This flow is currently dormant (`full-landing-page.tsx` isn't linked from the live coming-soon home page, confirmed by grepping `src/app/page.tsx` for any `AuditForm`/`full-landing-page` reference — none found), but `/api/audits` is a live, callable API route regardless of UI linkage, and this is exactly the code path that goes live the moment the landing page is turned on.

Sprint B's `/start` flow (`src/app/start/actions.ts`) is unaffected — `startAudit` calls `createAudit` directly and never touches checkout; a newly-created unpaid audit there already lands on `/audits/{id}` with the explicit-click payment button, which is the desired behavior everywhere.

Confirmed via `grep -rn "sessions.create" src/`: there is exactly one place in the codebase that creates a Stripe Checkout Session (`createSession` inside `getOrCreateCheckoutSession`). No webhook, trigger, or other code path creates sessions.

## Fix

In `src/app/api/audits/route.ts`, remove the `getOrCreateCheckoutSession` call and the `checkoutUrl` field from the response:

**Before:**
```ts
  try {
    const audit = await createAudit(body.url, normalizedUrl, body.pageGoal, userId);
    let checkoutUrl: string | null = null;
    try {
      const result = await getOrCreateCheckoutSession(audit.id);
      checkoutUrl = result.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("STRIPE_SECRET_KEY is missing") && !message.includes("STRIPE_PRICE_SINGLE_AUDIT is missing")) console.error("[api/audits] getOrCreateCheckoutSession failed", error);
    }
    return NextResponse.json({ id: audit.id, status: audit.status, checkoutUrl }, { status: 202 });
  } catch (error) {
```

**After:**
```ts
  try {
    const audit = await createAudit(body.url, normalizedUrl, body.pageGoal, userId);
    return NextResponse.json({ id: audit.id, status: audit.status }, { status: 202 });
  } catch (error) {
```

The now-unused `getOrCreateCheckoutSession` import is removed from this file (it stays exported from `src/lib/stripe/checkout.ts` for `/api/checkout`'s use).

`AuditForm`'s fallback (`data.checkoutUrl ?? /audits/${data.id}`) already handles a missing `checkoutUrl` correctly — no change needed there. Once `/api/audits` stops sending it, every anonymous audit creation routes to `/audits/{id}`, where `AuditPending` already renders the unpaid state with the explicit "Complete payment — $29" button.

## Explicitly not touched

`/api/checkout` (route + logic), `getOrCreateCheckoutSession`, `claimCheckoutSession`, the Stripe webhook, Stripe pricing/Price IDs, `AuditPending`'s pay button, any Sprint A/B auth code, `audit-form.tsx`, the landing/home page.

## Backlog (confirmed, not part of this fix)

`/api/checkout` accepts any valid-shaped audit UUID with no ownership/auth check — it doesn't leak report data or change ownership, but a stranger who knows an audit's ID could generate a payment link for it. Noted for a separate future task, not this one.

## Verification plan

1. `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"` — green.
2. Live check: POST `/api/audits` with a real URL — response contains only `{ id, status }`, no `checkoutUrl` field; the created row in the database has `stripe_checkout_session_id: null` and `paid: false` (i.e. unpaid, per the existing schema — there is no separate "payment_required" status column, "unpaid" is the client-derived label `AuditPending` computes from `paid: false` + a non-terminal `status`).
3. Visit `/audits/{id}` for that audit — confirm it renders `AuditPending` with the "Complete payment — $29" button (the unpaid state), not an error and not an already-existing checkout redirect.
4. Click "Complete payment" explicitly — confirm it calls `/api/checkout`, which creates (or, on a second click, reuses) a real checkout session, and the audit's `stripe_checkout_session_id` is set only at that point, not before.
5. Confirm no regression on an authenticated audit creation (via `/start`, Sprint B's flow) — already unaffected by this change, but re-verify it still creates an audit and redirects to `/audits/{id}` correctly.
