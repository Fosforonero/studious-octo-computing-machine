# Sprint B: Pending URL Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an anonymous visitor submit a URL at a new, unlinked `/start` page, gate audit creation behind signup/login, and — once authenticated — automatically create the audit tied to their real `user_id`, with no duplicates under refresh/double-submit/concurrent races.

**Architecture:** A new httpOnly cookie bridges the gap between anonymous URL submission and having a verified session. A single shared function, `claimPendingAudit(userId)`, is called from both existing post-auth success paths (`/login`, `/auth/confirm`) and does the entire read → validate → insert-or-fetch → ownership-check → clear sequence. Duplicate-claim safety comes from a database-level compare-and-swap (an explicit-id insert with conflict-fetch, plus a conditional `UPDATE ... WHERE user_id IS NULL`) — never from trusting the cookie's own content.

**Tech Stack:** Next.js 16.2.10 App Router, TypeScript, Supabase (existing `getSupabaseAdmin()` service-role client and `@supabase/ssr` auth client from Sprint A), `node:crypto`'s `randomUUID`.

**Full spec:** `docs/superpowers/specs/2026-07-09-sprint-b-pending-url-claim-design.md`

**Verification note:** No unit test runner in this project — verification is `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"` plus scripted functional checks against the real Supabase project, reusing the `generateLink`-driven no-email-inbox technique established in Sprint A's plan.

## Global Constraints

- Docker-only verification: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`.
- The pending-audit cookie is **never trusted beyond shape validation** — no HMAC signing; `auditId` must be UUID v4 shaped, `pageGoal` must be one of `get-leads`, `book-demos`, `sell`, `signups`, `inform`, and the URL is always re-validated live via `assertSafeUrl` at claim time.
- An audit already existing at the claimed id may only be treated as this user's own if its `user_id` already equals the current session's `user_id`, or its `user_id` is `null` **and** a conditional `UPDATE ... WHERE user_id IS NULL` wins the claim — enforced by the database, never by trusting the cookie or an unconditional `UPDATE`. Every other case is silently dropped; **never** redirect to an audit that isn't confirmed to belong to the current user.
- `claimPendingAudit()` is only ever called *after* `getClaims()`/`signInWithPassword`/`verifyOtp` has confirmed a real, verified session — never before.
- No new RLS policies. No changes to Stripe, the worker, or the home page (`src/app/page.tsx` stays the locked-down coming-soon page). `/start` is a separate, unlinked route.
- The default behavior of the existing `AuditForm` component (used today by the dormant, unrelated `full-landing-page.tsx`) must not change — any extension to it must be additive and backward compatible.
- Commit after each task (scoped `git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit`).

---

### Task 1: `createAudit` explicit id + conflict handling, `claimAuditOwnership`, `userId` on `AuditRecord`

**Files:**
- Modify: `src/lib/audit/types.ts`
- Modify: `src/lib/audit/demo.ts`
- Modify: `src/lib/db/audits.ts`

**Interfaces:**
- Produces: `AuditRecord.userId: string | null` (new field).
- Produces: `createAudit(url: string, normalizedUrl: string, pageGoal: string, userId?: string | null, id?: string): Promise<AuditRecord>` — when `id` is provided and the insert conflicts (Postgres `23505`), fetches and returns the existing row instead of throwing. Never inspects or acts on `user_id` beyond returning it — ownership decisions belong to the caller.
- Produces: `claimAuditOwnership(auditId: string, userId: string): Promise<boolean>` — conditional `UPDATE ... WHERE user_id IS NULL`, same shape as the existing `claimCheckoutSession`.

- [ ] **Step 1: Add `userId` to `AuditRecord`**

In `src/lib/audit/types.ts`, add one field to the interface (immediately after `stripeCheckoutSessionId` to match insertion order elsewhere in the file):

```ts
export interface AuditRecord {
  id: string;
  url: string;
  normalizedUrl: string;
  pageGoal: string;
  status: AuditStatus;
  paid: boolean;
  stripeCheckoutSessionId: string | null;
  userId: string | null;
  overallScore: number | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  page?: ExtractedPage;
  metrics?: AuditMetrics;
  report?: FinalReport;
}
```

- [ ] **Step 2: Add `userId: null` to the demo fixture**

In `src/lib/audit/demo.ts`, the `demoAudit` object's top-level fields currently include `stripeCheckoutSessionId: (row.stripe_checkout_session_id as string | null) ?? null` — no, that's in `mapAudit`. In `demo.ts` itself, find the line starting `id: "demo", url: ...` and add `userId: null,` right after the existing `paid: true,` (or wherever fields are listed — match the file's existing single-line object style):

```ts
  id: "demo", url: "https://northstar.example", normalizedUrl: "https://northstar.example/", pageGoal: "Drive signups", status: "completed", paid: true, userId: null, overallScore: 68, createdAt: "2026-07-06T08:42:00.000Z", completedAt: "2026-07-06T08:44:12.000Z", errorMessage: null,
