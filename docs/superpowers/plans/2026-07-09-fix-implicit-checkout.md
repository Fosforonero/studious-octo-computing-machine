# Fix Implicit Stripe Checkout Session Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/api/audits` POST from automatically creating a Stripe Checkout Session when it creates an audit; a session must only ever be created from an explicit "Complete payment" click via `/api/checkout`.

**Architecture:** Single-file surgical edit. `getOrCreateCheckoutSession` currently has two callers; remove the one inside `/api/audits`'s audit-creation handler, leave the one inside `/api/checkout` untouched.

**Tech Stack:** Next.js 16 App Router Route Handler, TypeScript, Docker Compose for the app, Supabase (live project `bfxylskjgtyhvyiflnnc`) for verification, Playwright for the visual/functional check.

## Global Constraints

- Only `src/app/api/audits/route.ts` is modified. No other file changes.
- The response from `/api/audits` POST must be exactly `{ id: audit.id, status: audit.status }` — no `checkoutUrl` field, present or absent-but-typed.
- Do not touch: `/api/checkout`, `getOrCreateCheckoutSession`, `claimCheckoutSession`, the Stripe webhook, Stripe pricing/Price IDs, `AuditPending`'s pay button, `audit-form.tsx`, `/start`'s Server Action, any Sprint A/B auth code, the landing/home page.
- `/api/checkout`'s missing ownership check is confirmed backlog — not part of this plan.
- All app verification goes through `docker-compose`, per this project's Docker-only policy.

---

### Task 1: Remove the automatic checkout-session creation from `/api/audits`

**Files:**
- Modify: `src/app/api/audits/route.ts` (full file, 46 lines)

**Interfaces:**
- Consumes: nothing new — `createAudit`, `assertSafeUrl`, `createClient` keep their existing signatures, untouched.
- Produces: `POST /api/audits` now returns `{ id: string, status: string }` on success (202), with no `checkoutUrl` field. `AuditForm`'s `defaultSubmit` (`src/components/landing/audit-form.tsx`, not modified) already reads `data.checkoutUrl ?? /audits/${data.id}` — since `checkoutUrl` will now be `undefined`, this already falls through to `/audits/${data.id}` correctly.

- [ ] **Step 1: Edit `src/app/api/audits/route.ts`**

Current content:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAudit } from "@/lib/db/audits";
import { assertSafeUrl } from "@/lib/security/url";
import { getOrCreateCheckoutSession } from "@/lib/stripe/checkout";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({ url: z.string().trim().min(3).max(2048), pageGoal: z.enum(["get-leads", "book-demos", "sell", "signups", "inform"]) });

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid website URL." }, { status: 400 });
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = await assertSafeUrl(body.url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enter a valid website URL." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = (claims?.claims.sub as string | undefined) ?? null;

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
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Supabase is not configured")) return NextResponse.json({ error: "Live audits are not configured yet. Open the sample report instead." }, { status: 503 });
    console.error("[api/audits] createAudit failed", error);
    return NextResponse.json({ error: "Could not create the audit. Please try again." }, { status: 500 });
  }
}
```

New content:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAudit } from "@/lib/db/audits";
import { assertSafeUrl } from "@/lib/security/url";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({ url: z.string().trim().min(3).max(2048), pageGoal: z.enum(["get-leads", "book-demos", "sell", "signups", "inform"]) });

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid website URL." }, { status: 400 });
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = await assertSafeUrl(body.url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enter a valid website URL." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = (claims?.claims.sub as string | undefined) ?? null;

  try {
    const audit = await createAudit(body.url, normalizedUrl, body.pageGoal, userId);
    return NextResponse.json({ id: audit.id, status: audit.status }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Supabase is not configured")) return NextResponse.json({ error: "Live audits are not configured yet. Open the sample report instead." }, { status: 503 });
    console.error("[api/audits] createAudit failed", error);
    return NextResponse.json({ error: "Could not create the audit. Please try again." }, { status: 500 });
  }
}
```

The only changes: the `getOrCreateCheckoutSession` import is removed, and the try block's body collapses to a direct `createAudit` call + a two-field JSON response. Everything else (imports, schema, validation, auth lookup, error handling) is untouched.

- [ ] **Step 2: Confirm the removed symbols are gone and nothing else changed**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
grep -n "getOrCreateCheckoutSession\|checkoutUrl" src/app/api/audits/route.ts
```

Expected: no output (both symbols fully removed from this file).

```bash
git diff --stat src/app/api/audits/route.ts
```

Expected: `1 file changed` with only this file listed.

- [ ] **Step 3: Typecheck just this change**

```bash
docker-compose run --rm web sh -c "npm run typecheck"
```

Expected: passes with no errors (confirms the removed import doesn't leave a dangling reference, and the response shape change doesn't break any caller's type expectations).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/audits/route.ts
git commit -m "Stop /api/audits from automatically creating a Stripe checkout session"
```

---

### Task 2: Full functional verification and cleanup

**Files:**
- None modified (verification-only task). May temporarily create `docker-compose.override.yml` and remove it before finishing.

**Interfaces:**
- Consumes: the fixed `src/app/api/audits/route.ts` from Task 1.
- Produces: nothing new — this is the final gate before the branch is done.

- [ ] **Step 1: Run typecheck, lint, and build**

