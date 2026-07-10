# Access Control Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Only the authenticated owner of an audit can view its report, read its status,
or pay for it; `/audits/demo` stays public; anonymous/legacy `user_id = null` audits are
never accessible; no unauthorized request can touch Stripe.

**Architecture:** A single shared server-side helper (`resolveAuditAccess`) is the only
place that decides access, backed by a new `id + user_id`-scoped DB query used for
access checks, polling, and checkout, and a separate, heavier scoped query used only by
the authorized report page once a report is actually ready to render.

**Tech Stack:** Next.js 16 App Router, TypeScript, `@supabase/ssr` (`getClaims()`),
Supabase service-role client, existing zod validation. No new dependencies.

## Global Constraints

- Only the authenticated owner may see/read-status/pay for an audit; `/audits/demo` stays public.
- `user_id = null` (legacy/anonymous) audits are never accessible to anyone, owner or not.
- No unauthorized request may create, read, or reuse a Stripe Checkout Session, or write `stripe_checkout_session_id`.
- `userId` is derived exclusively from `supabase.auth.getClaims()`'s JWT claim — never a route param, query string, or body field.
- Every DB access for a protected resource is scoped by `id + user_id` in the query itself, not by fetch-then-compare in application code.
- Every auth-check error fails closed (treated as unauthenticated), never falls open.
- A DB/Supabase exception is never turned into `notFound()` — log (audit id + error message only) and rethrow, so Next.js's default error boundary handles it as a real error, not a 404.
- A completed audit with permanently missing `report`/`metrics` must not render `AuditPending` (that produces an infinite `completed → refresh` loop) — treat it as a server-side inconsistency: log and throw.
- `AuditPending`'s polling `fetch` is wrapped in `try/catch` — an async `setInterval` callback's rejection is an unhandled promise rejection, not something already handled by not awaiting it.
- 401-redirects in `AuditPending` use `router.replace`, never `router.push` (Back must not loop into another 401).
- `getAudit()` in `src/lib/db/audits.ts` is not modified. `src/lib/stripe/checkout.ts` is not modified.
- No RLS, no browser-side Supabase client this sprint.
- Out of scope entirely: worker, Stripe webhook, the $29/founder pricing copy, landing page, legal pages, cookie banner, AI pipeline, screenshot storage, returning the user to the original page after login.
- No raw SQL against the database at any point, including for test data — every row used in verification is created through existing, already-tested application functions (`createAudit`, `saveScan`, `completeAudit`, the live `POST /api/audits` endpoint, `supabase.auth.admin` methods). Cleanup deletes may use the Supabase admin client directly (parameterized `.delete().eq("id", ...)`, not SQL text) since that's tidying up legitimately-created rows, not fabricating test conditions.
- No benchmark or competitor references in code, commits, or docs.

---

### Task 1: Capture the legacy `user_id = null` test fixture

This must run **before** Task 7, which removes the only remaining code path that can
create such a row. It uses today's (pre-fix) code, unmodified.

**Files:** none — this is a live data-capture step against the current codebase.

- [ ] **Step 1: Bring up the dev server on port 3100**