```

(Read the file first to get the exact current line — this is a required field addition, not a rewrite of the rest of the object.)

- [ ] **Step 3: Update `mapAudit` and `createAudit` in `src/lib/db/audits.ts`**

Current:
```ts
function mapAudit(row: Record<string, unknown>): AuditRecord {
  return { id: String(row.id), url: String(row.url), normalizedUrl: String(row.normalized_url), pageGoal: String(row.page_goal ?? "Not specified"), status: row.status as AuditRecord["status"], paid: Boolean(row.paid), stripeCheckoutSessionId: (row.stripe_checkout_session_id as string | null) ?? null, overallScore: row.overall_score as number | null, createdAt: String(row.created_at), completedAt: row.completed_at as string | null, errorMessage: row.error_message as string | null };
}

export async function createAudit(url: string, normalizedUrl: string, pageGoal: string, userId: string | null = null) {
  const { data, error } = await getSupabaseAdmin().from("audits").insert({ url, normalized_url: normalizedUrl, page_goal: pageGoal, status: "pending", user_id: userId }).select("*").single();
  if (error) throw error;
  return mapAudit(data);
}
```

New:
```ts
function mapAudit(row: Record<string, unknown>): AuditRecord {
  return { id: String(row.id), url: String(row.url), normalizedUrl: String(row.normalized_url), pageGoal: String(row.page_goal ?? "Not specified"), status: row.status as AuditRecord["status"], paid: Boolean(row.paid), stripeCheckoutSessionId: (row.stripe_checkout_session_id as string | null) ?? null, userId: (row.user_id as string | null) ?? null, overallScore: row.overall_score as number | null, createdAt: String(row.created_at), completedAt: row.completed_at as string | null, errorMessage: row.error_message as string | null };
}

export async function createAudit(url: string, normalizedUrl: string, pageGoal: string, userId: string | null = null, id?: string) {
  const payload: Record<string, unknown> = { url, normalized_url: normalizedUrl, page_goal: pageGoal, status: "pending", user_id: userId };
  if (id) payload.id = id;
  const { data, error } = await getSupabaseAdmin().from("audits").insert(payload).select("*").single();
  if (error) {
    if (error.code === "23505" && id) {
      const existing = await getAudit(id);
      if (existing) return existing;
    }
    throw error;
  }
  return mapAudit(data);
}
```

(`getAudit` is declared later in the same file as another `export async function` — safe to call here since function declarations are hoisted.)

- [ ] **Step 4: Add `claimAuditOwnership`**

Add this new function anywhere after `claimCheckoutSession` in `src/lib/db/audits.ts` (same file, matching its exact CAS shape):

```ts
// Conditional claim: only succeeds if the audit is still unowned, so a forged or
// stale pending-audit cookie can never reassign an audit that already belongs to
// someone else — see claimPendingAudit in src/lib/audit/pending-claim.ts.
export async function claimAuditOwnership(auditId: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("audits").update({ user_id: userId }).eq("id", auditId).is("user_id", null).select("id");
  if (error) throw error;
  return Boolean(data && data.length > 0);
}
```

- [ ] **Step 5: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green — `userId` is a new required field, so every other place that constructs an `AuditRecord` literal (only `demo.ts`) must already compile; nothing else in the codebase currently builds an `AuditRecord` by hand.

- [ ] **Step 6: Commit**

```bash
git add src/lib/audit/types.ts src/lib/audit/demo.ts src/lib/db/audits.ts
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add userId to AuditRecord, explicit-id conflict handling to createAudit, and claimAuditOwnership"
```

---

### Task 2: Pending-audit cookie module + `claimPendingAudit`

**Files:**
- Create: `src/lib/audit/pending-claim.ts`

**Interfaces:**
- Consumes: `createAudit`, `claimAuditOwnership`, `getAudit` from `src/lib/db/audits.ts` (Task 1); `assertSafeUrl` from `src/lib/security/url.ts`.
- Produces: `PAGE_GOALS: readonly string[]`, `type PageGoal`, `setPendingAuditCookie({ auditId, url, pageGoal }): Promise<void>`, `clearPendingAuditCookie(): Promise<void>`, `type ClaimResult = { status: "claimed"; auditId: string } | { status: "invalid-url" } | { status: "none" }`, `claimPendingAudit(userId: string): Promise<ClaimResult>`.

- [ ] **Step 1: Write the module**

```ts
// src/lib/audit/pending-claim.ts
import { cookies } from "next/headers";
import { createAudit, claimAuditOwnership, getAudit } from "@/lib/db/audits";
import { assertSafeUrl } from "@/lib/security/url";

