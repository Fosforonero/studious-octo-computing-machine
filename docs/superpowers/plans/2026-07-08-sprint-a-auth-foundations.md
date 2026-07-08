# Sprint A: Supabase Auth Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase Auth (email/password, confirmation required) as the minimal foundation the rest of the Lensiq roadmap depends on — signup, login, logout, session handling, one protected route, and audits linkable to a real `user_id` — with zero changes to Stripe/worker code and zero new RLS policies.

**Architecture:** Two independent Supabase clients: the existing service-role client (`getSupabaseAdmin()`, unchanged) for all data reads/writes, and a new anon-key-based server client used exclusively for auth operations (signup, login, logout, session verification) via Server Actions, a Route Handler, and `proxy.ts`. No browser-side Supabase client. No new RLS policies — everything stays server-mediated.

**Tech Stack:** Next.js 16.2.10 App Router, TypeScript, `@supabase/ssr` (new dependency), `@supabase/supabase-js` (already installed, `^2.52.1`), Supabase Postgres/Auth.

**Full spec:** `docs/superpowers/specs/2026-07-08-sprint-a-auth-foundations-design.md`

**Verification note:** This project has no unit test runner (no Jest/Vitest configured) — verification throughout this plan follows the project's existing pattern: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`, plus scripted/manual functional checks against the real Supabase project (as the spec requires — "not just working in theory").

## Global Constraints