```bash
cd "/Volumes/LOS ANGELES/Matteo/Dev Roba Mia/SEO Analisi"
docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"
```

Expected: all three succeed, ending with the Next.js route table and no errors.

- [ ] **Step 2: Start the dev server on a free port**

Port 3000 is occupied by an unrelated container on this machine.

```bash
cat > docker-compose.override.yml <<'EOF'
services:
  web:
    ports: !override
      - "3100:3000"
EOF
docker-compose up -d web
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/)
  if [ "$code" = "200" ]; then echo "ready ($code)"; break; fi
  echo "waiting... ($code)"
  sleep 2
done
```

- [ ] **Step 3: Clear any stale browser cookies from earlier, unrelated testing**

The Playwright browser context may still be carrying cookies from earlier work in this same session (e.g. Sprint B's test-user sessions, since deleted from the database, or a leftover `lensiq_pending_audit` cookie). Start this verification from a clean slate:

```js
// via browser_run_code_unsafe, function: async (page) => { await page.context().clearCookies(); return { cleared: true }; }
```

- [ ] **Step 4: POST to `/api/audits` and confirm the response has no `checkoutUrl`**

```bash
curl -s -X POST http://localhost:3100/api/audits -H "content-type: application/json" -d '{"url":"https://example.com","pageGoal":"inform"}'
```

Expected: a JSON object with exactly `id` and `status` fields (e.g. `{"id":"...","status":"pending"}`) — no `checkoutUrl` key anywhere in the output. Save the `id` value from the response for the next steps (referred to below as `AUDIT_ID`).

- [ ] **Step 5: Confirm the database row has no Stripe session and is unpaid**

Use the Supabase MCP `execute_sql` tool against project `bfxylskjgtyhvyiflnnc`:

```sql
select id, url, status, paid, stripe_checkout_session_id, created_at
from audits
where id = '<AUDIT_ID>';
```

Expected: one row, `paid: false`, `stripe_checkout_session_id: null`, `url: "https://example.com"`.

- [ ] **Step 6: Visit `/audits/{AUDIT_ID}` and confirm the unpaid state renders with the explicit payment button**

Use the Playwright MCP tools:
1. `browser_navigate` to `http://localhost:3100/audits/<AUDIT_ID>`
2. `browser_snapshot` — confirm the page shows "Almost there." / "Your audit is created but not started yet — complete your $29 payment to begin." with a "Complete payment — $29" button. This is `AuditPending`'s unpaid state (`src/components/report/audit-pending.tsx`), confirming no automatic redirect to Stripe happened.

- [ ] **Step 7: Click "Complete payment" and confirm it creates a real checkout session only now**

Use `browser_click` on the "Complete payment — $29" button. This calls `pay()`, which POSTs to `/api/checkout` with `{ auditId: AUDIT_ID }`.

Expected: the browser navigates to a real `https://checkout.stripe.com/...` URL (Stripe Test Mode, per this project's established Test Mode keys).

Then re-run the same query from Step 5:

```sql
select stripe_checkout_session_id from audits where id = '<AUDIT_ID>';
```

Expected: `stripe_checkout_session_id` is now a non-null `cs_test_...` value — proving the session was created only after the explicit click, not at audit-creation time (Step 5 confirmed it was null immediately after creation).

Do not complete the actual Stripe payment form — this step only confirms session creation, not the payment/webhook flow (already covered by prior work on this project).

- [ ] **Step 8: Confirm no regression on the authenticated `/start` flow**

This flow doesn't call `/api/audits` or touch checkout at all (per the design spec), so this step is a quick sanity re-check, not a deep test:
1. `browser_navigate` to `http://localhost:3100/start`
2. Fill the URL field with `https://example.org` and submit
3. Since there's no active session, expect a redirect to `/signup` (unauthenticated path) — confirms `/start` still works and was unaffected by this change. (Sprint B's PR already fully verified the authenticated-immediate-creation path live; re-running that full flow here would be redundant — this step only needs to confirm `/start` itself didn't regress.)

- [ ] **Step 9: List and clean up test data created during this verification**

List every row this task's verification created, before deleting anything:

```sql
select id, url, status, paid, stripe_checkout_session_id, created_at
from audits
where url in ('https://example.com', 'https://example.org')
order by created_at desc
limit 5;
```

Confirm the listed rows are clearly from this task's verification (recent `created_at`, matching the `AUDIT_ID` from Step 4 and any row created by Step 8's `/start` submission if one resulted — Step 8 only reaches the signup redirect and does not create an audit row since there's no active session, so likely only one row from Step 4 needs cleanup). Delete only those confirmed rows by explicit id:

```sql
delete from audits where id = '<AUDIT_ID>' returning id;
```

- [ ] **Step 10: Tear down and confirm clean state**

```bash
docker-compose down
rm -f docker-compose.override.yml
rm -rf .playwright-mcp
git status --short
```

Expected: only the benign, pre-existing `next-env.d.ts` churn (if any) — discard it:

```bash
git checkout -- next-env.d.ts 2>/dev/null; git status --short
```

Expected: no output (fully clean working tree).

- [ ] **Step 11: Confirm the branch is ready**

```bash
git log --oneline main..HEAD
git status --short
```

Expected: 3 commits ahead of `main` (design spec, this plan, and Task 1's fix commit), clean working tree. Report this as ready for the finishing-a-development-branch step.