const COOKIE_NAME = "lensiq_pending_audit";
const COOKIE_MAX_AGE = 60 * 60 * 2;

export const PAGE_GOALS = ["get-leads", "book-demos", "sell", "signups", "inform"] as const;
export type PageGoal = (typeof PAGE_GOALS)[number];

interface PendingAudit {
  auditId: string;
  url: string;
  pageGoal: PageGoal;
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge, path: "/" };
}

export async function setPendingAuditCookie(pending: PendingAudit) {
  const store = await cookies();
  const value = Buffer.from(JSON.stringify(pending)).toString("base64url");
  store.set(COOKIE_NAME, value, cookieOptions(COOKIE_MAX_AGE));
}

export async function clearPendingAuditCookie() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", cookieOptions(0));
}

function parsePendingAuditCookie(raw: string): PendingAudit | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<PendingAudit>;
    if (typeof parsed.auditId !== "string" || !UUID_V4_RE.test(parsed.auditId)) return null;
    if (typeof parsed.url !== "string" || parsed.url.length === 0) return null;
    if (typeof parsed.pageGoal !== "string" || !PAGE_GOALS.includes(parsed.pageGoal as PageGoal)) return null;
    return { auditId: parsed.auditId, url: parsed.url, pageGoal: parsed.pageGoal as PageGoal };
  } catch {
    return null;
  }
}

export type ClaimResult = { status: "claimed"; auditId: string } | { status: "invalid-url" } | { status: "none" };