Port 3000 is occupied by an unrelated container in this environment. Create an
untracked override (matching this project's established pattern):

```bash
cat > docker-compose.override.yml <<'EOF'
services:
  web:
    ports: !override
      - "3100:3000"
EOF
docker compose up -d web
```

Wait until it's serving:

```bash
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/)" = "200" ]; do sleep 2; done
```

- [ ] **Step 2: Create an audit with no session — today's anonymous path**

```bash
curl -s -X POST http://localhost:3100/api/audits \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com","pageGoal":"get-leads"}'
```

Expected: `202` with a JSON body like `{"id":"<uuid>","status":"pending"}`. Record `<uuid>`.

- [ ] **Step 3: Confirm it really has no owner**

```bash
curl -s http://localhost:3100/api/audits/<uuid>
```

Expected: the response body includes `"userId":null` (today's `GET` endpoint still
returns the full mapped audit, including `userId` — that's exactly what Task 5 removes).

- [ ] **Step 4: Record the id in this plan file**

Edit this file: replace every occurrence of `LEGACY_AUDIT_ID_PLACEHOLDER` (in Task 9)
with the `<uuid>` captured above.

- [ ] **Step 5: Stop the dev server**

```bash
docker compose down
```

(`docker-compose.override.yml` stays on disk for now — Task 9 needs it again.)

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-07-10-access-control-hardening.md
git commit -m "Record legacy null-owner test fixture id for access control verification"
```

---

### Task 2: Add ownership-scoped DB queries

**Files:**
- Modify: `src/lib/db/audits.ts`

**Interfaces:**
- Consumes: existing `getSupabaseAdmin()` (`@/lib/db/client`), existing private `mapAudit()`, existing types `AuditRecord`/`ExtractedPage`/`AuditMetrics`/`FinalReport` (already imported in this file).
- Produces: `getOwnedAuditSummary(id: string, userId: string): Promise<AuditRecord | null>` and `getOwnedAuditFull(id: string, userId: string): Promise<AuditRecord | null>` — both consumed by Task 3 (`getOwnedAuditSummary`) and Task 4 (`getOwnedAuditFull`).

- [ ] **Step 1: Add the two functions**

Add this after the existing `getAudit` function in `src/lib/db/audits.ts` (do not modify `getAudit` itself):

```ts
// Single-table, id + user_id scoped — no join. Backs resolveAuditAccess, so this is what
// the polling endpoint and the checkout endpoint run on every call. A user_id column is
// never null for an authenticated caller, and SQL `null = 'x'` is never true, so legacy
// user_id-is-null rows never match here.
export async function getOwnedAuditSummary(id: string, userId: string): Promise<AuditRecord | null> {
  const { data, error } = await getSupabaseAdmin().from("audits").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? mapAudit(data) : null;
}

// Same id + user_id scoping on the base row; only joins audit_pages/audit_metrics/audit_reports
// once that scoped row is confirmed to exist. Used exactly once per report-page render, only
// when status is already "completed" — never during polling.
export async function getOwnedAuditFull(id: string, userId: string): Promise<AuditRecord | null> {
  const db = getSupabaseAdmin();
  const { data: row, error } = await db.from("audits").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const [{ data: page }, { data: metrics }, { data: report }] = await Promise.all([
    db.from("audit_pages").select("*").eq("audit_id", id).maybeSingle(),
    db.from("audit_metrics").select("*").eq("audit_id", id).maybeSingle(),
    db.from("audit_reports").select("*").eq("audit_id", id).maybeSingle(),
  ]);
  const result = mapAudit(row);
  if (page) result.page = { ...(page.extracted_json as ExtractedPage), desktopScreenshotPath: page.desktop_screenshot_url, mobileScreenshotPath: page.mobile_screenshot_url };
  if (metrics) result.metrics = { performanceScore: metrics.performance_score, accessibilityScore: metrics.accessibility_score, seoScore: metrics.seo_score, bestPracticesScore: metrics.best_practices_score, lcp: metrics.lcp, cls: metrics.cls, inpOrTbt: metrics.inp_or_tbt, ttfb: metrics.ttfb, imageIssues: metrics.image_issues ?? [], renderBlockingResources: metrics.render_blocking_resources ?? 0, scriptWeightBytes: metrics.script_weight_bytes ?? 0 };
  if (report) result.report = report.report_json as FinalReport;
  return result;
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
docker compose run --rm web sh -c "npm run typecheck && npm run lint"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/audits.ts
git commit -m "Add id+user_id scoped audit queries (summary and full-load tiers)"
```

---

### Task 3: Add the shared access-control helper

**Files:**
- Create: `src/lib/audit/access.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `getOwnedAuditSummary` (Task 2), `AuditRecord` type (`@/lib/audit/types`).
- Produces: `AuditAccessResult` type and `resolveAuditAccess(id: string): Promise<AuditAccessResult>` — consumed by Task 4 (page), Task 5 (`GET` route), Task 6 (checkout route).

- [ ] **Step 1: Write the file**

```ts
import { createClient } from "@/lib/supabase/server";
import { getOwnedAuditSummary } from "@/lib/db/audits";
import type { AuditRecord } from "@/lib/audit/types";

export type AuditAccessResult =
  | { kind: "unauthenticated" }
  | { kind: "not-found" }
  | { kind: "ok"; audit: AuditRecord; userId: string };

export async function resolveAuditAccess(id: string): Promise<AuditAccessResult> {
  const supabase = await createClient();
  let userId: string | undefined;
  try {
    const { data: claims } = await supabase.auth.getClaims();
    userId = claims?.claims.sub as string | undefined;
  } catch (error) {
    console.error(`[audit-access] getClaims failed for ${id}`, error instanceof Error ? error.message : error);
  }
  if (!userId) return { kind: "unauthenticated" };

  // Not wrapped in try/catch: a genuine DB error here is not "you don't own this" and
  // must propagate to the caller, which keeps its own error-boundary/500 convention —
  // see Global Constraints.
  const audit = await getOwnedAuditSummary(id, userId);
  if (!audit) return { kind: "not-found" };
  return { kind: "ok", audit, userId };
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
docker compose run --rm web sh -c "npm run typecheck && npm run lint"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/audit/access.ts
git commit -m "Add resolveAuditAccess: shared unauthenticated/not-found/ok access check"
```

---

### Task 4: Protect `/audits/[id]`

**Files:**
- Create: `src/lib/audit/consistency.ts`
- Modify: `src/app/audits/[id]/page.tsx`

**Interfaces:**
- Consumes: `resolveAuditAccess` (Task 3), `getOwnedAuditFull` (Task 2), `auditDataIsInconsistent` (this task).
- Produces: nothing new consumed by later tasks. `AuditPending`'s props (`id`, `initialStatus`, `errorMessage`) are unchanged.

- [ ] **Step 1: Add the pure consistency check**

A tiny, dependency-free function so Task 9 can verify this specific behavior with an
in-memory script — no database, no raw SQL, nothing to fabricate.

```ts
import type { AuditRecord } from "@/lib/audit/types";

// A completed audit whose report or metrics never landed is a server-side data problem,
// not "still processing" — the atomic complete_audit RPC should prevent this, but the
// report page must not treat it as pending: GET /api/audits/{id} would keep reporting
// status "completed" regardless, and AuditPending's own polling refreshes on
// status === "completed", producing an infinite refresh loop instead of a real wait.
export function auditDataIsInconsistent(full: AuditRecord | null): boolean {
  return !full || !full.report || !full.metrics;
}
```

Save as `src/lib/audit/consistency.ts`.

- [ ] **Step 2: Rewrite the page**

Replace the full contents of `src/app/audits/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { demoAudit } from "@/lib/audit/demo";
import { getOwnedAuditFull } from "@/lib/db/audits";
import { resolveAuditAccess, type AuditAccessResult } from "@/lib/audit/access";
import { auditDataIsInconsistent } from "@/lib/audit/consistency";
import { AuditPending } from "@/components/report/audit-pending";
import { ReportView } from "@/components/report/report-view";
import type { AuditRecord } from "@/lib/audit/types";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pendingStatusFor(audit: AuditRecord) {
  return audit.status === "failed" ? "failed" : audit.status === "running" ? "running" : audit.paid ? "pending" : "unpaid";
}

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "demo") {
    if (auditDataIsInconsistent(demoAudit) && demoAudit.status === "completed") {
      console.error(`[audits/demo] status is completed but report/metrics are missing`);
      throw new Error("Audit data is inconsistent.");
    }
    if (demoAudit.status !== "completed") return <AuditPending id={demoAudit.id} initialStatus={pendingStatusFor(demoAudit)} errorMessage={demoAudit.errorMessage} />;
    return <ReportView audit={demoAudit} />;
  }

  if (!uuidPattern.test(id)) notFound();

  let access: AuditAccessResult;
  try {
    access = await resolveAuditAccess(id);
  } catch (error) {
    console.error(`[audits/${id}] access check failed`, error instanceof Error ? error.message : error);
    throw error;
  }
  if (access.kind === "unauthenticated") redirect("/login");
  if (access.kind === "not-found") notFound();

  const { audit, userId } = access;
  if (audit.status !== "completed") {
    return <AuditPending id={audit.id} initialStatus={pendingStatusFor(audit)} errorMessage={audit.errorMessage} />;
  }

  let full: AuditRecord | null;
  try {
    full = await getOwnedAuditFull(id, userId);
  } catch (error) {
    console.error(`[audits/${id}] full load failed`, error instanceof Error ? error.message : error);
    throw error;
  }
  if (!auditDataIsInconsistent(full)) return <ReportView audit={full as AuditRecord} />;

  console.error(`[audits/${id}] status is completed but report/metrics are missing`);
  throw new Error("Audit data is inconsistent.");
}
```

Note on the demo branch: `demoAudit` is a static fixture with `status: "completed"` and
both `report`/`metrics` populated (confirmed in `src/lib/audit/demo.ts`), so the
inconsistency branch there is unreachable in practice — it's included only so the demo
path can't silently diverge from the real path's safety property if the fixture is ever
edited.

**Caution for whoever implements this:** `redirect()` and `notFound()` from
`next/navigation` work by throwing a special internal error that Next's own framework
code catches. Never call either of them from inside one of the `try` blocks above — if a
`catch` here ever gets broadened to wrap one of those calls, it would swallow the
redirect/404 instead of letting Next handle it. As written, both calls are outside any
`try`.

- [ ] **Step 3: Typecheck and lint**

```bash
docker compose run --rm web sh -c "npm run typecheck && npm run lint"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/consistency.ts src/app/audits/[id]/page.tsx
git commit -m "Add ownership check and ordered-error handling to /audits/[id]"
```

---

### Task 5: Protect `GET /api/audits/[id]`

**Files:**
- Modify: `src/app/api/audits/[id]/route.ts`

**Interfaces:**
- Consumes: `resolveAuditAccess` (Task 3).
- Produces: response body narrowed to `{ id, status, paid, errorMessage }` — Task 8's client already only reads `status`/`paid` from this JSON, so no client-side shape change is required, but the narrower body is what makes Task 8's new 401/404 handling meaningful.

- [ ] **Step 1: Rewrite the route**

Replace the full contents of `src/app/api/audits/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { resolveAuditAccess } from "@/lib/audit/access";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  try {
    const access = await resolveAuditAccess(id);
    if (access.kind === "unauthenticated") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (access.kind === "not-found") return NextResponse.json({ error: "Audit not found." }, { status: 404 });
    const { audit } = access;
    return NextResponse.json({ id: audit.id, status: audit.status, paid: audit.paid, errorMessage: audit.errorMessage });
  } catch (error) {
    console.error(`[api/audits/${id}] access check failed`, error);
    return NextResponse.json({ error: "Could not load the audit." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
docker compose run --rm web sh -c "npm run typecheck && npm run lint"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/audits/\[id\]/route.ts
git commit -m "Require ownership and return a minimal body from GET /api/audits/[id]"
```

---

### Task 6: Protect `POST /api/checkout`

**Files:**
- Modify: `src/app/api/checkout/route.ts`

**Interfaces:**
- Consumes: `resolveAuditAccess` (Task 3), existing `getOrCreateCheckoutSession` (`@/lib/stripe/checkout`, unmodified).
- Produces: new `401` response for this endpoint — consumed by Task 8's `pay()` handling.

- [ ] **Step 1: Rewrite the route**

Replace the full contents of `src/app/api/checkout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateCheckoutSession } from "@/lib/stripe/checkout";
import { resolveAuditAccess } from "@/lib/audit/access";

const requestSchema = z.object({ auditId: z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) });

export async function POST(request: Request) {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let access: Awaited<ReturnType<typeof resolveAuditAccess>>;
  try {
    access = await resolveAuditAccess(body.auditId);
  } catch (error) {
    console.error(`[api/checkout] access check failed for ${body.auditId}`, error);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
  if (access.kind === "unauthenticated") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (access.kind === "not-found") return NextResponse.json({ error: "Audit not found." }, { status: 404 });

  try {
    const result = await getOrCreateCheckoutSession(access.audit.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/checkout] getOrCreateCheckoutSession failed", error);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
```

Note: the old `if (message === "Audit not found.") return 404` branch around
`getOrCreateCheckoutSession` is removed — ownership is now confirmed before this call
runs, so `getOrCreateCheckoutSession`'s own internal `getAudit` lookup (unchanged, in
`src/lib/stripe/checkout.ts`) will always find the row at this point. Any other failure
from that call now falls through to the generic 500, same as before.

- [ ] **Step 2: Typecheck and lint**

```bash
docker compose run --rm web sh -c "npm run typecheck && npm run lint"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/checkout/route.ts
git commit -m "Require ownership before any Stripe call in POST /api/checkout"
```

---

### Task 7: Harden `POST /api/audits`

**Files:**
- Modify: `src/app/api/audits/route.ts`

**Interfaces:**
- Consumes: existing `createClient`, `createAudit`, `assertSafeUrl` (all unchanged).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Rewrite the route**

Replace the full contents of `src/app/api/audits/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAudit } from "@/lib/db/audits";
import { assertSafeUrl } from "@/lib/security/url";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({ url: z.string().trim().min(3).max(2048), pageGoal: z.enum(["get-leads", "book-demos", "sell", "signups", "inform"]) });

export async function POST(request: Request) {
  const supabase = await createClient();
  let userId: string | undefined;
  try {
    const { data: claims } = await supabase.auth.getClaims();
    userId = claims?.claims.sub as string | undefined;
  } catch (error) {
    console.error("[api/audits] getClaims failed", error instanceof Error ? error.message : error);
  }
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

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

The order is: read claims → 401 if none → validate body → `assertSafeUrl` → create.
An anonymous request now returns before the body is even parsed, so it never reaches
`assertSafeUrl` (no DNS/SSRF check triggered) and never calls `createAudit` (no DB write).

- [ ] **Step 2: Typecheck and lint**

```bash
docker compose run --rm web sh -c "npm run typecheck && npm run lint"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/audits/route.ts
git commit -m "Require a session and always assign user_id in POST /api/audits"
```

---

### Task 8: Update `AuditPending` for 401/404/network errors

**Files:**
- Modify: `src/components/report/audit-pending.tsx`

**Interfaces:**
- Consumes: Task 5's narrowed `GET /api/audits/[id]` response and its 401/404 status codes; Task 6's new `POST /api/checkout` 401 status code.
- Produces: nothing consumed by later tasks (leaf component).

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `src/components/report/audit-pending.tsx`:

```tsx
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/brand";

const steps = ["Opening desktop and mobile browsers", "Reading content and page structure", "Following key conversion paths", "Running technical checks", "Asking specialist reviewers", "Prioritizing the action plan"];

const noopSubscribe = () => () => undefined;
const getSearchSnapshot = () => window.location.search;
const getServerSearchSnapshot = () => "";

export function AuditPending({ id, initialStatus, errorMessage }: { id: string; initialStatus: "pending" | "running" | "failed" | "unpaid"; errorMessage?: string | null }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [payPending, setPayPending] = useState(false);
  const [payError, setPayError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const search = useSyncExternalStore(noopSubscribe, getSearchSnapshot, getServerSearchSnapshot);
  const isConfirmingPayment = initialStatus === "unpaid" && new URLSearchParams(search).get("checkout") === "success";

  useEffect(() => {
    if (initialStatus === "failed" || (initialStatus === "unpaid" && !isConfirmingPayment)) return;
    let attempts = 0;
    const maxConfirmAttempts = 10;
    const timer = window.setInterval(async () => {
      attempts += 1;
      setElapsed((value) => value + 1);
      try {
        const response = await fetch(`/api/audits/${id}`, { cache: "no-store" });
        if (response.status === 401) { window.clearInterval(timer); router.replace("/login"); return; }
        if (response.status === 404) { window.clearInterval(timer); setUnavailable(true); return; }
        if (!response.ok) return;
        const audit = await response.json() as { status: string; paid?: boolean };
        if (audit.status === "completed" || audit.status === "failed") { router.refresh(); return; }
        if (isConfirmingPayment) {
          if (audit.paid) { router.refresh(); return; }
          // Stripe's webhook can land after the browser redirect; stop waiting after 30s and
          // drop the query param so we don't offer a re-payable button while genuinely unpaid,
          // but also don't get stuck "confirming" forever if the webhook never arrives.
          if (attempts >= maxConfirmAttempts) { router.replace(window.location.pathname); router.refresh(); }
        }
      } catch {
        // Network error (offline, DNS failure, etc.) — treat like a transient 5xx and let
        // the next tick retry. Wrapping in try/catch matters here: an async function passed
        // to setInterval returns a promise nothing awaits, so a rejected fetch would
        // otherwise surface as an unhandled promise rejection instead of being retried.
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [id, initialStatus, isConfirmingPayment, router]);
  const active = Math.min(steps.length - 1, Math.floor(elapsed / 3));

  async function pay() {
    setPayPending(true);
    setPayError("");
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ auditId: id }) });
      if (response.status === 401) { router.replace("/login"); return; }
      const data = await response.json() as { url?: string | null; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Payment is not available right now. Please try again later.");
      window.location.href = data.url;
    } catch (cause) {
      setPayError(cause instanceof Error ? cause.message : "Something went wrong.");
      setPayPending(false);
    }
  }

  return <main className="hero-glow grid-noise min-h-screen px-5 py-8 text-white"><div className="mx-auto max-w-3xl"><Brand inverted /><div className="mt-24 rounded-3xl border border-white/10 bg-white/[.04] p-7 backdrop-blur md:p-12">{unavailable ? <><span className="eyebrow">Audit unavailable</span><h1 className="display mt-6 text-6xl">We can&apos;t find this audit.</h1><p className="mt-5 max-w-xl text-white/60">It may have been removed, or you may not have access to it.</p><Link className="mt-8 inline-flex rounded-full bg-primary px-6 py-3 text-sm font-bold text-foreground" href="/">Back home</Link></> : initialStatus === "failed" ? <><span className="eyebrow">Audit stopped</span><h1 className="display mt-6 text-6xl">We hit a snag.</h1><p className="mt-5 max-w-xl text-white/60">{errorMessage ?? "The website could not be audited. Please try again."}</p><Link className="mt-8 inline-flex rounded-full bg-primary px-6 py-3 text-sm font-bold text-foreground" href="/#audit">Try another URL</Link></> : initialStatus === "unpaid" ? (isConfirmingPayment ? <><div className="flex items-center gap-4"><LoaderCircle className="size-8 animate-spin text-primary" /><div><span className="text-xs font-bold uppercase tracking-widest text-primary">Payment received</span><h1 className="mt-1 text-2xl font-bold">Confirming your payment…</h1></div></div><p className="mt-8 max-w-xl text-white/60">This usually takes a few seconds. Please don&apos;t close this page or pay again — we&apos;ll start your audit automatically once it&apos;s confirmed.</p></> : <><span className="eyebrow">Payment required</span><h1 className="display mt-6 text-6xl">Almost there.</h1><p className="mt-5 max-w-xl text-white/60">Your audit is created but not started yet — complete your $29 payment to begin.</p><button onClick={pay} disabled={payPending} className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-foreground disabled:opacity-60">{payPending ? <LoaderCircle className="size-4 animate-spin" /> : "Complete payment — $29"}</button>{payError && <p role="alert" className="mt-4 text-sm font-bold text-red-400">{payError}</p>}</>) : <><div className="flex items-center gap-4"><LoaderCircle className="size-8 animate-spin text-primary" /><div><span className="text-xs font-bold uppercase tracking-widest text-primary">Audit in progress</span><h1 className="mt-1 text-2xl font-bold">We&apos;re looking at your website now.</h1></div></div><div className="mt-10 space-y-3">{steps.map((step, index) => <div key={step} className={`flex items-center gap-4 rounded-xl border p-4 ${index <= active ? "border-primary/20 bg-primary/5" : "border-white/5 opacity-40"}`}><span className={`grid size-7 place-items-center rounded-full ${index < active ? "bg-primary text-foreground" : "border border-white/20"}`}>{index < active ? <Check className="size-4" /> : <span className="text-xs">{index + 1}</span>}</span><span className="text-sm font-bold">{step}</span></div>)}</div><p className="mt-8 text-center text-xs text-white/40">The report refreshes automatically. This usually takes about two minutes.</p></>}</div></div></main>;
}
```

The `$29` copy is untouched (out of scope — pricing copy belongs to a separate, later
sprint).

- [ ] **Step 2: Typecheck and lint**

```bash
docker compose run --rm web sh -c "npm run typecheck && npm run lint"
```

Expected: no errors. If `no-empty` flags the empty `catch {}` block, this project's
ESLint config (`eslint-config-next`, which follows ESLint core's `no-empty` behavior)
allows a block that contains only a comment — the comment above is there specifically
so this passes; if it doesn't, add `// noop` as a statement-free fallback is not
possible, so instead reference the caught value: `catch (networkError) { void networkError; }`.

- [ ] **Step 3: Commit**

```bash
git add src/components/report/audit-pending.tsx
git commit -m "Handle 401/404/network errors in AuditPending polling and pay()"
```

---
### Task 9: Full live verification and cleanup

No code changes in this task — it exercises Tasks 1–8 together against a live server
and confirms every requirement from the spec's testing plan.

**Legacy fixture id (filled in by Task 1, Step 4):** `LEGACY_AUDIT_ID_PLACEHOLDER`

Authentication note for this whole task: this app's server-side Supabase client reads
the session from the `sb-<project-ref>-auth-token` cookie via `@supabase/ssr` — there is
no `Authorization: Bearer` header support and no browser-side Supabase client to inspect.
Reconstructing that cookie's exact encoding by hand for `curl` is unreliable. Instead,
every check that needs to run "as a logged-in user" runs inside a real Playwright browser
session that actually completed the `/login` form (the app's own code sets the cookie
correctly), and uses `browser_evaluate` to run `fetch(...)` **from inside the page** for
any API-level (not just page-level) assertion — an in-page `fetch` automatically carries
the browser's real cookies, same-origin, no manual cookie handling needed. Only the
anonymous checks use plain `curl` (correctly cookie-less by construction).

- [ ] **Step 1: Bring the dev server back up**

```bash
docker compose up -d web
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/)" = "200" ]; do sleep 2; done
```

- [ ] **Step 2: Verify the pure consistency check (no DB, no raw SQL)**

```bash
cat > /tmp/consistency-check.ts <<'EOF'
import { auditDataIsInconsistent } from "/app/src/lib/audit/consistency";
import type { AuditRecord } from "/app/src/lib/audit/types";

const base: AuditRecord = { id: "x", url: "https://example.com", normalizedUrl: "https://example.com/", pageGoal: "get-leads", status: "completed", paid: true, stripeCheckoutSessionId: null, userId: "u1", overallScore: 90, createdAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:01:00.000Z", errorMessage: null };
const fullReport = { overallScore: 1, executiveSummary: "", priorities: [], sections: [], copySuggestions: [], quickWins: [], longTermImprovements: [] };
const fullMetrics = { performanceScore: 1, accessibilityScore: 1, seoScore: 1, bestPracticesScore: 1, lcp: null, cls: null, inpOrTbt: null, ttfb: null, imageIssues: [], renderBlockingResources: 0, scriptWeightBytes: 0 };

const cases: [string, boolean, AuditRecord | null][] = [
  ["null audit", true, null],
  ["missing report and metrics", true, { ...base }],
  ["missing metrics only", true, { ...base, report: fullReport }],
  ["complete", false, { ...base, report: fullReport, metrics: fullMetrics }],
];

let failed = false;
for (const [label, expected, input] of cases) {
  const actual = auditDataIsInconsistent(input);
  if (actual !== expected) { failed = true; console.error(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`OK ${label}`);
}
process.exit(failed ? 1 : 0);
EOF
docker compose run --rm -v /tmp/consistency-check.ts:/tmp/consistency-check.ts web npx tsx /tmp/consistency-check.ts
```

Expected: four `OK` lines, exit code 0. This is the verification for the "completed
audit with permanently missing report/metrics" requirement — done entirely in memory,
no database row involved, so there's no need to fabricate an inconsistent row live.

- [ ] **Step 3: Create and confirm two test users, and an owned audit fixture**

Two throwaway users (owner and a second, unrelated user), created via `generateLink`
and then confirmed via `verifyOtp` — this project's established technique for creating a
real, confirmed Supabase Auth user without a real inbox. `verifyOtp` also returns a live
session, whose `access_token` is captured here **only** for Step 14's cleanup (`admin.signOut`
requires an actual JWT, not a user id — there is no admin API to revoke sessions by user
id alone). Actual test logins later in this task go through the real `/login` form in
Playwright, not this captured token. One fully completed audit is created for the owner
via the same `createAudit`/`saveScan`/`completeAudit` functions the real worker calls
(not raw SQL), plus one unpaid audit for checkout testing:

```bash
cat > /tmp/setup-fixtures.ts <<'EOF'
import { getSupabaseAdmin } from "/app/src/lib/db/client";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createAudit, saveScan, completeAudit } from "/app/src/lib/db/audits";

const PASSWORD = "Test-password-1!";

async function makeConfirmedUser(email: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({ type: "signup", email, password: PASSWORD });
  if (error) throw error;
  const anon = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ type: "signup", token_hash: data.properties.hashed_token });
  if (verifyError) throw verifyError;
  return { userId: verified.user!.id, email, accessToken: verified.session!.access_token };
}

async function main() {
  const stamp = Date.now();
  const owner = await makeConfirmedUser(`access-owner-${stamp}@example.com`);
  const other = await makeConfirmedUser(`access-other-${stamp}@example.com`);

  const completed = await createAudit("https://example.com", "https://example.com/", "get-leads", owner.userId);
  await saveScan(completed.id, {
    url: "https://example.com/", title: "Example", metaDescription: "Example domain",
    headings: [{ level: 1, text: "Example Domain" }], visibleText: "Example Domain.",
    ctas: [], ctaJourneys: [], links: [], forms: [],
    aboveFold: { text: "Example Domain", ctas: [], imageCount: 0 },
    landmarks: { hasNav: false, hasFooter: false, hasMain: true },
    trustSignals: [], domSummary: { elements: 10, images: 0, buttons: 0, links: 0, forms: 0 },
    cookieBanner: { detected: false, dismissed: false },
  }, {
    performanceScore: 90, accessibilityScore: 90, seoScore: 90, bestPracticesScore: 90,
    lcp: 1200, cls: 0.01, inpOrTbt: 50, ttfb: 200, imageIssues: [], renderBlockingResources: 0, scriptWeightBytes: 1000,
  }, { desktop: "test-fixture-desktop.png", mobile: "test-fixture-mobile.png" });
  await completeAudit(completed.id, {
    overallScore: 90, executiveSummary: "Test fixture report for access control verification.",
    priorities: [], sections: [], copySuggestions: [], quickWins: [], longTermImprovements: [],
  });

  const unpaid = await createAudit("https://example.org", "https://example.org/", "get-leads", owner.userId);

  console.log(JSON.stringify({ owner, other, completedAuditId: completed.id, unpaidAuditId: unpaid.id }, null, 2));
}

main();
EOF
docker compose run --rm -v /tmp/setup-fixtures.ts:/tmp/setup-fixtures.ts web npx tsx /tmp/setup-fixtures.ts
```

Record the full JSON output: `owner.userId`, `owner.email`, `owner.accessToken`,
`other.userId`, `other.email`, `other.accessToken`, `completedAuditId`, `unpaidAuditId`.
The password for both users is `Test-password-1!` (used to log in via the real
`/login` form below).

- [ ] **Step 4: Owner — page, status API, checkout (spec test 1)**

Via Playwright: `browser_navigate` to `http://localhost:3100/login`, fill in
`owner.email` / `Test-password-1!`, submit. Navigate to
`http://localhost:3100/audits/{completedAuditId}` — confirm `ReportView` renders (a
`browser_snapshot` shows the report content, not a redirect, not a 404). Navigate to
`http://localhost:3100/audits/{unpaidAuditId}` — confirm the "Payment required" state
renders. Then `browser_evaluate`, in the page:

```js
async () => {
  const res = await fetch('/api/audits/{unpaidAuditId}', { cache: 'no-store' });
  return { status: res.status, body: await res.json() };
}
```

Confirm `status: 200` and the body is exactly `{id, status, paid, errorMessage}` — no
`url`, `page`, `metrics`, `report`, `userId`, `stripeCheckoutSessionId`, or any other
field. Click "Complete payment" (or run the equivalent `fetch('/api/checkout', {method:
'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({auditId:
'{unpaidAuditId}'})})` via `browser_evaluate`) — confirm a Stripe Checkout URL is
returned and it resolves to a real Stripe Test Mode checkout page.

- [ ] **Step 5: Second authenticated user (spec test 2)**

Via Playwright (a fresh browser context, or logged out then back in): log in as
`other.email` / `Test-password-1!` via the real `/login` form. Navigate to
`http://localhost:3100/audits/{unpaidAuditId}` (the owner's audit) — confirm the Next.js
not-found page renders. Via `browser_evaluate`:

```js
async () => {
  const status = await fetch('/api/audits/{unpaidAuditId}', { cache: 'no-store' }).then(r => r.status);
  const checkoutStatus = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auditId: '{unpaidAuditId}' }) }).then(r => r.status);
  return { status, checkoutStatus };
}
```

Confirm both are `404`. Then confirm no session was written:

```bash
docker compose run --rm web npx tsx -e "
import { getSupabaseAdmin } from '/app/src/lib/db/client';
getSupabaseAdmin().from('audits').select('stripe_checkout_session_id').eq('id', '{unpaidAuditId}').maybeSingle().then(({data}) => console.log(data));
"
```

Confirm `stripe_checkout_session_id` is still `null`.

- [ ] **Step 6: Anonymous (spec test 3)**

Plain `curl`, no cookies:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/audits/{unpaidAuditId}
```

Expected: a redirect response (`307`/`308` to `/login`) or, if following redirects,
confirm the final URL is `/login` (`curl -s -o /dev/null -w "%{redirect_url}\n"`).

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/api/audits/{unpaidAuditId}
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3100/api/checkout -H "content-type: application/json" -d "{\"auditId\":\"{unpaidAuditId}\"}"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3100/api/audits -H "content-type: application/json" -d '{"url":"https://a-made-up-test-host.invalid","pageGoal":"get-leads"}'
```

Expected: `401`, `401`, `401`. For the last one, also confirm no DNS/SSRF validation was
attempted: `docker compose logs web --since 1m | grep -i "made-up-test-host"` should
return nothing, since the route now returns 401 before ever calling `assertSafeUrl`.

- [ ] **Step 7: Legacy `user_id = null` audit (spec test 4)**

Anonymous: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/api/audits/LEGACY_AUDIT_ID_PLACEHOLDER` → expect `401`.

Authenticated (reuse the owner's Playwright session from Step 4, or log in again):
navigate to `http://localhost:3100/audits/LEGACY_AUDIT_ID_PLACEHOLDER` — confirm 404,
never the report. Via `browser_evaluate`, `fetch('/api/audits/LEGACY_AUDIT_ID_PLACEHOLDER')` → confirm `404`.

- [ ] **Step 8: `/audits/demo` (spec test 5)**

Plain `curl`, no cookies: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/audits/demo` → expect `200`. Via Playwright, navigate there and confirm the full demo report renders, unaffected.

- [ ] **Step 9: Owner, two tabs (spec test 6)**

As the owner (Step 4's session, or a fresh login), open a second tab in the same
browser context (`browser_tabs`) on `http://localhost:3100/audits/{unpaidAuditId}` — if
Step 4 already paid this one, create a fresh unpaid audit for the owner first via the
Step 3 setup script's `createAudit` call (same pattern, new URL). In both tabs, within a
few seconds of each other, run the checkout `fetch` from Step 4 via `browser_evaluate`.
Confirm both calls return the same Stripe Checkout URL/session id, and re-run the
`stripe_checkout_session_id` read from Step 5 (pointed at this audit) to confirm only
one value was ever written — no second payable session.

- [ ] **Step 10: Session expires mid-poll (spec test 7)**

As the owner, log in via `/login`, then navigate to a `pending`/`running` audit —
create a fresh one via the Step 3 setup script's `createAudit` call (owner id, no
`saveScan`/`completeAudit`, so it stays `"pending"`). While `AuditPending` is actively
polling, clear cookies via `page.context().clearCookies()`. Within one polling interval
(~3s), confirm: the browser navigates to `/login`. Then attempt `page.goBack()` and
confirm it does **not** return to the audit page (proving `router.replace` was used, not
`push`) — Back should either stay on `/login` or go further back in history, never to
`/audits/{id}`. Confirm the audit was never shown in a `"failed"` state during this
sequence.

- [ ] **Step 11: `typecheck`/`lint`/`build` (spec test 10)**

```bash
docker compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"
```

Expected: all three succeed.

- [ ] **Step 12: Audit created via `POST /api/audits` while authenticated (spec test 9)**

As the owner (logged in via `/login`), via `browser_evaluate`:

```js
async () => {
  const res = await fetch('/api/audits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.net', pageGoal: 'get-leads' }) });
  return { status: res.status, body: await res.json() };
}
```

Confirm `status: 202`, record the returned `id`, then confirm its `user_id` matches the owner:

```bash
docker compose run --rm web npx tsx -e "
import { getSupabaseAdmin } from '/app/src/lib/db/client';
getSupabaseAdmin().from('audits').select('user_id').eq('id', '<new id>').maybeSingle().then(({data}) => console.log(data));
"
```

- [ ] **Step 13: List every test id created this task**

Before cleanup, write down: `owner.userId`, `other.userId`, and every audit id created
in Steps 3, 9, 10, 12 (completed, unpaid, the Step 9 fresh unpaid one if created, the
Step 10 fresh pending one, the Step 12 POST-created one), plus
`LEGACY_AUDIT_ID_PLACEHOLDER` from Task 1. Confirm this list against what actually got
created before deleting anything.

- [ ] **Step 14: Clean up — sessions, users, audits**

Revoke each test user's session before deleting the user record, using the
`access_token` captured in Step 3 — deleting the user alone does not guarantee an
already-issued JWT is invalidated immediately, since Supabase access tokens are
self-contained and valid until they expire regardless of whether the user record still
exists. `admin.signOut` requires the token itself (there is no admin API to revoke by
user id alone):

```bash
docker compose run --rm web npx tsx -e "
import { getSupabaseAdmin } from '/app/src/lib/db/client';
const admin = getSupabaseAdmin();
async function cleanupUser(userId: string, accessToken: string) {
  try { await admin.auth.admin.signOut(accessToken, 'global'); } catch (e) { console.error('signOut failed (deleting anyway)', userId, e); }
  await admin.auth.admin.deleteUser(userId);
}
Promise.all([
  cleanupUser('<owner.userId>', '<owner.accessToken>'),
  cleanupUser('<other.userId>', '<other.accessToken>'),
]).then(() => console.log('users cleaned'));
"
```

Then delete every test audit row by id (parameterized deletes via the admin client —
tidying up rows created through tested application functions, not raw SQL, not
fabricating test conditions):

```bash
docker compose run --rm web npx tsx -e "
import { getSupabaseAdmin } from '/app/src/lib/db/client';
const ids = ['<completedAuditId>', '<unpaidAuditId>', '<any Step 9/10/12 ids>', 'LEGACY_AUDIT_ID_PLACEHOLDER'];
getSupabaseAdmin().from('audits').delete().in('id', ids).then(({error}) => { if (error) throw error; console.log('audits cleaned'); });
"
```

Declare here, in the commit message for this step, every Stripe Test Mode session id
that was created during Steps 4 and 9 (there should be at most two distinct ids, since
Step 9's double-tab test is specifically checking that no second one was created).

- [ ] **Step 15: Tear down**

```bash
docker compose down
rm -f docker-compose.override.yml /tmp/consistency-check.ts /tmp/setup-fixtures.ts
git status --short
```

Expected: clean working tree (only the Task 1 plan-file edit and Tasks 2–8's code
commits present in history; nothing uncommitted, `docker-compose.override.yml` gone).

- [ ] **Step 16: Report results**

Summarize pass/fail for every step above, the Stripe Test Mode session ids created and
confirmed as cleaned up (Stripe test sessions expire on their own and don't need
separate deletion), and confirm final `git log` / `git status`.