- Docker-only verification: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"` (host has no bare npm per project convention).
- Never use `SUPABASE_SERVICE_ROLE_KEY` in the auth client, Server Actions, `proxy.ts`, or any auth-related code path — only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Use `getClaims()` for every authorization decision (verifies the JWT locally against the project's JWKS) — never `getSession()` (unverified cookie read) for that purpose.
- `proxy.ts`'s matcher must match only `/dashboard/:path*` — this means `/login`, `/signup`, `/auth/confirm`, `/api/*`, and all static/asset routes are excluded by construction (not by a negative-lookahead exception list).
- `/dashboard` must independently re-verify the session server-side (defense in depth), never relying on `proxy.ts` alone.
- No new RLS policies. No changes to `src/lib/stripe/*`, `src/app/api/stripe/*`, `src/app/api/checkout/*`, or `scripts/audit-worker.ts`.
- No free preview, pending-URL claim, real dashboard, credits, or pack work — `/dashboard` stays a functional placeholder.
- Never print tokens, full confirmation links, or secrets to logs/terminal output. The signup-verification script (Task 11) is throwaway and must never be committed to git.
- Commit after each task (scoped `git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit`, per this project's established convention — never modify git config itself).

## Prerequisites (manual, not part of any task below)

1. The user must add a real `NEXT_PUBLIC_SUPABASE_ANON_KEY` value to `.env.local` (never pasted in chat) before Task 3 can be verified locally.
2. For real end users (not this sprint's scripted test) to be able to confirm signup by clicking the email link, the Supabase Dashboard's **Auth → Email Templates → Confirm signup** template must be changed from the default `{{ .ConfirmationURL }}` to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (per current Supabase docs). Task 11's scripted verification bypasses email delivery entirely and does not require this, but flag it to the user as a required manual step before this ships to real users.

---

### Task 1: `.env.example` — document the new env var

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Produces: `NEXT_PUBLIC_SUPABASE_ANON_KEY` — read by `src/lib/supabase/env.ts` (Task 2).

- [ ] **Step 1: Add the line**

In `.env.example`, directly below the existing `NEXT_PUBLIC_SUPABASE_URL=` line, add:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 2: Verify**

Run: `grep -A1 "^NEXT_PUBLIC_SUPABASE_URL=" .env.example`
Expected: two lines, `NEXT_PUBLIC_SUPABASE_URL=` followed by `NEXT_PUBLIC_SUPABASE_ANON_KEY=`.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Document NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.example"
```

---

### Task 2: Migration `0004_auth_user_sync.sql` — `public.users` sync trigger

**Files:**
- Create: `supabase/migrations/0004_auth_user_sync.sql`

**Interfaces:**
- Consumes: existing `public.users (id uuid references auth.users(id), email text not null, created_at timestamptz)` table from `0001_initial.sql`.
- Produces: a row in `public.users` automatically whenever a row is inserted into `auth.users`.

- [ ] **Step 1: Write the migration**

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

- [ ] **Step 2: Apply it to the live Supabase project**

Use the Supabase MCP `apply_migration` tool (name: `auth_user_sync`, the SQL above) — this is the established pattern this project already uses for migrations 0001-0003.

- [ ] **Step 3: Verify with a read-only query**

Run via MCP `execute_sql` (read-only, not a write — safe): `select proname, prosecdef from pg_proc where proname = 'handle_new_user';`
Expected: one row, `prosecdef = true` (confirms `security definer` took effect).

Also run: `select tgname from pg_trigger where tgname = 'on_auth_user_created';`
Expected: one row.

- [ ] **Step 4: Run advisors**

Use MCP `get_advisors` (security). A `security definer` function is exactly the kind of change the project's Supabase skill requires checking. Confirm no new high/critical findings related to `handle_new_user`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_auth_user_sync.sql
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add idempotent trigger to sync public.users from auth.users"
```

---

### Task 3: Auth-scoped Supabase server client

**Files:**
- Create: `src/lib/supabase/env.ts`
- Create: `src/lib/supabase/server.ts`
- Modify: `package.json` (add `@supabase/ssr` dependency)

**Interfaces:**
- Produces: `getSupabaseAuthEnv(): { url: string; anonKey: string }` (throws a clear error if either env var is missing, mirroring `src/lib/stripe/client.ts`'s existing pattern).
- Produces: `createClient(): Promise<SupabaseClient>` (async — reads Next.js cookies) — this is the ONLY client used for auth operations in every later task.

- [ ] **Step 1: Install `@supabase/ssr`**

Run: `docker-compose run --rm web npm install @supabase/ssr`
Expected: `package.json` and `package-lock.json` updated, install succeeds with no errors.

- [ ] **Step 2: Write the shared env helper**

```ts
// src/lib/supabase/env.ts
export function getSupabaseAuthEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  return { url, anonKey };
}
```

- [ ] **Step 3: Write the server client factory**

```ts
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAuthEnv } from "@/lib/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseAuthEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — safe to ignore, proxy.ts refreshes sessions instead.
        }
      },
    },
  });
}
```

- [ ] **Step 4: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint"`
Expected: no errors (this file isn't imported anywhere yet, so this only checks it compiles standalone).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/supabase/env.ts src/lib/supabase/server.ts
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add auth-scoped Supabase server client, separate from the service-role client"
```

---

### Task 4: `proxy.ts` — protect `/dashboard`

**Files:**
- Create: `src/lib/supabase/proxy.ts`
- Create: `proxy.ts` (project root)

**Interfaces:**
- Consumes: `getSupabaseAuthEnv()` from `src/lib/supabase/env.ts` (Task 3).
- Produces: `updateSession(request: NextRequest): Promise<NextResponse>` — redirects to `/login` when `/dashboard/*` is visited without a valid session; otherwise refreshes the session cookie and passes the request through.

- [ ] **Step 1: Write the session-refresh/redirect logic**

```ts
// src/lib/supabase/proxy.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthEnv } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseAuthEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not run code between createServerClient and getClaims() — a stray call here
  // can make it very hard to debug users being randomly logged out.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
```

- [ ] **Step 2: Write the root proxy file**

```ts
// proxy.ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

- [ ] **Step 3: Verify matcher scope**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: build succeeds and lists `/dashboard` routes are still dynamic (no static prerendering conflict — there's no `/dashboard` page yet, this just confirms the proxy compiles; the actual redirect behavior is verified once Task 8 adds the page).

- [ ] **Step 4: Commit**

```bash
git add proxy.ts src/lib/supabase/proxy.ts
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add proxy.ts to protect /dashboard, matcher scoped to that path only"
```

---

### Task 5: Login page + Server Action

**Files:**
- Create: `src/app/login/actions.ts`
- Create: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/server.ts` (Task 3).
- Produces: `login(formData: FormData): Promise<never>` (Server Action — always redirects, either to `/login?error=...` or `/dashboard`).

- [ ] **Step 1: Write the Server Action**

```ts
// src/app/login/actions.ts
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

- [ ] **Step 2: Write the page**

```tsx
// src/app/login/page.tsx
import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold">Log in</h1>
      {error && <p role="alert" className="mt-4 text-sm font-bold text-red-600">{error}</p>}
      <form action={login} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input type="email" name="email" required className="rounded border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input type="password" name="password" required className="rounded border px-3 py-2" />
        </label>
        <button type="submit" className="mt-2 rounded bg-primary px-4 py-2 text-sm font-bold text-foreground">Log in</button>
      </form>
      <p className="mt-6 text-sm">No account? <a href="/signup" className="underline">Sign up</a></p>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green, `/login` appears in the build's route list as a dynamic or static route.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add /login page and signInWithPassword Server Action"
```

---

### Task 6: Signup page + Server Action

**Files:**
- Create: `src/app/signup/actions.ts`
- Create: `src/app/signup/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/server.ts`.
- Produces: `signup(formData: FormData): Promise<never>` (redirects to `/signup?error=...` or `/signup?checkEmail=1`).

- [ ] **Step 1: Write the Server Action**

```ts
// src/app/signup/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lensiq.site";

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${appUrl}/auth/confirm` },
  });

  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);

  redirect("/signup?checkEmail=1");
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/signup/page.tsx
import { signup } from "./actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; checkEmail?: string }> }) {
  const { error, checkEmail } = await searchParams;

  if (checkEmail) {
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="mt-4 text-sm">We sent a confirmation link — click it to activate your account.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <h1 className="text-2xl font-bold">Sign up</h1>
      {error && <p role="alert" className="mt-4 text-sm font-bold text-red-600">{error}</p>}
      <form action={signup} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input type="email" name="email" required className="rounded border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input type="password" name="password" required minLength={6} className="rounded border px-3 py-2" />
        </label>
        <button type="submit" className="mt-2 rounded bg-primary px-4 py-2 text-sm font-bold text-foreground">Sign up</button>
      </form>
      <p className="mt-6 text-sm">Already have an account? <a href="/login" className="underline">Log in</a></p>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/app/signup/
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add /signup page and signUp Server Action"
```

---

### Task 7: Email confirmation Route Handler

**Files:**
- Create: `src/app/auth/confirm/route.ts`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/server.ts`.
- Produces: `GET(request: NextRequest): Promise<NextResponse>` — on a valid `token_hash`+`type`, calls `verifyOtp` (establishing the session cookie) and redirects to `/dashboard`; otherwise redirects to `/login` with an error.

- [ ] **Step 1: Write the Route Handler**

```ts
// src/app/auth/confirm/route.ts
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

**Important note carried from the spec:** this uses `verifyOtp({ type, token_hash })` — confirmed against current Supabase docs (`docs/guides/auth/passwords`) as the correct method for the email/password confirmation link, which carries `type=email` in its URL. This is a different mechanism from `exchangeCodeForSession` (the OAuth/PKCE `code`-param flow), which this project does not use.

- [ ] **Step 2: Verify it compiles**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green. (Functional verification — actually driving this route with a real `token_hash` — happens in Task 11, once `/dashboard` exists as a redirect target.)

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/confirm/route.ts
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add /auth/confirm route handler using verifyOtp"
```

---

### Task 8: Dashboard placeholder + logout

**Files:**
- Create: `src/app/dashboard/actions.ts`
- Create: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/server.ts`.
- Produces: `logout(): Promise<never>` (Server Action, redirects to `/login`).

- [ ] **Step 1: Write the logout Server Action**

```ts
// src/app/dashboard/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Write the placeholder page with defense-in-depth session check**

```tsx
// src/app/dashboard/page.tsx
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

This page never trusts `proxy.ts` alone — it independently calls `getClaims()` and redirects if there's no session, exactly per the spec's defense-in-depth requirement.

- [ ] **Step 3: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green, `/dashboard` listed as dynamic in the build output (it reads cookies/session, so it can't be statically prerendered).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add /dashboard placeholder with independent server-side session check"
```

---

### Task 9: `createAudit()` — optional `userId`

**Files:**
- Modify: `src/lib/db/audits.ts`

**Interfaces:**
- Modifies: `createAudit(url: string, normalizedUrl: string, pageGoal: string)` → `createAudit(url: string, normalizedUrl: string, pageGoal: string, userId?: string | null)`. When `userId` is provided, it's written to `audits.user_id`; when omitted/`null`, behavior is unchanged (guest audits keep `user_id = null`, exactly as today).

- [ ] **Step 1: Modify the function**

Current (for reference, do not re-type unrelated functions in this file):
```ts
export async function createAudit(url: string, normalizedUrl: string, pageGoal: string) {
  const { data, error } = await getSupabaseAdmin().from("audits").insert({ url, normalized_url: normalizedUrl, page_goal: pageGoal, status: "pending" }).select("*").single();
  if (error) throw error;
  return mapAudit(data);
}
```

New:
```ts
export async function createAudit(url: string, normalizedUrl: string, pageGoal: string, userId: string | null = null) {
  const { data, error } = await getSupabaseAdmin().from("audits").insert({ url, normalized_url: normalizedUrl, page_goal: pageGoal, status: "pending", user_id: userId }).select("*").single();
  if (error) throw error;
  return mapAudit(data);
}
```

- [ ] **Step 2: Verify**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green — this is a backward-compatible signature change (new param has a default), so the existing call site in `src/app/api/audits/route.ts` still compiles before Task 10 updates it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/audits.ts
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Add optional userId parameter to createAudit, defaulting to guest (null)"
```

---

### Task 10: Thread the session into `/api/audits`

**Files:**
- Modify: `src/app/api/audits/route.ts`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/server.ts`, `createAudit(url, normalizedUrl, pageGoal, userId)` from Task 9.

- [ ] **Step 1: Read the session and pass the user id through**

Current relevant section (for reference):
```ts
  try {
    const audit = await createAudit(body.url, normalizedUrl, body.pageGoal);
    let checkoutUrl: string | null = null;
```

New:
```ts
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = (claims?.claims.sub as string | undefined) ?? null;

  try {
    const audit = await createAudit(body.url, normalizedUrl, body.pageGoal, userId);
    let checkoutUrl: string | null = null;
```

Add the import at the top of the file alongside the existing imports:
```ts
import { createClient } from "@/lib/supabase/server";
```

- [ ] **Step 2: Verify no regression on the guest path**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/audits/route.ts
git -c user.name="Fosforonero" -c user.email="mat.pizzi@gmail.com" commit -m "Attach the current session's user id to newly created audits"
```

---

### Task 11: Full functional verification (real signup, no email inbox required)

**Files:**
- None created, none committed — the verification script in Step 2 is piped directly into `node`'s stdin inside the already-running `web` container and is never written to disk anywhere (not the host, not the container), so there is nothing to clean up or accidentally commit.

- [ ] **Step 1: Bring the local stack up**

Run: `docker-compose up -d web worker` (reuse the port-remapping `docker-compose.override.yml` pattern from the earlier Stripe test if port 3000 is still occupied by an unrelated container on this machine — check with `docker ps` first).

- [ ] **Step 2: Real signup + confirmation, without a real email inbox**

Run this exact command. It pipes the script directly into `node`'s stdin inside the already-running `web` container — no file is ever written, on the host or in the container, so there is nothing to accidentally commit:

```bash
docker-compose exec -T web node --input-type=module - <<'NODE_EOF'
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = `sprint-a-verify+${Date.now()}@example.com`;
const password = "verify-sprint-a-temp-pw";

const { data, error } = await admin.auth.admin.generateLink({ type: "signup", email, password });
if (error) { console.log("generateLink failed:", error.message); process.exit(1); }

// Confirm the shape before using it — never print the actual token.
console.log("response has properties.hashed_token:", typeof data.properties?.hashed_token === "string");

const tokenHash = data.properties.hashed_token;
const res = await fetch(`http://localhost:3000/auth/confirm?token_hash=${tokenHash}&type=email`, { redirect: "manual" });
console.log("confirm route status:", res.status, "location header present:", res.headers.has("location"));
console.log("redirected to /dashboard:", (res.headers.get("location") ?? "").includes("/dashboard"));

const { data: userRow, error: userErr } = await admin.from("users").select("id, email").eq("id", data.user.id).maybeSingle();
console.log("public.users row created:", Boolean(userRow), "email matches:", userRow?.email === email);
if (userErr) console.log("users lookup error:", userErr.message);

await admin.auth.admin.deleteUser(data.user.id);
console.log("test user cleaned up");
NODE_EOF
```

Expected output (all four lines `true`/matching, no token values printed):
```
response has properties.hashed_token: true
confirm route status: 307 location header present: true
redirected to /dashboard: true
public.users row created: true email matches: true
test user cleaned up
```

If `hashed_token` isn't present on `data.properties`, inspect `Object.keys(data.properties)` (still without printing values) to find the correct field name and adjust — do not guess a second field name without checking.

- [ ] **Step 3: Manual login/logout/protection check**

Using a browser pointed at the local stack:
1. Visit `/dashboard` while logged out → confirm redirect to `/login`.
2. Sign up with a real, checkable email address (yours) at `/signup` → confirm the "check your email" screen appears, and the real email arrives (this exercises the actual Supabase-sent email, not the generateLink bypass — do this once as a sanity check that the live template/redirect config works end-to-end for a genuine user).
3. Click the emailed link → confirm landing on `/dashboard` showing the correct email.
4. Click "Log out" → confirm redirect to `/login`, then confirm `/dashboard` redirects again when visited directly.
5. Log back in via `/login` with the same credentials → confirm `/dashboard` again.

- [ ] **Step 4: Audit `user_id` check**

While logged in (from Step 3), create an audit via a direct API call carrying the session cookie (e.g. from the browser's dev console: `fetch('/api/audits', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({url:'https://example.com', pageGoal:'inform'})})`), note the returned `id`, then verify via a read-only Supabase query:

`select user_id from audits where id = '<returned id>';`

Expected: `user_id` matches the logged-in user's id (visible in the Supabase Dashboard's Auth → Users list, or via `select id, email from auth.users where email = '<the email used>';`).

Then repeat without a session (logged out, or via `curl` with no cookie) and confirm the resulting row has `user_id = null` — no regression on the guest path.

- [ ] **Step 5: Stripe regression sanity check**

Confirm `/api/checkout`, `/api/stripe/webhook`, and the worker still start and respond as before — this sprint touched no Stripe/worker files, so this is a quick smoke check, not a full re-test of the Stripe suite already verified in earlier PRs. `docker-compose logs worker --tail 20` should show no new errors since Task 9/10 landed.

- [ ] **Step 6: Final full verification**

Run: `docker-compose run --rm web sh -c "npm run typecheck && npm run lint && npm run build"`
Expected: green, all routes including `/login`, `/signup`, `/auth/confirm`, `/dashboard` present in the build output.

- [ ] **Step 7: Bring the stack down**

Run: `docker-compose down`

(No commit for this task — nothing was created outside the ephemeral container.)

---

### Task 12: Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/auth-foundations
```

- [ ] **Step 2: Open the PR against `main`**, summarizing the sprint per the spec's acceptance criteria, explicitly noting: no RLS policy changes, no Stripe/worker changes, `/dashboard` is a placeholder only, and the real-signup verification method used (generateLink-driven, no email inbox dependency for the automated pass, plus one manual real-email sanity check).