export async function claimPendingAudit(userId: string): Promise<ClaimResult> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return { status: "none" };

  const pending = parsePendingAuditCookie(raw);
  if (!pending) {
    await clearPendingAuditCookie();
    return { status: "none" };
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = await assertSafeUrl(pending.url);
  } catch {
    await clearPendingAuditCookie();
    return { status: "invalid-url" };
  }

  const audit = await createAudit(pending.url, normalizedUrl, pending.pageGoal, userId, pending.auditId);

  if (audit.userId === userId) {
    await clearPendingAuditCookie();
    return { status: "claimed", auditId: audit.id };
  }

  if (audit.userId === null) {
    const won = await claimAuditOwnership(audit.id, userId);
    if (won) {
      await clearPendingAuditCookie();
      return { status: "claimed", auditId: audit.id };
    }
    const refetched = await getAudit(audit.id);
    await clearPendingAuditCookie();
    if (refetched?.userId === userId) return { status: "claimed", auditId: audit.id };
    return { status: "none" };
  }

  await clearPendingAuditCookie();
  return { status: "none" };
}
```

Note on the `audit.userId === userId` branch: this covers both a genuinely fresh insert (no conflict — `createAudit` set `user_id` to `userId` directly) and a same-user race where a concurrent request already won the insert with this same `userId`. Both cases are indistinguishable and correctly handled identically, exactly as described in the spec's step 3/4a.

- [ ] **Step 2: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green (this module isn't imported anywhere yet, so this only confirms it compiles standalone).

- [ ] **Step 3: Commit**

```bash
git add src/lib/audit/pending-claim.ts
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add pending-audit cookie module and claimPendingAudit"
```

---

### Task 3: Extend `AuditForm` with an optional `onSubmit`/`helperText` (backward compatible)

**Files:**
- Modify: `src/components/landing/audit-form.tsx`

**Interfaces:**
- Modifies: `AuditForm({ compact, onSubmit, helperText, ctaLabel })` — `onSubmit?: (url: string, pageGoal: string) => Promise<{ redirect: string } | { error: string }>`, `helperText?: string`, and `ctaLabel?: string` (default `"Run free audit"`) are all new, optional props. When none are passed, behavior and copy are byte-for-byte identical to today (posts to `/api/audits`, same redirect/checkout logic, same button/helper text) — the existing consumer, `src/components/landing/full-landing-page.tsx`, passes none of them and is completely unaffected.

- [ ] **Step 1: Read the current file, then rewrite it**

Current content (for reference — read the actual file first, this may have drifted):
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AuditForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pageGoal, setPageGoal] = useState("get-leads");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/audits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, pageGoal }) });
      const data = await response.json() as { id?: string; error?: string; checkoutUrl?: string | null };
      if (!response.ok || !data.id) throw new Error(data.error ?? "Could not start the audit.");
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else router.push(`/audits/${data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setPending(false);
    }
  }

  return <form onSubmit={submit} className={compact ? "w-full" : "mx-auto w-full max-w-3xl"}>
    <div className="flex flex-col gap-2 rounded-[1.35rem] bg-white p-2 shadow-2xl shadow-black/20 md:flex-row md:rounded-full">
      <Input aria-label="Website URL" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourwebsite.com" className="h-13 flex-1 border-0 bg-transparent text-foreground focus:ring-0" />
      <label className="sr-only" htmlFor={`page-goal-${compact ? "compact" : "full"}`}>Primary page goal</label>
      <select id={`page-goal-${compact ? "compact" : "full"}`} value={pageGoal} onChange={(event) => setPageGoal(event.target.value)} className="h-13 rounded-full border-0 bg-[#f0f2f8] px-5 text-sm font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:max-w-48">
        <option value="get-leads">Get leads</option>
        <option value="book-demos">Book demos</option>
        <option value="sell">Sell a product</option>
        <option value="signups">Drive signups</option>
        <option value="inform">Explain / inform</option>
      </select>
      <Button size="lg" className="h-13 shrink-0" disabled={pending} aria-label={pending ? "Starting your audit" : undefined}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <>{ctaLabel} <ArrowRight className="size-4" /></>}</Button>
    </div>
    <div className={`mt-3 flex items-center ${error ? "justify-between" : "justify-center"} gap-3 text-xs ${compact ? "text-muted-foreground" : "text-white/55"}`}>
      <span className="inline-flex items-center gap-1.5"><LockKeyhole className="size-3" /> No signup · Homepage only · About 2 minutes</span>
      {error && <span role="alert" className="font-bold text-red-400">{error}</span>}
    </div>
  </form>;
}
```

New content:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type SubmitResult = { redirect: string } | { error: string };

async function defaultSubmit(url: string, pageGoal: string): Promise<SubmitResult> {
  const response = await fetch("/api/audits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, pageGoal }) });
  const data = await response.json() as { id?: string; error?: string; checkoutUrl?: string | null };
  if (!response.ok || !data.id) return { error: data.error ?? "Could not start the audit." };
  return { redirect: data.checkoutUrl ?? `/audits/${data.id}` };
}

export function AuditForm({ compact = false, onSubmit, helperText, ctaLabel = "Run free audit" }: { compact?: boolean; onSubmit?: (url: string, pageGoal: string) => Promise<SubmitResult>; helperText?: string; ctaLabel?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pageGoal, setPageGoal] = useState("get-leads");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await (onSubmit ?? defaultSubmit)(url, pageGoal);
      if ("error" in result) throw new Error(result.error);
      if (result.redirect.startsWith("http")) window.location.href = result.redirect;
      else router.push(result.redirect);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setPending(false);
    }
  }

  return <form onSubmit={submit} className={compact ? "w-full" : "mx-auto w-full max-w-3xl"}>
    <div className="flex flex-col gap-2 rounded-[1.35rem] bg-white p-2 shadow-2xl shadow-black/20 md:flex-row md:rounded-full">
      <Input aria-label="Website URL" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="yourwebsite.com" className="h-13 flex-1 border-0 bg-transparent text-foreground focus:ring-0" />
      <label className="sr-only" htmlFor={`page-goal-${compact ? "compact" : "full"}`}>Primary page goal</label>
      <select id={`page-goal-${compact ? "compact" : "full"}`} value={pageGoal} onChange={(event) => setPageGoal(event.target.value)} className="h-13 rounded-full border-0 bg-[#f0f2f8] px-5 text-sm font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:max-w-48">
        <option value="get-leads">Get leads</option>
        <option value="book-demos">Book demos</option>
        <option value="sell">Sell a product</option>
        <option value="signups">Drive signups</option>
        <option value="inform">Explain / inform</option>
      </select>
      <Button size="lg" className="h-13 shrink-0" disabled={pending} aria-label={pending ? "Starting your audit" : undefined}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <>{ctaLabel} <ArrowRight className="size-4" /></>}</Button>
    </div>
    <div className={`mt-3 flex items-center ${error ? "justify-between" : "justify-center"} gap-3 text-xs ${compact ? "text-muted-foreground" : "text-white/55"}`}>
      <span className="inline-flex items-center gap-1.5"><LockKeyhole className="size-3" /> {helperText ?? "No signup · Homepage only · About 2 minutes"}</span>
      {error && <span role="alert" className="font-bold text-red-400">{error}</span>}
    </div>
  </form>;
}
```

- [ ] **Step 2: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green. `full-landing-page.tsx`'s existing `<AuditForm />`/`<AuditForm compact />` calls pass neither new prop, so `onSubmit` defaults via `(onSubmit ?? defaultSubmit)` and `helperText` defaults via `??` — behavior unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/audit-form.tsx
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Make AuditForm's submit target and helper text overridable, defaulting to today's behavior"
```

---

### Task 4: `/start` page and `startAudit` Server Action

**Files:**
- Create: `src/app/start/actions.ts`
- Create: `src/app/start/page.tsx`

**Interfaces:**
- Consumes: `createClient` from `src/lib/supabase/server.ts`; `createAudit` from `src/lib/db/audits.ts`; `assertSafeUrl` from `src/lib/security/url.ts`; `setPendingAuditCookie`, `PAGE_GOALS` from `src/lib/audit/pending-claim.ts` (Task 2); `AuditForm` from Task 3.
- Produces: `startAudit(url: string, pageGoal: string): Promise<{ redirect: string } | { error: string }>` — passed directly to `AuditForm`'s `onSubmit` prop and invoked as a plain async function from client code (a Server Action can be called this way, not only via `<form action>`).

- [ ] **Step 1: Write the Server Action**

```ts
// src/app/start/actions.ts
"use server";

import { randomUUID } from "node:crypto";
import { createAudit } from "@/lib/db/audits";
import { assertSafeUrl } from "@/lib/security/url";
import { setPendingAuditCookie, PAGE_GOALS, type PageGoal } from "@/lib/audit/pending-claim";
import { createClient } from "@/lib/supabase/server";

export async function startAudit(url: string, pageGoal: string): Promise<{ redirect: string } | { error: string }> {
  if (!PAGE_GOALS.includes(pageGoal as PageGoal)) return { error: "Choose a valid page goal." };

  let normalizedUrl: string;
  try {
    normalizedUrl = await assertSafeUrl(url);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Enter a valid website URL." };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = (claims?.claims.sub as string | undefined) ?? null;

  if (userId) {
    try {
      const audit = await createAudit(url, normalizedUrl, pageGoal, userId);
      return { redirect: `/audits/${audit.id}` };
    } catch {
      return { error: "Could not start the audit. Please try again." };
    }
  }

  await setPendingAuditCookie({ auditId: randomUUID(), url, pageGoal: pageGoal as PageGoal });
  return { redirect: "/signup" };
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/start/page.tsx
import { AuditForm } from "@/components/landing/audit-form";
import { startAudit } from "./actions";

export default function StartPage() {
  return (
    <main className="hero-glow grid-noise min-h-screen px-5 py-16 text-white">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="display text-4xl md:text-5xl">Start your audit</h1>
        <p className="mt-4 text-white/70">Enter your website below.</p>
        <div className="mt-10">
          <AuditForm onSubmit={startAudit} helperText="We'll ask you to create a free account before the audit starts." ctaLabel="Start my audit" />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green, `/start` listed in the build's route table.

- [ ] **Step 4: Commit**

```bash
git add src/app/start/
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add /start page: public URL input, immediate audit if authenticated, pending cookie + signup redirect otherwise"
```

---

### Task 5: Wire `claimPendingAudit` into `/login`

**Files:**
- Modify: `src/app/login/actions.ts`

**Interfaces:**
- Consumes: `claimPendingAudit` from `src/lib/audit/pending-claim.ts` (Task 2).

- [ ] **Step 1: Update the action**

Current:
```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

  redirect("/dashboard");
}
```

New:
```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { claimPendingAudit } from "@/lib/audit/pending-claim";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

  const claim = await claimPendingAudit(data.user.id);
  if (claim.status === "claimed") redirect(`/audits/${claim.auditId}`);
  if (claim.status === "invalid-url") redirect(`/dashboard?error=${encodeURIComponent("We couldn't start an audit for that website. Please try again.")}`);
  redirect("/dashboard");
}
```

- [ ] **Step 2: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/actions.ts
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Claim any pending audit after a successful login"
```

---

### Task 6: Wire `claimPendingAudit` into `/auth/confirm`

**Files:**
- Modify: `src/app/auth/confirm/route.ts`

**Interfaces:**
- Consumes: `claimPendingAudit` from `src/lib/audit/pending-claim.ts` (Task 2).

- [ ] **Step 1: Update the route handler**

Current:
```ts
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const redirectTo = request.nextUrl.clone();
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirectTo.pathname = "/dashboard";
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = "/login";
  redirectTo.searchParams.set("error", "This confirmation link is invalid or has expired.");
  return NextResponse.redirect(redirectTo);
}
```

New:
```ts
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { claimPendingAudit } from "@/lib/audit/pending-claim";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const redirectTo = request.nextUrl.clone();
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");

  if (token_hash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error && data.user) {
      const claim = await claimPendingAudit(data.user.id);
      if (claim.status === "claimed") {
        redirectTo.pathname = `/audits/${claim.auditId}`;
        return NextResponse.redirect(redirectTo);
      }
      redirectTo.pathname = "/dashboard";
      if (claim.status === "invalid-url") redirectTo.searchParams.set("error", "We couldn't start an audit for that website. Please try again.");
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = "/login";
  redirectTo.searchParams.set("error", "This confirmation link is invalid or has expired.");
  return NextResponse.redirect(redirectTo);
}
```

- [ ] **Step 2: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/confirm/route.ts
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Claim any pending audit after email confirmation"
```

---

### Task 7: `/dashboard` error banner

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Update the page**

Current:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  const email = data.claims.email as string;

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-4 text-sm">Logged in as {email}</p>
      <form action={logout} className="mt-8">
        <button type="submit" className="rounded border px-4 py-2 text-sm font-bold">Log out</button>
      </form>
    </main>
  );
}
```

New:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) redirect("/login");

  const email = data.claims.email as string;

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      {error && <p role="alert" className="mt-4 text-sm font-bold text-red-600">{error}</p>}
      <p className="mt-4 text-sm">Logged in as {email}</p>
      <form action={logout} className="mt-8">
        <button type="submit" className="rounded border px-4 py-2 text-sm font-bold">Log out</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Show an optional error banner on /dashboard for a failed pending-audit claim"
```

---

### Task 8: Full functional verification

**Files:** none created or committed — every check runs against the live Supabase project via `docker-compose exec -T web node --input-type=module -`, reusing the Sprint A technique (piped stdin, no file ever written, no token/secret ever printed — only booleans and derived facts).

- [ ] **Step 1: Bring the stack up**

Check for port conflicts first (`docker ps` — port 3000 may be held by an unrelated project on this machine, as it was during Sprint A; if so, recreate the local-only override):

```bash
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E ':3000->'
```

If occupied, create `docker-compose.override.yml` (project root, never committed):
```yaml
services:
  web:
    ports: !override
      - "3100:3000"
```

Then: `docker-compose up -d web worker` (worker included so Task 8's final Stripe/worker sanity check has something to observe, exactly as in Sprint A).

- [ ] **Step 2: Anonymous submit → cookie set → redirect to /signup**

```bash
docker-compose exec -T web node --input-type=module - <<'NODE_EOF'
const res = await fetch("http://localhost:3000/start", { redirect: "manual" });
console.log("start page reachable:", res.status === 200);
NODE_EOF
```
Expected: `start page reachable: true`. (The Server Action itself is exercised end-to-end in Step 3 below, since driving a Server Action directly over raw HTTP requires replicating Next's action-invocation protocol — simpler and more faithful to test it through the full signup flow next.)

- [ ] **Step 3: Full anonymous → signup → confirm → claimed flow**

```bash
docker-compose exec -T web node --input-type=module - <<'NODE_EOF'
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = "http://localhost:3000";
const email = `sprint-b-verify+${Date.now()}@example.com`;
const password = "verify-sprint-b-temp-pw";
const auditId = randomUUID();
const targetUrl = "https://example.com";

// Simulate what setPendingAuditCookie() writes, without importing Next internals.
const cookiePayload = Buffer.from(JSON.stringify({ auditId, url: targetUrl, pageGoal: "inform" })).toString("base64url");
const pendingCookie = `lensiq_pending_audit=${cookiePayload}`;

const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "signup", email, password });
if (linkError) { console.log("generateLink failed:", linkError.message); process.exit(1); }
const userId = linkData.user.id;

const confirmRes = await fetch(`${base}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=email`, {
  headers: { cookie: pendingCookie },
  redirect: "manual",
});
const location = confirmRes.headers.get("location") ?? "";
console.log("confirm redirected to the claimed audit:", location.includes(`/audits/${auditId}`));

const setCookies = confirmRes.headers.getSetCookie?.() ?? [];
console.log("pending cookie cleared:", setCookies.some((c) => c.startsWith("lensiq_pending_audit=;") || /lensiq_pending_audit=;\s*.*max-age=0/i.test(c)));

const { data: auditRow } = await admin.from("audits").select("id, user_id, url").eq("id", auditId).maybeSingle();
console.log("audit created with correct id:", Boolean(auditRow));
console.log("audit user_id matches the new user:", auditRow?.user_id === userId);
console.log("audit url matches:", auditRow?.url === targetUrl);

await admin.from("audits").delete().eq("id", auditId);
await admin.auth.admin.deleteUser(userId);
console.log("cleanup done");
NODE_EOF
```
Expected: every boolean line `true`.

- [ ] **Step 4: Concurrent double-claim of the same pending cookie does not duplicate**

```bash
docker-compose exec -T web node --input-type=module - <<'NODE_EOF'
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = "http://localhost:3000";
const email = `sprint-b-race+${Date.now()}@example.com`;
const password = "verify-sprint-b-temp-pw";
const auditId = randomUUID();
const cookiePayload = Buffer.from(JSON.stringify({ auditId, url: "https://example.com", pageGoal: "inform" })).toString("base64url");
const pendingCookie = `lensiq_pending_audit=${cookiePayload}`;

const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "signup", email, password });
if (error) { console.log("generateLink failed:", error.message); process.exit(1); }
const userId = linkData.user.id;
const confirmUrl = `${base}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=email`;

// Fire the exact same confirm request twice concurrently — Supabase's verifyOtp
// itself may only let one succeed, so this also exercises createAudit's own
// 23505-conflict path if both happen to reach it.
const [a, b] = await Promise.all([
  fetch(confirmUrl, { headers: { cookie: pendingCookie }, redirect: "manual" }),
  fetch(confirmUrl, { headers: { cookie: pendingCookie }, redirect: "manual" }),
]);
console.log("both requests completed:", a.status < 500 && b.status < 500);

const { data: rows } = await admin.from("audits").select("id").eq("id", auditId);
console.log("exactly one audit row exists:", (rows ?? []).length === 1);

await admin.from("audits").delete().eq("id", auditId);
await admin.auth.admin.deleteUser(userId);
console.log("cleanup done");
NODE_EOF
```
Expected: both booleans `true`.

- [ ] **Step 5: Invalid URL at claim time is handled safely**

```bash
docker-compose exec -T web node --input-type=module - <<'NODE_EOF'
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = "http://localhost:3000";
const email = `sprint-b-badurl+${Date.now()}@example.com`;
const password = "verify-sprint-b-temp-pw";
const auditId = randomUUID();
// A private-IP-literal target that assertSafeUrl already rejects.
const cookiePayload = Buffer.from(JSON.stringify({ auditId, url: "http://127.0.0.1/", pageGoal: "inform" })).toString("base64url");
const pendingCookie = `lensiq_pending_audit=${cookiePayload}`;

const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "signup", email, password });
if (error) { console.log("generateLink failed:", error.message); process.exit(1); }
const userId = linkData.user.id;

const confirmRes = await fetch(`${base}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=email`, {
  headers: { cookie: pendingCookie },
  redirect: "manual",
});
const location = confirmRes.headers.get("location") ?? "";
console.log("redirected to /dashboard with an error, not to any audit:", location.includes("/dashboard") && location.includes("error="));

const { data: rows } = await admin.from("audits").select("id").eq("id", auditId);
console.log("no audit row was created for the unsafe url:", (rows ?? []).length === 0);

await admin.auth.admin.deleteUser(userId);
console.log("cleanup done");
NODE_EOF
```
Expected: both booleans `true`.

- [ ] **Step 6: A cookie referencing another user's existing (non-null `user_id`) audit is never followed**

```bash
docker-compose exec -T web node --input-type=module - <<'NODE_EOF'
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = "http://localhost:3000";

// Victim: a real user with a real audit already owned by them.
const victimEmail = `sprint-b-victim+${Date.now()}@example.com`;
const { data: victimLink, error: victimErr } = await admin.auth.admin.generateLink({ type: "signup", email: victimEmail, password: "verify-sprint-b-temp-pw" });
if (victimErr) { console.log("victim generateLink failed:", victimErr.message); process.exit(1); }
const victimUserId = victimLink.user.id;
const { data: victimAudit } = await admin.from("audits").insert({ url: "https://victim-example.com", normalized_url: "https://victim-example.com/", page_goal: "inform", status: "pending", user_id: victimUserId }).select("id").single();

// Attacker: a different real user, whose pending cookie (forged) points at the victim's audit id.
const attackerEmail = `sprint-b-attacker+${Date.now()}@example.com`;
const { data: attackerLink, error: attackerErr } = await admin.auth.admin.generateLink({ type: "signup", email: attackerEmail, password: "verify-sprint-b-temp-pw" });
if (attackerErr) { console.log("attacker generateLink failed:", attackerErr.message); process.exit(1); }
const attackerUserId = attackerLink.user.id;

const cookiePayload = Buffer.from(JSON.stringify({ auditId: victimAudit.id, url: "https://victim-example.com", pageGoal: "inform" })).toString("base64url");
const pendingCookie = `lensiq_pending_audit=${cookiePayload}`;

const confirmRes = await fetch(`${base}/auth/confirm?token_hash=${attackerLink.properties.hashed_token}&type=email`, {
  headers: { cookie: pendingCookie },
  redirect: "manual",
});
const location = confirmRes.headers.get("location") ?? "";
console.log("attacker NOT redirected to the victim's audit:", !location.includes(`/audits/${victimAudit.id}`));

const { data: recheck } = await admin.from("audits").select("user_id").eq("id", victimAudit.id).maybeSingle();
console.log("victim audit ownership unchanged:", recheck?.user_id === victimUserId);

await admin.from("audits").delete().eq("id", victimAudit.id);
await admin.auth.admin.deleteUser(victimUserId);
await admin.auth.admin.deleteUser(attackerUserId);
console.log("cleanup done");
NODE_EOF
```
Expected: both booleans `true`.

- [ ] **Step 7: A cookie referencing an existing `user_id IS NULL` audit is atomically claimed**

```bash
docker-compose exec -T web node --input-type=module - <<'NODE_EOF'
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = "http://localhost:3000";

// A pre-existing guest audit (no owner yet), exactly like the ordinary guest checkout path produces.
const { data: guestAudit } = await admin.from("audits").insert({ url: "https://guest-example.com", normalized_url: "https://guest-example.com/", page_goal: "inform", status: "pending", user_id: null }).select("id").single();

const email = `sprint-b-nullclaim+${Date.now()}@example.com`;
const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "signup", email, password: "verify-sprint-b-temp-pw" });
if (error) { console.log("generateLink failed:", error.message); process.exit(1); }
const userId = linkData.user.id;

const cookiePayload = Buffer.from(JSON.stringify({ auditId: guestAudit.id, url: "https://guest-example.com", pageGoal: "inform" })).toString("base64url");
const pendingCookie = `lensiq_pending_audit=${cookiePayload}`;

const confirmRes = await fetch(`${base}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=email`, {
  headers: { cookie: pendingCookie },
  redirect: "manual",
});
const location = confirmRes.headers.get("location") ?? "";
console.log("redirected to the now-claimed audit:", location.includes(`/audits/${guestAudit.id}`));

const { data: recheck } = await admin.from("audits").select("user_id").eq("id", guestAudit.id).maybeSingle();
console.log("audit atomically assigned to the claiming user:", recheck?.user_id === userId);

await admin.from("audits").delete().eq("id", guestAudit.id);
await admin.auth.admin.deleteUser(userId);
console.log("cleanup done");
NODE_EOF
```
Expected: both booleans `true`.

- [ ] **Step 8: Already-authenticated submit creates immediately, no cookie**

```bash
docker-compose exec -T web node --input-type=module - <<'NODE_EOF'
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const base = "http://localhost:3000";
const email = `sprint-b-authed+${Date.now()}@example.com`;

const { data: linkData, error } = await admin.auth.admin.generateLink({ type: "signup", email, password: "verify-sprint-b-temp-pw" });
if (error) { console.log("generateLink failed:", error.message); process.exit(1); }
const userId = linkData.user.id;

const confirmRes = await fetch(`${base}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=email`, { redirect: "manual" });
const cookies = (confirmRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

// Directly hit /api/audits with the session cookie — this is the same createAudit
// path startAudit's authenticated branch uses, and confirms the session is real
// before trusting the more roundabout Server-Action-only path.
const auditRes = await fetch(`${base}/api/audits`, { method: "POST", headers: { "content-type": "application/json", cookie: cookies }, body: JSON.stringify({ url: "https://example.com", pageGoal: "inform" }) });
const auditJson = await auditRes.json();
const { data: row } = await admin.from("audits").select("user_id").eq("id", auditJson.id).maybeSingle();
console.log("authenticated submission created an audit with the correct user_id:", row?.user_id === userId);

await admin.from("audits").delete().eq("id", auditJson.id);
await admin.auth.admin.deleteUser(userId);
console.log("cleanup done");
NODE_EOF
```
Expected: the boolean `true`. (This exercises the same `createAudit(..., userId)` call `startAudit`'s authenticated branch makes; `startAudit` itself is a Server Action and isn't directly invokable over raw HTTP the way a Route Handler is, so this is the faithful equivalent per this project's established verification approach.)

- [ ] **Step 9: Worker/Stripe sanity check**

```bash
docker-compose logs worker --tail 20
```
Expected: no new errors — this sprint touches no Stripe/worker files.

- [ ] **Step 10: Final full verification and teardown**

```bash
docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"
docker-compose down
rm -f docker-compose.override.yml
```
Expected: green build listing `/start` alongside every existing route; clean teardown, no leftover override file.

---

### Task 9: Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/pending-url-claim
```

- [ ] **Step 2: Open the PR against `main`**, summarizing per the spec's acceptance criteria — explicitly note: no RLS changes, no Stripe/worker changes, `/start` unlinked from the home page, `AuditForm`'s default behavior unchanged, and which of the spec's test scenarios (including the forged-cookie and null-`user_id` atomic-claim cases) were verified against the real Supabase project.
